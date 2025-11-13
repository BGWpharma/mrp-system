import React, { createContext, useContext, useReducer, useEffect, useMemo } from 'react';

// Kontekst dla zarządzania stanem listy zadań produkcyjnych
const TaskListStateContext = createContext();

// Klucz dla localStorage
const STORAGE_KEY = 'taskListState';

// Stan początkowy
const initialState = {
  searchTerm: '',
  statusFilter: '',
  page: 1,
  pageSize: 10,
  tableSort: {
    field: 'scheduledDate',
    order: 'asc'
  },
  lastUpdated: Date.now()
};

// Akcje
const actionTypes = {
  SET_SEARCH_TERM: 'SET_SEARCH_TERM',
  SET_STATUS_FILTER: 'SET_STATUS_FILTER',
  SET_PAGE: 'SET_PAGE',
  SET_PAGE_SIZE: 'SET_PAGE_SIZE',
  SET_TABLE_SORT: 'SET_TABLE_SORT',
  RESET_STATE: 'RESET_STATE',
  LOAD_STATE: 'LOAD_STATE'
};

// Reducer do zarządzania stanem
const taskListStateReducer = (state, action) => {
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
      console.warn('Nie można zapisać stanu listy zadań do localStorage:', error);
    }
  }

  return newState;
};

// Provider
export const TaskListStateProvider = ({ children }) => {
  const [state, dispatch] = useReducer(taskListStateReducer, initialState);

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
          console.log('Załadowano stan listy zadań z localStorage');
        } else {
          console.log('Stan listy zadań jest zbyt stary, używam stanu domyślnego');
          // Wyczyść stary stan
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.warn('Błąd podczas ładowania stanu listy zadań z localStorage:', error);
      // W przypadku błędu, wyczyść potencjalnie uszkodzone dane
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  // ⚡ OPTYMALIZACJA: Memoizuj akcje aby uniknąć niepotrzebnych rerenderów konsumentów kontekstu
  const actions = useMemo(() => ({
    setSearchTerm: (term) => dispatch({ type: actionTypes.SET_SEARCH_TERM, payload: term }),
    setStatusFilter: (status) => dispatch({ type: actionTypes.SET_STATUS_FILTER, payload: status }),
    setPage: (page) => dispatch({ type: actionTypes.SET_PAGE, payload: page }),
    setPageSize: (size) => dispatch({ type: actionTypes.SET_PAGE_SIZE, payload: size }),
    setTableSort: (sort) => dispatch({ type: actionTypes.SET_TABLE_SORT, payload: sort }),
    resetState: () => dispatch({ type: actionTypes.RESET_STATE })
  }), [dispatch]);

  // ⚡ OPTYMALIZACJA: Memoizuj wartość kontekstu aby uniknąć niepotrzebnych rerenderów
  const contextValue = useMemo(() => ({ state, actions }), [state, actions]);

  return (
    <TaskListStateContext.Provider value={contextValue}>
      {children}
    </TaskListStateContext.Provider>
  );
};

// Hook do używania kontekstu
export const useTaskListState = () => {
  const context = useContext(TaskListStateContext);
  if (!context) {
    throw new Error('useTaskListState musi być używany w TaskListStateProvider');
  }
  return context;
};

export default TaskListStateContext;