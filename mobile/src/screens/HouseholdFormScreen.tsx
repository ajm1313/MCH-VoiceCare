/**
 * HouseholdFormScreen — create or edit a household with full details.
 *
 * Collects: household_name, head_person_name, location_description, latitude,
 * longitude, phone (matching backend HouseholdForm fields).
 */
import React, {useEffect, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'HouseholdForm'>;

export function HouseholdFormScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const editing = route.params?.householdId != null;
  const householdId = route.params?.householdId;

  const [name, setName] = useState('');
  const [headPersonName, setHeadPersonName] = useState('');
  const [locationDescription, setLocationDescription] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    if (editing && householdId) {
      const rows = query(
        `SELECT household_name, head_person_name, location_description, latitude, longitude, phone
         FROM households WHERE id = ?`,
        [householdId],
      );
      if (rows.length > 0) {
        const r = rows[0] as any;
        setName(String(r.household_name || ''));
        setHeadPersonName(String(r.head_person_name || ''));
        setLocationDescription(String(r.location_description || ''));
        setLatitude(r.latitude != null ? String(r.latitude) : '');
        setLongitude(r.longitude != null ? String(r.longitude) : '');
        setPhone(String(r.phone || ''));
      }
    }
  }, [editing, householdId]);

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Validation', 'Household name is required.');
      return;
    }
    const db = getDb();
    const id = editing ? householdId! : `hh-${Date.now()}`;
    db.execute(
      `INSERT OR REPLACE INTO households (
        id, household_name, head_person_name, location_description, latitude, longitude, phone, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'NOT_SYNCED')`,
      [
        id, name.trim(),
        headPersonName.trim() || null,
        locationDescription.trim() || null,
        latitude.trim() ? parseFloat(latitude) : null,
        longitude.trim() ? parseFloat(longitude) : null,
        phone.trim() || null,
      ],
    );
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!editing || !householdId) return;
    Alert.alert('Delete', 'Delete this household?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => {
        const db = getDb();
        db.execute('DELETE FROM households WHERE id = ?', [householdId]);
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
        <Text style={[styles.title, {color: colors.textPrimary}]}>{editing ? 'Edit Household' : 'New Household'}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Household Name *</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={name} onChangeText={setName} placeholder="Household name" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Head of Household</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={headPersonName} onChangeText={setHeadPersonName} placeholder="Head person name" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Location Description</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={locationDescription} onChangeText={setLocationDescription} placeholder="Village / area / directions" multiline numberOfLines={2} textAlignVertical="top" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Latitude</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={latitude} onChangeText={setLatitude} placeholder="e.g. 9.4035" keyboardType="numeric" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Longitude</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={longitude} onChangeText={setLongitude} placeholder="e.g. -0.8423" keyboardType="numeric" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Phone</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={phone} onChangeText={setPhone} placeholder="Phone number" keyboardType="phone-pad" />
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
  saveButton: {padding: 14, borderRadius: 12, alignItems: 'center'},
  saveButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  deleteButton: {padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1},
  deleteButtonText: {fontWeight: '700', fontSize: 15},
});
