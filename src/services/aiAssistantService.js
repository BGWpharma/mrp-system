import { db } from './firebase/config';
import { 
  collection, 
  addDoc, 
  getDocs, 
  getDoc, 
  updateDoc, 
  doc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  limit,
  deleteDoc,
  setDoc
} from 'firebase/firestore';

// Maksymalna liczba wiadomości w kontekście
const MAX_CONTEXT_MESSAGES = 10;

/**
 * Pobierz klucz API OpenAI zapisany w bazie danych Firebase
 * @param {string} userId - ID użytkownika
 * @returns {Promise<string|null>} - Klucz API OpenAI lub null jeśli nie znaleziono
 */
export const getOpenAIApiKey = async (userId) => {
  try {
    const apiKeyRef = doc(db, 'settings', 'openai', 'users', userId);
    const apiKeyDoc = await getDoc(apiKeyRef);
    
    if (apiKeyDoc.exists() && apiKeyDoc.data().apiKey) {
      return apiKeyDoc.data().apiKey;
    }
    
    return null;
  } catch (error) {
    console.error('Błąd podczas pobierania klucza API OpenAI:', error);
    throw error;
  }
};

/**
 * Zapisz klucz API OpenAI w bazie danych Firebase
 * @param {string} userId - ID użytkownika
 * @param {string} apiKey - Klucz API OpenAI
 * @returns {Promise<void>}
 */
export const saveOpenAIApiKey = async (userId, apiKey) => {
  try {
    const apiKeyRef = doc(db, 'settings', 'openai', 'users', userId);
    await setDoc(apiKeyRef, {
      apiKey,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Błąd podczas zapisywania klucza API OpenAI:', error);
    throw error;
  }
};

/**
 * Wysyła zapytanie do API OpenAI (GPT-4o)
 * @param {string} apiKey - Klucz API OpenAI
 * @param {Array} messages - Wiadomości do wysłania do API
 * @returns {Promise<string>} - Odpowiedź asystenta
 */
export const callOpenAIAPI = async (apiKey, messages) => {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages,
        temperature: 0.7,
        max_tokens: 1000
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      const errorMessage = errorData.error?.message || 'Błąd podczas komunikacji z API OpenAI';
      
      // Sprawdzamy, czy error dotyczy limitu zapytań lub pobierania
      if (response.status === 429) {
        throw new Error(`Przekroczono limit zapytań do API OpenAI: ${errorMessage}`);
      } else if (errorMessage.includes('quota')) {
        throw new Error(`Przekroczono przydział API OpenAI: ${errorMessage}`);
      } else {
        throw new Error(errorMessage);
      }
    }
    
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error) {
    console.error('Błąd podczas komunikacji z API OpenAI:', error);
    throw error;
  }
};

/**
 * Formatuje wiadomości do wysłania do API OpenAI
 * @param {Array} messages - Lista wiadomości z konwersacji
 * @returns {Array} - Sformatowane wiadomości dla API OpenAI
 */
const formatMessagesForOpenAI = (messages) => {
  // Dodajemy instrukcję systemową jako pierwszy element
  const systemInstruction = {
    role: 'system',
    content: `Jesteś asystentem AI dla systemu MRP. Udzielaj odpowiedzi na podstawie podanych danych i dostępnej wiedzy.
    Odpowiadaj zawsze w języku polskim. Twoim zadaniem jest pomoc w analizie danych, zarządzaniu produkcją, 
    stanami magazynowymi i procesami biznesowymi. Używaj konkretnych informacji i danych, gdy są dostępne.
    Jeśli nie znasz odpowiedzi, przyznaj to zamiast wymyślać informacje.`
  };
  
  // Limitujemy liczbę wiadomości do MAX_CONTEXT_MESSAGES ostatnich
  const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);
  
  // Formatowanie wiadomości do formatu wymaganego przez API OpenAI
  const formattedMessages = recentMessages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
  
  return [systemInstruction, ...formattedMessages];
};

/**
 * Pobierz historię konwersacji dla danego użytkownika
 * @param {string} userId - ID użytkownika
 * @param {number} limitCount - Limit liczby konwersacji do pobrania
 * @returns {Promise<Array>} - Lista konwersacji
 */
export const getUserConversations = async (userId, limitCount = 10) => {
  try {
    const conversationsRef = collection(db, 'aiConversations');
    const q = query(
      conversationsRef,
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc'),
      limit(limitCount)
    );
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania konwersacji użytkownika:', error);
    throw error;
  }
};

/**
 * Pobierz wiadomości dla danej konwersacji
 * @param {string} conversationId - ID konwersacji
 * @returns {Promise<Array>} - Lista wiadomości
 */
