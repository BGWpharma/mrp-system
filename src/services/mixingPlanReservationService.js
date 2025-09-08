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
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase/config';
import { getAllWarehouses } from './inventoryService';
import { preciseSubtract, preciseAdd, fixFloatingPointPrecision } from '../utils/mathUtils';
const INGREDIENT_LINKS_COLLECTION = 'ingredientReservationLinks';

// Funkcja pomocnicza do formatowania wartości liczbowych z precyzją
const formatQuantityPrecision = (value, precision = 3) => {
  if (typeof value !== 'number' || isNaN(value)) return 0;
  return Math.round(value * Math.pow(10, precision)) / Math.pow(10, precision);
};

/**
 * Pobiera snapshot informacji o rezerwacji do zapisania w powiązaniu
 * @param {string} taskId - ID zadania produkcyjnego
 * @param {string} reservationId - ID rezerwacji
 * @returns {Promise<Object>} - Snapshot informacji o partii
 */
const getReservationSnapshot = async (taskId, reservationId) => {
  try {
    // Pobierz zadanie produkcyjne
    const taskRef = doc(db, 'productionTasks', taskId);
    const taskDoc = await getDoc(taskRef);
    
    if (!taskDoc.exists()) {
      throw new Error('Zadanie nie istnieje');
    }
    
    const task = taskDoc.data();
    
    // Znajdź partię w materialBatches
    if (task.materialBatches) {
      for (const [materialId, batches] of Object.entries(task.materialBatches)) {
        for (const batch of batches) {
          const currentReservationId = `${taskId}_${materialId}_${batch.batchId}`;
          if (currentReservationId === reservationId) {
            // Znajdź materiał
            const material = task.materials?.find(m => 
              (m.id === materialId || m.inventoryItemId === materialId)
            );
            
            // Pobierz szczegóły partii z bazy
            let batchDetails = null;
            try {
              const batchRef = doc(db, 'inventoryBatches', batch.batchId);
              const batchDoc = await getDoc(batchRef);
              if (batchDoc.exists()) {
                batchDetails = batchDoc.data();
              }
            } catch (error) {
              console.warn(`Nie udało się pobrać szczegółów partii ${batch.batchId}:`, error);
            }
            
            // Pobierz informacje o magazynie
            const warehouses = await getAllWarehouses();
            const warehouseInfo = batchDetails?.warehouseId 
              ? warehouses.find(w => w.id === batchDetails.warehouseId)
              : null;
            
            // Przygotuj datę ważności
            let expiryDate = null;
            let expiryDateString = null;
            if (batchDetails?.expiryDate) {
              if (batchDetails.expiryDate instanceof Timestamp) {
                expiryDate = batchDetails.expiryDate.toDate();
              } else if (batchDetails.expiryDate.toDate) {
                expiryDate = batchDetails.expiryDate.toDate();
              } else {
                expiryDate = new Date(batchDetails.expiryDate);
              }
              
              if (expiryDate.getFullYear() > 1970) {
                expiryDateString = expiryDate.toLocaleDateString('pl-PL');
              }
            }
            
            return {
              batchId: batch.batchId,
              batchNumber: batch.batchNumber || batch.lotNumber || 'Brak numeru',
              materialId: materialId,
              materialName: material?.name || 'Nieznany materiał',
              warehouseId: batchDetails?.warehouseId || null,
              warehouseName: warehouseInfo?.name || 'Nieznany magazyn',
              warehouseAddress: warehouseInfo?.address || '',
              expiryDate: expiryDate,
              expiryDateString: expiryDateString,
              unit: material?.unit || 'szt.',
              // Timestamp snapshotu
              snapshotCreatedAt: new Date().toISOString()
            };
          }
        }
      }
    }
    
    return null;
  } catch (error) {
    console.error('Błąd podczas tworzenia snapshotu rezerwacji:', error);
    return null;
  }
};

