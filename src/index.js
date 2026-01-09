// src/index.js
import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from "@sentry/react";
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import App from './App';
import './assets/styles/global.css';
import './styles/enhancements.css';

// Pobierz wersję z package.json dla release tracking
const packageJson = require('../package.json');

// Inicjalizacja Sentry - musi być przed renderowaniem aplikacji
Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN || "https://8093cd8a26e8f37781f1c68a01d7903b@o4510675622887424.ingest.de.sentry.io/4510675634552912",
  
  // Release tracking - śledzenie błędów per wersja
  release: process.env.REACT_APP_SENTRY_RELEASE || `mrp-system@${packageJson.version}`,
  
  // Dist - dodatkowa identyfikacja (opcjonalne)
  dist: process.env.REACT_APP_BUILD_NUMBER || packageJson.version,
  
  // Określenie środowiska
  environment: process.env.REACT_APP_SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
  
  // Performance Monitoring - procent transakcji do monitorowania
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  
  // Session Replay - opcjonalne
  replaysSessionSampleRate: 0.1, // 10% sesji
  replaysOnErrorSampleRate: 1.0, // 100% sesji z błędami
  
  // Wysyłanie danych PII (IP, user agent, etc.)
  sendDefaultPii: true,
  
  // Integracje
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
      maskAllInputs: true, // Maskuj wszystkie inputy (hasła, dane wrażliwe)
    }),
  ],
  
  // Filtrowanie błędów - ignoruj znane błędy zewnętrzne
  beforeSend(event, hint) {
    // Ignoruj błędy z rozszerzeń przeglądarki
    if (event.exception) {
      const error = hint.originalException;
      if (error && error.message && error.message.includes('chrome-extension://')) {
        return null;
      }
    }
    
    // Ignoruj błędy ResizeObserver (znany problem Reacta, niegroźny)
    if (event.message && event.message.includes('ResizeObserver loop')) {
      return null;
    }
    
    // Dodaj dodatkowe dane z localStorage (nie wrażliwe!)
    if (typeof window !== 'undefined' && localStorage) {
      event.contexts = event.contexts || {};
      event.contexts.localStorage = {
        theme: localStorage.getItem('theme'),
        language: localStorage.getItem('i18nextLng'),
        hasSeenOnboarding: localStorage.getItem('hasSeenOnboarding'),
      };
    }
    
    // Dodaj informacje o oknie przeglądarki
    if (typeof window !== 'undefined') {
      event.contexts = event.contexts || {};
      event.contexts.viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
        orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
      };
    }
    
    return event;
  },
});

// ============================================================================
// AUTOMATYCZNE PRZECHWYTYWANIE CONSOLE.ERROR
// ============================================================================
// Rozszerz console.error aby automatycznie wysyłać błędy do Sentry
// To pozwala łapać błędy z bloków try-catch które są tylko logowane
const originalConsoleError = console.error;

console.error = function(...args) {
  // Wywołaj oryginalny console.error (zachowaj normalne logowanie)
  originalConsoleError.apply(console, args);
  
  // Wyślij do Sentry (tylko w produkcji lub jeśli jest włączone debug)
  const shouldSendToSentry = 
    process.env.NODE_ENV === 'production' || 
    process.env.REACT_APP_SENTRY_DEBUG === 'true';
  
  if (shouldSendToSentry) {
    try {
      // Sprawdź czy pierwszy argument to Error object
      if (args[0] instanceof Error) {
        Sentry.captureException(args[0], {
          extra: {
            additionalArgs: args.slice(1)
          }
        });
      } else {
        // Jeśli to string lub coś innego, wyślij jako message
        const message = args
          .map(arg => {
            if (typeof arg === 'object') {
              try {
                return JSON.stringify(arg);
              } catch {
                return String(arg);
              }
            }
            return String(arg);
          })
          .join(' ');
        
        // Wyślij tylko jeśli wiadomość nie jest pusta i nie jest typowym logiem developerskim
        if (message && !message.includes('[HMR]') && !message.includes('Warning:')) {
          Sentry.captureMessage(message, 'error');
        }
      }
    } catch (sentryError) {
      // Jeśli Sentry sam rzuci błąd, nie rób nic (uniknij infinite loop)
      originalConsoleError.call(console, 'Sentry error capture failed:', sentryError);
    }
  }
};

const root = createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <CssBaseline />
        <App />
      </AuthProvider>
    </ThemeProvider>
  </React.StrictMode>
);