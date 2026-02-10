// src/services/ecoReportService.js
/**
 * Serwis generowania obrotówki EKO - zestawienie obrotów produktów ekologicznych
 * 
 * Generuje Excel z 3 zakładkami:
 * Tab.1 - Dostawcy: Informacja o dostawcach i zakupionych produktach ekologicznych
 * Tab.2 - Surowce: Rozliczenie przepływu surowców ekologicznych
 * Tab.3 - Wyroby gotowe: Rozliczenie przepływu wyrobu gotowego ekologicznego
 */

import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase/config';
import { formatDateForExport } from '../utils/exportUtils';
import ExcelJS from 'exceljs';
import i18n from '../i18n';

// Kolekcje Firebase
const SUPPLIERS_COLLECTION = 'suppliers';
const PURCHASE_ORDERS_COLLECTION = 'purchaseOrders';
const INVENTORY_COLLECTION = 'inventory';
const INVENTORY_TRANSACTIONS_COLLECTION = 'inventoryTransactions';
const INVENTORY_BATCHES_COLLECTION = 'inventoryBatches';
const PRODUCTION_TASKS_COLLECTION = 'productionTasks';
const CMR_COLLECTION = 'cmrDocuments';
const CMR_ITEMS_COLLECTION = 'cmrItems';
const RECIPES_COLLECTION = 'recipes';

/**
 * Bezpieczna konwersja dat Firebase/JS
 */
const safeConvertDate = (dateField) => {
  if (!dateField) return null;
  try {
    if (dateField && dateField.toDate && typeof dateField.toDate === 'function') {
      return dateField.toDate();
    }
    if (typeof dateField === 'string') return new Date(dateField);
    if (dateField instanceof Date) return dateField;
    if (dateField.seconds) return new Date(dateField.seconds * 1000);
    return null;
  } catch (error) {
    console.error('Błąd konwersji daty:', error);
    return null;
  }
};

/**
 * Sprawdza czy data mieści się w zakresie
 */
const isDateInRange = (date, dateFrom, dateTo) => {
  if (!date) return false;
  const d = safeConvertDate(date);
  if (!d) return false;
  if (dateFrom && d < dateFrom) return false;
  if (dateTo && d > dateTo) return false;
  return true;
};

/**
 * Formatuje adres dostawcy
 */
const formatSupplierAddress = (supplier) => {
  if (!supplier || !supplier.addresses || !supplier.addresses.length) return '';
  const mainAddr = supplier.addresses.find(a => a.isMain) || supplier.addresses[0];
  const parts = [mainAddr.street, mainAddr.postalCode, mainAddr.city, mainAddr.country].filter(Boolean);
  return parts.join(', ');
};

// ============================================================
// POBIERANIE DANYCH
// ============================================================

/**
 * Pobiera wszystkich dostawców
 */
const fetchSuppliers = async () => {
  const q = query(collection(db, SUPPLIERS_COLLECTION));
  const snapshot = await getDocs(q);
  const suppliers = {};
  snapshot.forEach(doc => {
    suppliers[doc.id] = { id: doc.id, ...doc.data() };
  });
  return suppliers;
};

/**
 * Pobiera Purchase Orders w zakresie dat
 */
const fetchPurchaseOrders = async (dateFrom, dateTo) => {
  let q = query(
    collection(db, PURCHASE_ORDERS_COLLECTION),
    orderBy('orderDate', 'desc')
  );
  
  if (dateFrom) {
    const startDate = new Date(dateFrom);
    startDate.setHours(0, 0, 0, 0);
    q = query(q, where('orderDate', '>=', Timestamp.fromDate(startDate)));
  }
  if (dateTo) {
    const endDate = new Date(dateTo);
    endDate.setHours(23, 59, 59, 999);
    q = query(q, where('orderDate', '<=', Timestamp.fromDate(endDate)));
  }

  const snapshot = await getDocs(q);
  const orders = [];
  snapshot.forEach(doc => {
    orders.push({ id: doc.id, ...doc.data() });
  });
  return orders;
};

/**
 * Pobiera pozycje inwentarza (surowce i wyroby gotowe)
 */
const fetchInventoryItems = async () => {
  const q = query(collection(db, INVENTORY_COLLECTION));
  const snapshot = await getDocs(q);
  const items = {};
  snapshot.forEach(doc => {
    items[doc.id] = { id: doc.id, ...doc.data() };
  });

  console.log('[ECO DEBUG] fetchInventoryItems - pobrano:', Object.keys(items).length, 'pozycji');
  // Pokaż przykładowe 3 pozycje z ich kluczowymi polami
  const sampleItems = Object.values(items).slice(0, 3);
  sampleItems.forEach((item, i) => {
    console.log(`[ECO DEBUG] Przykład item[${i}]:`, JSON.stringify({
      id: item.id,
      name: item.name,
      category: item.category,
      type: item.type,
      isRawMaterial: item.isRawMaterial,
      isFinishedProduct: item.isFinishedProduct,
      quantity: item.quantity
    }));
  });

  return items;
};

/**
 * Pobiera WSZYSTKIE transakcje magazynowe (bez filtrowania po datach).
 * 
 * Forward calculation wymaga kompletnej historii transakcji, ponieważ
 * stan na dowolną datę obliczany jest jako suma transakcji od początku.
 * 
 * Używamy dwóch zapytań (po transactionDate i createdAt) i łączymy wyniki,
 * ponieważ różne serwisy zapisują transakcje z różnymi polami dat:
 * - inventoryOperationsService: transactionDate (bez createdAt)
 * - productionService: createdAt (bez transactionDate)
 * Firestore orderBy wyklucza dokumenty bez danego pola.
 */
const fetchTransactions = async () => {
  // Dwa zapytania - po różnych polach dat
  const qByTransactionDate = query(
    collection(db, INVENTORY_TRANSACTIONS_COLLECTION),
    orderBy('transactionDate', 'desc')
  );
  const qByCreatedAt = query(
    collection(db, INVENTORY_TRANSACTIONS_COLLECTION),
    orderBy('createdAt', 'desc')
  );

  const [snapByTxDate, snapByCreatedAt] = await Promise.all([
    getDocs(qByTransactionDate),
    getDocs(qByCreatedAt)
  ]);

  // Merge bez duplikatów (po doc.id)
  const txMap = new Map();
  snapByTxDate.forEach(doc => {
    txMap.set(doc.id, { id: doc.id, ...doc.data() });
  });
  snapByCreatedAt.forEach(doc => {
    if (!txMap.has(doc.id)) {
      txMap.set(doc.id, { id: doc.id, ...doc.data() });
    }
  });

  const transactions = Array.from(txMap.values());

  console.log('[ECO DEBUG] fetchTransactions - pobrano z Firestore:', transactions.length, 'transakcji');
  console.log('[ECO DEBUG]   z transactionDate:', snapByTxDate.size, '| z createdAt:', snapByCreatedAt.size);
  if (transactions.length > 0) {
    const samples = transactions.slice(0, 3);
    samples.forEach((tx, i) => {
      console.log(`[ECO DEBUG] Przykład tx[${i}]:`, JSON.stringify({
        id: tx.id,
        type: tx.type,
        itemId: tx.itemId,
        itemName: tx.itemName,
        quantity: tx.quantity,
        reason: tx.reason,
        moNumber: tx.moNumber,
        taskId: tx.taskId,
        referenceId: tx.referenceId,
        createdAt: tx.createdAt,
        transactionDate: tx.transactionDate
      }));
    });
  }

  return transactions;
};

/**
 * Pobiera partie magazynowe
 */
const fetchBatches = async () => {
  const q = query(collection(db, INVENTORY_BATCHES_COLLECTION));
  const snapshot = await getDocs(q);
  const batches = [];
  snapshot.forEach(doc => {
    batches.push({ id: doc.id, ...doc.data() });
  });
  return batches;
};

/**
 * Pobiera zadania produkcyjne (MO) w zakresie dat.
 * Pobieramy wszystkie zadania (bez orderBy, bo nie wszystkie mają createdAt)
 * i filtrujemy po dacie w JS.
 */
const fetchProductionTasks = async (dateFrom, dateTo) => {
  const q = query(collection(db, PRODUCTION_TASKS_COLLECTION));

  const snapshot = await getDocs(q);
  const tasks = [];
  snapshot.forEach(doc => {
    const data = doc.data();
    // Filtrujemy po dacie zakończenia, scheduledDate lub createdAt
    const taskDate = safeConvertDate(data.completionDate) || safeConvertDate(data.scheduledDate) || safeConvertDate(data.createdAt);
    if (isDateInRange(taskDate, dateFrom, dateTo)) {
      tasks.push({ id: doc.id, ...data });
    }
  });

  console.log('[ECO DEBUG] fetchProductionTasks - pobrano:', tasks.length, 'zadań w okresie (z', snapshot.size, 'łącznie)');
  if (tasks.length > 0) {
    const statusCount = {};
    tasks.forEach(t => { statusCount[t.status || 'brak'] = (statusCount[t.status || 'brak'] || 0) + 1; });
    console.log('[ECO DEBUG] Statusy zadań w okresie:', statusCount);
  }

  return tasks;
};

