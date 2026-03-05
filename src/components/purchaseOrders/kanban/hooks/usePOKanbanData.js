import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  getPurchaseOrdersOptimized,
  PURCHASE_ORDER_STATUSES,
  KANBAN_COLUMN_ORDER,
  clearPurchaseOrdersCache
} from '../../../../services/purchaseOrders';

const DEFAULT_MONTHS_BACK = 3;
const DEFAULT_MONTHS_FORWARD = 3;

const getDefaultDateRange = () => {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - DEFAULT_MONTHS_BACK, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + DEFAULT_MONTHS_FORWARD + 1, 0);
  return { from, to };
};

const toDate = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val.toDate === 'function') return val.toDate();
  if (typeof val === 'string' || typeof val === 'number') {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  if (val.seconds) return new Date(val.seconds * 1000);
  return null;
};

const isOrderInRange = (order, from, to) => {
  const dates = [
    toDate(order.orderDate),
    toDate(order.expectedDeliveryDate),
    toDate(order.createdAt)
  ].filter(Boolean);

  if (dates.length === 0) return true;
  return dates.some(d => d >= from && d <= to);
};

const groupByStatus = (orders) => {
  const grouped = {};
  for (const status of KANBAN_COLUMN_ORDER) {
    grouped[status] = [];
  }
  for (const order of orders) {
    const status = order.status || PURCHASE_ORDER_STATUSES.DRAFT;
    if (grouped[status]) {
      grouped[status].push(order);
    } else {
      grouped[status] = [order];
    }
  }
  return grouped;
};

export const usePOKanbanData = () => {
  const defaultRange = getDefaultDateRange();
  const [allOrdersRaw, setAllOrdersRaw] = useState([]);
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const fetchOrders = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);

      if (forceRefresh) {
        clearPurchaseOrdersCache();
      }

      const result = await getPurchaseOrdersOptimized({
        page: 1,
        pageSize: 9999,
        sortField: 'createdAt',
        sortOrder: 'desc',
        forceRefresh
      });

      if (!mountedRef.current) return;

      const orders = result?.items || result?.data || [];
      const activeOrders = Array.isArray(orders)
        ? orders.filter(o => !o.archived)
        : [];

      setAllOrdersRaw(activeOrders);
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Błąd podczas pobierania zamówień dla Kanban:', err);
      setError(err.message);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchOrders();
    return () => { mountedRef.current = false; };
  }, [fetchOrders]);

  const filteredOrders = useMemo(() => {
    if (!dateFrom || !dateTo) return allOrdersRaw;
    return allOrdersRaw.filter(order => isOrderInRange(order, dateFrom, dateTo));
  }, [allOrdersRaw, dateFrom, dateTo]);

  const groupedOrders = useMemo(() => groupByStatus(filteredOrders), [filteredOrders]);

  const updateOrderLocally = useCallback((orderId, updates) => {
    setAllOrdersRaw(prev => prev.map(o => o.id === orderId ? { ...o, ...updates } : o));
  }, []);

  const refresh = useCallback(() => fetchOrders(true), [fetchOrders]);

  return {
    allOrders: filteredOrders,
    totalCount: allOrdersRaw.length,
    filteredCount: filteredOrders.length,
    groupedOrders,
    loading,
    error,
    refresh,
    updateOrderLocally,
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo
  };
};
