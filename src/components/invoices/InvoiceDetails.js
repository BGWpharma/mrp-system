import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  Grid,
  Divider,
  CircularProgress,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  IconButton,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Snackbar,
  Alert
} from '@mui/material';
import { 
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Email as EmailIcon,
  Download as DownloadIcon,
  Person as PersonIcon,
  Delete as DeleteIcon,
  Receipt as ReceiptIcon,
  AddTask as AddTaskIcon,
  Payment as PaymentIcon,
  Assignment as AssignmentIcon
} from '@mui/icons-material';
import { 
  getInvoiceById, 
  updateInvoiceStatus, 
  deleteInvoice 
} from '../../services/invoiceService';
import { formatCurrency } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { format } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { COMPANY_INFO } from '../../config';
import { getCompanyInfo } from '../../services/companyService';

const InvoiceDetails = () => {
  const { invoiceId } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [companyInfo, setCompanyInfo] = useState(COMPANY_INFO);
  
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (invoiceId) {
      fetchInvoice();
      fetchCompanyInfo();
    }
  }, [invoiceId]);
  
  const fetchInvoice = async () => {
    setLoading(true);
    try {
      const fetchedInvoice = await getInvoiceById(invoiceId);
      console.log('Pobrano fakturę:', fetchedInvoice);
      setInvoice(fetchedInvoice);
    } catch (error) {
      showError('Błąd podczas pobierania danych faktury: ' + error.message);
      navigate('/invoices');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchCompanyInfo = async () => {
    try {
      const data = await getCompanyInfo();
      setCompanyInfo(data);
    } catch (error) {
      console.error('Błąd podczas pobierania danych firmy:', error);
    }
  };
  
  const handleEditClick = () => {
    navigate(`/invoices/${invoiceId}/edit`);
  };
  
  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    try {
      await deleteInvoice(invoiceId);
      showSuccess('Faktura została usunięta');
      navigate('/invoices');
    } catch (error) {
      showError('Błąd podczas usuwania faktury: ' + error.message);
    } finally {
      setDeleteDialogOpen(false);
    }
  };
  
  const handleUpdateStatus = async (newStatus) => {
    try {
      await updateInvoiceStatus(invoiceId, newStatus, currentUser.uid);
      // Odśwież dane faktury po aktualizacji
      fetchInvoice();
      showSuccess('Status faktury został zaktualizowany');
    } catch (error) {
      showError('Błąd podczas aktualizacji statusu faktury: ' + error.message);
    }
  };
  
  const handleViewCustomer = () => {
    if (invoice?.customer?.id) {
      navigate(`/customers/${invoice.customer.id}`);
    }
  };
  
  const handleViewOrder = () => {
    if (invoice?.orderId) {
      navigate(`/orders/${invoice.orderId}`);
    }
  };
  
  const formatDate = (date) => {
    if (!date) return '';
    return format(new Date(date), 'dd.MM.yyyy');
  };
  
  const renderInvoiceStatus = (status) => {
    const statusConfig = {
      'draft': { color: 'default', label: 'Szkic' },
      'issued': { color: 'primary', label: 'Wystawiona' },
      'sent': { color: 'info', label: 'Wysłana' },
      'paid': { color: 'success', label: 'Opłacona' },
      'overdue': { color: 'error', label: 'Przeterminowana' },
      'cancelled': { color: 'error', label: 'Anulowana' }
    };
    
    const config = statusConfig[status] || { color: 'default', label: status };
    
    return (
      <Chip 
        label={config.label} 
        color={config.color}
        size="small"
      />
    );
  };
  
  // Funkcja generująca i pobierająca PDF faktury
  const handleDownloadPdf = (language = 'pl') => {
    try {
    setPdfGenerating(true);
    
      // Dane firmy do faktury - użyj danych pobranych z systemu zamiast twardego kodu
      
      // Słownik tłumaczeń dla dokumentu
      const translations = {
        pl: {
          invoice: 'FAKTURA',
          seller: 'Sprzedawca:',
          buyer: 'Nabywca:',
          vatEu: 'VAT-EU:',
          email: 'Email:',
          phone: 'Tel:',
          invoiceData: 'Dane faktury:',
          issueDate: 'Data wystawienia:',
          dueDate: 'Termin płatności:',
          paymentMethod: 'Metoda płatności:',
          bank: 'Bank:',
          accountNumber: 'Nr konta:',
          lp: 'Lp.',
          name: 'Nazwa',
          quantity: 'Ilość',
          unit: 'J.m.',
          priceNet: 'Cena netto',
          vat: 'VAT',
          valueNet: 'Wartość\nnetto',
          valueGross: 'Wartość\nbrutto',
          relatedPurchaseOrders: 'Powiązane zamówienia zakupowe:',
          poNumber: 'Nr PO',
          supplier: 'Dostawca',
          netValue: 'Wartość netto',
          additionalCosts: 'Dodatkowe koszty',
          grossValue: 'Wartość brutto',
          summary: 'Podsumowanie:',
          totalNet: 'Razem netto:',
          totalVat: 'Razem VAT:',
          shippingCost: 'Koszt dostawy:',
          purchaseCosts: 'Koszty zakupów:',
          totalGross: 'Razem brutto:',
          notes: 'Uwagi:',
          footer: 'Dokument wygenerowany elektronicznie.',
          unknownSupplier: 'Nieznany dostawca'
        },
        en: {
          invoice: 'INVOICE',
          seller: 'Seller:',
          buyer: 'Buyer:',
          vatEu: 'VAT-EU:',
          email: 'Email:',
          phone: 'Phone:',
          invoiceData: 'Invoice details:',
          issueDate: 'Issue date:',
          dueDate: 'Due date:',
          paymentMethod: 'Payment method:',
          bank: 'Bank:',
          accountNumber: 'Account number:',
          lp: 'No.',
          name: 'Name',
          quantity: 'Quantity',
          unit: 'Unit',
          priceNet: 'Net price',
          vat: 'VAT',
          valueNet: 'Net\nvalue',
          valueGross: 'Gross\nvalue',
          relatedPurchaseOrders: 'Related purchase orders:',
          poNumber: 'PO Number',
          supplier: 'Supplier',
          netValue: 'Net value',
          additionalCosts: 'Additional costs',
          grossValue: 'Gross value',
          summary: 'Summary:',
          totalNet: 'Total net:',
          totalVat: 'Total VAT:',
          shippingCost: 'Shipping cost:',
          purchaseCosts: 'Purchase costs:',
          totalGross: 'Total gross:',
          notes: 'Notes:',
          footer: 'Document generated electronically.',
          unknownSupplier: 'Unknown supplier'
        }
      };
      
      // Wybierz tłumaczenia dla wybranego języka
      const t = translations[language] || translations.pl;
      
      // Tworzenie dokumentu PDF
      const doc = new jsPDF();
      
      // Dodaj czcionkę Roboto (opcjonalnie)
      doc.addFont('https://fonts.gstatic.com/s/roboto/v29/KFOmCnqEu92Fr1Me5Q.ttf', 'Roboto', 'normal');
      doc.addFont('https://fonts.gstatic.com/s/roboto/v29/KFOlCnqEu92Fr1MmWUlvAw.ttf', 'Roboto', 'bold');
      doc.setFont('Roboto');
      
      // Nagłówek dokumentu
      doc.setFontSize(18);
      doc.setTextColor(41, 128, 185);
      doc.text(t.invoice, 14, 20);
      doc.setFontSize(12);
      doc.setTextColor(0, 0, 0);
      doc.text(`${language === 'en' ? 'No.' : 'Nr'} ${invoice.number}`, 14, 26);
      
      // Informacje o sprzedawcy
      doc.setFontSize(10);
      doc.text(t.seller, 14, 40);
      
      // Sprawdź czy jest to faktura do zamówienia zakupowego
      const isPurchaseInvoice = invoice.invoiceType === 'purchase' || invoice.originalOrderType === 'purchase';
      
      // Zależnie od typu faktury, sprzedawcą może być nasza firma lub dostawca
      const sellerInfo = isPurchaseInvoice ? invoice.customer : companyInfo;
      
      const sellerLines = [
        sellerInfo.name,
        sellerInfo.address,
        `${sellerInfo.zipCode || sellerInfo.postalCode || '00-000'} ${sellerInfo.city || ''}`,
        `NIP: ${sellerInfo.nip || sellerInfo.taxId || ''}`,
        `REGON: ${sellerInfo.regon || ''}`
      ].filter(line => line && line.trim() !== '');
      
      // Dodaj kontaktowe dane sprzedawcy
      if (sellerInfo.email) sellerLines.push(`Email: ${sellerInfo.email}`);
      if (sellerInfo.phone) sellerLines.push(`${t.phone} ${sellerInfo.phone}`);
      
      sellerLines.forEach((line, index) => {
        doc.text(line, 14, 45 + (index * 5));
      });
      
      // Informacje o kupującym
      doc.text(t.buyer, 120, 40);
      
      // W przypadku faktury z zamówienia zakupowego, kupującym jest nasza firma
      const buyerInfo = isPurchaseInvoice ? companyInfo : invoice.customer;
      
      const buyerLines = [
        buyerInfo.name,
        invoice.billingAddress || buyerInfo.address || '',
        buyerInfo.city ? `${buyerInfo.zipCode || buyerInfo.postalCode || '00-000'} ${buyerInfo.city}` : '',
        buyerInfo.nip ? `NIP: ${buyerInfo.nip || buyerInfo.taxId || ''}` : ''
      ].filter(line => line && line.trim() !== '');
      
      // VAT-EU zawsze wyświetlany jako druga linia po nazwie klienta (jeśli istnieje)
      if (buyerInfo.vatEu) {
        buyerLines.splice(1, 0, `${t.vatEu} ${buyerInfo.vatEu}`);
      }
      
      if (buyerInfo.email) buyerLines.push(`${t.email} ${buyerInfo.email}`);
      if (buyerInfo.phone) buyerLines.push(`${t.phone} ${buyerInfo.phone}`);
      
      buyerLines.forEach((line, index) => {
        doc.text(line, 120, 45 + (index * 5));
      });
      
      // Informacje o płatności (w jednej kolumnie)
      const paymentInfoY = 85; // Zwiększ, aby mieć miejsce na więcej danych sprzedawcy/nabywcy
      doc.text(t.invoiceData, 14, paymentInfoY);
      doc.text(`${t.issueDate} ${formatDate(invoice.issueDate)}`, 14, paymentInfoY + 5);
      doc.text(`${t.dueDate} ${formatDate(invoice.dueDate)}`, 14, paymentInfoY + 10);
      doc.text(`${t.paymentMethod} ${invoice.paymentMethod}`, 14, paymentInfoY + 15);
      doc.text(`${t.bank} ${companyInfo.bankName}`, 14, paymentInfoY + 20);
      doc.text(`${t.accountNumber} ${companyInfo.bankAccount}`, 14, paymentInfoY + 25);
      
      // Nagłówki tabeli
      const tableColumn = [
        { header: t.lp, dataKey: 'lp' },
        { header: t.name, dataKey: 'nazwa' },
        { header: t.quantity, dataKey: 'ilosc' },
        { header: t.unit, dataKey: 'jm' },
        { header: t.priceNet, dataKey: 'cena' },
        { header: t.vat, dataKey: 'vat' },
        { header: t.valueNet, dataKey: 'netto' },
        { header: t.valueGross, dataKey: 'brutto' }
      ];
      
      // Dane do tabeli
      const tableRows = [];
      
      invoice.items.forEach((item, index) => {
        const quantity = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const vat = Number(item.vat) || 23;
        
        const netValue = quantity * price;
        const vatValue = netValue * (vat / 100);
        const grossValue = netValue + vatValue;
        
        tableRows.push({
          lp: (index + 1).toString(),
          nazwa: item.name,
          ilosc: quantity.toString(),
          jm: item.unit,
          cena: `${price.toFixed(2)}`,
          vat: `${vat}%`,
          netto: `${netValue.toFixed(2)}`,
          brutto: `${grossValue.toFixed(2)}`
        });
      });
      
      // Dodaj tabelę pozycji faktury - zwiększ startY, aby zostawić więcej miejsca
      autoTable(doc, {
        head: [tableColumn.map(col => col.header)],
        body: tableRows.map(row => [
          row.lp,
          row.nazwa,
          row.ilosc,
          row.jm,
          row.cena,
          row.vat,
          row.netto,
          row.brutto
        ]),
        startY: 120, // Zwiększono z 100 na 120, aby dodać więcej przestrzeni
        theme: 'grid',
        tableWidth: 'auto',
        styles: { 
          fontSize: 9,
          cellPadding: 2,
          font: 'Roboto'
        },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 50 },
          2: { cellWidth: 15, halign: 'right' },
          3: { cellWidth: 15, halign: 'center' },
          4: { cellWidth: 20, halign: 'right' },
          5: { cellWidth: 15, halign: 'center' },
          6: { cellWidth: 25, halign: 'right' },
          7: { cellWidth: 25, halign: 'right' }
        },
        headStyles: { 
          fillColor: [41, 128, 185], 
          textColor: 255,
          halign: 'center',
          valign: 'middle',
          font: 'Roboto'
        },
        didDrawPage: function(data) {
          // Dodawanie zł po każdej wartości w kolumnach z cenami
          data.table.body.forEach((row, rowIndex) => {
            if (rowIndex >= 0) { // Pomijamy nagłówek
              [4, 6, 7].forEach(colIndex => {
                if (row.cells[colIndex]) {
                  const cell = row.cells[colIndex];
                  if (cell.text) {
                    cell.text = `${cell.text} ${invoice.currency}`;
                  }
                }
              });
            }
          });
        }
      });
      
      // Oblicz sumy
      const totalNetto = calculateTotalNetto(invoice.items);
      const totalVat = calculateTotalVat(invoice.items, isPurchaseInvoice ? invoice.vatRate : null);
      
      // Dla faktur z zamówień zakupowych, dodaj dodatkowe koszty
      let additionalCostsValue = 0;
      if (isPurchaseInvoice && invoice.additionalCostsItems && Array.isArray(invoice.additionalCostsItems)) {
        additionalCostsValue = invoice.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
      } else if (isPurchaseInvoice) {
        additionalCostsValue = parseFloat(invoice.additionalCosts) || 0;
      }
      
      // Użyj zapisanej wartości całkowitej z obiektu faktury zamiast przeliczać na nowo
      const totalBrutto = parseFloat(invoice.total) || 0;
      
      // Dodaj tabelę z powiązanymi zamówieniami zakupowymi, jeśli istnieją
      let currentY = doc.lastAutoTable.finalY + 10;
      
      if (invoice.originalOrderType === 'customer' && invoice.linkedPurchaseOrders && invoice.linkedPurchaseOrders.length > 0) {
        // Dodaj tytuł sekcji PO
        doc.text(t.relatedPurchaseOrders, 14, currentY + 5);
        
        const headColumns = [
          { header: t.poNumber, dataKey: 'number' },
          { header: t.supplier, dataKey: 'supplier' },
          { header: t.netValue, dataKey: 'net' },
          { header: t.additionalCosts, dataKey: 'additional' },
          { header: t.vat, dataKey: 'vat' },
          { header: t.grossValue, dataKey: 'gross' }
        ];
        
        const poRows = invoice.linkedPurchaseOrders.map(po => {
          // Oblicz lub użyj zapisanych wartości
          const productsValue = po.calculatedProductsValue || po.totalValue || 
            (Array.isArray(po.items) ? po.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0) : 0);
          
          let additionalCostsValue = 0;
          if (po.calculatedAdditionalCosts !== undefined) {
            additionalCostsValue = parseFloat(po.calculatedAdditionalCosts);
          } else if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
            additionalCostsValue = po.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
          } else if (po.additionalCosts) {
            additionalCostsValue = parseFloat(po.additionalCosts) || 0;
          }
          
          const vatRate = parseFloat(po.vatRate) || 23;
          const vatValue = (productsValue * vatRate) / 100;
          
          let totalGross = 0;
          if (po.finalGrossValue !== undefined) {
            totalGross = parseFloat(po.finalGrossValue);
          } else if (po.totalGross !== undefined) {
            totalGross = parseFloat(po.totalGross);
          } else {
            totalGross = productsValue + vatValue + additionalCostsValue;
          }
          
          return {
            number: po.number || po.id,
            supplier: po.supplier?.name || t.unknownSupplier,
            net: `${productsValue.toFixed(2)}`,
            additional: `${additionalCostsValue.toFixed(2)}`,
            vat: `${vatValue.toFixed(2)}`,
            gross: `${totalGross.toFixed(2)}`
          };
        });
        
        // Dodaj tabelę PO
        autoTable(doc, {
          head: [headColumns.map(col => col.header)],
          body: poRows.map(row => [
            row.number,
            row.supplier,
            row.net,
            row.additional,
            row.vat,
            row.gross
          ]),
          startY: currentY + 10,
          theme: 'grid',
          tableWidth: 'auto',
          styles: { 
            fontSize: 8,
            cellPadding: 2,
            font: 'Roboto'
          },
          headStyles: { 
            fillColor: [41, 128, 185], 
            textColor: 255,
            halign: 'center',
            valign: 'middle',
            font: 'Roboto'
          },
          didDrawPage: function(data) {
            // Dodawanie waluty po każdej wartości w kolumnach z cenami
            data.table.body.forEach((row, rowIndex) => {
              if (rowIndex >= 0) { // Pomijamy nagłówek
                [2, 3, 4, 5].forEach(colIndex => {
                  if (row.cells[colIndex]) {
                    const cell = row.cells[colIndex];
                    if (cell.text) {
                      cell.text = `${cell.text} ${invoice.currency}`;
                    }
                  }
                });
              }
            });
          }
        });
        
        currentY = doc.lastAutoTable.finalY + 10;
      }
      
      // Dodaj podsumowanie po tabeli PO
      doc.setFont('Roboto', 'bold');
      doc.text(t.summary, 140, currentY);
      doc.setFont('Roboto', 'normal');
      doc.text(`${t.totalNet} ${totalNetto.toFixed(2)} ${invoice.currency}`, 140, currentY + 6);
      doc.text(`${t.totalVat} ${totalVat.toFixed(2)} ${invoice.currency}`, 140, currentY + 12);
      
      // Dodaj informację o kosztach wysyłki, jeśli istnieją
      let extraLines = 0;
      let summaryY = currentY + 18;
      
      if (invoice.shippingInfo && invoice.shippingInfo.cost > 0) {
        doc.text(`${t.shippingCost} ${parseFloat(invoice.shippingInfo.cost).toFixed(2)} ${invoice.currency}`, 140, summaryY);
        summaryY += 6;
        extraLines += 1;
      }
      
      // Dodaj informację o kosztach z powiązanych PO, jeśli istnieją
      if (invoice.originalOrderType === 'customer' && invoice.linkedPurchaseOrders && invoice.linkedPurchaseOrders.length > 0) {
        const poTotalValue = invoice.linkedPurchaseOrders.reduce((sum, po) => {
          let poValue = 0;
          if (po.finalGrossValue !== undefined) {
            poValue = parseFloat(po.finalGrossValue);
          } else if (po.totalGross !== undefined) {
            poValue = parseFloat(po.totalGross);
          } else {
            const productsValue = po.calculatedProductsValue || po.totalValue || 
              (Array.isArray(po.items) ? po.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0) : 0);
            
            let additionalCostsValue = 0;
            if (po.calculatedAdditionalCosts !== undefined) {
              additionalCostsValue = parseFloat(po.calculatedAdditionalCosts);
            } else if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
              additionalCostsValue = po.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
            } else if (po.additionalCosts) {
              additionalCostsValue = parseFloat(po.additionalCosts) || 0;
            }
            
            const vatRate = parseFloat(po.vatRate) || 23;
            const vatValue = (productsValue * vatRate) / 100;
            
            poValue = productsValue + vatValue + additionalCostsValue;
          }
          
          return sum + poValue;
        }, 0);
        
        doc.text(`${t.purchaseCosts} ${poTotalValue.toFixed(2)} ${invoice.currency}`, 140, summaryY);
        summaryY += 6;
        extraLines += 1;
      }
      
      // Dodaj całkowitą kwotę brutto na końcu
      doc.setFont('Roboto', 'bold');
      doc.text(`${t.totalGross} ${totalBrutto.toFixed(2)} ${invoice.currency}`, 140, summaryY);
      doc.setFont('Roboto', 'normal');
      
      // Dodaj uwagi, jeśli istnieją
      if (invoice.notes) {
        const notesY = summaryY + 15;
        doc.text(`${t.notes}`, 14, notesY);
        doc.text(invoice.notes, 14, notesY + 6);
      }
      
      // Dodaj stopkę
      const pageHeight = doc.internal.pageSize.height;
      doc.text(t.footer, 105, pageHeight - 15, { align: 'center' });
      
      // Pobierz plik PDF
      doc.save(`Faktura_${invoice.number}_${language.toUpperCase()}.pdf`);
      showSuccess(`Faktura została pobrana w formacie PDF (${language.toUpperCase()})`);
    } catch (error) {
      console.error('Błąd podczas generowania PDF:', error);
      showError('Nie udało się wygenerować pliku PDF: ' + error.message);
    } finally {
      setPdfGenerating(false);
    }
  };
  
  // Funkcje pomocnicze do obliczania wartości
  const calculateTotalNetto = (items) => {
    if (!items || !Array.isArray(items)) return 0;
    
    return items.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      return sum + (quantity * price);
    }, 0);
  };
  
  const calculateTotalVat = (items, fixedVatRate = null) => {
    if (!items || !Array.isArray(items)) return 0;
    
    return items.reduce((sum, item) => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      // Jeśli mamy ustaloną stawkę VAT (np. z zamówienia zakupowego), użyj jej
      const vat = fixedVatRate !== null ? fixedVatRate : (Number(item.vat) || 23);
      return sum + (quantity * price * (vat / 100));
    }, 0);
  };
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}>
        <CircularProgress />
      </Box>
    );
  }
  
  if (!invoice) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h5">Nie znaleziono faktury</Typography>
        <Button 
          variant="contained" 
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/invoices')}
          sx={{ mt: 2 }}
        >
          Powrót do listy faktur
        </Button>
      </Box>
    );
  }
  
  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/invoices')}
        >
          Powrót do listy
        </Button>
        <Typography variant="h4" component="h1">
          Faktura {invoice.number}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          {invoice.status === 'draft' && (
            <>
              <Button
                variant="outlined"
                startIcon={<EditIcon />}
                onClick={handleEditClick}
              >
                Edytuj
              </Button>
              <Button
                variant="outlined"
                color="error"
                startIcon={<DeleteIcon />}
                onClick={handleDeleteClick}
              >
                Usuń
              </Button>
            </>
          )}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            disabled={invoice.status === 'draft' || pdfGenerating}
              onClick={() => handleDownloadPdf('pl')}
          >
              {pdfGenerating ? 'Generowanie...' : 'Pobierz PDF (PL)'}
          </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              disabled={invoice.status === 'draft' || pdfGenerating}
              onClick={() => handleDownloadPdf('en')}
            >
              {pdfGenerating ? 'Generowanie...' : 'Pobierz PDF (EN)'}
            </Button>
          </Box>
          {invoice.status === 'draft' && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<ReceiptIcon />}
              onClick={() => handleUpdateStatus('issued')}
            >
              Wystaw fakturę
            </Button>
          )}
        </Box>
      </Box>
      
      <Paper sx={{ p: 3, mb: 4 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Dane podstawowe
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    Numer faktury
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {invoice.number}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    Status
                  </Typography>
                  <Box>
                    {renderInvoiceStatus(invoice.status)}
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    Data wystawienia
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {formatDate(invoice.issueDate)}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    Termin płatności
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {formatDate(invoice.dueDate)}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    Metoda płatności
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {invoice.paymentMethod}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="body2" color="text.secondary">
                    Status płatności
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {invoice.paymentStatus === 'paid' ? 'Opłacona' : 'Nieopłacona'}
                  </Typography>
                </Grid>
                {invoice.paymentDate && (
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">
                      Data płatności
                    </Typography>
                    <Typography variant="body1" gutterBottom>
                      {formatDate(invoice.paymentDate)}
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </Box>
            
            <Divider sx={{ my: 3 }} />
            
            <Box>
              <Typography variant="h6" gutterBottom>
                Adresy
              </Typography>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardContent sx={{ p: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Adres do faktury
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                        {invoice.billingAddress || invoice.customer?.billingAddress || invoice.customer?.address || 'Nie podano adresu do faktury'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Card variant="outlined" sx={{ height: '100%' }}>
                    <CardContent sx={{ p: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        Adres dostawy
                      </Typography>
                      <Typography variant="body2" sx={{ whiteSpace: 'pre-line' }}>
                        {invoice.shippingAddress || invoice.customer?.shippingAddress || invoice.customer?.address || 'Nie podano adresu dostawy'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          </Grid>
          
          <Grid item xs={12} md={4}>
            {/* Sekcja Klient */}
            <Card variant="outlined" sx={{ mb: 3 }}>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">
                    Klient
                  </Typography>
                  <IconButton 
                    size="small" 
                    onClick={handleViewCustomer}
                    title="Zobacz szczegóły klienta"
                  >
                    <PersonIcon />
                  </IconButton>
                </Box>
                
                <Typography variant="body1" fontWeight="bold">
                  {invoice.customer?.name || 'Brak nazwy klienta'}
                </Typography>
                
                {invoice.customer?.vatEu && (
                  <Typography variant="body2" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                    VAT-EU: {invoice.customer.vatEu}
                  </Typography>
                )}
                
                {invoice.customer?.email && (
                  <Typography variant="body2" gutterBottom>
                    Email: {invoice.customer.email}
                  </Typography>
                )}
                
                {invoice.customer?.phone && (
                  <Typography variant="body2" gutterBottom>
                    Telefon: {invoice.customer.phone}
                  </Typography>
                )}
                
                {invoice.customer?.address && (
                  <Typography variant="body2" gutterBottom>
                    Adres: {invoice.customer.address}
                  </Typography>
                )}
                
                {invoice.customer?.shippingAddress && (
                  <Typography variant="body2" gutterBottom>
                    Adres dostawy: {invoice.customer.shippingAddress}
                  </Typography>
                )}
                
                {invoice.customer?.billingAddress && (
                  <Typography variant="body2" gutterBottom>
                    Adres do faktury: {invoice.customer.billingAddress}
                  </Typography>
                )}
                
                {invoice.orderId && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2">
                        Powiązane zamówienie
                      </Typography>
                      <IconButton 
                        size="small" 
                        onClick={handleViewOrder}
                        title="Zobacz szczegóły zamówienia"
                      >
                        <AssignmentIcon />
                      </IconButton>
                    </Box>
                    
                    <Typography variant="body2">
                      {invoice.orderNumber || invoice.orderId}
                    </Typography>
                  </>
                )}
              </CardContent>
            </Card>
            
            {/* Sekcja Sprzedawca */}
            <Card variant="outlined" sx={{ mb: 3 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Sprzedawca
                </Typography>
                
                <Typography variant="body1" fontWeight="bold" gutterBottom>
                  {companyInfo.name}
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  {companyInfo.address}
                </Typography>
                <Typography variant="body2" sx={{ mb: 0.5 }}>
                  {companyInfo.city}
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    NIP: {companyInfo.nip}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    REGON: {companyInfo.regon}
                  </Typography>
                </Box>
                <Box sx={{ mt: 1 }}>
                  {companyInfo.email && (
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      Email: {companyInfo.email}
                    </Typography>
                  )}
                  {companyInfo.phone && (
                    <Typography variant="body2" sx={{ mb: 0.5 }}>
                      Telefon: {companyInfo.phone}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ mt: 1 }}>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    Bank: {companyInfo.bankName}
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 0.5 }}>
                    Numer konta: {companyInfo.bankAccount}
                  </Typography>
                </Box>
              </CardContent>
            </Card>
            
            {/* Sekcja Akcje */}
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Akcje
                </Typography>
                
                {invoice.status === 'issued' && (
                  <Button
                    fullWidth
                    variant="outlined"
                    startIcon={<EmailIcon />}
                    onClick={() => handleUpdateStatus('sent')}
                    sx={{ mb: 1 }}
                  >
                    Oznacz jako wysłaną
                  </Button>
                )}
                
                {(invoice.status === 'issued' || invoice.status === 'sent') && (
                  <Button
                    fullWidth
                    variant="outlined"
                    color="success"
                    startIcon={<PaymentIcon />}
                    onClick={() => handleUpdateStatus('paid')}
                    sx={{ mb: 1 }}
                  >
                    Oznacz jako opłaconą
                  </Button>
                )}
                
                {invoice.status === 'draft' && (
                  <Button
                    fullWidth
                    variant="outlined"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={handleDeleteClick}
                    sx={{ mb: 1 }}
                  >
                    Usuń fakturę
                  </Button>
                )}
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>
      
      {/* Oddzielny Paper dla sekcji pozycji faktury */}
      <Paper sx={{ p: 3, mb: 3, mt: 4, clear: 'both' }}>
        <Typography variant="h6" gutterBottom>
          Pozycje faktury
        </Typography>
        
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ minWidth: 140 }}>Nazwa</TableCell>
                <TableCell sx={{ minWidth: 140 }}>Opis</TableCell>
                <TableCell align="right" sx={{ width: 70 }}>Ilość</TableCell>
                <TableCell sx={{ width: 60 }}>J.m.</TableCell>
                <TableCell align="right" sx={{ width: 100 }}>Cena netto</TableCell>
                <TableCell align="right" sx={{ width: 60 }}>VAT</TableCell>
                <TableCell align="right" sx={{ width: 120 }}>Wart. netto</TableCell>
                <TableCell align="right" sx={{ width: 120 }}>Wart. brutto</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoice.items.map((item, index) => {
                // Upewnij się, że quantity i price są liczbami
                const quantity = Number(item.quantity) || 0;
                const price = Number(item.price) || 0;
                const vat = Number(item.vat) || 23;
                
                const netValue = quantity * price;
                const vatValue = netValue * (vat / 100);
                const grossValue = netValue + vatValue;
                
                return (
                  <TableRow key={index}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.description || '-'}</TableCell>
                    <TableCell align="right">{quantity}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell align="right">{price.toFixed(2)} {invoice.currency}</TableCell>
                    <TableCell align="right">{vat}%</TableCell>
                    <TableCell align="right">{netValue.toFixed(2)} {invoice.currency}</TableCell>
                    <TableCell align="right">{grossValue.toFixed(2)} {invoice.currency}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        
        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <Grid container spacing={1} justifyContent="flex-end" sx={{ maxWidth: 300 }}>
            <Grid item xs={6}>
              <Typography variant="body1" fontWeight="bold" align="right">
                Razem netto:
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body1" fontWeight="bold" align="right">
                {invoice.items.reduce((sum, item) => {
                  const quantity = Number(item.quantity) || 0;
                  const price = Number(item.price) || 0;
                  return sum + (quantity * price);
                }, 0).toFixed(2)} {invoice.currency}
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body1" fontWeight="bold" align="right">
                Razem VAT:
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body1" fontWeight="bold" align="right">
                {invoice.items.reduce((sum, item) => {
                  const quantity = Number(item.quantity) || 0;
                  const price = Number(item.price) || 0;
                  const vat = Number(item.vat) || 23;
                  return sum + (quantity * price * (vat / 100));
                }, 0).toFixed(2)} {invoice.currency}
              </Typography>
            </Grid>
            
            {/* Wyświetl koszt wysyłki, jeśli istnieje */}
            {invoice.shippingInfo && invoice.shippingInfo.cost > 0 && (
              <>
                <Grid item xs={6}>
                  <Typography variant="body1" fontWeight="bold" align="right">
                    Koszt dostawy:
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body1" fontWeight="bold" align="right">
                    {parseFloat(invoice.shippingInfo.cost).toFixed(2)} {invoice.currency}
                  </Typography>
                </Grid>
              </>
            )}
          </Grid>
        </Box>
        
        {/* Sekcja zamówień zakupowych związanych z fakturą */}
        {invoice.originalOrderType === 'customer' && invoice.linkedPurchaseOrders && invoice.linkedPurchaseOrders.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>
              Powiązane zamówienia zakupowe
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Numer zamówienia</TableCell>
                    <TableCell>Dostawca</TableCell>
                    <TableCell align="right">Wartość produktów netto</TableCell>
                    <TableCell align="right">Dodatkowe koszty</TableCell>
                    <TableCell align="right">VAT</TableCell>
                    <TableCell align="right">Wartość brutto</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoice.linkedPurchaseOrders.map((po) => {
                    // Oblicz lub użyj zapisanych wartości
                    const productsValue = po.calculatedProductsValue || po.totalValue || 
                      (Array.isArray(po.items) ? po.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0) : 0);
                    
                    let additionalCostsValue = 0;
                    if (po.calculatedAdditionalCosts !== undefined) {
                      additionalCostsValue = parseFloat(po.calculatedAdditionalCosts);
                    } else if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
                      additionalCostsValue = po.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
                    } else if (po.additionalCosts) {
                      additionalCostsValue = parseFloat(po.additionalCosts) || 0;
                    }
                    
                    const vatRate = parseFloat(po.vatRate) || 23;
                    const vatValue = (productsValue * vatRate) / 100;
                    
                    let totalGross = 0;
                    if (po.finalGrossValue !== undefined) {
                      totalGross = parseFloat(po.finalGrossValue);
                    } else if (po.totalGross !== undefined) {
                      totalGross = parseFloat(po.totalGross);
                    } else {
                      totalGross = productsValue + vatValue + additionalCostsValue;
                    }
                    
                    return (
                      <TableRow key={po.id}>
                        <TableCell>
                          <Button 
                            variant="text" 
                            size="small" 
                            onClick={() => navigate(`/purchase-orders/${po.id}`)}
                          >
                            {po.number || po.id}
                          </Button>
                        </TableCell>
                        <TableCell>{po.supplier?.name || 'Nieznany dostawca'}</TableCell>
                        <TableCell align="right">{productsValue.toFixed(2)} {po.currency || invoice.currency}</TableCell>
                        <TableCell align="right">{additionalCostsValue.toFixed(2)} {po.currency || invoice.currency}</TableCell>
                        <TableCell align="right">{vatValue.toFixed(2)} {po.currency || invoice.currency}</TableCell>
                        <TableCell align="right">{totalGross.toFixed(2)} {po.currency || invoice.currency}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            
            {/* Podsumowanie kosztów zakupowych przeniesione poza tabelę */}
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Typography variant="h6" fontWeight="bold" align="right">
                Razem koszty zakupów: {invoice.linkedPurchaseOrders.reduce((sum, po) => {
                  let poValue = 0;
                  if (po.finalGrossValue !== undefined) {
                    poValue = parseFloat(po.finalGrossValue);
                  } else if (po.totalGross !== undefined) {
                    poValue = parseFloat(po.totalGross);
                  } else {
                    const productsValue = po.calculatedProductsValue || po.totalValue || 
                      (Array.isArray(po.items) ? po.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0) : 0);
                    
                    let additionalCostsValue = 0;
                    if (po.calculatedAdditionalCosts !== undefined) {
                      additionalCostsValue = parseFloat(po.calculatedAdditionalCosts);
                    } else if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
                      additionalCostsValue = po.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
                    } else if (po.additionalCosts) {
                      additionalCostsValue = parseFloat(po.additionalCosts) || 0;
                    }
                    
                    const vatRate = parseFloat(po.vatRate) || 23;
                    const vatValue = (productsValue * vatRate) / 100;
                    
                    poValue = productsValue + vatValue + additionalCostsValue;
                  }
                  
                  return sum + poValue;
                }, 0).toFixed(2)} {invoice.currency}
              </Typography>
            </Box>
          </Box>
        )}
        
        {/* Przeniesione podsumowanie Razem brutto na sam dół */}
        <Box sx={{ mt: 4, display: 'flex', justifyContent: 'flex-end' }}>
          <Box sx={{ maxWidth: 300, border: '2px solid', borderColor: 'primary.main', borderRadius: 1, p: 2, bgcolor: 'background.paper' }}>
            <Grid container spacing={1}>
            <Grid item xs={6}>
              <Typography variant="h6" fontWeight="bold" align="right" color="primary">
                Razem brutto:
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="h6" fontWeight="bold" align="right" color="primary">
                  {parseFloat(invoice.total).toFixed(2)} {invoice.currency}
              </Typography>
            </Grid>
          </Grid>
          </Box>
        </Box>
      </Paper>
      
      {invoice.notes && (
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" gutterBottom>
            Uwagi
          </Typography>
          <Typography variant="body1">
            {invoice.notes}
          </Typography>
        </Paper>
      )}
      
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Usunąć fakturę?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć fakturę {invoice.number}? Tej operacji nie można cofnąć.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Usuń
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default InvoiceDetails; 