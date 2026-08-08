/**
 * CampaignDetailScreen — campaign detail with logs, approve/cancel actions.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'CampaignDetail'>;

type LogRow = { id: string; recipient: string; channel: string; status: string; sent_at: string | null };

export function CampaignDetailScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const {campaignId} = route.params;

  const [item, setItem] = useState<Record<string, any> | null>(null);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(() => {
    try {
      const cRows = query('SELECT * FROM communication_campaigns WHERE id = ?', [campaignId]);
      if (cRows.length > 0) setItem(cRows[0] as any);

      const lRows = query('SELECT id, recipient, channel, status, sent_at FROM communication_logs WHERE campaign_id = ? ORDER BY sent_at DESC LIMIT 50', [campaignId]);
      setLogs(lRows.map((r: any) => ({
        id: String(r.id),
        recipient: String(r.recipient || ''),
        channel: String(r.channel || ''),
        status: String(r.status || 'PENDING'),
        sent_at: r.sent_at ? String(r.sent_at) : null,
      })));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [campaignId]);

  useEffect(() => { loadData(); }, [loadData]);

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
          <>
            <View style={[styles.card, {backgroundColor: colors.surface}]}>
              <Text style={[styles.title, {color: colors.textPrimary}]}>{String(item.title)}</Text>
              <InfoRow label="Channel" value={String(item.channel)} colors={colors} />
              <InfoRow label="Status" value={String(item.status)} colors={colors} />
              <InfoRow label="Template" value={String(item.template_name ?? '—')} colors={colors} />
              <InfoRow label="Audience" value={String(item.audience_count ?? 0)} colors={colors} />
              <InfoRow label="Created" value={String(item.created_at)} colors={colors} />
              {item.scheduled_at && <InfoRow label="Scheduled" value={String(item.scheduled_at)} colors={colors} />}

              {(String(item.status) === 'DRAFT' || String(item.status) === 'APPROVED') && (
                <View style={styles.actions}>
                  {String(item.status) === 'DRAFT' && (
                    <Pressable style={[styles.actionBtn, {backgroundColor: colors.primary}]} onPress={() => {
                      Alert.alert('Approve Campaign', 'Approve this campaign for sending?', [
                        {text: 'Cancel', style: 'cancel'},
                        {text: 'Approve', onPress: () => {
                          const db = getDb();
                          db.execute('UPDATE communication_campaigns SET status = ?, sync_status = ? WHERE id = ?', ['APPROVED', 'NOT_SYNCED', campaignId]);
                          loadData();
                        }},
                      ]);
                    }}>
                      <Text style={styles.actionBtnText}>Approve</Text>
                    </Pressable>
                  )}
                  {String(item.status) === 'APPROVED' && (
                    <Pressable style={[styles.actionBtn, {backgroundColor: '#dc2626'}]} onPress={() => {
                      Alert.alert('Cancel Campaign', 'Cancel this approved campaign?', [
                        {text: 'No', style: 'cancel'},
                        {text: 'Yes, Cancel', style: 'destructive', onPress: () => {
                          const db = getDb();
                          db.execute('UPDATE communication_campaigns SET status = ?, sync_status = ? WHERE id = ?', ['CANCELLED', 'NOT_SYNCED', campaignId]);
                          loadData();
                        }},
                      ]);
                    }}>
                      <Text style={styles.actionBtnText}>Cancel Campaign</Text>
                    </Pressable>
                  )}
                </View>
              )}

              <View style={[styles.actions, {marginTop: 8}]}>
                {['DRAFT', 'SCHEDULED', 'APPROVED'].includes(String(item.status)) && (
                  <Pressable style={[styles.actionBtn, {borderColor: colors.primary, borderWidth: 1}]} onPress={() => navigation.navigate('CampaignForm', {campaignId})}>
                    <Text style={[styles.actionBtnText, {color: colors.primary}]}>Edit</Text>
                  </Pressable>
                )}
                {String(item.status) !== 'COMPLETED' && String(item.status) !== 'CANCELLED' && (
                  <Pressable style={[styles.actionBtn, {borderColor: '#dc2626', borderWidth: 1}]} onPress={() => {
                    Alert.alert('Delete Campaign', 'Permanently delete this campaign?', [
                      {text: 'Cancel', style: 'cancel'},
                      {text: 'Delete', style: 'destructive', onPress: () => {
                        const db = getDb();
                        db.execute('DELETE FROM communication_campaigns WHERE id = ?', [campaignId]);
                        navigation.goBack();
                      }},
                    ]);
                  }}>
                    <Text style={[styles.actionBtnText, {color: '#dc2626'}]}>Delete</Text>
                  </Pressable>
                )}
              </View>
            </View>
            <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Delivery Logs ({logs.length})</Text>
            {logs.length === 0 ? (
              <Text style={[styles.empty, {color: colors.textSecondary}]}>No logs yet</Text>
            ) : (
              logs.map(l => (
                <View key={l.id} style={[styles.logCard, {backgroundColor: colors.surface}]}>
                  <Text style={[styles.logRecipient, {color: colors.textPrimary}]}>{l.recipient}</Text>
                  <Text style={[styles.logSub, {color: colors.textSecondary}]}>{l.channel} · {l.status}</Text>
                  {l.sent_at && <Text style={[styles.logSub, {color: colors.textSecondary}]}>Sent: {l.sent_at}</Text>}
                </View>
              ))
            )}
          </>
        ) : (
          <Text style={[styles.empty, {color: colors.textSecondary}]}>Campaign not found</Text>
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
  title: {fontSize: 18, fontWeight: '700', marginBottom: 10},
  infoRow: {paddingVertical: 4},
  infoLabel: {fontSize: 11, textTransform: 'uppercase', fontWeight: '600'},
  infoValue: {fontSize: 15, fontWeight: '500', marginTop: 2},
  sectionTitle: {fontSize: 16, fontWeight: '700', marginTop: 8},
  actions: {flexDirection: 'row', gap: 8, marginTop: 16},
  actionBtn: {paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, alignItems: 'center'},
  actionBtnText: {color: '#fff', fontWeight: '700', fontSize: 14},
  empty: {fontSize: 14, paddingVertical: 16},
  logCard: {borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E2E8F0'},
  logRecipient: {fontSize: 14, fontWeight: '600'},
  logSub: {fontSize: 12, marginTop: 2},
});
