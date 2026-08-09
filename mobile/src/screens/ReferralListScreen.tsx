/**
 * ReferralListScreen — list referrals with status filter.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors, urgency} from '../theme/colors';
import {query} from '../core/db/database';
import {toOfflineUrgency} from '../core/utils/urgencyMapping';
import type {RootStackParamList} from '../core/navigation/types';

type Referral = {
  id: string;
  patient_name: string;
  referral_reason: string;
  status: string;
  urgency: string;
  destination_facility: string;
  created_at: string;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function ReferralListScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();

  const [rows, setRows] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const result = query(
        `SELECT id, patient_name, referral_reason, status, urgency, destination_facility, created_at
         FROM referrals ORDER BY created_at DESC`,
      );
      setRows(result.map((r: any) => ({
        id: String(r.id),
        patient_name: String(r.patient_name || ''),
        referral_reason: String(r.referral_reason || ''),
        status: String(r.status || 'DRAFT'),
        urgency: String(r.urgency || 'ROUTINE'),
        destination_facility: String(r.destination_facility || ''),
        created_at: String(r.created_at || ''),
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
        <View style={styles.headerActions}>
          <Pressable style={[styles.createBtn, {backgroundColor: colors.primary}]} onPress={() => navigation.navigate('ReferralCreate')}>
            <Text style={styles.createBtnText}>+ New Referral</Text>
          </Pressable>
        </View>
      }
      ListEmptyComponent={<View style={styles.center}><Text style={[styles.empty, {color: colors.textSecondary}]}>No referrals</Text></View>}
      renderItem={({item}) => (
        <Pressable style={[styles.card, {backgroundColor: colors.surface}]} onPress={() => navigation.navigate('ReferralDetail', {referralId: item.id})}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{item.patient_name}</Text>
            <View style={[styles.badge, {backgroundColor: urgency[toOfflineUrgency(item.urgency) as keyof typeof urgency] || urgency.GREY}]}>
              <Text style={styles.badgeText}>{toOfflineUrgency(item.urgency)}</Text>
            </View>
          </View>
          <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.referral_reason}</Text>
          <Text style={[styles.cardSub, {color: colors.textSecondary}]}>To: {item.destination_facility || '—'}</Text>
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
  createBtn: {padding: 14, borderRadius: 12, alignItems: 'center'},
  createBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},
  headerActions: {flexDirection: 'row', gap: 8, padding: 16},
  secondaryBtn: {padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1},
  secondaryBtnText: {fontWeight: '700', fontSize: 15},
  card: {marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6},
  cardTitle: {fontSize: 15, fontWeight: '600'},
  cardSub: {fontSize: 13, marginTop: 2},
  cardStatus: {fontSize: 11, fontWeight: '600', marginTop: 6, textTransform: 'uppercase'},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  badgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},
});
