/**
 * NewbornDetailScreen — shows newborn episode baseline, assessment history.
 * MCHVC-SPEC-001 v1.1 §20. Offline-first (DEC-007).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {query} from '../core/db/database';
import {isSpeechCaptureEnabled} from '../core/auth/featureFlags';
import type {RootStackParamList} from '../core/navigation/types';
import {
  Screen,
  Card,
  Button,
  AppText,
  UrgencyBadge,
  SectionHeader,
  KeyValue,
  Divider,
  LoadingState,
  ListRow,
} from '../components/ui';
import {useTheme} from '../theme/useTheme';
import {space} from '../theme/tokens';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function NewbornDetailScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const episodeId = (route.params as {episodeId: string}).episodeId;

  const [episode, setEpisode] = useState<Record<string, any> | null>(null);
  const [assessments, setAssessments] = useState<any[]>([]);
  const [observations, setObservations] = useState<any[]>([]);
  const [hasImmunisation, setHasImmunisation] = useState(false);
  const [hasGrowth, setHasGrowth] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const epResult = query(
        `SELECT * FROM newborn_episodes WHERE id = ?`,
        [episodeId],
      );
      if (epResult.length > 0) {
        setEpisode(epResult[0] as Record<string, any>);
      }

      const obsResult = query(
        `SELECT * FROM newborn_observations WHERE newborn_id = ?
         ORDER BY recorded_at DESC LIMIT 10`,
        [episodeId],
      );
      setObservations(obsResult);

      const assResult = query(
        `SELECT * FROM newborn_assessments WHERE episode_id = ?
         ORDER BY assessment_datetime DESC LIMIT 5`,
        [episodeId],
      );
      setAssessments(assResult);

      // Check for existing immunisation and growth records for this child
      const childName = epResult.length > 0 ? String((epResult[0] as Record<string, any>).child_name || '') : '';
      if (childName) {
        try {
          const immRows = query(`SELECT id FROM immunisation_children WHERE child_name = ? LIMIT 1`, [childName]);
          setHasImmunisation(immRows.length > 0);
        } catch { /* */ }
        try {
          const growthRows = query(`SELECT id FROM growth_measurements WHERE child_name = ? LIMIT 1`, [childName]);
          setHasGrowth(growthRows.length > 0);
        } catch { /* */ }
      }
    } finally {
      setLoading(false);
    }
  }, [episodeId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <Screen padded={false}>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {episode && (
        <Card style={styles.section}>
          <SectionHeader title={`Newborn: ${String(episode.child_name || 'Unknown')}`} />
          <KeyValue label="Mother" value={String(episode.mother_name || 'Unknown')} />
          <KeyValue label="Sex" value={String(episode.sex || 'Unknown')} />
          <KeyValue
            label="Birth weight"
            value={episode.birth_weight_g ? `${episode.birth_weight_g}g` : 'Unknown'}
          />
          <KeyValue
            label="Gestational age"
            value={episode.gestational_age_weeks ? `${episode.gestational_age_weeks}w` : 'Unknown'}
          />
          <KeyValue label="KMC" value={String(episode.kmc_status || 'Not eligible')} />
        </Card>
      )}

      {/* Continuity of Care */}
      <Card style={styles.section}>
        <SectionHeader title="Continuity of Care" />
        <ListRow
          title={hasImmunisation ? 'View Immunisation Records' : 'Register for Immunisation'}
          icon="beaker"
          iconColor={colors.primary}
          onPress={() => navigation.navigate(hasImmunisation ? 'ImmunisationList' : 'ImmunisationRegister')}
        />
        <ListRow
          title={hasGrowth ? 'View Growth Records' : 'Record Growth Measurement'}
          icon="chart"
          iconColor={colors.primary}
          onPress={() => navigation.navigate('GrowthList')}
        />
      </Card>

      <Button
        label="Record Observation"
        onPress={() => navigation.navigate('NewbornObserve', {episodeId})}
        fullWidth
        icon="clipboard"
        style={styles.primaryButton}
      />

      {isSpeechCaptureEnabled() && (
        <Button
          label="Voice Observation"
          onPress={() => navigation.navigate('VoiceRecord', {episodeId})}
          fullWidth
          icon="mic"
          style={styles.primaryButton}
        />
      )}

      <View style={styles.actionRow}>
        <Button
          label="Transfer"
          onPress={() => navigation.navigate('NewbornTransfer', {episodeId})}
          variant="secondary"
          icon="share"
          style={styles.actionButton}
        />
        <Button
          label="Close Episode"
          onPress={() => navigation.navigate('NewbornClose', {episodeId})}
          variant="secondary"
          icon="checkCircle"
          style={styles.actionButton}
        />
      </View>

      {assessments.length > 0 && (
        <Card style={styles.section}>
          <SectionHeader title="Assessment History" />
          {assessments.map((a, i) => (
            <View key={i} style={styles.assessRow}>
              <UrgencyBadge value={String(a.minimum_class)} size="sm" />
              <AppText variant="small" tone="secondary" style={styles.assessText}>
                {String(a.recommended_action_text || '')}
              </AppText>
            </View>
          ))}
        </Card>
      )}

      {observations.length > 0 && (
        <Card style={styles.section}>
          <SectionHeader title="Recent Observations" />
          {observations.map((o, i) => (
            <View key={i} style={styles.obsRow}>
              <AppText variant="caption" tone="secondary">
                {String(o.recorded_at || '')} — Temp: {o.temperature_c || 'N/A'}°C
              </AppText>
              {i < observations.length - 1 && <Divider style={styles.obsDivider} />}
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {marginBottom: space[3]},
  primaryButton: {marginBottom: space[2]},
  actionRow: {flexDirection: 'row', gap: space[3], marginBottom: space[3]},
  actionButton: {flex: 1},
  assessRow: {flexDirection: 'row', alignItems: 'center', gap: space[2], paddingVertical: space[2]},
  assessText: {flex: 1},
  obsRow: {paddingVertical: space[1]},
  obsDivider: {marginVertical: space[1]},
});
