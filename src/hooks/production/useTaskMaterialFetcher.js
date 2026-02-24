import { useCallback } from 'react';
import { getAllInventoryItems, getItemBatches, getInventoryBatch } from '../../services/inventory';
import { db } from '../../services/firebase/config';
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';

const CACHE_TTL = 30000; // 30 sekund

export const useTaskMaterialFetcher = ({
  task,
  id,
  currentUser,
  materials,
  materialQuantities,
  includeInCosts,
  consumedBatchPrices,
  setMaterialBatchesLoading,
  setBatches,
  setSelectedBatches,
  setLoadingPackaging,
  setPackagingItems,
  setMaterials,
  setTask,
  setAwaitingOrdersLoading,
  setAwaitingOrders,
  setConsumedBatchPrices,
  showSuccess,
  showError,
  showInfo,
  calculateWeightedUnitPrice,
  parallelDataCache,
}) => {

  const fetchBatchesForMaterialsOptimized = async () => {
    try {
      setMaterialBatchesLoading(true);
      if (!task || !task.materials) return;
      
      const batchesData = {};
      const initialSelectedBatches = {};
      
      // KROK 1: Pobierz wszystkie magazyny na początku (już zoptymalizowane)
      const { getAllWarehouses, getBatchesForMultipleItems, getReservationsForMultipleBatches } = await import('../../services/inventory');
      const allWarehouses = await getAllWarehouses();
      // Stwórz mapę magazynów dla szybkiego dostępu po ID
      const warehousesMap = {};
      allWarehouses.forEach(warehouse => {
        warehousesMap[warehouse.id] = warehouse.name;
      });
      
      // KROK 2: ✅ SUPER OPTYMALIZACJA - Grupowe pobieranie partii dla wszystkich materiałów JEDNOCZEŚNIE
      const materialIds = task.materials
        .map(material => material.inventoryItemId || material.id)
        .filter(Boolean);
      
      if (materialIds.length === 0) {
        setBatches(batchesData);
        setSelectedBatches(initialSelectedBatches);
        return;
      }
      
      // POJEDYNCZE GRUPOWE ZAPYTANIE dla wszystkich partii materiałów
      const materialBatchesMap = await getBatchesForMultipleItems(materialIds);
      
      // Zbierz wszystkie ID partii dla grupowego pobierania rezerwacji
      const allBatchIds = [];
      Object.values(materialBatchesMap).forEach(batches => {
        batches.forEach(batch => {
          if (batch.id && !allBatchIds.includes(batch.id)) {
            allBatchIds.push(batch.id);
          }
        });
      });
      

      
      // KROK 3: ✅ SUPER OPTYMALIZACJA - Grupowe pobieranie rezerwacji dla wszystkich partii JEDNOCZEŚNIE
      let allBatchReservationsMap = {};
      
      if (allBatchIds.length > 0) {
        // POJEDYNCZE GRUPOWE ZAPYTANIE dla wszystkich rezerwacji partii
        allBatchReservationsMap = await getReservationsForMultipleBatches(allBatchIds);
        

      }
      
      // KROK 4: Przetwórz dane i stwórz finalne struktury
      for (const material of task.materials) {
        const materialId = material.inventoryItemId || material.id;
        if (!materialId) continue;
        
        const batches = materialBatchesMap[materialId] || [];
        
        if (batches.length > 0) {
          // Dla każdej partii wzbogać o informacje o rezerwacjach i magazynie
          const batchesWithReservations = batches.map((batch) => {
            const reservations = allBatchReservationsMap[batch.id] || [];
            
            // Oblicz ilość zarezerwowaną przez inne zadania (z wyłączeniem bieżącego)
            const reservedByOthers = reservations.reduce((sum, reservation) => {
              if (reservation.taskId === id) return sum; // Pomiń rezerwacje bieżącego zadania
              return sum + (reservation.quantity || 0);
            }, 0);
            
            // Oblicz faktycznie dostępną ilość po uwzględnieniu rezerwacji
            const effectiveQuantity = Math.max(0, batch.quantity - reservedByOthers);
            
            // Przygotuj informacje o magazynie z prawidłową nazwą
            let warehouseInfo = {
              id: 'main',
              name: 'Magazyn główny'
            };
            
            if (batch.warehouseId) {
              // Pobierz nazwę magazynu z naszej mapy
              const warehouseName = warehousesMap[batch.warehouseId];
              warehouseInfo = {
                id: batch.warehouseId,
                name: warehouseName || `Magazyn ${batch.warehouseId.substring(0, 6)}`
              };
            }
            
            return {
              ...batch,
              reservedByOthers,
              effectiveQuantity,
              warehouseInfo
            };
          });
          
          batchesData[materialId] = batchesWithReservations;
          initialSelectedBatches[materialId] = [];
          
          // Sprawdź czy materiał ma już zarezerwowane partie w zadaniu
          const reservedBatches = task.materialBatches && task.materialBatches[materialId] 
            ? task.materialBatches[materialId] 
            : [];
          
          if (reservedBatches.length > 0) {
            // Dla każdej zarezerwowanej partii
            for (const reservedBatch of reservedBatches) {
              // Znajdź odpowiadającą partię w dostępnych partiach
              const matchingBatch = batchesWithReservations.find(b => b.id === reservedBatch.batchId);
              
              if (matchingBatch) {
                // Dodaj zarezerwowaną partię do wybranych partii
                initialSelectedBatches[materialId].push({
                  batchId: reservedBatch.batchId,
                  quantity: reservedBatch.quantity,
                  batchNumber: reservedBatch.batchNumber || matchingBatch.batchNumber || matchingBatch.lotNumber || 'Bez numeru'
                });
              }
            }
          }
        } else {
          batchesData[materialId] = [];
          initialSelectedBatches[materialId] = [];
        }
      }
      
      setBatches(batchesData);
      setSelectedBatches(initialSelectedBatches);
      

      
    } catch (error) {
      console.error('Błąd podczas pobierania partii dla materiałów:', error);
      showError('Nie udało się pobrać informacji o partiach materiałów');
    } finally {
      setMaterialBatchesLoading(false);
    }
  };

  // Zachowujemy starą funkcję dla kompatybilności wstecznej
  const fetchBatchesForMaterials = async () => {
    // Przekierowanie do nowej zoptymalizowanej funkcji
    await fetchBatchesForMaterialsOptimized();
  };

  const fetchAvailablePackaging = async () => {
    try {
      setLoadingPackaging(true);
      
      // Pobierz wszystkie pozycje magazynowe z odpowiednią strukturą danych zawierającą stany magazynowe
      const result = await getAllInventoryItems();
      
      // Upewniamy się, że mamy dostęp do właściwych danych
      const allItems = Array.isArray(result) ? result : result.items || [];
      
      // Filtrujemy tylko opakowania zbiorcze
      const packagingItems = allItems.filter(item => 
        item.category === 'Opakowania zbiorcze'
      );
      
      // Pobierz partie dla każdego opakowania
      const packagingWithBatches = await Promise.all(
        packagingItems.map(async (item) => {
          try {
            const batches = await getItemBatches(item.id);
            // Filtruj tylko partie z dostępną ilością > 0
            const availableBatches = batches.filter(batch => batch.quantity > 0);
            
            return {
              ...item,
              selected: false,
              quantity: 0,
              availableQuantity: item.currentQuantity || item.quantity || 0,
              unitPrice: item.unitPrice || item.price || 0,
              batches: availableBatches,
              selectedBatch: null,
              batchQuantity: 0
            };
          } catch (error) {
            console.error(`Błąd podczas pobierania partii dla opakowania ${item.name}:`, error);
            return {
              ...item,
              selected: false,
              quantity: 0,
              availableQuantity: item.currentQuantity || item.quantity || 0,
              unitPrice: item.unitPrice || item.price || 0,
              batches: [],
              selectedBatch: null,
              batchQuantity: 0
            };
          }
        })
      );
      
      setPackagingItems(packagingWithBatches);
    } catch (error) {
      console.error('Błąd podczas pobierania opakowań:', error);
      showError('Nie udało się pobrać listy opakowań: ' + error.message);
    } finally {
      setLoadingPackaging(false);
    }
  };

  // Funkcja do pobierania aktualnych cen partii i aktualizacji cen materiałów
  const updateMaterialPricesFromBatches = useCallback(async () => {
    if (!task || !task.materialBatches) return;
    
    try {
      // Tworzymy kopię materiałów, aby je zaktualizować
      const updatedMaterials = [...materials];
      let hasChanges = false;
      
      // Dla każdego materiału z przypisanymi partiami, obliczamy aktualną cenę
      for (const material of updatedMaterials) {
        const materialId = material.inventoryItemId || material.id;
        const reservedBatches = task.materialBatches && task.materialBatches[materialId];
        
        if (reservedBatches && reservedBatches.length > 0) {
          let totalCost = 0;
          let totalQuantity = 0;
          
          // Pobierz aktualne dane każdej partii i oblicz średnią ważoną cenę
          for (const batchReservation of reservedBatches) {
            try {
              const batchData = await getInventoryBatch(batchReservation.batchId);
              if (batchData) {
                const batchQuantity = parseFloat(batchReservation.quantity) || 0;
                const batchUnitPrice = parseFloat(batchData.unitPrice) || 0;
                
                totalCost += batchQuantity * batchUnitPrice;
                totalQuantity += batchQuantity;
                
                // Batch ${batchData.batchNumber}: ${batchQuantity} × ${batchUnitPrice}€
              }
            } catch (error) {
              console.error(`Błąd podczas pobierania danych partii ${batchReservation.batchId}:`, error);
            }
          }
          
          // Oblicz średnią ważoną cenę jednostkową
          if (totalQuantity > 0) {
            const averagePrice = totalCost / totalQuantity;
            // Sprawdź czy cena się zmieniła przed aktualizacją
            if (Math.abs(material.unitPrice - averagePrice) > 0.001) {
            material.unitPrice = averagePrice;
              hasChanges = true;
            }
          }
        }
      }
      
      // Aktualizuj stan materiałów tylko jeśli wykryto zmiany
      if (hasChanges) {
      setMaterials(updatedMaterials);
        
        // Tylko logowanie - NIE zapisujemy automatycznie do bazy danych
        if (task && updatedMaterials.length > 0) {
          // Oblicz całkowity koszt materiałów (tylko z flagą "wliczaj")
          const totalMaterialCost = updatedMaterials.reduce((sum, material) => {
            // Sprawdź czy dla tego materiału są zarezerwowane partie
            const materialId = material.inventoryItemId || material.id;
            const reservedBatches = task.materialBatches && task.materialBatches[materialId];
            
            // Uwzględnij koszt tylko jeśli materiał ma zarezerwowane partie i jest wliczany do kosztów
            if (reservedBatches && reservedBatches.length > 0 && includeInCosts[material.id]) {
              const quantity = materialQuantities[material.id] || material.quantity || 0;
              const materialId = material.inventoryItemId || material.id;
              const unitPrice = calculateWeightedUnitPrice(material, materialId);
              return sum + (quantity * unitPrice);
            }
            return sum;
          }, 0);
          
          // Oblicz pełny koszt produkcji (wszystkie materiały niezależnie od flagi "wliczaj")
          const totalFullProductionCost = updatedMaterials.reduce((sum, material) => {
            // Sprawdź czy dla tego materiału są zarezerwowane partie
            const materialId = material.inventoryItemId || material.id;
            const reservedBatches = task.materialBatches && task.materialBatches[materialId];
            
            // Uwzględnij koszt wszystkich materiałów z zarezerwowanymi partiami
            if (reservedBatches && reservedBatches.length > 0) {
              const quantity = materialQuantities[material.id] || material.quantity || 0;
              const unitPrice = calculateWeightedUnitPrice(material, materialId);
              return sum + (quantity * unitPrice);
            }
            return sum;
          }, 0);
          
          // Oblicz koszty na jednostkę
          const unitMaterialCost = task.quantity ? (totalMaterialCost / task.quantity) : 0;
          const unitFullProductionCost = task.quantity ? (totalFullProductionCost / task.quantity) : 0;
          
          // USUNIĘTO: Automatyczne zapisywanie do bazy danych
          // Użytkownik może ręcznie zaktualizować koszty przyciskiem "Aktualizuj ręcznie"
        }
      }
    } catch (error) {
      console.error('Błąd podczas aktualizacji cen materiałów:', error);
    }
  }, [task, materials, materialQuantities, id, currentUser, showSuccess, showError, includeInCosts, consumedBatchPrices]);

  // Funkcja do pobierania aktualnych cen skonsumowanych partii i aktualizacji cen w konsumpcjach
  const updateConsumedMaterialPricesFromBatches = useCallback(async () => {
    if (!task?.consumedMaterials || task.consumedMaterials.length === 0) {
      showError('Brak skonsumowanych materiałów do aktualizacji');
      return;
    }
    
    try {
      const { getInventoryBatch } = await import('../../services/inventory');
      let hasChanges = false;
      let updateCount = 0;
      let errorCount = 0;
      const updatedConsumedMaterials = [...task.consumedMaterials];
      const updateDetails = [];

      // Dla każdej konsumpcji, sprawdź aktualną cenę partii
      for (let i = 0; i < updatedConsumedMaterials.length; i++) {
        const consumed = updatedConsumedMaterials[i];
        
        if (!consumed.batchId) {
          console.warn(`⚠️ [PRICE-UPDATE] Konsumpcja ${i} nie ma batchId - pomijam`);
          continue;
        }

        try {
          const batchData = await getInventoryBatch(consumed.batchId);
          if (batchData && batchData.unitPrice !== undefined) {
            const currentPrice = consumed.unitPrice || 0;
            const newPrice = parseFloat(batchData.unitPrice) || 0;
            
            // Sprawdź czy cena się zmieniła przed aktualizacją (tolerancja 0.0001 = 4 miejsca po przecinku)
            if (Math.abs(currentPrice - newPrice) > 0.0001) {
              updatedConsumedMaterials[i] = {
                ...consumed,
                unitPrice: newPrice,
                priceUpdatedAt: new Date().toISOString(),
                priceUpdatedFrom: 'batch-price-sync'
              };
              hasChanges = true;
              updateCount++;
              
              const materialName = consumed.materialName || consumed.materialId || 'Nieznany materiał';
              const batchNumber = batchData.batchNumber || consumed.batchId;
              
              updateDetails.push({
                material: materialName,
                batch: batchNumber,
                oldPrice: currentPrice,
                newPrice: newPrice,
                quantity: consumed.quantity || 0
              });
            }
          } else {
            // 🔴 DIAGNOSTYKA: Szczegółowe info o brakującej partii - WSZYSTKO W JEDNYM LOGU
            console.warn(`⚠️ [PRICE-UPDATE] Brak ceny w partii ${consumed.batchId} | Materiał: ${consumed.materialName || consumed.materialId} | Ilość: ${consumed.quantity} | Cena w konsumpcji: ${consumed.unitPrice} | batchData:`, batchData, '| pełna konsumpcja:', consumed);
            errorCount++;
          }
        } catch (error) {
          console.error(`❌ [PRICE-UPDATE] Błąd podczas pobierania partii ${consumed.batchId}:`, error);
          errorCount++;
        }
      }

      // Aktualizuj dane zadania tylko jeśli wykryto zmiany cen
      if (hasChanges) {
        await updateDoc(doc(db, 'productionTasks', id), {
          consumedMaterials: updatedConsumedMaterials,
          updatedAt: serverTimestamp(),
          updatedBy: currentUser?.uid || 'system'
        });
        
        // Zaktualizuj lokalny stan
        setTask(prevTask => ({
          ...prevTask,
          consumedMaterials: updatedConsumedMaterials
        }));
        
        // Pokaż szczegółowy raport aktualizacji
        const successMessage = `Zaktualizowano ceny ${updateCount} konsumpcji. ${errorCount > 0 ? `Błędów: ${errorCount}` : ''}`;
        console.table(updateDetails);
        
        showSuccess(successMessage);
        
        // Automatyczna aktualizacja kosztów zostanie wywołana przez useEffect z dependency na task.consumedMaterials
      } else {
        const message = `Sprawdzono ${task.consumedMaterials.length} konsumpcji - wszystkie ceny są aktualne. ${errorCount > 0 ? `Błędów: ${errorCount}` : ''}`;
        showSuccess(message);
      }
    } catch (error) {
      console.error('❌ [PRICE-UPDATE] Błąd podczas aktualizacji cen skonsumowanych partii:', error);
      showError('Błąd podczas aktualizacji cen konsumpcji: ' + error.message);
    }
  }, [task?.consumedMaterials, id, currentUser, showSuccess, showError]);

  // Funkcja do aktualizacji związanych zamówień klientów po zmianie kosztów produkcji
  const updateRelatedCustomerOrders = async (taskData, totalMaterialCost, totalFullProductionCost, unitMaterialCost, unitFullProductionCost) => {
    try {
      if (!taskData || !taskData.id) return;
      
      // Importuj funkcje do zarządzania zamówieniami
      const { getAllOrders, updateOrder } = await import('../../services/orderService');
      const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/costCalculator');
      
      // Pobierz wszystkie zamówienia
      const allOrders = await getAllOrders();
      
      // Znajdź zamówienia, które mają pozycje powiązane z tym zadaniem produkcyjnym
      const relatedOrders = allOrders.filter(order => 
        order.items && order.items.some(item => item.productionTaskId === taskData.id)
      );
      
      if (relatedOrders.length === 0) {
        console.log('Nie znaleziono zamówień powiązanych z tym zadaniem');
        return;
      }
      
      // Dla każdego powiązanego zamówienia, zaktualizuj koszty produkcji
      for (const order of relatedOrders) {
        let orderUpdated = false;
        const updatedItems = [...order.items];
        
        for (let i = 0; i < updatedItems.length; i++) {
          const item = updatedItems[i];
          
          if (item.productionTaskId === taskData.id) {
            // Oblicz pełny koszt produkcji na jednostkę z uwzględnieniem logiki listy cenowej
            const calculatedFullProductionUnitCost = calculateFullProductionUnitCost(item, totalFullProductionCost);
            const calculatedProductionUnitCost = calculateProductionUnitCost(item, totalMaterialCost);
            
            // Zaktualizuj koszty w pozycji
            updatedItems[i] = {
              ...item,
              productionCost: totalMaterialCost,
              fullProductionCost: totalFullProductionCost,
              productionUnitCost: calculatedProductionUnitCost,
              fullProductionUnitCost: calculatedFullProductionUnitCost
            };
            orderUpdated = true;
          }
        }
        
        if (orderUpdated) {
          // Przelicz nową wartość zamówienia z uwzględnieniem zmienionych kosztów produkcji
          const calculateItemTotalValue = (item) => {
            const itemValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
            
            // Jeśli produkt jest z listy cenowej I ma cenę większą od 0, zwracamy tylko wartość pozycji
            if (item.fromPriceList && parseFloat(item.price || 0) > 0) {
              return itemValue;
            }
            
            // Jeśli produkt nie jest z listy cenowej LUB ma cenę 0, i ma koszt produkcji, dodajemy go
            if (item.productionTaskId && item.productionCost !== undefined) {
              return itemValue + parseFloat(item.productionCost || 0);
            }
            
            return itemValue;
          };

          // Oblicz nową wartość produktów
          const subtotal = (updatedItems || []).reduce((sum, item) => {
            return sum + calculateItemTotalValue(item);
          }, 0);

          // Zachowaj pozostałe składniki wartości zamówienia
          const shippingCost = parseFloat(order.shippingCost) || 0;
          const additionalCosts = order.additionalCostsItems ? 
            order.additionalCostsItems
              .filter(cost => parseFloat(cost.value) > 0)
              .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0) : 0;
          const discounts = order.additionalCostsItems ? 
            Math.abs(order.additionalCostsItems
              .filter(cost => parseFloat(cost.value) < 0)
              .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)) : 0;

          // Oblicz nową całkowitą wartość zamówienia
          const newTotalValue = subtotal + shippingCost + additionalCosts - discounts;

          // Zaktualizuj zamówienie w bazie danych - przekaż tylko niezbędne pola
          const updateData = {
            items: updatedItems,
            // Zaktualizowana wartość zamówienia
            totalValue: newTotalValue,
            // Zachowaj podstawowe pola wymagane przez walidację
            orderNumber: order.orderNumber,
            orderDate: order.orderDate, // Wymagane przez walidację
            status: order.status,
            // Inne pola które są bezpieczne
            customer: order.customer,
            shippingCost: order.shippingCost,
            additionalCostsItems: order.additionalCostsItems,
            productionTasks: order.productionTasks,
            linkedPurchaseOrders: order.linkedPurchaseOrders
          };
          
          console.log(`Aktualizuję zamówienie ${order.orderNumber} z danymi:`, {
            ...updateData,
            orderDate: updateData.orderDate ? 'obecna' : 'brak',
            itemsCount: updateData.items ? updateData.items.length : 0,
            oldTotalValue: order.totalValue,
            newTotalValue: newTotalValue
          });
          console.log(`UserID do aktualizacji: ${currentUser?.uid || 'brak'}`);
          await updateOrder(order.id, updateData, currentUser?.uid || 'system');
          
          console.log(`Zaktualizowano zamówienie ${order.orderNumber} - wartość zmieniona z ${order.totalValue}€ na ${newTotalValue}€`);
        }
      }
      
      showInfo(`Zaktualizowano koszty produkcji w ${relatedOrders.length} powiązanych zamówieniach`);
      
    } catch (error) {
      console.error('Błąd podczas aktualizacji powiązanych zamówień:', error);
      showError('Nie udało się zaktualizować powiązanych zamówień: ' + error.message);
    }
  };

  // 🔒 POPRAWKA: Funkcja do pobierania oczekiwanych zamówień dla materiałów
  const fetchAwaitingOrdersForMaterials = async (taskData = task, forceRefresh = false) => {
    const startTime = performance.now();
    console.log('🔵 [TaskDetails] fetchAwaitingOrdersForMaterials START', {
      materialsCount: taskData?.materials?.length || 0,
      forceRefresh
    });
    
    try {
      if (!taskData || !taskData.materials) {
        console.log('⏭️ [TaskDetails] fetchAwaitingOrdersForMaterials: brak materiałów');
        return;
      }
      setAwaitingOrdersLoading(true);
      
      const now = Date.now();
      const cached = parallelDataCache.current.awaitingOrders;
      const materialsHash = taskData.materials.map(m => m.inventoryItemId || m.id).sort().join(',');
      
      if (!forceRefresh && cached.data && cached.materialsHash === materialsHash && (now - cached.timestamp) < CACHE_TTL) {
        console.log('✅ [TaskDetails] Cache hit: awaitingOrders', {
          age: `${((now - cached.timestamp) / 1000).toFixed(1)}s`,
          duration: `${(performance.now() - startTime).toFixed(2)}ms`
        });
        setAwaitingOrders(cached.data);
        setAwaitingOrdersLoading(false);
        return;
      }
      
      const importStartTime = performance.now();
      const { getAwaitingOrdersForMultipleItems } = await import('../../services/inventory');
      console.log('✅ [TaskDetails] inventory service zaimportowany', {
        duration: `${(performance.now() - importStartTime).toFixed(2)}ms`
      });
      
      const materialIds = taskData.materials
        .map(m => m.inventoryItemId || m.id)
        .filter(Boolean);

      const fetchStartTime = performance.now();
      const ordersData = await getAwaitingOrdersForMultipleItems(materialIds);

      let totalOrders = 0;
      Object.values(ordersData).forEach(orders => { totalOrders += orders.length; });

      console.log('✅ [TaskDetails] Wszystkie zamówienia pobrane (batch)', {
        duration: `${(performance.now() - fetchStartTime).toFixed(2)}ms`,
        materialsProcessed: materialIds.length,
        totalOrders
      });
      
      parallelDataCache.current.awaitingOrders = {
        data: ordersData,
        timestamp: now,
        materialsHash
      };
      
      setAwaitingOrders(ordersData);
      
      console.log('✅ [TaskDetails] fetchAwaitingOrdersForMaterials COMPLETED', {
        totalDuration: `${(performance.now() - startTime).toFixed(2)}ms`,
        totalOrders,
        cached: false
      });
    } catch (error) {
      console.error('❌ [TaskDetails] fetchAwaitingOrdersForMaterials błąd', {
        duration: `${(performance.now() - startTime).toFixed(2)}ms`,
        error
      });
      showError('Nie udało się pobrać informacji o oczekiwanych zamówieniach');
    } finally {
      setAwaitingOrdersLoading(false);
    }
  };

  const fetchConsumedBatchPrices = async () => {
    if (!task?.consumedMaterials || task.consumedMaterials.length === 0) {
      return;
    }

    try {
      const { getInventoryBatch } = await import('../../services/inventory');
      const batchPrices = {};
      let needsTaskUpdate = false;
      let needsCostUpdate = false;
      const updatedConsumedMaterials = [...task.consumedMaterials];

      for (let i = 0; i < task.consumedMaterials.length; i++) {
        const consumed = task.consumedMaterials[i];
        try {
          const batch = await getInventoryBatch(consumed.batchId);
          if (batch) {
            if (batch.unitPrice) {
              batchPrices[consumed.batchId] = batch.unitPrice;
              
              // Sprawdź czy cena w konsumpcji się zmieniła
              const currentPrice = consumed.unitPrice || 0;
              const newPrice = batch.unitPrice;
              
              if (Math.abs(currentPrice - newPrice) > 0.001) {
                console.log(`Aktualizuję cenę dla skonsumowanej partii ${batch.batchNumber || consumed.batchId}: ${currentPrice.toFixed(4)}€ -> ${newPrice.toFixed(4)}€`);
                updatedConsumedMaterials[i] = {
                  ...consumed,
                  unitPrice: newPrice,
                  priceUpdatedAt: new Date().toISOString(),
                  priceUpdatedFrom: 'batch-sync'
                };
                needsTaskUpdate = true;
                needsCostUpdate = true;
              }
            }
            
            // Jeśli konsumpcja nie ma zapisanego numeru partii, zaktualizuj go
            if (!consumed.batchNumber && (batch.lotNumber || batch.batchNumber)) {
              const newBatchNumber = batch.lotNumber || batch.batchNumber;
              console.log(`Aktualizuję numer partii dla konsumpcji ${i}: ${consumed.batchId} -> ${newBatchNumber}`);
              updatedConsumedMaterials[i] = {
                ...updatedConsumedMaterials[i], // Zachowaj poprzednie zmiany
                batchNumber: newBatchNumber
              };
              needsTaskUpdate = true;
            } else if (consumed.batchNumber === consumed.batchId && (batch.lotNumber || batch.batchNumber)) {
              // Sprawdź czy zapisany batchNumber to w rzeczywistości ID - wtedy też zaktualizuj
              const newBatchNumber = batch.lotNumber || batch.batchNumber;
              if (newBatchNumber !== consumed.batchNumber) {
                console.log(`Naprawiam błędny numer partii (ID jako numer): ${consumed.batchNumber} -> ${newBatchNumber}`);
                updatedConsumedMaterials[i] = {
                  ...updatedConsumedMaterials[i], // Zachowaj poprzednie zmiany
                  batchNumber: newBatchNumber
                };
                needsTaskUpdate = true;
              }
            }
          }
        } catch (error) {
          console.error(`Błąd podczas pobierania danych partii ${consumed.batchId}:`, error);
        }
      }

      setConsumedBatchPrices(batchPrices);
      
      // Jeśli trzeba zaktualizować dane zadania
      if (needsTaskUpdate) {
        try {
          await updateDoc(doc(db, 'productionTasks', id), {
            consumedMaterials: updatedConsumedMaterials,
            updatedAt: serverTimestamp()
          });
          
          // Zaktualizuj lokalny stan
          setTask(prevTask => ({
            ...prevTask,
            consumedMaterials: updatedConsumedMaterials
          }));
          
          if (needsCostUpdate) {
            console.log('Wykryto zmiany cen skonsumowanych partii - zaktualizowano dane zadania');
            // Automatyczna aktualizacja kosztów zostanie wywołana przez useEffect z dependency na task.consumedMaterials
          } else {
            console.log('Zaktualizowano numery partii w danych zadania');
          }
        } catch (error) {
          console.error('Błąd podczas aktualizacji danych skonsumowanych partii:', error);
        }
      }
    } catch (error) {
      console.error('Błąd podczas pobierania cen skonsumowanych partii:', error);
    }
  };

  const enrichConsumedMaterialsData = async (consumedMaterials) => {
    if (!consumedMaterials || consumedMaterials.length === 0) {
      return consumedMaterials;
    }

    try {
      const { getBatchesByIds } = await import('../../services/inventory');

      // 1. Batch-fetch wszystkich partii naraz
      const batchIds = consumedMaterials.map(c => c.batchId).filter(Boolean);
      const batchesMap = await getBatchesByIds(batchIds);

      // 2. Zbierz unikalne inventoryItemId z partii, dla których brakuje nazwy/jednostki
      const neededItemIds = new Set();
      consumedMaterials.forEach(consumed => {
        if (!consumed.batchId) return;
        const batchData = batchesMap.get(consumed.batchId);
        if (batchData?.inventoryItemId && (!consumed.materialName || !consumed.unit)) {
          neededItemIds.add(batchData.inventoryItemId);
        }
      });

      // 3. Batch-fetch pozycji magazynowych (Firestore 'in' query, batche po 10)
      const inventoryItemsMap = new Map();
      if (neededItemIds.size > 0) {
        const idsArray = Array.from(neededItemIds);
        const { db: dbRef } = await import('../../services/firebase/config');
        const { collection: col, query: q, where: w, getDocs: gd } = await import('firebase/firestore');
        
        for (let i = 0; i < idsArray.length; i += 10) {
          const chunk = idsArray.slice(i, i + 10);
          try {
            const snapshot = await gd(q(col(dbRef, 'inventory'), w('__name__', 'in', chunk)));
            snapshot.forEach(docSnap => {
              inventoryItemsMap.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
            });
          } catch (error) {
            console.warn('Błąd batch-fetch inventory items w enrichConsumedMaterialsData:', error);
          }
        }
      }

      // 4. Wzbogać consumed materials korzystając z pobranych danych
      return consumedMaterials.map(consumed => {
        let enriched = { ...consumed };
        if (!consumed.batchId) return enriched;

        const batchData = batchesMap.get(consumed.batchId);
        if (!batchData) return enriched;

        if (!enriched.expiryDate && batchData.expiryDate) {
          enriched.expiryDate = batchData.expiryDate;
        }
        if (!enriched.unitPrice && batchData.unitPrice) {
          enriched.unitPrice = batchData.unitPrice;
        }

        if (batchData.lotNumber || batchData.batchNumber) {
          const correctBatchNumber = batchData.lotNumber || batchData.batchNumber;
          if (enriched.batchNumber !== correctBatchNumber) {
            enriched.batchNumber = correctBatchNumber;
            enriched.lotNumber = batchData.lotNumber || batchData.batchNumber;
          }
        }

        if (batchData.inventoryItemId) {
          const inventoryItem = inventoryItemsMap.get(batchData.inventoryItemId);
          if (inventoryItem) {
            if (!enriched.materialName) enriched.materialName = inventoryItem.name;
            if (!enriched.unit) enriched.unit = inventoryItem.unit;
          }
        }

        return enriched;
      });
    } catch (error) {
      console.warn('Błąd w enrichConsumedMaterialsData (batch):', error);
      return consumedMaterials;
    }
  };

  return {
    fetchBatchesForMaterialsOptimized,
    fetchBatchesForMaterials,
    fetchAvailablePackaging,
    fetchAwaitingOrdersForMaterials,
    updateMaterialPricesFromBatches,
    updateConsumedMaterialPricesFromBatches,
    fetchConsumedBatchPrices,
    enrichConsumedMaterialsData,
    updateRelatedCustomerOrders,
  };
};
