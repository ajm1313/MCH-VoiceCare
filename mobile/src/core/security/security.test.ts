/**
 * Tests for ScreenSecurity and NotificationSanitizer (spec §22.2).
 */

// Mock react-native — must be hoisted by jest
jest.mock('react-native', () => {
  const setFlagSecure = jest.fn();
  const isFlagSecureSet = jest.fn();
  return {
    Platform: {OS: 'android'},
    NativeModules: {
      ScreenSecurity: {
        setFlagSecure,
        isFlagSecureSet,
      },
    },
    AppState: {
      addEventListener: jest.fn(() => ({
        remove: jest.fn(),
      })),
    },
  };
});

import {Platform, NativeModules} from 'react-native';
import {
  setFlagSecure,
  setFlagSecureSync,
  isFlagSecureSet,
  useScreenSecurity,
} from './ScreenSecurity';
import {
  sanitizeNotificationText,
  getGenericNotificationText,
  containsPHI,
} from './NotificationSanitizer';

// Get references to the mock functions that were created inside the factory
const mockSetFlagSecure = (NativeModules.ScreenSecurity as any).setFlagSecure;
const mockIsFlagSecureSet = (NativeModules.ScreenSecurity as any).isFlagSecureSet;

// ---------------------------------------------------------------------------
// ScreenSecurity tests
// ---------------------------------------------------------------------------

describe('ScreenSecurity', () => {
  beforeEach(() => {
    mockSetFlagSecure.mockClear();
    mockIsFlagSecureSet.mockClear();
    mockSetFlagSecure.mockResolvedValue(true);
    mockIsFlagSecureSet.mockResolvedValue(false);
    (Platform as any).OS = 'android';
  });

  describe('setFlagSecure (async)', () => {
    it('calls native module setFlagSecure on Android', async () => {
      const result = await setFlagSecure(true);
      expect(mockSetFlagSecure).toHaveBeenCalledWith(true);
      expect(result).toBe(true);
    });

    it('passes the enabled flag to native', async () => {
      await setFlagSecure(false);
      expect(mockSetFlagSecure).toHaveBeenCalledWith(false);
    });

    it('returns false on non-Android platforms', async () => {
      (Platform as any).OS = 'ios';
      const result = await setFlagSecure(true);
      expect(result).toBe(false);
      expect(mockSetFlagSecure).not.toHaveBeenCalled();
    });

    it('returns false when native call throws', async () => {
      mockSetFlagSecure.mockRejectedValue(new Error('fail'));
      const result = await setFlagSecure(true);
      expect(result).toBe(false);
    });
  });

  describe('setFlagSecureSync', () => {
    it('dispatches native call and returns true', () => {
      const result = setFlagSecureSync(true);
      expect(mockSetFlagSecure).toHaveBeenCalledWith(true);
      expect(result).toBe(true);
    });

    it('returns false on non-Android', () => {
      (Platform as any).OS = 'ios';
      const result = setFlagSecureSync(true);
      expect(result).toBe(false);
    });
  });

  describe('isFlagSecureSet', () => {
    it('returns true when native reports FLAG_SECURE is set', async () => {
      mockIsFlagSecureSet.mockResolvedValue(true);
      const result = await isFlagSecureSet();
      expect(result).toBe(true);
    });

    it('returns false when native reports FLAG_SECURE is not set', async () => {
      mockIsFlagSecureSet.mockResolvedValue(false);
      const result = await isFlagSecureSet();
      expect(result).toBe(false);
    });

    it('returns false on non-Android', async () => {
      (Platform as any).OS = 'ios';
      const result = await isFlagSecureSet();
      expect(result).toBe(false);
    });
  });

  describe('useScreenSecurity hook', () => {
    it('setFlagSecureSync is available for the hook to call', () => {
      const result = setFlagSecureSync(true);
      expect(result).toBe(true);
      expect(mockSetFlagSecure).toHaveBeenCalledWith(true);
    });

    it('useScreenSecurity is a function (hook export check)', () => {
      expect(typeof useScreenSecurity).toBe('function');
    });
  });
});

// ---------------------------------------------------------------------------
// NotificationSanitizer tests
// ---------------------------------------------------------------------------

