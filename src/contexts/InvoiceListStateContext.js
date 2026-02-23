import { createListStateContext } from './createListStateContext';

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
  LOAD_STATE: 'LOAD_STATE',
};

const initialState = {
  searchTerm: '',
  page: 0,
  rowsPerPage: 10,
  filtersExpanded: false,
  filters: {
    status: '',
    customerId: '',
    orderId: '',
    invoiceType: '',
    fromDate: null,
    toDate: null,
  },
  tableSort: {
    field: 'issueDate',
    order: 'desc',
  },
  lastUpdated: Date.now(),
};

const { Context, Provider, useListState } = createListStateContext({
  name: 'Invoice',
  storageKey: 'invoiceListState',
  initialState,
  actionTypes,
  serialization: {
    serialize: (state) => ({
      ...state,
      filters: {
        ...state.filters,
        fromDate: state.filters.fromDate ? state.filters.fromDate.toISOString() : null,
        toDate: state.filters.toDate ? state.filters.toDate.toISOString() : null,
      },
    }),
    deserialize: (parsed) => ({
      ...parsed,
      filters: {
        ...parsed.filters,
        fromDate: parsed.filters.fromDate ? new Date(parsed.filters.fromDate) : null,
        toDate: parsed.filters.toDate ? new Date(parsed.filters.toDate) : null,
      },
    }),
  },
  reducerCases: (state, action) => {
    switch (action.type) {
      case actionTypes.SET_SEARCH_TERM:
        return { ...state, searchTerm: action.payload, page: 0, lastUpdated: Date.now() };
      case actionTypes.SET_PAGE:
        return { ...state, page: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_ROWS_PER_PAGE:
        return { ...state, rowsPerPage: action.payload, page: 0, lastUpdated: Date.now() };
      case actionTypes.SET_FILTERS_EXPANDED:
        return { ...state, filtersExpanded: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_FILTERS:
        return { ...state, filters: action.payload, page: 0, lastUpdated: Date.now() };
      case actionTypes.UPDATE_FILTER:
        return {
          ...state,
          filters: { ...state.filters, [action.payload.name]: action.payload.value },
          lastUpdated: Date.now(),
        };
      case actionTypes.RESET_FILTERS:
        return { ...state, filters: initialState.filters, page: 0, lastUpdated: Date.now() };
      case actionTypes.SET_TABLE_SORT:
        return { ...state, tableSort: action.payload, page: 0, lastUpdated: Date.now() };
      case actionTypes.RESET_STATE:
        return { ...initialState, lastUpdated: Date.now() };
      case actionTypes.LOAD_STATE:
        return {
          ...initialState,
          ...action.payload,
          tableSort: action.payload.tableSort || initialState.tableSort,
          lastUpdated: Date.now(),
        };
      default:
        return state;
    }
  },
  createActions: (dispatch) => ({
    setSearchTerm: (term) => dispatch({ type: actionTypes.SET_SEARCH_TERM, payload: term }),
    setPage: (page) => dispatch({ type: actionTypes.SET_PAGE, payload: page }),
    setRowsPerPage: (size) => dispatch({ type: actionTypes.SET_ROWS_PER_PAGE, payload: size }),
    setFiltersExpanded: (expanded) => dispatch({ type: actionTypes.SET_FILTERS_EXPANDED, payload: expanded }),
    setFilters: (filters) => dispatch({ type: actionTypes.SET_FILTERS, payload: filters }),
    updateFilter: (name, value) => dispatch({ type: actionTypes.UPDATE_FILTER, payload: { name, value } }),
    resetFilters: () => dispatch({ type: actionTypes.RESET_FILTERS }),
    setTableSort: (sort) => dispatch({ type: actionTypes.SET_TABLE_SORT, payload: sort }),
    resetState: () => dispatch({ type: actionTypes.RESET_STATE }),
  }),
});

export default Context;
export const InvoiceListStateProvider = Provider;
export const useInvoiceListState = useListState;
