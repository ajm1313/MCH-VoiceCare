/**
 * GrowthRecordScreen — record weight, length/height, MUAC and oedema.
 * MCHVC-SPEC-001 v1.1 §51.3. Enqueues to outbox for sync (DEC-007).
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

export function GrowthRecordScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
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
    enqueue(
      'growth_measurement',
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
        source_type: 'WORKER_APP',
      },
      'device-001',
      'GMP-WHO-2006-v1',
    );
    setSaving(false);
    navigation.goBack();
  };

  return (
    <ScrollView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={[styles.section, {backgroundColor: colors.surface}]}>
        <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>
          Growth Measurement
        </Text>
        <Text style={[styles.label, {color: colors.textSecondary}]}>Weight (kg)</Text>
        <TextInput
          style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
          placeholder="3.5"
        />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Length (cm)</Text>
        <TextInput
          style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={length}
          onChangeText={setLength}
          keyboardType="numeric"
          placeholder="50"
        />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Height (cm)</Text>
        <TextInput
          style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={height}
          onChangeText={setHeight}
          keyboardType="numeric"
          placeholder="75"
        />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Measurement Position</Text>
        <View style={styles.chipRow}>
          {['RECUMBENT', 'STANDING', 'UNKNOWN'].map(pos => (
            <Pressable key={pos} onPress={() => setMeasurementPosition(pos)}
              style={[styles.chip, {backgroundColor: measurementPosition === pos ? colors.primary : 'transparent', borderColor: colors.border}]}>
              <Text style={{fontSize: 11, fontWeight: '600', color: measurementPosition === pos ? '#fff' : colors.textSecondary}}>{pos}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.label, {color: colors.textSecondary}]}>MUAC (mm)</Text>
        <TextInput
          style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={muac}
          onChangeText={setMuac}
          keyboardType="numeric"
          placeholder="120"
        />
        <View style={styles.switchRow}>
          <Text style={[styles.label, {color: colors.textPrimary}]}>Bilateral oedema</Text>
          <Switch value={oedema} onValueChange={setOedema} />
        </View>
        <Text style={[styles.label, {color: colors.textSecondary}]}>Feeding Status</Text>
        <View style={styles.chipRow}>
          {['UNKNOWN', 'BREASTFED', 'MIXED', 'COMPLEMENTARY', 'NOT_FEEDING'].map(fs => (
            <Pressable key={fs} onPress={() => setFeedingStatus(fs)}
              style={[styles.chip, {backgroundColor: feedingStatus === fs ? colors.primary : 'transparent', borderColor: colors.border}]}>
              <Text style={{fontSize: 11, fontWeight: '600', color: feedingStatus === fs ? '#fff' : colors.textSecondary}}>{fs}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.label, {color: colors.textSecondary}]}>Recent Illness</Text>
        <TextInput
          style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={recentIllness}
          onChangeText={setRecentIllness}
          placeholder="e.g. fever, diarrhoea"
        />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Measurement Quality</Text>
        <View style={styles.chipRow}>
          {['NOT_ASSESSED', 'GOOD', 'ACCEPTABLE', 'POOR'].map(mq => (
            <Pressable key={mq} onPress={() => setMeasurementQuality(mq)}
              style={[styles.chip, {backgroundColor: measurementQuality === mq ? colors.primary : 'transparent', borderColor: colors.border}]}>
              <Text style={{fontSize: 11, fontWeight: '600', color: measurementQuality === mq ? '#fff' : colors.textSecondary}}>{mq}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.label, {color: colors.textSecondary}]}>Scale ID</Text>
        <TextInput
          style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={scaleId}
          onChangeText={setScaleId}
          placeholder="Optional"
        />
        <Text style={[styles.label, {color: colors.textSecondary}]}>Length Board ID</Text>
        <TextInput
          style={[styles.input, {backgroundColor: colors.background, color: colors.textPrimary}]}
          value={lengthBoardId}
          onChangeText={setLengthBoardId}
          placeholder="Optional"
        />
      </View>

      <Pressable
        onPress={handleSave}
        disabled={saving}
        style={[styles.button, {backgroundColor: colors.primary, opacity: saving ? 0.6 : 1}]}>
        <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save Measurement'}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  section: {margin: 16, padding: 16, borderRadius: 12},
  sectionTitle: {fontSize: 16, fontWeight: '700', marginBottom: 12},
  label: {fontSize: 13, fontWeight: '500', marginTop: 8, marginBottom: 4},
  input: {borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15},
  switchRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12},
  chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8},
  chip: {paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6, borderWidth: 1},
  button: {margin: 16, padding: 14, borderRadius: 12, alignItems: 'center'},
  buttonText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
