import { useEffect } from 'react';
import { StyleSheet, View, type StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

// ── Shared idle/decorative motion primitives ─────────────────────────────────
// Generic building blocks (not tied to the scan/check-in flow — see
// ScanEffects.tsx for those) used for empty-state icons and rare/legendary
// decoration. Recreated 2026-08-05 after the original `FloatView` (from the
// deleted `components/warehouse/WarehouseMotion.tsx` demo) was ported here as
// a real shared primitive — see reference-app-audit-2026-08-05.md item #17.

// ── Gentle idle float (slow up/down bob) ─────────────────────────────────────
export function FloatView({
  distance = 6,
  duration = 1600,
  style,
  children,
}: {
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-distance, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [translateY, distance, duration]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// ── Sparkle/twinkle glint (small rotating+scaling star) ──────────────────────
// Decorates Legendary-tier badges/warehouse chips — a few of these scattered
// around an icon reads as a "glint" rather than one obvious spinner.
export function Sparkle({
  size = 10,
  color = '#FFFFFF',
  delay = 0,
  style,
}: {
  size?: number;
  color?: string;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(0.4);
  const opacity = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }),
          withTiming(0.4, { duration: 650, easing: Easing.in(Easing.cubic) }),
        ),
        -1,
        false,
      ),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 650 }),
          withTiming(0, { duration: 650 }),
        ),
        -1,
        false,
      ),
    );
    rotate.value = withDelay(delay, withRepeat(withTiming(180, { duration: 1300, easing: Easing.linear }), -1, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <Animated.View style={[styles.sparkle, { width: size, height: size }, animatedStyle, style]}>
      <View style={[styles.sparkleArm, { backgroundColor: color, width: size, height: size * 0.22 }]} />
      <View
        style={[
          styles.sparkleArm,
          styles.sparkleArmVertical,
          { backgroundColor: color, width: size, height: size * 0.22 },
        ]}
      />
    </Animated.View>
  );
}

// ── Shimmer sweep (diagonal light band) ──────────────────────────────────────
// Used as a one-shot or looping "shine pass" over gold/legendary elements, or
// over skeleton/loading placeholders.
export function Shimmer({
  loop = true,
  width = 60,
  style,
}: {
  loop?: boolean;
  width?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const translateX = useSharedValue(-width * 2);

  useEffect(() => {
    const anim = withTiming(width * 2, { duration: 1400, easing: Easing.linear });
    translateX.value = loop ? withRepeat(withSequence(anim, withTiming(-width * 2, { duration: 0 })), -1, false) : anim;
  }, [translateX, width, loop]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { rotate: '20deg' }],
  }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.shimmerClip, style]}>
      <Animated.View style={[styles.shimmerBand, { width }, animatedStyle]} />
    </View>
  );
}

