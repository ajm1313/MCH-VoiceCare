/**
 * PregnancyTransferScreen — transfer a pregnancy episode to another facility.
 */
import React, {useEffect, useState} from 'react';
import {Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {query, getDb} from '../core/db/database';
import {brand, lightColors} from '../theme/colors';
import type {RootStackParamList} from '../core/navigation/types';

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
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Transfer Pregnancy</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.label}>Woman</Text>
          <Text style={styles.value}>{episodeName}</Text>
          <Text style={styles.label}>Destination Facility</Text>
          <TextInput style={styles.input} value={destination} onChangeText={setDestination} placeholder="Facility name" />
          <Text style={styles.label}>Reason</Text>
          <TextInput style={styles.input} value={reason} onChangeText={setReason} placeholder="Transfer reason..." multiline numberOfLines={3} textAlignVertical="top" />
        </View>
        <Pressable style={styles.transferButton} onPress={handleTransfer}>
          <Text style={styles.transferButtonText}>Transfer Episode</Text>
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
  input: {borderWidth: 1, borderColor: lightColors.border, borderRadius: 8, padding: 12, fontSize: 14, color: lightColors.textPrimary, minHeight: 48},
  transferButton: {backgroundColor: brand.teal, padding: 14, borderRadius: 12, alignItems: 'center'},
  transferButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
});
