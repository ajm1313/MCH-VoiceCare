/**
 * LanguageProvider — React context provider for i18n (spec §31).
 *
 * Wraps the app and exposes the current language and translation function
 * to all child components via useTranslation().
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from 'react';

import {
  LanguageCode,
  t as translate,
  initI18n,
  changeLanguage as changeLang,
  getCurrentLanguage,
  getAvailableLanguages,
  onLanguageChange,
} from './index';

interface LanguageContextValue {
  /** Current active language code */
  language: LanguageCode;
  /** Translation function */
  t: (key: string, options?: Record<string, string | number>) => string;
  /** Change the active language */
  changeLanguage: (lang: LanguageCode) => Promise<void>;
  /** List of available language codes */
  availableLanguages: LanguageCode[];
  /** Whether i18n has finished initializing */
  ready: boolean;
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  t: (key: string) => key,
  changeLanguage: async () => {},
  availableLanguages: ['en', 'dag', 'gon'],
  ready: false,
});

interface LanguageProviderProps {
  children: ReactNode;
}

export function LanguageProvider({children}: LanguageProviderProps): React.JSX.Element {
  const [language, setLanguage] = useState<LanguageCode>(getCurrentLanguage());
  const [ready, setReady] = useState<boolean>(false);

  // Initialize i18n on mount
  useEffect(() => {
    let mounted = true;

    initI18n().then(lang => {
      if (mounted) {
        setLanguage(lang);
        setReady(true);
      }
    });

    // Subscribe to language changes
    const unsubscribe = onLanguageChange((lang: LanguageCode) => {
      if (mounted) {
        setLanguage(lang);
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const handleChangeLanguage = useCallback(async (lang: LanguageCode) => {
    await changeLang(lang);
    setLanguage(lang);
  }, []);

  const value: LanguageContextValue = {
    language,
    t: translate,
    changeLanguage: handleChangeLanguage,
    availableLanguages: getAvailableLanguages(),
    ready,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

/**
 * Hook to access the i18n context.
 *
 * @returns {language, t, changeLanguage, availableLanguages, ready}
 */
export function useLanguageContext(): LanguageContextValue {
  return useContext(LanguageContext);
}
