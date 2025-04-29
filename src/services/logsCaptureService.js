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
    const logEntry = `[${type}] ${new Date().toISOString()}: ${args.map(arg => 
      typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg
    ).join(' ')}\n`;
    
    // Dodajemy wpis do naszych przechwyconych logów
    capturedLogs += logEntry;
    
    // Powiadamiamy nasłuchujących
    notifyListeners();
    
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