/**
 * Pobiera standardowe rezerwacje magazynowe dla zadania
 * @param {string} taskId - ID zadania produkcyjnego
 * @returns {Promise<Array>} - Lista standardowych rezerwacji
 */
export const getStandardReservationsForTask = async (taskId) => {
  try {
    const functionStartTime = performance.now();
    
    // Pobierz zadanie produkcyjne
    const taskRef = doc(db, 'productionTasks', taskId);
    const taskDoc = await getDoc(taskRef);
    
    if (!taskDoc.exists()) {
      console.log('Zadanie nie istnieje');
      return [];
    }
    
    const task = taskDoc.data();
    
    // Pobierz wszystkie powiązania składników z rezerwacjami dla tego zadania
    const ingredientLinks = await getIngredientReservationLinks(taskId);
    // Oblicz łączną powiązaną ilość dla każdej rezerwacji
    const linkedQuantities = {};
    Object.values(ingredientLinks).forEach(linksArray => {
      if (Array.isArray(linksArray)) {
        linksArray.forEach(link => {
          if (link.reservationId && (link.linkedQuantity || link.quantity)) {
            const linkedQty = link.linkedQuantity || link.quantity;
            linkedQuantities[link.reservationId] = (linkedQuantities[link.reservationId] || 0) + parseFloat(linkedQty);
          }
        });
      }
    });
    
    // Oblicz skonsumowane ilości z task.consumedMaterials dla każdej partii
    const consumedQuantitiesByBatch = {};
    if (task.consumedMaterials && Array.isArray(task.consumedMaterials)) {
      task.consumedMaterials.forEach(consumed => {
        if (consumed.batchId && consumed.materialId) {
          const key = `${consumed.materialId}_${consumed.batchId}`;
          consumedQuantitiesByBatch[key] = (consumedQuantitiesByBatch[key] || 0) + parseFloat(consumed.quantity || 0);
        }
      });
    }
    
    // Pobierz informacje o magazynach
    const warehouses = await getAllWarehouses();
    const warehousesMap = warehouses.reduce((map, warehouse) => {
      map[warehouse.id] = warehouse;
      return map;
    }, {});
    
    // 🚀 OPTYMALIZACJA A: Zbierz wszystkie unikalne batchId do jednego zapytania równoległego
    const allBatchIds = new Set();
    const batchToMaterialMapping = new Map();
    
    if (task.materialBatches) {
      for (const [materialId, batches] of Object.entries(task.materialBatches)) {
        if (batches) {
          batches.forEach(batch => {
            allBatchIds.add(batch.batchId);
            batchToMaterialMapping.set(batch.batchId, { materialId, batch });
          });
        }
      }
    }
    
    // Pobierz wszystkie szczegóły partii równolegle w jednym czasie
    // Pobieranie ${allBatchIds.size} partii równolegle
    const startTime = performance.now();
    const batchDetailsMap = new Map();
    
    if (allBatchIds.size > 0) {
      const batchPromises = Array.from(allBatchIds).map(async (batchId) => {
        try {
          const batchRef = doc(db, 'inventoryBatches', batchId);
          const batchDoc = await getDoc(batchRef);
          if (batchDoc.exists()) {
            batchDetailsMap.set(batchId, batchDoc.data());
          }
        } catch (batchError) {
          console.warn(`Nie udało się pobrać szczegółów partii ${batchId}:`, batchError);
        }
      });
      
      await Promise.all(batchPromises);
      const endTime = performance.now();
      // Pobrano ${batchDetailsMap.size} partii w ${Math.round(endTime - startTime)}ms
    }
    
    const reservations = [];
    
    // Teraz przetwórz dane używając już pobranych szczegółów
    if (task.materialBatches) {
      for (const [materialId, batches] of Object.entries(task.materialBatches)) {
        // Znajdź informacje o materiale
        const material = task.materials?.find(m => 
          (m.id === materialId || m.inventoryItemId === materialId)
        );
        
        if (material && batches) {
          for (const batch of batches) {
            const reservationId = `${taskId}_${materialId}_${batch.batchId}`;
            const linkedQuantity = linkedQuantities[reservationId] || 0;
            
            // Użyj precyzyjnych obliczeń aby uniknąć błędów zmiennoprzecinkowych
            // ✅ POPRAWKA: dostępna ilość = rezerwacja - aktywne powiązania + skonsumowane z tej partii
            const reservedQuantityInBatch = fixFloatingPointPrecision(batch.quantity || 0);
            const totalLinkedQuantity = fixFloatingPointPrecision(linkedQuantity || 0);
            
            // Znajdź skonsumowane ilości dla tej konkretnej partii
            const consumedKey = `${materialId}_${batch.batchId}`;
            const totalConsumedFromBatch = fixFloatingPointPrecision(consumedQuantitiesByBatch[consumedKey] || 0);
            
            // Dostępna ilość = rezerwacja - aktywne powiązania + skonsumowane (skonsumowane uwalnia się do ponownego powiązania)
            // Logika: jeśli miałem 500kg rezerwacji, powiązałem 450kg, ale skonsumowałem 100kg
            // to dostępne = 500kg - 450kg + 100kg = 150kg
            const finalAvailableQuantity = Math.max(0, preciseAdd(
              preciseSubtract(reservedQuantityInBatch, totalLinkedQuantity),
              totalConsumedFromBatch
            ));
            
            
            // Użyj już pobranych szczegółów partii (brak zapytania w pętli!)
            const batchDetails = batchDetailsMap.get(batch.batchId);
            
            // Przygotuj informacje o magazynie
            const warehouseInfo = batchDetails?.warehouseId ? warehousesMap[batchDetails.warehouseId] : null;
            
            // Przygotuj informacje o dacie ważności
            let expiryDate = null;
            if (batchDetails?.expiryDate) {
              if (batchDetails.expiryDate instanceof Timestamp) {
                expiryDate = batchDetails.expiryDate.toDate();
              } else if (batchDetails.expiryDate.toDate) {
                expiryDate = batchDetails.expiryDate.toDate();
              } else {
                expiryDate = new Date(batchDetails.expiryDate);
              }
              
              // Sprawdź czy to nie jest domyślna data (1.01.1970)
              if (expiryDate.getFullYear() <= 1970) {
                expiryDate = null;
              }
            }
            
            const reservation = {
              id: reservationId,
              taskId: taskId,
              materialId: materialId,
              materialName: material.name,
              batchId: batch.batchId,
              batchNumber: batch.batchNumber || batch.lotNumber || 'Brak numeru',
              reservedQuantity: batch.quantity,
              availableQuantity: formatQuantityPrecision(Math.max(0, finalAvailableQuantity), 3), // Nie może być ujemna, z precyzją
              linkedQuantity: linkedQuantity, // Dodaj info o powiązanej ilości
              unit: material.unit || 'szt.',
              type: 'standard',
              // Dodane informacje o lokalizacji i dacie ważności
              warehouseId: batchDetails?.warehouseId || null,
              warehouseName: warehouseInfo?.name || 'Nieznany magazyn',
              warehouseAddress: warehouseInfo?.address || '',
              expiryDate: expiryDate,
              expiryDateString: expiryDate ? expiryDate.toLocaleDateString('pl-PL') : null
            };
            
            // Rezerwacja ${reservationId}: ${finalAvailableQuantity} finalna
            reservations.push(reservation);
          }
        }
      }
          }
    
    const functionEndTime = performance.now();
    const totalTime = Math.round(functionEndTime - functionStartTime);
    console.log(`⚡ [PERFORMANCE] getStandardReservationsForTask ukończone w ${totalTime}ms`);
    // Finalne rezerwacje standardowe: ${reservations.length}
    
    return reservations;
  } catch (error) {
    console.error('Błąd pobierania rezerwacji:', error.message);
    return [];
  }
};

