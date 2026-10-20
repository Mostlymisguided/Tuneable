import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Copy, MapPin, Tag, Users } from 'lucide-react';
import { penceToPounds } from '../utils/currency';
import { toast } from '../utils/toast';
import { getTagProfilePath } from '../utils/tagNormalizer';
import { getPlaceProfilePath } from '../utils/locationHelpers';
import { getUserProfileUrl } from '../utils/profileNavigation';
import { DEFAULT_PROFILE_PIC } from '../constants';
import type { AmbassadorAssignmentSummary, AmbassadorSummary } from '../types';

type Tab = 'overview' | 'beats' | 'people';

type InvitedPerson = {
  _id?: string;
  id?: string;
  uuid?: string;
  username?: string;
  profilePic?: string;
  givenName?: string;
  familyName?: string;
  createdAt?: string;
  isCreator?: boolean;
  hasOriginalUpload?: boolean;
  originalUploadCount?: number;
  affiliateWindowActive?: boolean;
  affiliateDaysRemaining?: number;
  commissionPence?: number;
  invitedByAmbassador?: boolean;
  inviteContext?: {
    tag?: string | null;
    placeId?: string | null;
    placeLabel?: string | null;
    assignmentIds?: string[];
  };
};

function beatInviteUrl(code: string, tag?: string | null, placeId?: string | null) {
  const params = new URLSearchParams();
  params.set('invite', code);
  if (tag) params.set('tag', tag);
  if (placeId) params.set('place', placeId);
  return `${window.location.origin}/creator/register?${params.toString()}`;
}

function personOnBeat(person: InvitedPerson, beat: AmbassadorAssignmentSummary) {
  const ids = (person.inviteContext?.assignmentIds || []).map(String);
  return ids.includes(String(beat.id));
}

function beatLabel(person: InvitedPerson) {
  return [person.inviteContext?.tag, person.inviteContext?.placeLabel].filter(Boolean).join(' · ');
}

const STATUS_COPY: Record<string, string> = {
  active: 'Signups with your code count while this is active. Invite credits are not used. The 3% tip share is unchanged: it still applies only if you are a verified founding creator, and it is not a second commission.',
  paused: 'Ambassador invites are paused. New signups use your invite credits and are not counted. Signups from while you were active stay here.',
  revoked: 'Ambassador status has ended. Signups from while you were active stay on this record. New signups are not counted.',
};

const tabClass = (active: boolean) =>
  `flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
    active
      ? 'border-purple-500 text-purple-400'
      : 'border-transparent text-gray-400 hover:text-gray-300 hover:border-gray-300'
  }`;

