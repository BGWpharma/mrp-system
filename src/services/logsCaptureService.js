/**
 * Serwis do przechwytywania i przechowywania logów konsoli
 * Pozwala na zbieranie logów nawet gdy dialog zgłaszania błędów jest zamknięty
 */

// Przechowujemy logi w zmiennej w obszarze modułu
let capturedLogs = '';
let isCapturing = false;
let originalConsoleError = null;
let originalConsoleLog = null;
let originalConsoleWarn = null;

// Lista funkcji nasłuchujących na zmiany w logach
const logListeners = [];

/**
 * Bezpieczna serializacja obiektów, obsługuje cykliczne referencje
 * @param {*} obj - Obiekt do serializacji
 * @param {number} maxDepth - Maksymalna głębokość serializacji
 * @returns {string} Zserializowany obiekt jako string
 */
const safeStringify = (obj, maxDepth = 3) => {
  const seen = new WeakSet();
  
  const stringify = (value, depth = 0) => {
    // Limit głębokości
    if (depth > maxDepth) {
      return '[Max Depth Exceeded]';
    }
    
    // Null i undefined
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    
    // Typy prymitywne
    if (typeof value !== 'object') {
      return String(value);
    }
    
    // Sprawdź cykliczne referencje
    if (seen.has(value)) {
      return '[Circular Reference]';
    }
    seen.add(value);
    
    try {
      // Obsługa Date
      if (value instanceof Date) {
        return value.toISOString();
      }
      
      // Obsługa Error
      if (value instanceof Error) {
        return `Error: ${value.message}`;
      }
      
      // Obsługa obiektów Firebase/Firestore
      if (value && typeof value.toDate === 'function') {
        try {
          return value.toDate().toISOString();
        } catch (e) {
          return '[Firebase Timestamp]';
        }
      }
      
      // Obsługa funkcji
      if (typeof value === 'function') {
        return `[Function: ${value.name || 'anonymous'}]`;
      }
      
      // Obsługa tablic
      if (Array.isArray(value)) {
        const items = value.slice(0, 10).map(item => stringify(item, depth + 1));
        if (value.length > 10) {
          items.push(`... ${value.length - 10} more items`);
        }
        return `[${items.join(', ')}]`;
      }
      
      // Obsługa obiektów
      const keys = Object.keys(value).slice(0, 10);
      const pairs = keys.map(key => {
        try {
          return `${key}: ${stringify(value[key], depth + 1)}`;
        } catch (e) {
          return `${key}: [Unserializable]`;
        }
      });
      
      if (Object.keys(value).length > 10) {
        pairs.push(`... ${Object.keys(value).length - 10} more properties`);
      }
      
      return `{${pairs.join(', ')}}`;
    } catch (error) {
      return '[Unserializable Object]';
    } finally {
      seen.delete(value);
    }
  };
  
  return stringify(obj);
};

/**
 * Rozpoczyna przechwytywanie logów konsoli
 */
export const startCapturingLogs = () => {
  if (isCapturing) return; // Jeśli już przechwytujemy, nie robimy nic
  
  // Zachowujemy oryginalne metody
  originalConsoleError = console.error;
  originalConsoleLog = console.log;
  originalConsoleWarn = console.warn;
  
  // Funkcja przechwytująca logi
  const captureLog = (type, args) => {
    try {
      const logEntry = `[${type}] ${new Date().toISOString()}: ${args.map(arg => 
        typeof arg === 'object' ? safeStringify(arg) : String(arg)
      ).join(' ')}\n`;
      
      // Dodajemy wpis do naszych przechwyconych logów
      capturedLogs += logEntry;
      
      // Powiadamiamy nasłuchujących
      notifyListeners();
    } catch (error) {
      // Jeśli nawet nasze bezpieczne logowanie nie zadziała, dodajemy prostą wiadomość
      capturedLogs += `[${type}] ${new Date().toISOString()}: [Log capture failed: ${error.message}]\n`;
    }
    
    // Zwracamy oryginalne argumenty, aby logi nadal były wyświetlane w konsoli
    return args;
  };
  
  // Podmieniamy metody konsoli
  console.error = (...args) => {
    originalConsoleError.apply(console, captureLog('ERROR', args));
  };
  
  console.log = (...args) => {
    originalConsoleLog.apply(console, captureLog('LOG', args));
  };
  
  console.warn = (...args) => {
    originalConsoleWarn.apply(console, captureLog('WARN', args));
  };
  
  isCapturing = true;
};

/**
 * Zatrzymuje przechwytywanie logów konsoli
 */
export const stopCapturingLogs = () => {
  if (!isCapturing || !originalConsoleError) return;
  
  // Przywracamy oryginalne metody
  console.error = originalConsoleError;
  console.log = originalConsoleLog;
  console.warn = originalConsoleWarn;
  
  isCapturing = false;
};

/**
 * Pobiera przechwycone logi
 * @returns {string} Przechwycone logi
 */
export const getCapturedLogs = () => {
  return capturedLogs;
};

/**
 * Czyści przechwycone logi
 */
export const clearCapturedLogs = () => {
  capturedLogs = '';
  notifyListeners();
};

/**
 * Dodaje funkcję nasłuchującą na zmiany w logach
 * @param {Function} listener - Funkcja wywoływana gdy logi się zmieniają
 */
export const addLogListener = (listener) => {
  logListeners.push(listener);
  // Od razu powiadamiamy o aktualnym stanie
  listener(capturedLogs);
};

/**
 * Usuwa funkcję nasłuchującą
 * @param {Function} listener - Funkcja do usunięcia
 */
export const removeLogListener = (listener) => {
  const index = logListeners.indexOf(listener);
  if (index !== -1) {
    logListeners.splice(index, 1);
  }
};

/**
 * Powiadamia wszystkich nasłuchujących o zmianach w logach
 */
const notifyListeners = () => {
  logListeners.forEach(listener => listener(capturedLogs));
};

// Automatycznie rozpoczynamy przechwytywanie przy imporcie serwisu
startCapturingLogs(); 