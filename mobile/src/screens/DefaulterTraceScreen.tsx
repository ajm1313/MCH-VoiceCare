/**
 * DefaulterTraceScreen — record a defaulter tracing outcome.
 */
import React, {useEffect, useState} from 'react';
import {Alert, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {useTheme} from '../theme/useTheme';
import {query, getDb} from '../core/db/database';
import {
  Screen,
  Card,
  Button,
  Field,
  SectionHeader,
  AppText,
} from '../components/ui';
import {border, radius, space} from '../theme/tokens';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'DefaulterTrace'>;

export function DefaulterTraceScreen({route, navigation}: Props) {
  const {colors} = useTheme();
  const {defaulterId} = route.params;
  const [traceStatus, setTraceStatus] = useState('LOCATED');
  const [notes, setNotes] = useState('');
  const [childName, setChildName] = useState('');

  useEffect(() => {
    const rows = query('SELECT child_name FROM defaulter_episodes WHERE id = ?', [defaulterId]);
    if (rows.length > 0) setChildName(String(rows[0].child_name ?? 'Unknown'));
  }, [defaulterId]);

  const handleSave = () => {
    Alert.alert('Confirm', `Mark ${childName} as ${traceStatus}?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Save',
        onPress: () => {
          const db = getDb();
          if (!db) return;
          const now = new Date().toISOString();
          db.execute(
            `UPDATE defaulter_episodes SET trace_status = ?, traced_at = ?, trace_notes = ?, defaulter_status = ? WHERE id = ?`,
            [traceStatus, now, notes, traceStatus === 'LOCATED' ? 'RESOLVED' : 'ACTIVE', defaulterId],
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
          size="sm"
          icon="chevronLeft"
          onPress={() => navigation.goBack()}
        />
      </View>

      <Card style={styles.card}>
        <SectionHeader title="Trace Defaulter" />
        <AppText variant="smallStrong" tone="secondary" style={styles.label}>Child</AppText>
        <AppText variant="bodyLg">{childName}</AppText>

        <AppText variant="smallStrong" tone="secondary" style={styles.label}>Trace Outcome</AppText>
        {['LOCATED', 'NOT_FOUND', 'MOVED', 'DECLINED', 'DECEASED'].map(s => (
          <Pressable
            key={s}
            onPress={() => setTraceStatus(s)}
            accessibilityRole="button"
            accessibilityLabel={s.replace(/_/g, ' ')}
            accessibilityState={{selected: traceStatus === s}}
            style={[
              styles.option,
              traceStatus === s && {
                borderColor: colors.primary,
                backgroundColor: colors.primarySubtle,
              },
            ]}>
            <AppText
              variant="body"
              tone="inherit"
              style={traceStatus === s ? {color: colors.primaryStrong, fontWeight: '600'} : null}>
              {s.replace(/_/g, ' ')}
            </AppText>
          </Pressable>
        ))}

        <Field
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Tracing notes..."
          multiline
          numberOfLines={3}
        />
      </Card>

      <View style={styles.buttonRow}>
        <Button
          label="Save Trace"
          variant="primary"
          size="lg"
          icon="check"
          fullWidth
          onPress={handleSave}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  backRow: {paddingTop: space[2]},
  card: {marginVertical: space[2]},
  label: {marginTop: space[3], marginBottom: space[1]},
  option: {
    paddingVertical: space[2] + 2,
    paddingHorizontal: space[3],
    borderRadius: radius.md,
    borderWidth: border.thick,
    borderColor: 'transparent',
    marginTop: space[1],
  },
  buttonRow: {marginVertical: space[3]},
});
