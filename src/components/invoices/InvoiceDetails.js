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
  deleteInvoice,
  getInvoicesByOrderId,
  getAvailableProformaAmount
} from '../../services/invoiceService';
import { formatCurrency } from '../../utils/formatters';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { format } from 'date-fns';
import { COMPANY_INFO } from '../../config';
import { getCompanyInfo } from '../../services/companyService';
import PaymentsSection from './PaymentsSection';
import { createInvoicePdfGenerator } from './InvoicePdfGenerator';

const InvoiceDetails = () => {
  const { invoiceId } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pdfGenerating, setPdfGenerating] = useState(false);
  const [companyInfo, setCompanyInfo] = useState(COMPANY_INFO);
  const [relatedInvoices, setRelatedInvoices] = useState([]);
  const [loadingRelatedInvoices, setLoadingRelatedInvoices] = useState(false);
  const [proformaUsageInfo, setProformaUsageInfo] = useState(null);
  
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
      
      // Pobierz powiązane faktury dla tego zamówienia
      if (fetchedInvoice.orderId) {
        await fetchRelatedInvoices(fetchedInvoice.orderId);
      }
    } catch (error) {
      showError('Błąd podczas pobierania danych faktury: ' + error.message);
      navigate('/invoices');
    } finally {
      setLoading(false);
    }
  };

  const fetchRelatedInvoices = async (orderId) => {
    if (!orderId) {
      setRelatedInvoices([]);
      setProformaUsageInfo(null);
      return;
    }
    
    setLoadingRelatedInvoices(true);
    try {
      const invoices = await getInvoicesByOrderId(orderId);
      // Filtruj tylko faktury inne niż obecna
      const filteredInvoices = invoices.filter(inv => inv.id !== invoiceId);
      setRelatedInvoices(filteredInvoices);
      
      // Jeśli obecna faktura to proforma, pobierz informacje o jej wykorzystaniu
      if (invoice?.isProforma) {
        try {
          const usageInfo = await getAvailableProformaAmount(invoiceId);
          setProformaUsageInfo(usageInfo);
        } catch (error) {
          console.error('Błąd podczas pobierania informacji o wykorzystaniu proformy:', error);
          setProformaUsageInfo(null);
        }
      } else {
        setProformaUsageInfo(null);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania powiązanych faktur:', error);
      setRelatedInvoices([]);
      setProformaUsageInfo(null);
    } finally {
      setLoadingRelatedInvoices(false);
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
      'partially_paid': { color: 'warning', label: 'Częściowo opłacona' },
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
  const handleDownloadPdf = async (language = 'en') => {
    try {
      setPdfGenerating(true);
      
      // Użyj nowego komponentu do generowania PDF
      const pdfGenerator = createInvoicePdfGenerator(invoice, companyInfo, language);
      const result = await pdfGenerator.downloadPdf(language);
      
      if (result.success) {
        showSuccess(result.message);
        } else {
        showError(result.message);
      }


      
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
          {invoice.isProforma ? 'Faktura proforma' : 'Faktura'} {invoice.number}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
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
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            disabled={invoice.status === 'draft' || pdfGenerating}
            onClick={() => handleDownloadPdf('en')}
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
                {invoice.isProforma && (
                  <Grid item xs={12} sm={6}>
                    <Typography variant="body2" color="text.secondary">
                      Typ faktury
                    </Typography>
                    <Typography variant="body1" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      Faktura proforma
                    </Typography>
                  </Grid>
                )}
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
                    {invoice.paymentStatus === 'paid' ? 'Opłacona' : 
                     invoice.paymentStatus === 'partially_paid' ? 'Częściowo opłacona' : 'Nieopłacona'}
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

                {/* Wyświetl informacje o wykorzystaniu proformy */}
                {invoice?.isProforma && proformaUsageInfo && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" gutterBottom>
                      Wykorzystanie proformy:
                    </Typography>
                    <Box sx={{ p: 2, bgcolor: 'warning.light', borderRadius: 1 }}>
                      <Typography variant="body2">
                        <strong>Kwota proformy:</strong> {proformaUsageInfo.total.toFixed(2)} {invoice.currency || 'EUR'}
                      </Typography>
                      <Typography variant="body2" color="error.main">
                        <strong>Wykorzystane:</strong> {proformaUsageInfo.used.toFixed(2)} {invoice.currency || 'EUR'}
                      </Typography>
                      <Typography variant="body2" color="success.main">
                        <strong>Dostępne:</strong> {proformaUsageInfo.available.toFixed(2)} {invoice.currency || 'EUR'}
                      </Typography>
                      {proformaUsageInfo.used > 0 && (
                        <Typography variant="caption" color="text.secondary">
                          Proforma została częściowo wykorzystana jako zaliczka w innych fakturach
                        </Typography>
                      )}
                    </Box>
                  </>
                )}

                {/* Wyświetl powiązane faktury */}
                {relatedInvoices.length > 0 && (
                  <>
                    <Divider sx={{ my: 2 }} />
                    <Typography variant="subtitle2" gutterBottom>
                      Inne faktury dla tego zamówienia:
                    </Typography>
                    {loadingRelatedInvoices ? (
                      <CircularProgress size={20} />
                    ) : (
                      relatedInvoices.map((relInvoice) => (
                        <Box key={relInvoice.id} sx={{ mb: 1, p: 1, bgcolor: relInvoice.isProforma ? 'warning.light' : 'info.light', borderRadius: 1 }}>
                          <Typography variant="body2" fontWeight="bold">
                            {relInvoice.isProforma ? '📋 Proforma' : '📄 Faktura'} {relInvoice.number}
                          </Typography>
                          {relInvoice.isProforma && (
                            <Typography variant="body2" color="warning.dark" fontWeight="bold">
                              Kwota: {parseFloat(relInvoice.total || 0).toFixed(2)} {relInvoice.currency || 'EUR'}
                            </Typography>
                          )}
                          {relInvoice.issueDate && (
                            <Typography variant="caption" color="text.secondary">
                              Data: {new Date(relInvoice.issueDate).toLocaleDateString()}
                            </Typography>
                          )}
                        </Box>
                      ))
                    )}
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
                
                // Sprawdź czy stawka VAT to liczba czy string "ZW" lub "NP"
                let vatRate = 0;
                if (typeof item.vat === 'number') {
                  vatRate = item.vat;
                } else if (item.vat !== "ZW" && item.vat !== "NP") {
                  vatRate = parseFloat(item.vat) || 0;
                }
                // Dla "ZW" i "NP" vatRate pozostaje 0
                
                const netValue = quantity * price;
                const vatValue = netValue * (vatRate / 100);
                const grossValue = netValue + vatValue;
                
                return (
                  <TableRow key={index}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.description || '-'}</TableCell>
                    <TableCell align="right">{quantity}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell align="right">{price.toFixed(2)} {invoice.currency}</TableCell>
                    <TableCell align="right">{vatRate}%</TableCell>
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
                  
                  // Sprawdź czy stawka VAT to liczba czy string "ZW" lub "NP"
                  let vatRate = 0;
                  if (typeof item.vat === 'number') {
                    vatRate = item.vat;
                  } else if (item.vat !== "ZW" && item.vat !== "NP") {
                    vatRate = parseFloat(item.vat) || 0;
                  }
                  // Dla "ZW" i "NP" vatRate pozostaje 0
                  
                  return sum + (quantity * price * (vatRate / 100));
                }, 0).toFixed(2)} {invoice.currency}
              </Typography>
            </Grid>
            
            {/* Wyświetl rozliczone zaliczki/przedpłaty, jeśli istnieją */}
            {invoice.settledAdvancePayments > 0 && (
              <>
                <Grid item xs={6}>
                  <Typography variant="body1" fontWeight="bold" align="right">
                    Rozliczone zaliczki/przedpłaty:
                  </Typography>
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="body1" fontWeight="bold" align="right" color="secondary">
                    -{parseFloat(invoice.settledAdvancePayments).toFixed(2)} {invoice.currency}
                  </Typography>
                </Grid>
              </>
            )}
            
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
        {invoice.linkedPurchaseOrders && invoice.linkedPurchaseOrders.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h6" gutterBottom>
              Zaliczki/Przedpłaty
            </Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Numer zaliczki</TableCell>
                    <TableCell>Wpłacający</TableCell>
                    <TableCell align="right">Wartość netto</TableCell>
                    <TableCell align="right">Dodatkowe opłaty</TableCell>
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
                    
                    const vatRate = parseFloat(po.vatRate) || 0;
                    const vatValue = (productsValue * vatRate) / 100;
                    
                    let totalGross = 0;
                    if (po.finalGrossValue !== undefined) {
                      totalGross = parseFloat(po.finalGrossValue);
                    } else if (po.totalGross !== undefined) {
                      totalGross = parseFloat(po.totalGross);
                    } else {
                      totalGross = productsValue + vatValue + additionalCostsValue;
                    }
                    
                    // Formatowanie wyświetlania stawki VAT
                    let vatDisplay;
                    if (typeof po.vatRate === 'string') {
                      vatDisplay = po.vatRate;
                    } else if (po.vatRate === 'ZW' || po.vatRate === 'NP') {
                      vatDisplay = po.vatRate;
                    } else {
                      vatDisplay = `${vatRate}%`;
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
                        <TableCell>{po.supplier?.name || 'Nieznany wpłacający'}</TableCell>
                        <TableCell align="right">{productsValue.toFixed(2)} {po.currency || invoice.currency}</TableCell>
                        <TableCell align="right">{additionalCostsValue.toFixed(2)} {po.currency || invoice.currency}</TableCell>
                        <TableCell align="right">{vatDisplay === "ZW" || vatDisplay === "NP" ? vatDisplay : `${vatValue.toFixed(2)} ${po.currency || invoice.currency}`}</TableCell>
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
                Razem zaliczki/przedpłaty: {invoice.linkedPurchaseOrders.reduce((sum, po) => {
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
                    
                    const vatRate = parseFloat(po.vatRate) || 0;
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
                {(parseFloat(invoice.total) - parseFloat(invoice.settledAdvancePayments || 0)).toFixed(2)} {invoice.currency}
              </Typography>
            </Grid>
          </Grid>
          </Box>
        </Box>
      </Paper>
      
      {/* Sekcja płatności */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <PaymentsSection 
          invoice={invoice} 
          onPaymentChange={fetchInvoice}
        />
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