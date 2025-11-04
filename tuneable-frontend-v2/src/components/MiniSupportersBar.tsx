import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DEFAULT_PROFILE_PIC } from '../constants';
import { penceToPounds } from '../utils/currency';

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
}

const MiniSupportersBar: React.FC<MiniSupportersBarProps> = ({ bids = [], maxVisible = 5, scrollable = true }) => {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);

  const supporters = useMemo(() => {
    const map: Record<string, {
      user: NonNullable<Bid['userId']>;
      total: number;
      count: number;
    }> = {};

    for (const b of bids) {
      const u = b?.userId;
      if (!u?.username) continue;
      const id = u.uuid || u._id || u.id || u.username;
      const amt = (typeof b?.amount === 'number' ? b.amount : (b as any)?._doc?.amount) || 0;
      if (!map[id]) map[id] = { user: u, total: 0, count: 0 };
      map[id].total += amt;
      map[id].count += 1;
    }

    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [bids]);

  if (supporters.length === 0) return null;

  const visible = expanded || scrollable ? supporters : supporters.slice(0, maxVisible);
  const moreCount = supporters.length - maxVisible;

  return (
    <div className="mt-2">
      <div className={scrollable ? 'flex gap-2 overflow-x-auto py-1' : 'flex flex-wrap gap-2'}>
        {visible.map((s) => {
          const id = s.user.uuid || s.user._id || s.user.id || s.user.username;
          return (
            <button
              key={id}
              onClick={() => navigate(`/user/${id}`)}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-black/25 border border-white/10 hover:border-purple-400 transition-colors flex-shrink-0"
              title={`${penceToPounds(s.total)} (${s.count} bids)`}
            >
              <img
                src={s.user.profilePic || DEFAULT_PROFILE_PIC}
                alt={s.user.username}
                className="h-6 w-6 rounded-full object-cover flex-shrink-0"
                onError={(e) => {
                  e.currentTarget.src = DEFAULT_PROFILE_PIC;
                }}
              />
              <span className="text-sm text-white whitespace-nowrap">{s.user.username}</span>
              <span className="text-xs text-green-300 flex-shrink-0">{penceToPounds(s.total)}</span>
            </button>
          );
        })}

        {!scrollable && moreCount > 0 && !expanded && (
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


