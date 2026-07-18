import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/src/theme/colors';
import { formatPoundsFromPence } from '@/src/lib/format';
import { DEFAULT_PROFILE_PIC, type TuneBytesTagRanking, type User, type UserStats } from '@/src/types/user';

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
  if (rank === 1) return ['#f59e0b', '#fcd34d'];
  if (rank === 2) return ['#94a3b8', '#cbd5e1'];
  if (rank === 3) return ['#b45309', '#fdba74'];
  return ['#7c3aed', '#a855f7'];
}

type Props = {
  user: User;
  stats: UserStats | null;
  rankings: TuneBytesTagRanking[];
  isOwnProfile?: boolean;
  onWalletPress?: () => void;
};

export function UserProfileHero({
  user,
  stats,
  rankings,
  isOwnProfile = false,
  onWalletPress,
}: Props) {
  const location =
    user.homeLocation?.display ||
    user.homeLocation?.city ||
    user.homeLocation?.country;

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
            value={(user.tuneBytes ?? 0).toLocaleString()}
          />
          <Metric label="Tunes" value={String(stats?.uniqueSongsCount ?? 0)} />
        </View>

        <View style={styles.balanceRow}>
          <View>
            <Text style={styles.balanceLabel}>Wallet</Text>
            <Text style={styles.balanceValue}>
              {formatPoundsFromPence(user.balance)}
            </Text>
          </View>
          {isOwnProfile && onWalletPress ? (
            <Pressable style={styles.walletBtn} onPress={onWalletPress}>
              <Text style={styles.walletBtnText}>Top up</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {rankings.length > 0 ? (
        <View style={styles.badgesCard}>
          <Text style={styles.badgesTitle}>Champion badges</Text>
          <View style={styles.badgesWrap}>
            {rankings.map((ranking) => {
              const [border, bg] = badgeColors(ranking.rank);
              return (
                <View
                  key={`${ranking.tag}-${ranking.rank}`}
                  style={[
                    styles.badge,
                    { borderColor: border, backgroundColor: `${bg}22` },
                  ]}>
                  <Ionicons name="trophy-outline" size={14} color={border} />
                  <Text style={styles.badgeTag}>{ranking.tag}</Text>
                  <Text style={styles.badgeMeta}>#{ranking.rank}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}
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
  badgesTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
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
  badgeTag: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  badgeMeta: {
    color: colors.textMuted,
    fontSize: 11,
  },
});
