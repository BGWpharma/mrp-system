import { createListStateContext } from './createListStateContext';

const actionTypes = {
  SET_SEARCH_TERM: 'SET_SEARCH_TERM',
  SET_STATUS_FILTER: 'SET_STATUS_FILTER',
  SET_PAYMENT_STATUS_FILTER: 'SET_PAYMENT_STATUS_FILTER',
  SET_PAGE: 'SET_PAGE',
  SET_PAGE_SIZE: 'SET_PAGE_SIZE',
  SET_TABLE_SORT: 'SET_TABLE_SORT',
  RESET_STATE: 'RESET_STATE',
  LOAD_STATE: 'LOAD_STATE',
};

const initialState = {
  searchTerm: '',
  statusFilter: 'all',
  paymentStatusFilter: 'all',
  page: 1,
  pageSize: 10,
  tableSort: {
    field: 'createdAt',
    order: 'desc',
  },
  lastUpdated: Date.now(),
};

const { Context, Provider, useListState } = createListStateContext({
  name: 'PurchaseOrder',
  storageKey: 'purchaseOrderListState',
  initialState,
  actionTypes,
  reducerCases: (state, action) => {
    switch (action.type) {
      case actionTypes.SET_SEARCH_TERM:
        return { ...state, searchTerm: action.payload, page: 1, lastUpdated: Date.now() };
      case actionTypes.SET_STATUS_FILTER:
        return { ...state, statusFilter: action.payload, page: 1, lastUpdated: Date.now() };
      case actionTypes.SET_PAYMENT_STATUS_FILTER:
        return { ...state, paymentStatusFilter: action.payload, page: 1, lastUpdated: Date.now() };
      case actionTypes.SET_PAGE:
        return { ...state, page: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_PAGE_SIZE:
        return { ...state, pageSize: action.payload, page: 1, lastUpdated: Date.now() };
      case actionTypes.SET_TABLE_SORT:
        return { ...state, tableSort: action.payload, lastUpdated: Date.now() };
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
    setStatusFilter: (status) => dispatch({ type: actionTypes.SET_STATUS_FILTER, payload: status }),
    setPaymentStatusFilter: (filter) => dispatch({ type: actionTypes.SET_PAYMENT_STATUS_FILTER, payload: filter }),
    setPage: (page) => dispatch({ type: actionTypes.SET_PAGE, payload: page }),
    setPageSize: (size) => dispatch({ type: actionTypes.SET_PAGE_SIZE, payload: size }),
    setTableSort: (sort) => dispatch({ type: actionTypes.SET_TABLE_SORT, payload: sort }),
    resetState: () => dispatch({ type: actionTypes.RESET_STATE }),
  }),
});

export default Context;
export const PurchaseOrderListStateProvider = Provider;
export const usePurchaseOrderListState = useListState;
