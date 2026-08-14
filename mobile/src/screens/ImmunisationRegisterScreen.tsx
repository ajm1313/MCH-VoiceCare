/**
 * ImmunisationRegisterScreen — register a child into the immunisation module.
 * Captures demographic and contact fields matching the backend ChildRegistrationForm.
 * Enqueues to outbox for sync (SYNC-001).
 */
import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {KeyboardAvoidingViewWrapper} from '../components/ui/KeyboardAvoidingViewWrapper';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {useTheme} from '../theme/useTheme';
import {enqueue} from '../core/sync/outbox';
import {checkChildExists} from '../core/dedup/personDedup';
import {
  Screen,
  Card,
  Button,
  Field,
  SectionHeader,
  AppText,
} from '../components/ui';
import {border, radius, space} from '../theme/tokens';
import {Alert} from 'react-native';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ImmunisationRegisterScreen() {
  const {colors} = useTheme();
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
    <KeyboardAvoidingViewWrapper style={{flex: 1}}>
      <Screen scroll>
        <SectionHeader title="Register Child" overline="Immunisation" />

        <Card style={styles.section}>
          <SectionHeader title="Identity" />
          <Field label="Child Name" value={childName} onChangeText={setChildName} placeholder="Child's full name" />
          <Field label="Child ID" value={childId} onChangeText={setChildId} />
          <Field label="Primary Caregiver Name" value={caregiverName} onChangeText={setCaregiverName} />
          <Field label="Date of Birth" value={dob} onChangeText={setDob} placeholder="2026-01-15" />
          <AppText variant="smallStrong" tone="secondary" style={styles.label}>DOB Confidence</AppText>
          <ChipPicker value={dobConfidence} onChange={setDobConfidence}
            options={['CONFIRMED', 'APPROXIMATE', 'ESTIMATED', 'UNKNOWN']} />
          <Field label="CWC Card Number" value={cwcCardNumber} onChangeText={setCwcCardNumber} />
          <Field label="Birth Registration ID" value={birthRegistrationId} onChangeText={setBirthRegistrationId} />
        </Card>

        <Card style={styles.section}>
          <SectionHeader title="Location & Contact" />
          <Field label="Current CHPS" value={currentChps} onChangeText={setCurrentChps} />
          <Field label="Community Code" value={communityCode} onChangeText={setCommunityCode} />
          <Field label="Household Landmark" value={householdLandmark} onChangeText={setHouseholdLandmark} />
          <AppText variant="smallStrong" tone="secondary" style={styles.label}>Residence Status</AppText>
          <ChipPicker value={residenceStatus} onChange={setResidenceStatus}
            options={['RESIDENT', 'MIGRANT', 'NOMADIC', 'UNKNOWN']} />
          <AppText variant="smallStrong" tone="secondary" style={styles.label}>Phone Ownership</AppText>
          <ChipPicker value={phoneOwnership} onChange={setPhoneOwnership}
            options={['CAREGIVER', 'HOUSEHOLD_MEMBER', 'NONE', 'UNKNOWN']} />
        </Card>

        <Card style={styles.section}>
          <SectionHeader title="Communication Preferences" />
          <AppText variant="smallStrong" tone="secondary" style={styles.label}>Preferred Language</AppText>
          <ChipPicker value={preferredLanguage} onChange={setPreferredLanguage}
            options={['ENGLISH', 'TWI', 'GA', 'DAGBANI', 'EWE', 'HAUSA', 'OTHER']} />
          <AppText variant="smallStrong" tone="secondary" style={styles.label}>Preferred Contact Channel</AppText>
          <ChipPicker value={preferredContactChannel} onChange={setPreferredContactChannel}
            options={['IN_PERSON', 'PHONE_CALL', 'SMS', 'WHATSAPP', 'NONE']} />
        </Card>

        <View style={styles.buttonRow}>
          <Button
            label={saving ? 'Saving...' : 'Register & Queue for Sync'}
            variant="primary"
            size="lg"
            icon="check"
            loading={saving}
            fullWidth
            onPress={handleSave}
          />
        </View>
      </Screen>
    </KeyboardAvoidingViewWrapper>
  );
}

function ChipPicker({value, onChange, options}: {value: string; onChange: (v: string) => void; options: string[]}) {
  const {colors} = useTheme();
  return (
    <View style={styles.chipRow}>
      {options.map(opt => (
        <Pressable
          key={opt}
          onPress={() => onChange(opt)}
          accessibilityRole="button"
          accessibilityLabel={opt}
          accessibilityState={{selected: value === opt}}
          style={[
            styles.chip,
            {
              backgroundColor: value === opt ? colors.primary : 'transparent',
              borderColor: value === opt ? colors.primary : colors.border,
            },
          ]}>
          <AppText
            variant="caption"
            tone="inherit"
            style={{color: value === opt ? colors.onPrimary : colors.textSecondary}}>
            {opt}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {marginVertical: space[2]},
  label: {marginBottom: space[1]},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space[3]},
  chip: {
    paddingHorizontal: space[2],
    paddingVertical: space[1] + 2,
    borderRadius: radius.sm,
    borderWidth: border.thick,
  },
  buttonRow: {marginVertical: space[2]},
});
