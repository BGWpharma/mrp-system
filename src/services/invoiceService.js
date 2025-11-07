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
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from './firebase/config';
import { formatDateForInput } from '../utils/dateUtils';
import { preciseCompare, preciseIsLessOrEqual } from '../utils/mathUtils';
import { generateFSNumber, generateFPFNumber } from '../utils/numberGenerators';

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
        // Statusy płatności (paid, unpaid, partially_paid, overdue) są obliczane dynamicznie,
        // więc nie można ich filtrować w Firestore - filtrowanie po stronie klienta
        const paymentStatuses = ['paid', 'unpaid', 'partially_paid', 'overdue'];
        
        if (!paymentStatuses.includes(filters.status)) {
          // Filtruj tylko statusy faktur (draft, issued, cancelled) w Firestore
          conditions.push(where('status', '==', filters.status));
        }
        // Dla statusów płatności nie dodajemy warunku - filtrowanie odbywa się po stronie klienta
      }
      
      if (filters.customerId) {
        conditions.push(where('customer.id', '==', filters.customerId));
      }
      
      if (filters.orderId) {
        conditions.push(where('orderId', '==', filters.orderId));
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
    // Generowanie numeru faktury, jeśli nie został podany (PRZED walidacją)
    if (!invoiceData.number || invoiceData.number.trim() === '') {
      invoiceData.number = await generateInvoiceNumber(invoiceData.isProforma);
    }
    
    // Walidacja danych faktury (teraz już z numerem)
    await validateInvoiceData(invoiceData);
    
    // Upewnij się, że mamy właściwe dane o zaliczkach/przedpłatach
    const linkedPurchaseOrders = invoiceData.linkedPurchaseOrders || [];
    const settledAdvancePayments = parseFloat(invoiceData.settledAdvancePayments || 0);
    
    const newInvoice = {
      ...invoiceData,
      linkedPurchaseOrders: linkedPurchaseOrders,
      settledAdvancePayments: settledAdvancePayments,
      isRefInvoice: invoiceData.isRefInvoice || false,
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
    
    // Jeśli faktura wykorzystuje proformy jako zaliczki, zaktualizuj proformy
    if (!invoiceData.isProforma && invoiceData.proformAllocation && invoiceData.proformAllocation.length > 0) {
      try {
        await updateMultipleProformasUsage(invoiceData.proformAllocation, newInvoiceId, userId);
      } catch (proformaError) {
        console.warn('Błąd podczas aktualizacji wykorzystania proform:', proformaError);
        // Nie przerywamy procesu tworzenia faktury z powodu błędu proform
      }
    }
    
    // Compatibility: jeśli używa starego systemu selectedProformaId
    else if (!invoiceData.isProforma && settledAdvancePayments > 0 && invoiceData.selectedProformaId) {
      try {
        await updateProformaUsage(invoiceData.selectedProformaId, settledAdvancePayments, newInvoiceId, userId);
      } catch (proformaError) {
        console.warn('Błąd podczas aktualizacji wykorzystania proformy:', proformaError);
      }
    }
    
    // Automatycznie przelicz i zaktualizuj status płatności po utworzeniu faktury (jeśli nie jest proformą)
    if (!invoiceData.isProforma) {
      try {
        await recalculatePaymentStatus(newInvoiceId, userId);
      } catch (paymentStatusError) {
        console.warn('Błąd podczas automatycznego przeliczania statusu płatności dla nowej faktury:', paymentStatusError);
        // Nie przerywamy procesu tworzenia faktury z powodu błędu statusu płatności
      }
    }
    
    return newInvoiceId;
  } catch (error) {
    console.error('Błąd podczas tworzenia faktury:', error);
    throw error;
  }
};

/**
 * Funkcja obliczająca wartość pozycji z uwzględnieniem kosztów produkcji
 * (używana do obliczania proporcji w kosztach dodatkowych)
 */
export const calculateItemTotalValue = (item) => {
  // Podstawowa wartość pozycji
  const itemValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
  
  // Jeśli produkt jest z listy cenowej I ma cenę większą od 0, zwracamy tylko wartość pozycji
  if (item.fromPriceList && parseFloat(item.price || 0) > 0) {
    return itemValue;
  }
  
  // Jeśli produkt nie jest z listy cenowej LUB ma cenę 0, i ma koszt produkcji, dodajemy go
  if (item.productionTaskId && item.productionCost !== undefined) {
    return itemValue + parseFloat(item.productionCost || 0);
  }
  
  // Domyślnie zwracamy tylko wartość pozycji
  return itemValue;
};

/**
 * Oblicza całkowity koszt jednostkowy pozycji uwzględniając:
 * - wartość pozycji (cena + koszt produkcji jeśli nie z listy cenowej)
 * - proporcjonalny udział w kosztach dodatkowych (transport + inne koszty)
 * - proporcjonalny udział w rabatach
 */
export const calculateTotalUnitCost = (item, orderData) => {
  // Oblicz wartość tej pozycji
  const itemTotalValue = calculateItemTotalValue(item);
  
  // Oblicz sumę wartości wszystkich pozycji w zamówieniu
  const allItemsValue = orderData.items?.reduce((sum, i) => sum + calculateItemTotalValue(i), 0) || 0;
  
  // Oblicz proporcję tej pozycji w całkowitej wartości
  const proportion = allItemsValue > 0 ? itemTotalValue / allItemsValue : 0;
  
  // Oblicz koszty dodatkowe
  const shippingCost = parseFloat(orderData.shippingCost) || 0;
  
  // Suma dodatkowych kosztów (dodatnich)
  const additionalCosts = orderData.additionalCostsItems ? 
    orderData.additionalCostsItems
      .filter(cost => parseFloat(cost.value) > 0)
      .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0) : 0;
  
  // Suma rabatów (ujemnych kosztów)
  const discounts = orderData.additionalCostsItems ? 
    Math.abs(orderData.additionalCostsItems
      .filter(cost => parseFloat(cost.value) < 0)
      .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)) : 0;
  
  // Całkowity udział pozycji w kosztach dodatkowych
  const additionalShare = proportion * (shippingCost + additionalCosts - discounts);
  
  // Całkowity koszt pozycji z kosztami dodatkowymi
  const totalWithAdditional = itemTotalValue + additionalShare;
  
  // Koszt pojedynczej sztuki
  const quantity = parseFloat(item.quantity) || 1;
  const unitCost = totalWithAdditional / quantity;
  
  return unitCost;
};

/**
 * Tworzy fakturę na podstawie zamówienia
 */
