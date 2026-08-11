/**
 * Card — the primary content surface.
 *
 * Soft navy-tinted elevation plus a hairline border reads cleaner than a
 * heavy shadow alone, which is what gives the calm/premium impression.
 *
 * Pass `onPress` to make it tappable; it then gets a pressed transform.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {useTheme} from '../../theme/useTheme';
import {elevation, pressedStyle, radius, space} from '../../theme/tokens';

export interface CardProps {
  children: React.ReactNode;
  /** Visual weight. `flat` has no shadow — use inside already-elevated areas. */
  variant?: 'elevated' | 'flat' | 'outlined';
  /** Internal padding step. Defaults to 4 (16px). */
  padding?: keyof typeof space;
  /** Accent stripe along the top edge — used for urgency grouping. */
  accentColor?: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export function Card({
  children,
  variant = 'elevated',
  padding = 4,
  accentColor,
  onPress,
  disabled,
  style,
  accessibilityLabel,
}: CardProps) {
  const {colors} = useTheme();

  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: space[padding],
    borderWidth: 1,
    borderColor: variant === 'outlined' ? colors.borderStrong : colors.border,
    ...(variant === 'elevated' ? elevation.md : elevation.none),
    ...(accentColor
      ? {borderTopWidth: 3, borderTopColor: accentColor}
      : null),
  };

  if (!onPress) {
    return <View style={[base, style]}>{children}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{disabled: !!disabled}}
      style={({pressed}) => [
        base,
        pressed && pressedStyle,
        disabled && styles.disabled,
        style,
      ]}>
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  disabled: {opacity: 0.55},
});

export default Card;