// ── "Stamp" bounce-in (oversized+rotated → overshoot → settle) ──────────────
// Wraps a badge/stamp circle so it punches in before its inner content (e.g.
// a DrawnCheck) starts drawing — see reference-app-audit-2026-08-05.md #13.
export function StampBounceIn({
  delay = 0,
  style,
  children,
}: {
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(0.3);
  const rotate = useSharedValue(-35);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withSequence(
        withTiming(1.15, { duration: 260, easing: Easing.out(Easing.cubic) }),
        withTiming(0.92, { duration: 130 }),
        withTiming(1, { duration: 110 }),
      ),
    );
    rotate.value = withDelay(
      delay,
      withSequence(
        withTiming(8, { duration: 260, easing: Easing.out(Easing.cubic) }),
        withTiming(-4, { duration: 130 }),
        withTiming(0, { duration: 110 }),
      ),
    );
    opacity.value = withDelay(delay, withTiming(1, { duration: 140 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// ── Bell "ding-dong" (idle swing, pauses between rings) ──────────────────────
// A quick side-to-side rotate that settles, then holds still for a beat
// before ringing again — reads as a bell being nudged, not a spinning icon.
export function BellRing({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const rotate = useSharedValue(0);

  useEffect(() => {
    rotate.value = withRepeat(
      withSequence(
        withTiming(16, { duration: 110, easing: Easing.out(Easing.quad) }),
        withTiming(-12, { duration: 110 }),
        withTiming(8, { duration: 100 }),
        withTiming(-5, { duration: 100 }),
        withTiming(0, { duration: 90 }),
        withTiming(0, { duration: 2400 }), // hold before the next ring
      ),
      -1,
      false,
    );
  }, [rotate]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  return <Animated.View style={[styles.bellOrigin, style, animatedStyle]}>{children}</Animated.View>;
}

// ── Receipt "scan" sweep (thin line passing over the icon on a loop) ────────
// Echoes the real receipt-camera scan sweep (ScanEffects.tsx's SweepLine) at
// icon scale, so the receipt glyph itself reads as "actively scanning".
export function ScanLineIcon({
  color = 'rgba(255,255,255,0.85)',
  style,
  children,
}: {
  color?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const top = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 120 }),
        withTiming(1, { duration: 900 }),
        withTiming(0, { duration: 200 }),
        withTiming(0, { duration: 900 }),
      ),
      -1,
      false,
    );
    top.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1220, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 0 }),
        withTiming(0, { duration: 900 }),
      ),
      -1,
      false,
    );
  }, [top, opacity]);

  const lineStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    top: `${top.value * 100}%`,
  }));

  return (
    <View style={[styles.scanIconWrap, style]}>
      {children}
      <Animated.View style={[styles.scanIconLine, { backgroundColor: color }, lineStyle]} />
    </View>
  );
}

// ── Barcode "laser" sweep (thin beam passing left-right on a loop) ──────────
// Horizontal counterpart to ScanLineIcon — a barcode scanner's beam travels
// across the code, not down it, so the motion direction itself signals which
// kind of scan is happening.
export function BarcodeSweep({
  color = 'rgba(255,255,255,0.85)',
  style,
  children,
}: {
  color?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const left = useSharedValue(0);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 120 }),
        withTiming(1, { duration: 750 }),
        withTiming(0, { duration: 200 }),
        withTiming(0, { duration: 900 }),
      ),
      -1,
      false,
    );
    left.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1070, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: 0 }),
        withTiming(0, { duration: 900 }),
      ),
      -1,
      false,
    );
  }, [left, opacity]);

  const lineStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    left: `${left.value * 100}%`,
  }));

  return (
    <View style={[styles.scanIconWrap, style]}>
      {children}
      <Animated.View style={[styles.barcodeIconLine, { backgroundColor: color }, lineStyle]} />
    </View>
  );
}

