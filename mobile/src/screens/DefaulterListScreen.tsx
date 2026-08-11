/**
 * DefaulterListScreen — list immunisation defaulters.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {useTheme} from '../theme/useTheme';
import {query} from '../core/db/database';
import {
  Screen,
  Card,
  Badge,
  EmptyState,
  LoadingState,
  AppText,
  type BadgeTone,
} from '../components/ui';
import {space} from '../theme/tokens';
import type {RootStackParamList} from '../core/navigation/types';

type Defaulter = {
  id: string;
  child_name: string;
  days_overdue: number;
  defaulter_status: string;
  next_due_date: string | null;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function DefaulterListScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();

  const [rows, setRows] = useState<Defaulter[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const result = query(
        `SELECT d.id, d.child_name, d.days_overdue, d.defaulter_status, d.next_due_date
         FROM defaulter_episodes d
         WHERE d.defaulter_status = 'ACTIVE'
         ORDER BY d.days_overdue DESC`,
      );
      setRows(result.map((r: any) => ({
        id: String(r.id),
        child_name: String(r.child_name || ''),
        days_overdue: Number(r.days_overdue) || 0,
        defaulter_status: String(r.defaulter_status || 'ACTIVE'),
        next_due_date: r.next_due_date ? String(r.next_due_date) : null,
      })));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const overdueTone = (days: number): BadgeTone => {
    return days > 60 ? 'danger' : 'warning';
  };

  const overdueColor = (days: number): string => {
    return days > 60 ? colors.danger : colors.warning;
  };

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading defaulters…" />
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <FlatList
        data={rows}
        keyExtractor={item => item.id}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); loadData(); }}
        ListEmptyComponent={
          <EmptyState
            icon="checkCircle"
            title="No active defaulters"
            message="All children are up to date with their immunisations."
          />
        }
        renderItem={({item}) => (
          <Card
            onPress={() => navigation.navigate('DefaulterDetail', {defaulterId: item.id})}
            accentColor={overdueColor(item.days_overdue)}
            style={styles.card}
            accessibilityLabel={`${item.child_name}. ${item.days_overdue} days overdue`}>
            <View style={styles.cardHeader}>
              <AppText variant="bodyStrong" style={styles.flex}>{item.child_name}</AppText>
              <Badge
                label={`${item.days_overdue}d overdue`}
                tone={overdueTone(item.days_overdue)}
                size="sm"
                icon="alertTriangle"
                solid
              />
            </View>
            {item.next_due_date && (
              <AppText variant="small" tone="secondary" style={styles.cardSub}>
                Was due: {item.next_due_date}
              </AppText>
            )}
          </Card>
        )}
        contentContainerStyle={{padding: space[4], gap: space[2]}}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {marginBottom: space[2]},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space[2]},
  flex: {flex: 1},
  cardSub: {marginTop: space[1]},
});
