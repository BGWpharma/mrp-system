// Portal Customer Order Service
import { 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  setDoc,
  getDoc, 
  getDocs, 
  query, 
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  increment 
} from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Pobiera i inkrementuje licznik dla zamówień CO (zgodnie z logiką MRP)
 */
const getNextCONumber = async (customerId = null) => {
  try {
    // Sprawdź, czy istnieje kolekcja liczników (tak jak w oryginalnym systemie)
    const countersRef = collection(db, 'counters');
    const q = query(
      countersRef,
      orderBy('lastUpdated', 'desc'),
      limit(1)
    );
    
    const querySnapshot = await getDocs(q);
    
    console.log('DEBUG - getNextCONumber start:', {
      customerId,
      foundCounters: querySnapshot.size
    });
    
    let counter;
    let currentNumber;
    let counterDocRef;
    
    // Jeśli nie ma liczników, utwórz nowy
    if (querySnapshot.empty) {
      // Utwórz nowy dokument liczników (zgodnie z formatem MRP)
      counter = {
        MO: 1,
        PO: 1,
        CO: 1,
        LOT: 1,
        lastUpdated: new Date(),
        customerCounters: {} // Pole do przechowywania liczników klientów
      };
      
      // Jeśli to licznik CO dla konkretnego klienta
      if (customerId) {
        counter.customerCounters[customerId] = 1;
        currentNumber = 1;
      } else {
        currentNumber = counter.CO;
      }
      
      await addDoc(countersRef, counter);
    } else {
      // Pobierz istniejący licznik
      const counterDoc = querySnapshot.docs[0];
      counterDocRef = counterDoc.ref;
      counter = counterDoc.data();
      
      // Upewnij się, że istnieje obiekt customerCounters
      if (!counter.customerCounters) {
        counter.customerCounters = {};
      }
      
      // Jeśli to licznik CO dla konkretnego klienta
      if (customerId) {
        // Sprawdź czy istnieje licznik dla danego klienta
        if (counter.customerCounters[customerId] === undefined) {
          counter.customerCounters[customerId] = 1;
          currentNumber = 1;
        } else {
          // Inkrementuj licznik PRZED pobraniem wartości (zgodnie z logiką MRP)
          counter.customerCounters[customerId]++;
          currentNumber = counter.customerCounters[customerId];
        }
        
        // POPRAWKA: Aktualizuj istniejący dokument zamiast tworzyć nowy
        await updateDoc(counterDocRef, {
          ...counter,
          lastUpdated: new Date()
        });
        
        console.log('DEBUG - updated customer counter:', {
          customerId,
          newValue: currentNumber,
          counterAfterUpdate: counter.customerCounters[customerId]
        });
      } else {
        // Inkrementuj licznik globalny CO PRZED pobraniem wartości
        counter.CO++;
        currentNumber = counter.CO;
        
        // POPRAWKA: Aktualizuj istniejący dokument zamiast tworzyć nowy
        await updateDoc(counterDocRef, {
          ...counter,
          lastUpdated: new Date()
        });
        
        console.log('DEBUG - updated global CO counter:', {
          newValue: currentNumber,
          globalCOAfterUpdate: counter.CO
        });
      }
    }
    
    console.log('DEBUG - getNextCONumber result:', {
      customerId,
      returnedNumber: currentNumber
    });
    
    return currentNumber;
  } catch (error) {
    console.error('Błąd podczas generowania numeru CO:', error);
    // W przypadku błędu, wygeneruj losowy numer jako fallback
    return Math.floor(Math.random() * 10000) + 1;
  }
};

/**
 * Generuje numer CO dla portalu klienta (zgodnie z formatem MRP)
 */
export const generateCONumber = async (customerAffix = '', customerId = null) => {
  try {
    // Jeśli podano ID klienta, użyj licznika dla tego klienta
    const nextNumber = await getNextCONumber(customerId);
    
    console.log('DEBUG - generateCONumber:', {
      customerId,
      customerAffix,
      nextNumber,
      willUseCustomerCounter: !!customerId
    });
    
    // Format zgodny z MRP: CO00001 (5 cyfr z zerami wiodącymi)
    const baseNumber = `CO${nextNumber.toString().padStart(5, '0')}`;
    
    // Dodaj afiks tylko jeśli został podany (na końcu, zgodnie z formatem MRP)
    if (customerAffix && typeof customerAffix === 'string' && customerAffix.trim() !== '') {
      return `${baseNumber}${customerAffix.trim()}`;
    }
    
    return baseNumber;
  } catch (error) {
    console.error('Błąd podczas generowania numeru CO:', error);
    // Fallback - użyj timestamp jako numer
    return `CO-${Date.now()}`;
  }
};

