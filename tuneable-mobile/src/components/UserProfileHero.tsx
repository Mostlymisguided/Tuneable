import { Children, useState, type ReactNode } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { FontAwesome, Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { colors } from '@/src/theme/colors';
import { formatPoundsFromPence } from '@/src/lib/format';
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

function roleLabel(role: string[] | undefined): string {
  if (!role?.length) return 'Member';
  if (role.includes('admin')) return 'Admin';
  if (role.includes('moderator')) return 'Moderator';
  if (role.includes('creator')) return 'Creator';
  return 'Member';
}

function locationLabel(location: ResolvedLocation | null | undefined): string | null {
  if (!location) return null;
  if (location.display) return location.display;
  if (location.city && location.country) {
    return `${location.city}, ${location.country}`;
  }
  if (location.city && location.countryCode) {
    return `${location.city}, ${location.countryCode}`;
  }
  return location.city || location.region || location.country || null;
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
};

export function UserProfileHero({
  user,
  rankings,
  tipTagChampions = [],
  mediaChampions = [],
  isOwnProfile = false,
  onWalletPress,
}: Props) {
  const homeLabel = locationLabel(user.homeLocation);
  const secondaryLabel = locationLabel(user.secondaryLocation);
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
            {homeLabel ? (
              <View style={styles.metaPill}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={styles.metaText}>{homeLabel}</Text>
              </View>
            ) : null}
            {secondaryLabel ? (
              <View style={styles.metaPill}>
                <Ionicons
                  name="location-outline"
                  size={14}
                  color={colors.textMuted}
                />
                <Text style={styles.metaText}>{secondaryLabel}</Text>
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

        {tipTags.length > 0 ? (
          <BadgeSection
            icon="trophy"
            iconColor="#fbbf24"
            title={isOwnProfile ? 'Your Tip Champion Badges' : 'Tip Champion Badges'}>
            <CollapsibleBadgeWrap>
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
            </CollapsibleBadgeWrap>
          </BadgeSection>
        ) : null}

        {mediaTitles.length > 0 ? (
          <BadgeSection
            icon="musical-notes"
            iconColor="#fbbf24"
            title={isOwnProfile ? 'Your Tune Champion Badges' : 'Tune Champion Badges'}>
            <CollapsibleBadgeWrap>
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
            </CollapsibleBadgeWrap>
          </BadgeSection>
        ) : null}

        {discovery.length > 0 ? (
          <BadgeSection
            icon="ribbon-outline"
            iconColor={colors.accentLight}
            title={isOwnProfile ? 'Your Discovery Badges' : 'Discovery Badges'}>
            <CollapsibleBadgeWrap>
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
            </CollapsibleBadgeWrap>
          </BadgeSection>
        ) : null}

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
    </View>
  );
}

function CollapsibleBadgeWrap({
  children,
  defaultVisible = DEFAULT_BADGE_VISIBLE,
}: {
  children: ReactNode;
  defaultVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children);
  const hiddenCount = Math.max(0, items.length - defaultVisible);
  const visible =
    expanded || hiddenCount === 0 ? items : items.slice(0, defaultVisible);

  return (
    <View>
      <View style={styles.badgesWrap}>{visible}</View>
      {hiddenCount > 0 ? (
        <Pressable onPress={() => setExpanded((v) => !v)} hitSlop={8}>
          <Text style={styles.showMore}>
            {expanded ? 'Show less' : `Show all (${hiddenCount} more)`}
          </Text>
        </Pressable>
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
    <View style={styles.badgeSection}>
      <View style={styles.badgesHeader}>
        <Ionicons name={icon} size={16} color={iconColor} />
        <Text style={styles.badgesTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
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
    flexShrink: 1,
  },
  balanceRow: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.cardBorder,
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
  badgeSection: {
    marginTop: 16,
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
  showMore: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  socialRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
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
