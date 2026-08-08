/**
 * NewbornObserveScreen — record newborn vitals, danger signs, feeding,
 * jaundice, cord, skin, eyes, elimination, clinical context flags,
 * and worker judgement offline.
 * MCHVC-SPEC-001 v1.1 §16. Enqueues to outbox for sync (DEC-007).
 */
import React, {useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {enqueue} from '../core/sync/outbox';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function NewbornObserveScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const episodeId = (route.params as {episodeId: string}).episodeId;

  // Vitals
  const [temperature, setTemperature] = useState('');
  const [respiratoryRate, setRespiratoryRate] = useState('');
  const [movementStatus, setMovementStatus] = useState('NORMAL');
  const [currentWeight, setCurrentWeight] = useState('');

  // Danger signs
  const [severeChestIndrawing, setSevereChestIndrawing] = useState(false);
  const [grunting, setGrunting] = useState(false);
  const [apnoea, setApnoea] = useState(false);
  const [centralCyanosis, setCentralCyanosis] = useState(false);
  const [convulsions, setConvulsions] = useState(false);
  const [bulgingFontanelle, setBulgingFontanelle] = useState(false);
  const [abdominalDistension, setAbdominalDistension] = useState(false);
  const [yellowPalmsSoles, setYellowPalmsSoles] = useState(false);

  // Extended danger signs
  const [markedIllness, setMarkedIllness] = useState(false);
  const [suspectedSevereInfection, setSuspectedSevereInfection] = useState(false);
  const [rrRepeatConfirmed, setRrRepeatConfirmed] = useState(false);

  // Feeding
  const [feedingStatus, setFeedingStatus] = useState('UNKNOWN');
  const [suckQuality, setSuckQuality] = useState('NORMAL');
  const [feedsLast24h, setFeedsLast24h] = useState('NORMAL');
  const [vomiting, setVomiting] = useState('NONE');

  // Jaundice
  const [jaundiceOnsetHours, setJaundiceOnsetHours] = useState('');
  const [bilirubinValue, setBilirubinValue] = useState('');

  // Cord, skin, eyes
  const [umbilicalStatus, setUmbilicalStatus] = useState('CLEAN_DRY');
  const [skinPustulesExtent, setSkinPustulesExtent] = useState('NONE');
  const [eyeDischarge, setEyeDischarge] = useState('NONE');

  // Elimination
  const [urinePassed, setUrinePassed] = useState('YES');
  const [meconiumPassed, setMeconiumPassed] = useState('YES');

  // Clinical context flags
  const [recurrentHypothermia, setRecurrentHypothermia] = useState(false);
  const [respAbnormalityNeedsVerification, setRespAbnormalityNeedsVerification] = useState(false);
  const [newbornExamDone, setNewbornExamDone] = useState(false);
  const [dischargedSickSmall, setDischargedSickSmall] = useState(false);
  const [missedEarlyFollowup, setMissedEarlyFollowup] = useState(false);
  const [isRequiredContact, setIsRequiredContact] = useState(false);
  const [isDangerAssessment, setIsDangerAssessment] = useState(false);
  const [symptomNotUnderstood, setSymptomNotUnderstood] = useState(false);
  const [caregiverUncontactable, setCaregiverUncontactable] = useState(false);

  // Worker judgement
  const [workerJudgementCritical, setWorkerJudgementCritical] = useState(false);
  const [rationale, setRationale] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    enqueue(
      'newborn_observation',
      {
        newborn: episodeId,
        temperature_c: temperature ? parseFloat(temperature) : null,
        respiratory_rate_min: respiratoryRate ? parseInt(respiratoryRate, 10) : null,
        movement_status: movementStatus,
        current_weight_g: currentWeight ? parseInt(currentWeight, 10) : null,
        severe_chest_indrawing: severeChestIndrawing,
        grunting,
        apnoea_or_gasping: apnoea,
        central_cyanosis: centralCyanosis,
        convulsions,
        bulging_fontanelle: bulgingFontanelle,
        abdominal_distension: abdominalDistension,
        yellow_palms_soles: yellowPalmsSoles,
        marked_illness: markedIllness,
        suspected_severe_infection: suspectedSevereInfection,
        rr_repeat_confirmed: rrRepeatConfirmed,
        feeding_status: feedingStatus,
        suck_quality: suckQuality,
        feeds_last_24h: feedsLast24h,
        vomiting,
        jaundice_onset_age_hours: jaundiceOnsetHours ? parseInt(jaundiceOnsetHours, 10) : null,
        bilirubin_value: bilirubinValue ? parseFloat(bilirubinValue) : null,
        umbilical_status: umbilicalStatus,
        skin_pustules_extent: skinPustulesExtent,
        eye_discharge: eyeDischarge,
        urine_passed: urinePassed,
        meconium_passed: meconiumPassed,
        recurrent_hypothermia_despite_warming: recurrentHypothermia,
        respiratory_abnormality_needs_verification: respAbnormalityNeedsVerification,
        newborn_exam_done: newbornExamDone,
        discharged_sick_small: dischargedSickSmall,
        missed_early_followup: missedEarlyFollowup,
        is_required_contact: isRequiredContact,
        is_danger_assessment: isDangerAssessment,
        symptom_not_understood: symptomNotUnderstood,
        caregiver_uncontactable: caregiverUncontactable,
        worker_judgement_critical: workerJudgementCritical,
        worker_judgement_rationale: rationale,
        source_type: 'WORKER_APP',
      },
      'device-001',
      'NEO-RULES-v1.1',
    );
    setSaving(false);
    navigation.goBack();
  };

  return (
    <ScrollView style={[styles.container, {backgroundColor: colors.background}]}>
      {/* Vital Signs */}
      <View style={[styles.section, {backgroundColor: colors.surface}]}>
        <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Vital Signs</Text>
        <Text style={[styles.label, {color: colors.textSecondary}]}>Temperature (°C)</Text>
        <TextInput style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={temperature} onChangeText={setTemperature} keyboardType="numeric" placeholder="36.5" />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Respiratory rate (/min)</Text>
        <TextInput style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={respiratoryRate} onChangeText={setRespiratoryRate} keyboardType="numeric" placeholder="40" />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Current weight (g)</Text>
        <TextInput style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={currentWeight} onChangeText={setCurrentWeight} keyboardType="numeric" placeholder="3200" />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Movement Status</Text>
        <ChipPicker value={movementStatus} onChange={setMovementStatus}
          options={['NORMAL', 'REDUCED', 'ABSENT', 'UNKNOWN']} colors={colors} />
      </View>

      {/* Danger Signs */}
      <View style={[styles.section, {backgroundColor: colors.surface}]}>
        <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Danger Signs</Text>
        <ToggleRow label="Severe chest indrawing" value={severeChestIndrawing} onChange={setSevereChestIndrawing} colors={colors} />
        <ToggleRow label="Grunting" value={grunting} onChange={setGrunting} colors={colors} />
        <ToggleRow label="Apnoea or gasping" value={apnoea} onChange={setApnoea} colors={colors} />
        <ToggleRow label="Central cyanosis" value={centralCyanosis} onChange={setCentralCyanosis} colors={colors} />
        <ToggleRow label="Convulsions" value={convulsions} onChange={setConvulsions} colors={colors} />
        <ToggleRow label="Bulging fontanelle" value={bulgingFontanelle} onChange={setBulgingFontanelle} colors={colors} />
        <ToggleRow label="Abdominal distension" value={abdominalDistension} onChange={setAbdominalDistension} colors={colors} />
        <ToggleRow label="Yellow palms/soles" value={yellowPalmsSoles} onChange={setYellowPalmsSoles} colors={colors} />
        <ToggleRow label="Marked illness" value={markedIllness} onChange={setMarkedIllness} colors={colors} />
        <ToggleRow label="Suspected severe infection" value={suspectedSevereInfection} onChange={setSuspectedSevereInfection} colors={colors} />
        <ToggleRow label="RR repeat confirmed" value={rrRepeatConfirmed} onChange={setRrRepeatConfirmed} colors={colors} />
      </View>

      {/* Feeding */}
      <View style={[styles.section, {backgroundColor: colors.surface}]}>
        <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Feeding</Text>
        <Text style={[styles.label, {color: colors.textSecondary}]}>Feeding Status</Text>
        <ChipPicker value={feedingStatus} onChange={setFeedingStatus}
          options={['UNKNOWN', 'BREASTFED', 'MIXED', 'EXPRESSED_BREASTMILK', 'FORMULA', 'NOT_FEEDING', 'STOPPED_FEEDING']} colors={colors} />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Suck Quality</Text>
        <ChipPicker value={suckQuality} onChange={setSuckQuality}
          options={['NORMAL', 'WEAK', 'NONE', 'UNKNOWN']} colors={colors} />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Feeds in last 24h</Text>
        <ChipPicker value={feedsLast24h} onChange={setFeedsLast24h}
          options={['NORMAL', 'REDUCED', 'NONE', 'UNKNOWN']} colors={colors} />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Vomiting</Text>
        <ChipPicker value={vomiting} onChange={setVomiting}
          options={['NONE', 'MILD', 'GREEN', 'PROJECTILE', 'UNKNOWN']} colors={colors} />
      </View>

      {/* Jaundice */}
      <View style={[styles.section, {backgroundColor: colors.surface}]}>
        <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Jaundice</Text>
        <Text style={[styles.label, {color: colors.textSecondary}]}>Jaundice onset age (hours)</Text>
        <TextInput style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={jaundiceOnsetHours} onChangeText={setJaundiceOnsetHours} keyboardType="numeric" placeholder="24" />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Bilirubin value (mg/dL)</Text>
        <TextInput style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={bilirubinValue} onChangeText={setBilirubinValue} keyboardType="numeric" placeholder="12.5" />
      </View>

      {/* Cord, Skin, Eyes */}
      <View style={[styles.section, {backgroundColor: colors.surface}]}>
        <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Cord, Skin & Eyes</Text>
        <Text style={[styles.label, {color: colors.textSecondary}]}>Umbilical Status</Text>
        <ChipPicker value={umbilicalStatus} onChange={setUmbilicalStatus}
          options={['CLEAN_DRY', 'REDNESS_LOCALISED', 'REDNESS_SPREADING', 'PUSS_DISCHARGE', 'UNKNOWN']} colors={colors} />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Skin Pustules</Text>
        <ChipPicker value={skinPustulesExtent} onChange={setSkinPustulesExtent}
          options={['NONE', 'FEW_LOCALISED', 'WIDESPREAD', 'UNKNOWN']} colors={colors} />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Eye Discharge</Text>
        <ChipPicker value={eyeDischarge} onChange={setEyeDischarge}
          options={['NONE', 'CLEAR', 'PURULENT', 'UNKNOWN']} colors={colors} />
      </View>

      {/* Elimination */}
      <View style={[styles.section, {backgroundColor: colors.surface}]}>
        <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Elimination</Text>
        <Text style={[styles.label, {color: colors.textSecondary}]}>Urine Passed</Text>
        <ChipPicker value={urinePassed} onChange={setUrinePassed}
          options={['YES', 'NO', 'UNKNOWN']} colors={colors} />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Meconium Passed</Text>
        <ChipPicker value={meconiumPassed} onChange={setMeconiumPassed}
          options={['YES', 'NO', 'UNKNOWN']} colors={colors} />
      </View>

      {/* Clinical Context Flags */}
      <View style={[styles.section, {backgroundColor: colors.surface}]}>
        <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Clinical Context Flags</Text>
        <ToggleRow label="Recurrent hypothermia despite warming" value={recurrentHypothermia} onChange={setRecurrentHypothermia} colors={colors} />
        <ToggleRow label="Respiratory abnormality needs verification" value={respAbnormalityNeedsVerification} onChange={setRespAbnormalityNeedsVerification} colors={colors} />
        <ToggleRow label="Newborn exam done" value={newbornExamDone} onChange={setNewbornExamDone} colors={colors} />
        <ToggleRow label="Discharged sick/small" value={dischargedSickSmall} onChange={setDischargedSickSmall} colors={colors} />
        <ToggleRow label="Missed early follow-up" value={missedEarlyFollowup} onChange={setMissedEarlyFollowup} colors={colors} />
        <ToggleRow label="Is required contact" value={isRequiredContact} onChange={setIsRequiredContact} colors={colors} />
        <ToggleRow label="Is danger assessment" value={isDangerAssessment} onChange={setIsDangerAssessment} colors={colors} />
        <ToggleRow label="Symptom not understood" value={symptomNotUnderstood} onChange={setSymptomNotUnderstood} colors={colors} />
        <ToggleRow label="Caregiver uncontactable" value={caregiverUncontactable} onChange={setCaregiverUncontactable} colors={colors} />
      </View>

      {/* Worker Judgement */}
      <View style={[styles.section, {backgroundColor: colors.surface}]}>
        <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Worker Judgement</Text>
        <ToggleRow label="Critical (override)" value={workerJudgementCritical} onChange={setWorkerJudgementCritical} colors={colors} />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Rationale</Text>
        <TextInput style={[styles.input, styles.multiline, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={rationale} onChangeText={setRationale} multiline placeholder="Clinical reasoning..." />
      </View>

      <Pressable onPress={handleSave} disabled={saving}
        style={[styles.button, {backgroundColor: colors.primary, opacity: saving ? 0.6 : 1}]}>
        <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Observation'}</Text>
      </Pressable>
    </ScrollView>
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
    <View style={styles.switchRow}>
      <Text style={[styles.label, {color: colors.textPrimary, flex: 1, flexWrap: 'wrap'}]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{false: colors.border, true: colors.primary}} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  section: {margin: 16, padding: 16, borderRadius: 12},
  sectionTitle: {fontSize: 16, fontWeight: '700', marginBottom: 12},
  label: {fontSize: 13, fontWeight: '500', marginTop: 8, marginBottom: 4},
  input: {borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15},
  multiline: {minHeight: 80, textAlignVertical: 'top'},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8},
  chip: {paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1},
  switchRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8},
  button: {margin: 16, padding: 14, borderRadius: 12, alignItems: 'center'},
  buttonText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
