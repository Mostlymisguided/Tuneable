import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Instagram, Link2, Mail, RefreshCw, Search, Upload, X } from 'lucide-react';
import { rightsAPI, type CatalogArtist } from '../lib/api';
import { toast } from '../utils/toast';
import { RIGHTS_STATUS_LABELS, type RightsStatus } from '../utils/rightsStatus';

type ArtistFilter = 'all' | 'no_contact' | 'has_email' | 'instagram_only' | 'never' | 'stale' | 'declined';
type ArtistSort = 'pending' | 'name' | 'lastOutbound' | 'followUp';

const FILTERS: { id: ArtistFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'no_contact', label: 'No contact' },
  { id: 'has_email', label: 'Has email' },
  { id: 'instagram_only', label: 'Instagram only' },
  { id: 'never', label: 'Never contacted' },
  { id: 'stale', label: 'Stale contact' },
  { id: 'declined', label: 'Declined' },
];

const SORTS: { id: ArtistSort; label: string }[] = [
  { id: 'pending', label: 'Most pending' },
  { id: 'name', label: 'Name' },
  { id: 'lastOutbound', label: 'Oldest contact' },
  { id: 'followUp', label: 'Follow-up' },
];

const STATUS_LABELS: Record<string, string> = {
  none: 'No case',
  identified: 'Identified',
  contact_found: 'Contact found',
  outreach_sent: 'Outreach sent',
  awaiting_reply: 'Awaiting reply',
  in_conversation: 'In conversation',
  claim_filed: 'Claim filed',
  no_response: 'No response',
  declined: 'Declined',
  cleared: 'Cleared',
  takedown: 'Takedown',
};

const TEMPLATES: { id: string; label: string }[] = [
  { id: 'founding_catalog_invite', label: 'Founding catalog invite' },
  { id: 'claim_keep_invite', label: 'Claim-keep invite' },
  { id: 'follow_up', label: 'Follow-up' },
  { id: 'takedown_option', label: 'Takedown option' },
  { id: 'custom', label: 'Custom' },
];

