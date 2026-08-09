/**
 * Tests for outbox queue management (SYNC-001/SYNC-003/SYNC-008).
 */
import { enqueue, getPending, updateStatus, getQueueDepth } from './outbox';

// The mock from jest.setup.js provides a basic in-memory stub.
// We augment it per-test for deterministic assertions.
jest.mock('../db/database', () => {
  const mockQuery = jest.fn(() => []);
  const mockExecute = jest.fn();
  return {
    getDb: jest.fn(() => ({ execute: mockExecute })),
    query: mockQuery,
  };
});

// Re-import to get the mocked version
const dbModule = require('../db/database');
const mockQuery = dbModule.query as jest.Mock;
const mockExecute = dbModule.getDb().execute as jest.Mock;

describe('outbox — enqueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('generates a UUID clientId and inserts into the outbox table', () => {
    const clientId = enqueue('pregnancy', { foo: 'bar' }, 'device-1', 'v1.0');
    expect(clientId).toBeDefined();
    expect(typeof clientId).toBe('string');
    expect(clientId.length).toBeGreaterThan(0);
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain('INSERT INTO outbox');
    expect(params[0]).toBe(clientId);
    expect(params[2]).toBe('pregnancy');
    expect(params[3]).toBe(JSON.stringify({ foo: 'bar' }));
    expect(params[5]).toBe('device-1');
    expect(params[6]).toBe('v1.0');
  });

  it('stores entityId, operation, and localVersion when provided via options', () => {
    const clientId = enqueue(
      'pregnancy',
      { foo: 'bar' },
      'device-1',
      'v1.0',
      { entityId: 'entity-uuid-123', operation: 'UPSERT', localVersion: 3 },
    );
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain('entity_id');
    expect(sql).toContain('operation');
    expect(sql).toContain('local_version');
    expect(params[7]).toBe('entity-uuid-123');
    expect(params[8]).toBe('UPSERT');
    expect(params[9]).toBe(3);
  });

  it('defaults operation to UPSERT and localVersion to 1 when not provided', () => {
    enqueue('pregnancy', { foo: 'bar' }, 'device-1', 'v1.0');
    const [, params] = mockExecute.mock.calls[0];
    expect(params[7]).toBeNull();
    expect(params[8]).toBe('UPSERT');
    expect(params[9]).toBe(1);
  });
});

describe('outbox — getPending', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns mapped records from query results', () => {
    const fakeRow = {
      client_id: 'abc-123',
      idempotency_key: 'abc-123:1234',
      entity_type: 'pregnancy',
      payload: JSON.stringify({ data: 'test' }),
      created_at_local: '2026-01-01T00:00:00Z',
      device_id: 'dev-1',
      rule_set_version: 'v1',
      sync_status: 'NOT_SYNCED',
      attempts: 0,
      last_error: null,
      last_attempt_at: null,
      entity_id: 'entity-uuid-456',
      operation: 'UPSERT',
      local_version: 2,
    };
    mockQuery.mockReturnValue([fakeRow]);

    const records = getPending(10);
    expect(records).toHaveLength(1);
    expect(records[0].clientId).toBe('abc-123');
    expect(records[0].entityType).toBe('pregnancy');
    expect(records[0].payload).toEqual({ data: 'test' });
    expect(records[0].syncStatus).toBe('NOT_SYNCED');
    expect(records[0].entityId).toBe('entity-uuid-456');
    expect(records[0].operation).toBe('UPSERT');
    expect(records[0].localVersion).toBe(2);
  });

  it('returns empty array when no records', () => {
    mockQuery.mockReturnValue([]);
    const records = getPending();
    expect(records).toHaveLength(0);
  });
});

describe('outbox — updateStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('increments attempts on RETRY_PENDING', () => {
    updateStatus('abc-123', 'RETRY_PENDING', 'HTTP 500');
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql, params] = mockExecute.mock.calls[0];
    expect(sql).toContain('attempts = attempts + 1');
    expect(params[0]).toBe('RETRY_PENDING');
    expect(params[1]).toBe('HTTP 500');
    expect(params[3]).toBe('abc-123');
  });

  it('does not increment attempts on SYNCED', () => {
    updateStatus('abc-123', 'SYNCED');
    expect(mockExecute).toHaveBeenCalledTimes(1);
    const [sql] = mockExecute.mock.calls[0];
    expect(sql).not.toContain('attempts = attempts + 1');
  });
});

describe('outbox — getQueueDepth', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns count from query', () => {
    mockQuery.mockReturnValue([{ cnt: 5 }]);
    expect(getQueueDepth()).toBe(5);
  });

  it('returns 0 when no rows', () => {
    mockQuery.mockReturnValue([]);
    expect(getQueueDepth()).toBe(0);
  });
});
