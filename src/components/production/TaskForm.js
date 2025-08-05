// src/components/production/TaskForm.js
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  Tooltip
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
  Calculate as CalculateIcon
} from '@mui/icons-material';
import {
  createTask,
  updateTask,
  getTaskById
} from '../../services/productionService';
import { getAllRecipes, getRecipeById, getRecipeVersions, getRecipeVersion } from '../../services/recipeService';
import {
  getAllInventoryItems,
  getInventoryItemById
} from '../../services/inventory';
import { getAllPurchaseOrders } from '../../services/purchaseOrderService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { getAllWorkstations } from '../../services/workstationService';
import { generateLOTNumber } from '../../utils/numberGenerators';
import { calculateEndDateExcludingWeekends, calculateProductionTimeBetweenExcludingWeekends } from '../../utils/dateUtils';
import { preciseMultiply } from '../../utils/mathUtils';

const TaskForm = ({ taskId }) => {
  const [loading, setLoading] = useState(!!taskId);
  const [saving, setSaving] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const [recipe, setRecipe] = useState(null);
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const { currentUser } = useAuth();
  const { showSuccess, showError, showWarning } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();
  
  const [workstations, setWorkstations] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState(null);
  
  // Cache stany dla optymalizacji
  const [dataLoaded, setDataLoaded] = useState({
    recipes: false,
    workstations: false,
    inventoryProducts: false,
    purchaseOrders: false
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
    priority: 'Normalny',
    status: 'Zaplanowane',
    notes: '',
    moNumber: '',
    workstationId: '', // ID stanowiska produkcyjnego
    lotNumber: '', // Numer partii produktu (LOT)
    expiryDate: null, // Data ważności produktu
    linkedPurchaseOrders: [] // Powiązane zamówienia zakupowe
  });

  const [recipeYieldError, setRecipeYieldError] = useState(false);
  
  // Stany dla aktualizacji receptury
  const [recipeVersionDialogOpen, setRecipeVersionDialogOpen] = useState(false);
  const [availableVersions, setAvailableVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [updatingRecipe, setUpdatingRecipe] = useState(false);
  const [availableRecipeVersions, setAvailableRecipeVersions] = useState([]);

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
        linkedPurchaseOrders: task.linkedPurchaseOrders || []
      };
      
      console.log('Pobrane zadanie z przetworzonymi datami:', taskWithParsedDates);
      setTaskData(taskWithParsedDates);
      
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (saving) return;
    
    try {
      setSaving(true);
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
      
      let savedTaskId;
      
      if (taskId) {
        // Aktualizacja zadania
        await updateTask(taskId, formattedData, currentUser.uid);
        savedTaskId = taskId;
        showSuccess('Zadanie zostało zaktualizowane');
      } else {
        // Utworzenie nowego zadania
        const newTask = await createTask(formattedData, currentUser.uid);
        savedTaskId = newTask.id;
        showSuccess('Zadanie zostało utworzone');
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

  // Funkcja sprawdzająca czy można przeliczać materiały
  const canRecalculateMaterials = () => {
    if (!taskId || taskId === 'new') {
      return true; // Nowe zadania mogą być przeliczane
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
    setTaskData({
      ...taskData,
      recipeId
    });

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
          recipeName: selectedRecipe.name || selectedRecipe.output.name
        }));
      } else {
        // Jeśli nie ma output, ustaw tylko wersję i nazwę receptury
        setTaskData(prev => ({
          ...prev,
          recipeVersion: selectedRecipe.version || 1,
          recipeName: selectedRecipe.name
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
      
      // Oblicz nową datę zakończenia pomijając weekendy
      const endDateExcludingWeekends = calculateEndDateExcludingWeekends(newDate, productionTimeMinutes);
      
      return {
        ...prev,
        scheduledDate: newDate,
        endDate: endDateExcludingWeekends
      };
    });
  };

  const handleEndDateChange = (newDate) => {
    // Oblicz czas produkcji pomijając weekendy
    const durationInMinutes = calculateProductionTimeBetweenExcludingWeekends(taskData.scheduledDate, newDate);
    
    setTaskData({
      ...taskData,
      endDate: newDate,
      estimatedDuration: durationInMinutes
    });
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
      
      // Zaktualizuj datę zakończenia pomijając weekendy
      if (taskData.scheduledDate) {
        const startDate = new Date(taskData.scheduledDate);
        const endDateExcludingWeekends = calculateEndDateExcludingWeekends(startDate, estimatedTimeMinutes);
        setTaskData(prev => ({
          ...prev,
          endDate: endDateExcludingWeekends
        }));
      }
    }
  };

  const handleDurationChange = (e) => {
    const durationInHours = parseFloat(e.target.value);
    if (!isNaN(durationInHours) && durationInHours >= 0) {
      // Przelicz godziny na minuty i zapisz w stanie
      const durationInMinutes = durationInHours * 60;
      
      // Aktualizacja endDate na podstawie scheduledDate i podanego czasu trwania w minutach
      // Oblicz datę zakończenia pomijając weekendy
      const endDateExcludingWeekends = calculateEndDateExcludingWeekends(taskData.scheduledDate, durationInMinutes);
      
      setTaskData(prev => ({
        ...prev,
        estimatedDuration: durationInMinutes,
        endDate: endDateExcludingWeekends
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

      // Zaktualizuj datę zakończenia pomijając weekendy
      if (taskData.scheduledDate) {
        const startDate = new Date(taskData.scheduledDate);
        const endDateExcludingWeekends = calculateEndDateExcludingWeekends(startDate, totalProductionTime);
        setTaskData(prev => ({
          ...prev,
          endDate: endDateExcludingWeekends
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
    
    setTaskData({
      ...taskData,
      quantity: newQuantity
    });
    
    // Aktualizuj materiały i czas produkcji na podstawie nowej ilości
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
      
      // Zaktualizuj datę zakończenia pomijając weekendy
      if (taskData.scheduledDate) {
        const startDate = new Date(taskData.scheduledDate);
        const endDateExcludingWeekends = calculateEndDateExcludingWeekends(startDate, estimatedTimeMinutes);
        setTaskData(prev => ({
          ...prev,
          endDate: endDateExcludingWeekends
        }));
      }
      
      // Zaktualizuj ilości materiałów
      if (taskData.materials && taskData.materials.length > 0) {
        const updatedMaterials = taskData.materials.map(material => {
          const recipeIngredient = recipe.ingredients.find(ing => ing.id === material.id);
          if (recipeIngredient) {
            return {
              ...material,
              quantity: preciseMultiply(recipeIngredient.quantity || 0, newQuantity)
            };
          }
          return material;
        });
        
        setTaskData(prev => ({
          ...prev,
          materials: updatedMaterials
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

  // Funkcja do ręcznego przeliczania materiałów
  const handleRecalculateMaterials = () => {
    if (!canRecalculateMaterials()) {
      showError('Nie można przeliczyć materiałów: zadanie ma zarezerwowane lub skonsumowane materiały');
      return;
    }

    if (!recipe || !taskData.quantity) {
      showWarning('Aby przeliczyć materiały, wybierz recepturę i podaj ilość');
      return;
    }

    const newQuantity = parseFloat(taskData.quantity);
    
    if (isNaN(newQuantity) || newQuantity <= 0) {
      showError('Podaj prawidłową ilość (większą od 0)');
      return;
    }

    // Przelicz materiały na podstawie receptury i nowej ilości
    if (recipe.ingredients && recipe.ingredients.length > 0) {
      const updatedMaterials = recipe.ingredients.map(ingredient => ({
        id: ingredient.id,
        name: ingredient.name,
        category: ingredient.category || 'Surowce',
        quantity: preciseMultiply(ingredient.quantity || 0, newQuantity),
        unit: ingredient.unit || 'szt.',
        inventoryItemId: ingredient.inventoryItemId || ingredient.id
      }));
      
      setTaskData(prev => ({
        ...prev,
        materials: updatedMaterials
      }));
      
      showSuccess(`Przeliczono materiały dla ilości: ${newQuantity} ${taskData.unit}`);
    } else {
      showWarning('Receptura nie zawiera składników do przeliczenia');
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
    <Container maxWidth="md">
      <Paper elevation={3} sx={{ p: 3, mt: 3, mb: 3 }}>
        <Typography variant="h5" component="h1" gutterBottom sx={{ mb: 3, color: 'primary.main', fontWeight: 'bold' }}>
          {taskId && taskId !== 'new' ? 'Edytuj zadanie produkcyjne' : 'Nowe zadanie produkcyjne'}
        </Typography>
        
        {/* Wyświetlanie numeru MO w trybie edycji */}
        {taskId && taskId !== 'new' && taskData.moNumber && (
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="h6" component="span" sx={{ fontWeight: 'bold' }}>
              Numer MO: {taskData.moNumber}
            </Typography>
          </Alert>
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
                  <TextField
                    fullWidth
                    label="Nazwa produktu"
                    name="productName"
                    value={taskData.productName || ''}
                    onChange={handleChange}
                    required
                    variant="outlined"
                    disabled={!!taskData.inventoryProductId}
                    helperText={taskData.inventoryProductId ? "Nazwa produktu pobrana z magazynu" : ""}
                  />
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
                  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
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
                      sx={{ flexGrow: 1 }}
                    />
                    <Button
                      variant="outlined"
                      color="primary"
                      onClick={handleRecalculateMaterials}
                      startIcon={<CalculateIcon />}
                      disabled={!recipe || !taskData.quantity || !canRecalculateMaterials()}
                      sx={{ 
                        height: 56, 
                        minWidth: 160,
                        whiteSpace: 'nowrap'
                      }}
                      title={!canRecalculateMaterials() ? 
                        "Nie można przeliczyć materiałów: zadanie ma zarezerwowane lub skonsumowane materiały" : 
                        "Przelicz materiały na podstawie ilości i receptury"
                      }
                    >
                      Przelicz materiały
                    </Button>
                  </Box>
                  {/* Komunikat o ograniczeniach przeliczania - tylko w trybie edycji */}
                  {taskId && taskId !== 'new' && !canRecalculateMaterials() && (
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
                            return 'Przeliczanie materiałów niemożliwe: zadanie ma zarezerwowane i skonsumowane materiały.';
                          } else if (hasReservations) {
                            return 'Przeliczanie materiałów niemożliwe: zadanie ma zarezerwowane materiały.';
                          } else if (hasConsumption) {
                            return 'Przeliczanie materiałów niemożliwe: zadanie ma skonsumowane materiały.';
                          }
                          return 'Przeliczanie materiałów jest możliwe tylko dla zadań bez rezerwacji i konsumpcji materiałów.';
                        })()}
                      </Typography>
                    </Alert>
                  )}
                </Grid>
              </Grid>
            </Paper>
            
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
                  <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                    <TextField
                      fullWidth
                      label="Numer LOT"
                      name="lotNumber"
                      value={taskData.lotNumber || ''}
                      onChange={handleChange}
                      variant="outlined"
                      helperText="Określ numer partii (LOT) dla produktu końcowego"
                    />
                    <Button 
                      variant="contained" 
                      onClick={generateLot}
                      sx={{ mt: 2, ml: 1, height: 56 }}
                    >
                      Generuj
                    </Button>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                      <DateTimePicker
                        label="Data ważności"
                        value={taskData.expiryDate}
                        onChange={(date) => setTaskData({...taskData, expiryDate: date})}
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
                      onClick={() => setTaskData({...taskData, expiryDate: null})}
                      sx={{ mt: 2, ml: 1, height: 56 }}
                      title="Wyczyść datę ważności"
                    >
                      <DeleteIcon />
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </Paper>

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
  );
};

export default TaskForm;