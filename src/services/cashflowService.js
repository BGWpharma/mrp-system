// src/services/cashflowService.js
import { 
  collection, 
  query, 
  where, 
  getDocs,
  Timestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { getInvoicesByOrderId } from './invoiceService';
import { safeParseDate } from '../utils/dateUtils';
import { getFactoryCostsByDateRange } from './factoryCostService';

/**
 * Generuje raport cashflow dla zamówień klientów (CO)
 * @param {Object} filters - Filtry raportu
 * @param {Date} filters.dateFrom - Data początkowa
 * @param {Date} filters.dateTo - Data końcowa
 * @param {string} filters.customerId - ID klienta (opcjonalnie)
 * @param {string} filters.paymentStatus - Status płatności (opcjonalnie)
 * @returns {Promise<Array>} - Dane cashflow dla zamówień
 */
export const generateCashflowReport = async (filters = {}) => {
  try {
    console.log('🔄 Generowanie raportu cashflow...', filters);
    
    // 1. Pobierz faktury w zakresie dat (filtrowanie po datach faktur, nie zamówień)
    let invoicesInRange = [];
    const invoicesRef = collection(db, 'invoices');
    
    if (filters.dateFrom && filters.dateTo) {
      // Konwertuj daty na Timestamp dla Firestore
      const fromTimestamp = Timestamp.fromDate(new Date(filters.dateFrom));
      const toTimestamp = Timestamp.fromDate(new Date(filters.dateTo));
      
      // Pobierz faktury w zakresie dat (issueDate)
      const invoicesQuery = query(
        invoicesRef,
        where('issueDate', '>=', fromTimestamp),
        where('issueDate', '<=', toTimestamp)
      );
      
      const invoicesSnapshot = await getDocs(invoicesQuery);
      invoicesInRange = invoicesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        issueDate: safeParseDate(doc.data().issueDate),
        dueDate: safeParseDate(doc.data().dueDate),
        paymentDate: safeParseDate(doc.data().paymentDate)
      }));
      
      console.log(`📄 Znaleziono ${invoicesInRange.length} faktur/proform w zakresie dat`);
    } else {
      // Pobierz wszystkie faktury
      const invoicesSnapshot = await getDocs(invoicesRef);
      invoicesInRange = invoicesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        issueDate: safeParseDate(doc.data().issueDate),
        dueDate: safeParseDate(doc.data().dueDate),
        paymentDate: safeParseDate(doc.data().paymentDate)
      }));
    }
    
    // 2. Wyciągnij unikalne orderId z faktur
    const orderIds = [...new Set(invoicesInRange
      .filter(inv => inv.orderId)
      .map(inv => inv.orderId))];
    
    console.log(`🔍 Znaleziono ${orderIds.length} unikalnych zamówień powiązanych z fakturami`);
    
    // 3. Pobierz zamówienia dla tych orderIds
    let orders = [];
    if (orderIds.length > 0) {
      // Firestore 'in' query ma limit 10 elementów, więc dzielimy na chunki
      const chunks = [];
      for (let i = 0; i < orderIds.length; i += 10) {
        chunks.push(orderIds.slice(i, i + 10));
      }
      
      const ordersRef = collection(db, 'orders');
      const orderPromises = chunks.map(async (chunk) => {
        const ordersQuery = query(ordersRef, where('__name__', 'in', chunk));
        const snapshot = await getDocs(ordersQuery);
        return snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          orderDate: safeParseDate(doc.data().orderDate),
          createdAt: safeParseDate(doc.data().createdAt)
        }));
      });
      
      const ordersArrays = await Promise.all(orderPromises);
      orders = ordersArrays.flat();
    }
    
    // 4. Filtruj po kliencie jeśli podano
    if (filters.customerId && filters.customerId !== 'all') {
      orders = orders.filter(order => order.customer?.id === filters.customerId);
    }
    
    console.log(`📋 Znaleziono ${orders.length} zamówień do analizy (po filtrowaniu po kliencie)`);
    
    // 5. Dla każdego CO pobierz wszystkie faktury i proformy (używamy już pobranych faktur jeśli są w zakresie)
    const cashflowData = await Promise.all(
      orders.map(async (order) => {
        try {
          // Użyj faktur z cache jeśli dostępne, w przeciwnym razie pobierz
          let invoices = invoicesInRange.filter(inv => inv.orderId === order.id);
          
          // Jeśli nie ma filtrowania po datach lub potrzebujemy wszystkich faktur zamówienia
          if (invoices.length === 0 || !filters.dateFrom) {
            invoices = await getInvoicesByOrderId(order.id);
          }
          
          // Rozdziel na proformy i faktury
          const proformas = invoices.filter(inv => inv.isProforma);
          const finalInvoices = invoices.filter(inv => !inv.isProforma);
          
          // Zbierz wszystkie płatności z timeline
          const paymentTimeline = [];
          
          // Płatności z proform - liczy się tylko faktyczna wpłata, nie status proformy
          proformas.forEach(proforma => {
            if (proforma.payments && Array.isArray(proforma.payments)) {
              proforma.payments.forEach(payment => {
                paymentTimeline.push({
                  date: safeParseDate(payment.date),
                  type: 'proforma',
                  documentNumber: proforma.number,
                  documentId: proforma.id,
                  amount: parseFloat(payment.amount || 0),
                  method: payment.method || 'Przelew',
                  description: payment.description || '',
                  reference: payment.reference || '',
                  status: 'confirmed',
                  currency: proforma.currency || 'EUR'
                });
              });
            }
            
            // Dodaj oczekiwane płatności dla nieopłaconych proform
            const proformaPaid = (proforma.payments || [])
              .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
            const proformaRemaining = parseFloat(proforma.total || 0) - proformaPaid;
            
            // Jeśli proforma nie jest w pełni opłacona i nie jest anulowana
            if (proformaRemaining > 0.01 && proforma.status !== 'cancelled') {
              const dueDate = safeParseDate(proforma.dueDate);
              const isOverdue = dueDate && new Date(dueDate) < new Date();
              
              paymentTimeline.push({
                date: dueDate || new Date(),
                type: 'proforma',
                documentNumber: proforma.number,
                documentId: proforma.id,
                amount: proformaRemaining,
                method: proforma.paymentMethod || 'Przelew',
                description: isOverdue ? 'Przeterminowana płatność (proforma)' : 'Oczekiwana płatność (proforma)',
                reference: '',
                status: 'expected',
                isOverdue: isOverdue,
                currency: proforma.currency || 'EUR'
              });
            }
          });
          
          // Płatności z faktur końcowych (pomijając zaliczki już zliczone w proformach)
          finalInvoices.forEach(invoice => {
            // Płatności bezpośrednie
            if (invoice.payments && Array.isArray(invoice.payments)) {
              invoice.payments.forEach(payment => {
                paymentTimeline.push({
                  date: safeParseDate(payment.date),
                  type: 'invoice',
                  documentNumber: invoice.number,
                  documentId: invoice.id,
                  amount: parseFloat(payment.amount || 0),
                  method: payment.method || 'Przelew',
                  description: payment.description || '',
                  reference: payment.reference || '',
                  status: 'confirmed',
                  currency: invoice.currency || 'EUR'
                });
              });
            }
            
            // Oczekiwane płatności (jeśli nie w pełni opłacone)
            const totalAllocated = (invoice.proformAllocation || [])
              .reduce((sum, alloc) => sum + parseFloat(alloc.amount || 0), 0);
            const totalPaid = (invoice.payments || [])
              .reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
            const remaining = parseFloat(invoice.total || 0) - totalAllocated - totalPaid;
            
            if (remaining > 0.01 && invoice.status !== 'cancelled') {
              const dueDate = safeParseDate(invoice.dueDate);
              const isOverdue = dueDate && new Date(dueDate) < new Date();
              
              paymentTimeline.push({
                date: dueDate || new Date(),
                type: 'invoice',
                documentNumber: invoice.number,
                documentId: invoice.id,
                amount: remaining,
                method: invoice.paymentMethod || 'Przelew',
                description: isOverdue ? 'Przeterminowana płatność' : 'Oczekiwana płatność',
                reference: '',
                status: 'expected',
                isOverdue: isOverdue,
                currency: invoice.currency || 'EUR'
              });
            }
          });
          
          // Sortuj chronologicznie
          paymentTimeline.sort((a, b) => {
            const dateA = a.date ? new Date(a.date) : new Date();
            const dateB = b.date ? new Date(b.date) : new Date();
            return dateA - dateB;
          });
          
          // Oblicz agregaty
          const totalPaid = paymentTimeline
            .filter(p => p.status === 'confirmed')
            .reduce((sum, p) => sum + p.amount, 0);
          
          const totalExpected = paymentTimeline
            .filter(p => p.status === 'expected')
            .reduce((sum, p) => sum + p.amount, 0);
          
          const totalProforma = proformas.reduce((sum, p) => sum + parseFloat(p.total || 0), 0);
          
          // Oblicz ile z proform zostało faktycznie wpłacone (nie interesuje nas czy są w pełni opłacone)
          const totalProformaPaid = proformas.reduce((sum, p) => {
            const paid = (p.payments || []).reduce((pSum, payment) => 
              pSum + parseFloat(payment.amount || 0), 0);
            return sum + paid;
          }, 0);
          
          const totalInvoiced = finalInvoices.reduce((sum, i) => sum + parseFloat(i.total || 0), 0);
          
          const orderValue = parseFloat(order.totalValue || order.total || order.totalGross || 0);
          const paymentStatus = calculatePaymentStatus(orderValue, totalPaid, totalExpected);
          
          // Znajdź daty pierwszej i ostatniej płatności
          const confirmedPayments = paymentTimeline.filter(p => p.status === 'confirmed');
          const firstPaymentDate = confirmedPayments.length > 0 ? confirmedPayments[0].date : null;
          const lastPaymentDate = confirmedPayments.length > 0 ? 
            confirmedPayments[confirmedPayments.length - 1].date : null;
          
          // Znajdź najbliższą oczekiwaną płatność
          const expectedPayments = paymentTimeline.filter(p => p.status === 'expected');
          const nextPaymentDate = expectedPayments.length > 0 ? expectedPayments[0].date : null;
          
          return {
            orderId: order.id,
            orderNumber: order.orderNumber || order.id.substring(0, 8),
            orderDate: order.orderDate || order.createdAt,
            customer: order.customer || { name: 'Nieznany klient' },
            orderValue: orderValue,
            currency: order.currency || 'EUR',
            paymentTimeline,
            proformas: proformas.map(p => {
              const paid = (p.payments || []).reduce((sum, payment) => 
                sum + parseFloat(payment.amount || 0), 0);
              return {
                id: p.id,
                number: p.number,
                total: parseFloat(p.total || 0),
                paid: paid
                // Celowo nie dodajemy status - nie interesuje nas czy proforma jest w pełni opłacona
              };
            }),
            finalInvoices: finalInvoices.map(i => ({
              id: i.id,
              number: i.number,
              total: parseFloat(i.total || 0),
              status: i.paymentStatus
            })),
            totalProforma,
            totalProformaPaid,
            totalInvoiced,
            totalPaid,
            totalRemaining: totalExpected,
            paymentStatus,
            firstPaymentDate,
            lastPaymentDate,
            nextPaymentDate,
            hasOverdue: paymentTimeline.some(p => p.isOverdue)
          };
        } catch (error) {
          console.error(`❌ Błąd podczas przetwarzania zamówienia ${order.id}:`, error);
          return null;
        }
      })
    );
    
    // Filtruj null values (błędy)
    const validData = cashflowData.filter(item => item !== null);
    
    // Filtruj po statusie płatności jeśli podano
    let filteredData = validData;
    if (filters.paymentStatus && filters.paymentStatus !== 'all') {
      filteredData = validData.filter(item => item.paymentStatus === filters.paymentStatus);
    }
    
    console.log(`✅ Wygenerowano raport cashflow dla ${filteredData.length} zamówień`);
    
    return filteredData;
  } catch (error) {
    console.error('❌ Błąd podczas generowania raportu cashflow:', error);
    throw error;
  }
};

