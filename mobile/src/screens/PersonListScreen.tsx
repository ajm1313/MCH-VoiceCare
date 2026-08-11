/**
 * PersonListScreen — list persons from local DB.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {query} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';
import {
  Button,
  EmptyState,
  ListRow,
  LoadingState,
  Screen,
} from '../components/ui';
import {useTheme} from '../theme/useTheme';
import {space} from '../theme/tokens';

type Person = {
  id: string;
  full_name: string;
  date_of_birth: string | null;
  gender: string | null;
  phone: string | null;
};

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function PersonListScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<Nav>();

  const [rows, setRows] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const result = query('SELECT id, full_name, date_of_birth, gender, phone FROM persons ORDER BY full_name');
      setRows(result.map((r: any) => ({
        id: String(r.id),
        full_name: String(r.full_name || ''),
        date_of_birth: r.date_of_birth ? String(r.date_of_birth) : null,
        gender: r.gender ? String(r.gender) : null,
        phone: r.phone ? String(r.phone) : null,
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
        <LoadingState message="Loading persons…" />
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
            label="New Person"
            icon="plus"
            onPress={() => navigation.navigate('PersonForm', {})}
          />
        </View>
      }
      ListEmptyComponent={
        <EmptyState
          icon="users"
          title="No persons registered"
          message="Persons will appear here once registered."
          action={{label: 'Register Person', onPress: () => navigation.navigate('PersonForm', {})}}
        />
      }
      renderItem={({item}) => (
        <ListRow
          title={item.full_name}
          subtitle={`${item.gender ?? '—'} · ${item.date_of_birth ?? 'DOB —'}`}
          meta={item.phone ?? undefined}
          icon="user"
          onPress={() => navigation.navigate('PersonDetail', {personId: item.id})}
          style={styles.row}
        />
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  headerActions: {flexDirection: 'row', gap: space[2], padding: space[4]},
  row: {marginHorizontal: space[4]},
});
