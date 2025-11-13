import React, { createContext, useContext, useReducer, useEffect } from 'react';

// Kontekst dla zarządzania stanem listy pozycji magazynowych
const InventoryListStateContext = createContext();

// Klucz dla localStorage
const STORAGE_KEY = 'inventoryListState';

// Stan początkowy
const initialState = {
  searchTerm: '',
  searchCategory: '',
  selectedWarehouse: '',
  currentTab: 0,
  page: 1,
  pageSize: 10,
  tableSort: {
    field: 'name',
    order: 'asc'
  },
  selectedWarehouseForView: null,
  warehouseItemsPage: 1,
  warehouseItemsPageSize: 10,
  warehouseSearchTerm: '',
  warehouseItemsSort: {
    field: 'name',
    order: 'asc'
  },
  // Można dodać więcej pól w przyszłości
  reservationFilter: 'all',
  moFilter: '',
  lastUpdated: Date.now()
};

// Akcje
const actionTypes = {
  SET_SEARCH_TERM: 'SET_SEARCH_TERM',
  SET_SEARCH_CATEGORY: 'SET_SEARCH_CATEGORY',
  SET_SELECTED_WAREHOUSE: 'SET_SELECTED_WAREHOUSE',
  SET_CURRENT_TAB: 'SET_CURRENT_TAB',
  SET_PAGE: 'SET_PAGE',
  SET_PAGE_SIZE: 'SET_PAGE_SIZE',
  SET_TABLE_SORT: 'SET_TABLE_SORT',
  SET_SELECTED_WAREHOUSE_FOR_VIEW: 'SET_SELECTED_WAREHOUSE_FOR_VIEW',
  SET_WAREHOUSE_ITEMS_PAGE: 'SET_WAREHOUSE_ITEMS_PAGE',
  SET_WAREHOUSE_ITEMS_PAGE_SIZE: 'SET_WAREHOUSE_ITEMS_PAGE_SIZE',
  SET_WAREHOUSE_SEARCH_TERM: 'SET_WAREHOUSE_SEARCH_TERM',
  SET_WAREHOUSE_ITEMS_SORT: 'SET_WAREHOUSE_ITEMS_SORT',
  SET_RESERVATION_FILTER: 'SET_RESERVATION_FILTER',
  SET_MO_FILTER: 'SET_MO_FILTER',
  RESET_STATE: 'RESET_STATE',
  LOAD_STATE: 'LOAD_STATE'
};

