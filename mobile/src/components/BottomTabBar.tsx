/**
 * Bottom tab bar for quick navigation between main modules.
 * Shown on Dashboard and primary list screens.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors, brand} from '../theme/colors';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TABS: {route: keyof RootStackParamList; label: string; icon: string; hint: string}[] = [
  {route: 'Dashboard', label: 'Home', icon: '🏠', hint: 'Go to dashboard'},
  {route: 'PregnancyList', label: 'Pregnancy', icon: '🤰', hint: 'View pregnancy list'},
  {route: 'NewbornList', label: 'Newborn', icon: '👶', hint: 'View newborn list'},
  {route: 'ImmunisationList', label: 'Immunise', icon: '💉', hint: 'View immunisation list'},
  {route: 'TaskList', label: 'Tasks', icon: '📋', hint: 'View task list'},
];

export function BottomTabBar({activeRoute}: {activeRoute: string}) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();

  return (
    <View style={[styles.container, {backgroundColor: colors.surface, borderTopColor: colors.border}]}>
      {TABS.map(tab => {
        const active = activeRoute === tab.route;
        return (
          <Pressable
            key={tab.route}
            style={styles.tab}
            onPress={() => navigation.navigate(tab.route as any)}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            accessibilityHint={tab.hint}
            accessibilityState={{selected: active}}
            hitSlop={{top: 4, bottom: 4, left: 0, right: 0}}>
            <Text style={[styles.icon, {opacity: active ? 1 : 0.5}]} allowFontScaling={true} maxFontSizeMultiplier={1.5}>{tab.icon}</Text>
            <Text style={[
              styles.label,
              {color: active ? brand.teal : colors.textSecondary, fontWeight: active ? '700' : '500'},
            ]} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
              {tab.label}
            </Text>
            {active && <View style={[styles.indicator, {backgroundColor: brand.teal}]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingBottom: 4,
    paddingTop: 6,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: -2},
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 3,
  },
  tab: {flex: 1, alignItems: 'center', paddingVertical: 8, minHeight: 48, position: 'relative'},
  icon: {fontSize: 20, marginBottom: 2},
  label: {fontSize: 9},
  indicator: {position: 'absolute', top: 0, width: 24, height: 3, borderRadius: 2},
});
