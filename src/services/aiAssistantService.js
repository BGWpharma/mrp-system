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
  deleteDoc
} from 'firebase/firestore';

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
 * W przyszłości będzie łączyć się z zewnętrznym API AI
 * @param {string} query - Zapytanie użytkownika
 * @param {Array} context - Kontekst konwersacji (poprzednie wiadomości)
 * @returns {Promise<string>} - Odpowiedź asystenta
 */
export const processAIQuery = async (query, context = []) => {
  try {
    // TODO: Zaimplementować połączenie z zewnętrznym API AI
    
    // Przykładowa odpowiedź (mock)
    const mockResponses = [
      `Na podstawie danych w systemie MRP, ${query}`,
      `Analizując dane magazynowe, mogę powiedzieć że ${query}`,
      `Zgodnie z informacjami w bazie danych, odpowiedź na pytanie "${query}" to...`,
      `Po analizie danych z systemu, odpowiedź brzmi: ${query}`
    ];
    
    // Symulujemy opóźnienie odpowiedzi
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return mockResponses[Math.floor(Math.random() * mockResponses.length)];
  } catch (error) {
    console.error('Błąd podczas przetwarzania zapytania przez AI:', error);
    throw error;
  }
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