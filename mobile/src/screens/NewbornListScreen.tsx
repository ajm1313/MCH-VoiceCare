/**
 * NewbornListScreen — lists active newborn episodes from local SQLite.
 * MCHVC-SPEC-001 v1.1 §15-21. Offline-first (DEC-007).
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

type NewbornRow = {
  id: string;
  child_name: string;
  mother_name: string;
  status: string;
  minimum_class: string;
  birth_weight_g: number | null;
  age_hours: number | null;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function NewbornListScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();

  const [rows, setRows] = useState<NewbornRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const result = query(
        `SELECT id, child_name, mother_name, status, minimum_class,
                birth_weight_g, age_hours
         FROM newborn_episodes
         WHERE status = 'ACTIVE'
         ORDER BY created_at DESC`,
      );
      const items: NewbornRow[] = result.map((r: any) => ({
        id: String(r.id),
        child_name: String(r.child_name || 'Unknown'),
        mother_name: String(r.mother_name || 'Unknown'),
        status: String(r.status || 'ACTIVE'),
        minimum_class: String(r.minimum_class || 'GREY'),
        birth_weight_g: r.birth_weight_g ? Number(r.birth_weight_g) : null,
        age_hours: r.age_hours ? Number(r.age_hours) : null,
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

  const urgencyColor = (cls: string) => {
    switch (cls) {
      case 'RED': return urgency.RED;
      case 'ORANGE': return urgency.ORANGE;
      case 'AMBER': return urgency.AMBER;
      case 'GREEN': return urgency.GREEN;
      default: return urgency.GREY;
    }
  };

  const filtered = rows.filter(r => {
    const matchesSearch = !search ||
      r.child_name.toLowerCase().includes(search.toLowerCase()) ||
      r.mother_name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = !filter || r.minimum_class === filter;
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
      <View style={[styles.header, {backgroundColor: colors.surface}]}>
        <Text style={[styles.headerTitle, {color: colors.textPrimary}]}>Newborns</Text>
        <Pressable
          onPress={() => navigation.navigate('NewbornRegister')}
          style={[styles.registerBtn, {backgroundColor: colors.primary}]}>
          <Text style={styles.registerBtnText}>+ Register</Text>
        </Pressable>
      </View>
      <SearchBar value={search} onChange={setSearch} placeholder="Search child or mother..." />
      <FilterChips options={['RED', 'ORANGE', 'AMBER', 'GREEN']} selected={filter} onSelect={setFilter} />
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
            No active newborn episodes
          </Text>
        </View>
      }
      renderItem={({item}) => (
        <Pressable
          onPress={() => navigation.navigate('NewbornDetail', {episodeId: item.id})}
          style={[styles.card, {backgroundColor: colors.surface, borderLeftColor: urgencyColor(item.minimum_class)}]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>
              {item.child_name}
            </Text>
            <View style={[styles.badge, {backgroundColor: urgencyColor(item.minimum_class)}]}>
              <Text style={styles.badgeText}>{item.minimum_class}</Text>
            </View>
          </View>
          <Text style={[styles.cardSub, {color: colors.textSecondary}]}>
            Mother: {item.mother_name}
          </Text>
          <Text style={[styles.cardMeta, {color: colors.textSecondary}]}>
            {item.birth_weight_g ? `${item.birth_weight_g}g` : 'Weight unknown'}
            {item.age_hours != null ? `  ·  ${item.age_hours}h old` : ''}
          </Text>
        </Pressable>
      )}
      />
      <BottomTabBar activeRoute="NewbornList" />
    </>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  empty: {fontSize: 14},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12},
  headerTitle: {fontSize: 20, fontWeight: '700'},
  registerBtn: {paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8},
  registerBtnText: {color: '#fff', fontSize: 14, fontWeight: '600'},
  card: {marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12, borderLeftWidth: 4, borderLeftColor: '#ccc'},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  cardTitle: {fontSize: 16, fontWeight: '700'},
  cardSub: {fontSize: 13, marginTop: 4},
  cardMeta: {fontSize: 12, marginTop: 2},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  badgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},
});
