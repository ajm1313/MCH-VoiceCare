/**
 * Pregnancy observation form — records vital signs, fetal assessment,
 * urine & fluids, danger signs, and worker judgement offline.
 * Data is enqueued to the outbox for sync (SYNC-001).
 *
 * UX-003: restyled with the shared design system primitives and SVG icons.
 * Clinical behaviour, queries, navigation and accessibility are unchanged.
 */
import React, {useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {enqueue} from '../core/sync/outbox';
import {withProvenance} from '../core/utils/provenance';
import {logLocalAudit} from '../core/utils/audit';
import {useTheme} from '../theme/useTheme';
import {border, radius, space} from '../theme/tokens';
import {Screen} from '../components/ui/Screen';
import {Button} from '../components/ui/Button';
import {Field} from '../components/ui/Input';
import {AppText} from '../components/ui/Text';
import {Icon} from '../components/ui/Icon';
import {SectionHeader} from '../components/ui/Layout';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PregnancyObserve'>;

export function PregnancyObserveScreen({route, navigation}: Props) {
  const {colors} = useTheme();
  const {episodeId} = route.params;

  // Vital signs
  const [bpSys, setBpSys] = useState('');
  const [bpDia, setBpDia] = useState('');
  const [bpRepeat, setBpRepeat] = useState(false);
  const [hb, setHb] = useState('');
  const [temp, setTemp] = useState('');
  const [rr, setRr] = useState('');
  const [weight, setWeight] = useState('');
  const [fundalHeight, setFundalHeight] = useState('');
  const [urineProtein, setUrineProtein] = useState('NONE');

  // Fetal assessment
  const [fhr, setFhr] = useState('');
  const [fetalMovement, setFetalMovement] = useState('NORMAL');
  const [fetalNumber, setFetalNumber] = useState('SINGLE');
  const [presentation, setPresentation] = useState('UNKNOWN');
  const [uterineDiscrepancy, setUterineDiscrepancy] = useState('');

  // Urine & fluids
  const [vaginalBleeding, setVaginalBleeding] = useState('NONE');
  const [fluidLeakage, setFluidLeakage] = useState('NONE');
  const [contractions, setContractions] = useState('NONE');

  // Danger signs
  const [headache, setHeadache] = useState(false);
  const [visual, setVisual] = useState(false);
  const [epigastric, setEpigastric] = useState(false);
  const [convulsion, setConvulsion] = useState(false);
  const [abdPain, setAbdPain] = useState(false);
  const [fever, setFever] = useState(false);
  const [shock, setShock] = useState(false);
  const [breathingDiff, setBreathingDiff] = useState(false);
  const [cordProlapse, setCordProlapse] = useState(false);
  const [vomitingDehydration, setVomitingDehydration] = useState(false);
  const [jaundice, setJaundice] = useState(false);
  const [offensiveDischarge, setOffensiveDischarge] = useState(false);
  const [anaemiaSymptoms, setAnaemiaSymptoms] = useState(false);

  // Extended clinical flags
  const [suspectedSepsis, setSuspectedSepsis] = useState(false);
  const [fhrSeriouslyAbnormal, setFhrSeriouslyAbnormal] = useState(false);
  const [severeAnaemiaUnstable, setSevereAnaemiaUnstable] = useState(false);
  const [emergencyReferralIncomplete, setEmergencyReferralIncomplete] = useState(false);
  const [definitiveFetalAssessment, setDefinitiveFetalAssessment] = useState(false);
  const [growthTrendStatic, setGrowthTrendStatic] = useState(false);
  const [urgentReferralIncomplete, setUrgentReferralIncomplete] = useState(false);
  const [fhrRepeatConfirmed, setFhrRepeatConfirmed] = useState(false);
  const [hbRequiredByProtocol, setHbRequiredByProtocol] = useState(false);
  const [symptomNotUnderstood, setSymptomNotUnderstood] = useState(false);
  const [recordsConflicting, setRecordsConflicting] = useState(false);
  const [clientUncontactable, setClientUncontactable] = useState(false);

  // Worker judgement
  const [judgement, setJudgement] = useState(false);
  const [rationale, setRationale] = useState('');
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    const payload: Record<string, unknown> = {
      pregnancy: episodeId,
      bp_systolic_mm_hg: bpSys ? Number(bpSys) : undefined,
      bp_diastolic_mm_hg: bpDia ? Number(bpDia) : undefined,
      bp_repeat_after_rest: bpRepeat,
      hb_g_dl: hb ? Number(hb) : undefined,
      temperature_c: temp ? Number(temp) : undefined,
      respiratory_rate_min: rr ? Number(rr) : undefined,
      current_weight_kg: weight ? Number(weight) : undefined,
      fundal_height_cm: fundalHeight ? Number(fundalHeight) : undefined,
      urine_protein: urineProtein,
      fetal_heart_rate: fhr ? Number(fhr) : undefined,
      fetal_movement_status: fetalMovement,
      fetal_number: fetalNumber,
      presentation,
      uterine_size_discrepancy_weeks: uterineDiscrepancy ? Number(uterineDiscrepancy) : undefined,
      vaginal_bleeding: vaginalBleeding,
      fluid_leakage: fluidLeakage,
      contractions,
      severe_headache: headache,
      visual_disturbance: visual,
      epigastric_pain: epigastric,
      convulsion_or_unconsciousness: convulsion,
      severe_abdominal_pain: abdPain,
      fever_or_severe_illness: fever,
      suspected_shock_or_collapse: shock,
      severe_breathing_difficulty: breathingDiff,
      suspected_cord_prolapse: cordProlapse,
      persistent_vomiting_dehydration: vomitingDehydration,
      jaundice_or_liver_symptoms: jaundice,
      offensive_discharge_with_fever_pain: offensiveDischarge,
      anaemia_symptoms: anaemiaSymptoms,
      suspected_sepsis: suspectedSepsis,
      fetal_heart_seriously_abnormal: fhrSeriouslyAbnormal,
      severe_anaemia_symptoms_unstable: severeAnaemiaUnstable,
      emergency_referral_incomplete: emergencyReferralIncomplete,
      definitive_fetal_assessment_done: definitiveFetalAssessment,
      growth_trend_static: growthTrendStatic,
      urgent_referral_incomplete_stable: urgentReferralIncomplete,
      fhr_repeat_confirmed: fhrRepeatConfirmed,
      hb_required_by_protocol: hbRequiredByProtocol,
      symptom_not_understood: symptomNotUnderstood,
      records_conflicting: recordsConflicting,
      client_uncontactable: clientUncontactable,
      worker_judgement_critical: judgement,
      worker_judgement_rationale: rationale,
    };

    const payloadWithProvenance = withProvenance(
      payload,
      'PregnancyObserveScreen',
      'MANUAL',
    );

    enqueue('pregnancy_observation', payloadWithProvenance, payloadWithProvenance.device_id, 'PREG-RULES-v1.1');
    logLocalAudit({
      action: 'RECORD_CREATE',
      entityType: 'pregnancy_observation',
      entityId: payloadWithProvenance.device_id,
      pregnancyEpisodeId: episodeId,
    });
    setSaved(true);
    setTimeout(() => navigation.goBack(), 800);
  };

  if (saved) {
    return (
      <Screen>
        <View style={styles.savedContainer}>
          <View style={[styles.savedIcon, {backgroundColor: colors.successSubtle, borderColor: colors.success}]}>
            <Icon name="checkCircle" size={32} color={colors.success} strokeWidth={2} />
          </View>
          <AppText variant="h3" tone="success" center style={styles.savedText}>
            Observation saved
          </AppText>
          <AppText variant="small" tone="secondary" center>
            Queued for sync
          </AppText>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <Button
          label="Cancel"
          variant="ghost"
          size="sm"
          icon="close"
          onPress={() => navigation.goBack()}
          accessibilityLabel="Cancel and go back"
        />
        <AppText variant="h2">Record Observation</AppText>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.form}>
            <SectionHeader title="Vital Signs" overline="Section 1" />
            <View style={styles.row}>
              <Field label="Systolic BP" value={bpSys} onChangeText={setBpSys} placeholder="120" keyboardType="numeric" containerStyle={styles.fieldHalf} />
              <Field label="Diastolic BP" value={bpDia} onChangeText={setBpDia} placeholder="80" keyboardType="numeric" containerStyle={styles.fieldHalf} />
            </View>
            <ToggleRow label="BP repeat after rest" value={bpRepeat} onChange={setBpRepeat} />
            <View style={styles.row}>
              <Field label="Hb (g/dL)" value={hb} onChangeText={setHb} placeholder="11.0" keyboardType="numeric" containerStyle={styles.fieldHalf} />
              <Field label="Temp (°C)" value={temp} onChangeText={setTemp} placeholder="37.0" keyboardType="numeric" containerStyle={styles.fieldHalf} />
            </View>
            <View style={styles.row}>
              <Field label="Resp Rate" value={rr} onChangeText={setRr} placeholder="18" keyboardType="numeric" containerStyle={styles.fieldHalf} />
              <Field label="Weight (kg)" value={weight} onChangeText={setWeight} placeholder="65" keyboardType="numeric" containerStyle={styles.fieldHalf} />
            </View>
            <View style={styles.row}>
              <Field label="Fundal Height (cm)" value={fundalHeight} onChangeText={setFundalHeight} placeholder="24" keyboardType="numeric" containerStyle={styles.fieldHalf} />
            </View>
            <ChipPickerField label="Urine Protein" value={urineProtein} onChange={setUrineProtein} options={['NONE', 'TRACE', '1+', '2+', '3+']} />

            <SectionHeader title="Fetal Assessment" overline="Section 2" />
            <View style={styles.row}>
              <Field label="Fetal Heart Rate" value={fhr} onChangeText={setFhr} placeholder="140" keyboardType="numeric" containerStyle={styles.fieldHalf} />
              <Field label="Uterine Discrepancy (wks)" value={uterineDiscrepancy} onChangeText={setUterineDiscrepancy} placeholder="0" keyboardType="numeric" containerStyle={styles.fieldHalf} />
            </View>
            <ChipPickerField label="Fetal Movement" value={fetalMovement} onChange={setFetalMovement} options={['NORMAL', 'REDUCED', 'ABSENT', 'UNKNOWN']} />
            <ChipPickerField label="Fetal Number" value={fetalNumber} onChange={setFetalNumber} options={['SINGLE', 'MULTIPLE', 'UNKNOWN']} />
            <ChipPickerField label="Presentation" value={presentation} onChange={setPresentation} options={['CEPHALIC', 'BREECH', 'TRANSVERSE', 'UNKNOWN']} />

            <SectionHeader title="Urine & Fluids" overline="Section 3" />
            <ChipPickerField label="Vaginal Bleeding" value={vaginalBleeding} onChange={setVaginalBleeding} options={['NONE', 'SPOTTING', 'HEAVY', 'UNKNOWN']} />
            <ChipPickerField label="Fluid Leakage" value={fluidLeakage} onChange={setFluidLeakage} options={['NONE', 'CLEAR', 'BLOOD_STAINED', 'MECONIUM_STAINED', 'UNKNOWN']} />
            <ChipPickerField label="Contractions" value={contractions} onChange={setContractions} options={['NONE', 'IRREGULAR', 'REGULAR', 'UNKNOWN']} />

            <SectionHeader title="Danger Signs" overline="Section 4" />
            <ToggleRow label="Severe headache" value={headache} onChange={setHeadache} />
            <ToggleRow label="Visual disturbance" value={visual} onChange={setVisual} />
            <ToggleRow label="Epigastric pain" value={epigastric} onChange={setEpigastric} />
            <ToggleRow label="Convulsion / unconscious" value={convulsion} onChange={setConvulsion} />
            <ToggleRow label="Severe abdominal pain" value={abdPain} onChange={setAbdPain} />
            <ToggleRow label="Fever / severe illness" value={fever} onChange={setFever} />
            <ToggleRow label="Suspected shock or collapse" value={shock} onChange={setShock} />
            <ToggleRow label="Severe breathing difficulty" value={breathingDiff} onChange={setBreathingDiff} />
            <ToggleRow label="Suspected cord prolapse" value={cordProlapse} onChange={setCordProlapse} />
            <ToggleRow label="Persistent vomiting / dehydration" value={vomitingDehydration} onChange={setVomitingDehydration} />
            <ToggleRow label="Jaundice or liver symptoms" value={jaundice} onChange={setJaundice} />
            <ToggleRow label="Offensive discharge with fever/pain" value={offensiveDischarge} onChange={setOffensiveDischarge} />
            <ToggleRow label="Anaemia symptoms" value={anaemiaSymptoms} onChange={setAnaemiaSymptoms} />

            <SectionHeader title="Extended Clinical Flags" overline="Section 5" />
            <ToggleRow label="Suspected sepsis" value={suspectedSepsis} onChange={setSuspectedSepsis} />
            <ToggleRow label="Fetal heart seriously abnormal" value={fhrSeriouslyAbnormal} onChange={setFhrSeriouslyAbnormal} />
            <ToggleRow label="Severe anaemia symptoms (unstable)" value={severeAnaemiaUnstable} onChange={setSevereAnaemiaUnstable} />
            <ToggleRow label="Emergency referral incomplete" value={emergencyReferralIncomplete} onChange={setEmergencyReferralIncomplete} />
            <ToggleRow label="Definitive fetal assessment done" value={definitiveFetalAssessment} onChange={setDefinitiveFetalAssessment} />
            <ToggleRow label="Growth trend static" value={growthTrendStatic} onChange={setGrowthTrendStatic} />
            <ToggleRow label="Urgent referral incomplete (stable)" value={urgentReferralIncomplete} onChange={setUrgentReferralIncomplete} />
            <ToggleRow label="FHR repeat confirmed" value={fhrRepeatConfirmed} onChange={setFhrRepeatConfirmed} />
            <ToggleRow label="Hb required by protocol" value={hbRequiredByProtocol} onChange={setHbRequiredByProtocol} />
            <ToggleRow label="Symptom not understood" value={symptomNotUnderstood} onChange={setSymptomNotUnderstood} />
            <ToggleRow label="Records conflicting" value={recordsConflicting} onChange={setRecordsConflicting} />
            <ToggleRow label="Client uncontactable" value={clientUncontactable} onChange={setClientUncontactable} />

            <SectionHeader title="Worker Judgement" overline="Section 6" />
            <ToggleRow label="Worker judgement critical" value={judgement} onChange={setJudgement} />
            {judgement && (
              <Field
                label="Rationale"
                value={rationale}
                onChangeText={setRationale}
                placeholder="Describe clinical concern…"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            )}

            <Button
              label="Save & Queue for Sync"
              onPress={handleSave}
              icon="check"
              fullWidth
              size="lg"
              style={styles.saveButton}
              accessibilityLabel="Save observation and queue for sync"
            />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function ToggleRow({label, value, onChange}: {label: string; value: boolean; onChange: (v: boolean) => void}) {
  const {colors} = useTheme();
  return (
    <View style={styles.toggleRow}>
      <AppText variant="body" style={styles.toggleLabel}>{label}</AppText>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{false: colors.border, true: colors.primary}}
        accessibilityRole="switch"
        accessibilityState={{checked: value}}
        accessibilityLabel={label}
      />
    </View>
  );
}

function ChipPickerField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  const {colors} = useTheme();
  return (
    <View style={styles.chipField}>
      <AppText variant="smallStrong" tone="secondary" style={styles.chipLabel}>{label}</AppText>
      <View style={styles.chipRow}>
        {options.map(opt => {
          const selected = value === opt;
          return (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              accessibilityRole="button"
              accessibilityLabel={`${label}: ${opt}`}
              accessibilityState={{selected}}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? colors.primary : 'transparent',
                  borderColor: selected ? colors.primary : colors.border,
                },
              ]}>
              <AppText
                variant="caption"
                tone="inherit"
                style={{color: selected ? colors.onPrimary : colors.textSecondary}}>
                {opt}
              </AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    marginBottom: space[2],
    paddingHorizontal: space[4],
  },
  form: {paddingHorizontal: space[4], paddingBottom: space[8], gap: space[2]},
  row: {flexDirection: 'row', gap: space[2]},
  fieldHalf: {flex: 1},
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space[2],
    gap: space[3],
  },
  toggleLabel: {flex: 1, flexWrap: 'wrap'},
  chipField: {marginBottom: space[2]},
  chipLabel: {marginBottom: space[1]},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: space[1]},
  chip: {
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.md,
    borderWidth: border.thick,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {marginTop: space[4]},
  savedContainer: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: space[6]},
  savedIcon: {
    width: 64,
    height: 64,
    borderRadius: radius.xxl,
    borderWidth: border.thick,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[4],
  },
  savedText: {marginBottom: space[1]},
});
