import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type PressableProps, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { WarehouseColorsLight as Colors } from '../../constants/colors.warehouse';
import { fontFamily, fontSize, radius, shadow, spacing } from '../../constants/theme.warehouse';
import { easeSmooth, timing } from '../../constants/motion.warehouse';
import { AlertBounceIn, PressScale, StarPop } from './WarehouseMotion';

// ── Warehouse component starter kit ──────────────────────────────────────────
// Component starter kit deliverable from the animation plan: Button, Card,
// Badge, TierPill, StarCounter, AlertTile, ReceiptRow. Built on the parallel
// Warehouse Red & Cream tokens — not wired into any real screen.

// ── Button ────────────────────────────────────────────────────────────────────
type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export function Button({
  title,
  variant = 'primary',
  onPress,
  disabled,
  icon,
}: {
  title: string;
  variant?: ButtonVariant;
  onPress?: PressableProps['onPress'];
  disabled?: boolean;
  icon?: string;
}) {
  return (
    <PressScale onPress={onPress} disabled={disabled} style={[buttonStyles.base, buttonStyles[variant], disabled && buttonStyles.disabled]}>
      {icon && <Text style={buttonStyles.icon}>{icon}</Text>}
      <Text style={[buttonStyles.label, buttonStyles[`${variant}Label` as const]]}>{title}</Text>
    </PressScale>
  );
}

const buttonStyles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing['2xl'],
    borderRadius: radius.lg,
  },
  primary: { backgroundColor: Colors.primary, ...shadow.sm },
  secondary: { backgroundColor: Colors.creamDark },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.5 },
  icon: { fontSize: fontSize.lg },
  label: { fontFamily: fontFamily.bodySemibold, fontSize: fontSize.md },
  primaryLabel: { color: Colors.primaryForeground },
  secondaryLabel: { color: Colors.navy },
  ghostLabel: { color: Colors.primary },
});

// ── Card ──────────────────────────────────────────────────────────────────────
type CardVariant = 'default' | 'featured' | 'compact' | 'alert';

export function Card({
  variant = 'default',
  style,
  children,
}: {
  variant?: CardVariant;
  style?: ViewStyle;
  children: React.ReactNode;
}) {
  return <View style={[cardStyles.base, cardStyles[variant], style]}>{children}</View>;
}

const cardStyles = StyleSheet.create({
  base: {
    backgroundColor: Colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadow.sm,
  },
  default: {},
  featured: {
    backgroundColor: Colors.navy,
    padding: spacing['2xl'],
    ...shadow.md,
  },
  compact: { padding: spacing.md, borderRadius: radius.lg },
  alert: {
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
});

// ── Badge tile (locked/unlocked achievement) ─────────────────────────────────
export function BadgeTile({
  icon,
  name,
  unlocked,
}: {
  icon: string;
  name: string;
  unlocked: boolean;
}) {
  return (
    <View style={[badgeStyles.tile, !unlocked && badgeStyles.tileLocked]}>
      <View style={[badgeStyles.iconWrap, unlocked && badgeStyles.iconWrapUnlocked]}>
        <Text style={[badgeStyles.icon, !unlocked && badgeStyles.iconLocked]}>
          {unlocked ? icon : '🔒'}
        </Text>
      </View>
      <Text style={[badgeStyles.name, !unlocked && badgeStyles.nameLocked]} numberOfLines={2}>
        {name}
      </Text>
    </View>
  );
}

const badgeStyles = StyleSheet.create({
  tile: {
    width: '31%',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    gap: spacing.xs,
    ...shadow.sm,
  },
  tileLocked: { opacity: 0.55, ...shadow.sm, shadowOpacity: 0 },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: Colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapUnlocked: { backgroundColor: Colors.redLight },
  icon: { fontSize: 20 },
  iconLocked: { opacity: 0.5 },
  name: {
    fontFamily: fontFamily.bodySemibold,
    fontSize: fontSize.xs,
    color: Colors.navy,
    textAlign: 'center',
    lineHeight: 14,
  },
  nameLocked: { color: Colors.mutedForeground },
});

// ── Tier pill (current tier + progress to next) ──────────────────────────────
export function TierPill({
  tierName,
  stars,
  nextThreshold,
}: {
  tierName: string;
  stars: number;
  nextThreshold: number | null;
}) {
  const progress = useSharedValue(0);
  const pct = nextThreshold ? Math.min(stars / nextThreshold, 1) : 1;

  useEffect(() => {
    progress.value = withTiming(pct, timing.slow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pct]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }));

  return (
    <View style={tierStyles.wrap}>
      <View style={tierStyles.header}>
        <Text style={tierStyles.label}>CURRENT FAN TIER</Text>
        <Text style={tierStyles.stars}>⭐ {stars}</Text>
      </View>
      <Text style={tierStyles.tierName}>{tierName}</Text>
      <View style={tierStyles.track}>
        <Animated.View style={[tierStyles.fill, barStyle]} />
      </View>
      <Text style={tierStyles.progressText}>
        {nextThreshold ? `${nextThreshold - stars} stars to next tier` : 'Top tier reached'}
      </Text>
    </View>
  );
}

