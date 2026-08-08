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
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors, urgency} from '../theme/colors';
import {query, getDb} from '../core/db/database';
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
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
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

  const statusColor = (status: string) => {
    if (status === 'COMPLETED') return colors.textSecondary;
    if (status === 'IN_PROGRESS') return urgency.AMBER;
    return urgency.GREEN;
  };

  if (loading) {
    return (
      <View style={[styles.container, {backgroundColor: colors.background}]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (selectedSession) {
    return (
      <View style={[styles.container, {backgroundColor: colors.background}]}>
        <View style={[styles.header, {borderBottomColor: colors.border}]}>
          <Pressable onPress={() => setSelectedSession(null)}>
            <Text style={{color: colors.primary, fontSize: 16}}>← Back</Text>
          </Pressable>
          <Text style={[styles.title, {color: colors.textPrimary}]}>
            {selectedSession.facility_name}
          </Text>
          <Pressable onPress={handleCloseSession}>
            <Text style={{color: urgency.RED, fontSize: 16, fontWeight: '600'}}>Close</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => navigation.navigate('CWCDetail', {sessionId: selectedSession.id})}
          style={[styles.fullDetailBtn, {borderColor: colors.primary}]}>
          <Text style={{color: colors.primary, fontWeight: '600', fontSize: 14}}>View Full Detail ›</Text>
        </Pressable>

        {selectedSession.status === 'PLANNED' && (
          <Pressable
            onPress={() => handleEditSession(selectedSession)}
            style={[styles.editBtn, {borderColor: colors.primary}]}>
            <Text style={{color: colors.primary, fontWeight: '600', fontSize: 14}}>Edit Session ›</Text>
          </Pressable>
        )}

        <View style={[styles.sessionInfo, {backgroundColor: colors.surface}]}>
          <Text style={{color: colors.textSecondary, fontSize: 13}}>
            {selectedSession.session_date} · {selectedSession.session_type}
          </Text>
          <Text style={{color: colors.textPrimary, fontSize: 15, marginTop: 4}}>
            Attended: {selectedSession.attended_count} / {attendance.length}
          </Text>
        </View>

        <FlatList
          data={attendance}
          keyExtractor={item => item.id}
          renderItem={({item}) => (
            <View style={[styles.attendanceRow, {backgroundColor: colors.surface}]}>
              <View style={{flex: 1}}>
                <Text style={{color: colors.textPrimary, fontSize: 15, fontWeight: '500'}}>
                  {item.child_name}
                </Text>
                {item.growth_recorded ? (
                  <Text style={{color: colors.textSecondary, fontSize: 12, marginTop: 2}}>
                    Growth recorded
                  </Text>
                ) : null}
              </View>
              <Switch
                value={item.attended === 1}
                onValueChange={() => toggleAttendance(item)}
                trackColor={{false: colors.border, true: colors.primary}}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={{color: colors.textSecondary, textAlign: 'center'}}>
                No children registered for this session yet.
              </Text>
            </View>
          }
          contentContainerStyle={{padding: 16, gap: 8}}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={[styles.header, {borderBottomColor: colors.border}]}>
        <Text style={[styles.title, {color: colors.textPrimary}]}>CWC Sessions</Text>
        <Pressable
          onPress={() => setShowCreate(true)}
          style={[styles.createButton, {backgroundColor: colors.primary}]}>
          <Text style={{color: '#fff', fontWeight: '600', fontSize: 15}}>+ New</Text>
        </Pressable>
      </View>

      <FlatList
        data={sessions}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadSessions();
            }}
            colors={[colors.primary]}
          />
        }
        renderItem={({item}) => (
          <Pressable
            onPress={() => handleOpenSession(item)}
            style={[styles.sessionCard, {backgroundColor: colors.surface}]}>
            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
              <Text style={{color: colors.textPrimary, fontSize: 16, fontWeight: '600'}}>
                {item.facility_name}
              </Text>
              <Text style={{color: statusColor(item.status), fontSize: 12, fontWeight: '600'}}>
                {item.status}
              </Text>
            </View>
            <Text style={{color: colors.textSecondary, fontSize: 13, marginTop: 4}}>
              {item.session_date} · {item.session_type}
            </Text>
            <Text style={{color: colors.textSecondary, fontSize: 13, marginTop: 2}}>
              Attended: {item.attended_count} / {item.expected_count}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={{color: colors.textSecondary, textAlign: 'center'}}>
              No CWC sessions yet. Tap "+ New" to create one.
            </Text>
          </View>
        }
        contentContainerStyle={{padding: 16, gap: 12}}
      />

      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, {backgroundColor: colors.surface}]}>
            <Text style={[styles.modalTitle, {color: colors.textPrimary}]}>
              {editingSession ? 'Edit CWC Session' : 'New CWC Session'}
            </Text>

            <Text style={[styles.label, {color: colors.textSecondary}]}>Facility name</Text>
            <TextInput
              style={[styles.input, {color: colors.textPrimary, borderColor: colors.border}]}
              value={facilityName}
              onChangeText={setFacilityName}
              placeholder="e.g. Ashaiman CWC"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={[styles.label, {color: colors.textSecondary}]}>Session date</Text>
            <TextInput
              style={[styles.input, {color: colors.textPrimary, borderColor: colors.border}]}
              value={sessionDate}
              onChangeText={setSessionDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textSecondary}
            />

            <Text style={[styles.label, {color: colors.textSecondary}]}>Session type</Text>
            <View style={{flexDirection: 'row', gap: 12, marginBottom: 16}}>
              {['FIXED', 'OUTREACH'].map(type => (
                <Pressable
                  key={type}
                  onPress={() => setSessionType(type)}
                  style={[
                    styles.typeButton,
                    {
                      backgroundColor: sessionType === type ? colors.primary : colors.background,
                      borderColor: colors.border,
                    },
                  ]}>
                  <Text
                    style={{
                      color: sessionType === type ? '#fff' : colors.textPrimary,
                      fontSize: 14,
                    }}>
                    {type}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={{flexDirection: 'row', gap: 12, justifyContent: 'flex-end'}}>
              <Pressable
                onPress={() => { setShowCreate(false); setEditingSession(null); }}
                style={[styles.modalButton, {borderColor: colors.border}]}>
                <Text style={{color: colors.textSecondary}}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateSession}
                style={[styles.modalButton, {backgroundColor: colors.primary}]}>
                <Text style={{color: '#fff', fontWeight: '600'}}>{editingSession ? 'Update' : 'Create'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {fontSize: 18, fontWeight: '700'},
  createButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  sessionCard: {
    borderRadius: 12,
    padding: 16,
  },
  sessionInfo: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 8,
  },
  attendanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 8,
  },
  emptyContainer: {
    padding: 40,
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalCard: {
    width: '85%',
    borderRadius: 16,
    padding: 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    marginBottom: 4,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  modalButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  fullDetailBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  editBtn: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
});
