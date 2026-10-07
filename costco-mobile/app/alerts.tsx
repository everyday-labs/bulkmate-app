import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { posthog } from '../lib/posthog';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ColorScheme } from '../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../constants/theme';
import { FloatView } from '../components/Motion';

type AlertRow = {
  id: string;
  sku: string;
  description: string;
  receipt_id: string;
  paid_price: number;
  current_price: number;
  delta: number;
  transaction_date: string | null;
  dismissed_at: string | null;
};

// Sliding price-match window is 30 days from the purchase date (see
// price-match-check Edge Function) — used to estimate a claim deadline.
// Not a hard server-enforced cutoff, just an urgency signal for the user.
const CLAIM_WINDOW_DAYS = 30;

function daysLeftToClaim(transactionDate: string | null): number | null {
  if (!transactionDate) return null;
  const purchased = new Date(`${transactionDate}T00:00:00`).getTime();
  const deadline = purchased + CLAIM_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((deadline - Date.now()) / (24 * 60 * 60 * 1000)));
}

type AlertGroup = {
  key: string;
  description: string;
  totalDelta: number;
  alerts: AlertRow[];
};

// `price_alerts` is already one row per receipt_item (unique constraint), so
// a single receipt with quantity > 1 is already one row — nothing to collapse
// there. What this groups is the same item bought on *different* receipts,
// which each get their own alert row and would otherwise show as separate,
// disconnected cards for what the user sees as "one item that's on sale."
function groupByItem(rows: AlertRow[]): AlertGroup[] {
  const map = new Map<string, AlertGroup>();
  for (const r of rows) {
    const key = r.description || r.sku;
    const existing = map.get(key);
    if (existing) {
      existing.alerts.push(r);
      existing.totalDelta += r.delta;
    } else {
      map.set(key, { key, description: r.description || r.sku, totalDelta: r.delta, alerts: [r] });
    }
  }
  return [...map.values()].sort((a, b) => b.totalDelta - a.totalDelta);
}

