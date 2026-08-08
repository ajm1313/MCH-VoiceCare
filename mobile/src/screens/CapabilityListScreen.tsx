/**
 * CapabilityListScreen — list facility capabilities for referrals.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Capability = { id: string; facility_name: string; capability: string; has_capability: boolean };

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function CapabilityListScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();

  const [rows, setRows] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const result = query('SELECT id, facility_name, capability, has_capability FROM facility_capabilities ORDER BY facility_name, capability');
      setRows(result.map((r: any) => ({
        id: String(r.id),
        facility_name: String(r.facility_name || ''),
        capability: String(r.capability || ''),
        has_capability: Number(r.has_capability) === 1,
      })));
    } finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;

  return (
    <FlatList
      style={[styles.container, {backgroundColor: colors.background}]}
      data={rows} keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />}
      ListHeaderComponent={
        <Pressable style={[styles.createBtn, {backgroundColor: colors.primary}]} onPress={() => navigation.navigate('CapabilityForm', {})}>
          <Text style={styles.createBtnText}>+ New Capability</Text>
        </Pressable>
      }
      ListEmptyComponent={<View style={styles.center}><Text style={[styles.empty, {color: colors.textSecondary}]}>No capabilities recorded</Text></View>}
      renderItem={({item}) => (
        <Pressable style={[styles.card, {backgroundColor: colors.surface}]} onPress={() => navigation.navigate('CapabilityForm', {capabilityId: item.id})}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{item.facility_name}</Text>
            <View style={[styles.badge, {backgroundColor: item.has_capability ? colors.primary : colors.border}]}>
              <Text style={[styles.badgeText, {color: item.has_capability ? '#fff' : colors.textSecondary}]}>{item.has_capability ? 'YES' : 'NO'}</Text>
            </View>
          </View>
          <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.capability.replace(/_/g, ' ')}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {flex: 1}, center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}, empty: {fontSize: 14},
  createBtn: {margin: 16, padding: 14, borderRadius: 12, alignItems: 'center'},
  createBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},
  card: {marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  cardTitle: {fontSize: 15, fontWeight: '600'},
  cardSub: {fontSize: 13, marginTop: 4},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  badgeText: {fontSize: 11, fontWeight: '700'},
});
