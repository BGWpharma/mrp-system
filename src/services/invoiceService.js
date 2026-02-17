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
import { generateFSNumber, generateFPFNumber, generateFKNumber } from '../utils/numberGenerators';

const INVOICES_COLLECTION = 'invoices';
const INVOICE_ITEMS_COLLECTION = 'invoiceItems';

/**
 * Sprawdza czy obiekt jest specjalnym obiektem Firestore (FieldValue, serverTimestamp itp.)
 */
const isFirestoreFieldValue = (value) => {
  if (!value || typeof value !== 'object') return false;
  // FieldValue objects (jak serverTimestamp()) mają _methodName
  if (value._methodName !== undefined) return true;
  // Sprawdź też po nazwie konstruktora
  const constructorName = value.constructor?.name || '';
  if (constructorName.includes('FieldValue') || constructorName.includes('Sentinel')) return true;
  return false;
};

/**
 * Funkcja pomocnicza do usuwania wartości undefined z obiektu
 * Firestore nie akceptuje undefined - muszą być zamienione na null lub usunięte
 */
const removeUndefinedValues = (obj) => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefinedValues(item));
  }
  
  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) {
      // Zamień undefined na null (lub pomiń - tutaj zamieniamy na null dla zachowania struktury)
      cleaned[key] = null;
    } else if (
      value !== null && 
      typeof value === 'object' && 
      !(value instanceof Timestamp) && 
      !(value instanceof Date) &&
      !isFirestoreFieldValue(value)  // Nie przetwarzaj FieldValue (serverTimestamp itp.)
    ) {
      // Rekurencyjnie czyść zagnieżdżone obiekty (ale nie Timestamp, Date ani FieldValue)
      cleaned[key] = removeUndefinedValues(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
};

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
        issueDate: data.issueDate && typeof data.issueDate.toDate === 'function' ? data.issueDate.toDate() : data.issueDate,
        dueDate: data.dueDate && typeof data.dueDate.toDate === 'function' ? data.dueDate.toDate() : data.dueDate,
        paymentDate: data.paymentDate && typeof data.paymentDate.toDate === 'function' ? data.paymentDate.toDate() : data.paymentDate,
        createdAt: data.createdAt && typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate() : data.createdAt,
        updatedAt: data.updatedAt && typeof data.updatedAt.toDate === 'function' ? data.updatedAt.toDate() : data.updatedAt
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
      issueDate: data.issueDate && typeof data.issueDate.toDate === 'function' ? data.issueDate.toDate() : data.issueDate,
      dueDate: data.dueDate && typeof data.dueDate.toDate === 'function' ? data.dueDate.toDate() : data.dueDate,
      paymentDate: data.paymentDate && typeof data.paymentDate.toDate === 'function' ? data.paymentDate.toDate() : data.paymentDate,
      createdAt: data.createdAt && typeof data.createdAt.toDate === 'function' ? data.createdAt.toDate() : data.createdAt,
      updatedAt: data.updatedAt && typeof data.updatedAt.toDate === 'function' ? data.updatedAt.toDate() : data.updatedAt
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
      invoiceData.number = await generateInvoiceNumber(invoiceData.isProforma, invoiceData.isCorrectionInvoice);
    }
    
    // Walidacja danych faktury (teraz już z numerem)
    await validateInvoiceData(invoiceData);
    
    // POPRAWKA: Walidacja dostępności proform PRZED zapisem faktury
    // Zapobiega podwójnemu użyciu tej samej proformy przez różne faktury
    if (!invoiceData.isProforma && invoiceData.proformAllocation && invoiceData.proformAllocation.length > 0) {
      // Walidacja dostępności proform przed zapisem...
      const validationResult = await validateProformaAllocationsBeforeSave(invoiceData.proformAllocation, null);
      
      if (!validationResult.valid) {
        const errorMessages = validationResult.errors.map(e => e.message).join('; ');
        console.error(`[createInvoice] ❌ Walidacja proform nie powiodła się:`, validationResult.errors);
        throw new Error(`Walidacja proform nie powiodła się: ${errorMessages}`);
      }
      // Walidacja proform zakończona pomyślnie
    }
    
    // Upewnij się, że mamy właściwe dane o zaliczkach/przedpłatach
    const linkedPurchaseOrders = invoiceData.linkedPurchaseOrders || [];
    const settledAdvancePayments = parseFloat(invoiceData.settledAdvancePayments || 0);
    
    const newInvoice = {
      ...invoiceData,
      linkedPurchaseOrders: linkedPurchaseOrders,
      settledAdvancePayments: settledAdvancePayments,
      isRefInvoice: invoiceData.isRefInvoice || false,
      // Pola dla faktury korygującej - ustaw domyślne wartości jeśli undefined
      isCorrectionInvoice: invoiceData.isCorrectionInvoice || false,
      correctedInvoices: invoiceData.correctedInvoices || [],
      correctionReason: invoiceData.correctionReason || '',
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
    
    // Usuń wartości undefined - Firestore nie akceptuje undefined
    const sanitizedInvoice = removeUndefinedValues(newInvoice);
    
    const docRef = await addDoc(collection(db, INVOICES_COLLECTION), sanitizedInvoice);
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
    
    // Jeśli tworzymy fakturę ze statusem 'issued' (lub wyższym), wygeneruj PDF od razu
    if (['issued', 'paid', 'partially_paid', 'overdue'].includes(invoiceData.status)) {
      try {
        console.log(`[createInvoice] Generowanie PDF dla nowej faktury o statusie ${invoiceData.status}...`);
        const pdfInfo = await generateAndSaveInvoicePdf(newInvoiceId, userId);
        if (pdfInfo) {
          await updateDoc(doc(db, INVOICES_COLLECTION, newInvoiceId), {
            pdfAttachment: pdfInfo,
            updatedAt: serverTimestamp()
          });
          console.log(`[createInvoice] PDF wygenerowany i przypisany do nowej faktury: ${newInvoiceId}`);
        }
      } catch (pdfError) {
        console.error('[createInvoice] Błąd podczas generowania PDF dla nowej faktury:', pdfError);
        // Nie przerywamy procesu tworzenia faktury z powodu błędu PDF
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
  
  // Zastosuj rabat globalny
  const globalDiscount = parseFloat(orderData.globalDiscount) || 0;
  const discountMultiplier = (100 - globalDiscount) / 100;
  const valueAfterDiscount = itemTotalValue * discountMultiplier;
  
  // Koszt pojedynczej sztuki
  const quantity = parseFloat(item.quantity) || 1;
  const unitCost = valueAfterDiscount / quantity;
  
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
      const mappedItems = mapItemsWithProductionCosts(orderData.items, isProformaInvoice);
      
      // Mapowanie dodatkowych kosztów z PO jako pozycje faktury
      const mappedAdditionalCostsItems = [];
      if (orderData.additionalCostsItems && Array.isArray(orderData.additionalCostsItems)) {
        orderData.additionalCostsItems.forEach((cost, index) => {
          const costValue = parseFloat(cost.value) || 0;
          const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
          
          if (costValue > 0) {
            mappedAdditionalCostsItems.push({
              id: cost.id || `additional-cost-${index}`,
              name: cost.description || `Dodatkowy koszt ${index + 1}`,
              description: '', // Opis pozostaje pusty dla dodatkowych kosztów
              quantity: 1,
              unit: 'szt.',
              price: costValue,
              netValue: costValue,
              totalPrice: costValue,
              vat: vatRate,
              cnCode: '',
              isAdditionalCost: true, // Flaga identyfikująca dodatkowe koszty
              originalCostId: cost.id
            });
            console.log(`[createInvoiceFromOrder] Dodatkowy koszt jako pozycja faktury: ${cost.description || `Koszt ${index + 1}`}, wartość: ${costValue}, VAT: ${vatRate}%`);
          }
        });
      } else if (orderData.additionalCosts && parseFloat(orderData.additionalCosts) > 0) {
        // Dla wstecznej kompatybilności - stary format
        const costValue = parseFloat(orderData.additionalCosts) || 0;
        mappedAdditionalCostsItems.push({
          id: 'additional-cost-legacy',
          name: 'Dodatkowe koszty',
          description: '', // Opis pozostaje pusty dla dodatkowych kosztów
          quantity: 1,
          unit: 'szt.',
          price: costValue,
          netValue: costValue,
          totalPrice: costValue,
          vat: 0,
          cnCode: '',
          isAdditionalCost: true
        });
      }
      
      // Połącz pozycje produktów z pozycjami dodatkowych kosztów
      basicInvoiceData.items = [...mappedItems, ...mappedAdditionalCostsItems];
      
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
    
    // POPRAWKA: Walidacja dostępności proform PRZED zapisem faktury
    // Przy edycji wykluczamy bieżącą fakturę z obliczeń wykorzystania
    if (!invoiceData.isProforma && invoiceData.proformAllocation && invoiceData.proformAllocation.length > 0) {
      // Walidacja dostępności proform przed zapisem...
      const validationResult = await validateProformaAllocationsBeforeSave(invoiceData.proformAllocation, invoiceId);
      
      if (!validationResult.valid) {
        const errorMessages = validationResult.errors.map(e => e.message).join('; ');
        console.error(`[updateInvoice] ❌ Walidacja proform nie powiodła się:`, validationResult.errors);
        throw new Error(`Walidacja proform nie powiodła się: ${errorMessages}`);
      }
      // Walidacja proform zakończona pomyślnie
    }
    
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
    
    // Usuń wartości undefined - Firestore nie akceptuje undefined
    const sanitizedInvoice = removeUndefinedValues(updatedInvoice);
    
    await updateDoc(doc(db, INVOICES_COLLECTION, invoiceId), sanitizedInvoice);
    
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
  const isCorrectionInvoice = invoiceData.isCorrectionInvoice === true;
  
  invoiceData.items.forEach((item, index) => {
    if (!item.name) {
      throw new Error(`Nazwa pozycji ${index + 1} jest wymagana`);
    }
    
    if (isNaN(item.quantity) || item.quantity <= 0) {
      throw new Error(`Ilość pozycji ${index + 1} jest nieprawidłowa`);
    }
    
    // Dla faktury korygującej dozwolone są ujemne ceny (korekta w dół)
    if (isNaN(item.price)) {
      throw new Error(`Cena pozycji ${index + 1} jest nieprawidłowa`);
    }
    
    // Tylko dla zwykłych faktur - cena musi być >= 0
    if (!isCorrectionInvoice && item.price < 0) {
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
 * Format: FPF/kolejny numer/MM/RRRR lub FS/kolejny numer/MM/RRRR lub FK/kolejny numer/MM/RRRR
 * Numeracja odnawia się co miesiąc
 * Używa systemu liczników z numberGenerators.js
 * @param {boolean} isProforma - Czy to faktura proforma
 * @param {boolean} isCorrectionInvoice - Czy to faktura korygująca
 */
export const generateInvoiceNumber = async (isProforma = false, isCorrectionInvoice = false) => {
  try {
    if (isCorrectionInvoice) {
      return await generateFKNumber();
    } else if (isProforma) {
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
  // Pola dla przeliczenia na PLN (zgodnie z Art. 31a - kurs z dnia poprzedzającego)
  totalInPLN: null, // Kwota faktury przeliczona na PLN
  exchangeRate: null, // Kurs wymiany użyty do przeliczenia
  exchangeRateDate: null, // Data kursu wymiany (dzień poprzedzający datę wystawienia)
  exchangeRateSource: null, // Źródło kursu: 'nbp', 'ecb', 'manual'
  // Pola z przeliczonymi kwotami dla aplikacji księgowej
  itemsInPLN: null, // Pozycje faktury z cenami w PLN [{...item, unitPricePLN, totalPricePLN}]
  additionalCostsItemsInPLN: null, // Koszty dodatkowe z wartościami w PLN [{...cost, valuePLN}]
  settledAdvancePaymentsInPLN: null, // Zaliczki przeliczone na PLN
  shippingInfoInPLN: null, // Informacje o wysyłce z kosztem w PLN {costPLN}
  selectedBankAccount: '',
  notes: '',
  status: 'draft',
  billingAddress: '',
  shippingAddress: '',
  invoiceType: 'standard',
  isProforma: false,
  isRefInvoice: false,
  // Pola dla faktury korygującej
  isCorrectionInvoice: false,
  correctedInvoices: [], // [{invoiceId, invoiceNumber}]
  correctionReason: '',
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
    
    // Oblicz pozostałą kwotę do zapłaty (może być ujemna dla faktur korygujących)
    const remainingToPay = invoiceTotal - totalSettled;
    
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
      // Standardowa logika gdy nie ma wymaganej przedpłaty
      // Używamy wartości bezwzględnej pozostałej kwoty dla poprawnej obsługi faktur korygujących (ujemnych)
      if (Math.abs(remainingToPay) <= 0.01) {
        // Faktura jest w pełni rozliczona (różnica bliska zeru)
        newPaymentStatus = 'paid';
        // Znajdź najnowszą płatność jako datę płatności (jeśli są płatności)
        if (currentPayments.length > 0) {
          const latestPayment = currentPayments.reduce((latest, payment) => 
            payment.date.toDate() > latest.date.toDate() ? payment : latest
          );
          paymentDate = latestPayment.date;
        }
      } else if (invoiceTotal > 0 && totalSettled > 0) {
        // Standardowa faktura częściowo opłacona
        newPaymentStatus = 'partially_paid';
      } else if (invoiceTotal < 0 && totalSettled < 0) {
        // Faktura korygująca (ujemna) częściowo rozliczona (częściowy zwrot)
        newPaymentStatus = 'partially_paid';
      }
      // W przeciwnym razie pozostaje 'unpaid'
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
 * Oblicza dynamicznie wykorzystaną kwotę z proformy na podstawie proformAllocation w fakturach
 * @param {string} proformaId - ID proformy
 * @param {string|null} excludeInvoiceId - ID faktury do wykluczenia z obliczeń (przy edycji)
 * @returns {Promise<number>} - Kwota już wykorzystana z proformy
 */
export const calculateDynamicProformaUsage = async (proformaId, excludeInvoiceId = null) => {
  let used = 0;
  
  const invoicesQuery = query(
    collection(db, INVOICES_COLLECTION),
    where('isProforma', '==', false)
  );
  const querySnapshot = await getDocs(invoicesQuery);
  
  querySnapshot.forEach((docSnap) => {
    // Pomiń wykluczaną fakturę (przy edycji)
    if (excludeInvoiceId && docSnap.id === excludeInvoiceId) {
      return;
    }
    
    const invoiceData = docSnap.data();
    
    // Sprawdź proformAllocation (nowy system)
    if (invoiceData.proformAllocation && Array.isArray(invoiceData.proformAllocation)) {
      const allocation = invoiceData.proformAllocation.find(
        alloc => alloc.proformaId === proformaId
      );
      if (allocation && allocation.amount > 0) {
        used += parseFloat(allocation.amount);
      }
    }
    // COMPATIBILITY: Sprawdź też stary system selectedProformaId
    else if (invoiceData.selectedProformaId === proformaId && invoiceData.settledAdvancePayments > 0) {
      used += parseFloat(invoiceData.settledAdvancePayments);
    }
  });
  
  return used;
};

/**
 * Waliduje dostępność proform przed zapisem faktury
 * Sprawdza dynamicznie aktualne wykorzystanie każdej proformy
 * @param {Array} proformAllocation - Tablica alokacji proform [{proformaId, amount, proformaNumber}]
 * @param {string|null} excludeInvoiceId - ID faktury do wykluczenia (przy edycji)
 * @returns {Promise<{valid: boolean, errors: Array}>}
 */
export const validateProformaAllocationsBeforeSave = async (proformAllocation, excludeInvoiceId = null) => {
  if (!proformAllocation || proformAllocation.length === 0) {
    return { valid: true, errors: [] };
  }
  
  const errors = [];
  
  for (const allocation of proformAllocation) {
    if (!allocation.proformaId || allocation.amount <= 0) {
      continue;
    }
    
    try {
      // Pobierz dane proformy
      const proformaDoc = await getDoc(doc(db, INVOICES_COLLECTION, allocation.proformaId));
      
      if (!proformaDoc.exists()) {
        errors.push({
          proformaId: allocation.proformaId,
          proformaNumber: allocation.proformaNumber,
          message: `Proforma ${allocation.proformaNumber} nie została znaleziona`
        });
        continue;
      }
      
      const proformaData = proformaDoc.data();
      const proformaTotal = parseFloat(proformaData.total || 0);
      const proformaPaid = parseFloat(proformaData.totalPaid || 0);
      const requiredAdvancePaymentPercentage = parseFloat(proformaData.requiredAdvancePaymentPercentage || 0);
      
      // Oblicz dynamicznie aktualne wykorzystanie (z wykluczeniem edytowanej faktury)
      const currentUsed = await calculateDynamicProformaUsage(allocation.proformaId, excludeInvoiceId);
      
      // Oblicz maksymalną dostępną kwotę
      let maxAvailableAmount;
      if (requiredAdvancePaymentPercentage > 0) {
        maxAvailableAmount = (proformaTotal * requiredAdvancePaymentPercentage / 100) - currentUsed;
      } else {
        maxAvailableAmount = proformaTotal - currentUsed;
      }
      maxAvailableAmount = Math.max(0, maxAvailableAmount);
      
      // Sprawdź czy proforma została wystarczająco opłacona
      let requiredPaymentAmount = requiredAdvancePaymentPercentage > 0 
        ? proformaTotal * requiredAdvancePaymentPercentage / 100 
        : proformaTotal;
      
      const isReadyForSettlement = preciseCompare(proformaPaid, requiredPaymentAmount, 0.01) >= 0;
      
      if (!isReadyForSettlement) {
        errors.push({
          proformaId: allocation.proformaId,
          proformaNumber: allocation.proformaNumber,
          message: `Proforma ${allocation.proformaNumber} nie została wystarczająco opłacona (wymagane: ${requiredPaymentAmount.toFixed(2)}, opłacono: ${proformaPaid.toFixed(2)})`
        });
        continue;
      }
      
      // Sprawdź czy żądana kwota nie przekracza dostępnej
      if (preciseCompare(allocation.amount, maxAvailableAmount, 0.01) > 0) {
        errors.push({
          proformaId: allocation.proformaId,
          proformaNumber: allocation.proformaNumber,
          requestedAmount: allocation.amount,
          availableAmount: maxAvailableAmount,
          message: `Kwota ${allocation.amount.toFixed(2)} przekracza dostępną kwotę proformy ${allocation.proformaNumber} (dostępne: ${maxAvailableAmount.toFixed(2)}, już wykorzystano: ${currentUsed.toFixed(2)})`
        });
      }
      
      console.log(`[validateProformaAllocationsBeforeSave] Proforma ${proformaData.number}: ` +
        `total=${proformaTotal.toFixed(2)}, currentUsed=${currentUsed.toFixed(2)}, ` +
        `available=${maxAvailableAmount.toFixed(2)}, requested=${allocation.amount.toFixed(2)}`);
        
    } catch (error) {
      errors.push({
        proformaId: allocation.proformaId,
        proformaNumber: allocation.proformaNumber,
        message: `Błąd podczas walidacji proformy: ${error.message}`
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Aktualizuje wykorzystanie kwoty z proformy
 * POPRAWKA: Używa dynamicznego obliczania wykorzystania zamiast pola usedAsAdvancePayment
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
    
    const proformaTotal = parseFloat(proformaData.total || 0);
    const requiredAdvancePaymentPercentage = parseFloat(proformaData.requiredAdvancePaymentPercentage || 0);
    
    // POPRAWKA: Oblicz dynamicznie aktualne wykorzystanie z faktur w bazie
    // Wykluczamy targetInvoiceId, bo ta faktura może być właśnie zapisywana
    const currentUsed = await calculateDynamicProformaUsage(proformaId, targetInvoiceId);
    const newUsed = currentUsed + parseFloat(usedAmount);
    
    // Oblicz maksymalny limit
    let maxLimit;
    if (requiredAdvancePaymentPercentage > 0) {
      maxLimit = proformaTotal * requiredAdvancePaymentPercentage / 100;
    } else {
      maxLimit = proformaTotal;
    }
    
    console.log(`[updateProformaUsage] Proforma ${proformaData.number}: ` +
      `dynamicCurrentUsed=${currentUsed.toFixed(2)}, adding=${parseFloat(usedAmount).toFixed(2)}, ` +
      `newUsed=${newUsed.toFixed(2)}, maxLimit=${maxLimit.toFixed(2)}`);
    
    // Sprawdź czy nie przekraczamy limitu proformy (z tolerancją dla zaokrągleń)
    if (preciseCompare(newUsed, maxLimit, 0.01) > 0) {
      const availableAmount = Math.max(0, maxLimit - currentUsed).toFixed(2);
      console.error(`[updateProformaUsage] ❌ Przekroczono limit proformy ${proformaData.number}: ` +
        `próba dodania ${usedAmount}, dostępne ${availableAmount}`);
      throw new Error(`Nie można rozliczyć ${usedAmount}. Dostępna kwota do rozliczenia: ${availableAmount}`);
    }
    
    const linkedInvoices = proformaData.linkedAdvanceInvoices || [];
    
    // Zaktualizuj również pole usedAsAdvancePayment dla zachowania kompatybilności
    await updateDoc(proformaRef, {
      usedAsAdvancePayment: newUsed,
      linkedAdvanceInvoices: [...linkedInvoices, targetInvoiceId],
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    console.log(`[updateProformaUsage] ✅ Zaktualizowano proformę ${proformaData.number}, pozostało: ${(maxLimit - newUsed).toFixed(2)}`);
    
    return { success: true, remainingAmount: maxLimit - newUsed };
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
    
    // DODAJ LOG
    console.log(`[removeProformaUsage] Proforma ${proformaData.number}: currentUsed=${currentUsed.toFixed(2)}, removing=${parseFloat(usedAmount).toFixed(2)}, newUsed=${newUsed.toFixed(2)}`);
    
    await updateDoc(proformaRef, {
      usedAsAdvancePayment: newUsed,
      linkedAdvanceInvoices: linkedInvoices,
      updatedAt: serverTimestamp(),
      updatedBy: userId
    });
    
    console.log(`[removeProformaUsage] ✅ Usunięto wykorzystanie z proformy ${proformaData.number}`);
    
    return { success: true };
  } catch (error) {
    console.error('Błąd podczas usuwania wykorzystania proformy:', error);
    throw error;
  }
};

/**
 * Pobiera dostępną kwotę do rozliczenia z proformy
 * UWAGA: Wykorzystana kwota jest obliczana dynamicznie na podstawie proformAllocation w fakturach,
 * a nie z pola usedAsAdvancePayment w proformie, które może być niezsynchronizowane.
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
    
    // Użyj centralnej funkcji do dynamicznego obliczania wykorzystania
    let used = 0;
    try {
      used = await calculateDynamicProformaUsage(proformaId, null);
      // Logowanie dynamicznego użycia proformy zostało usunięte
    } catch (queryError) {
      console.warn('[getAvailableProformaAmount] Błąd podczas dynamicznego obliczania used, fallback do usedAsAdvancePayment:', queryError);
      used = parseFloat(proformaData.usedAsAdvancePayment || 0);
    }
    
    const requiredAdvancePaymentPercentage = parseFloat(proformaData.requiredAdvancePaymentPercentage || 0);
    
    // Sprawdź czy proforma została wystarczająco opłacona
    let isReadyForSettlement;
    let requiredPaymentAmount;
    
    if (requiredAdvancePaymentPercentage > 0) {
      // Proforma z wymaganą przedpłatą - sprawdź czy opłacono wymaganą kwotę
      requiredPaymentAmount = total * requiredAdvancePaymentPercentage / 100;
      // Używamy tolerancji 0.01 EUR (1 cent) dla porównań płatności
      isReadyForSettlement = preciseCompare(paid, requiredPaymentAmount, 0.01) >= 0;
    } else {
      // Proforma bez wymaganej przedpłaty - wymaga pełnego opłacenia
      requiredPaymentAmount = total;
      // Używamy tolerancji 0.01 EUR (1 cent) dla porównań płatności
      isReadyForSettlement = preciseCompare(paid, total, 0.01) >= 0;
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
      isFullyPaid: preciseCompare(paid, total, 0.01) >= 0, // Pełne opłacenie proformy (z tolerancją 1 cent)
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
    
    // Filtruj tylko opłacone proformy z dostępną kwotą (tolerancja 0.001 EUR dla błędów precyzji)
    const availableProformas = proformasWithAmounts.filter(proforma => 
      proforma.amountInfo.isReadyForSettlement && proforma.amountInfo.available > 0.001
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
    console.log(`[getAvailableProformasForOrderWithExclusion] WYWOŁANIE dla zamówienia: ${orderId}, exclude: ${excludeInvoiceId || 'brak'}`);
    console.trace('[getAvailableProformasForOrderWithExclusion] Call stack:'); // Pokaż skąd funkcja jest wywoływana
    
    if (!orderId) {
      return [];
    }
    
    const invoices = await getInvoicesByOrderId(orderId);
    const proformas = invoices.filter(inv => inv.isProforma);
    console.log(`[getAvailableProformasForOrderWithExclusion] Znaleziono ${proformas.length} proform dla zamówienia`);
    
    // Pobierz dane wykluczonej faktury jeśli istnieje
    let excludedInvoiceProformUsage = [];
    if (excludeInvoiceId) {
      try {
        const excludedInvoice = await getInvoiceById(excludeInvoiceId);
        if (excludedInvoice && excludedInvoice.proformAllocation) {
          excludedInvoiceProformUsage = excludedInvoice.proformAllocation;
          console.log(`[getAvailableProformasForOrderWithExclusion] Wykluczona faktura ma ${excludedInvoiceProformUsage.length} alokacji proform`);
        }
      } catch (error) {
        console.warn('[getAvailableProformasForOrderWithExclusion] Nie udało się pobrać danych wykluczonej faktury:', error);
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
    
    // Filtruj tylko opłacone proformy z dostępną kwotą (tolerancja 0.001 EUR dla błędów precyzji)
    const availableProformas = proformasWithAmounts.filter(proforma => 
      proforma.amountInfo.isReadyForSettlement && proforma.amountInfo.available > 0.001
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
    console.log(`[updateMultipleProformasUsage] Rozpoczynam aktualizację ${proformAllocation.length} proform dla faktury ${targetInvoiceId}`);
    const results = [];
    
    for (const allocation of proformAllocation) {
      if (allocation.amount > 0) {
        console.log(`[updateMultipleProformasUsage] Przetwarzam: ${allocation.proformaNumber} - kwota ${allocation.amount.toFixed(2)}`);
        try {
          const result = await updateProformaUsage(allocation.proformaId, allocation.amount, targetInvoiceId, userId);
          results.push({
            proformaId: allocation.proformaId,
            success: true,
            result
          });
        } catch (error) {
          console.error(`[updateMultipleProformasUsage] ❌ Błąd podczas aktualizacji proformy ${allocation.proformaNumber}:`, error);
          results.push({
            proformaId: allocation.proformaId,
            success: false,
            error: error.message
          });
        }
      }
    }
    
    console.log(`[updateMultipleProformasUsage] ✅ Zakończono aktualizację proform. Sukces: ${results.filter(r => r.success).length}/${results.length}`);
    return results;
  } catch (error) {
    console.error('[updateMultipleProformasUsage] Błąd podczas aktualizacji wielu proform:', error);
    throw error;
  }
};

/**
 * Usuwa wykorzystanie z wielu proform jednocześnie
 */
export const removeMultipleProformasUsage = async (proformAllocation, targetInvoiceId, userId) => {
  try {
    console.log(`[removeMultipleProformasUsage] Rozpoczynam usuwanie wykorzystania ${proformAllocation.length} proform dla faktury ${targetInvoiceId}`);
    const results = [];
    
    for (const allocation of proformAllocation) {
      if (allocation.amount > 0) {
        console.log(`[removeMultipleProformasUsage] Przetwarzam: ${allocation.proformaNumber} - kwota ${allocation.amount.toFixed(2)}`);
        try {
          await removeProformaUsage(allocation.proformaId, allocation.amount, targetInvoiceId, userId);
          results.push({
            proformaId: allocation.proformaId,
            success: true
          });
        } catch (error) {
          console.error(`[removeMultipleProformasUsage] ❌ Błąd podczas usuwania wykorzystania proformy ${allocation.proformaNumber}:`, error);
          results.push({
            proformaId: allocation.proformaId,
            success: false,
            error: error.message
          });
        }
      }
    }
    
    console.log(`[removeMultipleProformasUsage] ✅ Zakończono usuwanie wykorzystania proform. Sukces: ${results.filter(r => r.success).length}/${results.length}`);
    return results;
  } catch (error) {
    console.error('[removeMultipleProformasUsage] Błąd podczas usuwania wykorzystania wielu proform:', error);
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
    
    // Konwertuj daty Timestamp na obiekty Date (z zabezpieczeniem)
    return payments.map(payment => ({
      ...payment,
      date: payment.date && typeof payment.date.toDate === 'function' ? payment.date.toDate() : payment.date,
      createdAt: payment.createdAt && typeof payment.createdAt.toDate === 'function' ? payment.createdAt.toDate() : payment.createdAt,
      updatedAt: payment.updatedAt && typeof payment.updatedAt.toDate === 'function' ? payment.updatedAt.toDate() : payment.updatedAt
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
              } else {
                // Fallback - spróbuj dopasować tylko po nazwie
                const matchingByNameOnly = orderData.items.find((orderItem) => {
                  return orderItem.name === invoiceItem.name;
                });
                
                if (matchingByNameOnly) {
                  const orderIndex = orderData.items.indexOf(matchingByNameOnly);
                  itemId = matchingByNameOnly.id || `${orderId}_item_${orderIndex}`;
                } else {
                  // Ostateczny fallback - używaj indeksu pozycji w fakturze
                  itemId = invoiceItem.id || `${orderId}_item_${itemIndex}`;
                }
              }
            } else {
              itemId = invoiceItem.id || `${orderId}_item_${itemIndex}`;
            }
          }
          
          if (!invoicedAmounts[itemId]) {
            invoicedAmounts[itemId] = {
              totalInvoiced: 0,
              invoices: []
            };
          }
          
          // Fallback: jeśli brak netValue i totalPrice, oblicz z price * quantity
          const itemValue = parseFloat(
            invoiceItem.netValue || 
            invoiceItem.totalPrice || 
            ((parseFloat(invoiceItem.price || 0) * parseFloat(invoiceItem.quantity || 0)))
          );
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
 * Oblicza kwoty refakturowane dla pozycji i dodatkowych kosztów zamówienia zakupowego
 * @param {string} purchaseOrderId - ID zamówienia zakupowego
 * @param {Array} [preloadedInvoices] - Opcjonalna lista już pobranych faktur
 * @param {Object} [preloadedPOData] - Opcjonalne dane PO już pobrane
 * @returns {Promise<Object>} Obiekt z kwotami refakturowanymi dla pozycji i kosztów
 */
export const getReinvoicedAmountsByPOItems = async (purchaseOrderId, preloadedInvoices = null, preloadedPOData = null) => {
  try {
    // Pobierz refaktury dla tego PO
    let invoices = preloadedInvoices;
    if (!invoices) {
      invoices = await getInvoicesByOrderId(purchaseOrderId);
    }
    
    // Filtruj tylko refaktury (nie proformy, nie korekty)
    const refInvoices = invoices.filter(inv => inv.isRefInvoice === true && !inv.isProforma);
    
    // Pobierz dane PO jeśli nie przekazano
    let poData = preloadedPOData;
    if (!poData) {
      const poDoc = await getDoc(doc(db, 'purchaseOrders', purchaseOrderId));
      poData = poDoc.exists() ? poDoc.data() : null;
    }
    
    const reinvoicedAmounts = {
      items: {},           // Pozycje produktów
      additionalCosts: {}  // Dodatkowe koszty
    };
    
    refInvoices.forEach((invoice) => {
      if (!invoice.items || !Array.isArray(invoice.items)) return;
      
      invoice.items.forEach((invoiceItem) => {
        // Fallback: jeśli brak netValue i totalPrice, oblicz z price * quantity
        const itemValue = parseFloat(
          invoiceItem.netValue || 
          invoiceItem.totalPrice || 
          ((parseFloat(invoiceItem.price || 0) * parseFloat(invoiceItem.quantity || 0)))
        );
        const quantity = parseFloat(invoiceItem.quantity || 0);
        
        if (invoiceItem.isAdditionalCost) {
          // To jest dodatkowy koszt
          const costId = invoiceItem.originalCostId || invoiceItem.id;
          
          if (!reinvoicedAmounts.additionalCosts[costId]) {
            reinvoicedAmounts.additionalCosts[costId] = {
              totalReinvoiced: 0,
              invoices: []
            };
          }
          
          reinvoicedAmounts.additionalCosts[costId].totalReinvoiced += itemValue;
          reinvoicedAmounts.additionalCosts[costId].invoices.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            itemValue: itemValue,
            quantity: quantity,
            customerId: invoice.customer?.id,
            customerName: invoice.customer?.name
          });
        } else {
          // To jest pozycja produktu
          let itemId = invoiceItem.orderItemId || invoiceItem.id;
          
          // Próba dopasowania po nazwie jeśli brak ID
          if (!itemId && poData && poData.items) {
            const matchingItem = poData.items.find(poItem => 
              poItem.name === invoiceItem.name
            );
            if (matchingItem) {
              itemId = matchingItem.id;
            }
          }
          
          if (!itemId) return;
          
          if (!reinvoicedAmounts.items[itemId]) {
            reinvoicedAmounts.items[itemId] = {
              totalReinvoiced: 0,
              invoices: []
            };
          }
          
          reinvoicedAmounts.items[itemId].totalReinvoiced += itemValue;
          reinvoicedAmounts.items[itemId].invoices.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            itemValue: itemValue,
            quantity: quantity,
            customerId: invoice.customer?.id,
            customerName: invoice.customer?.name
          });
        }
      });
    });
    
    return reinvoicedAmounts;
  } catch (error) {
    console.error('Błąd podczas obliczania refakturowanych kwot:', error);
    return { items: {}, additionalCosts: {} };
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
              } else {
                // Fallback - spróbuj dopasować tylko po nazwie
                const matchingByNameOnly = orderData.items.find((orderItem) => {
                  return orderItem.name === invoiceItem.name;
                });
                
                if (matchingByNameOnly) {
                  const orderIndex = orderData.items.indexOf(matchingByNameOnly);
                  itemId = matchingByNameOnly.id || `${orderId}_item_${orderIndex}`;
                } else {
                  // Ostateczny fallback - używaj indeksu pozycji w fakturze
                  itemId = invoiceItem.id || `${orderId}_item_${itemIndex}`;
                }
              }
            } else {
              itemId = invoiceItem.id || `${orderId}_item_${itemIndex}`;
            }
          }
          
          if (!proformaAmounts[itemId]) {
            proformaAmounts[itemId] = {
              totalProforma: 0,
              proformas: []
            };
          }
          
          // Fallback: jeśli brak netValue i totalPrice, oblicz z price * quantity
          const itemValue = parseFloat(
            invoiceItem.netValue || 
            invoiceItem.totalPrice || 
            ((parseFloat(invoiceItem.price || 0) * parseFloat(invoiceItem.quantity || 0)))
          );
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
    
    // Batch fetch powiązanych faktur zamiast N+1 getDoc
    const invoiceDataMap = {};
    const invoiceChunks = [];
    for (let i = 0; i < linkedInvoiceIds.length; i += 30) {
      invoiceChunks.push(linkedInvoiceIds.slice(i, i + 30));
    }
    const invoiceFetchResults = await Promise.all(
      invoiceChunks.map(chunk => {
        const q = query(collection(db, INVOICES_COLLECTION), where('__name__', 'in', chunk));
        return getDocs(q);
      })
    );
    invoiceFetchResults.forEach(snap => {
      snap.docs.forEach(d => { invoiceDataMap[d.id] = d.data(); });
    });
    
    // Sekwencyjna aktualizacja (updateDoc musi pozostać sekwencyjny)
    for (const invoiceId of linkedInvoiceIds) {
      try {
        const invoiceData = invoiceDataMap[invoiceId];
        
        if (!invoiceData) {
          console.warn(`Faktura ${invoiceId} nie istnieje, pomijam`);
          skippedCount++;
          updateResults.push({
            invoiceId,
            success: false,
            error: 'Faktura nie istnieje'
          });
          continue;
        }
        
        const proformAllocation = invoiceData.proformAllocation || [];
        
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
        
        const updatedAllocation = [...proformAllocation];
        const oldNumber = updatedAllocation[allocationIndex].proformaNumber;
        updatedAllocation[allocationIndex] = {
          ...updatedAllocation[allocationIndex],
          proformaNumber: newProformaNumber
        };
        
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

/**
 * Wyszukuje faktury które wykorzystują daną proformę jako zaliczkę
 * Szuka po proformAllocation w fakturach (niezależnie od linkedAdvanceInvoices w proformie)
 * @param {string} proformaId - ID proformy
 * @returns {Promise<Array>} Lista faktur z dodatkową informacją o wykorzystanej kwocie
 */
export const getInvoicesUsingProforma = async (proformaId) => {
  try {
    if (!proformaId) {
      return [];
    }

    console.log(`Wyszukiwanie faktur wykorzystujących proformę: ${proformaId}`);
    
    // Pobierz wszystkie faktury które nie są proformami
    const invoicesQuery = query(
      collection(db, INVOICES_COLLECTION),
      where('isProforma', '==', false)
    );
    
    const querySnapshot = await getDocs(invoicesQuery);
    const invoicesUsingProforma = [];
    
    querySnapshot.forEach((docSnap) => {
      const invoiceData = docSnap.data();
      
      // Sprawdź czy faktura ma proformAllocation z naszą proformą
      if (invoiceData.proformAllocation && Array.isArray(invoiceData.proformAllocation)) {
        const allocation = invoiceData.proformAllocation.find(
          alloc => alloc.proformaId === proformaId
        );
        
        if (allocation && allocation.amount > 0) {
          // Konwertuj Timestamp na Date
          const processedInvoice = {
            id: docSnap.id,
            ...invoiceData,
            issueDate: invoiceData.issueDate?.toDate ? invoiceData.issueDate.toDate() : invoiceData.issueDate,
            dueDate: invoiceData.dueDate?.toDate ? invoiceData.dueDate.toDate() : invoiceData.dueDate,
            createdAt: invoiceData.createdAt?.toDate ? invoiceData.createdAt.toDate() : invoiceData.createdAt,
            updatedAt: invoiceData.updatedAt?.toDate ? invoiceData.updatedAt.toDate() : invoiceData.updatedAt,
            usedAmount: allocation.amount,
            proformaNumber: allocation.proformaNumber
          };
          
          invoicesUsingProforma.push(processedInvoice);
        }
      }
      
      // COMPATIBILITY: Sprawdź też stary system selectedProformaId
      else if (invoiceData.selectedProformaId === proformaId && invoiceData.settledAdvancePayments > 0) {
        const processedInvoice = {
          id: docSnap.id,
          ...invoiceData,
          issueDate: invoiceData.issueDate?.toDate ? invoiceData.issueDate.toDate() : invoiceData.issueDate,
          dueDate: invoiceData.dueDate?.toDate ? invoiceData.dueDate.toDate() : invoiceData.dueDate,
          createdAt: invoiceData.createdAt?.toDate ? invoiceData.createdAt.toDate() : invoiceData.createdAt,
          updatedAt: invoiceData.updatedAt?.toDate ? invoiceData.updatedAt.toDate() : invoiceData.updatedAt,
          usedAmount: invoiceData.settledAdvancePayments,
          proformaNumber: '(stary system)'
        };
        
        invoicesUsingProforma.push(processedInvoice);
      }
    });
    
    // Sortuj po dacie wystawienia (najnowsze pierwsze)
    invoicesUsingProforma.sort((a, b) => {
      const dateA = a.issueDate ? new Date(a.issueDate) : new Date(0);
      const dateB = b.issueDate ? new Date(b.issueDate) : new Date(0);
      return dateB - dateA;
    });
    
    console.log(`Znaleziono ${invoicesUsingProforma.length} faktur wykorzystujących proformę`);
    return invoicesUsingProforma;
    
  } catch (error) {
    console.error('Błąd podczas wyszukiwania faktur wykorzystujących proformę:', error);
    throw error;
  }
};

/**
 * Aktualizuje kursy walut dla istniejących faktur (które nie mają jeszcze pól totalInPLN)
 * Pobiera kursy z NBP zgodnie z Art. 31a (dzień poprzedzający datę wystawienia)
 * 
 * @param {Array<string>} invoiceIds - Lista ID faktur do aktualizacji (opcjonalna - jeśli pusta, aktualizuje wszystkie)
 * @param {string} userId - ID użytkownika wykonującego aktualizację
 * @returns {Promise<{success: boolean, updated: number, skipped: number, errors: Array}>}
 */
export const updateInvoicesExchangeRates = async (invoiceIds = [], userId = null) => {
  try {
    // Dynamiczny import aby uniknąć circular dependency
    const { calculateInvoiceTotalInPLN } = await import('../utils/nbpExchangeRates');
    
    console.log('🔄 Rozpoczynanie aktualizacji kursów walut dla faktur...');
    
    let invoicesToUpdate = [];
    
    // Jeśli podano konkretne ID, pobierz batch zamiast N+1 getDoc
    if (invoiceIds && invoiceIds.length > 0) {
      console.log(`Pobieranie ${invoiceIds.length} konkretnych faktur...`);
      const idChunks = [];
      for (let i = 0; i < invoiceIds.length; i += 30) {
        idChunks.push(invoiceIds.slice(i, i + 30));
      }
      const idResults = await Promise.all(
        idChunks.map(chunk => {
          const q = query(collection(db, INVOICES_COLLECTION), where('__name__', 'in', chunk));
          return getDocs(q);
        })
      );
      idResults.forEach(snap => {
        snap.docs.forEach(d => {
          invoicesToUpdate.push({ id: d.id, ...d.data() });
        });
      });
    } else {
      // Pobierz wszystkie faktury
      console.log('Pobieranie wszystkich faktur...');
      const querySnapshot = await getDocs(collection(db, INVOICES_COLLECTION));
      invoicesToUpdate = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    console.log(`📊 Znaleziono ${invoicesToUpdate.length} faktur do sprawdzenia`);
    
    let updatedCount = 0;
    let skippedCount = 0;
    let errorsList = [];
    
    for (const invoice of invoicesToUpdate) {
      try {
        // Pomiń faktury które:
        // 1. Już mają totalInPLN
        // 2. Są w PLN
        // 3. Nie mają waluty lub kwoty
        
        if (invoice.totalInPLN !== null && invoice.totalInPLN !== undefined) {
          console.log(`⏭️  Pomijam fakturę ${invoice.number} - już ma totalInPLN: ${invoice.totalInPLN}`);
          skippedCount++;
          continue;
        }
        
        if (!invoice.currency || invoice.currency === 'PLN') {
          console.log(`⏭️  Pomijam fakturę ${invoice.number} - waluta PLN lub brak waluty`);
          skippedCount++;
          continue;
        }
        
        if (!invoice.total || invoice.total === 0) {
          console.log(`⏭️  Pomijam fakturę ${invoice.number} - brak kwoty total`);
          skippedCount++;
          continue;
        }
        
        if (!invoice.issueDate) {
          console.log(`⏭️  Pomijam fakturę ${invoice.number} - brak daty wystawienia`);
          skippedCount++;
          continue;
        }
        
        // Konwertuj Timestamp na Date jeśli potrzeba
        const issueDate = invoice.issueDate?.toDate ? invoice.issueDate.toDate() : new Date(invoice.issueDate);
        
        console.log(`\n💱 Przetwarzam fakturę: ${invoice.number}`);
        console.log(`   Waluta: ${invoice.currency}`);
        console.log(`   Kwota: ${invoice.total} ${invoice.currency}`);
        console.log(`   Data wystawienia: ${issueDate.toISOString().split('T')[0]}`);
        
        // Pobierz kurs i przelicz na PLN
        const plnConversion = await calculateInvoiceTotalInPLN(
          invoice.total,
          invoice.currency,
          issueDate
        );
        
        const exchangeRate = plnConversion.exchangeRate;
        
        console.log(`   ✅ Przeliczono total: ${plnConversion.totalInPLN} PLN`);
        console.log(`   📈 Kurs: ${exchangeRate} (z dnia ${plnConversion.exchangeRateDate})`);
        console.log(`   🔗 Źródło: ${plnConversion.exchangeRateSource}`);
        
        // Przygotuj obiekt z przeliczonymi wartościami
        const updateData = {
          totalInPLN: plnConversion.totalInPLN,
          exchangeRate: exchangeRate,
          exchangeRateDate: plnConversion.exchangeRateDate,
          exchangeRateSource: plnConversion.exchangeRateSource,
          updatedAt: serverTimestamp(),
          ...(userId && { updatedBy: userId })
        };
        
        // Przelicz pozycje faktury (items)
        if (invoice.items && invoice.items.length > 0) {
          updateData.itemsInPLN = invoice.items.map(item => {
            const unitPrice = parseFloat(item.price || item.unitPrice || 0);
            const quantity = parseFloat(item.quantity || 0);
            const totalPrice = parseFloat(item.totalPrice || (unitPrice * quantity) || 0);
            
            return {
              ...item,
              unitPricePLN: parseFloat((unitPrice * exchangeRate).toFixed(2)),
              totalPricePLN: parseFloat((totalPrice * exchangeRate).toFixed(2))
            };
          });
          console.log(`   📦 Przeliczono ${invoice.items.length} pozycji`);
        }
        
        // Przelicz dodatkowe koszty (additionalCostsItems)
        if (invoice.additionalCostsItems && invoice.additionalCostsItems.length > 0) {
          updateData.additionalCostsItemsInPLN = invoice.additionalCostsItems.map(cost => {
            const value = parseFloat(cost.value || 0);
            
            return {
              ...cost,
              valuePLN: parseFloat((value * exchangeRate).toFixed(2))
            };
          });
          console.log(`   💰 Przeliczono ${invoice.additionalCostsItems.length} kosztów dodatkowych`);
        }
        
        // Przelicz zaliczki (settledAdvancePayments)
        if (invoice.settledAdvancePayments && invoice.settledAdvancePayments > 0) {
          updateData.settledAdvancePaymentsInPLN = parseFloat(
            (invoice.settledAdvancePayments * exchangeRate).toFixed(2)
          );
          console.log(`   💳 Przeliczono zaliczki: ${updateData.settledAdvancePaymentsInPLN} PLN`);
        }
        
        // Przelicz informacje o wysyłce jeśli istnieją
        if (invoice.shippingInfo && invoice.shippingInfo.cost) {
          updateData.shippingInfoInPLN = {
            ...invoice.shippingInfo,
            costPLN: parseFloat((invoice.shippingInfo.cost * exchangeRate).toFixed(2))
          };
          console.log(`   🚚 Przeliczono koszt wysyłki: ${updateData.shippingInfoInPLN.costPLN} PLN`);
        }
        
        // Zaktualizuj fakturę w bazie
        await updateDoc(doc(db, INVOICES_COLLECTION, invoice.id), updateData);
        
        updatedCount++;
        console.log(`   💾 Zapisano w bazie danych\n`);
        
      } catch (error) {
        console.error(`❌ Błąd dla faktury ${invoice.number}:`, error.message);
        errorsList.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.number,
          error: error.message
        });
        skippedCount++;
      }
    }
    
    const result = {
      success: true,
      updated: updatedCount,
      skipped: skippedCount,
      total: invoicesToUpdate.length,
      errors: errorsList
    };
    
    console.log('\n' + '='.repeat(60));
    console.log('📋 PODSUMOWANIE AKTUALIZACJI KURSÓW WALUT');
    console.log('='.repeat(60));
    console.log(`✅ Zaktualizowano: ${updatedCount} faktur`);
    console.log(`⏭️  Pominięto: ${skippedCount} faktur`);
    console.log(`📊 Razem sprawdzono: ${invoicesToUpdate.length} faktur`);
    if (errorsList.length > 0) {
      console.log(`❌ Błędy: ${errorsList.length}`);
      errorsList.forEach(err => {
        console.log(`   - ${err.invoiceNumber}: ${err.error}`);
      });
    }
    console.log('='.repeat(60) + '\n');
    
    return result;
    
  } catch (error) {
    console.error('❌ Błąd podczas aktualizacji kursów walut:', error);
    throw error;
  }
};