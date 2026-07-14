import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Share,
  Alert,
  Modal,
  Image,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../constants/theme';
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
};

type ReceiptDetails = {
  id: string;
  transaction_date: string;
  transaction_number: string | null;
  total_amount: number | null;
  tax_amount: number | null;
  image_path: string | null;
  imageUrl: string | null;
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
  const insets = useSafeAreaInsets();
  const [receipt, setReceipt] = useState<ReceiptDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
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
            .select('id, sku, description, unit_price, discount_amount')
            .eq('receipt_id', id)
            .order('id'),
        ]);

      if (rErr) throw rErr;
      if (iErr) throw iErr;

      // Fetch a 1-hour signed URL so the image can be displayed without exposing
      // the storage path directly. Falls back to null gracefully.
      let imageUrl: string | null = null;
      if (receiptRow.image_path) {
        const { data: urlData } = await supabase.storage
          .from('receipts')
          .createSignedUrl(receiptRow.image_path, 3600);
        imageUrl = urlData?.signedUrl ?? null;
      }

      const wh = (receiptRow.warehouses as any) ?? {};
      setReceipt({
        id: receiptRow.id,
        transaction_date: receiptRow.transaction_date,
        transaction_number: receiptRow.transaction_number ?? null,
        total_amount: receiptRow.total_amount,
        tax_amount: receiptRow.tax_amount ?? null,
        image_path: receiptRow.image_path ?? null,
        imageUrl,
        warehouse_name: wh.name ?? null,
        warehouse_address: wh.address ?? null,
        warehouse_city: wh.city ?? null,
        warehouse_state: wh.state ?? null,
        items: items ?? [],
      });

      const alreadyPrompted = await hasPromptedForPushPermission();
      if (!alreadyPrompted) {
        promptTimerRef.current = setTimeout(() => setShowNotifPrompt(true), 1500);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load receipt');
    } finally {
      setLoading(false);
    }
  }

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
      'This will permanently delete this receipt, all its items, and the scanned image. This action is irreversible — the data cannot be recovered.',
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
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete receipt');
            }
          },
        },
      ],
    );
  }

  async function shareReceiptId() {
    if (!receipt!.transaction_number) return;
    try {
      await Share.share({ message: `TC# ${receipt!.transaction_number}` });
    } catch {
      // user cancelled share sheet — no-op
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.costcoRed} />
        <Text style={styles.loadingText}>Loading receipt…</Text>
      </View>
    );
  }

  if (error || !receipt) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error ?? 'Receipt not found'}</Text>
        <Pressable
          style={({ pressed }) => [styles.doneButton, pressed && styles.doneButtonPressed]}
          onPress={handleDone}
        >
          <Text style={styles.doneButtonText}>Back to Scan</Text>
        </Pressable>
      </View>
    );
  }

  const formattedDate = new Date(receipt.transaction_date + 'T00:00:00').toLocaleDateString(
    'en-US',
    { month: 'long', day: 'numeric', year: 'numeric' },
  );

  const itemTotal = receipt.items.reduce((sum, i) => sum + i.unit_price, 0);
  const totalSavings = receipt.items.reduce((sum, i) => sum + i.discount_amount, 0);
  const subtotal = itemTotal - totalSavings;
  const grandTotal = (receipt.total_amount ?? subtotal) + (receipt.tax_amount ?? 0);

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
            <View style={[styles.header, { paddingTop: insets.top + spacing.xl }]}>
              <View style={styles.checkCircle}>
                <Text style={styles.checkMark}>✓</Text>
              </View>
              <Text style={styles.title}>Receipt Scanned</Text>
              <Text style={styles.dateText}>{formattedDate}</Text>
            </View>

            {/* Duplicate banner */}
            {isDuplicate && (
              <View style={styles.duplicateBanner}>
                <Text style={styles.duplicateIcon}>⚠</Text>
                <Text style={styles.duplicateText}>
                  This receipt was already uploaded. Showing your existing record.
                </Text>
              </View>
            )}

            {/* Warehouse card */}
            <View style={styles.warehouseCard}>
              <View style={styles.warehouseIconWrap}>
                <Text style={styles.warehouseIcon}>🏪</Text>
              </View>
              <View style={{ flex: 1 }}>
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
            </View>

            {/* Transaction number */}
            {receipt.transaction_number ? (
              <View style={styles.tcRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tcLabel}>TRANSACTION #</Text>
                  <Text style={styles.tcValue} numberOfLines={1}>
                    {receipt.transaction_number}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [styles.copyBtn, pressed && styles.copyBtnPressed]}
                  onPress={shareReceiptId}
                >
                  <Text style={styles.copyBtnText}>Share</Text>
                </Pressable>
              </View>
            ) : (
              <View style={[styles.tcRow, styles.tcRowMuted]}>
                <Text style={styles.tcNotFound}>TC# not found on receipt</Text>
              </View>
            )}

            {/* Receipt image thumbnail */}
            {receipt.imageUrl && (
              <Pressable
                style={({ pressed }) => [styles.imageThumbnailWrapper, pressed && { opacity: 0.9 }]}
                onPress={() => setShowImageModal(true)}
              >
                <Image
                  source={{ uri: receipt.imageUrl }}
                  style={styles.imageThumbnail}
                  resizeMode="cover"
                />
                <View style={styles.imageExpandHint}>
                  <Text style={styles.imageExpandText}>Tap to view full receipt</Text>
                </View>
              </Pressable>
            )}

            {/* Items section label */}
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
                <Text style={styles.itemDiscount}>−${item.discount_amount.toFixed(2)}</Text>
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

      {/* Footer */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Pressable
          style={({ pressed }) => [styles.doneButton, pressed && styles.doneButtonPressed]}
          onPress={handleDone}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.deleteButton, pressed && { opacity: 0.7 }]}
          onPress={handleDelete}
        >
          <Text style={styles.deleteButtonText}>Delete Receipt</Text>
        </Pressable>
      </View>

      <NotificationPrompt
        visible={showNotifPrompt}
        onAllow={handleNotifAllow}
        onDismiss={handleNotifDismiss}
      />

      {/* Full-screen receipt image viewer */}
      {receipt.imageUrl && (
        <Modal
          visible={showImageModal}
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => setShowImageModal(false)}
        >
          <View style={imageViewerStyles.container}>
            <Pressable
              style={({ pressed }) => [
                imageViewerStyles.closeButton,
                { top: insets.top + spacing.sm },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => setShowImageModal(false)}
            >
              <Text style={imageViewerStyles.closeText}>✕  Close</Text>
            </Pressable>
            <Image
              source={{ uri: receipt.imageUrl }}
              style={imageViewerStyles.image}
              resizeMode="contain"
            />
          </View>
        </Modal>
      )}
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
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <Pressable style={notifStyles.backdrop} onPress={onDismiss}>
        <Pressable style={[notifStyles.sheet, { paddingBottom: insets.bottom + spacing['2xl'] }]}>
          <View style={notifStyles.handle} />
          <Text style={notifStyles.icon}>🔔</Text>
          <Text style={notifStyles.title}>Stay in the loop</Text>
          <Text style={notifStyles.body}>
            Get notified when a price drops on something you bought — we'll let you know if you may
            be owed a refund.
          </Text>
          <Pressable
            style={({ pressed }) => [notifStyles.allowButton, pressed && notifStyles.allowButtonPressed]}
            onPress={onAllow}
          >
            <Text style={notifStyles.allowText}>Enable Notifications</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [notifStyles.dismissButton, pressed && { opacity: 0.6 }]}
            onPress={onDismiss}
          >
            <Text style={notifStyles.dismissText}>Not Now</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

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
  const valueColor = highlight === 'savings' ? Colors.savings : bold ? Colors.executiveNavy : Colors.gray[600];
  const formattedValue =
    value < 0 ? `−$${Math.abs(value).toFixed(2)}` : `$${value.toFixed(2)}`;
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
  container: { flex: 1, backgroundColor: Colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing['2xl'],
    backgroundColor: Colors.background,
  },
  loadingText: { marginTop: spacing.md, fontSize: fontSize.md, color: Colors.gray[400] },
  errorText: { fontSize: fontSize.md, color: Colors.gray[700], textAlign: 'center', marginBottom: spacing.xl },
  listContent: { paddingBottom: spacing.lg },

  // Header
  header: {
    alignItems: 'center',
    paddingBottom: spacing['2xl'],
    paddingHorizontal: spacing['2xl'],
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    marginBottom: spacing.lg,
  },
  checkCircle: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
    ...shadow.md,
  },
  checkMark: { color: Colors.white, fontSize: 28, fontWeight: '800' },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: Colors.gray[900],
    letterSpacing: letterSpacing.tight,
    marginBottom: spacing.xs,
  },
  dateText: { fontSize: fontSize.sm, color: Colors.gray[400], letterSpacing: letterSpacing.wide },

  // Duplicate banner
  duplicateBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: Colors.warningBg,
    borderRadius: radius.lg,
    borderLeftWidth: 3,
    borderLeftColor: Colors.warning,
  },
  duplicateIcon: { fontSize: 14, marginTop: 1 },
  duplicateText: { flex: 1, fontSize: fontSize.sm, color: Colors.warningText, lineHeight: 20 },

  // Warehouse card
  warehouseCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    ...shadow.sm,
  },
  warehouseIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.lg,
    backgroundColor: Colors.infoBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warehouseIcon: { fontSize: 20 },
  warehouseName: {
    fontSize: fontSize.md,
    fontWeight: '700',
    color: Colors.executiveNavy,
    marginBottom: 2,
  },
  warehouseDetail: { fontSize: fontSize.sm, color: Colors.gray[400], marginTop: 2 },

  // Transaction number
  tcRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  tcRowMuted: { justifyContent: 'center' },
  tcLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.gray[400],
    letterSpacing: letterSpacing.caps,
    marginBottom: 3,
  },
  tcValue: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: Colors.gray[800],
    fontVariant: ['tabular-nums'],
  },
  tcNotFound: { fontSize: fontSize.sm, color: Colors.gray[400], fontStyle: 'italic' },
  copyBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: Colors.executiveNavy,
    borderRadius: radius.md,
  },
  copyBtnPressed: { backgroundColor: Colors.executiveNavyDark },
  copyBtnText: { color: Colors.white, fontSize: fontSize.sm, fontWeight: '700' },

  // Receipt image thumbnail
  imageThumbnailWrapper: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    ...shadow.sm,
  },
  imageThumbnail: { width: '100%', height: 160 },
  imageExpandHint: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
  },
  imageExpandText: { color: Colors.white, fontSize: fontSize.xs, fontWeight: '600', letterSpacing: letterSpacing.wide },

  // Items section
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.gray[400],
    textTransform: 'uppercase',
    letterSpacing: letterSpacing.caps,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: Colors.surface,
  },
  itemInfo: { flex: 1, paddingRight: spacing.md },
  itemDescription: { fontSize: fontSize.md, color: Colors.gray[800], fontWeight: '500' },
  itemSku: { fontSize: fontSize.xs, color: Colors.gray[400], marginTop: 3, letterSpacing: letterSpacing.wide },
  itemPricing: { alignItems: 'flex-end' },
  itemPrice: { fontSize: fontSize.md, fontWeight: '700', color: Colors.gray[800] },
  itemDiscount: { fontSize: fontSize.sm, color: Colors.savings, marginTop: 2, fontWeight: '600' },
  separator: { height: 1, backgroundColor: Colors.border, marginLeft: spacing.lg },

  // Totals
  totalsBlock: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    ...shadow.sm,
    marginBottom: spacing.xl,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs + 1,
  },
  totalLabel: { fontSize: fontSize.sm, color: Colors.gray[500] },
  totalLabelBold: { fontSize: fontSize.md, fontWeight: '700', color: Colors.gray[900] },
  totalValue: { fontSize: fontSize.sm },
  totalValueBold: { fontSize: fontSize.lg, fontWeight: '800', letterSpacing: letterSpacing.tight },
  grandTotalDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: spacing.sm,
  },

  // Footer
  footer: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: spacing.xs,
    backgroundColor: Colors.surface,
  },
  doneButton: {
    backgroundColor: Colors.costcoRed,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    ...shadow.sm,
  },
  doneButtonPressed: { backgroundColor: Colors.costcoRedDark, opacity: 0.95 },
  doneButtonText: {
    color: Colors.white,
    fontSize: fontSize.lg,
    fontWeight: '700',
    letterSpacing: letterSpacing.wide,
  },
  deleteButton: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  deleteButtonText: { color: Colors.gray[400], fontSize: fontSize.sm, fontWeight: '500' },
});

const notifStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: radius['3xl'],
    borderTopRightRadius: radius['3xl'],
    paddingTop: spacing.md,
    paddingHorizontal: spacing['2xl'],
    alignItems: 'center',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[300],
    marginBottom: spacing['2xl'],
  },
  icon: { fontSize: 44, marginBottom: spacing.lg },
  title: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: Colors.gray[900],
    marginBottom: spacing.sm,
    textAlign: 'center',
    letterSpacing: letterSpacing.tight,
  },
  body: {
    fontSize: fontSize.md,
    color: Colors.gray[500],
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing['2xl'],
  },
  allowButton: {
    width: '100%',
    backgroundColor: Colors.costcoRed,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
    ...shadow.sm,
  },
  allowButtonPressed: { backgroundColor: Colors.costcoRedDark },
  allowText: { color: Colors.white, fontSize: fontSize.md, fontWeight: '700', letterSpacing: letterSpacing.wide },
  dismissButton: {
    width: '100%',
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  dismissText: { color: Colors.gray[400], fontSize: fontSize.sm, fontWeight: '500' },
});

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const imageViewerStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    position: 'absolute',
    right: spacing.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.pill,
    zIndex: 10,
  },
  closeText: { color: Colors.white, fontSize: fontSize.md, fontWeight: '600' },
  image: {
    width: SCREEN_W,
    height: SCREEN_H,
  },
});
