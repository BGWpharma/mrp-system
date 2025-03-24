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
  const handleDownloadPdf = () => {
    if (!invoice) return;
    
    setPdfGenerating(true);
    
    try {
      // Utwórz nowy dokument PDF
      const { jsPDF } = require('jspdf');
      const autoTable = require('jspdf-autotable').default;
      
      // Inicjalizacja dokumentu z obsługą polskich znaków
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });
      
      // Dodawanie polskiej czcionki
      doc.addFont('https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5Q.ttf', 'Roboto', 'normal');
      doc.setFont('Roboto');
      
      // Dodaj nagłówek
      doc.setFontSize(20);
      doc.text('Faktura', 105, 15, { align: 'center' });
      
      doc.setFontSize(12);
      doc.text(`Nr: ${invoice.number}`, 105, 22, { align: 'center' });
      
      // Dodaj informacje o sprzedawcy i nabywcy
      doc.setFontSize(10);
      
      // Dane sprzedawcy
      doc.text('Sprzedawca:', 14, 35);
      const sellerLines = [
        companyInfo.name,
        companyInfo.address,
        companyInfo.city,
        `NIP: ${companyInfo.nip}`,
        `Tel: ${companyInfo.phone}`
      ];
      
      sellerLines.forEach((line, index) => {
        doc.text(line, 14, 40 + (index * 5));
      });
      
      // Dane nabywcy
      doc.text('Nabywca:', 120, 35);
      const buyerLines = [
        invoice.customer.name,
        invoice.billingAddress || '-'
      ];
      
      // VAT-EU zawsze wyświetlany jako druga linia po nazwie klienta (jeśli istnieje)
      if (invoice.customer?.vatEu) {
        buyerLines.splice(1, 0, `VAT-EU: ${invoice.customer.vatEu}`);
      }
      
      if (invoice.customer.email) buyerLines.push(`Email: ${invoice.customer.email}`);
      if (invoice.customer.phone) buyerLines.push(`Tel: ${invoice.customer.phone}`);
      
      buyerLines.forEach((line, index) => {
        doc.text(line, 120, 40 + (index * 5));
      });
      
      // Informacje o płatności (w jednej kolumnie)
      const paymentInfoY = 70;
      doc.text('Dane faktury:', 14, paymentInfoY);
      doc.text(`Data wystawienia: ${formatDate(invoice.issueDate)}`, 14, paymentInfoY + 5);
      doc.text(`Termin płatności: ${formatDate(invoice.dueDate)}`, 14, paymentInfoY + 10);
      doc.text(`Metoda płatności: ${invoice.paymentMethod}`, 14, paymentInfoY + 15);
      doc.text(`Bank: ${companyInfo.bankName}`, 14, paymentInfoY + 20);
      doc.text(`Nr konta: ${companyInfo.bankAccount}`, 14, paymentInfoY + 25);
      
      // Nagłówki tabeli
      const tableColumn = [
        { header: 'Lp.', dataKey: 'lp' },
        { header: 'Nazwa', dataKey: 'nazwa' },
        { header: 'Ilość', dataKey: 'ilosc' },
        { header: 'J.m.', dataKey: 'jm' },
        { header: 'Cena netto', dataKey: 'cena' },
        { header: 'VAT', dataKey: 'vat' },
        { header: 'Wartość netto', dataKey: 'netto' },
        { header: 'Wartość brutto', dataKey: 'brutto' }
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
      
      // Dodaj tabelę pozycji faktury
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
        startY: 100,
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
                    cell.text = `${cell.text} zł`;
                  }
                }
              });
            }
          });
        }
      });
      
      // Oblicz sumy
      const totalNetto = invoice.items.reduce((sum, item) => {
        const quantity = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        return sum + (quantity * price);
      }, 0);
      
      const totalVat = invoice.items.reduce((sum, item) => {
        const quantity = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const vat = Number(item.vat) || 23;
        return sum + (quantity * price * (vat / 100));
      }, 0);
      
      const totalBrutto = totalNetto + totalVat;
      
      // Dodaj podsumowanie
      const finalY = doc.lastAutoTable.finalY + 10;
      doc.setFont('Roboto', 'bold');
      doc.text('Podsumowanie:', 140, finalY);
      doc.setFont('Roboto', 'normal');
      doc.text(`Razem netto: ${totalNetto.toFixed(2)} zł`, 140, finalY + 6);
      doc.text(`Razem VAT: ${totalVat.toFixed(2)} zł`, 140, finalY + 12);
      doc.setFont('Roboto', 'bold');
      doc.text(`Razem brutto: ${totalBrutto.toFixed(2)} zł`, 140, finalY + 18);
      doc.setFont('Roboto', 'normal');
      
      // Dodaj uwagi, jeśli istnieją
      if (invoice.notes) {
        doc.text('Uwagi:', 14, finalY + 30);
        doc.text(invoice.notes, 14, finalY + 36);
      }
      
      // Dodaj stopkę
      const pageHeight = doc.internal.pageSize.height;
      doc.text('Dokument wygenerowany elektronicznie.', 105, pageHeight - 15, { align: 'center' });
      
      // Pobierz plik PDF
      doc.save(`Faktura_${invoice.number}.pdf`);
      showSuccess('Faktura została pobrana w formacie PDF');
    } catch (error) {
      console.error('Błąd podczas generowania PDF:', error);
      showError('Nie udało się wygenerować pliku PDF: ' + error.message);
    } finally {
      setPdfGenerating(false);
    }
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
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            disabled={invoice.status === 'draft' || pdfGenerating}
            onClick={handleDownloadPdf}
          >
            {pdfGenerating ? 'Generowanie...' : 'Pobierz PDF'}
          </Button>
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
                
                {/* Dodanie debugowania (tylko w trybie deweloperskim) */}
                {process.env.NODE_ENV === 'development' && (
                  <Box sx={{ mb: 2, p: 1, bgcolor: 'rgba(0,0,0,0.05)', borderRadius: 1 }}>
                    <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap', fontSize: '0.7rem' }}>
                      Dane klienta (debug): {JSON.stringify(invoice.customer, null, 2)}
                    </Typography>
                  </Box>
                )}
                
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
                    <TableCell align="right">{price.toFixed(2)} zł</TableCell>
                    <TableCell align="right">{vat}%</TableCell>
                    <TableCell align="right">{netValue.toFixed(2)} zł</TableCell>
                    <TableCell align="right">{grossValue.toFixed(2)} zł</TableCell>
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
                }, 0).toFixed(2)} zł
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
                }, 0).toFixed(2)} zł
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="h6" fontWeight="bold" align="right" color="primary">
                Razem brutto:
              </Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="h6" fontWeight="bold" align="right" color="primary">
                {invoice.items.reduce((sum, item) => {
                  const quantity = Number(item.quantity) || 0;
                  const price = Number(item.price) || 0;
                  const vat = Number(item.vat) || 23;
                  return sum + (quantity * price * (1 + vat / 100));
                }, 0).toFixed(2)} zł
              </Typography>
            </Grid>
          </Grid>
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