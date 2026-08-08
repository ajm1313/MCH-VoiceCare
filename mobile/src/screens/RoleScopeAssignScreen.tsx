/**
 * RoleScopeAssignScreen — assign a system role + org-unit scope to a user.
 * Uses API with local DB fallback.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme} from 'react-native';
import {useNavigation, useRoute} from '@react-navigation/native';
import type {NativeStackNavigationProp} from '@react-navigation/native-stack';
import type {RouteProp} from '@react-navigation/native';

import {darkColors, lightColors} from '../theme/colors';
import {useAuthStore} from '../core/auth/authStore';
import {AppConfig} from '../config/appConfig';
import {query, getDb} from '../core/db/database';
import type {RootStackParamList} from '../core/navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface RoleOption {
  code: string;
  name: string;
  level: number;
  compatible_unit_types: string[];
}

interface OrgUnit {
  id: string;
  name: string;
  organisation_unit_type: string;
}

interface ApiRoleScope {
  id: string;
  role_code: string;
  role_code_display: string;
  scope_unit_name: string | null;
  status: string;
  effective_from: string | null;
}

type LocalRoleScope = {
  id: string;
  role_code: string;
  scope_unit_name: string | null;
  status: string;
  effective_from: string | null;
};

export function RoleScopeAssignScreen() {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'RoleScopeAssign'>>();
  const {userId} = route.params;
  const {token} = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState('');
  const [roleCode, setRoleCode] = useState('');
  const [scopeUnitId, setScopeUnitId] = useState<string | null>(null);
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([]);
  const [existing, setExisting] = useState<ApiRoleScope[]>([]);
  const [useApi, setUseApi] = useState(true);

  const apiFetch = useCallback(async (path: string, options?: RequestInit) => {
    const resp = await fetch(`${AppConfig.apiBaseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options?.headers || {}),
      },
    });
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    return resp.json();
  }, [token]);

  const loadData = useCallback(async () => {
    if (useApi) {
      try {
        const [rolesData, unitsData, userScopes] = await Promise.all([
          apiFetch('/accounts/roles/') as Promise<RoleOption[]>,
          apiFetch('/organisations/units/?status=ACTIVE') as Promise<OrgUnit[] | { results: OrgUnit[] }>,
          apiFetch(`/accounts/role-scopes/?user=${userId}`) as Promise<ApiRoleScope[] | { results: ApiRoleScope[] }>,
        ]);
        setRoles(rolesData);
        const units = Array.isArray(unitsData) ? unitsData : (unitsData.results || []);
        setOrgUnits(units);
        const scopes = Array.isArray(userScopes) ? userScopes : (userScopes.results || []);
        setExisting(scopes);

        // Get username from users endpoint
        try {
          const userResp = await apiFetch(`/accounts/users/${userId}/`) as any;
          setUsername(userResp.full_name || userResp.username || '');
        } catch {
          setUsername('');
        }
        setLoading(false);
        return;
      } catch {
        setUseApi(false);
      }
    }

    // Local DB fallback
    try {
      const userResult = query('SELECT username FROM user_accounts WHERE id = ?', [userId]);
      if (userResult.length > 0) {
        setUsername(String((userResult[0] as any).username || ''));
      }
      const unitResult = query('SELECT id, name, unit_type FROM org_units WHERE status = ? ORDER BY name', ['ACTIVE']);
      setOrgUnits(unitResult.map((r: any) => ({
        id: String(r.id), name: String(r.name || ''), organisation_unit_type: String(r.unit_type || ''),
      })));
      const scopeResult = query('SELECT id, role_code, scope_unit_name, status, effective_from FROM user_role_scopes WHERE user_id = ? ORDER BY effective_from DESC', [userId]);
      setExisting(scopeResult.map((r: any) => ({
        id: String(r.id), role_code: String(r.role_code || ''), role_code_display: String(r.role_code || '').replace(/_/g, ' '),
        scope_unit_name: r.scope_unit_name ? String(r.scope_unit_name) : null,
        status: String(r.status || 'ACTIVE'),
        effective_from: r.effective_from ? String(r.effective_from) : null,
      })));
    } finally {
      setLoading(false);
    }
  }, [userId, apiFetch, useApi]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAssign = async () => {
    if (roleCode !== 'SUPER_ADMIN' && !scopeUnitId) {
      Alert.alert('Validation', 'This role requires an organisation-unit scope.');
      return;
    }
    setSaving(true);
    try {
      if (useApi) {
        await apiFetch(`/accounts/users/${userId}/assign_role/`, {
          method: 'POST',
          body: JSON.stringify({ role_code: roleCode, scope_unit: scopeUnitId }),
        });
      } else {
        const db = getDb();
        const id = `rs-${Date.now()}`;
        const now = new Date().toISOString().slice(0, 10);
        const unitName = orgUnits.find(u => u.id === scopeUnitId)?.name ?? null;
        db.execute(
          `INSERT OR REPLACE INTO user_role_scopes
           (id, user_id, role_code, scope_unit_id, scope_unit_name, status, effective_from, effective_to, sync_status)
           VALUES (?, ?, ?, ?, ?, 'ACTIVE', ?, NULL, 'NOT_SYNCED')`,
          [id, userId, roleCode, scopeUnitId, unitName, now],
        );
      }
      loadData();
      setRoleCode('');
      setScopeUnitId(null);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to assign role');
    } finally {
      setSaving(false);
    }
  };

  const handleRevoke = (scopeId: string) => {
    Alert.alert('Revoke Role', 'Revoke this role assignment?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Revoke',
        style: 'destructive',
        onPress: async () => {
          try {
            if (useApi) {
              await apiFetch(`/accounts/users/${userId}/revoke_role/`, {
                method: 'POST',
                body: JSON.stringify({ scope_id: scopeId }),
              });
            } else {
              const db = getDb();
              db.execute('UPDATE user_role_scopes SET status = ?, sync_status = ? WHERE id = ?', ['REVOKED', 'NOT_SYNCED', scopeId]);
            }
            loadData();
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Failed to revoke');
          }
        },
      },
    ]);
  };

  if (loading) {
    return <View style={[styles.center, {backgroundColor: colors.background}]}><ActivityIndicator color={colors.primary} /></View>;
  }

  return (
    <ScrollView style={[styles.container, {backgroundColor: colors.background}]}>
      <Text style={[styles.title, {color: colors.textPrimary}]}>Assign Role to {username}</Text>

      <Text style={[styles.label, {color: colors.textSecondary}]}>System Role</Text>
      {roles.length > 0 ? roles.map(r => (
        <Pressable
          key={r.code}
          style={[styles.optionRow, {backgroundColor: roleCode === r.code ? colors.primary : colors.surface, borderColor: colors.border}]}
          onPress={() => setRoleCode(r.code)}
        >
          <Text style={[styles.optionText, {color: roleCode === r.code ? '#fff' : colors.textPrimary}]}>{r.name}</Text>
        </Pressable>
      )) : (
        <Text style={[styles.empty, {color: colors.textSecondary}]}>Loading roles…</Text>
      )}

      {roleCode && roleCode !== 'SUPER_ADMIN' && (
        <>
          <Text style={[styles.label, {color: colors.textSecondary, marginTop: 16}]}>Scope (Organisation Unit)</Text>
          {orgUnits.map(u => (
            <Pressable
              key={u.id}
              style={[styles.optionRow, {backgroundColor: scopeUnitId === u.id ? colors.primary : colors.surface, borderColor: colors.border}]}
              onPress={() => setScopeUnitId(u.id)}
            >
              <Text style={[styles.optionText, {color: scopeUnitId === u.id ? '#fff' : colors.textPrimary}]}>{u.name} ({u.organisation_unit_type})</Text>
            </Pressable>
          ))}
        </>
      )}

      <Pressable
        style={[styles.saveBtn, {backgroundColor: colors.primary}, saving && styles.buttonDisabled]}
        onPress={handleAssign}
        disabled={saving || !roleCode}
      >
        <Text style={styles.saveBtnText}>{saving ? 'Assigning…' : 'Assign Role'}</Text>
      </Pressable>

      <Text style={[styles.sectionTitle, {color: colors.textPrimary, marginTop: 24}]}>Current Assignments</Text>
      {existing.length === 0 && <Text style={[styles.empty, {color: colors.textSecondary}]}>No role assignments yet</Text>}
      {existing.map(s => (
        <View key={s.id} style={[styles.card, {backgroundColor: colors.surface}]}>
          <View style={styles.cardHeader}>
            <Text style={[styles.cardTitle, {color: colors.textPrimary}]}>{s.role_code_display || s.role_code.replace(/_/g, ' ')}</Text>
            <Text style={[styles.badge, {color: s.status === 'ACTIVE' ? colors.primary : colors.textSecondary}]}>{s.status}</Text>
          </View>
          <Text style={[styles.cardSub, {color: colors.textSecondary}]}>
            {s.scope_unit_name ?? 'NATIONAL'} · From: {s.effective_from ?? '—'}
          </Text>
          {s.status === 'ACTIVE' && (
            <Pressable style={[styles.revokeBtn, {borderColor: '#dc2626'}]} onPress={() => handleRevoke(s.id)}>
              <Text style={[styles.revokeBtnText, {color: '#dc2626'}]}>Revoke</Text>
            </Pressable>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, padding: 16},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  title: {fontSize: 18, fontWeight: '700', marginBottom: 16},
  label: {fontSize: 13, fontWeight: '600', marginBottom: 8},
  optionRow: {padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 6},
  optionText: {fontSize: 14, fontWeight: '500'},
  saveBtn: {padding: 14, borderRadius: 10, alignItems: 'center', marginTop: 16},
  saveBtnText: {color: '#fff', fontWeight: '700', fontSize: 15},
  buttonDisabled: {opacity: 0.6},
  sectionTitle: {fontSize: 16, fontWeight: '700', marginBottom: 8},
  empty: {fontSize: 14},
  card: {padding: 14, borderRadius: 10, marginBottom: 8},
  cardHeader: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4},
  cardTitle: {fontSize: 14, fontWeight: '600', textTransform: 'uppercase'},
  badge: {fontSize: 11, fontWeight: '700'},
  cardSub: {fontSize: 12},
  revokeBtn: {paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, marginTop: 8, alignSelf: 'flex-start'},
  revokeBtnText: {fontSize: 12, fontWeight: '600'},
});
