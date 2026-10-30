import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import axios from 'axios';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { KeyboardDoneAccessory } from '@/src/components/KeyboardDoneAccessory';
import { Screen } from '@/src/components/Screen';
import { LocationAutocomplete } from '@/src/components/LocationAutocomplete';
import { UploadProgressBar, type UploadPhase } from '@/src/components/UploadProgressBar';
import { mediaAPI, type AudioFileAsset } from '@/src/api/media';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
import {
  AUDIO_PICKER_TYPES,
  getAudioUploadRejection,
} from '@/src/lib/audioUpload';
import { normalizeSources } from '@/src/lib/media';
import {
  buildMediaUpdate,
  copyShareLabel,
  creatorFieldLabel,
  editableLinkFields,
  formFromMedia,
  mediaEditKind,
  type MediaEditForm,
} from '@/src/lib/mediaEdit';
import { canDeleteMedia, canEditMedia, isAdmin } from '@/src/lib/permissions';
import { prepareProfilePhoto } from '@/src/lib/profileImage';
import { showToast } from '@/src/stores/toastStore';
import {
  DEFAULT_LICENCE_CHOICE,
  licenceChoiceFromSaved,
  LicencePicker,
  type LicenceChoice,
} from '@/src/components/LicencePicker';
import { colors } from '@/src/theme/colors';
import { DEFAULT_COVER_ART, type ChartMediaItem } from '@/src/types/media';

const NUMERIC_ACCESSORY_ID = 'edit-media-numeric-done';
const COVER_MAX_BYTES = 5 * 1024 * 1024;

const RIGHTS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'permitted', label: 'Permitted' },
  { value: 'cleared', label: 'Cleared' },
  { value: 'disputed', label: 'Disputed' },
] as const;

