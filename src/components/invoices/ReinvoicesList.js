// src/components/invoices/ReinvoicesList.js
import React, { useState, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
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
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TablePagination,
  TableSortLabel,
  Link
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  FilterList as FilterListIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { 
  getAllInvoices, 
  deleteInvoice,
  calculateRequiredAdvancePayment
} from '../../services/invoiceService';
import { preciseCompare } from '../../utils/mathUtils';
import { getAllCustomers } from '../../services/customerService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCurrency } from '../../utils/formatters';
import DeleteConfirmationDialog from '../common/DeleteConfirmationDialog';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import plLocale from 'date-fns/locale/pl';
import { format } from 'date-fns';

const ReinvoicesList = () => {
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);

  // Filtry
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    status: '',
    customerId: '',
    fromDate: null,
    toDate: null
  });
  const [showFilters, setShowFilters] = useState(false);

  // Sortowanie i paginacja
  const [orderBy, setOrderBy] = useState('issueDate');
  const [order, setOrder] = useState('desc');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('invoices');
  const navigate = useNavigate();

  useEffect(() => {
    fetchInvoices();
    fetchCustomers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    applyFiltersAndSearch();
  }, [invoices, searchTerm, filters]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchInvoices = async () => {
    try {
      setLoading(true);
      const allInvoices = await getAllInvoices();
      
      // Filtruj tylko Reinvoice
      const reinvoices = allInvoices.filter(invoice => invoice.isRefInvoice === true);
      
      setInvoices(reinvoices);
    } catch (error) {
      console.error('Error fetching reinvoices:', error);
      showError(t('errors.fetchFailed'));
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      setCustomersLoading(true);
      const customersData = await getAllCustomers();
      setCustomers(customersData);
    } catch (error) {
      console.error('Error fetching customers:', error);
    } finally {
      setCustomersLoading(false);
    }
  };

  const applyFiltersAndSearch = () => {
    let results = [...invoices];

    // Wyszukiwanie
    if (searchTerm.trim()) {
      const searchTermLower = searchTerm.toLowerCase();
      results = results.filter(invoice => 
        (invoice.number && invoice.number.toLowerCase().includes(searchTermLower)) ||
        (invoice.customer?.name && invoice.customer.name.toLowerCase().includes(searchTermLower))
      );
    }

    // Filtr statusu płatności
    if (filters.status) {
      const filterStatus = filters.status;
      const paymentStatuses = ['paid', 'unpaid', 'partially_paid', 'overdue'];
      
      if (paymentStatuses.includes(filterStatus)) {
        results = results.filter(invoice => {
          const totalPaid = parseFloat(invoice.totalPaid || 0);
          let advancePayments = 0;
          
          if (invoice.proformAllocation && invoice.proformAllocation.length > 0) {
            advancePayments = invoice.proformAllocation.reduce((sum, allocation) => sum + (allocation.amount || 0), 0);
          } else {
            advancePayments = parseFloat(invoice.settledAdvancePayments || 0);
          }
          
          const invoiceTotal = parseFloat(invoice.total || 0);
          const totalSettled = totalPaid + advancePayments;
          
          let calculatedStatus;
          const requiredAdvancePercentage = invoice.requiredAdvancePaymentPercentage || 0;
          
          if (requiredAdvancePercentage > 0) {
            const requiredAdvanceAmount = calculateRequiredAdvancePayment(invoiceTotal, requiredAdvancePercentage);
            if (preciseCompare(totalSettled, requiredAdvanceAmount, 0.01) >= 0) {
              calculatedStatus = 'paid';
            } else if (totalSettled > 0) {
              calculatedStatus = 'partially_paid';
            } else {
              calculatedStatus = 'unpaid';
            }
          } else {
            if (preciseCompare(totalSettled, invoiceTotal, 0.01) >= 0) {
              calculatedStatus = 'paid';
            } else if (totalSettled > 0) {
              calculatedStatus = 'partially_paid';
            } else {
              calculatedStatus = 'unpaid';
            }
          }
          
          if (filterStatus === 'overdue') {
            if (calculatedStatus !== 'paid' && invoice.dueDate) {
              const dueDate = new Date(invoice.dueDate);
              const now = new Date();
              return now > dueDate;
            }
            return false;
          }
          
          return calculatedStatus === filterStatus;
        });
      } else {
        // Filtr statusu faktury (draft, issued, cancelled)
        results = results.filter(invoice => invoice.status === filterStatus);
      }
    }

    // Filtr klienta
    if (filters.customerId) {
      results = results.filter(invoice => invoice.customer?.id === filters.customerId);
    }

    // Filtr dat
    if (filters.fromDate) {
      results = results.filter(invoice => {
        const invoiceDate = new Date(invoice.issueDate);
        return invoiceDate >= filters.fromDate;
      });
    }

    if (filters.toDate) {
      results = results.filter(invoice => {
        const invoiceDate = new Date(invoice.issueDate);
        return invoiceDate <= filters.toDate;
      });
    }

    // Sortowanie
    results.sort((a, b) => {
      let aValue, bValue;
      
      // Specjalne sortowanie dla numerów faktur
      // Format: PREFIX/numer/MM/RRRR (np. FS/1/01/2025, FPF/10/02/2025)
      if (orderBy === 'number') {
        const parseInvoiceNumber = (num) => {
          if (!num) return { year: 0, month: 0, seq: 0 };
          const parts = num.toString().split('/');
          // Format: PREFIX/seq/MM/YYYY
          if (parts.length >= 4) {
            return {
              year: parseInt(parts[3], 10) || 0,
              month: parseInt(parts[2], 10) || 0,
              seq: parseInt(parts[1], 10) || 0
            };
          }
          // Format: PREFIX/seq/MM (bez roku) lub inne
          if (parts.length >= 3) {
            return {
              year: 0,
              month: parseInt(parts[2], 10) || 0,
              seq: parseInt(parts[1], 10) || 0
            };
          }
          // Fallback - wyciągnij pierwszą liczbę
          const match = num.match(/(\d+)/);
          return { year: 0, month: 0, seq: match ? parseInt(match[1], 10) : 0 };
        };
        
        const aParsed = parseInvoiceNumber(a.number);
        const bParsed = parseInvoiceNumber(b.number);
        
        // Sortuj: rok -> miesiąc -> numer kolejny
        if (aParsed.year !== bParsed.year) {
          return order === 'asc' 
            ? aParsed.year - bParsed.year 
            : bParsed.year - aParsed.year;
        }
        if (aParsed.month !== bParsed.month) {
          return order === 'asc' 
            ? aParsed.month - bParsed.month 
            : bParsed.month - aParsed.month;
        }
        return order === 'asc' 
          ? aParsed.seq - bParsed.seq 
          : bParsed.seq - aParsed.seq;
      }
      
      switch (orderBy) {
        case 'customer':
          aValue = a.customer?.name || '';
          bValue = b.customer?.name || '';
          break;
        case 'issueDate':
          aValue = a.issueDate ? new Date(a.issueDate).getTime() : 0;
          bValue = b.issueDate ? new Date(b.issueDate).getTime() : 0;
          break;
        case 'dueDate':
          aValue = a.dueDate ? new Date(a.dueDate).getTime() : 0;
          bValue = b.dueDate ? new Date(b.dueDate).getTime() : 0;
          break;
        case 'total':
          aValue = parseFloat(a.total || 0);
          bValue = parseFloat(b.total || 0);
          break;
        default:
          return 0;
      }
      
      if (order === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    setFilteredInvoices(results);
    setPage(0);
  };

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };

  const handleResetFilters = () => {
    setFilters({
      status: '',
      customerId: '',
      fromDate: null,
      toDate: null
    });
    setSearchTerm('');
  };

  const handleDeleteInvoice = async () => {
    try {
      await deleteInvoice(invoiceToDelete.id);
      showSuccess(t('success.deleted'));
      setDeleteDialogOpen(false);
      setInvoiceToDelete(null);
      fetchInvoices();
    } catch (error) {
      console.error('Error deleting invoice:', error);
      showError(t('errors.deleteFailed'));
    }
  };

  const getPaymentStatus = (invoice) => {
    const totalPaid = parseFloat(invoice.totalPaid || 0);
    let advancePayments = 0;
    
    if (invoice.proformAllocation && invoice.proformAllocation.length > 0) {
      advancePayments = invoice.proformAllocation.reduce((sum, allocation) => sum + (allocation.amount || 0), 0);
    } else {
      advancePayments = parseFloat(invoice.settledAdvancePayments || 0);
    }
    
    const invoiceTotal = parseFloat(invoice.total || 0);
    const totalSettled = totalPaid + advancePayments;
    
    const requiredAdvancePercentage = invoice.requiredAdvancePaymentPercentage || 0;
    
    if (requiredAdvancePercentage > 0) {
      const requiredAdvanceAmount = calculateRequiredAdvancePayment(invoiceTotal, requiredAdvancePercentage);
      if (preciseCompare(totalSettled, requiredAdvanceAmount, 0.01) >= 0) {
        return 'paid';
      } else if (totalSettled > 0) {
        return 'partially_paid';
      } else {
        return 'unpaid';
      }
    } else {
      if (preciseCompare(totalSettled, invoiceTotal, 0.01) >= 0) {
        return 'paid';
      } else if (totalSettled > 0) {
        return 'partially_paid';
      } else {
        return 'unpaid';
      }
    }
  };

  const getStatusChip = (invoice) => {
    const paymentStatus = getPaymentStatus(invoice);
    
    // Sprawdź czy przeterminowana
    if (paymentStatus !== 'paid' && invoice.dueDate) {
      const dueDate = new Date(invoice.dueDate);
      const now = new Date();
      if (now > dueDate) {
        return <Chip label={t('status.overdue')} color="error" size="small" />;
      }
    }
    
    switch (paymentStatus) {
      case 'paid':
        return <Chip label={t('status.paid')} color="success" size="small" />;
      case 'partially_paid':
        return <Chip label={t('status.partiallyPaid')} color="warning" size="small" />;
      case 'unpaid':
        return <Chip label={t('status.unpaid')} color="default" size="small" />;
      default:
        return null;
    }
  };

  const paginatedInvoices = filteredInvoices.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Nagłówek z akcjami */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => navigate('/invoices/new')}
          >
            {t('newInvoice')}
          </Button>
          <IconButton onClick={fetchInvoices} color="primary">
            <RefreshIcon />
          </IconButton>
        </Box>
        
        <Button
          variant="outlined"
          startIcon={<FilterListIcon />}
          onClick={() => setShowFilters(!showFilters)}
        >
          {showFilters ? 'Ukryj filtry' : 'Pokaż filtry'}
        </Button>
      </Box>

      {/* Wyszukiwanie */}
      <Box sx={{ mb: 2 }}>
        <TextField
          fullWidth
          placeholder={t('searchInvoices')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: searchTerm && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchTerm('')}>
                  <ClearIcon />
                </IconButton>
              </InputAdornment>
            )
          }}
        />
      </Box>

      {/* Filtry */}
      {showFilters && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Grid container spacing={2}>
              {/* Status */}
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('filters.status')}</InputLabel>
                  <Select
                    value={filters.status}
                    onChange={(e) => handleFilterChange('status', e.target.value)}
                    label={t('filters.status')}
                  >
                    <MenuItem value="">{t('filters.allStatuses')}</MenuItem>
                    <MenuItem value="draft">{t('status.draft')}</MenuItem>
                    <MenuItem value="issued">{t('status.issued')}</MenuItem>
                    <MenuItem value="paid">{t('status.paid')}</MenuItem>
                    <MenuItem value="partially_paid">{t('status.partiallyPaid')}</MenuItem>
                    <MenuItem value="unpaid">{t('status.unpaid')}</MenuItem>
                    <MenuItem value="overdue">{t('status.overdue')}</MenuItem>
                    <MenuItem value="cancelled">{t('status.cancelled')}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>

              {/* Klient */}
              <Grid item xs={12} sm={6} md={3}>
                <FormControl fullWidth size="small">
                  <InputLabel>{t('filters.client')}</InputLabel>
                  <Select
                    value={filters.customerId}
                    onChange={(e) => handleFilterChange('customerId', e.target.value)}
                    label={t('filters.client')}
                    disabled={customersLoading}
                  >
                    <MenuItem value="">{t('filters.allClients')}</MenuItem>
                    {customers.map((customer) => (
                      <MenuItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>

              {/* Od daty */}
              <Grid item xs={12} sm={6} md={3}>
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
                  <DatePicker
                    label={t('filters.fromDate')}
                    value={filters.fromDate}
                    onChange={(newValue) => handleFilterChange('fromDate', newValue)}
                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                  />
                </LocalizationProvider>
              </Grid>

              {/* Do daty */}
              <Grid item xs={12} sm={6} md={3}>
                <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
                  <DatePicker
                    label={t('filters.toDate')}
                    value={filters.toDate}
                    onChange={(newValue) => handleFilterChange('toDate', newValue)}
                    slotProps={{ textField: { size: 'small', fullWidth: true } }}
                  />
                </LocalizationProvider>
              </Grid>

              {/* Reset */}
              <Grid item xs={12}>
                <Button variant="outlined" onClick={handleResetFilters}>
                  {t('filters.resetFilters')}
                </Button>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}

      {/* Tabela */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'number'}
                  direction={orderBy === 'number' ? order : 'asc'}
                  onClick={() => handleRequestSort('number')}
                >
                  {t('table.invoiceNumber')}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'customer'}
                  direction={orderBy === 'customer' ? order : 'asc'}
                  onClick={() => handleRequestSort('customer')}
                >
                  {t('table.client')}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'issueDate'}
                  direction={orderBy === 'issueDate' ? order : 'asc'}
                  onClick={() => handleRequestSort('issueDate')}
                >
                  {t('table.issueDate')}
                </TableSortLabel>
              </TableCell>
              <TableCell>
                <TableSortLabel
                  active={orderBy === 'dueDate'}
                  direction={orderBy === 'dueDate' ? order : 'asc'}
                  onClick={() => handleRequestSort('dueDate')}
                >
                  {t('table.dueDate')}
                </TableSortLabel>
              </TableCell>
              <TableCell align="right">
                <TableSortLabel
                  active={orderBy === 'total'}
                  direction={orderBy === 'total' ? order : 'asc'}
                  onClick={() => handleRequestSort('total')}
                >
                  {t('table.amountAndToPay')}
                </TableSortLabel>
              </TableCell>
              <TableCell>{t('table.status')}</TableCell>
              <TableCell align="center">{t('table.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedInvoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <Typography variant="body2" color="text.secondary">
                    {t('noInvoicesFound')}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              paginatedInvoices.map((invoice) => (
                <TableRow key={invoice.id} hover>
                  <TableCell>
                    <Link
                      component={RouterLink}
                      to={`/invoices/${invoice.id}`}
                      sx={{ textDecoration: 'none', fontWeight: 'medium' }}
                    >
                      {invoice.number}
                    </Link>
                    <Chip label="Reinvoice" size="small" color="secondary" variant="outlined" sx={{ ml: 1 }} />
                  </TableCell>
                  <TableCell>{invoice.customer?.name || '-'}</TableCell>
                  <TableCell>
                    {invoice.issueDate ? format(new Date(invoice.issueDate), 'dd.MM.yyyy') : '-'}
                  </TableCell>
                  <TableCell>
                    {invoice.dueDate ? format(new Date(invoice.dueDate), 'dd.MM.yyyy') : '-'}
                  </TableCell>
                  <TableCell align="right">
                    <Box>
                      <Typography variant="body2" fontWeight="medium">
                        {formatCurrency(invoice.total)}
                      </Typography>
                      {(() => {
                        const totalPaid = parseFloat(invoice.totalPaid || 0);
                        const advancePayments = invoice.proformAllocation?.reduce((sum, a) => sum + (a.amount || 0), 0) || parseFloat(invoice.settledAdvancePayments || 0);
                        const totalSettled = totalPaid + advancePayments;
                        const remaining = parseFloat(invoice.total || 0) - totalSettled;
                        
                        if (remaining > 0.01) {
                          return (
                            <Typography variant="caption" color="error">
                              Do zapł.: {formatCurrency(remaining)}
                            </Typography>
                          );
                        }
                        return null;
                      })()}
                    </Box>
                  </TableCell>
                  <TableCell>{getStatusChip(invoice)}</TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                      <IconButton
                        size="small"
                        component={RouterLink}
                        to={`/invoices/${invoice.id}`}
                        title="Podgląd"
                      >
                        <ViewIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        component={RouterLink}
                        to={`/invoices/${invoice.id}/edit`}
                        title="Edytuj"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton
                        size="small"
                        onClick={() => {
                          setInvoiceToDelete(invoice);
                          setDeleteDialogOpen(true);
                        }}
                        title="Usuń"
                        color="error"
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={filteredInvoices.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage="Wierszy na stronę:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} z ${count}`}
        />
      </TableContainer>

      {/* Dialog usuwania */}
      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onClose={() => {
          setDeleteDialogOpen(false);
          setInvoiceToDelete(null);
        }}
        onConfirm={handleDeleteInvoice}
        itemName={invoiceToDelete?.number || ''}
        itemType="fakturę"
      />
    </Box>
  );
};

export default ReinvoicesList;