/**
 * Pobiera CMR i ich pozycje w zakresie dat
 */
const fetchCmrData = async (dateFrom, dateTo) => {
  const cmrQuery = query(
    collection(db, CMR_COLLECTION),
    orderBy('issueDate', 'desc')
  );

  const cmrSnapshot = await getDocs(cmrQuery);
  const cmrs = [];
  cmrSnapshot.forEach(doc => {
    const data = doc.data();
    const cmrDate = safeConvertDate(data.issueDate) || safeConvertDate(data.deliveryDate);
    if (isDateInRange(cmrDate, dateFrom, dateTo)) {
      cmrs.push({ id: doc.id, ...data });
    }
  });

  // Pobierz pozycje CMR
  const cmrItemsQuery = query(collection(db, CMR_ITEMS_COLLECTION));
  const cmrItemsSnapshot = await getDocs(cmrItemsQuery);
  const cmrItems = [];
  cmrItemsSnapshot.forEach(doc => {
    cmrItems.push({ id: doc.id, ...doc.data() });
  });

  return { cmrs, cmrItems };
};

/**
 * Pobiera receptury z certyfikatem EKO (certifications.eco === true)
 */
const fetchEcoRecipes = async () => {
  const q = query(
    collection(db, RECIPES_COLLECTION),
    where('certifications.eco', '==', true)
  );
  const snapshot = await getDocs(q);
  const recipes = [];
  snapshot.forEach(doc => {
    recipes.push({ id: doc.id, ...doc.data() });
  });
  console.log('[EKO] Pobrano receptur EKO:', recipes.length);
  return recipes;
};

/**
 * Buduje zbiory ID pozycji magazynowych powiązanych z recepturami EKO.
 * - ecoRawMaterialIds: ID surowców (z ingredients[].id receptur EKO)
 * - ecoFinishedProductIds: ID wyrobów gotowych (z inventoryItems gdzie recipeId === eco recipe ID
 *   ORAZ z recipe.productMaterialId jeśli ustawione)
 * 
 * Powiązanie receptura → wyrób gotowy jest odwrotne:
 * to pozycja magazynowa (inventory) ma pole recipeId wskazujące na recepturę,
 * a nie receptura na pozycję magazynową.
 */
const buildEcoItemIds = (ecoRecipes, inventoryItems) => {
  const ecoRawMaterialIds = new Set();
  const ecoFinishedProductIds = new Set();
  const ecoRecipeIds = new Set(ecoRecipes.map(r => r.id));

  for (const recipe of ecoRecipes) {
    // Składniki receptury → surowce EKO
    if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
      for (const ing of recipe.ingredients) {
        if (ing.id) {
          ecoRawMaterialIds.add(ing.id);
        }
      }
    }
    // Wyrób gotowy receptury → wyrób EKO (jeśli productMaterialId ustawione)
    if (recipe.productMaterialId) {
      ecoFinishedProductIds.add(recipe.productMaterialId);
    }
  }

  // Powiązanie odwrotne: pozycje magazynowe z recipeId wskazującym na recepturę EKO
  for (const item of Object.values(inventoryItems)) {
    if (item.recipeId && ecoRecipeIds.has(item.recipeId)) {
      ecoFinishedProductIds.add(item.id);
    }
  }

  console.log('[EKO] Zbudowano zbiory ID — surowce EKO:', ecoRawMaterialIds.size, 
    ', wyroby EKO:', ecoFinishedProductIds.size,
    ', (z recipeId:', Object.values(inventoryItems).filter(i => i.recipeId && ecoRecipeIds.has(i.recipeId)).length, ')');
  return { ecoRawMaterialIds, ecoFinishedProductIds };
};

// ============================================================
// LOGIKA OBLICZENIOWA
// ============================================================

/**
 * Normalizuje typ transakcji do uppercase z ujednoliconymi separatorami.
 * W bazie danych istnieją transakcje z różnym zapisem:
 * - 'RECEIVE' / 'receive', 'ISSUE' / 'issue' (case)
 * - 'adjustment-remove' vs 'adjustment_remove' (separator)
 * - 'adjustment-add' vs 'adjustment_add' (separator)
 * Ta funkcja zamienia podkreślniki na myślniki i uppercase.
 */
const normalizeTransactionType = (type) => {
  if (!type) return '';
  return type.replace(/_/g, '-').toUpperCase();
};

/**
 * Sprawdza czy transakcja jest typu RECEIVE (case-insensitive)
 */
const isReceiveTransaction = (tx) => normalizeTransactionType(tx.type) === 'RECEIVE';

/**
 * Sprawdza czy transakcja jest typu ISSUE (case-insensitive)
 */
const isIssueTransaction = (tx) => normalizeTransactionType(tx.type) === 'ISSUE';

/**
 * Sprawdza czy transakcja RECEIVE pochodzi z zamówienia zakupowego (PO).
 * Ręczne dodania do magazynu to też RECEIVE, ale bez powiązania z PO.
 * PO-linked mają: source='purchase', reason='purchase', lub orderId.
 */
const isPurchaseReceive = (tx) => {
  return isReceiveTransaction(tx) && 
    (tx.source === 'purchase' || tx.reason === 'purchase' || !!tx.orderId);
};

/**
 * Sprawdza czy transakcja jest powiązana z produkcją.
 * Uwzględnia zarówno pola moNumber/taskId jak i reason z productionService.
 */
const isProductionRelated = (tx) => {
  return !!(tx.moNumber || tx.taskId || tx.reason === 'Zużycie w produkcji' || tx.reason === 'Z produkcji (nowa partia)' || tx.reason === 'Z produkcji (dodano do istniejącej partii)');
};

/**
 * Sprawdza czy transakcja jest konsumpcją produkcyjną (wydanie materiału do produkcji).
 * Obejmuje:
 * - adjustment_remove / adjustment-remove z reason "Konsumpcja w produkcji"
 * - ISSUE powiązane z produkcją (moNumber, taskId, reason)
 */
const isProductionConsumption = (tx) => {
  const type = normalizeTransactionType(tx.type);
  // adjustment-remove/adjustment_remove z reason "Konsumpcja w produkcji"
  if (type === 'ADJUSTMENT-REMOVE' && tx.reason === 'Konsumpcja w produkcji') {
    return true;
  }
  // ISSUE powiązane z produkcją
  if (type === 'ISSUE' && isProductionRelated(tx)) {
    return true;
  }
  return false;
};

/**
 * Oblicza stan magazynowy na podaną datę metodą FORWARD (sumowanie transakcji od początku).
 * 
 * Niezależny od aktualnego stanu w bazie (material.quantity) — opiera się
 * wyłącznie na przefiltrowanych (valid) transakcjach magazynowych.
 * Dzięki temu raport jest odporny na zmiany bieżącego stanu magazynowego.
 * 
 * Metoda: sumuje wszystkie transakcje "add" i odejmuje "remove" aż do cutoffDate.
 * 
 * @param {string} itemId - ID produktu
 * @param {Array} transactions - przefiltrowane (valid) transakcje (bez osierooconych)
 * @param {Date} cutoffDate - data graniczna
 * @param {boolean} inclusive - true: txDate <= cutoffDate, false: txDate < cutoffDate
 */
const calculateStockForward = (itemId, transactions, cutoffDate, inclusive = false) => {
  let stock = 0;

  for (const tx of transactions) {
    if (tx.itemId !== itemId) continue;
    const txDate = safeConvertDate(tx.createdAt) || safeConvertDate(tx.transactionDate);
    if (!txDate) continue;

    // Filtruj po dacie: inclusive → txDate <= cutoffDate, exclusive → txDate < cutoffDate
    if (inclusive ? txDate > cutoffDate : txDate >= cutoffDate) continue;

    const qty = parseFloat(tx.quantity) || 0;
    const type = normalizeTransactionType(tx.type);

    switch (type) {
      case 'RECEIVE':
      case 'ADJUSTMENT-ADD':
      case 'STOCKTAKING-COMPLETED':
      case 'PRODUCTION-SESSION-ADD':
      case 'PRODUCTION-CORRECTION-ADD':
        stock += qty;
        break;
      case 'ISSUE':
      case 'ADJUSTMENT-REMOVE':
      case 'PRODUCTION-CORRECTION-REMOVE':
        stock -= qty;
        break;
      // TRANSFER, booking - nie wpływają na ogólny stan
      default:
        break;
    }
  }

  return Math.max(0, parseFloat(stock.toFixed(3)));
};

