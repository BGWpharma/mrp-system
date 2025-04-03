import React, { useState, useEffect } from 'react';
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
  Chip
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
import { getIngredientPrices, getInventoryItemById } from '../../services/inventoryService';
import { calculateManufacturingOrderCosts } from '../../utils/costCalculator';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatUtils';
import { getPriceForCustomerProduct } from '../../services/priceListService';

const CreateFromOrderPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo, showWarning } = useNotification();
  
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
  
  // Formularz nowego zadania
  const [taskForm, setTaskForm] = useState({
    name: '',
    scheduledDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Domyślnie za tydzień
    priority: 'Normalny',
    description: '',
    status: 'Zaplanowane',
    reservationMethod: 'fifo' // 'expiry' - wg daty ważności, 'fifo' - FIFO
  });
  
  useEffect(() => {
    fetchOrders();
    fetchRecipes();
    
    // Jeśli przekazano orderId przez state, załaduj szczegóły zamówienia
    if (location.state?.orderId) {
      fetchOrderDetails(location.state.orderId);
    }
  }, [location.state]);
  
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
    if (!recipes || recipes.length === 0) return null;
    
    // Znajdź recepturę, która w nazwie zawiera nazwę produktu
    const matchingRecipe = recipes.find(recipe => {
      const recipeName = recipe.name.toLowerCase();
      const product = productName.toLowerCase();
      return recipeName.includes(product) || product.includes(recipeName);
    });
    
    if (matchingRecipe) {
      console.log(`Znaleziono recepturę dla produktu ${productName}:`, matchingRecipe.name);
      return matchingRecipe;
    }
    
    console.log(`Nie znaleziono receptury dla produktu ${productName}`);
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
      quantity: parseFloat((ingredient.quantity * scaleFactor).toFixed(2)),
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
      showError('Błąd podczas pobierania zamówień: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const fetchOrderDetails = async (orderId) => {
    try {
      setOrderLoading(true);
      const orderData = await getOrderById(orderId);
      
      // Upewnij się, że wartość totalValue jest prawidłową liczbą
      if (orderData.totalValue) {
        orderData.totalValue = parseFloat(orderData.totalValue);
      }
      
      // Weryfikacja i czyszczenie nieistniejących zadań produkcyjnych
      const verifiedOrderData = await verifyProductionTasks(orderData);
      
      setSelectedOrder(verifiedOrderData);
      
      // Aktualizuj listę zamówień, aby odzwierciedlić aktualne dane
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.id === verifiedOrderData.id ? {...order, totalValue: verifiedOrderData.totalValue} : order
        )
      );
      
      // Sprawdź, czy zamówienie ma już utworzone zadania produkcyjne
      if (verifiedOrderData.productionTasks && verifiedOrderData.productionTasks.length > 0) {
        showInfo(`Uwaga: Dla tego zamówienia utworzono już ${verifiedOrderData.productionTasks.length} zadań produkcyjnych. Tworzenie dodatkowych może prowadzić do duplikacji.`);
        // Zapisz istniejące zadania do wyświetlenia w UI
        setExistingTasks(verifiedOrderData.productionTasks);
      } else {
        // Wyczyść listę istniejących zadań, jeśli wybrano nowe zamówienie bez zadań
        setExistingTasks([]);
      }
      
      // Ustaw początkowe wartości dla formularza zadania
      const today = new Date().toISOString().split('T')[0];
      const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      setTaskForm({
        name: `Produkcja z zamówienia #${verifiedOrderData.orderNumber || verifiedOrderData.id.substring(0, 8)}`,
        scheduledDate: today,
        endDate: nextWeek,
        priority: 'Normalny',
        description: `Zadanie utworzone na podstawie zamówienia klienta ${verifiedOrderData.customer?.name || '(brak danych)'}`,
        status: 'Zaplanowane',
        reservationMethod: 'fifo'
      });
      
      // Domyślnie zaznacz wszystkie elementy zamówienia
      if (verifiedOrderData.items && verifiedOrderData.items.length > 0) {
        setSelectedItems(verifiedOrderData.items.map((item, index) => ({
          ...item,
          itemId: index, // Dodajemy unikalny identyfikator
          selected: true,
          unit: normalizeUnit(item.unit) // Normalizacja jednostek do dopuszczalnych wartości
        })));
      }
    } catch (error) {
      showError('Błąd podczas pobierania szczegółów zamówienia: ' + error.message);
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
          item.itemId === itemId 
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
    const checked = event.target.checked;
    if (Array.isArray(selectedItems)) {
      setSelectedItems(prev => 
        prev.map(item => ({ ...item, selected: checked }))
      );
    } else {
      // Dla przypadku gdy selectedItems jest obiektem
      const updatedItems = {};
      Object.keys(selectedItems).forEach(key => {
        updatedItems[key] = checked;
      });
      setSelectedItems(updatedItems);
    }
  };
  
  const handleCreateTask = async () => {
    // Sprawdź czy wybrano co najmniej jeden element
    const hasSelectedItems = selectedItems.some(item => item.selected);
    
    if (!hasSelectedItems) {
      showError('Wybierz co najmniej jeden produkt z zamówienia');
      return;
    }
    
    try {
      setCreatingTasks(true);
      
      // Przygotuj dane zadania produkcyjnego
      const selectedProductItems = selectedItems.filter(item => item.selected);
      
      // Dla każdego wybranego produktu z zamówienia, tworzymy zadanie produkcyjne
      for (const item of selectedProductItems) {
        // Znormalizuj jednostkę do jednej z trzech dozwolonych
        const normalizedUnit = normalizeUnit(item.unit);
        
        // Znajdź recepturę dla produktu
        const recipe = findRecipeForProduct(item.name);
        
        // Utwórz listę materiałów na podstawie receptury
        const materials = recipe 
          ? createMaterialsFromRecipe(recipe, item.quantity)
          : [];
        
        // Normalizuj jednostki materiałów
        if (materials.length > 0) {
          materials.forEach(material => {
            material.unit = normalizedUnit;
          });
        }
        
        // Jeśli znaleziono recepturę, dodaj odniesienie do niej i oblicz koszty
        const recipeData = recipe 
          ? { recipeId: recipe.id, recipeName: recipe.name }
          : {};
        
        // Oblicz koszt produkcji jeśli mamy recepturę
        let costs = null;
        
        if (recipe) {
          try {
            // Przygotuj dane zadania dla kalkulatora kosztów
            const taskForCostCalc = {
              quantity: item.quantity,
              unit: normalizedUnit
            };
            
            // Pobierz ID składników z receptury
            const ingredientIds = recipe.ingredients
              .filter(ing => ing.id)
              .map(ing => ing.id);
              
            if (ingredientIds.length > 0) {
              // Pobierz ceny składników
              const pricesMap = await getIngredientPrices(ingredientIds);
              
              // Oblicz koszty
              const costData = calculateManufacturingOrderCosts(taskForCostCalc, recipe, pricesMap);
              
              // Zapisz całkowity koszt produkcji (zamiast kosztu jednostkowego)
              costs = {
                materialCost: costData.materialCost,
                laborCost: costData.actualLaborCost,
                machineCost: costData.machineCost,
                overheadCost: costData.overheadCost,
                unitCost: costData.unitCost,
                totalCost: costData.totalProductionCost
              };
            }
          } catch (error) {
            console.error('Błąd podczas obliczania kosztów:', error);
          }
        }
        
        const taskData = {
          ...taskForm,
          productName: item.name,
          quantity: item.quantity,
          unit: normalizedUnit,
          customer: selectedOrder.customer,
          orderId: selectedOrder.id,
          orderNumber: selectedOrder.orderNumber || selectedOrder.id.substring(0, 8),
          materials: materials,
          costs: costs,
          ...recipeData
        };
        
        // Utwórz zadanie produkcyjne
        // Uwaga: funkcja createTask automatycznie rezerwuje materiały dla zadania
        const newTask = await createTask(taskData, currentUser.uid);
        
        // Dodaj zadanie do zamówienia
        await addProductionTaskToOrder(selectedOrder.id, newTask);
      }
      
      showSuccess('Zadania produkcyjne zostały utworzone i powiązane z zamówieniem');
      navigate('/production');
    } catch (error) {
      showError('Błąd podczas tworzenia zadania produkcyjnego: ' + error.message);
      console.error('Error creating task:', error);
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

  // Inicjalizacja zadań produkcyjnych z wybranego zamówienia
  const initializeTasksFromOrder = () => {
    if (!selectedOrder || !selectedOrder.items || selectedOrder.items.length === 0) {
      return;
    }
    
    // Resetuj wcześniej wybrane elementy
    setSelectedItems({});
    
    // Tworzymy nowy obiekt z zaznaczonymi elementami
    const initialSelectedItems = {};
    
    // Dla każdego produktu w zamówieniu, który jest recepturą lub dla którego można znaleźć recepturę
    selectedOrder.items.forEach(item => {
      // Jeśli element jest oznaczony jako receptura, zawsze go dodaj
      if (item.isRecipe) {
        initialSelectedItems[item.id] = true;
        return;
      }
      
      // W przeciwnym razie spróbuj znaleźć recepturę dla produktu
      const recipe = findRecipeForProduct(item.name);
      if (recipe) {
        // Znaleziono recepturę dla produktu, więc zaznacz go
        initialSelectedItems[item.id] = true;
      }
    });
    
    setSelectedItems(initialSelectedItems);
  };

  // Obsługa wyboru zamówienia
  const handleOrderSelect = async (_, order) => {
    if (order) {
      console.log('Wybrano zamówienie:', order);
      setSelectedOrder(order);
      
      // Inicjalizuj zadania produkcyjne na podstawie wybranego zamówienia
      initializeTasksFromOrder();
      
      // Pobierz receptury dla danego klienta, jeśli zamówienie ma przypisanego klienta
      if (order.customer && order.customer.id) {
        fetchRecipesForCustomer(order.customer.id);
      } else {
        // Jeśli nie ma klienta, pobierz wszystkie receptury
        fetchRecipes();
      }
    } else {
      setSelectedOrder(null);
      setSelectedItems({});
    }
  };

  // Funkcja tworząca zadania produkcyjne dla wybranych produktów
  const createTasksFromSelectedProducts = async () => {
    if (!selectedOrder) {
      showError('Nie wybrano zamówienia');
      return;
    }
    
    if (!selectedOrder.items || selectedOrder.items.length === 0) {
      showError('Zamówienie nie zawiera żadnych produktów');
      return;
    }
    
    let selectedProductItems = [];
    
    // Obsługa różnych formatów selectedItems
    if (Array.isArray(selectedItems)) {
      selectedProductItems = selectedItems.filter(item => item.selected);
      if (selectedProductItems.length === 0) {
        showError('Nie wybrano żadnych produktów do produkcji');
        return;
      }
    } else {
      // Przypadek gdy selectedItems jest obiektem z kluczami ID
      const selectedKeys = Object.keys(selectedItems).filter(key => selectedItems[key]);
      if (selectedKeys.length === 0) {
        showError('Nie wybrano żadnych produktów do produkcji');
        return;
      }
      
      // Znajdź odpowiednie produkty na podstawie ID
      for (const itemId of selectedKeys) {
        const item = selectedOrder.items.find(item => item.id === itemId);
        if (item) {
          selectedProductItems.push(item);
        }
      }
    }
    
    if (selectedProductItems.length === 0) {
      showError('Nie znaleziono wybranych produktów w zamówieniu');
      return;
    }
    
    setCreatingTasks(true);
    setTasksCreated([]);
    
    try {
      for (const item of selectedProductItems) {
        let recipe = null;
        
        // Jeśli element jest recepturą, pobierz bezpośrednio recepturę z jej ID
        if (item.isRecipe) {
          try {
            recipe = await getRecipeById(item.id);
            console.log(`Pobrano recepturę bezpośrednio dla elementu ${item.name}:`, recipe);
          } catch (recipeError) {
            console.error(`Błąd podczas pobierania receptury dla ${item.name}:`, recipeError);
            showError(`Nie udało się pobrać receptury dla ${item.name}`);
            continue;
          }
        } 
        // W przeciwnym razie spróbuj znaleźć recepturę na podstawie nazwy produktu
        else {
          recipe = findRecipeForProduct(item.name);
          if (!recipe) {
            console.log(`Nie znaleziono receptury dla produktu ${item.name}`);
            showWarning(`Nie znaleziono receptury dla produktu ${item.name}. Zadanie zostanie utworzone bez receptury.`);
          } else {
            console.log(`Znaleziono recepturę dla produktu ${item.name}:`, recipe);
          }
        }
        
        let normalizedUnit = item.unit;
        // Konwersja jednostek jeśli potrzebna
        if (item.unit === 'kg' || item.unit === 'l') {
          normalizedUnit = item.unit;
        } else {
          normalizedUnit = 'szt.';
        }
        
        // Przygotuj materiały na podstawie receptury
        let materials = [];
        let recipeData = {};
        let costs = {
          materialCost: 0,
          laborCost: 0,
          machineCost: 0,
          overheadCost: 0,
          totalCost: 0,
          unitCost: 0
        };
        
        // Ustaw cenę elementu na podstawie listy cen lub kosztu procesowego receptury
        let itemPrice = item.price || 0;
        let totalValue = (item.price || 0) * item.quantity;
        
        if (recipe) {
          materials = createMaterialsFromRecipe(recipe, item.quantity);
          
          recipeData = {
            recipeId: recipe.id,
            recipeName: recipe.name,
            recipeIngredients: recipe.ingredients || []
          };
          
          // Sprawdź, czy element ma cenę z listy cenowej
          if (item.fromPriceList !== true && recipe.processingCostPerUnit) {
            // Jeśli nie ma ceny z listy cenowej, a receptura ma koszt procesowy, użyj go
            console.log(`Użycie kosztu procesowego ${recipe.processingCostPerUnit} EUR dla produktu ${item.name}`);
            itemPrice = recipe.processingCostPerUnit;
            totalValue = recipe.processingCostPerUnit * item.quantity;
          }
        }
        
        if (recipe) {
          try {
            // Przygotuj dane zadania dla kalkulatora kosztów
            const taskForCostCalc = {
              quantity: item.quantity,
              unit: normalizedUnit
            };
            
            // Pobierz ID składników z receptury
            const ingredientIds = recipe.ingredients
              .filter(ing => ing.id)
              .map(ing => ing.id);
              
            if (ingredientIds.length > 0) {
              // Pobierz ceny składników
              const pricesMap = await getIngredientPrices(ingredientIds);
              
              // Oblicz koszty
              const costData = calculateManufacturingOrderCosts(taskForCostCalc, recipe, pricesMap);
              
              // Zapisz całkowity koszt produkcji (zamiast kosztu jednostkowego)
              costs = {
                materialCost: costData.materialCost,
                laborCost: costData.actualLaborCost,
                machineCost: costData.machineCost,
                overheadCost: costData.overheadCost,
                unitCost: costData.unitCost,
                totalCost: costData.totalProductionCost
              };
            }
          } catch (error) {
            console.error('Błąd podczas obliczania kosztów:', error);
          }
        }
        
        // Utwórz nowe zadanie produkcyjne
        const taskData = {
          name: taskForm.name || `Produkcja ${item.name}`,
          status: taskForm.status || 'Zaplanowane',
          priority: taskForm.priority || 'Normalny',
          scheduledDate: taskForm.scheduledDate || new Date().toISOString().split('T')[0],
          endDate: taskForm.endDate,
          productName: item.name,
          quantity: item.quantity,
          unit: normalizedUnit,
          materials: materials,
          description: taskForm.description || `Zadanie utworzone z zamówienia klienta #${selectedOrder.orderNumber || selectedOrder.id}`,
          createdBy: currentUser.uid,
          createdAt: new Date().toISOString(),
          recipe: recipeData,
          costs: costs,
          itemPrice: itemPrice,
          totalValue: totalValue,
          orderId: selectedOrder.id, // Dodanie orderId do zadania
          orderNumber: selectedOrder.orderNumber || selectedOrder.id,
          customer: selectedOrder.customer || null,
          isEssential: true,
          reservationMethod: taskForm.reservationMethod || 'fifo'
        };
        
        // Utwórz zadanie produkcyjne
        // Uwaga: funkcja createTask automatycznie rezerwuje materiały dla zadania
        const newTask = await createTask(taskData, currentUser.uid);
        
        if (newTask) {
          // Dodaj zadanie do zamówienia
          await addProductionTaskToOrder(selectedOrder.id, newTask);
          
          // Dodaj zadanie do listy utworzonych zadań
          setTasksCreated(prev => [...prev, newTask]);
        }
      }
      
      // Pokaż sukces, jeśli utworzono przynajmniej jedno zadanie
      if (tasksCreated.length > 0) {
        showSuccess(`Utworzono ${tasksCreated.length} zadań produkcyjnych`);
        
        // Dodaj nowo utworzone zadania do listy istniejących zadań
        setExistingTasks(prev => [...prev, ...tasksCreated]);
        
        // Odśwież szczegóły zamówienia, aby pokazać nowo utworzone zadania
        fetchOrderDetails(selectedOrder.id);
      }
    } catch (error) {
      console.error('Błąd podczas tworzenia zadań produkcyjnych:', error);
      showError('Błąd podczas tworzenia zadań produkcyjnych: ' + error.message);
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
      showError('Nie udało się pobrać receptur dla klienta');
      // W przypadku błędu - spróbuj pobrać wszystkie receptury
      fetchRecipes();
    }
  };

  // Nowa funkcja do aktualizacji cen produktów na podstawie listy cen dla receptur
  const updatePricesFromPriceList = async () => {
    if (!selectedOrder || !selectedOrder.items || selectedOrder.items.length === 0) {
      showInfo('Zamówienie nie zawiera żadnych pozycji do aktualizacji cen');
      return;
    }

    try {
      setUpdatingPrices(true);
      
      const customerId = selectedOrder.customer?.id;
      if (!customerId) {
        showError('Zamówienie nie ma przypisanego klienta');
        setUpdatingPrices(false);
        return;
      }
      
      let hasUpdates = false;
      const updatedItems = [...selectedOrder.items];
      
      // Przeszukaj pozycje zamówienia
      for (let i = 0; i < updatedItems.length; i++) {
        const item = updatedItems[i];
        
        // Sprawdź czy pozycja jest recepturą
        const isRecipe = item.itemType === 'recipe' || item.isRecipe;
        let recipeId = isRecipe ? item.id : null;
        
        // Jeśli nie jest bezpośrednio recepturą, spróbuj znaleźć pasującą recepturę
        if (!isRecipe) {
          const matchingRecipe = findRecipeForProduct(item.name);
          if (matchingRecipe) {
            recipeId = matchingRecipe.id;
          }
        }
        
        // Jeśli mamy identyfikator receptury, pobierz cenę z listy cen
        if (recipeId) {
          const priceFromList = await getPriceForCustomerProduct(customerId, recipeId, true);
          
          if (priceFromList !== null && priceFromList !== undefined) {
            console.log(`Znaleziono cenę ${priceFromList} dla produktu ${item.name} w liście cen`);
            
            // Aktualizuj cenę tylko jeśli jest różna
            if (item.price !== priceFromList) {
              updatedItems[i] = {
                ...item,
                price: priceFromList,
                fromPriceList: true,
                originalPrice: item.price  // Zapisz oryginalną cenę
              };
              hasUpdates = true;
            }
          }
        }
      }
      
      // Jeśli są zmiany, zaktualizuj zamówienie
      if (hasUpdates) {
        // Oblicz nową wartość całkowitą
        const totalValue = updatedItems.reduce((sum, item) => sum + (parseFloat(item.quantity) * parseFloat(item.price)), 0);
        
        // Utwórz nowy obiekt zamówienia z zaktualizowanymi pozycjami
        const updatedOrder = {
          ...selectedOrder,
          items: updatedItems,
          totalValue: totalValue
        };
        
        // Zaktualizuj zamówienie w bazie danych
        await updateOrder(selectedOrder.id, updatedOrder, currentUser.uid);
        
        // Zaktualizuj stan lokalny
        setSelectedOrder(updatedOrder);
        
        // Zaktualizuj również listę zamówień, aby odzwierciedlić zmiany
        setOrders(prevOrders => 
          prevOrders.map(order => 
            order.id === updatedOrder.id ? {...order, totalValue: totalValue} : order
          )
        );
        
        setSelectedItems(updatedItems.map((item, index) => ({
          ...item,
          itemId: index,
          selected: true,
          unit: normalizeUnit(item.unit)
        })));
        
        showSuccess('Ceny produktów zostały zaktualizowane na podstawie listy cen');
      } else {
        showInfo('Nie znaleziono aktualizacji cen w listach cenowych');
      }
    } catch (error) {
      console.error('Błąd podczas aktualizacji cen:', error);
      showError('Wystąpił błąd podczas aktualizacji cen: ' + error.message);
    } finally {
      setUpdatingPrices(false);
    }
  };

  // Funkcja aktualizująca koszt zamówienia na podstawie kosztów produkcji
  const updateOrderWithProductionCosts = async () => {
    if (!selectedOrder) {
      showError('Nie wybrano zamówienia');
      return;
    }
    
    try {
      setUpdatingPrices(true);
      
      // Pobierz zadania produkcyjne powiązane z zamówieniem
      const order = await getOrderById(selectedOrder.id);
      
      if (!order.productionTasks || order.productionTasks.length === 0) {
        showInfo('Zamówienie nie ma powiązanych zadań produkcyjnych');
        setUpdatingPrices(false);
        return;
      }
      
      // Utwórz mapę kosztów produkcji dla każdej pozycji zamówienia
      const productionCostsMap = {};
      
      // Zbierz koszty produkcji z zadań produkcyjnych
      for (const task of order.productionTasks) {
        if (!task.costs) continue;
        
        // Znajdź odpowiadającą pozycję zamówienia
        const matchingItem = order.items.find(item => 
          item.name.toLowerCase() === task.productName.toLowerCase()
        );
        
        if (matchingItem) {
          // Jeśli już mamy koszt dla tej pozycji, dodaj do istniejącego
          if (productionCostsMap[matchingItem.id]) {
            productionCostsMap[matchingItem.id] += task.costs.totalCost || 0;
          } else {
            productionCostsMap[matchingItem.id] = task.costs.totalCost || 0;
          }
        }
      }
      
      // Sprawdź czy zamówienie ma powiązane zamówienia zakupu
      if (order.linkedPurchaseOrders && order.linkedPurchaseOrders.length > 0) {
        // Dla każdej pozycji zamówienia dodajemy koszty materiałów z zamówień zakupu
        order.linkedPurchaseOrders.forEach(po => {
          // W tym miejscu możemy dodać logikę przypisywania kosztów PO do pozycji CO
          // Na razie po prostu informujemy o powiązanych PO
          console.log(`Zamówienie ma powiązane PO: ${po.number} o wartości ${po.value}`);
        });
      }
      
      // Dodaj informacje o kosztach produkcji do zamówienia
      const updatedOrder = {
        ...order,
        productionCosts: productionCostsMap,
        hasProductionCosts: true
      };
      
      // Zaktualizuj zamówienie w bazie danych
      await updateOrder(order.id, updatedOrder, currentUser.uid);
      
      // Zaktualizuj również listę zamówień
      setOrders(prevOrders => 
        prevOrders.map(o => 
          o.id === order.id ? {...o, hasProductionCosts: true} : o
        )
      );
      
      showSuccess('Koszty produkcji zostały zaktualizowane w zamówieniu');
      
      // Odśwież dane zamówienia
      fetchOrderDetails(order.id);
      
    } catch (error) {
      console.error('Błąd podczas aktualizacji kosztów produkcji:', error);
      showError('Wystąpił błąd podczas aktualizacji kosztów produkcji: ' + error.message);
    } finally {
      setUpdatingPrices(false);
    }
  };

  // Funkcja sprawdzająca czy zadania produkcyjne istnieją i usuwająca nieistniejące referencje
  const verifyProductionTasks = async (orderData) => {
    if (!orderData || !orderData.productionTasks || orderData.productionTasks.length === 0) {
      return orderData;
    }

    try {
      const { getTaskById, deleteTask } = await import('../../services/productionService');
      const { removeProductionTaskFromOrder } = await import('../../services/orderService');
      
      const verifiedTasks = [];
      const tasksToRemove = [];
      
      // Sprawdź każde zadanie produkcyjne
      for (const task of orderData.productionTasks) {
        try {
          // Próba pobrania zadania z bazy
          const taskExists = await getTaskById(task.id);
          if (taskExists) {
            verifiedTasks.push(task);
          } else {
            console.log(`Zadanie produkcyjne ${task.id} (${task.moNumber}) już nie istnieje.`);
            tasksToRemove.push(task);
          }
        } catch (error) {
          console.error(`Błąd podczas weryfikacji zadania ${task.id}:`, error);
          tasksToRemove.push(task);
        }
      }
      
      // Jeśli znaleziono nieistniejące zadania, usuń ich referencje z zamówienia
      if (tasksToRemove.length > 0) {
        for (const task of tasksToRemove) {
          try {
            await removeProductionTaskFromOrder(orderData.id, task.id);
            console.log(`Usunięto nieistniejące zadanie ${task.id} (${task.moNumber}) z zamówienia ${orderData.id}`);
          } catch (error) {
            console.error(`Błąd podczas usuwania referencji do zadania ${task.id}:`, error);
          }
        }
        
        // Zaktualizuj dane zamówienia lokalnie (bez pobierania z bazy)
        const updatedOrder = {
          ...orderData,
          productionTasks: verifiedTasks
        };
        
        showInfo(`Usunięto ${tasksToRemove.length} nieistniejących zadań produkcyjnych z zamówienia.`);
        return updatedOrder;
      }
      
      return orderData;
    } catch (error) {
      console.error('Błąd podczas weryfikacji zadań produkcyjnych:', error);
      return orderData;
    }
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={handleBack}
        >
          Powrót do zamówień
        </Button>
        <Typography variant="h5">Tworzenie zadania produkcyjnego z zamówienia</Typography>
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
              Wybierz zamówienie klienta
            </Typography>
            
            <Grid container spacing={3} sx={{ mb: 4 }}>
              <Grid item xs={12} md={6}>
                <FormControl fullWidth>
                  <InputLabel>Zamówienie</InputLabel>
                  <Select
                    value={selectedOrderId}
                    onChange={handleOrderChange}
                    label="Zamówienie"
                    disabled={orderLoading}
                  >
                    <MenuItem value="">Wybierz zamówienie</MenuItem>
                    {orders.map(order => {
                      // Zapewnienie, że totalValue jest liczbą
                      const totalValue = parseFloat(order.totalValue) || 0;
                      
                      return (
                        <MenuItem key={order.id} value={order.id}>
                          #{order.orderNumber || order.id.substring(0, 8)} - {order.customer?.name || 'Brak danych klienta'} ({formatCurrency(totalValue)})
                        </MenuItem>
                      );
                    })}
                  </Select>
                </FormControl>
              </Grid>
              
              {selectedOrderId && (
                <Grid item xs={12} md={6} sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
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
                        Zobacz zadania
                      </Button>
                    }
                  >
                    Uwaga: Dla tego zamówienia utworzono już {existingTasks.length} zadań produkcyjnych:
                    <Box component="ul" sx={{ mt: 1, pl: 2 }}>
                      {existingTasks.map((task, index) => (
                        <Box component="li" key={index}>
                          {task.moNumber || 'Zadanie'}: {task.productName || 'Produkt'} - {task.quantity} {task.unit || 'szt.'} ({task.status || 'brak statusu'})
                        </Box>
                      ))}
                    </Box>
                  </Alert>
                )}
                
                <Grid container spacing={3} sx={{ mb: 3 }}>
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle1" gutterBottom>
                      Szczegóły zamówienia:
                    </Typography>
                    <Typography variant="body2">
                      <strong>Numer:</strong> #{selectedOrder.orderNumber || selectedOrder.id.substring(0, 8)}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Klient:</strong> {selectedOrder.customer?.name || 'Brak danych'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Data:</strong> {formatDate(selectedOrder.orderDate) || '-'}
                    </Typography>
                    <Typography variant="body2">
                      <strong>Status:</strong> {selectedOrder.status || '-'}
                    </Typography>
                  </Grid>
                  
                  <Grid item xs={12} md={6}>
                    <Typography variant="subtitle1" gutterBottom>
                      Dane zadania produkcyjnego:
                    </Typography>
                    
                    <TextField
                      name="name"
                      label="Nazwa zadania"
                      value={taskForm.name}
                      onChange={handleTaskFormChange}
                      fullWidth
                      margin="normal"
                    />
                    
                    <Grid container spacing={2}>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          name="scheduledDate"
                          label="Data rozpoczęcia"
                          type="date"
                          value={taskForm.scheduledDate}
                          onChange={handleTaskFormChange}
                          fullWidth
                          margin="normal"
                          InputLabelProps={{
                            shrink: true,
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} sm={6}>
                        <TextField
                          name="endDate"
                          label="Planowana data zakończenia"
                          type="date"
                          value={taskForm.endDate}
                          onChange={handleTaskFormChange}
                          fullWidth
                          margin="normal"
                          InputLabelProps={{
                            shrink: true,
                          }}
                        />
                      </Grid>
                    </Grid>
                    
                    <FormControl fullWidth margin="normal">
                      <InputLabel>Priorytet</InputLabel>
                      <Select
                        name="priority"
                        value={taskForm.priority}
                        onChange={handleTaskFormChange}
                        label="Priorytet"
                      >
                        <MenuItem value="Niski">Niski</MenuItem>
                        <MenuItem value="Normalny">Normalny</MenuItem>
                        <MenuItem value="Wysoki">Wysoki</MenuItem>
                        <MenuItem value="Pilny">Pilny</MenuItem>
                      </Select>
                    </FormControl>
                    <FormControl fullWidth margin="normal">
                      <InputLabel>Metoda rezerwacji materiałów</InputLabel>
                      <Select
                        name="reservationMethod"
                        value={taskForm.reservationMethod}
                        onChange={handleTaskFormChange}
                        label="Metoda rezerwacji materiałów"
                      >
                        <MenuItem value="fifo">FIFO (pierwsze weszło, pierwsze wyszło)</MenuItem>
                        <MenuItem value="expiry">Według daty ważności (najkrótszy termin)</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
                
                <Typography variant="h6" gutterBottom>
                  Wybierz produkty do wyprodukowania:
                </Typography>
                
                <TableContainer sx={{ mb: 3 }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox">
                          <Checkbox
                            indeterminate={someItemsSelected && !areAllItemsSelected}
                            checked={areAllItemsSelected}
                            onChange={handleSelectAllItems}
                          />
                        </TableCell>
                        <TableCell>Nazwa produktu</TableCell>
                        <TableCell align="right">Ilość</TableCell>
                        <TableCell align="right">Cena jednostkowa</TableCell>
                        <TableCell align="right">Wartość</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {Array.isArray(selectedItems) ? (
                        // Gdy selectedItems jest tablicą obiektów
                        selectedItems.map((item) => (
                          <TableRow key={item.itemId} hover>
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={item.selected}
                                onChange={() => handleItemSelect(item.itemId)}
                              />
                            </TableCell>
                            <TableCell>{item.name}</TableCell>
                            <TableCell align="right">{item.quantity} {item.unit || 'szt.'}</TableCell>
                            <TableCell align="right">{formatCurrency(item.price)}</TableCell>
                            <TableCell align="right">{formatCurrency(item.price * item.quantity)}</TableCell>
                          </TableRow>
                        ))
                      ) : (
                        // Gdy selectedItems jest obiektem z kluczami ID
                        selectedOrder?.items?.map((item) => (
                          <TableRow key={item.id} hover>
                            <TableCell padding="checkbox">
                              <Checkbox
                                checked={selectedItems[item.id] || false}
                                onChange={() => handleItemSelect(item.id)}
                              />
                            </TableCell>
                            <TableCell>{item.name}</TableCell>
                            <TableCell align="right">{item.quantity} {item.unit || 'szt.'}</TableCell>
                            <TableCell align="right">{formatCurrency(item.price)}</TableCell>
                            <TableCell align="right">{formatCurrency(item.price * item.quantity)}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
                
                <TextField
                  name="description"
                  label="Opis zadania"
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
                    {creatingTasks ? <CircularProgress size={24} /> : 'Utwórz zadania produkcyjne'}
                  </Button>
                </Box>
              </>
            ) : (
              <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
                {orders.length > 0 ? (
                  'Wybierz zamówienie z listy, aby utworzyć zadania produkcyjne.'
                ) : (
                  'Nie znaleziono żadnych zamówień. Utwórz i potwierdź zamówienia w sekcji Zamówienia klientów.'
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