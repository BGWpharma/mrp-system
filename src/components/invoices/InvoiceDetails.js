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

const InvoiceDetails = () => {
  const { invoiceId } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  useEffect(() => {
    if (invoiceId) {
      fetchInvoice();
    }
  }, [invoiceId]);
  
  const fetchInvoice = async () => {
    setLoading(true);
    try {
      const fetchedInvoice = await getInvoiceById(invoiceId);
      setInvoice(fetchedInvoice);
    } catch (error) {
      showError('Błąd podczas pobierania danych faktury: ' + error.message);
      navigate('/invoices');
    } finally {
      setLoading(false);
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
      const doc = new jsPDF();
      
      // Dodaj nagłówek
      doc.setFontSize(20);
      doc.text('Faktura', 105, 15, { align: 'center' });
      doc.setFontSize(12);
      doc.text(`Nr: ${invoice.number}`, 105, 22, { align: 'center' });
      
      // Dodaj informacje o sprzedawcy i nabywcy
      doc.setFontSize(10);
      doc.text('Sprzedawca:', 14, 35);
      doc.text('Twoja Firma Sp. z o.o.', 14, 40);
      doc.text('ul. Przykładowa 123', 14, 45);
      doc.text('00-000 Miasto', 14, 50);
      doc.text('NIP: 123-456-78-90', 14, 55);
      
      doc.text('Nabywca:', 120, 35);
      doc.text(`${invoice.customer.name}`, 120, 40);
      doc.text(`${invoice.billingAddress || '-'}`, 120, 45);
      const customerEmail = invoice.customer.email ? `Email: ${invoice.customer.email}` : '';
      const customerPhone = invoice.customer.phone ? `Tel: ${invoice.customer.phone}` : '';
      if (customerEmail) doc.text(customerEmail, 120, 50);
      if (customerPhone) doc.text(customerPhone, 120, 55);
      
      // Dodaj informacje o dacie i płatności
      doc.text(`Data wystawienia: ${formatDate(invoice.issueDate)}`, 14, 70);
      doc.text(`Termin płatności: ${formatDate(invoice.dueDate)}`, 14, 75);
      doc.text(`Metoda płatności: ${invoice.paymentMethod}`, 14, 80);
      
      // Przygotuj dane dla tabeli pozycji faktury
      const tableColumn = ["Lp.", "Nazwa", "Ilość", "J.m.", "Cena netto", "VAT", "Wartość netto", "Wartość brutto"];
      const tableRows = [];
      
      invoice.items.forEach((item, index) => {
        const quantity = Number(item.quantity) || 0;
        const price = Number(item.price) || 0;
        const vat = Number(item.vat) || 23;
        
        const netValue = quantity * price;
        const vatValue = netValue * (vat / 100);
        const grossValue = netValue + vatValue;
        
        const itemData = [
          index + 1,
          item.name,
          quantity,
          item.unit,
          `${price.toFixed(2)} zł`,
          `${vat}%`,
          `${netValue.toFixed(2)} zł`,
          `${grossValue.toFixed(2)} zł`
        ];
        
        tableRows.push(itemData);
      });
      
      // Dodaj tabelę pozycji faktury - użyj autoTable jako funkcji
      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 90,
        theme: 'grid',
        styles: { fontSize: 8 },
        columnStyles: {
          0: { cellWidth: 10 },
          4: { halign: 'right' },
          5: { halign: 'right' },
          6: { halign: 'right' },
          7: { halign: 'right' }
        },
        headStyles: { fillColor: [41, 128, 185], textColor: 255 }
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
      
      // Dodaj podsumowanie - użyj doc.lastAutoTable.finalY
      const finalY = doc.lastAutoTable.finalY + 10;
      doc.text('Podsumowanie:', 130, finalY);
      doc.text(`Razem netto: ${totalNetto.toFixed(2)} zł`, 130, finalY + 5);
      doc.text(`Razem VAT: ${totalVat.toFixed(2)} zł`, 130, finalY + 10);
      doc.text(`Razem brutto: ${totalBrutto.toFixed(2)} zł`, 130, finalY + 15);
      
      // Dodaj uwagi, jeśli istnieją
      if (invoice.notes) {
        doc.text('Uwagi:', 14, finalY + 30);
        doc.text(invoice.notes, 14, finalY + 35);
      }
      
      // Dodaj stopkę
      const pageHeight = doc.internal.pageSize.height;
      doc.text('Dokument wygenerowany elektronicznie.', 105, pageHeight - 15, { align: 'center' });
      
      // Pobierz plik PDF
      doc.save(`Faktura_${invoice.number}.pdf`);
      showSuccess('Faktura została pobrana w formacie PDF');
    } catch (error) {
      console.error('Błąd podczas generowania PDF:', error);
      showError('Nie udało się wygenerować pliku PDF');
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
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={8}>
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Dane podstawowe
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Numer faktury
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {invoice.number}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Status
                  </Typography>
                  <Box>
                    {renderInvoiceStatus(invoice.status)}
                  </Box>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Data wystawienia
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {formatDate(invoice.issueDate)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Termin płatności
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {formatDate(invoice.dueDate)}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Metoda płatności
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {invoice.paymentMethod}
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body2" color="text.secondary">
                    Status płatności
                  </Typography>
                  <Typography variant="body1" gutterBottom>
                    {invoice.paymentStatus === 'paid' ? 'Opłacona' : 'Nieopłacona'}
                  </Typography>
                </Grid>
                {invoice.paymentDate && (
                  <Grid item xs={6}>
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
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" gutterBottom>
                        Adres do faktury
                      </Typography>
                      <Typography variant="body2">
                        {invoice.billingAddress || 'Nie podano adresu do faktury'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="subtitle2" gutterBottom>
                        Adres dostawy
                      </Typography>
                      <Typography variant="body2">
                        {invoice.shippingAddress || 'Nie podano adresu dostawy'}
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
            </Box>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <Card variant="outlined" sx={{ height: '100%' }}>
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
                  {invoice.customer?.name}
                </Typography>
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
                
                <Divider sx={{ my: 2 }} />
                
                <Box sx={{ mt: 2 }}>
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
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </Paper>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Pozycje faktury
        </Typography>
        
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nazwa</TableCell>
                <TableCell>Opis</TableCell>
                <TableCell align="right">Ilość</TableCell>
                <TableCell>J.m.</TableCell>
                <TableCell align="right">Cena netto</TableCell>
                <TableCell align="right">VAT</TableCell>
                <TableCell align="right">Wartość netto</TableCell>
                <TableCell align="right">Wartość brutto</TableCell>
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
        
        <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
          <Grid container spacing={1} justifyContent="flex-end" sx={{ maxWidth: 400 }}>
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