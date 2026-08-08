/**
 * PregnancyRegisterScreen — register a new pregnancy episode offline.
 * Captures all episode baseline fields matching the backend PregnancyRegistrationForm.
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
import {checkWomanExists, DedupMatch} from '../core/dedup/personDedup';
import {DuplicateBadge} from '../components/DuplicateBadge';
import type {RootStackParamList} from '../core/navigation/types';
import {Alert} from 'react-native';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PregnancyRegisterScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();

  // Identity & assignment
  const [womanId, setWomanId] = useState('');
  const [womanName, setWomanName] = useState('');
  const [assignedChps, setAssignedChps] = useState('');
  const [assignedWorker, setAssignedWorker] = useState('');

  // Dating
  const [lmpDate, setLmpDate] = useState('');
  const [lmpReliability, setLmpReliability] = useState('CONFIRMED');
  const [datingMethod, setDatingMethod] = useState('LMP');

  // Obstetric history
  const [gravidity, setGravidity] = useState('1');
  const [parity, setParity] = useState('0');
  const [livingChildren, setLivingChildren] = useState('0');
  const [prevCaesarean, setPrevCaesarean] = useState('0');
  const [prevUterineSurgery, setPrevUterineSurgery] = useState(false);
  const [prevStillbirth, setPrevStillbirth] = useState(false);
  const [prevNeonatalDeath, setPrevNeonatalDeath] = useState(false);
  const [prevPph, setPrevPph] = useState(false);
  const [prevPreeclampsia, setPrevPreeclampsia] = useState(false);
  const [prevPreterm, setPrevPreterm] = useState(false);
  const [prevObstructed, setPrevObstructed] = useState(false);
  const [maternalAge, setMaternalAge] = useState('');

  // Baseline & medical
  const [heightCm, setHeightCm] = useState('');
  const [bookingWeight, setBookingWeight] = useState('');
  const [chronicHtn, setChronicHtn] = useState(false);
  const [diabetes, setDiabetes] = useState('NONE');
  const [sickleCell, setSickleCell] = useState('NOT_SCREENED');
  const [cardiac, setCardiac] = useState(false);
  const [renal, setRenal] = useState(false);
  const [epilepsy, setEpilepsy] = useState(false);
  const [bloodGroup, setBloodGroup] = useState('UNKNOWN');
  const [rhesus, setRhesus] = useState('UNKNOWN');

  // Infection screening
  const [hivStatus, setHivStatus] = useState('NOT_SCREENED');
  const [syphilisStatus, setSyphilisStatus] = useState('NOT_SCREENED');
  const [hepbStatus, setHepbStatus] = useState('NOT_SCREENED');
  const [tbStatus, setTbStatus] = useState('NOT_SCREENED');

  // Access & planning
  const [travelTime, setTravelTime] = useState('');
  const [birthPlanComplete, setBirthPlanComplete] = useState(false);

  // Socio-economic determinants
  const [maternalEducation, setMaternalEducation] = useState('UNKNOWN');
  const [maternalOccupation, setMaternalOccupation] = useState('UNKNOWN');
  const [numberOfJobs, setNumberOfJobs] = useState('1');
  const [avgDailyWorkHours, setAvgDailyWorkHours] = useState('');

  // System flags
  const [lateBooking, setLateBooking] = useState(false);
  const [severeAccessBarrier, setSevereAccessBarrier] = useState(false);
  const [specialistIncomplete, setSpecialistIncomplete] = useState(false);

  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const totalSteps = 7;
  const stepTitles = ['Identity', 'Dating', 'OB History', 'Medical', 'Infections', 'Socio-Economic', 'Access & Flags'];
  const [dedupMatch, setDedupMatch] = useState<DedupMatch | null>(null);

  const checkDuplicate = (name: string) => {
    setWomanName(name);
    if (name.trim().length >= 3) {
      const match = checkWomanExists(name);
      setDedupMatch(match.matched ? match : null);
    } else {
      setDedupMatch(null);
    }
  };

  const handleSave = () => {
    // Dedup check — prevent duplicate woman registration
    if (womanName.trim()) {
      const match = checkWomanExists(womanName);
      if (match.matched) {
        Alert.alert(
          'Possible Duplicate',
          `A record for "${match.existingName}" already exists (matched by ${match.matchField} in ${match.source}).\n\nWould you like to use the existing record or create a new one?`,
          [
            {text: 'Cancel', style: 'cancel'},
            {
              text: 'Use Existing',
              onPress: () => {
                if (match.existingId) setWomanId(match.existingId);
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
      'pregnancy_registration',
      {
        woman: womanId || undefined,
        woman_name: womanName || undefined,
        assigned_chps: assignedChps || undefined,
        assigned_worker: assignedWorker || undefined,
        lmp_date: lmpDate || undefined,
        lmp_reliability: lmpReliability,
        dating_method: datingMethod,
        gravidity: parseInt(gravidity, 10) || 1,
        parity: parseInt(parity, 10) || 0,
        living_children: parseInt(livingChildren, 10) || 0,
        previous_caesarean_count: parseInt(prevCaesarean, 10) || 0,
        previous_uterine_surgery: prevUterineSurgery,
        previous_stillbirth: prevStillbirth,
        previous_neonatal_death: prevNeonatalDeath,
        previous_pph: prevPph,
        previous_preeclampsia_eclampsia: prevPreeclampsia,
        previous_preterm_birth: prevPreterm,
        previous_obstructed_labour: prevObstructed,
        maternal_age_years: maternalAge ? parseInt(maternalAge, 10) : undefined,
        height_cm: heightCm ? parseFloat(heightCm) : undefined,
        booking_weight_kg: bookingWeight ? parseFloat(bookingWeight) : undefined,
        chronic_hypertension: chronicHtn,
        diabetes,
        sickle_cell_status: sickleCell,
        cardiac_disease: cardiac,
        renal_disease: renal,
        epilepsy,
        blood_group: bloodGroup,
        rhesus_status: rhesus,
        hiv_status: hivStatus,
        syphilis_status: syphilisStatus,
        hepatitis_b_status: hepbStatus,
        tb_status: tbStatus,
        travel_time_referral_minutes: travelTime ? parseInt(travelTime, 10) : undefined,
        birth_plan_complete: birthPlanComplete,
        late_booking_or_missed_anc: lateBooking,
        severe_access_barrier: severeAccessBarrier,
        specialist_recommendation_incomplete: specialistIncomplete,
        maternal_education: maternalEducation,
        maternal_occupation: maternalOccupation,
        number_of_jobs: parseInt(numberOfJobs, 10) || 1,
        average_daily_working_hours: avgDailyWorkHours ? parseFloat(avgDailyWorkHours) : undefined,
        source_type: 'WORKER_APP',
      },
      'device-001',
      'PREG-RULES-v1.1',
    );
    setSaving(false);
    navigation.goBack();
  };

  return (
    <KeyboardAvoidingView
      style={{flex: 1}}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={[styles.container, {backgroundColor: colors.background}]}>
        <Text style={[styles.title, {color: colors.textPrimary}]}>Register Pregnancy</Text>

        {/* Progress indicator */}
        <View style={styles.progressContainer}>
          {stepTitles.map((title, i) => (
            <React.Fragment key={i}>
              <View style={[styles.progressDot, {
                backgroundColor: i <= step ? colors.primary : colors.border,
              }]}>
                <Text style={[styles.progressDotText, {color: i <= step ? '#fff' : colors.textSecondary}]}>
                  {i < step ? '✓' : i + 1}
                </Text>
              </View>
              {i < stepTitles.length - 1 && (
                <View style={[styles.progressLine, {backgroundColor: i < step ? colors.primary : colors.border}]} />
              )}
            </React.Fragment>
          ))}
        </View>
        <Text style={[styles.stepTitle, {color: colors.textSecondary}]}>
          Step {step + 1} of {totalSteps}: {stepTitles[step]}
        </Text>

        {step === 0 && (
          <>
          {/* Identity & Assignment */}
          <View style={[styles.section, {backgroundColor: colors.surface}]}>
            <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Identity & Assignment</Text>
            <LabeledInput label="Woman Name" value={womanName} onChange={checkDuplicate} colors={colors} placeholder="Full name" />
            <DuplicateBadge
              duplicate={dedupMatch}
              onDismiss={() => setDedupMatch(null)}
            />
            <LabeledInput label="Woman ID (if known)" value={womanId} onChange={setWomanId} colors={colors} />
            <LabeledInput label="Assigned CHPS" value={assignedChps} onChange={setAssignedChps} colors={colors} />
            <LabeledInput label="Assigned Worker" value={assignedWorker} onChange={setAssignedWorker} colors={colors} />
          </View>
          </>
        )}

        {step === 1 && (
          <>
          {/* Dating */}
          <View style={[styles.section, {backgroundColor: colors.surface}]}>
            <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Dating</Text>
            <LabeledInput label="LMP Date (YYYY-MM-DD)" value={lmpDate} onChange={setLmpDate} colors={colors} placeholder="2026-01-15" />
            <PickerField label="LMP Reliability" value={lmpReliability} onChange={setLmpReliability} options={['CONFIRMED', 'PROBABLE', 'UNCERTAIN', 'UNKNOWN']} colors={colors} />
            <PickerField label="Dating Method" value={datingMethod} onChange={setDatingMethod} options={['LMP', 'ULTRASOUND', 'SYMPHYSIS_FUNDAL_HEIGHT', 'UNKNOWN']} colors={colors} />
          </View>
          </>
        )}

        {step === 2 && (
          <>
          {/* Obstetric History */}
          <View style={[styles.section, {backgroundColor: colors.surface}]}>
            <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Obstetric History</Text>
            <View style={styles.row}>
              <LabeledInput label="Gravidity" value={gravidity} onChange={setGravidity} colors={colors} keyboardType="numeric" />
              <LabeledInput label="Parity" value={parity} onChange={setParity} colors={colors} keyboardType="numeric" />
            </View>
            <View style={styles.row}>
              <LabeledInput label="Living Children" value={livingChildren} onChange={setLivingChildren} colors={colors} keyboardType="numeric" />
              <LabeledInput label="Prev Caesarean #" value={prevCaesarean} onChange={setPrevCaesarean} colors={colors} keyboardType="numeric" />
            </View>
            <View style={styles.row}>
              <LabeledInput label="Maternal Age" value={maternalAge} onChange={setMaternalAge} colors={colors} keyboardType="numeric" />
            </View>
            <ToggleRow label="Prev uterine surgery" value={prevUterineSurgery} onChange={setPrevUterineSurgery} colors={colors} />
            <ToggleRow label="Prev stillbirth" value={prevStillbirth} onChange={setPrevStillbirth} colors={colors} />
            <ToggleRow label="Prev neonatal death" value={prevNeonatalDeath} onChange={setPrevNeonatalDeath} colors={colors} />
            <ToggleRow label="Prev PPH" value={prevPph} onChange={setPrevPph} colors={colors} />
            <ToggleRow label="Prev preeclampsia/eclampsia" value={prevPreeclampsia} onChange={setPrevPreeclampsia} colors={colors} />
            <ToggleRow label="Prev preterm birth" value={prevPreterm} onChange={setPrevPreterm} colors={colors} />
            <ToggleRow label="Prev obstructed labour" value={prevObstructed} onChange={setPrevObstructed} colors={colors} />
          </View>
          </>
        )}

        {step === 3 && (
          <>
          {/* Baseline & Medical */}
          <View style={[styles.section, {backgroundColor: colors.surface}]}>
            <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Baseline & Medical</Text>
            <View style={styles.row}>
              <LabeledInput label="Height (cm)" value={heightCm} onChange={setHeightCm} colors={colors} keyboardType="numeric" />
              <LabeledInput label="Booking Weight (kg)" value={bookingWeight} onChange={setBookingWeight} colors={colors} keyboardType="numeric" />
            </View>
            <ToggleRow label="Chronic Hypertension" value={chronicHtn} onChange={setChronicHtn} colors={colors} />
            <PickerField label="Diabetes" value={diabetes} onChange={setDiabetes} options={['NONE', 'GESTATIONAL', 'PRE_EXISTING', 'UNKNOWN']} colors={colors} />
            <PickerField label="Sickle Cell" value={sickleCell} onChange={setSickleCell} options={['NOT_SCREENED', 'AA', 'AS', 'SS', 'SC', 'UNKNOWN']} colors={colors} />
            <ToggleRow label="Cardiac Disease" value={cardiac} onChange={setCardiac} colors={colors} />
            <ToggleRow label="Renal Disease" value={renal} onChange={setRenal} colors={colors} />
            <ToggleRow label="Epilepsy" value={epilepsy} onChange={setEpilepsy} colors={colors} />
            <PickerField label="Blood Group" value={bloodGroup} onChange={setBloodGroup} options={['A', 'B', 'AB', 'O', 'UNKNOWN']} colors={colors} />
            <PickerField label="Rhesus" value={rhesus} onChange={setRhesus} options={['POSITIVE', 'NEGATIVE', 'UNKNOWN']} colors={colors} />
          </View>
          </>
        )}

        {step === 4 && (
          <>
          {/* Infection Screening */}
          <View style={[styles.section, {backgroundColor: colors.surface}]}>
            <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Infection Screening</Text>
            <PickerField label="HIV Status" value={hivStatus} onChange={setHivStatus} options={['NOT_SCREENED', 'NEGATIVE', 'POSITIVE', 'UNKNOWN']} colors={colors} />
            <PickerField label="Syphilis" value={syphilisStatus} onChange={setSyphilisStatus} options={['NOT_SCREENED', 'NEGATIVE', 'POSITIVE', 'UNKNOWN']} colors={colors} />
            <PickerField label="Hepatitis B" value={hepbStatus} onChange={setHepbStatus} options={['NOT_SCREENED', 'NEGATIVE', 'POSITIVE', 'UNKNOWN']} colors={colors} />
            <PickerField label="TB Status" value={tbStatus} onChange={setTbStatus} options={['NOT_SCREENED', 'NEGATIVE', 'ACTIVE', 'ON_TREATMENT', 'UNKNOWN']} colors={colors} />
          </View>
          </>
        )}

        {step === 5 && (
          <>
          {/* Socio-Economic Determinants */}
          <View style={[styles.section, {backgroundColor: colors.surface}]}>
            <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Socio-Economic Determinants</Text>
            <PickerField label="Maternal Education" value={maternalEducation} onChange={setMaternalEducation} options={['NONE', 'PRIMARY', 'JHS', 'SHS', 'TERTIARY', 'UNKNOWN']} colors={colors} />
            <PickerField label="Maternal Occupation" value={maternalOccupation} onChange={setMaternalOccupation} options={['UNEMPLOYED', 'TRADER', 'FARMER', 'ARTISAN', 'FISHER', 'FORMAL_EMPLOYEE', 'SELF_EMPLOYED', 'STUDENT', 'OTHER', 'UNKNOWN']} colors={colors} />
            <LabeledInput label="Number of Jobs" value={numberOfJobs} onChange={setNumberOfJobs} colors={colors} keyboardType="numeric" />
            <LabeledInput label="Avg Daily Working Hours" value={avgDailyWorkHours} onChange={setAvgDailyWorkHours} colors={colors} keyboardType="numeric" placeholder="e.g. 8.5" />
          </View>
          </>
        )}

        {step === 6 && (
          <>
          {/* Access & Planning */}
          <View style={[styles.section, {backgroundColor: colors.surface}]}>
            <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Access & Planning</Text>
            <LabeledInput label="Travel time to referral (min)" value={travelTime} onChange={setTravelTime} colors={colors} keyboardType="numeric" />
            <ToggleRow label="Birth plan complete" value={birthPlanComplete} onChange={setBirthPlanComplete} colors={colors} />
          </View>

          {/* System Flags */}
          <View style={[styles.section, {backgroundColor: colors.surface}]}>
            <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>System & Contextual Flags</Text>
            <ToggleRow label="Late booking or missed ANC" value={lateBooking} onChange={setLateBooking} colors={colors} />
            <ToggleRow label="Severe access barrier" value={severeAccessBarrier} onChange={setSevereAccessBarrier} colors={colors} />
            <ToggleRow label="Specialist recommendation incomplete" value={specialistIncomplete} onChange={setSpecialistIncomplete} colors={colors} />
          </View>
          </>
        )}

        {/* Navigation buttons */}
        <View style={styles.navButtons}>
          {step > 0 && (
            <Pressable
              style={[styles.navButton, styles.navPrev, {borderColor: colors.border}]}
              onPress={() => setStep(step - 1)}>
              <Text style={[styles.navButtonText, {color: colors.textSecondary}]}>← Previous</Text>
            </Pressable>
          )}
          {step < totalSteps - 1 ? (
            <Pressable
              style={[styles.navButton, styles.navNext, {backgroundColor: colors.primary}]}
              onPress={() => setStep(step + 1)}>
              <Text style={styles.navNextText}>Next →</Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleSave}
              disabled={saving}
              style={[styles.navButton, styles.navNext, {backgroundColor: colors.primary, opacity: saving ? 0.6 : 1}]}>
              <Text style={styles.navNextText}>{saving ? 'Saving...' : 'Register & Sync'}</Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function LabeledInput({
  label, value, onChange, colors, placeholder, keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  colors: typeof lightColors;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, {color: colors.textSecondary}]}>{label}</Text>
      <TextInput
        style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType={keyboardType || 'default'}
      />
    </View>
  );
}

