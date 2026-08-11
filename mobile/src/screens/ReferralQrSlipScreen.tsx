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
import {Linking, Platform, Share, StyleSheet, View} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {query, getDb} from '../core/db/database';
import {AppConfig} from '../config/appConfig';
import {useAuthStore} from '../core/auth/authStore';
import {logLocalAudit} from '../core/utils/audit';
import {apiFetch} from '../core/security/secureFetch';
import type {RootStackParamList} from '../core/navigation/types';
import {
  AppText,
  Button,
  Card,
  Divider,
  KeyValue,
  LoadingState,
  Screen,
  UrgencyBadge,
} from '../components/ui';
import {useTheme} from '../theme/useTheme';
import {border, radius, space} from '../theme/tokens';

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
  const {colors} = useTheme();
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
      const resp = await apiFetch(`${AppConfig.apiBaseUrl}/referrals/${referralId}/qr/`, {
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
    return (
      <Screen>
        <LoadingState message="Loading referral slip…" />
      </Screen>
    );
  }

  // The QR payload: prefer signed server token, fall back to offline-generated opaque payload
  const qrPayload = qrToken ?? (shortCode ? buildOfflineQrPayload(referralId, shortCode) : null);

  // Pre-referral care instructions
  const preReferralCare = String(item?.pre_referral_care ?? '');
  // Referring clinician info
  const referringClinician = String(item?.created_by ?? item?.referring_clinician ?? '—');
  // Destination facility contact
  const destContact = String(item?.destination_facility_contact ?? '');

  return (
    <Screen scroll>
      <View style={styles.backRow}>
        <Button
          label="Back"
          variant="ghost"
          icon="chevronLeft"
          onPress={() => navigation.goBack()}
        />
        <AppText variant="h2">Referral Slip</AppText>
      </View>
      {item && (
        <Card style={styles.card}>
          <View style={styles.slipHeader}>
            <AppText variant="h3">MCH VoiceCare</AppText>
            <UrgencyBadge value={String(item.urgency)} size="md" solid />
          </View>
          <AppText variant="h2" style={styles.patientName}>{String(item.patient_name)}</AppText>
          <AppText variant="body" tone="secondary">Reason: {String(item.referral_reason ?? '—')}</AppText>

          {/* Referring facility and clinician info */}
          <Divider style={styles.divider} />
          <AppText variant="overline" tone="tertiary" uppercase>Referring Facility</AppText>
          <KeyValue label="Facility" value={String(item.referring_facility ?? '—')} />
          <KeyValue label="Clinician" value={referringClinician} />

          {/* Destination facility name and contact */}
          <Divider style={styles.divider} />
          <AppText variant="overline" tone="tertiary" uppercase>Destination Facility</AppText>
          <KeyValue label="Facility" value={String(item.destination_facility ?? '—')} />
          {destContact && destContact !== '—' && (
            <Button
              label={`Call: ${destContact}`}
              variant="ghost"
              icon="phone"
              size="sm"
              onPress={() => Linking.openURL(`tel:${destContact}`)}
            />
          )}

          {/* Pre-referral care instructions */}
          {preReferralCare ? (
            <>
              <Divider style={styles.divider} />
              <AppText variant="overline" tone="tertiary" uppercase>Pre-referral Care Instructions</AppText>
              <AppText variant="body" style={styles.preReferralCare}>{preReferralCare}</AppText>
            </>
          ) : null}

          <Divider style={styles.divider} />
          <KeyValue label="Status" value={String(item.status)} />

          {shortCode && (
            <View style={[styles.shortCodeBox, {borderColor: colors.border}]}>
              <AppText variant="overline" tone="tertiary" uppercase>Short Code</AppText>
              <AppText variant="metric" style={styles.shortCode}>{shortCode}</AppText>
            </View>
          )}

          {qrPayload && (
            <View style={[styles.qrBox, {backgroundColor: colors.surfaceSunken}]}>
              <AppText variant="overline" tone="tertiary" uppercase style={styles.qrLabel}>QR Code</AppText>
              <View style={[styles.qrImageContainer, {backgroundColor: colors.surface}]}>
                <QRCode
                  value={qrPayload}
                  size={200}
                  color={colors.textPrimary}
                  backgroundColor={colors.surface}
                  logoSize={0}
                />
              </View>
              {!qrToken && (
                <AppText variant="caption" tone="secondary" center style={styles.qrHint}>
                  Offline QR — scan at receiving facility to look up referral
                </AppText>
              )}
            </View>
          )}

          {/* Allow fetching a signed server token when online */}
          {!qrToken && (
            <Button
              label="Get Signed QR (Online)"
              icon="cloud"
              fullWidth
              loading={fetchingQr}
              onPress={fetchQrFromServer}
              style={styles.fetchBtn}
            />
          )}

          {/* Print / Share button */}
          <Button
            label={Platform.OS === 'ios' ? 'Print / Share Slip' : 'Share Slip'}
            variant="secondary"
            icon="print"
            fullWidth
            loading={printing}
            onPress={handlePrint}
            style={styles.printBtn}
          />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[3]},
  card: {marginBottom: space[3]},
  slipHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[2], gap: space[2]},
  patientName: {marginBottom: space[2]},
  divider: {marginVertical: space[3]},
  preReferralCare: {paddingVertical: space[1]},
  shortCodeBox: {
    marginTop: space[4],
    alignItems: 'center',
    padding: space[3],
    borderWidth: border.heavy,
    borderRadius: radius.lg,
    borderStyle: 'dashed',
  },
  shortCode: {letterSpacing: 2, marginTop: space[1]},
  qrBox: {marginTop: space[4], padding: space[3], borderRadius: radius.lg, alignItems: 'center'},
  qrLabel: {marginBottom: space[2]},
  qrImageContainer: {padding: space[2], borderRadius: radius.sm},
  qrHint: {marginTop: space[2]},
  fetchBtn: {marginTop: space[4]},
  printBtn: {marginTop: space[3]},
});
