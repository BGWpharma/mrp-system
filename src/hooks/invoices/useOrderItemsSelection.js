import { useState, useCallback } from 'react';
import {
  getProformaAmountsByOrderItems,
  getInvoicesByOrderId,
  getInvoicedAmountsByOrderItems,
  calculateTotalUnitCost
} from '../../services/invoiceService';

/**
 * Hook handling logic for selecting items from CO/PO orders to add to invoice.
 *
 * @param {Object} params
 * @param {Object} params.invoice - Current invoice state
 * @param {Function} params.setInvoice - Invoice state setter
 * @param {string} params.selectedOrderId - Currently selected order ID
 * @param {Object|null} params.selectedOrder - Currently selected order object
 * @param {string|null} params.invoiceId - ID of the invoice being edited
 * @param {Function} params.showError - Error notification function
 * @param {Function} params.showSuccess - Success notification function
 * @param {Function} params.t - Translation function
 */
const useOrderItemsSelection = ({
  invoice,
  setInvoice,
  selectedOrderId,
  selectedOrder,
  invoiceId,
  showError,
  showSuccess,
  t
}) => {
  const [orderItemsDialogOpen, setOrderItemsDialogOpen] = useState(false);
  const [availableOrderItems, setAvailableOrderItems] = useState([]);
  const [selectedOrderItems, setSelectedOrderItems] = useState([]);
  const [proformasByOrderItems, setProformasByOrderItems] = useState({});

  const handleOpenOrderItemsDialog = useCallback(async (orderItems) => {
    let existingProformas = {};
    if (selectedOrderId && invoice.isProforma) {
      try {
        existingProformas = await getProformaAmountsByOrderItems(selectedOrderId);
        setProformasByOrderItems(existingProformas);
      } catch (error) {
        console.error('Błąd podczas pobierania informacji o proformach:', error);
      }
    }

    let invoicedAmounts = {};
    if (selectedOrderId && !invoice.isProforma) {
      try {
        const relatedInvoices = await getInvoicesByOrderId(selectedOrderId);
        const filteredInvoices = invoice.isCorrectionInvoice
          ? relatedInvoices.filter(inv => !inv.isCorrectionInvoice)
          : relatedInvoices.filter(inv => inv.id !== invoiceId);
        invoicedAmounts = await getInvoicedAmountsByOrderItems(selectedOrderId, filteredInvoices, selectedOrder);
      } catch (error) {
        console.error('Błąd podczas pobierania informacji o zafakturowanych ilościach:', error);
      }
    }

    const mappedItems = (orderItems || []).map((item) => {
      let finalPrice;

      if (invoice.isProforma && item.lastUsageInfo?.cost && parseFloat(item.lastUsageInfo.cost) > 0) {
        finalPrice = parseFloat(item.lastUsageInfo.cost);
      } else {
        const shouldUseProductionCost = !item.fromPriceList || parseFloat(item.price || 0) === 0;

        if (shouldUseProductionCost && selectedOrder) {
          finalPrice = calculateTotalUnitCost(item, selectedOrder);
        } else {
          finalPrice = parseFloat(item.price || 0);
        }
      }

      const itemId = item.id;
      const hasProforma = existingProformas[itemId]?.totalProforma > 0;
      const proformaInfo = existingProformas[itemId] || null;

      let remainingQuantity = parseFloat(item.quantity || 0);
      let remainingValue = parseFloat(item.quantity || 0) * finalPrice;
      let invoicedInfo = null;
      let totalInvoicedQuantity = 0;
      let totalInvoicedValue = 0;

      if (!invoice.isProforma && invoicedAmounts[itemId]) {
        const invoicedData = invoicedAmounts[itemId];
        totalInvoicedQuantity = invoicedData.invoices.reduce((sum, inv) => sum + inv.quantity, 0);
        totalInvoicedValue = invoicedData.totalInvoiced;

        if (invoice.isCorrectionInvoice) {
          remainingQuantity = totalInvoicedQuantity;
          remainingValue = totalInvoicedValue;
        } else {
          remainingQuantity = Math.max(0, parseFloat(item.quantity || 0) - totalInvoicedQuantity);
          remainingValue = Math.max(0, (parseFloat(item.quantity || 0) * finalPrice) - totalInvoicedValue);
        }

        invoicedInfo = {
          totalInvoicedQuantity,
          totalInvoicedValue,
          invoices: invoicedData.invoices
        };
      }

      const isAvailableForCorrection = invoice.isCorrectionInvoice && totalInvoicedQuantity > 0;

      return {
        ...item,
        price: finalPrice,
        quantity: remainingQuantity,
        netValue: remainingValue,
        originalQuantity: parseFloat(item.quantity || 0),
        originalValue: parseFloat(item.quantity || 0) * finalPrice,
        selected: false,
        hasProforma,
        proformaInfo,
        invoicedInfo,
        isFullyInvoiced: !invoice.isProforma && !invoice.isCorrectionInvoice && remainingQuantity <= 0,
        isAvailableForCorrection,
        correctionNewQuantity: invoice.isCorrectionInvoice ? totalInvoicedQuantity : null,
        correctionNewValue: invoice.isCorrectionInvoice ? totalInvoicedValue : null
      };
    });

    setAvailableOrderItems(mappedItems);
    setSelectedOrderItems([]);
    setOrderItemsDialogOpen(true);
  }, [selectedOrderId, selectedOrder, invoice.isProforma, invoice.isCorrectionInvoice, invoiceId]);

  const handleToggleOrderItem = useCallback((itemIndex) => {
    setAvailableOrderItems(prev =>
      prev.map((item, index) =>
        index === itemIndex ? { ...item, selected: !item.selected } : item
      )
    );
  }, []);

  const handleSelectAllOrderItems = useCallback(() => {
    setAvailableOrderItems(prev => {
      const allSelected = prev.every(item => item.selected);
      return prev.map(item => ({ ...item, selected: !allSelected }));
    });
  }, []);

  const handleConfirmOrderItemsSelection = useCallback(() => {
    const selectedItems = availableOrderItems.filter(item => item.selected);

    if (selectedItems.length === 0) {
      showError('Wybierz przynajmniej jedną pozycję do dodania');
      return;
    }

    // Validation: fully invoiced items (not for correction invoices)
    if (!invoice.isProforma && !invoice.isCorrectionInvoice) {
      const fullyInvoicedItems = selectedItems.filter(item => item.isFullyInvoiced);
      if (fullyInvoicedItems.length > 0) {
        const itemNames = fullyInvoicedItems.map(item => item.name).join(', ');
        showError(
          `Nie można dodać pozycji: ${itemNames}. ` +
          `${fullyInvoicedItems.length === 1 ? 'Ta pozycja jest' : 'Te pozycje są'} już w pełni zafakturowane.`
        );
        return;
      }
    }

    // Validation: correction invoice — items must have something to correct
    if (invoice.isCorrectionInvoice) {
      const itemsWithoutInvoice = selectedItems.filter(item => !item.isAvailableForCorrection);
      if (itemsWithoutInvoice.length > 0) {
        const itemNames = itemsWithoutInvoice.map(item => item.name).join(', ');
        showError(
          `Nie można skorygować pozycji: ${itemNames}. ` +
          `${itemsWithoutInvoice.length === 1 ? 'Ta pozycja nie została' : 'Te pozycje nie zostały'} jeszcze zafakturowane.`
        );
        return;
      }
    }

    // Validation: proforma items already issued
    if (invoice.isProforma) {
      const itemsWithProforma = selectedItems.filter(item => item.hasProforma);
      if (itemsWithProforma.length > 0) {
        const itemNames = itemsWithProforma.map(item => item.name).join(', ');
        const proformaNumbers = itemsWithProforma
          .flatMap(item => item.proformaInfo?.proformas || [])
          .map(pf => pf.proformaNumber)
          .filter((value, index, self) => self.indexOf(value) === index)
          .join(', ');

        showError(
          `Nie można dodać pozycji: ${itemNames}. ` +
          `${itemsWithProforma.length === 1 ? 'Ta pozycja ma' : 'Te pozycje mają'} już wystawioną proformę: ${proformaNumbers}.`
        );
        return;
      }
    }

    // Collect corrected invoices info for correction invoices
    let correctedInvoicesFromItems = [];
    if (invoice.isCorrectionInvoice) {
      const invoicesMap = new Map();
      selectedItems.forEach(item => {
        if (item.invoicedInfo?.invoices) {
          item.invoicedInfo.invoices.forEach(inv => {
            if (!invoicesMap.has(inv.invoiceId)) {
              invoicesMap.set(inv.invoiceId, {
                invoiceId: inv.invoiceId,
                invoiceNumber: inv.invoiceNumber
              });
            }
          });
        }
      });
      correctedInvoicesFromItems = Array.from(invoicesMap.values());
    }

    const newItems = selectedItems.map(item => {
      if (invoice.isCorrectionInvoice) {
        const invoicedQuantity = item.invoicedInfo?.totalInvoicedQuantity || 0;
        const invoicedValue = item.invoicedInfo?.totalInvoicedValue || 0;
        const productionValue = item.originalQuantity * item.price;
        const correctionValue = productionValue - invoicedValue;

        const correctionUnitPrice = item.originalQuantity > 0
          ? correctionValue / item.originalQuantity
          : correctionValue;

        return {
          id: item.id || '',
          orderItemId: item.id,
          name: item.name,
          description: `Correction (${correctionValue >= 0 ? '+' : ''}${correctionValue.toFixed(2)} ${invoice.currency || 'EUR'})`,
          quantity: item.originalQuantity,
          unit: item.unit || 'szt.',
          price: parseFloat(correctionUnitPrice.toFixed(4)),
          netValue: parseFloat(correctionValue.toFixed(2)),
          vat: item.vat || 0,
          cnCode: item.cnCode || '',
          originalInvoicedQuantity: invoicedQuantity,
          originalInvoicedValue: invoicedValue,
          productionQuantity: item.originalQuantity,
          productionValue: productionValue,
          productionUnitPrice: item.price,
          sourceInvoices: item.invoicedInfo?.invoices || []
        };
      }

      return {
        id: item.id || '',
        orderItemId: item.id,
        name: item.name,
        description: item.description || '',
        quantity: item.quantity,
        unit: item.unit || 'szt.',
        price: item.price,
        netValue: item.netValue,
        vat: item.vat || 0,
        cnCode: item.cnCode || ''
      };
    });

    setInvoice(prev => ({
      ...prev,
      items: [...prev.items, ...newItems],
      ...(invoice.isCorrectionInvoice && {
        correctedInvoices: [
          ...(prev.correctedInvoices || []),
          ...correctedInvoicesFromItems.filter(
            newInv => !prev.correctedInvoices?.some(existing => existing.invoiceId === newInv.invoiceId)
          )
        ]
      })
    }));

    setOrderItemsDialogOpen(false);
    showSuccess(`Dodano ${selectedItems.length} pozycji ${invoice.isCorrectionInvoice ? 'do korekty' : 'z zamówienia'}`);
  }, [availableOrderItems, invoice.isProforma, invoice.isCorrectionInvoice, invoice.currency, setInvoice, showError, showSuccess]);

  return {
    orderItemsDialogOpen,
    setOrderItemsDialogOpen,
    availableOrderItems,
    setAvailableOrderItems,
    selectedOrderItems,
    proformasByOrderItems,
    handleOpenOrderItemsDialog,
    handleToggleOrderItem,
    handleSelectAllOrderItems,
    handleConfirmOrderItemsSelection
  };
};

export default useOrderItemsSelection;
