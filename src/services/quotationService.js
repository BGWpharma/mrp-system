/**
 * Serwis do obsługi wycen klientów
 * 
 * Narzędzie do wyceny COGS produktów na podstawie:
 * - Procentowej zawartości komponentów (składników z magazynu)
 * - Rodzaju opakowania
 * - Gramatury surowca i szacowanego czasu pracy
 */

import { db } from '../firebase';
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  getDoc, 
  getDocs, 
  query, 
  orderBy, 
  where,
  Timestamp 
} from 'firebase/firestore';
import { getInventoryItemsByCategory, getIngredientPrices } from './inventory/inventoryItemsService';
import { getBestSupplierPricesForItems } from './inventory/supplierPriceService';
import { getFactoryCosts } from './factoryCostService';

const QUOTATIONS_COLLECTION = 'quotations';

// ==================== JEDNOSTKI WAGOWE ====================

// Jednostki liczone (pomijane przy obliczaniu wagi)
const COUNTABLE_UNITS = ['szt.', 'szt', 'caps', 'kaps', 'tab', 'tabl', 'tabl.'];

/**
 * Konwertuje ilość do gramów
 * @param {number} quantity - Ilość
 * @param {string} unit - Jednostka
 * @returns {number} - Ilość w gramach
 */
export const convertToGrams = (quantity, unit) => {
  if (!quantity || isNaN(quantity)) return 0;
  
  const normalizedUnit = (unit || '').toLowerCase().trim();
  
  // Jednostki liczone - pomijamy
  if (COUNTABLE_UNITS.some(u => normalizedUnit === u.toLowerCase())) {
    return 0;
  }
  
  // Konwersje wagowe
  switch (normalizedUnit) {
    case 'kg':
    case 'kilogram':
    case 'kilogramy':
      return quantity * 1000;
    case 'g':
    case 'gram':
    case 'gramy':
      return quantity;
    case 'mg':
    case 'miligram':
    case 'miligramy':
      return quantity / 1000;
    case 'µg':
    case 'ug':
    case 'mcg':
    case 'mikrogram':
    case 'mikrogramy':
      return quantity / 1000000;
    case 'l':
    case 'litr':
    case 'litry':
      return quantity * 1000; // Zakładamy gęstość ~1
    case 'ml':
    case 'mililitr':
    case 'mililitry':
      return quantity;
    default:
      // Domyślnie traktuj jako gramy
      return quantity;
  }
};

/**
 * Oblicza całkowitą wagę składników w gramach
 * @param {Array} components - Lista składników
 * @returns {number} - Całkowita waga w gramach
 */
export const calculateTotalWeight = (components) => {
  if (!components || !Array.isArray(components)) return 0;
  
  return components.reduce((total, component) => {
    const weightInGrams = convertToGrams(
      parseFloat(component.quantity) || 0,
      component.unit
    );
    return total + weightInGrams;
  }, 0);
};

// ==================== MATRYCA CZASU PRACY ====================

/**
 * Matryca czasu/kosztu według formatu produktu (Pack weight + flavored)
 * Źródło: CSV - Target Time (sec), At cost factory per hour
 */
export const LABOR_MATRIX_BY_FORMAT = [
  { packWeightMin: 60, packWeightMax: 180, flavored: null, targetTimeSec: 15, costPerHourEur: 0.60 },  // ALL CAPS FORMAT
  { packWeightMin: 300, packWeightMax: 300, flavored: true, targetTimeSec: 17, costPerHourEur: 0.68 },   // 300g FLAVORED
  { packWeightMin: 300, packWeightMax: 300, flavored: false, targetTimeSec: 15, costPerHourEur: 0.60 },  // 300g UNFLAVORED
  { packWeightMin: 900, packWeightMax: 900, flavored: null, targetTimeSec: 40, costPerHourEur: 1.59 }, // 900g FORMAT
];

/** Dostępne gramatury opakowań do wyboru (g) */
export const PACK_WEIGHT_OPTIONS = [60, 90, 120, 180, 300, 900];

/**
 * Pobiera parametry czasu i kosztu z matrycy na podstawie formatu (pack weight + flavored)
 * @param {number} packWeight - Gramatura opakowania (g)
 * @param {boolean|null} flavored - Czy produkt smakowy (tylko dla 300g)
 * @returns {Object|null} - { targetTimeSec, costPerHourEur } lub null jeśli brak dopasowania
 */
