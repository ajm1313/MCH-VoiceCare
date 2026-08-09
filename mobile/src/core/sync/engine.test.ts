/**
 * Tests for sync engine (SYNC-001..SYNC-010).
 */
import { setPostFunction, syncOnce, subscribeToSyncDepth, setLastServerCursor } from './engine';

// Mock outbox
jest.mock('./outbox', () => ({
  getPending: jest.fn(),
  updateStatus: jest.fn(),
  getQueueDepth: jest.fn(() => 0),
}));

// Mock pull
jest.mock('./pull', () => ({
  pullAll: jest.fn(() => Promise.resolve({ totalPulled: 0 })),
}));

const { getPending, updateStatus } = require('./outbox');

describe('syncOnce', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setLastServerCursor(null);
  });

  it('returns zero counts when no post function set', async () => {
    setPostFunction(null as any);
    const result = await syncOnce();
    expect(result).toEqual({ synced: 0, failed: 0 });
  });

  it('returns zero counts when no pending records', async () => {
    (getPending as jest.Mock).mockReturnValue([]);
    const mockPost = jest.fn();
    setPostFunction(mockPost as any);
    const result = await syncOnce();
    expect(result).toEqual({ synced: 0, failed: 0 });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('marks record SYNCED on 200 OK via /sync/batch', async () => {
    const record = {
      clientId: 'abc',
      idempotencyKey: 'abc:1',
      entityType: 'pregnancy',
      payload: {},
      createdAtLocal: '2026-01-01',
      deviceId: 'dev-1',
      ruleSetVersion: 'v1',
      syncStatus: 'NOT_SYNCED',
      attempts: 0,
    };
    (getPending as jest.Mock).mockReturnValue([record]);
    const mockPost = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        acceptedEventIds: ['abc:1'],
        rejectedEvents: [],
        serverChanges: [],
        nextServerCursor: 'cursor-1',
      }),
    });
    setPostFunction(mockPost as any);

    const result = await syncOnce();
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(updateStatus).toHaveBeenCalledWith('abc', 'SYNCED');
    // Should have called /sync/batch endpoint
    expect(mockPost).toHaveBeenCalledTimes(1);
    const callUrl = mockPost.mock.calls[0][0];
    expect(callUrl).toContain('/sync/batch');
  });

  it('marks record CONFLICT on 409 (batch fails, legacy fallback)', async () => {
    const record = {
      clientId: 'abc',
      idempotencyKey: 'abc:1',
      entityType: 'pregnancy',
      payload: {},
      createdAtLocal: '2026-01-01',
      deviceId: 'dev-1',
      ruleSetVersion: 'v1',
      syncStatus: 'NOT_SYNCED',
      attempts: 0,
    };
    (getPending as jest.Mock).mockReturnValue([record]);
    // First call: /sync/batch returns 409 → fallback
    // Second call: /sync/ legacy returns 409
    const mockPost = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ clientId: 'abc', errors: { field: ['err'] } }),
      });
    setPostFunction(mockPost as any);

    const result = await syncOnce();
    expect(result.failed).toBe(1);
    expect(updateStatus).toHaveBeenCalledWith(
      'abc',
      'CONFLICT',
      expect.stringContaining('field'),
    );
  });

  it('marks record REJECTED on 4xx (non-409) via legacy fallback', async () => {
    const record = {
      clientId: 'abc',
      idempotencyKey: 'abc:1',
      entityType: 'pregnancy',
      payload: {},
      createdAtLocal: '2026-01-01',
      deviceId: 'dev-1',
      ruleSetVersion: 'v1',
      syncStatus: 'NOT_SYNCED',
      attempts: 0,
    };
    (getPending as jest.Mock).mockReturnValue([record]);
    const mockPost = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: () => Promise.resolve({ clientId: 'abc', errors: { field: ['bad'] } }),
      });
    setPostFunction(mockPost as any);

    const result = await syncOnce();
    expect(result.failed).toBe(1);
    expect(updateStatus).toHaveBeenCalledWith(
      'abc',
      'REJECTED',
      expect.any(String),
    );
  });

  it('marks record RETRY_PENDING on 5xx via legacy fallback', async () => {
    const record = {
      clientId: 'abc',
      idempotencyKey: 'abc:1',
      entityType: 'pregnancy',
      payload: {},
      createdAtLocal: '2026-01-01',
      deviceId: 'dev-1',
      ruleSetVersion: 'v1',
      syncStatus: 'NOT_SYNCED',
      attempts: 0,
    };
    (getPending as jest.Mock).mockReturnValue([record]);
    const mockPost = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ clientId: 'abc', errors: {} }),
      });
    setPostFunction(mockPost as any);

    const result = await syncOnce();
    expect(result.failed).toBe(1);
    expect(updateStatus).toHaveBeenCalledWith(
      'abc',
      'RETRY_PENDING',
      expect.stringContaining('HTTP 500'),
    );
  });

  it('rejects records that exceeded max retry attempts', async () => {
    const record = {
      clientId: 'abc',
      idempotencyKey: 'abc:1',
      entityType: 'pregnancy',
      payload: {},
      createdAtLocal: '2026-01-01',
      deviceId: 'dev-1',
      ruleSetVersion: 'v1',
      syncStatus: 'RETRY_PENDING',
      attempts: 99, // exceeds maxRetryAttempts (5)
    };
    (getPending as jest.Mock).mockReturnValue([record]);
    const mockPost = jest.fn();
    setPostFunction(mockPost as any);

    const result = await syncOnce();
    expect(result.failed).toBe(1);
    expect(mockPost).not.toHaveBeenCalled();
    expect(updateStatus).toHaveBeenCalledWith(
      'abc',
      'REJECTED',
      'Max retry attempts exceeded',
    );
  });

  it('marks record REJECTED when /sync/batch rejects the event', async () => {
    const record = {
      clientId: 'abc',
      idempotencyKey: 'abc:1',
      entityType: 'pregnancy',
      payload: {},
      createdAtLocal: '2026-01-01',
      deviceId: 'dev-1',
      ruleSetVersion: 'v1',
      syncStatus: 'NOT_SYNCED',
      attempts: 0,
    };
    (getPending as jest.Mock).mockReturnValue([record]);
    const mockPost = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        acceptedEventIds: [],
        rejectedEvents: [
          { eventId: 'abc:1', code: 'VALIDATION_ERROR', message: 'Invalid data' },
        ],
        serverChanges: [],
        nextServerCursor: 'cursor-2',
      }),
    });
    setPostFunction(mockPost as any);

    const result = await syncOnce();
    expect(result.failed).toBe(1);
    expect(updateStatus).toHaveBeenCalledWith(
      'abc',
      'REJECTED',
      'Invalid data',
    );
  });

  it('marks record CONFLICT when /sync/batch returns VERSION_CONFLICT', async () => {
    const record = {
      clientId: 'abc',
      idempotencyKey: 'abc:1',
      entityType: 'referrals',
      payload: {},
      createdAtLocal: '2026-01-01',
      deviceId: 'dev-1',
      ruleSetVersion: 'v1',
      syncStatus: 'NOT_SYNCED',
      attempts: 0,
    };
    (getPending as jest.Mock).mockReturnValue([record]);
    const mockPost = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        acceptedEventIds: [],
        rejectedEvents: [
          { eventId: 'abc:1', code: 'VERSION_CONFLICT', message: 'Version conflict' },
        ],
        serverChanges: [],
        nextServerCursor: 'cursor-3',
      }),
    });
    setPostFunction(mockPost as any);

    const result = await syncOnce();
    expect(result.failed).toBe(1);
    expect(updateStatus).toHaveBeenCalledWith(
      'abc',
      'CONFLICT',
      'Version conflict',
    );
  });
});

describe('subscribeToSyncDepth', () => {
  it('calls listener after sync completes', async () => {
    (getPending as jest.Mock).mockReturnValue([]);
    setPostFunction(jest.fn() as any);

    const cb = jest.fn();
    const unsub = subscribeToSyncDepth(cb);

    await syncOnce();
    expect(cb).toHaveBeenCalledWith(0);

    unsub();
  });
});
