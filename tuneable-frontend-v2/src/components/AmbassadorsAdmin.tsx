import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, Users } from 'lucide-react';
import { toast } from '../utils/toast';
import { userAPI } from '../lib/api';
import { penceToPounds } from '../utils/currency';
import LocationAutocomplete from './LocationAutocomplete';
import type { ResolvedLocation } from '../utils/locationHelpers';

type AmbassadorStatus = 'active' | 'paused' | 'revoked';

type AmbassadorRow = {
  userId: string;
  username: string;
  email: string | null;
  artistName: string | null;
  isFoundingCreator: boolean;
  hasInviteCode: boolean;
  status: AmbassadorStatus;
  note: string | null;
  signupCount: number;
  verifiedCreatorCount: number;
  activeWindowCount: number;
  commissionPence: number;
  assignments?: Array<{
    id: string;
    label: string;
    status: 'active' | 'paused' | 'revoked';
    signupCount: number;
    verifiedCreatorCount: number;
    sceneCount: number;
  }>;
};

type Invitee = {
  username: string;
  uuid?: string;
  joinedAt?: string | null;
  countsAsVerifiedCreator?: boolean;
  affiliateWindowActive?: boolean;
  affiliateDaysRemaining?: number;
  commissionPence?: number;
  originalUploadCount?: number;
};

