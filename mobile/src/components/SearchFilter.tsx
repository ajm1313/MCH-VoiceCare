/**
 * Reusable search bar and filter chip components for list screens.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import {darkColors, lightColors} from '../theme/colors';

interface SearchBarProps {
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
}

export function SearchBar({value, onChange, placeholder = 'Search...'}: SearchBarProps) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;

  return (
    <View style={[styles.container, {backgroundColor: colors.surface, borderColor: colors.border}]}>
      <Text style={styles.icon} accessibilityRole="text" accessibilityLabel="Search">🔍</Text>
      <TextInput
        style={[styles.input, {color: colors.textPrimary}]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        allowFontScaling={true}
        maxFontSizeMultiplier={1.5}
        accessibilityLabel="Search input"
        accessibilityHint="Type to search the list"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChange('')} hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          accessibilityHint="Clears the search text"
          style={styles.clearBtn}>
          <Text style={[styles.clear, {color: colors.textSecondary}]} allowFontScaling={true} maxFontSizeMultiplier={1.5}>✕</Text>
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
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;

  return (
    <View style={styles.chipRow}>
      <Pressable
        onPress={() => onSelect(null)}
        style={[
          styles.chip,
          {
            backgroundColor: selected === null ? colors.primary : 'transparent',
            borderColor: selected === null ? colors.primary : colors.border,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel="All"
        accessibilityHint="Show all items"
        accessibilityState={{selected: selected === null}}>
        <Text style={[styles.chipText, {color: selected === null ? '#fff' : colors.textSecondary}]} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
          All
        </Text>
      </Pressable>
      {options.map(opt => (
        <Pressable
          key={opt}
          onPress={() => onSelect(selected === opt ? null : opt)}
          style={[
            styles.chip,
            {
              backgroundColor: selected === opt ? colors.primary : 'transparent',
              borderColor: selected === opt ? colors.primary : colors.border,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel={opt}
          accessibilityHint={`Filter by ${opt}`}
          accessibilityState={{selected: selected === opt}}>
          <Text style={[styles.chipText, {color: selected === opt ? '#fff' : colors.textSecondary}]} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
            {opt}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  icon: {fontSize: 16, marginRight: 8},
  input: {flex: 1, paddingVertical: 12, fontSize: 15, minHeight: 44},
  clearBtn: {padding: 8, minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center'},
  clear: {fontSize: 16},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginBottom: 8},
  chip: {paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, minHeight: 44},
  chipText: {fontSize: 12, fontWeight: '600'},
});
