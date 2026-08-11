/**
 * PregnancyRegisterScreen — register a new pregnancy episode offline.
 * Captures all episode baseline fields matching the backend PregnancyRegistrationForm.
 * Enqueues to outbox for sync (SYNC-001).
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
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {enqueue} from '../core/sync/outbox';
import {checkWomanExists, DedupMatch} from '../core/dedup/personDedup';
import {DuplicateBadge} from '../components/DuplicateBadge';
import {useTheme} from '../theme/useTheme';
import {border, radius, space} from '../theme/tokens';
import {Screen} from '../components/ui/Screen';
import {Card} from '../components/ui/Card';
import {Button} from '../components/ui/Button';
import {Field} from '../components/ui/Input';
import {AppText} from '../components/ui/Text';
import {Icon} from '../components/ui/Icon';
import {SectionHeader} from '../components/ui/Layout';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PregnancyRegisterScreen() {
  const {colors} = useTheme();
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
    <Screen padded={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
          <AppText variant="h1" style={styles.title}>Register Pregnancy</AppText>

          {/* Progress indicator */}
          <View style={styles.progressContainer}>
            {stepTitles.map((title, i) => (
              <React.Fragment key={i}>
                <View style={[styles.progressDot, {
                  backgroundColor: i <= step ? colors.primary : colors.surfaceSunken,
                  borderColor: i <= step ? colors.primary : colors.border,
                }]}>
                  {i < step ? (
                    <Icon name="check" size={14} color={colors.onPrimary} strokeWidth={2.5} />
                  ) : (
                    <AppText
                      variant="smallStrong"
                      tone="inherit"
                      style={{color: i <= step ? colors.onPrimary : colors.textSecondary}}>
                      {i + 1}
                    </AppText>
                  )}
                </View>
                {i < stepTitles.length - 1 && (
                  <View style={[styles.progressLine, {backgroundColor: i < step ? colors.primary : colors.border}]} />
                )}
              </React.Fragment>
            ))}
          </View>
          <AppText variant="small" tone="secondary" style={styles.stepTitle}>
            Step {step + 1} of {totalSteps}: {stepTitles[step]}
          </AppText>

          {step === 0 && (
            <>
            {/* Identity & Assignment */}
            <Card style={styles.section}>
              <SectionHeader title="Identity & Assignment" />
              <Field label="Woman Name" value={womanName} onChangeText={checkDuplicate} placeholder="Full name" icon="user" />
              <DuplicateBadge
                duplicate={dedupMatch}
                onDismiss={() => setDedupMatch(null)}
              />
              <Field label="Woman ID (if known)" value={womanId} onChangeText={setWomanId} />
              <Field label="Assigned CHPS" value={assignedChps} onChangeText={setAssignedChps} icon="mapPin" />
              <Field label="Assigned Worker" value={assignedWorker} onChangeText={setAssignedWorker} icon="user" />
            </Card>
            </>
          )}

          {step === 1 && (
            <>
            {/* Dating */}
            <Card style={styles.section}>
              <SectionHeader title="Dating" />
              <Field label="LMP Date (YYYY-MM-DD)" value={lmpDate} onChangeText={setLmpDate} placeholder="2026-01-15" icon="calendar" />
              <PickerField label="LMP Reliability" value={lmpReliability} onChange={setLmpReliability} options={['CONFIRMED', 'PROBABLE', 'UNCERTAIN', 'UNKNOWN']} />
              <PickerField label="Dating Method" value={datingMethod} onChange={setDatingMethod} options={['LMP', 'ULTRASOUND', 'SYMPHYSIS_FUNDAL_HEIGHT', 'UNKNOWN']} />
            </Card>
            </>
          )}

          {step === 2 && (
            <>
            {/* Obstetric History */}
            <Card style={styles.section}>
              <SectionHeader title="Obstetric History" />
              <View style={styles.row}>
                <Field label="Gravidity" value={gravidity} onChangeText={setGravidity} keyboardType="numeric" containerStyle={styles.fieldHalf} />
                <Field label="Parity" value={parity} onChangeText={setParity} keyboardType="numeric" containerStyle={styles.fieldHalf} />
              </View>
              <View style={styles.row}>
                <Field label="Living Children" value={livingChildren} onChangeText={setLivingChildren} keyboardType="numeric" containerStyle={styles.fieldHalf} />
                <Field label="Prev Caesarean #" value={prevCaesarean} onChangeText={setPrevCaesarean} keyboardType="numeric" containerStyle={styles.fieldHalf} />
              </View>
              <View style={styles.row}>
                <Field label="Maternal Age" value={maternalAge} onChangeText={setMaternalAge} keyboardType="numeric" containerStyle={styles.fieldHalf} />
              </View>
              <ToggleRow label="Prev uterine surgery" value={prevUterineSurgery} onChange={setPrevUterineSurgery} />
              <ToggleRow label="Prev stillbirth" value={prevStillbirth} onChange={setPrevStillbirth} />
              <ToggleRow label="Prev neonatal death" value={prevNeonatalDeath} onChange={setPrevNeonatalDeath} />
              <ToggleRow label="Prev PPH" value={prevPph} onChange={setPrevPph} />
              <ToggleRow label="Prev preeclampsia/eclampsia" value={prevPreeclampsia} onChange={setPrevPreeclampsia} />
              <ToggleRow label="Prev preterm birth" value={prevPreterm} onChange={setPrevPreterm} />
              <ToggleRow label="Prev obstructed labour" value={prevObstructed} onChange={setPrevObstructed} />
            </Card>
            </>
          )}

          {step === 3 && (
            <>
            {/* Baseline & Medical */}
            <Card style={styles.section}>
              <SectionHeader title="Baseline & Medical" />
              <View style={styles.row}>
                <Field label="Height (cm)" value={heightCm} onChangeText={setHeightCm} keyboardType="numeric" containerStyle={styles.fieldHalf} />
                <Field label="Booking Weight (kg)" value={bookingWeight} onChangeText={setBookingWeight} keyboardType="numeric" containerStyle={styles.fieldHalf} />
              </View>
              <ToggleRow label="Chronic Hypertension" value={chronicHtn} onChange={setChronicHtn} />
              <PickerField label="Diabetes" value={diabetes} onChange={setDiabetes} options={['NONE', 'GESTATIONAL', 'PRE_EXISTING', 'UNKNOWN']} />
              <PickerField label="Sickle Cell" value={sickleCell} onChange={setSickleCell} options={['NOT_SCREENED', 'AA', 'AS', 'SS', 'SC', 'UNKNOWN']} />
              <ToggleRow label="Cardiac Disease" value={cardiac} onChange={setCardiac} />
              <ToggleRow label="Renal Disease" value={renal} onChange={setRenal} />
              <ToggleRow label="Epilepsy" value={epilepsy} onChange={setEpilepsy} />
              <PickerField label="Blood Group" value={bloodGroup} onChange={setBloodGroup} options={['A', 'B', 'AB', 'O', 'UNKNOWN']} />
              <PickerField label="Rhesus" value={rhesus} onChange={setRhesus} options={['POSITIVE', 'NEGATIVE', 'UNKNOWN']} />
            </Card>
            </>
          )}

          {step === 4 && (
            <>
            {/* Infection Screening */}
            <Card style={styles.section}>
              <SectionHeader title="Infection Screening" />
              <PickerField label="HIV Status" value={hivStatus} onChange={setHivStatus} options={['NOT_SCREENED', 'NEGATIVE', 'POSITIVE', 'UNKNOWN']} />
              <PickerField label="Syphilis" value={syphilisStatus} onChange={setSyphilisStatus} options={['NOT_SCREENED', 'NEGATIVE', 'POSITIVE', 'UNKNOWN']} />
              <PickerField label="Hepatitis B" value={hepbStatus} onChange={setHepbStatus} options={['NOT_SCREENED', 'NEGATIVE', 'POSITIVE', 'UNKNOWN']} />
              <PickerField label="TB Status" value={tbStatus} onChange={setTbStatus} options={['NOT_SCREENED', 'NEGATIVE', 'ACTIVE', 'ON_TREATMENT', 'UNKNOWN']} />
            </Card>
            </>
          )}

          {step === 5 && (
            <>
            {/* Socio-Economic Determinants */}
            <Card style={styles.section}>
              <SectionHeader title="Socio-Economic Determinants" />
              <PickerField label="Maternal Education" value={maternalEducation} onChange={setMaternalEducation} options={['NONE', 'PRIMARY', 'JHS', 'SHS', 'TERTIARY', 'UNKNOWN']} />
              <PickerField label="Maternal Occupation" value={maternalOccupation} onChange={setMaternalOccupation} options={['UNEMPLOYED', 'TRADER', 'FARMER', 'ARTISAN', 'FISHER', 'FORMAL_EMPLOYEE', 'SELF_EMPLOYED', 'STUDENT', 'OTHER', 'UNKNOWN']} />
              <Field label="Number of Jobs" value={numberOfJobs} onChangeText={setNumberOfJobs} keyboardType="numeric" />
              <Field label="Avg Daily Working Hours" value={avgDailyWorkHours} onChangeText={setAvgDailyWorkHours} keyboardType="numeric" placeholder="e.g. 8.5" />
            </Card>
            </>
          )}

          {step === 6 && (
            <>
            {/* Access & Planning */}
            <Card style={styles.section}>
              <SectionHeader title="Access & Planning" />
              <Field label="Travel time to referral (min)" value={travelTime} onChangeText={setTravelTime} keyboardType="numeric" icon="clock" />
              <ToggleRow label="Birth plan complete" value={birthPlanComplete} onChange={setBirthPlanComplete} />
            </Card>

            {/* System Flags */}
            <Card style={styles.section}>
              <SectionHeader title="System & Contextual Flags" />
              <ToggleRow label="Late booking or missed ANC" value={lateBooking} onChange={setLateBooking} />
              <ToggleRow label="Severe access barrier" value={severeAccessBarrier} onChange={setSevereAccessBarrier} />
              <ToggleRow label="Specialist recommendation incomplete" value={specialistIncomplete} onChange={setSpecialistIncomplete} />
            </Card>
            </>
          )}

          {/* Navigation buttons */}
          <View style={styles.navButtons}>
            {step > 0 && (
              <Button
                label="Previous"
                variant="secondary"
                size="lg"
                icon="arrowLeft"
                onPress={() => setStep(step - 1)}
                style={styles.navButton}
                accessibilityLabel="Previous step"
              />
            )}
            {step < totalSteps - 1 ? (
              <Button
                label="Next"
                size="lg"
                iconRight="arrowRight"
                onPress={() => setStep(step + 1)}
                style={styles.navButton}
                accessibilityLabel="Next step"
              />
            ) : (
              <Button
                label={saving ? 'Saving...' : 'Register & Sync'}
                size="lg"
                icon="check"
                onPress={handleSave}
                disabled={saving}
                loading={saving}
                style={styles.navButton}
                accessibilityLabel="Register and sync"
              />
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function PickerField({
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
    <View style={styles.pickerField}>
      <AppText variant="smallStrong" tone="secondary" style={styles.pickerLabel}>{label}</AppText>
      <View style={[styles.pickerRow, {borderColor: colors.border}]}>
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
                styles.pickerChip,
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

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
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

const styles = StyleSheet.create({
  flex: {flex: 1},
  scrollContent: {paddingBottom: space[8]},
  title: {paddingHorizontal: space[4], paddingTop: space[4], marginBottom: space[2]},
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[4],
    marginBottom: space[2],
  },
  progressDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: border.thick,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressLine: {flex: 1, height: 2, marginHorizontal: space[1]},
  stepTitle: {paddingHorizontal: space[4], marginBottom: space[3]},
  section: {marginHorizontal: space[4], marginVertical: space[2]},
  row: {flexDirection: 'row', gap: space[2]},
  fieldHalf: {flex: 1},
  pickerField: {marginBottom: space[4]},
  pickerLabel: {marginBottom: space[1]},
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[1],
    borderWidth: border.thick,
    borderRadius: radius.md,
    padding: space[2],
  },
  pickerChip: {
    paddingHorizontal: space[2],
    paddingVertical: space[1],
    borderRadius: radius.sm,
    borderWidth: border.hairline,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space[2],
    gap: space[3],
  },
  toggleLabel: {flex: 1, flexWrap: 'wrap'},
  navButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space[4],
    paddingVertical: space[4],
    gap: space[3],
  },
  navButton: {flex: 1},
});
