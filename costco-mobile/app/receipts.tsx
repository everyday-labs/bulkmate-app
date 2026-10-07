import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ColorScheme } from '../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../constants/theme';
import { FloatView } from '../components/Motion';

type ReceiptRow = {
  id: string;
  transaction_date: string;
  total_amount: number | null;
  warehouse_name: string | null;
  warehouse_code: string | null;
  item_count: number;
};

const SORT_OPTIONS = [
  { key: 'date_desc', label: 'Newest first' },
  { key: 'date_asc', label: 'Oldest first' },
  { key: 'amount_desc', label: 'Highest total' },
  { key: 'amount_asc', label: 'Lowest total' },
] as const;
type SortKey = (typeof SORT_OPTIONS)[number]['key'];

function sortReceipts(rows: ReceiptRow[], sortBy: SortKey): ReceiptRow[] {
  const list = [...rows];
  switch (sortBy) {
    case 'date_desc':
      return list.sort((a, b) => b.transaction_date.localeCompare(a.transaction_date));
    case 'date_asc':
      return list.sort((a, b) => a.transaction_date.localeCompare(b.transaction_date));
    case 'amount_desc':
      return list.sort((a, b) => (b.total_amount ?? 0) - (a.total_amount ?? 0));
    case 'amount_asc':
      return list.sort((a, b) => (a.total_amount ?? 0) - (b.total_amount ?? 0));
  }
}

const DATE_RANGE_OPTIONS = [
  { key: 'all', label: 'All Time' },
  { key: '30d', label: 'Last 30 Days' },
  { key: '3m', label: 'Last 3 Months' },
  { key: '6m', label: 'Last 6 Months' },
  { key: '1y', label: 'Last Year' },
] as const;
type DateRangeKey = (typeof DATE_RANGE_OPTIONS)[number]['key'];

function dateRangeCutoff(key: DateRangeKey): string | null {
  if (key === 'all') return null;
  const now = new Date();
  const cutoff = new Date(now);
  if (key === '30d') cutoff.setDate(now.getDate() - 30);
  else if (key === '3m') cutoff.setMonth(now.getMonth() - 3);
  else if (key === '6m') cutoff.setMonth(now.getMonth() - 6);
  else if (key === '1y') cutoff.setFullYear(now.getFullYear() - 1);
  return cutoff.toISOString().slice(0, 10);
}

const AMOUNT_OPTIONS = [
  { key: 'all', label: 'Any Amount' },
  { key: 'under50', label: 'Under $50' },
  { key: '50to150', label: '$50 – $150' },
  { key: '150to300', label: '$150 – $300' },
  { key: '300plus', label: '$300+' },
] as const;
type AmountKey = (typeof AMOUNT_OPTIONS)[number]['key'];

function matchesAmount(amount: number | null, key: AmountKey): boolean {
  const amt = amount ?? 0;
  switch (key) {
    case 'all':
      return true;
    case 'under50':
      return amt < 50;
    case '50to150':
      return amt >= 50 && amt < 150;
    case '150to300':
      return amt >= 150 && amt < 300;
    case '300plus':
      return amt >= 300;
  }
}

