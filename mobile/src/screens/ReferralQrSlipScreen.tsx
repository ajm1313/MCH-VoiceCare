/**
 * ReferralQrSlipScreen — displays a QR code for a referral slip (spec §18.5).
 *
 * The QR code is generated ON-DEVICE from the referral data so it works
 * offline. The QR payload is an opaque lookup token (referral ID + short
 * code), NOT clinical details (spec §18.5: "Do not place unnecessary
 * clinical details in the QR payload").
 *
 * If the backend has issued a signed QR token (via GET /referrals/{id}/qr/),
 * that token is preferred. Otherwise, a local fallback token is generated
 * from the referral ID and short code.
 *
 * Features:
 * - QR code display (offline-first with online signed token fallback)
 * - Pre-referral care instructions
 * - Referring facility and clinician info
 * - Destination facility name and contact
 * - Print button (uses Share API as fallback if React Native Print not available)
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors, urgency} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import {toOfflineUrgency} from '../core/utils/urgencyMapping';
import {AppConfig} from '../config/appConfig';
import {useAuthStore} from '../core/auth/authStore';
import {logLocalAudit} from '../core/utils/audit';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ReferralQrSlip'>;

/**
 * Generate a short human-readable code from the referral ID.
 * Format: first 6 chars of the referral ID, uppercased.
 */
function generateShortCode(referralId: string): string {
  const clean = referralId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return clean.slice(0, 6) || 'REF000';
}

/**
 * Build an opaque QR payload that encodes only the referral ID and short code.
 * This avoids placing clinical details in the QR (spec §18.5).
 */
function buildOfflineQrPayload(referralId: string, shortCode: string): string {
  return JSON.stringify({
    type: 'MCH_REFERRAL',
    rid: referralId,
    sc: shortCode,
    v: 1,
  });
}

/**
 * Attempt to print or share the referral slip.
 * Uses React Native Print if available, otherwise falls back to the Share API.
 */
async function printOrShareSlip(
  referralId: string,
  shortCode: string,
  patientName: string,
  destination: string,
): Promise<void> {
  const slipText = [
    'MCH VoiceCare — Referral Slip',
    `Short Code: ${shortCode}`,
    `Patient: ${patientName || '—'}`,
    `Destination: ${destination || '—'}`,
    `Referral ID: ${referralId}`,
  ].join('\n');

  // Try React Native Print (optional dependency)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Print = require('react-native-print');
    if (Print && Print.print) {
      await Print.print({html: slipText});
      return;
    }
  } catch {
    // react-native-print not installed — fall through to Share
  }

  // Fallback: use the Share API
  try {
    await Share.share({
      message: slipText,
      title: 'MCH VoiceCare Referral Slip',
    });
  } catch {
    // Share cancelled or unavailable — silently ignore
  }
}

