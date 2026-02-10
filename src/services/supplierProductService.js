// src/services/supplierProductService.js

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  writeBatch,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db, storage } from './firebase/config';
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const SUPPLIER_PRODUCTS_COLLECTION = 'supplierProducts';
const PURCHASE_ORDERS_COLLECTION = 'purchaseOrders';

/**
 * Pobiera katalog produktów dostawcy
 * @param {string} supplierId - ID dostawcy
 * @returns {Promise<Array>} - Lista produktów dostawcy
 */
export const getSupplierProducts = async (supplierId) => {
  try {
    if (!supplierId) {
      throw new Error('ID dostawcy jest wymagane');
    }

    const q = query(
      collection(db, SUPPLIER_PRODUCTS_COLLECTION),
      where('supplierId', '==', supplierId),
      orderBy('productName', 'asc')
    );

    const querySnapshot = await getDocs(q);
    const products = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      products.push({
        id: docSnap.id,
        ...data,
        lastOrderDate: data.lastOrderDate?.toDate?.() || data.lastOrderDate || null,
        firstSeenAt: data.firstSeenAt?.toDate?.() || data.firstSeenAt || null,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || null,
        certificateValidFrom: data.certificateValidFrom?.toDate?.() || data.certificateValidFrom || null,
        certificateValidTo: data.certificateValidTo?.toDate?.() || data.certificateValidTo || null
      });
    });

    return products;
  } catch (error) {
    console.error('Błąd podczas pobierania katalogu produktów dostawcy:', error);
    throw new Error(`Nie udało się pobrać katalogu produktów: ${error.message}`);
  }
};

/**
 * Pobiera listę dostawców danego produktu
 * @param {string} inventoryItemId - ID produktu magazynowego
 * @returns {Promise<Array>} - Lista dostawców produktu
 */
export const getProductSuppliers = async (inventoryItemId) => {
  try {
    if (!inventoryItemId) {
      throw new Error('ID produktu jest wymagane');
    }

    const q = query(
      collection(db, SUPPLIER_PRODUCTS_COLLECTION),
      where('inventoryItemId', '==', inventoryItemId),
      orderBy('lastPrice', 'asc')
    );

    const querySnapshot = await getDocs(q);
    const suppliers = [];

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      suppliers.push({
        id: docSnap.id,
        ...data,
        lastOrderDate: data.lastOrderDate?.toDate?.() || data.lastOrderDate || null,
        firstSeenAt: data.firstSeenAt?.toDate?.() || data.firstSeenAt || null,
        updatedAt: data.updatedAt?.toDate?.() || data.updatedAt || null,
        certificateValidFrom: data.certificateValidFrom?.toDate?.() || data.certificateValidFrom || null,
        certificateValidTo: data.certificateValidTo?.toDate?.() || data.certificateValidTo || null
      });
    });

    return suppliers;
  } catch (error) {
    console.error('Błąd podczas pobierania dostawców produktu:', error);
    throw new Error(`Nie udało się pobrać dostawców produktu: ${error.message}`);
  }
};

/**
 * Typy certyfikatów dostępne w systemie (zgodne z certyfikacjami receptur)
 */
export const CERTIFICATE_TYPES = [
  { value: 'eco', label: 'Eco' },
  { value: 'halal', label: 'Halal' },
  { value: 'kosher', label: 'Kosher' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'vege', label: 'Vegetarian' },
  { value: 'gmp', label: 'GMP' },
  { value: 'iso', label: 'ISO' },
  { value: 'other', label: 'Inny' }
];

/**
 * Aktualizuje dane certyfikatu produktu dostawcy
 * @param {string} productId - ID rekordu supplierProduct
 * @param {Object} certificateData - Dane certyfikatu
 * @param {string} certificateData.certificateUnit - Jednostka certyfikatu
 * @param {string} certificateData.certificateNumber - Nr certyfikatu
 * @param {string} certificateData.certificateType - Typ certyfikatu (eco, halal, kosher, vegan, vege, gmp, iso, other)
 * @param {Date|null} certificateData.certificateValidFrom - Ważny od
 * @param {Date|null} certificateData.certificateValidTo - Ważny do
 * @returns {Promise<Object>} - Zaktualizowany rekord
 */