/**
 * Pobiera "wirtualne" rezerwacje na podstawie snapshotów z powiązań
 * (Używana do wyświetlania istniejących powiązań niezależnie od stanu zadania)
 * @param {string} taskId - ID zadania produkcyjnego
 * @returns {Promise<Array>} - Lista wirtualnych rezerwacji z snapshotów
 */
export const getVirtualReservationsFromSnapshots = async (taskId) => {
  try {
    const ingredientLinks = await getIngredientReservationLinks(taskId);
    const virtualReservations = [];
    
    Object.values(ingredientLinks).forEach(link => {
      if (link.batchSnapshot) {
        virtualReservations.push({
          id: link.reservationId,
          taskId: taskId,
          materialId: link.batchSnapshot.materialId,
          materialName: link.batchSnapshot.materialName,
          batchId: link.batchSnapshot.batchId,
          batchNumber: link.batchSnapshot.batchNumber,
          unit: link.batchSnapshot.unit,
          type: 'standard',
          // Dane z snapshotu
          warehouseId: link.batchSnapshot.warehouseId,
          warehouseName: link.batchSnapshot.warehouseName,
          warehouseAddress: link.batchSnapshot.warehouseAddress,
          expiryDateString: link.batchSnapshot.expiryDateString,
          // Informacje o powiązaniu
          linkedQuantity: link.linkedQuantity,
          availableQuantity: link.remainingQuantity,
          reservedQuantity: link.linkedQuantity
        });
      }
    });
    
    console.log('Wirtualne rezerwacje z snapshotów:', virtualReservations);
    return virtualReservations;
  } catch (error) {
    console.error('Błąd podczas pobierania wirtualnych rezerwacji:', error);
    return [];
  }
};

