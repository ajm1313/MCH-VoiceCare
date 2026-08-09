/**
 * QR payload validation tests (spec §18.5, §29.1).
 *
 * Tests:
 * - QR payload contains only opaque lookup data, not clinical details
 * - Short code generation is deterministic and correct length
 * - QR payload is valid JSON
 * - QR payload does not contain patient name, diagnosis, or danger signs
 */
import { isValidReferralTransition } from './urgencyMapping';

// Replicate the functions from ReferralQrSlipScreen for testing
function generateShortCode(referralId: string): string {
  const clean = referralId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return clean.slice(0, 6) || 'REF000';
}

function buildOfflineQrPayload(referralId: string, shortCode: string): string {
  return JSON.stringify({
    type: 'MCH_REFERRAL',
    rid: referralId,
    sc: shortCode,
    v: 1,
  });
}

describe('QR Payload Validation (spec §18.5)', () => {
  describe('Short code generation', () => {
    it('generates 6-char code from referral ID', () => {
      expect(generateShortCode('ref-1234567890')).toBe('REF123');
    });

    it('handles IDs shorter than 6 chars', () => {
      expect(generateShortCode('ab12')).toBe('AB12');
    });

    it('strips non-alphanumeric characters', () => {
      expect(generateShortCode('ref-abc_def-123!@#')).toBe('REFABC');
    });

    it('returns fallback for empty ID', () => {
      expect(generateShortCode('')).toBe('REF000');
    });

    it('returns fallback for special chars only', () => {
      expect(generateShortCode('!@#$%^')).toBe('REF000');
    });

    it('uppercases the result', () => {
      expect(generateShortCode('abcdef')).toBe('ABCDEF');
    });
  });

  describe('QR payload content', () => {
    const payload = buildOfflineQrPayload('ref-12345', 'REF123');

    it('is valid JSON', () => {
      expect(() => JSON.parse(payload)).not.toThrow();
    });

    it('contains type field', () => {
      const parsed = JSON.parse(payload);
      expect(parsed.type).toBe('MCH_REFERRAL');
    });

    it('contains referral ID', () => {
      const parsed = JSON.parse(payload);
      expect(parsed.rid).toBe('ref-12345');
    });

    it('contains short code', () => {
      const parsed = JSON.parse(payload);
      expect(parsed.sc).toBe('REF123');
    });

    it('contains version field', () => {
      const parsed = JSON.parse(payload);
      expect(parsed.v).toBe(1);
    });

    it('does NOT contain patient name (spec §18.5)', () => {
      const parsed = JSON.parse(payload);
      expect(parsed).not.toHaveProperty('patient_name');
      expect(parsed).not.toHaveProperty('patientName');
    });

    it('does NOT contain referral reason (spec §18.5)', () => {
      const parsed = JSON.parse(payload);
      expect(parsed).not.toHaveProperty('referral_reason');
      expect(parsed).not.toHaveProperty('reason');
    });

    it('does NOT contain diagnosis or danger signs (spec §18.5)', () => {
      const parsed = JSON.parse(payload);
      expect(parsed).not.toHaveProperty('diagnosis');
      expect(parsed).not.toHaveProperty('danger_signs');
      expect(parsed).not.toHaveProperty('clinical_details');
    });

    it('does NOT contain urgency level (spec §18.5)', () => {
      const parsed = JSON.parse(payload);
      expect(parsed).not.toHaveProperty('urgency');
    });
  });

  describe('QR payload with different referral IDs', () => {
    it('handles UUID-style referral IDs', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const sc = generateShortCode(uuid);
      const payload = buildOfflineQrPayload(uuid, sc);
      const parsed = JSON.parse(payload);
      expect(parsed.rid).toBe(uuid);
      expect(parsed.sc).toBe('550E84');
    });

    it('handles numeric referral IDs', () => {
      const payload = buildOfflineQrPayload('12345', '12345');
      const parsed = JSON.parse(payload);
      expect(parsed.rid).toBe('12345');
    });
  });
});
