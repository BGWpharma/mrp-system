import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpApi from 'i18next-http-backend';

// Importujemy pliki tłumaczeń
import translationPL from './locales/pl/translation.json';
import translationEN from './locales/en/translation.json';

// Konfiguracja zasobów tłumaczeń
const resources = {
  pl: {
    translation: translationPL
  },
  en: {
    translation: translationEN
  }
};

i18n
  // Wykrywanie języka z przeglądarki/localStorage
  .use(LanguageDetector)
  // Możliwość ładowania tłumaczeń z plików (w przyszłości)
  .use(HttpApi)
  // Integracja z React
  .use(initReactI18next)
  // Inicjalizacja
  .init({
    resources,
    
    // Język domyślny
    fallbackLng: 'pl',
    
    // Język początkowy (będzie wykrywany automatycznie)
    lng: 'pl',
    
    // Namespace domyślny
    defaultNS: 'translation',
    
    // Konfiguracja wykrywania języka
    detection: {
      // Kolejność metod wykrywania języka
      order: ['localStorage', 'navigator', 'htmlTag'],
      
      // Klucz w localStorage
      lookupLocalStorage: 'i18nextLng',
      
      // Cache w localStorage
      caches: ['localStorage'],
      
      // Sprawdź tylko główne kody języków (pl, en zamiast pl-PL, en-US)
      checkWhitelist: true
    },
    
    // Konfiguracja dla HttpApi (do przyszłego użycia)
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    
    // Opcje interpolacji
    interpolation: {
      // React już zabezpiecza przed XSS
      escapeValue: false,
    },
    
    // Nie włączamy returnObjects - używamy bezpośrednich kluczy
    // returnObjects: true,
    
    // Opcje debugowania (wyłącz w produkcji)
    debug: process.env.NODE_ENV === 'development',
    
    // Obsługa brakujących kluczy
    saveMissing: process.env.NODE_ENV === 'development',
    missingKeyHandler: (lng, ns, key) => {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`Missing translation key: ${key} for language: ${lng}`);
      }
    },
    
    // Konfiguracja dla React
    react: {
      // Użyj React.Suspense
      useSuspense: false,
      // Bind events do re-render
      bindI18n: 'languageChanged',
      bindI18nStore: '',
      // Transform i18n key w przypadku błędów
      transEmptyNodeValue: '',
      transSupportBasicHtmlNodes: true,
      transKeepBasicHtmlNodesFor: ['br', 'strong', 'i', 'em', 'b', 'span'],
    }
  });

export default i18n; 