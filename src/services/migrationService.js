import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
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

export default {
  migrateAIMessageLimits,
  migrateNutritionalComponents
}; 