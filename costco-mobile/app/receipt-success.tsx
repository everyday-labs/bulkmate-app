import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Share,
  Alert,
  Modal,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/colors';
import {
  hasPromptedForPushPermission,
  markPushPermissionPrompted,
  requestAndSavePushToken,
} from '../lib/notifications';

type ReceiptItem = {
  id: string;
  sku: string;
  description: string;
  unit_price: number;
  discount_amount: number;
  quantity: number;
};

type ReceiptDetails = {
  id: string;
  transaction_date: string;
  transaction_number: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  image_path: string | null;
  warehouse_name: string | null;
  warehouse_address: string | null;
  warehouse_city: string | null;
  warehouse_state: string | null;
  items: ReceiptItem[];
};

export default function ReceiptSuccessScreen() {
  const { receiptId, duplicate } = useLocalSearchParams<{ receiptId: string; duplicate?: string }>();
  const isDuplicate = duplicate === 'true';
  const router = useRouter();
  const [receipt, setReceipt] = useState<ReceiptDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!receiptId) return;
    fetchReceipt(receiptId);
    return () => {
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
    };
  }, [receiptId]);

  async function fetchReceipt(id: string) {
    try {
      const [{ data: receiptRow, error: rErr }, { data: items, error: iErr }] =
        await Promise.all([
          supabase
            .from('receipts')
            .select('id, transaction_date, transaction_number, total_amount, tax_amount, image_path, warehouses(name, address, city, state)')
            .eq('id', id)
            .single(),
          supabase
            .from('receipt_items')
            .select('id, sku, description, unit_price, discount_amount, quantity')
            .eq('receipt_id', id)
            .order('id'),
        ]);

      if (rErr) throw rErr;
      if (iErr) throw iErr;

      const wh = (receiptRow.warehouses as any) ?? {};
      setReceipt({
        id: receiptRow.id,
        transaction_date: receiptRow.transaction_date,
        transaction_number: receiptRow.transaction_number ?? null,
        total_amount: receiptRow.total_amount,
        tax_amount: receiptRow.tax_amount ?? null,
        image_path: receiptRow.image_path ?? null,
        warehouse_name: wh.name ?? null,
        warehouse_address: wh.address ?? null,
        warehouse_city: wh.city ?? null,
        warehouse_state: wh.state ?? null,
        items: items ?? [],
      });

      // Show notification prompt if never asked before — 1.5s delay so the
      // success state is visible first
      const alreadyPrompted = await hasPromptedForPushPermission();
      if (!alreadyPrompted) {
        promptTimerRef.current = setTimeout(() => setShowNotifPrompt(true), 1500);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load receipt');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.costcoRed} />
        <Text style={styles.loadingText}>Loading receipt...</Text>
      </View>
    );
  }

  if (error || !receipt) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Receipt not found'}</Text>
        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <Text style={styles.doneButtonText}>Back to Scan</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const formattedDate = new Date(receipt.transaction_date + 'T00:00:00').toLocaleDateString(
    'en-US',
    { month: 'long', day: 'numeric', year: 'numeric' },
  );

  const itemTotal = receipt.items.reduce((sum, i) => sum + i.unit_price, 0);
  const totalSavings = receipt.items.reduce((sum, i) => sum + i.discount_amount, 0);
  // Always compute subtotal from items so it is self-consistent with the
  // item total and savings lines shown above it. receipt.total_amount (from the
  // SUBTOTAL line on the receipt) is used only as the grand-total base if it
  // exists and is more reliable than our item-level computation.
  const subtotal = itemTotal - totalSavings;
  const grandTotal = (receipt.total_amount ?? subtotal) + (receipt.tax_amount ?? 0);

  function handleDone() {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/scan');
    }
  }

  async function handleNotifAllow() {
    await markPushPermissionPrompted();
    setShowNotifPrompt(false);
    await requestAndSavePushToken();
  }

  async function handleNotifDismiss() {
    await markPushPermissionPrompted();
    setShowNotifPrompt(false);
  }

  function handleDelete() {
    Alert.alert(
      'Delete Receipt',
      'This will permanently remove this receipt and all its items. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (receipt!.image_path) {
                await supabase.storage.from('receipts').remove([receipt!.image_path]);
              }
              const { error } = await supabase.from('receipts').delete().eq('id', receipt!.id);
              if (error) throw error;
              handleDone();
            } catch (e: any) {
              Alert.alert('Error', e.message ?? 'Failed to delete receipt');
            }
          },
        },
      ],
    );
  }

  async function shareReceiptId() {
    const label = receipt!.transaction_number
      ? `TC# ${receipt!.transaction_number}`
      : `Receipt ID: ${receipt!.id}`;
    try {
      await Share.share({ message: label });
    } catch {
      // user cancelled share sheet — no-op
    }
  }

  const warehouseLocation = [receipt.warehouse_city, receipt.warehouse_state]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.container}>
      <FlatList
        data={receipt.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Success header */}
            <View style={styles.header}>
              <View style={styles.checkCircle}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
              <Text style={styles.title}>Receipt Scanned</Text>
              <Text style={styles.dateText}>{formattedDate}</Text>
            </View>

            {/* Duplicate banner */}
            {isDuplicate && (
              <View style={styles.duplicateBanner}>
                <Text style={styles.duplicateText}>
                  This receipt was already uploaded. Showing your existing record.
                </Text>
              </View>
            )}

            {/* Warehouse info */}
            <View style={styles.warehouseCard}>
              <Text style={styles.warehouseName}>
                {receipt.warehouse_name ?? 'Costco Warehouse'}
              </Text>
              {receipt.warehouse_address && (
                <Text style={styles.warehouseDetail}>{receipt.warehouse_address}</Text>
              )}
              {warehouseLocation ? (
                <Text style={styles.warehouseDetail}>{warehouseLocation}</Text>
              ) : null}
            </View>

            {/* Receipt / Transaction number */}
            <View style={styles.receiptNumberRow}>
              <View>
                <Text style={styles.receiptNumberLabel}>
                  {receipt.transaction_number ? 'Transaction #' : 'Receipt ID'}
                </Text>
                <Text style={styles.receiptNumberValue} numberOfLines={1}>
                  {receipt.transaction_number ?? receipt.id.slice(0, 8).toUpperCase()}
                </Text>
              </View>
              <TouchableOpacity style={styles.copyButton} onPress={shareReceiptId}>
                <Text style={styles.copyButtonText}>Copy</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>Items</Text>
          </>
        }
        renderItem={({ item }) => (
          <View style={styles.itemRow}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemDescription} numberOfLines={2}>
                {item.description}
              </Text>
              <Text style={styles.itemSku}>SKU {item.sku}</Text>
            </View>
            <View style={styles.itemPricing}>
              <Text style={styles.itemPrice}>${item.unit_price.toFixed(2)}</Text>
              {item.discount_amount > 0 && (
                <Text style={styles.itemDiscount}>-${item.discount_amount.toFixed(2)}</Text>
              )}
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListFooterComponent={
          <View style={styles.totalsBlock}>
            <TotalRow label="Item total" value={itemTotal} />
            {totalSavings > 0 && (
              <TotalRow label="Instant savings" value={-totalSavings} highlight="savings" />
            )}
            <TotalRow label="Subtotal" value={subtotal} />
            {receipt.tax_amount != null && (
              <TotalRow label="Tax" value={receipt.tax_amount} />
            )}
            <View style={styles.grandTotalDivider} />
            <TotalRow label="Total" value={grandTotal} bold />
          </View>
        }
      />

      <View style={styles.footer}>
        <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
          <Text style={styles.deleteButtonText}>Delete Receipt</Text>
        </TouchableOpacity>
      </View>

      <NotificationPrompt
        visible={showNotifPrompt}
        onAllow={handleNotifAllow}
        onDismiss={handleNotifDismiss}
      />
    </View>
  );
}

