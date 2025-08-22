import { collection, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from './firebase/config';
import { setNutritionalComponentWithId } from './nutritionalComponentsService';
import { ALL_NUTRITIONAL_COMPONENTS } from '../utils/constants';

/**
 * Funkcja migracyjna dodająca limity wiadomości AI dla wszystkich użytkowników
 * w zależności od ich roli (administrator: 250, pracownik: 50)
 * @returns {Promise<{success: boolean, updated: number, errors: number}>} - Informacje o migracji
 */
export const migrateAIMessageLimits = async () => {
  try {
    const usersRef = collection(db, 'users');
    const usersSnapshot = await getDocs(usersRef);
    
    let updated = 0;
    let errors = 0;
    
    // Iteracja po wszystkich użytkownikach
    const updatePromises = usersSnapshot.docs.map(async (userDoc) => {
      try {
        const userData = userDoc.data();
        const isAdmin = userData.role === 'administrator';
        
        // Sprawdź, czy użytkownik już ma ustawiony limit
        if (userData.aiMessagesLimit !== undefined) {
          console.log(`Użytkownik ${userData.email} już ma ustawiony limit: ${userData.aiMessagesLimit}`);
          return;
        }
        
        // Ustaw limit w zależności od roli
        const aiMessagesLimit = isAdmin ? 250 : 50;
        
        // Aktualizuj dokument użytkownika
        await updateDoc(doc(db, 'users', userDoc.id), {
          aiMessagesLimit: aiMessagesLimit,
          aiMessagesUsed: 0,
          aiMessagesResetDate: new Date()
        });
        
        console.log(`Zaktualizowano limit dla użytkownika ${userData.email}: ${aiMessagesLimit}`);
        updated++;
      } catch (error) {
        console.error(`Błąd podczas aktualizacji użytkownika ${userDoc.id}:`, error);
        errors++;
      }
    });
    
    // Poczekaj na zakończenie wszystkich aktualizacji
    await Promise.all(updatePromises);
    
    console.log(`Migracja zakończona. Zaktualizowano: ${updated}, błędy: ${errors}`);
    return { success: true, updated, errors };
  } catch (error) {
    console.error('Błąd podczas migracji limitów wiadomości AI:', error);
    return { success: false, updated: 0, errors: 1, error: error.message };
  }
};

/**
 * Funkcja migracyjna dodająca składniki odżywcze do bazy danych
 * na podstawie danych z constants.js
 * @returns {Promise<{success: boolean, added: number, errors: number}>} - Informacje o migracji
 */
export const migrateNutritionalComponents = async () => {
  try {
    let added = 0;
    let errors = 0;
    let skipped = 0;
    
    console.log(`Rozpoczynam migrację ${ALL_NUTRITIONAL_COMPONENTS.length} składników odżywczych...`);
    
    // Iteracja po wszystkich składnikach odżywczych z constants.js
    const migrationPromises = ALL_NUTRITIONAL_COMPONENTS.map(async (component) => {
      try {
        // Używamy kodu jako ID dokumentu dla łatwiejszego zarządzania
        const docId = component.code;
        
        await setNutritionalComponentWithId(docId, {
          code: component.code,
          name: component.name,
          unit: component.unit,
          category: component.category,
          isSystemDefault: true, // Oznaczamy jako domyślne składniki systemowe
          isActive: true
        });
        
        console.log(`Dodano składnik: ${component.code} - ${component.name}`);
        added++;
      } catch (error) {
        // Jeśli dokument już istnieje, nie traktujemy tego jako błąd
        if (error.code === 'permission-denied' || error.message.includes('already exists')) {
          console.log(`Składnik ${component.code} już istnieje - pomijam`);
          skipped++;
        } else {
          console.error(`Błąd podczas dodawania składnika ${component.code}:`, error);
          errors++;
        }
      }
    });
    
    // Poczekaj na zakończenie wszystkich operacji
    await Promise.allSettled(migrationPromises);
    
    console.log(`Migracja składników odżywczych zakończona. Dodano: ${added}, pominięto: ${skipped}, błędy: ${errors}`);
    return { 
      success: true, 
      added, 
      skipped, 
      errors,
      total: ALL_NUTRITIONAL_COMPONENTS.length
    };
  } catch (error) {
    console.error('Błąd podczas migracji składników odżywczych:', error);
    return { 
      success: false, 
      added: 0, 
      skipped: 0, 
      errors: 1, 
      error: error.message,
      total: ALL_NUTRITIONAL_COMPONENTS.length
    };
  }
};

/**
 * Funkcja do bezpiecznego czyszczenia sierocych wpisów historii produkcji
 * Znajduje i opcjonalnie usuwa wpisy productionHistory, które nie mają odpowiadających zadań produkcyjnych
 * @param {boolean} dryRun - Jeśli true, tylko sprawdza bez usuwania (domyślnie true)
 * @returns {Promise<{success: boolean, orphanedCount: number, deletedCount: number, errors: number}>}
 */
export const cleanupOrphanedProductionHistory = async (dryRun = true) => {
  try {
    console.log(`[CLEANUP] Rozpoczynam ${dryRun ? 'sprawdzanie' : 'czyszczenie'} sierocych wpisów historii produkcji...`);
    
    // Krok 1: Pobierz wszystkie wpisy z historii produkcji
    const productionHistoryRef = collection(db, 'productionHistory');
    const historySnapshot = await getDocs(productionHistoryRef);
    
    console.log(`[CLEANUP] Znaleziono ${historySnapshot.docs.length} wpisów w historii produkcji`);
    
    // Krok 2: Pobierz wszystkie istniejące zadania produkcyjne
    const productionTasksRef = collection(db, 'productionTasks');
    const tasksSnapshot = await getDocs(productionTasksRef);
    
    const existingTaskIds = new Set(tasksSnapshot.docs.map(docItem => docItem.id));
    console.log(`[CLEANUP] Znaleziono ${existingTaskIds.size} istniejących zadań produkcyjnych`);
    
    // Krok 3: Znajdź sierocze wpisy (te, które mają taskId nieistniejący w productionTasks)
    const orphanedEntries = [];
    
    for (const historyDoc of historySnapshot.docs) {
      const historyData = historyDoc.data();
      const taskId = historyData.taskId;
      
      if (!taskId) {
        console.warn(`[CLEANUP] Wpis historii ${historyDoc.id} nie ma taskId`);
        orphanedEntries.push({
          id: historyDoc.id,
          reason: 'missing_taskId',
          data: historyData
        });
      } else if (!existingTaskIds.has(taskId)) {
        console.log(`[CLEANUP] Znaleziono sierocza wpis: ${historyDoc.id} (taskId: ${taskId})`);
        orphanedEntries.push({
          id: historyDoc.id,
          reason: 'task_not_exists',
          taskId: taskId,
          data: historyData
        });
      }
    }
    
    console.log(`[CLEANUP] Znaleziono ${orphanedEntries.length} sierocych wpisów`);
    
    // Krok 4: Wyświetl szczegóły sierocych wpisów
    if (orphanedEntries.length > 0) {
      console.log('[CLEANUP] Szczegóły sierocych wpisów:');
      orphanedEntries.forEach((entry, index) => {
        console.log(`  ${index + 1}. ID: ${entry.id}`);
        console.log(`     Powód: ${entry.reason}`);
        if (entry.taskId) {
          console.log(`     TaskId: ${entry.taskId}`);
        }
        if (entry.data.startTime && entry.data.endTime) {
          const startTime = entry.data.startTime.toDate ? 
            entry.data.startTime.toDate() : 
            new Date(entry.data.startTime);
          console.log(`     Data: ${startTime.toLocaleDateString()}`);
        }
        if (entry.data.quantity) {
          console.log(`     Ilość: ${entry.data.quantity}`);
        }
        console.log('');
      });
    }
    
    let deletedCount = 0;
    let errors = 0;
    
    // Krok 5: Usuń sierocze wpisy (tylko jeśli nie jest to dry run)
    if (!dryRun && orphanedEntries.length > 0) {
      console.log(`[CLEANUP] Usuwam ${orphanedEntries.length} sierocych wpisów...`);
      
      const deletionPromises = orphanedEntries.map(async (entry) => {
        try {
          await deleteDoc(doc(db, 'productionHistory', entry.id));
          console.log(`[CLEANUP] Usunięto sierocza wpis: ${entry.id}`);
          deletedCount++;
        } catch (error) {
          console.error(`[CLEANUP] Błąd podczas usuwania wpisu ${entry.id}:`, error);
          errors++;
        }
      });
      
      await Promise.allSettled(deletionPromises);
    }
    
    const result = {
      success: true,
      orphanedCount: orphanedEntries.length,
      deletedCount,
      errors,
      dryRun
    };
    
    console.log(`[CLEANUP] Zakończono ${dryRun ? 'sprawdzanie' : 'czyszczenie'}:`, result);
    return result;
    
  } catch (error) {
    console.error('[CLEANUP] Błąd podczas czyszczenia sierocych wpisów:', error);
    return {
      success: false,
      orphanedCount: 0,
      deletedCount: 0,
      errors: 1,
      error: error.message,
      dryRun
    };
  }
};

const migrationServiceExports = {
  migrateAIMessageLimits,
  migrateNutritionalComponents,
  cleanupOrphanedProductionHistory
};

export default migrationServiceExports;