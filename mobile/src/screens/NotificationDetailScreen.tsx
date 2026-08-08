/**
 * NotificationDetailScreen — notification detail with acknowledge/close actions.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors, urgency} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationDetail'>;

type ActionRecord = {
  id: string;
  action_type: string;
  notes: string;
  recorded_at: string;
};

export function NotificationDetailScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const {notificationId} = route.params;

  const [notif, setNotif] = useState<Record<string, any> | null>(null);
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showActionForm, setShowActionForm] = useState(false);
  const [actionType, setActionType] = useState('FOLLOW_UP_CALL');
  const [actionNotes, setActionNotes] = useState('');

  const loadData = useCallback(() => {
    try {
      const nRows = query('SELECT * FROM notifications WHERE id = ?', [notificationId]);
      if (nRows.length > 0) setNotif(nRows[0] as any);

      const aRows = query(
        'SELECT id, action_type, notes, recorded_at FROM action_records WHERE notification_id = ? ORDER BY recorded_at DESC',
        [notificationId],
      );
      setActions(aRows.map((r: any) => ({
        id: String(r.id),
        action_type: String(r.action_type || ''),
        notes: String(r.notes || ''),
        recorded_at: String(r.recorded_at || ''),
      })));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [notificationId]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateStatus = (status: string) => {
    const db = getDb();
    db.execute('UPDATE notifications SET status = ? WHERE id = ?', [status, notificationId]);
    setNotif(prev => prev ? {...prev, status} : prev);
  };

  const handleAcknowledge = () => updateStatus('ACKNOWLEDGED');

  const handleClose = () => {
    Alert.alert('Close Notification', 'Mark this notification as closed?', [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Close', onPress: () => updateStatus('CLOSED')},
    ]);
  };

  const handleSaveAction = () => {
    const db = getDb();
    const id = `action-${Date.now()}`;
    const now = new Date().toISOString();
    db.execute(
      'INSERT OR REPLACE INTO action_records (id, notification_id, action_type, notes, recorded_by, recorded_at, sync_status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, notificationId, actionType, actionNotes, '', now, 'NOT_SYNCED'],
    );
    setActionNotes('');
    setShowActionForm(false);
    loadData();
  };

  if (loading) {
    return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;
  }

  const urgencyColor = notif ? urgency[notif.urgency as keyof typeof urgency] || urgency.GREY : urgency.GREY;

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />}>
        {notif ? (
          <>
            <View style={[styles.card, {backgroundColor: colors.surface}]}>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, {backgroundColor: urgencyColor}]}>
                  <Text style={styles.badgeText}>{String(notif.urgency)}</Text>
                </View>
                <Text style={[styles.status, {color: colors.textSecondary}]}>{String(notif.status)}</Text>
              </View>
              <Text style={[styles.title, {color: colors.textPrimary}]}>{String(notif.title)}</Text>
              <Text style={[styles.sub, {color: colors.textSecondary}]}>{String(notif.notification_class)}</Text>
              {notif.due_datetime && <Text style={[styles.sub, {color: colors.textSecondary}]}>Due: {String(notif.due_datetime)}</Text>}
              <Text style={[styles.sub, {color: colors.textSecondary}]}>Created: {String(notif.created_at)}</Text>
            </View>

            {notif.status === 'OPEN' && (
              <Pressable style={[styles.actionButton, {backgroundColor: colors.primary}]} onPress={handleAcknowledge}>
                <Text style={styles.actionButtonText}>Acknowledge</Text>
              </Pressable>
            )}
            {notif.status !== 'CLOSED' && (
              <Pressable style={[styles.closeButton, {borderColor: colors.textSecondary}]} onPress={handleClose}>
                <Text style={[styles.closeButtonText, {color: colors.textSecondary}]}>Close Notification</Text>
              </Pressable>
            )}

            <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Action Records</Text>
            {actions.length === 0 ? (
              <Text style={[styles.empty, {color: colors.textSecondary}]}>No actions recorded</Text>
            ) : (
              actions.map(a => (
                <View key={a.id} style={[styles.actionCard, {backgroundColor: colors.surface}]}>
                  <Text style={[styles.actionType, {color: colors.textPrimary}]}>{a.action_type.replace(/_/g, ' ')}</Text>
                  <Text style={[styles.actionTime, {color: colors.textSecondary}]}>{a.recorded_at}</Text>
                  {a.notes ? <Text style={[styles.actionNotes, {color: colors.textPrimary}]}>{a.notes}</Text> : null}
                </View>
              ))
            )}

            {!showActionForm ? (
              <Pressable style={[styles.addActionButton, {borderColor: colors.primary}]} onPress={() => setShowActionForm(true)}>
                <Text style={[styles.addActionText, {color: colors.primary}]}>+ Add Action</Text>
              </Pressable>
            ) : (
              <View style={[styles.card, {backgroundColor: colors.surface}]}>
                <Text style={[styles.label, {color: colors.textSecondary}]}>Action Type</Text>
                {['FOLLOW_UP_CALL', 'HOME_VISIT', 'ESCALATED', 'RESOLVED', 'OTHER'].map(t => (
                  <Pressable key={t} onPress={() => setActionType(t)} style={[styles.option, actionType === t && {borderColor: colors.primary}]}>
                    <Text style={{color: actionType === t ? colors.primary : colors.textPrimary, fontSize: 14}}>{t.replace(/_/g, ' ')}</Text>
                  </Pressable>
                ))}
                <Text style={[styles.label, {color: colors.textSecondary}]}>Notes</Text>
                <TextInput style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]} value={actionNotes} onChangeText={setActionNotes} placeholder="Action notes..." multiline numberOfLines={3} textAlignVertical="top" />
                <View style={styles.formActions}>
                  <Pressable style={[styles.cancelBtn, {borderColor: colors.border}]} onPress={() => setShowActionForm(false)}>
                    <Text style={[styles.cancelText, {color: colors.textSecondary}]}>Cancel</Text>
                  </Pressable>
                  <Pressable style={[styles.saveBtn, {backgroundColor: colors.primary}]} onPress={handleSaveAction}>
                    <Text style={styles.saveBtnText}>Save</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </>
        ) : (
          <Text style={[styles.empty, {color: colors.textSecondary}]}>Notification not found</Text>
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
  card: {borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 6},
  badgeRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  badgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},
  status: {fontSize: 11, fontWeight: '600'},
  title: {fontSize: 18, fontWeight: '700'},
  sub: {fontSize: 13, marginTop: 2},
  actionButton: {padding: 14, borderRadius: 12, alignItems: 'center'},
  actionButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  closeButton: {padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1},
  closeButtonText: {fontWeight: '600', fontSize: 14},
  sectionTitle: {fontSize: 16, fontWeight: '700', marginTop: 8},
  empty: {fontSize: 14, paddingVertical: 16},
  actionCard: {borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#E2E8F0'},
  actionType: {fontSize: 14, fontWeight: '600'},
  actionTime: {fontSize: 11, marginTop: 2},
  actionNotes: {fontSize: 13, marginTop: 4},
  addActionButton: {padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center', borderStyle: 'dashed'},
  addActionText: {fontWeight: '600', fontSize: 14},
  label: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginTop: 8},
  option: {paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, marginTop: 4},
  input: {borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, minHeight: 60},
  formActions: {flexDirection: 'row', gap: 12, marginTop: 12},
  cancelBtn: {flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center'},
  cancelText: {fontWeight: '600', fontSize: 14},
  saveBtn: {flex: 1, padding: 12, borderRadius: 10, alignItems: 'center'},
  saveBtnText: {color: '#fff', fontWeight: '700', fontSize: 14},
});
