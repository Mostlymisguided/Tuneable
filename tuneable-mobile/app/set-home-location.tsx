import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { LocationAutocomplete } from '@/src/components/LocationAutocomplete';
import { authAPI } from '@/src/api/auth';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
import {
  getCurrentLocationStatus,
  refreshCurrentLocation,
} from '@/src/lib/currentLocation';
import { formatLocationLabel } from '@/src/lib/location';
import { hasHomeLocation } from '@/src/lib/onboarding';
import { colors } from '@/src/theme/colors';
import type { ResolvedLocation } from '@/src/types/user';

/** Standalone screen to set home location from the dashboard reminder. */
export default function SetHomeLocationScreen() {
  const { user, refreshUser, isAuthenticated, isLoading } = useAuth();
  const [homeLocation, setHomeLocation] = useState<ResolvedLocation | null>(
    user?.homeLocation ?? null
  );
  const [saving, setSaving] = useState(false);
  const [requestingGps, setRequestingGps] = useState(false);
  const [locationFromGps, setLocationFromGps] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = saving || requestingGps;

  if (!isLoading && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  if (!isLoading && user && hasHomeLocation(user.homeLocation)) {
    return <Redirect href="/(tabs)" />;
  }

  const requestDeviceLocation = async () => {
    setRequestingGps(true);
    setError(null);
    try {
      const location = await refreshCurrentLocation({ force: true });
      if (location) {
        setHomeLocation(location);
        setLocationFromGps(true);
        return;
      }
      const status = getCurrentLocationStatus();
      if (status === 'denied') {
        setError(
          'Location access was blocked. Search for your city, or enable it in Settings.'
        );
        return;
      }
      setError('Could not detect your location. Search for your city instead.');
    } finally {
      setRequestingGps(false);
    }
  };

  const onSave = async () => {
    if (!hasHomeLocation(homeLocation)) {
      setError('Pick a home location to continue.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await authAPI.updateProfile({ homeLocation });
      await refreshUser();
      router.replace('/(tabs)');
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to save home location.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Enable location for local charts</Text>
        <Text style={styles.lede}>
          Tips influence charts where you are — at home, and wherever you tip.
          Location is only used while Tuneable is open. Search if GPS isn&apos;t
          home.
        </Text>

        <Pressable
          style={[
            homeLocation?.placeId ? styles.gpsBtnOutline : styles.button,
            busy && styles.buttonDisabled,
          ]}
          disabled={busy}
          onPress={() => void requestDeviceLocation()}>
          {requestingGps ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <View style={styles.gpsBtnInner}>
              <Ionicons
                name="navigate-outline"
                size={18}
                color={homeLocation?.placeId ? colors.accentLight : '#fff'}
              />
              <Text
                style={
                  homeLocation?.placeId ? styles.gpsBtnOutlineText : styles.buttonText
                }>
                {locationFromGps ? 'Detect again' : 'Enable location'}
              </Text>
            </View>
          )}
        </Pressable>

        {locationFromGps && homeLocation ? (
          <Text style={styles.successHint}>
            Detected {formatLocationLabel(homeLocation)}. Confirm below, or
            search if that&apos;s not home.
          </Text>
        ) : null}

        <View style={styles.orRow}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>or search</Text>
          <View style={styles.orLine} />
        </View>

        <LocationAutocomplete
          value={homeLocation}
          onChange={(location) => {
            setLocationFromGps(false);
            setHomeLocation(location);
          }}
          label="Home location"
          disabled={busy}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, busy && styles.buttonDisabled]}
          disabled={busy}
          onPress={() => void onSave()}>
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Save location</Text>
          )}
        </Pressable>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 14,
  },
  back: {
    color: colors.accentLight,
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  lede: {
    color: colors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 4,
  },
  gpsBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  gpsBtnOutline: {
    marginTop: 8,
    backgroundColor: 'transparent',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.5)',
  },
  gpsBtnOutlineText: {
    color: colors.accentLight,
    fontSize: 16,
    fontWeight: '700',
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.cardBorder,
  },
  orText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  successHint: {
    color: '#86efac',
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
  button: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
