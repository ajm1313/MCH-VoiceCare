/**
 * TemplateFormScreen — create or edit a message template.
 */
import React, {useEffect, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import {enqueue} from '../core/sync/outbox';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'TemplateForm'>;

export function TemplateFormScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const editing = route.params?.templateId != null;
  const templateId = route.params?.templateId;

  const [name, setName] = useState('');
  const [channel, setChannel] = useState('SMS');
  const [language, setLanguage] = useState('en');
  const [content, setContent] = useState('');

  useEffect(() => {
    if (editing && templateId) {
      const rows = query('SELECT name, channel, language, content FROM message_templates WHERE id = ?', [templateId]);
      if (rows.length > 0) {
        const r = rows[0] as any;
        setName(String(r.name || ''));
        setChannel(String(r.channel || 'SMS'));
        setLanguage(String(r.language || 'en'));
        setContent(String(r.content || ''));
      }
    }
  }, [editing, templateId]);

  const handleSave = () => {
    if (!name.trim() || !content.trim()) {
      Alert.alert('Validation', 'Name and content are required.');
      return;
    }
    const db = getDb();
    const id = editing ? templateId! : `tpl-${Date.now()}`;
    db.execute(
      `INSERT OR REPLACE INTO message_templates (id, name, channel, language, content, status, sync_status)
       VALUES (?, ?, ?, ?, ?, 'DRAFT', 'NOT_SYNCED')`,
      [id, name.trim(), channel, language, content.trim()],
    );
    if (editing) {
      db.execute('UPDATE message_templates SET sync_status = ? WHERE id = ?', ['NOT_SYNCED', id]);
    }
    enqueue('message_template', {
      id,
      name: name.trim(),
      channel,
      language,
      content: content.trim(),
      status: 'DRAFT',
    }, 'device-001', 'PREG-RULES-v1.1');
    navigation.goBack();
  };

  const handleDelete = () => {
    if (!editing || !templateId) return;
    Alert.alert('Delete', 'Delete this template?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => {
        const db = getDb();
        db.execute('DELETE FROM message_templates WHERE id = ?', [templateId]);
        navigation.goBack();
      }},
    ]);
  };

  const handleApprove = () => {
    if (!editing || !templateId) return;
    Alert.alert('Approve Template', 'Approve this template for use in campaigns?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Approve', onPress: () => {
        const db = getDb();
        db.execute('UPDATE message_templates SET status = ?, sync_status = ? WHERE id = ?', ['APPROVED', 'NOT_SYNCED', templateId]);
        enqueue('message_template', {
          id: templateId,
          name,
          channel,
          language,
          content,
          status: 'APPROVED',
        }, 'device-001', 'PREG-RULES-v1.1');
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
        <Text style={[styles.title, {color: colors.textPrimary}]}>{editing ? 'Edit Template' : 'New Template'}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Name *</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={name} onChangeText={setName} placeholder="Template name" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Channel</Text>
          {['SMS', 'VOICE', 'WHATSAPP', 'USSD'].map(c => (
            <Pressable key={c} onPress={() => setChannel(c)} style={[styles.option, channel === c && {borderColor: colors.primary}]}>
              <Text style={{color: channel === c ? colors.primary : colors.textPrimary, fontSize: 14, fontWeight: channel === c ? '700' : '400'}}>{c}</Text>
            </Pressable>
          ))}
          <Text style={[styles.label, {color: colors.textSecondary}]}>Language</Text>
          <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={language} onChangeText={setLanguage} placeholder="en" />
          <Text style={[styles.label, {color: colors.textSecondary}]}>Content *</Text>
          <TextInput
            style={[styles.input, styles.contentInput, {borderColor: colors.border, color: colors.textPrimary}]}
            value={content}
            onChangeText={setContent}
            placeholder="Message content. Use {{name}} for variable substitution."
            multiline
            numberOfLines={5}
            textAlignVertical="top"
          />
        </View>
        <Pressable style={[styles.saveButton, {backgroundColor: colors.primary}]} onPress={handleSave}>
          <Text style={styles.saveButtonText}>{editing ? 'Update' : 'Create'}</Text>
        </Pressable>
        {editing && (
          <Pressable style={[styles.approveButton, {borderColor: colors.primary}]} onPress={handleApprove}>
            <Text style={[styles.approveButtonText, {color: colors.primary}]}>Approve Template</Text>
          </Pressable>
        )}
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
  contentInput: {minHeight: 120},
  option: {paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, marginTop: 4},
  saveButton: {padding: 14, borderRadius: 12, alignItems: 'center'},
  saveButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  approveButton: {padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1},
  approveButtonText: {fontWeight: '700', fontSize: 15},
  deleteButton: {padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1},
  deleteButtonText: {fontWeight: '700', fontSize: 15},
});
