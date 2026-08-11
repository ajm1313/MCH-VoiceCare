/**
 * Sync status banner — shows pending sync count with tap-to-sync.
 * Persistent across all screens when there are unsynced records.
 */
import React, {useEffect, useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';

import {getQueueDepth} from '../core/sync/outbox';
import {subscribeToSyncDepth, syncFull} from '../core/sync/engine';
import {useTheme} from '../theme/useTheme';
import {radius, space} from '../theme/tokens';
import {Icon} from './ui/Icon';
import {AppText} from './ui/Text';

export function SyncBanner() {
  const {colors} = useTheme();
  const [queueDepth, setQueueDepth] = useState(getQueueDepth());

  useEffect(() => {
    const unsub = subscribeToSyncDepth(setQueueDepth);
    return unsub;
  }, []);

  if (queueDepth === 0) return null;

  return (
    <Pressable
      style={({pressed}) => [
        styles.banner,
        {backgroundColor: colors.warningSubtle, borderBottomColor: colors.warning + '40'},
        pressed && styles.pressed,
      ]}
      onPress={() => syncFull()}
      accessibilityRole="button"
      accessibilityLabel={`${queueDepth} record${queueDepth > 1 ? 's' : ''} pending sync`}
      accessibilityHint="Tap to retry syncing now">
      <Icon name="refresh" size={16} color={colors.warning} strokeWidth={2} />
      <AppText variant="smallStrong" tone="warning">
        {queueDepth} record{queueDepth > 1 ? 's' : ''} pending sync — tap to retry
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    minHeight: 48,
    borderBottomWidth: 1,
  },
  pressed: {opacity: 0.75},
});