export const getConversationMessages = async (conversationId) => {
  try {
    const messagesRef = collection(db, 'aiConversations', conversationId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania wiadomości konwersacji:', error);
    throw error;
  }
};

/**
 * Utwórz nową konwersację
 * @param {string} userId - ID użytkownika
 * @param {string} title - Tytuł konwersacji
 * @returns {Promise<string>} - ID utworzonej konwersacji
 */
export const createConversation = async (userId, title = 'Nowa konwersacja') => {
  try {
    const conversationsRef = collection(db, 'aiConversations');
    const docRef = await addDoc(conversationsRef, {
      userId,
      title,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      messageCount: 0
    });
    
    return docRef.id;
  } catch (error) {
    console.error('Błąd podczas tworzenia nowej konwersacji:', error);
    throw error;
  }
};

/**
 * Dodaj wiadomość do konwersacji
 * @param {string} conversationId - ID konwersacji
 * @param {string} role - Rola nadawcy ('user' lub 'assistant')
 * @param {string} content - Treść wiadomości
 * @returns {Promise<string>} - ID dodanej wiadomości
 */
export const addMessageToConversation = async (conversationId, role, content) => {
  try {
    // Dodanie wiadomości
    const messagesRef = collection(db, 'aiConversations', conversationId, 'messages');
    const timestamp = new Date().toISOString();
    
    const docRef = await addDoc(messagesRef, {
      role,
      content,
      timestamp
    });
    
    // Aktualizacja licznika wiadomości i daty aktualizacji konwersacji
    const conversationRef = doc(db, 'aiConversations', conversationId);
    const conversationDoc = await getDoc(conversationRef);
    
    if (conversationDoc.exists()) {
      await updateDoc(conversationRef, {
        messageCount: (conversationDoc.data().messageCount || 0) + 1,
        updatedAt: serverTimestamp(),
        // Aktualizujemy tytuł konwersacji na podstawie pierwszej wiadomości użytkownika
        ...(role === 'user' && conversationDoc.data().messageCount === 0 ? 
          { title: content.substring(0, 50) + (content.length > 50 ? '...' : '') } 
          : {})
      });
    }
    
    return docRef.id;
  } catch (error) {
    console.error('Błąd podczas dodawania wiadomości do konwersacji:', error);
    throw error;
  }
};

/**
 * Funkcja przetwarzająca zapytanie użytkownika i zwracająca odpowiedź asystenta
 * Używa GPT-4o poprzez API OpenAI
 * @param {string} query - Zapytanie użytkownika
 * @param {Array} context - Kontekst konwersacji (poprzednie wiadomości)
 * @param {string} userId - ID użytkownika
 * @returns {Promise<string>} - Odpowiedź asystenta
 */
export const processAIQuery = async (query, context = [], userId) => {
  try {
    // Próba pobrania klucza API
    const apiKey = await getOpenAIApiKey(userId);
    
    // Jeśli nie ma klucza API, używamy mocka
    if (!apiKey) {
      return getMockResponse(query);
    }
    
    // Przygotowanie wiadomości do wysłania
    const allMessages = [...context, { role: 'user', content: query }];
    const formattedMessages = formatMessagesForOpenAI(allMessages);
    
    // Wywołanie API OpenAI
    return await callOpenAIAPI(apiKey, formattedMessages);
  } catch (error) {
    console.error('Błąd podczas przetwarzania zapytania przez AI:', error);
    
    // Szczegółowa obsługa różnych rodzajów błędów
    if (error.message.includes('Przekroczono limit zapytań')) {
      return `😞 Przekroczono limit zapytań do API OpenAI. Spróbuj ponownie za kilka minut lub sprawdź ustawienia swojego konta OpenAI (https://platform.openai.com/account/limits).`;
    } else if (error.message.includes('Przekroczono przydział') || error.message.includes('quota') || error.message.includes('billing')) {
      return `⚠️ Przekroczono limit dostępnych środków na koncie OpenAI. Aby kontynuować korzystanie z asystenta AI, sprawdź swój plan i dane rozliczeniowe na stronie: https://platform.openai.com/account/billing`;
    } else if (error.message.includes('API')) {
      return `❌ Wystąpił błąd podczas komunikacji z API OpenAI: ${error.message}. Sprawdź swój klucz API lub spróbuj ponownie później.`;
    }
    
    // Fallback do mocka w przypadku innego błędu
    return getMockResponse(query);
  }
};

/**
 * Fallback do odpowiedzi mocka w przypadku braku klucza API lub błędu
 * @param {string} query - Zapytanie użytkownika
 * @returns {string} - Mockowa odpowiedź asystenta
 */
const getMockResponse = (query) => {
  const mockResponses = [
    `Na podstawie danych w systemie MRP, mogę odpowiedzieć na pytanie o "${query}". Jednak aby uzyskać rzeczywiste dane, należy skonfigurować klucz API OpenAI.`,
    `Analizując dane magazynowe, mogłbym powiedzieć więcej o "${query}", ale potrzebuję klucza API OpenAI do pełnej funkcjonalności.`,
    `Aby udzielić precyzyjnej odpowiedzi na temat "${query}", wymagana jest konfiguracja klucza API OpenAI w ustawieniach asystenta.`,
    `System jest gotowy do analizy "${query}", ale brakuje klucza API OpenAI. Proszę o konfigurację klucza w ustawieniach asystenta.`
  ];
  
  return mockResponses[Math.floor(Math.random() * mockResponses.length)];
};

/**
 * Usuń konwersację
 * @param {string} conversationId - ID konwersacji do usunięcia
 * @returns {Promise<void>}
 */
export const deleteConversation = async (conversationId) => {
  try {
    // W pełnej implementacji należałoby również usunąć wszystkie wiadomości w podkolekcji
    const conversationRef = doc(db, 'aiConversations', conversationId);
    await deleteDoc(conversationRef);
  } catch (error) {
    console.error('Błąd podczas usuwania konwersacji:', error);
    throw error;
  }
}; 