function NotificationPrompt({
  visible,
  onAllow,
  onDismiss,
}: {
  visible: boolean;
  onAllow: () => void;
  onDismiss: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <TouchableOpacity style={notifStyles.backdrop} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity activeOpacity={1} style={notifStyles.sheet}>
          <View style={notifStyles.handle} />
          <Text style={notifStyles.icon}>🔔</Text>
          <Text style={notifStyles.title}>Stay in the loop</Text>
          <Text style={notifStyles.body}>
            Get notified when a price drops on something you bought — we'll let you know if you may
            be owed a refund.
          </Text>
          <TouchableOpacity style={notifStyles.allowButton} onPress={onAllow}>
            <Text style={notifStyles.allowText}>Enable Notifications</Text>
          </TouchableOpacity>
          <TouchableOpacity style={notifStyles.dismissButton} onPress={onDismiss}>
            <Text style={notifStyles.dismissText}>Not Now</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const notifStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: 24,
    paddingBottom: 48,
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[300],
    marginBottom: 24,
  },
  icon: { fontSize: 44, marginBottom: 16 },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.gray[700],
    marginBottom: 10,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    color: Colors.gray[500],
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  allowButton: {
    width: '100%',
    backgroundColor: Colors.costcoRed,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  allowText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  dismissButton: {
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
  },
  dismissText: { color: Colors.gray[500], fontSize: 15 },
});

