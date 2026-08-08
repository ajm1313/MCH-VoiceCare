/**
 * ScheduledReportFormScreen — create or edit a scheduled report.
 */
import React, {useEffect, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import {enqueue} from '../core/sync/outbox';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ScheduledReportForm'>;

export function ScheduledReportFormScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const editing = route.params?.scheduledId != null;
  const scheduledId = route.params?.scheduledId;

  const [name, setName] = useState('');
  const [reportType, setReportType] = useState('MONTHLY_SUMMARY');
  const [frequency, setFrequency] = useState('MONTHLY');
  const [nextRun, setNextRun] = useState('');

  useEffect(() => {
    if (editing && scheduledId) {
      const rows = query('SELECT name, report_type, frequency, next_run FROM scheduled_reports WHERE id = ?', [scheduledId]);
      if (rows.length > 0) {
        const r = rows[0] as any;
        setName(String(r.name || ''));
        setReportType(String(r.report_type || 'MONTHLY_SUMMARY'));
        setFrequency(String(r.frequency || 'MONTHLY'));
        setNextRun(String(r.next_run || ''));
      }
    }
  }, [editing, scheduledId]);

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Scheduled report name is required.');
      return;
    }
    const db = getDb();
    const id = editing ? scheduledId! : `sched-${Date.now()}`;
    db.execute(
      `INSERT OR REPLACE INTO scheduled_reports (id, name, report_type, frequency, next_run, status, sync_status)
       VALUES (?, ?, ?, ?, ?, 'ACTIVE', 'NOT_SYNCED')`,
      [id, name.trim(), reportType, frequency, nextRun.trim() || null],
    );
    enqueue('scheduled_report', {
      id,
      name: name.trim(),
      report_type: reportType,
      frequency,
      next_run: nextRun.trim() || null,
      status: 'ACTIVE',
    }, 'device-001', 'PREG-RULES-v1.1');
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!editing || !scheduledId) return;
    Alert.alert('Delete', 'Delete this scheduled report?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => {
        const db = getDb();
        db.execute('DELETE FROM scheduled_reports WHERE id = ?', [scheduledId]);
        navigation.goBack();
      }},
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, {color: colors.textPrimary}]}>{editing ? 'Edit Scheduled Report' : 'New Scheduled Report'}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Name *</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={name} onChangeText={setName} placeholder="Scheduled report name" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Report Type</Text>
          {['MONTHLY_SUMMARY', 'COVERAGE', 'DEFALTER', 'MORTALITY', 'ANTHROPOMETRIC'].map(t => (
            <Pressable key={t} onPress={() => setReportType(t)} style={[styles.option, reportType === t && {borderColor: colors.primary}]}>
              <Text style={{color: reportType === t ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: reportType === t ? '700' : '400'}}>{t.replace(/_/g, ' ')}</Text>
            </Pressable>
          ))}
          <Text style={[styles.label, {color: colors.textSecondary}]}>Frequency</Text>
          {['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY'].map(f => (
            <Pressable key={f} onPress={() => setFrequency(f)} style={[styles.option, frequency === f && {borderColor: colors.primary}]}>
              <Text style={{color: frequency === f ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: frequency === f ? '700' : '400'}}>{f}</Text>
            </Pressable>
          ))}
          <Text style={[styles.label, {color: colors.textSecondary}]}>Next Run</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={nextRun} onChangeText={setNextRun} placeholder="YYYY-MM-DDTHH:MM" />
        </View>
        <Pressable style={[styles.saveButton, {backgroundColor: colors.primary}]} onPress={handleSave}>
          <Text style={styles.saveButtonText}>{editing ? 'Update' : 'Create'}</Text>
        </Pressable>
        {editing && (
          <Pressable style={[styles.deleteButton, {borderColor: '#EF4444'}]} onPress={handleDelete}>
            <Text style={[styles.deleteButtonText, {color: '#EF4444'}]}>Delete</Text>
          </Pressable>
        )}
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
  saveButton: {padding: 14, borderRadius: 12, alignItems: 'center'},
  saveButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  deleteButton: {padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1},
  deleteButtonText: {fontWeight: '700', fontSize: 15},
});
