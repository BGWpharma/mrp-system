import { 
  collection, 
  query, 
  where, 
  orderBy, 
  getDocs,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from './firebase/config';
import { exportToCSV, exportToExcel, formatDateForExport, formatCurrencyForExport } from '../utils/exportUtils';

const PURCHASE_ORDERS_COLLECTION = 'purchaseOrders';
const SUPPLIERS_COLLECTION = 'suppliers';

/**
 * Pomocnicza funkcja do bezpiecznej konwersji dat
 */
const safeConvertDate = (dateField) => {
  if (!dateField) return null;
  
  try {
    if (dateField && dateField.toDate && typeof dateField.toDate === 'function') {
      return dateField.toDate();
    }
    
    if (typeof dateField === 'string') {
      return new Date(dateField);
    }
    
    if (dateField instanceof Date) {
      return dateField;
    }
    
    return null;
  } catch (error) {
    console.error('Błąd podczas konwersji daty:', error);
    return null;
  }
};

/**
 * Pobiera Purchase Orders z wybranego okresu i pozycji magazynowej
 */
export const getPurchaseOrdersForReport = async (filters) => {
  const { dateFrom, dateTo, itemId } = filters;
  
  try {
    let q = query(
      collection(db, PURCHASE_ORDERS_COLLECTION),
      orderBy('orderDate', 'desc')
    );

    // Filtrowanie po dacie
    if (dateFrom) {
      q = query(q, where('orderDate', '>=', dateFrom));
    }
    
    if (dateTo) {
      // Dodaj jeden dzień do dateTo, żeby uwzględnić cały dzień
      const endDate = new Date(dateTo);
      endDate.setDate(endDate.getDate() + 1);
      q = query(q, where('orderDate', '<', endDate));
    }

    // Nie filtrujemy na poziomie query po pozycji magazynowej,
    // bo musimy sprawdzić items w każdym PO

    const querySnapshot = await getDocs(q);
    
    // Pobierz wszystkich dostawców jednym zapytaniem
    const suppliersQuery = query(collection(db, SUPPLIERS_COLLECTION));
    const suppliersSnapshot = await getDocs(suppliersQuery);
    const suppliersMap = {};
    
    suppliersSnapshot.forEach(doc => {
      suppliersMap[doc.id] = { id: doc.id, ...doc.data() };
    });

    const purchaseOrders = [];
    querySnapshot.forEach(docRef => {
      const poData = docRef.data();
      const supplierData = poData.supplierId ? suppliersMap[poData.supplierId] || null : null;
      
      // Filtrowanie po pozycji magazynowej
      let includeThisPO = true;
      if (itemId) {
        includeThisPO = false;
        if (poData.items && Array.isArray(poData.items)) {
          includeThisPO = poData.items.some(item => 
            item.inventoryItemId === itemId
          );
        }
      }
      
      if (includeThisPO) {
        purchaseOrders.push({
          id: docRef.id,
          ...poData,
          supplier: supplierData,
          orderDate: safeConvertDate(poData.orderDate),
          expectedDeliveryDate: safeConvertDate(poData.expectedDeliveryDate),
          createdAt: safeConvertDate(poData.createdAt),
        });
      }
    });

    return purchaseOrders;
  } catch (error) {
    console.error('Błąd podczas pobierania danych dla raportu:', error);
    throw error;
  }
};

/**
 * Generuje raport CSV z Purchase Orders
 */
export const generatePurchaseOrderReport = async (filters) => {
  try {
    console.log('Generowanie raportu PO z filtrami:', filters);
    
    // Pobierz dane
    const purchaseOrders = await getPurchaseOrdersForReport(filters);
    
    if (!purchaseOrders || purchaseOrders.length === 0) {
      throw new Error('Brak danych do wygenerowania raportu w wybranym okresie');
    }

    console.log(`Znaleziono ${purchaseOrders.length} zamówień zakupowych`);

    // Przygotuj dane do eksportu - poziom Purchase Order
    const poSummaryData = purchaseOrders.map(po => ({
      poNumber: po.number || `PO${po.id?.substring(0, 6) || ''}`,
      supplierName: po.supplier?.name || 'Nieznany dostawca',
      orderDate: po.orderDate ? formatDateForExport(po.orderDate) : '',
      expectedDeliveryDate: po.expectedDeliveryDate ? formatDateForExport(po.expectedDeliveryDate) : '',
      status: po.status || '',
      paymentStatus: po.paymentStatus || '',
      currency: po.currency || 'EUR',
      totalValue: po.totalValue || 0,
      totalGross: po.totalGross || 0,
      totalVat: po.totalVat || 0,
      itemsCount: po.items?.length || 0,
      notes: po.notes || ''
    }));

    // Przygotuj dane pozycji - poziom szczegółowy
    const itemsData = [];
    const itemsSummaryMap = {}; // Mapa do agregacji pozycji
    
    purchaseOrders.forEach(po => {
      if (po.items && Array.isArray(po.items)) {
        po.items.forEach(item => {
          // Jeśli wybrano konkretną pozycję, filtruj tylko tę pozycję
          if (filters.itemId && item.inventoryItemId !== filters.itemId) {
            return; // Pomiń tę pozycję
          }
          
          const itemDetail = {
            poNumber: po.number || `PO${po.id?.substring(0, 6) || ''}`,
            supplierName: po.supplier?.name || 'Nieznany dostawca',
            orderDate: po.orderDate ? formatDateForExport(po.orderDate) : '',
            itemName: item.name || '',
            quantity: item.quantity || 0,
            unit: item.unit || '',
            unitPrice: item.unitPrice || 0,
            totalPrice: item.totalPrice || 0,
            discount: item.discount || 0,
            vatRate: item.vatRate || 0,
            currency: item.currency || po.currency || 'EUR',
            invoiceNumber: item.invoiceNumber || '',
            invoiceDate: item.invoiceDate ? formatDateForExport(item.invoiceDate) : '',
            plannedDeliveryDate: item.plannedDeliveryDate ? formatDateForExport(item.plannedDeliveryDate) : '',
            actualDeliveryDate: item.actualDeliveryDate ? formatDateForExport(item.actualDeliveryDate) : '',
            expiryDate: item.expiryDate ? formatDateForExport(item.expiryDate) : ''
          };
          
          itemsData.push(itemDetail);
          
          // Agreguj dane do podsumowania pozycji
          
          const itemKey = item.name || 'Nieznana pozycja';
          if (!itemsSummaryMap[itemKey]) {
            itemsSummaryMap[itemKey] = {
              itemName: item.name || '',
              unit: item.unit || '',
              totalQuantity: 0,
              totalValue: 0,
              ordersCount: 0,
              avgUnitPrice: 0,
              minUnitPrice: Number.MAX_VALUE,
              maxUnitPrice: 0,
              suppliers: new Set(),
              currencies: new Set()
            };
          }
          
          const summary = itemsSummaryMap[itemKey];
          const quantity = parseFloat(item.quantity) || 0;
          const totalPrice = parseFloat(item.totalPrice) || 0;
          const unitPrice = parseFloat(item.unitPrice) || 0;
          
          summary.totalQuantity += quantity;
          summary.totalValue += totalPrice;
          summary.ordersCount += 1;
          summary.suppliers.add(po.supplier?.name || 'Nieznany dostawca');
          summary.currencies.add(item.currency || po.currency || 'EUR');
          
          if (unitPrice > 0) {
            summary.minUnitPrice = Math.min(summary.minUnitPrice, unitPrice);
            summary.maxUnitPrice = Math.max(summary.maxUnitPrice, unitPrice);
          }
        });
      }
    });

    // Przygotuj dane podsumowania pozycji
    const itemsSummaryData = Object.values(itemsSummaryMap).map(summary => {
      // Oblicz średnią cenę jednostkową
      summary.avgUnitPrice = summary.totalQuantity > 0 ? summary.totalValue / summary.totalQuantity : 0;
      
      // Konwertuj Set na string
      summary.suppliers = Array.from(summary.suppliers).join(', ');
      summary.currencies = Array.from(summary.currencies).join(', ');
      
      // Obsłuż przypadek gdy nie było żadnych cen
      if (summary.minUnitPrice === Number.MAX_VALUE) {
        summary.minUnitPrice = 0;
      }
      
      return summary;
    }).sort((a, b) => b.totalValue - a.totalValue); // Sortuj po wartości malejąco

    // Oblicz podsumowania
    const totalPOs = purchaseOrders.length;
    const totalValue = purchaseOrders.reduce((sum, po) => sum + (po.totalValue || 0), 0);
    const totalGross = purchaseOrders.reduce((sum, po) => sum + (po.totalGross || 0), 0);
    const totalItems = itemsData.length;
    
    // Podsumowanie po dostawcach
    const supplierSummary = {};
    purchaseOrders.forEach(po => {
      const supplierName = po.supplier?.name || 'Nieznany dostawca';
      if (!supplierSummary[supplierName]) {
        supplierSummary[supplierName] = {
          supplierName,
          posCount: 0,
          totalValue: 0,
          totalGross: 0,
          itemsCount: 0
        };
      }
      supplierSummary[supplierName].posCount += 1;
      supplierSummary[supplierName].totalValue += po.totalValue || 0;
      supplierSummary[supplierName].totalGross += po.totalGross || 0;
      supplierSummary[supplierName].itemsCount += po.items?.length || 0;
    });

    const summaryData = Object.values(supplierSummary);

    // Nagłówki dla podsumowania PO
    const poSummaryHeaders = [
      { label: 'Numer PO', key: 'poNumber' },
      { label: 'Dostawca', key: 'supplierName' },
      { label: 'Data zamówienia', key: 'orderDate' },
      { label: 'Oczekiwana dostawa', key: 'expectedDeliveryDate' },
      { label: 'Status', key: 'status' },
      { label: 'Status płatności', key: 'paymentStatus' },
      { label: 'Waluta', key: 'currency' },
      { label: 'Wartość netto', key: 'totalValue' },
      { label: 'Wartość brutto', key: 'totalGross' },
      { label: 'VAT', key: 'totalVat' },
      { label: 'Liczba pozycji', key: 'itemsCount' },
      { label: 'Uwagi', key: 'notes' }
    ];

    // Nagłówki dla pozycji
    const itemsHeaders = [
      { label: 'Numer PO', key: 'poNumber' },
      { label: 'Dostawca', key: 'supplierName' },
      { label: 'Data zamówienia', key: 'orderDate' },
      { label: 'Nazwa pozycji', key: 'itemName' },
      { label: 'Ilość', key: 'quantity' },
      { label: 'Jednostka', key: 'unit' },
      { label: 'Cena jednostkowa', key: 'unitPrice' },
      { label: 'Wartość pozycji', key: 'totalPrice' },
      { label: 'Rabat (%)', key: 'discount' },
      { label: 'Stawka VAT (%)', key: 'vatRate' },
      { label: 'Waluta', key: 'currency' },
      { label: 'Nr faktury', key: 'invoiceNumber' },
      { label: 'Data faktury', key: 'invoiceDate' },
      { label: 'Planowana dostawa', key: 'plannedDeliveryDate' },
      { label: 'Rzeczywista dostawa', key: 'actualDeliveryDate' },
      { label: 'Data ważności', key: 'expiryDate' }
    ];

    // Nagłówki dla podsumowania pozycji
    const itemsSummaryHeaders = [
      { label: 'Nazwa pozycji', key: 'itemName' },
      { label: 'Jednostka', key: 'unit' },
      { label: 'Łączna ilość zamówiona', key: 'totalQuantity' },
      { label: 'Łączna wartość', key: 'totalValue' },
      { label: 'Liczba zamówień', key: 'ordersCount' },
      { label: 'Średnia cena jednostkowa', key: 'avgUnitPrice' },
      { label: 'Minimalna cena', key: 'minUnitPrice' },
      { label: 'Maksymalna cena', key: 'maxUnitPrice' },
      { label: 'Dostawcy', key: 'suppliers' },
      { label: 'Waluty', key: 'currencies' }
    ];

    // Nagłówki dla podsumowania dostawców
    const summaryHeaders = [
      { label: 'Dostawca', key: 'supplierName' },
      { label: 'Liczba PO', key: 'posCount' },
      { label: 'Wartość netto', key: 'totalValue' },
      { label: 'Wartość brutto', key: 'totalGross' },
      { label: 'Liczba pozycji', key: 'itemsCount' }
    ];

    // Generuj nazwy plików
    const dateRange = `${formatDateForExport(filters.dateFrom, 'yyyy-MM-dd')}_${formatDateForExport(filters.dateTo, 'yyyy-MM-dd')}`;
    const itemSuffix = filters.itemName && filters.itemName !== 'Wszystkie pozycje' 
      ? `_${filters.itemName.replace(/[^a-zA-Z0-9]/g, '_')}` 
      : '_wszystkie_pozycje';

    // Przygotuj arkusze dla pliku Excel
    const worksheets = [
      {
        name: 'Podsumowanie PO',
        data: poSummaryData,
        headers: poSummaryHeaders
      },
      {
        name: 'Pozycje',
        data: itemsData,
        headers: itemsHeaders
      },
      {
        name: 'Podsumowanie pozycji',
        data: itemsSummaryData,
        headers: itemsSummaryHeaders
      },
      {
        name: 'Dostawcy',
        data: summaryData,
        headers: summaryHeaders
      }
    ];

    // Eksportuj jeden plik Excel z arkuszami
    const success = exportToExcel(
      worksheets,
      `PO_Raport_${dateRange}${itemSuffix}`
    );

    if (success) {
      return {
        success: true,
        message: `Wygenerowano raport Excel z 4 arkuszami: Podsumowanie PO (${totalPOs} zamówień), Pozycje (${totalItems} pozycji), Podsumowanie pozycji (${itemsSummaryData.length} pozycji), Podsumowanie dostawców (${summaryData.length} dostawców)`,
        stats: {
          totalPOs,
          totalItems,
          totalValue,
          totalGross,
          suppliersCount: summaryData.length,
          itemsSummaryCount: itemsSummaryData.length
        }
      };
    } else {
      throw new Error('Błąd podczas eksportu pliku Excel');
    }

  } catch (error) {
    console.error('Błąd podczas generowania raportu:', error);
    throw error;
  }
};
