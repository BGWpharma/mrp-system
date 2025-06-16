import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  getDoc, 
  getDocs, 
  deleteDoc, 
  query, 
  where,
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase/config';
import { formatDateForInput } from '../utils/dateUtils';

const INVOICES_COLLECTION = 'invoices';
const INVOICE_ITEMS_COLLECTION = 'invoiceItems';

/**
 * Pobiera wszystkie faktury
 * Możliwość filtrowania po statusie, kliencie, dacie
 */
export const getAllInvoices = async (filters = null) => {
  try {
    let invoicesQuery;
    
    if (filters) {
      const conditions = [];
      
      if (filters.status && filters.status !== 'all') {
        conditions.push(where('status', '==', filters.status));
      }
      
      if (filters.customerId) {
        conditions.push(where('customer.id', '==', filters.customerId));
      }
      
      if (filters.fromDate) {
        const fromTimestamp = Timestamp.fromDate(new Date(filters.fromDate));
        conditions.push(where('issueDate', '>=', fromTimestamp));
      }
      
      if (filters.toDate) {
        const toTimestamp = Timestamp.fromDate(new Date(filters.toDate));
        conditions.push(where('issueDate', '<=', toTimestamp));
      }
      
      if (conditions.length > 0) {
        invoicesQuery = query(
          collection(db, INVOICES_COLLECTION),
          ...conditions,
          orderBy('issueDate', 'desc')
        );
      } else {
        invoicesQuery = query(
          collection(db, INVOICES_COLLECTION),
          orderBy('issueDate', 'desc')
        );
      }
    } else {
      invoicesQuery = query(
        collection(db, INVOICES_COLLECTION),
        orderBy('issueDate', 'desc')
      );
    }
    
    const querySnapshot = await getDocs(invoicesQuery);
    
    const invoices = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      invoices.push({
        id: doc.id,
        ...data,
        issueDate: data.issueDate?.toDate(),
        dueDate: data.dueDate?.toDate(),
        paymentDate: data.paymentDate?.toDate(),
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate()
      });
    });
    
    return invoices;
  } catch (error) {
    console.error('Błąd podczas pobierania faktur:', error);
    throw error;
  }
};

/**
 * Pobiera fakturę po ID
 */
export const getInvoiceById = async (invoiceId) => {
  try {
    const invoiceDoc = await getDoc(doc(db, INVOICES_COLLECTION, invoiceId));
    
    if (!invoiceDoc.exists()) {
      throw new Error('Faktura nie została znaleziona');
    }
    
    const data = invoiceDoc.data();
    return {
      id: invoiceDoc.id,
      ...data,
      issueDate: data.issueDate?.toDate(),
      dueDate: data.dueDate?.toDate(),
      paymentDate: data.paymentDate?.toDate(),
      createdAt: data.createdAt?.toDate(),
      updatedAt: data.updatedAt?.toDate()
    };
  } catch (error) {
    console.error('Błąd podczas pobierania faktury:', error);
    throw error;
  }
};

/**
 * Pobiera faktury dla określonego klienta
 */
export const getInvoicesByCustomerId = async (customerId) => {
  try {
    // Zapytanie bez sortowania, które wymaga złożonego indeksu
    const invoicesQuery = query(
      collection(db, INVOICES_COLLECTION),
      where('customer.id', '==', customerId)
    );
    
    const querySnapshot = await getDocs(invoicesQuery);
    
    const invoices = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      invoices.push({
        id: doc.id,
        ...data,
        issueDate: data.issueDate && typeof data.issueDate.toDate === 'function' ? data.issueDate.toDate() : data.issueDate,
        dueDate: data.dueDate && typeof data.dueDate.toDate === 'function' ? data.dueDate.toDate() : data.dueDate,
        paymentDate: data.paymentDate && typeof data.paymentDate.toDate === 'function' ? data.paymentDate.toDate() : data.paymentDate,
        createdAt: data.createdAt && typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt && typeof data.updatedAt.toDate === 'function' ? data.updatedAt.toDate() : data.updatedAt
      });
    });
    
    // Sortowanie po stronie klienta (od najnowszych do najstarszych)
    invoices.sort((a, b) => {
      const dateA = a.issueDate instanceof Date ? a.issueDate : new Date(a.issueDate || 0);
      const dateB = b.issueDate instanceof Date ? b.issueDate : new Date(b.issueDate || 0);
      return dateB - dateA;
    });
    
    return invoices;
  } catch (error) {
    console.error('Błąd podczas pobierania faktur klienta:', error);
    throw error;
  }
};

