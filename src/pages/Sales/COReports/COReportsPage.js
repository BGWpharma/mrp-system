import React, { useState, useEffect } from 'react';
import { useTheme } from '@mui/material/styles';
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
  TableCell,
  Popover,
  MenuList,
  ClickAwayListener,
  Grow,
  Autocomplete,

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
  MonetizationOn as MoneyIcon,
  Link as LinkIcon,
  Clear as ClearIcon,
  GridOn as ExcelIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl } from 'date-fns/locale';
import { enUS } from 'date-fns/locale';
import { 
  format, 
  subDays, 
  subYears,
  startOfMonth, 
  endOfMonth, 
  parseISO, 
  isValid,
  isWithinInterval 
} from 'date-fns';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { getAllOrders, updateOrder, getOrdersByDateRange } from '../../../services/orderService';
import { getAllCustomers } from '../../../services/customerService';
import { getTaskById, getMultipleTasksById } from '../../../services/productionService';
import { formatCurrency } from '../../../utils/formatUtils';
import { exportToCSV, exportToPDF, exportToExcel, formatDateForExport, formatCurrencyForExport } from '../../../utils/exportUtils';
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
import { useTranslation } from '../../../hooks/useTranslation';

// Definicja okresów czasowych dla filtrowania
const TIME_PERIODS = {
  LAST_7_DAYS: 'last7days',
  LAST_30_DAYS: 'last30days',
  LAST_MONTH: 'lastMonth',
  THIS_MONTH: 'thisMonth',
  CUSTOM: 'custom'
};

// Cache dla zamówień - zwiększa wydajność przy ponownych zapytaniach
const ordersCache = {
  data: null,
  timestamp: null,
  dateRange: null,
  customerId: null,
  ttl: 5 * 60 * 1000 // 5 minut TTL
};

// Cache dla zadań produkcyjnych
const tasksCache = {
  data: new Map(),
  timestamp: null,
  ttl: 3 * 60 * 1000 // 3 minuty TTL dla zadań
};

