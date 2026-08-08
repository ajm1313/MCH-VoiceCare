/**
 * MonitoringScreen — displays system health and monitoring information.
 *
 * Fetches GET /api/v1/monitoring/health/ which returns database health,
 * queue depth, active connections, and system status indicators.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {AppConfig} from '../config/appConfig';
import {useAuthStore} from '../core/auth/authStore';
import {getQueueDepth} from '../core/sync/outbox';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Monitoring'>;

interface HealthResponse {
  status: string;
  database: { connected: boolean; size_bytes?: number };
  queues: { sync_outbox_depth: number };
  active_users: number;
  uptime_seconds?: number;
  version?: string;
}

export function MonitoringScreen({navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const localQueueDepth = getQueueDepth();

  const fetchHealth = useCallback(async () => {
    const { token } = useAuthStore.getState();
    if (!token) {
      setError('Not authenticated');
      setLoading(false);
      setRefreshing(false);
      return;
    }
    try {
      const resp = await fetch(`${AppConfig.apiBaseUrl}/monitoring/health/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        setError(`HTTP ${resp.status}`);
        setHealth(null);
      } else {
        const data = (await resp.json()) as HealthResponse;
        setHealth(data);
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setHealth(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  if (loading) {
    return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, {color: colors.textPrimary}]}>System Health</Text>
      </View>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchHealth(); }} colors={[colors.primary]} />}>
        {error && (
          <View style={[styles.card, {backgroundColor: colors.surface, borderColor: '#FECACA'}]}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {health && (
          <>
            <View style={[styles.card, {backgroundColor: colors.surface}]}>
              <View style={styles.row}>
                <Text style={[styles.label, {color: colors.textSecondary}]}>Server Status</Text>
                <View style={[styles.statusDot, {backgroundColor: health.status === 'healthy' ? '#22C55E' : '#EF4444'}]} />
                <Text style={[styles.value, {color: colors.textPrimary}]}>{health.status}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, {color: colors.textSecondary}]}>Database</Text>
                <Text style={[styles.value, {color: colors.textPrimary}]}>{health.database?.connected ? 'Connected' : 'Disconnected'}</Text>
              </View>
              {health.version && (
                <View style={styles.row}>
                  <Text style={[styles.label, {color: colors.textSecondary}]}>Backend Version</Text>
                  <Text style={[styles.value, {color: colors.textPrimary}]}>{health.version}</Text>
                </View>
              )}
              {health.uptime_seconds != null && (
                <View style={styles.row}>
                  <Text style={[styles.label, {color: colors.textSecondary}]}>Uptime</Text>
                  <Text style={[styles.value, {color: colors.textPrimary}]}>{Math.floor(health.uptime_seconds / 3600)}h {Math.floor((health.uptime_seconds % 3600) / 60)}m</Text>
                </View>
              )}
              <View style={styles.row}>
                <Text style={[styles.label, {color: colors.textSecondary}]}>Active Users</Text>
                <Text style={[styles.value, {color: colors.textPrimary}]}>{health.active_users}</Text>
              </View>
            </View>

            <View style={[styles.card, {backgroundColor: colors.surface}]}>
              <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>Sync Queue</Text>
              <View style={styles.row}>
                <Text style={[styles.label, {color: colors.textSecondary}]}>Server Outbox Depth</Text>
                <Text style={[styles.value, {color: colors.textPrimary}]}>{health.queues?.sync_outbox_depth ?? '—'}</Text>
              </View>
              <View style={styles.row}>
                <Text style={[styles.label, {color: colors.textSecondary}]}>Local Outbox Depth</Text>
                <Text style={[styles.value, {color: colors.textPrimary}]}>{localQueueDepth}</Text>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12},
  back: {fontSize: 16},
  title: {fontSize: 18, fontWeight: '700'},
  content: {padding: 16, gap: 12},
  card: {borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 8},
  cardTitle: {fontSize: 16, fontWeight: '700', marginBottom: 4},
  row: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4},
  label: {fontSize: 13, fontWeight: '500', flex: 1},
  value: {fontSize: 14, fontWeight: '600'},
  statusDot: {width: 8, height: 8, borderRadius: 4},
  errorText: {color: '#DC2626', fontSize: 14},
});