/**
 * Pobiera faktury powiązane z określonym zamówieniem
 */
export const getInvoicesByOrderId = async (orderId) => {
  try {
    const invoicesQuery = query(
      collection(db, INVOICES_COLLECTION),
      where('orderId', '==', orderId)
    );
    
    const querySnapshot = await getDocs(invoicesQuery);
    
    const invoices = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      invoices.push({
        id: doc.id,
        ...data,
        issueDate: data.issueDate && typeof data.issueDate.toDate === 'function' ? data.issueDate.toDate() : data.issueDate,
        dueDate: data.dueDate && typeof data.dueDate.toDate === 'function' ? data.dueDate.toDate() : data.dueDate,
        paymentDate: data.paymentDate && typeof data.paymentDate.toDate === 'function' ? data.paymentDate.toDate() : data.paymentDate,
        createdAt: data.createdAt && typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt && typeof data.updatedAt.toDate === 'function' ? data.updatedAt.toDate() : data.updatedAt
      });
    });
    
    // Sortowanie po dacie wystawienia (od najnowszych do najstarszych)
    invoices.sort((a, b) => {
      const dateA = a.issueDate instanceof Date ? a.issueDate : new Date(a.issueDate || 0);
      const dateB = b.issueDate instanceof Date ? b.issueDate : new Date(b.issueDate || 0);
      return dateB - dateA;
    });
    
    return invoices;
  } catch (error) {
    console.error('Błąd podczas pobierania faktur dla zamówienia:', error);
    throw error;
  }
};

/**
 * Tworzy nową fakturę
 */
export const createInvoice = async (invoiceData, userId) => {
  try {
    // Walidacja danych faktury
    validateInvoiceData(invoiceData);
    
    // Generowanie numeru faktury, jeśli nie został podany
    if (!invoiceData.number) {
      invoiceData.number = await generateInvoiceNumber(invoiceData.isProforma);
    }
    
    // Upewnij się, że mamy właściwe dane o zaliczkach/przedpłatach
    const linkedPurchaseOrders = invoiceData.linkedPurchaseOrders || [];
    const settledAdvancePayments = parseFloat(invoiceData.settledAdvancePayments || 0);
    
    const newInvoice = {
      ...invoiceData,
      linkedPurchaseOrders: linkedPurchaseOrders,
      settledAdvancePayments: settledAdvancePayments,
      createdBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      // Konwersja dat na Timestamp
      issueDate: Timestamp.fromDate(new Date(invoiceData.issueDate)),
      dueDate: Timestamp.fromDate(new Date(invoiceData.dueDate)),
      // Jeśli faktura ma status opłaconej, dodaj datę płatności
      paymentDate: invoiceData.status === 'paid' ? 
        Timestamp.fromDate(new Date()) : null
    };
    
    const docRef = await addDoc(collection(db, INVOICES_COLLECTION), newInvoice);
    const newInvoiceId = docRef.id;
    
    // Jeśli faktura wykorzystuje proformę jako zaliczkę, zaktualizuj proformę
    if (!invoiceData.isProforma && settledAdvancePayments > 0 && invoiceData.orderId) {
      try {
        // Znajdź proformę dla tego zamówienia
        const relatedInvoices = await getInvoicesByOrderId(invoiceData.orderId);
        const proforma = relatedInvoices.find(inv => inv.isProforma && inv.id !== newInvoiceId);
        
        if (proforma) {
          await updateProformaUsage(proforma.id, settledAdvancePayments, newInvoiceId, userId);
        }
      } catch (proformaError) {
        console.warn('Błąd podczas aktualizacji wykorzystania proformy:', proformaError);
        // Nie przerywamy procesu tworzenia faktury z powodu błędu proformy
      }
    }
    
    return newInvoiceId;
  } catch (error) {
    console.error('Błąd podczas tworzenia faktury:', error);
    throw error;
  }
};

/**
 * Tworzy fakturę na podstawie zamówienia
 */