/**
 * Generuje dane Tab.1 - Dostawcy
 * 
 * Kolumny: Nazwa dostawcy | Adres | Rodzaj produktu | Ilość w tonach | 
 *          Jednostka cert. | Nr certyfikatu | Certyfikat ważny od...do...
 */
const generateSuppliersData = (suppliers, purchaseOrders, inventoryItems, ecoRawMaterialIds = null) => {
  // Grupuj PO wg dostawcy - surowce i opakowania jednostkowe
  const supplierProducts = {};

  for (const po of purchaseOrders) {
    if (!po.supplierId || !po.items) continue;
    const supplier = suppliers[po.supplierId];
    if (!supplier) continue;

    for (const item of po.items) {
      const itemId = item.itemId || item.inventoryItemId;
      const inventoryItem = itemId ? inventoryItems[itemId] : null;
      
      // Filtruj surowce i opakowania jednostkowe
      const isRelevantItem = inventoryItem && (
        inventoryItem.isRawMaterial === true || 
        inventoryItem.type === 'raw' || 
        inventoryItem.category === 'Surowce' ||
        inventoryItem.category === 'Opakowania jednostkowe'
      );
      if (!isRelevantItem) continue;

      // Tryb EKO: pokaż tylko pozycje powiązane z recepturami EKO
      if (ecoRawMaterialIds && !ecoRawMaterialIds.has(itemId)) continue;

      const itemName = item.name || inventoryItem?.name || 'Nieznany';
      const unit = item.unit || inventoryItem?.unit || 'kg';
      const quantity = parseFloat(item.quantity) || 0;

      if (!supplierProducts[po.supplierId]) {
        supplierProducts[po.supplierId] = {
          supplier,
          products: {} // klucz = nazwa produktu
        };
      }

      if (!supplierProducts[po.supplierId].products[itemName]) {
        supplierProducts[po.supplierId].products[itemName] = {
          name: itemName,
          unit,
          totalQuantity: 0
        };
      }
      supplierProducts[po.supplierId].products[itemName].totalQuantity += quantity;
    }
  }

  // Konwertuj na wiersze tabeli
  const rows = [];
  for (const suppData of Object.values(supplierProducts)) {
    const { supplier, products } = suppData;
    const productList = Object.values(products);

    for (const product of productList) {
      const qty = parseFloat(product.totalQuantity) || 0;
      rows.push({
        supplierName: supplier.name || '',
        address: formatSupplierAddress(supplier),
        productType: product.name,
        quantity: qty,
        unit: product.unit || '',
        certAuthority: supplier.ecoCertAuthority || '', // wymaga rozszerzenia modelu
        certNumber: supplier.ecoCertNumber || '',       // wymaga rozszerzenia modelu
        certValidFrom: supplier.ecoCertValidFrom ? formatDateForExport(safeConvertDate(supplier.ecoCertValidFrom)) : '',
        certValidTo: supplier.ecoCertValidTo ? formatDateForExport(safeConvertDate(supplier.ecoCertValidTo)) : '',
      });
    }
  }

  return rows;
};

/**
 * Konwertuje ilość na tony
 */
const convertToTons = (quantity, unit) => {
  if (!quantity) return 0;
  const q = parseFloat(quantity);
  switch ((unit || '').toLowerCase()) {
    case 'kg':
      return parseFloat((q / 1000).toFixed(4));
    case 't':
    case 'tona':
    case 'tony':
      return parseFloat(q.toFixed(4));
    case 'g':
      return parseFloat((q / 1000000).toFixed(6));
    case 'l':
    case 'litr':
      // Przybliżona konwersja - 1l ≈ 1kg
      return parseFloat((q / 1000).toFixed(4));
    default:
      // Dla szt, op, etc. - zwracamy surową ilość z uwagą
      return q;
  }
};

/**
 * Generuje dane Tab.2 - Surowce (rozliczenie przepływu)
 * 
 * Kolumny: surowce | początkowy stan magazynowy | zakup surowca | 
 *          produkcja własna (półfabrykaty) | zużycie surowca do produkcji |
 *          sprzedaż surowca | inne rozchody surowca | końcowy stan magazynowy
 */
