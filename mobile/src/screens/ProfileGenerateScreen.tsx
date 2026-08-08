/**
 * ProfileGenerateScreen — generate monthly pregnancy profiles.
 */
import React, {useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import {evaluateOffline} from '../core/rules/offlineEngine';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileGenerate'>;

export function ProfileGenerateScreen({navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [generating, setGenerating] = useState(false);

  const handleGenerate = () => {
    if (!month.trim()) {
      Alert.alert('Validation', 'Please specify a month (YYYY-MM).');
      return;
    }
    Alert.alert('Generate Profiles', `Generate profiles for ${month}?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Generate',
        onPress: () => {
          setGenerating(true);
          try {
            const episodes = query(
              `SELECT id, snapshot FROM episodes WHERE module = 'pregnancy' AND status = 'OPEN'`,
            );
            const db = getDb();
            let count = 0;
            for (const ep of episodes as any[]) {
              let womanName = 'Unknown';
              try {
                const snap = JSON.parse(String(ep.snapshot));
                womanName = String(snap.woman_name ?? 'Unknown');
              } catch { /* */ }

              const obsRows = query(
                `SELECT bp_systolic, bp_diastolic, temperature_c, weight_kg, fundal_height_cm,
                        fhr_bpm, urine_protein, urine_glucose, oedema, movement_status
                 FROM pregnancy_observations WHERE episode_id = ?
                 ORDER BY recorded_at DESC LIMIT 1`,
                [String(ep.id)],
              );

              let riskLevel = 'GREY';
              let profileData: Record<string, any> = {source: 'offline_engine', triggered_rules: []};

              if (obsRows.length > 0) {
                const obs = obsRows[0] as any;
                const facts: Record<string, any> = {
                  bp_systolic: obs.bp_systolic != null ? Number(obs.bp_systolic) : null,
                  bp_diastolic: obs.bp_diastolic != null ? Number(obs.bp_diastolic) : null,
                  temperature_c: obs.temperature_c != null ? Number(obs.temperature_c) : null,
                  is_clinical_contact: true,
                };
                const result = evaluateOffline('pregnancy', facts);
                riskLevel = result.minimum_class;
                profileData = {
                  source: 'offline_engine',
                  triggered_rules: result.triggered_rule_ids,
                  recommended_action: result.recommended_action,
                  latest_urgency: result.minimum_class,
                  bp_systolic: facts.bp_systolic,
                  bp_diastolic: facts.bp_diastolic,
                };
              }

              const profileId = `profile-${month}-${ep.id}`;
              db.execute(
                `INSERT OR REPLACE INTO pregnancy_profiles (id, episode_id, woman_name, profile_month, risk_level, status, profile_data, generated_at, sync_status)
                 VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, 'NOT_SYNCED')`,
                [profileId, String(ep.id), womanName, month, riskLevel, JSON.stringify(profileData), new Date().toISOString()],
              );
              count++;
            }
            Alert.alert('Success', `Generated ${count} profile${count !== 1 ? 's' : ''} for ${month}.`);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Error', 'Failed to generate profiles.');
          } finally {
            setGenerating(false);
          }
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, {color: colors.textPrimary}]}>Generate Profiles</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Profile Month (YYYY-MM) *</Text>
          <TextInput
            style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]}
            value={month}
            onChangeText={setMonth}
            placeholder="2026-07"
          />
          <Text style={[styles.hint, {color: colors.textSecondary}]}>
            This will generate draft profiles for all open pregnancy episodes. Risk levels are computed from the latest observations using the offline rules engine. Profiles remain DRAFT until finalised.
          </Text>
        </View>
        <Pressable style={[styles.generateButton, {backgroundColor: colors.primary}]} onPress={handleGenerate} disabled={generating}>
          <Text style={styles.generateButtonText}>{generating ? 'Generating...' : 'Generate Profiles'}</Text>
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
  label: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase'},
  input: {borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, minHeight: 48},
  hint: {fontSize: 12, marginTop: 8, lineHeight: 18},
  generateButton: {padding: 14, borderRadius: 12, alignItems: 'center'},
  generateButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
