import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../constants/theme';

type ReceiptRow = {
  id: string;
  transaction_date: string;
  total_amount: number | null;
  warehouse_name: string | null;
  warehouse_code: string | null;
  item_count: number;
};

export default function ReceiptsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [allReceipts, setAllReceipts] = useState<ReceiptRow[]>([]);
  const [displayed, setDisplayed] = useState<ReceiptRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      load(false);
    }, []),
  );

  const runSearch = useCallback(async (q: string, receipts: ReceiptRow[]) => {
    setSearching(true);
    try {
      const { data: itemMatches } = await supabase
        .from('receipt_items')
        .select('receipt_id')
        .or(`description.ilike.%${q}%,sku.ilike.%${q}%`);

      const itemMatchIds = new Set(itemMatches?.map((i: any) => i.receipt_id) ?? []);
      const lower = q.toLowerCase();

      const filtered = receipts.filter(
        (r) =>
          itemMatchIds.has(r.id) ||
          r.warehouse_name?.toLowerCase().includes(lower) ||
          r.warehouse_code?.toLowerCase().includes(lower),
      );

      setDisplayed(filtered);
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounce search — runs 350ms after user stops typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();

    if (!q) {
      setDisplayed(allReceipts);
      return;
    }

    debounceRef.current = setTimeout(() => {
      runSearch(q, allReceipts);
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, allReceipts, runSearch]);

  async function load(isRefresh: boolean) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const { data, error: err } = await supabase
        .from('receipts')
        .select('id, transaction_date, total_amount, warehouses(name, warehouse_code), receipt_items(id)')
        .order('transaction_date', { ascending: false })
        .limit(100);

      if (err) throw err;

      const rows: ReceiptRow[] = (data ?? []).map((r: any) => ({
        id: r.id,
        transaction_date: r.transaction_date,
        total_amount: r.total_amount,
        warehouse_name: r.warehouses?.name ?? null,
        warehouse_code: r.warehouses?.warehouse_code ?? null,
        item_count: r.receipt_items?.length ?? 0,
      }));

      setAllReceipts(rows);
      // useEffect([query, allReceipts, runSearch]) re-applies any active search automatically.
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load receipts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.costcoRed} />
      </View>
    );
  }

  const isSearching = query.trim().length > 0;

  return (
    <View style={styles.container}>
      {/* Nav header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} hitSlop={8}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Receipt History</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Item, SKU, or warehouse…"
            placeholderTextColor={Colors.gray[400]}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {searching && <ActivityIndicator size="small" color={Colors.gray[400]} />}
        </View>
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={({ pressed }) => [styles.retryButton, pressed && { opacity: 0.7 }]}
            onPress={() => load(false)}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(item) => item.id}
          contentContainerStyle={displayed.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={
            !isSearching ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => load(true)}
                tintColor={Colors.costcoRed}
              />
            ) : undefined
          }
          renderItem={({ item }) => (
            <ReceiptCard
              receipt={item}
              onPress={() => router.push(`/receipt-success?receiptId=${item.id}`)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={isSearching ? <NoResults query={query.trim()} /> : <EmptyState />}
        />
      )}
    </View>
  );
}

function ReceiptCard({ receipt, onPress }: { receipt: ReceiptRow; onPress: () => void }) {
  const date = new Date(receipt.transaction_date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const warehouse = receipt.warehouse_name ?? 'Costco Warehouse';
  const code = receipt.warehouse_code ? `#${receipt.warehouse_code}` : null;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <View style={styles.cardIconWrap}>
        <Text style={styles.cardIconText}>🧾</Text>
      </View>
      <View style={styles.cardBody}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardWarehouse} numberOfLines={1}>{warehouse}</Text>
          {code && <Text style={styles.cardCode}>{code}</Text>}
        </View>
        <Text style={styles.cardMeta}>
          {date}{'  ·  '}
          <Text style={styles.cardItemCount}>
            {receipt.item_count} {receipt.item_count === 1 ? 'item' : 'items'}
          </Text>
        </Text>
      </View>
      <View style={styles.cardRight}>
        {receipt.total_amount != null && (
          <Text style={styles.cardTotal}>${receipt.total_amount.toFixed(2)}</Text>
        )}
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyInner}>
      <Text style={styles.emptyIcon}>🧾</Text>
      <Text style={styles.emptyTitle}>No receipts yet</Text>
      <Text style={styles.emptySubtitle}>
        Scan your first Costco receipt to start tracking your spending.
      </Text>
    </View>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <View style={styles.emptyInner}>
      <Text style={styles.emptyIcon}>🔍</Text>
      <Text style={styles.emptyTitle}>No results</Text>
      <Text style={styles.emptySubtitle}>
        Nothing found for "{query}".{'\n'}Try a different item name, SKU, or warehouse.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['2xl'] },

  // Header
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

  // Search
  searchRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md - 2,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    borderRadius: radius.xl,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 1,
    gap: spacing.sm,
  },
  searchIcon: { fontSize: 14 },
  searchInput: { flex: 1, fontSize: fontSize.md, color: Colors.gray[900], padding: 0 },

  // List
  listContent: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, gap: 2 },
  emptyContainer: { flex: 1 },

  // Receipt card
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
  cardIconText: { fontSize: 22 },
  cardBody: { flex: 1 },
  cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 3 },
  cardWarehouse: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: Colors.gray[900],
    flexShrink: 1,
  },
  cardCode: {
    fontSize: fontSize.xs,
    fontWeight: '600',
    color: Colors.gray[400],
    backgroundColor: Colors.gray[100],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  cardMeta: { fontSize: fontSize.sm, color: Colors.gray[400] },
  cardItemCount: { color: Colors.gray[400] },
  cardRight: { alignItems: 'flex-end', gap: spacing.xs },
  cardTotal: {
    fontSize: fontSize.lg,
    fontWeight: '700',
    color: Colors.executiveNavy,
    letterSpacing: letterSpacing.tight,
  },
  chevron: { fontSize: 18, color: Colors.gray[300] },
  separator: { height: 0 },

  // Empty / no results
  emptyInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['4xl'] },
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

  // Error
  errorText: { fontSize: fontSize.md, color: Colors.gray[700], textAlign: 'center', marginBottom: spacing.lg },
  retryButton: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    backgroundColor: Colors.costcoRed,
    borderRadius: radius.lg,
  },
  retryText: { color: Colors.white, fontWeight: '700', fontSize: fontSize.md },
});
