import { useState, useCallback, useEffect } from 'react';
import { getInvoicesByOrderId, getInvoicedAmountsByOrderItems, migrateInvoiceItemsOrderIds } from '../../services/finance';
import { getCmrDocumentsByOrderId } from '../../services/logistics';
import { useNotification } from '../useNotification';
import { useTranslation } from '../useTranslation';
import { getCachedOrderInvoices, getCachedOrderCmrDocuments } from '../../utils/orderCache';

export function useOrderDocuments({ orderId, order }) {
  const { t } = useTranslation('orders');
  const { showError, showSuccess, showInfo } = useNotification();

  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [cmrDocuments, setCmrDocuments] = useState([]);
  const [loadingCmrDocuments, setLoadingCmrDocuments] = useState(false);

  const [invoicePopoverAnchor, setInvoicePopoverAnchor] = useState(null);
  const [selectedInvoiceData, setSelectedInvoiceData] = useState(null);

  // --- Verify functions ---
  const verifyInvoices = async (fetchedInvoices) => {
    if (!fetchedInvoices || fetchedInvoices.length === 0) {
      return { invoices: [], removedCount: 0 };
    }

    try {
      const { getInvoiceById } = await import('../../services/finance');
      const verifiedInvoices = [];
      let removedCount = 0;

      for (const invoice of fetchedInvoices) {
        try {
          await getInvoiceById(invoice.id);
          verifiedInvoices.push(invoice);
        } catch (error) {
          console.error(`Faktura ${invoice.id} (${invoice.number || 'bez numeru'}) nie istnieje i zostanie pominięta:`, error);
          removedCount++;
        }
      }

      return { invoices: verifiedInvoices, removedCount };
    } catch (error) {
      console.error('Błąd podczas weryfikacji faktur:', error);
      return { invoices: fetchedInvoices, removedCount: 0 };
    }
  };

  const verifyCmrDocuments = async (fetchedCmrDocuments) => {
    if (!fetchedCmrDocuments || fetchedCmrDocuments.length === 0) {
      return { cmrDocuments: [], removedCount: 0 };
    }

    try {
      const { getCmrDocumentById } = await import('../../services/logistics');
      const verifiedCmrDocuments = [];
      let removedCount = 0;

      for (const cmr of fetchedCmrDocuments) {
        try {
          await getCmrDocumentById(cmr.id);
          verifiedCmrDocuments.push(cmr);
        } catch (error) {
          console.error(`Dokument CMR ${cmr.id} (${cmr.cmrNumber || 'bez numeru'}) nie istnieje i zostanie pominięty:`, error);
          removedCount++;
        }
      }

      return { cmrDocuments: verifiedCmrDocuments, removedCount };
    } catch (error) {
      console.error('Błąd podczas weryfikacji dokumentów CMR:', error);
      return { cmrDocuments: fetchedCmrDocuments, removedCount: 0 };
    }
  };

  // --- Lazy loading ---
  const loadInvoices = useCallback(async () => {
    if (invoices.length > 0 || loadingInvoices) return;
    
    try {
      setLoadingInvoices(true);
      const orderInvoices = await getCachedOrderInvoices(orderId);
      const { invoices: verifiedInvoices, removedCount } = await verifyInvoices(orderInvoices);
      setInvoices(verifiedInvoices);
      
      if (removedCount > 0) {
        showInfo(`Usunięto ${removedCount} nieistniejących faktur z listy`);
      }
    } catch (error) {
      console.error('Błąd podczas lazy loading faktur:', error);
    } finally {
      setLoadingInvoices(false);
    }
  }, [orderId, invoices.length, loadingInvoices, showInfo]);

  const loadCmrDocuments = useCallback(async () => {
    if (cmrDocuments.length > 0 || loadingCmrDocuments) return;
    
    try {
      setLoadingCmrDocuments(true);
      const orderCmr = await getCachedOrderCmrDocuments(orderId);
      const { cmrDocuments: verifiedCmr, removedCount } = await verifyCmrDocuments(orderCmr);
      setCmrDocuments(verifiedCmr);
      
      if (removedCount > 0) {
        showInfo(`Usunięto ${removedCount} nieistniejących dokumentów CMR z listy`);
      }
    } catch (error) {
      console.error('Błąd podczas lazy loading dokumentów CMR:', error);
    } finally {
      setLoadingCmrDocuments(false);
    }
  }, [orderId, cmrDocuments.length, loadingCmrDocuments, showInfo]);

  // Auto-load after order loads (with delay)
  useEffect(() => {
    if (!order) return;

    const timer = setTimeout(() => {
      loadInvoices();
      loadCmrDocuments();
    }, 500);

    return () => { clearTimeout(timer); };
  }, [order, loadInvoices, loadCmrDocuments]);

  // --- Direct fetch (for refresh buttons) ---
  const fetchInvoices = async () => {
    try {
      setLoadingInvoices(true);
      const orderInvoices = await getInvoicesByOrderId(orderId);
      const { invoices: verifiedInvoices, removedCount: removedInvoicesCount } = await verifyInvoices(orderInvoices);
      setInvoices(verifiedInvoices);
      
      const invoicedData = await getInvoicedAmountsByOrderItems(orderId);
      // NOTE: invoicedAmounts is managed in useOrderData for the initial fetch
      // but this fetchInvoices is a manual refresh used by the documents section
      
      if (removedInvoicesCount > 0) {
        showInfo(`Usunięto ${removedInvoicesCount} nieistniejących faktur z listy`);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania faktur:', error);
      showError(t('orderDetails.notifications.invoicesLoadError'));
    } finally {
      setLoadingInvoices(false);
    }
  };

  const handleMigrateInvoices = async () => {
    try {
      setLoadingInvoices(true);
      showInfo('Rozpoczynam migrację faktur...');
      
      await migrateInvoiceItemsOrderIds(orderId);
      await fetchInvoices();
      
      showSuccess('Migracja faktur zakończona pomyślnie!');
    } catch (error) {
      console.error('Błąd podczas migracji faktur:', error);
      showError('Błąd podczas migracji faktur: ' + error.message);
    } finally {
      setLoadingInvoices(false);
    }
  };

  const fetchCmrDocuments = async () => {
    try {
      setLoadingCmrDocuments(true);
      const orderCmrDocuments = await getCmrDocumentsByOrderId(orderId);
      const { cmrDocuments: verifiedCmrDocuments, removedCount: removedCmrCount } = await verifyCmrDocuments(orderCmrDocuments);
      setCmrDocuments(verifiedCmrDocuments);
      if (removedCmrCount > 0) {
        showInfo(`Usunięto ${removedCmrCount} nieistniejących dokumentów CMR z listy`);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania dokumentów CMR:', error);
      showError(t('orderDetails.notifications.cmrDocumentsLoadError'));
    } finally {
      setLoadingCmrDocuments(false);
    }
  };

  // --- Calculation helpers ---
  const calculateInvoicedAmount = useCallback(() => {
    if (!invoices || invoices.length === 0) return 0;
    let totalInvoiced = 0;
    invoices.forEach(invoice => {
      if (invoice.isProforma) return;
      totalInvoiced += parseFloat(invoice.total || 0);
    });
    return totalInvoiced;
  }, [invoices]);

  const calculateProformaTotal = useCallback(() => {
    if (!invoices || invoices.length === 0) return 0;
    let totalProforma = 0;
    invoices.forEach(invoice => {
      if (!invoice.isProforma) return;
      totalProforma += parseFloat(invoice.totalPaid || 0);
    });
    return totalProforma;
  }, [invoices]);

  const calculateTotalPaid = useCallback(() => {
    if (!invoices || invoices.length === 0) return 0;
    let totalPaid = 0;
    invoices.forEach(invoice => {
      if (invoice.isProforma) {
        totalPaid += parseFloat(invoice.totalPaid || 0);
      } else {
        const invoiceTotal = parseFloat(invoice.total || 0);
        if (invoiceTotal < 0) return;
        totalPaid += parseFloat(invoice.totalPaid || 0);
      }
    });
    return totalPaid;
  }, [invoices]);

  return {
    invoices, setInvoices,
    loadingInvoices, setLoadingInvoices,
    cmrDocuments, setCmrDocuments,
    loadingCmrDocuments, setLoadingCmrDocuments,
    invoicePopoverAnchor, setInvoicePopoverAnchor,
    selectedInvoiceData, setSelectedInvoiceData,
    loadInvoices,
    loadCmrDocuments,
    fetchInvoices,
    fetchCmrDocuments,
    handleMigrateInvoices,
    calculateInvoicedAmount,
    calculateProformaTotal,
    calculateTotalPaid
  };
}
