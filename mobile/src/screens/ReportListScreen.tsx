/**
 * ReportListScreen — list reports and scheduled reports.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Report = {
  id: string;
  title: string;
  report_type: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  generated_at: string | null;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ReportListScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();

  const [rows, setRows] = useState<Report[]>([]);
  const [scheduled, setScheduled] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const result = query(
        `SELECT id, title, report_type, status, period_start, period_end, generated_at FROM reports ORDER BY generated_at DESC`,
      );
      setRows(result.map((r: any) => ({
        id: String(r.id),
        title: String(r.title || ''),
        report_type: String(r.report_type || ''),
        status: String(r.status || 'PENDING'),
        period_start: r.period_start ? String(r.period_start) : null,
        period_end: r.period_end ? String(r.period_end) : null,
        generated_at: r.generated_at ? String(r.generated_at) : null,
      })));

      const sResult = query('SELECT id, name, report_type, frequency, next_run, last_run, status FROM scheduled_reports ORDER BY next_run DESC');
      setScheduled(sResult.map((r: any) => ({
        id: String(r.id),
        title: String(r.name || ''),
        report_type: String(r.report_type || ''),
        status: String(r.status || 'ACTIVE'),
        period_start: r.last_run ? String(r.last_run) : null,
        period_end: r.next_run ? String(r.next_run) : null,
        generated_at: null,
      })));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <FlatList
      style={[styles.container, {backgroundColor: colors.background}]}
      data={[...rows, ...scheduled]}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />}
      ListHeaderComponent={
        <View style={styles.headerSection}>
          <View style={styles.headerActions}>
            <Pressable style={[styles.createBtn, {backgroundColor: colors.primary}]} onPress={() => navigation.navigate('ReportGenerate')}>
              <Text style={styles.createBtnText}>Generate</Text>
            </Pressable>
            <Pressable style={[styles.createBtn, {backgroundColor: colors.primary}]} onPress={() => navigation.navigate('ScheduledReportForm', {})}>
              <Text style={styles.createBtnText}>+ Scheduled</Text>
            </Pressable>
          </View>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Reports ({rows.length})</Text>
          {scheduled.length > 0 && <Text style={[styles.sectionTitle, {color: colors.textPrimary, marginTop: 12}]}>Scheduled ({scheduled.length})</Text>}
        </View>
      }
      ListEmptyComponent={<View style={styles.center}><Text style={[styles.empty, {color: colors.textSecondary}]}>No reports</Text></View>}
      renderItem={({item}) => (
        <Pressable style={[styles.card, {backgroundColor: colors.surface}]} onPress={() => navigation.navigate('ReportDetail', {reportId: item.id})}>
          <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{item.title}</Text>
          <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.report_type}</Text>
          <Text style={[styles.cardStatus, {color: colors.textSecondary}]}>{item.status}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  empty: {fontSize: 14},
  headerSection: {padding: 16, paddingBottom: 0},
  headerActions: {flexDirection: 'row', gap: 8, marginBottom: 12},
  createBtn: {paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, alignItems: 'center'},
  createBtnText: {color: '#fff', fontWeight: '700', fontSize: 14},
  sectionTitle: {fontSize: 16, fontWeight: '700'},
  card: {marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12},
  cardTitle: {fontSize: 15, fontWeight: '600'},
  cardSub: {fontSize: 13, marginTop: 2},
  cardStatus: {fontSize: 11, fontWeight: '600', marginTop: 6, textTransform: 'uppercase'},
});
