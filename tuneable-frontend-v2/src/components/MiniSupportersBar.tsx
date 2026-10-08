import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_PROFILE_PIC } from '../constants';
import { penceToPounds } from '../utils/currency';
import { Crown } from 'lucide-react';
import { getUserProfileUrl } from '../utils/profileNavigation';
import { useBlockedUsersStore } from '../stores/blockedUsersStore';

const ANONYMOUS_LABEL = 'Supporter';

interface Bid {
  userId?: {
    _id?: string;
    id?: string;
    uuid?: string;
    username: string;
    profilePic?: string;
    /** Set by the server when either side has blocked the other. */
    anonymous?: boolean;
  };
  amount?: number;
  _doc?: any; // some bids may come via doc wrapper
}

export interface ChampionSupporter {
  totalAmount?: number;
  bidCount?: number;
  user?: {
    _id?: string;
    id?: string;
    uuid?: string;
    username: string;
    profilePic?: string | null;
    anonymous?: boolean;
  };
}

interface MiniSupportersBarProps {
  bids?: Bid[];
  /** Pre-aggregated tip champions (e.g. series-wide). Takes precedence over bids. */
  champions?: ChampionSupporter[];
  maxVisible?: number; // number of supporters shown before scrolling or expand
  scrollable?: boolean; // true → horizontal scroll; false + expandable “+N more” chip
  /** When set, only show the top N tippers (no expand / scroll-all). */
  limit?: number;
  className?: string;
}

const MiniSupportersBar: React.FC<MiniSupportersBarProps> = ({
  bids = [],
  champions,
  maxVisible = 5,
  scrollable = true,
  limit,
  className,
}) => {
  const [expanded, setExpanded] = useState(false);
  const blockedIds = useBlockedUsersStore((s) => s.ids);

  const rawSupporters = useMemo(() => {
    if (champions && champions.length > 0) {
      return champions
        .filter((c) => c.user?.username)
        .map((c) => {
          const user = c.user!;
          return {
            id: String(user.uuid || user._id || user.id || user.username),
            user: {
              _id: user._id,
              id: user.id,
              uuid: user.uuid,
              username: user.username,
              profilePic: user.profilePic || undefined,
              anonymous: user.anonymous,
            },
            total: c.totalAmount || 0,
            count: c.bidCount || 0,
          };
        });
    }

    const map: Record<string, {
      id: string;
      user: NonNullable<Bid['userId']>;
      total: number;
      count: number;
    }> = {};

    for (const b of bids) {
      const u = b?.userId;
      if (!u?.username) continue;
      const id = u.uuid || u._id || u.id || u.username;
      const amt = (typeof b?.amount === 'number' ? b.amount : (b as any)?._doc?.amount) || 0;
      if (!map[id]) map[id] = { id, user: u, total: 0, count: 0 };
      map[id].total += amt;
      map[id].count += 1;
    }

    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [bids, champions]);

  // Blocked supporters stay in place so totals and podium ranks match the chart.
  const supporters = useMemo(() => {
    const blocked = new Set(blockedIds);
    return rawSupporters.map((s) => ({
      ...s,
      anonymous:
        Boolean(s.user.anonymous) ||
        [s.user._id, s.user.id, s.user.uuid, s.user.username].some(
          (value) => Boolean(value && blocked.has(String(value)))
        ),
    }));
  }, [rawSupporters, blockedIds]);

  const podiumRankById = useMemo(() => {
    const m = new Map<string, number>();
    supporters.slice(0, 3).forEach((s, idx) => {
      m.set(s.id, idx + 1);
    });
    return m;
  }, [supporters]);

  if (supporters.length === 0) return null;

  const ranked = typeof limit === 'number' ? supporters.slice(0, Math.max(0, limit)) : supporters;
  const visible =
    typeof limit === 'number'
      ? ranked
      : expanded || scrollable
        ? supporters
        : supporters.slice(0, maxVisible);
  const moreCount = typeof limit === 'number' ? 0 : supporters.length - maxVisible;

  const podiumBadgeStyles = (rank: number) => {
    if (rank === 1) return 'bg-amber-400/15 border-amber-400/30 text-amber-200';
    if (rank === 2) return 'bg-slate-300/10 border-slate-300/25 text-slate-200';
    return 'bg-orange-400/15 border-orange-400/30 text-orange-200';
  };

  return (
    <div className={className ?? 'md:mt-2'}>
      <div className={scrollable && typeof limit !== 'number' ? 'flex gap-2 overflow-x-auto py-1' : 'flex flex-wrap gap-2'}>
        {visible.map((s) => {
          const id = s.id;
          const rank = podiumRankById.get(id);
          const content = (
            <>
              <img
                src={s.anonymous ? DEFAULT_PROFILE_PIC : s.user.profilePic || DEFAULT_PROFILE_PIC}
                alt={s.anonymous ? ANONYMOUS_LABEL : s.user.username}
                className="h-4 w-4 md:h-6 md:w-6 rounded-full object-cover flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_PROFILE_PIC;
                }}
              />
              {rank && (
                <span
                  className={`inline-flex items-center justify-center h-4 w-4 md:h-5 md:w-5 rounded-full border ${podiumBadgeStyles(rank)} flex-shrink-0`}
                  title={`#${rank} tip champion`}
                >
                  <Crown
                    className={`h-2.5 w-2.5 ${
                      rank === 1 ? 'text-amber-200' : rank === 2 ? 'text-slate-200' : 'text-orange-200'
                    }`}
                  />
                </span>
              )}
              <span
                className={`text-[10px] md:text-sm whitespace-nowrap ${s.anonymous ? 'text-gray-400 italic' : 'text-white'}`}
              >
                {s.anonymous ? ANONYMOUS_LABEL : s.user.username}
              </span>
              <span className="text-[10px] md:text-sm text-green-300 flex-shrink-0">{penceToPounds(s.total)}</span>
            </>
          );
          const chipClass =
            'flex items-center gap-1.5 md:gap-2 px-1.5 py-1 md:py-1.5 md:px-2 rounded-lg bg-black/25 transition-colors flex-shrink-0';
          const title = `${penceToPounds(s.total)} (${s.count} tips)`;
          return s.anonymous ? (
            <span key={id} className={chipClass} title={title}>
              {content}
            </span>
          ) : (
            <Link
              key={id}
              to={getUserProfileUrl(s.user)}
              className={`${chipClass} hover:bg-purple-400`}
              title={title}
            >
              {content}
            </Link>
          );
        })}

        {typeof limit !== 'number' && !scrollable && moreCount > 0 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="px-2 py-1.5 rounded-lg bg-black/25 border border-white/10 text-xs text-purple-300 hover:text-white"
          >
            +{moreCount} more
          </button>
        )}
      </div>
    </div>
  );
};

export default MiniSupportersBar;


