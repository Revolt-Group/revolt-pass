import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Globe } from 'lucide-react';
import { es } from './locales/es.ts';
import { en } from './locales/en.ts';
import type { SupportedLanguage, TranslationPath, TranslationSchema } from './types.ts';

const STORAGE_KEY = 'revolt_lang';

const dictionaries: Record<SupportedLanguage, TranslationSchema> = {
  es,
  en,
};

interface I18nContextValue {
  lang: SupportedLanguage;
  setLang: (lang: SupportedLanguage) => void;
  toggleLang: () => void;
  t: (path: TranslationPath | string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLanguage(): SupportedLanguage {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'es' || saved === 'en') {
      return saved;
    }
  } catch {
    // Ignore storage read errors
  }

  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en';
  }

  return 'es';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<SupportedLanguage>(getInitialLanguage);

  const setLang = useCallback((newLang: SupportedLanguage) => {
    setLangState(newLang);
    try {
      localStorage.setItem(STORAGE_KEY, newLang);
      document.documentElement.lang = newLang;
    } catch {
      // Ignore storage write errors
    }
  }, []);

  const toggleLang = useCallback(() => {
    setLang(lang === 'es' ? 'en' : 'es');
  }, [lang, setLang]);

  useEffect(() => {
    try {
      document.documentElement.lang = lang;
    } catch {
      // Ignore in non-browser environments
    }
  }, [lang]);

  const t = useCallback(
    (path: TranslationPath | string, params?: Record<string, string | number>): string => {
      const currentDict = dictionaries[lang] || dictionaries.es;
      const parts = path.split('.');

      let current: unknown = currentDict;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = (current as Record<string, unknown>)[part];
        } else {
          // Fallback to Spanish dictionary if key missing in target language
          let fallback: unknown = dictionaries.es;
          for (const fallbackPart of parts) {
            if (fallback && typeof fallback === 'object' && fallbackPart in fallback) {
              fallback = (fallback as Record<string, unknown>)[fallbackPart];
            } else {
              fallback = undefined;
              break;
            }
          }
          current = fallback;
          break;
        }
      }

      let text = typeof current === 'string' ? current : path;

      if (params) {
        for (const [key, value] of Object.entries(params)) {
          text = text.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), String(value));
        }
      }

      return text;
    },
    [lang]
  );

  const value = useMemo(
    () => ({
      lang,
      setLang,
      toggleLang,
      t,
    }),
    [lang, setLang, toggleLang, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useTranslation must be used within an I18nProvider');
  }
  return context;
}

/**
 * Minimalist, precision-engineered segmented toggle for language switching.
 */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { lang, setLang } = useTranslation();

  return (
    <div
      className={`inline-flex items-center bg-[#111215] border border-white/[0.08] hairline-top rounded-lg p-0.5 text-[11px] font-mono select-none ${className}`}
      role="group"
      aria-label="Language selector"
    >
      <div className="flex items-center gap-1 pl-1.5 pr-1 text-zinc-500">
        <Globe className="w-3 h-3 text-zinc-400" />
      </div>
      <button
        type="button"
        onClick={() => setLang('es')}
        className={`px-1.5 py-0.5 rounded font-medium transition-all ${
          lang === 'es'
            ? 'bg-white text-black shadow-sm font-semibold'
            : 'text-zinc-400 hover:text-white'
        }`}
        title="Cambiar a Español"
      >
        ES
      </button>
      <span className="text-zinc-600">/</span>
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`px-1.5 py-0.5 rounded font-medium transition-all ${
          lang === 'en'
            ? 'bg-white text-black shadow-sm font-semibold'
            : 'text-zinc-400 hover:text-white'
        }`}
        title="Switch to English"
      >
        EN
      </button>
    </div>
  );
}
