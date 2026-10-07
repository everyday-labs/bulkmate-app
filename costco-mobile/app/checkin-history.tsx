import { useCallback, useMemo, useState } from 'react';
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
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ColorScheme } from '../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../constants/theme';
import { FloatView, Sparkle, Twinkle } from '../components/Motion';

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

const SORT_OPTIONS = [
  { key: 'date_desc', label: 'Newest first' },
  { key: 'date_asc', label: 'Oldest first' },
  { key: 'stars_desc', label: 'Most stars' },
] as const;
type SortKey = (typeof SORT_OPTIONS)[number]['key'];

function sortCheckIns(rows: CheckInRow[], sortBy: SortKey): CheckInRow[] {
  const list = [...rows];
  switch (sortBy) {
    case 'date_desc':
      return list.sort((a, b) => b.checked_in_at.localeCompare(a.checked_in_at));
    case 'date_asc':
      return list.sort((a, b) => a.checked_in_at.localeCompare(b.checked_in_at));
    case 'stars_desc':
      return list.sort((a, b) => b.stars_earned - a.stars_earned);
  }
}

export default function CheckinHistoryScreen() {
  const { session } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [rows, setRows] = useState<CheckInRow[]>([]);
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
        r.warehouse_name?.toLowerCase().includes(q) || r.warehouse_city?.toLowerCase().includes(q),
    );
  }, [rows, query]);

  const sorted = useMemo(() => sortCheckIns(filtered, sortBy), [filtered, sortBy]);

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
    setError(null);

    try {
      const userId = session?.user.id;
      if (!userId) return;

      const { data, error: err } = await supabase
        .from('check_ins')
        .select('id, checked_in_at, stars_earned, warehouses(name, city, tier)')
        .eq('user_id', userId)
        .order('checked_in_at', { ascending: false })
        .limit(100);

      if (err) throw err;

      const mapped: CheckInRow[] = (data ?? []).map((c: any) => ({
        id: c.id,
        checked_in_at: c.checked_in_at,
        stars_earned: c.stars_earned,
        warehouse_name: c.warehouses?.name ?? null,
        warehouse_city: c.warehouses?.city ?? null,
        warehouse_tier: c.warehouses?.tier ?? null,
      }));

      setRows(mapped);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load check-in history');
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
        <Text style={styles.title}>Check-In History</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Warehouse or city…"
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
            const date = new Date(item.checked_in_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            });
            const time = new Date(item.checked_in_at).toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
            });
            return (
              <View style={styles.card}>
                <View style={styles.cardIconWrap}>
                  <Text style={styles.cardIconText}>📍</Text>
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.cardWarehouse} numberOfLines={1}>
                      {item.warehouse_name ?? 'Costco Warehouse'}
                    </Text>
                    {item.warehouse_tier && (
                      <View
                        style={[
                          styles.tierChip,
                          { backgroundColor: tierColor(Colors, item.warehouse_tier) + '22' },
                        ]}
                      >
                        {item.warehouse_tier === 'Legendary' && (
                          <Sparkle size={7} color={tierColor(Colors, item.warehouse_tier)} />
                        )}
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
                    {date} · {time}
                  </Text>
                </View>
                <View style={styles.starsWrap}>
                  <Text style={styles.starsText}>+{item.stars_earned}</Text>
                  <Twinkle>
                    <Text style={styles.starsIcon}>⭐</Text>
                  </Twinkle>
                </View>
              </View>
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
                  <Text style={styles.emptyIcon}>📍</Text>
                </FloatView>
                <Text style={styles.emptyTitle}>No check-ins yet</Text>
                <Text style={styles.emptySubtitle}>
                  Check in at a Costco warehouse to start earning stars.
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
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.lg,
      backgroundColor: Colors.surface,
      borderRadius: radius.xl,
      gap: spacing.md,
      ...shadow.sm,
      marginVertical: 3,
    },
    cardIconWrap: {
      width: 44,
      height: 44,
      borderRadius: radius.lg,
      backgroundColor: Colors.goldStarSubtle,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardIconText: { fontSize: 20 },
    cardBody: { flex: 1 },
    cardTopRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 3 },
    cardWarehouse: {
      fontSize: fontSize.md,
      fontWeight: '700',
      color: Colors.gray[900],
      flexShrink: 1,
    },
    tierChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.sm,
      paddingVertical: 2,
    },
    tierChipText: { fontSize: 9, fontWeight: '800', letterSpacing: letterSpacing.caps },
    cardMeta: { fontSize: fontSize.sm, color: Colors.gray[400] },
    starsWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    starsText: { fontSize: fontSize.md, fontWeight: '800', color: Colors.goldStarDark },
    starsIcon: { fontSize: 14 },
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
