/**
 * HouseholdListScreen — list households from local DB.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Household = {
  id: string;
  household_name: string;
  location: string | null;
  phone: string | null;
};

export function HouseholdListScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();

  const [rows, setRows] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const result = query('SELECT id, household_name, location, phone FROM households ORDER BY household_name');
      setRows(result.map((r: any) => ({
        id: String(r.id),
        household_name: String(r.household_name || ''),
        location: r.location ? String(r.location) : null,
        phone: r.phone ? String(r.phone) : null,
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
      ListHeaderComponent={
        <Pressable style={[styles.createBtn, {backgroundColor: colors.primary}]} onPress={() => navigation.navigate('HouseholdForm', {})}>
          <Text style={styles.createBtnText}>+ New Household</Text>
        </Pressable>
      }
      ListEmptyComponent={<View style={styles.center}><Text style={[styles.empty, {color: colors.textSecondary}]}>No households registered</Text></View>}
      renderItem={({item}) => (
        <Pressable style={[styles.card, {backgroundColor: colors.surface}]} onPress={() => navigation.navigate('HouseholdForm', {householdId: item.id})}>
          <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{item.household_name}</Text>
          {item.location && <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.location}</Text>}
          {item.phone && <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.phone}</Text>}
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  empty: {fontSize: 14},
  createBtn: {margin: 16, padding: 14, borderRadius: 12, alignItems: 'center'},
  createBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},
  card: {marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12},
  cardTitle: {fontSize: 15, fontWeight: '600'},
  cardSub: {fontSize: 13, marginTop: 2},
});
