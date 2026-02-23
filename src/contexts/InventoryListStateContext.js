import { createListStateContext } from './createListStateContext';

const actionTypes = {
  SET_SEARCH_TERM: 'SET_SEARCH_TERM',
  SET_SEARCH_CATEGORY: 'SET_SEARCH_CATEGORY',
  SET_SELECTED_WAREHOUSE: 'SET_SELECTED_WAREHOUSE',
  SET_CURRENT_TAB: 'SET_CURRENT_TAB',
  SET_PAGE: 'SET_PAGE',
  SET_PAGE_SIZE: 'SET_PAGE_SIZE',
  SET_TABLE_SORT: 'SET_TABLE_SORT',
  SET_SELECTED_WAREHOUSE_FOR_VIEW: 'SET_SELECTED_WAREHOUSE_FOR_VIEW',
  SET_WAREHOUSE_ITEMS_PAGE: 'SET_WAREHOUSE_ITEMS_PAGE',
  SET_WAREHOUSE_ITEMS_PAGE_SIZE: 'SET_WAREHOUSE_ITEMS_PAGE_SIZE',
  SET_WAREHOUSE_SEARCH_TERM: 'SET_WAREHOUSE_SEARCH_TERM',
  SET_WAREHOUSE_ITEMS_SORT: 'SET_WAREHOUSE_ITEMS_SORT',
  SET_RESERVATION_FILTER: 'SET_RESERVATION_FILTER',
  SET_MO_FILTER: 'SET_MO_FILTER',
  RESET_STATE: 'RESET_STATE',
  LOAD_STATE: 'LOAD_STATE',
};

const initialState = {
  searchTerm: '',
  searchCategory: '',
  selectedWarehouse: '',
  currentTab: 0,
  page: 1,
  pageSize: 10,
  tableSort: {
    field: 'name',
    order: 'asc',
  },
  selectedWarehouseForView: null,
  warehouseItemsPage: 1,
  warehouseItemsPageSize: 10,
  warehouseSearchTerm: '',
  warehouseItemsSort: {
    field: 'name',
    order: 'asc',
  },
  reservationFilter: 'all',
  moFilter: '',
  lastUpdated: Date.now(),
};

const { Context, Provider, useListState } = createListStateContext({
  name: 'Inventory',
  storageKey: 'inventoryListState',
  initialState,
  actionTypes,
  reducerCases: (state, action) => {
    switch (action.type) {
      case actionTypes.SET_SEARCH_TERM:
        return { ...state, searchTerm: action.payload, page: 1, lastUpdated: Date.now() };
      case actionTypes.SET_SEARCH_CATEGORY:
        return { ...state, searchCategory: action.payload, page: 1, lastUpdated: Date.now() };
      case actionTypes.SET_SELECTED_WAREHOUSE:
        return { ...state, selectedWarehouse: action.payload, page: 1, lastUpdated: Date.now() };
      case actionTypes.SET_CURRENT_TAB:
        return { ...state, currentTab: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_PAGE:
        return { ...state, page: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_PAGE_SIZE:
        return { ...state, pageSize: action.payload, page: 1, lastUpdated: Date.now() };
      case actionTypes.SET_TABLE_SORT:
        return { ...state, tableSort: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_SELECTED_WAREHOUSE_FOR_VIEW:
        return { ...state, selectedWarehouseForView: action.payload, warehouseItemsPage: 1, lastUpdated: Date.now() };
      case actionTypes.SET_WAREHOUSE_ITEMS_PAGE:
        return { ...state, warehouseItemsPage: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_WAREHOUSE_ITEMS_PAGE_SIZE:
        return { ...state, warehouseItemsPageSize: action.payload, warehouseItemsPage: 1, lastUpdated: Date.now() };
      case actionTypes.SET_WAREHOUSE_SEARCH_TERM:
        return { ...state, warehouseSearchTerm: action.payload, warehouseItemsPage: 1, lastUpdated: Date.now() };
      case actionTypes.SET_WAREHOUSE_ITEMS_SORT:
        return { ...state, warehouseItemsSort: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_RESERVATION_FILTER:
        return { ...state, reservationFilter: action.payload, lastUpdated: Date.now() };
      case actionTypes.SET_MO_FILTER:
        return { ...state, moFilter: action.payload, lastUpdated: Date.now() };
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
    setSearchCategory: (cat) => dispatch({ type: actionTypes.SET_SEARCH_CATEGORY, payload: cat }),
    setSelectedWarehouse: (id) => dispatch({ type: actionTypes.SET_SELECTED_WAREHOUSE, payload: id }),
    setCurrentTab: (tab) => dispatch({ type: actionTypes.SET_CURRENT_TAB, payload: tab }),
    setPage: (page) => dispatch({ type: actionTypes.SET_PAGE, payload: page }),
    setPageSize: (size) => dispatch({ type: actionTypes.SET_PAGE_SIZE, payload: size }),
    setTableSort: (sort) => dispatch({ type: actionTypes.SET_TABLE_SORT, payload: sort }),
    setSelectedWarehouseForView: (wh) => dispatch({ type: actionTypes.SET_SELECTED_WAREHOUSE_FOR_VIEW, payload: wh }),
    setWarehouseItemsPage: (page) => dispatch({ type: actionTypes.SET_WAREHOUSE_ITEMS_PAGE, payload: page }),
    setWarehouseItemsPageSize: (size) => dispatch({ type: actionTypes.SET_WAREHOUSE_ITEMS_PAGE_SIZE, payload: size }),
    setWarehouseSearchTerm: (term) => dispatch({ type: actionTypes.SET_WAREHOUSE_SEARCH_TERM, payload: term }),
    setWarehouseItemsSort: (sort) => dispatch({ type: actionTypes.SET_WAREHOUSE_ITEMS_SORT, payload: sort }),
    setReservationFilter: (filter) => dispatch({ type: actionTypes.SET_RESERVATION_FILTER, payload: filter }),
    setMoFilter: (filter) => dispatch({ type: actionTypes.SET_MO_FILTER, payload: filter }),
    resetState: () => dispatch({ type: actionTypes.RESET_STATE }),
  }),
});

export default Context;
export const InventoryListStateProvider = Provider;
export const useInventoryListState = useListState;