export const getLaborParamsByFormat = (packWeight, flavored = false) => {
  if (!packWeight) return null;

  const match = LABOR_MATRIX_BY_FORMAT.find(entry => {
    if (packWeight < entry.packWeightMin || packWeight > entry.packWeightMax) return false;
    if (entry.packWeightMin === 300 && entry.packWeightMax === 300) {
      return entry.flavored === Boolean(flavored);
    }
    return true;
  });

  return match ? { targetTimeSec: match.targetTimeSec, costPerHourEur: match.costPerHourEur } : null;
};

/**
 * Oblicza koszt pracy na jednostkę według matrycy formatu
 * Formuła: (targetTimeSec / 3600) * costPerHourEur
 * @param {number} packWeight - Gramatura opakowania (g)
 * @param {boolean} flavored - Czy produkt smakowy (dla 300g)
 * @param {number} quantity - Ilość jednostek (domyślnie 1)
 * @returns {Object|null} - { targetTimeSec, costPerHourEur, laborCostPerUnit, laborCostTotal } lub null
 */
export const calculateLaborCostByFormat = (packWeight, flavored = false, quantity = 1) => {
  const params = getLaborParamsByFormat(packWeight, flavored);
  if (!params) return null;

  const laborCostPerUnit = (params.targetTimeSec / 3600) * params.costPerHourEur;
  const laborCostTotal = laborCostPerUnit * quantity;
  const estimatedMinutes = (params.targetTimeSec / 60) * quantity;

  return {
    targetTimeSec: params.targetTimeSec,
    costPerHourEur: params.costPerHourEur,
    laborCostPerUnit,
    laborCostTotal,
    estimatedMinutes,
    source: 'format'
  };
};

/**
 * Domyślna matryca czasu pracy - FALLBACK (gramatura surowca -> czas w minutach)
 * Używana gdy użytkownik nie wybierze formatu (pack weight)
 */
const DEFAULT_LABOR_TIME_MATRIX = [
  { minGrams: 0, maxGrams: 100, minutes: 0.6 },
  { minGrams: 100, maxGrams: 250, minutes: 0.8 },
  { minGrams: 250, maxGrams: 500, minutes: 1 },
  { minGrams: 500, maxGrams: 1000, minutes: 1.2 },
  { minGrams: 1000, maxGrams: 2500, minutes: 1.4 },
  { minGrams: 2500, maxGrams: 5000, minutes: 1.6 },
  { minGrams: 5000, maxGrams: 10000, minutes: 1.8 },
  { minGrams: 10000, maxGrams: Infinity, minutes: 2 }
];

/**
 * Oblicza szacowany czas pracy na podstawie gramatury (tryb fallback)
 * @param {number} gramatura - Gramatura surowca w gramach
 * @param {Array} laborMatrix - Opcjonalna niestandardowa matryca czasu pracy
 * @returns {number} - Szacowany czas w minutach
 */
export const calculateLaborTime = (gramatura, laborMatrix = null) => {
  const matrix = laborMatrix || DEFAULT_LABOR_TIME_MATRIX;

  const range = matrix.find(r => gramatura >= r.minGrams && gramatura < r.maxGrams);

  if (range) {
    return range.minutes;
  }

  return matrix[matrix.length - 1].minutes;
};

// ==================== POBIERANIE DANYCH ====================

/**
 * Pobiera cenę z najnowszej partii (niezależnie od quantity)
 * @param {Array} batches - Lista partii
 * @returns {Object} - { price: number, hasBatchPrice: boolean, batchDate: Date|null }
 */
const getBatchPrice = (batches) => {
  if (!batches || batches.length === 0) {
    return { price: 0, hasBatchPrice: false, batchDate: null };
  }
  
  // Filtruj partie z ceną > 0 (niezależnie od quantity)
  const batchesWithPrice = batches
    .filter(batch => batch.unitPrice !== undefined && parseFloat(batch.unitPrice) > 0)
    .sort((a, b) => {
      // Sortuj od najnowszej do najstarszej po dacie przyjęcia
      const dateA = a.receivedDate?.toDate ? a.receivedDate.toDate() : new Date(a.receivedDate || 0);
      const dateB = b.receivedDate?.toDate ? b.receivedDate.toDate() : new Date(b.receivedDate || 0);
      return dateB - dateA;
    });
  
  if (batchesWithPrice.length > 0) {
    const newestBatch = batchesWithPrice[0];
    const batchDate = newestBatch.receivedDate?.toDate 
      ? newestBatch.receivedDate.toDate() 
      : new Date(newestBatch.receivedDate);
    
    return {
      price: parseFloat(newestBatch.unitPrice),
      hasBatchPrice: true,
      batchDate
    };
  }
  
  return { price: 0, hasBatchPrice: false, batchDate: null };
};

