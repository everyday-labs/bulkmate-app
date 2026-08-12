import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ColorScheme } from '../constants/colors';
import { spacing, fontSize, radius, letterSpacing } from '../constants/theme';

export type PickableWarehouse = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
};

const PAGE_SIZE = 40;

export function WarehousePickerModal({
  visible,
  onClose,
  onSelect,
  onSkip,
  saving,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (warehouse: PickableWarehouse) => void;
  /** Escape hatch — the warehouse genuinely isn't in the list. */
  onSkip: () => void;
  saving?: boolean;
}) {
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickableWarehouse[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Guards against an earlier, slower query overwriting a later one's results.
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!visible) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      const term = query.trim();
      let request = supabase
        .from('warehouses')
        .select('id, name, address, city, state')
        .order('name')
        .limit(PAGE_SIZE);

      if (term) {
        const escaped = term.replace(/[%_,]/g, ' ');
        request = request.or(
          `name.ilike.%${escaped}%,city.ilike.%${escaped}%,address.ilike.%${escaped}%,postal_code.ilike.%${escaped}%`,
        );
      }

      const { data, error } = await request;
      if (seq !== requestSeq.current) return;
      setLoadError(error ? 'Could not load warehouses. Check your connection.' : null);
      setResults((data as PickableWarehouse[]) ?? []);
      setLoading(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, visible]);

  useEffect(() => {
    if (!visible) setQuery('');
  }, [visible]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.grabber} />

          <Text style={styles.title}>Which warehouse was this?</Text>
          <Text style={styles.subtitle}>
            We couldn&apos;t find the correct warehouse from your receipt. Pick it below and
            we&apos;ll credit your visit.
          </Text>

          <TextInput
            style={styles.search}
            placeholder="Search by name, city, or ZIP"
            placeholderTextColor={Colors.gray[400]}
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={Colors.costcoRed} />
            </View>
          ) : (
            <FlatList
              data={results}
              keyExtractor={(w) => w.id}
              keyboardShouldPersistTaps="handled"
              style={styles.list}
              ListEmptyComponent={
                <View style={styles.emptyWrap}>
                  <Text style={styles.empty}>
                    {loadError ?? `No warehouses match “${query.trim()}”.`}
                  </Text>
                  {!loadError && (
                    <Text style={styles.emptyHint}>
                      Not every warehouse is in our list yet — you can still keep this receipt
                      without one.
                    </Text>
                  )}
                </View>
              }
              renderItem={({ item }) => {
                const location = [item.city, item.state].filter(Boolean).join(', ');
                return (
                  <Pressable
                    disabled={saving}
                    onPress={() => onSelect(item)}
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName}>{item.name}</Text>
                      {item.address ? (
                        <Text style={styles.rowDetail} numberOfLines={1}>
                          {item.address}
                        </Text>
                      ) : null}
                      {location ? <Text style={styles.rowDetail}>{location}</Text> : null}
                    </View>
                  </Pressable>
                );
              }}
            />
          )}

          {saving ? (
            <View style={styles.cancel}>
              <ActivityIndicator color={Colors.costcoRed} />
            </View>
          ) : (
            <View style={styles.footer}>
              <Pressable
                onPress={onSkip}
                style={({ pressed }) => [styles.footerAction, pressed && styles.rowPressed]}
              >
                <Text style={styles.skipText}>Can&apos;t find my warehouse</Text>
              </Pressable>
              <Pressable
                onPress={onClose}
                style={({ pressed }) => [styles.footerAction, pressed && styles.rowPressed]}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (Colors: ColorScheme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: Colors.surface,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      maxHeight: '85%',
    },
    grabber: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: Colors.border,
      marginBottom: spacing.md,
    },
    title: {
      fontSize: fontSize.lg,
      fontWeight: '700',
      color: Colors.executiveNavy,
    },
    subtitle: {
      fontSize: fontSize.sm,
      color: Colors.gray[400],
      marginTop: spacing.xs,
      lineHeight: 20,
    },
    search: {
      marginTop: spacing.md,
      backgroundColor: Colors.surfaceSunken,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      fontSize: fontSize.md,
      color: Colors.executiveNavy,
    },
    list: {
      marginTop: spacing.sm,
    },
    centered: {
      paddingVertical: spacing.xl,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.md,
      borderBottomWidth: 1,
      borderBottomColor: Colors.border,
    },
    rowPressed: {
      opacity: 0.6,
    },
    rowName: {
      fontSize: fontSize.md,
      fontWeight: '600',
      color: Colors.executiveNavy,
    },
    rowDetail: {
      fontSize: fontSize.sm,
      color: Colors.gray[400],
      marginTop: 2,
    },
    emptyWrap: {
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    empty: {
      textAlign: 'center',
      color: Colors.executiveNavy,
      fontSize: fontSize.md,
      fontWeight: '600',
    },
    emptyHint: {
      textAlign: 'center',
      color: Colors.gray[400],
      fontSize: fontSize.sm,
      lineHeight: 20,
    },
    footer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: 1,
      borderTopColor: Colors.border,
      marginTop: spacing.xs,
    },
    footerAction: {
      paddingVertical: spacing.md,
    },
    skipText: {
      fontSize: fontSize.md,
      fontWeight: '600',
      color: Colors.gray[400],
    },
    cancel: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      marginTop: spacing.xs,
    },
    cancelText: {
      fontSize: fontSize.md,
      fontWeight: '600',
      color: Colors.costcoRed,
      letterSpacing: letterSpacing.wide,
    },
  });
