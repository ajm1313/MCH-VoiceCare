/**
 * PersonFormScreen — create or edit a person with full demographics (spec §26).
 *
 * Collects: full_name, date_of_birth, sex, national_id, phone, alternate_phone,
 * address, community, landmark, preferred_language, consent flags (care_consent,
 * model_training_consent, ivr_contact_consent, safe_calling_times, shared_phone_status).
 */
import React, {useEffect, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonForm'>;

const LANGUAGES = ['ENGLISH', 'TWI', 'DAGBANI', 'FANTE', 'GA', 'EWE', 'HAUSA'];
const SHARED_PHONE_OPTIONS = ['PERSONAL', 'SHARED', 'COMMUNITY'];

export function PersonFormScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
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

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, {color: colors.textPrimary}]}>{editing ? 'Edit Person' : 'New Person'}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Demographics */}
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Demographics</Text>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Full Name *</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={fullName} onChangeText={setFullName} placeholder="Full name" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Date of Birth</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Sex</Text>
          {['FEMALE', 'MALE', 'OTHER'].map(g => (
            <Pressable key={g} onPress={() => setSex(g)} style={[styles.option, sex === g && {borderColor: colors.primary}]}>
              <Text style={{color: sex === g ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: sex === g ? '700' : '400'}}>{g}</Text>
            </Pressable>
          ))}
          <Text style={[styles.label, {color: colors.textSecondary}]}>National ID</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={nationalId} onChangeText={setNationalId} placeholder="Ghana Card / NHIS" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Phone</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={phone} onChangeText={setPhone} placeholder="Phone number" keyboardType="phone-pad" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Alternate Phone</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={altPhone} onChangeText={setAltPhone} placeholder="Alternate phone" keyboardType="phone-pad" />
        </View>

        {/* Address */}
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Address</Text>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Address</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={address} onChangeText={setAddress} placeholder="Street / house address" multiline />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Community</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={community} onChangeText={setCommunity} placeholder="Community name" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Landmark</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={landmark} onChangeText={setLandmark} placeholder="Landmark description" multiline />
        </View>

        {/* Language */}
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Language</Text>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Preferred Language</Text>
          {LANGUAGES.map(lang => (
            <Pressable key={lang} onPress={() => setPreferredLanguage(lang)} style={[styles.option, preferredLanguage === lang && {borderColor: colors.primary}]}>
              <Text style={{color: preferredLanguage === lang ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: preferredLanguage === lang ? '700' : '400'}}>{lang}</Text>
            </Pressable>
          ))}
        </View>

        {/* Consent (spec §26) */}
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Consent & Privacy (§26)</Text>
          <Pressable style={styles.toggleRow} onPress={() => setCareConsent(!careConsent)}>
            <Text style={{color: colors.textPrimary, fontSize: 14, flex: 1}}>Care consent</Text>
            <Text style={{color: careConsent ? colors.primary : colors.textSecondary, fontWeight: '700'}}>{careConsent ? 'YES' : 'NO'}</Text>
          </Pressable>
          <Pressable style={styles.toggleRow} onPress={() => setModelTrainingConsent(!modelTrainingConsent)}>
            <Text style={{color: colors.textPrimary, fontSize: 14, flex: 1}}>Model training / research consent</Text>
            <Text style={{color: modelTrainingConsent ? colors.primary : colors.textSecondary, fontWeight: '700'}}>{modelTrainingConsent ? 'YES' : 'NO'}</Text>
          </Pressable>
          <Pressable style={styles.toggleRow} onPress={() => setCommunicationOptOut(!communicationOptOut)}>
            <Text style={{color: colors.textPrimary, fontSize: 14, flex: 1}}>Communication opt-out</Text>
            <Text style={{color: communicationOptOut ? colors.primary : colors.textSecondary, fontWeight: '700'}}>{communicationOptOut ? 'YES' : 'NO'}</Text>
          </Pressable>
        </View>

        {/* Telephony contact preferences (spec §26) */}
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Contact Preferences (§26)</Text>
          <Pressable style={styles.toggleRow} onPress={() => setIvrContactConsent(!ivrContactConsent)}>
            <Text style={{color: colors.textPrimary, fontSize: 14, flex: 1}}>IVR/DTMF contact consent</Text>
            <Text style={{color: ivrContactConsent ? colors.primary : colors.textSecondary, fontWeight: '700'}}>{ivrContactConsent ? 'YES' : 'NO'}</Text>
          </Pressable>
          <Pressable style={styles.toggleRow} onPress={() => setUssdContactConsent(!ussdContactConsent)}>
            <Text style={{color: colors.textPrimary, fontSize: 14, flex: 1}}>USSD contact consent</Text>
            <Text style={{color: ussdContactConsent ? colors.primary : colors.textSecondary, fontWeight: '700'}}>{ussdContactConsent ? 'YES' : 'NO'}</Text>
          </Pressable>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Safe calling times</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={safeCallingTimes} onChangeText={setSafeCallingTimes} placeholder="e.g. Mon-Fri 9am-4pm" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Shared phone status</Text>
          {SHARED_PHONE_OPTIONS.map(opt => (
            <Pressable key={opt} onPress={() => setSharedPhoneStatus(opt)} style={[styles.option, sharedPhoneStatus === opt && {borderColor: colors.primary}]}>
              <Text style={{color: sharedPhoneStatus === opt ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: sharedPhoneStatus === opt ? '700' : '400'}}>{opt}</Text>
            </Pressable>
          ))}
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
  sectionTitle: {fontSize: 16, fontWeight: '700', marginBottom: 4},
  label: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginTop: 8},
  input: {borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, minHeight: 48},
  option: {paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, marginTop: 4},
  toggleRow: {flexDirection: 'row', alignItems: 'center', paddingVertical: 8},
  saveButton: {padding: 14, borderRadius: 12, alignItems: 'center'},
  saveButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  deleteButton: {padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1},
  deleteButtonText: {fontWeight: '700', fontSize: 15},
});