/**
 * Oblicza status płatności na podstawie wartości zamówienia i wpłat
 * @param {number} orderValue - Wartość zamówienia
 * @param {number} paid - Wpłacona kwota
 * @param {number} remaining - Pozostała kwota do zapłaty
 * @returns {string} - Status płatności
 */
const calculatePaymentStatus = (orderValue, paid, remaining) => {
  const tolerance = 0.01; // Tolerancja 1 cent
  
  if (paid >= orderValue - tolerance) {
    return 'paid';
  }
  
  if (paid > tolerance) {
    return 'partially_paid';
  }
  
  if (remaining > tolerance) {
    return 'pending';
  }
  
  return 'not_invoiced';
};

/**
 * Oblicza statystyki dla raportu cashflow
 * @param {Array} cashflowData - Dane cashflow
 * @returns {Object} - Statystyki
 */
export const calculateCashflowStatistics = (cashflowData) => {
  if (!cashflowData || cashflowData.length === 0) {
    return {
      totalOrders: 0,
      totalOrderValue: 0,
      totalProformaValue: 0,
      totalInvoicedValue: 0,
      totalPaid: 0,
      totalRemaining: 0,
      paymentRate: 0,
      avgOrderValue: 0,
      avgPaymentTime: 0
    };
  }
  
  const totalOrders = cashflowData.length;
  const totalOrderValue = cashflowData.reduce((sum, item) => sum + item.orderValue, 0);
  const totalProformaValue = cashflowData.reduce((sum, item) => sum + item.totalProforma, 0);
  const totalInvoicedValue = cashflowData.reduce((sum, item) => sum + item.totalInvoiced, 0);
  const totalPaid = cashflowData.reduce((sum, item) => sum + item.totalPaid, 0);
  const totalRemaining = cashflowData.reduce((sum, item) => sum + item.totalRemaining, 0);
  
  // Wskaźnik spłat (ile % zamówień jest opłaconych)
  const paidOrders = cashflowData.filter(item => item.paymentStatus === 'paid').length;
  const paymentRate = totalOrders > 0 ? (paidOrders / totalOrders) * 100 : 0;
  
  // Średnia wartość zamówienia
  const avgOrderValue = totalOrders > 0 ? totalOrderValue / totalOrders : 0;
  
  // Średni czas płatności (dni od zamówienia do pierwszej płatności)
  const ordersWithPayments = cashflowData.filter(item => item.firstPaymentDate && item.orderDate);
  let avgPaymentTime = 0;
  if (ordersWithPayments.length > 0) {
    const totalDays = ordersWithPayments.reduce((sum, item) => {
      const orderDate = new Date(item.orderDate);
      const paymentDate = new Date(item.firstPaymentDate);
      const days = Math.floor((paymentDate - orderDate) / (1000 * 60 * 60 * 24));
      return sum + days;
    }, 0);
    avgPaymentTime = totalDays / ordersWithPayments.length;
  }
  
  return {
    totalOrders,
    totalOrderValue,
    totalProformaValue,
    totalInvoicedValue,
    totalPaid,
    totalRemaining,
    paymentRate: Math.round(paymentRate * 100) / 100,
    avgOrderValue,
    avgPaymentTime: Math.round(avgPaymentTime)
  };
};

/**
 * Przygotowuje dane dla wykresu cashflow timeline
 * @param {Array} cashflowData - Dane cashflow
 * @param {Date} startDate - Data początkowa zakresu
 * @param {Date} endDate - Data końcowa zakresu
 * @returns {Array} - Dane dla wykresu
 */
export const prepareCashflowChartData = (cashflowData, startDate, endDate) => {
  if (!cashflowData || cashflowData.length === 0) {
    return [];
  }
  
  // Zbierz wszystkie płatności ze wszystkich zamówień
  const allPayments = [];
  cashflowData.forEach(order => {
    order.paymentTimeline.forEach(payment => {
      const paymentDate = new Date(payment.date);
      
      // Filtruj płatności do zakresu dat jeśli podano
      if (startDate && paymentDate < new Date(startDate)) return;
      if (endDate && paymentDate > new Date(endDate)) return;
      
      allPayments.push({
        date: paymentDate,
        amount: payment.amount,
        status: payment.status,
        orderNumber: order.orderNumber
      });
    });
  });
  
  // Sortuj po dacie
  allPayments.sort((a, b) => a.date - b.date);
  
  // Oblicz skumulowane wartości
  let cumulativePaid = 0;
  let cumulativeExpected = 0;
  
  const dateMap = new Map();
  
  allPayments.forEach(payment => {
    const dateKey = payment.date.toISOString().split('T')[0];
    
    if (payment.status === 'confirmed') {
      cumulativePaid += payment.amount;
    } else {
      cumulativeExpected += payment.amount;
    }
    
    // Grupuj płatności z tego samego dnia
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, {
        date: dateKey,
        cumulativePaid,
        cumulativeExpected: cumulativePaid + cumulativeExpected,
        dailyPaid: 0,
        dailyExpected: 0
      });
    }
    
    const dayData = dateMap.get(dateKey);
    dayData.cumulativePaid = cumulativePaid;
    dayData.cumulativeExpected = cumulativePaid + cumulativeExpected;
    
    if (payment.status === 'confirmed') {
      dayData.dailyPaid += payment.amount;
    } else {
      dayData.dailyExpected += payment.amount;
    }
  });
  
  // Konwertuj mapę na tablicę i sortuj
  return Array.from(dateMap.values()).sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  );
};

