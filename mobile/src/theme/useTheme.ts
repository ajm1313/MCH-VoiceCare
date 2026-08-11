/**
 * useTheme — resolves the active colour set from the OS colour scheme.
 *
 * Replaces the pattern repeated across screens:
 *   const isDark = useColorScheme() === 'dark';
 *   const colors = isDark ? darkColors : lightColors;
 */
import {useColorScheme} from 'react-native';

import {darkColors, lightColors, getUrgencyTone, toUrgencyKey, type ThemeColors, type UrgencyKey} from './colors';

export interface Theme {
  isDark: boolean;
  colors: ThemeColors;
  /** Urgency tone set for the active theme (UX-002). */
  urgencyTone: (value: string | null | undefined) => ReturnType<typeof getUrgencyTone>;
  /** Normalise any string to a known urgency key. */
  urgencyKey: (value: string | null | undefined) => UrgencyKey;
}

export function useTheme(): Theme {
  const isDark = useColorScheme() === 'dark';
  const colors = isDark ? darkColors : lightColors;

  return {
    isDark,
    colors,
    urgencyTone: value => getUrgencyTone(toUrgencyKey(value), isDark),
    urgencyKey: toUrgencyKey,
  };
}