function TotalRow({
  label,
  value,
  bold,
  highlight,
}: {
  label: string;
  value: number;
  bold?: boolean;
  highlight?: 'savings';
}) {
  const valueColor = highlight === 'savings' ? '#22C55E' : Colors.gray[700];
  const formattedValue =
    value < 0 ? `-$${Math.abs(value).toFixed(2)}` : `$${value.toFixed(2)}`;
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, bold && styles.totalLabelBold]}>{label}</Text>
      <Text style={[styles.totalValue, bold && styles.totalValueBold, { color: valueColor }]}>
        {formattedValue}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: Colors.white,
  },
  loadingText: { marginTop: 12, fontSize: 15, color: Colors.gray[500] },
  errorText: { fontSize: 15, color: Colors.gray[700], textAlign: 'center', marginBottom: 24 },
  listContent: { paddingBottom: 16 },

  // Header
  header: {
    alignItems: 'center',
    paddingTop: 64,
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  checkCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  checkMark: { color: Colors.white, fontSize: 28, fontWeight: '700', lineHeight: 32 },
  title: { fontSize: 22, fontWeight: '700', color: Colors.gray[700], marginBottom: 4 },
  dateText: { fontSize: 14, color: Colors.gray[500] },

  // Warehouse
  warehouseCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    padding: 14,
    backgroundColor: Colors.gray[100],
    borderRadius: 10,
  },
  warehouseName: { fontSize: 15, fontWeight: '700', color: Colors.executiveNavy, marginBottom: 2 },
  warehouseDetail: { fontSize: 13, color: Colors.gray[500], marginTop: 2 },

  // Receipt number
  receiptNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 20,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: 10,
  },
  receiptNumberLabel: { fontSize: 11, color: Colors.gray[500], marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  receiptNumberValue: { fontSize: 14, fontWeight: '600', color: Colors.gray[700], fontVariant: ['tabular-nums'] },
  copyButton: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: Colors.executiveNavy,
    borderRadius: 6,
  },
  copyButtonText: { color: Colors.white, fontSize: 13, fontWeight: '600' },

  // Items
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  itemInfo: { flex: 1, paddingRight: 12 },
  itemDescription: { fontSize: 15, color: Colors.gray[700], fontWeight: '500' },
  itemSku: { fontSize: 12, color: Colors.gray[500], marginTop: 2 },
  itemPricing: { alignItems: 'flex-end' },
  itemPrice: { fontSize: 15, fontWeight: '600', color: Colors.gray[700] },
  itemDiscount: { fontSize: 13, color: '#22C55E', marginTop: 2 },
  separator: { height: 1, backgroundColor: Colors.gray[100], marginLeft: 20 },

  // Totals
  totalsBlock: {
    marginTop: 8,
    marginHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[300],
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  totalLabel: { fontSize: 14, color: Colors.gray[500] },
  totalLabelBold: { fontSize: 16, fontWeight: '700', color: Colors.gray[700] },
  totalValue: { fontSize: 14, color: Colors.gray[700] },
  totalValueBold: { fontSize: 16, fontWeight: '700' },
  grandTotalDivider: {
    height: 1,
    backgroundColor: Colors.gray[300],
    marginVertical: 8,
  },

  // Footer
  footer: {
    padding: 20,
    paddingBottom: 40,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
    gap: 10,
  },
  doneButton: {
    backgroundColor: Colors.costcoRed,
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
  },
  doneButtonText: { color: Colors.white, fontSize: 16, fontWeight: '700' },
  deleteButton: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  deleteButtonText: { color: Colors.gray[500], fontSize: 15 },

  // Duplicate banner
  duplicateBanner: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  duplicateText: { fontSize: 13, color: '#92400E', lineHeight: 18 },
});
