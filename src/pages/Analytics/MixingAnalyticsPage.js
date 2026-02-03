// src/pages/Analytics/MixingAnalyticsPage.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  IconButton,
  Tooltip,
  Alert,
  Autocomplete,
  TextField,
  useTheme,
  alpha,
  ToggleButton,
  ToggleButtonGroup,
  Tabs,
  Tab,
  Collapse
} from '@mui/material';
import {
  Blender as BlenderIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  FilterList as FilterIcon,
  TableChart as TableIcon,
  BarChart as ChartIcon,
  Timeline as TimelineIcon,
  CalendarMonth as CalendarIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';
import { 
  format, 
  subMonths, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isWeekend,
  getDay,
  startOfDay,
  endOfDay,
  differenceInBusinessDays,
  isSameDay
} from 'date-fns';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
  LineChart,
  Line
} from 'recharts';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { exportToCSV, formatDateForExport } from '../../utils/exportUtils';
import { getAllCustomers } from '../../services/customerService';

const MixingAnalyticsPage = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  const { t, currentLanguage } = useTranslation('analytics');
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Stan
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [productionTasks, setProductionTasks] = useState([]);
  const [customers, setCustomers] = useState([]);
  
  // ✅ DEBOUNCE dla dat - osobne stany dla wyświetlania i obliczeń
  const [displayStartDate, setDisplayStartDate] = useState(subMonths(new Date(), 1));
  const [displayEndDate, setDisplayEndDate] = useState(new Date());
  const [startDate, setStartDate] = useState(subMonths(new Date(), 1)); // Debounced
  const [endDate, setEndDate] = useState(new Date()); // Debounced
  
  const [selectedProduct, setSelectedProduct] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [productType, setProductType] = useState('all'); // 'all', 'powder', 'capsules'
  const [viewMode, setViewMode] = useState('table'); // 'table', 'daily', 'weekly', 'trend'
  const [activeTab, setActiveTab] = useState(0);
  const [dateMode, setDateMode] = useState('execution'); // 'scheduled' lub 'execution'
  const [expandedRows, setExpandedRows] = useState(new Set()); // Rozwinięte wiersze SKU
  const [isDebouncing, setIsDebouncing] = useState(false); // ✅ Czy debounce jest aktywny

  // ✅ DEBOUNCE dla dat - opóźnij aktualizację o 500ms (obie daty razem)
  useEffect(() => {
    setIsDebouncing(true);
    const timeoutId = setTimeout(() => {
      setStartDate(displayStartDate);
      setEndDate(displayEndDate);
      setIsDebouncing(false);
    }, 500);

    return () => {
      clearTimeout(timeoutId);
      setIsDebouncing(false);
    };
  }, [displayStartDate, displayEndDate]);

  useEffect(() => {
    fetchMixingData();
  }, [startDate, endDate]);

  // Pobierz listę klientów
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const data = await getAllCustomers();
        setCustomers(data || []);
      } catch (error) {
        console.error('Błąd podczas pobierania klientów:', error);
      }
    };
    fetchCustomers();
  }, []);

  // Pobierz dane o mieszaniach z zadań produkcyjnych
  const fetchMixingData = async () => {
    try {
      setLoading(true);
      console.log('🔄 Pobieranie danych o mieszaniach...');

      const tasksRef = collection(db, 'productionTasks');
      
      // Konwertuj daty na Timestamp dla Firestore
      const startTimestamp = Timestamp.fromDate(startOfDay(startDate));
      const endTimestamp = Timestamp.fromDate(endOfDay(endDate));

      // Pobierz zadania z mixingPlanChecklist w wybranym okresie
      const q = query(
        tasksRef,
        where('scheduledDate', '>=', startTimestamp),
        where('scheduledDate', '<=', endTimestamp)
      );

      const snapshot = await getDocs(q);
      const tasks = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        // Filtruj tylko zadania z mixingPlanChecklist
        if (data.mixingPlanChecklist && data.mixingPlanChecklist.length > 0) {
          tasks.push({
            id: doc.id,
            ...data
          });
        }
      });

      console.log(`✅ Pobrano ${tasks.length} zadań z planem mieszań`);
      setProductionTasks(tasks);
    } catch (error) {
      console.error('Błąd podczas pobierania danych mieszań:', error);
      showError(t('mixingAnalytics.errors.fetchData', 'Nie udało się pobrać danych'));
    } finally {
      setLoading(false);
    }
  };

  // Parsuj liczbę sztuk z details nagłówka mieszania
  const parsePiecesCount = (details) => {
    if (!details) return 0;
    const match = details.match(/Liczba sztuk:\s*([\d,\.]+)/);
    if (match) {
      return parseFloat(match[1].replace(',', '.')) || 0;
    }
    return 0;
  };

  // Kategoryzuj produkt na podstawie jednostki i nazwy
  const getProductCategory = (unit, productName = '') => {
    // 🔍 Najpierw sprawdź nazwę produktu (fallback dla błędnych jednostek)
    const nameLower = productName.toLowerCase();
    if (nameLower.includes('caps') || nameLower.includes('capsule') || nameLower.includes('kapsułk')) {
      return 'capsules';
    }
    
    // 🔍 Następnie sprawdź jednostkę
    if (!unit) return 'powder';
    const unitLower = unit.toLowerCase();
    if (unitLower === 'caps' || unitLower.includes('cap')) {
      return 'capsules';
    }
    
    return 'powder'; // szt., kg, g itp. = proszki
  };

  // Przetwórz dane o mieszaniach
  const mixingData = useMemo(() => {
    const dataByProduct = {};
    const dataByDay = {};
    const dataByWeek = {};
    let unrealizedCount = 0;
    let totalMixingsCount = 0;
    
    // ✅ PRÓG MINIMALNY: Ignoruj dni z mniej niż X mieszaniami (przełączenia linii)
    const MIN_MIXINGS_PER_DAY = 2;

    productionTasks.forEach(task => {
      // ✅ Filtruj po kliencie
      if (selectedCustomer !== 'all') {
        const taskCustomerId = task.customerId || task.customer?.id;
        if (taskCustomerId !== selectedCustomer) {
          return; // Pomiń to zadanie - nie pasuje do wybranego klienta
        }
      }

      const productName = task.recipeName || task.productName || 'Nieznany produkt';
      
      // 🔍 Znajdź jednostkę z różnych możliwych lokalizacji
      const productUnit = task.unit || task.output?.unit || task.recipe?.unit || 'szt.';
      
      // DEBUG: Loguj strukturę dla pierwszego zadania (tylko raz)
      if (!window.__mixingDebugLogged && task.mixingPlanChecklist?.length > 0) {
        const detectedCategory = getProductCategory(productUnit, productName);
        console.log('🔍 DEBUG - Struktura zadania produkcyjnego:', {
          productName,
          unit: task.unit,
          'output.unit': task.output?.unit,
          'recipe.unit': task.recipe?.unit,
          productUnit,
          detectedCategory: detectedCategory === 'capsules' ? '💊 KAPSUŁKI' : '📊 PROSZKI',
          fullTask: task
        });
        window.__mixingDebugLogged = true;
      }

      // Znajdź wszystkie nagłówki mieszań (type === 'header')
      const mixingHeaders = task.mixingPlanChecklist?.filter(item => item.type === 'header') || [];

      mixingHeaders.forEach(mixing => {
        totalMixingsCount++;
        const piecesCount = parsePiecesCount(mixing.details);

        // Znajdź checkboxy dla tego mieszania
        const checkItems = task.mixingPlanChecklist?.filter(
          item => item.parentId === mixing.id && item.type === 'check'
        ) || [];

        // Znajdź pierwszą datę wykonania z odchaczonych checkboxów
        const completedChecks = checkItems
          .filter(item => item.completed && item.completedAt)
          .map(item => ({
            ...item,
            dateObj: item.completedAt.toDate ? item.completedAt.toDate() : new Date(item.completedAt)
          }))
          .sort((a, b) => a.dateObj - b.dateObj);

        let taskDate;
        let isRealized = false;

        if (dateMode === 'execution') {
          // Tryb wykonania - użyj daty z pierwszego odchaczonego checkboxa
          if (completedChecks.length > 0) {
            taskDate = completedChecks[0].dateObj;
            isRealized = true;
          } else {
            // Mieszanie nie zostało jeszcze wykonane - pomiń je
            unrealizedCount++;
            return;
          }
        } else {
          // Tryb planowania - użyj scheduledDate zadania
          if (task.scheduledDate) {
            taskDate = task.scheduledDate.toDate ? task.scheduledDate.toDate() : new Date(task.scheduledDate);
          } else if (task.createdAt) {
            taskDate = task.createdAt.toDate ? task.createdAt.toDate() : new Date(task.createdAt);
          } else {
            taskDate = new Date();
          }
          isRealized = completedChecks.length > 0;
        }

        // Pomijaj weekendy (sobota=6, niedziela=0)
        const dayOfWeek = getDay(taskDate);
        if (dayOfWeek === 0 || dayOfWeek === 6) {
          return; // Pomijamy weekendy
        }

        const dayKey = format(taskDate, 'yyyy-MM-dd');
        const weekKey = format(startOfWeek(taskDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');

        // Agreguj per SKU/produkt
        if (!dataByProduct[productName]) {
          dataByProduct[productName] = {
            name: productName,
            unit: productUnit,
            category: getProductCategory(productUnit, productName), // ✅ Przekaż nazwę do detekcji
            totalMixings: 0,
            totalPieces: 0,
            realizedMixings: 0,
            mixingsByDay: {},
            piecesByDay: {},
            tasks: new Set(),
            productionDays: new Set(), // ✅ Zbiór unikalnych dni z produkcją
            productionWeeks: new Set(), // ✅ Zbiór unikalnych tygodni z produkcją
            excludedDays: new Set() // ✅ Dni pominięte (< MIN_MIXINGS_PER_DAY)
          };
        }
        dataByProduct[productName].totalMixings++;
        dataByProduct[productName].totalPieces += piecesCount;
        if (isRealized) {
          dataByProduct[productName].realizedMixings++;
        }
        dataByProduct[productName].tasks.add(task.id);
        // ⚠️ NIE dodajemy od razu do productionDays - zrobimy to później po sprawdzeniu progu

        // Agreguj per dzień dla produktu
        if (!dataByProduct[productName].mixingsByDay[dayKey]) {
          dataByProduct[productName].mixingsByDay[dayKey] = 0;
          dataByProduct[productName].piecesByDay[dayKey] = 0;
        }
        dataByProduct[productName].mixingsByDay[dayKey]++;
        dataByProduct[productName].piecesByDay[dayKey] += piecesCount;

        // Agreguj per dzień (wszystkie produkty)
        if (!dataByDay[dayKey]) {
          dataByDay[dayKey] = {
            date: dayKey,
            totalMixings: 0,
            totalPieces: 0,
            products: {}
          };
        }
        dataByDay[dayKey].totalMixings++;
        dataByDay[dayKey].totalPieces += piecesCount;
        if (!dataByDay[dayKey].products[productName]) {
          dataByDay[dayKey].products[productName] = { mixings: 0, pieces: 0 };
        }
        dataByDay[dayKey].products[productName].mixings++;
        dataByDay[dayKey].products[productName].pieces += piecesCount;

        // Agreguj per tydzień
        if (!dataByWeek[weekKey]) {
          dataByWeek[weekKey] = {
            week: weekKey,
            totalMixings: 0,
            totalPieces: 0,
            workDays: 0
          };
        }
        dataByWeek[weekKey].totalMixings++;
        dataByWeek[weekKey].totalPieces += piecesCount;
      });
    });

    // ✅ Filtruj dni produkcji - dodaj tylko te z >= MIN_MIXINGS_PER_DAY
    Object.values(dataByProduct).forEach(product => {
      Object.entries(product.mixingsByDay).forEach(([dayKey, mixingsCount]) => {
        if (mixingsCount >= MIN_MIXINGS_PER_DAY) {
          product.productionDays.add(dayKey);
          // ✅ Dodaj tydzień, w którym był ten dzień produkcji
          const weekKey = format(startOfWeek(new Date(dayKey), { weekStartsOn: 1 }), 'yyyy-MM-dd');
          product.productionWeeks.add(weekKey);
        } else {
          product.excludedDays.add(dayKey); // ✅ Zapamiętaj pominięte dni
        }
      });
    });

    // Konwertuj Set na liczby
    Object.values(dataByProduct).forEach(product => {
      product.tasksCount = product.tasks.size;
      product.actualProductionDays = product.productionDays.size; // ✅ Faktyczna liczba dni z produkcją (>= MIN_MIXINGS_PER_DAY)
      product.actualProductionWeeks = product.productionWeeks.size; // ✅ Faktyczna liczba tygodni z produkcją
      product.excludedDaysCount = product.excludedDays.size; // ✅ Liczba pominiętych dni
      delete product.tasks;
      delete product.productionDays;
      delete product.productionWeeks;
      delete product.excludedDays;
    });

    return {
      byProduct: Object.values(dataByProduct).sort((a, b) => b.totalPieces - a.totalPieces),
      byDay: Object.values(dataByDay).sort((a, b) => a.date.localeCompare(b.date)),
      byWeek: Object.values(dataByWeek).sort((a, b) => a.week.localeCompare(b.week)),
      unrealizedCount,
      totalMixingsCount,
      realizationRate: totalMixingsCount > 0 ? ((totalMixingsCount - unrealizedCount) / totalMixingsCount * 100).toFixed(1) : 0
    };
  }, [productionTasks, dateMode, selectedCustomer]);

  // Oblicz liczbę dni roboczych w okresie
  const workDaysInPeriod = useMemo(() => {
    let count = 0;
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    days.forEach(day => {
      const dayOfWeek = getDay(day);
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++;
      }
    });
    return count;
  }, [startDate, endDate]);

  // Oblicz liczbę pełnych tygodni roboczych
  const workWeeksInPeriod = useMemo(() => {
    return workDaysInPeriod / 5;
  }, [workDaysInPeriod]);

  // Unikalne produkty do filtrowania
  const uniqueProducts = useMemo(() => {
    return mixingData.byProduct.map(p => p.name).sort();
  }, [mixingData]);

  // Filtrowane dane
  const filteredProductData = useMemo(() => {
    let filtered = mixingData.byProduct;
    
    // Filtruj po typie produktu (proszki/kapsułki)
    if (productType !== 'all') {
      filtered = filtered.filter(p => p.category === productType);
    }
    
    // Filtruj po nazwie produktu
    if (selectedProduct) {
      filtered = filtered.filter(p => p.name === selectedProduct);
    }
    
    return filtered;
  }, [mixingData.byProduct, selectedProduct, productType]);

  // Statystyki ogólne
  const stats = useMemo(() => {
    const data = filteredProductData;
    const totalMixings = data.reduce((sum, p) => sum + p.totalMixings, 0);
    const totalPieces = data.reduce((sum, p) => sum + p.totalPieces, 0);
    
    // ✅ Zbierz unikalne dni produkcji TYLKO z przefiltrowanych dni (>= MIN_MIXINGS_PER_DAY)
    const allProductionDaysSet = new Set();
    data.forEach(product => {
      // Dodaj tylko dni, które spełniają próg MIN_MIXINGS_PER_DAY
      Object.entries(product.mixingsByDay || {}).forEach(([day, count]) => {
        if (count >= 2) { // MIN_MIXINGS_PER_DAY = 2
          allProductionDaysSet.add(day);
        }
      });
    });
    const totalActualProductionDays = allProductionDaysSet.size;
    
    // ✅ Zbierz unikalne tygodnie produkcji
    const allProductionWeeksSet = new Set();
    allProductionDaysSet.forEach(dayKey => {
      const weekKey = format(startOfWeek(new Date(dayKey), { weekStartsOn: 1 }), 'yyyy-MM-dd');
      allProductionWeeksSet.add(weekKey);
    });
    const totalActualProductionWeeks = allProductionWeeksSet.size;
    
    return {
      totalMixings, // ✅ Suma z CAŁEGO okresu
      totalPieces, // ✅ Suma z CAŁEGO okresu
      avgPiecesPerMixing: totalMixings > 0 ? Math.round(totalPieces / totalMixings) : 0, // ✅ Średnia z CAŁEGO okresu
      avgPiecesPerDay: totalActualProductionDays > 0 ? Math.round(totalPieces / totalActualProductionDays) : 0, // ✅ Średnia dzienna (pełne dni produkcji)
      avgMixingsPerWeek: totalActualProductionWeeks > 0 ? (totalMixings / totalActualProductionWeeks).toFixed(1) : 0, // ✅ Średnia tygodniowa z FAKTYCZNYCH tygodni produkcji
      productsCount: data.length,
      totalActualProductionDays, // ✅ Liczba pełnych dni produkcji (>=2 mieszań)
      totalActualProductionWeeks // ✅ Liczba tygodni z produkcją
    };
  }, [filteredProductData, workDaysInPeriod, workWeeksInPeriod]);

  // Dane dla wykresu dziennego
  const dailyChartData = useMemo(() => {
    return mixingData.byDay.map(day => ({
      date: format(new Date(day.date), 'dd.MM'),
      fullDate: day.date,
      mixings: day.totalMixings,
      pieces: day.totalPieces
    }));
  }, [mixingData.byDay]);

  // Dane dla wykresu tygodniowego
  const weeklyChartData = useMemo(() => {
    return mixingData.byWeek.map(week => ({
      week: `Tydz. ${format(new Date(week.week), 'dd.MM')}`,
      fullWeek: week.week,
      mixings: week.totalMixings,
      pieces: week.totalPieces
    }));
  }, [mixingData.byWeek]);

  // Odśwież dane
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMixingData();
    setRefreshing(false);
    showInfo(t('mixingAnalytics.dataRefreshed', 'Dane zostały odświeżone'));
  };

  // Eksport do CSV
  const handleExportCSV = useCallback(() => {
    if (!filteredProductData || filteredProductData.length === 0) {
      showError(t('mixingAnalytics.errors.noDataToExport', 'Brak danych do eksportu'));
      return;
    }

    try {
      const exportData = filteredProductData.map(product => {
        const actualDays = product.actualProductionDays || 0;
        const actualWeeks = product.actualProductionWeeks || 0;
        const excludedDays = product.excludedDaysCount || 0;
        
        // Oblicz średnie dzienne
        const avgMixingsPerDay = actualDays > 0 
          ? (product.totalMixings / actualDays).toFixed(2)
          : 0;
        const avgPiecesPerDay = actualDays > 0 
          ? Math.round(product.totalPieces / actualDays)
          : 0;
        
        // Oblicz weekly sprint (pon-czw, 4 dni)
        const sprintMixings = actualDays > 0 
          ? (product.totalMixings / actualDays * 4).toFixed(1)
          : 0;
        const sprintPieces = actualDays > 0 
          ? Math.round(product.totalPieces / actualDays * 4)
          : 0;
        
        // 🛢️ Oblicz beczki dla kapsułek
        const BARREL_SIZE = 15000;
        const fullBarrels = product.category === 'capsules' 
          ? Math.floor(sprintPieces / BARREL_SIZE)
          : 0;
        const remainingPieces = product.category === 'capsules' 
          ? Math.round(sprintPieces % BARREL_SIZE)
          : 0;
        
        const baseData = {
          sku: product.name,
          category: product.category === 'capsules' ? 'Capsules' : 'Powder',
          totalMixings: product.totalMixings,
          totalPieces: product.totalPieces,
          avgPiecesPerMixing: product.totalMixings > 0 
            ? Math.round(product.totalPieces / product.totalMixings) 
            : 0,
          actualProductionDays: actualDays,
          actualProductionWeeks: actualWeeks,
          excludedDays: excludedDays,
          avgMixingsPerDay: avgMixingsPerDay,
          avgPiecesPerDay: avgPiecesPerDay,
          sprintMixings: sprintMixings,
          sprintPieces: sprintPieces,
          // 🛢️ Beczki (tylko dla kapsułek)
          fullBarrels: fullBarrels,
          remainingPieces: remainingPieces,
          mixingsPerWeek: actualWeeks > 0 
            ? (product.totalMixings / actualWeeks).toFixed(2) 
            : 0,
          utilizationRate: workDaysInPeriod > 0 
            ? (actualDays / workDaysInPeriod * 100).toFixed(1) + '%'
            : '0%',
          tasksCount: product.tasksCount
        };

        return baseData;
      });

      const headers = [
        { label: 'SKU', key: 'sku' },
        { label: 'Category', key: 'category' },
        // Weekly Sprint Data (4-day Mon-Thu)
        { label: 'Sprint Mixings (Mon-Thu)', key: 'sprintMixings' },
        { label: 'Sprint Pieces (Mon-Thu)', key: 'sprintPieces' },
        // Barrels (for capsules only)
        { label: 'Full Barrels (15k pcs)', key: 'fullBarrels' },
        { label: 'Remaining Pieces', key: 'remainingPieces' },
        // Daily Averages
        { label: 'Avg Mixings/Day', key: 'avgMixingsPerDay' },
        { label: 'Avg Pieces/Day', key: 'avgPiecesPerDay' },
        // Weekly Averages
        { label: 'Avg Mixings/Week', key: 'mixingsPerWeek' },
        // Summary
        { label: 'Avg Pieces/Mixing', key: 'avgPiecesPerMixing' }
      ];

      const startDateStr = formatDateForExport(startDate, 'yyyyMMdd');
      const endDateStr = formatDateForExport(endDate, 'yyyyMMdd');
      const modeStr = dateMode === 'execution' ? 'execution' : 'scheduled';
      const typeStr = productType !== 'all' 
        ? `_${productType === 'powder' ? 'powders' : 'capsules'}`
        : '';
      const customerStr = selectedCustomer !== 'all' 
        ? `_${customers.find(c => c.id === selectedCustomer)?.name?.replace(/\s+/g, '_') || 'customer'}`
        : '';
      const filename = `mixing_analytics_weekly_sprint_${modeStr}_${startDateStr}_${endDateStr}${typeStr}${customerStr}`;

      const success = exportToCSV(exportData, headers, filename);
      if (success) {
        showSuccess(t('mixingAnalytics.export.success', 'Wyeksportowano raport do pliku CSV'));
      }
    } catch (error) {
      console.error('Błąd podczas eksportu:', error);
      showError(t('mixingAnalytics.export.error', 'Nie udało się wyeksportować raportu'));
    }
  }, [filteredProductData, startDate, endDate, workDaysInPeriod, workWeeksInPeriod, dateMode, productType, selectedCustomer, customers, showSuccess, showError, t]);

  const formatDateDisplay = (date) => {
    try {
      return format(date, 'dd.MM.yyyy', { locale: pl });
    } catch {
      return '-';
    }
  };

  // Funkcja do przełączania rozwinięcia wiersza
  const toggleRowExpanded = (productName) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(productName)) {
        newSet.delete(productName);
      } else {
        newSet.add(productName);
      }
      return newSet;
    });
  };

  // Stała: rozmiar beczki dla kapsułek
  const BARREL_SIZE = 15000; // sztuk kapsułek w jednej beczce

  // Funkcja do obliczania weekly sprint (pon-czw) dla produktu
  const calculateWeeklySprint = (product) => {
    // ✅ Średnia dzienna na podstawie FAKTYCZNYCH dni produkcji (nie wszystkich dni roboczych)
    const actualProductionDays = product.actualProductionDays || 0;
    const excludedDaysCount = product.excludedDaysCount || 0;
    
    const avgMixingsPerDay = actualProductionDays > 0 
      ? product.totalMixings / actualProductionDays 
      : 0;
    const avgPiecesPerDay = actualProductionDays > 0 
      ? product.totalPieces / actualProductionDays 
      : 0;

    // Szacowana produkcja dla 4-dniowego tygodnia (pon-czw)
    const sprintDays = 4; // poniedziałek - czwartek
    const estimatedMixingsPerSprint = avgMixingsPerDay * sprintDays;
    const estimatedPiecesPerSprint = avgPiecesPerDay * sprintDays;

    // Intensywność wykorzystania dni roboczych
    const utilizationRate = workDaysInPeriod > 0 
      ? (actualProductionDays / workDaysInPeriod * 100).toFixed(1)
      : 0;

    // 🛢️ Oblicz beczki dla kapsułek (na podstawie historii produkcji)
    const fullBarrels = Math.floor(estimatedPiecesPerSprint / BARREL_SIZE);
    const remainingPieces = Math.round(estimatedPiecesPerSprint % BARREL_SIZE);
    const partialBarrelPercent = BARREL_SIZE > 0 
      ? ((remainingPieces / BARREL_SIZE) * 100).toFixed(1) 
      : 0;

    return {
      actualProductionDays,
      excludedDaysCount,
      avgMixingsPerDay: avgMixingsPerDay.toFixed(2),
      avgPiecesPerDay: Math.round(avgPiecesPerDay),
      estimatedMixingsPerSprint: estimatedMixingsPerSprint.toFixed(1),
      estimatedPiecesPerSprint: Math.round(estimatedPiecesPerSprint),
      sprintDays,
      utilizationRate,
      // 🛢️ Dane dla beczek (kapsułki)
      fullBarrels,
      remainingPieces,
      partialBarrelPercent
    };
  };

  // Render tabeli głównej
  const renderMainTable = () => (
    <TableContainer>
      <Table>
        <TableHead>
          <TableRow>
            <TableCell sx={{ fontWeight: 'bold', width: 50 }} />
            <TableCell sx={{ fontWeight: 'bold' }}>SKU</TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>
              {t('mixingAnalytics.table.totalMixings', 'Liczba mieszań')}
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
              {t('mixingAnalytics.table.totalPieces', 'Liczba sztuk')}
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
              {t('mixingAnalytics.table.avgPiecesPerMixing', 'Śr. sztuk/mieszanie')}
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
              <Tooltip title="Średnia z tygodni, gdy faktycznie produkowano">
                <span>{t('mixingAnalytics.table.mixingsPerWeek', 'Mieszań/tydzień')} *</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
              <Tooltip title="Średnia z dni, gdy faktycznie produkowano (nie wszystkich dni roboczych)">
                <span>{t('mixingAnalytics.table.piecesPerDay', 'Sztuk/dzień')} *</span>
              </Tooltip>
            </TableCell>
            <TableCell align="center" sx={{ fontWeight: 'bold' }}>
              {t('mixingAnalytics.table.tasksCount', 'Zadań')}
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {filteredProductData.map((product, index) => {
            const isExpanded = expandedRows.has(product.name);
            const sprintData = calculateWeeklySprint(product);
            
            return (
              <React.Fragment key={index}>
                {/* Główny wiersz produktu */}
                <TableRow hover sx={{ '& > *': { borderBottom: isExpanded ? 'unset' : undefined } }}>
                  <TableCell>
                    <IconButton
                      size="small"
                      onClick={() => toggleRowExpanded(product.name)}
                    >
                      {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                    </IconButton>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 'medium' }}>{product.name}</TableCell>
                  <TableCell align="center">
                    <Chip 
                      label={product.totalMixings} 
                      size="small" 
                      color="primary" 
                      variant="outlined" 
                    />
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {product.totalPieces.toLocaleString('pl-PL')}
                  </TableCell>
                  <TableCell align="right">
                    {product.totalMixings > 0 
                      ? Math.round(product.totalPieces / product.totalMixings).toLocaleString('pl-PL')
                      : '-'}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={
                      `Faktyczna produkcja w ${product.actualProductionWeeks || 0} ${(product.actualProductionWeeks || 0) === 1 ? 'tygodniu' : 'tygodniach'} z ${workWeeksInPeriod.toFixed(1)} tygodni w okresie`
                    }>
                      <span>
                        {(product.actualProductionWeeks || 0) > 0 
                          ? (product.totalMixings / product.actualProductionWeeks).toFixed(1)
                          : '-'}
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={
                      `Faktyczna produkcja w ${product.actualProductionDays || 0} ${(product.actualProductionDays || 0) === 1 ? 'dniu' : 'dniach'}` +
                      ((product.excludedDaysCount || 0) > 0 ? ` (pominięto ${product.excludedDaysCount} ${product.excludedDaysCount === 1 ? 'dzień' : 'dni'} z < 2 mieszaniami)` : '') +
                      ` z ${workDaysInPeriod} dni roboczych w okresie`
                    }>
                      <span>
                        {(product.actualProductionDays || 0) > 0 
                          ? Math.round(product.totalPieces / product.actualProductionDays).toLocaleString('pl-PL')
                          : '-'}
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="center">
                    <Chip 
                      label={product.tasksCount} 
                      size="small" 
                      color="secondary" 
                      variant="outlined" 
                    />
                  </TableCell>
                </TableRow>
                
                {/* Rozwinięty wiersz - Weekly Sprint (Pon-Czw) */}
                <TableRow>
                  <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
                    <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                      <Box sx={{ m: 1.5, p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'primary.main', mb: 1.5 }}>
                          {product.category === 'capsules' ? '💊' : '📊'} Weekly Sprint (Pon-Czw) • {sprintData.actualProductionDays} dni produkcji ({sprintData.utilizationRate}% wykorzystania)
                          {product.category === 'capsules' && sprintData.fullBarrels > 0 && (
                            <Typography component="span" variant="caption" sx={{ ml: 1, color: 'info.main', fontWeight: 'bold' }}>
                              • 🛢️ {sprintData.fullBarrels} {sprintData.fullBarrels === 1 ? 'beczka' : sprintData.fullBarrels < 5 ? 'beczki' : 'beczek'}
                            </Typography>
                          )}
                          {sprintData.excludedDaysCount > 0 && (
                            <Typography component="span" variant="caption" sx={{ ml: 1, color: 'text.secondary' }}>
                              • Pominięto {sprintData.excludedDaysCount} {sprintData.excludedDaysCount === 1 ? 'dzień' : 'dni'} z {'<'}2 mieszaniami
                            </Typography>
                          )}
                        </Typography>
                        
                        <Grid container spacing={2}>
                          {/* Średnie dzienne */}
                          <Grid item xs={12} md={product.category === 'capsules' ? 4 : 6}>
                            <Paper sx={{ p: 1.5, bgcolor: 'success.light', color: 'success.contrastText', height: '100%' }} elevation={1}>
                              <Typography variant="caption" sx={{ opacity: 0.9, fontWeight: 600, display: 'block', mb: 1 }}>
                                📈 ŚREDNIA PER DZIEŃ
                              </Typography>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="body2">Mieszań:</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                  {sprintData.avgMixingsPerDay}
                                </Typography>
                              </Box>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2">Sztuk:</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                  {sprintData.avgPiecesPerDay.toLocaleString('pl-PL')}
                                </Typography>
                              </Box>
                            </Paper>
                          </Grid>

                          {/* Sprint (Pon-Czw) */}
                          <Grid item xs={12} md={product.category === 'capsules' ? 4 : 6}>
                            <Paper sx={{ p: 1.5, bgcolor: 'primary.light', color: 'primary.contrastText', height: '100%' }} elevation={1}>
                              <Typography variant="caption" sx={{ opacity: 0.9, fontWeight: 600, display: 'block', mb: 1 }}>
                                🎯 SPRINT (PON-CZW, 4 DNI)
                              </Typography>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                <Typography variant="body2">Mieszań:</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '1.05rem' }}>
                                  {sprintData.estimatedMixingsPerSprint}
                                </Typography>
                              </Box>
                              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                <Typography variant="body2">Sztuk:</Typography>
                                <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '1.05rem' }}>
                                  {sprintData.estimatedPiecesPerSprint.toLocaleString('pl-PL')}
                                </Typography>
                              </Box>
                            </Paper>
                          </Grid>

                          {/* 🛢️ Beczki - TYLKO dla kapsułek */}
                          {product.category === 'capsules' && (
                            <Grid item xs={12} md={4}>
                              <Paper sx={{ p: 1.5, bgcolor: 'info.light', color: 'info.contrastText', height: '100%' }} elevation={1}>
                                <Typography variant="caption" sx={{ opacity: 0.9, fontWeight: 600, display: 'block', mb: 1 }}>
                                  🛢️ BECZKI (15 000 szt.)
                                </Typography>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                  <Typography variant="body2">Pełne beczki:</Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
                                    {sprintData.fullBarrels}
                                  </Typography>
                                </Box>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                  <Typography variant="body2">Reszta:</Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                    {sprintData.remainingPieces.toLocaleString('pl-PL')} szt. ({sprintData.partialBarrelPercent}%)
                                  </Typography>
                                </Box>
                              </Paper>
                            </Grid>
                          )}

                          {/* Breakdown dzienny - kompaktowy */}
                          <Grid item xs={12}>
                            <Paper sx={{ p: 1.5 }} elevation={1}>
                              <Typography variant="caption" sx={{ fontWeight: 600, display: 'block', mb: 1 }}>
                                📅 BREAKDOWN
                              </Typography>
                              <Grid container spacing={1}>
                                {[
                                  { day: 'Pon', full: 'Poniedziałek' },
                                  { day: 'Wt', full: 'Wtorek' },
                                  { day: 'Śr', full: 'Środa' },
                                  { day: 'Czw', full: 'Czwartek' },
                                  { day: 'Pt', full: 'Piątek - SPRZĄTANIE', special: true }
                                ].map((item, idx) => (
                                  <Grid item xs={6} sm={2.4} key={idx}>
                                    <Box sx={{ 
                                      p: 1, 
                                      border: '1px solid', 
                                      borderColor: item.special ? 'warning.main' : 'divider',
                                      bgcolor: item.special ? 'warning.light' : 'transparent',
                                      borderRadius: 1,
                                      textAlign: 'center',
                                      opacity: item.special ? 0.6 : 1
                                    }}>
                                      <Typography variant="caption" sx={{ display: 'block', fontWeight: 600, mb: 0.5 }}>
                                        {item.day}
                                      </Typography>
                                      {!item.special ? (
                                        <>
                                          <Typography variant="body2" sx={{ fontWeight: 'bold', fontSize: '0.9rem' }}>
                                            ~{sprintData.avgMixingsPerDay}
                                          </Typography>
                                          <Typography variant="caption" color="text.secondary">
                                            ~{sprintData.avgPiecesPerDay.toLocaleString('pl-PL')} szt.
                                          </Typography>
                                        </>
                                      ) : (
                                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                          Brak produkcji
                                        </Typography>
                                      )}
                                    </Box>
                                  </Grid>
                                ))}
                              </Grid>
                            </Paper>
                          </Grid>
                        </Grid>
                      </Box>
                    </Collapse>
                  </TableCell>
                </TableRow>
              </React.Fragment>
            );
          })}
          
          {/* Wiersz podsumowania */}
          <TableRow sx={{ '& td': { fontWeight: 'bold', bgcolor: 'action.hover' } }}>
            <TableCell />
            <TableCell>
              {t('mixingAnalytics.table.total', 'SUMA')}
              <Typography variant="caption" display="block" sx={{ fontWeight: 'normal', opacity: 0.7 }}>
                ({stats.totalActualProductionDays || 0} {(stats.totalActualProductionDays || 0) === 1 ? 'dzień' : 'dni'}, {stats.totalActualProductionWeeks || 0} {(stats.totalActualProductionWeeks || 0) === 1 ? 'tydzień' : 'tygodni'})
              </Typography>
            </TableCell>
            <TableCell align="center">
              <Chip label={stats.totalMixings} size="small" color="primary" />
            </TableCell>
            <TableCell align="right">{stats.totalPieces.toLocaleString('pl-PL')}</TableCell>
            <TableCell align="right">{stats.avgPiecesPerMixing.toLocaleString('pl-PL')}</TableCell>
            <TableCell align="right">
              <Tooltip title={`${stats.totalActualProductionWeeks} ${(stats.totalActualProductionWeeks || 0) === 1 ? 'tydzień' : 'tygodni'} produkcji z ${workWeeksInPeriod.toFixed(1)} tygodni w okresie`}>
                <span>{stats.avgMixingsPerWeek}</span>
              </Tooltip>
            </TableCell>
            <TableCell align="right">
              <Tooltip title={`${stats.totalActualProductionDays} dni produkcji z ${workDaysInPeriod} dni roboczych`}>
                <span>{stats.avgPiecesPerDay.toLocaleString('pl-PL')}</span>
              </Tooltip>
            </TableCell>
            <TableCell align="center">-</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );

  // Render wykresu dziennego
  const renderDailyChart = () => (
    <Box sx={{ width: '100%', height: 400 }}>
      <ResponsiveContainer>
        <BarChart data={dailyChartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis yAxisId="left" orientation="left" stroke={theme.palette.primary.main} />
          <YAxis yAxisId="right" orientation="right" stroke={theme.palette.secondary.main} />
          <RechartsTooltip 
            contentStyle={{ 
              backgroundColor: isDarkMode ? '#333' : '#fff',
              border: `1px solid ${isDarkMode ? '#555' : '#ccc'}`
            }}
          />
          <Legend />
          <Bar 
            yAxisId="left" 
            dataKey="mixings" 
            name={t('mixingAnalytics.chart.mixings', 'Liczba mieszań')} 
            fill={theme.palette.primary.main} 
          />
          <Bar 
            yAxisId="right" 
            dataKey="pieces" 
            name={t('mixingAnalytics.chart.pieces', 'Liczba sztuk')} 
            fill={theme.palette.secondary.main} 
          />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );

  // Render wykresu tygodniowego
  const renderWeeklyChart = () => (
    <Box sx={{ width: '100%', height: 400 }}>
      <ResponsiveContainer>
        <BarChart data={weeklyChartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" />
          <YAxis yAxisId="left" orientation="left" stroke={theme.palette.primary.main} />
          <YAxis yAxisId="right" orientation="right" stroke={theme.palette.secondary.main} />
          <RechartsTooltip 
            contentStyle={{ 
              backgroundColor: isDarkMode ? '#333' : '#fff',
              border: `1px solid ${isDarkMode ? '#555' : '#ccc'}`
            }}
          />
          <Legend />
          <Bar 
            yAxisId="left" 
            dataKey="mixings" 
            name={t('mixingAnalytics.chart.mixings', 'Liczba mieszań')} 
            fill={theme.palette.primary.main} 
          />
          <Bar 
            yAxisId="right" 
            dataKey="pieces" 
            name={t('mixingAnalytics.chart.pieces', 'Liczba sztuk')} 
            fill={theme.palette.secondary.main} 
          />
        </BarChart>
      </ResponsiveContainer>
    </Box>
  );

  // Render wykresu trendu
  const renderTrendChart = () => (
    <Box sx={{ width: '100%', height: 400 }}>
      <ResponsiveContainer>
        <LineChart data={dailyChartData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis yAxisId="left" orientation="left" stroke={theme.palette.primary.main} />
          <YAxis yAxisId="right" orientation="right" stroke={theme.palette.secondary.main} />
          <RechartsTooltip 
            contentStyle={{ 
              backgroundColor: isDarkMode ? '#333' : '#fff',
              border: `1px solid ${isDarkMode ? '#555' : '#ccc'}`
            }}
          />
          <Legend />
          <Line 
            yAxisId="left"
            type="monotone" 
            dataKey="mixings" 
            name={t('mixingAnalytics.chart.mixings', 'Liczba mieszań')} 
            stroke={theme.palette.primary.main}
            strokeWidth={2}
            dot={{ r: 4 }}
          />
          <Line 
            yAxisId="right"
            type="monotone" 
            dataKey="pieces" 
            name={t('mixingAnalytics.chart.pieces', 'Liczba sztuk')} 
            stroke={theme.palette.secondary.main}
            strokeWidth={2}
            dot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', pb: 4 }}>
      {/* Nagłówek */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          background: isDarkMode
            ? 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'
            : 'linear-gradient(135deg, #00c6ff 0%, #0072ff 100%)',
          color: 'white',
          borderRadius: 3
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 2,
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                mr: 2
              }}
            >
              <BlenderIcon sx={{ fontSize: 24, color: 'white' }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                {t('mixingAnalytics.title', 'Analiza Mieszań')}
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {t('mixingAnalytics.subtitle', 'Wydajność mieszalnika - produkcja per SKU')}
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title={t('mixingAnalytics.export.csvTooltip', 'Eksportuj do CSV')}>
              <IconButton 
                onClick={handleExportCSV} 
                sx={{ color: 'white' }}
                disabled={refreshing || filteredProductData.length === 0}
              >
                <DownloadIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('mixingAnalytics.refresh', 'Odśwież dane')}>
              <IconButton 
                onClick={handleRefresh} 
                sx={{ color: 'white' }}
                disabled={refreshing}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      </Paper>

      {/* Filtry */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          <FilterIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            {t('mixingAnalytics.filters.title', 'Filtry')}
          </Typography>
        </Box>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Typ daty:
              </Typography>
              <ToggleButtonGroup
                value={dateMode}
                exclusive
                onChange={(e, newMode) => {
                  if (newMode !== null) {
                    setDateMode(newMode);
                  }
                }}
                size="small"
              >
                <ToggleButton value="execution">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CalendarIcon fontSize="small" />
                    <Typography variant="body2">Data wykonania</Typography>
                  </Box>
                </ToggleButton>
                <ToggleButton value="scheduled">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TimelineIcon fontSize="small" />
                    <Typography variant="body2">Data planowania</Typography>
                  </Box>
                </ToggleButton>
              </ToggleButtonGroup>
              <Tooltip title={dateMode === 'execution' 
                ? 'Pokazuje dane na podstawie faktycznych dat wykonania (z odchaczonych checkboxów)' 
                : 'Pokazuje dane na podstawie dat planowania zadań'}>
                <FilterIcon sx={{ color: 'text.secondary', cursor: 'help' }} />
              </Tooltip>
            </Box>
          </Grid>
          
          {/* Przełącznik typu produktu */}
          <Grid item xs={12} md={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ToggleButtonGroup
                value={productType}
                exclusive
                onChange={(e, newValue) => {
                  if (newValue !== null) {
                    setProductType(newValue);
                  }
                }}
                size="small"
                fullWidth
                sx={{
                  '& .MuiToggleButton-root': {
                    textTransform: 'none',
                    px: 2
                  }
                }}
              >
                <ToggleButton value="all">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2">{t('mixingAnalytics.filters.allTypes', 'Wszystkie')}</Typography>
                  </Box>
                </ToggleButton>
                <ToggleButton value="powder">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2">📊 {t('mixingAnalytics.filters.powder', 'Proszki')}</Typography>
                  </Box>
                </ToggleButton>
                <ToggleButton value="capsules">
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2">💊 {t('mixingAnalytics.filters.capsules', 'Kapsułki')}</Typography>
                  </Box>
                </ToggleButton>
              </ToggleButtonGroup>
              <Tooltip title={t('mixingAnalytics.filters.productTypeTooltip', 'Filtruj produkty według typu: proszki (szt., kg) lub kapsułki (caps)')}>
                <FilterIcon sx={{ color: 'text.secondary', cursor: 'help' }} />
              </Tooltip>
            </Box>
          </Grid>

          <Grid item xs={12} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label={t('mixingAnalytics.filters.startDate', 'Data początkowa')}
                value={displayStartDate}
                onChange={setDisplayStartDate}
                slotProps={{ 
                  textField: { 
                    fullWidth: true,
                    helperText: isDebouncing ? 'Aktualizacja danych...' : '',
                    InputProps: {
                      endAdornment: isDebouncing && (
                        <Tooltip title="Dane zaktualizują się za chwilę...">
                          <CircularProgress size={20} sx={{ mr: 1 }} />
                        </Tooltip>
                      )
                    }
                  } 
                }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label={t('mixingAnalytics.filters.endDate', 'Data końcowa')}
                value={displayEndDate}
                onChange={setDisplayEndDate}
                slotProps={{ 
                  textField: { 
                    fullWidth: true,
                    helperText: isDebouncing ? 'Aktualizacja danych...' : '',
                    InputProps: {
                      endAdornment: isDebouncing && (
                        <Tooltip title="Dane zaktualizują się za chwilę...">
                          <CircularProgress size={20} sx={{ mr: 1 }} />
                        </Tooltip>
                      )
                    }
                  } 
                }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} md={3}>
            <Autocomplete
              options={uniqueProducts}
              value={selectedProduct}
              onChange={(e, newValue) => setSelectedProduct(newValue || '')}
              renderInput={(params) => (
                <TextField 
                  {...params} 
                  label={t('mixingAnalytics.filters.product', 'SKU / Produkt')} 
                  fullWidth 
                />
              )}
              freeSolo
            />
          </Grid>
          <Grid item xs={12} md={3}>
            <FormControl fullWidth>
              <InputLabel>{t('mixingAnalytics.filters.customer', 'Klient')}</InputLabel>
              <Select
                value={selectedCustomer}
                onChange={(e) => setSelectedCustomer(e.target.value)}
                label={t('mixingAnalytics.filters.customer', 'Klient')}
              >
                <MenuItem value="all">{t('mixingAnalytics.filters.allCustomers', 'Wszyscy klienci')}</MenuItem>
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

      {/* Alert informacyjny - kompaktowy */}
      {dateMode === 'execution' && mixingData.unrealizedCount > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="body2">
            Pominięto {mixingData.unrealizedCount} niezrealizowanych mieszań (realizacja: {mixingData.realizationRate}%)
          </Typography>
        </Alert>
      )}

      {/* Karty statystyk */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white'
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {t('mixingAnalytics.stats.totalMixings', 'Łączna liczba mieszań')}
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {stats.totalMixings}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
            color: 'white'
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {t('mixingAnalytics.stats.totalPieces', 'Łączna ilość sztuk')}
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {stats.totalPieces.toLocaleString('pl-PL')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
            color: 'white'
          }}>
            <CardContent>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {t('mixingAnalytics.stats.avgPiecesPerMixing', 'Śr. sztuk/mieszanie')}
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {stats.avgPiecesPerMixing.toLocaleString('pl-PL')}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Tooltip title={`Średnia z ${stats.totalActualProductionDays || 0} dni faktycznej produkcji (>=2 mieszań/dzień) z ${workDaysInPeriod} dni roboczych w okresie`}>
            <Card sx={{ 
              background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
              color: 'white',
              cursor: 'help'
            }}>
              <CardContent>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  {t('mixingAnalytics.stats.avgPiecesPerDay', 'Śr. sztuk/dzień')} *
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                  {stats.avgPiecesPerDay.toLocaleString('pl-PL')}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {stats.totalActualProductionDays || 0} {(stats.totalActualProductionDays || 0) === 1 ? 'dzień' : 'dni'} produkcji
                </Typography>
              </CardContent>
            </Card>
          </Tooltip>
        </Grid>
        <Grid item xs={12} sm={6} md={2.4}>
          <Tooltip title={`Średnia z ${stats.totalActualProductionWeeks || 0} ${(stats.totalActualProductionWeeks || 0) === 1 ? 'tygodnia' : 'tygodni'} z produkcją (nie ${workWeeksInPeriod.toFixed(1)} tygodni w okresie)`}>
            <Card sx={{ 
              background: 'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
              color: 'white',
              cursor: 'help'
            }}>
              <CardContent>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  {t('mixingAnalytics.stats.avgMixingsPerWeek', 'Śr. mieszań/tydzień')} *
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                  {stats.avgMixingsPerWeek}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  {stats.totalActualProductionWeeks || 0} {(stats.totalActualProductionWeeks || 0) === 1 ? 'tydzień' : 'tygodni'} produkcji
                </Typography>
              </CardContent>
            </Card>
          </Tooltip>
        </Grid>
      </Grid>

      {/* Główna zawartość z zakładkami */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs 
            value={activeTab} 
            onChange={(e, newValue) => setActiveTab(newValue)}
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab 
              icon={<TableIcon />} 
              iconPosition="start" 
              label={t('mixingAnalytics.tabs.table', 'Tabela per SKU')} 
            />
            <Tab 
              icon={<ChartIcon />} 
              iconPosition="start" 
              label={t('mixingAnalytics.tabs.daily', 'Rozkład dzienny')} 
            />
            <Tab 
              icon={<CalendarIcon />} 
              iconPosition="start" 
              label={t('mixingAnalytics.tabs.weekly', 'Rozkład tygodniowy')} 
            />
            <Tab 
              icon={<TimelineIcon />} 
              iconPosition="start" 
              label={t('mixingAnalytics.tabs.trend', 'Trend')} 
            />
          </Tabs>
        </Box>

        {/* Nagłówek z okresem */}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
          {t('mixingAnalytics.period', 'Okres')}: {formatDateDisplay(startDate)} - {formatDateDisplay(endDate)}
          {productType !== 'all' && ` | ${productType === 'powder' ? '📊 ' + t('mixingAnalytics.filters.powder', 'Proszki') : '💊 ' + t('mixingAnalytics.filters.capsules', 'Kapsułki')}`}
          {selectedProduct && ` | SKU: ${selectedProduct}`}
          {selectedCustomer !== 'all' && ` | Klient: ${customers.find(c => c.id === selectedCustomer)?.name || selectedCustomer}`}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
          Dni robocze: {workDaysInPeriod} | Tygodnie: {workWeeksInPeriod.toFixed(1)}
        </Typography>

        {/* Zawartość zakładek */}
        {activeTab === 0 && (
          filteredProductData.length > 0 ? renderMainTable() : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography variant="h6" color="text.secondary">
                {t('mixingAnalytics.emptyState.title', 'Brak danych mieszań w wybranym okresie')}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('mixingAnalytics.emptyState.description', 'Zmień zakres dat lub sprawdź czy zadania mają uzupełniony plan mieszań.')}
              </Typography>
            </Box>
          )
        )}

        {activeTab === 1 && (
          dailyChartData.length > 0 ? renderDailyChart() : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">
                {t('mixingAnalytics.emptyState.noChartData', 'Brak danych do wyświetlenia wykresu')}
              </Typography>
            </Box>
          )
        )}

        {activeTab === 2 && (
          weeklyChartData.length > 0 ? renderWeeklyChart() : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">
                {t('mixingAnalytics.emptyState.noChartData', 'Brak danych do wyświetlenia wykresu')}
              </Typography>
            </Box>
          )
        )}

        {activeTab === 3 && (
          dailyChartData.length > 0 ? renderTrendChart() : (
            <Box sx={{ textAlign: 'center', py: 4 }}>
              <Typography color="text.secondary">
                {t('mixingAnalytics.emptyState.noChartData', 'Brak danych do wyświetlenia wykresu')}
              </Typography>
            </Box>
          )
        )}
      </Paper>
    </Box>
  );
};

export default MixingAnalyticsPage;
