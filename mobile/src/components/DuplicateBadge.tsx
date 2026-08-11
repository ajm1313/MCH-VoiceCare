/**
 * DuplicateBadge — visual warning banner for potential duplicate records.
 * Shows match type (EXACT/STRONG/SOFT) with urgency-colored badge.
 * MCHVC-SPEC-001 v1.1 §45.1, §17.
 *
 * UX-002: the match level is always shown as text + icon, never colour alone.
 */
import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';

import {useTheme} from '../theme/useTheme';
import {urgency, type UrgencyKey} from '../theme/colors';
import {MIN_TOUCH, border, radius, space, type as typeScale} from '../theme/tokens';
import {Icon, type IconName} from './ui/Icon';
import {AppText} from './ui/Text';
import {Badge} from './ui/Badge';

export interface DuplicateInfo {
  matchType: 'EXACT' | 'STRONG' | 'SOFT' | 'NONE';
  existingName?: string;
  matchField?: string;
  source?: string;
}

interface DuplicateBadgeProps {
  duplicate: DuplicateInfo | null;
  onViewExisting?: () => void;
  onDismiss?: () => void;
}

const MATCH_META: Record<string, {key: UrgencyKey; label: string; icon: IconName}> = {
  EXACT: {key: 'RED', label: 'EXACT MATCH', icon: 'alertOctagon'},
  STRONG: {key: 'ORANGE', label: 'STRONG MATCH', icon: 'alertTriangle'},
  SOFT: {key: 'AMBER', label: 'POSSIBLE MATCH', icon: 'alertCircle'},
};

export function DuplicateBadge({duplicate, onViewExisting, onDismiss}: DuplicateBadgeProps) {
  const {colors, urgencyTone} = useTheme();
  if (!duplicate || duplicate.matchType === 'NONE') return null;

  const meta = MATCH_META[duplicate.matchType] ?? MATCH_META.SOFT;
  const tone = urgencyTone(meta.key);

  return (
    <View
      style={[
        styles.container,
        {backgroundColor: tone.bg, borderColor: tone.border, borderWidth: border.thick},
      ]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Icon name={meta.icon} size={18} color={tone.fg} strokeWidth={2} />
          <AppText variant="bodyStrong" tone="inherit" style={{color: tone.fg}}>
            Possible Duplicate
          </AppText>
        </View>
        <Badge label={meta.label} tone="neutral" solid />
      </View>

      {duplicate.existingName ? (
        <AppText variant="bodyStrong" style={styles.existingName}>
          {duplicate.existingName}
        </AppText>
      ) : null}

      {duplicate.matchField ? (
        <AppText variant="caption" tone="secondary" style={styles.matchField}>
          Matched by: {duplicate.matchField}
          {duplicate.source ? ` in ${duplicate.source}` : ''}
        </AppText>
      ) : null}

      <View style={styles.actions}>
        {onViewExisting ? (
          <Pressable
            style={({pressed}) => [
              styles.btn,
              {borderColor: tone.solid, backgroundColor: 'transparent'},
              pressed && styles.btnPressed,
            ]}
            onPress={onViewExisting}
            accessibilityRole="button"
            accessibilityLabel="View existing record"
            accessibilityHint="Navigate to the existing duplicate record">
            <AppText variant="smallStrong" tone="inherit" style={{color: tone.fg}}>
              View Existing
            </AppText>
          </Pressable>
        ) : null}

        {onDismiss ? (
          <Pressable
            style={({pressed}) => [styles.btnDismiss, pressed && styles.btnPressed]}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss duplicate warning"
            accessibilityHint="Dismiss this duplicate warning">
            <AppText variant="smallStrong" tone="secondary">
              Dismiss
            </AppText>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    padding: space[3],
    marginHorizontal: space[4],
    marginVertical: space[2],
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space[2],
    gap: space[2],
  },
  headerLeft: {flexDirection: 'row', alignItems: 'center', gap: space[2], flex: 1},
  existingName: {marginBottom: 2},
  matchField: {marginBottom: space[2]},
  actions: {flexDirection: 'row', gap: space[2]},
  btn: {
    borderWidth: border.thick,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
  btnDismiss: {
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    minHeight: MIN_TOUCH,
    justifyContent: 'center',
  },
  btnPressed: {opacity: 0.8, transform: [{scale: 0.97}]},
});
