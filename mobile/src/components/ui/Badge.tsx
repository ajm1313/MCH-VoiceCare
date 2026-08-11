/**
 * Badge / UrgencyBadge.
 *
 * `UrgencyBadge` is the ONLY sanctioned way to render a clinical urgency in the
 * UI. It enforces UX-002 by always pairing the urgency colour with a text label
 * and an icon, so risk is never communicated by colour alone (which matters for
 * colour-vision deficiency and for greyscale printing of referral slips).
 *
 * It also upholds spec §3.1: the GREY / data-missing class renders with a
 * "Data missing" label and a question icon, so an ABSTAIN can never be mistaken
 * for a routine/green result.
 */
import React from 'react';
import {StyleSheet, View, type StyleProp, type ViewStyle} from 'react-native';

import {useTheme} from '../../theme/useTheme';
import {urgencyMeta, toUrgencyKey} from '../../theme/colors';
import {radius, space} from '../../theme/tokens';
import {Icon, type IconName} from './Icon';
import {AppText} from './Text';

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps {
  label: string;
  tone?: BadgeTone;
  size?: BadgeSize;
  icon?: IconName;
  /** Solid fill instead of the tonal wash — use sparingly for emphasis. */
  solid?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Badge({label, tone = 'neutral', size = 'sm', icon, solid = false, style}: BadgeProps) {
  const {colors} = useTheme();

  const tones: Record<BadgeTone, {fg: string; bg: string; border: string; solidBg: string}> = {
    neutral: {fg: colors.textSecondary, bg: colors.surfaceSunken, border: colors.border, solidBg: colors.textSecondary},
    brand: {fg: colors.primaryStrong, bg: colors.primarySubtle, border: colors.primary, solidBg: colors.primary},
    success: {fg: colors.success, bg: colors.successSubtle, border: colors.success, solidBg: colors.success},
    warning: {fg: colors.warning, bg: colors.warningSubtle, border: colors.warning, solidBg: colors.warning},
    danger: {fg: colors.danger, bg: colors.dangerSubtle, border: colors.danger, solidBg: colors.danger},
    info: {fg: colors.info, bg: colors.infoSubtle, border: colors.info, solidBg: colors.info},
  };

  const t = tones[tone];
  const fg = solid ? '#FFFFFF' : t.fg;
  const iconSize = size === 'sm' ? 12 : 14;

  return (
    <View
      style={[
        styles.badge,
        size === 'md' ? styles.badgeMd : styles.badgeSm,
        {
          backgroundColor: solid ? t.solidBg : t.bg,
          borderColor: solid ? t.solidBg : t.border,
        },
        style,
      ]}>
      {icon ? <Icon name={icon} size={iconSize} color={fg} strokeWidth={2} /> : null}
      <AppText
        variant={size === 'sm' ? 'caption' : 'smallStrong'}
        tone="inherit"
        style={{color: fg}}>
        {label}
      </AppText>
    </View>
  );
}

export interface UrgencyBadgeProps {
  /** Any urgency string — normalised to RED/ORANGE/AMBER/GREEN/GREY. */
  value: string | null | undefined;
  size?: BadgeSize;
  /** Solid fill — used on referral slips where print contrast matters. */
  solid?: boolean;
  /**
   * Which text to show. `class` shows RED/AMBER/…, `meaning` shows
   * Emergency/High risk/…, `both` shows "RED · Emergency".
   */
  labelMode?: 'class' | 'meaning' | 'both';
  style?: StyleProp<ViewStyle>;
}

export function UrgencyBadge({
  value,
  size = 'sm',
  solid = false,
  labelMode = 'both',
  style,
}: UrgencyBadgeProps) {
  const {urgencyTone} = useTheme();
  const key = toUrgencyKey(value);
  const meta = urgencyMeta[key];
  const tone = urgencyTone(key);

  const fg = solid ? tone.onSolid : tone.fg;
  const iconSize = size === 'sm' ? 12 : 14;

  const label =
    labelMode === 'class'
      ? meta.shortLabel
      : labelMode === 'meaning'
      ? meta.label
      : `${meta.shortLabel} · ${meta.label}`;

  return (
    <View
      style={[
        styles.badge,
        size === 'md' ? styles.badgeMd : styles.badgeSm,
        {
          backgroundColor: solid ? tone.solid : tone.bg,
          borderColor: solid ? tone.solid : tone.border,
        },
        style,
      ]}
      // UX-002: the accessible label always carries the meaning and the action.
      accessibilityLabel={`${meta.shortLabel}. ${meta.label}. ${meta.action}.`}>
      <Icon name={meta.icon} size={iconSize} color={fg} strokeWidth={2} />
      <AppText
        variant={size === 'sm' ? 'caption' : 'smallStrong'}
        tone="inherit"
        style={{color: fg}}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space[1],
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  badgeSm: {paddingHorizontal: space[2], paddingVertical: 3},
  badgeMd: {paddingHorizontal: space[3], paddingVertical: space[1]},
});

export default Badge;
