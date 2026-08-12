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
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useThemeColors } from '../../contexts/ThemeContext';
import type { ColorScheme } from '../../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../../constants/theme';
import { FloatView, ShimmerIcon, TagSwing, BellRing, ScanLineIcon, PinPulse } from '../../components/Motion';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type MonthBucket = { key: string; label: string; spend: number; receipts: number };
type TopItem = { description: string; total_spend: number; quantity: number };
type AnalyticsData = {
  totalSpend: number;
  totalSaved: number;
  totalReceipts: number;
  avgBasket: number;
  priceMatchSavings: number;
  monthlyBuckets: MonthBucket[];   // last 6 months
  topItems: TopItem[];              // top 5 by spend
  warehouseVisits: number;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function monthLabel(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
}

function last6Months(): { key: string; label: string }[] {
  const result = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: monthLabel(d),
    });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function AnalyticsScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
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

      const [
        { data: receipts },
        { data: items },
        { data: alerts },
        { data: checkIns },
      ] = await Promise.all([
        supabase
          .from('receipts')
          .select('id, transaction_date, total_amount')
          .eq('user_id', userId)
          .order('transaction_date', { ascending: false }),
        supabase
          .from('receipt_items')
          .select('description, unit_price, quantity, discount_amount, receipt_id, receipts!inner(user_id, transaction_date)')
          .eq('receipts.user_id', userId),
        supabase
          .from('price_alerts')
          .select('delta')
          .eq('user_id', userId)
          .not('delta', 'is', null),
        supabase
          .from('check_ins')
          .select('id')
          .eq('user_id', userId),
      ]);

      const receiptList = receipts ?? [];
      const itemList = items ?? [];

      // Totals
      const totalSpend = receiptList.reduce((s: number, r: any) => s + (r.total_amount ?? 0), 0);
      const totalSaved = itemList.reduce((s: number, i: any) => s + (i.discount_amount ?? 0), 0);
      const priceMatchSavings = (alerts ?? []).reduce((s: number, a: any) => s + Number(a.delta ?? 0), 0);
      const avgBasket = receiptList.length > 0 ? totalSpend / receiptList.length : 0;

      // Monthly buckets
      const months = last6Months();
      const monthlyBuckets: MonthBucket[] = months.map(({ key, label }) => {
        const monthReceipts = receiptList.filter((r: any) => {
          const d = (r.transaction_date ?? '').slice(0, 7); // 'YYYY-MM'
          return d === key;
        });
        const spend = monthReceipts.reduce((s: number, r: any) => s + (r.total_amount ?? 0), 0);
        return { key, label, spend, receipts: monthReceipts.length };
      });

      // Top items by total spend (group by description)
      const itemMap = new Map<string, { total_spend: number; quantity: number }>();
      for (const item of itemList as any[]) {
        const key = item.description ?? item.sku ?? 'Unknown';
        const existing = itemMap.get(key) ?? { total_spend: 0, quantity: 0 };
        // unit_price is per-unit, so spend is price × quantity — same
        // convention as receipt-success.tsx's itemTotal. OCR-parsed rows are
        // always quantity 1, so this only differs once a user edits one.
        itemMap.set(key, {
          total_spend: existing.total_spend + Number(item.unit_price ?? 0) * Number(item.quantity ?? 1),
          quantity: existing.quantity + Number(item.quantity ?? 1),
        });
      }
      const topItems: TopItem[] = [...itemMap.entries()]
        .map(([description, v]) => ({ description, ...v }))
        .sort((a, b) => b.total_spend - a.total_spend)
        .slice(0, 5);

      setData({
        totalSpend,
        totalSaved,
        totalReceipts: receiptList.length,
        avgBasket,
        priceMatchSavings,
        monthlyBuckets,
        topItems,
        warehouseVisits: (checkIns ?? []).length,
      });
    } catch {
      // non-critical
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.scroll,
        { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing['3xl'] },
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
      {/* Header */}
      <View style={styles.headingSection}>
        <Text style={styles.headingTitle}>Spend Analytics</Text>
        <Text style={styles.headingSubtitle}>Your Costco spending at a glance</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.costcoRed} />
          <Text style={styles.loadingText}>Crunching your numbers…</Text>
        </View>
      ) : !data || data.totalReceipts === 0 ? (
        <View style={styles.emptyCard}>
          <FloatView><Text style={styles.emptyIcon}>📊</Text></FloatView>
          <Text style={styles.emptyTitle}>No data yet</Text>
          <Text style={styles.emptySubtitle}>
            Scan a few Costco receipts to unlock your spend analytics.
          </Text>
        </View>
      ) : (
        <>
          {/* ── Key metrics row ── */}
          <View style={styles.metricsGrid}>
            <MetricCard
              label="Total Spent"
              value={`$${data.totalSpend.toFixed(2)}`}
              icon="💳"
              accent={Colors.executiveNavy}
              bg={Colors.infoBg}
              styles={styles}
            />
            <MetricCard
              label="In-Store Saved"
              value={`$${data.totalSaved.toFixed(2)}`}
              icon="🏷"
              accent={Colors.savings}
              bg={Colors.savingsBg}
              styles={styles}
            />
            <MetricCard
              label="Price Match"
              value={`$${data.priceMatchSavings.toFixed(2)}`}
              icon="🔔"
              accent={Colors.goldStarDark}
              bg={Colors.warningBg}
              styles={styles}
            />
            <MetricCard
              label="Avg Basket"
              value={`$${data.avgBasket.toFixed(2)}`}
              icon="🧾"
              accent={Colors.costcoRed}
              bg={Colors.errorBg}
              styles={styles}
            />
          </View>

          {/* ── Monthly spend chart ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>MONTHLY SPEND</Text>
            <MonthlyChart
              buckets={data.monthlyBuckets}
              styles={styles}
              Colors={Colors}
              onSelectMonth={(b) => router.push({ pathname: '/receipts', params: { month: b.key, label: b.label } })}
            />
          </View>

          {/* ── Top items ── */}
          {data.topItems.length > 0 && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>TOP ITEMS BY SPEND</Text>
              <TopItemsList items={data.topItems} styles={styles} Colors={Colors} />
            </View>
          )}

          {/* ── Savings breakdown ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>SAVINGS BREAKDOWN</Text>
            <SavingsBreakdown
              inStore={data.totalSaved}
              priceMatch={data.priceMatchSavings}
              styles={styles}
              Colors={Colors}
            />
          </View>

          {/* ── Activity stats ── */}
          <View style={styles.activityRow}>
            <ActivityStat icon="🧾" value={data.totalReceipts} label="Receipts" styles={styles} />
            <ActivityStat icon="📍" value={data.warehouseVisits} label="Check-ins" styles={styles} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