/**
 * Pobiera wszystkie surowce z magazynu
 * Ceny są pobierane TYLKO z partii magazynowych (nie z pozycji inventory)
 * @returns {Promise<Array>} - Lista surowców
 */
export const getRawMaterials = async () => {
  try {
    const result = await getInventoryItemsByCategory('Surowce');
    // getInventoryItemsByCategory zwraca obiekt { items: [...], totalCount, ... }
    // Każdy item ma pole 'batches' z listą partii
    const items = result.items || [];
    
    return items.map(item => {
      const batchInfo = getBatchPrice(item.batches);
      
      return {
        id: item.id,
        name: item.name,
        unit: item.unit || 'kg',
        unitPrice: batchInfo.price, // Cena TYLKO z partii
        currency: item.currency || 'EUR',
        casNumber: item.casNumber || '',
        hasBatchPrice: batchInfo.hasBatchPrice, // Flaga czy jest cena z partii
        batchDate: batchInfo.batchDate, // Data ostatniej partii z ceną
        batchCount: (item.batches || []).length
      };
    });
  } catch (error) {
    console.error('Błąd podczas pobierania surowców:', error);
    throw error;
  }
};

/**
 * Pobiera wszystkie opakowania z magazynu
 * Ceny są pobierane TYLKO z partii magazynowych (nie z pozycji inventory)
 * @returns {Promise<Array>} - Lista opakowań
 */
export const getPackagingItems = async () => {
  try {
    const bulkResult = await getInventoryItemsByCategory('Opakowania zbiorcze');
    const unitResult = await getInventoryItemsByCategory('Opakowania jednostkowe');
    
    // getInventoryItemsByCategory zwraca obiekt { items: [...], totalCount, ... }
    // Każdy item ma pole 'batches' z listą partii
    const bulkPackaging = bulkResult.items || [];
    const unitPackaging = unitResult.items || [];
    
    const allPackaging = [...bulkPackaging, ...unitPackaging];
    
    return allPackaging.map(item => {
      const batchInfo = getBatchPrice(item.batches);
      
      return {
        id: item.id,
        name: item.name,
        category: item.category,
        unit: item.unit || 'szt.',
        unitPrice: batchInfo.price, // Cena TYLKO z partii
        currency: item.currency || 'EUR',
        hasBatchPrice: batchInfo.hasBatchPrice, // Flaga czy jest cena z partii
        batchDate: batchInfo.batchDate, // Data ostatniej partii z ceną
        batchCount: (item.batches || []).length
      };
    });
  } catch (error) {
    console.error('Błąd podczas pobierania opakowań:', error);
    throw error;
  }
};

/**
 * Pobiera aktualny koszt za minutę pracy zakładu
 * Pobiera wartość z NAJNOWSZEGO wpisu kosztów zakładu (factoryCosts)
 * @returns {Promise<Object>} - { costPerMinute: number, source: Object|null }
 */
export const getCurrentCostPerMinute = async () => {
  try {
    // Pobierz wszystkie koszty zakładu (posortowane od najnowszego)
    const factoryCosts = await getFactoryCosts();
    
    if (factoryCosts.length === 0) {
      console.warn('[QUOTATION] Brak wpisów kosztów zakładu');
      return {
        costPerMinute: 0,
        source: null,
        hasData: false
      };
    }
    
    // Weź najnowszy wpis (pierwszy na liście, bo posortowane desc po startDate)
    const latestCost = factoryCosts[0];
    
    // Pobierz costPerMinute z najnowszego wpisu
    const costPerMinute = parseFloat(latestCost.costPerMinute) || 0;
    
    console.log(`[QUOTATION] Pobrano koszt/minutę z najnowszego wpisu kosztów zakładu: ${costPerMinute} EUR/min (okres: ${latestCost.startDate?.toLocaleDateString?.()} - ${latestCost.endDate?.toLocaleDateString?.()})`);
    
    return {
      costPerMinute,
      source: {
        id: latestCost.id,
        startDate: latestCost.startDate,
        endDate: latestCost.endDate,
        amount: latestCost.amount,
        effectiveMinutes: latestCost.effectiveMinutes,
        effectiveHours: latestCost.effectiveHours
      },
      hasData: true
    };
  } catch (error) {
    console.error('Błąd podczas pobierania kosztu/minutę:', error);
    return {
      costPerMinute: 0,
      source: null,
      hasData: false,
      error: error.message
    };
  }
};