/**
 * Eksportuje dane cashflow do CSV z globalnymi wydatkami
 * 
 * Struktura eksportu:
 * - SEKCJA 1: Podsumowanie okresu (jeśli przekazano statistics)
 *   - Podstawowe metryki: liczba zamówień, wartość, wpłacono, oczekiwane
 *   - Wydatki PO: liczba, wartość, zapłacono, pozostało
 *   - Cashflow: netto, zysk, marża
 * 
 * - SEKCJA 2: Zamówienia klientów (CO)
 *   - Lista wszystkich zamówień z podstawowymi danymi
 *   - Proformy, faktury, płatności
 * 
 * - SEKCJA 3: Wydatki - Purchase Orders w okresie
 *   - Lista wszystkich PO w zakresie dat
 *   - Szczegóły pozycji, daty dostawy, statusy
 *   - Podsumowanie wydatków
 * 
 * @param {Object} cashflowDataWithExpenses - Obiekt z {orders, globalExpenses} LUB sama tablica orders (backward compatibility)
 * @param {Object} statistics - Statystyki (opcjonalnie)
 * @param {string} filename - Nazwa pliku (opcjonalnie)
 */
export const exportCashflowToCSV = (cashflowDataWithExpenses, statistics = null, filename = null) => {
  // Backward compatibility - jeśli przekazano samą tablicę
  let orders = [];
  let globalExpenses = null;
  
  if (Array.isArray(cashflowDataWithExpenses)) {
    orders = cashflowDataWithExpenses;
  } else if (cashflowDataWithExpenses && typeof cashflowDataWithExpenses === 'object') {
    orders = cashflowDataWithExpenses.orders || [];
    globalExpenses = cashflowDataWithExpenses.globalExpenses || null;
  }
  
  if (!orders || orders.length === 0) {
    throw new Error('Brak danych do eksportu');
  }
  
  const csvSections = [];
  
  // ========================================
  // SEKCJA 1: PODSUMOWANIE OKRESU
  // ========================================
  if (statistics) {
    csvSections.push('PODSUMOWANIE OKRESU');
    csvSections.push('');
    csvSections.push('Metryka,Wartość');
    csvSections.push(`"Liczba zamówień","${statistics.totalOrders || 0}"`);
    csvSections.push(`"Wartość zamówień (EUR)","${(statistics.totalOrderValue || 0).toFixed(2)}"`);
    csvSections.push(`"Wpłacono (EUR)","${(statistics.totalPaid || 0).toFixed(2)}"`);
    csvSections.push(`"Oczekiwane wpłaty (EUR)","${(statistics.totalRemaining || 0).toFixed(2)}"`);
    csvSections.push('');
    
    if (globalExpenses) {
      csvSections.push(`"Wydatki - liczba PO","${statistics.totalPOCount || 0}"`);
      csvSections.push(`"Wydatki - wartość PO (EUR)","${(statistics.totalExpenses || 0).toFixed(2)}"`);
      csvSections.push(`"Wydatki - zapłacono (EUR)","${(statistics.totalExpensesPaid || 0).toFixed(2)}"`);
      csvSections.push(`"Wydatki - pozostało (EUR)","${(statistics.totalExpensesRemaining || 0).toFixed(2)}"`);
      csvSections.push('');
      csvSections.push(`"Cashflow netto okresu (EUR)","${(statistics.netCashflow || 0).toFixed(2)}"`);
      csvSections.push(`"Zysk netto okresu (EUR)","${(statistics.netProfit || 0).toFixed(2)}"`);
      csvSections.push(`"Marża okresu (%)","${statistics.profitMargin || 0}"`);
    }
    
    csvSections.push('');
    csvSections.push(`"Wskaźnik spłat (%)","${(statistics.paymentRate || 0).toFixed(2)}"`);
    csvSections.push(`"Średni czas płatności (dni)","${statistics.avgPaymentTime || 0}"`);
    csvSections.push('');
    csvSections.push('');
  }
  
  // ========================================
  // SEKCJA 2: ZAMÓWIENIA KLIENTÓW (CO)
  // ========================================
  csvSections.push('ZAMÓWIENIA KLIENTÓW (CO)');
  csvSections.push('');
  
  const ordersHeaders = [
    'Nr Zamówienia',
    'Data Zamówienia',
    'Klient',
    'Wartość Zamówienia (EUR)',
    'Proformy (ilość)',
    'Proformy (wartość EUR)',
    'Proformy (wpłacono EUR)',
    'Faktury (ilość)',
    'Faktury (wartość EUR)',
    'Wpłacono (EUR)',
    'Do Zapłaty (EUR)',
    'Status Płatności',
    'Pierwsza Płatność',
    'Ostatnia Płatność',
    'Następna Płatność'
  ];
  
  csvSections.push(ordersHeaders.join(','));
  
  orders.forEach(item => {
    const row = [
      item.orderNumber,
      item.orderDate ? new Date(item.orderDate).toLocaleDateString('pl-PL') : '',
      item.customer?.name || '',
      item.orderValue.toFixed(2),
      item.proformas.length,
      item.totalProforma.toFixed(2),
      item.totalProformaPaid.toFixed(2),
      item.finalInvoices.length,
      item.totalInvoiced.toFixed(2),
      item.totalPaid.toFixed(2),
      item.totalRemaining.toFixed(2),
      getPaymentStatusLabel(item.paymentStatus),
      item.firstPaymentDate ? new Date(item.firstPaymentDate).toLocaleDateString('pl-PL') : '',
      item.lastPaymentDate ? new Date(item.lastPaymentDate).toLocaleDateString('pl-PL') : '',
      item.nextPaymentDate ? new Date(item.nextPaymentDate).toLocaleDateString('pl-PL') : ''
    ];
    csvSections.push(row.map(cell => `"${cell}"`).join(','));
  });
  
  csvSections.push('');
  csvSections.push('');
  
  // ========================================
  // SEKCJA 3: WYDATKI - PURCHASE ORDERS W OKRESIE
  // ========================================
  if (globalExpenses && globalExpenses.expenseTimeline && globalExpenses.expenseTimeline.length > 0) {
    csvSections.push('WYDATKI - PURCHASE ORDERS W OKRESIE');
    csvSections.push('');
    
    const expensesHeaders = [
      'Data Dostawy',
      'Nr PO',
      'Dostawca',
      'Pozycja',
      'Wartość (EUR)',
      'Status Płatności',
      'Przeterminowane'
    ];
    
    csvSections.push(expensesHeaders.join(','));
    
    globalExpenses.expenseTimeline.forEach(expense => {
      const row = [
        expense.date ? new Date(expense.date).toLocaleDateString('pl-PL') : '',
        expense.poNumber || '',
        expense.supplier || '',
        expense.itemName || 'Całe PO',
        expense.amount.toFixed(2),
        expense.isPaid ? 'Zapłacone' : 'Niezapłacone',
        expense.isOverdue ? 'TAK' : 'NIE'
      ];
      csvSections.push(row.map(cell => `"${cell}"`).join(','));
    });
    
    csvSections.push('');
    csvSections.push('');
    
    // Podsumowanie wydatków
    csvSections.push('PODSUMOWANIE WYDATKÓW');
    csvSections.push('');
    csvSections.push(`"Liczba PO w okresie","${globalExpenses.totalPOCount || 0}"`);
    csvSections.push(`"Łączna wartość (EUR)","${(globalExpenses.totalExpenseValue || 0).toFixed(2)}"`);
    csvSections.push(`"Zapłacono (EUR)","${(globalExpenses.totalExpensePaid || 0).toFixed(2)}"`);
    csvSections.push(`"Pozostało do zapłaty (EUR)","${(globalExpenses.totalExpenseRemaining || 0).toFixed(2)}"`);
  }
  
  // Utwórz zawartość CSV
  const csvContent = csvSections.join('\n');
  
  // Pobierz plik
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename || `cashflow_report_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

/**
 * Eksportuje ROZSZERZONY raport cashflow do CSV ze szczegółami timeline
 * 
 * Struktura eksportu (rozszerzony):
 * - SEKCJA 1: Podsumowanie okresu
 *   - Data wygenerowania raportu
 *   - Wszystkie metryki finansowe
 * 
 * - SEKCJA 2: Szczegóły zamówień z timeline płatności
 *   - Każde zamówienie z pełną historią płatności
 *   - Szczegóły każdej transakcji: data, typ, dokument, kwota, status, metoda
 *   - Podsumowanie dla każdego zamówienia
 * 
 * - SEKCJA 3: Wydatki - Purchase Orders (pogrupowane)
 *   - PO pogrupowane z wszystkimi pozycjami
 *   - Szczegółowa timeline dostaw dla każdego PO
 *   - Podsumowanie dla każdego PO i całościowe
 * 
 * Ten format jest bardziej szczegółowy niż standardowy eksport i zawiera pełną historię transakcji.
 * 
 * @param {Object} cashflowDataWithExpenses - Obiekt z {orders, globalExpenses}
 * @param {Object} statistics - Statystyki
 * @param {string} filename - Nazwa pliku
 */
export const exportDetailedCashflowToCSV = (cashflowDataWithExpenses, statistics = null, filename = null) => {
  let orders = [];
  let globalExpenses = null;
  
  if (Array.isArray(cashflowDataWithExpenses)) {
    orders = cashflowDataWithExpenses;
  } else if (cashflowDataWithExpenses && typeof cashflowDataWithExpenses === 'object') {
    orders = cashflowDataWithExpenses.orders || [];
    globalExpenses = cashflowDataWithExpenses.globalExpenses || null;
  }
  
  if (!orders || orders.length === 0) {
    throw new Error('Brak danych do eksportu');
  }
  
  const csvSections = [];
  
  // ========================================
  // SEKCJA 1: PODSUMOWANIE OKRESU
  // ========================================
  if (statistics) {
    csvSections.push('RAPORT CASHFLOW - SZCZEGÓŁOWY');
    csvSections.push(`"Data wygenerowania","${new Date().toLocaleString('pl-PL')}"`);
    csvSections.push('');
    csvSections.push('PODSUMOWANIE OKRESU');
    csvSections.push('');
    csvSections.push('Metryka,Wartość');
    csvSections.push(`"Liczba zamówień","${statistics.totalOrders || 0}"`);
    csvSections.push(`"Wartość zamówień (EUR)","${(statistics.totalOrderValue || 0).toFixed(2)}"`);
    csvSections.push(`"Wpłacono (EUR)","${(statistics.totalPaid || 0).toFixed(2)}"`);
    csvSections.push(`"Oczekiwane wpłaty (EUR)","${(statistics.totalRemaining || 0).toFixed(2)}"`);
    
    if (globalExpenses) {
      csvSections.push('');
      csvSections.push(`"Wydatki - liczba PO","${statistics.totalPOCount || 0}"`);
      csvSections.push(`"Wydatki - wartość PO (EUR)","${(statistics.totalExpenses || 0).toFixed(2)}"`);
      csvSections.push(`"Wydatki - zapłacono (EUR)","${(statistics.totalExpensesPaid || 0).toFixed(2)}"`);
      csvSections.push(`"Wydatki - pozostało (EUR)","${(statistics.totalExpensesRemaining || 0).toFixed(2)}"`);
      csvSections.push('');
      csvSections.push(`"Cashflow netto okresu (EUR)","${(statistics.netCashflow || 0).toFixed(2)}"`);
      csvSections.push(`"Zysk netto okresu (EUR)","${(statistics.netProfit || 0).toFixed(2)}"`);
      csvSections.push(`"Marża okresu (%)","${statistics.profitMargin || 0}"`);
    }
    
    csvSections.push('');
    csvSections.push('');
  }
  
  // ========================================
  // SEKCJA 2: SZCZEGÓŁY ZAMÓWIEŃ Z TIMELINE
  // ========================================
  csvSections.push('SZCZEGÓŁY ZAMÓWIEŃ KLIENTÓW - TIMELINE PŁATNOŚCI');
  csvSections.push('');
  
  orders.forEach((order, orderIndex) => {
    // Nagłówek zamówienia
    csvSections.push(`"=== ZAMÓWIENIE ${orderIndex + 1}: ${order.orderNumber} ==="`);
    csvSections.push(`"Klient","${order.customer?.name || ''}"`);
    csvSections.push(`"Data zamówienia","${order.orderDate ? new Date(order.orderDate).toLocaleDateString('pl-PL') : ''}"`);
    csvSections.push(`"Wartość (EUR)","${order.orderValue.toFixed(2)}"`);
    csvSections.push(`"Status płatności","${getPaymentStatusLabel(order.paymentStatus)}"`);
    csvSections.push('');
    
    // Timeline płatności
    if (order.paymentTimeline && order.paymentTimeline.length > 0) {
      csvSections.push('Data,Typ,Dokument,Kwota (EUR),Status,Metoda,Opis');
      
      order.paymentTimeline.forEach(payment => {
        const row = [
          payment.date ? new Date(payment.date).toLocaleDateString('pl-PL') : '',
          payment.type === 'proforma' ? 'Proforma' : 'Faktura',
          payment.documentNumber || '',
          payment.amount.toFixed(2),
          payment.status === 'confirmed' ? 'Zapłacono' : 'Oczekiwane',
          payment.method || '',
          payment.description || ''
        ];
        csvSections.push(row.map(cell => `"${cell}"`).join(','));
      });
    }
    
    csvSections.push('');
    csvSections.push(`"Razem wpłacono (EUR)","${order.totalPaid.toFixed(2)}"`);
    csvSections.push(`"Pozostało do zapłaty (EUR)","${order.totalRemaining.toFixed(2)}"`);
    csvSections.push('');
    csvSections.push('');
  });
  
  // ========================================
  // SEKCJA 3: WYDATKI - PURCHASE ORDERS
  // ========================================
  if (globalExpenses && globalExpenses.expenseTimeline && globalExpenses.expenseTimeline.length > 0) {
    csvSections.push('WYDATKI - PURCHASE ORDERS W OKRESIE (SZCZEGÓŁOWO)');
    csvSections.push('');
    
    // Grupuj po PO
    const expensesByPO = {};
    globalExpenses.expenseTimeline.forEach(expense => {
      if (!expensesByPO[expense.poNumber]) {
        expensesByPO[expense.poNumber] = {
          poNumber: expense.poNumber,
          supplier: expense.supplier,
          isPaid: expense.isPaid,
          items: []
        };
      }
      expensesByPO[expense.poNumber].items.push(expense);
    });
    
    Object.values(expensesByPO).forEach((po, poIndex) => {
      csvSections.push(`"=== PO ${poIndex + 1}: ${po.poNumber} ==="`);
      csvSections.push(`"Dostawca","${po.supplier}"`);
      csvSections.push(`"Status płatności","${po.isPaid ? 'Zapłacone' : 'Niezapłacone'}"`);
      csvSections.push('');
      csvSections.push('Data Dostawy,Pozycja,Wartość (EUR),Przeterminowane');
      
      let poTotal = 0;
      po.items.forEach(item => {
        poTotal += item.amount;
        const row = [
          item.date ? new Date(item.date).toLocaleDateString('pl-PL') : '',
          item.itemName || 'Całe PO',
          item.amount.toFixed(2),
          item.isOverdue ? 'TAK' : 'NIE'
        ];
        csvSections.push(row.map(cell => `"${cell}"`).join(','));
      });
      
      csvSections.push('');
      csvSections.push(`"Razem PO (EUR)","${poTotal.toFixed(2)}"`);
      csvSections.push('');
      csvSections.push('');
    });
    
    // Podsumowanie wydatków
    csvSections.push('PODSUMOWANIE WYDATKÓW');
    csvSections.push('');
    csvSections.push(`"Liczba PO w okresie","${globalExpenses.totalPOCount || 0}"`);
    csvSections.push(`"Łączna wartość (EUR)","${(globalExpenses.totalExpenseValue || 0).toFixed(2)}"`);
    csvSections.push(`"Zapłacono (EUR)","${(globalExpenses.totalExpensePaid || 0).toFixed(2)}"`);
    csvSections.push(`"Pozostało do zapłaty (EUR)","${(globalExpenses.totalExpenseRemaining || 0).toFixed(2)}"`);
  }
  
  // Utwórz zawartość CSV
  const csvContent = csvSections.join('\n');
  
  // Pobierz plik
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename || `cashflow_detailed_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};

