import React, { createContext, useContext, useReducer, useEffect } from 'react';

// Kontekst dla zarządzania stanem listy zamówień klientów
const OrderListStateContext = createContext();

// Klucz dla localStorage
const STORAGE_KEY = 'orderListState';

// Stan początkowy
const initialState = {
  searchTerm: '',
  debouncedSearchTerm: '',
  filters: {
    status: 'all',
    fromDate: '',
    toDate: '',
    customerId: ''
  },
  page: 1,
  rowsPerPage: 10,
  orderBy: 'orderDate',
  orderDirection: 'desc',
  showFilters: false,
  lastUpdated: Date.now()
};

// Akcje
const actionTypes = {
  SET_SEARCH_TERM: 'SET_SEARCH_TERM',
  SET_DEBOUNCED_SEARCH_TERM: 'SET_DEBOUNCED_SEARCH_TERM',
  SET_FILTERS: 'SET_FILTERS',
  SET_PAGE: 'SET_PAGE',
  SET_ROWS_PER_PAGE: 'SET_ROWS_PER_PAGE',
  SET_ORDER_BY: 'SET_ORDER_BY',
  SET_ORDER_DIRECTION: 'SET_ORDER_DIRECTION',
  SET_SHOW_FILTERS: 'SET_SHOW_FILTERS',
  RESET_FILTERS: 'RESET_FILTERS',
  RESET_STATE: 'RESET_STATE',
  LOAD_STATE: 'LOAD_STATE'
};

// Reducer do zarządzania stanem
const orderListStateReducer = (state, action) => {
  const newState = (() => {
    switch (action.type) {
      case actionTypes.SET_SEARCH_TERM:
        return { 
          ...state, 
          searchTerm: action.payload,
          page: 1,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_DEBOUNCED_SEARCH_TERM:
        return { 
          ...state, 
          debouncedSearchTerm: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_FILTERS:
        return { 
          ...state, 
          filters: { ...state.filters, ...action.payload },
          page: 1,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_PAGE:
        return { 
          ...state, 
          page: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_ROWS_PER_PAGE:
        return { 
          ...state, 
          rowsPerPage: action.payload,
          page: 1,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_ORDER_BY:
        return { 
          ...state, 
          orderBy: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_ORDER_DIRECTION:
        return { 
          ...state, 
          orderDirection: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_SHOW_FILTERS:
        return { 
          ...state, 
          showFilters: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.RESET_FILTERS:
        return { 
          ...state,
          filters: {
            status: 'all',
            fromDate: '',
            toDate: '',
            customerId: ''
          },
          searchTerm: '',
          debouncedSearchTerm: '',
          page: 1,
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
      console.warn('Nie można zapisać stanu listy zamówień do localStorage:', error);
    }
  }

  return newState;
};

// Provider
export const OrderListStateProvider = ({ children }) => {
  // Załaduj stan z localStorage przy inicjalizacji
  const loadInitialState = () => {
    try {
      const savedState = localStorage.getItem(STORAGE_KEY);
      if (savedState) {
        const parsedState = JSON.parse(savedState);
        return parsedState;
      }
    } catch (error) {
      console.warn('Nie można załadować stanu listy zamówień z localStorage:', error);
    }
    return initialState;
  };

  const [state, dispatch] = useReducer(orderListStateReducer, initialState, loadInitialState);

  // Akcje
  const actions = {
    setSearchTerm: (term) => dispatch({ type: actionTypes.SET_SEARCH_TERM, payload: term }),
    setDebouncedSearchTerm: (term) => dispatch({ type: actionTypes.SET_DEBOUNCED_SEARCH_TERM, payload: term }),
    setFilters: (filters) => dispatch({ type: actionTypes.SET_FILTERS, payload: filters }),
    setPage: (page) => dispatch({ type: actionTypes.SET_PAGE, payload: page }),
    setRowsPerPage: (size) => dispatch({ type: actionTypes.SET_ROWS_PER_PAGE, payload: size }),
    setOrderBy: (field) => dispatch({ type: actionTypes.SET_ORDER_BY, payload: field }),
    setOrderDirection: (direction) => dispatch({ type: actionTypes.SET_ORDER_DIRECTION, payload: direction }),
    setShowFilters: (show) => dispatch({ type: actionTypes.SET_SHOW_FILTERS, payload: show }),
    resetFilters: () => dispatch({ type: actionTypes.RESET_FILTERS }),
    resetState: () => dispatch({ type: actionTypes.RESET_STATE })
  };

  return (
    <OrderListStateContext.Provider value={{ state, actions }}>
      {children}
    </OrderListStateContext.Provider>
  );
};

// Hook do używania kontekstu
export const useOrderListState = () => {
  const context = useContext(OrderListStateContext);
  if (!context) {
    throw new Error('useOrderListState must be used within OrderListStateProvider');
  }
  return context;
};

export default OrderListStateContext;

