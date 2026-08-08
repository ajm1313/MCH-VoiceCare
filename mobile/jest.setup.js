// Mock react-native-nitro-sqlite to avoid native module loading in Jest
jest.mock('react-native-nitro-sqlite', () => {
  const _store = new Map();
  const mockExecute = jest.fn((sql, params) => {
    const op = sql.trim().toUpperCase();
    if (op.startsWith('INSERT')) {
      return { rows: { _array: [], length: 0, item: () => undefined } };
    }
    if (op.startsWith('UPDATE')) {
      return { rows: { _array: [], length: 0, item: () => undefined } };
    }
    if (op.startsWith('DELETE')) {
      return { rows: { _array: [], length: 0, item: () => undefined } };
    }
    if (op.startsWith('SELECT COUNT')) {
      return { rows: { _array: [{ cnt: 0 }], length: 1, item: () => ({ cnt: 0 }) } };
    }
    if (op.startsWith('SELECT')) {
      return { rows: { _array: [], length: 0, item: () => undefined } };
    }
    return { rows: { _array: [], length: 0, item: () => undefined } };
  });
  const mockExecuteBatch = jest.fn();
  return {
    NitroSQLite: {
      open: jest.fn(() => ({
        execute: mockExecute,
        executeBatch: mockExecuteBatch,
        close: jest.fn(),
      })),
    },
  };
});
