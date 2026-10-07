import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Share,
  Alert,
  Modal,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { posthog } from '../lib/posthog';
import { useThemeColors } from '../contexts/ThemeContext';
import type { ColorScheme } from '../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../constants/theme';
import {
  hasPromptedForPushPermission,
  markPushPermissionPrompted,
  requestAndSavePushToken,
} from '../lib/notifications';
import { BellRing } from '../components/Motion';
import { WarehousePickerModal, type PickableWarehouse } from '../components/WarehousePickerModal';

type ReceiptItem = {
  id: string;
  sku: string;
  description: string;
  unit_price: number;
  quantity: number;
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
  warehouse_id: string | null;
  warehouse_name: string | null;
  warehouse_address: string | null;
  warehouse_city: string | null;
  warehouse_state: string | null;
};

export default function ReceiptSuccessScreen() {
  const { receiptId, duplicate } = useLocalSearchParams<{
    receiptId: string;
    duplicate?: string;
  }>();
  const isDuplicate = duplicate === 'true';
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [receipt, setReceipt] = useState<ReceiptDetails | null>(null);
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [showWarehousePicker, setShowWarehousePicker] = useState(false);
  const [linkingWarehouse, setLinkingWarehouse] = useState(false);
  const [warehouseSkipped, setWarehouseSkipped] = useState(false);
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
      const [{ data: receiptRow, error: rErr }, { data: items, error: iErr }] = await Promise.all([
        supabase
          .from('receipts')
          .select(
            'id, transaction_date, transaction_number, total_amount, tax_amount, image_path, warehouse_id, warehouses(name, address, city, state)',
          )
          .eq('id', id)
          .single(),
        supabase
          .from('receipt_items')
          .select('id, sku, description, unit_price, quantity, discount_amount')
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
        warehouse_id: receiptRow.warehouse_id ?? null,
        warehouse_name: wh.name ?? null,
        warehouse_address: wh.address ?? null,
        warehouse_city: wh.city ?? null,
        warehouse_state: wh.state ?? null,
      });
      setItems(items ?? []);

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
              posthog?.capture('receipt_deleted');
              handleDone();
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete receipt');
            }
          },
        },
      ],
    );
  }

  async function handleSaveItem(
    itemId: string,
    patch: { quantity: number; unit_price: number; discount_amount: number },
  ) {
    setSavingItemId(itemId);
    try {
      const { error } = await supabase.from('receipt_items').update(patch).eq('id', itemId);
      if (error) throw error;
      setItems((prev) => prev.map((i) => (i.id === itemId ? { ...i, ...patch } : i)));
      setEditingItemId(null);
      posthog?.capture('receipt_item_edited');
    } catch (e: unknown) {
      Alert.alert("Couldn't save", e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSavingItemId(null);
    }
  }

  async function handlePickWarehouse(warehouse: PickableWarehouse) {
    setLinkingWarehouse(true);
    try {
      // Goes through the check-in function rather than updating `receipts`
      // directly, so a manually-picked warehouse earns the same star/badge
      // reward that an auto-matched one does.
      const { data, error } = await supabase.functions.invoke('check-in', {
        body: { receipt_id: receipt!.id, warehouse_id: warehouse.id },
      });
      if (error) throw error;

      setReceipt((prev) =>
        prev
          ? {
              ...prev,
              warehouse_id: warehouse.id,
              warehouse_name: warehouse.name,
              warehouse_address: warehouse.address,
              warehouse_city: warehouse.city,
              warehouse_state: warehouse.state,
            }
          : prev,
      );
      setShowWarehousePicker(false);
      posthog?.capture('receipt_warehouse_picked', { warehouse_id: warehouse.id });

      if (data && !data.already_checked_in) {
        Alert.alert('Visit credited', `You earned a star for your visit to ${warehouse.name}.`);
      }
    } catch (e: unknown) {
      Alert.alert("Couldn't save warehouse", e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setLinkingWarehouse(false);
    }
  }

  function handleSkipWarehouse() {
    // The receipt is already saved with a null warehouse_id — nothing to
    // undo, this just stops the card from reading as a required action. The
    // card stays tappable so the warehouse can still be added later.
    setShowWarehousePicker(false);
    setWarehouseSkipped(true);
    posthog?.capture('receipt_warehouse_skipped');
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

  // unit_price is a true PER-UNIT price, so a line's contribution is
  // unit_price × quantity. Receipts parsed from OCR always come in at
  // quantity 1 (Costco prints each unit on its own line), so this matches
  // the printed total there; it only diverges once a user manually sets a
  // quantity, which is exactly the intent — see EditableItemRow.
  const itemTotal = items.reduce((sum, i) => sum + i.unit_price * i.quantity, 0);
  const totalSavings = items.reduce((sum, i) => sum + i.discount_amount, 0);
  const subtotal = itemTotal - totalSavings;
  const grandTotal = (receipt.total_amount ?? subtotal) + (receipt.tax_amount ?? 0);

  const warehouseLocation = [receipt.warehouse_city, receipt.warehouse_state]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.container}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        extraData={[editingItemId, savingItemId]}
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

            {/* Warehouse card — or a picker prompt when the receipt header
                couldn't be matched to a seeded warehouse. */}
            {receipt.warehouse_id ? (
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
            ) : (
              <Pressable
                onPress={() => setShowWarehousePicker(true)}
                style={({ pressed }) => [
                  styles.warehouseCard,
                  !warehouseSkipped && styles.warehouseUnknownCard,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={styles.warehouseIconWrap}>
                  <Text style={styles.warehouseIcon}>{warehouseSkipped ? '🏪' : '📍'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.warehouseName}>
                    {warehouseSkipped
                      ? 'Saved without a warehouse'
                      : 'Bulkmate was unable to find the correct warehouse from your receipt'}
                  </Text>
                  <Text
                    style={
                      warehouseSkipped ? styles.warehouseDetail : styles.warehouseUnknownAction
                    }
                  >
                    {warehouseSkipped
                      ? 'Your receipt and items are safe. Tap to add a warehouse anytime.'
                      : 'Tap to choose your warehouse'}
                  </Text>
                </View>
              </Pressable>
            )}

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
            <Text style={styles.sectionHint}>Tap any row to fix what OCR misread</Text>
          </>
        }
        renderItem={({ item }) => (
          <EditableItemRow
            item={item}
            editing={editingItemId === item.id}
            saving={savingItemId === item.id}
            onEdit={() => setEditingItemId(item.id)}
            onCancel={() => setEditingItemId(null)}
            onSave={(patch) => handleSaveItem(item.id, patch)}
            styles={styles}
            Colors={Colors}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListFooterComponent={
          <View style={styles.totalsBlock}>
            <TotalRow label="Item total" value={itemTotal} styles={styles} Colors={Colors} />
            {totalSavings > 0 && (
              <TotalRow
                label="Instant savings"
                value={-totalSavings}
                highlight="savings"
                styles={styles}
                Colors={Colors}
              />
            )}
            <TotalRow label="Subtotal" value={subtotal} styles={styles} Colors={Colors} />
            {receipt.tax_amount != null && (
              <TotalRow label="Tax" value={receipt.tax_amount} styles={styles} Colors={Colors} />
            )}
            <View style={styles.grandTotalDivider} />
            <TotalRow label="Total" value={grandTotal} bold styles={styles} Colors={Colors} />
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

      <WarehousePickerModal
        visible={showWarehousePicker}
        saving={linkingWarehouse}
        onClose={() => setShowWarehousePicker(false)}
        onSelect={handlePickWarehouse}
        onSkip={handleSkipWarehouse}
      />

      <NotificationPrompt
        visible={showNotifPrompt}
        onAllow={handleNotifAllow}
        onDismiss={handleNotifDismiss}
        Colors={Colors}
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
              <Text style={imageViewerStyles.closeText}>✕ Close</Text>
            </Pressable>
            <Image
              source={{ uri: receipt.imageUrl }}
              style={{ width: windowWidth, height: windowHeight }}
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
  Colors,
}: {
  visible: boolean;
  onAllow: () => void;
  onDismiss: () => void;
  Colors: ColorScheme;
}) {
  const insets = useSafeAreaInsets();
  const notifStyles = useMemo(() => makeNotifStyles(Colors), [Colors]);
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
          <BellRing>
            <Text style={notifStyles.icon}>🔔</Text>
          </BellRing>
          <Text style={notifStyles.title}>Stay in the loop</Text>
          <Text style={notifStyles.body}>
            Get notified when a price drops on something you bought — we'll let you know if you may
            be owed a refund.
          </Text>
          <Pressable
            style={({ pressed }) => [
              notifStyles.allowButton,
              pressed && notifStyles.allowButtonPressed,
            ]}
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

type Styles = ReturnType<typeof makeStyles>;

function EditableItemRow({
  item,
  editing,
  saving,
  onEdit,
  onCancel,
  onSave,
  styles,
  Colors,
}: {
  item: ReceiptItem;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (patch: { quantity: number; unit_price: number; discount_amount: number }) => void;
  styles: Styles;
  Colors: ColorScheme;
}) {
  const [qty, setQty] = useState(String(item.quantity));
  const [price, setPrice] = useState(String(item.unit_price));
  const [discount, setDiscount] = useState(String(item.discount_amount));

  // Reset the draft fields from the latest saved values each time editing opens.
  useEffect(() => {
    if (editing) {
      setQty(String(item.quantity));
      setPrice(String(item.unit_price));
      setDiscount(String(item.discount_amount));
    }
  }, [editing, item.quantity, item.unit_price, item.discount_amount]);

  if (!editing) {
    return (
      <Pressable
        style={({ pressed }) => [styles.itemRow, pressed && styles.itemRowPressed]}
        onPress={onEdit}
      >
        <View style={styles.itemInfo}>
          <Text style={styles.itemDescription} numberOfLines={2}>
            {item.description}
          </Text>
          <Text style={styles.itemSku}>
            SKU {item.sku}
            {item.quantity > 1 ? `  ·  ×${item.quantity}` : ''}
          </Text>
        </View>
        <View style={styles.itemPricing}>
          {/* Show the line total (unit × qty) as the headline number, with the
              per-unit breakdown underneath — otherwise bumping quantity to 2
              leaves the price looking unchanged, which reads as a bug. */}
          <Text style={styles.itemPrice}>${(item.unit_price * item.quantity).toFixed(2)}</Text>
          {item.quantity > 1 && (
            <Text style={styles.itemUnitPrice}>${item.unit_price.toFixed(2)} each</Text>
          )}
          {item.discount_amount > 0 && (
            <Text style={styles.itemDiscount}>−${item.discount_amount.toFixed(2)}</Text>
          )}
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.editRow}>
      <Text style={styles.editDescription} numberOfLines={2}>
        {item.description}
      </Text>
      <View style={styles.editFieldsRow}>
        <View style={styles.editField}>
          <Text style={styles.editFieldLabel}>QTY</Text>
          <TextInput
            style={styles.editInput}
            value={qty}
            onChangeText={setQty}
            keyboardType="number-pad"
            selectTextOnFocus
          />
        </View>
        <View style={styles.editField}>
          <Text style={styles.editFieldLabel}>PRICE EACH</Text>
          <TextInput
            style={styles.editInput}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
        </View>
        <View style={styles.editField}>
          <Text style={styles.editFieldLabel}>DISCOUNT</Text>
          <TextInput
            style={styles.editInput}
            value={discount}
            onChangeText={setDiscount}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
        </View>
      </View>
      {/* Live line total — recalculates as QTY/PRICE/DISCOUNT are typed, so
          bumping quantity visibly changes something. Without this the price
          field stays put (it's per-unit) and the edit looks like a no-op. */}
      <Text style={styles.editLineTotal}>
        Line total:{'  '}
        <Text style={styles.editLineTotalValue}>
          $
          {Math.max(
            0,
            Math.max(1, parseInt(qty, 10) || 1) * (parseFloat(price) || 0) -
              (parseFloat(discount) || 0),
          ).toFixed(2)}
        </Text>
        {(parseInt(qty, 10) || 1) > 1
          ? `   (${Math.max(1, parseInt(qty, 10) || 1)} × $${(parseFloat(price) || 0).toFixed(2)})`
          : ''}
      </Text>

      <View style={styles.editActionsRow}>
        <Pressable
          style={({ pressed }) => [
            styles.editDoneBtn,
            pressed && { opacity: 0.85 },
            saving && { opacity: 0.6 },
          ]}
          disabled={saving}
          onPress={() =>
            onSave({
              quantity: Math.max(1, parseInt(qty, 10) || 1),
              unit_price: Math.max(0, parseFloat(price) || 0),
              discount_amount: Math.max(0, parseFloat(discount) || 0),
            })
          }
        >
          {saving ? (
            <ActivityIndicator size="small" color={Colors.white} />
          ) : (
            <Text style={styles.editDoneText}>✓ Done</Text>
          )}
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.editCancelBtn, pressed && { opacity: 0.7 }]}
          disabled={saving}
          onPress={onCancel}
        >
          <Text style={styles.editCancelText}>✕ Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

function TotalRow({
  label,
  value,
  bold,
  highlight,
  styles,
  Colors,
}: {
  label: string;
  value: number;
  bold?: boolean;
  highlight?: 'savings';
  styles: Styles;
  Colors: ColorScheme;
}) {
  const valueColor =
    highlight === 'savings' ? Colors.savings : bold ? Colors.executiveNavy : Colors.gray[600];
  const formattedValue = value < 0 ? `−$${Math.abs(value).toFixed(2)}` : `$${value.toFixed(2)}`;
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, bold && styles.totalLabelBold]}>{label}</Text>
      <Text style={[styles.totalValue, bold && styles.totalValueBold, { color: valueColor }]}>
        {formattedValue}
      </Text>
    </View>
  );
}

const makeStyles = (Colors: ColorScheme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing['2xl'],
      backgroundColor: Colors.background,
    },
    loadingText: { marginTop: spacing.md, fontSize: fontSize.md, color: Colors.gray[400] },
    errorText: {
      fontSize: fontSize.md,
      color: Colors.gray[700],
      textAlign: 'center',
      marginBottom: spacing.xl,
    },
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
      backgroundColor: Colors.successSolid,
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
    warehouseUnknownCard: {
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: Colors.costcoRed,
    },
    warehouseUnknownAction: {
      fontSize: fontSize.sm,
      fontWeight: '600',
      color: Colors.costcoRed,
      marginTop: 4,
    },

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
      backgroundColor: Colors.navySolid,
      borderRadius: radius.md,
    },
    copyBtnPressed: { backgroundColor: '#12203A' },
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
    imageExpandText: {
      color: Colors.white,
      fontSize: fontSize.xs,
      fontWeight: '600',
      letterSpacing: letterSpacing.wide,
    },

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
    sectionHint: {
      fontSize: fontSize.xs,
      color: Colors.gray[400],
      paddingHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    itemRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      backgroundColor: Colors.surface,
    },
    itemRowPressed: { backgroundColor: Colors.gray[50] },
    itemInfo: { flex: 1, paddingRight: spacing.md },
    itemDescription: { fontSize: fontSize.md, color: Colors.gray[800], fontWeight: '500' },
    itemSku: {
      fontSize: fontSize.xs,
      color: Colors.gray[400],
      marginTop: 3,
      letterSpacing: letterSpacing.wide,
    },
    itemPricing: { alignItems: 'flex-end' },
    itemPrice: { fontSize: fontSize.md, fontWeight: '700', color: Colors.gray[800] },
    itemDiscount: { fontSize: fontSize.sm, color: Colors.savings, marginTop: 2, fontWeight: '600' },
    itemUnitPrice: { fontSize: fontSize.xs, color: Colors.gray[400], marginTop: 2 },
    editLineTotal: {
      fontSize: fontSize.sm,
      color: Colors.gray[500],
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
    },
    editLineTotalValue: { fontWeight: '800', color: Colors.gray[900] },
    separator: { height: 1, backgroundColor: Colors.border, marginLeft: spacing.lg },

    // Inline item editing
    editRow: {
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      backgroundColor: Colors.surfaceSunken,
      gap: spacing.sm,
    },
    editDescription: { fontSize: fontSize.md, color: Colors.gray[800], fontWeight: '600' },
    editFieldsRow: { flexDirection: 'row', gap: spacing.sm },
    editField: { flex: 1, gap: 2 },
    editFieldLabel: {
      fontSize: 10,
      fontWeight: '700',
      color: Colors.gray[400],
      letterSpacing: letterSpacing.caps,
    },
    editInput: {
      backgroundColor: Colors.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      fontSize: fontSize.md,
      color: Colors.gray[900],
    },
    editActionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
    editDoneBtn: {
      flex: 1,
      backgroundColor: Colors.successSolid,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    editDoneText: { color: Colors.white, fontSize: fontSize.sm, fontWeight: '700' },
    editCancelBtn: {
      flex: 1,
      backgroundColor: Colors.gray[200],
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    editCancelText: { color: Colors.gray[700], fontSize: fontSize.sm, fontWeight: '700' },

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
    totalValueBold: {
      fontSize: fontSize.lg,
      fontWeight: '800',
      letterSpacing: letterSpacing.tight,
    },
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
      backgroundColor: Colors.costcoRedSolid,
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

const makeNotifStyles = (Colors: ColorScheme) =>
  StyleSheet.create({
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
      backgroundColor: Colors.costcoRedSolid,
      borderRadius: radius.lg,
      paddingVertical: spacing.lg,
      alignItems: 'center',
      marginBottom: spacing.md,
      ...shadow.sm,
    },
    allowButtonPressed: { backgroundColor: Colors.costcoRedDark },
    allowText: {
      color: Colors.white,
      fontSize: fontSize.md,
      fontWeight: '700',
      letterSpacing: letterSpacing.wide,
    },
    dismissButton: {
      width: '100%',
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    dismissText: { color: Colors.gray[400], fontSize: fontSize.sm, fontWeight: '500' },
  });

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
  closeText: { color: '#FFFFFF', fontSize: fontSize.md, fontWeight: '600' },
  // Image dimensions are applied inline from useWindowDimensions() at the
  // call site rather than baked in here — a module-scope Dimensions.get()
  // is captured once at import and goes stale on rotation or iPad
  // split-screen resize, leaving the image sized to the old window.
});
