/**
 * OrgUnitListScreen — list organisation units with hierarchical type filter.
 * Uses API with local DB fallback.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {useAuthStore} from '../core/auth/authStore';
import {AppConfig} from '../config/appConfig';
import {query} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface ApiOrgUnit {
  id: string;
  name: string;
  organisation_unit_type: string;
  parent_name: string | null;
  region_name: string | null;
  district_name: string | null;
  status: string;
}

type LocalOrgUnit = { id: string; name: string; unit_type: string; parent_name: string | null; status: string };

const TYPE_FILTERS = [
  {label: 'All', value: ''},
  {label: 'Regions', value: 'regions'},
  {label: 'Districts', value: 'districts'},
  {label: 'Sub-districts', value: 'subdistricts'},
  {label: 'Facilities', value: 'facilities'},
];

export function OrgUnitListScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();
  const {token} = useAuthStore();
  const [apiRows, setApiRows] = useState<ApiOrgUnit[]>([]);
  const [localRows, setLocalRows] = useState<LocalOrgUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [useApi, setUseApi] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');

  const loadData = useCallback(async () => {
    if (useApi) {
      try {
        let path = '/organisations/units/';
        if (typeFilter) {
          path = `/organisations/units/${typeFilter}/`;
        } else {
          path += '?status=ACTIVE';
        }
        const resp = await fetch(`${AppConfig.apiBaseUrl}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          const units = Array.isArray(data) ? data : (data.results || []);
          setApiRows(units);
          setLoading(false);
          setRefreshing(false);
          return;
        }
      } catch {
        // Fall back to local DB
      }
    }
    setUseApi(false);
    try {
      let sql = 'SELECT id, name, unit_type, parent_name, status FROM org_units';
      const params: any[] = [];
      if (typeFilter) {
        const typeMap: Record<string, string> = {
          regions: 'REGION', districts: 'DISTRICT', subdistricts: 'SUBDISTRICT', facilities: 'FACILITY',
        };
        sql += ' WHERE unit_type = ?';
        params.push(typeMap[typeFilter] || '');
      }
      sql += ' ORDER BY name';
      const result = query(sql, params);
      setLocalRows(result.map((r: any) => ({
        id: String(r.id), name: String(r.name || ''), unit_type: String(r.unit_type || ''),
        parent_name: r.parent_name ? String(r.parent_name) : null, status: String(r.status || 'ACTIVE'),
      })));
    } finally { setLoading(false); setRefreshing(false); }
  }, [token, useApi, typeFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;

  const renderApiItem = ({item}: {item: ApiOrgUnit}) => (
    <Pressable style={[styles.card, {backgroundColor: colors.surface}]} onPress={() => navigation.navigate('OrgUnitForm', {orgUnitId: item.id})}>
      <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{item.name}</Text>
      <Text style={[styles.cardSub, {color: colors.textSecondary}]}>
        {item.organisation_unit_type}
        {item.parent_name ? ` · Parent: ${item.parent_name}` : ''}
      </Text>
      {item.region_name && <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.region_name}{item.district_name ? ` › ${item.district_name}` : ''}</Text>}
      <Text style={[styles.cardStatus, {color: colors.textSecondary}]}>{item.status}</Text>
      <Pressable style={[styles.deleteBtn, {borderColor: '#dc2626'}]} onPress={() => navigation.navigate('OrgUnitDelete', {orgUnitId: item.id})}>
        <Text style={[styles.deleteBtnText, {color: '#dc2626'}]}>Delete ›</Text>
      </Pressable>
    </Pressable>
  );

  const renderLocalItem = ({item}: {item: LocalOrgUnit}) => (
    <Pressable style={[styles.card, {backgroundColor: colors.surface}]} onPress={() => navigation.navigate('OrgUnitForm', {orgUnitId: item.id})}>
      <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{item.name}</Text>
      <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.unit_type}{item.parent_name ? ` · Parent: ${item.parent_name}` : ''}</Text>
      <Text style={[styles.cardStatus, {color: colors.textSecondary}]}>{item.status}</Text>
      <Pressable style={[styles.deleteBtn, {borderColor: '#dc2626'}]} onPress={() => navigation.navigate('OrgUnitDelete', {orgUnitId: item.id})}>
        <Text style={[styles.deleteBtnText, {color: '#dc2626'}]}>Delete ›</Text>
      </Pressable>
    </Pressable>
  );

  return (
    <FlatList
      style={[styles.container, {backgroundColor: colors.background}]}
      data={useApi ? apiRows : localRows} keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />}
      ListHeaderComponent={
        <View>
          <View style={styles.filterRow}>
            {TYPE_FILTERS.map(f => (
              <Pressable
                key={f.value}
                style={[styles.filterBtn, typeFilter === f.value && {backgroundColor: colors.primary}]}
                onPress={() => { setTypeFilter(f.value); setLoading(true); }}
              >
                <Text style={[styles.filterText, {color: typeFilter === f.value ? '#fff' : colors.textSecondary}]}>
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable style={[styles.createBtn, {backgroundColor: colors.primary}]} onPress={() => navigation.navigate('OrgUnitForm', {})}>
            <Text style={styles.createBtnText}>+ New Org Unit</Text>
          </Pressable>
        </View>
      }
      ListEmptyComponent={<View style={styles.center}><Text style={[styles.empty, {color: colors.textSecondary}]}>No organisation units</Text></View>}
      renderItem={useApi ? renderApiItem : renderLocalItem}
    />
  );
}

const styles = StyleSheet.create({
  container: {flex: 1}, center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}, empty: {fontSize: 14},
  filterRow: {flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 12, gap: 6},
  filterBtn: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0'},
  filterText: {fontSize: 12, fontWeight: '600'},
  card: {marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12},
  createBtn: {margin: 16, padding: 14, borderRadius: 12, alignItems: 'center'},
  createBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},
  deleteBtn: {marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start'},
  deleteBtnText: {fontSize: 12, fontWeight: '600'},
  cardTitle: {fontSize: 15, fontWeight: '600'}, cardSub: {fontSize: 13, marginTop: 2}, cardStatus: {fontSize: 11, fontWeight: '600', marginTop: 6, textTransform: 'uppercase'},
});
