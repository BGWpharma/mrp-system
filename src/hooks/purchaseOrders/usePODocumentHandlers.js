export const usePODocumentHandlers = ({ setPoData }) => {
  const handleApplyDeliveryUpdates = async ({ updates, documentNumber, deliveryDate }) => {
    console.log('[PurchaseOrderForm] Stosowanie aktualizacji z WZ:', { updates, documentNumber, deliveryDate });

    if (!updates || updates.length === 0) {
      console.warn('[PurchaseOrderForm] Brak aktualizacji do zastosowania!');
      return;
    }

    setPoData(prev => {
      const updatedItems = [...prev.items];

      for (const update of updates) {
        const itemIndex = updatedItems.findIndex(item => item.id === update.itemId);
        if (itemIndex === -1) continue;

        const changes = update.changes || {};
        const currentItem = updatedItems[itemIndex];

        const updatedItem = {
          ...currentItem,
          ...(changes.quantity !== undefined && { quantity: parseFloat(changes.quantity) || 0 }),
          ...(changes.unit && { unit: changes.unit }),
          ...(changes.received !== undefined && { received: changes.received }),
          ...(changes.lotNumber && { lotNumber: changes.lotNumber }),
          ...(changes.expiryDate && { expiryDate: changes.expiryDate }),
          ...(deliveryDate && { actualDeliveryDate: deliveryDate }),
          lastDeliveryUpdate: new Date().toISOString()
        };

        if (changes.quantity !== undefined) {
          const quantity = parseFloat(updatedItem.quantity) || 0;
          const unitPrice = parseFloat(updatedItem.unitPrice) || 0;
          const discount = parseFloat(updatedItem.discount) || 0;
          const discountMultiplier = (100 - discount) / 100;
          updatedItem.totalPrice = parseFloat((quantity * unitPrice * discountMultiplier).toFixed(2));
        }

        updatedItems[itemIndex] = updatedItem;
      }

      const newNotes = documentNumber
        ? (prev.notes ? `${prev.notes}\n[WZ: ${documentNumber}]` : `[WZ: ${documentNumber}]`)
        : prev.notes;

      return { ...prev, items: updatedItems, notes: newNotes };
    });
  };

  const handleApplyInvoiceUpdates = async ({ updates, invoiceInfo }) => {
    console.log('[PurchaseOrderForm] Stosowanie aktualizacji z faktury:', updates, invoiceInfo);

    setPoData(prev => {
      const updatedItems = [...prev.items];

      for (const update of updates) {
        const itemIndex = updatedItems.findIndex(item => item.id === update.itemId);
        if (itemIndex === -1) continue;

        const changes = update.changes || {};
        let updatedItem = { ...updatedItems[itemIndex] };

        if (changes.quantity !== undefined) {
          updatedItem.quantity = parseFloat(changes.quantity) || 0;
        }
        if (changes.unit !== undefined) {
          updatedItem.unit = changes.unit;
        }
        if (changes.unitPrice !== undefined) {
          updatedItem.unitPrice = parseFloat(changes.unitPrice) || 0;
        }

        const quantity = parseFloat(updatedItem.quantity) || 0;
        const unitPrice = parseFloat(updatedItem.unitPrice) || 0;
        const discount = parseFloat(updatedItem.discount) || 0;
        const discountMultiplier = (100 - discount) / 100;
        updatedItem.totalPrice = parseFloat((quantity * unitPrice * discountMultiplier).toFixed(2));

        if (changes.vatRate !== undefined) {
          updatedItem.vatRate = changes.vatRate;
        }
        if (invoiceInfo?.invoiceNumber) {
          updatedItem.invoiceNumber = invoiceInfo.invoiceNumber;
        }
        if (invoiceInfo?.invoiceDate) {
          updatedItem.invoiceDate = invoiceInfo.invoiceDate;
        }
        if (invoiceInfo?.dueDate) {
          updatedItem.paymentDueDate = invoiceInfo.dueDate;
        }
        if (invoiceInfo?.currency) {
          updatedItem.currency = invoiceInfo.currency;
        }

        updatedItems[itemIndex] = updatedItem;
      }

      let newInvoiceLinks = [...(prev.invoiceLinks || [])];
      if (invoiceInfo?.invoiceNumber) {
        newInvoiceLinks.push({
          id: `inv-${Date.now()}`,
          number: invoiceInfo.invoiceNumber,
          date: invoiceInfo.invoiceDate || null,
          dueDate: invoiceInfo.dueDate || null,
          totalNet: invoiceInfo.totalNet || null,
          totalVat: invoiceInfo.totalVat || null,
          totalGross: invoiceInfo.totalGross || null,
          currency: invoiceInfo.currency || prev.currency,
          addedAt: new Date().toISOString(),
          addedBy: 'AI-OCR'
        });
      }

      return { ...prev, items: updatedItems, invoiceLinks: newInvoiceLinks };
    });
  };

  return {
    handleApplyDeliveryUpdates,
    handleApplyInvoiceUpdates
  };
};

export default usePODocumentHandlers;
