import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  Container, 
  Typography, 
  Box, 
  Paper, 
  Button, 
  Grid, 
  Alert,
  Divider,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Checkbox,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  TextField,
  CircularProgress,
  Chip,
  FormHelperText
} from '@mui/material';
import { 
  ArrowBack as ArrowBackIcon,
  Add as AddIcon, 
  Check as CheckIcon, 
  Engineering as EngineeringIcon,
  ShoppingCart as ShoppingCartIcon,
  AttachMoney as AttachMoneyIcon,
  Calculate as CalculateIcon
} from '@mui/icons-material';
import { getAllOrders, getOrderById, addProductionTaskToOrder, updateOrder } from '../../services/orderService';
import { createTask, reserveMaterialsForTask } from '../../services/productionService';
import { getAllRecipes, getRecipeById, getRecipesByCustomer } from '../../services/recipeService';
import { getIngredientPrices, getInventoryItemById } from '../../services/inventory';
import { calculateManufacturingOrderCosts } from '../../utils/costCalculator';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { formatDate, addProductionTime, isWeekend, isWorkingDay, calculateEndDateExcludingWeekends, calculateEndDateWithWorkingHours } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatUtils';
import { getPriceForCustomerProduct } from '../../services/priceListService';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { getAllWorkstations } from '../../services/workstationService';
import { preciseMultiply } from '../../utils/mathUtils';

const CreateFromOrderPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo, showWarning } = useNotification();
  const { t } = useTranslation('production');
  
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(location.state?.orderId || '');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [creatingTasks, setCreatingTasks] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const [existingTasks, setExistingTasks] = useState([]);
  const [tasksCreated, setTasksCreated] = useState([]);
  const [updatingPrices, setUpdatingPrices] = useState(false);
  const [productDates, setProductDates] = useState({});
  const [workstations, setWorkstations] = useState([]);
  const [selectedWorkstations, setSelectedWorkstations] = useState({});
  
  // Formularz nowego zadania
  const [taskForm, setTaskForm] = useState({
    name: '',
    priority: 'normal',
    description: '',
    status: 'Zaplanowane',
    reservationMethod: 'fifo', // 'expiry' - wg daty ważności, 'fifo' - FIFO
    autoReserveMaterials: false // Domyślnie wyłączone automatyczne rezerwowanie surowców
  });
  
  // Funkcja pomocnicza do debugowania receptur - umieść ją gdzieś na początku komponentu
  const debugRecipes = () => {
    console.log("==== DEBUGOWANIE RECEPTUR ====");
    console.log(`Liczba wszystkich receptur: ${recipes.length}`);
    
    recipes.forEach((recipe, index) => {
      console.log(`Receptura ${index + 1}: ${recipe.name}`);
      console.log(`  ID: ${recipe.id}`);
      console.log(`  Domyślne stanowisko: ${recipe.defaultWorkstationId || 'BRAK'}`);
      console.log(`  Pełny obiekt receptury:`, JSON.stringify(recipe));
    });
    
    console.log("==== KONIEC DEBUGOWANIA RECEPTUR ====");
  };
  
  // Funkcja do ręcznego powiązania produktu z recepturą
  const manuallyLinkProductToRecipe = (productName, recipeId) => {
    console.log(`Ręczne powiązanie produktu "${productName}" z recepturą ID: ${recipeId}`);
    
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) {
      console.error(`Nie znaleziono receptury o ID: ${recipeId}`);
      showError(t('createFromOrder.validation.missingRecipe', { recipeId }));
      return null;
    }
    
    console.log(`Powiązano produkt "${productName}" z recepturą "${recipe.name}"`);
    showSuccess(t('createFromOrder.messages.recipeBound', { product: productName, recipe: recipe.name }));
    return recipe;
  };

  // Funkcja pomocnicza do wyświetlania dostępnych receptur dla debugowania
  const showAvailableRecipes = () => {
    console.log("==== DOSTĘPNE RECEPTURY ====");
    recipes.forEach((recipe, index) => {
      console.log(`${index + 1}. "${recipe.name}" (ID: ${recipe.id})`);
    });
    
    if (selectedOrder && selectedOrder.items) {
      console.log("==== PRODUKTY W ZAMÓWIENIU ====");
      selectedOrder.items.forEach((item, index) => {
        console.log(`${index + 1}. "${item.name}" (ID: ${item.id})`);
        const foundRecipe = findRecipeForProduct(item.name);
        console.log(`   -> ${foundRecipe ? `ZNALEZIONO: "${foundRecipe.name}"` : 'BRAK RECEPTURY'}`);
      });
    }
  };
  
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Pobierz wszystkie zamówienia
        const ordersData = await getAllOrders();
        setOrders(ordersData);
        
        // Pobierz wszystkie receptury
        await fetchRecipes();
        
        // Debuguj receptury po ich pobraniu
        debugRecipes();
        
        // Pobierz wszystkie stanowiska produkcyjne
        await fetchWorkstations();
        
        // Jeśli orderId zostało przekazane przez location.state, pobierz szczegóły zamówienia
        if (location.state?.orderId) {
          console.log('[CREATE-FROM-ORDER] Automatyczne ładowanie zamówienia z location.state:', location.state.orderId);
          await fetchOrderDetails(location.state.orderId);
        }
      } catch (error) {
        showError(t('createFromOrder.alerts.loadingDataError', { error: error.message }));
        console.error('Error loading initial data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInitialData();
  }, []);
  
  const fetchRecipes = async () => {
    try {
      const recipesData = await getAllRecipes();
      setRecipes(recipesData);
      console.log('Pobrano receptury:', recipesData.length);
    } catch (error) {
      console.error('Błąd podczas pobierania receptur:', error);
    }
  };
  
  // Funkcja do znajdowania receptury dla produktu
  const findRecipeForProduct = (productName) => {
    if (!recipes || recipes.length === 0) {
      console.log(`Brak receptur do przeszukania dla produktu ${productName}`);
      return null;
    }
    
    if (!productName) {
      console.log(`Nazwa produktu jest pusta`);
      return null;
    }
    
    console.log(`Szukam receptury dla produktu: "${productName}" wśród ${recipes.length} receptur`);
    
    // 1. Najpierw spróbuj znaleźć dokładne dopasowanie
    const exactMatch = recipes.find(recipe => 
      recipe.name.toLowerCase() === productName.toLowerCase()
    );
    
    if (exactMatch) {
      console.log(`Znaleziono dokładne dopasowanie receptury dla produktu ${productName}:`, exactMatch.name);
      console.log(`Receptura ma domyślne stanowisko: ${exactMatch.defaultWorkstationId || 'BRAK'}`);
      return exactMatch;
    }
    
    // 2. Sprawdź czy istnieje receptura powiązana z pozycją magazynową o tej nazwie
    // (dla przypadków gdy produkt w zamówieniu odnosi się do pozycji magazynowej)
    const recipeWithInventoryProduct = recipes.find(recipe => {
      // Sprawdź czy receptura ma powiązany produkt magazynowy o tej nazwie
      return recipe.productName && recipe.productName.toLowerCase() === productName.toLowerCase();
    });
    
    if (recipeWithInventoryProduct) {
      console.log(`Znaleziono recepturę powiązaną z produktem magazynowym ${productName}:`, recipeWithInventoryProduct.name);
      return recipeWithInventoryProduct;
    }
    
    // 3. Szukaj poprzez częściowe dopasowania (elastyczne wyszukiwanie)
    const matchingRecipes = recipes.filter(recipe => {
      const recipeName = recipe.name.toLowerCase();
      const product = productName.toLowerCase();
      
      // Usuń znaki specjalne i porównaj
      const cleanRecipeName = recipeName.replace(/[^a-zA-Z0-9]/g, '');
      const cleanProductName = product.replace(/[^a-zA-Z0-9]/g, '');
      
      // Sprawdź różne warianty porównania
      const recipeContainsProduct = recipeName.includes(product);
      const productContainsRecipe = product.includes(recipeName);
      const cleanNamesMatch = cleanRecipeName === cleanProductName;
      const cleanRecipeContainsProduct = cleanRecipeName.includes(cleanProductName);
      const cleanProductContainsRecipe = cleanProductName.includes(cleanRecipeName);
      
      // Sprawdź podobieństwo słów (podziel na słowa i sprawdź wspólne)
      const recipeWords = recipeName.split(/\s+/);
      const productWords = product.split(/\s+/);
      const commonWords = recipeWords.filter(word => 
        word.length > 2 && productWords.some(pWord => pWord.includes(word) || word.includes(pWord))
      );
      const hasCommonWords = commonWords.length > 0;
      
      // Sprawdź wyniki poszczególnych porównań dla debugowania
      if (recipeContainsProduct || productContainsRecipe || cleanNamesMatch || 
          cleanRecipeContainsProduct || cleanProductContainsRecipe || hasCommonWords) {
        console.log(`Częściowe dopasowanie: "${recipeName}" i "${product}"`);
        console.log(`  - receptura zawiera produkt: ${recipeContainsProduct}`);
        console.log(`  - produkt zawiera recepturę: ${productContainsRecipe}`);
        console.log(`  - czyste nazwy identyczne: ${cleanNamesMatch}`);
        console.log(`  - wspólne słowa: ${hasCommonWords} (${commonWords.join(', ')})`);
      }
      
      return recipeContainsProduct || productContainsRecipe || cleanNamesMatch || 
             cleanRecipeContainsProduct || cleanProductContainsRecipe || hasCommonWords;
    });
    
    if (matchingRecipes.length > 0) {
      // Preferuj dokładne dopasowania oczyszczonych nazw
      const perfectCleanMatch = matchingRecipes.find(recipe => {
        const cleanRecipeName = recipe.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
        const cleanProductName = productName.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
        return cleanRecipeName === cleanProductName;
      });
      
      if (perfectCleanMatch) {
        console.log(`Znaleziono najlepsze dopasowanie (czyste nazwy) dla produktu ${productName}:`, perfectCleanMatch.name);
        console.log(`Receptura ma domyślne stanowisko: ${perfectCleanMatch.defaultWorkstationId || 'BRAK'}`);
        return perfectCleanMatch;
      }
      
      // Jeśli nie ma idealnego dopasowania, wybierz najkrótszą nazwę (zwykle najbardziej dokładne dopasowanie)
      const bestMatch = matchingRecipes.reduce((prev, current) => 
        prev.name.length < current.name.length ? prev : current
      );
      
      console.log(`Znaleziono najlepsze częściowe dopasowanie dla produktu ${productName}:`, bestMatch.name);
      console.log(`Receptura ma domyślne stanowisko: ${bestMatch.defaultWorkstationId || 'BRAK'}`);
      return bestMatch;
    }
    
    console.log(`Nie znaleziono receptury dla produktu ${productName}`);
    console.log(`Dostępne receptury:`, recipes.map(r => r.name));
    return null;
  };
  
  // Funkcja do tworzenia materiałów na podstawie receptury
  const createMaterialsFromRecipe = (recipe, quantity) => {
    if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
      return [];
    }
    
    // Przelicz ilość materiałów na podstawie ilości produktów do wyprodukowania
    const recipeYield = recipe.yield?.quantity || 1;
    const scaleFactor = quantity / recipeYield;
    
    // Stwórz listę materiałów z odpowiednio przeliczonymi ilościami
    const materials = recipe.ingredients.map(ingredient => ({
      id: ingredient.id || ingredient.inventoryItemId,
      name: ingredient.name,
      quantity: preciseMultiply(ingredient.quantity, scaleFactor),
      unit: ingredient.unit,
      inventoryItemId: ingredient.inventoryItemId || ingredient.id || null,
      notes: `Z receptury: ${recipe.name}`
    }));
    
    console.log(`Utworzono ${materials.length} materiałów dla przepisu ${recipe.name}`);
    return materials;
  };
  
  // Funkcja do normalizacji jednostek - konwertuje wszystkie jednostki do jednej z trzech dozwolonych
  const normalizeUnit = (unit) => {
    if (!unit) return 'szt.'; // Domyślna jednostka
    
    // Normalizacja jednostek do dozwolonych wartości
    const unitLower = unit.toLowerCase();
    
    // Mapowanie jednostek do trzech dozwolonych
    if (unitLower.includes('szt') || unitLower.includes('pc') || unitLower === 'pcs' || unitLower === 'piece') {
      return 'szt.';
    } else if (unitLower.includes('kg') || unitLower.includes('kilo')) {
      return 'kg';
    } else if (unitLower.includes('cap') || unitLower === 'capsule' || unitLower === 'capsules') {
      return 'caps';
    }
    
    // Domyślnie zwracamy sztuki
    return 'szt.';
  };
  
  const fetchOrders = async () => {
    try {
      setLoading(true);
      // Próbujemy pobrać zamówienia z filtrem statusu 'Potwierdzone'
      let orderData = await getAllOrders({ status: 'Potwierdzone' });
      
      // Jeśli nie ma potwierdzonych zamówień, spróbujmy pobrać zamówienia ze statusem 'W realizacji'
      if (orderData.length === 0) {
        orderData = await getAllOrders({ status: 'W realizacji' });
      }
      
      // Jeśli nadal nie ma żadnych zamówień, pobierz wszystkie zamówienia
      if (orderData.length === 0) {
        orderData = await getAllOrders();
        console.log('Pobrano wszystkie zamówienia:', orderData.length);
      }
      
      setOrders(orderData);
    } catch (error) {
              showError(t('createFromOrder.alerts.loadingDataError', { error: error.message }));
    } finally {
      setLoading(false);
    }
  };
  
  const fetchOrderDetails = async (orderId) => {
    try {
      console.log(`[DEBUG-ORDER] Pobieranie szczegółów zamówienia: ${orderId}`);
      setOrderLoading(true);
      const orderData = await getOrderById(orderId);
      
      console.log(`[DEBUG-ORDER] Pobrano zamówienie: ${orderData.orderNumber}, ilość zadań: ${orderData.productionTasks?.length || 0}`);
      if (orderData.productionTasks && orderData.productionTasks.length > 0) {
        console.log(`[DEBUG-ORDER] Lista zadań w zamówieniu:`, orderData.productionTasks.map(task => ({
          id: task.id, 
          moNumber: task.moNumber,
          orderItemId: task.orderItemId
        })));
      }
      
      // Upewnij się, że wartość totalValue jest prawidłową liczbą
      if (orderData.totalValue) {
        orderData.totalValue = parseFloat(orderData.totalValue);
      }
      
      // Weryfikacja i czyszczenie nieistniejących zadań produkcyjnych
      console.log(`[DEBUG-ORDER] Weryfikacja zadań produkcyjnych w zamówieniu...`);
      const verifiedOrderData = await verifyProductionTasks(orderData);
      
      console.log(`[DEBUG-ORDER] Po weryfikacji, ilość zadań: ${verifiedOrderData.productionTasks?.length || 0}`);
      setSelectedOrder(verifiedOrderData);
      
      // Aktualizuj listę zamówień, aby odzwierciedlić aktualne dane
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.id === verifiedOrderData.id ? {...order, totalValue: verifiedOrderData.totalValue} : order
        )
      );
      
      // Sprawdź, czy zamówienie ma już utworzone zadania produkcyjne
      if (verifiedOrderData.productionTasks && verifiedOrderData.productionTasks.length > 0) {
        console.log(`[DEBUG-ORDER] Zamówienie ma już ${verifiedOrderData.productionTasks.length} zadań produkcyjnych`);
        showInfo(t('createFromOrder.alerts.existingTasks', { count: verifiedOrderData.productionTasks.length }) + ' ' + t('createFromOrder.alerts.duplicateWarning'));
        // Zapisz istniejące zadania do wyświetlenia w UI
        setExistingTasks(verifiedOrderData.productionTasks);
      } else {
        console.log(`[DEBUG-ORDER] Zamówienie nie ma jeszcze zadań produkcyjnych`);
        // Wyczyść listę istniejących zadań, jeśli wybrano nowe zamówienie bez zadań
        setExistingTasks([]);
      }
      
      // Ustaw początkowe wartości dla formularza zadania
      setTaskForm({
        name: `${t('orders.labels.order', 'Zamówienie')} #${verifiedOrderData.orderNumber || verifiedOrderData.id.substring(0, 8)}`,
        priority: 'normal',
        description: `${t('createFromOrder.messages.taskCreatedFromOrder', 'Zadanie utworzone na podstawie zamówienia klienta')} ${verifiedOrderData.customer?.name || t('createFromOrder.placeholders.noCustomer')}`,
        status: 'Zaplanowane',
        reservationMethod: 'fifo',
        autoReserveMaterials: false
      });
      
      // Inicjalizacja zaznaczonych elementów
      if (verifiedOrderData.items && verifiedOrderData.items.length > 0) {
        console.log(`[DEBUG-ORDER] Zamówienie ma ${verifiedOrderData.items.length} pozycji`);
        // Tworzenie nowego stanu dla zaznaczonych elementów
        const initialSelectedItems = verifiedOrderData.items.map((item, index) => ({
          ...item,
          itemId: item.id || index, // Używamy id jeśli istnieje, w przeciwnym razie indeks
          selected: false, // Domyślnie nic nie jest zaznaczone
          unit: normalizeUnit(item.unit) // Normalizacja jednostek do dopuszczalnych wartości
        }));
        
        setSelectedItems(initialSelectedItems);
        
        // Sprawdź receptury dla wszystkich elementów i zainicjalizuj stanowiska produkcyjne
        console.log("[DEBUG-ORDER] Sprawdzanie receptur dla elementów zamówienia po inicjalizacji");
        const initialWorkstations = {};
        
        for (const item of verifiedOrderData.items) {
          const recipe = findRecipeForProduct(item.name);
          if (recipe && recipe.defaultWorkstationId) {
            console.log(`[DEBUG-ORDER] Inicjalizacja stanowiska dla ${item.name}: ${recipe.defaultWorkstationId}`);
            initialWorkstations[item.id] = recipe.defaultWorkstationId;
          }
        }
        
        if (Object.keys(initialWorkstations).length > 0) {
          console.log("[DEBUG-ORDER] Ustawiam początkowe stanowiska produkcyjne:", initialWorkstations);
          setSelectedWorkstations(initialWorkstations);
        }
      } else {
        console.log(`[DEBUG-ORDER] Zamówienie nie ma żadnych pozycji`);
        setSelectedItems([]);
      }
    } catch (error) {
      console.error(`[ERROR-ORDER] Błąd podczas pobierania szczegółów zamówienia:`, error);
      showError(t('createFromOrder.alerts.loadingOrderError', { error: error.message }));
    } finally {
      setOrderLoading(false);
    }
  };
  
  const handleOrderChange = (event) => {
    const orderId = event.target.value;
    setSelectedOrderId(orderId);
    
    // Zawsze czyść listę istniejących zadań przy zmianie zamówienia
    setExistingTasks([]);
    
    if (orderId) {
      fetchOrderDetails(orderId);
    } else {
      setSelectedOrder(null);
      setSelectedItems([]);
    }
  };
  
  const handleTaskFormChange = (e) => {
    const { name, value } = e.target;
    
    // Standardowa obsługa dla wszystkich pól - usuwamy specjalną obsługę dat,
    // która sprawiała problemy
    setTaskForm(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleItemSelect = (itemId) => {
    if (Array.isArray(selectedItems)) {
    setSelectedItems(prev => 
      prev.map(item => 
          (item.id === itemId)
          ? { ...item, selected: !item.selected } 
          : item
      )
    );
    } else {
      // Dla przypadku gdy selectedItems jest obiektem
      setSelectedItems(prev => ({
        ...prev,
        [itemId]: !prev[itemId]
      }));
    }
  };
  
  const handleSelectAllItems = (event) => {
    if (!selectedOrder || !selectedOrder.items) return;
    
    const { checked } = event.target;
    
    // Filtruj produkty, aby zaznaczać tylko te, które mają przypisaną recepturę
    const productsWithRecipes = selectedOrder.items.filter(item => {
      const recipe = findRecipeForProduct(item.name);
      return !!recipe; // Zwróci true tylko dla produktów z recepturą
    });
    
    const newSelectedItems = { ...selectedItems };
    
    // Zaznacz/odznacz wszystkie produkty z recepturami
    productsWithRecipes.forEach(item => {
      // Sprawdź, czy element ma już utworzone zadanie (używając tej samej logiki co w renderProductsTable)
      const hasTask = existingTasks.some(task => {
        // Jeśli mamy orderItemId w zadaniu, użyj go do porównania
        if (task.orderItemId && item.id) {
          return task.orderItemId === item.id;
        }
        // Alternatywnie sprawdź po nazwie produktu i ilości (mniej precyzyjne)
        return task.productName === item.name && 
               task.quantity === item.quantity;
      });
      
      // Aktualizuj wybór tylko dla elementów, które nie mają jeszcze zadań
      if (!hasTask) {
        newSelectedItems[item.id] = checked;
      }
    });
    
    setSelectedItems(newSelectedItems);
  };
  
  const handleCreateTask = async () => {
    // Sprawdź czy wybrano co najmniej jeden element
    let hasSelectedItems = false;
    
    if (Array.isArray(selectedItems)) {
      hasSelectedItems = selectedItems.some(item => item.selected);
    } else {
      hasSelectedItems = Object.values(selectedItems).some(Boolean);
    }
    
    if (!hasSelectedItems) {
      showError(t('createFromOrder.alerts.selectAtLeastOne'));
      return;
    }
    
    try {
      setCreatingTasks(true);
      
      // Przygotuj dane zadania produkcyjnego
      const selectedProductItems = Array.isArray(selectedItems) 
        ? selectedItems.filter(item => item.selected) 
        : selectedOrder.items.filter(item => selectedItems[item.id]);
      
      console.log(`[DEBUG-CREATE] Tworzenie zadań produkcyjnych z zamówienia: ${selectedOrder.orderNumber || selectedOrder.id}`);
      console.log(`[DEBUG-CREATE] Liczba wybranych pozycji: ${selectedProductItems.length}`);
      
      // Dla każdego wybranego produktu z zamówienia, tworzymy zadanie produkcyjne
      for (const item of selectedProductItems) {
        console.log(`[DEBUG-CREATE] Przetwarzanie pozycji: "${item.name}" (ID: ${item.id})`);
        
        // Sprawdź czy dla tego produktu wybrano recepturę
        const recipeId = item.recipeId;
        let recipeData = null;
        
        // Jeśli produkt ma przypisaną recepturę, pobierz jej szczegóły
        if (recipeId) {
          console.log(`[DEBUG-CREATE] Receptura przypisana do pozycji: ${recipeId}`);
          try {
            const { getRecipeById } = await import('../../services/recipeService');
            recipeData = await getRecipeById(recipeId);
            console.log(`[DEBUG-CREATE] Pobrano dane receptury: ${recipeData.name}`);
          } catch (error) {
            console.error(`[ERROR-CREATE] Błąd pobierania receptury ${recipeId}:`, error);
            showError(t('createFromOrder.alerts.loadingDataError', { error: error.message }));
            continue;
          }
        } else {
          // Spróbuj znaleźć recepturę na podstawie nazwy produktu
          const recipe = findRecipeForProduct(item.name);
          if (recipe) {
            recipeData = recipe;
            console.log(`[DEBUG-CREATE] Znaleziono recepturę po nazwie: ${recipe.name} (ID: ${recipe.id})`);
          } else {
            console.log(`[DEBUG-CREATE] Nie znaleziono receptury dla pozycji: ${item.name}`);
          }
        }
        
        // Utwórz listę materiałów na podstawie receptury
        const materials = recipeData ? createMaterialsFromRecipe(recipeData, item.quantity) : [];
        console.log(`[DEBUG-CREATE] Utworzono listę ${materials.length} materiałów dla zadania`);
        
        // Normalizuj jednostkę - upewnij się, że używamy prawidłowego formatu
        const normalizedUnit = normalizeUnit(item.unit || 'szt.');
        
        // Pobierz czas produkcji z receptury (jeśli dostępny)
        let productionTimePerUnit = 0;
        if (recipeData && recipeData.productionTimePerUnit) {
          productionTimePerUnit = parseFloat(recipeData.productionTimePerUnit);
        }
        
        // Oblicz szacowany czas trwania zadania
        const itemQuantity = parseFloat(item.quantity) || 0;
        let estimatedDuration = 0;
        if (productionTimePerUnit > 0 && itemQuantity > 0) {
          estimatedDuration = productionTimePerUnit * itemQuantity;
        }
        
        // Ustal daty rozpoczęcia i zakończenia zadania
        let startDate = new Date();
        if (item.productionDate) {
          startDate = new Date(item.productionDate);
        }
        
        // Użyj aktualnej godziny dla daty startu
        const currentTime = new Date();
        startDate.setHours(currentTime.getHours(), currentTime.getMinutes(), 0, 0);
        
        // Jeśli data rozpoczęcia przypada na weekend, przenieś do następnego dnia roboczego
        while (isWeekend(startDate)) {
          startDate.setDate(startDate.getDate() + 1);
          startDate.setHours(8, 0, 0, 0); // Rozpocznij o 8:00 w dniu roboczym
        }
        
        // Formatuj datę rozpoczęcia z godziną
        const formattedStartDate = startDate.toISOString();
        
        // Oblicz datę zakończenia na podstawie szacowanego czasu trwania, uwzględniając dni robocze
        let endDate;
        if (estimatedDuration > 0) {
          // Użyj nowej funkcji uwzględniającej godziny pracy zakładu (domyślnie 16h)
          endDate = calculateEndDateWithWorkingHours(startDate, estimatedDuration, 16);
        } else {
          // Jeśli nie ma czasu produkcji, dodaj 1 dzień roboczy
          endDate = new Date(startDate);
          endDate.setDate(endDate.getDate() + 1);
          while (isWeekend(endDate)) {
            endDate.setDate(endDate.getDate() + 1);
          }
        }
        
        // Formatuj datę zakończenia z godziną
        const formattedEndDate = endDate.toISOString();
        
        // Sprawdź, czy dla tego produktu wybrano stanowisko produkcyjne
        const workstationId = selectedWorkstations[item.id] || (recipeData && recipeData.defaultWorkstationId ? recipeData.defaultWorkstationId : null);
        console.log(`[DEBUG-CREATE] Stanowisko produkcyjne: ${workstationId || 'nie wybrano'}`);
        
        // Przy tworzeniu obiektów zadań, dodajemy pola lotNumber i expiryDate:
        const taskData = {
          name: taskForm.name || `${item.name}`,
          status: taskForm.status || 'Zaplanowane',
          priority: taskForm.priority || 'Normalny',
          scheduledDate: formattedStartDate,
          endDate: formattedEndDate,
          productName: item.name,
          quantity: item.quantity,
          unit: normalizedUnit,
          materials: materials,
          description: taskForm.description || `Zadanie utworzone z zamówienia klienta #${selectedOrder.orderNumber || selectedOrder.id}`,
          createdBy: currentUser.uid,
          createdAt: new Date().toISOString(),
          recipe: recipeData,
          recipeVersion: recipeData?.version || 1, // Dodanie wersji receptury
          recipeName: recipeData?.name || item.name, // Dodanie nazwy receptury
          orderId: selectedOrder.id, // Dodanie orderId do zadania
          orderNumber: selectedOrder.orderNumber || selectedOrder.id,
          orderItemId: item.id, // Dodanie identyfikatora pozycji zamówienia
          customer: selectedOrder.customer || null,
          purchaseOrders: selectedOrder.linkedPurchaseOrders && selectedOrder.linkedPurchaseOrders.length > 0 
            ? selectedOrder.linkedPurchaseOrders.map(po => ({
                id: po.id,
                number: po.number || po.poNumber,
                poNumber: po.poNumber || po.number
              }))
            : [], // Zapewnienie, że purchaseOrders jest zawsze tablicą, nawet jeśli puste
          isEssential: true,
          reservationMethod: taskForm.reservationMethod || 'fifo',
          productionTimePerUnit: productionTimePerUnit,
          estimatedDuration: estimatedDuration,
          autoReserveMaterials: taskForm.autoReserveMaterials, // Przekazanie informacji o automatycznej rezerwacji
          workstationId: workstationId // ID stanowiska produkcyjnego
          // Data ważności nie jest już ustawiana domyślnie - będzie wymagana przy starcie produkcji
        };
        
        console.log(`[DEBUG-CREATE] Dane zadania do utworzenia:`, JSON.stringify({
          name: taskData.name,
          productName: taskData.productName,
          orderId: taskData.orderId,
          orderNumber: taskData.orderNumber,
          orderItemId: taskData.orderItemId,
        }, null, 2));
        
        // Utwórz zadanie produkcyjne
        // Uwaga: funkcja createTask automatycznie rezerwuje materiały dla zadania
        console.log(`[DEBUG-CREATE] Wywołuję createTask dla pozycji ${item.name}`);
        const newTask = await createTask(taskData, currentUser.uid, taskForm.autoReserveMaterials);
        
        if (newTask) {
          console.log(`[DEBUG-CREATE] Zadanie utworzone: ${newTask.id}, MO: ${newTask.moNumber}`);
          console.log(`[DEBUG-CREATE] Dodaję zadanie ${newTask.id} do zamówienia ${selectedOrder.id} z orderItemId: ${item.id}`);
          
          // Dodaj zadanie do zamówienia, przekazując ID pozycji zamówienia
          await addProductionTaskToOrder(selectedOrder.id, newTask, item.id);
          
          // Dodaj zadanie do listy utworzonych zadań
          setTasksCreated(prev => [...prev, newTask]);
        } else {
          console.error(`[ERROR-CREATE] Nie udało się utworzyć zadania dla pozycji ${item.name}`);
        }
      }
      
      // Pokaż sukces, jeśli utworzono przynajmniej jedno zadanie
      if (tasksCreated.length > 0) {
        console.log(`[DEBUG-CREATE] Utworzono łącznie ${tasksCreated.length} zadań produkcyjnych`);
        showSuccess(t('createFromOrder.alerts.tasksCreated', { count: tasksCreated.length }));
        
        // Dodaj nowo utworzone zadania do listy istniejących zadań
        setExistingTasks(prev => [...prev, ...tasksCreated]);
        
        // Odśwież szczegóły zamówienia, aby pokazać nowo utworzone zadania
        console.log(`[DEBUG-CREATE] Odświeżam szczegóły zamówienia ${selectedOrder.id}`);
        fetchOrderDetails(selectedOrder.id);
      } else {
        console.warn(`[WARN-CREATE] Nie utworzono żadnych zadań produkcyjnych`);
      }
    } catch (error) {
      console.error('[ERROR-CREATE] Błąd podczas tworzenia zadań produkcyjnych:', error);
      showError(t('createFromOrder.alerts.creatingTasksError', { error: error.message }));
    } finally {
      setCreatingTasks(false);
    }
  };
  
  const handleBack = () => {
    navigate('/orders');
  };
  
  const areAllItemsSelected = Array.isArray(selectedItems) 
    ? selectedItems.length > 0 && selectedItems.every(item => item.selected)
    : Object.keys(selectedItems).length > 0 && Object.values(selectedItems).every(Boolean);
    
  const someItemsSelected = Array.isArray(selectedItems)
    ? selectedItems.some(item => item.selected)
    : Object.keys(selectedItems).length > 0 && Object.values(selectedItems).some(Boolean);

  // Inicjalizacja zadań produkcyjnych na podstawie wybranego zamówienia
  const initializeTasksFromOrder = () => {
    if (!selectedOrder || !selectedOrder.items) return;
    
    console.log('Inicjalizacja zadań produkcyjnych z zamówienia:', selectedOrder.id);
    
    // Filtruj produkty, aby inicjalizować tylko te, które mają przypisaną recepturę
    const productsWithRecipes = selectedOrder.items.filter(item => {
      const recipe = findRecipeForProduct(item.name);
      return !!recipe; // Zwróci true tylko dla produktów z recepturą
    });
    
    // Inicjalizuj wybrane elementy dla wszystkich produktów z recepturami
    const initialSelectedItems = {};
    
    // Tworzenie nowego stanu produktów wybranych do produkcji
    productsWithRecipes.forEach(item => {
      initialSelectedItems[item.id] = false; // Domyślnie odznaczone
      
      // Przypisz domyślne stanowisko produkcyjne na podstawie receptury
      const recipe = findRecipeForProduct(item.name);
      if (recipe && recipe.defaultWorkstationId) {
        console.log(`Przypisuję stanowisko produkcyjne ${recipe.defaultWorkstationId} dla produktu ${item.name}`);
        setSelectedWorkstations(prev => ({
          ...prev,
          [item.id]: recipe.defaultWorkstationId
        }));
      }
      
      // Ustaw domyślną datę produkcji dla produktu
      setProductDates(prev => ({
        ...prev,
        [item.id]: selectedOrder.expectedDeliveryDate ? 
          new Date(selectedOrder.expectedDeliveryDate) : 
          new Date()
      }));
    });
    
    // Ustaw stan dla wybranych produktów
    setSelectedItems(initialSelectedItems);
    
    // Sprawdź, czy są już istniejące zadania produkcyjne dla tego zamówienia
    if (selectedOrder.productionTasks && selectedOrder.productionTasks.length > 0) {
      console.log(`Znaleziono ${selectedOrder.productionTasks.length} istniejących zadań produkcyjnych.`);
      setExistingTasks(selectedOrder.productionTasks);
    } else {
      console.log('Brak istniejących zadań produkcyjnych.');
      setExistingTasks([]);
    }
  };

  // Obsługa wyboru zamówienia
  const handleOrderSelect = async (_, order) => {
    if (order) {
      console.log('Wybrano zamówienie:', order);
      setSelectedOrder(order);
      
      try {
        // Najpierw pobierz receptury, aby zapewnić dostępność informacji o domyślnych stanowiskach
        if (order.customer && order.customer.id) {
          await fetchRecipesForCustomer(order.customer.id);
        } else {
          await fetchRecipes();
        }
        
        // Następnie inicjalizuj zadania produkcyjne i stanowiska produkcyjne
        initializeTasksFromOrder();
      } catch (error) {
        console.error('Błąd podczas pobierania receptur:', error);
        showError('Błąd podczas pobierania receptur: ' + error.message);
      }
    } else {
      setSelectedOrder(null);
      setSelectedItems({});
      setSelectedWorkstations({});
    }
  };

  // Funkcja do tworzenia zadań produkcyjnych na podstawie wybranych produktów
  const createTasksFromSelectedProducts = async () => {
    try {
      setCreatingTasks(true);
      
      // Pobieranie zaznaczonych elementów w zależności od struktury selectedItems
      let selectedProductItemIds = [];
      
      if (Array.isArray(selectedItems)) {
        // Jeśli selectedItems jest tablicą obiektów z właściwością selected
        const selectedProductItems = selectedItems.filter(item => item.selected);
        if (selectedProductItems.length === 0) {
          showWarning(t('createFromOrder.alerts.noProductsSelected'));
          setCreatingTasks(false);
          return;
        }
        selectedProductItemIds = selectedProductItems.map(item => item.id || item.itemId);
      } else {
        // Jeśli selectedItems jest obiektem, gdzie klucze to ID elementów, a wartości to flagi selected
        selectedProductItemIds = Object.keys(selectedItems).filter(itemId => selectedItems[itemId]);
        if (selectedProductItemIds.length === 0) {
          showWarning(t('createFromOrder.alerts.noProductsSelected'));
          setCreatingTasks(false);
          return;
        }
      }
      
      console.log("Wybrane produkty do produkcji:", selectedProductItemIds);
      
      // Tworzenie tablicy na utworzone zadania i listę błędów
      const createdTasks = [];
      const errors = [];
      
      // Przetwarzanie każdego zaznaczonego przedmiotu
      for (const itemId of selectedProductItemIds) {
        try {
          // Znajdź przedmiot w zamówieniu
          const orderItem = selectedOrder.items.find(item => item.id === itemId);
          if (!orderItem) {
            errors.push(`Nie znaleziono pozycji o ID ${itemId} w zamówieniu.`);
            continue;
          }
          
          // Sprawdź, czy produkt ma już przypisaną recepturę
          let recipeId = orderItem.recipeId;
          let recipeData = null;
          
          if (!recipeId) {
            // Spróbuj znaleźć recepturę na podstawie nazwy produktu, jeśli nie ma przypisanej
            const matchingRecipe = findRecipeForProduct(orderItem.name);
            if (matchingRecipe) {
              recipeId = matchingRecipe.id;
              recipeData = matchingRecipe;
            } else {
              errors.push(`Brak receptury dla produktu ${orderItem.name}. Zadanie nie zostało utworzone.`);
              continue; // Przejdź do następnego produktu, jeśli brak receptury
            }
          } else {
            // Pobierz dane receptury, jeśli mamy jej ID
            try {
              recipeData = await getRecipeById(recipeId);
              if (!recipeData) {
                errors.push(`Nie znaleziono receptury o ID ${recipeId} dla produktu ${orderItem.name}. Zadanie nie zostało utworzone.`);
                continue; // Przejdź do następnego produktu, jeśli brak receptury
              }
            } catch (recipeError) {
              console.error(`Błąd pobierania receptury ${recipeId}:`, recipeError);
              errors.push(`Błąd pobierania receptury dla produktu ${orderItem.name}: ${recipeError.message}. Zadanie nie zostało utworzone.`);
              continue; // Przejdź do następnego produktu w przypadku błędu
            }
          }
          
          // Upewnij się, że mamy dane receptury przed kontynuacją
          if (!recipeData) {
            errors.push(`Brak danych receptury dla produktu ${orderItem.name}. Zadanie nie zostało utworzone.`);
            continue;
          }
          
          // Określenie jednostki produktu
          const unit = orderItem.unit || 'szt.';
          
          // Sprawdź, czy mamy datę dla tego produktu, jeśli nie - użyj domyślnej
          let orderItemDate = productDates[itemId] || new Date();
          
          // Upewnij się, że data rozpoczęcia przypada na dzień roboczy
          while (isWeekend(orderItemDate)) {
            orderItemDate.setDate(orderItemDate.getDate() + 1);
            orderItemDate.setHours(8, 0, 0, 0); // Rozpocznij o 8:00 w dniu roboczym
          }
          
          // Tworzenie nazwy zadania
          const taskName = `${orderItem.name} (${selectedOrder.orderNumber || selectedOrder.id.substring(0, 8)})`;
          
          // Utworzenie listy materiałów na podstawie receptury
          const materials = recipeData ? createMaterialsFromRecipe(recipeData, orderItem.quantity) : [];
          
          // Sprawdź czy mamy czas produkcji z receptury
          let productionTimePerUnit = 0;
          if (recipeData && recipeData.productionTimePerUnit) {
            productionTimePerUnit = parseFloat(recipeData.productionTimePerUnit);
          }
          
          // Obliczenie szacowanego czasu trwania zadania
          let estimatedDuration = 0;
          if (productionTimePerUnit > 0) {
            estimatedDuration = productionTimePerUnit * orderItem.quantity;
          }
          
          // Oblicz datę zakończenia uwzględniając dni robocze
          let endDate;
          if (estimatedDuration > 0) {
            // Użyj nowej funkcji uwzględniającej godziny pracy zakładu (domyślnie 16h)
            endDate = calculateEndDateWithWorkingHours(orderItemDate, estimatedDuration, 16);
          } else {
            // Jeśli nie ma czasu produkcji, dodaj 1 dzień roboczy
            endDate = new Date(orderItemDate);
            endDate.setDate(endDate.getDate() + 1);
            while (isWeekend(endDate)) {
              endDate.setDate(endDate.getDate() + 1);
            }
          }
          
          // Sprawdź, czy dla tego elementu zostało wybrane stanowisko produkcyjne
          let workstationId = selectedWorkstations[itemId] || '';
          
          // Jeśli nie wybrano stanowiska, a receptura ma domyślne stanowisko produkcyjne, użyj tego z receptury
          if (!workstationId && recipeData && recipeData.defaultWorkstationId) {
            workstationId = recipeData.defaultWorkstationId;
          }
          
          // Dane zadania produkcyjnego
          const taskData = {
            name: taskName,
            description: `Zadanie produkcyjne utworzone automatycznie na podstawie zamówienia ${selectedOrder.orderNumber || selectedOrder.id} dla klienta ${selectedOrder.customer?.name || 'Nieznany'}.`,
            recipeId: recipeId,
            recipeVersion: recipeData.version || 1, // Dodanie wersji receptury
            recipeName: recipeData.name || orderItem.name, // Dodanie nazwy receptury
            productName: orderItem.name,
            quantity: orderItem.quantity,
            unit: unit,
            scheduledDate: orderItemDate,
            endDate: endDate,
            estimatedDuration: estimatedDuration,
            productionTimePerUnit: productionTimePerUnit,
            priority: taskForm.priority || 'Normalny',
            status: taskForm.status || 'Zaplanowane',
            notes: `Powiązane zamówienie klienta: ${selectedOrder.orderNumber || selectedOrder.id}`,
            materials: materials,
            // Pola specyficzne dla zadania z zamówienia
            orderItemId: itemId,
            orderId: selectedOrder.id,
            orderNumber: selectedOrder.orderNumber,
            customerId: selectedOrder.customer?.id,
            customerName: selectedOrder.customer?.name,
            // Dodaj informacje o dodatkowym przetwarzaniu
            postProcessingRequirements: orderItem.postProcessingRequirements || '',
            packaging: orderItem.packaging || '',
            workstationId: workstationId, // Przypisujemy stanowisko produkcyjne
            // Dodajemy pole dla informacji o rezerwacji materiałów
            reservationMethod: taskForm.reservationMethod || 'fifo',
            autoReserveMaterials: taskForm.autoReserveMaterials || false
          };
          
          // Utwórz zadanie produkcyjne
          const newTask = await createTask(taskData, currentUser.uid, taskForm.autoReserveMaterials);
          
          if (newTask) {
            // Dodaj zadanie do listy utworzonych zadań
            createdTasks.push(newTask);
          }
        } catch (error) {
          console.error(`Błąd podczas tworzenia zadania ${itemId}:`, error);
          errors.push(`Błąd podczas tworzenia zadania ${itemId}: ${error.message}`);
        }
      }
      
      // Pokaż sukces, jeśli utworzono przynajmniej jedno zadanie
      if (createdTasks.length > 0) {
        showSuccess(t('createFromOrder.alerts.tasksCreated', { count: createdTasks.length }));
        
        // Odśwież szczegóły zamówienia, aby pokazać nowo utworzone zadania
        // Nie dodawaj ręcznie do existingTasks - fetchOrderDetails pobierze aktualne dane
        await fetchOrderDetails(selectedOrder.id);
      }
    } catch (error) {
      console.error('Błąd podczas tworzenia zadań produkcyjnych:', error);
      showError(t('createFromOrder.alerts.creatingTasksError', { error: error.message }));
    } finally {
      setCreatingTasks(false);
    }
  };

  // Pobieranie receptur dla określonego klienta
  const fetchRecipesForCustomer = async (customerId) => {
    try {
      console.log('Pobieranie receptur dla klienta:', customerId);
      const recipesData = await getRecipesByCustomer(customerId);
      setRecipes(recipesData);
      console.log('Pobrano receptur dla klienta:', recipesData.length);
    } catch (error) {
      console.error('Błąd podczas pobierania receptur dla klienta:', error);
      showError(t('createFromOrder.alerts.loadingDataError', { error: error.message }));
      // W przypadku błędu - spróbuj pobrać wszystkie receptury
      fetchRecipes();
    }
  };

  // Funkcja sprawdzająca czy zadania produkcyjne istnieją i usuwająca nieistniejące referencje
  const verifyProductionTasks = async (orderData) => {
    if (!orderData || !orderData.productionTasks || orderData.productionTasks.length === 0) {
      console.log(`[DEBUG-VERIFY] Zamówienie ${orderData?.id || 'nieznane'} nie ma zadań produkcyjnych`);
      return orderData;
    }

    try {
      console.log(`[DEBUG-VERIFY] Weryfikacja ${orderData.productionTasks.length} zadań produkcyjnych w zamówieniu ${orderData.id}`);
      console.log(`[DEBUG-VERIFY] Lista zadań do weryfikacji:`, orderData.productionTasks.map(task => ({
        id: task.id,
        moNumber: task.moNumber,
        orderItemId: task.orderItemId
      })));
      
      const { getTaskById, deleteTask } = await import('../../services/productionService');
      const { removeProductionTaskFromOrder } = await import('../../services/orderService');
      
      const verifiedTasks = [];
      const tasksToRemove = [];
      
      // Sprawdź każde zadanie produkcyjne
      for (const task of orderData.productionTasks) {
        try {
          console.log(`[DEBUG-VERIFY] Weryfikacja zadania ${task.id} (${task.moNumber || 'brak MO'})`);
          // Próba pobrania zadania z bazy
          const taskDetails = await getTaskById(task.id);
          
          if (taskDetails) {
            console.log(`[DEBUG-VERIFY] Zadanie ${task.id} istnieje w bazie, orderItemId w bazie: ${taskDetails.orderItemId || 'brak'}, orderItemId w zamówieniu: ${task.orderItemId || 'brak'}`);
            
            // Sprawdź, czy orderItemId w zadaniu i zamówieniu są spójne
            if (task.orderItemId && (!taskDetails.orderItemId || taskDetails.orderItemId !== task.orderItemId)) {
              console.log(`[DEBUG-VERIFY] Niespójność orderItemId dla zadania ${task.id}. Aktualizuję zadanie w bazie.`);
              
              // Aktualizuj zadanie w bazie danych
              const { updateTask } = await import('../../services/productionService');
              await updateTask(task.id, {
                orderItemId: task.orderItemId,
                orderId: orderData.id,
                orderNumber: orderData.orderNumber
              }, 'system');
              
              console.log(`[DEBUG-VERIFY] Zaktualizowano zadanie ${task.id} w bazie z orderItemId: ${task.orderItemId}`);
            }
            
            verifiedTasks.push(task);
          } else {
            console.log(`[DEBUG-VERIFY] Zadanie produkcyjne ${task.id} (${task.moNumber || 'brak MO'}) nie istnieje w bazie.`);
            tasksToRemove.push(task);
          }
        } catch (error) {
          console.error(`[ERROR-VERIFY] Błąd podczas weryfikacji zadania ${task.id}:`, error);
          tasksToRemove.push(task);
        }
      }
      
      // Jeśli znaleziono nieistniejące zadania, usuń ich referencje z zamówienia
      if (tasksToRemove.length > 0) {
        console.log(`[DEBUG-VERIFY] Znaleziono ${tasksToRemove.length} nieistniejących zadań do usunięcia z zamówienia`);
        
        for (const task of tasksToRemove) {
          try {
            console.log(`[DEBUG-VERIFY] Usuwanie referencji do zadania ${task.id} z zamówienia ${orderData.id}`);
            await removeProductionTaskFromOrder(orderData.id, task.id);
            console.log(`[DEBUG-VERIFY] Usunięto nieistniejące zadanie ${task.id} (${task.moNumber || 'brak MO'}) z zamówienia ${orderData.id}`);
          } catch (error) {
            console.error(`[ERROR-VERIFY] Błąd podczas usuwania referencji do zadania ${task.id}:`, error);
          }
        }
        
        // Zaktualizuj dane zamówienia lokalnie (bez pobierania z bazy)
        const updatedOrder = {
          ...orderData,
          productionTasks: verifiedTasks
        };
        
        console.log(`[DEBUG-VERIFY] Po weryfikacji, zaktualizowane zamówienie ma ${verifiedTasks.length} zadań produkcyjnych`);
        showInfo(t('createFromOrder.alerts.cleanedUpTasks', { count: tasksToRemove.length }));
        return updatedOrder;
      }
      
      console.log(`[DEBUG-VERIFY] Weryfikacja zadań zakończona, wszystkie ${verifiedTasks.length} zadań istnieje w bazie`);
      return orderData;
    } catch (error) {
      console.error('[ERROR-VERIFY] Błąd podczas weryfikacji zadań produkcyjnych:', error);
      return orderData;
    }
  };

  // Sprawdza, czy wszystkie elementy są zaznaczone
  const isAllSelected = () => {
    if (!selectedOrder || !selectedOrder.items || selectedOrder.items.length === 0) return false;
    
    // Filtruj produkty, aby sprawdzać tylko te, które mają przypisaną recepturę
    const productsWithRecipes = selectedOrder.items.filter(item => {
      const recipe = findRecipeForProduct(item.name);
      return !!recipe; // Zwróci true tylko dla produktów z recepturą
    });
    
    if (productsWithRecipes.length === 0) return false;
    
    // Sprawdź, czy wszystkie produkty z recepturami są zaznaczone
    return productsWithRecipes.every(item => selectedItems[item.id]);
  };

  // Sprawdza, czy część elementów jest zaznaczona
  const isPartiallySelected = () => {
    if (!selectedOrder || !selectedOrder.items || selectedOrder.items.length === 0) return false;
    
    // Filtruj produkty, aby sprawdzać tylko te, które mają przypisaną recepturę
    const productsWithRecipes = selectedOrder.items.filter(item => {
      const recipe = findRecipeForProduct(item.name);
      return !!recipe; // Zwróci true tylko dla produktów z recepturą
    });
    
    if (productsWithRecipes.length === 0) return false;
    
    const selectedCount = productsWithRecipes.filter(item => selectedItems[item.id]).length;
    return selectedCount > 0 && selectedCount < productsWithRecipes.length;
  };
  
  // Funkcja sprawdzająca czy konkretny produkt jest zaznaczony
  const isItemSelected = (itemId) => {
    if (Array.isArray(selectedItems)) {
      return selectedItems.some(item => item.id === itemId && item.selected);
    } else {
      return Boolean(selectedItems[itemId]);
    }
  };
  
  // Pobierz stanowiska produkcyjne
  const fetchWorkstations = async () => {
    try {
      const workstationsData = await getAllWorkstations();
      setWorkstations(workstationsData);
    } catch (error) {
      showError(t('createFromOrder.alerts.loadingWorkstationsError', { error: error.message }));
      console.error('Error fetching workstations:', error);
    }
  };

  // Obsługa wyboru stanowiska produkcyjnego dla zadania
  const handleWorkstationChange = (itemId, workstationId) => {
    // Jeśli stanowisko jest ustawione na puste, spróbuj ustawić domyślne z receptury
    if (workstationId === '') {
      // Znajdź recepturę dla produktu
      const item = selectedOrder?.items?.find(i => i.id === itemId);
      if (item) {
        const recipe = findRecipeForProduct(item.name);
        // Jeśli receptura ma domyślne stanowisko, ustaw je
        if (recipe && recipe.defaultWorkstationId) {
          workstationId = recipe.defaultWorkstationId;
        }
      }
    }
    
    setSelectedWorkstations(prev => ({
      ...prev,
      [itemId]: workstationId
    }));
  };

  // ⚡ OPTYMALIZACJA: useCallback zapobiega recreating funkcji przy każdym renderze
  const handleProductDateChange = useCallback((e, itemId) => {
    const { value } = e.target;
    // Aktualizuj daty rozpoczęcia dla konkretnych produktów
    setProductDates(prevDates => ({
      ...prevDates,
      [itemId]: value
    }));
  }, []);

  // ⚡ OPTYMALIZACJA: useCallback zapobiega recreating funkcji przy każdym renderze
  const renderProductsTable = useCallback(() => {
    if (!selectedOrder || !selectedOrder.items || selectedOrder.items.length === 0) {
      return (
        <Typography variant="body1" sx={{ my: 2 }}>
          {t('createFromOrder.messages.orderHasNoItems')}
        </Typography>
      );
    }

    // Filtruj produkty, aby wyświetlać tylko te, które mają przypisaną recepturę
    const productsWithRecipes = selectedOrder.items.filter(item => {
      const recipe = findRecipeForProduct(item.name);
      return !!recipe; // Zwróci true tylko dla produktów z recepturą
    });

    if (productsWithRecipes.length === 0) {
      return (
        <Typography variant="body1" sx={{ my: 2 }}>
          {t('createFromOrder.messages.orderHasNoRecipes')}
        </Typography>
      );
    }

    return (
      <TableContainer component={Paper} sx={{ mt: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox 
                  checked={isAllSelected()}
                  onChange={handleSelectAllItems}
                  indeterminate={isPartiallySelected()}
                />
              </TableCell>
              <TableCell>{t('createFromOrder.productTable.product')}</TableCell>
              <TableCell align="right">{t('createFromOrder.productTable.quantity')}</TableCell>
              <TableCell>{t('createFromOrder.productTable.unit')}</TableCell>
              <TableCell align="right">{t('createFromOrder.productTable.price')}</TableCell>
              <TableCell align="right">{t('createFromOrder.productTable.value')}</TableCell>
              <TableCell>{t('createFromOrder.productTable.status')}</TableCell>
              <TableCell>{t('createFromOrder.productTable.productionTime')}</TableCell>
              <TableCell>{t('createFromOrder.productTable.productionDate')}</TableCell>
              <TableCell>{t('createFromOrder.productTable.workstation')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {productsWithRecipes.map((item) => {
              // Znajdź recepturę dla produktu
              const recipe = findRecipeForProduct(item.name);
              // Oblicz planowany czas produkcji dla 1 szt.
              const productionTimePerUnit = recipe?.productionTimePerUnit || 0;
              // Oblicz całkowity czas produkcji w minutach
              const totalProductionTimeMinutes = productionTimePerUnit * item.quantity;
              // Konwersja na godziny
              const totalProductionTime = totalProductionTimeMinutes / 60;
              
              // Sprawdź, czy element ma już utworzone zadanie
              // Preferuj sprawdzanie po orderItemId, potem po kombinacji productName i quantity
              const hasTask = existingTasks.some(task => {
                // Jeśli mamy orderItemId w zadaniu, użyj go do porównania
                if (task.orderItemId && item.id) {
                  const matches = task.orderItemId === item.id;
                  if (matches) {
                    console.log(`[DEBUG-TASK-STATUS] Zadanie ${task.id} (${task.moNumber || 'brak MO'}) powiązane z pozycją ${item.id} przez orderItemId`);
                  }
                  return matches;
                }
                // Alternatywnie sprawdź po nazwie produktu i ilości (mniej precyzyjne)
                const matches = task.productName === item.name && task.quantity === item.quantity;
                if (matches) {
                  console.log(`[DEBUG-TASK-STATUS] Zadanie ${task.id} (${task.moNumber || 'brak MO'}) powiązane z pozycją ${item.id} przez nazwę i ilość`);
                }
                return matches;
              });
              
              if (hasTask) {
                console.log(`[DEBUG-TASK-STATUS] Pozycja "${item.name}" (ID: ${item.id}) ma już utworzone zadanie`);
              } else {
                console.log(`[DEBUG-TASK-STATUS] Pozycja "${item.name}" (ID: ${item.id}) oczekuje na utworzenie zadania`);
              }
                    
              // Utwórz domyślną datę produkcji, jeśli nie została jeszcze ustawiona
              if (!productDates[item.id]) {
                const defaultDate = selectedOrder.orderDate ? new Date(selectedOrder.orderDate) : new Date();
                defaultDate.setHours(8, 0, 0, 0); // domyślnie 8:00 rano
                
                // zaktualizuj stan tylko jeśli nie był wcześniej ustawiony
                if (!productDates[item.id]) {
                  setProductDates(prev => ({
                    ...prev,
                    [item.id]: defaultDate
                  }));
                }
              }

              return (
                <TableRow 
                  key={item.id}
                  sx={{ 
                    backgroundColor: hasTask ? 'rgba(76, 175, 80, 0.1)' : 'inherit',
                    '&:hover': { 
                      backgroundColor: hasTask ? 'rgba(76, 175, 80, 0.2)' : 'rgba(0, 0, 0, 0.04)' 
                    }
                  }}
                >
                  <TableCell padding="checkbox">
                    <Checkbox 
                      checked={isItemSelected(item.id)}
                      onChange={() => handleItemSelect(item.id)}
                      disabled={hasTask}
                    />
                  </TableCell>
                  <TableCell>
                    {item.name}
                    {recipe && (
                      <Chip 
                        size="small" 
                        label={t('createFromOrder.tooltips.recipeChip')} 
                        color="primary" 
                        variant="outlined" 
                        sx={{ ml: 1 }}
                      />
                    )}
                  </TableCell>
                  <TableCell align="right">{item.quantity}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell align="right">{formatCurrency(item.price)}</TableCell>
                  <TableCell align="right">{formatCurrency(item.price * item.quantity)}</TableCell>
                  <TableCell>
                    {hasTask ? (
                      <Chip 
                        size="small" 
                        label={t('createFromOrder.statuses.taskCreated')} 
                        color="success" 
                        variant="outlined"
                      />
                    ) : (
                      <Chip 
                        size="small" 
                        label={t('createFromOrder.statuses.waiting')} 
                        color="warning" 
                        variant="outlined"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {totalProductionTime > 0 ? (
                      `${(productionTimePerUnit * item.quantity).toFixed(2)} min.`
                    ) : (
                      recipe ? (
                        <Typography variant="body2" color="error">
                          {t('createFromOrder.tooltips.productionTimeError')}
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          {t('createFromOrder.statuses.noRecipe')}
                        </Typography>
                      )
                    )}
                  </TableCell>
                  <TableCell>
                    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                      <DateTimePicker
                        label={t('createFromOrder.placeholders.productionDateTime')}
                        value={productDates[item.id] || null}
                        onChange={(newDate) => {
                          if (newDate) {
                            setProductDates(prev => ({
                              ...prev,
                              [item.id]: newDate
                            }));
                          }
                        }}
                        disabled={hasTask}
                        slotProps={{ 
                          textField: { 
                            size: "small",
                            fullWidth: true
                          } 
                        }}
                        format="dd.MM.yyyy HH:mm"
                      />
                    </LocalizationProvider>
                  </TableCell>
                  <TableCell>
                    <FormControl fullWidth>
                      <Select
                        value={selectedWorkstations[item.id] || ''}
                        onChange={(e) => handleWorkstationChange(item.id, e.target.value)}
                        displayEmpty
                      >
                        <MenuItem value="">
                          <em>{t('createFromOrder.placeholders.noWorkstation')}</em>
                        </MenuItem>
                        {workstations.map((workstation) => (
                          <MenuItem key={workstation.id} value={workstation.id}>
                            {workstation.name}
                          </MenuItem>
                        ))}
                      </Select>
                      {recipe && recipe.defaultWorkstationId && !selectedWorkstations[item.id] && (
                        <Button 
                          size="small" 
                          color="primary" 
                          onClick={() => {
                            console.log(`Awaryjne przypisanie stanowiska dla ${item.name}: ${recipe.defaultWorkstationId}`);
                            setSelectedWorkstations(prev => ({
                              ...prev,
                              [item.id]: recipe.defaultWorkstationId
                            }));
                          }}
                          sx={{ mt: 1, mb: 0.5 }}
                        >
                          {t('createFromOrder.messages.assignWorkstationFromRecipe')}
                        </Button>
                      )}
                      {selectedWorkstations[item.id] && (
                        <FormHelperText>
                          {t('createFromOrder.tooltips.workstationFromRecipe')}
                        </FormHelperText>
                      )}
                    </FormControl>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    );
  }, [selectedOrder, findRecipeForProduct, isAllSelected, handleSelectAllItems, isPartiallySelected, selectedItems, existingTasks, productDates, selectedWorkstations, workstations, t, handleProductDateChange, handleWorkstationChange]);

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={handleBack}
        >
          {t('createFromOrder.backToOrders')}
        </Button>
        <Typography variant="h5">{t('createFromOrder.title')}</Typography>
        <Box width={100} /> {/* Pusty element dla wyrównania */}
      </Box>

      <Paper sx={{ p: 4, mb: 3 }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <Typography variant="h6" gutterBottom>
              {t('createFromOrder.selectOrder')}
            </Typography>
            
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>{t('createFromOrder.orderLabel')}</InputLabel>
                  <Select
                    value={selectedOrderId}
                    onChange={handleOrderChange}
                    label={t('createFromOrder.orderLabel')}
                    disabled={orderLoading}
                  >
                    <MenuItem value="">{t('createFromOrder.selectOrderPlaceholder')}</MenuItem>
                    {orders.map(order => {
                      // Zapewnienie, że totalValue jest liczbą - najpierw próbujemy użyć calculatedTotalValue, 
                      // potem totalValue, a na końcu zwykłej wartości
                      const totalValue = parseFloat(order.calculatedTotalValue || order.totalValue || order.value || 0);
                      
                      return (
                      <MenuItem key={order.id} value={order.id}>
                          {order.orderNumber || order.id.substring(0, 8)} - {order.customer?.name || t('createFromOrder.placeholders.noCustomer')} ({formatCurrency(totalValue)})
                      </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              </Grid>
              
              {selectedOrderId && (
                <Grid item xs={12} md={6} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                  {/* Usunięte przyciski:
                  <Button
                    variant="outlined"
                    onClick={updatePricesFromPriceList}
                    disabled={updatingPrices || orderLoading}
                    startIcon={<AttachMoneyIcon />}
                  >
                    {updatingPrices ? 'Aktualizowanie...' : 'Aktualizuj ceny z listy cen'}
                  </Button>
                  
                  <Button
                    variant="outlined"
                    onClick={updateOrderWithProductionCosts}
                    disabled={updatingPrices || orderLoading}
                    startIcon={<CalculateIcon />}
                  >
                    {updatingPrices ? 'Aktualizowanie...' : 'Wlicz koszty produkcji do CO'}
                  </Button>
                  */}
                </Grid>
              )}
            </Grid>
            
            {orderLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                <CircularProgress />
              </Box>
            ) : selectedOrder ? (
              <>
                <Divider sx={{ my: 3 }} />
                
                {existingTasks.length > 0 && (
                  <Alert 
                    severity="warning" 
                    sx={{ mb: 3 }}
                    action={
                      <Button 
                        color="inherit" 
                        size="small" 
                        onClick={() => navigate('/production')}
                      >
                        {t('createFromOrder.alerts.seeTasksButton')}
                      </Button>
                    }
                  >
                    {t('createFromOrder.alerts.existingTasks', { count: existingTasks.length })}
                    <Box component="ul" sx={{ mt: 1, pl: 2 }}>
                      {existingTasks.map((task) => (
                        <Box component="li" key={task.id || `${task.moNumber}-${task.productName}-${task.quantity}`}>
                          {task.moNumber || 'Zadanie'}: {task.productName || 'Produkt'} - {task.quantity} {task.unit || 'szt.'} ({task.status || 'brak statusu'})
                        </Box>
                      ))}
                    </Box>
                  </Alert>
                )}
                
                <Grid container spacing={3} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle1" gutterBottom>
                      {t('createFromOrder.orderDetails')}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{t('createFromOrder.orderNumber')}</strong> {selectedOrder.orderNumber || selectedOrder.id.substring(0, 8)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{t('createFromOrder.customer')}</strong> {selectedOrder.customer?.name || t('createFromOrder.placeholders.noCustomer')}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{t('createFromOrder.date')}</strong> {formatDate(selectedOrder.orderDate) || '-'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>{t('createFromOrder.status')}</strong> {selectedOrder.status || '-'}
                    </Typography>
                  </Grid>
                  
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle1" gutterBottom>
                      {t('createFromOrder.taskDataTitle')}
                    </Typography>
                    
                    <TextField
                      name="name"
                      label={t('createFromOrder.taskName')}
                      value={taskForm.name}
                      onChange={handleTaskFormChange}
                      fullWidth
                      margin="normal"
                    />
                    
                    <FormControl fullWidth margin="normal">
                      <InputLabel>{t('createFromOrder.priority')}</InputLabel>
                      <Select
                        name="priority"
                        value={taskForm.priority}
                        onChange={handleTaskFormChange}
                        label={t('createFromOrder.priority')}
                      >
                        <MenuItem value="low">{t('createFromOrder.priorities.low')}</MenuItem>
                        <MenuItem value="normal">{t('createFromOrder.priorities.normal')}</MenuItem>
                        <MenuItem value="high">{t('createFromOrder.priorities.high')}</MenuItem>
                        <MenuItem value="urgent">{t('createFromOrder.priorities.urgent')}</MenuItem>
                      </Select>
                    </FormControl>
                    <FormControl fullWidth margin="normal">
                      <InputLabel>{t('createFromOrder.reservationMethod')}</InputLabel>
                      <Select
                        name="reservationMethod"
                        value={taskForm.reservationMethod}
                        onChange={handleTaskFormChange}
                        label={t('createFromOrder.reservationMethod')}
                      >
                        <MenuItem value="fifo">{t('createFromOrder.reservationMethods.fifo')}</MenuItem>
                        <MenuItem value="expiry">{t('createFromOrder.reservationMethods.expiry')}</MenuItem>
                      </Select>
                    </FormControl>
                    <FormControl fullWidth margin="normal">
                      <InputLabel>{t('createFromOrder.autoReserveMaterials')}</InputLabel>
                      <Select
                        name="autoReserveMaterials"
                        value={taskForm.autoReserveMaterials}
                        onChange={handleTaskFormChange}
                        label={t('createFromOrder.autoReserveMaterials')}
                      >
                        <MenuItem value={true}>{t('createFromOrder.autoReserveOptions.yes')}</MenuItem>
                        <MenuItem value={false}>{t('createFromOrder.autoReserveOptions.no')}</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
                
                <Typography variant="h6" gutterBottom>
                  {t('createFromOrder.selectProductsTitle')}
                </Typography>
                
                {renderProductsTable()}
                
                <TextField
                  name="description"
                  label={t('createFromOrder.taskDescription')}
                  value={taskForm.description}
                  onChange={handleTaskFormChange}
                  fullWidth
                  multiline
                  rows={3}
                  margin="normal"
                  sx={{ mb: 3 }}
                />
                
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    variant="contained"
                    color="primary"
                    startIcon={<EngineeringIcon />}
                    onClick={createTasksFromSelectedProducts}
                    disabled={creatingTasks || !someItemsSelected}
                    sx={{ mr: 2 }}
                  >
                    {creatingTasks ? <CircularProgress size={24} /> : t('createFromOrder.createTasks')}
                  </Button>
                </Box>
              </>
            ) : (
              <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
                {orders.length > 0 ? (
                  t('createFromOrder.messages.selectOrderToCreate')
                ) : (
                  t('createFromOrder.messages.noOrders')
                )}
              </Alert>
            )}
          </>
        )}
      </Paper>
    </Container>
  );
};

export default CreateFromOrderPage; 