export default function ReceiptsScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { month: monthParam, label: monthLabelParam } = useLocalSearchParams<{
    month?: string;
    label?: string;
  }>();
  const [allReceipts, setAllReceipts] = useState<ReceiptRow[]>([]);
  const [displayed, setDisplayed] = useState<ReceiptRow[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthFilter, setMonthFilter] = useState<{ key: string; label: string } | null>(
    monthParam ? { key: monthParam, label: monthLabelParam ?? monthParam } : null,
  );
  const [warehouseFilter, setWarehouseFilter] = useState<string | null>(null);
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeKey>('all');
  const [amountFilter, setAmountFilter] = useState<AmountKey>('all');
  const [sortBy, setSortBy] = useState<SortKey>('date_desc');
  const [openMenu, setOpenMenu] = useState<'sort' | 'warehouse' | 'dateRange' | 'amount' | null>(
    null,
  );
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Arriving via a fresh navigation with a new ?month= (e.g. tapping a
  // different bar on the Analytics chart) should re-sync the filter even
  // though this screen instance may already be mounted.
  useEffect(() => {
    if (monthParam) setMonthFilter({ key: monthParam, label: monthLabelParam ?? monthParam });
  }, [monthParam, monthLabelParam]);

  const monthFiltered = useMemo(() => {
    if (!monthFilter) return allReceipts;
    return allReceipts.filter((r) => r.transaction_date.slice(0, 7) === monthFilter.key);
  }, [allReceipts, monthFilter]);

  const warehouseOptions = useMemo(() => {
    const set = new Set<string>();
    allReceipts.forEach((r) => {
      if (r.warehouse_name) set.add(r.warehouse_name);
    });
    return Array.from(set).sort();
  }, [allReceipts]);

  const filteredBase = useMemo(() => {
    let list = monthFiltered;
    if (warehouseFilter) list = list.filter((r) => r.warehouse_name === warehouseFilter);
    const cutoff = dateRangeCutoff(dateRangeFilter);
    if (cutoff) list = list.filter((r) => r.transaction_date >= cutoff);
    if (amountFilter !== 'all')
      list = list.filter((r) => matchesAmount(r.total_amount, amountFilter));
    return list;
  }, [monthFiltered, warehouseFilter, dateRangeFilter, amountFilter]);

  const hasActiveFilters =
    !!monthFilter || !!warehouseFilter || dateRangeFilter !== 'all' || amountFilter !== 'all';

  // Keyed on the user id, not [] — load() filters by session.user.id, and on
  // a cold start this screen can focus before auth resolves. Without the
  // dependency it would fire once with an undefined user and never retry.
  useFocusEffect(
    useCallback(() => {
      if (!session?.user.id) return;
      load(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user.id]),
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

  // Debounce search — runs 350ms after user stops typing. Searches within
  // the month/warehouse filters (if any), not the full receipt list.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();

    if (!q) {
      setDisplayed(filteredBase);
      return;
    }

    debounceRef.current = setTimeout(() => {
      runSearch(q, filteredBase);
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, filteredBase, runSearch]);

  const sortedDisplayed = useMemo(() => sortReceipts(displayed, sortBy), [displayed, sortBy]);

  async function load(isRefresh: boolean) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const { data, error: err } = await supabase
        .from('receipts')
        .select(
          'id, transaction_date, total_amount, warehouses(name, warehouse_code), receipt_items(id)',
        )
        .eq('user_id', session?.user.id ?? '')
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
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backButton, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
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

      {/* Sort + filter controls */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.controlsRow}
        contentContainerStyle={styles.controlsRowContent}
      >
        <Pressable
          style={({ pressed }) => [styles.controlPill, pressed && { opacity: 0.7 }]}
          onPress={() => setOpenMenu((m) => (m === 'sort' ? null : 'sort'))}
        >
          <Text style={styles.controlPillText}>
            {SORT_OPTIONS.find((o) => o.key === sortBy)!.label} ▾
          </Text>
        </Pressable>
        {warehouseOptions.length > 1 && (
          <Pressable
            style={({ pressed }) => [styles.controlPill, pressed && { opacity: 0.7 }]}
            onPress={() => setOpenMenu((m) => (m === 'warehouse' ? null : 'warehouse'))}
          >
            <Text style={styles.controlPillText} numberOfLines={1}>
              {warehouseFilter ?? 'All Warehouses'} ▾
            </Text>
          </Pressable>
        )}
        <Pressable
          style={({ pressed }) => [styles.controlPill, pressed && { opacity: 0.7 }]}
          onPress={() => setOpenMenu((m) => (m === 'dateRange' ? null : 'dateRange'))}
        >
          <Text style={styles.controlPillText} numberOfLines={1}>
            {DATE_RANGE_OPTIONS.find((o) => o.key === dateRangeFilter)!.label} ▾
          </Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.controlPill, pressed && { opacity: 0.7 }]}
          onPress={() => setOpenMenu((m) => (m === 'amount' ? null : 'amount'))}
        >
          <Text style={styles.controlPillText} numberOfLines={1}>
            {AMOUNT_OPTIONS.find((o) => o.key === amountFilter)!.label} ▾
          </Text>
        </Pressable>
      </ScrollView>

      {openMenu === 'sort' && (
        <View style={styles.dropdownMenu}>
          {SORT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={({ pressed }) => [styles.dropdownItem, pressed && { opacity: 0.7 }]}
              onPress={() => {
                setSortBy(opt.key);
                setOpenMenu(null);
              }}
            >
              <Text
                style={[
                  styles.dropdownItemText,
                  sortBy === opt.key && styles.dropdownItemTextActive,
                ]}
              >
                {opt.label}
              </Text>
              {sortBy === opt.key && <Text style={styles.dropdownCheck}>✓</Text>}
            </Pressable>
          ))}
        </View>
      )}

      {openMenu === 'warehouse' && (
        <View style={styles.dropdownMenu}>
          <Pressable
            style={({ pressed }) => [styles.dropdownItem, pressed && { opacity: 0.7 }]}
            onPress={() => {
              setWarehouseFilter(null);
              setOpenMenu(null);
            }}
          >
            <Text
              style={[styles.dropdownItemText, !warehouseFilter && styles.dropdownItemTextActive]}
            >
              All Warehouses
            </Text>
            {!warehouseFilter && <Text style={styles.dropdownCheck}>✓</Text>}
          </Pressable>
          {warehouseOptions.map((w) => (
            <Pressable
              key={w}
              style={({ pressed }) => [styles.dropdownItem, pressed && { opacity: 0.7 }]}
              onPress={() => {
                setWarehouseFilter(w);
                setOpenMenu(null);
              }}
            >
              <Text
                style={[
                  styles.dropdownItemText,
                  warehouseFilter === w && styles.dropdownItemTextActive,
                ]}
                numberOfLines={1}
              >
                {w}
              </Text>
              {warehouseFilter === w && <Text style={styles.dropdownCheck}>✓</Text>}
            </Pressable>
          ))}
        </View>
      )}

      {openMenu === 'dateRange' && (
        <View style={styles.dropdownMenu}>
          {DATE_RANGE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={({ pressed }) => [styles.dropdownItem, pressed && { opacity: 0.7 }]}
              onPress={() => {
                setDateRangeFilter(opt.key);
                setOpenMenu(null);
              }}
            >
              <Text
                style={[
                  styles.dropdownItemText,
                  dateRangeFilter === opt.key && styles.dropdownItemTextActive,
                ]}
              >
                {opt.label}
              </Text>
              {dateRangeFilter === opt.key && <Text style={styles.dropdownCheck}>✓</Text>}
            </Pressable>
          ))}
        </View>
      )}

      {openMenu === 'amount' && (
        <View style={styles.dropdownMenu}>
          {AMOUNT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={({ pressed }) => [styles.dropdownItem, pressed && { opacity: 0.7 }]}
              onPress={() => {
                setAmountFilter(opt.key);
                setOpenMenu(null);
              }}
            >
              <Text
                style={[
                  styles.dropdownItemText,
                  amountFilter === opt.key && styles.dropdownItemTextActive,
                ]}
              >
                {opt.label}
              </Text>
              {amountFilter === opt.key && <Text style={styles.dropdownCheck}>✓</Text>}
            </Pressable>
          ))}
        </View>
      )}

      {hasActiveFilters && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterChipRow}
          contentContainerStyle={styles.filterChipRowContent}
        >
          {monthFilter && (
            <View style={styles.filterChip}>
              <Text style={styles.filterChipText}>{monthFilter.label}</Text>
              <Pressable onPress={() => setMonthFilter(null)} hitSlop={8}>
                <Text style={styles.filterChipClose}>✕</Text>
              </Pressable>
            </View>
          )}
          {warehouseFilter && (
            <View style={styles.filterChip}>
              <Text style={styles.filterChipText} numberOfLines={1}>
                {warehouseFilter}
              </Text>
              <Pressable onPress={() => setWarehouseFilter(null)} hitSlop={8}>
                <Text style={styles.filterChipClose}>✕</Text>
              </Pressable>
            </View>
          )}
          {dateRangeFilter !== 'all' && (
            <View style={styles.filterChip}>
              <Text style={styles.filterChipText}>
                {DATE_RANGE_OPTIONS.find((o) => o.key === dateRangeFilter)!.label}
              </Text>
              <Pressable onPress={() => setDateRangeFilter('all')} hitSlop={8}>
                <Text style={styles.filterChipClose}>✕</Text>
              </Pressable>
            </View>
          )}
          {amountFilter !== 'all' && (
            <View style={styles.filterChip}>
              <Text style={styles.filterChipText}>
                {AMOUNT_OPTIONS.find((o) => o.key === amountFilter)!.label}
              </Text>
              <Pressable onPress={() => setAmountFilter('all')} hitSlop={8}>
                <Text style={styles.filterChipClose}>✕</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      )}

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
          data={sortedDisplayed}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            sortedDisplayed.length === 0 ? styles.emptyContainer : styles.listContent
          }
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
              styles={styles}
              onPress={() => router.push(`/receipt-success?receiptId=${item.id}`)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            isSearching ? (
              <NoResults query={query.trim()} styles={styles} />
            ) : hasActiveFilters ? (
              <MonthEmptyState
                label={monthFilter?.label ?? warehouseFilter ?? 'your filters'}
                styles={styles}
              />
            ) : (
              <EmptyState styles={styles} />
            )
          }
        />
      )}
    </View>
  );
}

