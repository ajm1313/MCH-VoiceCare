/**
 * Reusable search bar and filter chip components for list screens.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {useTheme} from '../theme/useTheme';
import {MIN_TOUCH, border, radius, space, type as typeScale} from '../theme/tokens';
import {Icon} from './ui/Icon';
import {AppText} from './ui/Text';

interface SearchBarProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({value, onChange, placeholder = 'Search...'}: SearchBarProps) {
  const {colors} = useTheme();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.surfaceSunken,
          borderColor: colors.border,
          borderWidth: border.thick,
        },
      ]}>
      <Icon name="search" size={18} color={colors.textTertiary} />
      <TextInput
        style={[styles.input, typeScale.body, {color: colors.textPrimary}]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        allowFontScaling={true}
        maxFontSizeMultiplier={1.5}
        accessibilityLabel="Search input"
        accessibilityHint="Type to search the list"
      />
      {value.length > 0 && (
        <Pressable
          onPress={() => onChange('')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          accessibilityHint="Clears the search text"
          style={styles.clearBtn}>
          <Icon name="close" size={16} color={colors.textTertiary} />
        </Pressable>
      )}
    </View>
  );
}

interface FilterChipsProps {
  options: string[];
  selected: string | null;
  onSelect: (option: string | null) => void;
}

export function FilterChips({options, selected, onSelect}: FilterChipsProps) {
  const {colors} = useTheme();

  const chip = (label: string, value: string | null) => {
    const active = selected === value;
    return (
      <Pressable
        key={label}
        onPress={() => onSelect(selected === value ? null : value)}
        style={({pressed}) => [
          styles.chip,
          {
            backgroundColor: active ? colors.primary : 'transparent',
            borderColor: active ? colors.primary : colors.border,
          },
          pressed && styles.chipPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={`Filter by ${label}`}
        accessibilityState={{selected: active}}>
        <AppText
          variant="smallStrong"
          tone="inherit"
          style={{color: active ? colors.onPrimary : colors.textSecondary}}>
          {label}
        </AppText>
      </Pressable>
    );
  };

  return (
    <View style={styles.chipRow}>
      {chip('All', null)}
      {options.map(opt => chip(opt, opt))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    marginHorizontal: space[4],
    marginVertical: space[2],
    minHeight: MIN_TOUCH,
  },
  input: {flex: 1, paddingVertical: space[3], minHeight: MIN_TOUCH},
  clearBtn: {padding: space[2], minHeight: MIN_TOUCH, minWidth: MIN_TOUCH, alignItems: 'center', justifyContent: 'center'},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: space[2], paddingHorizontal: space[4], marginBottom: space[2]},
  chip: {
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.pill,
    borderWidth: border.thick,
    minHeight: MIN_TOUCH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipPressed: {opacity: 0.8, transform: [{scale: 0.97}]},
});
