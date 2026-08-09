/**
 * useTranslation — React hook for accessing translations (spec §31).
 *
 * Returns the translation function and current language from the
 * LanguageProvider context.
 *
 * Usage:
 *   const { t, language, changeLanguage } = useTranslation();
 *   <Text>{t('navigation.home')}</Text>
 */
import {useCallback} from 'react';
import {useLanguageContext} from './LanguageProvider';
import type {LanguageCode} from './index';

interface UseTranslationResult {
  /** Current active language code */
  language: LanguageCode;
  /** Translation function — t(key, options?) */
  t: (key: string, options?: Record<string, string | number>) => string;
  /** Change the active language */
  changeLanguage: (lang: LanguageCode) => Promise<void>;
  /** List of available language codes */
  availableLanguages: LanguageCode[];
  /** Whether i18n has finished initializing */
  ready: boolean;
}

/**
 * Hook for accessing the i18n translation function and language state.
 *
 * @returns Translation function, current language, and language management utilities.
 */
export function useTranslation(): UseTranslationResult {
  const {language, t, changeLanguage, availableLanguages, ready} =
    useLanguageContext();

  // Wrap t in a useCallback so the reference is stable per render
  const stableT = useCallback(
    (key: string, options?: Record<string, string | number>) => t(key, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language, t],
  );

  return {
    language,
    t: stableT,
    changeLanguage,
    availableLanguages,
    ready,
  };
}
