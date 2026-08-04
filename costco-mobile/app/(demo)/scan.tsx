import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { WarehouseColorsLight as Colors } from '../../constants/colors.warehouse';
import { fontFamily, fontSize, radius, spacing } from '../../constants/theme.warehouse';
import { Button, Card, ReceiptRow, SectionLabel } from '../../components/warehouse/ui';
import { CheckmarkBurst, FadeUpView } from '../../components/warehouse/WarehouseMotion';
import { DemoHeader } from '../../components/warehouse/DemoHeader';

type ScanState = 'idle' | 'scanning' | 'success';

const FAKE_ITEMS = [
  { sku: '1234567', description: 'Kirkland Almonds 3lb', price: 14.99 },
  { sku: '7654321', description: 'Bounty Paper Towels 12ct', price: 21.49 },
  { sku: '9988776', description: 'Organic Rotisserie Chicken', price: 6.99 },
  { sku: '5544332', description: 'Kirkland Cold Brew 12pk', price: 12.99 },
];

const SCAN_DURATION_MS = 1800;

function ScanSweepLine({ active }: { active: boolean }) {
  const top = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (active) {
      top.value = 0;
      top.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      );
      opacity.value = withTiming(1, { duration: 150 });
    } else {
      cancelAnimation(top);
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [active, top, opacity]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    top: `${top.value * 100}%`,
  }));

  return <Animated.View style={[styles.sweepLine, style]} pointerEvents="none" />;
}

export default function DemoScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<ScanState>('idle');

  function startScan() {
    setState('scanning');
    setTimeout(() => setState('success'), SCAN_DURATION_MS);
  }

  function reset() {
    setState('idle');
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing['2xl'] }]}
      showsVerticalScrollIndicator={false}
    >
      <DemoHeader title="Scan Receipt" onBack={() => router.back()} />

      {/* Camera placeholder */}
      <View style={styles.cameraFrame}>
        <View style={styles.cameraInner}>
          {state !== 'success' && <Text style={styles.cameraHint}>📄</Text>}
          {state === 'scanning' && <ScanSweepLine active />}
          {state === 'success' && (
            <CheckmarkBurst visible>
              <View style={styles.checkmarkWrap}>
                <Text style={styles.checkmark}>✓</Text>
              </View>
            </CheckmarkBurst>
          )}
        </View>
        <Text style={styles.cameraCaption}>
          {state === 'idle' && 'Line up your receipt in the frame'}
          {state === 'scanning' && 'Scanning…'}
          {state === 'success' && 'Receipt captured'}
        </Text>
      </View>

      {state === 'idle' && (
        <FadeUpView index={0} style={styles.ctaWrap}>
          <Button title="Simulate Scan" icon="🧾" onPress={startScan} />
        </FadeUpView>
      )}

      {state === 'scanning' && (
        <View style={styles.ctaWrap}>
          <Button title="Scanning…" variant="secondary" disabled onPress={() => {}} />
        </View>
      )}

      {state === 'success' && (
        <>
          <FadeUpView index={0} style={styles.resultSection}>
            <Card>
              <SectionLabel>4 Items Found</SectionLabel>
              {FAKE_ITEMS.map((item, i) => (
                <ReceiptRow key={item.sku} {...item} index={i} />
              ))}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>
                  ${FAKE_ITEMS.reduce((s, i) => s + i.price, 0).toFixed(2)}
                </Text>
              </View>
            </Card>
          </FadeUpView>

          <FadeUpView index={1} style={styles.ctaWrap}>
            <Button title="Scan Another" variant="secondary" onPress={reset} />
          </FadeUpView>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: spacing.lg },
  cameraFrame: { marginBottom: spacing.lg },
  cameraInner: {
    height: 260,
    borderRadius: radius.xl,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  cameraHint: { fontSize: 56, opacity: 0.5 },
  sweepLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: Colors.primary,
  },
  checkmarkWrap: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { fontSize: 36, color: '#fff', fontFamily: fontFamily.bodyBold },
  cameraCaption: {
    fontFamily: fontFamily.body,
    fontSize: fontSize.sm,
    color: Colors.mutedForeground,
    textAlign: 'center',
    marginTop: spacing.md,
  },
  ctaWrap: { marginBottom: spacing.lg },
  resultSection: { marginBottom: spacing.lg },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
  },
  totalLabel: { fontFamily: fontFamily.bodySemibold, fontSize: fontSize.md, color: Colors.navy },
  totalValue: { fontFamily: fontFamily.display, fontSize: fontSize.lg, color: Colors.primary },
});
