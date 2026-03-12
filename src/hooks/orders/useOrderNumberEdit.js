import { useState } from 'react';
import { getOrderById, updateCustomerOrderNumber, validateOrderNumberFormat } from '../../services/orders';
import { useNotification } from '../useNotification';
import { invalidateCache } from '../../utils/orderCache';

export function useOrderNumberEdit({ order, orderId, currentUser, refreshOrderData, setOrder }) {
  const { showError, showSuccess } = useNotification();

  const [isEditingOrderNumber, setIsEditingOrderNumber] = useState(false);
  const [newOrderNumber, setNewOrderNumber] = useState('');
  const [orderNumberError, setOrderNumberError] = useState('');
  const [isUpdatingOrderNumber, setIsUpdatingOrderNumber] = useState(false);
  const [updateOrderNumberDialogOpen, setUpdateOrderNumberDialogOpen] = useState(false);

  const handleEditOrderNumberClick = () => {
    setNewOrderNumber(order?.orderNumber || '');
    setIsEditingOrderNumber(true);
    setOrderNumberError('');
  };

  const handleCancelEditOrderNumber = () => {
    setIsEditingOrderNumber(false);
    setNewOrderNumber('');
    setOrderNumberError('');
  };

  const handleOrderNumberChange = (e) => {
    const value = e.target.value.toUpperCase();
    setNewOrderNumber(value);
    
    if (value && !validateOrderNumberFormat(value)) {
      setOrderNumberError('Nieprawidłowy format numeru CO (np. CO00090)');
    } else if (value === order?.orderNumber) {
      setOrderNumberError('Numer jest taki sam jak aktualny');
    } else {
      setOrderNumberError('');
    }
  };

  const handleConfirmOrderNumberChange = () => {
    if (orderNumberError || !newOrderNumber) return;
    setUpdateOrderNumberDialogOpen(true);
  };

  const handleUpdateOrderNumber = async () => {
    setIsUpdatingOrderNumber(true);
    try {
      const report = await updateCustomerOrderNumber(
        order.id,
        newOrderNumber,
        currentUser.uid
      );
      
      const message = `✅ Zaktualizowano numer CO z ${report.oldOrderNumber} na ${report.newOrderNumber}
      
Zaktualizowane dokumenty:
• Zamówienie: ${report.updatedDocuments.order ? 'Tak' : 'Nie'}
• Faktury: ${report.updatedDocuments.invoices}
• Zadania produkcyjne: ${report.updatedDocuments.productionTasks}
• Dokumenty CMR: ${report.updatedDocuments.cmrDocuments}
• Partie magazynowe: ${report.updatedDocuments.inventoryBatches}
${report.errors.length > 0 ? `\n⚠️ Ostrzeżenia: ${report.errors.length}` : ''}`;
      
      showSuccess(message);
      
      const updatedOrderData = await getOrderById(order.id);
      setOrder(updatedOrderData);
      invalidateCache(order.id);
      
      setIsEditingOrderNumber(false);
      setNewOrderNumber('');
      setUpdateOrderNumberDialogOpen(false);
    } catch (error) {
      console.error('Błąd aktualizacji numeru CO:', error);
      showError('Błąd: ' + error.message);
    } finally {
      setIsUpdatingOrderNumber(false);
    }
  };

  return {
    isEditingOrderNumber,
    newOrderNumber,
    orderNumberError,
    isUpdatingOrderNumber,
    updateOrderNumberDialogOpen,
    setUpdateOrderNumberDialogOpen,
    handleEditOrderNumberClick,
    handleCancelEditOrderNumber,
    handleOrderNumberChange,
    handleConfirmOrderNumberChange,
    handleUpdateOrderNumber
  };
}
