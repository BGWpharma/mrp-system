const { rtdb } = require('./services/firebase/config.js');
const { ref, push, set, get } = require('firebase/database');

async function createNotification() {
  try {
    console.log("Rozpoczynam tworzenie testowego powiadomienia...");
    
    // Tworzymy referencję do kolekcji powiadomień
    const notificationsRef = ref(rtdb, 'notifications');
    
    console.log("Sprawdzam czy istnieją już jakieś powiadomienia...");
    const snapshot = await get(notificationsRef);
    
    if (snapshot.exists()) {
      console.log("Istniejące powiadomienia:", Object.keys(snapshot.val()).length);
    } else {
      console.log("Brak istniejących powiadomień");
    }
    
    // Generujemy nowy unikatowy klucz
    const newNotificationRef = push(notificationsRef);
    console.log("Wygenerowano klucz:", newNotificationRef.key);
    
    // ID użytkownika, dla którego tworzymy powiadomienie
    const userId = 'IYPn68JsnkU2tWomMv5giH6Y8Fh2'; // Zmień na swoje ID użytkownika
    
    const now = new Date().toISOString();
    
    // Dane powiadomienia
    const notificationData = {
      userIds: [userId],
      title: 'Test powiadomienia',
      message: 'To jest testowe powiadomienie z Realtime Database',
      type: 'info',
      entityType: 'test',
      entityId: 'test123',
      read: {},
      createdAt: now
    };
    
    // Inicjalizacja stanu odczytu dla użytkownika
    notificationData.read[userId] = false;
    
    console.log("Przygotowano dane powiadomienia:", notificationData);
    
    // Zapisujemy powiadomienie w bazie
    console.log("Zapisuję powiadomienie...");
    await set(newNotificationRef, notificationData);
    
    console.log('Powiadomienie zostało utworzone!');
    console.log('ID powiadomienia:', newNotificationRef.key);
    
    // Sprawdźmy czy powiadomienie faktycznie zostało zapisane
    console.log("Sprawdzam czy powiadomienie zostało zapisane...");
    const checkRef = ref(rtdb, `notifications/${newNotificationRef.key}`);
    const checkSnapshot = await get(checkRef);
    
    if (checkSnapshot.exists()) {
      console.log("Powiadomienie zostało poprawnie zapisane:", checkSnapshot.val());
    } else {
      console.log("Błąd: Powiadomienie nie zostało zapisane!");
    }
    
    // Zakończ po 3 sekundach, aby dać czas na zakończenie operacji
    setTimeout(() => {
      console.log("Zakończono");
      process.exit(0);
    }, 3000);
  } catch (err) {
    console.error('Błąd podczas tworzenia powiadomienia:', err);
    process.exit(1);
  }
}

// Wywołanie funkcji
createNotification(); 