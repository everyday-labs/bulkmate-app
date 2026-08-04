import { useCallback, useState } from 'react';
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
import * as Notifications from 'expo-notifications';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { requestAndSavePushToken } from '../../lib/notifications';
import { posthog } from '../../lib/posthog';
import { Colors } from '../../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../../constants/theme';

type PermissionStatus = 'granted' | 'denied' | 'undetermined' | 'loading';

type UserBadge = {
  id: string;
  earned_at: string;
  badge: { name: string; description: string | null; icon: string | null };
};

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

const TIER_META: Record<string, { label: string; emoji: string; color: string; nextAt: number | null }> = {
  KirklandCadet:     { label: 'Kirkland Cadet',      emoji: '🛒', color: Colors.gray[500],        nextAt: 3  },
  WholesaleWanderer: { label: 'Wholesale Wanderer',   emoji: '🗺',  color: Colors.executiveNavy,    nextAt: 6  },
  BulkBuyer:         { label: 'Bulk Buyer',           emoji: '📦', color: Colors.savings,           nextAt: 11 },
  GoldStarGuru:      { label: 'Gold Star Guru',       emoji: '🌟', color: Colors.goldStarAccent,    nextAt: 21 },
  ExecutiveExplorer: { label: 'Executive Explorer',   emoji: '👑', color: Colors.costcoRed,         nextAt: null },
};

const TIER_MIN: Record<string, number> = {
  KirklandCadet: 1, WholesaleWanderer: 3, BulkBuyer: 6, GoldStarGuru: 11, ExecutiveExplorer: 21,
};

function tierProgress(tier: string, stars: number): number {
  const meta = TIER_META[tier];
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
  const [permStatus, setPermStatus] = useState<PermissionStatus>('loading');
  const [enablingNotifs, setEnablingNotifs] = useState(false);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [badges, setBadges] = useState<UserBadge[]>([]);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Notifications.getPermissionsAsync().then(({ status }) => {
        setPermStatus(status as PermissionStatus);
      });
      loadProfile(false);
    }, []),
  );

  async function loadProfile(isRefresh: boolean) {
    if (isRefresh) setRefreshing(true);
    else setLoadingProfile(true);

    try {
      const userId = session?.user.id;
      if (!userId) return;

      const [{ data: profileData }, { data: badgeData }] = await Promise.all([
        supabase
          .from('profiles')
          .select('total_stars, fan_tier, display_name, first_name, last_name, phone_number')
          .eq('id', userId)
          .single(),
        supabase
          .from('user_badges')
          .select('id, earned_at, badges(name, description, icon)')
          .eq('user_id', userId)
          .order('earned_at', { ascending: false }),
      ]);

      if (profileData) setProfile(profileData as ProfileData);
      setBadges(
        (badgeData ?? []).map((b: any) => ({
          id: b.id,
          earned_at: b.earned_at,
          badge: b.badges ?? { name: '?', description: null, icon: null },
        })),
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
  const initials = firstName && lastName
    ? (firstName[0] + lastName[0]).toUpperCase()
    : firstName
      ? firstName.slice(0, 2).toUpperCase()
      : email.slice(0, 2).toUpperCase();
  const tier = profile?.fan_tier ?? 'KirklandCadet';
  const tierMeta = TIER_META[tier] ?? TIER_META.KirklandCadet;
  const stars = profile?.total_stars ?? 0;
  const progress = tierProgress(tier, stars);

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
            <Text style={styles.avatarText}>{initials}</Text>
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
              <View style={[styles.tierEmojiWrap, { backgroundColor: tierMeta.color + '18' }]}>
                <Text style={styles.tierEmoji}>{tierMeta.emoji}</Text>
              </View>
              <View style={styles.tierInfo}>
                <Text style={styles.tierLabel}>FAN TIER</Text>
                <Text style={[styles.tierName, { color: tierMeta.color }]}>{tierMeta.label}</Text>
              </View>
              <View style={styles.starsWrap}>
                <Text style={styles.starsCount}>{stars}</Text>
                <Text style={styles.starsSuffix}>⭐</Text>
              </View>
            </View>

            {/* Progress bar */}
            {tierMeta.nextAt !== null ? (
              <View style={styles.progressSection}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: tierMeta.color }]} />
                </View>
                <Text style={styles.progressLabel}>
                  {tierMeta.nextAt - stars} more {tierMeta.nextAt - stars === 1 ? 'star' : 'stars'} to {TIER_META[nextTierKey(tier)]?.label ?? 'next tier'}
                </Text>
              </View>
            ) : (
              <View style={styles.progressSection}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: '100%', backgroundColor: tierMeta.color }]} />
                </View>
                <Text style={styles.progressLabel}>Maximum tier reached 🎉</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Badges ── */}
        <Text style={styles.sectionLabel}>YOUR BADGES</Text>
        {loadingProfile ? (
          <View style={styles.badgesSkeleton}>
            <ActivityIndicator color={Colors.costcoRed} />
          </View>
        ) : badges.length === 0 ? (
          <View style={styles.emptyBadges}>
            <Text style={styles.emptyBadgesIcon}>🏅</Text>
            <Text style={styles.emptyBadgesText}>Check in at a Costco to earn your first badge</Text>
          </View>
        ) : (
          <View style={styles.badgesGrid}>
            {badges.map((ub) => (
              <View key={ub.id} style={styles.badgeCard}>
                <View style={styles.badgeIconWrap}>
                  <Text style={styles.badgeIcon}>{ub.badge.icon ?? '🏅'}</Text>
                </View>
                <Text style={styles.badgeName} numberOfLines={2}>{ub.badge.name}</Text>
                <Text style={styles.badgeDate}>
                  {new Date(ub.earned_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
            ))}
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
              <Text style={styles.rowIcon}>🔔</Text>
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
            />
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
              <Text style={styles.aboutAvatarText}>TK</Text>
            </View>
            <View style={styles.aboutBuiltByText}>
              <Text style={styles.aboutName}>Tinker</Text>
              <Text style={styles.aboutRole}>Builder · Tech Enthusiast · Dota Enjoyer</Text>
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
            <View style={styles.aboutPill}>
              <Text style={styles.aboutPillText}>Not monetized</Text>
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

function NotifControl({
  status, loading, onEnable, onOpenSettings,
}: {
  status: PermissionStatus; loading: boolean; onEnable: () => void; onOpenSettings: () => void;
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

const styles = StyleSheet.create({
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
    backgroundColor: Colors.executiveNavy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Colors.white, fontSize: 20, fontWeight: '700' },
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

  // Badges
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
    ...shadow.sm,
  },
  badgeIconWrap: {
    width: 48,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: Colors.goldStarLight + '40',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  badgeIcon: { fontSize: 24 },
  badgeName: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.gray[800],
    textAlign: 'center',
    lineHeight: 15,
  },
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
    backgroundColor: Colors.costcoRed, paddingHorizontal: spacing.lg,
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
    backgroundColor: Colors.executiveNavy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutAvatarText: { color: Colors.white, fontSize: fontSize.md, fontWeight: '800' },
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
