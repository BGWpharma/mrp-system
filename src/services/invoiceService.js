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
 * Tworzy nową fakturę
 */
export const createInvoice = async (invoiceData, userId) => {
  try {
    // Walidacja danych faktury
    validateInvoiceData(invoiceData);
    
    // Generowanie numeru faktury, jeśli nie został podany
    if (!invoiceData.number) {
      invoiceData.number = await generateInvoiceNumber();
    }
    
    const newInvoice = {
      ...invoiceData,
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
    return docRef.id;
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
    
    // Przygotuj podstawowe dane faktury na podstawie zamówienia
    const basicInvoiceData = {
      orderId: orderId,
      customer: orderData.customer,
      items: orderData.items,
      orderNumber: orderData.orderNumber,
      shippingAddress: orderData.shippingAddress || orderData.customer.address,
      billingAddress: orderData.customer.billingAddress || orderData.customer.address,
      total: orderData.total || calculateInvoiceTotal(orderData.items),
      currency: 'PLN',
      status: 'draft',
      paymentMethod: orderData.paymentMethod || 'Przelew',
      paymentStatus: 'unpaid',
      notes: invoiceData.notes || ''
    };
    
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
 * Aktualizuje dane faktury
 */
export const updateInvoice = async (invoiceId, invoiceData, userId) => {
  try {
    // Walidacja danych faktury
    validateInvoiceData(invoiceData);
    
    const updatedInvoice = {
      ...invoiceData,
      updatedBy: userId,
      updatedAt: serverTimestamp(),
      // Konwersja dat na Timestamp
      issueDate: Timestamp.fromDate(new Date(invoiceData.issueDate)),
      dueDate: Timestamp.fromDate(new Date(invoiceData.dueDate)),
      paymentDate: invoiceData.paymentDate ? 
        Timestamp.fromDate(new Date(invoiceData.paymentDate)) : null
    };
    
    await updateDoc(doc(db, INVOICES_COLLECTION, invoiceId), updatedInvoice);
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
    const validStatuses = ['draft', 'issued', 'sent', 'paid', 'overdue', 'cancelled'];
    
    if (!validStatuses.includes(status)) {
      throw new Error('Nieprawidłowy status faktury');
    }
    
    const updateData = {
      status,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    };
    
    // Jeśli status to 'paid', ustaw datę płatności
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
    const quantity = Number(item.quantity) || 0;
    const price = Number(item.price) || 0;
    return total + (quantity * price);
  }, 0);
};

/**
 * Generuje numer faktury
 * Format: FV/ROK/MIESIĄC/NUMER
 */
export const generateInvoiceNumber = async () => {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = (today.getMonth() + 1).toString().padStart(2, '0');
    
    // Pobierz wszystkie faktury z bieżącego miesiąca i roku
    const invoicesQuery = query(
      collection(db, INVOICES_COLLECTION),
      where('number', '>=', `FV/${year}/${month}/`),
      where('number', '<', `FV/${year}/${month}/\uf8ff`)
    );
    
    const querySnapshot = await getDocs(invoicesQuery);
    const invoiceCount = querySnapshot.size;
    
    // Numer faktury to liczba istniejących faktur + 1, sformatowana jako 3-cyfrowa liczba
    const invoiceNumber = (invoiceCount + 1).toString().padStart(3, '0');
    
    return `FV/${year}/${month}/${invoiceNumber}`;
  } catch (error) {
    console.error('Błąd podczas generowania numeru faktury:', error);
    throw error;
  }
};

/**
 * Domyślne dane nowej faktury
 */
export const DEFAULT_INVOICE = {
  number: '',
  customer: {
    id: '',
    name: '',
    email: '',
    phone: '',
    billingAddress: '',
    shippingAddress: '',
    vatEu: ''
  },
  seller: {
    name: '',
    address: '',
    city: '',
    nip: '',
    regon: '',
    email: '',
    phone: '',
    bankName: '',
    bankAccount: ''
  },
  orderId: null,
  orderNumber: null,
  items: [
    {
      id: '',
      name: '',
      description: '',
      quantity: 1,
      unit: 'szt.',
      price: 0,
      vat: 23 // Domyślna stawka VAT 23%
    }
  ],
  issueDate: formatDateForInput(new Date()),
  dueDate: formatDateForInput(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)), // +14 dni
  paymentDate: null,
  status: 'draft', // draft, issued, sent, paid, overdue, cancelled
  paymentMethod: 'Przelew',
  paymentStatus: 'unpaid', // unpaid, paid, partial
  notes: '',
  billingAddress: '',
  shippingAddress: '',
  vatRate: 23,
  total: 0,
  totalVat: 0,
  currency: 'PLN'
}; 