/**
 * i18n — lightweight internationalization module for MCH VoiceCare (spec §31).
 *
 * Supports three languages: English (en), Dagbani (dag), Gonja (gon).
 *
 * Provides:
 *   - t(key, options): translate a key to the current language
 *   - changeLanguage(lang): switch the active language
 *   - getAvailableLanguages(): list supported language codes
 *   - getCurrentLanguage(): get the active language code
 *
 * Language detection order:
 *   1. Stored preference (AsyncStorage)
 *   2. Device locale (if supported)
 *   3. Default: 'en'
 */
import {Platform, NativeModules} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import en from './locales/en.json';
import dag from './locales/dag.json';
import gon from './locales/gon.json';

export type LanguageCode = 'en' | 'dag' | 'gon';

/** All supported locale resources. */
const LOCALES: Record<LanguageCode, Record<string, unknown>> = {
  en: en as Record<string, unknown>,
  dag: dag as Record<string, unknown>,
  gon: gon as Record<string, unknown>,
};

const LANGUAGE_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  dag: 'Dagbani',
  gon: 'Gonja',
};

const STORAGE_KEY = '@mch_voicecare_language';
const DEFAULT_LANGUAGE: LanguageCode = 'en';

// ── Internal state ──
let currentLanguage: LanguageCode = DEFAULT_LANGUAGE;
let listeners: Array<(lang: LanguageCode) => void> = [];
let initialized = false;

/**
 * Detect the device's preferred language and map to a supported code.
 */
function detectDeviceLanguage(): LanguageCode {
  try {
    let deviceLocale: string | undefined;

    if (Platform.OS === 'ios') {
      deviceLocale =
        NativeModules.SettingsManager?.settings?.AppleLocale ||
        NativeModules.SettingsManager?.settings?.AppleLanguages?.[0];
    } else {
      deviceLocale = NativeModules.I18nManager?.localeIdentifier;
    }

    if (!deviceLocale) {
      return DEFAULT_LANGUAGE;
    }

    const lower = deviceLocale.toLowerCase();
    if (lower.startsWith('en')) return 'en';
    if (lower.startsWith('dag') || lower.startsWith('dga')) return 'dag';
    if (lower.startsWith('gon') || lower.startsWith('gjn')) return 'gon';

    return DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

/**
 * Initialize i18n — loads the stored language preference or detects from device.
 * Call this once at app startup (before rendering).
 */
export async function initI18n(): Promise<LanguageCode> {
  if (initialized) {
    return currentLanguage;
  }
  initialized = true;

  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored && stored in LOCALES) {
      currentLanguage = stored as LanguageCode;
      return currentLanguage;
    }
  } catch {
    // AsyncStorage not available — fall through to detection
  }

  currentLanguage = detectDeviceLanguage();
  return currentLanguage;
}

/**
 * Resolve a nested key path (e.g. "navigation.home") in a locale object.
 */
function resolveKey(
  obj: Record<string, unknown>,
  keyPath: string,
): string | undefined {
  const parts = keyPath.split('.');
  let current: unknown = obj;

  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  if (typeof current === 'string') {
    return current;
  }
  return undefined;
}

/**
 * Interpolate {{placeholder}} values in a translation string.
 */
function interpolate(
  template: string,
  options?: Record<string, string | number>,
): string {
  if (!options) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = options[key];
    return value !== undefined ? String(value) : `{{${key}}}`;
  });
}

/**
 * Translate a key to the current language.
 *
 * Falls back to English if the key is missing in the current language,
 * then falls back to the key itself if missing in English too.
 *
 * @param key Dot-notation key (e.g. "navigation.home")
 * @param options Optional interpolation values (e.g. {name: "John"})
 * @returns Translated string
 */
export function t(
  key: string,
  options?: Record<string, string | number>,
): string {
  // Try current language
  let value = resolveKey(LOCALES[currentLanguage], key);

  // Fallback to English
  if (value === undefined && currentLanguage !== DEFAULT_LANGUAGE) {
    value = resolveKey(LOCALES[DEFAULT_LANGUAGE], key);
  }

  // Fallback to the key itself
  if (value === undefined) {
    return key;
  }

  return interpolate(value, options);
}

/**
 * Change the active language. Persists the choice to AsyncStorage and
 * notifies all registered listeners.
 *
 * @param lang The language code to switch to.
 */
export async function changeLanguage(lang: LanguageCode): Promise<void> {
  if (!(lang in LOCALES)) {
    return;
  }
  if (lang === currentLanguage) {
    return;
  }

  currentLanguage = lang;

  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Storage may not be available — language change is still in-memory
  }

  // Notify listeners
  for (const listener of listeners) {
    try {
      listener(lang);
    } catch {
      // Listener error should not break language switching
    }
  }
}

/**
 * Get the currently active language code.
 */
export function getCurrentLanguage(): LanguageCode {
  return currentLanguage;
}

/**
 * Get a list of all available language codes.
 */
export function getAvailableLanguages(): LanguageCode[] {
  return Object.keys(LOCALES) as LanguageCode[];
}

/**
 * Get a list of available languages with their display names.
 */
export function getAvailableLanguagesWithNames(): Array<{
  code: LanguageCode;
  name: string;
}> {
  return getAvailableLanguages().map(code => ({
    code,
    name: LANGUAGE_NAMES[code],
  }));
}

/**
 * Register a listener that is called when the language changes.
 * Returns an unsubscribe function.
 */
export function onLanguageChange(
  listener: (lang: LanguageCode) => void,
): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter(l => l !== listener);
  };
}

/**
 * Set the current language synchronously (without persistence).
 * Primarily used for testing.
 */
export function _setLanguageForTesting(lang: LanguageCode): void {
  currentLanguage = lang;
}

/**
 * Reset i18n state (for testing).
 */
export function _resetForTesting(): void {
  currentLanguage = DEFAULT_LANGUAGE;
  listeners = [];
  initialized = false;
}

// Re-export types
export type {LanguageCode as Language};
