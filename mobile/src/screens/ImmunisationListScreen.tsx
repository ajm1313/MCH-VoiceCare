/**
 * ImmunisationListScreen — lists children with immunisation records from local DB.
 * MCHVC-SPEC-001 v1.1 §22-34. Offline-first (DEC-007).
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
  Button,
  Badge,
  EmptyState,
  LoadingState,
  AppText,
} from '../components/ui';
import {space} from '../theme/tokens';
import type {RootStackParamList} from '../core/navigation/types';

type ChildRow = {
  id: string;
  child_name: string;
  dob: string;
  next_due: string | null;
  defaulter_status: string | null;
  overdue_count: number;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ImmunisationListScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();

  const [rows, setRows] = useState<ChildRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string | null>(null);

  const loadData = useCallback(() => {
    try {
      const result = query(
        `SELECT id, child_name, dob, next_due, defaulter_status, overdue_count
         FROM immunisation_children
         ORDER BY child_name`,
      );
      const items: ChildRow[] = result.map((r: any) => ({
        id: String(r.id),
        child_name: String(r.child_name || 'Unknown'),
        dob: String(r.dob || ''),
        next_due: r.next_due ? String(r.next_due) : null,
        defaulter_status: r.defaulter_status ? String(r.defaulter_status) : null,
        overdue_count: Number(r.overdue_count || 0),
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
    const matchesSearch = !search || r.child_name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = !filter ||
      (filter === 'OVERDUE' && r.overdue_count > 0) ||
      (filter === 'DEFAULTER' && r.defaulter_status) ||
      (filter === 'ON_TRACK' && !r.defaulter_status && r.overdue_count === 0);
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading immunisation records…" />
      </Screen>
    );
  }

  const accentFor = (item: ChildRow): string => {
    if (item.overdue_count > 0) return colors.warning;
    if (item.defaulter_status) return colors.danger;
    return colors.border;
  };

  const badgeToneFor = (item: ChildRow): 'warning' | 'danger' => {
    return item.defaulter_status ? 'danger' : 'warning';
  };

  return (
    <>
      <View style={[styles.header, {backgroundColor: colors.surface, borderBottomColor: colors.border}]}>
        <AppText variant="h2">Immunisation</AppText>
        <View style={styles.headerActions}>
          <Button
            label="Defaulters"
            variant="secondary"
            size="sm"
            icon="alertTriangle"
            onPress={() => navigation.navigate('DefaulterList')}
          />
          <Button
            label="Register"
            variant="primary"
            size="sm"
            icon="plus"
            onPress={() => navigation.navigate('ImmunisationRegister')}
          />
        </View>
      </View>
      <SearchBar value={search} onChange={setSearch} placeholder="Search child name..." />
      <FilterChips options={['OVERDUE', 'DEFAULTER', 'ON_TRACK']} selected={filter} onSelect={setFilter} />
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
            icon="baby"
            title="No children registered"
            message="Register a child to start tracking immunisations."
            action={{label: 'Register Child', onPress: () => navigation.navigate('ImmunisationRegister')}}
          />
        }
        renderItem={({item}) => (
          <Card
            onPress={() => navigation.navigate('ImmunisationChildDetail', {childId: item.id})}
            accentColor={accentFor(item)}
            style={styles.card}
            accessibilityLabel={`${item.child_name}. ${item.defaulter_status ?? ''}`}>
            <View style={styles.cardHeader}>
              <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
                {item.child_name}
              </AppText>
              {item.defaulter_status && (
                <Badge
                  label={item.defaulter_status}
                  tone={badgeToneFor(item)}
                  size="sm"
                  icon="alertTriangle"
                  solid
                />
              )}
            </View>
            <AppText variant="small" tone="secondary">
              DOB: {item.dob}
            </AppText>
            <AppText variant="caption" tone="tertiary" style={styles.cardMeta}>
              {item.overdue_count > 0
                ? `${item.overdue_count} overdue dose(s)`
                : item.next_due
                  ? `Next due: ${item.next_due}`
                  : 'No doses due'}
            </AppText>
          </Card>
        )}
      />
      <BottomTabBar activeRoute="ImmunisationList" />
    </>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderBottomWidth: 1,
  },
  headerActions: {flexDirection: 'row', gap: space[2], alignItems: 'center'},
  card: {marginHorizontal: space[4], marginVertical: space[2]},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2]},
  cardMeta: {marginTop: 2},
  flex: {flex: 1},
});
