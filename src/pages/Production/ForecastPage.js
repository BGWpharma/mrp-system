import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
  DialogTitle,
  InputAdornment,
  TextField,
  Autocomplete,
  Badge,
  Stack,
  ListItemIcon,
  ListItemText,
  Fade,
  Slide,
  Grow,
  Skeleton
} from '@mui/material';
// ✅ OPTYMALIZACJA: Import wspólnych stylów MUI
import { 
  flexCenter, 
  flexBetween,
  loadingContainer,
  mb1,
  mb2,
  mb3,
  mt1,
  mt2,
  mr1,
  p2,
  p3
} from '../../styles/muiCommonStyles';
import {
  Refresh as RefreshIcon,
  ShoppingCart as OrderIcon,
  Print as PrintIcon,
  Download as DownloadIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Search as SearchIcon,
  FilterList as FilterIcon,
  Sort as SortIcon,
  Category as CategoryIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  Check as CheckIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl } from 'date-fns/locale';
import { format, addDays, parseISO } from 'date-fns';
import { getTasksByDateRangeOptimized } from '../../services/productionService';
import { getAllInventoryItems } from '../../services/inventory';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { formatCurrency } from '../../utils/formatUtils';
import { formatDateTime } from '../../utils/formatters';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';
import SaveAltIcon from '@mui/icons-material/SaveAlt';
import { toast } from 'react-hot-toast';
import ExcelJS from 'exceljs';
import { createProcurementForecast } from '../../services/procurementForecastService';

