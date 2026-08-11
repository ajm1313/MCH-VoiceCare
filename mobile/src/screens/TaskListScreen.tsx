/**
 * TaskListScreen — shows open notifications and action items.
 * MCHVC-SPEC-001 v1.1 §49. Offline-first (DEC-007).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';

import {query} from '../core/db/database';
import {getCachedWorklist} from '../core/sync/worklistSync';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../core/navigation/types';
import {
  Card,
  EmptyState,
  ListRow,
  LoadingState,
  Screen,
  SectionHeader,
  UrgencyBadge,
  Badge,
} from '../components/ui';
import {useTheme} from '../theme/useTheme';
import {space} from '../theme/tokens';

type TaskRow = {
  id: string;
  title: string;
  notification_class: string;
  status: string;
  due_datetime: string | null;
  urgency: string;
};

export function TaskListScreen() {
  const {colors} = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [rows, setRows] = useState<TaskRow[]>([]);
  const [worklistItems, setWorklistItems] = useState(getCachedWorklist());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const result = query(
        `SELECT id, title, notification_class, status, due_datetime, urgency
         FROM notifications
         WHERE status IN ('OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS', 'OVERDUE')
         ORDER BY
           CASE urgency
             WHEN 'RED' THEN 0
             WHEN 'ORANGE' THEN 1
             WHEN 'AMBER' THEN 2
             WHEN 'GREY' THEN 3
             ELSE 4
           END,
           due_datetime`,
      );
      const items: TaskRow[] = result.map((r: any) => ({
        id: String(r.id),
        title: String(r.title || ''),
        notification_class: String(r.notification_class || ''),
        status: String(r.status || 'OPEN'),
        due_datetime: r.due_datetime ? String(r.due_datetime) : null,
        urgency: String(r.urgency || 'GREY'),
      }));
      setRows(items);
      setWorklistItems(getCachedWorklist());
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading tasks…" />
      </Screen>
    );
  }

  return (
    <FlatList
      style={[styles.container, {backgroundColor: colors.background}]}
      data={rows}
      keyExtractor={item => item.id}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true);
        loadData();
      }}
      ListHeaderComponent={
        worklistItems && worklistItems.length > 0 ? (
          <View style={styles.worklistSection}>
            <SectionHeader title="My Worklist" />
            {worklistItems.map(wl => (
              <Card
                key={wl.id}
                onPress={() => {
                  if (wl.action_url) {
                    navigation.navigate('NotificationDetail' as any, {notificationId: wl.entity_id});
                  }
                }}
                style={styles.worklistCard}
                accessibilityLabel={`Worklist item: ${wl.subject_name}. ${wl.action_label}.`}>
                <View style={styles.cardHeader}>
                  <UrgencyBadge value={wl.urgency} size="sm" />
                  <Badge label={wl.action_label} tone="neutral" size="sm" />
                </View>
                <ListRow
                  title={wl.subject_name}
                  subtitle={wl.entity_type}
                  meta={wl.due_at ? `Due: ${wl.due_at}` : undefined}
                  icon="bell"
                  hideChevron
                  style={styles.innerRow}
                />
              </Card>
            ))}
            <SectionHeader title="All Notifications" style={styles.worklistDivider} />
          </View>
        ) : null
      }
      ListEmptyComponent={
        <EmptyState
          icon="checkCircle"
          title="No open tasks"
          message="All notifications have been addressed."
        />
      }
      renderItem={({item}) => (
        <Card
          onPress={() => navigation.navigate('NotificationDetail', {notificationId: item.id})}
          style={styles.card}
          accessibilityLabel={`Task: ${item.title}. ${item.notification_class}. Status: ${item.status}.`}>
          <View style={styles.cardHeader}>
            <UrgencyBadge value={item.urgency} size="sm" />
            <Badge label={item.status} tone="neutral" size="sm" />
          </View>
          <ListRow
            title={item.title}
            subtitle={item.notification_class}
            meta={item.due_datetime ? `Due: ${item.due_datetime}` : undefined}
            icon="clipboard"
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
  card: {marginHorizontal: space[4], marginVertical: space[2]},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[2], gap: space[2]},
  innerRow: {marginBottom: 0, borderWidth: 0, backgroundColor: 'transparent', elevation: 0, shadowOpacity: 0},
  worklistSection: {paddingHorizontal: space[4], paddingTop: space[4]},
  worklistCard: {marginVertical: space[2]},
  worklistDivider: {marginTop: space[4]},
});
