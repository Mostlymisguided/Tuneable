import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_PROFILE_PIC } from '../constants';
import { penceToPounds } from '../utils/currency';
import { Crown } from 'lucide-react';

interface Bid {
  userId?: {
    _id?: string;
    id?: string;
    uuid?: string;
    username: string;
    profilePic?: string;
  };
  amount?: number;
  _doc?: any; // some bids may come via doc wrapper
}

interface MiniSupportersBarProps {
  bids?: Bid[];
  maxVisible?: number; // number of supporters shown before scrolling or expand
  scrollable?: boolean; // true → horizontal scroll; false + expandable “+N more” chip
  /** When set, only show the top N tippers (no expand / scroll-all). */
  limit?: number;
  className?: string;
}

const MiniSupportersBar: React.FC<MiniSupportersBarProps> = ({
  bids = [],
  maxVisible = 5,
  scrollable = true,
  limit,
  className,
}) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const supporters = useMemo(() => {
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
  }, [bids]);

  if (supporters.length === 0) return null;

  const ranked = typeof limit === 'number' ? supporters.slice(0, Math.max(0, limit)) : supporters;
  const visible =
    typeof limit === 'number'
      ? ranked
      : expanded || scrollable
        ? supporters
        : supporters.slice(0, maxVisible);
  const moreCount = typeof limit === 'number' ? 0 : supporters.length - maxVisible;
  const podiumRankById = useMemo(() => {
    const m = new Map<string, number>();
    supporters.slice(0, 3).forEach((s, idx) => {
      m.set(s.id, idx + 1);
    });
    return m;
  }, [supporters]);

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
          return (
            <button
              key={id}
              onClick={() => navigate(`/user/${id}`)}
              className="flex items-center gap-1.5 md:gap-2 px-1.5 py-1 md:py-1.5 md:px-2 rounded-lg bg-black/25 hover:bg-purple-400 transition-colors flex-shrink-0"
              title={`${penceToPounds(s.total)} (${s.count} tips)`}
            >
              <img
                src={s.user.profilePic || DEFAULT_PROFILE_PIC}
                alt={s.user.username}
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
              <span className="text-[10px] md:text-sm text-white whitespace-nowrap">{s.user.username}</span>
              <span className="text-[10px] md:text-sm text-green-300 flex-shrink-0">{penceToPounds(s.total)}</span>
            </button>
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


