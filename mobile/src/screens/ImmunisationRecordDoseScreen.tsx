/**
 * ImmunisationRecordDoseScreen — record a vaccine dose administration.
 * MCHVC-SPEC-001 v1.1 §23-25. Enqueues to outbox for sync (DEC-007).
 */
import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
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

const VACCINES = ['BCG', 'OPV0', 'OPV1', 'OPV2', 'OPV3', 'PENTA1', 'PENTA2', 'PENTA3', 'PCV1', 'PCV2', 'PCV3', 'ROTA1', 'ROTA2', 'ROTA3', 'IPV1', 'IPV2', 'MR1', 'MR2', 'YF', 'MEN_A', 'HPV'];

export function ImmunisationRecordDoseScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const childId = (route.params as {childId: string}).childId;

  const [vaccineCode, setVaccineCode] = useState('');
  const [doseNumber, setDoseNumber] = useState('1');
  const [batchLot, setBatchLot] = useState('');
  const [productName, setProductName] = useState('');
  const [routeSite, setRouteSite] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = () => {
    setSaving(true);
    const payload = withProvenance(
      {
        child: childId,
        vaccine_code: vaccineCode,
        dose_number: parseInt(doseNumber, 10) || 1,
        administration_datetime: new Date().toISOString(),
        batch_lot: batchLot,
        product_name: productName,
        route_site: routeSite,
      },
      'ImmunisationRecordDoseScreen',
      'MANUAL',
    );
    enqueue(
      'vaccine_dose',
      payload,
      payload.device_id,
      'GHS-EPI-2026-DRAFT-v1.1',
    );
    setSaving(false);
    navigation.goBack();
  };

  return (
    <Screen scroll>
      <Card style={styles.section}>
        <SectionHeader title="Record Vaccine Dose" />

        <AppText variant="smallStrong" tone="secondary" style={styles.label}>Vaccine</AppText>
        <View style={styles.vaccineGrid}>
          {VACCINES.map(v => (
            <Pressable
              key={v}
              onPress={() => setVaccineCode(v)}
              accessibilityRole="button"
              accessibilityLabel={`Select vaccine ${v}`}
              accessibilityState={{selected: vaccineCode === v}}
              style={[
                styles.vaccineChip,
                {
                  backgroundColor: vaccineCode === v ? colors.primary : 'transparent',
                  borderColor: vaccineCode === v ? colors.primary : colors.border,
                },
              ]}>
              <AppText
                variant="caption"
                tone="inherit"
                style={{color: vaccineCode === v ? colors.onPrimary : colors.textSecondary}}>
                {v}
              </AppText>
            </Pressable>
          ))}
        </View>

        <Field
          label="Dose number"
          value={doseNumber}
          onChangeText={setDoseNumber}
          keyboardType="numeric"
          placeholder="1"
        />
        <Field
          label="Batch/Lot"
          value={batchLot}
          onChangeText={setBatchLot}
          placeholder="Optional"
        />
        <Field
          label="Product Name"
          value={productName}
          onChangeText={setProductName}
          placeholder="Optional"
        />
        <Field
          label="Route & Site"
          value={routeSite}
          onChangeText={setRouteSite}
          placeholder="e.g. intradermal, left upper arm"
        />
      </Card>

      <View style={styles.buttonRow}>
        <Button
          label={saving ? 'Saving...' : 'Record Dose'}
          variant="primary"
          size="lg"
          icon="check"
          loading={saving}
          disabled={!vaccineCode}
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
  vaccineGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: space[3]},
  vaccineChip: {
    paddingHorizontal: space[2],
    paddingVertical: space[2],
    borderRadius: radius.sm,
    borderWidth: border.thick,
  },
  buttonRow: {marginVertical: space[2]},
});
