/**
 * ProfileListScreen — list pregnancy profiles.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors, urgency} from '../theme/colors';
import {query} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Profile = {
  id: string;
  woman_name: string;
  profile_month: string;
  risk_level: string;
  status: string;
  generated_at: string;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ProfileListScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();

  const [rows, setRows] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const result = query(
        `SELECT id, woman_name, profile_month, risk_level, status, generated_at
         FROM pregnancy_profiles ORDER BY generated_at DESC`,
      );
      setRows(result.map((r: any) => ({
        id: String(r.id),
        woman_name: String(r.woman_name || ''),
        profile_month: String(r.profile_month || ''),
        risk_level: String(r.risk_level || 'GREY'),
        status: String(r.status || 'DRAFT'),
        generated_at: String(r.generated_at || ''),
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
        <Pressable style={[styles.createBtn, {backgroundColor: colors.primary}]} onPress={() => navigation.navigate('ProfileGenerate')}>
          <Text style={styles.createBtnText}>Generate Profiles</Text>
        </Pressable>
      }
      ListEmptyComponent={<View style={styles.center}><Text style={[styles.empty, {color: colors.textSecondary}]}>No profiles</Text></View>}
      renderItem={({item}) => (
        <Pressable style={[styles.card, {backgroundColor: colors.surface}]} onPress={() => navigation.navigate('ProfileDetail', {profileId: item.id})}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{item.woman_name}</Text>
            <View style={[styles.badge, {backgroundColor: urgency[item.risk_level as keyof typeof urgency] || urgency.GREY}]}>
              <Text style={styles.badgeText}>{item.risk_level}</Text>
            </View>
          </View>
          <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.profile_month || 'No month'}</Text>
          <Text style={[styles.cardStatus, {color: colors.textSecondary}]}>{item.status}</Text>
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
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6},
  cardTitle: {fontSize: 15, fontWeight: '600'},
  cardSub: {fontSize: 13, marginTop: 2},
  cardStatus: {fontSize: 11, fontWeight: '600', marginTop: 6, textTransform: 'uppercase'},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  badgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},
});