export const updateProductCertificate = async (productId, certificateData) => {
  try {
    if (!productId) {
      throw new Error('ID produktu jest wymagane');
    }

    const docRef = doc(db, SUPPLIER_PRODUCTS_COLLECTION, productId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('Nie znaleziono produktu w katalogu');
    }

    const updateData = {
      certificateUnit: certificateData.certificateUnit || '',
      certificateNumber: certificateData.certificateNumber || '',
      certificateType: certificateData.certificateType || '',
      certificateValidFrom: certificateData.certificateValidFrom
        ? Timestamp.fromDate(new Date(certificateData.certificateValidFrom))
        : null,
      certificateValidTo: certificateData.certificateValidTo
        ? Timestamp.fromDate(new Date(certificateData.certificateValidTo))
        : null,
      updatedAt: serverTimestamp()
    };

    await updateDoc(docRef, updateData);

    return { id: productId, ...docSnap.data(), ...updateData };
  } catch (error) {
    console.error('Błąd podczas aktualizacji certyfikatu:', error);
    throw new Error(`Nie udało się zaktualizować certyfikatu: ${error.message}`);
  }
};

/**
 * Przesyła plik certyfikatu PDF do Firebase Storage
 * @param {string} supplierId - ID dostawcy
 * @param {string} productId - ID rekordu supplierProduct
 * @param {File} file - Plik do przesłania (PDF)
 * @returns {Promise<Object>} - Obiekt z downloadURL i storagePath
 */
