/**
 * NewbornRegisterScreen — register a birth episode and newborn episode offline.
 * Captures birth details and newborn baseline fields matching the backend forms.
 * Enqueues to outbox for sync (SYNC-001).
 */
import React, {useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {enqueue} from '../core/sync/outbox';
import {checkMotherChildPairExists, checkChildExists, checkWomanExists} from '../core/dedup/personDedup';
import type {RootStackParamList} from '../core/navigation/types';
import {Alert} from 'react-native';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function NewbornRegisterScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();

  // Birth episode
  const [pregnancyId, setPregnancyId] = useState('');
  const [birthDatetime, setBirthDatetime] = useState('');
  const [placeOfBirth, setPlaceOfBirth] = useState('FACILITY');
  const [skilledAttendant, setSkilledAttendant] = useState(true);
  const [modeOfDelivery, setModeOfDelivery] = useState('SPONTANEOUS_VAGINAL');
  const [maternalFever, setMaternalFever] = useState(false);
  const [romHours, setRomHours] = useState('');
  const [liquorQuality, setLiquorQuality] = useState('CLEAR');

  // Newborn episode — identity
  const [childName, setChildName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [childId, setChildId] = useState('');
  const [motherId, setMotherId] = useState('');
  const [assignedChps, setAssignedChps] = useState('');
  const [assignedWorker, setAssignedWorker] = useState('');

  // Newborn episode — birth details
  const [sex, setSex] = useState('UNKNOWN');
  const [gestationalAge, setGestationalAge] = useState('');
  const [birthWeight, setBirthWeight] = useState('');
  const [lengthCm, setLengthCm] = useState('');
  const [headCirc, setHeadCirc] = useState('');
  const [multipleBirthOrder, setMultipleBirthOrder] = useState('');
  const [criedImmediately, setCriedImmediately] = useState(true);
  const [resuscitationRequired, setResuscitationRequired] = useState(false);
  const [resuscitationDuration, setResuscitationDuration] = useState('');
  const [apgar1, setApgar1] = useState('');
  const [apgar5, setApgar5] = useState('');

  // Essential care & KMC
  const [essentialCareComplete, setEssentialCareComplete] = useState(true);
  const [breastfeedingInit, setBreastfeedingInit] = useState('');
  const [kmcStatus, setKmcStatus] = useState('NOT_ELIGIBLE');
  const [kmcHours, setKmcHours] = useState('');
  const [hospitalDischargeDate, setHospitalDischargeDate] = useState('');
  const [dischargeDiagnoses, setDischargeDiagnoses] = useState('');
  const [nextFollowUp, setNextFollowUp] = useState('');

  // Access & caregiver
  const [travelTime, setTravelTime] = useState('');
  const [currentLocation, setCurrentLocation] = useState('WITH_MOTHER');
  const [maternalAbility, setMaternalAbility] = useState('ABLE');
  const [altCaregiver, setAltCaregiver] = useState(false);

  // Risk flags
  const [prevNbuAdmission, setPrevNbuAdmission] = useState(false);
  const [congenitalAbnormality, setCongenitalAbnormality] = useState(false);
  const [complexFeedingPlan, setComplexFeedingPlan] = useState(false);
  const [maternalDeath, setMaternalDeath] = useState(false);
  const [severeAccessBarrier, setSevereAccessBarrier] = useState(false);
  const [missedPostnatalContact, setMissedPostnatalContact] = useState(false);

  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    // Dedup check — prevent duplicate mother-child pair
    if (childName.trim() && motherName.trim()) {
      const pairMatch = checkMotherChildPairExists(motherName, childName);
      if (pairMatch.matched) {
        Alert.alert(
          'Duplicate Mother-Child Pair',
          `This mother-child pair (${motherName} → ${childName}) is already registered in ${pairMatch.source}.\n\nUse the existing record instead of creating a duplicate.`,
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'View Existing',
              onPress: () => {
                setSaving(false);
                navigation.goBack();
              },
            },
          ],
        );
        return;
      }
    }

    // Check if child already exists independently
    if (childName.trim()) {
      const childMatch = checkChildExists(childName);
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
    }

    // Check if mother already exists
    if (motherName.trim()) {
      const motherMatch = checkWomanExists(motherName);
      if (motherMatch.matched) {
        Alert.alert(
          'Mother Already Registered',
          `"${motherMatch.existingName}" is already in the system (matched by ${motherMatch.matchField} in ${motherMatch.source}).\n\nUse existing record or register anyway?`,
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Use Existing',
              onPress: () => {
                if (motherMatch.existingId) setMotherId(motherMatch.existingId);
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
    }

    proceedWithRegistration();
  };

  const proceedWithRegistration = () => {
    setSaving(true);
    enqueue(
      'newborn_registration',
      {
        birth_episode: {
          pregnancy: pregnancyId || undefined,
          birth_datetime: birthDatetime || undefined,
          place_of_birth: placeOfBirth,
          skilled_attendant: skilledAttendant,
          mode_of_delivery: modeOfDelivery,
          maternal_fever_labour: maternalFever,
          rupture_membranes_hours: romHours ? parseInt(romHours, 10) : undefined,
          liquor_quality: liquorQuality,
        },
        newborn_episode: {
          child: childId || undefined,
          child_name: childName,
          mother: motherId || undefined,
          mother_name: motherName,
          pregnancy: pregnancyId || undefined,
          multiple_birth_order: multipleBirthOrder ? parseInt(multipleBirthOrder, 10) : undefined,
          sex,
          gestational_age_weeks: gestationalAge ? parseInt(gestationalAge, 10) : undefined,
          birth_weight_g: birthWeight ? parseInt(birthWeight, 10) : undefined,
          length_cm: lengthCm ? parseFloat(lengthCm) : undefined,
          head_circumference_cm: headCirc ? parseFloat(headCirc) : undefined,
          cried_or_breathed_immediately: criedImmediately,
          resuscitation_required: resuscitationRequired,
          resuscitation_duration_minutes: resuscitationDuration ? parseInt(resuscitationDuration, 10) : undefined,
          apgar_1_min: apgar1 ? parseInt(apgar1, 10) : undefined,
          apgar_5_min: apgar5 ? parseInt(apgar5, 10) : undefined,
          essential_care_complete: essentialCareComplete,
          breastfeeding_initiation_datetime: breastfeedingInit || undefined,
          kmc_status: kmcStatus,
          kmc_hours_24h: kmcHours ? parseInt(kmcHours, 10) : undefined,
          hospital_discharge_date: hospitalDischargeDate || undefined,
          discharge_diagnoses: dischargeDiagnoses,
          next_follow_up_datetime: nextFollowUp || undefined,
          travel_time_referral_minutes: travelTime ? parseInt(travelTime, 10) : undefined,
          current_location_status: currentLocation,
          maternal_ability_to_care: maternalAbility,
          alternative_caregiver_available: altCaregiver,
          previous_newborn_unit_admission: prevNbuAdmission,
          congenital_abnormality: congenitalAbnormality,
          complex_feeding_plan: complexFeedingPlan,
          maternal_death: maternalDeath,
          severe_access_barrier: severeAccessBarrier,
          missed_postnatal_contact: missedPostnatalContact,
          assigned_chps: assignedChps || undefined,
          assigned_worker: assignedWorker || undefined,
          source_type: 'WORKER_APP',
        },
      },
      'device-001',
      'NEO-RULES-v1.1',
    );
    setSaving(false);
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={{flex: 1}}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={[styles.container, {backgroundColor: colors.background}]}>
        <Text style={[styles.title, {color: colors.textPrimary}]}>Register Newborn</Text>

        {/* Birth Episode */}
        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Birth Details</Text>
          <LabeledInput label="Pregnancy ID (if linked)" value={pregnancyId} onChange={setPregnancyId} colors={colors} />
          <LabeledInput label="Birth Date/Time" value={birthDatetime} onChange={setBirthDatetime} colors={colors} placeholder="2026-07-27T14:30" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Place of Birth</Text>
          <ChipPicker value={placeOfBirth} onChange={setPlaceOfBirth} options={['FACILITY', 'HOME', 'OTHER', 'UNKNOWN']} colors={colors} />
          <ToggleRow label="Skilled attendant" value={skilledAttendant} onChange={setSkilledAttendant} colors={colors} />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Mode of Delivery</Text>
          <ChipPicker value={modeOfDelivery} onChange={setModeOfDelivery} options={['SPONTANEOUS_VAGINAL', 'ASSISTED_VAGINAL', 'CAESAREAN', 'BREECH', 'UNKNOWN']} colors={colors} />
          <ToggleRow label="Maternal fever in labour" value={maternalFever} onChange={setMaternalFever} colors={colors} />
          <LabeledInput label="ROM (hours)" value={romHours} onChange={setRomHours} colors={colors} keyboardType="numeric" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Liquor Quality</Text>
          <ChipPicker value={liquorQuality} onChange={setLiquorQuality} options={['CLEAR', 'BLOOD_STAINED', 'MECONIUM_STAINED', 'PURULENT', 'UNKNOWN']} colors={colors} />
        </View>

        {/* Identity */}
        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Identity</Text>
          <LabeledInput label="Child Name" value={childName} onChange={setChildName} colors={colors} />
          <LabeledInput label="Mother Name" value={motherName} onChange={setMotherName} colors={colors} />
          <LabeledInput label="Child ID" value={childId} onChange={setChildId} colors={colors} />
          <LabeledInput label="Mother ID" value={motherId} onChange={setMotherId} colors={colors} />
          <LabeledInput label="Assigned CHPS" value={assignedChps} onChange={setAssignedChps} colors={colors} />
          <LabeledInput label="Assigned Worker" value={assignedWorker} onChange={setAssignedWorker} colors={colors} />
        </View>

        {/* Newborn Details */}
        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Newborn Details</Text>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Sex</Text>
          <ChipPicker value={sex} onChange={setSex} options={['MALE', 'FEMALE', 'AMBIGUOUS', 'UNKNOWN']} colors={colors} />
          <View style={styles.row}>
            <LabeledInput label="Gestational Age (wks)" value={gestationalAge} onChange={setGestationalAge} colors={colors} keyboardType="numeric" />
            <LabeledInput label="Birth Weight (g)" value={birthWeight} onChange={setBirthWeight} colors={colors} keyboardType="numeric" />
          </View>
          <View style={styles.row}>
            <LabeledInput label="Length (cm)" value={lengthCm} onChange={setLengthCm} colors={colors} keyboardType="numeric" />
            <LabeledInput label="Head Circ (cm)" value={headCirc} onChange={setHeadCirc} colors={colors} keyboardType="numeric" />
          </View>
          <View style={styles.row}>
            <LabeledInput label="Multiple Birth Order" value={multipleBirthOrder} onChange={setMultipleBirthOrder} colors={colors} keyboardType="numeric" />
            <LabeledInput label="APGAR 1 min" value={apgar1} onChange={setApgar1} colors={colors} keyboardType="numeric" />
          </View>
          <View style={styles.row}>
            <LabeledInput label="APGAR 5 min" value={apgar5} onChange={setApgar5} colors={colors} keyboardType="numeric" />
            <LabeledInput label="Resuscitation (min)" value={resuscitationDuration} onChange={setResuscitationDuration} colors={colors} keyboardType="numeric" />
          </View>
          <ToggleRow label="Cried/breathed immediately" value={criedImmediately} onChange={setCriedImmediately} colors={colors} />
          <ToggleRow label="Resuscitation required" value={resuscitationRequired} onChange={setResuscitationRequired} colors={colors} />
        </View>

        {/* Essential Care & KMC */}
        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Essential Care & KMC</Text>
          <ToggleRow label="Essential care complete" value={essentialCareComplete} onChange={setEssentialCareComplete} colors={colors} />
          <LabeledInput label="Breastfeeding initiation" value={breastfeedingInit} onChange={setBreastfeedingInit} colors={colors} placeholder="2026-07-27T15:00" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>KMC Status</Text>
          <ChipPicker value={kmcStatus} onChange={setKmcStatus} options={['NOT_ELIGIBLE', 'ELIGIBLE', 'ONGOING', 'COMPLETED']} colors={colors} />
          <LabeledInput label="KMC hours (24h)" value={kmcHours} onChange={setKmcHours} colors={colors} keyboardType="numeric" />
          <LabeledInput label="Hospital discharge date" value={hospitalDischargeDate} onChange={setHospitalDischargeDate} colors={colors} placeholder="2026-07-29" />
          <LabeledInput label="Discharge diagnoses" value={dischargeDiagnoses} onChange={setDischargeDiagnoses} colors={colors} />
          <LabeledInput label="Next follow-up" value={nextFollowUp} onChange={setNextFollowUp} colors={colors} placeholder="2026-08-03T10:00" />
        </View>

        {/* Access & Caregiver */}
        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Access & Caregiver</Text>
          <LabeledInput label="Travel time to referral (min)" value={travelTime} onChange={setTravelTime} colors={colors} keyboardType="numeric" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Current Location</Text>
          <ChipPicker value={currentLocation} onChange={setCurrentLocation} options={['WITH_MOTHER', 'FACILITY', 'OTHER_CAREGIVER', 'UNKNOWN']} colors={colors} />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Maternal Ability to Care</Text>
          <ChipPicker value={maternalAbility} onChange={setMaternalAbility} options={['ABLE', 'PARTIALLY_ABLE', 'UNABLE', 'UNKNOWN']} colors={colors} />
          <ToggleRow label="Alternative caregiver available" value={altCaregiver} onChange={setAltCaregiver} colors={colors} />
        </View>

        {/* Risk Flags */}
        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Risk Flags</Text>
          <ToggleRow label="Previous NBU admission" value={prevNbuAdmission} onChange={setPrevNbuAdmission} colors={colors} />
          <ToggleRow label="Congenital abnormality" value={congenitalAbnormality} onChange={setCongenitalAbnormality} colors={colors} />
          <ToggleRow label="Complex feeding plan" value={complexFeedingPlan} onChange={setComplexFeedingPlan} colors={colors} />
          <ToggleRow label="Maternal death" value={maternalDeath} onChange={setMaternalDeath} colors={colors} />
          <ToggleRow label="Severe access barrier" value={severeAccessBarrier} onChange={setSevereAccessBarrier} colors={colors} />
          <ToggleRow label="Missed postnatal contact" value={missedPostnatalContact} onChange={setMissedPostnatalContact} colors={colors} />
        </View>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={[styles.button, {backgroundColor: colors.primary, opacity: saving ? 0.6 : 1}]}>
          <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Register & Queue for Sync'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LabeledInput({
  label, value, onChange, colors, placeholder, keyboardType,
}: {
  label: string; value: string; onChange: (v: string) => void; colors: typeof lightColors; placeholder?: string; keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, {color: colors.textSecondary}]}>{label}</Text>
      <TextInput
        style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
        value={value} onChangeText={onChange} placeholder={placeholder}
        placeholderTextColor={colors.textSecondary} keyboardType={keyboardType || 'default'} />
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

function ToggleRow({label, value, onChange, colors}: {label: string; value: boolean; onChange: (v: boolean) => void; colors: typeof lightColors}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={[styles.toggleLabel, {color: colors.textPrimary}]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{false: colors.border, true: colors.primary}} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  title: {fontSize: 20, fontWeight: '700', padding: 16},
  section: {marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12},
  sectionTitle: {fontSize: 14, fontWeight: '700', marginBottom: 10},
  row: {flexDirection: 'row', gap: 10},
  field: {flex: 1, marginBottom: 8},
  label: {fontSize: 12, fontWeight: '500', marginBottom: 4},
  input: {borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8},
  chip: {paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1},
  toggleRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6},
  toggleLabel: {fontSize: 14, flex: 1, flexWrap: 'wrap'},
  button: {margin: 16, padding: 14, borderRadius: 12, alignItems: 'center'},
  buttonText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
