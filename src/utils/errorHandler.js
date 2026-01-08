// src/utils/errorHandler.js
import * as Sentry from '@sentry/react';

/**
 * Centralna funkcja do obsługi błędów w aplikacji
 * Automatycznie loguje błędy do konsoli i wysyła do Sentry
 * 
 * @param {Error} error - Obiekt błędu
 * @param {string} context - Kontekst błędu (np. 'productionService.createTask')
 * @param {Object} extraData - Dodatkowe dane do debugowania
 * @param {string} level - Poziom błędu: 'error', 'warning', 'info' (domyślnie 'error')
 */
export const handleError = (error, context = '', extraData = {}, level = 'error') => {
  // Loguj do konsoli
  console.error(`[${context}]`, error, extraData);
  
  // Wyślij do Sentry z dodatkowymi informacjami
  Sentry.captureException(error, {
    level: level,
    tags: {
      context: context,
    },
    extra: extraData
  });
};

/**
 * Funkcja do logowania wiadomości (nie błędów) do Sentry
 * Użyj gdy chcesz zalogować ważne zdarzenie, ale nie jest to błąd
 * 
 * @param {string} message - Wiadomość do zalogowania
 * @param {string} level - Poziom: 'error', 'warning', 'info', 'debug' (domyślnie 'info')
 * @param {Object} extraData - Dodatkowe dane kontekstowe
 */
export const logToSentry = (message, level = 'info', extraData = {}) => {
  console.log(`[Sentry Log - ${level}]`, message, extraData);
  
  Sentry.captureMessage(message, {
    level: level,
    extra: extraData
  });
};

/**
 * Wrapper funkcji asynchronicznej z automatyczną obsługą błędów
 * 
 * @param {Function} asyncFunction - Funkcja asynchroniczna do wykonania
 * @param {string} context - Kontekst operacji
 * @param {Object} extraData - Dodatkowe dane
 * @returns {Promise} - Wynik funkcji lub rzuca błąd
 */
export const withErrorHandling = async (asyncFunction, context, extraData = {}) => {
  try {
    return await asyncFunction();
  } catch (error) {
    handleError(error, context, extraData);
    throw error; // Rzuć dalej aby nie psuć istniejącej logiki
  }
};

/**
 * Dodaj breadcrumb (ścieżkę nawigacji) do Sentry
 * Przydatne do śledzenia akcji użytkownika przed błędem
 * 
 * @param {string} message - Wiadomość breadcrumb
 * @param {string} category - Kategoria (np. 'user-action', 'navigation', 'api')
 * @param {string} level - Poziom: 'info', 'warning', 'error'
 * @param {Object} data - Dodatkowe dane
 */
export const addBreadcrumb = (message, category = 'user-action', level = 'info', data = {}) => {
  Sentry.addBreadcrumb({
    message,
    category,
    level,
    data
  });
};

export default handleError;