/**
 * Pomocnicza funkcja do tłumaczenia statusu płatności
 */
const getPaymentStatusLabel = (status) => {
  const labels = {
    paid: 'Opłacone',
    partially_paid: 'Częściowo opłacone',
    pending: 'Oczekujące',
    overdue: 'Przeterminowane',
    not_invoiced: 'Nie zafakturowane'
  };
  return labels[status] || status;
};

/**
 * Pobiera wszystkie Purchase Orders w zakresie dat (według dat dostaw)
 * @param {Date} dateFrom - Data początkowa
 * @param {Date} dateTo - Data końcowa
 * @returns {Promise<Array>} - Lista PO z datami dostaw w zakresie
 */
const getAllPurchaseOrdersInDateRange = async (dateFrom, dateTo) => {
  try {
    // Pobierz WSZYSTKIE Purchase Orders
    const poQuery = query(collection(db, 'purchaseOrders'));
    const poSnapshot = await getDocs(poQuery);
    
    const purchaseOrders = [];
    
    for (const docSnap of poSnapshot.docs) {
      const poData = docSnap.data();
      const po = {
        id: docSnap.id,
        ...poData
      };
      
      // Pomiń anulowane zamówienia zakupu
      if (po.status === 'cancelled') {
        continue;
      }
      
      // Sprawdź czy PO ma jakiekolwiek pozycje z datą dostawy w zakresie
      // lub ogólną datę dostawy w zakresie
      let hasDeliveryInRange = false;
      
      // Sprawdź ogólną datę dostawy PO
      if (po.expectedDeliveryDate) {
        const deliveryDate = safeParseDate(po.expectedDeliveryDate);
        if (deliveryDate) {
          const deliveryTimestamp = deliveryDate.getTime();
          const fromTimestamp = new Date(dateFrom).getTime();
          const toTimestamp = new Date(dateTo).getTime();
          
          if (deliveryTimestamp >= fromTimestamp && deliveryTimestamp <= toTimestamp) {
            hasDeliveryInRange = true;
          }
        }
      }
      
      // Sprawdź daty dostaw z pozycji
      if (po.items && Array.isArray(po.items)) {
        for (const item of po.items) {
          if (item.plannedDeliveryDate) {
            const deliveryDate = safeParseDate(item.plannedDeliveryDate);
            if (deliveryDate) {
              const deliveryTimestamp = deliveryDate.getTime();
              const fromTimestamp = new Date(dateFrom).getTime();
              const toTimestamp = new Date(dateTo).getTime();
              
              if (deliveryTimestamp >= fromTimestamp && deliveryTimestamp <= toTimestamp) {
                hasDeliveryInRange = true;
                break;
              }
            }
          }
        }
      }
      
      if (hasDeliveryInRange) {
        purchaseOrders.push(po);
      }
    }
    
    console.log(`📦 Znaleziono ${purchaseOrders.length} PO z datami dostaw w zakresie ${dateFrom?.toLocaleDateString()} - ${dateTo?.toLocaleDateString()}`);
    return purchaseOrders;
  } catch (error) {
    console.error('❌ Błąd podczas pobierania PO:', error);
    return [];
  }
};

