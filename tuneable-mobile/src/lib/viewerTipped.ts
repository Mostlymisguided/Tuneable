export interface TipViewer {
  _id?: string;
  id?: string;
  uuid?: string;
}

export interface TippableMedia {
  viewerTipped?: boolean;
  tipped?: boolean;
  bids?: Array<{
    status?: string;
    userId?:
      | string
      | {
          _id?: string;
          id?: string;
          uuid?: string;
        }
      | null;
  }>;
}

/** True when the signed-in viewer has an active tip on this media. */
export function viewerHasTipped(
  media: TippableMedia | null | undefined,
  user: TipViewer | null | undefined
): boolean {
  if (!user) return false;
  if (media?.viewerTipped === true || media?.tipped === true) return true;

  const ids = [user._id, user.id, user.uuid].filter(Boolean).map(String);
  if (!ids.length || !media?.bids?.length) return false;
  const idSet = new Set(ids);

  return media.bids.some((bid) => {
    if (bid?.status && bid.status !== 'active') return false;
    const bidder = bid?.userId;
    if (!bidder) return false;
    if (typeof bidder === 'string') return idSet.has(bidder);
    return [bidder._id, bidder.id, bidder.uuid].some(
      (value) => value && idSet.has(String(value))
    );
  });
}