const ForecastPage = () => {
  const { t } = useTranslation('production');
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(false);
  const [forecastData, setForecastData] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  
  const [startDate, setStartDate] = useState(new Date());
  const [endDate, setEndDate] = useState(addDays(new Date(), 30));
  const [timeRange, setTimeRange] = useState('30days');
  const [calculatingForecast, setCalculatingForecast] = useState(false);
  
  // State dla animacji
  const [dataLoaded, setDataLoaded] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  
  const [categoryFilter, setCategoryFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState('balance');
  const [sortDirection, setSortDirection] = useState('asc');
  
  // State dla przyszłych dostaw nieużywanych materiałów
  const [unusedMaterialsDeliveries, setUnusedMaterialsDeliveries] = useState({});
  const [loadingUnusedDeliveries, setLoadingUnusedDeliveries] = useState(false);
  
  // State dla zapisu prognozy do CRM
  const [saveToCrmDialogOpen, setSaveToCrmDialogOpen] = useState(false);
  const [saveToCrmName, setSaveToCrmName] = useState('');
  const [saveToCrmNotes, setSaveToCrmNotes] = useState('');
  const [savingToCrm, setSavingToCrm] = useState(false);
  
  // State dla sortowania nieużywanych materiałów
  const [unusedSortField, setUnusedSortField] = useState('name');
  const [unusedSortDirection, setUnusedSortDirection] = useState('asc');
  
  // State do formatowania liczb
  const formatNumber = (num) => {
    if (num === undefined || num === null) return '0';
    return Number(num).toLocaleString('pl-PL', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };
  
  // Pobieranie zadań i materiałów z bazy z optymalizacją
  const fetchData = async () => {
    try {
      setLoading(true);
      setDataLoaded(false);
      setShowResults(false);
      
      // Pobierz zadania produkcyjne z filtrowaniem po stronie serwera i materiały równocześnie
      const [tasksData, items] = await Promise.all([
        getTasksByDateRangeOptimized(startDate, endDate),
        getAllInventoryItems()
      ]);
      
      console.log(`Pobrano ${tasksData.length} zadań produkcyjnych i ${items.length} pozycji magazynowych`);
      
      setTasks(tasksData);
      setInventoryItems(items);
      
      // Animacja ładowania danych
      setDataLoaded(true);
      
      // Oblicz prognozę zapotrzebowania (zadania są już przefiltrowane po stronie serwera)
      await calculateForecast(tasksData, items);
      
      // Opóźnienie dla efektu wizualnego
      setTimeout(() => {
        setShowResults(true);
        // Pokaż komunikat sukcesu
        setShowSuccessMessage(true);
        setTimeout(() => {
          setShowSuccessMessage(false);
        }, 3000); // Ukryj po 3 sekundach
      }, 300);
      
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania danych:', error);
      showError('Nie udało się pobrać danych prognozy');
      setLoading(false);
      setDataLoaded(false);
      setShowResults(false);
    }
  };

  // Nowa funkcja obsługująca wyszukiwanie - użytkownik musi kliknąć aby rozpocząć
  const handleSearch = () => {
    fetchData();
  };
  
  /**
   * Oblicza średnią ważoną cenę jednostkową z oczekujących zamówień zakupu (PO)
   * @param {Array} purchaseOrders - Tablica zamówień zakupu
   * @param {string} materialId - ID materiału
   * @returns {number|null} - Średnia ważona cena lub null jeśli brak danych
   */
  const calculateWeightedPriceFromPO = (purchaseOrders, materialId) => {
    if (!purchaseOrders || purchaseOrders.length === 0) {
      return null;
    }
    
    let totalWeightedPrice = 0;
    let totalQuantity = 0;
    
    for (const po of purchaseOrders) {
      if (po.items && Array.isArray(po.items)) {
        for (const item of po.items) {
          if (item.inventoryItemId === materialId) {
            const quantity = parseFloat(item.quantityRemaining) || 0;
            if (quantity > 0) {
              // Oblicz cenę po rabacie
              const unitPrice = parseFloat(item.unitPrice) || 0;
              const discount = parseFloat(item.discount) || 0;
              const priceAfterDiscount = unitPrice * (1 - discount / 100);
              
              totalWeightedPrice += priceAfterDiscount * quantity;
              totalQuantity += quantity;
            }
          }
        }
      }
    }
    
    // Zwróć średnią ważoną lub null jeśli brak ilości
    return totalQuantity > 0 ? totalWeightedPrice / totalQuantity : null;
  };
  
  // Funkcja do obliczania prognozy zapotrzebowania na podstawie zadań
  const calculateForecast = async (tasksData = tasks, itemsData = inventoryItems) => {
    try {
      setCalculatingForecast(true);
      console.log('Rozpoczynam obliczanie prognozy zapotrzebowania dla okresu', 
        formatDateDisplay(startDate), '-', formatDateDisplay(endDate));
      
      // Zadania są już przefiltrowane po stronie serwera, więc nie filtrujemy ponownie
      console.log(`Otrzymano ${tasksData.length} zadań z serwera (już przefiltrowanych)`);
      
      // Jeśli nie ma zadań w zakresie dat, zakończ
      if (tasksData.length === 0) {
        console.log('Brak zadań w wybranym zakresie dat');
        setForecastData([]);
        setCalculatingForecast(false);
        toast.warning('Brak zadań w wybranym zakresie dat. Wybierz inny zakres.');
        return;
      }
      
      // Optymalizacja: przygotuj mapę materiałów z magazynu dla szybszego dostępu
      const inventoryItemsMap = new Map();
      itemsData.forEach(item => {
        inventoryItemsMap.set(item.id, item);
      });
      
      // Oblicz potrzebne ilości materiałów na podstawie zadań produkcyjnych
      const materialRequirements = {};
      
      // Funkcja korygująca nieprawidłowe ilości - wyciąga wartość na jednostkę produktu
      const correctMaterialQuantity = (material, taskQuantity) => {
        // Sprawdź, czy materiał ma prawidłowo określoną ilość na jednostkę produktu
        if (material.quantityPerUnit && material.quantityPerUnit > 0) {
          return material.quantityPerUnit;
        }
        
        // Sprawdź, czy materiał ma oznaczenie, że jest dla całego zadania
        if (material.isFullTaskQuantity || material.isTotal) {
          return material.quantity / taskQuantity;
        }
        
        // W zadaniach produkcyjnych przechowujemy wartości całkowite dla zadania, więc dzielimy przez ilość
        if (taskQuantity > 0) {
          return material.quantity / taskQuantity;
        }
        
        // Jeśli nic innego nie zadziała, użyj oryginalnej wartości
        return material.quantity;
      };
      
      // Optymalizacja: pierwsza pętla - zbieranie danych o wymaganiach materiałowych
      for (const task of tasksData) {
        // Upewnij się, że zadanie ma materiały
        if (!task.materials || task.materials.length === 0) continue;
        
        const taskQuantity = typeof task.quantity === 'number' ? task.quantity : parseFloat(task.quantity) || 1;
        
        // POPRAWKA: Pobierz rzeczywiste ilości materiałów, jeśli zostały zmienione
        const actualMaterialUsage = task.actualMaterialUsage || {};
        
        for (const material of task.materials) {
          // Upewnij się, że materiał ma ID - akceptujemy zarówno id jak i inventoryItemId
          const materialId = material.id || material.inventoryItemId;
          
          if (!materialId) continue;
          
          // POPRAWKA: Użyj rzeczywistej ilości z actualMaterialUsage, jeśli dostępna
          // W przeciwnym razie użyj planowanej ilości z material.quantity
          let totalRequiredForTask;
          let materialQuantityPerUnit;
          const actualQuantityForMaterial = actualMaterialUsage[material.id] ?? actualMaterialUsage[materialId];
          
          if (actualQuantityForMaterial !== undefined) {
            // Zmieniona ilość - actualMaterialUsage zawiera już pełną ilość dla zadania
            totalRequiredForTask = parseFloat(actualQuantityForMaterial) || 0;
            // Oblicz ilość na jednostkę dla spójności danych
            materialQuantityPerUnit = taskQuantity > 0 ? totalRequiredForTask / taskQuantity : totalRequiredForTask;
          } else {
            // Brak zmiany - użyj oryginalnej logiki z material.quantity
            const materialQuantity = typeof material.quantity === 'number' 
              ? material.quantity 
              : parseFloat(material.quantity) || 0;
              
            if (materialQuantity <= 0) continue;
            
            // Wyciągnij ilość materiału na jednostkę produktu
            materialQuantityPerUnit = correctMaterialQuantity(material, taskQuantity);
            
            // Oblicz całkowitą wymaganą ilość dla zadania
            totalRequiredForTask = materialQuantityPerUnit * taskQuantity;
          }
          
          if (totalRequiredForTask <= 0) continue;
          
          // Pobierz ilość już skonsumowaną dla tego materiału w tym zadaniu
          let consumedQuantity = 0;
          if (task.consumedMaterials && Array.isArray(task.consumedMaterials)) {
            const consumedMaterial = task.consumedMaterials.find(
              cm => (cm.materialId === materialId || cm.inventoryItemId === materialId)
            );
            if (consumedMaterial) {
              consumedQuantity = parseFloat(consumedMaterial.quantity) || 0;
              console.log(`📊 Materiał ${material.name} w zadaniu ${task.moNumber || task.name}: wymagane=${totalRequiredForTask}, skonsumowane=${consumedQuantity}`);
            }
          }
          
          // Oblicz pozostałą potrzebną ilość (wymagana - już skonsumowana)
          // Używamy Math.max aby uniknąć wartości ujemnych
          const requiredQuantity = Math.max(0, totalRequiredForTask - consumedQuantity);
          
          // Dodaj lub zaktualizuj materiał w wymaganiach
          if (!materialRequirements[materialId]) {
            const inventoryItem = inventoryItemsMap.get(materialId);
            
            materialRequirements[materialId] = {
              id: materialId,
              name: inventoryItem?.name || material.name, // Priorytet dla nazwy z magazynu
              category: inventoryItem?.category || material.category || 'Inne', // Priorytet dla kategorii z magazynu
              unit: inventoryItem?.unit || material.unit || 'szt.', // Priorytet dla jednostki z magazynu
              requiredQuantity: 0,
              consumedQuantity: 0, // Dodaj pole do śledzenia całkowitej skonsumowanej ilości
              availableQuantity: inventoryItem ? parseFloat(inventoryItem.quantity) || 0 : 0,
              tasks: [], // Lista zadań, w których materiał jest używany
              perUnitQuantity: materialQuantityPerUnit, // Zapamiętaj ilość na jednostkę
              price: inventoryItem?.price || 0
            };
          }
          
          // Dodaj pozostałą wymaganą ilość (pomijając już skonsumowane)
          materialRequirements[materialId].requiredQuantity += requiredQuantity;
          
          // Śledź całkowitą ilość skonsumowaną we wszystkich zadaniach
          materialRequirements[materialId].consumedQuantity += consumedQuantity;
          
          // Dodaj to zadanie do listy zadań, gdzie materiał jest używany
          if (!materialRequirements[materialId].tasks.includes(task.id)) {
            materialRequirements[materialId].tasks.push(task.id);
          }
        }
      }
      
      // Optymalizacja: podziel pobieranie danych na partie (batch)
      // Pobierz ceny domyślnych dostawców dla materiałów w mniejszych partiach
      const materialIds = Object.keys(materialRequirements);
      const batchSize = 20; // Pobierz ceny dla 20 materiałów na raz
      
      try {
        const { getBestSupplierPricesForItems, getAwaitingOrdersForInventoryItem } = await import('../../services/inventory');
        
        // Obliczanie kosztów na podstawie cen domyślnych dostawców
        for (let i = 0; i < materialIds.length; i += batchSize) {
          const batchIds = materialIds.slice(i, i + batchSize);
          
          // Przygotuj listę materiałów do sprawdzenia w tej partii
          const itemsToCheck = batchIds.map(id => ({
            itemId: id,
            quantity: materialRequirements[id].requiredQuantity
          }));
          
          if (itemsToCheck.length > 0) {
            // Pobierz najlepsze ceny od dostawców, priorytetyzując domyślnych dostawców
            const bestPrices = await getBestSupplierPricesForItems(itemsToCheck, { includeSupplierNames: true });
            
            // Aktualizuj ceny i koszty w materialRequirements na podstawie domyślnych dostawców
            for (const materialId of batchIds) {
              if (bestPrices[materialId]) {
                const bestPrice = bestPrices[materialId];
                
                // Jeśli mamy cenę od domyślnego dostawcy, użyj jej
                if (bestPrice.isDefault || bestPrice.price) {
                  materialRequirements[materialId].price = bestPrice.price;
                  materialRequirements[materialId].supplier = bestPrice.supplierName || 'Nieznany dostawca';
                  materialRequirements[materialId].supplierId = bestPrice.supplierId;
                  materialRequirements[materialId].isDefaultSupplier = bestPrice.isDefault;
                  materialRequirements[materialId].priceSource = 'supplier'; // Oznacz źródło ceny
                }
              }
              
              // Jeśli nie ma źródła ceny, oznacz jako magazynową
              if (!materialRequirements[materialId].priceSource) {
                materialRequirements[materialId].priceSource = 'inventory';
              }
              
              // Zawsze obliczaj koszt - albo na podstawie ceny dostawcy, albo magazynowej
              materialRequirements[materialId].cost = materialRequirements[materialId].price * 
                materialRequirements[materialId].requiredQuantity;
            }
          }
        }
        
        // Pobierz informacje o zamówieniach komponentów (PO) dla materiałów w partiach
        const promises = materialIds.map(async (materialId) => {
          try {
            const purchaseOrders = await getAwaitingOrdersForInventoryItem(materialId);
            
            // 💰 NOWE: Oblicz średnią ważoną cenę z PO
            const weightedPriceFromPO = calculateWeightedPriceFromPO(purchaseOrders, materialId);
            
            // Jeśli mamy cenę z PO, użyj jej (ma najwyższy priorytet)
            if (weightedPriceFromPO !== null && weightedPriceFromPO > 0) {
              materialRequirements[materialId].price = weightedPriceFromPO;
              materialRequirements[materialId].priceSource = 'PO'; // Oznacz źródło ceny
              materialRequirements[materialId].cost = materialRequirements[materialId].price * 
                materialRequirements[materialId].requiredQuantity;
              
              console.log(`💰 Materiał ${materialId}: użyto ceny z PO = ${weightedPriceFromPO.toFixed(4)}`);
            }
            
            // Dodaj informacje o przyszłych dostawach do prognozy
            if (purchaseOrders && purchaseOrders.length > 0) {
              // Inicjalizuj tablicę przyszłych dostaw, jeśli nie istnieje
              if (!materialRequirements[materialId].futureDeliveries) {
                materialRequirements[materialId].futureDeliveries = [];
              }
              
              // Dodaj informacje o wszystkich przyszłych dostawach
              for (const po of purchaseOrders) {
                for (const item of po.items) {
                  // ⚠️ WAŻNE: Najpierw bierz datę z pozycji PO, jeśli nie ma to z całego PO
                  const deliveryDate = item.expectedDeliveryDate || po.expectedDeliveryDate;
                  
                  // 🔥 FILTROWANIE: Uwzględniaj tylko dostawy w zakresie prognozy (do endDate)
                  if (deliveryDate) {
                    const deliveryDateObj = new Date(deliveryDate);
                    const endDateObj = new Date(endDate);
                    
                    // Pomijaj dostawy planowane po zakończeniu okresu prognozy
                    if (deliveryDateObj > endDateObj) {
                      console.log(`⏭️ Pomijam PO ${po.number} dla materiału ${materialId} - dostawa planowana na ${formatDateDisplay(deliveryDateObj)} (poza zakresem do ${formatDateDisplay(endDateObj)})`);
                      continue; // Pomijaj tę pozycję
                    }
                  }
                  
                  materialRequirements[materialId].futureDeliveries.push({
                    poNumber: po.number || 'Brak numeru',
                    poId: po.id,
                    status: po.status,
                    quantity: item.quantityRemaining,
                    expectedDeliveryDate: deliveryDate,
                    supplierName: po.supplierName || 'Brak dostawcy',
                    supplierId: po.supplierId
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
        });
        
        // Poczekaj na zakończenie wszystkich zapytań o zamówienia
        await Promise.allSettled(promises);
        
      } catch (error) {
        console.error('Błąd podczas pobierania cen lub zamówień:', error);
        // W przypadku błędu kontynuujemy z podstawowymi danymi
      }
      
      // Przekształć obiekt do tablicy i przygotuj końcowe dane
      const forecastResult = Object.values(materialRequirements).map(item => {
        const balance = item.availableQuantity - item.requiredQuantity;
        
        return {
          ...item,
          requiredQuantity: parseFloat(item.requiredQuantity.toFixed(2)) || 0,
          availableQuantity: parseFloat(item.availableQuantity.toFixed(2)) || 0,
          balance: parseFloat(balance.toFixed(2)),
          futureDeliveriesTotal: parseFloat(item.futureDeliveriesTotal?.toFixed(2)) || 0,
          balanceWithFutureDeliveries: parseFloat(item.balanceWithFutureDeliveries?.toFixed(2)) || 0,
          cost: parseFloat((item.price * item.requiredQuantity).toFixed(2)) || 0
        };
      });
      
      // Posortuj według niedoboru (od największego) - uwzględniając przyszłe dostawy
      forecastResult.sort((a, b) => a.balanceWithFutureDeliveries - b.balanceWithFutureDeliveries);
      
      console.log(`Obliczono prognozę dla ${forecastResult.length} materiałów`);
      
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
  
  // Generowanie raportu Excel z formatowaniem
  const handleGenerateReport = async () => {
    try {
      // Użyj przefiltrowanych i posortowanych danych z listy
      const dataToExport = filteredData();
      
      if (dataToExport.length === 0) {
        showError('Brak danych do wygenerowania raportu');
        return;
      }
      
      // Utwórz nowy workbook
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'BGW MRP System';
      workbook.created = new Date();
      
      // ==================== ARKUSZ 1: MATERIAL FORECAST ====================
      const forecastSheet = workbook.addWorksheet('Material Forecast', {
        views: [{ state: 'frozen', xSplit: 0, ySplit: 7 }] // Zamroź nagłówki
      });
      
      // Kolory (dark theme jak w aplikacji)
      const colors = {
        headerBg: '1E293B',        // Ciemny niebieski nagłówek
        headerText: 'FFFFFF',      // Biały tekst nagłówka
        errorBg: 'FEE2E2',         // Jasny czerwony (shortage)
        errorText: 'DC2626',       // Czerwony tekst
        warningBg: 'FEF3C7',       // Jasny żółty (warning)
        warningText: 'D97706',     // Pomarańczowy tekst
        successBg: 'D1FAE5',       // Jasny zielony (sufficient)
        successText: '059669',     // Zielony tekst
        infoBg: 'DBEAFE',          // Jasny niebieski (info)
        infoText: '2563EB',        // Niebieski tekst
        borderColor: 'E5E7EB',     // Szary border
        titleBg: '0F172A',         // Bardzo ciemny bg dla tytułu
        subtitleBg: '334155'       // Ciemny szary dla podtytułów
      };
      
      // Oblicz statystyki
      const totalCost = dataToExport.reduce((sum, item) => sum + (item.cost || 0), 0);
      const shortageValue = dataToExport
        .filter(item => item.balance < 0)
        .reduce((sum, item) => sum + (Math.abs(item.balance) * (item.price || 0)), 0);
      const shortageValueAfterDeliveries = dataToExport
        .filter(item => item.balanceWithFutureDeliveries < 0)
        .reduce((sum, item) => sum + (Math.abs(item.balanceWithFutureDeliveries) * (item.price || 0)), 0);
      const materialsWithShortage = dataToExport.filter(item => item.balance < 0).length;
      const materialsWithShortageAfterDeliveries = dataToExport.filter(item => item.balanceWithFutureDeliveries < 0).length;
      
      // Szerokości kolumn
      forecastSheet.columns = [
        { header: '', key: 'material', width: 40 },
        { header: '', key: 'available', width: 18 },
        { header: '', key: 'required', width: 18 },
        { header: '', key: 'balance', width: 18 },
        { header: '', key: 'deliveries', width: 18 },
        { header: '', key: 'eta', width: 16 },
        { header: '', key: 'balanceWithDeliveries', width: 22 },
        { header: '', key: 'price', width: 14 },
        { header: '', key: 'cost', width: 16 },
        { header: '', key: 'status', width: 24 }
      ];
      
      // TYTUŁ RAPORTU (wiersz 1)
      forecastSheet.mergeCells('A1:J1');
      const titleRow = forecastSheet.getRow(1);
      titleRow.getCell(1).value = 'MATERIAL DEMAND FORECAST REPORT';
      titleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFF' } };
      titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.titleBg } };
      titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      titleRow.height = 30;
      
      // INFO (wiersz 2)
      forecastSheet.mergeCells('A2:J2');
      const infoRow = forecastSheet.getRow(2);
      infoRow.getCell(1).value = `Period: ${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}  |  Generated: ${formatDateDisplay(new Date())} at ${format(new Date(), 'HH:mm')}`;
      infoRow.getCell(1).font = { size: 10, color: { argb: 'FFFFFF' } };
      infoRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.subtitleBg } };
      infoRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      infoRow.height = 22;
      
      // STATYSTYKI (wiersze 3-5)
      forecastSheet.mergeCells('A3:E3');
      forecastSheet.mergeCells('F3:J3');
      const statsRow1 = forecastSheet.getRow(3);
      statsRow1.getCell(1).value = `📊 Total materials: ${dataToExport.length}  |  ⚠️ Requiring purchase: ${materialsWithShortage}  |  ❌ Shortage after deliveries: ${materialsWithShortageAfterDeliveries}`;
      statsRow1.getCell(1).font = { size: 10, bold: true };
      statsRow1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.infoBg } };
      statsRow1.getCell(6).value = `💰 Shortage value: ${shortageValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} €  |  After deliveries: ${shortageValueAfterDeliveries.toLocaleString('en-US', { minimumFractionDigits: 2 })} €`;
      statsRow1.getCell(6).font = { size: 10, bold: true };
      statsRow1.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.infoBg } };
      statsRow1.height = 24;
      
      // Pusty wiersz 4
      forecastSheet.getRow(4).height = 8;
      
      // LEGENDA (wiersz 5)
      forecastSheet.mergeCells('A5:J5');
      const legendRow = forecastSheet.getRow(5);
      legendRow.getCell(1).value = '🔴 Shortage  |  🟡 Replenished by deliveries  |  🟢 Sufficient';
      legendRow.getCell(1).font = { size: 9, italic: true };
      legendRow.getCell(1).alignment = { horizontal: 'center' };
      legendRow.height = 20;
      
      // Pusty wiersz 6
      forecastSheet.getRow(6).height = 6;
      
      // NAGŁÓWKI TABELI (wiersz 7)
      const headers = ['MATERIAL', 'AVAILABLE QTY', 'REQUIRED', 'BALANCE', 'PENDING DELIVERIES', 'ETA', 'BALANCE W/ DELIVERIES', 'PRICE', 'ESTIMATED COST', 'STATUS'];
      const headerRow = forecastSheet.getRow(7);
      headers.forEach((header, index) => {
        const cell = headerRow.getCell(index + 1);
        cell.value = header;
        cell.font = { bold: true, size: 10, color: { argb: colors.headerText } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.headerBg } };
        cell.alignment = { horizontal: index === 0 ? 'left' : 'center', vertical: 'middle' };
        cell.border = {
          bottom: { style: 'medium', color: { argb: colors.borderColor } }
        };
      });
      headerRow.height = 26;
      
      // DANE MATERIAŁÓW (od wiersza 8)
      dataToExport.forEach((item, index) => {
        const rowNum = 8 + index;
        const row = forecastSheet.getRow(rowNum);
        
        const balance = item.balance || 0;
        const balanceWithDeliveries = item.balanceWithFutureDeliveries || 0;
        const unit = item.unit || 'pcs';
        
        // Przygotuj ETA
        const eta = item.futureDeliveries && item.futureDeliveries.length > 0 && item.futureDeliveries[0].expectedDeliveryDate
          ? formatDateDisplay(new Date(item.futureDeliveries[0].expectedDeliveryDate))
          : '—';
        const deliveriesCount = item.futureDeliveries?.length || 0;
        const etaWithMore = deliveriesCount > 1 ? `${eta} (+${deliveriesCount - 1})` : eta;
        
        // Określ status i kolory
        let statusText, statusColor, rowBgColor;
        if (balanceWithDeliveries < 0) {
          statusText = '❌ Shortage';
          statusColor = colors.errorText;
          rowBgColor = colors.errorBg;
        } else if (balance < 0 && balanceWithDeliveries >= 0) {
          statusText = '⏱️ Replenished';
          statusColor = colors.warningText;
          rowBgColor = colors.warningBg;
        } else {
          statusText = '✅ Sufficient';
          statusColor = colors.successText;
          rowBgColor = null; // Bez tła
        }
        
        // Wartości komórek
        const values = [
          `${item.name || ''}\n${item.category || 'Other'}`,
          `${(item.availableQuantity || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`,
          `${(item.requiredQuantity || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`,
          `${balance.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`,
          `${(item.futureDeliveriesTotal || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`,
          etaWithMore,
          `${balanceWithDeliveries.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`,
          item.price ? `${item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €` : '—',
          item.cost ? `${item.cost.toLocaleString('en-US', { minimumFractionDigits: 2 })} €` : '—',
          statusText
        ];
        
        values.forEach((value, colIndex) => {
          const cell = row.getCell(colIndex + 1);
          cell.value = value;
          cell.alignment = { 
            horizontal: colIndex === 0 ? 'left' : 'center', 
            vertical: 'middle',
            wrapText: colIndex === 0 
          };
          
          // Kolorowanie tła dla wierszy z problemami
          if (rowBgColor) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBgColor } };
          }
          
          // Specjalne formatowanie dla niektórych kolumn
          if (colIndex === 3 && balance < 0) { // Balance
            cell.font = { bold: true, color: { argb: colors.errorText } };
          }
          if (colIndex === 6 && balanceWithDeliveries < 0) { // Balance w/ deliveries
            cell.font = { bold: true, color: { argb: colors.errorText } };
          }
          if (colIndex === 9) { // Status
            cell.font = { bold: true, color: { argb: statusColor } };
          }
          
          // Obramowania
          cell.border = {
            bottom: { style: 'thin', color: { argb: colors.borderColor } }
          };
        });
        
        row.height = 32;
      });
      
      // ==================== ARKUSZ 2: UNUSED MATERIALS ====================
      const unusedMaterialsData = filteredUnusedMaterials();
      
      if (unusedMaterialsData.length > 0) {
        const unusedSheet = workbook.addWorksheet('Unused Materials', {
          views: [{ state: 'frozen', xSplit: 0, ySplit: 4 }]
        });
        
        unusedSheet.columns = [
          { header: '', key: 'material', width: 40 },
          { header: '', key: 'available', width: 20 },
          { header: '', key: 'deliveries', width: 20 },
          { header: '', key: 'eta', width: 18 },
          { header: '', key: 'total', width: 22 }
        ];
        
        // Tytuł
        unusedSheet.mergeCells('A1:E1');
        const unusedTitleRow = unusedSheet.getRow(1);
        unusedTitleRow.getCell(1).value = 'UNUSED MATERIALS (NOT IN ANY MANUFACTURING ORDER)';
        unusedTitleRow.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFF' } };
        unusedTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.titleBg } };
        unusedTitleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
        unusedTitleRow.height = 28;
        
        // Info
        unusedSheet.mergeCells('A2:E2');
        const unusedInfoRow = unusedSheet.getRow(2);
        unusedInfoRow.getCell(1).value = `Total: ${unusedMaterialsData.length} materials  |  Excluded: "Inne", "Gotowe produkty" categories and materials with quantity 0`;
        unusedInfoRow.getCell(1).font = { size: 10, color: { argb: 'FFFFFF' } };
        unusedInfoRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.subtitleBg } };
        unusedInfoRow.getCell(1).alignment = { horizontal: 'center' };
        unusedInfoRow.height = 22;
        
        // Pusty wiersz
        unusedSheet.getRow(3).height = 6;
        
        // Nagłówki
        const unusedHeaders = ['MATERIAL', 'AVAILABLE QTY', 'PENDING DELIVERIES', 'ETA', 'TOTAL AVAILABLE'];
        const unusedHeaderRow = unusedSheet.getRow(4);
        unusedHeaders.forEach((header, index) => {
          const cell = unusedHeaderRow.getCell(index + 1);
          cell.value = header;
          cell.font = { bold: true, size: 10, color: { argb: colors.headerText } };
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.headerBg } };
          cell.alignment = { horizontal: index === 0 ? 'left' : 'center', vertical: 'middle' };
        });
        unusedHeaderRow.height = 24;
        
        // Dane
        unusedMaterialsData.forEach((item, index) => {
          const rowNum = 5 + index;
          const row = unusedSheet.getRow(rowNum);
          
          const deliveryData = unusedMaterialsDeliveries[item.id];
          const availableQty = parseFloat(item.quantity) || 0;
          const pendingDeliveries = deliveryData?.total || 0;
          const unit = item.unit || 'pcs';
          const eta = deliveryData?.deliveries?.[0]?.expectedDeliveryDate 
            ? formatDateDisplay(new Date(deliveryData.deliveries[0].expectedDeliveryDate))
            : '—';
          const deliveriesCount = deliveryData?.deliveries?.length || 0;
          const etaWithMore = deliveriesCount > 1 ? `${eta} (+${deliveriesCount - 1})` : eta;
          const totalAvailable = availableQty + pendingDeliveries;
          
          const values = [
            `${item.name || ''}\n${item.category || 'Other'}`,
            `${availableQty.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`,
            `${pendingDeliveries.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`,
            etaWithMore,
            `${totalAvailable.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`
          ];
          
          values.forEach((value, colIndex) => {
            const cell = row.getCell(colIndex + 1);
            cell.value = value;
            cell.alignment = { 
              horizontal: colIndex === 0 ? 'left' : 'center', 
              vertical: 'middle',
              wrapText: colIndex === 0
            };
            cell.border = {
              bottom: { style: 'thin', color: { argb: colors.borderColor } }
            };
            
            // Podświetl jeśli są dostawy w drodze
            if (pendingDeliveries > 0 && colIndex === 2) {
              cell.font = { color: { argb: colors.infoText }, bold: true };
            }
          });
          
          row.height = 30;
        });
      }
      
      // ==================== ARKUSZ 3: SUMMARY ====================
      const summarySheet = workbook.addWorksheet('Summary');
      
      summarySheet.columns = [
        { header: '', key: 'label', width: 40 },
        { header: '', key: 'value', width: 30 }
      ];
      
      // Tytuł
      summarySheet.mergeCells('A1:B1');
      const summaryTitleRow = summarySheet.getRow(1);
      summaryTitleRow.getCell(1).value = 'FORECAST SUMMARY';
      summaryTitleRow.getCell(1).font = { bold: true, size: 16, color: { argb: 'FFFFFF' } };
      summaryTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.titleBg } };
      summaryTitleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
      summaryTitleRow.height = 30;
      
      // Dane podsumowania
      const summaryData = [
        ['', ''],
        ['📅 REPORT DETAILS', ''],
        ['Forecast Period', `${formatDateDisplay(startDate)} - ${formatDateDisplay(endDate)}`],
        ['Generated On', `${formatDateDisplay(new Date())} at ${format(new Date(), 'HH:mm')}`],
        ['', ''],
        ['📊 MATERIALS STATISTICS', ''],
        ['Total Materials in Forecast', dataToExport.length],
        ['Materials Requiring Purchase', materialsWithShortage],
        ['Materials with Shortage After Deliveries', materialsWithShortageAfterDeliveries],
        ['Materials with Sufficient Stock', dataToExport.length - materialsWithShortage],
        ['', ''],
        ['💰 FINANCIAL SUMMARY', ''],
        ['Total Shortage Value', `${shortageValue.toLocaleString('en-US', { minimumFractionDigits: 2 })} €`],
        ['Shortage After Deliveries', `${shortageValueAfterDeliveries.toLocaleString('en-US', { minimumFractionDigits: 2 })} €`],
        ['Total Estimated Cost', `${totalCost.toLocaleString('en-US', { minimumFractionDigits: 2 })} €`],
        ['', ''],
        ['📦 UNUSED MATERIALS', ''],
        ['Total Unused Materials', unusedMaterialsData.length]
      ];
      
      summaryData.forEach((rowData, index) => {
        const rowNum = 2 + index;
        const row = summarySheet.getRow(rowNum);
        
        row.getCell(1).value = rowData[0];
        row.getCell(2).value = rowData[1];
        
        // Formatowanie sekcji
        if (rowData[0].includes('📅') || rowData[0].includes('📊') || rowData[0].includes('💰') || rowData[0].includes('📦')) {
          row.getCell(1).font = { bold: true, size: 12, color: { argb: colors.infoText } };
          row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.infoBg } };
          row.getCell(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: colors.infoBg } };
          row.height = 24;
        } else if (rowData[0]) {
          row.getCell(1).font = { size: 11 };
          row.getCell(2).font = { size: 11, bold: true };
          row.getCell(2).alignment = { horizontal: 'right' };
        }
      });
      
      // Generuj plik Excel i pobierz
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      const fileName = `material_demand_forecast_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`;
      
      link.setAttribute('href', url);
      link.setAttribute('download', fileName);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showSuccess('Excel report generated and downloaded successfully');
    } catch (error) {
      console.error('Błąd podczas generowania raportu Excel:', error);
      showError('Failed to generate Excel report: ' + error.message);
    }
  };
  
  // Zapis prognozy do CRM
  const handleOpenSaveToCrm = () => {
    setSaveToCrmName('');
    setSaveToCrmNotes('');
    setSaveToCrmDialogOpen(true);
  };
  
  const handleSaveToCrm = async () => {
    try {
      setSavingToCrm(true);
      
      await createProcurementForecast(
        forecastData,
        { startDate, endDate },
        currentUser?.uid,
        currentUser?.displayName || currentUser?.email || '',
        saveToCrmName,
        saveToCrmNotes
      );
      
      showSuccess('Prognoza została zapisana do CRM');
      setSaveToCrmDialogOpen(false);
    } catch (error) {
      console.error('Błąd podczas zapisu prognozy do CRM:', error);
      showError('Nie udało się zapisać prognozy: ' + error.message);
    } finally {
      setSavingToCrm(false);
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
      
      // Jeśli data jest stringiem i jest pusty lub składa się tylko z białych znaków
      if (typeof date === 'string' && !date.trim()) {
        return '';
      }
      
      // Sprawdź czy data nie jest obiektem z nullem lub undefined
      if (date === null || date === undefined) {
        return '';
      }
      
      // Upewnij się, że data jest obiektem Date
      const dateObj = date instanceof Date ? date : new Date(date);
      
      // Sprawdź, czy data jest prawidłowa
      if (isNaN(dateObj.getTime())) {
        // Nie loguj warning-u dla pustych lub nieprawidłowych dat
        return '';
      }
      
      return format(dateObj, 'dd.MM.yyyy', { locale: pl });
    } catch (error) {
      // Tylko loguj błędy rzeczywiste, nie warning-i
      return '';
    }
  };
  
  // Pobieranie unikalnych kategorii z danych
  const getUniqueCategories = useCallback(() => {
    if (!forecastData || forecastData.length === 0) return [];
    
    const categories = new Set();
    forecastData.forEach(item => {
      if (item.category) {
        categories.add(item.category);
      }
    });
    
    return Array.from(categories).sort();
  }, [forecastData]);
  
  // Funkcja pomocnicza do określenia priorytetu statusu do sortowania
  const getStatusPriority = (item) => {
    const balanceWithDeliveries = item.balanceWithFutureDeliveries;
    const balance = item.balance;
    
    if (balanceWithDeliveries < 0) {
      return 0; // Niedobór - najwyższy priorytet
    } else if (balance < 0 && balanceWithDeliveries >= 0) {
      return 1; // Uzupełniany dostawami - średni priorytet  
    } else {
      return 2; // Wystarczająca ilość - najniższy priorytet
    }
  };
  
  // Funkcja do pobrania materiałów nie używanych w żadnym MO
  const getUnusedMaterials = useCallback(() => {
    if (!inventoryItems || inventoryItems.length === 0) return [];
    if (!forecastData || forecastData.length === 0) return inventoryItems;
    
    // Stwórz Set z ID materiałów używanych w MO
    const usedMaterialIds = new Set(forecastData.map(item => item.id));
    
    // Filtruj materiały, które nie są używane
    // Wykluczamy kategorie "inne" i "gotowe produkty" oraz materiały ze stanem 0
    return inventoryItems.filter(item => {
      // Sprawdź czy materiał nie jest używany w MO
      if (usedMaterialIds.has(item.id)) return false;
      
      // Wykluczamy kategorię "inne" i "gotowe produkty" (case insensitive)
      const category = (item.category || '').toLowerCase();
      if (category === 'inne' || category === 'gotowe produkty') return false;
      
      // Wykluczamy materiały ze stanem 0
      const quantity = parseFloat(item.quantity) || 0;
      if (quantity === 0) return false;
      
      return true;
    });
  }, [inventoryItems, forecastData]);
  
  // Funkcja filtrująca nieużywane materiały (dla wyszukiwania i kategorii)
  const filteredUnusedMaterials = useCallback(() => {
    let filtered = getUnusedMaterials();
    
    // Filtrowanie po kategorii
    if (categoryFilter) {
      filtered = filtered.filter(item => item.category === categoryFilter);
    }
    
    // Filtrowanie po wyszukiwaniu
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(searchLower) || 
        (item.category && item.category.toLowerCase().includes(searchLower))
      );
    }
    
    // Sortowanie
    filtered.sort((a, b) => {
      let comparison = 0;
      
      // Pobierz dane o dostawach dla obu elementów
      const deliveryA = unusedMaterialsDeliveries[a.id];
      const deliveryB = unusedMaterialsDeliveries[b.id];
      const quantityA = parseFloat(a.quantity) || 0;
      const quantityB = parseFloat(b.quantity) || 0;
      const deliveriesTotalA = deliveryA?.total || 0;
      const deliveriesTotalB = deliveryB?.total || 0;
      
      switch (unusedSortField) {
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;
        case 'category':
          comparison = (a.category || '').localeCompare(b.category || '');
          break;
        case 'availableQuantity':
          comparison = quantityA - quantityB;
          break;
        case 'futureDeliveries':
          comparison = deliveriesTotalA - deliveriesTotalB;
          break;
        case 'eta':
          // Sortuj po dacie ETA - materiały bez daty na końcu
          const etaA = deliveryA?.deliveries?.[0]?.expectedDeliveryDate;
          const etaB = deliveryB?.deliveries?.[0]?.expectedDeliveryDate;
          if (!etaA && !etaB) comparison = 0;
          else if (!etaA) comparison = 1;
          else if (!etaB) comparison = -1;
          else comparison = new Date(etaA) - new Date(etaB);
          break;
        case 'availableWithDeliveries':
          comparison = (quantityA + deliveriesTotalA) - (quantityB + deliveriesTotalB);
          break;
        default:
          comparison = (a.name || '').localeCompare(b.name || '');
      }
      
      return unusedSortDirection === 'asc' ? comparison : -comparison;
    });
    
    return filtered;
  }, [getUnusedMaterials, categoryFilter, searchTerm, unusedSortField, unusedSortDirection, unusedMaterialsDeliveries]);
  
  // Obsługa zmiany sortowania dla nieużywanych materiałów
  const handleUnusedSortChange = (field) => {
    if (field === unusedSortField) {
      setUnusedSortDirection(unusedSortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setUnusedSortField(field);
      setUnusedSortDirection('asc');
    }
  };
  
  // Renderowanie ikony sortowania dla nieużywanych materiałów
  const renderUnusedSortIcon = (field) => {
    if (field !== unusedSortField) return null;
    return unusedSortDirection === 'asc' ? '▲' : '▼';
  };
  
  // Funkcja pobierająca przyszłe dostawy dla nieużywanych materiałów
  const fetchDeliveriesForUnusedMaterials = useCallback(async (unusedMaterials) => {
    if (!unusedMaterials || unusedMaterials.length === 0) {
      setUnusedMaterialsDeliveries({});
      return;
    }

    setLoadingUnusedDeliveries(true);
    
    try {
      const { getAwaitingOrdersForInventoryItem } = await import('../../services/inventory');
      
      const deliveriesMap = {};
      
      // Pobierz PO dla każdego nieużywanego materiału
      const promises = unusedMaterials.map(async (material) => {
        try {
          const purchaseOrders = await getAwaitingOrdersForInventoryItem(material.id);
          
          if (purchaseOrders && purchaseOrders.length > 0) {
            const deliveries = [];
            let totalDeliveryQuantity = 0;
            
            for (const po of purchaseOrders) {
              for (const item of po.items) {
                if (item.inventoryItemId === material.id) {
                  const quantity = parseFloat(item.quantityRemaining) || 0;
                  
                  // Filtrowanie: tylko dostawy w zakresie do endDate
                  const deliveryDate = item.expectedDeliveryDate || po.expectedDeliveryDate;
                  if (deliveryDate && endDate) {
                    const deliveryDateObj = new Date(deliveryDate);
                    const endDateObj = new Date(endDate);
                    if (deliveryDateObj > endDateObj) {
                      continue; // Pomijaj dostawy poza zakresem
                    }
                  }
                  
                  if (quantity > 0) {
                    totalDeliveryQuantity += quantity;
                    deliveries.push({
                      poNumber: po.number || 'Brak numeru',
                      poId: po.id,
                      status: po.status,
                      quantity: quantity,
                      expectedDeliveryDate: deliveryDate,
                      supplier: item.supplierName || po.supplierName || ''
                    });
                  }
                }
              }
            }
            
            if (deliveries.length > 0) {
              // Sortuj dostawy według daty
              deliveries.sort((a, b) => {
                if (!a.expectedDeliveryDate) return 1;
                if (!b.expectedDeliveryDate) return -1;
                return new Date(a.expectedDeliveryDate) - new Date(b.expectedDeliveryDate);
              });
              
              deliveriesMap[material.id] = {
                deliveries: deliveries,
                total: totalDeliveryQuantity
              };
            }
          }
        } catch (error) {
          console.error(`Błąd pobierania PO dla materiału ${material.id}:`, error);
        }
      });
      
      await Promise.all(promises);
      
      setUnusedMaterialsDeliveries(deliveriesMap);
      console.log(`Pobrano dostawy dla ${Object.keys(deliveriesMap).length} nieużywanych materiałów`);
    } catch (error) {
      console.error('Błąd podczas pobierania dostaw dla nieużywanych materiałów:', error);
    } finally {
      setLoadingUnusedDeliveries(false);
    }
  }, [endDate]);

  // useEffect do pobierania dostaw dla nieużywanych materiałów po załadowaniu danych
  useEffect(() => {
    if (forecastData && forecastData.length > 0 && inventoryItems && inventoryItems.length > 0) {
      const unusedMats = getUnusedMaterials();
      if (unusedMats.length > 0) {
        fetchDeliveriesForUnusedMaterials(unusedMats);
      }
    }
  }, [forecastData, inventoryItems, getUnusedMaterials, fetchDeliveriesForUnusedMaterials]);
  
  // Filtrowanie danych
  const filteredData = useCallback(() => {
    if (!forecastData) return [];
    
    let filtered = [...forecastData];
    
    // Filtrowanie po kategorii
    if (categoryFilter) {
      filtered = filtered.filter(item => item.category === categoryFilter);
    }
    
    // Filtrowanie po wyszukiwaniu
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(searchLower) || 
        (item.category && item.category.toLowerCase().includes(searchLower))
      );
    }
    
    // Sortowanie
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (sortField) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'category':
          comparison = (a.category || '').localeCompare(b.category || '');
          break;
        case 'availableQuantity':
          comparison = a.availableQuantity - b.availableQuantity;
          break;
        case 'requiredQuantity':
          comparison = a.requiredQuantity - b.requiredQuantity;
          break;
        case 'consumedQuantity':
          comparison = (a.consumedQuantity || 0) - (b.consumedQuantity || 0);
          break;
        case 'balance':
          comparison = a.balance - b.balance;
          break;
        case 'balanceWithDeliveries':
          comparison = a.balanceWithFutureDeliveries - b.balanceWithFutureDeliveries;
          break;
        case 'cost':
          comparison = a.cost - b.cost;
          break;
        case 'price':
          comparison = a.price - b.price;
          break;
        case 'status':
          comparison = getStatusPriority(a) - getStatusPriority(b);
          break;
        default:
          comparison = a.balance - b.balance;
      }
      
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    
    return filtered;
  }, [forecastData, categoryFilter, searchTerm, sortField, sortDirection]);
  
  // Obsługa zmiany sortowania
  const handleSortChange = (field) => {
    if (field === sortField) {
      // Zmień kierunek sortowania, jeśli kliknięto ponownie na to samo pole
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Ustaw nowe pole sortowania i domyślny kierunek sortowania
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  // Renderowanie ikony sortowania
  const renderSortIcon = (field) => {
    if (field !== sortField) return null;
    
    return sortDirection === 'asc' ? '▲' : '▼';
  };
  
  // Renderowanie statusu dostępności materiału
  const renderAvailabilityStatus = (item) => {
    const balance = item.balance;
    
    if (balance >= 0) {
      return (
        <Chip 
          label={t('forecast.statusLabels.sufficient')} 
          color="success" 
          size="small" 
        />
      );
    } else if (balance > -item.requiredQuantity * 0.2) {
      return (
        <Chip 
          label={t('forecast.statusLabels.almostSufficient')} 
          color="warning" 
          size="small" 
        />
      );
    } else {
      return (
        <Chip 
          label={t('forecast.statusLabels.insufficient')} 
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
      <Box sx={{ ...mb3, ...flexBetween, flexDirection: { xs: 'column', md: 'row' } }}>
        <Typography variant="h5" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', mb: { xs: 2, md: 0 } }}>
          <FilterIcon sx={mr1} color="primary" />
          {t('forecast.title')}
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, width: { xs: '100%', md: 'auto' }, gap: 1 }}>
          <Button 
            variant="contained"
            startIcon={<RefreshIcon />}
            onClick={handleRefresh}
            sx={{ width: { xs: '100%', sm: 'auto' }, mr: { xs: 0, sm: 1 } }}
            disabled={loading || calculatingForecast}
            color="primary"
          >
            {t('forecast.refresh')}
          </Button>
          <Tooltip title={t('forecast.tooltips.excelReport')}>
            <Button 
              variant="contained"
              startIcon={<DownloadIcon />}
              onClick={handleGenerateReport}
              disabled={forecastData.length === 0 || loading || calculatingForecast}
              color="secondary"
              sx={{ display: 'flex', alignItems: 'center', width: { xs: '100%', sm: 'auto' } }}
            >
              Export Excel
              <Badge 
                color="info" 
                variant="dot" 
                sx={{ ml: 1 }}
              />
            </Button>
          </Tooltip>
          <Tooltip title="Zapisz snapshot prognozy do zakładki Prognozy zakupowe">
            <Button 
              variant="contained"
              startIcon={<SaveAltIcon />}
              onClick={handleOpenSaveToCrm}
              disabled={forecastData.length === 0 || loading || calculatingForecast}
              color="success"
              sx={{ width: { xs: '100%', sm: 'auto' } }}
            >
              Zapisz do CRM
            </Button>
          </Tooltip>
        </Box>
      </Box>
      
      <Paper sx={{ p: 3, mb: 3, borderRadius: 2, boxShadow: 3 }}>
        <Grid container spacing={3} alignItems="center">
          <Grid item xs={12} md={4}>
            <FormControl fullWidth variant="outlined" sx={mb1}>
              <InputLabel>{t('forecast.timeRange')}</InputLabel>
              <Select
                value={timeRange}
                onChange={handleTimeRangeChange}
                label={t('forecast.timeRange')}
                disabled={loading || calculatingForecast}
                startAdornment={
                  <InputAdornment position="start">
                    <CategoryIcon color="primary" />
                  </InputAdornment>
                }
              >
                <MenuItem value="7days">{t('forecast.timeRanges.7days')}</MenuItem>
                <MenuItem value="14days">{t('forecast.timeRanges.14days')}</MenuItem>
                <MenuItem value="30days">{t('forecast.timeRanges.30days')}</MenuItem>
                <MenuItem value="60days">{t('forecast.timeRanges.60days')}</MenuItem>
                <MenuItem value="90days">{t('forecast.timeRanges.90days')}</MenuItem>
                <MenuItem value="custom">{t('forecast.timeRanges.custom')}</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label={t('forecast.startDate')}
                value={startDate}
                onChange={(newDate) => {
                  if (newDate && !isNaN(new Date(newDate).getTime())) {
                    setStartDate(newDate);
                    setTimeRange('custom');
                  }
                }}
                disabled={loading || calculatingForecast}
                format="dd.MM.yyyy"
                slotProps={{ 
                  textField: { 
                    fullWidth: true,
                    variant: "outlined",
                    margin: "normal",
                    error: false,
                    InputProps: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <CategoryIcon color="primary" />
                        </InputAdornment>
                      ),
                    }
                  },
                  field: {
                    clearable: true
                  }
                }}
              />
            </LocalizationProvider>
          </Grid>
          
          <Grid item xs={12} md={4}>
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <DatePicker
                label={t('forecast.endDate')}
                value={endDate}
                minDate={startDate}
                onChange={(newDate) => {
                  if (newDate && !isNaN(new Date(newDate).getTime())) {
                    setEndDate(newDate);
                    setTimeRange('custom');
                  }
                }}
                disabled={loading || calculatingForecast}
                format="dd.MM.yyyy"
                slotProps={{ 
                  textField: { 
                    fullWidth: true,
                    variant: "outlined",
                    margin: "normal",
                    error: false,
                    InputProps: {
                      startAdornment: (
                        <InputAdornment position="start">
                          <CategoryIcon color="primary" />
                        </InputAdornment>
                      ),
                    }
                  },
                  field: {
                    clearable: true
                  }
                }}
              />
            </LocalizationProvider>
          </Grid>
          
          {/* Dodaję nowy przycisk Szukaj */}
          <Grid item xs={12}>
            <Button
              variant="contained"
              startIcon={<SearchIcon />}
              onClick={handleSearch}
              disabled={loading || calculatingForecast}
              color="primary"
              fullWidth
              sx={{ mt: 1 }}
            >
              {t('forecast.search')}
            </Button>
          </Grid>
        </Grid>
        
        {!loading && !calculatingForecast && forecastData.length > 0 && (
          <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <TextField
              label={t('forecast.searchMaterial')}
              variant="outlined"
              size="small"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ minWidth: 200, flex: 1 }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
            
            <FormControl variant="outlined" size="small" sx={{ minWidth: 200, flex: 1 }}>
              <InputLabel>{t('forecast.filterByCategory')}</InputLabel>
              <Select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                label={t('forecast.filterByCategory')}
                startAdornment={
                  <InputAdornment position="start">
                    <FilterIcon />
                  </InputAdornment>
                }
              >
                <MenuItem value="">{t('forecast.allCategories')}</MenuItem>
                {getUniqueCategories().map(category => (
                  <MenuItem key={category} value={category}>
                    {category}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}
      </Paper>
      
      {!loading && !calculatingForecast && forecastData.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          {t('forecast.selectDateRange')}
        </Alert>
      ) : (
        <>
          {forecastData.length > 0 && (
            <Box sx={mb2}>
              <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                <InfoIcon sx={{ mr: 1 }} color="info" />
                {t('forecast.forecastPeriod', { startDate: formatDateDisplay(startDate), endDate: formatDateDisplay(endDate) })}
              </Typography>
              
              {summary && (
                <Fade in={dataLoaded} timeout={1000}>
                  <Grid container spacing={2} sx={{ mt: 1 }}>
                    {loading || !dataLoaded ? (
                      // Skeleton loading dla kafelków
                      Array.from({ length: 6 }).map((_, index) => (
                        <Grid item xs={12} sm={6} md={2} key={index}>
                          <Paper sx={{ 
                            p: 2, 
                            textAlign: 'center', 
                            borderRadius: 2, 
                            boxShadow: 2,
                            height: 100,
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center'
                          }}>
                            <Skeleton variant="text" width="80%" height={20} sx={mb1} />
                            <Skeleton variant="text" width="60%" height={32} />
                          </Paper>
                        </Grid>
                      ))
                    ) : (
                      // Rzeczywiste kafelki z animacją
                      <>
                        <Grid item xs={12} sm={6} md={2}>
                          <Grow in={showResults} timeout={500}>
                            <Paper sx={{ 
                              p: 2, 
                              textAlign: 'center', 
                              bgcolor: 'background.darker', 
                              borderRadius: 2, 
                              boxShadow: 2,
                              height: 100,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center'
                            }}>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1, minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {t('forecast.totalMaterials')}
                              </Typography>
                              <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{summary.totalItems}</Typography>
                            </Paper>
                          </Grow>
                        </Grid>
                        <Grid item xs={12} sm={6} md={2}>
                          <Grow in={showResults} timeout={700}>
                            <Paper sx={{ 
                              p: 2, 
                              textAlign: 'center', 
                              bgcolor: 'error.lighter', 
                              borderRadius: 2, 
                              boxShadow: 2,
                              height: 100,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center'
                            }}>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1, minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {t('forecast.materialsRequiringPurchase')}
                              </Typography>
                              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'error.main' }}>{summary.requiredItems}</Typography>
                            </Paper>
                          </Grow>
                        </Grid>
                        <Grid item xs={12} sm={6} md={2}>
                          <Grow in={showResults} timeout={900}>
                            <Paper sx={{ 
                              p: 2, 
                              textAlign: 'center', 
                              bgcolor: 'warning.lighter', 
                              borderRadius: 2, 
                              boxShadow: 2,
                              height: 100,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center'
                            }}>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1, minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {t('forecast.materialsWithShortageAfterDeliveries')}
                              </Typography>
                              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'warning.dark' }}>{summary.requiredItemsAfterDeliveries}</Typography>
                            </Paper>
                          </Grow>
                        </Grid>
                        <Grid item xs={12} sm={6} md={2}>
                          <Grow in={showResults} timeout={1100}>
                            <Paper sx={{ 
                              p: 2, 
                              textAlign: 'center', 
                              bgcolor: 'error.lighter', 
                              borderRadius: 2, 
                              boxShadow: 2,
                              height: 100,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center'
                            }}>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1, minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {t('forecast.shortageValue')}
                              </Typography>
                              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'error.main' }}>{formatCurrency(summary.shortageValue)}</Typography>
                            </Paper>
                          </Grow>
                        </Grid>
                        <Grid item xs={12} sm={6} md={2}>
                          <Grow in={showResults} timeout={1300}>
                            <Paper sx={{ 
                              p: 2, 
                              textAlign: 'center', 
                              bgcolor: 'warning.lighter', 
                              borderRadius: 2, 
                              boxShadow: 2,
                              height: 100,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center'
                            }}>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1, minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {t('forecast.shortageValueAfterDeliveries')}
                              </Typography>
                              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'warning.dark' }}>{formatCurrency(summary.shortageValueAfterDeliveries)}</Typography>
                            </Paper>
                          </Grow>
                        </Grid>
                        <Grid item xs={12} sm={6} md={2}>
                          <Grow in={showResults} timeout={1500}>
                            <Paper sx={{ 
                              p: 2, 
                              textAlign: 'center', 
                              bgcolor: 'info.lighter', 
                              borderRadius: 2, 
                              boxShadow: 2,
                              height: 100,
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center'
                            }}>
                              <Typography variant="body2" color="text.secondary" sx={{ mb: 1, minHeight: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {t('forecast.estimatedTotalCost')}
                              </Typography>
                              <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'info.main' }}>{formatCurrency(summary.totalCost)}</Typography>
                            </Paper>
                          </Grow>
                        </Grid>
                      </>
                    )}
                  </Grid>
                </Fade>
              )}
            </Box>
          )}
          
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
              <CircularProgress />
            </Box>
          ) : calculatingForecast ? (
            <Fade in={calculatingForecast} timeout={500}>
              <Box sx={{ 
                display: 'flex', 
                flexDirection: 'column', 
                alignItems: 'center', 
                mt: 4,
                p: 4
              }}>
                <Box sx={{ position: 'relative', mb: 2 }}>
                  <CircularProgress 
                    size={60} 
                    thickness={4}
                    sx={{ 
                      color: 'primary.main',
                      animationDuration: '1.5s'
                    }} 
                  />
                  <Box
                    sx={{
                      top: 0,
                      left: 0,
                      bottom: 0,
                      right: 0,
                      position: 'absolute',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Typography variant="caption" component="div" color="primary.main" sx={{ fontWeight: 'bold' }}>
                      {Math.floor(Math.random() * 100)}%
                    </Typography>
                  </Box>
                </Box>
                <Typography variant="h6" sx={{ mb: 1, fontWeight: 'medium' }}>
                  {t('forecast.calculating')}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', maxWidth: 400 }}>
                  {t('forecast.calculatingDescription')}
                </Typography>
              </Box>
            </Fade>
          ) : forecastData.length > 0 && (
            <Slide direction="up" in={showResults} timeout={800}>
              <Paper sx={{ mt: 2, borderRadius: 2, overflow: 'hidden', boxShadow: 3 }}>
                <TableContainer sx={{ maxHeight: '70vh' }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'background.paper' }}>
                      <TableRow>
                        <TableCell 
                          width="25%" 
                          onClick={() => handleSortChange('name')} 
                          sx={{ 
                            cursor: 'pointer', 
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1
                          }}
                        >
                          {t('forecast.table.material')} {renderSortIcon('name')}
                        </TableCell>
                        <TableCell 
                          align="right" 
                          width="10%" 
                          onClick={() => handleSortChange('availableQuantity')} 
                          sx={{ 
                            cursor: 'pointer', 
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1
                          }}
                        >
                          {t('forecast.table.availableQuantity')} {renderSortIcon('availableQuantity')}
                        </TableCell>
                        <TableCell 
                          align="right" 
                          width="12%" 
                          onClick={() => handleSortChange('requiredQuantity')} 
                          sx={{ 
                            cursor: 'pointer', 
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1
                          }}
                        >
                          {t('forecast.table.requiredQuantity')} {renderSortIcon('requiredQuantity')}
                        </TableCell>
                        <TableCell 
                          align="right" 
                          width="10%" 
                          onClick={() => handleSortChange('balance')} 
                          sx={{ 
                            cursor: 'pointer', 
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1
                          }}
                        >
                          {t('forecast.table.balance')} {renderSortIcon('balance')}
                        </TableCell>
                        <TableCell 
                          align="right" 
                          width="10%" 
                          sx={{ 
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1
                          }}
                        >
                          {t('forecast.table.expectedDeliveries')}
                        </TableCell>
                        <TableCell 
                          align="center" 
                          width="8%" 
                          sx={{ 
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1
                          }}
                        >
                          ETA
                        </TableCell>
                        <TableCell 
                          align="right" 
                          width="10%" 
                          onClick={() => handleSortChange('balanceWithDeliveries')} 
                          sx={{ 
                            cursor: 'pointer', 
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1
                          }}
                        >
                          {t('forecast.table.balanceAfterDeliveries')} {renderSortIcon('balanceWithDeliveries')}
                        </TableCell>
                        <TableCell 
                          align="right" 
                          width="10%" 
                          onClick={() => handleSortChange('price')} 
                          sx={{ 
                            cursor: 'pointer', 
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1
                          }}
                        >
                          {t('forecast.table.price')} {renderSortIcon('price')}
                        </TableCell>
                        <TableCell 
                          align="right" 
                          width="10%" 
                          onClick={() => handleSortChange('cost')} 
                          sx={{ 
                            cursor: 'pointer', 
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1
                          }}
                        >
                          {t('forecast.table.estimatedCost')} {renderSortIcon('cost')}
                        </TableCell>
                        <TableCell 
                          width="10%" 
                          onClick={() => handleSortChange('status')} 
                          sx={{ 
                            cursor: 'pointer', 
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1
                          }}
                        >
                          {t('forecast.table.status')} {renderSortIcon('status')}
                        </TableCell>
                        <TableCell 
                          align="center" 
                          width="5%" 
                          sx={{ 
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1
                          }}
                        >
                          {t('forecast.table.actions')}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {!showResults ? (
                        // Skeleton loading dla wierszy tabeli
                        Array.from({ length: 5 }).map((_, index) => (
                          <TableRow key={`skeleton-${index}`}>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <Skeleton variant="circular" width={20} height={20} sx={{ mr: 1 }} />
                                <Box>
                                  <Skeleton variant="text" width={150} height={20} />
                                  <Skeleton variant="text" width={100} height={16} />
                                </Box>
                              </Box>
                            </TableCell>
                            <TableCell><Skeleton variant="text" width={80} /></TableCell>
                            <TableCell><Skeleton variant="text" width={80} /></TableCell>
                            <TableCell><Skeleton variant="text" width={80} /></TableCell>
                            <TableCell><Skeleton variant="text" width={80} /></TableCell>
                            <TableCell><Skeleton variant="text" width={80} /></TableCell>
                            <TableCell><Skeleton variant="text" width={90} /></TableCell>
                            <TableCell><Skeleton variant="text" width={60} /></TableCell>
                            <TableCell><Skeleton variant="text" width={60} /></TableCell>
                            <TableCell><Skeleton variant="circular" width={24} height={24} /></TableCell>
                            <TableCell><Skeleton variant="circular" width={32} height={32} /></TableCell>
                          </TableRow>
                        ))
                      ) : (
                        filteredData().map((item, index) => {
                          const balance = item.balance;
                          const balanceWithDeliveries = item.balanceWithFutureDeliveries;
                          let statusColor = 'success';
                          let statusText = 'Wystarczająca ilość';
                          let rowBgColor = '';
                          
                          // Sprawdzenie statusu uwzględniając przyszłe dostawy
                          if (balanceWithDeliveries < 0) {
                            statusColor = 'error';
                            statusText = 'Niedobór';
                            rowBgColor = 'error.lighter';
                          } else if (balance < 0 && balanceWithDeliveries >= 0) {
                            statusColor = 'warning';
                            statusText = 'Uzupełniany dostawami';
                            rowBgColor = 'warning.lighter';
                          }
                          
                          return (
                            <Fade 
                              key={item.id} 
                              in={showResults} 
                              timeout={1000} 
                              style={{ 
                                transitionDelay: showResults ? `${index * 50}ms` : '0ms' 
                              }}
                            >
                              <TableRow 
                                hover 
                                sx={{ 
                                  bgcolor: rowBgColor,
                                  '&:hover': {
                                    bgcolor: rowBgColor ? `${rowBgColor}!important` : undefined
                                  }
                                }}
                              >
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                                    <CategoryIcon sx={{ mr: 1, mt: 0.5, fontSize: 'small', color: 'text.secondary' }} />
                                    <Box>
                                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                        {item.name}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {item.category || 'Bez kategorii'}
                                      </Typography>
                                    </Box>
                                  </Box>
                                </TableCell>
                                <TableCell align="right">
                                  {formatNumber(item.availableQuantity)} {item.unit}
                                </TableCell>
                                <TableCell align="right">
                                  <Box>
                                    {item.requiredQuantity === 0 ? (
                                      <Typography variant="body2" color="text.secondary">
                                        —
                                      </Typography>
                                    ) : (
                                      <Tooltip 
                                        title={`${formatNumber(item.requiredQuantity + (item.consumedQuantity || 0))} ${item.unit} - ${formatNumber(item.consumedQuantity || 0)} ${item.unit} = ${formatNumber(item.requiredQuantity)} ${item.unit}`}
                                      >
                                        <Typography variant="body2" sx={{ fontWeight: 'medium', cursor: 'pointer' }}>
                                          {formatNumber(item.requiredQuantity)} {item.unit}
                                        </Typography>
                                      </Tooltip>
                                    )}
                                  </Box>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography 
                                    color={balance < 0 ? 'error' : 'success'}
                                    fontWeight={balance < 0 ? 'bold' : 'normal'}
                                    sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}
                                  >
                                    {balance < 0 && <WarningIcon fontSize="small" sx={{ mr: 0.5 }} />}
                                    {formatNumber(balance)} {item.unit}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right">
                                  {item.futureDeliveriesTotal > 0 ? (
                                    <Tooltip title={
                                      item.futureDeliveries ? item.futureDeliveries.map(delivery => {
                                        const formattedDate = delivery.expectedDeliveryDate && delivery.expectedDeliveryDate !== '' 
                                          ? formatDateDisplay(new Date(delivery.expectedDeliveryDate))
                                          : 'brak daty';
                                        const supplier = delivery.supplierName ? ` | ${delivery.supplierName}` : '';
                                        return `${delivery.poNumber}: ${formatNumber(delivery.quantity)} ${item.unit} (${formattedDate || 'brak daty'})${supplier}`;
                                      }).join('\n') : 'Brak szczegółów'
                                    }>
                                      <Typography sx={{ cursor: 'pointer', fontWeight: 'medium', color: 'primary.main' }}>
                                        {formatNumber(item.futureDeliveriesTotal)} {item.unit}
                                      </Typography>
                                    </Tooltip>
                                  ) : (
                                    <Typography color="text.secondary">0 {item.unit}</Typography>
                                  )}
                                </TableCell>
                                <TableCell align="center">
                                  {item.futureDeliveries && item.futureDeliveries.length > 0 ? (
                                    <Tooltip title={
                                      item.futureDeliveries.length > 1 
                                        ? `Najbliższa dostawa: ${item.futureDeliveries[0].poNumber}\n\nWszystkie dostawy:\n${item.futureDeliveries.map(d => 
                                            `${d.poNumber}: ${formatDateDisplay(new Date(d.expectedDeliveryDate)) || 'brak daty'}`
                                          ).join('\n')}`
                                        : `${item.futureDeliveries[0].poNumber}`
                                    }>
                                      <Box sx={{ cursor: 'pointer' }}>
                                        <Typography 
                                          variant="body2" 
                                          sx={{ 
                                            fontWeight: 'medium',
                                            color: 'primary.main'
                                          }}
                                        >
                                          {item.futureDeliveries[0].expectedDeliveryDate 
                                            ? formatDateDisplay(new Date(item.futureDeliveries[0].expectedDeliveryDate))
                                            : 'Brak daty'}
                                        </Typography>
                                        {item.futureDeliveries.length > 1 && (
                                          <Typography 
                                            variant="caption" 
                                            color="text.secondary"
                                            sx={{ fontSize: '0.7rem' }}
                                          >
                                            +{item.futureDeliveries.length - 1} więcej
                                          </Typography>
                                        )}
                                      </Box>
                                    </Tooltip>
                                  ) : (
                                    <Typography variant="body2" color="text.secondary">—</Typography>
                                  )}
                                </TableCell>
                                <TableCell align="right">
                                  <Typography 
                                    color={balanceWithDeliveries < 0 ? 'error' : 'success'}
                                    fontWeight={balanceWithDeliveries < 0 ? 'bold' : 'normal'}
                                    sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center' }}
                                  >
                                    {balanceWithDeliveries < 0 && <WarningIcon fontSize="small" sx={{ mr: 0.5 }} />}
                                    {formatNumber(balanceWithDeliveries)} {item.unit}
                                  </Typography>
                                </TableCell>
                                <TableCell align="right">
                                  {item.price === 0 ? '-' : (
                                    <Tooltip title={
                                      item.priceSource === 'PO' 
                                        ? 'Cena z zamówienia zakupu (PO) - średnia ważona' 
                                        : item.supplier 
                                          ? `Cena od dostawcy: ${item.supplier}${item.isDefaultSupplier ? ' (domyślny)' : ''}` 
                                          : 'Cena magazynowa'
                                    }>
                                      <span>{formatCurrency(item.price)}</span>
                                    </Tooltip>
                                  )}
                                </TableCell>
                                <TableCell align="right">
                                  {item.cost === 0 ? '-' : (
                                    <Tooltip title={
                                      item.priceSource === 'PO' 
                                        ? 'Koszt na podstawie ceny z zamówienia zakupu (PO)' 
                                        : item.supplier 
                                          ? `Koszt na podstawie ceny od dostawcy: ${item.supplier}${item.isDefaultSupplier ? ' (domyślny)' : ''}` 
                                          : 'Koszt na podstawie ceny magazynowej'
                                    }>
                                      <span>{formatCurrency(item.cost)}</span>
                                    </Tooltip>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Tooltip title={statusText}>
                                    <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                      {statusColor === 'success' && (
                                        <CheckCircleIcon color="success" fontSize="small" />
                                      )}
                                      {statusColor === 'warning' && (
                                        <ScheduleIcon color="warning" fontSize="small" />
                                      )}
                                      {statusColor === 'error' && (
                                        <ErrorIcon color="error" fontSize="small" />
                                      )}
                                    </Box>
                                  </Tooltip>
                                </TableCell>
                                <TableCell align="center">
                                  <Stack direction="row" spacing={1} justifyContent="center">
                                    <Tooltip title={t('forecast.tooltips.showDetails')}>
                                      <IconButton 
                                        size="small" 
                                        color="info" 
                                        onClick={() => handleItemClick(item)}
                                        sx={{ boxShadow: 1 }}
                                      >
                                        <InfoIcon fontSize="small" />
                                      </IconButton>
                                    </Tooltip>
                                    {balance < 0 && (
                                      <Tooltip title={t('forecast.tooltips.orderMaterial')}>
                                        <IconButton
                                          size="small"
                                          color="error"
                                          onClick={() => navigate('/purchase-orders/new', { 
                                            state: { materialId: item.id, requiredQuantity: Math.abs(balance) }
                                          })}
                                          sx={{ boxShadow: 1 }}
                                        >
                                          <ShoppingCartIcon fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                    )}
                                  </Stack>
                                </TableCell>
                              </TableRow>
                            </Fade>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                {filteredData().length === 0 && (
                  <Box sx={{ p: 2, textAlign: 'center' }}>
                    <Typography color="text.secondary">Nie znaleziono materiałów pasujących do filtrów</Typography>
                  </Box>
                )}
                {(searchTerm || categoryFilter) && filteredData().length > 0 && (
                  <Box sx={{ p: 1, display: 'flex', justifyContent: 'flex-end' }}>
                    <Button 
                      size="small" 
                      onClick={() => {
                        setSearchTerm('');
                        setCategoryFilter('');
                      }}
                      startIcon={<FilterIcon />}
                    >
                      Wyczyść filtry
                    </Button>
                  </Box>
                )}
              </Paper>
            </Slide>
          )}
          
          {/* Tabela z materiałami nieużywanymi w MO */}
          {forecastData.length > 0 && getUnusedMaterials().length > 0 && (
            <Slide direction="up" in={showResults} timeout={1000}>
              <Paper sx={{ mt: 4, borderRadius: 2, overflow: 'hidden', boxShadow: 3 }}>
                <Box sx={{ p: 2, bgcolor: 'info.lighter', borderBottom: 1, borderColor: 'divider' }}>
                  <Typography variant="h6" sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                    <InfoIcon sx={{ mr: 1 }} color="info" />
                    {t('forecast.unusedMaterials.title', { count: filteredUnusedMaterials().length })}
                    {loadingUnusedDeliveries && (
                      <CircularProgress size={16} sx={{ ml: 1 }} />
                    )}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {t('forecast.unusedMaterials.description')}
                    {t('forecast.excludedCategories')}
                  </Typography>
                </Box>
                <TableContainer sx={{ maxHeight: '50vh' }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: 'background.paper' }}>
                      <TableRow>
                        <TableCell 
                          width="35%" 
                          onClick={() => handleUnusedSortChange('name')}
                          sx={{ 
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1,
                            '&:hover': { bgcolor: (theme) => theme.palette.mode === 'dark' ? '#2d3b4f' : '#e0e0e0' }
                          }}
                        >
                          {t('forecast.table.material')} {renderUnusedSortIcon('name')}
                        </TableCell>
                        <TableCell 
                          align="right" 
                          width="15%" 
                          onClick={() => handleUnusedSortChange('availableQuantity')}
                          sx={{ 
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1,
                            '&:hover': { bgcolor: (theme) => theme.palette.mode === 'dark' ? '#2d3b4f' : '#e0e0e0' }
                          }}
                        >
                          {t('forecast.table.availableQuantity')} {renderUnusedSortIcon('availableQuantity')}
                        </TableCell>
                        <TableCell 
                          align="right" 
                          width="15%" 
                          onClick={() => handleUnusedSortChange('futureDeliveries')}
                          sx={{ 
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1,
                            '&:hover': { bgcolor: (theme) => theme.palette.mode === 'dark' ? '#2d3b4f' : '#e0e0e0' }
                          }}
                        >
                          {t('forecast.table.expectedDeliveries')} {renderUnusedSortIcon('futureDeliveries')}
                        </TableCell>
                        <TableCell 
                          align="center" 
                          width="15%" 
                          onClick={() => handleUnusedSortChange('eta')}
                          sx={{ 
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1,
                            '&:hover': { bgcolor: (theme) => theme.palette.mode === 'dark' ? '#2d3b4f' : '#e0e0e0' }
                          }}
                        >
                          ETA {renderUnusedSortIcon('eta')}
                        </TableCell>
                        <TableCell 
                          align="right" 
                          width="20%" 
                          onClick={() => handleUnusedSortChange('availableWithDeliveries')}
                          sx={{ 
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            position: 'sticky',
                            top: 0,
                            bgcolor: (theme) => theme.palette.mode === 'dark' 
                              ? '#1e293b' 
                              : '#f5f5f5',
                            zIndex: 1,
                            '&:hover': { bgcolor: (theme) => theme.palette.mode === 'dark' ? '#2d3b4f' : '#e0e0e0' }
                          }}
                        >
                          {t('forecast.unusedMaterials.totalAvailable')} {renderUnusedSortIcon('availableWithDeliveries')}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {filteredUnusedMaterials().length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} align="center">
                            <Typography color="text.secondary" sx={{ py: 2 }}>
                              {t('forecast.noMaterialsMatchingFilters')}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredUnusedMaterials().map((item, index) => {
                          const deliveryData = unusedMaterialsDeliveries[item.id];
                          const hasDeliveries = deliveryData && deliveryData.total > 0;
                          const availableQuantity = parseFloat(item.quantity) || 0;
                          const futureDeliveriesTotal = deliveryData?.total || 0;
                          const availableWithDeliveries = availableQuantity + futureDeliveriesTotal;
                          
                          return (
                            <Fade 
                              key={item.id} 
                              in={showResults} 
                              timeout={1000} 
                              style={{ 
                                transitionDelay: showResults ? `${index * 30}ms` : '0ms' 
                              }}
                            >
                              <TableRow hover>
                                <TableCell>
                                  <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                                    <CategoryIcon sx={{ mr: 1, mt: 0.5, fontSize: 'small', color: 'text.secondary' }} />
                                    <Box>
                                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                        {item.name}
                                      </Typography>
                                      <Typography variant="caption" color="text.secondary">
                                        {item.category || 'Bez kategorii'}
                                      </Typography>
                                    </Box>
                                  </Box>
                                </TableCell>
                                <TableCell align="right">
                                  <Typography variant="body2">
                                    {formatNumber(availableQuantity)} {item.unit || 'szt.'}
                                  </Typography>
                                </TableCell>
                                {/* Oczekiwane dostawy - jak w głównej prognozie */}
                                <TableCell align="right">
                                  {loadingUnusedDeliveries ? (
                                    <Skeleton width={60} />
                                  ) : hasDeliveries ? (
                                    <Tooltip title={
                                      deliveryData.deliveries.map(delivery => {
                                        const formattedDate = delivery.expectedDeliveryDate 
                                          ? formatDateDisplay(new Date(delivery.expectedDeliveryDate))
                                          : 'brak daty';
                                        const supplier = delivery.supplier ? ` | ${delivery.supplier}` : '';
                                        return `${delivery.poNumber}: ${formatNumber(delivery.quantity)} ${item.unit || 'szt.'} (${formattedDate})${supplier}`;
                                      }).join('\n')
                                    }>
                                      <Typography sx={{ cursor: 'pointer', fontWeight: 'medium', color: 'primary.main' }}>
                                        {formatNumber(futureDeliveriesTotal)} {item.unit || 'szt.'}
                                      </Typography>
                                    </Tooltip>
                                  ) : (
                                    <Typography color="text.secondary">0 {item.unit || 'szt.'}</Typography>
                                  )}
                                </TableCell>
                                {/* ETA - jak w głównej prognozie */}
                                <TableCell align="center">
                                  {loadingUnusedDeliveries ? (
                                    <Skeleton width={80} />
                                  ) : hasDeliveries ? (
                                    <Tooltip title={
                                      deliveryData.deliveries.length > 1 
                                        ? `Najbliższa dostawa: ${deliveryData.deliveries[0].poNumber}\n\nWszystkie dostawy:\n${deliveryData.deliveries.map(d => 
                                            `${d.poNumber}: ${d.expectedDeliveryDate ? formatDateDisplay(new Date(d.expectedDeliveryDate)) : 'brak daty'}`
                                          ).join('\n')}`
                                        : `${deliveryData.deliveries[0].poNumber}`
                                    }>
                                      <Box sx={{ cursor: 'pointer' }}>
                                        <Typography 
                                          variant="body2" 
                                          sx={{ 
                                            fontWeight: 'medium',
                                            color: 'primary.main'
                                          }}
                                        >
                                          {deliveryData.deliveries[0].expectedDeliveryDate 
                                            ? formatDateDisplay(new Date(deliveryData.deliveries[0].expectedDeliveryDate))
                                            : 'Brak daty'}
                                        </Typography>
                                        {deliveryData.deliveries.length > 1 && (
                                          <Typography 
                                            variant="caption" 
                                            color="text.secondary"
                                            sx={{ fontSize: '0.7rem' }}
                                          >
                                            +{deliveryData.deliveries.length - 1} więcej
                                          </Typography>
                                        )}
                                      </Box>
                                    </Tooltip>
                                  ) : (
                                    <Typography variant="body2" color="text.secondary">—</Typography>
                                  )}
                                </TableCell>
                                {/* Dostępne z dostawami - jak w głównej prognozie */}
                                <TableCell align="right">
                                  {loadingUnusedDeliveries ? (
                                    <Skeleton width={80} />
                                  ) : (
                                    <Typography 
                                      color={hasDeliveries ? 'success.main' : 'text.primary'}
                                      fontWeight={hasDeliveries ? 'medium' : 'normal'}
                                    >
                                      {formatNumber(availableWithDeliveries)} {item.unit || 'szt.'}
                                    </Typography>
                                  )}
                                </TableCell>
                              </TableRow>
                            </Fade>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Slide>
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
        </>
      )}
      
      {/* Komunikat sukcesu */}
      <Fade in={showSuccessMessage} timeout={500}>
        <Box sx={{ 
          position: 'fixed', 
          top: 20, 
          right: 20, 
          zIndex: 9999,
          display: showSuccessMessage ? 'flex' : 'none'
        }}>
          <Paper sx={{ 
            p: 2, 
            bgcolor: 'success.main', 
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            borderRadius: 2,
            boxShadow: 3
          }}>
            <CheckIcon sx={{ mr: 1 }} />
            <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
              Prognoza została pomyślnie wygenerowana!
            </Typography>
          </Paper>
        </Box>
      </Fade>
      
      {/* Dialog ze szczegółami materiału */}
      <Dialog open={detailsDialogOpen} onClose={handleCloseDetailsDialog} maxWidth="md" fullWidth>
        <DialogTitle>{t('forecast.materialDetails')}</DialogTitle>
        <DialogContent>
          {selectedMaterial && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6">{selectedMaterial.name}</Typography>
              <Typography variant="body2" color="text.secondary" sx={mb2}>
                {t('forecast.category')}: {selectedMaterial.category}
              </Typography>
              
              <Grid container spacing={2} sx={mb3}>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">{t('forecast.details.availableQuantity')}:</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                    {formatNumber(selectedMaterial.availableQuantity)} {selectedMaterial.unit}
                  </Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">{t('forecast.details.requiredQuantity')}:</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                    {formatNumber(selectedMaterial.requiredQuantity)} {selectedMaterial.unit}
                  </Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">{t('forecast.details.alreadyConsumed')}:</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 'medium', color: 'info.main' }}>
                    {formatNumber(selectedMaterial.consumedQuantity || 0)} {selectedMaterial.unit}
                  </Typography>
                </Grid>
                <Grid item xs={6} md={3}>
                  <Typography variant="body2" color="text.secondary">{t('forecast.details.balance')}:</Typography>
                  <Typography variant="body1" sx={{ fontWeight: 'medium' }} color={selectedMaterial.balance < 0 ? 'error.main' : 'success.main'}>
                    {formatNumber(selectedMaterial.balance)} {selectedMaterial.unit}
                  </Typography>
                </Grid>
              </Grid>
              
              {selectedMaterial.futureDeliveries && selectedMaterial.futureDeliveries.length > 0 && (
                <>
                  <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                    {t('forecast.expectedDeliveriesDetails', { total: formatNumber(selectedMaterial.futureDeliveriesTotal), unit: selectedMaterial.unit })}
                  </Typography>
                  <TableContainer component={Paper} variant="outlined" sx={mb2}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{t('forecast.poNumber')}</TableCell>
                          <TableCell>{t('forecast.details.supplier')}</TableCell>
                          <TableCell>{t('forecast.table.status')}</TableCell>
                          <TableCell align="right">{t('forecast.details.quantity')}</TableCell>
                          <TableCell align="right">{t('forecast.deliveryDate')}</TableCell>
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
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {delivery.supplierName || t('forecast.details.noSupplier')}
                              </Typography>
                            </TableCell>
                            <TableCell>{delivery.status}</TableCell>
                            <TableCell align="right">{formatNumber(delivery.quantity)} {selectedMaterial.unit}</TableCell>
                            <TableCell align="right">
                              {delivery.expectedDeliveryDate && delivery.expectedDeliveryDate !== ''
                                ? (() => {
                                    const formatted = formatDateDisplay(new Date(delivery.expectedDeliveryDate));
                                    return formatted || t('forecast.noDate');
                                  })()
                                : t('forecast.noDate')
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
                    {t('forecast.tasksUsingMaterial')}
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{t('forecast.taskName')}</TableCell>
                          <TableCell>{t('forecast.moNumber')}</TableCell>
                          <TableCell align="right">{t('forecast.productQuantity')}</TableCell>
                          <TableCell align="right">{t('forecast.materialPerUnit')}</TableCell>
                          <TableCell align="right">{t('forecast.executionDate')}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedMaterial.tasks.map(taskId => {
                          const task = tasks.find(t => t.id === taskId);
                          if (!task) return null;
                          
                          const materialInTask = task.materials?.find(m => m.id === selectedMaterial.id);
                          
                          // POPRAWKA: Pobierz rzeczywistą ilość z actualMaterialUsage, jeśli jest dostępna
                          const actualMaterialUsage = task.actualMaterialUsage || {};
                          const materialId = materialInTask?.id || selectedMaterial.id;
                          const inventoryItemId = materialInTask?.inventoryItemId;
                          const actualTotalQuantity = actualMaterialUsage[materialId] ?? actualMaterialUsage[inventoryItemId];
                          
                          // Użyj rzeczywistej ilości jeśli dostępna, w przeciwnym razie oryginalną
                          const quantityPerUnit = actualTotalQuantity !== undefined 
                            ? parseFloat(actualTotalQuantity) 
                            : (materialInTask?.quantity || 0);
                          
                          return (
                            <TableRow key={taskId}>
                              <TableCell>
                                <Link
                                  to={`/production/tasks/${taskId}`}
                                  style={{ 
                                    cursor: 'pointer', 
                                    textDecoration: 'underline',
                                    color: 'inherit'
                                  }}
                                >
                                  <Typography 
                                    variant="body2" 
                                    sx={{ 
                                      color: 'primary.main'
                                    }}
                                  >
                                    {task.name}
                                  </Typography>
                                </Link>
                              </TableCell>
                              <TableCell>
                                <Typography variant="body2" color="text.secondary">
                                  {task.moNumber || task.orderNumber || '-'}
                                </Typography>
                              </TableCell>
                              <TableCell align="right">{formatNumber(task.quantity || 0)}</TableCell>
                              <TableCell align="right">{formatNumber(quantityPerUnit)} {selectedMaterial.unit}</TableCell>
                              <TableCell align="right">
                                {task.scheduledDate && task.scheduledDate !== ''
                                  ? (() => {
                                      try {
                                        let taskDate;
                                        // Obsługa Firestore Timestamp
                                        if (task.scheduledDate?.toDate) {
                                          taskDate = task.scheduledDate.toDate();
                                        } else if (typeof task.scheduledDate === 'string') {
                                          taskDate = new Date(task.scheduledDate);
                                        } else if (task.scheduledDate instanceof Date) {
                                          taskDate = task.scheduledDate;
                                        } else {
                                          return t('forecast.noDate');
                                        }
                                        
                                        const formatted = formatDateDisplay(taskDate);
                                        return formatted || t('forecast.noDate');
                                      } catch (error) {
                                        console.error('Błąd formatowania daty zadania:', error);
                                        return t('forecast.noDate');
                                      }
                                    })()
                                  : t('forecast.noDate')
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
                    {t('forecast.orderMaterial')}
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDetailsDialog}>{t('forecast.close')}</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog zapisu prognozy do CRM */}
      <Dialog 
        open={saveToCrmDialogOpen} 
        onClose={() => !savingToCrm && setSaveToCrmDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Zapisz prognozę do CRM</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Zapisz aktualną prognozę zapotrzebowania jako snapshot. Będzie dostępna w zakładce Stany → Prognozy zakupowe.
          </Typography>
          <TextField
            autoFocus
            label="Nazwa prognozy"
            fullWidth
            variant="outlined"
            value={saveToCrmName}
            onChange={(e) => setSaveToCrmName(e.target.value)}
            placeholder={`Prognoza ${format(startDate, 'dd.MM')} - ${format(endDate, 'dd.MM.yyyy')}`}
            sx={{ mb: 2 }}
          />
          <TextField
            label="Notatki (opcjonalne)"
            fullWidth
            variant="outlined"
            multiline
            rows={3}
            value={saveToCrmNotes}
            onChange={(e) => setSaveToCrmNotes(e.target.value)}
            placeholder="Dodatkowe informacje do prognozy..."
          />
          <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Materiałów: <strong>{forecastData.length}</strong> | 
              Z niedoborem: <strong style={{ color: '#d32f2f' }}>{forecastData.filter(i => i.balanceWithFutureDeliveries < 0).length}</strong> | 
              Okres: <strong>{format(startDate, 'dd.MM.yyyy')} - {format(endDate, 'dd.MM.yyyy')}</strong>
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setSaveToCrmDialogOpen(false)} 
            disabled={savingToCrm}
          >
            Anuluj
          </Button>
          <Button 
            onClick={handleSaveToCrm} 
            variant="contained" 
            color="success"
            disabled={savingToCrm}
            startIcon={savingToCrm ? <CircularProgress size={20} /> : <SaveAltIcon />}
          >
            {savingToCrm ? 'Zapisywanie...' : 'Zapisz'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ForecastPage; 