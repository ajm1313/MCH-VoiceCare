/**
 * ReferralCreateScreen — create a new referral (spec §18).
 *
 * Collects: patient_name, referral_reason, referring_facility, destination_facility,
 * urgency, pre_referral_care, transport_mode, pregnancy_episode_id, newborn_episode_id.
 */
import React, {useState} from 'react';
import {Alert, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {getDb} from '../core/db/database';
import {enqueue} from '../core/sync/outbox';
import {withProvenance} from '../core/utils/provenance';
import {logLocalAudit} from '../core/utils/audit';
import {toBackendUrgency, type OfflineUrgency} from '../core/utils/urgencyMapping';
import type {RootStackParamList} from '../core/navigation/types';
import {
  AppText,
  Button,
  Card,
  Field,
  Screen,
  SectionHeader,
  UrgencyBadge,
} from '../components/ui';
import {useTheme} from '../theme/useTheme';
import {border, radius, space} from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'ReferralCreate'>;

const TRANSPORT_MODES = ['', 'AMBULANCE', 'HEALTH_SERVICE_VEHICLE', 'PRIVATE_VEHICLE', 'PUBLIC_TRANSPORT', 'ON_FOOT', 'OTHER'];

export function ReferralCreateScreen({route, navigation}: Props) {
  const {colors} = useTheme();
  const [patientName, setPatientName] = useState('');
  const [reason, setReason] = useState('');
  const [referringFacility, setReferringFacility] = useState('');
  const [destinationFacility, setDestinationFacility] = useState('');
  const [urgencyLevel, setUrgencyLevel] = useState<OfflineUrgency>('GREY');
  const [preReferralCare, setPreReferralCare] = useState('');
  const [transportMode, setTransportMode] = useState('');
  const [estimatedTransportMinutes, setEstimatedTransportMinutes] = useState('');

  // Episode links (optional — passed from detail screens or entered manually)
  const pregnancyEpisodeId = route.params?.pregnancyEpisodeId;
  const newbornEpisodeId = route.params?.newbornEpisodeId;

  const handleSave = () => {
    if (!patientName.trim()) {
      Alert.alert('Validation', 'Patient name is required.');
      return;
    }
    const db = getDb();
    const id = `ref-${Date.now()}`;
    const now = new Date().toISOString();
    db.execute(
      `INSERT OR REPLACE INTO referrals (
        id, patient_name, referral_reason, referring_facility, destination_facility,
        status, urgency, pre_referral_care, transport_mode, estimated_transport_time_minutes,
        pregnancy_episode_id, newborn_episode_id,
        created_at, updated_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, 'NOT_SYNCED')`,
      [
        id, patientName, reason, referringFacility, destinationFacility,
        toBackendUrgency(urgencyLevel),
        preReferralCare || null,
        transportMode || null,
        estimatedTransportMinutes ? parseInt(estimatedTransportMinutes, 10) : null,
        pregnancyEpisodeId || null,
        newbornEpisodeId || null,
        now, now,
      ],
    );
    // Also enqueue to outbox with provenance for server sync (spec §9, §18)
    const payload = withProvenance(
      {
        id,
        patient_name: patientName,
        referral_reason: reason,
        referring_facility: referringFacility,
        destination_facility: destinationFacility,
        urgency: toBackendUrgency(urgencyLevel),
        pre_referral_care: preReferralCare || null,
        transport_mode: transportMode || null,
        estimated_transport_time_minutes: estimatedTransportMinutes ? parseInt(estimatedTransportMinutes, 10) : null,
        pregnancy_episode_id: pregnancyEpisodeId || null,
        newborn_episode_id: newbornEpisodeId || null,
      },
      'ReferralCreateScreen',
      'MANUAL',
    );
    enqueue('referral', payload, payload.device_id, 'REFERRAL-v1');
    logLocalAudit({
      action: 'REFERRAL_CREATED',
      entityType: 'referral',
      entityId: id,
      referralEpisodeId: id,
    });
    navigation.goBack();
  };

  const renderOption = (
    label: string,
    selected: boolean,
    onPress: () => void,
    accentColor?: string,
  ) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={[
        styles.option,
        {
          borderColor: selected ? (accentColor ?? colors.primary) : colors.border,
          backgroundColor: selected ? colors.primarySubtle : 'transparent',
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{selected}}>
      <AppText
        variant="body"
        tone="inherit"
        style={{color: selected ? (accentColor ?? colors.primaryStrong) : colors.textPrimary, fontWeight: selected ? '700' : '400'}}>
        {label}
      </AppText>
    </Pressable>
  );

  return (
    <Screen scroll>
      <View style={styles.backRow}>
        <Button
          label="Back"
          variant="ghost"
          icon="chevronLeft"
          onPress={() => navigation.goBack()}
        />
        <AppText variant="h2">New Referral</AppText>
      </View>

      <Card style={styles.card}>
        <SectionHeader title="Patient & Referral" />
        <Field
          label="Patient Name"
          required
          value={patientName}
          onChangeText={setPatientName}
          placeholder="Patient name"
        />
        <Field
          label="Referral Reason"
          value={reason}
          onChangeText={setReason}
          placeholder="Reason for referral"
          multiline
          numberOfLines={2}
          textAlignVertical="top"
        />
        <Field
          label="Referring Facility"
          value={referringFacility}
          onChangeText={setReferringFacility}
          placeholder="Current facility"
          icon="mapPin"
        />
        <Field
          label="Destination Facility"
          value={destinationFacility}
          onChangeText={setDestinationFacility}
          placeholder="Destination facility"
          icon="mapPin"
        />
        <AppText variant="smallStrong" tone="secondary" style={styles.optionLabel}>Urgency</AppText>
        {['RED', 'ORANGE', 'AMBER', 'GREEN', 'GREY'].map(u => (
          <View key={u} style={styles.urgencyRow}>
            <Pressable
              onPress={() => setUrgencyLevel(u as OfflineUrgency)}
              style={[
                styles.option,
                {
                  borderColor: urgencyLevel === u ? colors.primary : colors.border,
                  backgroundColor: urgencyLevel === u ? colors.primarySubtle : 'transparent',
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Urgency ${u}`}
              accessibilityState={{selected: urgencyLevel === u}}>
              <UrgencyBadge value={u} size="sm" solid={urgencyLevel === u} />
            </Pressable>
          </View>
        ))}
      </Card>

      {/* Pre-referral care & transport (spec §18) */}
      <Card style={styles.card}>
        <SectionHeader title="Pre-referral Care & Transport" />
        <Field
          label="Pre-referral care given"
          value={preReferralCare}
          onChangeText={setPreReferralCare}
          placeholder="e.g. IV fluids, anticonvulsants"
          multiline
          numberOfLines={2}
          textAlignVertical="top"
        />
        <AppText variant="smallStrong" tone="secondary" style={styles.optionLabel}>Transport mode</AppText>
        {TRANSPORT_MODES.map(mode => (
          <View key={mode || 'NONE'}>
            {renderOption(mode || '— None —', transportMode === mode, () => setTransportMode(mode))}
          </View>
        ))}
        <Field
          label="Estimated transport time (minutes)"
          value={estimatedTransportMinutes}
          onChangeText={setEstimatedTransportMinutes}
          placeholder="e.g. 45"
          keyboardType="numeric"
          icon="clock"
        />
      </Card>

      <Button
        label="Create Referral"
        icon="check"
        fullWidth
        onPress={handleSave}
        style={styles.saveButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[3]},
  card: {marginBottom: space[3]},
  optionLabel: {marginBottom: space[1], marginTop: space[2]},
  urgencyRow: {marginBottom: space[1]},
  option: {
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    borderWidth: border.thick,
    marginTop: space[1],
    flexDirection: 'row',
    alignItems: 'center',
  },
  saveButton: {marginTop: space[2]},
});
