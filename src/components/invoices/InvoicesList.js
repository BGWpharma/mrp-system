import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  Paper,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  Chip,
  CircularProgress,
  TextField,
  InputAdornment,
  Grid,
  Collapse,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  TablePagination
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  ExpandMore as ExpandMoreIcon,
  FilterList as FilterListIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  Send as SendIcon,
  Receipt as ReceiptIcon,
  People as CustomersIcon,
  Settings as SettingsIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { 
  getAllInvoices, 
  updateInvoiceStatus, 
  deleteInvoice,
  getAvailableProformaAmount
} from '../../services/invoiceService';
import { getAllCustomers } from '../../services/customerService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatCurrency } from '../../utils/formatters';
import DeleteConfirmationDialog from '../common/DeleteConfirmationDialog';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import plLocale from 'date-fns/locale/pl';
import { format } from 'date-fns';

const InvoicesList = () => {
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [proformaAmounts, setProformaAmounts] = useState({});

  // Filtry
  const [filters, setFilters] = useState({
    status: '',
    customerId: '',
    fromDate: null,
    toDate: null
  });

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();

  useEffect(() => {
    fetchInvoices();
    fetchCustomers();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Nasłuchuj powrotu do karty/okna aby odświeżyć dane
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Odśwież dostępne kwoty proform gdy użytkownik powróci do karty
        if (invoices.length > 0) {
          fetchProformaAmounts(invoices);
        }
      }
    };

    const handleFocus = () => {
      // Odśwież dostępne kwoty proform gdy okno otrzyma focus
      if (invoices.length > 0) {
        fetchProformaAmounts(invoices);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [invoices]);

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const fetchedInvoices = await getAllInvoices();
      setInvoices(fetchedInvoices);
      setFilteredInvoices(fetchedInvoices);
      
      // Pobierz dostępne kwoty dla proform
      await fetchProformaAmounts(fetchedInvoices);
    } catch (error) {
      showError('Błąd podczas pobierania listy faktur: ' + error.message);
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProformaAmounts = async (invoices) => {
    const amounts = {};
    const proformaInvoices = invoices.filter(inv => inv.isProforma);
    
    await Promise.all(
      proformaInvoices.map(async (invoice) => {
        try {
          const amountInfo = await getAvailableProformaAmount(invoice.id);
          amounts[invoice.id] = amountInfo;
        } catch (error) {
          console.error(`Błąd podczas pobierania kwoty proformy ${invoice.id}:`, error);
          amounts[invoice.id] = null;
        }
      })
    );
    
    setProformaAmounts(amounts);
  };

  const fetchCustomers = async () => {
    setCustomersLoading(true);
    try {
      const fetchedCustomers = await getAllCustomers();
      setCustomers(fetchedCustomers);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setCustomersLoading(false);
    }
  };

  const handleSearch = () => {
    if (!searchTerm.trim()) {
      setFilteredInvoices(invoices);
      return;
    }

    const searchTermLower = searchTerm.toLowerCase();
    const results = invoices.filter(invoice => 
      (invoice.number && invoice.number.toLowerCase().includes(searchTermLower)) ||
      (invoice.customer?.name && invoice.customer.name.toLowerCase().includes(searchTermLower))
    );
    
    setFilteredInvoices(results);
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    if (!e.target.value.trim()) {
      setFilteredInvoices(invoices);
    }
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setSearchTerm('');
    setFilteredInvoices(invoices);
  };

  const handleAddInvoice = () => {
    navigate('/invoices/new');
  };

  const handleViewInvoice = (invoiceId) => {
    navigate(`/invoices/${invoiceId}`);
  };

  const handleEditInvoice = (invoiceId) => {
    navigate(`/invoices/${invoiceId}/edit`);
  };

  const handleDeleteClick = (invoice) => {
    setInvoiceToDelete(invoice);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!invoiceToDelete) return;
    
    try {
      await deleteInvoice(invoiceToDelete.id);
      setInvoices(invoices.filter(i => i.id !== invoiceToDelete.id));
      setFilteredInvoices(filteredInvoices.filter(i => i.id !== invoiceToDelete.id));
      showSuccess('Faktura została usunięta');
    } catch (error) {
      showError('Błąd podczas usuwania faktury: ' + error.message);
    } finally {
      setDeleteDialogOpen(false);
      setInvoiceToDelete(null);
    }
  };

  const handleUpdateStatus = async (invoiceId, newStatus) => {
    try {
      await updateInvoiceStatus(invoiceId, newStatus, currentUser.uid);
      // Odśwież listę po aktualizacji
      fetchInvoices();
      showSuccess('Status faktury został zaktualizowany');
    } catch (error) {
      showError('Błąd podczas aktualizacji statusu faktury: ' + error.message);
    }
  };

  const handleRefreshList = async () => {
    await fetchInvoices();
    showSuccess('Lista została odświeżona');
  };

  const handleRefreshProformaAmounts = async () => {
    if (invoices.length > 0) {
      await fetchProformaAmounts(invoices);
      showSuccess('Kwoty proform zostały odświeżone');
    }
  };

  const toggleFilters = () => {
    setFiltersExpanded(!filtersExpanded);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters({
      ...filters,
      [name]: value
    });
  };

  const handleDateChange = (name, date) => {
    setFilters({
      ...filters,
      [name]: date
    });
  };

  const applyFilters = async () => {
    setLoading(true);
    try {
      const fetchedInvoices = await getAllInvoices(filters);
      setFilteredInvoices(fetchedInvoices);
    } catch (error) {
      showError('Błąd podczas filtrowania faktur: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setFilters({
      status: '',
      customerId: '',
      fromDate: null,
      toDate: null
    });
    setFilteredInvoices(invoices);
  };

  const formatDate = (date) => {
    if (!date) return '';
    return format(new Date(date), 'dd.MM.yyyy');
  };

  const handleViewCustomer = (customerId) => {
    navigate(`/customers/${customerId}`);
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

  const renderPaymentStatus = (paymentStatus) => {
    const statusConfig = {
      'unpaid': { color: 'error', label: 'Nieopłacona' },
      'partially_paid': { color: 'warning', label: 'Częściowo opłacona' },
      'paid': { color: 'success', label: 'Opłacona' }
    };

    const status = paymentStatus || 'unpaid';
    const config = statusConfig[status] || { color: 'default', label: status };
    
    return (
      <Chip 
        label={config.label} 
        color={config.color}
        size="small"
        variant="outlined"
      />
    );
  };

  return (
    <Box sx={{ p: { xs: 0.5, sm: 0.5, md: 1 }, maxWidth: 'none', width: '100%' }}>
      {/* Pasek wyszukiwania z przyciskami zarządzania */}
      <Paper sx={{ mb: 2, p: { xs: 1.5, sm: 2 } }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={7}>
            <Grid container spacing={1} alignItems="center">
              <Grid item xs={12} sm={8}>
                <TextField
                  fullWidth
                  variant="outlined"
                  placeholder="Szukaj faktur..."
                  value={searchTerm}
                  onChange={handleSearchChange}
                  onKeyPress={handleSearchKeyPress}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                    endAdornment: searchTerm && (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={clearSearch}>
                          <ClearIcon />
                        </IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Button variant="outlined" onClick={handleSearch}>
                    Szukaj
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<FilterListIcon />}
                    onClick={toggleFilters}
                  >
                    Filtry
                  </Button>
                </Box>
              </Grid>
            </Grid>
          </Grid>
          <Grid item xs={12} md={5}>
            <Grid container spacing={{ xs: 0.5, sm: 1 }} justifyContent="flex-end">
              <Grid item>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={handleRefreshList}
                  disabled={loading}
                >
                  Odśwież
                </Button>
              </Grid>
              <Grid item>
                <Button
                  variant="outlined"
                  color="warning"
                  onClick={handleRefreshProformaAmounts}
                  disabled={loading}
                  title="Odśwież dostępne kwoty proform"
                >
                  📋
                </Button>
              </Grid>
              <Grid item>
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<CustomersIcon />}
                  onClick={() => navigate('/customers')}
                >
                  Klienci
                </Button>
              </Grid>
              <Grid item>
                <Button
                  variant="outlined"
                  color="primary"
                  startIcon={<SettingsIcon />}
                  onClick={() => navigate('/invoices/company-settings')}
                >
                  Dane firmy
                </Button>
              </Grid>
              <Grid item>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<AddIcon />}
                  onClick={handleAddInvoice}
                >
                  Nowa faktura
                </Button>
              </Grid>
            </Grid>
          </Grid>
        </Grid>

        {/* Rozwijane filtry zaawansowane */}
        <Collapse in={filtersExpanded}>
          <Divider sx={{ my: 2 }} />
          <Card variant="outlined" sx={{ mt: 2 }}>
            <CardContent>
              <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Status</InputLabel>
                    <Select
                      name="status"
                      value={filters.status}
                      onChange={handleFilterChange}
                      label="Status"
                    >
                      <MenuItem value="">Wszystkie statusy</MenuItem>
                      <MenuItem value="draft">Szkice</MenuItem>
                      <MenuItem value="issued">Wystawione</MenuItem>
                      <MenuItem value="sent">Wysłane</MenuItem>
                      <MenuItem value="paid">Opłacone</MenuItem>
                      <MenuItem value="partially_paid">Częściowo opłacone</MenuItem>
                      <MenuItem value="overdue">Przeterminowane</MenuItem>
                      <MenuItem value="cancelled">Anulowane</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Klient</InputLabel>
                    <Select
                      name="customerId"
                      value={filters.customerId}
                      onChange={handleFilterChange}
                      label="Klient"
                      disabled={customersLoading}
                    >
                      <MenuItem value="">Wszyscy klienci</MenuItem>
                      {customers.map(customer => (
                        <MenuItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
                    <DatePicker
                      label="Od daty"
                      value={filters.fromDate}
                      onChange={(date) => handleDateChange('fromDate', date)}
                      slotProps={{ 
                        textField: { 
                          fullWidth: true, 
                          size: "small" 
                        } 
                      }}
                    />
                  </LocalizationProvider>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
                    <DatePicker
                      label="Do daty"
                      value={filters.toDate}
                      onChange={(date) => handleDateChange('toDate', date)}
                      slotProps={{ 
                        textField: { 
                          fullWidth: true, 
                          size: "small" 
                        } 
                      }}
                    />
                  </LocalizationProvider>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                      variant="contained" 
                      onClick={applyFilters}
                      fullWidth
                    >
                      Zastosuj filtry
                    </Button>
                    <Button 
                      variant="outlined" 
                      onClick={resetFilters}
                      color="inherit"
                    >
                      Resetuj
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Collapse>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, mb: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Paper sx={{ width: '100%', overflow: 'hidden' }}>
            <TableContainer sx={{ overflowX: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ minWidth: 120, width: '14%' }}>Numer faktury</TableCell>
                    <TableCell sx={{ minWidth: 150, width: '18%' }}>Klient</TableCell>
                    <TableCell sx={{ minWidth: 100, width: '12%' }}>Data wystawienia</TableCell>
                    <TableCell sx={{ minWidth: 100, width: '12%' }}>Termin płatności</TableCell>
                    <TableCell sx={{ minWidth: 90, width: '10%' }}>Kwota</TableCell>
                    <TableCell sx={{ minWidth: 90, width: '10%' }}>Do zapłaty/Dostępne</TableCell>
                    <TableCell sx={{ minWidth: 100, width: '10%' }}>Status faktury</TableCell>
                    <TableCell sx={{ minWidth: 100, width: '10%' }}>Status płatności</TableCell>
                    <TableCell align="right" sx={{ minWidth: 100, width: '14%' }}>Akcje</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} align="center">
                        Brak faktur do wyświetlenia
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInvoices
                      .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                      .map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell>
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
                              <Typography variant="body2" sx={{ lineHeight: 1.2 }}>
                                {invoice.number}
                              </Typography>
                              {invoice.isProforma && (
                                <Chip 
                                  label="Proforma" 
                                  size="small" 
                                  color="primary" 
                                  variant="outlined"
                                  sx={{ height: 'auto', fontSize: '0.7rem', py: 0.25 }}
                                />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="small"
                              sx={{ textTransform: 'none' }}
                              onClick={() => handleViewCustomer(invoice.customer.id)}
                            >
                              {invoice.customer.name}
                            </Button>
                          </TableCell>
                          <TableCell>{formatDate(invoice.issueDate)}</TableCell>
                          <TableCell>{formatDate(invoice.dueDate)}</TableCell>
                          <TableCell>{formatCurrency(invoice.total, invoice.currency)}</TableCell>
                          <TableCell>
                            {invoice.isProforma ? (
                              // Dla proform wyświetl dostępną kwotę
                              <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                <Typography variant="body2" color="success.main" fontWeight="bold">
                                  {proformaAmounts[invoice.id] 
                                    ? formatCurrency(proformaAmounts[invoice.id].available, invoice.currency)
                                    : formatCurrency(invoice.total, invoice.currency)
                                  }
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  dostępne z {formatCurrency(invoice.total, invoice.currency)}
                                </Typography>
                              </Box>
                            ) : (
                              // Dla zwykłych faktur wyświetl kwotę do zapłaty
                              (() => {
                                const total = parseFloat(invoice.total || 0);
                                const paid = parseFloat(invoice.totalPaid || 0);
                                
                                // Oblicz przedpłaty z proform
                                let advancePayments = 0;
                                if (invoice.proformAllocation && invoice.proformAllocation.length > 0) {
                                  advancePayments = invoice.proformAllocation.reduce((sum, allocation) => sum + (allocation.amount || 0), 0);
                                } else {
                                  advancePayments = parseFloat(invoice.settledAdvancePayments || 0);
                                }
                                
                                const remaining = Math.max(0, total - paid - advancePayments);
                                return formatCurrency(remaining, invoice.currency);
                              })()
                            )}
                          </TableCell>
                          <TableCell>{renderInvoiceStatus(invoice.status)}</TableCell>
                          <TableCell>
                            {(() => {
                              // Oblicz status płatności uwzględniając przedpłaty z proform
                              const totalPaid = parseFloat(invoice.totalPaid || 0);
                              
                              // Oblicz przedpłaty z proform
                              let advancePayments = 0;
                              if (invoice.proformAllocation && invoice.proformAllocation.length > 0) {
                                advancePayments = invoice.proformAllocation.reduce((sum, allocation) => sum + (allocation.amount || 0), 0);
                              } else {
                                advancePayments = parseFloat(invoice.settledAdvancePayments || 0);
                              }
                              
                              const invoiceTotal = parseFloat(invoice.total || 0);
                              const totalSettled = totalPaid + advancePayments;
                              
                              let calculatedStatus;
                              if (totalSettled >= invoiceTotal) {
                                calculatedStatus = 'paid';
                              } else if (totalSettled > 0) {
                                calculatedStatus = 'partially_paid';
                              } else {
                                calculatedStatus = 'unpaid';
                              }
                              
                              return renderPaymentStatus(calculatedStatus);
                            })()}
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ 
                              display: 'flex', 
                              flexWrap: 'wrap',
                              gap: 0.25,
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              minWidth: 100
                            }}>
                              <IconButton 
                                size="small" 
                                onClick={() => handleViewInvoice(invoice.id)}
                                title="Podgląd faktury"
                              >
                                <ViewIcon fontSize="small" />
                              </IconButton>
                              <IconButton 
                                size="small" 
                                onClick={() => handleEditInvoice(invoice.id)}
                                title="Edytuj fakturę"
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton 
                                size="small" 
                                onClick={() => handleDeleteClick(invoice)}
                                title="Usuń fakturę"
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                              {invoice.status === 'draft' && (
                                <IconButton 
                                  size="small" 
                                  onClick={() => handleUpdateStatus(invoice.id, 'issued')}
                                  title="Oznacz jako wystawioną"
                                  color="primary"
                                >
                                  <ReceiptIcon fontSize="small" />
                                </IconButton>
                              )}
                              {invoice.status === 'issued' && (
                                <IconButton 
                                  size="small" 
                                  onClick={() => handleUpdateStatus(invoice.id, 'sent')}
                                  title="Oznacz jako wysłaną"
                                  color="info"
                                >
                                  <SendIcon fontSize="small" />
                                </IconButton>
                              )}
                            </Box>
                          </TableCell>
                        </TableRow>
                      ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[10, 25, 50, 100]}
              component="div"
              count={filteredInvoices.length}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={(event, newPage) => setPage(newPage)}
              onRowsPerPageChange={(event) => {
                setRowsPerPage(parseInt(event.target.value, 10));
                setPage(0);
              }}
              labelRowsPerPage="Wierszy na stronę:"
              labelDisplayedRows={({ from, to, count }) => 
                `${from}-${to} z ${count !== -1 ? count : `więcej niż ${to}`}`
              }
            />
          </Paper>
        </>
      )}

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title="Usunąć fakturę?"
        content={`Czy na pewno chcesz usunąć fakturę ${invoiceToDelete?.number}? Tej operacji nie można cofnąć.`}
      />
    </Box>
  );
};

export default InvoicesList; 