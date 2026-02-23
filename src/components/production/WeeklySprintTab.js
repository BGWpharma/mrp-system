// src/components/production/WeeklySprintTab.js
// Komponent zakładki Weekly Sprint - wydzielony z WeeklySprintPage
import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  IconButton,
  Tooltip,
  Alert,
  useTheme,
  alpha,
  Chip,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Collapse
} from '@mui/material';
import {
  CalendarMonth as CalendarIcon,
  Refresh as RefreshIcon,
  Download as DownloadIcon,
  FilterList as FilterIcon,
  Schedule as ScheduleIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { format, startOfDay, endOfDay, subMonths, getISOWeek, getISOWeekYear } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { exportToCSV, exportToExcel, formatDateForExport } from '../../utils/exportUtils';
import { getAllCustomers } from '../../services/customerService';

const getWeekKey = (date) => {
  const d = date instanceof Date ? date : 
            date?.toDate ? date.toDate() : 
            new Date(date);
  if (isNaN(d.getTime())) return null;
  return `${getISOWeekYear(d)}-W${String(getISOWeek(d)).padStart(2, '0')}`;
};

const calculateTrend = (samples) => {
  if (!samples || samples.length < 2) return { trend: 'stable', change: 0 };
  const midPoint = Math.floor(samples.length / 2);
  const firstHalf = samples.slice(0, midPoint);
  const secondHalf = samples.slice(midPoint);
  const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
  if (firstAvg === 0) return { trend: 'stable', change: 0 };
  const change = ((secondAvg - firstAvg) / firstAvg) * 100;
  const trend = change > 5 ? 'improving' : change < -5 ? 'declining' : 'stable';
  return { trend, change: Math.round(change * 10) / 10 };
};

const SprintSparkline = ({ data, theme }) => {
  if (!data || data.length < 2) return null;
  const width = 72;
  const height = 24;
  const pad = 2;
  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);
  const range = maxVal - minVal || 1;
  const first = data[0];
  const last = data[data.length - 1];
  const color = last > first ? theme.palette.success.main
    : last < first ? theme.palette.error.main
    : theme.palette.text.secondary;
  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (width - 2 * pad);
    const y = height - pad - ((v - minVal) / range) * (height - 2 * pad);
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pad + ((data.length - 1) / (data.length - 1)) * (width - 2 * pad)} cy={height - pad - ((last - minVal) / range) * (height - 2 * pad)} r="2.5" fill={color} />
    </svg>
  );
};

