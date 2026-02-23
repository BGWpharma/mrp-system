import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
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
  TextField,
  Divider,
  CircularProgress,
  useMediaQuery,
  useTheme,
  IconButton,
  Tabs,
  Tab
} from '@mui/material';
import {
  PieChart,
  Pie,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
  ResponsiveContainer
} from 'recharts';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import plLocale from 'date-fns/locale/pl';
import { format, parseISO, isValid, startOfMonth, endOfMonth, addMonths, subMonths } from 'date-fns';
import {
  CalendarMonth as CalendarIcon,
  Article as ReportIcon,
  FormatListBulleted as ListIcon,
  Assessment as AssessmentIcon,
  FileDownload as DownloadIcon,
  NavigateBefore as PrevIcon,
  NavigateNext as NextIcon,
  ArrowDropDown as DropdownIcon,
  Inventory as InventoryIcon,
  Schedule as ScheduleIcon,
  GetApp as ExportIcon,
  ArrowUpward as ArrowUpwardIcon,
  ArrowDownward as ArrowDownwardIcon,
  ShowChart as ShowChartIcon
} from '@mui/icons-material';
import { getAllTasks } from '../../services/productionService';
import { getAllOrders } from '../../services/orderService';
import { getAllCustomers } from '../../services/customerService';
import { getWorkstationById } from '../../services/workstationService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { PRODUCTION_TASK_STATUSES } from '../../utils/constants';
import ProductionTimeAnalysisTab from '../../components/production/ProductionTimeAnalysisTab';
import ProgressReportTab from '../../components/production/ProgressReportTab';