// ── Gentle pendulum swing (hanging price-tag motif) ──────────────────────────
export function TagSwing({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const rotate = useSharedValue(-7);

  useEffect(() => {
    rotate.value = withRepeat(
      withTiming(7, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [rotate]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  return <Animated.View style={[styles.bellOrigin, style, animatedStyle]}>{children}</Animated.View>;
}

// ── Soft twinkle (scale + brightness pulse) ──────────────────────────────────
// For star glyphs that should read as alive without a full Sparkle overlay.
export function Twinkle({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    scale.value = withRepeat(
      withSequence(
        withTiming(1.18, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 900 }),
      ),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 700, easing: Easing.inOut(Easing.sin) }),
        withTiming(1, { duration: 900 }),
      ),
      -1,
      false,
    );
  }, [scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// ── Shimmer, pre-wrapped around an icon (clips + positions for you) ─────────
export function ShimmerIcon({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  return (
    <View style={[styles.shimmerIconWrap, style]}>
      {children}
      <Shimmer width={22} style={styles.shimmerIconClip} />
    </View>
  );
}

// ── Cart "roll" (small back-and-forth trundle, like being pushed) ───────────
export function CartRoll({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const translateX = useSharedValue(0);
  const rotate = useSharedValue(0);

  useEffect(() => {
    translateX.value = withRepeat(
      withSequence(
        withTiming(3, { duration: 260, easing: Easing.inOut(Easing.quad) }),
        withTiming(-3, { duration: 400, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 260, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1300 }),
      ),
      -1,
      false,
    );
    rotate.value = withRepeat(
      withSequence(
        withTiming(2, { duration: 260, easing: Easing.inOut(Easing.quad) }),
        withTiming(-2, { duration: 400, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 260, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1300 }),
      ),
      -1,
      false,
    );
  }, [translateX, rotate]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { rotate: `${rotate.value}deg` }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// ── Folder "riffle" (quick squash, like pages being flipped through) ────────
export function FolderFlip({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const scaleY = useSharedValue(1);
  const rotate = useSharedValue(0);

  useEffect(() => {
    scaleY.value = withRepeat(
      withSequence(
        withTiming(0.88, { duration: 90 }),
        withTiming(1.04, { duration: 90 }),
        withTiming(0.94, { duration: 90 }),
        withTiming(1, { duration: 110 }),
        withTiming(1, { duration: 2100 }),
      ),
      -1,
      false,
    );
    rotate.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 90 }),
        withTiming(4, { duration: 90 }),
        withTiming(-2, { duration: 90 }),
        withTiming(0, { duration: 110 }),
        withTiming(0, { duration: 2100 }),
      ),
      -1,
      false,
    );
  }, [scaleY, rotate]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scaleY.value }, { rotate: `${rotate.value}deg` }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// ── Check-in pin "ping" (drop bounce + pulsing ring underneath) ─────────────
export function PinPulse({
  color = 'rgba(209,55,58,0.6)',
  style,
  children,
}: {
  color?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const translateY = useSharedValue(0);
  const ringScale = useSharedValue(0.4);
  const ringOpacity = useSharedValue(0.6);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 380, easing: Easing.out(Easing.quad) }),
        withTiming(0, { duration: 420, easing: Easing.bounce }),
        withTiming(0, { duration: 1400 }),
      ),
      -1,
      false,
    );
    ringScale.value = withRepeat(
      withSequence(
        withTiming(1.6, { duration: 1100, easing: Easing.out(Easing.quad) }),
        withTiming(0.4, { duration: 0 }),
        withTiming(0.4, { duration: 700 }),
      ),
      -1,
      false,
    );
    ringOpacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 1100, easing: Easing.out(Easing.quad) }),
        withTiming(0.6, { duration: 0 }),
        withTiming(0.6, { duration: 700 }),
      ),
      -1,
      false,
    );
  }, [translateY, ringScale, ringOpacity]);

  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));

  return (
    <View style={[styles.pinWrap, style]}>
      <Animated.View style={[styles.pinRing, { borderColor: color }, ringStyle]} />
      <Animated.View style={pinStyle}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  sparkle: { alignItems: 'center', justifyContent: 'center' },
  sparkleArm: { position: 'absolute', borderRadius: 2 },
  sparkleArmVertical: { transform: [{ rotate: '90deg' }] },
  shimmerClip: { overflow: 'hidden', borderRadius: 999 },
  shimmerBand: {
    position: 'absolute',
    top: -20,
    bottom: -20,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  bellOrigin: { alignItems: 'center', justifyContent: 'center' },
  scanIconWrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  scanIconLine: { position: 'absolute', left: '10%', right: '10%', height: 2, borderRadius: 1 },
  barcodeIconLine: { position: 'absolute', top: '10%', bottom: '10%', width: 2, borderRadius: 1 },
  shimmerIconWrap: { position: 'relative', overflow: 'hidden', borderRadius: 8 },
  shimmerIconClip: { borderRadius: 8 },
  pinWrap: { alignItems: 'center', justifyContent: 'center' },
  pinRing: {
    position: 'absolute',
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
  },
});