describe('NotificationSanitizer', () => {
  describe('sanitizeNotificationText', () => {
    it('returns empty input unchanged', () => {
      expect(sanitizeNotificationText('')).toBe('');
    });

    it('removes patient names after "for"', () => {
      const input = 'Referral for John Doe';
      const result = sanitizeNotificationText(input);
      expect(result).not.toContain('John Doe');
      expect(result).toContain('for a patient');
    });

    it('removes "Patient: <name>" patterns', () => {
      const input = 'Patient: Ama Mensah';
      const result = sanitizeNotificationText(input);
      expect(result).not.toContain('Ama Mensah');
      expect(result).toContain('[redacted]');
    });

    it('removes UUID patient IDs', () => {
      const input = 'Patient 550e8400-e29b-41d4-a716-446655440000 has new alert';
      const result = sanitizeNotificationText(input);
      expect(result).not.toContain('550e8400-e29b-41d4-a716-446655440000');
      expect(result).toContain('[ID redacted]');
    });

    it('removes MRN patterns', () => {
      const input = 'MRN: ABC123456 needs follow-up';
      const result = sanitizeNotificationText(input);
      expect(result).not.toContain('ABC123456');
      expect(result).toContain('MRN: [redacted]');
    });

    it('removes Ghana phone numbers', () => {
      const input = 'Call patient at 024 123 4567';
      const result = sanitizeNotificationText(input);
      expect(result).not.toContain('024 123 4567');
      expect(result).toContain('[phone redacted]');
    });

    it('removes +233 phone numbers', () => {
      const input = 'Contact: +233241234567';
      const result = sanitizeNotificationText(input);
      expect(result).not.toContain('+233241234567');
      expect(result).toContain('[phone redacted]');
    });

    it('removes BP readings', () => {
      const input = 'BP: 140/90 mmHg';
      const result = sanitizeNotificationText(input);
      expect(result).not.toContain('140/90');
      expect(result).toContain('[vital redacted]');
    });

    it('removes temperature readings', () => {
      const input = 'Temp: 38.5 C';
      const result = sanitizeNotificationText(input);
      expect(result).not.toContain('38.5');
      expect(result).toContain('[vital redacted]');
    });

    it('removes haemoglobin values', () => {
      const input = 'Hb: 7.2 g/dL';
      const result = sanitizeNotificationText(input);
      expect(result).not.toContain('7.2');
      expect(result).toContain('[lab redacted]');
    });

    it('removes diagnosis text', () => {
      const input = 'Diagnosis: Severe preeclampsia';
      const result = sanitizeNotificationText(input);
      expect(result).not.toContain('Severe preeclampsia');
      expect(result).toContain('[redacted]');
    });

    it('leaves non-PHI text unchanged', () => {
      const input = 'New referral received';
      const result = sanitizeNotificationText(input);
      expect(result).toBe('New referral received');
    });

    it('handles multiple PHI patterns in one string', () => {
      const input = 'Referral for John Doe, MRN: ABC123456, call 024 123 4567';
      const result = sanitizeNotificationText(input);
      expect(result).not.toContain('John Doe');
      expect(result).not.toContain('ABC123456');
      expect(result).not.toContain('024 123 4567');
    });
  });

  describe('getGenericNotificationText', () => {
    it('returns generic message for known type', () => {
      expect(getGenericNotificationText('referral_created')).toBe('New referral received');
    });

    it('returns generic message for emergency_alert', () => {
      expect(getGenericNotificationText('emergency_alert')).toBe(
        'Emergency alert — action required',
      );
    });

    it('returns default message for unknown type', () => {
      expect(getGenericNotificationText('unknown_type')).toBe('New notification');
    });

    it('returns default message for empty type', () => {
      expect(getGenericNotificationText('')).toBe('New notification');
    });

    it('all generic messages are PHI-free', () => {
      const types = [
        'referral_created',
        'referral_acknowledged',
        'referral_escalated',
        'referral_completed',
        'emergency_alert',
        'danger_sign_detected',
        'task_assigned',
        'task_overdue',
        'sync_complete',
        'sync_error',
      ];
      for (const type of types) {
        const msg = getGenericNotificationText(type);
        expect(containsPHI(msg)).toBe(false);
      }
    });
  });

  describe('containsPHI', () => {
    it('returns true for text with patient name', () => {
      expect(containsPHI('Referral for John Doe')).toBe(true);
    });

    it('returns true for text with UUID', () => {
      expect(containsPHI('Patient 550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('returns true for text with phone number', () => {
      expect(containsPHI('Call 024 123 4567')).toBe(true);
    });

    it('returns false for clean text', () => {
      expect(containsPHI('New referral received')).toBe(false);
    });

    it('returns false for empty text', () => {
      expect(containsPHI('')).toBe(false);
    });
  });
});
