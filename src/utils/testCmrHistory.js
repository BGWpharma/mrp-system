// Plik testowy do sprawdzenia funkcjonalności historii CMR
// Można uruchomić w konsoli przeglądarki

import { updateOrderItemShippedQuantity, migrateCmrHistoryData } from '../services/orderService';

// Funkcja testowa do symulacji dodawania CMR do pozycji zamówienia
export const testCmrHistory = async (orderId, testData) => {
  try {
    console.log('🧪 Rozpoczęcie testu historii CMR...');
    
    // Test 1: Dodaj pierwszy CMR
    console.log('📦 Test 1: Dodawanie pierwszego CMR');
    const firstCmrUpdate = [
      {
        itemName: testData.itemName,
        quantity: testData.firstQuantity,
        cmrNumber: testData.firstCmrNumber
      }
    ];
    
    await updateOrderItemShippedQuantity(orderId, firstCmrUpdate, 'test-user');
    console.log(`✅ Dodano pierwszy CMR: ${testData.firstCmrNumber} (${testData.firstQuantity} szt.)`);
    
    // Test 2: Dodaj drugi CMR dla tej samej pozycji
    console.log('📦 Test 2: Dodawanie drugiego CMR dla tej samej pozycji');
    const secondCmrUpdate = [
      {
        itemName: testData.itemName,
        quantity: testData.secondQuantity,
        cmrNumber: testData.secondCmrNumber
      }
    ];
    
    await updateOrderItemShippedQuantity(orderId, secondCmrUpdate, 'test-user');
    console.log(`✅ Dodano drugi CMR: ${testData.secondCmrNumber} (${testData.secondQuantity} szt.)`);
    
    // Test 3: Dodaj więcej towaru do pierwszego CMR
    console.log('📦 Test 3: Dodawanie więcej towaru do pierwszego CMR');
    const additionalFirstCmrUpdate = [
      {
        itemName: testData.itemName,
        quantity: testData.additionalQuantity,
        cmrNumber: testData.firstCmrNumber
      }
    ];
    
    await updateOrderItemShippedQuantity(orderId, additionalFirstCmrUpdate, 'test-user');
    console.log(`✅ Dodano więcej towaru do pierwszego CMR: ${testData.firstCmrNumber} (+${testData.additionalQuantity} szt.)`);
    
    console.log('🎉 Test zakończony pomyślnie!');
    console.log('💡 Sprawdź teraz w interfejsie, czy wszystkie CMR są wyświetlane w kolumnie "Wysłano"');
    
    return {
      success: true,
      message: 'Test historii CMR zakończony pomyślnie'
    };
  } catch (error) {
    console.error('❌ Błąd podczas testu:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Przykładowe dane testowe
export const sampleTestData = {
  itemName: 'Przykładowy produkt',
  firstCmrNumber: 'CMR-20241201-0001',
  firstQuantity: 5,
  secondCmrNumber: 'CMR-20241201-0002',
  secondQuantity: 3,
  additionalQuantity: 2
};

// Funkcja do uruchomienia migracji
export const runMigration = async () => {
  try {
    console.log('🔄 Rozpoczęcie migracji danych CMR...');
    const result = await migrateCmrHistoryData();
    
    if (result.success) {
      console.log(`✅ Migracja zakończona pomyślnie. Zmigrowano ${result.migratedCount} zamówień.`);
    }
    
    return result;
  } catch (error) {
    console.error('❌ Błąd podczas migracji:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Instrukcje użycia:
console.log(`
🔧 INSTRUKCJE TESTOWANIA HISTORII CMR:

1. Uruchom migrację istniejących danych:
   runMigration()

2. Przetestuj dodawanie CMR do zamówienia:
   testCmrHistory('ID_ZAMOWIENIA', sampleTestData)

3. Sprawdź w interfejsie czy:
   - Kolumna "Wysłano" pokazuje łączną ilość wysłaną
   - Pod ilością wyświetlane są wszystkie numery CMR z ilościami
   - Każdy CMR jest wyświetlany w osobnej linii

Przykład użycia:
testCmrHistory('twoje-id-zamowienia', {
  itemName: 'Nazwa produktu z zamówienia',
  firstCmrNumber: 'CMR-20241201-0001',
  firstQuantity: 5,
  secondCmrNumber: 'CMR-20241201-0002', 
  secondQuantity: 3,
  additionalQuantity: 2
})
`); 