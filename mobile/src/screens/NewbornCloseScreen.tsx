/**
 * NewbornCloseScreen — close a newborn episode.
 */
import React, {useEffect, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {query, getDb} from '../core/db/database';
import {brand, lightColors} from '../theme/colors';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'NewbornClose'>;

export function NewbornCloseScreen({route, navigation}: Props) {
  const {episodeId} = route.params;
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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Close Newborn Episode</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>Child</Text>
          <Text style={styles.value}>{childName}</Text>
          <Text style={styles.label}>Outcome</Text>
          {['DISCHARGED', 'REFERRED', 'DEATH', 'TRANSFERRED'].map(o => (
            <Pressable key={o} onPress={() => setOutcome(o)} style={[styles.option, outcome === o && styles.optionSelected]}>
              <Text style={[styles.optionText, outcome === o && styles.optionTextSelected]}>{o.replace(/_/g, ' ')}</Text>
            </Pressable>
          ))}
          <Text style={styles.label}>Notes</Text>
          <TextInput style={styles.input} value={notes} onChangeText={setNotes} placeholder="Closing notes..." multiline numberOfLines={3} textAlignVertical="top" />
        </View>
        <Pressable style={styles.closeButton} onPress={handleClose}>
          <Text style={styles.closeButtonText}>Close Episode</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: lightColors.background},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12},
  back: {fontSize: 16, color: brand.teal},
  title: {fontSize: 18, fontWeight: '700', color: lightColors.textPrimary},
  content: {padding: 16, gap: 12},
  card: {backgroundColor: lightColors.surface, borderWidth: 1, borderColor: lightColors.border, borderRadius: 12, padding: 16, gap: 8},
  label: {fontSize: 11, fontWeight: '600', color: lightColors.textSecondary, textTransform: 'uppercase', marginTop: 8},
  value: {fontSize: 16, fontWeight: '600', color: lightColors.textPrimary},
  option: {paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, borderColor: lightColors.border, marginTop: 4},
  optionSelected: {borderColor: brand.teal, backgroundColor: brand.teal + '10'},
  optionText: {fontSize: 14, color: lightColors.textPrimary},
  optionTextSelected: {color: brand.teal, fontWeight: '600'},
  input: {borderWidth: 1, borderColor: lightColors.border, borderRadius: 8, padding: 12, fontSize: 14, color: lightColors.textPrimary, minHeight: 80},
  closeButton: {backgroundColor: brand.teal, padding: 14, borderRadius: 12, alignItems: 'center'},
  closeButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
