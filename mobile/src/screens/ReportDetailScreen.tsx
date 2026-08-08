/**
 * ReportDetailScreen — report detail with data snapshot.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportDetail'>;

export function ReportDetailScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const {reportId} = route.params;

  const [item, setItem] = useState<Record<string, any> | null>(null);
  const [snapshot, setSnapshot] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const rows = query('SELECT * FROM reports WHERE id = ?', [reportId]);
      if (rows.length > 0) {
        const r = rows[0] as any;
        setItem(r);
        try { setSnapshot(JSON.parse(String(r.data_snapshot || '{}'))); } catch { /* */ }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [reportId]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Text style={[styles.back, {color: colors.primary}]} onPress={() => navigation.goBack()}>‹ Back</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />}>
        {item ? (
          <>
            <View style={[styles.card, {backgroundColor: colors.surface}]}>
              <Text style={[styles.title, {color: colors.textPrimary}]}>{String(item.title)}</Text>
              <InfoRow label="Type" value={String(item.report_type)} colors={colors} />
              <InfoRow label="Status" value={String(item.status)} colors={colors} />
              <InfoRow label="Period Start" value={String(item.period_start ?? '—')} colors={colors} />
              <InfoRow label="Period End" value={String(item.period_end ?? '—')} colors={colors} />
              <InfoRow label="Generated" value={String(item.generated_at ?? '—')} colors={colors} />
            </View>
            {Object.keys(snapshot).length > 0 && (
              <View style={[styles.card, {backgroundColor: colors.surface}]}>
                <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>Report Data</Text>
                {Object.entries(snapshot).map(([k, v]) => (
                  <View key={k} style={styles.infoRow}>
                    <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>{k.replace(/_/g, ' ')}</Text>
                    <Text style={[styles.infoValue, {color: colors.textPrimary}]}>{String(v)}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          <Text style={[styles.empty, {color: colors.textSecondary}]}>Report not found</Text>
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
  cardTitle: {fontSize: 14, fontWeight: '700', marginBottom: 10},
  title: {fontSize: 18, fontWeight: '700', marginBottom: 10},
  infoRow: {paddingVertical: 6},
  infoLabel: {fontSize: 11, textTransform: 'uppercase', fontWeight: '600'},
  infoValue: {fontSize: 15, fontWeight: '500', marginTop: 2},
  empty: {fontSize: 14, textAlign: 'center', paddingVertical: 32},
});
