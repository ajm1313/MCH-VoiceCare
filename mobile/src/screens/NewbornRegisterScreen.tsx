/**
 * NewbornRegisterScreen — register a birth episode and newborn episode offline.
 * Captures birth details and newborn baseline fields matching the backend forms.
 * Enqueues to outbox for sync (SYNC-001).
 */
import React, {useState} from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import {KeyboardAvoidingViewWrapper} from '../components/ui/KeyboardAvoidingViewWrapper';
import {Alert} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {enqueue} from '../core/sync/outbox';
import {checkMotherChildPairExists, checkChildExists, checkWomanExists} from '../core/dedup/personDedup';
import type {RootStackParamList} from '../core/navigation/types';
import {
  Screen,
  Card,
  Button,
  Field,
  AppText,
  SectionHeader,
} from '../components/ui';
import {useTheme} from '../theme/useTheme';
import {border, radius, space} from '../theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function NewbornRegisterScreen() {
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
    <KeyboardAvoidingViewWrapper style={{flex: 1}}>
      <Screen scroll>
        <SectionHeader title="Register Newborn" />

        {/* Birth Episode */}
        <Card style={styles.section}>
          <SectionHeader title="Birth Details" />
          <Field label="Pregnancy ID (if linked)" value={pregnancyId} onChangeText={setPregnancyId} />
          <Field label="Birth Date/Time" value={birthDatetime} onChangeText={setBirthDatetime} placeholder="2026-07-27T14:30" />
          <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
            Place of Birth
          </AppText>
          <ChipPicker value={placeOfBirth} onChange={setPlaceOfBirth} options={['FACILITY', 'HOME', 'OTHER', 'UNKNOWN']} />
          <ToggleRow label="Skilled attendant" value={skilledAttendant} onChange={setSkilledAttendant} />
          <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
            Mode of Delivery
          </AppText>
          <ChipPicker value={modeOfDelivery} onChange={setModeOfDelivery} options={['SPONTANEOUS_VAGINAL', 'ASSISTED_VAGINAL', 'CAESAREAN', 'BREECH', 'UNKNOWN']} />
          <ToggleRow label="Maternal fever in labour" value={maternalFever} onChange={setMaternalFever} />
          <Field label="ROM (hours)" value={romHours} onChangeText={setRomHours} keyboardType="numeric" />
          <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
            Liquor Quality
          </AppText>
          <ChipPicker value={liquorQuality} onChange={setLiquorQuality} options={['CLEAR', 'BLOOD_STAINED', 'MECONIUM_STAINED', 'PURULENT', 'UNKNOWN']} />
        </Card>

        {/* Identity */}
        <Card style={styles.section}>
          <SectionHeader title="Identity" />
          <Field label="Child Name" value={childName} onChangeText={setChildName} />
          <Field label="Mother Name" value={motherName} onChangeText={setMotherName} />
          <Field label="Child ID" value={childId} onChangeText={setChildId} />
          <Field label="Mother ID" value={motherId} onChangeText={setMotherId} />
          <Field label="Assigned CHPS" value={assignedChps} onChangeText={setAssignedChps} />
          <Field label="Assigned Worker" value={assignedWorker} onChangeText={setAssignedWorker} />
        </Card>

        {/* Newborn Details */}
        <Card style={styles.section}>
          <SectionHeader title="Newborn Details" />
          <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
            Sex
          </AppText>
          <ChipPicker value={sex} onChange={setSex} options={['MALE', 'FEMALE', 'AMBIGUOUS', 'UNKNOWN']} />
          <View style={styles.row}>
            <Field label="Gestational Age (wks)" value={gestationalAge} onChangeText={setGestationalAge} keyboardType="numeric" containerStyle={styles.halfField} />
            <Field label="Birth Weight (g)" value={birthWeight} onChangeText={setBirthWeight} keyboardType="numeric" containerStyle={styles.halfField} />
          </View>
          <View style={styles.row}>
            <Field label="Length (cm)" value={lengthCm} onChangeText={setLengthCm} keyboardType="numeric" containerStyle={styles.halfField} />
            <Field label="Head Circ (cm)" value={headCirc} onChangeText={setHeadCirc} keyboardType="numeric" containerStyle={styles.halfField} />
          </View>
          <View style={styles.row}>
            <Field label="Multiple Birth Order" value={multipleBirthOrder} onChangeText={setMultipleBirthOrder} keyboardType="numeric" containerStyle={styles.halfField} />
            <Field label="APGAR 1 min" value={apgar1} onChangeText={setApgar1} keyboardType="numeric" containerStyle={styles.halfField} />
          </View>
          <View style={styles.row}>
            <Field label="APGAR 5 min" value={apgar5} onChangeText={setApgar5} keyboardType="numeric" containerStyle={styles.halfField} />
            <Field label="Resuscitation (min)" value={resuscitationDuration} onChangeText={setResuscitationDuration} keyboardType="numeric" containerStyle={styles.halfField} />
          </View>
          <ToggleRow label="Cried/breathed immediately" value={criedImmediately} onChange={setCriedImmediately} />
          <ToggleRow label="Resuscitation required" value={resuscitationRequired} onChange={setResuscitationRequired} />
        </Card>

        {/* Essential Care & KMC */}
        <Card style={styles.section}>
          <SectionHeader title="Essential Care & KMC" />
          <ToggleRow label="Essential care complete" value={essentialCareComplete} onChange={setEssentialCareComplete} />
          <Field label="Breastfeeding initiation" value={breastfeedingInit} onChangeText={setBreastfeedingInit} placeholder="2026-07-27T15:00" />
          <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
            KMC Status
          </AppText>
          <ChipPicker value={kmcStatus} onChange={setKmcStatus} options={['NOT_ELIGIBLE', 'ELIGIBLE', 'ONGOING', 'COMPLETED']} />
          <Field label="KMC hours (24h)" value={kmcHours} onChangeText={setKmcHours} keyboardType="numeric" />
          <Field label="Hospital discharge date" value={hospitalDischargeDate} onChangeText={setHospitalDischargeDate} placeholder="2026-07-29" />
          <Field label="Discharge diagnoses" value={dischargeDiagnoses} onChangeText={setDischargeDiagnoses} />
          <Field label="Next follow-up" value={nextFollowUp} onChangeText={setNextFollowUp} placeholder="2026-08-03T10:00" />
        </Card>

        {/* Access & Caregiver */}
        <Card style={styles.section}>
          <SectionHeader title="Access & Caregiver" />
          <Field label="Travel time to referral (min)" value={travelTime} onChangeText={setTravelTime} keyboardType="numeric" />
          <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
            Current Location
          </AppText>
          <ChipPicker value={currentLocation} onChange={setCurrentLocation} options={['WITH_MOTHER', 'FACILITY', 'OTHER_CAREGIVER', 'UNKNOWN']} />
          <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
            Maternal Ability to Care
          </AppText>
          <ChipPicker value={maternalAbility} onChange={setMaternalAbility} options={['ABLE', 'PARTIALLY_ABLE', 'UNABLE', 'UNKNOWN']} />
          <ToggleRow label="Alternative caregiver available" value={altCaregiver} onChange={setAltCaregiver} />
        </Card>

        {/* Risk Flags */}
        <Card style={styles.section}>
          <SectionHeader title="Risk Flags" />
          <ToggleRow label="Previous NBU admission" value={prevNbuAdmission} onChange={setPrevNbuAdmission} />
          <ToggleRow label="Congenital abnormality" value={congenitalAbnormality} onChange={setCongenitalAbnormality} />
          <ToggleRow label="Complex feeding plan" value={complexFeedingPlan} onChange={setComplexFeedingPlan} />
          <ToggleRow label="Maternal death" value={maternalDeath} onChange={setMaternalDeath} />
          <ToggleRow label="Severe access barrier" value={severeAccessBarrier} onChange={setSevereAccessBarrier} />
          <ToggleRow label="Missed postnatal contact" value={missedPostnatalContact} onChange={setMissedPostnatalContact} />
        </Card>

        <Button
          label={saving ? 'Saving...' : 'Register & Queue for Sync'}
          onPress={handleSave}
          loading={saving}
          fullWidth
          icon="plus"
          style={styles.saveButton}
        />
      </Screen>
    </KeyboardAvoidingViewWrapper>
  );
}

