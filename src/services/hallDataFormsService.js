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
  deleteDoc,
  getCountFromServer
} from 'firebase/firestore';
import { db } from './firebase/config';

// Kolekcje formularzy parametrów hali
export const HALL_DATA_FORMS_COLLECTIONS = {
  SERVICE_REPORT: 'Forms/TygodniowyRaportSerwisu/Odpowiedzi',
  MONTHLY_SERVICE_REPORT: 'Forms/MiesiecznyRaportSerwisu/Odpowiedzi',
  DEFECT_REGISTRY: 'Forms/RejestrUsterek/Odpowiedzi',
  SERVICE_REPAIR_REPORT: 'Forms/RaportSerwisNapraw/Odpowiedzi'
};

// Typy formularzy
export const HALL_DATA_FORM_TYPES = {
  SERVICE_REPORT: 'serviceReport',
  MONTHLY_SERVICE_REPORT: 'monthlyServiceReport',
  DEFECT_REGISTRY: 'defectRegistry',
  SERVICE_REPAIR_REPORT: 'serviceRepairReport'
};

/**
 * Pobiera odpowiedzi formularzy parametrów hali z paginacją
 * @param {string} formType - Typ formularza (SERVICE_REPORT, ENVIRONMENTAL_REPORT, MACHINE_REPORT)
 * @param {number} page - Numer strony (1-based)
 * @param {number} itemsPerPage - Liczba elementów na stronę
 * @param {Object} filters - Filtry (opcjonalne)
 * @param {Object} lastVisible - Kursor z poprzedniej strony
 * @returns {Object} - { data, totalCount, hasMore, totalPages, lastVisible }
 */
export const getHallDataFormResponsesWithPagination = async (
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
      case HALL_DATA_FORM_TYPES.SERVICE_REPORT:
        collectionPath = HALL_DATA_FORMS_COLLECTIONS.SERVICE_REPORT;
        break;
      case HALL_DATA_FORM_TYPES.MONTHLY_SERVICE_REPORT:
        collectionPath = HALL_DATA_FORMS_COLLECTIONS.MONTHLY_SERVICE_REPORT;
        break;
      case HALL_DATA_FORM_TYPES.DEFECT_REGISTRY:
        collectionPath = HALL_DATA_FORMS_COLLECTIONS.DEFECT_REGISTRY;
        break;
      case HALL_DATA_FORM_TYPES.SERVICE_REPAIR_REPORT:
        collectionPath = HALL_DATA_FORMS_COLLECTIONS.SERVICE_REPAIR_REPORT;
        break;
      default:
        throw new Error(`Nieznany typ formularza parametrów hali: ${formType}`);
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

    // Zapytanie z paginacją
    let q = query(
      collection(db, collectionPath),
      ...conditions,
      orderBy('createdAt', 'desc'),
      limit(limit_val)
    );
    
    // Jeśli mamy kursor, użyj go do paginacji
    if (lastVisible) {
      q = query(
        collection(db, collectionPath),
        ...conditions,
        orderBy('createdAt', 'desc'),
        startAfter(lastVisible),
        limit(limit_val)
      );
    }
    
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // Pobierz całkowitą liczbę dokumentów
    const countQuery = query(collection(db, collectionPath), ...conditions);
    const countSnapshot = await getCountFromServer(countQuery);
    const totalCount = countSnapshot.data().count;
    
    const totalPages = Math.ceil(totalCount / limit_val);
    const hasMore = snapshot.docs.length === limit_val && page < totalPages;
    const lastDoc = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;
    
    return {
      data,
      totalCount,
      hasMore,
      totalPages,
      lastVisible: lastDoc
    };
  } catch (error) {
    console.error('Błąd podczas pobierania odpowiedzi formularzy parametrów hali:', error);
    throw error;
  }
};

/**
 * Pobiera liczbę odpowiedzi dla wszystkich typów formularzy parametrów hali
 * Używa getCountFromServer dla optymalnego pobierania tylko liczby dokumentów
 * @returns {Object} - { serviceReport, monthlyServiceReport, defectRegistry, serviceRepairReport }
 */
export const getAllHallDataFormsCounts = async () => {
  try {
    const [serviceCount, monthlyCount, defectCount, repairCount] = await Promise.all([
      getCountFromServer(query(collection(db, HALL_DATA_FORMS_COLLECTIONS.SERVICE_REPORT))),
      getCountFromServer(query(collection(db, HALL_DATA_FORMS_COLLECTIONS.MONTHLY_SERVICE_REPORT))),
      getCountFromServer(query(collection(db, HALL_DATA_FORMS_COLLECTIONS.DEFECT_REGISTRY))),
      getCountFromServer(query(collection(db, HALL_DATA_FORMS_COLLECTIONS.SERVICE_REPAIR_REPORT)))
    ]);
    
    return {
      serviceReport: serviceCount.data().count,
      monthlyServiceReport: monthlyCount.data().count,
      defectRegistry: defectCount.data().count,
      serviceRepairReport: repairCount.data().count
    };
  } catch (error) {
    console.error('Błąd podczas pobierania liczby odpowiedzi formularzy:', error);
    return {
      serviceReport: 0,
      monthlyServiceReport: 0,
      defectRegistry: 0,
      serviceRepairReport: 0
    };
  }
};

/**
 * Usuwa odpowiedź formularza parametrów hali
 * @param {string} formType - Typ formularza
 * @param {string} responseId - ID odpowiedzi do usunięcia
 */
export const deleteHallDataFormResponse = async (formType, responseId) => {
  try {
    let collectionPath;
    switch (formType) {
      case HALL_DATA_FORM_TYPES.SERVICE_REPORT:
        collectionPath = HALL_DATA_FORMS_COLLECTIONS.SERVICE_REPORT;
        break;
      case HALL_DATA_FORM_TYPES.MONTHLY_SERVICE_REPORT:
        collectionPath = HALL_DATA_FORMS_COLLECTIONS.MONTHLY_SERVICE_REPORT;
        break;
      case HALL_DATA_FORM_TYPES.DEFECT_REGISTRY:
        collectionPath = HALL_DATA_FORMS_COLLECTIONS.DEFECT_REGISTRY;
        break;
      case HALL_DATA_FORM_TYPES.SERVICE_REPAIR_REPORT:
        collectionPath = HALL_DATA_FORMS_COLLECTIONS.SERVICE_REPAIR_REPORT;
        break;
      default:
        throw new Error(`Nieznany typ formularza parametrów hali: ${formType}`);
    }

    const docRef = doc(db, collectionPath, responseId);
    await deleteDoc(docRef);
    console.log(`Usunięto odpowiedź formularza parametrów hali: ${responseId}`);
  } catch (error) {
    console.error('Błąd podczas usuwania odpowiedzi formularza:', error);
    throw error;
  }
};

