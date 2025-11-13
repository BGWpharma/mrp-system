import React, { createContext, useContext, useReducer, useEffect } from 'react';

// Kontekst dla zarządzania stanem listy receptur
const RecipeListStateContext = createContext();

// Klucz dla localStorage
const STORAGE_KEY = 'recipeListState';

// Stan początkowy
const initialState = {
  searchTerm: '',
  selectedCustomerId: '',
  notesFilter: null, // null = wszystkie, true = z notatkami, false = bez notatek
  tabValue: 0, // 0 - lista, 1 - grupowane wg klienta
  page: 1,
  limit: 10,
  tableSort: {
    field: 'name',
    order: 'asc'
  },
  expandedPanel: null, // dla widoku grupowanego
  lastUpdated: Date.now()
};

// Akcje
const actionTypes = {
  SET_SEARCH_TERM: 'SET_SEARCH_TERM',
  SET_SELECTED_CUSTOMER_ID: 'SET_SELECTED_CUSTOMER_ID',
  SET_NOTES_FILTER: 'SET_NOTES_FILTER',
  SET_TAB_VALUE: 'SET_TAB_VALUE',
  SET_PAGE: 'SET_PAGE',
  SET_LIMIT: 'SET_LIMIT',
  SET_TABLE_SORT: 'SET_TABLE_SORT',
  SET_EXPANDED_PANEL: 'SET_EXPANDED_PANEL',
  RESET_STATE: 'RESET_STATE',
  LOAD_STATE: 'LOAD_STATE'
};

// Reducer do zarządzania stanem
const recipeListStateReducer = (state, action) => {
  const newState = (() => {
    switch (action.type) {
      case actionTypes.SET_SEARCH_TERM:
        return { 
          ...state, 
          searchTerm: action.payload,
          page: 1, // Reset strony przy zmianie wyszukiwania
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_SELECTED_CUSTOMER_ID:
        return { 
          ...state, 
          selectedCustomerId: action.payload,
          page: 1, // Reset strony przy zmianie klienta
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_NOTES_FILTER:
        return { 
          ...state, 
          notesFilter: action.payload,
          page: 1, // Reset strony przy zmianie filtra notatek
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_TAB_VALUE:
        return { 
          ...state, 
          tabValue: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_PAGE:
        return { 
          ...state, 
          page: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_LIMIT:
        return { 
          ...state, 
          limit: action.payload,
          page: 1, // Reset strony przy zmianie limitu
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_TABLE_SORT:
        return { 
          ...state, 
          tableSort: action.payload,
          lastUpdated: Date.now()
        };
      
      case actionTypes.SET_EXPANDED_PANEL:
        return { 
          ...state, 
          expandedPanel: action.payload,
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
      console.warn('Nie można zapisać stanu listy receptur do localStorage:', error);
    }
  }

  return newState;
};

// Provider
export const RecipeListStateProvider = ({ children }) => {
  const [state, dispatch] = useReducer(recipeListStateReducer, initialState);

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
      console.warn('Błąd podczas ładowania stanu listy receptur z localStorage:', error);
      // W przypadku błędu, wyczyść potencjalnie uszkodzone dane
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // Funkcje pomocnicze do zarządzania stanem
  const actions = {
    setSearchTerm: (term) => dispatch({ type: actionTypes.SET_SEARCH_TERM, payload: term }),
    setSelectedCustomerId: (customerId) => dispatch({ type: actionTypes.SET_SELECTED_CUSTOMER_ID, payload: customerId }),
    setNotesFilter: (filter) => dispatch({ type: actionTypes.SET_NOTES_FILTER, payload: filter }),
    setTabValue: (tab) => dispatch({ type: actionTypes.SET_TAB_VALUE, payload: tab }),
    setPage: (page) => dispatch({ type: actionTypes.SET_PAGE, payload: page }),
    setLimit: (limit) => dispatch({ type: actionTypes.SET_LIMIT, payload: limit }),
    setTableSort: (sort) => dispatch({ type: actionTypes.SET_TABLE_SORT, payload: sort }),
    setExpandedPanel: (panel) => dispatch({ type: actionTypes.SET_EXPANDED_PANEL, payload: panel }),
    resetState: () => dispatch({ type: actionTypes.RESET_STATE })
  };

  return (
    <RecipeListStateContext.Provider value={{ state, actions }}>
      {children}
    </RecipeListStateContext.Provider>
  );
};

// Hook do używania kontekstu
export const useRecipeListState = () => {
  const context = useContext(RecipeListStateContext);
  if (!context) {
    throw new Error('useRecipeListState musi być używany w RecipeListStateProvider');
  }
  return context;
};

export default RecipeListStateContext; 