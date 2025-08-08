import { 
  collection, 
  doc, 
  getDocs, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  limit,
  startAfter,
  Timestamp
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from './firebase/config';

// Kolekcje formularzy produkcyjnych
export const PRODUCTION_FORMS_COLLECTIONS = {
  COMPLETED_MO: 'Forms/SkonczoneMO/Odpowiedzi',
  PRODUCTION_CONTROL: 'Forms/KontrolaProdukcji/Odpowiedzi', 
  PRODUCTION_SHIFT: 'Forms/ZmianaProdukcji/Odpowiedzi'
};

// Typy formularzy
export const FORM_TYPES = {
  COMPLETED_MO: 'completedMO',
  PRODUCTION_CONTROL: 'productionControl',
  PRODUCTION_SHIFT: 'productionShift'
};

/**
 * Pobiera odpowiedzi formularzy produkcyjnych z paginacją
 * @param {string} formType - Typ formularza (COMPLETED_MO, PRODUCTION_CONTROL, PRODUCTION_SHIFT)
 * @param {number} page - Numer strony (1-based)
 * @param {number} itemsPerPage - Liczba elementów na stronę
 * @param {Object} filters - Filtry (opcjonalne)
 * @returns {Object} - { data, totalCount, hasMore, totalPages }
 */
export const getFormResponsesWithPagination = async (
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
      case FORM_TYPES.COMPLETED_MO:
        collectionPath = PRODUCTION_FORMS_COLLECTIONS.COMPLETED_MO;
        break;
      case FORM_TYPES.PRODUCTION_CONTROL:
        collectionPath = PRODUCTION_FORMS_COLLECTIONS.PRODUCTION_CONTROL;
        break;
      case FORM_TYPES.PRODUCTION_SHIFT:
        collectionPath = PRODUCTION_FORMS_COLLECTIONS.PRODUCTION_SHIFT;
        break;
      default:
        throw new Error(`Nieznany typ formularza: ${formType}`);
    }

    // Buduj warunki filtrowania
    const conditions = [];
    
    // Filtr po dacie utworzenia - różne pola dla różnych formularzy
    let dateField = 'createdAt';
    if (formType === FORM_TYPES.COMPLETED_MO) {
      dateField = 'date';
    } else if (formType === FORM_TYPES.PRODUCTION_CONTROL || formType === FORM_TYPES.PRODUCTION_SHIFT) {
      dateField = 'fillDate';
    }
    
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

    // Filtr po numerze zadania/MO
    if (filters.taskNumber && filters.taskNumber.trim()) {
      conditions.push(where('moNumber', '==', filters.taskNumber.trim()));
    }

    // Utwórz zapytanie bazowe - sortuj od najnowszych (desc)
    let baseQuery;
    if (conditions.length > 0) {
      // Gdy filtrujemy po dacie, musimy sortować po tym samym polu
      if (conditions.some(cond => cond._field?.fieldPath === dateField)) {
        baseQuery = query(
          collection(db, collectionPath),
          ...conditions,
          orderBy(dateField, 'desc')
        );
      } else {
        baseQuery = query(
          collection(db, collectionPath),
          ...conditions,
          orderBy(dateField, 'desc')
        );
      }
    } else {
      baseQuery = query(
        collection(db, collectionPath),
        orderBy(dateField, 'desc')
      );
    }

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
    
    const data = paginatedSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      // Konwertuj Timestamp na Date dla łatwiejszego wyświetlania
      date: doc.data().date?.toDate?.() || null,
      fillDate: doc.data().fillDate?.toDate?.() || null,
      createdAt: doc.data().createdAt?.toDate?.() || null,
      updatedAt: doc.data().updatedAt?.toDate?.() || null,
      productionStartDate: doc.data().productionStartDate?.toDate?.() || null,
      productionEndDate: doc.data().productionEndDate?.toDate?.() || null,
      readingDate: doc.data().readingDate?.toDate?.() || null
    }));

    const hasMore = page < totalPages;

    return {
      data,
      totalCount,
      totalPages,
      currentPage: pageNum,
      itemsPerPage: limit_val,
      hasMore
    };

  } catch (error) {
    console.error('Błąd podczas pobierania odpowiedzi formularzy:', error);
    throw error;
  }
};

/**
 * Usuwa odpowiedź formularza wraz z załącznikami
 * @param {string} formType - Typ formularza
 * @param {string} responseId - ID odpowiedzi do usunięcia
 * @param {Array} attachments - Lista załączników do usunięcia
 */
export const deleteFormResponse = async (formType, responseId, attachments = []) => {
  try {
    // Wybierz odpowiednią kolekcję
    let collectionPath;
    switch (formType) {
      case FORM_TYPES.COMPLETED_MO:
        collectionPath = PRODUCTION_FORMS_COLLECTIONS.COMPLETED_MO;
        break;
      case FORM_TYPES.PRODUCTION_CONTROL:
        collectionPath = PRODUCTION_FORMS_COLLECTIONS.PRODUCTION_CONTROL;
        break;
      case FORM_TYPES.PRODUCTION_SHIFT:
        collectionPath = PRODUCTION_FORMS_COLLECTIONS.PRODUCTION_SHIFT;
        break;
      default:
        throw new Error(`Nieznany typ formularza: ${formType}`);
    }

    // Usuń załączniki z Storage
    if (attachments && attachments.length > 0) {
      const deletePromises = attachments.map(async (attachment) => {
        if (attachment.url) {
          try {
            const storageRef = ref(storage, attachment.url);
            await deleteObject(storageRef);
          } catch (storageError) {
            console.warn('Nie udało się usunąć załącznika:', attachment.url, storageError);
          }
        }
      });
      await Promise.all(deletePromises);
    }

    // Usuń dokument z Firestore
    await deleteDoc(doc(db, collectionPath, responseId));
    
    console.log(`Usunięto odpowiedź formularza: ${responseId}`);
    
  } catch (error) {
    console.error('Błąd podczas usuwania odpowiedzi formularza:', error);
    throw error;
  }
};

/**
 * Pobiera statystyki formularzy produkcyjnych
 * @param {string} formType - Typ formularza (opcjonalny)
 * @returns {Object} - Statystyki
 */
export const getFormResponsesStats = async (formType = null) => {
  try {
    const stats = {};
    
    const formsToCheck = formType ? [formType] : Object.values(FORM_TYPES);
    
    for (const type of formsToCheck) {
      let collectionPath;
      switch (type) {
        case FORM_TYPES.COMPLETED_MO:
          collectionPath = PRODUCTION_FORMS_COLLECTIONS.COMPLETED_MO;
          break;
        case FORM_TYPES.PRODUCTION_CONTROL:
          collectionPath = PRODUCTION_FORMS_COLLECTIONS.PRODUCTION_CONTROL;
          break;
        case FORM_TYPES.PRODUCTION_SHIFT:
          collectionPath = PRODUCTION_FORMS_COLLECTIONS.PRODUCTION_SHIFT;
          break;
        default:
          continue;
      }
      
      const snapshot = await getDocs(collection(db, collectionPath));
      stats[type] = {
        total: snapshot.size,
        collection: collectionPath
      };
    }
    
    return stats;
    
  } catch (error) {
    console.error('Błąd podczas pobierania statystyk formularzy:', error);
    throw error;
  }
};