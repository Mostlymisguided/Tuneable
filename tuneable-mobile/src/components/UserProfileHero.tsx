import type { ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { colors } from '@/src/theme/colors';
import { formatPoundsFromPence, formatTuneBytes } from '@/src/lib/format';
import {
  DEFAULT_PROFILE_PIC,
  type MediaChampionTitle,
  type TipTagChampion,
  type TuneBytesTagRanking,
  type User,
  type UserStats,
} from '@/src/types/user';

function formatJoinDate(date: string | undefined): string {
  if (!date) return 'Recently joined';
  try {
    return `Member since ${new Date(date).toLocaleDateString(undefined, {
      month: 'short',
      year: 'numeric',
    })}`;
  } catch {
    return 'Recently joined';
  }
}

function roleLabel(role: string[] | undefined): string {
  if (!role?.length) return 'Member';
  if (role.includes('admin')) return 'Admin';
  if (role.includes('moderator')) return 'Moderator';
  if (role.includes('creator')) return 'Creator';
  return 'Member';
}

function badgeColors(rank: number) {
  if (rank === 1) return { border: '#f59e0b', bg: '#fcd34d', text: '#fde68a' };
  if (rank === 2) return { border: '#94a3b8', bg: '#cbd5e1', text: '#e2e8f0' };
  if (rank === 3) return { border: '#b45309', bg: '#fdba74', text: '#fdba74' };
  return { border: '#7c3aed', bg: '#a855f7', text: '#ddd6fe' };
}

type Props = {
  user: User;
  stats: UserStats | null;
  rankings: TuneBytesTagRanking[];
  tipTagChampions?: TipTagChampion[];
  mediaChampions?: MediaChampionTitle[];
  isOwnProfile?: boolean;
  onWalletPress?: () => void;
};

export function UserProfileHero({
  user,
  stats,
  rankings,
  tipTagChampions = [],
  mediaChampions = [],
  isOwnProfile = false,
  onWalletPress,
}: Props) {
  const location =
    user.homeLocation?.display ||
    user.homeLocation?.city ||
    user.homeLocation?.country;

  const tipTags = tipTagChampions.slice(0, 8);
  const mediaTitles = mediaChampions.slice(0, 8);
  const discovery = rankings.slice(0, 5);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.topRow}>
          <Image
            source={{ uri: user.profilePic || DEFAULT_PROFILE_PIC }}
            style={styles.avatar}
          />
          <View style={styles.identity}>
            <Text style={styles.name}>{user.username}</Text>
            <Text style={styles.memberSince}>{formatJoinDate(user.createdAt)}</Text>
            {location ? (
              <View style={styles.metaPill}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={styles.metaText}>{location}</Text>
              </View>
            ) : null}
            <View style={styles.metaPill}>
              <Ionicons
                name="ribbon-outline"
                size={14}
                color={colors.textMuted}
              />
              <Text style={styles.metaText}>{roleLabel(user.role)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.metrics}>
          <Metric label="Tips" value={String(stats?.totalBids ?? 0)} />
          <Metric
            label="TuneBytes"
            value={formatTuneBytes(user.tuneBytes)}
          />
          <Metric label="Tunes" value={String(stats?.uniqueSongsCount ?? 0)} />
        </View>

        {isOwnProfile ? (
          <View style={styles.balanceRow}>
            <View>
              <Text style={styles.balanceLabel}>Wallet</Text>
              <Text style={styles.balanceValue}>
                {formatPoundsFromPence(user.balance)}
              </Text>
            </View>
            {onWalletPress ? (
              <Pressable style={styles.walletBtn} onPress={onWalletPress}>
                <Text style={styles.walletBtnText}>Top up</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {tipTags.length > 0 ? (
        <BadgeSection
          icon="trophy"
          iconColor="#fbbf24"
          title={isOwnProfile ? 'Your Tip Champion Badges' : 'Tip Champion Badges'}>
          {tipTags.map((ranking) => {
            const palette = badgeColors(ranking.rank);
            return (
              <View
                key={`tip-${ranking.tag}-${ranking.rank}`}
                style={[
                  styles.badge,
                  {
                    borderColor: palette.border,
                    backgroundColor: `${palette.bg}22`,
                  },
                ]}>
                <Ionicons name="trophy" size={12} color={palette.border} />
                <Text style={styles.badgeText}>#{ranking.rank}</Text>
                <Text style={[styles.badgeMeta, { color: palette.text }]}>
                  #{ranking.tag}
                </Text>
              </View>
            );
          })}
        </BadgeSection>
      ) : null}

      {mediaTitles.length > 0 ? (
        <BadgeSection
          icon="musical-notes"
          iconColor="#fbbf24"
          title={isOwnProfile ? 'Your Tune Champion Badges' : 'Tune Champion Badges'}>
          {mediaTitles.map((title) => {
            const palette = badgeColors(title.rank);
            const id = title.uuid || title.mediaId;
            return (
              <Pressable
                key={`media-${title.mediaId}-${title.rank}`}
                onPress={() => {
                  if (id) router.push(`/tune/${id}`);
                }}
                style={[
                  styles.badge,
                  {
                    borderColor: palette.border,
                    backgroundColor: `${palette.bg}22`,
                    maxWidth: '100%',
                  },
                ]}>
                <Ionicons name="trophy" size={12} color={palette.border} />
                <Text style={styles.badgeText}>#{title.rank}</Text>
                <Text
                  style={[styles.badgeMeta, { color: palette.text, flexShrink: 1 }]}
                  numberOfLines={1}>
                  {title.title}
                </Text>
              </Pressable>
            );
          })}
        </BadgeSection>
      ) : null}

      {discovery.length > 0 ? (
        <BadgeSection
          icon="ribbon-outline"
          iconColor={colors.accentLight}
          title={isOwnProfile ? 'Your Discovery Badges' : 'Discovery Badges'}>
          {discovery.map((ranking) => {
            const palette = badgeColors(ranking.rank);
            return (
              <View
                key={`disc-${ranking.tag}-${ranking.rank}`}
                style={[
                  styles.badge,
                  {
                    borderColor: palette.border,
                    backgroundColor: `${palette.bg}22`,
                  },
                ]}>
                <Ionicons name="sparkles-outline" size={12} color={palette.border} />
                <Text style={styles.badgeText}>{ranking.tag}</Text>
                <Text style={styles.badgeMeta}>#{ranking.rank}</Text>
              </View>
            );
          })}
        </BadgeSection>
      ) : null}
    </View>
  );
}

function BadgeSection({
  icon,
  iconColor,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.badgesCard}>
      <View style={styles.badgesHeader}>
        <Ionicons name={icon} size={16} color={iconColor} />
        <Text style={styles.badgesTitle}>{title}</Text>
      </View>
      <View style={styles.badgesWrap}>{children}</View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 12,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 18,
    padding: 16,
  },
  topRow: {
    flexDirection: 'row',
    gap: 14,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  identity: {
    flex: 1,
    gap: 6,
  },
  name: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
  },
  memberSince: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  metaText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  metrics: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  metric: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.14)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  metricValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  metricLabel: {
    marginTop: 3,
    color: colors.textMuted,
    fontSize: 11,
  },
  balanceRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  balanceLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  balanceValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  walletBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  walletBtnText: {
    color: '#fff',
    fontWeight: '600',
  },
  badgesCard: {
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
  },
  badgesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  badgesTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  badgesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  badgeText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  badgeMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
});
