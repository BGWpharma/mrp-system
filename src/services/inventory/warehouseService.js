// src/services/inventory/warehouseService.js

import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase/config';
import { COLLECTIONS } from './config/constants.js';
import { 
  validateId, 
  validateWarehouseData,
  ValidationError 
} from './utils/validators.js';
import { FirebaseQueryBuilder } from './config/firebaseQueries.js';
import { ServiceCacheManager } from '../cache/serviceCacheManager';

export const WAREHOUSES_CACHE_KEY = 'warehouses:all';
const WAREHOUSES_CACHE_TTL = 10 * 60 * 1000; // 10 minut — magazyny zmieniają się rzadko

/**
 * Usługa zarządzania magazynami
 * 
 * Ten moduł zawiera wszystkie funkcje związane z zarządzaniem magazynami:
 * - Pobieranie listy magazynów
 * - Pobieranie szczegółów magazynu
 * - Tworzenie nowych magazynów
 * - Aktualizacja istniejących magazynów
 * - Usuwanie magazynów (z walidacją)
 */

/**
 * Pobiera wszystkie magazyny
 * @param {string} orderByField - Pole do sortowania (domyślnie 'name')
 * @param {string} orderDirection - Kierunek sortowania (domyślnie 'asc')
 * @returns {Promise<Array>} - Lista magazynów
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getAllWarehouses = async (orderByField = 'name', orderDirection = 'asc') => {
  try {
    const cacheKey = orderByField === 'name' && orderDirection === 'asc' 
      ? WAREHOUSES_CACHE_KEY 
      : `warehouses:${orderByField}:${orderDirection}`;

    return await ServiceCacheManager.getOrFetch(
      cacheKey,
      async () => {
        const q = FirebaseQueryBuilder.buildWarehousesQuery(orderByField, orderDirection);
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
      },
      WAREHOUSES_CACHE_TTL
    );
  } catch (error) {
    console.error('Błąd podczas pobierania magazynów:', error);
    throw new Error(`Nie udało się pobrać listy magazynów: ${error.message}`);
  }
};

/**
 * Pobiera magazyn po ID
 * @param {string} warehouseId - ID magazynu
 * @returns {Promise<Object>} - Dane magazynu
 * @throws {ValidationError} - Gdy ID jest nieprawidłowe
 * @throws {Error} - Gdy magazyn nie istnieje lub wystąpi błąd
 */
export const getWarehouseById = async (warehouseId) => {
  try {
    // Walidacja ID
    const validatedId = validateId(warehouseId, 'warehouseId');
    
    const docRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.WAREHOUSES, validatedId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      };
    } else {
      throw new Error('Magazyn nie istnieje');
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania magazynu:', error);
    throw new Error(`Nie udało się pobrać magazynu: ${error.message}`);
  }
};

/**
 * Tworzy nowy magazyn
 * @param {Object} warehouseData - Dane magazynu
 * @param {string} warehouseData.name - Nazwa magazynu (wymagana)
 * @param {string} [warehouseData.description] - Opis magazynu
 * @param {string} [warehouseData.location] - Lokalizacja magazynu
 * @param {string} userId - ID użytkownika tworzącego magazyn
 * @returns {Promise<Object>} - Utworzony magazyn z ID
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas tworzenia
 */
