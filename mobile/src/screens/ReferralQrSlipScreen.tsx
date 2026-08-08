/**
 * ReferralQrSlipScreen — displays a QR code for a referral slip.
 *
 * The backend generates a QR token at GET /api/v1/referrals/{id}/qr/
 * which encodes referral details for scanning at the receiving facility.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors, urgency} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import {toOfflineUrgency} from '../core/utils/urgencyMapping';
import {AppConfig} from '../config/appConfig';
import {useAuthStore} from '../core/auth/authStore';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ReferralQrSlip'>;

export function ReferralQrSlipScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const {referralId} = route.params;

  const [item, setItem] = useState<Record<string, any> | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingQr, setFetchingQr] = useState(false);

  const loadData = useCallback(() => {
    try {
      const rows = query('SELECT * FROM referrals WHERE id = ?', [referralId]);
      if (rows.length > 0) {
        const r = rows[0] as any;
        setItem(r);
        setShortCode(r.short_code ?? null);
        setQrToken(r.qr_token ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [referralId]);

  useEffect(() => { loadData(); }, [loadData]);

  const fetchQrFromServer = async () => {
    setFetchingQr(true);
    try {
      const { token } = useAuthStore.getState();
      if (!token) return;
      const resp = await fetch(`${AppConfig.apiBaseUrl}/referrals/${referralId}/qr/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const data = await resp.json() as { qr_token: string; short_code: string };
      setQrToken(data.qr_token);
      setShortCode(data.short_code);
      const db = getDb();
      db.execute(
        'UPDATE referrals SET qr_token = ?, short_code = ? WHERE id = ?',
        [data.qr_token, data.short_code, referralId],
      );
    } catch {
      // Best-effort
    } finally {
      setFetchingQr(false);
    }
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
        <Text style={[styles.title, {color: colors.textPrimary}]}>Referral Slip</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {item && (
          <View style={[styles.card, {backgroundColor: colors.surface}]}>
            <View style={styles.slipHeader}>
              <Text style={[styles.slipTitle, {color: colors.textPrimary}]}>MCH VoiceCare</Text>
              <View style={[styles.badge, {backgroundColor: urgencyColor}]}>
                <Text style={styles.badgeText}>{toOfflineUrgency(item.urgency as string)}</Text>
              </View>
            </View>
            <Text style={[styles.patientName, {color: colors.textPrimary}]}>{String(item.patient_name)}</Text>
            <Text style={[styles.slipInfo, {color: colors.textSecondary}]}>Reason: {String(item.referral_reason ?? '—')}</Text>
            <Text style={[styles.slipInfo, {color: colors.textSecondary}]}>From: {String(item.referring_facility ?? '—')}</Text>
            <Text style={[styles.slipInfo, {color: colors.textSecondary}]}>To: {String(item.destination_facility ?? '—')}</Text>
            <Text style={[styles.slipInfo, {color: colors.textSecondary}]}>Status: {String(item.status)}</Text>

            {shortCode && (
              <View style={styles.shortCodeBox}>
                <Text style={[styles.shortCodeLabel, {color: colors.textSecondary}]}>Short Code</Text>
                <Text style={[styles.shortCode, {color: colors.textPrimary}]}>{shortCode}</Text>
              </View>
            )}

            {qrToken ? (
              <View style={styles.qrBox}>
                <Text style={[styles.qrLabel, {color: colors.textSecondary}]}>QR Token</Text>
                <Text style={[styles.qrValue, {color: colors.textPrimary}]}>{qrToken}</Text>
              </View>
            ) : (
              <Pressable style={[styles.fetchBtn, {backgroundColor: colors.primary}]} onPress={fetchQrFromServer} disabled={fetchingQr}>
                {fetchingQr ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.fetchBtnText}>Generate QR Code</Text>
                )}
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12},
  back: {fontSize: 16},
  title: {fontSize: 18, fontWeight: '700'},
  content: {padding: 16, gap: 12},
  card: {borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#E2E8F0', gap: 8},
  slipHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8},
  slipTitle: {fontSize: 18, fontWeight: '700'},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  badgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},
  patientName: {fontSize: 20, fontWeight: '700', marginBottom: 8},
  slipInfo: {fontSize: 14, paddingVertical: 2},
  shortCodeBox: {marginTop: 16, alignItems: 'center', padding: 12, borderWidth: 2, borderColor: '#E2E8F0', borderRadius: 12, borderStyle: 'dashed'},
  shortCodeLabel: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase'},
  shortCode: {fontSize: 24, fontWeight: '800', letterSpacing: 2, marginTop: 4},
  qrBox: {marginTop: 16, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12},
  qrLabel: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase'},
  qrValue: {fontSize: 12, fontFamily: 'monospace', marginTop: 4},
  fetchBtn: {padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 16},
  fetchBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
