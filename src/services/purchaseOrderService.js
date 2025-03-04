import axios from 'axios';
import { API_URL } from '../config';

// Tymczasowe dane dla dostawców
let suppliers = [
  {
    id: '1',
    name: 'Dostawca Surowców Spożywczych',
    contactPerson: 'Jan Kowalski',
    email: 'jan.kowalski@dostawca.pl',
    phone: '+48 123 456 789',
    address: 'ul. Przemysłowa 15, 00-001 Warszawa',
    taxId: '1234567890',
    notes: 'Główny dostawca surowców spożywczych'
  },
  {
    id: '2',
    name: 'Opakowania Premium',
    contactPerson: 'Anna Nowak',
    email: 'anna.nowak@opakowania.pl',
    phone: '+48 987 654 321',
    address: 'ul. Fabryczna 8, 30-001 Kraków',
    taxId: '0987654321',
    notes: 'Dostawca opakowań premium'
  }
];

// Tymczasowe dane dla zamówień zakupowych
let purchaseOrders = [
  {
    id: '1',
    number: 'PO-2023-001',
    supplier: suppliers[0],
    orderDate: new Date().toISOString(),
    expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'draft',
    currency: 'PLN',
    items: [
      {
        id: '1',
        name: 'Mąka pszenna',
        quantity: 100,
        unit: 'kg',
        unitPrice: 2.5,
        totalPrice: 250
      }
    ],
    totalValue: 250,
    deliveryAddress: 'ul. Produkcyjna 10, 00-001 Warszawa',
    notes: 'Pilne zamówienie'
  }
];

// Funkcje do obsługi zamówień zakupowych
export const getAllPurchaseOrders = async () => {
  try {
    // Symulacja opóźnienia sieciowego
    await new Promise(resolve => setTimeout(resolve, 500));
    return purchaseOrders;
  } catch (error) {
    console.error('Błąd podczas pobierania zamówień zakupowych:', error);
    throw error;
  }
};

export const getPurchaseOrderById = async (id) => {
  try {
    // Symulacja opóźnienia sieciowego
    await new Promise(resolve => setTimeout(resolve, 500));
    const purchaseOrder = purchaseOrders.find(po => po.id === id);
    if (!purchaseOrder) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${id}`);
    }
    return purchaseOrder;
  } catch (error) {
    console.error(`Błąd podczas pobierania zamówienia zakupowego o ID ${id}:`, error);
    throw error;
  }
};

export const createPurchaseOrder = async (purchaseOrderData) => {
  try {
    // Symulacja opóźnienia sieciowego
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const newPurchaseOrder = {
      id: String(purchaseOrders.length + 1),
      number: `PO-2023-${String(purchaseOrders.length + 1).padStart(3, '0')}`,
      ...purchaseOrderData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    purchaseOrders.push(newPurchaseOrder);
    return newPurchaseOrder;
  } catch (error) {
    console.error('Błąd podczas tworzenia zamówienia zakupowego:', error);
    throw error;
  }
};

export const updatePurchaseOrder = async (id, purchaseOrderData) => {
  try {
    // Symulacja opóźnienia sieciowego
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const index = purchaseOrders.findIndex(po => po.id === id);
    if (index === -1) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${id}`);
    }
    
    const updatedPurchaseOrder = {
      ...purchaseOrders[index],
      ...purchaseOrderData,
      updatedAt: new Date().toISOString()
    };
    
    purchaseOrders[index] = updatedPurchaseOrder;
    return updatedPurchaseOrder;
  } catch (error) {
    console.error(`Błąd podczas aktualizacji zamówienia zakupowego o ID ${id}:`, error);
    throw error;
  }
};

