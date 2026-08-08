/**
 * AuditListScreen — list audit events from API with local DB fallback.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View, useColorScheme} from 'react-native';

import {darkColors, lightColors} from '../theme/colors';
import {useAuthStore} from '../core/auth/authStore';
import {AppConfig} from '../config/appConfig';
import {query} from '../core/db/database';

interface ApiAuditEvent {
  id: string;
  occurred_at: string;
  event_type: string;
  actor_name: string | null;
  subject_model: string | null;
  subject_id: string | null;
  summary: string;
}

type LocalAuditEvent = { id: string; actor: string; action: string; entity_type: string | null; entity_id: string | null; timestamp: string; details: string | null };

export function AuditListScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const {token} = useAuthStore();
  const [apiRows, setApiRows] = useState<ApiAuditEvent[]>([]);
  const [localRows, setLocalRows] = useState<LocalAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [useApi, setUseApi] = useState(true);

  const loadData = useCallback(async () => {
    if (useApi) {
      try {
        const resp = await fetch(`${AppConfig.apiBaseUrl}/audit/events/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          const events = Array.isArray(data) ? data : (data.results || []);
          setApiRows(events);
          setLoading(false);
          setRefreshing(false);
          return;
        }
      } catch {
        // Fall back to local DB
      }
    }
    setUseApi(false);
    try {
      const result = query('SELECT id, actor, action, entity_type, entity_id, timestamp, details FROM audit_events ORDER BY timestamp DESC LIMIT 200');
      setLocalRows(result.map((r: any) => ({
        id: String(r.id), actor: String(r.actor || ''), action: String(r.action || ''),
        entity_type: r.entity_type ? String(r.entity_type) : null, entity_id: r.entity_id ? String(r.entity_id) : null,
        timestamp: String(r.timestamp || ''), details: r.details ? String(r.details) : null,
      })));
    } finally { setLoading(false); setRefreshing(false); }
  }, [token, useApi]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;

  if (useApi) {
    return (
      <FlatList
        style={[styles.container, {backgroundColor: colors.background}]}
        data={apiRows} keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />}
        ListEmptyComponent={<View style={styles.center}><Text style={[styles.empty, {color: colors.textSecondary}]}>No audit events</Text></View>}
        renderItem={({item}) => (
          <View style={[styles.card, {backgroundColor: colors.surface}]}>
            <View style={styles.cardHeader}>
              <Text style={[styles.cardAction, {color: colors.textPrimary}]}>{item.event_type}</Text>
              <Text style={[styles.cardTime, {color: colors.textSecondary}]}>{item.occurred_at}</Text>
            </View>
            <Text style={[styles.cardActor, {color: colors.textSecondary}]}>by {item.actor_name ?? 'System'}</Text>
            {item.subject_model && <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.subject_model}: {item.subject_id ?? '—'}</Text>}
            {item.summary && <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.summary}</Text>}
          </View>
        )}
      />
    );
  }

  return (
    <FlatList
      style={[styles.container, {backgroundColor: colors.background}]}
      data={localRows} keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />}
      ListEmptyComponent={<View style={styles.center}><Text style={[styles.empty, {color: colors.textSecondary}]}>No audit events</Text></View>}
      renderItem={({item}) => (
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardAction, {color: colors.textPrimary}]}>{item.action}</Text>
            <Text style={[styles.cardTime, {color: colors.textSecondary}]}>{item.timestamp}</Text>
          </View>
          <Text style={[styles.cardActor, {color: colors.textSecondary}]}>by {item.actor}</Text>
          {item.entity_type && <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.entity_type}: {item.entity_id ?? '—'}</Text>}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {flex: 1}, center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}, empty: {fontSize: 14},
  card: {marginHorizontal: 16, marginVertical: 6, padding: 14, borderRadius: 12},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'},
  cardAction: {fontSize: 14, fontWeight: '600'},
  cardTime: {fontSize: 11},
  cardActor: {fontSize: 12, marginTop: 2},
  cardSub: {fontSize: 12, marginTop: 2},
});
