/**
 * CampaignListScreen — list communication campaigns.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Campaign = {
  id: string;
  title: string;
  channel: string;
  status: string;
  template_name: string | null;
  audience_count: number;
  created_at: string;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function CampaignListScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();

  const [rows, setRows] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const result = query(
        `SELECT id, title, channel, status, template_name, audience_count, created_at
         FROM communication_campaigns ORDER BY created_at DESC`,
      );
      setRows(result.map((r: any) => ({
        id: String(r.id),
        title: String(r.title || ''),
        channel: String(r.channel || 'SMS'),
        status: String(r.status || 'DRAFT'),
        template_name: r.template_name ? String(r.template_name) : null,
        audience_count: Number(r.audience_count) || 0,
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
        <Pressable style={[styles.createBtn, {backgroundColor: colors.primary}]} onPress={() => navigation.navigate('CampaignForm', {})}>
          <Text style={styles.createBtnText}>+ New Campaign</Text>
        </Pressable>
      }
      ListEmptyComponent={<View style={styles.center}><Text style={[styles.empty, {color: colors.textSecondary}]}>No campaigns</Text></View>}
      renderItem={({item}) => (
        <Pressable style={[styles.card, {backgroundColor: colors.surface}]} onPress={() => navigation.navigate('CampaignDetail', {campaignId: item.id})}>
          <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{item.title}</Text>
          <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.channel} · {item.audience_count} recipients</Text>
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
  cardTitle: {fontSize: 15, fontWeight: '600'},
  cardSub: {fontSize: 13, marginTop: 2},
  cardStatus: {fontSize: 11, fontWeight: '600', marginTop: 6, textTransform: 'uppercase'},
});
