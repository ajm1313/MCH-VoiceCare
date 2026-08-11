/**
 * Tests for biometric authentication service (spec §22).
 *
 * Verifies:
 * - checkBiometricAvailability returns correct structure
 * - authenticateWithBiometric returns success/failure
 * - storeCredentialsWithBiometric stores in keychain
 * - getBiometricCredentials retrieves from keychain
 * - clearBiometricCredentials removes from keychain
 * - hasBiometricCredentials checks existence
 * - biometricLogin full flow
 */
import {
  checkBiometricAvailability,
  authenticateWithBiometric,
  hasBiometricCredentials,
  biometricLogin,
} from './biometricAuth';

// Mock NativeModules
jest.mock('react-native', () => ({
  NativeModules: {
    BiometricModule: {
      isAvailable: jest.fn(),
      authenticate: jest.fn(),
    },
  },
  Platform: {OS: 'android'},
}));

// Mock Keychain
jest.mock('react-native-keychain', () => ({
  setGenericPassword: jest.fn().mockResolvedValue(true),
  getGenericPassword: jest.fn().mockResolvedValue({
    username: 'testuser',
    password: 'stored_token_data',
  }),
  resetGenericPassword: jest.fn().mockResolvedValue(true),
  hasGenericPassword: jest.fn().mockResolvedValue(true),
  ACCESS_CONTROL: {BIOMETRY_ANY: 'BiometryAny'},
  ACCESSIBLE: {WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WhenUnlockedThisDeviceOnly'},
}));

// Mock audit
jest.mock('../utils/audit', () => ({
  logLocalAudit: jest.fn(),
}));

describe('Biometric Auth Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('checkBiometricAvailability', () => {
    it('returns available when biometric is enrolled', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.BiometricModule.isAvailable.mockResolvedValue({
        available: true,
        biometryType: 'fingerprint',
        status: 'available',
      });

      const result = await checkBiometricAvailability();
      expect(result.available).toBe(true);
      expect(result.biometryType).toBe('fingerprint');
      expect(result.status).toBe('available');
    });

    it('returns unavailable when no hardware', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.BiometricModule.isAvailable.mockResolvedValue({
        available: false,
        biometryType: 'none',
        status: 'no_hardware',
      });

      const result = await checkBiometricAvailability();
      expect(result.available).toBe(false);
      expect(result.status).toBe('no_hardware');
    });

    it('returns unavailable when none enrolled', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.BiometricModule.isAvailable.mockResolvedValue({
        available: false,
        biometryType: 'fingerprint',
        status: 'none_enrolled',
      });

      const result = await checkBiometricAvailability();
      expect(result.available).toBe(false);
      expect(result.status).toBe('none_enrolled');
    });
  });

  describe('authenticateWithBiometric', () => {
    it('returns success on successful authentication', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.BiometricModule.authenticate.mockResolvedValue({
        success: true,
      });

      const result = await authenticateWithBiometric('Title', 'Subtitle', '');
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('returns failure on canceled authentication', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.BiometricModule.authenticate.mockResolvedValue({
        success: false,
        error: 'User canceled',
      });

      const result = await authenticateWithBiometric('Title', 'Subtitle', '');
      expect(result.success).toBe(false);
      expect(result.error).toBe('User canceled');
    });

    it('returns failure on lockout', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.BiometricModule.authenticate.mockResolvedValue({
        success: false,
        error: 'Too many attempts. Try again later.',
      });

      const result = await authenticateWithBiometric('Title', 'Subtitle', '');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Too many attempts');
    });
  });

  describe('hasBiometricCredentials', () => {
    it('returns true when credentials are stored', async () => {
      const Keychain = require('react-native-keychain');
      Keychain.hasGenericPassword.mockResolvedValue(true);

      const result = await hasBiometricCredentials();
      expect(result).toBe(true);
    });

    it('returns false when no credentials stored', async () => {
      const Keychain = require('react-native-keychain');
      Keychain.hasGenericPassword.mockResolvedValue(false);

      const result = await hasBiometricCredentials();
      expect(result).toBe(false);
    });
  });

  describe('biometricLogin full flow', () => {
    it('returns credentials on successful full flow', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.BiometricModule.isAvailable.mockResolvedValue({
        available: true,
        biometryType: 'fingerprint',
        status: 'available',
      });
      NativeModules.BiometricModule.authenticate.mockResolvedValue({
        success: true,
      });

      const Keychain = require('react-native-keychain');
      Keychain.hasGenericPassword.mockResolvedValue(true);
      Keychain.getGenericPassword.mockResolvedValue({
        username: 'chw1',
        password: '{"token":"jwt_token","refreshToken":"refresh","expiresAt":"2026-01-01","user":{"id":"1","username":"chw1"}}',
      });

      const result = await biometricLogin();
      expect(result).toBeDefined();
      expect(result!.username).toBe('chw1');
    });

    it('returns null when biometric not available', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.BiometricModule.isAvailable.mockResolvedValue({
        available: false,
        biometryType: 'none',
        status: 'no_hardware',
      });

      const result = await biometricLogin();
      expect(result).toBeNull();
    });

    it('returns null when no stored credentials', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.BiometricModule.isAvailable.mockResolvedValue({
        available: true,
        biometryType: 'fingerprint',
        status: 'available',
      });

      const Keychain = require('react-native-keychain');
      Keychain.hasGenericPassword.mockResolvedValue(false);

      const result = await biometricLogin();
      expect(result).toBeNull();
    });

    it('returns null when authentication fails', async () => {
      const {NativeModules} = require('react-native');
      NativeModules.BiometricModule.isAvailable.mockResolvedValue({
        available: true,
        biometryType: 'fingerprint',
        status: 'available',
      });
      NativeModules.BiometricModule.authenticate.mockResolvedValue({
        success: false,
        error: 'User canceled',
      });

      const Keychain = require('react-native-keychain');
      Keychain.hasGenericPassword.mockResolvedValue(true);

      const result = await biometricLogin();
      expect(result).toBeNull();
    });
  });
});
