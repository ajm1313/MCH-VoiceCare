/**
 * PregnancyAssessmentScreen — view a single pregnancy assessment detail.
 *
 * UX-003: restyled with the shared design system primitives and SVG icons.
 * Clinical behaviour, queries, navigation and accessibility are unchanged.
 */
import React, {useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {query} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';
import {space} from '../theme/tokens';
import {Screen} from '../components/ui/Screen';
import {Card} from '../components/ui/Card';
import {Button} from '../components/ui/Button';
import {AppText} from '../components/ui/Text';
import {UrgencyBadge} from '../components/ui/Badge';
import {KeyValue, EmptyState} from '../components/ui/Layout';

type Props = NativeStackScreenProps<RootStackParamList, 'PregnancyAssessment'>;

export function PregnancyAssessmentScreen({route, navigation}: Props) {
  const {assessmentId} = route.params;
  const [assessment, setAssessment] = useState<Record<string, any> | null>(null);

  useEffect(() => {
    const rows = query(
      'SELECT id, episode_id, module, minimum_class, triggered_rules, recommended_text, assessed_at, rule_set_version FROM assessments WHERE id = ?',
      [assessmentId],
    );
    if (rows.length > 0) {
      setAssessment(rows[0] as any);
    }
  }, [assessmentId]);

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
      </View>

      {assessment ? (
        <View style={styles.content}>
          <Card style={styles.card}>
            <View style={styles.urgencyRow}>
              <UrgencyBadge value={assessment.minimum_class} size="md" />
              <AppText variant="caption" tone="secondary">{assessment.assessed_at}</AppText>
            </View>
            <AppText variant="overline" tone="tertiary" uppercase style={styles.sectionLabel}>
              Recommended Action
            </AppText>
            <AppText variant="bodyLg">{assessment.recommended_text}</AppText>
          </Card>

          <Card style={styles.card}>
            <AppText variant="smallStrong" tone="secondary" style={styles.cardTitle}>
              Details
            </AppText>
            <KeyValue label="Module" value={String(assessment.module ?? '—')} />
            <KeyValue label="Rule Set Version" value={String(assessment.rule_set_version ?? '—')} />
            <KeyValue label="Episode ID" value={String(assessment.episode_id ?? '—')} />
          </Card>

          {assessment.triggered_rules && assessment.triggered_rules !== '[]' && (
            <Card style={styles.card}>
              <AppText variant="smallStrong" tone="secondary" style={styles.cardTitle}>
                Triggered Rules
              </AppText>
              <AppText variant="caption" tone="secondary" style={styles.rules}>
                {assessment.triggered_rules}
              </AppText>
            </Card>
          )}
        </View>
      ) : (
        <EmptyState
          icon="clipboard"
          title="Assessment not found"
          message="The requested assessment could not be located."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {marginBottom: space[2]},
  content: {gap: space[3]},
  card: {gap: space[2]},
  cardTitle: {marginBottom: space[2]},
  urgencyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space[3],
    gap: space[2],
    flexWrap: 'wrap',
  },
  sectionLabel: {marginBottom: space[1]},
  rules: {fontFamily: 'monospace', marginTop: space[1]},
});
