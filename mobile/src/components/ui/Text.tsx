/**
 * AppText — typography primitive bound to the type scale (UX-001).
 *
 * Using variants instead of ad-hoc fontSize/fontWeight keeps hierarchy
 * consistent across all screens.
 *
 *   <AppText variant="h2">Active pregnancies</AppText>
 *   <AppText variant="small" tone="secondary">Updated 2m ago</AppText>
 */
import React from 'react';
import {Text as RNText, StyleSheet, type TextProps as RNTextProps, type TextStyle} from 'react-native';

import {useTheme} from '../../theme/useTheme';
import {type as typeScale} from '../../theme/tokens';

export type TextVariant = keyof typeof typeScale;
export type TextTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'brand'
  | 'danger'
  | 'warning'
  | 'success'
  | 'info'
  | 'onPrimary'
  | 'inherit';

export interface AppTextProps extends RNTextProps {
  variant?: TextVariant;
  tone?: TextTone;
  /** Renders the text uppercase — pairs with the `overline` variant. */
  uppercase?: boolean;
  /** Centre-align shorthand. */
  center?: boolean;
}

export function AppText({
  variant = 'body',
  tone = 'primary',
  uppercase = false,
  center = false,
  style,
  ...rest
}: AppTextProps) {
  const {colors} = useTheme();

  const toneColor: Record<Exclude<TextTone, 'inherit'>, string> = {
    primary: colors.textPrimary,
    secondary: colors.textSecondary,
    tertiary: colors.textTertiary,
    brand: colors.primary,
    danger: colors.danger,
    warning: colors.warning,
    success: colors.success,
    info: colors.info,
    onPrimary: colors.onPrimary,
  };

  const resolved: TextStyle = {
    ...(typeScale[variant] as TextStyle),
    ...(tone !== 'inherit' ? {color: toneColor[tone]} : null),
    ...(uppercase ? {textTransform: 'uppercase'} : null),
    ...(center ? {textAlign: 'center'} : null),
  };

  return <RNText {...rest} style={[resolved, style]} />;
}

/**
 * Static style helpers for cases where a StyleSheet entry is needed rather
 * than a component (e.g. passing `style` to a third-party component).
 */
export const textStyles = StyleSheet.create(
  Object.fromEntries(
    Object.entries(typeScale).map(([key, value]) => [key, value as TextStyle]),
  ) as Record<TextVariant, TextStyle>,
);

export default AppText;
