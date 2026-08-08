/**
 * Tests for sync engine (SYNC-001..SYNC-010).
 */
import { setPostFunction, syncOnce, subscribeToSyncDepth } from './engine';

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

  it('marks record SYNCED on 200 OK', async () => {
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
      json: () => Promise.resolve({}),
    });
    setPostFunction(mockPost as any);

    const result = await syncOnce();
    expect(result.synced).toBe(1);
    expect(result.failed).toBe(0);
    expect(updateStatus).toHaveBeenCalledWith('abc', 'SYNCED');
  });

  it('marks record CONFLICT on 409', async () => {
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

  it('marks record REJECTED on 4xx (non-409)', async () => {
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

  it('marks record RETRY_PENDING on 5xx', async () => {
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