const ProductionReportPage = () => {
  const { t } = useTranslation('production');
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState(endOfMonth(new Date()));
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('all');
  const [selectedTab, setSelectedTab] = useState(0);
  const { showError } = useNotification();
  
  // Dodajemy wykrywanie urządzeń mobilnych
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Kolory dla wykresów
  const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

  useEffect(() => {
    let cancelled = false;
    const loadData = async () => {
      try {
        setLoading(true);
        console.log('[RAPORT PRODUKCJI] Rozpoczynam pobieranie danych...');
        
        const [fetchedTasks, fetchedOrders, fetchedCustomers] = await Promise.all([
          getAllTasks(),
          getAllOrders(),
          getAllCustomers()
        ]);
        if (cancelled) return;
        
        console.log(`[RAPORT PRODUKCJI] Pobrano ${fetchedTasks.length} zadań produkcyjnych`);
        
        const tasksWithConsumption = fetchedTasks.filter(task => 
          task.consumedMaterials && task.consumedMaterials.length > 0
        );
        
        console.log(`[RAPORT PRODUKCJI] Zadania z konsumpcją: ${tasksWithConsumption.length}/${fetchedTasks.length}`);
        
        if (tasksWithConsumption.length > 0) {
          console.log('[RAPORT PRODUKCJI] Przykładowe zadania z konsumpcją:');
          tasksWithConsumption.slice(0, 3).forEach((task, index) => {
            console.log(`  ${index + 1}. ${task.moNumber || task.name} - ${task.consumedMaterials.length} pozycji konsumpcji`);
          });
        } else {
          console.warn('[RAPORT PRODUKCJI] UWAGA: Żadne zadanie nie ma danych konsumpcji!');
        }
        
        setTasks(fetchedTasks);
        setOrders(fetchedOrders);
        setCustomers(fetchedCustomers);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania danych:', error);
        showError('Nie udało się pobrać danych raportów: ' + error.message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    loadData();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (tasks.length > 0 && orders.length > 0 && customers.length > 0) {
      filterAndProcessData();
    }
  }, [tasks, orders, customers, startDate, endDate, selectedCustomer]);

  // Funkcja do filtrowania zadań
  const filterAndProcessData = () => {
    // Filtruj zadania według daty i klienta
    let filtered = tasks.filter(task => {
      // Przetwórz datę zadania
      let taskDate;
      if (typeof task.scheduledDate === 'string') {
        taskDate = new Date(task.scheduledDate);
      } else if (task.scheduledDate?.toDate) {
        taskDate = task.scheduledDate.toDate();
      } else if (task.scheduledDate instanceof Date) {
        taskDate = task.scheduledDate;
      } else {
        return false; // Brak daty, pomijamy
      }
      
      // Sprawdź czy data jest w zakresie
      if (taskDate < startDate || taskDate > endDate) {
        return false;
      }
      
      // Sprawdź filtry klienta
      if (selectedCustomer !== 'all') {
        // Znajdź zamówienie, do którego przypisane jest zadanie
        const relatedOrder = orders.find(order => 
          order.productionTasks?.some(prodTask => prodTask.id === task.id)
        );
        
        if (!relatedOrder || relatedOrder.customer?.id !== selectedCustomer) {
          return false;
        }
      }
      
      return true;
    });
    
    setFilteredTasks(filtered);
  };

  
  const handleTabChange = (event, newValue) => {
    setSelectedTab(newValue);
  };
  
  const getTaskCustomerName = (task) => {
    const relatedOrder = orders.find(order => 
      order.productionTasks?.some(prodTask => prodTask.id === task.id)
    );
    
    if (relatedOrder && relatedOrder.customer) {
      return relatedOrder.customer.name || 'Nieznany klient';
    }
    
    return 'Bez przypisanego klienta';
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: isMobile ? 1 : 4, mb: 4, px: isMobile ? 0.5 : 3 }}>
      <Box sx={{ mb: isMobile ? 1 : 2, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Typography variant="h5" align="center" sx={{ fontSize: isMobile ? '1.15rem' : '1.5rem' }}>
          Raport MO
        </Typography>
      </Box>

      {/* Zakładki */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs 
          value={selectedTab} 
          onChange={handleTabChange} 
          aria-label="raport mo tabs"
          variant={isMobile ? "scrollable" : "standard"}
          scrollButtons={isMobile ? "auto" : false}
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
            label={t('production.productionReport.productionTime')}
            icon={<ScheduleIcon />} 
            iconPosition="start"
            sx={{ fontSize: isMobile ? '0.85rem' : '1rem' }}
          />
          <Tab 
            label={t('production.productionReport.moConsumption')}
            icon={<InventoryIcon />} 
            iconPosition="start"
            sx={{ fontSize: isMobile ? '0.85rem' : '1rem' }}
          />
          <Tab 
            label={t('production.productionReport.progressReport')}
            icon={<ShowChartIcon />} 
            iconPosition="start"
            sx={{ fontSize: isMobile ? '0.85rem' : '1rem' }}
          />
        </Tabs>
      </Box>

      {/* Zawartość zakładek */}
      
      {/* Zakładka Czas Produkcji (domyślna) */}
      {selectedTab === 0 && (
        <ProductionTimeAnalysisTab 
          startDate={startDate}
          endDate={endDate}
          customers={customers}
          isMobile={isMobile}
        />
      )}

      {/* Zakładka Konsumpcja MO */}
      {selectedTab === 1 && (
        <ConsumptionReportTab 
          tasks={filteredTasks}
          startDate={startDate}
          endDate={endDate}
          customers={customers}
          isMobile={isMobile}
          onDateChange={(newStartDate, newEndDate) => {
            setStartDate(newStartDate);
            setEndDate(newEndDate);
          }}
        />
      )}

      {/* Zakładka Postęp Produkcji */}
      {selectedTab === 2 && (
        <ProgressReportTab 
          tasks={tasks}
          loading={loading}
          isMobile={isMobile}
        />
      )}

    </Container>
  );
};

// Komponent zakładki konsumpcji MO
const ConsumptionReportTab = ({ tasks, startDate, endDate, customers, isMobile, onDateChange }) => {
  const { t } = useTranslation('production');
  const { showError } = useNotification();
  const [consumptionData, setConsumptionData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filteredConsumption, setFilteredConsumption] = useState([]);
  // Używaj filtrów dat z głównego komponentu zamiast własnych
  const consumptionStartDate = startDate;
  const consumptionEndDate = endDate;
  const [selectedMaterial, setSelectedMaterial] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState('all');
  const [materialsList, setMaterialsList] = useState([]);
  const [ordersList, setOrdersList] = useState([]);
  const [sortField, setSortField] = useState('consumptionDate');
  const [sortDirection, setSortDirection] = useState('desc');

  // Funkcja do agregacji danych konsumpcji z zadań produkcyjnych
  const aggregateConsumptionData = (tasks) => {
    console.log(`[RAPORT KONSUMPCJI] Rozpoczynam agregację dla ${tasks.length} zadań`);
    console.log(`[RAPORT KONSUMPCJI] Zakres dat: ${format(startDate, 'dd.MM.yyyy')} - ${format(endDate, 'dd.MM.yyyy')}`);
    
    const aggregatedData = [];
    const materialSummary = {};
    let tasksWithConsumption = 0;
    let totalConsumptionItems = 0;
    let consumptionItemsInDateRange = 0;

    tasks.forEach((task, taskIndex) => {
      console.log(`[RAPORT KONSUMPCJI] Zadanie ${taskIndex + 1}/${tasks.length}: ${task.moNumber || task.name}`);
      console.log(`[RAPORT KONSUMPCJI] - ID: ${task.id}`);
      console.log(`[RAPORT KONSUMPCJI] - Konsumpcja: ${task.consumedMaterials ? task.consumedMaterials.length : 0} pozycji`);
      
      if (task.consumedMaterials && task.consumedMaterials.length > 0) {
        tasksWithConsumption++;
        console.log(`[RAPORT KONSUMPCJI] - Zadanie ma ${task.consumedMaterials.length} pozycji konsumpcji`);
        
        task.consumedMaterials.forEach((consumed, consumedIndex) => {
          totalConsumptionItems++;
          console.log(`[RAPORT KONSUMPCJI] -- Konsumpcja ${consumedIndex + 1}: materialId=${consumed.materialId}, quantity=${consumed.quantity}`);
          
          const materialId = consumed.materialId;
          
          // Znajdź materiał w liście materiałów zadania aby pobrać prawidłową nazwę
          const material = task.materials?.find(m => 
            (m.inventoryItemId || m.id) === materialId
          );
          
          const materialName = material?.name || consumed.materialName || 'Nieznany materiał';
          const materialUnit = material?.unit || consumed.unit || 'szt';
          const batchNumber = consumed.batchNumber || consumed.batchId || 'Brak numeru';
          const quantity = Number(consumed.quantity) || 0;
          const unitPrice = Number(consumed.unitPrice) || 0;
          const totalCost = quantity * unitPrice;
          
          // Ulepszone pobieranie daty konsumpcji z wieloma fallbackami
          let consumptionDate = null;
          if (consumed.timestamp) {
            if (consumed.timestamp.toDate) {
              // Firestore Timestamp
              consumptionDate = consumed.timestamp.toDate();
            } else if (consumed.timestamp instanceof Date) {
              consumptionDate = consumed.timestamp;
            } else if (typeof consumed.timestamp === 'string') {
              consumptionDate = new Date(consumed.timestamp);
            } else if (typeof consumed.timestamp === 'number') {
              consumptionDate = new Date(consumed.timestamp);
            }
          } else if (consumed.date) {
            // Fallback na pole date
            if (consumed.date.toDate) {
              consumptionDate = consumed.date.toDate();
            } else {
              consumptionDate = new Date(consumed.date);
            }
          } else if (task.updatedAt) {
            // Fallback na datę aktualizacji zadania
            if (task.updatedAt.toDate) {
              consumptionDate = task.updatedAt.toDate();
            } else {
              consumptionDate = new Date(task.updatedAt);
            }
          } else if (task.createdAt) {
            // Fallback na datę utworzenia zadania
            if (task.createdAt.toDate) {
              consumptionDate = task.createdAt.toDate();
            } else {
              consumptionDate = new Date(task.createdAt);
            }
          }
          
          console.log(`[RAPORT KONSUMPCJI] -- Data konsumpcji: ${consumptionDate ? format(consumptionDate, 'dd.MM.yyyy HH:mm') : 'BRAK'}`);
          
          // GŁÓWNE FILTROWANIE: według rzeczywistej daty konsumpcji, a nie planowanej daty zadania
          // To pozwala uwzględnić konsumpcje z opóźnionych zadań produkcyjnych
          let isInDateRange = false;
          let dateReason = '';
          
          if (consumptionDate) {
            isInDateRange = consumptionDate >= startDate && 
                           consumptionDate <= endDate;
            dateReason = isInDateRange ? 'w zakresie dat' : 'poza zakresem dat';
          } else {
            // Jeśli nie ma daty konsumpcji, użyj daty zadania lub załóż że jest aktualna
            isInDateRange = true; // Domyślnie uwzględnij jeśli nie ma daty
            dateReason = 'brak daty konsumpcji - uwzględniam';
          }
              
          console.log(`[RAPORT KONSUMPCJI] -- Status: ${dateReason} (${isInDateRange ? 'UWZGLĘDNIAM' : 'POMIJAM'})`);
          
          if (isInDateRange) {
            if (!consumptionDate) {
              console.log(`[RAPORT KONSUMPCJI] -- UWAGA: Brak daty konsumpcji, używam fallback`);
            }
            
            consumptionItemsInDateRange++;
            
            // Dodaj do szczegółowych danych
            aggregatedData.push({
              taskId: task.id,
              taskName: task.name,
              moNumber: task.moNumber,
              productName: task.productName,
              materialId,
              materialName,
              batchNumber,
              quantity,
              unit: materialUnit,
              unitPrice,
              totalCost,
              consumptionDate: consumptionDate || new Date(), // Użyj bieżącej daty jako fallback
              userName: consumed.userName || 'Nieznany użytkownik',
              includeInCosts: consumed.includeInCosts !== false
            });

            // Agreguj dla podsumowania materiałów
            if (!materialSummary[materialId]) {
              materialSummary[materialId] = {
                materialName,
                unit: materialUnit,
                totalQuantity: 0,
                totalCost: 0,
                batchCount: 0,
                taskCount: new Set(),
                avgUnitPrice: 0
              };
            }

            materialSummary[materialId].totalQuantity += quantity;
            materialSummary[materialId].totalCost += totalCost;
            materialSummary[materialId].batchCount += 1;
            materialSummary[materialId].taskCount.add(task.id);
          }
        });
      } else {
        console.log(`[RAPORT KONSUMPCJI] - Zadanie nie ma danych konsumpcji`);
      }
    });

    console.log(`[RAPORT KONSUMPCJI] PODSUMOWANIE:`);
    console.log(`[RAPORT KONSUMPCJI] - Zadania z konsumpcją: ${tasksWithConsumption}/${tasks.length}`);
    console.log(`[RAPORT KONSUMPCJI] - Całkowita konsumpcja: ${totalConsumptionItems} pozycji`);
    console.log(`[RAPORT KONSUMPCJI] - Konsumpcja w zakresie dat: ${consumptionItemsInDateRange} pozycji`);
    console.log(`[RAPORT KONSUMPCJI] - Materiały w podsumowaniu: ${Object.keys(materialSummary).length}`);
    console.log(`[RAPORT KONSUMPCJI] - Szczegółowe dane: ${aggregatedData.length} pozycji`);

    // Oblicz średnie ceny jednostkowe
    Object.values(materialSummary).forEach(material => {
      material.avgUnitPrice = material.totalQuantity > 0 
        ? material.totalCost / material.totalQuantity 
        : 0;
      material.taskCount = material.taskCount.size;
    });

    return {
      detailedData: aggregatedData,
      materialSummary: Object.values(materialSummary)
    };
  };

  // Pobierz unikalne materiały do filtrowania
  useEffect(() => {
    const materials = [];
    const materialSet = new Set();
    
    tasks.forEach(task => {
      if (task.consumedMaterials && task.consumedMaterials.length > 0) {
        task.consumedMaterials.forEach(consumed => {
          const materialId = consumed.materialId;
          
          // Znajdź materiał w liście materiałów zadania aby pobrać prawidłową nazwę
          const material = task.materials?.find(m => 
            (m.inventoryItemId || m.id) === materialId
          );
          
          const materialName = material?.name || consumed.materialName || 'Nieznany materiał';
          
          if (!materialSet.has(materialId)) {
            materialSet.add(materialId);
            materials.push({
              id: materialId,
              name: materialName
            });
          }
        });
      }
    });
    
    setMaterialsList(materials.sort((a, b) => a.name.localeCompare(b.name)));
  }, [tasks]);

  // Pobierz unikalne zamówienia (CO) do filtrowania
  useEffect(() => {
    const orders = [];
    const orderSet = new Set();
    
    tasks.forEach(task => {
      if (task.consumedMaterials && task.consumedMaterials.length > 0) {
        // Sprawdź czy zadanie ma powiązane zamówienie
        if (task.orderId && task.orderNumber) {
          const orderKey = `${task.orderId}_${task.orderNumber}`;
          
          if (!orderSet.has(orderKey)) {
            orderSet.add(orderKey);
            orders.push({
              id: task.orderId,
              number: task.orderNumber,
              customer: task.customer
            });
          }
        }
      }
    });
    
    setOrdersList(orders.sort((a, b) => a.number.localeCompare(b.number)));
  }, [tasks]);

  // Funkcja do debugowania struktury zadań
  const debugTasksStructure = (tasks) => {
    console.log('[DEBUG STRUKTURA] Analizuję strukturę zadań...');
    
    if (tasks.length === 0) {
      console.log('[DEBUG STRUKTURA] Brak zadań do analizy');
      return;
    }
    
    // Sprawdź pierwsze zadanie
    const firstTask = tasks[0];
    console.log('[DEBUG STRUKTURA] Przykładowa struktura zadania:');
    console.log('[DEBUG STRUKTURA] - Pola zadania:', Object.keys(firstTask));
    console.log('[DEBUG STRUKTURA] - Ma consumedMaterials:', !!firstTask.consumedMaterials);
    console.log('[DEBUG STRUKTURA] - Typ consumedMaterials:', typeof firstTask.consumedMaterials);
    console.log('[DEBUG STRUKTURA] - Długość consumedMaterials:', firstTask.consumedMaterials?.length || 0);
    
    if (firstTask.consumedMaterials && firstTask.consumedMaterials.length > 0) {
      const firstConsumption = firstTask.consumedMaterials[0];
      console.log('[DEBUG STRUKTURA] - Przykładowa konsumpcja:', firstConsumption);
      console.log('[DEBUG STRUKTURA] - Pola konsumpcji:', Object.keys(firstConsumption));
    }
    
    // Sprawdź ile zadań ma różne pola
    const stats = tasks.reduce((acc, task) => {
      acc.total++;
      if (task.consumedMaterials) acc.hasConsumedMaterials++;
      if (task.consumedMaterials?.length > 0) acc.hasNonEmptyConsumption++;
      if (task.materials) acc.hasMaterials++;
      if (task.moNumber) acc.hasMoNumber++;
      if (task.status) acc.hasStatus++;
      return acc;
    }, {
      total: 0,
      hasConsumedMaterials: 0,
      hasNonEmptyConsumption: 0,
      hasMaterials: 0,
      hasMoNumber: 0,
      hasStatus: 0
    });
    
    console.log('[DEBUG STRUKTURA] Statystyki zadań:', stats);
  };

  // Agreguj dane konsumpcji po zmianie filtrów
  useEffect(() => {
    setLoading(true);
    
    // DEBUG: Analizuj strukturę zadań
    debugTasksStructure(tasks);
    
    // NIE FILTRUJ zadań według planowanej daty - filtrowanie tylko według rzeczywistej daty konsumpcji
    // To pozwala uwzględnić konsumpcje z zadań opóźnionych względem planowanej daty
    let filteredTasks = tasks;
    
    // Filtruj zadania po wybranym zamówieniu
    if (selectedOrder !== 'all') {
      filteredTasks = filteredTasks.filter(task => task.orderId === selectedOrder);
    }
    
    console.log(`[RAPORT KONSUMPCJI] Przetwarzam ${filteredTasks.length} zadań po filtrach (z ${tasks.length} całkowitych)`);
    
    const { detailedData, materialSummary } = aggregateConsumptionData(filteredTasks);
    
    // Filtruj po wybranym materiale
    const filtered = selectedMaterial === 'all' 
      ? detailedData 
      : detailedData.filter(item => item.materialId === selectedMaterial);
    
    console.log(`[RAPORT KONSUMPCJI] Wyniki: ${materialSummary.length} materiałów, ${filtered.length} szczegółowych pozycji`);
    
    setConsumptionData(materialSummary);
    // Sortuj dane przed ustawieniem
    const sortedFiltered = sortConsumptionData(filtered, sortField, sortDirection);
    setFilteredConsumption(sortedFiltered);
    setLoading(false);
  }, [tasks, startDate, endDate, selectedMaterial, selectedOrder, sortField, sortDirection]);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('pl-PL', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 2
    }).format(value);
  };

  const formatQuantity = (value, precision = 3) => {
    return Number(value).toFixed(precision);
  };

  // Funkcja sortowania danych konsumpcji
  const sortConsumptionData = (data, field, direction) => {
    return [...data].sort((a, b) => {
      let aValue, bValue;
      
      switch (field) {
        case 'consumptionDate':
          aValue = a.consumptionDate ? new Date(a.consumptionDate).getTime() : 0;
          bValue = b.consumptionDate ? new Date(b.consumptionDate).getTime() : 0;
          break;
        case 'taskName':
          aValue = (a.taskName || '').toLowerCase();
          bValue = (b.taskName || '').toLowerCase();
          break;
        case 'moNumber':
          aValue = (a.moNumber || '').toLowerCase();
          bValue = (b.moNumber || '').toLowerCase();
          break;
        case 'productName':
          aValue = (a.productName || '').toLowerCase();
          bValue = (b.productName || '').toLowerCase();
          break;
        case 'materialName':
          aValue = (a.materialName || '').toLowerCase();
          bValue = (b.materialName || '').toLowerCase();
          break;
        case 'batchNumber':
          aValue = (a.batchNumber || '').toLowerCase();
          bValue = (b.batchNumber || '').toLowerCase();
          break;
        case 'quantity':
          aValue = Number(a.quantity) || 0;
          bValue = Number(b.quantity) || 0;
          break;
        case 'unit':
          aValue = (a.unit || '').toLowerCase();
          bValue = (b.unit || '').toLowerCase();
          break;
        case 'unitPrice':
          aValue = Number(a.unitPrice) || 0;
          bValue = Number(b.unitPrice) || 0;
          break;
        case 'totalCost':
          aValue = Number(a.totalCost) || 0;
          bValue = Number(b.totalCost) || 0;
          break;
        case 'userName':
          aValue = (a.userName || '').toLowerCase();
          bValue = (b.userName || '').toLowerCase();
          break;
        case 'orderNumber':
          // Dla zamówienia musimy pobrać dane z zadania
          const taskA = tasks.find(t => t.id === a.taskId);
          const taskB = tasks.find(t => t.id === b.taskId);
          aValue = (taskA?.orderNumber || '').toLowerCase();
          bValue = (taskB?.orderNumber || '').toLowerCase();
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) {
        return direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  };

  // Funkcja obsługi kliknięcia w nagłówek kolumny
  const handleSort = (field) => {
    const newDirection = sortField === field && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortField(field);
    setSortDirection(newDirection);
    
    // Posortuj bieżące dane
    const sortedData = sortConsumptionData(filteredConsumption, field, newDirection);
    setFilteredConsumption(sortedData);
  };

  // Komponent nagłówka kolumny z sortowaniem
  const SortableTableCell = ({ field, children, align = 'left', ...props }) => {
    const isActive = sortField === field;
    const isDesc = sortDirection === 'desc';
    
    return (
      <TableCell 
        {...props}
        align={align}
        sx={{ 
          cursor: 'pointer', 
          userSelect: 'none',
          '&:hover': {
            backgroundColor: 'rgba(0, 0, 0, 0.04)'
          },
          fontWeight: isActive ? 'bold' : 'medium',
          position: 'relative'
        }}
        onClick={() => handleSort(field)}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
          {children}
          <Box sx={{ ml: 0.5, display: 'flex', flexDirection: 'column', opacity: isActive ? 1 : 0.3 }}>
            {isActive && isDesc ? (
              <ArrowDownwardIcon sx={{ fontSize: '0.8rem' }} />
            ) : (
              <ArrowUpwardIcon sx={{ fontSize: '0.8rem' }} />
            )}
          </Box>
        </Box>
      </TableCell>
    );
  };

  // Funkcja eksportu podsumowania materiałów do CSV
  const exportSummaryToCSV = () => {
    try {
      // Przygotuj nagłówki CSV dla podsumowania
      const headers = [
        t('production.reports.consumption.csvHeaders.summary.material'),
        t('production.reports.consumption.csvHeaders.summary.totalQuantity'),
        t('production.reports.consumption.csvHeaders.summary.unit'),
        t('production.reports.consumption.csvHeaders.summary.avgUnitPrice'),
        t('production.reports.consumption.csvHeaders.summary.totalCost'),
        t('production.reports.consumption.csvHeaders.summary.batchCount'),
        t('production.reports.consumption.csvHeaders.summary.taskCount')
      ];

      // Przygotuj dane CSV dla podsumowania
      const csvData = consumptionData.map(material => [
        material.materialName || '-',
        formatQuantity(material.totalQuantity, 3),
        material.unit || '-',
        material.avgUnitPrice.toFixed(4),
        material.totalCost.toFixed(4),
        material.batchCount.toString(),
        material.taskCount.toString()
      ]);

      // Dodaj podsumowanie całkowite
      const totalCost = consumptionData.reduce((sum, material) => sum + material.totalCost, 0);
      const totalBatches = consumptionData.reduce((sum, material) => sum + material.batchCount, 0);
      const uniqueTasks = new Set(consumptionData.flatMap(material => material.taskCount)).size;
      
      csvData.push([]);
      csvData.push([t('production.reports.consumption.sumTotal'), '', '', '', totalCost.toFixed(4), totalBatches.toString(), uniqueTasks.toString()]);

      // Połącz nagłówki z danymi
      const fullData = [headers, ...csvData];

      // Konwertuj do CSV string
      const csvContent = fullData.map(row => 
        row.map(field => {
          const stringField = String(field);
          if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return `"${stringField.replace(/"/g, '""')}"`;
          }
          return stringField;
        }).join(',')
      ).join('\n');

      // Dodaj BOM dla poprawnego wyświetlania polskich znaków w Excel
      const BOM = '\uFEFF';
      const csvWithBOM = BOM + csvContent;

      // Utwórz i pobierz plik
      const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      
      // Nazwa pliku z datą
      const fileName = `podsumowanie_konsumpcji_${format(startDate, 'yyyy-MM-dd')}_${format(endDate, 'yyyy-MM-dd')}.csv`;
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log(`[EKSPORT CSV] Wyeksportowano podsumowanie ${consumptionData.length} materiałów do pliku ${fileName}`);
    } catch (error) {
      console.error('[EKSPORT CSV] Błąd podczas eksportu podsumowania:', error);
      showError(t('production.reports.consumption.exportErrorSummary'));
    }
  };

  // Funkcja eksportu szczegółów do CSV
  const exportToCSV = () => {
    try {
      // Przygotuj nagłówki CSV
      const headers = [
        t('production.reports.consumption.csvHeaders.details.consumptionDate'),
        t('production.reports.consumption.csvHeaders.details.task'),
        t('production.reports.consumption.csvHeaders.details.mo'),
        t('production.reports.consumption.csvHeaders.details.order'),
        t('production.reports.consumption.csvHeaders.details.customer'),
        t('production.reports.consumption.csvHeaders.details.product'),
        t('production.reports.consumption.csvHeaders.details.material'),
        t('production.reports.consumption.csvHeaders.details.batch'),
        t('production.reports.consumption.csvHeaders.details.quantity'),
        t('production.reports.consumption.csvHeaders.details.unit'),
        t('production.reports.consumption.csvHeaders.details.unitPrice'),
        t('production.reports.consumption.csvHeaders.details.totalCost'),
        t('production.reports.consumption.csvHeaders.details.user'),
        t('production.reports.consumption.csvHeaders.details.includeInCosts')
      ];

      // Przygotuj dane CSV
      const csvData = filteredConsumption.map(consumption => {
        // Znajdź zadanie aby pobrać informacje o zamówieniu
        const task = tasks.find(t => t.id === consumption.taskId);
        const orderNumber = task?.orderNumber || '-';
        const customerName = task?.customer?.name || task?.customer || '-';

        return [
          consumption.consumptionDate 
            ? format(consumption.consumptionDate, 'dd.MM.yyyy HH:mm')
            : '-',
          consumption.taskName || '-',
          consumption.moNumber || '-',
          `CO #${orderNumber}`,
          customerName,
          consumption.productName || '-',
          consumption.materialName || '-',
          consumption.batchNumber || '-',
          formatQuantity(consumption.quantity, 3),
          consumption.unit || '-',
          consumption.unitPrice.toFixed(4),
          consumption.totalCost.toFixed(4),
          consumption.userName || '-',
          consumption.includeInCosts ? 'TAK' : 'NIE'
        ];
      });

      // Dodaj podsumowanie na końcu
      const totalCost = filteredConsumption.reduce((sum, item) => sum + item.totalCost, 0);
      csvData.push([]);
      csvData.push([t('production.reports.consumption.summaryLabel'), '', '', '', '', '', '', '', '', '', '', totalCost.toFixed(4), '', '']);

      // Połącz nagłówki z danymi
      const fullData = [headers, ...csvData];

      // Konwertuj do CSV string
      const csvContent = fullData.map(row => 
        row.map(field => {
          // Zabezpiecz pola zawierające przecinki, cudzysłowy lub nowe linie
          const stringField = String(field);
          if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return `"${stringField.replace(/"/g, '""')}"`;
          }
          return stringField;
        }).join(',')
      ).join('\n');

      // Dodaj BOM dla poprawnego wyświetlania polskich znaków w Excel
      const BOM = '\uFEFF';
      const csvWithBOM = BOM + csvContent;

      // Utwórz i pobierz plik
      const blob = new Blob([csvWithBOM], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      
      // Nazwa pliku z datą
      const fileName = `konsumpcja_materialow_${format(startDate, 'yyyy-MM-dd')}_${format(endDate, 'yyyy-MM-dd')}.csv`;
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log(`[EKSPORT CSV] Wyeksportowano ${filteredConsumption.length} pozycji konsumpcji do pliku ${fileName}`);
    } catch (error) {
      console.error('[EKSPORT CSV] Błąd podczas eksportu:', error);
      showError(t('production.reports.consumption.exportErrorDetails'));
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Filtry dla konsumpcji */}
      <Paper sx={{ p: isMobile ? 1.5 : 3, mb: isMobile ? 1.5 : 3 }}>
        <Typography variant="h6" gutterBottom>
          {t('production.reports.consumption.filters')}
        </Typography>
        <Grid container spacing={isMobile ? 1 : 3} alignItems="center">
          <Grid item xs={12} sm={6} md={3}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
              <DatePicker
                label={t('production.reports.startDate')}
                value={startDate}
                onChange={(newDate) => onDateChange(newDate, endDate)}
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
                label={t('production.reports.endDate')}
                value={endDate}
                onChange={(newDate) => onDateChange(startDate, newDate)}
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
            <FormControl fullWidth size="small">
              <InputLabel>{t('production.productionReport.orderCO')}</InputLabel>
              <Select
                value={selectedOrder}
                onChange={(e) => setSelectedOrder(e.target.value)}
                label={t('production.productionReport.orderCO')}
              >
                <MenuItem value="all">{t('production.reports.consumption.allOrders')}</MenuItem>
                {ordersList.map(order => (
                  <MenuItem key={order.id} value={order.id}>
                    CO #{order.number}
                    {order.customer && ` - ${order.customer.name || order.customer}`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('production.productionReport.material')}</InputLabel>
              <Select
                value={selectedMaterial}
                onChange={(e) => setSelectedMaterial(e.target.value)}
                label={t('production.productionReport.material')}
              >
                <MenuItem value="all">{t('production.reports.consumption.allMaterials')}</MenuItem>
                {materialsList.map(material => (
                  <MenuItem key={material.id} value={material.id}>
                    {material.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      {/* Podsumowanie konsumpcji materiałów */}
      <Paper sx={{ p: isMobile ? 1.5 : 3, mb: isMobile ? 1.5 : 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="h6">
            {t('production.reports.consumption.summary')}
          </Typography>
          {consumptionData.length > 0 && (
            <Button
              variant="outlined"
              startIcon={<ExportIcon />}
              onClick={exportSummaryToCSV}
              size={isMobile ? "small" : "medium"}
              sx={{ ml: 2 }}
            >
              {t('common:common.exportCsv')}
            </Button>
          )}
        </Box>
        <Typography variant="body2" color="text.secondary" paragraph>
          {t('production.reports.consumption.period')} {format(startDate, 'dd.MM.yyyy')} - {format(endDate, 'dd.MM.yyyy')}
        </Typography>
        
        {consumptionData.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {t('production.reports.consumption.noSummaryData')}
            </Typography>
            <Typography color="text.secondary" paragraph>
              {t('production.reports.consumption.noConsumptionFound')}
            </Typography>
            <Typography variant="body2" color="primary" sx={{ fontWeight: 'medium' }}>
              {t('production.reports.consumption.instructionsTitle')}
            </Typography>
            <Box component="ul" sx={{ textAlign: 'left', display: 'inline-block', mt: 1, pl: 2 }}>
              <Typography component="li" variant="body2" color="text.secondary">
                {t('production.reports.consumption.instruction1')}
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                {t('production.reports.consumption.instruction2')}
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                {t('production.reports.consumption.instruction3')}
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                {t('production.reports.consumption.instruction4')}
              </Typography>
            </Box>
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('production.reports.consumption.tableHeaders.material')}</TableCell>
                  <TableCell align="right">{t('production.reports.consumption.tableHeaders.totalQuantity')}</TableCell>
                  <TableCell>{t('production.reports.consumption.tableHeaders.unit')}</TableCell>
                  <TableCell align="right">{t('production.reports.consumption.tableHeaders.averagePrice')}</TableCell>
                  <TableCell align="right">{t('production.reports.consumption.tableHeaders.totalCost')}</TableCell>
                  <TableCell align="center">{t('production.reports.consumption.tableHeaders.batchCount')}</TableCell>
                  <TableCell align="center">{t('production.reports.consumption.tableHeaders.taskCount')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {consumptionData.map((material, index) => (
                  <TableRow key={index} hover>
                    <TableCell sx={{ fontWeight: 'medium' }}>
                      {material.materialName}
                    </TableCell>
                    <TableCell align="right">
                      {formatQuantity(material.totalQuantity)}
                    </TableCell>
                    <TableCell>{material.unit}</TableCell>
                    <TableCell align="right">
                      {formatCurrency(material.avgUnitPrice)}
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                      {formatCurrency(material.totalCost)}
                    </TableCell>
                    <TableCell align="center">
                      <Chip 
                        label={material.batchCount} 
                        size="small" 
                        color="primary" 
                        variant="outlined" 
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Chip 
                        label={material.taskCount} 
                        size="small" 
                        color="secondary" 
                        variant="outlined" 
                      />
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ '& td': { fontWeight: 'bold', bgcolor: 'rgba(0, 0, 0, 0.04)' } }}>
                  <TableCell>{t('production.reports.consumption.sumTotal')}</TableCell>
                  <TableCell align="right">-</TableCell>
                  <TableCell>-</TableCell>
                  <TableCell align="right">-</TableCell>
                  <TableCell align="right">
                    {formatCurrency(consumptionData.reduce((sum, material) => sum + material.totalCost, 0))}
                  </TableCell>
                  <TableCell align="center">
                    {consumptionData.reduce((sum, material) => sum + material.batchCount, 0)}
                  </TableCell>
                  <TableCell align="center">
                    {new Set(consumptionData.flatMap(material => material.taskCount)).size}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      {/* Szczegółowa lista konsumpcji */}
      <Paper sx={{ p: isMobile ? 1.5 : 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">
            {t('production.reports.consumption.detailedList')}
          </Typography>
          {filteredConsumption.length > 0 && (
            <Button
              variant="outlined"
              startIcon={<ExportIcon />}
              onClick={exportToCSV}
              size={isMobile ? "small" : "medium"}
              sx={{ ml: 2 }}
            >
              {t('common:common.exportCsv')}
            </Button>
          )}
        </Box>
        
        {filteredConsumption.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 4 }}>
            <Typography variant="h6" color="text.secondary" gutterBottom>
              {t('production.reports.consumption.noConsumptionData')}
            </Typography>
            <Typography color="text.secondary" sx={{ mb: 2 }}>
              {t('production.reports.consumption.noConsumptionInPeriod', { dateFrom: format(startDate, 'dd.MM.yyyy'), dateTo: format(endDate, 'dd.MM.yyyy') })}
            </Typography>
            <Typography variant="body2" color="primary" sx={{ fontWeight: 'medium', mb: 1 }}>
              {t('production.reports.consumption.howToConsumeTitle')}
            </Typography>
            <Box component="ol" sx={{ textAlign: 'left', display: 'inline-block', mt: 1, pl: 2 }}>
              <Typography component="li" variant="body2" color="text.secondary">
                {t('production.reports.consumption.howToInstruction1')}
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                {t('production.reports.consumption.howToInstruction2')}
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                {t('production.reports.consumption.howToInstruction3')}
              </Typography>
              <Typography component="li" variant="body2" color="text.secondary">
                {t('production.reports.consumption.howToInstruction4')}
              </Typography>
            </Box>
          </Box>
        ) : (
          <TableContainer sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <SortableTableCell field="consumptionDate">
                    {t('production.reports.consumption.tableHeaders.consumptionDate')}
                  </SortableTableCell>
                  <SortableTableCell field="taskName">
                    {t('production.reports.consumption.tableHeaders.task')}
                  </SortableTableCell>
                  <SortableTableCell field="orderNumber">
                    {t('production.reports.consumption.tableHeaders.order')}
                  </SortableTableCell>
                  <SortableTableCell field="productName">
                    {t('production.reports.consumption.tableHeaders.product')}
                  </SortableTableCell>
                  <SortableTableCell field="materialName">
                    {t('production.reports.consumption.tableHeaders.material')}
                  </SortableTableCell>
                  <SortableTableCell field="batchNumber">
                    {t('production.reports.consumption.tableHeaders.batch')}
                  </SortableTableCell>
                  <SortableTableCell field="quantity" align="right">
                    {t('production.reports.consumption.tableHeaders.quantity')}
                  </SortableTableCell>
                  <SortableTableCell field="unit">
                    {t('production.reports.consumption.tableHeaders.unit')}
                  </SortableTableCell>
                  <SortableTableCell field="unitPrice" align="right">
                    {t('production.reports.consumption.tableHeaders.unitPrice')}
                  </SortableTableCell>
                  <SortableTableCell field="totalCost" align="right">
                    {t('production.reports.consumption.tableHeaders.cost')}
                  </SortableTableCell>
                  <SortableTableCell field="userName">
                    {t('production.reports.consumption.tableHeaders.user')}
                  </SortableTableCell>
                  <TableCell align="center">{t('production.reports.consumption.tableHeaders.includeInCosts')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredConsumption.map((consumption, index) => {
                  // Znajdź zadanie aby pobrać informacje o zamówieniu
                  const task = tasks.find(t => t.id === consumption.taskId);
                  const orderNumber = task?.orderNumber || '-';
                  const customerName = task?.customer?.name || task?.customer || '';
                  
                  return (
                    <TableRow key={index} hover>
                      <TableCell>
                        {consumption.consumptionDate 
                          ? format(consumption.consumptionDate, 'dd.MM.yyyy HH:mm')
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                            {consumption.taskName}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            MO: {consumption.moNumber || '-'}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                            CO #{orderNumber}
                          </Typography>
                          {customerName && (
                            <Typography variant="caption" color="text.secondary">
                              {customerName}
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>{consumption.productName}</TableCell>
                      <TableCell sx={{ fontWeight: 'medium' }}>
                        {consumption.materialName}
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                        {consumption.batchNumber}
                      </TableCell>
                      <TableCell align="right">
                        {formatQuantity(consumption.quantity)}
                      </TableCell>
                      <TableCell>{consumption.unit}</TableCell>
                      <TableCell align="right">
                        {formatCurrency(consumption.unitPrice)}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                        {formatCurrency(consumption.totalCost)}
                      </TableCell>
                      <TableCell>{consumption.userName}</TableCell>
                      <TableCell align="center">
                        <Chip 
                          label={consumption.includeInCosts ? 'TAK' : 'NIE'}
                          size="small"
                          color={consumption.includeInCosts ? 'success' : 'default'}
                          variant={consumption.includeInCosts ? 'filled' : 'outlined'}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  );
};

export default ProductionReportPage; 