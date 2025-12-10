// src/components/production/TaskForm.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  FormHelperText,
  CircularProgress,
  Divider,
  Container,
  Alert,
  AlertTitle,
  Chip,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondary,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip,
  Checkbox,
  FormControlLabel,
  Tabs,
  Tab
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  Link as LinkIcon,
  Update as UpdateIcon,
  History as HistoryIcon,
  Calculate as CalculateIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import {
  createTask,
  updateTask,
  getTaskById,
  clearProductionTasksCache
} from '../../services/productionService';
import { getAllRecipes, getRecipeById, getRecipeVersions, getRecipeVersion } from '../../services/recipeService';
import {
  getAllInventoryItems,
  getInventoryItemById
} from '../../services/inventory';
import { getAllPurchaseOrders } from '../../services/purchaseOrderService';
import { getOrderById, getAllOrders, updateOrder } from '../../services/orderService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { getAllWorkstations } from '../../services/workstationService';
import { getAllMONumbers } from '../../services/moService';
import { generateLOTNumber } from '../../utils/numberGenerators';
import { calculateEndDateExcludingWeekends, calculateProductionTimeBetweenExcludingWeekends, calculateEndDateWithWorkingHours, calculateProductionTimeWithWorkingHours } from '../../utils/dateUtils';
import { preciseMultiply } from '../../utils/mathUtils';

