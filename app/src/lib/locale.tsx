/**
 * Reaktivní vrstva nad i18n: drží aktivní jazyk ve stavu (aby se aplikace
 * po přepnutí překreslila) a ukládá volbu do úložiště. Samotné překlady a
 * registr jazyků zůstávají v `@/i18n`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { getLanguage, setLanguage } from '@/i18n';

const STORAGE_KEY = 'dietapp.lang';

interface LocaleContextValue {
  lang: string;
  setLang: (code: string) => void;
}

const LocaleContext = createContext<LocaleContextValue>({ lang: getLanguage(), setLang: () => {} });

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState(getLanguage());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((v) => {
        if (v) {
          setLanguage(v);
          setLangState(v);
        }
      })
      .catch(() => {});
  }, []);

  const setLang = useCallback((code: string) => {
    setLanguage(code);
    setLangState(code);
    AsyncStorage.setItem(STORAGE_KEY, code).catch(() => {});
  }, []);

  return <LocaleContext.Provider value={{ lang, setLang }}>{children}</LocaleContext.Provider>;
}

export const useLocale = () => useContext(LocaleContext);
