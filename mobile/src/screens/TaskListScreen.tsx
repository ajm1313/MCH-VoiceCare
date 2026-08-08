/**
 * TaskListScreen — shows open notifications and action items.
 * MCHVC-SPEC-001 v1.1 §49. Offline-first (DEC-007).
 */
import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';

import {darkColors, lightColors, urgency} from '../theme/colors';
import {query} from '../core/db/database';
import {getCachedWorklist} from '../core/sync/worklistSync';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../core/navigation/types';

type TaskRow = {
  id: string;
  title: string;
  notification_class: string;
  status: string;
  due_datetime: string | null;
  urgency: string;
};

export function TaskListScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
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

  const urgencyColor = (cls: string) => {
    switch (cls) {
      case 'RED': return urgency.RED;
      case 'ORANGE': return urgency.ORANGE;
      case 'AMBER': return urgency.AMBER;
      case 'GREEN': return urgency.GREEN;
      default: return urgency.GREY;
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, {backgroundColor: colors.background}]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <FlatList
      style={[styles.container, {backgroundColor: colors.background}]}
      data={rows}
      keyExtractor={item => item.id}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            loadData();
          }}
          colors={[colors.primary]}
        />
      }
      ListHeaderComponent={
        worklistItems && worklistItems.length > 0 ? (
          <View style={styles.worklistSection}>
            <Text style={[styles.worklistTitle, {color: colors.textPrimary}]}>
              My Worklist
            </Text>
            {worklistItems.map((wl, i) => (
              <Pressable
                key={wl.id}
                style={[styles.worklistCard, {backgroundColor: colors.surface}]}
                onPress={() => {
                  if (wl.action_url) {
                    navigation.navigate('NotificationDetail' as any, {notificationId: wl.entity_id});
                  }
                }}>
                <View style={styles.cardHeader}>
                  <View style={[styles.badge, {backgroundColor: urgencyColor(wl.urgency)}]}>
                    <Text style={styles.badgeText}>{wl.urgency}</Text>
                  </View>
                  <Text style={[styles.status, {color: colors.textSecondary}]}>
                    {wl.action_label}
                  </Text>
                </View>
                <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>
                  {wl.subject_name}
                </Text>
                <Text style={[styles.cardSub, {color: colors.textSecondary}]}>
                  {wl.entity_type}
                  {wl.due_at ? `  ·  Due: ${wl.due_at}` : ''}
                </Text>
              </Pressable>
            ))}
            <Text style={[styles.worklistDivider, {color: colors.textSecondary}]}>
              All Notifications
            </Text>
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={[styles.empty, {color: colors.textSecondary}]}>
            No open tasks
          </Text>
        </View>
      }
      renderItem={({item}) => (
        <Pressable
          style={[styles.card, {backgroundColor: colors.surface}]}
          onPress={() => navigation.navigate('NotificationDetail', {notificationId: item.id})}>
          <View style={styles.cardHeader}>
            <View style={[styles.badge, {backgroundColor: urgencyColor(item.urgency)}]}>
              <Text style={styles.badgeText}>{item.urgency}</Text>
            </View>
            <Text style={[styles.status, {color: colors.textSecondary}]}>
              {item.status}
            </Text>
          </View>
          <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>
            {item.title}
          </Text>
          <Text style={[styles.cardSub, {color: colors.textSecondary}]}>
            {item.notification_class}
            {item.due_datetime ? `  ·  Due: ${item.due_datetime}` : ''}
          </Text>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  empty: {fontSize: 14},
  card: {marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8},
  cardTitle: {fontSize: 15, fontWeight: '600'},
  cardSub: {fontSize: 12, marginTop: 4},
  badge: {paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  badgeText: {color: '#fff', fontSize: 11, fontWeight: '700'},
  status: {fontSize: 11, fontWeight: '600'},
  worklistSection: {paddingHorizontal: 16, paddingTop: 16},
  worklistTitle: {fontSize: 16, fontWeight: '700', marginBottom: 8},
  worklistCard: {marginVertical: 6, padding: 16, borderRadius: 12},
  worklistDivider: {fontSize: 14, fontWeight: '600', marginTop: 16, marginBottom: 4},
});
