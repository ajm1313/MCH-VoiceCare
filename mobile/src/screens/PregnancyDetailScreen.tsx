/**
 * Pregnancy detail screen — episode snapshot + assessment history.
 *
 * UX-003: restyled with the shared design system primitives and SVG icons.
 * Clinical behaviour, queries, navigation and accessibility are unchanged.
 */
import React, {useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {query} from '../core/db/database';
import {isSpeechCaptureEnabled} from '../core/auth/featureFlags';
import type {RootStackParamList} from '../core/navigation/types';
import {useTheme} from '../theme/useTheme';
import {space} from '../theme/tokens';
import {Screen} from '../components/ui/Screen';
import {Card} from '../components/ui/Card';
import {Button} from '../components/ui/Button';
import {AppText} from '../components/ui/Text';
import {UrgencyBadge} from '../components/ui/Badge';
import {SectionHeader, EmptyState, ListRow, KeyValue} from '../components/ui/Layout';

type Props = NativeStackScreenProps<RootStackParamList, 'PregnancyDetail'>;

interface AssessmentRow {
  id: string;
  minimum_class: string;
  recommended_text: string;
  triggered_rules: string;
  assessed_at: string;
}

export function PregnancyDetailScreen({route, navigation}: Props) {
  const {colors} = useTheme();
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
    <Screen scroll>
      <View style={styles.header}>
        <Button
          label="Back"
          variant="ghost"
          size="sm"
          icon="chevronLeft"
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        />
        <View style={styles.headerActions}>
          <Button
            label="Transfer"
            variant="secondary"
            size="sm"
            icon="share"
            onPress={() => navigation.navigate('PregnancyTransfer', {episodeId})}
            accessibilityLabel="Transfer episode"
          />
          <Button
            label="Close"
            variant="secondary"
            size="sm"
            icon="close"
            onPress={() => navigation.navigate('PregnancyClose', {episodeId})}
            accessibilityLabel="Close episode"
          />
          <Button
            label="Observe"
            variant="primary"
            size="sm"
            icon="plus"
            onPress={() => navigation.navigate('PregnancyObserve', {episodeId})}
            accessibilityLabel="Record observation"
          />
          {isSpeechCaptureEnabled() && (
            <Button
              label="Voice"
              variant="secondary"
              size="sm"
              icon="mic"
              onPress={() => navigation.navigate('VoiceRecord', {episodeId})}
              accessibilityLabel="Record voice"
            />
          )}
        </View>
      </View>

      {snapshot && (
        <Card style={styles.card}>
          <AppText variant="smallStrong" tone="secondary" style={styles.cardTitle}>
            Episode
          </AppText>
          <View style={styles.grid}>
            <KeyValue label="Woman" value={String(snapshot.woman_name ?? '—')} />
            <KeyValue label="Gravidity" value={String(snapshot.gravidity ?? '—')} />
            <KeyValue label="Parity" value={String(snapshot.parity ?? '—')} />
            <KeyValue label="LMP" value={String(snapshot.lmp_date ?? '—')} />
            <KeyValue label="Age" value={String(snapshot.maternal_age_years ?? '—')} />
            <KeyValue label="CHPS" value={String(snapshot.assigned_chps ?? '—')} />
          </View>
        </Card>
      )}

      {/* Continuity of Care */}
      <Card variant="outlined" style={styles.continuityCard}>
        <AppText variant="smallStrong" tone="brand" style={styles.continuityTitle}>
          Continuity of Care
        </AppText>
        {hasNewborn ? (
          <ListRow
            icon="baby"
            title="View Newborn Record"
            iconColor={colors.primary}
            onPress={() => navigation.navigate('NewbornList')}
          />
        ) : (
          <ListRow
            icon="baby"
            title="Register Newborn"
            iconColor={colors.primary}
            onPress={() => navigation.navigate('NewbornRegister')}
          />
        )}
      </Card>

      <SectionHeader title="Assessment History" style={styles.sectionHeader} />
      {assessments.length === 0 ? (
        <EmptyState
          icon="clipboard"
          title="No assessments yet"
          message="Record an observation to generate an assessment."
        />
      ) : (
        <View style={styles.assessmentList}>
          {assessments.map((a) => (
            <Card
              key={a.id}
              onPress={() => navigation.navigate('PregnancyAssessment', {assessmentId: a.id})}
              style={styles.assessmentCard}
              accessibilityLabel={`Assessment ${a.minimum_class} on ${a.assessed_at}`}>
              <View style={styles.assessmentHeader}>
                <UrgencyBadge value={a.minimum_class} size="sm" />
                <AppText variant="caption" tone="secondary">{a.assessed_at}</AppText>
              </View>
              <AppText variant="body" style={styles.actionText}>{a.recommended_text}</AppText>
              {a.triggered_rules !== '[]' && (
                <AppText variant="caption" tone="secondary" style={styles.rules}>
                  {a.triggered_rules}
                </AppText>
              )}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: space[2],
    marginBottom: space[3],
  },
  headerActions: {flexDirection: 'row', gap: space[2], alignItems: 'center', flexWrap: 'wrap'},
  card: {marginBottom: space[3]},
  cardTitle: {marginBottom: space[3]},
  grid: {flexDirection: 'row', flexWrap: 'wrap', gap: space[2]},
  continuityCard: {marginBottom: space[3]},
  continuityTitle: {marginBottom: space[2]},
  sectionHeader: {marginTop: space[2]},
  assessmentList: {gap: space[3]},
  assessmentCard: {gap: space[2]},
  assessmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space[2],
    flexWrap: 'wrap',
  },
  actionText: {marginTop: space[1]},
  rules: {fontFamily: 'monospace', marginTop: space[1]},
});