/**
 * Tworzy zamówienie klienta w formacie kompatybilnym z MRP
 */
export const createCustomerOrder = async (orderData, customerId) => {
  try {
    // Walidacja podstawowych danych
    if (!orderData.customer || !orderData.customer.name) {
      throw new Error('Dane klienta są wymagane');
    }
    
    if (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
      throw new Error('Zamówienie musi zawierać co najmniej jeden produkt');
    }
    
    // Sprawdź każdą pozycję zamówienia
    orderData.items.forEach((item, index) => {
      if (!item.name) {
        throw new Error(`Pozycja #${index + 1} musi zawierać nazwę produktu`);
      }
      
      if (item.quantity <= 0) {
        throw new Error(`Pozycja #${index + 1} musi mieć dodatnią ilość`);
      }
      
      if (item.price < 0) {
        throw new Error(`Pozycja #${index + 1} musi mieć poprawną cenę`);
      }
    });
    
    console.log('DEBUG - Order items before processing:', JSON.stringify(orderData.items, null, 2));
    
    // Wygeneruj numer CO
    const orderNumber = await generateCONumber(
      orderData.customer.orderAffix, 
      orderData.customer.id
    );
    
    console.log('DEBUG - Generated order number:', orderNumber);
    
    // Przygotuj dane zamówienia zgodne z formatem MRP
    const mrpOrderData = {
      ...orderData,
      orderNumber,
      orderDate: Timestamp.fromDate(orderData.orderDate || new Date()),
      expectedDeliveryDate: orderData.expectedDeliveryDate 
        ? Timestamp.fromDate(new Date(orderData.expectedDeliveryDate)) 
        : null,
      // Dodaj pole deadline dla kompatybilności z UI systemu MRP
      deadline: orderData.expectedDeliveryDate 
        ? Timestamp.fromDate(new Date(orderData.expectedDeliveryDate)) 
        : null,
      createdBy: customerId || 'customer_portal',
      createdAt: serverTimestamp(),
      updatedBy: customerId || 'customer_portal',
      updatedAt: serverTimestamp(),
      // Oznaczenie źródła zamówienia
      orderSource: 'customer_portal',
      portalCustomerId: customerId
    };
    
    console.log('DEBUG - Final order data before save:', {
      orderNumber: mrpOrderData.orderNumber,
      items: mrpOrderData.items,
      itemsCount: mrpOrderData.items?.length || 0,
      customer: mrpOrderData.customer,
      orderSource: mrpOrderData.orderSource
    });
    
    // Zapisz zamówienie w kolekcji orders (ta sama co system MRP)
    const docRef = await addDoc(collection(db, 'orders'), mrpOrderData);
    
    console.log('DEBUG - Order saved with ID:', docRef.id);
    console.log('DEBUG - Verifying saved order items count:', mrpOrderData.items?.length || 0);
    
    return {
      id: docRef.id,
      orderNumber,
      ...mrpOrderData
    };
    
  } catch (error) {
    console.error('Błąd podczas tworzenia zamówienia:', error);
    throw error;
  }
};

/**
 * Pobiera zamówienia klienta
 */
export const getCustomerOrders = async (customerId) => {
  try {
    const ordersQuery = query(
      collection(db, 'orders'),
      where('customer.id', '==', customerId),
      orderBy('orderDate', 'desc')
    );
    
    const querySnapshot = await getDocs(ordersQuery);
    
    const orders = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        orderDate: data.orderDate?.toDate() || null,
        expectedDeliveryDate: data.expectedDeliveryDate?.toDate() || null,
        deliveryDate: data.deliveryDate?.toDate() || null
      };
    });
    
    return orders;
  } catch (error) {
    console.error('Błąd podczas pobierania zamówień klienta:', error);
    throw error;
  }
};

/**
 * Oblicza łączną wartość koszyka
 */
export const calculateCartTotal = (cart) => {
  return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}; 