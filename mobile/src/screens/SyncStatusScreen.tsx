/**
 * Sync status screen — OFF-007 / SYNC-007.
 *
 * Shows last successful sync time, queue size, unresolved conflicts,
 * and per-record sync statuses. Also shows rule package version (OFF-010).
 */
import React, {useEffect, useState} from 'react';
import {StyleSheet, View} from 'react-native';

import {getQueueDepth} from '../core/sync/outbox';
import {
  subscribeToSyncDepth,
  syncFull,
  getLastSyncAt,
  getLastSyncResult,
} from '../core/sync/engine';
import {checkRulePackageStatus} from '../core/rules/rulePackage';
import {useTheme} from '../theme/useTheme';
import {space} from '../theme/tokens';
import {
  AppText,
  Badge,
  Button,
  Card,
  Icon,
  KeyValue,
  Screen,
  SectionHeader,
  StatCard,
} from '../components/ui';

export function SyncStatusScreen() {
  const {colors} = useTheme();
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
    <Screen scroll>
      <SectionHeader
        title="Synchronisation Status"
        overline="Offline-first"
        subtitle="Last sync time, pending queue, and rule package version."
      />

      {/* Stat tiles */}
      <View style={styles.statRow}>
        <StatCard
          label="Pending records"
          value={queueDepth}
          icon="refresh"
          accentColor={queueDepth > 0 ? colors.warning : colors.success}
          caption={queueDepth > 0 ? 'Awaiting sync' : 'All synced'}
        />
        <StatCard
          label="Last sync"
          value={lastSync ? 'Done' : 'Never'}
          icon="cloud"
          accentColor={colors.primary}
          caption={formatTime(lastSync)}
        />
      </View>

      {/* Sync result detail */}
      {syncResult && (
        <Card style={styles.sectionCard}>
          <AppText variant="smallStrong" tone="secondary" style={styles.cardHeading}>
            Last sync result
          </AppText>
          <KeyValue label="Pushed (synced)" value={syncResult.synced} />
          <KeyValue
            label="Pushed (failed)"
            value={syncResult.failed}
          />
          <KeyValue label="Pulled" value={syncResult.pulled} />
        </Card>
      )}

      {/* Rule package (OFF-010) */}
      <SectionHeader title="Rule Package" overline="OFF-010" />
      <Card style={styles.sectionCard}>
        <KeyValue label="Version" value={ruleStatus.version ?? 'Not cached'} />
        <KeyValue label="Status" value={undefined}>
          <Badge
            label={ruleStatus.isValid ? (ruleStatus.isExpired ? 'Expired' : 'Valid') : 'Missing'}
            tone={
              !ruleStatus.isValid
                ? 'danger'
                : ruleStatus.isExpired
                ? 'warning'
                : 'success'
            }
            icon={
              !ruleStatus.isValid
                ? 'alertCircle'
                : ruleStatus.isExpired
                ? 'alertTriangle'
                : 'checkCircle'
            }
          />
        </KeyValue>
        {ruleStatus.warning ? (
          <View style={styles.warningRow}>
            <Icon name="alertTriangle" size={14} color={colors.warning} />
            <AppText variant="small" tone="warning" style={styles.warningText}>
              {ruleStatus.warning}
            </AppText>
          </View>
        ) : null}
      </Card>

      <Button
        label={isSyncing ? 'Syncing…' : 'Sync now'}
        onPress={handleSync}
        loading={isSyncing}
        disabled={isSyncing}
        fullWidth
        icon="refresh"
        style={styles.syncBtn}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  statRow: {flexDirection: 'row', gap: space[3], marginBottom: space[4]},
  sectionCard: {marginBottom: space[4]},
  cardHeading: {marginBottom: space[2]},
  warningRow: {flexDirection: 'row', alignItems: 'flex-start', gap: space[2], marginTop: space[3]},
  warningText: {flex: 1},
  syncBtn: {marginTop: space[2]},
});
