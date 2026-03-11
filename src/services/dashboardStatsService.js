import {
  collection,
  query,
  where,
  getCountFromServer
} from 'firebase/firestore';
import { db } from './firebase/config';

const ORDERS_COLLECTION = 'orders';
const PURCHASE_ORDERS_COLLECTION = 'purchaseOrders';
const PRODUCTION_TASKS_COLLECTION = 'productionTasks';
const INVENTORY_COLLECTION = 'inventory';

const ACTIVE_TASK_STATUSES = ['Zaplanowane', 'W trakcie', 'Wstrzymane'];

/**
 * Pobiera statystyki zamówień za pomocą server-side count.
 * Zamiast ściągać wszystkie dokumenty, wykonuje 2 lekkie zapytania count.
 */
export const getDashboardOrdersStats = async () => {
  const colRef = collection(db, ORDERS_COLLECTION);

  const [totalSnap, inProgressSnap] = await Promise.all([
    getCountFromServer(query(colRef)),
    getCountFromServer(
      query(colRef, where('status', '==', 'W realizacji'))
    )
  ]);

  return {
    total: totalSnap.data().count,
    inProgress: inProgressSnap.data().count
  };
};

/**
 * Pobiera liczbę aktywnych zadań produkcyjnych (server-side count).
 */
export const getDashboardProductionStats = async () => {
  const colRef = collection(db, PRODUCTION_TASKS_COLLECTION);

  const counts = await Promise.all(
    ACTIVE_TASK_STATUSES.map(status =>
      getCountFromServer(query(colRef, where('status', '==', status)))
    )
  );

  const activeCount = counts.reduce((sum, snap) => sum + snap.data().count, 0);
  return { activeCount };
};

/**
 * Pobiera liczbę zamówień zakupu (server-side count).
 */
export const getDashboardPurchaseOrdersCount = async () => {
  const snap = await getCountFromServer(
    query(collection(db, PURCHASE_ORDERS_COLLECTION))
  );
  return { total: snap.data().count };
};

/**
 * Pobiera liczbę pozycji magazynowych (server-side count).
 */
export const getDashboardInventoryCount = async () => {
  const snap = await getCountFromServer(
    query(collection(db, INVENTORY_COLLECTION))
  );
  return { total: snap.data().count };
};

/**
 * Pobiera wszystkie statystyki dashboardu jednym wywołaniem (równoległe zapytania count).
 */
export const getAllDashboardStats = async () => {
  const [orders, production, purchaseOrders, inventory] = await Promise.all([
    getDashboardOrdersStats(),
    getDashboardProductionStats(),
    getDashboardPurchaseOrdersCount(),
    getDashboardInventoryCount()
  ]);

  return { orders, production, purchaseOrders, inventory };
};
