/**
 * Kalkulator wagi dla pozycji CMR
 * Oblicza wagę na podstawie danych pozycji magazynowej i ilości w CMR
 */

/**
 * Oblicza liczbę palet potrzebnych na podstawie ilości produktu
 * @param {number} quantity - Ilość produktu
 * @param {number} itemsPerBox - Ilość produktu w kartonie
 * @param {number} boxesPerPallet - Ilość kartonów na palecie
 * @returns {number} Liczba palet (zaokrąglona w górę)
 */
export const calculatePalletsNeeded = (quantity, itemsPerBox, boxesPerPallet) => {
  if (!quantity || !itemsPerBox || !boxesPerPallet) {
    return 0;
  }
  
  // Oblicz liczbę kartonów potrzebnych
  const boxesNeeded = Math.ceil(quantity / itemsPerBox);
  
  // Oblicz liczbę palet potrzebnych (zaokrąglone w górę)
  const palletsNeeded = Math.ceil(boxesNeeded / boxesPerPallet);
  
  return palletsNeeded;
};

/**
 * Oblicza liczbę kartonów potrzebnych na podstawie ilości produktu
 * @param {number} quantity - Ilość produktu
 * @param {number} itemsPerBox - Ilość produktu w kartonie
 * @returns {number} Liczba kartonów (zaokrąglona w górę)
 */
export const calculateBoxesNeeded = (quantity, itemsPerBox) => {
  if (!quantity || !itemsPerBox) {
    return 0;
  }
  
  return Math.ceil(quantity / itemsPerBox);
};

/**
 * Oblicza wagę produktu na podstawie ilości i wagi jednostkowej
 * @param {number} quantity - Ilość produktu
 * @param {number} unitWeight - Waga jednostkowa produktu w kg
 * @returns {number} Waga produktu w kg
 */
export const calculateProductWeight = (quantity, unitWeight) => {
  if (!quantity || !unitWeight) {
    return 0;
  }
  
  return quantity * unitWeight;
};

/**
 * Oblicza całkowitą wagę pozycji CMR
 * @param {Object} params - Parametry obliczenia
 * @param {number} params.quantity - Ilość produktu w CMR
 * @param {number} params.unitWeight - Waga jednostkowa produktu w kg
 * @param {number} params.itemsPerBox - Ilość produktu w kartonie
 * @param {number} params.boxesPerPallet - Ilość kartonów na palecie
 * @param {number} params.packageWeight - Waga kartonu w kg (domyślnie 0.34 kg)
 * @param {number} params.palletWeight - Waga palety w kg (domyślnie 25 kg)
 * @returns {Object} Szczegółowe obliczenia wagi
 */
export const calculateCmrItemWeight = ({
  quantity,
  unitWeight = 0,
  itemsPerBox = 0,
  boxesPerPallet = 0,
  packageWeight = 0.34, // PACKSHA-LARGE BOX
  palletWeight = 25
}) => {
  // Walidacja danych wejściowych
  if (!quantity || quantity <= 0) {
    return {
      totalWeight: 0,
      productWeight: 0,
      packagesWeight: 0,
      palletsWeight: 0,
      palletsCount: 0,
      boxesCount: 0,
      calculations: []
    };
  }

  // Oblicz wagę produktu
  const productWeight = calculateProductWeight(quantity, unitWeight);
  
  // Oblicz liczbę kartonów i palet
  const boxesCount = calculateBoxesNeeded(quantity, itemsPerBox);
  const palletsCount = calculatePalletsNeeded(quantity, itemsPerBox, boxesPerPallet);
  
  // Oblicz wagę opakowań
  const packagesWeight = boxesCount * packageWeight;
  const palletsWeight = palletsCount * palletWeight;
  
  // Oblicz wagę całkowitą
  const totalWeight = productWeight + packagesWeight + palletsWeight;
  
  // Przygotuj szczegółowe obliczenia
  const calculations = [
    {
      description: 'Produkty',
      quantity: quantity,
      unit: 'szt.',
      unitWeight: unitWeight,
      totalWeight: productWeight,
      formula: `${quantity} szt. × ${unitWeight} kg/szt.`
    }
  ];
  
  if (boxesCount > 0) {
    calculations.push({
      description: 'Kartony',
      quantity: boxesCount,
      unit: 'szt.',
      unitWeight: packageWeight,
      totalWeight: packagesWeight,
      formula: `${boxesCount} kartonów × ${packageWeight} kg/karton`
    });
  }
  
  if (palletsCount > 0) {
    calculations.push({
      description: 'Palety',
      quantity: palletsCount,
      unit: 'szt.',
      unitWeight: palletWeight,
      totalWeight: palletsWeight,
      formula: `${palletsCount} palet × ${palletWeight} kg/paleta`
    });
  }
  
  return {
    totalWeight: Number(totalWeight.toFixed(3)),
    productWeight: Number(productWeight.toFixed(3)),
    packagesWeight: Number(packagesWeight.toFixed(3)),
    palletsWeight: Number(palletsWeight.toFixed(3)),
    palletsCount,
    boxesCount,
    calculations
  };
};

/**
 * Pobiera dane pozycji magazynowej z powiązanych partii
 * @param {Array} linkedBatches - Powiązane partie magazynowe z CMR
 * @returns {Object|null} Dane pozycji magazynowej lub null
 */
export const getInventoryDataFromBatches = async (linkedBatches) => {
  if (!linkedBatches || linkedBatches.length === 0) {
    return null;
  }
  
  // Pobierz dane pierwszej partii (wszystkie partie powinny mieć te same dane pozycji)
  const firstBatch = linkedBatches[0];
  
  try {
    // Importuj dynamicznie, aby uniknąć cyklicznych zależności
    const { getInventoryItemById } = await import('../services/inventoryService');
    
    if (!firstBatch.itemId) {
      return null;
    }
    
    const inventoryItem = await getInventoryItemById(firstBatch.itemId);
    
    if (!inventoryItem) {
      return null;
    }
    
    return {
      name: inventoryItem.name,
      weight: inventoryItem.weight,
      itemsPerBox: inventoryItem.itemsPerBox,
      boxesPerPallet: inventoryItem.boxesPerPallet,
      parentPackageItemId: inventoryItem.parentPackageItemId
    };
  } catch (error) {
    console.error('Błąd podczas pobierania danych pozycji magazynowej:', error);
    return null;
  }
};

/**
 * Pobiera dane kartonu (opakowania zbiorczego) jeśli istnieje
 * @param {string} parentPackageItemId - ID kartonu w magazynie
 * @returns {Object|null} Dane kartonu lub null
 */
export const getPackageData = async (parentPackageItemId) => {
  if (!parentPackageItemId) {
    return null;
  }
  
  try {
    // Importuj dynamicznie, aby uniknąć cyklicznych zależności
    const { getInventoryItemById } = await import('../services/inventoryService');
    
    const packageItem = await getInventoryItemById(parentPackageItemId);
    
    if (!packageItem) {
      return null;
    }
    
    return {
      name: packageItem.name,
      weight: packageItem.weight || 0.34 // domyślna waga kartonu
    };
  } catch (error) {
    console.error('Błąd podczas pobierania danych kartonu:', error);
    return null;
  }
}; 