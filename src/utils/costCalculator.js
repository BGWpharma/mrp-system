/**
 * Narzędzia do kalkulacji kosztów produkcji
 * 
 * Ten moduł zawiera funkcje do obliczania kosztów produkcji zgodnie z modelem MRPeasy:
 * - Koszty materiałów dla zlecenia produkcyjnego
 * - Koszty produkcyjne dla zlecenia produkcyjnego
 * - Rentowność zamówień klientów
 */

/**
 * Oblicza koszt materiałów na podstawie listy składników i mapy cen
 * @param {Array} ingredients - Lista składników z ilościami
 * @param {Object} pricesMap - Mapa cen składników (id -> cena)
 * @param {Object} options - Opcje kalkulacji
 * @returns {Object} - Obiekt zawierający koszt materiałów i szczegóły
 */
export const calculateMaterialsCost = (ingredients, pricesMap, options = {}) => {
  if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
    return { totalCost: 0, details: [] };
  }

  if (!pricesMap || typeof pricesMap !== 'object') {
    return { totalCost: 0, details: [] };
  }

  // Opcje kalkulacji
  const { useBatchPrices = true } = options;

  let totalCost = 0;
  const details = [];

  ingredients.forEach(ingredient => {
    if (!ingredient) return;

    const { id, name } = ingredient;
    
    // Upewnij się, że ilość jest poprawnie sparsowana
    const parsedQuantity = parseFloat(ingredient.quantity);
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      // Dodaj składnik z zerowymi wartościami, ale nie wpływaj na całkowity koszt
      details.push({
        id,
        name: name || 'Nieznany składnik',
        quantity: 0,
        unit: ingredient.unit || 'szt.',
        unitPrice: 0,
        priceSource: 'nieprawidłowa ilość',
        cost: 0
      });
      return; // Przejdź do następnego składnika
    }
    
    // Pobierz cenę jednostkową - najpierw z partii, jeśli dostępna i opcja włączona
    let unitPrice = 0;
    let priceSource = 'brak';
    
    if (id && pricesMap[id]) {
      // Jeśli mamy cenę z partii i opcja jest włączona, użyj jej
      if (useBatchPrices && pricesMap[id].batchPrice !== undefined) {
        const batchPrice = parseFloat(pricesMap[id].batchPrice);
        if (!isNaN(batchPrice) && batchPrice > 0) {
          unitPrice = batchPrice;
          priceSource = 'partia';
        }
      } 
      // W przeciwnym razie użyj standardowej ceny z pozycji magazynowej
      if (unitPrice === 0 && pricesMap[id].itemPrice !== undefined) {
        const itemPrice = parseFloat(pricesMap[id].itemPrice);
        if (!isNaN(itemPrice) && itemPrice > 0) {
          unitPrice = itemPrice;
          priceSource = 'magazyn';
        }
      }
      // Dla wstecznej kompatybilności - jeśli pricesMap zawiera bezpośrednio cenę
      if (unitPrice === 0 && typeof pricesMap[id] === 'number') {
        const directPrice = parseFloat(pricesMap[id]);
        if (!isNaN(directPrice) && directPrice > 0) {
          unitPrice = directPrice;
          priceSource = 'bezpośrednia';
        }
      }
      
      // Jeśli nadal nie mamy ceny, spróbuj użyć dowolnej dostępnej wartości, nawet jeśli jest zerowa
      if (unitPrice === 0) {
        if (pricesMap[id].batchPrice !== undefined) {
          unitPrice = parseFloat(pricesMap[id].batchPrice) || 0;
          priceSource = 'partia (0)';
        }
        else if (pricesMap[id].itemPrice !== undefined) {
          unitPrice = parseFloat(pricesMap[id].itemPrice) || 0;
          priceSource = 'magazyn (0)';
        }
        else if (typeof pricesMap[id] === 'number') {
          unitPrice = parseFloat(pricesMap[id]) || 0;
          priceSource = 'bezpośrednia (0)';
        }
      }
    }
    
    // Oblicz koszt składnika
    const cost = parsedQuantity * unitPrice;

    // Dodaj do całkowitego kosztu
    totalCost += cost;

    details.push({
      id,
      name: name || 'Nieznany składnik',
      quantity: parsedQuantity,
      unit: ingredient.unit || 'szt.',
      unitPrice,
      priceSource,
      cost
    });
  });

  return {
    totalCost,
    details
  };
};

