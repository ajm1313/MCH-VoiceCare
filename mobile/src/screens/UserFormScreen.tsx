/**
 * UserFormScreen — create or edit a user account with role+scope assignment.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {darkColors, lightColors} from '../theme/colors';
import {useAuthStore} from '../core/auth/authStore';
import {AppConfig} from '../config/appConfig';
import type {RootStackParamList} from '../core/navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'UserForm'>;

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

export function UserFormScreen({route, navigation}: Props) {
  const scheme = useColorScheme();
  const colors = scheme === 'dark' ? darkColors : lightColors;
  const {token} = useAuthStore();
  const editing = route.params?.userId != null;
  const userId = route.params?.userId;

  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [roleCode, setRoleCode] = useState('');
  const [scopeUnitId, setScopeUnitId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [loading, setLoading] = useState(!editing);
  const [saving, setSaving] = useState(false);

  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [regions, setRegions] = useState<OrgUnit[]>([]);
  const [districts, setDistricts] = useState<OrgUnit[]>([]);
  const [subdistricts, setSubdistricts] = useState<OrgUnit[]>([]);
  const [facilities, setFacilities] = useState<OrgUnit[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [selectedSubdistrict, setSelectedSubdistrict] = useState<string | null>(null);

  const selectedRole = roles.find(r => r.code === roleCode);
  const roleLevel = selectedRole?.level ?? 99;
  const showRegion = roleLevel >= 1 && roleCode !== 'SUPER_ADMIN';
  const showDistrict = roleLevel >= 2;
  const showSubdistrict = roleLevel >= 3;
  const showFacility = roleLevel >= 4;

  const apiFetch = useCallback(async (path: string) => {
    const resp = await fetch(`${AppConfig.apiBaseUrl}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) throw new Error(`API error: ${resp.status}`);
    return resp.json();
  }, [token]);

  useEffect(() => {
    (async () => {
      try {
        const rolesData = await apiFetch('/accounts/roles/') as RoleOption[];
        setRoles(rolesData);
        const regionsData = await apiFetch('/organisations/units/regions/') as OrgUnit[];
        setRegions(regionsData);
      } catch {
        // Fallback: use local DB if API unavailable
      } finally {
        setLoading(false);
      }
    })();
  }, [apiFetch]);

  useEffect(() => {
    if (showRegion && selectedRegion) {
      (async () => {
        try {
          const data = await apiFetch(`/organisations/units/districts/?region_id=${selectedRegion}`) as OrgUnit[];
          setDistricts(data);
        } catch { setDistricts([]); }
      })();
    } else {
      setDistricts([]);
    }
    setSelectedDistrict(null);
    setSubdistricts([]);
    setSelectedSubdistrict(null);
    setFacilities([]);
  }, [selectedRegion, showRegion, apiFetch]);

  useEffect(() => {
    if (showDistrict && selectedDistrict) {
      (async () => {
        try {
          const data = await apiFetch(`/organisations/units/subdistricts/?district_id=${selectedDistrict}`) as OrgUnit[];
          setSubdistricts(data);
        } catch { setSubdistricts([]); }
      })();
    } else {
      setSubdistricts([]);
    }
    setSelectedSubdistrict(null);
    setFacilities([]);
  }, [selectedDistrict, showDistrict, apiFetch]);

  useEffect(() => {
    if (showFacility && showSubdistrict && selectedSubdistrict) {
      (async () => {
        try {
          const data = await apiFetch(`/organisations/units/facilities/?subdistrict_id=${selectedSubdistrict}`) as OrgUnit[];
          setFacilities(data);
        } catch { setFacilities([]); }
      })();
    } else if (showFacility && !showSubdistrict && selectedDistrict) {
      (async () => {
        try {
          const data = await apiFetch(`/organisations/units/facilities/?district_id=${selectedDistrict}`) as OrgUnit[];
          setFacilities(data);
        } catch { setFacilities([]); }
      })();
    } else {
      setFacilities([]);
    }
  }, [selectedSubdistrict, selectedDistrict, showFacility, showSubdistrict, apiFetch]);

  const determineScopeUnit = (): string | null => {
    if (roleCode === 'SUPER_ADMIN') return null;
    if (showFacility) {
      if (showSubdistrict) return selectedSubdistrict;
      return selectedDistrict;
    }
    if (showSubdistrict) return selectedSubdistrict;
    if (showDistrict) return selectedDistrict;
    if (showRegion) return selectedRegion;
    return null;
  };

  const handleSave = async () => {
    if (!username.trim()) {
      Alert.alert('Validation', 'Username is required.');
      return;
    }
    if (!editing && !password.trim()) {
      Alert.alert('Validation', 'Password is required for new users.');
      return;
    }
    if (!roleCode) {
      Alert.alert('Validation', 'Please select a role for the user.');
      return;
    }
    if (showRegion && !selectedRegion) {
      Alert.alert('Validation', 'Please select a region for this role.');
      return;
    }
    if (showDistrict && !selectedDistrict) {
      Alert.alert('Validation', 'Please select a district for this role.');
      return;
    }
    if (showSubdistrict && !selectedSubdistrict) {
      Alert.alert('Validation', 'Please select a sub-district for this role.');
      return;
    }
    if (showFacility && !selectedSubdistrict && !selectedDistrict) {
      Alert.alert('Validation', 'Please select a facility scope for this role.');
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const resp = await fetch(
          `${AppConfig.apiBaseUrl}/accounts/users/${userId}/update_profile/`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              first_name: firstName,
              last_name: lastName,
              email,
              mobile_number: mobileNumber,
              is_active: isActive,
            }),
          },
        );
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.detail || 'Failed to update user');
        }
      } else {
        const scopeUnit = determineScopeUnit();
        const resp = await fetch(
          `${AppConfig.apiBaseUrl}/accounts/users/create_with_role/`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              username: username.trim(),
              first_name: firstName,
              last_name: lastName,
              email,
              password,
              mobile_number: mobileNumber,
              is_active: isActive,
              role_code: roleCode,
              scope_unit: scopeUnit,
            }),
          },
        );
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.detail || err.scope_unit || 'Failed to create user');
        }
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!editing || !userId) return;
    Alert.alert('Delete', 'Delete this user account?', [
      {text: 'Cancel', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const resp = await fetch(
              `${AppConfig.apiBaseUrl}/accounts/users/${userId}/`,
              {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
              },
            );
            if (!resp.ok) throw new Error('Failed to delete user');
            navigation.goBack();
          } catch (err) {
            Alert.alert('Error', err instanceof Error ? err.message : 'Unknown error');
          }
        },
      },
    ]);
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, {backgroundColor: colors.background}]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <Text style={[styles.back, {color: colors.primary}]}>‹ Back</Text>
        </Pressable>
        <Text style={[styles.title, {color: colors.textPrimary}]}>{editing ? 'Edit User' : 'New User'}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.label, {color: colors.textSecondary}]}>Username *</Text>
          <TextInput
            style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]}
            value={username}
            onChangeText={setUsername}
            placeholder="Username"
            autoCapitalize="none"
            editable={!editing}
          />

          {!editing && (
            <>
              <Text style={[styles.label, {color: colors.textSecondary}]}>Password *</Text>
              <TextInput
                style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]}
                value={password}
                onChangeText={setPassword}
                placeholder="Password"
                secureTextEntry
              />
            </>
          )}

          <Text style={[styles.label, {color: colors.textSecondary}]}>First Name</Text>
          <TextInput
            style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First name"
          />

          <Text style={[styles.label, {color: colors.textSecondary}]}>Last Name</Text>
          <TextInput
            style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last name"
          />

          <Text style={[styles.label, {color: colors.textSecondary}]}>Email</Text>
          <TextInput
            style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={[styles.label, {color: colors.textSecondary}]}>Mobile Number</Text>
          <TextInput
            style={[styles.input, {borderColor: colors.border, color: colors.textPrimary}]}
            value={mobileNumber}
            onChangeText={setMobileNumber}
            placeholder="Mobile number"
            keyboardType="phone-pad"
          />
        </View>

        <View style={[styles.card, {backgroundColor: colors.surface}]}>
          <Text style={[styles.sectionTitle, {color: colors.textPrimary}]}>Role & Location</Text>

          <Text style={[styles.label, {color: colors.textSecondary}]}>System Role *</Text>
          {roles.map(r => (
            <Pressable
              key={r.code}
              onPress={() => { setRoleCode(r.code); setScopeUnitId(null); }}
              style={[styles.option, roleCode === r.code && {borderColor: colors.primary, backgroundColor: colors.primary + '10'}]}
            >
              <Text style={{color: roleCode === r.code ? colors.primary : colors.textPrimary, fontSize: 13, fontWeight: roleCode === r.code ? '700' : '400'}}>
                {r.name}
              </Text>
            </Pressable>
          ))}

          {showRegion && (
            <>
              <Text style={[styles.label, {color: colors.textSecondary, marginTop: 12}]}>Region *</Text>
              {regions.map(r => (
                <Pressable
                  key={r.id}
                  onPress={() => setSelectedRegion(r.id)}
                  style={[styles.option, selectedRegion === r.id && {borderColor: colors.primary, backgroundColor: colors.primary + '10'}]}
                >
                  <Text style={{color: selectedRegion === r.id ? colors.primary : colors.textPrimary, fontSize: 13}}>
                    {r.name}
                  </Text>
                </Pressable>
              ))}
            </>
          )}

          {showDistrict && districts.length > 0 && (
            <>
              <Text style={[styles.label, {color: colors.textSecondary, marginTop: 12}]}>District *</Text>
              {districts.map(d => (
                <Pressable
                  key={d.id}
                  onPress={() => setSelectedDistrict(d.id)}
                  style={[styles.option, selectedDistrict === d.id && {borderColor: colors.primary, backgroundColor: colors.primary + '10'}]}
                >
                  <Text style={{color: selectedDistrict === d.id ? colors.primary : colors.textPrimary, fontSize: 13}}>
                    {d.name}
                  </Text>
                </Pressable>
              ))}
            </>
          )}

          {showSubdistrict && subdistricts.length > 0 && (
            <>
              <Text style={[styles.label, {color: colors.textSecondary, marginTop: 12}]}>Sub-District *</Text>
              {subdistricts.map(s => (
                <Pressable
                  key={s.id}
                  onPress={() => setSelectedSubdistrict(s.id)}
                  style={[styles.option, selectedSubdistrict === s.id && {borderColor: colors.primary, backgroundColor: colors.primary + '10'}]}
                >
                  <Text style={{color: selectedSubdistrict === s.id ? colors.primary : colors.textPrimary, fontSize: 13}}>
                    {s.name}
                  </Text>
                </Pressable>
              ))}
            </>
          )}

          {showFacility && facilities.length > 0 && (
            <>
              <Text style={[styles.label, {color: colors.textSecondary, marginTop: 12}]}>Facility Scope</Text>
              <Text style={[styles.hint, {color: colors.textSecondary}]}>Facility-level users will be scoped to all facilities under the selected sub-district/district.</Text>
            </>
          )}
        </View>

        <Pressable
          style={[styles.saveButton, {backgroundColor: colors.primary}, saving && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.saveButtonText}>{editing ? 'Update' : 'Create'}</Text>
          )}
        </Pressable>
        {editing && (
          <Pressable style={[styles.deleteButton, {borderColor: '#EF4444'}]} onPress={handleDelete}>
            <Text style={[styles.deleteButtonText, {color: '#EF4444'}]}>Delete</Text>
          </Pressable>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1},
  center: {flex: 1, alignItems: 'center', justifyContent: 'center'},
  header: {flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 12},
  back: {fontSize: 16},
  title: {fontSize: 18, fontWeight: '700'},
  content: {padding: 16, gap: 12},
  card: {borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', gap: 8},
  sectionTitle: {fontSize: 16, fontWeight: '700', marginBottom: 4},
  label: {fontSize: 11, fontWeight: '600', textTransform: 'uppercase', marginTop: 8},
  hint: {fontSize: 11, fontStyle: 'italic'},
  input: {borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 14, minHeight: 48},
  option: {paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, marginTop: 4},
  saveButton: {padding: 14, borderRadius: 12, alignItems: 'center'},
  saveButtonText: {color: '#fff', fontWeight: '700', fontSize: 15},
  buttonDisabled: {opacity: 0.6},
  deleteButton: {padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1},
  deleteButtonText: {fontWeight: '700', fontSize: 15},
});