export const createInvoiceFromOrder = async (orderId, invoiceData, userId) => {
  try {
    // Pobierz dane zamówienia
    const orderDoc = await getDoc(doc(db, 'orders', orderId));
    if (!orderDoc.exists()) {
      throw new Error('Zamówienie nie zostało znalezione');
    }
    
    const orderData = orderDoc.data();
    const isCustomerOrder = orderData.type !== 'purchase';
    
    // Przygotuj podstawowe dane faktury na podstawie zamówienia
    const basicInvoiceData = {
      orderId: orderId,
      orderNumber: orderData.orderNumber,
      currency: orderData.currency || 'EUR',
      status: 'draft',
      paymentMethod: orderData.paymentMethod || 'Przelew',
      paymentStatus: 'unpaid',
      notes: invoiceData.notes || '',
      originalOrderType: orderData.type || 'customer',
    };
    
    // Dodatkowe dane zależnie od typu zamówienia
    if (isCustomerOrder) {
      // Zwykłe zamówienie klienta
      basicInvoiceData.customer = orderData.customer;
      basicInvoiceData.items = orderData.items;
      basicInvoiceData.shippingAddress = orderData.shippingAddress || orderData.customer.address;
      basicInvoiceData.billingAddress = orderData.customer.billingAddress || orderData.customer.address;
      
      // Oblicz wartość zamówienia klienta
      const orderTotal = orderData.total || calculateOrderTotal(orderData);
      basicInvoiceData.total = orderTotal;
    } else {
      // Zamówienie zakupowe (PO)
      // Znajdujemy dostawcę i traktujemy go jako "klienta" faktury
      basicInvoiceData.customer = {
        id: orderData.supplierId || '',
        name: orderData.supplier?.name || '',
        email: orderData.supplier?.email || '',
        phone: orderData.supplier?.phone || '',
        address: orderData.supplier?.address || '',
        vatEu: orderData.supplier?.vatEu || ''
      };
      
      // Zamówienia zakupowe mają format items zgodny z fakturami
      basicInvoiceData.items = orderData.items || [];
      
      // Dane adresowe
      basicInvoiceData.shippingAddress = orderData.deliveryAddress || '';
      basicInvoiceData.billingAddress = orderData.supplier?.address || '';
      
      // Oblicz wartość zamówienia zakupowego
      const poTotal = orderData.totalGross || orderData.totalValue || calculatePurchaseOrderTotal(orderData);
      basicInvoiceData.total = poTotal;
      
      // Dodatkowe informacje specyficzne dla zamówień zakupowych
      basicInvoiceData.additionalCosts = orderData.additionalCosts || 0;
      basicInvoiceData.additionalCostsItems = orderData.additionalCostsItems || [];
      basicInvoiceData.invoiceType = 'purchase';
    }
    
    // Połącz podstawowe dane z dodatkowymi danymi faktury
    const mergedInvoiceData = {
      ...basicInvoiceData,
      ...invoiceData
    };
    
    // Stwórz fakturę
    return await createInvoice(mergedInvoiceData, userId);
  } catch (error) {
    console.error('Błąd podczas tworzenia faktury z zamówienia:', error);
    throw error;
  }
};

/**
 * Oblicza całkowitą wartość zamówienia klienta
 */
const calculateOrderTotal = (orderData) => {
  // Wartość produktów
  const itemsTotal = Array.isArray(orderData.items) 
    ? orderData.items.reduce((sum, item) => sum + ((parseFloat(item.price) || 0) * (parseInt(item.quantity) || 0)), 0)
    : 0;
  
  // Wartość wysyłki
  const shippingCost = parseFloat(orderData.shippingCost) || 0;
  
  // Wartość z powiązanych zamówień zakupowych - nie dodajemy do sumy, odejmujemy
  const purchaseOrdersTotal = Array.isArray(orderData.linkedPurchaseOrders)
    ? orderData.linkedPurchaseOrders.reduce((sum, po) => sum + (parseFloat(po.totalGross) || 0), 0)
    : 0;
  
  // Zwracamy tylko sumę wartości produktów i kosztów wysyłki, bez dodawania kosztów PO
  return itemsTotal + shippingCost;
};

/**
 * Oblicza całkowitą wartość zamówienia zakupowego
 */
