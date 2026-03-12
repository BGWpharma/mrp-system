import { useState } from 'react';
import { updateOrderStatus } from '../../services/orders';
import { useNotification } from '../useNotification';
import { useTranslation } from '../useTranslation';
import { invalidateCache } from '../../utils/orderCache';

export function useOrderStatus({ order, currentUser, refreshOrderData }) {
  const { t } = useTranslation('orders');
  const { showError, showSuccess } = useNotification();

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');

  const handleStatusClick = () => {
    setNewStatus(order?.status || 'Nowe');
    setStatusDialogOpen(true);
  };

  const handleStatusUpdate = async () => {
    try {
      await updateOrderStatus(order.id, newStatus, currentUser.uid);
      
      invalidateCache(order.id);
      await refreshOrderData();
      
      showSuccess(t('orderDetails.notifications.statusUpdated'));
      setStatusDialogOpen(false);
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu zamówienia:', error);
      showError(t('orderDetails.notifications.statusUpdateError'));
    }
  };

  return {
    statusDialogOpen,
    setStatusDialogOpen,
    newStatus,
    setNewStatus,
    handleStatusClick,
    handleStatusUpdate
  };
}
