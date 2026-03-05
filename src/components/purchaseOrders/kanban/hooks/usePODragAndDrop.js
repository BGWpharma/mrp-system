import { useState, useCallback } from 'react';
import {
  validateStatusTransition,
  updatePurchaseOrderStatus,
  KANBAN_COLUMN_ORDER
} from '../../../../services/purchaseOrders';
import { useNotification } from '../../../../hooks/useNotification';
import { useAuth } from '../../../../hooks/useAuth';

export const usePODragAndDrop = ({ groupedOrders, updateOrderLocally, refresh }) => {
  const [activeOrder, setActiveOrder] = useState(null);
  const { showSuccess, showError } = useNotification();
  const { currentUser } = useAuth();

  const findColumnForOrder = useCallback((orderId) => {
    for (const status of KANBAN_COLUMN_ORDER) {
      const orders = groupedOrders[status] || [];
      if (orders.some(o => o.id === orderId)) {
        return status;
      }
    }
    return null;
  }, [groupedOrders]);

  const handleDragStart = useCallback((event) => {
    const { active } = event;
    const orderId = active.id;
    for (const status of KANBAN_COLUMN_ORDER) {
      const found = (groupedOrders[status] || []).find(o => o.id === orderId);
      if (found) {
        setActiveOrder(found);
        break;
      }
    }
  }, [groupedOrders]);

  const handleDragEnd = useCallback(async (event) => {
    const { active, over } = event;
    setActiveOrder(null);

    if (!over) return;

    const orderId = active.id;
    let targetStatus = null;

    if (over.id.startsWith('column-')) {
      targetStatus = over.id.replace('column-', '');
    } else {
      targetStatus = findColumnForOrder(over.id);
    }

    if (!targetStatus) return;

    const currentStatus = findColumnForOrder(orderId);
    if (!currentStatus || currentStatus === targetStatus) return;

    if (!validateStatusTransition(currentStatus, targetStatus)) {
      showError(`Nie można zmienić statusu z "${currentStatus}" na "${targetStatus}"`);
      return;
    }

    updateOrderLocally(orderId, { status: targetStatus });

    try {
      await updatePurchaseOrderStatus(orderId, targetStatus, currentUser?.uid);
      showSuccess('Status zamówienia został zaktualizowany');
    } catch (err) {
      console.error('Błąd podczas aktualizacji statusu:', err);
      updateOrderLocally(orderId, { status: currentStatus });
      showError('Błąd podczas zmiany statusu: ' + err.message);
    }
  }, [findColumnForOrder, updateOrderLocally, showError, showSuccess, currentUser]);

  const handleDragCancel = useCallback(() => {
    setActiveOrder(null);
  }, []);

  return {
    activeOrder,
    handleDragStart,
    handleDragEnd,
    handleDragCancel
  };
};
