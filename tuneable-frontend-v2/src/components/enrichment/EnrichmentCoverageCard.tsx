import React from 'react';
import { Loader2 } from 'lucide-react';
import type { EnrichmentCoverage } from './types';

function CoverageBar({ label, value, total, hint }: {
  label: string;
  value: number;
  total: number;
  hint?: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div title={hint}>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-gray-300">{label}</span>
        <span className="text-gray-400">
          {value.toLocaleString()} / {total.toLocaleString()} · <span className="text-white">{pct}%</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
        <div className="h-full bg-purple-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

const EnrichmentCoverageCard: React.FC<{
  coverage: EnrichmentCoverage | null;
  loading: boolean;
}> = ({ coverage, loading }) => (
  <div className="rounded-lg border border-gray-700 bg-gray-900/60 p-4">
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-medium text-white">Catalogue coverage</h3>
      <span className="text-xs text-gray-500">
        {coverage ? `${coverage.total.toLocaleString()} music tracks` : null}
        {loading ? <Loader2 className="inline h-3.5 w-3.5 animate-spin ml-2" /> : null}
      </span>
    </div>
    {coverage ? (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        <CoverageBar
          label="Linked to MusicBrainz"
          value={coverage.linked}
          total={coverage.total}
          hint="Tracks matched to a MusicBrainz recording"
        />
        <CoverageBar label="Has tags" value={coverage.tagged} total={coverage.total} />
        <CoverageBar label="Has release date" value={coverage.withRelease} total={coverage.total} />
        <CoverageBar
          label="Has location"
          value={coverage.withLocation}
          total={coverage.total}
          hint={coverage.mapboxEnabled === false ? 'Mapbox is not configured; locations are not geocoded' : undefined}
        />
      </div>
    ) : !loading ? (
      <p className="text-xs text-gray-500">Coverage unavailable.</p>
    ) : null}
  </div>
);

export default EnrichmentCoverageCard;
