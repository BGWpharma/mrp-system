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
  Settings as SettingsIcon
} from '@mui/icons-material';
import { 
  getAllInvoices, 
  updateInvoiceStatus, 
  deleteInvoice 
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

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const fetchedInvoices = await getAllInvoices();
      setInvoices(fetchedInvoices);
      setFilteredInvoices(fetchedInvoices);
    } catch (error) {
      showError('Błąd podczas pobierania listy faktur: ' + error.message);
      console.error('Error fetching invoices:', error);
    } finally {
      setLoading(false);
    }
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
    <Box sx={{ p: { xs: 1, sm: 2 }, maxWidth: 'none', width: '100%' }}>
      {/* Pasek wyszukiwania z przyciskami zarządzania */}
      <Paper sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={4}>
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
          <Grid item>
            <Button variant="outlined" onClick={handleSearch}>
              Szukaj
            </Button>
          </Grid>
          <Grid item>
            <Button
              variant="outlined"
              startIcon={<FilterListIcon />}
              onClick={toggleFilters}
            >
              Filtry {filtersExpanded ? <ExpandMoreIcon style={{ transform: 'rotate(180deg)' }} /> : <ExpandMoreIcon />}
            </Button>
          </Grid>
          
          {/* Przyciski zarządzania po prawej stronie */}
          <Grid item xs={12} md="auto" sx={{ ml: 'auto' }}>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1 }}>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<CustomersIcon />}
                onClick={() => navigate('/customers')}
                size="small"
              >
                Zarządzaj klientami
              </Button>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<SettingsIcon />}
                onClick={() => navigate('/invoices/company-settings')}
                size="small"
              >
                Dane firmy
              </Button>
              <Button
                variant="contained"
                color="primary"
                startIcon={<AddIcon />}
                onClick={handleAddInvoice}
                size="small"
              >
                Nowa faktura
              </Button>
            </Box>
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
            <TableContainer sx={{ maxHeight: '70vh' }}>
              <Table sx={{ minWidth: 1000 }} stickyHeader>
                              <TableHead>
                <TableRow>
                  <TableCell sx={{ minWidth: 140 }}>Numer faktury</TableCell>
                  <TableCell sx={{ minWidth: 200 }}>Klient</TableCell>
                  <TableCell sx={{ minWidth: 130 }}>Data wystawienia</TableCell>
                  <TableCell sx={{ minWidth: 130 }}>Termin płatności</TableCell>
                  <TableCell sx={{ minWidth: 120 }}>Kwota</TableCell>
                  <TableCell sx={{ minWidth: 120 }}>Do zapłaty</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>Status faktury</TableCell>
                  <TableCell sx={{ minWidth: 140 }}>Status płatności</TableCell>
                  <TableCell align="right" sx={{ minWidth: 150 }}>Akcje</TableCell>
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
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {invoice.number}
                            {invoice.isProforma && (
                              <Chip 
                                label="Proforma" 
                                size="small" 
                                color="primary" 
                                variant="outlined"
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
                          {formatCurrency(
                            invoice.total - (invoice.totalPaid || 0), 
                            invoice.currency
                          )}
                        </TableCell>
                        <TableCell>{renderInvoiceStatus(invoice.status)}</TableCell>
                        <TableCell>{renderPaymentStatus(invoice.paymentStatus)}</TableCell>
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
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
                              disabled={invoice.status === 'paid'}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                            <IconButton 
                              size="small" 
                              onClick={() => handleDeleteClick(invoice)}
                              title="Usuń fakturę"
                              disabled={invoice.status !== 'draft'}
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