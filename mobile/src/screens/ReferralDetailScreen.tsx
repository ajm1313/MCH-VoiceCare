/**
 * ReferralDetailScreen — referral detail with status update.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors, urgency} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import {
  REFERRAL_ACTIONS,
  isValidReferralTransition,
  toOfflineUrgency,
  type ReferralStatus,
} from '../core/utils/urgencyMapping';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ReferralDetail'>;

export function ReferralDetailScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
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
    return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;
  }

  const urgencyColor = item ? urgency[toOfflineUrgency(item.urgency as string) as keyof typeof urgency] || urgency.GREY : urgency.GREY;

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
        {item ? (
          <>
            <View style={[styles.card, {backgroundColor: colors.surface}]}>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, {backgroundColor: urgencyColor}]}>
                  <Text style={styles.badgeText}>{String(item.urgency)}</Text>
                </View>
                <Text style={[styles.status, {color: colors.textSecondary}]}>{String(item.status)}</Text>
              </View>
              <Text style={[styles.title, {color: colors.textPrimary}]}>{String(item.patient_name)}</Text>
            </View>
            <View style={[styles.card, {backgroundColor: colors.surface}]}>
              <InfoRow label="Reason" value={String(item.referral_reason ?? '—')} colors={colors} />
              <InfoRow label="From" value={String(item.referring_facility ?? '—')} colors={colors} />
              <InfoRow label="To" value={String(item.destination_facility ?? '—')} colors={colors} />
              <InfoRow label="Created" value={String(item.created_at ?? '—')} colors={colors} />
              <InfoRow label="Updated" value={String(item.updated_at ?? '—')} colors={colors} />
            </View>
            {item && !['CLOSED', 'CANCELLED_BY_CLINICIAN', 'LOST_TO_FOLLOWUP', 'DECLINED'].includes(item.status as string) && (
              <View style={styles.statusActions}>
                {REFERRAL_ACTIONS
                  .filter(a => isValidReferralTransition(item.status as string, a.status))
                  .map(a => (
                    <Pressable key={a.status} style={[styles.statusBtn, {borderColor: colors.border}]} onPress={() => updateStatus(a.status)}>
                      <Text style={[styles.statusBtnText, {color: colors.textPrimary}]}>{a.label}</Text>
                    </Pressable>
                  ))}
              </View>
            )}
            <Pressable style={[styles.qrBtn, {borderColor: colors.primary}]} onPress={() => navigation.navigate('ReferralQrSlip', {referralId: String(item.id)})}>
              <Text style={[styles.qrBtnText, {color: colors.primary}]}>View QR Slip</Text>
            </Pressable>
          </>
        ) : (
          <Text style={[styles.empty, {color: colors.textSecondary}]}>Referral not found</Text>
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
  badgeRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  badgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},
  status: {fontSize: 11, fontWeight: '600'},
  title: {fontSize: 18, fontWeight: '700'},
  infoRow: {paddingVertical: 6},
  infoLabel: {fontSize: 11, textTransform: 'uppercase', fontWeight: '600'},
  infoValue: {fontSize: 15, fontWeight: '500', marginTop: 2},
  statusActions: {gap: 8},
  statusBtn: {padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center'},
  statusBtnText: {fontWeight: '600', fontSize: 14},
  qrBtn: {padding: 12, borderRadius: 10, borderWidth: 1.5, alignItems: 'center', marginTop: 4},
  qrBtnText: {fontWeight: '700', fontSize: 14},
  empty: {fontSize: 14, textAlign: 'center', paddingVertical: 32},
});