export const createInvoiceFromOrder = async (orderId, invoiceData, userId) => {
  try {
    // Określ kolekcję na podstawie typu faktury
    const collectionName = invoiceData.invoiceType === 'purchase' ? 'purchaseOrders' : 'orders';
    
    // Pobierz dane zamówienia z odpowiedniej kolekcji
    const orderDoc = await getDoc(doc(db, collectionName, orderId));
    if (!orderDoc.exists()) {
      throw new Error('Zamówienie nie zostało znalezione');
    }
    
    const orderData = orderDoc.data();
    
    // Dla Purchase Orders, ustaw type jako 'purchase' jeśli nie jest już ustawiony
    if (collectionName === 'purchaseOrders' && !orderData.type) {
      orderData.type = 'purchase';
    }
    
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
    // Funkcja mapująca pozycje z uwzględnieniem kosztów z produkcji
    const mapItemsWithProductionCosts = (items, isProformaInvoice = false) => {
      return (items || []).map((item, index) => {
        let finalPrice;
        
        // Dla faktur PROFORMA - używaj "ostatniego kosztu" jeśli dostępny
        if (isProformaInvoice && item.lastUsageInfo && item.lastUsageInfo.cost && parseFloat(item.lastUsageInfo.cost) > 0) {
          finalPrice = parseFloat(item.lastUsageInfo.cost);
          console.log(`PROFORMA: Używam ostatniego kosztu ${finalPrice} dla ${item.name}`);
        } else {
          // Dla zwykłych faktur - sprawdź czy produkt nie jest z listy cenowej lub ma cenę 0
          const shouldUseProductionCost = !item.fromPriceList || parseFloat(item.price || 0) === 0;
          
          // Użyj kosztu całkowitego (z udziałem w kosztach dodatkowych) jeśli warunki są spełnione
          if (shouldUseProductionCost) {
            finalPrice = calculateTotalUnitCost(item, orderData);
            console.log(`Faktura: Używam kosztu całk./szt. ${finalPrice.toFixed(2)}€ dla ${item.name}`);
          } else {
            finalPrice = parseFloat(item.price || 0);
          }
        }

        const orderItemId = item.id || `${orderId}_item_${index}`;
        console.log(`[INVOICE_DEBUG] Mapowanie pozycji faktury - originalItemId: ${item.id}, orderItemId: ${orderItemId}, itemName: ${item.name}`);
        
        return {
          ...item,
          orderItemId: orderItemId, // Dodaj ID pozycji zamówienia
          description: item.description || '', // Kopiuj opis z pozycji CO
          price: parseFloat(finalPrice.toFixed(4)), // Zaokrąglij do 4 miejsc przed zapisem
          netValue: parseFloat(item.quantity || 0) * parseFloat(finalPrice.toFixed(4)),
          totalPrice: parseFloat(item.quantity || 0) * parseFloat(finalPrice.toFixed(4))
        };
      });
    };

    // Sprawdź czy to faktura PROFORMA
    const isProformaInvoice = invoiceData.isProforma === true;

    if (isCustomerOrder) {
      // Zwykłe zamówienie klienta
      basicInvoiceData.customer = orderData.customer;
      basicInvoiceData.items = mapItemsWithProductionCosts(orderData.items, isProformaInvoice);
      basicInvoiceData.shippingAddress = orderData.shippingAddress || orderData.customer.address;
      basicInvoiceData.billingAddress = orderData.customer.billingAddress || orderData.customer.address;
      
      // Oblicz wartość zamówienia klienta
      const orderTotal = orderData.total || calculateOrderTotal(orderData);
      basicInvoiceData.total = orderTotal;
    } else {
      // Zamówienie zakupowe (PO)
      const isRefInvoice = invoiceData.isRefInvoice === true;
      
      if (isRefInvoice) {
        // Refaktura - użyj klienta przekazanego w invoiceData, nie dostawcy z PO
        basicInvoiceData.customer = invoiceData.customer;
        basicInvoiceData.billingAddress = invoiceData.billingAddress || invoiceData.customer?.billingAddress || invoiceData.customer?.address || '';
        basicInvoiceData.shippingAddress = invoiceData.shippingAddress || invoiceData.customer?.shippingAddress || invoiceData.customer?.address || '';
      } else {
        // Zwykła faktura zakupowa - użyj dostawcę jako "klienta" faktury
        basicInvoiceData.customer = {
          id: orderData.supplierId || '',
          name: orderData.supplier?.name || '',
          email: orderData.supplier?.email || '',
          phone: orderData.supplier?.phone || '',
          address: orderData.supplier?.address || '',
          vatEu: orderData.supplier?.vatEu || ''
        };
        basicInvoiceData.shippingAddress = orderData.deliveryAddress || '';
        basicInvoiceData.billingAddress = orderData.supplier?.address || '';
      }
      
      // Zamówienia zakupowe mają format items zgodny z fakturami
      basicInvoiceData.items = mapItemsWithProductionCosts(orderData.items, isProformaInvoice);
      
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
    await validateInvoiceData(invoiceData, invoiceId);
    
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
    
    // Jeśli faktura jest już wystawiona (status 'issued' lub wyżej), regeneruj PDF z nowymi danymi
    if (invoiceData.status && ['issued', 'paid', 'partially_paid', 'overdue'].includes(invoiceData.status)) {
      try {
        console.log('Regenerowanie PDF faktury po edycji...');
        const pdfInfo = await generateAndSaveInvoicePdf(invoiceId, userId);
        if (pdfInfo) {
          // Zaktualizuj dokument faktury o nowe informacje PDF
          await updateDoc(doc(db, INVOICES_COLLECTION, invoiceId), {
            pdfAttachment: pdfInfo,
            updatedAt: serverTimestamp(),
            updatedBy: userId
          });
          console.log('PDF faktury został zaktualizowany po edycji');
        }
      } catch (pdfError) {
        console.error('Błąd podczas regenerowania PDF faktury po edycji:', pdfError);
        // Nie przerywamy procesu aktualizacji faktury z powodu błędu PDF
      }
    }
    
    // Jeśli zmieniono wykorzystanie proform, zaktualizuj proformy
    const oldProformAllocation = oldInvoiceData?.proformAllocation || [];
    const newProformAllocation = invoiceData.proformAllocation || [];
    
    // Sprawdź czy są zmiany w alokacji proform
    const hasProformChanges = JSON.stringify(oldProformAllocation) !== JSON.stringify(newProformAllocation) ||
                             oldSettledAdvancePayments !== settledAdvancePayments ||
                             oldInvoiceData?.selectedProformaId !== invoiceData.selectedProformaId;
    
    if (!invoiceData.isProforma && hasProformChanges) {
      try {
        // Usuń stare alokacje proform
        if (oldProformAllocation.length > 0) {
          await removeMultipleProformasUsage(oldProformAllocation, invoiceId, userId);
        }
        // Compatibility: usuń stary system jeśli był używany
        else if (oldSettledAdvancePayments > 0 && oldInvoiceData?.selectedProformaId) {
          await removeProformaUsage(oldInvoiceData.selectedProformaId, oldSettledAdvancePayments, invoiceId, userId);
        }
        
        // Dodaj nowe alokacje proform
        if (newProformAllocation.length > 0) {
          await updateMultipleProformasUsage(newProformAllocation, invoiceId, userId);
        }
        // Compatibility: dodaj nowy system jeśli jest używany
        else if (settledAdvancePayments > 0 && invoiceData.selectedProformaId) {
          await updateProformaUsage(invoiceData.selectedProformaId, settledAdvancePayments, invoiceId, userId);
        }
      } catch (proformaError) {
        console.warn('Błąd podczas aktualizacji wykorzystania proform:', proformaError);
        // Nie przerywamy procesu aktualizacji faktury z powodu błędu proform
      }
    }
    
    // NOWE: Jeśli to proforma i zmienił się jej numer, zsynchronizuj go w powiązanych fakturach
    if (invoiceData.isProforma && oldInvoiceData?.number !== invoiceData.number) {
      try {
        console.log(`Wykryto zmianę numeru proformy: "${oldInvoiceData.number}" → "${invoiceData.number}"`);
        const syncResult = await syncProformaNumberInLinkedInvoices(invoiceId, invoiceData.number, userId);
        if (syncResult.updatedInvoices > 0) {
          console.log(`✅ Zsynchronizowano numer proformy w ${syncResult.updatedInvoices} powiązanych fakturach`);
        }
      } catch (syncError) {
        console.warn('Błąd podczas synchronizacji numeru proformy w powiązanych fakturach:', syncError);
        // Nie przerywamy procesu aktualizacji proformy z powodu błędu synchronizacji
      }
    }
    
    // Automatycznie przelicz i zaktualizuj status płatności po zapisaniu faktury
    try {
      await recalculatePaymentStatus(invoiceId, userId);
    } catch (paymentStatusError) {
      console.warn('Błąd podczas automatycznego przeliczania statusu płatności:', paymentStatusError);
      // Nie przerywamy procesu aktualizacji faktury z powodu błędu statusu płatności
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
    
    // Usuń plik PDF jeśli istnieje
    if (invoiceData?.pdfAttachment?.storagePath) {
      try {
        const pdfFileRef = ref(storage, invoiceData.pdfAttachment.storagePath);
        await deleteObject(pdfFileRef);
        console.log('Usunięto plik PDF faktury:', invoiceData.pdfAttachment.storagePath);
      } catch (pdfError) {
        console.warn('Nie można usunąć pliku PDF faktury (może już nie istnieć):', pdfError);
        // Kontynuuj proces usuwania faktury nawet jeśli usunięcie pliku się nie powiodło
      }
    }
    
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
    const validStatuses = ['draft', 'issued', 'unpaid', 'paid', 'partially_paid', 'overdue', 'cancelled'];
    
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
    
    // Jeśli status zmienia się na 'issued', wygeneruj i zapisz PDF
    if (status === 'issued') {
      try {
        const pdfInfo = await generateAndSaveInvoicePdf(invoiceId, userId);
        if (pdfInfo) {
          updateData.pdfAttachment = pdfInfo;
        }
      } catch (pdfError) {
        console.error('Błąd podczas generowania PDF faktury:', pdfError);
        // Nie przerywamy procesu zmiany statusu, tylko logujemy błąd
      }
    }
    
    await updateDoc(doc(db, INVOICES_COLLECTION, invoiceId), updateData);
    return true;
  } catch (error) {
    console.error('Błąd podczas aktualizacji statusu faktury:', error);
    throw error;
  }
};

/**
 * Generuje PDF faktury i zapisuje w Firebase Storage
 */
export const generateAndSaveInvoicePdf = async (invoiceId, userId) => {
  try {
    // Pobierz dane faktury
    const invoice = await getInvoiceById(invoiceId);
    
    // Usuń poprzedni plik PDF jeśli istnieje
    if (invoice.pdfAttachment?.storagePath) {
      try {
        const oldFileRef = ref(storage, invoice.pdfAttachment.storagePath);
        await deleteObject(oldFileRef);
        console.log('Usunięto poprzedni plik PDF:', invoice.pdfAttachment.storagePath);
      } catch (deleteError) {
        console.warn('Nie można usunąć poprzedniego pliku PDF (może już nie istnieć):', deleteError);
        // Kontynuuj proces nawet jeśli usunięcie się nie powiodło
      }
    }
    
    // Pobierz dane firmy
    const { getCompanyInfo } = await import('./companyService');
    const companyInfo = await getCompanyInfo();
    
    // Dynamicznie importuj generator PDF
    const { createInvoicePdfGenerator } = await import('../components/invoices/InvoicePdfGenerator');
    
    // Stwórz generator PDF
    const pdfGenerator = createInvoicePdfGenerator(invoice, companyInfo, 'en', {
      useTemplate: true,
      imageQuality: 0.95,
      enableCompression: true
    });
    
    // Wygeneruj PDF
    const pdfDoc = await pdfGenerator.generate('en');
    
    // Konwertuj PDF na Blob
    const pdfBlob = pdfDoc.output('blob');
    
    // Przygotuj stałą nazwę pliku (bez timestamp)
    const cleanInvoiceNumber = invoice.number.replace(/[\/\\:*?"<>|]/g, '_');
    let fileName;
    if (invoice.isProforma && invoice.isRefInvoice) {
      fileName = `Invoice_Proforma_Reinvoice_${cleanInvoiceNumber}.pdf`;
    } else if (invoice.isProforma) {
      fileName = `Invoice_Proforma_${cleanInvoiceNumber}.pdf`;
    } else if (invoice.isRefInvoice) {
      fileName = `Invoice_Reinvoice_${cleanInvoiceNumber}.pdf`;
    } else {
      fileName = `Invoice_${cleanInvoiceNumber}.pdf`;
    }
    
    // Ścieżka w Firebase Storage
    const storagePath = `invoices/${invoiceId}/${fileName}`;
    
    // Przesyłaj do Firebase Storage
    const fileRef = ref(storage, storagePath);
    await uploadBytes(fileRef, pdfBlob);
    
    // Pobierz URL do pobrania
    const downloadURL = await getDownloadURL(fileRef);
    
    // Zwróć informacje o pliku
    return {
      fileName,
      storagePath,
      downloadURL,
      contentType: 'application/pdf',
      size: pdfBlob.size,
      uploadedAt: new Date().toISOString(),
      uploadedBy: userId
    };
  } catch (error) {
    console.error('Błąd podczas generowania i zapisywania PDF faktury:', error);
    throw error;
  }
};

/**
 * Sprawdza czy numer faktury już istnieje w systemie
 */
const checkInvoiceNumberExists = async (invoiceNumber, excludeInvoiceId = null) => {
  try {
    const invoicesQuery = query(
      collection(db, INVOICES_COLLECTION),
      where('number', '==', invoiceNumber)
    );
    
    const querySnapshot = await getDocs(invoicesQuery);
    
    // Jeśli jest to edycja faktury, wykluczamy aktualnie edytowaną fakturę
    if (excludeInvoiceId) {
      const existingInvoices = querySnapshot.docs.filter(doc => doc.id !== excludeInvoiceId);
      return existingInvoices.length > 0;
    }
    
    return !querySnapshot.empty;
  } catch (error) {
    console.error('Błąd podczas sprawdzania numeru faktury:', error);
    throw error;
  }
};

/**
 * Waliduje dane faktury
 */
const validateInvoiceData = async (invoiceData, invoiceId = null) => {
  if (!invoiceData.customer || !invoiceData.customer.id) {
    throw new Error('Klient jest wymagany');
  }
  
  if (!invoiceData.issueDate) {
    throw new Error('Data wystawienia jest wymagana');
  }
  
  if (!invoiceData.dueDate) {
    throw new Error('Termin płatności jest wymagany');
  }
  
  // Walidacja numeru faktury
  if (!invoiceData.number || invoiceData.number.trim() === '') {
    throw new Error('Numer faktury jest wymagany');
  }
  
  // Sprawdź unikalność numeru faktury
  const numberExists = await checkInvoiceNumberExists(invoiceData.number.trim(), invoiceId);
  if (numberExists) {
    throw new Error(`Numer faktury "${invoiceData.number}" już istnieje w systemie`);
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
 * Oblicza łączną wartość netto faktury na podstawie pozycji
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
 * Oblicza łączną wartość brutto faktury na podstawie pozycji (netto + VAT)
 */
export const calculateInvoiceTotalGross = (items) => {
  if (!items || !Array.isArray(items)) return 0;
  
  return items.reduce((total, item) => {
    // Oblicz wartość netto
    const netValue = Number(item.netValue) || 0;
    const calculatedValue = Number(item.quantity) * Number(item.price) || 0;
    const baseValue = netValue || calculatedValue;
    
    // Oblicz VAT
    let vatRate = 0;
    if (typeof item.vat === 'number') {
      vatRate = item.vat;
    } else if (item.vat !== "ZW" && item.vat !== "NP") {
      vatRate = parseFloat(item.vat) || 0;
    }
    
    const vatValue = baseValue * (vatRate / 100);
    const grossValue = baseValue + vatValue;
    
    return total + grossValue;
  }, 0);
};

/**
 * Generuje numer faktury
 * Format: FPF/kolejny numer/MM/RRRR lub FS/kolejny numer/MM/RRRR
 * Numeracja odnawia się co miesiąc
 * Używa systemu liczników z numberGenerators.js
 */
export const generateInvoiceNumber = async (isProforma = false) => {
  try {
    if (isProforma) {
      return await generateFPFNumber();
    } else {
      return await generateFSNumber();
    }
  } catch (error) {
    console.error('Błąd podczas generowania numeru faktury:', error);
    throw error;
  }
};

/**
 * Generuje numer faktury proforma
 * Format: FPF/kolejny numer/MM/RRRR
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
  paymentMethod: 'Przelew',
  paymentStatus: 'unpaid',
  paymentDate: null,
  payments: [], // Lista płatności
  totalPaid: 0, // Suma wszystkich płatności
  items: [],
  total: 0,
  currency: 'EUR',
  selectedBankAccount: '',
  notes: '',
  status: 'draft',
  billingAddress: '',
  shippingAddress: '',
  invoiceType: 'standard',
  isProforma: false,
  isRefInvoice: false,
  originalOrderType: null,
  orderId: null,
  orderNumber: null,
  shippingInfo: null,
  additionalCostsItems: [],
  settledAdvancePayments: 0,
  selectedProformaId: null, // ID wybranej proformy do rozliczenia zaliczek
  // Nowa struktura dla wielokrotnego rozliczenia proform
  proformAllocation: [], // [{proformaId: string, amount: number, proformaNumber: string}]
  // Nowe pola dla śledzenia wykorzystania proform
  usedAsAdvancePayment: 0, // Kwota wykorzystana z tej proformy jako zaliczka w innych fakturach
  linkedAdvanceInvoices: [], // ID faktur które wykorzystały tę proformę jako zaliczkę
  statusHistory: [],
  createdBy: null,
  createdAt: null,
  updatedAt: null,
  // Nowe pole dla wymaganej przedpłaty
  requiredAdvancePaymentPercentage: 0 // Wymagana przedpłata w procentach (0-100)
};

/**
 * Oblicza wymaganą kwotę przedpłaty na podstawie procentu
 * @param {number} totalAmount - Całkowita kwota faktury
 * @param {number} percentage - Procent wymaganej przedpłaty (0-100)
 * @returns {number} Wymagana kwota przedpłaty
 */
export const calculateRequiredAdvancePayment = (totalAmount, percentage) => {
  if (!percentage || percentage <= 0) return 0;
  return (parseFloat(totalAmount) * parseFloat(percentage)) / 100;
};

/**
 * Sprawdza czy faktura ma wystarczającą przedpłatę
 * @param {object} invoice - Dane faktury
 * @returns {boolean} Czy przedpłata jest wystarczająca
 */
export const hasRequiredAdvancePayment = (invoice) => {
  if (!invoice.requiredAdvancePaymentPercentage || invoice.requiredAdvancePaymentPercentage <= 0) {
    return true; // Brak wymagań przedpłaty
  }

  const totalAmount = parseFloat(invoice.total || 0);
  const requiredAmount = calculateRequiredAdvancePayment(totalAmount, invoice.requiredAdvancePaymentPercentage);
  
  // Oblicz łączne płatności
  const totalPaid = (invoice.payments || []).reduce((sum, payment) => sum + payment.amount, 0);
  
  // Oblicz przedpłaty z proform
  let advancePayments = 0;
  if (invoice.proformAllocation && invoice.proformAllocation.length > 0) {
    advancePayments = invoice.proformAllocation.reduce((sum, allocation) => sum + (allocation.amount || 0), 0);
  } else {
    advancePayments = parseFloat(invoice.settledAdvancePayments || 0);
  }
  
  const totalSettled = totalPaid + advancePayments;
  
  // Używamy tolerancji 0.01 EUR (1 cent) dla porównań płatności
  return preciseCompare(totalSettled, requiredAmount, 0.01) >= 0;
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
    
    // Oblicz przedpłaty z proform
    let advancePayments = 0;
    if (currentInvoice.proformAllocation && currentInvoice.proformAllocation.length > 0) {
      advancePayments = currentInvoice.proformAllocation.reduce((sum, allocation) => sum + (allocation.amount || 0), 0);
    } else {
      advancePayments = parseFloat(currentInvoice.settledAdvancePayments || 0);
    }
    
    // Oblicz łączną kwotę rozliczoną
    const totalSettled = totalPaid + advancePayments;
    
    // Zaktualizuj status płatności
    let paymentStatus = 'unpaid';
    let paymentDate = null;
    
    // Sprawdź czy jest wymagana przedpłata
    const requiredAdvancePercentage = currentInvoice.requiredAdvancePaymentPercentage || 0;
    if (requiredAdvancePercentage > 0) {
      const requiredAdvanceAmount = calculateRequiredAdvancePayment(invoiceTotal, requiredAdvancePercentage);
      
      // Używamy tolerancji 0.01 EUR (1 cent) dla porównań płatności
      if (preciseCompare(totalSettled, requiredAdvanceAmount, 0.01) >= 0) {
        paymentStatus = 'paid';
        paymentDate = newPayment.date;
      } else if (totalSettled > 0) {
        paymentStatus = 'partially_paid';
      }
    } else {
      // Standardowa logika z tolerancją dla błędów precyzji
      if (preciseCompare(totalSettled, invoiceTotal, 0.01) >= 0) {
        paymentStatus = 'paid';
        paymentDate = newPayment.date;
      } else if (totalSettled > 0) {
        paymentStatus = 'partially_paid';
      }
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
    
    // Oblicz przedpłaty z proform
    let advancePayments = 0;
    if (currentInvoice.proformAllocation && currentInvoice.proformAllocation.length > 0) {
      advancePayments = currentInvoice.proformAllocation.reduce((sum, allocation) => sum + (allocation.amount || 0), 0);
    } else {
      advancePayments = parseFloat(currentInvoice.settledAdvancePayments || 0);
    }
    
    // Oblicz łączną kwotę rozliczoną
    const totalSettled = totalPaid + advancePayments;
    
    // Zaktualizuj status płatności
    let paymentStatus = 'unpaid';
    let paymentDate = null;
    
    // Sprawdź czy jest wymagana przedpłata
    const requiredAdvancePercentage = currentInvoice.requiredAdvancePaymentPercentage || 0;
    if (requiredAdvancePercentage > 0) {
      const requiredAdvanceAmount = calculateRequiredAdvancePayment(invoiceTotal, requiredAdvancePercentage);
      
      // Używamy tolerancji 0.01 EUR (1 cent) dla porównań płatności
      if (preciseCompare(totalSettled, requiredAdvanceAmount, 0.01) >= 0) {
        paymentStatus = 'paid';
        // Znajdź najnowszą płatność jako datę płatności
        if (updatedPayments.length > 0) {
          const latestPayment = updatedPayments.reduce((latest, payment) => 
            payment.date.toDate() > latest.date.toDate() ? payment : latest
          );
          paymentDate = latestPayment.date;
        }
      } else if (totalSettled > 0) {
        paymentStatus = 'partially_paid';
      }
    } else {
      // Standardowa logika z tolerancją dla błędów precyzji
      if (preciseCompare(totalSettled, invoiceTotal, 0.01) >= 0) {
        paymentStatus = 'paid';
        // Znajdź najnowszą płatność jako datę płatności
        if (updatedPayments.length > 0) {
          const latestPayment = updatedPayments.reduce((latest, payment) => 
            payment.date.toDate() > latest.date.toDate() ? payment : latest
          );
          paymentDate = latestPayment.date;
        }
      } else if (totalSettled > 0) {
        paymentStatus = 'partially_paid';
      }
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
    
    // Oblicz przedpłaty z proform
    let advancePayments = 0;
    if (currentInvoice.proformAllocation && currentInvoice.proformAllocation.length > 0) {
      advancePayments = currentInvoice.proformAllocation.reduce((sum, allocation) => sum + (allocation.amount || 0), 0);
    } else {
      advancePayments = parseFloat(currentInvoice.settledAdvancePayments || 0);
    }
    
    // Oblicz łączną kwotę rozliczoną
    const totalSettled = totalPaid + advancePayments;
    
    // Zaktualizuj status płatności
    let paymentStatus = 'unpaid';
    let paymentDate = null;
    
    // Sprawdź czy jest wymagana przedpłata
    const requiredAdvancePercentage = currentInvoice.requiredAdvancePaymentPercentage || 0;
    if (requiredAdvancePercentage > 0) {
      const requiredAdvanceAmount = calculateRequiredAdvancePayment(invoiceTotal, requiredAdvancePercentage);
      
      // Używamy tolerancji 0.01 EUR (1 cent) dla porównań płatności
      if (preciseCompare(totalSettled, requiredAdvanceAmount, 0.01) >= 0) {
        paymentStatus = 'paid';
        // Znajdź najnowszą płatność jako datę płatności
        const latestPayment = updatedPayments.reduce((latest, payment) => 
          payment.date.toDate() > latest.date.toDate() ? payment : latest
        );
        paymentDate = latestPayment.date;
      } else if (totalSettled > 0) {
        paymentStatus = 'partially_paid';
      }
    } else {
      // Standardowa logika z tolerancją dla błędów precyzji
      if (preciseCompare(totalSettled, invoiceTotal, 0.01) >= 0) {
        paymentStatus = 'paid';
        // Znajdź najnowszą płatność jako datę płatności
        const latestPayment = updatedPayments.reduce((latest, payment) => 
          payment.date.toDate() > latest.date.toDate() ? payment : latest
        );
        paymentDate = latestPayment.date;
      } else if (totalSettled > 0) {
        paymentStatus = 'partially_paid';
      }
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
 * Automatycznie przelicza i aktualizuje status płatności faktury na podstawie płatności i alokacji proform
 * @param {string} invoiceId - ID faktury do przeliczenia statusu płatności
 * @param {string} userId - ID użytkownika wykonującego operację
 * @returns {Promise<object>} Wynik operacji z informacjami o statusie płatności
 */
export const recalculatePaymentStatus = async (invoiceId, userId) => {
  try {
    // Pobierz aktualne dane faktury
    const invoiceDoc = await getDoc(doc(db, INVOICES_COLLECTION, invoiceId));
    if (!invoiceDoc.exists()) {
      throw new Error('Faktura nie została znaleziona');
    }

    const currentInvoice = invoiceDoc.data();
    
    // Nie przeliczaj dla proform
    if (currentInvoice.isProforma) {
      return { success: true, paymentStatus: currentInvoice.paymentStatus || 'unpaid', message: 'Proforma - status nie zmieniony' };
    }

    const currentPayments = currentInvoice.payments || [];
    const invoiceTotal = parseFloat(currentInvoice.total || 0);
    
    // Oblicz całkowitą kwotę płatności
    const totalPaid = currentPayments.reduce((sum, payment) => sum + payment.amount, 0);
    
    // Oblicz przedpłaty z proform
    let advancePayments = 0;
    if (currentInvoice.proformAllocation && currentInvoice.proformAllocation.length > 0) {
      advancePayments = currentInvoice.proformAllocation.reduce((sum, allocation) => sum + (allocation.amount || 0), 0);
    } else {
      advancePayments = parseFloat(currentInvoice.settledAdvancePayments || 0);
    }
    
    // Oblicz łączną kwotę rozliczoną
    const totalSettled = totalPaid + advancePayments;
    
    // Oblicz nowy status płatności
    let newPaymentStatus = 'unpaid';
    let paymentDate = null;
    
    // Sprawdź czy jest wymagana przedpłata
    const requiredAdvancePercentage = currentInvoice.requiredAdvancePaymentPercentage || 0;
    if (requiredAdvancePercentage > 0) {
      const requiredAdvanceAmount = calculateRequiredAdvancePayment(invoiceTotal, requiredAdvancePercentage);
      
      // Jeśli wymagana jest przedpłata, uznaj za opłaconą gdy osiągnięto wymaganą kwotę z tolerancją 0.01 EUR
      if (preciseCompare(totalSettled, requiredAdvanceAmount, 0.01) >= 0) {
        newPaymentStatus = 'paid';
        // Znajdź najnowszą płatność jako datę płatności (jeśli są płatności)
        if (currentPayments.length > 0) {
          const latestPayment = currentPayments.reduce((latest, payment) => 
            payment.date.toDate() > latest.date.toDate() ? payment : latest
          );
          paymentDate = latestPayment.date;
        }
      } else if (totalSettled > 0) {
        newPaymentStatus = 'partially_paid';
      }
    } else {
      // Standardowa logika gdy nie ma wymaganej przedpłaty z tolerancją dla błędów precyzji
      if (preciseCompare(totalSettled, invoiceTotal, 0.01) >= 0) {
        newPaymentStatus = 'paid';
        // Znajdź najnowszą płatność jako datę płatności (jeśli są płatności)
        if (currentPayments.length > 0) {
          const latestPayment = currentPayments.reduce((latest, payment) => 
            payment.date.toDate() > latest.date.toDate() ? payment : latest
          );
          paymentDate = latestPayment.date;
        }
      } else if (totalSettled > 0) {
        newPaymentStatus = 'partially_paid';
      }
    }

    // Sprawdź czy status się zmienił
    const currentPaymentStatus = currentInvoice.paymentStatus || 'unpaid';
    if (currentPaymentStatus === newPaymentStatus) {
      return { 
        success: true, 
        paymentStatus: newPaymentStatus, 
        totalPaid, 
        totalSettled,
        message: 'Status płatności nie zmienił się' 
      };
    }

    // Zaktualizuj status płatności w faktury
    const updateData = {
      paymentStatus: newPaymentStatus,
      totalPaid: totalPaid,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    };

    // Dodaj datę płatności jeśli faktura jest w pełni opłacona
    if (paymentDate) {
      updateData.paymentDate = paymentDate;
    }

    await updateDoc(doc(db, INVOICES_COLLECTION, invoiceId), updateData);

    console.log(`Automatycznie zaktualizowano status płatności faktury ${invoiceId} z "${currentPaymentStatus}" na "${newPaymentStatus}"`);
    
    return { 
      success: true, 
      paymentStatus: newPaymentStatus, 
      oldPaymentStatus: currentPaymentStatus,
      totalPaid, 
      totalSettled,
      message: 'Status płatności został automatycznie zaktualizowany' 
    };
  } catch (error) {
    console.error('Błąd podczas automatycznego przeliczania statusu płatności:', error);
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
    const paid = parseFloat(proformaData.totalPaid || 0);
    const used = parseFloat(proformaData.usedAsAdvancePayment || 0);
    const requiredAdvancePaymentPercentage = parseFloat(proformaData.requiredAdvancePaymentPercentage || 0);
    
    // Sprawdź czy proforma została wystarczająco opłacona
    let isReadyForSettlement;
    let requiredPaymentAmount;
    
    if (requiredAdvancePaymentPercentage > 0) {
      // Proforma z wymaganą przedpłatą - sprawdź czy opłacono wymaganą kwotę
      requiredPaymentAmount = total * requiredAdvancePaymentPercentage / 100;
      isReadyForSettlement = paid >= requiredPaymentAmount;
    } else {
      // Proforma bez wymaganej przedpłaty - wymaga pełnego opłacenia
      requiredPaymentAmount = total;
      isReadyForSettlement = paid >= total;
    }
    
    // Oblicz maksymalną dostępną kwotę na podstawie procentu przedpłaty
    let maxAvailableAmount;
    if (requiredAdvancePaymentPercentage > 0) {
      // Ograniczenie do procentu przedpłaty
      maxAvailableAmount = (total * requiredAdvancePaymentPercentage / 100) - used;
    } else {
      // Brak ograniczenia procentowego - dostępna cała kwota
      maxAvailableAmount = total - used;
    }
    
    return {
      total,
      paid,
      used,
      requiredAdvancePaymentPercentage,
      requiredPaymentAmount,
      maxAvailableAmount: Math.max(0, maxAvailableAmount),
      available: isReadyForSettlement ? Math.max(0, maxAvailableAmount) : 0, // Kwota dostępna gdy opłacono wymaganą kwotę
      isFullyPaid: paid >= total, // Pełne opłacenie proformy
      isReadyForSettlement // Czy można użyć do rozliczenia (opłacono wymaganą kwotę)
    };
  } catch (error) {
    console.error('Błąd podczas pobierania dostępnej kwoty proformy:', error);
    throw error;
  }
};

/**
 * Pobiera wszystkie dostępne proformy dla zamówienia z ich kwotami
 */
export const getAvailableProformasForOrder = async (orderId) => {
  try {
    if (!orderId) {
      return [];
    }
    
    const invoices = await getInvoicesByOrderId(orderId);
    const proformas = invoices.filter(inv => inv.isProforma);
    
    const proformasWithAmounts = await Promise.all(
      proformas.map(async (proforma) => {
        try {
          const amountInfo = await getAvailableProformaAmount(proforma.id);
          return {
            ...proforma,
            amountInfo
          };
        } catch (error) {
          console.error(`Błąd podczas pobierania kwoty dla proformy ${proforma.id}:`, error);
          return {
            ...proforma,
            amountInfo: {
              total: parseFloat(proforma.total || 0),
              paid: parseFloat(proforma.totalPaid || 0),
              used: 0,
              available: 0, // Dla błędnych proform nie pozwalamy na użycie
              isFullyPaid: false,
              isReadyForSettlement: false
            }
          };
        }
      })
    );
    
    // Filtruj tylko opłacone proformy z dostępną kwotą
    const availableProformas = proformasWithAmounts.filter(proforma => 
      proforma.amountInfo.isReadyForSettlement && proforma.amountInfo.available > 0
    );
    
    return availableProformas;
  } catch (error) {
    console.error('Błąd podczas pobierania proform dla zamówienia:', error);
    throw error;
  }
};

/**
 * Pobiera dostępne proformy z uwzględnieniem wykluczenia konkretnej faktury
 * (używane przy edycji istniejącej faktury)
 */
export const getAvailableProformasForOrderWithExclusion = async (orderId, excludeInvoiceId = null) => {
  try {
    if (!orderId) {
      return [];
    }
    
    const invoices = await getInvoicesByOrderId(orderId);
    const proformas = invoices.filter(inv => inv.isProforma);
    
    // Pobierz dane wykluczonej faktury jeśli istnieje
    let excludedInvoiceProformUsage = [];
    if (excludeInvoiceId) {
      try {
        const excludedInvoice = await getInvoiceById(excludeInvoiceId);
        if (excludedInvoice && excludedInvoice.proformAllocation) {
          excludedInvoiceProformUsage = excludedInvoice.proformAllocation;
        }
      } catch (error) {
        console.warn('Nie udało się pobrać danych wykluczonej faktury:', error);
      }
    }
    
    const proformasWithAmounts = await Promise.all(
      proformas.map(async (proforma) => {
        try {
          const amountInfo = await getAvailableProformaAmount(proforma.id);
          
                     // Jeśli edytujemy fakturę, dodaj z powrotem kwoty już przez nią wykorzystane
           let adjustedAvailable = amountInfo.available;
           if (excludeInvoiceId && amountInfo.isReadyForSettlement) {
             const usageFromExcluded = excludedInvoiceProformUsage.find(u => u.proformaId === proforma.id);
             if (usageFromExcluded) {
               console.log(`Dodaję z powrotem kwotę ${usageFromExcluded.amount} do proformy ${proforma.number} (było dostępne: ${adjustedAvailable})`);
               adjustedAvailable += usageFromExcluded.amount;
               console.log(`Nowa dostępna kwota dla proformy ${proforma.number}: ${adjustedAvailable}`);
             }
           }
          
          return {
            ...proforma,
            amountInfo: {
              ...amountInfo,
              available: adjustedAvailable
            }
          };
        } catch (error) {
          console.error(`Błąd podczas pobierania kwoty dla proformy ${proforma.id}:`, error);
          return {
            ...proforma,
            amountInfo: {
              total: parseFloat(proforma.total || 0),
              paid: parseFloat(proforma.totalPaid || 0),
              used: 0,
              available: 0, // Dla błędnych proform nie pozwalamy na użycie
              isFullyPaid: false,
              isReadyForSettlement: false
            }
          };
        }
      })
    );
    
    // Filtruj tylko opłacone proformy z dostępną kwotą
    const availableProformas = proformasWithAmounts.filter(proforma => 
      proforma.amountInfo.isReadyForSettlement && proforma.amountInfo.available > 0
    );
    
    return availableProformas;
  } catch (error) {
    console.error('Błąd podczas pobierania proform dla zamówienia:', error);
    throw error;
  }
};

/**
 * Aktualizuje wykorzystanie wielu proform jednocześnie
 */
export const updateMultipleProformasUsage = async (proformAllocation, targetInvoiceId, userId) => {
  try {
    const results = [];
    
    for (const allocation of proformAllocation) {
      if (allocation.amount > 0) {
        try {
          const result = await updateProformaUsage(allocation.proformaId, allocation.amount, targetInvoiceId, userId);
          results.push({
            proformaId: allocation.proformaId,
            success: true,
            result
          });
        } catch (error) {
          console.error(`Błąd podczas aktualizacji proformy ${allocation.proformaId}:`, error);
          results.push({
            proformaId: allocation.proformaId,
            success: false,
            error: error.message
          });
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('Błąd podczas aktualizacji wielu proform:', error);
    throw error;
  }
};

/**
 * Usuwa wykorzystanie z wielu proform jednocześnie
 */
export const removeMultipleProformasUsage = async (proformAllocation, targetInvoiceId, userId) => {
  try {
    const results = [];
    
    for (const allocation of proformAllocation) {
      if (allocation.amount > 0) {
        try {
          await removeProformaUsage(allocation.proformaId, allocation.amount, targetInvoiceId, userId);
          results.push({
            proformaId: allocation.proformaId,
            success: true
          });
        } catch (error) {
          console.error(`Błąd podczas usuwania wykorzystania proformy ${allocation.proformaId}:`, error);
          results.push({
            proformaId: allocation.proformaId,
            success: false,
            error: error.message
          });
        }
      }
    }
    
    return results;
  } catch (error) {
    console.error('Błąd podczas usuwania wykorzystania wielu proform:', error);
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

/**
 * Oblicza zafakturowane kwoty dla pozycji zamówienia
 * @param {string} orderId - ID zamówienia
 * @param {Array} [preloadedInvoices] - Opcjonalna lista już pobranych faktur (optymalizacja)
 * @param {Object} [preloadedOrderData] - Opcjonalne dane zamówienia już pobrane (optymalizacja)
 * @returns {Promise<Object>} Obiekt z zafakturowanymi kwotami dla każdej pozycji
 */
export const getInvoicedAmountsByOrderItems = async (orderId, preloadedInvoices = null, preloadedOrderData = null) => {
  try {
    // OPTYMALIZACJA: Użyj już pobranych faktur jeśli dostępne
    const invoices = preloadedInvoices || await getInvoicesByOrderId(orderId);
    const invoicedAmounts = {};
    
    // OPTYMALIZACJA: Użyj już pobranych danych zamówienia jeśli dostępne
    let orderData = preloadedOrderData;
    if (!orderData) {
      try {
        const orderDoc = await getDoc(doc(db, 'orders', orderId));
        if (orderDoc.exists()) {
          orderData = orderDoc.data();
        }
      } catch (error) {
        console.warn('Nie można pobrać danych zamówienia dla lepszego dopasowania pozycji:', error);
      }
    }
    
    invoices.forEach((invoice, invoiceIndex) => {
      // Pomijaj proformy - nie są rzeczywistymi fakturami
      if (invoice.isProforma) {
        console.log(`[INVOICED_AMOUNTS_DEBUG] Pomijam proformę ${invoice.number} - nie wliczam do kwoty zafakturowanej`);
        return;
      }
      
      if (invoice.items && Array.isArray(invoice.items)) {
        invoice.items.forEach((invoiceItem, itemIndex) => {
          let itemId = invoiceItem.orderItemId;
          
          if (!itemId) {
            // Spróbuj dopasować pozycję do zamówienia na podstawie nazwy i ceny (BEZ ilości - pozycja może być fakturowana częściowo)
            if (orderData && orderData.items) {
              const matchingOrderItem = orderData.items.find((orderItem, orderIndex) => {
                // Dopasuj po nazwie i cenie (bez ilości - pozycja może być na wielu fakturach z różnymi ilościami)
                const nameMatch = orderItem.name === invoiceItem.name;
                const priceMatch = Math.abs(parseFloat(orderItem.price || 0) - parseFloat(invoiceItem.price || 0)) < 0.01;
                
                return nameMatch && priceMatch;
              });
              
              if (matchingOrderItem) {
                const orderIndex = orderData.items.indexOf(matchingOrderItem);
                itemId = matchingOrderItem.id || `${orderId}_item_${orderIndex}`;
                console.log(`[INVOICED_AMOUNTS_DEBUG] Dopasowano pozycję "${invoiceItem.name}" (faktura ${invoice.number}, ilość: ${invoiceItem.quantity}, cena: ${invoiceItem.price}) przez nazwę i cenę do pozycji zamówienia: ${itemId}`);
              } else {
                // Fallback - spróbuj dopasować tylko po nazwie
                const matchingByNameOnly = orderData.items.find((orderItem) => {
                  return orderItem.name === invoiceItem.name;
                });
                
                if (matchingByNameOnly) {
                  const orderIndex = orderData.items.indexOf(matchingByNameOnly);
                  itemId = matchingByNameOnly.id || `${orderId}_item_${orderIndex}`;
                  console.log(`[INVOICED_AMOUNTS_DEBUG] Dopasowano pozycję "${invoiceItem.name}" (faktura ${invoice.number}) tylko po nazwie do pozycji zamówienia: ${itemId}`);
                } else {
                  // Ostateczny fallback - używaj indeksu pozycji w fakturze
                  itemId = invoiceItem.id || `${orderId}_item_${itemIndex}`;
                  console.log(`[INVOICED_AMOUNTS_DEBUG] Nie udało się dopasować pozycji "${invoiceItem.name}" (faktura ${invoice.number}, cena: ${invoiceItem.price}), używam fallback: ${itemId}`);
                }
              }
            } else {
              itemId = invoiceItem.id || `${orderId}_item_${itemIndex}`;
              console.log(`[INVOICED_AMOUNTS_DEBUG] Brak danych zamówienia, używam fallback dla "${invoiceItem.name}": ${itemId}`);
            }
          }
          
          if (!invoicedAmounts[itemId]) {
            invoicedAmounts[itemId] = {
              totalInvoiced: 0,
              invoices: []
            };
          }
          
          const itemValue = parseFloat(invoiceItem.netValue || invoiceItem.totalPrice || 0);
          invoicedAmounts[itemId].totalInvoiced += itemValue;
          invoicedAmounts[itemId].invoices.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            itemValue: itemValue,
            quantity: parseFloat(invoiceItem.quantity || 0)
          });
        });
      }
    });
    
    return invoicedAmounts;
  } catch (error) {
    console.error('Błąd podczas obliczania zafakturowanych kwot:', error);
    return {};
  }
};

/**
 * Oblicza kwoty zaliczek (proform) dla pozycji zamówienia
 * @param {string} orderId - ID zamówienia
 * @param {Array} [preloadedInvoices] - Opcjonalna lista już pobranych faktur (optymalizacja)
 * @param {Object} [preloadedOrderData] - Opcjonalne dane zamówienia już pobrane (optymalizacja)
 * @returns {Promise<Object>} Obiekt z kwotami proform dla każdej pozycji
 */
export const getProformaAmountsByOrderItems = async (orderId, preloadedInvoices = null, preloadedOrderData = null) => {
  try {
    // OPTYMALIZACJA: Użyj już pobranych faktur jeśli dostępne
    const invoices = preloadedInvoices || await getInvoicesByOrderId(orderId);
    const proformaAmounts = {};
    
    // OPTYMALIZACJA: Użyj już pobranych danych zamówienia jeśli dostępne
    let orderData = preloadedOrderData;
    if (!orderData) {
      try {
        const orderDoc = await getDoc(doc(db, 'orders', orderId));
        if (orderDoc.exists()) {
          orderData = orderDoc.data();
        }
      } catch (error) {
        console.warn('Nie można pobrać danych zamówienia dla lepszego dopasowania pozycji:', error);
      }
    }
    
    invoices.forEach((invoice, invoiceIndex) => {
      // Uwzględniaj TYLKO proformy
      if (!invoice.isProforma) {
        console.log(`[PROFORMA_AMOUNTS_DEBUG] Pomijam fakturę ${invoice.number} - nie jest proformą`);
        return;
      }
      
      if (invoice.items && Array.isArray(invoice.items)) {
        invoice.items.forEach((invoiceItem, itemIndex) => {
          let itemId = invoiceItem.orderItemId;
          
          if (!itemId) {
            // Spróbuj dopasować pozycję do zamówienia na podstawie nazwy i ceny
            if (orderData && orderData.items) {
              const matchingOrderItem = orderData.items.find((orderItem, orderIndex) => {
                const nameMatch = orderItem.name === invoiceItem.name;
                const priceMatch = Math.abs(parseFloat(orderItem.price || 0) - parseFloat(invoiceItem.price || 0)) < 0.01;
                
                return nameMatch && priceMatch;
              });
              
              if (matchingOrderItem) {
                const orderIndex = orderData.items.indexOf(matchingOrderItem);
                itemId = matchingOrderItem.id || `${orderId}_item_${orderIndex}`;
                console.log(`[PROFORMA_AMOUNTS_DEBUG] Dopasowano pozycję "${invoiceItem.name}" (proforma ${invoice.number}, ilość: ${invoiceItem.quantity}, cena: ${invoiceItem.price}) przez nazwę i cenę do pozycji zamówienia: ${itemId}`);
              } else {
                // Fallback - spróbuj dopasować tylko po nazwie
                const matchingByNameOnly = orderData.items.find((orderItem) => {
                  return orderItem.name === invoiceItem.name;
                });
                
                if (matchingByNameOnly) {
                  const orderIndex = orderData.items.indexOf(matchingByNameOnly);
                  itemId = matchingByNameOnly.id || `${orderId}_item_${orderIndex}`;
                  console.log(`[PROFORMA_AMOUNTS_DEBUG] Dopasowano pozycję "${invoiceItem.name}" (proforma ${invoice.number}) tylko po nazwie do pozycji zamówienia: ${itemId}`);
                } else {
                  // Ostateczny fallback - używaj indeksu pozycji w fakturze
                  itemId = invoiceItem.id || `${orderId}_item_${itemIndex}`;
                  console.log(`[PROFORMA_AMOUNTS_DEBUG] Nie udało się dopasować pozycji "${invoiceItem.name}" (proforma ${invoice.number}, cena: ${invoiceItem.price}), używam fallback: ${itemId}`);
                }
              }
            } else {
              itemId = invoiceItem.id || `${orderId}_item_${itemIndex}`;
              console.log(`[PROFORMA_AMOUNTS_DEBUG] Brak danych zamówienia, używam fallback dla "${invoiceItem.name}": ${itemId}`);
            }
          }
          
          if (!proformaAmounts[itemId]) {
            proformaAmounts[itemId] = {
              totalProforma: 0,
              proformas: []
            };
          }
          
          const itemValue = parseFloat(invoiceItem.netValue || invoiceItem.totalPrice || 0);
          proformaAmounts[itemId].totalProforma += itemValue;
          proformaAmounts[itemId].proformas.push({
            proformaId: invoice.id,
            proformaNumber: invoice.number,
            itemValue: itemValue,
            quantity: parseFloat(invoiceItem.quantity || 0)
          });
        });
      }
    });
    
    return proformaAmounts;
  } catch (error) {
    console.error('Błąd podczas obliczania kwot proform:', error);
    return {};
  }
};

/**
 * Migruje istniejące faktury dodając orderItemId do pozycji
 * @param {string} orderId - ID zamówienia
 * @returns {Promise<void>}
 */
export const migrateInvoiceItemsOrderIds = async (orderId) => {
  try {
    console.log(`[MIGRATION] Rozpoczynam migrację faktur dla zamówienia ${orderId}`);
    
    // Pobierz dane zamówienia
    const orderDoc = await getDoc(doc(db, 'orders', orderId));
    if (!orderDoc.exists()) {
      throw new Error('Zamówienie nie istnieje');
    }
    const orderData = orderDoc.data();
    
    // Pobierz faktury
    const invoices = await getInvoicesByOrderId(orderId);
    
    for (const invoice of invoices) {
      // Pomijaj proformy podczas migracji
      if (invoice.isProforma) {
        console.log(`[MIGRATION] Pomijam proformę ${invoice.number} podczas migracji`);
        continue;
      }
      
      let needsUpdate = false;
      const updatedItems = invoice.items.map((invoiceItem, itemIndex) => {
        // Jeśli pozycja już ma orderItemId, nie zmieniaj jej
        if (invoiceItem.orderItemId) {
          return invoiceItem;
        }
        
        needsUpdate = true;
        
        // Spróbuj dopasować pozycję do zamówienia
        let orderItemId;
        if (orderData.items) {
          const matchingOrderItem = orderData.items.find(orderItem => {
            return orderItem.name === invoiceItem.name && 
                   parseFloat(orderItem.quantity) === parseFloat(invoiceItem.quantity);
          });
          
          if (matchingOrderItem) {
            orderItemId = matchingOrderItem.id || `${orderId}_item_${orderData.items.indexOf(matchingOrderItem)}`;
            console.log(`[MIGRATION] Dopasowano pozycję "${invoiceItem.name}" przez nazwę i ilość: ${orderItemId}`);
          } else {
            orderItemId = `${orderId}_item_${itemIndex}`;
            console.log(`[MIGRATION] Nie udało się dopasować pozycji "${invoiceItem.name}", używam fallback: ${orderItemId}`);
          }
        } else {
          orderItemId = `${orderId}_item_${itemIndex}`;
          console.log(`[MIGRATION] Brak pozycji w zamówieniu, używam fallback dla "${invoiceItem.name}": ${orderItemId}`);
        }
        
        return {
          ...invoiceItem,
          orderItemId: orderItemId
        };
      });
      
      // Aktualizuj fakturę jeśli potrzeba
      if (needsUpdate) {
        console.log(`[MIGRATION] Aktualizuję fakturę ${invoice.number} (${invoice.id})`);
        await updateDoc(doc(db, INVOICES_COLLECTION, invoice.id), {
          items: updatedItems,
          updatedAt: serverTimestamp(),
          updatedBy: 'migration_script'
        });
        console.log(`[MIGRATION] Zaktualizowano fakturę ${invoice.number}`);
      }
    }
    
    console.log(`[MIGRATION] Migracja zakończona dla zamówienia ${orderId}`);
  } catch (error) {
    console.error('Błąd podczas migracji orderItemId w fakturach:', error);
    throw error;
  }
};

/**
 * Synchronizuje numer proformy we wszystkich powiązanych fakturach
 * @param {string} proformaId - ID proformy
 * @param {string} newProformaNumber - Nowy numer proformy
 * @param {string} userId - ID użytkownika wykonującego operację
 * @returns {Promise<Object>} Wynik operacji z informacjami o zaktualizowanych fakturach
 */
export const syncProformaNumberInLinkedInvoices = async (proformaId, newProformaNumber, userId) => {
  try {
    console.log(`Rozpoczęcie synchronizacji numeru proformy ${proformaId} na "${newProformaNumber}"`);
    
    // Pobierz dane proformy aby sprawdzić linkedAdvanceInvoices
    const proformaDoc = await getDoc(doc(db, INVOICES_COLLECTION, proformaId));
    if (!proformaDoc.exists()) {
      throw new Error('Proforma nie została znaleziona');
    }
    
    const proformaData = proformaDoc.data();
    const linkedInvoiceIds = proformaData.linkedAdvanceInvoices || [];
    
    if (linkedInvoiceIds.length === 0) {
      console.log('Brak powiązanych faktur do aktualizacji');
      return {
        success: true,
        updatedInvoices: 0,
        skippedInvoices: 0,
        message: 'Brak powiązanych faktur do aktualizacji'
      };
    }
    
    console.log(`Znaleziono ${linkedInvoiceIds.length} powiązanych faktur:`, linkedInvoiceIds);
    
    let updatedCount = 0;
    let skippedCount = 0;
    const updateResults = [];
    
    // Aktualizuj każdą powiązaną fakturę
    for (const invoiceId of linkedInvoiceIds) {
      try {
        const invoiceDoc = await getDoc(doc(db, INVOICES_COLLECTION, invoiceId));
        
        if (!invoiceDoc.exists()) {
          console.warn(`Faktura ${invoiceId} nie istnieje, pomijam`);
          skippedCount++;
          updateResults.push({
            invoiceId,
            success: false,
            error: 'Faktura nie istnieje'
          });
          continue;
        }
        
        const invoiceData = invoiceDoc.data();
        const proformAllocation = invoiceData.proformAllocation || [];
        
        // Sprawdź czy ta faktura rzeczywiście używa tej proformy
        const allocationIndex = proformAllocation.findIndex(allocation => allocation.proformaId === proformaId);
        
        if (allocationIndex === -1) {
          console.warn(`Faktura ${invoiceId} nie ma alokacji dla proformy ${proformaId}, pomijam`);
          skippedCount++;
          updateResults.push({
            invoiceId,
            success: false,
            error: 'Brak alokacji dla tej proformy'
          });
          continue;
        }
        
        // Zaktualizuj numer proformy w alokacji
        const updatedAllocation = [...proformAllocation];
        const oldNumber = updatedAllocation[allocationIndex].proformaNumber;
        updatedAllocation[allocationIndex] = {
          ...updatedAllocation[allocationIndex],
          proformaNumber: newProformaNumber
        };
        
        // Zaktualizuj fakturę w bazie danych
        await updateDoc(doc(db, INVOICES_COLLECTION, invoiceId), {
          proformAllocation: updatedAllocation,
          updatedAt: serverTimestamp(),
          updatedBy: userId
        });
        
        console.log(`✅ Zaktualizowano fakturę ${invoiceData.number}: "${oldNumber}" → "${newProformaNumber}"`);
        updatedCount++;
        updateResults.push({
          invoiceId,
          invoiceNumber: invoiceData.number,
          success: true,
          oldNumber,
          newNumber: newProformaNumber
        });
        
      } catch (error) {
        console.error(`Błąd podczas aktualizacji faktury ${invoiceId}:`, error);
        skippedCount++;
        updateResults.push({
          invoiceId,
          success: false,
          error: error.message
        });
      }
    }
    
    const result = {
      success: true,
      updatedInvoices: updatedCount,
      skippedInvoices: skippedCount,
      totalInvoices: linkedInvoiceIds.length,
      updateResults,
      message: `Zaktualizowano ${updatedCount} faktur, pominięto ${skippedCount}`
    };
    
    console.log('Synchronizacja numerów proform zakończona:', result);
    return result;
    
  } catch (error) {
    console.error('Błąd podczas synchronizacji numerów proform:', error);
    throw error;
  }
};