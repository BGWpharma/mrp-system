// src/hooks/useFirestore.js
import { useState, useEffect } from 'react';
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
  
  // Nasłuchiwanie zmian w kolekcji (opcjonalne)
  const subscribe = (callback, options = {}) => {
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
    
    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const docsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      setDocuments(docsData);
      if (callback) callback(docsData);
    }, (err) => {
      console.error(`Error subscribing to ${collectionName}:`, err);
      setError(err.message);
    });
    
    return unsubscribe;
  };
  
  // Załaduj domyślne dane przy montowaniu komponentu
  useEffect(() => {
    getAll()
      .catch(err => {
        console.error(`Error in initial load of ${collectionName}:`, err);
      });
      
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName]);
  
  return {
    documents,
    loading,
    error,
    getAll,
    getOne,
    add,
    update,
    remove,
    subscribe
  };
};