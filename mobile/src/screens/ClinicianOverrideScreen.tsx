/**
 * ClinicianOverrideScreen — allows a clinician to confirm, escalate,
 * de-escalate, or reject a system-generated clinical decision.
 *
 * Emergency rules cannot be de-escalated (spec §3.1 non-downgrade invariant).
 */
import React, {useState} from 'react';
import {ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {submitClinicianOverride, type OverrideAction} from '../core/services/clinicianOverride';
import {logLocalAudit} from '../core/utils/audit';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ClinicianOverride'>;

const ACTIONS: {label: string; value: OverrideAction; description: string}[] = [
  {label: 'Confirm', value: 'CONFIRM', description: 'Clinician confirmed the system recommendation.'},
  {label: 'Escalate', value: 'ESCALATE', description: 'Clinician escalated to higher urgency.'},
  {label: 'De-escalate', value: 'DEESCALATE', description: 'Clinician de-escalated to lower urgency (with documented justification).'},
  {label: 'Reject', value: 'REJECT', description: 'Clinician rejected the system recommendation entirely.'},
];

export function ClinicianOverrideScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const {episodeId, episodeType, priorRecommendation} = route.params;

  const [action, setAction] = useState<OverrideAction>('CONFIRM');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!reason.trim()) {
      Alert.alert('Validation', 'A reason is required for all override actions.');
      return;
    }

    if (action === 'DEESCALATE' && priorRecommendation === 'EMERGENCY') {
      Alert.alert(
        'Not Allowed',
        'Emergency rules cannot be de-escalated by clinician override. Use REJECT with documented justification if the rule fired in error.',
      );
      return;
    }

    setSubmitting(true);
    const result = await submitClinicianOverride({
      episode_type: episodeType as 'PregnancyEpisode' | 'NewbornEpisode' | 'GrowthMeasurement',
      episode_id: episodeId,
      prior_recommendation: priorRecommendation,
      resulting_action: action,
      override_reason: reason,
    });
    setSubmitting(false);

    if (result.ok && result.data) {
      logLocalAudit({
        action: 'CLINICIAN_OVERRIDE',
        entityType: episodeType,
        entityId: episodeId,
        metadata: {
          override_id: result.data.override_id,
          prior_recommendation: priorRecommendation,
          resulting_action: action,
          override_reason: reason,
        },
      });
      Alert.alert('Override Recorded', result.data.description, [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    } else {
      Alert.alert('Error', result.error ?? 'Failed to submit override.');
    }
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, {color: colors.textPrimary}]}>Clinical Override</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Prior Recommendation</Text>
          <Text style={[styles.value, {color: colors.textPrimary}]}>{priorRecommendation}</Text>
          <Text style={[styles.label, {color: colors.textSecondary, marginTop: 12}]}>Episode ID</Text>
          <Text style={[styles.value, {color: colors.textPrimary}]}>{episodeId}</Text>
        </View>

        <Text style={[styles.sectionLabel, {color: colors.textSecondary}]}>Action</Text>
        {ACTIONS.map(a => (
          <Pressable
            key={a.value}
            style={[styles.option, {borderColor: action === a.value ? colors.primary : colors.border}, action === a.value && {backgroundColor: colors.primary + '15'}]}
            onPress={() => setAction(a.value)}>
            <View style={{flex: 1}}>
              <Text style={[styles.optionLabel, {color: action === a.value ? colors.primary : colors.textPrimary, fontWeight: action === a.value ? '700' : '500'}]}>{a.label}</Text>
              <Text style={[styles.optionDesc, {color: colors.textSecondary}]}>{a.description}</Text>
            </View>
          </Pressable>
        ))}

        <Text style={[styles.sectionLabel, {color: colors.textSecondary}]}>Reason / Justification *</Text>
        <TextInput
          style={[styles.input, {borderColor: colors.border, color: colors.textPrimary, backgroundColor: colors.background}]}
          value={reason}
          onChangeText={setReason}
          placeholder="Document the clinical rationale for this override..."
          placeholderTextColor={colors.textSecondary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />

        <Pressable style={[styles.submitBtn, {backgroundColor: colors.primary}]} onPress={handleSubmit} disabled={submitting}>
          {submitting ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.submitBtnText}>Submit Override</Text>
          )}
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
  card: {borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 4},
  label: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase'},
  value: {fontSize: 15, fontWeight: '500'},
  sectionLabel: {fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginTop: 8},
  option: {padding: 14, borderRadius: 10, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center'},
  optionLabel: {fontSize: 15},
  optionDesc: {fontSize: 12, marginTop: 2},
  input: {borderWidth: 1.5, borderRadius: 10, padding: 12, fontSize: 14, minHeight: 80},
  submitBtn: {padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8},
  submitBtnText: {color: '#fff', fontWeight: '700', fontSize: 16},
});
