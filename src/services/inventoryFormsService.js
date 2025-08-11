import { 
  collection, 
  getDocs, 
  query, 
  orderBy, 
  where, 
  limit, 
  startAfter, 
  Timestamp,
  doc,
  deleteDoc 
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from './firebase/config';

// Kolekcje formularzy magazynowych
export const INVENTORY_FORMS_COLLECTIONS = {
  LOADING_REPORT: 'Forms/ZaladunekTowaru/Odpowiedzi',
  UNLOADING_REPORT: 'Forms/RozladunekTowaru/Odpowiedzi'
};

// Typy formularzy magazynowych
export const INVENTORY_FORM_TYPES = {
  LOADING_REPORT: 'loadingReport',
  UNLOADING_REPORT: 'unloadingReport'
};

/**
 * Pobiera odpowiedzi formularzy magazynowych z paginacją
 * @param {string} formType - Typ formularza (LOADING_REPORT, UNLOADING_REPORT)
 * @param {number} page - Numer strony (1-based)
 * @param {number} itemsPerPage - Liczba elementów na stronę
 * @param {Object} filters - Filtry (opcjonalne)
 * @returns {Object} - { data, totalCount, hasMore, totalPages }
 */
export const getInventoryFormResponsesWithPagination = async (
  formType, 
  page = 1, 
  itemsPerPage = 10, 
  filters = {}
) => {
  try {
    const pageNum = Math.max(1, page);
    const limit_val = Math.max(1, itemsPerPage);
    
    // Wybierz odpowiednią kolekcję
    let collectionPath;
    switch (formType) {
      case INVENTORY_FORM_TYPES.LOADING_REPORT:
        collectionPath = INVENTORY_FORMS_COLLECTIONS.LOADING_REPORT;
        break;
      case INVENTORY_FORM_TYPES.UNLOADING_REPORT:
        collectionPath = INVENTORY_FORMS_COLLECTIONS.UNLOADING_REPORT;
        break;
      default:
        throw new Error(`Nieznany typ formularza magazynowego: ${formType}`);
    }

    // Buduj warunki filtrowania
    const conditions = [];
    
    // Filtr po dacie wypełnienia
    const dateField = 'fillDate';
    
    if (filters.fromDate) {
      const fromTimestamp = Timestamp.fromDate(new Date(filters.fromDate));
      conditions.push(where(dateField, '>=', fromTimestamp));
    }
    
    if (filters.toDate) {
      const toTimestamp = Timestamp.fromDate(new Date(filters.toDate));
      conditions.push(where(dateField, '<=', toTimestamp));
    }

    // Filtr po autorze/email
    if (filters.author && filters.author.trim()) {
      conditions.push(where('email', '==', filters.author.trim()));
    }

    // Filtr po numerze CMR (dla załadunku)
    if (filters.cmrNumber && filters.cmrNumber.trim() && formType === INVENTORY_FORM_TYPES.LOADING_REPORT) {
      conditions.push(where('cmrNumber', '==', filters.cmrNumber.trim()));
    }

    // Filtr po numerze PO (dla rozładunku)
    if (filters.poNumber && filters.poNumber.trim() && formType === INVENTORY_FORM_TYPES.UNLOADING_REPORT) {
      conditions.push(where('poNumber', '==', filters.poNumber.trim()));
    }

    // Filtr po przewoźniku
    if (filters.carrierName && filters.carrierName.trim()) {
      conditions.push(where('carrierName', '==', filters.carrierName.trim()));
    }

    // Utwórz zapytanie bazowe - sortuj od najnowszych (desc)
    let baseQuery;
    if (conditions.length > 0) {
      baseQuery = query(
        collection(db, collectionPath),
        ...conditions,
        orderBy(dateField, 'desc')
      );
    } else {
      baseQuery = query(
        collection(db, collectionPath),
        orderBy(dateField, 'desc')
      );
    }

    console.log(`🔄 Pobieranie formularzy magazynowych typu: ${formType}, strona: ${pageNum}, limit: ${limit_val}`);

    // Pobierz wszystkie dokumenty dla policzenia totalCount
    const totalSnapshot = await getDocs(baseQuery);
    const totalCount = totalSnapshot.size;
    
    // Oblicz totalPages
    const totalPages = Math.ceil(totalCount / limit_val);
    
    // Pobierz dokumenty dla aktualnej strony
    let paginatedQuery;
    const offset = (pageNum - 1) * limit_val;
    
    if (offset > 0) {
      // Dla stron innych niż pierwsza, użyj startAfter
      const allDocs = totalSnapshot.docs;
      if (offset < allDocs.length) {
        const lastVisibleDoc = allDocs[offset - 1];
        
        paginatedQuery = query(
          baseQuery,
          startAfter(lastVisibleDoc),
          limit(limit_val)
        );
      } else {
        // Offset większy niż liczba dokumentów - zwróć pustą tablicę
        return {
          data: [],
          totalCount,
          totalPages,
          currentPage: pageNum,
          itemsPerPage: limit_val,
          hasMore: false
        };
      }
    } else {
      // Dla pierwszej strony
      paginatedQuery = query(
        baseQuery,
        limit(limit_val)
      );
    }
    
    const paginatedSnapshot = await getDocs(paginatedQuery);
    
    const data = paginatedSnapshot.docs.map(doc => {
      const docData = doc.data();
      return {
        id: doc.id,
        ...docData,
        // Konwertuj Timestamp na Date dla łatwiejszego wyświetlania
        fillDate: docData.fillDate?.toDate?.() || null,
        loadingDate: docData.loadingDate?.toDate?.() || null,
        unloadingDate: docData.unloadingDate?.toDate?.() || null,
        createdAt: docData.createdAt?.toDate?.() || null,
        updatedAt: docData.updatedAt?.toDate?.() || null,
        // Obsługa selectedItems z konwersją dat ważności (dla rozładunku)
        selectedItems: docData.selectedItems?.map(item => ({
          ...item,
          expiryDate: item.expiryDate?.toDate ? item.expiryDate.toDate() : item.expiryDate
        })) || []
      };
    });

    const hasMore = page < totalPages;

    console.log(`✅ Pobrano ${data.length} formularzy z ${totalCount} ogółem (strona ${pageNum}/${totalPages})`);

    return {
      data,
      totalCount,
      totalPages,
      currentPage: pageNum,
      itemsPerPage: limit_val,
      hasMore
    };

  } catch (error) {
    console.error('Błąd podczas pobierania odpowiedzi formularzy magazynowych:', error);
    throw error;
  }
};

/**
 * Usuwa odpowiedź formularza magazynowego wraz z załącznikami
 * @param {string} formType - Typ formularza
 * @param {string} responseId - ID odpowiedzi do usunięcia
 * @param {Object} responseData - Dane odpowiedzi zawierające informacje o załącznikach
 */
export const deleteInventoryFormResponse = async (formType, responseId, responseData) => {
  try {
    let collectionPath;
    switch (formType) {
      case INVENTORY_FORM_TYPES.LOADING_REPORT:
        collectionPath = INVENTORY_FORMS_COLLECTIONS.LOADING_REPORT;
        break;
      case INVENTORY_FORM_TYPES.UNLOADING_REPORT:
        collectionPath = INVENTORY_FORMS_COLLECTIONS.UNLOADING_REPORT;
        break;
      default:
        throw new Error(`Nieznany typ formularza magazynowego: ${formType}`);
    }

    // Usuń załączniki z Firebase Storage jeśli istnieją (głównie dla raportów rozładunku)
    if (responseData.documentsUrl && formType === INVENTORY_FORM_TYPES.UNLOADING_REPORT) {
      try {
        const storagePath = extractStoragePathFromUrl(responseData.documentsUrl);
        if (storagePath) {
          const fileRef = ref(storage, storagePath);
          await deleteObject(fileRef);
          console.log(`Usunięto załącznik z Storage: ${storagePath}`);
        }
      } catch (storageError) {
        console.warn('Nie można usunąć załącznika z Storage:', storageError);
        // Kontynuuj mimo błędu usuwania załącznika
      }
    }

    // Usuń dokument z Firestore
    const docRef = doc(db, collectionPath, responseId);
    await deleteDoc(docRef);
    
    console.log(`✅ Usunięto odpowiedź formularza magazynowego: ${responseId}`);

  } catch (error) {
    console.error('Błąd podczas usuwania odpowiedzi formularza magazynowego:', error);
    throw error;
  }
};

/**
 * Funkcja do wyodrębniania ścieżki pliku z URL Firebase Storage
 * @param {string} url - URL pliku w Firebase Storage
 * @returns {string|null} - Ścieżka pliku lub null
 */
export const extractStoragePathFromUrl = (url) => {
  if (!url || !url.includes('firebase')) return null;
  
  try {
    // Format URL: https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{encodedPath}?alt=media
    const pathStart = url.indexOf('/o/') + 3;
    const pathEnd = url.indexOf('?');
    
    if (pathStart > 2 && pathEnd > pathStart) {
      const encodedPath = url.substring(pathStart, pathEnd);
      return decodeURIComponent(encodedPath);
    }
    return null;
  } catch (error) {
    console.error('Błąd podczas wyodrębniania ścieżki z URL:', error);
    return null;
  }
};

/**
 * Pobiera statystyki formularzy magazynowych
 * @returns {Object} - Statystyki formularzy
 */
export const getInventoryFormsStatistics = async () => {
  try {
    const [loadingSnapshot, unloadingSnapshot] = await Promise.all([
      getDocs(collection(db, INVENTORY_FORMS_COLLECTIONS.LOADING_REPORT)),
      getDocs(collection(db, INVENTORY_FORMS_COLLECTIONS.UNLOADING_REPORT))
    ]);

    return {
      loadingReports: loadingSnapshot.size,
      unloadingReports: unloadingSnapshot.size,
      total: loadingSnapshot.size + unloadingSnapshot.size
    };

  } catch (error) {
    console.error('Błąd podczas pobierania statystyk formularzy magazynowych:', error);
    throw error;
  }
};

/**
 * Wyszukuje formularze magazynowe po tekście
 * @param {string} searchTerm - Szukany tekst
 * @param {string} formType - Typ formularza (opcjonalny)
 * @param {number} limit - Limit wyników (domyślnie 50)
 * @returns {Array} - Znalezione formularze
 */
export const searchInventoryForms = async (searchTerm, formType = null, limit = 50) => {
  try {
    if (!searchTerm || searchTerm.trim() === '') {
      return [];
    }

    const searchTermLower = searchTerm.toLowerCase().trim();
    const results = [];

    // Określ które kolekcje przeszukiwać
    const collectionsToSearch = formType 
      ? [formType === INVENTORY_FORM_TYPES.LOADING_REPORT ? INVENTORY_FORMS_COLLECTIONS.LOADING_REPORT : INVENTORY_FORMS_COLLECTIONS.UNLOADING_REPORT]
      : [INVENTORY_FORMS_COLLECTIONS.LOADING_REPORT, INVENTORY_FORMS_COLLECTIONS.UNLOADING_REPORT];

    for (const collectionPath of collectionsToSearch) {
      const q = query(
        collection(db, collectionPath),
        orderBy('fillDate', 'desc'),
        limit(limit)
      );

      const snapshot = await getDocs(q);
      
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const searchableText = [
          data.email,
          data.employeeName,
          data.cmrNumber,
          data.poNumber,
          data.carrierName,
          data.vehicleRegistration,
          data.clientName,
          data.supplierName,
          data.orderNumber,
          data.palletProductName,
          data.goodsDescription,
          data.notes,
          data.goodsNotes
        ].filter(Boolean).join(' ').toLowerCase();

        if (searchableText.includes(searchTermLower)) {
          results.push({
            id: doc.id,
            ...data,
            fillDate: data.fillDate?.toDate?.() || null,
            loadingDate: data.loadingDate?.toDate?.() || null,
            unloadingDate: data.unloadingDate?.toDate?.() || null,
            formType: collectionPath.includes('Zaladunki') ? INVENTORY_FORM_TYPES.LOADING_REPORT : INVENTORY_FORM_TYPES.UNLOADING_REPORT,
            selectedItems: data.selectedItems?.map(item => ({
              ...item,
              expiryDate: item.expiryDate?.toDate ? item.expiryDate.toDate() : item.expiryDate
            })) || []
          });
        }
      });
    }

    // Sortuj wyniki po dacie wypełnienia (najnowsze pierwsze)
    results.sort((a, b) => {
      const dateA = a.fillDate || new Date(0);
      const dateB = b.fillDate || new Date(0);
      return dateB - dateA;
    });

    return results.slice(0, limit);

  } catch (error) {
    console.error('Błąd podczas wyszukiwania formularzy magazynowych:', error);
    throw error;
  }
};
