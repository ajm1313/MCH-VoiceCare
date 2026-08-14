/**
 * ReferralDetailScreen — referral detail with status update.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {query, getDb} from '../core/db/database';
import {
  REFERRAL_ACTIONS,
  isValidReferralTransition,
} from '../core/utils/urgencyMapping';
import type {RootStackParamList} from '../core/navigation/types';
import {
  AppText,
  Button,
  Card,
  EmptyState,
  KeyValue,
  LoadingState,
  Screen,
  UrgencyBadge,
  Badge,
} from '../components/ui';
import {space} from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'ReferralDetail'>;

export function ReferralDetailScreen({route, navigation}: Props) {
  const {referralId} = route.params;

  const [item, setItem] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const rows = query('SELECT * FROM referrals WHERE id = ?', [referralId]);
      if (rows.length > 0) setItem(rows[0] as any);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [referralId]);

  useEffect(() => { loadData(); }, [loadData]);

  const updateStatus = (status: string) => {
    if (item && !isValidReferralTransition(item.status as string, status)) {
      Alert.alert('Invalid Transition', `Cannot transition from ${item.status} to ${status}.`);
      return;
    }
    Alert.alert('Update Status', `Set referral status to ${status}?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Update',
        onPress: () => {
          const db = getDb();
          if (!db) return;
          const now = new Date().toISOString();
          const extraFields: Record<string, string> = {};
          if (status === 'ACCEPTED') extraFields.acknowledged_at = now;
          if (status === 'ARRIVED') extraFields.arrived_at = now;
          if (status === 'CLOSED') extraFields.closed_at = now;
          const setClauses = ['status = ?', 'updated_at = ?', ...Object.keys(extraFields).map(k => `${k} = ?`)];
          const params: (string | null)[] = [status, now, ...Object.values(extraFields), referralId];
          db.execute(
            `UPDATE referrals SET ${setClauses.join(', ')} WHERE id = ?`,
            params,
          );
          setItem(prev => prev ? {...prev, status, ...extraFields} : prev);
        },
      },
    ]);
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading referral…" />
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
        <>
          <Card style={styles.card}>
            <View style={styles.badgeRow}>
              <UrgencyBadge value={String(item.urgency)} size="md" />
              <Badge label={String(item.status)} tone="neutral" size="sm" />
            </View>
            <AppText variant="h2" style={styles.title}>{String(item.patient_name)}</AppText>
          </Card>

          <Card style={styles.card}>
            <KeyValue label="Reason" value={String(item.referral_reason ?? '—')} />
            <KeyValue label="From" value={String(item.referring_facility ?? '—')} />
            <KeyValue label="To" value={String(item.destination_facility ?? '—')} />
            <KeyValue label="Created" value={String(item.created_at ?? '—')} />
            <KeyValue label="Updated" value={String(item.updated_at ?? '—')} />
          </Card>

          {item && !['CLOSED', 'CANCELLED_BY_CLINICIAN', 'LOST_TO_FOLLOWUP', 'DECLINED'].includes(item.status as string) && (
            <View style={styles.statusActions}>
              {REFERRAL_ACTIONS
                .filter(a => isValidReferralTransition(item.status as string, a.status))
                .map(a => (
                  <Button
                    key={a.status}
                    label={a.label}
                    variant="secondary"
                    fullWidth
                    onPress={() => updateStatus(a.status)}
                  />
                ))}
            </View>
          )}

          <Button
            label="View QR Slip"
            variant="secondary"
            icon="qr"
            fullWidth
            onPress={() => navigation.navigate('ReferralQrSlip', {referralId: String(item.id)})}
            style={styles.qrBtn}
          />
        </>
      ) : (
        <EmptyState
          icon="fileText"
          title="Referral not found"
          message="This referral may have been deleted or synced from another device."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {marginBottom: space[2]},
  card: {marginBottom: space[3]},
  badgeRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[2], gap: space[2]},
  title: {marginTop: space[1]},
  statusActions: {gap: space[2], marginBottom: space[3]},
  qrBtn: {marginTop: space[2]},
});
