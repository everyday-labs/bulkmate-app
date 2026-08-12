import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Linking,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import * as Notifications from 'expo-notifications';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { requestAndSavePushToken } from '../../lib/notifications';
import { posthog } from '../../lib/posthog';
import { useTheme, type ThemeMode } from '../../contexts/ThemeContext';
import type { ColorScheme } from '../../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../../constants/theme';
import { Sparkle, Shimmer, BellRing, Twinkle, CartRoll } from '../../components/Motion';

type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'loading';

type Badge = {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
  trigger_key: string | null;
};

type BadgeRarity = 'Common' | 'Rare' | 'Legendary';

// Same three-tier language as `warehouse_tier` in the DB — ties the badge
// collection into the same rarity system as warehouse check-ins.
const BADGE_RARITY: Record<string, BadgeRarity> = {
  first_checkin: 'Common',
  five_checkins: 'Common',
  three_warehouses: 'Common',
  ten_checkins: 'Rare',
  five_warehouses: 'Rare',
  ten_stars: 'Rare',
  rare_warehouse: 'Rare',
  legendary_warehouse: 'Legendary',
  gold_star_guru: 'Legendary',
  executive_explorer: 'Legendary',
};

function rarityColor(Colors: ColorScheme, rarity: BadgeRarity): string {
  if (rarity === 'Legendary') return Colors.goldStarAccent;
  if (rarity === 'Rare') return Colors.executiveNavy;
  return Colors.gray[400];
}

type ProfileData = {
  total_stars: number;
  fan_tier: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone_number: string | null;
};

// ---------------------------------------------------------------------------
// Fan tier metadata
// ---------------------------------------------------------------------------

type TierMeta = { label: string; emoji: string; color: string; nextAt: number | null };

function buildTierMeta(Colors: ColorScheme): Record<string, TierMeta> {
  return {
    KirklandCadet:     { label: 'Kirkland Cadet',      emoji: '🛒', color: Colors.gray[500],        nextAt: 3  },
    WholesaleWanderer: { label: 'Wholesale Wanderer',   emoji: '🗺',  color: Colors.executiveNavy,    nextAt: 6  },
    BulkBuyer:         { label: 'Bulk Buyer',           emoji: '📦', color: Colors.savings,           nextAt: 11 },
    GoldStarGuru:      { label: 'Gold Star Guru',       emoji: '🌟', color: Colors.goldStarAccent,    nextAt: 21 },
    ExecutiveExplorer: { label: 'Executive Explorer',   emoji: '👑', color: Colors.costcoRed,         nextAt: null },
  };
}

const TIER_MIN: Record<string, number> = {
  KirklandCadet: 1, WholesaleWanderer: 3, BulkBuyer: 6, GoldStarGuru: 11, ExecutiveExplorer: 21,
};

const TIER_ORDER = ['KirklandCadet', 'WholesaleWanderer', 'BulkBuyer', 'GoldStarGuru', 'ExecutiveExplorer'];

