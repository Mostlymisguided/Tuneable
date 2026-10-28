export type CopyAccessStatus = {
  mode?: 'share' | 'pence' | 'closed';
  sharePercent?: number;
  thresholdPence: number | null;
  unlocked: boolean;
  grandfathered: boolean;
};

export function normalizeCopySharePercent(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(1, n));
}

export function copyShareLabel(percent: number): string {
  const share = normalizeCopySharePercent(percent);
  if (share >= 100) return 'Everyone who tips';
  return `Top ${share}%`;
}

export function copyAccessSentence(status: CopyAccessStatus): string {
  if (status.mode === 'closed') {
    if (status.unlocked) return 'You already have a personal copy. New copies are no longer offered.';
    return 'The artist has not offered a personal download.';
  }
  if (status.mode === 'pence') {
    const price = status.thresholdPence != null
      ? `£${(status.thresholdPence / 100).toFixed(2)}`
      : null;
    if (status.unlocked && status.grandfathered) return 'You keep a copy from when the line was lower.';
    if (status.unlocked) return `You can keep a personal copy${price ? `. The unlock is ${price}` : ''}.`;
    return price
      ? `A personal copy unlocks at ${price} in tips on this tune.`
      : 'A personal copy unlocks with a tip on this tune.';
  }
  const share = normalizeCopySharePercent(status.sharePercent);
  if (status.unlocked && status.grandfathered) {
    return 'You keep a copy from when the line was lower.';
  }
  if (status.unlocked) {
    if (share >= 100) {
      return 'You can keep a copy. If the artist raises the line, you keep it.';
    }
    return `You are in the top ${share}%. If the artist raises the line, you keep the copy.`;
  }
  const who = share >= 100 ? 'Everyone who tips can keep a copy' : `The top ${share}% can keep a copy`;
  if (status.thresholdPence != null) {
    return `${who}. The line is £${(status.thresholdPence / 100).toFixed(2)}.`;
  }
  return `${who}. If the artist raises the line, you keep it.`;
}
