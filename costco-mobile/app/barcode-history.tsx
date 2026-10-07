import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Image,
  TextInput,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ColorScheme } from '../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../constants/theme';
import { FloatView } from '../components/Motion';

type LookupRow = {
  id: string;
  sku: string;
  name: string | null;
  brand: string | null;
  image_url: string | null;
  sale_price: number | null;
  looked_up_at: string;
};

const SORT_OPTIONS = [
  { key: 'date_desc', label: 'Newest first' },
  { key: 'date_asc', label: 'Oldest first' },
  { key: 'price_desc', label: 'Highest price' },
  { key: 'price_asc', label: 'Lowest price' },
] as const;
type SortKey = (typeof SORT_OPTIONS)[number]['key'];

function sortLookups(rows: LookupRow[], sortBy: SortKey): LookupRow[] {
  const list = [...rows];
  switch (sortBy) {
    case 'date_desc':
      return list.sort((a, b) => b.looked_up_at.localeCompare(a.looked_up_at));
    case 'date_asc':
      return list.sort((a, b) => a.looked_up_at.localeCompare(b.looked_up_at));
    case 'price_desc':
      return list.sort((a, b) => (b.sale_price ?? 0) - (a.sale_price ?? 0));
    case 'price_asc':
      return list.sort((a, b) => (a.sale_price ?? 0) - (b.sale_price ?? 0));
  }
}

export default function BarcodeHistoryScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [rows, setRows] = useState<LookupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('date_desc');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name?.toLowerCase().includes(q) ||
        r.brand?.toLowerCase().includes(q) ||
        r.sku.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const sorted = useMemo(() => sortLookups(filtered, sortBy), [filtered, sortBy]);

  useFocusEffect(
    useCallback(() => {
      load(false);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user.id]),
  );

  async function load(isRefresh: boolean) {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const userId = session?.user.id;
      if (!userId) return;

      const { data, error: err } = await supabase
        .from('product_lookups')
        .select('id, sku, name, brand, image_url, sale_price, looked_up_at')
        .eq('user_id', userId)
        .order('looked_up_at', { ascending: false })
        .limit(100);

      if (err) throw err;
      setRows((data ?? []) as LookupRow[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load barcode scan history');
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
        <Text style={styles.title}>Barcode History</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Item, brand, or SKU…"
            placeholderTextColor={Colors.gray[400]}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      <View style={styles.controlsRow}>
        <Pressable
          style={({ pressed }) => [styles.controlPill, pressed && { opacity: 0.7 }]}
          onPress={() => setSortMenuOpen((o) => !o)}
        >
          <Text style={styles.controlPillText}>
            {SORT_OPTIONS.find((o) => o.key === sortBy)!.label} ▾
          </Text>
        </Pressable>
      </View>

      {sortMenuOpen && (
        <View style={styles.dropdownMenu}>
          {SORT_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={({ pressed }) => [styles.dropdownItem, pressed && { opacity: 0.7 }]}
              onPress={() => {
                setSortBy(opt.key);
                setSortMenuOpen(false);
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
          data={sorted}
          keyExtractor={(item) => item.id}
          contentContainerStyle={sorted.length === 0 ? styles.emptyContainer : styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={Colors.costcoRed}
            />
          }
          renderItem={({ item }) => {
            const date = new Date(item.looked_up_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            });
            return (
              <Pressable
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
                onPress={() => router.push(`/product/${item.sku}`)}
              >
                <View style={styles.cardImageWrap}>
                  {item.image_url ? (
                    <Image
                      source={{ uri: item.image_url }}
                      style={styles.cardImage}
                      resizeMode="contain"
                    />
                  ) : (
                    <Text style={styles.cardImageFallback}>📦</Text>
                  )}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardName} numberOfLines={1}>
                    {item.name ?? item.sku}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {item.brand ? `${item.brand} · ` : ''}
                    {date}
                  </Text>
                </View>
                {item.sale_price != null && (
                  <Text style={styles.cardPrice}>${item.sale_price.toFixed(2)}</Text>
                )}
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={
            query.trim() ? (
              <View style={styles.emptyInner}>
                <FloatView>
                  <Text style={styles.emptyIcon}>🔍</Text>
                </FloatView>
                <Text style={styles.emptyTitle}>No results</Text>
                <Text style={styles.emptySubtitle}>Nothing found for "{query.trim()}".</Text>
              </View>
            ) : (
              <View style={styles.emptyInner}>
                <FloatView>
                  <Text style={styles.emptyIcon}>📦</Text>
                </FloatView>
                <Text style={styles.emptyTitle}>No barcode scans yet</Text>
                <Text style={styles.emptySubtitle}>
                  Scan a product barcode to see pricing and history here.
                </Text>
              </View>
            )
          }
        />
      )}
    </View>
  );
}

const makeStyles = (Colors: ColorScheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing['2xl'] },

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

    controlsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
      backgroundColor: Colors.surface,
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
    dropdownItemText: { fontSize: fontSize.sm, color: Colors.gray[700] },
    dropdownItemTextActive: { color: Colors.costcoRed, fontWeight: '700' },
    dropdownCheck: { fontSize: fontSize.sm, color: Colors.costcoRed, fontWeight: '700' },

    listContent: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, gap: 2 },
    emptyContainer: { flex: 1 },

    card: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      backgroundColor: Colors.surface,
      borderRadius: radius.xl,
      gap: spacing.md,
      ...shadow.sm,
      marginVertical: 3,
    },
    cardPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
    cardImageWrap: {
      width: 48,
      height: 48,
      borderRadius: radius.lg,
      backgroundColor: Colors.gray[100],
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardImage: { width: 40, height: 40 },
    cardImageFallback: { fontSize: 22 },
    cardBody: { flex: 1 },
    cardName: {
      fontSize: fontSize.md,
      fontWeight: '700',
      color: Colors.gray[900],
      marginBottom: 2,
    },
    cardMeta: { fontSize: fontSize.xs, color: Colors.gray[400] },
    cardPrice: { fontSize: fontSize.md, fontWeight: '700', color: Colors.executiveNavy },
    chevron: { fontSize: 18, color: Colors.gray[300] },
    separator: { height: 0 },

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