/**
 * Generuje globalny timeline wydatków z WSZYSTKICH PO w zakresie dat
 * @param {Date} dateFrom - Data początkowa
 * @param {Date} dateTo - Data końcowa
 * @returns {Object} - Dane o wszystkich wydatkach w okresie
 */
export const generateGlobalExpenseTimeline = async (dateFrom, dateTo) => {
  try {
    const expenseTimeline = [];
    let totalExpenseValue = 0;
    let totalExpensePaid = 0;
    let totalExpenseRemaining = 0;

    // Pobierz wszystkie PO w zakresie dat
    const purchaseOrders = await getAllPurchaseOrdersInDateRange(dateFrom, dateTo);

    // Dla każdego PO
    for (const po of purchaseOrders) {
      const poValue = parseFloat(po.totalGross || po.totalValue || 0);
      totalExpenseValue += poValue;

      // Oblicz zapłacone/pozostałe na podstawie paymentStatus
      const paidAmount = parseFloat(po.paidAmount || 0);
      
      if (po.paymentStatus === 'paid') {
        totalExpensePaid += poValue;
      } else if (po.paymentStatus === 'partially_paid') {
        totalExpensePaid += paidAmount;
        totalExpenseRemaining += (poValue - paidAmount);
      } else {
        totalExpenseRemaining += poValue;
      }

      // Użyj dat dostawy z pozycji (bardziej szczegółowo)
      if (po.items && po.items.length > 0) {
        po.items.forEach((item, index) => {
          const itemValue = parseFloat(item.totalPrice || 0);
          
          // Priorytet: data z pozycji, potem ogólna data PO
          const deliveryDate = safeParseDate(item.plannedDeliveryDate || po.expectedDeliveryDate);
          
          // Dodaj tylko jeśli data jest w zakresie
          if (deliveryDate) {
            const deliveryTimestamp = deliveryDate.getTime();
            const fromTimestamp = dateFrom ? new Date(dateFrom).getTime() : 0;
            const toTimestamp = dateTo ? new Date(dateTo).getTime() : Infinity;
            
            if (deliveryTimestamp >= fromTimestamp && deliveryTimestamp <= toTimestamp) {
              expenseTimeline.push({
                date: deliveryDate,
                poNumber: po.number,
                poId: po.id,
                itemName: item.name,
                itemIndex: index,
                amount: itemValue,
                currency: po.currency || 'EUR',
                status: po.paymentStatus || 'unpaid',
                type: 'purchase_item',
                supplier: po.supplier?.name || 'Nieznany',
                isPaid: po.paymentStatus === 'paid',
                isOverdue: deliveryDate && deliveryDate < new Date() && po.paymentStatus !== 'paid'
              });
            }
          }
        });
      } else {
        // Użyj ogólnej daty PO (jeśli brak pozycji)
        const deliveryDate = safeParseDate(po.expectedDeliveryDate);
        
        if (deliveryDate) {
          const deliveryTimestamp = deliveryDate.getTime();
          const fromTimestamp = dateFrom ? new Date(dateFrom).getTime() : 0;
          const toTimestamp = dateTo ? new Date(dateTo).getTime() : Infinity;
          
          if (deliveryTimestamp >= fromTimestamp && deliveryTimestamp <= toTimestamp) {
            expenseTimeline.push({
              date: deliveryDate,
              poNumber: po.number,
              poId: po.id,
              itemName: null,
              amount: poValue,
              currency: po.currency || 'EUR',
              status: po.paymentStatus || 'unpaid',
              type: 'purchase_order',
              supplier: po.supplier?.name || 'Nieznany',
              isPaid: po.paymentStatus === 'paid',
              isOverdue: deliveryDate && deliveryDate < new Date() && po.paymentStatus !== 'paid'
            });
          }
        }
      }
    }

    // Sortuj chronologicznie
    expenseTimeline.sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : new Date();
      const dateB = b.date ? new Date(b.date) : new Date();
      return dateA - dateB;
    });

    return {
      expenseTimeline,
      totalExpenseValue,
      totalExpensePaid,
      totalExpenseRemaining,
      totalPOCount: purchaseOrders.length
    };
  } catch (error) {
    console.error('❌ Błąd podczas generowania globalnego timeline wydatków:', error);
    return {
      expenseTimeline: [],
      totalExpenseValue: 0,
      totalExpensePaid: 0,
      totalExpenseRemaining: 0,
      totalPOCount: 0
    };
  }
};

/**
 * Generuje timeline kosztów zakładu dla wykresu cashflow
 * Pobiera koszty zakładu z factoryCosts (automatycznie obliczane na podstawie produkcji)
 * @param {Date} dateFrom - Data początkowa
 * @param {Date} dateTo - Data końcowa
 * @returns {Promise<Object>} - Dane timeline kosztów zakładu
 */
