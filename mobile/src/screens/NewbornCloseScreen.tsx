/**
 * NewbornCloseScreen — close a newborn episode.
 */
import React, {useEffect, useState} from 'react';
import {Alert, Pressable, StyleSheet, View} from 'react-native';
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
import {useTheme} from '../theme/useTheme';
import {space} from '../theme/tokens';

type Props = NativeStackScreenProps<RootStackParamList, 'NewbornClose'>;

const OUTCOMES = ['DISCHARGED', 'REFERRED', 'DEATH', 'TRANSFERRED'] as const;

export function NewbornCloseScreen({route, navigation}: Props) {
  const {episodeId} = route.params;
  const {colors} = useTheme();
  const [outcome, setOutcome] = useState('DISCHARGED');
  const [notes, setNotes] = useState('');
  const [childName, setChildName] = useState('');

  useEffect(() => {
    const rows = query('SELECT child_name FROM newborn_episodes WHERE id = ?', [episodeId]);
    if (rows.length > 0) {
      setChildName(String(rows[0].child_name ?? 'Unknown'));
    }
  }, [episodeId]);

  const handleClose = () => {
    Alert.alert('Confirm Close', `Close newborn episode for ${childName}?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Close',
        style: 'destructive',
        onPress: () => {
          const db = getDb();
          db.execute(
            "UPDATE newborn_episodes SET status = 'CLOSED' WHERE id = ?",
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
      <SectionHeader title="Close Newborn Episode" />

      <Card>
        <AppText variant="smallStrong" tone="secondary">
          Child
        </AppText>
        <AppText variant="bodyLg" style={styles.valueSpacing}>
          {childName}
        </AppText>

        <Divider style={styles.dividerSpacing} />

        <AppText variant="smallStrong" tone="secondary" style={styles.labelSpacing}>
          Outcome
        </AppText>
        <View style={styles.optionList}>
          {OUTCOMES.map(o => {
            const selected = outcome === o;
            return (
              <Pressable
                key={o}
                onPress={() => setOutcome(o)}
                accessibilityRole="button"
                accessibilityLabel={o.replace(/_/g, ' ')}
                accessibilityState={{selected}}
                style={[
                  styles.option,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primarySubtle : 'transparent',
                  },
                ]}>
                <AppText
                  variant="body"
                  tone={selected ? 'brand' : 'primary'}
                  style={selected ? styles.optionTextSelected : null}>
                  {o.replace(/_/g, ' ')}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <Divider style={styles.dividerSpacing} />

        <Field
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Closing notes..."
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          containerStyle={styles.fieldSpacing}
        />
      </Card>

      <Button
        label="Close Episode"
        onPress={handleClose}
        variant="danger"
        fullWidth
        icon="checkCircle"
        style={styles.closeButton}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {marginBottom: space[2]},
  valueSpacing: {marginTop: space[1], marginBottom: space[2]},
  dividerSpacing: {marginVertical: space[3]},
  labelSpacing: {marginBottom: space[2]},
  optionList: {gap: space[2]},
  option: {
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: 12,
    borderWidth: 1.5,
  },
  optionTextSelected: {fontWeight: '600'},
  fieldSpacing: {marginBottom: 0},
  closeButton: {marginTop: space[4]},
});