const calculatePurchaseOrderTotal = (orderData) => {
  // Wartość produktów
  const itemsTotal = Array.isArray(orderData.items) 
    ? orderData.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
    : 0;
  
  // Obliczanie VAT
  const vatRate = parseFloat(orderData.vatRate) || 0;
  const vatValue = (itemsTotal * vatRate) / 100;
  
  // Dodatkowe koszty
  const additionalCosts = Array.isArray(orderData.additionalCostsItems)
    ? orderData.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
    : (parseFloat(orderData.additionalCosts) || 0);
  
  return itemsTotal + vatValue + additionalCosts;
};

/**
 * Aktualizuje dane faktury
 */
export const updateInvoice = async (invoiceId, invoiceData, userId) => {
  try {
    // Pobierz poprzednią wersję faktury dla porównania
    const oldInvoiceDoc = await getDoc(doc(db, INVOICES_COLLECTION, invoiceId));
    const oldInvoiceData = oldInvoiceDoc.exists() ? oldInvoiceDoc.data() : null;
    const oldSettledAdvancePayments = parseFloat(oldInvoiceData?.settledAdvancePayments || 0);
    
    // Walidacja danych faktury
    validateInvoiceData(invoiceData);
    
    // Upewnij się, że mamy właściwe dane o zaliczkach/przedpłatach
    const linkedPurchaseOrders = invoiceData.linkedPurchaseOrders || [];
    const settledAdvancePayments = parseFloat(invoiceData.settledAdvancePayments || 0);
    
    const updatedInvoice = {
      ...invoiceData,
      linkedPurchaseOrders: linkedPurchaseOrders,
      settledAdvancePayments: settledAdvancePayments,
      updatedBy: userId,
      updatedAt: serverTimestamp(),
      // Konwersja dat na Timestamp
      issueDate: Timestamp.fromDate(new Date(invoiceData.issueDate)),
      dueDate: Timestamp.fromDate(new Date(invoiceData.dueDate)),
      paymentDate: invoiceData.paymentDate ? 
        Timestamp.fromDate(new Date(invoiceData.paymentDate)) : null
    };
    
    await updateDoc(doc(db, INVOICES_COLLECTION, invoiceId), updatedInvoice);
    
    // Jeśli zmieniono wykorzystanie proformy, zaktualizuj proformę
    if (!invoiceData.isProforma && invoiceData.orderId && oldSettledAdvancePayments !== settledAdvancePayments) {
      try {
        // Znajdź proformę dla tego zamówienia
        const relatedInvoices = await getInvoicesByOrderId(invoiceData.orderId);
        const proforma = relatedInvoices.find(inv => inv.isProforma && inv.id !== invoiceId);
        
        if (proforma) {
          // Usuń starą kwotę i dodaj nową
          if (oldSettledAdvancePayments > 0) {
            await removeProformaUsage(proforma.id, oldSettledAdvancePayments, invoiceId, userId);
          }
          if (settledAdvancePayments > 0) {
            await updateProformaUsage(proforma.id, settledAdvancePayments, invoiceId, userId);
          }
        }
      } catch (proformaError) {
        console.warn('Błąd podczas aktualizacji wykorzystania proformy:', proformaError);
        // Nie przerywamy procesu aktualizacji faktury z powodu błędu proformy
      }
    }
    
    return true;
  } catch (error) {
    console.error('Błąd podczas aktualizacji faktury:', error);
    throw error;
  }
};

/**
 * Usuwa fakturę
 */
export const deleteInvoice = async (invoiceId) => {
  try {
    // Pobierz dane faktury przed usunięciem
    const invoiceDoc = await getDoc(doc(db, INVOICES_COLLECTION, invoiceId));
    const invoiceData = invoiceDoc.exists() ? invoiceDoc.data() : null;
    
    // Jeśli faktura wykorzystywała proformę, usuń to wykorzystanie
    if (invoiceData && !invoiceData.isProforma && invoiceData.orderId && invoiceData.settledAdvancePayments > 0) {
      try {
        // Znajdź proformę dla tego zamówienia
        const relatedInvoices = await getInvoicesByOrderId(invoiceData.orderId);
        const proforma = relatedInvoices.find(inv => inv.isProforma && inv.id !== invoiceId);
        
        if (proforma) {
          await removeProformaUsage(proforma.id, invoiceData.settledAdvancePayments, invoiceId, 'system');
        }
      } catch (proformaError) {
        console.warn('Błąd podczas usuwania wykorzystania proformy:', proformaError);
        // Nie przerywamy procesu usuwania faktury z powodu błędu proformy
      }
    }
    
    await deleteDoc(doc(db, INVOICES_COLLECTION, invoiceId));
    return true;
  } catch (error) {
    console.error('Błąd podczas usuwania faktury:', error);
    throw error;
  }
};

