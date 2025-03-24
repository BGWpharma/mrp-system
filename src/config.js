// src/config.js

// Konfiguracja API
export const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

// Inne ustawienia konfiguracyjne
export const APP_NAME = 'MRP System';
export const APP_VERSION = '1.0.0';

// Konfiguracja informacji firmowych (dla faktur)
export const COMPANY_INFO = {
  name: 'Twoja Firma Sp. z o.o.',
  address: 'ul. Przykładowa 123',
  city: '00-000 Miasto',
  nip: '123-456-78-90',
  regon: '123456789',
  krs: '0000123456',
  email: 'kontakt@twojafirma.pl',
  phone: '+48 123 456 789',
  website: 'www.twojafirma.pl',
  bankName: 'Bank Polski S.A.',
  bankAccount: 'PL 00 1234 5678 9012 3456 7890 1234'
};

// Konfiguracja paginacji
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

// Formaty dat
export const DATE_FORMAT = 'DD.MM.YYYY';
export const DATE_TIME_FORMAT = 'DD.MM.YYYY HH:mm';

// Konfiguracja waluty
export const DEFAULT_CURRENCY = 'PLN';
export const CURRENCY_OPTIONS = ['PLN', 'EUR', 'USD', 'GBP'];

// Konfiguracja jednostek miary
export const UNIT_OPTIONS = ['kg', 'g', 'l', 'ml', 'szt', 'opak'];

// Konfiguracja statusów zamówień
export const ORDER_STATUSES = {
  DRAFT: 'draft',
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Konfiguracja statusów zamówień zakupowych
export const PURCHASE_ORDER_STATUSES = {
  DRAFT: 'draft',
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed'
};

// Konfiguracja statusów produkcji
export const PRODUCTION_STATUSES = {
  PLANNED: 'planned',
  IN_PROGRESS: 'in_progress',
  PENDING_CONSUMPTION: 'pending_consumption',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

// Konfiguracja statusów jakości
export const QUALITY_STATUSES = {
  PENDING: 'pending',
  PASSED: 'passed',
  FAILED: 'failed'
};

// Tłumaczenia statusów
export const STATUS_TRANSLATIONS = {
  // Zamówienia
  [ORDER_STATUSES.DRAFT]: 'Szkic',
  [ORDER_STATUSES.PENDING]: 'Oczekujące',
  [ORDER_STATUSES.CONFIRMED]: 'Potwierdzone',
  [ORDER_STATUSES.IN_PROGRESS]: 'W realizacji',
  [ORDER_STATUSES.COMPLETED]: 'Zakończone',
  [ORDER_STATUSES.CANCELLED]: 'Anulowane',
  
  // Zamówienia zakupowe
  [PURCHASE_ORDER_STATUSES.DRAFT]: 'Szkic',
  [PURCHASE_ORDER_STATUSES.PENDING]: 'Oczekujące',
  [PURCHASE_ORDER_STATUSES.CONFIRMED]: 'Potwierdzone',
  [PURCHASE_ORDER_STATUSES.SHIPPED]: 'Wysłane',
  [PURCHASE_ORDER_STATUSES.DELIVERED]: 'Dostarczone',
  [PURCHASE_ORDER_STATUSES.CANCELLED]: 'Anulowane',
  [PURCHASE_ORDER_STATUSES.COMPLETED]: 'Zakończone',
  
  // Produkcja
  [PRODUCTION_STATUSES.PLANNED]: 'Zaplanowane',
  [PRODUCTION_STATUSES.IN_PROGRESS]: 'W trakcie',
  [PRODUCTION_STATUSES.PENDING_CONSUMPTION]: 'Potwierdzenie zużycia',
  [PRODUCTION_STATUSES.COMPLETED]: 'Zakończone',
  [PRODUCTION_STATUSES.CANCELLED]: 'Anulowane',
  
  // Jakość
  [QUALITY_STATUSES.PENDING]: 'Oczekujące',
  [QUALITY_STATUSES.PASSED]: 'Zatwierdzone',
  [QUALITY_STATUSES.FAILED]: 'Odrzucone'
}; 