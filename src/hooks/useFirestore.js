// src/hooks/useFirestore.js
import { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  doc, 
  getDocs, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  limit,
  onSnapshot,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useAuth } from './useAuth';

/**
 * Hook do zarządzania kolekcją Firestore
 * 
 * @param {string} collectionName - Nazwa kolekcji
 * @returns {Object} Obiekt zawierający dane i funkcje do operacji na kolekcji
 */
export const useFirestore = (collectionName) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { currentUser } = useAuth();
  const unsubscribeRef = useRef(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  
  // Pobierz wszystkie dokumenty
  const getAll = async (options = {}) => {
    try {
      setLoading(true);
      setError(null);
      
      const collectionRef = collection(db, collectionName);
      
      // Buduj zapytanie na podstawie opcji
      let q = collectionRef;
      
      if (options.where) {
        q = query(q, where(options.where.field, options.where.operator, options.where.value));
      }
      
      if (options.orderBy) {
        q = query(q, orderBy(options.orderBy.field, options.orderBy.direction || 'asc'));
      }
      
      if (options.limit) {
        q = query(q, limit(options.limit));
      }
      
      const querySnapshot = await getDocs(q);
      const docsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setDocuments(docsData);
      return docsData;
    } catch (err) {
      console.error(`Error getting documents from ${collectionName}:`, err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };
  
  // Pobierz jeden dokument
  const getOne = async (id) => {
    try {
      setLoading(true);
      setError(null);
      
      const docRef = doc(db, collectionName, id);
      const docSnapshot = await getDoc(docRef);
      
      if (docSnapshot.exists()) {
        return {
          id: docSnapshot.id,
          ...docSnapshot.data()
        };
      } else {
        throw new Error(`Document not found in ${collectionName}`);
      }
    } catch (err) {
      console.error(`Error getting document from ${collectionName}:`, err);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };
  
  // Dodaj nowy dokument
  const add = async (data) => {
    try {
      setError(null);
      
      const dataWithMeta = {
        ...data,
        createdAt: serverTimestamp(),
        createdBy: currentUser?.uid,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.uid
      };
      
      const docRef = await addDoc(collection(db, collectionName), dataWithMeta);
      return {
        id: docRef.id,
        ...dataWithMeta
      };
    } catch (err) {
      console.error(`Error adding document to ${collectionName}:`, err);
      setError(err.message);
      throw err;
    }
  };
  
  // Aktualizuj dokument
  const update = async (id, data) => {
    try {
      setError(null);
      
      const dataWithMeta = {
        ...data,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.uid
      };
      
      const docRef = doc(db, collectionName, id);
      await updateDoc(docRef, dataWithMeta);
      
      return {
        id,
        ...dataWithMeta
      };
    } catch (err) {
      console.error(`Error updating document in ${collectionName}:`, err);
      setError(err.message);
      throw err;
    }
  };
  
  // Usuń dokument
  const remove = async (id) => {
    try {
      setError(null);
      
      const docRef = doc(db, collectionName, id);
      await deleteDoc(docRef);
      
      return { id };
    } catch (err) {
      console.error(`Error deleting document from ${collectionName}:`, err);
      setError(err.message);
      throw err;
    }
  };
  
  // Odsubskrybuj bieżącą subskrypcję, jeśli istnieje
  const unsubscribe = () => {
    if (unsubscribeRef.current) {
      console.log(`Odsubskrybuję od zmian w kolekcji ${collectionName}`);
      unsubscribeRef.current();
      unsubscribeRef.current = null;
      setIsSubscribed(false);
    }
  };
  
  // Nasłuchiwanie zmian w kolekcji z zaawansowanymi opcjami
  const subscribe = (callback, options = {}) => {
    // Wyczyść istniejącą subskrypcję
    unsubscribe();
    
    console.log(`Rozpoczynam nasłuchiwanie zmian w kolekcji ${collectionName} z opcjami:`, options);
    
    // Ustaw ograniczenia zapytania
    const collectionRef = collection(db, collectionName);
    let queryConstraints = [];
    
    // Dodaj filtry
    if (options.where) {
      if (Array.isArray(options.where)) {
        options.where.forEach(filter => {
          queryConstraints.push(where(filter.field, filter.operator, filter.value));
        });
      } else {
        queryConstraints.push(where(options.where.field, options.where.operator, options.where.value));
      }
    }
    
    // Dodaj sortowanie
    if (options.orderBy) {
      if (Array.isArray(options.orderBy)) {
        options.orderBy.forEach(sort => {
          queryConstraints.push(orderBy(sort.field, sort.direction || 'asc'));
        });
      } else {
        queryConstraints.push(orderBy(options.orderBy.field, options.orderBy.direction || 'asc'));
      }
    }
    
    // Dodaj limit
    if (options.limit) {
      queryConstraints.push(limit(options.limit));
    }
    
    // Utwórz zapytanie
    const q = query(collectionRef, ...queryConstraints);
    
    // Ustaw częstotliwość aktualizacji
    const snapshotOptions = {};
    if (options.snapshotListenOptions) {
      Object.assign(snapshotOptions, options.snapshotListenOptions);
    }
    
    // Rozpocznij nasłuchiwanie
    unsubscribeRef.current = onSnapshot(
      q, 
      snapshotOptions,
      (querySnapshot) => {
        const docsData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setDocuments(docsData);
        setIsSubscribed(true);
        if (callback) callback(docsData);
      }, 
      (err) => {
        console.error(`Error subscribing to ${collectionName}:`, err);
        setError(err.message);
        setIsSubscribed(false);
      }
    );
    
    // Zwróć funkcję do ręcznego odsubskrybowania
    return unsubscribe;
  };
  
  // Automatycznie odsubskrybuj przy odmontowaniu komponentu
  useEffect(() => {
    return () => {
      unsubscribe();
    };
  }, []);
  
  // Załaduj domyślne dane przy montowaniu komponentu
  useEffect(() => {
    // Pobierz dane tylko jeśli nie ma aktywnej subskrypcji
    if (!isSubscribed) {
      getAll()
        .catch(err => {
          console.error(`Error in initial load of ${collectionName}:`, err);
        });
    }
    
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName]);
  
  return {
    documents,
    loading,
    error,
    isSubscribed,
    getAll,
    getOne,
    add,
    update,
    remove,
    subscribe,
    unsubscribe
  };
};