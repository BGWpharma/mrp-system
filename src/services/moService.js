import { 
  collection, 
  getDocs, 
  query, 
  orderBy,
  where
} from 'firebase/firestore';
import { db } from './firebase/config';

const PRODUCTION_TASKS_COLLECTION = 'productionTasks';

/**
 * Pobiera wszystkie numery MO z zadań produkcyjnych
 * @returns {Promise<Array>} Lista numerów MO wraz z podstawowymi danymi
 */
export const getAllMONumbers = async () => {
  try {
    const tasksRef = collection(db, PRODUCTION_TASKS_COLLECTION);
    const q = query(
      tasksRef,
      where('moNumber', '!=', ''),
      orderBy('moNumber', 'desc')
    );
    
    const querySnapshot = await getDocs(q);
    
    // Mapuj dokumenty na obiekt zawierający tylko potrzebne dane
    return querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        moNumber: data.moNumber,
        productName: data.productName || data.name || '',
        scheduledDate: data.scheduledDate,
        quantity: data.quantity,
        status: data.status
      };
    });
  } catch (error) {
    console.error('Błąd podczas pobierania numerów MO:', error);
    throw error;
  }
};

/**
 * Pobiera numery MO w formacie odpowiednim dla pola wyboru (Select)
 * @returns {Promise<Array>} Lista opcji dla komponentu Select
 */
export const getMONumbersForSelect = async () => {
  try {
    const moNumbers = await getAllMONumbers();
    
    return moNumbers.map(mo => ({
      value: mo.moNumber,
      label: `${mo.moNumber} - ${mo.productName} (${mo.quantity} szt.)`
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania numerów MO dla pola wyboru:', error);
    return [];
  }
}; 