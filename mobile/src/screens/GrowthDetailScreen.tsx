/**
 * GrowthDetailScreen — shows growth measurement history for a child.
 * MCHVC-SPEC-001 v1.1 §51. Offline-first (DEC-007).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
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
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
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

  const indicatorColor = (ind: string) => {
    if (ind.includes('SEVERELY') || ind.includes('SAM') || ind.includes('OEDEMA')) return urgency.RED;
    if (ind.includes('WASTED') || ind.includes('STUNTED') || ind.includes('UNDERWEIGHT') || ind.includes('MAM')) return urgency.ORANGE;
    if (ind.includes('OVERWEIGHT') || ind.includes('OBESE')) return urgency.AMBER;
    return urgency.GREEN;
  };

  if (loading) {
    return (
      <View style={[styles.center, {backgroundColor: colors.background}]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={[styles.header, {backgroundColor: colors.surface}]}>
        <Text style={[styles.title, {color: colors.textPrimary}]}>{childName}</Text>
        <Text style={[styles.subtitle, {color: colors.textSecondary}]}>
          {measurements.length} measurement{measurements.length !== 1 ? 's' : ''}
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

      <Pressable
        onPress={() => navigation.navigate('GrowthRecord', {childId})}
        style={[styles.button, {backgroundColor: colors.primary}]}>
        <Text style={styles.buttonText}>Record New Measurement</Text>
      </Pressable>

      <Pressable
        onPress={() => navigation.navigate('GrowthChart', {childId})}
        style={[styles.chartButton, {borderColor: colors.primary}]}>
        <Text style={[styles.chartButtonText, {color: colors.primary}]}>
          View Growth Charts
        </Text>
      </Pressable>

      <FlatList
        data={measurements}
        keyExtractor={item => item.id}
        scrollEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              loadData();
            }}
            colors={[colors.primary]}
          />
        }
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={[styles.empty, {color: colors.textSecondary}]}>
              No measurements recorded
            </Text>
          </View>
        }
        renderItem={({item}) => (
          <View style={[styles.card, {backgroundColor: colors.surface}]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardDate, {color: colors.textPrimary}]}>
                {item.measurement_date}
              </Text>
              <View style={[styles.badge, {backgroundColor: indicatorColor(item.indicator)}]}>
                <Text style={styles.badgeText}>{item.indicator}</Text>
              </View>
            </View>
            <View style={styles.metricsRow}>
              {item.weight_kg != null && (
                <View style={styles.metric}>
                  <Text style={[styles.metricLabel, {color: colors.textSecondary}]}>Weight</Text>
                  <Text style={[styles.metricValue, {color: colors.textPrimary}]}>
                    {item.weight_kg} kg
                  </Text>
                </View>
              )}
              {item.length_cm != null && (
                <View style={styles.metric}>
                  <Text style={[styles.metricLabel, {color: colors.textSecondary}]}>Length</Text>
                  <Text style={[styles.metricValue, {color: colors.textPrimary}]}>
                    {item.length_cm} cm
                  </Text>
                </View>
              )}
              {item.muac_mm != null && (
                <View style={styles.metric}>
                  <Text style={[styles.metricLabel, {color: colors.textSecondary}]}>MUAC</Text>
                  <Text style={[styles.metricValue, {color: colors.textPrimary}]}>
                    {item.muac_mm} mm
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  empty: {fontSize: 14},
  header: {margin: 16, padding: 16, borderRadius: 12},
  title: {fontSize: 20, fontWeight: '700'},
  subtitle: {fontSize: 13, marginTop: 4},
  button: {marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 12, alignItems: 'center'},
  buttonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  chartButton: {marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 2},
  chartButtonText: {fontWeight: '700', fontSize: 15},
  card: {marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  cardDate: {fontSize: 15, fontWeight: '600'},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  badgeText: {color: '#fff', fontSize: 10, fontWeight: '700'},
  metricsRow: {flexDirection: 'row', marginTop: 12, gap: 16},
  metric: {flex: 1},
  metricLabel: {fontSize: 11, fontWeight: '500'},
  metricValue: {fontSize: 15, fontWeight: '600', marginTop: 2},
  linkBanner: {flexDirection: 'row', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, gap: 8},
  linkIcon: {fontSize: 20},
  linkText: {flex: 1},
  linkLabel: {fontSize: 10, fontWeight: '600', textTransform: 'uppercase'},
  linkValue: {fontSize: 14, fontWeight: '600', marginTop: 2},
});
