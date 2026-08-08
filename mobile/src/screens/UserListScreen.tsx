/**
 * UserListScreen — list user accounts from API with local DB fallback.
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

interface ApiUser {
  id: string;
  username: string;
  full_name: string;
  email: string;
  is_active: boolean;
  role: { code: string; name: string; level: number };
  location: { region_name: string | null; district_name: string | null; facility_name: string | null };
}

type LocalUser = { id: string; username: string; full_name: string; system_role: string | null; status: string };

export function UserListScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();
  const {token} = useAuthStore();
  const [apiUsers, setApiUsers] = useState<ApiUser[]>([]);
  const [localUsers, setLocalUsers] = useState<LocalUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [useApi, setUseApi] = useState(true);

  const loadData = useCallback(async () => {
    if (useApi) {
      try {
        const resp = await fetch(`${AppConfig.apiBaseUrl}/accounts/users/`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (resp.ok) {
          const data = await resp.json();
          const users = Array.isArray(data) ? data : (data.results || []);
          setApiUsers(users);
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
      const result = query('SELECT id, username, full_name, system_role, status FROM user_accounts ORDER BY full_name');
      setLocalUsers(result.map((r: any) => ({
        id: String(r.id), username: String(r.username || ''), full_name: String(r.full_name || ''),
        system_role: r.system_role ? String(r.system_role) : null, status: String(r.status || 'ACTIVE'),
      })));
    } finally { setLoading(false); setRefreshing(false); }
  }, [token, useApi]);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;

  if (useApi && apiUsers.length >= 0) {
    return (
      <FlatList
        style={[styles.container, {backgroundColor: colors.background}]}
        data={apiUsers} keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />}
        ListHeaderComponent={
          <Pressable style={[styles.createBtn, {backgroundColor: colors.primary}]} onPress={() => navigation.navigate('UserForm', {})}>
            <Text style={styles.createBtnText}>+ New User</Text>
          </Pressable>
        }
        ListEmptyComponent={<View style={styles.center}><Text style={[styles.empty, {color: colors.textSecondary}]}>No users</Text></View>}
        renderItem={({item}) => (
          <Pressable style={[styles.card, {backgroundColor: colors.surface}]} onPress={() => navigation.navigate('UserForm', {userId: item.id})}>
            <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{item.full_name}</Text>
            <Text style={[styles.cardSub, {color: colors.textSecondary}]}>@{item.username} · {item.role?.name ?? '—'}</Text>
            {item.location?.facility_name && (
              <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.location.facility_name}</Text>
            )}
            {item.location?.district_name && !item.location?.facility_name && (
              <Text style={[styles.cardSub, {color: colors.textSecondary}]}>{item.location.district_name}</Text>
            )}
            <Text style={[styles.cardStatus, {color: item.is_active ? colors.primary : colors.textSecondary}]}>
              {item.is_active ? 'ACTIVE' : 'INACTIVE'}
            </Text>
            <Pressable style={[styles.rolesBtn, {borderColor: colors.primary}]} onPress={() => navigation.navigate('RoleScopeAssign', {userId: item.id})}>
              <Text style={[styles.rolesBtnText, {color: colors.primary}]}>Manage Roles ›</Text>
            </Pressable>
          </Pressable>
        )}
      />
    );
  }

  return (
    <FlatList
      style={[styles.container, {backgroundColor: colors.background}]}
      data={localUsers} keyExtractor={item => item.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} colors={[colors.primary]} />}
      ListHeaderComponent={
        <Pressable style={[styles.createBtn, {backgroundColor: colors.primary}]} onPress={() => navigation.navigate('UserForm', {})}>
          <Text style={styles.createBtnText}>+ New User</Text>
        </Pressable>
      }
      ListEmptyComponent={<View style={styles.center}><Text style={[styles.empty, {color: colors.textSecondary}]}>No users</Text></View>}
      renderItem={({item}) => (
        <Pressable style={[styles.card, {backgroundColor: colors.surface}]} onPress={() => navigation.navigate('UserForm', {userId: item.id})}>
          <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{item.full_name}</Text>
          <Text style={[styles.cardSub, {color: colors.textSecondary}]}>@{item.username} · {item.system_role ?? '—'}</Text>
          <Text style={[styles.cardStatus, {color: colors.textSecondary}]}>{item.status}</Text>
          <Pressable style={[styles.rolesBtn, {borderColor: colors.primary}]} onPress={() => navigation.navigate('RoleScopeAssign', {userId: item.id})}>
            <Text style={[styles.rolesBtnText, {color: colors.primary}]}>Manage Roles ›</Text>
          </Pressable>
        </Pressable>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: {flex: 1}, center: {flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24}, empty: {fontSize: 14},
  card: {marginHorizontal: 16, marginVertical: 6, padding: 16, borderRadius: 12},
  createBtn: {margin: 16, padding: 14, borderRadius: 12, alignItems: 'center'},
  createBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},
  rolesBtn: {marginTop: 8, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, alignSelf: 'flex-start'},
  rolesBtnText: {fontSize: 12, fontWeight: '600'},
  cardTitle: {fontSize: 15, fontWeight: '600'}, cardSub: {fontSize: 13, marginTop: 2}, cardStatus: {fontSize: 11, fontWeight: '600', marginTop: 6, textTransform: 'uppercase'},
});
