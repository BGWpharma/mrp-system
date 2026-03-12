import { useState } from 'react';

export function usePOReceiving({ orderId, purchaseOrder, isItemInUnloadingForms, getExpiryInfoFromUnloadingForms, getItemMatchingDiagnostics, navigate, showError, t }) {
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [itemToReceive, setItemToReceive] = useState(null);

  const handleReceiveClick = (item) => {
    setItemToReceive(item);
    setReceiveDialogOpen(true);
  };

  const handleReceiveItem = () => {
    if (!itemToReceive || !itemToReceive.inventoryItemId) {
      showError(t('purchaseOrders.errors.productNotLinked'));
      setReceiveDialogOpen(false);
      return;
    }

    if (!isItemInUnloadingForms(itemToReceive)) {
      const diagnostics = getItemMatchingDiagnostics(itemToReceive);
      let errorMessage = `Nie można przyjąć towaru dla pozycji "${itemToReceive.name}" (ID: ${itemToReceive.id}).`;
      switch (diagnostics.matchType) {
        case 'none':
          errorMessage += ' Pozycja nie została zgłoszona w żadnym raporcie rozładunku dla tego zamówienia.';
          break;
        case 'name_only':
          errorMessage += ' System wymaga teraz dokładnego dopasowania pozycji. Ta pozycja nie została zaznaczona w formularzu rozładunku (znaleziono tylko pozycje o tej nazwie ale z innymi ID). Zaznacz tę konkretną pozycję w formularzu rozładunku.';
          break;
        default:
          errorMessage += ' Pozycja nie została poprawnie zgłoszona w raportach rozładunku lub brakuje jej unikatowego ID.';
      }
      showError(errorMessage);
      setReceiveDialogOpen(false);
      return;
    }

    const unitPrice = typeof itemToReceive.unitPrice === 'number'
      ? itemToReceive.unitPrice
      : parseFloat(itemToReceive.unitPrice || 0);

    const expiryInfo = getExpiryInfoFromUnloadingForms(itemToReceive);

    const queryParams = new URLSearchParams();
    queryParams.append('poNumber', purchaseOrder.number);
    queryParams.append('orderId', orderId);

    let totalQuantity = itemToReceive.quantity;
    if (expiryInfo.batches && expiryInfo.batches.length > 0) {
      const batchesSum = expiryInfo.batches.reduce((sum, batch) => sum + parseFloat(batch.unloadedQuantity || 0), 0);
      if (batchesSum > 0) totalQuantity = batchesSum;
    }
    queryParams.append('quantity', totalQuantity);
    queryParams.append('unitPrice', unitPrice);
    queryParams.append('reason', 'purchase');
    queryParams.append('source', 'purchase');
    queryParams.append('sourceId', orderId);

    if (itemToReceive.id) queryParams.append('itemPOId', itemToReceive.id);
    else if (itemToReceive.itemId) queryParams.append('itemPOId', itemToReceive.itemId);
    if (itemToReceive.name) queryParams.append('itemName', itemToReceive.name);
    queryParams.append('reference', purchaseOrder.number);
    queryParams.append('returnTo', `/purchase-orders/${orderId}`);

    if (expiryInfo.batches && expiryInfo.batches.length > 0) {
      const batchesToPass = expiryInfo.batches.map(batch => ({
        batchNumber: batch.batchNumber || '',
        quantity: batch.unloadedQuantity || '',
        expiryDate: batch.expiryDate instanceof Date ? batch.expiryDate.toISOString() : (batch.expiryDate || null),
        noExpiryDate: batch.noExpiryDate || false
      }));
      queryParams.append('batches', JSON.stringify(batchesToPass));
    } else {
      if (expiryInfo.noExpiryDate) queryParams.append('noExpiryDate', 'true');
      else if (expiryInfo.expiryDate) {
        const expiryDateString = expiryInfo.expiryDate instanceof Date
          ? expiryInfo.expiryDate.toISOString()
          : new Date(expiryInfo.expiryDate).toISOString();
        queryParams.append('expiryDate', expiryDateString);
      }
    }

    localStorage.setItem('refreshPurchaseOrder', orderId);
    navigate(`/inventory/${itemToReceive.inventoryItemId}/receive?${queryParams.toString()}`);
    setReceiveDialogOpen(false);
  };

  return {
    receiveDialogOpen, setReceiveDialogOpen,
    itemToReceive,
    handleReceiveClick, handleReceiveItem,
  };
}
