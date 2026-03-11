import { useCallback, useMemo } from 'react';
import { useTranslation as useI18nextTranslation } from 'react-i18next';

const NAMESPACE_MAPPING = {
  'suppliers': 'suppliers',
  'inventory': 'inventory',
  'production': 'production',
  'orders': 'orders',
  'invoices': 'invoices',
  'customers': 'customers',
  'contacts': 'customers',
  'recipes': 'recipes',
  'machines': 'machines',
  'purchaseOrders': 'purchaseOrders',
  'cmr': 'cmr',
  'aiAssistant': 'aiAssistant',
  'dashboard': 'dashboard',
  'auth': 'auth',
  'navigation': 'navigation',
  'common': 'common',
  'forms': 'forms',
  'calculator': 'calculator',
  'priceLists': 'priceLists',
  'reports': 'reports',
  'analytics': 'analytics',
  'coReports': 'reports',
  'environmentalConditions': 'environmentalConditions',
  'expiryDates': 'expiryDates',
  'stocktaking': 'stocktaking',
  'purchaseInteractions': 'interactions',
  'interactionDetails': 'interactions',
  'opportunities': 'interactions',
  'sidebar': 'sidebar',
  'productionForms': 'forms',
  'inventoryForms': 'forms',
  'taskDetails': 'taskDetails',
  'taskboard': 'taskboard',
  'cashflow': 'cashflow',
  'financialReport': 'financialReport',
  'faq': 'faq',
  'operationalCosts': 'operationalCosts',
  'users': 'users',
  'ecoReport': 'ecoReport',
  'workTime': 'workTime',
  'schedule': 'schedule'
};

/**
 * Niestandardowy hook do obsługi tłumaczeń z kompatybilnością wsteczną
 * Rozszerza standardowy useTranslation z react-i18next o dodatkowe funkcjonalności
 * Automatycznie mapuje stare klucze do nowych namespace'ów
 */
export const useTranslation = (namespace) => {
  const { t, i18n, ready } = useI18nextTranslation(namespace);

  const translate = useCallback((key, options = {}) => {
    if (!key || typeof key !== 'string') {
      if (process.env.NODE_ENV === 'development') {
        console.warn('[useTranslation] Nieprawidłowy klucz tłumaczenia:', key);
      }
      return options.defaultValue || options.fallback || '';
    }

    let translationKey = key;
    let keyFound = false;

    if (key.includes('.')) {
      const [firstPart, ...restParts] = key.split('.');
      const remainingKey = restParts.join('.');

      if (NAMESPACE_MAPPING[firstPart]) {
        const targetNamespace = NAMESPACE_MAPPING[firstPart];

        const keysToTry = [
          `${targetNamespace}:${remainingKey}`,
          `${targetNamespace}:${firstPart}.${remainingKey}`,
          `${targetNamespace}:${key}`,
          `common:${key}`,
          key
        ];

        for (const keyToTry of keysToTry) {
          if (i18n.exists(keyToTry)) {
            translationKey = keyToTry;
            keyFound = true;
            break;
          }
        }
      } else {
        if (i18n.exists(`common:${key}`)) {
          translationKey = `common:${key}`;
          keyFound = true;
        }
      }
    }

    const i18nextOptions = {
      ...options,
      defaultValue: options.defaultValue || options.fallback || key
    };

    const translation = t(translationKey, i18nextOptions);

    if (process.env.NODE_ENV === 'development' && !keyFound && translation === key) {
      console.warn(
        `[useTranslation] Brakujący klucz tłumaczenia: "${key}"`,
        `\n  Namespace: ${namespace || 'default'}`,
        `\n  Język: ${i18n.language}`
      );
    }

    if (translation === translationKey && options.fallback && options.fallback !== key) {
      return options.fallback;
    }

    return translation;
  }, [t, i18n, namespace]);

  const hasTranslation = useCallback((key) => {
    return i18n.exists(key);
  }, [i18n]);

  const currentLanguage = i18n.language || 'pl';
  const isPolish = useMemo(() => currentLanguage === 'pl', [currentLanguage]);
  const isEnglish = useMemo(() => currentLanguage === 'en', [currentLanguage]);

  const changeLanguage = useCallback((lng) => {
    return i18n.changeLanguage(lng);
  }, [i18n]);

  const formatNumber = useCallback((number, options = {}) => {
    const locale = (i18n.language || 'pl') === 'pl' ? 'pl-PL' : 'en-US';
    return new Intl.NumberFormat(locale, options).format(number);
  }, [i18n.language]);

  const formatDate = useCallback((date, options = {}) => {
    const locale = (i18n.language || 'pl') === 'pl' ? 'pl-PL' : 'en-US';
    return new Intl.DateTimeFormat(locale, options).format(new Date(date));
  }, [i18n.language]);

  const formatCurrency = useCallback((amount, currency = 'PLN') => {
    const locale = (i18n.language || 'pl') === 'pl' ? 'pl-PL' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency
    }).format(amount);
  }, [i18n.language]);

  return useMemo(() => ({
    t: translate,
    i18n,
    ready,
    translate,
    hasTranslation,
    currentLanguage,
    isPolish,
    isEnglish,
    changeLanguage,
    formatNumber,
    formatDate,
    formatCurrency
  }), [translate, i18n, ready, hasTranslation, currentLanguage, isPolish, isEnglish, changeLanguage, formatNumber, formatDate, formatCurrency]);
};
