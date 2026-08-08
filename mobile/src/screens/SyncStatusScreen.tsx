/**
 * Sync status screen — OFF-007 / SYNC-007.
 *
 * Shows last successful sync time, queue size, unresolved conflicts,
 * and per-record sync statuses. Also shows rule package version (OFF-010).
 */
import React, {useEffect, useState} from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {getQueueDepth} from '../core/sync/outbox';
import {
  subscribeToSyncDepth,
  syncFull,
  getLastSyncAt,
  getLastSyncResult,
} from '../core/sync/engine';
import {checkRulePackageStatus} from '../core/rules/rulePackage';
import {brand, urgency, lightColors} from '../theme/colors';

export function SyncStatusScreen() {
  const [queueDepth, setQueueDepth] = useState(getQueueDepth());
  const [lastSync, setLastSync] = useState(getLastSyncAt());
  const [syncResult, setSyncResult] = useState(getLastSyncResult());
  const [isSyncing, setIsSyncing] = useState(false);
  const ruleStatus = checkRulePackageStatus();

  useEffect(() => {
    const unsub = subscribeToSyncDepth(setQueueDepth);
    return unsub;
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      await syncFull();
      setLastSync(getLastSyncAt());
      setSyncResult(getLastSyncResult());
      setQueueDepth(getQueueDepth());
    } finally {
      setIsSyncing(false);
    }
  };

  const formatTime = (iso: string | null): string => {
    if (!iso) return 'Never';
    try {
      const d = new Date(iso);
      return d.toLocaleString();
    } catch {
      return iso;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Synchronisation Status</Text>

        <View style={styles.section}>
          <View style={styles.row}>
            <Text style={styles.label}>Last sync</Text>
            <Text style={styles.value}>{formatTime(lastSync)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Pending records</Text>
            <Text style={[styles.value, queueDepth > 0 && styles.warning]}>
              {queueDepth}
            </Text>
          </View>
          {syncResult && (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>Last pushed (synced)</Text>
                <Text style={styles.value}>{syncResult.synced}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Last pushed (failed)</Text>
                <Text style={[styles.value, syncResult.failed > 0 && styles.error]}>
                  {syncResult.failed}
                </Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Last pulled</Text>
                <Text style={styles.value}>{syncResult.pulled}</Text>
              </View>
            </>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rule Package (OFF-010)</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Version</Text>
            <Text style={styles.value}>{ruleStatus.version ?? 'Not cached'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <Text style={[styles.value, ruleStatus.isExpired ? styles.warning : styles.success]}>
              {ruleStatus.isValid ? (ruleStatus.isExpired ? 'Expired' : 'Valid') : 'Missing'}
            </Text>
          </View>
          {ruleStatus.warning && (
            <Text style={styles.warningText}>{ruleStatus.warning}</Text>
          )}
        </View>

        <Pressable
          style={[styles.syncButton, isSyncing && styles.syncButtonDisabled]}
          onPress={handleSync}
          disabled={isSyncing}>
          <Text style={styles.syncButtonText}>
            {isSyncing ? 'Syncing…' : 'Sync now'}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: lightColors.background},
  content: {padding: 16},
  title: {fontSize: 22, fontWeight: '700', color: lightColors.textPrimary, marginBottom: 16},
  section: {
    backgroundColor: lightColors.surface,
    borderWidth: 1,
    borderColor: lightColors.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {fontSize: 16, fontWeight: '700', color: lightColors.textPrimary, marginBottom: 8},
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  label: {fontSize: 14, color: lightColors.textSecondary},
  value: {fontSize: 14, fontWeight: '600', color: lightColors.textPrimary},
  warning: {color: urgency.AMBER},
  error: {color: urgency.RED},
  success: {color: urgency.GREEN},
  warningText: {fontSize: 13, color: urgency.ORANGE, marginTop: 8, fontWeight: '500'},
  syncButton: {
    backgroundColor: brand.teal,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  syncButtonDisabled: {opacity: 0.5},
  syncButtonText: {fontSize: 16, fontWeight: '700', color: '#fff'},
});