/**
 * Aktualizuje status faktury
 */
export const updateInvoiceStatus = async (invoiceId, status, userId) => {
  try {
    const validStatuses = ['draft', 'issued', 'sent', 'paid', 'partially_paid', 'overdue', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      throw new Error('Nieprawidłowy status faktury');
    }
    
    const updateData = {
      status,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    };
    
    // Jeśli status to 'paid', ustaw datę płatności (tylko dla kompatybilności wstecznej)
    if (status === 'paid') {
      updateData.paymentDate = serverTimestamp();
      updateData.paymentStatus = 'paid';
    }
    
    await updateDoc(doc(db, INVOICES_COLLECTION, invoiceId), updateData);
    return true;
  } catch (error) {
    console.error('Błąd podczas aktualizacji statusu faktury:', error);
    throw error;
  }
};

/**
 * Waliduje dane faktury
 */
const validateInvoiceData = (invoiceData) => {
  if (!invoiceData.customer || !invoiceData.customer.id) {
    throw new Error('Klient jest wymagany');
  }
  
  if (!invoiceData.issueDate) {
    throw new Error('Data wystawienia jest wymagana');
  }
  
  if (!invoiceData.dueDate) {
    throw new Error('Termin płatności jest wymagany');
  }
  
  if (!invoiceData.items || !Array.isArray(invoiceData.items) || invoiceData.items.length === 0) {
    throw new Error('Faktura musi zawierać co najmniej jedną pozycję');
  }
  
  // Walidacja pozycji faktury
  invoiceData.items.forEach((item, index) => {
    if (!item.name) {
      throw new Error(`Nazwa pozycji ${index + 1} jest wymagana`);
    }
    
    if (isNaN(item.quantity) || item.quantity <= 0) {
      throw new Error(`Ilość pozycji ${index + 1} jest nieprawidłowa`);
    }
    
    if (isNaN(item.price) || item.price < 0) {
      throw new Error(`Cena pozycji ${index + 1} jest nieprawidłowa`);
    }
  });
};

/**
 * Oblicza łączną wartość faktury na podstawie pozycji
 */
export const calculateInvoiceTotal = (items) => {
  if (!items || !Array.isArray(items)) return 0;
  
  return items.reduce((total, item) => {
    // Użyj netValue jeśli istnieje, w przeciwnym razie oblicz z quantity * price
    const netValue = Number(item.netValue) || 0;
    const calculatedValue = Number(item.quantity) * Number(item.price) || 0;
    return total + (netValue || calculatedValue);
  }, 0);
};

/**
 * Generuje numer faktury
 * Format: FV/ROK/MIESIĄC/NUMER lub PROFORMA/ROK/MIESIĄC/NUMER
 */
export const generateInvoiceNumber = async (isProforma = false) => {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    const prefix = isProforma ? 'PROFORMA' : 'FV';
    
    // Pobierz wszystkie faktury z bieżącego miesiąca i roku o danym typie
    const invoicesQuery = query(
      collection(db, INVOICES_COLLECTION),
      where('number', '>=', `${prefix}/${year}/${month}/`),
      where('number', '<', `${prefix}/${year}/${month}/\uf8ff`)
    );
    
    const querySnapshot = await getDocs(invoicesQuery);
    const invoiceCount = querySnapshot.size;
    
    // Numer faktury to liczba istniejących faktur + 1, sformatowana jako 3-cyfrowa liczba
    const invoiceNumber = (invoiceCount + 1).toString().padStart(3, '0');
    
    return `${prefix}/${year}/${month}/${invoiceNumber}`;
  } catch (error) {
    console.error('Błąd podczas generowania numeru faktury:', error);
    throw error;
  }
};

