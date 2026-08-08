/**
 * ProfileDetailScreen — pregnancy profile detail with finalise action.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors, urgency} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'ProfileDetail'>;

export function ProfileDetailScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const {profileId} = route.params;

  const [item, setItem] = useState<Record<string, any> | null>(null);
  const [profileData, setProfileData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const rows = query('SELECT * FROM pregnancy_profiles WHERE id = ?', [profileId]);
      if (rows.length > 0) {
        const r = rows[0] as any;
        setItem(r);
        try { setProfileData(JSON.parse(String(r.profile_data || '{}'))); } catch { /* */ }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [profileId]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleFinalise = () => {
    Alert.alert('Finalise Profile', 'Once finalised, the profile cannot be edited. Continue?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Finalise',
        onPress: () => {
          const db = getDb();
          db.execute(
            "UPDATE pregnancy_profiles SET status = 'FINALISED', finalised_at = ? WHERE id = ?",
            [new Date().toISOString(), profileId],
          );
          setItem(prev => prev ? {...prev, status: 'FINALISED'} : prev);
        },
      },
    ]);
  };

  if (loading) {
    return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;
  }

  const riskColor = item ? urgency[item.risk_level as keyof typeof urgency] || urgency.GREY : urgency.GREY;

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
        </Pressable>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />}>
        {item ? (
          <>
            <View style={[styles.card, {backgroundColor: colors.surface}]}>
              <View style={styles.badgeRow}>
                <View style={[styles.badge, {backgroundColor: riskColor}]}>
                  <Text style={styles.badgeText}>{String(item.risk_level)}</Text>
                </View>
                <Text style={[styles.status, {color: colors.textSecondary}]}>{String(item.status)}</Text>
              </View>
              <Text style={[styles.title, {color: colors.textPrimary}]}>{String(item.woman_name)}</Text>
              <Text style={[styles.sub, {color: colors.textSecondary}]}>{String(item.profile_month || 'No month')}</Text>
            </View>
            <View style={[styles.card, {backgroundColor: colors.surface}]}>
              <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>Profile Data</Text>
              {Object.keys(profileData).length === 0 ? (
                <Text style={[styles.empty, {color: colors.textSecondary}]}>No profile data available</Text>
              ) : (
                Object.entries(profileData).map(([k, v]) => (
                  <View key={k} style={styles.infoRow}>
                    <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>{k.replace(/_/g, ' ')}</Text>
                    <Text style={[styles.infoValue, {color: colors.textPrimary}]}>{String(v)}</Text>
                  </View>
                ))
              )}
            </View>
            <View style={[styles.card, {backgroundColor: colors.surface}]}>
              <InfoRow label="Generated" value={String(item.generated_at ?? '—')} colors={colors} />
              <InfoRow label="Finalised" value={String(item.finalised_at ?? '—')} colors={colors} />
            </View>
            {item.status === 'DRAFT' && (
              <Pressable style={[styles.finaliseButton, {backgroundColor: colors.primary}]} onPress={handleFinalise}>
                <Text style={styles.finaliseButtonText}>Finalise Profile</Text>
              </Pressable>
            )}
          </>
        ) : (
          <Text style={[styles.empty, {color: colors.textSecondary}]}>Profile not found</Text>
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
  cardTitle: {fontSize: 14, fontWeight: '700', marginBottom: 10},
  badgeRow: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  badgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},
  status: {fontSize: 11, fontWeight: '600'},
  title: {fontSize: 18, fontWeight: '700'},
  sub: {fontSize: 13, marginTop: 2},
  infoRow: {paddingVertical: 6},
  infoLabel: {fontSize: 11, textTransform: 'uppercase', fontWeight: '600'},
  infoValue: {fontSize: 15, fontWeight: '500', marginTop: 2},
  finaliseButton: {padding: 14, borderRadius: 12, alignItems: 'center'},
  finaliseButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  empty: {fontSize: 14, paddingVertical: 16},
});