/**
 * Model MRPeasy: Oblicza koszty produkcyjne dla zlecenia produkcyjnego
 * @param {Object} manufacturingOrder - Obiekt zlecenia produkcyjnego
 * @param {Object} recipe - Obiekt receptury
 * @param {Object} pricesMap - Mapa cen materiałów
 * @param {Object} laborData - Dane o raportowanej pracy
 * @param {Object} options - Opcje kalkulacji
 * @returns {Object} - Szczegółowa kalkulacja kosztów
 */
export const calculateManufacturingOrderCosts = (manufacturingOrder, recipe, pricesMap, laborData = [], options = {}) => {
  // Domyślne opcje
  const {
    overheadRate = 10, // procent narzutu od kosztów bezpośrednich
    machineHourlyRate = 25, // stawka godzinowa maszyny w EUR/h
  } = options;
  
  // 1. Koszty materiałów
  const materialCostResult = calculateMaterialsCost(recipe.ingredients, pricesMap);
  
  // 2. Koszty pracy (robocizny)
  let plannedLaborCost = 0;
  let actualLaborCost = 0;
  
  // Przewidywany czas pracy (w minutach)
  const plannedWorkTime = parseFloat(recipe.prepTime || manufacturingOrder.estimatedDuration || 0);
  
  // Przelicz minuty na godziny
  const plannedWorkHours = plannedWorkTime / 60;
  
  // Oblicz planowany koszt pracy na podstawie planowanego czasu
  plannedLaborCost = plannedWorkHours * (options.laborHourlyRate || 50);
  
  // Jeśli mamy dane o faktycznej pracy, oblicz rzeczywisty koszt
  if (laborData && laborData.length > 0) {
    const totalActualMinutes = laborData.reduce((sum, record) => sum + (record.minutes || 0), 0);
    const actualWorkHours = totalActualMinutes / 60;
    actualLaborCost = actualWorkHours * (options.laborHourlyRate || 50);
  } else {
    // Jeśli nie ma danych o faktycznym czasie pracy, użyj planowanego
    actualLaborCost = plannedLaborCost;
  }
  
  // 3. Koszty maszyn
  // Szacowany czas pracy maszyn (taki sam jak czas pracy ludzi, jeśli nie określono inaczej)
  const machineWorkHours = plannedWorkHours;
  const machineCost = machineWorkHours * machineHourlyRate;
  
  // 4. Koszty bezpośrednie łącznie
  const directCosts = materialCostResult.totalCost + actualLaborCost + machineCost;
  
  // 5. Koszty pośrednie (narzut)
  const overheadCost = directCosts * (overheadRate / 100);
  
  // 6. Całkowity koszt produkcji
  const totalProductionCost = directCosts + overheadCost;
  
  // 7. Koszt jednostkowy
  const quantity = parseFloat(manufacturingOrder.quantity || 1);
  const unitCost = quantity > 0 ? totalProductionCost / quantity : totalProductionCost;
  
  return {
    materialCost: materialCostResult.totalCost,
    materialDetails: materialCostResult.details,
    plannedLaborCost,
    actualLaborCost,
    machineCost,
    directCosts,
    overheadCost,
    totalProductionCost,
    quantity,
    unitCost,
    plannedWorkTime,
    actualWorkTime: laborData ? laborData.reduce((sum, record) => sum + (record.minutes || 0), 0) : plannedWorkTime,
  };
};

