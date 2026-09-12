import React from 'react';
import {
  RIGHTS_STATUS_HELP,
  RIGHTS_STATUS_LABELS,
  RIGHTS_STATUSES,
  type RightsStatus,
  isRightsStatus,
} from '../utils/rightsStatus';

const STATUS_SELECT_CLASS: Record<RightsStatus, string> = {
  cleared: 'bg-green-700/40 border-green-500/40 text-green-200',
  permitted: 'bg-teal-700/40 border-teal-500/40 text-teal-200',
  pending: 'bg-yellow-700/40 border-yellow-500/40 text-yellow-200',
  disputed: 'bg-red-700/40 border-red-500/40 text-red-200',
};

type Props = {
  value?: string | null;
  onChange: (status: RightsStatus) => void;
  disabled?: boolean;
  id?: string;
};

export default function AdminRightsStatusSelect({
  value,
  onChange,
  disabled,
  id,
}: Props) {
  const status: RightsStatus = isRightsStatus(value) ? value : 'pending';

  return (
    <select
      id={id}
      value={status}
      disabled={disabled}
      title={RIGHTS_STATUS_HELP[status]}
      onChange={(e) => {
        const next = e.target.value;
        if (isRightsStatus(next)) onChange(next);
      }}
      className={`px-2 py-1 rounded-lg border text-xs font-medium focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-60 ${STATUS_SELECT_CLASS[status]}`}
    >
      {RIGHTS_STATUSES.map((entry) => (
        <option key={entry} value={entry}>
          {RIGHTS_STATUS_LABELS[entry]}
        </option>
      ))}
    </select>
  );
}

export function rightsStatusBadgeClass(status?: string | null): string {
  if (status === 'cleared') return 'bg-green-500/20 text-green-400';
  if (status === 'permitted') return 'bg-teal-500/20 text-teal-300';
  if (status === 'disputed') return 'bg-red-500/20 text-red-400';
  return 'bg-yellow-500/20 text-yellow-400';
}
