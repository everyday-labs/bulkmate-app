import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Image,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { Colors } from '../../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../../constants/theme';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

type OCRHistory = {
  count: number;
  min_price: number | null;
  max_price: number | null;
  avg_price: number | null;
  last_seen: string | null;
};

type Product = {
  sku: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  pdp_url: string | null;
  rating: number | null;
  total_reviews: number | null;
  sale_price: number | null;
  list_price: number | null;
  online_price: number | null;
  savings_amount: number | null;
  in_warehouse: boolean;
  ocr_history: OCRHistory;
  source: 'cache' | 'rapidapi';
};

export default function ProductDetailScreen() {
  const { sku } = useLocalSearchParams<{ sku: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sku) fetchProduct(sku);
  }, [sku]);

  async function fetchProduct(itemSku: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/barcode-lookup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ sku: itemSku }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error ?? `Error ${res.status}`);
      }

      setProduct(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load product');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={Colors.costcoRed} />
        <Text style={styles.loadingText}>Looking up product…</Text>
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.errorIcon}>📦</Text>
        <Text style={styles.errorTitle}>Product Not Found</Text>
        <Text style={styles.errorSubtitle}>{error ?? 'This item is not in the Costco catalogue.'}</Text>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
          onPress={() => router.back()}
        >
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const hasSavings = product.savings_amount != null && product.savings_amount > 0;
  const hasOCRData = product.ocr_history.count > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable onPress={() => router.back()} style={styles.headerBack} hitSlop={8}>
          <Text style={styles.headerBackText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Product Details</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + spacing['2xl'] }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Product image */}
        {product.image_url ? (
          <View style={styles.imageCard}>
            <Image
              source={{ uri: product.image_url }}
              style={styles.productImage}
              resizeMode="contain"
            />
            {hasSavings && (
              <View style={styles.savingsBadge}>
                <Text style={styles.savingsBadgeText}>
                  ${product.savings_amount!.toFixed(2)} OFF
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.imageCard, styles.imagePlaceholder]}>
            <Text style={styles.imagePlaceholderIcon}>📦</Text>
          </View>
        )}

        {/* Name + brand */}
        <View style={styles.nameSection}>
          {product.brand && (
            <Text style={styles.brandLabel}>{product.brand.toUpperCase()}</Text>
          )}
          <Text style={styles.productName}>{product.name}</Text>
          {product.rating != null && (
            <View style={styles.ratingRow}>
              <Text style={styles.ratingStars}>{'★'.repeat(Math.round(product.rating))}{'☆'.repeat(5 - Math.round(product.rating))}</Text>
              <Text style={styles.ratingValue}>{product.rating.toFixed(1)}</Text>
              {product.total_reviews != null && (
                <Text style={styles.ratingCount}>({product.total_reviews.toLocaleString()} reviews)</Text>
              )}
            </View>
          )}
        </View>

        {/* Pricing card */}
        <View style={styles.priceCard}>
          <Text style={styles.cardSectionLabel}>CURRENT PRICING</Text>

          {product.sale_price != null && (
            <View style={styles.priceRow}>
              <Text style={styles.priceLabel}>Warehouse Price</Text>
              <View style={styles.priceValueRow}>
                {hasSavings && product.list_price != null && (
                  <Text style={styles.listPrice}>${product.list_price.toFixed(2)}</Text>
                )}
                <Text style={styles.salePrice}>${product.sale_price.toFixed(2)}</Text>
              </View>
            </View>
          )}

          {product.online_price != null && (
            <>
              <View style={styles.priceDivider} />
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Online Price</Text>
                <Text style={styles.onlinePrice}>${product.online_price.toFixed(2)}</Text>
              </View>
            </>
          )}

          {hasSavings && (
            <>
              <View style={styles.priceDivider} />
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: Colors.savings }]}>You Save</Text>
                <Text style={styles.savingsValue}>−${product.savings_amount!.toFixed(2)}</Text>
              </View>
            </>
          )}

          {product.in_warehouse && (
            <View style={styles.inStockRow}>
              <View style={styles.inStockDot} />
              <Text style={styles.inStockText}>In warehouse</Text>
            </View>
          )}
        </View>

        {/* OCR price history */}
        <View style={styles.historyCard}>
          <Text style={styles.cardSectionLabel}>IN-STORE PRICE HISTORY</Text>
          <Text style={styles.historySubtitle}>
            From Costco Companion receipt scans
          </Text>

          {hasOCRData ? (
            <View style={styles.historyStats}>
              <HistoryStat
                label="Lowest Seen"
                value={`$${product.ocr_history.min_price!.toFixed(2)}`}
                accent={Colors.savings}
              />
              <View style={styles.historyStatDivider} />
              <HistoryStat
                label="Average"
                value={`$${product.ocr_history.avg_price!.toFixed(2)}`}
                accent={Colors.executiveNavy}
              />
              <View style={styles.historyStatDivider} />
              <HistoryStat
                label="Highest Seen"
                value={`$${product.ocr_history.max_price!.toFixed(2)}`}
                accent={Colors.gray[500]}
              />
            </View>
          ) : (
            <View style={styles.historyEmpty}>
              <Text style={styles.historyEmptyText}>
                No in-store price data yet. Scan a receipt containing this item to contribute.
              </Text>
            </View>
          )}

          {hasOCRData && product.ocr_history.last_seen && (
            <Text style={styles.historyFooter}>
              Based on {product.ocr_history.count} {product.ocr_history.count === 1 ? 'receipt' : 'receipts'} · Last seen{' '}
              {new Date(product.ocr_history.last_seen + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </Text>
          )}
        </View>

        {/* View on Costco.com */}
        {product.pdp_url && (
          <Pressable
            style={({ pressed }) => [styles.costcoLink, pressed && { opacity: 0.7 }]}
            onPress={() => Linking.openURL(product.pdp_url!)}
          >
            <Text style={styles.costcoLinkText}>View on Costco.com</Text>
            <Text style={styles.costcoLinkChevron}>›</Text>
          </Pressable>
        )}

        {/* SKU reference */}
        <Text style={styles.skuFooter}>Item #{product.sku}</Text>
      </ScrollView>
    </View>
  );
}

