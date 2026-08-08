/**
 * DefaulterListScreen — list immunisation defaulters.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors, urgency} from '../theme/colors';
import {query} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Defaulter = {
  id: string;
  child_name: string;
  days_overdue: number;
  defaulter_status: string;
  next_due_date: string | null;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function DefaulterListScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();

  const [rows, setRows] = useState<Defaulter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const result = query(
        `SELECT d.id, d.child_name, d.days_overdue, d.defaulter_status, d.next_due_date
         FROM defaulter_episodes d
         WHERE d.defaulter_status = 'ACTIVE'
         ORDER BY d.days_overdue DESC`,
      );
      setRows(result.map((r: any) => ({
        id: String(r.id),
        child_name: String(r.child_name || ''),
        days_overdue: Number(r.days_overdue) || 0,
        defaulter_status: String(r.defaulter_status || 'ACTIVE'),
        next_due_date: r.next_due_date ? String(r.next_due_date) : null,
      })));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) {
    return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <FlatList
      style={[styles.container, {backgroundColor: colors.background}]}
      data={rows}
      keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />}
      ListEmptyComponent={<View style={styles.center}><Text style={[styles.empty, {color: colors.textSecondary}]}>No active defaulters</Text></View>}
      renderItem={({item}) => (
        <Pressable style={[styles.card, {backgroundColor: colors.surface}]} onPress={() => navigation.navigate('DefaulterDetail', {defaulterId: item.id})}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{item.child_name}</Text>
            <View style={[styles.badge, {backgroundColor: item.days_overdue > 60 ? urgency.RED : urgency.ORANGE}]}>
              <Text style={styles.badgeText}>{item.days_overdue}d overdue</Text>
            </View>
          </View>
          {item.next_due_date && <Text style={[styles.cardSub, {color: colors.textSecondary}]}>Was due: {item.next_due_date}</Text>}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  empty: {fontSize: 14},
  card: {marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  cardTitle: {fontSize: 15, fontWeight: '600'},
  cardSub: {fontSize: 12, marginTop: 4},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  badgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},
});
