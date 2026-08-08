/**
 * Tests for sync pull service (SYNC-006).
 */
import { setGetFunction, pullOnce, pullAll } from './pull';

// Mock database
jest.mock('../db/database', () => {
  const mockExecute = jest.fn();
  const mockQuery = jest.fn(() => []);
  return {
    getDb: jest.fn(() => ({ execute: mockExecute })),
    query: mockQuery,
  };
});

// Mock auth store
jest.mock('../auth/authStore', () => ({
  useAuthStore: {
    getState: jest.fn(() => ({ token: 'test-token-123' })),
  },
}));

// Mock app config
jest.mock('../../config/appConfig', () => ({
  AppConfig: {
    apiBaseUrl: 'http://localhost:8000/api/v1',
    sync: { backgroundIntervalMinutes: 15, maxRetryAttempts: 5, retryBackoffBaseMs: 2000 },
    offline: { databaseName: 'test.db', dataExpiryDays: 30 },
  },
}));

const { query } = require('../db/database');
const { useAuthStore } = require('../auth/authStore');

describe('pullOnce', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (query as jest.Mock).mockReturnValue([]);
  });

  it('returns pulled=0 when no get function set', async () => {
    setGetFunction(null as any);
    const result = await pullOnce();
    expect(result).toEqual({ pulled: 0 });
  });

  it('returns pulled=0 when no auth token', async () => {
    (useAuthStore.getState as jest.Mock).mockReturnValue({ token: null });
    const mockGet = jest.fn();
    setGetFunction(mockGet as any);
    const result = await pullOnce();
    expect(result).toEqual({ pulled: 0 });
    expect(mockGet).not.toHaveBeenCalled();
    // Restore token for subsequent tests
    (useAuthStore.getState as jest.Mock).mockReturnValue({ token: 'test-token-123' });
  });

  it('pulls records from a single sync response', async () => {
    (useAuthStore.getState as jest.Mock).mockReturnValue({ token: 'test-token-123' });
    const mockGet = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        synced_at: '2026-01-01T12:00:00Z',
        records: {
          pregnancy_episodes: [
            { id: 'ep-1', status: 'ACTIVE', woman_id: 'w-1', updated_at: '2026-01-01' },
          ],
          persons: [
            { id: 'p-1', full_name: 'Test Patient' },
          ],
        },
      }),
    });
    setGetFunction(mockGet as any);

    const result = await pullOnce();
    expect(result.pulled).toBe(2);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('handles empty records object', async () => {
    (useAuthStore.getState as jest.Mock).mockReturnValue({ token: 'test-token-123' });
    const mockGet = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        synced_at: '2026-01-01T12:00:00Z',
        records: {},
      }),
    });
    setGetFunction(mockGet as any);

    const result = await pullOnce();
    expect(result.pulled).toBe(0);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('stops on non-ok response', async () => {
    (useAuthStore.getState as jest.Mock).mockReturnValue({ token: 'test-token-123' });
    const mockGet = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({}),
    });
    setGetFunction(mockGet as any);

    const result = await pullOnce();
    expect(result.pulled).toBe(0);
  });

  it('stops on network error', async () => {
    (useAuthStore.getState as jest.Mock).mockReturnValue({ token: 'test-token-123' });
    const mockGet = jest.fn().mockRejectedValue(new Error('Network error'));
    setGetFunction(mockGet as any);

    const result = await pullOnce();
    expect(result.pulled).toBe(0);
  });
});

describe('pullAll', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (query as jest.Mock).mockReturnValue([]);
    (useAuthStore.getState as jest.Mock).mockReturnValue({ token: 'test-token-123' });
  });

  it('aggregates pulled counts from single sync response', async () => {
    const mockGet = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        synced_at: '2026-01-01T12:00:00Z',
        records: {
          pregnancy_episodes: [{ id: 'ep-1' }],
          persons: [{ id: 'p-1' }],
          households: [{ id: 'h-1' }],
        },
      }),
    });
    setGetFunction(mockGet as any);

    const result = await pullAll();
    expect(result.totalPulled).toBe(3);
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('returns 0 when no get function set', async () => {
    setGetFunction(null as any);
    const result = await pullAll();
    expect(result.totalPulled).toBe(0);
  });
});
