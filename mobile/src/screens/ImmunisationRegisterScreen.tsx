/**
 * ImmunisationRegisterScreen — register a child into the immunisation module.
 * Captures demographic and contact fields matching the backend ChildRegistrationForm.
 * Enqueues to outbox for sync (SYNC-001).
 */
import React, {useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {enqueue} from '../core/sync/outbox';
import {checkChildExists} from '../core/dedup/personDedup';
import type {RootStackParamList} from '../core/navigation/types';
import {Alert} from 'react-native';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ImmunisationRegisterScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();

  const [childId, setChildId] = useState('');
  const [childName, setChildName] = useState('');
  const [caregiverName, setCaregiverName] = useState('');
  const [dob, setDob] = useState('');
  const [dobConfidence, setDobConfidence] = useState('CONFIRMED');
  const [currentChps, setCurrentChps] = useState('');
  const [communityCode, setCommunityCode] = useState('');
  const [householdLandmark, setHouseholdLandmark] = useState('');
  const [residenceStatus, setResidenceStatus] = useState('RESIDENT');
  const [phoneOwnership, setPhoneOwnership] = useState('CAREGIVER');
  const [preferredLanguage, setPreferredLanguage] = useState('ENGLISH');
  const [preferredContactChannel, setPreferredContactChannel] = useState('IN_PERSON');
  const [cwcCardNumber, setCwcCardNumber] = useState('');
  const [birthRegistrationId, setBirthRegistrationId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    // Dedup check — prevent duplicate child registration
    const childMatch = checkChildExists(childName || caregiverName, dob, cwcCardNumber);
    if (childMatch.matched) {
      Alert.alert(
        'Child Already Registered',
        `"${childMatch.existingName}" is already registered (matched by ${childMatch.matchField} in ${childMatch.source}).\n\nUse the existing record or register anyway?`,
        [
          {text: 'Cancel', style: 'cancel'},
          {
            text: 'Use Existing',
            onPress: () => {
              if (childMatch.existingId) setChildId(childMatch.existingId);
              setSaving(false);
            },
          },
          {
            text: 'Register Anyway',
            style: 'destructive',
            onPress: () => proceedWithRegistration(),
          },
        ],
      );
      return;
    }
    proceedWithRegistration();
  };

  const proceedWithRegistration = () => {
    setSaving(true);
    enqueue(
      'immunisation_registration',
      {
        child: childId || undefined,
        child_name: childName || undefined,
        primary_caregiver: caregiverName || undefined,
        date_of_birth: dob || undefined,
        dob_confidence: dobConfidence,
        current_chps: currentChps || undefined,
        community_code: communityCode || undefined,
        household_landmark: householdLandmark || undefined,
        residence_status: residenceStatus,
        phone_ownership: phoneOwnership,
        preferred_language: preferredLanguage,
        preferred_contact_channel: preferredContactChannel,
        cwc_card_number: cwcCardNumber || undefined,
        birth_registration_id: birthRegistrationId || undefined,
        source_type: 'WORKER_APP',
      },
      'device-001',
      'GHS-EPI-2026-DRAFT-v1.1',
    );
    setSaving(false);
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={{flex: 1}}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={[styles.container, {backgroundColor: colors.background}]}>
        <Text style={[styles.title, {color: colors.textPrimary}]}>Register Child</Text>

        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Identity</Text>
          <LabeledInput label="Child Name" value={childName} onChange={setChildName} colors={colors} placeholder="Child's full name" />
          <LabeledInput label="Child ID" value={childId} onChange={setChildId} colors={colors} />
          <LabeledInput label="Primary Caregiver Name" value={caregiverName} onChange={setCaregiverName} colors={colors} />
          <LabeledInput label="Date of Birth" value={dob} onChange={setDob} colors={colors} placeholder="2026-01-15" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>DOB Confidence</Text>
          <ChipPicker value={dobConfidence} onChange={setDobConfidence}
            options={['CONFIRMED', 'APPROXIMATE', 'ESTIMATED', 'UNKNOWN']} colors={colors} />
          <LabeledInput label="CWC Card Number" value={cwcCardNumber} onChange={setCwcCardNumber} colors={colors} />
          <LabeledInput label="Birth Registration ID" value={birthRegistrationId} onChange={setBirthRegistrationId} colors={colors} />
        </View>

        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Location & Contact</Text>
          <LabeledInput label="Current CHPS" value={currentChps} onChange={setCurrentChps} colors={colors} />
          <LabeledInput label="Community Code" value={communityCode} onChange={setCommunityCode} colors={colors} />
          <LabeledInput label="Household Landmark" value={householdLandmark} onChange={setHouseholdLandmark} colors={colors} />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Residence Status</Text>
          <ChipPicker value={residenceStatus} onChange={setResidenceStatus}
            options={['RESIDENT', 'MIGRANT', 'NOMADIC', 'UNKNOWN']} colors={colors} />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Phone Ownership</Text>
          <ChipPicker value={phoneOwnership} onChange={setPhoneOwnership}
            options={['CAREGIVER', 'HOUSEHOLD_MEMBER', 'NONE', 'UNKNOWN']} colors={colors} />
        </View>

        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Communication Preferences</Text>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Preferred Language</Text>
          <ChipPicker value={preferredLanguage} onChange={setPreferredLanguage}
            options={['ENGLISH', 'TWI', 'GA', 'DAGBANI', 'EWE', 'HAUSA', 'OTHER']} colors={colors} />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Preferred Contact Channel</Text>
          <ChipPicker value={preferredContactChannel} onChange={setPreferredContactChannel}
            options={['IN_PERSON', 'PHONE_CALL', 'SMS', 'WHATSAPP', 'NONE']} colors={colors} />
        </View>

        <Pressable onPress={handleSave} disabled={saving}
          style={[styles.button, {backgroundColor: colors.primary, opacity: saving ? 0.6 : 1}]}>
          <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Register & Queue for Sync'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LabeledInput({
  label, value, onChange, colors, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; colors: typeof lightColors; placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, {color: colors.textSecondary}]}>{label}</Text>
      <TextInput
        style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
        value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={colors.textSecondary} />
    </View>
  );
}

function ChipPicker({value, onChange, options, colors}: {value: string; onChange: (v: string) => void; options: string[]; colors: typeof lightColors}) {
  return (
    <View style={styles.chipRow}>
      {options.map(opt => (
        <Pressable key={opt} onPress={() => onChange(opt)}
          style={[styles.chip, {backgroundColor: value === opt ? colors.primary : 'transparent', borderColor: colors.border}]}>
          <Text style={{fontSize: 11, fontWeight: '600', color: value === opt ? '#fff' : colors.textSecondary}}>{opt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  title: {fontSize: 20, fontWeight: '700', padding: 16},
  section: {marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12},
  sectionTitle: {fontSize: 14, fontWeight: '700', marginBottom: 10},
  field: {marginBottom: 8},
  label: {fontSize: 12, fontWeight: '500', marginBottom: 4},
  input: {borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8},
  chip: {paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1},
  button: {margin: 16, padding: 14, borderRadius: 12, alignItems: 'center'},
  buttonText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
