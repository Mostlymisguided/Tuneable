import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  CheckCircle2,
  FileText,
  Loader2,
  Music,
  AlertCircle,
  Play,
} from 'lucide-react';
import { mediaAPI } from '../lib/api';

export type EnrichScope = 'mine' | 'all';

export interface EnrichPreviewItem {
  mediaId: string;
  uuid?: string;
  title: string;
  artist: string;
  currentBpm: number | null;
  currentKey: string | null;
  newBpm: number | null;
  newKey: string | null;
  matchType: string;
  rekordboxTrackId?: string | null;
  selected: boolean;
}

interface EnrichPreview {
  source: 'rekordbox' | 'itunes';
  scope: EnrichScope;
  trackCount: number;
  scannedMedia: number;
  totalEligibleMedia: number;
  matchedCount: number;
  unmatchedCount: number;
  hasKeyData: boolean;
  message?: string;
  items: EnrichPreviewItem[];
  unmatched?: Array<{
    mediaId: string;
    uuid?: string;
    title: string;
    artist: string;
    missing: { bpm: boolean; key: boolean };
    reason?: string;
  }>;
}

interface LibraryXmlEnrichProps {
  scope?: EnrichScope;
  allowScopeToggle?: boolean;
  title?: string;
  description?: string;
}

const LibraryXmlEnrich: React.FC<LibraryXmlEnrichProps> = ({
  scope: initialScope = 'mine',
  allowScopeToggle = false,
  title = 'Library XML Enrichment',
  description = 'Upload a Rekordbox or iTunes Library.xml export to backfill missing BPM and key on existing tunes. Only empty fields are updated — existing values are never overwritten.',
}) => {
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [scope, setScope] = useState<EnrichScope>(initialScope);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [preview, setPreview] = useState<EnrichPreview | null>(null);
  const [items, setItems] = useState<EnrichPreviewItem[]>([]);
  const [executeResult, setExecuteResult] = useState<{
    updated: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const selectedItems = useMemo(
    () => items.filter((item) => item.selected),
    [items],
  );

  const handleXmlSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xml')) {
      toast.error('Please select a Rekordbox or iTunes Library.xml file');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error('Library XML must be less than 100MB');
      return;
    }
    setXmlFile(file);
    setPreview(null);
    setItems([]);
    setExecuteResult(null);
  };

  const runPreview = async () => {
    if (!xmlFile) {
      toast.error('Select a library XML file first');
      return;
    }

    setIsPreviewing(true);
    setExecuteResult(null);
    try {
      const data = await mediaAPI.previewLibraryXmlEnrichment(xmlFile, scope);
      setPreview(data);
      setItems(data.items || []);
      toast.success(`Found ${data.matchedCount} match(es) for tunes missing BPM/key`);
    } catch (error: any) {
      console.error('Enrich preview error:', error);
      toast.error(error?.response?.data?.error || 'Preview failed');
      setPreview(null);
      setItems([]);
    } finally {
      setIsPreviewing(false);
    }
  };

  const runExecute = async () => {
    if (selectedItems.length === 0) {
      toast.error('Select at least one tune to update');
      return;
    }

    setIsExecuting(true);
    try {
      const updates = selectedItems.map((item) => ({
        mediaId: item.mediaId,
        title: item.title,
        bpm: item.newBpm,
        key: item.newKey,
        rekordboxTrackId: item.rekordboxTrackId,
      }));

      const result = await mediaAPI.executeLibraryXmlEnrichment(updates);
      setExecuteResult({
        updated: result.updated,
        skipped: result.skipped,
        failed: result.failed,
      });
      toast.success(`Updated ${result.updated} tune(s)`);

      setItems((prev) => prev.filter((item) => {
        const outcome = result.items?.find((r: { mediaId: string; status: string }) => r.mediaId === item.mediaId);
        return outcome?.status !== 'updated';
      }));
    } catch (error: any) {
      console.error('Enrich execute error:', error);
      toast.error(error?.response?.data?.error || 'Apply failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const toggleAll = (selected: boolean) => {
    setItems((prev) => prev.map((item) => ({ ...item, selected })));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Music className="h-6 w-6 text-purple-400" />
          {title}
        </h2>
        <p className="text-gray-400 mt-2 max-w-3xl">{description}</p>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-4">
        {allowScopeToggle && (
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Enrichment scope</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setScope('mine')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  scope === 'mine'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                My uploads &amp; imports
              </button>
              <button
                type="button"
                onClick={() => setScope('all')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  scope === 'all'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                Full catalog (admin)
              </button>
            </div>
          </div>
        )}

        <div
          onClick={() => xmlInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
            xmlFile
              ? 'border-blue-500/50 bg-blue-900/10'
              : 'border-gray-600 hover:border-purple-500/40 hover:bg-purple-900/10'
          }`}
        >
          {xmlFile ? (
            <div>
              <FileText className="h-10 w-10 text-blue-400 mx-auto mb-2" />
              <p className="text-white font-medium">{xmlFile.name}</p>
              <p className="text-gray-400 text-sm mt-1">
                {(xmlFile.size / (1024 * 1024)).toFixed(1)} MB
              </p>
            </div>
          ) : (
            <div>
              <FileText className="h-10 w-10 text-gray-400 mx-auto mb-2" />
              <p className="text-white font-medium">Click to select Rekordbox or iTunes Library.xml</p>
              <p className="text-gray-400 text-sm">Max 100MB</p>
            </div>
          )}
        </div>

        <input
          ref={xmlInputRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          onChange={handleXmlSelect}
          className="hidden"
        />

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={!xmlFile || isPreviewing}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg font-medium flex items-center gap-2"
          >
            {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Preview matches
          </button>
          {xmlFile && (
            <button
              type="button"
              onClick={() => {
                setXmlFile(null);
                setPreview(null);
                setItems([]);
                setExecuteResult(null);
                if (xmlInputRef.current) xmlInputRef.current.value = '';
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {preview && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-2xl font-bold">{preview.trackCount}</div>
              <div className="text-xs text-gray-400">XML tracks</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-2xl font-bold">{preview.totalEligibleMedia}</div>
              <div className="text-xs text-gray-400">Tunes missing BPM/key</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-2xl font-bold text-green-300">{preview.matchedCount}</div>
              <div className="text-xs text-gray-400">Matched</div>
            </div>
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <div className="text-2xl font-bold text-amber-300">{preview.unmatchedCount}</div>
              <div className="text-xs text-gray-400">Unmatched</div>
            </div>
          </div>

          {preview.message && (
            <p className="text-amber-200 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              {preview.message}
            </p>
          )}

          {preview.scannedMedia < preview.totalEligibleMedia && (
            <p className="text-amber-200 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              Scanned {preview.scannedMedia} of {preview.totalEligibleMedia} eligible tunes — re-run after applying to continue.
            </p>
          )}

          {items.length > 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700 flex flex-wrap items-center justify-between gap-3">
                <div className="text-white font-medium">
                  {selectedItems.length} of {items.length} selected
                </div>
                <div className="flex gap-3 text-sm">
                  <button type="button" onClick={() => toggleAll(true)} className="text-purple-400 hover:underline">
                    Select all
                  </button>
                  <button type="button" onClick={() => toggleAll(false)} className="text-gray-400 hover:underline">
                    Clear
                  </button>
                </div>
              </div>

              <div className="max-h-[50vh] overflow-y-auto divide-y divide-gray-700">
                {items.map((item) => (
                  <label
                    key={item.mediaId}
                    className="flex items-start gap-3 p-4 hover:bg-gray-750 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={(e) => {
                        setItems((prev) => prev.map((row) => (
                          row.mediaId === item.mediaId ? { ...row, selected: e.target.checked } : row
                        )));
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">{item.title}</div>
                      <div className="text-sm text-gray-400 truncate">{item.artist}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Match: {item.matchType}
                        {item.uuid && (
                          <>
                            {' · '}
                            <Link to={`/tune/${item.mediaId}`} className="text-purple-400 hover:underline">
                              View tune
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-right flex-shrink-0">
                      <div className="text-gray-400">
                        BPM: {item.currentBpm ?? '—'} → {item.newBpm ?? '—'}
                      </div>
                      <div className="text-gray-400">
                        Key: {item.currentKey || '—'} → {item.newKey || '—'}
                      </div>
                    </div>
                  </label>
                ))}
              </div>

              <div className="p-4 border-t border-gray-700 flex justify-end">
                <button
                  type="button"
                  onClick={() => void runExecute()}
                  disabled={isExecuting || selectedItems.length === 0}
                  className="px-6 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg font-medium flex items-center gap-2"
                >
                  {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Apply to {selectedItems.length} tune(s)
                </button>
              </div>
            </div>
          )}

          {preview.unmatched && preview.unmatched.length > 0 && (
            <div className="bg-gray-800 rounded-lg border border-gray-700 overflow-hidden">
              <div className="p-4 border-b border-gray-700">
                <div className="text-white font-medium">
                  Unmatched ({preview.unmatchedCount}
                  {preview.unmatchedCount > preview.unmatched.length
                    ? `, showing first ${preview.unmatched.length}`
                    : ''}
                  )
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Catalog tunes missing BPM/key that did not get a fillable XML match (title+artist / Rekordbox ID).
                </p>
              </div>
              <div className="max-h-[40vh] overflow-y-auto divide-y divide-gray-700">
                {preview.unmatched.map((item) => (
                  <div key={item.mediaId} className="flex items-start gap-3 p-4">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-white truncate">{item.title}</div>
                      <div className="text-sm text-gray-400 truncate">{item.artist}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        Missing:{' '}
                        {[item.missing.bpm && 'BPM', item.missing.key && 'key'].filter(Boolean).join(', ') || '—'}
                        {item.reason === 'matched_but_no_xml_values' && ' · XML match had no BPM/key'}
                        {item.uuid && (
                          <>
                            {' · '}
                            <Link to={`/tune/${item.mediaId}`} className="text-purple-400 hover:underline">
                              View tune
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {items.length === 0 && preview.matchedCount === 0 && (
            <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 text-center text-gray-400">
              No matches found. Tunes are matched by Rekordbox ID, then title+artist.
            </div>
          )}
        </>
      )}

      {executeResult && (
        <div className="bg-green-900/20 border border-green-700 rounded-lg p-4 text-green-200">
          <CheckCircle2 className="h-5 w-5 inline mr-2" />
          Enrichment complete: {executeResult.updated} updated, {executeResult.skipped} skipped, {executeResult.failed} failed
        </div>
      )}
    </div>
  );
};

export default LibraryXmlEnrich;