const generateRawMaterialsData = (
  inventoryItems, 
  transactions, 
  productionTasks, 
  dateFrom, 
  dateTo,
  existingBatchIds = new Set(),
  ecoRawMaterialIds = null
) => {
  // Filtruj surowce (uwzględnij category, isRawMaterial i type)
  let rawMaterials = Object.values(inventoryItems).filter(
    item => item.isRawMaterial === true || item.type === 'raw' || item.category === 'Surowce'
  );

  // Tryb EKO: filtruj tylko surowce powiązane z recepturami EKO
  if (ecoRawMaterialIds) {
    rawMaterials = rawMaterials.filter(item => ecoRawMaterialIds.has(item.id));
    console.log('[EKO] Tryb EKO - surowce po filtrze receptur EKO:', rawMaterials.length);
  }

  console.log('[ECO DEBUG] ====== generateRawMaterialsData ======');
  console.log('[ECO DEBUG] Zakres dat:', dateFrom, '-', dateTo);
  console.log('[ECO DEBUG] Łącznie pozycji magazynowych:', Object.keys(inventoryItems).length);
  console.log('[ECO DEBUG] Znaleziono surowców:', rawMaterials.length);
  console.log('[ECO DEBUG] Łącznie transakcji w bazie:', transactions.length);

  // Pokaż unikalne typy transakcji w bazie
  const uniqueTypes = [...new Set(transactions.map(tx => tx.type))];
  console.log('[ECO DEBUG] Unikalne typy transakcji:', uniqueTypes);

  // Filtruj transakcje w okresie
  const periodTransactions = transactions.filter(tx => {
    const txDate = safeConvertDate(tx.createdAt) || safeConvertDate(tx.transactionDate);
    return isDateInRange(txDate, dateFrom, dateTo);
  });

  console.log('[ECO DEBUG] Transakcje w wybranym okresie:', periodTransactions.length);

  // Pokaż typy transakcji w okresie
  const periodTypes = {};
  periodTransactions.forEach(tx => {
    const t = tx.type || 'BRAK_TYPU';
    periodTypes[t] = (periodTypes[t] || 0) + 1;
  });
  console.log('[ECO DEBUG] Typy transakcji w okresie:', periodTypes);

  const rows = [];

  for (const material of rawMaterials) {
    const itemId = material.id;
    const itemTransactions = periodTransactions.filter(tx => tx.itemId === itemId);

    // Logi dla pierwszych 3 surowców (żeby nie zaśmiecać konsoli)
    if (rows.length < 3) {
      console.log(`[ECO DEBUG] --- Surowiec: "${material.name}" (id: ${itemId}) ---`);
      console.log(`[ECO DEBUG]   Transakcje dla tego surowca w okresie: ${itemTransactions.length}`);
      if (itemTransactions.length > 0) {
        itemTransactions.forEach((tx, i) => {
          console.log(`[ECO DEBUG]   tx[${i}]: type="${tx.type}", qty=${tx.quantity}, reason="${tx.reason || ''}", moNumber="${tx.moNumber || ''}", taskId="${tx.taskId || ''}", referenceId="${tx.referenceId || ''}", itemId="${tx.itemId}"`);
        });
      }
      
      // Pokaż ile transakcji pasuje do każdego filtra
      const receivePOPurchase = itemTransactions.filter(tx => isPurchaseReceive(tx));
      const receiveManual = itemTransactions.filter(tx => isReceiveTransaction(tx) && !isProductionRelated(tx) && !isPurchaseReceive(tx));
      const receiveProd = itemTransactions.filter(tx => isReceiveTransaction(tx) && isProductionRelated(tx));
      const consumptionTxs = itemTransactions.filter(tx => isProductionConsumption(tx));
      const consumptionFromTxSum = consumptionTxs.reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0);
      const issueSales = itemTransactions.filter(tx => isIssueTransaction(tx) && !isProductionRelated(tx) && tx.referenceId);
      console.log(`[ECO DEBUG]   Zakup z PO (RECEIVE + source/orderId): ${receivePOPurchase.length} tx, suma=${receivePOPurchase.reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0)}`);
      console.log(`[ECO DEBUG]   Ręczne dodanie (RECEIVE bez PO/prod): ${receiveManual.length} tx, suma=${receiveManual.reduce((s, tx) => s + (parseFloat(tx.quantity) || 0), 0)}`);
      console.log(`[ECO DEBUG]   Produkcja własna (RECEIVE z prod): ${receiveProd.length} tx`);
      console.log(`[ECO DEBUG]   Konsumpcja z tx "ilość wydana" (reason="Konsumpcja w produkcji" + ISSUE prod): ${consumptionTxs.length} tx, suma=${consumptionFromTxSum}`);
      // Ilość skonsumowana z MO consumedMaterials
      let consumedFromMO = 0;
      for (const task of productionTasks) {
        if (task.status !== 'Zakończone' && task.status !== 'Potwierdzenie zużycia' && task.status !== 'completed') continue;
        for (const consumed of (task.consumedMaterials || [])) {
          if (consumed.materialId === itemId) {
            consumedFromMO += parseFloat(consumed.quantity) || 0;
          }
        }
      }
      console.log(`[ECO DEBUG]   Konsumpcja z MO "ilość skonsumowana" (consumedMaterials): suma=${consumedFromMO}`);
      console.log(`[ECO DEBUG]   Sprzedaż (ISSUE bez prod z ref): ${issueSales.length} tx`);
      if (consumptionTxs.length > 0) {
        consumptionTxs.forEach((tx, i) => {
          console.log(`[ECO DEBUG]     konsumpcja[${i}]: type="${tx.type}" qty=${tx.quantity} reason="${tx.reason}" ref="${tx.reference || ''}"`);
        });
      }
    }

    // Początkowy stan magazynowy — forward calculation
    // Suma wszystkich valid transakcji PRZED dateFrom (niezależna od aktualnego stanu w bazie)
    const openingStock = calculateStockForward(itemId, transactions, dateFrom, false);

    // Zakup surowca - TYLKO transakcje RECEIVE powiązane z PO (source='purchase' lub orderId)
    // Ręczne dodania do magazynu (RECEIVE bez PO) nie są zakupami
    const purchases = itemTransactions
      .filter(tx => isPurchaseReceive(tx))
      .reduce((sum, tx) => sum + (parseFloat(tx.quantity) || 0), 0);

    // Produkcja własna (półfabrykaty) - RECEIVE powiązane z produkcją
    const ownProduction = itemTransactions
      .filter(tx => isReceiveTransaction(tx) && isProductionRelated(tx))
      .reduce((sum, tx) => sum + (parseFloat(tx.quantity) || 0), 0);

    // Przychody ręczne (RECEIVE bez PO i bez produkcji) — bazowa część "Inne przychody"
    // Korekty inwentaryzacyjne (ADJUSTMENT-ADD/REMOVE) NIE są tu liczone —
    // trafiają do residual i są automatycznie domykane w bilansie poniżej.
    const rawOtherIncome = itemTransactions
      .filter(tx => isReceiveTransaction(tx) && !isProductionRelated(tx) && !isPurchaseReceive(tx))
      .reduce((sum, tx) => sum + (parseFloat(tx.quantity) || 0), 0);

    // Zużycie do produkcji
    // Priorytet 1: "ilość wydana" — transakcje adjustment_remove/ISSUE z reason "Konsumpcja w produkcji"
    // Priorytet 2 (fallback): "ilość skonsumowana" — z task.consumedMaterials w zadaniach produkcyjnych
    const productionConsumption = (() => {
      // Priorytet 1: transakcje konsumpcji produkcyjnej ("ilość wydana produkcji")
      const consumptionFromTx = itemTransactions
        .filter(tx => isProductionConsumption(tx))
        .reduce((sum, tx) => sum + (parseFloat(tx.quantity) || 0), 0);

      if (consumptionFromTx > 0) {
        console.log(`[ECO DEBUG]   Zużycie "${material.name}": z transakcji (ilość wydana) = ${consumptionFromTx}`);
        return consumptionFromTx;
      }

      // Priorytet 2 (fallback): "ilość skonsumowana" z task.consumedMaterials
      // UWAGA: sprawdzamy czy partia (batchId) nadal istnieje — pomijamy wpisy z usuniętych partii
      let total = 0;
      for (const task of productionTasks) {
        const status = task.status;
        if (status !== 'Zakończone' && status !== 'Potwierdzenie zużycia' && status !== 'completed') continue;
        
        const consumedMaterials = task.consumedMaterials || [];
        
        for (const consumed of consumedMaterials) {
          if (consumed.materialId === itemId) {
            // Jeśli consumedMaterial ma batchId — sprawdź czy partia istnieje
            if (consumed.batchId && existingBatchIds.size > 0 && !existingBatchIds.has(consumed.batchId)) {
              continue; // Pomiń wpis z usuniętej partii
            }
            total += parseFloat(consumed.quantity) || 0;
          }
        }
      }
      
      if (total > 0) {
        console.log(`[ECO DEBUG]   Zużycie "${material.name}": z consumedMaterials (ilość skonsumowana) = ${total}`);
        return total;
      }

      // Ostateczny fallback: actualMaterialUsage / planowana ilość z MO
      let moTotal = 0;
      for (const task of productionTasks) {
        const status = task.status;
        if (status !== 'Zakończone' && status !== 'Potwierdzenie zużycia' && status !== 'completed') continue;
        
        const materials = task.materials || [];
        const actualUsage = task.actualMaterialUsage || {};
        
        for (const mat of materials) {
          const inventoryItemId = mat.inventoryItemId || mat.id;
          if (inventoryItemId !== itemId) continue;
          
          const consumed = actualUsage[mat.id] !== undefined
            ? parseFloat(actualUsage[mat.id]) || 0
            : parseFloat(mat.quantity) || 0;
          
          moTotal += consumed;
        }
      }
      if (moTotal > 0) {
        console.log(`[ECO DEBUG]   Zużycie "${material.name}": z MO actualUsage/planned (ostateczny fallback) = ${moTotal}`);
      }
      return moTotal;
    })();

    // Sprzedaż surowca - ISSUE z referencją do zamówienia (bez powiązania z produkcją)
    const sales = itemTransactions
      .filter(tx => isIssueTransaction(tx) && !isProductionRelated(tx) && tx.referenceId)
      .reduce((sum, tx) => sum + (parseFloat(tx.quantity) || 0), 0);

    // Końcowy stan magazynowy — forward calculation
    // Suma wszystkich valid transakcji DO dateTo włącznie (niezależna od aktualnego stanu w bazie)
    const closingStock = calculateStockForward(itemId, transactions, dateTo, true);

    // --- Domknięcie bilansu ---
    // closingStock (forward) jest źródłem prawdy. classifiedBalance to suma
    // sklasyfikowanych przepływów. Różnica (residual) wynika z niesklasyfikowanych
    // korekt inwentaryzacyjnych (ADJUSTMENT-ADD/REMOVE, korekty partii, duplikaty).
    //
    // residual > 0 → niesklasyfikowane rozchody (straty, korekty −) → Inne rozchody
    // residual < 0 → niesklasyfikowane przychody (korekty +)       → dodaj do Inne przychody
    const classifiedBalance = openingStock + purchases + rawOtherIncome + ownProduction - productionConsumption - sales;
    const residual = parseFloat((classifiedBalance - closingStock).toFixed(3));

    const otherExpenses = Math.max(0, residual);
    const otherIncome = rawOtherIncome + Math.max(0, -residual);

    // Bilans weryfikacyjny (powinien zawsze wynosić 0 dzięki domknięciu)
    const calculatedClosing = openingStock + purchases + otherIncome + ownProduction - productionConsumption - sales - otherExpenses;

    // === SZCZEGÓŁOWE LOGI DLA POZYCJI Z TRANSAKCJAMI ===
    if (itemTransactions.length > 0) {
      const balanceDiff = closingStock - calculatedClosing;
      // Loguj szczególnie gdy bilans się nie zgadza lub są duże inne rozchody
      if (Math.abs(balanceDiff) > 0.01 || otherExpenses > 0 || productionConsumption > 0) {
        console.log(`[ECO DETAIL] === ${material.name} (id: ${itemId}) ===`);
        console.log(`[ECO DETAIL]   Stan początkowy (forward): ${openingStock}`);
        console.log(`[ECO DETAIL]   Zakup (PO): ${purchases}, Inne przychody: ${otherIncome} (ręczne: ${rawOtherIncome}, korekty: ${Math.max(0, -residual)}), Produkcja własna: ${ownProduction}`);
        console.log(`[ECO DETAIL]   Zużycie do produkcji: ${productionConsumption}`);
        console.log(`[ECO DETAIL]   Sprzedaż: ${sales}, Inne rozchody (residualne): ${otherExpenses}`);
        console.log(`[ECO DETAIL]   Stan końcowy (forward): ${closingStock}`);
        console.log(`[ECO DETAIL]   Obliczony z bilansu: ${calculatedClosing}`);
        console.log(`[ECO DETAIL]   Różnica bilansu: ${balanceDiff}`);
        
        // Pokaż WSZYSTKIE transakcje tego surowca z podziałem na kategorie
        console.log(`[ECO DETAIL]   --- Wszystkie transakcje (${itemTransactions.length}) ---`);
        itemTransactions.forEach((tx, i) => {
          const type = normalizeTransactionType(tx.type);
          let bucket = '???';
          if (isPurchaseReceive(tx)) bucket = 'ZAKUP (PO)';
          else if (isReceiveTransaction(tx) && !isProductionRelated(tx)) bucket = 'INNE PRZYCHODY (ręczne)';
          else if (isReceiveTransaction(tx) && isProductionRelated(tx)) bucket = 'PROD.WŁASNA';
          else if (isProductionConsumption(tx)) bucket = 'ZUŻYCIE PROD.';
          else if (isIssueTransaction(tx) && !isProductionRelated(tx) && tx.referenceId) bucket = 'SPRZEDAŻ';
          else if (type === 'ADJUSTMENT-ADD' || type === 'STOCKTAKING-COMPLETED' || type === 'PRODUCTION-SESSION-ADD' || type === 'PRODUCTION-CORRECTION-ADD') bucket = 'KOREKTA+ (przychód)';
          else if (type === 'ADJUSTMENT-REMOVE') bucket = 'KOREKTA- (rozchód)';
          else if (type === 'TRANSFER') bucket = 'TRANSFER';
          else if (isIssueTransaction(tx) && !isProductionRelated(tx) && !tx.referenceId) bucket = 'ISSUE (inne)';
          else bucket = `INNE (type=${tx.type})`;
          
          console.log(`[ECO DETAIL]   tx[${i}]: [${bucket}] type="${tx.type}" normalizedType="${type}" qty=${tx.quantity} reason="${tx.reason || ''}" ref="${tx.reference || ''}" moNumber="${tx.moNumber || ''}" taskId="${tx.taskId || ''}`);
        });
      }
    }

    rows.push({
      name: material.name || '',
      unit: material.unit || 'kg',
      openingStock: parseFloat(openingStock.toFixed(3)),
      purchases: parseFloat(purchases.toFixed(3)),
      otherIncome: parseFloat(otherIncome.toFixed(3)),
      ownProduction: parseFloat(ownProduction.toFixed(3)),
      productionConsumption: parseFloat(productionConsumption.toFixed(3)),
      sales: parseFloat(sales.toFixed(3)),
      otherExpenses: parseFloat(otherExpenses.toFixed(3)),
      closingStock: parseFloat(closingStock.toFixed(3)),
      calculatedClosing: parseFloat(calculatedClosing.toFixed(3)),
      balanceDiff: parseFloat((closingStock - calculatedClosing).toFixed(3))
    });
  }

  // Sortuj po nazwie
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
};

