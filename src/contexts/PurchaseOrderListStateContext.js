import React, { createContext, useContext, useReducer, useEffect } from 'react';

// Kontekst dla zarządzania stanem listy zamówień zakupu
const PurchaseOrderListStateContext = createContext();

// Klucz dla localStorage
const STORAGE_KEY = 'purchaseOrderListState';

// Stan początkowy
const initialState = {
  searchTerm: '',
  statusFilter: 'all',
  paymentStatusFilter: 'all',
  page: 1,
  pageSize: 10,
  tableSort: {
    field: 'createdAt',
    order: 'desc'
  },
  lastUpdated: Date.now()
};

// Akcje
const actionTypes = {
  SET_SEARCH_TERM: 'SET_SEARCH_TERM',
  SET_STATUS_FILTER: 'SET_STATUS_FILTER',
  SET_PAYMENT_STATUS_FILTER: 'SET_PAYMENT_STATUS_FILTER',
  SET_PAGE: 'SET_PAGE',
  SET_PAGE_SIZE: 'SET_PAGE_SIZE',
  SET_TABLE_SORT: 'SET_TABLE_SORT',
  RESET_STATE: 'RESET_STATE',
  LOAD_STATE: 'LOAD_STATE'
};

// Reducer do zarządzania stanem
const purchaseOrderListStateReducer = (state, action) => {
  const newState = (() => {
    switch (action.type) {
      case actionTypes.SET_SEARCH_TERM:
        return { 
          ...state, 
          searchTerm: action.payload,
          page: 1, // Reset strony przy zmianie wyszukiwania
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_STATUS_FILTER:
        return { 
          ...state, 
          statusFilter: action.payload,
          page: 1, // Reset strony przy zmianie filtru statusu
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_PAYMENT_STATUS_FILTER:
        return { 
          ...state, 
          paymentStatusFilter: action.payload,
          page: 1, // Reset strony przy zmianie filtru płatności
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
      console.warn('Nie można zapisać stanu listy zamówień zakupu do localStorage:', error);
    }
  }

  return newState;
};

// Provider
export const PurchaseOrderListStateProvider = ({ children }) => {
  const [state, dispatch] = useReducer(purchaseOrderListStateReducer, initialState);

  // Ładowanie stanu z localStorage przy inicjalizacji
  useEffect(() => {
    try {
      const savedState = localStorage.getItem(STORAGE_KEY);
      if (savedState) {
        const parsedState = JSON.parse(savedState);
        // Sprawdź czy zapisany stan nie jest zbyt stary (np. starszy niż 24h)
        const maxAge = 24 * 60 * 60 * 1000; // 24 godziny w milisekundach
        if (parsedState.lastUpdated && (Date.now() - parsedState.lastUpdated) < maxAge) {
          dispatch({ type: actionTypes.LOAD_STATE, payload: parsedState });
        }
      }
    } catch (error) {
      console.warn('Nie można załadować stanu listy zamówień zakupu z localStorage:', error);
    }
  }, []);

  // Akcje
  const actions = {
    setSearchTerm: (searchTerm) => dispatch({ type: actionTypes.SET_SEARCH_TERM, payload: searchTerm }),
    setStatusFilter: (statusFilter) => dispatch({ type: actionTypes.SET_STATUS_FILTER, payload: statusFilter }),
    setPaymentStatusFilter: (paymentStatusFilter) => dispatch({ type: actionTypes.SET_PAYMENT_STATUS_FILTER, payload: paymentStatusFilter }),
    setPage: (page) => dispatch({ type: actionTypes.SET_PAGE, payload: page }),
    setPageSize: (pageSize) => dispatch({ type: actionTypes.SET_PAGE_SIZE, payload: pageSize }),
    setTableSort: (tableSort) => dispatch({ type: actionTypes.SET_TABLE_SORT, payload: tableSort }),
    resetState: () => dispatch({ type: actionTypes.RESET_STATE })
  };

  return (
    <PurchaseOrderListStateContext.Provider value={{ state, actions }}>
      {children}
    </PurchaseOrderListStateContext.Provider>
  );
};

// Hook do używania kontekstu
export const usePurchaseOrderListState = () => {
  const context = useContext(PurchaseOrderListStateContext);
  if (!context) {
    throw new Error('usePurchaseOrderListState musi być używany wewnątrz PurchaseOrderListStateProvider');
  }
  return context;
}; 