/**
 * Pobiera powiązania składników z rezerwacjami dla zadania
 * @param {string} taskId - ID zadania produkcyjnego
 * @returns {Promise<Object>} - Obiekt mapujący ID składnika na tablicę powiązań
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
      
      // Oblicz procent konsumpcji
      const consumptionPercentage = data.linkedQuantity > 0 
        ? Math.round((data.consumedQuantity / data.linkedQuantity) * 100)
        : 0;
      
      const linkItem = {
        id: doc.id,
        ...data,
        consumptionPercentage: consumptionPercentage,
        // Używaj danych ze snapshotu zamiast pobierania na bieżąco
        warehouseName: data.batchSnapshot?.warehouseName,
        warehouseAddress: data.batchSnapshot?.warehouseAddress,
        expiryDateString: data.batchSnapshot?.expiryDateString,
        batchNumber: data.batchSnapshot?.batchNumber,
        // Zachowaj kompatybilność wsteczną
        quantity: data.linkedQuantity, // Dla komponentów używających starego pola
        reservationType: data.reservationType
      };
      
      // Grupuj powiązania po ingredientId
      if (!links[data.ingredientId]) {
        links[data.ingredientId] = [];
      }
      links[data.ingredientId].push(linkItem);
    });
    
    return links;
  } catch (error) {
    console.error('Błąd podczas pobierania powiązań składników:', error);
    return {};
  }
};

/**
 * Powiązuje składnik z rezerwacją (obsługuje wielokrotne powiązania)
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
    // Pobierz snapshot rezerwacji
    const reservationSnapshot = await getReservationSnapshot(taskId, reservationId);
    
    // Sprawdź czy to specyficzne powiązanie już istnieje (składnik + rezerwacja)
    const existingQuery = query(
      collection(db, INGREDIENT_LINKS_COLLECTION),
      where('taskId', '==', taskId),
      where('ingredientId', '==', ingredientId),
      where('reservationId', '==', reservationId)
    );
    
    const existingSnapshot = await getDocs(existingQuery);
    
    const linkData = {
      taskId: taskId,
      ingredientId: ingredientId,
      reservationId: reservationId,
      reservationType: reservationType,
      linkedQuantity: quantity, // Ile powiązano
      consumedQuantity: 0, // Ile skonsumowano (początkowo 0)
      remainingQuantity: quantity, // Ile pozostało (początkowo = linkedQuantity)
      consumptionHistory: [], // Historia konsumpcji
      batchSnapshot: reservationSnapshot, // Snapshot informacji o partii
      isFullyConsumed: false,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };
    
    if (!existingSnapshot.empty) {
      // Aktualizuj istniejące powiązanie dla tej konkretnej rezerwacji
      const existingDoc = existingSnapshot.docs[0];
      const existingData = existingDoc.data();
      
      // Zachowaj istniejącą historię konsumpcji
      linkData.consumedQuantity = existingData.consumedQuantity || 0;
      linkData.consumptionHistory = existingData.consumptionHistory || [];
      linkData.remainingQuantity = quantity - linkData.consumedQuantity;
      linkData.isFullyConsumed = linkData.remainingQuantity <= 0;
      
      await updateDoc(doc(db, INGREDIENT_LINKS_COLLECTION, existingDoc.id), linkData);
      console.log('✅ [LINK DEBUG] Zaktualizowano istniejące powiązanie:', existingDoc.id);
    } else {
      // Utwórz nowe powiązanie dla tej rezerwacji
      const newDocRef = await addDoc(collection(db, INGREDIENT_LINKS_COLLECTION), {
        ...linkData,
        createdAt: serverTimestamp(),
        createdBy: userId
      });
      console.log('✅ [LINK DEBUG] Utworzono nowe powiązanie:', newDocRef.id, 'dla rezerwacji:', reservationId);
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
 * Aktualizuje konsumpcję powiązanego składnika
 * @param {string} taskId - ID zadania produkcyjnego
 * @param {string} ingredientId - ID składnika
 * @param {number} consumedQuantity - Ilość skonsumowana
 * @param {string} userId - ID użytkownika
 * @returns {Promise<Object>} - Wynik operacji
 */
