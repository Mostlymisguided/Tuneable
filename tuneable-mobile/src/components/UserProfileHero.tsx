import { Children, useState, type ReactNode } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { colors } from '@/src/theme/colors';
import { formatPoundsFromPence, formatTuneBytes } from '@/src/lib/format';
import {
  formatLocationLabel,
  getPlaceProfileHref,
} from '@/src/lib/location';
import { hasHomeLocation } from '@/src/lib/onboarding';
import { getTagProfileHref } from '@/src/lib/tagNormalizer';
import type { ResolvedLocation } from '@/src/types/user';
import {
  DEFAULT_PROFILE_PIC,
  type MediaChampionTitle,
  type TipTagChampion,
  type TuneBytesTagRanking,
  type User,
} from '@/src/types/user';

const DEFAULT_BADGE_VISIBLE = 3;
const MAX_BADGES = 8;

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

function elevatedRoleLabel(role: string[] | undefined): string | null {
  if (!role?.length) return null;
  if (role.includes('admin')) return 'Admin';
  if (role.includes('moderator')) return 'Moderator';
  if (role.includes('creator')) return 'Creator';
  return null;
}

function badgeColors(rank: number) {
  if (rank === 1) return { border: '#f59e0b', bg: '#fcd34d', text: '#fde68a' };
  if (rank === 2) return { border: '#94a3b8', bg: '#cbd5e1', text: '#e2e8f0' };
  if (rank === 3) return { border: '#b45309', bg: '#fdba74', text: '#fdba74' };
  return { border: '#7c3aed', bg: '#a855f7', text: '#ddd6fe' };
}

