/**
 * PregnancyCloseScreen — close a pregnancy episode.
 *
 * UX-003: restyled with the shared design system primitives and SVG icons.
 * Clinical behaviour, queries, navigation and accessibility are unchanged.
 */
import React, {useEffect, useState} from 'react';
import {Alert, Pressable, StyleSheet, View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';
import {useTheme} from '../theme/useTheme';
import {border, radius, space} from '../theme/tokens';
import {Screen} from '../components/ui/Screen';
import {Card} from '../components/ui/Card';
import {Button} from '../components/ui/Button';
import {Field} from '../components/ui/Input';
import {AppText} from '../components/ui/Text';
import {KeyValue} from '../components/ui/Layout';
import {Icon} from '../components/ui/Icon';

type Props = NativeStackScreenProps<RootStackParamList, 'PregnancyClose'>;

const OUTCOMES = ['LIVE_BIRTH', 'STILLBIRTH', 'MISCARRIAGE', 'ECTOPIC', 'OTHER'] as const;

export function PregnancyCloseScreen({route, navigation}: Props) {
  const {colors} = useTheme();
  const {episodeId} = route.params;
  const [outcome, setOutcome] = useState('LIVE_BIRTH');
  const [notes, setNotes] = useState('');
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

  const handleClose = () => {
    Alert.alert('Confirm Close', `Close pregnancy episode for ${episodeName}?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Close',
        style: 'destructive',
        onPress: () => {
          const db = getDb();
          db.execute(
            "UPDATE episodes SET status = 'CLOSED', updated_at = ? WHERE id = ?",
            [new Date().toISOString(), episodeId],
          );
          if (outcome === 'LIVE_BIRTH') {
            Alert.alert(
              'Register Newborn',
              'This pregnancy ended in a live birth. Would you like to register the newborn now to continue continuity of care?',
              [
                {text: 'Later', style: 'cancel', onPress: () => navigation.goBack()},
                {
                  text: 'Register Newborn',
                  onPress: () => {
                    navigation.reset({
                      index: 1,
                      routes: [
                        {name: 'Dashboard'},
                        {name: 'NewbornRegister'},
                      ],
                    });
                  },
                },
              ],
            );
          } else {
            navigation.goBack();
          }
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
        <AppText variant="h2">Close Pregnancy</AppText>
      </View>

      <Card style={styles.card}>
        <KeyValue label="Woman" value={episodeName} />

        <AppText variant="smallStrong" tone="secondary" style={styles.label}>
          Outcome
        </AppText>
        <View style={styles.options}>
          {OUTCOMES.map(o => {
            const selected = outcome === o;
            return (
              <Pressable
                key={o}
                onPress={() => setOutcome(o)}
                accessibilityRole="button"
                accessibilityLabel={`Outcome: ${o.replace(/_/g, ' ')}`}
                accessibilityState={{selected}}
                style={[
                  styles.option,
                  {
                    borderColor: selected ? colors.primary : colors.border,
                    backgroundColor: selected ? colors.primarySubtle : 'transparent',
                  },
                ]}>
                <AppText
                  variant="smallStrong"
                  tone="inherit"
                  style={{color: selected ? colors.primaryStrong : colors.textPrimary}}>
                  {o.replace(/_/g, ' ')}
                </AppText>
              </Pressable>
            );
          })}
        </View>

        <Field
          label="Notes"
          value={notes}
          onChangeText={setNotes}
          placeholder="Closing notes..."
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          containerStyle={styles.field}
        />
      </Card>

      <Button
        label="Close Episode"
        onPress={handleClose}
        variant="danger"
        icon="close"
        fullWidth
        size="lg"
        style={styles.action}
        accessibilityLabel="Close episode"
      />

      {outcome === 'LIVE_BIRTH' && (
        <Card variant="outlined" style={styles.continuityBanner}>
          <View style={styles.continuityIconWrap}>
            <Icon name="baby" size={22} color={colors.primary} />
          </View>
          <View style={styles.continuityText}>
            <AppText variant="smallStrong" tone="brand">Continuity of Care</AppText>
            <AppText variant="caption" tone="secondary" style={styles.continuityDesc}>
              After closing, you'll be prompted to register the newborn and begin postnatal care, immunisation, and growth monitoring.
            </AppText>
          </View>
        </Card>
      )}
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
  label: {marginTop: space[2], marginBottom: space[2]},
  options: {flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[2]},
  option: {
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.md,
    borderWidth: border.thick,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {marginTop: space[2]},
  action: {marginTop: space[2]},
  continuityBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space[3],
    marginTop: space[4],
  },
  continuityIconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continuityText: {flex: 1},
  continuityDesc: {marginTop: space[1]},
});
