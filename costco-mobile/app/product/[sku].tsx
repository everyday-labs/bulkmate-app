import { useEffect, useMemo, useState } from 'react';
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
import { useThemeColors } from '../../contexts/ThemeContext';
import type { ColorScheme } from '../../constants/colors';
import { spacing, fontSize, radius, shadow, letterSpacing } from '../../constants/theme';
import { FloatView } from '../../components/Motion';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;

type OCRHistory = {
  count: number;
  min_price: number | null;
  max_price: number | null;
  avg_price: number | null;
  last_seen: string | null;
};

type IngredientFlag = 'good' | 'watch' | 'avoid';

type ClassifiedIngredient = {
  name: string;
  flag: IngredientFlag;
  reason: string | null;
};

// Product-level flags — NOVA processing group, Nutri-Score, a specific
// nutrient running high — things that describe the product as a whole
// rather than one named ingredient.
type ProductFlag = {
  key: string;
  label: string;
  flag: 'watch' | 'avoid';
  reason: string;
};

type Ingredients = {
  text: string | null;
  items: ClassifiedIngredient[];
  productFlags: ProductFlag[];
  tally: { good: number; watch: number; avoid: number };
  novaGroup: number | null;
  nutriscoreGrade: string | null;
  // 'off' = real structured classification (NOVA/Nutri-Score/additives).
  // 'fdc' = raw-text-only fallback, keyword-classified, lower confidence.
  source: 'off' | 'fdc' | 'none';
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
  ingredients: Ingredients;
  // 'partial' = no RapidAPI price match, but ingredients and/or in-store
  // price history was available instead — price fields will be null.
  source: 'cache' | 'rapidapi' | 'partial';
};

