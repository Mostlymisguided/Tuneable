import React from 'react';
import { penceToPounds } from '../utils/currency';
import type { AmbassadorSummary } from '../types';

const STATUS_COPY: Record<string, string> = {
  active: 'Signups with your code count while this is active. Invite credits are not used. The 3% tip share is unchanged: it still applies only if you are a verified founding creator, and it is not a second commission.',
  paused: 'Ambassador invites are paused. New signups use your invite credits and are not counted. Signups from while you were active stay here.',
  revoked: 'Ambassador status has ended. Signups from while you were active stay on this record. New signups are not counted.',
};

const AmbassadorProgramCard: React.FC<{ ambassador: AmbassadorSummary }> = ({ ambassador }) => {
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
    </div>
  );
};

export default AmbassadorProgramCard;
