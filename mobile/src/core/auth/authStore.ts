/**
 * Auth store — SEC-001/SEC-002/SEC-003.
 *
 * Credentials are stored in the OS keychain (react-native-keychain), never
 * in plain AsyncStorage. On login, the JWT access + refresh tokens and user
 * profile are kept in-memory via zustand and persisted to secure storage.
 */
import { create } from 'zustand';
import * as Keychain from 'react-native-keychain';
import { logLocalAudit } from '../utils/audit';

import { AppConfig } from '../../config/appConfig';
import { getQueueDepth } from '../sync/outbox';

export interface UserRole {
  code: string;
  name: string;
  level: number;
}

export interface UserLocation {
  region_id: string | null;
  region_name: string | null;
  district_id: string | null;
  district_name: string | null;
  subdistrict_id: string | null;
  subdistrict_name: string | null;
  facility_id: string | null;
  facility_name: string | null;
  facility_type: string | null;
}

export interface UserProfile {
  id: string;
  username: string;
  fullName: string;
  email?: string;
  mobileNumber?: string;
  isActive: boolean;
  isStaff: boolean;
  isSuperuser: boolean;
  isSuperAdmin: boolean;
  isFacilityLevelOnly: boolean;
  canViewReports: boolean;
  systemRole: string;
  role: UserRole;
  location: UserLocation;
  organisationUnitName?: string;
}

interface AuthState {
  user: UserProfile | null;
  token: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<boolean>;
  restoreSession: () => Promise<void>;
  logout: (force?: boolean) => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  fetchProfile: () => Promise<void>;
  checkUnsyncedBeforeLogout: () => { hasUnsynced: boolean; count: number };
}

const KEYCHAIN_SERVICE = 'mch_voicecare_auth';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  refreshToken: null,
  expiresAt: null,
  isLoading: false,
  error: null,

  login: async (username: string, password: string): Promise<boolean> => {
    set({ isLoading: true, error: null });
    try {
      const resp = await fetch(`${AppConfig.apiBaseUrl}/accounts/auth/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        set({ isLoading: false, error: errData.detail || 'Invalid credentials' });
        return false;
      }

      const data = (await resp.json()) as {
        token: string;
        refreshToken: string;
        expiresAt: string;
        user: UserProfile;
      };

      await Keychain.setGenericPassword(
        username,
        JSON.stringify({
          token: data.token,
          refreshToken: data.refreshToken,
          expiresAt: data.expiresAt,
          user: data.user,
        }),
        { service: KEYCHAIN_SERVICE },
      );

      set({
        user: data.user,
        token: data.token,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        isLoading: false,
      });
      logLocalAudit({
        action: 'LOGIN',
        entityType: 'UserAccount',
        entityId: data.user.id,
        purpose: 'ADMIN',
      });
      return true;
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : 'Network error',
      });
      return false;
    }
  },

  restoreSession: async (): Promise<void> => {
    try {
      const creds = await Keychain.getGenericPassword({
        service: KEYCHAIN_SERVICE,
      });
      if (creds) {
        const parsed = JSON.parse(creds.password) as {
          token: string;
          refreshToken: string;
          expiresAt: string;
          user: UserProfile;
        };
        set({
          user: parsed.user,
          token: parsed.token,
          refreshToken: parsed.refreshToken,
          expiresAt: parsed.expiresAt,
        });
      }
    } catch {
      // No stored credentials — user must log in
    }
  },

  refreshAccessToken: async (): Promise<string | null> => {
    const { refreshToken } = get();
    if (!refreshToken) return null;
    try {
      const resp = await fetch(`${AppConfig.apiBaseUrl}/accounts/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!resp.ok) return null;
      const data = (await resp.json()) as {
        token: string;
        refreshToken: string;
        expiresAt: string;
      };
      // Update keychain with new tokens
      const creds = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
      if (creds) {
        const parsed = JSON.parse(creds.password);
        await Keychain.setGenericPassword(
          creds.username,
          JSON.stringify({
            ...parsed,
            token: data.token,
            refreshToken: data.refreshToken,
            expiresAt: data.expiresAt,
          }),
          { service: KEYCHAIN_SERVICE },
        );
      }
      set({
        token: data.token,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
      });
      return data.token;
    } catch {
      return null;
    }
  },

  fetchProfile: async (): Promise<void> => {
    const { token } = get();
    if (!token) return;
    try {
      const resp = await fetch(`${AppConfig.apiBaseUrl}/accounts/auth/profile/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const user = (await resp.json()) as UserProfile;
      set({ user });
      // Update keychain
      const creds = await Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE });
      if (creds) {
        const parsed = JSON.parse(creds.password);
        await Keychain.setGenericPassword(
          creds.username,
          JSON.stringify({ ...parsed, user }),
          { service: KEYCHAIN_SERVICE },
        );
      }
    } catch {
      // Profile refresh is best-effort
    }
  },

  checkUnsyncedBeforeLogout: (): { hasUnsynced: boolean; count: number } => {
    const depth = getQueueDepth();
    return { hasUnsynced: depth > 0, count: depth };
  },

  logout: async (force?: boolean): Promise<void> => {
    if (!force) {
      const { hasUnsynced, count } = useAuthStore.getState().checkUnsyncedBeforeLogout();
      if (hasUnsynced) {
        throw new Error(`SYNC-009: ${count} unsynchronised record(s) pending. Pass force=true to proceed.`);
      }
    }
    // Best-effort logout call to blacklist the refresh token
    const { token, refreshToken } = get();
    if (token) {
      try {
        await fetch(`${AppConfig.apiBaseUrl}/accounts/auth/logout/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
      } catch {
        // Logout is best-effort
      }
    }
    await Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE });
    logLocalAudit({
      action: 'LOGOUT',
      entityType: 'UserAccount',
      entityId: get().user?.id ?? '',
      purpose: 'ADMIN',
    });
    set({ user: null, token: null, refreshToken: null, expiresAt: null });
  },
}));
