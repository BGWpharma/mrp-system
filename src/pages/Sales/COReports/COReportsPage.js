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
  Chip,
  Checkbox,

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
  GridOn as ExcelIcon,
  AccountBalance as AccountBalanceIcon,
  ExpandMore as ExpandMoreIcon,
  ChevronRight as ChevronRightIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  ShoppingCart as ShoppingCartIcon,
  Factory as FactoryIcon,
  LocalShipping as LocalShippingIcon,
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
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../../services/firebase/config';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { getAllOrders, updateOrder, getOrdersByDateRange } from '../../../services/orders';
import { getAllCustomers } from '../../../services/crm';
import { getTaskById, getMultipleTasksById, getTasksWithCosts } from '../../../services/production/productionService';
import { getAllInventoryItems } from '../../../services/inventory/inventoryItemsService';
import { formatCurrency } from '../../../utils/formatting';
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
import { useTranslation } from '../../../hooks/useTranslation';
import CashflowTab from './CashflowTab';

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
  const { t, currentLanguage } = useTranslation('orders');
  
  // Stan komponentu
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState([]);
  const [allOrdersForLinking, setAllOrdersForLinking] = useState([]); // NOWE: wszystkie zamówienia dla linkowania z MO
  const [customers, setCustomers] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [selectedTab, setSelectedTab] = useState(0);
  
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
  
  // NOWE: Stan dla zadań produkcyjnych (dla raportu kosztów)
  const [productionTasks, setProductionTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  
  // Pobieranie danych - zoptymalizowane dla zakresu dat
  useEffect(() => {
    let cancelled = false;
    console.log('🔍 Faktyczne daty w fetchData:', {
      startDate: startDate?.toISOString().split('T')[0],
      endDate: endDate?.toISOString().split('T')[0],
      selectedCustomer
    });
    
    const timeoutId = setTimeout(() => {
      if (!cancelled) fetchData();
    }, 100);
    
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, []);
  
  // Filtrowanie danych po zmianie filtrów - z inteligentną invalidacją cache
  useEffect(() => {
    if (orders.length > 0) {
      filterAndProcessData();
    }
  }, [orders, startDate, endDate, selectedCustomer]);

  // Invalidacja cache przy zmianie dat lub klienta - z debouncing
  useEffect(() => {
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      const dateKey = `${startDate.getTime()}_${endDate.getTime()}`;
      
      if (ordersCache.dateRange && ordersCache.dateRange !== dateKey) {
        console.log('📅 Zmiana dat - invalidacja cache zamówień');
        ordersCache.data = null;
        ordersCache.timestamp = null;
        
        fetchData();
      }
      
      if (ordersCache.customerId && ordersCache.customerId !== selectedCustomer) {
        console.log('👤 Zmiana klienta - invalidacja cache zamówień');
        ordersCache.data = null;
        ordersCache.timestamp = null;
        
        fetchData();
      }
    }, 300);
    
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, [startDate, endDate, selectedCustomer]);
  
  // NOWE: Odświeżaj zadania produkcyjne gdy zmienią się filtry (tylko dla zakładki Koszty produkcji)
  useEffect(() => {
    let cancelled = false;
    if (selectedTab === 0 && !loading) {
      const timeoutId = setTimeout(() => {
        if (cancelled) return;
        console.log('🔄 Odświeżanie zadań produkcyjnych po zmianie filtrów...');
        fetchProductionTasks();
      }, 500);
      
      return () => { cancelled = true; clearTimeout(timeoutId); };
    }
  }, [startDate, endDate, selectedTab]);
  
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

  // NOWA: Funkcja do pobierania zadań produkcyjnych dla raportu kosztów
  const fetchProductionTasks = async () => {
    try {
      setTasksLoading(true);
      console.log('🔄 [NOWE PODEJŚCIE] Pobieranie zadań produkcyjnych z kosztami...');
      console.log('📅 Zakres dat:', {
        startDate: startDate?.toISOString?.(),
        endDate: endDate?.toISOString?.()
      });
      
      // Użyj gotowej funkcji getTasksWithCosts
      const tasks = await getTasksWithCosts(
        startDate,
        endDate,
        'completed', // Tylko zakończone zadania
        'all' // Wszystkie produkty (filtrowanie po stronie klienta)
      );
      
      console.log(`✅ Pobrano ${tasks.length} zadań produkcyjnych z kosztami`);
      setProductionTasks(tasks);
      
      return tasks;
    } catch (error) {
      console.error('❌ Błąd podczas pobierania zadań produkcyjnych:', error);
      showError('Nie udało się pobrać zadań produkcyjnych');
      setProductionTasks([]);
      return [];
    } finally {
      setTasksLoading(false);
    }
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
      
      // NOWE: Pobierz WSZYSTKIE zamówienia (bez filtrowania po datach) do linkowania z MO
      console.log('📥 Pobieranie wszystkich zamówień dla linkowania z MO...');
      const allOrders = await getAllOrders(selectedCustomer !== 'all' ? { customerId: selectedCustomer } : {});
      setAllOrdersForLinking(allOrders || []);
      console.log(`✅ Pobrano ${allOrders?.length || 0} zamówień dla linkowania`);
      
      // Pobierz wszystkich klientów
      const allCustomers = await getAllCustomers();
      setCustomers(allCustomers || []);
      
      // NOWE: Pobierz zadania produkcyjne dla raportu kosztów
      await fetchProductionTasks();
      
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
  
  // Obsługa menu eksportu kosztów produkcji
  const handleProductionExportMenuOpen = (event) => {
    setProductionExportMenuAnchor(true);
  };
  
  const handleProductionExportMenuClose = () => {
    setProductionExportMenuAnchor(false);
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
      
      // NOWE: Odśwież również wszystkie zamówienia dla linkowania
      console.log('📥 Odświeżanie wszystkich zamówień dla linkowania...');
      const allOrders = await getAllOrders(selectedCustomer !== 'all' ? { customerId: selectedCustomer } : {});
      setAllOrdersForLinking(allOrders || []);
      console.log(`✅ Odświeżono ${allOrders?.length || 0} zamówień dla linkowania`);
      
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

  // NOWA FUNKCJA: Obliczanie kosztów produkcji na podstawie zadań produkcyjnych
  const calculateProductionCosts = React.useCallback(() => {
    const productionCosts = [];
    
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('🔍 [KOSZT PRODUKCJI - NOWE PODEJŚCIE] Obliczanie na podstawie zadań produkcyjnych');
    console.log('📅 Zakres dat:', {
      startDate: startDate?.toISOString?.() || startDate,
      endDate: endDate?.toISOString?.() || endDate
    });
    console.log('📦 Liczba zadań produkcyjnych:', productionTasks.length);
    console.log('📦 Liczba zamówień (dla linkowania):', allOrdersForLinking.length);
    console.log('📦 Liczba zamówień (filtrowane w zakresie dat):', orders.length);
    console.log('🎯 Filtr produktu:', selectedProduct || 'Wszystkie');
    
    let acceptedCount = 0;
    let rejectedByProduct = 0;
    let rejectedByCost = 0;
    
    try {
      // Iteruj przez zadania produkcyjne zamiast przez zamówienia
      if (!productionTasks || productionTasks.length === 0) {
        console.log('⚠️ Brak zadań produkcyjnych do przetworzenia');
        return productionCosts;
      }
      
      productionTasks.forEach(task => {
        try {
          // Filtruj według produktu (jeśli wybrany)
          if (selectedProduct && task.productName !== selectedProduct) {
            rejectedByProduct++;
            return;
          }
          
          // Sprawdź czy zadanie ma koszty
          const totalMaterialCost = parseFloat(task.totalMaterialCost) || 0;
          const totalFullProductionCost = parseFloat(task.totalFullProductionCost) || 0;
          
          if (totalFullProductionCost <= 0) {
            rejectedByCost++;
            return;
          }
          
          // Oblicz dodatkowe dane
          const completedQuantity = parseFloat(task.completedQuantity) || parseFloat(task.totalCompletedQuantity) || 0;
          const unitMaterialCost = task.unitMaterialCost || (completedQuantity > 0 ? totalMaterialCost / completedQuantity : 0);
          const unitFullCost = task.unitFullCost || (completedQuantity > 0 ? totalFullProductionCost / completedQuantity : 0);
          
          // Czas produkcji jest już obliczony przez getTasksWithCosts
          const totalProductionTime = parseFloat(task.totalProductionTime) || 0;
          const totalProductionTimeHours = task.totalProductionTimeHours || (totalProductionTime > 0 ? (totalProductionTime / 60).toFixed(2) : 0);
          
          // Znajdź powiązane zamówienie klienta (jeśli istnieje)
          let linkedOrder = null;
          let customerName = 'Brak przypisania';
          let orderNumber = '-';
          
          // Szukaj w WSZYSTKICH zamówieniach (nie tylko z zakresu dat) czy jakiekolwiek item ma productionTaskId === task.id
          for (const order of allOrdersForLinking) {
            if (order.items && Array.isArray(order.items)) {
              const linkedItem = order.items.find(item => item.productionTaskId === task.id);
              if (linkedItem) {
                linkedOrder = order;
                customerName = order.customer?.name || 'Nieznany klient';
                orderNumber = order.orderNumber || '-';
                break;
              }
            }
          }
          
          // Filtr klienta - pomiń zadania które nie są powiązane z wybranym klientem
          if (selectedCustomer !== 'all') {
            if (!linkedOrder || linkedOrder.customer?.id !== selectedCustomer) {
              return; // Pomiń - nie jest powiązane z wybranym klientem
            }
          }
          
          // Dodaj do wyników
          acceptedCount++;
          productionCosts.push({
            // Dane zadania
            taskId: task.id,
            moNumber: task.moNumber || 'N/A',
            productName: task.productName || 'Brak nazwy',
            quantity: completedQuantity,
            unit: 'szt.',
            status: task.status,
            
            // Daty
            completionDate: task.completionDate,
            taskCompletionDate: task.completionDate, // Alias dla kompatybilności
            scheduledDate: task.scheduledDate,
            
            // Koszty
            totalMaterialCost: totalMaterialCost,
            totalFullProductionCost: totalFullProductionCost,
            unitMaterialCost: unitMaterialCost,
            unitFullCost: unitFullCost,
            fullProductionUnitCost: unitFullCost, // Alias dla kompatybilności
            processingCostPerUnit: parseFloat(task.processingCostPerUnit) || 0,
            totalProcessingCost: task.totalProcessingCost || 0,
            
            // Czas produkcji
            totalProductionTimeMinutes: totalProductionTime,
            totalProductionTimeHours: totalProductionTimeHours,
            actualProductionTimeMinutes: totalProductionTime, // Alias
            actualProductionTimeHours: totalProductionTimeHours, // Alias
            
            // Powiązane zamówienie (opcjonalnie)
            linkedOrderNumber: orderNumber,
            orderNumber: orderNumber, // Alias
            customerName: customerName,
            hasLinkedOrder: !!linkedOrder,
            orderId: linkedOrder?.id || null,
            orderDate: linkedOrder?.orderDate || null,
            
            // Dodatkowe dane
            productId: task.productId,
            recipeId: task.recipeId,
            recipeName: task.recipeName,
            productionTaskId: task.id, // Alias dla kompatybilności
            productionTaskNumber: task.moNumber, // Alias
            itemName: task.productName, // Alias dla kompatybilności
            
            // Dla kompatybilności z eksportem
            totalItemValue: 0, // Nie mamy ceny sprzedaży w zadaniu
            totalProductionCost: totalMaterialCost, // Używamy kosztu materiałów
            productionCost: unitMaterialCost,
            fullProductionCost: totalFullProductionCost,
            unitProductionCost: unitMaterialCost
          });
          
        } catch (taskError) {
          console.error('❌ Błąd podczas przetwarzania zadania:', taskError, task);
        }
      });
    } catch (error) {
      console.error('❌ Błąd podczas obliczania kosztów produkcji:', error);
    }
    
    // Sortuj według daty zakończenia (najnowsze najpierw)
    productionCosts.sort((a, b) => {
      const dateA = a.completionDate || new Date(0);
      const dateB = b.completionDate || new Date(0);
      return dateB - dateA;
    });
    
    console.log('\n📊 [PODSUMOWANIE] Wyniki przetwarzania:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📦 Zadań produkcyjnych przetworzonych: ${productionTasks.length}`);
    console.log(`✅ Zaakceptowanych: ${acceptedCount}`);
    console.log(`❌ Odrzuconych razem: ${rejectedByProduct + rejectedByCost}`);
    console.log('   Powody odrzucenia:');
    console.log(`   • Filtr produktu: ${rejectedByProduct}`);
    console.log(`   • Zerowe koszty: ${rejectedByCost}`);
    console.log(`🎯 Zwracam ${productionCosts.length} zadań do raportu`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    return productionCosts;
  }, [productionTasks, allOrdersForLinking, startDate, endDate, selectedCustomer, selectedProduct]); // ZAKTUALIZOWANE: używamy allOrdersForLinking zamiast orders

  // NOWA FUNKCJA: Obliczanie statystyk kosztów produkcji - dostosowana do zadań
  const calculateProductionCostStats = React.useCallback((productionCosts) => {
    const totalItems = productionCosts.length;
    const totalQuantity = productionCosts.reduce((sum, item) => sum + (item.quantity || 0), 0);
    const totalMaterialCost = productionCosts.reduce((sum, item) => sum + (item.totalMaterialCost || 0), 0);
    const totalFullProductionCost = productionCosts.reduce((sum, item) => sum + (item.totalFullProductionCost || 0), 0);
    
    // Grupowanie po produktach
    const costsByProduct = {};
    productionCosts.forEach(item => {
      const productName = item.productName || item.itemName || 'Nieznany produkt';
      
      if (!costsByProduct[productName]) {
        costsByProduct[productName] = {
          name: productName,
          totalQuantity: 0,
          totalCost: 0,
          totalFullCost: 0,
          taskCount: 0
        };
      }
      
      costsByProduct[productName].totalQuantity += item.quantity || 0;
      costsByProduct[productName].totalCost += item.totalMaterialCost || 0;
      costsByProduct[productName].totalFullCost += item.totalFullProductionCost || 0;
      costsByProduct[productName].taskCount += 1;
    });
    
    // Grupowanie po klientach (tylko dla zadań z powiązanym CO)
    const costsByCustomer = {};
    productionCosts.forEach(item => {
      if (!item.hasLinkedOrder) return; // Pomiń zadania bez powiązania z CO
      
      const customerName = item.customerName || 'Nieznany klient';
      
      if (!costsByCustomer[customerName]) {
        costsByCustomer[customerName] = {
          name: customerName,
          totalCost: 0,
          totalFullCost: 0,
          taskCount: 0,
          orderCount: 0
        };
      }
      
      costsByCustomer[customerName].totalCost += item.totalMaterialCost || 0;
      costsByCustomer[customerName].totalFullCost += item.totalFullProductionCost || 0;
      costsByCustomer[customerName].taskCount += 1;
      // Zliczamy unikalne zamówienia
      if (item.orderId) {
        costsByCustomer[customerName].orderCount += 1;
      }
    });
    
    return {
      totalItems,
      totalQuantity,
      totalProductionCost: totalMaterialCost, // Alias dla kompatybilności
      totalMaterialCost,
      totalFullProductionCost,
      totalItemValue: 0, // Nie mamy wartości sprzedaży w zadaniach
      avgProductionCost: totalItems > 0 ? totalMaterialCost / totalItems : 0,
      avgFullProductionCost: totalItems > 0 ? totalFullProductionCost / totalItems : 0,
      avgUnitCost: totalQuantity > 0 ? totalFullProductionCost / totalQuantity : 0,
      productionCostRatio: 0, // Nie obliczamy bez wartości sprzedaży
      fullProductionCostRatio: 0, // Nie obliczamy bez wartości sprzedaży
      costsByProduct: Object.values(costsByProduct),
      costsByCustomer: Object.values(costsByCustomer)
    };
  }, []); // Bez zależności - czysta funkcja kalkulacyjna

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
    
    // Stany dla rozwijanych wierszy z konsumpcjami
    const [expandedRows, setExpandedRows] = useState(new Set());
    const [taskDetailsCache, setTaskDetailsCache] = useState({});
    const [loadingTasks, setLoadingTasks] = useState(new Set());
    const [materialsCache, setMaterialsCache] = useState({});
    const [loadingMaterials, setLoadingMaterials] = useState(false);
    
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
          
          // Użyj danych czasu produkcji które już są w item (przychodzą z productionCosts)
          const actualProductionTimeMinutes = item.totalProductionTimeMinutes || item.actualProductionTimeMinutes || 0;
          const actualProductionTimeHours = item.totalProductionTimeHours || item.actualProductionTimeHours || 
            (actualProductionTimeMinutes > 0 ? (actualProductionTimeMinutes / 60).toFixed(2) : 0);
          
          return {
            date: orderDate,
            orderNumber: item.orderNumber,
            customerName: item.customerName,
            quantity: item.quantity,
            fullUnitCost: item.fullProductionUnitCost || (item.quantity > 0 ? item.fullProductionCost / item.quantity : 0),
            totalFullCost: item.totalFullProductionCost,
            productionTaskId: item.productionTaskId,
            productionTaskNumber: item.productionTaskNumber,
            actualProductionTimeMinutes: actualProductionTimeMinutes,
            actualProductionTimeHours: actualProductionTimeHours
          };
        }).sort((a, b) => a.date - b.date);
        
        setProductCostHistory(historyData);
      } else {
        setProductCostHistory([]);
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
    
    // Funkcja do pobierania szczegółów zadania produkcyjnego
    const fetchTaskDetails = async (taskId) => {
      if (taskDetailsCache[taskId] || loadingTasks.has(taskId)) {
        return taskDetailsCache[taskId]; // Zwróć z cache jeśli już istnieje
      }

      setLoadingTasks(prev => new Set([...prev, taskId]));
      
      try {
        const taskDoc = await getDoc(doc(db, 'productionTasks', taskId));
        if (taskDoc.exists()) {
          const taskData = { id: taskDoc.id, ...taskDoc.data() };
          setTaskDetailsCache(prev => ({ ...prev, [taskId]: taskData }));
          return taskData; // Zwróć pobrane dane
        }
        return null;
      } catch (error) {
        console.error('Błąd podczas pobierania szczegółów zadania:', error);
        showError('Nie udało się pobrać szczegółów zadania');
        return null;
      } finally {
        setLoadingTasks(prev => {
          const newSet = new Set(prev);
          newSet.delete(taskId);
          return newSet;
        });
      }
    };

    // Funkcja do pobierania materiałów dla konkretnego zadania
    const fetchMaterialsForTask = async (taskData) => {
      if (!taskData?.consumedMaterials || taskData.consumedMaterials.length === 0) {
        return;
      }

      // Zbierz unikalne ID materiałów z konsumpcji
      const materialIds = [...new Set(
        taskData.consumedMaterials
          .map(consumed => consumed.materialId)
          .filter(id => id && !materialsCache?.[id]) // Pobierz tylko te, których nie mamy w cache
      )];

      if (materialIds.length === 0) {
        return; // Wszystkie materiały już są w cache
      }

      setLoadingMaterials(true);
      try {
        // Pobierz wszystkie materiały jednorazowo (dla prostoty)
        // W przyszłości można zoptymalizować do batch fetch tylko tych ID
        const items = await getAllInventoryItems();
        
        // Przekształć tablicę w mapę dla szybszego dostępu
        const materialsMap = {};
        items.forEach(item => {
          materialsMap[item.id || item.inventoryItemId] = item;
        });
        
        setMaterialsCache(prev => ({ ...prev, ...materialsMap }));
      } catch (error) {
        console.error('Błąd podczas pobierania materiałów:', error);
        // Nie ustawiaj pustego obiektu, aby móc spróbować ponownie
      } finally {
        setLoadingMaterials(false);
      }
    };

    // Funkcja do przełączania rozwinięcia wiersza
    const toggleRowExpansion = async (taskId) => {
      const newExpandedRows = new Set(expandedRows);
      
      if (newExpandedRows.has(taskId)) {
        newExpandedRows.delete(taskId);
      } else {
        newExpandedRows.add(taskId);
        
        // Pobierz szczegóły zadania jeśli jeszcze nie mamy (fetchTaskDetails zwraca dane)
        let taskData = taskDetailsCache[taskId];
        if (!taskData) {
          taskData = await fetchTaskDetails(taskId);
        }
        
        // Pobierz materiały dla tego zadania (tylko jeśli nie są jeszcze w cache)
        if (taskData && !loadingMaterials) {
          await fetchMaterialsForTask(taskData);
        }
      }
      
      setExpandedRows(newExpandedRows);
    };
    
    // Funkcja do eksportu kosztów produkcji do CSV z filtrem produktu
    const handleExportProductionCostsCSVLocal = () => {
      console.log('🔍 Export CSV - selectedProduct before close:', selectedProduct);
      handleProductionExportMenuClose();
      console.log('🔍 Export CSV - selectedProduct after close:', selectedProduct);
      
      let dataToExport = productionCosts;
      
      // Jeśli wybrano konkretny produkt, filtruj dane
      if (selectedProduct) {
        dataToExport = productionCosts.filter(item => 
          (item.itemName === selectedProduct) || (item.productName === selectedProduct)
        );
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
    const handleExportProductionCostsPDFLocal = async () => {
      handleProductionExportMenuClose();
      
      let dataToExport = productionCosts;
      
      // Jeśli wybrano konkretny produkt, filtruj dane
      if (selectedProduct) {
        dataToExport = productionCosts.filter(item => 
          (item.itemName === selectedProduct) || (item.productName === selectedProduct)
        );
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
      const success = await exportToPDF(exportData, headers, filename, pdfOptions);
      
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
    const handleExportProductionCostsToExcel = async () => {
      handleProductionExportMenuClose();
      
      let dataToExport = productionCosts;
      
      // Jeśli wybrano konkretny produkt, filtruj dane
      if (selectedProduct) {
        dataToExport = productionCosts.filter(item => 
          (item.itemName === selectedProduct) || (item.productName === selectedProduct)
        );
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
      const success = await exportToExcel(worksheets, filename);

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
        <Paper sx={{ p: 3, mb: 3, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
          <Box sx={{ mb: 2, pb: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <FilterIcon sx={{ mr: 1, color: 'primary.main' }} />
              <Typography variant="h6" sx={{ fontWeight: 600 }}>
                Filtry raportu
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary">
              Wybierz zakres dat i filtruj według klienta lub produktu
            </Typography>
          </Box>
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
              <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1 }}>
                <Tooltip title="Poprzedni okres">
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
                    sx={{ 
                      minWidth: 0, 
                      p: 1,
                      '&:hover': {
                        transform: 'translateX(-2px)',
                        transition: 'transform 0.2s'
                      }
                    }}
                    size="small"
                  >
                    <PrevIcon fontSize="small" />
                  </Button>
                </Tooltip>
                <Tooltip title="Następny okres">
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
                    sx={{ 
                      minWidth: 0, 
                      p: 1,
                      '&:hover': {
                        transform: 'translateX(2px)',
                        transition: 'transform 0.2s'
                      }
                    }}
                    size="small"
                  >
                    <NextIcon fontSize="small" />
                  </Button>
                </Tooltip>
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
                      <Tooltip title="Średni koszt bazowy materiałów na jednostkę produktu" placement="top" arrow>
                        <Card sx={{ 
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          color: 'white',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          cursor: 'pointer',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: '0 12px 24px rgba(0,0,0,0.15)'
                          }
                        }}>
                          <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                              <TrendingUpIcon sx={{ mr: 1, opacity: 0.8 }} />
                              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                {t('coReports.productionCosts.productStats.avgFullUnitCost')}
                              </Typography>
                            </Box>
                            <Typography variant="h4" component="div" sx={{ fontWeight: 'bold' }}>
                              {formatCurrency(productStats.avgFullUnitCost)}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Tooltip>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Tooltip title="Minimalny koszt jednostkowy - najniższy koszt produkcji" placement="top" arrow>
                        <Card sx={{ 
                          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                          color: 'white',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          cursor: 'pointer',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: '0 12px 24px rgba(0,0,0,0.15)'
                          }
                        }}>
                          <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                              <TrendingDownIcon sx={{ mr: 1, opacity: 0.8 }} />
                              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                {t('coReports.productionCosts.productStats.minFullUnitCost')}
                              </Typography>
                            </Box>
                            <Typography variant="h4" component="div" sx={{ fontWeight: 'bold' }}>
                              {formatCurrency(productStats.minFullUnitCost)}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Tooltip>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Tooltip title="Maksymalny koszt jednostkowy - najwyższy koszt produkcji" placement="top" arrow>
                        <Card sx={{ 
                          background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
                          color: 'white',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          cursor: 'pointer',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: '0 12px 24px rgba(0,0,0,0.15)'
                          }
                        }}>
                          <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                              <TrendingUpIcon sx={{ mr: 1, opacity: 0.8 }} />
                              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                {t('coReports.productionCosts.productStats.maxFullUnitCost')}
                              </Typography>
                            </Box>
                            <Typography variant="h4" component="div" sx={{ fontWeight: 'bold' }}>
                              {formatCurrency(productStats.maxFullUnitCost)}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Tooltip>
                    </Grid>
                    <Grid item xs={12} md={3}>
                      <Tooltip title="Liczba zamówień (MO) dla tego produktu" placement="top" arrow>
                        <Card sx={{ 
                          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                          color: 'white',
                          transition: 'transform 0.2s, box-shadow 0.2s',
                          cursor: 'pointer',
                          '&:hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: '0 12px 24px rgba(0,0,0,0.15)'
                          }
                        }}>
                          <CardContent>
                            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                              <ShoppingCartIcon sx={{ mr: 1, opacity: 0.8 }} />
                              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                                {t('coReports.cards.totalOrders')}
                              </Typography>
                            </Box>
                            <Typography variant="h4" component="div" sx={{ fontWeight: 'bold' }}>
                              {productStats.orderCount}
                            </Typography>
                          </CardContent>
                        </Card>
                      </Tooltip>
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
                                  <TableCell align="center">{t('coReports.table.details')}</TableCell>
                                </TableRow>
                              </TableHead>
                              <TableBody>
                                {productCostHistory.map((entry, index) => {
                                  const isExpanded = expandedRows.has(entry.productionTaskId);
                                  const taskDetails = taskDetailsCache[entry.productionTaskId];
                                  const isLoading = loadingTasks.has(entry.productionTaskId);
                                  
                                  return (
                                    <React.Fragment key={index}>
                                      <TableRow>
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
                                            <Tooltip title={isExpanded ? t('coReports.consumption.hideDetails') : t('coReports.consumption.showDetails')}>
                                              <IconButton 
                                                size="small"
                                                onClick={() => toggleRowExpansion(entry.productionTaskId)}
                                                color="primary"
                                              >
                                                {isExpanded ? <ExpandMoreIcon /> : <ChevronRightIcon />}
                                              </IconButton>
                                            </Tooltip>
                                          )}
                                        </TableCell>
                                      </TableRow>
                                      
                                      {/* Rozwinięty wiersz z konsumpcjami */}
                                      {entry.productionTaskId && isExpanded && (
                                        <TableRow>
                                          <TableCell colSpan={9} sx={{ backgroundColor: 'action.hover', p: 0 }}>
                                            {isLoading ? (
                                              <Box sx={{ p: 3, display: 'flex', justifyContent: 'center' }}>
                                                <CircularProgress size={24} />
                                              </Box>
                                            ) : taskDetails?.consumedMaterials && taskDetails.consumedMaterials.length > 0 ? (
                                              <Box sx={{ p: 2 }}>
                                                <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                                                  {t('coReports.consumption.title', { moNumber: entry.productionTaskNumber })}
                                                </Typography>
                                                <TableContainer>
                                                  <Table size="small">
                                                    <TableHead>
                                                      <TableRow sx={{ backgroundColor: 'background.default' }}>
                                                        <TableCell>{t('coReports.table.material')}</TableCell>
                                                        <TableCell>{t('coReports.table.batchNumber')}</TableCell>
                                                        <TableCell align="right">{t('coReports.table.quantity')}</TableCell>
                                                        <TableCell align="right">{t('coReports.table.unitPrice')}</TableCell>
                                                        <TableCell align="right">{t('coReports.table.totalValue')}</TableCell>
                                                        <TableCell align="center">{t('coReports.table.includeInCosts')}</TableCell>
                                                        <TableCell>{t('coReports.table.consumptionDate')}</TableCell>
                                                        <TableCell>{t('coReports.table.user')}</TableCell>
                                                      </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                      {taskDetails.consumedMaterials.map((consumed, idx) => {
                                                        // Znajdź materiał w cache (priorytet: consumed.materialName, potem cache)
                                                        const materialFromCache = materialsCache?.[consumed.materialId];
                                                        const materialName = consumed.materialName || materialFromCache?.name || t('coReports.consumption.unknownMaterial');
                                                        const materialUnit = consumed.unit || materialFromCache?.unit || '';
                                                        
                                                        let batchNumber = consumed.batchNumber || consumed.lotNumber || consumed.batchId || '-';
                                                        const unitPrice = consumed.unitPrice || 0;
                                                        const totalValue = consumed.quantity * unitPrice;
                                                        
                                                        // Sprawdź czy konsumpcja jest wliczana do kosztów
                                                        const includeInCosts = consumed.includeInCosts !== undefined 
                                                          ? consumed.includeInCosts 
                                                          : true; // Domyślnie true jeśli nie określono
                                                        
                                                        return (
                                                          <TableRow key={idx} hover>
                                                            <TableCell>{materialName}</TableCell>
                                                            <TableCell>
                                                              <Chip 
                                                                size="small" 
                                                                label={batchNumber}
                                                                color="default"
                                                                variant="outlined"
                                                              />
                                                            </TableCell>
                                                            <TableCell align="right">
                                                              {consumed.quantity} {materialUnit}
                                                            </TableCell>
                                                            <TableCell align="right">
                                                              {unitPrice > 0 ? `${Number(unitPrice).toFixed(4)} €` : '—'}
                                                            </TableCell>
                                                            <TableCell align="right">
                                                              {totalValue > 0 ? formatCurrency(totalValue) : '—'}
                                                            </TableCell>
                                                            <TableCell align="center">
                                                              <Checkbox 
                                                                checked={includeInCosts} 
                                                                disabled 
                                                                color="primary"
                                                                size="small"
                                                              />
                                                            </TableCell>
                                                            <TableCell>
                                                              {consumed.timestamp 
                                                                ? (() => {
                                                                    const date = consumed.timestamp?.toDate 
                                                                      ? consumed.timestamp.toDate() 
                                                                      : new Date(consumed.timestamp);
                                                                    return date.toLocaleString('pl-PL', {
                                                                      day: '2-digit',
                                                                      month: '2-digit',
                                                                      year: 'numeric',
                                                                      hour: '2-digit',
                                                                      minute: '2-digit'
                                                                    });
                                                                  })()
                                                                : '—'}
                                                            </TableCell>
                                                            <TableCell>{consumed.userName || t('coReports.consumption.unknownUser')}</TableCell>
                                                          </TableRow>
                                                        );
                                                      })}
                                                    </TableBody>
                                                  </Table>
                                                </TableContainer>
                                              </Box>
                                            ) : (
                                              <Box sx={{ p: 2 }}>
                                                <Alert severity="info">
                                                  {t('coReports.consumption.noData')}
                                                </Alert>
                                              </Box>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          </TableContainer>
                        </Box>
                      </Paper>
                    </Grid>
                  </Grid>
                )}
              </>
            )}
            
            {!selectedProduct && (
              <>
                {/* Karty ze statystykami kosztów - widok dla wszystkich produktów */}
                <Grid container spacing={3} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ 
                      height: '100%',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: '0 12px 24px rgba(0,0,0,0.15)'
                      }
                    }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                          <FactoryIcon sx={{ fontSize: 40, opacity: 0.9, mr: 2 }} />
                          <Box>
                            <Typography variant="body2" sx={{ opacity: 0.9, mb: 0.5 }}>
                              {t('coReports.productionCosts.cards.itemsWithCosts')}
                            </Typography>
                            <Typography variant="h3" component="div" sx={{ fontWeight: 'bold' }}>
                              {costStats.totalItems}
                            </Typography>
                          </Box>
                        </Box>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>
                          Zadań produkcyjnych z kosztami
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ 
                      height: '100%',
                      background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
                      color: 'white',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: '0 12px 24px rgba(0,0,0,0.15)'
                      }
                    }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                          <MoneyIcon sx={{ fontSize: 40, opacity: 0.9, mr: 2 }} />
                          <Box>
                            <Typography variant="body2" sx={{ opacity: 0.9, mb: 0.5 }}>
                              {t('coReports.productionCosts.cards.totalProductionCost')}
                            </Typography>
                            <Typography variant="h3" component="div" sx={{ fontWeight: 'bold' }}>
                              {formatCurrency(costStats.totalProductionCost)}
                            </Typography>
                          </Box>
                        </Box>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>
                          Łączny koszt materiałów
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Card sx={{ 
                      height: '100%',
                      background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
                      color: 'white',
                      transition: 'transform 0.2s, box-shadow 0.2s',
                      '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: '0 12px 24px rgba(0,0,0,0.15)'
                      }
                    }}>
                      <CardContent>
                        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                          <AccountBalanceIcon sx={{ fontSize: 40, opacity: 0.9, mr: 2 }} />
                          <Box>
                            <Typography variant="body2" sx={{ opacity: 0.9, mb: 0.5 }}>
                              {t('coReports.productionCosts.cards.totalFullProductionCost')}
                            </Typography>
                            <Typography variant="h3" component="div" sx={{ fontWeight: 'bold' }}>
                              {formatCurrency(costStats.totalFullProductionCost)}
                            </Typography>
                          </Box>
                        </Box>
                        <Typography variant="caption" sx={{ opacity: 0.8 }}>
                          Pełny koszt bazowy produkcji
                        </Typography>
                      </CardContent>
                    </Card>
                  </Grid>
                </Grid>
                
                {/* Tabela kosztów według produktów */}
                <Paper sx={{ mb: 3, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  <Box sx={{ 
                    p: 3, 
                    background: 'linear-gradient(135deg, rgba(102,126,234,0.08) 0%, rgba(118,75,162,0.08) 100%)',
                    borderBottom: '2px solid',
                    borderColor: 'primary.main'
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <AssessmentIcon sx={{ mr: 1.5, color: 'primary.main', fontSize: 28 }} />
                      <Typography variant="h6" component="h3" sx={{ fontWeight: 600 }}>
                        {t('coReports.productionCosts.byProduct.title')}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      Szczegółowa analiza kosztów według produktów
                    </Typography>
                  </Box>
                  <TableContainer sx={{ maxHeight: 600 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ 
                            fontWeight: 600, 
                            backgroundColor: 'background.paper',
                            borderBottom: '2px solid',
                            borderColor: 'divider'
                          }}>
                            {t('coReports.table.product')}
                          </TableCell>
                          <TableCell align="right" sx={{ 
                            fontWeight: 600, 
                            backgroundColor: 'background.paper',
                            borderBottom: '2px solid',
                            borderColor: 'divider'
                          }}>
                            {t('coReports.table.totalQuantity')}
                          </TableCell>
                          <TableCell align="right" sx={{ 
                            fontWeight: 600, 
                            backgroundColor: 'background.paper',
                            borderBottom: '2px solid',
                            borderColor: 'divider'
                          }}>
                            {t('coReports.table.productionCost')}
                          </TableCell>
                          <TableCell align="right" sx={{ 
                            fontWeight: 600, 
                            backgroundColor: 'background.paper',
                            borderBottom: '2px solid',
                            borderColor: 'divider'
                          }}>
                            {t('coReports.table.fullCost')}
                          </TableCell>
                          <TableCell align="right" sx={{ 
                            fontWeight: 600, 
                            backgroundColor: 'background.paper',
                            borderBottom: '2px solid',
                            borderColor: 'divider'
                          }}>
                            {t('coReports.table.ordersCount')}
                          </TableCell>
                          <TableCell align="right" sx={{ 
                            fontWeight: 600, 
                            backgroundColor: 'background.paper',
                            borderBottom: '2px solid',
                            borderColor: 'divider'
                          }}>
                            {t('coReports.table.fullCostPerUnit')}
                          </TableCell>
                          <TableCell align="center" sx={{ 
                            fontWeight: 600, 
                            backgroundColor: 'background.paper',
                            borderBottom: '2px solid',
                            borderColor: 'divider'
                          }}>
                            {t('coReports.table.actions')}
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {costStats.costsByProduct.map((product, index) => (
                          <TableRow 
                            key={index}
                            hover
                            sx={{ 
                              cursor: 'pointer',
                              '&:hover': {
                                backgroundColor: 'action.hover',
                                '& .MuiTableCell-root': {
                                  color: 'primary.main'
                                }
                              },
                              transition: 'all 0.2s'
                            }}
                            onClick={() => setSelectedProduct(product.name)}
                          >
                            <TableCell sx={{ fontWeight: 500 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <Box sx={{ 
                                  width: 4, 
                                  height: 24, 
                                  backgroundColor: 'primary.main', 
                                  mr: 1.5,
                                  borderRadius: 1
                                }} />
                                {product.name}
                              </Box>
                            </TableCell>
                            <TableCell align="right">
                              <Chip 
                                label={product.totalQuantity} 
                                size="small" 
                                variant="outlined"
                                color="primary"
                              />
                            </TableCell>
                            <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                              {formatCurrency(product.totalCost)}
                            </TableCell>
                            <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600 }}>
                              {formatCurrency(product.totalFullCost)}
                            </TableCell>
                            <TableCell align="right">
                              <Chip 
                                label={product.taskCount || product.orderCount} 
                                size="small" 
                                color="secondary"
                              />
                            </TableCell>
                            <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                              {formatCurrency(product.totalQuantity > 0 ? product.totalFullCost / product.totalQuantity : 0)}
                            </TableCell>
                            <TableCell align="center">
                              <Tooltip title={t('coReports.productionCosts.byProduct.showProductDetails')}>
                                <IconButton 
                                  size="small"
                                  color="primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
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
                <Paper sx={{ mb: 3, overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                  <Box sx={{ 
                    p: 3, 
                    background: 'linear-gradient(135deg, rgba(79,172,254,0.08) 0%, rgba(0,242,254,0.08) 100%)',
                    borderBottom: '2px solid',
                    borderColor: 'info.main'
                  }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <LocalShippingIcon sx={{ mr: 1.5, color: 'info.main', fontSize: 28 }} />
                      <Typography variant="h6" component="h3" sx={{ fontWeight: 600 }}>
                        {t('coReports.productionCosts.byCustomer.title')}
                      </Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                      Koszty produkcji według klientów
                    </Typography>
                  </Box>
                  <TableContainer sx={{ maxHeight: 500 }}>
                    <Table size="small" stickyHeader>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ 
                            fontWeight: 600, 
                            backgroundColor: 'background.paper',
                            borderBottom: '2px solid',
                            borderColor: 'divider'
                          }}>
                            {t('coReports.table.customer')}
                          </TableCell>
                          <TableCell align="right" sx={{ 
                            fontWeight: 600, 
                            backgroundColor: 'background.paper',
                            borderBottom: '2px solid',
                            borderColor: 'divider'
                          }}>
                            {t('coReports.table.productionCost')}
                          </TableCell>
                          <TableCell align="right" sx={{ 
                            fontWeight: 600, 
                            backgroundColor: 'background.paper',
                            borderBottom: '2px solid',
                            borderColor: 'divider'
                          }}>
                            {t('coReports.table.fullCost')}
                          </TableCell>
                          <TableCell align="right" sx={{ 
                            fontWeight: 600, 
                            backgroundColor: 'background.paper',
                            borderBottom: '2px solid',
                            borderColor: 'divider'
                          }}>
                            {t('coReports.table.ordersCount')}
                          </TableCell>
                          <TableCell align="right" sx={{ 
                            fontWeight: 600, 
                            backgroundColor: 'background.paper',
                            borderBottom: '2px solid',
                            borderColor: 'divider'
                          }}>
                            {t('coReports.table.itemsCount')}
                          </TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {costStats.costsByCustomer.map((customer, index) => (
                          <TableRow 
                            key={index}
                            hover
                            sx={{ 
                              '&:hover': {
                                backgroundColor: 'action.hover',
                              },
                              transition: 'all 0.2s'
                            }}
                          >
                            <TableCell sx={{ fontWeight: 500 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <Box sx={{ 
                                  width: 4, 
                                  height: 24, 
                                  backgroundColor: 'info.main', 
                                  mr: 1.5,
                                  borderRadius: 1
                                }} />
                                {customer.name}
                              </Box>
                            </TableCell>
                            <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                              {formatCurrency(customer.totalCost)}
                            </TableCell>
                            <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 600 }}>
                              {formatCurrency(customer.totalFullCost)}
                            </TableCell>
                            <TableCell align="right">
                              <Chip 
                                label={customer.orderCount} 
                                size="small" 
                                color="success"
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Chip 
                                label={customer.taskCount || customer.itemCount} 
                                size="small" 
                                variant="outlined"
                                color="info"
                              />
                            </TableCell>
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
      <Paper 
        elevation={0}
        sx={{ 
          p: 4, 
          mb: 4, 
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: 'white',
          borderRadius: 2,
          boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h3" component="h1" sx={{ fontWeight: 'bold', mb: 1 }}>
              📊 {t('coReports.title')}
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9 }}>
              Kompleksowa analiza kosztów produkcji, raportów finansowych i przepływów pieniężnych
            </Typography>
          </Box>
        </Box>
      </Paper>
      
      <Paper elevation={0} sx={{ mb: 3, borderRadius: 2, overflow: 'hidden' }}>
        <Tabs 
          value={selectedTab} 
          onChange={handleTabChange} 
          aria-label={t('coReports.aria.tabs')}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{
            backgroundColor: 'background.paper',
            '& .MuiTab-root': {
              fontWeight: 600,
              py: 2.5,
              px: 4,
              minHeight: 64,
              fontSize: '1rem',
              transition: 'all 0.3s',
              '&:hover': {
                backgroundColor: 'action.hover',
                transform: 'translateY(-2px)'
              }
            },
            '& .Mui-selected': {
              color: 'primary.main',
              fontWeight: 'bold',
              backgroundColor: 'action.selected'
            },
            '& .MuiTabs-indicator': {
              height: 4,
              borderTopLeftRadius: 4,
              borderTopRightRadius: 4,
              backgroundColor: 'primary.main'
            }
          }}
        >
          <Tab 
            label={t('coReports.tabs.productionCosts')}
            icon={<MoneyIcon />} 
            iconPosition="start"
          />
          <Tab 
            label={t('coReports.tabs.cashflow')}
            icon={<AccountBalanceIcon />} 
            iconPosition="start"
          />
        </Tabs>
      </Paper>
      
      <Box sx={{ py: 3 }}>
        {selectedTab === 0 && <ProductionCostsTab />}
        {selectedTab === 1 && <CashflowTab />}
      </Box>
    </Container>
  );
};

export default COReportsPage; 