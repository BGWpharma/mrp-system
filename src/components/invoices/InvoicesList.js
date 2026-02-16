import React, { useState, useEffect, useRef } from 'react';
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
  Collapse,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  TablePagination,
  TableSortLabel,
  Link,
  Menu,
  Tooltip
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
  Refresh as RefreshIcon,
  MoreVert as MoreVertIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  CurrencyExchange as CurrencyExchangeIcon
} from '@mui/icons-material';
import { 
  getAllInvoices, 
  updateInvoiceStatus, 
  deleteInvoice,
  getAvailableProformaAmount,
  calculateRequiredAdvancePayment,
  getInvoiceById,
  updateInvoicesExchangeRates
} from '../../services/invoiceService';
import { preciseCompare, preciseSubtract } from '../../utils/mathUtils';
import { getAllCustomers, CUSTOMERS_CACHE_KEY } from '../../services/customerService';
import { getAllOrders } from '../../services/orderService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCurrency } from '../../utils/formatters';
import DeleteConfirmationDialog from '../common/DeleteConfirmationDialog';
import InvoiceCsvExport from './InvoiceCsvExport';
import InvoiceOptimaExport from './InvoiceOptimaExport';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import plLocale from 'date-fns/locale/pl';
import { format } from 'date-fns';
import { useServiceData } from '../../hooks/useServiceData';
import { useInvoiceListState } from '../../contexts/InvoiceListStateContext';
import InvoiceExpandedDetails from './InvoiceExpandedDetails';

