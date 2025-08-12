import { useTranslation as useI18nextTranslation } from 'react-i18next';

/**
 * Niestandardowy hook do obsługi tłumaczeń z kompatybilnością wsteczną
 * Rozszerza standardowy useTranslation z react-i18next o dodatkowe funkcjonalności
 * Automatycznie mapuje stare klucze do nowych namespace'ów
 */
export const useTranslation = (namespace) => {
  const { t, i18n, ready } = useI18nextTranslation(namespace);

  /**
   * Funkcja do tłumaczenia z automatycznym mapowaniem do namespace'ów
   * Zapewnia kompatybilność wsteczną ze starymi kluczami
   */
  const translate = (key, options = {}) => {
    let translationKey = key;
    
    // Mapowanie starych kluczy do nowych namespace'ów
    if (key && typeof key === 'string' && key.includes('.')) {
      const [firstPart, ...restParts] = key.split('.');
      const remainingKey = restParts.join('.');
      
      // Mapowanie głównych sekcji do namespace'ów
      const namespaceMapping = {
        'suppliers': 'suppliers',
        'inventory': 'inventory',
        'production': 'production', 
        'orders': 'orders',
        'invoices': 'invoices',
        'customers': 'customers',
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
        'analytics': 'reports',
        'coReports': 'reports',
        'environmentalConditions': 'environmentalConditions',
        'expiryDates': 'expiryDates',
        'stocktaking': 'stocktaking',
        'purchaseInteractions': 'interactions',
        'interactionDetails': 'interactions',
        'sidebar': 'sidebar',
        'productionForms': 'forms',
        'inventoryForms': 'forms'
      };
      
      // Sprawdź czy pierwszy część klucza pasuje do namespace'u
      if (namespaceMapping[firstPart]) {
        const targetNamespace = namespaceMapping[firstPart];
        
        // Strategia sprawdzania kluczy w kolejności priorytetów:
        const keysToTry = [
          `${targetNamespace}:${remainingKey}`,              // klucz bez prefiksu namespace'a (nowa struktura)
          `${targetNamespace}:${firstPart}.${remainingKey}`, // pełna zagnieżdżona struktura (stara struktura)
          `${targetNamespace}:${key}`,                       // cały klucz w namespace'ie
          `common:${key}`,                                    // fallback do common
          key                                                 // fallback do oryginalnego klucza
        ];
        
        // Znajdź pierwszy istniejący klucz
        for (const keyToTry of keysToTry) {
          if (i18n.exists(keyToTry)) {
            translationKey = keyToTry;
            break;
          }
        }
      } else {
        // Jeśli nie znaleziono mapowania, spróbuj w common
        if (i18n.exists(`common:${key}`)) {
          translationKey = `common:${key}`;
        }
      }
    }
    
    const translation = t(translationKey, { ...options, fallback: key });
    
    // Jeśli tłumaczenie jest równe kluczowi, prawdopodobnie nie zostało znalezione
    if (translation === translationKey && options.fallback) {
      return options.fallback;
    }
    
    return translation;
  };

  /**
   * Sprawdza czy klucz tłumaczenia istnieje
   */
  const hasTranslation = (key) => {
    return i18n.exists(key);
  };

  /**
   * Zwraca obecny język
   */
  const currentLanguage = i18n.language || 'pl';

  /**
   * Sprawdza czy obecny język to polski
   */
  const isPolish = currentLanguage === 'pl';

  /**
   * Sprawdza czy obecny język to angielski  
   */
  const isEnglish = currentLanguage === 'en';

  /**
   * Zmienia język aplikacji
   */
  const changeLanguage = (lng) => {
    return i18n.changeLanguage(lng);
  };

  /**
   * Formatuje liczbę zgodnie z lokalizacją
   */
  const formatNumber = (number, options = {}) => {
    const locale = currentLanguage === 'pl' ? 'pl-PL' : 'en-US';
    return new Intl.NumberFormat(locale, options).format(number);
  };

  /**
   * Formatuje datę zgodnie z lokalizacją
   */
  const formatDate = (date, options = {}) => {
    const locale = currentLanguage === 'pl' ? 'pl-PL' : 'en-US';
    return new Intl.DateTimeFormat(locale, options).format(new Date(date));
  };

  /**
   * Formatuje walutę zgodnie z lokalizacją
   */
  const formatCurrency = (amount, currency = 'PLN') => {
    const locale = currentLanguage === 'pl' ? 'pl-PL' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  return {
    // Podstawowe funkcje z react-i18next
    t: translate,
    i18n,
    ready,
    
    // Rozszerzone funkcjonalności
    translate,
    hasTranslation,
    currentLanguage,
    isPolish,
    isEnglish,
    changeLanguage,
    
    // Formatowanie według lokalizacji
    formatNumber,
    formatDate,
    formatCurrency
  };
}; 