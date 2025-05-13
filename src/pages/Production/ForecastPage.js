import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Alert,
  Chip,
  Divider,
  Tooltip,
  IconButton,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  ShoppingCart as OrderIcon,
  Print as PrintIcon,
  Download as DownloadIcon,
  Info as InfoIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl } from 'date-fns/locale';
import { format, addDays, parseISO } from 'date-fns';
import { getAllPlannedTasks, generateMaterialsReport } from '../../services/productionService';
import { getAllInventoryItems } from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatCurrency } from '../../utils/formatUtils';
import { formatDateTime } from '../../utils/formatters';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';

const ForecastPage = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [forecastData, setForecastData] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(addDays(new Date(), 30));
  const [timeRange, setTimeRange] = useState('30days');
  const [calculatingForecast, setCalculatingForecast] = useState(false);
  
  // State do formatowania liczb
  const formatNumber = (num) => {
    if (num === undefined || num === null) return '0';
    return Number(num).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };
  
  // Pobieranie danych
  useEffect(() => {
    fetchData();
  }, []);
  
  // Aktualizacja prognoz przy zmianie dat
  useEffect(() => {
    if (tasks.length > 0 && inventoryItems.length > 0) {
      calculateForecast();
    }
  }, [startDate, endDate, tasks, inventoryItems]);
  
  // Pobieranie zadań i materiałów z bazy
  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Pobierz zaplanowane zadania produkcyjne
      const tasksData = await getAllPlannedTasks();
      console.log(`Pobrano ${tasksData.length} zadań produkcyjnych`);
      if (tasksData.length > 0) {
        console.log('Przykładowe zadanie:', tasksData[0]);
        console.log('Format daty zadania:', tasksData[0].scheduledDate);
      }
      setTasks(tasksData);
      
      // Pobierz wszystkie przedmioty magazynowe
      const items = await getAllInventoryItems();
      console.log(`Pobrano ${items.length} pozycji magazynowych`);
      setInventoryItems(items);
      
      // Oblicz prognozę zapotrzebowania
      await calculateForecast(tasksData, items);
      
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania danych:', error);
      showError('Nie udało się pobrać danych prognozy');
      setLoading(false);
    }
  };
  
  // Funkcja do obliczania prognozy zapotrzebowania na podstawie zadań
  const calculateForecast = async (tasksData = tasks, itemsData = inventoryItems) => {
    try {
      setCalculatingForecast(true);
      console.log('Rozpoczynam obliczanie prognozy zapotrzebowania dla okresu', 
        formatDateDisplay(startDate), '-', formatDateDisplay(endDate));
      
      // Filtruj zadania, które mają być wykonane w wybranym okresie
      console.log(`Filtrowanie zadań w okresie: ${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`);
      console.log(`Liczba wszystkich zadań przed filtrowaniem: ${tasksData.length}`);
      
      // Upewnij się, że daty są obiektami Date
      const startDateTime = new Date(startDate);
      const endDateTime = new Date(endDate);
      
      console.log('Zakres dat (timestamp):', startDateTime.getTime(), '-', endDateTime.getTime());
      
      // Filtruj zadania na podstawie zakresu dat
      const filteredTasks = tasksData.filter(task => {
        if (!task.scheduledDate) {
          console.log(`Zadanie ${task.id} nie ma daty rozpoczęcia, pomijam`);
          return false;
        }
        
        // Konwersja ciągu znaków na obiekt Date, jeśli to konieczne
        let taskDate;
        if (typeof task.scheduledDate === 'string') {
          taskDate = parseISO(task.scheduledDate);
        } else if (task.scheduledDate?.toDate) {
          // Dla obiektów Timestamp z Firestore
          taskDate = task.scheduledDate.toDate();
        } else {
          taskDate = task.scheduledDate;
        }
        
        // Wyświetl informacje o datach dla każdego zadania
        console.log(`Zadanie ${task.id}: ${task.name}, data: ${taskDate}, status: ${task.status}`);
        
        // Pobierz tylko datę (dzień) z pełnej daty (bez czasu/godziny)
        const taskDateOnly = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());
        const startDateOnly = new Date(startDateTime.getFullYear(), startDateTime.getMonth(), startDateTime.getDate());
        const endDateOnly = new Date(endDateTime.getFullYear(), endDateTime.getMonth(), endDateTime.getDate());
        
        // Rozszerz filtrowanie, aby uwzględniało zadania "Zaplanowane", "W trakcie" oraz "Wstrzymane"
        const isInDateRange = taskDateOnly >= startDateOnly && taskDateOnly <= endDateOnly;
        const isValidStatus = task.status === 'Zaplanowane' || task.status === 'W trakcie' || task.status === 'Wstrzymane';
        
        // Dodaj dodatkowy log do debugowania
        console.log(`Zadanie ${task.id} - isInDateRange: ${isInDateRange}, isValidStatus: ${isValidStatus}, taskDateOnly: ${taskDateOnly}, startDateOnly: ${startDateOnly}, endDateOnly: ${endDateOnly}`);
        
        // Zadania "Wstrzymane" uwzględniamy zawsze, niezależnie od daty
        if (task.status === 'Wstrzymane') {
          return true;
        }
        
        return isInDateRange && isValidStatus;
      });
      
      // Tymczasowo: jeśli nie ma zadań w zakresie dat, weź wszystkie zaplanowane zadania
      if (filteredTasks.length === 0) {
        console.log('Brak zadań w wybranym zakresie dat, próbuję użyć wszystkich zaplanowanych zadań');
        
        const allPlannedTasks = tasksData.filter(task => {
          const isValidStatus = (task.status === 'Zaplanowane' || task.status === 'W trakcie' || task.status === 'Wstrzymane');
          console.log(`Rozważam zadanie ${task.id}: status=${task.status}, isValidStatus=${isValidStatus}`);
          return isValidStatus;
        });
        
        if (allPlannedTasks.length > 0) {
          console.log(`Znaleziono ${allPlannedTasks.length} zaplanowanych zadań`);
          
          // Aktualizuj daty, aby obejmowały wszystkie zadania
          const taskDates = allPlannedTasks
            .filter(task => task.scheduledDate)
            .map(task => {
              if (typeof task.scheduledDate === 'string') {
                return parseISO(task.scheduledDate);
              } else if (task.scheduledDate?.toDate) {
                return task.scheduledDate.toDate();
              }
              return task.scheduledDate;
            });
          
          if (taskDates.length > 0) {
            const earliestDate = new Date(Math.min(...taskDates.map(d => d.getTime())));
            const latestDate = new Date(Math.max(...taskDates.map(d => d.getTime())));
            
            // Ustaw daty na podstawie znalezionych zadań
            setStartDate(earliestDate);
            setEndDate(addDays(latestDate, 7)); // dodaj trochę marginesu
            
            console.log(`Zaktualizowano zakres dat na: ${formatDateDisplay(earliestDate)} - ${formatDateDisplay(addDays(latestDate, 7))}`);
            
            // Użyj wszystkich zadań zamiast filtrowanych
            filteredTasks.push(...allPlannedTasks);
          }
        }
      }
      
      console.log(`Po filtrowaniu pozostało ${filteredTasks.length} zadań`);
      
      // Używamy bezpośrednio przefiltrowanych zadań, bez dodatkowego wykluczania "Wstrzymane"
      const finalFilteredTasks = filteredTasks;
      
      console.log(`Wszystkie zadania uwzględnione w prognozie: ${finalFilteredTasks.length}`);
      
      filteredTasks.forEach(task => {
        console.log(`Zadanie ${task.id} (${task.name || 'bez nazwy'}): ${task.materials?.length || 0} materiałów, status: ${task.status}`);
        // Dodaj szczegółowe informacje o zadaniu
        if (task.materials && task.materials.length > 0) {
          console.log('Materiały w zadaniu:');
          task.materials.forEach(material => {
            console.log(`  - ${material.name}: ilość na jednostkę = ${material.quantity}, ilość zadania = ${task.quantity}, typ ilości = ${typeof material.quantity}`);
          });
        }
      });
      
      if (finalFilteredTasks.length === 0) {
        setForecastData([]);
        setCalculatingForecast(false);
        return;
      }
      
      // Oblicz potrzebne ilości materiałów na podstawie zadań produkcyjnych
      const materialRequirements = {};
      
      // Funkcja korygująca nieprawidłowe ilości - wyciąga wartość na jednostkę produktu
      const correctMaterialQuantity = (material, taskQuantity, task) => {
        // Sprawdź, czy materiał ma prawidłowo określoną ilość na jednostkę produktu
        if (material.quantityPerUnit && material.quantityPerUnit > 0) {
          console.log(`${material.name}: użyto jawnie określonej wartości quantityPerUnit: ${material.quantityPerUnit}`);
          return material.quantityPerUnit;
        }
        
        // Sprawdź, czy materiał ma oznaczenie, że jest dla całego zadania
        if (material.isFullTaskQuantity || material.isTotal) {
          const valuePerUnit = material.quantity / taskQuantity;
          console.log(`${material.name}: ilość dla całego zadania podzielona: ${material.quantity} / ${taskQuantity} = ${valuePerUnit}`);
          return valuePerUnit;
        }
        
        // W zadaniach produkcyjnych przechowujemy wartości całkowite dla zadania, więc dzielimy przez ilość
        if (taskQuantity > 0) {
          const valuePerUnit = material.quantity / taskQuantity;
          console.log(`${material.name}: wykryto wartość całkowitą: ${material.quantity} / ${taskQuantity} = ${valuePerUnit}`);
          return valuePerUnit;
        }
        
        // Jeśli nic innego nie zadziała, użyj oryginalnej wartości (może być błędna)
        return material.quantity;
      };
      
      for (const task of finalFilteredTasks) {
        // Upewnij się, że zadanie ma materiały
        if (!task.materials || task.materials.length === 0) {
          console.log(`Zadanie ${task.id} (${task.name || 'bez nazwy'}) nie ma materiałów, pomijam`);
          continue;
        }
        
        for (const material of task.materials) {
          // Upewnij się, że materiał ma ID - akceptujemy zarówno id jak i inventoryItemId
          const materialId = material.id || material.inventoryItemId;
          
          if (!materialId) {
            console.warn('Materiał bez ID, pomijam', material);
            continue;
          }
          
          // Konwertuj ilości na liczby - upewnij się, że są poprawnie sparsowane
          let materialQuantity = 0;
          let taskQuantity = 0;
          
          try {
            // Bezpieczne parsowanie wartości z obsługą różnych formatów
            materialQuantity = typeof material.quantity === 'number' 
              ? material.quantity 
              : parseFloat(material.quantity) || 0;
              
            taskQuantity = typeof task.quantity === 'number'
              ? task.quantity
              : parseFloat(task.quantity) || 1;
          } catch (error) {
            console.error('Błąd podczas parsowania ilości:', error);
            materialQuantity = 0;
            taskQuantity = 1;
          }
          
          if (materialQuantity <= 0) {
            console.warn(`Materiał ${material.name} ma nieprawidłową ilość: ${material.quantity}`);
            continue;
          }
          
          // Wyciągnij ilość materiału na jednostkę produktu
          const materialQuantityPerUnit = correctMaterialQuantity(material, taskQuantity, task);
          
          // Oblicz całkowitą potrzebną ilość
          const requiredQuantity = materialQuantityPerUnit * taskQuantity;
          
          console.log(`Ostateczne obliczenie dla ${material.name}: ${materialQuantityPerUnit} × ${taskQuantity} = ${requiredQuantity}`);
          
          // Dodaj lub zaktualizuj materiał w wymaganiach
          if (!materialRequirements[materialId]) {
            materialRequirements[materialId] = {
              id: materialId,
              name: material.name,
              category: material.category || 'Inne',
              unit: material.unit || 'szt.',
              requiredQuantity: 0,
              availableQuantity: 0,
              tasks: [], // Lista zadań, w których materiał jest używany
              perUnitQuantity: materialQuantityPerUnit // Zapamiętaj ilość na jednostkę
            };
          }
          
          materialRequirements[materialId].requiredQuantity += requiredQuantity;
          
          // Dodaj to zadanie do listy zadań, gdzie materiał jest używany
          if (!materialRequirements[materialId].tasks.includes(task.id)) {
            materialRequirements[materialId].tasks.push(task.id);
          }
        }
      }
      
      // Uzupełnij dostępne ilości z magazynu
      for (const material of itemsData) {
        if (materialRequirements[material.id]) {
          materialRequirements[material.id].availableQuantity = parseFloat(material.quantity) || 0;
          // Dodaj informację o cenie z magazynu
          materialRequirements[material.id].price = material.price || 0;
          materialRequirements[material.id].cost = material.price * materialRequirements[material.id].requiredQuantity;
        }
      }
      
      // Pobierz informacje o zamówieniach komponentów (PO) dla każdego materiału
      for (const materialId in materialRequirements) {
        try {
          const { getAwaitingOrdersForInventoryItem } = await import('../../services/inventoryService');
          const purchaseOrders = await getAwaitingOrdersForInventoryItem(materialId);
          
          // Dodaj informacje o przyszłych dostawach do prognozy
          if (purchaseOrders && purchaseOrders.length > 0) {
            // Inicjalizuj tablicę przyszłych dostaw, jeśli nie istnieje
            if (!materialRequirements[materialId].futureDeliveries) {
              materialRequirements[materialId].futureDeliveries = [];
            }
            
            // Dodaj informacje o wszystkich przyszłych dostawach
            for (const po of purchaseOrders) {
              for (const item of po.items) {
                materialRequirements[materialId].futureDeliveries.push({
                  poNumber: po.number || 'Brak numeru',
                  poId: po.id,
                  status: po.status,
                  quantity: item.quantityRemaining,
                  expectedDeliveryDate: item.expectedDeliveryDate || po.expectedDeliveryDate
                });
              }
            }
            
            // Sortuj dostawy według daty (od najwcześniejszej)
            materialRequirements[materialId].futureDeliveries.sort((a, b) => {
              if (!a.expectedDeliveryDate) return 1;
              if (!b.expectedDeliveryDate) return -1;
              return new Date(a.expectedDeliveryDate) - new Date(b.expectedDeliveryDate);
            });
            
            // Oblicz sumę przyszłych dostaw
            const totalFutureDeliveries = materialRequirements[materialId].futureDeliveries.reduce(
              (sum, delivery) => sum + parseFloat(delivery.quantity || 0), 0
            );
            
            materialRequirements[materialId].futureDeliveriesTotal = totalFutureDeliveries;
            
            // Zaktualizuj bilans uwzględniając przyszłe dostawy
            materialRequirements[materialId].balanceWithFutureDeliveries = 
              materialRequirements[materialId].availableQuantity + 
              totalFutureDeliveries - 
              materialRequirements[materialId].requiredQuantity;
          } else {
            materialRequirements[materialId].futureDeliveriesTotal = 0;
            materialRequirements[materialId].balanceWithFutureDeliveries = 
              materialRequirements[materialId].availableQuantity - 
              materialRequirements[materialId].requiredQuantity;
          }
        } catch (error) {
          console.error(`Błąd podczas pobierania zamówień dla materiału ${materialId}:`, error);
          materialRequirements[materialId].futureDeliveriesTotal = 0;
          materialRequirements[materialId].balanceWithFutureDeliveries = 
            materialRequirements[materialId].availableQuantity - 
            materialRequirements[materialId].requiredQuantity;
        }
      }
      
      // Przekształć obiekt do tablicy
      const forecastResult = Object.values(materialRequirements).map(item => ({
        ...item,
        requiredQuantity: parseFloat(item.requiredQuantity.toFixed(2)) || 0,
        availableQuantity: parseFloat(item.availableQuantity.toFixed(2)) || 0,
        balance: parseFloat((item.availableQuantity - item.requiredQuantity).toFixed(2)),
        futureDeliveriesTotal: parseFloat(item.futureDeliveriesTotal?.toFixed(2)) || 0,
        balanceWithFutureDeliveries: parseFloat(item.balanceWithFutureDeliveries?.toFixed(2)) || 0,
        cost: parseFloat((item.price * item.requiredQuantity).toFixed(2)) || 0
      }));
      
      // Posortuj według niedoboru (od największego) - uwzględniając przyszłe dostawy
      forecastResult.sort((a, b) => a.balanceWithFutureDeliveries - b.balanceWithFutureDeliveries);
      
      console.log(`Obliczono prognozę dla ${forecastResult.length} materiałów`);
      if (forecastResult.length > 0) {
        console.log('Przykładowe pozycje prognozy:');
        forecastResult.slice(0, 3).forEach(item => {
          console.log(`- ${item.name}: potrzeba ${item.requiredQuantity} ${item.unit}, dostępne ${item.availableQuantity} ${item.unit}, bilans ${item.balance} ${item.unit}`);
        });
      }
      
      setForecastData(forecastResult);
      setCalculatingForecast(false);
    } catch (error) {
      console.error('Błąd podczas obliczania prognozy:', error);
      showError('Nie udało się obliczyć prognozy zapotrzebowania');
      setCalculatingForecast(false);
    }
  };
  
  // Odświeżanie danych
  const handleRefresh = () => {
    fetchData();
  };
  
  // Generowanie raportu
  const handleGenerateReport = async () => {
    try {
      if (forecastData.length === 0) {
        showError('Brak danych do wygenerowania raportu');
        return;
      }
      
      const reportUrl = await generateMaterialsReport(forecastData, startDate, endDate);
      if (reportUrl) {
        showSuccess('Raport został wygenerowany pomyślnie');
      }
    } catch (error) {
      console.error('Błąd podczas generowania raportu:', error);
      showError('Nie udało się wygenerować raportu');
    }
  };
  
  // Obsługa zmiany zakresu czasu
  const handleTimeRangeChange = (e) => {
    const range = e.target.value;
    setTimeRange(range);
    
    const today = new Date();
    let newEndDate;
    
    switch (range) {
      case '7days':
        newEndDate = addDays(today, 7);
        break;
      case '14days':
        newEndDate = addDays(today, 14);
        break;
      case '30days':
        newEndDate = addDays(today, 30);
        break;
      case '60days':
        newEndDate = addDays(today, 60);
        break;
      case '90days':
        newEndDate = addDays(today, 90);
        break;
      case 'custom':
        // Pozostaw daty bez zmian
        return;
      default:
        newEndDate = addDays(today, 30);
    }
    
    setStartDate(today);
    setEndDate(newEndDate);
  };
  
  // Formatowanie daty do wyświetlenia
  const formatDateDisplay = (date) => {
    try {
      if (!date) return '';
      
      // Upewnij się, że data jest obiektem Date
      const dateObj = date instanceof Date ? date : new Date(date);
      
      // Sprawdź, czy data jest prawidłowa
      if (isNaN(dateObj.getTime())) {
        console.warn('Nieprawidłowa data:', date);
        return '';
      }
      
      return format(dateObj, 'dd.MM.yyyy', { locale: pl });
    } catch (error) {
      console.error('Błąd podczas formatowania daty:', error, date);
      return '';
    }
  };
  
  // Renderowanie statusu dostępności materiału
  const renderAvailabilityStatus = (item) => {
    const balance = item.balance;
    
    if (balance >= 0) {
      return (
        <Chip 
          label="Wystarczająca ilość" 
          color="success" 
          size="small" 
        />
      );
    } else if (balance > -item.requiredQuantity * 0.2) {
      return (
        <Chip 
          label="Prawie wystarczająca" 
          color="warning" 
          size="small" 
        />
      );
    } else {
      return (
        <Chip 
          label="Niewystarczająca ilość" 
          color="error" 
          size="small" 
        />
      );
    }
  };
  
  // Renderowanie listy zadań dla danego materiału
  const renderTasksForMaterial = (tasksIds) => {
    const materialTasks = tasks.filter(task => tasksIds.includes(task.id));
    
    return (
      <Tooltip
        title={
          <Box>
            <Typography variant="subtitle2">Zadania używające tego materiału:</Typography>
            <ul style={{ margin: '5px 0', paddingLeft: '16px' }}>
              {materialTasks.map(task => (
                <li key={task.id}>
                  {task.name || 'Zadanie bez nazwy'} - {task.quantity} {task.unit}
                  {task.scheduledDate && (() => {
                    try {
                      let taskDate;
                      if (typeof task.scheduledDate === 'string') {
                        taskDate = parseISO(task.scheduledDate);
                      } else if (task.scheduledDate?.toDate) {
                        taskDate = task.scheduledDate.toDate();
                      } else if (task.scheduledDate instanceof Date) {
                        taskDate = task.scheduledDate;
                      } else {
                        return '';
                      }
                      
                      return ` (${formatDateTime(taskDate)})`;
                    } catch (error) {
                      console.error('Błąd formatowania daty:', error, task.scheduledDate);
                      return '';
                    }
                  })()}
                </li>
              ))}
            </ul>
          </Box>
        }
        arrow
      >
        <IconButton size="small">
          <InfoIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  };
  
  // Kalkulacja sumarycznych statystyk
  const calculateSummary = () => {
    if (!forecastData || forecastData.length === 0) return null;
    
    const summary = {
      totalItems: forecastData.length,
      requiredItems: forecastData.filter(item => item.balance < 0).length,
      requiredItemsAfterDeliveries: forecastData.filter(item => item.balanceWithFutureDeliveries < 0).length,
      totalCost: forecastData.reduce((sum, item) => sum + (item.cost || 0), 0),
      shortageValue: forecastData
        .filter(item => item.balance < 0)
        .reduce((sum, item) => sum + (Math.abs(item.balance) * (item.price || 0)), 0),
      shortageValueAfterDeliveries: forecastData
        .filter(item => item.balanceWithFutureDeliveries < 0)
        .reduce((sum, item) => sum + (Math.abs(item.balanceWithFutureDeliveries) * (item.price || 0)), 0)
    };
    
    return summary;
  };
  
  const summary = calculateSummary();
  
  // Obsługa dialogu ze szczegółami materiału
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  
  const handleItemClick = (item) => {
    setSelectedMaterial(item);
    setDetailsDialogOpen(true);
  };
  
  const handleCloseDetailsDialog = () => {
    setDetailsDialogOpen(false);
  };
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5">
          Prognoza zapotrzebowania materiałów
        </Typography>
        <Box>
          <Button 
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            sx={{ mr: 1 }}
            disabled={loading || calculatingForecast}
          >
            Odśwież
          </Button>
          <Button 
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleGenerateReport}
            disabled={forecastData.length === 0 || loading || calculatingForecast}
          >
            Generuj raport
          </Button>
        </Box>
      </Box>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={4}>
            <FormControl fullWidth>
              <InputLabel>Zakres czasowy</InputLabel>
              <Select
                value={timeRange}
                onChange={handleTimeRangeChange}
                label="Zakres czasowy"
                disabled={loading || calculatingForecast}
              >
                <MenuItem value="7days">7 dni</MenuItem>
                <MenuItem value="14days">14 dni</MenuItem>
                <MenuItem value="30days">30 dni</MenuItem>
                <MenuItem value="60days">60 dni</MenuItem>
                <MenuItem value="90days">90 dni</MenuItem>
                <MenuItem value="custom">Niestandardowy</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label="Data początkowa"
                value={startDate}
                onChange={(newDate) => {
                  setStartDate(newDate);
                  setTimeRange('custom');
                }}
                sx={{ width: '100%' }}
                disabled={loading || calculatingForecast}
              />
            </LocalizationProvider>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label="Data końcowa"
                value={endDate}
                onChange={(newDate) => {
                  setEndDate(newDate);
                  setTimeRange('custom');
                }}
                sx={{ width: '100%' }}
                disabled={loading || calculatingForecast}
              />
            </LocalizationProvider>
          </Grid>
        </Grid>
      </Paper>
      
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" gutterBottom>
          Prognoza na okres: {formatDateDisplay(startDate)} - {formatDateDisplay(endDate)}
        </Typography>
        
        {summary && (
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} sm={6} md={2}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.darker' }}>
                <Typography variant="body2" color="text.secondary">Łączna liczba materiałów</Typography>
                <Typography variant="h6">{summary.totalItems}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.darker' }}>
                <Typography variant="body2" color="text.secondary">Materiały wymagające zakupu</Typography>
                <Typography variant="h6">{summary.requiredItems}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.darker' }}>
                <Typography variant="body2" color="text.secondary">Materiały z niedoborem po dostawach</Typography>
                <Typography variant="h6">{summary.requiredItemsAfterDeliveries}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.darker' }}>
                <Typography variant="body2" color="text.secondary">Wartość niedoborów</Typography>
                <Typography variant="h6">{formatCurrency(summary.shortageValue)}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.darker' }}>
                <Typography variant="body2" color="text.secondary">Wartość niedoborów po dostawach</Typography>
                <Typography variant="h6">{formatCurrency(summary.shortageValueAfterDeliveries)}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'background.darker' }}>
                <Typography variant="body2" color="text.secondary">Szacowany koszt całkowity</Typography>
                <Typography variant="h6">{formatCurrency(summary.totalCost)}</Typography>
              </Paper>
            </Grid>
          </Grid>
        )}
      </Box>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : calculatingForecast ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mt: 4 }}>
          <CircularProgress size={24} sx={{ mb: 2 }} />
          <Typography>Obliczanie prognozy zapotrzebowania...</Typography>
        </Box>
      ) : forecastData.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          Brak danych do wyświetlenia w wybranym okresie. Wybierz inny zakres dat lub upewnij się, że istnieją zaplanowane zadania produkcyjne.
        </Alert>
      ) : (
        <Paper sx={{ mt: 2 }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width="25%">Materiał</TableCell>
                  <TableCell align="right" width="10%">Dostępna ilość</TableCell>
                  <TableCell align="right" width="10%">Potrzebna ilość</TableCell>
                  <TableCell align="right" width="10%">Bilans</TableCell>
                  <TableCell align="right" width="10%">Oczekiwane dostawy</TableCell>
                  <TableCell align="right" width="10%">Bilans z dostawami</TableCell>
                  <TableCell align="right" width="10%">Szacowany koszt</TableCell>
                  <TableCell width="10%">Status</TableCell>
                  <TableCell align="center" width="5%">Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {forecastData.map((item) => {
                  const balance = item.balance;
                  const balanceWithDeliveries = item.balanceWithFutureDeliveries;
                  let statusColor = 'success';
                  let statusText = 'Wystarczająca ilość';
                  
                  // Sprawdzenie statusu uwzględniając przyszłe dostawy
                  if (balanceWithDeliveries < 0) {
                    statusColor = 'error';
                    statusText = 'Niedobór';
                  } else if (balance < 0 && balanceWithDeliveries >= 0) {
                    statusColor = 'warning';
                    statusText = 'Uzupełniany dostawami';
                  }
                  
                  return (
                    <TableRow key={item.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                          {item.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {item.category}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {formatNumber(item.availableQuantity)} {item.unit}
                      </TableCell>
                      <TableCell align="right">
                        {formatNumber(item.requiredQuantity)} {item.unit}
                      </TableCell>
                      <TableCell align="right">
                        <Typography 
                          color={balance < 0 ? 'error' : 'success'}
                          fontWeight={balance < 0 ? 'bold' : 'normal'}
                        >
                          {formatNumber(balance)} {item.unit}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {item.futureDeliveriesTotal > 0 ? (
                          <Tooltip title={
                            item.futureDeliveries ? item.futureDeliveries.map(delivery => 
                              `${delivery.poNumber}: ${formatNumber(delivery.quantity)} ${item.unit} (${delivery.expectedDeliveryDate ? formatDateDisplay(new Date(delivery.expectedDeliveryDate)) : 'brak daty'})`
                            ).join('\n') : 'Brak szczegółów'
                          }>
                            <Typography sx={{ cursor: 'pointer' }}>
                              {formatNumber(item.futureDeliveriesTotal)} {item.unit}
                            </Typography>
                          </Tooltip>
                        ) : (
                          <Typography>0 {item.unit}</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography 
                          color={balanceWithDeliveries < 0 ? 'error' : 'success'}
                          fontWeight={balanceWithDeliveries < 0 ? 'bold' : 'normal'}
                        >
                          {formatNumber(balanceWithDeliveries)} {item.unit}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {formatCurrency(item.cost)}
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={statusText} 
                          color={statusColor} 
                          size="small" 
                          sx={{ minWidth: '120px' }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <IconButton 
                          size="small" 
                          color="primary" 
                          onClick={() => handleItemClick(item)}
                          title="Pokaż szczegóły"
                        >
                          <InfoIcon fontSize="small" />
                        </IconButton>
                        {balance < 0 && (
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => navigate('/purchase-orders/new', { 
                              state: { materialId: item.id, requiredQuantity: Math.abs(balance) }
                            })}
                            title="Zamów materiał"
                          >
                            <ShoppingCartIcon fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
      
      {forecastData.length > 0 && (
        <>
          <Divider sx={{ my: 4 }} />
          
          <Typography variant="h6" gutterBottom>
            Zadania produkcyjne w wybranym okresie
          </Typography>
          
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Zadanie</TableCell>
                  <TableCell>Produkt</TableCell>
                  <TableCell align="right">Ilość</TableCell>
                  <TableCell>Data rozpoczęcia</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tasks
                  .filter(task => {
                    if (!task.scheduledDate) return false;
                    
                    let taskDate;
                    if (typeof task.scheduledDate === 'string') {
                      taskDate = parseISO(task.scheduledDate);
                    } else if (task.scheduledDate?.toDate) {
                      taskDate = task.scheduledDate.toDate();
                    } else {
                      taskDate = task.scheduledDate;
                    }

                    // Zmodyfikowane porównanie dat - porównujemy tylko daty bez czasu (godzin)
                    const taskDateOnly = new Date(taskDate.getFullYear(), taskDate.getMonth(), taskDate.getDate());
                    const startDateOnly = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
                    const endDateOnly = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
                    
                    return taskDateOnly >= startDateOnly && taskDateOnly <= endDateOnly;
                  })
                  .map((task) => (
                    <TableRow 
                      key={task.id}
                      hover
                      onClick={() => navigate(`/production/tasks/${task.id}`)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>{task.name}</TableCell>
                      <TableCell>{task.productName}</TableCell>
                      <TableCell align="right">{task.quantity} {task.unit}</TableCell>
                      <TableCell>
                        {task.scheduledDate ? (() => {
                          try {
                            let taskDate;
                            if (typeof task.scheduledDate === 'string') {
                              taskDate = parseISO(task.scheduledDate);
                            } else if (task.scheduledDate?.toDate) {
                              taskDate = task.scheduledDate.toDate();
                            } else if (task.scheduledDate instanceof Date) {
                              taskDate = task.scheduledDate;
                            } else {
                              return '-';
                            }
                            
                            return formatDateTime(taskDate);
                          } catch (error) {
                            console.error('Błąd formatowania daty zadania:', error, task.scheduledDate);
                            return '-';
                          }
                        })() : '-'}
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={task.status} 
                          color={task.status === 'Zaplanowane' ? 'primary' : 'default'} 
                          size="small" 
                        />
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
      
      {/* Dialog ze szczegółami materiału */}
      <Dialog open={detailsDialogOpen} onClose={handleCloseDetailsDialog} maxWidth="md" fullWidth>
        <DialogTitle>Szczegóły materiału</DialogTitle>
        <DialogContent>
          {selectedMaterial && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6">{selectedMaterial.name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Kategoria: {selectedMaterial.category}
              </Typography>
              
              <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={4}>
                  <Typography variant="body2" color="text.secondary">Dostępna ilość:</Typography>
                  <Typography variant="body1">{formatNumber(selectedMaterial.availableQuantity)} {selectedMaterial.unit}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="body2" color="text.secondary">Potrzebna ilość:</Typography>
                  <Typography variant="body1">{formatNumber(selectedMaterial.requiredQuantity)} {selectedMaterial.unit}</Typography>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="body2" color="text.secondary">Bilans:</Typography>
                  <Typography variant="body1" color={selectedMaterial.balance < 0 ? 'error.main' : 'success.main'}>
                    {formatNumber(selectedMaterial.balance)} {selectedMaterial.unit}
                  </Typography>
                </Grid>
              </Grid>
              
              {selectedMaterial.futureDeliveries && selectedMaterial.futureDeliveries.length > 0 && (
                <>
                  <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                    Oczekiwane dostawy ({formatNumber(selectedMaterial.futureDeliveriesTotal)} {selectedMaterial.unit})
                  </Typography>
                  <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Numer PO</TableCell>
                          <TableCell>Status</TableCell>
                          <TableCell align="right">Ilość</TableCell>
                          <TableCell align="right">Data dostawy</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedMaterial.futureDeliveries.map((delivery, index) => (
                          <TableRow key={`delivery-${index}`}>
                            <TableCell>
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  cursor: 'pointer', 
                                  textDecoration: 'underline',
                                  color: 'primary.main'
                                }}
                                onClick={() => navigate(`/purchase-orders/${delivery.poId}`)}
                              >
                                {delivery.poNumber}
                              </Typography>
                            </TableCell>
                            <TableCell>{delivery.status}</TableCell>
                            <TableCell align="right">{formatNumber(delivery.quantity)} {selectedMaterial.unit}</TableCell>
                            <TableCell align="right">
                              {delivery.expectedDeliveryDate 
                                ? formatDateDisplay(new Date(delivery.expectedDeliveryDate))
                                : 'Brak daty'
                              }
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}
              
              {selectedMaterial.tasks && selectedMaterial.tasks.length > 0 && (
                <>
                  <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                    Zadania używające tego materiału
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Zadanie</TableCell>
                          <TableCell align="right">Ilość produktu</TableCell>
                          <TableCell align="right">Materiału na jedn.</TableCell>
                          <TableCell align="right">Data wykonania</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedMaterial.tasks.map(taskId => {
                          const task = tasks.find(t => t.id === taskId);
                          if (!task) return null;
                          
                          const materialInTask = task.materials?.find(m => m.id === selectedMaterial.id);
                          const quantityPerUnit = materialInTask?.quantity || 0;
                          
                          return (
                            <TableRow key={taskId}>
                              <TableCell>
                                <Typography 
                                  variant="body2" 
                                  sx={{ 
                                    cursor: 'pointer', 
                                    textDecoration: 'underline',
                                    color: 'primary.main'
                                  }}
                                  onClick={() => navigate(`/production/tasks/${taskId}`)}
                                >
                                  {task.name}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">{formatNumber(task.quantity || 0)}</TableCell>
                              <TableCell align="right">{formatNumber(quantityPerUnit)} {selectedMaterial.unit}</TableCell>
                              <TableCell align="right">
                                {task.scheduledDate 
                                  ? formatDateDisplay(new Date(task.scheduledDate))
                                  : 'Brak daty'
                                }
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}
              
              {selectedMaterial.balance < 0 && (
                <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<ShoppingCartIcon />}
                    onClick={() => {
                      navigate('/purchase-orders/new', { 
                        state: { materialId: selectedMaterial.id, requiredQuantity: Math.abs(selectedMaterial.balance) }
                      });
                      handleCloseDetailsDialog();
                    }}
                  >
                    Zamów materiał
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDetailsDialog}>Zamknij</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ForecastPage; 