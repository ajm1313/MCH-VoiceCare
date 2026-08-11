/**
 * Device provisioning — calls POST /api/v1/accounts/auth/device-provision/
 * after login to register the device and receive bootstrap configuration.
 *
 * The returned config includes ML mode, feature flags, sync settings, and
 * active rule bundle version — all needed for offline-first operation.
 */
import { Platform } from 'react-native';
import { AppConfig } from '../../config/appConfig';
import { useAuthStore } from './authStore';
import { setCachedJSON, getCachedJSON, CACHE_KEYS } from '../sync/contentCache';
import { apiFetch } from '../security/secureFetch';

export interface DeviceProvisionResponse {
  provisioned: boolean;
  deviceId: string;
  userId: string;
  username: string;
  systemRole: string;
  organisationUnitId: string | null;
  organisationUnitName: string | null;
  config: {
    clinical_ml_mode: string;
    feature_flags: {
      ocr_enabled: boolean;
      ivr_dtmf_enabled: boolean;
      ussd_enabled: boolean;
      speech_capture_enabled: boolean;
      remote_emergency_cascade_enabled: boolean;
      print_referral_slip_enabled: boolean;
    };
    sync: {
      batch_size: number;
      retry_max: number;
      retry_backoff_base_seconds: number;
    };
    active_rule_bundle_version: string;
  };
}

function getDeviceId(): string {
  // Generate a stable device ID from keychain or use a temporary one
  // In production, this would use a device ID library
  return `device-${Platform.OS}-${Date.now()}`;
}

export async function provisionDevice(): Promise<DeviceProvisionResponse | null> {
  const { token, user } = useAuthStore.getState();
  if (!token || !user) {
    return null;
  }

  const deviceId = getDeviceId();
  const body = {
    device_id: deviceId,
    device_model: Platform.OS === 'ios' ? 'iOS' : 'Android',
    os_version: Platform.Version?.toString() ?? '',
    app_version: AppConfig.appVersion ?? '1.0.0',
  };

  try {
    const resp = await apiFetch(`${AppConfig.apiBaseUrl}/accounts/auth/device-provision/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      return null;
    }

    const data = (await resp.json()) as DeviceProvisionResponse;

    // Cache the bootstrap config locally for offline use
    setCachedJSON(CACHE_KEYS.DEVICE_CONFIG, data, data.config.active_rule_bundle_version, 168);

    return data;
  } catch {
    return null;
  }
}

export function getCachedDeviceConfig(): DeviceProvisionResponse | null {
  return getCachedJSON<DeviceProvisionResponse>(CACHE_KEYS.DEVICE_CONFIG);
}
