import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpApi from 'i18next-http-backend';

// Importujemy pliki tłumaczeń - namespace'y
// Polskie tłumaczenia
import commonPL from './locales/pl/common.json';
import navigationPL from './locales/pl/navigation.json';
import authPL from './locales/pl/auth.json';
import dashboardPL from './locales/pl/dashboard.json';
import inventoryPL from './locales/pl/inventory.json';
import productionPL from './locales/pl/production.json';
import ordersPL from './locales/pl/orders.json';
import invoicesPL from './locales/pl/invoices.json';
import customersPL from './locales/pl/customers.json';
import suppliersPL from './locales/pl/suppliers.json';
import recipesPL from './locales/pl/recipes.json';
import reportsPL from './locales/pl/reports.json';
import machinesPL from './locales/pl/machines.json';
import purchaseOrdersPL from './locales/pl/purchaseOrders.json';
import cmrPL from './locales/pl/cmr.json';
import formsPL from './locales/pl/forms.json';
import calculatorPL from './locales/pl/calculator.json';
import priceListsPL from './locales/pl/priceLists.json';
import aiAssistantPL from './locales/pl/aiAssistant.json';
import environmentalConditionsPL from './locales/pl/environmentalConditions.json';
import expiryDatesPL from './locales/pl/expiryDates.json';
import stocktakingPL from './locales/pl/stocktaking.json';
import interactionsPL from './locales/pl/interactions.json';
import sidebarPL from './locales/pl/sidebar.json';
import taskDetailsPL from './locales/pl/taskDetails.json';
import analyticsPL from './locales/pl/analytics.json';
import financialReportPL from './locales/pl/financialReport.json';

// Angielskie tłumaczenia
import commonEN from './locales/en/common.json';
import navigationEN from './locales/en/navigation.json';
import authEN from './locales/en/auth.json';
import dashboardEN from './locales/en/dashboard.json';
import inventoryEN from './locales/en/inventory.json';
import productionEN from './locales/en/production.json';
import ordersEN from './locales/en/orders.json';
import invoicesEN from './locales/en/invoices.json';
import customersEN from './locales/en/customers.json';
import suppliersEN from './locales/en/suppliers.json';
import recipesEN from './locales/en/recipes.json';
import reportsEN from './locales/en/reports.json';
import machinesEN from './locales/en/machines.json';
import purchaseOrdersEN from './locales/en/purchaseOrders.json';
import cmrEN from './locales/en/cmr.json';
import formsEN from './locales/en/forms.json';
import calculatorEN from './locales/en/calculator.json';
import priceListsEN from './locales/en/priceLists.json';
import aiAssistantEN from './locales/en/aiAssistant.json';
import environmentalConditionsEN from './locales/en/environmentalConditions.json';
import expiryDatesEN from './locales/en/expiryDates.json';
import stocktakingEN from './locales/en/stocktaking.json';
import interactionsEN from './locales/en/interactions.json';
import sidebarEN from './locales/en/sidebar.json';
import taskDetailsEN from './locales/en/taskDetails.json';
import analyticsEN from './locales/en/analytics.json';
import financialReportEN from './locales/en/financialReport.json';

// Konfiguracja zasobów tłumaczeń z namespace'ami
const resources = {
  pl: {
    common: commonPL,
    navigation: navigationPL,
    auth: authPL,
    dashboard: dashboardPL,
    inventory: inventoryPL,
    production: productionPL,
    orders: ordersPL,
    invoices: invoicesPL,
    customers: customersPL,
    suppliers: suppliersPL,
    recipes: recipesPL,
    reports: reportsPL,
    machines: machinesPL,
    purchaseOrders: purchaseOrdersPL,
    cmr: cmrPL,
    forms: formsPL,
    calculator: calculatorPL,
    priceLists: priceListsPL,
    aiAssistant: aiAssistantPL,
    environmentalConditions: environmentalConditionsPL,
    expiryDates: expiryDatesPL,
    stocktaking: stocktakingPL,
    interactions: interactionsPL,
    sidebar: sidebarPL,
    taskDetails: taskDetailsPL,
    analytics: analyticsPL,
    financialReport: financialReportPL
  },
  en: {
    common: commonEN,
    navigation: navigationEN,
    auth: authEN,
    dashboard: dashboardEN,
    inventory: inventoryEN,
    production: productionEN,
    orders: ordersEN,
    invoices: invoicesEN,
    customers: customersEN,
    suppliers: suppliersEN,
    recipes: recipesEN,
    reports: reportsEN,
    machines: machinesEN,
    purchaseOrders: purchaseOrdersEN,
    cmr: cmrEN,
    forms: formsEN,
    calculator: calculatorEN,
    priceLists: priceListsEN,
    aiAssistant: aiAssistantEN,
    environmentalConditions: environmentalConditionsEN,
    expiryDates: expiryDatesEN,
    stocktaking: stocktakingEN,
    interactions: interactionsEN,
    sidebar: sidebarEN,
    taskDetails: taskDetailsEN,
    analytics: analyticsEN,
    financialReport: financialReportEN
  }
};

// Zabezpieczenie przed wielokrotną inicjalizacją (np. przez React.StrictMode)
if (!i18n.isInitialized) {
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
    
    // Język początkowy będzie wykrywany automatycznie przez LanguageDetector z localStorage
    // Nie ustawiamy 'lng' aby nie wymuszać języka i pozwolić na persystencję wyboru użytkownika
    
    // Namespace domyślny
    defaultNS: 'common',
    
    // Lista wszystkich namespace'ów
    ns: [
      'common', 'navigation', 'auth', 'dashboard', 
      'inventory', 'production', 'orders', 'invoices', 
      'customers', 'suppliers', 'recipes', 'reports',
      'machines', 'purchaseOrders', 'cmr', 'forms',
      'calculator', 'priceLists', 'aiAssistant', 
      'environmentalConditions', 'expiryDates', 'stocktaking',
      'interactions', 'sidebar', 'taskDetails', 'analytics', 'financialReport'
    ],
    
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
}

export default i18n; 