/**
 * ImmunisationChildDetailScreen — shows child immunisation profile and dose history.
 * MCHVC-SPEC-001 v1.1 §25. Offline-first (DEC-007).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {useTheme} from '../theme/useTheme';
import {query} from '../core/db/database';
import {
  Screen,
  Card,
  Button,
  SectionHeader,
  KeyValue,
  Divider,
  LoadingState,
  EmptyState,
  AppText,
  Icon,
} from '../components/ui';
import {space} from '../theme/tokens';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ImmunisationChildDetailScreen() {
  const {colors} = useTheme();
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
      <Screen>
        <LoadingState message="Loading child profile…" />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      {child && (
        <Card style={styles.section}>
          <AppText variant="h2">{String(child.child_name || 'Unknown')}</AppText>
          <View style={styles.kvContainer}>
            <KeyValue label="DOB" value={String(child.dob || 'Unknown')} />
            <KeyValue label="CWC card" value={String(child.cwc_card_number || 'N/A')} />
            <KeyValue label="Residence" value={String(child.residence_status || 'Unknown')} />
            <KeyValue label="Next due" value={child.next_due ? String(child.next_due) : 'No doses due'} />
          </View>
          {motherName && (
            <View style={[styles.linkBanner, {borderTopColor: colors.border}]}>
              <View style={[styles.linkIcon, {backgroundColor: colors.primarySubtle}]}>
                <Icon name="heart" size={18} color={colors.primary} />
              </View>
              <View style={styles.linkText}>
                <AppText variant="overline" tone="tertiary" uppercase>Mother</AppText>
                <AppText variant="bodyStrong" style={styles.linkValue}>{motherName}</AppText>
              </View>
            </View>
          )}
        </Card>
      )}

      <View style={styles.buttonRow}>
        <Button
          label="Record Vaccine Dose"
          variant="primary"
          size="lg"
          icon="plus"
          fullWidth
          onPress={() => navigation.navigate('ImmunisationRecordDose', {childId})}
        />
      </View>

      {doses.length > 0 && (
        <Card style={styles.section}>
          <SectionHeader title="Dose History" />
          {doses.map((d, i) => (
            <View key={i}>
              {i > 0 && <Divider />}
              <View style={styles.doseRow}>
                <AppText variant="bodyStrong">
                  {String(d.vaccine_code || '')} #{String(d.dose_number || '')}
                </AppText>
                <AppText variant="small" tone="secondary">
                  {String(d.administration_datetime || '')}
                </AppText>
              </View>
            </View>
          ))}
        </Card>
      )}

      {doses.length === 0 && (
        <EmptyState
          icon="clipboard"
          title="No doses recorded"
          message="Record the first vaccine dose for this child."
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {marginVertical: space[2]},
  kvContainer: {marginTop: space[2]},
  buttonRow: {marginVertical: space[2]},
  linkBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space[3],
    paddingTop: space[3],
    borderTopWidth: 1,
    gap: space[3],
  },
  linkIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: {flex: 1},
  linkValue: {marginTop: 2},
  doseRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: space[2],
  },
});
