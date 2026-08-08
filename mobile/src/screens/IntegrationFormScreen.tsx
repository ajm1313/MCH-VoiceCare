/**
 * IntegrationFormScreen — create or edit an integration config.
 */
import React, {useEffect, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'IntegrationForm'>;

export function IntegrationFormScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const editing = route.params?.integrationId != null;
  const integrationId = route.params?.integrationId;

  const [configType, setConfigType] = useState('KHAYA');
  const [providerName, setProviderName] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [status, setStatus] = useState('ACTIVE');

  useEffect(() => {
    if (editing && integrationId) {
      const rows = query('SELECT config_type, provider_name, status, base_url FROM integration_configs WHERE id = ?', [integrationId]);
      if (rows.length > 0) {
        const r = rows[0] as any;
        setConfigType(String(r.config_type || 'KHAYA'));
        setProviderName(String(r.provider_name || ''));
        setBaseUrl(String(r.base_url || ''));
        setStatus(String(r.status || 'ACTIVE'));
      }
    }
  }, [editing, integrationId]);

  const handleSave = () => {
    if (!providerName.trim()) {
      Alert.alert('Validation', 'Provider name is required.');
      return;
    }
    const db = getDb();
    const id = editing ? integrationId! : `int-${Date.now()}`;
    db.execute(
      `INSERT OR REPLACE INTO integration_configs (id, config_type, provider_name, status, base_url, sync_status)
       VALUES (?, ?, ?, ?, ?, 'NOT_SYNCED')`,
      [id, configType, providerName.trim(), status, baseUrl.trim() || null],
    );
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!editing || !integrationId) return;
    Alert.alert('Delete', 'Delete this integration config?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => {
        const db = getDb();
        db.execute('DELETE FROM integration_configs WHERE id = ?', [integrationId]);
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
        <Text style={[styles.title, {color: colors.textPrimary}]}>{editing ? 'Edit Integration' : 'New Integration'}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Config Type</Text>
          {['KHAYA', 'TELECOM', 'DHIS2', 'OPENMRS', 'CUSTOM'].map(c => (
            <Pressable key={c} onPress={() => setConfigType(c)} style={[styles.option, configType === c && {borderColor: colors.primary}]}>
              <Text style={{color: configType === c ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: configType === c ? '700' : '400'}}>{c}</Text>
            </Pressable>
          ))}
          <Text style={[styles.label, {color: colors.textSecondary}]}>Provider Name *</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={providerName} onChangeText={setProviderName} placeholder="Provider name" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Base URL</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={baseUrl} onChangeText={setBaseUrl} placeholder="https://api.example.com" autoCapitalize="none" />
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
