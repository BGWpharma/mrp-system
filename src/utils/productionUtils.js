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

    const requiredQuantity = material.quantity || 0;
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
 * Zwraca kolory dla statusów rezerwacji materiałów
 * Kolory są dostosowane aby nie kolidować z kolorami timeline
 * @param {string} status - Status rezerwacji
 * @returns {Object} Obiekt z kolorami dla danego statusu
 */
export const getReservationStatusColors = (status) => {
  switch (status) {
    case 'fully_reserved':
      return {
        main: '#2e7d32',      // Ciemniejszy zielony (nie kolizja z timeline)
        light: '#66bb6a',
        contrastText: '#ffffff'
      };
    case 'partially_reserved':
      return {
        main: '#ed6c02',      // Pomarańczowy (nie kolizja z timeline)
        light: '#ffb74d',
        contrastText: '#ffffff'
      };
    case 'not_reserved':
      return {
        main: '#d32f2f',      // Czerwony (nie kolizja z timeline)
        light: '#e57373',
        contrastText: '#ffffff'
      };
    case 'completed_confirmed':
      return {
        main: '#388e3c',      // Zielony dla zakończonych
        light: '#81c784',
        contrastText: '#ffffff'
      };
    case 'no_materials':
    default:
      return {
        main: '#9e9e9e',      // Szary dla brak materiałów
        light: '#e0e0e0',
        contrastText: '#ffffff'
      };
  }
}; 