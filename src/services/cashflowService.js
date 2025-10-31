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
        issueDate: doc.data().issueDate?.toDate(),
        dueDate: doc.data().dueDate?.toDate(),
        paymentDate: doc.data().paymentDate?.toDate()
      }));
      
      console.log(`📄 Znaleziono ${invoicesInRange.length} faktur/proform w zakresie dat`);
    } else {
      // Pobierz wszystkie faktury
      const invoicesSnapshot = await getDocs(invoicesRef);
      invoicesInRange = invoicesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        issueDate: doc.data().issueDate?.toDate(),
        dueDate: doc.data().dueDate?.toDate(),
        paymentDate: doc.data().paymentDate?.toDate()
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
          orderDate: doc.data().orderDate?.toDate(),
          createdAt: doc.data().createdAt?.toDate()
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
                  date: payment.date?.toDate ? payment.date.toDate() : payment.date,
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
              const dueDate = proforma.dueDate?.toDate ? proforma.dueDate.toDate() : proforma.dueDate;
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
                  date: payment.date?.toDate ? payment.date.toDate() : payment.date,
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
              const dueDate = invoice.dueDate?.toDate ? invoice.dueDate.toDate() : invoice.dueDate;
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
          
          const orderValue = parseFloat(order.total || order.totalGross || 0);
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
 * Eksportuje dane cashflow do CSV
 * @param {Array} cashflowData - Dane cashflow
 * @param {Function} t - Funkcja tłumaczenia
 */
export const exportCashflowToCSV = (cashflowData, t) => {
  if (!cashflowData || cashflowData.length === 0) {
    throw new Error(t ? t('cashflow.export.noData') : 'Brak danych do eksportu');
  }
  
  // Przygotuj nagłówki
  const headers = [
    'Nr Zamówienia',
    'Data Zamówienia',
    'Klient',
    'Wartość Zamówienia',
    'Proformy (ilość)',
    'Proformy (wartość)',
    'Proformy (wpłacono)',
    'Faktury (ilość)',
    'Faktury (wartość)',
    'Wpłacono',
    'Do Zapłaty',
    'Status Płatności',
    'Pierwsza Płatność',
    'Ostatnia Płatność',
    'Następna Płatność',
    'Waluta'
  ];
  
  // Przygotuj wiersze
  const rows = cashflowData.map(item => [
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
    item.nextPaymentDate ? new Date(item.nextPaymentDate).toLocaleDateString('pl-PL') : '',
    item.currency
  ]);
  
  // Utwórz zawartość CSV
  const csvContent = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
  ].join('\n');
  
  // Pobierz plik
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const filename = `cashflow_report_${new Date().toISOString().split('T')[0]}.csv`;
  link.download = filename;
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
