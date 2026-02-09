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

  let hasAnyUnreservedMaterial = false;
  let hasAnyReservationOrConsumption = false;

  // Oblicz dla każdego materiału osobno
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

    if (materialTotalCovered > 0) {
      hasAnyReservationOrConsumption = true;
    }

    // KLUCZOWA ZMIANA: sprawdź pokrycie dla każdego materiału osobno
    // Wymagamy pełnego pokrycia dla każdego materiału, nie łącznego wskaźnika
    const materialCoverageRatio = requiredQuantity > 0 ? materialTotalCovered / requiredQuantity : 1;
    if (materialCoverageRatio < 0.99) {  // materiał nie ma pełnego pokrycia (99% tolerancja dla błędów zaokrąglenia)
      hasAnyUnreservedMaterial = true;
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

  // Sprawdź czy wszystkie materiały mają pełne pokrycie
  if (hasAnyUnreservedMaterial) {
    return {
      status: 'partially_reserved',
      label: 'Cz. zarezerwowane',
      color: 'warning'
    };
  } else {
    return {
      status: 'fully_reserved',
      label: 'Zarezerwowane',
      color: 'success'
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
 * Sprawdza czy zadanie produkcyjne ma opóźnienia w dostawach zarezerwowanych surowców z PO.
 * Porównuje planowane daty dostaw z datą rozpoczęcia produkcji (scheduledDate).
 * @param {Object} task - Obiekt zadania produkcyjnego z polem poDeliveryInfo
 * @returns {Object} Obiekt z flagą hasDelay, liczbą opóźnionych pozycji i detalami
 */
export const checkPODeliveryDelays = (task) => {
  const result = {
    hasDelay: false,
    delayedCount: 0,
    totalPendingPO: 0,
    delayedItems: []
  };

  // Brak danych o dostawach PO lub zadanie zakończone - brak opóźnień
  if (!task.poDeliveryInfo || task.poDeliveryInfo.length === 0) {
    return result;
  }
  if (task.status === 'Zakończone' || task.status === 'completed') {
    return result;
  }

  // Ustal datę rozpoczęcia produkcji
  const scheduledDate = task.scheduledDate instanceof Date
    ? task.scheduledDate
    : task.scheduledDate?.toDate?.()
      ? task.scheduledDate.toDate()
      : new Date(task.scheduledDate);

  if (isNaN(scheduledDate.getTime())) {
    return result;
  }

  // Sprawdź każdą rezerwację PO
  task.poDeliveryInfo.forEach(info => {
    // Tylko pending (niedostarczone) rezerwacje są ryzykowne
    if (info.status !== 'pending') return;

    result.totalPendingPO++;

    if (!info.expectedDeliveryDate) {
      // Brak daty dostawy = potencjalne ryzyko, traktuj jako opóźnienie
      result.hasDelay = true;
      result.delayedCount++;
      result.delayedItems.push({
        materialName: info.materialName || 'Nieznany materiał',
        poNumber: info.poNumber || '-',
        expectedDeliveryDate: null,
        scheduledDate: scheduledDate,
        delayDays: null
      });
      return;
    }

    const deliveryDate = info.expectedDeliveryDate instanceof Date
      ? info.expectedDeliveryDate
      : info.expectedDeliveryDate?.toDate?.()
        ? info.expectedDeliveryDate.toDate()
        : new Date(info.expectedDeliveryDate);

    if (isNaN(deliveryDate.getTime())) return;

    // Porównanie: jeśli dostawa planowana po dacie startu produkcji = opóźnienie
    if (deliveryDate > scheduledDate) {
      const delayMs = deliveryDate.getTime() - scheduledDate.getTime();
      const delayDays = Math.ceil(delayMs / (1000 * 60 * 60 * 24));

      result.hasDelay = true;
      result.delayedCount++;
      result.delayedItems.push({
        materialName: info.materialName || 'Nieznany materiał',
        poNumber: info.poNumber || '-',
        expectedDeliveryDate: deliveryDate,
        scheduledDate: scheduledDate,
        delayDays: delayDays
      });
    }
  });

  return result;
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
        main: '#ffb74d',      // Jaśniejszy pomarańczowy - lepszy kontrast na ciemnym pomarańczowym tle
        light: '#ffcc80',
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