/**
 * Funkcje pomocnicze do obliczania statusów rezerwacji materiałów w zadaniach produkcyjnych
 */

/**
 * Oblicza całkowitą skonsumowaną ilość materiału
 * @param {Array} consumedMaterials - Lista skonsumowanych materiałów
 * @param {string} materialId - ID materiału
 * @returns {number} Całkowita skonsumowana ilość
 */
export const getConsumedQuantityForMaterial = (consumedMaterials, materialId) => {
  if (!consumedMaterials || consumedMaterials.length === 0) {
    return 0;
  }

  const total = consumedMaterials
    .filter(consumed => consumed.materialId === materialId)
    .reduce((total, consumed) => total + Number(consumed.quantity || 0), 0);
  
  return parseFloat(total.toFixed(3)); // Formatowanie do 3 miejsc po przecinku
};

/**
 * Oblicza całkowitą zarezerwowaną ilość materiału
 * @param {Object} materialBatches - Obiekt z zarezerwowanymi partiami dla materiałów
 * @param {string} materialId - ID materiału
 * @returns {number} Całkowita zarezerwowana ilość
 */
export const getReservedQuantityForMaterial = (materialBatches, materialId) => {
  if (!materialBatches || !materialBatches[materialId]) {
    return 0;
  }

  const total = materialBatches[materialId]
    .reduce((total, batch) => total + Number(batch.quantity || 0), 0);
  
  return parseFloat(total.toFixed(3));
};

/**
 * Oblicza status rezerwacji materiałów dla zadania produkcyjnego
 * Uwzględnia rzeczywiste ilości materiałów (actualMaterialUsage) jeśli są dostępne,
 * w przeciwnym razie używa planowanych ilości (material.quantity)
 * @param {Object} task - Obiekt zadania produkcyjnego
 * @returns {Object} Obiekt ze statusem i dodatkowymi informacjami
 */
export const calculateMaterialReservationStatus = (task) => {
  // Jeśli zadanie nie ma materiałów
  if (!task.materials || task.materials.length === 0) {
    return {
      status: 'no_materials',
      label: 'Brak materiałów',
      color: 'default'
    };
  }

  // Jeśli zadanie jest zakończone i ma potwierdzoną konsumpcję
  if ((task.status === 'Zakończone' || task.status === 'completed') && task.materialConsumptionConfirmed) {
    return {
      status: 'completed_confirmed',
      label: 'Zakończone',
      color: 'success'
    };
  }

  let totalRequired = 0;
  let totalReservedAndConsumed = 0;
  let hasAnyReservationOrConsumption = false;

  // Oblicz dla każdego materiału
  task.materials.forEach(material => {
    const materialId = material.inventoryItemId || material.id;
    if (!materialId) return;

    // Użyj rzeczywistej ilości jeśli jest dostępna, w przeciwnym razie planowaną
    const actualUsage = task.actualMaterialUsage || {};
    const requiredQuantity = (actualUsage[materialId] !== undefined) 
      ? parseFloat(actualUsage[materialId]) || 0
      : (material.quantity || 0);
    
    const consumedQuantity = getConsumedQuantityForMaterial(task.consumedMaterials, materialId);
    const reservedQuantity = getReservedQuantityForMaterial(task.materialBatches, materialId);
    
    const materialTotalCovered = consumedQuantity + reservedQuantity;

    totalRequired += requiredQuantity;
    totalReservedAndConsumed += Math.min(materialTotalCovered, requiredQuantity); // Nie przekraczamy wymaganej ilości

    if (materialTotalCovered > 0) {
      hasAnyReservationOrConsumption = true;
    }
  });

  // Jeśli nie ma żadnych rezerwacji ani konsumpcji
  if (!hasAnyReservationOrConsumption) {
    return {
      status: 'not_reserved',
      label: 'Niezarezerwowane',
      color: 'error'
    };
  }

  // Sprawdź pokrycie
  const coverageRatio = totalRequired > 0 ? totalReservedAndConsumed / totalRequired : 0;

  if (coverageRatio >= 0.99) { // 99% pokrycia lub więcej (uwzględniając błędy zaokrąglenia)
    return {
      status: 'fully_reserved',
      label: 'Zarezerwowane',
      color: 'success'
    };
  } else if (coverageRatio > 0) {
    return {
      status: 'partially_reserved',
      label: 'Cz. zarezerwowane',
      color: 'warning'
    };
  } else {
    return {
      status: 'not_reserved',
      label: 'Niezarezerwowane',
      color: 'error'
    };
  }
};

/**
 * Sprawdza czy konsumpcja materiału przekracza ilość wydaną
 * @param {number} consumedQuantity - Ilość skonsumowana
 * @param {number} issuedQuantity - Ilość wydana z planu mieszań
 * @returns {boolean} True jeśli konsumpcja przekracza ilość wydaną
 */
export const isConsumptionExceedingIssued = (consumedQuantity, issuedQuantity) => {
  if (!consumedQuantity || !issuedQuantity) {
    return false;
  }
  
  // Uwzględnij tolerancję dla błędów zaokrąglenia (0.1%)
  const tolerance = issuedQuantity * 0.001;
  return consumedQuantity > (issuedQuantity + tolerance);
};

/**
 * Oblicza procentowe przekroczenie konsumpcji względem ilości wydanej
 * @param {number} consumedQuantity - Ilość skonsumowana
 * @param {number} issuedQuantity - Ilość wydana z planu mieszań
 * @returns {number} Procent przekroczenia (0 jeśli brak przekroczenia)
 */
export const calculateConsumptionExcess = (consumedQuantity, issuedQuantity) => {
  if (!consumedQuantity || !issuedQuantity || consumedQuantity <= issuedQuantity) {
    return 0;
  }
  
  return ((consumedQuantity - issuedQuantity) / issuedQuantity) * 100;
};

/**
 * Zwraca kolory dla statusów rezerwacji materiałów
 * Kolory są dostosowane aby nie kolidować z kolorami timeline
 * @param {string} status - Status rezerwacji
 * @returns {Object} Obiekt z kolorami dla danego statusu
 */
export const getReservationStatusColors = (status) => {
  switch (status) {
    case 'fully_reserved':
      return {
        main: '#00e676',      // Jaśniejszy Material Green A400 - doskonały kontrast
        light: '#66bb6a',
        contrastText: '#ffffff'
      };
    case 'partially_reserved':
      return {
        main: '#ff9800',      // Material Orange 500 - lepszy kontrast
        light: '#ffb74d',
        contrastText: '#ffffff'
      };
    case 'not_reserved':
      return {
        main: '#ff1744',      // Material Red A400 - bardziej widoczny
        light: '#e57373',
        contrastText: '#ffffff'
      };
    case 'completed_confirmed':
      return {
        main: '#4caf50',      // Material Green 500 - standardowy, dobrze czytelny
        light: '#81c784',
        contrastText: '#ffffff'
      };
    case 'no_materials':
    default:
      return {
        main: '#e0e0e0',      // Jaśniejszy szary dla lepszej widoczności
        light: '#f5f5f5',
        contrastText: '#000000'  // Czarny tekst dla jasnego szarego tła
      };
  }
}; 