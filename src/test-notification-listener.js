const { 
  subscribeToUserNotifications,
  subscribeToUnreadCount,
  getRealtimeUserNotifications,
  getUnreadRealtimeNotificationsCount,
  createRealtimeNotification,
  markAllRealtimeNotificationsAsRead,
  markRealtimeNotificationAsRead
} = require('./services/notificationService');

async function testNotifications() {
  try {
    console.log("=========== Rozpoczynam test nasłuchiwania powiadomień... ===========");
    
    // ID użytkownika testowego
    const userId = 'IYPn68JsnkU2tWomMv5giH6Y8Fh2';
    
    // Sprawdź istniejące powiadomienia
    console.log("\n1. Pobieranie istniejących powiadomień...");
    const notifications = await getRealtimeUserNotifications(userId);
    console.log(`Znaleziono ${notifications.length} powiadomień:`, 
      notifications.map(n => ({
        id: n.id, 
        title: n.title,
        read: n.read,
        createdAt: n.createdAt
      }))
    );
    
    // Sprawdź liczbę nieprzeczytanych powiadomień
    console.log("\n2. Pobieranie liczby nieprzeczytanych powiadomień...");
    const unreadCount = await getUnreadRealtimeNotificationsCount(userId);
    console.log(`Liczba nieprzeczytanych powiadomień: ${unreadCount}`);
    
    // Subskrybuj na nowe powiadomienia
    console.log("\n3. Rozpoczynam nasłuchiwanie na nowe powiadomienia...");
    const unsubscribeNotifications = subscribeToUserNotifications(userId, (notification) => {
      console.log("Otrzymano nowe powiadomienie:", notification);
    });
    
    // Subskrybuj na zmiany liczby nieprzeczytanych powiadomień
    console.log("\n4. Rozpoczynam nasłuchiwanie na zmiany liczby nieprzeczytanych powiadomień...");
    const unsubscribeUnreadCount = subscribeToUnreadCount(userId, (count) => {
      console.log("Nowa liczba nieprzeczytanych powiadomień:", count);
    });
    
    // Utwórz testowe powiadomienie
    console.log("\n5. Tworzenie testowego powiadomienia...");
    let testNotificationId = null;
    try {
      testNotificationId = await createRealtimeNotification({
        userIds: [userId],
        title: 'Test API powiadomienia',
        message: 'To jest testowe powiadomienie utworzone przez API',
        type: 'info',
        entityType: 'test',
        entityId: 'test-api-123'
      });
      console.log("Utworzono powiadomienie z ID:", testNotificationId);
    } catch (error) {
      console.error("Błąd podczas tworzenia powiadomienia:", error);
    }
    
    // Poczekaj 3 sekundy, aby zobaczyć powiadomienie
    console.log("\n6. Czekam 3 sekundy...");
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Sprawdź ponownie liczbę nieprzeczytanych powiadomień
    console.log("\n7. Sprawdzanie liczby nieprzeczytanych powiadomień po utworzeniu testowego...");
    const afterCreateCount = await getUnreadRealtimeNotificationsCount(userId);
    console.log(`Liczba nieprzeczytanych powiadomień po utworzeniu: ${afterCreateCount}`);
    
    // Oznacz pojedyncze powiadomienie jako przeczytane (jeśli utworzono testowe)
    if (testNotificationId) {
      console.log("\n8. Oznaczanie testowego powiadomienia jako przeczytane...");
      try {
        await markRealtimeNotificationAsRead(testNotificationId, userId);
        console.log(`Powiadomienie ${testNotificationId} oznaczone jako przeczytane`);
      } catch (error) {
        console.error("Błąd podczas oznaczania powiadomienia jako przeczytane:", error);
      }
      
      // Sprawdź liczbę nieprzeczytanych powiadomień po oznaczeniu jednego
      console.log("\n9. Sprawdzanie liczby nieprzeczytanych powiadomień po oznaczeniu jednego...");
      const afterMarkOneCount = await getUnreadRealtimeNotificationsCount(userId);
      console.log(`Liczba nieprzeczytanych powiadomień po oznaczeniu jednego: ${afterMarkOneCount}`);
    }
    
    // Oznacz wszystkie powiadomienia jako przeczytane
    console.log("\n10. Oznaczanie wszystkich powiadomień jako przeczytane...");
    try {
      await markAllRealtimeNotificationsAsRead(userId);
      console.log("Wszystkie powiadomienia oznaczone jako przeczytane");
    } catch (error) {
      console.error("Błąd podczas oznaczania wszystkich powiadomień jako przeczytane:", error);
    }
    
    // Sprawdź liczbę nieprzeczytanych powiadomień po oznaczeniu wszystkich
    console.log("\n11. Sprawdzanie liczby nieprzeczytanych powiadomień po oznaczeniu wszystkich...");
    const afterMarkAllCount = await getUnreadRealtimeNotificationsCount(userId);
    console.log(`Liczba nieprzeczytanych powiadomień po oznaczeniu wszystkich: ${afterMarkAllCount}`);
    
    // Pobierz powiadomienia po oznaczeniu wszystkich jako przeczytane
    console.log("\n12. Pobieranie powiadomień po oznaczeniu wszystkich jako przeczytane...");
    const afterMarkAllNotifications = await getRealtimeUserNotifications(userId);
    console.log(`Powiadomienia po oznaczeniu wszystkich jako przeczytane:`, 
      afterMarkAllNotifications.map(n => ({
        id: n.id, 
        title: n.title,
        read: n.read,
        createdAt: n.createdAt
      }))
    );
    
    // Anuluj subskrypcje
    console.log("\n13. Anulowanie subskrypcji...");
    unsubscribeNotifications();
    unsubscribeUnreadCount();
    
    console.log("\n=========== Test zakończony. ===========");
    process.exit(0);
  } catch (error) {
    console.error("Błąd podczas testu:", error);
    process.exit(1);
  }
}

// Uruchom test
testNotifications(); 