function PickerField({
  label, value, onChange, options, colors,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  colors: typeof lightColors;
}) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, {color: colors.textSecondary}]}>{label}</Text>
      <View style={[styles.pickerRow, {borderColor: colors.border}]}>
        {options.map(opt => (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[
              styles.pickerChip,
              {backgroundColor: value === opt ? colors.primary : 'transparent', borderColor: colors.border},
            ]}>
            <Text style={{fontSize: 11, fontWeight: '600', color: value === opt ? '#fff' : colors.textSecondary}}>
              {opt}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function ToggleRow({
  label, value, onChange, colors,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  colors: typeof lightColors;
}) {
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
  pickerRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, borderWidth: 1, borderRadius: 8, padding: 6},
  pickerChip: {paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1},
  toggleRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6},
  toggleLabel: {fontSize: 14, flex: 1, flexWrap: 'wrap'},
  button: {margin: 16, padding: 14, borderRadius: 12, alignItems: 'center'},
  buttonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  progressContainer: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginBottom: 8},
  progressDot: {width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center'},
  progressDotText: {fontSize: 12, fontWeight: '700'},
  progressLine: {flex: 1, height: 2, marginHorizontal: 4},
  stepTitle: {fontSize: 13, fontWeight: '600', paddingHorizontal: 16, marginBottom: 8},
  navButtons: {flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 16, gap: 12},
  navButton: {flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center'},
  navPrev: {borderWidth: 1},
  navNext: {},
  navButtonText: {fontSize: 15, fontWeight: '600'},
  navNextText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