type Styles = ReturnType<typeof makeStyles>;

function ReceiptCard({
  receipt,
  onPress,
  styles,
}: {
  receipt: ReceiptRow;
  onPress: () => void;
  styles: Styles;
}) {
  const date = new Date(receipt.transaction_date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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
          <Text style={styles.cardWarehouse} numberOfLines={1}>
            {warehouse}
          </Text>
          {code && <Text style={styles.cardCode}>{code}</Text>}
        </View>
        <Text style={styles.cardMeta}>
          {date}
          {'  ·  '}
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

function EmptyState({ styles }: { styles: Styles }) {
  return (
    <View style={styles.emptyInner}>
      <FloatView>
        <Text style={styles.emptyIcon}>🧾</Text>
      </FloatView>
      <Text style={styles.emptyTitle}>No receipts yet</Text>
      <Text style={styles.emptySubtitle}>
        Scan your first Costco receipt to start tracking your spending.
      </Text>
    </View>
  );
}

function MonthEmptyState({ label, styles }: { label: string; styles: Styles }) {
  return (
    <View style={styles.emptyInner}>
      <FloatView>
        <Text style={styles.emptyIcon}>🗓</Text>
      </FloatView>
      <Text style={styles.emptyTitle}>No matching receipts</Text>
      <Text style={styles.emptySubtitle}>
        Nothing found for "{label}". Try clearing the filter to see all receipts.
      </Text>
    </View>
  );
}

function NoResults({ query, styles }: { query: string; styles: Styles }) {
  return (
    <View style={styles.emptyInner}>
      <FloatView>
        <Text style={styles.emptyIcon}>🔍</Text>
      </FloatView>
      <Text style={styles.emptyTitle}>No results</Text>
      <Text style={styles.emptySubtitle}>
        Nothing found for "{query}".{'\n'}Try a different item name, SKU, or warehouse.
      </Text>
    </View>
  );
}

const makeStyles = (Colors: ColorScheme) =>
  StyleSheet.create({
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
    title: {
      fontSize: fontSize.xl,
      fontWeight: '700',
      color: Colors.gray[900],
      letterSpacing: letterSpacing.tight,
    },

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

    // Sort + filter controls
    controlsRow: {
      flexGrow: 0,
      maxHeight: 52,
      backgroundColor: Colors.surface,
    },
    controlsRowContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
    },
    controlPill: {
      backgroundColor: Colors.gray[100],
      borderRadius: radius.pill,
      paddingVertical: spacing.xs + 1,
      paddingHorizontal: spacing.md,
    },
    controlPillText: { fontSize: fontSize.xs, fontWeight: '700', color: Colors.gray[700] },
    dropdownMenu: {
      marginHorizontal: spacing.lg,
      marginBottom: spacing.xs,
      backgroundColor: Colors.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      overflow: 'hidden',
      ...shadow.sm,
    },
    dropdownItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    dropdownItemText: { fontSize: fontSize.sm, color: Colors.gray[700], flexShrink: 1 },
    dropdownItemTextActive: { color: Colors.costcoRed, fontWeight: '700' },
    dropdownCheck: { fontSize: fontSize.sm, color: Colors.costcoRed, fontWeight: '700' },

    // Active filter chips (dismissible)
    filterChipRow: {
      flexGrow: 0,
      maxHeight: 60,
      backgroundColor: Colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    filterChipRowContent: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    filterChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: Colors.executiveNavySubtle,
      borderRadius: radius.pill,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.md,
    },
    filterChipText: { fontSize: fontSize.sm, fontWeight: '700', color: Colors.executiveNavy },
    filterChipClose: { fontSize: 12, fontWeight: '700', color: Colors.executiveNavy },

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

    // Error
    errorText: {
      fontSize: fontSize.md,
      color: Colors.gray[700],
      textAlign: 'center',
      marginBottom: spacing.lg,
    },
    retryButton: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing['2xl'],
      backgroundColor: Colors.costcoRedSolid,
      borderRadius: radius.lg,
    },
    retryText: { color: Colors.white, fontWeight: '700', fontSize: fontSize.md },
  });
