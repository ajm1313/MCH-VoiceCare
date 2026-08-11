/**
 * Layout helpers — SectionHeader, EmptyState, ListRow, StatCard, Divider,
 * KeyValue, LoadingState.
 *
 * These cover the patterns that were previously re-implemented in every screen
 * (headers, empty states, list rows, metric tiles), which is what caused the
 * spacing and typography drift.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import {useTheme} from '../../theme/useTheme';
import {elevation, pressedStyle, radius, space} from '../../theme/tokens';
import {Icon, type IconName} from './Icon';
import {AppText} from './Text';

/* ────────────────────────────── SectionHeader ────────────────────────────── */

export interface SectionHeaderProps {
  title: string;
  /** Small uppercase eyebrow above the title. */
  overline?: string;
  subtitle?: string;
  /** Right-aligned text action. */
  action?: {label: string; onPress: () => void; icon?: IconName};
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({title, overline, subtitle, action, style}: SectionHeaderProps) {
  const {colors} = useTheme();
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.flex}>
        {overline ? (
          <AppText variant="overline" tone="tertiary" uppercase style={styles.overline}>
            {overline}
          </AppText>
        ) : null}
        <AppText variant="h2">{title}</AppText>
        {subtitle ? (
          <AppText variant="small" tone="secondary" style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({pressed}) => [styles.headerAction, pressed && pressedStyle]}>
          <AppText variant="smallStrong" tone="brand">
            {action.label}
          </AppText>
          {action.icon ? <Icon name={action.icon} size={16} color={colors.primary} /> : null}
        </Pressable>
      ) : null}
    </View>
  );
}

/* ──────────────────────────────── EmptyState ─────────────────────────────── */

export interface EmptyStateProps {
  icon?: IconName;
  title: string;
  message?: string;
  action?: {label: string; onPress: () => void};
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({icon = 'fileText', title, message, action, style}: EmptyStateProps) {
  const {colors} = useTheme();
  return (
    <View style={[styles.empty, style]}>
      <View style={[styles.emptyIcon, {backgroundColor: colors.surfaceSunken, borderColor: colors.border}]}>
        <Icon name={icon} size={28} color={colors.textTertiary} />
      </View>
      <AppText variant="h3" center style={styles.emptyTitle}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="small" tone="secondary" center style={styles.emptyMessage}>
          {message}
        </AppText>
      ) : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          style={({pressed}) => [
            styles.emptyAction,
            {borderColor: colors.primary, backgroundColor: colors.primarySubtle},
            pressed && pressedStyle,
          ]}>
          <AppText variant="smallStrong" tone="brand">
            {action.label}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

/* ───────────────────────────────── ListRow ───────────────────────────────── */

export interface ListRowProps {
  title: string;
  subtitle?: string;
  meta?: string;
  /** Leading icon rendered in a tinted tile. */
  icon?: IconName;
  iconColor?: string;
  /** Rendered on the right, before the chevron. */
  trailing?: React.ReactNode;
  onPress?: () => void;
  /** Hide the chevron even when pressable. */
  hideChevron?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function ListRow({
  title,
  subtitle,
  meta,
  icon,
  iconColor,
  trailing,
  onPress,
  hideChevron = false,
  style,
}: ListRowProps) {
  const {colors} = useTheme();

  const content = (
    <>
      {icon ? (
        <View
          style={[
            styles.rowIcon,
            {backgroundColor: colors.primarySubtle, borderColor: colors.border},
          ]}>
          <Icon name={icon} size={18} color={iconColor ?? colors.primary} />
        </View>
      ) : null}

      <View style={styles.flex}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="small" tone="secondary" numberOfLines={1} style={styles.rowSubtitle}>
            {subtitle}
          </AppText>
        ) : null}
        {meta ? (
          <AppText variant="caption" tone="tertiary" numberOfLines={1} style={styles.rowSubtitle}>
            {meta}
          </AppText>
        ) : null}
      </View>

      {trailing}
      {onPress && !hideChevron ? (
        <Icon name="chevronRight" size={18} color={colors.textTertiary} />
      ) : null}
    </>
  );

  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  };

