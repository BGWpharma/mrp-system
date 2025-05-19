import React, { useState, useEffect } from 'react';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Button,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Card,
  CardContent,
  Divider,
  TextField,
  Tooltip,
  Menu,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import {
  DateRange as DateRangeIcon,
  Print as PrintIcon,
  Download as DownloadIcon,
  Refresh as RefreshIcon,
  PictureAsPdf as PdfIcon,
  FilterList as FilterIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  TableChart as CsvIcon,
  KeyboardArrowDown as ArrowDownIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl } from 'date-fns/locale';
import { 
  format, 
  subDays, 
  startOfMonth, 
  endOfMonth, 
  parseISO, 
  isValid,
  isWithinInterval 
} from 'date-fns';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { getAllOrders } from '../../../services/orderService';
import { getAllCustomers } from '../../../services/customerService';
import { formatCurrency } from '../../../utils/formatUtils';
import { exportToCSV, exportToPDF, formatDateForExport, formatCurrencyForExport } from '../../../utils/exportUtils';

// Importuj komponenty
import COReportComponent from '../../../components/sales/co-reports/COReportComponent';
import CustomerStatsComponent from '../../../components/sales/co-reports/CustomerStatsComponent';
import StatusStatsComponent from '../../../components/sales/co-reports/StatusStatsComponent';

// Definicja okresów czasowych dla filtrowania
const TIME_PERIODS = {
  LAST_7_DAYS: 'last7days',
  LAST_30_DAYS: 'last30days',
  LAST_MONTH: 'lastMonth',
  THIS_MONTH: 'thisMonth',
  CUSTOM: 'custom'
};

