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
  ListItemText,
  Tabs,
  Tab,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell
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
  KeyboardArrowDown as ArrowDownIcon,
  Assessment as AssessmentIcon,
  MonetizationOn as MoneyIcon
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
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
  AreaChart,
  Area
} from 'recharts';

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
  const [selectedTab, setSelectedTab] = useState(0);
  
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
    try {
      // Sprawdź czy data jest prawidłowa
      if (!date) return 'Brak daty';
      
      // Jeśli to timestamp z Firebase, konwertuj na Date
      let dateObj = date;
      if (typeof date === 'object' && date.toDate) {
        dateObj = date.toDate();
      } else if (!(date instanceof Date)) {
        dateObj = new Date(date);
      }
      
      // Sprawdź czy data jest prawidłowa
      if (isNaN(dateObj.getTime())) {
        return 'Nieprawidłowa data';
      }
      
      return format(dateObj, 'dd.MM.yyyy', { locale: pl });
    } catch (error) {
      console.error('Błąd formatowania daty:', error, date);
      return 'Błąd daty';
    }
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
  
  // Obsługa zmiany zakładki
  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  // Funkcja do obliczania kosztów produkcji
  const calculateProductionCosts = () => {
    const productionCosts = [];
    
    try {
      filteredOrders.forEach(order => {
        if (order.items && Array.isArray(order.items) && order.items.length > 0) {
          order.items.forEach(item => {
            // Sprawdź, czy pozycja ma koszt produkcji
            if (item.productionCost && parseFloat(item.productionCost) > 0) {
              try {
                productionCosts.push({
                  orderId: order.id,
                  orderNumber: order.orderNumber || order.id,
                  orderDate: order.orderDate,
                  customerName: order.customer?.name || 'Nieznany klient',
                  itemName: item.name || 'Produkt bez nazwy',
                  quantity: parseFloat(item.quantity) || 0,
                  unit: item.unit || 'szt.',
                  productionTaskId: item.productionTaskId,
                  productionCost: parseFloat(item.productionCost || 0),
                  fullProductionCost: parseFloat(item.fullProductionCost || 0),
                  unitProductionCost: parseFloat(item.productionUnitCost || 0),
                  fullProductionUnitCost: parseFloat(item.fullProductionUnitCost || 0),
                  totalItemValue: (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0),
                  totalProductionCost: (parseFloat(item.quantity) || 0) * parseFloat(item.productionUnitCost || item.productionCost || 0),
                  totalFullProductionCost: (parseFloat(item.quantity) || 0) * parseFloat(item.fullProductionUnitCost || item.fullProductionCost || 0)
                });
              } catch (itemError) {
                console.error('Błąd podczas przetwarzania pozycji zamówienia:', itemError, item);
              }
            }
          });
        }
      });
    } catch (error) {
      console.error('Błąd podczas obliczania kosztów produkcji:', error);
    }
    
    return productionCosts;
  };

  // Funkcja do obliczania statystyk kosztów produkcji
  const calculateProductionCostStats = (productionCosts) => {
    const totalItems = productionCosts.length;
    const totalProductionCost = productionCosts.reduce((sum, item) => sum + item.totalProductionCost, 0);
    const totalFullProductionCost = productionCosts.reduce((sum, item) => sum + item.totalFullProductionCost, 0);
    const totalItemValue = productionCosts.reduce((sum, item) => sum + item.totalItemValue, 0);
    
    // Grupowanie po produktach
    const costsByProduct = {};
    productionCosts.forEach(item => {
      if (!costsByProduct[item.itemName]) {
        costsByProduct[item.itemName] = {
          name: item.itemName,
          totalQuantity: 0,
          totalCost: 0,
          totalFullCost: 0,
          orderCount: 0
        };
      }
      
      costsByProduct[item.itemName].totalQuantity += item.quantity;
      costsByProduct[item.itemName].totalCost += item.totalProductionCost;
      costsByProduct[item.itemName].totalFullCost += item.totalFullProductionCost;
      costsByProduct[item.itemName].orderCount += 1;
    });
    
    // Grupowanie po klientach
    const costsByCustomer = {};
    productionCosts.forEach(item => {
      if (!costsByCustomer[item.customerName]) {
        costsByCustomer[item.customerName] = {
          name: item.customerName,
          totalCost: 0,
          totalFullCost: 0,
          orderCount: 0,
          itemCount: 0
        };
      }
      
      costsByCustomer[item.customerName].totalCost += item.totalProductionCost;
      costsByCustomer[item.customerName].totalFullCost += item.totalFullProductionCost;
      costsByCustomer[item.customerName].orderCount += 1;
      costsByCustomer[item.customerName].itemCount += 1;
    });
    
    return {
      totalItems,
      totalProductionCost,
      totalFullProductionCost,
      totalItemValue,
      avgProductionCost: totalItems > 0 ? totalProductionCost / totalItems : 0,
      avgFullProductionCost: totalItems > 0 ? totalFullProductionCost / totalItems : 0,
      productionCostRatio: totalItemValue > 0 ? (totalProductionCost / totalItemValue) * 100 : 0,
      fullProductionCostRatio: totalItemValue > 0 ? (totalFullProductionCost / totalItemValue) * 100 : 0,
      costsByProduct: Object.values(costsByProduct),
      costsByCustomer: Object.values(costsByCustomer)
    };
  };

  // Komponent zakładki "Raport zamówień"
  const OrdersReportTab = () => (
    <>
      {/* Nagłówek z przyciskami Export i Odśwież */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6" component="h2">
          Raport zamówień
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
    </>
  );

  // Komponent zakładki "Koszty produkcji"
  const ProductionCostsTab = () => {
    const productionCosts = calculateProductionCosts();
    const costStats = calculateProductionCostStats(productionCosts);
    
    // Stan dla wybranego produktu
    const [selectedProduct, setSelectedProduct] = useState('');
    // Stan dla danych historycznych kosztów wybranego produktu
    const [productCostHistory, setProductCostHistory] = useState([]);
    // Stan dla informacji o zamówieniach zawierających wybrany produkt
    const [productOrders, setProductOrders] = useState([]);
    
    // Efekt do obliczania danych historycznych dla wybranego produktu
    useEffect(() => {
      if (selectedProduct && productionCosts.length > 0) {
        // Filtruj koszty produkcji dla wybranego produktu
        const filteredCosts = productionCosts.filter(item => item.itemName === selectedProduct);
        
        // Grupuj koszty po datach zamówień
        const costsByDate = {};
        filteredCosts.forEach(item => {
          let orderDate;
          if (typeof item.orderDate === 'string') {
            orderDate = new Date(item.orderDate);
          } else if (item.orderDate?.toDate) {
            orderDate = item.orderDate.toDate();
          } else if (item.orderDate instanceof Date) {
            orderDate = item.orderDate;
          } else {
            orderDate = new Date(); // Domyślna data
          }
          
          const dateStr = format(orderDate, 'yyyy-MM-dd');
          
          if (!costsByDate[dateStr]) {
            costsByDate[dateStr] = {
              date: orderDate,
              unitCost: 0,
              totalCost: 0,
              fullUnitCost: 0,
              totalFullCost: 0,
              quantity: 0,
              count: 0
            };
          }
          
          costsByDate[dateStr].totalCost += item.totalProductionCost;
          costsByDate[dateStr].totalFullCost += item.totalFullProductionCost;
          costsByDate[dateStr].quantity += item.quantity;
          costsByDate[dateStr].count += 1;
          costsByDate[dateStr].unitCost = costsByDate[dateStr].totalCost / costsByDate[dateStr].quantity;
          costsByDate[dateStr].fullUnitCost = costsByDate[dateStr].totalFullCost / costsByDate[dateStr].quantity;
        });
        
        // Konwertuj na tablicę i sortuj według daty
        const historyData = Object.values(costsByDate).sort((a, b) => a.date - b.date);
        setProductCostHistory(historyData);
        
        // Znajdź zamówienia zawierające wybrany produkt
        const orders = [];
        filteredCosts.forEach(item => {
          const orderExists = orders.some(order => order.orderId === item.orderId);
          if (!orderExists) {
            orders.push({
              orderId: item.orderId,
              orderNumber: item.orderNumber,
              orderDate: item.orderDate,
              customerName: item.customerName,
              quantity: item.quantity,
              unitCost: item.productionCost,
              fullUnitCost: item.fullProductionUnitCost || item.fullProductionCost / item.quantity,
              totalCost: item.totalProductionCost,
              totalFullCost: item.totalFullProductionCost
            });
          }
        });
        
        setProductOrders(orders);
      } else {
        setProductCostHistory([]);
        setProductOrders([]);
      }
    }, [selectedProduct, productionCosts]);
    
    // Obliczanie średniej ceny wybranego produktu
    const calculateProductStats = () => {
      if (!selectedProduct || productionCosts.length === 0) return null;
      
      const filteredCosts = productionCosts.filter(item => item.itemName === selectedProduct);
      if (filteredCosts.length === 0) return null;
      
      const totalQuantity = filteredCosts.reduce((sum, item) => sum + item.quantity, 0);
      const totalCost = filteredCosts.reduce((sum, item) => sum + item.totalProductionCost, 0);
      const totalFullCost = filteredCosts.reduce((sum, item) => sum + item.totalFullProductionCost, 0);
      const avgUnitCost = totalQuantity > 0 ? totalCost / totalQuantity : 0;
      const avgFullUnitCost = totalQuantity > 0 ? totalFullCost / totalQuantity : 0;
      const minUnitCost = Math.min(...filteredCosts.map(item => item.productionCost));
      const maxUnitCost = Math.max(...filteredCosts.map(item => item.productionCost));
      const minFullUnitCost = Math.min(...filteredCosts.map(item => {
        return item.fullProductionUnitCost || (item.quantity > 0 ? item.fullProductionCost / item.quantity : 0);
      }));
      const maxFullUnitCost = Math.max(...filteredCosts.map(item => {
        return item.fullProductionUnitCost || (item.quantity > 0 ? item.fullProductionCost / item.quantity : 0);
      }));
      
      return {
        totalQuantity,
        totalCost,
        totalFullCost,
        avgUnitCost,
        avgFullUnitCost,
        minUnitCost,
        maxUnitCost,
        minFullUnitCost,
        maxFullUnitCost,
        orderCount: filteredCosts.length
      };
    };
    
    const productStats = calculateProductStats();
    
    return (
      <>
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
            
            <Grid item xs={12} md={4}>
              <FormControl fullWidth>
                <InputLabel>Wybierz produkt</InputLabel>
                <Select
                  value={selectedProduct}
                  onChange={(e) => setSelectedProduct(e.target.value)}
                  label="Wybierz produkt"
                >
                  <MenuItem value="">Wszystkie produkty</MenuItem>
                  {costStats.costsByProduct.map((product, index) => (
                    <MenuItem key={index} value={product.name}>
                      {product.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Button 
                variant="contained"
                color="primary"
                startIcon={<RefreshIcon />}
                onClick={handleRefreshData}
              >
                Odśwież dane
              </Button>
            </Grid>
          </Grid>
        </Paper>

        {productionCosts.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <MoneyIcon sx={{ fontSize: '4rem', color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              Brak kosztów produkcji
            </Typography>
            <Typography variant="body1" color="text.secondary">
              W wybranym okresie nie ma zamówień z kosztami produkcji.
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Koszty produkcji są dostępne tylko dla pozycji zamówień powiązanych z zadaniami produkcyjnymi.
            </Typography>
          </Box>
        ) : (
          <>
            {/* Nagłówek z datami */}
            <Typography variant="subtitle1" gutterBottom>
              Koszty produkcji za okres: {formatDateDisplay(startDate)} - {formatDateDisplay(endDate)}
            </Typography>
            
            {selectedProduct ? (
              <>
                {/* Karta ze statystykami dla wybranego produktu */}
                <Typography variant="h6" component="h3" sx={{ mb: 2 }}>
                  Statystyki kosztu produkcji dla: {selectedProduct}
                </Typography>
                
                {productStats && (
                  <Grid container spacing={3} sx={{ mb: 3 }}>
                    <Grid item xs={12} md={2}>
                      <Card>
                        <CardContent>
                          <Typography color="textSecondary" gutterBottom>
                            Łączna ilość
                          </Typography>
                          <Typography variant="h5" component="div">
                            {productStats.totalQuantity}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <Card>
                        <CardContent>
                          <Typography color="textSecondary" gutterBottom>
                            Średni pełny koszt/szt.
                          </Typography>
                          <Typography variant="h5" component="div">
                            {formatCurrency(productStats.avgFullUnitCost)}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <Card>
                        <CardContent>
                          <Typography color="textSecondary" gutterBottom>
                            Min. pełny koszt/szt.
                          </Typography>
                          <Typography variant="h5" component="div">
                            {formatCurrency(productStats.minFullUnitCost)}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <Card>
                        <CardContent>
                          <Typography color="textSecondary" gutterBottom>
                            Max. pełny koszt/szt.
                          </Typography>
                          <Typography variant="h5" component="div">
                            {formatCurrency(productStats.maxFullUnitCost)}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <Card>
                        <CardContent>
                          <Typography color="textSecondary" gutterBottom>
                            Łączny pełny koszt
                          </Typography>
                          <Typography variant="h5" component="div">
                            {formatCurrency(productStats.totalFullCost)}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={2}>
                      <Card>
                        <CardContent>
                          <Typography color="textSecondary" gutterBottom>
                            Liczba zamówień
                          </Typography>
                          <Typography variant="h5" component="div">
                            {productStats.orderCount}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                  </Grid>
                )}
                
                {/* Wykres kosztu produkcji w czasie */}
                {productCostHistory.length > 0 && (
                  <Grid container spacing={3} sx={{ mb: 3 }}>
                    <Grid item xs={12}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" component="h3">
                          Pełny koszt produkcji produktu w czasie
                        </Typography>
                        <Box sx={{ height: 400, mt: 2 }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={productCostHistory} margin={{ top: 5, right: 20, left: 20, bottom: 30 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis
                                dataKey="date"
                                tickFormatter={(date) => formatDateDisplay(date)}
                                label={{ value: 'Data', position: 'bottom', offset: 0 }}
                              />
                              <YAxis
                                tickFormatter={(value) => value.toFixed(2) + ' €'}
                                label={{ value: 'Pełny koszt na sztukę (€)', angle: -90, position: 'insideLeft' }}
                              />
                              <RechartsTooltip
                                formatter={(value) => [value.toFixed(2) + ' €', 'Pełny koszt na sztukę']}
                                labelFormatter={(date) => formatDateDisplay(date)}
                              />
                              <Legend verticalAlign="top" height={36} />
                              <Line
                                type="monotone"
                                dataKey="fullUnitCost"
                                name="Pełny koszt na sztukę"
                                stroke="#82ca9d"
                                strokeWidth={2}
                                dot={{ r: 4 }}
                                activeDot={{ r: 6 }}
                              />
                              {productStats && (
                                <ReferenceLine
                                  y={productStats.avgFullUnitCost}
                                  label="Średnia"
                                  stroke="#82ca9d"
                                  strokeDasharray="3 3"
                                />
                              )}
                            </LineChart>
                          </ResponsiveContainer>
                        </Box>
                      </Paper>
                    </Grid>
                    
                    <Grid item xs={12}>
                      <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" component="h3">
                          Szczegółowe dane kosztów w czasie
                        </Typography>
                        <Box sx={{ mt: 2, overflowX: 'auto' }}>
                          <TableContainer>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>Data</TableCell>
                                  <TableCell align="right">Ilość</TableCell>
                                  <TableCell align="right">Pełny koszt/szt.</TableCell>
                                  <TableCell align="right">Łączny pełny koszt</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {productCostHistory.map((entry, index) => (
                                  <TableRow key={index}>
                                    <TableCell>{formatDateDisplay(entry.date)}</TableCell>
                                    <TableCell align="right">{entry.quantity}</TableCell>
                                    <TableCell align="right">{formatCurrency(entry.fullUnitCost)}</TableCell>
                                    <TableCell align="right">{formatCurrency(entry.totalFullCost)}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </Box>
                      </Paper>
                    </Grid>
                  </Grid>
                )}
                
                {/* Tabela zamówień zawierających wybrany produkt */}
                <Paper sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <Typography variant="h6" component="h3">
                      Zamówienia klientów (CO) zawierające produkt
                    </Typography>
                  </Box>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Numer zamówienia</TableCell>
                          <TableCell>Data</TableCell>
                          <TableCell>Klient</TableCell>
                          <TableCell align="right">Ilość</TableCell>
                          <TableCell align="right">Pełny koszt/szt.</TableCell>
                          <TableCell align="right">Łączny pełny koszt</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {productOrders.map((order, index) => (
                          <TableRow key={index}>
                            <TableCell>{order.orderNumber}</TableCell>
                            <TableCell>{formatDateDisplay(order.orderDate)}</TableCell>
                            <TableCell>{order.customerName}</TableCell>
                            <TableCell align="right">{order.quantity}</TableCell>
                            <TableCell align="right">{formatCurrency(order.fullUnitCost)}</TableCell>
                            <TableCell align="right">{formatCurrency(order.totalFullCost)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </>
            ) : (
              <>
                {/* Karty ze statystykami kosztów - widok oryginalny dla wszystkich produktów */}
                <Grid container spacing={3} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={3}>
                    <Card>
                      <CardContent>
                        <Typography color="textSecondary" gutterBottom>
                          Pozycje z kosztami
                        </Typography>
                        <Typography variant="h4" component="div">
                          {costStats.totalItems}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Card>
                      <CardContent>
                        <Typography color="textSecondary" gutterBottom>
                          Łączny koszt produkcji
                        </Typography>
                        <Typography variant="h4" component="div">
                          {formatCurrency(costStats.totalProductionCost)}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Card>
                      <CardContent>
                        <Typography color="textSecondary" gutterBottom>
                          Pełny koszt produkcji
                        </Typography>
                        <Typography variant="h4" component="div">
                          {formatCurrency(costStats.totalFullProductionCost)}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Card>
                      <CardContent>
                        <Typography color="textSecondary" gutterBottom>
                          Udział w wartości zamówień
                        </Typography>
                        <Typography variant="h4" component="div">
                          {costStats.productionCostRatio.toFixed(1)}%
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
                
                {/* Tabela kosztów według produktów */}
                <Paper sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <Typography variant="h6" component="h3">
                      Koszty według produktów
                    </Typography>
                  </Box>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Produkt</TableCell>
                          <TableCell align="right">Łączna ilość</TableCell>
                          <TableCell align="right">Koszt produkcji</TableCell>
                          <TableCell align="right">Pełny koszt</TableCell>
                          <TableCell align="right">Liczba zamówień</TableCell>
                          <TableCell align="right">Średni koszt/szt.</TableCell>
                          <TableCell align="center">Akcje</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {costStats.costsByProduct.map((product, index) => (
                          <TableRow key={index}>
                            <TableCell>{product.name}</TableCell>
                            <TableCell align="right">{product.totalQuantity}</TableCell>
                            <TableCell align="right">{formatCurrency(product.totalCost)}</TableCell>
                            <TableCell align="right">{formatCurrency(product.totalFullCost)}</TableCell>
                            <TableCell align="right">{product.orderCount}</TableCell>
                            <TableCell align="right">
                              {formatCurrency(product.totalQuantity > 0 ? product.totalCost / product.totalQuantity : 0)}
                            </TableCell>
                            <TableCell align="center">
                              <Tooltip title="Pokaż szczegóły produktu">
                                <IconButton 
                                  size="small"
                                  onClick={() => setSelectedProduct(product.name)}
                                >
                                  <AssessmentIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
                
                {/* Tabela kosztów według klientów */}
                <Paper sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <Typography variant="h6" component="h3">
                      Koszty według klientów
                    </Typography>
                  </Box>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Klient</TableCell>
                          <TableCell align="right">Koszt produkcji</TableCell>
                          <TableCell align="right">Pełny koszt</TableCell>
                          <TableCell align="right">Liczba zamówień</TableCell>
                          <TableCell align="right">Liczba pozycji</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {costStats.costsByCustomer.map((customer, index) => (
                          <TableRow key={index}>
                            <TableCell>{customer.name}</TableCell>
                            <TableCell align="right">{formatCurrency(customer.totalCost)}</TableCell>
                            <TableCell align="right">{formatCurrency(customer.totalFullCost)}</TableCell>
                            <TableCell align="right">{customer.orderCount}</TableCell>
                            <TableCell align="right">{customer.itemCount}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </>
            )}
          </>
        )}
      </>
    );
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4" component="h1">
          Raporty zamówień klientów (CO)
        </Typography>
      </Box>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs 
          value={selectedTab} 
          onChange={handleTabChange} 
          aria-label="raporty co"
          sx={{
            '& .MuiTab-root': {
              fontWeight: 'bold',
              py: 2
            },
            '& .Mui-selected': {
              color: 'primary.main',
              fontWeight: 'bold'
            },
            '& .MuiTabs-indicator': {
              height: 3,
              borderTopLeftRadius: 3,
              borderTopRightRadius: 3
            }
          }}
        >
          <Tab 
            label="Raport zamówień" 
            icon={<AssessmentIcon />} 
            iconPosition="start"
            sx={{ fontSize: '1rem' }}
          />
          <Tab 
            label="Koszty produkcji"
            icon={<MoneyIcon />} 
            iconPosition="start"
            sx={{ fontSize: '1rem' }}
          />
        </Tabs>
      </Box>
      
      <Box sx={{ py: 3 }}>
        {selectedTab === 0 && <OrdersReportTab />}
        {selectedTab === 1 && <ProductionCostsTab />}
      </Box>
    </Container>
  );
};

export default COReportsPage; 