export const createWarehouse = async (warehouseData, userId) => {
  try {
    // Walidacja danych magazynu
    const validatedData = validateWarehouseData(warehouseData);
    
    // Walidacja ID użytkownika
    const validatedUserId = validateId(userId, 'userId');
    
    // Sprawdź czy magazyn o takiej nazwie już istnieje
    const existingWarehouse = await getWarehouseByName(validatedData.name);
    if (existingWarehouse) {
      throw new ValidationError('Magazyn o takiej nazwie już istnieje', 'name');
    }
    
    const warehouseWithMeta = {
      ...validatedData,
      createdBy: validatedUserId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const collectionRef = FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.WAREHOUSES);
    const docRef = await addDoc(collectionRef, warehouseWithMeta);
    
    ServiceCacheManager.invalidate(WAREHOUSES_CACHE_KEY);

    return {
      id: docRef.id,
      ...warehouseWithMeta
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas tworzenia magazynu:', error);
    throw new Error(`Nie udało się utworzyć magazynu: ${error.message}`);
  }
};

/**
 * Aktualizuje istniejący magazyn
 * @param {string} warehouseId - ID magazynu do aktualizacji
 * @param {Object} warehouseData - Nowe dane magazynu
 * @param {string} userId - ID użytkownika aktualizującego magazyn
 * @returns {Promise<Object>} - Zaktualizowany magazyn
 * @throws {ValidationError} - Gdy dane są nieprawidłowe
 * @throws {Error} - Gdy magazyn nie istnieje lub wystąpi błąd
 */
export const updateWarehouse = async (warehouseId, warehouseData, userId) => {
  try {
    // Walidacja ID
    const validatedId = validateId(warehouseId, 'warehouseId');
    const validatedUserId = validateId(userId, 'userId');
    
    // Walidacja danych magazynu (opcjonalne pola)
    const validatedData = validateWarehouseData(warehouseData);
    
    // Sprawdź czy magazyn istnieje
    const existingWarehouse = await getWarehouseById(validatedId);
    
    // Jeśli nazwa się zmienia, sprawdź unikalność
    if (validatedData.name && validatedData.name !== existingWarehouse.name) {
      const duplicateWarehouse = await getWarehouseByName(validatedData.name);
      if (duplicateWarehouse && duplicateWarehouse.id !== validatedId) {
        throw new ValidationError('Magazyn o takiej nazwie już istnieje', 'name');
      }
    }
    
    const warehouseRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.WAREHOUSES, validatedId);
    
    const updates = {
      ...validatedData,
      updatedBy: validatedUserId,
      updatedAt: serverTimestamp()
    };
    
    await updateDoc(warehouseRef, updates);
    
    ServiceCacheManager.invalidate(WAREHOUSES_CACHE_KEY);

    return {
      id: validatedId,
      ...existingWarehouse,
      ...updates
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas aktualizacji magazynu:', error);
    throw new Error(`Nie udało się zaktualizować magazynu: ${error.message}`);
  }
};

/**
 * Usuwa magazyn (z walidacją czy nie zawiera partii)
 * @param {string} warehouseId - ID magazynu do usunięcia
 * @returns {Promise<boolean>} - True jeśli usunięto pomyślnie
 * @throws {ValidationError} - Gdy ID jest nieprawidłowe
 * @throws {Error} - Gdy magazyn zawiera partie lub wystąpi błąd
 */
export const deleteWarehouse = async (warehouseId) => {
  try {
    // Walidacja ID
    const validatedId = validateId(warehouseId, 'warehouseId');
    
    // Sprawdź czy magazyn istnieje
    await getWarehouseById(validatedId);
    
    // Sprawdź, czy magazyn zawiera jakieś partie
    const batchesQuery = query(
      FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES),
      where('warehouseId', '==', validatedId)
    );
    const querySnapshot = await getDocs(batchesQuery);
    
    if (querySnapshot.docs.length > 0) {
      throw new Error('Nie można usunąć magazynu, który zawiera partie magazynowe');
    }
    
    const warehouseRef = FirebaseQueryBuilder.getDocRef(COLLECTIONS.WAREHOUSES, validatedId);
    await deleteDoc(warehouseRef);
    
    ServiceCacheManager.invalidate(WAREHOUSES_CACHE_KEY);

    return true;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas usuwania magazynu:', error);
    throw new Error(`Nie udało się usunąć magazynu: ${error.message}`);
  }
};

/**
 * Pomocnicza funkcja do wyszukiwania magazynu po nazwie
 * @param {string} name - Nazwa magazynu
 * @returns {Promise<Object|null>} - Znaleziony magazyn lub null
 * @private
 */
const getWarehouseByName = async (name) => {
  try {
    const warehousesQuery = query(
      FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.WAREHOUSES),
      where('name', '==', name)
    );
    const querySnapshot = await getDocs(warehousesQuery);
    
    if (querySnapshot.docs.length > 0) {
      const doc = querySnapshot.docs[0];
      return {
        id: doc.id,
        ...doc.data()
      };
    }
    
    return null;
  } catch (error) {
    console.error('Błąd podczas wyszukiwania magazynu po nazwie:', error);
    return null;
  }
};

/**
 * Pobiera statystyki magazynu (liczba partii, produktów, itp.)
 * @param {string} warehouseId - ID magazynu
 * @returns {Promise<Object>} - Statystyki magazynu
 * @throws {ValidationError} - Gdy ID jest nieprawidłowe
 * @throws {Error} - Gdy wystąpi błąd podczas pobierania
 */
export const getWarehouseStatistics = async (warehouseId) => {
  try {
    // Walidacja ID
    const validatedId = validateId(warehouseId, 'warehouseId');
    
    // Sprawdź czy magazyn istnieje
    await getWarehouseById(validatedId);
    
    // Pobierz liczbę partii w magazynie
    const batchesQuery = query(
      FirebaseQueryBuilder.getCollectionRef(COLLECTIONS.INVENTORY_BATCHES),
      where('warehouseId', '==', validatedId)
    );
    const batchesSnapshot = await getDocs(batchesQuery);
    
    // Oblicz statystyki
    const batches = batchesSnapshot.docs.map(doc => doc.data());
    const totalBatches = batches.length;
    const totalQuantity = batches.reduce((sum, batch) => sum + (parseFloat(batch.quantity) || 0), 0);
    const uniqueItems = new Set(batches.map(batch => batch.itemId)).size;
    const activeBatches = batches.filter(batch => (parseFloat(batch.quantity) || 0) > 0).length;
    
    return {
      warehouseId: validatedId,
      totalBatches,
      activeBatches,
      emptyBatches: totalBatches - activeBatches,
      uniqueItems,
      totalQuantity: Math.round(totalQuantity * 1000) / 1000 // Zaokrąglij do 3 miejsc po przecinku
    };
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    console.error('Błąd podczas pobierania statystyk magazynu:', error);
    throw new Error(`Nie udało się pobrać statystyk magazynu: ${error.message}`);
  }
};