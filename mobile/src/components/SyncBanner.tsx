/**
 * Sync status banner — shows pending sync count with tap-to-sync.
 * Persistent across all screens when there are unsynced records.
 */
import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {getQueueDepth} from '../core/sync/outbox';
import {subscribeToSyncDepth, syncFull} from '../core/sync/engine';
import {urgency, lightColors} from '../theme/colors';

export function SyncBanner() {
  const [queueDepth, setQueueDepth] = useState(getQueueDepth());

  useEffect(() => {
    const unsub = subscribeToSyncDepth(setQueueDepth);
    return unsub;
  }, []);

  if (queueDepth === 0) return null;

  return (
    <Pressable style={styles.banner} onPress={() => syncFull()}
      accessibilityRole="button"
      accessibilityLabel={`${queueDepth} record${queueDepth > 1 ? 's' : ''} pending sync`}
      accessibilityHint="Tap to retry syncing now">
      <Text style={styles.icon} allowFontScaling={true} maxFontSizeMultiplier={1.5}>⟳</Text>
      <Text style={styles.text} allowFontScaling={true} maxFontSizeMultiplier={1.5}>
        {queueDepth} record{queueDepth > 1 ? 's' : ''} pending sync — tap to retry
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: urgency.AMBER + '20',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: urgency.AMBER + '30',
  },
  icon: {fontSize: 16, marginRight: 8, color: urgency.AMBER},
  text: {fontSize: 13, color: urgency.AMBER, fontWeight: '600'},
});