function formatDay(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function tuneSummary(tunes: CatalogArtist['tunes']) {
  const bits: string[] = [];
  if (tunes.pending) bits.push(`${tunes.pending} pending`);
  if (tunes.permitted) bits.push(`${tunes.permitted} permitted`);
  if (tunes.cleared) bits.push(`${tunes.cleared} cleared`);
  if (tunes.disputed) bits.push(`${tunes.disputed} disputed`);
  if (!bits.length) return tunes.total ? `${tunes.total}` : '—';
  return bits.join(' · ');
}

function instagramHandleFromValue(value?: string | null) {
  let raw = String(value || '').trim().replace(/^@+/, '');
  const fromUrl = raw.match(/(?:instagram\.com|instagr\.am)\/(?:[a-z]{2}\/)?([^/?#]+)/i)
    || raw.match(/ig\.me\/m\/([^/?#]+)/i);
  if (fromUrl) raw = fromUrl[1];
  raw = raw.replace(/\/+$/, '').replace(/^@+/, '');
  return raw;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

const ArtistsAdmin: React.FC = () => {
  const [filter, setFilter] = useState<ArtistFilter>('all');
  const [sort, setSort] = useState<ArtistSort>('pending');
  const [staleDays, setStaleDays] = useState(14);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [artists, setArtists] = useState<CatalogArtist[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [artist, setArtist] = useState<CatalogArtist | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [instagram, setInstagram] = useState('');
  const [template, setTemplate] = useState('founding_catalog_invite');
  const [customMessage, setCustomMessage] = useState('');
  const [preview, setPreview] = useState<{ subject?: string; text?: string } | null>(null);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    updated: number;
    unchanged: number;
    unmatched: Array<{ artist: string; reason: string }>;
    warnings: Array<{ artist: string; message: string }>;
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const detailRequest = useRef(0);
  const limit = 50;

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      const data = await rightsAPI.listArtists({
        filter,
        sort,
        staleDays,
        search: debouncedSearch.trim() || undefined,
        page,
        limit,
      });
      setArtists(data.artists || []);
      setTotal(data.total || 0);
      setCounts(data.counts || {});
    } catch (error) {
      console.error('Failed to load artists', error);
      toast.error('Failed to load artists');
    } finally {
      setLoading(false);
    }
  }, [filter, sort, staleDays, debouncedSearch, page]);

  const loadDetail = useCallback(async (partyKey: string) => {
    const requestId = detailRequest.current + 1;
    detailRequest.current = requestId;
    try {
      setDetailLoading(true);
      const data = await rightsAPI.getArtist(partyKey);
      if (detailRequest.current !== requestId) return;
      setArtist(data.artist);
      setEmail(data.artist.email || '');
      setInstagram(data.artist.instagram || '');
      setReply('');
    } catch (error) {
      console.error('Failed to load artist', error);
      if (detailRequest.current === requestId) {
        toast.error('Failed to load artist');
        setArtist(null);
      }
    } finally {
      if (detailRequest.current === requestId) setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!selectedKey) {
      setArtist(null);
      setPreview(null);
      return;
    }
    loadDetail(selectedKey);
  }, [selectedKey, loadDetail]);

  useEffect(() => {
    if (!artist?.partyKey || !artist.media?.length) {
      setPreview(null);
      return undefined;
    }
    const partyKey = artist.partyKey;
    const timer = setTimeout(async () => {
      try {
        const data = await rightsAPI.previewArtistOutreach({
          partyKey,
          template,
          customMessage,
          format: 'email',
        });
        setPreview({ subject: data.subject, text: data.text });
      } catch (error) {
        console.error('Failed to preview artist invite', error);
        setPreview(null);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [artist?.partyKey, artist?.media?.length, template, customMessage]);

  const selectArtist = (row: CatalogArtist) => {
    setSelectedKey(row.partyKey);
  };

  const saveContacts = async () => {
    if (!artist) return;
    try {
      setBusy(true);
      const data = await rightsAPI.saveArtistContacts({
        partyKey: artist.partyKey,
        email: email.trim(),
        instagram: instagram.trim(),
      });
      setArtist(data.artist);
      setEmail(data.artist.email || '');
      setInstagram(data.artist.instagram || '');
      toast.success('Contact saved');
      loadList();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save contact');
    } finally {
      setBusy(false);
    }
  };

  const sendEmail = async () => {
    if (!artist) return;
    if (!email.trim()) {
      toast.error('Email address required');
      return;
    }
    try {
      setBusy(true);
      const data = await rightsAPI.sendArtistOutreach({
        partyKey: artist.partyKey,
        channel: 'email',
        template,
        customMessage,
        to: email.trim(),
      });
      setArtist(data.artist);
      setEmail(data.artist.email || '');
      setInstagram(data.artist.instagram || '');
      setCustomMessage('');
      toast.success('Email sent');
      loadList();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to send email');
    } finally {
      setBusy(false);
    }
  };

  const copyChannel = async (channel: 'instagram' | 'link') => {
    if (!artist) return;
    try {
      setBusy(true);
      const data = await rightsAPI.previewArtistOutreach({
        partyKey: artist.partyKey,
        template,
        customMessage,
        format: channel,
      });
      await copyToClipboard(data.text);
      const sent = await rightsAPI.sendArtistOutreach({
        partyKey: artist.partyKey,
        channel,
        template,
        customMessage,
        to: channel === 'instagram' ? instagram.trim() : data.tuneUrl,
        body: data.text,
      });
      setArtist(sent.artist);
      setEmail(sent.artist.email || '');
      setInstagram(sent.artist.instagram || '');
      const handle = instagramHandleFromValue(instagram) || instagramHandleFromValue(data.instagramHandle);
      if (channel === 'instagram' && handle) {
        window.open(`https://ig.me/m/${encodeURIComponent(handle)}`, '_blank', 'noopener,noreferrer');
        toast.success('IG message copied — paste it in the DM');
      } else if (channel === 'instagram') {
        toast.success('IG message copied — open their profile and paste it');
      } else {
        toast.success('Invite copied');
      }
      loadList();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to copy invite');
    } finally {
      setBusy(false);
    }
  };

  const logReply = async () => {
    if (!artist || !reply.trim()) return;
    if (!artist.flagshipCaseId) {
      toast.error('Save a contact first so the reply has a case');
      return;
    }
    try {
      setBusy(true);
      await rightsAPI.sendOutreach(artist.flagshipCaseId, {
        channel: 'manual',
        direction: 'inbound',
        body: reply.trim(),
      });
      setReply('');
      toast.success('Reply logged');
      await loadDetail(artist.partyKey);
      loadList();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to log reply');
    } finally {
      setBusy(false);
    }
  };

  const onImportFile = async (file: File) => {
    try {
      setBusy(true);
      const csv = await file.text();
      const result = await rightsAPI.importArtists(csv);
      setImportResult(result);
      const unmatched = result.unmatched?.length || 0;
      toast.success(
        `Imported ${result.imported}, updated ${result.updated}${unmatched ? `, ${unmatched} unmatched` : ''}`
      );
      loadList();
      if (selectedKey) loadDetail(selectedKey);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to import CSV');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-400 max-w-3xl">
          One row per artist. A send is a single founding invite covering their catalog. Email goes out from here. Instagram copies the DM for you to paste.
        </p>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onImportFile(file);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-gray-200 rounded-lg text-sm flex items-center gap-2"
          >
            <Upload className="h-4 w-4" />
            Import CSV
          </button>
          <button
            type="button"
            onClick={() => { loadList(); if (selectedKey) loadDetail(selectedKey); }}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500">
        Export the Numbers sheet as CSV with columns Artist, Email, Instagram, Last contact, Notes. Dates as 15/01/2026 or 2026-01-15. A newer outreach date already on Tuneable is kept.
      </p>

      {importResult && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 text-sm text-gray-300 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <p>
              {importResult.imported} new, {importResult.updated} updated, {importResult.unchanged} unchanged, {importResult.unmatched.length} unmatched.
            </p>
            <button type="button" onClick={() => setImportResult(null)} className="text-gray-400 hover:text-white" aria-label="Dismiss import result">
              <X className="h-4 w-4" />
            </button>
          </div>
          {importResult.warnings.length > 0 && (
            <ul className="text-xs text-amber-300 space-y-1">
              {importResult.warnings.slice(0, 8).map((warning, index) => (
                <li key={`${warning.artist}-${index}`}>{warning.artist}: {warning.message}</li>
              ))}
            </ul>
          )}
          {importResult.unmatched.length > 0 && (
            <ul className="text-xs text-gray-400 space-y-1 max-h-40 overflow-y-auto">
              {importResult.unmatched.slice(0, 20).map((row, index) => (
                <li key={`${row.artist}-${index}`}>{row.artist} — {row.reason}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => { setFilter(item.id); setPage(1); }}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              filter === item.id ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {item.label}
            <span className="ml-2 text-xs opacity-80">{counts[item.id] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            placeholder="Search artist, email, Instagram, or tune title"
            className="w-full pl-9 pr-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
          />
        </div>
        <label className="text-sm text-gray-400 flex items-center gap-2">
          Sort
          <select
            value={sort}
            onChange={(event) => { setSort(event.target.value as ArtistSort); setPage(1); }}
            className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
          >
            {SORTS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        {filter === 'stale' && (
          <label className="text-sm text-gray-400 flex items-center gap-2">
            Older than
            <input
              type="number"
              min={1}
              max={365}
              value={staleDays}
              onChange={(event) => { setStaleDays(Math.max(1, Number(event.target.value) || 14)); setPage(1); }}
              className="w-20 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
            />
            days
          </label>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 bg-gray-800 rounded-lg overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
            </div>
          ) : artists.length === 0 ? (
            <div className="p-8 text-center text-gray-400">No artists in this view</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Artist</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Contact</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Tunes</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Last out</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Last in</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Follow-up</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {artists.map((row) => (
                    <tr
                      key={row.partyKey}
                      onClick={() => selectArtist(row)}
                      className={`cursor-pointer hover:bg-gray-700/60 ${selectedKey === row.partyKey ? 'bg-gray-700' : ''}`}
                    >
                      <td className="px-4 py-3 text-sm text-white font-medium">{row.displayName}</td>
                      <td className="px-4 py-3 text-xs text-gray-300">
                        <div>{row.email || '—'}</div>
                        <div className="text-gray-500">{row.instagram ? `@${row.instagram}` : '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{tuneSummary(row.tunes)}</td>
                      <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{formatDay(row.lastOutboundAt)}</td>
                      <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{formatDay(row.lastInboundAt)}</td>
                      <td className="px-4 py-3 text-xs text-gray-300 whitespace-nowrap">{formatDay(row.nextFollowUpAt)}</td>
                      <td className="px-4 py-3 text-xs text-gray-200 whitespace-nowrap">{STATUS_LABELS[row.status] || row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 text-sm text-gray-400">
              <span>{total} artists</span>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className="px-3 py-1 bg-gray-700 rounded disabled:opacity-40">Prev</button>
                <span className="py-1">{page} / {totalPages}</span>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className="px-3 py-1 bg-gray-700 rounded disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>

        <div className="xl:col-span-2 bg-gray-800 rounded-lg p-4 space-y-4">
          {!selectedKey ? (
            <p className="text-sm text-gray-400">Select an artist to see their tunes, contacts, and invite.</p>
          ) : detailLoading && !artist ? (
            <div className="py-16 flex justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
            </div>
          ) : artist ? (
            <>
              <div>
                <h3 className="text-lg font-semibold text-white">{artist.displayName}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {STATUS_LABELS[artist.status] || artist.status}
                  {artist.nextFollowUpAt ? ` · follow up ${formatDay(artist.nextFollowUpAt)}` : ''}
                  {` · ${artist.tunes.total} tune${artist.tunes.total === 1 ? '' : 's'}`}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="block text-sm text-gray-300">
                  Email
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                  />
                </label>
                <label className="block text-sm text-gray-300">
                  Instagram
                  <input
                    value={instagram}
                    onChange={(event) => setInstagram(event.target.value)}
                    placeholder="@handle"
                    className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={saveContacts}
                disabled={busy}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm"
              >
                Save contact
              </button>

              <label className="block text-sm text-gray-300">
                Template
                <select
                  value={template}
                  onChange={(event) => setTemplate(event.target.value)}
                  className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                >
                  {TEMPLATES.map((item) => (
                    <option key={item.id} value={item.id}>{item.label}</option>
                  ))}
                </select>
              </label>
              <textarea
                value={customMessage}
                onChange={(event) => setCustomMessage(event.target.value)}
                placeholder="Optional extra note"
                rows={2}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
              />
              {preview?.text && (
                <div className="bg-gray-900 rounded-lg p-3 text-xs text-gray-300 space-y-2">
                  {preview.subject && <p className="text-gray-400">Subject: {preview.subject}</p>}
                  <pre className="whitespace-pre-wrap font-sans">{preview.text}</pre>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button type="button" onClick={() => copyChannel('link')} disabled={busy || !artist.media?.length} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Copy link
                </button>
                <button type="button" onClick={sendEmail} disabled={busy || !email.trim() || !artist.media?.length} className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                  <Mail className="h-4 w-4" />
                  Send email
                </button>
                <button type="button" onClick={() => copyChannel('instagram')} disabled={busy || !artist.media?.length} className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                  <Instagram className="h-4 w-4" />
                  Copy IG DM
                </button>
              </div>
              <p className="text-xs text-gray-500">
                One message lists their catalog and links the invite to the lead tune. Copy IG logs the outreach, then opens Instagram to paste. Replies are marked by hand.
              </p>

              <div className="border-t border-gray-700 pt-3 space-y-2">
                <h4 className="text-sm font-medium text-gray-200">Tunes</h4>
                <ul className="space-y-1 max-h-40 overflow-y-auto">
                  {(artist.media || []).map((item) => (
                    <li key={item._id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-gray-200 truncate">{item.title}</span>
                      <span className="text-xs text-gray-500 shrink-0">
                        {RIGHTS_STATUS_LABELS[(item.rightsStatus || 'pending') as RightsStatus] || item.rightsStatus}
                      </span>
                    </li>
                  ))}
                  {artist.tunes.total > (artist.media || []).length && (
                    <li className="text-xs text-gray-500">
                      and {artist.tunes.total - (artist.media || []).length} more
                    </li>
                  )}
                </ul>
              </div>

              <div className="border-t border-gray-700 pt-3 space-y-2">
                <h4 className="text-sm font-medium text-gray-200">Contact log</h4>
                {(artist.outreach || []).length === 0 ? (
                  <p className="text-xs text-gray-500">No outreach yet.</p>
                ) : (
                  <ul className="space-y-2 max-h-56 overflow-y-auto">
                    {(artist.outreach || []).map((event, index) => (
                      <li key={event._id || index} className="text-xs text-gray-300 bg-gray-900 rounded p-2">
                        <p className="text-gray-500">
                          {formatDay(event.sentAt)} · {event.channel} · {event.direction}
                          {event.mediaTitle ? ` · ${event.mediaTitle}` : ''}
                        </p>
                        {event.subject && <p className="mt-1 text-gray-400">{event.subject}</p>}
                        {event.body && <p className="whitespace-pre-wrap mt-1">{event.body}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  placeholder="Paste a YES, NO, or other reply"
                  rows={2}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                />
                <button
                  type="button"
                  onClick={logReply}
                  disabled={busy || !reply.trim()}
                  className="px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white rounded-lg text-sm flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  Log reply
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ArtistsAdmin;
