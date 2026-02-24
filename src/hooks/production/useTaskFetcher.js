import { useCallback, useRef } from 'react';
import { db } from '../../services/firebase/config';
import { getDoc, doc, collection, query, where, getDocs, limit, orderBy } from 'firebase/firestore';
import { getTaskById, getProductionHistory } from '../../services/productionService';
import { getProductionDataForHistory, getAvailableMachines } from '../../services/machineDataService';
import { getRecipeVersion } from '../../services/recipeService';
import { getIngredientReservationLinks } from '../../services/mixingPlanReservationService';
import { preciseMultiply } from '../../utils/mathUtils';

const CACHE_TTL = 30000; // 30 sekund

export const useTaskFetcher = ({
  id,
  task,
  productionHistory,
  selectedMachineId,
  setLoading,
  setTask,
  setMaterials,
  setMaterialQuantities,
  setIncludeInCosts,
  setPOReservations,
  setPoRefreshTrigger,
  setIngredientReservationLinks,
  setProductionHistory,
  setEnrichedProductionHistory,
  setWarehousesLoading,
  setWarehouses,
  setHistoryInventoryData,
  setAvailableMachines,
  setSelectedMachineId,
  setFormResponses,
  setLoadingFormResponses,
  showError,
  navigate,
  fetchUserNames,
}) => {
  const parallelDataCache = useRef({
    poReservations: { data: null, timestamp: 0 },
    formResponses: { data: null, timestamp: 0, moNumber: null },
    awaitingOrders: { data: null, timestamp: 0, materialsHash: null }
  });

  // Ref for late-bound dependencies defined after this hook in the component
  const lateDepsRef = useRef({
    fetchAwaitingOrdersForMaterials: null,
    fetchBatchesForMaterialsOptimized: null,
    enrichConsumedMaterialsData: null,
  });

  const setLateDeps = useCallback((deps) => {
    Object.assign(lateDepsRef.current, deps);
  }, []);

  const fetchFormResponsesOptimized = useCallback(async (moNumber, forceRefresh = false) => {
    const startTime = performance.now();
    console.log('🔵 [TaskDetails] fetchFormResponsesOptimized START', {
      moNumber,
      forceRefresh
    });
    
    if (!moNumber) {
      console.log('⏭️ [TaskDetails] fetchFormResponsesOptimized: brak MO number');
      return { completedMO: [], productionControl: [], productionShift: [] };
    }
    
    try {
      // ⚡ OPTYMALIZACJA: Sprawdź cache
      const now = Date.now();
      const cached = parallelDataCache.current.formResponses;
      
      if (!forceRefresh && cached.data && cached.moNumber === moNumber && (now - cached.timestamp) < CACHE_TTL) {
        console.log('✅ [TaskDetails] Cache hit: formResponses', {
          age: `${((now - cached.timestamp) / 1000).toFixed(1)}s`,
          duration: `${(performance.now() - startTime).toFixed(2)}ms`
        });
        return cached.data;
      }
      
      // ✅ OPTYMALIZACJA: Równoległe pobieranie z limitami i sortowaniem
      const queriesStartTime = performance.now();
      const [completedMOSnapshot, controlSnapshot, shiftSnapshot] = await Promise.all([
        getDocs(query(
          collection(db, 'Forms/SkonczoneMO/Odpowiedzi'), 
          where('moNumber', '==', moNumber),
          orderBy('date', 'desc'), // Sortowanie od najnowszych
          limit(50) // Limit ostatnich 50 odpowiedzi
        )),
        getDocs(query(
          collection(db, 'Forms/KontrolaProdukcji/Odpowiedzi'), 
          where('manufacturingOrder', '==', moNumber),
          orderBy('fillDate', 'desc'), // Sortowanie od najnowszych
          limit(50) // Limit ostatnich 50 odpowiedzi
        )),
        getDocs(query(
          collection(db, 'Forms/ZmianaProdukcji/Odpowiedzi'), 
          where('moNumber', '==', moNumber),
          orderBy('fillDate', 'desc'), // Sortowanie od najnowszych
          limit(50) // Limit ostatnich 50 odpowiedzi
        ))
      ]);
      
      console.log('✅ [TaskDetails] Formularze pobrane z Firestore', {
        duration: `${(performance.now() - queriesStartTime).toFixed(2)}ms`,
        completedMO: completedMOSnapshot.size,
        control: controlSnapshot.size,
        shift: shiftSnapshot.size
      });

      const mappingStartTime = performance.now();
      const completedMOData = completedMOSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate(),
        formType: 'completedMO'
      }));

      const controlData = controlSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fillDate: doc.data().fillDate?.toDate(),
        productionStartDate: doc.data().productionStartDate?.toDate(),
        productionEndDate: doc.data().productionEndDate?.toDate(),
        readingDate: doc.data().readingDate?.toDate(),
        formType: 'productionControl'
      }));

      const shiftData = shiftSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fillDate: doc.data().fillDate?.toDate(),
        formType: 'productionShift'
      }));

      console.log('✅ [TaskDetails] Formularze zmapowane', {
        duration: `${(performance.now() - mappingStartTime).toFixed(2)}ms`
      });
      
      // ✅ OPTYMALIZACJA: Sortowanie już wykonane w zapytaniu Firebase
      // Nie trzeba dodatkowo sortować po stronie klienta
      
      const result = {
        completedMO: completedMOData,
        productionControl: controlData,
        productionShift: shiftData
      };
      
      // Zapisz w cache
      parallelDataCache.current.formResponses = {
        data: result,
        timestamp: now,
        moNumber
      };
      
      console.log('✅ [TaskDetails] fetchFormResponsesOptimized COMPLETED', {
        totalDuration: `${(performance.now() - startTime).toFixed(2)}ms`,
        totalForms: completedMOData.length + controlData.length + shiftData.length,
        cached: false
      });
      
      return result;
    } catch (error) {
      console.error('❌ [TaskDetails] fetchFormResponsesOptimized błąd', {
        duration: `${(performance.now() - startTime).toFixed(2)}ms`,
        error
      });
      throw error;
    }
  }, []);

  const fetchAllTaskData = useCallback(async () => {
    const startTime = performance.now();
    console.log('🔵 [TaskDetails] fetchAllTaskData START (FALLBACK)', {
      taskId: id,
      timestamp: new Date().toISOString()
    });
    
    try {
      setLoading(true);
      
      // KROK 1: Pobierz podstawowe dane zadania (musi być pierwsze)
      const step1Start = performance.now();
      const fetchedTask = await getTaskById(id);
      console.log('✅ [TaskDetails] KROK 1: getTaskById', {
        duration: `${(performance.now() - step1Start).toFixed(2)}ms`,
        taskId: fetchedTask.id
      });
      
      setTask(fetchedTask);
      
      // KROK 2: Przetwórz materiały z grupowym pobieraniem pozycji magazynowych (z Etapu 1)
      const step2Start = performance.now();
      if (fetchedTask?.materials?.length > 0) {
        console.log('🔵 [TaskDetails] KROK 2: Przetwarzanie materiałów', {
          materialsCount: fetchedTask.materials.length
        });
        
        // ✅ OPTYMALIZACJA ETAP 1: Grupowe pobieranie pozycji magazynowych zamiast N+1 zapytań
        
        // Zbierz wszystkie ID pozycji magazynowych z materiałów
        const inventoryItemIds = fetchedTask.materials
          .map(material => material.inventoryItemId)
          .filter(Boolean); // Usuń undefined/null wartości
        
        let inventoryItemsMap = new Map();
        
        if (inventoryItemIds.length > 0) {
          // Firebase "in" operator obsługuje maksymalnie 10 elementów na zapytanie
          const batchSize = 10;
          
          for (let i = 0; i < inventoryItemIds.length; i += batchSize) {
            const batch = inventoryItemIds.slice(i, i + batchSize);
            
            try {
              // Grupowe pobieranie pozycji magazynowych dla batcha
              const itemsQuery = query(
                collection(db, 'inventory'),
                where('__name__', 'in', batch)
              );
              
              const itemsSnapshot = await getDocs(itemsQuery);
              
              // Dodaj pobrane pozycje do mapy
              itemsSnapshot.forEach(doc => {
                inventoryItemsMap.set(doc.id, {
                  id: doc.id,
                  ...doc.data()
                });
              });
            } catch (error) {
              console.error(`Błąd podczas grupowego pobierania pozycji magazynowych (batch ${i}-${i+batchSize}):`, error);
              // Kontynuuj z następnym batchem, nie przerywaj całego procesu
            }
          }
          

        }
        
        // Przygotuj listę materiałów z aktualnymi cenami
        const materialsList = fetchedTask.materials.map(material => {
          let updatedMaterial = { ...material };
          
          // Jeśli materiał ma powiązanie z pozycją magazynową, użyj danych z mapy
          if (material.inventoryItemId && inventoryItemsMap.has(material.inventoryItemId)) {
            const inventoryItem = inventoryItemsMap.get(material.inventoryItemId);
            updatedMaterial.unitPrice = inventoryItem.unitPrice || inventoryItem.price || 0;
          }
          
          return {
            ...updatedMaterial,
            plannedQuantity: preciseMultiply(updatedMaterial.quantity || 0, fetchedTask.quantity || 1)
          };
        });
        
        setMaterials(materialsList);
        
        // Inicjalizacja rzeczywistych ilości
        const quantities = {};
        materialsList.forEach(material => {
          // Pobierz actualQuantity z danych zadania lub użyj plannedQuantity jako wartości domyślnej
          const actualQuantity = fetchedTask.actualMaterialUsage && fetchedTask.actualMaterialUsage[material.id] !== undefined
            ? fetchedTask.actualMaterialUsage[material.id]
            : material.quantity;
          
          quantities[material.id] = actualQuantity;
        });
        
        setMaterialQuantities(quantities);
        
        // Inicjalizacja stanu includeInCosts - domyślnie wszystkie materiały są wliczane do kosztów
        const costsInclude = {};
        materialsList.forEach(material => {
          costsInclude[material.id] = fetchedTask.materialInCosts && fetchedTask.materialInCosts[material.id] !== undefined
            ? fetchedTask.materialInCosts[material.id]
            : true;
        });
        
        setIncludeInCosts(costsInclude);
        
        console.log('✅ [TaskDetails] KROK 2: Materiały przetworzone', {
          duration: `${(performance.now() - step2Start).toFixed(2)}ms`,
          materialsCount: fetchedTask.materials.length
        });
      }
      
      // KROK 2.5: ✅ Wzbogać dane skonsumowanych materiałów o informacje z partii magazynowych
      if (fetchedTask?.consumedMaterials?.length > 0) {
        const step25Start = performance.now();
        console.log('🔵 [TaskDetails] KROK 2.5: Wzbogacanie consumed materials', {
          consumedCount: fetchedTask.consumedMaterials.length
        });
        
        try {
          const enrichedConsumedMaterials = await lateDepsRef.current.enrichConsumedMaterialsData(fetchedTask.consumedMaterials);
          fetchedTask.consumedMaterials = enrichedConsumedMaterials;
          setTask(prevTask => ({
            ...prevTask,
            consumedMaterials: enrichedConsumedMaterials
          }));
          
          console.log('✅ [TaskDetails] KROK 2.5: Consumed materials wzbogacone', {
            duration: `${(performance.now() - step25Start).toFixed(2)}ms`
          });
        } catch (error) {
          console.warn('⚠️ Nie udało się wzbogacić danych skonsumowanych materiałów:', error);
        }
      }
      
      // KROK 3: ✅ OPTYMALIZACJA ETAP 3: Ładowanie tylko podstawowych danych (Selective Data Loading)
      const step3Start = performance.now();
      console.log('🔵 [TaskDetails] KROK 3: Równoległe ładowanie dodatkowych danych');
      
      const dataLoadingPromises = [];
      
      // Rezerwacje PO - zawsze potrzebne dla zakładki materiałów
      if (fetchedTask?.id) {
        dataLoadingPromises.push(
          import('../../services/poReservationService')
            .then(module => module.getPOReservationsForTask(fetchedTask.id))
            .then(reservations => ({ type: 'poReservations', data: reservations || [] }))
            .catch(error => {
              console.error('Błąd podczas pobierania rezerwacji PO:', error);
              return { type: 'poReservations', data: [] };
            })
        );
      }
      
      // Dane wersji receptury - potrzebne dla podstawowych informacji
      if (fetchedTask?.recipeId && fetchedTask?.recipeVersion) {
        dataLoadingPromises.push(
          getRecipeVersion(fetchedTask.recipeId, fetchedTask.recipeVersion)
            .then(recipeVersion => ({ type: 'recipeVersion', data: recipeVersion }))
            .catch(error => {
              console.error('Błąd podczas pobierania wersji receptury:', error);
              return { type: 'recipeVersion', data: null };
            })
        );
      }
      
      // Oczekujące zamówienia dla materiałów - potrzebne dla zakładki materiałów
      if (fetchedTask?.materials?.length > 0) {
        dataLoadingPromises.push(
          lateDepsRef.current.fetchAwaitingOrdersForMaterials()
            .then(() => ({ type: 'awaitingOrders', data: 'loaded' }))
            .catch(error => {
              console.error('Błąd podczas pobierania oczekujących zamówień:', error);
              return { type: 'awaitingOrders', data: 'error' };
            })
        );
      }
      
      // Wykonaj wszystkie zapytania równolegle
      if (dataLoadingPromises.length > 0) {
        console.log('🔄 [TaskDetails] Wykonywanie równoległych zapytań', {
          promisesCount: dataLoadingPromises.length
        });
        
        const results = await Promise.all(dataLoadingPromises);
        
        console.log('✅ [TaskDetails] KROK 3: Równoległe ładowanie zakończone', {
          duration: `${(performance.now() - step3Start).toFixed(2)}ms`,
          resultsCount: results.length
        });
        
        // Przetwórz wyniki i ustaw stany (tylko podstawowe dane)
        results.forEach(result => {
          switch (result.type) {
            case 'recipeVersion':
              if (result.data && result.data.data) {
                // Dodaj dane wersji receptury do obiektu task
                setTask(prevTask => ({
                  ...prevTask,
                  recipe: result.data.data // result.data.data zawiera pełne dane receptury z tej wersji
                }));
              }
              break;
            case 'awaitingOrders':
              // Oczekujące zamówienia są już ustawione w funkcji fetchAwaitingOrdersForMaterials
              break;
            case 'poReservations':
              setPOReservations(result.data);
              break;
          }
        });
      } else {
        console.log('⏭️ [TaskDetails] KROK 3: Brak dodatkowych danych do załadowania');
      }
      
      // ⚡ OPTYMALIZACJA: KROK 4 - Pobierz tylko podstawowe nazwy użytkowników (bez historii produkcji)
      // Historia produkcji będzie ładowana lazy load gdy zakładka jest aktywna
      if (fetchedTask?.id) {
        try {
          // Zbierz ID użytkowników z podstawowych źródeł (bez historii produkcji)
          const basicUserIds = new Set();
          
          // Dodaj użytkowników z historii statusów
          fetchedTask.statusHistory?.forEach(change => {
            if (change.changedBy) basicUserIds.add(change.changedBy);
          });
          
          // Dodaj użytkowników z materiałów skonsumowanych
          fetchedTask.consumedMaterials?.forEach(consumed => {
            if (consumed.userId) basicUserIds.add(consumed.userId);
            if (consumed.createdBy) basicUserIds.add(consumed.createdBy);
          });
          
          // Dodaj użytkowników z historii kosztów
          fetchedTask.costHistory?.forEach(costChange => {
            if (costChange.userId) basicUserIds.add(costChange.userId);
          });
          
          // Pobierz podstawowe nazwy użytkowników (bez historii produkcji - załadowane później)
          if (basicUserIds.size > 0) {
            await fetchUserNames([...basicUserIds]);
          }
        } catch (error) {
          console.error('Błąd podczas pobierania podstawowych nazw użytkowników:', error);
        }
      }
      
      // ⚡ OPTYMALIZACJA: FAZA 2 - Ważne dane (opóźnione o 100ms dla lepszego UX)
      setTimeout(async () => {
        try {
          const importantPromises = [];
          
          // Rezerwacje PO - już załadowane w KROK 3, ale możemy dodać tutaj inne ważne dane
          // jeśli potrzebne
          
          await Promise.allSettled(importantPromises);
        } catch (error) {
          console.error('Błąd podczas ładowania ważnych danych:', error);
        }
      }, 100);
      
      console.log('✅ [TaskDetails] fetchAllTaskData COMPLETED', {
        totalDuration: `${(performance.now() - startTime).toFixed(2)}ms`
      });
    } catch (error) {
      console.error('❌ [TaskDetails] fetchAllTaskData błąd', {
        duration: `${(performance.now() - startTime).toFixed(2)}ms`,
        error
      });
      showError('Nie udało się pobrać danych zadania: ' + error.message);
      navigate('/production');
    } finally {
      setLoading(false);
    }
  }, [id, setLoading, setTask, setMaterials, setMaterialQuantities, setIncludeInCosts, setPOReservations, showError, navigate, fetchUserNames]);

  const fetchTask = useCallback(async () => {
    // Przekierowanie do nowej zoptymalizowanej funkcji
    await fetchAllTaskData();
  }, [fetchAllTaskData]);

  const refreshTaskReservations = useCallback(async () => {
    try {
      // Pobierz tylko podstawowe dane zadania (bez cache, bezpośrednio z serwera)
      const taskRef = doc(db, 'productionTasks', id);
      const taskSnapshot = await getDoc(taskRef);
      
      if (!taskSnapshot.exists()) {
        throw new Error('Zadanie nie istnieje');
      }
      
      const freshTaskData = {
        id: taskSnapshot.id,
        ...taskSnapshot.data()
      };
      
      // Aktualizuj tylko kluczowe pola związane z rezerwacjami i konsumpcją
      setTask(prevTask => ({
        ...prevTask,
        materialBatches: freshTaskData.materialBatches || {},
        consumedMaterials: freshTaskData.consumedMaterials || [],
        materialsReserved: freshTaskData.materialsReserved || false,
        updatedAt: freshTaskData.updatedAt,
        // Zachowaj inne pola bez zmian
        updatedBy: freshTaskData.updatedBy
      }));
      
    } catch (error) {
      console.error('❌ Błąd podczas selektywnego odświeżania:', error);
      showError('Nie udało się odświeżyć danych rezerwacji: ' + error.message);
      // Fallback do pełnego odświeżenia tylko w przypadku krytycznego błędu
      // await fetchAllTaskData();
    }
  }, [id, setTask, showError]);

  const fetchPOReservations = useCallback(async (forceRefresh = false) => {
    const startTime = performance.now();
    console.log('🔵 [TaskDetails] fetchPOReservations START', {
      taskId: id,
      forceRefresh
    });
    
    try {
      // ⚡ OPTYMALIZACJA: Sprawdź cache
      const now = Date.now();
      const cached = parallelDataCache.current.poReservations;
      
      if (!forceRefresh && cached.data && (now - cached.timestamp) < CACHE_TTL) {
        console.log('✅ [TaskDetails] Cache hit: poReservations', {
          age: `${((now - cached.timestamp) / 1000).toFixed(1)}s`,
          duration: `${(performance.now() - startTime).toFixed(2)}ms`
        });
        setPOReservations(cached.data);
        setPoRefreshTrigger(prev => prev + 1);
        return;
      }
      
      const importStartTime = performance.now();
      const { getPOReservationsForTask } = await import('../../services/poReservationService');
      console.log('✅ [TaskDetails] poReservationService zaimportowany', {
        duration: `${(performance.now() - importStartTime).toFixed(2)}ms`
      });
      
      const fetchStartTime = performance.now();
      const reservations = await getPOReservationsForTask(id);
      console.log('✅ [TaskDetails] Rezerwacje PO pobrane z serwera', {
        duration: `${(performance.now() - fetchStartTime).toFixed(2)}ms`,
        count: reservations?.length || 0
      });
      
      // Zapisz w cache
      parallelDataCache.current.poReservations = {
        data: reservations,
        timestamp: now
      };
      
      setPOReservations(reservations);
      setPoRefreshTrigger(prev => prev + 1); // Zwiększ trigger aby wymusić odświeżenie POReservationManager
      
      console.log('✅ [TaskDetails] fetchPOReservations COMPLETED', {
        totalDuration: `${(performance.now() - startTime).toFixed(2)}ms`,
        cached: false
      });
    } catch (error) {
      console.error('❌ [TaskDetails] fetchPOReservations błąd', {
        duration: `${(performance.now() - startTime).toFixed(2)}ms`,
        error
      });
      // Nie pokazujemy błędu użytkownikowi - to nie jest krytyczne
    }
  }, [id, setPOReservations, setPoRefreshTrigger]);

  const fetchIngredientReservationLinks = useCallback(async () => {
    if (!task?.id) return;
    
    try {
      const links = await getIngredientReservationLinks(task.id);
      setIngredientReservationLinks(links);
    } catch (error) {
      console.error('Błąd podczas pobierania powiązań składników:', error);
    }
  }, [task?.id, setIngredientReservationLinks]);

  const fetchTaskBasicData = useCallback(async () => {
    try {
      // Pobierz tylko podstawowe dane zadania bez pokazywania wskaźnika ładowania
      const fetchedTask = await getTaskById(id);
      setTask(fetchedTask);
      
      // Jeśli zadanie ma materiały, odśwież tylko dane materiałów
      if (fetchedTask?.materials?.length > 0) {
        await lateDepsRef.current.fetchBatchesForMaterialsOptimized();
      }
      
      // Odśwież również rezerwacje PO
      await fetchPOReservations();
    } catch (error) {
      console.error('Błąd podczas odświeżania podstawowych danych zadania:', error);
      showError('Nie udało się odświeżyć danych zadania: ' + error.message);
    }
  }, [id, setTask, fetchPOReservations, showError]);

  // 🔒 POPRAWKA: Funkcja do pobierania historii produkcji
  // Przyjmuje taskId jako parametr zamiast używać task z closure aby uniknąć stałych danych
  const fetchProductionHistory = useCallback(async (taskId = task?.id) => {
    if (!taskId) {
      return; // Zabezpieczenie przed błędami null/undefined
    }
    try {
      const history = await getProductionHistory(taskId);
      setProductionHistory(history || []);
      
      // Pobierz nazwy użytkowników z historii produkcji
      const userIds = history?.map(session => session.userId).filter(Boolean) || [];
      if (userIds.length > 0) {
        await fetchUserNames(userIds);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania historii produkcji:', error);
      setProductionHistory([]);
    }
  }, [task?.id, setProductionHistory, fetchUserNames]);

  const fetchWarehouses = useCallback(async () => {
    try {
      setWarehousesLoading(true);
      const { getAllWarehouses } = await import('../../services/inventory');
      const warehousesList = await getAllWarehouses();
      setWarehouses(warehousesList);
      
      // Jeśli jest przynajmniej jeden magazyn, ustaw go jako domyślny
      if (warehousesList.length > 0) {
        setHistoryInventoryData(prev => ({
          ...prev,
          warehouseId: warehousesList[0].id
        }));
      }
    } catch (error) {
      console.error('Błąd podczas pobierania magazynów:', error);
    } finally {
      setWarehousesLoading(false);
    }
  }, [setWarehousesLoading, setWarehouses, setHistoryInventoryData]);

  const fetchAvailableMachines = useCallback(async () => {
    try {
      const machines = await getAvailableMachines();
      setAvailableMachines(machines);
      
      // Jeśli zadanie ma workstationId, spróbuj znaleźć odpowiadającą maszynę
      if (task?.workstationId && machines.length > 0) {
        // Możemy użyć workstationId jako machineId lub znaleźć maszynę na podstawie nazwy
        const machineForWorkstation = machines.find(machine => 
          machine.id === task.workstationId || 
          machine.name.toLowerCase().includes(task.workstationId.toLowerCase())
        );
        
        if (machineForWorkstation) {
          setSelectedMachineId(machineForWorkstation.id);
        }
      }
    } catch (error) {
      console.error('Błąd podczas pobierania maszyn:', error);
    }
  }, [task?.workstationId, setAvailableMachines, setSelectedMachineId]);

  const enrichProductionHistoryWithMachineData = useCallback(async () => {
    if (!selectedMachineId || !productionHistory || productionHistory.length === 0) {
      setEnrichedProductionHistory(productionHistory || []);
      return;
    }

    try {
      const enrichedHistory = await getProductionDataForHistory(selectedMachineId, productionHistory);
      setEnrichedProductionHistory(enrichedHistory);
    } catch (error) {
      console.error('Błąd podczas wzbogacania historii produkcji:', error);
      setEnrichedProductionHistory(productionHistory || []);
    }
  }, [selectedMachineId, productionHistory, setEnrichedProductionHistory]);

  const fetchFormResponses = useCallback(async (moNumber) => {
    if (!moNumber) return;
    
    setLoadingFormResponses(true);
    try {
      // ✅ OPTYMALIZACJA: Równoległe pobieranie z limitami i sortowaniem
      const [completedMOSnapshot, controlSnapshot, shiftSnapshot] = await Promise.all([
        getDocs(query(
          collection(db, 'Forms/SkonczoneMO/Odpowiedzi'), 
          where('moNumber', '==', moNumber),
          orderBy('date', 'desc'), // Sortowanie od najnowszych
          limit(50) // Limit ostatnich 50 odpowiedzi
        )),
        getDocs(query(
          collection(db, 'Forms/KontrolaProdukcji/Odpowiedzi'), 
          where('manufacturingOrder', '==', moNumber),
          orderBy('fillDate', 'desc'), // Sortowanie od najnowszych
          limit(50) // Limit ostatnich 50 odpowiedzi
        )),
        getDocs(query(
          collection(db, 'Forms/ZmianaProdukcji/Odpowiedzi'), 
          where('moNumber', '==', moNumber),
          orderBy('fillDate', 'desc'), // Sortowanie od najnowszych
          limit(50) // Limit ostatnich 50 odpowiedzi
        ))
      ]);

      const completedMOData = completedMOSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        date: doc.data().date?.toDate(),
        formType: 'completedMO'
      }));

      const controlData = controlSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fillDate: doc.data().fillDate?.toDate(),
        productionStartDate: doc.data().productionStartDate?.toDate(),
        productionEndDate: doc.data().productionEndDate?.toDate(),
        readingDate: doc.data().readingDate?.toDate(),
        formType: 'productionControl'
      }));

      const shiftData = shiftSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        fillDate: doc.data().fillDate?.toDate(),
        formType: 'productionShift'
      }));

      // ✅ OPTYMALIZACJA: Sortowanie już wykonane w zapytaniu Firebase
      // Nie trzeba dodatkowo sortować po stronie klienta
      setFormResponses({
        completedMO: completedMOData,
        productionControl: controlData,
        productionShift: shiftData
      });
    } catch (error) {
      console.error('Błąd podczas pobierania odpowiedzi formularzy:', error);
    } finally {
      setLoadingFormResponses(false);
    }
  }, [setFormResponses, setLoadingFormResponses]);

  return {
    fetchFormResponsesOptimized,
    fetchAllTaskData,
    fetchTask,
    refreshTaskReservations,
    fetchPOReservations,
    fetchIngredientReservationLinks,
    fetchTaskBasicData,
    fetchProductionHistory,
    fetchWarehouses,
    fetchAvailableMachines,
    enrichProductionHistoryWithMachineData,
    fetchFormResponses,
    parallelDataCache,
    setLateDeps,
  };
};