/**
 * Generuje dane Tab.3 - Wyroby gotowe (rozliczenie przepływu)
 * 
 * Kolumny: produkt | początkowy stan magazynowy | zakup produktu |
 *          producja własna | sprzedaż produktu | inne rozchody produktu |
 *          końcowy stan magazynowy
 */
const generateFinishedProductsData = (
  inventoryItems,
  transactions,
  productionTasks,
  cmrs,
  cmrItems,
  dateFrom,
  dateTo,
  existingBatchIds = new Set(),
  ecoFinishedProductIds = null
) => {
  // Filtruj wyroby gotowe (uwzględnij category, isFinishedProduct i type)
  let finishedProducts = Object.values(inventoryItems).filter(
    item => item.isFinishedProduct === true || item.type === 'finished' || 
            item.category === 'Gotowe produkty' || item.category === 'Produkty gotowe'
  );

  // Tryb EKO: filtruj tylko wyroby gotowe powiązane z recepturami EKO
  if (ecoFinishedProductIds) {
    finishedProducts = finishedProducts.filter(item => ecoFinishedProductIds.has(item.id));
    console.log('[EKO] Tryb EKO - wyroby gotowe po filtrze receptur EKO:', finishedProducts.length);
  }

  // Transakcje w okresie
  const periodTransactions = transactions.filter(tx => {
    const txDate = safeConvertDate(tx.createdAt) || safeConvertDate(tx.transactionDate);
    return isDateInRange(txDate, dateFrom, dateTo);
  });

  // MO w okresie dla wyrobów gotowych (uwzględnij też 'Potwierdzenie zużycia')
  const completedTasks = productionTasks.filter(
    task => task.status === 'Zakończone' || task.status === 'completed' || task.status === 'Potwierdzenie zużycia'
  );

  const rows = [];

  for (const product of finishedProducts) {
    const itemId = product.id;
    const itemTransactions = periodTransactions.filter(tx => tx.itemId === itemId);

    // Początkowy stan — forward calculation
    // Suma wszystkich valid transakcji PRZED dateFrom (niezależna od aktualnego stanu w bazie)
    const openingStock = calculateStockForward(itemId, transactions, dateFrom, false);

    // Zakup produktu - TYLKO RECEIVE powiązane z PO
    const purchases = itemTransactions
      .filter(tx => isPurchaseReceive(tx))
      .reduce((sum, tx) => sum + (parseFloat(tx.quantity) || 0), 0);

    // Produkcja własna - z danych MO (najbardziej wiarygodne źródło)
    // Stare transakcje RECEIVE z produkcji mogą nie mieć flag moNumber/taskId,
    // więc nie można polegać na transakcjach. MO dane są autorytatywne.
    const ownProduction = (() => {
      let total = 0;
      for (const task of completedTasks) {
        if (task.inventoryItemId === itemId) {
          total += parseFloat(task.totalCompletedQuantity || task.completedQuantity || task.finalQuantity || 0);
        }
      }
      return total;
    })();

    // Inne przychody - RECEIVE niezwiązane z produkcją ani z PO + korekty na plus
    // KLUCZOWE: odliczamy produkcję pokrytą przez MO, żeby uniknąć podwójnego liczenia.
    // Stare RECEIVE z produkcji (bez flag) trafiają do nonProdReceive — musimy je odjąć.
    // Przychody ręczne — bazowa część "Inne przychody" (bez korekt inwentaryzacyjnych)
    const rawOtherIncome = (() => {
      // RECEIVE z flagami produkcyjnymi (moNumber/taskId) — już policzone w ownProduction
      const prodReceive = itemTransactions
        .filter(tx => isReceiveTransaction(tx) && isProductionRelated(tx))
        .reduce((sum, tx) => sum + (parseFloat(tx.quantity) || 0), 0);

      // RECEIVE bez flag produkcyjnych i bez PO — zawiera:
      //   a) Stare RECEIVE z produkcji (bez flag) — to duplikat ownProduction
      //   b) Prawdziwe ręczne dodania
      const nonProdNonPoReceive = itemTransactions
        .filter(tx => isReceiveTransaction(tx) && !isProductionRelated(tx) && !isPurchaseReceive(tx))
        .reduce((sum, tx) => sum + (parseFloat(tx.quantity) || 0), 0);

      // Ile produkcji z MO nie jest pokryte przez flagowane transakcje?
      // Tyle "kradniemy" z nonProdNonPoReceive (bo to stare RECEIVE z produkcji)
      const unaccountedProduction = Math.max(0, ownProduction - prodReceive);
      const genuineOtherReceive = Math.max(0, nonProdNonPoReceive - unaccountedProduction);

      if (genuineOtherReceive > 0) {
        console.log(`[ECO DEBUG FIN] "${product.name}": rawOtherIncome: genuineOtherReceive=${genuineOtherReceive} (prodReceive=${prodReceive}, nonProdNonPoReceive=${nonProdNonPoReceive}, unaccountedProd=${unaccountedProduction})`);
      }

      return genuineOtherReceive;
    })();

    // Sprzedaż - obliczana z CMR + bezpośrednie ISSUE (nie-CMR, nie-produkcyjne)
    //
    // DLACZEGO CMR?
    // Gdy CMR przechodzi na "W transporcie", tworzone są rezerwacje (booking).
    // Transakcje ISSUE powstają dopiero przy statusie "Dostarczone".
    // Jeśli CMR jest nadal w transporcie, transakcji ISSUE brak — trzeba
    // polegać na danych CMR (linkedBatches), by wychwycić faktyczne wysyłki.
    //
    // Statusy CMR liczące się jako sprzedaż:
    //   "W transporcie", "Dostarczone", "Zakończony"
    // Pomijane: "Szkic", "Wystawiony", "Anulowany"
    const sales = (() => {
      const SHIPPED_STATUSES = new Set(['W transporcie', 'Dostarczone', 'Zakończony']);

      // 1) Sprzedaż z CMR — sumuj ilości z linkedBatches pasujących do itemId
      const periodCmrIds = new Set(
        cmrs
          .filter(c => SHIPPED_STATUSES.has(c.status))
          .map(c => c.id)
      );

      let cmrSalesTotal = 0;
      for (const ci of cmrItems) {
        if (!periodCmrIds.has(ci.cmrId)) continue;
        if (!ci.linkedBatches || ci.linkedBatches.length === 0) continue;

        const cmrItemQty = parseFloat(ci.quantity) || 0;
        if (cmrItemQty <= 0) continue;

        const totalBatchQty = ci.linkedBatches.reduce(
          (sum, b) => sum + (parseFloat(b.quantity) || 0), 0
        );
        if (totalBatchQty <= 0) continue;

        for (const batch of ci.linkedBatches) {
          if (batch.itemId === itemId) {
            const batchQty = parseFloat(batch.quantity) || 0;
            // Proporcjonalna ilość (identyczna logika jak processCmrDelivery)
            cmrSalesTotal += (batchQty / totalBatchQty) * cmrItemQty;
          }
        }
      }

      // 2) ISSUE niezwiązane z CMR ani produkcją (bezpośrednie wydania/sprzedaż)
      const nonCmrIssueSales = itemTransactions
        .filter(tx =>
          isIssueTransaction(tx) &&
          !isProductionRelated(tx) &&
          !tx.cmrNumber && !tx.cmrId &&
          !(tx.reference && tx.reference.startsWith('CMR '))
        )
        .reduce((sum, tx) => sum + (parseFloat(tx.quantity) || 0), 0);

      const total = cmrSalesTotal + nonCmrIssueSales;

      if (total > 0) {
        console.log(`[ECO DEBUG FIN] "${product.name}": sales=${total.toFixed(3)} (cmr=${cmrSalesTotal.toFixed(3)}, nonCmrIssue=${nonCmrIssueSales.toFixed(3)})`);
      }

      return total;
    })();

    // Końcowy stan — forward calculation
    // Suma wszystkich valid transakcji DO dateTo włącznie (niezależna od aktualnego stanu w bazie)
    const closingStock = calculateStockForward(itemId, transactions, dateTo, true);

    // --- Domknięcie bilansu (analogicznie jak dla surowców) ---
    // residual > 0 → niesklasyfikowane rozchody → Inne rozchody
    // residual < 0 → niesklasyfikowane przychody (korekty +) → dodaj do Inne przychody
    const classifiedBalance = openingStock + purchases + rawOtherIncome + ownProduction - sales;
    const residual = parseFloat((classifiedBalance - closingStock).toFixed(3));

    const otherExpenses = Math.max(0, residual);
    const otherIncome = rawOtherIncome + Math.max(0, -residual);

    // Znajdź powiązane MO dla szczegółów strat
    const relatedMOs = completedTasks.filter(task => {
      // MO produkujące ten wyrób - dopasuj po inventoryItemId, recipeId lub materiałach
      return task.inventoryItemId === itemId ||
             task.recipeId === product.recipeId || 
             (task.materials || []).some(m => m.itemId === itemId || m.inventoryItemId === itemId);
    });

    // Oblicz straty produkcyjne (planowana ilość vs rzeczywiście wyprodukowana)
    let plannedProduction = 0;
    let actualProduction = 0;
    for (const mo of relatedMOs) {
      plannedProduction += parseFloat(mo.quantity) || 0;
      // Faktyczna produkcja z originalQuantity vs quantity lub completionQuantity
      actualProduction += parseFloat(mo.completedQuantity || mo.quantity) || 0;
    }
    const productionLoss = Math.max(0, plannedProduction - actualProduction);

    rows.push({
      name: product.name || '',
      unit: product.unit || 'kg',
      openingStock: parseFloat(openingStock.toFixed(3)),
      purchases: parseFloat(purchases.toFixed(3)),
      otherIncome: parseFloat(otherIncome.toFixed(3)),
      ownProduction: parseFloat(ownProduction.toFixed(3)),
      sales: parseFloat(sales.toFixed(3)),
      otherExpenses: parseFloat(otherExpenses.toFixed(3)),
      closingStock: parseFloat(closingStock.toFixed(3)),
      plannedProduction: parseFloat(plannedProduction.toFixed(3)),
      actualProduction: parseFloat(actualProduction.toFixed(3)),
      productionLoss: parseFloat(productionLoss.toFixed(3))
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name));
  return rows;
};

// ============================================================
// GENEROWANIE RAPORTU
// ============================================================

/**
 * Pobiera wszystkie dane potrzebne do obrotówki EKO
 */
export const fetchEcoReportData = async (filters) => {
  const { dateFrom, dateTo, ecoMode = false } = filters;
  
  const startDate = new Date(dateFrom);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(dateTo);
  endDate.setHours(23, 59, 59, 999);

  console.log('[EKO Obrotówka] Pobieranie danych za okres:', startDate, '-', endDate);

  // Pobierz wszystkie dane równolegle
  const [
    suppliers,
    purchaseOrders,
    inventoryItems,
    transactions,
    batches,
    productionTasks,
    cmrData
  ] = await Promise.all([
    fetchSuppliers(),
    fetchPurchaseOrders(startDate, endDate),
    fetchInventoryItems(),
    fetchTransactions(),
    fetchBatches(),
    fetchProductionTasks(startDate, endDate),
    fetchCmrData(startDate, endDate)
  ]);

  console.log('[EKO Obrotówka] Pobrano dane:', {
    suppliers: Object.keys(suppliers).length,
    purchaseOrders: purchaseOrders.length,
    inventoryItems: Object.keys(inventoryItems).length,
    transactions: transactions.length,
    batches: batches.length,
    productionTasks: productionTasks.length,
    cmrs: cmrData.cmrs.length,
    cmrItems: cmrData.cmrItems.length
  });

  // Debug: pokaż statusy CMR i ile cmrItems ma linkedBatches
  if (cmrData.cmrs.length > 0) {
    const statusCounts = {};
    cmrData.cmrs.forEach(c => { statusCounts[c.status] = (statusCounts[c.status] || 0) + 1; });
    console.log('[EKO Obrotówka] CMR statusy:', statusCounts);
    const itemsWithBatches = cmrData.cmrItems.filter(ci => ci.linkedBatches && ci.linkedBatches.length > 0).length;
    console.log(`[EKO Obrotówka] cmrItems z linkedBatches: ${itemsWithBatches}/${cmrData.cmrItems.length}`);
  }

  // ============================================================
  // FILTROWANIE OSIEROOCONYCH TRANSAKCJI (z usuniętych partii)
  // ============================================================
  // Partie mogą być trwale usunięte (hard delete), ale ich transakcje zostają.
  // Takie "osierocone" transakcje zawyżają wartości raportu.
  //
  // Strategia: budujemy zbiór ID istniejących partii + zbiór itemId→batchIds,
  // a następnie sprawdzamy każdą transakcję czy jej partia nadal istnieje.
  //
  // Dla RECEIVE: partia przechowuje transactionId wskazujące na transakcję, która ją utworzyła.
  // Dla ADJUSTMENT/ISSUE/inne: transakcja ma batchId wskazujące na partię.
  
  const existingBatchIds = new Set(batches.map(b => b.id));
  const txIdsWithExistingBatch = new Set(
    batches.map(b => b.transactionId).filter(Boolean)
  );
  // Zbiór itemId które mają jakiekolwiek istniejące partie
  const itemsWithBatches = new Set(batches.map(b => b.itemId).filter(Boolean));

  console.log(`[ECO ORPHAN] Istniejące partie: ${existingBatchIds.size}, transactionIds w partiach: ${txIdsWithExistingBatch.size}, itemy z partiami: ${itemsWithBatches.size}`);

  const orphanedByItem = {};
  const orphanedByType = {};

  const validTransactions = transactions.filter(tx => {
    const type = normalizeTransactionType(tx.type);

    // 1. Jeśli transakcja ma batchId — sprawdź czy partia istnieje
    if (tx.batchId) {
      const valid = existingBatchIds.has(tx.batchId);
      if (!valid) {
        orphanedByItem[tx.itemId] = (orphanedByItem[tx.itemId] || 0) + 1;
        orphanedByType[type] = (orphanedByType[type] || 0) + 1;
      }
      return valid;
    }

    // 2. Dla RECEIVE bez batchId — sprawdź czy jakaś partia została utworzona tą transakcją
    if (type === 'RECEIVE') {
      const valid = txIdsWithExistingBatch.has(tx.id);
      if (!valid) {
        orphanedByItem[tx.itemId] = (orphanedByItem[tx.itemId] || 0) + 1;
        orphanedByType[type] = (orphanedByType[type] || 0) + 1;
      }
      return valid;
    }

    // 3. Dla ADJUSTMENT-ADD/REMOVE bez batchId — to podejrzane, 
    //    adjustment powinien mieć batchId. Jeśli nie ma, sprawdź czy item
    //    w ogóle ma jakieś istniejące partie. Jeśli nie — to prawdopodobnie osierocona.
    if (type === 'ADJUSTMENT-ADD' || type === 'ADJUSTMENT-REMOVE') {
      // Jeśli nie ma batchId ale item ma istniejące partie — zachowaj
      // (to może być korekta na poziomie itemu)
      if (itemsWithBatches.has(tx.itemId)) {
        return true;
      }
      // Item nie ma żadnych partii — osierocona transakcja
      orphanedByItem[tx.itemId] = (orphanedByItem[tx.itemId] || 0) + 1;
      orphanedByType[type] = (orphanedByType[type] || 0) + 1;
      return false;
    }

    // 4. Inne transakcje (ISSUE, TRANSFER, itp.) bez batchId — zachowaj
    return true;
  });

  const orphanedCount = transactions.length - validTransactions.length;
  console.log(`[ECO ORPHAN] ======= FILTR OSIEROOCONYCH TRANSAKCJI =======`);
  console.log(`[ECO ORPHAN] Przed filtrem: ${transactions.length}, po filtrze: ${validTransactions.length}, odrzuconych: ${orphanedCount}`);
  console.log(`[ECO ORPHAN] Odrzucone wg typu:`, orphanedByType);
  
  // Pokaż top 10 itemów z największą liczbą osierooconych transakcji
  const orphanedItemsSorted = Object.entries(orphanedByItem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  if (orphanedItemsSorted.length > 0) {
    console.log(`[ECO ORPHAN] Top itemy z osieroc. transakcjami:`);
    orphanedItemsSorted.forEach(([itemId, count]) => {
      const itemName = inventoryItems[itemId]?.name || 'NIEZNANY';
      console.log(`[ECO ORPHAN]   ${itemName} (${itemId}): ${count} osieroconych tx`);
    });
  }

  // ============================================================
  // DEDUPLIKACJA KOREKT INWENTARYZACYJNYCH
  // ============================================================
  // Inwentaryzacja tworzy DWIE transakcje dla tej samej zmiany:
  //   1) Item-level: reason="Korekta z inwentaryzacji (...)" — aktualizuje inventory.quantity
  //   2) Batch-level: reason="Korekta ilości partii"         — aktualizuje batch.quantity
  // Obie reprezentują tę samą fizyczną zmianę — forward calculation liczyłby ją podwójnie.
  //
  // Filtrujemy transakcje item-level (reason zaczyna się od "Korekta z inwentaryzacji"),
  // zostawiając batch-level ("Korekta ilości partii") jako źródło prawdy.
  
  let itemLevelCorrectionCount = 0;
  const deduplicatedTransactions = validTransactions.filter(tx => {
    const reason = (tx.reason || '').trim();
    if (reason.startsWith('Korekta z inwentaryzacji')) {
      itemLevelCorrectionCount++;
      return false;
    }
    return true;
  });

  console.log(`[ECO DEDUP] Odfiltrowano ${itemLevelCorrectionCount} item-level korekt inwentaryzacyjnych (duplikaty batch-level)`);
  console.log(`[ECO DEDUP] Transakcje po deduplikacji: ${deduplicatedTransactions.length} (było: ${validTransactions.length})`);

  // ============================================================
  // TRYB EKO: filtrowanie po recepturach z certyfikatem EKO
  // ============================================================
  let ecoRawMaterialIds = null;
  let ecoFinishedProductIds = null;

  if (ecoMode) {
    const ecoRecipes = await fetchEcoRecipes();
    const ecoIds = buildEcoItemIds(ecoRecipes, inventoryItems);
    ecoRawMaterialIds = ecoIds.ecoRawMaterialIds;
    ecoFinishedProductIds = ecoIds.ecoFinishedProductIds;
    console.log('[EKO] Tryb EKO aktywny — receptury EKO:', ecoRecipes.length,
      ', surowców EKO:', ecoRawMaterialIds.size, ', wyrobów EKO:', ecoFinishedProductIds.size);
  }

  // Generuj dane dla każdej zakładki
  // deduplicatedTransactions — do wszystkich obliczeń (forward calculation + kategoryzacja przepływów)
  // Metoda forward nie wymaga aktualnego stanu z bazy — opiera się wyłącznie na transakcjach
  const suppliersData = generateSuppliersData(suppliers, purchaseOrders, inventoryItems, ecoRawMaterialIds);
  const rawMaterialsData = generateRawMaterialsData(
    inventoryItems, deduplicatedTransactions, productionTasks, startDate, endDate, existingBatchIds, ecoRawMaterialIds
  );
  const finishedProductsData = generateFinishedProductsData(
    inventoryItems, deduplicatedTransactions, productionTasks,
    cmrData.cmrs, cmrData.cmrItems, startDate, endDate, existingBatchIds, ecoFinishedProductIds
  );

  return {
    suppliersData,
    rawMaterialsData,
    finishedProductsData,
    ecoMode,
    stats: {
      suppliersCount: suppliersData.length,
      rawMaterialsCount: rawMaterialsData.length,
      finishedProductsCount: finishedProductsData.length,
      purchaseOrdersCount: purchaseOrders.length,
      productionTasksCount: productionTasks.length,
      cmrsCount: cmrData.cmrs.length,
      transactionsCount: transactions.length
    }
  };
};

/**
 * Eksportuje obrotówkę EKO do pliku Excel z 3 zakładkami
 * Formatowanie zgodne z dostarczonym arkuszem
 */
export const exportEcoReportToExcel = async (data, filters) => {
  const { dateFrom, dateTo } = filters;
  const periodFrom = formatDateForExport(new Date(dateFrom));
  const periodTo = formatDateForExport(new Date(dateTo));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'MRP System';
  workbook.created = new Date();

  // Styl nagłówka
  const headerStyle = {
    font: { bold: true, size: 10, name: 'Calibri' },
    alignment: { horizontal: 'center', vertical: 'middle', wrapText: true },
    border: {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    },
    fill: {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFD9E1F2' }
    }
  };

  const cellStyle = {
    font: { size: 10, name: 'Calibri' },
    alignment: { vertical: 'middle', wrapText: true },
    border: {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    }
  };

  const titleStyle = {
    font: { bold: true, size: 12, name: 'Calibri' },
    alignment: { horizontal: 'left', vertical: 'middle' }
  };

  // Funkcja tłumaczenia dla namespace ecoReport
  const t = i18n.getFixedT(null, 'ecoReport');

  // ============================================================
  // TAB 1 - DOSTAWCY
  // ============================================================
  const ws1 = workbook.addWorksheet(t('excel.sheets.suppliers'));
  
  // Tytuł
  ws1.mergeCells('A1:H1');
  ws1.getCell('A1').value = t('excel.tab1.title');
  ws1.getCell('A1').style = titleStyle;

  ws1.mergeCells('A2:H2');
  ws1.getCell('A2').value = t('excel.tab1.subtitle', { periodFrom, periodTo });
  ws1.getCell('A2').style = { ...titleStyle, font: { ...titleStyle.font, size: 11 } };

  // Nagłówki
  const supplierHeaders = [
    t('excel.tab1.headers.supplierName'),
    t('excel.tab1.headers.address'),
    t('excel.tab1.headers.productType'),
    t('excel.tab1.headers.quantity'),
    t('excel.tab1.headers.unit'),
    t('excel.tab1.headers.certAuthority'),
    t('excel.tab1.headers.certNumber'),
    t('excel.tab1.headers.certValidity')
  ];
  
  const headerRow1 = ws1.getRow(4);
  supplierHeaders.forEach((header, idx) => {
    const cell = headerRow1.getCell(idx + 1);
    cell.value = header;
    cell.style = headerStyle;
  });
  headerRow1.height = 35;

  // Dane
  let row1Idx = 5;
  for (const row of data.suppliersData) {
    const dataRow = ws1.getRow(row1Idx);
    const values = [
      row.supplierName,
      row.address,
      row.productType,
      row.quantity,
      row.unit,
      row.certAuthority,
      row.certNumber,
      row.certValidFrom && row.certValidTo ? `${row.certValidFrom} - ${row.certValidTo}` : ''
    ];
    values.forEach((val, idx) => {
      const cell = dataRow.getCell(idx + 1);
      cell.value = val;
      cell.style = cellStyle;
    });
    row1Idx++;
  }

  // Puste wiersze do ręcznego wypełnienia (minimum 15 wierszy)
  const minRows1 = Math.max(15, data.suppliersData.length);
  for (let i = data.suppliersData.length; i < minRows1; i++) {
    const emptyRow = ws1.getRow(row1Idx);
    for (let c = 1; c <= 8; c++) {
      emptyRow.getCell(c).style = cellStyle;
    }
    row1Idx++;
  }

  // Stopka z informacją
  row1Idx += 1;
  ws1.mergeCells(`A${row1Idx}:H${row1Idx}`);
  ws1.getCell(`A${row1Idx}`).value = t('excel.tab1.footnote1');
  ws1.getCell(`A${row1Idx}`).style = { font: { size: 8, italic: true, name: 'Calibri' } };
  row1Idx++;
  ws1.mergeCells(`A${row1Idx}:H${row1Idx}`);
  ws1.getCell(`A${row1Idx}`).value = t('excel.tab1.footnote2');
  ws1.getCell(`A${row1Idx}`).style = { font: { size: 8, italic: true, name: 'Calibri' } };

  // Szerokości kolumn
  ws1.columns = [
    { width: 25 }, { width: 35 }, { width: 22 }, { width: 15 },
    { width: 12 }, { width: 18 }, { width: 18 }, { width: 22 }
  ];

  // ============================================================
  // TAB 2 - SUROWCE
  // ============================================================
  const ws2 = workbook.addWorksheet(t('excel.sheets.rawMaterials'));

  ws2.mergeCells('A1:I1');
  ws2.getCell('A1').value = t('excel.tab2.title');
  ws2.getCell('A1').style = titleStyle;

  ws2.mergeCells('A2:I2');
  ws2.getCell('A2').value = t('excel.tab2.subtitle', { periodFrom, periodTo });
  ws2.getCell('A2').style = { ...titleStyle, font: { ...titleStyle.font, size: 11 } };

  ws2.mergeCells('A3:I3');
  ws2.getCell('A3').value = t('excel.tab2.instruction');
  ws2.getCell('A3').style = { font: { size: 9, italic: true, name: 'Calibri' } };

  // Nagłówki
  const rawMaterialHeaders = [
    t('excel.tab2.headers.rawMaterials'),
    t('excel.tab2.headers.openingStock'),
    t('excel.tab2.headers.purchases'),
    t('excel.tab2.headers.otherIncome'),
    t('excel.tab2.headers.ownProduction'),
    t('excel.tab2.headers.consumption'),
    t('excel.tab2.headers.sales'),
    t('excel.tab2.headers.otherExpenses'),
    t('excel.tab2.headers.closingStock')
  ];

  const headerRow2 = ws2.getRow(5);
  rawMaterialHeaders.forEach((header, idx) => {
    const cell = headerRow2.getCell(idx + 1);
    cell.value = header;
    cell.style = headerStyle;
  });
  headerRow2.height = 55;

  // Dane
  let row2Idx = 6;
  for (const row of data.rawMaterialsData) {
    const dataRow = ws2.getRow(row2Idx);
    const values = [
      row.name,
      row.openingStock,
      row.purchases,
      row.otherIncome,
      row.ownProduction,
      row.productionConsumption,
      row.sales,
      row.otherExpenses,
      row.closingStock
    ];
    values.forEach((val, idx) => {
      const cell = dataRow.getCell(idx + 1);
      cell.value = val;
      cell.style = cellStyle;
      // Kolumny numeryczne - wyrównanie do prawej
      if (idx > 0) {
        cell.style = { ...cellStyle, alignment: { ...cellStyle.alignment, horizontal: 'right' } };
        cell.numFmt = '#,##0.000';
      }
    });
    row2Idx++;
  }

  // Puste wiersze
  const minRows2 = Math.max(12, data.rawMaterialsData.length);
  for (let i = data.rawMaterialsData.length; i < minRows2; i++) {
    const emptyRow = ws2.getRow(row2Idx);
    for (let c = 1; c <= 9; c++) {
      emptyRow.getCell(c).style = cellStyle;
    }
    row2Idx++;
  }

  // Stopki
  row2Idx += 1;
  ws2.mergeCells(`A${row2Idx}:I${row2Idx}`);
  ws2.getCell(`A${row2Idx}`).value = t('excel.tab2.footnote1');
  ws2.getCell(`A${row2Idx}`).style = { font: { size: 8, italic: true, name: 'Calibri' } };
  row2Idx++;
  ws2.mergeCells(`A${row2Idx}:I${row2Idx}`);
  ws2.getCell(`A${row2Idx}`).value = t('excel.tab2.footnote2');
  ws2.getCell(`A${row2Idx}`).style = { font: { size: 8, italic: true, name: 'Calibri' } };

  // Szerokości kolumn
  ws2.columns = [
    { width: 22 }, { width: 18 }, { width: 22 }, { width: 20 }, { width: 22 },
    { width: 20 }, { width: 18 }, { width: 28 }, { width: 18 }
  ];

  // ============================================================
  // TAB 3 - WYROBY GOTOWE
  // ============================================================
  const ws3 = workbook.addWorksheet(t('excel.sheets.finishedProducts'));

  ws3.mergeCells('A1:H1');
  ws3.getCell('A1').value = t('excel.tab3.title');
  ws3.getCell('A1').style = titleStyle;

  ws3.mergeCells('A2:H2');
  ws3.getCell('A2').value = t('excel.tab3.subtitle', { periodFrom, periodTo });
  ws3.getCell('A2').style = { ...titleStyle, font: { ...titleStyle.font, size: 11 } };

  ws3.mergeCells('A3:H3');

  ws3.mergeCells('A4:H4');
  ws3.getCell('A4').value = t('excel.tab3.instruction');
  ws3.getCell('A4').style = { font: { size: 9, italic: true, name: 'Calibri' } };

  // Nagłówki
  const finishedHeaders = [
    t('excel.tab3.headers.product'),
    t('excel.tab3.headers.openingStock'),
    t('excel.tab3.headers.purchases'),
    t('excel.tab3.headers.otherIncome'),
    t('excel.tab3.headers.ownProduction'),
    t('excel.tab3.headers.sales'),
    t('excel.tab3.headers.otherExpenses'),
    t('excel.tab3.headers.closingStock')
  ];

  const headerRow3 = ws3.getRow(5);
  finishedHeaders.forEach((header, idx) => {
    const cell = headerRow3.getCell(idx + 1);
    cell.value = header;
    cell.style = headerStyle;
  });
  headerRow3.height = 45;

  // Dane
  let row3Idx = 6;
  for (const row of data.finishedProductsData) {
    const dataRow = ws3.getRow(row3Idx);
    const values = [
      row.name,
      row.openingStock,
      row.purchases,
      row.otherIncome,
      row.ownProduction,
      row.sales,
      row.otherExpenses,
      row.closingStock
    ];
    values.forEach((val, idx) => {
      const cell = dataRow.getCell(idx + 1);
      cell.value = val;
      cell.style = cellStyle;
      if (idx > 0) {
        cell.style = { ...cellStyle, alignment: { ...cellStyle.alignment, horizontal: 'right' } };
        cell.numFmt = '#,##0.000';
      }
    });
    row3Idx++;
  }

  // Puste wiersze (do 25 wierszy jak w oryginalnym arkuszu)
  const minRows3 = Math.max(22, data.finishedProductsData.length);
  for (let i = data.finishedProductsData.length; i < minRows3; i++) {
    const emptyRow = ws3.getRow(row3Idx);
    for (let c = 1; c <= 8; c++) {
      emptyRow.getCell(c).style = cellStyle;
    }
    row3Idx++;
  }

  // Stopka
  row3Idx += 1;
  ws3.mergeCells(`A${row3Idx}:H${row3Idx}`);
  ws3.getCell(`A${row3Idx}`).value = t('excel.tab3.footnote');
  ws3.getCell(`A${row3Idx}`).style = { font: { size: 8, italic: true, name: 'Calibri' } };

  // Szerokości kolumn
  ws3.columns = [
    { width: 22 }, { width: 18 }, { width: 22 }, { width: 20 }, { width: 18 },
    { width: 18 }, { width: 28 }, { width: 18 }
  ];

  // ============================================================
  // ZAPIS PLIKU
  // ============================================================
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { 
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
  });
  
  const filename = t('excel.filename', { 
    periodFrom: periodFrom.replace(/\./g, '-'), 
    periodTo: periodTo.replace(/\./g, '-') 
  });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return {
    success: true,
    filename,
    message: t('excel.successMessage', { filename })
  };
};

/**
 * Główna funkcja - pobiera dane i generuje obrotówkę
 */
export const generateEcoReport = async (filters) => {
  try {
    console.log('[EKO Obrotówka] Rozpoczynam generowanie obrotówki z filtrami:', filters);
    
    // Pobierz dane
    const data = await fetchEcoReportData(filters);
    
    console.log('[EKO Obrotówka] Dane wygenerowane:', data.stats);

    // Eksportuj do Excel
    const result = await exportEcoReportToExcel(data, filters);
    
    return {
      ...result,
      data,
      stats: data.stats
    };
  } catch (error) {
    console.error('[EKO Obrotówka] Błąd generowania obrotówki:', error);
    throw error;
  }
};
