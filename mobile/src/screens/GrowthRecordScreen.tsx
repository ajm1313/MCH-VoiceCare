/**
 * GrowthRecordScreen — record weight, length/height, MUAC and oedema.
 * MCHVC-SPEC-001 v1.1 §51.3. Enqueues to outbox for sync (DEC-007).
 */
import React, {useState} from 'react';
import {Pressable, StyleSheet, Switch, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {useTheme} from '../theme/useTheme';
import {enqueue} from '../core/sync/outbox';
import {withProvenance} from '../core/utils/provenance';
import {
  Screen,
  Card,
  Button,
  Field,
  SectionHeader,
  AppText,
} from '../components/ui';
import {border, radius, space} from '../theme/tokens';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function GrowthRecordScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const childId = (route.params as {childId: string}).childId;

  const [weight, setWeight] = useState('');
  const [length, setLength] = useState('');
  const [height, setHeight] = useState('');
  const [measurementPosition, setMeasurementPosition] = useState('RECUMBENT');
  const [muac, setMuac] = useState('');
  const [oedema, setOedema] = useState(false);
  const [feedingStatus, setFeedingStatus] = useState('UNKNOWN');
  const [recentIllness, setRecentIllness] = useState('');
  const [measurementQuality, setMeasurementQuality] = useState('NOT_ASSESSED');
  const [scaleId, setScaleId] = useState('');
  const [lengthBoardId, setLengthBoardId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    const payload = withProvenance(
      {
        child: childId,
        measurement_date: new Date().toISOString().split('T')[0],
        weight_kg: weight ? parseFloat(weight) : null,
        length_cm: length ? parseFloat(length) : null,
        height_cm: height ? parseFloat(height) : null,
        measurement_position: measurementPosition,
        muac_mm: muac ? parseInt(muac, 10) : null,
        bilateral_oedema: oedema,
        feeding_status: feedingStatus,
        recent_illness: recentIllness,
        measurement_quality: measurementQuality,
        scale_id: scaleId,
        length_board_id: lengthBoardId,
        standard_used: 'WHO_2006',
      },
      'GrowthRecordScreen',
      'MANUAL',
    );
    enqueue(
      'growth_measurement',
      payload,
      payload.device_id,
      'GMP-WHO-2006-v1',
    );
    setSaving(false);
    navigation.goBack();
  };

  const renderChipRow = (options: string[], value: string, onChange: (v: string) => void) => (
    <View style={styles.chipRow}>
      {options.map(opt => (
        <Pressable
          key={opt}
          onPress={() => onChange(opt)}
          accessibilityRole="button"
          accessibilityLabel={opt}
          accessibilityState={{selected: value === opt}}
          style={[
            styles.chip,
            {
              backgroundColor: value === opt ? colors.primary : 'transparent',
              borderColor: value === opt ? colors.primary : colors.border,
            },
          ]}>
          <AppText
            variant="caption"
            tone="inherit"
            style={{color: value === opt ? colors.onPrimary : colors.textSecondary}}>
            {opt}
          </AppText>
        </Pressable>
      ))}
    </View>
  );

  return (
    <Screen scroll>
      <Card style={styles.section}>
        <SectionHeader title="Growth Measurement" />

        <Field label="Weight (kg)" value={weight} onChangeText={setWeight} keyboardType="numeric" placeholder="3.5" />
        <Field label="Length (cm)" value={length} onChangeText={setLength} keyboardType="numeric" placeholder="50" />
        <Field label="Height (cm)" value={height} onChangeText={setHeight} keyboardType="numeric" placeholder="75" />

        <AppText variant="smallStrong" tone="secondary" style={styles.label}>Measurement Position</AppText>
        {renderChipRow(['RECUMBENT', 'STANDING', 'UNKNOWN'], measurementPosition, setMeasurementPosition)}

        <Field label="MUAC (mm)" value={muac} onChangeText={setMuac} keyboardType="numeric" placeholder="120" />

        <View style={styles.switchRow}>
          <AppText variant="bodyStrong">Bilateral oedema</AppText>
          <Switch value={oedema} onValueChange={setOedema} trackColor={{false: colors.border, true: colors.primary}} />
        </View>

        <AppText variant="smallStrong" tone="secondary" style={styles.label}>Feeding Status</AppText>
        {renderChipRow(['UNKNOWN', 'BREASTFED', 'MIXED', 'COMPLEMENTARY', 'NOT_FEEDING'], feedingStatus, setFeedingStatus)}

        <Field label="Recent Illness" value={recentIllness} onChangeText={setRecentIllness} placeholder="e.g. fever, diarrhoea" />

        <AppText variant="smallStrong" tone="secondary" style={styles.label}>Measurement Quality</AppText>
        {renderChipRow(['NOT_ASSESSED', 'GOOD', 'ACCEPTABLE', 'POOR'], measurementQuality, setMeasurementQuality)}

        <Field label="Scale ID" value={scaleId} onChangeText={setScaleId} placeholder="Optional" />
        <Field label="Length Board ID" value={lengthBoardId} onChangeText={setLengthBoardId} placeholder="Optional" />
      </Card>

      <View style={styles.buttonRow}>
        <Button
          label={saving ? 'Saving...' : 'Save Measurement'}
          variant="primary"
          size="lg"
          icon="check"
          loading={saving}
          fullWidth
          onPress={handleSave}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {marginVertical: space[2]},
  label: {marginBottom: space[1]},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space[3]},
  chip: {
    paddingHorizontal: space[2],
    paddingVertical: space[1] + 2,
    borderRadius: radius.sm,
    borderWidth: border.thick,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space[3],
  },
  buttonRow: {marginVertical: space[2]},
});
