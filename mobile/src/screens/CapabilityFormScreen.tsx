/**
 * CapabilityFormScreen — create or edit a facility capability.
 */
import React, {useEffect, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CapabilityForm'>;

export function CapabilityFormScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const editing = route.params?.capabilityId != null;
  const capabilityId = route.params?.capabilityId;

  const [facilityName, setFacilityName] = useState('');
  const [capability, setCapability] = useState('CSECTION');
  const [hasCapability, setHasCapability] = useState(true);

  useEffect(() => {
    if (editing && capabilityId) {
      const rows = query('SELECT facility_name, capability, has_capability FROM facility_capabilities WHERE id = ?', [capabilityId]);
      if (rows.length > 0) {
        const r = rows[0] as any;
        setFacilityName(String(r.facility_name || ''));
        setCapability(String(r.capability || 'CSECTION'));
        setHasCapability(Number(r.has_capability) === 1);
      }
    }
  }, [editing, capabilityId]);

  const handleSave = () => {
    if (!facilityName.trim()) {
      Alert.alert('Validation', 'Facility name is required.');
      return;
    }
    const db = getDb();
    const id = editing ? capabilityId! : `cap-${Date.now()}`;
    db.execute(
      `INSERT OR REPLACE INTO facility_capabilities (id, facility_name, capability, has_capability, sync_status)
       VALUES (?, ?, ?, ?, ?)`,
      [id, facilityName.trim(), capability, hasCapability ? 1 : 0, editing ? 'NOT_SYNCED' : 'NOT_SYNCED'],
    );
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!editing || !capabilityId) return;
    Alert.alert('Delete', 'Delete this capability record?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => {
        const db = getDb();
        db.execute('DELETE FROM facility_capabilities WHERE id = ?', [capabilityId]);
        navigation.goBack();
      }},
    ]);
  };

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, {color: colors.textPrimary}]}>{editing ? 'Edit Capability' : 'New Capability'}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Facility Name *</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={facilityName} onChangeText={setFacilityName} placeholder="Facility name" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Capability</Text>
          {['CSECTION', 'BLOOD_TRANSFUSION', 'INCUBATOR', 'OXYGEN', 'ULTRASOUND', 'LAB_TESTS', 'NEWBORN_CARE', 'EMERGENCY_CARE'].map(c => (
            <Pressable key={c} onPress={() => setCapability(c)} style={[styles.option, capability === c && {borderColor: colors.primary}]}>
              <Text style={{color: capability === c ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: capability === c ? '700' : '400'}}>{c.replace(/_/g, ' ')}</Text>
            </Pressable>
          ))}
          <View style={styles.switchRow}>
            <Text style={[styles.label, {color: colors.textSecondary}]}>Has Capability</Text>
            <Switch value={hasCapability} onValueChange={setHasCapability} trackColor={{false: colors.border, true: colors.primary}} />
          </View>
        </View>
        <Pressable style={[styles.saveButton, {backgroundColor: colors.primary}]} onPress={handleSave}>
          <Text style={styles.saveButtonText}>{editing ? 'Update' : 'Create'}</Text>
        </Pressable>
        {editing && (
          <Pressable style={[styles.deleteButton, {borderColor: '#EF4444'}]} onPress={handleDelete}>
            <Text style={[styles.deleteButtonText, {color: '#EF4444'}]}>Delete</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12},
  back: {fontSize: 16},
  title: {fontSize: 18, fontWeight: '700'},
  content: {padding: 16, gap: 12},
  card: {borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 8},
  label: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginTop: 8},
  input: {borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, minHeight: 48},
  option: {paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, marginTop: 4},
  switchRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12},
  saveButton: {padding: 14, borderRadius: 12, alignItems: 'center'},
  saveButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  deleteButton: {padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1},
  deleteButtonText: {fontWeight: '700', fontSize: 15},
});
