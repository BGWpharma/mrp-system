import React, { createContext, useContext, useReducer, useEffect } from 'react';

// Kontekst dla zarządzania stanem listy faktur
const InvoiceListStateContext = createContext();

// Klucz dla localStorage
const STORAGE_KEY = 'invoiceListState';

// Stan początkowy
const initialState = {
  searchTerm: '',
  page: 0,
  rowsPerPage: 10,
  filtersExpanded: false,
  filters: {
    status: '',
    customerId: '',
    orderId: '',
    invoiceType: '', // all, invoice, proforma
    fromDate: null,
    toDate: null
  },
  tableSort: {
    field: 'issueDate',
    order: 'desc'
  },
  lastUpdated: Date.now()
};

// Akcje
const actionTypes = {
  SET_SEARCH_TERM: 'SET_SEARCH_TERM',
  SET_PAGE: 'SET_PAGE',
  SET_ROWS_PER_PAGE: 'SET_ROWS_PER_PAGE',
  SET_FILTERS_EXPANDED: 'SET_FILTERS_EXPANDED',
  SET_FILTERS: 'SET_FILTERS',
  UPDATE_FILTER: 'UPDATE_FILTER',
  RESET_FILTERS: 'RESET_FILTERS',
  SET_TABLE_SORT: 'SET_TABLE_SORT',
  RESET_STATE: 'RESET_STATE',
  LOAD_STATE: 'LOAD_STATE'
};

// Reducer do zarządzania stanem
const invoiceListStateReducer = (state, action) => {
  const newState = (() => {
    switch (action.type) {
      case actionTypes.SET_SEARCH_TERM:
        return { 
          ...state, 
          searchTerm: action.payload,
          page: 0, // Reset strony przy zmianie wyszukiwania
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
          page: 0, // Reset strony przy zmianie rozmiaru strony
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_FILTERS_EXPANDED:
        return { 
          ...state, 
          filtersExpanded: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_FILTERS:
        return { 
          ...state, 
          filters: action.payload,
          page: 0, // Reset strony przy zmianie filtrów
          lastUpdated: Date.now()
        };
      
      case actionTypes.UPDATE_FILTER:
        return { 
          ...state, 
          filters: {
            ...state.filters,
            [action.payload.name]: action.payload.value
          },
          lastUpdated: Date.now()
        };
      
      case actionTypes.RESET_FILTERS:
        return { 
          ...state, 
          filters: initialState.filters,
          page: 0,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_TABLE_SORT:
        return { 
          ...state, 
          tableSort: action.payload,
          page: 0, // Reset strony przy zmianie sortowania
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
      // Nie zapisuj dat do localStorage - mogą powodować problemy z serializacją
      const stateToSave = {
        ...newState,
        filters: {
          ...newState.filters,
          fromDate: newState.filters.fromDate ? newState.filters.fromDate.toISOString() : null,
          toDate: newState.filters.toDate ? newState.filters.toDate.toISOString() : null
        }
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (error) {
      console.warn('Nie można zapisać stanu listy faktur do localStorage:', error);
    }
  }

  return newState;
};

// Provider
export const InvoiceListStateProvider = ({ children }) => {
  const [state, dispatch] = useReducer(invoiceListStateReducer, initialState);

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
          // Przekonwertuj daty z ISO string z powrotem do obiektów Date
          const stateToLoad = {
            ...parsedState,
            filters: {
              ...parsedState.filters,
              fromDate: parsedState.filters.fromDate ? new Date(parsedState.filters.fromDate) : null,
              toDate: parsedState.filters.toDate ? new Date(parsedState.filters.toDate) : null
            }
          };
          dispatch({ type: actionTypes.LOAD_STATE, payload: stateToLoad });
          console.log('Załadowano stan listy faktur z localStorage');
        } else {
          console.log('Stan listy faktur jest zbyt stary, używam stanu domyślnego');
          // Wyczyść stary stan
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.warn('Błąd podczas ładowania stanu listy faktur z localStorage:', error);
      // W przypadku błędu, wyczyść potencjalnie uszkodzone dane
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Funkcje pomocnicze do zarządzania stanem
  const actions = {
    setSearchTerm: (term) => dispatch({ type: actionTypes.SET_SEARCH_TERM, payload: term }),
    setPage: (page) => dispatch({ type: actionTypes.SET_PAGE, payload: page }),
    setRowsPerPage: (size) => dispatch({ type: actionTypes.SET_ROWS_PER_PAGE, payload: size }),
    setFiltersExpanded: (expanded) => dispatch({ type: actionTypes.SET_FILTERS_EXPANDED, payload: expanded }),
    setFilters: (filters) => dispatch({ type: actionTypes.SET_FILTERS, payload: filters }),
    updateFilter: (name, value) => dispatch({ type: actionTypes.UPDATE_FILTER, payload: { name, value } }),
    resetFilters: () => dispatch({ type: actionTypes.RESET_FILTERS }),
    setTableSort: (tableSort) => dispatch({ type: actionTypes.SET_TABLE_SORT, payload: tableSort }),
    resetState: () => dispatch({ type: actionTypes.RESET_STATE })
  };

  return (
    <InvoiceListStateContext.Provider value={{ state, actions }}>
      {children}
    </InvoiceListStateContext.Provider>
  );
};

// Hook do używania kontekstu
export const useInvoiceListState = () => {
  const context = useContext(InvoiceListStateContext);
  if (!context) {
    throw new Error('useInvoiceListState musi być używany w InvoiceListStateProvider');
  }
  return context;
};

export default InvoiceListStateContext;

