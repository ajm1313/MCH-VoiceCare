/**
 * Pregnancy detail screen — episode snapshot + assessment history.
 */
import React, {useEffect, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {query} from '../core/db/database';
import {isSpeechCaptureEnabled} from '../core/auth/featureFlags';
import {brand, urgency, lightColors} from '../theme/colors';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PregnancyDetail'>;

interface AssessmentRow {
  id: string;
  minimum_class: string;
  recommended_text: string;
  triggered_rules: string;
  assessed_at: string;
}

export function PregnancyDetailScreen({route, navigation}: Props) {
  const {episodeId} = route.params;
  const [snapshot, setSnapshot] = useState<Record<string, unknown> | null>(null);
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [hasNewborn, setHasNewborn] = useState(false);

  useEffect(() => {
    const epRows = query('SELECT snapshot FROM episodes WHERE id = ?', [episodeId]);
    if (epRows.length > 0) {
      setSnapshot(JSON.parse(epRows[0].snapshot as string));
    }
    const aRows = query(
      'SELECT id, minimum_class, recommended_text, triggered_rules, assessed_at FROM assessments WHERE episode_id = ? ORDER BY assessed_at DESC LIMIT 20',
      [episodeId],
    );
    setAssessments(aRows as unknown as AssessmentRow[]);

    // Check if any newborn episodes are linked to this pregnancy
    try {
      const newbornRows = query(
        `SELECT snapshot FROM episodes WHERE module = 'NEONATE' AND status = 'ACTIVE' LIMIT 50`,
      );
      for (const row of newbornRows) {
        try {
          const snap = JSON.parse(row.snapshot as string);
          if (String(snap.pregnancy ?? '') === episodeId) {
            setHasNewborn(true);
            break;
          }
        } catch { /* */ }
      }
    } catch { /* table may not exist */ }
  }, [episodeId]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('PregnancyTransfer', {episodeId})}>
            <Text style={styles.secondaryButtonText}>Transfer</Text>
          </Pressable>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('PregnancyClose', {episodeId})}>
            <Text style={styles.secondaryButtonText}>Close</Text>
          </Pressable>
          <Pressable
            style={styles.observeButton}
            onPress={() => navigation.navigate('PregnancyObserve', {episodeId})}>
            <Text style={styles.observeButtonText}>+ Observe</Text>
          </Pressable>
          {isSpeechCaptureEnabled() && (
            <Pressable
              style={styles.secondaryButton}
              onPress={() => navigation.navigate('VoiceRecord', {episodeId})}>
              <Text style={styles.secondaryButtonText}>🎙 Voice</Text>
            </Pressable>
          )}
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {snapshot && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Episode</Text>
            <View style={styles.grid}>
              <InfoRow label="Woman" value={String(snapshot.woman_name ?? '—')} />
              <InfoRow label="Gravidity" value={String(snapshot.gravidity ?? '—')} />
              <InfoRow label="Parity" value={String(snapshot.parity ?? '—')} />
              <InfoRow label="LMP" value={String(snapshot.lmp_date ?? '—')} />
              <InfoRow label="Age" value={String(snapshot.maternal_age_years ?? '—')} />
              <InfoRow label="CHPS" value={String(snapshot.assigned_chps ?? '—')} />
            </View>
          </View>
        )}

        {/* Continuity of Care */}
        <View style={styles.continuityCard}>
          <Text style={styles.continuityTitle}>Continuity of Care</Text>
          {hasNewborn ? (
            <Pressable
              style={styles.continuityLink}
              onPress={() => navigation.navigate('NewbornList')}>
              <Text style={styles.continuityLinkIcon}>👶</Text>
              <Text style={styles.continuityLinkText}>View Newborn Record</Text>
              <Text style={styles.continuityArrow}>›</Text>
            </Pressable>
          ) : (
            <Pressable
              style={styles.continuityLink}
              onPress={() => navigation.navigate('NewbornRegister')}>
              <Text style={styles.continuityLinkIcon}>👶</Text>
              <Text style={styles.continuityLinkText}>Register Newborn</Text>
              <Text style={styles.continuityArrow}>›</Text>
            </Pressable>
          )}
        </View>

        <Text style={styles.sectionTitle}>Assessment History</Text>
        {assessments.length === 0 ? (
          <Text style={styles.empty}>No assessments yet</Text>
        ) : (
          assessments.map((a) => {
            const color = urgency[a.minimum_class as keyof typeof urgency] || lightColors.textSecondary;
            return (
              <Pressable
                key={a.id}
                style={styles.assessmentCard}
                onPress={() => navigation.navigate('PregnancyAssessment', {assessmentId: a.id})}>
                <View style={styles.assessmentHeader}>
                  <View style={[styles.urgencyBadge, {borderColor: color}]}>
                    <Text style={[styles.urgencyText, {color}]}>{a.minimum_class}</Text>
                  </View>
                  <Text style={styles.assessedAt}>{a.assessed_at}</Text>
                </View>
                <Text style={styles.actionText}>{a.recommended_text}</Text>
                {a.triggered_rules !== '[]' && (
                  <Text style={styles.rules}>{a.triggered_rules}</Text>
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({label, value}: {label: string; value: string}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: lightColors.background},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: {fontSize: 16, color: brand.teal},
  headerActions: {flexDirection: 'row', gap: 8, alignItems: 'center'},
  secondaryButton: {
    borderWidth: 1,
    borderColor: brand.teal,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  secondaryButtonText: {color: brand.teal, fontSize: 13, fontWeight: '600'},
  observeButton: {
    backgroundColor: brand.teal,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  observeButtonText: {color: '#fff', fontSize: 14, fontWeight: '600'},
  content: {padding: 16, gap: 12},
  card: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
  },
  cardTitle: {fontSize: 14, fontWeight: '700', color: lightColors.textPrimary, marginBottom: 10},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: 8},
  infoRow: {width: '48%'},
  infoLabel: {fontSize: 11, color: lightColors.textSecondary, textTransform: 'uppercase'},
  infoValue: {fontSize: 15, color: lightColors.textPrimary, fontWeight: '500', marginTop: 2},
  sectionTitle: {fontSize: 16, fontWeight: '700', color: lightColors.textPrimary, marginTop: 8},
  empty: {fontSize: 14, color: lightColors.textSecondary, paddingVertical: 16},
  assessmentCard: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 10,
    padding: 14,
  },
  assessmentHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  urgencyBadge: {borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2},
  urgencyText: {fontSize: 11, fontWeight: '700'},
  assessedAt: {fontSize: 11, color: lightColors.textSecondary},
  actionText: {fontSize: 14, color: lightColors.textPrimary, marginTop: 8},
  rules: {fontSize: 11, color: lightColors.textSecondary, marginTop: 4, fontFamily: 'monospace'},
  continuityCard: {
    backgroundColor: brand.teal + '08',
    borderWidth: 1,
    borderColor: brand.teal + '30',
    borderRadius: 12,
    padding: 14,
  },
  continuityTitle: {fontSize: 13, fontWeight: '700', color: brand.navy, marginBottom: 8},
  continuityLink: {flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8},
  continuityLinkIcon: {fontSize: 18},
  continuityLinkText: {flex: 1, fontSize: 14, fontWeight: '600', color: brand.teal},
  continuityArrow: {fontSize: 20, color: brand.teal},
});
