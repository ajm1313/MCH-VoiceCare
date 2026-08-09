/**
 * ImmunisationRecordDoseScreen — record a vaccine dose administration.
 * MCHVC-SPEC-001 v1.1 §23-25. Enqueues to outbox for sync (DEC-007).
 */
import React, {useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {enqueue} from '../core/sync/outbox';
import {withProvenance} from '../core/utils/provenance';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const VACCINES = ['BCG', 'OPV0', 'OPV1', 'OPV2', 'OPV3', 'PENTA1', 'PENTA2', 'PENTA3', 'PCV1', 'PCV2', 'PCV3', 'ROTA1', 'ROTA2', 'ROTA3', 'IPV1', 'IPV2', 'MR1', 'MR2', 'YF', 'MEN_A', 'HPV'];

export function ImmunisationRecordDoseScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
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
    <ScrollView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={[styles.section, {backgroundColor: colors.surface}]}>
        <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>
          Record Vaccine Dose
        </Text>
        <Text style={[styles.label, {color: colors.textSecondary}]}>Vaccine</Text>
        <View style={styles.vaccineGrid}>
          {VACCINES.map(v => (
            <Pressable
              key={v}
              onPress={() => setVaccineCode(v)}
              style={[styles.vaccineChip, {
                backgroundColor: vaccineCode === v ? colors.primary : 'transparent',
                borderColor: vaccineCode === v ? colors.primary : colors.border,
              }]}>
              <Text style={{
                fontSize: 11, fontWeight: '600',
                color: vaccineCode === v ? '#fff' : colors.textSecondary,
              }}>{v}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.label, {color: colors.textSecondary}]}>Dose number</Text>
        <TextInput
          style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={doseNumber}
          onChangeText={setDoseNumber}
          keyboardType="numeric"
          placeholder="1"
        />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Batch/Lot</Text>
        <TextInput
          style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={batchLot}
          onChangeText={setBatchLot}
          placeholder="Optional"
        />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Product Name</Text>
        <TextInput
          style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={productName}
          onChangeText={setProductName}
          placeholder="Optional"
        />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Route & Site</Text>
        <TextInput
          style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={routeSite}
          onChangeText={setRouteSite}
          placeholder="e.g. intradermal, left upper arm"
        />
      </View>

      <Pressable
        onPress={handleSave}
        disabled={saving || !vaccineCode}
        style={[styles.button, {backgroundColor: colors.primary, opacity: saving || !vaccineCode ? 0.6 : 1}]}>
        <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Record Dose'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  section: {margin: 16, padding: 16, borderRadius: 12},
  sectionTitle: {fontSize: 16, fontWeight: '700', marginBottom: 12},
  label: {fontSize: 13, fontWeight: '500', marginTop: 8, marginBottom: 4},
  hint: {fontSize: 11, marginTop: 2, marginBottom: 8},
  vaccineGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8},
  vaccineChip: {paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1},
  input: {borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15},
  button: {margin: 16, padding: 14, borderRadius: 12, alignItems: 'center'},
  buttonText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
