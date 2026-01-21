import { db, storage } from './firebase/config';
import { 
  collection, 
  addDoc, 
  getDocs, 
  doc, 
  getDoc, 
  updateDoc, 
  query, 
  orderBy, 
  serverTimestamp, 
  deleteDoc 
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const BUG_REPORTS_COLLECTION = 'bugReports';

/**
 * Dodaje nowe zgłoszenie błędu do bazy danych
 * @param {Object} reportData - Dane zgłoszenia
 * @param {File} screenshotFile - Plik zrzutu ekranu
 * @param {string} userId - ID użytkownika zgłaszającego błąd
 * @returns {Promise<string>} - ID utworzonego zgłoszenia
 */
export const addBugReport = async (reportData, screenshotFile, userId) => {
  let reportRef = null;
  
  try {
    // Dodaj podstawowe dane zgłoszenia
    reportRef = await addDoc(collection(db, BUG_REPORTS_COLLECTION), {
      ...reportData,
      status: 'nowy',
      createdAt: serverTimestamp(),
      createdBy: userId,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    console.log('Utworzono dokument zgłoszenia błędu:', reportRef.id);

    // Jeśli jest zrzut ekranu, spróbuj go przesłać
    if (screenshotFile) {
      try {
        const storageRef = ref(storage, `bugReports/${reportRef.id}/screenshot`);
        await uploadBytes(storageRef, screenshotFile);
        const screenshotUrl = await getDownloadURL(storageRef);

        // Aktualizuj dokument o URL zrzutu ekranu
        await updateDoc(doc(db, BUG_REPORTS_COLLECTION, reportRef.id), {
          screenshotUrl
        });
        
        console.log('Dodano zrzut ekranu do zgłoszenia');
      } catch (uploadError) {
        console.error('Błąd podczas przesyłania zrzutu ekranu:', uploadError);
        
        // Aktualizuj dokument z informacją o błędzie przesyłania
        if (reportRef) {
          await updateDoc(doc(db, BUG_REPORTS_COLLECTION, reportRef.id), {
            screenshotError: "Nie udało się przesłać zrzutu ekranu z powodu błędu CORS. Zgłoszenie zostało utworzone bez zrzutu."
          });
        }
        
        // Nie zatrzymujemy całego procesu, po prostu logujemy błąd
        console.warn('Zgłoszenie zostało zapisane bez zrzutu ekranu');
      }
    }

    return reportRef.id;
  } catch (error) {
    console.error('Błąd podczas dodawania zgłoszenia błędu:', error);
    
    // Jeśli dokument został już utworzony, ale wystąpił inny błąd, dodajmy informację o tym
    if (reportRef) {
      try {
        await updateDoc(doc(db, BUG_REPORTS_COLLECTION, reportRef.id), {
          hasError: true,
          errorMessage: error.message
        });
      } catch (updateError) {
        console.error('Nie można zaktualizować dokumentu z informacją o błędzie:', updateError);
      }
    }
    
    throw error;
  }
};

/**
 * Dodaje nowe zgłoszenie błędu do bazy danych wraz ze zrzutem ekranu zapisanym w Firebase Storage
 * Ta metoda zapewnia przesyłanie zrzutów ekranu do Firebase Storage zamiast przechowywania jako base64
 * @param {Object} reportData - Dane zgłoszenia
 * @param {File} screenshotFile - Plik zrzutu ekranu
 * @param {string} userId - ID użytkownika zgłaszającego błąd
 * @returns {Promise<string>} - ID utworzonego zgłoszenia
 */
export const addBugReportWithScreenshot = async (reportData, screenshotFile, userId) => {
  let reportRef = null;
  
  try {
    // Dodaj podstawowe dane zgłoszenia bez zrzutu ekranu
    reportRef = await addDoc(collection(db, BUG_REPORTS_COLLECTION), {
      ...reportData,
      status: 'nowy',
      createdAt: serverTimestamp(),
      createdBy: userId,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    console.log('Utworzono dokument zgłoszenia błędu:', reportRef.id);

    // Jeśli jest zrzut ekranu, przesyłamy go do Firebase Storage
    if (screenshotFile) {
      try {
        const storageRef = ref(storage, `bugReports/${reportRef.id}/screenshot`);
        await uploadBytes(storageRef, screenshotFile);
        const screenshotUrl = await getDownloadURL(storageRef);

        // Aktualizuj dokument o URL zrzutu ekranu
        await updateDoc(doc(db, BUG_REPORTS_COLLECTION, reportRef.id), {
          screenshotUrl
        });
        
        console.log('Dodano zrzut ekranu do zgłoszenia w Firebase Storage');
      } catch (uploadError) {
        console.error('Błąd podczas przesyłania zrzutu ekranu:', uploadError);
        
        // Jako plan awaryjny, spróbujmy zapisać jako base64 w Firestore
        try {
          const screenshotBase64 = await convertFileToBase64(screenshotFile);
          await updateDoc(doc(db, BUG_REPORTS_COLLECTION, reportRef.id), {
            screenshotBase64
          });
          console.log('Dodano zrzut ekranu jako base64 po nieudanym przesłaniu do Storage');
        } catch (base64Error) {
          console.error('Błąd podczas konwersji do base64:', base64Error);
          
          // Aktualizuj dokument z informacją o błędzie przesyłania
          await updateDoc(doc(db, BUG_REPORTS_COLLECTION, reportRef.id), {
            screenshotError: "Nie udało się przesłać zrzutu ekranu. Zgłoszenie zostało utworzone bez zrzutu."
          });
          
          console.warn('Zgłoszenie zostało zapisane bez zrzutu ekranu');
        }
      }
    }

    return reportRef.id;
  } catch (error) {
    console.error('Błąd podczas dodawania zgłoszenia błędu:', error);
    
    // Jeśli dokument został już utworzony, ale wystąpił inny błąd, dodajmy informację o tym
    if (reportRef) {
      try {
        await updateDoc(doc(db, BUG_REPORTS_COLLECTION, reportRef.id), {
          hasError: true,
          errorMessage: error.message
        });
      } catch (updateError) {
        console.error('Nie można zaktualizować dokumentu z informacją o błędzie:', updateError);
      }
    }
    
    throw error;
  }
};

/**
 * Pomocnicza funkcja do konwersji pliku na string base64
 * @param {File} file - Plik do konwersji
 * @returns {Promise<string>} - Zakodowany string base64
 */
const convertFileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

/**
 * Pobiera listę wszystkich zgłoszeń błędów
 * @returns {Promise<Array>} - Lista zgłoszeń błędów
 */
export const getBugReports = async () => {
  try {
    const q = query(
      collection(db, BUG_REPORTS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania zgłoszeń błędów:', error);
    throw error;
  }
};

/**
 * Pobiera szczegóły pojedynczego zgłoszenia błędu
 * @param {string} reportId - ID zgłoszenia
 * @returns {Promise<Object>} - Szczegóły zgłoszenia
 */
export const getBugReportById = async (reportId) => {
  try {
    const reportRef = doc(db, BUG_REPORTS_COLLECTION, reportId);
    const reportDoc = await getDoc(reportRef);
    
    if (!reportDoc.exists()) {
      throw new Error('Zgłoszenie nie istnieje');
    }
    
    return {
      id: reportDoc.id,
      ...reportDoc.data()
    };
  } catch (error) {
    console.error('Błąd podczas pobierania zgłoszenia błędu:', error);
    throw error;
  }
};

/**
 * Aktualizuje status zgłoszenia błędu
 * @param {string} reportId - ID zgłoszenia
 * @param {string} status - Nowy status ('nowy', 'w trakcie', 'rozwiązany', 'odrzucony')
 * @param {string} userId - ID użytkownika dokonującego zmiany
 * @returns {Promise<void>}
 */
export const updateBugReportStatus = async (reportId, status, userId) => {
  try {
    const reportRef = doc(db, BUG_REPORTS_COLLECTION, reportId);
    
    await updateDoc(reportRef, {
      status,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
  } catch (error) {
    console.error('Błąd podczas aktualizacji statusu zgłoszenia:', error);
    throw error;
  }
};

/**
 * Dodaje komentarz do zgłoszenia błędu
 * @param {string} reportId - ID zgłoszenia
 * @param {string} comment - Treść komentarza
 * @param {string} userId - ID użytkownika dodającego komentarz
 * @returns {Promise<void>}
 */
export const addBugReportComment = async (reportId, comment, userId) => {
  try {
    const reportRef = doc(db, BUG_REPORTS_COLLECTION, reportId);
    const reportDoc = await getDoc(reportRef);
    
    if (!reportDoc.exists()) {
      throw new Error('Zgłoszenie nie istnieje');
    }
    
    const reportData = reportDoc.data();
    const comments = reportData.comments || [];
    
    comments.push({
      text: comment,
      createdAt: new Date(),
      createdBy: userId
    });
    
    await updateDoc(reportRef, {
      comments,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
  } catch (error) {
    console.error('Błąd podczas dodawania komentarza:', error);
    throw error;
  }
};

/**
 * Usuwa zgłoszenie błędu
 * @param {string} reportId - ID zgłoszenia
 * @returns {Promise<void>}
 */
export const deleteBugReport = async (reportId) => {
  try {
    // Najpierw pobieramy dane zgłoszenia, żeby sprawdzić, czy ma zrzut ekranu i jakiego typu
    const reportRef = doc(db, BUG_REPORTS_COLLECTION, reportId);
    const reportDoc = await getDoc(reportRef);
    
    if (!reportDoc.exists()) {
      throw new Error('Zgłoszenie nie istnieje');
    }
    
    const reportData = reportDoc.data();
    
    // Jeśli zgłoszenie ma zrzut ekranu w Storage, spróbujemy go usunąć
    if (reportData.screenshotUrl) {
      try {
        const storageRef = ref(storage, `bugReports/${reportId}/screenshot`);
        await deleteObject(storageRef);
        console.log('Usunięto zrzut ekranu z Firebase Storage');
      } catch (storageError) {
        // Ignorujemy błędy usuwania z Storage - nie są krytyczne
        // Najczęściej będą to błędy CORS, które nie powinny blokować usunięcia zgłoszenia
        console.warn('Nie udało się usunąć zrzutu ekranu ze Storage. Kontynuujemy usuwanie zgłoszenia.', storageError);
      }
    }
    
    // Usuwamy dokument z Firestore - to najważniejsza część
    await deleteDoc(reportRef);
    console.log('Zgłoszenie zostało usunięte pomyślnie');
    
    return true;
  } catch (error) {
    console.error('Błąd podczas usuwania zgłoszenia błędu:', error);
    throw error;
  }
};

// Zachowujemy starą nazwę funkcji dla zachowania kompatybilności wstecznej
export const addBugReportWithBase64Screenshot = addBugReportWithScreenshot;

// ============================================================================
// AUTOMATYCZNE LOGOWANIE PROBLEMÓW AI
// ============================================================================

/**
 * Typy automatycznych zgłoszeń AI
 */
export const AI_FEEDBACK_TYPES = {
  LOW_CONFIDENCE: 'ai_low_confidence',
  FALLBACK_TO_V1: 'ai_fallback',
  BOTH_FAILED: 'ai_both_failed',
  NO_RESULTS: 'ai_no_results',
  SLOW_RESPONSE: 'ai_slow_response',
  TOOL_ERROR: 'ai_tool_error',
  UNKNOWN_INTENT: 'ai_unknown_intent'
};

/**
 * Mapowanie typów AI na tytuły zgłoszeń
 */
const AI_FEEDBACK_TITLES = {
  [AI_FEEDBACK_TYPES.LOW_CONFIDENCE]: '[AI] Niska pewność odpowiedzi',
  [AI_FEEDBACK_TYPES.FALLBACK_TO_V1]: '[AI] Fallback do starszego systemu',
  [AI_FEEDBACK_TYPES.BOTH_FAILED]: '[AI] Oba systemy zawiodły',
  [AI_FEEDBACK_TYPES.NO_RESULTS]: '[AI] Brak wyników dla zapytania',
  [AI_FEEDBACK_TYPES.SLOW_RESPONSE]: '[AI] Zbyt wolna odpowiedź',
  [AI_FEEDBACK_TYPES.TOOL_ERROR]: '[AI] Błąd wykonania narzędzia',
  [AI_FEEDBACK_TYPES.UNKNOWN_INTENT]: '[AI] Nierozpoznana intencja'
};

/**
 * Usuwa pola z wartością undefined z obiektu (rekurencyjnie)
 * Firestore nie akceptuje wartości undefined
 */
const removeUndefinedFields = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        cleaned[key] = removeUndefinedFields(value);
      } else {
        cleaned[key] = value;
      }
    }
  }
  return cleaned;
};

/**
 * Automatycznie dodaje zgłoszenie błędu AI (ciche, bez wiedzy użytkownika)
 * Zgłoszenia te są widoczne w panelu "Zgłoszenia błędów" z filtrem AI Feedback
 * 
 * @param {string} type - Typ zdarzenia AI (z AI_FEEDBACK_TYPES)
 * @param {Object} data - Dane zdarzenia
 * @returns {Promise<string|null>} - ID zgłoszenia lub null przy błędzie
 */
export const addAutomaticAIFeedback = async (type, data) => {
  try {
    const title = AI_FEEDBACK_TITLES[type] || '[AI] Problem z asystentem';
    
    // Przygotuj szczegółowy opis
    const descriptionParts = [
      `**Zapytanie użytkownika:**`,
      data.query || '(brak)',
      '',
      `**Rozpoznana intencja:** ${data.intent || 'nieznana'}`,
      `**Pewność:** ${((data.confidence || 0) * 100).toFixed(1)}%`,
      '',
      data.errorMessage ? `**Błąd:** ${data.errorMessage}` : '',
      data.response ? `**Odpowiedź AI:** ${String(data.response).substring(0, 300)}${String(data.response).length > 300 ? '...' : ''}` : '',
      '',
      `**Czas przetwarzania:** ${(data.processingTime || 0).toFixed(0)}ms`,
      `**Metoda:** ${data.method || 'unknown'}`,
      `**Wersja:** ${data.version || 'unknown'}`,
    ].filter(Boolean).join('\n');

    // Dane AI - użyj null zamiast undefined (Firestore nie akceptuje undefined)
    const aiData = {
      query: data.query || null,
      intent: data.intent || null,
      confidence: data.confidence ?? null,
      processingTime: data.processingTime ?? null,
      method: data.method || null,
      version: data.version || null,
      parameters: data.parameters || {},
      errorMessage: data.errorMessage || null,
      response: data.response ? String(data.response).substring(0, 500) : null
    };

    const reportData = {
      title,
      description: descriptionParts,
      priority: type === AI_FEEDBACK_TYPES.BOTH_FAILED ? 'wysoki' : 'niski',
      
      // Oznaczenie jako automatyczne zgłoszenie AI
      source: 'ai_assistant',
      aiType: type,
      
      // Dane AI do analizy (oczyszczone z undefined)
      aiData: removeUndefinedFields(aiData),
      
      // Informacje o kontekście
      browserInfo: {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'server',
        platform: typeof navigator !== 'undefined' ? navigator.platform : 'server',
        screenWidth: typeof window !== 'undefined' ? (window.screen?.width || 0) : 0,
        screenHeight: typeof window !== 'undefined' ? (window.screen?.height || 0) : 0
      },
      path: typeof window !== 'undefined' ? (window.location?.pathname || '/') : '/api',
      
      // Bez logów konsoli dla automatycznych zgłoszeń
      consoleLogs: null,
      includeConsoleLogs: false
    };

    // Dodaj zgłoszenie do bazy (z oczyszczonymi danymi)
    const reportRef = await addDoc(collection(db, BUG_REPORTS_COLLECTION), removeUndefinedFields({
      ...reportData,
      status: 'nowy',
      createdAt: serverTimestamp(),
      createdBy: data.userId || 'system_ai_feedback',
      updatedAt: serverTimestamp(),
      updatedBy: data.userId || 'system_ai_feedback'
    }));

    console.log(`[AIFeedback] 📊 Automatycznie utworzono zgłoszenie: ${reportRef.id} (${type})`);
    return reportRef.id;

  } catch (error) {
    // Błędy logowania nie powinny wpływać na działanie aplikacji
    console.error('[AIFeedback] ⚠️ Błąd tworzenia zgłoszenia (ignorowany):', error.message);
    return null;
  }
};

/**
 * Pomocnicze funkcje do szybkiego logowania konkretnych typów problemów AI
 * Wszystkie metody są asynchroniczne i "ciche" - nie blokują działania aplikacji
 */
export const AIFeedback = {
  /**
   * Loguj niską pewność odpowiedzi (confidence < 0.3)
   */
  logLowConfidence: (query, analysisResult, userId = null) => {
    return addAutomaticAIFeedback(AI_FEEDBACK_TYPES.LOW_CONFIDENCE, {
      query,
      intent: analysisResult?.intent,
      confidence: analysisResult?.confidence,
      parameters: analysisResult?.parameters,
      userId
    });
  },

  /**
   * Loguj fallback z V2 do V1
   */
  logFallbackToV1: (query, v2Result, userId = null) => {
    return addAutomaticAIFeedback(AI_FEEDBACK_TYPES.FALLBACK_TO_V1, {
      query,
      intent: v2Result?.intent,
      confidence: v2Result?.confidence,
      errorMessage: v2Result?.error || 'V2 nie obsłużył zapytania',
      version: 'v2_to_v1',
      userId
    });
  },

  /**
   * Loguj błąd obu systemów
   */
  logBothFailed: (query, errorMessage, userId = null) => {
    return addAutomaticAIFeedback(AI_FEEDBACK_TYPES.BOTH_FAILED, {
      query,
      errorMessage,
      version: 'none',
      userId
    });
  },

  /**
   * Loguj brak wyników
   */
  logNoResults: (query, intent, userId = null) => {
    return addAutomaticAIFeedback(AI_FEEDBACK_TYPES.NO_RESULTS, {
      query,
      intent,
      userId
    });
  },

  /**
   * Loguj wolną odpowiedź (>10s)
   */
  logSlowResponse: (query, processingTime, method, userId = null) => {
    return addAutomaticAIFeedback(AI_FEEDBACK_TYPES.SLOW_RESPONSE, {
      query,
      processingTime,
      method,
      userId
    });
  },

  /**
   * Loguj błąd narzędzia (tool execution error)
   */
  logToolError: (functionName, parameters, error, userId = null) => {
    return addAutomaticAIFeedback(AI_FEEDBACK_TYPES.TOOL_ERROR, {
      query: `Narzędzie: ${functionName}`,
      errorMessage: error?.message || String(error),
      parameters,
      method: 'tool_executor',
      userId
    });
  },

  /**
   * Loguj nierozpoznaną intencję
   */
  logUnknownIntent: (query, analysisResult, userId = null) => {
    return addAutomaticAIFeedback(AI_FEEDBACK_TYPES.UNKNOWN_INTENT, {
      query,
      intent: analysisResult?.intent || 'unknown',
      confidence: analysisResult?.confidence,
      userId
    });
  }
}; 