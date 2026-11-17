import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { authAPI } from '@/src/api/auth';
import { userAPI } from '@/src/api/user';
import {
  refreshAccessToken,
  revokeStoredSession,
  setAuthTokenGetter,
  setTokenRefreshedHandler,
  setUnauthorizedHandler,
} from '@/src/api/client';
import type { User } from '@/src/types/user';
import {
  clearSession,
  loadRefreshToken,
  loadToken,
  loadUserJson,
  saveSession,
} from '@/src/auth/storage';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { usePodcastPlayerStore } from '@/src/stores/podcastPlayerStore';
import { syncPushTokenIfGranted, unregisterPushOnSignOut } from '@/src/lib/pushNotifications';
import { useBlockedUsersStore } from '@/src/stores/blockedUsersStore';
import { useNotificationStore } from '@/src/stores/notificationStore';

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<User>;
  register: (input: {
    username: string;
    email: string;
    password: string;
    parentInviteCode?: string;
    acceptPasswordWarnings?: boolean;
  }) => Promise<User>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshUser: () => Promise<void>;
  applyUser: (next: User) => Promise<void>;
  updateBalance: (newBalancePence: number) => void;
  handleOAuthCallback: (token: string, refreshToken?: string | null) => Promise<User>;
  applySession: (token: string, user: User, refreshToken?: string | null) => Promise<User>;
  /** Swap in a new JWT for this session, e.g. after a password change. */
  replaceToken: (token: string, refreshToken?: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function isUnauthorized(error: unknown): boolean {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === 401 || status === 403;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const tokenRef = useRef<string | null>(null);

  const logout = useCallback(async () => {
    const accessToken = tokenRef.current;
    const refreshToken = await loadRefreshToken().catch(() => null);
    const pushUnregister = unregisterPushOnSignOut(accessToken);
    const revoke = revokeStoredSession(accessToken, refreshToken).catch(() => undefined);
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    useBlockedUsersStore.getState().clear();
    useNotificationStore.getState().clear();
    // Unload after the stack replace. expo-av teardown during that transition
    // can lock the iOS main thread.
    setTimeout(() => {
      void useMusicPlayerStore.getState().clear().catch(() => undefined);
      void usePodcastPlayerStore.getState().clear().catch(() => undefined);
    }, 800);
    await Promise.race([
      Promise.all([clearSession().catch(() => undefined), pushUnregister, revoke]),
      new Promise<void>((resolve) => {
        setTimeout(resolve, 2000);
      }),
    ]);
  }, []);

  const applySession = useCallback(async (newToken: string, newUser: User, refreshToken?: string | null) => {
    tokenRef.current = newToken;
    setToken(newToken);
    setUser(newUser);
    await saveSession(newToken, JSON.stringify(newUser), refreshToken);
    void syncPushTokenIfGranted(newUser.preferences?.notifications?.push !== false);
    void useBlockedUsersStore.getState().load();
    return newUser;
  }, []);

  const deleteAccount = useCallback(async () => {
    await userAPI.deleteAccount();
    await logout();
  }, [logout]);

  useEffect(() => {
    setAuthTokenGetter(() => tokenRef.current);
    setTokenRefreshedHandler((next) => {
      tokenRef.current = next;
      setToken(next);
    });
    setUnauthorizedHandler(() => {
      void logout();
    });
    return () => {
      setAuthTokenGetter(null);
      setTokenRefreshedHandler(null);
      setUnauthorizedHandler(null);
    };
  }, [logout]);

  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        let storedToken = await loadToken();
        if (!storedToken) {
          storedToken = await refreshAccessToken().catch(() => null);
        }
        if (!storedToken || cancelled) return;
        // The request interceptor reads this ref, not React state. Setting
        // state here does not update the ref before getProfile runs.
        tokenRef.current = storedToken;
        if (cancelled) return;
        setToken(storedToken);

        let cached: User | null = null;
        const storedUser = await loadUserJson();
        if (storedUser) {
          try {
            cached = JSON.parse(storedUser) as User;
            if (!cancelled) setUser(cached);
          } catch {
            cached = null;
          }
        }

        try {
          tokenRef.current = storedToken;
          const { user: fresh } = await authAPI.getProfile();
          if (cancelled) return;
          setUser(fresh);
          await saveSession(storedToken, JSON.stringify(fresh)).catch(() => undefined);
          void syncPushTokenIfGranted(fresh.preferences?.notifications?.push !== false);
          void useBlockedUsersStore.getState().load();
        } catch (error) {
          if (!isUnauthorized(error)) {
            if (cached) {
              void syncPushTokenIfGranted(cached.preferences?.notifications?.push !== false);
              void useBlockedUsersStore.getState().load();
            } else {
              tokenRef.current = null;
              if (!cancelled) setToken(null);
            }
            return;
          }
          tokenRef.current = null;
          if (!cancelled) {
            setToken(null);
            setUser(null);
          }
          useBlockedUsersStore.getState().clear();
          await clearSession().catch(() => undefined);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const { token: newToken, refreshToken, user: newUser } = await authAPI.login(
      identifier.trim(),
      password
    );
    return applySession(newToken, newUser, refreshToken);
  }, [applySession]);

  const register = useCallback(
    async (input: {
      username: string;
      email: string;
      password: string;
      parentInviteCode?: string;
      acceptPasswordWarnings?: boolean;
    }) => {
      const code = input.parentInviteCode?.trim().toUpperCase();
      const { token: newToken, refreshToken, user: newUser } = await authAPI.register({
        username: input.username.trim(),
        email: input.email.trim(),
        password: input.password,
        ...(code ? { parentInviteCode: code } : {}),
        acceptPasswordWarnings: input.acceptPasswordWarnings,
      });
      return applySession(newToken, newUser, refreshToken);
    },
    [applySession]
  );

  const applyUser = useCallback(async (fresh: User) => {
    setUser(fresh);
    if (tokenRef.current) {
      await saveSession(tokenRef.current, JSON.stringify(fresh));
    }
  }, []);

  const replaceToken = useCallback(async (newToken: string, refreshToken?: string | null) => {
    tokenRef.current = newToken;
    setToken(newToken);
    const storedUser = await loadUserJson();
    if (storedUser) {
      await saveSession(newToken, storedUser, refreshToken);
    }
  }, []);

  const refreshUser = useCallback(async () => {
    const { user: fresh } = await authAPI.getProfile();
    await applyUser(fresh);
  }, [applyUser]);

  const updateBalance = useCallback((newBalancePence: number) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, balance: newBalancePence };
      if (tokenRef.current) {
        void saveSession(tokenRef.current, JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const handleOAuthCallback = useCallback(async (oauthToken: string, refreshToken?: string | null) => {
    tokenRef.current = oauthToken;
    setToken(oauthToken);
    try {
      const { user: fresh } = await authAPI.getProfile();
      setUser(fresh);
      await saveSession(oauthToken, JSON.stringify(fresh), refreshToken);
      void syncPushTokenIfGranted(fresh.preferences?.notifications?.push !== false);
      return fresh;
    } catch (error) {
      tokenRef.current = null;
      setToken(null);
      await clearSession();
      throw error;
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout,
      deleteAccount,
      refreshUser,
      applyUser,
      updateBalance,
      handleOAuthCallback,
      applySession,
      replaceToken,
    }),
    [
      user,
      token,
      isLoading,
      login,
      register,
      logout,
      deleteAccount,
      refreshUser,
      applyUser,
      updateBalance,
      handleOAuthCallback,
      applySession,
      replaceToken,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
