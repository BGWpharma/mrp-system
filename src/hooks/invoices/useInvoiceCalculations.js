import { useCallback } from 'react';
import { calculateInvoiceTotalGross } from '../../services/invoiceService';

/**
 * Hook handling invoice item calculations: totals, VAT, net/gross values.
 * 
 * @param {Object} params
 * @param {Object} params.invoice - Current invoice state
 * @param {Function} params.setInvoice - Invoice state setter
 * @param {Object|null} params.selectedOrder - Currently selected order (CO/PO)
 */
const useInvoiceCalculations = ({ invoice, setInvoice, selectedOrder }) => {

  const calculateTotalWithAdvancePayments = useCallback((items) => {
    let totalValue = calculateInvoiceTotalGross(items);

    if (selectedOrder?.linkedPurchaseOrders?.length > 0) {
      const poTotalValue = selectedOrder.linkedPurchaseOrders.reduce((sum, po) => {
        return sum + (parseFloat(po.totalGross || po.value) || 0);
      }, 0);
      totalValue += poTotalValue;
    }

    return totalValue;
  }, [selectedOrder]);

  const handleItemChange = useCallback((index, field, value) => {
    const updatedItems = [...invoice.items];

    if (field === 'vat') {
      if (value !== "ZW" && value !== "NP") {
        value = value === 0 || value === "0" ? 0 : (parseFloat(value) || 0);
      }
    }

    if (field === 'quantity' || field === 'price' || field === 'netValue') {
      value = parseFloat(value) || 0;
    }

    const currentItem = updatedItems[index];
    updatedItems[index] = {
      ...currentItem,
      [field]: value
    };

    if (field === 'netValue') {
      const quantity = updatedItems[index].quantity || 1;
      updatedItems[index].price = quantity > 0 ? value / quantity : 0;
    } else if (field === 'quantity' || field === 'price') {
      const quantity = field === 'quantity' ? value : (updatedItems[index].quantity || 0);
      const price = field === 'price' ? value : (updatedItems[index].price || 0);
      updatedItems[index].netValue = quantity * price;
    }

    setInvoice(prev => ({
      ...prev,
      items: updatedItems,
      total: calculateTotalWithAdvancePayments(updatedItems)
    }));
  }, [invoice.items, setInvoice, calculateTotalWithAdvancePayments]);

  const handleAddItem = useCallback(() => {
    const newItem = {
      id: '',
      name: '',
      description: '',
      quantity: 1,
      unit: 'szt.',
      price: 0,
      netValue: 0,
      vat: 0,
      cnCode: ''
    };

    const updatedItems = [...invoice.items, newItem];

    setInvoice(prev => ({
      ...prev,
      items: updatedItems,
      total: calculateTotalWithAdvancePayments(updatedItems)
    }));
  }, [invoice.items, setInvoice, calculateTotalWithAdvancePayments]);

  const handleRemoveItem = useCallback((index) => {
    const updatedItems = [...invoice.items];
    updatedItems.splice(index, 1);

    setInvoice(prev => ({
      ...prev,
      items: updatedItems,
      total: calculateTotalWithAdvancePayments(updatedItems)
    }));
  }, [invoice.items, setInvoice, calculateTotalWithAdvancePayments]);

  return {
    calculateTotalWithAdvancePayments,
    handleItemChange,
    handleAddItem,
    handleRemoveItem
  };
};

export default useInvoiceCalculations;
