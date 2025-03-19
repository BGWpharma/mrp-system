/**
 * Narzędzia do kalkulacji kosztów produkcji
 * 
 * Ten moduł zawiera funkcje do obliczania kosztów produkcji, w tym:
 * - Koszty składników
 * - Koszty robocizny
 * - Koszty energii
 * - Koszty pośrednie
 * - Całkowite koszty receptury
 * - Koszty zadania produkcyjnego
 */

/**
 * Oblicza koszt składników na podstawie listy składników i mapy cen
 * @param {Array} ingredients - Lista składników z ilościami
 * @param {Object} pricesMap - Mapa cen składników (id -> cena)
 * @param {Object} options - Opcje kalkulacji
 * @returns {Object} - Obiekt zawierający koszt składników i szczegóły
 */
export const calculateIngredientsCost = (ingredients, pricesMap, options = {}) => {
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
 * Oblicza koszt robocizny na podstawie czasu przygotowania
 * @param {Number} preparationTime - Czas przygotowania w minutach
 * @param {Number} hourlyRate - Stawka godzinowa (domyślnie 50 zł/h)
 * @returns {Number} - Koszt robocizny
 */
export const calculateLaborCost = (preparationTime, hourlyRate = 50) => {
  if (!preparationTime || isNaN(parseFloat(preparationTime))) {
    return 0;
  }

  const hours = parseFloat(preparationTime) / 60;
  return hours * hourlyRate;
};

/**
 * Oblicza koszt energii na podstawie czasu przygotowania
 * @param {Number} preparationTime - Czas przygotowania w minutach
 * @param {Number} energyRate - Stawka energii (domyślnie 15 zł/h)
 * @returns {Number} - Koszt energii
 */
export const calculateEnergyCost = (preparationTime, energyRate = 15) => {
  if (!preparationTime || isNaN(parseFloat(preparationTime))) {
    return 0;
  }

  const hours = parseFloat(preparationTime) / 60;
  return hours * energyRate;
};

/**
 * Oblicza całkowity koszt receptury
 * @param {Object} recipe - Obiekt receptury
 * @param {Object} pricesMap - Mapa cen składników (id -> cena)
 * @param {Object} options - Opcje kalkulacji
 * @returns {Object} - Obiekt zawierający szczegóły kosztów
 */
export const calculateRecipeTotalCost = (recipe, pricesMap, options = {}) => {
  if (!recipe) {
    return {
      ingredientsCost: 0,
      laborCost: 0,
      energyCost: 0,
      overheadCost: 0,
      totalCost: 0,
      unitCost: 0,
      yieldQuantity: 0,
      yieldUnit: 'szt.',
      ingredientsDetails: []
    };
  }

  // Opcje kalkulacji z wartościami domyślnymi
  const {
    hourlyLaborRate = 50,
    hourlyEnergyRate = 15,
    overheadPercentage = 10
  } = options;

  // Sprawdź, czy recipe.ingredients istnieje
  if (!recipe.ingredients || !Array.isArray(recipe.ingredients)) {
    console.warn('Brak składników w recepturze lub nieprawidłowy format');
    return {
      ingredientsCost: 0,
      laborCost: 0,
      energyCost: 0,
      overheadCost: 0,
      totalCost: 0,
      unitCost: 0,
      yieldQuantity: 0,
      yieldUnit: 'szt.',
      ingredientsDetails: []
    };
  }

  // Oblicz koszt składników
  const ingredientsCostResult = calculateIngredientsCost(recipe.ingredients, pricesMap);
  const ingredientsCost = ingredientsCostResult.totalCost;

  // Pobierz czas przygotowania i upewnij się, że jest liczbą
  let prepTime = 0;
  if (recipe.preparationTime) {
    prepTime = parseFloat(recipe.preparationTime);
    if (isNaN(prepTime) || prepTime < 0) {
      console.warn('Nieprawidłowy czas przygotowania:', recipe.preparationTime);
      prepTime = 0;
    }
  }

  // Oblicz koszt robocizny
  const laborCost = calculateLaborCost(prepTime, hourlyLaborRate);

  // Oblicz koszt energii
  const energyCost = calculateEnergyCost(prepTime, hourlyEnergyRate);

  // Oblicz koszty pośrednie (narzut)
  const directCosts = ingredientsCost + laborCost + energyCost;
  const overheadCost = directCosts * (overheadPercentage / 100);

  // Oblicz koszt całkowity
  const totalCost = directCosts + overheadCost;

  // Pobierz wydajność receptury i upewnij się, że jest liczbą
  let yieldQuantity = 1;
  if (recipe.yield) {
    if (typeof recipe.yield === 'object' && recipe.yield.quantity) {
      yieldQuantity = parseFloat(recipe.yield.quantity);
    } else if (typeof recipe.yield === 'number') {
      yieldQuantity = recipe.yield;
    } else if (typeof recipe.yield === 'string') {
      yieldQuantity = parseFloat(recipe.yield);
    }
  }

  if (isNaN(yieldQuantity) || yieldQuantity <= 0) {
    console.warn('Nieprawidłowa wydajność receptury:', recipe.yield);
    yieldQuantity = 1; // Domyślna wartość, aby uniknąć dzielenia przez zero
  }

  // Oblicz koszt jednostkowy
  const unitCost = totalCost / yieldQuantity;

  return {
    ingredientsCost,
    laborCost,
    energyCost,
    overheadCost,
    totalCost,
    unitCost,
    yieldQuantity,
    yieldUnit: recipe.yield && recipe.yield.unit ? recipe.yield.unit : 'szt.',
    ingredientsDetails: ingredientsCostResult.details
  };
};

/**
 * Oblicza koszt zadania produkcyjnego na podstawie receptury
 * @param {Object} task - Obiekt zadania produkcyjnego
 * @param {Object} recipe - Obiekt receptury
 * @param {Object} pricesMap - Mapa cen składników (id -> cena)
 * @param {Object} options - Opcje kalkulacji
 * @returns {Object} - Obiekt zawierający szczegóły kosztów
 */
export const calculateProductionTaskCost = (task, recipe, pricesMap, options = {}) => {
  if (!task || !recipe) {
    return {
      ingredientsCost: 0,
      laborCost: 0,
      energyCost: 0,
      overheadCost: 0,
      totalCost: 0,
      unitCost: 0,
      taskQuantity: 0,
      taskUnit: 'szt.',
      taskTotalCost: 0
    };
  }

  // Oblicz koszt receptury
  const recipeCost = calculateRecipeTotalCost(recipe, pricesMap, options);

  // Oblicz koszt zadania na podstawie ilości
  const taskQuantity = parseFloat(task.quantity);
  // Sprawdź, czy taskQuantity jest prawidłową liczbą
  if (isNaN(taskQuantity) || taskQuantity <= 0) {
    console.warn('Nieprawidłowa ilość zadania:', task.quantity);
    return {
      ...recipeCost,
      taskQuantity: 0,
      taskUnit: task.unit || (recipe.yield && recipe.yield.unit) || 'szt.',
      taskTotalCost: 0
    };
  }

  // Pobierz wydajność receptury i sprawdź, czy jest prawidłową liczbą
  let recipeYield = 1;
  if (recipe.yield) {
    if (typeof recipe.yield === 'object' && recipe.yield.quantity) {
      recipeYield = parseFloat(recipe.yield.quantity);
    } else if (typeof recipe.yield === 'number') {
      recipeYield = recipe.yield;
    } else if (typeof recipe.yield === 'string') {
      recipeYield = parseFloat(recipe.yield);
    }
  }

  if (isNaN(recipeYield) || recipeYield <= 0) {
    console.warn('Nieprawidłowa wydajność receptury:', recipe.yield);
    recipeYield = 1; // Domyślna wartość, aby uniknąć dzielenia przez zero
  }

  // Współczynnik skalowania (ile razy musimy wykonać recepturę)
  const scaleFactor = taskQuantity / recipeYield;

  // Całkowity koszt zadania
  const taskTotalCost = recipeCost.totalCost * scaleFactor;

  return {
    ...recipeCost,
    taskQuantity,
    taskUnit: task.unit || (recipe.yield && recipe.yield.unit) || 'szt.',
    taskTotalCost
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
  if (recipe.preparationTime) {
    prepTime = parseFloat(recipe.preparationTime);
    if (isNaN(prepTime) || prepTime < 0) {
      console.warn('Nieprawidłowy czas przygotowania:', recipe.preparationTime);
      prepTime = 0;
    }
  }

  // Oblicz szacowany czas na podstawie czasu przygotowania i ilości produktu
  // Czas = Czas przygotowania * Ilość produktu
  const estimatedTime = prepTime * taskQuantity;

  return estimatedTime;
}; 