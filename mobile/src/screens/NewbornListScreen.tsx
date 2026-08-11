/**
 * NewbornListScreen — lists active newborn episodes from local SQLite.
 * MCHVC-SPEC-001 v1.1 §15-21. Offline-first (DEC-007).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, RefreshControl, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {query} from '../core/db/database';
import {SearchBar, FilterChips} from '../components/SearchFilter';
import {BottomTabBar} from '../components/BottomTabBar';
import type {RootStackParamList} from '../core/navigation/types';
import {
  Screen,
  Card,
  Button,
  AppText,
  UrgencyBadge,
  EmptyState,
  LoadingState,
} from '../components/ui';
import {useTheme} from '../theme/useTheme';
import {space} from '../theme/tokens';

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
  const {colors} = useTheme();
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

  const filtered = rows.filter(r => {
    const matchesSearch = !search ||
      r.child_name.toLowerCase().includes(search.toLowerCase()) ||
      r.mother_name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = !filter || r.minimum_class === filter;
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <Screen padded={false}>
        <LoadingState />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <AppText variant="h2">Newborns</AppText>
        <Button
          label="Register"
          onPress={() => navigation.navigate('NewbornRegister')}
          size="sm"
          icon="plus"
        />
      </View>
      <SearchBar value={search} onChange={setSearch} placeholder="Search child or mother..." />
      <FilterChips options={['RED', 'ORANGE', 'AMBER', 'GREEN']} selected={filter} onSelect={setFilter} />
      <FlatList
        style={styles.list}
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
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <EmptyState
            icon="baby"
            title="No active newborn episodes"
            message="Register a newborn to begin tracking their care."
          />
        }
        renderItem={({item}) => (
          <Card
            onPress={() => navigation.navigate('NewbornDetail', {episodeId: item.id})}
            style={styles.card}>
            <View style={styles.cardHeader}>
              <AppText variant="bodyStrong" numberOfLines={1} style={styles.cardTitle}>
                {item.child_name}
              </AppText>
              <UrgencyBadge value={item.minimum_class} size="sm" />
            </View>
            <AppText variant="small" tone="secondary" style={styles.cardSub}>
              Mother: {item.mother_name}
            </AppText>
            <AppText variant="caption" tone="tertiary" style={styles.cardMeta}>
              {item.birth_weight_g ? `${item.birth_weight_g}g` : 'Weight unknown'}
              {item.age_hours != null ? `  ·  ${item.age_hours}h old` : ''}
            </AppText>
          </Card>
        )}
      />
      <BottomTabBar activeRoute="NewbornList" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  list: {flex: 1},
  card: {
    marginHorizontal: space[4],
    marginVertical: space[2],
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space[2],
  },
  cardTitle: {flex: 1},
  cardSub: {marginTop: space[1]},
  cardMeta: {marginTop: space[1]},
});
