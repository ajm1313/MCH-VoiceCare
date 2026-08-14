/**
 * Field — labelled text input with focus ring, helper text and error state.
 *
 * Clinical data entry is the highest-traffic interaction in the app, so the
 * field has a clear label, a visible focus state and an explicit error slot
 * rather than relying on colour alone.
 *
 * Focus state is managed via setNativeProps to avoid re-rendering the
 * TextInput during focus changes. This prevents Fabric's async rendering
 * from re-laying-out the TextInput, which causes the keyboard to blink
 * and disappear on Android physical devices.
 */
import React, {useRef} from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import {useTheme} from '../../theme/useTheme';
import {MIN_TOUCH, HIT_SLOP, border, radius, space, type as typeScale} from '../../theme/tokens';
import {Icon, type IconName} from './Icon';
import {AppText} from './Text';

export interface FieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  /** Error message — when set, the field renders in its error state. */
  error?: string | null;
  /** Helper text shown below the field when there is no error. */
  helper?: string;
  /** Icon rendered inside the field, before the input. */
  icon?: IconName;
  /** Marks the field as required for the current workflow (spec §11). */
  required?: boolean;
  /** Trailing pressable (e.g. show/hide password). */
  trailing?: {icon?: IconName; label?: string; onPress: () => void; accessibilityLabel?: string};
  containerStyle?: StyleProp<ViewStyle>;
}

export function Field({
  label,
  error,
  helper,
  icon,
  required,
  trailing,
  containerStyle,
  editable = true,
  ...inputProps
}: FieldProps) {
  const {colors} = useTheme();
  const inputRowRef = useRef<View>(null);

  const borderColor = error ? colors.danger : colors.border;

  const handleFocus = (e: any) => {
    if (!error && inputRowRef.current) {
      try {
        inputRowRef.current.setNativeProps({
          borderColor: colors.primary,
        });
      } catch {}
    }
    inputProps.onFocus?.(e);
  };

  const handleBlur = (e: any) => {
    if (!error && inputRowRef.current) {
      try {
        inputRowRef.current.setNativeProps({
          borderColor: colors.border,
        });
      } catch {}
    }
    inputProps.onBlur?.(e);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {label ? (
        <View style={styles.labelRow}>
          <AppText variant="smallStrong" tone="secondary">
            {label}
          </AppText>
          {required ? (
            <AppText variant="smallStrong" tone="danger" accessibilityLabel="required">
              *
            </AppText>
          ) : null}
        </View>
      ) : null}

      <View
        ref={inputRowRef}
        style={[
          styles.inputRow,
          {
            borderColor,
            borderWidth: border.thick,
            backgroundColor: editable ? colors.surfaceSunken : colors.background,
          },
        ]}>
        {icon ? (
          <View style={styles.leadingIcon}>
            <Icon name={icon} size={18} color={colors.textTertiary} />
          </View>
        ) : null}

        <TextInput
          {...inputProps}
          editable={editable}
          importantForAccessibility="yes"
          blurOnSubmit={false}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholderTextColor={colors.textTertiary}
          style={[styles.input, typeScale.bodyLg, {color: colors.textPrimary}]}
        />

        {trailing ? (
          <Pressable
            onPress={trailing.onPress}
            hitSlop={HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel={trailing.accessibilityLabel ?? trailing.label}
            style={styles.trailing}>
            {trailing.icon ? (
              <Icon name={trailing.icon} size={18} color={colors.primary} />
            ) : (
              <AppText variant="smallStrong" tone="brand">
                {trailing.label}
              </AppText>
            )}
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <View style={styles.messageRow}>
          <Icon name="alertCircle" size={14} color={colors.danger} />
          <AppText variant="caption" tone="danger" style={styles.messageText}>
            {error}
          </AppText>
        </View>
      ) : helper ? (
        <AppText variant="caption" tone="tertiary" style={styles.helper}>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {marginBottom: space[4]},
  labelRow: {flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: space[2]},
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    minHeight: MIN_TOUCH,
  },
  leadingIcon: {paddingLeft: space[3]},
  input: {
    flex: 1,
    paddingHorizontal: space[3],
    paddingVertical: space[3],
  },
  trailing: {paddingHorizontal: space[3], paddingVertical: space[2]},
  messageRow: {flexDirection: 'row', alignItems: 'center', gap: space[1], marginTop: space[1]},
  messageText: {flex: 1},
  helper: {marginTop: space[1]},
});

export default Field;
