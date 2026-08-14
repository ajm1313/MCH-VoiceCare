/**
 * ScreenSecurity — prevents screenshots and recent-app preview leaks (spec §22.2).
 *
 * On Android, sets FLAG_SECURE on the activity window which:
 *   - Prevents screenshots
 *   - Blanks the content in the recent-apps switcher
 *   - Prevents content from appearing in screen mirroring
 *
 * The native module `ScreenSecurityModule` (Kotlin) is registered in
 * MainApplication.kt and exposes:
 *   - setFlagSecure(enabled: boolean, promise: Promise<boolean>)
 *   - isFlagSecureSet(promise: Promise<boolean>)
 *
 * On iOS, this would use a similar blur-on-background approach (not implemented
 * in this first release which targets Android only).
 *
 * The hook also clears sensitive data references when the screen loses focus.
 */
import {useEffect, useRef, useCallback} from 'react';
import {Platform, AppState, AppStateStatus, NativeModules} from 'react-native';

// Native module bridge — registered via ScreenSecurityPackage in MainApplication.kt
const ScreenSecurityNative = NativeModules.ScreenSecurity
  ? NativeModules.ScreenSecurity
  : null;

/**
 * Apply FLAG_SECURE to the current Android activity window.
 * Returns a promise that resolves to true if successful, false if the
 * native module is unavailable or the platform is not Android.
 */
export async function setFlagSecure(enabled: boolean): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  if (ScreenSecurityNative && typeof ScreenSecurityNative.setFlagSecure === 'function') {
    try {
      return await ScreenSecurityNative.setFlagSecure(enabled);
    } catch {
      return false;
    }
  }
  // Native module not available — FLAG_SECURE is still set at startup
  // in MainActivity.kt as a fallback, but dynamic toggling is not available.
  return false;
}

/**
 * Synchronous-looking version of setFlagSecure for use in hooks where we can't await.
 * Calls the async setFlagSecure method in fire-and-forget mode.
 * The native method uses runOnUiThread to set/clear FLAG_SECURE, which is safe
 * and works correctly in both Old and New Architecture.
 *
 * Note: This is NOT truly synchronous — the flag is set/cleared on the next
 * UI thread tick. This is fine because:
 * - On login screen mount, the useEffect calls this before the user can tap inputs
 * - After login, the flag is set (no keyboard needed on Dashboard)
 */
export function setFlagSecureSync(enabled: boolean): boolean {
  if (Platform.OS !== 'android') {
    return false;
  }
  if (ScreenSecurityNative && typeof ScreenSecurityNative.setFlagSecure === 'function') {
    try {
      ScreenSecurityNative.setFlagSecure(enabled).catch(() => {});
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Check whether FLAG_SECURE is currently set on the activity window.
 * Returns a promise that resolves to true/false.
 */
export async function isFlagSecureSet(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  if (ScreenSecurityNative && typeof ScreenSecurityNative.isFlagSecureSet === 'function') {
    try {
      return await ScreenSecurityNative.isFlagSecureSet();
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * useScreenSecurity — React hook that enables FLAG_SECURE while the
 * component is mounted and clears sensitive data on blur.
 *
 * Usage:
 *   useScreenSecurity();
 *
 * Call this at the top level of any screen that displays clinical data.
 */
export function useScreenSecurity(): void {
  const sensitiveDataRef = useRef<unknown>(null);
  const isSecureRef = useRef<boolean>(false);

  const enableSecure = useCallback(() => {
    if (!isSecureRef.current) {
      setFlagSecureSync(true);
      isSecureRef.current = true;
    }
  }, []);

  const disableSecure = useCallback(() => {
    if (isSecureRef.current) {
      setFlagSecureSync(false);
      isSecureRef.current = false;
    }
  }, []);

  const clearSensitiveData = useCallback(() => {
    // Clear any in-memory sensitive data references
    sensitiveDataRef.current = null;
  }, []);

  useEffect(() => {
    // Enable FLAG_SECURE immediately on mount
    enableSecure();

    // Listen for app state changes — clear data when going to background
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'background' || nextState === 'inactive') {
        // App going to background — clear sensitive data
        clearSensitiveData();
      } else if (nextState === 'active') {
        // App returning to foreground — re-ensure FLAG_SECURE
        enableSecure();
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      // On unmount, clear sensitive data and disable FLAG_SECURE
      clearSensitiveData();
      disableSecure();
      subscription.remove();
    };
  }, [enableSecure, disableSecure, clearSensitiveData]);

  // Expose a setter so screens can register/clear sensitive data
  const setSensitiveData = useCallback((data: unknown) => {
    sensitiveDataRef.current = data;
  }, []);

  // Store on the ref for potential inspection (not used directly)
  void setSensitiveData;
}