export const uploadCertificateFile = async (supplierId, productId, file) => {
  try {
    if (!supplierId || !productId) {
      throw new Error('ID dostawcy i produktu są wymagane');
    }
    if (!file) {
      throw new Error('Plik jest wymagany');
    }

    // Walidacja typu pliku
    const allowedTypes = ['application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      throw new Error('Dozwolony jest tylko format PDF');
    }

    // Limit rozmiaru: 10MB
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new Error('Maksymalny rozmiar pliku to 10MB');
    }

    const timestamp = new Date().getTime();
    const fileName = `${timestamp}_${file.name}`;
    const storagePath = `SupplierCertificates/${supplierId}/${productId}/${fileName}`;

    const fileRef = storageRef(storage, storagePath);
    await uploadBytes(fileRef, file);
    const downloadURL = await getDownloadURL(fileRef);

    // Aktualizacja dokumentu supplierProduct
    const docRef = doc(db, SUPPLIER_PRODUCTS_COLLECTION, productId);
    await updateDoc(docRef, {
      certificateFileName: file.name,
      certificateContentType: file.type,
      certificateStoragePath: storagePath,
      certificateFileUrl: downloadURL,
      certificateUploadedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    return { downloadURL, storagePath, fileName: file.name };
  } catch (error) {
    console.error('Błąd podczas przesyłania pliku certyfikatu:', error);
    throw new Error(`Nie udało się przesłać pliku certyfikatu: ${error.message}`);
  }
};

/**
 * Usuwa plik certyfikatu z Firebase Storage i czyści pola w dokumencie
 * @param {string} productId - ID rekordu supplierProduct
 * @returns {Promise<void>}
 */
export const deleteCertificateFile = async (productId) => {
  try {
    if (!productId) {
      throw new Error('ID produktu jest wymagane');
    }

    const docRef = doc(db, SUPPLIER_PRODUCTS_COLLECTION, productId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error('Nie znaleziono produktu w katalogu');
    }

    const data = docSnap.data();

    // Usuń plik z Storage jeśli istnieje
    if (data.certificateStoragePath) {
      const fileRef = storageRef(storage, data.certificateStoragePath);
      try {
        await deleteObject(fileRef);
      } catch (storageError) {
        console.warn('Nie można usunąć pliku z Storage:', storageError);
      }
    }

    // Wyczyść pola pliku w dokumencie
    await updateDoc(docRef, {
      certificateFileName: '',
      certificateContentType: '',
      certificateStoragePath: '',
      certificateFileUrl: '',
      certificateUploadedAt: null,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error('Błąd podczas usuwania pliku certyfikatu:', error);
    throw new Error(`Nie udało się usunąć pliku certyfikatu: ${error.message}`);
  }
};

/**
 * Pomocnicza funkcja: zbiera dane certyfikatów z istniejących rekordów katalogu
 * @param {Array} docs - Dokumenty Firestore
 * @returns {Map} - Mapa inventoryItemId → dane certyfikatu
 */
const collectCertificateData = (docs) => {
  const certMap = new Map();
  docs.forEach((docSnap) => {
    const data = docSnap.data();
    const hasAnyCertData = data.certificateUnit || data.certificateNumber ||
      data.certificateValidFrom || data.certificateValidTo || data.certificateType ||
      data.certificateFileUrl || data.certificateStoragePath;
    if (hasAnyCertData) {
      certMap.set(data.inventoryItemId, {
        certificateUnit: data.certificateUnit || '',
        certificateNumber: data.certificateNumber || '',
        certificateType: data.certificateType || '',
        certificateValidFrom: data.certificateValidFrom || null,
        certificateValidTo: data.certificateValidTo || null,
        certificateFileName: data.certificateFileName || '',
        certificateContentType: data.certificateContentType || '',
        certificateStoragePath: data.certificateStoragePath || '',
        certificateFileUrl: data.certificateFileUrl || '',
        certificateUploadedAt: data.certificateUploadedAt || null
      });
    }
  });
  return certMap;
};

/**
 * Pomocnicza funkcja: przywraca dane certyfikatów do nowo utworzonych rekordów
 * @param {string} supplierId - ID dostawcy
 * @param {Map} certMap - Mapa inventoryItemId → dane certyfikatu
 */
const restoreCertificateData = async (supplierId, certMap) => {
  if (certMap.size === 0) return;

  const q = query(
    collection(db, SUPPLIER_PRODUCTS_COLLECTION),
    where('supplierId', '==', supplierId)
  );
  const snapshot = await getDocs(q);

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    const certData = certMap.get(data.inventoryItemId);
    if (certData) {
      await updateDoc(doc(db, SUPPLIER_PRODUCTS_COLLECTION, docSnap.id), certData);
    }
  }
};

/**
 * Aktualizuje lub tworzy wpis w katalogu dostawcy na podstawie pozycji PO
 * @param {string} supplierId - ID dostawcy
 * @param {Object} item - Pozycja z zamówienia
 * @param {Object} poData - Dane zamówienia (number, id, orderDate, currency)
 * @returns {Promise<Object>} - Zaktualizowany/utworzony rekord
 */
export const upsertSupplierProduct = async (supplierId, item, poData) => {
  try {
    const inventoryItemId = item.inventoryItemId || item.itemId;
    if (!inventoryItemId || !supplierId) {
      return null;
    }

    const unitPrice = parseFloat(item.unitPrice);
    if (isNaN(unitPrice) || unitPrice <= 0) {
      return null;
    }

    // Szukamy istniejącego rekordu
    const q = query(
      collection(db, SUPPLIER_PRODUCTS_COLLECTION),
      where('supplierId', '==', supplierId),
      where('inventoryItemId', '==', inventoryItemId)
    );

    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      // Aktualizacja istniejącego rekordu
      const existingDoc = querySnapshot.docs[0];
      const existingData = existingDoc.data();

      const orderCount = (existingData.orderCount || 0) + 1;
      const totalOrderedQuantity = (existingData.totalOrderedQuantity || 0) + (parseFloat(item.quantity) || 0);

      // Przelicz statystyki cenowe
      const minPrice = Math.min(existingData.minPrice || Infinity, unitPrice);
      const maxPrice = Math.max(existingData.maxPrice || 0, unitPrice);
      // Średnia ważona z poprzednich zamówień
      const prevTotal = (existingData.averagePrice || unitPrice) * (existingData.orderCount || 0);
      const averagePrice = (prevTotal + unitPrice) / orderCount;

      const updateData = {
        lastPrice: unitPrice,
        averagePrice: Math.round(averagePrice * 100) / 100,
        minPrice,
        maxPrice,
        currency: item.currency || poData.currency || 'PLN',
        totalOrderedQuantity,
        orderCount,
        lastOrderDate: poData.orderDate ? Timestamp.fromDate(new Date(poData.orderDate)) : serverTimestamp(),
        lastPurchaseOrderId: poData.id,
        lastPurchaseOrderNumber: poData.number || '',
        productName: item.name || existingData.productName,
        unit: item.unit || existingData.unit,
        updatedAt: serverTimestamp()
      };

      await updateDoc(doc(db, SUPPLIER_PRODUCTS_COLLECTION, existingDoc.id), updateData);

      return { id: existingDoc.id, ...existingData, ...updateData };
    } else {
      // Tworzenie nowego rekordu
      const newData = {
        supplierId,
        inventoryItemId,
        productName: item.name || '',
        unit: item.unit || 'szt',
        supplierProductCode: item.supplierProductCode || '',
        lastPrice: unitPrice,
        averagePrice: unitPrice,
        minPrice: unitPrice,
        maxPrice: unitPrice,
        currency: item.currency || poData.currency || 'PLN',
        totalOrderedQuantity: parseFloat(item.quantity) || 0,
        orderCount: 1,
        lastOrderDate: poData.orderDate ? Timestamp.fromDate(new Date(poData.orderDate)) : serverTimestamp(),
        lastPurchaseOrderId: poData.id,
        lastPurchaseOrderNumber: poData.number || '',
        firstSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const docRef = await addDoc(collection(db, SUPPLIER_PRODUCTS_COLLECTION), newData);

      return { id: docRef.id, ...newData };
    }
  } catch (error) {
    console.error('Błąd podczas aktualizacji katalogu dostawcy:', error);
    throw error;
  }
};

/**
 * Aktualizuje katalog dostawcy na podstawie zamówienia zakupu
 * @param {Object} purchaseOrder - Pełne dane zamówienia zakupu
 * @returns {Promise<Object>} - Wynik operacji
 */
export const updateCatalogFromPurchaseOrder = async (purchaseOrder) => {
  try {
    const supplierId = purchaseOrder.supplierId;
    if (!supplierId) {
      throw new Error('Brak ID dostawcy w zamówieniu');
    }

    if (!purchaseOrder.items || purchaseOrder.items.length === 0) {
      return { success: true, updated: 0, message: 'Brak pozycji do przetworzenia' };
    }

    let updatedCount = 0;
    const errors = [];

    const poData = {
      id: purchaseOrder.id,
      number: purchaseOrder.number,
      orderDate: purchaseOrder.orderDate,
      currency: purchaseOrder.currency
    };

    for (const item of purchaseOrder.items) {
      try {
        const result = await upsertSupplierProduct(supplierId, item, poData);
        if (result) {
          updatedCount++;
        }
      } catch (error) {
        errors.push({
          itemId: item.inventoryItemId,
          itemName: item.name,
          error: error.message
        });
      }
    }

    return {
      success: true,
      updated: updatedCount,
      errors,
      message: `Zaktualizowano ${updatedCount} produktów w katalogu dostawcy`
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji katalogu z PO:', error);
    throw new Error(`Nie udało się zaktualizować katalogu: ${error.message}`);
  }
};

/**
 * Przebudowuje katalog dostawcy na podstawie wszystkich historycznych PO (nie-draft)
 * @param {string} supplierId - ID dostawcy
 * @returns {Promise<Object>} - Wynik operacji
 */
export const rebuildSupplierCatalog = async (supplierId) => {
  try {
    if (!supplierId) {
      throw new Error('ID dostawcy jest wymagane');
    }

    // 1. Zachowaj dane certyfikatów przed usunięciem
    const existingQuery = query(
      collection(db, SUPPLIER_PRODUCTS_COLLECTION),
      where('supplierId', '==', supplierId)
    );
    const existingDocs = await getDocs(existingQuery);
    const savedCertificates = collectCertificateData(existingDocs.docs);

    // 2. Usuń stare rekordy katalogu tego dostawcy
    if (!existingDocs.empty) {
      const batch = writeBatch(db);
      existingDocs.docs.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
    }

    // 3. Pobierz wszystkie PO dostawcy (nie-draft)
    const poQuery = query(
      collection(db, PURCHASE_ORDERS_COLLECTION),
      where('supplierId', '==', supplierId),
      orderBy('createdAt', 'asc')
    );

    const poSnapshot = await getDocs(poQuery);

    if (poSnapshot.empty) {
      return { success: true, updated: 0, ordersProcessed: 0, message: 'Brak zamówień do przetworzenia' };
    }

    let totalUpdated = 0;
    let ordersProcessed = 0;

    for (const poDoc of poSnapshot.docs) {
      const poData = poDoc.data();

      // Pomijamy szkice
      if (poData.status === 'draft') {
        continue;
      }

      if (!poData.items || poData.items.length === 0) {
        continue;
      }

      const poInfo = {
        id: poDoc.id,
        number: poData.number,
        orderDate: poData.orderDate?.toDate?.() || poData.orderDate,
        currency: poData.currency
      };

      for (const item of poData.items) {
        try {
          const result = await upsertSupplierProduct(supplierId, item, poInfo);
          if (result) {
            totalUpdated++;
          }
        } catch (error) {
          console.warn(`Pomijam pozycję ${item.name}: ${error.message}`);
        }
      }

      ordersProcessed++;
    }

    // 4. Przywróć dane certyfikatów
    await restoreCertificateData(supplierId, savedCertificates);

    return {
      success: true,
      updated: totalUpdated,
      ordersProcessed,
      message: `Przebudowano katalog: ${totalUpdated} pozycji z ${ordersProcessed} zamówień`
    };
  } catch (error) {
    console.error('Błąd podczas przebudowy katalogu dostawcy:', error);
    throw new Error(`Nie udało się przebudować katalogu: ${error.message}`);
  }
};

/**
 * Przebudowuje katalogi wszystkich dostawców na podstawie historycznych PO
 * @returns {Promise<Object>} - Wynik operacji
 */
export const rebuildAllSupplierCatalogs = async () => {
  try {
    // 1. Zachowaj dane certyfikatów przed usunięciem (mapa: supplierId+inventoryItemId → certData)
    const allExisting = await getDocs(collection(db, SUPPLIER_PRODUCTS_COLLECTION));
    const globalCertMap = new Map();
    allExisting.docs.forEach((docSnap) => {
      const data = docSnap.data();
      const hasAnyCertData = data.certificateUnit || data.certificateNumber ||
        data.certificateValidFrom || data.certificateValidTo || data.certificateType ||
        data.certificateFileUrl || data.certificateStoragePath;
      if (hasAnyCertData && data.supplierId && data.inventoryItemId) {
        const key = `${data.supplierId}__${data.inventoryItemId}`;
        globalCertMap.set(key, {
          certificateUnit: data.certificateUnit || '',
          certificateNumber: data.certificateNumber || '',
          certificateType: data.certificateType || '',
          certificateValidFrom: data.certificateValidFrom || null,
          certificateValidTo: data.certificateValidTo || null,
          certificateFileName: data.certificateFileName || '',
          certificateContentType: data.certificateContentType || '',
          certificateStoragePath: data.certificateStoragePath || '',
          certificateFileUrl: data.certificateFileUrl || '',
          certificateUploadedAt: data.certificateUploadedAt || null
        });
      }
    });

    // 2. Usuń wszystkie istniejące rekordy w supplierProducts
    if (!allExisting.empty) {
      // Usuwamy w batchach po max 500
      const batchSize = 500;
      const docs = allExisting.docs;
      for (let i = 0; i < docs.length; i += batchSize) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + batchSize);
        chunk.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });
        await batch.commit();
      }
    }

    // 3. Pobierz wszystkie PO (nie-draft)
    const poSnapshot = await getDocs(collection(db, PURCHASE_ORDERS_COLLECTION));

    let totalUpdated = 0;
    let ordersProcessed = 0;
    const supplierIds = new Set();

    for (const poDoc of poSnapshot.docs) {
      const poData = poDoc.data();

      // Pomijamy szkice
      if (poData.status === 'draft' || !poData.supplierId) {
        continue;
      }

      if (!poData.items || poData.items.length === 0) {
        continue;
      }

      supplierIds.add(poData.supplierId);

      const poInfo = {
        id: poDoc.id,
        number: poData.number,
        orderDate: poData.orderDate?.toDate?.() || poData.orderDate,
        currency: poData.currency
      };

      for (const item of poData.items) {
        try {
          const result = await upsertSupplierProduct(poData.supplierId, item, poInfo);
          if (result) {
            totalUpdated++;
          }
        } catch (error) {
          console.warn(`Pomijam pozycję ${item.name}: ${error.message}`);
        }
      }

      ordersProcessed++;
    }

    // 4. Przywróć dane certyfikatów do nowo utworzonych rekordów
    if (globalCertMap.size > 0) {
      const allNewDocs = await getDocs(collection(db, SUPPLIER_PRODUCTS_COLLECTION));
      const restoreBatchSize = 500;
      let restoreBatch = writeBatch(db);
      let restoreCount = 0;

      for (const docSnap of allNewDocs.docs) {
        const data = docSnap.data();
        const key = `${data.supplierId}__${data.inventoryItemId}`;
        const certData = globalCertMap.get(key);
        if (certData) {
          restoreBatch.update(docSnap.ref, certData);
          restoreCount++;
          if (restoreCount % restoreBatchSize === 0) {
            await restoreBatch.commit();
            restoreBatch = writeBatch(db);
          }
        }
      }
      if (restoreCount % restoreBatchSize !== 0) {
        await restoreBatch.commit();
      }
    }

    return {
      success: true,
      updated: totalUpdated,
      ordersProcessed,
      suppliersProcessed: supplierIds.size,
      message: `Przebudowano katalogi: ${totalUpdated} pozycji z ${ordersProcessed} zamówień dla ${supplierIds.size} dostawców`
    };
  } catch (error) {
    console.error('Błąd podczas przebudowy katalogów:', error);
    throw new Error(`Nie udało się przebudować katalogów: ${error.message}`);
  }
};
