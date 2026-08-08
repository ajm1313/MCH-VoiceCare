/**
 * Pregnancy observation form — records vital signs, fetal assessment,
 * urine & fluids, danger signs, and worker judgement offline.
 * Data is enqueued to the outbox for sync (SYNC-001).
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
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {enqueue} from '../core/sync/outbox';
import {brand, lightColors} from '../theme/colors';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PregnancyObserve'>;

export function PregnancyObserveScreen({route, navigation}: Props) {
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
      source_type: 'WORKER_APP',
    };

    enqueue('pregnancy_observation', payload, 'device-001', 'PREG-RULES-v1.1');
    setSaved(true);
    setTimeout(() => navigation.goBack(), 800);
  };

  if (saved) {
    return (
      <SafeAreaView style={styles.savedContainer}>
        <Text style={styles.savedText}>Observation saved — queued for sync</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Cancel</Text>
        </Pressable>
        <Text style={styles.title}>Record Observation</Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{flex: 1}}>
        <ScrollView contentContainerStyle={styles.form}>
          <Text style={styles.section}>Vital Signs</Text>
          <View style={styles.row}>
            <NumberField label="Systolic BP" value={bpSys} onChange={setBpSys} placeholder="120" />
            <NumberField label="Diastolic BP" value={bpDia} onChange={setBpDia} placeholder="80" />
          </View>
          <ToggleRow label="BP repeat after rest" value={bpRepeat} onChange={setBpRepeat} />
          <View style={styles.row}>
            <NumberField label="Hb (g/dL)" value={hb} onChange={setHb} placeholder="11.0" />
            <NumberField label="Temp (°C)" value={temp} onChange={setTemp} placeholder="37.0" />
          </View>
          <View style={styles.row}>
            <NumberField label="Resp Rate" value={rr} onChange={setRr} placeholder="18" />
            <NumberField label="Weight (kg)" value={weight} onChange={setWeight} placeholder="65" />
          </View>
          <View style={styles.row}>
            <NumberField label="Fundal Height (cm)" value={fundalHeight} onChange={setFundalHeight} placeholder="24" />
          </View>
          <Text style={styles.label}>Urine Protein</Text>
          <ChipPicker value={urineProtein} onChange={setUrineProtein} options={['NONE', 'TRACE', '1+', '2+', '3+']} />

          <Text style={styles.section}>Fetal Assessment</Text>
          <View style={styles.row}>
            <NumberField label="Fetal Heart Rate" value={fhr} onChange={setFhr} placeholder="140" />
            <NumberField label="Uterine Discrepancy (wks)" value={uterineDiscrepancy} onChange={setUterineDiscrepancy} placeholder="0" />
          </View>
          <Text style={styles.label}>Fetal Movement</Text>
          <ChipPicker value={fetalMovement} onChange={setFetalMovement} options={['NORMAL', 'REDUCED', 'ABSENT', 'UNKNOWN']} />
          <Text style={styles.label}>Fetal Number</Text>
          <ChipPicker value={fetalNumber} onChange={setFetalNumber} options={['SINGLE', 'MULTIPLE', 'UNKNOWN']} />
          <Text style={styles.label}>Presentation</Text>
          <ChipPicker value={presentation} onChange={setPresentation} options={['CEPHALIC', 'BREECH', 'TRANSVERSE', 'UNKNOWN']} />

          <Text style={styles.section}>Urine & Fluids</Text>
          <Text style={styles.label}>Vaginal Bleeding</Text>
          <ChipPicker value={vaginalBleeding} onChange={setVaginalBleeding} options={['NONE', 'SPOTTING', 'HEAVY', 'UNKNOWN']} />
          <Text style={styles.label}>Fluid Leakage</Text>
          <ChipPicker value={fluidLeakage} onChange={setFluidLeakage} options={['NONE', 'CLEAR', 'BLOOD_STAINED', 'MECONIUM_STAINED', 'UNKNOWN']} />
          <Text style={styles.label}>Contractions</Text>
          <ChipPicker value={contractions} onChange={setContractions} options={['NONE', 'IRREGULAR', 'REGULAR', 'UNKNOWN']} />

          <Text style={styles.section}>Danger Signs</Text>
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

          <Text style={styles.section}>Extended Clinical Flags</Text>
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

          <Text style={styles.section}>Worker Judgement</Text>
          <ToggleRow label="Worker judgement critical" value={judgement} onChange={setJudgement} />
          {judgement && (
            <View style={styles.rationaleBox}>
              <Text style={styles.label}>Rationale</Text>
              <TextInput
                style={styles.textArea}
                value={rationale}
                onChangeText={setRationale}
                multiline
                numberOfLines={3}
                placeholder="Describe clinical concern…"
                placeholderTextColor={lightColors.textSecondary}
              />
            </View>
          )}

          <Pressable style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Save & Queue for Sync</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType="numeric"
        placeholder={placeholder}
        placeholderTextColor={lightColors.textSecondary}
      />
    </View>
  );
}

function ToggleRow({label, value, onChange}: {label: string; value: boolean; onChange: (v: boolean) => void}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{false: lightColors.border, true: brand.teal}} />
    </View>
  );
}

function ChipPicker({value, onChange, options}: {value: string; onChange: (v: string) => void; options: string[]}) {
  return (
    <View style={styles.chipRow}>
      {options.map(opt => (
        <Pressable
          key={opt}
          onPress={() => onChange(opt)}
          style={[styles.chip, {backgroundColor: value === opt ? brand.teal : 'transparent', borderColor: lightColors.border}]}>
          <Text style={{fontSize: 12, fontWeight: '600', color: value === opt ? '#fff' : lightColors.textSecondary}}>{opt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: lightColors.background},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 16,
  },
  back: {fontSize: 16, color: brand.teal},
  title: {fontSize: 18, fontWeight: '700', color: lightColors.textPrimary},
  form: {padding: 16, gap: 10},
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.textSecondary,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 4,
  },
  row: {flexDirection: 'row', gap: 10},
  field: {flex: 1},
  label: {fontSize: 12, color: lightColors.textSecondary, marginBottom: 4},
  input: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: lightColors.textPrimary,
  },
  toggleRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6},
  toggleLabel: {fontSize: 14, color: lightColors.textPrimary, flex: 1, flexWrap: 'wrap'},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8},
  chip: {paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1},
  rationaleBox: {marginTop: 4},
  textArea: {
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: lightColors.textPrimary,
    minHeight: 70,
  },
  saveButton: {
    backgroundColor: brand.teal,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: {color: '#fff', fontSize: 16, fontWeight: '700'},
  savedContainer: {flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: lightColors.background},
  savedText: {fontSize: 16, color: brand.green, fontWeight: '600'},
});
