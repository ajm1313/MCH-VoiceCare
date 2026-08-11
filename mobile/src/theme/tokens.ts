/**
 * MCH VoiceCare design tokens — spacing, radius, typography, elevation, motion.
 *
 * UX-001: one documented design system across web and mobile. These values are
 * mirrored in the web Tailwind theme (backend/tailwind.config.js) so both
 * surfaces render the same visual language.
 *
 * Scale is 4px-based. Prefer these tokens over literal numbers in StyleSheets
 * so spacing and hierarchy stay consistent as screens are added.
 */
import type {TextStyle} from 'react-native';

/** 4px-based spacing scale. `space[4]` === 16px. */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 32,
  8: 40,
  9: 48,
  10: 64,
} as const;

/** Corner radii. `pill` is used for badges and chips. */
export const radius = {
  xs: 6,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
  pill: 999,
} as const;

/**
 * Type scale. Line heights are set for comfortable reading on small,
 * low-DPI procurement devices (spec §7).
 */
export const type = {
  display: {fontSize: 30, lineHeight: 36, fontWeight: '800'},
  h1: {fontSize: 24, lineHeight: 30, fontWeight: '700'},
  h2: {fontSize: 20, lineHeight: 26, fontWeight: '700'},
  h3: {fontSize: 17, lineHeight: 23, fontWeight: '600'},
  bodyLg: {fontSize: 16, lineHeight: 23, fontWeight: '400'},
  body: {fontSize: 15, lineHeight: 21, fontWeight: '400'},
  bodyStrong: {fontSize: 15, lineHeight: 21, fontWeight: '600'},
  small: {fontSize: 13, lineHeight: 18, fontWeight: '400'},
  smallStrong: {fontSize: 13, lineHeight: 18, fontWeight: '600'},
  caption: {fontSize: 12, lineHeight: 16, fontWeight: '500'},
  /** Uppercase section eyebrow — use with `letterSpacing` already applied. */
  overline: {fontSize: 11, lineHeight: 14, fontWeight: '700', letterSpacing: 0.8},
  /** Tabular-ish numerals for metrics. */
  metric: {fontSize: 28, lineHeight: 34, fontWeight: '800'},
} as const satisfies Record<string, TextStyle>;

/**
 * Layered elevation. Shadows are navy-tinted rather than pure black, which
 * reads softer and more premium against the light background.
 */
export const elevation = {
  none: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: {width: 0, height: 0},
    elevation: 0,
  },
  /** Resting surface — list rows, inputs. */
  sm: {
    shadowColor: '#0A1B33',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: {width: 0, height: 2},
    elevation: 1,
  },
  /** Cards and panels. */
  md: {
    shadowColor: '#0A1B33',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 4},
    elevation: 3,
  },
  /** Raised / primary surfaces, sheets. */
  lg: {
    shadowColor: '#0A1B33',
    shadowOpacity: 0.12,
    shadowRadius: 24,
    shadowOffset: {width: 0, height: 8},
    elevation: 6,
  },
  /** Modals and floating actions. */
  xl: {
    shadowColor: '#0A1B33',
    shadowOpacity: 0.16,
    shadowRadius: 32,
    shadowOffset: {width: 0, height: 12},
    elevation: 10,
  },
} as const;

/** Minimum touch target (Android accessibility guidance) — spec §7 devices. */
export const HIT_SLOP = {top: 8, bottom: 8, left: 8, right: 8} as const;
export const MIN_TOUCH = 44;

/** Border widths. */
export const border = {
  hairline: 1,
  thick: 1.5,
  heavy: 2,
} as const;

/** Motion durations (ms) for micro-interactions. */
export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

/** Pressed-state transform shared by all tappable surfaces. */
export const pressedStyle = {
  opacity: 0.9,
  transform: [{scale: 0.985}],
} as const;
