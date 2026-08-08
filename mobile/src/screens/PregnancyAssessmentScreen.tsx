/**
 * PregnancyAssessmentScreen — view a single pregnancy assessment detail.
 */
import React, {useEffect, useState} from 'react';
import {Pressable, ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {query} from '../core/db/database';
import {brand, urgency, lightColors} from '../theme/colors';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PregnancyAssessment'>;

export function PregnancyAssessmentScreen({route, navigation}: Props) {
  const {assessmentId} = route.params;
  const [assessment, setAssessment] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    const rows = query(
      'SELECT id, episode_id, module, minimum_class, triggered_rules, recommended_text, assessed_at, rule_set_version FROM assessments WHERE id = ?',
      [assessmentId],
    );
    if (rows.length > 0) {
      setAssessment(rows[0] as any);
    }
  }, [assessmentId]);

  const color = assessment ? urgency[assessment.minimum_class as keyof typeof urgency] || lightColors.textSecondary : lightColors.textSecondary;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {assessment ? (
          <>
            <View style={styles.card}>
              <View style={styles.urgencyRow}>
                <View style={[styles.urgencyBadge, {borderColor: color}]}>
                  <Text style={[styles.urgencyText, {color}]}>{assessment.minimum_class}</Text>
                </View>
                <Text style={styles.assessedAt}>{assessment.assessed_at}</Text>
              </View>
              <Text style={styles.sectionLabel}>Recommended Action</Text>
              <Text style={styles.actionText}>{assessment.recommended_text}</Text>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Details</Text>
              <InfoRow label="Module" value={String(assessment.module ?? '—')} />
              <InfoRow label="Rule Set Version" value={String(assessment.rule_set_version ?? '—')} />
              <InfoRow label="Episode ID" value={String(assessment.episode_id ?? '—')} />
            </View>

            {assessment.triggered_rules && assessment.triggered_rules !== '[]' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Triggered Rules</Text>
                <Text style={styles.rules}>{assessment.triggered_rules}</Text>
              </View>
            )}
          </>
        ) : (
          <Text style={styles.empty}>Assessment not found</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: lightColors.background},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12},
  back: {fontSize: 16, color: brand.teal},
  content: {padding: 16, gap: 12},
  card: {backgroundColor: lightColors.surface, borderWidth: 1, borderColor: lightColors.border, borderRadius: 12, padding: 16},
  cardTitle: {fontSize: 14, fontWeight: '700', color: lightColors.textPrimary, marginBottom: 10},
  urgencyRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12},
  urgencyBadge: {borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3},
  urgencyText: {fontSize: 12, fontWeight: '700'},
  assessedAt: {fontSize: 11, color: lightColors.textSecondary},
  sectionLabel: {fontSize: 11, fontWeight: '600', color: lightColors.textSecondary, textTransform: 'uppercase', marginBottom: 4},
  actionText: {fontSize: 15, color: lightColors.textPrimary},
  infoRow: {paddingVertical: 6},
  infoLabel: {fontSize: 11, color: lightColors.textSecondary, textTransform: 'uppercase'},
  infoValue: {fontSize: 15, color: lightColors.textPrimary, fontWeight: '500', marginTop: 2},
  rules: {fontSize: 12, color: lightColors.textSecondary, fontFamily: 'monospace', marginTop: 4},
  empty: {fontSize: 14, color: lightColors.textSecondary, textAlign: 'center', paddingVertical: 32},
});