export default function AlertsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [active, setActive] = useState<AlertRow[]>([]);
  const [claimed, setClaimed] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [claimingId, setClaimingId] = useState<string | null>(null);

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
      const userId = session?.user.id;
      if (!userId) return;

      const { data } = await supabase
        .from('price_alerts')
        .select('id, sku, paid_price, current_price, delta, dismissed_at, receipt_items(description, receipt_id, transaction_date)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      const rows: AlertRow[] = (data ?? []).map((a: any) => ({
        id: a.id,
        sku: a.sku,
        description: a.receipt_items?.description ?? a.sku,
        receipt_id: a.receipt_items?.receipt_id ?? '',
        paid_price: Number(a.paid_price),
        current_price: Number(a.current_price),
        delta: Number(a.delta),
        transaction_date: a.receipt_items?.transaction_date ?? null,
        dismissed_at: a.dismissed_at,
      }));

      setActive(rows.filter((r) => !r.dismissed_at));
      setClaimed(rows.filter((r) => r.dismissed_at));
    } catch {
      // non-critical
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function markClaimed(alertId: string) {
    setClaimingId(alertId);
    // Optimistic move from Active to Claimed
    const moved = active.find((a) => a.id === alertId);
    setActive((prev) => prev.filter((a) => a.id !== alertId));
    if (moved) setClaimed((prev) => [{ ...moved, dismissed_at: new Date().toISOString() }, ...prev]);

    const { error } = await supabase
      .from('price_alerts')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', alertId);

    if (!error) posthog?.capture('price_alert_claimed');
    setClaimingId(null);
  }

  const totalOwed = active.reduce((sum, a) => sum + a.delta, 0);
  const activeGroups = useMemo(() => groupByItem(active), [active]);

  function goToReceipt(receiptId: string) {
    if (receiptId) router.push(`/receipt-success?receiptId=${receiptId}`);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.costcoRed} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Price Alerts</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: spacing.lg, paddingBottom: insets.bottom + spacing['2xl'] }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.costcoRed} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Total potential savings hero */}
        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>YOU MAY BE OWED</Text>
          <Text style={styles.heroValue}>${totalOwed.toFixed(2)}</Text>
          <Text style={styles.heroSub}>
            Across {activeGroups.length} {activeGroups.length === 1 ? 'item' : 'items'} from the last {CLAIM_WINDOW_DAYS} days
          </Text>
        </View>

        {active.length > 0 && (
          <View style={styles.howToCard}>
            <Text style={styles.howToIcon}>🧾</Text>
            <Text style={styles.howToText}>
              Bring the receipt to the Membership counter at Costco to claim your refund — tap "View Receipt" below to pull it up.
            </Text>
          </View>
        )}

        {active.length === 0 && claimed.length === 0 ? (
          <View style={styles.emptyCard}>
            <FloatView><Text style={styles.emptyIcon}>🏷</Text></FloatView>
            <Text style={styles.emptyTitle}>No price drops yet</Text>
            <Text style={styles.emptySubtitle}>
              We'll notify you the moment something you bought goes on sale.
            </Text>
          </View>
        ) : (
          <>
            {activeGroups.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>ACTIVE</Text>
                <View style={styles.list}>
                  {activeGroups.map((group) => (
                    <ItemGroupCard
                      key={group.key}
                      group={group}
                      claimingId={claimingId}
                      onPressReceipt={goToReceipt}
                      onMarkClaimed={markClaimed}
                      styles={styles}
                      Colors={Colors}
                    />
                  ))}
                </View>
              </View>
            )}

            {claimed.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>CLAIMED</Text>
                <View style={styles.list}>
                  {claimed.map((alert) => (
                    <ClaimedAlertRow key={alert.id} alert={alert} onPress={() => goToReceipt(alert.receipt_id)} styles={styles} />
                  ))}
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function ItemGroupCard({
  group, claimingId, onPressReceipt, onMarkClaimed, styles, Colors,
}: {
  group: AlertGroup;
  claimingId: string | null;
  onPressReceipt: (receiptId: string) => void;
  onMarkClaimed: (alertId: string) => void;
  styles: Styles;
  Colors: ColorScheme;
}) {
  const name = group.description.length > 60 ? group.description.slice(0, 57) + '…' : group.description;
  const multi = group.alerts.length > 1;

  return (
    <View style={styles.groupCard}>
      <View style={styles.groupHeader}>
        <View style={styles.alertIconWrap}>
          <Text style={styles.alertIcon}>🏷</Text>
        </View>
        <View style={styles.alertBody}>
          <Text style={styles.alertName} numberOfLines={2}>{name}</Text>
          {multi && (
            <Text style={styles.groupSub}>{group.alerts.length} receipts</Text>
          )}
        </View>
        <View style={styles.alertRight}>
          <Text style={styles.alertDelta}>+${group.totalDelta.toFixed(2)}</Text>
          <Text style={styles.alertRefund}>refund</Text>
        </View>
      </View>

      {group.alerts.map((alert, i) => (
        <View key={alert.id}>
          {i > 0 && <View style={styles.groupDivider} />}
          <AlertReceiptRow
            alert={alert}
            showDelta={multi}
            claiming={claimingId === alert.id}
            onPress={() => onPressReceipt(alert.receipt_id)}
            onMarkClaimed={() => onMarkClaimed(alert.id)}
            styles={styles}
            Colors={Colors}
          />
        </View>
      ))}
    </View>
  );
}

function AlertReceiptRow({
  alert, showDelta, claiming, onPress, onMarkClaimed, styles, Colors,
}: {
  alert: AlertRow;
  showDelta: boolean;
  claiming: boolean;
  onPress: () => void;
  onMarkClaimed: () => void;
  styles: Styles;
  Colors: ColorScheme;
}) {
  const daysLeft = daysLeftToClaim(alert.transaction_date);
  const dateLabel = alert.transaction_date
    ? new Date(`${alert.transaction_date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'Unknown date';

  return (
    <View style={styles.receiptRowWrap}>
      <Pressable
        style={({ pressed }) => [styles.receiptRow, pressed && { opacity: 0.7 }]}
        onPress={onPress}
        disabled={!alert.receipt_id}
      >
        <View style={styles.receiptRowBody}>
          <Text style={styles.receiptRowDate}>{dateLabel}</Text>
          <Text style={styles.alertPrices}>
            Paid <Text style={styles.alertPricePaid}>${alert.paid_price.toFixed(2)}</Text>
            {'  →  '}
            <Text style={styles.alertPriceNow}>${alert.current_price.toFixed(2)} now</Text>
          </Text>
          {daysLeft != null && (
            <Text style={styles.daysLeft}>
              {daysLeft > 0 ? `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left to claim` : 'Claim window closing'}
            </Text>
          )}
        </View>
        {showDelta && <Text style={styles.receiptRowDelta}>+${alert.delta.toFixed(2)}</Text>}
        {alert.receipt_id ? <Text style={styles.receiptChevron}>›</Text> : null}
      </Pressable>

      <View style={styles.rowActions}>
        <Pressable
          style={({ pressed }) => [
            styles.viewReceiptBtn,
            pressed && { opacity: 0.85 },
            !alert.receipt_id && { opacity: 0.5 },
          ]}
          onPress={onPress}
          disabled={!alert.receipt_id}
        >
          <Text style={styles.viewReceiptText}>🧾 View Receipt</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.markClaimedLink, pressed && { opacity: 0.6 }]}
          onPress={onMarkClaimed}
          disabled={claiming}
        >
          {claiming
            ? <ActivityIndicator size="small" color={Colors.success} />
            : <Text style={styles.markClaimedLinkText}>Mark as claimed</Text>
          }
        </Pressable>
      </View>
    </View>
  );
}

function ClaimedAlertRow({ alert, onPress, styles }: { alert: AlertRow; onPress: () => void; styles: Styles }) {
  const name = alert.description.length > 50 ? alert.description.slice(0, 47) + '…' : alert.description;
  const claimedDate = alert.dismissed_at
    ? new Date(alert.dismissed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.claimedRow, pressed && { opacity: 0.7 }]}
      onPress={onPress}
      disabled={!alert.receipt_id}
    >
      <View style={styles.claimedIconWrap}>
        <Text style={styles.claimedIcon}>✓</Text>
      </View>
      <View style={styles.claimedBody}>
        <Text style={styles.claimedName} numberOfLines={1}>{name}</Text>
        {claimedDate && <Text style={styles.claimedDate}>Claimed {claimedDate}</Text>}
      </View>
      <Text style={styles.claimedDelta}>+${alert.delta.toFixed(2)}</Text>
      {alert.receipt_id ? <Text style={styles.receiptChevron}>›</Text> : null}
    </Pressable>
  );
}

const makeStyles = (Colors: ColorScheme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.background },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: { width: 60 },
  backText: { fontSize: fontSize.xl, color: Colors.costcoRed, fontWeight: '500' },
  title: { fontSize: fontSize.xl, fontWeight: '700', color: Colors.gray[900], letterSpacing: letterSpacing.tight },

  // Hero
  heroCard: {
    backgroundColor: Colors.navySolid,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    marginBottom: spacing.xl,
    ...shadow.md,
  },
  heroLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: letterSpacing.caps,
  },
  heroValue: {
    fontSize: fontSize.display,
    fontWeight: '800',
    color: Colors.goldStarAccent,
    marginTop: spacing.xs,
    letterSpacing: letterSpacing.tight,
  },
  heroSub: {
    fontSize: fontSize.sm,
    color: 'rgba(255,255,255,0.8)',
    marginTop: spacing.xs,
  },

  // "How to claim" hint
  howToCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: Colors.executiveNavySubtle,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  howToIcon: { fontSize: 16, marginTop: 1 },
  howToText: { flex: 1, fontSize: fontSize.xs, color: Colors.executiveNavy, lineHeight: 17, fontWeight: '500' },

  section: { marginBottom: spacing.xl },
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.gray[400],
    letterSpacing: letterSpacing.caps,
    marginBottom: spacing.md,
    paddingLeft: spacing.xs,
  },
  list: { gap: spacing.md },

  // Item group card (one item, one or more receipt occurrences)
  groupCard: {
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadow.sm,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: Colors.savingsBg,
  },
  groupSub: { fontSize: fontSize.xs, color: Colors.gray[500], marginTop: 1 },
  groupDivider: { height: 1, backgroundColor: Colors.border, marginLeft: spacing.lg },

  receiptRowWrap: {},
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  receiptRowBody: { flex: 1, gap: 2 },
  receiptRowDate: { fontSize: fontSize.xs, fontWeight: '700', color: Colors.gray[600], letterSpacing: letterSpacing.wide },
  receiptRowDelta: { fontSize: fontSize.sm, fontWeight: '700', color: Colors.savings },
  receiptChevron: { fontSize: 20, color: Colors.gray[300], fontWeight: '300' },

  alertIconWrap: {
    width: 38,
    height: 38,
    borderRadius: radius.lg,
    backgroundColor: Colors.savingsBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertIcon: { fontSize: 18 },
  alertBody: { flex: 1, gap: 2 },
  alertName: { fontSize: fontSize.sm, fontWeight: '700', color: Colors.gray[800], lineHeight: 18 },
  alertPrices: { fontSize: fontSize.xs, color: Colors.gray[400] },
  alertPricePaid: { color: Colors.gray[500], textDecorationLine: 'line-through' },
  alertPriceNow: { color: Colors.savings, fontWeight: '600' },
  daysLeft: { fontSize: 10, fontWeight: '700', color: Colors.warning, letterSpacing: letterSpacing.caps, marginTop: 2 },
  alertRight: { alignItems: 'flex-end' },
  alertDelta: { fontSize: fontSize.lg, fontWeight: '800', color: Colors.savings, letterSpacing: letterSpacing.tight },
  alertRefund: { fontSize: fontSize.xs, color: Colors.savings, fontWeight: '600', letterSpacing: letterSpacing.wide },

  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  viewReceiptBtn: {
    flex: 1,
    backgroundColor: Colors.navySolid,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  viewReceiptText: { color: Colors.white, fontSize: fontSize.sm, fontWeight: '700' },
  markClaimedLink: {
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
  },
  markClaimedLinkText: { color: Colors.success, fontSize: fontSize.xs, fontWeight: '600' },

  // Claimed row
  claimedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: Colors.surface,
    borderRadius: radius.lg,
    padding: spacing.md,
    ...shadow.sm,
  },
  claimedIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: Colors.successBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimedIcon: { fontSize: 15, color: Colors.success, fontWeight: '700' },
  claimedBody: { flex: 1 },
  claimedName: { fontSize: fontSize.sm, fontWeight: '600', color: Colors.gray[600] },
  claimedDate: { fontSize: fontSize.xs, color: Colors.gray[400], marginTop: 1 },
  claimedDelta: { fontSize: fontSize.sm, fontWeight: '700', color: Colors.gray[400] },

  // Empty state
  emptyCard: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    padding: spacing['3xl'],
    ...shadow.sm,
  },
  emptyIcon: { fontSize: 44, marginBottom: spacing.md },
  emptyTitle: { fontSize: fontSize.lg, fontWeight: '700', color: Colors.gray[900], marginBottom: spacing.xs },
  emptySubtitle: { fontSize: fontSize.sm, color: Colors.gray[400], textAlign: 'center' },
});
