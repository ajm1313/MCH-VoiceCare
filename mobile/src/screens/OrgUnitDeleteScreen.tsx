/**
 * OrgUnitDeleteScreen — confirmation screen for deleting an organisation unit.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RouteProp} from '@react-navigation/native';

import {darkColors, lightColors} from '../theme/colors';
import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function OrgUnitDeleteScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'OrgUnitDelete'>>();
  const {orgUnitId} = route.params;

  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [unit, setUnit] = useState<{name: string; code: string; unit_type: string; status: string} | null>(null);
  const [childCount, setChildCount] = useState(0);

  const loadData = useCallback(() => {
    try {
      const result = query('SELECT name, code, unit_type, status FROM org_units WHERE id = ?', [orgUnitId]);
      if (result.length > 0) {
        const r = result[0] as any;
        setUnit({
          name: String(r.name || ''),
          code: r.code ? String(r.code) : '—',
          unit_type: String(r.unit_type || ''),
          status: String(r.status || 'ACTIVE'),
        });
      }
      const children = query("SELECT COUNT(*) as cnt FROM org_units WHERE parent_name = ? AND status = 'ACTIVE'", [unit?.name ?? '']);
      if (children.length > 0) {
        setChildCount(Number((children[0] as any).cnt) || 0);
      }
    } finally {
      setLoading(false);
    }
  }, [orgUnitId, unit?.name]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleDelete = () => {
    if (childCount > 0) {
      Alert.alert('Cannot Delete', `There are ${childCount} active child units assigned to this unit. Remove or reassign them first.`);
      return;
    }
    Alert.alert('Confirm Delete', `Permanently delete "${unit?.name}"?`, [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setDeleting(true);
          try {
            const db = getDb();
            db.execute('DELETE FROM org_units WHERE id = ?', [orgUnitId]);
            navigation.goBack();
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  if (loading) {
    return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;
  }

  if (!unit) {
    return <View style={[styles.center, {backgroundColor: colors.background}]}><Text style={{color: colors.textSecondary}}>Unit not found</Text></View>;
  }

  return (
    <ScrollView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={[styles.warningCard, {backgroundColor: scheme === 'dark' ? 'rgba(220,38,38,0.1)' : 'rgba(220,38,38,0.05)', borderColor: 'rgba(220,38,38,0.3)'}]}>
        <Text style={styles.warningIcon}>⚠</Text>
        <Text style={[styles.warningTitle, {color: colors.textPrimary}]}>Delete {unit.unit_type.toLowerCase()}</Text>
        <Text style={[styles.warningText, {color: colors.textSecondary}]}>This action cannot be undone.</Text>
      </View>

      <View style={[styles.infoCard, {backgroundColor: colors.surface}]}>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>Name</Text>
          <Text style={[styles.infoValue, {color: colors.textPrimary}]}>{unit.name}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>Code</Text>
          <Text style={[styles.infoValue, {color: colors.textPrimary}]}>{unit.code}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>Status</Text>
          <Text style={[styles.infoValue, {color: colors.textPrimary}]}>{unit.status}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={[styles.infoLabel, {color: colors.textSecondary}]}>Active Children</Text>
          <Text style={[styles.infoValue, {color: childCount > 0 ? '#dc2626' : colors.textPrimary}]}>{childCount}</Text>
        </View>
      </View>

      {childCount > 0 && (
        <Text style={[styles.blockedText, {color: '#dc2626'}]}>
          Cannot delete: there are {childCount} active child units. Remove or reassign them first.
        </Text>
      )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.deleteBtn, {backgroundColor: '#dc2626', opacity: childCount > 0 || deleting ? 0.5 : 1}]}
          onPress={handleDelete}
          disabled={childCount > 0 || deleting}
        >
          <Text style={styles.deleteBtnText}>{deleting ? 'Deleting…' : `Yes, Delete ${unit.unit_type}`}</Text>
        </Pressable>
        <Pressable style={[styles.cancelBtn, {borderColor: colors.border}]} onPress={() => navigation.goBack()}>
          <Text style={[styles.cancelBtnText, {color: colors.textPrimary}]}>Cancel</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, padding: 16},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  warningCard: {borderRadius: 12, borderWidth: 1, padding: 20, alignItems: 'center', marginBottom: 16},
  warningIcon: {fontSize: 36, marginBottom: 8},
  warningTitle: {fontSize: 18, fontWeight: '700', marginBottom: 4},
  warningText: {fontSize: 14},
  infoCard: {borderRadius: 10, padding: 16, marginBottom: 16},
  infoRow: {flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6},
  infoLabel: {fontSize: 13},
  infoValue: {fontSize: 13, fontWeight: '600'},
  blockedText: {fontSize: 13, marginBottom: 16},
  actions: {gap: 12},
  deleteBtn: {padding: 14, borderRadius: 10, alignItems: 'center'},
  deleteBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},
  cancelBtn: {padding: 14, borderRadius: 10, alignItems: 'center', borderWidth: 1},
  cancelBtnText: {fontWeight: '600', fontSize: 15},
});