const tierStyles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: {
    fontFamily: fontFamily.bodySemibold,
    fontSize: fontSize.xs,
    color: 'rgba(245,239,230,0.6)',
    letterSpacing: 1.2,
  },
  stars: { fontFamily: fontFamily.bodySemibold, fontSize: fontSize.sm, color: Colors.gold },
  tierName: { fontFamily: fontFamily.display, fontSize: fontSize['2xl'], color: '#fff' },
  track: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(245,239,230,0.15)',
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: Colors.gold, borderRadius: radius.pill },
  progressText: { fontFamily: fontFamily.body, fontSize: fontSize.xs, color: 'rgba(245,239,230,0.7)' },
});

// ── Star counter (animated pop on earn) ──────────────────────────────────────
export function StarCounter({ count, trigger }: { count: number; trigger: number }) {
  return (
    <View style={starCounterStyles.wrap}>
      <StarPop trigger={trigger}>
        <Text style={starCounterStyles.star}>⭐</Text>
      </StarPop>
      <Text style={starCounterStyles.count}>{count}</Text>
    </View>
  );
}

const starCounterStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  star: { fontSize: 28 },
  count: { fontFamily: fontFamily.display, fontSize: fontSize['3xl'], color: Colors.navy },
});

// ── Alert tile (price drop notification) ─────────────────────────────────────
export function AlertTile({
  name,
  paidPrice,
  currentPrice,
  delta,
  animate = true,
}: {
  name: string;
  paidPrice: number;
  currentPrice: number;
  delta: number;
  animate?: boolean;
}) {
  const content = (
    <Card variant="alert" style={alertStyles.card}>
      <View style={alertStyles.iconWrap}>
        <Text style={alertStyles.icon}>🏷</Text>
      </View>
      <View style={alertStyles.body}>
        <Text style={alertStyles.name} numberOfLines={2}>{name}</Text>
        <Text style={alertStyles.prices}>
          <Text style={alertStyles.pricePaid}>${paidPrice.toFixed(2)}</Text>
          {'  →  '}
          <Text style={alertStyles.priceNow}>${currentPrice.toFixed(2)}</Text>
        </Text>
      </View>
      <Text style={alertStyles.delta}>+${delta.toFixed(2)}</Text>
    </Card>
  );

  return animate ? <AlertBounceIn>{content}</AlertBounceIn> : content;
}

const alertStyles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: Colors.redLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: { fontSize: 16 },
  body: { flex: 1, gap: 2 },
  name: { fontFamily: fontFamily.bodySemibold, fontSize: fontSize.sm, color: Colors.navy },
  prices: { fontFamily: fontFamily.mono, fontSize: fontSize.xs },
  pricePaid: { color: Colors.mutedForeground, textDecorationLine: 'line-through' },
  priceNow: { color: Colors.success, fontFamily: fontFamily.monoMedium },
  delta: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: Colors.success },
});

// ── Receipt row (scanned line item) ──────────────────────────────────────────
export function ReceiptRow({
  sku,
  description,
  price,
  index = 0,
}: {
  sku: string;
  description: string;
  price: number;
  index?: number;
}) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 250, easing: easeSmooth });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View style={[receiptRowStyles.row, rowStyle]}>
      <View style={receiptRowStyles.body}>
        <Text style={receiptRowStyles.desc} numberOfLines={1}>{description}</Text>
        <Text style={receiptRowStyles.sku}>SKU {sku}</Text>
      </View>
      <Text style={receiptRowStyles.price}>${price.toFixed(2)}</Text>
    </Animated.View>
  );
}

const receiptRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  body: { flex: 1 },
  desc: { fontFamily: fontFamily.bodyMedium, fontSize: fontSize.sm, color: Colors.navy },
  sku: { fontFamily: fontFamily.mono, fontSize: 10, color: Colors.mutedForeground, marginTop: 1 },
  price: { fontFamily: fontFamily.monoMedium, fontSize: fontSize.sm, color: Colors.navy },
});

// ── Warehouse rarity icon (flat geometric, no SVG dependency) ────────────────
export function WarehouseRarityIcon({ tier, size = 32 }: { tier: 'Common' | 'Rare' | 'Legendary'; size?: number }) {
  const accent = tier === 'Legendary' ? Colors.gold : tier === 'Rare' ? Colors.chart2 : Colors.mutedForeground;
  return (
    <View style={[rarityStyles.box, { width: size, height: size, borderColor: accent }]}>
      {tier === 'Rare' && <Text style={[rarityStyles.mark, { fontSize: size * 0.4 }]}>★</Text>}
      {tier === 'Legendary' && <Text style={[rarityStyles.mark, { fontSize: size * 0.4 }]}>♛</Text>}
    </View>
  );
}

const rarityStyles = StyleSheet.create({
  box: {
    borderWidth: 2,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: { color: Colors.gold, fontFamily: fontFamily.bodyBold },
});

// ── Section label (ALL-CAPS, matches app-wide convention) ────────────────────
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={sectionLabelStyles.label}>{children}</Text>;
}

const sectionLabelStyles = StyleSheet.create({
  label: {
    fontFamily: fontFamily.bodySemibold,
    fontSize: fontSize.xs,
    color: Colors.mutedForeground,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
});
