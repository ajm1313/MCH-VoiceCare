/**
 * NewbornObserveScreen — record newborn vitals, danger signs, feeding,
 * jaundice, cord, skin, eyes, elimination, clinical context flags,
 * and worker judgement offline.
 * MCHVC-SPEC-001 v1.1 §16. Enqueues to outbox for sync (DEC-007).
 */
import React, {useState} from 'react';
import {Pressable, StyleSheet, Switch, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {enqueue} from '../core/sync/outbox';
import {withProvenance} from '../core/utils/provenance';
import {logLocalAudit} from '../core/utils/audit';
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

export function NewbornObserveScreen() {
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
    const payload = withProvenance(
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
      },
      'NewbornObserveScreen',
      'MANUAL',
    );
    enqueue(
      'newborn_observation',
      payload,
      payload.device_id,
      'NEO-RULES-v1.1',
    );
    logLocalAudit({
      action: 'RECORD_CREATE',
      entityType: 'newborn_observation',
      entityId: payload.device_id,
      pregnancyEpisodeId: episodeId,
    });
    setSaving(false);
    navigation.goBack();
  };

  return (
    <Screen scroll>
      {/* Vital Signs */}
      <Card style={styles.section}>
        <SectionHeader title="Vital Signs" />
        <Field
          label="Temperature (°C)"
          value={temperature}
          onChangeText={setTemperature}
          keyboardType="numeric"
          placeholder="36.5"
        />
        <Field
          label="Respiratory rate (/min)"
          value={respiratoryRate}
          onChangeText={setRespiratoryRate}
          keyboardType="numeric"
          placeholder="40"
        />
        <Field
          label="Current weight (g)"
          value={currentWeight}
          onChangeText={setCurrentWeight}
          keyboardType="numeric"
          placeholder="3200"
        />
        <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
          Movement Status
        </AppText>
        <ChipPicker value={movementStatus} onChange={setMovementStatus}
          options={['NORMAL', 'REDUCED', 'ABSENT', 'UNKNOWN']} />
      </Card>

      {/* Danger Signs */}
      <Card style={styles.section}>
        <SectionHeader title="Danger Signs" />
        <ToggleRow label="Severe chest indrawing" value={severeChestIndrawing} onChange={setSevereChestIndrawing} />
        <ToggleRow label="Grunting" value={grunting} onChange={setGrunting} />
        <ToggleRow label="Apnoea or gasping" value={apnoea} onChange={setApnoea} />
        <ToggleRow label="Central cyanosis" value={centralCyanosis} onChange={setCentralCyanosis} />
        <ToggleRow label="Convulsions" value={convulsions} onChange={setConvulsions} />
        <ToggleRow label="Bulging fontanelle" value={bulgingFontanelle} onChange={setBulgingFontanelle} />
        <ToggleRow label="Abdominal distension" value={abdominalDistension} onChange={setAbdominalDistension} />
        <ToggleRow label="Yellow palms/soles" value={yellowPalmsSoles} onChange={setYellowPalmsSoles} />
        <ToggleRow label="Marked illness" value={markedIllness} onChange={setMarkedIllness} />
        <ToggleRow label="Suspected severe infection" value={suspectedSevereInfection} onChange={setSuspectedSevereInfection} />
        <ToggleRow label="RR repeat confirmed" value={rrRepeatConfirmed} onChange={setRrRepeatConfirmed} />
      </Card>

      {/* Feeding */}
      <Card style={styles.section}>
        <SectionHeader title="Feeding" />
        <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
          Feeding Status
        </AppText>
        <ChipPicker value={feedingStatus} onChange={setFeedingStatus}
          options={['UNKNOWN', 'BREASTFED', 'MIXED', 'EXPRESSED_BREASTMILK', 'FORMULA', 'NOT_FEEDING', 'STOPPED_FEEDING']} />
        <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
          Suck Quality
        </AppText>
        <ChipPicker value={suckQuality} onChange={setSuckQuality}
          options={['NORMAL', 'WEAK', 'NONE', 'UNKNOWN']} />
        <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
          Feeds in last 24h
        </AppText>
        <ChipPicker value={feedsLast24h} onChange={setFeedsLast24h}
          options={['NORMAL', 'REDUCED', 'NONE', 'UNKNOWN']} />
        <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
          Vomiting
        </AppText>
        <ChipPicker value={vomiting} onChange={setVomiting}
          options={['NONE', 'MILD', 'GREEN', 'PROJECTILE', 'UNKNOWN']} />
      </Card>

      {/* Jaundice */}
      <Card style={styles.section}>
        <SectionHeader title="Jaundice" />
        <Field
          label="Jaundice onset age (hours)"
          value={jaundiceOnsetHours}
          onChangeText={setJaundiceOnsetHours}
          keyboardType="numeric"
          placeholder="24"
        />
        <Field
          label="Bilirubin value (mg/dL)"
          value={bilirubinValue}
          onChangeText={setBilirubinValue}
          keyboardType="numeric"
          placeholder="12.5"
        />
      </Card>

      {/* Cord, Skin, Eyes */}
      <Card style={styles.section}>
        <SectionHeader title="Cord, Skin & Eyes" />
        <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
          Umbilical Status
        </AppText>
        <ChipPicker value={umbilicalStatus} onChange={setUmbilicalStatus}
          options={['CLEAN_DRY', 'REDNESS_LOCALISED', 'REDNESS_SPREADING', 'PUSS_DISCHARGE', 'UNKNOWN']} />
        <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
          Skin Pustules
        </AppText>
        <ChipPicker value={skinPustulesExtent} onChange={setSkinPustulesExtent}
          options={['NONE', 'FEW_LOCALISED', 'WIDESPREAD', 'UNKNOWN']} />
        <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
          Eye Discharge
        </AppText>
        <ChipPicker value={eyeDischarge} onChange={setEyeDischarge}
          options={['NONE', 'CLEAR', 'PURULENT', 'UNKNOWN']} />
      </Card>

      {/* Elimination */}
      <Card style={styles.section}>
        <SectionHeader title="Elimination" />
        <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
          Urine Passed
        </AppText>
        <ChipPicker value={urinePassed} onChange={setUrinePassed}
          options={['YES', 'NO', 'UNKNOWN']} />
        <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>
          Meconium Passed
        </AppText>
        <ChipPicker value={meconiumPassed} onChange={setMeconiumPassed}
          options={['YES', 'NO', 'UNKNOWN']} />
      </Card>

      {/* Clinical Context Flags */}
      <Card style={styles.section}>
        <SectionHeader title="Clinical Context Flags" />
        <ToggleRow label="Recurrent hypothermia despite warming" value={recurrentHypothermia} onChange={setRecurrentHypothermia} />
        <ToggleRow label="Respiratory abnormality needs verification" value={respAbnormalityNeedsVerification} onChange={setRespAbnormalityNeedsVerification} />
        <ToggleRow label="Newborn exam done" value={newbornExamDone} onChange={setNewbornExamDone} />
        <ToggleRow label="Discharged sick/small" value={dischargedSickSmall} onChange={setDischargedSickSmall} />
        <ToggleRow label="Missed early follow-up" value={missedEarlyFollowup} onChange={setMissedEarlyFollowup} />
        <ToggleRow label="Is required contact" value={isRequiredContact} onChange={setIsRequiredContact} />
        <ToggleRow label="Is danger assessment" value={isDangerAssessment} onChange={setIsDangerAssessment} />
        <ToggleRow label="Symptom not understood" value={symptomNotUnderstood} onChange={setSymptomNotUnderstood} />
        <ToggleRow label="Caregiver uncontactable" value={caregiverUncontactable} onChange={setCaregiverUncontactable} />
      </Card>

      {/* Worker Judgement */}
      <Card style={styles.section}>
        <SectionHeader title="Worker Judgement" />
        <ToggleRow label="Critical (override)" value={workerJudgementCritical} onChange={setWorkerJudgementCritical} />
        <Field
          label="Rationale"
          value={rationale}
          onChangeText={setRationale}
          multiline
          placeholder="Clinical reasoning..."
        />
      </Card>

      <Button
        label={saving ? 'Saving...' : 'Save Observation'}
        onPress={handleSave}
        loading={saving}
        fullWidth
        icon="check"
        style={styles.saveButton}
      />
    </Screen>
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
    <View style={styles.switchRow}>
      <AppText variant="body" style={styles.switchLabel}>{label}</AppText>
      <Switch value={value} onValueChange={onChange} trackColor={{false: colors.border, true: colors.primary}} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: {marginBottom: space[3]},
  pickerLabel: {marginBottom: space[1]},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[3]},
  chip: {paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.sm, borderWidth: border.thick},
  switchRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space[2]},
  switchLabel: {flex: 1, flexWrap: 'wrap'},
  saveButton: {marginTop: space[2], marginBottom: space[4]},
});
