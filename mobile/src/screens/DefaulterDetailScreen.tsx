/**
 * DefaulterDetailScreen — defaulter details with trace button.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {useTheme} from '../theme/useTheme';
import {query} from '../core/db/database';
import {
  Screen,
  Card,
  Button,
  Badge,
  KeyValue,
  EmptyState,
  LoadingState,
  AppText,
  type BadgeTone,
} from '../components/ui';
import {space} from '../theme/tokens';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DefaulterDetail'>;

export function DefaulterDetailScreen({route, navigation}: Props) {
  const {colors} = useTheme();
  const {defaulterId} = route.params;

  const [item, setItem] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const rows = query(
        `SELECT id, child_id, child_name, defaulter_status, days_overdue, last_visit_date, next_due_date, reason, trace_status, traced_at, trace_notes
         FROM defaulter_episodes WHERE id = ?`,
        [defaulterId],
      );
      if (rows.length > 0) setItem(rows[0] as any);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [defaulterId]);

  useEffect(() => { loadData(); }, [loadData]);

  const overdueTone = (days: number): BadgeTone => {
    return days > 60 ? 'danger' : 'warning';
  };

  const traceTone = (status: string): BadgeTone => {
    return status === 'COMPLETED' ? 'success' : 'neutral';
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading defaulter detail…" />
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

      {item ? (
        <>
          <Card style={styles.card}>
            <AppText variant="h2">{String(item.child_name)}</AppText>
            <View style={styles.badgeRow}>
              <Badge
                label={`${item.days_overdue}d overdue`}
                tone={overdueTone(Number(item.days_overdue))}
                size="sm"
                icon="alertTriangle"
                solid
              />
              <Badge
                label={String(item.trace_status || 'PENDING')}
                tone={traceTone(String(item.trace_status || 'PENDING'))}
                size="sm"
                icon={item.trace_status === 'COMPLETED' ? 'checkCircle' : 'clock'}
              />
            </View>
          </Card>

          <Card style={styles.card}>
            <KeyValue label="Last Visit" value={String(item.last_visit_date ?? '—')} />
            <KeyValue label="Next Due" value={String(item.next_due_date ?? '—')} />
            <KeyValue label="Reason" value={String(item.reason ?? '—')} />
            <KeyValue label="Traced At" value={String(item.traced_at ?? '—')} />
            <KeyValue label="Trace Notes" value={String(item.trace_notes ?? '—')} />
          </Card>

          {item.trace_status !== 'COMPLETED' && (
            <View style={styles.buttonRow}>
              <Button
                label="Trace Defaulter"
                variant="primary"
                size="lg"
                icon="search"
                fullWidth
                onPress={() => navigation.navigate('DefaulterTrace', {defaulterId})}
              />
            </View>
          )}
        </>
      ) : (
        <EmptyState
          icon="alertCircle"
          title="Defaulter not found"
          message="This defaulter record could not be found."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {paddingTop: space[2]},
  card: {marginVertical: space[2]},
  badgeRow: {flexDirection: 'row', gap: space[2], marginTop: space[3]},
  buttonRow: {marginVertical: space[3]},
});
