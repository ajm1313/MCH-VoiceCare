/**
 * MCH VoiceCare design tokens — one documented design system across web and
 * mobile (UX-001). Palette derived from the approved brand assets.
 *
 * UX-002: urgency colours must always be paired with a text label and icon;
 * never communicate risk by colour alone. Use `urgencyMeta` (below) or the
 * `UrgencyBadge` component rather than applying `urgency[...]` directly.
 */
export const brand = {
  navy: '#0A1B33',
  teal: '#1E9AA8',
  green: '#54B45F',
  coral: '#F0806C',
} as const;

/** Deeper/lighter brand steps for gradients, hover and pressed states. */
export const brandScale = {
  navy900: '#050E1C',
  navy800: '#0A1B33',
  navy700: '#102845',
  navy600: '#17375C',
  teal700: '#14707B',
  teal600: '#1A8792',
  teal500: '#1E9AA8',
  teal400: '#41B3BF',
  teal300: '#8FD6DE',
  teal100: '#E2F4F6',
  teal50: '#F1FAFB',
} as const;

/**
 * Urgency palette. Keys are the offline urgency classes used by the rule
 * engine (§12). Do not rename — screens index this map directly.
 */
export const urgency = {
  RED: '#DC2626',
  ORANGE: '#EA580C',
  AMBER: '#D97706',
  GREEN: '#16A34A',
  GREY: '#6B7280',
} as const;

export type UrgencyKey = keyof typeof urgency;

/**
 * Tonal sets for urgency surfaces: a subtle fill, a matching border and an
 * accessible foreground. Using these instead of raw `urgency[...]` + alpha
 * suffixes keeps contrast predictable in both themes.
 */
export const urgencyTone: Record<
  UrgencyKey,
  {fg: string; bg: string; border: string; solid: string; onSolid: string}
> = {
  RED: {fg: '#991B1B', bg: '#FEF2F2', border: '#FECACA', solid: urgency.RED, onSolid: '#FFFFFF'},
  ORANGE: {fg: '#9A3412', bg: '#FFF7ED', border: '#FED7AA', solid: urgency.ORANGE, onSolid: '#FFFFFF'},
  AMBER: {fg: '#92400E', bg: '#FFFBEB', border: '#FDE68A', solid: urgency.AMBER, onSolid: '#FFFFFF'},
  GREEN: {fg: '#166534', bg: '#F0FDF4', border: '#BBF7D0', solid: urgency.GREEN, onSolid: '#FFFFFF'},
  GREY: {fg: '#374151', bg: '#F3F4F6', border: '#E5E7EB', solid: urgency.GREY, onSolid: '#FFFFFF'},
};

/**
 * UX-002 enforcement: every urgency value carries a text label and an icon
 * name so risk is never communicated by colour alone. `icon` values map to
 * keys in `components/ui/Icon.tsx`.
 *
 * GREY means "data missing / not assessed" — it MUST NOT read as routine
 * or safe (spec §3.1: ABSTAIN must not silently produce a routine result).
 */
export const urgencyMeta: Record<
  UrgencyKey,
  {label: string; shortLabel: string; icon: string; action: string}
> = {
  RED: {label: 'Emergency', shortLabel: 'RED', icon: 'alertOctagon', action: 'Immediate action'},
  ORANGE: {label: 'Same day', shortLabel: 'ORANGE', icon: 'alertTriangle', action: 'Urgent today'},
  AMBER: {label: 'High risk', shortLabel: 'AMBER', icon: 'alertCircle', action: 'Enhanced follow-up'},
  GREEN: {label: 'Routine', shortLabel: 'GREEN', icon: 'checkCircle', action: 'Routine care'},
  GREY: {label: 'Data missing', shortLabel: 'GREY', icon: 'helpCircle', action: 'Assessment needed'},
};

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  primary: string;
  accent: string;
  /** Recessed areas — input fills, table headers, inset panels. */
  surfaceSunken: string;
  /** De-emphasised metadata, timestamps, helper text. */
  textTertiary: string;
  /** Text placed on top of `primary`. */
  onPrimary: string;
  /** Stronger divider for structural separation. */
  borderStrong: string;
  /** Pressed/active step of `primary`. */
  primaryStrong: string;
  /** Tinted wash of `primary` for selected rows and soft badges. */
  primarySubtle: string;
  /** Scrim behind modals and camera overlays. */
  overlay: string;
  /** Focus ring for keyboard/accessibility focus. */
  focus: string;
  danger: string;
  dangerSubtle: string;
  warning: string;
  warningSubtle: string;
  success: string;
  successSubtle: string;
  info: string;
  infoSubtle: string;
}

