/**
 * Tests for offline clinician override (spec §10.2 #14).
 *
 * When the network is unavailable, the override should be persisted to the
 * local outbox and synced later. A local audit event is written immediately.
 */
import { submitClinicianOverride, type OverrideRequest } from './clinicianOverride';

// Mock auth store
jest.mock('../auth/authStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({
      token: 'test-jwt-token',
      deviceId: 'test-device-001',
    })),
  },
}));

// Mock outbox enqueue
type EnqueueArgs = [string, Record<string, unknown>, string, string, Record<string, unknown>?];
const mockEnqueue = jest.fn((...args: EnqueueArgs) => 'client-id-123');
jest.mock('../sync/outbox', () => ({
  enqueue: (...args: EnqueueArgs) => mockEnqueue(...args),
}));

// Mock database
jest.mock('../db/database', () => ({
  getDb: jest.fn(() => ({ execute: jest.fn() })),
  query: jest.fn(() => []),
}));

// Mock audit
const mockLogLocalAudit = jest.fn();
jest.mock('../utils/audit', () => ({
  logLocalAudit: (...args: unknown[]) => mockLogLocalAudit(...args),
}));

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'override-uuid-001'),
}));

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

describe('clinicianOverride — offline support', () => {
  const baseReq: OverrideRequest = {
    episode_type: 'PregnancyEpisode',
    episode_id: 'ep-001',
    prior_recommendation: 'PRIORITY_REVIEW',
    resulting_action: 'CONFIRM',
    override_reason: 'Patient stable on re-check',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes local audit event immediately even when online', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        override_id: 'server-uuid',
        action: 'CONFIRM',
        description: 'Confirmed',
        recorded: true,
        audit_logged: true,
      }),
    });

    const result = await submitClinicianOverride(baseReq);

    expect(result.ok).toBe(true);
    expect(mockLogLocalAudit).toHaveBeenCalledTimes(1);
    expect(mockLogLocalAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLINICIAN_OVERRIDE',
        entityType: 'PregnancyEpisode',
        entityId: 'ep-001',
      }),
    );
  });

  it('enqueues to outbox when network fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

    const result = await submitClinicianOverride(baseReq);

    expect(result.ok).toBe(true);
    expect(result.data?.pending_sync).toBe(true);
    expect(result.data?.override_id).toBe('override-uuid-001');
    expect(mockEnqueue).toHaveBeenCalledTimes(1);

    const [, payload, deviceId, ruleSetVersion, options] = mockEnqueue.mock.calls[0] as EnqueueArgs;
    expect(payload.override_id).toBe('override-uuid-001');
    expect(payload.episode_id).toBe('ep-001');
    expect(payload.resulting_action).toBe('CONFIRM');
    expect(deviceId).toBe('test-device-001');
    expect(ruleSetVersion).toBe('local');
    expect(options?.entityId).toBe('override-uuid-001');
  });

  it('enqueues to outbox on 5xx server error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ detail: 'Service unavailable' }),
    });

    const result = await submitClinicianOverride(baseReq);

    expect(result.ok).toBe(true);
    expect(result.data?.pending_sync).toBe(true);
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
  });

  it('does NOT enqueue on 4xx client error (validation/conflict)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ detail: 'Emergency rules cannot be de-escalated' }),
    });

    const result = await submitClinicianOverride({
      ...baseReq,
      prior_recommendation: 'EMERGENCY',
      resulting_action: 'DEESCALATE',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toContain('Emergency rules cannot be de-escalated');
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it('writes local audit even when enqueueing for offline sync', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network request failed'));

    await submitClinicianOverride(baseReq);

    expect(mockLogLocalAudit).toHaveBeenCalledTimes(1);
    const auditCall = mockLogLocalAudit.mock.calls[0][0];
    expect(auditCall.metadata.override_id).toBe('override-uuid-001');
    expect(auditCall.metadata.resulting_action).toBe('CONFIRM');
  });

  it('returns error when not authenticated', async () => {
    const authModule = require('../auth/authStore');
    authModule.useAuthStore.getState = jest.fn(() => ({ token: null, deviceId: '' }));

    const result = await submitClinicianOverride(baseReq);

    expect(result.ok).toBe(false);
    expect(result.error).toBe('Not authenticated');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
