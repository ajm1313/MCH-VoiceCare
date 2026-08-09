/**
 * Application configuration. No external provider API keys live on the
 * device — telecom and AI credentials are server-side only (LANG-010).
 */
export const AppConfig = {
  // Versioned API (NFR-002). Point at the Django backend.
  apiBaseUrl: __DEV__
    ? 'http://10.0.2.2:8000/api/v1' // Android emulator -> host machine
    : 'https://web-production-a4e4b.up.railway.app/api/v1',

  appName: 'MCH VoiceCare',
  appVersion: '0.1.0',

  // Synchronisation (§55). Resumable batches with exponential retry (SYNC-008).
  sync: {
    backgroundIntervalMinutes: 15,
    maxRetryAttempts: 5,
    retryBackoffBaseMs: 2000,
  },

  // OFF-002: encrypted local storage; retention per approved device policy (SYNC-010).
  offline: {
    databaseName: 'mch_voicecare.db',
    dataExpiryDays: 30,
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
  // Default: 5 minutes (300s). Can be overridden by server config CFG_AUTO_LOCK_TIMEOUT_SECONDS.
  security: {
    autoLockTimeoutSeconds: 300,
  },
} as const;
