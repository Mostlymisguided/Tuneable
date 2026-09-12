import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Loader2,
  Music,
  Play,
  Upload,
} from 'lucide-react';
import { toast } from '../utils/toast';
import { userAPI } from '../lib/api';

type IngestAction = 'attach' | 'create' | 'skip';

interface IngestPlaylist {
  name: string;
  fullPath: string;
  trackCount: number;
  missingFiles: number;
  localFiles: number;
}

export interface IngestPreviewItem {
  key: string;
  trackId?: string | null;
  title: string;
  artist: string;
  album?: string | null;
  bpm?: number | null;
  keySignature?: string | null;
  duration?: number | null;
  bitrate?: number | null;
  filePath?: string | null;
  fileExists: boolean;
  playlistName?: string | null;
  action: IngestAction;
  skipReason?: string | null;
  matchType?: string | null;
  mediaId?: string | null;
  mediaUuid?: string | null;
  catalogTitle?: string | null;
  catalogArtist?: string | null;
  selected: boolean;
}

interface IngestPreview {
  playlists: Array<{ name: string; fullPath: string; trackCount: number }>;
  catalogSize: number;
  items: IngestPreviewItem[];
  summary: {
    total: number;
    attach: number;
    create: number;
    skip: number;
    selected: number;
    missingFiles: number;
    nonMp3: number;
    lowBitrate: number;
    alreadyHasUpload: number;
  };
  message?: string;
}

interface IngestResult {
  attached: number;
  created: number;
  skipped: number;
  failed: number;
  partyAdds: number;
}

const SKIP_LABELS: Record<string, string> = {
  missing_file: 'File not on this machine',
  not_mp3: 'Not an MP3',
  low_bitrate: 'Below bitrate gate',
  already_has_upload: 'Catalog already has audio',
  no_match: 'No catalog match',
  read_error: 'Could not read file',
  missing_or_unsafe_file: 'File missing or not a local MP3',
};

function actionLabel(action: IngestAction) {
  if (action === 'attach') return 'Attach MP3';
  if (action === 'create') return 'Create tune';
  return 'Skip';
}

function actionClass(action: IngestAction) {
  if (action === 'attach') return 'text-green-300';
  if (action === 'create') return 'text-blue-300';
  return 'text-gray-400';
}

const INGEST_TIMEOUT_MS = 60 * 60 * 1000;