  if (!onPress) {
    return <View style={[styles.row, base, style]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      style={({pressed}) => [styles.row, base, elevation.sm, pressed && pressedStyle, style]}>
      {content}
    </Pressable>
  );
}

/* ──────────────────────────────── StatCard ───────────────────────────────── */

export interface StatCardProps {
  label: string;
  value: string | number;
  /** Supporting line under the value. */
  caption?: string;
  icon?: IconName;
  /** Accent used for the icon tile and the top stripe. */
  accentColor?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function StatCard({
  label,
  value,
  caption,
  icon,
  accentColor,
  onPress,
  style,
}: StatCardProps) {
  const {colors} = useTheme();
  const accent = accentColor ?? colors.primary;

  const content = (
    <>
      <View style={styles.statTop}>
        {icon ? (
          <View style={[styles.statIcon, {backgroundColor: accent + '1A'}]}>
            <Icon name={icon} size={16} color={accent} />
          </View>
        ) : null}
        <AppText variant="caption" tone="secondary" numberOfLines={1} style={styles.flex}>
          {label}
        </AppText>
      </View>
      <AppText variant="metric" style={{color: accent}}>
        {value}
      </AppText>
      {caption ? (
        <AppText variant="caption" tone="tertiary" numberOfLines={1}>
          {caption}
        </AppText>
      ) : null}
    </>
  );

  const base: ViewStyle = {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderTopColor: accent,
  };

  if (!onPress) {
    return <View style={[styles.stat, base, elevation.sm, style]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({pressed}) => [styles.stat, base, elevation.sm, pressed && pressedStyle, style]}>
      {content}
    </Pressable>
  );
}

/* ──────────────────────────────── KeyValue ───────────────────────────────── */

export interface KeyValueProps {
  label: string;
  value?: string | number | null;
  /** Rendered instead of the value text (e.g. a badge). */
  children?: React.ReactNode;
  /** Placeholder when the value is missing (spec §11 — never fake a value). */
  emptyText?: string;
}

export function KeyValue({label, value, children, emptyText = 'Not recorded'}: KeyValueProps) {
  const hasValue = value !== null && value !== undefined && value !== '';
  return (
    <View style={styles.kv}>
      <AppText variant="small" tone="secondary" style={styles.kvLabel}>
        {label}
      </AppText>
      <View style={styles.kvValue}>
        {children ? (
          children
        ) : hasValue ? (
          <AppText variant="bodyStrong">{String(value)}</AppText>
        ) : (
          <AppText variant="body" tone="tertiary">
            {emptyText}
          </AppText>
        )}
      </View>
    </View>
  );
}

/* ──────────────────────────── Divider / Loading ──────────────────────────── */

export function Divider({style}: {style?: StyleProp<ViewStyle>}) {
  const {colors} = useTheme();
  return <View style={[styles.divider, {backgroundColor: colors.border}, style]} />;
}

export function LoadingState({message}: {message?: string}) {
  const {colors} = useTheme();
  return (
    <View style={styles.loading}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message ? (
        <AppText variant="small" tone="secondary" center style={styles.loadingText}>
          {message}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: space[3],
    marginBottom: space[3],
  },
  overline: {marginBottom: 2},
  subtitle: {marginTop: 2},
  headerAction: {flexDirection: 'row', alignItems: 'center', gap: space[1], paddingVertical: space[1]},

  empty: {alignItems: 'center', justifyContent: 'center', paddingVertical: space[9], paddingHorizontal: space[6]},
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.xxl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[4],
  },
  emptyTitle: {marginBottom: space[1]},
  emptyMessage: {maxWidth: 300},
  emptyAction: {
    marginTop: space[5],
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: space[5],
    paddingVertical: space[3],
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: space[3],
    marginBottom: space[2],
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowSubtitle: {marginTop: 2},

  stat: {
    flex: 1,
    minWidth: 140,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderTopWidth: 3,
    padding: space[4],
    gap: space[1],
  },
  statTop: {flexDirection: 'row', alignItems: 'center', gap: space[2]},
  statIcon: {
    width: 28,
    height: 28,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  kv: {flexDirection: 'row', alignItems: 'flex-start', gap: space[3], paddingVertical: space[2]},
  kvLabel: {width: 130},
  kvValue: {flex: 1, alignItems: 'flex-start'},

  divider: {height: 1, marginVertical: space[3]},

  loading: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[6]},
  loadingText: {marginTop: space[3]},
});
