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
import { Screen } from '@/src/components/Screen';
import { LocationAutocomplete } from '@/src/components/LocationAutocomplete';
import { authAPI } from '@/src/api/auth';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
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
  const [error, setError] = useState<string | null>(null);

  if (!isLoading && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  if (!isLoading && user && hasHomeLocation(user.homeLocation)) {
    return <Redirect href="/(tabs)" />;
  }

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
        <Text style={styles.title}>Where are you based?</Text>
        <Text style={styles.lede}>
          Your home location connects you to local parties and charts.
        </Text>

        <LocationAutocomplete
          value={homeLocation}
          onChange={setHomeLocation}
          label="Home location"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.button, saving && styles.buttonDisabled]}
          disabled={saving}
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