const InvoicesList = () => {
  // Stan z kontekstu
  const { state: listState, actions: listActions } = useInvoiceListState();
  
  const [invoices, setInvoices] = useState([]);
  const [filteredInvoices, setFilteredInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState(null);
  const { data: customers, loading: customersLoading } = useServiceData(CUSTOMERS_CACHE_KEY, getAllCustomers, { ttl: 10 * 60 * 1000 });
  const [proformaAmounts, setProformaAmounts] = useState({});

  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);

  // Stany dla rozwijanych szczegółów
  const [expandedInvoiceId, setExpandedInvoiceId] = useState(null);
  const [invoiceDetails, setInvoiceDetails] = useState({});
  const [loadingDetails, setLoadingDetails] = useState({});

  // Stan dla menu dropdown akcji
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState(null);
  const isActionsMenuOpen = Boolean(actionsMenuAnchor);
  
  // Stan dla aktualizacji kursów walut
  const [updatingExchangeRates, setUpdatingExchangeRates] = useState(false);

  // Referencje do komponentów eksportu
  const csvExportRef = useRef(null);
  const optimaExportRef = useRef(null);

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation();
  const navigate = useNavigate();

  // Pobierz stan sortowania z kontekstu
  const tableSort = listState.tableSort;

  useEffect(() => {
    fetchInvoices();
    fetchOrders();
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // Automatycznie zastosuj zapisane wyszukiwanie i filtry po załadowaniu faktur
  useEffect(() => {
    if (invoices.length === 0) return;

    let results = [...invoices];

    // Zastosuj wyszukiwanie
    if (listState.searchTerm.trim()) {
      const searchTermLower = listState.searchTerm.toLowerCase();
      results = results.filter(invoice => 
        // Wyszukiwanie po numerze faktury
        (invoice.number && invoice.number.toLowerCase().includes(searchTermLower)) ||
        // Wyszukiwanie po nazwie klienta
        (invoice.customer?.name && invoice.customer.name.toLowerCase().includes(searchTermLower)) ||
        // Wyszukiwanie po numerze zamówienia
        (invoice.orderNumber && invoice.orderNumber.toLowerCase().includes(searchTermLower)) ||
        // Wyszukiwanie w pozycjach faktury (nazwa i opis)
        (invoice.items && Array.isArray(invoice.items) && invoice.items.some(item => 
          (item.name && item.name.toLowerCase().includes(searchTermLower)) ||
          (item.description && item.description.toLowerCase().includes(searchTermLower))
        ))
      );
    }

    // Zastosuj filtry
    if (listState.filters.status) {
      const filterStatus = listState.filters.status;
      
      // Statusy płatności wymagają dynamicznego obliczenia
      const paymentStatuses = ['paid', 'unpaid', 'partially_paid', 'overdue'];
      
      if (paymentStatuses.includes(filterStatus)) {
        // Filtruj po statusie płatności
        results = results.filter(invoice => {
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
          // Sprawdź czy jest wymagana przedpłata
          const requiredAdvancePercentage = invoice.requiredAdvancePaymentPercentage || 0;
          if (requiredAdvancePercentage > 0) {
            const requiredAdvanceAmount = calculateRequiredAdvancePayment(invoiceTotal, requiredAdvancePercentage);
            
            // Używamy tolerancji 0.01 dla porównań płatności
            if (preciseCompare(totalSettled, requiredAdvanceAmount, 0.01) >= 0) {
              calculatedStatus = 'paid';
            } else if (totalSettled > 0) {
              calculatedStatus = 'partially_paid';
            } else {
              calculatedStatus = 'unpaid';
            }
          } else {
            // Standardowa logika z tolerancją dla błędów precyzji
            if (preciseCompare(totalSettled, invoiceTotal, 0.01) >= 0) {
              calculatedStatus = 'paid';
            } else if (totalSettled > 0) {
              calculatedStatus = 'partially_paid';
            } else {
              calculatedStatus = 'unpaid';
            }
          }
          
          // Sprawdź czy przeterminowana (tylko dla nieopłaconych/częściowo opłaconych)
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
        // Filtruj po statusie faktury (draft, issued, cancelled)
        results = results.filter(invoice => invoice.status === filterStatus);
      }
    }

    if (listState.filters.invoiceType) {
      if (listState.filters.invoiceType === 'proforma') {
        results = results.filter(invoice => invoice.isProforma === true);
      } else if (listState.filters.invoiceType === 'reinvoice') {
        results = results.filter(invoice => invoice.isRefInvoice === true);
      } else if (listState.filters.invoiceType === 'correction') {
        results = results.filter(invoice => invoice.isCorrectionInvoice === true);
      } else if (listState.filters.invoiceType === 'invoice') {
        results = results.filter(invoice => !invoice.isProforma && !invoice.isRefInvoice && !invoice.isCorrectionInvoice);
      }
      // jeśli 'all' lub '', nie filtrujemy
    }

    if (listState.filters.customerId) {
      results = results.filter(invoice => invoice.customer?.id === listState.filters.customerId);
    }

    if (listState.filters.orderId) {
      results = results.filter(invoice => invoice.orderId === listState.filters.orderId);
    }

    if (listState.filters.fromDate) {
      const fromDate = new Date(listState.filters.fromDate);
      fromDate.setHours(0, 0, 0, 0);
      results = results.filter(invoice => {
        const invoiceDate = new Date(invoice.issueDate);
        invoiceDate.setHours(0, 0, 0, 0);
        return invoiceDate >= fromDate;
      });
    }

    if (listState.filters.toDate) {
      const toDate = new Date(listState.filters.toDate);
      toDate.setHours(23, 59, 59, 999);
      results = results.filter(invoice => {
        const invoiceDate = new Date(invoice.issueDate);
        return invoiceDate <= toDate;
      });
    }

    // Zastosuj sortowanie
    if (tableSort && tableSort.field) {
      results.sort((a, b) => {
        let aValue = a[tableSort.field];
        let bValue = b[tableSort.field];

        // Obsługa zagnieżdżonych pól (np. customer.name)
        if (tableSort.field === 'customer') {
          aValue = a.customer?.name || '';
          bValue = b.customer?.name || '';
        }

        // Obsługa dat
        if (tableSort.field === 'issueDate' || tableSort.field === 'dueDate') {
          aValue = aValue ? new Date(aValue).getTime() : 0;
          bValue = bValue ? new Date(bValue).getTime() : 0;
        }

        // Obsługa liczb
        if (tableSort.field === 'total') {
          aValue = parseFloat(aValue) || 0;
          bValue = parseFloat(bValue) || 0;
        }

        // Obsługa numeru faktury - naturalne sortowanie
        // Format: PREFIX/numer/MM/RRRR (np. FS/1/01/2025, FPF/10/02/2025)
        if (tableSort.field === 'number') {
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
          
          const aParsed = parseInvoiceNumber(aValue);
          const bParsed = parseInvoiceNumber(bValue);
          
          // Sortuj: rok -> miesiąc -> numer kolejny
          if (aParsed.year !== bParsed.year) {
            return tableSort.order === 'asc' 
              ? aParsed.year - bParsed.year 
              : bParsed.year - aParsed.year;
          }
          if (aParsed.month !== bParsed.month) {
            return tableSort.order === 'asc' 
              ? aParsed.month - bParsed.month 
              : bParsed.month - aParsed.month;
          }
          return tableSort.order === 'asc' 
            ? aParsed.seq - bParsed.seq 
            : bParsed.seq - aParsed.seq;
        }

        // Obsługa stringów (status, orderNumber)
        if (tableSort.field === 'status' || tableSort.field === 'orderNumber') {
          aValue = (aValue || '').toString().toLowerCase();
          bValue = (bValue || '').toString().toLowerCase();
        }

        // Porównanie
        if (aValue < bValue) {
          return tableSort.order === 'asc' ? -1 : 1;
        }
        if (aValue > bValue) {
          return tableSort.order === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    setFilteredInvoices(results);
  }, [invoices, listState.searchTerm, listState.filters, tableSort]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // setFilteredInvoices będzie ustawione automatycznie przez useEffect
      
      // Pobierz dostępne kwoty dla proform
      await fetchProformaAmounts(fetchedInvoices);
    } catch (error) {
      showError(t('invoices.notifications.errors.fetchInvoices') + ': ' + error.message);
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

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const fetchedOrders = await getAllOrders();
      // Filtrujemy tylko zamówienia klientów (nie zakupowe)
      const customerOrders = fetchedOrders.filter(order => order.type !== 'purchase');
      setOrders(customerOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setOrdersLoading(false);
    }
  };

  const handleSearch = () => {
    // Filtrowanie jest już obsługiwane przez useEffect
    // Ta funkcja jest zachowana dla zgodności z UI (przycisk "Szukaj")
  };

  const handleSearchChange = (e) => {
    listActions.setSearchTerm(e.target.value);
  };

  const handleSearchKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const clearSearch = () => {
    listActions.setSearchTerm('');
  };

  const handleAddInvoice = () => {
    navigate('/invoices/new');
  };
  
  const handleUpdateExchangeRates = async () => {
    setUpdatingExchangeRates(true);
    
    try {
      console.log('\n' + '🔄'.repeat(30));
      console.log('ROZPOCZĘCIE AKTUALIZACJI KURSÓW WALUT DLA FAKTUR');
      console.log('🔄'.repeat(30) + '\n');
      
      const result = await updateInvoicesExchangeRates([], currentUser?.uid);
      
      console.log('\n' + '✅'.repeat(30));
      console.log('AKTUALIZACJA ZAKOŃCZONA POMYŚLNIE');
      console.log('✅'.repeat(30) + '\n');
      
      showSuccess(
        `Zaktualizowano kursy walut: ${result.updated} faktur. Pominięto: ${result.skipped}.` +
        (result.errors.length > 0 ? ` Błędy: ${result.errors.length}` : '')
      );
      
      // Odśwież listę faktur
      await fetchInvoices();
      
    } catch (error) {
      console.error('❌ BŁĄD AKTUALIZACJI KURSÓW:', error);
      showError(`Błąd podczas aktualizacji kursów walut: ${error.message}`);
    } finally {
      setUpdatingExchangeRates(false);
    }
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
      // setFilteredInvoices będzie ustawione automatycznie przez useEffect
      showSuccess(t('invoices.notifications.invoiceDeleted'));
    } catch (error) {
      showError(t('invoices.notifications.errors.deleteInvoice') + ': ' + error.message);
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
      showSuccess(t('invoices.notifications.invoiceStatusUpdated'));
    } catch (error) {
      showError(t('invoices.notifications.errors.updateStatus') + ': ' + error.message);
    }
  };

  const handleRefreshList = async () => {
    await fetchInvoices();
    showSuccess(t('invoices.notifications.listRefreshed'));
  };

  const handleRefreshProformaAmounts = async () => {
    if (invoices.length > 0) {
      await fetchProformaAmounts(invoices);
      showSuccess(t('invoices.notifications.proformaAmountsRefreshed'));
    }
  };

  // Funkcje obsługi menu dropdown akcji
  const handleActionsMenuOpen = (event) => {
    setActionsMenuAnchor(event.currentTarget);
  };

  const handleActionsMenuClose = () => {
    setActionsMenuAnchor(null);
  };

  const toggleFilters = () => {
    listActions.setFiltersExpanded(!listState.filtersExpanded);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    listActions.updateFilter(name, value);
  };

  const handleDateChange = (name, date) => {
    listActions.updateFilter(name, date);
  };

  const applyFilters = async () => {
    setLoading(true);
    try {
      const fetchedInvoices = await getAllInvoices(listState.filters);
      setInvoices(fetchedInvoices);
      // setFilteredInvoices będzie ustawione automatycznie przez useEffect
    } catch (error) {
      showError(t('invoices.notifications.errors.filterInvoices') + ': ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    listActions.resetFilters();
    // setFilteredInvoices będzie ustawione automatycznie przez useEffect
  };

  // Funkcja do rozwijania/zwijania szczegółów faktury z pobieraniem danych onDemand
  const toggleExpandInvoice = async (invoiceId) => {
    // Jeśli klikamy na już rozwinięty wiersz - zwijamy
    if (expandedInvoiceId === invoiceId) {
      setExpandedInvoiceId(null);
      return;
    }
    
    // Rozwijamy nowy wiersz
    setExpandedInvoiceId(invoiceId);
    
    // Jeśli już mamy pobrane szczegóły, nie pobieramy ponownie
    if (invoiceDetails[invoiceId]) {
      return;
    }
    
    // Pobierz szczegóły faktury onDemand
    setLoadingDetails(prev => ({ ...prev, [invoiceId]: true }));
    try {
      const details = await getInvoiceById(invoiceId);
      setInvoiceDetails(prev => ({ ...prev, [invoiceId]: details }));
    } catch (error) {
      console.error('Błąd podczas pobierania szczegółów faktury:', error);
      showError(t('invoices.notifications.errors.fetchInvoiceDetails') || 'Błąd podczas pobierania szczegółów faktury');
    } finally {
      setLoadingDetails(prev => ({ ...prev, [invoiceId]: false }));
    }
  };
  
  // Funkcja do odświeżania szczegółów faktury
  const refreshInvoiceDetails = async (invoiceId) => {
    setLoadingDetails(prev => ({ ...prev, [invoiceId]: true }));
    try {
      const details = await getInvoiceById(invoiceId);
      setInvoiceDetails(prev => ({ ...prev, [invoiceId]: details }));
    } catch (error) {
      console.error('Błąd podczas odświeżania szczegółów faktury:', error);
      showError(t('invoices.notifications.errors.fetchInvoiceDetails') || 'Błąd podczas odświeżania szczegółów faktury');
    } finally {
      setLoadingDetails(prev => ({ ...prev, [invoiceId]: false }));
    }
  };

  const formatDate = (date) => {
    if (!date) return '';
    return format(new Date(date), 'dd.MM.yyyy');
  };

  const handleViewCustomer = (customerId) => {
    navigate(`/orders/customers/${customerId}`);
  };

  const renderInvoiceStatus = (status) => {
    const statusConfig = {
      'draft': { color: 'default', label: t('invoices.status.draft') },
      'issued': { color: 'primary', label: t('invoices.status.issued') },
      'unpaid': { color: 'error', label: t('invoices.status.unpaid') },
      'paid': { color: 'success', label: t('invoices.status.paid') },
      'partially_paid': { color: 'warning', label: t('invoices.status.partiallyPaid') },
      'overdue': { color: 'error', label: t('invoices.status.overdue') },
      'cancelled': { color: 'error', label: t('invoices.status.cancelled') }
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
      'unpaid': { color: 'error', label: t('invoices.status.unpaid') },
      'partially_paid': { color: 'warning', label: t('invoices.status.partiallyPaid') },
      'paid': { color: 'success', label: t('invoices.status.paid') }
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

  // Funkcja obsługująca kliknięcie w nagłówek kolumny (sortowanie)
  const handleRequestSort = (property) => {
    const isAsc = tableSort?.field === property && tableSort?.order === 'asc';
    const newOrder = isAsc ? 'desc' : 'asc';
    listActions.setTableSort({ field: property, order: newOrder });
  };

  // Komponent dla nagłówka kolumny z sortowaniem
  const SortableTableCell = ({ id, label, disableSorting = false }) => {
    return (
      <TableCell>
        {disableSorting ? (
          label
        ) : (
          <TableSortLabel
            active={tableSort?.field === id}
            direction={tableSort?.field === id ? tableSort?.order : 'asc'}
            onClick={() => handleRequestSort(id)}
          >
            {label}
          </TableSortLabel>
        )}
      </TableCell>
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
                  placeholder={t('invoices.searchInvoices')}
                  value={listState.searchTerm}
                  onChange={handleSearchChange}
                  onKeyPress={handleSearchKeyPress}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    ),
                    endAdornment: listState.searchTerm && (
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
                    {t('common.search')}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={<FilterListIcon />}
                    onClick={toggleFilters}
                  >
                    {t('common.filter')}
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
                  {t('invoices.refresh')}
                </Button>
              </Grid>
              
              {/* Menu dropdown dla akcji i eksportów */}
              <Grid item>
                <Tooltip title="Eksporty i akcje">
                  <IconButton
                    onClick={handleActionsMenuOpen}
                    disabled={loading}
                    color="default"
                    sx={{ border: '1px solid rgba(0, 0, 0, 0.23)' }}
                  >
                    <MoreVertIcon />
                  </IconButton>
                </Tooltip>
                
                <Menu
                  anchorEl={actionsMenuAnchor}
                  open={isActionsMenuOpen}
                  onClose={handleActionsMenuClose}
                  anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                  }}
                  transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                  }}
                >
                  <MenuItem 
                    onClick={() => {
                      handleActionsMenuClose();
                      setTimeout(() => {
                        const button = csvExportRef.current?.querySelector('button');
                        button?.click();
                      }, 100);
                    }}
                    disabled={loading || filteredInvoices.length === 0}
                  >
                    <DownloadIcon sx={{ mr: 1 }} />
                    {t('invoices.csvExport')}
                  </MenuItem>
                  <MenuItem 
                    onClick={() => {
                      handleActionsMenuClose();
                      setTimeout(() => {
                        const button = optimaExportRef.current?.querySelector('button');
                        button?.click();
                      }, 100);
                    }}
                    disabled={loading || filteredInvoices.length === 0}
                  >
                    <DownloadIcon sx={{ mr: 1 }} />
                    Eksport do Comarch Optima (XML)
                  </MenuItem>
                  <MenuItem 
                    onClick={() => {
                      handleActionsMenuClose();
                      handleRefreshProformaAmounts();
                    }}
                    disabled={loading || invoices.length === 0}
                  >
                    <ReceiptIcon sx={{ mr: 1 }} />
                    Odśwież kwoty proform
                  </MenuItem>
                  <MenuItem 
                    onClick={() => {
                      handleActionsMenuClose();
                      navigate('/customers');
                    }}
                  >
                    <CustomersIcon sx={{ mr: 1 }} />
                    {t('invoices.clients')}
                  </MenuItem>
                  <MenuItem 
                    onClick={() => {
                      handleActionsMenuClose();
                      navigate('/invoices/company-settings');
                    }}
                  >
                    <SettingsIcon sx={{ mr: 1 }} />
                    {t('invoices.companyData')}
                  </MenuItem>
                </Menu>
              </Grid>

              {/* Ukryte komponenty eksportu - wyzwalane przez menu */}
              <Box sx={{ display: 'none' }}>
                <div ref={csvExportRef}>
                  <InvoiceCsvExport 
                    invoices={filteredInvoices} 
                    customers={customers}
                  />
                </div>
                <div ref={optimaExportRef}>
                  <InvoiceOptimaExport 
                    selectedInvoices={[]} 
                    allInvoices={filteredInvoices}
                    customers={customers}
                  />
                </div>
              </Box>
              
              <Grid item>
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={updatingExchangeRates ? <CircularProgress size={20} /> : <CurrencyExchangeIcon />}
                  onClick={handleUpdateExchangeRates}
                  disabled={updatingExchangeRates || loading}
                >
                  {updatingExchangeRates ? 'Aktualizacja...' : 'Aktualizuj kursy NBP'}
                </Button>
              </Grid>
              
              <Grid item>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<AddIcon />}
                  onClick={handleAddInvoice}
                >
                  {t('invoices.newInvoice')}
                </Button>
              </Grid>
            </Grid>
          </Grid>
        </Grid>

        {/* Rozwijane filtry zaawansowane */}
        <Collapse in={listState.filtersExpanded}>
          <Divider sx={{ my: 2 }} />
          <Card variant="outlined" sx={{ mt: 2 }}>
            <CardContent>
              <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Status</InputLabel>
                    <Select
                      name="status"
                      value={listState.filters.status}
                      onChange={handleFilterChange}
                      label="Status"
                    >
                      <MenuItem value="">{t('invoices.filters.allStatuses')}</MenuItem>
                      <MenuItem value="draft">{t('invoices.status.draft')}</MenuItem>
                      <MenuItem value="issued">{t('invoices.status.issued')}</MenuItem>
                      <MenuItem value="unpaid">{t('invoices.status.unpaid')}</MenuItem>
                      <MenuItem value="paid">{t('invoices.status.paid')}</MenuItem>
                      <MenuItem value="partially_paid">{t('invoices.status.partiallyPaid')}</MenuItem>
                      <MenuItem value="overdue">{t('invoices.status.overdue')}</MenuItem>
                      <MenuItem value="cancelled">{t('invoices.status.cancelled')}</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Typ faktury</InputLabel>
                    <Select
                      name="invoiceType"
                      value={listState.filters.invoiceType}
                      onChange={handleFilterChange}
                      label="Typ faktury"
                    >
                      <MenuItem value="">Wszystkie</MenuItem>
                      <MenuItem value="invoice">Faktury</MenuItem>
                      <MenuItem value="proforma">Proformy</MenuItem>
                      <MenuItem value="reinvoice">Reinvoice</MenuItem>
                      <MenuItem value="correction">Correction Invoices</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{t('invoices.form.filters.client')}</InputLabel>
                    <Select
                      name="customerId"
                      value={listState.filters.customerId}
                      onChange={handleFilterChange}
                      label={t('invoices.form.filters.client')}
                      disabled={customersLoading}
                    >
                      <MenuItem value="">{t('invoices.form.filters.allClients')}</MenuItem>
                      {customers.map(customer => (
                        <MenuItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{t('invoices.form.filters.customerOrder')}</InputLabel>
                    <Select
                      name="orderId"
                      value={listState.filters.orderId}
                      onChange={handleFilterChange}
                      label={t('invoices.form.filters.customerOrder')}
                      disabled={ordersLoading}
                    >
                      <MenuItem value="">Wszystkie zamówienia</MenuItem>
                      {orders.map(order => (
                        <MenuItem key={order.id} value={order.id}>
                          {order.orderNumber || `#${order.id.substring(0, 8).toUpperCase()}`} - {order.customer?.name || 'Bez nazwy'}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
                    <DatePicker
                      label={t('invoices.form.filters.fromDate')}
                      value={listState.filters.fromDate}
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
                      label={t('invoices.form.filters.toDate')}
                      value={listState.filters.toDate}
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
                <Grid item xs={12} sm={12} md={6}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                      variant="contained" 
                      onClick={applyFilters}
                      fullWidth
                    >
                      {t('invoices.form.filters.applyFilters')}
                    </Button>
                    <Button 
                      variant="outlined" 
                      onClick={resetFilters}
                      color="inherit"
                      fullWidth
                    >
                      {t('invoices.form.filters.resetFilters')}
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
          <TableContainer component={Paper}>
            <Table>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" /> {/* Kolumna dla ikony rozwijania */}
                    <SortableTableCell id="number" label={t('invoices.table.invoiceNumber')} />
                    <SortableTableCell id="orderNumber" label={t('invoices.table.orderNumber')} />
                    <SortableTableCell id="customer" label={t('invoices.table.client')} />
                    <SortableTableCell id="issueDate" label={t('invoices.table.issueDate')} />
                    <SortableTableCell id="dueDate" label={t('invoices.table.dueDate')} />
                    <SortableTableCell id="total" label={t('invoices.table.amountAndToPay')} />
                    <SortableTableCell id="availableAmount" label={t('invoices.table.availableAmount')} disableSorting />
                    <SortableTableCell id="status" label={t('invoices.table.status')} />
                    <TableCell align="right">{t('invoices.table.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredInvoices.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} align="center">
                        {t('invoices.noInvoicesFound')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInvoices
                      .slice(listState.page * listState.rowsPerPage, listState.page * listState.rowsPerPage + listState.rowsPerPage)
                      .map((invoice) => (
                        <React.Fragment key={invoice.id}>
                          <TableRow 
                            hover
                            sx={{ '& > *': { borderBottom: expandedInvoiceId === invoice.id ? 'unset' : undefined } }}
                          >
                            {/* Kolumna z ikoną rozwijania */}
                            <TableCell padding="checkbox">
                              <IconButton
                                size="small"
                                onClick={() => toggleExpandInvoice(invoice.id)}
                              >
                                {expandedInvoiceId === invoice.id ? (
                                  <KeyboardArrowUpIcon />
                                ) : (
                                  <KeyboardArrowDownIcon />
                                )}
                              </IconButton>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5 }}>
                                <Link
                                  component={RouterLink}
                                  to={`/invoices/${invoice.id}`}
                                  variant="body2"
                                  sx={{ 
                                    lineHeight: 1.2,
                                    textDecoration: 'none',
                                    '&:hover': { textDecoration: 'underline' }
                                  }}
                                >
                                  {invoice.number}
                                </Link>
                              {invoice.isProforma && (
                                <Chip 
                                  label={t('invoices.proforma')} 
                                  size="small" 
                                  color="primary" 
                                  variant="outlined"
                                  sx={{ height: 'auto', fontSize: '0.7rem', py: 0.25 }}
                                />
                              )}
                              {invoice.isRefInvoice && (
                                <Chip 
                                  label="Reinvoice" 
                                  size="small" 
                                  color="secondary" 
                                  variant="outlined"
                                  sx={{ height: 'auto', fontSize: '0.7rem', py: 0.25 }}
                                />
                              )}
                              {invoice.isCorrectionInvoice && (
                                <Chip 
                                  label="Correction Invoice" 
                                  size="small" 
                                  color="error" 
                                  variant="outlined"
                                  sx={{ height: 'auto', fontSize: '0.7rem', py: 0.25 }}
                                />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            {invoice.orderNumber ? (
                              <Link
                                component={RouterLink}
                                to={(invoice.isRefInvoice || invoice.originalOrderType === 'purchase')
                                  ? `/purchase-orders/${invoice.orderId}` 
                                  : `/orders/${invoice.orderId}`}
                                variant="body2"
                                sx={{ 
                                  textDecoration: 'none',
                                  '&:hover': { textDecoration: 'underline' }
                                }}
                              >
                                {invoice.orderNumber}
                              </Link>
                            ) : (
                              '-'
                            )}
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
                          <TableCell>
                            {/* Połączona kolumna Kwota/Do zapłaty */}
                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                              <Typography variant="body2" fontWeight="bold">
                                {formatCurrency(invoice.total, invoice.currency)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {(() => {
                                  const total = parseFloat(invoice.total || 0);
                                  const paid = parseFloat(invoice.totalPaid || 0);
                                  
                                  if (invoice.isProforma) {
                                    // Dla proform sprawdź czy została opłacona
                                    const isFullyPaid = paid >= total;
                                    
                                    if (!isFullyPaid) {
                                      // Proforma nie została opłacona - pokaż kwotę do zapłaty
                                      const remaining = Math.max(0, total - paid);
                                      return `Do zapłaty: ${formatCurrency(remaining, invoice.currency)}`;
                                    } else {
                                      // Proforma została opłacona - pokaż status wykorzystania
                                      const available = proformaAmounts[invoice.id] 
                                        ? proformaAmounts[invoice.id].available 
                                        : total;
                                      const used = total - available;
                                      if (used > 0) {
                                        return `Wykorzystano: ${formatCurrency(used, invoice.currency)}`;
                                      } else {
                                        return `Dostępne: ${formatCurrency(total, invoice.currency)}`;
                                      }
                                    }
                                  } else {
                                    // Dla zwykłych faktur oblicz kwotę do zapłaty uwzględniając przedpłaty
                                    let advancePayments = 0;
                                    if (invoice.proformAllocation && invoice.proformAllocation.length > 0) {
                                      advancePayments = invoice.proformAllocation.reduce((sum, allocation) => sum + (allocation.amount || 0), 0);
                                    } else {
                                      advancePayments = parseFloat(invoice.settledAdvancePayments || 0);
                                    }
                                    
                                    // Dla faktur korygujących (ujemnych) nie używamy Math.max(0, ...)
                                    // Ujemna kwota oznacza że firma musi zwrócić klientowi
                                    const remaining = total - paid - advancePayments;
                                    
                                    // Dla faktur korygujących z ujemną wartością pokazujemy "Do zwrotu"
                                    if (remaining < 0) {
                                      return `Do zwrotu: ${formatCurrency(Math.abs(remaining), invoice.currency)}`;
                                    }
                                    return `Do zapłaty: ${formatCurrency(remaining, invoice.currency)}`;
                                  }
                                })()}
                              </Typography>
                            </Box>
                          </TableCell>
                          <TableCell>
                            {invoice.isProforma ? (
                              (() => {
                                // Sprawdź czy proforma została opłacona
                                const total = parseFloat(invoice.total || 0);
                                const paid = parseFloat(invoice.totalPaid || 0);
                                const isFullyPaid = preciseCompare(paid, total, 0.01) >= 0;
                                
                                if (!isFullyPaid) {
                                  // Proforma nie została opłacona - nie wyświetlaj kwoty dostępnej
                                  return (
                                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                      <Typography variant="body2" color="warning.main" fontWeight="bold">
                                        -
                                      </Typography>
                                      <Typography variant="caption" color="warning.main">
                                        Wymaga opłacenia
                                      </Typography>
                                    </Box>
                                  );
                                }
                                
                                // Proforma została opłacona - wyświetl dostępną kwotę
                                return (
                                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                                    <Typography variant="body2" color="success.main" fontWeight="bold">
                                      {proformaAmounts[invoice.id] 
                                        ? formatCurrency(proformaAmounts[invoice.id].available, invoice.currency)
                                        : formatCurrency(invoice.total, invoice.currency)
                                      }
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                      {t('invoices.form.filters.availableFrom')} {formatCurrency(invoice.total, invoice.currency)}
                                    </Typography>
                                  </Box>
                                );
                              })()
                            ) : (
                              // Dla zwykłych faktur pusta kolumna "Kwota dostępna"
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            {/* Połączona kolumna Status faktury i Status płatności */}
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {renderInvoiceStatus(invoice.status)}
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
                                // Sprawdź czy jest wymagana przedpłata
                                const requiredAdvancePercentage = invoice.requiredAdvancePaymentPercentage || 0;
                                if (requiredAdvancePercentage > 0) {
                                  const requiredAdvanceAmount = calculateRequiredAdvancePayment(invoiceTotal, requiredAdvancePercentage);
                                  
                                  // Używamy tolerancji 0.01 EUR (1 cent) dla porównań płatności
                                  if (preciseCompare(totalSettled, requiredAdvanceAmount, 0.01) >= 0) {
                                    calculatedStatus = 'paid';
                                  } else if (totalSettled > 0) {
                                    calculatedStatus = 'partially_paid';
                                  } else {
                                    calculatedStatus = 'unpaid';
                                  }
                                } else {
                                  // Standardowa logika z tolerancją dla błędów precyzji
                                  if (preciseCompare(totalSettled, invoiceTotal, 0.01) >= 0) {
                                    calculatedStatus = 'paid';
                                  } else if (totalSettled > 0) {
                                    calculatedStatus = 'partially_paid';
                                  } else {
                                    calculatedStatus = 'unpaid';
                                  }
                                }
                                
                                const overpayment = preciseSubtract(totalSettled, invoiceTotal);
                                
                                return (
                                  <>
                                    {renderPaymentStatus(calculatedStatus)}
                                    {preciseCompare(overpayment, 0.01) >= 0 && (
                                      <Chip 
                                        label={t('invoices.status.refundDue')} 
                                        color="warning" 
                                        size="small"
                                        variant="outlined"
                                        sx={{ mt: 0.5 }}
                                      />
                                    )}
                                  </>
                                );
                              })()}
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                              <IconButton 
                                component={RouterLink}
                                to={`/invoices/${invoice.id}`}
                                size="small" 
                                title={t('invoices.tooltips.viewInvoice')}
                              >
                                <ViewIcon fontSize="small" />
                              </IconButton>
                              <IconButton 
                                component={RouterLink}
                                to={`/invoices/${invoice.id}/edit`}
                                size="small" 
                                title={t('invoices.tooltips.editInvoice')}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                              <IconButton 
                                size="small" 
                                onClick={() => handleDeleteClick(invoice)}
                                title={t('invoices.tooltips.deleteInvoice')}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                              {invoice.status === 'draft' && (
                                <IconButton 
                                  size="small" 
                                  onClick={() => handleUpdateStatus(invoice.id, 'issued')}
                                  title={t('invoices.form.buttons.markAsIssued')}
                                  color="primary"
                                >
                                  <ReceiptIcon fontSize="small" />
                                </IconButton>
                              )}
                            </Box>
                          </TableCell>
                          </TableRow>
                          
                          {/* Wiersz z rozwijanymi szczegółami */}
                          <TableRow>
                            <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={10}>
                              <Collapse in={expandedInvoiceId === invoice.id} timeout="auto" unmountOnExit>
                                <Box sx={{ py: 2, px: 2 }}>
                                  {loadingDetails[invoice.id] ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                                      <CircularProgress size={24} />
                                    </Box>
                                  ) : invoiceDetails[invoice.id] ? (
                                    <InvoiceExpandedDetails 
                                      invoice={invoiceDetails[invoice.id]} 
                                      onRefresh={() => refreshInvoiceDetails(invoice.id)}
                                      formatCurrency={formatCurrency}
                                      t={t}
                                    />
                                  ) : null}
                                </Box>
                              </Collapse>
                            </TableCell>
                          </TableRow>
                        </React.Fragment>
                      ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          <TablePagination
            rowsPerPageOptions={[10, 25, 50, 100]}
            component="div"
            count={filteredInvoices.length}
            rowsPerPage={listState.rowsPerPage}
            page={listState.page}
            onPageChange={(event, newPage) => listActions.setPage(newPage)}
            onRowsPerPageChange={(event) => {
              listActions.setRowsPerPage(parseInt(event.target.value, 10));
            }}
            labelRowsPerPage={t('common.rowsPerPage') + ':'}
            labelDisplayedRows={({ from, to, count }) => 
              t('common.displayedRows', { from, to, count: count !== -1 ? count : `więcej niż ${to}` })
            }
          />
        </>
      )}

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
        onConfirm={handleDeleteConfirm}
        title={t('invoices.dialogs.deleteConfirm.title')}
        content={t('invoices.dialogs.deleteConfirm.message', { number: invoiceToDelete?.number })}
      />
    </Box>
  );
};

export default InvoicesList; 