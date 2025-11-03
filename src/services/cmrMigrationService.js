/**
 * Serwis do migracji starych pozycji CMR
 * Dodaje informacje o paletach i kartonach do starych pozycji CMR
 */

import { db } from './firebase/config';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getInventoryDataFromBatches } from '../utils/cmrWeightCalculator';
import { calculatePalletWeights, calculateBoxWeights } from '../utils/cmrWeightCalculator';

const CMR_ITEMS_COLLECTION = 'cmrItems';

/**
 * Sprawdza ile pozycji CMR wymaga migracji (dry run)
 * @returns {Promise<Object>} Informacje o pozycjach do migracji
 */
export const checkCmrItemsForMigration = async () => {
  try {
    console.log('🔍 Sprawdzam pozycje CMR wymagające migracji...');
    
    // Pobierz wszystkie pozycje CMR
    const itemsRef = collection(db, CMR_ITEMS_COLLECTION);
    const itemsSnapshot = await getDocs(itemsRef);
    
    let totalItems = 0;
    let needsMigration = 0;
    let hasInfo = 0;
    let noBatches = 0;
    const itemsToMigrate = [];
    
    for (const itemDoc of itemsSnapshot.docs) {
      totalItems++;
      const item = itemDoc.data();
      const itemId = itemDoc.id;
      
      // Sprawdź czy pozycja już ma informacje o paletach
      if (item.palletsCount !== undefined) {
        hasInfo++;
        continue;
      }
      
      // Sprawdź czy pozycja ma powiązane partie
      if (!item.linkedBatches || item.linkedBatches.length === 0) {
        noBatches++;
        continue;
      }
      
      needsMigration++;
      itemsToMigrate.push({
        id: itemId,
        description: item.description || 'Bez opisu',
        quantity: item.quantity || 0,
        linkedBatchesCount: item.linkedBatches.length
      });
    }
    
    console.log('📊 Wyniki sprawdzenia:');
    console.log(`   Wszystkie pozycje: ${totalItems}`);
    console.log(`   Wymaga migracji: ${needsMigration}`);
    console.log(`   Ma już informacje: ${hasInfo}`);
    console.log(`   Brak powiązanych partii: ${noBatches}`);
    
    return {
      success: true,
      total: totalItems,
      needsMigration: needsMigration,
      hasInfo: hasInfo,
      noBatches: noBatches,
      itemsToMigrate: itemsToMigrate
    };
    
  } catch (error) {
    console.error('❌ Błąd podczas sprawdzania pozycji CMR:', error);
    return {
      success: false,
      error: error.message,
      total: 0,
      needsMigration: 0,
      hasInfo: 0,
      noBatches: 0,
      itemsToMigrate: []
    };
  }
};

/**
 * Migracja starych pozycji CMR - dodanie informacji o paletach i kartonach
 * @returns {Promise<Object>} Wyniki migracji
 */