/**
 * Model MRPeasy: Oblicza rentowność zamówienia klienta
 * @param {Object} customerOrder - Obiekt zamówienia klienta
 * @param {Object} productCostsMap - Mapa kosztów produktów (id -> koszt)
 * @returns {Object} - Szczegółowa analiza rentowności
 */
export const calculateCustomerOrderProfitability = (customerOrder, productCostsMap) => {
  if (!customerOrder || !customerOrder.items || !Array.isArray(customerOrder.items)) {
    return {
      totalRevenue: 0,
      totalCost: 0,
      grossProfit: 0,
      grossMargin: 0,
      items: []
    };
  }
  
  let totalRevenue = 0;
  let totalCost = 0;
  const items = [];
  
  // Analizuj każdą pozycję zamówienia
  customerOrder.items.forEach(item => {
    const quantity = parseFloat(item.quantity || 0);
    const price = parseFloat(item.price || 0);
    
    // Oblicz przychód z tej pozycji
    const revenue = quantity * price;
    totalRevenue += revenue;
    
    // Pobierz koszt jednostkowy produktu
    let unitCost = 0;
    if (item.id && productCostsMap && productCostsMap[item.id]) {
      unitCost = parseFloat(productCostsMap[item.id]) || 0;
    }
    
    // Oblicz koszt całkowity tej pozycji
    const cost = quantity * unitCost;
    totalCost += cost;
    
    // Oblicz zysk i marżę dla tej pozycji
    const profit = revenue - cost;
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0;
    
    // Dodaj szczegóły do listy pozycji
    items.push({
      ...item,
      unitCost,
      revenue,
      cost,
      profit,
      margin
    });
  });
  
  // Dodaj koszty dostawy
  const shippingCost = parseFloat(customerOrder.shippingCost || 0);
  totalCost += shippingCost;
  
  // Oblicz całkowity zysk brutto i marżę
  const grossProfit = totalRevenue - totalCost;
  const grossMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;
  
  return {
    totalRevenue,
    totalCost,
    grossProfit,
    grossMargin,
    shippingCost,
    items
  };
};

/**
 * Oblicza szacowany czas trwania zadania produkcyjnego na podstawie receptury
 * @param {Object} recipe - Obiekt receptury
 * @param {Number} taskQuantity - Ilość produktu do wyprodukowania w zadaniu
 * @returns {Number} - Szacowany czas trwania w minutach
 */
export const calculateEstimatedProductionTime = (recipe, taskQuantity = 1) => {
  if (!recipe) {
    return 0;
  }

  // Pobierz czas przygotowania z receptury
  let prepTime = 0;
  if (recipe.preparationTime || recipe.prepTime) {
    prepTime = parseFloat(recipe.preparationTime || recipe.prepTime);
    if (isNaN(prepTime) || prepTime < 0) {
      console.warn('Nieprawidłowy czas przygotowania:', recipe.preparationTime || recipe.prepTime);
      prepTime = 0;
    }
  }

  // Oblicz szacowany czas na podstawie czasu przygotowania i ilości produktu
  const estimatedTime = prepTime * taskQuantity;

  return estimatedTime;
};

/**
 * Oblicza koszt produkcji na podstawie receptury
 * @param {Object} recipe - Obiekt receptury
 * @param {Object} options - Opcje kalkulacji
 * @returns {Object} - Obliczony koszt produkcji
 */
