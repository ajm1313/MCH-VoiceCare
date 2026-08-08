/**
 * IntegrationListScreen — list integration configs.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Config = { id: string; config_type: string; provider_name: string; status: string; base_url: string | null };

export function IntegrationListScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();
  const [rows, setRows] = useState<Config[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const result = query('SELECT id, config_type, provider_name, status, base_url FROM integration_configs ORDER BY provider_name');
      setRows(result.map((r: any) => ({
        id: String(r.id), config_type: String(r.config_type || ''),
        provider_name: String(r.provider_name || ''), status: String(r.status || 'ACTIVE'),
        base_url: r.base_url ? String(r.base_url) : null,
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
        <Pressable style={[styles.createBtn, {backgroundColor: colors.primary}]} onPress={() => navigation.navigate('IntegrationForm', {})}>
          <Text style={styles.createBtnText}>+ New Integration</Text>
        </Pressable>
      }
      ListEmptyComponent={<View style={styles.center}><Text style={[styles.empty, {color: colors.textSecondary}]}>No integrations configured</Text></View>}
      renderItem={({item}) => (
        <Pressable style={[styles.card, {backgroundColor: colors.surface}]} onPress={() => navigation.navigate('IntegrationForm', {integrationId: item.id})}>
          <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{item.provider_name}</Text>
          <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.config_type}{item.base_url ? ` · ${item.base_url}` : ''}</Text>
          <Text style={[styles.cardStatus, {color: colors.textSecondary}]}>{item.status}</Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {flex: 1}, center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}, empty: {fontSize: 14},
  card: {marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12},
  createBtn: {margin: 16, padding: 14, borderRadius: 12, alignItems: 'center'},
  createBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},
  cardTitle: {fontSize: 15, fontWeight: '600'}, cardSub: {fontSize: 13, marginTop: 2}, cardStatus: {fontSize: 11, fontWeight: '600', marginTop: 6, textTransform: 'uppercase'},
});