const RekordboxPlaylistIngest: React.FC = () => {
  const xmlInputRef = useRef<HTMLInputElement>(null);
  const [xmlFile, setXmlFile] = useState<File | null>(null);
  const [isParsingXml, setIsParsingXml] = useState(false);
  const [playlists, setPlaylists] = useState<IngestPlaylist[]>([]);
  const [playlistFilter, setPlaylistFilter] = useState('');
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>('');
  const [createUnmatched, setCreateUnmatched] = useState(true);
  const [createParties, setCreateParties] = useState(true);
  const [minBitrate, setMinBitrate] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [progressCurrent, setProgressCurrent] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);
  const [preview, setPreview] = useState<IngestPreview | null>(null);
  const [items, setItems] = useState<IngestPreviewItem[]>([]);
  const [executeResult, setExecuteResult] = useState<IngestResult | null>(null);

  useEffect(() => {
    if (window.location.hash === '#rekordbox-ingest') {
      document.getElementById('rekordbox-ingest')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const filteredPlaylists = useMemo(() => {
    const q = playlistFilter.trim().toLowerCase();
    if (!q) return playlists;
    return playlists.filter((p) => (p.fullPath || p.name).toLowerCase().includes(q));
  }, [playlists, playlistFilter]);

  const selectedItems = useMemo(
    () => items.filter((item) => item.selected && (item.action === 'attach' || item.action === 'create')),
    [items],
  );

  const resetPreview = () => {
    setPreview(null);
    setItems([]);
    setExecuteResult(null);
    setProgressMessage('');
    setProgressCurrent(0);
    setProgressTotal(0);
  };

  const loadPlaylists = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.xml')) {
      toast.error('Please select a Rekordbox XML export');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error('Rekordbox XML must be less than 100MB');
      return;
    }
    setIsParsingXml(true);
    setXmlFile(file);
    setPlaylists([]);
    setSelectedPlaylist('');
    resetPreview();
    try {
      const data = await userAPI.listRekordboxPlaylists(file);
      setPlaylists(data.playlists || []);
      toast.success(`Loaded ${data.playlists?.length || 0} playlist(s)`);
    } catch (error: any) {
      setXmlFile(null);
      toast.error(error?.response?.data?.error || error?.message || 'Failed to parse Rekordbox XML');
    } finally {
      setIsParsingXml(false);
    }
  };

  const applyJobProgress = (job: {
    message?: string;
    current?: number;
    total?: number;
  }) => {
    if (job.message) setProgressMessage(job.message);
    if (job.current != null) setProgressCurrent(job.current);
    if (job.total != null) setProgressTotal(job.total);
  };

  const runPreview = async () => {
    if (!xmlFile) {
      toast.error('Upload a Rekordbox XML export first');
      return;
    }
    if (!selectedPlaylist) {
      toast.error('Select a playlist to ingest');
      return;
    }

    setIsPreviewing(true);
    resetPreview();
    setProgressMessage('Starting playlist scan…');
    try {
      const started = await userAPI.startRekordboxIngestPreview(xmlFile, [selectedPlaylist], {
        createUnmatched,
        minBitrate: minBitrate ? Number(minBitrate) : 0,
      });
      const data = await userAPI.waitForImportJob<IngestPreview>(
        started.jobId,
        applyJobProgress,
        { timeoutMs: INGEST_TIMEOUT_MS },
      );
      setPreview(data);
      setItems(data.items || []);
      toast.success(
        `Ready: ${data.summary.attach} attach, ${data.summary.create} create, ${data.summary.skip} skip`,
      );
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Preview failed');
    } finally {
      setIsPreviewing(false);
      setProgressMessage('');
    }
  };

  const runExecute = async () => {
    if (selectedItems.length === 0) {
      toast.error('Select at least one track to ingest');
      return;
    }
    setIsExecuting(true);
    setExecuteResult(null);
    setProgressMessage('Starting ingest…');
    try {
      const started = await userAPI.startRekordboxIngestExecute(selectedItems, {
        createParties,
        partyLocation: 'Library Import',
      });
      const result = await userAPI.waitForImportJob<IngestResult>(
        started.jobId,
        applyJobProgress,
        { timeoutMs: INGEST_TIMEOUT_MS },
      );
      setExecuteResult({
        attached: result.attached || 0,
        created: result.created || 0,
        skipped: result.skipped || 0,
        failed: result.failed || 0,
        partyAdds: result.partyAdds || 0,
      });
      toast.success(`Ingested ${result.attached || 0} attached, ${result.created || 0} created`);
      setItems((prev) => prev.map((item) => {
        const outcome = (result as IngestResult & {
          items?: Array<{ key: string; status: string }>;
        }).items?.find((row) => row.key === item.key);
        if (outcome?.status === 'attached' || outcome?.status === 'created') {
          return { ...item, selected: false, action: 'skip' as const, skipReason: 'already_has_upload' };
        }
        return item;
      }));
    } catch (error: any) {
      toast.error(error?.response?.data?.error || error?.message || 'Ingest failed');
    } finally {
      setIsExecuting(false);
      setProgressMessage('');
    }
  };

  const toggleAllRunnable = (selected: boolean) => {
    setItems((prev) => prev.map((item) => (
      item.action === 'attach' || item.action === 'create'
        ? { ...item, selected }
        : item
    )));
  };

  const busy = isParsingXml || isPreviewing || isExecuting;

  return (
    <div id="rekordbox-ingest" className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Upload className="h-6 w-6 text-purple-400" />
          Rekordbox playlist ingest
        </h2>
        <p className="text-gray-400 mt-2 max-w-3xl">
          Upload a Rekordbox XML export, pick one playlist, and ingest its local MP3s into the catalog.
          Matching YouTube-only (or otherwise upload-less) tunes get the file attached; unmatched tracks
          are created with pending rights. Files are read from Rekordbox Location paths on this server —
          the same machine-local behaviour as the CLI.
        </p>
      </div>

      <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-4">
        <div
          onClick={() => xmlInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all ${
            xmlFile
              ? 'border-blue-500/50 bg-blue-900/10'
              : 'border-gray-600 hover:border-purple-500/40 hover:bg-purple-900/10'
          }`}
        >
          {isParsingXml ? (
            <div className="flex items-center justify-center gap-3 text-blue-300">
              <Loader2 className="h-5 w-5 animate-spin" />
              Parsing Rekordbox XML…
            </div>
          ) : xmlFile ? (
            <div>
              <FileText className="h-10 w-10 text-blue-400 mx-auto mb-2" />
              <p className="text-white font-medium">{xmlFile.name}</p>
              <p className="text-gray-400 text-sm mt-1">
                {(xmlFile.size / (1024 * 1024)).toFixed(1)} MB
                {playlists.length > 0 ? ` · ${playlists.length} playlists` : ''}
              </p>
            </div>
          ) : (
            <div>
              <FileText className="h-10 w-10 text-gray-400 mx-auto mb-2" />
              <p className="text-white font-medium">Click to select a Rekordbox XML export</p>
              <p className="text-gray-400 text-sm">Max 100MB · File → Export Collection in xml format</p>
            </div>
          )}
        </div>

        <input
          ref={xmlInputRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void loadPlaylists(file);
          }}
          className="hidden"
        />

        {playlists.length > 0 && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="text-sm font-medium text-gray-300">Playlist</label>
              <input
                type="search"
                value={playlistFilter}
                onChange={(e) => setPlaylistFilter(e.target.value)}
                placeholder="Filter playlists…"
                className="bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-sm text-white w-56"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg border border-gray-700 p-2">
              {filteredPlaylists.map((playlist) => {
                const id = playlist.fullPath || playlist.name;
                const checked = selectedPlaylist === id;
                return (
                  <label
                    key={id}
                    className={`flex items-center gap-3 rounded-md px-2 py-1.5 text-sm cursor-pointer ${
                      checked ? 'bg-gray-700/80' : 'hover:bg-gray-700/40'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rekordbox-ingest-playlist"
                      checked={checked}
                      onChange={() => {
                        setSelectedPlaylist(id);
                        resetPreview();
                      }}
                    />
                    <span className="flex-1 min-w-0 truncate">{playlist.fullPath || playlist.name}</span>
                    <span className="text-xs text-gray-500 tabular-nums flex-shrink-0">
                      {playlist.trackCount}
                      {playlist.localFiles > 0 ? ` · ${playlist.localFiles} local` : ''}
                      {playlist.missingFiles > 0 ? ` · ${playlist.missingFiles} missing` : ''}
                    </span>
                  </label>
                );
              })}
              {filteredPlaylists.length === 0 && (
                <p className="text-sm text-gray-500 px-2 py-3">No playlists match that filter.</p>
              )}
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={createUnmatched}
              onChange={(e) => setCreateUnmatched(e.target.checked)}
            />
            Create unmatched tracks
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={createParties}
              onChange={(e) => setCreateParties(e.target.checked)}
            />
            Mirror playlist as private party
          </label>
          <label className="text-sm text-gray-300">
            Min bitrate (kbps)
            <input
              type="number"
              min={0}
              value={minBitrate}
              onChange={(e) => setMinBitrate(e.target.value)}
              placeholder="off"
              className="mt-1 w-full bg-gray-900 border border-gray-600 rounded px-3 py-1.5 text-white"
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={!xmlFile || !selectedPlaylist || busy}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-lg font-medium flex items-center gap-2"
          >
            {isPreviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Preview playlist
          </button>
          {xmlFile && (
            <button
              type="button"
              onClick={() => {
                setXmlFile(null);
                setPlaylists([]);
                setSelectedPlaylist('');
                setPlaylistFilter('');
                resetPreview();
                if (xmlInputRef.current) xmlInputRef.current.value = '';
              }}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
            >
              Clear
            </button>
          )}
        </div>

        {busy && progressMessage ? (
          <div className="rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2">
            <div className="flex items-center justify-between gap-2 text-xs text-gray-300">
              <span>{progressMessage}</span>
              {progressTotal > 0 ? (
                <span className="text-gray-500 tabular-nums">
                  {progressCurrent}/{progressTotal}
                </span>
              ) : null}
            </div>
            {progressTotal > 0 ? (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-gray-700">
                <div
                  className="h-full rounded-full bg-purple-500 transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.round((progressCurrent / Math.max(progressTotal, 1)) * 100))}%`,
                  }}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {preview && (
        <div className="bg-gray-800 rounded-lg p-6 border border-gray-700 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Music className="h-5 w-5 text-purple-400" />
                {preview.playlists.map((p) => p.fullPath || p.name).join(', ') || 'Preview'}
              </h3>
              <p className="text-sm text-gray-400 mt-1">
                {preview.summary.attach} attach · {preview.summary.create} create · {preview.summary.skip} skip
                {preview.summary.missingFiles > 0 ? ` · ${preview.summary.missingFiles} missing on disk` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => toggleAllRunnable(selectedItems.length !== preview.summary.attach + preview.summary.create)}
              className="text-sm text-purple-400 hover:underline"
            >
              {selectedItems.length === preview.summary.attach + preview.summary.create ? 'Clear selection' : 'Select all runnable'}
            </button>
          </div>

          {preview.message && (
            <p className="text-amber-200 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              {preview.message}
            </p>
          )}

          <div className="max-h-[28rem] overflow-auto rounded-lg border border-gray-700">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-900/80 text-gray-400 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Ingest</th>
                  <th className="px-3 py-2 text-left font-medium">Track</th>
                  <th className="px-3 py-2 text-left font-medium">Action</th>
                  <th className="px-3 py-2 text-left font-medium">Match</th>
                  <th className="px-3 py-2 text-left font-medium">File</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const runnable = item.action === 'attach' || item.action === 'create';
                  return (
                    <tr key={item.key} className="border-t border-gray-700/80">
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          disabled={!runnable}
                          checked={item.selected && runnable}
                          onChange={(e) => {
                            setItems((prev) => prev.map((row) => (
                              row.key === item.key ? { ...row, selected: e.target.checked } : row
                            )));
                          }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-white">{item.title}</div>
                        <div className="text-gray-400 text-xs">{item.artist}</div>
                      </td>
                      <td className={`px-3 py-2 ${actionClass(item.action)}`}>
                        {actionLabel(item.action)}
                        {item.skipReason ? (
                          <div className="text-xs text-gray-500">
                            {SKIP_LABELS[item.skipReason] || item.skipReason}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-gray-300">
                        {item.matchType ? (
                          <div>
                            <div>{item.matchType}</div>
                            {item.catalogTitle ? (
                              <div className="text-xs text-gray-500">
                                {item.catalogTitle}
                                {item.catalogArtist ? ` — ${item.catalogArtist}` : ''}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[14rem]" title={item.filePath || ''}>
                        {item.filePath ? item.filePath.split('/').pop() : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={() => void runExecute()}
            disabled={selectedItems.length === 0 || busy}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg font-medium flex items-center gap-2"
          >
            {isExecuting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Ingest {selectedItems.length} track{selectedItems.length === 1 ? '' : 's'}
          </button>
        </div>
      )}

      {executeResult && (
        <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 text-green-100 flex items-start gap-3">
          <CheckCircle2 className="h-5 w-5 text-green-400 mt-0.5" />
          <div>
            <p className="font-medium">Ingest complete</p>
            <p className="text-sm text-green-200/80 mt-1">
              Attached {executeResult.attached} · created {executeResult.created} · skipped {executeResult.skipped}
              {executeResult.partyAdds > 0 ? ` · ${executeResult.partyAdds} party entries` : ''}
              {executeResult.failed > 0 ? ` · ${executeResult.failed} failed` : ''}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default RekordboxPlaylistIngest;