export default function ProductDetailScreen() {
  const { sku } = useLocalSearchParams<{ sku: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const Colors = useThemeColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sku) fetchProduct(sku);
  }, [sku]);

  async function fetchProduct(itemSku: string) {
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/barcode-lookup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
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
        <FloatView>
          <Text style={styles.errorIcon}>📦</Text>
        </FloatView>
        <Text style={styles.errorTitle}>Product Not Found</Text>
        <Text style={styles.errorSubtitle}>
          {error ?? 'This item is not in the Costco catalogue.'}
        </Text>
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
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.headerBack, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <Text style={styles.headerBackText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          Product Details
        </Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + spacing['2xl'] },
        ]}
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
            <FloatView>
              <Text style={styles.imagePlaceholderIcon}>📦</Text>
            </FloatView>
          </View>
        )}

        {/* Name + brand */}
        <View style={styles.nameSection}>
          {product.brand && <Text style={styles.brandLabel}>{product.brand.toUpperCase()}</Text>}
          <Text style={styles.productName}>{product.name}</Text>
          {product.rating != null && (
            <View style={styles.ratingRow}>
              <Text style={styles.ratingStars}>
                {'★'.repeat(Math.round(product.rating))}
                {'☆'.repeat(5 - Math.round(product.rating))}
              </Text>
              <Text style={styles.ratingValue}>{product.rating.toFixed(1)}</Text>
              {product.total_reviews != null && (
                <Text style={styles.ratingCount}>
                  ({product.total_reviews.toLocaleString()} reviews)
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Ingredients — only renders when FDC actually had a match */}
        {product.ingredients.items.length > 0 && (
          <IngredientsCard ingredients={product.ingredients} styles={styles} Colors={Colors} />
        )}

        {/* Pricing card */}
        <View style={styles.priceCard}>
          <Text style={styles.cardSectionLabel}>CURRENT PRICING</Text>

          {product.sale_price == null && product.online_price == null && (
            <Text style={styles.priceUnavailableText}>
              No current Costco pricing for this item — it may not be a warehouse item, or hasn't
              been scanned by another Bulkmate user yet.
            </Text>
          )}

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
          <Text style={styles.historySubtitle}>From Bulkmate receipt scans</Text>

          {hasOCRData ? (
            <View style={styles.historyStats}>
              <HistoryStat
                label="Lowest Seen"
                value={`$${product.ocr_history.min_price!.toFixed(2)}`}
                accent={Colors.savings}
                styles={styles}
              />
              <View style={styles.historyStatDivider} />
              <HistoryStat
                label="Average"
                value={`$${product.ocr_history.avg_price!.toFixed(2)}`}
                accent={Colors.executiveNavy}
                styles={styles}
              />
              <View style={styles.historyStatDivider} />
              <HistoryStat
                label="Highest Seen"
                value={`$${product.ocr_history.max_price!.toFixed(2)}`}
                accent={Colors.gray[500]}
                styles={styles}
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
              Based on {product.ocr_history.count}{' '}
              {product.ocr_history.count === 1 ? 'receipt' : 'receipts'} · Last seen{' '}
              {new Date(product.ocr_history.last_seen + 'T00:00:00').toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
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

type Styles = ReturnType<typeof makeStyles>;

function flagColor(Colors: ColorScheme, flag: IngredientFlag): { fg: string; bg: string } {
  if (flag === 'avoid') return { fg: Colors.error, bg: Colors.errorBg };
  if (flag === 'watch') return { fg: Colors.warning, bg: Colors.warningBg };
  return { fg: Colors.success, bg: Colors.successBg };
}

// Nutri-Score has a fixed, internationally recognized color scheme
// (A darkest green → E red) — deliberately not run through the app's theme
// tokens, the same way a stop sign stays red regardless of dark mode.
const NUTRISCORE_COLORS: Record<string, string> = {
  a: '#038141',
  b: '#85BB2F',
  c: '#FECB02',
  d: '#EE8100',
  e: '#E63E11',
};
// White text fails contrast on B/C/D (computed: 2.3/1.53/2.7 — C especially
// is nearly invisible) since those are light/bright fills. Picked per-grade
// so every letter is actually readable, not just letting one color "mostly"
// work across all five backgrounds.
const NUTRISCORE_TEXT: Record<string, string> = {
  a: '#FFFFFF',
  b: '#1A1714',
  c: '#1A1714',
  d: '#1A1714',
  e: '#FFFFFF',
};

const NOVA_LABELS: Record<number, string> = {
  1: 'Unprocessed or minimally processed',
  2: 'Processed culinary ingredient',
  3: 'Processed food',
  4: 'Ultra-processed food',
};

function IngredientsCard({
  ingredients,
  styles,
  Colors,
}: {
  ingredients: Ingredients;
  styles: Styles;
  Colors: ColorScheme;
}) {
  // Ingredient-level flags (tied to a specific label token) and
  // product-level flags (NOVA/Nutri-Score/nutrient levels — describe the
  // product as a whole) are shown together as one "here's what's flagged
  // and why" list, so nothing reads as fragmented across two sections.
  const flaggedItems = ingredients.items.filter((i) => i.flag !== 'good' && i.reason);
  const combinedFlags = [
    ...flaggedItems.map((i) => ({
      key: i.name,
      label: i.name,
      flag: i.flag as 'watch' | 'avoid',
      reason: i.reason!,
    })),
    ...ingredients.productFlags,
  ];

  return (
    <View style={styles.ingredientsCard}>
      <View style={styles.ingHeadRow}>
        <Text style={styles.cardSectionLabel}>INGREDIENTS</Text>
        <View style={styles.ingTallyRow}>
          <View style={[styles.ingDot, { backgroundColor: Colors.success }]} />
          <Text style={[styles.ingTallyText, { color: Colors.success }]}>
            {ingredients.tally.good} clean
          </Text>
          <Text style={styles.ingTallySep}>·</Text>
          <View style={[styles.ingDot, { backgroundColor: Colors.warning }]} />
          <Text style={[styles.ingTallyText, { color: Colors.warning }]}>
            {ingredients.tally.watch} watch
          </Text>
          <Text style={styles.ingTallySep}>·</Text>
          <View style={[styles.ingDot, { backgroundColor: Colors.error }]} />
          <Text style={[styles.ingTallyText, { color: Colors.error }]}>
            {ingredients.tally.avoid} avoid
          </Text>
        </View>
      </View>

      {(ingredients.novaGroup != null || ingredients.nutriscoreGrade != null) && (
        <View style={styles.scoreRow}>
          {ingredients.novaGroup != null && (
            <View style={styles.novaBadge}>
              <Text style={styles.novaBadgeNum}>NOVA {ingredients.novaGroup}</Text>
              <Text style={styles.novaBadgeLabel} numberOfLines={1}>
                {NOVA_LABELS[ingredients.novaGroup]}
              </Text>
            </View>
          )}
          {ingredients.nutriscoreGrade != null && (
            <View
              style={[
                styles.nutriscoreBadge,
                {
                  backgroundColor:
                    NUTRISCORE_COLORS[ingredients.nutriscoreGrade] ?? Colors.gray[400],
                },
              ]}
            >
              <Text
                style={[
                  styles.nutriscoreLetter,
                  { color: NUTRISCORE_TEXT[ingredients.nutriscoreGrade] ?? '#FFFFFF' },
                ]}
              >
                {ingredients.nutriscoreGrade.toUpperCase()}
              </Text>
            </View>
          )}
        </View>
      )}

      <Text style={styles.ingText}>
        {ingredients.items.map((item, i) => {
          const { fg, bg } = flagColor(Colors, item.flag);
          const isLast = i === ingredients.items.length - 1;
          return (
            <Text key={`${item.name}-${i}`}>
              <Text
                style={
                  item.flag === 'good'
                    ? styles.ingTokenPlain
                    : [styles.ingTokenFlagged, { color: fg, backgroundColor: bg }]
                }
              >
                {item.name}
              </Text>
              {isLast ? '.' : ', '}
            </Text>
          );
        })}
      </Text>

      {combinedFlags.length > 0 && (
        <View style={styles.flagList}>
          {combinedFlags.map((item, i) => {
            const { fg, bg } = flagColor(Colors, item.flag);
            return (
              <View key={`${item.key}-${i}`} style={styles.flagRow}>
                <View style={[styles.flagChip, { backgroundColor: bg }]}>
                  <Text style={[styles.flagChipText, { color: fg }]}>
                    {item.flag === 'avoid' ? 'Avoid' : 'Watch'}
                  </Text>
                </View>
                <View style={styles.flagCopy}>
                  <Text style={styles.flagName}>{item.label}</Text>
                  <Text style={styles.flagWhy}>{item.reason}</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={styles.ingLegend}>
        <View style={styles.ingLegendItem}>
          <View style={[styles.ingDot, { backgroundColor: Colors.success }]} />
          <Text style={styles.ingLegendText}>Clean</Text>
        </View>
        <View style={styles.ingLegendItem}>
          <View style={[styles.ingDot, { backgroundColor: Colors.warning }]} />
          <Text style={styles.ingLegendText}>Moderate</Text>
        </View>
        <View style={styles.ingLegendItem}>
          <View style={[styles.ingDot, { backgroundColor: Colors.error }]} />
          <Text style={styles.ingLegendText}>Avoid</Text>
        </View>
      </View>

      {/* Open Food Facts data is licensed under the ODbL, which requires
          crediting the source wherever it's shown. */}
      {ingredients.source === 'off' && (
        <Pressable
          onPress={() => Linking.openURL('https://world.openfoodfacts.org')}
          accessibilityRole="link"
          hitSlop={8}
        >
          <Text style={styles.ingSource}>
            Ingredient data © Open Food Facts contributors, available under the Open Database
            License
          </Text>
        </Pressable>
      )}
      {ingredients.source === 'fdc' && (
        <Text style={styles.ingSource}>Ingredient data: USDA FoodData Central</Text>
      )}
    </View>
  );
}

function HistoryStat({
  label,
  value,
  accent,
  styles,
}: {
  label: string;
  value: string;
  accent: string;
  styles: Styles;
}) {
  return (
    <View style={styles.historyStat}>
      <Text style={[styles.historyStatValue, { color: accent }]}>{value}</Text>
      <Text style={styles.historyStatLabel}>{label}</Text>
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
      backgroundColor: Colors.costcoRedSolid,
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
      backgroundColor: Colors.costcoRedSolid,
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

    // Ingredients card
    ingredientsCard: {
      backgroundColor: Colors.surface,
      borderRadius: radius['2xl'],
      padding: spacing.xl,
      gap: spacing.md,
      ...shadow.sm,
    },
    ingHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    ingTallyRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    scoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    novaBadge: {
      flex: 1,
      backgroundColor: Colors.surfaceSunken,
      borderRadius: radius.lg,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    novaBadgeNum: { fontSize: 11.5, fontWeight: '800', color: Colors.gray[800] },
    novaBadgeLabel: { fontSize: 10.5, color: Colors.gray[500], marginTop: 1 },
    nutriscoreBadge: {
      width: 36,
      height: 36,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nutriscoreLetter: { fontSize: 16, fontWeight: '800', color: '#FFFFFF' },
    ingDot: { width: 7, height: 7, borderRadius: radius.pill },
    ingTallyText: { fontSize: fontSize.xs, fontWeight: '700' },
    ingTallySep: { fontSize: fontSize.xs, color: Colors.gray[300] },
    ingText: { fontSize: fontSize.sm, color: Colors.gray[700], lineHeight: 26 },
    ingTokenPlain: { color: Colors.gray[700] },
    ingTokenFlagged: {
      fontWeight: '700',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.sm,
      overflow: 'hidden',
    },
    flagList: { gap: spacing.sm },
    flagRow: {
      flexDirection: 'row',
      gap: spacing.md,
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: Colors.surfaceSunken,
    },
    flagChip: {
      alignSelf: 'flex-start',
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
    },
    flagChipText: {
      fontSize: 9.5,
      fontWeight: '800',
      letterSpacing: letterSpacing.caps,
      textTransform: 'uppercase',
    },
    flagCopy: { flex: 1 },
    flagName: {
      fontSize: fontSize.sm,
      fontWeight: '700',
      color: Colors.gray[800],
      marginBottom: 2,
    },
    flagWhy: { fontSize: fontSize.xs, color: Colors.gray[500], lineHeight: 17 },
    ingLegend: {
      flexDirection: 'row',
      gap: spacing.lg,
      paddingTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: Colors.border,
    },
    ingLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    ingLegendText: { fontSize: 10.5, color: Colors.gray[400], fontWeight: '600' },
    ingSource: {
      fontSize: fontSize.xs,
      color: Colors.gray[500],
      lineHeight: 17,
      marginTop: spacing.sm,
    },

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
    priceUnavailableText: {
      fontSize: fontSize.sm,
      color: Colors.gray[400],
      lineHeight: 20,
      marginTop: -spacing.sm,
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
