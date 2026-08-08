/**
 * TemplateListScreen — list message templates.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

type Template = {
  id: string;
  name: string;
  channel: string;
  language: string;
  status: string;
  content: string;
};

export function TemplateListScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();

  const [rows, setRows] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const result = query('SELECT id, name, channel, language, status, content FROM message_templates ORDER BY name');
      setRows(result.map((r: any) => ({
        id: String(r.id),
        name: String(r.name || ''),
        channel: String(r.channel || 'SMS'),
        language: String(r.language || 'en'),
        status: String(r.status || 'DRAFT'),
        content: String(r.content || ''),
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
        <Pressable style={[styles.createBtn, {backgroundColor: colors.primary}]} onPress={() => navigation.navigate('TemplateForm', {})}>
          <Text style={styles.createBtnText}>+ New Template</Text>
        </Pressable>
      }
      ListEmptyComponent={<View style={styles.center}><Text style={[styles.empty, {color: colors.textSecondary}]}>No templates</Text></View>}
      renderItem={({item}) => (
        <Pressable style={[styles.card, {backgroundColor: colors.surface}]} onPress={() => navigation.navigate('TemplateDetail', {templateId: item.id})}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{item.name}</Text>
            <Text style={[styles.cardStatus, {color: colors.textSecondary}]}>{item.status}</Text>
          </View>
          <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.channel} · {item.language}</Text>
          <Text style={[styles.cardContent, {color: colors.textPrimary}]} numberOfLines={3}>{item.content}</Text>
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
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  cardTitle: {fontSize: 15, fontWeight: '600'},
  cardStatus: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase'},
  cardSub: {fontSize: 12, marginTop: 4},
  cardContent: {fontSize: 13, marginTop: 8, lineHeight: 18},
});