function normalizeSocialUrl(url: string): string {
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

type SocialLink = {
  name: string;
  url: string;
  color: string;
  icon: ReactNode;
};

type Props = {
  user: User;
  rankings: TuneBytesTagRanking[];
  tipTagChampions?: TipTagChampion[];
  mediaChampions?: MediaChampionTitle[];
  isOwnProfile?: boolean;
  onWalletPress?: () => void;
  onSettingsPress?: () => void;
};

export function UserProfileHero({
  user,
  rankings,
  tipTagChampions = [],
  mediaChampions = [],
  isOwnProfile = false,
  onWalletPress,
  onSettingsPress,
}: Props) {
  const homeLabel = formatLocationLabel(user.homeLocation);
  const secondaryLabel = formatLocationLabel(user.secondaryLocation);
  const homeSet = hasHomeLocation(user.homeLocation);
  const role = elevatedRoleLabel(user.role);
  const tipTags = tipTagChampions.slice(0, MAX_BADGES);
  const mediaTitles = mediaChampions.slice(0, MAX_BADGES);
  const discovery = rankings.slice(0, 5);

  const socialLinks: SocialLink[] = [];
  const sm = user.socialMedia;
  if (sm?.facebook) {
    socialLinks.push({
      name: 'Facebook',
      url: normalizeSocialUrl(sm.facebook),
      color: '#60a5fa',
      icon: <Ionicons name="logo-facebook" size={20} color="#60a5fa" />,
    });
  }
  if (sm?.soundcloud) {
    socialLinks.push({
      name: 'SoundCloud',
      url: normalizeSocialUrl(sm.soundcloud),
      color: '#fb923c',
      icon: <FontAwesome name="soundcloud" size={18} color="#fb923c" />,
    });
  }
  if (sm?.instagram) {
    socialLinks.push({
      name: 'Instagram',
      url: normalizeSocialUrl(sm.instagram),
      color: '#f472b6',
      icon: <Ionicons name="logo-instagram" size={20} color="#f472b6" />,
    });
  }

  const openSocial = (url: string) => {
    void Linking.openURL(url);
  };

  const openLocation = (
    location: ResolvedLocation | null | undefined,
    fallbackToSetHome = false
  ) => {
    const href = getPlaceProfileHref(location?.placeId);
    if (href) {
      router.push(href);
      return;
    }
    if (isOwnProfile && fallbackToSetHome) {
      router.push('/set-home-location');
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Image
          source={{ uri: user.profilePic || DEFAULT_PROFILE_PIC }}
          style={styles.avatar}
        />
        <View style={styles.identity}>
          <Text style={styles.name} numberOfLines={2}>
            {user.username}
          </Text>
          {homeSet && homeLabel ? (
            <Pressable
              onPress={() => openLocation(user.homeLocation, true)}
              style={styles.locationRow}
              accessibilityRole="button"
              accessibilityLabel={`Home location ${homeLabel}`}>
              <Ionicons
                name="location-outline"
                size={14}
                color={colors.textMuted}
              />
              <Text style={styles.location} numberOfLines={1}>
                {homeLabel}
              </Text>
            </Pressable>
          ) : isOwnProfile ? (
            <Pressable
              onPress={() => router.push('/set-home-location')}
              style={styles.locationRow}
              accessibilityRole="button"
              accessibilityLabel="Add home location">
              <Ionicons
                name="location-outline"
                size={14}
                color={colors.accentLight}
              />
              <Text style={[styles.location, styles.locationPrompt]} numberOfLines={1}>
                Add home location
              </Text>
            </Pressable>
          ) : null}
          {secondaryLabel ? (
            <Pressable
              onPress={() => openLocation(user.secondaryLocation)}
              disabled={!getPlaceProfileHref(user.secondaryLocation?.placeId)}
              style={styles.locationRow}
              accessibilityRole="button"
              accessibilityLabel={`Location ${secondaryLabel}`}>
              <Ionicons
                name="location-outline"
                size={14}
                color={colors.textMuted}
              />
              <Text style={styles.location} numberOfLines={1}>
                {secondaryLabel}
              </Text>
            </Pressable>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={styles.memberSince}>{formatJoinDate(user.createdAt)}</Text>
            {role ? (
              <View style={styles.rolePill}>
                <Text style={styles.roleText}>{role}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {onSettingsPress ? (
          <Pressable
            style={styles.gearBtn}
            onPress={onSettingsPress}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Settings">
            <Ionicons name="settings-outline" size={20} color={colors.text} />
          </Pressable>
        ) : null}
      </View>

      {isOwnProfile ? (
        <View style={styles.statsRow}>
          <View
            style={styles.statCard}
            accessibilityLabel={`${formatTuneBytes(user.tuneBytes)} TuneBytes`}>
            <View style={styles.statTop}>
              <Ionicons
                name="sparkles-outline"
                size={16}
                color={colors.accentLight}
              />
              <Text style={styles.statLabel}>TuneBytes</Text>
            </View>
            <Text style={styles.statValue} numberOfLines={1}>
              {formatTuneBytes(user.tuneBytes)}
            </Text>
          </View>
          <Pressable
            style={[styles.statCard, styles.walletCard]}
            onPress={onWalletPress}
            disabled={!onWalletPress}
            accessibilityRole="button"
            accessibilityLabel={`Wallet ${formatPoundsFromPence(user.balance)}. Top up`}>
            <View style={styles.statTop}>
              <Ionicons name="wallet-outline" size={16} color={colors.accentLight} />
              <Text style={styles.statLabel}>Wallet</Text>
            </View>
            <Text style={styles.statValue} numberOfLines={1}>
              {formatPoundsFromPence(user.balance)}
            </Text>
            {onWalletPress ? (
              <View style={styles.topUpRow}>
                <Text style={styles.topUpText}>Top up</Text>
                <Ionicons
                  name="chevron-forward"
                  size={12}
                  color={colors.accentLight}
                />
              </View>
            ) : null}
          </Pressable>
        </View>
      ) : (
        <View style={styles.tbRow}>
          <Ionicons
            name="sparkles-outline"
            size={14}
            color={colors.accentLight}
          />
          <Text style={styles.tbValue}>{formatTuneBytes(user.tuneBytes)}</Text>
          <Text style={styles.tbLabel}>TuneBytes</Text>
        </View>
      )}

      {socialLinks.length > 0 ? (
        <View style={styles.socialRow}>
          {socialLinks.map((social) => (
            <Pressable
              key={social.name}
              accessibilityLabel={social.name}
              onPress={() => openSocial(social.url)}
              style={[styles.socialBtn, { borderColor: `${social.color}55` }]}>
              {social.icon}
            </Pressable>
          ))}
        </View>
      ) : null}

      {tipTags.length > 0 ? (
        <BadgeSection
          icon="trophy"
          iconColor="#fbbf24"
          title={isOwnProfile ? 'Your Tip Champion Badges' : 'Tip Champion Badges'}>
          {tipTags.map((ranking) => {
            const palette = badgeColors(ranking.rank);
            return (
              <Pressable
                key={`tip-${ranking.tag}-${ranking.rank}`}
                onPress={() =>
                  router.push(getTagProfileHref(ranking.tag) as Href)
                }
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
              </Pressable>
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
                  style={[
                    styles.badgeMeta,
                    { color: palette.text, flexShrink: 1 },
                  ]}
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
              <Pressable
                key={`disc-${ranking.tag}-${ranking.rank}`}
                onPress={() =>
                  router.push(getTagProfileHref(ranking.tag) as Href)
                }
                style={[
                  styles.badge,
                  {
                    borderColor: palette.border,
                    backgroundColor: `${palette.bg}22`,
                  },
                ]}>
                <Ionicons
                  name="sparkles-outline"
                  size={12}
                  color={palette.border}
                />
                <Text style={styles.badgeText}>{ranking.tag}</Text>
                <Text style={styles.badgeMeta}>#{ranking.rank}</Text>
              </Pressable>
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
  defaultVisible = DEFAULT_BADGE_VISIBLE,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  title: string;
  children: ReactNode;
  defaultVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const hiddenCount = Math.max(0, items.length - defaultVisible);
  const overflows = hiddenCount > 0;
  const visible =
    expanded || !overflows ? items : items.slice(0, defaultVisible);

  return (
    <View style={styles.badgeSection}>
      <View style={styles.badgesHeader}>
        <Ionicons name={icon} size={16} color={iconColor} />
        {overflows ? (
          <Pressable
            onPress={() => setExpanded((v) => !v)}
            style={styles.badgesHeaderTap}
            accessibilityRole="button"
            accessibilityLabel={expanded ? `Collapse ${title}` : `Expand ${title}`}
            accessibilityState={{ expanded }}
            hitSlop={8}>
            <Text style={styles.badgesTitle}>{title}</Text>
            <Ionicons
              name={expanded ? 'remove' : 'add'}
              size={16}
              color={colors.textMuted}
            />
          </Pressable>
        ) : (
          <Text style={styles.badgesTitle}>{title}</Text>
        )}
      </View>
      <View style={styles.badgesWrap}>{visible}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(168, 85, 247, 0.45)',
  },
  identity: {
    flex: 1,
    minWidth: 0,
    paddingTop: 2,
  },
  name: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 5,
  },
  location: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  locationPrompt: {
    color: colors.accentLight,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  memberSince: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(168, 85, 247, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  roleText: {
    color: colors.accentLight,
    fontSize: 11,
    fontWeight: '700',
  },
  gearBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderColor: colors.cardBorder,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  walletCard: {
    backgroundColor: 'rgba(126, 34, 206, 0.28)',
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statValue: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.3,
  },
  topUpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 6,
  },
  topUpText: {
    color: colors.accentLight,
    fontSize: 12,
    fontWeight: '700',
  },
  tbRow: {
    marginTop: 14,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(126, 34, 206, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.35)',
  },
  tbValue: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  tbLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  badgeSection: {
    marginTop: 16,
  },
  badgesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  badgesHeaderTap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgesTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    flexShrink: 1,
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
  socialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 14,
  },
  socialBtn: {
    width: 42,
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