// Reducer do zarządzania stanem
const inventoryListStateReducer = (state, action) => {
  const newState = (() => {
    switch (action.type) {
      case actionTypes.SET_SEARCH_TERM:
        return { 
          ...state, 
          searchTerm: action.payload,
          page: 1, // Reset strony przy zmianie wyszukiwania
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_SEARCH_CATEGORY:
        return { 
          ...state, 
          searchCategory: action.payload,
          page: 1, // Reset strony przy zmianie kategorii
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_SELECTED_WAREHOUSE:
        return { 
          ...state, 
          selectedWarehouse: action.payload,
          page: 1, // Reset strony przy zmianie magazynu
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_CURRENT_TAB:
        return { 
          ...state, 
          currentTab: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_PAGE:
        return { 
          ...state, 
          page: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_PAGE_SIZE:
        return { 
          ...state, 
          pageSize: action.payload,
          page: 1, // Reset strony przy zmianie rozmiaru strony
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_TABLE_SORT:
        return { 
          ...state, 
          tableSort: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_SELECTED_WAREHOUSE_FOR_VIEW:
        return { 
          ...state, 
          selectedWarehouseForView: action.payload,
          warehouseItemsPage: 1, // Reset strony przy zmianie widoku magazynu
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_WAREHOUSE_ITEMS_PAGE:
        return { 
          ...state, 
          warehouseItemsPage: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_WAREHOUSE_ITEMS_PAGE_SIZE:
        return { 
          ...state, 
          warehouseItemsPageSize: action.payload,
          warehouseItemsPage: 1, // Reset strony przy zmianie rozmiaru
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_WAREHOUSE_SEARCH_TERM:
        return { 
          ...state, 
          warehouseSearchTerm: action.payload,
          warehouseItemsPage: 1, // Reset strony przy zmianie wyszukiwania
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_WAREHOUSE_ITEMS_SORT:
        return { 
          ...state, 
          warehouseItemsSort: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_RESERVATION_FILTER:
        return { 
          ...state, 
          reservationFilter: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_MO_FILTER:
        return { 
          ...state, 
          moFilter: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.RESET_STATE:
        return { 
          ...initialState,
          lastUpdated: Date.now()
        };
      
      case actionTypes.LOAD_STATE:
        return { 
          ...action.payload,
          lastUpdated: Date.now()
        };
      
      default:
        return state;
    }
  })();

  // Zapisz stan do localStorage (z wyjątkiem akcji ładowania)
  if (action.type !== actionTypes.LOAD_STATE) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    } catch (error) {
      console.warn('Nie można zapisać stanu listy magazynowej do localStorage:', error);
    }
  }

  return newState;
};

// Provider
export const InventoryListStateProvider = ({ children }) => {
  const [state, dispatch] = useReducer(inventoryListStateReducer, initialState);

  // Ładowanie stanu z localStorage przy inicjalizacji
  useEffect(() => {
    try {
      const savedState = localStorage.getItem(STORAGE_KEY);
      if (savedState) {
        const parsedState = JSON.parse(savedState);
        
        // Sprawdź czy stan nie jest za stary (np. starszy niż 24 godziny)
        const maxAge = 24 * 60 * 60 * 1000; // 24 godziny w milisekundach
        const isStateValid = parsedState.lastUpdated && 
                            (Date.now() - parsedState.lastUpdated) < maxAge;
        
        if (isStateValid) {
          dispatch({ type: actionTypes.LOAD_STATE, payload: parsedState });
        } else {
          // Wyczyść stary stan
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.warn('Błąd podczas ładowania stanu listy magazynowej z localStorage:', error);
      // W przypadku błędu, wyczyść potencjalnie uszkodzone dane
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Funkcje pomocnicze do zarządzania stanem
  const actions = {
    setSearchTerm: (term) => dispatch({ type: actionTypes.SET_SEARCH_TERM, payload: term }),
    setSearchCategory: (category) => dispatch({ type: actionTypes.SET_SEARCH_CATEGORY, payload: category }),
    setSelectedWarehouse: (warehouseId) => dispatch({ type: actionTypes.SET_SELECTED_WAREHOUSE, payload: warehouseId }),
    setCurrentTab: (tab) => dispatch({ type: actionTypes.SET_CURRENT_TAB, payload: tab }),
    setPage: (page) => dispatch({ type: actionTypes.SET_PAGE, payload: page }),
    setPageSize: (size) => dispatch({ type: actionTypes.SET_PAGE_SIZE, payload: size }),
    setTableSort: (sort) => dispatch({ type: actionTypes.SET_TABLE_SORT, payload: sort }),
    setSelectedWarehouseForView: (warehouse) => dispatch({ type: actionTypes.SET_SELECTED_WAREHOUSE_FOR_VIEW, payload: warehouse }),
    setWarehouseItemsPage: (page) => dispatch({ type: actionTypes.SET_WAREHOUSE_ITEMS_PAGE, payload: page }),
    setWarehouseItemsPageSize: (size) => dispatch({ type: actionTypes.SET_WAREHOUSE_ITEMS_PAGE_SIZE, payload: size }),
    setWarehouseSearchTerm: (term) => dispatch({ type: actionTypes.SET_WAREHOUSE_SEARCH_TERM, payload: term }),
    setWarehouseItemsSort: (sort) => dispatch({ type: actionTypes.SET_WAREHOUSE_ITEMS_SORT, payload: sort }),
    setReservationFilter: (filter) => dispatch({ type: actionTypes.SET_RESERVATION_FILTER, payload: filter }),
    setMoFilter: (filter) => dispatch({ type: actionTypes.SET_MO_FILTER, payload: filter }),
    resetState: () => dispatch({ type: actionTypes.RESET_STATE })
  };

  return (
    <InventoryListStateContext.Provider value={{ state, actions }}>
      {children}
    </InventoryListStateContext.Provider>
  );
};

// Hook do używania kontekstu
export const useInventoryListState = () => {
  const context = useContext(InventoryListStateContext);
  if (!context) {
    throw new Error('useInventoryListState musi być używany w InventoryListStateProvider');
  }
  return context;
};

export default InventoryListStateContext; 