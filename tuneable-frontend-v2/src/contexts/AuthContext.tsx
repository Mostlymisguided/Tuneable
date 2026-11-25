import React, { createContext, useContext, useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { authAPI, rememberAccessToken, refreshSession, setAuthTokenGetter } from '../lib/api';
import { useBlockedUsersStore } from '../stores/blockedUsersStore';
import { usePodcastPlayerStore } from '../stores/podcastPlayerStore';
import { useWebPlayerStore } from '../stores/webPlayerStore';
import type { ResolvedLocation } from '../utils/locationHelpers';

// Define types directly to avoid import issues
export interface User {
  id: string;
  _id?: string; // MongoDB ObjectId for internal matching
  uuid?: string; // UUIDv7 for external API
  createdAt?: string;
  lastLoginAt?: string;
  username: string;
  email: string;
  profilePic?: string;
  personalInviteCode: string;
  personalInviteCodes?: Array<{
    _id: string;
    code: string;
    label?: string;
    isActive: boolean;
    createdAt: string;
    usageCount: number;
  }>;
  primaryInviteCode?: string;
  balance: number;
  inviteCredits?: number;
  homeLocation?: ResolvedLocation;
  secondaryLocation?: ResolvedLocation | null;
  role: string[];
  isActive: boolean;
  joinedParties?: {
    partyId: string;
    joinedAt: string;
    role: 'partier' | 'host' | 'moderator';
  }[];
  followedParties?: {
    partyId: string;
    followedAt: string;
  }[];
  globalUserAggregateRank?: number;
  globalUserBidAvg?: number;
  globalUserBids?: number;
  emailVerified?: boolean;
  /** False for accounts that only sign in with Google/Facebook/Apple etc. */
  hasPassword?: boolean;
  parentInviteCode?: string | null;
  welcomeCreditOffer?: {
    status: 'eligible' | 'needs_invite' | 'needs_verification' | 'claimed' | 'unavailable';
    amountPence: number;
    remainingPence?: number;
    expiresAt?: string | null;
  };
  oauthVerified?: {
    facebook?: boolean;
    soundcloud?: boolean;
    google?: boolean;
    instagram?: boolean;
    apple?: boolean;
    spotify?: boolean;
  };
  preferences?: {
    theme?: string;
    anonymousMode?: boolean;
    favoriteTags?: string[];
    notifications?: {
      email?: boolean;
      sms?: boolean;
      types?: {
        bid_received?: boolean;
        bid_outbid?: boolean;
        comment_reply?: boolean;
        tune_bytes_earned?: boolean;
        [key: string]: boolean | undefined;
      };
    };
  };
  onboarding?: {
    completedAt?: string;
    favoriteTagsSelectedAt?: string;
    importPromptSeenAt?: string;
    importSkipped?: boolean;
    notificationsPromptSeenAt?: string;
  };
  creatorProfile?: {
    artistName?: string;
    verificationStatus?: 'unverified' | 'pending' | 'verified' | 'rejected';
    bio?: string;
    genres?: string[];
    roles?: string[];
    website?: string;
    socialMedia?: Record<string, string>;
    label?: string;
    management?: string;
    distributor?: string;
    reviewNotes?: string;
    verifiedBy?: string;
    verifiedAt?: Date;
    submittedAt?: Date;
  };
  /** Founding Creators — status/benefits only, not equity */
  isFoundingCreator?: boolean;
  ambassador?: {
    status?: 'none' | 'active' | 'paused' | 'revoked';
    note?: string | null;
  };
  foundingSeatNumber?: number | null;
  foundingSeatAssignedAt?: string | null;
  foundingUploadQuotaBytes?: number | null;
  foundingUploadUsedBytes?: number | null;
  foundingUploadRemainingBytes?: number | null;
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
  parentInviteCode?: string;
  inviteTag?: string;
  invitePlaceId?: string;
  cellPhone?: string;
  givenName?: string;
  familyName?: string;
  homeLocation?: ResolvedLocation | null;
  secondaryLocation?: ResolvedLocation | null;
  acceptPasswordWarnings?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (identifier: string, password: string) => Promise<User>;
  register: (userData: RegisterData) => Promise<User>;
  logout: () => void;
  refreshUser: () => Promise<User | null>;
  updateBalance: (newBalance: number) => void;
  handleOAuthCallback: (token: string, refreshToken?: string | null) => Promise<User>;
  /** Swap in a new JWT for this session, e.g. after a password change. */
  replaceToken: (token: string, refreshToken?: string | null) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Register token getter so api interceptor uses in-memory token when localStorage
  // was cleared by another tab (fixes "No token provided" on Add Tune etc.)
  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;
  useEffect(() => {
    setAuthTokenGetter(() => tokenRef.current ?? localStorage.getItem('token'));
    return () => setAuthTokenGetter(null);
  }, []);

  // Sync auth state when another tab clears token (e.g. after 401)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'token') {
        if (e.newValue) {
          rememberAccessToken(e.newValue);
          setToken(e.newValue);
        } else {
          rememberAccessToken(null);
          setToken(null);
          setUser(null);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        let storedToken = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        if (!storedToken && localStorage.getItem('refreshToken')) {
          const renewed = await refreshSession().catch(() => false);
          if (renewed) storedToken = localStorage.getItem('token');
        }

        if (storedToken) {
          try {
            rememberAccessToken(storedToken);
            tokenRef.current = storedToken;
            setToken(storedToken);
            if (storedUser) setUser(JSON.parse(storedUser));

            const response = await authAPI.getProfile();
            setUser(response.user);
            localStorage.setItem('user', JSON.stringify(response.user));
          } catch (error) {
            const status = (error as { response?: { status?: number } })?.response?.status;
            if (status === 401 || status === 403) {
              rememberAccessToken(null);
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('user');
              tokenRef.current = null;
              setToken(null);
              setUser(null);
              clearPlayers();
            }
          }
        } else {
          clearPlayers();
        }
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const userKey = user?.uuid || user?._id || user?.id || null;
  useEffect(() => {
    if (userKey) void useBlockedUsersStore.getState().load();
    else useBlockedUsersStore.getState().clear();
  }, [userKey]);

  const clearPlayers = () => {
    useWebPlayerStore.getState().setCurrentMedia(null);
    useWebPlayerStore.getState().setGlobalPlayerActive(false);
    useWebPlayerStore.getState().setQueue([]);
    usePodcastPlayerStore.getState().clear();
  };

  const login = async (identifier: string, password: string): Promise<User> => {
    try {
      const response = await authAPI.login(identifier, password);
      const { token: newToken, refreshToken, user: newUser } = response;
      
      rememberAccessToken(newToken);
      tokenRef.current = newToken;
      setToken(newToken);
      setUser(newUser);
      localStorage.setItem('user', JSON.stringify(newUser));
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
      return newUser;
    } catch (error) {
      throw error;
    }
  };

  const register = async (userData: RegisterData): Promise<User> => {
    try {
      const response = await authAPI.register(userData);
      const { token: newToken, refreshToken, user: newUser } = response;
      
      rememberAccessToken(newToken);
      tokenRef.current = newToken;
      setToken(newToken);
      setUser(newUser);
      localStorage.setItem('user', JSON.stringify(newUser));
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
      return newUser;
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    void authAPI.logoutDevice();
    rememberAccessToken(null);
    tokenRef.current = null;
    setToken(null);
    setUser(null);
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    clearPlayers();
  };

  const handleOAuthCallback = useCallback(async (token: string, refreshToken?: string | null): Promise<User> => {
    try {
      rememberAccessToken(token);
      tokenRef.current = token;
      setToken(token);
      if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
      
      const response = await authAPI.getProfile();
      setUser(response.user);
      localStorage.setItem('user', JSON.stringify(response.user));
      return response.user;
    } catch (error) {
      console.error('Failed to fetch user after OAuth:', error);
      rememberAccessToken(null);
      tokenRef.current = null;
      setToken(null);
      throw error;
    }
  }, []);

  const refreshUser = useCallback(async (): Promise<User | null> => {
    try {
      const response = await authAPI.getProfile();
      setUser(response.user);
      localStorage.setItem('user', JSON.stringify(response.user));
      return response.user;
    } catch (error) {
      console.error('Failed to refresh user data:', error);
      return null;
    }
  }, []);

  // An admin credit (or any other top-up) can land while this tab is open.
  // Reload the wallet when the tab is focused so tips use the current balance.
  useEffect(() => {
    if (!token) return;
    let timer: number | undefined;
    const onVisible = () => {
      if (document.visibilityState === 'hidden') return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void refreshUser();
      }, 300);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.clearTimeout(timer);
    };
  }, [token, refreshUser]);

  const replaceToken = useCallback((newToken: string, refreshToken?: string | null) => {
    rememberAccessToken(newToken);
    tokenRef.current = newToken;
    setToken(newToken);
    if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
  }, []);

  const updateBalance = useCallback((newBalance: number) => {
    setUser((prev) => {
      if (!prev) return prev;
      const updatedUser = { ...prev, balance: newBalance };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      return updatedUser;
    });
  }, []);

  const value: AuthContextType = {
    user,
    token,
    login,
    register,
    logout,
    refreshUser,
    updateBalance,
    handleOAuthCallback,
    replaceToken,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