const AmbassadorDashboard: React.FC<{
  ambassador: AmbassadorSummary;
  inviteCode?: string | null;
  invitedUsers: InvitedPerson[];
  loading?: boolean;
  isFoundingCreator?: boolean;
}> = ({ ambassador, inviteCode, invitedUsers, loading = false, isFoundingCreator = false }) => {
  const [tab, setTab] = useState<Tab>('overview');
  const [beatFilter, setBeatFilter] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const beats = ambassador.assignments || [];

  const people = useMemo(() => {
    if (!beatFilter) return invitedUsers;
    const beat = beats.find((entry) => entry.id === beatFilter);
    if (!beat) return invitedUsers;
    return invitedUsers.filter((person) => personOnBeat(person, beat));
  }, [beatFilter, beats, invitedUsers]);

  const copyBeat = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(id);
      toast.success('Invite link copied');
      window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error('Could not copy invite link');
    }
  };

  const stats = [
    { label: 'Signed up', value: ambassador.signupCount.toLocaleString() },
    { label: 'Verified creators', value: ambassador.verifiedCreatorCount.toLocaleString() },
    {
      label: 'In reward window',
      value: ambassador.activeWindowCount.toLocaleString(),
      detail: `${penceToPounds(ambassador.commissionPence || 0)} earned`,
    },
  ];

  return (
    <div className="mb-8">
      <div className="bg-gray-800 border-b border-gray-700 rounded-t-lg">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-center">
            <Award className="hidden md:inline h-6 w-6 text-purple-400 mr-3" />
            <h2 className="text-xl font-semibold text-white">Ambassador Dashboard</h2>
            {ambassador.status !== 'active' && (
              <span className="ml-3 text-xs uppercase tracking-wide text-amber-200">{ambassador.status}</span>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-800 border-b border-gray-700">
        <div className="px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8">
            <button type="button" onClick={() => setTab('overview')} className={tabClass(tab === 'overview')}>
              Overview
            </button>
            <button type="button" onClick={() => setTab('beats')} className={tabClass(tab === 'beats')}>
              <Tag className="hidden md:inline h-4 w-4 mr-2" />
              Beats
            </button>
            <button type="button" onClick={() => setTab('people')} className={tabClass(tab === 'people')}>
              <Users className="hidden md:inline h-4 w-4 mr-2" />
              People
              <span className="ml-2 text-xs text-gray-500">{invitedUsers.length}</span>
            </button>
          </nav>
        </div>
      </div>

      <div className="bg-gray-800 rounded-b-lg p-6">
        {tab === 'overview' && (
          <div className="space-y-4">
            <p className="text-sm text-gray-300 max-w-3xl">{STATUS_COPY[ambassador.status] || STATUS_COPY.active}</p>
            {ambassador.note && <p className="text-xs text-gray-500">Note: {ambassador.note}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {stats.map((stat) => (
                <div key={stat.label} className="bg-gray-900 rounded-lg p-4">
                  <p className="text-sm text-gray-400">{stat.label}</p>
                  <p className="text-2xl font-bold text-white mt-1 tabular-nums">{stat.value}</p>
                  {stat.detail && (
                    isFoundingCreator ? (
                      <Link to="/artist-escrow" className="text-xs text-indigo-300 mt-1 inline-block hover:text-indigo-200">
                        {stat.detail}
                      </Link>
                    ) : (
                      <p className="text-xs text-indigo-300 mt-1">{stat.detail}</p>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'beats' && (
          beats.length === 0 ? (
            <p className="text-sm text-gray-400">
              An admin has not assigned a scene yet. Signups with your code still count on Overview.
            </p>
          ) : (
            <ul className="space-y-3">
              {beats.map((beat) => {
                const url = inviteCode ? beatInviteUrl(inviteCode, beat.tag, beat.placeId) : '';
                const tagPath = beat.tag ? getTagProfilePath(beat.tag) : null;
                const placePath = getPlaceProfilePath(beat.placeId);
                return (
                  <li key={beat.id} className="bg-gray-900 rounded-lg p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div>
                        <p className="text-white font-medium">
                          {beat.label}
                          {beat.status !== 'active' && (
                            <span className="ml-2 text-xs uppercase text-amber-200">{beat.status}</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {beat.signupCount} signed up · {beat.verifiedCreatorCount} verified · {beat.activeWindowCount} in window · {penceToPounds(beat.commissionPence || 0)}
                          {' · '}{beat.sceneCount} of your invitees {beat.sceneCount === 1 ? 'is' : 'are'} in this scene
                        </p>
                        <div className="flex flex-wrap gap-3 mt-2 text-xs">
                          {tagPath && (
                            <Link to={tagPath} className="inline-flex items-center gap-1 text-purple-300 hover:text-purple-200">
                              <Tag className="h-3 w-3" />
                              {beat.tag}
                            </Link>
                          )}
                          {placePath && (
                            <Link to={placePath} className="inline-flex items-center gap-1 text-blue-300 hover:text-blue-200">
                              <MapPin className="h-3 w-3" />
                              {beat.placeLabel || 'Place'}
                            </Link>
                          )}
                        </div>
                      </div>
                      {url && beat.status === 'active' && ambassador.status === 'active' && (
                        <button
                          type="button"
                          onClick={() => copyBeat(beat.id, url)}
                          className="inline-flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm"
                        >
                          <Copy className="h-4 w-4" />
                          {copiedId === beat.id ? 'Copied' : 'Copy link'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )
        )}

        {tab === 'people' && (
          <div className="space-y-4">
            {beats.length > 1 && (
              <select
                value={beatFilter}
                onChange={(event) => setBeatFilter(event.target.value)}
                className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
              >
                <option value="">All beats</option>
                {beats.map((beat) => (
                  <option key={beat.id} value={beat.id}>{beat.label}</option>
                ))}
              </select>
            )}
            {loading ? (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-400"></div>
              </div>
            ) : people.length === 0 ? (
              <p className="text-sm text-gray-400">
                {beatFilter ? 'Nobody counted on this beat yet.' : 'No one has signed up with your invite code yet.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {people.map((person) => {
                  const joined = person.createdAt ? new Date(person.createdAt).toLocaleDateString() : '';
                  const scene = beatLabel(person);
                  return (
                    <li key={person._id || person.uuid || person.username} className="flex items-center gap-3 bg-gray-900 rounded-lg px-4 py-3">
                      <img
                        src={person.profilePic || DEFAULT_PROFILE_PIC}
                        alt=""
                        className="h-10 w-10 rounded-full object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <Link to={getUserProfileUrl(person)} className="text-white font-medium hover:text-purple-300">
                          {person.username}
                        </Link>
                        <p className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                          {joined && <span>Joined {joined}</span>}
                          <span>
                            {person.isCreator ? 'Creator' : 'Listener'}
                            {person.hasOriginalUpload ? ` · ${person.originalUploadCount} upload${person.originalUploadCount === 1 ? '' : 's'}` : ''}
                          </span>
                          {person.affiliateWindowActive ? (
                            <span>{person.affiliateDaysRemaining}d left</span>
                          ) : (
                            <span>Window ended</span>
                          )}
                          <span>{penceToPounds(person.commissionPence || 0)} earned</span>
                          {person.invitedByAmbassador && <span className="text-purple-300">Counted</span>}
                          {scene && <span>{scene}</span>}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AmbassadorDashboard;
