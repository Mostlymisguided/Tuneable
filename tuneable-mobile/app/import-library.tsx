import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/src/components/Screen';
import { userAPI } from '@/src/api/user';
import { useAuth } from '@/src/auth/AuthContext';
import { getApiErrorMessage } from '@/src/lib/apiError';
import { buildOAuthStartUrl, extractOAuthError } from '@/src/lib/oauth';
import { showToast } from '@/src/stores/toastStore';
import { colors } from '@/src/theme/colors';

WebBrowser.maybeCompleteAuthSession();

type ImportSource = 'spotify' | 'soundcloud' | 'youtube';

const IMPORT_LIMIT = 25;

function parseSource(
  value: string | string[] | undefined
): ImportSource | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === 'soundcloud' || raw === 'spotify' || raw === 'youtube') return raw;
  return null;
}

export default function ImportLibraryScreen() {
  const params = useLocalSearchParams<{ source?: string }>();
  const {
    user,
    token,
    updateBalance,
    isAuthenticated,
    isLoading: authLoading,
  } = useAuth();

  const sourceParam = parseSource(params.source);

  const [spotifyConnected, setSpotifyConnected] = useState(false);
  const [soundcloudConnected, setSoundcloudConnected] = useState(false);
  const [spotifyOauthAvailable, setSpotifyOauthAvailable] = useState(false);
  const [spotifyRequestStatus, setSpotifyRequestStatus] = useState<
    'pending' | 'allowlisted' | 'rejected' | null
  >(null);
  const [spotifyAccountInput, setSpotifyAccountInput] = useState('');
  const [youtubePlaylistUrl, setYoutubePlaylistUrl] = useState('');
  const [activeSource, setActiveSource] = useState<ImportSource | null>(
    sourceParam
  );
  const [importLoading, setImportLoading] = useState(false);
  const [importProgress, setImportProgress] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<{
    actionableCount: number;
    estimatedCost: number;
    userBalance: number;
    inLibraryCount: number;
    possibleMatchCount: number;
    skippedCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaultTip = useMemo(
    () => user?.preferences?.defaultTip ?? 1,
    [user?.preferences?.defaultTip]
  );

  const checkConnections = useCallback(async () => {
    try {
      const [spotify, soundcloud] = await Promise.all([
        userAPI.getSpotifyStatus(),
        userAPI.getSoundCloudStatus(),
      ]);
      const next = {
        spotify: Boolean(spotify?.connected),
        soundcloud: Boolean(soundcloud?.connected),
        oauthAvailable: Boolean(spotify?.oauthAvailable) || Boolean(spotify?.connected),
      };
      setSpotifyConnected(next.spotify);
      setSoundcloudConnected(next.soundcloud);
      setSpotifyOauthAvailable(next.oauthAvailable);
      setSpotifyRequestStatus(spotify?.request?.status ?? null);
      return next;
    } catch {
      return { spotify: false, soundcloud: false, oauthAvailable: false };
    }
  }, []);

  const loadImportPreview = useCallback(
    async (source: ImportSource, playlistUrl?: string) => {
      setImportLoading(true);
      setImportProgress(source === 'youtube' ? 'Matching playlist…' : 'Scanning your likes…');
      setImportPreview(null);
      setError(null);
      try {
        const started =
          source === 'soundcloud'
            ? await userAPI.startSoundCloudImportPreview(
                IMPORT_LIMIT,
                'spotify_only'
              )
            : source === 'youtube'
              ? await userAPI.startYouTubeImportPreview(
                  playlistUrl || youtubePlaylistUrl,
                  IMPORT_LIMIT
                )
            : await userAPI.startSpotifyImportPreview(IMPORT_LIMIT);
        const data = await userAPI.waitForImportJob<{
          items?: Array<{ matchStatus: string; selected?: boolean }>;
          summary?: {
            userBalance?: number;
            inLibrary?: number;
            selectedCount?: number;
            possibleMatches?: number;
            skippedJunk?: number;
            skippedUnparsed?: number;
            skippedNoMatch?: number;
          };
        }>(started.jobId, (job) => {
          setImportProgress(job.message || (source === 'youtube' ? 'Matching playlist…' : 'Scanning your likes…'));
        });

        const items = data.items || [];
        const ready = items.filter((i) => i.selected !== false && i.matchStatus !== 'in_library');
        const inLibrary =
          data.summary?.inLibrary ??
          items.filter((i) => i.matchStatus === 'in_library').length;
        const balance =
          data.summary?.userBalance ??
          (user?.balance != null ? user.balance / 100 : 0);
        const skipped =
          (data.summary?.skippedJunk || 0)
          + (data.summary?.skippedUnparsed || 0)
          + (data.summary?.skippedNoMatch || 0);

        setImportPreview({
          actionableCount: data.summary?.selectedCount ?? ready.length,
          estimatedCost: (data.summary?.selectedCount ?? ready.length) * defaultTip,
          userBalance: balance,
          inLibraryCount: inLibrary,
          possibleMatchCount: data.summary?.possibleMatches
            ?? items.filter((i) => i.matchStatus === 'possible_match').length,
          skippedCount: skipped,
        });
      } catch (err) {
        setError(getApiErrorMessage(err, 'Could not preview your library.'));
        setImportPreview(null);
      } finally {
        setImportLoading(false);
        setImportProgress(null);
      }
    },
    [defaultTip, user?.balance, youtubePlaylistUrl]
  );

  useEffect(() => {
    void checkConnections();
  }, [checkConnections]);

  useEffect(() => {
    if (!sourceParam) return;
    setActiveSource(sourceParam);
    void (async () => {
      const connections = await checkConnections();
      const connected =
        sourceParam === 'soundcloud'
          ? connections.soundcloud
          : sourceParam === 'youtube'
            ? true
          : connections.spotify;
      if (sourceParam === 'youtube') return;
      if (connected) {
        await loadImportPreview(sourceParam);
      }
    })();
  }, [sourceParam, checkConnections, loadImportPreview]);

  const goToSource = (source: ImportSource) => {
    router.setParams({ source });
    setActiveSource(source);
  };

  const connectImportSource = async (source: ImportSource) => {
    if (!token) {
      setError('You need to be signed in to connect an account.');
      return;
    }
    setError(null);
    setImportLoading(true);
    setActiveSource(source);
    try {
      const redirect = Linking.createURL('import-library', {
        queryParams: { source },
      });
      const startUrl = buildOAuthStartUrl(source, {
        linkAccount: true,
        token,
        customRedirect: redirect,
      });
      const result = await WebBrowser.openAuthSessionAsync(startUrl, redirect);
      if (result.type === 'success' && result.url) {
        const oauthError = extractOAuthError(result.url);
        if (oauthError) {
          setError(oauthError.replace(/_/g, ' '));
          return;
        }
        goToSource(source);
        const connections = await checkConnections();
        const connected =
          source === 'soundcloud' ? connections.soundcloud : connections.spotify;
        if (connected) {
          await loadImportPreview(source);
        } else {
          setError(
            `${source === 'soundcloud' ? 'SoundCloud' : 'Spotify'} did not connect. Try again.`
          );
        }
      }
    } catch (err) {
      setError(getApiErrorMessage(err, 'Connection failed.'));
    } finally {
      setImportLoading(false);
    }
  };

  const runQuickImport = async () => {
    if (!activeSource) return;
    setImportLoading(true);
    setImportProgress('Preparing import…');
    setError(null);
    try {
      const previewStarted =
        activeSource === 'soundcloud'
          ? await userAPI.startSoundCloudImportPreview(
              IMPORT_LIMIT,
              'spotify_only'
            )
          : activeSource === 'youtube'
            ? await userAPI.startYouTubeImportPreview(youtubePlaylistUrl, IMPORT_LIMIT)
          : await userAPI.startSpotifyImportPreview(IMPORT_LIMIT);
      const data = await userAPI.waitForImportJob<{
        items?: Array<{
          key: string;
          title?: string;
          mediaId?: string;
          matchStatus?: string;
          useSuggestedMatch?: boolean;
          crossRefStatus?: string;
          identityConfidence?: string;
          selected?: boolean;
          externalMedia?: Record<string, unknown>;
        }>;
      }>(previewStarted.jobId, (job) => {
        setImportProgress(job.message || 'Scanning…');
      });

      const items = (data.items || [])
        .filter((i) => i.matchStatus !== 'in_library')
        .filter((i) => activeSource !== 'youtube' || i.selected !== false)
        .slice(0, IMPORT_LIMIT)
        .map((i) => ({
          key: i.key,
          title: i.title,
          selected: true,
          mediaId: i.mediaId,
          matchStatus: i.matchStatus,
          useSuggestedMatch: i.useSuggestedMatch,
          crossRefStatus: i.crossRefStatus,
          identityConfidence: i.identityConfidence,
          amount: defaultTip,
          externalMedia: i.externalMedia,
          skipIfInLibrary: true,
        }));

      if (items.length === 0) {
        showToast("No new tracks to import — you're all set!");
        router.back();
        return;
      }

      setImportProgress(
        `Importing ${items.length} track${items.length === 1 ? '' : 's'}…`
      );
      const executeStarted =
        activeSource === 'soundcloud'
          ? await userAPI.startSoundCloudImportExecute(items, defaultTip)
          : activeSource === 'youtube'
            ? await userAPI.startYouTubeImportExecute(items, defaultTip)
          : await userAPI.startSpotifyImportExecute(items, defaultTip);
      const result = await userAPI.waitForImportJob<{
        tipped: number;
        updatedBalance: number;
      }>(executeStarted.jobId, (job) => {
        setImportProgress(job.message || 'Importing…');
      });

      if (typeof result.updatedBalance === 'number') {
        updateBalance(result.updatedBalance);
      }
      showToast(
        `Imported ${result.tipped} track${result.tipped === 1 ? '' : 's'}`
      );
      router.back();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Import failed.'));
    } finally {
      setImportLoading(false);
      setImportProgress(null);
    }
  };

  const startSource = async (source: ImportSource) => {
    if (source === 'youtube') {
      goToSource(source);
      return;
    }
    const connections = await checkConnections();
    const connected =
      source === 'soundcloud' ? connections.soundcloud : connections.spotify;
    if (connected) {
      goToSource(source);
      await loadImportPreview(source);
      return;
    }
    if (source === 'spotify' && !connections.oauthAvailable) {
      goToSource(source);
      return;
    }
    await connectImportSource(source);
  };

  const submitSpotifyRequest = async () => {
    const account = spotifyAccountInput.trim();
    if (!account) {
      setError('Enter the email on your Spotify account (spotify.com/account/overview).');
      return;
    }
    setImportLoading(true);
    setError(null);
    try {
      const result = await userAPI.requestSpotifyImport(account);
      showToast(result.message);
      await checkConnections();
    } catch (err) {
      setError(getApiErrorMessage(err, 'Could not submit request.'));
    } finally {
      setImportLoading(false);
    }
  };

  const busy = importLoading;
  const sourceLabel =
    activeSource === 'soundcloud'
      ? 'SoundCloud'
      : activeSource === 'youtube'
        ? 'YouTube'
        : 'Spotify';

  if (!authLoading && !isAuthenticated) {
    return <Redirect href="/login" />;
  }

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.back}>
          <Ionicons name="chevron-back" size={28} color={colors.text} />
        </Pressable>
        <Text style={styles.title}>Import likes</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <Text style={styles.lede}>
          Tip tracks from Spotify, SoundCloud, or a public YouTube playlist into
          your Tuneable library at your default (£{defaultTip.toFixed(2)}).
        </Text>

        {!activeSource ? (
          <View style={styles.importGrid}>
            <Pressable
              style={[styles.importCard, styles.spotifyCard]}
              disabled={busy}
              onPress={() => void startSource('spotify')}>
              <Text style={styles.importTitle}>Spotify</Text>
              <Text style={styles.importSub}>
                {spotifyConnected
                  ? 'Connected — tap to import'
                  : spotifyOauthAvailable
                    ? 'Import your saved tracks'
                    : 'Request tester access'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.importCard, styles.soundcloudCard]}
              disabled={busy}
              onPress={() => void startSource('soundcloud')}>
              <Text style={styles.importTitleSc}>SoundCloud</Text>
              <Text style={styles.importSub}>
                {soundcloudConnected
                  ? 'Connected — tap to import'
                  : 'Import your liked tracks'}
              </Text>
            </Pressable>
            <Pressable
              style={[styles.importCard, styles.youtubeCard]}
              disabled={busy}
              onPress={() => void startSource('youtube')}>
              <Text style={styles.importTitleYt}>YouTube playlist</Text>
              <Text style={styles.importSub}>
                Paste a public playlist — MusicBrainz confirms matches
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.previewBox}>
            <Text style={styles.previewHeading}>{sourceLabel}</Text>
            {activeSource === 'youtube' && !importPreview && !importLoading ? (
              <View style={styles.previewActions}>
                <TextInput
                  value={youtubePlaylistUrl}
                  onChangeText={setYoutubePlaylistUrl}
                  placeholder="https://www.youtube.com/playlist?list=…"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />
                <Pressable
                  style={[styles.primaryBtn, busy && styles.btnDisabled]}
                  disabled={busy || !youtubePlaylistUrl.trim()}
                  onPress={() => void loadImportPreview('youtube', youtubePlaylistUrl)}>
                  <Text style={styles.primaryBtnText}>Scan playlist</Text>
                </Pressable>
              </View>
            ) : activeSource === 'spotify' && !spotifyConnected && !spotifyOauthAvailable && !importPreview ? (
              <View style={styles.previewActions}>
                <Text style={styles.hint}>
                  {spotifyRequestStatus === 'pending'
                    ? 'Request pending — we will enable Connect after adding your Spotify account to the tester list.'
                    : 'Spotify import is in tester mode. Request access with the email on your Spotify account.'}
                </Text>
                <TextInput
                  value={spotifyAccountInput}
                  onChangeText={setSpotifyAccountInput}
                  placeholder="Spotify account email"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  style={styles.input}
                />
                <Pressable
                  style={[styles.primaryBtn, busy && styles.btnDisabled]}
                  disabled={busy}
                  onPress={() => void submitSpotifyRequest()}>
                  {importLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Request Spotify import</Text>
                  )}
                </Pressable>
              </View>
            ) : importLoading && !importPreview ? (
              <View style={styles.previewLoading}>
                <ActivityIndicator color={colors.accentLight} />
                <Text style={styles.hint}>
                  {importProgress || `Scanning your ${sourceLabel} likes…`}
                </Text>
              </View>
            ) : importPreview ? (
              <>
                <Text style={styles.previewText}>
                  {importPreview.inLibraryCount > 0
                    ? `${importPreview.inLibraryCount} already in your library · `
                    : ''}
                  {importPreview.actionableCount} ready to import
                  {importPreview.possibleMatchCount > 0
                    ? ` · ${importPreview.possibleMatchCount} to review on web`
                    : ''}
                  {importPreview.skippedCount > 0
                    ? ` · ${importPreview.skippedCount} skipped`
                    : ''}
                  {importPreview.actionableCount > 0
                    ? ` · ~£${importPreview.estimatedCost.toFixed(2)}`
                    : ''}
                </Text>
                {importLoading && importProgress ? (
                  <Text style={styles.hint}>{importProgress}</Text>
                ) : null}
                <Pressable
                  style={[styles.primaryBtn, busy && styles.btnDisabled]}
                  disabled={busy || importPreview.actionableCount === 0}
                  onPress={() => void runQuickImport()}>
                  {importLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>
                      {importPreview.actionableCount === 0
                        ? 'All caught up'
                        : `Import up to ${IMPORT_LIMIT} tracks`}
                    </Text>
                  )}
                </Pressable>
              </>
            ) : (
              <View style={styles.previewActions}>
                <Text style={styles.hint}>
                  Connect {sourceLabel} to preview your import.
                </Text>
                <Pressable
                  style={[styles.primaryBtn, busy && styles.btnDisabled]}
                  disabled={busy}
                  onPress={() => void connectImportSource(activeSource)}>
                  {importLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>
                      Connect {sourceLabel}
                    </Text>
                  )}
                </Pressable>
              </View>
            )}

            <Pressable
              style={styles.switchBtn}
              disabled={busy}
              onPress={() => {
                setActiveSource(null);
                setImportPreview(null);
                setError(null);
                router.replace('/import-library');
              }}>
              <Text style={styles.switchBtnText}>Choose another source</Text>
            </Pressable>
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    marginBottom: 12,
    gap: 4,
  },
  back: { marginLeft: -2 },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 16,
  },
  lede: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
  },
  importGrid: {
    gap: 10,
  },
  importCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
  spotifyCard: {
    borderColor: 'rgba(34, 197, 94, 0.4)',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  soundcloudCard: {
    borderColor: 'rgba(249, 115, 22, 0.4)',
    backgroundColor: 'rgba(249, 115, 22, 0.1)',
  },
  youtubeCard: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  importTitle: {
    color: '#86efac',
    fontSize: 16,
    fontWeight: '700',
  },
  importTitleSc: {
    color: '#fdba74',
    fontSize: 16,
    fontWeight: '700',
  },
  importTitleYt: {
    color: '#fca5a5',
    fontSize: 16,
    fontWeight: '700',
  },
  importSub: {
    marginTop: 4,
    color: colors.textMuted,
    fontSize: 13,
  },
  previewBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    backgroundColor: 'rgba(0,0,0,0.25)',
    padding: 14,
    gap: 12,
  },
  previewHeading: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  previewLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 22,
  },
  previewActions: {
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.cardBorder,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  error: {
    color: '#fca5a5',
    fontSize: 14,
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  switchBtn: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  switchBtnText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.55,
  },
});