export const migrateCmrItemsWithPalletInfo = async () => {
  try {
    console.log('🚀 Rozpoczynam migrację pozycji CMR...');
    
    // Pobierz wszystkie pozycje CMR
    const itemsRef = collection(db, CMR_ITEMS_COLLECTION);
    const itemsSnapshot = await getDocs(itemsRef);
    
    let totalItems = 0;
    let updatedItems = 0;
    let skippedItems = 0;
    let errorItems = 0;
    
    const updates = [];
    const errors = [];
    
    for (const itemDoc of itemsSnapshot.docs) {
      totalItems++;
      const item = itemDoc.data();
      const itemId = itemDoc.id;
      
      try {
        // Sprawdź czy pozycja już ma informacje o paletach
        if (item.palletsCount !== undefined) {
          console.log(`⏭️ Pozycja ${itemId} już ma palletsCount - pomijam`);
          skippedItems++;
          continue;
        }
        
        // Sprawdź czy pozycja ma powiązane partie
        if (!item.linkedBatches || item.linkedBatches.length === 0) {
          console.log(`⚠️ Pozycja ${itemId} nie ma powiązanych partii - pomijam`);
          skippedItems++;
          continue;
        }
        
        // Pobierz dane magazynowe z powiązanych partii
        const inventoryData = await getInventoryDataFromBatches(item.linkedBatches);
        
        if (!inventoryData || !inventoryData.weight) {
          console.log(`⚠️ Pozycja ${itemId} - brak danych magazynowych - pomijam`);
          skippedItems++;
          continue;
        }
        
        const quantity = parseFloat(item.quantity) || 0;
        
        if (quantity <= 0) {
          console.log(`⚠️ Pozycja ${itemId} - zerowa ilość - pomijam`);
          skippedItems++;
          continue;
        }
        
        // Oblicz szczegóły palet
        const palletData = calculatePalletWeights({
          quantity: quantity,
          unitWeight: inventoryData.weight || 0,
          itemsPerBox: inventoryData.itemsPerBox || 0,
          boxesPerPallet: inventoryData.boxesPerPallet || 0
        });
        
        // Oblicz szczegóły kartonów (tylko jeśli pozycja ma kartony)
        let boxData = { fullBox: null, partialBox: null, totalBoxes: 0 };
        if (inventoryData.itemsPerBox && inventoryData.itemsPerBox > 0) {
          boxData = calculateBoxWeights({
            quantity: quantity,
            unitWeight: inventoryData.weight || 0,
            itemsPerBox: inventoryData.itemsPerBox
          });
        }
        
        // Przygotuj dane do aktualizacji
        const updateData = {
          palletsCount: palletData.palletsCount,
          pallets: palletData.pallets,
          boxesCount: boxData.totalBoxes,
          boxes: boxData
        };
        
        updates.push({
          itemId: itemId,
          description: item.description || 'Bez opisu',
          updateData: updateData
        });
        
        console.log(`✅ Przygotowano aktualizację dla pozycji ${itemId}: ${palletData.palletsCount} palet, ${boxData.totalBoxes} kartonów`);
        
      } catch (itemError) {
        console.error(`❌ Błąd podczas przetwarzania pozycji ${itemId}:`, itemError);
        errorItems++;
        errors.push({
          itemId: itemId,
          error: itemError.message
        });
      }
    }
    
    // Wykonaj aktualizacje
    console.log(`\n📝 Wykonuję ${updates.length} aktualizacji...`);
    
    for (const update of updates) {
      try {
        const itemRef = doc(db, CMR_ITEMS_COLLECTION, update.itemId);
        await updateDoc(itemRef, update.updateData);
        console.log(`✓ Zaktualizowano pozycję ${update.itemId} (${update.description})`);
        updatedItems++;
      } catch (updateError) {
        console.error(`❌ Błąd podczas aktualizacji pozycji ${update.itemId}:`, updateError);
        errorItems++;
        errors.push({
          itemId: update.itemId,
          error: updateError.message
        });
      }
    }
    
    // Podsumowanie
    const summary = {
      success: true,
      total: totalItems,
      updated: updatedItems,
      skipped: skippedItems,
      errors: errorItems,
      errorDetails: errors
    };
    
    console.log('\n📊 Podsumowanie migracji:');
    console.log(`   Wszystkie pozycje: ${summary.total}`);
    console.log(`   Zaktualizowane: ${summary.updated}`);
    console.log(`   Pominięte: ${summary.skipped}`);
    console.log(`   Błędy: ${summary.errors}`);
    
    if (errors.length > 0) {
      console.log('\n❌ Szczegóły błędów:');
      errors.forEach(err => {
        console.log(`   - ${err.itemId}: ${err.error}`);
      });
    }
    
    return summary;
    
  } catch (error) {
    console.error('❌ Błąd podczas migracji pozycji CMR:', error);
    return {
      success: false,
      error: error.message,
      total: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      errorDetails: []
    };
  }
};

