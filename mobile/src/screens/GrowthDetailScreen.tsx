/**
 * GrowthDetailScreen — shows growth measurement history for a child.
 * MCHVC-SPEC-001 v1.1 §51. Offline-first (DEC-007).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {useTheme} from '../theme/useTheme';
import {query} from '../core/db/database';
import {
  Screen,
  Card,
  Button,
  Badge,
  SectionHeader,
  LoadingState,
  EmptyState,
  AppText,
  Icon,
  type BadgeTone,
} from '../components/ui';
import {space} from '../theme/tokens';
import type {RootStackParamList} from '../core/navigation/types';

type MeasurementRow = {
  id: string;
  measurement_date: string;
  weight_kg: number | null;
  length_cm: number | null;
  muac_mm: number | null;
  indicator: string;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function GrowthDetailScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute();
  const childId = (route.params as {childId: string}).childId;

  const [childName, setChildName] = useState('');
  const [measurements, setMeasurements] = useState<MeasurementRow[]>([]);
  const [motherName, setMotherName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const childResult = query(
        `SELECT child_name FROM growth_measurements WHERE id = ? LIMIT 1`,
        [childId],
      );
      if (childResult.length > 0) {
        setChildName(String(childResult[0].child_name || 'Unknown'));
      }

      const nameResult = query(
        `SELECT DISTINCT child_name FROM growth_measurements WHERE id = ? OR child_name = (SELECT child_name FROM growth_measurements WHERE id = ?) LIMIT 1`,
        [childId, childId],
      );
      if (nameResult.length > 0) {
        setChildName(String(nameResult[0].child_name || 'Unknown'));
      }

      const rows = query(
        `SELECT id, child_name, measurement_date, weight_kg, length_cm, muac_mm, indicator
         FROM growth_measurements
         WHERE child_name = (SELECT child_name FROM growth_measurements WHERE id = ?)
         ORDER BY measurement_date DESC`,
        [childId],
      );
      const items: MeasurementRow[] = rows.map((r: any) => ({
        id: String(r.id),
        measurement_date: String(r.measurement_date || ''),
        weight_kg: r.weight_kg ? Number(r.weight_kg) : null,
        length_cm: r.length_cm ? Number(r.length_cm) : null,
        muac_mm: r.muac_mm ? Number(r.muac_mm) : null,
        indicator: String(r.indicator || 'NORMAL'),
      }));
      setMeasurements(items);

      // Try to find mother/pregnancy linkage via newborn episodes
      try {
        const newbornRows = query(
          `SELECT snapshot FROM episodes WHERE module = 'NEONATE' AND status = 'ACTIVE' LIMIT 50`,
        );
        for (const row of newbornRows) {
          try {
            const snap = JSON.parse(row.snapshot as string);
            if (snap.child_name && String(snap.child_name) === childName) {
              setMotherName(String(snap.mother_name ?? null));
              break;
            }
          } catch { /* */ }
        }
      } catch { /* table may not exist yet */ }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [childId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const indicatorTone = (ind: string): BadgeTone => {
    if (ind.includes('SEVERELY') || ind.includes('SAM') || ind.includes('OEDEMA')) return 'danger';
    if (ind.includes('WASTED') || ind.includes('STUNTED') || ind.includes('UNDERWEIGHT') || ind.includes('MAM')) return 'warning';
    if (ind.includes('OVERWEIGHT') || ind.includes('OBESE')) return 'warning';
    return 'success';
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading growth history…" />
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <Card style={styles.section}>
        <AppText variant="h2">{childName}</AppText>
        <AppText variant="small" tone="secondary" style={styles.subtitle}>
          {measurements.length} measurement{measurements.length !== 1 ? 's' : ''}
        </AppText>
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

      <View style={styles.buttonRow}>
        <Button
          label="Record New Measurement"
          variant="primary"
          size="lg"
          icon="plus"
          fullWidth
          onPress={() => navigation.navigate('GrowthRecord', {childId})}
        />
      </View>

      <View style={styles.buttonRow}>
        <Button
          label="View Growth Charts"
          variant="secondary"
          size="lg"
          icon="chart"
          iconRight="chevronRight"
          fullWidth
          onPress={() => navigation.navigate('GrowthChart', {childId})}
        />
      </View>

      <FlatList
        data={measurements}
        keyExtractor={item => item.id}
        scrollEnabled={false}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          loadData();
        }}
        ListEmptyComponent={
          <EmptyState
            icon="chart"
            title="No measurements recorded"
            message="Record a growth measurement to start tracking."
          />
        }
        renderItem={({item}) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <AppText variant="bodyStrong">{item.measurement_date}</AppText>
              <Badge
                label={item.indicator}
                tone={indicatorTone(item.indicator)}
                size="sm"
                solid
              />
            </View>
            <View style={styles.metricsRow}>
              {item.weight_kg != null && (
                <View style={styles.metric}>
                  <AppText variant="caption" tone="secondary">Weight</AppText>
                  <AppText variant="bodyStrong" style={styles.metricValue}>
                    {item.weight_kg} kg
                  </AppText>
                </View>
              )}
              {item.length_cm != null && (
                <View style={styles.metric}>
                  <AppText variant="caption" tone="secondary">Length</AppText>
                  <AppText variant="bodyStrong" style={styles.metricValue}>
                    {item.length_cm} cm
                  </AppText>
                </View>
              )}
              {item.muac_mm != null && (
                <View style={styles.metric}>
                  <AppText variant="caption" tone="secondary">MUAC</AppText>
                  <AppText variant="bodyStrong" style={styles.metricValue}>
                    {item.muac_mm} mm
                  </AppText>
                </View>
              )}
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {marginVertical: space[2]},
  subtitle: {marginTop: 2},
  buttonRow: {marginBottom: space[2]},
  card: {marginVertical: space[2]},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2]},
  metricsRow: {flexDirection: 'row', marginTop: space[3], gap: space[4]},
  metric: {flex: 1},
  metricValue: {marginTop: 2},
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
});
