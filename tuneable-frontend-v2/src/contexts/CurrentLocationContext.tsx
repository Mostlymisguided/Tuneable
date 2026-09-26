import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import type { ResolvedLocation } from '../utils/locationHelpers';
import {
  dismissCurrentLocationPrompt,
  getCurrentLocationError,
  getCurrentLocationStatus,
  getTipCurrentLocation,
  isCurrentLocationPromptDismissed,
  recheckLocationPermission,
  refreshCurrentLocation,
  subscribeCurrentLocation,
  type CurrentLocationStatus,
} from '../utils/currentLocationCache';

interface CurrentLocationContextType {
  currentLocation: ResolvedLocation | null;
  status: CurrentLocationStatus;
  error: string | null;
  promptDismissed: boolean;
  /** True after the first permission check for this signed-in session. */
  locationChecked: boolean;
  enableCurrentLocation: () => Promise<ResolvedLocation | null>;
  dismissPrompt: () => void;
}

const CurrentLocationContext = createContext<CurrentLocationContextType | undefined>(undefined);

export function useCurrentLocation() {
  const ctx = useContext(CurrentLocationContext);
  if (!ctx) {
    throw new Error('useCurrentLocation must be used within a CurrentLocationProvider');
  }
  return ctx;
}

interface CurrentLocationProviderProps {
  children: ReactNode;
}

export const CurrentLocationProvider: React.FC<CurrentLocationProviderProps> = ({ children }) => {
  const { user } = useAuth();
  const userId = user?.id || user?._id;

  const [currentLocation, setCurrentLocation] = useState<ResolvedLocation | null>(() =>
    getTipCurrentLocation()
  );
  const [status, setStatus] = useState<CurrentLocationStatus>(() => getCurrentLocationStatus());
  const [error, setError] = useState<string | null>(() => getCurrentLocationError());
  const [promptDismissed, setPromptDismissed] = useState(() => isCurrentLocationPromptDismissed());
  const [locationChecked, setLocationChecked] = useState(false);

  useEffect(() => {
    return subscribeCurrentLocation(() => {
      setCurrentLocation(getTipCurrentLocation());
      setStatus(getCurrentLocationStatus());
      setError(getCurrentLocationError());
      setPromptDismissed(isCurrentLocationPromptDismissed());
    });
  }, []);

  useEffect(() => {
    if (!userId) {
      setLocationChecked(false);
      return;
    }
    let cancelled = false;
    setLocationChecked(false);
    const run = async () => {
      await recheckLocationPermission();
      if (!cancelled) setLocationChecked(true);
    };
    void run();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void recheckLocationPermission();
      }
    };
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);

  const enableCurrentLocation = useCallback(async () => {
    return refreshCurrentLocation({ force: true });
  }, []);

  const dismissPrompt = useCallback(() => {
    dismissCurrentLocationPrompt();
  }, []);

  return (
    <CurrentLocationContext.Provider
      value={{
        currentLocation,
        status,
        error,
        promptDismissed,
        locationChecked,
        enableCurrentLocation,
        dismissPrompt,
      }}
    >
      {children}
    </CurrentLocationContext.Provider>
  );
};
