/**
 * PersonDetailScreen — person detail view.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query} from '../core/db/database';
import {logLocalAudit} from '../core/utils/audit';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PersonDetail'>;

export function PersonDetailScreen({route}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation();
  const {personId} = route.params;

  const [item, setItem] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const rows = query('SELECT * FROM persons WHERE id = ?', [personId]);
      if (rows.length > 0) setItem(rows[0] as any);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [personId]);

  useEffect(() => {
    loadData();
    logLocalAudit({
      action: 'PATIENT_VIEW',
      entityType: 'person',
      entityId: personId,
      patientId: personId,
    });
  }, [loadData, personId]);

  if (loading) {
    return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Text style={[styles.back, {color: colors.primary}]} onPress={() => navigation.goBack()}>‹ Back</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />}>
        {item ? (
          <View style={[styles.card, {backgroundColor: colors.surface}]}>
            <Text style={[styles.title, {color: colors.textPrimary}]}>{String(item.full_name)}</Text>
            <InfoRow label="Date of Birth" value={String(item.date_of_birth ?? '—')} colors={colors} />
            <InfoRow label="Gender" value={String(item.gender ?? '—')} colors={colors} />
            <InfoRow label="Phone" value={String(item.phone ?? '—')} colors={colors} />
            <InfoRow label="Sync Status" value={String(item.sync_status ?? '—')} colors={colors} />
          </View>
        ) : (
          <Text style={[styles.empty, {color: colors.textSecondary}]}>Person not found</Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({label, value, colors}: {label: string; value: string; colors: typeof lightColors}) {
  return (
    <View style={styles.infoRow}>
      <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>{label}</Text>
      <Text style={[styles.infoValue, {color: colors.textPrimary}]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  header: {paddingHorizontal: 16, paddingVertical: 12},
  back: {fontSize: 16},
  content: {padding: 16, gap: 12},
  card: {borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E2E8F0'},
  title: {fontSize: 20, fontWeight: '700', marginBottom: 12},
  infoRow: {paddingVertical: 6},
  infoLabel: {fontSize: 11, textTransform: 'uppercase', fontWeight: '600'},
  infoValue: {fontSize: 15, fontWeight: '500', marginTop: 2},
  empty: {fontSize: 14, textAlign: 'center', paddingVertical: 32},
});
