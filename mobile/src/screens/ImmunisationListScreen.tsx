/**
 * ImmunisationListScreen — lists children with immunisation records from local DB.
 * MCHVC-SPEC-001 v1.1 §22-34. Offline-first (DEC-007).
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
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
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
      <View style={[styles.center, {backgroundColor: colors.background}]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <>
      <View style={[styles.header, {backgroundColor: colors.surface}]}>
        <Text style={[styles.headerTitle, {color: colors.textPrimary}]}>Immunisation</Text>
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => navigation.navigate('DefaulterList')}
            style={[styles.defaultersBtn, {borderColor: colors.primary}]}>
            <Text style={[styles.defaultersBtnText, {color: colors.primary}]}>Defaulters</Text>
          </Pressable>
          <Pressable
            onPress={() => navigation.navigate('ImmunisationRegister')}
            style={[styles.registerBtn, {backgroundColor: colors.primary}]}>
            <Text style={styles.registerBtnText}>+ Register</Text>
          </Pressable>
        </View>
      </View>
      <SearchBar value={search} onChange={setSearch} placeholder="Search child name..." />
      <FilterChips options={['OVERDUE', 'DEFAULTER', 'ON_TRACK']} selected={filter} onSelect={setFilter} />
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
            No children registered
          </Text>
        </View>
      }
      renderItem={({item}) => (
        <Pressable
          onPress={() => navigation.navigate('ImmunisationChildDetail', {childId: item.id})}
          style={[styles.card, {backgroundColor: colors.surface, borderLeftColor: item.overdue_count > 0 ? urgency.ORANGE : (item.defaulter_status ? urgency.RED : '#ccc')}]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>
              {item.child_name}
            </Text>
            {item.defaulter_status && (
              <View style={[styles.badge, {backgroundColor: urgency.ORANGE}]}>
                <Text style={styles.badgeText}>{item.defaulter_status}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.cardSub, {color: colors.textSecondary}]}>
            DOB: {item.dob}
          </Text>
          <Text style={[styles.cardMeta, {color: colors.textSecondary}]}>
            {item.overdue_count > 0
              ? `${item.overdue_count} overdue dose(s)`
              : item.next_due
                ? `Next due: ${item.next_due}`
                : 'No doses due'}
          </Text>
        </Pressable>
      )}
      />
      <BottomTabBar activeRoute="ImmunisationList" />
    </>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  empty: {fontSize: 14},
  header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12},
  headerTitle: {fontSize: 20, fontWeight: '700'},
  headerActions: {flexDirection: 'row', gap: 8, alignItems: 'center'},
  defaultersBtn: {paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1},
  defaultersBtnText: {fontSize: 13, fontWeight: '600'},
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
