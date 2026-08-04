import { Easing } from 'react-native-reanimated';
import { duration } from './theme.warehouse';

// ── Motion primitives for the "Warehouse Red & Cream" design system ─────────
// Ports the easing/keyframe intent from styles.css (@utility animate-*) to
// react-native-reanimated. Not wired into any screen yet — import explicitly.
//
// styles.css defines two curves:
//   --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)  → bouncy moments (stars, badges)
//   --ease-smooth: cubic-bezier(0.4, 0, 0.2, 1)        → UI transitions
//
// Reanimated springs are physics-driven rather than bezier-driven, so
// `springConfig` below is tuned to produce a comparable overshoot-then-settle
// feel rather than replaying the exact bezier curve.

export const easeSmooth = Easing.bezier(0.4, 0, 0.2, 1);

// Comparable overshoot to cubic-bezier(0.34, 1.56, 0.64, 1) for withSpring().
export const springConfig = {
  damping: 12,
  mass: 0.7,
  stiffness: 180,
  overshootClamping: false,
} as const;

// Gentler spring for larger/heavier elements (tier-up badge, full tiles).
export const springConfigSoft = {
  damping: 14,
  mass: 1,
  stiffness: 140,
  overshootClamping: false,
} as const;

export const timing = {
  instant: { duration: duration.instant, easing: easeSmooth },
  fast: { duration: duration.fast, easing: easeSmooth },
  normal: { duration: duration.normal, easing: easeSmooth },
  slow: { duration: duration.slow, easing: easeSmooth },
  celebrate: { duration: duration.celebrate, easing: easeSmooth },
} as const;

// Stagger delays for dashboard entrance — mirrors delay-100..500 utilities.
export const staggerDelay = (index: number, stepMs = 100) => index * stepMs;
