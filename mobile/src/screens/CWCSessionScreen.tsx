/**
 * CWCSessionScreen — Child Welfare Clinic session management.
 * MCHVC-SPEC-001 v1.1 §27, MVP-005.
 *
 * Lists planned and completed CWC sessions, allows creating new sessions,
 * marking attendance, and closing sessions with automatic reconciliation.
 * Works fully offline (DEC-007).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {useTheme} from '../theme/useTheme';
import {query, getDb} from '../core/db/database';
import {
  Screen,
  Card,
  Button,
  Badge,
  Field,
  EmptyState,
  LoadingState,
  AppText,
  type BadgeTone,
} from '../components/ui';
import {border, radius, space} from '../theme/tokens';
import type {RootStackParamList} from '../core/navigation/types';

type CWCSession = {
  id: string;
  facility_name: string;
  session_date: string;
  session_type: string;
  status: string;
  expected_count: number;
  attended_count: number;
};

type AttendanceRow = {
  id: string;
  session_id: string;
  child_id: string;
  child_name: string;
  attended: number;
  doses_given: string;
  growth_recorded: number;
  notes: string;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function CWCSessionScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();

  const [sessions, setSessions] = useState<CWCSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingSession, setEditingSession] = useState<CWCSession | null>(null);
  const [selectedSession, setSelectedSession] = useState<CWCSession | null>(null);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);

  // Create form state
  const [facilityName, setFacilityName] = useState('');
  const [sessionDate, setSessionDate] = useState('');
  const [sessionType, setSessionType] = useState('FIXED');

  const loadSessions = useCallback(() => {
    try {
      const result = query(
        `SELECT id, facility_name, session_date, session_type, status,
                expected_count, attended_count
         FROM cwc_sessions
         ORDER BY session_date DESC`,
      );
      const items: CWCSession[] = result.map((r: any) => ({
        id: String(r.id),
        facility_name: String(r.facility_name || ''),
        session_date: String(r.session_date || ''),
        session_type: String(r.session_type || 'FIXED'),
        status: String(r.status || 'PLANNED'),
        expected_count: Number(r.expected_count || 0),
        attended_count: Number(r.attended_count || 0),
      }));
      setSessions(items);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const loadAttendance = useCallback((sessionId: string) => {
    const result = query(
      `SELECT id, session_id, child_id, child_name, attended, doses_given,
              growth_recorded, notes
       FROM cwc_session_attendance
       WHERE session_id = ?
       ORDER BY child_name`,
      [sessionId],
    );
    const items: AttendanceRow[] = result.map((r: any) => ({
      id: String(r.id),
      session_id: String(r.session_id),
      child_id: String(r.child_id),
      child_name: String(r.child_name || 'Unknown'),
      attended: Number(r.attended || 0),
      doses_given: String(r.doses_given || '[]'),
      growth_recorded: Number(r.growth_recorded || 0),
      notes: String(r.notes || ''),
    }));
    setAttendance(items);
  }, []);

  const handleCreateSession = () => {
    if (!facilityName.trim() || !sessionDate.trim()) return;
    const db = getDb();
    if (editingSession) {
      db.execute(
        `UPDATE cwc_sessions SET facility_name = ?, session_date = ?, session_type = ?, sync_status = 'NOT_SYNCED' WHERE id = ?`,
        [facilityName.trim(), sessionDate.trim(), sessionType, editingSession.id],
      );
      setEditingSession(null);
    } else {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      db.execute(
        `INSERT OR REPLACE INTO cwc_sessions
         (id, facility_name, session_date, session_type, status, expected_count, attended_count, sync_status)
         VALUES (?, ?, ?, ?, 'PLANNED', 0, 0, 'NOT_SYNCED')`,
        [id, facilityName.trim(), sessionDate.trim(), sessionType],
      );
    }
    setFacilityName('');
    setSessionDate('');
    setSessionType('FIXED');
    setShowCreate(false);
    loadSessions();
  };

  const handleOpenSession = (session: CWCSession) => {
    setSelectedSession(session);
    loadAttendance(session.id);
  };

  const handleEditSession = (session: CWCSession) => {
    setEditingSession(session);
    setFacilityName(session.facility_name);
    setSessionDate(session.session_date);
    setSessionType(session.session_type);
    setShowCreate(true);
  };

  const toggleAttendance = (row: AttendanceRow) => {
    const newAttended = row.attended ? 0 : 1;
    const db = getDb();
    db.execute(
      `UPDATE cwc_session_attendance SET attended = ?, sync_status = 'NOT_SYNCED' WHERE id = ?`,
      [newAttended, row.id],
    );
    loadAttendance(selectedSession!.id);
    updateAttendanceCount(selectedSession!.id);
  };

  const updateAttendanceCount = (sessionId: string) => {
    const rows = query(
      `SELECT COUNT(*) as cnt FROM cwc_session_attendance WHERE session_id = ? AND attended = 1`,
      [sessionId],
    );
    const count = Number(rows[0]?.cnt || 0);
    const db = getDb();
    db.execute(
      `UPDATE cwc_sessions SET attended_count = ?, sync_status = 'NOT_SYNCED' WHERE id = ?`,
      [count, sessionId],
    );
    loadSessions();
  };

  const handleCloseSession = () => {
    if (!selectedSession) return;
    const db = getDb();
    const now = new Date().toISOString();
    db.execute(
      `UPDATE cwc_sessions SET status = 'COMPLETED', completed_at = ?, sync_status = 'NOT_SYNCED'
       WHERE id = ?`,
      [now, selectedSession.id],
    );
    setSelectedSession(null);
    setAttendance([]);
    loadSessions();
  };

  const statusTone = (status: string): BadgeTone => {
    if (status === 'COMPLETED') return 'neutral';
    if (status === 'IN_PROGRESS') return 'warning';
    return 'success';
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading CWC sessions…" />
      </Screen>
    );
  }

  if (selectedSession) {
    return (
      <Screen padded={false}>
        <View style={[styles.header, {borderBottomColor: colors.border}]}>
          <Button
            label="Back"
            variant="ghost"
            size="sm"
            icon="chevronLeft"
            onPress={() => setSelectedSession(null)}
          />
          <AppText variant="h3" style={styles.flex}>
            {selectedSession.facility_name}
          </AppText>
          <Button
            label="Close"
            variant="danger"
            size="sm"
            icon="close"
            onPress={handleCloseSession}
          />
        </View>

        <View style={styles.actionRow}>
          <Button
            label="View Full Detail"
            variant="secondary"
            size="md"
            icon="fileText"
            iconRight="chevronRight"
            onPress={() => navigation.navigate('CWCDetail', {sessionId: selectedSession.id})}
          />
        </View>

        {selectedSession.status === 'PLANNED' && (
          <View style={styles.actionRow}>
            <Button
              label="Edit Session"
              variant="ghost"
              size="md"
              icon="pencil"
              iconRight="chevronRight"
              onPress={() => handleEditSession(selectedSession)}
            />
          </View>
        )}

        <Card style={styles.sessionInfo}>
          <AppText variant="small" tone="secondary">
            {selectedSession.session_date} · {selectedSession.session_type}
          </AppText>
          <AppText variant="bodyStrong" style={styles.attendedText}>
            Attended: {selectedSession.attended_count} / {attendance.length}
          </AppText>
        </Card>

        <FlatList
          data={attendance}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <Card style={styles.attendanceRow}>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{item.child_name}</AppText>
                {item.growth_recorded ? (
                  <AppText variant="caption" tone="secondary" style={styles.growthRecorded}>
                    Growth recorded
                  </AppText>
                ) : null}
              </View>
              <Switch
                value={item.attended === 1}
                onValueChange={() => toggleAttendance(item)}
                trackColor={{false: colors.border, true: colors.primary}}
              />
            </Card>
          )}
          ListEmptyComponent={
            <EmptyState
              icon="users"
              title="No children registered"
              message="No children registered for this session yet."
            />
          }
          contentContainerStyle={{padding: space[4], gap: space[2]}}
        />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={[styles.header, {borderBottomColor: colors.border}]}>
        <AppText variant="h2" style={styles.flex}>CWC Sessions</AppText>
        <Button
          label="New"
          variant="primary"
          size="sm"
          icon="plus"
          onPress={() => setShowCreate(true)}
        />
      </View>

      <FlatList
        data={sessions}
        keyExtractor={item => item.id}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          loadSessions();
        }}
        renderItem={({item}) => (
          <Card
            onPress={() => handleOpenSession(item)}
            style={styles.sessionCard}>
            <View style={styles.cardHeader}>
              <AppText variant="bodyStrong" style={styles.flex}>{item.facility_name}</AppText>
              <Badge
                label={item.status}
                tone={statusTone(item.status)}
                size="sm"
              />
            </View>
            <AppText variant="small" tone="secondary" style={styles.cardSub}>
              {item.session_date} · {item.session_type}
            </AppText>
            <AppText variant="small" tone="secondary" style={styles.cardMeta}>
              Attended: {item.attended_count} / {item.expected_count}
            </AppText>
          </Card>
        )}
        ListEmptyComponent={
          <EmptyState
            icon="clipboard"
            title="No CWC sessions"
            message={'Tap "New" to create a CWC session.'}
            action={{label: 'New Session', onPress: () => setShowCreate(true)}}
          />
        }
        contentContainerStyle={{padding: space[4], gap: space[3]}}
      />

      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <Card style={styles.modalCard}>
            <AppText variant="h3" style={styles.modalTitle}>
              {editingSession ? 'Edit CWC Session' : 'New CWC Session'}
            </AppText>

            <Field
              label="Facility name"
              value={facilityName}
              onChangeText={setFacilityName}
              placeholder="e.g. Ashaiman CWC"
            />
            <Field
              label="Session date"
              value={sessionDate}
              onChangeText={setSessionDate}
              placeholder="YYYY-MM-DD"
            />

            <AppText variant="smallStrong" tone="secondary" style={styles.label}>Session type</AppText>
            <View style={styles.typeRow}>
              {['FIXED', 'OUTREACH'].map(type => (
                <Pressable
                  key={type}
                  onPress={() => setSessionType(type)}
                  accessibilityRole="button"
                  accessibilityLabel={type}
                  accessibilityState={{selected: sessionType === type}}
                  style={[
                    styles.typeButton,
                    {
                      backgroundColor: sessionType === type ? colors.primary : colors.background,
                      borderColor: colors.border,
                    },
                  ]}>
                  <AppText
                    variant="smallStrong"
                    tone="inherit"
                    style={{color: sessionType === type ? colors.onPrimary : colors.textPrimary}}>
                    {type}
                  </AppText>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Button
                label="Cancel"
                variant="ghost"
                size="md"
                onPress={() => { setShowCreate(false); setEditingSession(null); }}
              />
              <Button
                label={editingSession ? 'Update' : 'Create'}
                variant="primary"
                size="md"
                icon="check"
                onPress={handleCreateSession}
              />
            </View>
          </Card>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderBottomWidth: 1,
  },
  flex: {flex: 1},
  actionRow: {paddingHorizontal: space[4], marginTop: space[2]},
  sessionInfo: {
    marginHorizontal: space[4],
    marginTop: space[3],
  },
  attendedText: {marginTop: space[1]},
  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  growthRecorded: {marginTop: 2},
  sessionCard: {marginBottom: space[2]},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2]},
  cardSub: {marginTop: space[1]},
  cardMeta: {marginTop: 2},
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(10, 27, 51, 0.55)',
  },
  modalCard: {width: '85%', padding: space[6]},
  modalTitle: {marginBottom: space[4]},
  label: {marginBottom: space[1]},
  typeRow: {flexDirection: 'row', gap: space[3], marginBottom: space[4]},
  typeButton: {
    flex: 1,
    paddingVertical: space[2] + 2,
    borderRadius: radius.md,
    borderWidth: border.thick,
    alignItems: 'center',
  },
  modalActions: {
    flexDirection: 'row',
    gap: space[3],
    justifyContent: 'flex-end',
  },
});