const AmbassadorsAdmin: React.FC<{ onChanged?: () => void }> = ({ onChanged }) => {
  const [collapsed, setCollapsed] = useState(true);
  const [rows, setRows] = useState<AmbassadorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [invitees, setInvitees] = useState<Record<string, Invitee[]>>({});
  const [loadingInvitees, setLoadingInvitees] = useState<string | null>(null);
  const [beatTag, setBeatTag] = useState('');
  const [beatPlace, setBeatPlace] = useState<ResolvedLocation | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await userAPI.getAmbassadors();
      setRows(data.ambassadors || []);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load ambassadors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!collapsed) load();
  }, [collapsed, load]);

  const grant = async () => {
    const who = identifier.trim();
    if (!who) {
      toast.error('Enter a username or email');
      return;
    }
    setSaving(true);
    try {
      const result = await userAPI.setAmbassadorStatus({
        identifier: who,
        status: 'active',
        note,
      });
      toast.success(result.message || 'Ambassador updated');
      setIdentifier('');
      setNote('');
      await load();
      onChanged?.();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update ambassador');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (row: AmbassadorRow, status: AmbassadorStatus) => {
    if (status === 'revoked' && !window.confirm(`Revoke ambassador status for @${row.username}? Past signups stay counted. New ones will not.`)) {
      return;
    }
    setSaving(true);
    try {
      const result = await userAPI.setAmbassadorStatus({
        userId: row.userId,
        status,
        note: row.note || undefined,
      });
      toast.success(result.message || 'Ambassador updated');
      await load();
      onChanged?.();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update ambassador');
    } finally {
      setSaving(false);
    }
  };

  const addBeat = async (userId: string) => {
    if (!beatTag.trim() && !beatPlace?.placeId) {
      toast.error('Choose a tag, a place, or both');
      return;
    }
    setSaving(true);
    try {
      const result = await userAPI.addAmbassadorAssignment(userId, {
        tag: beatTag.trim() || null,
        place: beatPlace?.placeId ? {
          placeId: beatPlace.placeId,
          placeLabel: beatPlace.display || beatPlace.label || beatPlace.city || beatPlace.country || null,
          featureType: beatPlace.featureType || null,
          ancestorIds: beatPlace.ancestorIds || [],
        } : null,
      });
      toast.success(result.message || 'Beat assigned');
      setBeatTag('');
      setBeatPlace(null);
      await load();
      onChanged?.();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to assign beat');
    } finally {
      setSaving(false);
    }
  };

  const updateBeat = async (userId: string, assignmentId: string, status: AmbassadorStatus) => {
    setSaving(true);
    try {
      await userAPI.setAmbassadorAssignmentStatus(userId, assignmentId, status);
      await load();
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to update beat');
    } finally {
      setSaving(false);
    }
  };

  const toggleInvitees = async (userId: string) => {
    if (openId === userId) {
      setOpenId(null);
      return;
    }
    setOpenId(userId);
    if (invitees[userId]) return;
    setLoadingInvitees(userId);
    try {
      const data = await userAPI.getAmbassadorInvitees(userId);
      setInvitees((prev) => ({ ...prev, [userId]: data.invitees || [] }));
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to load invitees');
    } finally {
      setLoadingInvitees(null);
    }
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <button
        type="button"
        onClick={() => setCollapsed((prev) => !prev)}
        className="w-full flex items-center justify-between text-left"
        aria-expanded={!collapsed}
      >
        <h3 className="text-lg font-semibold text-white flex items-center">
          <Users className="h-5 w-5 mr-2" />
          Ambassadors
        </h3>
        {collapsed ? <ChevronDown className="h-5 w-5 text-gray-400" /> : <ChevronUp className="h-5 w-5 text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-gray-400">
            Active ambassadors invite without using invite credits. A signup counts only while they are active. Pausing or revoking does not rewrite past signups. The 3% tip share stays exclusive to verified founding creators.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Username or email"
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400"
            />
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note (optional)"
              maxLength={500}
              className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400"
            />
            <button
              type="button"
              onClick={grant}
              disabled={saving}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg"
            >
              Set active
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-gray-400">Loading ambassadors…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400">No ambassadors yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-gray-400">
                    <th className="py-2 pr-4">User</th>
                    <th className="py-2 pr-4">Status</th>
                    <th className="py-2 pr-4">Signed up</th>
                    <th className="py-2 pr-4">Verified</th>
                    <th className="py-2 pr-4">In window</th>
                    <th className="py-2 pr-4">Earned</th>
                    <th className="py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <React.Fragment key={row.userId}>
                      <tr className="border-t border-gray-700 text-gray-200">
                        <td className="py-3 pr-4">
                          <div className="text-white">@{row.username}</div>
                          <div className="text-xs text-gray-400">
                            {row.email || 'No email'}
                            {row.artistName ? ` · ${row.artistName}` : ''}
                            {row.isFoundingCreator ? ' · Founding' : ''}
                            {!row.hasInviteCode ? ' · No invite code' : ''}
                          </div>
                          {row.note && <div className="text-xs text-gray-500 mt-1">{row.note}</div>}
                          {(row.assignments || []).length > 0 && (
                            <div className="text-xs text-purple-200 mt-1">
                              {(row.assignments || []).map((beat) => beat.label).filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="py-3 pr-4 capitalize">{row.status}</td>
                        <td className="py-3 pr-4 tabular-nums">{row.signupCount}</td>
                        <td className="py-3 pr-4 tabular-nums">{row.verifiedCreatorCount}</td>
                        <td className="py-3 pr-4 tabular-nums">{row.activeWindowCount}</td>
                        <td className="py-3 pr-4">{penceToPounds(row.commissionPence || 0)}</td>
                        <td className="py-3">
                          <div className="flex flex-wrap gap-2">
                            {row.status !== 'active' && (
                              <button type="button" disabled={saving} onClick={() => updateStatus(row, 'active')} className="text-xs text-green-300 hover:text-green-200">Activate</button>
                            )}
                            {row.status !== 'paused' && (
                              <button type="button" disabled={saving} onClick={() => updateStatus(row, 'paused')} className="text-xs text-amber-300 hover:text-amber-200">Pause</button>
                            )}
                            {row.status !== 'revoked' && (
                              <button type="button" disabled={saving} onClick={() => updateStatus(row, 'revoked')} className="text-xs text-red-300 hover:text-red-200">Revoke</button>
                            )}
                            <button type="button" onClick={() => toggleInvitees(row.userId)} className="text-xs text-purple-300 hover:text-purple-200">
                              {openId === row.userId ? 'Hide' : 'Beats'}
                            </button>
                          </div>
                        </td>
                      </tr>
                      {openId === row.userId && (
                        <tr className="border-t border-gray-700/60">
                          <td colSpan={7} className="py-3 space-y-3">
                            <div className="space-y-2">
                              {(row.assignments || []).map((beat) => (
                                <div key={beat.id} className="flex flex-wrap items-center gap-2 text-xs text-gray-300">
                                  <span className="text-white">{beat.label}</span>
                                  <span className="capitalize text-gray-400">{beat.status}</span>
                                  <span>{beat.signupCount} signed up · {beat.verifiedCreatorCount} verified · {beat.sceneCount} in scene</span>
                                  {beat.status !== 'active' && (
                                    <button type="button" disabled={saving} onClick={() => updateBeat(row.userId, beat.id, 'active')} className="text-green-300">Activate</button>
                                  )}
                                  {beat.status !== 'paused' && (
                                    <button type="button" disabled={saving} onClick={() => updateBeat(row.userId, beat.id, 'paused')} className="text-amber-300">Pause</button>
                                  )}
                                  {beat.status !== 'revoked' && (
                                    <button type="button" disabled={saving} onClick={() => updateBeat(row.userId, beat.id, 'revoked')} className="text-red-300">Revoke</button>
                                  )}
                                </div>
                              ))}
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                                <input
                                  type="text"
                                  value={openId === row.userId ? beatTag : ''}
                                  onChange={(e) => setBeatTag(e.target.value)}
                                  placeholder="Tag, e.g. House"
                                  className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400"
                                />
                                <LocationAutocomplete
                                  value={openId === row.userId ? beatPlace : null}
                                  onChange={setBeatPlace}
                                  placeholder="Place"
                                  variant="dark"
                                />
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => addBeat(row.userId)}
                                  className="px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white rounded-lg text-sm"
                                >
                                  Add beat
                                </button>
                              </div>
                            </div>
                            {loadingInvitees === row.userId ? (
                              <p className="text-xs text-gray-400">Loading invitees…</p>
                            ) : (invitees[row.userId] || []).length === 0 ? (
                              <p className="text-xs text-gray-400">No counted signups yet.</p>
                            ) : (
                              <ul className="space-y-1">
                                {(invitees[row.userId] || []).map((invitee) => (
                                  <li key={invitee.uuid || invitee.username} className="text-xs text-gray-300">
                                    @{invitee.username}
                                    {invitee.countsAsVerifiedCreator ? ' · verified creator' : ' · listener'}
                                    {invitee.originalUploadCount ? ` · ${invitee.originalUploadCount} upload${invitee.originalUploadCount === 1 ? '' : 's'}` : ''}
                                    {invitee.affiliateWindowActive ? ` · ${invitee.affiliateDaysRemaining || 0}d left` : ''}
                                    {' · '}
                                    {penceToPounds(invitee.commissionPence || 0)}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AmbassadorsAdmin;
