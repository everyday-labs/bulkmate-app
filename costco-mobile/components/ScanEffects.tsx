import { useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '../constants/colors';
import { fontSize, radius, spacing } from '../constants/theme';
import { StampBounceIn } from './Motion';

// ── Scan / check-in celebration effects ──────────────────────────────────────
// Ported from the "Costco Quest" reference app's scan + check-in animations
// (radial-viewfinder scan overlay, confetti burst, drawn checkmark, expanding
// rings, tossed stars). Built on Reanimated + react-native-svg rather than
// CSS keyframes, so infinite loops explicitly snap back to their start value
// each rep — Reanimated (unlike CSS) doesn't auto-reset a `withTiming` to its
// keyframe start on repeat, it continues from wherever the value already is.

const AnimatedPath = Animated.createAnimatedComponent(Path);

// ── Drawn checkmark (SVG stroke draws in) ────────────────────────────────────
const CHECK_PATH = 'M4.5 12.5 L10 18 L19.5 6.5';
const CHECK_PATH_LENGTH = 24; // safe overestimate of the path's true ~22.7 length

export function DrawnCheck({
  size = 36,
  color = Colors.white,
  delay = 120,
}: {
  size?: number;
  color?: string;
  delay?: number;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }),
    );
  }, [progress, delay]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: (1 - progress.value) * CHECK_PATH_LENGTH,
  }));

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <AnimatedPath
        d={CHECK_PATH}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={CHECK_PATH_LENGTH}
        animatedProps={animatedProps}
      />
    </Svg>
  );
}

// ── Confetti burst (radiating pieces from center) ────────────────────────────
const CONFETTI_TONES = [
  Colors.goldStarAccent,
  Colors.success,
  Colors.costcoRed,
  Colors.executiveNavyLight,
];

function ConfettiPiece({
  index,
  count,
  distance,
}: {
  index: number;
  count: number;
  distance: number;
}) {
  const progress = useSharedValue(0);
  const angle = (360 / count) * index;
  const pieceDistance = distance + (index % 3) * 8;

  useEffect(() => {
    progress.value = withDelay(
      index * 28,
      withTiming(1, { duration: 750, easing: Easing.out(Easing.cubic) }),
    );
  }, [progress, index]);

  const animatedStyle = useAnimatedStyle(() => {
    const travel = progress.value * pieceDistance;
    const scale = 0.4 + progress.value * 0.2;
    const opacity =
      progress.value < 0.1
        ? progress.value / 0.1
        : progress.value > 0.7
          ? (1 - progress.value) / 0.3
          : 1;
    return {
      opacity,
      transform: [{ rotate: `${angle}deg` }, { translateY: -travel }, { scale }],
    };
  });

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        { backgroundColor: CONFETTI_TONES[index % CONFETTI_TONES.length] },
        animatedStyle,
      ]}
    />
  );
}

export function ConfettiBurst({
  count = 12,
  distance = 56,
}: {
  count?: number;
  distance?: number;
}) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: count }).map((_, i) => (
        <ConfettiPiece key={i} index={i} count={count} distance={distance} />
      ))}
    </View>
  );
}

// ── Expanding, fading ring (success/check-in halo) ───────────────────────────
export function RingOut({
  color = Colors.success,
  delay = 0,
  style,
}: {
  color?: string;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(0.8);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.7, { duration: 1200, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: 0 }), // snap back — withRepeat continues from current value, not the keyframe start
        ),
        -1,
        false,
      ),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0, { duration: 1200, easing: Easing.out(Easing.quad) }),
          withTiming(0.8, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
  }, [scale, opacity, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, styles.ring, { borderColor: color }, animatedStyle, style]}
    />
  );
}

