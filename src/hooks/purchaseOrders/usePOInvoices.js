import { useState } from 'react';
import { updatePurchaseOrder } from '../../services/purchaseOrders';

export function usePOInvoices({ orderId, purchaseOrder, setPurchaseOrder, showSuccess, showError }) {
  const [invoiceLinkDialogOpen, setInvoiceLinkDialogOpen] = useState(false);
  const [invoiceLink, setInvoiceLink] = useState('');
  const [tempInvoiceLinks, setTempInvoiceLinks] = useState([]);

  const handleInvoiceLinkDialogOpen = () => {
    setInvoiceLink(purchaseOrder.invoiceLink || '');
    setInvoiceLinkDialogOpen(true);
    if ((!purchaseOrder.invoiceLinks || purchaseOrder.invoiceLinks.length === 0) && purchaseOrder.invoiceLink) {
      setTempInvoiceLinks([{
        id: `invoice-${Date.now()}`,
        description: 'Faktura główna',
        url: purchaseOrder.invoiceLink
      }]);
    } else {
      setTempInvoiceLinks(purchaseOrder.invoiceLinks || []);
    }
  };

  const handleInvoiceLinkSave = async () => {
    try {
      const updatedData = {
        ...purchaseOrder,
        invoiceLink: tempInvoiceLinks.length > 0 ? tempInvoiceLinks[0].url : '',
        invoiceLinks: tempInvoiceLinks
      };
      await updatePurchaseOrder(orderId, updatedData);
      setPurchaseOrder({
        ...purchaseOrder,
        invoiceLink: tempInvoiceLinks.length > 0 ? tempInvoiceLinks[0].url : '',
        invoiceLinks: tempInvoiceLinks
      });
      setInvoiceLinkDialogOpen(false);
      showSuccess('Linki do faktur zostały zaktualizowane');
    } catch (error) {
      showError('Nie udało się zapisać linków do faktur');
    }
  };

  return {
    invoiceLinkDialogOpen, setInvoiceLinkDialogOpen,
    invoiceLink, setInvoiceLink,
    tempInvoiceLinks, setTempInvoiceLinks,
    handleInvoiceLinkDialogOpen, handleInvoiceLinkSave,
  };
}
