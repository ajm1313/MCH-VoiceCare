/**
 * ImmunisationChildDetailScreen — shows child immunisation profile and dose history.
 * MCHVC-SPEC-001 v1.1 §25. Offline-first (DEC-007).
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

import {darkColors, lightColors} from '../theme/colors';
import {query} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ImmunisationChildDetailScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const childId = (route.params as {childId: string}).childId;

  const [child, setChild] = useState<Record<string, any> | null>(null);
  const [doses, setDoses] = useState<any[]>([]);
  const [motherName, setMotherName] = useState<string | null>(null);
  const [pregnancyId, setPregnancyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(() => {
    try {
      const childRows = query(
        `SELECT * FROM immunisation_children WHERE id = ?`,
        [childId],
      );
      if (childRows.length > 0) {
        setChild(childRows[0] as Record<string, any>);
      }

      const doseRows = query(
        `SELECT * FROM vaccine_doses WHERE child_id = ?
         ORDER BY administration_datetime DESC`,
        [childId],
      );
      setDoses(doseRows);

      // Try to find mother/pregnancy linkage via newborn episodes
      try {
        const newbornRows = query(
          `SELECT snapshot FROM episodes WHERE module = 'NEONATE' AND status = 'ACTIVE' LIMIT 50`,
        );
        for (const row of newbornRows) {
          try {
            const snap = JSON.parse(row.snapshot as string);
            if (snap.child_name && child && String(snap.child_name) === String(child.child_name)) {
              setMotherName(String(snap.mother_name ?? null));
              setPregnancyId(String(snap.pregnancy ?? null));
              break;
            }
          } catch { /* */ }
        }
      } catch { /* table may not exist yet */ }
    } finally {
      setLoading(false);
    }
  }, [childId]);

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

  return (
    <ScrollView style={[styles.container, {backgroundColor: colors.background}]}>
      {child && (
        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>
            {String(child.child_name || 'Unknown')}
          </Text>
          <Text style={[styles.row, {color: colors.textSecondary}]}>
            DOB: {String(child.dob || 'Unknown')}
          </Text>
          <Text style={[styles.row, {color: colors.textSecondary}]}>
            CWC card: {String(child.cwc_card_number || 'N/A')}
          </Text>
          <Text style={[styles.row, {color: colors.textSecondary}]}>
            Residence: {String(child.residence_status || 'Unknown')}
          </Text>
          <Text style={[styles.row, {color: colors.textSecondary}]}>
            Next due: {child.next_due ? String(child.next_due) : 'No doses due'}
          </Text>
          {motherName && (
            <View style={[styles.linkBanner, {borderColor: colors.primary + '40'}]}>
              <Text style={[styles.linkIcon, {color: colors.primary}]}>🤰</Text>
              <View style={styles.linkText}>
                <Text style={[styles.linkLabel, {color: colors.textSecondary}]}>Mother</Text>
                <Text style={[styles.linkValue, {color: colors.textPrimary}]}>{motherName}</Text>
              </View>
            </View>
          )}
        </View>
      )}

      <Pressable
        onPress={() => navigation.navigate('ImmunisationRecordDose', {childId})}
        style={[styles.button, {backgroundColor: colors.primary}]}>
        <Text style={styles.buttonText}>Record Vaccine Dose</Text>
      </Pressable>

      {doses.length > 0 && (
        <View style={[styles.section, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>
            Dose History
          </Text>
          {doses.map((d, i) => (
            <View key={i} style={styles.doseRow}>
              <Text style={[styles.doseText, {color: colors.textPrimary}]}>
                {String(d.vaccine_code || '')} #{String(d.dose_number || '')}
              </Text>
              <Text style={[styles.doseMeta, {color: colors.textSecondary}]}>
                {String(d.administration_datetime || '')}
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
  doseRow: {flexDirection: 'row', justifyContent: 'space-between', marginTop: 8},
  doseText: {fontSize: 14, fontWeight: '600'},
  doseMeta: {fontSize: 12},
  linkBanner: {flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTopWidth: 1, gap: 8},
  linkIcon: {fontSize: 20},
  linkText: {flex: 1},
  linkLabel: {fontSize: 10, fontWeight: '600', textTransform: 'uppercase'},
  linkValue: {fontSize: 14, fontWeight: '600', marginTop: 2},
});