export const generateFactoryCostsTimeline = async (dateFrom, dateTo) => {
  try {
    console.log(`🏭 [CASHFLOW] Pobieranie kosztów zakładu dla zakresu ${dateFrom?.toLocaleDateString()} - ${dateTo?.toLocaleDateString()}`);
    
    // Pobierz koszty zakładu nachodzące na zakres dat
    const factoryCosts = await getFactoryCostsByDateRange(dateFrom, dateTo);
    
    if (!factoryCosts || factoryCosts.length === 0) {
      console.log('🏭 [CASHFLOW] Brak kosztów zakładu w podanym zakresie');
      return {
        timeline: [],
        totalValue: 0,
        totalPaid: 0,
        totalRemaining: 0,
        costsCount: 0
      };
    }

    const timeline = [];
    let totalValue = 0;
    let totalPaid = 0;
    let totalRemaining = 0;

    factoryCosts.forEach(cost => {
      // Oblicz proporcjonalną kwotę dla zakresu dat
      const costStart = cost.startDate instanceof Date ? cost.startDate : new Date(cost.startDate);
      const costEnd = cost.endDate instanceof Date ? cost.endDate : new Date(cost.endDate);
      
      // Faktyczny okres nachodzenia na zakres analizy
      const overlapStart = new Date(Math.max(costStart.getTime(), dateFrom.getTime()));
      const overlapEnd = new Date(Math.min(costEnd.getTime(), dateTo.getTime()));
      
      // Czas nachodzenia w dniach
      const overlapDays = Math.max(0, (overlapEnd.getTime() - overlapStart.getTime()) / (1000 * 60 * 60 * 24));
      
      // Całkowity czas kosztu w dniach
      const totalCostDays = Math.max(1, (costEnd.getTime() - costStart.getTime()) / (1000 * 60 * 60 * 24));
      
      // Proporcjonalna kwota dla nachodzącego okresu
      const proportionalAmount = (cost.amount || 0) * (overlapDays / totalCostDays);
      
      // Użyj środka nachodzącego okresu jako daty dla timeline
      const midDate = new Date((overlapStart.getTime() + overlapEnd.getTime()) / 2);

      // Oblicz efektywne godziny proporcjonalnie
      const proportionalHours = (cost.effectiveHours || 0) * (overlapDays / totalCostDays);
      
      // Status płatności z bazy (domyślnie true dla starych rekordów)
      const isPaid = cost.isPaid !== undefined ? cost.isPaid : true;
      
      timeline.push({
        date: midDate,
        costId: cost.id,
        name: cost.description || `Koszt zakładu ${costStart.toLocaleDateString()} - ${costEnd.toLocaleDateString()}`,
        amount: Math.round(proportionalAmount * 100) / 100,
        originalAmount: cost.amount || 0,
        effectiveHours: Math.round(proportionalHours * 100) / 100,
        costPerMinute: cost.costPerMinute || 0,
        costPerHour: cost.costPerHour || 0,
        startDate: costStart,
        endDate: costEnd,
        overlapStart,
        overlapEnd,
        isPaid: isPaid, // Status płatności z bazy
        type: 'factory_cost'
      });

      totalValue += proportionalAmount;
      // Zlicz zapłacone lub oczekiwane
      if (isPaid) {
        totalPaid += proportionalAmount;
      } else {
        totalRemaining += proportionalAmount;
      }
    });

    // Sortuj chronologicznie
    timeline.sort((a, b) => new Date(a.date) - new Date(b.date));

    console.log(`🏭 [CASHFLOW] Znaleziono ${factoryCosts.length} kosztów zakładu:`);
    console.log(`🏭 [CASHFLOW]   - Wartość proporcjonalna: ${totalValue.toFixed(2)} EUR`);
    console.log(`🏭 [CASHFLOW]   - Zapłacone: ${totalPaid.toFixed(2)} EUR`);
    console.log(`🏭 [CASHFLOW]   - Oczekiwane: ${totalRemaining.toFixed(2)} EUR`);
    timeline.forEach(item => {
      console.log(`🏭 [CASHFLOW]   - ${item.name}: ${item.amount.toFixed(2)} EUR (isPaid: ${item.isPaid})`);
    });

    return {
      timeline,
      totalValue: Math.round(totalValue * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalRemaining: Math.round(totalRemaining * 100) / 100,
      costsCount: factoryCosts.length
    };
  } catch (error) {
    console.error('❌ Błąd podczas generowania timeline kosztów zakładu:', error);
    return {
      timeline: [],
      totalValue: 0,
      totalPaid: 0,
      totalRemaining: 0,
      costsCount: 0
    };
  }
};

/**
 * Rozszerza dane cashflow o GLOBALNE wydatki z wszystkich PO
 * @param {Object} filters - Filtry raportu (jak w generateCashflowReport)
 * @returns {Promise<Object>} - Dane cashflow z globalnymi wydatkami
 */
export const generateCashflowReportWithExpenses = async (filters = {}) => {
  try {
    console.log('🔄 Generowanie raportu cashflow z globalnymi wydatkami...', filters);
    
    // Pobierz podstawowe dane cashflow (przychody z CO)
    const cashflowData = await generateCashflowReport(filters);

    // Pobierz WSZYSTKIE wydatki w zakresie dat (niezależnie od CO)
    const globalExpenses = await generateGlobalExpenseTimeline(
      filters.dateFrom,
      filters.dateTo
    );

    // Pobierz koszty zakładu w zakresie dat (zastępuje koszty operacyjne)
    const factoryCosts = await generateFactoryCostsTimeline(
      filters.dateFrom,
      filters.dateTo
    );

    console.log(`✅ Wygenerowano raport cashflow: ${cashflowData.length} zamówień, ${globalExpenses.totalPOCount} PO z wydatkami, ${factoryCosts.costsCount} kosztów zakładu`);
    
    return {
      orders: cashflowData,
      globalExpenses,
      factoryCosts // Zastępuje operationalCosts
    };
  } catch (error) {
    console.error('❌ Błąd podczas generowania raportu cashflow z wydatkami:', error);
    throw error;
  }
};

/**
 * Przygotowuje dane dla wykresu cashflow z wydatkami (przychody vs wydatki)
 * @param {Object} cashflowDataWithExpenses - Obiekt z orders i globalExpenses
 * @returns {Array} - Dane dla wykresu
 */
export const prepareCashflowChartDataWithExpenses = (cashflowDataWithExpenses) => {
  if (!cashflowDataWithExpenses || !cashflowDataWithExpenses.orders) {
    return [];
  }
  
  const { orders, globalExpenses, factoryCosts } = cashflowDataWithExpenses;
  
  // Zbierz wszystkie płatności (przychody) i wydatki
  const allTransactions = [];
  
  // Przychody z zamówień
  orders.forEach(order => {
    order.paymentTimeline.forEach(payment => {
      const paymentDate = new Date(payment.date);
      
      allTransactions.push({
        date: paymentDate,
        type: 'revenue',
        amount: payment.amount,
        status: payment.status,
        orderNumber: order.orderNumber
      });
    });
  });
  
  // Wydatki z globalnego timeline (PO)
  if (globalExpenses && globalExpenses.expenseTimeline) {
    globalExpenses.expenseTimeline.forEach(expense => {
      const expenseDate = new Date(expense.date);
      
      allTransactions.push({
        date: expenseDate,
        type: 'expense',
        subType: 'po',
        amount: expense.amount,
        status: expense.isPaid ? 'confirmed' : 'expected',
        poNumber: expense.poNumber
      });
    });
  }
  
  // Koszty zakładu (zastępują koszty operacyjne)
  if (factoryCosts && factoryCosts.timeline) {
    factoryCosts.timeline.forEach(cost => {
      const costDate = new Date(cost.date);
      
      allTransactions.push({
        date: costDate,
        type: 'expense',
        subType: 'factory', // Zmienione z 'operational' na 'factory'
        amount: cost.amount,
        status: cost.isPaid ? 'confirmed' : 'expected',
        name: cost.name
      });
    });
  }
  
  // Sortuj po dacie
  allTransactions.sort((a, b) => a.date - b.date);
  
  // Oblicz skumulowane wartości
  let cumulativeRevenuePaid = 0;
  let cumulativeRevenueExpected = 0;
  let cumulativeExpensePaid = 0;
  let cumulativeExpenseExpected = 0;
  let cumulativeFactoryCostPaid = 0;
  let cumulativeFactoryCostExpected = 0;
  
  const dateMap = new Map();
  
  allTransactions.forEach(transaction => {
    const dateKey = transaction.date.toISOString().split('T')[0];
    
    if (transaction.type === 'revenue') {
      if (transaction.status === 'confirmed') {
        cumulativeRevenuePaid += transaction.amount;
      } else {
        cumulativeRevenueExpected += transaction.amount;
      }
    } else if (transaction.type === 'expense') {
      if (transaction.subType === 'factory') {
        // Koszty zakładu
        if (transaction.status === 'confirmed') {
          cumulativeFactoryCostPaid += transaction.amount;
        } else {
          cumulativeFactoryCostExpected += transaction.amount;
        }
      } else {
        // Wydatki PO
        if (transaction.status === 'confirmed') {
          cumulativeExpensePaid += transaction.amount;
        } else {
          cumulativeExpenseExpected += transaction.amount;
        }
      }
    }
    
    // Łączne wydatki = PO + koszty zakładu
    const totalExpensePaid = cumulativeExpensePaid + cumulativeFactoryCostPaid;
    const totalExpenseExpected = cumulativeExpenseExpected + cumulativeFactoryCostExpected;
    
    // Utwórz lub zaktualizuj wpis dla daty
    if (!dateMap.has(dateKey)) {
      dateMap.set(dateKey, {
        date: dateKey,
        cumulativeRevenuePaid,
        cumulativeRevenueTotal: cumulativeRevenuePaid + cumulativeRevenueExpected,
        cumulativeExpensePaid: totalExpensePaid,
        cumulativeExpenseTotal: totalExpensePaid + totalExpenseExpected,
        cumulativeFactoryCostPaid,
        cumulativeFactoryCostTotal: cumulativeFactoryCostPaid + cumulativeFactoryCostExpected,
        // Aliasy dla kompatybilności z wykresem (operational -> factory)
        cumulativeOperationalPaid: cumulativeFactoryCostPaid,
        cumulativeOperationalTotal: cumulativeFactoryCostPaid + cumulativeFactoryCostExpected,
        netPaid: cumulativeRevenuePaid - totalExpensePaid,
        netTotal: (cumulativeRevenuePaid + cumulativeRevenueExpected) - (totalExpensePaid + totalExpenseExpected),
        dailyRevenue: 0,
        dailyExpense: 0,
        dailyFactoryCost: 0,
        dailyOperational: 0 // Alias
      });
    }
    
    const dayData = dateMap.get(dateKey);
    dayData.cumulativeRevenuePaid = cumulativeRevenuePaid;
    dayData.cumulativeRevenueTotal = cumulativeRevenuePaid + cumulativeRevenueExpected;
    dayData.cumulativeExpensePaid = totalExpensePaid;
    dayData.cumulativeExpenseTotal = totalExpensePaid + totalExpenseExpected;
    dayData.cumulativeFactoryCostPaid = cumulativeFactoryCostPaid;
    dayData.cumulativeFactoryCostTotal = cumulativeFactoryCostPaid + cumulativeFactoryCostExpected;
    // Aliasy dla kompatybilności z wykresem
    dayData.cumulativeOperationalPaid = cumulativeFactoryCostPaid;
    dayData.cumulativeOperationalTotal = cumulativeFactoryCostPaid + cumulativeFactoryCostExpected;
    dayData.netPaid = cumulativeRevenuePaid - totalExpensePaid;
    dayData.netTotal = (cumulativeRevenuePaid + cumulativeRevenueExpected) - (totalExpensePaid + totalExpenseExpected);
    
    // Zlicz dzienny przychód/wydatek
    if (transaction.type === 'revenue' && transaction.status === 'confirmed') {
      dayData.dailyRevenue += transaction.amount;
    } else if (transaction.type === 'expense') {
      if (transaction.subType === 'factory' && transaction.status === 'confirmed') {
        dayData.dailyFactoryCost += transaction.amount;
        dayData.dailyOperational += transaction.amount; // Alias
      } else if (transaction.status === 'confirmed') {
        dayData.dailyExpense += transaction.amount;
      }
    }
  });
  
  // Konwertuj mapę na tablicę i sortuj
  return Array.from(dateMap.values()).sort((a, b) => 
    new Date(a.date) - new Date(b.date)
  );
};

/**
 * Rozszerzone statystyki cashflow z globalnymi wydatkami i kosztami zakładu
 */
export const calculateCashflowStatisticsWithExpenses = (cashflowDataWithExpenses) => {
  if (!cashflowDataWithExpenses || !cashflowDataWithExpenses.orders) {
    return {
      totalOrders: 0,
      totalOrderValue: 0,
      totalPaid: 0,
      totalRemaining: 0,
      totalExpenses: 0,
      totalExpensesPaid: 0,
      totalExpensesRemaining: 0,
      totalFactoryCosts: 0,
      totalFactoryCostsPaid: 0,
      totalFactoryCostsRemaining: 0,
      totalAllExpenses: 0,
      totalAllExpensesPaid: 0,
      netProfit: 0,
      netCashflow: 0,
      totalPOCount: 0,
      factoryCostsCount: 0,
      profitMargin: 0
    };
  }
  
  const { orders, globalExpenses, factoryCosts } = cashflowDataWithExpenses;
  const baseStats = calculateCashflowStatistics(orders);
  
  // Wydatki z PO
  const totalExpenses = globalExpenses?.totalExpenseValue || 0;
  const totalExpensesPaid = globalExpenses?.totalExpensePaid || 0;
  const totalExpensesRemaining = globalExpenses?.totalExpenseRemaining || 0;
  
  // Koszty zakładu (zastępują koszty operacyjne)
  const totalFactoryCosts = factoryCosts?.totalValue || 0;
  const totalFactoryCostsPaid = factoryCosts?.totalPaid || 0;
  const totalFactoryCostsRemaining = factoryCosts?.totalRemaining || 0;
  
  // Łączne wszystkie wydatki (PO + koszty zakładu)
  const totalAllExpenses = totalExpenses + totalFactoryCosts;
  const totalAllExpensesPaid = totalExpensesPaid + totalFactoryCostsPaid;
  
  // Zysk netto okresu = suma przychodów - suma wszystkich wydatków
  const netProfit = baseStats.totalOrderValue - totalAllExpenses;
  const netCashflow = baseStats.totalPaid - totalAllExpensesPaid;
  
  return {
    ...baseStats,
    // Wydatki PO
    totalExpenses,
    totalExpensesPaid,
    totalExpensesRemaining,
    // Koszty zakładu (zastępują totalOperationalCosts dla kompatybilności wstecznej)
    totalFactoryCosts,
    totalFactoryCostsPaid,
    totalFactoryCostsRemaining,
    // Aliasy dla kompatybilności wstecznej z UI
    totalOperationalCosts: totalFactoryCosts,
    totalOperationalCostsPaid: totalFactoryCostsPaid,
    totalOperationalCostsRemaining: totalFactoryCostsRemaining,
    // Łączne wydatki
    totalAllExpenses,
    totalAllExpensesPaid,
    // Bilans
    netProfit,
    netCashflow,
    totalPOCount: globalExpenses?.totalPOCount || 0,
    factoryCostsCount: factoryCosts?.costsCount || 0,
    profitMargin: baseStats.totalOrderValue > 0 
      ? ((netProfit / baseStats.totalOrderValue) * 100).toFixed(2)
      : 0
  };
};

/**
 * Eksportuje zestawienie przychodów i kosztów do CSV
 * 
 * Format eksportu:
 * - SEKCJA 1: Podsumowanie okresu (statystyki ogólne)
 * - SEKCJA 2: Przychody (zamówienia klientów w okresie)
 * - SEKCJA 3: Koszty (zamówienia zakupu w okresie)
 * - SEKCJA 4: Zestawienie (łączne przychody vs koszty)
 * 
 * @param {Object} cashflowDataWithExpenses - Obiekt z {orders, globalExpenses}
 * @param {Object} statistics - Statystyki
 * @param {Object} filters - Filtry (zawiera dateFrom, dateTo)
 * @param {string} filename - Nazwa pliku
 */
export const exportCashflowRevenueAndCostsToCSV = (
  cashflowDataWithExpenses,
  statistics = null,
  filters = {},
  filename = null
) => {
  let orders = [];
  let globalExpenses = null;

  if (Array.isArray(cashflowDataWithExpenses)) {
    orders = cashflowDataWithExpenses;
  } else if (cashflowDataWithExpenses && typeof cashflowDataWithExpenses === 'object') {
    orders = cashflowDataWithExpenses.orders || [];
    globalExpenses = cashflowDataWithExpenses.globalExpenses || null;
  }

  if (!orders || orders.length === 0) {
    throw new Error('Brak danych do eksportu');
  }

  const csvSections = [];

  // ========================================
  // NAGŁÓWEK
  // ========================================
  csvSections.push('ZESTAWIENIE PRZYCHODÓW I KOSZTÓW');
  csvSections.push(`"Okres","${filters.dateFrom?.toLocaleDateString('pl-PL') || ''} - ${filters.dateTo?.toLocaleDateString('pl-PL') || ''}"`);
  csvSections.push(`"Data wygenerowania","${new Date().toLocaleString('pl-PL')}"`);
  csvSections.push('');
  csvSections.push('');

  // ========================================
  // SEKCJA 1: PODSUMOWANIE OKRESU
  // ========================================
  if (statistics) {
    csvSections.push('=== PODSUMOWANIE OKRESU ===');
    csvSections.push('');
    csvSections.push('Kategoria,Wartość (EUR)');
    csvSections.push(`"PRZYCHODY - Wartość zamówień","${(statistics.totalOrderValue || 0).toFixed(2)}"`);
    csvSections.push(`"PRZYCHODY - Wpłacono","${(statistics.totalPaid || 0).toFixed(2)}"`);
    csvSections.push(`"PRZYCHODY - Oczekiwane","${(statistics.totalRemaining || 0).toFixed(2)}"`);
    csvSections.push('');
    csvSections.push(`"KOSZTY - Wartość zamówień zakupu","${(statistics.totalExpenses || 0).toFixed(2)}"`);
    csvSections.push(`"KOSZTY - Zapłacono","${(statistics.totalExpensesPaid || 0).toFixed(2)}"`);
    csvSections.push(`"KOSZTY - Pozostało","${(statistics.totalExpensesRemaining || 0).toFixed(2)}"`);
    csvSections.push('');
    csvSections.push(`"BILANS - Cashflow netto (wpłacono - zapłacono)","${(statistics.netCashflow || 0).toFixed(2)}"`);
    csvSections.push(`"BILANS - Zysk netto (przychody - koszty)","${(statistics.netProfit || 0).toFixed(2)}"`);
    csvSections.push(`"BILANS - Marża (%)","${statistics.profitMargin || 0}"`);
    csvSections.push('');
    csvSections.push('');
  }

  // ========================================
  // SEKCJA 2: PRZYCHODY - ZAMÓWIENIA KLIENTÓW
  // ========================================
  csvSections.push('=== PRZYCHODY - ZAMÓWIENIA KLIENTÓW ===');
  csvSections.push('');
  csvSections.push('Data,Nr Zamówienia,Klient,Wartość (EUR),Wpłacono (EUR),Do zapłaty (EUR),Status');

  let totalRevenueValue = 0;
  let totalRevenuePaid = 0;
  let totalRevenueRemaining = 0;

  // Grupuj przychody po datach
  const revenueByDate = new Map();
  
  orders.forEach(order => {
    const orderDate = order.orderDate ? new Date(order.orderDate) : null;
    const dateKey = orderDate ? orderDate.toISOString().split('T')[0] : 'Brak daty';
    
    if (!revenueByDate.has(dateKey)) {
      revenueByDate.set(dateKey, []);
    }
    
    revenueByDate.get(dateKey).push({
      date: orderDate,
      orderNumber: order.orderNumber,
      customer: order.customer?.name || 'Nieznany',
      value: order.orderValue,
      paid: order.totalPaid,
      remaining: order.totalRemaining,
      status: getPaymentStatusLabel(order.paymentStatus)
    });
    
    totalRevenueValue += order.orderValue;
    totalRevenuePaid += order.totalPaid;
    totalRevenueRemaining += order.totalRemaining;
  });

  // Sortuj po datach i wypisz
  const sortedRevenues = Array.from(revenueByDate.entries())
    .sort((a, b) => new Date(a[0]) - new Date(b[0]));

  sortedRevenues.forEach(([dateKey, items]) => {
    items.forEach(item => {
      const row = [
        item.date ? item.date.toLocaleDateString('pl-PL') : 'Brak daty',
        item.orderNumber,
        item.customer,
        item.value.toFixed(2),
        item.paid.toFixed(2),
        item.remaining.toFixed(2),
        item.status
      ];
      csvSections.push(row.map(cell => `"${cell}"`).join(','));
    });
  });

  csvSections.push('');
  csvSections.push(`"SUMA PRZYCHODÓW","","","${totalRevenueValue.toFixed(2)}","${totalRevenuePaid.toFixed(2)}","${totalRevenueRemaining.toFixed(2)}",""`);
  csvSections.push('');
  csvSections.push('');

  // ========================================
  // SEKCJA 3: KOSZTY - ZAMÓWIENIA ZAKUPU
  // ========================================
  if (globalExpenses && globalExpenses.expenseTimeline && globalExpenses.expenseTimeline.length > 0) {
    csvSections.push('=== KOSZTY - ZAMÓWIENIA ZAKUPU ===');
    csvSections.push('');
    csvSections.push('Data Dostawy,Nr PO,Dostawca,Pozycja,Wartość (EUR),Status,Przeterminowane');

    let totalExpenseValue = 0;

    // Grupuj wydatki po datach
    const expensesByDate = new Map();
    
    globalExpenses.expenseTimeline.forEach(expense => {
      const expenseDate = expense.date ? new Date(expense.date) : null;
      const dateKey = expenseDate ? expenseDate.toISOString().split('T')[0] : 'Brak daty';
      
      if (!expensesByDate.has(dateKey)) {
        expensesByDate.set(dateKey, []);
      }
      
      expensesByDate.get(dateKey).push({
        date: expenseDate,
        poNumber: expense.poNumber || '',
        supplier: expense.supplier || 'Nieznany',
        itemName: expense.itemName || 'Całe PO',
        amount: expense.amount,
        isPaid: expense.isPaid ? 'Zapłacone' : 'Niezapłacone',
        isOverdue: expense.isOverdue ? 'TAK' : 'NIE'
      });
      
      totalExpenseValue += expense.amount;
    });

    // Sortuj po datach i wypisz
    const sortedExpenses = Array.from(expensesByDate.entries())
      .sort((a, b) => new Date(a[0]) - new Date(b[0]));

    sortedExpenses.forEach(([dateKey, items]) => {
      items.forEach(item => {
        const row = [
          item.date ? item.date.toLocaleDateString('pl-PL') : 'Brak daty',
          item.poNumber,
          item.supplier,
          item.itemName,
          item.amount.toFixed(2),
          item.isPaid,
          item.isOverdue
        ];
        csvSections.push(row.map(cell => `"${cell}"`).join(','));
      });
    });

    csvSections.push('');
    csvSections.push(`"SUMA KOSZTÓW","","","","${totalExpenseValue.toFixed(2)}","",""`);
    csvSections.push('');
    csvSections.push('');
  }

  // ========================================
  // SEKCJA 4: ZESTAWIENIE KOŃCOWE
  // ========================================
  csvSections.push('=== ZESTAWIENIE KOŃCOWE ===');
  csvSections.push('');
  csvSections.push('Kategoria,Wartość (EUR)');
  csvSections.push(`"Przychody - Wartość zamówień","${totalRevenueValue.toFixed(2)}"`);
  csvSections.push(`"Przychody - Wpłacono","${totalRevenuePaid.toFixed(2)}"`);
  csvSections.push('');
  
  if (globalExpenses) {
    csvSections.push(`"Koszty - Wartość zamówień zakupu","${(globalExpenses.totalExpenseValue || 0).toFixed(2)}"`);
    csvSections.push(`"Koszty - Zapłacono","${(globalExpenses.totalExpensePaid || 0).toFixed(2)}"`);
    csvSections.push('');
    csvSections.push(`"WYNIK - Różnica (przychody - koszty)","${(totalRevenueValue - (globalExpenses.totalExpenseValue || 0)).toFixed(2)}"`);
    csvSections.push(`"CASHFLOW - Różnica (wpłacono - zapłacono)","${(totalRevenuePaid - (globalExpenses.totalExpensePaid || 0)).toFixed(2)}"`);
  }

  // Utwórz zawartość CSV
  const csvContent = csvSections.join('\n');

  // Pobierz plik
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename || `przychody_koszty_${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
};