export const deletePurchaseOrder = async (id) => {
  try {
    // Symulacja opóźnienia sieciowego
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const index = purchaseOrders.findIndex(po => po.id === id);
    if (index === -1) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${id}`);
    }
    
    purchaseOrders.splice(index, 1);
    return { id };
  } catch (error) {
    console.error(`Błąd podczas usuwania zamówienia zakupowego o ID ${id}:`, error);
    throw error;
  }
};

export const updatePurchaseOrderStatus = async (id, status) => {
  try {
    // Symulacja opóźnienia sieciowego
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const index = purchaseOrders.findIndex(po => po.id === id);
    if (index === -1) {
      throw new Error(`Nie znaleziono zamówienia zakupowego o ID ${id}`);
    }
    
    purchaseOrders[index].status = status;
    purchaseOrders[index].updatedAt = new Date().toISOString();
    
    return purchaseOrders[index];
  } catch (error) {
    console.error(`Błąd podczas aktualizacji statusu zamówienia zakupowego o ID ${id}:`, error);
    throw error;
  }
};

// Funkcje do obsługi dostawców
export const getAllSuppliers = async () => {
  try {
    // Symulacja opóźnienia sieciowego
    await new Promise(resolve => setTimeout(resolve, 500));
    return suppliers;
  } catch (error) {
    console.error('Błąd podczas pobierania dostawców:', error);
    throw error;
  }
};

export const getSupplierById = async (id) => {
  try {
    // Symulacja opóźnienia sieciowego
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const supplier = suppliers.find(s => s.id === id);
    if (!supplier) {
      throw new Error(`Nie znaleziono dostawcy o ID ${id}`);
    }
    
    return supplier;
  } catch (error) {
    console.error(`Błąd podczas pobierania dostawcy o ID ${id}:`, error);
    throw error;
  }
};

export const createSupplier = async (supplierData) => {
  try {
    // Symulacja opóźnienia sieciowego
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const newSupplier = {
      id: String(suppliers.length + 1),
      ...supplierData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    suppliers.push(newSupplier);
    return newSupplier;
  } catch (error) {
    console.error('Błąd podczas tworzenia dostawcy:', error);
    throw error;
  }
};

export const updateSupplier = async (id, supplierData) => {
  try {
    // Symulacja opóźnienia sieciowego
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const index = suppliers.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error(`Nie znaleziono dostawcy o ID ${id}`);
    }
    
    const updatedSupplier = {
      ...suppliers[index],
      ...supplierData,
      updatedAt: new Date().toISOString()
    };
    
    suppliers[index] = updatedSupplier;
    return updatedSupplier;
  } catch (error) {
    console.error(`Błąd podczas aktualizacji dostawcy o ID ${id}:`, error);
    throw error;
  }
};

export const deleteSupplier = async (id) => {
  try {
    // Symulacja opóźnienia sieciowego
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const index = suppliers.findIndex(s => s.id === id);
    if (index === -1) {
      throw new Error(`Nie znaleziono dostawcy o ID ${id}`);
    }
    
    // Sprawdź, czy dostawca jest używany w zamówieniach
    const isUsed = purchaseOrders.some(po => po.supplier && po.supplier.id === id);
    if (isUsed) {
      throw new Error(`Nie można usunąć dostawcy, ponieważ jest używany w zamówieniach`);
    }
    
    suppliers.splice(index, 1);
    return { id };
  } catch (error) {
    console.error(`Błąd podczas usuwania dostawcy o ID ${id}:`, error);
    throw error;
  }
};

// Funkcje pomocnicze
export const getPurchaseOrdersByStatus = async (status) => {
  try {
    // Symulacja opóźnienia sieciowego
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return purchaseOrders.filter(po => po.status === status);
  } catch (error) {
    console.error(`Błąd podczas pobierania zamówień zakupowych o statusie ${status}:`, error);
    throw error;
  }
};

export const getPurchaseOrdersBySupplier = async (supplierId) => {
  try {
    // Symulacja opóźnienia sieciowego
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return purchaseOrders.filter(po => po.supplier && po.supplier.id === supplierId);
  } catch (error) {
    console.error(`Błąd podczas pobierania zamówień zakupowych dla dostawcy o ID ${supplierId}:`, error);
    throw error;
  }
};

export const getSuppliersByItem = async (itemId) => {
  try {
    // Symulacja opóźnienia sieciowego
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // W tym przypadku zwracamy wszystkich dostawców, ponieważ nie mamy powiązania między przedmiotami a dostawcami
    return suppliers;
  } catch (error) {
    console.error(`Błąd podczas pobierania dostawców dla przedmiotu o ID ${itemId}:`, error);
    throw error;
  }
};

// Stałe dla statusów zamówień
export const PURCHASE_ORDER_STATUSES = {
  DRAFT: 'draft',
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed'
};

// Funkcja do tłumaczenia statusów na język polski
export const translateStatus = (status) => {
  const translations = {
    [PURCHASE_ORDER_STATUSES.DRAFT]: 'Szkic',
    [PURCHASE_ORDER_STATUSES.PENDING]: 'Oczekujące',
    [PURCHASE_ORDER_STATUSES.CONFIRMED]: 'Potwierdzone',
    [PURCHASE_ORDER_STATUSES.SHIPPED]: 'Wysłane',
    [PURCHASE_ORDER_STATUSES.DELIVERED]: 'Dostarczone',
    [PURCHASE_ORDER_STATUSES.CANCELLED]: 'Anulowane',
    [PURCHASE_ORDER_STATUSES.COMPLETED]: 'Zakończone'
  };
  
  return translations[status] || status;
}; 