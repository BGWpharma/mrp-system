// src/services/financialReportService.js
import { 
  collection, 
  query, 
  getDocs, 
  where,
  orderBy,
  getDoc,
  doc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { getPurchaseOrderById } from './purchaseOrderService';
import { getOrderById } from './orderService';
import { getInvoicesByOrderId } from './invoiceService';
import { formatDateForInput } from '../utils/dateUtils';

/**
 * Generuje kompleksowy raport finansowy dla analizy łańcucha PO → Batch → MO → CO → Invoice
 * @param {Object} filters - Filtry (dateFrom, dateTo, supplierId, customerId, status)
 * @returns {Promise<Array>} - Tablica obiektów z danymi do raportu
 */
export const generateFinancialReport = async (filters = {}) => {
  const reportData = [];
  
  try {
    console.log('📊 [FINANCIAL_REPORT] Rozpoczynam generowanie raportu...', filters);
    
    // 1. Buduj zapytanie dla zadań produkcyjnych (punkt centralny łańcucha)
    let tasksQuery = collection(db, 'productionTasks');
    const queryConditions = [];
    
    // Filtry dat
    if (filters.dateFrom) {
      const startTimestamp = Timestamp.fromDate(new Date(filters.dateFrom));
      queryConditions.push(where('scheduledDate', '>=', startTimestamp));
    }
    
    if (filters.dateTo) {
      const endTimestamp = Timestamp.fromDate(new Date(filters.dateTo));
      queryConditions.push(where('scheduledDate', '<=', endTimestamp));
    }
    
    // Filtr statusu (tylko jeśli nie jest pusty)
    if (filters.status && filters.status !== '') {
      queryConditions.push(where('status', '==', filters.status));
    }
    
    // Buduj zapytanie z warunkami
    if (queryConditions.length > 0) {
      tasksQuery = query(
        collection(db, 'productionTasks'),
        ...queryConditions,
        orderBy('scheduledDate', 'desc')
      );
    } else {
      tasksQuery = query(
        collection(db, 'productionTasks'),
        orderBy('scheduledDate', 'desc')
      );
    }
    
    const tasksSnapshot = await getDocs(tasksQuery);
    const tasks = tasksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    console.log(`✅ [FINANCIAL_REPORT] Znaleziono ${tasks.length} zadań produkcyjnych`);
    
    // 2. Cache dla danych (unikanie wielokrotnego pobierania)
    const ordersCache = new Map(); // Cache dla CO
    const batchesCache = new Map(); // Cache dla partii
    const poCache = new Map(); // Cache dla PO
    const invoicesCache = new Map(); // Cache dla faktur
    
    // 3. Dla każdego MO zbierz dane z całego łańcucha
    let processedCount = 0;
    
    for (const task of tasks) {
      try {
        // Pobierz CO (Customer Order) z cache
        let customerOrder = null;
        if (task.orderId) {
          try {
            if (ordersCache.has(task.orderId)) {
              customerOrder = ordersCache.get(task.orderId);
            } else {
              customerOrder = await getOrderById(task.orderId);
              ordersCache.set(task.orderId, customerOrder);
            }
          } catch (error) {
            console.warn(`⚠️ Nie można pobrać CO ${task.orderId}:`, error.message);
          }
        }
        
        // Zastosuj filtr klienta (jeśli podano)
        if (filters.customerId && customerOrder?.customer?.id !== filters.customerId) {
          continue;
        }
        
        // Znajdź pozycję CO powiązaną z MO
        const coItem = customerOrder?.items?.find(item => item.productionTaskId === task.id);
        
        // Pobierz faktury dla CO z cache
        let invoices = [];
        if (customerOrder) {
          try {
            if (invoicesCache.has(customerOrder.id)) {
              invoices = invoicesCache.get(customerOrder.id);
            } else {
              invoices = await getInvoicesByOrderId(customerOrder.id);
              invoicesCache.set(customerOrder.id, invoices);
            }
          } catch (error) {
            console.warn(`⚠️ Nie można pobrać faktur dla CO ${customerOrder.id}:`, error.message);
          }
        }
        
        // Główna faktura (pierwsza na liście)
        const mainInvoice = invoices.length > 0 ? invoices[0] : null;
        
        // DEBUG: Sprawdź strukturę materiałów
        console.log(`🔍 [DEBUG] MO ${task.moNumber}: ma ${task.materials?.length || 0} materiałów`);
        
        // Jeśli MO nie ma materiałów, utwórz pojedynczy rekord bez szczegółów partii
        if (!task.materials || task.materials.length === 0) {
          console.log(`⚠️ [DEBUG] MO ${task.moNumber}: BRAK materiałów`);
          const reportRow = createReportRow({
            task,
            customerOrder,
            coItem,
            mainInvoice,
            material: null,
            batch: null,
            purchaseOrder: null,
            poItem: null
          });
          
          reportData.push(reportRow);
          processedCount++;
          continue;
        }
        
        // Zbierz informacje o materiałach i partiach
        for (const material of task.materials || []) {
          // Znajdź ID materiału (może być w inventoryItemId lub id)
          const materialId = material.inventoryItemId || material.id;
          
          // 1. Pobierz skonsumowane materiały dla tego materiału
          const consumedForMaterial = (task.consumedMaterials || []).filter(
            consumed => consumed.materialId === materialId
          );
          
          // 2. Pobierz zarezerwowane partie dla tego materiału
          const reservedBatches = task.materialBatches?.[materialId] || [];
          
          console.log(`🔍 [DEBUG] Materiał ${material.name}: ${consumedForMaterial.length} skonsumowanych, ${reservedBatches.length} zarezerwowanych partii`);
          
          // 3. Zbierz wszystkie unikalne partie (zarówno skonsumowane jak i zarezerwowane)
          const allBatches = new Map();
          
          // Dodaj skonsumowane partie (mają priorytet - rzeczywiste dane)
          consumedForMaterial.forEach(consumed => {
            if (consumed.batchId) {
              allBatches.set(consumed.batchId, {
                batchId: consumed.batchId,
                quantity: consumed.quantity,
                unitPrice: consumed.unitPrice,
                source: 'consumed',
                includeInCosts: consumed.includeInCosts
              });
            }
          });
          
          // Dodaj zarezerwowane partie (tylko jeśli nie ma skonsumowanej)
          reservedBatches.forEach(reserved => {
            if (!allBatches.has(reserved.batchId)) {
              allBatches.set(reserved.batchId, {
                batchId: reserved.batchId,
                batchNumber: reserved.batchNumber,
                quantity: reserved.quantity,
                source: 'reserved'
              });
            }
          });
          
          // Jeśli materiał nie ma żadnych partii (ani skonsumowanych, ani zarezerwowanych)
          if (allBatches.size === 0) {
            console.log(`⚠️ [DEBUG] Materiał ${material.name}: BRAK partii`);
            const reportRow = createReportRow({
              task,
              customerOrder,
              coItem,
              mainInvoice,
              material,
              batch: null,
              purchaseOrder: null,
              poItem: null,
              batchSource: 'none'
            });
            
            reportData.push(reportRow);
            processedCount++;
            continue;
          }
          
          // 4. Dla każdej partii (skonsumowanej lub zarezerwowanej)
          for (const [batchId, batchInfo] of allBatches) {
            let batch = null;
            let purchaseOrder = null;
            let poItem = null;
            
            try {
              // Pobierz partię z cache
              if (batchesCache.has(batchId)) {
                batch = batchesCache.get(batchId);
              } else {
                const batchDoc = await getDoc(doc(db, 'inventoryBatches', batchId));
                if (batchDoc.exists()) {
                  batch = { id: batchDoc.id, ...batchDoc.data() };
                  batchesCache.set(batchId, batch);
                }
              }
              
              if (batch) {
                // Pobierz PO dla partii z cache
                const poId = batch.purchaseOrderDetails?.id || batch.sourceDetails?.orderId;
                if (poId) {
                  try {
                    if (poCache.has(poId)) {
                      purchaseOrder = poCache.get(poId);
                    } else {
                      purchaseOrder = await getPurchaseOrderById(poId);
                      poCache.set(poId, purchaseOrder);
                    }
                    
                    // Zastosuj filtr dostawcy (jeśli podano)
                    if (filters.supplierId && purchaseOrder?.supplierId !== filters.supplierId) {
                      continue;
                    }
                    
                    // Znajdź pozycję PO odpowiadającą partii
                    const itemPoId = batch.purchaseOrderDetails?.itemPoId || batch.sourceDetails?.itemPoId;
                    if (itemPoId && purchaseOrder.items) {
                      poItem = purchaseOrder.items.find(item => item.id === itemPoId);
                    }
                  } catch (error) {
                    console.warn(`⚠️ Nie można pobrać PO ${poId}:`, error.message);
                  }
                }
              }
            } catch (error) {
              console.warn(`⚠️ Nie można pobrać partii ${batchId}:`, error.message);
            }
            
            // Utwórz rekord raportu
            const reportRow = createReportRow({
              task,
              customerOrder,
              coItem,
              mainInvoice,
              material,
              batch,
              purchaseOrder,
              poItem,
              reservedQuantity: batchInfo.source === 'reserved' ? batchInfo.quantity : null,
              consumedQuantity: batchInfo.source === 'consumed' ? batchInfo.quantity : null,
              batchSource: batchInfo.source,
              consumedUnitPrice: batchInfo.unitPrice,
              includeInCosts: batchInfo.includeInCosts
            });
            
            reportData.push(reportRow);
            processedCount++;
          }
        }
      } catch (error) {
        console.error(`❌ Błąd podczas przetwarzania zadania ${task.id}:`, error);
      }
    }
    
    console.log(`✅ [FINANCIAL_REPORT] Wygenerowano ${reportData.length} rekordów z ${processedCount} operacji`);
    console.log(`📊 [FINANCIAL_REPORT] Cache stats: ${ordersCache.size} zamówień, ${batchesCache.size} partii, ${poCache.size} PO, ${invoicesCache.size} faktur`);
    
    // Oblicz statystyki
    const stats = getReportStatistics(reportData);
    console.log('📊 [FINANCIAL_REPORT] Obliczono statystyki:', stats);
    console.log('📊 [FINANCIAL_REPORT] Statystyki:', {
      totalPurchaseValue: stats.totalPurchaseValue,
      totalProductionCost: stats.totalProductionCost,
      totalSalesValue: stats.totalSalesValue,
      totalMargin: stats.totalMargin,
      marginPercentage: stats.averageMarginPercentage
    });
    
    return reportData;
    
  } catch (error) {
    console.error('❌ [FINANCIAL_REPORT] Błąd podczas generowania raportu:', error);
    throw error;
  }
};

/**
 * Pomocnicza funkcja do tworzenia pojedynczego rekordu raportu
 * @private
 */
const createReportRow = ({
  task,
  customerOrder,
  coItem,
  mainInvoice,
  material,
  batch,
  purchaseOrder,
  poItem,
  reservedQuantity = 0,
  consumedQuantity = 0,
  batchSource = 'unknown',
  consumedUnitPrice = 0,
  includeInCosts = true
}) => {
  // Oblicz koszty procesowe
  const processingCostPerUnit = parseFloat(task.processingCostPerUnit) || 0;
  const completedQuantity = parseFloat(task.totalCompletedQuantity) || 0;
  const processingCost = processingCostPerUnit * completedQuantity;
  
  // Oblicz wartość partii - użyj ceny ze skonsumowanego materiału jeśli dostępna
  const batchUnitPrice = consumedUnitPrice > 0 ? parseFloat(consumedUnitPrice) : (parseFloat(batch?.unitPrice) || 0);
  const batchQuantity = parseFloat(batch?.initialQuantity) || 0;
  const batchTotalValue = batchUnitPrice * batchQuantity;
  
  // Ilość materiału z tej partii (skonsumowana lub zarezerwowana)
  const materialQuantity = consumedQuantity > 0 ? consumedQuantity : reservedQuantity;
  const materialValue = batchUnitPrice * materialQuantity;
  
  // Oblicz wartość sprzedaży
  const coSalePrice = parseFloat(coItem?.unitPrice) || 0;
  const coQuantity = parseFloat(coItem?.quantity) || 0;
  const coTotalSaleValue = parseFloat(coItem?.totalPrice) || (coSalePrice * coQuantity);
  
  // Oblicz marżę
  const productionCost = parseFloat(task.fullProductionCost) || 0;
  const margin = coTotalSaleValue - productionCost;
  const marginPercentage = coTotalSaleValue > 0 ? (margin / coTotalSaleValue) * 100 : 0;
  
  // Formatuj daty
  const formatDate = (timestamp) => {
    if (!timestamp) return '';
    if (timestamp.toDate && typeof timestamp.toDate === 'function') {
      return formatDateForInput(timestamp.toDate());
    }
    if (timestamp instanceof Date) {
      return formatDateForInput(timestamp);
    }
    return '';
  };
  
  return {
    // PO Data
    po_number: purchaseOrder?.number || '',
    po_date: formatDate(purchaseOrder?.orderDate),
    po_supplier: purchaseOrder?.supplier?.name || '',
    po_supplier_id: purchaseOrder?.supplierId || '',
    po_item_name: poItem?.name || '',
    po_item_quantity: parseFloat(poItem?.quantity) || 0,
    po_unit_price_original: parseFloat(poItem?.unitPrice) || 0,
    po_discount: parseFloat(poItem?.discount) || 0,
    po_base_unit_price: parseFloat(batch?.baseUnitPrice) || 0,
    po_additional_costs_per_unit: parseFloat(batch?.additionalCostPerUnit) || 0,
    
    // Batch Data
    batch_id: batch?.id || '',
    batch_number: batch?.batchNumber || batch?.lotNumber || '',
    batch_quantity: batchQuantity,
    batch_reserved_quantity: reservedQuantity,
    batch_consumed_quantity: consumedQuantity,
    batch_source: batchSource, // 'consumed', 'reserved', 'none', 'unknown'
    batch_final_unit_price: batchUnitPrice,
    batch_total_value: batchTotalValue,
    
    // Material Data (z MO)
    material_id: material?.inventoryItemId || '',
    material_name: material?.name || '',
    material_required_quantity: parseFloat(material?.quantity) || 0,
    material_used_quantity: materialQuantity, // Rzeczywiście użyta ilość (consumed lub reserved)
    material_value: materialValue, // Wartość użytego materiału
    material_unit: material?.unit || '',
    material_fallback_price: parseFloat(material?.unitPrice) || 0,
    material_include_in_costs: includeInCosts,
    
    // MO Data
    mo_id: task.id,
    mo_number: task.moNumber || '',
    mo_product: task.productName || '',
    mo_quantity: parseFloat(task.quantity) || 0,
    mo_completed_quantity: completedQuantity,
    mo_material_cost: parseFloat(task.materialCost) || 0,
    mo_processing_cost: processingCost,
    mo_full_production_cost: productionCost,
    mo_unit_cost: task.quantity > 0 ? productionCost / parseFloat(task.quantity) : 0,
    mo_status: task.status || '',
    mo_scheduled_date: formatDate(task.scheduledDate),
    
    // CO Data
    co_id: customerOrder?.id || '',
    co_number: customerOrder?.orderNumber || '',
    co_customer: customerOrder?.customer?.name || '',
    co_customer_id: customerOrder?.customer?.id || '',
    co_item_name: coItem?.name || '',
    co_item_quantity: coQuantity,
    co_sale_price: coSalePrice,
    co_total_sale_value: coTotalSaleValue,
    co_status: customerOrder?.status || '',
    co_order_date: formatDate(customerOrder?.orderDate),
    
    // Invoice Data
    invoice_id: mainInvoice?.id || '',
    invoice_number: mainInvoice?.number || '',
    invoice_total: parseFloat(mainInvoice?.total) || 0,
    invoice_payment_status: mainInvoice?.paymentStatus || mainInvoice?.status || '',
    invoice_issue_date: formatDate(mainInvoice?.issueDate),
    invoice_total_paid: parseFloat(mainInvoice?.totalPaid) || 0,
    
    // Analysis
    margin: margin,
    margin_percentage: marginPercentage,
    
    // Verification flags (do weryfikacji poprawności danych)
    has_po: !!purchaseOrder,
    has_batch: !!batch,
    has_co: !!customerOrder,
    has_invoice: !!mainInvoice,
    is_complete_chain: !!(purchaseOrder && batch && customerOrder && mainInvoice)
  };
};

/**
 * Eksportuje raport do formatu CSV
 * @param {Array} reportData - Dane raportu
 * @returns {string} - CSV string
 */
export const exportReportToCSV = (reportData) => {
  if (!reportData || reportData.length === 0) {
    return '';
  }
  
  // Nagłówki w czytelnej formie
  const headerMap = {
    // PO
    po_number: 'PO Numer',
    po_date: 'PO Data',
    po_supplier: 'PO Dostawca',
    po_item_name: 'PO Pozycja',
    po_item_quantity: 'PO Ilość',
    po_unit_price_original: 'PO Cena Oryginalna',
    po_discount: 'PO Rabat %',
    po_base_unit_price: 'PO Cena Bazowa',
    po_additional_costs_per_unit: 'PO Dodatkowe Koszty/szt',
    
    // Batch
    batch_number: 'Partia Numer',
    batch_quantity: 'Partia Ilość',
    batch_reserved_quantity: 'Partia Zarezerwowano',
    batch_consumed_quantity: 'Partia Skonsumowano',
    batch_source: 'Partia Źródło',
    batch_final_unit_price: 'Partia Cena Końcowa',
    batch_total_value: 'Partia Wartość',
    
    // Material
    material_name: 'Materiał Nazwa',
    material_required_quantity: 'Materiał Wymagana Ilość',
    material_used_quantity: 'Materiał Użyta Ilość',
    material_value: 'Materiał Wartość',
    material_unit: 'Materiał Jednostka',
    material_include_in_costs: 'Materiał Wliczany Do Kosztów',
    
    // MO
    mo_number: 'MO Numer',
    mo_product: 'MO Produkt',
    mo_quantity: 'MO Ilość Planowana',
    mo_completed_quantity: 'MO Ilość Wyprodukowana',
    mo_material_cost: 'MO Koszt Materiałów',
    mo_processing_cost: 'MO Koszt Procesowy',
    mo_full_production_cost: 'MO Pełny Koszt',
    mo_unit_cost: 'MO Koszt Jednostkowy',
    mo_status: 'MO Status',
    mo_scheduled_date: 'MO Data',
    
    // CO
    co_number: 'CO Numer',
    co_customer: 'CO Klient',
    co_item_name: 'CO Pozycja',
    co_item_quantity: 'CO Ilość',
    co_sale_price: 'CO Cena Sprzedaży',
    co_total_sale_value: 'CO Wartość Sprzedaży',
    co_status: 'CO Status',
    co_order_date: 'CO Data',
    
    // Invoice
    invoice_number: 'Faktura Numer',
    invoice_total: 'Faktura Wartość',
    invoice_payment_status: 'Faktura Status Płatności',
    invoice_issue_date: 'Faktura Data',
    invoice_total_paid: 'Faktura Zapłacono',
    
    // Analysis
    margin: 'Marża',
    margin_percentage: 'Marża %',
    is_complete_chain: 'Kompletny Łańcuch'
  };
  
  // Wybierz kluczowe kolumny do eksportu
  const exportKeys = Object.keys(headerMap);
  
  // Nagłówki
  const headers = exportKeys.map(key => headerMap[key]);
  const csvRows = [headers.join(',')];
  
  // Dane
  for (const row of reportData) {
    const values = exportKeys.map(key => {
      let value = row[key];
      
      // Formatuj wartości numeryczne
      if (typeof value === 'number') {
        value = value.toFixed(2);
      }
      
      // Formatuj wartości boolean
      if (typeof value === 'boolean') {
        value = value ? 'TAK' : 'NIE';
      }
      
      // Escape wartości z przecinkami i cudzysłowiami
      if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      
      return value !== null && value !== undefined ? value : '';
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
};

/**
 * Pobiera statystyki agregowane z raportu
 * @param {Array} reportData - Dane raportu
 * @returns {Object} - Statystyki
 */
export const getReportStatistics = (reportData) => {
  if (!reportData || reportData.length === 0) {
    return {
      totalRecords: 0,
      totalPurchaseValue: 0,
      totalProductionCost: 0,
      totalSalesValue: 0,
      totalMargin: 0,
      averageMarginPercentage: 0,
      completedOrders: 0,
      pendingOrders: 0,
      paidInvoices: 0,
      unpaidInvoices: 0
    };
  }
  
  // Deduplikuj po MO (aby nie liczyć wielokrotnie tych samych kosztów)
  const uniqueByMO = new Map();
  reportData.forEach(row => {
    if (row.mo_id && !uniqueByMO.has(row.mo_id)) {
      uniqueByMO.set(row.mo_id, row);
    }
  });
  
  const uniqueRows = Array.from(uniqueByMO.values());
  
  const totalProductionCost = uniqueRows.reduce((sum, row) => sum + (row.mo_full_production_cost || 0), 0);
  const totalSalesValue = uniqueRows.reduce((sum, row) => sum + (row.co_total_sale_value || 0), 0);
  const totalMargin = totalSalesValue - totalProductionCost;
  const averageMarginPercentage = totalSalesValue > 0 ? (totalMargin / totalSalesValue) * 100 : 0;
  
  // Zlicz statusy
  const completedOrders = uniqueRows.filter(row => row.co_status === 'Zakończone' || row.co_status === 'Zrealizowane').length;
  const pendingOrders = uniqueRows.filter(row => row.co_status === 'W realizacji' || row.co_status === 'Nowe').length;
  const paidInvoices = uniqueRows.filter(row => row.invoice_payment_status === 'paid' || row.invoice_payment_status === 'Opłacona').length;
  const unpaidInvoices = uniqueRows.filter(row => 
    row.has_invoice && (row.invoice_payment_status === 'unpaid' || row.invoice_payment_status === 'Nieopłacona')
  ).length;
  
  // Suma wartości zakupów (wartość rzeczywiście użytych materiałów, tylko te wliczane do kosztów)
  const totalPurchaseValue = reportData
    .filter(row => row.material_include_in_costs !== false)
    .reduce((sum, row) => sum + (row.material_value || 0), 0);
  
  return {
    totalRecords: reportData.length,
    uniqueOrders: uniqueRows.length,
    totalPurchaseValue,
    totalProductionCost,
    totalSalesValue,
    totalMargin,
    averageMarginPercentage,
    completedOrders,
    pendingOrders,
    paidInvoices,
    unpaidInvoices
  };
};

/**
 * Pobiera opcje filtrów (dostawcy, klienci, statusy)
 * @returns {Promise<Object>} - Obiekt z opcjami filtrów
 */
export const getFilterOptions = async () => {
  try {
    // Pobierz unikalnych dostawców z PO
    const suppliersSnapshot = await getDocs(collection(db, 'suppliers'));
    const suppliers = suppliersSnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name
    }));
    
    // Pobierz unikalnych klientów z CO
    const customersSnapshot = await getDocs(collection(db, 'customers'));
    const customers = customersSnapshot.docs.map(doc => ({
      id: doc.id,
      name: doc.data().name
    }));
    
    // Statusy MO (hardcoded)
    const statuses = [
      { value: '', label: 'Wszystkie' },
      { value: 'Nowe', label: 'Nowe' },
      { value: 'W trakcie', label: 'W trakcie' },
      { value: 'Zakończone', label: 'Zakończone' },
      { value: 'Anulowane', label: 'Anulowane' }
    ];
    
    return {
      suppliers,
      customers,
      statuses
    };
  } catch (error) {
    console.error('Błąd podczas pobierania opcji filtrów:', error);
    return {
      suppliers: [],
      customers: [],
      statuses: [
        { value: '', label: 'Wszystkie' },
        { value: 'Nowe', label: 'Nowe' },
        { value: 'W trakcie', label: 'W trakcie' },
        { value: 'Zakończone', label: 'Zakończone' },
        { value: 'Anulowane', label: 'Anulowane' }
      ]
    };
  }
};
