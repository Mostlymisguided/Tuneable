import React, { useState } from 'react';
import { Copy } from 'lucide-react';
import { penceToPounds } from '../utils/currency';
import { toast } from '../utils/toast';
import type { AmbassadorSummary } from '../types';

function beatInviteUrl(code: string, tag?: string | null, placeId?: string | null) {
  const params = new URLSearchParams();
  params.set('invite', code);
  if (tag) params.set('tag', tag);
  if (placeId) params.set('place', placeId);
  return `${window.location.origin}/creator/register?${params.toString()}`;
}

const STATUS_COPY: Record<string, string> = {
  active: 'Signups with your code count while this is active. Invite credits are not used. The 3% tip share is unchanged: it still applies only if you are a verified founding creator, and it is not a second commission.',
  paused: 'Ambassador invites are paused. New signups use your invite credits and are not counted. Signups from while you were active stay here.',
  revoked: 'Ambassador status has ended. Signups from while you were active stay on this record. New signups are not counted.',
};

const AmbassadorProgramCard: React.FC<{ ambassador: AmbassadorSummary; inviteCode?: string | null }> = ({ ambassador, inviteCode }) => {
  const copy = STATUS_COPY[ambassador.status] || STATUS_COPY.active;
  const stats = [
    { label: 'Signed up', value: ambassador.signupCount.toLocaleString() },
    { label: 'Verified creators', value: ambassador.verifiedCreatorCount.toLocaleString() },
    {
      label: 'In reward window',
      value: ambassador.activeWindowCount.toLocaleString(),
      detail: `${penceToPounds(ambassador.commissionPence || 0)} earned`,
    },
  ];

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const beats = ambassador.assignments || [];

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

  return (
    <div className="bg-black/30 border border-purple-500/30 rounded-lg p-4 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-purple-200">
            Ambassador
            {ambassador.status !== 'active' && (
              <span className="ml-2 text-xs uppercase tracking-wide text-amber-200">{ambassador.status}</span>
            )}
          </p>
          <p className="text-xs text-gray-400 mt-1 max-w-3xl">{copy}</p>
          {ambassador.note && (
            <p className="text-xs text-gray-500 mt-1">Note: {ambassador.note}</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-black/40 rounded-lg px-3 py-2">
            <p className="text-xs text-gray-400">{stat.label}</p>
            <p className="text-xl font-semibold text-white tabular-nums">{stat.value}</p>
            {stat.detail && <p className="text-xs text-indigo-300 mt-0.5">{stat.detail}</p>}
          </div>
        ))}
      </div>
      {beats.length > 0 && (
        <ul className="mt-4 space-y-2">
          {beats.map((beat) => {
            const url = inviteCode ? beatInviteUrl(inviteCode, beat.tag, beat.placeId) : '';
            return (
              <li key={beat.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-black/40 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm text-white">
                    {beat.label}
                    {beat.status !== 'active' && (
                      <span className="ml-2 text-xs uppercase text-amber-200">{beat.status}</span>
                    )}
                  </p>
                  <p className="text-xs text-gray-400">
                    {beat.signupCount} signed up · {beat.verifiedCreatorCount} verified · {beat.activeWindowCount} in window · {penceToPounds(beat.commissionPence || 0)}
                    {' · '}{beat.sceneCount} of your invitees {beat.sceneCount === 1 ? 'is' : 'are'} in this scene
                  </p>
                </div>
                {url && beat.status === 'active' && ambassador.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => copyBeat(beat.id, url)}
                    className="inline-flex items-center gap-1 text-xs text-purple-200 hover:text-white"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copiedId === beat.id ? 'Copied' : 'Copy link'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default AmbassadorProgramCard;
