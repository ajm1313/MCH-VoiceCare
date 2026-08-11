/**
 * AuditListScreen — list audit events from API with local DB fallback.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {FlatList, StyleSheet, View} from 'react-native';

import {useAuthStore} from '../core/auth/authStore';
import {AppConfig} from '../config/appConfig';
import {query} from '../core/db/database';
import {apiFetch} from '../core/security/secureFetch';
import {useTheme} from '../theme/useTheme';
import {space} from '../theme/tokens';
import {
  AppText,
  Card,
  EmptyState,
  Icon,
  LoadingState,
  Screen,
  SectionHeader,
} from '../components/ui';

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
  const {colors} = useTheme();
  const {token} = useAuthStore();
  const [apiRows, setApiRows] = useState<ApiAuditEvent[]>([]);
  const [localRows, setLocalRows] = useState<LocalAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [useApi, setUseApi] = useState(true);

  const loadData = useCallback(async () => {
    if (useApi) {
      try {
        const resp = await apiFetch(`${AppConfig.apiBaseUrl}/audit/events/`, {
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

  if (loading) {
    return (
      <Screen>
        <LoadingState message="Loading audit events…" />
      </Screen>
    );
  }

  if (useApi) {
    return (
      <Screen scroll={false} padded={false}>
        <SectionHeader
          title="Audit Log"
          overline="Compliance"
          subtitle="System audit events from the server."
          style={styles.header}
        />
        <FlatList
          style={styles.flex}
          data={apiRows}
          keyExtractor={item => item.id}
          refreshing={refreshing}
          onRefresh={() => { setRefreshing(true); loadData(); }}
          ListEmptyComponent={
            <EmptyState
              icon="clipboard"
              title="No audit events"
              message="Audit events will appear here once recorded."
            />
          }
          renderItem={({item}) => (
            <Card style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.titleRow}>
                  <Icon name="clipboard" size={16} color={colors.primary} />
                  <AppText variant="bodyStrong">{item.event_type}</AppText>
                </View>
                <AppText variant="caption" tone="tertiary">{item.occurred_at}</AppText>
              </View>
              <AppText variant="small" tone="secondary">
                by {item.actor_name ?? 'System'}
              </AppText>
              {item.subject_model ? (
                <AppText variant="small" tone="secondary">
                  {item.subject_model}: {item.subject_id ?? '—'}
                </AppText>
              ) : null}
              {item.summary ? (
                <AppText variant="small" tone="secondary" style={styles.summary}>
                  {item.summary}
                </AppText>
              ) : null}
            </Card>
          )}
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <SectionHeader
        title="Audit Log"
        overline="Compliance · Offline"
        subtitle="Local audit events (server unavailable)."
        style={styles.header}
      />
      <FlatList
        style={styles.flex}
        data={localRows}
        keyExtractor={item => item.id}
        refreshing={refreshing}
        onRefresh={() => { setRefreshing(true); loadData(); }}
        ListEmptyComponent={
          <EmptyState
            icon="clipboard"
            title="No audit events"
            message="Local audit events will appear here once recorded."
          />
        }
        renderItem={({item}) => (
          <Card style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.titleRow}>
                <Icon name="clipboard" size={16} color={colors.primary} />
                <AppText variant="bodyStrong">{item.action}</AppText>
              </View>
              <AppText variant="caption" tone="tertiary">{item.timestamp}</AppText>
            </View>
            <AppText variant="small" tone="secondary">
              by {item.actor}
            </AppText>
            {item.entity_type ? (
              <AppText variant="small" tone="secondary">
                {item.entity_type}: {item.entity_id ?? '—'}
              </AppText>
            ) : null}
          </Card>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  header: {paddingHorizontal: space[4], marginBottom: space[2]},
  card: {marginHorizontal: space[4], marginVertical: space[1]},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space[1]},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: space[2]},
  summary: {marginTop: space[1]},
});
