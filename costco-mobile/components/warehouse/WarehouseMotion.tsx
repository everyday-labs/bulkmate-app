import { useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { duration } from '../../constants/theme.warehouse';
import { easeSmooth, springConfig, springConfigSoft, staggerDelay, timing } from '../../constants/motion.warehouse';

// ── Motion components for the "Warehouse Red & Cream" design system ─────────
// Implements the micro-interactions from costco-companion-app-design-system-
// animation-plan-2026-08-04.md ("Motion System" section) using Reanimated.
// Parallel/opt-in — not wired into any existing screen.

// ── Entrance: fade + slide up, with stagger index ────────────────────────────
export function FadeUpView({
  index = 0,
  style,
  children,
}: {
  index?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(12);

  useEffect(() => {
    const delay = staggerDelay(index);
    opacity.value = withDelay(delay, withTiming(1, timing.normal));
    translateY.value = withDelay(delay, withTiming(0, timing.normal));
  }, [index, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// ── Interactive press scale — wraps any Pressable content ───────────────────
export function PressScale({
  style,
  children,
  ...pressableProps
}: Omit<PressableProps, 'children'> & { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      {...pressableProps}
      onPressIn={(e) => {
        scale.value = withTiming(0.96, { duration: duration.fast, easing: easeSmooth });
        pressableProps.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, { duration: duration.fast, easing: easeSmooth });
        pressableProps.onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>
    </Pressable>
  );
}

// ── Star earn: scale up, slight rotate, land with a tiny shake ──────────────
export function StarPop({
  trigger,
  style,
  children,
}: {
  trigger: number; // increment this value each time a star should pop
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);
  const translateX = useSharedValue(0);

  useEffect(() => {
    if (trigger === 0) return;
    scale.value = withSequence(
      withTiming(0.8, { duration: 0 }),
      withSpring(1.15, springConfig),
      withSpring(1, springConfig),
    );
    rotate.value = withSequence(
      withTiming(-8, { duration: duration.fast, easing: easeSmooth }),
      withTiming(6, { duration: duration.fast, easing: easeSmooth }),
      withTiming(0, { duration: duration.fast, easing: easeSmooth }),
    );
    // Tiny landing shake
    translateX.value = withDelay(
      duration.fast * 2,
      withSequence(
        withTiming(-3, { duration: 40 }),
        withTiming(3, { duration: 40 }),
        withTiming(-2, { duration: 40 }),
        withTiming(0, { duration: 40 }),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { rotate: `${rotate.value}deg` },
      { translateX: translateX.value },
    ],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// ── Scan button: soft pulse while active ─────────────────────────────────────
export function ScanPulse({
  active,
  style,
  children,
}: {
  active: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    if (active) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.03, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.85, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
      );
    } else {
      cancelAnimation(scale);
      cancelAnimation(opacity);
      scale.value = withTiming(1, timing.fast);
      opacity.value = withTiming(1, timing.fast);
    }
  }, [active, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// ── Scan success: checkmark burst (pop in from 0) ────────────────────────────
export function CheckmarkBurst({
  visible,
  style,
  children,
}: {
  visible: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      scale.value = withSequence(withTiming(0.8, { duration: 0 }), withSpring(1, springConfig));
      opacity.value = withTiming(1, timing.fast);
    } else {
      scale.value = 0.6;
      opacity.value = 0;
    }
  }, [visible, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// ── Price alert: bounce in ───────────────────────────────────────────────────
export function AlertBounceIn({
  style,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(0.5);
  const opacity = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(1, springConfig);
    opacity.value = withTiming(1, timing.fast);
  }, [scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// ── Tier up: badge scales in + lightweight radiating particle burst ─────────
const PARTICLE_COUNT = 10;
const PARTICLE_COLORS = ['#d1373a', '#c9a84c', '#1b2a4a', '#2d8a6e'];

function Particle({ angle, active }: { angle: number; active: boolean }) {
  const progress = useSharedValue(0);
  const color = PARTICLE_COLORS[angle % PARTICLE_COLORS.length];

  useEffect(() => {
    if (active) {
      progress.value = 0;
      progress.value = withTiming(1, { duration: duration.celebrate, easing: easeSmooth });
    }
  }, [active, progress]);

  const distance = 70;
  const rad = (angle * Math.PI) / 180;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: Math.cos(rad) * distance * progress.value },
      { translateY: Math.sin(rad) * distance * progress.value },
      { scale: 1 - progress.value * 0.4 },
    ],
  }));

  return (
    <Animated.View
      style={[styles.particle, { backgroundColor: color }, animatedStyle]}
      pointerEvents="none"
    />
  );
}

export function TierUpBurst({
  visible,
  style,
  children,
}: {
  visible: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(0.3);
  const opacity = useSharedValue(0);
  const particleAngles = useMemo(
    () => Array.from({ length: PARTICLE_COUNT }, (_, i) => (360 / PARTICLE_COUNT) * i),
    [],
  );

  useEffect(() => {
    if (visible) {
      scale.value = withSequence(
        withTiming(0.3, { duration: 0 }),
        withSpring(1, springConfigSoft),
      );
      opacity.value = withTiming(1, timing.normal);
    } else {
      scale.value = 0.3;
      opacity.value = 0;
    }
  }, [visible, scale, opacity]);

  const badgeStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={[styles.burstContainer, style]} pointerEvents="box-none">
      <View style={styles.particleOrigin} pointerEvents="none">
        {particleAngles.map((angle) => (
          <Particle key={angle} angle={angle} active={visible} />
        ))}
      </View>
      <Animated.View style={badgeStyle}>{children}</Animated.View>
    </View>
  );
}

// ── Empty-state / illustration float loop ────────────────────────────────────
export function FloatView({ style, children }: { style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
    return () => cancelAnimation(translateY);
  }, [translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  particle: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  burstContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  particleOrigin: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
