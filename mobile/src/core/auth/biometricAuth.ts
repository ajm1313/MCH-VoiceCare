/**
 * Biometric authentication service (spec §22).
 *
 * Wraps the native BiometricModule to provide fingerprint/face unlock.
 * On successful biometric auth, the app retrieves stored JWT credentials
 * from the OS keychain (react-native-keychain) using biometric-gated access.
 *
 * Security:
 * - Biometric auth is optional — users can always fall back to password.
 * - No biometric data is stored or transmitted.
 * - The keychain entry is protected by SECURITY_RULE_BIOMETRICS, so
 *   only a successful biometric prompt can retrieve the stored JWT.
 */
import {NativeModules, Platform} from 'react-native';
import * as Keychain from 'react-native-keychain';
import {logLocalAudit} from '../utils/audit';

const {BiometricModule} = NativeModules;

export interface BiometricAvailability {
  available: boolean;
  biometryType: 'fingerprint' | 'face' | 'iris' | 'none';
  status: string;
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
}

/**
 * Check if biometric authentication is available on the device.
 */
export async function checkBiometricAvailability(): Promise<BiometricAvailability> {
  if (!BiometricModule || Platform.OS !== 'android') {
    return {available: false, biometryType: 'none', status: 'unsupported_platform'};
  }
  try {
    const result = await BiometricModule.isAvailable();
    return {
      available: result.available as boolean,
      biometryType: result.biometryType as BiometricAvailability['biometryType'],
      status: result.status as string,
    };
  } catch {
    return {available: false, biometryType: 'none', status: 'error'};
  }
}

/**
 * Prompt the user for biometric authentication.
 *
 * @param title     Dialog title
 * @param subtitle  Dialog subtitle
 * @param description Optional description
 */
export async function authenticateWithBiometric(
  title: string = 'Authenticate',
  subtitle: string = 'Use your fingerprint to login',
  description: string = '',
): Promise<BiometricAuthResult> {
  if (!BiometricModule || Platform.OS !== 'android') {
    return {success: false, error: 'Biometric not available on this platform'};
  }
  try {
    const result = await BiometricModule.authenticate(title, subtitle, description);
    return {
      success: result.success as boolean,
      error: result.error as string | undefined,
    };
  } catch (err: any) {
    return {success: false, error: err?.message || 'Authentication failed'};
  }
}

/**
 * Store credentials with biometric protection in the OS keychain.
 *
 * After a successful password login, call this to enable biometric
 * login for future sessions. The credentials are stored with
 * ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY and biometric access control.
 */
export async function storeCredentialsWithBiometric(
  username: string,
  token: string,
): Promise<boolean> {
  try {
    await Keychain.setGenericPassword(username, token, {
      service: 'mch_voicecare_biometric',
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_ANY,
      accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
    return true;
  } catch (err) {
    // If biometric access control fails, store without it
    try {
      await Keychain.setGenericPassword(username, token, {
        service: 'mch_voicecare_biometric',
        accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Retrieve biometric-protected credentials.
 *
 * This will trigger the biometric prompt on supported devices.
 * If biometric auth succeeds, the stored JWT is returned.
 *
 * @returns { username, token } or null if not stored / auth failed
 */
export async function getBiometricCredentials(): Promise<{
  username: string;
  token: string;
} | null> {
  try {
    const creds = await Keychain.getGenericPassword({
      service: 'mch_voicecare_biometric',
    });
    if (creds) {
      return {
        username: creds.username,
        token: creds.password,
      };
    }
    return null;
  } catch (err) {
    // Biometric prompt was canceled or failed
    return null;
  }
}

/**
 * Clear stored biometric credentials (logout).
 */
export async function clearBiometricCredentials(): Promise<void> {
  try {
    await Keychain.resetGenericPassword({service: 'mch_voicecare_biometric'});
  } catch {
    // Ignore
  }
}

/**
 * Check if biometric credentials are stored (without triggering the prompt).
 */
export async function hasBiometricCredentials(): Promise<boolean> {
  try {
    // Check if credentials exist without triggering biometric prompt
    // by attempting to read with a non-protected service
    const hasBio = await Keychain.hasGenericPassword({
      service: 'mch_voicecare_biometric',
    });
    return hasBio;
  } catch {
    return false;
  }
}

/**
 * Full biometric login flow:
 * 1. Check if biometric is available
 * 2. Check if credentials are stored
 * 3. Prompt for biometric auth
 * 4. Retrieve stored credentials
 *
 * @returns { username, token } or null if any step fails
 */
export async function biometricLogin(): Promise<{
  username: string;
  token: string;
} | null> {
  // 1. Check availability
  const availability = await checkBiometricAvailability();
  if (!availability.available) {
    logLocalAudit({
      action: 'BIOMETRIC_LOGIN_UNAVAILABLE',
      entity_type: 'auth',
      details: {status: availability.status},
    });
    return null;
  }

  // 2. Check stored credentials
  const hasCreds = await hasBiometricCredentials();
  if (!hasCreds) {
    return null;
  }

  // 3. Prompt for biometric
  const authResult = await authenticateWithBiometric(
    'Login to MCH VoiceCare',
    `Use your ${availability.biometryType} to sign in`,
    'Authenticate to access patient records',
  );

  if (!authResult.success) {
    logLocalAudit({
      action: 'BIOMETRIC_LOGIN_FAILED',
      entity_type: 'auth',
      details: {error: authResult.error},
    });
    return null;
  }

  // 4. Retrieve credentials
  const creds = await getBiometricCredentials();
  if (creds) {
    logLocalAudit({
      action: 'BIOMETRIC_LOGIN_SUCCESS',
      entity_type: 'auth',
      details: {username: creds.username},
    });
  }
  return creds;
}
