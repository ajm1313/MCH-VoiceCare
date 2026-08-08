/**
 * DuplicateBadge — visual warning banner for potential duplicate records.
 * Shows match type (EXACT/STRONG/SOFT) with urgency-colored badge.
 * MCHVC-SPEC-001 v1.1 §45.1, §17.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {urgency} from '../theme/colors';

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

const MATCH_COLORS: Record<string, string> = {
  EXACT: urgency.RED,
  STRONG: urgency.ORANGE,
  SOFT: urgency.AMBER,
};

const MATCH_LABELS: Record<string, string> = {
  EXACT: 'EXACT MATCH',
  STRONG: 'STRONG MATCH',
  SOFT: 'POSSIBLE MATCH',
};

export function DuplicateBadge({duplicate, onViewExisting, onDismiss}: DuplicateBadgeProps) {
  if (!duplicate || duplicate.matchType === 'NONE') return null;

  const color = MATCH_COLORS[duplicate.matchType] || urgency.AMBER;

  return (
    <View style={[styles.container, {backgroundColor: color + '15', borderColor: color + '40'}]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={[styles.title, {color}]}>Possible Duplicate</Text>
        </View>
        <View style={[styles.badge, {backgroundColor: color}]}>
          <Text style={styles.badgeText}>{MATCH_LABELS[duplicate.matchType] || 'MATCH'}</Text>
        </View>
      </View>
      {duplicate.existingName && (
        <Text style={styles.existingName}>{duplicate.existingName}</Text>
      )}
      {duplicate.matchField && (
        <Text style={styles.matchField}>
          Matched by: {duplicate.matchField}
          {duplicate.source ? ` in ${duplicate.source}` : ''}
        </Text>
      )}
      <View style={styles.actions}>
        {onViewExisting && (
          <Pressable
            style={[styles.btn, {borderColor: color}]}
            onPress={onViewExisting}
            accessibilityRole="button"
            accessibilityLabel="View existing record"
            accessibilityHint="Navigate to the existing duplicate record">
            <Text style={[styles.btnText, {color}]}>View Existing</Text>
          </Pressable>
        )}
        {onDismiss && (
          <Pressable
            style={styles.btnDismiss}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss duplicate warning"
            accessibilityHint="Dismiss this duplicate warning">
            <Text style={styles.btnDismissText}>Dismiss</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  icon: {fontSize: 16},
  title: {fontSize: 14, fontWeight: '700'},
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeText: {color: '#fff', fontSize: 9, fontWeight: '700', letterSpacing: 0.5},
  existingName: {fontSize: 13, fontWeight: '600', color: '#1e293b', marginBottom: 2},
  matchField: {fontSize: 11, color: '#64748b', marginBottom: 8},
  actions: {flexDirection: 'row', gap: 8},
  btn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center',
  },
  btnText: {fontSize: 12, fontWeight: '600'},
  btnDismiss: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minHeight: 44,
    justifyContent: 'center',
  },
  btnDismissText: {fontSize: 12, fontWeight: '500', color: '#64748b'},
});