const TaskForm = ({ taskId }) => {
  const [loading, setLoading] = useState(!!taskId);
  const [saving, setSaving] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const [recipe, setRecipe] = useState(null);
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const { currentUser } = useAuth();
  const { showSuccess, showError, showWarning } = useNotification();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [workstations, setWorkstations] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState(null);
  
  // Stan zakładek formularza
  const [activeTab, setActiveTab] = useState(0);
  
  // Cache stany dla optymalizacji
  const [dataLoaded, setDataLoaded] = useState({
    recipes: false,
    workstations: false,
    inventoryProducts: false,
    purchaseOrders: false,
    customerOrders: false
  });
  
  const [taskData, setTaskData] = useState({
    name: '',
    description: '',
    recipeId: '',
    productName: '',
    quantity: '',
    unit: 'szt.',
    scheduledDate: new Date(),
    endDate: new Date(new Date().getTime() + 60 * 60 * 1000), // Domyślnie 1 godzina później
    estimatedDuration: '', // w minutach
    productionTimePerUnit: '', // czas produkcji na jednostkę w minutach
    processingCostPerUnit: 0, // koszt procesowy/robocizny na jednostkę w EUR
    workingHoursPerDay: 16, // Godziny pracy zakładu dziennie (domyślnie 16h)
    priority: 'Normalny',
    status: 'Zaplanowane',
    notes: '',
    moNumber: '',
    workstationId: '', // ID stanowiska produkcyjnego
    lotNumber: '', // Numer partii produktu (LOT)
    expiryDate: null, // Data ważności produktu
    linkedPurchaseOrders: [], // Powiązane zamówienia zakupowe
    // Pola dla ręcznych kosztów produkcji
    disableAutomaticCostUpdates: false,
    manualTotalMaterialCost: '',
    manualTotalFullProductionCost: '',
    manualUnitMaterialCost: '',
    manualUnitFullProductionCost: ''
  });

  const [recipeYieldError, setRecipeYieldError] = useState(false);
  
  // Stany dla aktualizacji receptury
  const [recipeVersionDialogOpen, setRecipeVersionDialogOpen] = useState(false);
  const [availableVersions, setAvailableVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [updatingRecipe, setUpdatingRecipe] = useState(false);
  const [availableRecipeVersions, setAvailableRecipeVersions] = useState([]);
  const [refreshingProductName, setRefreshingProductName] = useState(false);

  // Stany dla dialogu przeliczania materiałów przy zmianie ilości
  const [quantityChangeDialogOpen, setQuantityChangeDialogOpen] = useState(false);
  const [originalQuantity, setOriginalQuantity] = useState(null); // Oryginalna ilość przy załadowaniu
  const [pendingSubmitEvent, setPendingSubmitEvent] = useState(null); // Zapisany event submita
  const [recalculateMaterialsChoice, setRecalculateMaterialsChoice] = useState(null); // Wybór użytkownika

  // Stany dla powiązania z zamówieniem klienta
  const [customerOrders, setCustomerOrders] = useState([]);
  const [selectedCustomerOrder, setSelectedCustomerOrder] = useState(null);
  const [selectedOrderItemId, setSelectedOrderItemId] = useState('');
  const [originalOrderId, setOriginalOrderId] = useState(null); // Do śledzenia zmian powiązania

  // Stany dla edycji numeru MO
  const [editingMO, setEditingMO] = useState(false);
  const [newMONumber, setNewMONumber] = useState('');
  const [moValidationError, setMOValidationError] = useState('');

  // Funkcja do cache'owania danych w sessionStorage
  const getCachedData = useCallback((key) => {
    try {
      const cached = sessionStorage.getItem(`taskform_${key}`);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        // Cache ważny przez 5 minut
        if (Date.now() - timestamp < 5 * 60 * 1000) {
          return data;
        }
      }
    } catch (error) {
      console.warn('Błąd odczytu cache:', error);
    }
    return null;
  }, []);

  const setCachedData = useCallback((key, data) => {
    try {
      sessionStorage.setItem(`taskform_${key}`, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.warn('Błąd zapisu cache:', error);
    }
  }, []);

  // Memoizowane opcje dla dropdown'ów
  const recipeOptions = useMemo(() => 
    recipes.map((recipe) => (
      <MenuItem key={recipe.id} value={recipe.id}>
        {recipe.name}
      </MenuItem>
    ))
  , [recipes]);

  const workstationOptions = useMemo(() => 
    workstations.map((workstation) => (
      <MenuItem key={workstation.id} value={workstation.id}>
        {workstation.name}
      </MenuItem>
    ))
  , [workstations]);

  const unitOptions = useMemo(() => [
    <MenuItem key="szt" value="szt.">szt.</MenuItem>,
    <MenuItem key="kg" value="kg">kg</MenuItem>,
    <MenuItem key="caps" value="caps">caps</MenuItem>
  ], []);

  const priorityOptions = useMemo(() => [
    <MenuItem key="niski" value="Niski">Niski</MenuItem>,
    <MenuItem key="normalny" value="Normalny">Normalny</MenuItem>,
    <MenuItem key="wysoki" value="Wysoki">Wysoki</MenuItem>,
    <MenuItem key="krytyczny" value="Krytyczny">Krytyczny</MenuItem>
  ], []);

  const statusOptions = useMemo(() => [
    <MenuItem key="zaplanowane" value="Zaplanowane">Zaplanowane</MenuItem>,
    <MenuItem key="w-trakcie" value="W trakcie">W trakcie</MenuItem>,
    <MenuItem key="wstrzymane" value="Wstrzymane">Wstrzymane</MenuItem>,
    <MenuItem key="zakonczone" value="Zakończone">Zakończone</MenuItem>,
    <MenuItem key="anulowane" value="Anulowane">Anulowane</MenuItem>
  ], []);

  // Cleanup effect - czyści cache gdy komponent jest odmontowywany
  useEffect(() => {
    return () => {
      // Opcjonalnie można wyczyścić cache przy odmontowywaniu
      // sessionStorage.removeItem('taskform_recipes');
      // sessionStorage.removeItem('taskform_workstations');
      // sessionStorage.removeItem('taskform_inventoryProducts');
    };
  }, []);

  // Optymalizowane pobieranie danych - tylko niezbędne przy starcie
  useEffect(() => {
    const fetchCriticalData = async () => {
      try {
        setLoading(true);
        
        if (taskId && taskId !== 'new') {
          // Tryb edycji - najpierw pobierz zadanie, potem resztę w tle
          await fetchTask();
          // Pobierz podstawowe dane równolegle w tle
          fetchSupportingDataInBackground();
        } else {
          // Tryb nowego zadania - pobierz tylko podstawowe dane
          await Promise.all([
            fetchRecipes(),
            fetchWorkstations()
          ]);
        }
      } catch (error) {
        showError('Błąd podczas ładowania danych: ' + error.message);
        console.error('Error loading data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchCriticalData();
  }, [taskId]);

  // Ustaw selectedCustomerOrder po załadowaniu zamówień
  useEffect(() => {
    if (taskData.orderId && customerOrders.length > 0 && !selectedCustomerOrder) {
      const order = customerOrders.find(o => o.id === taskData.orderId);
      if (order) {
        setSelectedCustomerOrder(order);
      }
    }
  }, [taskData.orderId, customerOrders, selectedCustomerOrder]);

  // Pobieranie danych wspomagających w tle
  const fetchSupportingDataInBackground = useCallback(async () => {
    try {
      // Pobieraj dane które nie są krytyczne dla edycji w tle
      const promises = [];
      
      if (!dataLoaded.recipes) {
        promises.push(fetchRecipes());
      }
      if (!dataLoaded.workstations) {
        promises.push(fetchWorkstations());
      }
      if (!dataLoaded.inventoryProducts) {
        promises.push(fetchInventoryProducts());
      }
      if (!dataLoaded.purchaseOrders) {
        promises.push(fetchPurchaseOrders());
      }
      if (!dataLoaded.customerOrders) {
        promises.push(fetchCustomerOrders());
      }
      
      await Promise.allSettled(promises);
    } catch (error) {
      console.warn('Błąd podczas ładowania danych wspomagających:', error);
    }
  }, [dataLoaded]);

  const fetchRecipes = async () => {
    if (dataLoaded.recipes) return;
    
    try {
      // Sprawdź cache
      const cachedRecipes = getCachedData('recipes');
      if (cachedRecipes) {
        setRecipes(cachedRecipes);
        setDataLoaded(prev => ({ ...prev, recipes: true }));
        return;
      }

      const recipesData = await getAllRecipes();
      setRecipes(recipesData);
      setCachedData('recipes', recipesData);
      setDataLoaded(prev => ({ ...prev, recipes: true }));
    } catch (error) {
      showError('Błąd podczas pobierania receptur: ' + error.message);
      console.error('Error fetching recipes:', error);
    }
  };

  const fetchInventoryProducts = async () => {
    if (dataLoaded.inventoryProducts) return;
    
    try {
      // Sprawdź cache
      const cachedProducts = getCachedData('inventoryProducts');
      if (cachedProducts) {
        setInventoryProducts(cachedProducts);
        setDataLoaded(prev => ({ ...prev, inventoryProducts: true }));
        return;
      }

      // Pobierz tylko produkty z kategorii "Gotowe produkty"
      const allItems = await getAllInventoryItems();
      const products = allItems.filter(item => item.category === 'Gotowe produkty');
      setInventoryProducts(products);
      setCachedData('inventoryProducts', products);
      setDataLoaded(prev => ({ ...prev, inventoryProducts: true }));
    } catch (error) {
      showError('Błąd podczas pobierania produktów z magazynu: ' + error.message);
      console.error('Error fetching inventory products:', error);
    }
  };

  const fetchWorkstations = async () => {
    if (dataLoaded.workstations) return;
    
    try {
      // Sprawdź cache
      const cachedWorkstations = getCachedData('workstations');
      if (cachedWorkstations) {
        setWorkstations(cachedWorkstations);
        setDataLoaded(prev => ({ ...prev, workstations: true }));
        return;
      }

      const workstationsData = await getAllWorkstations();
      setWorkstations(workstationsData);
      setCachedData('workstations', workstationsData);
      setDataLoaded(prev => ({ ...prev, workstations: true }));
    } catch (error) {
      showError('Błąd podczas pobierania stanowisk produkcyjnych: ' + error.message);
      console.error('Error fetching workstations:', error);
    }
  };

  const fetchPurchaseOrders = async () => {
    if (dataLoaded.purchaseOrders) return;
    
    try {
      const poData = await getAllPurchaseOrders();
      
      // Filtrujemy tylko zamówienia o statusie innym niż "anulowane" i "zakończone"
      const filteredPOs = poData.filter(po => 
        po.status !== 'canceled' && 
        po.status !== 'closed' && 
        po.status !== 'returned'
      );
      
      console.log('Pobrano zamówienia zakupowe:', filteredPOs);
      setPurchaseOrders(filteredPOs);
      setDataLoaded(prev => ({ ...prev, purchaseOrders: true }));
    } catch (error) {
      showError('Błąd podczas pobierania zamówień zakupowych: ' + error.message);
      console.error('Error fetching purchase orders:', error);
    }
  };

  const fetchCustomerOrders = async () => {
    if (dataLoaded.customerOrders) return;
    
    try {
      const ordersData = await getAllOrders();
      
      // Filtrujemy tylko aktywne zamówienia (nie anulowane/zakończone)
      const activeOrders = ordersData.filter(order => 
        order.status !== 'Anulowane' && 
        order.status !== 'Zrealizowane'
      );
      
      console.log('Pobrano zamówienia klientów:', activeOrders);
      setCustomerOrders(activeOrders);
      setDataLoaded(prev => ({ ...prev, customerOrders: true }));
    } catch (error) {
      showError('Błąd podczas pobierania zamówień klientów: ' + error.message);
      console.error('Error fetching customer orders:', error);
    }
  };

  const fetchTask = async () => {
    try {
      const task = await getTaskById(taskId);
      
      // Konwertuj daty z Timestamp lub string na obiekty Date
      const taskWithParsedDates = {
        ...task,
        scheduledDate: task.scheduledDate ? 
          (task.scheduledDate instanceof Date ? task.scheduledDate :
           task.scheduledDate.toDate ? task.scheduledDate.toDate() : 
           new Date(task.scheduledDate)) : new Date(),
        endDate: task.endDate ? 
          (task.endDate instanceof Date ? task.endDate :
           task.endDate.toDate ? task.endDate.toDate() : 
           new Date(task.endDate)) : new Date(new Date().getTime() + 60 * 60 * 1000),
        expiryDate: task.expiryDate ? 
          (task.expiryDate instanceof Date ? task.expiryDate :
           task.expiryDate.toDate ? task.expiryDate.toDate() : 
           new Date(task.expiryDate)) : null,
        linkedPurchaseOrders: task.linkedPurchaseOrders || [],
        workingHoursPerDay: task.workingHoursPerDay || 16, // Domyślnie 16h dla istniejących zadań
        // Przenieś istniejące koszty do pól ręcznych jeśli automatyczne aktualizacje są wyłączone
        manualTotalMaterialCost: task.disableAutomaticCostUpdates && task.totalMaterialCost !== undefined 
          ? task.totalMaterialCost : '',
        manualUnitMaterialCost: task.disableAutomaticCostUpdates && task.unitMaterialCost !== undefined 
          ? task.unitMaterialCost : '',
        manualTotalFullProductionCost: task.disableAutomaticCostUpdates && task.totalFullProductionCost !== undefined 
          ? task.totalFullProductionCost : '',
        manualUnitFullProductionCost: task.disableAutomaticCostUpdates && task.unitFullProductionCost !== undefined 
          ? task.unitFullProductionCost : ''
      };
      
      console.log('Pobrane zadanie z przetworzonymi datami:', taskWithParsedDates);
      setTaskData(taskWithParsedDates);
      
      // Zapisz oryginalną ilość do wykrywania zmian
      setOriginalQuantity(task.quantity);
      
      // Zapisz oryginalne orderId do śledzenia zmian
      if (task.orderId) {
        setOriginalOrderId(task.orderId);
        setSelectedOrderItemId(task.orderItemId || '');
      }
      
      // Pobierz dodatkowe dane tylko jeśli są potrzebne
      const additionalDataPromises = [];
      
      // Jeśli zadanie ma powiązany produkt z magazynu, pobierz go
      if (task.inventoryProductId) {
        additionalDataPromises.push(
          getInventoryItemById(task.inventoryProductId).then(inventoryItem => {
            if (inventoryItem) {
              setTaskData(prev => ({
                ...prev,
                inventoryProductId: inventoryItem.id
              }));
            }
          }).catch(error => {
            console.warn('Błąd podczas pobierania produktu z magazynu:', error);
          })
        );
      }
      
      // Jeśli zadanie ma przypisaną recepturę, pobierz jej szczegóły
      if (task.recipeId) {
        additionalDataPromises.push(
          (async () => {
            try {
              let recipeData;
              
              // Sprawdź czy zadanie ma określoną wersję receptury
              if (task.recipeVersion) {
                console.log(`Ładowanie wersji ${task.recipeVersion} receptury dla MO`);
                try {
                  const versionData = await getRecipeVersion(task.recipeId, task.recipeVersion);
                  recipeData = versionData.data;
                  console.log(`Załadowano wersję ${task.recipeVersion} receptury:`, recipeData);
                } catch (versionError) {
                  console.warn(`Nie udało się pobrać wersji ${task.recipeVersion} receptury:`, versionError);
                  // Fallback do najnowszej wersji
                  recipeData = await getRecipeById(task.recipeId);
                  console.log('Załadowano najnowszą wersję receptury jako fallback');
                }
              } else {
                // Brak wersji w zadaniu - użyj najnowszej
                recipeData = await getRecipeById(task.recipeId);
                console.log('Zadanie nie ma określonej wersji - załadowano najnowszą wersję receptury');
              }
              
              if (recipeData) {
                setRecipe(recipeData);
                
                // Pobierz dostępne wersje receptury dla edycji wersji
                try {
                  const versions = await getRecipeVersions(task.recipeId);
                  setAvailableRecipeVersions(versions);
                } catch (versionsError) {
                  console.warn('Nie udało się pobrać wersji receptury:', versionsError);
                }
              }
            } catch (recipeError) {
              console.error('Błąd podczas pobierania receptury:', recipeError);
              showError('Nie udało się pobrać danych receptury');
            }
          })()
        );
      }
      
      // Wykonaj dodatkowe zapytania równolegle
      if (additionalDataPromises.length > 0) {
        await Promise.allSettled(additionalDataPromises);
      }
      
    } catch (error) {
      showError('Błąd podczas pobierania zadania: ' + error.message);
      console.error('Error fetching task:', error);
    }
  };

  // Lazy loading dla dropdown'ów - ładuj dane dopiero gdy użytkownik otwiera dropdown
  const handleDropdownOpen = useCallback((dataType) => {
    switch (dataType) {
      case 'inventoryProducts':
        if (!dataLoaded.inventoryProducts) {
          fetchInventoryProducts();
        }
        break;
      case 'purchaseOrders':
        if (!dataLoaded.purchaseOrders) {
          fetchPurchaseOrders();
        }
        break;
      default:
        break;
    }
  }, [dataLoaded]);

  // Funkcja do aktualizacji powiązanych zamówień klientów po zapisaniu ręcznych kosztów
  // Funkcja do aktualizacji powiązania MO z CO
  const updateOrderProductionTaskLink = async (taskId, oldOrderId, newOrderId, newOrderItemId) => {
    try {
      console.log('🔗 Aktualizacja powiązania MO z CO:', {
        taskId,
        oldOrderId,
        newOrderId,
        newOrderItemId
      });

      // 1. Jeśli było stare zamówienie, usuń productionTaskId z jego pozycji
      if (oldOrderId && oldOrderId !== newOrderId) {
        try {
          const oldOrder = await getOrderById(oldOrderId);
          if (oldOrder && oldOrder.items) {
            const updatedItems = oldOrder.items.map(item => {
              if (item.productionTaskId === taskId) {
                const { productionTaskId, productionTaskNumber, productionStatus, ...itemWithoutTask } = item;
                console.log(`Usunięto powiązanie MO ${taskId} z pozycji "${item.name}" w CO ${oldOrder.orderNumber}`);
                return itemWithoutTask;
              }
              return item;
            });

            // Usuń także z tablicy productionTasks jeśli istnieje
            const updatedProductionTasks = (oldOrder.productionTasks || []).filter(
              task => task.id !== taskId
            );

            await updateOrder(oldOrderId, {
              items: updatedItems,
              productionTasks: updatedProductionTasks,
              orderNumber: oldOrder.orderNumber,
              orderDate: oldOrder.orderDate,
              status: oldOrder.status,
              customer: oldOrder.customer,
              shippingCost: oldOrder.shippingCost,
              totalValue: oldOrder.totalValue,
              additionalCostsItems: oldOrder.additionalCostsItems,
              linkedPurchaseOrders: oldOrder.linkedPurchaseOrders
            }, currentUser?.uid || 'system');

            console.log(`✅ Usunięto powiązanie z CO ${oldOrder.orderNumber}`);
          }
        } catch (error) {
          // Jeśli zamówienie nie istnieje (zostało usunięte), po prostu logujemy i kontynuujemy
          if (error.message && error.message.includes('nie istnieje')) {
            console.warn(`⚠️ Stare zamówienie ${oldOrderId} już nie istnieje - pomijam usuwanie powiązania`);
          } else {
            console.error('Błąd podczas usuwania powiązania ze starego CO:', error);
          }
          // Nie przerywamy - to nie jest krytyczny błąd
        }
      }

      // 2. Jeśli jest nowe zamówienie, dodaj productionTaskId do wybranej pozycji
      if (newOrderId && newOrderItemId) {
        try {
          const newOrder = await getOrderById(newOrderId);
          if (newOrder && newOrder.items) {
            const itemIndex = newOrder.items.findIndex(item => item.id === newOrderItemId);
            
            if (itemIndex === -1) {
              throw new Error(`Nie znaleziono pozycji ${newOrderItemId} w zamówieniu ${newOrder.orderNumber}`);
            }

            // Pobierz aktualne dane zadania dla moNumber
            const task = await getTaskById(taskId);

            const updatedItems = [...newOrder.items];
            updatedItems[itemIndex] = {
              ...updatedItems[itemIndex],
              productionTaskId: taskId,
              productionTaskNumber: task.moNumber,
              productionStatus: task.status
            };

            // Dodaj także do productionTasks jeśli nie istnieje
            const productionTasks = newOrder.productionTasks || [];
            const taskExists = productionTasks.some(t => t.id === taskId);
            const updatedProductionTasks = taskExists
              ? productionTasks
              : [...productionTasks, {
                  id: taskId,
                  moNumber: task.moNumber,
                  status: task.status
                }];

            await updateOrder(newOrderId, {
              items: updatedItems,
              productionTasks: updatedProductionTasks,
              orderNumber: newOrder.orderNumber,
              orderDate: newOrder.orderDate,
              status: newOrder.status,
              customer: newOrder.customer,
              shippingCost: newOrder.shippingCost,
              totalValue: newOrder.totalValue,
              additionalCostsItems: newOrder.additionalCostsItems,
              linkedPurchaseOrders: newOrder.linkedPurchaseOrders
            }, currentUser?.uid || 'system');

            console.log(`✅ Dodano powiązanie z CO ${newOrder.orderNumber}, pozycja: ${updatedItems[itemIndex].name}`);
          }
        } catch (error) {
          console.error('Błąd podczas dodawania powiązania do nowego CO:', error);
          throw error; // Ten błąd jest krytyczny
        }
      }

      return true;
    } catch (error) {
      console.error('Błąd podczas aktualizacji powiązania MO z CO:', error);
      throw error;
    }
  };

  const updateRelatedCustomerOrders = async (taskId, totalMaterialCost, totalFullProductionCost) => {
    try {
      // Dynamicznie importuj potrzebne funkcje
      const { getOrdersByProductionTaskId, updateOrder, calculateOrderTotal } = await import('../../services/orderService');
      const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/costCalculator');
      
      // Pobierz tylko zamówienia powiązane z tym zadaniem
      const relatedOrders = await getOrdersByProductionTaskId(taskId);
      
      if (relatedOrders.length === 0) {
        console.log('Brak zamówień powiązanych z tym zadaniem');
        return;
      }
      
      console.log(`Znaleziono ${relatedOrders.length} zamówień do zaktualizowania`);
      
      // Przygotuj wszystkie aktualizacje równolegle
      const updatePromises = relatedOrders.map(async (order) => {
        let orderUpdated = false;
        const updatedItems = [...order.items];
        
        for (let i = 0; i < updatedItems.length; i++) {
          const item = updatedItems[i];
          
          if (item.productionTaskId === taskId) {
            // Oblicz koszty jednostkowe z uwzględnieniem logiki listy cenowej
            const calculatedFullProductionUnitCost = calculateFullProductionUnitCost(item, totalFullProductionCost);
            const calculatedProductionUnitCost = calculateProductionUnitCost(item, totalMaterialCost);
            
            updatedItems[i] = {
              ...item,
              productionCost: totalMaterialCost,
              fullProductionCost: totalFullProductionCost,
              productionUnitCost: calculatedProductionUnitCost,
              fullProductionUnitCost: calculatedFullProductionUnitCost
            };
            orderUpdated = true;
            
            console.log(`Zaktualizowano pozycję "${item.name}" w zamówieniu ${order.orderNumber}: koszt=${totalMaterialCost.toFixed(4)}€, pełny koszt=${totalFullProductionCost.toFixed(4)}€`);
          }
        }
        
        if (orderUpdated) {
          // Przelicz nową wartość zamówienia używając prawidłowej funkcji
          // która uwzględnia koszty produkcji, dostawę, dodatkowe koszty i rabaty
          const totalValue = calculateOrderTotal(
            updatedItems,
            order.shippingCost,
            order.additionalCostsItems
          );
          
          const orderData = {
            items: updatedItems,
            totalValue: totalValue
          };
          
          // Zaktualizuj zamówienie w bazie danych
          await updateOrder(order.id, orderData, currentUser?.uid || 'system');
          console.log(`Zaktualizowano zamówienie ${order.orderNumber}, nowa wartość: ${totalValue.toFixed(2)}€`);
          
          return { orderId: order.id, orderNumber: order.orderNumber, updated: true };
        }
        
        return { orderId: order.id, orderNumber: order.orderNumber, updated: false };
      });
      
      // Wykonaj wszystkie aktualizacje równolegle
      const results = await Promise.all(updatePromises);
      const updatedCount = results.filter(r => r.updated).length;
      
      console.log(`Zaktualizowano koszty w ${updatedCount} z ${relatedOrders.length} zamówień`);
      
    } catch (error) {
      console.error('Błąd podczas aktualizacji zamówień klientów:', error);
      throw error;
    }
  };

  // Funkcja walidacji i aktualizacji numeru MO
  const validateAndUpdateMO = async (newMO) => {
    setMOValidationError('');
    
    // Walidacja formatu
    if (!newMO.match(/^MO\d{5}$/)) {
      setMOValidationError('Numer MO musi być w formacie MO00000 (np. MO00123)');
      return false;
    }
    
    // Sprawdź duplikaty
    try {
      const allMO = await getAllMONumbers();
      const isDuplicate = allMO.some(mo => mo.moNumber === newMO && mo.id !== taskId);
      
      if (isDuplicate) {
        setMOValidationError(`Numer ${newMO} już istnieje w systemie`);
        return false;
      }
      
      // Zaktualizuj numer MO w stanie
      const oldMO = taskData.moNumber;
      const oldMONumericPart = oldMO.replace('MO', '');
      const newMONumericPart = newMO.replace('MO', '');
      
      // Jeśli lotNumber bazował na starym MO, zaproponuj aktualizację
      let newLotNumber = taskData.lotNumber;
      if (taskData.lotNumber === `SN${oldMONumericPart}`) {
        newLotNumber = `SN${newMONumericPart}`;
      }
      
      setTaskData(prev => ({
        ...prev,
        moNumber: newMO,
        lotNumber: newLotNumber
      }));
      
      setEditingMO(false);
      showSuccess(`Numer MO zmieniony na ${newMO}. Pamiętaj o zapisaniu zmian.`);
      return true;
    } catch (error) {
      console.error('Błąd podczas walidacji MO:', error);
      setMOValidationError('Błąd podczas sprawdzania numeru MO');
      return false;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (saving) return;
    
    // Sprawdź czy ilość się zmieniła (tylko w trybie edycji)
    if (taskId && taskId !== 'new' && originalQuantity !== null) {
      const currentQuantity = parseFloat(taskData.quantity);
      const origQty = parseFloat(originalQuantity);
      
      // Jeśli ilość się zmieniła i są materiały do przeliczenia
      if (Math.abs(currentQuantity - origQty) > 0.001 && recipe && taskData.materials?.length > 0) {
        // Sprawdź czy zadanie ma potwierdzoną konsumpcję (blokada przeliczania)
        const hasConsumption = taskData.materialConsumptionConfirmed === true ||
          (taskData.consumedMaterials && taskData.consumedMaterials.length > 0) ||
          (taskData.status === 'Potwierdzenie zużycia');

        // Jeśli NIE ma konsumpcji, pokaż dialog wyboru (rezerwacje nie blokują)
        if (!hasConsumption) {
          setPendingSubmitEvent(e);
          setQuantityChangeDialogOpen(true);
          return; // Przerwij - czekamy na decyzję użytkownika
        }
      }
    }
    
    // Kontynuuj normalny zapis
    await performSubmit(e, null);
  };

  const performSubmit = async (e, shouldRecalculate) => {
    if (e) e.preventDefault();
    
    try {
      setSaving(true);
      
      // Jeśli użytkownik wybrał przeliczenie materiałów
      if (shouldRecalculate && recipe && taskData.quantity) {
        const newQuantity = parseFloat(taskData.quantity);
        
        if (recipe.ingredients && recipe.ingredients.length > 0 && taskData.materials?.length > 0) {
          // Przelicz obecną ilość (actualMaterialUsage) zamiast oryginalnej ilości (quantity)
          const updatedActualUsage = { ...(taskData.actualMaterialUsage || {}) };
          
          taskData.materials.forEach(material => {
            // Znajdź odpowiadający składnik z receptury
            const ingredientFromRecipe = recipe.ingredients.find(ing => 
              ing.id === material.id || 
              ing.inventoryItemId === material.inventoryItemId ||
              ing.inventoryItemId === material.id
            );
            
            if (ingredientFromRecipe) {
              // Przelicz ilość na podstawie receptury i nowej ilości produktu
              updatedActualUsage[material.id] = preciseMultiply(ingredientFromRecipe.quantity || 0, newQuantity);
            }
          });
          
          // Aktualizuj actualMaterialUsage przed zapisem
          setTaskData(prev => ({
            ...prev,
            actualMaterialUsage: updatedActualUsage
          }));
          
          // Zaktualizuj taskData.actualMaterialUsage bezpośrednio dla dalszej części funkcji
          taskData.actualMaterialUsage = updatedActualUsage;
        }
      }
      
      // Walidacja danych zadania
      if (!taskData.productName) {
        showError('Nazwa produktu jest wymagana');
        setSaving(false);
        return;
      }
      
      // Upewnij się, że daty są prawidłowymi obiektami Date
      const formattedData = {
        ...taskData,
        scheduledDate: taskData.scheduledDate instanceof Date ? 
          taskData.scheduledDate : new Date(taskData.scheduledDate),
        endDate: taskData.endDate instanceof Date ? 
          taskData.endDate : new Date(taskData.endDate)
      };

      // Wyczyść customer z potencjalnych Timestamp'ów (mogą być z getAllOrders)
      if (formattedData.customer && typeof formattedData.customer === 'object') {
        const cleanCustomer = {};
        // Kopiuj tylko pola tekstowe, pomijaj wszystko co jest obiektem lub datą
        for (const [key, value] of Object.entries(formattedData.customer)) {
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
            cleanCustomer[key] = value;
          }
        }
        formattedData.customer = cleanCustomer;
      }

      // Jeśli automatyczne aktualizacje kosztów są wyłączone i wprowadzono ręczne koszty,
      // zapisz je jako rzeczywiste koszty zadania
      if (taskData.disableAutomaticCostUpdates) {
        if (taskData.manualTotalMaterialCost !== '') {
          formattedData.totalMaterialCost = parseFloat(taskData.manualTotalMaterialCost);
        }
        if (taskData.manualUnitMaterialCost !== '') {
          formattedData.unitMaterialCost = parseFloat(taskData.manualUnitMaterialCost);
        }
        if (taskData.manualTotalFullProductionCost !== '') {
          formattedData.totalFullProductionCost = parseFloat(taskData.manualTotalFullProductionCost);
        }
        if (taskData.manualUnitFullProductionCost !== '') {
          formattedData.unitFullProductionCost = parseFloat(taskData.manualUnitFullProductionCost);
        }
      }
      
      let savedTaskId;
      
      if (taskId) {
        // ZABEZPIECZENIE 1: Jeśli edytujemy zadanie z powiązaniem, ale zamówienia nie zostały załadowane,
        // zachowaj istniejące pola powiązania aby uniknąć przypadkowego usunięcia
        if (!dataLoaded.customerOrders && taskData.orderId) {
          formattedData.orderId = taskData.orderId;
          formattedData.orderNumber = taskData.orderNumber;
          formattedData.orderItemId = taskData.orderItemId;
          formattedData.customer = taskData.customer;
          console.log('🛡️ Zachowano istniejące powiązanie z zamówieniem (zamówienia nie zostały jeszcze załadowane)');
        }
        
        // Aktualizacja zadania
        await updateTask(taskId, formattedData, currentUser.uid);
        savedTaskId = taskId;
        
        // ZABEZPIECZENIE 2: Sprawdź czy zmieniono powiązanie z zamówieniem klienta
        // WAŻNE: Tylko jeśli dane zamówień zostały załadowane!
        const newOrderId = selectedCustomerOrder?.id || null;
        const orderLinkChanged = dataLoaded.customerOrders && (
          originalOrderId !== newOrderId || 
          (newOrderId && taskData.orderItemId !== selectedOrderItemId)
        );
        
        if (orderLinkChanged) {
          try {
            console.log('🔄 Wykryto zmianę powiązania z CO');
            
            // ZABEZPIECZENIE 3: Jeśli newOrderId jest null ale originalOrderId istnieje,
            // sprawdź czy użytkownik faktycznie chciał usunąć powiązanie
            if (!newOrderId && originalOrderId) {
              console.warn('⚠️ Próba usunięcia powiązania z zamówieniem - to jest zamierzona akcja użytkownika');
            }
            
            await updateOrderProductionTaskLink(
              taskId,
              originalOrderId,
              newOrderId,
              selectedOrderItemId
            );
            
            // Zaktualizuj pola w zadaniu - używamy update bezpośrednio zamiast updateTask
            // aby uniknąć problemów z mergowaniem złych dat
            try {
              const { doc, updateDoc } = await import('firebase/firestore');
              const { db } = await import('../../services/firebase/config');
              
              const orderUpdateData = {};
              if (newOrderId && selectedOrderItemId) {
                const selectedItem = selectedCustomerOrder.items.find(item => item.id === selectedOrderItemId);
                orderUpdateData.orderId = newOrderId;
                orderUpdateData.orderNumber = String(selectedCustomerOrder.orderNumber || '');
                orderUpdateData.orderItemId = String(selectedOrderItemId);
                
                // Kopiuj tylko bezpieczne pola klienta (TYLKO stringi, bez dat i obiektów)
                if (selectedCustomerOrder.customer) {
                  const customer = selectedCustomerOrder.customer;
                  orderUpdateData.customer = {
                    id: String(customer.id || ''),
                    name: String(customer.name || ''),
                    email: String(customer.email || ''),
                    phone: String(customer.phone || ''),
                    address: String(customer.address || ''),
                    shippingAddress: String(customer.shippingAddress || ''),
                    vatEu: String(customer.vatEu || ''),
                    billingAddress: String(customer.billingAddress || ''),
                    orderAffix: String(customer.orderAffix || ''),
                    notes: String(customer.notes || '')
                  };
                }
                
                console.log(`Zaktualizowano powiązanie MO ${taskId} z CO ${selectedCustomerOrder.orderNumber}, pozycja: ${selectedItem?.name}`);
                console.log('Dane do aktualizacji zadania:', JSON.stringify(orderUpdateData, null, 2));
              } else {
                // Usuwamy powiązanie (tylko jeśli to zamierzona akcja)
                orderUpdateData.orderId = null;
                orderUpdateData.orderNumber = null;
                orderUpdateData.orderItemId = null;
                orderUpdateData.customer = null;
                
                console.log(`Usunięto powiązanie MO ${taskId} z zamówieniem klienta`);
              }
              
              // Bezpośrednie wywołanie updateDoc, aby uniknąć problemów z updateTask
              const taskRef = doc(db, 'productionTasks', taskId);
              await updateDoc(taskRef, orderUpdateData);
              
              console.log('✅ Pomyślnie zaktualizowano pola powiązania w bazie danych');
            } catch (updateError) {
              console.error('Błąd podczas bezpośredniej aktualizacji pól powiązania:', updateError);
              throw updateError;
            }
            showSuccess('Zadanie i powiązanie z zamówieniem zostały zaktualizowane');
          } catch (error) {
            console.error('Błąd podczas aktualizacji powiązania z CO:', error);
            showWarning('Zadanie zapisane, ale nie udało się zaktualizować powiązania z zamówieniem: ' + error.message);
          }
        }
        
        // Jeśli zapisano ręczne koszty, zaktualizuj powiązane zamówienia klientów
        if (taskData.disableAutomaticCostUpdates && 
            (taskData.manualTotalMaterialCost !== '' || taskData.manualTotalFullProductionCost !== '')) {
          try {
            await updateRelatedCustomerOrders(
              taskId,
              parseFloat(taskData.manualTotalMaterialCost) || 0,
              parseFloat(taskData.manualTotalFullProductionCost) || 0
            );
          } catch (error) {
            console.error('Błąd podczas aktualizacji zamówień klientów:', error);
            // Nie przerywamy procesu - pokazujemy tylko ostrzeżenie
            showWarning('Zadanie zapisane, ale nie udało się zaktualizować powiązanych zamówień: ' + error.message);
          }
        }
        
        if (!orderLinkChanged) {
          showSuccess('Zadanie zostało zaktualizowane');
        }
      } else {
        // Utworzenie nowego zadania
        const newTask = await createTask(formattedData, currentUser.uid);
        savedTaskId = newTask.id;
        showSuccess('Zadanie zostało utworzone');
        
        // Wyczyść cache aby nowe zadanie było widoczne na liście
        clearProductionTasksCache();
      }
      
      // Sprawdź czy jest parametr returnTo w URL
      const searchParams = new URLSearchParams(location.search);
      const returnTo = searchParams.get('returnTo');
      
      if (returnTo && taskId) {
        // Jeśli edytujemy zadanie i jest parametr returnTo, wróć do szczegółów zadania
        navigate(`/production/tasks/${taskId}`);
      } else {
        // W przeciwnym przypadku idź do listy zadań
        navigate('/production');
      }
    } catch (error) {
      showError('Błąd podczas zapisywania zadania: ' + error.message);
      console.error('Error saving task:', error);
    } finally {
      setSaving(false);
      // Zresetuj stan dialogu
      setQuantityChangeDialogOpen(false);
      setPendingSubmitEvent(null);
      setRecalculateMaterialsChoice(null);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setTaskData(prev => ({ ...prev, [name]: value }));
  };

  // Funkcja sprawdzająca czy zadanie może być zaktualizowane do nowej wersji receptury
  const canUpdateRecipeVersion = () => {
    if (!taskId || taskId === 'new') {
      return false; // Nie można aktualizować nowego zadania
    }

    // Sprawdź czy zadanie ma materiały z rezerwacjami
    const hasReservations = taskData.materialBatches && 
      Object.keys(taskData.materialBatches).length > 0 &&
      Object.values(taskData.materialBatches).some(batches => 
        batches && batches.length > 0 && 
        batches.some(batch => batch.quantity > 0)
      );

    // Sprawdź czy zadanie ma potwierdzoną konsumpcję lub skonsumowane materiały
    const hasConsumption = taskData.materialConsumptionConfirmed === true ||
      (taskData.consumedMaterials && taskData.consumedMaterials.length > 0) ||
      (taskData.status === 'Potwierdzenie zużycia');

    return !hasReservations && !hasConsumption;
  };

  // Funkcja otwierająca dialog wyboru wersji receptury
  const handleOpenVersionDialog = async () => {
    if (!taskData.recipeId) {
      showError('Brak przypisanej receptury do zadania');
      return;
    }

    try {
      setLoadingVersions(true);
      const versions = await getRecipeVersions(taskData.recipeId);
      
      // Filtruj wersje nowsze niż aktualna
      const currentVersion = taskData.recipeVersion || 1;
      const newerVersions = versions.filter(v => v.version > currentVersion);
      
      if (newerVersions.length === 0) {
        showWarning('Brak nowszych wersji receptury');
        return;
      }

      setAvailableVersions(newerVersions);
      setRecipeVersionDialogOpen(true);
    } catch (error) {
      console.error('Błąd podczas pobierania wersji receptury:', error);
      showError('Nie udało się pobrać wersji receptury: ' + error.message);
    } finally {
      setLoadingVersions(false);
    }
  };

  // Funkcja aktualizująca zadanie do nowej wersji receptury
  const handleUpdateRecipeVersion = async () => {
    if (!selectedVersion) {
      showError('Nie wybrano wersji receptury');
      return;
    }

    try {
      setUpdatingRecipe(true);
      
      // Pobierz dane wybranej wersji receptury
      const versionData = await getRecipeVersion(taskData.recipeId, selectedVersion.version);
      const recipeData = versionData.data;
      
      // Aktualizuj dane zadania na podstawie nowej wersji receptury
      const updatedTaskData = {
        ...taskData,
        recipeVersion: selectedVersion.version,
        recipeName: recipeData.name
      };

      // Jeśli receptura ma output, zaktualizuj dane produktu
      if (recipeData.output && recipeData.output.name) {
        updatedTaskData.productName = recipeData.output.name;
        updatedTaskData.unit = recipeData.output.unit || 'szt.';
      }

      // Aktualizuj materiały z nowej wersji receptury
      if (recipeData.ingredients && recipeData.ingredients.length > 0) {
        const taskQuantity = parseFloat(taskData.quantity) || 1;
        updatedTaskData.materials = recipeData.ingredients.map(ingredient => ({
          id: ingredient.inventoryItemId || ingredient.id,
          name: ingredient.name,
          category: ingredient.category || 'Surowce',
          quantity: preciseMultiply(ingredient.quantity || 0, taskQuantity),
          unit: ingredient.unit || 'szt.',
          inventoryItemId: ingredient.inventoryItemId || ingredient.id
        }));
      } else {
        // Jeśli nowa wersja receptury nie ma składników, wyczyść materiały
        updatedTaskData.materials = [];
      }

      // Aktualizuj czas produkcji
      if (recipeData.productionTimePerUnit) {
        const productionTimePerUnit = parseFloat(recipeData.productionTimePerUnit);
        updatedTaskData.productionTimePerUnit = productionTimePerUnit;
        
        const quantity = parseFloat(taskData.quantity) || 0;
        if (quantity > 0) {
          updatedTaskData.estimatedDuration = (productionTimePerUnit * quantity).toFixed(2);
        }
      }

      // Aktualizuj dane receptury
      setTaskData(updatedTaskData);
      setRecipe(recipeData);
      
      // Wyczyść błędy wydajności receptury
      setRecipeYieldError(false);
      
      // Zamknij dialog
      setRecipeVersionDialogOpen(false);
      setSelectedVersion(null);
      
      showSuccess(`Zadanie zostało zaktualizowane do wersji ${selectedVersion.version} receptury`);
      
    } catch (error) {
      console.error('Błąd podczas aktualizacji wersji receptury:', error);
      showError('Nie udało się zaktualizować wersji receptury: ' + error.message);
    } finally {
      setUpdatingRecipe(false);
    }
  };

  const handleRecipeChange = async (e) => {
    const recipeId = e.target.value;
    setTaskData(prev => ({
      ...prev,
      recipeId
    }));

    if (!recipeId) {
      setRecipe(null);
      return;
    }

    try {
      // Sprawdź czy receptura jest już załadowana w pamięci
      const existingRecipe = recipes.find(r => r.id === recipeId);
      let selectedRecipe;
      
      if (existingRecipe) {
        // Użyj już załadowanej receptury
        selectedRecipe = existingRecipe;
      } else {
        // Sprawdź cache
        const cachedRecipe = getCachedData(`recipe_${recipeId}`);
        if (cachedRecipe) {
          selectedRecipe = cachedRecipe;
        } else {
          // Pobierz z serwera jako ostatnia opcja
          selectedRecipe = await getRecipeById(recipeId);
          setCachedData(`recipe_${recipeId}`, selectedRecipe);
        }
      }
      
      setRecipe(selectedRecipe);
      
      // Ustaw nazwę produktu z receptury oraz informacje o wersji
      if (selectedRecipe.output && selectedRecipe.output.name) {
        setTaskData(prev => ({
          ...prev,
          productName: selectedRecipe.output.name,
          unit: selectedRecipe.output.unit || 'szt.',
          recipeVersion: selectedRecipe.version || 1,
          recipeName: selectedRecipe.name || selectedRecipe.output.name,
          processingCostPerUnit: selectedRecipe.processingCostPerUnit || 0
        }));
      } else {
        // Jeśli nie ma output, ustaw tylko wersję i nazwę receptury
        setTaskData(prev => ({
          ...prev,
          recipeVersion: selectedRecipe.version || 1,
          recipeName: selectedRecipe.name,
          processingCostPerUnit: selectedRecipe.processingCostPerUnit || 0
        }));
      }
      
      // Przygotuj listę materiałów z receptury
      if (selectedRecipe.ingredients && selectedRecipe.ingredients.length > 0) {
        const taskQuantity = parseFloat(taskData.quantity) || 1;
        const materials = selectedRecipe.ingredients.map(ingredient => ({
          id: ingredient.id,
          name: ingredient.name,
          category: ingredient.category || 'Surowce',
          quantity: preciseMultiply(ingredient.quantity || 0, taskQuantity),
          unit: ingredient.unit || 'szt.'
        }));
        
        setTaskData(prev => ({
          ...prev,
          materials
        }));
      }
      
      // Ustawienie czasu produkcji na podstawie danych z receptury
      let productionTimePerUnit = 0;
      if (selectedRecipe.productionTimePerUnit) {
        productionTimePerUnit = parseFloat(selectedRecipe.productionTimePerUnit);
      } else if (selectedRecipe.preparationTime) {
        // Jeśli brakuje productionTimePerUnit, ale jest preparationTime, użyj tego jako podstawy
        productionTimePerUnit = parseFloat(selectedRecipe.preparationTime);
      }
      
      // Ustaw całkowitą szacowaną długość w zależności od ilości i czasu produkcji na jednostkę
      if (productionTimePerUnit > 0) {
        const quantity = parseFloat(taskData.quantity) || 0;
        const estimatedDuration = (productionTimePerUnit * quantity).toFixed(2);
        
        setTaskData(prev => ({
          ...prev,
          productionTimePerUnit,
          estimatedDuration
        }));
      }
      
      // Ustawienie domyślnego stanowiska produkcyjnego z receptury, jeśli zostało zdefiniowane
      if (selectedRecipe.defaultWorkstationId) {
        setTaskData(prev => ({
          ...prev,
          workstationId: selectedRecipe.defaultWorkstationId
        }));
      }
      
    } catch (error) {
      showError('Błąd podczas pobierania receptury: ' + error.message);
      console.error('Error fetching recipe:', error);
    }
  };

  const handleDateChange = (newDate) => {
    setTaskData(prev => {
      // Pobierz aktualny czas produkcji w minutach
      const productionTimeMinutes = prev.estimatedDuration || 0;
      
      // Oblicz nową datę zakończenia z uwzględnieniem godzin pracy zakładu
      const endDateWithWorkingHours = calculateEndDateWithWorkingHours(
        newDate, 
        productionTimeMinutes, 
        prev.workingHoursPerDay || 16
      );
      
      return {
        ...prev,
        scheduledDate: newDate,
        endDate: endDateWithWorkingHours
      };
    });
  };

  const handleEndDateChange = (newDate) => {
    // Oblicz czas produkcji z uwzględnieniem godzin pracy zakładu
    const durationInMinutes = calculateProductionTimeWithWorkingHours(
      taskData.scheduledDate, 
      newDate, 
      taskData.workingHoursPerDay || 16
    );
    
    setTaskData(prev => ({
      ...prev,
      endDate: newDate,
      estimatedDuration: durationInMinutes
    }));
  };

  // Dodajemy pole do ustawiania czasu produkcji na jednostkę
  const handleProductionTimePerUnitChange = (e) => {
    const newProductionTime = e.target.value === '' ? '' : Number(e.target.value);
    
    setTaskData(prev => ({
      ...prev,
      productionTimePerUnit: newProductionTime
    }));
    
    // Aktualizuj szacowany czas produkcji tylko jeśli mamy właściwą ilość
    if (newProductionTime !== '' && taskData.quantity && taskData.quantity > 0) {
      const estimatedTimeMinutes = newProductionTime * taskData.quantity;
      
      setTaskData(prev => ({
        ...prev,
        estimatedDuration: estimatedTimeMinutes
      }));
      
      // Zaktualizuj datę zakończenia z uwzględnieniem godzin pracy zakładu
      if (taskData.scheduledDate) {
        const startDate = new Date(taskData.scheduledDate);
        const endDateWithWorkingHours = calculateEndDateWithWorkingHours(
          startDate, 
          estimatedTimeMinutes, 
          taskData.workingHoursPerDay || 16
        );
        setTaskData(prev => ({
          ...prev,
          endDate: endDateWithWorkingHours
        }));
      }
    }
  };
  
  // Handler dla zmiany godzin pracy zakładu
  const handleWorkingHoursChange = (e) => {
    const newWorkingHours = parseInt(e.target.value) || 16;
    
    setTaskData(prev => ({
      ...prev,
      workingHoursPerDay: newWorkingHours
    }));
    
    // Przelicz datę zakończenia z nowymi godzinami pracy
    if (taskData.scheduledDate && taskData.estimatedDuration) {
      const startDate = new Date(taskData.scheduledDate);
      const endDateWithWorkingHours = calculateEndDateWithWorkingHours(
        startDate, 
        taskData.estimatedDuration, 
        newWorkingHours
      );
      
      setTaskData(prev => ({
        ...prev,
        endDate: endDateWithWorkingHours
      }));
    }
  };

  const handleDurationChange = (e) => {
    const durationInHours = parseFloat(e.target.value);
    if (!isNaN(durationInHours) && durationInHours >= 0) {
      // Przelicz godziny na minuty i zapisz w stanie
      const durationInMinutes = durationInHours * 60;
      
      // Aktualizacja endDate na podstawie scheduledDate i podanego czasu trwania w minutach
      // Oblicz datę zakończenia z uwzględnieniem godzin pracy zakładu
      const endDateWithWorkingHours = calculateEndDateWithWorkingHours(
        taskData.scheduledDate, 
        durationInMinutes, 
        taskData.workingHoursPerDay || 16
      );
      
      setTaskData(prev => ({
        ...prev,
        estimatedDuration: durationInMinutes,
        endDate: endDateWithWorkingHours
      }));
    } else {
      setTaskData(prev => ({
        ...prev,
        estimatedDuration: e.target.value
      }));
    }
  };

  // Funkcja do automatycznego przeliczenia czasu pracy z receptury
  const handleCalculateTimeFromRecipe = async () => {
    if (!recipe) {
      showError('Najpierw wybierz recepturę');
      return;
    }

    if (!taskData.quantity || taskData.quantity <= 0) {
      showError('Najpierw wprowadź prawidłową ilość do wyprodukowania');
      return;
    }

    try {
      // Receptura jest już załadowana w odpowiedniej wersji przez fetchTask
      let recipeToUse = recipe;
      let versionInfo = '';

      // Określ wersję receptury do wyświetlenia
      if (taskData.recipeVersion) {
        versionInfo = ` (wersja ${taskData.recipeVersion})`;
      } else if (recipe.version) {
        versionInfo = ` (wersja ${recipe.version})`;
      }

      console.log(`Przeliczam czas z receptury${versionInfo}:`, {
        recipeVersion: recipe.version,
        taskRecipeVersion: taskData.recipeVersion,
        productionTimePerUnit: recipe.productionTimePerUnit
      });

      // Pobierz czas produkcji na jednostkę z odpowiedniej wersji receptury
      let productionTimePerUnit = 0;
      if (recipeToUse.productionTimePerUnit) {
        productionTimePerUnit = parseFloat(recipeToUse.productionTimePerUnit);
      } else if (recipeToUse.preparationTime) {
        productionTimePerUnit = parseFloat(recipeToUse.preparationTime);
      } else if (recipeToUse.prepTime) {
        productionTimePerUnit = parseFloat(recipeToUse.prepTime);
      }

      if (productionTimePerUnit <= 0) {
        showWarning(`Receptura${versionInfo} nie ma zdefiniowanego czasu produkcji na jednostkę`);
        return;
      }

      // Oblicz całkowity czas produkcji
      const totalProductionTime = productionTimePerUnit * taskData.quantity;

      // Zaktualizuj formularz
      setTaskData(prev => ({
        ...prev,
        productionTimePerUnit: productionTimePerUnit,
        estimatedDuration: totalProductionTime
      }));

      // Zaktualizuj datę zakończenia z uwzględnieniem godzin pracy zakładu
      if (taskData.scheduledDate) {
        const startDate = new Date(taskData.scheduledDate);
        const endDateWithWorkingHours = calculateEndDateWithWorkingHours(
          startDate, 
          totalProductionTime, 
          taskData.workingHoursPerDay || 16
        );
        setTaskData(prev => ({
          ...prev,
          endDate: endDateWithWorkingHours
        }));
      }

      showSuccess(`Przeliczono czas pracy${versionInfo}: ${productionTimePerUnit} min/szt. × ${taskData.quantity} szt. = ${totalProductionTime.toFixed(2)} minut (${(totalProductionTime / 60).toFixed(2)} godzin)`);
    } catch (error) {
      console.error('Błąd podczas przeliczania czasu z receptury:', error);
      showError('Błąd podczas przeliczania czasu z receptury');
    }
  };

  // Funkcja do aktualizacji kosztów przy zmianie ilości
  const handleQuantityChange = (e) => {
    const newQuantity = e.target.value === '' ? '' : Number(e.target.value);
    
    setTaskData(prev => ({
      ...prev,
      quantity: newQuantity
    }));
    
    // Aktualizuj tylko czas produkcji i datę zakończenia (BEZ materiałów)
    // Materiały będą przeliczone automatycznie podczas zapisu MO
    if (newQuantity !== '' && recipe) {
      // Pobierz czas produkcji na jednostkę
      const productionTimePerUnit = taskData.productionTimePerUnit || 
        (recipe.productionTimePerUnit ? parseFloat(recipe.productionTimePerUnit) : 0);
      
      // Oblicz całkowity czas produkcji w minutach
      const estimatedTimeMinutes = productionTimePerUnit * newQuantity;
      
      setTaskData(prev => ({
        ...prev,
        estimatedDuration: estimatedTimeMinutes
      }));
      
      // Zaktualizuj datę zakończenia z uwzględnieniem godzin pracy zakładu
      if (taskData.scheduledDate) {
        const startDate = new Date(taskData.scheduledDate);
        const endDateWithWorkingHours = calculateEndDateWithWorkingHours(
          startDate, 
          estimatedTimeMinutes, 
          taskData.workingHoursPerDay || 16
        );
        setTaskData(prev => ({
          ...prev,
          endDate: endDateWithWorkingHours
        }));
      }
    }
  };

  // Dodajemy funkcję do generowania numeru LOT
  const generateLot = async () => {
    try {
      // Użyj istniejącej funkcji generującej numery LOT
      const lotNumber = await generateLOTNumber();
      setTaskData(prev => ({
        ...prev,
        lotNumber
      }));
    } catch (error) {
      console.error('Błąd podczas generowania numeru LOT:', error);
      showError('Nie udało się wygenerować numeru LOT');
    }
  };

  // Dodawanie powiązania z zamówieniem zakupowym
  const handleAddPurchaseOrderLink = () => {
    if (!selectedPurchaseOrder) {
      showError('Wybierz zamówienie zakupowe do powiązania');
      return;
    }
    
    // Sprawdź, czy zamówienie nie jest już powiązane
    if (taskData.linkedPurchaseOrders && taskData.linkedPurchaseOrders.some(po => po.id === selectedPurchaseOrder.id)) {
      showWarning('To zamówienie jest już powiązane z tym zadaniem');
      return;
    }
    
    setTaskData(prev => ({
      ...prev,
      linkedPurchaseOrders: [
        ...(prev.linkedPurchaseOrders || []),
        {
          id: selectedPurchaseOrder.id,
          number: selectedPurchaseOrder.number,
          supplierName: selectedPurchaseOrder.supplier?.name || 'Nieznany dostawca'
        }
      ]
    }));
    
    setSelectedPurchaseOrder(null);
  };
  
  // Usuwanie powiązania z zamówieniem zakupowym
  const handleRemovePurchaseOrderLink = (poId) => {
    setTaskData(prev => ({
      ...prev,
      linkedPurchaseOrders: prev.linkedPurchaseOrders && prev.linkedPurchaseOrders.length > 0
        ? prev.linkedPurchaseOrders.filter(po => po.id !== poId)
        : []
    }));
  };

  // Funkcja do odświeżania nazwy produktu z powiązanego zamówienia
  const handleRefreshProductName = async () => {
    if (!taskData.orderId || !taskData.orderItemId) {
      showWarning('To zadanie nie jest powiązane z zamówieniem klienta');
      return;
    }

    try {
      setRefreshingProductName(true);
      
      // Pobierz zamówienie
      const order = await getOrderById(taskData.orderId);
      
      if (!order || !order.items || !Array.isArray(order.items)) {
        showError('Nie znaleziono zamówienia lub pozycji zamówienia');
        return;
      }
      
      // Znajdź pozycję zamówienia odpowiadającą temu zadaniu
      const orderItem = order.items.find(item => item.id === taskData.orderItemId);
      
      if (!orderItem) {
        showError('Nie znaleziono pozycji zamówienia powiązanej z tym zadaniem');
        return;
      }
      
      const currentProductName = taskData.productName || '';
      const newProductName = orderItem.name || '';
      
      if (currentProductName === newProductName) {
        showSuccess('Nazwa produktu jest już aktualna');
        return;
      }
      
      // Zaktualizuj nazwę produktu
      setTaskData(prev => ({
        ...prev,
        productName: newProductName
      }));
      
      // Poinformuj użytkownika o różnych sytuacjach
      if (taskData.inventoryProductId) {
        showSuccess(`Zaktualizowano nazwę produktu z zamówienia: "${currentProductName}" → "${newProductName}"\n\nUwaga: Nazwa została nadpisana względem produktu z magazynu. Zapisz zadanie aby zachować zmiany.`);
      } else {
        showSuccess(`Zaktualizowano nazwę produktu: "${currentProductName}" → "${newProductName}"`);
      }
      
    } catch (error) {
      console.error('Błąd podczas odświeżania nazwy produktu:', error);
      showError('Nie udało się odświeżyć nazwy produktu: ' + error.message);
    } finally {
      setRefreshingProductName(false);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="md">
        <Paper elevation={3} sx={{ p: 3, mt: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 4 }}>
            <CircularProgress size={40} sx={{ mb: 2 }} />
            <Typography variant="h6" color="text.secondary">
              {taskId && taskId !== 'new' ? 'Ładowanie zadania...' : 'Przygotowywanie formularza...'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Może to potrwać chwilę
            </Typography>
          </Box>
        </Paper>
      </Container>
    );
  }

  return (
    <>
      {/* Dialog wyboru przeliczania materiałów */}
      <Dialog
        open={quantityChangeDialogOpen}
        onClose={() => {
          setQuantityChangeDialogOpen(false);
          setPendingSubmitEvent(null);
          setSaving(false);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalculateIcon color="primary" />
            <Typography variant="h6">Zmiana ilości produktu</Typography>
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            <AlertTitle>Wykryto zmianę ilości</AlertTitle>
            <Typography variant="body2">
              Ilość produktu zmieniła się z <strong>{originalQuantity}</strong> na <strong>{taskData.quantity}</strong> {taskData.unit}.
            </Typography>
          </Alert>
          
          <Typography variant="body1" gutterBottom>
            Jak chcesz zaktualizować ilości materiałów?
          </Typography>
          
          <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <Paper
              elevation={recalculateMaterialsChoice === 'recalculate' ? 4 : 1}
              sx={{
                p: 2,
                cursor: 'pointer',
                border: recalculateMaterialsChoice === 'recalculate' ? 2 : 1,
                borderColor: recalculateMaterialsChoice === 'recalculate' ? 'primary.main' : 'divider',
                '&:hover': { borderColor: 'primary.main' }
              }}
              onClick={() => setRecalculateMaterialsChoice('recalculate')}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Checkbox
                  checked={recalculateMaterialsChoice === 'recalculate'}
                  color="primary"
                />
                <Box>
                  <Typography variant="subtitle1" fontWeight="bold">
                    Przeliczyć obecne ilości materiałów
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Obecne ilości materiałów zostaną przeliczone proporcjonalnie do nowej ilości produktu zgodnie z recepturą.
                  </Typography>
                </Box>
              </Box>
            </Paper>
            
            <Paper
              elevation={recalculateMaterialsChoice === 'keep' ? 4 : 1}
              sx={{
                p: 2,
                cursor: 'pointer',
                border: recalculateMaterialsChoice === 'keep' ? 2 : 1,
                borderColor: recalculateMaterialsChoice === 'keep' ? 'primary.main' : 'divider',
                '&:hover': { borderColor: 'primary.main' }
              }}
              onClick={() => setRecalculateMaterialsChoice('keep')}
            >
              <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <Checkbox
                  checked={recalculateMaterialsChoice === 'keep'}
                  color="primary"
                />
                <Box>
                  <Typography variant="subtitle1" fontWeight="bold">
                    Zachować obecne ilości materiałów
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Zmieniona zostanie tylko ilość produktu. Ilości materiałów pozostaną bez zmian.
                  </Typography>
                </Box>
              </Box>
            </Paper>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={() => {
              setQuantityChangeDialogOpen(false);
              setPendingSubmitEvent(null);
              setRecalculateMaterialsChoice(null);
              setSaving(false);
            }}
            color="inherit"
          >
            Anuluj
          </Button>
          <Button
            onClick={async () => {
              if (recalculateMaterialsChoice === null) {
                showWarning('Wybierz jedną z opcji');
                return;
              }
              
              const shouldRecalculate = recalculateMaterialsChoice === 'recalculate';
              setQuantityChangeDialogOpen(false);
              await performSubmit(pendingSubmitEvent, shouldRecalculate);
            }}
            variant="contained"
            color="primary"
            disabled={recalculateMaterialsChoice === null}
            startIcon={<SaveIcon />}
          >
            Zapisz zadanie
          </Button>
        </DialogActions>
      </Dialog>

      <Container maxWidth="md">
        <Paper elevation={3} sx={{ p: 3, mt: 3, mb: 3 }}>
          <Typography variant="h5" component="h1" gutterBottom sx={{ mb: 3, color: 'primary.main', fontWeight: 'bold' }}>
            {taskId && taskId !== 'new' ? 'Edytuj zadanie produkcyjne' : t('production.taskList.newTask') + ' produkcyjne'}
          </Typography>
        
        {/* Wyświetlanie/edycja numeru MO w trybie edycji */}
        {taskId && taskId !== 'new' && taskData.moNumber && (
          <Paper elevation={1} sx={{ p: 2, mb: 3, bgcolor: editingMO ? 'warning.light' : 'info.light' }}>
            {!editingMO ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Typography variant="h6" component="span" sx={{ fontWeight: 'bold' }}>
                  Numer MO: {taskData.moNumber}
                </Typography>
                <Tooltip title="Zmień numer MO (w przypadku duplikatów)">
                  <Button 
                    variant="outlined" 
                    size="small"
                    onClick={() => {
                      setNewMONumber(taskData.moNumber);
                      setEditingMO(true);
                      setMOValidationError('');
                    }}
                  >
                    Zmień numer MO
                  </Button>
                </Tooltip>
              </Box>
            ) : (
              <Box>
                <Typography variant="subtitle2" sx={{ mb: 1, color: 'warning.dark', fontWeight: 'bold' }}>
                  ⚠️ Edycja numeru MO
                </Typography>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Nowy numer MO"
                      value={newMONumber}
                      onChange={(e) => {
                        setNewMONumber(e.target.value.toUpperCase());
                        setMOValidationError('');
                      }}
                      placeholder="MO00000"
                      error={!!moValidationError}
                      helperText={moValidationError || 'Format: MO00000 (np. MO00150)'}
                      size="small"
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                      <Button 
                        variant="contained" 
                        color="warning"
                        onClick={() => validateAndUpdateMO(newMONumber)}
                        disabled={!newMONumber || newMONumber === taskData.moNumber}
                      >
                        Zatwierdź
                      </Button>
                      <Button 
                        variant="outlined"
                        onClick={() => {
                          setEditingMO(false);
                          setMOValidationError('');
                        }}
                      >
                        Anuluj
                      </Button>
                    </Box>
                  </Grid>
                </Grid>
                {taskData.lotNumber && taskData.lotNumber.includes(taskData.moNumber.replace('MO', '')) && (
                  <Alert severity="info" sx={{ mt: 2 }}>
                    Numer LOT ({taskData.lotNumber}) zostanie automatycznie zaktualizowany wraz z numerem MO.
                  </Alert>
                )}
              </Box>
            )}
          </Paper>
        )}
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <form onSubmit={handleSubmit}>
            {recipeYieldError && (
              <Alert severity="error" sx={{ mb: 2 }}>
                <AlertTitle>Błąd wydajności receptury</AlertTitle>
                Wybrana receptura ma nieprawidłową wydajność. Przejdź do edycji receptury i napraw wartość wydajności.
              </Alert>
            )}
            
            {/* Zakładki formularza */}
            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
              <Tabs 
                value={activeTab} 
                onChange={(e, newValue) => setActiveTab(newValue)}
                variant="scrollable"
                scrollButtons="auto"
              >
                <Tab label="Dane podstawowe" />
                <Tab label="Harmonogram i produkcja" />
                <Tab label="Koszty" />
                <Tab label="Powiązania" />
                <Tab label="Dodatkowe" />
              </Tabs>
            </Box>

            {/* === ZAKŁADKA 1: DANE PODSTAWOWE === */}
            {activeTab === 0 && (
              <Box>
            {/* Sekcja podstawowych informacji */}
            <Paper elevation={1} sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium', color: 'primary.main' }}>
                Podstawowe informacje
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    required
                    label="Nazwa zadania"
                    name="name"
                    value={taskData.name}
                    onChange={handleChange}
                    fullWidth
                    variant="outlined"
                  />
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Opis"
                    name="description"
                    value={taskData.description || ''}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={2}
                    variant="outlined"
                  />
                </Grid>
              </Grid>
            </Paper>
            
            {/* Sekcja produktu i receptury */}
            <Paper elevation={1} sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium', color: 'primary.main' }}>
                Produkt i receptura
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <FormControl fullWidth variant="outlined">
                    <InputLabel id="recipe-label">Receptura</InputLabel>
                    <Select
                      labelId="recipe-label"
                      id="recipe"
                      name="recipeId"
                      value={taskData.recipeId || ''}
                      onChange={handleRecipeChange}
                      label="Receptura"
                    >
                      <MenuItem value="">
                        <em>Brak</em>
                      </MenuItem>
                      {recipeOptions}
                    </Select>
                  </FormControl>
                </Grid>
                
                {/* Informacje o wersji receptury i przycisk aktualizacji - tylko w trybie edycji */}
                {taskId && taskId !== 'new' && taskData.recipeId && (
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 2, bgcolor: 'action.hover', borderRadius: 1 }}>
                      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Tooltip 
                          title={
                            availableRecipeVersions.length > 0 ?
                              `Dostępne wersje receptury: ${availableRecipeVersions.map(v => v.version).sort((a, b) => a - b).join(', ')}. Wybierz wersję która była aktualna w momencie tworzenia MO.` :
                              "Wpisz numer wersji receptury która była aktualna w momencie tworzenia MO"
                          }
                          arrow
                        >
                          <TextField
                            label="Wersja receptury"
                            type="number"
                            value={taskData.recipeVersion || ''}
                            onChange={(e) => {
                              const version = e.target.value ? parseInt(e.target.value) : undefined;
                              setTaskData(prev => ({
                                ...prev,
                                recipeVersion: version
                              }));
                            }}
                            size="small"
                            sx={{ width: 150 }}
                            inputProps={{ min: 1 }}
                            helperText={
                              !taskData.recipeVersion ? 
                                "Brak przypisanej wersji" : 
                                availableRecipeVersions.length > 0 ?
                                  `Dostępne: ${availableRecipeVersions.map(v => v.version).sort((a, b) => a - b).join(', ')}` :
                                  ""
                            }
                            error={!taskData.recipeVersion}
                          />
                        </Tooltip>
                        {taskData.recipeName && (
                          <Box>
                            <Typography variant="body2" color="text.secondary">
                              Nazwa receptury: {taskData.recipeName}
                            </Typography>
                          </Box>
                        )}
                      </Box>
                      <Button
                        variant="outlined"
                        startIcon={<UpdateIcon />}
                        onClick={handleOpenVersionDialog}
                        disabled={!canUpdateRecipeVersion() || loadingVersions}
                        size="small"
                      >
                        {loadingVersions ? 'Sprawdzam...' : 'Aktualizuj wersję'}
                      </Button>
                    </Box>
                    
                    {/* Alert o braku wersji receptury */}
                    {!taskData.recipeVersion && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        <Typography variant="body2">
                          <strong>Uwaga:</strong> To MO nie ma przypisanej wersji receptury. 
                          Prawdopodobnie zostało utworzone przed wprowadzeniem wersjonowania. 
                          Przeliczanie czasu będzie używać najnowszej wersji receptury.
                          {availableRecipeVersions.length > 0 && (
                            <span> Dostępne wersje: {availableRecipeVersions.map(v => v.version).sort((a, b) => a - b).join(', ')}</span>
                          )}
                        </Typography>
                      </Alert>
                    )}
                    
                    {/* Komunikat o ograniczeniach aktualizacji */}
                    {!canUpdateRecipeVersion() && taskId && taskId !== 'new' && (
                      <Alert severity="info" sx={{ mt: 1 }}>
                        <Typography variant="body2">
                          {(() => {
                            const hasReservations = taskData.materialBatches && 
                              Object.keys(taskData.materialBatches).length > 0 &&
                              Object.values(taskData.materialBatches).some(batches => 
                                batches && batches.length > 0 && 
                                batches.some(batch => batch.quantity > 0)
                              );
                            const hasConsumption = taskData.materialConsumptionConfirmed === true ||
                              (taskData.consumedMaterials && taskData.consumedMaterials.length > 0) ||
                              (taskData.status === 'Potwierdzenie zużycia');
                            
                            if (hasReservations && hasConsumption) {
                              return 'Aktualizacja niemożliwa: zadanie ma zarezerwowane i skonsumowane materiały.';
                            } else if (hasReservations) {
                              return 'Aktualizacja niemożliwa: zadanie ma zarezerwowane materiały.';
                            } else if (hasConsumption) {
                              return 'Aktualizacja niemożliwa: zadanie ma skonsumowane materiały.';
                            }
                            return 'Aktualizacja wersji receptury jest możliwa tylko dla zadań bez rezerwacji i konsumpcji materiałów.';
                          })()}
                        </Typography>
                      </Alert>
                    )}
                  </Grid>
                )}
                {/* Pole "Produkt z magazynu" ukryte w trybie edycji */}
                {!taskId && (
                  <Grid item xs={12}>
                    <Autocomplete
                      id="inventory-product"
                      options={inventoryProducts}
                      getOptionLabel={(option) => option.name}
                      value={taskData.inventoryProductId ? { id: taskData.inventoryProductId, name: taskData.productName } : null}
                      onOpen={() => handleDropdownOpen('inventoryProducts')}
                      loading={!dataLoaded.inventoryProducts}
                      onChange={(event, newValue) => {
                        if (newValue) {
                          setTaskData(prev => ({
                            ...prev,
                            productName: newValue.name,
                            unit: newValue.unit || 'szt.',
                            inventoryProductId: newValue.id
                          }));
                        } else {
                          setTaskData(prev => {
                            const updatedData = { ...prev };
                            delete updatedData.inventoryProductId;
                            return updatedData;
                          });
                        }
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Produkt z magazynu (opcjonalnie)"
                          variant="outlined"
                          helperText="Wybierz istniejący produkt z magazynu lub pozostaw puste, aby utworzyć nowy"
                          InputProps={{
                            ...params.InputProps,
                            endAdornment: (
                              <>
                                {!dataLoaded.inventoryProducts ? <CircularProgress color="inherit" size={20} /> : null}
                                {params.InputProps.endAdornment}
                              </>
                            ),
                          }}
                        />
                      )}
                    />
                  </Grid>
                )}
                <Grid item xs={12} sm={8}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <TextField
                      fullWidth
                      label="Nazwa produktu"
                      name="productName"
                      value={taskData.productName || ''}
                      onChange={handleChange}
                      required
                      variant="outlined"
                      helperText={
                        taskData.inventoryProductId 
                          ? "Nazwa produktu pochodzi z magazynu. Możesz ją edytować lub odświeżyć z zamówienia." 
                          : ""
                      }
                      sx={{ flexGrow: 1 }}
                    />
                    {/* Przycisk do odświeżenia nazwy produktu - tylko w trybie edycji */}
                    {taskId && taskId !== 'new' && taskData.orderId && taskData.orderItemId && (
                      <Tooltip 
                        title="Odśwież nazwę produktu z aktualnej pozycji zamówienia" 
                        arrow
                      >
                        <Button
                          variant="outlined"
                          color="primary"
                          onClick={handleRefreshProductName}
                          disabled={refreshingProductName}
                          startIcon={refreshingProductName ? <CircularProgress size={16} /> : <RefreshIcon />}
                          sx={{ 
                            height: 56, 
                            minWidth: 120,
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {refreshingProductName ? 'Odświeżam...' : 'Odśwież'}
                        </Button>
                      </Tooltip>
                    )}
                  </Box>
                </Grid>
                <Grid item xs={12} sm={4}>
                  <FormControl fullWidth variant="outlined">
                    <InputLabel>Jednostka</InputLabel>
                    <Select
                      name="unit"
                      value={taskData.unit}
                      onChange={handleChange}
                      label="Jednostka"
                    >
                      {unitOptions}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Ilość"
                    name="quantity"
                    type="number"
                    value={taskData.quantity || ''}
                    onChange={handleQuantityChange}
                    fullWidth
                    required
                    variant="outlined"
                    inputProps={{ min: 0, step: 0.01 }}
                  />
                </Grid>
              </Grid>
            </Paper>
              </Box>
            )}
            
            {/* === ZAKŁADKA 4: POWIĄZANIA === */}
            {activeTab === 3 && (
              <Box>
            {/* Sekcja powiązania z zamówieniem klienta - tylko w trybie edycji */}
            {taskId && taskId !== 'new' && (
              <Paper elevation={1} sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
                <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium', color: 'primary.main' }}>
                  Powiązanie z zamówieniem klienta (CO)
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <Alert severity="info" sx={{ mb: 2 }}>
                      <Typography variant="body2">
                        <strong>Zmiana powiązania MO z CO:</strong> Możesz zmienić zamówienie klienta, do którego przypisane jest to zadanie produkcyjne. 
                        System automatycznie zaktualizuje powiązania w obu zamówieniach (starym i nowym).
                      </Typography>
                    </Alert>
                  </Grid>
                  
                  <Grid item xs={12} md={6}>
                    <Autocomplete
                      id="customer-order"
                      options={customerOrders}
                      getOptionLabel={(option) => {
                        const customerName = option.customer?.name || 'Nieznany klient';
                        const orderNumber = option.orderNumber || option.id;
                        return `CO ${orderNumber} - ${customerName}`;
                      }}
                      value={selectedCustomerOrder}
                      onOpen={() => {
                        if (!dataLoaded.customerOrders) {
                          fetchCustomerOrders();
                        }
                      }}
                      loading={!dataLoaded.customerOrders}
                      onChange={(event, newValue) => {
                        setSelectedCustomerOrder(newValue);
                        setSelectedOrderItemId(''); // Reset wyboru pozycji
                      }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Zamówienie klienta"
                          variant="outlined"
                          helperText={
                            originalOrderId && selectedCustomerOrder?.id !== originalOrderId
                              ? `Zmiana z: CO ${taskData.orderNumber || originalOrderId}`
                              : originalOrderId
                                ? `Aktualne: CO ${taskData.orderNumber || originalOrderId}`
                                : 'Brak powiązania z zamówieniem'
                          }
                          InputProps={{
                            ...params.InputProps,
                            endAdornment: (
                              <>
                                {!dataLoaded.customerOrders ? <CircularProgress color="inherit" size={20} /> : null}
                                {params.InputProps.endAdornment}
                              </>
                            ),
                          }}
                        />
                      )}
                      renderOption={(props, option) => (
                        <Box component="li" {...props}>
                          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                            <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                              CO {option.orderNumber}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                              Klient: {option.customer?.name || 'Nieznany'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              Status: {option.status} | Pozycji: {option.items?.length || 0}
                            </Typography>
                          </Box>
                        </Box>
                      )}
                    />
                  </Grid>

                  <Grid item xs={12} md={6}>
                    <FormControl fullWidth variant="outlined" disabled={!selectedCustomerOrder}>
                      <InputLabel>Pozycja z zamówienia</InputLabel>
                      <Select
                        value={selectedOrderItemId}
                        onChange={(e) => setSelectedOrderItemId(e.target.value)}
                        label="Pozycja z zamówienia"
                      >
                        <MenuItem value="">
                          <em>-- Wybierz pozycję --</em>
                        </MenuItem>
                        {selectedCustomerOrder?.items?.map((item, index) => (
                          <MenuItem key={item.id || index} value={item.id}>
                            <Box sx={{ display: 'flex', flexDirection: 'column', py: 0.5 }}>
                              <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                {item.name}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                Ilość: {item.quantity} {item.unit || 'szt.'} 
                                {item.productionTaskId && item.productionTaskId !== taskId && 
                                  ` | Już powiązane z MO ${item.productionTaskNumber || item.productionTaskId}`
                                }
                              </Typography>
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                      <FormHelperText>
                        {!selectedCustomerOrder 
                          ? 'Najpierw wybierz zamówienie klienta'
                          : selectedOrderItemId
                            ? 'Pozycja, z którą będzie powiązane to MO'
                            : 'Wybierz pozycję z zamówienia'
                        }
                      </FormHelperText>
                    </FormControl>
                  </Grid>

                  {selectedCustomerOrder && selectedOrderItemId && (
                    <Grid item xs={12}>
                      <Alert severity="success">
                        <Typography variant="body2">
                          <strong>Wybrano:</strong> Pozycja "{selectedCustomerOrder.items.find(i => i.id === selectedOrderItemId)?.name}" 
                          z zamówienia CO {selectedCustomerOrder.orderNumber}
                        </Typography>
                        {originalOrderId && selectedCustomerOrder.id !== originalOrderId && (
                          <Typography variant="body2" sx={{ mt: 1 }}>
                            ⚠️ Po zapisaniu powiązanie zostanie przeniesione z CO {taskData.orderNumber} do CO {selectedCustomerOrder.orderNumber}
                          </Typography>
                        )}
                      </Alert>
                    </Grid>
                  )}
                </Grid>
              </Paper>
            )}
              </Box>
            )}

            {/* === ZAKŁADKA 2: HARMONOGRAM I PRODUKCJA === */}
            {activeTab === 1 && (
              <Box>
            {/* Sekcja harmonogramu */}
            <Paper elevation={1} sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium', color: 'primary.main' }}>
                Harmonogram produkcji
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                    <DateTimePicker
                      label="Data rozpoczęcia"
                      value={taskData.scheduledDate}
                      onChange={handleDateChange}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          required: true,
                          variant: "outlined"
                        }
                      }}
                    />
                  </LocalizationProvider>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                    <DateTimePicker
                      label="Data zakończenia"
                      value={taskData.endDate}
                      onChange={handleEndDateChange}
                      minDate={taskData.scheduledDate}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          required: true,
                          variant: "outlined"
                        }
                      }}
                    />
                  </LocalizationProvider>
                </Grid>
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <TextField
                      label="Czas produkcji na jednostkę (min)"
                      name="productionTimePerUnit"
                      value={taskData.productionTimePerUnit}
                      onChange={handleProductionTimePerUnitChange}
                      type="number"
                      variant="outlined"
                      InputProps={{ inputProps: { min: 0, step: 0.01 } }}
                      helperText="Czas produkcji dla 1 sztuki w minutach"
                      sx={{ flexGrow: 1 }}
                    />
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={() => handleCalculateTimeFromRecipe().catch(error => {
                        console.error('Błąd w handleCalculateTimeFromRecipe:', error);
                        showError('Wystąpił błąd podczas przeliczania czasu');
                      })}
                      startIcon={<CalculateIcon />}
                      disabled={!recipe || !taskData.quantity}
                      sx={{ 
                        height: 56, 
                        minWidth: 180,
                        whiteSpace: 'nowrap'
                      }}
                      title={!recipe ? 
                        "Najpierw wybierz recepturę" : 
                        !taskData.quantity ? 
                        "Najpierw wprowadź ilość" :
                        "Przelicz czas pracy na podstawie konkretnej wersji receptury powiązanej z MO (czas z receptury × ilość)"
                      }
                    >
                      Przelicz czas z receptury
                    </Button>
                  </Box>
                                    {/* Wyświetl dodatkowe informacje o przeliczeniu */}
                  {taskData.productionTimePerUnit && taskData.quantity && (
                    <Alert severity="info" sx={{ mt: 1 }}>
                      <Typography variant="body2">
                        Szacowany całkowity czas produkcji: {(taskData.productionTimePerUnit * taskData.quantity).toFixed(2)} minut
                        ({((taskData.productionTimePerUnit * taskData.quantity) / 60).toFixed(2)} godzin)
                        {recipe && recipe.productionTimePerUnit && (
                          <span> | Czas z receptury wersja {taskData.recipeVersion || recipe.version || '?'}: {parseFloat(recipe.productionTimePerUnit).toFixed(2)} min/szt.</span>
                        )}
                      </Typography>
                    </Alert>
                  )}
                </Grid>
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                    <TextField
                      label="Koszt procesowy na jednostkę (EUR)"
                      name="processingCostPerUnit"
                      value={taskData.processingCostPerUnit}
                      onChange={(e) => setTaskData(prev => ({ ...prev, processingCostPerUnit: e.target.value }))}
                      type="number"
                      variant="outlined"
                      InputProps={{ 
                        inputProps: { min: 0, step: 0.01 },
                        startAdornment: (<Box sx={{ color: 'text.secondary', mr: 1 }}>€</Box>)
                      }}
                      helperText="Koszt procesowy/robocizny dla 1 sztuki produktu"
                      sx={{ flexGrow: 1 }}
                    />
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={async () => {
                        if (!taskData.recipeId) {
                          showWarning('Najpierw wybierz recepturę');
                          return;
                        }
                        try {
                          const latestRecipe = await getRecipeById(taskData.recipeId);
                          const newCost = parseFloat(latestRecipe.processingCostPerUnit) || 0;
                          setTaskData(prev => ({ 
                            ...prev, 
                            processingCostPerUnit: newCost 
                          }));
                          showSuccess(`Zaktualizowano koszt procesowy: ${newCost.toFixed(2)} EUR/szt. (najnowsza wersja receptury)`);
                        } catch (error) {
                          console.error('Błąd podczas pobierania kosztu z receptury:', error);
                          showError('Nie udało się pobrać kosztu z receptury');
                        }
                      }}
                      startIcon={<RefreshIcon />}
                      disabled={!taskData.recipeId}
                      sx={{ 
                        height: 56, 
                        minWidth: 180,
                        whiteSpace: 'nowrap'
                      }}
                      title={!taskData.recipeId ? "Najpierw wybierz recepturę" : "Zaciągnij koszt procesowy z najnowszej wersji receptury"}
                    >
                      Zaciągnij z receptury
                    </Button>
                  </Box>
                  {taskData.processingCostPerUnit > 0 && taskData.quantity && (
                    <Alert severity="info" sx={{ mt: 1 }}>
                      <Typography variant="body2">
                        Całkowity koszt procesowy: {(parseFloat(taskData.processingCostPerUnit) * parseFloat(taskData.quantity)).toFixed(2)} EUR
                        {recipe && recipe.processingCostPerUnit && (
                          <span> | Koszt z receptury: {parseFloat(recipe.processingCostPerUnit).toFixed(2)} EUR/szt.</span>
                        )}
                      </Typography>
                    </Alert>
                  )}
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Czas pracy zakładu (godziny/dzień)"
                    name="workingHoursPerDay"
                    value={taskData.workingHoursPerDay}
                    onChange={handleWorkingHoursChange}
                    type="number"
                    variant="outlined"
                    InputProps={{ inputProps: { min: 1, max: 24, step: 1 } }}
                    helperText="Ile godzin dziennie pracuje zakład (1-24h). Używane do wyliczania terminu zakończenia."
                  />
                </Grid>
              </Grid>
            </Paper>
            
            {/* Sekcja statusu i priorytetów */}
            <Paper elevation={1} sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium', color: 'primary.main' }}>
                Status i priorytet
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={taskId ? 12 : 6}>
                  <FormControl fullWidth variant="outlined">
                    <InputLabel>Status</InputLabel>
                    <Select
                      name="status"
                      value={taskData.status || 'Zaplanowane'}
                      onChange={handleChange}
                      label="Status"
                    >
                      {statusOptions}
                    </Select>
                    <FormHelperText>Status zadania produkcyjnego</FormHelperText>
                  </FormControl>
                </Grid>
                {/* Pole "Priorytet" ukryte w trybie edycji */}
                {!taskId && (
                  <Grid item xs={12} sm={6}>
                    <FormControl fullWidth variant="outlined">
                      <InputLabel>Priorytet</InputLabel>
                      <Select
                        name="priority"
                        value={taskData.priority || 'Normalny'}
                        onChange={handleChange}
                        label="Priorytet"
                      >
                        {priorityOptions}
                      </Select>
                    </FormControl>
                  </Grid>
                )}
                <Grid item xs={12}>
                  <FormControl fullWidth variant="outlined">
                    <InputLabel>Stanowisko produkcyjne</InputLabel>
                    <Select
                      name="workstationId"
                      value={taskData.workstationId || ''}
                      onChange={handleChange}
                      label="Stanowisko produkcyjne"
                    >
                      <MenuItem value="">
                        <em>Brak</em>
                      </MenuItem>
                      {workstationOptions}
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Paper>
            
            {/* Sekcja partii produktu końcowego */}
            <Paper elevation={1} sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium', color: 'primary.main' }}>
                Dane partii produktu końcowego
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Numer LOT"
                    name="lotNumber"
                    value={taskData.lotNumber || ''}
                    onChange={handleChange}
                    variant="outlined"
                    helperText="Określ numer partii (LOT) dla produktu końcowego"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                      <DateTimePicker
                        label="Data ważności"
                        value={taskData.expiryDate}
                        onChange={(date) => setTaskData(prev => ({...prev, expiryDate: date}))}
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            variant: "outlined",
                            helperText: "Określ datę ważności produktu końcowego"
                          }
                        }}
                      />
                    </LocalizationProvider>
                    <Button 
                      variant="outlined" 
                      color="secondary"
                      onClick={() => setTaskData(prev => ({...prev, expiryDate: null}))}
                      sx={{ mt: 2, ml: 1, height: 56 }}
                      title="Wyczyść datę ważności"
                    >
                      <DeleteIcon />
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </Paper>
              </Box>
            )}

            {/* === ZAKŁADKA 5: DODATKOWE === */}
            {activeTab === 4 && (
              <Box>
            {/* Sekcja dodatkowych informacji */}
            <Paper elevation={1} sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium', color: 'primary.main' }}>
                Dodatkowe informacje
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <TextField
                    name="notes"
                    value={taskData.notes || ''}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={4}
                    variant="outlined"
                    placeholder="Dodatkowe uwagi, instrukcje dla operatorów, informacje o materiałach..."
                    label="Notatki"
                  />
                </Grid>
              </Grid>
            </Paper>
              </Box>
            )}

            {/* === ZAKŁADKA 3: KOSZTY === */}
            {activeTab === 2 && (
              <Box>
            {/* Sekcja kosztów produkcji */}
            <Paper elevation={1} sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium', color: 'primary.main' }}>
                Koszty produkcji
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', alignItems: 'center', p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={taskData.disableAutomaticCostUpdates || false}
                          onChange={(e) => setTaskData(prev => ({
                            ...prev,
                            disableAutomaticCostUpdates: e.target.checked
                          }))}
                          name="disableAutomaticCostUpdates"
                          color="primary"
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body1" fontWeight="medium">
                            Wyłącz automatyczne aktualizacje kosztów
                          </Typography>
                          <Typography variant="body2" color="text.secondary">
                            Po zaznaczeniu możesz ręcznie określić koszty produkcji. System nie będzie automatycznie przeliczał kosztów przy zmianach materiałów.
                          </Typography>
                        </Box>
                      }
                    />
                  </Box>
                </Grid>

                {taskData.disableAutomaticCostUpdates && (
                  <>
                    <Grid item xs={12}>
                      <Alert severity="warning">
                        <Typography variant="body2">
                          <strong>Uwaga:</strong> Wyłączyłeś automatyczne aktualizacje kosztów. 
                          Wprowadź koszty ręcznie lub pozostaw puste aby zachować aktualne wartości z bazy danych.
                        </Typography>
                      </Alert>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Całkowity koszt materiałów (€)"
                        name="manualTotalMaterialCost"
                        type="number"
                        value={taskData.manualTotalMaterialCost || ''}
                        onChange={(e) => {
                          const totalCost = e.target.value === '' ? '' : parseFloat(e.target.value);
                          const quantity = parseFloat(taskData.quantity) || 1;
                          
                          setTaskData(prev => ({
                            ...prev,
                            manualTotalMaterialCost: totalCost,
                            manualUnitMaterialCost: totalCost !== '' ? (totalCost / quantity).toFixed(4) : ''
                          }));
                        }}
                        variant="outlined"
                        inputProps={{ min: 0, step: 0.01 }}
                        helperText="Koszt materiałów wliczanych do ceny (bez opakowań)"
                      />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Koszt materiałów na jednostkę (€)"
                        name="manualUnitMaterialCost"
                        type="number"
                        value={taskData.manualUnitMaterialCost || ''}
                        onChange={(e) => {
                          const unitCost = e.target.value === '' ? '' : parseFloat(e.target.value);
                          const quantity = parseFloat(taskData.quantity) || 1;
                          
                          setTaskData(prev => ({
                            ...prev,
                            manualUnitMaterialCost: unitCost,
                            manualTotalMaterialCost: unitCost !== '' ? (unitCost * quantity).toFixed(4) : ''
                          }));
                        }}
                        variant="outlined"
                        inputProps={{ min: 0, step: 0.0001 }}
                        helperText="Koszt na 1 jednostkę produktu"
                      />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Całkowity pełny koszt produkcji (€)"
                        name="manualTotalFullProductionCost"
                        type="number"
                        value={taskData.manualTotalFullProductionCost || ''}
                        onChange={(e) => {
                          const totalCost = e.target.value === '' ? '' : parseFloat(e.target.value);
                          const quantity = parseFloat(taskData.quantity) || 1;
                          
                          setTaskData(prev => ({
                            ...prev,
                            manualTotalFullProductionCost: totalCost,
                            manualUnitFullProductionCost: totalCost !== '' ? (totalCost / quantity).toFixed(4) : ''
                          }));
                        }}
                        variant="outlined"
                        inputProps={{ min: 0, step: 0.01 }}
                        helperText="Pełny koszt produkcji włącznie z opakowaniami"
                      />
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <TextField
                        fullWidth
                        label="Pełny koszt produkcji na jednostkę (€)"
                        name="manualUnitFullProductionCost"
                        type="number"
                        value={taskData.manualUnitFullProductionCost || ''}
                        onChange={(e) => {
                          const unitCost = e.target.value === '' ? '' : parseFloat(e.target.value);
                          const quantity = parseFloat(taskData.quantity) || 1;
                          
                          setTaskData(prev => ({
                            ...prev,
                            manualUnitFullProductionCost: unitCost,
                            manualTotalFullProductionCost: unitCost !== '' ? (unitCost * quantity).toFixed(4) : ''
                          }));
                        }}
                        variant="outlined"
                        inputProps={{ min: 0, step: 0.0001 }}
                        helperText="Pełny koszt na 1 jednostkę produktu"
                      />
                    </Grid>

                    {taskData.quantity && (taskData.manualTotalMaterialCost || taskData.manualTotalFullProductionCost) && (
                      <Grid item xs={12}>
                        <Alert severity="info">
                          <Typography variant="body2">
                            <strong>Podsumowanie dla {taskData.quantity} {taskData.unit}:</strong>
                          </Typography>
                          {taskData.manualTotalMaterialCost && (
                            <Typography variant="body2">
                              • Całkowity koszt materiałów: {parseFloat(taskData.manualTotalMaterialCost).toFixed(2)} € 
                              ({(parseFloat(taskData.manualTotalMaterialCost) / parseFloat(taskData.quantity)).toFixed(4)} €/{taskData.unit})
                            </Typography>
                          )}
                          {taskData.manualTotalFullProductionCost && (
                            <Typography variant="body2">
                              • Całkowity pełny koszt: {parseFloat(taskData.manualTotalFullProductionCost).toFixed(2)} € 
                              ({(parseFloat(taskData.manualTotalFullProductionCost) / parseFloat(taskData.quantity)).toFixed(4)} €/{taskData.unit})
                            </Typography>
                          )}
                        </Alert>
                      </Grid>
                    )}
                  </>
                )}

                {!taskData.disableAutomaticCostUpdates && (
                  <Grid item xs={12}>
                    <Alert severity="info">
                      <Typography variant="body2">
                        Koszty produkcji będą automatycznie obliczane na podstawie zużytych materiałów i ich cen. 
                        Aby wprowadzić koszty ręcznie, zaznacz checkbox powyżej.
                      </Typography>
                    </Alert>
                  </Grid>
                )}
              </Grid>
            </Paper>
              </Box>
            )}

            {/* === ZAKŁADKA 4: POWIĄZANIA (cd.) === */}
            {activeTab === 3 && (
              <Box>
            {/* Sekcja powiązanych zamówień zakupowych */}
            <Paper elevation={1} sx={{ p: 2, mb: 3, bgcolor: 'background.default' }}>
              <Typography variant="subtitle1" sx={{ mb: 2, fontWeight: 'medium', color: 'primary.main' }}>
                Powiązane zamówienia komponentów
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                    <Autocomplete
                      value={selectedPurchaseOrder}
                      onChange={(event, newValue) => {
                        setSelectedPurchaseOrder(newValue);
                      }}
                      onOpen={() => handleDropdownOpen('purchaseOrders')}
                      loading={!dataLoaded.purchaseOrders}
                      options={purchaseOrders}
                      getOptionLabel={(option) => `${option.number} - ${option.supplier?.name || 'Brak dostawcy'}`}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Wybierz zamówienie zakupowe"
                          variant="outlined"
                          fullWidth
                          InputProps={{
                            ...params.InputProps,
                            endAdornment: (
                              <>
                                {!dataLoaded.purchaseOrders ? <CircularProgress color="inherit" size={20} /> : null}
                                {params.InputProps.endAdornment}
                              </>
                            ),
                          }}
                        />
                      )}
                      sx={{ flexGrow: 1, mr: 1 }}
                    />
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleAddPurchaseOrderLink}
                      startIcon={<LinkIcon />}
                      sx={{ height: 56 }}
                      disabled={!dataLoaded.purchaseOrders}
                    >
                      Powiąż
                    </Button>
                  </Box>
                </Grid>
                
                <Grid item xs={12}>
                  {taskData.linkedPurchaseOrders && taskData.linkedPurchaseOrders.length > 0 ? (
                    <List>
                      {taskData.linkedPurchaseOrders.map((po) => (
                        <ListItem
                          key={po.id}
                          secondaryAction={
                            <IconButton 
                              edge="end" 
                              aria-label="delete"
                              onClick={() => handleRemovePurchaseOrderLink(po.id)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          }
                        >
                          <ListItemText
                            primary={po.number}
                            secondary={po.supplierName}
                          />
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                      Brak powiązanych zamówień zakupowych
                    </Typography>
                  )}
                </Grid>
              </Grid>
            </Paper>
              </Box>
            )}

            {/* Przyciski formularza */}
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button 
                startIcon={<ArrowBackIcon />} 
                onClick={() => {
                  // Sprawdź czy jest parametr returnTo w URL
                  const searchParams = new URLSearchParams(location.search);
                  const returnTo = searchParams.get('returnTo');
                  
                  if (returnTo && taskId) {
                    // Jeśli edytujemy zadanie i jest parametr returnTo, wróć do szczegółów zadania
                    navigate(`/production/tasks/${taskId}`);
                  } else {
                    // W przeciwnym przypadku idź do listy zadań
                    navigate('/production');
                  }
                }}
                variant="outlined"
                size="large"
              >
                Powrót
              </Button>
              <Button 
                type="submit" 
                variant="contained" 
                color="primary"
                disabled={saving}
                startIcon={<SaveIcon />}
                size="large"
              >
                {saving ? 'Zapisywanie...' : 'Zapisz'}
              </Button>
            </Box>
          </form>
        )}
      </Paper>

      {/* Dialog wyboru wersji receptury */}
      <Dialog 
        open={recipeVersionDialogOpen} 
        onClose={() => {
          setRecipeVersionDialogOpen(false);
          setSelectedVersion(null);
        }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <HistoryIcon />
            Wybierz wersję receptury
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Aktualna wersja: <strong>{taskData.recipeVersion || 1}</strong>
          </Typography>
          
          {availableVersions.length > 0 ? (
            <FormControl fullWidth>
              <InputLabel>Wybierz nową wersję</InputLabel>
              <Select
                value={selectedVersion?.version || ''}
                onChange={(e) => {
                  const version = availableVersions.find(v => v.version === e.target.value);
                  setSelectedVersion(version);
                }}
                label="Wybierz nową wersję"
              >
                {availableVersions.map((version) => (
                  <MenuItem key={version.version} value={version.version}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <Typography variant="body1">
                        Wersja {version.version}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {(() => {
                          try {
                            if (!version.createdAt) return 'Brak daty';
                            const date = version.createdAt.toDate ? version.createdAt.toDate() : new Date(version.createdAt);
                            return date.toLocaleDateString('pl-PL', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit'
                            });
                          } catch (error) {
                            return 'Nieprawidłowa data';
                          }
                        })()}
                      </Typography>
                      {version.createdBy && (
                        <Typography variant="body2" color="text.secondary">
                          Autor: {version.createdBy}
                        </Typography>
                      )}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          ) : (
            <Typography variant="body1" color="text.secondary">
              Brak nowszych wersji receptury
            </Typography>
          )}
          
          <Alert severity="warning" sx={{ mt: 2 }}>
            <Typography variant="body2">
              <strong>Uwaga:</strong> Aktualizacja do nowej wersji receptury zastąpi wszystkie materiały 
              nowymi z wybranej wersji. Ta operacja jest nieodwracalna.
            </Typography>
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => {
              setRecipeVersionDialogOpen(false);
              setSelectedVersion(null);
            }}
            disabled={updatingRecipe}
          >
            Anuluj
          </Button>
          <Button 
            onClick={handleUpdateRecipeVersion}
            variant="contained"
            disabled={!selectedVersion || updatingRecipe}
            startIcon={updatingRecipe ? <CircularProgress size={16} /> : <UpdateIcon />}
          >
            {updatingRecipe ? 'Aktualizuję...' : 'Aktualizuj'}
          </Button>
        </DialogActions>
      </Dialog>
      </Container>
    </>
  );
};

export default TaskForm;