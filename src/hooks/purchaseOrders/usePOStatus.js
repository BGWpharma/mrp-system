import { useState } from 'react';
import {
  getPurchaseOrderById,
  updatePurchaseOrderStatus,
  updatePurchaseOrderPaymentStatus,
  checkShortExpiryItems,
  PURCHASE_ORDER_PAYMENT_STATUSES,
  recalculatePOPaymentFromInvoices
} from '../../services/purchaseOrders';

export function usePOStatus({ orderId, purchaseOrder, setPurchaseOrder, currentUser, showSuccess, showError, t }) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [paymentStatusDialogOpen, setPaymentStatusDialogOpen] = useState(false);
  const [newPaymentStatus, setNewPaymentStatus] = useState('');
  const [recalculating, setRecalculating] = useState(false);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState(null);
  const [shortExpiryConfirmDialogOpen, setShortExpiryConfirmDialogOpen] = useState(false);
  const [shortExpiryItems, setShortExpiryItems] = useState([]);
  const [supplierPricesDialogOpen, setSupplierPricesDialogOpen] = useState(false);

  const handleDeleteClick = () => setDeleteDialogOpen(true);

  const handleStatusClick = () => {
    if (!purchaseOrder) return;
    setNewStatus(purchaseOrder.status);
    setStatusDialogOpen(true);
  };

  const handleStatusUpdate = async () => {
    try {
      if (newStatus === 'confirmed' && purchaseOrder?.items?.length > 0 && purchaseOrder?.orderDate) {
        const itemsWithShortExpiry = checkShortExpiryItems(purchaseOrder.items, purchaseOrder.orderDate);
        if (itemsWithShortExpiry.length > 0) {
          setShortExpiryItems(itemsWithShortExpiry);
          setShortExpiryConfirmDialogOpen(true);
          return;
        }
      }

      if (newStatus === 'completed' && purchaseOrder?.items?.length > 0 &&
          purchaseOrder?.supplier?.id && purchaseOrder.status !== 'completed') {
        setPendingStatusUpdate({ orderId, newStatus, currentStatus: purchaseOrder.status });
        setSupplierPricesDialogOpen(true);
        setStatusDialogOpen(false);
        return;
      }

      await updatePurchaseOrderStatus(orderId, newStatus, currentUser.uid);
      setStatusDialogOpen(false);
      setNewStatus('');
      const updatedOrder = await getPurchaseOrderById(orderId);
      setPurchaseOrder(updatedOrder);
      showSuccess(t('purchaseOrders.statusUpdated'));
    } catch (error) {
      const errorMessage = error.message || t('purchaseOrders.errors.statusUpdateFailed');
      showError(errorMessage);
      setStatusDialogOpen(false);
      setNewStatus('');
    }
  };

  const handleShortExpiryConfirm = async () => {
    try {
      setShortExpiryConfirmDialogOpen(false);
      await updatePurchaseOrderStatus(orderId, newStatus, currentUser.uid);
      setStatusDialogOpen(false);
      const updatedOrder = await getPurchaseOrderById(orderId);
      setPurchaseOrder(updatedOrder);
      showSuccess(t('purchaseOrders.statusUpdated'));
    } catch (error) {
      showError(error.message || t('purchaseOrders.errors.statusUpdateFailed'));
    } finally {
      setNewStatus('');
      setShortExpiryItems([]);
    }
  };

  const handleShortExpiryCancel = () => {
    setShortExpiryConfirmDialogOpen(false);
    setShortExpiryItems([]);
    setNewStatus('');
  };

  const handlePaymentStatusClick = () => {
    setNewPaymentStatus(purchaseOrder?.paymentStatus || PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID);
    setPaymentStatusDialogOpen(true);
  };

  const handlePaymentStatusUpdate = async () => {
    try {
      await updatePurchaseOrderPaymentStatus(orderId, newPaymentStatus, currentUser.uid);
      setPaymentStatusDialogOpen(false);
      const updatedOrder = await getPurchaseOrderById(orderId);
      setPurchaseOrder(updatedOrder);
      showSuccess(t('purchaseOrders.paymentStatusUpdated'));
    } catch (error) {
      showError('Nie udało się zaktualizować statusu płatności');
    } finally {
      setNewPaymentStatus('');
      setPaymentStatusDialogOpen(false);
    }
  };

  const handleRecalculateFromInvoices = async () => {
    setRecalculating(true);
    try {
      const result = await recalculatePOPaymentFromInvoices(orderId, currentUser.uid);
      const updatedOrder = await getPurchaseOrderById(orderId);
      setPurchaseOrder(updatedOrder);
      setPaymentStatusDialogOpen(false);
      showSuccess(
        `Przeliczono: ${result.totalPaidFromInvoices.toFixed(2)} / ${result.poTotalGross.toFixed(2)} ${purchaseOrder.currency || 'EUR'} (${result.coveragePercent}%) — ${result.invoicesCount} faktur`
      );
    } catch (error) {
      showError('Nie udało się przeliczyć statusu płatności z faktur');
    } finally {
      setRecalculating(false);
    }
  };

  const handleSupplierPricesConfirm = async (updatePrices) => {
    try {
      if (!pendingStatusUpdate) return;
      await updatePurchaseOrderStatus(pendingStatusUpdate.orderId, pendingStatusUpdate.newStatus, currentUser.uid);
      if (updatePrices) {
        try {
          const { updateSupplierPricesFromCompletedPO } = await import('../../services/inventory');
          const result = await updateSupplierPricesFromCompletedPO(pendingStatusUpdate.orderId, currentUser.uid);
          if (result.success && result.updated > 0)
            showSuccess(`Status zamówienia został zaktualizowany. Dodatkowo zaktualizowano ${result.updated} cen dostawców i ustawiono jako domyślne.`);
          else showSuccess(t('purchaseOrders.statusUpdatedNoPrices'));
        } catch (pricesError) {
          showSuccess('Status zamówienia został zaktualizowany.');
          showError('Błąd podczas aktualizacji cen dostawców: ' + pricesError.message);
        }
      } else {
        showSuccess('Status zamówienia został zaktualizowany bez aktualizacji cen dostawców.');
      }
      const updatedOrder = await getPurchaseOrderById(pendingStatusUpdate.orderId);
      setPurchaseOrder(updatedOrder);
    } catch (error) {
      showError('Nie udało się zaktualizować statusu zamówienia');
    } finally {
      setSupplierPricesDialogOpen(false);
      setPendingStatusUpdate(null);
    }
  };

  const handleSupplierPricesCancel = () => {
    setSupplierPricesDialogOpen(false);
    setPendingStatusUpdate(null);
    setNewStatus('');
  };

  return {
    deleteDialogOpen, setDeleteDialogOpen,
    statusDialogOpen, setStatusDialogOpen,
    newStatus, setNewStatus,
    paymentStatusDialogOpen, setPaymentStatusDialogOpen,
    newPaymentStatus, setNewPaymentStatus,
    recalculating,
    pendingStatusUpdate,
    shortExpiryConfirmDialogOpen,
    shortExpiryItems,
    supplierPricesDialogOpen,
    handleDeleteClick,
    handleStatusClick, handleStatusUpdate,
    handleShortExpiryConfirm, handleShortExpiryCancel,
    handlePaymentStatusClick, handlePaymentStatusUpdate,
    handleRecalculateFromInvoices,
    handleSupplierPricesConfirm, handleSupplierPricesCancel,
  };
}
