import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Animated,
  Image,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../../constants/theme';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

type DashboardData = {
  totalSpend: number;
  totalSavings: number;
  receiptCount: number;
  recentReceipts: RecentReceipt[];
};

type RecentReceipt = {
  id: string;
  transaction_date: string;
  total_amount: number | null;
  warehouse_name: string | null;
  item_count: number;
};

type PriceAlert = {
  id: string;
  sku: string;
  paid_price: number;
  current_price: number;
  delta: number;
  description: string;
  receipt_id: string;
};

type RecentLookup = {
  sku: string;
  name: string | null;
  brand: string | null;
  image_url: string | null;
  sale_price: number | null;
  looked_up_at: string;
};

type CheckInResult = {
  warehouse: { name: string; city: string; tier: string; distance_metres: number };
  stars_earned: number;
  total_stars: number;
  fan_tier: string;
  tier_upgraded: boolean;
  already_checked_in: boolean;
  new_badges: { trigger_key: string; name: string; icon: string | null }[];
};

export default function HomeScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<DashboardData | null>(null);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkInResult, setCheckInResult] = useState<CheckInResult | null>(null);
  const [tooFarInfo, setTooFarInfo] = useState<{ miles: string; warehouse: string } | null>(null);
  const [recentLookups, setRecentLookups] = useState<RecentLookup[]>([]);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, []),
  );

  async function load(isRefresh: boolean) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [{ data: receipts }, { data: items }, { data: alertRows }, { data: lookupRows }] = await Promise.all([
        supabase
          .from('receipts')
          .select('id, transaction_date, total_amount, warehouses(name), receipt_items(id)')
          .order('transaction_date', { ascending: false })
          .limit(50),
        supabase
          .from('receipt_items')
          .select('unit_price, discount_amount'),
        supabase
          .from('price_alerts')
          .select('id, sku, paid_price, current_price, delta, receipt_items(description, receipt_id)')
          .is('dismissed_at', null)
          .order('delta', { ascending: false })
          .limit(10),
        supabase
          .from('product_lookups')
          .select('sku, name, brand, image_url, sale_price, looked_up_at')
          .order('looked_up_at', { ascending: false })
          .limit(30),
      ]);

      const totalSpend = (receipts ?? []).reduce(
        (sum: number, r: any) => sum + (r.total_amount ?? 0),
        0,
      );
      const totalSavings = (items ?? []).reduce(
        (sum: number, i: any) => sum + (i.discount_amount ?? 0),
        0,
      );

      const recentReceipts: RecentReceipt[] = (receipts ?? []).slice(0, 3).map((r: any) => ({
        id: r.id,
        transaction_date: r.transaction_date,
        total_amount: r.total_amount,
        warehouse_name: r.warehouses?.name ?? null,
        item_count: r.receipt_items?.length ?? 0,
      }));

      setData({
        totalSpend,
        totalSavings,
        receiptCount: (receipts ?? []).length,
        recentReceipts,
      });

      setAlerts(
        (alertRows ?? []).map((a: any) => ({
          id: a.id,
          sku: a.sku,
          paid_price: Number(a.paid_price),
          current_price: Number(a.current_price),
          delta: Number(a.delta),
          description: a.receipt_items?.description ?? a.sku,
          receipt_id: a.receipt_items?.receipt_id ?? '',
        })),
      );

      // Dedup by SKU — keep the most recent scan of each unique product
      const seenSkus = new Set<string>();
      const dedupedLookups: RecentLookup[] = [];
      for (const row of (lookupRows ?? []) as any[]) {
        if (!seenSkus.has(row.sku)) {
          seenSkus.add(row.sku);
          dedupedLookups.push(row as RecentLookup);
          if (dedupedLookups.length === 5) break;
        }
      }
      setRecentLookups(dedupedLookups);
    } catch {
      // Fail silently — dashboard is non-critical
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleCheckIn() {
    setCheckingIn(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Required', 'Enable location access in Settings to check in at a Costco warehouse.');
        return;
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`${SUPABASE_URL}/functions/v1/check-in`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ latitude: loc.coords.latitude, longitude: loc.coords.longitude }),
      });

      const json = await res.json() as CheckInResult & { error?: string; distance_metres?: number; nearest_warehouse?: { name: string } };

      if (!res.ok) {
        if (json.error === 'too_far') {
          const distM = json.distance_metres;
          const wh = json.nearest_warehouse?.name ?? 'the nearest Costco';
          setTooFarInfo({
            miles: distM != null ? (distM / 1609.34).toFixed(1) : '?',
            warehouse: wh,
          });
        } else {
          Alert.alert('Check-In Failed', json.error ?? 'Please try again.');
        }
        return;
      }

      // Show in-app modal (handles both already_checked_in and fresh check-in)
      setCheckInResult(json);
    } catch {
      Alert.alert('Check-In Failed', 'Could not get your location. Please try again.');
    } finally {
      setCheckingIn(false);
    }
  }

  async function dismissAlert(alertId: string) {
    // Optimistic update — remove from UI immediately
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    await supabase
      .from('price_alerts')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', alertId);
  }

  const email = session?.user.email ?? '';
  const firstName = email.split('@')[0]
    ?.replace(/[._-]/g, ' ')
    ?.split(' ')[0]
    ?.replace(/^\w/, (c) => c.toUpperCase()) ?? 'there';

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  })();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing['2xl'] },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => load(true)}
          tintColor={Colors.costcoRed}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Greeting */}
      <View style={styles.greetingSection}>
        <Text style={styles.greetingLine}>{greeting},</Text>
        <Text style={styles.greetingName}>{firstName}</Text>
      </View>

      {/* Price alert cards */}
      {alerts.length > 0 && (
        <View style={styles.alertsSection}>
          <Text style={styles.sectionLabel}>Price Alerts</Text>
          <View style={styles.alertsList}>
            {alerts.map((alert) => (
              <PriceAlertCard
                key={alert.id}
                alert={alert}
                onDismiss={() => dismissAlert(alert.id)}
                onPress={() =>
                  alert.receipt_id
                    ? router.push(`/receipt-success?receiptId=${alert.receipt_id}`)
                    : null
                }
              />
            ))}
          </View>
        </View>
      )}

      {/* Spend summary cards */}
      {loading ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={Colors.costcoRed} />
        </View>
      ) : (
        <View style={styles.statsRow}>
          <StatCard
            label="Total Spent"
            value={data ? `$${data.totalSpend.toFixed(2)}` : '—'}
            icon="💳"
            accent={Colors.executiveNavy}
            accentBg={Colors.executiveNavySubtle}
          />
          <StatCard
            label="Total Saved"
            value={data ? `$${data.totalSavings.toFixed(2)}` : '—'}
            icon="🏷"
            accent={Colors.savings}
            accentBg={Colors.goldStarSubtle}
          />
          <StatCard
            label="Receipts"
            value={data ? String(data.receiptCount) : '—'}
            icon="🧾"
            accent={Colors.costcoRed}
            accentBg={Colors.costcoRedSubtle}
          />
        </View>
      )}

      {/* Quick actions */}
      <Text style={styles.sectionLabel}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        <Pressable
          style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]}
          onPress={() => router.push('/receipt-camera')}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: Colors.costcoRedSubtle }]}>
            <Text style={styles.actionIcon}>🧾</Text>
          </View>
          <Text style={styles.actionTitle}>Scan Receipt</Text>
          <Text style={styles.actionSub}>Add a purchase</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]}
          onPress={() => router.push('/receipts')}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: Colors.executiveNavySubtle }]}>
            <Text style={styles.actionIcon}>🗂</Text>
          </View>
          <Text style={styles.actionTitle}>History</Text>
          <Text style={styles.actionSub}>All receipts</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.actionCard,
            pressed && styles.actionCardPressed,
            checkingIn && styles.actionCardMuted,
          ]}
          onPress={handleCheckIn}
          disabled={checkingIn}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: Colors.goldStarSubtle }]}>
            {checkingIn
              ? <ActivityIndicator size="small" color={Colors.warning} />
              : <Text style={styles.actionIcon}>📍</Text>
            }
          </View>
          <Text style={styles.actionTitle}>Check In</Text>
          <Text style={styles.actionSub}>Earn a star</Text>
        </Pressable>
      </View>

      {/* Recently viewed products */}
      {recentLookups.length > 0 && (
        <View style={styles.recentLookups}>
          <Text style={styles.sectionLabel}>Recently Viewed</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.lookupScroll}
          >
            {recentLookups.map((item) => (
              <Pressable
                key={item.sku}
                style={({ pressed }) => [styles.lookupCard, pressed && styles.lookupCardPressed]}
                onPress={() => router.push(`/product/${item.sku}`)}
              >
                <View style={styles.lookupImageWrap}>
                  {item.image_url ? (
                    <Image source={{ uri: item.image_url }} style={styles.lookupImage} resizeMode="contain" />
                  ) : (
                    <Text style={styles.lookupImageFallback}>📦</Text>
                  )}
                </View>
                <Text style={styles.lookupName} numberOfLines={2}>
                  {item.name ?? item.sku}
                </Text>
                {item.sale_price != null && (
                  <Text style={styles.lookupPrice}>${item.sale_price.toFixed(2)}</Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Recent receipts */}
      {data && data.recentReceipts.length > 0 && (
        <>
          <View style={styles.recentHeader}>
            <Text style={styles.sectionLabel}>Recent Receipts</Text>
            <Pressable onPress={() => router.push('/receipts')} hitSlop={8}>
              <Text style={styles.seeAllText}>See all</Text>
            </Pressable>
          </View>

          <View style={styles.recentList}>
            {data.recentReceipts.map((r) => {
              const date = new Date(r.transaction_date + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });
              return (
                <Pressable
                  key={r.id}
                  style={({ pressed }) => [styles.recentCard, pressed && styles.recentCardPressed]}
                  onPress={() => router.push(`/receipt-success?receiptId=${r.id}`)}
                >
                  <View style={styles.recentIconWrap}>
                    <Text style={styles.recentIcon}>🧾</Text>
                  </View>
                  <View style={styles.recentBody}>
                    <Text style={styles.recentWarehouse} numberOfLines={1}>
                      {r.warehouse_name ?? 'Costco Warehouse'}
                    </Text>
                    <Text style={styles.recentMeta}>
                      {date}{'  ·  '}{r.item_count} {r.item_count === 1 ? 'item' : 'items'}
                    </Text>
                  </View>
                  {r.total_amount != null && (
                    <Text style={styles.recentTotal}>${r.total_amount.toFixed(2)}</Text>
                  )}
                  <Text style={styles.recentChevron}>›</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {/* Check-in success modal */}
      {checkInResult && (
        <CheckInModal
          result={checkInResult}
          onClose={() => setCheckInResult(null)}
        />
      )}

      {/* Too far modal */}
      {tooFarInfo && (
        <TooFarModal
          miles={tooFarInfo.miles}
          warehouse={tooFarInfo.warehouse}
          onClose={() => setTooFarInfo(null)}
        />
      )}

      {/* Empty state */}
      {!loading && data && data.receiptCount === 0 && (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🧾</Text>
          <Text style={styles.emptyTitle}>No receipts yet</Text>
          <Text style={styles.emptySubtitle}>
            Scan your first Costco receipt to start tracking your spending and unlock price alerts.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.emptyBtn, pressed && styles.emptyBtnPressed]}
            onPress={() => router.push('/receipt-camera')}
          >
            <Text style={styles.emptyBtnText}>Scan Receipt</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

function PriceAlertCard({
  alert,
  onDismiss,
  onPress,
}: {
  alert: PriceAlert;
  onDismiss: () => void;
  onPress: () => void;
}) {
  const name = alert.description.length > 50
    ? alert.description.slice(0, 47) + '…'
    : alert.description;

  return (
    <Pressable
      style={({ pressed }) => [styles.alertCard, pressed && styles.alertCardPressed]}
      onPress={onPress}
    >
      {/* Green left accent */}
      <View style={styles.alertAccent} />

      <View style={styles.alertIconWrap}>
        <Text style={styles.alertIcon}>🏷</Text>
      </View>

      <View style={styles.alertBody}>
        <Text style={styles.alertName} numberOfLines={2}>{name}</Text>
        <Text style={styles.alertPrices}>
          Paid <Text style={styles.alertPricePaid}>${alert.paid_price.toFixed(2)}</Text>
          {'  →  '}
          <Text style={styles.alertPriceNow}>${alert.current_price.toFixed(2)} now</Text>
        </Text>
      </View>

      <View style={styles.alertRight}>
        <Text style={styles.alertDelta}>+${alert.delta.toFixed(2)}</Text>
        <Text style={styles.alertRefund}>refund</Text>
      </View>

      {/* Dismiss button */}
      <Pressable
        style={({ pressed }) => [styles.alertDismiss, pressed && { opacity: 0.5 }]}
        onPress={(e) => { e.stopPropagation(); onDismiss(); }}
        hitSlop={8}
      >
        <Text style={styles.alertDismissText}>✕</Text>
      </Pressable>
    </Pressable>
  );
}

const TIER_LABEL: Record<string, string> = {
  KirklandCadet: 'Kirkland Cadet',
  WholesaleWanderer: 'Wholesale Wanderer',
  BulkBuyer: 'Bulk Buyer',
  GoldStarGuru: 'Gold Star Guru',
  ExecutiveExplorer: 'Executive Explorer',
};

const TIER_EMOJI: Record<string, string> = {
  KirklandCadet: '🛒', WholesaleWanderer: '🗺', BulkBuyer: '📦',
  GoldStarGuru: '🌟', ExecutiveExplorer: '👑',
};

function TooFarModal({ miles, warehouse, onClose }: { miles: string; warehouse: string; onClose: () => void }) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Modal transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Animated.View
          style={[styles.modalSheet, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}
        >
          <Text style={styles.modalStar}>🗺</Text>

          <Text style={styles.modalTitle}>Still in Aisle Zero</Text>

          <View style={styles.tooFarDistanceRow}>
            <Text style={styles.tooFarMiles}>{miles} mi</Text>
            <Text style={styles.tooFarLabel}>FROM YOUR NEAREST COSTCO</Text>
          </View>

          <Text style={styles.tooFarWarehouse}>{warehouse}</Text>

          <Text style={styles.modalSubtext}>
            You're not quite in range yet. Head over to the warehouse and check in once you're inside — your star is waiting!
          </Text>

          <Pressable
            style={({ pressed }) => [styles.modalDoneBtn, pressed && styles.modalDoneBtnPressed]}
            onPress={onClose}
          >
            <Text style={styles.modalDoneBtnText}>Got it</Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function CheckInModal({ result, onClose }: { result: CheckInResult; onClose: () => void }) {
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const starAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 8 }),
      Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    if (!result.already_checked_in) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(starAnim, { toValue: 1.2, duration: 600, useNativeDriver: true }),
          Animated.timing(starAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ]),
        { iterations: 3 },
      ).start();
    }
  }, []);

  const isAlreadyIn = result.already_checked_in;
  const tierColor = result.tier_upgraded ? Colors.goldStarAccent : Colors.executiveNavy;

  return (
    <Modal transparent animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Animated.View
          style={[styles.modalSheet, { transform: [{ scale: scaleAnim }], opacity: opacityAnim }]}
        >
          {/* Star animation */}
          <Animated.Text style={[styles.modalStar, { transform: [{ scale: starAnim }] }]}>
            {isAlreadyIn ? '✅' : '⭐'}
          </Animated.Text>

          <Text style={styles.modalTitle}>
            {isAlreadyIn ? 'Already Checked In' : 'Checked In!'}
          </Text>

          <Text style={styles.modalWarehouse}>{result.warehouse.name}</Text>
          <Text style={styles.modalCity}>{result.warehouse.city} · {result.warehouse.tier}</Text>

          {isAlreadyIn ? (
            <Text style={styles.modalSubtext}>
              You already earned your star here today. Come back tomorrow!
            </Text>
          ) : (
            <View style={styles.modalStatsRow}>
              <View style={styles.modalStat}>
                <Text style={styles.modalStatValue}>+1</Text>
                <Text style={styles.modalStatLabel}>STAR EARNED</Text>
              </View>
              <View style={styles.modalStatDivider} />
              <View style={styles.modalStat}>
                <Text style={styles.modalStatValue}>{result.total_stars}</Text>
                <Text style={styles.modalStatLabel}>TOTAL STARS</Text>
              </View>
            </View>
          )}

          {/* Tier upgrade banner */}
          {result.tier_upgraded && (
            <View style={[styles.tierUpgradeBanner, { borderColor: tierColor }]}>
              <Text style={styles.tierUpgradeEmoji}>{TIER_EMOJI[result.fan_tier] ?? '🎉'}</Text>
              <View>
                <Text style={styles.tierUpgradeTitle}>Tier Upgrade!</Text>
                <Text style={[styles.tierUpgradeName, { color: tierColor }]}>
                  {TIER_LABEL[result.fan_tier] ?? result.fan_tier}
                </Text>
              </View>
            </View>
          )}

          {/* New badges */}
          {result.new_badges?.length > 0 && (
            <View style={styles.newBadgesSection}>
              <Text style={styles.newBadgesLabel}>NEW BADGES EARNED</Text>
              <View style={styles.newBadgesList}>
                {result.new_badges.map((b) => (
                  <View key={b.trigger_key} style={styles.newBadgeChip}>
                    <Text style={styles.newBadgeIcon}>{b.icon ?? '🏅'}</Text>
                    <Text style={styles.newBadgeName}>{b.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <Pressable
            style={({ pressed }) => [styles.modalDoneBtn, pressed && styles.modalDoneBtnPressed]}
            onPress={onClose}
          >
            <Text style={styles.modalDoneBtnText}>Done</Text>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
  accentBg,
}: {
  label: string;
  value: string;
  icon: string;
  accent: string;
  accentBg: string;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: accentBg }]}>
        <Text style={styles.statIcon}>{icon}</Text>
      </View>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: spacing.lg },

  // Greeting
  greetingSection: { marginBottom: spacing['2xl'] },
  greetingLine: {
    fontSize: fontSize.lg,
    color: Colors.gray[400],
    fontWeight: '500',
    letterSpacing: letterSpacing.normal,
  },
  greetingName: {
    fontSize: fontSize['4xl'],
    fontWeight: '800',
    color: Colors.gray[900],
    letterSpacing: letterSpacing.tight,
    marginTop: 2,
  },

  // Price alerts
  alertsSection: { marginBottom: spacing['2xl'] },
  alertsList: { gap: spacing.sm },
  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingRight: spacing.lg,
    ...shadow.sm,
  },
  alertCardPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  alertAccent: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: Colors.savings,
  },
  alertIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.lg,
    backgroundColor: Colors.savingsBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertIcon: { fontSize: 18 },
  alertBody: { flex: 1 },
  alertName: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: Colors.gray[800],
    marginBottom: 3,
    lineHeight: 18,
  },
  alertPrices: { fontSize: fontSize.xs, color: Colors.gray[400] },
  alertPricePaid: { color: Colors.gray[500], textDecorationLine: 'line-through' },
  alertPriceNow: { color: Colors.savings, fontWeight: '600' },
  alertRight: { alignItems: 'flex-end' },
  alertDelta: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    color: Colors.savings,
    letterSpacing: letterSpacing.tight,
  },
  alertRefund: {
    fontSize: fontSize.xs,
    color: Colors.savings,
    fontWeight: '600',
    letterSpacing: letterSpacing.wide,
  },
  alertDismiss: {
    paddingLeft: spacing.sm,
  },
  alertDismissText: {
    fontSize: 14,
    color: Colors.gray[300],
    fontWeight: '600',
  },

  // Loading
  loadingRow: { height: 100, alignItems: 'center', justifyContent: 'center' },

  // Stat cards
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing['2xl'],
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: 'flex-start',
    ...shadow.sm,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  statIcon: { fontSize: 18 },
  statValue: {
    fontSize: fontSize.lg,
    fontWeight: '800',
    letterSpacing: letterSpacing.tight,
    marginBottom: 2,
  },
  statLabel: { fontSize: fontSize.xs, color: Colors.gray[400], fontWeight: '600' },

  // Section labels
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.gray[400],
    letterSpacing: letterSpacing.caps,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
    paddingLeft: spacing.xs,
  },

  // Quick actions
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing['2xl'],
  },
  actionCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: 'flex-start',
    ...shadow.sm,
  },
  actionCardPressed: { opacity: 0.88, transform: [{ scale: 0.97 }] },
  actionCardMuted: { opacity: 0.5 },
  actionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  actionIcon: { fontSize: 20 },
  actionTitle: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: Colors.gray[800],
    marginBottom: 2,
  },
  actionSub: { fontSize: fontSize.xs, color: Colors.gray[400] },
  // Recent receipts
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingLeft: spacing.xs,
  },
  seeAllText: { fontSize: fontSize.sm, fontWeight: '600', color: Colors.costcoRed },
  recentList: { gap: spacing.sm, marginBottom: spacing.xl },
  recentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
    ...shadow.sm,
  },
  recentCardPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  recentIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentIcon: { fontSize: 20 },
  recentBody: { flex: 1 },
  recentWarehouse: { fontSize: fontSize.md, fontWeight: '700', color: Colors.gray[900], marginBottom: 2 },
  recentMeta: { fontSize: fontSize.xs, color: Colors.gray[400] },
  recentTotal: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: Colors.executiveNavy,
    letterSpacing: letterSpacing.tight,
  },
  recentChevron: { fontSize: 18, color: Colors.gray[300] },

  // Check-in modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  modalSheet: {
    width: '100%',
    backgroundColor: Colors.surface,
    borderRadius: radius['3xl'],
    padding: spacing['3xl'],
    alignItems: 'center',
    gap: spacing.lg,
    ...shadow.md,
  },
  modalStar: { fontSize: 64, marginBottom: spacing.xs },
  modalTitle: {
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    color: Colors.gray[900],
    letterSpacing: letterSpacing.tight,
  },
  modalWarehouse: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: Colors.gray[800],
    textAlign: 'center',
  },
  modalCity: { fontSize: fontSize.sm, color: Colors.gray[400] },
  modalSubtext: {
    fontSize: fontSize.sm,
    color: Colors.gray[400],
    textAlign: 'center',
    lineHeight: 20,
  },
  modalStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    gap: spacing.xl,
    marginVertical: spacing.xs,
  },
  modalStat: { alignItems: 'center', flex: 1 },
  modalStatValue: {
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    color: Colors.gray[900],
    letterSpacing: letterSpacing.tight,
  },
  modalStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.gray[400],
    letterSpacing: letterSpacing.caps,
    marginTop: 2,
  },
  modalStatDivider: { width: 1, height: 40, backgroundColor: Colors.border },

  // Too far modal
  tooFarDistanceRow: {
    backgroundColor: Colors.costcoRedSubtle,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing['3xl'],
    alignItems: 'center',
    width: '100%',
  },
  tooFarMiles: {
    fontSize: fontSize['4xl'],
    fontWeight: '800',
    color: Colors.costcoRed,
    letterSpacing: letterSpacing.tight,
  },
  tooFarLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.costcoRed,
    letterSpacing: letterSpacing.caps,
    marginTop: 2,
    opacity: 0.7,
  },
  tooFarWarehouse: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: Colors.gray[800],
    textAlign: 'center',
  },
  tierUpgradeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1.5,
    borderRadius: radius.xl,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    width: '100%',
  },
  tierUpgradeEmoji: { fontSize: 28 },
  tierUpgradeTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.gray[400],
    letterSpacing: letterSpacing.caps,
  },
  tierUpgradeName: { fontSize: fontSize.lg, fontWeight: '800', letterSpacing: letterSpacing.tight },
  newBadgesSection: { width: '100%', gap: spacing.sm },
  newBadgesLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.gray[400],
    letterSpacing: letterSpacing.caps,
  },
  newBadgesList: { gap: spacing.xs },
  newBadgeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: Colors.goldStarLight + '30',
    borderRadius: radius.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  newBadgeIcon: { fontSize: 18 },
  newBadgeName: { fontSize: fontSize.sm, fontWeight: '700', color: Colors.gray[800] },
  modalDoneBtn: {
    backgroundColor: Colors.costcoRed,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    width: '100%',
    alignItems: 'center',
    marginTop: spacing.xs,
    ...shadow.sm,
  },
  modalDoneBtnPressed: { backgroundColor: Colors.costcoRedDark },
  modalDoneBtnText: {
    color: Colors.white,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: letterSpacing.wide,
  },

  // Empty state
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing['3xl'],
    alignItems: 'center',
    ...shadow.md,
    marginTop: spacing.lg,
  },
  emptyIcon: { fontSize: 52, marginBottom: spacing.xl },
  emptyTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: Colors.gray[800],
    marginBottom: spacing.sm,
    letterSpacing: letterSpacing.tight,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: Colors.gray[400],
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing['2xl'],
  },
  emptyBtn: {
    backgroundColor: Colors.costcoRed,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing['3xl'],
    ...shadow.sm,
  },
  emptyBtnPressed: { backgroundColor: Colors.costcoRedDark },
  emptyBtnText: {
    color: Colors.white,
    fontSize: fontSize.md,
    fontWeight: '700',
    letterSpacing: letterSpacing.wide,
  },

  // Recently viewed products
  recentLookups: { marginBottom: spacing['2xl'] },
  lookupScroll: { gap: spacing.md, paddingLeft: spacing.xs, paddingRight: spacing.lg },
  lookupCard: {
    width: 120,
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadow.sm,
  },
  lookupCardPressed: { opacity: 0.88, transform: [{ scale: 0.97 }] },
  lookupImageWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.lg,
    backgroundColor: Colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  lookupImage: { width: 64, height: 64 },
  lookupImageFallback: { fontSize: 36 },
  lookupName: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: Colors.gray[800],
    textAlign: 'center',
    lineHeight: 15,
  },
  lookupPrice: {
    fontSize: fontSize.sm,
    fontWeight: '800',
    color: Colors.executiveNavy,
    letterSpacing: letterSpacing.tight,
  },
});
