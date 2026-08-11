/**
 * ReferralListScreen — list referrals with status filter.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {query} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';
import {
  Button,
  Card,
  EmptyState,
  ListRow,
  LoadingState,
  Screen,
  UrgencyBadge,
  Badge,
} from '../components/ui';
import {useTheme} from '../theme/useTheme';
import {space} from '../theme/tokens';

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
  const {colors} = useTheme();
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
    return (
      <Screen>
        <LoadingState message="Loading referrals…" />
      </Screen>
    );
  }

  return (
    <FlatList
      style={[styles.container, {backgroundColor: colors.background}]}
      data={rows}
      keyExtractor={item => item.id}
      refreshing={refreshing}
      onRefresh={() => { setRefreshing(true); loadData(); }}
      ListHeaderComponent={
        <View style={styles.headerActions}>
          <Button
            label="New Referral"
            icon="plus"
            onPress={() => navigation.navigate('ReferralCreate')}
          />
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="fileText"
          title="No referrals"
          message="Referrals will appear here once created."
        />
      }
      renderItem={({item}) => (
        <Card
          onPress={() => navigation.navigate('ReferralDetail', {referralId: item.id})}
          style={styles.card}
          accessibilityLabel={`Referral for ${item.patient_name}. ${item.referral_reason}. Status: ${item.status}.`}>
          <View style={styles.cardHeader}>
            <UrgencyBadge value={item.urgency} size="sm" />
            <Badge label={item.status} tone="neutral" size="sm" />
          </View>
          <ListRow
            title={item.patient_name}
            subtitle={item.referral_reason}
            meta={`To: ${item.destination_facility || '—'}`}
            icon="share"
            hideChevron
            style={styles.innerRow}
          />
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  headerActions: {flexDirection: 'row', gap: space[2], padding: space[4]},
  card: {marginHorizontal: space[4], marginVertical: space[2]},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[2], gap: space[2]},
  innerRow: {marginBottom: 0, borderWidth: 0, backgroundColor: 'transparent', elevation: 0, shadowOpacity: 0},
});
