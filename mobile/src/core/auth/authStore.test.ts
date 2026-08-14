/**
 * Tests for auth store (SEC-001/SEC-002/SEC-003).
 */
import { useAuthStore } from './authStore';

// Mock react-native-keychain
jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn().mockResolvedValue(true),
  getGenericPassword: jest.fn().mockResolvedValue(false),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
}));

// Mock sync outbox
jest.mock('../sync/outbox', () => ({
  getQueueDepth: jest.fn().mockReturnValue(0),
}));
jest.mock('../../config/appConfig', () => ({
  AppConfig: {
    apiBaseUrl: 'http://localhost:8000/api/v1',
    sync: { backgroundIntervalMinutes: 15, maxRetryAttempts: 5, retryBackoffBaseMs: 2000 },
    offline: { databaseName: 'test.db', dataExpiryDays: 30 },
  },
}));

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

const Keychain = require('react-native-keychain');

describe('authStore — login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: null, token: null, isLoading: false, error: null });
  });

  it('sets user and token on successful login', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        token: 'abc123',
        refreshToken: 'refresh456',
        expiresAt: '2025-01-01T12:00:00Z',
        user: {
          id: 'u1', username: 'worker', fullName: 'Test Worker',
          isActive: true, isStaff: false, isSuperuser: false,
          isSuperAdmin: false, isFacilityLevelOnly: true,
          systemRole: 'FACILITY_CLINICAL_USER',
          role: { code: 'FACILITY_CLINICAL_USER', name: 'Facility Clinical User', level: 4 },
          location: { region_id: null, region_name: null, district_id: null, district_name: null, subdistrict_id: null, subdistrict_name: null, facility_id: 'f1', facility_name: 'Clinic A', facility_type: 'CHPS' },
        },
      }),
    });

    const result = await useAuthStore.getState().login('worker', 'pass123');
    expect(result).toBe(true);
    const state = useAuthStore.getState();
    expect(state.token).toBe('abc123');
    expect(state.refreshToken).toBe('refresh456');
    expect(state.user?.username).toBe('worker');
    expect(state.user?.isFacilityLevelOnly).toBe(true);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeNull();
  });

  it('stores credentials in keychain on success', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        token: 'tok',
        refreshToken: 'rtok',
        expiresAt: '2025-01-01T12:00:00Z',
        user: {
          id: 'u1', username: 'w', fullName: 'W',
          isActive: true, isStaff: false, isSuperuser: false,
          isSuperAdmin: false, isFacilityLevelOnly: false,
          systemRole: 'R',
          role: { code: 'R', name: 'R', level: 1 },
          location: { region_id: null, region_name: null, district_id: null, district_name: null, subdistrict_id: null, subdistrict_name: null, facility_id: null, facility_name: null, facility_type: null },
        },
      }),
    });

    await useAuthStore.getState().login('w', 'p');
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      'w',
      expect.stringContaining('"token":"tok"'),
      { service: 'mch_voicecare_auth' },
    );
  });

  it('returns false on invalid credentials', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ detail: 'Invalid credentials' }),
    });

    const result = await useAuthStore.getState().login('bad', 'creds');
    expect(result).toBe(false);
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
    expect(state.error).toBe('Invalid credentials');
  });

  it('handles network errors', async () => {
    mockFetch.mockRejectedValue(new Error('Network failure'));

    const result = await useAuthStore.getState().login('w', 'p');
    expect(result).toBe(false);
    const state = useAuthStore.getState();
    expect(state.error).toBe('Network failure');
    expect(state.isLoading).toBe(false);
  });
});

describe('authStore — restoreSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({ user: null, token: null });
  });

  it('restores user and token from keychain', async () => {
    Keychain.getGenericPassword.mockResolvedValue({
      username: 'worker',
      password: JSON.stringify({
        token: 'restored-tok',
        refreshToken: 'rtok',
        expiresAt: '2099-01-01T12:00:00Z',
        user: { id: 'u1', username: 'worker', fullName: 'W',
          isActive: true, isStaff: false, isSuperuser: false,
          isSuperAdmin: false, isFacilityLevelOnly: false,
          systemRole: 'R',
          role: { code: 'R', name: 'R', level: 1 },
          location: { region_id: null, region_name: null, district_id: null, district_name: null, subdistrict_id: null, subdistrict_name: null, facility_id: null, facility_name: null, facility_type: null },
        },
      }),
    });

    await useAuthStore.getState().restoreSession();
    const state = useAuthStore.getState();
    expect(state.token).toBe('restored-tok');
    expect(state.user?.username).toBe('worker');
  });

  it('does nothing when no stored credentials', async () => {
    Keychain.getGenericPassword.mockResolvedValue(false);

    await useAuthStore.getState().restoreSession();
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
  });
});

describe('authStore — logout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: { id: 'u1', username: 'w', fullName: 'W',
        isActive: true, isStaff: false, isSuperuser: false,
        isSuperAdmin: false, isFacilityLevelOnly: false,
        systemRole: 'R',
        role: { code: 'R', name: 'R', level: 1 },
        location: { region_id: null, region_name: null, district_id: null, district_name: null, subdistrict_id: null, subdistrict_name: null, facility_id: null, facility_name: null, facility_type: null },
      },
      token: 'tok',
      refreshToken: 'rtok',
      expiresAt: '2025-01-01T12:00:00Z',
    });
  });

  it('clears user and token', async () => {
    await useAuthStore.getState().logout();
    const state = useAuthStore.getState();
    expect(state.token).toBeNull();
    expect(state.user).toBeNull();
  });

  it('resets keychain on logout', async () => {
    await useAuthStore.getState().logout();
    expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
      service: 'mch_voicecare_auth',
    });
  });
});