// ── Tossed-in star (bounce + rotate, staggered by index) ─────────────────────
export function StarToss({
  index = 0,
  baseDelay = 320,
  style,
  children,
}: {
  index?: number;
  baseDelay?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const translateY = useSharedValue(14);
  const scale = useSharedValue(0.3);
  const rotate = useSharedValue(-25);
  const opacity = useSharedValue(0);
  const delay = baseDelay + index * 150;

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withSequence(
        withTiming(-6, { duration: 280, easing: Easing.out(Easing.cubic) }),
        withTiming(1, { duration: 160 }),
        withTiming(0, { duration: 120 }),
      ),
    );
    scale.value = withDelay(
      delay,
      withSequence(
        withTiming(1.18, { duration: 280, easing: Easing.out(Easing.cubic) }),
        withTiming(0.96, { duration: 160 }),
        withTiming(1, { duration: 120 }),
      ),
    );
    rotate.value = withDelay(
      delay,
      withSequence(
        withTiming(8, { duration: 280, easing: Easing.out(Easing.cubic) }),
        withTiming(-3, { duration: 160 }),
        withTiming(0, { duration: 120 }),
      ),
    );
    opacity.value = withDelay(delay, withTiming(1, { duration: 200 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
    ],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// ── Shake/wobble (failure feedback) ───────────────────────────────────────────
export function Wobble({
  trigger,
  style,
  children,
}: {
  trigger: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const rotate = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0) return;
    rotate.value = withSequence(
      withTiming(-6, { duration: 90 }),
      withTiming(5, { duration: 90 }),
      withTiming(-3, { duration: 90 }),
      withTiming(0, { duration: 90 }),
    );
  }, [trigger, rotate]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// ── Scan viewfinder: dimmed spotlight window + corner brackets + sweep line ──
export type ScanFrameState = 'idle' | 'scanning' | 'success' | 'error';

const CORNER_POSITIONS: { key: string; style: ViewStyle }[] = [
  {
    key: 'tl',
    style: {
      top: 0,
      left: 0,
      borderTopWidth: 3,
      borderLeftWidth: 3,
      borderTopLeftRadius: radius.lg,
    },
  },
  {
    key: 'tr',
    style: {
      top: 0,
      right: 0,
      borderTopWidth: 3,
      borderRightWidth: 3,
      borderTopRightRadius: radius.lg,
    },
  },
  {
    key: 'bl',
    style: {
      bottom: 0,
      left: 0,
      borderBottomWidth: 3,
      borderLeftWidth: 3,
      borderBottomLeftRadius: radius.lg,
    },
  },
  {
    key: 'br',
    style: {
      bottom: 0,
      right: 0,
      borderBottomWidth: 3,
      borderRightWidth: 3,
      borderBottomRightRadius: radius.lg,
    },
  },
];

function Corner({
  pos,
  active,
  color,
}: {
  pos: (typeof CORNER_POSITIONS)[number];
  active: boolean;
  color: string;
}) {
  const opacity = useSharedValue(0.45);
  const scale = useSharedValue(1);
  const cornerIndex = CORNER_POSITIONS.findIndex((c) => c.key === pos.key);

  useEffect(() => {
    if (active) {
      const delay = cornerIndex * 120;
      opacity.value = withDelay(
        delay,
        withRepeat(
          withSequence(withTiming(1, { duration: 800 }), withTiming(0.45, { duration: 800 })),
          -1,
          true,
        ),
      );
      scale.value = withDelay(
        delay,
        withRepeat(
          withSequence(withTiming(1.08, { duration: 800 }), withTiming(1, { duration: 800 })),
          -1,
          true,
        ),
      );
    } else {
      opacity.value = withTiming(0.45, { duration: 200 });
      scale.value = withTiming(1, { duration: 200 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={[styles.corner, pos.style, { borderColor: color }, animatedStyle]} />
  );
}

function SweepLine({ active }: { active: boolean }) {
  const top = useSharedValue(-0.1);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (active) {
      opacity.value = withTiming(1, { duration: 200 });
      top.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1750, easing: Easing.linear }),
          withTiming(-0.1, { duration: 0 }), // snap back to start before the next sweep
        ),
        -1,
        false,
      );
    } else {
      opacity.value = withTiming(0, { duration: 150 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    top: `${top.value * 100}%`,
  }));

  return <Animated.View pointerEvents="none" style={[styles.sweepLine, animatedStyle]} />;
}

export function ScanFrame({
  state,
  insetX = 0.09,
  insetY = 0.14,
  idleLabel = 'Align in frame',
  scanningLabel = 'Reading…',
  successLabel = 'Captured',
  successSubLabel,
  errorLabel = "Couldn't read that",
  errorSubLabel,
}: {
  state: ScanFrameState;
  insetX?: number;
  insetY?: number;
  idleLabel?: string;
  scanningLabel?: string;
  successLabel?: string;
  successSubLabel?: string;
  errorLabel?: string;
  errorSubLabel?: string;
}) {
  const active = state === 'scanning';
  const done = state === 'success';
  const failed = state === 'error';
  const accentColor = done ? Colors.success : failed ? Colors.warning : Colors.costcoRed;
  const dimOpacity = active ? 0.7 : done || failed ? 0.55 : 0.32;

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.dim, { flex: insetY, opacity: dimOpacity }]} />
      <View style={{ flex: 1 - insetY * 2, flexDirection: 'row' }}>
        <View style={[styles.dim, { flex: insetX, opacity: dimOpacity }]} />
        <Wobble trigger={failed ? 1 : 0} style={styles.window}>
          {CORNER_POSITIONS.map((pos) => (
            <Corner key={pos.key} pos={pos} active={active} color={accentColor} />
          ))}
          <View
            style={[
              styles.guide,
              { borderColor: `${accentColor}55` },
              failed && styles.guideDashed,
            ]}
          />
          <SweepLine active={active} />

          {done && (
            <View style={styles.centerContent}>
              <View style={styles.successIconWrap}>
                <RingOut color={Colors.success} />
                <RingOut color={Colors.success} delay={220} />
                <ConfettiBurst count={12} distance={54} />
                <StampBounceIn style={styles.successStamp}>
                  <DrawnCheck size={32} color={Colors.white} delay={420} />
                </StampBounceIn>
              </View>
              <Text style={styles.centerTitle}>{successLabel}</Text>
              {successSubLabel && <Text style={styles.centerSub}>{successSubLabel}</Text>}
            </View>
          )}

          {failed && (
            <View style={styles.centerContent}>
              <View style={styles.errorIconWrap}>
                <Text style={styles.errorIcon}>!</Text>
              </View>
              <Text style={styles.centerTitle}>{errorLabel}</Text>
              {errorSubLabel && <Text style={styles.centerSub}>{errorSubLabel}</Text>}
            </View>
          )}
        </Wobble>
        <View style={[styles.dim, { flex: insetX, opacity: dimOpacity }]} />
      </View>
      <View style={[styles.dim, { flex: insetY, opacity: dimOpacity }]} />

      <View style={styles.pillRow}>
        <View style={[styles.pill, done && styles.pillSuccess, failed && styles.pillError]}>
          <Text style={styles.pillText}>
            {done ? 'Done' : failed ? 'Scan failed' : active ? scanningLabel : idleLabel}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: Colors.black },
  window: { flex: 1 },
  corner: { position: 'absolute', width: 36, height: 36 },
  guide: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  guideDashed: { borderStyle: 'dashed' },
  sweepLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: Colors.costcoRed,
    shadowColor: Colors.costcoRed,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  confettiPiece: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 4,
    height: 8,
    marginLeft: -2,
    marginTop: -4,
    borderRadius: 2,
  },
  centerContent: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  } as ViewStyle,
  successIconWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  successStamp: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: Colors.successSolid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    borderWidth: 2,
    borderRadius: radius.pill,
  },
  errorIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(212,132,42,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  errorIcon: { fontSize: 28, color: Colors.warning, fontWeight: '800' },
  centerTitle: {
    color: Colors.white,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
  },
  centerSub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: fontSize.sm,
    textAlign: 'center',
    paddingHorizontal: spacing['2xl'],
  },
  pillRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing['2xl'],
    alignItems: 'center',
  },
  pill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  pillSuccess: { backgroundColor: 'rgba(45,138,110,0.9)' },
  pillError: { backgroundColor: 'rgba(212,132,42,0.9)' },
  pillText: {
    color: Colors.white,
    fontSize: fontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