const COReportsPage = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  const theme = useTheme();
  const { t, currentLanguage } = useTranslation();
  
  // Stan komponentu
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [selectedTab, setSelectedTab] = useState(0);
  
  // Menu eksportu
  const [exportMenuAnchor, setExportMenuAnchor] = useState(false);
  const isExportMenuOpen = Boolean(exportMenuAnchor);
  
  // Menu eksportu kosztów produkcji
  const [productionExportMenuAnchor, setProductionExportMenuAnchor] = useState(false);
  const isProductionExportMenuOpen = Boolean(productionExportMenuAnchor);
  
  // Filtry
  const [startDate, setStartDate] = useState(subYears(new Date(), 1));
  const [endDate, setEndDate] = useState(new Date());
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [reportPeriod, setReportPeriod] = useState(TIME_PERIODS.CUSTOM);
  
  // Statystyki
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalValue: 0,
    avgOrderValue: 0,
    customerStats: {},
    statusStats: {}
  });
  
  // Stan dla wybranego produktu
  const [selectedProduct, setSelectedProduct] = useState('');
  
  // Pobieranie danych - zoptymalizowane dla zakresu dat
  useEffect(() => {
    // Debugging - sprawdź faktyczne daty
    console.log('🔍 Faktyczne daty w fetchData:', {
      startDate: startDate?.toISOString().split('T')[0],
      endDate: endDate?.toISOString().split('T')[0],
      selectedCustomer
    });
    
    // Opóźnij ładowanie aby state dates były ustawione
    const timeoutId = setTimeout(() => {
      fetchData();
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, []);
  
  // Filtrowanie danych po zmianie filtrów - z inteligentną invalidacją cache
  useEffect(() => {
    if (orders.length > 0) {
      filterAndProcessData();
    }
  }, [orders, startDate, endDate, selectedCustomer]);

  // Invalidacja cache przy zmianie dat lub klienta - z debouncing
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      const dateKey = `${startDate.getTime()}_${endDate.getTime()}`;
      
      // Sprawdź czy cache trzeba invalidować
      if (ordersCache.dateRange && ordersCache.dateRange !== dateKey) {
        console.log('📅 Zmiana dat - invalidacja cache zamówień');
        ordersCache.data = null;
        ordersCache.timestamp = null;
        
        // Automatycznie pobierz nowe dane
        fetchData();
      }
      
      if (ordersCache.customerId && ordersCache.customerId !== selectedCustomer) {
        console.log('👤 Zmiana klienta - invalidacja cache zamówień');
        ordersCache.data = null;
        ordersCache.timestamp = null;
        
        // Automatycznie pobierz nowe dane  
        fetchData();
      }
    }, 300); // 300ms debounce
    
    return () => clearTimeout(timeoutId);
  }, [startDate, endDate, selectedCustomer]);
  
  // Funkcja pomocnicza do sprawdzania cache
  const getCachedOrders = async (startDate, endDate, customerId) => {
    const now = Date.now();
    const dateKey = `${startDate.getTime()}_${endDate.getTime()}`;
    
    // Sprawdź czy cache jest aktualny
    const isCacheValid = ordersCache.data &&
      ordersCache.timestamp &&
      (now - ordersCache.timestamp) < ordersCache.ttl &&
      ordersCache.dateRange === dateKey &&
      ordersCache.customerId === customerId;

    if (isCacheValid) {
      console.log('📦 Używam cache dla zamówień');
      return ordersCache.data;
    }

    console.log('🔄 Pobieranie nowych danych zamówień...');
    const filters = customerId && customerId !== 'all' ? { customerId } : {};
    let orders = await getOrdersByDateRange(startDate, endDate, 500, filters);

    // FALLBACK: Jeśli brak wyników, spróbuj z getAllOrders() jako backup
    if (orders.length === 0) {
      console.log('⚠️ getOrdersByDateRange zwróciła 0 wyników - próbuję fallback z getAllOrders()');
      const allOrders = await getAllOrders(filters);
      
      // Filtruj manualnie po datach
      orders = allOrders.filter(order => {
        if (!order.orderDate) return false;
        
        let orderDate;
        if (typeof order.orderDate === 'string') {
          orderDate = new Date(order.orderDate);
        } else if (order.orderDate?.toDate) {
          orderDate = order.orderDate.toDate();
        } else if (order.orderDate instanceof Date) {
          orderDate = order.orderDate;
        } else {
          return false;
        }
        
        return orderDate >= startDate && orderDate <= endDate;
      });
      
      console.log(`🔄 Fallback: przefiltrowano ${orders.length} zamówień z ${allOrders.length} wszystkich`);
    }

    // Zapisz w cache
    ordersCache.data = orders;
    ordersCache.timestamp = now;
    ordersCache.dateRange = dateKey;
    ordersCache.customerId = customerId;

    return orders;
  };

  // Zoptymalizowana funkcja batch sprawdzania zadań produkcyjnych
  const validateProductionTasksBatch = async (orders) => {
    // Zbierz wszystkie unikalne ID zadań
    const taskIds = [...new Set(
      orders.flatMap(order => 
        order.items?.filter(item => item.productionTaskId)
          .map(item => item.productionTaskId) || []
      )
    )];

    if (taskIds.length === 0) {
      return orders; // Brak zadań do sprawdzenia
    }

    console.log(`🚀 Sprawdzanie ${taskIds.length} zadań produkcyjnych w trybie batch...`);
    
    // Sprawdź cache zadań
    const now = Date.now();
    let validTasks = {};
    const uncachedTaskIds = [];

    for (const taskId of taskIds) {
      if (tasksCache.data.has(taskId) && 
          tasksCache.timestamp && 
          (now - tasksCache.timestamp) < tasksCache.ttl) {
        validTasks[taskId] = tasksCache.data.get(taskId);
      } else {
        uncachedTaskIds.push(taskId);
      }
    }

    // Pobierz niezcachowane zadania
    if (uncachedTaskIds.length > 0) {
      const batchTasks = await getMultipleTasksById(uncachedTaskIds);
      
      // Aktualizuj cache
      for (const [taskId, taskData] of Object.entries(batchTasks)) {
        tasksCache.data.set(taskId, taskData);
        validTasks[taskId] = taskData;
      }
      tasksCache.timestamp = now;
    }

    // Oczyść nieistniejące zadania z zamówień
    const cleanedOrders = [];
    
    for (const order of orders) {
      let orderChanged = false;
      const cleanedOrder = { ...order };
      
      if (cleanedOrder.items && Array.isArray(cleanedOrder.items)) {
        for (let i = 0; i < cleanedOrder.items.length; i++) {
          const item = cleanedOrder.items[i];
          
          if (item.productionTaskId && !validTasks[item.productionTaskId]) {
            console.log(`Czyszczę nieistniejące zadanie ${item.productionTaskId} z pozycji ${item.name} w zamówieniu ${order.orderNumber}`);
            orderChanged = true;
            
            cleanedOrder.items[i] = {
              ...item,
              productionTaskId: null,
              productionTaskNumber: null,
              productionStatus: null,
              productionCost: 0,
              fullProductionCost: 0
            };
          }
        }
      }
      
      // Aktualizuj zamówienie jeśli się zmieniło (ale nie blokuj na błędach)
      if (orderChanged) {
        try {
          const safeUpdateData = {
            items: cleanedOrder.items,
            orderNumber: cleanedOrder.orderNumber,
            orderDate: cleanedOrder.orderDate,
            status: cleanedOrder.status,
            customer: cleanedOrder.customer,
            shippingCost: cleanedOrder.shippingCost,
            totalValue: cleanedOrder.totalValue,
            additionalCostsItems: cleanedOrder.additionalCostsItems,
            productionTasks: cleanedOrder.productionTasks,
            linkedPurchaseOrders: cleanedOrder.linkedPurchaseOrders
          };
          
          // Asynchronicznie aktualizuj - nie czekaj na wynik
          updateOrder(order.id, safeUpdateData, 'system').catch(error => {
            console.error(`Błąd podczas czyszczenia zamówienia ${order.orderNumber}:`, error);
          });
        } catch (updateError) {
          console.error(`Błąd podczas przygotowania aktualizacji zamówienia ${order.orderNumber}:`, updateError);
        }
      }
      
      cleanedOrders.push(cleanedOrder);
    }

    return cleanedOrders;
  };

  // Pobieranie zamówień i klientów - ZOPTYMALIZOWANA WERSJA
  const fetchData = async () => {
    try {
      setLoading(true);
      const startTime = performance.now();
      
      // Pobierz zamówienia tylko z odpowiedniego zakresu dat (zamiast wszystkich)
      const orders = await getCachedOrders(startDate, endDate, selectedCustomer);
      
      // Batch sprawdzenie zadań produkcyjnych
      const cleanedOrders = await validateProductionTasksBatch(orders);
      
      setOrders(cleanedOrders);
      
      // Pobierz wszystkich klientów
      const allCustomers = await getAllCustomers();
      setCustomers(allCustomers || []);
      
      const endTime = performance.now();
      console.log(`⚡ fetchData zakończone w ${Math.round(endTime - startTime)}ms`);
      
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania danych:', error);
      showError('Nie udało się pobrać danych do raportu');
      setLoading(false);
    }
  };
  
  // Funkcja do filtrowania i przetwarzania danych - ZOPTYMALIZOWANA z memoizacją
  const filterAndProcessData = React.useCallback(() => {
    console.log('🔍 filterAndProcessData - rozpoczynam filtrowanie:', orders.length, 'zamówień');
    
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
    
    console.log('✅ filterAndProcessData - przefiltrowano do:', filtered.length, 'zamówień');
  }, [orders, startDate, endDate, selectedCustomer]); // Zoptymalizowane dependencies
  
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
      if (!date) return t('common.noDate');
      
      // Jeśli to timestamp z Firebase, konwertuj na Date
      let dateObj = date;
      if (typeof date === 'object' && date.toDate) {
        dateObj = date.toDate();
      } else if (!(date instanceof Date)) {
        dateObj = new Date(date);
      }
      
      // Sprawdź czy data jest prawidłowa
      if (isNaN(dateObj.getTime())) {
        return t('common.error');
      }
      
      return format(dateObj, 'dd.MM.yyyy', { locale: currentLanguage === 'pl' ? pl : enUS });
    } catch (error) {
      console.error('Błąd formatowania daty:', error, date);
      return t('common.error');
    }
  };
  
  // Obsługa menu eksportu
  const handleExportMenuOpen = (event) => {
    setExportMenuAnchor(true);
  };
  
  const handleExportMenuClose = () => {
    setExportMenuAnchor(false);
  };
  
  // Obsługa menu eksportu kosztów produkcji
  const handleProductionExportMenuOpen = (event) => {
    setProductionExportMenuAnchor(true);
  };
  
  const handleProductionExportMenuClose = () => {
    setProductionExportMenuAnchor(false);
  };
  
  // Funkcja do generowania raportu CSV
  const handleExportCSV = () => {
    handleExportMenuClose();
    
    // Definicja nagłówków dla CSV - zawsze w języku angielskim
    const headers = [
      { label: 'Order Number', key: 'orderNumber' },
      { label: 'Date', key: 'orderDate' },
      { label: 'Customer', key: 'customer.name' },
      { label: 'Status', key: 'status' },
      { label: 'Value', key: 'totalValue' },
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
    
    // Definicja nagłówków dla PDF - zawsze w języku angielskim
    const headers = [
      { label: 'Order Number', key: 'orderNumber' },
      { label: 'Date', key: 'orderDate' },
      { label: 'Customer', key: 'customer.name' },
      { label: 'Status', key: 'status' },
      { label: 'Value', key: 'totalValue' },
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
  
  // Funkcja do odświeżenia danych - ZOPTYMALIZOWANA
  const handleRefreshData = async () => {
    try {
      setLoading(true);
      showInfo('Odświeżanie danych...');
      const startTime = performance.now();
      
      // Wyczyść cache aby wymusić świeże dane
      ordersCache.data = null;
      ordersCache.timestamp = null;
      tasksCache.data.clear();
      tasksCache.timestamp = null;
      
      console.log('🗑️ Cache wyczyszczony - wymuszanie odświeżenia danych');
      
      // Pobierz zamówienia z wybranego zakresu dat (nie wszystkie)
      const refreshedOrders = await getCachedOrders(startDate, endDate, selectedCustomer);
      
      // Batch synchronizacja zadań produkcyjnych z aktualizacją kosztów
      const syncedOrders = await syncProductionTasksWithCostUpdate(refreshedOrders);
      
      setOrders(syncedOrders);
      
      // Pobierz klientów
      const allCustomers = await getAllCustomers();
      setCustomers(allCustomers || []);
      
      const endTime = performance.now();
      console.log(`⚡ handleRefreshData zakończone w ${Math.round(endTime - startTime)}ms`);
      
      setLoading(false);
      showSuccess('Dane zostały odświeżone i zsynchronizowane');
    } catch (error) {
      console.error('Błąd podczas odświeżania danych:', error);
      setLoading(false);
      showError('Nie udało się odświeżyć danych');
    }
  };

  // Zaawansowana funkcja do synchronizacji zadań z aktualizacją kosztów
  const syncProductionTasksWithCostUpdate = async (orders) => {
    // Zbierz wszystkie unikalne ID zadań
    const taskIds = [...new Set(
      orders.flatMap(order => 
        order.items?.filter(item => item.productionTaskId)
          .map(item => item.productionTaskId) || []
      )
    )];

    if (taskIds.length === 0) {
      return orders;
    }

    console.log(`🔄 Synchronizacja ${taskIds.length} zadań produkcyjnych z aktualizacją kosztów...`);
    
    // Pobierz aktualne dane zadań
    const currentTasks = await getMultipleTasksById(taskIds);
    
    // Zaktualizuj cache zadań
    for (const [taskId, taskData] of Object.entries(currentTasks)) {
      tasksCache.data.set(taskId, taskData);
    }
    tasksCache.timestamp = Date.now();

    // Synchronizuj zamówienia z aktualnymi danymi zadań
    const syncedOrders = [];
    
    for (const order of orders) {
      let orderChanged = false;
      const syncedOrder = { ...order };
      
      if (syncedOrder.items && Array.isArray(syncedOrder.items)) {
        for (let i = 0; i < syncedOrder.items.length; i++) {
          const item = syncedOrder.items[i];
          
          if (item.productionTaskId) {
            const currentTask = currentTasks[item.productionTaskId];
            
            if (!currentTask) {
              // Zadanie nie istnieje - wyczyść dane
              console.log(`Zadanie ${item.productionTaskId} nie istnieje, czyszczę dane z pozycji ${item.name} w zamówieniu ${order.orderNumber}`);
              orderChanged = true;
              
              syncedOrder.items[i] = {
                ...item,
                productionTaskId: null,
                productionTaskNumber: null,
                productionStatus: null,
                productionCost: 0,
                fullProductionCost: 0
              };
            } else {
              // Sprawdź czy dane się zmieniły
              const currentCost = item.productionCost || 0;
              const newCost = currentTask.totalMaterialCost || 0;
              const currentFullCost = item.fullProductionCost || 0;
              const newFullCost = currentTask.totalFullProductionCost || 0;
              
              if (Math.abs(currentCost - newCost) > 0.01 || 
                  Math.abs(currentFullCost - newFullCost) > 0.01 ||
                  item.productionTaskNumber !== currentTask.moNumber ||
                  item.productionStatus !== currentTask.status) {
                
                orderChanged = true;
                syncedOrder.items[i] = {
                  ...item,
                  productionTaskNumber: currentTask.moNumber,
                  productionStatus: currentTask.status,
                  productionCost: newCost,
                  fullProductionCost: newFullCost
                };
                
                console.log(`Zaktualizowano koszty dla pozycji ${item.name} w zamówieniu ${order.orderNumber}`);
              }
            }
          }
        }
      }
      
      // Asynchronicznie zaktualizuj zamówienie jeśli się zmieniło
      if (orderChanged) {
        const safeUpdateData = {
          items: syncedOrder.items,
          orderNumber: syncedOrder.orderNumber,
          orderDate: syncedOrder.orderDate,
          status: syncedOrder.status,
          customer: syncedOrder.customer,
          shippingCost: syncedOrder.shippingCost,
          totalValue: syncedOrder.totalValue,
          additionalCostsItems: syncedOrder.additionalCostsItems,
          productionTasks: syncedOrder.productionTasks,
          linkedPurchaseOrders: syncedOrder.linkedPurchaseOrders
        };
        
        // Nie czekaj na wynik zapisu - wykonaj asynchronicznie
        updateOrder(order.id, safeUpdateData, 'system').catch(error => {
          console.error(`Błąd podczas aktualizacji zamówienia ${order.orderNumber}:`, error);
        });
      }
      
      syncedOrders.push(syncedOrder);
    }

    return syncedOrders;
  };
  
  // Funkcja pomocnicza do uzyskania nazwy klienta
  const getCustomerName = (customerId) => {
    const customer = customers.find(c => c.id === customerId);
    return customer ? customer.name : 'Nieznany klient';
  };
  
  // Funkcja do otwierania zadania produkcyjnego w nowym oknie
  const openProductionTaskInNewWindow = (taskId) => {
    if (taskId) {
      const taskUrl = `/production/tasks/${taskId}`;
      window.open(window.location.origin + taskUrl, '_blank');
    }
  };
  
  // Obsługa zmiany zakładki
  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };

  // Funkcja do obliczania kosztów produkcji - ZOPTYMALIZOWANA z memoizacją
  const calculateProductionCosts = React.useCallback(() => {
    const productionCosts = [];
    
    try {
      filteredOrders.forEach(order => {
        if (order.items && Array.isArray(order.items) && order.items.length > 0) {
          order.items.forEach(item => {
            // Sprawdź, czy pozycja ma koszt produkcji I przypisane zadanie produkcyjne
            if ((item.productionCost && parseFloat(item.productionCost) > 0) || 
                (item.productionTaskId && item.productionTaskNumber)) {
              try {
                // Tylko dodaj pozycję jeśli ma rzeczywiste dane zadania produkcyjnego
                if (item.productionTaskId && item.productionTaskNumber && item.productionTaskNumber !== 'N/A') {
                  // Sprawdź status zadania produkcyjnego - uwzględniaj tylko zadania "Zakończone"
                  const taskData = tasksCache.data.get(item.productionTaskId);
                  const taskStatus = taskData?.status || item.productionStatus;
                  
                  // Pomiń zadania, które nie mają statusu "Zakończone"
                  if (taskStatus !== 'Zakończone') {
                    return; // Pomiń tę pozycję
                  }
                  
                  const quantity = parseFloat(item.quantity) || 0;
                  const fullProductionUnitCost = parseFloat(item.fullProductionUnitCost || 0);
                  const totalFullProductionCost = quantity * parseFloat(item.fullProductionUnitCost || item.fullProductionCost || 0);
                  
                  // Oblicz rzeczywisty czas produkcji z sesji produkcyjnych
                  let actualProductionTime = 0;
                  if (taskData && taskData.productionSessions && Array.isArray(taskData.productionSessions)) {
                    actualProductionTime = taskData.productionSessions.reduce((total, session) => {
                      return total + (parseFloat(session.timeSpent) || 0);
                    }, 0);
                  }
                  
                  // Filtruj pozycje z zerowymi kosztami - pomiń jeśli pełny koszt jednostkowy i łączny pełny koszt to 0
                  if (fullProductionUnitCost > 0 || totalFullProductionCost > 0) {
                    productionCosts.push({
                      orderId: order.id,
                      orderNumber: order.orderNumber || order.id,
                      orderDate: order.orderDate,
                      customerName: order.customer?.name || 'Nieznany klient',
                      itemName: item.name || 'Produkt bez nazwy',
                      quantity: quantity,
                      unit: item.unit || 'szt.',
                      productionTaskId: item.productionTaskId,
                      productionTaskNumber: item.productionTaskNumber,
                      productionCost: parseFloat(item.productionCost || 0),
                      fullProductionCost: parseFloat(item.fullProductionCost || 0),
                      unitProductionCost: parseFloat(item.productionUnitCost || 0),
                      fullProductionUnitCost: fullProductionUnitCost,
                      totalItemValue: quantity * (parseFloat(item.price) || 0),
                      totalProductionCost: quantity * parseFloat(item.productionUnitCost || item.productionCost || 0),
                      totalFullProductionCost: totalFullProductionCost,
                      actualProductionTimeMinutes: actualProductionTime,
                      actualProductionTimeHours: actualProductionTime > 0 ? (actualProductionTime / 60).toFixed(2) : 0
                    });
                  }
                }
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
  }, [filteredOrders, selectedProduct, tasksCache]); // Zoptymalizowane dependencies + tasksCache dla czasu produkcji

  // Funkcja do obliczania statystyk kosztów produkcji - ZOPTYMALIZOWANA z memoizacją
  const calculateProductionCostStats = React.useCallback((productionCosts) => {
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
  }, []); // Bez zależności - czysta funkcja kalkulacyjna

  // Komponent zakładki "Raport zamówień"
  const OrdersReportTab = () => (
    <>
      {/* Nagłówek z przyciskami Export i Odśwież */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h6" component="h2">
          {t('coReports.tabs.ordersReport')}
        </Typography>
        
        <Box>
          <Box sx={{ position: 'relative', display: 'inline-block' }}>
            <Button
              variant="outlined"
              color="primary"
              onClick={handleExportMenuOpen}
              startIcon={<DownloadIcon />}
              endIcon={<ArrowDownIcon />}
              sx={{ mr: 1 }}
            >
              {t('coReports.common.export')}
            </Button>
            {isExportMenuOpen && (
              <ClickAwayListener onClickAway={handleExportMenuClose}>
                <Paper
                  sx={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    zIndex: 1000,
                    minWidth: 200,
                    mt: 0.5
                  }}
                  elevation={3}
                >
                  <MenuList>
                    <MenuItem onClick={handleExportPDF}>
                      <ListItemIcon>
                        <PdfIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText>{t('coReports.common.exportAsPdf')}</ListItemText>
                    </MenuItem>
                    <MenuItem onClick={handleExportCSV}>
                      <ListItemIcon>
                        <CsvIcon fontSize="small" />
                      </ListItemIcon>
                      <ListItemText>{t('coReports.common.exportAsCsv')}</ListItemText>
                    </MenuItem>
                  </MenuList>
                </Paper>
              </ClickAwayListener>
            )}
          </Box>
          
          <Tooltip title={t('coReports.common.refreshData')}>
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
              <InputLabel>{t('coReports.filters.period.label')}</InputLabel>
              <Select
                value={reportPeriod}
                onChange={handlePeriodChange}
                label={t('coReports.filters.period.label')}
              >
                <MenuItem value={TIME_PERIODS.LAST_7_DAYS}>{t('coReports.filters.period.last7days')}</MenuItem>
                <MenuItem value={TIME_PERIODS.LAST_30_DAYS}>{t('coReports.filters.period.last30days')}</MenuItem>
                <MenuItem value={TIME_PERIODS.LAST_MONTH}>{t('coReports.filters.period.lastMonth')}</MenuItem>
                <MenuItem value={TIME_PERIODS.THIS_MONTH}>{t('coReports.filters.period.thisMonth')}</MenuItem>
                <MenuItem value={TIME_PERIODS.CUSTOM}>{t('coReports.filters.period.custom')}</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={3}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
              <DatePicker
                label={t('coReports.filters.startDate')}
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
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
              <DatePicker
                label={t('coReports.filters.endDate')}
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
              <InputLabel>{t('coReports.filters.customer.label')}</InputLabel>
              <Select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                label={t('coReports.filters.customer.label')}
              >
                <MenuItem value="all">{t('coReports.filters.customer.all')}</MenuItem>
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
        {t('coReports.periodRange', { start: formatDateDisplay(startDate), end: formatDateDisplay(endDate) })}
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
        title={t('coReports.customerStats.title')} 
      />
      
      {/* Statystyki według statusu */}
      <StatusStatsComponent 
        statusStats={stats.statusStats} 
        totalValue={stats.totalValue}
        loading={loading} 
        title={t('coReports.statusStats.title')} 
      />
      
      {/* Lista zamówień */}
      <COReportComponent 
        orders={filteredOrders} 
        loading={loading} 
        title={t('coReports.ordersList.title')} 
      />
    </>
  );

  // Komponent zakładki "Koszty produkcji" - ZOPTYMALIZOWANY
  const ProductionCostsTab = () => {
    // Memoizacja kosztownych obliczeń - przeliczaj tylko gdy zmienią się dane
    const productionCosts = React.useMemo(() => {
      return calculateProductionCosts();
    }, [calculateProductionCosts]);
    
    const costStats = React.useMemo(() => {
      return calculateProductionCostStats(productionCosts);
    }, [productionCosts, calculateProductionCostStats]);
    
    // Stan dla danych historycznych kosztów wybranego produktu
    const [productCostHistory, setProductCostHistory] = useState([]);
    // Stan dla informacji o zamówieniach zawierających wybrany produkt
    const [productOrders, setProductOrders] = useState([]);
    
    // Efekt do obliczania danych historycznych dla wybranego produktu
    useEffect(() => {
      if (productionCosts.length > 0) {
        // Filtruj koszty produkcji dla wybranego produktu
        const filteredCosts = productionCosts.filter(item => item.itemName === selectedProduct);
        
        // Przygotuj dane historyczne jako indywidualne pozycje (nie grupuj)
        const historyData = filteredCosts.map(item => {
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
          
          // Pobierz dane zadania z cache, aby uzyskać rzeczywisty czas produkcji
          const taskData = tasksCache.data.get(item.productionTaskId);
          let actualProductionTime = 0;
          
          if (taskData && taskData.productionSessions && Array.isArray(taskData.productionSessions)) {
            // Oblicz całkowity czas produkcji z wszystkich sesji (timeSpent jest w minutach)
            actualProductionTime = taskData.productionSessions.reduce((total, session) => {
              return total + (parseFloat(session.timeSpent) || 0);
            }, 0);
          }
          
          return {
            date: orderDate,
            orderNumber: item.orderNumber,
            customerName: item.customerName,
            quantity: item.quantity,
            fullUnitCost: item.fullProductionUnitCost || (item.quantity > 0 ? item.fullProductionCost / item.quantity : 0),
            totalFullCost: item.totalFullProductionCost,
            productionTaskId: item.productionTaskId,
            productionTaskNumber: item.productionTaskNumber,
            actualProductionTimeMinutes: actualProductionTime,
            actualProductionTimeHours: actualProductionTime > 0 ? (actualProductionTime / 60).toFixed(2) : 0
          };
        }).sort((a, b) => a.date - b.date);
        
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
              totalFullCost: item.totalFullProductionCost,
              productionTaskId: item.productionTaskId,
              productionTaskNumber: item.productionTaskNumber
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
    const productStats = React.useMemo(() => {
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
    }, [selectedProduct, productionCosts]);
    
    // Funkcja do eksportu kosztów produkcji do CSV z filtrem produktu
    const handleExportProductionCostsCSVLocal = () => {
      console.log('🔍 Export CSV - selectedProduct before close:', selectedProduct);
      handleProductionExportMenuClose();
      console.log('🔍 Export CSV - selectedProduct after close:', selectedProduct);
      
      let dataToExport = productionCosts;
      
      // Jeśli wybrano konkretny produkt, filtruj dane
      if (selectedProduct) {
        dataToExport = productionCosts.filter(item => item.itemName === selectedProduct);
        console.log('🔍 Export CSV - filtering for product:', selectedProduct, 'found items:', dataToExport.length);
      } else {
        console.log('🔍 Export CSV - no product selected, exporting all data');
      }
      
      if (dataToExport.length === 0) {
        showError(t('coReports.productionCosts.noDataToExport'));
        return;
      }

      // Definicja nagłówków dla CSV - zawsze w języku angielskim
      const headers = [
        { label: 'Order Number', key: 'orderNumber' },
        { label: 'Date', key: 'orderDate' },
        { label: 'Customer', key: 'customerName' },
        { label: 'Product', key: 'itemName' },
        { label: 'Quantity', key: 'quantity' },
        { label: 'pcs', key: 'unit' },
        { label: 'Base Materials Cost/Unit', key: 'fullProductionUnitCost' },
        { label: 'Materials Cost', key: 'totalProductionCost' },
        { label: 'Base Materials Cost', key: 'totalFullProductionCost' },
        { label: 'MO', key: 'productionTaskNumber' },
        { label: 'Production Time (h)', key: 'actualProductionTimeHours' }
      ];
      
      // Przygotuj dane do eksportu
      const exportData = dataToExport.map(item => ({
        ...item,
        orderDate: formatDateForExport(item.orderDate),
        unitProductionCost: formatCurrencyForExport(item.unitProductionCost),
        fullProductionUnitCost: formatCurrencyForExport(item.fullProductionUnitCost),
        totalProductionCost: formatCurrencyForExport(item.totalProductionCost),
        totalFullProductionCost: formatCurrencyForExport(item.totalFullProductionCost),
        productionTaskNumber: item.productionTaskNumber || 'N/A',
        actualProductionTimeHours: item.actualProductionTimeHours > 0 ? item.actualProductionTimeHours : '-'
      }));
      
      // Wygeneruj plik CSV z nazwą uwzględniającą filtr produktu
      const productSuffix = selectedProduct ? `_${selectedProduct.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
      const filename = `production_costs_report${productSuffix}_${formatDateForExport(new Date(), 'yyyyMMdd')}`;
      const success = exportToCSV(exportData, headers, filename);
      
      if (success) {
        const message = selectedProduct 
          ? t('coReports.messages.productionCsvSuccessForProduct', { product: selectedProduct })
          : t('coReports.messages.productionCsvSuccess');
        showSuccess(message);
      } else {
        showError(t('coReports.messages.productionCsvError'));
      }
    };

    // Funkcja do eksportu kosztów produkcji do PDF z filtrem produktu
    const handleExportProductionCostsPDFLocal = () => {
      handleProductionExportMenuClose();
      
      let dataToExport = productionCosts;
      
      // Jeśli wybrano konkretny produkt, filtruj dane
      if (selectedProduct) {
        dataToExport = productionCosts.filter(item => item.itemName === selectedProduct);
      }
      
      if (dataToExport.length === 0) {
        showError(t('coReports.productionCosts.noDataToExport'));
        return;
      }

      const filteredCostStats = calculateProductionCostStats(dataToExport);

      // Definicja nagłówków dla PDF - zawsze w języku angielskim
      const headers = [
        { label: 'Order Number', key: 'orderNumber' },
        { label: 'Date', key: 'orderDate' },
        { label: 'Customer', key: 'customerName' },
        { label: 'Product', key: 'itemName' },
        { label: 'Quantity', key: 'quantity' },
        { label: 'Base Materials Cost/Unit', key: 'fullProductionUnitCost' },
        { label: 'Base Materials Cost', key: 'totalFullProductionCost' },
        { label: 'MO', key: 'productionTaskNumber' }
      ];
      
      // Przygotuj dane do eksportu
      const exportData = dataToExport.map(item => ({
        ...item,
        orderDate: formatDateForExport(item.orderDate),
        unitProductionCost: formatCurrencyForExport(item.unitProductionCost),
        fullProductionUnitCost: formatCurrencyForExport(item.fullProductionUnitCost),
        totalProductionCost: formatCurrencyForExport(item.totalProductionCost),
        totalFullProductionCost: formatCurrencyForExport(item.totalFullProductionCost),
        productionTaskNumber: item.productionTaskNumber || 'N/A'
      }));
      
      // Utwórz datę i zakres filtrowania jako podtytuł
      const dateRange = `${formatDateForExport(startDate)} - ${formatDateForExport(endDate)}`;
      const customerFilter = selectedCustomer !== 'all' 
        ? `, Customer: ${getCustomerName(selectedCustomer)}` 
        : '';
      const productFilter = selectedProduct ? `, Product: ${selectedProduct}` : '';
      
      // Opcje dla eksportu PDF - zawsze w języku angielskim
      const pdfOptions = {
        title: 'Production Costs Report',
        subtitle: `Date range: ${dateRange}${customerFilter}${productFilter}`,
        footerText: `Generated on: ${new Date().toLocaleString()} | Items: ${filteredCostStats.totalItems} | Total Base Materials Cost: ${formatCurrency(filteredCostStats.totalFullProductionCost)}`
      };
      
      // Wygeneruj plik PDF z nazwą uwzględniającą filtr produktu
      const productSuffix = selectedProduct ? `_${selectedProduct.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
      const filename = `production_costs_report${productSuffix}_${formatDateForExport(new Date(), 'yyyyMMdd')}`;
      const success = exportToPDF(exportData, headers, filename, pdfOptions);
      
      if (success) {
        const message = selectedProduct 
          ? t('coReports.messages.productionPdfSuccessForProduct', { product: selectedProduct })
          : t('coReports.messages.productionPdfSuccess');
        showSuccess(message);
      } else {
        showError(t('coReports.messages.productionPdfError'));
      }
    };

    // Funkcja do eksportu kosztów produkcji do Excel z osobną zakładką dla każdego CO
    const handleExportProductionCostsToExcel = () => {
      handleProductionExportMenuClose();
      
      let dataToExport = productionCosts;
      
      // Jeśli wybrano konkretny produkt, filtruj dane
      if (selectedProduct) {
        dataToExport = productionCosts.filter(item => item.itemName === selectedProduct);
      }
      
      if (dataToExport.length === 0) {
        showError(t('coReports.productionCosts.noDataToExport'));
        return;
      }

      // Grupuj dane według numeru zamówienia (CO)
      const dataByOrder = {};
      dataToExport.forEach(item => {
        const orderNumber = item.orderNumber || 'Unknown';
        if (!dataByOrder[orderNumber]) {
          dataByOrder[orderNumber] = [];
        }
        dataByOrder[orderNumber].push(item);
      });

      // Nagłówki dla Excel - zawsze w języku angielskim
      const headers = [
        { label: 'Date', key: 'orderDate' },
        { label: 'Customer', key: 'customerName' },
        { label: 'Product', key: 'itemName' },
        { label: 'Quantity', key: 'quantity' },
        { label: 'pcs', key: 'unit' },
        { label: 'Base Materials Cost/Unit', key: 'fullProductionUnitCost' },
        { label: 'Materials Cost', key: 'totalProductionCost' },
        { label: 'Base Materials Cost', key: 'totalFullProductionCost' },
        { label: 'MO', key: 'productionTaskNumber' },
        { label: 'Production Time (h)', key: 'actualProductionTimeHours' }
      ];

      // Przygotuj worksheets - jeden dla każdego zamówienia
      const worksheets = Object.keys(dataByOrder).sort().map(orderNumber => {
        const orderData = dataByOrder[orderNumber].map(item => ({
          ...item,
          orderDate: formatDateForExport(item.orderDate),
          fullProductionUnitCost: formatCurrencyForExport(item.fullProductionUnitCost),
          totalProductionCost: formatCurrencyForExport(item.totalProductionCost),
          totalFullProductionCost: formatCurrencyForExport(item.totalFullProductionCost),
          productionTaskNumber: item.productionTaskNumber || 'N/A',
          actualProductionTimeHours: item.actualProductionTimeHours > 0 ? item.actualProductionTimeHours : '-'
        }));

        return {
          name: orderNumber, // Nazwa zakładki to numer zamówienia
          data: orderData,
          headers: headers
        };
      });

      // Wygeneruj plik Excel
      const productSuffix = selectedProduct ? `_${selectedProduct.replace(/[^a-zA-Z0-9]/g, '_')}` : '';
      const filename = `production_costs_by_order${productSuffix}_${formatDateForExport(new Date(), 'yyyyMMdd')}`;
      const success = exportToExcel(worksheets, filename);

      if (success) {
        const message = selectedProduct 
          ? `Excel file generated successfully for product: ${selectedProduct} (${worksheets.length} orders)`
          : `Excel file generated successfully (${worksheets.length} orders, each in separate tab)`;
        showSuccess(message);
      } else {
        showError('Failed to generate Excel file.');
      }
    };

    return (
      <>
        {/* Nagłówek z przyciskami Export i Odśwież */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6" component="h2">
            {t('coReports.productionCosts.title')}
          </Typography>
          
          <Box>
            <Box sx={{ position: 'relative', display: 'inline-block' }}>
              <Button
                variant="outlined"
                color="primary"
                onClick={handleProductionExportMenuOpen}
                startIcon={<DownloadIcon />}
                endIcon={<ArrowDownIcon />}
                sx={{ mr: 1 }}
              >
                Export
              </Button>
              {isProductionExportMenuOpen && (
                <ClickAwayListener onClickAway={handleProductionExportMenuClose}>
                  <Paper
                    sx={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      zIndex: 1000,
                      minWidth: 200,
                      mt: 0.5
                    }}
                    elevation={3}
                  >
                    <MenuList>
                      <MenuItem onClick={handleExportProductionCostsPDFLocal}>
                        <ListItemIcon>
                          <PdfIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>Export as PDF</ListItemText>
                      </MenuItem>
                      <MenuItem onClick={handleExportProductionCostsCSVLocal}>
                        <ListItemIcon>
                          <CsvIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>Export as CSV</ListItemText>
                      </MenuItem>
                      <MenuItem onClick={handleExportProductionCostsToExcel}>
                        <ListItemIcon>
                          <ExcelIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>Export to Excel (by CO)</ListItemText>
                      </MenuItem>
                    </MenuList>
                  </Paper>
                </ClickAwayListener>
              )}
            </Box>
            
              <Tooltip title={t('coReports.common.refreshData')}>
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
                <InputLabel>{t('coReports.filters.period.label')}</InputLabel>
                <Select
                  value={reportPeriod}
                  onChange={handlePeriodChange}
                  label={t('coReports.filters.period.label')}
                >
                  <MenuItem value={TIME_PERIODS.LAST_7_DAYS}>{t('coReports.filters.period.last7days')}</MenuItem>
                  <MenuItem value={TIME_PERIODS.LAST_30_DAYS}>{t('coReports.filters.period.last30days')}</MenuItem>
                  <MenuItem value={TIME_PERIODS.LAST_MONTH}>{t('coReports.filters.period.lastMonth')}</MenuItem>
                  <MenuItem value={TIME_PERIODS.THIS_MONTH}>{t('coReports.filters.period.thisMonth')}</MenuItem>
                  <MenuItem value={TIME_PERIODS.CUSTOM}>{t('coReports.filters.period.custom')}</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={3}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                <DatePicker
                  label={t('coReports.filters.startDate')}
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
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                <DatePicker
                  label={t('coReports.filters.endDate')}
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
                <InputLabel>{t('coReports.filters.customer.label')}</InputLabel>
                <Select
                  value={selectedCustomer}
                  onChange={(e) => setSelectedCustomer(e.target.value)}
                  label={t('coReports.filters.customer.label')}
                >
                  <MenuItem value="all">{t('coReports.filters.customer.all')}</MenuItem>
                  {customers.map(customer => (
                    <MenuItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Autocomplete
                  fullWidth
                  value={selectedProduct || null}
                  onChange={(event, newValue) => {
                    setSelectedProduct(newValue || '');
                  }}
                  options={['', ...costStats.costsByProduct.map(product => product.name)]}
                  getOptionLabel={(option) => option === '' ? t('coReports.productionCosts.allProducts') : option}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label={t('coReports.productionCosts.selectProduct')}
                      placeholder={t('coReports.productionCosts.selectProduct')}
                    />
                  )}
                  isOptionEqualToValue={(option, value) => option === value}
                  noOptionsText={t('common.noOptions')}
                />
                {selectedProduct && (
                  <Tooltip title={t('coReports.productionCosts.backToAllProducts')}>
                    <IconButton 
                      onClick={() => setSelectedProduct('')}
                      color="primary"
                      sx={{ minWidth: '48px' }}
                    >
                      <ClearIcon />
                    </IconButton>
                  </Tooltip>
                )}
              </Box>
            </Grid>
          </Grid>
        </Paper>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', py: 8 }}>
            <CircularProgress size={60} />
          </Box>
        ) : productionCosts.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
            <MoneyIcon sx={{ fontSize: '4rem', color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {t('coReports.productionCosts.empty.title')}
            </Typography>
            <Typography variant="body1" color="text.secondary">
              {t('coReports.productionCosts.empty.description')}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {t('coReports.productionCosts.empty.hint')}
            </Typography>
          </Box>
        ) : (
          <>
            {/* Nagłówek z datami */}
            <Typography variant="subtitle1" gutterBottom>
              {t('coReports.productionCosts.periodRange', { start: formatDateDisplay(startDate), end: formatDateDisplay(endDate) })}
            </Typography>
            
            {selectedProduct && (
              <>
                {/* Karta ze statystykami dla wybranego produktu */}
                <Typography variant="h6" component="h3" sx={{ mb: 2 }}>
                  {t('coReports.productionCosts.productStats.titleFor', { product: selectedProduct })}
                </Typography>
                
                {productStats && (
                  <Grid container spacing={3} sx={{ mb: 3 }}>
                    <Grid item xs={12} md={3}>
                      <Card>
                        <CardContent>
                          <Typography color="textSecondary" gutterBottom>
                            {t('coReports.productionCosts.productStats.avgFullUnitCost')}
                          </Typography>
                          <Typography variant="h5" component="div">
                            {formatCurrency(productStats.avgFullUnitCost)}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Card>
                        <CardContent>
                          <Typography color="textSecondary" gutterBottom>
                            {t('coReports.productionCosts.productStats.minFullUnitCost')}
                          </Typography>
                          <Typography variant="h5" component="div">
                            {formatCurrency(productStats.minFullUnitCost)}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Card>
                        <CardContent>
                          <Typography color="textSecondary" gutterBottom>
                            {t('coReports.productionCosts.productStats.maxFullUnitCost')}
                          </Typography>
                          <Typography variant="h5" component="div">
                            {formatCurrency(productStats.maxFullUnitCost)}
                          </Typography>
                        </CardContent>
                      </Card>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Card>
                        <CardContent>
                          <Typography color="textSecondary" gutterBottom>
                            {t('coReports.cards.totalOrders')}
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
                      <Paper sx={{ 
                        p: 3, 
                        background: theme.palette.mode === 'dark' 
                          ? 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'
                          : 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)',
                        borderRadius: 2
                      }}>
                        <Typography variant="h6" component="h3" sx={{ 
                          mb: 2, 
                          color: theme.palette.text.primary,
                          fontWeight: 'bold',
                          textAlign: 'center'
                        }}>
                          {t('coReports.productionCosts.chart.title')}
                        </Typography>
                        <Box sx={{ 
                          height: 450, 
                          mt: 2,
                          background: theme.palette.background.paper,
                          borderRadius: 2,
                          p: 2,
                          boxShadow: theme.palette.mode === 'dark' 
                            ? 'inset 0 2px 8px rgba(0, 0, 0, 0.25)' 
                            : 'inset 0 2px 8px rgba(0, 0, 0, 0.05)'
                        }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart 
                              data={productCostHistory} 
                              margin={{ top: 20, right: 30, left: 20, bottom: 50 }}
                            >
                              <defs>
                                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="#82ca9d" stopOpacity={0.8}/>
                                  <stop offset="95%" stopColor="#82ca9d" stopOpacity={0.1}/>
                                </linearGradient>
                              </defs>
                              <CartesianGrid 
                                strokeDasharray="3 3" 
                                stroke={theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : '#e8e8e8'} 
                              />
                              <XAxis
                                dataKey="date"
                                tickFormatter={(date) => formatDateDisplay(date)}
                                tick={{ 
                                  fontSize: 12, 
                                  fill: theme.palette.text.secondary 
                                }}
                                axisLine={{ 
                                  stroke: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : '#ddd' 
                                }}
                                tickLine={{ 
                                  stroke: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : '#ddd' 
                                }}
                              />
                              <YAxis
                                tickFormatter={(value) => value.toFixed(2) + ' €'}
                                tick={{ 
                                  fontSize: 12, 
                                  fill: theme.palette.text.secondary 
                                }}
                                axisLine={{ 
                                  stroke: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : '#ddd' 
                                }}
                                tickLine={{ 
                                  stroke: theme.palette.mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : '#ddd' 
                                }}
                                label={{ 
                                  value: t('coReports.productionCosts.chart.yAxisLabel'), 
                                  angle: -90, 
                                  position: 'insideLeft',
                                  style: { 
                                    textAnchor: 'middle', 
                                    fill: theme.palette.text.secondary 
                                  }
                                }}
                              />
                              <RechartsTooltip
                                formatter={(value) => [value.toFixed(2) + ' €', t('coReports.productionCosts.chart.tooltipFullCostPerUnit')]}
                                labelFormatter={(date) => formatDateDisplay(date)}
                                contentStyle={{
                                  backgroundColor: theme.palette.mode === 'dark' 
                                    ? 'rgba(30, 41, 59, 0.95)' 
                                    : 'rgba(255, 255, 255, 0.95)',
                                  border: '1px solid #82ca9d',
                                  borderRadius: '8px',
                                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                                  color: theme.palette.text.primary
                                }}
                              />
                              <Line
                                type="monotone"
                                dataKey="fullUnitCost"
                                name={t('coReports.productionCosts.chart.seriesFullCostPerUnit')}
                                stroke="#82ca9d"
                                strokeWidth={3}
                                dot={{ 
                                  r: 5, 
                                  fill: '#82ca9d',
                                  strokeWidth: 2,
                                  stroke: theme.palette.background.paper
                                }}
                                activeDot={{ 
                                  r: 8,
                                  fill: '#82ca9d',
                                  strokeWidth: 3,
                                  stroke: theme.palette.background.paper,
                                  boxShadow: '0 0 10px rgba(130, 202, 157, 0.5)'
                                }}
                              />
                              {productStats && (
                                <ReferenceLine
                                  y={productStats.avgFullUnitCost}
                                  label={{ 
                                    value: t('coReports.common.average'), 
                                    position: "topRight",
                                    style: { 
                                      fill: theme.palette.text.secondary, 
                                      fontWeight: 'bold' 
                                    }
                                  }}
                                  stroke="#ff7c7c"
                                  strokeDasharray="5 5"
                                  strokeWidth={2}
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
                          {t('coReports.productionCosts.detailsOverTime')}
                        </Typography>
                        <Box sx={{ mt: 2, overflowX: 'auto' }}>
                          <TableContainer>
                            <Table size="small">
                              <TableHead>
                                <TableRow>
                                  <TableCell>{t('coReports.table.date')}</TableCell>
                                  <TableCell>{t('coReports.table.orderNumber')}</TableCell>
                                  <TableCell>{t('coReports.table.customer')}</TableCell>
                                  <TableCell align="right">{t('coReports.table.quantity')}</TableCell>
                                  <TableCell align="right">{t('coReports.table.fullCostPerUnit')}</TableCell>
                                  <TableCell align="right">{t('coReports.table.totalFullCost')}</TableCell>
                                  <TableCell>MO</TableCell>
                                  <TableCell align="right">{t('coReports.table.productionTime')}</TableCell>
                                  <TableCell align="center">{t('coReports.table.actions')}</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {productCostHistory.map((entry, index) => (
                                  <TableRow key={index}>
                                    <TableCell>{formatDateDisplay(entry.date)}</TableCell>
                                    <TableCell>{entry.orderNumber}</TableCell>
                                    <TableCell>{entry.customerName}</TableCell>
                                    <TableCell align="right">{entry.quantity}</TableCell>
                                    <TableCell align="right">{formatCurrency(entry.fullUnitCost)}</TableCell>
                                    <TableCell align="right">{formatCurrency(entry.totalFullCost)}</TableCell>
                                    <TableCell>{entry.productionTaskNumber || '-'}</TableCell>
                                    <TableCell align="right">
                                      {entry.actualProductionTimeHours > 0 ? `${entry.actualProductionTimeHours} h` : '-'}
                                    </TableCell>
                                    <TableCell align="center">
                                      {entry.productionTaskId && (
                                        <Tooltip title="Otwórz zadanie produkcyjne w nowym oknie">
                                          <IconButton 
                                            size="small"
                                            onClick={() => openProductionTaskInNewWindow(entry.productionTaskId)}
                                            color="primary"
                                          >
                                            <LinkIcon fontSize="small" />
                                          </IconButton>
                                        </Tooltip>
                                      )}
                                    </TableCell>
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
                      {t('coReports.productionCosts.ordersContainingProduct')}
                    </Typography>
                  </Box>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{t('coReports.table.orderNumber')}</TableCell>
                          <TableCell>{t('coReports.table.date')}</TableCell>
                          <TableCell>{t('coReports.table.customer')}</TableCell>
                          <TableCell align="right">{t('coReports.table.quantity')}</TableCell>
                          <TableCell align="right">{t('coReports.table.fullCostPerUnit')}</TableCell>
                          <TableCell align="right">{t('coReports.table.totalFullCost')}</TableCell>
                          <TableCell>MO</TableCell>
                          <TableCell align="center">{t('coReports.table.actions')}</TableCell>
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
                            <TableCell>{order.productionTaskNumber || '-'}</TableCell>
                            <TableCell align="center">
                              {order.productionTaskId && (
                                <Tooltip title="Otwórz zadanie produkcyjne w nowym oknie">
                                  <IconButton 
                                    size="small"
                                    onClick={() => openProductionTaskInNewWindow(order.productionTaskId)}
                                    color="primary"
                                  >
                                    <LinkIcon fontSize="small" />
                                  </IconButton>
                                </Tooltip>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </>
            )}
            
            {!selectedProduct && (
              <>
                {/* Karty ze statystykami kosztów - widok oryginalny dla wszystkich produktów */}
                <Grid container spacing={3} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={4}>
                    <Card>
                      <CardContent>
                        <Typography color="textSecondary" gutterBottom>
                          {t('coReports.productionCosts.cards.itemsWithCosts')}
                        </Typography>
                        <Typography variant="h4" component="div">
                          {costStats.totalItems}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card>
                      <CardContent>
                        <Typography color="textSecondary" gutterBottom>
                          {t('coReports.productionCosts.cards.totalProductionCost')}
                        </Typography>
                        <Typography variant="h4" component="div">
                          {formatCurrency(costStats.totalProductionCost)}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card>
                      <CardContent>
                        <Typography color="textSecondary" gutterBottom>
                          {t('coReports.productionCosts.cards.totalFullProductionCost')}
                        </Typography>
                        <Typography variant="h4" component="div">
                          {formatCurrency(costStats.totalFullProductionCost)}
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
                
                {/* Tabela kosztów według produktów */}
                <Paper sx={{ mb: 3 }}>
                  <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                    <Typography variant="h6" component="h3">
                      {t('coReports.productionCosts.byProduct.title')}
                    </Typography>
                  </Box>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{t('coReports.table.product')}</TableCell>
                          <TableCell align="right">{t('coReports.table.totalQuantity')}</TableCell>
                          <TableCell align="right">{t('coReports.table.productionCost')}</TableCell>
                          <TableCell align="right">{t('coReports.table.fullCost')}</TableCell>
                          <TableCell align="right">{t('coReports.table.ordersCount')}</TableCell>
                          <TableCell align="right">{t('coReports.table.fullCostPerUnit')}</TableCell>
                          <TableCell align="center">{t('coReports.table.actions')}</TableCell>
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
                              {formatCurrency(product.totalQuantity > 0 ? product.totalFullCost / product.totalQuantity : 0)}
                            </TableCell>
                            <TableCell align="center">
                              <Tooltip title={t('coReports.productionCosts.byProduct.showProductDetails')}>
                                <IconButton 
                                  size="small"
                                  onClick={() => {
                                    setSelectedProduct(product.name);
                                  }}
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
                      {t('coReports.productionCosts.byCustomer.title')}
                    </Typography>
                  </Box>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{t('coReports.table.customer')}</TableCell>
                          <TableCell align="right">{t('coReports.table.productionCost')}</TableCell>
                          <TableCell align="right">{t('coReports.table.fullCost')}</TableCell>
                          <TableCell align="right">{t('coReports.table.ordersCount')}</TableCell>
                          <TableCell align="right">{t('coReports.table.itemsCount')}</TableCell>
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
          {t('coReports.title')}
        </Typography>
      </Box>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs 
          value={selectedTab} 
          onChange={handleTabChange} 
          aria-label={t('coReports.aria.tabs')}
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
            label={t('coReports.tabs.productionCosts')}
            icon={<MoneyIcon />} 
            iconPosition="start"
            sx={{ fontSize: '1rem' }}
          />
          <Tab 
            label={t('coReports.tabs.ordersReport')} 
            icon={<AssessmentIcon />} 
            iconPosition="start"
            sx={{ fontSize: '1rem' }}
          />
        </Tabs>
      </Box>
      
      <Box sx={{ py: 3 }}>
        {selectedTab === 0 && <ProductionCostsTab />}
        {selectedTab === 1 && <OrdersReportTab />}
      </Box>
    </Container>
  );
};

export default COReportsPage; 