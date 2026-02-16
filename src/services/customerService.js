// src/services/customerService.js
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
import { db } from './firebase/config';
import { ServiceCacheManager } from './cache/serviceCacheManager';

const CUSTOMERS_COLLECTION = 'customers';
export const CUSTOMERS_CACHE_KEY = 'customers:all';
const CUSTOMERS_CACHE_TTL = 10 * 60 * 1000; // 10 minut

/**
 * Wewnętrzna funkcja pobierająca klientów z Firestore (bez cache)
 */
const fetchCustomersFromFirestore = async () => {
  const customersQuery = query(
    collection(db, CUSTOMERS_COLLECTION), 
    orderBy('name', 'asc')
  );
  const querySnapshot = await getDocs(customersQuery);
  
  return querySnapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));
};

/**
 * Pobiera wszystkich klientów (z cache — deduplikacja zapytań)
 */
export const getAllCustomers = async () => {
  try {
    return await ServiceCacheManager.getOrFetch(
      CUSTOMERS_CACHE_KEY,
      fetchCustomersFromFirestore,
      CUSTOMERS_CACHE_TTL
    );
  } catch (error) {
    console.error('Błąd podczas pobierania klientów:', error);
    throw error;
  }
};

/**
 * Pobiera klienta po ID
 */
export const getCustomerById = async (customerId) => {
  try {
    const customerDoc = await getDoc(doc(db, CUSTOMERS_COLLECTION, customerId));
    
    if (!customerDoc.exists()) {
      throw new Error('Klient nie został znaleziony');
    }
    
    return {
      id: customerDoc.id,
      ...customerDoc.data()
    };
  } catch (error) {
    console.error('Błąd podczas pobierania klienta:', error);
    throw error;
  }
};

/**
 * Tworzy nowego klienta
 */
export const createCustomer = async (customerData, userId) => {
  try {
    // Walidacja danych klienta
    validateCustomerData(customerData);
    
    const newCustomer = {
      ...customerData,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };
    
    const docRef = await addDoc(collection(db, CUSTOMERS_COLLECTION), newCustomer);
    ServiceCacheManager.invalidate(CUSTOMERS_CACHE_KEY);
    return docRef.id;
  } catch (error) {
    console.error('Błąd podczas tworzenia klienta:', error);
    throw error;
  }
};

/**
 * Aktualizuje dane klienta
 */
export const updateCustomer = async (customerId, customerData, userId) => {
  try {
    // Walidacja danych klienta
    validateCustomerData(customerData);
    
    const updatedCustomer = {
      ...customerData,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    };
    
    await updateDoc(doc(db, CUSTOMERS_COLLECTION, customerId), updatedCustomer);
    ServiceCacheManager.invalidate(CUSTOMERS_CACHE_KEY);
    return true;
  } catch (error) {
    console.error('Błąd podczas aktualizacji klienta:', error);
    throw error;
  }
};

/**
 * Usuwa klienta
 */
export const deleteCustomer = async (customerId) => {
  try {
    await deleteDoc(doc(db, CUSTOMERS_COLLECTION, customerId));
    ServiceCacheManager.invalidate(CUSTOMERS_CACHE_KEY);
    return true;
  } catch (error) {
    console.error('Błąd podczas usuwania klienta:', error);
    throw error;
  }
};

/**
 * Wyszukuje klientów po nazwie lub emailu
 */
export const searchCustomers = async (searchTerm) => {
  try {
    // Musimy wykonać pełne wyszukiwanie po stronie klienta
    // Firebase nie obsługuje wyszukiwania częściowego tekstu
    const customersSnapshot = await getAllCustomers();
    
    if (!searchTerm || typeof searchTerm !== 'string') {
      return customersSnapshot;
    }
    
    const searchTermLower = searchTerm.toLowerCase();
    
    return customersSnapshot.filter(customer => {
      return (
        (customer.name && customer.name.toLowerCase().includes(searchTermLower)) ||
        (customer.email && customer.email.toLowerCase().includes(searchTermLower))
      );
    });
  } catch (error) {
    console.error('Błąd podczas wyszukiwania klientów:', error);
    throw error;
  }
};

/**
 * Waliduje dane klienta
 */
const validateCustomerData = (customerData) => {
  if (!customerData.name || customerData.name.trim() === '') {
    throw new Error('Nazwa klienta jest wymagana');
  }
};

/**
 * Domyślne dane nowego klienta
 */
export const DEFAULT_CUSTOMER = {
  name: '',
  email: '',
  phone: '',
  vatEu: '', // Numer VAT-EU
  supplierVatEu: '', // Numer VAT-EU dostawcy
  billingAddress: '', // Adres do faktury
  shippingAddress: '', // Adres do wysyłki
  address: '', // Stare pole adresu zachowane dla kompatybilności
  orderAffix: '', // Afiks do numerów zamówień klienta, np. GW, BW itp.
  notes: ''
}; 