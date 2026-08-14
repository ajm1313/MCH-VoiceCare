/**
 * PersonDetailScreen — person detail view.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackScreenProps, NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../core/navigation/types';

import {query} from '../core/db/database';
import {logLocalAudit} from '../core/utils/audit';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  KeyValue,
  LoadingState,
  Screen,
} from '../components/ui';
import {space} from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonDetail'>;

export function PersonDetailScreen({route}: Props) {
  const navigation = useNavigation();
  const {personId} = route.params;

  const [item, setItem] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const rows = query('SELECT * FROM persons WHERE id = ?', [personId]);
      if (rows.length > 0) setItem(rows[0] as any);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [personId]);

  useEffect(() => {
    loadData();
    logLocalAudit({
      action: 'PATIENT_VIEW',
      entityType: 'person',
      entityId: personId,
      patientId: personId,
    });
  }, [loadData, personId]);

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading person…" />
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
      {item ? (
        <Card style={styles.card}>
          <AppText variant="h2" style={styles.title}>{String(item.full_name)}</AppText>
          <KeyValue label="Date of Birth" value={String(item.date_of_birth ?? '—')} />
          <KeyValue label="Gender" value={String(item.gender ?? '—')} />
          <KeyValue label="Phone" value={String(item.phone ?? '—')} />
          <KeyValue label="Sync Status" value={String(item.sync_status ?? '—')} />
        </Card>
      ) : (
        <EmptyState
          icon="user"
          title="Person not found"
          message="This person may have been deleted or synced from another device."
        />
      )}
      {item && (
        <Button
          label="Scan Document"
          variant="primary"
          icon="scan"
          onPress={() => (navigation as any).navigate('Scan', {patientId: personId})}
          style={styles.scanBtn}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {marginBottom: space[2]},
  card: {marginBottom: space[3]},
  title: {marginBottom: space[3]},
  scanBtn: {marginTop: space[3]},
});