export function ReferralQrSlipScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const {referralId} = route.params;

  const [item, setItem] = useState<Record<string, any> | null>(null);
  const [qrToken, setQrToken] = useState<string | null>(null);
  const [shortCode, setShortCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchingQr, setFetchingQr] = useState(false);
  const [printing, setPrinting] = useState(false);

  const loadData = useCallback(() => {
    try {
      const rows = query('SELECT * FROM referrals WHERE id = ?', [referralId]);
      if (rows.length > 0) {
        const r = rows[0] as any;
        setItem(r);
        // Use stored short code/QR token if available, otherwise generate locally
        const sc = r.short_code ?? generateShortCode(referralId);
        setShortCode(sc);
        setQrToken(r.qr_token ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, [referralId]);

  useEffect(() => {
    loadData();
    logLocalAudit({
      action: 'PATIENT_VIEW',
      entityType: 'referral_slip',
      entityId: referralId,
      referralEpisodeId: referralId,
    });
  }, [loadData, referralId]);

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
      // Best-effort — offline QR is already available as fallback
    } finally {
      setFetchingQr(false);
    }
  };

  const handlePrint = async () => {
    setPrinting(true);
    try {
      await printOrShareSlip(
        referralId,
        shortCode ?? '',
        String(item?.patient_name ?? ''),
        String(item?.destination_facility ?? ''),
      );
    } finally {
      setPrinting(false);
    }
  };

  if (loading) {
    return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;
  }

  const urgencyColor = item ? urgency[toOfflineUrgency(item.urgency as string) as keyof typeof urgency] || urgency.GREY : urgency.GREY;

  // The QR payload: prefer signed server token, fall back to offline-generated opaque payload
  const qrPayload = qrToken ?? (shortCode ? buildOfflineQrPayload(referralId, shortCode) : null);

  // Pre-referral care instructions
  const preReferralCare = String(item?.pre_referral_care ?? '');
  // Referring clinician info
  const referringClinician = String(item?.created_by ?? item?.referring_clinician ?? '—');
  // Destination facility contact
  const destContact = String(item?.destination_facility_contact ?? '');

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

            {/* Referring facility and clinician info */}
            <View style={styles.sectionDivider} />
            <Text style={[styles.sectionLabel, {color: colors.textSecondary}]}>Referring Facility</Text>
            <Text style={[styles.slipInfo, {color: colors.textPrimary}]}>{String(item.referring_facility ?? '—')}</Text>
            <Text style={[styles.slipInfo, {color: colors.textSecondary}]}>Clinician: {referringClinician}</Text>

            {/* Destination facility name and contact */}
            <View style={styles.sectionDivider} />
            <Text style={[styles.sectionLabel, {color: colors.textSecondary}]}>Destination Facility</Text>
            <Text style={[styles.slipInfo, {color: colors.textPrimary}]}>{String(item.destination_facility ?? '—')}</Text>
            {destContact && destContact !== '—' && (
              <Pressable onPress={() => Linking.openURL(`tel:${destContact}`)}>
                <Text style={[styles.contactLink, {color: colors.primary}]}>Call: {destContact}</Text>
              </Pressable>
            )}

            {/* Pre-referral care instructions */}
            {preReferralCare ? (
              <>
                <View style={styles.sectionDivider} />
                <Text style={[styles.sectionLabel, {color: colors.textSecondary}]}>Pre-referral Care Instructions</Text>
                <Text style={[styles.preReferralCare, {color: colors.textPrimary}]}>{preReferralCare}</Text>
              </>
            ) : null}

            <View style={styles.sectionDivider} />
            <Text style={[styles.slipInfo, {color: colors.textSecondary}]}>Status: {String(item.status)}</Text>

            {shortCode && (
              <View style={styles.shortCodeBox}>
                <Text style={[styles.shortCodeLabel, {color: colors.textSecondary}]}>Short Code</Text>
                <Text style={[styles.shortCode, {color: colors.textPrimary}]}>{shortCode}</Text>
              </View>
            )}

            {qrPayload && (
              <View style={styles.qrBox}>
                <Text style={[styles.qrLabel, {color: colors.textSecondary}]}>QR Code</Text>
                <View style={styles.qrImageContainer}>
                  <QRCode
                    value={qrPayload}
                    size={200}
                    color={colors.textPrimary}
                    backgroundColor={colors.surface}
                    logoSize={0}
                  />
                </View>
                {!qrToken && (
                  <Text style={[styles.qrHint, {color: colors.textSecondary}]}>
                    Offline QR — scan at receiving facility to look up referral
                  </Text>
                )}
              </View>
            )}

            {/* Allow fetching a signed server token when online */}
            {!qrToken && (
              <Pressable style={[styles.fetchBtn, {backgroundColor: colors.primary}]} onPress={fetchQrFromServer} disabled={fetchingQr}>
                {fetchingQr ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.fetchBtnText}>Get Signed QR (Online)</Text>
                )}
              </Pressable>
            )}

            {/* Print / Share button */}
            <Pressable
              style={[styles.printBtn, {borderColor: colors.primary}]}
              onPress={handlePrint}
              disabled={printing}>
              {printing ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={[styles.printBtnText, {color: colors.primary}]}>
                  {Platform.OS === 'ios' ? 'Print / Share Slip' : 'Share Slip'}
                </Text>
              )}
            </Pressable>
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
  sectionDivider: {height: 1, backgroundColor: '#E2E8F0', marginVertical: 8},
  sectionLabel: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 2},
  preReferralCare: {fontSize: 14, paddingVertical: 2, lineHeight: 20},
  contactLink: {fontSize: 14, paddingVertical: 2, fontWeight: '600'},
  shortCodeBox: {marginTop: 16, alignItems: 'center', padding: 12, borderWidth: 2, borderColor: '#E2E8F0', borderRadius: 12, borderStyle: 'dashed'},
  shortCodeLabel: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase'},
  shortCode: {fontSize: 24, fontWeight: '800', letterSpacing: 2, marginTop: 4},
  qrBox: {marginTop: 16, padding: 12, backgroundColor: '#F8FAFC', borderRadius: 12, alignItems: 'center'},
  qrLabel: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginBottom: 8},
  qrImageContainer: {padding: 8, backgroundColor: '#FFFFFF', borderRadius: 8},
  qrHint: {fontSize: 11, marginTop: 8, textAlign: 'center'},
  fetchBtn: {padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 16},
  fetchBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},
  printBtn: {padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 12, borderWidth: 2},
  printBtnText: {fontWeight: '700', fontSize: 15},
});
