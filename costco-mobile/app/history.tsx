import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ColorScheme } from '../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../constants/theme';
import { FloatView, Twinkle } from '../components/Motion';

// Unified History screen — Home's "History" quick action opens this instead
// of jumping straight to receipts, since the app now tracks three kinds of
// scans (receipts, barcode lookups, check-ins) each with their own dedicated
// list screen (/receipts, /barcode-history, /checkin-history). Those three
// stay as-is (still linked to individually from the Scan hub's per-mode
// history row) — this screen is an additional combined entry point with its
// own lightweight tab switcher, not a replacement.

type HistoryTab = 'receipt' | 'barcode' | 'checkin';

const TABS: { key: HistoryTab; label: string; icon: string }[] = [
  { key: 'receipt', label: 'Receipts', icon: '🧾' },
  { key: 'barcode', label: 'Barcode', icon: '📦' },
  { key: 'checkin', label: 'Check-ins', icon: '📍' },
];

type ReceiptRow = {
  id: string;
  transaction_date: string;
  total_amount: number | null;
  warehouse_name: string | null;
  item_count: number;
};

type LookupRow = {
  id: string;
  sku: string;
  name: string | null;
  brand: string | null;
  image_url: string | null;
  sale_price: number | null;
  looked_up_at: string;
};

type CheckInRow = {
  id: string;
  checked_in_at: string;
  stars_earned: number;
  warehouse_name: string | null;
  warehouse_city: string | null;
  warehouse_tier: string | null;
};

function tierColor(Colors: ColorScheme, tier: string | null): string {
  if (tier === 'Legendary') return Colors.goldStarAccent;
  if (tier === 'Rare') return Colors.executiveNavy;
  return Colors.gray[400];
}

