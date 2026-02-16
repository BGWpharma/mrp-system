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
  KeyboardArrowUp as KeyboardArrowUpIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { format, startOfDay, endOfDay, subMonths } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { exportToCSV, exportToExcel, formatDateForExport } from '../../utils/exportUtils';
import { getAllCustomers } from '../../services/customerService';

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

  // Pobierz dane o mieszaniach
  useEffect(() => {
    fetchMixingData();
  }, [startDate, endDate, selectedCustomer]);

  const fetchMixingData = async () => {
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
      console.error('Błąd podczas pobierania danych mieszań:', error);
      showError('Nie udało się pobrać danych');
    } finally {
      setLoading(false);
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
              packagingSamples: []
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
          timeSamples: []
        };
      }

      skuMap[productName].totalMixings += sortedMixings.length;
      skuMap[productName].totalPieces += sortedMixings.reduce((sum, m) => sum + parsePiecesCount(m.details), 0);
      skuMap[productName].tasks.add(task.id);
      
      if (avgTimePerMixing !== null) {
        skuMap[productName].timeSamples.push(avgTimePerMixing);
      }
    });

    return Object.values(skuMap).map(sku => {
      if (sku.category === 'capsules') {
        const avgPackagesPerHour = sku.packagingSamples && sku.packagingSamples.length > 0
          ? sku.packagingSamples.reduce((sum, sample) => sum + sample.packagesPerHour, 0) / sku.packagingSamples.length
          : sku.packagesPerHour || 0;
        
        return { ...sku, tasksCount: sku.tasks.size, packagesPerHour: avgPackagesPerHour };
      }
      
      const avgTime = sku.timeSamples.length > 0
        ? sku.timeSamples.reduce((sum, val) => sum + val, 0) / sku.timeSamples.length
        : sku.avgTimePerMixing;

      return { ...sku, tasksCount: sku.tasks.size, avgTimePerMixing: avgTime };
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

  const stats = useMemo(() => {
    const capsulesData = skuData.filter(sku => sku.category === 'capsules');
    const powderData = skuData.filter(sku => sku.category === 'powder');
    
    const totalPackages = capsulesData.reduce((sum, sku) => sum + (sku.totalPackages || 0), 0);
    const totalMixings = powderData.reduce((sum, sku) => sum + (sku.totalMixings || 0), 0);
    const totalPieces = powderData.reduce((sum, sku) => sum + (sku.totalPieces || 0), 0);
    const totalProducts = skuData.length;
    
    const skuWithTime = filteredSkuData.filter(sku => 
      sku.category === 'powder' && sku.avgTimePerMixing !== null && sku.avgTimePerMixing !== undefined
    );
    const avgTime = skuWithTime.length > 0
      ? skuWithTime.reduce((sum, sku) => sum + (sku.avgTimePerMixing || 0), 0) / skuWithTime.length
      : 0;

    const estimatedSprintPackages = calculateSprintPlan
      .filter(sku => sku.category === 'capsules')
      .reduce((sum, sku) => sum + (sku.totalSprintPackages || 0), 0);
    
    const estimatedSprintBarrels = calculateSprintPlan
      .filter(sku => sku.category === 'capsules')
      .reduce((sum, sku) => sum + (sku.totalSprintBarrels || 0), 0);
    
    const estimatedSprintPieces = calculateSprintPlan
      .filter(sku => sku.category === 'powder')
      .reduce((sum, sku) => sum + (sku.totalSprintPieces || 0), 0);
    
    const estimatedSprintMixings = calculateSprintPlan
      .filter(sku => sku.category === 'powder')
      .reduce((sum, sku) => sum + (sku.totalSprintMixings || 0), 0);

    return {
      totalMixings, totalPieces, estimatedSprintPieces, estimatedSprintMixings,
      totalPackages, estimatedSprintPackages, estimatedSprintBarrels,
      totalProducts, avgTime,
      workHours: endHour - startHour,
      availableMinutes: availableMinutesPerDay,
      realizationRate: estimatedSprintPieces > 0 ? (totalPieces / estimatedSprintPieces * 100).toFixed(1) : 0
    };
  }, [skuData, filteredSkuData, calculateSprintPlan, startHour, endHour, availableMinutesPerDay]);

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

      {/* Karty statystyk */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {productType !== 'powder' && (
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #fc466b 0%, #3f5efb 100%)', color: 'white' }}>
              <CardContent sx={{ py: 2 }}>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  Kapsułki - Pakowania (Sprint)
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                  {stats.estimatedSprintPackages ? stats.estimatedSprintPackages.toLocaleString('pl-PL') : 0}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  opakowań (4 dni)
                </Typography>
                {stats.estimatedSprintBarrels > 0 && (
                  <Typography variant="body2" sx={{ opacity: 0.9, mt: 0.5 }}>
                    {stats.estimatedSprintBarrels.toFixed(2)} beczek
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
        
        {productType !== 'capsules' && (
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
              <CardContent sx={{ py: 2 }}>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  Proszki - Mieszania (Sprint)
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                  {stats.estimatedSprintMixings || 0}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  Pon-Czw ({stats.workHours}h/dzień)
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}
        
        {productType !== 'capsules' && (
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', color: 'white' }}>
              <CardContent sx={{ py: 2 }}>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  Proszki - Produkcja (Sprint)
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                  {stats.estimatedSprintPieces ? stats.estimatedSprintPieces.toLocaleString('pl-PL') : 0}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  sztuk (4 dni)
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}
        
        {productType !== 'capsules' && (
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)', color: 'white' }}>
              <CardContent sx={{ py: 2 }}>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  Śr. czas mieszania
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                  {stats.avgTime > 0 ? Math.round(stats.avgTime) : '-'}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  minut
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        )}
        
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)', color: 'white' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Produkty w sprincie
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                {stats.totalProducts}
              </Typography>
              <Typography variant="caption" sx={{ opacity: 0.8 }}>
                SKU
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

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
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Metoda produkcji</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>Wydajność</TableCell>
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
                            <Chip label="Pakowanie" size="small" sx={{ bgcolor: '#fc466b', color: 'white' }} />
                          ) : (
                            <Chip label="Mieszanie" size="small" sx={{ bgcolor: '#667eea', color: 'white' }} />
                          )}
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
                        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <Box sx={{ m: 1.5, p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
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
