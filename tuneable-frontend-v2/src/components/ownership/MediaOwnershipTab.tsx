import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Plus,
  Trash2,
  Save,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShieldAlert,
  Clock,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { mediaAPI, claimAPI, userAPI } from '../../lib/api';

interface BaseUser {
  _id?: string;
  id?: string;
  uuid?: string;
  username?: string;
  profilePic?: string;
}

export interface OwnershipRecord {
  _id?: string;
  userId?: string;
  owner?: BaseUser | null;
  ownershipPercentage: number;
  role?: string;
  verified?: boolean;
  verifiedAt?: string | null;
  verifiedBy?: BaseUser | null;
  verificationMethod?: string | null;
  verificationNotes?: string | null;
  verificationSource?: string | null;
  addedBy?: BaseUser | null;
  addedAt?: string | null;
  lastUpdatedBy?: BaseUser | null;
  lastUpdatedAt?: string | null;
}

export interface OwnershipClaim {
  _id: string;
  mediaId: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  submittedAt?: string;
  updatedAt?: string;
  claimant?: BaseUser | null;
  reviewer?: BaseUser | null;
  reviewNotes?: string | null;
  proofText?: string | null;
  attachments?: Array<{
    url: string;
    filename?: string;
  }>;
}

export interface OwnershipHistoryEntry {
  _id: string;
  action: string;
  timestamp: string;
  actor?: BaseUser | null;
  summary?: string;
  diff?: Array<{
    field: string;
    from?: string | number | null;
    to?: string | number | null;
  }>;
}

interface MediaOwnershipTabProps {
  mediaId: string;
  canEdit: boolean;
  currentUser?: BaseUser | null;
  mediaTitle?: string;
}

interface OwnershipResponsePayload {
  owners?: OwnershipRecord[];
  claims?: OwnershipClaim[];
  history?: OwnershipHistoryEntry[];
}

interface UserSearchResult extends BaseUser {
  email?: string;
}

const DEFAULT_OWNER_ROW: OwnershipRecord = {
  ownershipPercentage: 0,
  owner: null,
  userId: undefined,
  role: 'creator',
  verified: false,
  verifiedAt: null,
  verifiedBy: null,
  verificationMethod: null,
  verificationNotes: '',
  verificationSource: null,
  addedBy: null,
  addedAt: null,
  lastUpdatedBy: null,
  lastUpdatedAt: null,
};

const OWNER_ROLE_OPTIONS = [
  { value: 'creator', label: 'Creator' },
  { value: 'primary', label: 'Primary (Lead)' },
  { value: 'aux', label: 'Auxiliary' },
  { value: 'publisher', label: 'Publisher' },
  { value: 'label', label: 'Label' },
  { value: 'collective', label: 'Collective' },
];

const extractLocalDate = (iso?: string | null) =>
  iso ? new Date(iso).toISOString().slice(0, 10) : '';
const extractLocalTime = (iso?: string | null) =>
  iso ? new Date(iso).toISOString().slice(11, 16) : '';
const combineDateTime = (date: string, time: string) => {
  if (!date) return null;
  const safeTime = time || '00:00';
  const combined = new Date(`${date}T${safeTime}:00`);
  return Number.isNaN(combined.getTime()) ? null : combined.toISOString();
};

