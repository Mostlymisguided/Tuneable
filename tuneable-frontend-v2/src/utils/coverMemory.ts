import { useEffect } from 'react';
import {
  DEFAULT_BOOK_COVER_ART,
  DEFAULT_BOOK_COVER_ART_REMOTE,
  DEFAULT_COVER_ART,
} from '../constants';

const STORAGE_KEY = 'tuneable.loaderCovers';
const MAX_COVERS = 6;

let covers: string[] | null = null;
let batch: string[] = [];
let flushScheduled = false;

function isPlaceholder(url: string): boolean {
  return url === DEFAULT_COVER_ART
    || url === DEFAULT_BOOK_COVER_ART
    || url === DEFAULT_BOOK_COVER_ART_REMOTE
    || url.endsWith('/default-cover.png')
    || url.endsWith('/default-book-cover.png');
}

function isRememberable(url: string | null | undefined): url is string {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) return false;
  if (isPlaceholder(trimmed)) return false;
  return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/');
}

function load(): string[] {
  if (covers) return covers;
  covers = [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return covers;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      covers = parsed.filter((item) => typeof item === 'string' && isRememberable(item)).slice(0, MAX_COVERS);
    }
  } catch {
    covers = [];
  }
  return covers;
}

function save(next: string[]) {
  covers = next.slice(0, MAX_COVERS);
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(covers));
  } catch {
    // Memory still works if storage is unavailable.
  }
}

function flush() {
  flushScheduled = false;
  const noted = batch;
  batch = [];
  if (noted.length === 0) return;

  const current = load();
  if (noted.length === 1) {
    const url = noted[0];
    save([url, ...current.filter((item) => item !== url)]);
    return;
  }

  const next: string[] = [];
  for (const url of noted) {
    if (!next.includes(url)) next.push(url);
    if (next.length === MAX_COVERS) break;
  }
  for (const url of current) {
    if (next.length >= MAX_COVERS) break;
    if (!next.includes(url)) next.push(url);
  }
  save(next);
}

/** Record a cover that is on screen. A list keeps its first six; one cover moves to the front. */
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
  save([trimmed, ...load().filter((item) => item !== trimmed)]);
}

export function readLoaderCovers(): string[] {
  return load().slice(0, MAX_COVERS);
}

export function useNotedCover(url: string | null | undefined) {
  useEffect(() => {
    noteDisplayedCover(url);
  }, [url]);
}