function ChipPicker({value, onChange, options}: {value: string; onChange: (v: string) => void; options: string[]}) {
  const {colors} = useTheme();
  return (
    <View style={styles.chipRow}>
      {options.map(opt => {
        const active = value === opt;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            accessibilityRole="button"
            accessibilityLabel={opt}
            accessibilityState={{selected: active}}
            style={[
              styles.chip,
              {
                backgroundColor: active ? colors.primary : 'transparent',
                borderColor: active ? colors.primary : colors.border,
              },
            ]}>
            <AppText
              variant="caption"
              tone="inherit"
              style={{color: active ? colors.onPrimary : colors.textSecondary, fontWeight: '600'}}>
              {opt}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

function ToggleRow({label, value, onChange}: {label: string; value: boolean; onChange: (v: boolean) => void}) {
  const {colors} = useTheme();
  return (
    <View style={styles.toggleRow}>
      <AppText variant="body" style={styles.toggleLabel}>{label}</AppText>
      <Switch value={value} onValueChange={onChange} trackColor={{false: colors.border, true: colors.primary}} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {marginBottom: space[3]},
  row: {flexDirection: 'row', gap: space[3]},
  halfField: {flex: 1},
  pickerLabel: {marginBottom: space[1]},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[3]},
  chip: {paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.sm, borderWidth: border.thick},
  toggleRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space[2]},
  toggleLabel: {flex: 1, flexWrap: 'wrap'},
  saveButton: {marginTop: space[2], marginBottom: space[4]},
});
