import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Linking,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import axios from 'axios';
import { Screen } from '@/src/components/Screen';
import {
  mediaAPI,
  type AudioFileAsset,
} from '@/src/api/media';
import { useAuth } from '@/src/auth/AuthContext';
import { canUploadMedia } from '@/src/lib/permissions';
import { mediaId } from '@/src/lib/media';
import {
  AUDIO_PICKER_TYPES,
  getAudioUploadRejection,
  titleFromAudioFileName,
} from '@/src/lib/audioUpload';
import { LEGAL_URLS } from '@/src/components/LegalLinks';
import { UploadProgressBar, type UploadPhase } from '@/src/components/UploadProgressBar';
import { colors } from '@/src/theme/colors';

function formatBytes(size: number | null | undefined): string {
  if (size == null || !Number.isFinite(size) || size <= 0) return '';
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadScreen() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [file, setFile] = useState<AudioFileAsset | null>(null);
  const [title, setTitle] = useState('');
  const [artistName, setArtistName] = useState(user?.username ?? '');
  const [tags, setTags] = useState('');
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ phase: UploadPhase; loaded: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  const allowed = canUploadMedia(user);

  const canSubmit = useMemo(() => {
    if (!file || !rightsConfirmed || uploading) return false;
    return title.trim().length > 0;
  }, [file, rightsConfirmed, uploading, title]);

  if (!authLoading && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  const pickFile = async () => {
    setError(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: AUDIO_PICKER_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      const name = asset.name || 'track.mp3';
      const rejection = getAudioUploadRejection(name, asset.mimeType, asset.size);
      if (rejection) {
        setError(rejection);
        return;
      }

      setFile({
        uri: asset.uri,
        name,
        mimeType: asset.mimeType || 'audio/mpeg',
        size: asset.size,
      });

      if (!title.trim()) {
        setTitle(titleFromAudioFileName(name));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not pick file');
    }
  };

  const onSubmit = async () => {
    if (!file || !canSubmit) return;
    setUploading(true);
    setError(null);
    const fallbackTotal = file.size ?? 0;
    setProgress({ phase: 'uploading', loaded: 0, total: fallbackTotal });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await mediaAPI.uploadMedia(
        file,
        {
          title: title.trim(),
          artistName: artistName.trim() || undefined,
          tags: tags.trim() || undefined,
        },
        {
          signal: controller.signal,
          onUploadProgress: (event) => {
            const total = event.total || fallbackTotal;
            setProgress({
              phase: total > 0 && event.loaded >= total ? 'processing' : 'uploading',
              loaded: event.loaded,
              total,
            });
          },
        },
      );
      const id = mediaId(res.media);
      if (!id) throw new Error('Upload succeeded but media id was missing');
      Alert.alert('Uploaded', 'Your track is live and playable.', [
        { text: 'View tune', onPress: () => router.replace(`/tune/${id}`) },
      ]);
    } catch (err) {
      if (axios.isCancel(err)) {
        setError('Upload cancelled.');
        return;
      }
      let message = 'Upload failed';
      if (axios.isAxiosError(err)) {
        const data = err.response?.data as { error?: string; message?: string } | undefined;
        message = data?.error || data?.message || err.message || message;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setError(message);
    } finally {
      abortRef.current = null;
      setUploading(false);
      setProgress(null);
    }
  };

  return (
    <Screen>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Upload</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag">
        {!allowed ? (
          <View style={styles.gateCard}>
            <Text style={styles.gateTitle}>Creators only</Text>
            <Text style={styles.gateBody}>
              Uploading audio is available to creator and admin accounts. You can
              still tip and explore the charts.
            </Text>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => router.push('/(tabs)/charts')}>
              <Text style={styles.secondaryBtnText}>Browse music</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Text style={styles.lede}>
              Upload an MP3 (max 50MB) or WAV (max 100MB). It becomes playable as soon as processing finishes.
            </Text>

            {user && !user.emailVerified ? (
              <Text style={styles.warn}>
                Verify your email on the web for the full creator experience.
              </Text>
            ) : null}

            <Pressable style={styles.filePicker} onPress={() => void pickFile()}>
              <Ionicons
                name="musical-note"
                size={22}
                color={colors.accentLight}
              />
              <View style={styles.fileMeta}>
                <Text style={styles.fileLabel}>
                  {file ? file.name : 'Audio File'}
                </Text>
                {file?.size ? (
                  <Text style={styles.fileSize}>{formatBytes(file.size)}</Text>
                ) : (
                  <Text style={styles.fileHint}>MP3 up to 50MB · WAV up to 100MB</Text>
                )}
              </View>
              <Ionicons name="folder-open-outline" size={20} color={colors.textMuted} />
            </Pressable>

            <Text style={styles.fieldLabel}>Title *</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Track title"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>Artist</Text>
            <TextInput
              value={artistName}
              onChangeText={setArtistName}
              placeholder="Artist name"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
            />

            <Text style={styles.fieldLabel}>Tags</Text>
            <TextInput
              value={tags}
              onChangeText={setTags}
              placeholder="house, electronic (comma-separated)"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              autoCapitalize="none"
            />

            <View style={styles.rightsRow}>
              <Pressable
                onPress={() => setRightsConfirmed((v) => !v)}
                hitSlop={8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: rightsConfirmed }}>
                <Ionicons
                  name={rightsConfirmed ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={rightsConfirmed ? colors.accentLight : colors.textMuted}
                />
              </Pressable>
              <Text style={styles.rightsText}>
                I confirm I have the rights to upload and distribute this audio.{' '}
                <Text
                  style={styles.rightsLink}
                  onPress={() => {
                    void Linking.openURL(`${LEGAL_URLS.terms}#copyright`);
                  }}>
                  Copyright terms
                </Text>
              </Text>
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {progress ? (
              <UploadProgressBar
                phase={progress.phase}
                loaded={progress.loaded}
                total={progress.total}
                onCancel={() => abortRef.current?.abort()}
              />
            ) : null}

            <Pressable
              style={[styles.submitBtn, !canSubmit && styles.submitDisabled]}
              disabled={!canSubmit}
              onPress={() => void onSubmit()}>
              {uploading ? (
                <View style={styles.submitBusy}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.submitText}>
                    {progress?.phase === 'processing' ? 'Processing…' : 'Uploading…'}
                  </Text>
                </View>
              ) : (
                <Text style={styles.submitText}>Upload track</Text>
              )}
            </Pressable>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  lede: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 16,
  },
  warn: {
    color: '#fcd34d',
    fontSize: 13,
    marginBottom: 12,
  },
  gateCard: {
    padding: 16,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
  },
  gateTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  gateBody: {
    color: colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 14,
  },
  filePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    marginBottom: 16,
  },
  fileMeta: {
    flex: 1,
    minWidth: 0,
  },
  fileLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  fileSize: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
  fileHint: {
    marginTop: 2,
    color: colors.textMuted,
    fontSize: 12,
  },
  fieldLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
    marginBottom: 14,
  },
  rightsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 4,
    marginBottom: 16,
  },
  rightsLink: {
    color: colors.accentLight,
    textDecorationLine: 'underline',
  },
  rightsText: {
    flex: 1,
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    color: '#fca5a5',
    marginBottom: 12,
    fontSize: 13,
  },
  submitBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitDisabled: {
    opacity: 0.45,
  },
  submitBusy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  submitText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  secondaryBtn: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(126, 34, 206, 0.35)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  secondaryBtnText: {
    color: '#e9d5ff',
    fontWeight: '600',
    fontSize: 13,
  },
});
