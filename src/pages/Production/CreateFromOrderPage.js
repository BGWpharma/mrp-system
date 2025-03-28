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
  ShoppingCart as ShoppingCartIcon
} from '@mui/icons-material';
import { getAllOrders, getOrderById, addProductionTaskToOrder } from '../../services/orderService';
import { createTask, reserveMaterialsForTask } from '../../services/productionService';
import { getAllRecipes, getRecipeById } from '../../services/recipeService';
import { getIngredientPrices, getInventoryItemById } from '../../services/inventoryService';
import { calculateProductionTaskCost } from '../../utils/costCalculator';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatUtils';

const CreateFromOrderPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  
  const [orders, setOrders] = useState([]);
  const [selectedOrderId, setSelectedOrderId] = useState(location.state?.orderId || '');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [orderLoading, setOrderLoading] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const [existingTasks, setExistingTasks] = useState([]);
  
  // Formularz nowego zadania
  const [taskForm, setTaskForm] = useState({
    name: '',
    scheduledDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
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
      setSelectedOrder(orderData);
      
      // Sprawdź, czy zamówienie ma już utworzone zadania produkcyjne
      if (orderData.productionTasks && orderData.productionTasks.length > 0) {
        showInfo(`Uwaga: Dla tego zamówienia utworzono już ${orderData.productionTasks.length} zadań produkcyjnych. Tworzenie dodatkowych może prowadzić do duplikacji.`);
        // Zapisz istniejące zadania do wyświetlenia w UI
        setExistingTasks(orderData.productionTasks);
      } else {
        // Wyczyść listę istniejących zadań, jeśli wybrano nowe zamówienie bez zadań
        setExistingTasks([]);
      }
      
      // Ustaw początkowe wartości dla formularza zadania
      setTaskForm({
        name: `Produkcja z zamówienia #${orderData.orderNumber || orderId.substring(0, 8)}`,
        scheduledDate: new Date().toISOString().split('T')[0],
        endDate: new Date().toISOString().split('T')[0],
        priority: 'Normalny',
        description: `Zadanie utworzone na podstawie zamówienia klienta ${orderData.customer?.name || '(brak danych)'}`,
        status: 'Zaplanowane',
        reservationMethod: 'fifo'
      });
      
      // Domyślnie zaznacz wszystkie elementy zamówienia
      if (orderData.items && orderData.items.length > 0) {
        setSelectedItems(orderData.items.map((item, index) => ({
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
    
    if (orderId) {
      fetchOrderDetails(orderId);
    } else {
      setSelectedOrder(null);
      setSelectedItems([]);
    }
  };
  
  const handleTaskFormChange = (e) => {
    const { name, value } = e.target;
    setTaskForm(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleItemSelect = (itemId) => {
    setSelectedItems(prev => 
      prev.map(item => 
        item.itemId === itemId 
          ? { ...item, selected: !item.selected } 
          : item
      )
    );
  };
  
  const handleSelectAllItems = (event) => {
    const checked = event.target.checked;
    setSelectedItems(prev => 
      prev.map(item => ({ ...item, selected: checked }))
    );
  };
  
  const handleCreateTask = async () => {
    // Sprawdź czy wybrano co najmniej jeden element
    const hasSelectedItems = selectedItems.some(item => item.selected);
    
    if (!hasSelectedItems) {
      showError('Wybierz co najmniej jeden produkt z zamówienia');
      return;
    }
    
    try {
      setCreatingTask(true);
      
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
              const costData = calculateProductionTaskCost(taskForCostCalc, recipe, pricesMap);
              
              // Zapisz całkowity koszt produkcji (zamiast kosztu jednostkowego)
              costs = {
                ingredientsCost: costData.ingredientsCost,
                laborCost: costData.laborCost,
                energyCost: costData.energyCost,
                overheadCost: costData.overheadCost,
                unitCost: costData.unitCost,
                totalCost: costData.taskTotalCost
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
      setCreatingTask(false);
    }
  };
  
  const handleBack = () => {
    navigate('/orders');
  };
  
  const areAllItemsSelected = selectedItems.length > 0 && selectedItems.every(item => item.selected);
  const someItemsSelected = selectedItems.some(item => item.selected);

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
                    {orders.map(order => (
                      <MenuItem key={order.id} value={order.id}>
                        #{order.orderNumber || order.id.substring(0, 8)} - {order.customer?.name || 'Brak danych klienta'} ({formatCurrency(order.totalValue || 0)})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
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
                      {selectedItems.map((item) => (
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
                      ))}
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
                    onClick={handleCreateTask}
                    disabled={creatingTask || !someItemsSelected}
                    sx={{ mr: 2 }}
                  >
                    {creatingTask ? <CircularProgress size={24} /> : 'Utwórz zadanie produkcyjne'}
                  </Button>
                </Box>
              </>
            ) : (
              <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
                {orders.length > 0 ? (
                  'Wybierz zamówienie z listy, aby utworzyć zadanie produkcyjne.'
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