/**
 * Generuje numer faktury proforma
 * Format: PROFORMA/ROK/MIESIĄC/NUMER
 */
export const generateProformaNumber = async () => {
  return await generateInvoiceNumber(true);
};

/**
 * Domyślne dane nowej faktury
 */
export const DEFAULT_INVOICE = {
  number: '',
  customer: null,
  seller: null,
  issueDate: formatDateForInput(new Date()),
  dueDate: formatDateForInput(new Date(new Date().setDate(new Date().getDate() + 14))), // +14 dni
  paymentMethod: 'przelew',
  paymentStatus: 'unpaid',
  paymentDate: null,
  payments: [], // Lista płatności
  totalPaid: 0, // Suma wszystkich płatności
  items: [{
    id: '',
    name: '',
    description: '',
    quantity: 1,
    unit: 'szt.',
    price: 0,
    netValue: 0,
    vat: 0
  }],
  total: 0,
  currency: 'zł',
  selectedBankAccount: '',
  notes: '',
  status: 'draft',
  billingAddress: '',
  shippingAddress: '',
  invoiceType: 'standard',
  isProforma: false,
  originalOrderType: null,
  orderId: null,
  orderNumber: null,
  shippingInfo: null,
  additionalCostsItems: [],
  settledAdvancePayments: 0,
  // Nowe pola dla śledzenia wykorzystania proform
  usedAsAdvancePayment: 0, // Kwota wykorzystana z tej proformy jako zaliczka w innych fakturach
  linkedAdvanceInvoices: [], // ID faktur które wykorzystały tę proformę jako zaliczkę
  statusHistory: [],
  createdBy: null,
  createdAt: null,
  updatedAt: null
};

/**
 * Dodaje płatność do faktury
 */
