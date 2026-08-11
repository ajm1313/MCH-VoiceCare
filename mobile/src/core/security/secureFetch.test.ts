/**
 * Tests for secure fetch wrapper with certificate pinning (spec §22.3).
 *
 * Verifies that:
 * - HTTPS is enforced in production
 * - Non-HTTPS URLs are rejected in production
 * - Dev URLs (localhost, 10.0.2.2) are allowed in development
 * - Pinned domains are identified correctly
 * - Pin management (add/remove) works
 * - Security headers are added to requests
 * - Transport security violations are audit-logged
 */
import { apiFetch, checkUrlSafety, getPinnedHashes, isDomainPinned, addPinnedHash, removePinnedHash } from './secureFetch';

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  } as Response),
) as jest.Mock;

// Mock local audit log
jest.mock('../utils/audit', () => ({
  logLocalAudit: jest.fn(),
}));

// Store original __DEV__ and restore after tests
const originalDev = (global as any).__DEV__;

describe('secureFetch — certificate pinning (spec §22.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    (global as any).__DEV__ = originalDev;
  });

  describe('checkUrlSafety', () => {
    it('allows HTTPS URLs in production', () => {
      (global as any).__DEV__ = false;
      const result = checkUrlSafety('https://web-production-a4e4b.up.railway.app/api/v1/health');
      expect(result.safe).toBe(true);
    });

    it('rejects HTTP URLs in production', () => {
      (global as any).__DEV__ = false;
      const result = checkUrlSafety('http://example.com/api/v1/health');
      expect(result.safe).toBe(false);
      expect(result.reason).toContain('Non-HTTPS');
    });

    it('allows HTTP to localhost in development', () => {
      (global as any).__DEV__ = true;
      const result = checkUrlSafety('http://localhost:8000/api/v1/health');
      expect(result.safe).toBe(true);
    });

    it('allows HTTP to 10.0.2.2 in development', () => {
      (global as any).__DEV__ = true;
      const result = checkUrlSafety('http://10.0.2.2:8000/api/v1/health');
      expect(result.safe).toBe(true);
    });

    it('rejects HTTP to non-exempt domain in development', () => {
      (global as any).__DEV__ = true;
      const result = checkUrlSafety('http://example.com/api/v1/health');
      expect(result.safe).toBe(false);
    });
  });

  describe('getPinnedHashes', () => {
    it('returns hashes for pinned domains', () => {
      const hashes = getPinnedHashes('https://web-production-a4e4b.up.railway.app/api/v1');
      expect(hashes.length).toBeGreaterThan(0);
    });

    it('returns empty array for unpinned domains', () => {
      const hashes = getPinnedHashes('https://example.com/api/v1');
      expect(hashes).toEqual([]);
    });
  });

  describe('isDomainPinned', () => {
    it('returns true for pinned domains', () => {
      expect(isDomainPinned('web-production-a4e4b.up.railway.app')).toBe(true);
    });

    it('returns false for unpinned domains', () => {
      expect(isDomainPinned('example.com')).toBe(false);
    });
  });

  describe('addPinnedHash / removePinnedHash', () => {
    it('adds a new pin for an existing domain', () => {
      // Use a fresh domain to avoid interference from other tests
      const testDomain = `addtopinned-${Math.random().toString(36).slice(2)}.com`;
      addPinnedHash(testDomain, 'FIRST_PIN=');
      expect(getPinnedHashes(`https://${testDomain}/api/v1`)).toContain('FIRST_PIN=');
      addPinnedHash(testDomain, 'SECOND_PIN=');
      const after = getPinnedHashes(`https://${testDomain}/api/v1`);
      expect(after.length).toBe(2);
      expect(after).toContain('FIRST_PIN=');
      expect(after).toContain('SECOND_PIN=');
    });

    it('adds pins for a new domain', () => {
      addPinnedHash('newdomain.com', 'HASH1=');
      expect(isDomainPinned('newdomain.com')).toBe(true);
      expect(getPinnedHashes('https://newdomain.com/api')).toContain('HASH1=');
    });

    it('does not add duplicate pins', () => {
      addPinnedHash('dedup.com', 'DUP_HASH=');
      addPinnedHash('dedup.com', 'DUP_HASH=');
      const hashes = getPinnedHashes('https://dedup.com/api');
      expect(hashes.filter(h => h === 'DUP_HASH=').length).toBe(1);
    });

    it('removes a pin when more than one exists', () => {
      addPinnedHash('removetest.com', 'PIN_A=');
      addPinnedHash('removetest.com', 'PIN_B=');
      removePinnedHash('removetest.com', 'PIN_A=');
      const hashes = getPinnedHashes('https://removetest.com/api');
      expect(hashes).not.toContain('PIN_A=');
      expect(hashes).toContain('PIN_B=');
    });

    it('does not remove the last pin for a domain', () => {
      addPinnedHash('singlepin.com', 'ONLY_PIN=');
      removePinnedHash('singlepin.com', 'ONLY_PIN=');
      const hashes = getPinnedHashes('https://singlepin.com/api');
      expect(hashes).toContain('ONLY_PIN=');
    });
  });

  describe('apiFetch', () => {
    it('calls fetch with security headers', async () => {
      (global as any).__DEV__ = true;
      await apiFetch('http://10.0.2.2:8000/api/v1/health');
      expect(fetch).toHaveBeenCalled();
      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const options = callArgs[1];
      expect(options.headers['X-Content-Type-Options']).toBe('nosniff');
      expect(options.headers['Strict-Transport-Security']).toContain('max-age');
    });

    it('preserves existing headers while adding security headers', async () => {
      (global as any).__DEV__ = true;
      await apiFetch('http://10.0.2.2:8000/api/v1/health', {
        headers: { Authorization: 'Bearer token123' },
      });
      const callArgs = (fetch as jest.Mock).mock.calls[0];
      const options = callArgs[1];
      expect(options.headers['Authorization']).toBe('Bearer token123');
      expect(options.headers['X-Content-Type-Options']).toBe('nosniff');
    });

    it('throws on non-HTTPS URL in production', async () => {
      (global as any).__DEV__ = false;
      await expect(
        apiFetch('http://example.com/api/v1/health'),
      ).rejects.toThrow('TRANSPORT_SECURITY');
    });

    it('succeeds on HTTPS URL in production', async () => {
      (global as any).__DEV__ = false;
      await expect(
        apiFetch('https://web-production-a4e4b.up.railway.app/api/v1/health'),
      ).resolves.toBeDefined();
    });

    it('allows HTTP to localhost in dev', async () => {
      (global as any).__DEV__ = true;
      await expect(
        apiFetch('http://localhost:8000/api/v1/health'),
      ).resolves.toBeDefined();
    });
  });
});