const COReportsPage = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  
  // Stan komponentu
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  
  // Menu eksportu
  const [exportMenuAnchor, setExportMenuAnchor] = useState(null);
  const isExportMenuOpen = Boolean(exportMenuAnchor);
  
  // Filtry
  const [startDate, setStartDate] = useState(subDays(new Date(), 30));
  const [endDate, setEndDate] = useState(new Date());
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [reportPeriod, setReportPeriod] = useState(TIME_PERIODS.LAST_30_DAYS);
  
  // Statystyki
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalValue: 0,
    avgOrderValue: 0,
    customerStats: {},
    statusStats: {}
  });
  
  // Pobieranie danych
  useEffect(() => {
    fetchData();
  }, []);
  
  // Filtrowanie danych po zmianie filtrów
  useEffect(() => {
    if (orders.length > 0) {
      filterAndProcessData();
    }
  }, [orders, startDate, endDate, selectedCustomer]);
  
  // Pobieranie zamówień i klientów
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Pobierz wszystkie zamówienia bez filtrowania
      const allOrders = await getAllOrders();
      setOrders(allOrders || []);
      
      // Pobierz wszystkich klientów
      const allCustomers = await getAllCustomers();
      setCustomers(allCustomers || []);
      
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania danych:', error);
      showError('Nie udało się pobrać danych do raportu');
      setLoading(false);
    }
  };
  
  // Funkcja do filtrowania i przetwarzania danych
  const filterAndProcessData = () => {
    // Filtrowanie zamówień wg daty i klienta
    const filtered = orders.filter(order => {
      // Przetwarzanie daty zamówienia - obsługa różnych formatów daty
      let orderDate;
      if (typeof order.orderDate === 'string') {
        orderDate = new Date(order.orderDate);
      } else if (order.orderDate?.toDate) {
        orderDate = order.orderDate.toDate();
      } else if (order.orderDate instanceof Date) {
        orderDate = order.orderDate;
      } else {
        return false; // Brak daty, pomijamy
      }
      
      // Sprawdź czy data jest w zakresie
      if (orderDate < startDate || orderDate > endDate) {
        return false;
      }
      
      // Sprawdź filtr klienta
      if (selectedCustomer !== 'all') {
        if (order.customer?.id !== selectedCustomer) {
          return false;
        }
      }
      
      return true;
    });
    
    setFilteredOrders(filtered);
    
    // Obliczanie statystyk
    calculateStats(filtered);
  };
  
  // Obliczanie statystyk
  const calculateStats = (filteredOrders) => {
    // Wartości podstawowe
    const totalOrders = filteredOrders.length;
    const totalValue = filteredOrders.reduce((sum, order) => sum + (order.totalValue || 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalValue / totalOrders : 0;
    
    // Statystyki według klientów
    const customerStats = {};
    filteredOrders.forEach(order => {
      const customerId = order.customer?.id || 'unknown';
      const customerName = order.customer?.name || 'Nieznany klient';
      
      if (!customerStats[customerId]) {
        customerStats[customerId] = {
          name: customerName,
          count: 0,
          totalValue: 0
        };
      }
      
      customerStats[customerId].count += 1;
      customerStats[customerId].totalValue += (order.totalValue || 0);
    });
    
    // Statystyki według statusu
    const statusStats = {};
    filteredOrders.forEach(order => {
      const status = order.status || 'Nieznany';
      
      if (!statusStats[status]) {
        statusStats[status] = {
          count: 0,
          totalValue: 0
        };
      }
      
      statusStats[status].count += 1;
      statusStats[status].totalValue += (order.totalValue || 0);
    });
    
    setStats({
      totalOrders,
      totalValue,
      avgOrderValue,
      customerStats,
      statusStats
    });
  };
  
  // Obsługa zmiany okresu raportu
  const handlePeriodChange = (e) => {
    const period = e.target.value;
    setReportPeriod(period);
    
    const today = new Date();
    let newStartDate = today;
    let newEndDate = today;
    
    switch (period) {
      case TIME_PERIODS.LAST_7_DAYS:
        newStartDate = subDays(today, 7);
        break;
      case TIME_PERIODS.LAST_30_DAYS:
        newStartDate = subDays(today, 30);
        break;
      case TIME_PERIODS.LAST_MONTH:
        newStartDate = startOfMonth(subDays(today, 1));
        newEndDate = endOfMonth(subDays(today, 1));
        break;
      case TIME_PERIODS.THIS_MONTH:
        newStartDate = startOfMonth(today);
        newEndDate = endOfMonth(today);
        break;
      case TIME_PERIODS.CUSTOM:
        // Nie zmieniaj dat
        return;
      default:
        newStartDate = subDays(today, 30);
    }
    
    setStartDate(newStartDate);
    setEndDate(newEndDate);
  };
  
  // Formatowanie wyświetlanych dat
  const formatDateDisplay = (date) => {
    return format(date, 'dd.MM.yyyy', { locale: pl });
  };
  
  // Obsługa menu eksportu
  const handleExportMenuOpen = (event) => {
    setExportMenuAnchor(event.currentTarget);
  };
  
  const handleExportMenuClose = () => {
    setExportMenuAnchor(null);
  };
  
  // Funkcja do generowania raportu CSV
  const handleExportCSV = () => {
    handleExportMenuClose();
    
    // Definicja nagłówków dla CSV
    const headers = [
      { label: 'Order ID', key: 'id' },
      { label: 'Order Number', key: 'orderNumber' },
      { label: 'Date', key: 'orderDate' },
      { label: 'Customer Name', key: 'customer.name' },
      { label: 'Customer Email', key: 'customer.email' },
      { label: 'Status', key: 'status' },
      { label: 'Total Value', key: 'totalValue' },
      { label: 'Expected Delivery', key: 'expectedDeliveryDate' },
      { label: 'Payment Status', key: 'paymentStatus' }
    ];
    
    // Przygotuj dane do eksportu
    const exportData = filteredOrders.map(order => {
      return {
        ...order,
        orderDate: formatDateForExport(order.orderDate),
        expectedDeliveryDate: formatDateForExport(order.expectedDeliveryDate),
        totalValue: formatCurrencyForExport(order.totalValue)
      };
    });
    
    // Wygeneruj plik CSV
    const filename = `customer_orders_report_${formatDateForExport(new Date(), 'yyyyMMdd')}`;
    const success = exportToCSV(exportData, headers, filename);
    
    if (success) {
      showSuccess('CSV report has been generated successfully.');
    } else {
      showError('Failed to generate CSV report.');
    }
  };
  
  // Funkcja do generowania raportu PDF
  const handleExportPDF = () => {
    handleExportMenuClose();
    
    // Definicja nagłówków dla PDF
    const headers = [
      { label: 'Order Number', key: 'orderNumber' },
      { label: 'Date', key: 'orderDate' },
      { label: 'Customer', key: 'customer.name' },
      { label: 'Status', key: 'status' },
      { label: 'Total Value', key: 'totalValue' },
      { label: 'Expected Delivery', key: 'expectedDeliveryDate' }
    ];
    
    // Przygotuj dane do eksportu
    const exportData = filteredOrders.map(order => {
      return {
        ...order,
        orderDate: formatDateForExport(order.orderDate),
        expectedDeliveryDate: formatDateForExport(order.expectedDeliveryDate),
        totalValue: formatCurrencyForExport(order.totalValue)
      };
    });
    
    // Utwórz datę i zakres filtrowania jako podtytuł
    const dateRange = `${formatDateForExport(startDate)} - ${formatDateForExport(endDate)}`;
    const customerFilter = selectedCustomer !== 'all' 
      ? `, Customer: ${getCustomerName(selectedCustomer)}` 
      : '';
    
    // Opcje dla eksportu PDF
    const pdfOptions = {
      title: 'Customer Orders Report',
      subtitle: `Date range: ${dateRange}${customerFilter}`,
      footerText: `Generated on ${new Date().toLocaleString()} | Total Orders: ${stats.totalOrders} | Total Value: ${formatCurrency(stats.totalValue)}`
    };
    
    // Wygeneruj plik PDF
    const filename = `customer_orders_report_${formatDateForExport(new Date(), 'yyyyMMdd')}`;
    const success = exportToPDF(exportData, headers, filename, pdfOptions);
    
    if (success) {
      showSuccess('PDF report has been generated successfully.');
    } else {
      showError('Failed to generate PDF report.');
    }
  };
  
  // Funkcja do odświeżenia danych
  const handleRefreshData = () => {
    fetchData();
    showInfo('Dane zostały odświeżone');
  };
  
  // Funkcja pomocnicza do uzyskania nazwy klienta
  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    return customer ? customer.name : 'Nieznany klient';
  };
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" component="h1">
          Raporty zamówień klientów (CO)
        </Typography>
        
        <Box>
          <Button
            variant="outlined"
            color="primary"
            onClick={handleExportMenuOpen}
            startIcon={<DownloadIcon />}
            endIcon={<ArrowDownIcon />}
            sx={{ mr: 1 }}
          >
            Export
          </Button>
          <Menu
            anchorEl={exportMenuAnchor}
            open={isExportMenuOpen}
            onClose={handleExportMenuClose}
          >
            <MenuItem onClick={handleExportPDF}>
              <ListItemIcon>
                <PdfIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Export as PDF</ListItemText>
            </MenuItem>
            <MenuItem onClick={handleExportCSV}>
              <ListItemIcon>
                <CsvIcon fontSize="small" />
              </ListItemIcon>
              <ListItemText>Export as CSV</ListItemText>
            </MenuItem>
          </Menu>
          
          <Tooltip title="Odśwież dane">
            <IconButton onClick={handleRefreshData} color="primary">
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      
      {/* Filtry */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Okres raportu</InputLabel>
              <Select
                value={reportPeriod}
                onChange={handlePeriodChange}
                label="Okres raportu"
              >
                <MenuItem value={TIME_PERIODS.LAST_7_DAYS}>Ostatnie 7 dni</MenuItem>
                <MenuItem value={TIME_PERIODS.LAST_30_DAYS}>Ostatnie 30 dni</MenuItem>
                <MenuItem value={TIME_PERIODS.LAST_MONTH}>Poprzedni miesiąc</MenuItem>
                <MenuItem value={TIME_PERIODS.THIS_MONTH}>Bieżący miesiąc</MenuItem>
                <MenuItem value={TIME_PERIODS.CUSTOM}>Niestandardowy</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label="Data początkowa"
                value={startDate}
                onChange={(newDate) => {
                  setStartDate(newDate);
                  setReportPeriod(TIME_PERIODS.CUSTOM);
                }}
                sx={{ width: '100%' }}
              />
            </LocalizationProvider>
          </Grid>
          
          <Grid item xs={12} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label="Data końcowa"
                value={endDate}
                onChange={(newDate) => {
                  setEndDate(newDate);
                  setReportPeriod(TIME_PERIODS.CUSTOM);
                }}
                sx={{ width: '100%' }}
              />
            </LocalizationProvider>
          </Grid>
          
          <Grid item xs={12} md={2}>
            <Box sx={{ display: 'flex', flexDirection: 'row' }}>
              <Button 
                variant="outlined" 
                onClick={() => {
                  const prevStart = new Date(startDate);
                  const prevEnd = new Date(endDate);
                  const diff = endDate - startDate;
                  prevStart.setTime(prevStart.getTime() - diff);
                  prevEnd.setTime(prevEnd.getTime() - diff);
                  setStartDate(prevStart);
                  setEndDate(prevEnd);
                  setReportPeriod(TIME_PERIODS.CUSTOM);
                }}
                sx={{ mr: 1, minWidth: 0, p: 1 }}
                size="small"
              >
                <PrevIcon fontSize="small" />
              </Button>
              <Button 
                variant="outlined" 
                onClick={() => {
                  const nextStart = new Date(startDate);
                  const nextEnd = new Date(endDate);
                  const diff = endDate - startDate;
                  nextStart.setTime(nextStart.getTime() + diff);
                  nextEnd.setTime(nextEnd.getTime() + diff);
                  setStartDate(nextStart);
                  setEndDate(nextEnd);
                  setReportPeriod(TIME_PERIODS.CUSTOM);
                }}
                sx={{ minWidth: 0, p: 1 }}
                size="small"
              >
                <NextIcon fontSize="small" />
              </Button>
            </Box>
          </Grid>
        </Grid>
        
        <Grid container spacing={3} sx={{ mt: 1 }}>
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Klient</InputLabel>
              <Select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                label="Klient"
              >
                <MenuItem value="all">Wszyscy klienci</MenuItem>
                {customers.map(customer => (
                  <MenuItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>
      
      <Typography variant="subtitle1" gutterBottom>
        Dane za okres: {formatDateDisplay(startDate)} - {formatDateDisplay(endDate)}
      </Typography>
      
      {/* Karty ze statystykami */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Liczba zamówień
              </Typography>
              <Typography variant="h4" component="div">
                {stats.totalOrders}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Wartość zamówień
              </Typography>
              <Typography variant="h4" component="div">
                {formatCurrency(stats.totalValue)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>
                Średnia wartość zamówienia
              </Typography>
              <Typography variant="h4" component="div">
                {formatCurrency(stats.avgOrderValue)}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* Statystyki według klientów */}
      <CustomerStatsComponent 
        customerStats={stats.customerStats} 
        loading={loading} 
        title="Statystyki według klientów" 
      />
      
      {/* Statystyki według statusu */}
      <StatusStatsComponent 
        statusStats={stats.statusStats} 
        totalValue={stats.totalValue}
        loading={loading} 
        title="Statystyki według statusu" 
      />
      
      {/* Lista zamówień */}
      <COReportComponent 
        orders={filteredOrders} 
        loading={loading} 
        title="Lista zamówień" 
      />
    </Container>
  );
};

export default COReportsPage; 