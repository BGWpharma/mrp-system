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

    const { id, name, quantity } = ingredient;
    
    // Pobierz cenę jednostkową - najpierw z partii, jeśli dostępna i opcja włączona
    let unitPrice = 0;
    let priceSource = 'brak';
    
    if (id && pricesMap[id]) {
      // Jeśli mamy cenę z partii i opcja jest włączona, użyj jej
      if (useBatchPrices && pricesMap[id].batchPrice !== undefined && pricesMap[id].batchPrice > 0) {
        unitPrice = pricesMap[id].batchPrice;
        priceSource = 'partia';
      } 
      // W przeciwnym razie użyj standardowej ceny z pozycji magazynowej
      else if (pricesMap[id].itemPrice !== undefined && pricesMap[id].itemPrice > 0) {
        unitPrice = pricesMap[id].itemPrice;
        priceSource = 'magazyn';
      }
      // Dla wstecznej kompatybilności - jeśli pricesMap zawiera bezpośrednio cenę
      else if (typeof pricesMap[id] === 'number' && pricesMap[id] > 0) {
        unitPrice = pricesMap[id];
        priceSource = 'bezpośrednia';
      }
      // Jeśli nie znaleziono ceny, spróbuj użyć dowolnej dostępnej wartości
      else if (pricesMap[id].batchPrice !== undefined) {
        unitPrice = pricesMap[id].batchPrice || 0;
        priceSource = 'partia (0)';
      }
      else if (pricesMap[id].itemPrice !== undefined) {
        unitPrice = pricesMap[id].itemPrice || 0;
        priceSource = 'magazyn (0)';
      }
      else if (typeof pricesMap[id] === 'number') {
        unitPrice = pricesMap[id];
        priceSource = 'bezpośrednia (0)';
      }
    }
    
    // Upewnij się, że ilość jest poprawnie sparsowana
    const parsedQuantity = parseFloat(quantity) || 0;
    const cost = parsedQuantity * unitPrice;

    totalCost += isNaN(cost) ? 0 : cost;

    details.push({
      id,
      name: name || 'Nieznany składnik',
      quantity: parsedQuantity,
      unit: ingredient.unit || 'szt.',
      unitPrice,
      priceSource, // Dodajemy informację o źródle ceny
      cost: isNaN(cost) ? 0 : cost
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

  // Oblicz koszt składników
  const ingredientsCostResult = calculateIngredientsCost(recipe.ingredients, pricesMap);
  const ingredientsCost = ingredientsCostResult.totalCost;

  // Oblicz koszt robocizny
  const laborCost = calculateLaborCost(recipe.preparationTime, hourlyLaborRate);

  // Oblicz koszt energii
  const energyCost = calculateEnergyCost(recipe.preparationTime, hourlyEnergyRate);

  // Oblicz koszty pośrednie (narzut)
  const directCosts = ingredientsCost + laborCost + energyCost;
  const overheadCost = directCosts * (overheadPercentage / 100);

  // Oblicz koszt całkowity
  const totalCost = directCosts + overheadCost;

  // Oblicz koszt jednostkowy
  const yieldQuantity = recipe.yield && recipe.yield.quantity ? parseFloat(recipe.yield.quantity) : 1;
  const unitCost = yieldQuantity > 0 ? totalCost / yieldQuantity : totalCost;

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
  const taskQuantity = parseFloat(task.quantity) || 0;
  const recipeYield = recipe.yield && recipe.yield.quantity ? parseFloat(recipe.yield.quantity) : 1;

  // Współczynnik skalowania (ile razy musimy wykonać recepturę)
  const scaleFactor = recipeYield > 0 ? taskQuantity / recipeYield : 0;

  // Całkowity koszt zadania
  const taskTotalCost = recipeCost.totalCost * scaleFactor;

  return {
    ...recipeCost,
    taskQuantity,
    taskUnit: task.unit || recipe.yield.unit || 'szt.',
    taskTotalCost
  };
}; 