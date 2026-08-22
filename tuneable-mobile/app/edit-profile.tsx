import { useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { Redirect, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import axios from 'axios';
import { Screen } from '@/src/components/Screen';
import { LocationAutocomplete } from '@/src/components/LocationAutocomplete';
import { authAPI } from '@/src/api/auth';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
import { hasHomeLocation } from '@/src/lib/onboarding';
import { showToast } from '@/src/stores/toastStore';
import { colors } from '@/src/theme/colors';
import {
  DEFAULT_PROFILE_PIC,
  hasCustomProfilePic,
  type ResolvedLocation,
  type User,
} from '@/src/types/user';

const MAX_PIC_BYTES = 5 * 1024 * 1024;
const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,20}$/;

const SOCIAL_FIELDS = [
  { key: 'instagram', label: 'Instagram', placeholder: 'instagram.com/you' },
  { key: 'facebook', label: 'Facebook', placeholder: 'facebook.com/you' },
  { key: 'soundcloud', label: 'SoundCloud', placeholder: 'soundcloud.com/you' },
  { key: 'spotify', label: 'Spotify', placeholder: 'open.spotify.com/artist/…' },
  { key: 'youtube', label: 'YouTube', placeholder: 'youtube.com/@you' },
  { key: 'twitter', label: 'X / Twitter', placeholder: 'x.com/you' },
] as const;

type SocialKey = (typeof SOCIAL_FIELDS)[number]['key'];

function validateUsername(username: string): string | null {
  const trimmed = username.trim();
  if (!trimmed) return 'Username cannot be empty';
  if (trimmed.length < 3) return 'Username must be at least 3 characters';
  if (trimmed.length > 20) return 'Username must be no more than 20 characters';
  if (!USERNAME_REGEX.test(trimmed)) {
    return 'Username can only contain letters, numbers, underscores, and hyphens';
  }
  return null;
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function locationPayload(
  location: ResolvedLocation | null
): ResolvedLocation | null {
  if (!location) return null;
  if (
    location.placeId ||
    location.city ||
    location.region ||
    location.country ||
    location.display
  ) {
    return location;
  }
  return null;
}

export default function EditProfileScreen() {
  const { user, refreshUser, isAuthenticated, isLoading } = useAuth();
  const [username, setUsername] = useState(user?.username ?? '');
  const [givenName, setGivenName] = useState(user?.givenName ?? '');
  const [familyName, setFamilyName] = useState(user?.familyName ?? '');
  const [cellPhone, setCellPhone] = useState(user?.cellPhone ?? '');
  const [homeLocation, setHomeLocation] = useState<ResolvedLocation | null>(
    user?.homeLocation ?? null
  );
  const [secondaryLocation, setSecondaryLocation] =
    useState<ResolvedLocation | null>(user?.secondaryLocation ?? null);
  const [showSecondary, setShowSecondary] = useState(
    Boolean(locationPayload(user?.secondaryLocation ?? null))
  );
  const [social, setSocial] = useState<Record<SocialKey, string>>({
    instagram: user?.socialMedia?.instagram ?? '',
    facebook: user?.socialMedia?.facebook ?? '',
    soundcloud: user?.socialMedia?.soundcloud ?? '',
    spotify: user?.socialMedia?.spotify ?? '',
    youtube: user?.socialMedia?.youtube ?? '',
    twitter: user?.socialMedia?.twitter ?? '',
  });
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPic, setUploadingPic] = useState(false);
  const [removingPic, setRemovingPic] = useState(false);
  const [previewPic, setPreviewPic] = useState<string | null>(null);

  const picBusy = uploadingPic || removingPic;
  const busy = saving || picBusy;
  const displayedPic =
    previewPic || user?.profilePic || DEFAULT_PROFILE_PIC;
  const canRemovePic = hasCustomProfilePic(previewPic || user?.profilePic);

  const usernameHint = useMemo(() => {
    if (usernameError) return usernameError;
    if (username.trim() && username.trim() !== user?.username && !validateUsername(username)) {
      return 'Username looks good';
    }
    return null;
  }, [username, usernameError, user?.username]);

  if (!isLoading && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  const onUsernameChange = (value: string) => {
    setUsername(value);
    setUsernameError(null);
    if (value.trim() && value.trim() !== user?.username) {
      setUsernameError(validateUsername(value));
    }
  };

  const pickAndUpload = async (source: 'library' | 'camera') => {
    try {
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      if (asset.fileSize && asset.fileSize > MAX_PIC_BYTES) {
        showToast('Image must be less than 5MB', 'error');
        return;
      }

      const mime = asset.mimeType || 'image/jpeg';
      const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
      const name =
        asset.fileName && /\.(jpe?g|png|webp|heic)$/i.test(asset.fileName)
          ? asset.fileName
          : `profile.${ext}`;

      setUploadingPic(true);
      setError(null);
      setPreviewPic(asset.uri);
      await authAPI.uploadProfilePic({
        uri: asset.uri,
        name,
        mimeType: mime,
      });
      await refreshUser();
      setPreviewPic(null);
      showToast('Profile picture updated');
    } catch (err) {
      setPreviewPic(null);
      showToast(getApiErrorMessage(err, 'Failed to upload profile picture'), 'error');
    } finally {
      setUploadingPic(false);
    }
  };

  const onChangePhoto = () => {
    Alert.alert('Profile picture', 'Choose a new photo', [
      {
        text: 'Photo library',
        onPress: () => void pickAndUpload('library'),
      },
      {
        text: 'Take photo',
        onPress: () => {
          void (async () => {
            const permission = await ImagePicker.requestCameraPermissionsAsync();
            if (!permission.granted) {
              showToast('Camera access is needed to take a profile photo.', 'error');
              return;
            }
            await pickAndUpload('camera');
          })();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const onRemovePhoto = () => {
    Alert.alert(
      'Remove photo?',
      'Your profile will use the default avatar.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setRemovingPic(true);
              setError(null);
              try {
                await authAPI.removeProfilePic();
                setPreviewPic(DEFAULT_PROFILE_PIC);
                await refreshUser();
                showToast('Profile picture removed');
              } catch (err) {
                showToast(
                  getApiErrorMessage(err, 'Failed to remove profile picture'),
                  'error'
                );
              } finally {
                setRemovingPic(false);
              }
            })();
          },
        },
      ]
    );
  };

  const onSave = async () => {
    const usernameValidation = validateUsername(username);
    if (usernameValidation) {
      setUsernameError(usernameValidation);
      setError(usernameValidation);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const payload: Partial<User> = {
        username: username.trim(),
        givenName: givenName.trim(),
        familyName: familyName.trim(),
        cellPhone: cellPhone.trim(),
        socialMedia: {
          instagram: blankToNull(social.instagram),
          facebook: blankToNull(social.facebook),
          soundcloud: blankToNull(social.soundcloud),
          spotify: blankToNull(social.spotify),
          youtube: blankToNull(social.youtube),
          twitter: blankToNull(social.twitter),
        },
      };
      const nextHome = locationPayload(homeLocation);
      if (nextHome) payload.homeLocation = nextHome;
      payload.secondaryLocation = showSecondary
        ? locationPayload(secondaryLocation)
        : null;

      await authAPI.updateProfile(payload);
      await refreshUser();
      showToast('Profile updated');
      router.back();
    } catch (err) {
      const message = getApiErrorMessage(err, 'Failed to update profile');
      if (
        axios.isAxiosError(err) &&
        (err.response?.data as { field?: string } | undefined)?.field === 'username'
      ) {
        setUsernameError(message);
      }
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} hitSlop={8} disabled={busy}>
            <Text style={styles.back}>← Back</Text>
          </Pressable>
          <Pressable
            onPress={() => void onSave()}
            disabled={busy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Save profile">
            {saving ? (
              <ActivityIndicator color={colors.accentLight} />
            ) : (
              <Text style={styles.saveTop}>Save</Text>
            )}
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <Text style={styles.title}>Edit profile</Text>

          <View style={styles.photoRow}>
            <View style={styles.avatarWrap}>
              <Pressable
                onPress={onChangePhoto}
                disabled={busy}
                accessibilityRole="button"
                accessibilityLabel="Change profile picture">
                <Image source={{ uri: displayedPic }} style={styles.avatar} />
                <View style={styles.cameraBadge}>
                  {picBusy ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Ionicons name="camera" size={14} color="#fff" />
                  )}
                </View>
              </Pressable>
            </View>
            <View style={styles.photoActions}>
              <Pressable
                style={styles.photoBtn}
                onPress={onChangePhoto}
                disabled={busy}>
                <Text style={styles.photoBtnText}>
                  {canRemovePic ? 'Change photo' : 'Add photo'}
                </Text>
              </Pressable>
              {canRemovePic ? (
                <Pressable
                  style={styles.removeBtn}
                  onPress={onRemovePhoto}
                  disabled={busy}>
                  <Text style={styles.removeBtnText}>Remove</Text>
                </Pressable>
              ) : null}
              <Text style={styles.hint}>JPG or PNG, up to 5MB.</Text>
            </View>
          </View>

          <Field label="Username">
            <TextInput
              style={[styles.input, usernameError ? styles.inputError : null]}
              value={username}
              onChangeText={onUsernameChange}
              autoCapitalize="none"
              autoCorrect={false}
              editable={!busy}
              placeholder="username"
              placeholderTextColor={colors.textMuted}
            />
            {usernameHint ? (
              <Text
                style={
                  usernameError ? styles.errorHint : styles.successHint
                }>
                {usernameHint}
              </Text>
            ) : (
              <Text style={styles.hint}>
                3–20 characters, letters, numbers, underscores, and hyphens
              </Text>
            )}
          </Field>

          <View style={styles.row2}>
            <Field label="First name" style={styles.flex}>
              <TextInput
                style={styles.input}
                value={givenName}
                onChangeText={setGivenName}
                editable={!busy}
                autoCapitalize="words"
                placeholder="First name"
                placeholderTextColor={colors.textMuted}
              />
            </Field>
            <Field label="Last name" style={styles.flex}>
              <TextInput
                style={styles.input}
                value={familyName}
                onChangeText={setFamilyName}
                editable={!busy}
                autoCapitalize="words"
                placeholder="Last name"
                placeholderTextColor={colors.textMuted}
              />
            </Field>
          </View>

          <Field label="Phone number">
            <TextInput
              style={styles.input}
              value={cellPhone}
              onChangeText={setCellPhone}
              editable={!busy}
              keyboardType="phone-pad"
              placeholder="+44 7700 900000"
              placeholderTextColor={colors.textMuted}
            />
          </Field>

          <LocationAutocomplete
            value={homeLocation}
            onChange={setHomeLocation}
            label="Home location"
            disabled={busy}
          />
          {!hasHomeLocation(homeLocation) ? (
            <Text style={styles.hint}>
              Used for local parties and charts. Search for your city.
            </Text>
          ) : null}

          <View style={styles.secondaryHeader}>
            <Text style={styles.label}>Secondary location</Text>
            <Pressable
              onPress={() => {
                if (showSecondary) {
                  setShowSecondary(false);
                  setSecondaryLocation(null);
                } else {
                  setShowSecondary(true);
                }
              }}
              hitSlop={8}
              disabled={busy}>
              <Text style={styles.link}>
                {showSecondary ? 'Remove' : 'Add'}
              </Text>
            </Pressable>
          </View>
          {showSecondary ? (
            <LocationAutocomplete
              value={secondaryLocation}
              onChange={setSecondaryLocation}
              label=""
              placeholder="Search for a secondary location"
              disabled={busy}
            />
          ) : (
            <Text style={styles.hint}>Optional — another city you care about.</Text>
          )}

          <Text style={styles.sectionTitle}>Social links</Text>
          {SOCIAL_FIELDS.map((field) => (
            <Field key={field.key} label={field.label}>
              <TextInput
                style={styles.input}
                value={social[field.key]}
                onChangeText={(value) =>
                  setSocial((prev) => ({ ...prev, [field.key]: value }))
                }
                editable={!busy}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholder={field.placeholder}
                placeholderTextColor={colors.textMuted}
              />
            </Field>
          ))}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.saveBtn, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={() => void onSave()}>
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveBtnText}>Save changes</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  back: {
    color: colors.accentLight,
    fontSize: 15,
    fontWeight: '600',
  },
  saveTop: {
    color: colors.accentLight,
    fontSize: 16,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 16,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 4,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarWrap: {
    width: 88,
    height: 88,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  cameraBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.gradientStart,
  },
  photoActions: {
    flex: 1,
    gap: 8,
  },
  photoBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(147, 51, 234, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  photoBtnText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  removeBtn: {
    alignSelf: 'flex-start',
  },
  removeBtnText: {
    color: '#fca5a5',
    fontWeight: '600',
    fontSize: 14,
  },
  field: {
    gap: 8,
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 16,
  },
  inputError: {
    borderColor: '#ef4444',
  },
  row2: {
    flexDirection: 'row',
    gap: 12,
  },
  secondaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  link: {
    color: colors.accentLight,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  errorHint: {
    color: '#fca5a5',
    fontSize: 13,
  },
  successHint: {
    color: '#86efac',
    fontSize: 13,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
  saveBtn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