export default function HistoryScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { tab: requestedTab } = useLocalSearchParams<{ tab?: string }>();

  const [tab, setTab] = useState<HistoryTab>(
    requestedTab === 'barcode' || requestedTab === 'checkin' ? requestedTab : 'receipt',
  );

  useEffect(() => {
    if (requestedTab === 'receipt' || requestedTab === 'barcode' || requestedTab === 'checkin') {
      setTab(requestedTab);
    }
  }, [requestedTab]);

  const [receipts, setReceipts] = useState<ReceiptRow[] | null>(null);
  const [lookups, setLookups] = useState<LookupRow[] | null>(null);
  const [checkIns, setCheckIns] = useState<CheckInRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const loadTab = useCallback(
    async (t: HistoryTab) => {
      const userId = session?.user.id;
      if (!userId) return;
      setLoading(true);
      try {
        if (t === 'receipt') {
          const { data } = await supabase
            .from('receipts')
            .select('id, transaction_date, total_amount, warehouses(name), receipt_items(id)')
            .eq('user_id', userId)
            .order('transaction_date', { ascending: false })
            .limit(100);
          setReceipts(
            (data ?? []).map((r: any) => ({
              id: r.id,
              transaction_date: r.transaction_date,
              total_amount: r.total_amount,
              warehouse_name: r.warehouses?.name ?? null,
              item_count: r.receipt_items?.length ?? 0,
            })),
          );
        } else if (t === 'barcode') {
          const { data } = await supabase
            .from('product_lookups')
            .select('id, sku, name, brand, image_url, sale_price, looked_up_at')
            .eq('user_id', userId)
            .order('looked_up_at', { ascending: false })
            .limit(100);
          setLookups((data ?? []) as LookupRow[]);
        } else {
          const { data } = await supabase
            .from('check_ins')
            .select('id, checked_in_at, stars_earned, warehouses(name, city, tier)')
            .eq('user_id', userId)
            .order('checked_in_at', { ascending: false })
            .limit(100);
          setCheckIns(
            (data ?? []).map((c: any) => ({
              id: c.id,
              checked_in_at: c.checked_in_at,
              stars_earned: c.stars_earned,
              warehouse_name: c.warehouses?.name ?? null,
              warehouse_city: c.warehouses?.city ?? null,
              warehouse_tier: c.warehouses?.tier ?? null,
            })),
          );
        }
      } finally {
        setLoading(false);
      }
    },
    [session?.user.id],
  );

  // Lazy-load each tab's data the first time it's selected, cache after that.
  useFocusEffect(
    useCallback(() => {
      if (!session?.user.id) return;
      if (tab === 'receipt' && receipts === null) loadTab('receipt');
      else if (tab === 'barcode' && lookups === null) loadTab('barcode');
      else if (tab === 'checkin' && checkIns === null) loadTab('checkin');
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tab, receipts, lookups, checkIns, session?.user.id]),
  );

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
        <Text style={styles.title}>History</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.tabRow}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              style={({ pressed }) => [
                styles.tab,
                active && styles.tabActive,
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => setTab(t.key)}
            >
              <Text style={styles.tabIcon}>{t.icon}</Text>
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading &&
      ((tab === 'receipt' && receipts === null) ||
        (tab === 'barcode' && lookups === null) ||
        (tab === 'checkin' && checkIns === null)) ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.costcoRed} />
        </View>
      ) : tab === 'receipt' ? (
        <FlatList
          data={receipts ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            (receipts ?? []).length === 0 ? styles.emptyContainer : styles.listContent
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => router.push(`/receipt-success?receiptId=${item.id}`)}
            >
              <View style={styles.cardIconWrap}>
                <Text style={styles.cardIconText}>🧾</Text>
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.warehouse_name ?? 'Costco Warehouse'}
                </Text>
                <Text style={styles.cardMeta}>
                  {new Date(item.transaction_date + 'T00:00:00').toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                  {'  ·  '}
                  {item.item_count} {item.item_count === 1 ? 'item' : 'items'}
                </Text>
              </View>
              {item.total_amount != null && (
                <Text style={styles.cardValue}>${item.total_amount.toFixed(2)}</Text>
              )}
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
          ListEmptyComponent={
            <View style={styles.emptyInner}>
              <FloatView>
                <Text style={styles.emptyIcon}>🧾</Text>
              </FloatView>
              <Text style={styles.emptyTitle}>No receipts yet</Text>
              <Text style={styles.emptySubtitle}>
                Scan your first Costco receipt to start tracking your spending.
              </Text>
            </View>
          }
        />
      ) : tab === 'barcode' ? (
        <FlatList
          data={lookups ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            (lookups ?? []).length === 0 ? styles.emptyContainer : styles.listContent
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              onPress={() => router.push(`/product/${item.sku}`)}
            >
              <View style={styles.cardIconWrap}>
                {item.image_url ? (
                  <Image
                    source={{ uri: item.image_url }}
                    style={styles.cardImage}
                    resizeMode="contain"
                  />
                ) : (
                  <Text style={styles.cardIconText}>📦</Text>
                )}
              </View>
              <View style={styles.cardBody}>
                <Text style={styles.cardTitle} numberOfLines={1}>
                  {item.name ?? item.sku}
                </Text>
                <Text style={styles.cardMeta}>
                  {item.brand ? `${item.brand} · ` : ''}
                  {new Date(item.looked_up_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                </Text>
              </View>
              {item.sale_price != null && (
                <Text style={styles.cardValue}>${item.sale_price.toFixed(2)}</Text>
              )}
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
          ListEmptyComponent={
            <View style={styles.emptyInner}>
              <FloatView>
                <Text style={styles.emptyIcon}>📦</Text>
              </FloatView>
              <Text style={styles.emptyTitle}>No barcode scans yet</Text>
              <Text style={styles.emptySubtitle}>
                Scan a product barcode to see pricing and history here.
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={checkIns ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            (checkIns ?? []).length === 0 ? styles.emptyContainer : styles.listContent
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardIconWrap}>
                <Text style={styles.cardIconText}>📍</Text>
              </View>
              <View style={styles.cardBody}>
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardTitle} numberOfLines={1}>
                    {item.warehouse_name ?? 'Costco Warehouse'}
                  </Text>
                  {item.warehouse_tier && (
                    <View
                      style={[
                        styles.tierChip,
                        { backgroundColor: tierColor(Colors, item.warehouse_tier) + '22' },
                      ]}
                    >
                      <Text
                        style={[
                          styles.tierChipText,
                          { color: tierColor(Colors, item.warehouse_tier) },
                        ]}
                      >
                        {item.warehouse_tier}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={styles.cardMeta}>
                  {item.warehouse_city ? `${item.warehouse_city} · ` : ''}
                  {new Date(item.checked_in_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })}
                  {'  ·  '}
                  {new Date(item.checked_in_at).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={styles.cardValue}>+{item.stars_earned}</Text>
                <Twinkle>
                  <Text style={styles.cardValue}>⭐</Text>
                </Twinkle>
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
          ListEmptyComponent={
            <View style={styles.emptyInner}>
              <FloatView>
                <Text style={styles.emptyIcon}>📍</Text>
              </FloatView>
              <Text style={styles.emptyTitle}>No check-ins yet</Text>
              <Text style={styles.emptySubtitle}>
                Check in at a Costco warehouse to start earning stars.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const makeStyles = (Colors: ColorScheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

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
    title: {
      fontSize: fontSize.xl,
      fontWeight: '700',
      color: Colors.gray[900],
      letterSpacing: letterSpacing.tight,
    },

    tabRow: {
      flexDirection: 'row',
      backgroundColor: Colors.gray[100],
      borderRadius: radius.xl,
      padding: spacing.xs,
      gap: spacing.xs,
      margin: spacing.lg,
    },
    tab: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm + 2,
      borderRadius: radius.lg,
    },
    tabActive: { backgroundColor: Colors.surface, ...shadow.sm },
    tabIcon: { fontSize: 14 },
    tabLabel: { fontSize: fontSize.sm, fontWeight: '600', color: Colors.gray[400] },
    tabLabelActive: { color: Colors.gray[900], fontWeight: '700' },

    listContent: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: 2 },
    emptyContainer: { flex: 1 },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
      backgroundColor: Colors.surface,
      borderRadius: radius.xl,
      gap: spacing.md,
      ...shadow.sm,
      marginVertical: 3,
    },
    cardPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
    cardIconWrap: {
      width: 44,
      height: 44,
      borderRadius: radius.lg,
      backgroundColor: Colors.gray[100],
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardIconText: { fontSize: 20 },
    cardImage: { width: 36, height: 36 },
    cardBody: { flex: 1 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
    cardTitle: {
      fontSize: fontSize.md,
      fontWeight: '700',
      color: Colors.gray[900],
      marginBottom: 2,
      flexShrink: 1,
    },
    cardMeta: { fontSize: fontSize.xs, color: Colors.gray[400] },
    cardValue: { fontSize: fontSize.md, fontWeight: '700', color: Colors.executiveNavy },
    chevron: { fontSize: 18, color: Colors.gray[300] },

    tierChip: { borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 2 },
    tierChipText: { fontSize: 9, fontWeight: '800', letterSpacing: letterSpacing.caps },

    emptyInner: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing['4xl'],
    },
    emptyIcon: { fontSize: 52, marginBottom: spacing.xl },
    emptyTitle: {
      fontSize: fontSize['3xl'],
      fontWeight: '700',
      color: Colors.gray[800],
      marginBottom: spacing.sm,
      letterSpacing: letterSpacing.tight,
    },
    emptySubtitle: {
      fontSize: fontSize.md,
      color: Colors.gray[400],
      textAlign: 'center',
      lineHeight: 22,
    },
  });