export const addPaymentToInvoice = async (invoiceId, paymentData, userId) => {
  try {
    if (!invoiceId || !paymentData || !userId) {
      throw new Error('Brak wymaganych parametrów');
    }

    // Pobierz aktualne dane faktury
    const invoiceDoc = await getDoc(doc(db, INVOICES_COLLECTION, invoiceId));
    if (!invoiceDoc.exists()) {
      throw new Error('Faktura nie została znaleziona');
    }

    const currentInvoice = invoiceDoc.data();
    const currentPayments = currentInvoice.payments || [];

    // Przygotuj nową płatność
    const newPayment = {
      id: `payment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      amount: parseFloat(paymentData.amount),
      date: Timestamp.fromDate(new Date(paymentData.date)),
      method: paymentData.method || 'przelew',
      description: paymentData.description || '',
      reference: paymentData.reference || '',
      createdAt: Timestamp.now(),
      createdBy: userId
    };

    // Dodaj nową płatność do listy
    const updatedPayments = [...currentPayments, newPayment];
    
    // Oblicz całkowitą kwotę płatności
    const totalPaid = updatedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const invoiceTotal = parseFloat(currentInvoice.total || 0);
    
    // Zaktualizuj status płatności
    let paymentStatus = 'unpaid';
    let paymentDate = null;
    
    if (totalPaid >= invoiceTotal) {
      paymentStatus = 'paid';
      paymentDate = newPayment.date;
    } else if (totalPaid > 0) {
      paymentStatus = 'partially_paid';
    }

    // Zaktualizuj fakturę
    await updateDoc(doc(db, INVOICES_COLLECTION, invoiceId), {
      payments: updatedPayments,
      paymentStatus: paymentStatus,
      paymentDate: paymentDate,
      totalPaid: totalPaid,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });

    console.log(`Dodano płatność do faktury ${invoiceId}`);
    return { success: true, paymentId: newPayment.id, totalPaid, paymentStatus };
  } catch (error) {
    console.error('Błąd podczas dodawania płatności:', error);
    throw error;
  }
};

/**
 * Usuwa płatność z faktury
 */
export const removePaymentFromInvoice = async (invoiceId, paymentId, userId) => {
  try {
    if (!invoiceId || !paymentId || !userId) {
      throw new Error('Brak wymaganych parametrów');
    }

    // Pobierz aktualne dane faktury
    const invoiceDoc = await getDoc(doc(db, INVOICES_COLLECTION, invoiceId));
    if (!invoiceDoc.exists()) {
      throw new Error('Faktura nie została znaleziona');
    }

    const currentInvoice = invoiceDoc.data();
    const currentPayments = currentInvoice.payments || [];

    // Usuń płatność z listy
    const updatedPayments = currentPayments.filter(payment => payment.id !== paymentId);
    
    // Oblicz całkowitą kwotę płatności
    const totalPaid = updatedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const invoiceTotal = parseFloat(currentInvoice.total || 0);
    
    // Zaktualizuj status płatności
    let paymentStatus = 'unpaid';
    let paymentDate = null;
    
    if (totalPaid >= invoiceTotal) {
      paymentStatus = 'paid';
      // Znajdź najnowszą płatność jako datę płatności
      if (updatedPayments.length > 0) {
        const latestPayment = updatedPayments.reduce((latest, payment) => 
          payment.date.toDate() > latest.date.toDate() ? payment : latest
        );
        paymentDate = latestPayment.date;
      }
    } else if (totalPaid > 0) {
      paymentStatus = 'partially_paid';
    }

    // Zaktualizuj fakturę
    await updateDoc(doc(db, INVOICES_COLLECTION, invoiceId), {
      payments: updatedPayments,
      paymentStatus: paymentStatus,
      paymentDate: paymentDate,
      totalPaid: totalPaid,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });

    console.log(`Usunięto płatność ${paymentId} z faktury ${invoiceId}`);
    return { success: true, totalPaid, paymentStatus };
  } catch (error) {
    console.error('Błąd podczas usuwania płatności:', error);
    throw error;
  }
};

/**
 * Edytuje płatność w fakturze
 */
export const updatePaymentInInvoice = async (invoiceId, paymentId, updatedPaymentData, userId) => {
  try {
    if (!invoiceId || !paymentId || !updatedPaymentData || !userId) {
      throw new Error('Brak wymaganych parametrów');
    }

    // Pobierz aktualne dane faktury
    const invoiceDoc = await getDoc(doc(db, INVOICES_COLLECTION, invoiceId));
    if (!invoiceDoc.exists()) {
      throw new Error('Faktura nie została znaleziona');
    }

    const currentInvoice = invoiceDoc.data();
    const currentPayments = currentInvoice.payments || [];

    // Znajdź i zaktualizuj płatność
    const paymentIndex = currentPayments.findIndex(payment => payment.id === paymentId);
    if (paymentIndex === -1) {
      throw new Error('Płatność nie została znaleziona');
    }

    const updatedPayments = [...currentPayments];
    updatedPayments[paymentIndex] = {
      ...updatedPayments[paymentIndex],
      amount: parseFloat(updatedPaymentData.amount),
      date: Timestamp.fromDate(new Date(updatedPaymentData.date)),
      method: updatedPaymentData.method || updatedPayments[paymentIndex].method,
      description: updatedPaymentData.description || '',
      reference: updatedPaymentData.reference || '',
      updatedAt: Timestamp.now(),
      updatedBy: userId
    };
    
    // Oblicz całkowitą kwotę płatności
    const totalPaid = updatedPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const invoiceTotal = parseFloat(currentInvoice.total || 0);
    
    // Zaktualizuj status płatności
    let paymentStatus = 'unpaid';
    let paymentDate = null;
    
    if (totalPaid >= invoiceTotal) {
      paymentStatus = 'paid';
      // Znajdź najnowszą płatność jako datę płatności
      const latestPayment = updatedPayments.reduce((latest, payment) => 
        payment.date.toDate() > latest.date.toDate() ? payment : latest
      );
      paymentDate = latestPayment.date;
    } else if (totalPaid > 0) {
      paymentStatus = 'partially_paid';
    }

    // Zaktualizuj fakturę
    await updateDoc(doc(db, INVOICES_COLLECTION, invoiceId), {
      payments: updatedPayments,
      paymentStatus: paymentStatus,
      paymentDate: paymentDate,
      totalPaid: totalPaid,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });

    console.log(`Zaktualizowano płatność ${paymentId} w fakturze ${invoiceId}`);
    return { success: true, totalPaid, paymentStatus };
  } catch (error) {
    console.error('Błąd podczas edycji płatności:', error);
    throw error;
  }
};

/**
 * Aktualizuje wykorzystanie kwoty z proformy
 */
export const updateProformaUsage = async (proformaId, usedAmount, targetInvoiceId, userId) => {
  try {
    const proformaRef = doc(db, INVOICES_COLLECTION, proformaId);
    const proformaDoc = await getDoc(proformaRef);
    
    if (!proformaDoc.exists()) {
      throw new Error('Proforma nie została znaleziona');
    }
    
    const proformaData = proformaDoc.data();
    
    if (!proformaData.isProforma) {
      throw new Error('Podana faktura nie jest proformą');
    }
    
    const currentUsed = parseFloat(proformaData.usedAsAdvancePayment || 0);
    const newUsed = currentUsed + parseFloat(usedAmount);
    const proformaTotal = parseFloat(proformaData.total || 0);
    
    // Sprawdź czy nie przekraczamy kwoty proformy
    if (newUsed > proformaTotal) {
      throw new Error(`Nie można rozliczyć ${usedAmount}. Dostępna kwota do rozliczenia: ${(proformaTotal - currentUsed).toFixed(2)}`);
    }
    
    const linkedInvoices = proformaData.linkedAdvanceInvoices || [];
    
    await updateDoc(proformaRef, {
      usedAsAdvancePayment: newUsed,
      linkedAdvanceInvoices: [...linkedInvoices, targetInvoiceId],
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    return { success: true, remainingAmount: proformaTotal - newUsed };
  } catch (error) {
    console.error('Błąd podczas aktualizacji wykorzystania proformy:', error);
    throw error;
  }
};

/**
 * Usuwa wykorzystanie kwoty z proformy (np. przy edycji/usunięciu faktury)
 */
export const removeProformaUsage = async (proformaId, usedAmount, targetInvoiceId, userId) => {
  try {
    const proformaRef = doc(db, INVOICES_COLLECTION, proformaId);
    const proformaDoc = await getDoc(proformaRef);
    
    if (!proformaDoc.exists()) {
      throw new Error('Proforma nie została znaleziona');
    }
    
    const proformaData = proformaDoc.data();
    const currentUsed = parseFloat(proformaData.usedAsAdvancePayment || 0);
    const newUsed = Math.max(0, currentUsed - parseFloat(usedAmount));
    const linkedInvoices = (proformaData.linkedAdvanceInvoices || []).filter(id => id !== targetInvoiceId);
    
    await updateDoc(proformaRef, {
      usedAsAdvancePayment: newUsed,
      linkedAdvanceInvoices: linkedInvoices,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas usuwania wykorzystania proformy:', error);
    throw error;
  }
};

/**
 * Pobiera dostępną kwotę do rozliczenia z proformy
 */
export const getAvailableProformaAmount = async (proformaId) => {
  try {
    const proformaDoc = await getDoc(doc(db, INVOICES_COLLECTION, proformaId));
    
    if (!proformaDoc.exists()) {
      throw new Error('Proforma nie została znaleziona');
    }
    
    const proformaData = proformaDoc.data();
    
    if (!proformaData.isProforma) {
      throw new Error('Podana faktura nie jest proformą');
    }
    
    const total = parseFloat(proformaData.total || 0);
    const used = parseFloat(proformaData.usedAsAdvancePayment || 0);
    
    return {
      total,
      used,
      available: total - used
    };
  } catch (error) {
    console.error('Błąd podczas pobierania dostępnej kwoty proformy:', error);
    throw error;
  }
};

/**
 * Pobiera płatności dla faktury
 */
export const getInvoicePayments = async (invoiceId) => {
  try {
    const invoiceDoc = await getDoc(doc(db, INVOICES_COLLECTION, invoiceId));
    if (!invoiceDoc.exists()) {
      throw new Error('Faktura nie została znaleziona');
    }

    const invoiceData = invoiceDoc.data();
    const payments = invoiceData.payments || [];
    
    // Konwertuj daty Timestamp na obiekty Date
    return payments.map(payment => ({
      ...payment,
      date: payment.date?.toDate(),
      createdAt: payment.createdAt?.toDate(),
      updatedAt: payment.updatedAt?.toDate()
    })).sort((a, b) => new Date(b.date) - new Date(a.date)); // Sortuj od najnowszych
  } catch (error) {
    console.error('Błąd podczas pobierania płatności faktury:', error);
    throw error;
  }
}; 