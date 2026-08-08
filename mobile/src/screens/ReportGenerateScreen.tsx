/**
 * ReportGenerateScreen — trigger report generation.
 */
import React, {useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {getDb, query} from '../core/db/database';
import {enqueue} from '../core/sync/outbox';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ReportGenerate'>;

export function ReportGenerateScreen({navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const [title, setTitle] = useState('');
  const [reportType, setReportType] = useState('MONTHLY_SUMMARY');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [generating, setGenerating] = useState(false);

  const handleGenerate = () => {
    if (!title.trim()) {
      Alert.alert('Validation', 'Report title is required.');
      return;
    }
    setGenerating(true);
    try {
      const db = getDb();
      const id = `report-${Date.now()}`;
      const now = new Date().toISOString();

      const countRows = (sql: string, params: any[] = []): number => {
        const r = query(sql, params);
        return r.length > 0 ? Number((r[0] as any).cnt || 0) : 0;
      };

      const pregnancyCount = countRows(`SELECT COUNT(*) as cnt FROM episodes WHERE module = 'pregnancy' AND status = 'OPEN'`);
      const newbornCount = countRows(`SELECT COUNT(*) as cnt FROM episodes WHERE module = 'newborn' AND status = 'OPEN'`);
      const immunisationCount = countRows(`SELECT COUNT(*) as cnt FROM immunisation_children WHERE status = 'ACTIVE'`);
      const growthCount = countRows(`SELECT COUNT(*) as cnt FROM growth_measurements`);
      const defaulterCount = countRows(`SELECT COUNT(*) as cnt FROM defaulter_episodes WHERE defaulter_status = 'ACTIVE'`);
      const newbornEpisodes = countRows(`SELECT COUNT(*) as cnt FROM newborn_episodes WHERE status = 'OPEN'`);
      const vaccineDoses = countRows(`SELECT COUNT(*) as cnt FROM vaccine_doses`);
      const cwcSessions = countRows(`SELECT COUNT(*) as cnt FROM cwc_sessions WHERE status = 'PLANNED'`);
      const campaigns = countRows(`SELECT COUNT(*) as cnt FROM communication_campaigns WHERE status IN ('DRAFT', 'APPROVED')`);

      const snapshot: Record<string, any> = {
        pregnancy_count: pregnancyCount,
        newborn_count: newbornCount,
        immunisation_count: immunisationCount,
        growth_count: growthCount,
        defaulter_count: defaulterCount,
        newborn_episode_count: newbornEpisodes,
        vaccine_dose_count: vaccineDoses,
        cwc_session_count: cwcSessions,
        active_campaign_count: campaigns,
        generated_at: now,
        period_start: periodStart,
        period_end: periodEnd,
      };
      db.execute(
        `INSERT OR REPLACE INTO reports (id, title, report_type, period_start, period_end, status, generated_at, data_snapshot, sync_status)
         VALUES (?, ?, ?, ?, ?, 'COMPLETED', ?, ?, 'NOT_SYNCED')`,
        [id, title.trim(), reportType, periodStart.trim() || null, periodEnd.trim() || null, now, JSON.stringify(snapshot)],
      );
      Alert.alert('Success', 'Report generated successfully.');
      enqueue('report', {
        id,
        title: title.trim(),
        report_type: reportType,
        period_start: periodStart.trim() || null,
        period_end: periodEnd.trim() || null,
        status: 'COMPLETED',
        generated_at: now,
        data_snapshot: snapshot,
      }, 'device-001', 'PREG-RULES-v1.1');
      navigation.goBack();
    } catch {
      Alert.alert('Error', 'Failed to generate report.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, {color: colors.textPrimary}]}>Generate Report</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Title *</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={title} onChangeText={setTitle} placeholder="Report title" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Report Type</Text>
          {['MONTHLY_SUMMARY', 'COVERAGE', 'DEFALTER', 'MORTALITY', 'ANTHROPOMETRIC', 'CUSTOM'].map(t => (
            <Pressable key={t} onPress={() => setReportType(t)} style={[styles.option, reportType === t && {borderColor: colors.primary}]}>
              <Text style={{color: reportType === t ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: reportType === t ? '700' : '400'}}>{t.replace(/_/g, ' ')}</Text>
            </Pressable>
          ))}
          <Text style={[styles.label, {color: colors.textSecondary}]}>Period Start</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={periodStart} onChangeText={setPeriodStart} placeholder="YYYY-MM-DD" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Period End</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={periodEnd} onChangeText={setPeriodEnd} placeholder="YYYY-MM-DD" />
        </View>
        <Pressable style={[styles.generateButton, {backgroundColor: colors.primary}]} onPress={handleGenerate} disabled={generating}>
          <Text style={styles.generateButtonText}>{generating ? 'Generating...' : 'Generate Report'}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12},
  back: {fontSize: 16},
  title: {fontSize: 18, fontWeight: '700'},
  content: {padding: 16, gap: 12},
  card: {borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 8},
  label: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginTop: 8},
  input: {borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, minHeight: 48},
  option: {paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, marginTop: 4},
  generateButton: {padding: 14, borderRadius: 12, alignItems: 'center'},
  generateButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