const MediaOwnershipTab: React.FC<MediaOwnershipTabProps> = ({
  mediaId,
  canEdit,
  currentUser,
  mediaTitle,
}) => {
  const formatDiffValue = (value: any) => {
    if (value === null || value === undefined || value === '') {
      return '—';
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value.toString();
    }

    if (typeof value === 'string') {
      return value;
    }

    if (value instanceof Date) {
      return value.toString();
    }

    if (Array.isArray(value)) {
      return value.length === 0 ? '[]' : JSON.stringify(value);
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch (_error) {
        return '[object]';
      }
    }

    return String(value);
  };

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [ownershipRows, setOwnershipRows] = useState<OwnershipRecord[]>([]);
  const [claims, setClaims] = useState<OwnershipClaim[]>([]);
  const [history, setHistory] = useState<OwnershipHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [changeNote, setChangeNote] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const [activeSearchIndex, setActiveSearchIndex] = useState<number | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearchingUsers, setIsSearchingUsers] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const ownershipRowsForDisplay = useMemo(
    () =>
      ownershipRows
        .map((row, originalIndex) => ({ row, originalIndex }))
        .sort((a, b) => (b.row.ownershipPercentage || 0) - (a.row.ownershipPercentage || 0)),
    [ownershipRows]
  );

  const totalOwnership = useMemo(
    () =>
      ownershipRows.reduce((total, row) => total + (isNaN(row.ownershipPercentage) ? 0 : row.ownershipPercentage), 0),
    [ownershipRows]
  );

  const fetchOwnershipData = useCallback(async () => {
    if (!mediaId) return;
    setIsLoading(true);
    setError(null);

    try {
      const response: OwnershipResponsePayload = await mediaAPI.getOwnership(mediaId);
      const owners = response.owners || [];

      setOwnershipRows(
        owners.map((owner) => {
          const ownerEntity =
            (owner as any).owner ||
            (owner as any).ownerUser ||
            (owner as any).user ||
            (owner as any).userId ||
            null;

          const resolvedUserId =
            owner.userId ||
            (typeof ownerEntity === 'string'
              ? ownerEntity
              : ownerEntity?._id || ownerEntity?.id || ownerEntity?.uuid);

          return {
            ...DEFAULT_OWNER_ROW,
            ...owner,
            owner: typeof ownerEntity === 'object' ? ownerEntity : null,
            userId: resolvedUserId,
          };
        })
      );
      setActiveSearchIndex(null);
      setUserSearchQuery('');
      setUserSearchResults([]);

      if (response.claims) {
        setClaims(response.claims);
      } else {
        try {
          const claimsResponse = await claimAPI.getClaimsForMedia(mediaId);
          setClaims(claimsResponse.claims || []);
        } catch (claimsError) {
          console.warn('Unable to fetch ownership claims from API', claimsError);
        }
      }
      setHistory(response.history || []);
      setIsDirty(false);
    } catch (err: any) {
      console.error('Failed to fetch ownership data', err);
      const message = err?.response?.data?.error || 'Unable to load ownership data for this media.';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [mediaId]);

  useEffect(() => {
    fetchOwnershipData();
  }, [fetchOwnershipData]);

  useEffect(() => {
    if (!userSearchQuery || activeSearchIndex === null) {
      setUserSearchResults([]);
      setSearchError(null);
      return;
    }

    let isCancelled = false;
    const handler = setTimeout(async () => {
      setIsSearchingUsers(true);
      setSearchError(null);

      try {
        const response = await userAPI.getAllUsers(10, 0, userSearchQuery);
        if (!isCancelled) {
          setUserSearchResults(response.users || response.data || []);
        }
      } catch (err: any) {
        console.error('User search failed', err);
        if (!isCancelled) {
          const message = err?.response?.data?.error || 'Failed to search users.';
          setSearchError(message);
        }
      } finally {
        if (!isCancelled) {
          setIsSearchingUsers(false);
        }
      }
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(handler);
    };
  }, [userSearchQuery, activeSearchIndex]);

  useEffect(() => {
    if (!canEdit || activeSearchIndex === null) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveSearchIndex(null);
        setUserSearchQuery('');
        setUserSearchResults([]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [canEdit, activeSearchIndex]);

  const handleAddOwner = () => {
    setOwnershipRows((prev) => [...prev, { ...DEFAULT_OWNER_ROW }]);
    setIsDirty(true);
  };

  const handleRemoveOwner = (index: number) => {
    setOwnershipRows((prev) => prev.filter((_, idx) => idx !== index));
    setIsDirty(true);
  };

  const handlePercentageChange = (index: number, value: string) => {
    const numeric = parseFloat(value);
    setOwnershipRows((prev) =>
      prev.map((row, idx) =>
        idx === index
          ? {
              ...row,
              ownershipPercentage: isNaN(numeric) ? 0 : Math.max(0, Math.min(100, Number(numeric.toFixed(2)))),
            }
          : row
      )
    );
    setIsDirty(true);
  };

  const handleVerificationFieldChange = (index: number, field: keyof OwnershipRecord, value: string | BaseUser | null) => {
    setOwnershipRows((prev) =>
      prev.map((row, idx) => {
        if (idx !== index) return row;
        return {
          ...row,
          [field]: value,
        };
      })
    );
    setIsDirty(true);
  };

  const handleSetVerifiedBySelf = (index: number) => {
    if (!currentUser) return;
    const normalized: BaseUser = {
      _id: currentUser._id || currentUser.id || currentUser.uuid,
      id: currentUser.id,
      uuid: currentUser.uuid,
      username: currentUser.username,
      profilePic: currentUser.profilePic,
    };
    setOwnershipRows((prev) =>
      prev.map((row, idx) =>
        idx === index
          ? {
              ...row,
              verifiedBy: normalized,
            }
          : row
      )
    );
    setIsDirty(true);
  };

  const handleSelectUser = (index: number, user: UserSearchResult) => {
    const normalized: BaseUser = {
      _id: user._id || user.id || user.uuid,
      id: user.id,
      uuid: user.uuid,
      username: user.username,
      profilePic: user.profilePic,
    };

    setOwnershipRows((prev) =>
      prev.map((row, idx) =>
        idx === index
          ? {
              ...row,
              owner: normalized,
              userId: normalized._id || normalized.id || normalized.uuid,
            }
          : row
      )
    );
    setActiveSearchIndex(null);
    setUserSearchQuery('');
    setUserSearchResults([]);
    setIsDirty(true);
  };

  const handleSave = async () => {
    if (!canEdit) {
      toast.error('You do not have permission to update ownership.');
      return;
    }

    if (totalOwnership > 100.0001) {
      toast.error('Ownership percentage total cannot exceed 100%.');
      return;
    }

    if (totalOwnership < 99.9999) {
      toast.warn('Ownership percentages do not sum to 100%. Please review before saving.');
    }

    const missingOwners = ownershipRows.some((row) => !row.userId && !row.owner?._id);
    if (missingOwners) {
      toast.error('Each ownership entry must be linked to a user.');
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const payload = {
        owners: ownershipRows.map((row) => ({
          userId: row.userId || row.owner?._id || row.owner?.id || row.owner?.uuid || '',
          ownershipPercentage: row.ownershipPercentage ?? 0,
          role: row.role || 'creator',
          verifiedAt: row.verifiedAt || null,
          verifiedBy: row.verifiedBy?._id || row.verifiedBy?.id || row.verifiedBy?.uuid || null,
          verificationMethod: row.verificationMethod || null,
          verificationNotes: row.verificationNotes || null,
          verificationSource: row.verificationSource || null,
          addedAt: row.addedAt || null,
          addedBy: row.addedBy?._id || row.addedBy?.id || row.addedBy?.uuid || null,
        })),
        note: changeNote?.trim() || undefined,
      };

      await mediaAPI.updateOwnership(mediaId, payload);
      toast.success('Ownership details updated');
      setChangeNote('');
      setIsDirty(false);
      await fetchOwnershipData();
    } catch (err: any) {
      console.error('Failed to save ownership data', err);
      const message = err?.response?.data?.error || 'Failed to update ownership details.';
      setError(message);
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefreshClaims = async () => {
    if (!mediaId) return;
    try {
      const response = await claimAPI.getClaimsForMedia(mediaId);
      if (response?.claims) {
        setClaims(response.claims);
        toast.success('Ownership claims refreshed');
      }
    } catch (err: any) {
      console.error('Failed to refresh claims', err);
      toast.error(err?.response?.data?.error || 'Failed to refresh claims.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Media Ownership</h2>
          <p className="text-sm text-gray-400">
            Manage ownership records for <span className="text-gray-200 font-medium">{mediaTitle || 'this media'}</span>.
          </p>
        </div>
        <button
          onClick={fetchOwnershipData}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm text-gray-200 transition-colors"
        >
          <RefreshCcw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/40 text-red-200 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="bg-black/30 border border-white/10 rounded-xl p-4 md:p-6 shadow-xl shadow-black/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Current Ownership</h3>
            <p className="text-xs text-gray-400">
              Total ownership: <span className="font-medium text-gray-200">{totalOwnership.toFixed(2)}%</span>
            </p>
          </div>
          {canEdit && (
            <button
              onClick={handleAddOwner}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-medium text-white transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Owner
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading ownership data...
          </div>
        ) : ownershipRows.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            No ownership records found. {canEdit ? 'Add the first owner to get started.' : ''}
          </div>
        ) : (
          <div className="space-y-4">
            {ownershipRowsForDisplay.map(({ row, originalIndex }) => (
              <div
                key={row._id || originalIndex}
                className="rounded-lg border border-white/10 bg-black/40 px-4 py-4 md:px-5 md:py-5"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="text-xs uppercase tracking-wide text-gray-500 mb-1 block">Owner</label>
                      <div className="relative">
                        <input
                          type="text"
                          readOnly={!canEdit}
                          onFocus={() => {
                            if (!canEdit) return;
                            setActiveSearchIndex(originalIndex);
                            setUserSearchQuery('');
                          }}
                          value={row.owner?.username || row.userId || ''}
                          placeholder="Select a user..."
                          className={`w-full rounded-lg border border-gray-700 bg-black/60 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60 ${
                            canEdit ? 'cursor-text' : 'cursor-not-allowed opacity-70'
                          }`}
                        />
                        {canEdit && (
                          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs uppercase tracking-wide text-gray-500 mb-1 block">
                          Ownership Percentage
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          disabled={!canEdit}
                          value={row.ownershipPercentage ?? 0}
                          onChange={(e) => handlePercentageChange(originalIndex, e.target.value)}
                          className="w-full rounded-lg border border-gray-700 bg-black/60 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                        <input
                          type="range"
                          min={0}
                          max={100}
                          step={1}
                          disabled={!canEdit}
                          value={row.ownershipPercentage ?? 0}
                          onChange={(e) => handlePercentageChange(originalIndex, e.target.value)}
                          className="mt-2 w-full cursor-pointer"
                        />
                      </div>

                      <div>
                        <label className="text-xs uppercase tracking-wide text-gray-500 mb-1 block">
                          Verified At
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="date"
                            value={extractLocalDate(row.verifiedAt)}
                            onChange={(e) => {
                              const newDate = e.target.value;
                              const currentTime = extractLocalTime(row.verifiedAt);
                              const iso = combineDateTime(newDate, currentTime);
                              handleVerificationFieldChange(originalIndex, 'verifiedAt', iso);
                            }}
                            disabled={!canEdit}
                            className="rounded-lg border border-gray-700 bg-black/60 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                          <input
                            type="time"
                            value={extractLocalTime(row.verifiedAt)}
                            onChange={(e) => {
                              const newTime = e.target.value;
                              const currentDate = extractLocalDate(row.verifiedAt);
                              const iso = combineDateTime(currentDate, newTime);
                              handleVerificationFieldChange(originalIndex, 'verifiedAt', iso);
                            }}
                            disabled={!canEdit}
                            className="rounded-lg border border-gray-700 bg-black/60 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                        </div>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() =>
                              handleVerificationFieldChange(originalIndex, 'verifiedAt', new Date().toISOString())
                            }
                            className="mt-2 inline-flex items-center gap-2 text-xs text-purple-300 hover:text-purple-200 transition-colors"
                          >
                            Set to now
                          </button>
                        )}
                      </div>

                      <div>
                        <label className="text-xs uppercase tracking-wide text-gray-500 mb-1 block">
                          Owner Role
                        </label>
                        <select
                          value={row.role || 'creator'}
                          onChange={(e) => handleVerificationFieldChange(originalIndex, 'role', e.target.value)}
                          disabled={!canEdit}
                          className="w-full rounded-lg border border-gray-700 bg-black/60 px-3 py-2 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {OWNER_ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs uppercase tracking-wide text-gray-500 mb-1 block">
                          Verification Method
                        </label>
                        <input
                          type="text"
                          value={row.verificationMethod || ''}
                          onChange={(e) =>
                            handleVerificationFieldChange(originalIndex, 'verificationMethod', e.target.value || null)
                          }
                          disabled={!canEdit}
                          placeholder="e.g. Contract review, PRO database"
                          className="w-full rounded-lg border border-gray-700 bg-black/60 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </div>

                      <div>
                        <label className="text-xs uppercase tracking-wide text-gray-500 mb-1 block">
                          Verification Notes
                        </label>
                        <input
                          type="text"
                          value={row.verificationNotes || ''}
                          onChange={(e) =>
                            handleVerificationFieldChange(originalIndex, 'verificationNotes', e.target.value || null)
                          }
                          disabled={!canEdit}
                          placeholder="Add any relevant context"
                          className="w-full rounded-lg border border-gray-700 bg-black/60 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs uppercase tracking-wide text-gray-500 mb-1 block">
                          Verified By
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={row.verifiedBy?.username || row.verifiedBy?._id || ''}
                            onChange={(e) =>
                              handleVerificationFieldChange(originalIndex, 'verifiedBy', {
                                ...(row.verifiedBy || {}),
                                username: e.target.value,
                              } as BaseUser)
                            }
                            disabled={!canEdit}
                            placeholder="Verifier username"
                            className="flex-1 rounded-lg border border-gray-700 bg-black/60 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                          />
                          {canEdit && currentUser && (
                            <button
                              type="button"
                              onClick={() => handleSetVerifiedBySelf(originalIndex)}
                              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-medium text-gray-200 transition-colors"
                            >
                              Set to me
                            </button>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="text-xs uppercase tracking-wide text-gray-500 mb-1 block">
                          Verification Source
                        </label>
                        <input
                          type="text"
                          value={row.verificationSource || ''}
                          onChange={(e) =>
                            handleVerificationFieldChange(originalIndex, 'verificationSource', e.target.value || null)
                          }
                          disabled={!canEdit}
                          placeholder="URL or reference"
                          className="w-full rounded-lg border border-gray-700 bg-black/60 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60 disabled:opacity-60 disabled:cursor-not-allowed"
                        />
                      </div>
                    </div>

                    {row.lastUpdatedAt && (
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" />
                        Updated {new Date(row.lastUpdatedAt).toLocaleString()}
                      </div>
                    )}
                  </div>

                  {canEdit && (
                    <div className="flex md:flex-col gap-2">
                      <button
                        onClick={() => handleRemoveOwner(originalIndex)}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-sm font-medium text-red-200 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                        Remove
                      </button>
                    </div>
                  )}
                </div>

                {activeSearchIndex === originalIndex && canEdit && (
                  <div className="relative">
                    <div className="absolute z-20 mt-3 w-full rounded-lg border border-white/10 bg-slate-900/95 backdrop-blur">
                      <div className="p-3 border-b border-white/5">
                        <input
                          value={userSearchQuery}
                          onChange={(e) => setUserSearchQuery(e.target.value)}
                          placeholder="Search by username, email..."
                          className="w-full rounded-md border border-gray-700 bg-black/60 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
                          autoFocus
                        />
                      </div>

                      {isSearchingUsers ? (
                        <div className="flex items-center justify-center py-4 text-gray-400 text-sm">
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          Searching users...
                        </div>
                      ) : searchError ? (
                        <div className="px-4 py-3 text-sm text-red-300">{searchError}</div>
                      ) : userSearchResults.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-gray-400">No users found</div>
                      ) : (
                        <ul className="max-h-60 overflow-y-auto">
                          {userSearchResults.map((user) => (
                            <li key={user._id || user.id || user.uuid}>
                              <button
                                type="button"
                                onClick={() => handleSelectUser(originalIndex, user)}
                                className="w-full px-4 py-3 text-left text-sm text-gray-200 hover:bg-white/5 transition-colors"
                              >
                                <div className="font-medium">{user.username}</div>
                                {user.email && <div className="text-xs text-gray-400">{user.email}</div>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-500 mb-1">
                Change Note <span className="text-gray-500 font-normal">(optional – helps preserve edit history)</span>
              </label>
              <textarea
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                rows={3}
                placeholder="Describe why you are updating ownership (e.g. new contract signed, verified by label)."
                className="w-full rounded-lg border border-gray-700 bg-black/60 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-500/60"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-sm text-gray-400">
                Unsaved changes will be tracked in edit history. Make sure to add a note when updating ownership.
              </div>
              <button
                onClick={handleSave}
                disabled={!canEdit || isSaving || !isDirty}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-sm font-semibold text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:bg-purple-600/90"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-black/30 border border-white/10 rounded-xl p-4 md:p-6 h-full">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-green-400" />
              Ownership Claims
            </h3>
            <button
              onClick={handleRefreshClaims}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-800 hover:bg-gray-700 text-xs text-gray-200 transition-colors"
            >
              <RefreshCcw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>

          {claims.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No ownership claims to review.</div>
          ) : (
            <div className="space-y-3">
              {claims.map((claim) => (
                <div key={claim._id} className="rounded-lg border border-white/10 bg-black/40 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm text-gray-200 font-medium">
                        {claim.claimant?.username || 'Unknown claimant'}
                      </div>
                      <div className="text-xs text-gray-500">
                        Submitted {claim.submittedAt ? new Date(claim.submittedAt).toLocaleString() : '—'}
                      </div>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                        claim.status === 'approved'
                          ? 'bg-green-500/10 text-green-300 border border-green-500/40'
                          : claim.status === 'rejected'
                          ? 'bg-red-500/10 text-red-300 border border-red-500/40'
                          : 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/40'
                      }`}
                    >
                      {claim.status}
                    </span>
                  </div>

                  {claim.proofText && (
                    <p className="mt-3 text-sm text-gray-300 bg-white/5 rounded-lg p-3">{claim.proofText}</p>
                  )}

                  {claim.attachments && claim.attachments.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {claim.attachments.map((attachment, attachmentIndex) => (
                        <a
                          key={attachment.url || attachmentIndex}
                          href={attachment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-purple-300 hover:text-purple-200 underline"
                        >
                          {attachment.filename || `Attachment ${attachmentIndex + 1}`}
                        </a>
                      ))}
                    </div>
                  )}

                  {claim.reviewer && (
                    <div className="mt-3 text-xs text-gray-500">
                      Reviewed by {claim.reviewer.username || claim.reviewer._id}{' '}
                      {claim.updatedAt ? `on ${new Date(claim.updatedAt).toLocaleString()}` : ''}
                    </div>
                  )}

                  {claim.reviewNotes && (
                    <div className="mt-2 text-xs text-gray-400 italic">Notes: {claim.reviewNotes}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-black/30 border border-white/10 rounded-xl p-4 md:p-6 h-full">
          <div className="flex items-center gap-2 mb-4">
            <ShieldAlert className="h-5 w-5 text-blue-400" />
            <h3 className="text-lg font-semibold text-white">Ownership Edit History</h3>
          </div>

          {history.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">No ownership history recorded yet.</div>
          ) : (
            <ol className="space-y-4">
              {history.map((entry) => (
                <li key={entry._id} className="relative pl-6">
                  <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full bg-purple-400" />
                  <div className="text-sm text-gray-200">
                    <span className="font-medium">{entry.actor?.username || 'System'}</span> {entry.action}
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(entry.timestamp).toLocaleString()}
                    {entry.summary ? ` · ${entry.summary}` : ''}
                  </div>
                  {entry.diff && entry.diff.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-gray-300 bg-white/5 rounded-md p-3">
                      {entry.diff.map((diffItem, diffIdx) => (
                        <li key={diffIdx}>
                          <span className="text-gray-400">{diffItem.field}:</span>{' '}
                          <span className="text-red-300">{formatDiffValue(diffItem.from)}</span> →{' '}
                          <span className="text-green-300">{formatDiffValue(diffItem.to)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
};

export default MediaOwnershipTab;

