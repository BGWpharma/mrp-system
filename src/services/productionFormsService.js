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
  Timestamp,
  getCountFromServer
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
 * ✅ ZOPTYMALIZOWANA: Pobiera odpowiedzi formularzy produkcyjnych z prawdziwą paginacją
 * @param {string} formType - Typ formularza (COMPLETED_MO, PRODUCTION_CONTROL, PRODUCTION_SHIFT)
 * @param {number} page - Numer strony (1-based)
 * @param {number} itemsPerPage - Liczba elementów na stronę
 * @param {Object} filters - Filtry (opcjonalne)
 * @param {Object} lastVisible - Kursor z poprzedniej strony
 * @returns {Object} - { data, totalCount, hasMore, totalPages, lastVisible }
 */
export const getFormResponsesWithPagination = async (
  formType, 
  page = 1, 
  itemsPerPage = 10, 
  filters = {},
  lastVisible = null
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

    // ✅ OPTYMALIZACJA 1: Utwórz zapytanie bazowe do liczenia
    let countQuery;
    if (conditions.length > 0) {
      countQuery = query(
        collection(db, collectionPath),
        ...conditions
      );
    } else {
      countQuery = query(collection(db, collectionPath));
    }

    // ✅ OPTYMALIZACJA 2: Policz dokumenty BEZ pobierania danych
    const countSnapshot = await getCountFromServer(countQuery);
    const totalCount = countSnapshot.data().count;
    const totalPages = Math.ceil(totalCount / limit_val);

    // ✅ OPTYMALIZACJA 3: Utwórz zapytanie z sortowaniem i kursorem
    let dataQuery;
    if (conditions.length > 0) {
      // Gdy filtrujemy po dacie, musimy sortować po tym samym polu
      if (conditions.some(cond => cond._field?.fieldPath === dateField)) {
        dataQuery = query(
          collection(db, collectionPath),
          ...conditions,
          orderBy(dateField, 'desc')
        );
      } else {
        dataQuery = query(
          collection(db, collectionPath),
          ...conditions,
          orderBy(dateField, 'desc')
        );
      }
    } else {
      dataQuery = query(
        collection(db, collectionPath),
        orderBy(dateField, 'desc')
      );
    }

    // ✅ OPTYMALIZACJA 4: Zastosuj kursor dla paginacji
    if (lastVisible) {
      dataQuery = query(dataQuery, startAfter(lastVisible));
    }
    
    // Dodaj limit
    dataQuery = query(dataQuery, limit(limit_val));
    
    // ✅ OPTYMALIZACJA 5: Pobierz TYLKO potrzebne dokumenty
    const paginatedSnapshot = await getDocs(dataQuery);
    
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

    // ✅ OPTYMALIZACJA 6: Przygotuj kursor do następnej strony
    const newLastVisible = paginatedSnapshot.docs.length > 0 
      ? paginatedSnapshot.docs[paginatedSnapshot.docs.length - 1] 
      : null;

    const hasMore = paginatedSnapshot.docs.length === limit_val && newLastVisible !== null;

    console.log(`✅ ZOPTYMALIZOWANE: Pobrano ${data.length} z ${totalCount} rekordów (strona ${pageNum}/${totalPages})`);

    return {
      data,
      totalCount,
      totalPages,
      currentPage: pageNum,
      itemsPerPage: limit_val,
      hasMore,
      lastVisible: newLastVisible
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
      
      // ✅ OPTYMALIZACJA: Użyj getCountFromServer zamiast pobierania wszystkich dokumentów
      const countSnapshot = await getCountFromServer(collection(db, collectionPath));
      stats[type] = {
        total: countSnapshot.data().count,
        collection: collectionPath
      };
    }
    
    return stats;
    
  } catch (error) {
    console.error('Błąd podczas pobierania statystyk formularzy:', error);
    throw error;
  }
};