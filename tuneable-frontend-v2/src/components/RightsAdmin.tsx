import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  Clock,
  ExternalLink,
  Mail,
  Music,
  Plus,
  RefreshCw,
  Scale,
  Send,
  StickyNote,
} from 'lucide-react';
import { rightsAPI } from '../lib/api';
import { penceToPounds } from '../utils/currency';
import { DEFAULT_COVER_ART } from '../constants';

type QueueId = 'limbo' | 'follow_ups' | 'open' | 'inbound' | 'stalled';

interface RightsAdminProps {
  onAttentionCountChange?: (count: number) => void;
}

const QUEUE_LABELS: { id: QueueId; label: string }[] = [
  { id: 'limbo', label: 'Limbo' },
  { id: 'follow_ups', label: 'Follow-ups' },
  { id: 'open', label: 'Open cases' },
  { id: 'inbound', label: 'Inbound' },
  { id: 'stalled', label: 'No response' },
];

const STATUS_LABELS: Record<string, string> = {
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

const STATUS_COLORS: Record<string, string> = {
  identified: 'bg-gray-600',
  contact_found: 'bg-blue-600',
  outreach_sent: 'bg-indigo-600',
  awaiting_reply: 'bg-yellow-600',
  in_conversation: 'bg-purple-600',
  claim_filed: 'bg-orange-600',
  no_response: 'bg-gray-500',
  declined: 'bg-red-700',
  cleared: 'bg-green-600',
  takedown: 'bg-red-600',
};

const TEMPLATE_LABELS: Record<string, string> = {
  claim_keep_invite: 'Claim-keep invite',
  takedown_option: 'Takedown option',
  follow_up: 'Follow-up',
  copyright_reporter: 'Copyright reporter reply',
  custom: 'Custom',
};

function artistLine(media: any): string {
  if (!media) return 'Unknown artist';
  if (media.creatorDisplay) return media.creatorDisplay;
  const names = (media.artist || []).map((a: any) => a?.name || a).filter(Boolean);
  return names.join(', ') || 'Unknown artist';
}

function toDatetimeLocal(value?: string | Date | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function StatusPill({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium text-white ${STATUS_COLORS[status] || 'bg-gray-600'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

const RightsAdmin: React.FC<RightsAdminProps> = ({ onAttentionCountChange }) => {
  const [queue, setQueue] = useState<QueueId>('limbo');
  const [counts, setCounts] = useState({ limbo: 0, followUps: 0, open: 0, inbound: 0, stalled: 0 });
  const [replyTo, setReplyTo] = useState('hi@tuneable.stream');
  const [loading, setLoading] = useState(true);
  const [limbo, setLimbo] = useState<any[]>([]);
  const [cases, setCases] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedLimbo, setSelectedLimbo] = useState<any | null>(null);
  const [selectedCase, setSelectedCase] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const [partyName, setPartyName] = useState('');
  const [partyRole, setPartyRole] = useState('artist');
  const [partyEmail, setPartyEmail] = useState('');
  const [sendOnCreate, setSendOnCreate] = useState(true);
  const [template, setTemplate] = useState('claim_keep_invite');
  const [customMessage, setCustomMessage] = useState('');
  const [outreachTo, setOutreachTo] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [caseStatus, setCaseStatus] = useState('');
  const [followUp, setFollowUp] = useState('');

  const limit = 25;
  const attention = counts.followUps + counts.inbound;

  const refreshCounts = useCallback(async () => {
    try {
      const data = await rightsAPI.getQueues();
      setCounts(data.counts);
      onAttentionCountChange?.(data.counts.followUps + data.counts.inbound);
    } catch (error) {
      console.error('Failed to load rights queue counts', error);
    }
  }, [onAttentionCountChange]);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      if (queue === 'limbo') {
        const data = await rightsAPI.getLimbo({ page, limit, uncontacted: true });
        setLimbo(data.media || []);
        setCases([]);
        setTotal(data.total || 0);
      } else {
        const data = await rightsAPI.getCases({
          queue,
          page,
          limit,
          search: debouncedSearch.trim() || undefined,
        });
        setCases(data.cases || []);
        setLimbo([]);
        setTotal(data.total || 0);
      }
    } catch (error) {
      console.error('Failed to load rights queue', error);
      toast.error('Failed to load rights queue');
    } finally {
      setLoading(false);
    }
  }, [queue, page, debouncedSearch]);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    rightsAPI.getMeta()
      .then((meta) => setReplyTo(meta.replyTo))
      .catch(() => undefined);
    refreshCounts();
  }, [refreshCounts]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    setPage(1);
    setSelectedCase(null);
    setSelectedLimbo(null);
  }, [queue]);

  const selectLimbo = (media: any) => {
    setSelectedCase(null);
    setSelectedLimbo(media);
    const first = media.suggestedParties?.[0];
    setPartyName(first?.displayName || artistLine(media));
    setPartyRole(first?.role || 'artist');
    setPartyEmail('');
    setTemplate('claim_keep_invite');
    setCustomMessage('');
    setSendOnCreate(true);
  };

  const selectCase = (rightsCase: any) => {
    setSelectedLimbo(null);
    setSelectedCase(rightsCase);
    setCaseStatus(rightsCase.status);
    setFollowUp(toDatetimeLocal(rightsCase.nextFollowUpAt));
    const email = (rightsCase.party?.contacts || []).find((c: any) => c.type === 'email')?.value || '';
    setOutreachTo(email);
    setTemplate(rightsCase.source === 'report' ? 'copyright_reporter' : 'claim_keep_invite');
    setCustomMessage('');
    setManualNote('');
  };

  const reloadSelectedCase = async (id: string) => {
    const data = await rightsAPI.getCase(id);
    setSelectedCase(data.case);
    setCaseStatus(data.case.status);
    setFollowUp(toDatetimeLocal(data.case.nextFollowUpAt));
    await refreshCounts();
    await loadList();
  };

  const handleCreateFromLimbo = async () => {
    if (!selectedLimbo) return;
    if (!partyName.trim()) {
      toast.error('Party name is required');
      return;
    }
    if (sendOnCreate && !partyEmail.trim()) {
      toast.error('Add an email, or uncheck send now');
      return;
    }
    try {
      setBusy(true);
      const match = (selectedLimbo.suggestedParties || []).find(
        (p: any) => p.displayName === partyName.trim() && p.role === partyRole
      );
      const created = await rightsAPI.createCase({
        mediaId: selectedLimbo._id,
        party: {
          displayName: partyName.trim(),
          role: partyRole,
          userId: match?.userId || undefined,
          contacts: partyEmail.trim() ? [{ type: 'email', value: partyEmail.trim() }] : [],
        },
        source: 'import',
      });
      if (sendOnCreate && partyEmail.trim()) {
        await rightsAPI.sendOutreach(created.case._id, {
          channel: 'email',
          template,
          to: partyEmail.trim(),
          customMessage,
        });
        toast.success(created.created ? 'Case opened and email sent' : 'Existing case updated and email sent');
      } else {
        toast.success(created.created ? 'Case opened' : 'Case already existed — opened it');
      }
      await refreshCounts();
      setQueue('open');
      await reloadSelectedCase(created.case._id);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to open case');
    } finally {
      setBusy(false);
    }
  };

  const handleSendEmail = async () => {
    if (!selectedCase) return;
    if (!outreachTo.trim()) {
      toast.error('Email address required');
      return;
    }
    try {
      setBusy(true);
      await rightsAPI.sendOutreach(selectedCase._id, {
        channel: 'email',
        template,
        to: outreachTo.trim(),
        customMessage,
      });
      toast.success('Email sent');
      await reloadSelectedCase(selectedCase._id);
      setCustomMessage('');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to send email');
    } finally {
      setBusy(false);
    }
  };

  const handleLogNote = async (inbound = false) => {
    if (!selectedCase || !manualNote.trim()) return;
    try {
      setBusy(true);
      await rightsAPI.sendOutreach(selectedCase._id, {
        channel: inbound ? 'manual' : 'note',
        direction: inbound ? 'inbound' : 'note',
        body: manualNote.trim(),
      });
      toast.success(inbound ? 'Reply logged' : 'Note saved');
      setManualNote('');
      await reloadSelectedCase(selectedCase._id);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to save note');
    } finally {
      setBusy(false);
    }
  };

  const handleUpdateCase = async () => {
    if (!selectedCase) return;
    try {
      setBusy(true);
      await rightsAPI.updateCase(selectedCase._id, {
        status: caseStatus,
        nextFollowUpAt: followUp || null,
      });
      toast.success('Case updated');
      await reloadSelectedCase(selectedCase._id);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update case');
    } finally {
      setBusy(false);
    }
  };

  const countFor = (id: QueueId) => {
    if (id === 'limbo') return counts.limbo;
    if (id === 'follow_ups') return counts.followUps;
    if (id === 'open') return counts.open;
    if (id === 'inbound') return counts.inbound;
    return counts.stalled;
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const mediaFromCase = selectedCase?.mediaId && typeof selectedCase.mediaId === 'object'
    ? selectedCase.mediaId
    : null;

  const timeline = useMemo(() => {
    const events = selectedCase?.outreach || [];
    return [...events].sort((a: any, b: any) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime());
  }, [selectedCase]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Scale className="h-6 w-6 text-purple-400" />
            Rights
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Outreach cases for rights holders. Replies go to {replyTo}. Playability still lives on the media rights status.
          </p>
        </div>
        <button
          onClick={() => { refreshCounts(); loadList(); }}
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg text-sm flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {attention > 0 && (
        <p className="text-sm text-amber-400">
          {counts.followUps} follow-up{counts.followUps === 1 ? '' : 's'} due, {counts.inbound} inbound open.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {QUEUE_LABELS.map((item) => (
          <button
            key={item.id}
            onClick={() => setQueue(item.id)}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${
              queue === item.id
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {item.label}
            <span className="ml-2 text-xs opacity-80">{countFor(item.id)}</span>
          </button>
        ))}
      </div>

      {queue !== 'limbo' && (
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search party name or notes"
          className="w-full max-w-md px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-gray-800 rounded-lg overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
            </div>
          ) : queue === 'limbo' ? (
            limbo.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No uncontacted pending media</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Media</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Escrow</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Bids</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {limbo.map((media) => (
                    <tr
                      key={media._id}
                      onClick={() => selectLimbo(media)}
                      className={`cursor-pointer hover:bg-gray-700/60 ${selectedLimbo?._id === media._id ? 'bg-gray-700' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img src={media.coverArt || DEFAULT_COVER_ART} alt="" className="h-10 w-10 rounded object-cover" />
                          <div>
                            <p className="text-white text-sm font-medium">{media.title}</p>
                            <p className="text-gray-400 text-xs">{artistLine(media)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-white">{penceToPounds(media.escrowPence)}</td>
                      <td className="px-4 py-3 text-sm text-gray-300">{penceToPounds(media.globalMediaAggregate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : (
            cases.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No cases in this queue</div>
            ) : (
              <table className="min-w-full divide-y divide-gray-700">
                <thead className="bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Case</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Status</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase">Follow-up</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {cases.map((item) => {
                    const media = item.mediaId || {};
                    return (
                      <tr
                        key={item._id}
                        onClick={() => selectCase(item)}
                        className={`cursor-pointer hover:bg-gray-700/60 ${selectedCase?._id === item._id ? 'bg-gray-700' : ''}`}
                      >
                        <td className="px-4 py-3">
                          <p className="text-white text-sm font-medium">{item.party?.displayName}</p>
                          <p className="text-gray-400 text-xs">{media.title || 'Media'} · {artistLine(media)}</p>
                        </td>
                        <td className="px-4 py-3"><StatusPill status={item.status} /></td>
                        <td className="px-4 py-3 text-xs text-gray-300">{formatDate(item.nextFollowUpAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-700 text-sm text-gray-400">
              <span>{total} total</span>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-2 py-1 bg-gray-700 rounded disabled:opacity-40">Prev</button>
                <span>{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="px-2 py-1 bg-gray-700 rounded disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          {!selectedLimbo && !selectedCase && (
            <div className="bg-gray-800 rounded-lg p-8 text-center text-gray-400">
              <Music className="h-10 w-10 mx-auto mb-3 text-gray-500" />
              Select a row to open a case or send outreach.
            </div>
          )}

          {selectedLimbo && (
            <div className="bg-gray-800 rounded-lg p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-white font-semibold">{selectedLimbo.title}</h3>
                  <p className="text-gray-400 text-sm">{artistLine(selectedLimbo)}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Escrow {penceToPounds(selectedLimbo.escrowPence)} · Bids {penceToPounds(selectedLimbo.globalMediaAggregate)}
                    {selectedLimbo.importSource ? ` · ${selectedLimbo.importSource}` : ''}
                  </p>
                </div>
                {selectedLimbo.uuid && (
                  <Link to={`/tune/${selectedLimbo.uuid}`} className="text-purple-400 hover:text-purple-300">
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                )}
              </div>

              {(selectedLimbo.suggestedParties || []).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedLimbo.suggestedParties.map((party: any) => (
                    <button
                      key={`${party.role}-${party.displayName}`}
                      onClick={() => { setPartyName(party.displayName); setPartyRole(party.role); }}
                      className={`px-2 py-1 rounded text-xs ${
                        partyName === party.displayName && partyRole === party.role
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-700 text-gray-300'
                      }`}
                    >
                      {party.displayName} ({party.role})
                    </button>
                  ))}
                </div>
              )}

              <label className="block text-sm text-gray-300">
                Party
                <input value={partyName} onChange={(e) => setPartyName(e.target.value)} className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
              </label>
              <label className="block text-sm text-gray-300">
                Role
                <select value={partyRole} onChange={(e) => setPartyRole(e.target.value)} className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
                  {['artist', 'songwriter', 'composer', 'producer', 'publisher', 'label', 'collective', 'other'].map((role) => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
              </label>
              <label className="block text-sm text-gray-300">
                Email
                <input type="email" value={partyEmail} onChange={(e) => setPartyEmail(e.target.value)} placeholder="rights holder" className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white" />
              </label>
              <label className="block text-sm text-gray-300">
                Template
                <select value={template} onChange={(e) => setTemplate(e.target.value)} className="mt-1 w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white">
                  {Object.entries(TEMPLATE_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Optional extra note"
                rows={3}
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
              />
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input type="checkbox" checked={sendOnCreate} onChange={(e) => setSendOnCreate(e.target.checked)} />
                Send email now (reply-to {replyTo})
              </label>
              <button
                onClick={handleCreateFromLimbo}
                disabled={busy}
                className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
              >
                <Plus className="h-4 w-4" />
                {sendOnCreate ? 'Open case and send' : 'Open case'}
              </button>
            </div>
          )}

          {selectedCase && (
            <div className="bg-gray-800 rounded-lg p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-white font-semibold">{selectedCase.party?.displayName}</h3>
                  <p className="text-gray-400 text-sm">
                    {selectedCase.party?.role} · {mediaFromCase?.title || 'Media'}
                  </p>
                  {mediaFromCase?.uuid && (
                    <Link to={`/tune/${mediaFromCase.uuid}`} className="text-xs text-purple-400 hover:text-purple-300 inline-flex items-center gap-1 mt-1">
                      Open listing <ExternalLink className="h-3 w-3" />
                    </Link>
                  )}
                </div>
                <StatusPill status={selectedCase.status} />
              </div>

              <p className="text-xs text-gray-500">
                Escrow {penceToPounds(selectedCase.escrowPence)} · Media {mediaFromCase?.rightsStatus || '—'}
                {selectedCase.assignedTo?.username ? ` · Assigned ${selectedCase.assignedTo.username}` : ''}
              </p>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm text-gray-300">
                  Status
                  <select value={caseStatus} onChange={(e) => setCaseStatus(e.target.value)} className="mt-1 w-full px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm">
                    {Object.entries(STATUS_LABELS).map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm text-gray-300">
                  Follow-up
                  <input type="datetime-local" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="mt-1 w-full px-2 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm" />
                </label>
              </div>
              <button onClick={handleUpdateCase} disabled={busy} className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">
                Save status
              </button>
              <p className="text-xs text-gray-500">
                Case status does not change playability. Approve a claim or edit media rights for that.
              </p>

              <div>
                <h4 className="text-sm font-medium text-gray-200 mb-2 flex items-center gap-2">
                  <Clock className="h-4 w-4" /> Timeline
                </h4>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {timeline.length === 0 && <p className="text-xs text-gray-500">No outreach yet</p>}
                  {timeline.map((event: any) => (
                    <div key={event._id} className="bg-gray-700/70 rounded p-2 text-xs text-gray-300">
                      <div className="flex justify-between gap-2 text-gray-400">
                        <span>{event.channel} · {event.direction}{event.template && event.template !== 'none' ? ` · ${event.template}` : ''}</span>
                        <span>{formatDate(event.sentAt)}</span>
                      </div>
                      {event.subject && <p className="text-white mt-1">{event.subject}</p>}
                      <p className="whitespace-pre-wrap mt-1">{event.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2 border-t border-gray-700 pt-4">
                <h4 className="text-sm font-medium text-gray-200 flex items-center gap-2">
                  <Mail className="h-4 w-4" /> Send email
                </h4>
                <input
                  type="email"
                  value={outreachTo}
                  onChange={(e) => setOutreachTo(e.target.value)}
                  placeholder="To"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                />
                <select value={template} onChange={(e) => setTemplate(e.target.value)} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm">
                  {Object.entries(TEMPLATE_LABELS).map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
                <textarea
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="Optional extra note"
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                />
                <button
                  onClick={handleSendEmail}
                  disabled={busy}
                  className="w-full px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2"
                >
                  <Send className="h-4 w-4" />
                  Send via Resend
                </button>
              </div>

              <div className="space-y-2 border-t border-gray-700 pt-4">
                <h4 className="text-sm font-medium text-gray-200 flex items-center gap-2">
                  <StickyNote className="h-4 w-4" /> Log note or reply
                </h4>
                <textarea
                  value={manualNote}
                  onChange={(e) => setManualNote(e.target.value)}
                  placeholder="Paste an Instagram reply, call note, etc."
                  rows={3}
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm"
                />
                <div className="flex gap-2">
                  <button onClick={() => handleLogNote(false)} disabled={busy} className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">
                    Save note
                  </button>
                  <button onClick={() => handleLogNote(true)} disabled={busy} className="flex-1 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded text-sm">
                    Log inbound reply
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RightsAdmin;
