/**
 * MCH VoiceCare design tokens — one documented design system across web and
 * mobile (UX-001). Palette derived from the approved brand assets.
 *
 * UX-002: urgency colours must always be paired with a text label and icon;
 * never communicate risk by colour alone.
 */
export const brand = {
  navy: '#0A1B33',
  teal: '#1E9AA8',
  green: '#54B45F',
  coral: '#F0806C',
} as const;

export const urgency = {
  RED: '#DC2626',
  ORANGE: '#EA580C',
  AMBER: '#D97706',
  GREEN: '#16A34A',
  GREY: '#6B7280',
} as const;

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  primary: string;
  accent: string;
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
};
