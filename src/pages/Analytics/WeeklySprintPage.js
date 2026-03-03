// src/pages/Analytics/WeeklySprintPage.js
import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  Button,
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
  TrendingUp as TrendingUpIcon,
  PlayArrow as PlayArrowIcon,
  Timer as TimerIcon,
  Speed as SpeedIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, startOfDay, endOfDay, subMonths } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { exportToCSV, exportToExcel, formatDateForExport } from '../../utils/exportUtils';
import { getAllCustomers } from '../../services/crm';

const WeeklySprintPage = () => {
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
  const [startHour, setStartHour] = useState(6); // 6:00
  const [endHour, setEndHour] = useState(22); // 22:00
  
  // Debounced dates - osobne stany dla wyświetlania i zapytań
  const [displayStartDate, setDisplayStartDate] = useState(subMonths(new Date(), 1));
  const [displayEndDate, setDisplayEndDate] = useState(new Date());
  const [startDate, setStartDate] = useState(subMonths(new Date(), 1)); // Debounced
  const [endDate, setEndDate] = useState(new Date()); // Debounced
  
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [customers, setCustomers] = useState([]);
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [isDebouncing, setIsDebouncing] = useState(false);
  const [productType, setProductType] = useState('all'); // 'all', 'powder', 'capsules'

  // Oblicz dostępne minuty pracy dziennie
  const availableMinutesPerDay = useMemo(() => {
    return (endHour - startHour) * 60;
  }, [startHour, endHour]);

  // Debounce dla dat - opóźnij aktualizację o 500ms
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

  // Pobierz dane o mieszaniach
  useEffect(() => {
    fetchMixingData();
  }, [startDate, endDate, selectedCustomer]);

  const fetchMixingData = async () => {
    try {
      setLoading(true);
      console.log('🔄 Pobieranie danych o mieszaniach dla Weekly Sprint...');

      const tasksRef = collection(db, 'productionTasks');
      
      // Pobierz zadania z wybranego zakresu dat
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
        
        // Filtruj po kliencie jeśli wybrany
        if (selectedCustomer !== 'all') {
          const taskCustomerId = data.customerId || data.customer?.id;
          if (taskCustomerId !== selectedCustomer) {
            return; // Pomiń to zadanie
          }
        }
        
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
      
      // Przetwórz dane per SKU
      const processedData = processMixingDataPerSKU(tasks);
      setSkuData(processedData);
    } catch (error) {
      console.error('Błąd podczas pobierania danych mieszań:', error);
      showError('Nie udało się pobrać danych');
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
  
  // 💊 Mapa domyślnych wartości: ile kapsułek w opakowaniu dla znanych produktów
  const CAPSULES_PER_PACKAGE_MAP = {
    'GRN-SPIRULINA-CAPS': 120,
    'GRN-OMEGA3-CAPS': 90,
    'GRN-PROBIOTICS-CAPS': 30,
    'GRN-PROBIOTICS-CAPS ': 30, // z spacją na końcu
    'GRN-MULTIVITAMINS-CAPS': 30,
    'GRN-VITAMIND3-CAPS': 60,
    'GRN-SLEEP-CAPS': 60,
    'GRN-MAGNESIUM-CAPS': 60,
    'GRN-ZINC-CAPS': 120,
    'BW3Y-ZMMB': 60, // ZMA + Magnez + B6
    'BW3Y-MULTIVIT': 90,
  };
  
  // Wyciągnij liczbę kapsułek z nazwy produktu (np. "BW3Y-O3-CAPS-90" → 90)
  const parseCapsulesPerPackage = (productName, taskData = null) => {
    if (!productName) return null;
    
    // 1️⃣ NAJWYŻSZY PRIORYTET: Sprawdź recepturę (task.recipe)
    if (taskData?.recipe) {
      const recipe = taskData.recipe;
      
      // Możliwe pola w recepturze:
      const possibleFields = [
        'capsulesPerPackage',
        'capsulesPerUnit',
        'capsules',
        'capsulesCount',
        'quantity', // może być liczba kapsułek
        'pieceSize', // może zawierać info
      ];
      
      for (const field of possibleFields) {
        if (recipe[field] && typeof recipe[field] === 'number') {
          const capsules = recipe[field];
          // Walidacja: liczba kapsułek zazwyczaj 30-240
          if (capsules >= 30 && capsules <= 240) {
            console.log(`💊 Wykryto ${capsules} kapsułek w opakowaniu z receptury (${field}): ${productName}`);
            return capsules;
          }
        }
      }
      
      // Sprawdź także w ingredients (składnikach)
      if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
        for (const ingredient of recipe.ingredients) {
          if (ingredient.name && ingredient.name.toLowerCase().includes('kapsułk')) {
            if (ingredient.quantity && typeof ingredient.quantity === 'number') {
              const capsules = ingredient.quantity;
              if (capsules >= 30 && capsules <= 240) {
                console.log(`💊 Wykryto ${capsules} kapsułek w opakowaniu ze składników receptury: ${productName}`);
                return capsules;
              }
            }
          }
        }
      }
      
      // Debug: Pokaż wszystkie pola receptury
      console.log(`🔍 Pola dostępne w recepturze dla ${productName}:`, Object.keys(recipe));
    }
    
    // 2️⃣ Sprawdź mapę domyślnych wartości
    const normalizedName = productName.trim();
    if (CAPSULES_PER_PACKAGE_MAP[normalizedName]) {
      const capsules = CAPSULES_PER_PACKAGE_MAP[normalizedName];
      console.log(`💊 Wykryto ${capsules} kapsułek w opakowaniu z mapy domyślnej: ${productName}`);
      return capsules;
    }
    
    // 2️⃣ Wzorce w nazwie: "CAPS-90", "CAPS-120", "-90", "-120" na końcu nazwy
    const patterns = [
      /CAPS-(\d+)/i,           // "CAPS-90"
      /CAPSULE-(\d+)/i,        // "CAPSULE-90"
      /-(\d+)$/,               // "-90" na końcu
      /(\d+)CAPS/i,            // "90CAPS"
    ];
    
    for (const pattern of patterns) {
      const match = productName.match(pattern);
      if (match) {
        const capsules = parseInt(match[1]);
        console.log(`💊 Wykryto ${capsules} kapsułek w opakowaniu z nazwy: ${productName}`);
        return capsules;
      }
    }
    
    // 🔍 Jeśli nie znaleziono w nazwie, szukaj w danych zadania
    if (taskData) {
      // Sprawdź mixingPlanChecklist
      if (taskData.mixingPlanChecklist && taskData.mixingPlanChecklist.length > 0) {
        const firstMixing = taskData.mixingPlanChecklist[0];
        if (firstMixing.details) {
          // Wzorce w details: "90 kapsułek", "Kapsułki: 90", "90 caps", itp.
          const detailPatterns = [
            /(\d+)\s*kaps/i,
            /kaps.*?(\d+)/i,
            /caps.*?(\d+)/i,
            /(\d+)\s*caps/i,
            /(\d+)\s*sztuk.*kaps/i,
          ];
          
          for (const pattern of detailPatterns) {
            const match = firstMixing.details.match(pattern);
            if (match) {
              const capsules = parseInt(match[1]);
              // Walidacja: liczba kapsułek zazwyczaj 30-240
              if (capsules >= 30 && capsules <= 240) {
                console.log(`💊 Wykryto ${capsules} kapsułek z details (${productName}):`, firstMixing.details);
                return capsules;
              }
            }
          }
          
          console.log(`🔍 Details dla ${productName}:`, firstMixing.details);
        }
      }
      
      // Sprawdź output description
      if (taskData.output?.description) {
        const outputPatterns = [
          /(\d+)\s*kaps/i,
          /kaps.*?(\d+)/i,
        ];
        
        for (const pattern of outputPatterns) {
          const match = taskData.output.description.match(pattern);
          if (match) {
            const capsules = parseInt(match[1]);
            if (capsules >= 30 && capsules <= 240) {
              console.log(`💊 Wykryto ${capsules} kapsułek z output.description (${productName}):`, taskData.output.description);
              return capsules;
            }
          }
        }
      }
    }
    
    console.warn(`⚠️ Nie można wykryć liczby kapsułek w opakowaniu: ${productName}`);
    return null;
  };

  // Parsuj jednostkę z details nagłówka mieszania
  const parseUnit = (details) => {
    if (!details) return null;
    
    // Loguj dla debugowania
    console.log('🔍 parseUnit - details:', details);
    
    // Metoda 1: Szukaj wzorca: "Liczba sztuk: 60000 caps" lub "Ilość: 60000 caps"
    let match = details.match(/(?:Liczba sztuk|Ilość):\s*[\d,\.]+\s*([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)/i);
    if (match) {
      console.log('✅ parseUnit - znaleziono (metoda 1):', match[1]);
      return match[1]; // np. "caps", "kg", "szt."
    }
    
    // Metoda 2: Szukaj słowa "caps" gdziekolwiek w tekście
    if (/caps|capsule|kapsułk/i.test(details)) {
      console.log('✅ parseUnit - znaleziono caps w tekście');
      return 'caps';
    }
    
    // Metoda 3: Szukaj liczby + jednostka (np. "60000 caps", "15000caps")
    match = details.match(/[\d,\.]+\s*([a-zA-ZąćęłńóśźżĄĆĘŁŃÓŚŹŻ]+)/);
    if (match) {
      console.log('✅ parseUnit - znaleziono (metoda 3):', match[1]);
      return match[1];
    }
    
    console.log('❌ parseUnit - nie znaleziono jednostki');
    return null;
  };

  // Kategoryzuj produkt na podstawie linii produkcyjnej, jednostki i nazwy
  const getProductCategory = (unit, productName = '', workstationName = '') => {
    console.log('🔍 getProductCategory - SKU:', productName, '| jednostka:', unit, '| linia:', workstationName);
    
    // 🔍 PRIORYTET 1: Sprawdź linię produkcyjną (najbardziej niezawodne!)
    if (workstationName) {
      const lineLower = workstationName.toLowerCase();
      if (lineLower.includes('pill') || lineLower.includes('capsule') || lineLower.includes('kapsułk')) {
        console.log('✅ Wykryto KAPSUŁKI z linii produkcyjnej:', workstationName);
        return 'capsules';
      }
    }
    
    // 🔍 PRIORYTET 2: Sprawdź nazwę produktu
    const nameLower = productName.toLowerCase();
    const capsulePatterns = ['caps', 'capsule', 'kapsułk', '-cap-', 'zmmb', 'q3-caps'];
    if (capsulePatterns.some(pattern => nameLower.includes(pattern))) {
      console.log('✅ Wykryto KAPSUŁKI z nazwy SKU (wzorzec:', capsulePatterns.find(p => nameLower.includes(p)), ')');
      return 'capsules';
    }
    
    // 🔍 PRIORYTET 3: Sprawdź jednostkę
    if (!unit) {
      console.log('⚠️ Brak jednostki - domyślnie PROSZKI');
      return 'powder';
    }
    const unitLower = unit.toLowerCase();
    if (unitLower === 'caps' || unitLower.includes('cap') || unitLower.includes('capsule')) {
      console.log('✅ Wykryto KAPSUŁKI z jednostki');
      return 'capsules';
    }
    
    console.log('📊 Domyślnie PROSZKI (jednostka:', unit, ')');
    return 'powder'; // szt., kg, g itp. = proszki
  };

  // Przetwórz dane per SKU - dla proszków: mieszania, dla kapsułek: pakowanie
  const processMixingDataPerSKU = (tasks) => {
    const skuMap = {};

    tasks.forEach(task => {
      const productName = task.recipeName || task.productName || 'Nieznany produkt';
      const workstationName = task.workstationName || '';

      // Znajdź wszystkie nagłówki mieszań/pakowania (type === 'header')
      const mixingHeaders = task.mixingPlanChecklist?.filter(item => item.type === 'header') || [];

      if (mixingHeaders.length === 0) return;

      // Sortuj mieszania po kolejności (założenie: id lub createdAt)
      const sortedMixings = [...mixingHeaders].sort((a, b) => {
        // Jeśli mają timestamp creation
        if (a.createdAt && b.createdAt) {
          const aTime = a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const bTime = b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return aTime - bTime;
        }
        return a.id.localeCompare(b.id);
      });

      // Pierwsze mieszanie - określa wydajność i jednostkę
      const firstMixing = sortedMixings[0];
      const piecesPerMixing = parsePiecesCount(firstMixing.details);
      
      // 🔍 Wyciągnij jednostkę z details mieszania lub z task
      const unitFromMixing = parseUnit(firstMixing.details);
      const productUnit = unitFromMixing || task.unit || task.output?.unit || task.recipe?.unit || 'szt.';
      
      // 🔍 Określ kategorię produktu (kapsułki vs proszki)
      const productCategory = getProductCategory(productUnit, productName, workstationName);

      // DEBUG: Loguj strukturę dla pierwszego zadania (tylko raz)
      if (!window.__weeklySprintDebugLogged && mixingHeaders.length > 0) {
        console.log('🔍 DEBUG - Struktura zadania produkcyjnego (Weekly Sprint):', {
          productName,
          'task.unit': task.unit,
          'task.workstationId': task.workstationId,
          'task.workstationName': task.workstationName,
          'task.completedQuantity': task.completedQuantity,
          'task.quantity': task.quantity,
          'task.output': task.output,
          'task.actualOutput': task.actualOutput,
          'task.status': task.status,
          'output.unit': task.output?.unit,
          'recipe.unit': task.recipe?.unit,
          'firstMixing.details': firstMixing.details,
          unitFromMixing,
          productUnit,
          workstationName,
          detectedCategory: productCategory === 'capsules' ? '💊 KAPSUŁKI' : '📊 PROSZKI'
        });
        window.__weeklySprintDebugLogged = true;
      }
      
      // DEBUG: Loguj pełną strukturę dla pierwszego zadania kapsułek (tylko raz)
      if (!window.__weeklySprintCapsuleDebugLogged && productCategory === 'capsules') {
        console.log('💊 DEBUG - PEŁNA STRUKTURA TASK (kapsułki):', {
          fullTask: task,
          availableFields: Object.keys(task),
          completedQuantity: task.completedQuantity,
          quantity: task.quantity,
          output: task.output,
          actualOutput: task.actualOutput,
          status: task.status
        });
        console.log('💊 DEBUG - Receptura (recipe) dla kapsułek:', {
          'task.recipe': task.recipe,
          'recipe fields': task.recipe ? Object.keys(task.recipe) : 'brak receptury',
        });
        console.log('💊 DEBUG - firstMixing dla kapsułek:', {
          'firstMixing.details': firstMixing?.details,
          'firstMixing.description': firstMixing?.description,
          'firstMixing.name': firstMixing?.name,
          'task.output.description': task.output?.description,
        });
        window.__weeklySprintCapsuleDebugLogged = true;
      }
      
      // 💊 KAPSUŁKI: Licz pakowanie (opakowania/godzinę) z HISTORII PRODUKCJI
      if (productCategory === 'capsules') {
        // Dla kapsułek używamy productionSessions (historia produkcji)
        const productionSessions = task.productionSessions || [];
        
        if (productionSessions.length === 0) {
          console.log('⏭️ Pomijam kapsułki - brak historii produkcji (productionSessions):', productName);
          return; // Pomiń - brak danych historycznych
        }
        
        // Iteruj przez wszystkie sesje produkcyjne
        productionSessions.forEach((session, sessionIndex) => {
          // Wyciągnij dane z sesji
          const completedPackages = parseFloat(session.completedQuantity) || 0;
          const timeSpentMinutes = parseFloat(session.timeSpent) || 0; // już w minutach
          
          // FALLBACK: Jeśli nie ma timeSpent, oblicz z dat
          let packagingTimeMinutes = timeSpentMinutes;
          if (!timeSpentMinutes && session.startDate && session.endDate) {
            const startDate = session.startDate instanceof Date ? session.startDate :
                            session.startDate?.toDate ? session.startDate.toDate() :
                            new Date(session.startDate);
            const endDate = session.endDate instanceof Date ? session.endDate :
                          session.endDate?.toDate ? session.endDate.toDate() :
                          new Date(session.endDate);
            packagingTimeMinutes = (endDate - startDate) / (1000 * 60);
          }
          
          const packagingTimeHours = packagingTimeMinutes / 60;
          
          // Walidacja: Pomiń sesje z nieprawidłowymi danymi
          if (completedPackages === 0) {
            console.log(`  ⏭️ Sesja ${sessionIndex + 1} pominięta - brak wyprodukowanych opakowań`);
            return; // Skip to next session
          }
          
          if (packagingTimeMinutes < 5) {
            console.warn(`  ⚠️ Sesja ${sessionIndex + 1} pominięta - czas pakowania zbyt krótki:`, 
              `${packagingTimeMinutes.toFixed(2)} min (< 5 min)`);
            return; // Skip to next session
          }
          
          // Opakowania na godzinę
          const packagesPerHour = packagingTimeHours > 0 && completedPackages > 0
            ? completedPackages / packagingTimeHours 
            : 0;
          
          if (packagesPerHour > 1000) {
            console.warn(`  ⚠️ Sesja ${sessionIndex + 1} pominięta - nierealistyczna wydajność:`, 
              `${packagesPerHour.toFixed(2)} opak/h (> 1000)`);
            return; // Skip to next session
          }
          
          console.log(`💊 KAPSUŁKI - Sesja ${sessionIndex + 1}/${productionSessions.length} (${productName}):`, {
            completedPackages,
            packagingTimeMinutes: packagingTimeMinutes.toFixed(2),
            packagingTimeHours: packagingTimeHours.toFixed(2),
            packagesPerHour: packagesPerHour.toFixed(2),
            dataSource: '✅ productionSessions'
          });
          
          // Agreguj dane per SKU (kapsułki)
          if (!skuMap[productName]) {
            const capsulesPerPackage = parseCapsulesPerPackage(productName, task);
            
            skuMap[productName] = {
              sku: productName,
              unit: 'szt.',
              category: 'capsules',
              workstationName: workstationName,
              packagesPerHour: packagesPerHour,
              capsulesPerPackage: capsulesPerPackage, // 💊 Ile kapsułek w 1 opakowaniu
              totalPackages: 0,
              totalPackagingTime: 0, // w minutach
              tasks: new Set(),
              packagingSamples: [] // próbki czasu pakowania
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
        }); // Koniec forEach dla productionSessions
        
        return; // Pomiń dalszą logikę mieszań dla kapsułek
      }

      // Znajdź checkboxy dla każdego mieszania
      const getMixingCheckboxes = (mixingId) => {
        return task.mixingPlanChecklist?.filter(
          item => item.parentId === mixingId && item.type === 'check'
        ) || [];
      };

      // Oblicz czas między mieszaniami z tego samego dnia
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

      // Oblicz średni czas per mieszanie (z tego samego dnia)
      const timeDifferences = [];
      for (let i = 1; i < mixingTimes.length; i++) {
        const prev = mixingTimes[i - 1];
        const curr = mixingTimes[i];
        
        // Sprawdź czy to ten sam dzień
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

      // 📊 PROSZKI: Agreguj dane per SKU (logika mieszań)
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

    // Oblicz końcowe średnie
    return Object.values(skuMap).map(sku => {
      // 💊 KAPSUŁKI: Uśrednij pakowania per godzinę
      if (sku.category === 'capsules') {
        const avgPackagesPerHour = sku.packagingSamples && sku.packagingSamples.length > 0
          ? sku.packagingSamples.reduce((sum, sample) => sum + sample.packagesPerHour, 0) / sku.packagingSamples.length
          : sku.packagesPerHour || 0;
        
        return {
          ...sku,
          tasksCount: sku.tasks.size,
          packagesPerHour: avgPackagesPerHour
        };
      }
      
      // 📊 PROSZKI: Uśrednij czas mieszania
      const avgTime = sku.timeSamples.length > 0
        ? sku.timeSamples.reduce((sum, val) => sum + val, 0) / sku.timeSamples.length
        : sku.avgTimePerMixing;

      return {
        ...sku,
        tasksCount: sku.tasks.size,
        avgTimePerMixing: avgTime
      };
    }).sort((a, b) => {
      // Sortuj po ilości produkcji (dla kapsułek: pakowania, dla proszków: sztuki)
      const aTotal = a.category === 'capsules' ? a.totalPackages : a.totalPieces;
      const bTotal = b.category === 'capsules' ? b.totalPackages : b.totalPieces;
      return bTotal - aTotal;
    });
  };

  // Filtrowane dane per typ produktu
  const filteredSkuData = useMemo(() => {
    if (productType === 'all') {
      return skuData;
    }
    return skuData.filter(sku => sku.category === productType);
  }, [skuData, productType]);

  // Oblicz plan sprintu dla SKU (Pon-Czw) - zależne od godzin pracy
  const calculateSprintPlan = useMemo(() => {
    return filteredSkuData.map(sku => {
      // 💊 KAPSUŁKI: Licz pakowania per godzinę + beczki
      if (sku.category === 'capsules') {
        const packagesPerHour = sku.packagesPerHour || 0;
        const capsulesPerPackage = sku.capsulesPerPackage || null;
        const BARRELS_CAPACITY = 15000; // 15,000 kapsułek na beczkę
        
        if (!packagesPerHour || packagesPerHour === 0) {
          return {
            ...sku,
            estimatedPackagesPerDay: null,
            estimatedBarrelsPerDay: null,
            weeklyPlan: null,
            totalSprintPackages: null,
            totalSprintBarrels: null
          };
        }
        
        // Ile godzin pracy dziennie
        const workHoursPerDay = availableMinutesPerDay / 60;
        
        // Ile opakowań można spakować dziennie
        const packagesPerDay = Math.floor(packagesPerHour * workHoursPerDay);
        
        // 💊 Oblicz beczki (tylko jeśli znamy ile kapsułek w opakowaniu)
        let barrelsPerDay = null;
        if (capsulesPerPackage) {
          const capsulesPerDay = packagesPerDay * capsulesPerPackage;
          barrelsPerDay = capsulesPerDay / BARRELS_CAPACITY;
        }
        
        // Plan na 4 dni (Pon-Czw)
        const weeklyPlan = [
          { 
            day: 'Pon', 
            packages: packagesPerDay || 0,
            barrels: barrelsPerDay || null
          },
          { 
            day: 'Wt', 
            packages: packagesPerDay || 0,
            barrels: barrelsPerDay || null
          },
          { 
            day: 'Śr', 
            packages: packagesPerDay || 0,
            barrels: barrelsPerDay || null
          },
          { 
            day: 'Czw', 
            packages: packagesPerDay || 0,
            barrels: barrelsPerDay || null
          }
        ];
        
        const totalSprintPackages = packagesPerDay * 4;
        const totalSprintBarrels = barrelsPerDay ? barrelsPerDay * 4 : null;
        
        return {
          ...sku,
          estimatedPackagesPerDay: packagesPerDay,
          estimatedBarrelsPerDay: barrelsPerDay,
          weeklyPlan,
          totalSprintPackages,
          totalSprintBarrels
        };
      }
      
      // 📊 PROSZKI: Licz mieszania (logika jak dotychczas)
      const avgTime = sku.avgTimePerMixing;
      const piecesPerMixing = sku.piecesPerMixing || 0;
      
      if (!avgTime || !piecesPerMixing) {
        return {
          ...sku,
          estimatedMixingsPerDay: null,
          estimatedPiecesPerDay: null,
          weeklyPlan: null,
          totalSprintMixings: null,
          totalSprintPieces: null
        };
      }

      // Oblicz ile mieszań można wykonać w ciągu dnia
      const mixingsPerDay = Math.floor(availableMinutesPerDay / avgTime);
      const piecesPerDay = mixingsPerDay * piecesPerMixing;

      // Plan na 4 dni (Pon-Czw)
      const weeklyPlan = [
        { day: 'Pon', mixings: mixingsPerDay || 0, pieces: piecesPerDay || 0 },
        { day: 'Wt', mixings: mixingsPerDay || 0, pieces: piecesPerDay || 0 },
        { day: 'Śr', mixings: mixingsPerDay || 0, pieces: piecesPerDay || 0 },
        { day: 'Czw', mixings: mixingsPerDay || 0, pieces: piecesPerDay || 0 }
      ];

      const totalSprintMixings = mixingsPerDay * 4;
      const totalSprintPieces = piecesPerDay * 4;

      return {
        ...sku,
        estimatedMixingsPerDay: mixingsPerDay,
        estimatedPiecesPerDay: piecesPerDay,
        weeklyPlan,
        totalSprintMixings,
        totalSprintPieces
      };
    });
  }, [filteredSkuData, availableMinutesPerDay]);

  // Odświeżanie danych
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchMixingData();
    setRefreshing(false);
    showInfo('Dane zostały odświeżone');
  };

  // Przełączanie rozwinięcia wiersza
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

  // Eksport do CSV
  const handleExport = async () => {
    if (calculateSprintPlan.length === 0) {
      showError(t('weeklySprint.errors.noDataToExport'));
      return;
    }

    try {
      // Separate powders and capsules data
      const powdersData = calculateSprintPlan.filter(sku => sku.category === 'powder');
      const capsulesData = calculateSprintPlan.filter(sku => sku.category === 'capsules');
      
      const worksheets = [];
      
      // 📊 POWDERS SHEET (first sheet)
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
        
        const powdersHeaders = [
          { label: 'SKU', key: 'SKU' },
          { label: 'Pieces per Mixing', key: 'Pieces per Mixing' },
          { label: 'Time per Mixing (min)', key: 'Time per Mixing (min)' },
          { label: 'Mixings per Day', key: 'Mixings per Day' },
          { label: 'Pieces per Day', key: 'Pieces per Day' },
          { label: 'Sprint Mixings (Mon-Thu)', key: 'Sprint Mixings (Mon-Thu)' },
          { label: 'Sprint Pieces (Mon-Thu)', key: 'Sprint Pieces (Mon-Thu)' }
        ];
        
        worksheets.push({
          name: 'Powders',
          data: powdersExportData,
          headers: powdersHeaders
        });
      }
      
      // 💊 CAPSULES SHEET (second sheet)
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
        
        const capsulesHeaders = [
          { label: 'SKU', key: 'SKU' },
          { label: 'Capsules per Package', key: 'Capsules per Package' },
          { label: 'Packages per Hour', key: 'Packages per Hour' },
          { label: 'Packages per Day', key: 'Packages per Day' },
          { label: 'Barrels per Day (15k)', key: 'Barrels per Day (15k)' },
          { label: 'Sprint Packages (Mon-Thu)', key: 'Sprint Packages (Mon-Thu)' },
          { label: 'Sprint Barrels (Mon-Thu)', key: 'Sprint Barrels (Mon-Thu)' }
        ];
        
        worksheets.push({
          name: 'Capsules',
          data: capsulesExportData,
          headers: capsulesHeaders
        });
      }
      
      // Generate filename
      const startDateStr = formatDateForExport(displayStartDate, 'yyyyMMdd');
      const endDateStr = formatDateForExport(displayEndDate, 'yyyyMMdd');
      const customerStr = selectedCustomer !== 'all' 
        ? `_${customers.find(c => c.id === selectedCustomer)?.name?.replace(/\s+/g, '_') || 'customer'}`
        : '';
      const filename = `weekly_sprint_${startDateStr}_${endDateStr}${customerStr}`;

      // Export to Excel with multiple sheets
      const success = await exportToExcel(worksheets, filename);
      if (success) {
        showSuccess(t('weeklySprint.export.success'));
      }
    } catch (error) {
      console.error('Export error:', error);
      showError(t('weeklySprint.export.error'));
    }
  };

  // Oblicz statystyki
  const stats = useMemo(() => {
    // Podziel na kapsułki i proszki
    const capsulesData = skuData.filter(sku => sku.category === 'capsules');
    const powderData = skuData.filter(sku => sku.category === 'powder');
    
    // 💊 KAPSUŁKI: Pakowania
    const totalPackages = capsulesData.reduce((sum, sku) => sum + (sku.totalPackages || 0), 0);
    
    // 📊 PROSZKI: Mieszania
    const totalMixings = powderData.reduce((sum, sku) => sum + (sku.totalMixings || 0), 0);
    const totalPieces = powderData.reduce((sum, sku) => sum + (sku.totalPieces || 0), 0);
    
    const totalProducts = skuData.length;
    
    // Średni czas per mieszanie (tylko dla proszków)
    const skuWithTime = filteredSkuData.filter(sku => 
      sku.category === 'powder' && sku.avgTimePerMixing !== null && sku.avgTimePerMixing !== undefined
    );
    const avgTime = skuWithTime.length > 0
      ? skuWithTime.reduce((sum, sku) => sum + (sku.avgTimePerMixing || 0), 0) / skuWithTime.length
      : 0;

    // Szacowana produkcja sprintu (Pon-Czw) - z calculateSprintPlan
    // 💊 KAPSUŁKI: Pakowania + Beczki
    const estimatedSprintPackages = calculateSprintPlan
      .filter(sku => sku.category === 'capsules')
      .reduce((sum, sku) => {
        const packages = sku.totalSprintPackages;
        return sum + (packages !== null && packages !== undefined ? packages : 0);
      }, 0);
    
    const estimatedSprintBarrels = calculateSprintPlan
      .filter(sku => sku.category === 'capsules')
      .reduce((sum, sku) => {
        const barrels = sku.totalSprintBarrels;
        return sum + (barrels !== null && barrels !== undefined ? barrels : 0);
      }, 0);
    
    // 📊 PROSZKI: Produkcja
    const estimatedSprintPieces = calculateSprintPlan
      .filter(sku => sku.category === 'powder')
      .reduce((sum, sku) => {
        const pieces = sku.totalSprintPieces;
        return sum + (pieces !== null && pieces !== undefined ? pieces : 0);
      }, 0);
    
    const estimatedSprintMixings = calculateSprintPlan
      .filter(sku => sku.category === 'powder')
      .reduce((sum, sku) => {
        const mixings = sku.totalSprintMixings;
        return sum + (mixings !== null && mixings !== undefined ? mixings : 0);
      }, 0);

    return {
      // 📊 PROSZKI
      totalMixings,
      totalPieces,
      estimatedSprintPieces,
      estimatedSprintMixings,
      
      // 💊 KAPSUŁKI
      totalPackages,
      estimatedSprintPackages,
      estimatedSprintBarrels, // 🛢️ Beczki
      
      // OGÓLNE
      totalProducts,
      avgTime,
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
    <Box sx={{ minHeight: '100vh', pb: 4 }}>
      {/* Nagłówek */}
      <Paper
        elevation={0}
        sx={{
          p: 3,
          mb: 3,
          background: isDarkMode
            ? 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'
            : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
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
              <ScheduleIcon sx={{ fontSize: 24, color: 'white' }} />
            </Box>
            <Box>
              <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                Weekly Sprint (Pon-Czw)
              </Typography>
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                Planowanie i analiza cotygodniowego sprintu produkcyjnego
              </Typography>
            </Box>
          </Box>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Tooltip title="Eksportuj do CSV">
              <IconButton 
                onClick={handleExport} 
                sx={{ color: 'white' }}
                disabled={refreshing || loading}
              >
                <DownloadIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Odśwież dane">
              <IconButton 
                onClick={handleRefresh} 
                sx={{ color: 'white' }}
                disabled={refreshing || loading}
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
            Filtry
          </Typography>
        </Box>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={2.4}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label="Data początkowa"
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
          <Grid item xs={12} md={2.4}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label="Data końcowa"
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
          <Grid item xs={12} md={2}>
            <FormControl fullWidth>
              <InputLabel>Typ produktu</InputLabel>
              <Select
                value={productType}
                onChange={(e) => setProductType(e.target.value)}
                label="Typ produktu"
              >
                <MenuItem value="all">Wszystkie</MenuItem>
                <MenuItem value="powder">📊 Proszki</MenuItem>
                <MenuItem value="capsules">💊 Kapsułki</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={2}>
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
          <Grid item xs={12} md={1.6}>
            <FormControl fullWidth>
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
          <Grid item xs={12} md={1.6}>
            <FormControl fullWidth>
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
            ⏰ Czas pracy: {startHour}:00 - {endHour}:00 ({endHour - startHour}h = {availableMinutesPerDay} minut/dzień)
          </Typography>
          <Typography variant="caption" sx={{ color: 'info.contrastText', opacity: 0.9 }}>
            🗓️ Sprint: Poniedziałek - Czwartek (4 dni) | 🧹 Piątek: Sprzątanie
          </Typography>
        </Box>
      </Paper>

      {/* Karty statystyk */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* 💊 KAPSUŁKI - Pakowania */}
        {productType !== 'powder' && (
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              background: 'linear-gradient(135deg, #fc466b 0%, #3f5efb 100%)',
              color: 'white'
            }}>
              <CardContent>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  💊 Kapsułki - Pakowania (Sprint)
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                  {stats.estimatedSprintPackages ? stats.estimatedSprintPackages.toLocaleString('pl-PL') : 0}
                </Typography>
                <Typography variant="caption" sx={{ opacity: 0.8 }}>
                  opakowań (4 dni)
                </Typography>
                {stats.estimatedSprintBarrels > 0 && (
                  <Typography variant="body2" sx={{ opacity: 0.9, mt: 1 }}>
                    🛢️ {stats.estimatedSprintBarrels.toFixed(2)} beczek
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}
        
        {/* 📊 PROSZKI - Mieszania */}
        {productType !== 'capsules' && (
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white'
            }}>
              <CardContent>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  📊 Proszki - Mieszania (Sprint)
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
        
        {/* 📊 PROSZKI - Produkcja */}
        {productType !== 'capsules' && (
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              background: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
              color: 'white'
            }}>
              <CardContent>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>
                  📊 Proszki - Produkcja (Sprint)
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
        
        {/* Śr. czas mieszania (tylko dla proszków) */}
        {productType !== 'capsules' && (
          <Grid item xs={12} sm={6} md={3}>
            <Card sx={{ 
              background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
              color: 'white'
            }}>
              <CardContent>
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
        
        {/* Produkty w sprincie */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ 
            background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
            color: 'white'
          }}>
            <CardContent>
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

      {/* Główna zawartość */}
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
            {productType !== 'all' && ` | ${productType === 'powder' ? '📊 Proszki' : '💊 Kapsułki'}`}
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
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    Metoda produkcji
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    Wydajność
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    Dziennie
                  </TableCell>
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
                      {/* Główny wiersz produktu */}
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
                        
                        {/* Metoda produkcji */}
                        <TableCell align="right">
                          {sku.category === 'capsules' ? (
                            <Chip label="Pakowanie" size="small" sx={{ bgcolor: '#fc466b', color: 'white' }} />
                          ) : (
                            <Chip label="Mieszanie" size="small" sx={{ bgcolor: '#667eea', color: 'white' }} />
                          )}
                        </TableCell>
                        
                        {/* Wydajność */}
                        <TableCell align="right">
                          {sku.category === 'capsules' ? (
                            // KAPSUŁKI: opakowania/godzinę
                            sku.packagesPerHour ? (
                              <Chip 
                                label={`${Math.round(sku.packagesPerHour)} opak/h`} 
                                size="small" 
                                color="success" 
                                variant="outlined"
                              />
                            ) : (
                              <Typography variant="body2" color="text.secondary">-</Typography>
                            )
                          ) : (
                            // PROSZKI: sztuk/mieszanie + czas
                            <Box>
                              {sku.piecesPerMixing ? (
                                <Chip 
                                  label={`${sku.piecesPerMixing.toLocaleString('pl-PL')} szt.`} 
                                  size="small" 
                                  color="success" 
                                  variant="outlined"
                                />
                              ) : null}
                              {sku.avgTimePerMixing !== null ? (
                                <Chip 
                                  label={`${Math.round(sku.avgTimePerMixing)} min`}
                                  size="small"
                                  color="info"
                                  variant="outlined"
                                  sx={{ ml: 0.5 }}
                                />
                              ) : null}
                            </Box>
                          )}
                        </TableCell>
                        
                        {/* Dziennie */}
                        <TableCell align="right">
                          {sku.category === 'capsules' ? (
                            // KAPSUŁKI: opakowania/dzień + beczki
                            sku.estimatedPackagesPerDay !== null && sku.estimatedPackagesPerDay !== undefined ? (
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {sku.estimatedPackagesPerDay.toLocaleString('pl-PL')} opak.
                                </Typography>
                                {sku.estimatedBarrelsPerDay !== null && (
                                  <Typography variant="caption" color="text.secondary">
                                    🛢️ {sku.estimatedBarrelsPerDay.toFixed(2)} becz.
                                  </Typography>
                                )}
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.secondary">-</Typography>
                            )
                          ) : (
                            // PROSZKI: sztuk/dzień
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
                        
                        {/* Sprint (Pon-Czw) */}
                        <TableCell align="right" sx={{ bgcolor: alpha(theme.palette.primary.main, 0.1) }}>
                          {sku.category === 'capsules' ? (
                            // KAPSUŁKI: pakowania + beczki
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
                                    🛢️ {sku.totalSprintBarrels.toFixed(2)} beczek
                                  </Typography>
                                )}
                              </Box>
                            ) : (
                              <Typography variant="body2" color="text.secondary">-</Typography>
                            )
                          ) : (
                            // PROSZKI: sztuki
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

                      {/* Rozwinięty wiersz - Weekly Sprint (Pon-Czw) */}
                      <TableRow>
                        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={6}>
                          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <Box sx={{ m: 1.5, p: 2, bgcolor: 'background.default', borderRadius: 2 }}>
                              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: 'primary.main', mb: 2 }}>
                                📅 Weekly Sprint (Poniedziałek - Czwartek)
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
                                        '&:hover': {
                                          boxShadow: 4,
                                          transform: 'translateY(-2px)'
                                        }
                                      }}>
                                        <CardContent>
                                          <Typography variant="overline" sx={{ fontWeight: 700, color: 'primary.main' }}>
                                            {dayPlan.day}
                                          </Typography>
                                          
                                          {sku.category === 'capsules' ? (
                                            // 💊 KAPSUŁKI: Opakowania + Beczki
                                            <>
                                              <Box sx={{ mt: 1 }}>
                                                <Typography variant="body2" color="text.secondary">
                                                  Opakowań:
                                                </Typography>
                                                <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                                  {dayPlan.packages ? dayPlan.packages.toLocaleString('pl-PL') : 0}
                                                </Typography>
                                              </Box>
                                              {dayPlan.barrels !== null && (
                                                <Box sx={{ mt: 1 }}>
                                                  <Typography variant="body2" color="text.secondary">
                                                    🛢️ Beczek (15k caps):
                                                  </Typography>
                                                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                                                    {dayPlan.barrels.toFixed(2)}
                                                  </Typography>
                                                </Box>
                                              )}
                                            </>
                                          ) : (
                                            // 📊 PROSZKI: Mieszania + sztuki
                                            <>
                                              <Box sx={{ mt: 1 }}>
                                                <Typography variant="body2" color="text.secondary">
                                                  Mieszań:
                                                </Typography>
                                                <Typography variant="h5" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                                  {dayPlan.mixings || 0}
                                                </Typography>
                                              </Box>
                                              <Box sx={{ mt: 1 }}>
                                                <Typography variant="body2" color="text.secondary">
                                                  Produkcja:
                                                </Typography>
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
                                  {/* Piątek - Sprzątanie */}
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
                                            🧹 Sprzątanie
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
              Brak danych mieszań w wybranym tygodniu
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

export default WeeklySprintPage;
