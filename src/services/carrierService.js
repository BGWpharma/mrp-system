// src/services/carrierService.js
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  orderBy,
  serverTimestamp 
} from 'firebase/firestore';
import { db } from './firebase/config';

const CARRIERS_COLLECTION = 'carriers';

/**
 * Pobiera wszystkich przewoźników
 */
export const getAllCarriers = async () => {
  try {
    const carriersQuery = query(
      collection(db, CARRIERS_COLLECTION), 
      orderBy('name', 'asc')
    );
    const querySnapshot = await getDocs(carriersQuery);
    
    const carriers = [];
    querySnapshot.forEach((doc) => {
      carriers.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return carriers;
  } catch (error) {
    console.error('Błąd podczas pobierania przewoźników:', error);
    throw error;
  }
};

/**
 * Pobiera przewoźnika po ID
 */
export const getCarrierById = async (carrierId) => {
  try {
    const carrierDoc = await getDoc(doc(db, CARRIERS_COLLECTION, carrierId));
    
    if (!carrierDoc.exists()) {
      throw new Error('Przewoźnik nie został znaleziony');
    }
    
    return {
      id: carrierDoc.id,
      ...carrierDoc.data()
    };
  } catch (error) {
    console.error('Błąd podczas pobierania przewoźnika:', error);
    throw error;
  }
};

/**
 * Tworzy nowego przewoźnika
 */
export const createCarrier = async (carrierData, userId = null) => {
  try {
    const newCarrier = {
      name: carrierData.name,
      address: carrierData.address || '',
      postalCode: carrierData.postalCode || '',
      city: carrierData.city || '',
      country: carrierData.country || 'Polska',
      nip: carrierData.nip || '',
      phone: carrierData.phone || '',
      email: carrierData.email || '',
      createdBy: userId || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, CARRIERS_COLLECTION), newCarrier);
    
    return {
      id: docRef.id,
      ...newCarrier
    };
  } catch (error) {
    console.error('Błąd podczas tworzenia przewoźnika:', error);
    throw error;
  }
};

/**
 * Aktualizuje przewoźnika
 */
export const updateCarrier = async (carrierId, carrierData) => {
  try {
    const carrierRef = doc(db, CARRIERS_COLLECTION, carrierId);
    
    const updateData = {
      ...carrierData,
      updatedAt: serverTimestamp()
    };
    
    await updateDoc(carrierRef, updateData);
    
    return {
      id: carrierId,
      ...updateData
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji przewoźnika:', error);
    throw error;
  }
};

/**
 * Usuwa przewoźnika
 */
export const deleteCarrier = async (carrierId) => {
  try {
    await deleteDoc(doc(db, CARRIERS_COLLECTION, carrierId));
    return true;
  } catch (error) {
    console.error('Błąd podczas usuwania przewoźnika:', error);
    throw error;
  }
};