export const calculateProductionCost = async (recipe, options = {}) => {
  try {
    if (!recipe || !recipe.ingredients || !Array.isArray(recipe.ingredients)) {
      return { totalCost: 0, materials: 0, labor: 0, overhead: 0 };
    }
    
    // Domyślne opcje
    const {
      laborHourlyRate = 50, // stawka godzinowa pracy w EUR/h
      overheadRate = 10, // procent narzutu od kosztów bezpośrednich
      machineHourlyRate = 25, // stawka godzinowa maszyny w EUR/h
    } = options;
    
    // Pobierz ceny składników (tu w prostszej formie niż w calculateManufacturingOrderCosts)
    const pricesMap = {};
    for (const ingredient of recipe.ingredients) {
      if (ingredient && ingredient.id) {
        // W rzeczywistym przypadku tutaj pobierałbyś ceny z bazy danych
        // Dla uproszczenia użyjemy ceny z samego składnika, jeśli jest dostępna
        pricesMap[ingredient.id] = {
          itemPrice: ingredient.price || 0,
          batchPrice: ingredient.batchPrice || 0
        };
      }
    }
    
    // 1. Koszty materiałów
    const materialCostResult = calculateMaterialsCost(recipe.ingredients, pricesMap);
    
    // 2. Koszty pracy (robocizny)
    // Przewidywany czas pracy (w minutach)
    const prepTime = parseFloat(recipe.prepTime || 0);
    const workTime = parseFloat(recipe.workTime || 0);
    const totalTime = prepTime + workTime;
    
    // Przelicz minuty na godziny
    const totalWorkHours = totalTime / 60;
    
    // Oblicz koszt pracy
    const laborCost = totalWorkHours * laborHourlyRate;
    
    // 3. Koszty maszyn
    // Szacowany czas pracy maszyn (taki sam jak czas pracy, jeśli nie określono inaczej)
    const machineWorkHours = parseFloat(recipe.machineTime || totalWorkHours);
    const machineCost = machineWorkHours * machineHourlyRate;
    
    // 4. Koszty bezpośrednie łącznie
    const directCosts = materialCostResult.totalCost + laborCost + machineCost;
    
    // 5. Koszty pośrednie (narzut)
    const overheadCost = directCosts * (overheadRate / 100);
    
    // 6. Całkowity koszt produkcji
    const totalCost = directCosts + overheadCost;
    
    // 7. Koszt jednostkowy - dla jednej jednostki receptury
    const unitCost = totalCost;
    
    return {
      totalCost: unitCost,
      materials: materialCostResult.totalCost,
      labor: laborCost,
      machine: machineCost,
      overhead: overheadCost,
      directCosts: directCosts,
      details: materialCostResult.details
    };
  } catch (error) {
    console.error('Błąd podczas obliczania kosztu produkcji:', error);
    return { totalCost: 0, materials: 0, labor: 0, overhead: 0 };
  }
};

/**
 * Oblicza pełny koszt produkcji na jednostkę z uwzględnieniem logiki listy cenowej
 * @param {Object} item - Pozycja zamówienia
 * @param {number} fullProductionCost - Pełny koszt produkcji (wszystkie materiały)
 * @returns {number} - Pełny koszt produkcji na jednostkę
 */
export const calculateFullProductionUnitCost = (item, fullProductionCost) => {
  if (!item || fullProductionCost === undefined || fullProductionCost === null) {
    return 0;
  }

  const quantity = parseFloat(item.quantity) || 1;
  const price = parseFloat(item.price) || 0;
  
  // Jeśli pozycja jest z listy cenowej, nie dodawaj ceny jednostkowej do pełnego kosztu
  if (item.fromPriceList) {
    return fullProductionCost / quantity;
  }
  
  // Jeśli pozycja nie jest z listy cenowej, dodaj cenę jednostkową
  return (fullProductionCost / quantity) + price;
};

/**
 * Oblicza podstawowy koszt produkcji na jednostkę
 * @param {Object} item - Pozycja zamówienia  
 * @param {number} productionCost - Podstawowy koszt produkcji (materiały wliczane do kosztów)
 * @returns {number} - Podstawowy koszt produkcji na jednostkę
 */
export const calculateProductionUnitCost = (item, productionCost) => {
  if (!item || productionCost === undefined || productionCost === null) {
    return 0;
  }

  const quantity = parseFloat(item.quantity) || 1;
  return productionCost / quantity;
}; 