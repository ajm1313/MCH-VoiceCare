/**
 * CWCDetailScreen — CWC session detail with attendance list and close action.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors, urgency} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CWCDetail'>;

type Attendance = {
  id: string;
  child_name: string;
  attended: number;
  doses_given: string;
  growth_recorded: number;
  notes: string;
};

export function CWCDetailScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const {sessionId} = route.params;

  const [session, setSession] = useState<Record<string, any> | null>(null);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const sRows = query('SELECT * FROM cwc_sessions WHERE id = ?', [sessionId]);
      if (sRows.length > 0) setSession(sRows[0] as any);

      const aRows = query('SELECT * FROM cwc_session_attendance WHERE session_id = ?', [sessionId]);
      setAttendance(aRows.map((r: any) => ({
        id: String(r.id),
        child_name: String(r.child_name || ''),
        attended: Number(r.attended) || 0,
        doses_given: String(r.doses_given || '[]'),
        growth_recorded: Number(r.growth_recorded) || 0,
        notes: String(r.notes || ''),
      })));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [sessionId]);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleAttendance = (id: string, value: boolean) => {
    const db = getDb();
    db.execute('UPDATE cwc_session_attendance SET attended = ? WHERE id = ?', [value ? 1 : 0, id]);
    setAttendance(prev => prev.map(a => a.id === id ? {...a, attended: value ? 1 : 0} : a));
  };

  const handleClose = () => {
    if (!session) return;
    Alert.alert('Close Session', 'Mark this CWC session as completed?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Close',
        onPress: () => {
          const db = getDb();
          const attended = attendance.filter(a => a.attended).length;
          db.execute(
            "UPDATE cwc_sessions SET status = 'COMPLETED', attended_count = ?, completed_at = ? WHERE id = ?",
            [attended, new Date().toISOString(), sessionId],
          );
          navigation.goBack();
        },
      },
    ]);
  };

  if (loading) {
    return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;
  }

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
        {session && (
          <View style={[styles.card, {backgroundColor: colors.surface}]}>
            <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{session.facility_name}</Text>
            <InfoRow label="Date" value={String(session.session_date ?? '—')} colors={colors} />
            <InfoRow label="Type" value={String(session.session_type ?? '—')} colors={colors} />
            <InfoRow label="Status" value={String(session.status ?? '—')} colors={colors} />
            <InfoRow label="Expected" value={String(session.expected_count ?? 0)} colors={colors} />
            <InfoRow label="Attended" value={String(session.attended_count ?? 0)} colors={colors} />
          </View>
        )}

        <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Attendance ({attendance.length})</Text>
        {attendance.length === 0 ? (
          <Text style={[styles.empty, {color: colors.textSecondary}]}>No children registered for this session</Text>
        ) : (
          attendance.map(a => (
            <View key={a.id} style={[styles.attCard, {backgroundColor: colors.surface}]}>
              <View style={styles.attRow}>
                <Text style={[styles.attName, {color: colors.textPrimary}]}>{a.child_name}</Text>
                <Switch value={a.attended === 1} onValueChange={(v) => toggleAttendance(a.id, v)} />
              </View>
              {a.doses_given !== '[]' && <Text style={[styles.attSub, {color: colors.textSecondary}]}>Doses: {a.doses_given}</Text>}
              {a.notes ? <Text style={[styles.attSub, {color: colors.textSecondary}]}>Notes: {a.notes}</Text> : null}
            </View>
          ))
        )}

        {session && session.status !== 'COMPLETED' && (
          <Pressable style={[styles.closeButton, {backgroundColor: colors.primary}]} onPress={handleClose}>
            <Text style={styles.closeButtonText}>Close Session</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({label, value, colors}: {label: string; value: string; colors: typeof lightColors}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>{label}</Text>
      <Text style={[styles.infoValue, {color: colors.textPrimary}]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  header: {paddingHorizontal: 16, paddingVertical: 12},
  back: {fontSize: 16},
  content: {padding: 16, gap: 12},
  card: {borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E2E8F0'},
  cardTitle: {fontSize: 18, fontWeight: '700', marginBottom: 10},
  infoRow: {paddingVertical: 4},
  infoLabel: {fontSize: 11, textTransform: 'uppercase', fontWeight: '600'},
  infoValue: {fontSize: 15, fontWeight: '500', marginTop: 2},
  sectionTitle: {fontSize: 16, fontWeight: '700', marginTop: 8},
  empty: {fontSize: 14, paddingVertical: 16},
  attCard: {borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#E2E8F0'},
  attRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  attName: {fontSize: 15, fontWeight: '600'},
  attSub: {fontSize: 12, marginTop: 4},
  closeButton: {padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8},
  closeButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
