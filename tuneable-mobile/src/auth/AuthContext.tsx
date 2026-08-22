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
import { setAuthTokenGetter, setUnauthorizedHandler } from '@/src/api/client';
import type { User } from '@/src/types/user';
import {
  clearSession,
  loadToken,
  loadUserJson,
  saveSession,
} from '@/src/auth/storage';
import { useMusicPlayerStore } from '@/src/stores/musicPlayerStore';
import { usePodcastPlayerStore } from '@/src/stores/podcastPlayerStore';
import { syncPushTokenIfGranted } from '@/src/lib/pushNotifications';

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
  }) => Promise<User>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateBalance: (newBalancePence: number) => void;
  handleOAuthCallback: (token: string) => Promise<User>;
  applySession: (token: string, user: User) => Promise<User>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

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
  tokenRef.current = token;

  const logout = useCallback(async () => {
    setToken(null);
    setUser(null);
    await clearSession();
    await useMusicPlayerStore.getState().clear();
    await usePodcastPlayerStore.getState().clear();
  }, []);

  const applySession = useCallback(async (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    await saveSession(newToken, JSON.stringify(newUser));
    void syncPushTokenIfGranted();
    return newUser;
  }, []);

  const deleteAccount = useCallback(async () => {
    await userAPI.deleteAccount();
    await logout();
  }, [logout]);

  useEffect(() => {
    setAuthTokenGetter(() => tokenRef.current);
    setUnauthorizedHandler(() => {
      void logout();
    });
    return () => {
      setAuthTokenGetter(null);
      setUnauthorizedHandler(null);
    };
  }, [logout]);

  useEffect(() => {
    const init = async () => {
      try {
        const storedToken = await loadToken();
        const storedUser = await loadUserJson();
        if (storedToken && storedUser) {
          setToken(storedToken);
          setUser(JSON.parse(storedUser) as User);
          try {
            const { user: fresh } = await authAPI.getProfile();
            setUser(fresh);
            await saveSession(storedToken, JSON.stringify(fresh));
            void syncPushTokenIfGranted();
          } catch {
            await clearSession();
            setToken(null);
            setUser(null);
          }
        }
      } finally {
        setIsLoading(false);
      }
    };
    void init();
  }, []);

  const login = useCallback(async (identifier: string, password: string) => {
    const { token: newToken, user: newUser } = await authAPI.login(
      identifier.trim(),
      password
    );
    return applySession(newToken, newUser);
  }, [applySession]);

  const register = useCallback(
    async (input: {
      username: string;
      email: string;
      password: string;
      parentInviteCode?: string;
    }) => {
      const code = input.parentInviteCode?.trim().toUpperCase();
      const { token: newToken, user: newUser } = await authAPI.register({
        username: input.username.trim(),
        email: input.email.trim(),
        password: input.password,
        ...(code ? { parentInviteCode: code } : {}),
      });
      return applySession(newToken, newUser);
    },
    [applySession]
  );

  const refreshUser = useCallback(async () => {
    const { user: fresh } = await authAPI.getProfile();
    setUser(fresh);
    if (tokenRef.current) {
      await saveSession(tokenRef.current, JSON.stringify(fresh));
    }
  }, []);

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

  const handleOAuthCallback = useCallback(async (oauthToken: string) => {
    setToken(oauthToken);
    try {
      // Temporarily set getter so getProfile uses the new token
      tokenRef.current = oauthToken;
      const { user: fresh } = await authAPI.getProfile();
      setUser(fresh);
      await saveSession(oauthToken, JSON.stringify(fresh));
      void syncPushTokenIfGranted();
      return fresh;
    } catch (error) {
      setToken(null);
      tokenRef.current = null;
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
      updateBalance,
      handleOAuthCallback,
      applySession,
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
      updateBalance,
      handleOAuthCallback,
      applySession,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
