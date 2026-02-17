import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase/config';
import { useAuth } from '../hooks/useAuth';

// Tworzenie kontekstu
export const ColumnPreferencesContext = createContext();

// Domyślne ustawienia kolumn dla różnych widoków
const defaultColumnPreferences = {
  // Magazyn/Inventory
  inventory: {
    name: true,
    category: true,
    casNumber: false,
    barcode: false,
    totalQuantity: true,
    reservedQuantity: true,
    availableQuantity: true,
    status: true,
    customers: false,
    location: true,
    actions: true
  },
  // Zamówienia zakupu
  purchaseOrders: {
    number: true,
    supplier: true,
    orderDate: true,
    expectedDeliveryDate: true,
    value: true,
    statusAndPayment: true, // Nowa kolumna łącząca status i płatność
    actions: true
  },
  // Zadania produkcyjne
  productionTasks: {
    name: true,
    productName: true,
    quantityProgress: true,
    statusAndMaterials: true, // Nowa kolumna łącząca status i materiały
    plannedStart: true,
    plannedEnd: true,
    cost: true,
    totalCost: true,
    actions: true
  },
  // Dodaj inne widoki według potrzeb
};

export const ColumnPreferencesProvider = ({ children }) => {
  const auth = useAuth();
  const currentUser = auth?.currentUser;
  const [columnPreferences, setColumnPreferences] = useState(defaultColumnPreferences);

  // Pobieranie preferencji z lokalnego storage przy starcie
  useEffect(() => {
    const savedPreferences = localStorage.getItem('columnPreferences');
    if (savedPreferences) {
      try {
        const parsedPreferences = JSON.parse(savedPreferences);
        setColumnPreferences({
          ...defaultColumnPreferences, // domyślne wartości
          ...parsedPreferences // nadpisanie zapisanymi preferencjami
        });
      } catch (error) {
        console.error('Błąd podczas parsowania preferencji kolumn:', error);
      }
    }
  }, []);

  // Pobieranie preferencji użytkownika z Firebase po zalogowaniu
  useEffect(() => {
    const fetchUserColumnPreferences = async () => {
      if (currentUser) {
        try {
          const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.columnPreferences) {
              // Aktualizujemy stan z preferencjami z Firebase
              setColumnPreferences({
                ...defaultColumnPreferences, // zachowujemy domyślne wartości dla nowych widoków
                ...userData.columnPreferences // nadpisujemy ustawionymi preferencjami
              });
              
              // Aktualizujemy również lokalne storage
              localStorage.setItem('columnPreferences', JSON.stringify(userData.columnPreferences));
            }
          }
        } catch (error) {
          console.error('Błąd podczas pobierania preferencji kolumn:', error);
        }
      }
    };

    if (currentUser) {
      fetchUserColumnPreferences();
    }
  }, [currentUser]);

  // Stabilna funkcja — nie powoduje re-renderów konsumentów
  const updateColumnPreferences = useCallback(async (viewId, columnName, isVisible) => {
    setColumnPreferences(prev => {
      const updatedPreferences = { ...prev };
      if (!updatedPreferences[viewId]) {
        updatedPreferences[viewId] = {};
      }
      updatedPreferences[viewId] = { ...updatedPreferences[viewId], [columnName]: isVisible };
      
      // Zapisz w lokalnym storage
      localStorage.setItem('columnPreferences', JSON.stringify(updatedPreferences));
      
      // Zapisz w profilu użytkownika, jeśli jest zalogowany
      if (auth?.currentUser) {
        updateDoc(doc(db, 'users', auth.currentUser.uid), {
          columnPreferences: updatedPreferences,
          updatedAt: new Date()
        }).catch(error => {
          console.error('Błąd podczas zapisywania preferencji kolumn:', error);
        });
      }
      
      return updatedPreferences;
    });
  }, [auth]);

  // Stabilna funkcja helper
  const getColumnPreferencesForView = useCallback((viewId) => {
    if (columnPreferences[viewId]) {
      return columnPreferences[viewId];
    }
    return defaultColumnPreferences[viewId] || {};
  }, [columnPreferences]);

  // Memoizowana wartość kontekstu — zmienia się tylko gdy state lub funkcje się zmienią
  const contextValue = useMemo(() => ({
    columnPreferences, 
    updateColumnPreferences,
    getColumnPreferencesForView
  }), [columnPreferences, updateColumnPreferences, getColumnPreferencesForView]);

  return (
    <ColumnPreferencesContext.Provider value={contextValue}>
      {children}
    </ColumnPreferencesContext.Provider>
  );
};

// Hook ułatwiający korzystanie z kontekstu preferencji kolumn
export const useColumnPreferences = () => {
  const context = useContext(ColumnPreferencesContext);
  if (!context) {
    throw new Error('useColumnPreferences must be used within a ColumnPreferencesProvider');
  }
  return context;
}; 