/**
 * GrowthListScreen — lists children with recent growth measurements.
 * MCHVC-SPEC-001 v1.1 §51. Offline-first (DEC-007).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors, urgency} from '../theme/colors';
import {query} from '../core/db/database';
import {SearchBar, FilterChips} from '../components/SearchFilter';
import {BottomTabBar} from '../components/BottomTabBar';
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
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
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

  const indicatorColor = (ind: string) => {
    if (ind.includes('SEVERELY') || ind.includes('SAM') || ind.includes('OEDEMA')) return urgency.RED;
    if (ind.includes('WASTED') || ind.includes('STUNTED') || ind.includes('UNDERWEIGHT') || ind.includes('MAM')) return urgency.ORANGE;
    if (ind.includes('OVERWEIGHT') || ind.includes('OBESE')) return urgency.AMBER;
    return urgency.GREEN;
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
      <View style={[styles.center, {backgroundColor: colors.background}]}>
        <ActivityIndicator color={colors.primary} />
      </View>
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
            No growth measurements recorded
          </Text>
        </View>
      }
      renderItem={({item}) => (
        <Pressable
          onPress={() => navigation.navigate('GrowthDetail', {childId: item.id})}
          style={[styles.card, {backgroundColor: colors.surface, borderLeftColor: indicatorColor(item.indicator)}]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>
              {item.child_name}
            </Text>
            <View style={[styles.badge, {backgroundColor: indicatorColor(item.indicator)}]}>
              <Text style={styles.badgeText}>{item.indicator}</Text>
            </View>
          </View>
          <Text style={[styles.cardSub, {color: colors.textSecondary}]}>
            {item.measurement_date}
          </Text>
          <Text style={[styles.cardMeta, {color: colors.textSecondary}]}>
            {item.weight_kg ? `${item.weight_kg}kg` : 'No weight'}
            {item.muac_mm ? `  ·  MUAC: ${item.muac_mm}mm` : ''}
          </Text>
        </Pressable>
      )}
    />
    <BottomTabBar activeRoute="GrowthList" />
    </>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  empty: {fontSize: 14},
  card: {marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: '#ccc'},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  cardTitle: {fontSize: 16, fontWeight: '700'},
  cardSub: {fontSize: 13, marginTop: 4},
  cardMeta: {fontSize: 12, marginTop: 2},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  badgeText: {color: '#fff', fontSize: 10, fontWeight: '700'},
});
