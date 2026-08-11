/**
 * Screen — the outermost wrapper for every screen.
 *
 * Provides the themed background, safe-area insets and consistent gutters so
 * individual screens stop re-declaring `styles.container`.
 *
 *   <Screen scroll>
 *     <SectionHeader title="Referrals" />
 *     ...
 *   </Screen>
 */
import React from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {SafeAreaView, type Edge} from 'react-native-safe-area-context';

import {useTheme} from '../../theme/useTheme';
import {space} from '../../theme/tokens';

export interface ScreenProps {
  children: React.ReactNode;
  /** Wrap content in a ScrollView. */
  scroll?: boolean;
  /** Apply horizontal gutters. Defaults to true. */
  padded?: boolean;
  /** Safe-area edges to respect. Defaults to top + bottom. */
  edges?: readonly Edge[];
  /** Pull-to-refresh — only applies when `scroll` is set. */
  refreshing?: boolean;
  onRefresh?: () => void;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  /** Rendered outside the scroll area, pinned to the bottom. */
  footer?: React.ReactNode;
}

export function Screen({
  children,
  scroll = false,
  padded = true,
  edges = ['top', 'bottom'],
  refreshing,
  onRefresh,
  style,
  contentStyle,
  footer,
}: ScreenProps) {
  const {colors} = useTheme();

  const gutters = padded ? {paddingHorizontal: space[4]} : null;

  const body = scroll ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.scrollContent, gutters, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={!!refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        ) : undefined
      }>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, gutters, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView
      edges={edges}
      style={[styles.flex, {backgroundColor: colors.background}, style]}>
      {body}
      {footer ? (
        <View
          style={[
            styles.footer,
            gutters,
            {backgroundColor: colors.surface, borderTopColor: colors.border},
          ]}>
          {footer}
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  scrollContent: {
    paddingTop: space[4],
    paddingBottom: space[8],
  },
  footer: {
    borderTopWidth: 1,
    paddingTop: space[3],
    paddingBottom: space[3],
  },
});

export default Screen;