export const updateIngredientConsumption = async (taskId, ingredientId, consumedQuantity, userId) => {
  try {
    const q = query(
      collection(db, INGREDIENT_LINKS_COLLECTION),
      where('taskId', '==', taskId),
      where('ingredientId', '==', ingredientId)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      throw new Error('Nie znaleziono powiązania składnika');
    }
    
    const linkDoc = snapshot.docs[0];
    const linkData = linkDoc.data();
    
    // Oblicz nowe wartości
    const newConsumedQuantity = parseFloat(consumedQuantity);
    const remainingQuantity = linkData.linkedQuantity - newConsumedQuantity;
    const isFullyConsumed = remainingQuantity <= 0;
    
    // Aktualizuj historię konsumpcji
    const consumptionHistory = linkData.consumptionHistory || [];
    const consumptionDiff = newConsumedQuantity - (linkData.consumedQuantity || 0);
    
    if (consumptionDiff > 0) {
      consumptionHistory.push({
        quantity: consumptionDiff,
        consumedAt: serverTimestamp(),
        consumedBy: userId
      });
    }
    
    // Aktualizuj dokument
    await updateDoc(doc(db, INGREDIENT_LINKS_COLLECTION, linkDoc.id), {
      consumedQuantity: newConsumedQuantity,
      remainingQuantity: Math.max(0, remainingQuantity),
      isFullyConsumed: isFullyConsumed,
      consumptionHistory: consumptionHistory,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    return {
      success: true,
      message: 'Konsumpcja składnika została zaktualizowana'
    };
  } catch (error) {
    console.error('Błąd podczas aktualizacji konsumpcji składnika:', error);
    throw error;
  }
};

/**
 * Usuwa konkretne powiązanie składnik-rezerwacja (nowa funkcja dla obsługi wielu powiązań)
 * @param {string} linkId - ID konkretnego powiązania do usunięcia
 * @param {string} userId - ID użytkownika wykonującego operację
 * @returns {Promise<Object>} - Wynik operacji
 */
export const unlinkSpecificReservation = async (linkId, userId) => {
  try {
    const linkRef = doc(db, INGREDIENT_LINKS_COLLECTION, linkId);
    
    // Sprawdź czy powiązanie istnieje
    const linkDoc = await getDoc(linkRef);
    if (!linkDoc.exists()) {
      throw new Error('Nie znaleziono powiązania do usunięcia');
    }
    
    // Usuń konkretne powiązanie
    await deleteDoc(linkRef);
    
    return {
      success: true,
      message: 'Powiązanie zostało usunięte'
    };
  } catch (error) {
    console.error('Błąd podczas usuwania konkretnego powiązania:', error);
    throw error;
  }
};

/**
 * Usuwa wszystkie powiązania składnika z rezerwacjami (zachowana dla kompatybilności wstecznej)
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
    
    // Fizycznie usuń wszystkie powiązania składnika
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    return {
      success: true,
      message: `Usunięto ${snapshot.docs.length} powiązań składnika`
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
    
    // Przygotuj szczegółowy raport (nowa struktura z tablicami powiązań)
    const report = ingredients.map(ingredient => {
      const ingredientLinks = links[ingredient.id] || [];
      const reservationInfos = [];
      
      if (ingredientLinks.length > 0) {
        ingredientLinks.forEach(link => {
          const reservationInfo = allReservations.find(res => res.id === link.reservationId);
          if (reservationInfo) {
            reservationInfos.push({
              reservationInfo: reservationInfo,
              linkInfo: link
            });
          }
        });
      }
      
      return {
        ingredientId: ingredient.id,
        ingredientName: ingredient.text,
        ingredientDetails: ingredient.details,
        isLinked: ingredientLinks.length > 0,
        linksCount: ingredientLinks.length,
        totalLinkedQuantity: ingredientLinks.reduce((sum, link) => sum + (link.linkedQuantity || 0), 0),
        reservationInfos: reservationInfos,
        linkInfos: ingredientLinks // Zachowana dla kompatybilności
      };
    });
    
    return report;
  } catch (error) {
    console.error('Błąd podczas generowania raportu powiązań:', error);
    return [];
  }
};

/**
 * Pobiera identyfikatory już powiązanych rezerwacji dla składnika
 * @param {string} taskId - ID zadania produkcyjnego
 * @param {string} ingredientId - ID składnika
 * @returns {Promise<Array>} - Lista ID już powiązanych rezerwacji
 */
export const getLinkedReservationIds = async (taskId, ingredientId) => {
  try {
    const q = query(
      collection(db, INGREDIENT_LINKS_COLLECTION),
      where('taskId', '==', taskId),
      where('ingredientId', '==', ingredientId)
    );
    
    const snapshot = await getDocs(q);
    const linkedReservationIds = [];
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      linkedReservationIds.push(data.reservationId);
    });
    
    return linkedReservationIds;
  } catch (error) {
    console.error('Błąd podczas pobierania powiązanych rezerwacji:', error);
    return [];
  }
};

/**
 * Usuwa wszystkie powiązania składników dla zadania produkcyjnego
 * @param {string} taskId - ID zadania produkcyjnego
 * @param {string} userId - ID użytkownika wykonującego operację
 * @returns {Promise<Object>} - Wynik operacji
 */
export const clearAllIngredientLinksForTask = async (taskId, userId) => {
  try {
    // Pobierz wszystkie powiązania dla tego zadania
    const q = query(
      collection(db, INGREDIENT_LINKS_COLLECTION),
      where('taskId', '==', taskId)
    );
    
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) {
      console.log(`Brak powiązań do usunięcia dla zadania ${taskId}`);
      return {
        success: true,
        message: 'Brak powiązań do usunięcia',
        deletedCount: 0
      };
    }
    
    // Usuń wszystkie powiązania
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    
    console.log(`Usunięto ${snapshot.docs.length} powiązań składników dla zadania ${taskId}`);
    
    return {
      success: true,
      message: `Usunięto ${snapshot.docs.length} powiązań składników`,
      deletedCount: snapshot.docs.length
    };
  } catch (error) {
    console.error('Błąd podczas usuwania powiązań składników:', error);
    throw error;
  }
};


