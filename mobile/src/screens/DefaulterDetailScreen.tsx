/**
 * DefaulterDetailScreen — defaulter details with trace button.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors, urgency} from '../theme/colors';
import {query} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DefaulterDetail'>;

export function DefaulterDetailScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const {defaulterId} = route.params;

  const [item, setItem] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const rows = query(
        `SELECT id, child_id, child_name, defaulter_status, days_overdue, last_visit_date, next_due_date, reason, trace_status, traced_at, trace_notes
         FROM defaulter_episodes WHERE id = ?`,
        [defaulterId],
      );
      if (rows.length > 0) setItem(rows[0] as any);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [defaulterId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />}>
        {item ? (
          <>
            <View style={[styles.card, {backgroundColor: colors.surface}]}>
              <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{item.child_name}</Text>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, {backgroundColor: Number(item.days_overdue) > 60 ? urgency.RED : urgency.ORANGE}]}>
                  <Text style={styles.badgeText}>{item.days_overdue}d overdue</Text>
                </View>
                <View style={[styles.badge, {backgroundColor: item.trace_status === 'COMPLETED' ? urgency.GREEN : urgency.GREY}]}>
                  <Text style={styles.badgeText}>{String(item.trace_status || 'PENDING')}</Text>
                </View>
              </View>
            </View>
            <View style={[styles.card, {backgroundColor: colors.surface}]}>
              <InfoRow label="Last Visit" value={String(item.last_visit_date ?? '—')} colors={colors} />
              <InfoRow label="Next Due" value={String(item.next_due_date ?? '—')} colors={colors} />
              <InfoRow label="Reason" value={String(item.reason ?? '—')} colors={colors} />
              <InfoRow label="Traced At" value={String(item.traced_at ?? '—')} colors={colors} />
              <InfoRow label="Trace Notes" value={String(item.trace_notes ?? '—')} colors={colors} />
            </View>
            {item.trace_status !== 'COMPLETED' && (
              <Pressable
                style={[styles.traceButton, {backgroundColor: colors.primary}]}
                onPress={() => navigation.navigate('DefaulterTrace', {defaulterId})}>
                <Text style={styles.traceButtonText}>Trace Defaulter</Text>
              </Pressable>
            )}
          </>
        ) : (
          <Text style={[styles.empty, {color: colors.textSecondary}]}>Defaulter not found</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({label, value, colors}: {label: string; value: string; colors: typeof lightColors}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>{label}</Text>
      <Text style={[styles.infoValue, {color: colors.textPrimary}]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  header: {paddingHorizontal: 16, paddingVertical: 12},
  back: {fontSize: 16},
  content: {padding: 16, gap: 12},
  card: {borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E2E8F0'},
  cardTitle: {fontSize: 18, fontWeight: '700', marginBottom: 10},
  badgeRow: {flexDirection: 'row', gap: 8},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  badgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},
  infoRow: {paddingVertical: 6},
  infoLabel: {fontSize: 11, textTransform: 'uppercase', fontWeight: '600'},
  infoValue: {fontSize: 15, fontWeight: '500', marginTop: 2},
  traceButton: {padding: 14, borderRadius: 12, alignItems: 'center'},
  traceButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  empty: {fontSize: 14, textAlign: 'center', paddingVertical: 32},
});
