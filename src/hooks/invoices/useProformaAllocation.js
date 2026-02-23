import { useState, useCallback } from 'react';
import {
  getInvoicesByOrderId,
  getAvailableProformasForOrderWithExclusion
} from '../../services/invoiceService';

/**
 * Hook handling proforma advance allocation logic:
 * fetching related invoices/proformas, managing allocation amounts, filtering.
 *
 * @param {Object} params
 * @param {string|null} params.invoiceId - ID of the invoice being edited (null for new)
 * @param {Object} params.invoice - Current invoice state
 * @param {Function} params.setInvoice - Invoice state setter
 */
const useProformaAllocation = ({ invoiceId, invoice, setInvoice }) => {
  const [relatedInvoices, setRelatedInvoices] = useState([]);
  const [loadingRelatedInvoices, setLoadingRelatedInvoices] = useState(false);
  const [availableProformaAmount, setAvailableProformaAmount] = useState(null);
  const [availableProformas, setAvailableProformas] = useState([]);
  const [showAllProformas, setShowAllProformas] = useState(false);

  const fetchRelatedInvoices = useCallback(async (orderId) => {
    if (!orderId) {
      setRelatedInvoices([]);
      setAvailableProformaAmount(null);
      setAvailableProformas([]);
      return;
    }

    setLoadingRelatedInvoices(true);
    try {
      const invoices = await getInvoicesByOrderId(orderId);
      const filteredInvoices = invoices.filter(inv => inv.id !== invoiceId);
      setRelatedInvoices(filteredInvoices);

      const proformasWithAmounts = await getAvailableProformasForOrderWithExclusion(orderId, invoiceId);
      const filteredProformas = proformasWithAmounts.filter(proforma => proforma.id !== invoiceId);
      setAvailableProformas(filteredProformas);

      setInvoice(prev => {
        if (prev.selectedProformaId) {
          const selectedProforma = filteredProformas.find(p => p.id === prev.selectedProformaId);
          if (selectedProforma) {
            setAvailableProformaAmount(selectedProforma.amountInfo);
          } else {
            setAvailableProformaAmount(null);
          }
        } else {
          setAvailableProformaAmount(null);
        }
        return prev;
      });
    } catch (error) {
      console.error('[fetchRelatedInvoices] Błąd podczas pobierania powiązanych faktur:', error);
      setRelatedInvoices([]);
      setAvailableProformaAmount(null);
      setAvailableProformas([]);
    } finally {
      setLoadingRelatedInvoices(false);
    }
  }, [invoiceId, setInvoice]);

  const handleProformaAllocationChange = useCallback((proformaId, amount, proformaNumber) => {
    setInvoice(prev => {
      const newAllocation = [...(prev.proformAllocation || [])];
      const existingIndex = newAllocation.findIndex(a => a.proformaId === proformaId);

      if (amount > 0) {
        const allocation = { proformaId, amount, proformaNumber };

        if (existingIndex >= 0) {
          newAllocation[existingIndex] = allocation;
        } else {
          newAllocation.push(allocation);
        }
      } else {
        if (existingIndex >= 0) {
          newAllocation.splice(existingIndex, 1);
        }
      }

      const totalAllocated = newAllocation.reduce((sum, a) => sum + a.amount, 0);

      return {
        ...prev,
        proformAllocation: newAllocation,
        settledAdvancePayments: totalAllocated
      };
    });
  }, [setInvoice]);

  const getTotalAllocatedAmount = useCallback(() => {
    return (invoice.proformAllocation || []).reduce((sum, allocation) => sum + allocation.amount, 0);
  }, [invoice.proformAllocation]);

  /**
   * Filters proformas to show only those containing items from the current invoice.
   */
  const getFilteredProformas = useCallback((proformas, invoiceItems) => {
    if (showAllProformas || !invoiceItems || invoiceItems.length === 0) {
      return proformas;
    }

    return proformas.filter(proforma => {
      if (!proforma.items || proforma.items.length === 0) {
        return false;
      }

      return proforma.items.some(proformaItem => {
        return invoiceItems.some(invoiceItem => {
          if (proformaItem.orderItemId && invoiceItem.orderItemId) {
            return proformaItem.orderItemId === invoiceItem.orderItemId;
          }
          if (proformaItem.id && invoiceItem.id && proformaItem.id === invoiceItem.id) {
            return true;
          }
          if (proformaItem.name && invoiceItem.name) {
            return proformaItem.name.trim().toLowerCase() === invoiceItem.name.trim().toLowerCase();
          }
          return false;
        });
      });
    });
  }, [showAllProformas]);

  return {
    relatedInvoices,
    loadingRelatedInvoices,
    availableProformaAmount,
    setAvailableProformaAmount,
    availableProformas,
    showAllProformas,
    setShowAllProformas,
    fetchRelatedInvoices,
    handleProformaAllocationChange,
    getTotalAllocatedAmount,
    getFilteredProformas
  };
};

export default useProformaAllocation;