// ==================== KALKULACJA WYCENY ====================

/**
 * Oblicza pełną wycenę COGS
 * @param {Object} quotationData - Dane wyceny
 * @returns {Promise<Object>} - Obliczona wycena
 */
export const calculateQuotation = async (quotationData) => {
  const { components, packaging, laborMatrix, customCostPerMinute, packWeight, flavored } = quotationData;
  
  // 1. Oblicz koszt komponentów
  let componentsCost = 0;
  const componentsWithCosts = [];
  
  if (components && components.length > 0) {
    // Pobierz ceny dla wszystkich komponentów z magazynu
    const inventoryComponentIds = components
      .filter(c => c.inventoryItemId && !c.isManual)
      .map(c => c.inventoryItemId);
    
    let pricesMap = {};
    if (inventoryComponentIds.length > 0) {
      try {
        pricesMap = await getIngredientPrices(inventoryComponentIds, { useBatchPrices: true });
      } catch (error) {
        console.warn('Nie udało się pobrać cen z magazynu:', error);
      }
    }
    
    // Oblicz całkowitą wagę (dla procentów)
    const totalWeight = calculateTotalWeight(components);
    
    for (const component of components) {
      let unitPrice = component.unitPrice || 0;
      let priceSource = 'manual';
      
      // Jeśli komponent jest z magazynu, pobierz cenę
      if (component.inventoryItemId && !component.isManual && pricesMap[component.inventoryItemId]) {
        const prices = pricesMap[component.inventoryItemId];
        if (prices.batchPrice > 0) {
          unitPrice = prices.batchPrice;
          priceSource = 'batch';
        } else if (prices.itemPrice > 0) {
          unitPrice = prices.itemPrice;
          priceSource = 'inventory';
        }
      }
      
      const quantity = parseFloat(component.quantity) || 0;
      const totalCost = quantity * unitPrice;
      componentsCost += totalCost;
      
      // Oblicz procent wagowy
      const weightInGrams = convertToGrams(quantity, component.unit);
      const percentage = totalWeight > 0 ? (weightInGrams / totalWeight) * 100 : 0;
      
      componentsWithCosts.push({
        ...component,
        unitPrice,
        totalCost,
        priceSource,
        weightInGrams,
        percentage: parseFloat(percentage.toFixed(2))
      });
    }
  }
  
  // 2. Oblicz koszt opakowania
  let packagingCost = 0;
  let packagingDetails = null;
  
  if (packaging && packaging.inventoryItemId) {
    const quantity = parseFloat(packaging.quantity) || 1;
    const unitPrice = parseFloat(packaging.unitPrice) || 0;
    packagingCost = quantity * unitPrice;
    
    packagingDetails = {
      ...packaging,
      totalCost: packagingCost
    };
  }
  
  // 3. Oblicz koszt pracy
  const totalGramatura = calculateTotalWeight(components);
  const packagingQuantity = packaging?.quantity || 1;
  let laborDetails;
  let laborCost;

  // Tryb nowej matrycy (pack weight + flavored) - koszt z matrycy formatu
  const formatLabor = calculateLaborCostByFormat(packWeight, flavored, packagingQuantity);
  if (formatLabor) {
    laborCost = formatLabor.laborCostTotal;
    laborDetails = {
      gramatura: totalGramatura,
      estimatedMinutes: formatLabor.estimatedMinutes,
      targetTimeSec: formatLabor.targetTimeSec,
      costPerHourEur: formatLabor.costPerHourEur,
      totalCost: laborCost,
      source: 'format'
    };
  } else {
    // Fallback: stara matryca (gramatura -> minuty) × costPerMinute
    const estimatedMinutes = calculateLaborTime(totalGramatura, laborMatrix);
    let costPerMinute = customCostPerMinute;
    if (!costPerMinute || costPerMinute <= 0) {
      const costData = await getCurrentCostPerMinute();
      costPerMinute = costData.costPerMinute;
    }
    laborCost = estimatedMinutes * (costPerMinute || 0);
    laborDetails = {
      gramatura: totalGramatura,
      estimatedMinutes,
      costPerMinute: costPerMinute || 0,
      totalCost: laborCost,
      source: 'gramatura'
    };
  }
  
  // 4. Oblicz COGS
  const totalCOGS = componentsCost + packagingCost + laborCost;
  
  return {
    components: componentsWithCosts,
    packaging: packagingDetails,
    labor: laborDetails,
    summary: {
      componentsCost: parseFloat(componentsCost.toFixed(2)),
      packagingCost: parseFloat(packagingCost.toFixed(2)),
      laborCost: parseFloat(laborCost.toFixed(2)),
      totalCOGS: parseFloat(totalCOGS.toFixed(2))
    }
  };
};

