import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, MapPin, Sparkles, Tags } from 'lucide-react';
import { toast } from '../../utils/toast';
import { mediaAPI } from '../../lib/api';
import type { EnrichmentGroup } from './types';

type LocationMode = 'missing' | 'artist_home' | 'musicbrainz';

const BATCH_SIZES = [25, 50];

function errorMessage(error: any, fallback: string) {
  return error?.response?.data?.error || fallback;
}

/** Plain-language summary of one drip run (tags + locations). */
function summarizeDrip(result: any): string {
  const parts: string[] = [];
  const processed = result?.tags?.processed;
  if (processed && !processed.skipped) {
    parts.push(`${processed.autoApplied ?? 0} matched automatically`);
    parts.push(`${processed.needsReview ?? 0} need review`);
    if (processed.failed) parts.push(`${processed.failed} failed`);
  } else if (processed?.skipped) {
    parts.push(`${result?.tags?.enqueued ?? 0} queued (matcher already busy, will finish in background)`);
  } else if (result?.tags) {
    parts.push('no tracks needed matching');
  }
  const loc = result?.locations;
  if (loc && !loc.skipped) {
    parts.push(`${loc.updated ?? 0} locations added`);
  }
  return parts.length ? parts.join(', ') : 'Nothing to do';
}

const EnrichNowPanel: React.FC<{
  onDone: (switchTo?: EnrichmentGroup) => void;
}> = ({ onDone }) => {
  const [batchSize, setBatchSize] = useState(25);
  const [running, setRunning] = useState(false);
  const [lastSummary, setLastSummary] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedBusy, setAdvancedBusy] = useState(false);
  const [locationLimit, setLocationLimit] = useState(50);
  const [locationMode, setLocationMode] = useState<LocationMode>('missing');
  const [nameSearch, setNameSearch] = useState(false);

  const busy = running || advancedBusy;

  const handleEnrichNow = async () => {
    setRunning(true);
    try {
      const result = await mediaAPI.runEnrichmentDrip({
        tagLimit: batchSize,
        locationLimit: batchSize,
        includeCoverage: false,
      });
      if (result?.skipped) {
        toast.info('Enrichment is already running');
        return;
      }
      const summary = summarizeDrip(result);
      setLastSummary(summary);
      toast.success(summary);
      onDone(result?.tags?.processed?.needsReview ? 'review' : undefined);
    } catch (error: any) {
      toast.error(errorMessage(error, 'Enrichment failed'));
    } finally {
      setRunning(false);
    }
  };

  const handleTagBackfill = async (linkage: 'linked' | 'unlinked') => {
    setAdvancedBusy(true);
    try {
      const result = await mediaAPI.enqueueEnrichmentBackfill({
        limit: linkage === 'unlinked' ? 40 : 100,
        linkage,
        processImmediately: true,
        mode: 'supplement',
      });
      toast.success(
        `Queued ${result.enqueued} (scanned ${result.scanned}`
          + `${result.skippedOpen ? `, ${result.skippedOpen} already open` : ''})`
      );
      onDone('in_progress');
    } catch (error: any) {
      toast.error(errorMessage(error, 'Backfill failed'));
    } finally {
      setAdvancedBusy(false);
    }
  };

  const handleLocationBackfill = async (execute: boolean) => {
    setAdvancedBusy(true);
    try {
      const result = await mediaAPI.runLocationBackfill({
        dryRun: !execute,
        execute,
        limit: Math.min(Math.max(locationLimit || 50, 1), 200),
        mode: locationMode,
        nameSearch,
        includeStats: false,
        quiet: true,
      });
      const bySource = result?.bySource && Object.keys(result.bySource).length > 0
        ? ` · ${Object.entries(result.bySource).map(([k, v]) => `${k}: ${v}`).join(', ')}`
        : '';
      toast.success(
        `${execute ? 'Locations' : 'Dry run'}: ${result?.updated ?? 0} found`
          + ` / ${result?.unmatched ?? 0} not found / ${result?.scanned ?? 0} checked${bySource}`
      );
      if (execute) onDone();
    } catch (error: any) {
      toast.error(errorMessage(error, 'Location backfill failed'));
    } finally {
      setAdvancedBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void handleEnrichNow()}
          disabled={busy}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg text-sm font-medium flex items-center gap-2"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Enrich now
        </button>
        <div className="flex items-center gap-1 text-xs text-gray-400">
          Batch
          {BATCH_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              onClick={() => setBatchSize(size)}
              className={`px-2.5 py-1 rounded-full border ${
                batchSize === size
                  ? 'bg-purple-800/60 border-purple-500 text-white'
                  : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
        {lastSummary ? <span className="text-xs text-gray-400">Last run: {lastSummary}</span> : null}
      </div>
      <p className="text-xs text-gray-500">
        Matches untagged tracks on MusicBrainz (by link, ISRC, then title and artist) to fill tags and
        release dates, then looks up missing locations. Confident matches apply automatically; the rest
        land in Needs review.
      </p>

      <button
        type="button"
        onClick={() => setShowAdvanced((v) => !v)}
        className="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
      >
        {showAdvanced ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Advanced
      </button>

      {showAdvanced ? (
        <div className="space-y-3 border-t border-gray-800 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 w-20">Tags</span>
            <button
              type="button"
              onClick={() => void handleTagBackfill('linked')}
              disabled={busy}
              className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded text-xs flex items-center gap-1.5"
              title="Queue up to 100 already-linked tracks to suggest extra tags (needs review)"
            >
              <Tags className="h-3.5 w-3.5" />
              Re-check linked tracks for extra tags
            </button>
            <button
              type="button"
              onClick={() => void handleTagBackfill('unlinked')}
              disabled={busy}
              className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded text-xs flex items-center gap-1.5"
              title="Search MusicBrainz for up to 40 tracks with no MusicBrainz link"
            >
              <Tags className="h-3.5 w-3.5" />
              Match unlinked only
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs text-gray-400 w-20">Locations</span>
            <label className="text-xs text-gray-400 flex items-center gap-1.5">
              Limit
              <input
                type="number"
                min={1}
                max={200}
                value={locationLimit}
                onChange={(e) => setLocationLimit(Math.min(Math.max(parseInt(e.target.value, 10) || 50, 1), 200))}
                className="w-16 rounded bg-gray-900 border border-gray-700 px-2 py-1 text-white"
              />
            </label>
            {([
              { value: 'missing', label: 'All sources' },
              { value: 'artist_home', label: 'Artist home only' },
              { value: 'musicbrainz', label: 'MusicBrainz only' },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLocationMode(opt.value)}
                className={`px-2.5 py-1 rounded-full border text-xs ${
                  locationMode === opt.value
                    ? 'bg-sky-800/70 border-sky-500 text-white'
                    : 'bg-gray-900 border-gray-700 text-gray-300 hover:border-gray-500'
                }`}
              >
                {opt.label}
              </button>
            ))}
            <label
              className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer"
              title="Also search MusicBrainz artists by name. Noisier; use sparingly."
            >
              <input
                type="checkbox"
                checked={nameSearch}
                onChange={(e) => setNameSearch(e.target.checked)}
                className="rounded border-gray-600"
              />
              Name search
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleLocationBackfill(false)}
              className="px-2.5 py-1.5 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded text-xs"
            >
              Dry run
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleLocationBackfill(true)}
              className="px-2.5 py-1.5 bg-sky-800 hover:bg-sky-700 disabled:opacity-50 rounded text-xs flex items-center gap-1.5"
            >
              {advancedBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
              Run
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default EnrichNowPanel;