function Field({
  label,
  hint,
  children,
  style,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
  style?: ViewStyle;
}) {
  return (
    <View style={[styles.field, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      {children}
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export default function EditMediaScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [media, setMedia] = useState<ChartMediaItem | null>(null);
  const [form, setForm] = useState<MediaEditForm | null>(null);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [audioFile, setAudioFile] = useState<AudioFileAsset | null>(null);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioProgress, setAudioProgress] = useState<{
    phase: UploadPhase;
    loaded: number;
    total: number;
  } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [licenceChoice, setLicenceChoice] = useState<LicenceChoice>(DEFAULT_LICENCE_CHOICE);
  const [licenceSaving, setLicenceSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const profile = await mediaAPI.getProfile(id);
      const next = profile.media;
      if (!next) throw new Error('Media not found');
      setMedia(next);
      setLicenceChoice(licenceChoiceFromSaved(next.licence));
      setForm(formFromMedia(next));
      setCoverUri(next.coverArt || DEFAULT_COVER_ART);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to load media'));
      setMedia(null);
      setForm(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!isLoading && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  const allowed = canEditMedia(user, media);
  const admin = isAdmin(user);
  const kind = media ? mediaEditKind(media) : 'tune';
  const mongoId = media?._id || '';
  const busy = saving || coverBusy || audioBusy || deleting;
  const hasAudio = Boolean(
    media && (normalizeSources(media.sources).upload || media.hasHostedAudio)
  );
  const share = Math.round(Number(form?.copySharePercent));
  const shareLabel = Number.isFinite(share) ? copyShareLabel(Math.min(100, Math.max(1, share))) : '';

  const patch = (partial: Partial<MediaEditForm>) => {
    setForm((prev) => (prev ? { ...prev, ...partial } : prev));
  };

  const onSaveLicence = async () => {
    if (!mongoId) return;
    setLicenceSaving(true);
    setError(null);
    try {
      await mediaAPI.updateMediaLicence(mongoId, licenceChoice);
      showToast('Licence saved');
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not save the licence'));
    } finally {
      setLicenceSaving(false);
    }
  };

  const onSave = async () => {
    if (!form || !media || !mongoId) return;
    const built = buildMediaUpdate(form, media);
    if (built.error || !built.updates) {
      setError(built.error || 'Check the form and try again');
      return;
    }
    if (admin && form.rightsStatus && form.rightsStatus !== media.rightsStatus) {
      built.updates.rightsStatus = form.rightsStatus;
    }
    setSaving(true);
    setError(null);
    try {
      await mediaAPI.updateMedia(mongoId, built.updates);
      showToast('Media updated');
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Failed to update media'));
    } finally {
      setSaving(false);
    }
  };

  const onPickCover = async () => {
    if (!mongoId) return;
    setError(null);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const prepared = await prepareProfilePhoto({
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        fileSize: asset.fileSize,
        mimeType: asset.mimeType,
        fileName: asset.fileName || 'cover.jpg',
      });
      let coverBytes: number | null = null;
      try {
        const file = new File(prepared.uri);
        coverBytes = file.exists && file.size > 0 ? file.size : null;
      } catch {
        coverBytes = null;
      }
      if (coverBytes != null && coverBytes > COVER_MAX_BYTES) {
        setError('Cover image must be under 5MB');
        return;
      }
      setCoverBusy(true);
      const uploaded = await mediaAPI.uploadCoverArt(mongoId, prepared);
      const nextCover = uploaded.coverArt || prepared.uri;
      setCoverUri(nextCover);
      setMedia((prev) => (prev ? { ...prev, coverArt: nextCover } : prev));
      showToast('Cover art updated');
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      setError(
        message.includes('20MB')
          ? 'Cover image must be under 5MB'
          : getApiErrorMessage(err, 'Failed to upload cover art')
      );
    } finally {
      setCoverBusy(false);
    }
  };

  const onRemoveCover = () => {
    if (!mongoId || !coverUri || coverUri === DEFAULT_COVER_ART) return;
    Alert.alert('Remove cover art?', 'The default image will be used instead.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setCoverBusy(true);
            setError(null);
            try {
              const result = await mediaAPI.removeCoverArt(mongoId);
              const nextCover = result.coverArt || DEFAULT_COVER_ART;
              setCoverUri(nextCover);
              setMedia((prev) => (prev ? { ...prev, coverArt: nextCover } : prev));
              showToast('Cover art removed');
            } catch (err) {
              setError(getApiErrorMessage(err, 'Failed to remove cover art'));
            } finally {
              setCoverBusy(false);
            }
          })();
        },
      },
    ]);
  };

  const onPickAudio = async () => {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: AUDIO_PICKER_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const rejection = getAudioUploadRejection(asset.name, asset.mimeType, asset.size);
      if (rejection) {
        setError(rejection);
        return;
      }
      setAudioFile({
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
      });
      setRightsConfirmed(false);
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not open that audio file'));
    }
  };

  const onAttachAudio = async () => {
    if (!audioFile || !mongoId) return;
    if (!rightsConfirmed) {
      setError('Confirm you have the rights to upload this audio');
      return;
    }
    setAudioBusy(true);
    setError(null);
    setAudioProgress({ phase: 'uploading', loaded: 0, total: audioFile.size || 0 });
    try {
      const response = await mediaAPI.attachUpload(
        mongoId,
        audioFile,
        { replaceExisting: hasAudio },
        {
          onUploadProgress: (event) => {
            const total = event.total || audioFile.size || 0;
            const loaded = event.loaded || 0;
            setAudioProgress({
              phase: total > 0 && loaded >= total ? 'processing' : 'uploading',
              loaded,
              total,
            });
          },
        }
      );
      if (response.media) {
        setMedia((prev) =>
          prev
            ? {
                ...prev,
                sources: response.media?.sources ?? prev.sources,
                hasHostedAudio: true,
                rightsStatus: response.media?.rightsStatus ?? prev.rightsStatus,
                rightsCleared: response.media?.rightsCleared ?? prev.rightsCleared,
                isPlayable: response.media?.isPlayable ?? prev.isPlayable,
              }
            : prev
        );
        if (response.media.rightsStatus) {
          patch({ rightsStatus: response.media.rightsStatus });
        }
      }
      setAudioFile(null);
      setRightsConfirmed(false);
      showToast(hasAudio ? 'Audio replaced' : 'Audio added');
    } catch (err) {
      if (!axios.isCancel(err)) {
        setError(getApiErrorMessage(err, 'Failed to upload audio'));
      }
    } finally {
      setAudioBusy(false);
      setAudioProgress(null);
    }
  };

  const onDelete = () => {
    if (!mongoId || !media) return;
    Alert.alert(
      `Delete “${media.title || 'this media'}”?`,
      'It leaves the charts. Active tips are refunded.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setDeleting(true);
              setError(null);
              try {
                await mediaAPI.deleteMedia(mongoId, 'Deleted from the mobile app');
                showToast('Media deleted');
                router.back();
              } catch (err) {
                setError(getApiErrorMessage(err, 'Failed to delete media'));
              } finally {
                setDeleting(false);
              }
            })();
          },
        },
      ]
    );
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
          {form && allowed ? (
            <Pressable
              onPress={() => void onSave()}
              disabled={busy}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Save media">
              {saving ? (
                <ActivityIndicator color={colors.accentLight} />
              ) : (
                <Text style={styles.saveTop}>Save</Text>
              )}
            </Pressable>
          ) : (
            <View />
          )}
        </View>

        {loading && !form ? (
          <ActivityIndicator color={colors.accentLight} style={styles.loader} />
        ) : error && !form ? (
          <View style={styles.centered}>
            <Text style={styles.error}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : form && media && !allowed ? (
          <View style={styles.centered}>
            <Text style={styles.error}>You don’t have permission to edit this.</Text>
          </View>
        ) : form && media ? (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag">
            <Text style={styles.title}>
              Edit{' '}
              {kind === 'book'
                ? 'book'
                : (media.contentForm || []).includes('podcastseries')
                  ? 'show'
                  : kind === 'podcast'
                    ? 'episode'
                    : 'tune'}
            </Text>
            <Text style={styles.subtitle}>{media.title || 'Untitled'}</Text>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.coverRow}>
              <Image source={{ uri: coverUri || DEFAULT_COVER_ART }} style={styles.cover} />
              <View style={styles.coverActions}>
                <Pressable style={styles.photoBtn} onPress={() => void onPickCover()} disabled={busy}>
                  {coverBusy ? (
                    <ActivityIndicator color={colors.text} />
                  ) : (
                    <Text style={styles.photoBtnText}>Upload cover</Text>
                  )}
                </Pressable>
                {coverUri && coverUri !== DEFAULT_COVER_ART ? (
                  <Pressable onPress={onRemoveCover} disabled={busy}>
                    <Text style={styles.removeText}>Remove cover</Text>
                  </Pressable>
                ) : (
                  <Text style={styles.hint}>Using the default cover.</Text>
                )}
              </View>
            </View>

            <Field label="Title">
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={(title) => patch({ title })}
                editable={!busy}
                placeholder="Title"
                placeholderTextColor={colors.textMuted}
              />
            </Field>

            <Field
              label={creatorFieldLabel(kind, form.creditField)}
              hint="Separate more than one name with commas.">
              <TextInput
                style={styles.input}
                value={form.creator}
                onChangeText={(creator) => patch({ creator })}
                editable={!busy}
                placeholder={creatorFieldLabel(kind, form.creditField)}
                placeholderTextColor={colors.textMuted}
              />
            </Field>

            {kind === 'tune' ? (
              <>
                <Field label="Producer">
                  <TextInput
                    style={styles.input}
                    value={form.producer}
                    onChangeText={(producer) => patch({ producer })}
                    editable={!busy}
                    placeholder="Producer"
                    placeholderTextColor={colors.textMuted}
                  />
                </Field>
                <Field label="Album">
                  <TextInput
                    style={styles.input}
                    value={form.album}
                    onChangeText={(album) => patch({ album })}
                    editable={!busy}
                    placeholder="Album"
                    placeholderTextColor={colors.textMuted}
                  />
                </Field>
                <Field label="Featuring" hint="Comma-separated names.">
                  <TextInput
                    style={styles.input}
                    value={form.featuring}
                    onChangeText={(featuring) => patch({ featuring })}
                    editable={!busy}
                    placeholder="Artist 1, Artist 2"
                    placeholderTextColor={colors.textMuted}
                  />
                </Field>
              </>
            ) : null}

            <Field label="Tags" hint="Comma-separated.">
              <TextInput
                style={styles.input}
                value={form.tags}
                onChangeText={(tags) => patch({ tags })}
                editable={!busy}
                autoCapitalize="none"
                placeholder="pop, indie, summer"
                placeholderTextColor={colors.textMuted}
              />
            </Field>

            {kind === 'tune' ? (
              <>
                <Field label="Elements" hint="Instruments or parts, comma-separated.">
                  <TextInput
                    style={styles.input}
                    value={form.elements}
                    onChangeText={(elements) => patch({ elements })}
                    editable={!busy}
                    placeholder="guitar, drums, bass"
                    placeholderTextColor={colors.textMuted}
                  />
                </Field>
                <Field label="Encoded by">
                  <TextInput
                    style={styles.input}
                    value={form.encodedBy}
                    onChangeText={(encodedBy) => patch({ encodedBy })}
                    editable={!busy}
                    placeholder="Logic Pro, LAME 3.100"
                    placeholderTextColor={colors.textMuted}
                  />
                </Field>
                <Text style={styles.sectionTitle}>Production stack</Text>
                <Field label="DAWs" hint="Comma-separated.">
                  <TextInput
                    style={styles.input}
                    value={form.daws}
                    onChangeText={(daws) => patch({ daws })}
                    editable={!busy}
                    placeholder="Ableton Live, Logic Pro"
                    placeholderTextColor={colors.textMuted}
                  />
                </Field>
                <Field label="Plugins">
                  <TextInput
                    style={styles.input}
                    value={form.plugins}
                    onChangeText={(plugins) => patch({ plugins })}
                    editable={!busy}
                    placeholder="Serum, Valhalla"
                    placeholderTextColor={colors.textMuted}
                  />
                </Field>
                <Field label="Hardware">
                  <TextInput
                    style={styles.input}
                    value={form.hardware}
                    onChangeText={(hardware) => patch({ hardware })}
                    editable={!busy}
                    placeholder="SM7B, MPC"
                    placeholderTextColor={colors.textMuted}
                  />
                </Field>
                <Text style={styles.sectionTitle}>AI usage</Text>
                <View style={styles.switchRow}>
                  <Text style={styles.label}>AI was used</Text>
                  <Switch
                    value={form.aiUsed}
                    onValueChange={(aiUsed) => patch({ aiUsed })}
                    disabled={busy}
                    trackColor={{ true: colors.accent, false: 'rgba(255,255,255,0.2)' }}
                  />
                </View>
                {form.aiUsed ? (
                  <>
                    <Field label="AI tools" hint="Comma-separated.">
                      <TextInput
                        style={styles.input}
                        value={form.aiTools}
                        onChangeText={(aiTools) => patch({ aiTools })}
                        editable={!busy}
                        placeholder="Suno, LANDR"
                        placeholderTextColor={colors.textMuted}
                      />
                    </Field>
                    <Field label="AI notes">
                      <TextInput
                        style={[styles.input, styles.multiline]}
                        value={form.aiNotes}
                        onChangeText={(aiNotes) => patch({ aiNotes })}
                        editable={!busy}
                        multiline
                        placeholder="How AI was used"
                        placeholderTextColor={colors.textMuted}
                      />
                    </Field>
                  </>
                ) : null}
              </>
            ) : null}

            <Text style={styles.sectionTitle}>Release</Text>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Year only</Text>
              <Switch
                value={form.releaseYearOnly}
                onValueChange={(releaseYearOnly) => patch({ releaseYearOnly })}
                disabled={busy}
                trackColor={{ true: colors.accent, false: 'rgba(255,255,255,0.2)' }}
              />
            </View>
            {form.releaseYearOnly ? (
              <Field label="Release year">
                <TextInput
                  style={styles.input}
                  value={form.releaseYear}
                  onChangeText={(releaseYear) => patch({ releaseYear })}
                  editable={!busy}
                  keyboardType="number-pad"
                  inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
                  placeholder="2024"
                  placeholderTextColor={colors.textMuted}
                />
              </Field>
            ) : (
              <Field label="Release date" hint="YYYY-MM-DD">
                <TextInput
                  style={styles.input}
                  value={form.releaseDate}
                  onChangeText={(releaseDate) => patch({ releaseDate })}
                  editable={!busy}
                  autoCapitalize="none"
                  placeholder="2024-05-01"
                  placeholderTextColor={colors.textMuted}
                />
              </Field>
            )}

            {kind !== 'book' ? (
              <Field label="Duration" hint="Minutes:seconds, for example 3:45">
                <TextInput
                  style={styles.input}
                  value={form.duration}
                  onChangeText={(duration) => patch({ duration })}
                  editable={!busy}
                  keyboardType="numbers-and-punctuation"
                  inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
                  placeholder="3:45"
                  placeholderTextColor={colors.textMuted}
                />
              </Field>
            ) : null}

            <View style={styles.switchRow}>
              <Text style={styles.label}>Explicit</Text>
              <Switch
                value={form.explicit}
                onValueChange={(explicit) => patch({ explicit })}
                disabled={busy}
                trackColor={{ true: colors.accent, false: 'rgba(255,255,255,0.2)' }}
              />
            </View>

            <Text style={styles.sectionTitle}>About</Text>
            <Field label="Description">
              <TextInput
                style={[styles.input, styles.multiline]}
                value={form.description}
                onChangeText={(description) => patch({ description })}
                editable={!busy}
                multiline
                placeholder="Description"
                placeholderTextColor={colors.textMuted}
              />
            </Field>
            {kind === 'tune' ? (
              <Field label="Lyrics">
                <TextInput
                  style={[styles.input, styles.lyrics]}
                  value={form.lyrics}
                  onChangeText={(lyrics) => patch({ lyrics })}
                  editable={!busy}
                  multiline
                  placeholder="Lyrics"
                  placeholderTextColor={colors.textMuted}
                />
              </Field>
            ) : null}

            <Text style={styles.sectionTitle}>Details</Text>
            <LocationAutocomplete
              label="Primary location"
              placeholder="Search for a place…"
              value={form.primaryLocation}
              onChange={(primaryLocation) => patch({ primaryLocation })}
              disabled={busy}
            />
            <LocationAutocomplete
              label="Secondary location"
              placeholder="Optional second place…"
              value={form.secondaryLocation}
              onChange={(secondaryLocation) => patch({ secondaryLocation })}
              disabled={busy}
            />

            {kind === 'tune' ? (
              <>
                <Field label="Composer">
                  <TextInput
                    style={styles.input}
                    value={form.composer}
                    onChangeText={(composer) => patch({ composer })}
                    editable={!busy}
                    placeholder="Composer"
                    placeholderTextColor={colors.textMuted}
                  />
                </Field>
                <Field label="Label">
                  <TextInput
                    style={styles.input}
                    value={form.label}
                    onChangeText={(label) => patch({ label })}
                    editable={!busy}
                    placeholder="Label name"
                    placeholderTextColor={colors.textMuted}
                  />
                </Field>
                <View style={styles.row2}>
                  <Field label="BPM" style={styles.flex}>
                    <TextInput
                      style={styles.input}
                      value={form.bpm}
                      onChangeText={(bpm) => patch({ bpm })}
                      editable={!busy}
                      keyboardType="number-pad"
                      inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
                      placeholder="120"
                      placeholderTextColor={colors.textMuted}
                    />
                  </Field>
                  <Field label="Key" style={styles.flex}>
                    <TextInput
                      style={styles.input}
                      value={form.key}
                      onChangeText={(key) => patch({ key })}
                      editable={!busy}
                      placeholder="C major"
                      placeholderTextColor={colors.textMuted}
                    />
                  </Field>
                </View>
                <View style={styles.row2}>
                  <Field label="Pitch (Hz)" style={styles.flex}>
                    <TextInput
                      style={styles.input}
                      value={form.pitch}
                      onChangeText={(pitch) => patch({ pitch })}
                      editable={!busy}
                      keyboardType="number-pad"
                      inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
                      placeholder="440"
                      placeholderTextColor={colors.textMuted}
                    />
                  </Field>
                  <Field label="Time signature" style={styles.flex}>
                    <TextInput
                      style={styles.input}
                      value={form.timeSignature}
                      onChangeText={(timeSignature) => patch({ timeSignature })}
                      editable={!busy}
                      placeholder="4/4"
                      placeholderTextColor={colors.textMuted}
                    />
                  </Field>
                </View>
                <View style={styles.row2}>
                  <Field label="ISRC" style={styles.flex}>
                    <TextInput
                      style={styles.input}
                      value={form.isrc}
                      onChangeText={(isrc) => patch({ isrc })}
                      editable={!busy}
                      autoCapitalize="characters"
                      placeholder="ISRC"
                      placeholderTextColor={colors.textMuted}
                    />
                  </Field>
                  <Field label="UPC" style={styles.flex}>
                    <TextInput
                      style={styles.input}
                      value={form.upc}
                      onChangeText={(upc) => patch({ upc })}
                      editable={!busy}
                      placeholder="UPC"
                      placeholderTextColor={colors.textMuted}
                    />
                  </Field>
                </View>
              </>
            ) : null}

            <Field label="Language" hint="Language code, for example en">
              <TextInput
                style={styles.input}
                value={form.language}
                onChangeText={(language) => patch({ language })}
                editable={!busy}
                autoCapitalize="none"
                placeholder="en"
                placeholderTextColor={colors.textMuted}
              />
            </Field>

            {kind === 'book' ? (
              <Field label="ISBN">
                <TextInput
                  style={styles.input}
                  value={form.isbn}
                  onChangeText={(isbn) => patch({ isbn })}
                  editable={!busy}
                  autoCapitalize="characters"
                  placeholder="978…"
                  placeholderTextColor={colors.textMuted}
                />
              </Field>
            ) : null}

            <Field
              label="Who can keep a copy"
              hint="100 is everyone who tips. 1 is only the most generous. People who already cleared the line keep the copy if you raise it.">
              <TextInput
                style={styles.input}
                value={form.copySharePercent}
                onChangeText={(copySharePercent) => patch({ copySharePercent })}
                editable={!busy}
                keyboardType="number-pad"
                inputAccessoryViewID={NUMERIC_ACCESSORY_ID}
                placeholder="50"
                placeholderTextColor={colors.textMuted}
              />
              {shareLabel ? <Text style={styles.hint}>{shareLabel}</Text> : null}
            </Field>

            {kind !== 'book' ? (
              <>
                <Text style={styles.sectionTitle}>Licences</Text>
                {!media?.licence?.chosen ? (
                  <Text style={styles.hint}>
                    Streaming is included. Download, rework, and commercial stay off until you turn them on.
                  </Text>
                ) : null}
                <LicencePicker value={licenceChoice} onChange={setLicenceChoice} />
                <Pressable
                  style={[styles.saveBtn, licenceSaving && styles.buttonDisabled]}
                  disabled={licenceSaving || busy}
                  onPress={() => void onSaveLicence()}>
                  <Text style={styles.saveBtnText}>{licenceSaving ? 'Saving licences…' : 'Save licences'}</Text>
                </Pressable>
                <Text style={styles.sectionTitle}>Audio</Text>
                <Text style={styles.hint}>
                  {hasAudio
                    ? 'An audio file is already attached. Upload a new MP3 or WAV to replace it.'
                    : 'Add an MP3 or WAV so this can play on Tuneable.'}
                </Text>
                <Pressable style={styles.photoBtn} onPress={() => void onPickAudio()} disabled={busy}>
                  <Text style={styles.photoBtnText}>
                    {audioFile ? audioFile.name : hasAudio ? 'Replace audio' : 'Add audio'}
                  </Text>
                </Pressable>
                {audioFile ? (
                  <>
                    <View style={styles.switchRow}>
                      <Text style={styles.rightsCopy}>
                        I have the rights to upload this audio
                      </Text>
                      <Switch
                        value={rightsConfirmed}
                        onValueChange={setRightsConfirmed}
                        disabled={audioBusy}
                        trackColor={{ true: colors.accent, false: 'rgba(255,255,255,0.2)' }}
                      />
                    </View>
                    {audioProgress ? (
                      <UploadProgressBar
                        phase={audioProgress.phase}
                        loaded={audioProgress.loaded}
                        total={audioProgress.total}
                      />
                    ) : (
                      <Pressable
                        style={[styles.saveBtn, !rightsConfirmed && styles.buttonDisabled]}
                        onPress={() => void onAttachAudio()}
                        disabled={busy || !rightsConfirmed}>
                        <Text style={styles.saveBtnText}>
                          {hasAudio ? 'Upload replacement' : 'Upload audio'}
                        </Text>
                      </Pressable>
                    )}
                  </>
                ) : null}
              </>
            ) : null}

            <Text style={styles.sectionTitle}>Links</Text>
            {editableLinkFields(
              { ...form.sources },
              kind
            ).map((field) => (
              <Field key={field.key} label={field.label}>
                <TextInput
                  style={styles.input}
                  value={form.sources[field.key] || ''}
                  onChangeText={(value) =>
                    patch({ sources: { ...form.sources, [field.key]: value } })
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
            <Text style={styles.hint}>Leave a link blank to remove it.</Text>

            {admin ? (
              <>
                <Text style={styles.sectionTitle}>Rights</Text>
                <View style={styles.rightsRow}>
                  {RIGHTS_OPTIONS.map((option) => {
                    const selected = form.rightsStatus === option.value;
                    return (
                      <Pressable
                        key={option.value}
                        style={[styles.rightsChip, selected && styles.rightsChipOn]}
                        onPress={() => patch({ rightsStatus: option.value })}
                        disabled={busy}>
                        <Text style={[styles.rightsText, selected && styles.rightsTextOn]}>
                          {option.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : null}

            <Pressable
              style={[styles.saveBtn, busy && styles.buttonDisabled]}
              onPress={() => void onSave()}
              disabled={busy}>
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveBtnText}>Save changes</Text>
              )}
            </Pressable>

            {canDeleteMedia(user, media) ? (
              <Pressable style={styles.deleteBtn} onPress={onDelete} disabled={busy}>
                <Ionicons name="trash-outline" size={16} color="#fca5a5" />
                <Text style={styles.deleteText}>{deleting ? 'Deleting…' : 'Delete media'}</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        ) : null}
      </KeyboardAvoidingView>
      <KeyboardDoneAccessory nativeID={NUMERIC_ACCESSORY_ID} />
    </Screen>
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
  loader: { marginTop: 48 },
  centered: {
    paddingHorizontal: 24,
    marginTop: 48,
    alignItems: 'center',
    gap: 16,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 48,
    gap: 14,
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 15,
    marginTop: -8,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginTop: 8,
  },
  coverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  cover: {
    width: 96,
    height: 96,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  coverActions: {
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
  removeText: {
    color: '#fca5a5',
    fontWeight: '600',
    fontSize: 14,
  },
  field: { gap: 8 },
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
  multiline: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  lyrics: {
    minHeight: 160,
    textAlignVertical: 'top',
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
  row2: {
    flexDirection: 'row',
    gap: 12,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rightsCopy: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  rightsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rightsChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rightsChipOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  rightsText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 13,
  },
  rightsTextOn: {
    color: '#fff',
  },
  saveBtn: {
    marginTop: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.6 },
  saveBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  deleteText: {
    color: '#fca5a5',
    fontWeight: '600',
    fontSize: 15,
  },
  retryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
  },
});
