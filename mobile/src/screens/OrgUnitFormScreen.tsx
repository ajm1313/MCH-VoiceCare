/**
 * OrgUnitFormScreen — create or edit an organisation unit.
 *
 * Collects: name, code, unit_type, parent_name, facility_type, latitude,
 * longitude, status (matching backend OrganisationUnitForm fields).
 */
import React, {useEffect, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import {enqueue} from '../core/sync/outbox';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'OrgUnitForm'>;

const FACILITY_TYPES = ['', 'CHPS', 'HEALTH_CENTRE', 'DISTRICT_HOSPITAL', 'REGIONAL_HOSPITAL', 'TERTIARY', 'MATERNITY_HOME', 'CLINIC'];

export function OrgUnitFormScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const editing = route.params?.orgUnitId != null;
  const orgUnitId = route.params?.orgUnitId;

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [unitType, setUnitType] = useState('CHPS');
  const [parentName, setParentName] = useState('');
  const [facilityType, setFacilityType] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [status, setStatus] = useState('ACTIVE');

  useEffect(() => {
    if (editing && orgUnitId) {
      const rows = query(
        `SELECT name, code, unit_type, parent_name, facility_type, latitude, longitude, status
         FROM org_units WHERE id = ?`,
        [orgUnitId],
      );
      if (rows.length > 0) {
        const r = rows[0] as any;
        setName(String(r.name || ''));
        setCode(String(r.code || ''));
        setUnitType(String(r.unit_type || 'CHPS'));
        setParentName(String(r.parent_name || ''));
        setFacilityType(String(r.facility_type || ''));
        setLatitude(r.latitude != null ? String(r.latitude) : '');
        setLongitude(r.longitude != null ? String(r.longitude) : '');
        setStatus(String(r.status || 'ACTIVE'));
      }
    }
  }, [editing, orgUnitId]);

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Unit name is required.');
      return;
    }
    const db = getDb();
    const id = editing ? orgUnitId! : `org-${Date.now()}`;
    db.execute(
      `INSERT OR REPLACE INTO org_units (
        id, name, code, unit_type, parent_name, facility_type, latitude, longitude, status, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOT_SYNCED')`,
      [
        id, name.trim(), code.trim() || null, unitType,
        parentName.trim() || null, facilityType || null,
        latitude.trim() ? parseFloat(latitude) : null,
        longitude.trim() ? parseFloat(longitude) : null,
        status,
      ],
    );
    enqueue('org_unit', {
      id,
      name: name.trim(),
      code: code.trim() || null,
      unit_type: unitType,
      parent_name: parentName.trim() || null,
      facility_type: facilityType || null,
      latitude: latitude.trim() ? parseFloat(latitude) : null,
      longitude: longitude.trim() ? parseFloat(longitude) : null,
      status,
    }, 'device-001', 'PREG-RULES-v1.1');
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!editing || !orgUnitId) return;
    Alert.alert('Delete', 'Delete this organisation unit?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => {
        const db = getDb();
        db.execute('DELETE FROM org_units WHERE id = ?', [orgUnitId]);
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
        <Text style={[styles.title, {color: colors.textPrimary}]}>{editing ? 'Edit Org Unit' : 'New Org Unit'}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Name *</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={name} onChangeText={setName} placeholder="Unit name" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Code</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={code} onChangeText={setCode} placeholder="Unique code (e.g. FAC-001)" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Unit Type</Text>
          {['REGION', 'DISTRICT', 'SUB_DISTRICT', 'FACILITY', 'CHPS', 'COMMUNITY'].map(t => (
            <Pressable key={t} onPress={() => setUnitType(t)} style={[styles.option, unitType === t && {borderColor: colors.primary}]}>
              <Text style={{color: unitType === t ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: unitType === t ? '700' : '400'}}>{t.replace(/_/g, ' ')}</Text>
            </Pressable>
          ))}
          <Text style={[styles.label, {color: colors.textSecondary}]}>Parent Unit Name</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={parentName} onChangeText={setParentName} placeholder="Parent unit (optional)" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Facility Type</Text>
          {FACILITY_TYPES.map(ft => (
            <Pressable key={ft || 'NONE'} onPress={() => setFacilityType(ft)} style={[styles.option, facilityType === ft && {borderColor: colors.primary}]}>
              <Text style={{color: facilityType === ft ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: facilityType === ft ? '700' : '400'}}>{ft || '— None —'}</Text>
            </Pressable>
          ))}
          <Text style={[styles.label, {color: colors.textSecondary}]}>Latitude</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={latitude} onChangeText={setLatitude} placeholder="e.g. 9.4035" keyboardType="numeric" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Longitude</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={longitude} onChangeText={setLongitude} placeholder="e.g. -0.8423" keyboardType="numeric" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Status</Text>
          {['ACTIVE', 'INACTIVE'].map(s => (
            <Pressable key={s} onPress={() => setStatus(s)} style={[styles.option, status === s && {borderColor: colors.primary}]}>
              <Text style={{color: status === s ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: status === s ? '700' : '400'}}>{s}</Text>
            </Pressable>
          ))}
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
  saveButton: {padding: 14, borderRadius: 12, alignItems: 'center'},
  saveButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  deleteButton: {padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1},
  deleteButtonText: {fontWeight: '700', fontSize: 15},
});
