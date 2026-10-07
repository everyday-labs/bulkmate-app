import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../hooks/useAuth';
import { supabase } from '../../lib/supabase';
import { posthog } from '../../lib/posthog';
import { useThemeColors } from '../../contexts/ThemeContext';
import type { ColorScheme } from '../../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../../constants/theme';
import { placeholderNameFor } from '../../lib/placeholderName';
import {
  FloatView,
  ScanLineIcon,
  PinPulse,
  ShimmerIcon,
  TagSwing,
  FolderFlip,
} from '../../components/Motion';

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

// A single row in the merged "Recent" feed — either a receipt scan or a
// viewed product, sorted together by timestamp.
type ActivityItem =
  | {
      kind: 'receipt';
      id: string;
      timestamp: string;
      warehouseName: string | null;
      itemCount: number;
      totalAmount: number | null;
    }
  | {
      kind: 'viewed';
      sku: string;
      timestamp: string;
      name: string | null;
      imageUrl: string | null;
      salePrice: number | null;
    };

export default function HomeScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [data, setData] = useState<DashboardData | null>(null);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityFilter, setActivityFilter] = useState<'all' | 'receipt' | 'viewed'>('all');
  const [firstName, setFirstName] = useState<string | null>(null);
  // Only true once the profile row has actually loaded without a first name —
  // a failed load must not flash the "add your name" card.
  const [nameMissing, setNameMissing] = useState(false);
  const [nameNudgeDismissed, setNameNudgeDismissed] = useState<boolean | null>(null);

  // Dismissal is a per-device convenience, keyed per user so a second account
  // on the same phone still gets the card.
  const nameNudgeKey = `nameNudgeDismissed:${session?.user.id ?? ''}`;
  useEffect(() => {
    if (!session?.user.id) return;
    let cancelled = false;
    AsyncStorage.getItem(nameNudgeKey)
      .then((v) => {
        if (!cancelled) setNameNudgeDismissed(v === 'true');
      })
      .catch(() => {
        if (!cancelled) setNameNudgeDismissed(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nameNudgeKey, session?.user.id]);

  function dismissNameNudge() {
    setNameNudgeDismissed(true);
    AsyncStorage.setItem(nameNudgeKey, 'true').catch(() => {});
    posthog?.capture('name_nudge_dismissed');
  }

  useFocusEffect(
    useCallback(() => {
      // useAuth resolves the session asynchronously, so the first focus fires
      // with no user. Loading then would query id '' and race the real load —
      // if it lands last it wipes the data (Home showed the placeholder name).
      if (!session?.user.id) return;
      load(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user.id]),
  );

  async function load(isRefresh: boolean) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [
        { data: profileRow },
        { data: allReceiptTotals },
        { data: receipts },
        { data: items },
        { data: alertRows },
        { data: lookupRows },
      ] = await Promise.all([
        supabase
          .from('profiles')
          .select('first_name')
          .eq('id', session?.user.id ?? '')
          .single(),
        // Unbounded, unlike the query below — Total Spent/Receipts stats
        // must reflect every receipt, not just the most recent 50. Kept as
        // its own lightweight query (no relations) rather than removing the
        // limit below, since the feed only ever needs the most recent few.
        supabase
          .from('receipts')
          .select('id, total_amount')
          .eq('user_id', session?.user.id ?? ''),
        supabase
          .from('receipts')
          .select('id, transaction_date, total_amount, warehouses(name), receipt_items(id)')
          .eq('user_id', session?.user.id ?? '')
          .order('transaction_date', { ascending: false })
          .limit(50),
        // No .eq('user_id') here — receipt_items has no user_id column; it's
        // scoped through its parent receipt, so RLS is the only filter.
        supabase.from('receipt_items').select('unit_price, discount_amount'),
        supabase
          .from('price_alerts')
          .select(
            'id, sku, paid_price, current_price, delta, receipt_items(description, receipt_id)',
          )
          .eq('user_id', session?.user.id ?? '')
          .is('dismissed_at', null)
          .order('delta', { ascending: false })
          .limit(10),
        supabase
          .from('product_lookups')
          .select('sku, name, brand, image_url, sale_price, looked_up_at')
          .order('looked_up_at', { ascending: false })
          .limit(30),
      ]);

      const totalSpend = (allReceiptTotals ?? []).reduce(
        (sum: number, r: any) => sum + (r.total_amount ?? 0),
        0,
      );
      const totalSavings = (items ?? []).reduce(
        (sum: number, i: any) => sum + (i.discount_amount ?? 0),
        0,
      );

      const recentReceipts: RecentReceipt[] = (receipts ?? []).slice(0, 5).map((r: any) => ({
        id: r.id,
        transaction_date: r.transaction_date,
        total_amount: r.total_amount,
        warehouse_name: r.warehouses?.name ?? null,
        item_count: r.receipt_items?.length ?? 0,
      }));

      setData({
        totalSpend,
        totalSavings,
        receiptCount: (allReceiptTotals ?? []).length,
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

      // Merge receipts + viewed products into one chronological feed, newest
      // first — each side already carries its own timestamp column.
      const merged: ActivityItem[] = [
        ...recentReceipts.map((r): ActivityItem => ({
          kind: 'receipt',
          id: r.id,
          timestamp: r.transaction_date,
          warehouseName: r.warehouse_name,
          itemCount: r.item_count,
          totalAmount: r.total_amount,
        })),
        ...dedupedLookups.map((l): ActivityItem => ({
          kind: 'viewed',
          sku: l.sku,
          timestamp: l.looked_up_at,
          name: l.name,
          imageUrl: l.image_url,
          salePrice: l.sale_price,
        })),
      ]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);
      setActivity(merged);

      const profileFirstName =
        (profileRow as { first_name: string | null } | null)?.first_name ?? null;
      setFirstName(profileFirstName);
      setNameMissing(profileRow != null && !profileFirstName?.trim());
    } catch {
      // Fail silently — dashboard is non-critical
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function dismissAlert(alertId: string) {
    // Optimistic update — remove from UI immediately
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    const { error } = await supabase
      .from('price_alerts')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', alertId);
    if (!error) posthog?.capture('price_alert_dismissed');
  }

  const greetingName = firstName ?? placeholderNameFor(session?.user.id);

  // Receipts store a date-only string; lookups store a full timestamp. Both
  // parse fine as a Date, so one pair of helpers covers either.
  function activityDate(iso: string) {
    return new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  }

  function dayLabelFor(iso: string) {
    const date = activityDate(iso);
    const dayMs = 24 * 60 * 60 * 1000;
    const dayDiff = Math.floor(
      (new Date().setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) / dayMs,
    );

    if (dayDiff <= 0) return 'Today';
    if (dayDiff === 1) return 'Yesterday';
    if (dayDiff < 7) return `${dayDiff} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function timeOfDayFor(iso: string) {
    return activityDate(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  // Filter, then group consecutive same-day rows under one divider — the
  // list is already sorted newest-first, so a single pass groups correctly.
  const filteredActivity = activity.filter(
    (item) => activityFilter === 'all' || item.kind === activityFilter,
  );
  const activityGroups: { label: string; items: ActivityItem[] }[] = [];
  for (const item of filteredActivity) {
    const label = dayLabelFor(item.timestamp);
    const lastGroup = activityGroups[activityGroups.length - 1];
    if (lastGroup && lastGroup.label === label) lastGroup.items.push(item);
    else activityGroups.push({ label, items: [item] });
  }

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
        <Text style={styles.greetingName}>{greetingName}</Text>
      </View>

      {/* Optional name prompt — never blocks anything, dismissible for good */}
      {nameMissing && nameNudgeDismissed === false && (
        <Pressable
          style={({ pressed }) => [styles.nudgeCard, pressed && styles.alertCardPressed]}
          onPress={() => {
            posthog?.capture('name_nudge_tapped');
            router.push('/edit-profile');
          }}
          accessibilityRole="button"
          accessibilityLabel="Add your name to your profile"
        >
          <View style={styles.nudgeIconWrap}>
            <Text style={styles.alertIcon}>👋</Text>
          </View>
          <View style={styles.alertBody}>
            <Text style={styles.nudgeTitle}>What should we call you?</Text>
            <Text style={styles.nudgeSub}>Add your name to personalize your greeting.</Text>
          </View>
          <Pressable
            onPress={dismissNameNudge}
            hitSlop={12}
            style={({ pressed }) => [styles.alertDismiss, pressed && { opacity: 0.6 }]}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <Text style={styles.alertDismissText}>✕</Text>
          </Pressable>
        </Pressable>
      )}

      {/* Price alert cards */}
      {alerts.length > 0 && (
        <View style={styles.alertsSection}>
          <View style={styles.recentHeader}>
            <Text style={styles.sectionLabel}>Price Alerts</Text>
            <Pressable
              onPress={() => router.push('/alerts')}
              hitSlop={8}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={styles.seeAllText}>See all</Text>
            </Pressable>
          </View>
          <View style={styles.alertsList}>
            {alerts.map((alert) => (
              <PriceAlertCard
                key={alert.id}
                alert={alert}
                styles={styles}
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
            styles={styles}
          />
          <StatCard
            label="Total Saved"
            value={data ? `$${data.totalSavings.toFixed(2)}` : '—'}
            icon="🏷"
            accent={Colors.savings}
            accentBg={Colors.goldStarSubtle}
            styles={styles}
          />
          <StatCard
            label="Receipts"
            value={data ? String(data.receiptCount) : '—'}
            icon="🧾"
            accent={Colors.costcoRed}
            accentBg={Colors.costcoRedSubtle}
            styles={styles}
          />
        </View>
      )}

      {/* Quick actions */}
      <Text style={styles.sectionLabel}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        <Pressable
          style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]}
          onPress={() => router.push('/(tabs)/scan')}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: Colors.costcoRedSubtle }]}>
            <ScanLineIcon>
              <Text style={styles.actionIcon}>🧾</Text>
            </ScanLineIcon>
          </View>
          <Text style={styles.actionTitle}>Scan</Text>
          <Text style={styles.actionSub}>Receipt, barcode, or check-in</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]}
          onPress={() => router.push('/history')}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: Colors.executiveNavySubtle }]}>
            <FolderFlip>
              <Text style={styles.actionIcon}>🗂</Text>
            </FolderFlip>
          </View>
          <Text style={styles.actionTitle}>History</Text>
          <Text style={styles.actionSub}>Receipts, scans & visits</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.actionCard, pressed && styles.actionCardPressed]}
          onPress={() => router.push({ pathname: '/(tabs)/scan', params: { mode: 'checkin' } })}
        >
          <View style={[styles.actionIconWrap, { backgroundColor: Colors.goldStarSubtle }]}>
            <PinPulse color={Colors.costcoRed + '80'}>
              <Text style={styles.actionIcon}>📍</Text>
            </PinPulse>
          </View>
          <Text style={styles.actionTitle}>Check In</Text>
          <Text style={styles.actionSub}>Earn a star</Text>
        </Pressable>
      </View>

      {/* Recent activity — receipts and viewed products merged into one feed */}
      {activity.length > 0 && (
        <>
          <View style={styles.recentHeader}>
            <Text style={styles.sectionLabel}>Recent</Text>
            <Pressable
              onPress={() => router.push('/history')}
              hitSlop={8}
              style={({ pressed }) => pressed && { opacity: 0.6 }}
            >
              <Text style={styles.seeAllText}>See all</Text>
            </Pressable>
          </View>

          <View style={styles.chipRow}>
            {(['all', 'receipt', 'viewed'] as const).map((key) => {
              const active = activityFilter === key;
              const label = key === 'all' ? 'All' : key === 'receipt' ? 'Receipts' : 'Viewed';
              return (
                <Pressable
                  key={key}
                  onPress={() => setActivityFilter(key)}
                  style={[styles.chip, active && styles.chipActive]}
                  hitSlop={4}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>

          {activityGroups.length === 0 && (
            <Text style={styles.activityEmptyText}>
              No {activityFilter === 'receipt' ? 'receipts' : 'viewed products'} yet.
            </Text>
          )}

          {activityGroups.map((group) => (
            <View key={group.label} style={styles.activityGroup}>
              <Text style={styles.dayDivider}>{group.label}</Text>
              <View style={styles.recentList}>
                {group.items.map((item) =>
                  item.kind === 'receipt' ? (
                    <Pressable
                      key={`receipt-${item.id}`}
                      style={({ pressed }) => [
                        styles.recentCard,
                        pressed && styles.recentCardPressed,
                      ]}
                      onPress={() => router.push(`/receipt-success?receiptId=${item.id}`)}
                    >
                      <View
                        style={[
                          styles.activityThumb,
                          { backgroundColor: Colors.executiveNavySubtle },
                        ]}
                      >
                        <Text style={styles.recentIcon}>🧾</Text>
                      </View>
                      <View style={styles.recentBody}>
                        <Text style={styles.recentWarehouse} numberOfLines={1}>
                          {item.warehouseName ?? 'Costco Warehouse'}
                        </Text>
                        <Text style={styles.recentMeta}>
                          Receipt{'  ·  '}
                          {item.itemCount} {item.itemCount === 1 ? 'item' : 'items'}
                        </Text>
                      </View>
                      {item.totalAmount != null && (
                        <Text style={styles.recentTotal}>${item.totalAmount.toFixed(2)}</Text>
                      )}
                      <Text style={styles.recentChevron}>›</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      key={`viewed-${item.sku}`}
                      style={({ pressed }) => [
                        styles.recentCard,
                        pressed && styles.recentCardPressed,
                      ]}
                      onPress={() => router.push(`/product/${item.sku}`)}
                    >
                      <View
                        style={[styles.activityThumb, { backgroundColor: Colors.goldStarSubtle }]}
                      >
                        {item.imageUrl ? (
                          <Image
                            source={{ uri: item.imageUrl }}
                            style={styles.activityThumbImage}
                            resizeMode="contain"
                          />
                        ) : (
                          <Text style={styles.recentIcon}>📦</Text>
                        )}
                      </View>
                      <View style={styles.recentBody}>
                        <Text style={styles.recentWarehouse} numberOfLines={1}>
                          {item.name ?? item.sku}
                        </Text>
                        <Text style={styles.recentMeta}>
                          Viewed{'  ·  '}
                          {timeOfDayFor(item.timestamp)}
                        </Text>
                      </View>
                      {item.salePrice != null && (
                        <Text style={styles.recentTotal}>${item.salePrice.toFixed(2)}</Text>
                      )}
                      <Text style={styles.recentChevron}>›</Text>
                    </Pressable>
                  ),
                )}
              </View>
            </View>
          ))}
        </>
      )}

      {/* Check-in success modal */}
      {/* Empty state */}
      {!loading && data && data.receiptCount === 0 && (
        <View style={styles.emptyCard}>
          <FloatView>
            <Text style={styles.emptyIcon}>🧾</Text>
          </FloatView>
          <Text style={styles.emptyTitle}>No receipts yet</Text>
          <Text style={styles.emptySubtitle}>
            Scan your first Costco receipt to start tracking your spending and unlock price alerts.
          </Text>
          <Pressable
            style={({ pressed }) => [styles.emptyBtn, pressed && styles.emptyBtnPressed]}
            onPress={() => router.push({ pathname: '/(tabs)/scan', params: { mode: 'receipt' } })}
          >
            <Text style={styles.emptyBtnText}>Scan Receipt</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function PriceAlertCard({
  alert,
  onDismiss,
  onPress,
  styles,
}: {
  alert: PriceAlert;
  onDismiss: () => void;
  onPress: () => void;
  styles: Styles;
}) {
  const name =
    alert.description.length > 50 ? alert.description.slice(0, 47) + '…' : alert.description;

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
        <Text style={styles.alertName} numberOfLines={2}>
          {name}
        </Text>
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
        onPress={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
        hitSlop={8}
      >
        <Text style={styles.alertDismissText}>✕</Text>
      </Pressable>
    </Pressable>
  );
}

function StatCard({
  label,
  value,
  icon,
  accent,
  accentBg,
  styles,
}: {
  label: string;
  value: string;
  icon: string;
  accent: string;
  accentBg: string;
  styles: Styles;
}) {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIconWrap, { backgroundColor: accentBg }]}>
        {icon === '💳' ? (
          <ShimmerIcon>
            <Text style={styles.statIcon}>{icon}</Text>
          </ShimmerIcon>
        ) : icon === '🏷' ? (
          <TagSwing>
            <Text style={styles.statIcon}>{icon}</Text>
          </TagSwing>
        ) : icon === '🧾' ? (
          <ScanLineIcon color={accent}>
            <Text style={styles.statIcon}>{icon}</Text>
          </ScanLineIcon>
        ) : (
          <Text style={styles.statIcon}>{icon}</Text>
        )}
      </View>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (Colors: ColorScheme) =>
  StyleSheet.create({
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

    // Name nudge
    nudgeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.surface,
      borderRadius: radius.xl,
      gap: spacing.md,
      padding: spacing.lg,
      marginTop: -spacing.md,
      marginBottom: spacing['2xl'],
      ...shadow.sm,
    },
    nudgeIconWrap: {
      width: 38,
      height: 38,
      borderRadius: radius.lg,
      backgroundColor: Colors.goldStarSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nudgeTitle: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: Colors.gray[800],
      marginBottom: 3,
    },
    nudgeSub: { fontSize: fontSize.xs, color: Colors.gray[500], lineHeight: 16 },

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

    chipRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
      paddingLeft: spacing.xs,
    },
    chip: {
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.surface,
    },
    chipActive: { backgroundColor: Colors.costcoRedSolid, borderColor: Colors.costcoRedSolid },
    chipText: { fontSize: fontSize.xs, fontWeight: '700', color: Colors.gray[600] },
    chipTextActive: { color: Colors.white },

    activityGroup: { marginBottom: spacing.sm },
    activityEmptyText: {
      fontSize: fontSize.sm,
      color: Colors.gray[400],
      paddingLeft: spacing.xs,
      marginBottom: spacing.xl,
    },
    dayDivider: {
      fontSize: fontSize.xs,
      fontWeight: '700',
      color: Colors.gray[400],
      letterSpacing: letterSpacing.caps,
      textTransform: 'uppercase',
      marginBottom: spacing.sm,
      paddingLeft: spacing.xs,
    },

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
    recentIcon: { fontSize: 20 },
    activityThumb: {
      width: 40,
      height: 40,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    activityThumbImage: { width: 32, height: 32 },
    recentBody: { flex: 1 },
    recentWarehouse: {
      fontSize: fontSize.md,
      fontWeight: '700',
      color: Colors.gray[900],
      marginBottom: 2,
    },
    recentMeta: { fontSize: fontSize.xs, color: Colors.gray[400] },
    recentTotal: {
      fontSize: fontSize.md,
      fontWeight: '700',
      color: Colors.executiveNavy,
      letterSpacing: letterSpacing.tight,
    },
    recentChevron: { fontSize: 18, color: Colors.gray[300] },

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
      backgroundColor: Colors.costcoRedSolid,
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
  });