function tierProgress(tierMeta: Record<string, TierMeta>, tier: string, stars: number): number {
  const meta = tierMeta[tier];
  if (!meta || meta.nextAt === null) return 1;
  const min = TIER_MIN[tier] ?? 1;
  return Math.min(1, (stars - min) / (meta.nextAt - min));
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { mode, setMode, colors: Colors } = useTheme();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const tierMeta = useMemo(() => buildTierMeta(Colors), [Colors]);
  const [permStatus, setPermStatus] = useState<PermissionStatus>('loading');
  const [enablingNotifs, setEnablingNotifs] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [allBadges, setAllBadges] = useState<Badge[]>([]);
  const [earnedMap, setEarnedMap] = useState<Record<string, string>>({});
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Notifications.getPermissionsAsync().then(({ status }) => {
        setPermStatus(status as PermissionStatus);
      });
      loadProfile(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user.id]),
  );

  async function loadProfile(isRefresh: boolean) {
    if (isRefresh) setRefreshing(true);
    else setLoadingProfile(true);

    try {
      const userId = session?.user.id;
      if (!userId) return;

      const [{ data: profileData }, { data: badgesData }, { data: userBadgesData }] = await Promise.all([
        supabase
          .from('profiles')
          .select('total_stars, fan_tier, display_name, first_name, last_name, phone_number')
          .eq('id', userId)
          .single(),
        supabase
          .from('badges')
          .select('id, name, description, icon, trigger_key'),
        supabase
          .from('user_badges')
          .select('badge_id, earned_at')
          .eq('user_id', userId),
      ]);

      if (profileData) setProfile(profileData as ProfileData);
      setAllBadges((badgesData ?? []) as Badge[]);
      setEarnedMap(
        Object.fromEntries((userBadgesData ?? []).map((ub: any) => [ub.badge_id, ub.earned_at])),
      );
    } catch {
      // non-critical
    } finally {
      setLoadingProfile(false);
      setRefreshing(false);
    }
  }

  async function handleEnableNotifications() {
    setEnablingNotifs(true);
    try {
      const result = await requestAndSavePushToken();
      setPermStatus(result === 'granted' ? 'granted' : 'denied');
      if (result === 'granted') posthog?.capture('notifications_enabled');
    } finally {
      setEnablingNotifs(false);
    }
  }

  const email = session?.user.email ?? '';
  const firstName = profile?.first_name ?? '';
  const lastName  = profile?.last_name  ?? '';
  const displayName = firstName || lastName
    ? [firstName, lastName].filter(Boolean).join(' ')
    : null;
  const tier = profile?.fan_tier ?? 'KirklandCadet';
  const currentTierMeta = tierMeta[tier] ?? tierMeta.KirklandCadet;
  const stars = profile?.total_stars ?? 0;
  const progress = tierProgress(tierMeta, tier, stars);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing['3xl'] }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => loadProfile(true)}
          tintColor={Colors.costcoRed}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.avatarRing}>
          <View style={styles.avatar}>
            <MemberBadgeIllustration size={36} />
          </View>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.memberLabel}>MEMBER</Text>
          {displayName
            ? <>
                <Text style={styles.nameText} numberOfLines={1}>{displayName}</Text>
                <Text style={styles.emailSubText} numberOfLines={1}>{email}</Text>
              </>
            : <Text style={styles.emailText} numberOfLines={1}>{email}</Text>
          }
        </View>
        <Pressable
          onPress={() => router.push('/edit-profile')}
          hitSlop={8}
          style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.editBtnText}>Edit</Text>
        </Pressable>
      </View>

      <View style={styles.body}>

        {/* ── Fan Tier Card ── */}
        {loadingProfile ? (
          <View style={styles.tierCardSkeleton}>
            <ActivityIndicator color={Colors.costcoRed} />
          </View>
        ) : (
          <View style={styles.tierCard}>
            {/* Top: emoji + tier name + stars */}
            <View style={styles.tierTop}>
              <View style={[styles.tierEmojiWrap, { backgroundColor: currentTierMeta.color + '18' }]}>
                {currentTierMeta.emoji === '🛒' ? (
                  <CartRoll><Text style={styles.tierEmoji}>{currentTierMeta.emoji}</Text></CartRoll>
                ) : (
                  <Text style={styles.tierEmoji}>{currentTierMeta.emoji}</Text>
                )}
              </View>
              <View style={styles.tierInfo}>
                <Text style={styles.tierLabel}>FAN TIER</Text>
                <Text style={[styles.tierName, { color: currentTierMeta.color }]}>{currentTierMeta.label}</Text>
              </View>
              <View style={styles.starsWrap}>
                <Text style={styles.starsCount}>{stars}</Text>
                <Twinkle><Text style={styles.starsSuffix}>⭐</Text></Twinkle>
              </View>
            </View>

            {/* Progress bar */}
            {currentTierMeta.nextAt !== null ? (
              <View style={styles.progressSection}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: currentTierMeta.color }]} />
                </View>
                <Text style={styles.progressLabel}>
                  {currentTierMeta.nextAt - stars} more {currentTierMeta.nextAt - stars === 1 ? 'star' : 'stars'} to {tierMeta[nextTierKey(tier)]?.label ?? 'next tier'}
                </Text>
              </View>
            ) : (
              <View style={styles.progressSection}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: '100%', backgroundColor: currentTierMeta.color }]} />
                </View>
                <Text style={styles.progressLabel}>Maximum tier reached 🎉</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Fan Tier Ladder ── */}
        {!loadingProfile && (
          <>
            <Text style={styles.sectionLabel}>FAN TIER LADDER</Text>
            <View style={styles.ladderCard}>
              {TIER_ORDER.map((key) => {
                const meta = tierMeta[key];
                const reached = stars >= TIER_MIN[key];
                const isCurrent = key === tier;
                return (
                  <View key={key} style={styles.ladderRow}>
                    <View
                      style={[
                        styles.ladderDot,
                        reached && { backgroundColor: meta.color, borderColor: meta.color },
                        isCurrent && styles.ladderDotCurrent,
                      ]}
                    />
                    <View style={styles.ladderBody}>
                      <Text style={[styles.ladderTierName, reached && styles.ladderTierNameReached]}>
                        {meta.label}
                      </Text>
                      <Text style={styles.ladderThreshold}>{TIER_MIN[key]}+ stars</Text>
                    </View>
                    {isCurrent ? (
                      <View style={styles.currentChip}>
                        <Text style={styles.currentChipText}>YOU</Text>
                      </View>
                    ) : reached ? (
                      <Text style={styles.ladderCheck}>✓</Text>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Badges ── */}
        <View style={styles.badgesHeaderRow}>
          <Text style={styles.sectionLabel}>YOUR BADGES</Text>
          {!loadingProfile && allBadges.length > 0 && (
            <Text style={styles.badgesCount}>
              {Object.keys(earnedMap).length}/{allBadges.length} unlocked
            </Text>
          )}
        </View>
        {loadingProfile ? (
          <View style={styles.badgesSkeleton}>
            <ActivityIndicator color={Colors.costcoRed} />
          </View>
        ) : allBadges.length === 0 ? (
          <View style={styles.emptyBadges}>
            <Text style={styles.emptyBadgesIcon}>🏅</Text>
            <Text style={styles.emptyBadgesText}>Check in at a Costco to earn your first badge</Text>
          </View>
        ) : (
          <View style={styles.badgesGrid}>
            {allBadges.map((badge) => {
              const earnedAt = earnedMap[badge.id];
              const unlocked = !!earnedAt;
              const rarity = BADGE_RARITY[badge.trigger_key ?? ''] ?? 'Common';
              const rColor = rarityColor(Colors, rarity);
              const isLegendary = unlocked && rarity === 'Legendary';
              return (
                <View key={badge.id} style={[styles.badgeCard, !unlocked && styles.badgeCardLocked]}>
                  {isLegendary && <Shimmer width={40} style={styles.badgeShimmerClip} />}
                  <View style={[styles.badgeIconWrap, unlocked && { backgroundColor: rColor + '22' }]}>
                    <Text style={[styles.badgeIcon, !unlocked && styles.badgeIconLocked]}>
                      {unlocked ? (badge.icon ?? '🏅') : '🔒'}
                    </Text>
                    {isLegendary && (
                      <>
                        <Sparkle size={9} color={rColor} delay={200} style={styles.badgeSparkleTL} />
                        <Sparkle size={7} color={rColor} delay={600} style={styles.badgeSparkleBR} />
                      </>
                    )}
                  </View>
                  <Text style={[styles.badgeName, !unlocked && styles.badgeNameLocked]} numberOfLines={2}>
                    {badge.name}
                  </Text>
                  <Text style={[styles.badgeRarity, { color: rColor }]}>{rarity}</Text>
                  {unlocked && (
                    <Text style={styles.badgeDate}>
                      {new Date(earnedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ── Preferences ── */}
        <Text style={styles.sectionLabel}>PREFERENCES</Text>
        <View style={styles.settingsCard}>
          <Pressable
            style={({ pressed }) => [styles.settingsRow, pressed && styles.rowPressed]}
            onPress={() => router.push('/edit-profile')}
          >
            <View style={styles.rowIconWrap}>
              <Text style={styles.rowIcon}>✏️</Text>
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Edit Profile</Text>
              <Text style={styles.rowSubtitle}>Name, phone number for SMS alerts</Text>
            </View>
            <Text style={styles.rowChevron}>›</Text>
          </Pressable>

          <View style={styles.rowSeparator} />

          <View style={styles.settingsRow}>
            <View style={styles.rowIconWrap}>
              <BellRing><Text style={styles.rowIcon}>🔔</Text></BellRing>
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Price Alerts</Text>
              <Text style={styles.rowSubtitle}>
                {permStatus === 'granted'
                  ? 'Notified when prices drop on your purchases'
                  : 'Get notified when you may be owed a refund'}
              </Text>
            </View>
            <NotifControl
              status={permStatus}
              loading={enablingNotifs}
              onEnable={handleEnableNotifications}
              onOpenSettings={() => Linking.openSettings()}
              styles={styles}
              Colors={Colors}
            />
          </View>

          <View style={styles.rowSeparator} />

          <View style={styles.settingsRow}>
            <View style={styles.rowIconWrap}>
              <Text style={styles.rowIcon}>🌓</Text>
            </View>
            <View style={styles.rowContent}>
              <Text style={styles.rowTitle}>Appearance</Text>
              <Text style={styles.rowSubtitle}>Light, dark, or match your device</Text>
            </View>
          </View>
          <View style={styles.themeSegmentRow}>
            {(['light', 'dark', 'system'] as ThemeMode[]).map((option) => (
              <Pressable
                key={option}
                style={({ pressed }) => [
                  styles.themeSegment,
                  mode === option && styles.themeSegmentActive,
                  pressed && { opacity: 0.8 },
                ]}
                onPress={() => setMode(option)}
              >
                <Text style={[styles.themeSegmentText, mode === option && styles.themeSegmentTextActive]}>
                  {option === 'light' ? 'Light' : option === 'dark' ? 'Dark' : 'System'}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.rowSeparator} />

          <Pressable
            style={({ pressed }) => [styles.settingsRow, pressed && styles.rowPressed]}
            onPress={() => supabase.auth.signOut()}
          >
            <View style={[styles.rowIconWrap, styles.rowIconDanger]}>
              <Text style={styles.rowIcon}>→</Text>
            </View>
            <View style={styles.rowContent}>
              <Text style={[styles.rowTitle, { color: Colors.costcoRed }]}>Sign Out</Text>
              <Text style={styles.rowSubtitle}>You can sign back in anytime</Text>
            </View>
          </Pressable>
        </View>

        {/* ── About ── */}
        <Text style={styles.sectionLabel}>ABOUT</Text>
        <View style={styles.aboutCard}>
          <View style={styles.aboutBuiltBy}>
            <View style={styles.aboutAvatar}>
              <TinkerIllustration size={48} />
            </View>
            <View style={styles.aboutBuiltByText}>
              <Text style={styles.aboutName}>Tinker</Text>
              <Text style={styles.aboutRole}>Builder · Tech Enthusiast · Dota Noob</Text>
            </View>
          </View>

          <Text style={styles.aboutMission}>
            I build side projects in my spare time to solve personal pain points and share them with the world. This app started because I kept missing Costco price-match windows and losing receipts — so I built something about it.
          </Text>

          <View style={styles.aboutDivider} />

          <View style={styles.aboutPillRow}>
            <View style={styles.aboutPill}>
              <Text style={styles.aboutPillText}>Open Source · MIT</Text>
            </View>
          </View>

          <Text style={styles.aboutDisclaimer}>
            Not affiliated with or endorsed by Costco Wholesale Corporation. Provided as-is — no warranties, no liability. Prices shown are crowdsourced and may not be accurate.
          </Text>
        </View>

        <Text style={styles.version}>Costco Companion · v1.0.0 · MIT License</Text>
      </View>
    </ScrollView>
  );
}

function nextTierKey(current: string): string {
  const order = ['KirklandCadet', 'WholesaleWanderer', 'BulkBuyer', 'GoldStarGuru', 'ExecutiveExplorer'];
  const idx = order.indexOf(current);
  return order[idx + 1] ?? current;
}

// Generic member avatar — a membership-badge shape (clip tab + rounded body,
// like an ID badge on a lanyard) with a simple person silhouette inside.
// Stands in for a profile photo since the app has no picture-upload feature;
// every member gets this same badge rather than photo-derived initials.
function MemberBadgeIllustration({ size = 48 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {/* clip/tab at top, like a badge on a lanyard */}
      <Rect x="18" y="3" width="12" height="9" rx="3" fill="#C9A84C" />
      {/* badge body */}
      <Rect x="7" y="9" width="34" height="36" rx="9" fill="#C9A84C" />
      {/* inner panel */}
      <Rect x="10.5" y="12.5" width="27" height="29" rx="6.5" fill="#1B2A4A" />
      {/* person: head + shoulders */}
      <Circle cx="24" cy="23.5" r="6" fill="#FFFFFF" />
      <Path d="M13 39 C13 30.5 18 27.5 24 27.5 C30 27.5 35 30.5 35 39 Z" fill="#FFFFFF" />
    </Svg>
  );
}

// Minimal flat illustration for the "About" card — a person tinkering with a
// gear/robotic part, standing in for an actual photo of "Tinker".
function TinkerIllustration({ size = 48 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {/* head + shoulders */}
      <Circle cx="19" cy="16" r="7" fill="#FFFFFF" opacity={0.95} />
      <Path
        d="M7 40 C7 28.5 12 24 19 24 C26 24 31 28.5 31 40 Z"
        fill="#FFFFFF"
        opacity={0.95}
      />
      {/* gear the figure is tinkering with */}
      <G transform="translate(33,33)">
        {[0, 60, 120, 180, 240, 300].map((deg) => (
          <Rect key={deg} x={-2} y={-10} width={4} height={5} rx={1} fill="#C9A84C" transform={`rotate(${deg})`} />
        ))}
        <Circle cx={0} cy={0} r={7} fill="#C9A84C" />
        <Circle cx={0} cy={0} r={3} fill="#1B2A4A" />
      </G>
    </Svg>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function NotifControl({
  status, loading, onEnable, onOpenSettings, styles, Colors,
}: {
  status: PermissionStatus; loading: boolean; onEnable: () => void; onOpenSettings: () => void;
  styles: Styles; Colors: ColorScheme;
}) {
  if (status === 'loading') return <ActivityIndicator size="small" color={Colors.gray[400]} />;
  if (status === 'granted') {
    return (
      <View style={styles.statusBadge}>
        <View style={styles.statusDot} />
        <Text style={styles.statusOn}>On</Text>
      </View>
    );
  }
  if (status === 'undetermined') {
    return (
      <Pressable
        style={({ pressed }) => [styles.ctaBtn, pressed && styles.ctaBtnPressed]}
        onPress={onEnable}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator size="small" color={Colors.white} />
          : <Text style={styles.ctaBtnText}>Enable</Text>
        }
      </Pressable>
    );
  }
  return (
    <Pressable
      style={({ pressed }) => [styles.outlineBtn, pressed && { opacity: 0.7 }]}
      onPress={onOpenSettings}
    >
      <Text style={styles.outlineBtnText}>Settings</Text>
    </Pressable>
  );
}

const makeStyles = (Colors: ColorScheme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    backgroundColor: Colors.surface,
    paddingHorizontal: spacing['2xl'],
    paddingBottom: spacing.xl,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    ...shadow.sm,
  },
  avatarRing: {
    padding: 3,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: Colors.costcoRed,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: Colors.navySolid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: { flex: 1 },
  memberLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.costcoRed,
    letterSpacing: letterSpacing.caps,
    marginBottom: 2,
  },
  nameText: { fontSize: fontSize.md, fontWeight: '700', color: Colors.gray[900] },
  emailSubText: { fontSize: fontSize.xs, color: Colors.gray[400], marginTop: 1 },
  emailText: { fontSize: fontSize.md, fontWeight: '600', color: Colors.gray[800] },
  editBtn: {
    borderWidth: 1.5,
    borderColor: Colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  editBtnText: { fontSize: fontSize.sm, fontWeight: '600', color: Colors.gray[600] },

  body: { padding: spacing['2xl'], gap: spacing.xl },

  // Fan Tier Card
  tierCard: {
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    ...shadow.md,
    marginBottom: spacing.xs,
  },
  tierCardSkeleton: {
    height: 120,
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow.sm,
    marginBottom: spacing.xs,
  },
  tierTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginBottom: spacing.lg },
  tierEmojiWrap: {
    width: 56,
    height: 56,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierEmoji: { fontSize: 28 },
  tierInfo: { flex: 1 },
  tierLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.gray[400],
    letterSpacing: letterSpacing.caps,
    marginBottom: 3,
  },
  tierName: { fontSize: fontSize.xl, fontWeight: '800', letterSpacing: letterSpacing.tight },
  starsWrap: { alignItems: 'center' },
  starsCount: { fontSize: fontSize['3xl'], fontWeight: '800', color: Colors.gray[900], lineHeight: 36 },
  starsSuffix: { fontSize: 16 },

  progressSection: { gap: spacing.sm },
  progressTrack: {
    height: 8,
    backgroundColor: Colors.gray[100],
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: radius.pill },
  progressLabel: { fontSize: fontSize.xs, color: Colors.gray[400], fontWeight: '500' },

  // Section label
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.gray[400],
    letterSpacing: letterSpacing.caps,
    textTransform: 'uppercase',
    paddingLeft: spacing.xs,
  },

  // Fan tier ladder
  ladderCard: {
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  ladderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ladderDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.gray[100],
    borderWidth: 2,
    borderColor: Colors.border,
  },
  ladderDotCurrent: { width: 14, height: 14, borderRadius: 7 },
  ladderBody: { flex: 1 },
  ladderTierName: { fontSize: fontSize.sm, fontWeight: '600', color: Colors.gray[400] },
  ladderTierNameReached: { fontWeight: '700', color: Colors.gray[900] },
  ladderThreshold: { fontSize: 10, color: Colors.gray[400], marginTop: 1 },
  ladderCheck: { fontSize: fontSize.md, color: Colors.success, fontWeight: '700' },
  currentChip: {
    backgroundColor: Colors.costcoRedSubtle,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  currentChipText: { fontSize: 10, fontWeight: '800', color: Colors.costcoRed, letterSpacing: letterSpacing.caps },

  // Badges
  badgesHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badgesCount: { fontSize: fontSize.xs, color: Colors.gray[400], fontWeight: '600' },
  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  badgeCard: {
    width: '30%',
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    overflow: 'hidden',
    ...shadow.sm,
  },
  badgeCardLocked: { opacity: 0.55, ...shadow.sm, shadowOpacity: 0 },
  badgeShimmerClip: { borderRadius: radius.xl },
  badgeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
    position: 'relative',
  },
  badgeSparkleTL: { position: 'absolute', top: -2, left: 0 },
  badgeSparkleBR: { position: 'absolute', bottom: 2, right: -1 },
  badgeIcon: { fontSize: 24 },
  badgeIconLocked: { opacity: 0.5 },
  badgeName: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.gray[800],
    textAlign: 'center',
    lineHeight: 15,
  },
  badgeNameLocked: { color: Colors.gray[400] },
  badgeRarity: { fontSize: 9, fontWeight: '800', letterSpacing: letterSpacing.caps },
  badgeDate: { fontSize: 10, color: Colors.gray[400] },

  badgesSkeleton: {
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBadges: {
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    padding: spacing['2xl'],
    alignItems: 'center',
    gap: spacing.md,
    ...shadow.sm,
  },
  emptyBadgesIcon: { fontSize: 36 },
  emptyBadgesText: {
    fontSize: fontSize.sm,
    color: Colors.gray[400],
    textAlign: 'center',
    lineHeight: 20,
  },

  // Settings
  settingsCard: {
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    overflow: 'hidden',
    ...shadow.md,
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    minHeight: 64,
  },
  rowPressed: { backgroundColor: Colors.gray[50] },
  rowIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.lg,
    backgroundColor: Colors.executiveNavySubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: { backgroundColor: Colors.costcoRedSubtle },
  rowIcon: { fontSize: 18 },
  rowContent: { flex: 1 },
  rowTitle: { fontSize: fontSize.md, fontWeight: '600', color: Colors.gray[800], marginBottom: 2 },
  rowSubtitle: { fontSize: fontSize.xs, color: Colors.gray[400], lineHeight: 16 },
  rowSeparator: { height: 1, backgroundColor: Colors.border, marginLeft: 74 },
  themeSegmentRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    backgroundColor: Colors.gray[50],
  },
  themeSegment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: Colors.surface,
  },
  themeSegmentActive: { backgroundColor: Colors.navySolid },
  themeSegmentText: { fontSize: fontSize.sm, fontWeight: '600', color: Colors.gray[600] },
  themeSegmentTextActive: { color: Colors.white },
  rowChevron: { fontSize: 22, color: Colors.gray[300], fontWeight: '300' },

  // Notif controls
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: Colors.successBg, paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs, borderRadius: radius.pill,
  },
  statusDot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: Colors.success },
  statusOn: { fontSize: fontSize.sm, fontWeight: '700', color: Colors.success },
  ctaBtn: {
    backgroundColor: Colors.costcoRedSolid, paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm, borderRadius: radius.md, minWidth: 72, alignItems: 'center',
  },
  ctaBtnPressed: { backgroundColor: Colors.costcoRedDark },
  ctaBtnText: { color: Colors.white, fontSize: fontSize.sm, fontWeight: '700' },
  outlineBtn: {
    borderWidth: 1.5, borderColor: Colors.border, paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1, borderRadius: radius.md,
  },
  outlineBtnText: { color: Colors.gray[600], fontSize: fontSize.sm, fontWeight: '600' },

  // About card
  aboutCard: {
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    gap: spacing.lg,
    ...shadow.md,
  },
  aboutBuiltBy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  aboutAvatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: Colors.navySolid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutBuiltByText: { flex: 1 },
  aboutName: { fontSize: fontSize.md, fontWeight: '700', color: Colors.gray[900] },
  aboutRole: { fontSize: fontSize.xs, color: Colors.gray[400], marginTop: 2 },
  aboutMission: {
    fontSize: fontSize.sm,
    color: Colors.gray[600],
    lineHeight: 21,
  },
  aboutDivider: { height: 1, backgroundColor: Colors.border },
  aboutPillRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  aboutPill: {
    backgroundColor: Colors.executiveNavySubtle,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  aboutPillText: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.executiveNavy,
    letterSpacing: letterSpacing.wide,
  },
  aboutDisclaimer: {
    fontSize: 11,
    color: Colors.gray[400],
    lineHeight: 17,
  },

  version: {
    fontSize: 11, color: Colors.gray[300], textAlign: 'center', letterSpacing: letterSpacing.wide,
  },
});
