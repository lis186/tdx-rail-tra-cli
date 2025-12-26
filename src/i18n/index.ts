/**
 * i18n Module
 * Internationalization support for TRA CLI
 */

import { zhTW, type TranslationKeys } from './zh-TW.js';
import { en } from './en.js';
import { ja } from './ja.js';
import { ko } from './ko.js';

export type Locale = 'zh-TW' | 'en' | 'ja' | 'ko';

const translations: Record<Locale, TranslationKeys> = {
  'zh-TW': zhTW,
  en,
  ja,
  ko,
};

let currentLocale: Locale = 'zh-TW';

/**
 * Set the current locale
 */
export function setLocale(locale: Locale): void {
  if (translations[locale]) {
    currentLocale = locale;
  } else {
    console.warn(`Unknown locale: ${locale}, falling back to zh-TW`);
    currentLocale = 'zh-TW';
  }
}

/**
 * Get the current locale
 */
export function getLocale(): Locale {
  return currentLocale;
}

/**
 * Get available locales
 */
export function getAvailableLocales(): Locale[] {
  return Object.keys(translations) as Locale[];
}

/**
 * Detect system locale from environment
 */
export function detectLocale(): Locale {
  const env = process.env.TRA_LANG || process.env.LANG || process.env.LC_ALL || '';

  if (env.startsWith('zh_TW') || env.startsWith('zh-TW')) {
    return 'zh-TW';
  }
  if (env.startsWith('ja')) {
    return 'ja';
  }
  if (env.startsWith('ko')) {
    return 'ko';
  }
  if (env.startsWith('en')) {
    return 'en';
  }

  // Default to Traditional Chinese
  return 'zh-TW';
}

/**
 * Initialize i18n with auto-detection or specified locale
 */
export function initI18n(locale?: Locale): void {
  const targetLocale = locale ?? detectLocale();
  setLocale(targetLocale);
}

/**
 * Get translations for current locale
 */
export function getTranslations(): TranslationKeys {
  return translations[currentLocale];
}

/**
 * Template string replacement
 * Replaces {key} placeholders with provided values
 */
export function template(str: string, values: Record<string, string | number>): string {
  return str.replace(/\{(\w+)\}/g, (match, key) => {
    return key in values ? String(values[key]) : match;
  });
}

/**
 * Type-safe translation getter
 * Usage: t(t => t.errors.noCredentials)
 */
export function t(accessor: (translations: TranslationKeys) => string): string {
  return accessor(translations[currentLocale]);
}

/**
 * Translation with template values
 * Usage: tt(t => t.errors.trainNotFound, { trainNo: '123' })
 */
export function tt(
  accessor: (translations: TranslationKeys) => string,
  values: Record<string, string | number>
): string {
  return template(accessor(translations[currentLocale]), values);
}

/**
 * Direct access to translation object path
 * Usage: i18n('errors.noCredentials')
 */
export function i18n(path: string): string {
  const keys = path.split('.');
  let result: unknown = translations[currentLocale];

  for (const key of keys) {
    if (result && typeof result === 'object' && key in result) {
      result = (result as Record<string, unknown>)[key];
    } else {
      console.warn(`Translation not found: ${path}`);
      return path;
    }
  }

  return typeof result === 'string' ? result : path;
}

/**
 * Direct access with template values
 */
export function i18nt(path: string, values: Record<string, string | number>): string {
  return template(i18n(path), values);
}

// Re-export types
export type { TranslationKeys };

// Export all translations for testing
export { zhTW, en, ja, ko };
