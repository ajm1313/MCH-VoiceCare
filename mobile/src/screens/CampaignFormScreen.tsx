/**
 * CampaignFormScreen — create or edit a communication campaign.
 */
import React, {useEffect, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import {enqueue} from '../core/sync/outbox';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CampaignForm'>;

export function CampaignFormScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const editing = route.params?.campaignId != null;
  const campaignId = route.params?.campaignId;

  const [title, setTitle] = useState('');
  const [channel, setChannel] = useState('SMS');
  const [templateName, setTemplateName] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');

  useEffect(() => {
    if (editing && campaignId) {
      const rows = query('SELECT title, channel, template_name, scheduled_at FROM communication_campaigns WHERE id = ?', [campaignId]);
      if (rows.length > 0) {
        const r = rows[0] as any;
        setTitle(String(r.title || ''));
        setChannel(String(r.channel || 'SMS'));
        setTemplateName(String(r.template_name || ''));
        setScheduledAt(String(r.scheduled_at || ''));
      }
    }
  }, [editing, campaignId]);

  const handleSave = () => {
    if (!title.trim()) {
      Alert.alert('Validation', 'Campaign title is required.');
      return;
    }
    const db = getDb();
    const id = editing ? campaignId! : `camp-${Date.now()}`;
    const now = new Date().toISOString();
    db.execute(
      `INSERT OR REPLACE INTO communication_campaigns (id, title, channel, status, template_name, audience_count, created_at, scheduled_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'NOT_SYNCED')`,
      [id, title.trim(), channel, editing ? null : 'DRAFT', templateName.trim() || null, 0, now, scheduledAt.trim() || null],
    );
    if (editing) {
      db.execute('UPDATE communication_campaigns SET sync_status = ? WHERE id = ?', ['NOT_SYNCED', id]);
    }
    enqueue('communication_campaign', {
      id,
      title: title.trim(),
      channel,
      status: editing ? null : 'DRAFT',
      template_name: templateName.trim() || null,
      scheduled_at: scheduledAt.trim() || null,
    }, 'device-001', 'PREG-RULES-v1.1');
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!editing || !campaignId) return;
    Alert.alert('Delete', 'Delete this campaign?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => {
        const db = getDb();
        db.execute('DELETE FROM communication_campaigns WHERE id = ?', [campaignId]);
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
        <Text style={[styles.title, {color: colors.textPrimary}]}>{editing ? 'Edit Campaign' : 'New Campaign'}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Title *</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={title} onChangeText={setTitle} placeholder="Campaign title" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Channel</Text>
          {['SMS', 'VOICE', 'WHATSAPP', 'USSD'].map(c => (
            <Pressable key={c} onPress={() => setChannel(c)} style={[styles.option, channel === c && {borderColor: colors.primary}]}>
              <Text style={{color: channel === c ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: channel === c ? '700' : '400'}}>{c}</Text>
            </Pressable>
          ))}
          <Text style={[styles.label, {color: colors.textSecondary}]}>Template Name</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={templateName} onChangeText={setTemplateName} placeholder="Template name (optional)" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Scheduled At</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={scheduledAt} onChangeText={setScheduledAt} placeholder="YYYY-MM-DDTHH:MM (optional)" />
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