function HistoryStat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <View style={styles.historyStat}>
      <Text style={[styles.historyStatValue, { color: accent }]}>{value}</Text>
      <Text style={styles.historyStatLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
    padding: spacing['2xl'],
  },
  loadingText: { marginTop: spacing.md, fontSize: fontSize.md, color: Colors.gray[400] },
  errorIcon: { fontSize: 52, marginBottom: spacing.xl },
  errorTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: Colors.gray[800],
    marginBottom: spacing.sm,
    letterSpacing: letterSpacing.tight,
  },
  errorSubtitle: {
    fontSize: fontSize.md,
    color: Colors.gray[400],
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: spacing['2xl'],
  },
  backBtn: {
    backgroundColor: Colors.costcoRed,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing['3xl'],
  },
  backBtnPressed: { backgroundColor: Colors.costcoRedDark },
  backBtnText: { color: Colors.white, fontSize: fontSize.md, fontWeight: '700' },

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
  headerBack: { width: 60 },
  headerBackText: { fontSize: fontSize.xl, color: Colors.costcoRed, fontWeight: '500' },
  headerTitle: { fontSize: fontSize.lg, fontWeight: '700', color: Colors.gray[900] },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.lg, gap: spacing.md },

  // Image
  imageCard: {
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    alignItems: 'center',
    ...shadow.sm,
  },
  productImage: { width: '100%', height: 220 },
  imagePlaceholder: { height: 180, justifyContent: 'center' },
  imagePlaceholderIcon: { fontSize: 64 },
  savingsBadge: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    backgroundColor: Colors.costcoRed,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  savingsBadgeText: {
    color: Colors.white,
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: letterSpacing.wide,
  },

  // Name
  nameSection: {
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    ...shadow.sm,
  },
  brandLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.costcoRed,
    letterSpacing: letterSpacing.caps,
    marginBottom: spacing.xs,
  },
  productName: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    color: Colors.gray[900],
    letterSpacing: letterSpacing.tight,
    lineHeight: 28,
    marginBottom: spacing.md,
  },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ratingStars: { fontSize: fontSize.md, color: Colors.goldStarAccent, letterSpacing: 2 },
  ratingValue: { fontSize: fontSize.sm, fontWeight: '700', color: Colors.gray[700] },
  ratingCount: { fontSize: fontSize.xs, color: Colors.gray[400] },

  // Price card
  priceCard: {
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    ...shadow.sm,
  },
  cardSectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    color: Colors.gray[400],
    letterSpacing: letterSpacing.caps,
    marginBottom: spacing.lg,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  priceLabel: { fontSize: fontSize.md, color: Colors.gray[600], fontWeight: '500' },
  priceValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  listPrice: {
    fontSize: fontSize.md,
    color: Colors.gray[400],
    textDecorationLine: 'line-through',
  },
  salePrice: {
    fontSize: fontSize['2xl'],
    fontWeight: '800',
    color: Colors.executiveNavy,
    letterSpacing: letterSpacing.tight,
  },
  onlinePrice: { fontSize: fontSize.lg, fontWeight: '700', color: Colors.gray[700] },
  savingsValue: { fontSize: fontSize.lg, fontWeight: '800', color: Colors.savings },
  priceDivider: { height: 1, backgroundColor: Colors.border, marginVertical: spacing.sm },
  inStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  inStockDot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: Colors.success,
  },
  inStockText: { fontSize: fontSize.sm, color: Colors.success, fontWeight: '600' },

  // OCR history card
  historyCard: {
    backgroundColor: Colors.surface,
    borderRadius: radius['2xl'],
    padding: spacing.xl,
    ...shadow.sm,
  },
  historySubtitle: {
    fontSize: fontSize.xs,
    color: Colors.gray[400],
    marginTop: -spacing.sm,
    marginBottom: spacing.lg,
  },
  historyStats: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  historyStat: { flex: 1, alignItems: 'center' },
  historyStatValue: {
    fontSize: fontSize.xl,
    fontWeight: '800',
    letterSpacing: letterSpacing.tight,
    marginBottom: 3,
  },
  historyStatLabel: { fontSize: fontSize.xs, color: Colors.gray[400], fontWeight: '600' },
  historyStatDivider: { width: 1, height: 36, backgroundColor: Colors.border },
  historyEmpty: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  historyEmptyText: {
    fontSize: fontSize.sm,
    color: Colors.gray[400],
    textAlign: 'center',
    lineHeight: 20,
  },
  historyFooter: {
    fontSize: fontSize.xs,
    color: Colors.gray[300],
    textAlign: 'center',
    marginTop: spacing.xs,
  },

  // Costco.com link
  costcoLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: radius.xl,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
    ...shadow.sm,
  },
  costcoLinkText: {
    fontSize: fontSize.md,
    fontWeight: '600',
    color: Colors.executiveNavy,
  },
  costcoLinkChevron: { fontSize: 20, color: Colors.gray[300] },

  // Footer
  skuFooter: {
    fontSize: fontSize.xs,
    color: Colors.gray[300],
    textAlign: 'center',
    letterSpacing: letterSpacing.wide,
  },
});
