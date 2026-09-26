export type RightsStatus = 'cleared' | 'pending' | 'permitted' | 'disputed';

export const RIGHTS_STATUSES: RightsStatus[] = [
  'cleared',
  'pending',
  'permitted',
  'disputed',
];

export const RIGHTS_STATUS_LABELS: Record<RightsStatus, string> = {
  cleared: 'Cleared',
  pending: 'Pending',
  permitted: 'Permitted',
  disputed: 'Disputed',
};

export const RIGHTS_STATUS_HELP: Record<RightsStatus, string> = {
  cleared: 'Rights holder is on Tuneable. Playable; tips go to owners.',
  pending: 'No permission yet. Not playable; tips held until claimed.',
  permitted:
    'Admin has off-platform permission. Playable; tips held until the artist joins and claims.',
  disputed: 'Ownership contested. Not playable.',
};

export function isRightsStatus(value: unknown): value is RightsStatus {
  return RIGHTS_STATUSES.includes(value as RightsStatus);
}
