import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/colors';

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
  }, [query, allReceipts]);

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
      setDisplayed(query.trim() ? displayed : rows); // keep search results if active
    } catch (e: any) {
      setError(e.message ?? 'Failed to load receipts');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function runSearch(q: string, receipts: ReceiptRow[]) {
    setSearching(true);
    try {
      // Server-side: find receipt_ids whose items match the query (name or SKU)
      const { data: itemMatches } = await supabase
        .from('receipt_items')
        .select('receipt_id')
        .or(`description.ilike.%${q}%,sku.ilike.%${q}%`);

      const itemMatchIds = new Set(itemMatches?.map((i: any) => i.receipt_id) ?? []);
      const lower = q.toLowerCase();

      // Filter: receipt contains a matching item, OR warehouse name/code matches
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
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Receipt History</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Search bar */}
      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Item name, SKU, or warehouse..."
            placeholderTextColor={Colors.gray[500]}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {searching && <ActivityIndicator size="small" color={Colors.gray[500]} />}
        </View>
      </View>

      {error ? (
        <View style={styles.center}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => load(false)}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
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
          ListEmptyComponent={
            isSearching ? (
              <NoResults query={query.trim()} />
            ) : (
              <EmptyState />
            )
          }
        />
      )}
    </View>
  );
}

function ReceiptCard({ receipt, onPress }: { receipt: ReceiptRow; onPress: () => void }) {
  const date = new Date(receipt.transaction_date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const warehouseLabel = receipt.warehouse_name
    ? receipt.warehouse_code
      ? `${receipt.warehouse_name} #${receipt.warehouse_code}`
      : receipt.warehouse_name
    : 'Costco Warehouse';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.cardIcon}>
        <Text style={styles.cardIconText}>🧾</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardWarehouse} numberOfLines={1}>{warehouseLabel}</Text>
        <Text style={styles.cardMeta}>
          {date} · {receipt.item_count} {receipt.item_count === 1 ? 'item' : 'items'}
        </Text>
      </View>
      <View style={styles.cardRight}>
        {receipt.total_amount != null && (
          <Text style={styles.cardTotal}>${receipt.total_amount.toFixed(2)}</Text>
        )}
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

function EmptyState() {
  return (
    <View style={styles.emptyInner}>
      <Text style={styles.emptyIcon}>🧾</Text>
      <Text style={styles.emptyTitle}>No receipts yet</Text>
      <Text style={styles.emptySubtitle}>
        Scan your first Costco receipt to start tracking purchases
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
        No receipts found for "{query}". Try searching by a different item name, SKU, or warehouse.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  backButton: { width: 60 },
  backText: { fontSize: 17, color: Colors.costcoRed },
  title: { fontSize: 17, fontWeight: '700', color: Colors.gray[700] },

  // Search
  searchRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  searchIcon: { fontSize: 15 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.gray[700], padding: 0 },

  // List
  listContent: { paddingVertical: 8 },
  emptyContainer: { flex: 1 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  cardIconText: { fontSize: 20 },
  cardBody: { flex: 1 },
  cardWarehouse: { fontSize: 15, fontWeight: '600', color: Colors.gray[700], marginBottom: 3 },
  cardMeta: { fontSize: 13, color: Colors.gray[500] },
  cardRight: { alignItems: 'flex-end', marginLeft: 12 },
  cardTotal: { fontSize: 15, fontWeight: '700', color: Colors.gray[700], marginBottom: 2 },
  chevron: { fontSize: 20, color: Colors.gray[300] },
  separator: { height: 1, backgroundColor: Colors.gray[100], marginLeft: 74 },

  // Empty / no results
  emptyInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: Colors.gray[700], marginBottom: 8 },
  emptySubtitle: { fontSize: 14, color: Colors.gray[500], textAlign: 'center', lineHeight: 20 },

  // Error
  errorText: { fontSize: 15, color: Colors.gray[700], textAlign: 'center', marginBottom: 16 },
  retryButton: { paddingVertical: 10, paddingHorizontal: 24, borderWidth: 1, borderColor: Colors.costcoRed, borderRadius: 8 },
  retryText: { color: Colors.costcoRed, fontWeight: '600' },
});
