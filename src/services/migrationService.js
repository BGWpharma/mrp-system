import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from './firebase/config';

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

export default {
  migrateAIMessageLimits
}; 