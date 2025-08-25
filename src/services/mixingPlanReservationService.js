/**
 * Serwis do zarządzania powiązaniami składników planu mieszań z rezerwacjami
 */

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
const INGREDIENT_LINKS_COLLECTION = 'ingredientReservationLinks';

/**
 * Pobiera standardowe rezerwacje magazynowe dla zadania
 * @param {string} taskId - ID zadania produkcyjnego
 * @returns {Promise<Array>} - Lista standardowych rezerwacji
 */
export const getStandardReservationsForTask = async (taskId) => {
  try {
    console.log('=== getStandardReservationsForTask ===');
    console.log('TaskId:', taskId);
    
    // Pobierz zadanie produkcyjne
    const taskRef = doc(db, 'productionTasks', taskId);
    const taskDoc = await getDoc(taskRef);
    
    if (!taskDoc.exists()) {
      console.log('Zadanie nie istnieje');
      return [];
    }
    
    const task = taskDoc.data();
    console.log('Dane zadania:', task);
    console.log('MaterialBatches:', task.materialBatches);
    console.log('Materials:', task.materials);
    
    // Pobierz wszystkie powiązania składników z rezerwacjami dla tego zadania
    const ingredientLinks = await getIngredientReservationLinks(taskId);
    console.log('Powiązania składników:', ingredientLinks);
    
    // Oblicz łączną powiązaną ilość dla każdej rezerwacji
    const linkedQuantities = {};
    Object.values(ingredientLinks).forEach(link => {
      if (link.reservationId && link.quantity) {
        linkedQuantities[link.reservationId] = (linkedQuantities[link.reservationId] || 0) + parseFloat(link.quantity);
      }
    });
    
    console.log('Powiązane ilości na rezerwację:', linkedQuantities);
    
    const reservations = [];
    
    // Pobierz informacje o zarezerwowanych partiach z zadania
    if (task.materialBatches) {
      for (const [materialId, batches] of Object.entries(task.materialBatches)) {
        console.log(`Przetwarzam materiał ${materialId}, partie:`, batches);
        
        // Znajdź informacje o materiale
        const material = task.materials?.find(m => 
          (m.id === materialId || m.inventoryItemId === materialId)
        );
        
        console.log(`Znaleziony materiał dla ${materialId}:`, material);
        
        if (material && batches) {
          for (const batch of batches) {
            const reservationId = `${taskId}_${materialId}_${batch.batchId}`;
            const linkedQuantity = linkedQuantities[reservationId] || 0;
            const baseAvailableQuantity = batch.quantity - (batch.consumedQuantity || 0);
            const finalAvailableQuantity = baseAvailableQuantity - linkedQuantity;
            
            const reservation = {
              id: reservationId,
              taskId: taskId,
              materialId: materialId,
              materialName: material.name,
              batchId: batch.batchId,
              batchNumber: batch.batchNumber || batch.lotNumber || 'Brak numeru',
              reservedQuantity: batch.quantity,
              availableQuantity: Math.max(0, finalAvailableQuantity), // Nie może być ujemna
              linkedQuantity: linkedQuantity, // Dodaj info o powiązanej ilości
              unit: material.unit || 'szt.',
              type: 'standard'
            };
            
            console.log(`Rezerwacja ${reservationId}: bazowa dostępna=${baseAvailableQuantity}, powiązana=${linkedQuantity}, finalna dostępna=${finalAvailableQuantity}`);
            reservations.push(reservation);
          }
        }
      }
    } else {
      console.log('Brak materialBatches w zadaniu');
    }
    
    console.log('Finalne rezerwacje standardowe:', reservations);
    console.log('=====================================');
    
    return reservations;
  } catch (error) {
    console.error('Błąd podczas pobierania standardowych rezerwacji:', error);
    return [];
  }
};

/**
 * Pobiera powiązania składników z rezerwacjami dla zadania
 * @param {string} taskId - ID zadania produkcyjnego
 * @returns {Promise<Object>} - Obiekt mapujący ID składnika na powiązanie
 */
export const getIngredientReservationLinks = async (taskId) => {
  try {
    const q = query(
      collection(db, INGREDIENT_LINKS_COLLECTION),
      where('taskId', '==', taskId)
    );
    
    const snapshot = await getDocs(q);
    const links = {};
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      links[data.ingredientId] = {
        id: doc.id,
        ...data
      };
    });
    
    return links;
  } catch (error) {
    console.error('Błąd podczas pobierania powiązań składników:', error);
    return {};
  }
};

/**
 * Powiązuje składnik z rezerwacją
 * @param {string} taskId - ID zadania produkcyjnego
 * @param {string} ingredientId - ID składnika z planu mieszań
 * @param {string} reservationId - ID rezerwacji
 * @param {string} reservationType - Typ rezerwacji ('standard')
 * @param {number} quantity - Ilość do powiązania
 * @param {string} userId - ID użytkownika wykonującego operację
 * @returns {Promise<Object>} - Wynik operacji
 */
