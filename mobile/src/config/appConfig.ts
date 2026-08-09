/**
 * Application configuration. No external provider API keys live on the
 * device — telecom and AI credentials are server-side only (LANG-010).
 *
 * Sync, retention, and auto-lock values are configurable via the server
 * config store (spec §33). Getters read from configStore with fallback
 * to the safe defaults below.
 */
import { getConfigNumber } from '../core/sync/configStore';

export const AppConfig = {
  // Versioned API (NFR-002). Point at the Django backend.
  apiBaseUrl: __DEV__
    ? 'http://10.0.2.2:8000/api/v1' // Android emulator -> host machine
    : 'https://web-production-a4e4b.up.railway.app/api/v1',

  appName: 'MCH VoiceCare',
  appVersion: '0.1.0',

  // Synchronisation (§55). Resumable batches with exponential retry (SYNC-008).
  // Values are configurable via configStore (spec §33).
  sync: {
    get backgroundIntervalMinutes(): number {
      return getConfigNumber('SYNC_INTERVAL_MINUTES', 15);
    },
    get maxRetryAttempts(): number {
      return getConfigNumber('SYNC_MAX_RETRY_ATTEMPTS', 5);
    },
    get retryBackoffBaseMs(): number {
      return getConfigNumber('SYNC_RETRY_BACKOFF_BASE_MS', 2000);
    },
  },

  // OFF-002: encrypted local storage; retention per approved device policy (SYNC-010).
  offline: {
    databaseName: 'mch_voicecare.db',
    get dataExpiryDays(): number {
      return getConfigNumber('SCAN_RETENTION_DAYS', 30);
    },
    // SQLCipher encryption parameters (OFF-002).
    // Key is stored securely via react-native-keychain, not hardcoded.
    encryption: {
      enabled: true,
      keychainService: 'com.mchvoicecare.dbkey',
      keychainAccount: 'sqlcipher_key',
      cipherPageSize: 4096,
      kdfIterations: 256000,
      cipherHmacAlgorithm: 'HMAC_SHA512',
    },
  },

  // Security: app auto-lock after inactivity (spec §22.2).
  // The app locks (returns to login) after this many seconds without user interaction.
  // Default: 5 minutes (300s). Configurable via configStore (spec §33).
  security: {
    get autoLockTimeoutSeconds(): number {
      return getConfigNumber('APP_AUTO_LOCK_TIMEOUT_SECONDS', 300);
    },
  },
} as const;
