import React, { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react';
import { authAPI, setAuthTokenGetter } from '../lib/api';

// Define types directly to avoid import issues
export interface User {
  id: string;
  _id?: string; // MongoDB ObjectId for internal matching
  uuid?: string; // UUIDv7 for external API
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
  homeLocation?: {
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
    detectedFromIP?: boolean;
  };
  secondaryLocation?: {
    city?: string;
    region?: string;
    country?: string;
    countryCode?: string;
    coordinates?: {
      lat: number;
      lng: number;
    };
  } | null;
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
  oauthVerified?: {
    facebook?: boolean;
    soundcloud?: boolean;
    google?: boolean;
    instagram?: boolean;
  };
  preferences?: {
    theme?: string;
    anonymousMode?: boolean;
    defaultTip?: number; // Default tip amount in pounds (e.g., 0.11 for 11p)
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
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
  parentInviteCode?: string;
  cellPhone?: string;
  givenName?: string;
  familyName?: string;
  homeLocation?: {
    city?: string;
    region?: string;
    country?: string;
  };
  secondaryLocation?: {
    city?: string;
    region?: string;
    country?: string;
  } | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (userData: RegisterData) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateBalance: (newBalance: number) => void;
  handleOAuthCallback: (token: string) => Promise<void>;
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
      if (e.key === 'token' && e.newValue === null) {
        setToken(null);
        setUser(null);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');
      
      if (storedToken && storedUser) {
        try {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
          
          // Verify token is still valid by fetching profile
          const response = await authAPI.getProfile();
          setUser(response.user);
        } catch (error) {
          // Token is invalid, clear storage
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
          setUser(null);
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const response = await authAPI.login(email, password);
      const { token: newToken, user: newUser } = response;
      
      setToken(newToken);
      setUser(newUser);
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));
    } catch (error) {
      throw error;
    }
  };

  const register = async (userData: RegisterData) => {
    try {
      const response = await authAPI.register(userData);
      const { token: newToken, user: newUser } = response;
      
      setToken(newToken);
      setUser(newUser);
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    // Clear web player state on logout
    const { useWebPlayerStore } = require('../stores/webPlayerStore');
    useWebPlayerStore.getState().setCurrentMedia(null);
    useWebPlayerStore.getState().setGlobalPlayerActive(false);
    useWebPlayerStore.getState().setQueue([]);
    // Clear podcast player state on logout
    const { usePodcastPlayerStore } = require('../stores/podcastPlayerStore');
    usePodcastPlayerStore.getState().clear();
  };

  const handleOAuthCallback = async (token: string) => {
    try {
      // Store token first
      setToken(token);
      localStorage.setItem('token', token);
      
      // Fetch user data using the token
      const response = await authAPI.getProfile();
      setUser(response.user);
      localStorage.setItem('user', JSON.stringify(response.user));
    } catch (error) {
      // If fetching user fails, clear the token
      console.error('Failed to fetch user after OAuth:', error);
      setToken(null);
      localStorage.removeItem('token');
      throw error;
    }
  };

  const refreshUser = async () => {
    try {
      const response = await authAPI.getProfile();
      setUser(response.user);
      localStorage.setItem('user', JSON.stringify(response.user));
    } catch (error) {
      console.error('Failed to refresh user data:', error);
    }
  };

  const updateBalance = (newBalance: number) => {
    if (user) {
      const updatedUser = { ...user, balance: newBalance };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  const value: AuthContextType = {
    user,
    token,
    login,
    register,
    logout,
    refreshUser,
    updateBalance,
    handleOAuthCallback,
    isLoading,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