export const lightColors: ThemeColors = {
  background: '#F6F9FB',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  border: '#E2E8F0',
  primary: brand.teal,
  accent: brand.green,
  surfaceSunken: '#F8FAFC',
  textTertiary: '#94A3B8',
  onPrimary: '#FFFFFF',
  borderStrong: '#CBD5E1',
  primaryStrong: brandScale.teal700,
  primarySubtle: brandScale.teal100,
  overlay: 'rgba(10, 27, 51, 0.55)',
  focus: brandScale.teal400,
  danger: urgency.RED,
  dangerSubtle: '#FEF2F2',
  warning: urgency.AMBER,
  warningSubtle: '#FFFBEB',
  success: urgency.GREEN,
  successSubtle: '#F0FDF4',
  info: '#2563EB',
  infoSubtle: '#EFF6FF',
};

export const darkColors: ThemeColors = {
  background: brand.navy,
  surface: '#10233F',
  surfaceElevated: '#162C4C',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  border: '#1E3355',
  primary: brand.teal,
  accent: brand.green,
  surfaceSunken: '#0C1C33',
  textTertiary: '#64748B',
  onPrimary: '#FFFFFF',
  borderStrong: '#2A4570',
  primaryStrong: brandScale.teal400,
  primarySubtle: 'rgba(30, 154, 168, 0.16)',
  overlay: 'rgba(5, 14, 28, 0.72)',
  focus: brandScale.teal300,
  danger: '#F87171',
  dangerSubtle: 'rgba(220, 38, 38, 0.16)',
  warning: '#FBBF24',
  warningSubtle: 'rgba(217, 119, 6, 0.16)',
  success: '#4ADE80',
  successSubtle: 'rgba(22, 163, 74, 0.16)',
  info: '#60A5FA',
  infoSubtle: 'rgba(37, 99, 235, 0.16)',
};

/**
 * Dark-theme urgency tones. Solid colours stay identical to preserve the
 * clinical meaning of each class; only the surrounding fills change.
 */
export const urgencyToneDark: typeof urgencyTone = {
  RED: {fg: '#FCA5A5', bg: 'rgba(220, 38, 38, 0.18)', border: 'rgba(220, 38, 38, 0.42)', solid: urgency.RED, onSolid: '#FFFFFF'},
  ORANGE: {fg: '#FDBA74', bg: 'rgba(234, 88, 12, 0.18)', border: 'rgba(234, 88, 12, 0.42)', solid: urgency.ORANGE, onSolid: '#FFFFFF'},
  AMBER: {fg: '#FCD34D', bg: 'rgba(217, 119, 6, 0.18)', border: 'rgba(217, 119, 6, 0.42)', solid: urgency.AMBER, onSolid: '#FFFFFF'},
  GREEN: {fg: '#86EFAC', bg: 'rgba(22, 163, 74, 0.18)', border: 'rgba(22, 163, 74, 0.42)', solid: urgency.GREEN, onSolid: '#FFFFFF'},
  GREY: {fg: '#CBD5E1', bg: 'rgba(107, 114, 128, 0.20)', border: 'rgba(107, 114, 128, 0.44)', solid: urgency.GREY, onSolid: '#FFFFFF'},
};

/** Resolve the urgency tone set for the active theme. */
export function getUrgencyTone(key: UrgencyKey, isDark = false) {
  return (isDark ? urgencyToneDark : urgencyTone)[key] ?? (isDark ? urgencyToneDark : urgencyTone).GREY;
}

/** Normalise an arbitrary string to a known urgency key, defaulting to GREY. */
export function toUrgencyKey(value: string | null | undefined): UrgencyKey {
  const upper = (value ?? '').toUpperCase();
  return (upper in urgency ? upper : 'GREY') as UrgencyKey;
}
