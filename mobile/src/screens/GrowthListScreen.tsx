/**
 * GrowthListScreen — lists children with recent growth measurements.
 * MCHVC-SPEC-001 v1.1 §51. Offline-first (DEC-007).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {useTheme} from '../theme/useTheme';
import {query} from '../core/db/database';
import {SearchBar, FilterChips} from '../components/SearchFilter';
import {BottomTabBar} from '../components/BottomTabBar';
import {
  Screen,
  Card,
  Badge,
  EmptyState,
  LoadingState,
  AppText,
  type BadgeTone,
} from '../components/ui';
import {space} from '../theme/tokens';
import type {RootStackParamList} from '../core/navigation/types';

type GrowthRow = {
  id: string;
  child_name: string;
  measurement_date: string;
  indicator: string;
  muac_mm: number | null;
  weight_kg: number | null;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function GrowthListScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();

  const [rows, setRows] = useState<GrowthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string | null>(null);

  const loadData = useCallback(() => {
    try {
      const result = query(
        `SELECT id, child_name, measurement_date, indicator, muac_mm, weight_kg
         FROM growth_measurements
         ORDER BY measurement_date DESC`,
      );
      const items: GrowthRow[] = result.map((r: any) => ({
        id: String(r.id),
        child_name: String(r.child_name || 'Unknown'),
        measurement_date: String(r.measurement_date || ''),
        indicator: String(r.indicator || 'NORMAL'),
        muac_mm: r.muac_mm ? Number(r.muac_mm) : null,
        weight_kg: r.weight_kg ? Number(r.weight_kg) : null,
      }));
      setRows(items);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const indicatorTone = (ind: string): BadgeTone => {
    if (ind.includes('SEVERELY') || ind.includes('SAM') || ind.includes('OEDEMA')) return 'danger';
    if (ind.includes('WASTED') || ind.includes('STUNTED') || ind.includes('UNDERWEIGHT') || ind.includes('MAM')) return 'warning';
    if (ind.includes('OVERWEIGHT') || ind.includes('OBESE')) return 'warning';
    return 'success';
  };

  const indicatorColor = (ind: string): string => {
    if (ind.includes('SEVERELY') || ind.includes('SAM') || ind.includes('OEDEMA')) return colors.danger;
    if (ind.includes('WASTED') || ind.includes('STUNTED') || ind.includes('UNDERWEIGHT') || ind.includes('MAM')) return colors.warning;
    if (ind.includes('OVERWEIGHT') || ind.includes('OBESE')) return colors.warning;
    return colors.success;
  };

  const filtered = rows.filter(r => {
    const matchesSearch = !search || r.child_name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = !filter ||
      (filter === 'NORMAL' && r.indicator === 'NORMAL') ||
      (filter === 'AT_RISK' && (r.indicator.includes('WASTED') || r.indicator.includes('STUNTED') || r.indicator.includes('UNDERWEIGHT') || r.indicator.includes('MAM'))) ||
      (filter === 'SEVERE' && (r.indicator.includes('SEVERELY') || r.indicator.includes('SAM') || r.indicator.includes('OEDEMA')));
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading growth measurements…" />
      </Screen>
    );
  }

  return (
    <>
      <SearchBar value={search} onChange={setSearch} placeholder="Search child name..." />
      <FilterChips options={['NORMAL', 'AT_RISK', 'SEVERE']} selected={filter} onSelect={setFilter} />
      <FlatList
        style={[styles.container, {backgroundColor: colors.background}]}
        data={filtered}
        keyExtractor={item => item.id}
        refreshing={refreshing}
        onRefresh={() => {
          setRefreshing(true);
          loadData();
        }}
        ListEmptyComponent={
          <EmptyState
            icon="chart"
            title="No growth measurements recorded"
            message="Record a growth measurement to start tracking child nutrition."
          />
        }
        renderItem={({item}) => (
          <Card
            onPress={() => navigation.navigate('GrowthDetail', {childId: item.id})}
            accentColor={indicatorColor(item.indicator)}
            style={styles.card}
            accessibilityLabel={`${item.child_name}. ${item.indicator}`}>
            <View style={styles.cardHeader}>
              <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                {item.child_name}
              </AppText>
              <Badge
                label={item.indicator}
                tone={indicatorTone(item.indicator)}
                size="sm"
                solid
              />
            </View>
            <AppText variant="small" tone="secondary">
              {item.measurement_date}
            </AppText>
            <AppText variant="caption" tone="tertiary" style={styles.cardMeta}>
              {item.weight_kg ? `${item.weight_kg}kg` : 'No weight'}
              {item.muac_mm ? `  ·  MUAC: ${item.muac_mm}mm` : ''}
            </AppText>
          </Card>
        )}
      />
      <BottomTabBar activeRoute="GrowthList" />
    </>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  card: {marginHorizontal: space[4], marginVertical: space[2]},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2]},
  cardMeta: {marginTop: 2},
  flex: {flex: 1},
});
