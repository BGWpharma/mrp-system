import { createListStateContext } from './createListStateContext';

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
  LOAD_STATE: 'LOAD_STATE',
};

const initialState = {
  searchTerm: '',
  debouncedSearchTerm: '',
  filters: {
    status: 'all',
    fromDate: '',
    toDate: '',
    customerId: '',
  },
  page: 1,
  rowsPerPage: 10,
  orderBy: 'orderDate',
  orderDirection: 'desc',
  showFilters: false,
  lastUpdated: Date.now(),
};

const { Context, Provider, useListState } = createListStateContext({
  name: 'Order',
  storageKey: 'orderListState',
  initialState,
  actionTypes,
  reducerCases: (state, action) => {
    switch (action.type) {
      case actionTypes.SET_SEARCH_TERM:
        return { ...state, searchTerm: action.payload, page: 1, lastUpdated: Date.now() };
      case actionTypes.SET_DEBOUNCED_SEARCH_TERM:
        return { ...state, debouncedSearchTerm: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_FILTERS:
        return { ...state, filters: { ...state.filters, ...action.payload }, page: 1, lastUpdated: Date.now() };
      case actionTypes.SET_PAGE:
        return { ...state, page: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_ROWS_PER_PAGE:
        return { ...state, rowsPerPage: action.payload, page: 1, lastUpdated: Date.now() };
      case actionTypes.SET_ORDER_BY:
        return { ...state, orderBy: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_ORDER_DIRECTION:
        return { ...state, orderDirection: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_SHOW_FILTERS:
        return { ...state, showFilters: action.payload, lastUpdated: Date.now() };
      case actionTypes.RESET_FILTERS:
        return {
          ...state,
          filters: { status: 'all', fromDate: '', toDate: '', customerId: '' },
          searchTerm: '',
          debouncedSearchTerm: '',
          page: 1,
          lastUpdated: Date.now(),
        };
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
    setDebouncedSearchTerm: (term) => dispatch({ type: actionTypes.SET_DEBOUNCED_SEARCH_TERM, payload: term }),
    setFilters: (filters) => dispatch({ type: actionTypes.SET_FILTERS, payload: filters }),
    setPage: (page) => dispatch({ type: actionTypes.SET_PAGE, payload: page }),
    setRowsPerPage: (size) => dispatch({ type: actionTypes.SET_ROWS_PER_PAGE, payload: size }),
    setOrderBy: (field) => dispatch({ type: actionTypes.SET_ORDER_BY, payload: field }),
    setOrderDirection: (dir) => dispatch({ type: actionTypes.SET_ORDER_DIRECTION, payload: dir }),
    setShowFilters: (show) => dispatch({ type: actionTypes.SET_SHOW_FILTERS, payload: show }),
    resetFilters: () => dispatch({ type: actionTypes.RESET_FILTERS }),
    resetState: () => dispatch({ type: actionTypes.RESET_STATE }),
  }),
});

export default Context;
export const OrderListStateProvider = Provider;
export const useOrderListState = useListState;
