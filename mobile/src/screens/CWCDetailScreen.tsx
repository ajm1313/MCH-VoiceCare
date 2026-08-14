/**
 * CWCDetailScreen — CWC session detail with attendance list and close action.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {Alert, StyleSheet, Switch, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {useTheme} from '../theme/useTheme';
import {query, getDb} from '../core/db/database';
import {
  Screen,
  Card,
  Button,
  Badge,
  SectionHeader,
  KeyValue,
  EmptyState,
  LoadingState,
  AppText,
  type BadgeTone,
} from '../components/ui';
import {space} from '../theme/tokens';
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
  const {colors} = useTheme();
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
    if (!db) return;
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
          if (!db) return;
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

  const statusTone = (status: string): BadgeTone => {
    if (status === 'COMPLETED') return 'neutral';
    if (status === 'IN_PROGRESS') return 'warning';
    return 'success';
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading session detail…" />
      </Screen>
    );
  }

  return (
    <Screen scroll
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); loadData(); }}>
      <View style={styles.backRow}>
        <Button
          label="Back"
          variant="ghost"
          size="sm"
          icon="chevronLeft"
          onPress={() => navigation.goBack()}
        />
      </View>

      {session && (
        <Card style={styles.card}>
          <View style={styles.cardHeader}>
            <AppText variant="h3" style={styles.flex}>{String(session.facility_name)}</AppText>
            <Badge
              label={String(session.status ?? '—')}
              tone={statusTone(String(session.status ?? ''))}
              size="sm"
            />
          </View>
          <View style={styles.kvContainer}>
            <KeyValue label="Date" value={String(session.session_date ?? '—')} />
            <KeyValue label="Type" value={String(session.session_type ?? '—')} />
            <KeyValue label="Expected" value={String(session.expected_count ?? 0)} />
            <KeyValue label="Attended" value={String(session.attended_count ?? 0)} />
          </View>
        </Card>
      )}

      <SectionHeader title={`Attendance (${attendance.length})`} style={styles.sectionHeader} />
      {attendance.length === 0 ? (
        <EmptyState
          icon="users"
          title="No children registered"
          message="No children registered for this session."
        />
      ) : (
        attendance.map(a => (
          <Card key={a.id} style={styles.attCard}>
            <View style={styles.attRow}>
              <AppText variant="bodyStrong" style={styles.flex}>{a.child_name}</AppText>
              <Switch
                value={a.attended === 1}
                onValueChange={(v) => toggleAttendance(a.id, v)}
                trackColor={{false: colors.border, true: colors.primary}}
              />
            </View>
            {a.doses_given !== '[]' && (
              <AppText variant="small" tone="secondary" style={styles.attSub}>
                Doses: {a.doses_given}
              </AppText>
            )}
            {a.notes ? (
              <AppText variant="small" tone="secondary" style={styles.attSub}>
                Notes: {a.notes}
              </AppText>
            ) : null}
          </Card>
        ))
      )}

      {session && session.status !== 'COMPLETED' && (
        <View style={styles.buttonRow}>
          <Button
            label="Close Session"
            variant="primary"
            size="lg"
            icon="check"
            fullWidth
            onPress={handleClose}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {paddingTop: space[2]},
  card: {marginVertical: space[2]},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2], marginBottom: space[2]},
  flex: {flex: 1},
  kvContainer: {gap: 0},
  sectionHeader: {marginTop: space[3], marginBottom: space[2]},
  attCard: {marginVertical: space[2]},
  attRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  attSub: {marginTop: space[1]},
  buttonRow: {marginVertical: space[3]},
});