const WeeklySprintTab = ({ isMobileView }) => {
  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  const { t } = useTranslation('analytics');
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === 'dark';

  // Stan
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [productionTasks, setProductionTasks] = useState([]);
  const [skuData, setSkuData] = useState([]);
  const [startHour, setStartHour] = useState(6);
  const [endHour, setEndHour] = useState(22);
  
  // Debounced dates
  const [displayStartDate, setDisplayStartDate] = useState(subMonths(new Date(), 1));
  const [displayEndDate, setDisplayEndDate] = useState(new Date());
  const [startDate, setStartDate] = useState(subMonths(new Date(), 1));
  const [endDate, setEndDate] = useState(new Date());
  
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [customers, setCustomers] = useState([]);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [productType, setProductType] = useState('all');

  const availableMinutesPerDay = useMemo(() => {
    return (endHour - startHour) * 60;
  }, [startHour, endHour]);

  // Debounce dla dat
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

  // Pobierz listę klientów
  useEffect(() => {
    let cancelled = false;
    const fetchCustomers = async () => {
      try {
        const data = await getAllCustomers();
        if (cancelled) return;
        setCustomers(data || []);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania klientów:', error);
      }
    };
    fetchCustomers();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const cancelCheck = { current: false };
    fetchMixingData(cancelCheck);
    return () => { cancelCheck.current = true; };
  }, [startDate, endDate, selectedCustomer]);

  const fetchMixingData = async (cancelCheck = { current: false }) => {
    try {
      setLoading(true);

      const tasksRef = collection(db, 'productionTasks');
      const startTimestamp = Timestamp.fromDate(startOfDay(startDate));
      const endTimestamp = Timestamp.fromDate(endOfDay(endDate));

      const q = query(
        tasksRef,
        where('scheduledDate', '>=', startTimestamp),
        where('scheduledDate', '<=', endTimestamp)
      );

      const snapshot = await getDocs(q);
      if (cancelCheck.current) return;
      const tasks = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        
        if (selectedCustomer !== 'all') {
          const taskCustomerId = data.customerId || data.customer?.id;
          if (taskCustomerId !== selectedCustomer) {
            return;
          }
        }
        
        if (data.mixingPlanChecklist && data.mixingPlanChecklist.length > 0) {
          tasks.push({
            id: doc.id,
            ...data
          });
        }
      });

      setProductionTasks(tasks);
      const processedData = processMixingDataPerSKU(tasks);
      setSkuData(processedData);
    } catch (error) {
      if (cancelCheck.current) return;
      console.error('Błąd podczas pobierania danych mieszań:', error);
      showError('Nie udało się pobrać danych');
    } finally {
      if (!cancelCheck.current) setLoading(false);
    }
  };

  const parsePiecesCount = (details) => {
    if (!details) return 0;
    const match = details.match(/Liczba sztuk:\s*([\d,\.]+)/);
    if (match) {
      return parseFloat(match[1].replace(',', '.')) || 0;
    }
    return 0;
  };
  
  const CAPSULES_PER_PACKAGE_MAP = {
    'GRN-SPIRULINA-CAPS': 120,
    'GRN-OMEGA3-CAPS': 90,
    'GRN-PROBIOTICS-CAPS': 30,
    'GRN-PROBIOTICS-CAPS ': 30,
    'GRN-MULTIVITAMINS-CAPS': 30,
    'GRN-VITAMIND3-CAPS': 60,
    'GRN-SLEEP-CAPS': 60,
    'GRN-MAGNESIUM-CAPS': 60,
    'GRN-ZINC-CAPS': 120,
    'BW3Y-ZMMB': 60,
    'BW3Y-MULTIVIT': 90,
  };
  
  const parseCapsulesPerPackage = (productName, taskData = null) => {
    if (!productName) return null;
    
    if (taskData?.recipe) {
      const recipe = taskData.recipe;
      const possibleFields = [
        'capsulesPerPackage', 'capsulesPerUnit', 'capsules',
        'capsulesCount', 'quantity', 'pieceSize',
      ];
      
      for (const field of possibleFields) {
        if (recipe[field] && typeof recipe[field] === 'number') {
          const capsules = recipe[field];
          if (capsules >= 30 && capsules <= 240) {
            return capsules;
          }
        }
      }
      
      if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
        for (const ingredient of recipe.ingredients) {
          if (ingredient.name && ingredient.name.toLowerCase().includes('kapsułk')) {
            if (ingredient.quantity && typeof ingredient.quantity === 'number') {
              const capsules = ingredient.quantity;
              if (capsules >= 30 && capsules <= 240) {
                return capsules;
              }
            }
          }
        }
      }
    }
    
    const normalizedName = productName.trim();
    if (CAPSULES_PER_PACKAGE_MAP[normalizedName]) {
      return CAPSULES_PER_PACKAGE_MAP[normalizedName];
    }
    
    const patterns = [
      /CAPS-(\d+)/i, /CAPSULE-(\d+)/i, /-(\d+)$/, /(\d+)CAPS/i,
    ];
    
    for (const pattern of patterns) {
      const match = productName.match(pattern);
      if (match) {
        return parseInt(match[1]);
      }
    }
    
    if (taskData) {
      if (taskData.mixingPlanChecklist && taskData.mixingPlanChecklist.length > 0) {
        const firstMixing = taskData.mixingPlanChecklist[0];
        if (firstMixing.details) {
          const detailPatterns = [
            /(\d+)\s*kaps/i, /kaps.*?(\d+)/i, /caps.*?(\d+)/i,
            /(\d+)\s*caps/i, /(\d+)\s*sztuk.*kaps/i,
          ];
          
          for (const pattern of detailPatterns) {
            const match = firstMixing.details.match(pattern);
            if (match) {
              const capsules = parseInt(match[1]);
              if (capsules >= 30 && capsules <= 240) {
                return capsules;
              }
            }
          }
        }
      }
      
      if (taskData.output?.description) {
        const outputPatterns = [/(\d+)\s*kaps/i, /kaps.*?(\d+)/i];
        for (const pattern of outputPatterns) {
          const match = taskData.output.description.match(pattern);
          if (match) {
            const capsules = parseInt(match[1]);
            if (capsules >= 30 && capsules <= 240) {
              return capsules;
            }
          }
        }
      }
    }
    
    return null;
  };

  const parseUnit = (details) => {
    if (!details) return null;
    
    let match = details.match(/(?:Liczba sztuk|Ilość):\s*[\d,\.]+\s*([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)/i);
    if (match) return match[1];
    
    if (/caps|capsule|kapsułk/i.test(details)) return 'caps';
    
    match = details.match(/[\d,\.]+\s*([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)/);
    if (match) return match[1];
    
    return null;
  };

  const getProductCategory = (unit, productName = '', workstationName = '') => {
    if (workstationName) {
      const lineLower = workstationName.toLowerCase();
      if (lineLower.includes('pill') || lineLower.includes('capsule') || lineLower.includes('kapsułk')) {
        return 'capsules';
      }
    }
    
    const nameLower = productName.toLowerCase();
    const capsulePatterns = ['caps', 'capsule', 'kapsułk', '-cap-', 'zmmb', 'q3-caps'];
    if (capsulePatterns.some(pattern => nameLower.includes(pattern))) {
      return 'capsules';
    }
    
    if (!unit) return 'powder';
    const unitLower = unit.toLowerCase();
    if (unitLower === 'caps' || unitLower.includes('cap') || unitLower.includes('capsule')) {
      return 'capsules';
    }
    
    return 'powder';
  };

  const processMixingDataPerSKU = (tasks) => {
    const skuMap = {};

    tasks.forEach(task => {
      const productName = task.recipeName || task.productName || 'Nieznany produkt';
      const workstationName = task.workstationName || '';

      const mixingHeaders = task.mixingPlanChecklist?.filter(item => item.type === 'header') || [];
      if (mixingHeaders.length === 0) return;

      const sortedMixings = [...mixingHeaders].sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          const aTime = a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const bTime = b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return aTime - bTime;
        }
        return a.id.localeCompare(b.id);
      });

      const firstMixing = sortedMixings[0];
      const piecesPerMixing = parsePiecesCount(firstMixing.details);
      const unitFromMixing = parseUnit(firstMixing.details);
      const productUnit = unitFromMixing || task.unit || task.output?.unit || task.recipe?.unit || 'szt.';
      const productCategory = getProductCategory(productUnit, productName, workstationName);

      // KAPSUŁKI
      if (productCategory === 'capsules') {
        const productionSessions = task.productionSessions || [];
        if (productionSessions.length === 0) return;
        
        productionSessions.forEach((session, sessionIndex) => {
          const completedPackages = parseFloat(session.completedQuantity) || 0;
          const timeSpentMinutes = parseFloat(session.timeSpent) || 0;
          
          let packagingTimeMinutes = timeSpentMinutes;
          if (!timeSpentMinutes && session.startDate && session.endDate) {
            const sDate = session.startDate instanceof Date ? session.startDate :
                            session.startDate?.toDate ? session.startDate.toDate() :
                            new Date(session.startDate);
            const eDate = session.endDate instanceof Date ? session.endDate :
                          session.endDate?.toDate ? session.endDate.toDate() :
                          new Date(session.endDate);
            packagingTimeMinutes = (eDate - sDate) / (1000 * 60);
          }
          
          const packagingTimeHours = packagingTimeMinutes / 60;
          
          if (completedPackages === 0) return;
          if (packagingTimeMinutes < 5) return;
          
          const packagesPerHour = packagingTimeHours > 0 && completedPackages > 0
            ? completedPackages / packagingTimeHours 
            : 0;
          
          if (packagesPerHour > 1000) return;
          
          if (!skuMap[productName]) {
            const capsulesPerPackage = parseCapsulesPerPackage(productName, task);
            
            skuMap[productName] = {
              sku: productName,
              unit: 'szt.',
              category: 'capsules',
              workstationName: workstationName,
              packagesPerHour: packagesPerHour,
              capsulesPerPackage: capsulesPerPackage,
              totalPackages: 0,
              totalPackagingTime: 0,
              tasks: new Set(),
              packagingSamples: [],
              productivitySamples: []
            };
          }
          
          skuMap[productName].totalPackages += completedPackages;
          skuMap[productName].totalPackagingTime += packagingTimeMinutes;
          skuMap[productName].tasks.add(task.id);
          skuMap[productName].packagingSamples.push({
            packages: completedPackages,
            timeMinutes: packagingTimeMinutes,
            packagesPerHour: packagesPerHour
          });
          const sessionDate = session.startDate || session.endDate || task.scheduledDate;
          const weekKey = getWeekKey(sessionDate);
          if (weekKey) {
            skuMap[productName].productivitySamples.push({ weekKey, value: packagesPerHour });
          }
        });
        
        return;
      }

      // PROSZKI
      const getMixingCheckboxes = (mixingId) => {
        return task.mixingPlanChecklist?.filter(
          item => item.parentId === mixingId && item.type === 'check'
        ) || [];
      };

      const mixingTimes = [];
      sortedMixings.forEach((mixing, index) => {
        const checkboxes = getMixingCheckboxes(mixing.id);
        const completedChecks = checkboxes
          .filter(item => item.completed && item.completedAt)
          .map(item => ({
            ...item,
            dateObj: item.completedAt.toDate ? item.completedAt.toDate() : new Date(item.completedAt)
          }))
          .sort((a, b) => a.dateObj - b.dateObj);

        if (completedChecks.length > 0) {
          const firstCheckTime = completedChecks[0].dateObj;
          mixingTimes.push({
            mixingIndex: index,
            startTime: firstCheckTime,
            pieces: parsePiecesCount(mixing.details)
          });
        }
      });

      const timeDifferences = [];
      for (let i = 1; i < mixingTimes.length; i++) {
        const prev = mixingTimes[i - 1];
        const curr = mixingTimes[i];
        const prevDay = format(prev.startTime, 'yyyy-MM-dd');
        const currDay = format(curr.startTime, 'yyyy-MM-dd');
        if (prevDay === currDay) {
          const diffMs = curr.startTime - prev.startTime;
          const diffMinutes = diffMs / (1000 * 60);
          timeDifferences.push(diffMinutes);
        }
      }

      const avgTimePerMixing = timeDifferences.length > 0
        ? timeDifferences.reduce((sum, val) => sum + val, 0) / timeDifferences.length
        : null;

      if (!skuMap[productName]) {
        skuMap[productName] = {
          sku: productName,
          unit: productUnit,
          category: productCategory,
          workstationName: workstationName,
          piecesPerMixing: piecesPerMixing,
          avgTimePerMixing: avgTimePerMixing,
          totalMixings: 0,
          totalPieces: 0,
          tasks: new Set(),
          timeSamples: [],
          productivitySamples: []
        };
      }

      skuMap[productName].totalMixings += sortedMixings.length;
      skuMap[productName].totalPieces += sortedMixings.reduce((sum, m) => sum + parsePiecesCount(m.details), 0);
      skuMap[productName].tasks.add(task.id);
      
      if (avgTimePerMixing !== null) {
        skuMap[productName].timeSamples.push(avgTimePerMixing);
        if (piecesPerMixing > 0 && avgTimePerMixing > 0) {
          const weekKey = getWeekKey(task.scheduledDate);
          const prodPerHour = (piecesPerMixing / avgTimePerMixing) * 60;
          if (weekKey) {
            skuMap[productName].productivitySamples.push({ weekKey, value: prodPerHour });
          }
        }
      }
    });

    return Object.values(skuMap).map(sku => {
      // Agreguj produktywność per tydzień
      const weekMap = {};
      (sku.productivitySamples || []).forEach(s => {
        if (!weekMap[s.weekKey]) weekMap[s.weekKey] = [];
        weekMap[s.weekKey].push(s.value);
      });
      const weeklyProductivity = Object.entries(weekMap)
        .map(([week, vals]) => ({ week, avg: vals.reduce((a, b) => a + b, 0) / vals.length }))
        .sort((a, b) => a.week.localeCompare(b.week));
      const trendData = calculateTrend(weeklyProductivity.map(w => w.avg));

      if (sku.category === 'capsules') {
        const avgPackagesPerHour = sku.packagingSamples && sku.packagingSamples.length > 0
          ? sku.packagingSamples.reduce((sum, sample) => sum + sample.packagesPerHour, 0) / sku.packagingSamples.length
          : sku.packagesPerHour || 0;
        
        return {
          ...sku, tasksCount: sku.tasks.size, packagesPerHour: avgPackagesPerHour,
          productivityPerHour: Math.round(avgPackagesPerHour * 10) / 10,
          productivityUnit: 'opak/h',
          weeklyProductivity, trend: trendData.trend, trendChange: trendData.change
        };
      }
      
      const avgTime = sku.timeSamples.length > 0
        ? sku.timeSamples.reduce((sum, val) => sum + val, 0) / sku.timeSamples.length
        : sku.avgTimePerMixing;

      const prodPerHour = avgTime > 0 && sku.piecesPerMixing > 0
        ? Math.round(((sku.piecesPerMixing / avgTime) * 60) * 10) / 10
        : null;

      return {
        ...sku, tasksCount: sku.tasks.size, avgTimePerMixing: avgTime,
        productivityPerHour: prodPerHour,
        productivityUnit: 'szt/h',
        weeklyProductivity, trend: trendData.trend, trendChange: trendData.change
      };
    }).sort((a, b) => {
      const aTotal = a.category === 'capsules' ? a.totalPackages : a.totalPieces;
      const bTotal = b.category === 'capsules' ? b.totalPackages : b.totalPieces;
      return bTotal - aTotal;
    });
  };

  const filteredSkuData = useMemo(() => {
    if (productType === 'all') return skuData;
    return skuData.filter(sku => sku.category === productType);
  }, [skuData, productType]);

  const calculateSprintPlan = useMemo(() => {
    return filteredSkuData.map(sku => {
      if (sku.category === 'capsules') {
        const packagesPerHour = sku.packagesPerHour || 0;
        const capsulesPerPackage = sku.capsulesPerPackage || null;
        const BARRELS_CAPACITY = 15000;
        
        if (!packagesPerHour || packagesPerHour === 0) {
          return { ...sku, estimatedPackagesPerDay: null, estimatedBarrelsPerDay: null, weeklyPlan: null, totalSprintPackages: null, totalSprintBarrels: null };
        }
        
        const workHoursPerDay = availableMinutesPerDay / 60;
        const packagesPerDay = Math.floor(packagesPerHour * workHoursPerDay);
        
        let barrelsPerDay = null;
        if (capsulesPerPackage) {
          const capsulesPerDay = packagesPerDay * capsulesPerPackage;
          barrelsPerDay = capsulesPerDay / BARRELS_CAPACITY;
        }
        
        const weeklyPlan = [
          { day: 'Pon', packages: packagesPerDay || 0, barrels: barrelsPerDay || null },
          { day: 'Wt', packages: packagesPerDay || 0, barrels: barrelsPerDay || null },
          { day: 'Śr', packages: packagesPerDay || 0, barrels: barrelsPerDay || null },
          { day: 'Czw', packages: packagesPerDay || 0, barrels: barrelsPerDay || null }
        ];
        
        return {
          ...sku,
          estimatedPackagesPerDay: packagesPerDay,
          estimatedBarrelsPerDay: barrelsPerDay,
          weeklyPlan,
          totalSprintPackages: packagesPerDay * 4,
          totalSprintBarrels: barrelsPerDay ? barrelsPerDay * 4 : null
        };
      }
      
      const avgTime = sku.avgTimePerMixing;
      const piecesPerMixing = sku.piecesPerMixing || 0;
      
      if (!avgTime || !piecesPerMixing) {
        return { ...sku, estimatedMixingsPerDay: null, estimatedPiecesPerDay: null, weeklyPlan: null, totalSprintMixings: null, totalSprintPieces: null };
      }

      const mixingsPerDay = Math.floor(availableMinutesPerDay / avgTime);
      const piecesPerDay = mixingsPerDay * piecesPerMixing;

      const weeklyPlan = [
        { day: 'Pon', mixings: mixingsPerDay || 0, pieces: piecesPerDay || 0 },
        { day: 'Wt', mixings: mixingsPerDay || 0, pieces: piecesPerDay || 0 },
        { day: 'Śr', mixings: mixingsPerDay || 0, pieces: piecesPerDay || 0 },
        { day: 'Czw', mixings: mixingsPerDay || 0, pieces: piecesPerDay || 0 }
      ];

      return {
        ...sku,
        estimatedMixingsPerDay: mixingsPerDay,
        estimatedPiecesPerDay: piecesPerDay,
        weeklyPlan,
        totalSprintMixings: mixingsPerDay * 4,
        totalSprintPieces: piecesPerDay * 4
      };
    });
  }, [filteredSkuData, availableMinutesPerDay]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMixingData();
    setRefreshing(false);
    showInfo('Dane zostały odświeżone');
  };

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

  const handleExport = () => {
    if (calculateSprintPlan.length === 0) {
      showError(t('weeklySprint.errors.noDataToExport'));
      return;
    }

    try {
      const powdersData = calculateSprintPlan.filter(sku => sku.category === 'powder');
      const capsulesData = calculateSprintPlan.filter(sku => sku.category === 'capsules');
      
      const worksheets = [];
      
      if (powdersData.length > 0) {
        const powdersExportData = powdersData.map(sku => ({
          'SKU': sku.sku,
          'Pieces per Mixing': sku.piecesPerMixing || '-',
          'Time per Mixing (min)': sku.avgTimePerMixing ? sku.avgTimePerMixing.toFixed(1) : '-',
          'Productivity (pcs/h)': sku.productivityPerHour || '-',
          'Trend (%)': sku.trendChange !== undefined ? sku.trendChange : '-',
          'Trend Direction': sku.trend || '-',
          'Mixings per Day': sku.estimatedMixingsPerDay || '-',
          'Pieces per Day': sku.estimatedPiecesPerDay || '-',
          'Sprint Mixings (Mon-Thu)': sku.totalSprintMixings || '-',
          'Sprint Pieces (Mon-Thu)': sku.totalSprintPieces || '-'
        }));
        
        worksheets.push({
          name: 'Powders',
          data: powdersExportData,
          headers: [
            { label: 'SKU', key: 'SKU' },
            { label: 'Pieces per Mixing', key: 'Pieces per Mixing' },
            { label: 'Time per Mixing (min)', key: 'Time per Mixing (min)' },
            { label: 'Productivity (pcs/h)', key: 'Productivity (pcs/h)' },
            { label: 'Trend (%)', key: 'Trend (%)' },
            { label: 'Trend Direction', key: 'Trend Direction' },
            { label: 'Mixings per Day', key: 'Mixings per Day' },
            { label: 'Pieces per Day', key: 'Pieces per Day' },
            { label: 'Sprint Mixings (Mon-Thu)', key: 'Sprint Mixings (Mon-Thu)' },
            { label: 'Sprint Pieces (Mon-Thu)', key: 'Sprint Pieces (Mon-Thu)' }
          ]
        });
      }
      
      if (capsulesData.length > 0) {
        const capsulesExportData = capsulesData.map(sku => ({
          'SKU': sku.sku,
          'Capsules per Package': sku.capsulesPerPackage || '-',
          'Packages per Hour': sku.packagesPerHour ? sku.packagesPerHour.toFixed(1) : '-',
          'Productivity (pkg/h)': sku.productivityPerHour || '-',
          'Trend (%)': sku.trendChange !== undefined ? sku.trendChange : '-',
          'Trend Direction': sku.trend || '-',
          'Packages per Day': sku.estimatedPackagesPerDay || '-',
          'Barrels per Day (15k)': sku.estimatedBarrelsPerDay ? sku.estimatedBarrelsPerDay.toFixed(2) : '-',
          'Sprint Packages (Mon-Thu)': sku.totalSprintPackages || '-',
          'Sprint Barrels (Mon-Thu)': sku.totalSprintBarrels ? sku.totalSprintBarrels.toFixed(2) : '-'
        }));
        
        worksheets.push({
          name: 'Capsules',
          data: capsulesExportData,
          headers: [
            { label: 'SKU', key: 'SKU' },
            { label: 'Capsules per Package', key: 'Capsules per Package' },
            { label: 'Packages per Hour', key: 'Packages per Hour' },
            { label: 'Productivity (pkg/h)', key: 'Productivity (pkg/h)' },
            { label: 'Trend (%)', key: 'Trend (%)' },
            { label: 'Trend Direction', key: 'Trend Direction' },
            { label: 'Packages per Day', key: 'Packages per Day' },
            { label: 'Barrels per Day (15k)', key: 'Barrels per Day (15k)' },
            { label: 'Sprint Packages (Mon-Thu)', key: 'Sprint Packages (Mon-Thu)' },
            { label: 'Sprint Barrels (Mon-Thu)', key: 'Sprint Barrels (Mon-Thu)' }
          ]
        });
      }
      
      const startDateStr = formatDateForExport(displayStartDate, 'yyyyMMdd');
      const endDateStr = formatDateForExport(displayEndDate, 'yyyyMMdd');
      const customerStr = selectedCustomer !== 'all' 
        ? `_${customers.find(c => c.id === selectedCustomer)?.name?.replace(/\s+/g, '_') || 'customer'}`
        : '';
      const filename = `weekly_sprint_${startDateStr}_${endDateStr}${customerStr}`;

      const success = exportToExcel(worksheets, filename);
      if (success) {
        showSuccess(t('weeklySprint.export.success'));
      }
    } catch (error) {
      console.error('Export error:', error);
      showError(t('weeklySprint.export.error'));
    }
  };


  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Filtry */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <FilterIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Filtry
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Eksportuj do Excel">
              <IconButton 
                onClick={handleExport} 
                color="primary"
                disabled={refreshing || loading}
              >
                <DownloadIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title={t('common:common.refreshData')}>
              <IconButton 
                onClick={handleRefresh} 
                color="primary"
                disabled={refreshing || loading}
              >
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={2.4}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label={t('common:common.startDate')}
                value={displayStartDate}
                onChange={setDisplayStartDate}
                slotProps={{ 
                  textField: { 
                    fullWidth: true,
                    size: 'small',
                    helperText: isDebouncing ? 'Aktualizacja danych...' : '',
                    InputProps: {
                      endAdornment: isDebouncing && (
                        <Tooltip title={t('weeklySprint.dataWillUpdateSoon')}>
                          <CircularProgress size={20} sx={{ mr: 1 }} />
                        </Tooltip>
                      )
                    }
                  } 
                }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} md={2.4}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label={t('common:common.endDate')}
                value={displayEndDate}
                onChange={setDisplayEndDate}
                slotProps={{ 
                  textField: { 
                    fullWidth: true,
                    size: 'small',
                    helperText: isDebouncing ? 'Aktualizacja danych...' : '',
                    InputProps: {
                      endAdornment: isDebouncing && (
                        <Tooltip title={t('weeklySprint.dataWillUpdateSoon')}>
                          <CircularProgress size={20} sx={{ mr: 1 }} />
                        </Tooltip>
                      )
                    }
                  } 
                }}
              />
            </LocalizationProvider>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Typ produktu</InputLabel>
              <Select
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                label="Typ produktu"
              >
                <MenuItem value="all">Wszystkie</MenuItem>
                <MenuItem value="powder">Proszki</MenuItem>
                <MenuItem value="capsules">Kapsułki</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
            <FormControl fullWidth size="small">
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
          <Grid item xs={6} md={1.6}>
            <FormControl fullWidth size="small">
              <InputLabel>Godz. start</InputLabel>
              <Select
                value={startHour}
                onChange={(e) => setStartHour(e.target.value)}
                label="Godz. start"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <MenuItem key={i} value={i}>{i}:00</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6} md={1.6}>
            <FormControl fullWidth size="small">
              <InputLabel>Godz. koniec</InputLabel>
              <Select
                value={endHour}
                onChange={(e) => setEndHour(e.target.value)}
                label="Godz. koniec"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <MenuItem key={i + 1} value={i + 1}>{i + 1}:00</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        <Box sx={{ mt: 2, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: 'info.contrastText' }}>
            Czas pracy: {startHour}:00 - {endHour}:00 ({endHour - startHour}h = {availableMinutesPerDay} minut/dzień)
          </Typography>
          <Typography variant="caption" sx={{ color: 'info.contrastText', opacity: 0.9 }}>
            Sprint: Poniedziałek - Czwartek (4 dni) | Piątek: Sprzątanie
          </Typography>
        </Box>
      </Paper>

      {/* Główna tabela */}
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <CalendarIcon sx={{ mr: 1, color: 'primary.main' }} />
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Analiza per SKU
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary">
            Okres: {format(displayStartDate, 'dd.MM.yyyy', { locale: pl })} - {format(displayEndDate, 'dd.MM.yyyy', { locale: pl })}
            {productType !== 'all' && ` | ${productType === 'powder' ? 'Proszki' : 'Kapsułki'}`}
            {selectedCustomer !== 'all' && ` | Klient: ${customers.find(c => c.id === selectedCustomer)?.name || selectedCustomer}`}
            {isDebouncing && ' (ładowanie...)'}
          </Typography>
        </Box>

        {calculateSprintPlan.length > 0 ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold', width: 50 }} />
                  <TableCell sx={{ fontWeight: 'bold' }}>SKU</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Parametry</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: alpha(theme.palette.success.main, 0.08) }}>
                    Wydajność (j/h)
                  </TableCell>
                  <TableCell align="center" sx={{ fontWeight: 'bold', bgcolor: alpha(theme.palette.info.main, 0.08) }}>
                    Trend
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Dziennie</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold', bgcolor: 'primary.light', color: 'primary.contrastText' }}>
                    Sprint (Pon-Czw)
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {calculateSprintPlan.map((sku, index) => {
                  const isExpanded = expandedRows.has(sku.sku);
                  
                  return (
                    <React.Fragment key={sku.sku}>
                      <TableRow hover sx={{ '& > *': { borderBottom: isExpanded ? 'unset' : undefined }, cursor: 'pointer' }} onClick={() => toggleRowExpanded(sku.sku)}>
                        <TableCell>
                          <IconButton size="small">
                            {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                          </IconButton>
                        </TableCell>
                        <TableCell sx={{ fontWeight: 'medium' }}>
                          {sku.category === 'capsules' ? '💊 ' : '📊 '}
                          {sku.sku}
                        </TableCell>
                        
                        <TableCell align="right">
                          {sku.category === 'capsules' ? (
                            sku.packagesPerHour ? (
                              <Chip label={`${Math.round(sku.packagesPerHour)} opak/h`} size="small" color="success" variant="outlined" />
                            ) : (
                              <Typography variant="body2" color="text.secondary">-</Typography>
                            )
                          ) : (
                            <Box>
                              {sku.piecesPerMixing ? (
                                <Chip label={`${sku.piecesPerMixing.toLocaleString('pl-PL')} szt.`} size="small" color="success" variant="outlined" />
                              ) : null}
                              {sku.avgTimePerMixing !== null ? (
                                <Chip label={`${Math.round(sku.avgTimePerMixing)} min`} size="small" color="info" variant="outlined" sx={{ ml: 0.5 }} />
                              ) : null}
                            </Box>
                          )}
                        </TableCell>

                        {/* Wydajność (j/h) */}
                        <TableCell align="center" sx={{ bgcolor: alpha(theme.palette.success.main, 0.04) }}>
                          {sku.productivityPerHour ? (
                            <Typography variant="body1" sx={{ fontWeight: 'bold', color: 'success.dark' }}>
                              {sku.productivityPerHour.toLocaleString('pl-PL')}
                              <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                                {sku.productivityUnit}
                              </Typography>
                            </Typography>
                          ) : (
                            <Typography variant="body2" color="text.secondary">-</Typography>
                          )}
                        </TableCell>

                        {/* Trend */}
                        <TableCell align="center" sx={{ bgcolor: alpha(theme.palette.info.main, 0.04) }}>
                          {sku.weeklyProductivity && sku.weeklyProductivity.length >= 2 ? (
                            <Tooltip title={`${sku.weeklyProductivity.length} tyg. danych | Zmiana: ${sku.trendChange > 0 ? '+' : ''}${sku.trendChange}%`} arrow>
                              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
                                <SprintSparkline data={sku.weeklyProductivity.map(w => w.avg)} theme={theme} />
                                <Chip
                                  icon={sku.trend === 'improving' ? <TrendingUpIcon sx={{ fontSize: '14px !important' }} /> : sku.trend === 'declining' ? <TrendingDownIcon sx={{ fontSize: '14px !important' }} /> : <TrendingFlatIcon sx={{ fontSize: '14px !important' }} />}
                                  label={`${sku.trendChange > 0 ? '+' : ''}${sku.trendChange}%`}
                                  size="small"
                                  color={sku.trend === 'improving' ? 'success' : sku.trend === 'declining' ? 'error' : 'default'}
                                  variant="outlined"
                                  sx={{ height: 20, fontSize: '0.7rem', '& .MuiChip-icon': { fontSize: 14 } }}
                                />
                              </Box>
                            </Tooltip>
                          ) : (
                            <Typography variant="caption" color="text.secondary">-</Typography>
                          )}
                        </TableCell>
                        
                        <TableCell align="right">
                          {sku.category === 'capsules' ? (
                            sku.estimatedPackagesPerDay !== null && sku.estimatedPackagesPerDay !== undefined ? (
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {sku.estimatedPackagesPerDay.toLocaleString('pl-PL')} opak.
                                </Typography>
                                {sku.estimatedBarrelsPerDay !== null && (
                                  <Typography variant="caption" color="text.secondary">
                                    {sku.estimatedBarrelsPerDay.toFixed(2)} becz.
                                  </Typography>
                                )}
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.secondary">-</Typography>
                            )
                          ) : (
                            sku.estimatedPiecesPerDay !== null && sku.estimatedPiecesPerDay !== undefined ? (
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {sku.estimatedPiecesPerDay.toLocaleString('pl-PL')} szt.
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  ({sku.estimatedMixingsPerDay || 0} miesz.)
                                </Typography>
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.secondary">-</Typography>
                            )
                          )}
                        </TableCell>
                        
                        <TableCell align="right" sx={{ bgcolor: alpha(theme.palette.primary.main, 0.1) }}>
                          {sku.category === 'capsules' ? (
                            sku.totalSprintPackages !== null ? (
                              <Box>
                                <Chip 
                                  label={`${sku.totalSprintPackages.toLocaleString('pl-PL')} opak.`}
                                  size="small"
                                  color="primary"
                                  sx={{ fontWeight: 'bold' }}
                                />
                                {sku.totalSprintBarrels !== null && (
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                    {sku.totalSprintBarrels.toFixed(2)} beczek
                                  </Typography>
                                )}
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.secondary">-</Typography>
                            )
                          ) : (
                            sku.totalSprintPieces !== null && sku.totalSprintPieces !== undefined ? (
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                  {sku.totalSprintPieces.toLocaleString('pl-PL')} szt.
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  ({sku.totalSprintMixings || 0} miesz.)
                                </Typography>
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.secondary">-</Typography>
                            )
                          )}
                        </TableCell>
                      </TableRow>

                      <TableRow>
                        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
                          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <Box sx={{ m: 1.5, p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                              {/* Wydajność tygodniowa */}
                              {sku.weeklyProductivity && sku.weeklyProductivity.length >= 2 && (
                                <Box sx={{ mb: 3 }}>
                                  <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.secondary', mb: 1.5 }}>
                                    Wydajność tygodniowa ({sku.productivityUnit})
                                  </Typography>
                                  <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 0.5, height: 80, px: 1 }}>
                                    {sku.weeklyProductivity.map((wp, i) => {
                                      const maxVal = Math.max(...sku.weeklyProductivity.map(w => w.avg));
                                      const barHeight = maxVal > 0 ? (wp.avg / maxVal) * 64 : 0;
                                      const isLast = i === sku.weeklyProductivity.length - 1;
                                      const barColor = isLast ? theme.palette.primary.main : alpha(theme.palette.primary.main, 0.4);
                                      return (
                                        <Tooltip key={wp.week} title={`${wp.week}: ${Math.round(wp.avg)} ${sku.productivityUnit}`} arrow>
                                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, maxWidth: 48 }}>
                                            <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.secondary', mb: 0.5, fontWeight: isLast ? 700 : 400 }}>
                                              {Math.round(wp.avg)}
                                            </Typography>
                                            <Box sx={{
                                              width: '100%', minWidth: 12, height: Math.max(barHeight, 4), borderRadius: '4px 4px 0 0',
                                              bgcolor: barColor, transition: 'all 0.3s',
                                              border: isLast ? `2px solid ${theme.palette.primary.dark}` : 'none'
                                            }} />
                                            <Typography variant="caption" sx={{ fontSize: '0.55rem', color: 'text.secondary', mt: 0.5 }}>
                                              {wp.week.split('-W')[1]}
                                            </Typography>
                                          </Box>
                                        </Tooltip>
                                      );
                                    })}
                                  </Box>
                                  {sku.trend !== 'stable' && (
                                    <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                      {sku.trend === 'improving' ? <TrendingUpIcon sx={{ fontSize: 16, color: 'success.main' }} /> : <TrendingDownIcon sx={{ fontSize: 16, color: 'error.main' }} />}
                                      <Typography variant="caption" sx={{ color: sku.trend === 'improving' ? 'success.main' : 'error.main' }}>
                                        Wydajność {sku.trend === 'improving' ? 'rośnie' : 'spada'} ({sku.trendChange > 0 ? '+' : ''}{sku.trendChange}% w okresie)
                                      </Typography>
                                    </Box>
                                  )}
                                </Box>
                              )}

                              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'primary.main', mb: 2 }}>
                                Weekly Sprint (Poniedziałek - Czwartek)
                              </Typography>
                              
                              {sku.weeklyPlan && (
                                <Grid container spacing={2}>
                                  {sku.weeklyPlan.map((dayPlan, dayIndex) => (
                                    <Grid item xs={12} sm={6} md={2.4} key={dayIndex}>
                                      <Card sx={{ 
                                        height: '100%',
                                        bgcolor: 'background.paper',
                                        border: `2px solid ${theme.palette.primary.main}`,
                                        transition: 'all 0.3s',
                                        '&:hover': { boxShadow: 4, transform: 'translateY(-2px)' }
                                      }}>
                                        <CardContent>
                                          <Typography variant="overline" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                            {dayPlan.day}
                                          </Typography>
                                          
                                          {sku.category === 'capsules' ? (
                                            <>
                                              <Box sx={{ mt: 1 }}>
                                                <Typography variant="body2" color="text.secondary">Opakowań:</Typography>
                                                <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                                  {dayPlan.packages ? dayPlan.packages.toLocaleString('pl-PL') : 0}
                                                </Typography>
                                              </Box>
                                              {dayPlan.barrels !== null && (
                                                <Box sx={{ mt: 1 }}>
                                                  <Typography variant="body2" color="text.secondary">Beczek (15k caps):</Typography>
                                                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                                    {dayPlan.barrels.toFixed(2)}
                                                  </Typography>
                                                </Box>
                                              )}
                                            </>
                                          ) : (
                                            <>
                                              <Box sx={{ mt: 1 }}>
                                                <Typography variant="body2" color="text.secondary">Mieszań:</Typography>
                                                <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                                  {dayPlan.mixings || 0}
                                                </Typography>
                                              </Box>
                                              <Box sx={{ mt: 1 }}>
                                                <Typography variant="body2" color="text.secondary">Produkcja:</Typography>
                                                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                                  {dayPlan.pieces ? dayPlan.pieces.toLocaleString('pl-PL') : 0} szt.
                                                </Typography>
                                              </Box>
                                            </>
                                          )}
                                        </CardContent>
                                      </Card>
                                    </Grid>
                                  ))}
                                  <Grid item xs={12} sm={6} md={2.4}>
                                    <Card sx={{ 
                                      height: '100%',
                                      bgcolor: 'warning.light',
                                      border: `2px dashed ${theme.palette.warning.main}`,
                                      opacity: 0.7
                                    }}>
                                      <CardContent>
                                        <Typography variant="overline" sx={{ fontWeight: 700, color: 'warning.dark' }}>
                                          Pt
                                        </Typography>
                                        <Box sx={{ mt: 1, textAlign: 'center', py: 2 }}>
                                          <Typography variant="h6" sx={{ fontWeight: 600, color: 'warning.dark' }}>
                                            Sprzątanie
                                          </Typography>
                                          <Typography variant="caption" color="text.secondary">
                                            Brak produkcji
                                          </Typography>
                                        </Box>
                                      </CardContent>
                                    </Card>
                                  </Grid>
                                </Grid>
                              )}
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Box sx={{ 
            textAlign: 'center', 
            py: 8,
            bgcolor: alpha(theme.palette.primary.main, 0.05),
            borderRadius: 2,
            border: `2px dashed ${alpha(theme.palette.primary.main, 0.2)}`
          }}>
            <CalendarIcon sx={{ fontSize: 64, color: 'primary.main', opacity: 0.3, mb: 2 }} />
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {t('weeklySprint.noMixingDataInWeek')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Zmień tydzień lub sprawdź czy zadania mają uzupełniony plan mieszań
            </Typography>
          </Box>
        )}
      </Paper>
    </Box>
  );
};

export default WeeklySprintTab;