export const linkIngredientToReservation = async (
  taskId, 
  ingredientId, 
  reservationId, 
  reservationType, 
  quantity,
  userId
) => {
  try {
    // Sprawdź czy składnik nie jest już powiązany
    const existingQuery = query(
      collection(db, INGREDIENT_LINKS_COLLECTION),
      where('taskId', '==', taskId),
      where('ingredientId', '==', ingredientId)
    );
    
    const existingSnapshot = await getDocs(existingQuery);
    
    const linkData = {
      taskId: taskId,
      ingredientId: ingredientId,
      reservationId: reservationId,
      reservationType: reservationType,
      quantity: quantity, // Zapisz ilość powiązania
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    if (!existingSnapshot.empty) {
      // Aktualizuj istniejące powiązanie
      const existingDoc = existingSnapshot.docs[0];
      await updateDoc(doc(db, INGREDIENT_LINKS_COLLECTION, existingDoc.id), linkData);
    } else {
      // Utwórz nowe powiązanie
      await addDoc(collection(db, INGREDIENT_LINKS_COLLECTION), {
        ...linkData,
        createdAt: serverTimestamp(),
        createdBy: userId
      });
    }
    
    return {
      success: true,
      message: 'Składnik został powiązany z rezerwacją'
    };
  } catch (error) {
    console.error('Błąd podczas powiązania składnika z rezerwacją:', error);
    throw error;
  }
};

/**
 * Usuwa powiązanie składnika z rezerwacją
 * @param {string} taskId - ID zadania produkcyjnego
 * @param {string} ingredientId - ID składnika z planu mieszań
 * @param {string} userId - ID użytkownika wykonującego operację
 * @returns {Promise<Object>} - Wynik operacji
 */
export const unlinkIngredientFromReservation = async (taskId, ingredientId, userId) => {
  try {
    const q = query(
      collection(db, INGREDIENT_LINKS_COLLECTION),
      where('taskId', '==', taskId),
      where('ingredientId', '==', ingredientId)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      throw new Error('Nie znaleziono powiązania do usunięcia');
    }
    
    // Usuń wszystkie powiązania dla tego składnika (powinno być tylko jedno)
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    return {
      success: true,
      message: 'Powiązanie zostało usunięte'
    };
  } catch (error) {
    console.error('Błąd podczas usuwania powiązania składnika:', error);
    throw error;
  }
};

/**
 * Pobiera statystyki powiązań dla zadania
 * @param {string} taskId - ID zadania produkcyjnego
 * @returns {Promise<Object>} - Statystyki powiązań
 */
export const getIngredientLinkStats = async (taskId) => {
  try {
    // Pobierz zadanie, aby policzyć składniki
    const taskRef = doc(db, 'productionTasks', taskId);
    const taskDoc = await getDoc(taskRef);
    
    if (!taskDoc.exists()) {
      return { totalIngredients: 0, linkedIngredients: 0, linkagePercentage: 0 };
    }
    
    const task = taskDoc.data();
    const totalIngredients = task.mixingPlanChecklist
      ? task.mixingPlanChecklist.filter(item => item.type === 'ingredient').length
      : 0;
    
    // Pobierz liczbę powiązań
    const linksQuery = query(
      collection(db, INGREDIENT_LINKS_COLLECTION),
      where('taskId', '==', taskId)
    );
    
    const linksSnapshot = await getDocs(linksQuery);
    const linkedIngredients = linksSnapshot.size;
    
    const linkagePercentage = totalIngredients > 0 
      ? Math.round((linkedIngredients / totalIngredients) * 100)
      : 0;
    
    return {
      totalIngredients,
      linkedIngredients,
      linkagePercentage
    };
  } catch (error) {
    console.error('Błąd podczas pobierania statystyk powiązań:', error);
    return { totalIngredients: 0, linkedIngredients: 0, linkagePercentage: 0 };
  }
};

/**
 * Pobiera szczegółowy raport powiązań składników z rezerwacjami
 * @param {string} taskId - ID zadania produkcyjnego
 * @returns {Promise<Array>} - Lista szczegółowych informacji o powiązaniach
 */
export const getDetailedIngredientLinksReport = async (taskId) => {
  try {
    // Pobierz zadanie
    const taskRef = doc(db, 'productionTasks', taskId);
    const taskDoc = await getDoc(taskRef);
    
    if (!taskDoc.exists()) {
      return [];
    }
    
    const task = taskDoc.data();
    const ingredients = task.mixingPlanChecklist
      ? task.mixingPlanChecklist.filter(item => item.type === 'ingredient')
      : [];
    
    // Pobierz powiązania
    const links = await getIngredientReservationLinks(taskId);
    
    // Pobierz tylko standardowe rezerwacje
    const standardReservations = await getStandardReservationsForTask(taskId);
    
    const allReservations = standardReservations.map(res => ({ ...res, type: 'standard' }));
    
    // Przygotuj szczegółowy raport
    const report = ingredients.map(ingredient => {
      const link = links[ingredient.id];
      let reservationInfo = null;
      
      if (link) {
        reservationInfo = allReservations.find(res => res.id === link.reservationId);
      }
      
      return {
        ingredientId: ingredient.id,
        ingredientName: ingredient.text,
        ingredientDetails: ingredient.details,
        isLinked: !!link,
        reservationInfo: reservationInfo,
        linkInfo: link
      };
    });
    
    return report;
  } catch (error) {
    console.error('Błąd podczas generowania raportu powiązań:', error);
    return [];
  }
};


