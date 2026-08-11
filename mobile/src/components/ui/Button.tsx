/**
 * Button — primary interactive primitive.
 *
 * Variants: primary | secondary | ghost | danger
 * Sizes:    sm | md | lg
 *
 * Touch targets meet the 44px minimum for the low-end procurement devices in
 * spec §7. Loading state swaps the label for a spinner but preserves width so
 * the layout does not jump.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import {useTheme} from '../../theme/useTheme';
import {MIN_TOUCH, border, elevation, pressedStyle, radius, space, type as typeScale} from '../../theme/tokens';
import {Icon, type IconName} from './Icon';
import {AppText} from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Icon rendered before the label. */
  icon?: IconName;
  /** Icon rendered after the label. */
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  /** Stretch to fill the parent width. */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

const SIZES: Record<ButtonSize, {paddingV: number; paddingH: number; text: TextStyle; icon: number}> = {
  sm: {paddingV: space[2], paddingH: space[3], text: typeScale.smallStrong as TextStyle, icon: 16},
  md: {paddingV: space[3], paddingH: space[4], text: typeScale.bodyStrong as TextStyle, icon: 18},
  lg: {paddingV: space[4], paddingH: space[5], text: typeScale.bodyLg as TextStyle, icon: 20},
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const {colors} = useTheme();
  const dims = SIZES[size];
  const isDisabled = disabled || loading;

  const palette: Record<ButtonVariant, {bg: string; fg: string; border: string; shadow: object}> = {
    primary: {
      bg: colors.primary,
      fg: colors.onPrimary,
      border: colors.primary,
      shadow: {...elevation.sm, shadowColor: colors.primary, shadowOpacity: 0.28, shadowRadius: 10},
    },
    secondary: {
      bg: colors.primarySubtle,
      fg: colors.primaryStrong,
      border: colors.primary,
      shadow: elevation.none,
    },
    ghost: {
      bg: 'transparent',
      fg: colors.textSecondary,
      border: 'transparent',
      shadow: elevation.none,
    },
    danger: {
      bg: colors.danger,
      fg: '#FFFFFF',
      border: colors.danger,
      shadow: {...elevation.sm, shadowColor: colors.danger, shadowOpacity: 0.28, shadowRadius: 10},
    },
  };

  const tone = palette[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{disabled: isDisabled, busy: loading}}
      style={({pressed}) => [
        styles.base,
        {
          backgroundColor: tone.bg,
          borderColor: tone.border,
          borderWidth: variant === 'secondary' ? border.thick : variant === 'ghost' ? 0 : 1,
          paddingVertical: dims.paddingV,
          paddingHorizontal: dims.paddingH,
        },
        tone.shadow,
        fullWidth && styles.fullWidth,
        pressed && pressedStyle,
        isDisabled && styles.disabled,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator size="small" color={tone.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={dims.icon} color={tone.fg} /> : null}
          <AppText tone="inherit" style={[dims.text, {color: tone.fg}]}>
            {label}
          </AppText>
          {iconRight ? <Icon name={iconRight} size={dims.icon} color={tone.fg} /> : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: MIN_TOUCH,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
  },
  fullWidth: {alignSelf: 'stretch', width: '100%'},
  disabled: {opacity: 0.5},
});

export default Button;
