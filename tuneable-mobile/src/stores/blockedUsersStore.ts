import { create } from 'zustand';
import { userAPI, type BlockedUser } from '@/src/api/user';

function collectIds(entry: BlockedUser): string[] {
  return [entry.id, entry.uuid, entry._id, entry.username]
    .filter((value): value is string => Boolean(value && String(value).trim()))
    .map((value) => String(value));
}

type BlockedUsersState = {
  ids: string[];
  load: () => Promise<void>;
  markBlocked: (userId: string, extraIds?: Array<string | undefined>) => void;
  markUnblocked: (userId: string, extraIds?: Array<string | undefined>) => void;
  isBlocked: (...candidates: Array<string | undefined | null>) => boolean;
  clear: () => void;
};

export const useBlockedUsersStore = create<BlockedUsersState>((set, get) => ({
  ids: [],
  load: async () => {
    try {
      const { blocked } = await userAPI.getBlockedUsers();
      const next = new Set<string>();
      for (const entry of blocked ?? []) {
        collectIds(entry).forEach((id) => next.add(id));
      }
      set({ ids: [...next] });
    } catch {
      // Blocking is optional for offline/first-launch; keep last known list.
    }
  },
  markBlocked: (userId, extraIds = []) => {
    const next = new Set(get().ids);
    [userId, ...extraIds].filter(Boolean).forEach((id) => next.add(String(id)));
    set({ ids: [...next] });
  },
  markUnblocked: (userId, extraIds = []) => {
    const remove = new Set(
      [userId, ...extraIds].filter(Boolean).map((id) => String(id))
    );
    set({ ids: get().ids.filter((id) => !remove.has(id)) });
  },
  isBlocked: (...candidates) => {
    const ids = get().ids;
    if (!ids.length) return false;
    return candidates.some((value) => Boolean(value && ids.includes(String(value))));
  },
  clear: () => set({ ids: [] }),
}));

export function isUserBlocked(
  user?: {
    id?: string;
    uuid?: string;
    _id?: string;
    username?: string;
  } | null
): boolean {
  if (!user) return false;
  return useBlockedUsersStore
    .getState()
    .isBlocked(user.id, user.uuid, user._id, user.username);
}
