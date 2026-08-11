/**
 * NotificationDetailScreen — notification detail with acknowledge/close actions.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {Alert, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  Field,
  LoadingState,
  Screen,
  SectionHeader,
  UrgencyBadge,
  Badge,
} from '../components/ui';
import {useTheme} from '../theme/useTheme';
import {border, radius, space} from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'NotificationDetail'>;

type ActionRecord = {
  id: string;
  action_type: string;
  notes: string;
  recorded_at: string;
};

export function NotificationDetailScreen({route, navigation}: Props) {
  const {colors} = useTheme();
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
    return (
      <Screen>
        <LoadingState message="Loading notification…" />
      </Screen>
    );
  }

  return (
    <Screen
      scroll
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); loadData(); }}>
      <View style={styles.backRow}>
        <Button
          label="Back"
          variant="ghost"
          icon="chevronLeft"
          onPress={() => navigation.goBack()}
        />
      </View>
      {notif ? (
        <>
          <Card style={styles.card}>
            <View style={styles.badgeRow}>
              <UrgencyBadge value={String(notif.urgency)} size="md" />
              <Badge label={String(notif.status)} tone="neutral" size="sm" />
            </View>
            <AppText variant="h2" style={styles.title}>{String(notif.title)}</AppText>
            <AppText variant="small" tone="secondary">{String(notif.notification_class)}</AppText>
            {notif.due_datetime && (
              <AppText variant="small" tone="secondary">Due: {String(notif.due_datetime)}</AppText>
            )}
            <AppText variant="caption" tone="tertiary">Created: {String(notif.created_at)}</AppText>
          </Card>

          {notif.status === 'OPEN' && (
            <Button
              label="Acknowledge"
              icon="check"
              fullWidth
              onPress={handleAcknowledge}
              style={styles.actionBtn}
            />
          )}
          {notif.status !== 'CLOSED' && (
            <Button
              label="Close Notification"
              variant="ghost"
              icon="close"
              fullWidth
              onPress={handleClose}
              style={styles.closeBtn}
            />
          )}

          <SectionHeader title="Action Records" style={styles.sectionHeader} />
          {actions.length === 0 ? (
            <EmptyState
              icon="clipboard"
              title="No actions recorded"
              message="Actions taken on this notification will appear here."
            />
          ) : (
            actions.map(a => (
              <Card key={a.id} style={styles.actionCard} variant="outlined">
                <AppText variant="bodyStrong">{a.action_type.replace(/_/g, ' ')}</AppText>
                <AppText variant="caption" tone="secondary">{a.recorded_at}</AppText>
                {a.notes ? <AppText variant="small" style={styles.actionNotes}>{a.notes}</AppText> : null}
              </Card>
            ))
          )}

          {!showActionForm ? (
            <Button
              label="Add Action"
              variant="secondary"
              icon="plus"
              fullWidth
              onPress={() => setShowActionForm(true)}
              style={styles.addActionBtn}
            />
          ) : (
            <Card style={styles.card}>
              <AppText variant="smallStrong" tone="secondary">Action Type</AppText>
              {['FOLLOW_UP_CALL', 'HOME_VISIT', 'ESCALATED', 'RESOLVED', 'OTHER'].map(t => (
                <Pressable
                  key={t}
                  onPress={() => setActionType(t)}
                  style={[
                    styles.option,
                    {
                      borderColor: actionType === t ? colors.primary : colors.border,
                      backgroundColor: actionType === t ? colors.primarySubtle : 'transparent',
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={t.replace(/_/g, ' ')}
                  accessibilityState={{selected: actionType === t}}>
                  <AppText
                    variant="body"
                    tone="inherit"
                    style={{color: actionType === t ? colors.primaryStrong : colors.textPrimary, fontWeight: actionType === t ? '700' : '400'}}>
                    {t.replace(/_/g, ' ')}
                  </AppText>
                </Pressable>
              ))}
              <Field
                label="Notes"
                value={actionNotes}
                onChangeText={setActionNotes}
                placeholder="Action notes..."
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
              <View style={styles.formActions}>
                <Button
                  label="Cancel"
                  variant="ghost"
                  onPress={() => setShowActionForm(false)}
                  style={styles.formBtn}
                />
                <Button
                  label="Save"
                  icon="check"
                  onPress={handleSaveAction}
                  style={styles.formBtn}
                />
              </View>
            </Card>
          )}
        </>
      ) : (
        <EmptyState
          icon="bell"
          title="Notification not found"
          message="This notification may have been deleted or synced from another device."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {marginBottom: space[2]},
  card: {marginBottom: space[3]},
  badgeRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[2], gap: space[2]},
  title: {marginBottom: space[1]},
  actionBtn: {marginBottom: space[2]},
  closeBtn: {marginBottom: space[3]},
  sectionHeader: {marginTop: space[4]},
  actionCard: {marginBottom: space[2]},
  actionNotes: {marginTop: space[1]},
  addActionBtn: {marginTop: space[2]},
  option: {
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radius.md,
    borderWidth: border.thick,
    marginTop: space[1],
  },
  formActions: {flexDirection: 'row', gap: space[3], marginTop: space[3]},
  formBtn: {flex: 1},
});
