import React, { createContext, useContext, useReducer, useEffect } from 'react';

// Kontekst dla zarządzania stanem listy dokumentów CMR
const CmrListStateContext = createContext();

// Klucz dla localStorage
const STORAGE_KEY = 'cmrListState';

// Stan początkowy
const initialState = {
  searchTerm: '',
  statusFilter: '',
  itemFilter: '',
  page: 1,
  pageSize: 10,
  tableSort: {
    field: 'issueDate',
    order: 'desc' // Domyślnie od najnowszych
  },
  lastUpdated: Date.now()
};

// Akcje
const actionTypes = {
  SET_SEARCH_TERM: 'SET_SEARCH_TERM',
  SET_STATUS_FILTER: 'SET_STATUS_FILTER',
  SET_ITEM_FILTER: 'SET_ITEM_FILTER',
  SET_PAGE: 'SET_PAGE',
  SET_PAGE_SIZE: 'SET_PAGE_SIZE',
  SET_TABLE_SORT: 'SET_TABLE_SORT',
  RESET_STATE: 'RESET_STATE',
  LOAD_STATE: 'LOAD_STATE'
};

// Reducer do zarządzania stanem
const cmrListStateReducer = (state, action) => {
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
      
      case actionTypes.SET_ITEM_FILTER:
        return { 
          ...state, 
          itemFilter: action.payload,
          page: 1, // Reset strony przy zmianie filtru pozycji
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
      console.warn('Nie można zapisać stanu listy CMR do localStorage:', error);
    }
  }

  return newState;
};

// Provider
export const CmrListStateProvider = ({ children }) => {
  const [state, dispatch] = useReducer(cmrListStateReducer, initialState);

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
          console.log('Załadowano stan listy CMR z localStorage');
        } else {
          console.log('Stan listy CMR jest zbyt stary, używam stanu domyślnego');
          // Wyczyść stary stan
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.warn('Błąd podczas ładowania stanu listy CMR z localStorage:', error);
      // W przypadku błędu, wyczyść potencjalnie uszkodzone dane
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Funkcje pomocnicze do zarządzania stanem
  const actions = {
    setSearchTerm: (term) => dispatch({ type: actionTypes.SET_SEARCH_TERM, payload: term }),
    setStatusFilter: (status) => dispatch({ type: actionTypes.SET_STATUS_FILTER, payload: status }),
    setItemFilter: (itemFilter) => dispatch({ type: actionTypes.SET_ITEM_FILTER, payload: itemFilter }),
    setPage: (page) => dispatch({ type: actionTypes.SET_PAGE, payload: page }),
    setPageSize: (size) => dispatch({ type: actionTypes.SET_PAGE_SIZE, payload: size }),
    setTableSort: (sort) => dispatch({ type: actionTypes.SET_TABLE_SORT, payload: sort }),
    resetState: () => dispatch({ type: actionTypes.RESET_STATE })
  };

  return (
    <CmrListStateContext.Provider value={{ state, actions }}>
      {children}
    </CmrListStateContext.Provider>
  );
};

// Hook do używania kontekstu
export const useCmrListState = () => {
  const context = useContext(CmrListStateContext);
  if (!context) {
    throw new Error('useCmrListState musi być używany w CmrListStateProvider');
  }
  return context;
};

export default CmrListStateContext;