type Styles = ReturnType<typeof makeStyles>;

function MetricCard({
  label, value, icon, accent, bg, styles,
}: {
  label: string; value: string; icon: string; accent: string; bg: string; styles: Styles;
}) {
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIconWrap, { backgroundColor: bg }]}>
        {icon === '💳' ? (
          <ShimmerIcon><Text style={styles.metricIcon}>{icon}</Text></ShimmerIcon>
        ) : icon === '🏷' ? (
          <TagSwing><Text style={styles.metricIcon}>{icon}</Text></TagSwing>
        ) : icon === '🔔' ? (
          <BellRing><Text style={styles.metricIcon}>{icon}</Text></BellRing>
        ) : icon === '🧾' ? (
          <ScanLineIcon color={accent}><Text style={styles.metricIcon}>{icon}</Text></ScanLineIcon>
        ) : (
          <Text style={styles.metricIcon}>{icon}</Text>
        )}
      </View>
      <Text style={[styles.metricValue, { color: accent }]}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function MonthlyChart({
  buckets, styles, Colors, onSelectMonth,
}: {
  buckets: MonthBucket[]; styles: Styles; Colors: ColorScheme; onSelectMonth: (b: MonthBucket) => void;
}) {
  const maxSpend = Math.max(...buckets.map((b) => b.spend), 1);

  return (
    <View style={styles.chartArea}>
      {/* Bars — tap a month with receipts to see just those receipts */}
      <View style={styles.barsRow}>
        {buckets.map((b, i) => {
          const heightPct = b.spend / maxSpend;
          const isActive = i === buckets.length - 1;
          const hasReceipts = b.receipts > 0;
          return (
            <Pressable
              key={b.label}
              style={({ pressed }) => [styles.barColumn, pressed && hasReceipts && { opacity: 0.7 }]}
              onPress={() => hasReceipts && onSelectMonth(b)}
              disabled={!hasReceipts}
            >
              <Text style={styles.barAmount}>
                {b.spend > 0 ? `$${b.spend >= 1000 ? (b.spend / 1000).toFixed(1) + 'k' : b.spend.toFixed(0)}` : ''}
              </Text>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    {
                      height: `${Math.max(heightPct * 100, b.spend > 0 ? 4 : 0)}%`,
                      backgroundColor: isActive ? Colors.costcoRed : Colors.executiveNavy + 'AA',
                    },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, isActive && { color: Colors.costcoRed, fontWeight: '700' }]}>
                {b.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function TopItemsList({ items, styles, Colors }: { items: TopItem[]; styles: Styles; Colors: ColorScheme }) {
  const maxSpend = Math.max(...items.map((i) => i.total_spend), 1);

  return (
    <View style={styles.topItemsList}>
      {items.map((item, idx) => {
        const barWidth = (item.total_spend / maxSpend) * 100;
        const rankColors = [Colors.costcoRed, Colors.executiveNavy, Colors.savings, Colors.warning, Colors.gray[400]];
        const color = rankColors[idx] ?? Colors.gray[400];

        return (
          <View key={item.description} style={styles.topItemRow}>
            <View style={styles.topItemRankWrap}>
              <Text style={[styles.topItemRank, { color }]}>{idx + 1}</Text>
            </View>
            <View style={styles.topItemContent}>
              <View style={styles.topItemHeader}>
                <Text style={styles.topItemName} numberOfLines={1}>{item.description}</Text>
                <Text style={[styles.topItemSpend, { color }]}>${item.total_spend.toFixed(2)}</Text>
              </View>
              <View style={styles.topItemBarTrack}>
                <View style={[styles.topItemBarFill, { width: `${barWidth}%`, backgroundColor: color }]} />
              </View>
              <Text style={styles.topItemQty}>
                {item.quantity} {item.quantity === 1 ? 'unit' : 'units'} purchased
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SavingsBreakdown({ inStore, priceMatch, styles, Colors }: { inStore: number; priceMatch: number; styles: Styles; Colors: ColorScheme }) {
  const total = inStore + priceMatch;
  const inStorePct = total > 0 ? (inStore / total) * 100 : 50;
  const priceMatchPct = 100 - inStorePct;

  return (
    <View style={styles.savingsSection}>
      {/* Stacked bar */}
      <View style={styles.savingsBar}>
        <View style={[styles.savingsSegment, { flex: inStore, backgroundColor: Colors.savings }]} />
        <View style={[styles.savingsSegment, { flex: priceMatch, backgroundColor: Colors.goldStarAccent }]} />
      </View>

      {/* Legend */}
      <View style={styles.savingsLegend}>
        <View style={styles.savingsLegendItem}>
          <View style={[styles.savingsLegendDot, { backgroundColor: Colors.savings }]} />
          <View>
            <Text style={styles.savingsLegendLabel}>In-store discounts</Text>
            <Text style={[styles.savingsLegendValue, { color: Colors.savings }]}>
              ${inStore.toFixed(2)} ({inStorePct.toFixed(0)}%)
            </Text>
          </View>
        </View>
        <View style={styles.savingsLegendItem}>
          <View style={[styles.savingsLegendDot, { backgroundColor: Colors.goldStarAccent }]} />
          <View>
            <Text style={styles.savingsLegendLabel}>Price match refunds</Text>
            <Text style={[styles.savingsLegendValue, { color: Colors.goldStarDark }]}>
              ${priceMatch.toFixed(2)} ({priceMatchPct.toFixed(0)}%)
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.savingsTotalRow}>
        <Text style={styles.savingsTotalLabel}>Total savings</Text>
        <Text style={styles.savingsTotalValue}>${total.toFixed(2)}</Text>
      </View>
    </View>
  );
}

function ActivityStat({ icon, value, label, styles }: { icon: string; value: number; label: string; styles: Styles }) {
  return (
    <View style={styles.activityCard}>
      {icon === '🧾' ? (
        <ScanLineIcon color="rgba(150,150,150,0.65)"><Text style={styles.activityIcon}>{icon}</Text></ScanLineIcon>
      ) : icon === '📍' ? (
        <PinPulse color="rgba(150,150,150,0.5)"><Text style={styles.activityIcon}>{icon}</Text></PinPulse>
      ) : (
        <Text style={styles.activityIcon}>{icon}</Text>
      )}
      <Text style={styles.activityValue}>{value}</Text>
      <Text style={styles.activityLabel}>{label}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const makeStyles = (Colors: ColorScheme) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: spacing['2xl'] },

  // Header
  headingSection: { marginBottom: spacing['2xl'] },
  headingTitle: {
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    color: Colors.gray[900],
    letterSpacing: letterSpacing.tight,
    marginBottom: spacing.xs,
  },
  headingSubtitle: { fontSize: fontSize.sm, color: Colors.gray[400] },

  // Loading / empty
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    paddingTop: spacing['4xl'],
  },
  loadingText: { fontSize: fontSize.sm, color: Colors.gray[400] },
  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing['3xl'],
    alignItems: 'center',
    gap: spacing.md,
    ...shadow.md,
  },
  emptyIcon: { fontSize: 48 },
  emptyTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: Colors.gray[800],
    letterSpacing: letterSpacing.tight,
  },
  emptySubtitle: {
    fontSize: fontSize.md,
    color: Colors.gray[400],
    textAlign: 'center',
    lineHeight: 22,
  },

  // Metric cards (2x2 grid)
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  metricCard: {
    width: '47.5%',
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.sm,
  },
  metricIconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  metricIcon: { fontSize: 18 },
  metricValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: letterSpacing.tight,
    marginBottom: 2,
  },
  metricLabel: { fontSize: fontSize.xs, color: Colors.gray[400], fontWeight: '600' },

  // Card container
  card: {
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    marginBottom: spacing.xl,
    ...shadow.sm,
  },
  cardTitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.gray[400],
    letterSpacing: letterSpacing.caps,
    marginBottom: spacing.xl,
  },

  // Monthly chart
  chartArea: { height: 180 },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: '100%',
    gap: spacing.xs,
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barAmount: {
    fontSize: 9,
    color: Colors.gray[400],
    fontWeight: '600',
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  barTrack: {
    width: '100%',
    height: '72%',
    justifyContent: 'flex-end',
    backgroundColor: Colors.gray[100],
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: radius.sm,
  },
  barLabel: {
    fontSize: 9,
    color: Colors.gray[400],
    marginTop: spacing.xs,
    textAlign: 'center',
  },

  // Top items
  topItemsList: { gap: spacing.xl },
  topItemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  topItemRankWrap: {
    width: 24,
    alignItems: 'center',
    paddingTop: 2,
  },
  topItemRank: { fontSize: fontSize.md, fontWeight: '800' },
  topItemContent: { flex: 1, gap: spacing.xs },
  topItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topItemName: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: '700',
    color: Colors.gray[800],
    marginRight: spacing.sm,
  },
  topItemSpend: { fontSize: fontSize.md, fontWeight: '800', letterSpacing: letterSpacing.tight },
  topItemBarTrack: {
    height: 5,
    backgroundColor: Colors.gray[100],
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  topItemBarFill: { height: '100%', borderRadius: radius.pill },
  topItemQty: { fontSize: fontSize.xs, color: Colors.gray[400] },

  // Savings breakdown
  savingsSection: { gap: spacing.lg },
  savingsBar: {
    height: 12,
    flexDirection: 'row',
    borderRadius: radius.pill,
    overflow: 'hidden',
    backgroundColor: Colors.gray[100],
  },
  savingsSegment: { height: '100%' },
  savingsLegend: { gap: spacing.md },
  savingsLegendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  savingsLegendDot: { width: 10, height: 10, borderRadius: radius.pill },
  savingsLegendLabel: { fontSize: fontSize.xs, color: Colors.gray[500], marginBottom: 1 },
  savingsLegendValue: { fontSize: fontSize.md, fontWeight: '700' },
  savingsTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  savingsTotalLabel: { fontSize: fontSize.sm, fontWeight: '600', color: Colors.gray[600] },
  savingsTotalValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: Colors.savings,
    letterSpacing: letterSpacing.tight,
  },

  // Activity stats
  activityRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  activityCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadow.sm,
  },
  activityIcon: { fontSize: 28 },
  activityValue: {
    fontSize: fontSize['3xl'],
    fontWeight: '800',
    color: Colors.gray[900],
    letterSpacing: letterSpacing.tight,
  },
  activityLabel: { fontSize: fontSize.xs, color: Colors.gray[400], fontWeight: '600' },
});
