/**
 * NewbornDetailScreen — shows newborn episode baseline, assessment history.
 * MCHVC-SPEC-001 v1.1 §20. Offline-first (DEC-007).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors, urgency} from '../theme/colors';
import {query} from '../core/db/database';
import {isSpeechCaptureEnabled} from '../core/auth/featureFlags';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function NewbornDetailScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
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
      <View style={[styles.center, {backgroundColor: colors.background}]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const urgencyColor = (cls: string) => {
    switch (cls) {
      case 'RED': return urgency.RED;
      case 'ORANGE': return urgency.ORANGE;
      case 'AMBER': return urgency.AMBER;
      case 'GREEN': return urgency.GREEN;
      default: return urgency.GREY;
    }
  };

  return (
    <ScrollView style={[styles.container, {backgroundColor: colors.background}]}>
      {episode && (
        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>
            Newborn: {String(episode.child_name || 'Unknown')}
          </Text>
          <Text style={[styles.row, {color: colors.textSecondary}]}>
            Mother: {String(episode.mother_name || 'Unknown')}
          </Text>
          <Text style={[styles.row, {color: colors.textSecondary}]}>
            Sex: {String(episode.sex || 'Unknown')}
          </Text>
          <Text style={[styles.row, {color: colors.textSecondary}]}>
            Birth weight: {episode.birth_weight_g ? `${episode.birth_weight_g}g` : 'Unknown'}
          </Text>
          <Text style={[styles.row, {color: colors.textSecondary}]}>
            Gestational age: {episode.gestational_age_weeks ? `${episode.gestational_age_weeks}w` : 'Unknown'}
          </Text>
          <Text style={[styles.row, {color: colors.textSecondary}]}>
            KMC: {String(episode.kmc_status || 'Not eligible')}
          </Text>
        </View>
      )}

      {/* Continuity of Care */}
      <View style={[styles.section, {backgroundColor: colors.surface}]}>
        <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Continuity of Care</Text>
        <Pressable
          style={styles.continuityLink}
          onPress={() => navigation.navigate(hasImmunisation ? 'ImmunisationList' : 'ImmunisationRegister')}>
          <Text style={styles.continuityIcon}>💉</Text>
          <Text style={[styles.continuityText, {color: colors.primary}]}>
            {hasImmunisation ? 'View Immunisation Records' : 'Register for Immunisation'}
          </Text>
          <Text style={[styles.continuityArrow, {color: colors.primary}]}>›</Text>
        </Pressable>
        <Pressable
          style={styles.continuityLink}
          onPress={() => navigation.navigate('GrowthList')}>
          <Text style={styles.continuityIcon}>📏</Text>
          <Text style={[styles.continuityText, {color: colors.primary}]}>
            {hasGrowth ? 'View Growth Records' : 'Record Growth Measurement'}
          </Text>
          <Text style={[styles.continuityArrow, {color: colors.primary}]}>›</Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => navigation.navigate('NewbornObserve', {episodeId})}
        style={[styles.button, {backgroundColor: colors.primary}]}>
        <Text style={styles.buttonText}>Record Observation</Text>
      </Pressable>

      {isSpeechCaptureEnabled() && (
        <Pressable
          onPress={() => navigation.navigate('VoiceRecord', {episodeId})}
          style={[styles.button, {backgroundColor: colors.primary, marginTop: 8}]}>
          <Text style={styles.buttonText}>🎙 Voice Observation</Text>
        </Pressable>
      )}

      <View style={styles.actionRow}>
        <Pressable
          onPress={() => navigation.navigate('NewbornTransfer', {episodeId})}
          style={[styles.secondaryButton, {borderColor: colors.primary}]}>
          <Text style={[styles.secondaryButtonText, {color: colors.primary}]}>Transfer</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('NewbornClose', {episodeId})}
          style={[styles.secondaryButton, {borderColor: colors.primary}]}>
          <Text style={[styles.secondaryButtonText, {color: colors.primary}]}>Close Episode</Text>
        </Pressable>
      </View>

      {assessments.length > 0 && (
        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>
            Assessment History
          </Text>
          {assessments.map((a, i) => (
            <View key={i} style={styles.assessRow}>
              <View style={[styles.badge, {backgroundColor: urgencyColor(String(a.minimum_class))}]}>
                <Text style={styles.badgeText}>{String(a.minimum_class)}</Text>
              </View>
              <Text style={[styles.assessText, {color: colors.textSecondary}]}>
                {String(a.recommended_action_text || '')}
              </Text>
            </View>
          ))}
        </View>
      )}

      {observations.length > 0 && (
        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>
            Recent Observations
          </Text>
          {observations.map((o, i) => (
            <View key={i} style={styles.obsRow}>
              <Text style={[styles.obsText, {color: colors.textSecondary}]}>
                {String(o.recorded_at || '')} — Temp: {o.temperature_c || 'N/A'}°C
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  section: {margin: 16, padding: 16, borderRadius: 12},
  sectionTitle: {fontSize: 16, fontWeight: '700', marginBottom: 8},
  row: {fontSize: 13, marginTop: 4},
  button: {marginHorizontal: 16, padding: 14, borderRadius: 12, alignItems: 'center'},
  buttonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  actionRow: {flexDirection: 'row', gap: 12, marginHorizontal: 16, marginTop: 8},
  secondaryButton: {flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, alignItems: 'center'},
  secondaryButtonText: {fontWeight: '600', fontSize: 14},
  assessRow: {flexDirection: 'row', alignItems: 'center', marginTop: 8, gap: 8},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  badgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},
  assessText: {fontSize: 13, flex: 1},
  obsRow: {marginTop: 6},
  obsText: {fontSize: 12},
  continuityLink: {flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 8},
  continuityIcon: {fontSize: 18},
  continuityText: {flex: 1, fontSize: 14, fontWeight: '600'},
  continuityArrow: {fontSize: 20},
});
