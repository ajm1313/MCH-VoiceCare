/**
 * PregnancyTransferScreen — transfer a pregnancy episode to another facility.
 *
 * UX-003: restyled with the shared design system primitives and SVG icons.
 * Clinical behaviour, queries, navigation and accessibility are unchanged.
 */
import React, {useEffect, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';
import {space} from '../theme/tokens';
import {Screen} from '../components/ui/Screen';
import {Card} from '../components/ui/Card';
import {Button} from '../components/ui/Button';
import {Field} from '../components/ui/Input';
import {AppText} from '../components/ui/Text';
import {KeyValue} from '../components/ui/Layout';

type Props = NativeStackScreenProps<RootStackParamList, 'PregnancyTransfer'>;

export function PregnancyTransferScreen({route, navigation}: Props) {
  const {episodeId} = route.params;
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [episodeName, setEpisodeName] = useState('');

  useEffect(() => {
    const rows = query('SELECT snapshot FROM episodes WHERE id = ?', [episodeId]);
    if (rows.length > 0) {
      try {
        const snap = JSON.parse(rows[0].snapshot as string);
        setEpisodeName(String(snap.woman_name ?? 'Unknown'));
      } catch { /* */ }
    }
  }, [episodeId]);

  const handleTransfer = () => {
    if (!destination.trim()) {
      Alert.alert('Validation', 'Please specify a destination facility.');
      return;
    }
    Alert.alert('Confirm Transfer', `Transfer pregnancy for ${episodeName} to ${destination}?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Transfer',
        onPress: () => {
          const db = getDb();
          db.execute(
            "UPDATE episodes SET status = 'TRANSFERRED', updated_at = ? WHERE id = ?",
            [new Date().toISOString(), episodeId],
          );
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <Button
          label="Back"
          variant="ghost"
          size="sm"
          icon="chevronLeft"
          onPress={() => navigation.goBack()}
          accessibilityLabel="Go back"
        />
        <AppText variant="h2">Transfer Pregnancy</AppText>
      </View>

      <Card style={styles.card}>
        <KeyValue label="Woman" value={episodeName} />
        <Field
          label="Destination Facility"
          value={destination}
          onChangeText={setDestination}
          placeholder="Facility name"
          icon="mapPin"
          containerStyle={styles.field}
        />
        <Field
          label="Reason"
          value={reason}
          onChangeText={setReason}
          placeholder="Transfer reason..."
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          containerStyle={styles.field}
        />
      </Card>

      <Button
        label="Transfer Episode"
        onPress={handleTransfer}
        icon="share"
        fullWidth
        size="lg"
        style={styles.action}
        accessibilityLabel="Transfer episode"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    marginBottom: space[3],
  },
  card: {gap: space[2], marginBottom: space[4]},
  field: {marginBottom: space[3]},
  action: {marginTop: space[2]},
});
