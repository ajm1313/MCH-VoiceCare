/**
 * PersonFormScreen — create or edit a person with full demographics (spec §26).
 *
 * Collects: full_name, date_of_birth, sex, national_id, phone, alternate_phone,
 * address, community, landmark, preferred_language, consent flags (care_consent,
 * model_training_consent, ivr_contact_consent, safe_calling_times, shared_phone_status).
 */
import React, {useEffect, useState} from 'react';
import {Alert, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';
import {
  AppText,
  Button,
  Card,
  Field,
  Screen,
  SectionHeader,
} from '../components/ui';
import {useTheme} from '../theme/useTheme';
import {border, radius, space} from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonForm'>;

const LANGUAGES = ['ENGLISH', 'TWI', 'DAGBANI', 'FANTE', 'GA', 'EWE', 'HAUSA'];
const SHARED_PHONE_OPTIONS = ['PERSONAL', 'SHARED', 'COMMUNITY'];

export function PersonFormScreen({route, navigation}: Props) {
  const {colors} = useTheme();
  const editing = route.params?.personId != null;
  const personId = route.params?.personId;

  // Demographics
  const [fullName, setFullName] = useState('');
  const [dob, setDob] = useState('');
  const [sex, setSex] = useState('FEMALE');
  const [nationalId, setNationalId] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');

  // Address
  const [address, setAddress] = useState('');
  const [community, setCommunity] = useState('');
  const [landmark, setLandmark] = useState('');

  // Language
  const [preferredLanguage, setPreferredLanguage] = useState('ENGLISH');

  // Consent (spec §26 — care consent and model-training consent MUST be separate)
  const [careConsent, setCareConsent] = useState(true);
  const [modelTrainingConsent, setModelTrainingConsent] = useState(false);
  const [communicationOptOut, setCommunicationOptOut] = useState(false);

  // Telephony contact preferences (spec §26)
  const [ivrContactConsent, setIvrContactConsent] = useState(true);
  const [ussdContactConsent, setUssdContactConsent] = useState(true);
  const [safeCallingTimes, setSafeCallingTimes] = useState('');
  const [sharedPhoneStatus, setSharedPhoneStatus] = useState('PERSONAL');

  useEffect(() => {
    if (editing && personId) {
      const rows = query(
        `SELECT full_name, date_of_birth, sex, national_id, phone, alternate_phone,
                address, community, landmark, preferred_language,
                care_consent, model_training_consent, communication_opt_out,
                ivr_contact_consent, ussd_contact_consent,
                safe_calling_times, shared_phone_status
         FROM persons WHERE id = ?`,
        [personId],
      );
      if (rows.length > 0) {
        const r = rows[0] as any;
        setFullName(String(r.full_name || ''));
        setDob(String(r.date_of_birth || ''));
        setSex(String(r.sex || 'FEMALE'));
        setNationalId(String(r.national_id || ''));
        setPhone(String(r.phone || ''));
        setAltPhone(String(r.alternate_phone || ''));
        setAddress(String(r.address || ''));
        setCommunity(String(r.community || ''));
        setLandmark(String(r.landmark || ''));
        setPreferredLanguage(String(r.preferred_language || 'ENGLISH'));
        setCareConsent(r.care_consent === 1 || r.care_consent === true);
        setModelTrainingConsent(r.model_training_consent === 1 || r.model_training_consent === true);
        setCommunicationOptOut(r.communication_opt_out === 1 || r.communication_opt_out === true);
        setIvrContactConsent(r.ivr_contact_consent === 1 || r.ivr_contact_consent === true);
        setUssdContactConsent(r.ussd_contact_consent === 1 || r.ussd_contact_consent === true);
        setSafeCallingTimes(String(r.safe_calling_times || ''));
        setSharedPhoneStatus(String(r.shared_phone_status || 'PERSONAL'));
      }
    }
  }, [editing, personId]);

  const handleSave = () => {
    if (!fullName.trim()) {
      Alert.alert('Validation', 'Full name is required.');
      return;
    }
    const db = getDb();
    const id = editing ? personId! : `person-${Date.now()}`;
    db.execute(
      `INSERT OR REPLACE INTO persons (
        id, full_name, date_of_birth, sex, national_id, phone, alternate_phone,
        address, community, landmark, preferred_language,
        care_consent, model_training_consent, communication_opt_out,
        ivr_contact_consent, ussd_contact_consent,
        safe_calling_times, shared_phone_status, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOT_SYNCED')`,
      [
        id, fullName.trim(), dob.trim() || null, sex,
        nationalId.trim() || null, phone.trim() || null, altPhone.trim() || null,
        address.trim() || null, community.trim() || null, landmark.trim() || null,
        preferredLanguage,
        careConsent ? 1 : 0, modelTrainingConsent ? 1 : 0, communicationOptOut ? 1 : 0,
        ivrContactConsent ? 1 : 0, ussdContactConsent ? 1 : 0,
        safeCallingTimes.trim() || null, sharedPhoneStatus,
      ],
    );
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!editing || !personId) return;
    Alert.alert('Delete', 'Delete this person?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => {
        const db = getDb();
        db.execute('DELETE FROM persons WHERE id = ?', [personId]);
        navigation.goBack();
      }},
    ]);
  };

  const renderOption = (
    label: string,
    selected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={label}
      onPress={onPress}
      style={[
        styles.option,
        {
          borderColor: selected ? colors.primary : colors.border,
          backgroundColor: selected ? colors.primarySubtle : 'transparent',
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{selected}}>
      <AppText
        variant="body"
        tone="inherit"
        style={{color: selected ? colors.primaryStrong : colors.textPrimary, fontWeight: selected ? '700' : '400'}}>
        {label}
      </AppText>
    </Pressable>
  );

  const renderToggle = (
    label: string,
    value: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      style={styles.toggleRow}
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{checked: value}}>
      <AppText variant="body" style={styles.toggleLabel}>{label}</AppText>
      <AppText
        variant="smallStrong"
        tone="inherit"
        style={{color: value ? colors.primary : colors.textSecondary}}>
        {value ? 'YES' : 'NO'}
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
        <AppText variant="h2">{editing ? 'Edit Person' : 'New Person'}</AppText>
      </View>

      {/* Demographics */}
      <Card style={styles.card}>
        <SectionHeader title="Demographics" />
        <Field
          label="Full Name"
          required
          value={fullName}
          onChangeText={setFullName}
          placeholder="Full name"
          icon="user"
        />
        <Field
          label="Date of Birth"
          value={dob}
          onChangeText={setDob}
          placeholder="YYYY-MM-DD"
          icon="calendar"
        />
        <AppText variant="smallStrong" tone="secondary" style={styles.optionLabel}>Sex</AppText>
        {['FEMALE', 'MALE', 'OTHER'].map(g => (
          <View key={g}>
            {renderOption(g, sex === g, () => setSex(g))}
          </View>
        ))}
        <Field
          label="National ID"
          value={nationalId}
          onChangeText={setNationalId}
          placeholder="Ghana Card / NHIS"
          icon="clipboard"
        />
        <Field
          label="Phone"
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone number"
          keyboardType="phone-pad"
          icon="phone"
        />
        <Field
          label="Alternate Phone"
          value={altPhone}
          onChangeText={setAltPhone}
          placeholder="Alternate phone"
          keyboardType="phone-pad"
          icon="phone"
        />
      </Card>

      {/* Address */}
      <Card style={styles.card}>
        <SectionHeader title="Address" />
        <Field
          label="Address"
          value={address}
          onChangeText={setAddress}
          placeholder="Street / house address"
          multiline
          icon="mapPin"
        />
        <Field
          label="Community"
          value={community}
          onChangeText={setCommunity}
          placeholder="Community name"
        />
        <Field
          label="Landmark"
          value={landmark}
          onChangeText={setLandmark}
          placeholder="Landmark description"
          multiline
        />
      </Card>

      {/* Language */}
      <Card style={styles.card}>
        <SectionHeader title="Language" />
        <AppText variant="smallStrong" tone="secondary" style={styles.optionLabel}>Preferred Language</AppText>
        {LANGUAGES.map(lang => (
          <View key={lang}>
            {renderOption(lang, preferredLanguage === lang, () => setPreferredLanguage(lang))}
          </View>
        ))}
      </Card>

      {/* Consent (spec §26) */}
      <Card style={styles.card}>
        <SectionHeader title="Consent & Privacy" overline="§26" />
        {renderToggle('Care consent', careConsent, () => setCareConsent(!careConsent))}
        {renderToggle('Model training / research consent', modelTrainingConsent, () => setModelTrainingConsent(!modelTrainingConsent))}
        {renderToggle('Communication opt-out', communicationOptOut, () => setCommunicationOptOut(!communicationOptOut))}
      </Card>

      {/* Telephony contact preferences (spec §26) */}
      <Card style={styles.card}>
        <SectionHeader title="Contact Preferences" overline="§26" />
        {renderToggle('IVR/DTMF contact consent', ivrContactConsent, () => setIvrContactConsent(!ivrContactConsent))}
        {renderToggle('USSD contact consent', ussdContactConsent, () => setUssdContactConsent(!ussdContactConsent))}
        <Field
          label="Safe calling times"
          value={safeCallingTimes}
          onChangeText={setSafeCallingTimes}
          placeholder="e.g. Mon-Fri 9am-4pm"
          icon="clock"
        />
        <AppText variant="smallStrong" tone="secondary" style={styles.optionLabel}>Shared phone status</AppText>
        {SHARED_PHONE_OPTIONS.map(opt => (
          <View key={opt}>
            {renderOption(opt, sharedPhoneStatus === opt, () => setSharedPhoneStatus(opt))}
          </View>
        ))}
      </Card>

      <Button
        label={editing ? 'Update' : 'Create'}
        icon="check"
        fullWidth
        onPress={handleSave}
        style={styles.saveButton}
      />
      {editing && (
        <Button
          label="Delete"
          variant="danger"
          icon="trash"
          fullWidth
          onPress={handleDelete}
          style={styles.deleteButton}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[3]},
  card: {marginBottom: space[3]},
  optionLabel: {marginBottom: space[1], marginTop: space[2]},
  option: {
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    borderWidth: border.thick,
    marginTop: space[1],
  },
  toggleRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: space[2]},
  toggleLabel: {flex: 1},
  saveButton: {marginTop: space[2]},
  deleteButton: {marginTop: space[3], marginBottom: space[4]},
});
