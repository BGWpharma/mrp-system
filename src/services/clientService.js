import { db } from './firebase/config';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  serverTimestamp 
} from 'firebase/firestore';

// Kolekcja klientów
const CLIENTS_COLLECTION = 'clients';

/**
 * Pobiera wszystkich klientów
 */
export const getAllClients = async () => {
  try {
    const clientsRef = collection(db, CLIENTS_COLLECTION);
    const q = query(clientsRef, orderBy('name', 'asc'));
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania klientów:', error);
    throw error;
  }
};

/**
 * Pobiera klienta po ID
 */
export const getClientById = async (clientId) => {
  try {
    const clientRef = doc(db, CLIENTS_COLLECTION, clientId);
    const clientDoc = await getDoc(clientRef);
    
    if (!clientDoc.exists()) {
      throw new Error('Klient nie istnieje');
    }
    
    return {
      id: clientDoc.id,
      ...clientDoc.data()
    };
  } catch (error) {
    console.error('Błąd podczas pobierania klienta:', error);
    throw error;
  }
};

/**
 * Tworzy nowego klienta
 */
export const createClient = async (clientData, userId) => {
  try {
    const data = {
      ...clientData,
      createdAt: serverTimestamp(),
      createdBy: userId,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    const docRef = await addDoc(collection(db, CLIENTS_COLLECTION), data);
    
    return {
      id: docRef.id,
      ...data
    };
  } catch (error) {
    console.error('Błąd podczas tworzenia klienta:', error);
    throw error;
  }
};

/**
 * Aktualizuje dane klienta
 */
export const updateClient = async (clientId, clientData, userId) => {
  try {
    const data = {
      ...clientData,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    const clientRef = doc(db, CLIENTS_COLLECTION, clientId);
    await updateDoc(clientRef, data);
    
    return {
      id: clientId,
      ...data
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji klienta:', error);
    throw error;
  }
};

/**
 * Usuwa klienta
 */
export const deleteClient = async (clientId) => {
  try {
    const clientRef = doc(db, CLIENTS_COLLECTION, clientId);
    await deleteDoc(clientRef);
    
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas usuwania klienta:', error);
    throw error;
  }
}; 