// ==================== CRUD WYCEN ====================

/**
 * Zapisuje wycenę do bazy danych
 * @param {Object} quotationData - Dane wyceny
 * @param {string} userId - ID użytkownika
 * @returns {Promise<string>} - ID zapisanej wyceny
 */
export const saveQuotation = async (quotationData, userId) => {
  try {
    const docData = {
      ...quotationData,
      createdBy: userId || null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };
    
    const docRef = await addDoc(collection(db, QUOTATIONS_COLLECTION), docData);
    return docRef.id;
  } catch (error) {
    console.error('Błąd podczas zapisywania wyceny:', error);
    throw error;
  }
};

/**
 * Aktualizuje wycenę
 * @param {string} quotationId - ID wyceny
 * @param {Object} quotationData - Zaktualizowane dane
 * @returns {Promise<void>}
 */
export const updateQuotation = async (quotationId, quotationData) => {
  try {
    const docRef = doc(db, QUOTATIONS_COLLECTION, quotationId);
    await updateDoc(docRef, {
      ...quotationData,
      updatedAt: Timestamp.now()
    });
  } catch (error) {
    console.error('Błąd podczas aktualizacji wyceny:', error);
    throw error;
  }
};

/**
 * Usuwa wycenę
 * @param {string} quotationId - ID wyceny
 * @returns {Promise<void>}
 */
export const deleteQuotation = async (quotationId) => {
  try {
    await deleteDoc(doc(db, QUOTATIONS_COLLECTION, quotationId));
  } catch (error) {
    console.error('Błąd podczas usuwania wyceny:', error);
    throw error;
  }
};

/**
 * Pobiera wycenę po ID
 * @param {string} quotationId - ID wyceny
 * @returns {Promise<Object|null>}
 */
export const getQuotationById = async (quotationId) => {
  try {
    const docRef = doc(db, QUOTATIONS_COLLECTION, quotationId);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    }
    return null;
  } catch (error) {
    console.error('Błąd podczas pobierania wyceny:', error);
    throw error;
  }
};

/**
 * Pobiera wszystkie wyceny
 * @param {Object} filters - Filtry
 * @returns {Promise<Array>}
 */
export const getAllQuotations = async (filters = {}) => {
  try {
    let q = query(
      collection(db, QUOTATIONS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    
    if (filters.customerId) {
      q = query(q, where('customerId', '==', filters.customerId));
    }
    
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Błąd podczas pobierania wycen:', error);
    throw error;
  }
};

// ==================== EKSPORT ====================

export default {
  // Konwersje i obliczenia
  convertToGrams,
  calculateTotalWeight,
  calculateLaborTime,
  
  // Pobieranie danych
  getRawMaterials,
  getPackagingItems,
  getCurrentCostPerMinute,
  
  // Kalkulacja
  calculateQuotation,
  
  // CRUD
  saveQuotation,
  updateQuotation,
  deleteQuotation,
  getQuotationById,
  getAllQuotations,
  
  // Stałe
  DEFAULT_LABOR_TIME_MATRIX,
  LABOR_MATRIX_BY_FORMAT,
  PACK_WEIGHT_OPTIONS,
  getLaborParamsByFormat,
  calculateLaborCostByFormat
};
