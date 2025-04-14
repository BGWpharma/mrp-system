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
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { getAllWorkstations } from '../../services/workstationService';

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
  const [productDates, setProductDates] = useState({});
  const [workstations, setWorkstations] = useState([]);
  const [selectedWorkstations, setSelectedWorkstations] = useState({});
  
  // Formularz nowego zadania
  const [taskForm, setTaskForm] = useState({
    name: '',
    priority: 'Normalny',
    description: '',
    status: 'Zaplanowane',
    reservationMethod: 'fifo', // 'expiry' - wg daty ważności, 'fifo' - FIFO
    autoReserveMaterials: true // Domyślnie włączone automatyczne rezerwowanie surowców
  });
  
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Pobierz wszystkie zamówienia
        const ordersData = await getAllOrders();
        setOrders(ordersData);
        
        // Pobierz wszystkie receptury
        await fetchRecipes();
        
        // Pobierz wszystkie stanowiska produkcyjne
        await fetchWorkstations();
      } catch (error) {
        showError('Błąd podczas ładowania danych: ' + error.message);
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
      setTaskForm({
        name: `Produkcja z zamówienia #${verifiedOrderData.orderNumber || verifiedOrderData.id.substring(0, 8)}`,
        priority: 'Normalny',
        description: `Zadanie utworzone na podstawie zamówienia klienta ${verifiedOrderData.customer?.name || '(brak danych)'}`,
        status: 'Zaplanowane',
        reservationMethod: 'fifo',
        autoReserveMaterials: true
      });
      
      // Inicjalizacja zaznaczonych elementów
      if (verifiedOrderData.items && verifiedOrderData.items.length > 0) {
        // Tworzenie nowego stanu dla zaznaczonych elementów
        const initialSelectedItems = verifiedOrderData.items.map((item, index) => ({
          ...item,
          itemId: item.id || index, // Używamy id jeśli istnieje, w przeciwnym razie indeks
          selected: false, // Domyślnie nic nie jest zaznaczone
          unit: normalizeUnit(item.unit) // Normalizacja jednostek do dopuszczalnych wartości
        }));
        
        setSelectedItems(initialSelectedItems);
      } else {
        setSelectedItems([]);
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
          (item.itemId === itemId || item.id === itemId)
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
        
        // Oblicz planowany czas produkcji na podstawie danych z receptury
        let productionTimePerUnit = 0;
        let estimatedDuration = 0;
        
        if (recipe && recipe.productionTimePerUnit) {
          productionTimePerUnit = parseFloat(recipe.productionTimePerUnit);
          // Całkowity czas produkcji w minutach
          const totalProductionTimeMinutes = productionTimePerUnit * item.quantity;
          // Konwersja na godziny
          estimatedDuration = totalProductionTimeMinutes / 60;
        }
        
        // Określ cenę jednostkową i wartość całkowitą
        const itemPrice = item.price || 0;
        const totalValue = (item.price || 0) * item.quantity;
        
        // Uzyskaj datę początku produkcji z wyboru użytkownika lub wartości domyślnej
        const productDate = productDates[item.id] 
          ? new Date(productDates[item.id]) 
          : selectedOrder.orderDate 
            ? new Date(selectedOrder.orderDate) 
            : new Date();
            
        // Domyślnie ustaw godzinę 8:00 rano, jeśli nie została określona przez użytkownika
        if (!productDates[item.id]) {
          productDate.setHours(8, 0, 0, 0);
        }
        
        // Formatuj datę rozpoczęcia z aktualną godziną
        const formattedStartDate = productDate.toISOString();
        
        // Oblicz datę zakończenia na podstawie czasu produkcji
        let endDate = new Date(productDate);
        
        if (estimatedDuration > 0) {
          // Dodaj odpowiednią liczbę godzin do daty rozpoczęcia
          endDate.setHours(endDate.getHours() + Math.ceil(estimatedDuration));
        } else {
          // Jeśli nie ma czasu produkcji, domyślnie zadanie trwa 1 dzień
          endDate.setDate(endDate.getDate() + 1);
        }
        
        // Formatuj datę zakończenia z godziną
        const formattedEndDate = endDate.toISOString();
        
        // Sprawdź, czy dla tego produktu wybrano stanowisko produkcyjne
        const workstationId = selectedWorkstations[item.id] || null;
        
        // Przy tworzeniu obiektów zadań, dodajemy pola lotNumber i expiryDate:
        const taskData = {
          name: taskForm.name || `Produkcja ${item.name}`,
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
          costs: {
            ...costs,
            // Dodaj koszt z zamówienia klienta jako całkowity koszt
            totalCost: itemPrice * item.quantity || totalValue || costs?.totalCost || 0
          },
          itemPrice: itemPrice,
          totalValue: totalValue,
          orderId: selectedOrder.id, // Dodanie orderId do zadania
          orderNumber: selectedOrder.orderNumber || selectedOrder.id,
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
          workstationId: workstationId, // ID stanowiska produkcyjnego
          lotNumber: `LOT-${selectedOrder.orderNumber || new Date().toISOString().slice(0, 10).replace(/-/g, '')}`, // Domyślny LOT na podstawie numeru zamówienia
          expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)) // Domyślna data ważności - 1 rok
        };
        
        // Utwórz zadanie produkcyjne
        // Uwaga: funkcja createTask automatycznie rezerwuje materiały dla zadania
        const newTask = await createTask(taskData, currentUser.uid, taskForm.autoReserveMaterials);
        
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
        
        // Oblicz planowany czas produkcji na podstawie danych z receptury
        let productionTimePerUnit = 0;
        let estimatedDuration = 0;
        
        if (recipe && recipe.productionTimePerUnit) {
          productionTimePerUnit = parseFloat(recipe.productionTimePerUnit);
          // Całkowity czas produkcji w minutach
          const totalProductionTimeMinutes = productionTimePerUnit * item.quantity;
          // Konwersja na godziny
          estimatedDuration = totalProductionTimeMinutes / 60;
        }
        
        // Uzyskaj datę początku produkcji z wyboru użytkownika lub wartości domyślnej
        const productDate = productDates[item.id] 
          ? new Date(productDates[item.id]) 
          : selectedOrder.orderDate 
            ? new Date(selectedOrder.orderDate) 
            : new Date();
            
        // Domyślnie ustaw godzinę 8:00 rano, jeśli nie została określona przez użytkownika
        if (!productDates[item.id]) {
          productDate.setHours(8, 0, 0, 0);
        }
        
        // Formatuj datę rozpoczęcia z aktualną godziną
        const formattedStartDate = productDate.toISOString();
        
        // Oblicz datę zakończenia na podstawie czasu produkcji
        let endDate = new Date(productDate);
        
        if (estimatedDuration > 0) {
          // Dodaj odpowiednią liczbę godzin do daty rozpoczęcia
          endDate.setHours(endDate.getHours() + Math.ceil(estimatedDuration));
        } else {
          // Jeśli nie ma czasu produkcji, domyślnie zadanie trwa 1 dzień
          endDate.setDate(endDate.getDate() + 1);
        }
        
        // Formatuj datę zakończenia z godziną
        const formattedEndDate = endDate.toISOString();
        
        // Sprawdź, czy dla tego produktu wybrano stanowisko produkcyjne
        const workstationId = selectedWorkstations[item.id] || null;
        
        // Przy tworzeniu obiektów zadań, dodajemy pola lotNumber i expiryDate:
        const taskData = {
          name: taskForm.name || `Produkcja ${item.name}`,
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
          costs: {
            ...costs,
            // Dodaj koszt z zamówienia klienta jako całkowity koszt
            totalCost: itemPrice * item.quantity || totalValue || costs?.totalCost || 0
          },
          itemPrice: itemPrice,
          totalValue: totalValue,
          orderId: selectedOrder.id, // Dodanie orderId do zadania
          orderNumber: selectedOrder.orderNumber || selectedOrder.id,
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
          workstationId: workstationId, // ID stanowiska produkcyjnego
          lotNumber: `LOT-${selectedOrder.orderNumber || new Date().toISOString().slice(0, 10).replace(/-/g, '')}`, // Domyślny LOT na podstawie numeru zamówienia
          expiryDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)) // Domyślna data ważności - 1 rok
        };
        
        // Utwórz zadanie produkcyjne
        // Uwaga: funkcja createTask automatycznie rezerwuje materiały dla zadania
        const newTask = await createTask(taskData, currentUser.uid, taskForm.autoReserveMaterials);
        
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

  // Funkcja sprawdzająca czy wszystkie produkty są zaznaczone
  const isAllSelected = () => {
    if (!selectedOrder || !selectedOrder.items || selectedOrder.items.length === 0) {
      return false;
    }
    
    return selectedOrder.items.every(item => isItemSelected(item.id));
  };
  
  // Funkcja sprawdzająca czy tylko część produktów jest zaznaczona
  const isPartiallySelected = () => {
    if (!selectedOrder || !selectedOrder.items || selectedOrder.items.length === 0) {
      return false;
    }
    
    const selectedCount = selectedOrder.items.filter(item => isItemSelected(item.id)).length;
    return selectedCount > 0 && selectedCount < selectedOrder.items.length;
  };
  
  // Funkcja sprawdzająca czy konkretny produkt jest zaznaczony
  const isItemSelected = (itemId) => {
    if (Array.isArray(selectedItems)) {
      return selectedItems.some(item => (item.itemId === itemId || item.id === itemId) && item.selected);
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
      showError('Błąd podczas pobierania stanowisk produkcyjnych: ' + error.message);
      console.error('Error fetching workstations:', error);
    }
  };

  // Obsługa wyboru stanowiska produkcyjnego dla zadania
  const handleWorkstationChange = (itemId, workstationId) => {
    setSelectedWorkstations(prev => ({
      ...prev,
      [itemId]: workstationId
    }));
  };

  // Komponent renderujący tabelę produktów z zamówienia
  const renderProductsTable = () => {
    if (!selectedOrder || !selectedOrder.items || selectedOrder.items.length === 0) {
      return (
        <Typography variant="body1" sx={{ my: 2 }}>
          Zamówienie nie zawiera żadnych produktów.
        </Typography>
      );
    }

    // Funkcja do obsługi zmiany daty rozpoczęcia dla konkretnego produktu
    const handleProductDateChange = (e, itemId) => {
      const { value } = e.target;
      // Aktualizuj daty rozpoczęcia dla konkretnych produktów
      setProductDates(prevDates => ({
        ...prevDates,
        [itemId]: value
      }));
    };

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
              <TableCell>Produkt</TableCell>
              <TableCell align="right">Ilość</TableCell>
              <TableCell>J.m.</TableCell>
              <TableCell align="right">Cena (€)</TableCell>
              <TableCell align="right">Wartość (€)</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Czas produkcji</TableCell>
              <TableCell>Data produkcji</TableCell>
              <TableCell>Stanowisko produkcyjne</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {selectedOrder.items.map((item) => {
              // Znajdź recepturę dla produktu
              const recipe = findRecipeForProduct(item.name);
              // Oblicz planowany czas produkcji dla 1 szt.
              const productionTimePerUnit = recipe?.productionTimePerUnit || 0;
              // Oblicz całkowity czas produkcji w minutach
              const totalProductionTimeMinutes = productionTimePerUnit * item.quantity;
              // Konwersja na godziny
              const totalProductionTime = totalProductionTimeMinutes / 60;
              
              // Sprawdź, czy element ma już utworzone zadanie
              const hasTask = existingTasks.some(task => 
                task.productName === item.name && 
                task.quantity === item.quantity);
                    
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
                        label="Receptura" 
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
                        label="Zadanie utworzone" 
                        color="success" 
                        variant="outlined"
                      />
                    ) : (
                      <Chip 
                        size="small" 
                        label="Oczekuje" 
                        color="warning" 
                        variant="outlined"
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {totalProductionTime > 0 ? (
                      `${(productionTimePerUnit * item.quantity).toFixed(1)} min.`
                    ) : (
                      recipe ? (
                        <Typography variant="body2" color="error">
                          Brak czasu w recepturze
                        </Typography>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Brak receptury
                        </Typography>
                      )
                    )}
                  </TableCell>
                  <TableCell>
                    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                      <DateTimePicker
                        label="Data i godzina produkcji"
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
                          <em>Brak</em>
                        </MenuItem>
                        {workstations.map((workstation) => (
                          <MenuItem key={workstation.id} value={workstation.id}>
                            {workstation.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    );
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
                      // Zapewnienie, że totalValue jest liczbą - najpierw próbujemy użyć calculatedTotalValue, 
                      // potem totalValue, a na końcu zwykłej wartości
                      const totalValue = parseFloat(order.calculatedTotalValue || order.totalValue || order.value || 0);
                      
                      return (
                      <MenuItem key={order.id} value={order.id}>
                          {order.orderNumber || order.id.substring(0, 8)} - {order.customer?.name || 'Brak danych klienta'} ({formatCurrency(totalValue)})
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
                      <strong>Numer:</strong> {selectedOrder.orderNumber || selectedOrder.id.substring(0, 8)}
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
                    <FormControl fullWidth margin="normal">
                      <InputLabel>Automatyczna rezerwacja surowców</InputLabel>
                      <Select
                        name="autoReserveMaterials"
                        value={taskForm.autoReserveMaterials}
                        onChange={handleTaskFormChange}
                        label="Automatyczna rezerwacja surowców"
                      >
                        <MenuItem value={true}>Tak - automatycznie rezerwuj surowce</MenuItem>
                        <MenuItem value={false}>Nie - rezerwacja ręczna później</MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
                
                <Typography variant="h6" gutterBottom>
                  Wybierz produkty do wyprodukowania:
                </Typography>
                
                {renderProductsTable()}
                
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