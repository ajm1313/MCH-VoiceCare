/**
 * ClinicianOverrideScreen — allows a clinician to confirm, escalate,
 * de-escalate, or reject a system-generated clinical decision.
 *
 * Emergency rules cannot be de-escalated (spec §3.1 non-downgrade invariant).
 */
import React, {useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {submitClinicianOverride, type OverrideAction} from '../core/services/clinicianOverride';
import type {RootStackParamList} from '../core/navigation/types';
import {useTheme} from '../theme/useTheme';
import {space} from '../theme/tokens';
import {
  AppText,
  Button,
  Card,
  Field,
  Icon,
  Screen,
  SectionHeader,
  type IconName,
} from '../components/ui';

type Props = NativeStackScreenProps<RootStackParamList, 'ClinicianOverride'>;

const ACTIONS: {label: string; value: OverrideAction; description: string; icon: IconName}[] = [
  {label: 'Confirm', value: 'CONFIRM', description: 'Clinician confirmed the system recommendation.', icon: 'checkCircle'},
  {label: 'Escalate', value: 'ESCALATE', description: 'Clinician escalated to higher urgency.', icon: 'alertTriangle'},
  {label: 'De-escalate', value: 'DEESCALATE', description: 'Clinician de-escalated to lower urgency (with documented justification).', icon: 'alertCircle'},
  {label: 'Reject', value: 'REJECT', description: 'Clinician rejected the system recommendation entirely.', icon: 'close'},
];

export function ClinicianOverrideScreen({route, navigation}: Props) {
  const {colors} = useTheme();
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
      const message = result.data.pending_sync
        ? `${result.data.description}\n\nSaved offline. Will sync when network is available.`
        : result.data.description;
      Alert.alert('Override Recorded', message, [
        {text: 'OK', onPress: () => navigation.goBack()},
      ]);
    } else {
      Alert.alert('Error', result.error ?? 'Failed to submit override.');
    }
  };

  return (
    <Screen scroll>
      <SectionHeader
        title="Clinical Override"
        overline="Clinician review"
        subtitle="Confirm, escalate, de-escalate, or reject the system recommendation."
      />

      {/* Prior recommendation + episode context */}
      <Card style={styles.contextCard}>
        <View style={styles.contextRow}>
          <Icon name="alertTriangle" size={18} color={colors.warning} />
          <AppText variant="smallStrong" tone="warning">
            Safety-critical — all overrides are audit-logged
          </AppText>
        </View>
        <AppText variant="smallStrong" tone="secondary" style={styles.kvLabel}>
          Prior Recommendation
        </AppText>
        <AppText variant="bodyStrong">{priorRecommendation}</AppText>
        <AppText variant="smallStrong" tone="secondary" style={styles.kvLabel}>
          Episode ID
        </AppText>
        <AppText variant="bodyStrong">{episodeId}</AppText>
      </Card>

      {/* Action selector */}
      <SectionHeader title="Action" overline="Override decision" />
      {ACTIONS.map(a => {
        const selected = action === a.value;
        return (
          <Card
            key={a.value}
            variant={selected ? 'elevated' : 'outlined'}
            onPress={() => setAction(a.value)}
            accessibilityLabel={`${a.label}. ${a.description}`}
            style={[
              styles.option,
              selected && {borderColor: colors.primary, backgroundColor: colors.primarySubtle},
            ]}>
            <View style={styles.optionRow}>
              <Icon
                name={a.icon}
                size={20}
                color={selected ? colors.primary : colors.textTertiary}
              />
              <View style={styles.flex}>
                <AppText
                  variant="bodyStrong"
                  tone={selected ? 'brand' : 'primary'}>
                  {a.label}
                </AppText>
                <AppText variant="small" tone="secondary">
                  {a.description}
                </AppText>
              </View>
              {selected ? (
                <Icon name="check" size={18} color={colors.primary} />
              ) : null}
            </View>
          </Card>
        );
      })}

      {/* Reason / justification */}
      <SectionHeader title="Reason / Justification" overline="Required" />
      <Field
        label="Clinical rationale"
        required
        value={reason}
        onChangeText={setReason}
        placeholder="Document the clinical rationale for this override..."
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        helper="A documented reason is required for all override actions and is recorded in the audit trail."
      />

      <Button
        label="Submit Override"
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
        fullWidth
        icon="shieldCheck"
        style={styles.submitBtn}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  contextCard: {marginBottom: space[4]},
  contextRow: {flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[3]},
  kvLabel: {marginTop: space[3], marginBottom: 2},
  option: {marginBottom: space[2]},
  optionRow: {flexDirection: 'row', alignItems: 'flex-start', gap: space[3]},
  flex: {flex: 1},
  submitBtn: {marginTop: space[2]},
});
