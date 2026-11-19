import { useEffect } from 'react';
import { DEFAULT_COVER_ART } from '@/src/types/media';

const MAX_COVERS = 4;

let covers: string[] = [];
let batch: string[] = [];
let flushScheduled = false;

function isPlaceholder(url: string): boolean {
  return (
    url === DEFAULT_COVER_ART ||
    url.endsWith('/default-cover.png') ||
    url.endsWith('/default-book-cover.png')
  );
}

function isRememberable(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return false;
  if (isPlaceholder(trimmed)) return false;
  return trimmed.startsWith('http://') || trimmed.startsWith('https://');
}

function save(next: string[]) {
  covers = next.slice(0, MAX_COVERS);
}

function flush() {
  flushScheduled = false;
  const noted = batch;
  batch = [];
  if (noted.length === 0) return;

  if (noted.length === 1) {
    const url = noted[0];
    save([url, ...covers.filter((item) => item !== url)]);
    return;
  }

  const next: string[] = [];
  for (const url of noted) {
    if (!next.includes(url)) next.push(url);
    if (next.length === MAX_COVERS) break;
  }
  for (const url of covers) {
    if (next.length >= MAX_COVERS) break;
    if (!next.includes(url)) next.push(url);
  }
  save(next);
}

/** Record a cover that is on screen. A list keeps its first four; one cover moves to the front. */
export function noteDisplayedCover(url: string | null | undefined) {
  if (!isRememberable(url)) return;
  batch.push(url.trim());
  if (!flushScheduled) {
    flushScheduled = true;
    queueMicrotask(flush);
  }
}

/** The cover someone just opened leads the cube on the next screen. */
export function promoteCoverArt(url: string | null | undefined) {
  if (!isRememberable(url)) return;
  const trimmed = url.trim();
  save([trimmed, ...covers.filter((item) => item !== trimmed)]);
}

export function readLoaderCovers(): string[] {
  return covers.slice(0, MAX_COVERS);
}

export function useNotedCover(url: string | null | undefined) {
  useEffect(() => {
    noteDisplayedCover(url);
  }, [url]);
}

/** Drop into a list row. Returns nothing, so it adds no native view. */
export function RememberCover({ uri }: { uri?: string | null }) {
  useNotedCover(uri);
  return null;
}
