import { createListStateContext } from './createListStateContext';

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
  LOAD_STATE: 'LOAD_STATE',
};

const initialState = {
  searchTerm: '',
  selectedCustomerId: '',
  notesFilter: null,
  tabValue: 0,
  page: 1,
  limit: 10,
  tableSort: {
    field: 'name',
    order: 'asc',
  },
  expandedPanel: null,
  lastUpdated: Date.now(),
};

const { Context, Provider, useListState } = createListStateContext({
  name: 'Recipe',
  storageKey: 'recipeListState',
  initialState,
  actionTypes,
  reducerCases: (state, action) => {
    switch (action.type) {
      case actionTypes.SET_SEARCH_TERM:
        return { ...state, searchTerm: action.payload, page: 1, lastUpdated: Date.now() };
      case actionTypes.SET_SELECTED_CUSTOMER_ID:
        return { ...state, selectedCustomerId: action.payload, page: 1, lastUpdated: Date.now() };
      case actionTypes.SET_NOTES_FILTER:
        return { ...state, notesFilter: action.payload, page: 1, lastUpdated: Date.now() };
      case actionTypes.SET_TAB_VALUE:
        return { ...state, tabValue: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_PAGE:
        return { ...state, page: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_LIMIT:
        return { ...state, limit: action.payload, page: 1, lastUpdated: Date.now() };
      case actionTypes.SET_TABLE_SORT:
        return { ...state, tableSort: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_EXPANDED_PANEL:
        return { ...state, expandedPanel: action.payload, lastUpdated: Date.now() };
      case actionTypes.RESET_STATE:
        return { ...initialState, lastUpdated: Date.now() };
      case actionTypes.LOAD_STATE:
        return { ...action.payload, lastUpdated: Date.now() };
      default:
        return state;
    }
  },
  createActions: (dispatch) => ({
    setSearchTerm: (term) => dispatch({ type: actionTypes.SET_SEARCH_TERM, payload: term }),
    setSelectedCustomerId: (id) => dispatch({ type: actionTypes.SET_SELECTED_CUSTOMER_ID, payload: id }),
    setNotesFilter: (filter) => dispatch({ type: actionTypes.SET_NOTES_FILTER, payload: filter }),
    setTabValue: (tab) => dispatch({ type: actionTypes.SET_TAB_VALUE, payload: tab }),
    setPage: (page) => dispatch({ type: actionTypes.SET_PAGE, payload: page }),
    setLimit: (limit) => dispatch({ type: actionTypes.SET_LIMIT, payload: limit }),
    setTableSort: (sort) => dispatch({ type: actionTypes.SET_TABLE_SORT, payload: sort }),
    setExpandedPanel: (panel) => dispatch({ type: actionTypes.SET_EXPANDED_PANEL, payload: panel }),
    resetState: () => dispatch({ type: actionTypes.RESET_STATE }),
  }),
});

export default Context;
export const RecipeListStateProvider = Provider;
export const useRecipeListState = useListState;
