/**
 * TemplateDetailScreen — message template detail with approve/edit actions.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RouteProp} from '@react-navigation/native';

import {darkColors, lightColors} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Template = {
  id: string;
  name: string;
  channel: string;
  language: string;
  content: string;
  status: string;
  created_at: string;
};

export function TemplateDetailScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'TemplateDetail'>>();
  const {templateId} = route.params;

  const [item, setItem] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const rows = query('SELECT id, name, channel, language, content, status, created_at FROM message_templates WHERE id = ?', [templateId]);
      if (rows.length > 0) {
        const r = rows[0] as any;
        setItem({
          id: String(r.id),
          name: String(r.name || ''),
          channel: String(r.channel || 'SMS'),
          language: String(r.language || 'en'),
          content: String(r.content || ''),
          status: String(r.status || 'DRAFT'),
          created_at: r.created_at ? String(r.created_at) : '—',
        });
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [templateId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleApprove = () => {
    Alert.alert('Approve Template', 'Approve this template for use in campaigns?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Approve', onPress: () => {
        const db = getDb();
        db.execute('UPDATE message_templates SET status = ?, sync_status = ? WHERE id = ?', ['APPROVED', 'NOT_SYNCED', templateId]);
        loadData();
      }},
    ]);
  };

  const handleDelete = () => {
    Alert.alert('Delete Template', 'Permanently delete this template?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => {
        const db = getDb();
        db.execute('DELETE FROM message_templates WHERE id = ?', [templateId]);
        navigation.goBack();
      }},
    ]);
  };

  if (loading) {
    return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Text style={[styles.back, {color: colors.primary}]} onPress={() => navigation.goBack()}>‹ Back</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />}>
        {item ? (
          <>
            <View style={[styles.card, {backgroundColor: colors.surface}]}>
              <Text style={[styles.title, {color: colors.textPrimary}]}>{item.name}</Text>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>Channel</Text>
                <Text style={[styles.infoValue, {color: colors.textPrimary}]}>{item.channel}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>Language</Text>
                <Text style={[styles.infoValue, {color: colors.textPrimary}]}>{item.language}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>Status</Text>
                <Text style={[styles.infoValue, {color: item.status === 'APPROVED' ? colors.primary : colors.textSecondary}]}>{item.status}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>Created</Text>
                <Text style={[styles.infoValue, {color: colors.textPrimary}]}>{item.created_at}</Text>
              </View>
            </View>

            <View style={[styles.contentCard, {backgroundColor: colors.surface}]}>
              <Text style={[styles.contentLabel, {color: colors.textSecondary}]}>MESSAGE CONTENT</Text>
              <Text style={[styles.contentText, {color: colors.textPrimary}]}>{item.content}</Text>
            </View>

            <View style={styles.actions}>
              <Pressable style={[styles.editBtn, {backgroundColor: colors.primary}]} onPress={() => navigation.navigate('TemplateForm', {templateId: item.id})}>
                <Text style={styles.editBtnText}>Edit Template</Text>
              </Pressable>
              {item.status !== 'APPROVED' && (
                <Pressable style={[styles.approveBtn, {borderColor: colors.primary}]} onPress={handleApprove}>
                  <Text style={[styles.approveBtnText, {color: colors.primary}]}>Approve</Text>
                </Pressable>
              )}
              <Pressable style={[styles.deleteBtn, {borderColor: '#dc2626'}]} onPress={handleDelete}>
                <Text style={[styles.deleteBtnText, {color: '#dc2626'}]}>Delete</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <Text style={[styles.empty, {color: colors.textSecondary}]}>Template not found</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  header: {paddingHorizontal: 16, paddingVertical: 12},
  back: {fontSize: 16},
  content: {padding: 16, gap: 12},
  card: {borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E2E8F0'},
  title: {fontSize: 18, fontWeight: '700', marginBottom: 12},
  infoRow: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6},
  infoLabel: {fontSize: 11, textTransform: 'uppercase', fontWeight: '600'},
  infoValue: {fontSize: 15, fontWeight: '500'},
  contentCard: {borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E2E8F0'},
  contentLabel: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8},
  contentText: {fontSize: 15, lineHeight: 22},
  actions: {gap: 8, marginTop: 8},
  editBtn: {padding: 14, borderRadius: 10, alignItems: 'center'},
  editBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},
  approveBtn: {padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1},
  approveBtnText: {fontWeight: '700', fontSize: 15},
  deleteBtn: {padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1},
  deleteBtnText: {fontWeight: '700', fontSize: 15},
  empty: {fontSize: 14, textAlign: 'center', paddingVertical: 32},
});
