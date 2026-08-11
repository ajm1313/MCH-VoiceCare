/**
 * Bottom tab bar for quick navigation between main modules.
 * Shown on Dashboard and primary list screens.
 *
 * UX-001: uses the shared Icon set (Heroicons outline) instead of emoji so the
 * mobile tab bar matches the web sidebar visually.
 */
import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {useTheme} from '../theme/useTheme';
import {elevation, space, type as typeScale} from '../theme/tokens';
import {Icon, type IconName} from './ui/Icon';
import {AppText} from './ui/Text';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TABS: {route: keyof RootStackParamList; label: string; icon: IconName; hint: string}[] = [
  {route: 'Dashboard', label: 'Home', icon: 'home', hint: 'Go to dashboard'},
  {route: 'PregnancyList', label: 'Pregnancy', icon: 'heart', hint: 'View pregnancy list'},
  {route: 'NewbornList', label: 'Newborn', icon: 'baby', hint: 'View newborn list'},
  {route: 'ImmunisationList', label: 'Immunise', icon: 'beaker', hint: 'View immunisation list'},
  {route: 'TaskList', label: 'Tasks', icon: 'clipboard', hint: 'View task list'},
];

export function BottomTabBar({activeRoute}: {activeRoute: string}) {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();

  return (
    <View style={[styles.container, {backgroundColor: colors.surface, borderTopColor: colors.border}, elevation.lg]}>
      {TABS.map(tab => {
        const active = activeRoute === tab.route;
        const tint = active ? colors.primary : colors.textTertiary;
        return (
          <Pressable
            key={tab.route}
            style={({pressed}) => [styles.tab, pressed && styles.pressed]}
            onPress={() => navigation.navigate(tab.route as any)}
            accessibilityRole="button"
            accessibilityLabel={tab.label}
            accessibilityHint={tab.hint}
            accessibilityState={{selected: active}}
            hitSlop={{top: 4, bottom: 4, left: 0, right: 0}}>
            {active && <View style={[styles.indicator, {backgroundColor: colors.primary}]} />}
            <Icon name={tab.icon} size={22} color={tint} strokeWidth={active ? 2 : 1.75} />
            <AppText
              variant="caption"
              tone="inherit"
              style={{color: tint, fontWeight: active ? '700' : '500', marginTop: 2}}>
              {tab.label}
            </AppText>
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
    paddingBottom: space[1],
    paddingTop: space[2],
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: space[2],
    minHeight: 52,
    position: 'relative',
  },
  pressed: {opacity: 0.7, transform: [{scale: 0.96}]},
  indicator: {
    position: 'absolute',
    top: 0,
    width: 24,
    height: 3,
    borderRadius: 2,
  },
});
