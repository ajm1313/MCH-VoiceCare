/**
 * ReferralCreateScreen — create a new referral (spec §18).
 *
 * Collects: patient_name, referral_reason, referring_facility, destination_facility,
 * urgency, pre_referral_care, transport_mode, pregnancy_episode_id, newborn_episode_id.
 */
import React, {useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {getDb} from '../core/db/database';
import {enqueue} from '../core/sync/outbox';
import {withProvenance} from '../core/utils/provenance';
import {logLocalAudit} from '../core/utils/audit';
import {brand, lightColors, urgency} from '../theme/colors';
import {toBackendUrgency, type OfflineUrgency} from '../core/utils/urgencyMapping';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ReferralCreate'>;

const TRANSPORT_MODES = ['', 'AMBULANCE', 'HEALTH_SERVICE_VEHICLE', 'PRIVATE_VEHICLE', 'PUBLIC_TRANSPORT', 'ON_FOOT', 'OTHER'];

export function ReferralCreateScreen({route, navigation}: Props) {
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>New Referral</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>Patient Name *</Text>
          <TextInput style={styles.input} value={patientName} onChangeText={setPatientName} placeholder="Patient name" />
          <Text style={styles.label}>Referral Reason</Text>
          <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Reason for referral" multiline numberOfLines={2} textAlignVertical="top" />
          <Text style={styles.label}>Referring Facility</Text>
          <TextInput style={styles.input} value={referringFacility} onChangeText={setReferringFacility} placeholder="Current facility" />
          <Text style={styles.label}>Destination Facility</Text>
          <TextInput style={styles.input} value={destinationFacility} onChangeText={setDestinationFacility} placeholder="Destination facility" />
          <Text style={styles.label}>Urgency</Text>
          {['RED', 'ORANGE', 'AMBER', 'GREEN', 'GREY'].map(u => (
            <Pressable key={u} onPress={() => setUrgencyLevel(u as OfflineUrgency)} style={[styles.option, urgencyLevel === u && {borderColor: urgency[u as keyof typeof urgency]}]}>
              <Text style={{color: urgencyLevel === u ? urgency[u as keyof typeof urgency] : lightColors.textPrimary, fontSize: 14, fontWeight: urgencyLevel === u ? '700' : '400'}}>{u}</Text>
            </Pressable>
          ))}
        </View>

        {/* Pre-referral care & transport (spec §18) */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Pre-referral Care & Transport</Text>
          <Text style={styles.label}>Pre-referral care given</Text>
          <TextInput style={styles.input} value={preReferralCare} onChangeText={setPreReferralCare} placeholder="e.g. IV fluids, anticonvulsants" multiline numberOfLines={2} textAlignVertical="top" />
          <Text style={styles.label}>Transport mode</Text>
          {TRANSPORT_MODES.map(mode => (
            <Pressable
              key={mode || 'NONE'}
              onPress={() => setTransportMode(mode)}
              style={[styles.option, transportMode === mode && {borderColor: brand.teal}]}
            >
              <Text style={{color: transportMode === mode ? brand.teal : lightColors.textPrimary, fontSize: 14, fontWeight: transportMode === mode ? '700' : '400'}}>
                {mode || '— None —'}
              </Text>
            </Pressable>
          ))}
          <Text style={styles.label}>Estimated transport time (minutes)</Text>
          <TextInput style={styles.input} value={estimatedTransportMinutes} onChangeText={setEstimatedTransportMinutes} placeholder="e.g. 45" keyboardType="numeric" />
        </View>

        <Pressable style={styles.saveButton} onPress={handleSave}>
          <Text style={styles.saveButtonText}>Create Referral</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: lightColors.background},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12},
  back: {fontSize: 16, color: brand.teal},
  title: {fontSize: 18, fontWeight: '700', color: lightColors.textPrimary},
  content: {padding: 16, gap: 12},
  card: {backgroundColor: lightColors.surface, borderWidth: 1, borderColor: lightColors.border, borderRadius: 12, padding: 16, gap: 8},
  sectionTitle: {fontSize: 16, fontWeight: '700', color: lightColors.textPrimary, marginBottom: 4},
  label: {fontSize: 11, fontWeight: '600', color: lightColors.textSecondary, textTransform: 'uppercase', marginTop: 8},
  input: {borderWidth: 1, borderColor: lightColors.border, borderRadius: 8, padding: 12, fontSize: 14, color: lightColors.textPrimary, minHeight: 48},
  option: {paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: lightColors.border, marginTop: 4},
  saveButton: {backgroundColor: brand.teal, padding: 14, borderRadius: 12, alignItems: 'center'},
  saveButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
