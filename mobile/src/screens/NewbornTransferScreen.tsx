/**
 * NewbornTransferScreen — transfer a newborn episode to another facility.
 */
import React, {useEffect, useState} from 'react';
import {Alert, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';
import {
  Screen,
  Card,
  Button,
  Field,
  AppText,
  SectionHeader,
  Divider,
} from '../components/ui';
import {space} from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'NewbornTransfer'>;

export function NewbornTransferScreen({route, navigation}: Props) {
  const {episodeId} = route.params;
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [childName, setChildName] = useState('');

  useEffect(() => {
    const rows = query('SELECT child_name FROM newborn_episodes WHERE id = ?', [episodeId]);
    if (rows.length > 0) {
      setChildName(String(rows[0].child_name ?? 'Unknown'));
    }
  }, [episodeId]);

  const handleTransfer = () => {
    if (!destination.trim()) {
      Alert.alert('Validation', 'Please specify a destination facility.');
      return;
    }
    Alert.alert('Confirm Transfer', `Transfer newborn ${childName} to ${destination}?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Transfer',
        onPress: () => {
          const db = getDb();
          if (!db) return;
          db.execute(
            "UPDATE newborn_episodes SET status = 'TRANSFERRED' WHERE id = ?",
            [episodeId],
          );
          navigation.goBack();
        },
      },
    ]);
  };

  return (
    <Screen scroll>
      <View style={styles.backRow}>
        <Button
          label="Back"
          variant="ghost"
          icon="chevronLeft"
          onPress={() => navigation.goBack()}
        />
      </View>
      <SectionHeader title="Transfer Newborn" />

      <Card>
        <AppText variant="smallStrong" tone="secondary">
          Child
        </AppText>
        <AppText variant="bodyLg" style={styles.valueSpacing}>
          {childName}
        </AppText>

        <Divider style={styles.dividerSpacing} />

        <Field
          label="Destination Facility"
          value={destination}
          onChangeText={setDestination}
          placeholder="Facility name"
          containerStyle={styles.fieldSpacing}
        />

        <Field
          label="Reason"
          value={reason}
          onChangeText={setReason}
          placeholder="Transfer reason..."
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          containerStyle={styles.fieldSpacing}
        />
      </Card>

      <Button
        label="Transfer Episode"
        onPress={handleTransfer}
        fullWidth
        icon="share"
        style={styles.transferButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {marginBottom: space[2]},
  valueSpacing: {marginTop: space[1], marginBottom: space[2]},
  dividerSpacing: {marginVertical: space[3]},
  fieldSpacing: {marginBottom: space[3]},
  transferButton: {marginTop: space[4]},
});
