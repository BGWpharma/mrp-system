// src/components/production/TaskForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  ListItemSecondary
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
  Link as LinkIcon
} from '@mui/icons-material';
import {
  createTask,
  updateTask,
  getTaskById
} from '../../services/productionService';
import { getAllRecipes, getRecipeById } from '../../services/recipeService';
import {
  getAllInventoryItems,
  getInventoryItemById
} from '../../services/inventoryService';
import { getAllPurchaseOrders } from '../../services/purchaseOrderService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { getAllWorkstations } from '../../services/workstationService';
import { generateLOTNumber } from '../../utils/numberGenerators';

const TaskForm = ({ taskId }) => {
  const [loading, setLoading] = useState(!!taskId);
  const [saving, setSaving] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const [recipe, setRecipe] = useState(null);
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const { currentUser } = useAuth();
  const { showSuccess, showError, showWarning } = useNotification();
  const navigate = useNavigate();
  
  const [workstations, setWorkstations] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState(null);
  
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

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        await fetchRecipes();
        await fetchInventoryProducts();
        await fetchWorkstations(); // Pobierz stanowiska produkcyjne
        await fetchPurchaseOrders(); // Pobierz zamówienia zakupowe
        
        if (taskId && taskId !== 'new') {
          await fetchTask();
        } else {
          setLoading(false);
        }
      } catch (error) {
        showError('Błąd podczas ładowania danych: ' + error.message);
        console.error('Error loading data:', error);
        setLoading(false);
      }
    };
    
    fetchData();
  }, [taskId]);

  const fetchRecipes = async () => {
    try {
      const recipesData = await getAllRecipes();
      setRecipes(recipesData);
    } catch (error) {
      showError('Błąd podczas pobierania receptur: ' + error.message);
      console.error('Error fetching recipes:', error);
    }
  };

  const fetchInventoryProducts = async () => {
    try {
      // Pobierz tylko produkty z kategorii "Gotowe produkty"
      const allItems = await getAllInventoryItems();
      const products = allItems.filter(item => item.category === 'Gotowe produkty');
      setInventoryProducts(products);
    } catch (error) {
      showError('Błąd podczas pobierania produktów z magazynu: ' + error.message);
      console.error('Error fetching inventory products:', error);
    }
  };

  const fetchWorkstations = async () => {
    try {
      const workstationsData = await getAllWorkstations();
      setWorkstations(workstationsData);
    } catch (error) {
      showError('Błąd podczas pobierania stanowisk produkcyjnych: ' + error.message);
      console.error('Error fetching workstations:', error);
    }
  };

  const fetchPurchaseOrders = async () => {
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
      
      // Jeśli zadanie ma powiązany produkt z magazynu, pobierz go
      if (task.inventoryProductId) {
        const inventoryItem = await getInventoryItemById(task.inventoryProductId);
        if (inventoryItem) {
          setTaskData(prev => ({
            ...prev,
            inventoryProductId: inventoryItem.id
          }));
        }
      }
      
      // Jeśli zadanie ma przypisaną recepturę, pobierz jej szczegóły
      if (task.recipeId) {
        try {
          const recipeData = await getRecipeById(task.recipeId);
          if (recipeData) {
            setRecipe(recipeData);
          }
        } catch (recipeError) {
          console.error('Błąd podczas pobierania receptury:', recipeError);
          showError('Nie udało się pobrać danych receptury');
        }
      }
    } catch (error) {
      showError('Błąd podczas pobierania zadania: ' + error.message);
      console.error('Error fetching task:', error);
    } finally {
      setLoading(false);
    }
  };

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
      
      navigate('/production');
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
      const selectedRecipe = await getRecipeById(recipeId);
      setRecipe(selectedRecipe);
      
      // Ustaw nazwę produktu z receptury
      if (selectedRecipe.output && selectedRecipe.output.name) {
        setTaskData(prev => ({
          ...prev,
          productName: selectedRecipe.output.name,
          unit: selectedRecipe.output.unit || 'szt.'
        }));
      }
      
      // Przygotuj listę materiałów z receptury
      if (selectedRecipe.ingredients && selectedRecipe.ingredients.length > 0) {
        const materials = selectedRecipe.ingredients.map(ingredient => ({
          id: ingredient.id,
          name: ingredient.name,
          category: ingredient.category || 'Surowce',
          quantity: ingredient.quantity || 0,
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
      
      // Oblicz nową datę zakończenia na podstawie daty rozpoczęcia i czasu produkcji
      const endDate = new Date(newDate.getTime() + (productionTimeMinutes * 60 * 1000));
      
      return {
        ...prev,
        scheduledDate: newDate,
        endDate: endDate
      };
    });
  };

  const handleEndDateChange = (newDate) => {
    // Oblicz czas produkcji w minutach na podstawie różnicy między datą rozpoczęcia a zakończenia
    const startTime = taskData.scheduledDate.getTime();
    const endTime = newDate.getTime();
    const durationInMinutes = Math.max(0, (endTime - startTime) / (60 * 1000));
    
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
      
      // Zaktualizuj datę zakończenia
      if (taskData.scheduledDate) {
        const startDate = new Date(taskData.scheduledDate);
        const endDate = new Date(startDate.getTime() + (estimatedTimeMinutes * 60 * 1000));
        setTaskData(prev => ({
          ...prev,
          endDate
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
      const endDate = new Date(taskData.scheduledDate.getTime() + durationInMinutes * 60 * 1000);
      setTaskData(prev => ({
        ...prev,
        estimatedDuration: durationInMinutes,
        endDate: endDate
      }));
    } else {
      setTaskData(prev => ({
        ...prev,
        estimatedDuration: e.target.value
      }));
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
      
      // Zaktualizuj datę zakończenia
      if (taskData.scheduledDate) {
        const startDate = new Date(taskData.scheduledDate);
        const endDate = new Date(startDate.getTime() + (estimatedTimeMinutes * 60 * 1000));
        setTaskData(prev => ({
          ...prev,
          endDate
        }));
      }
      
      // Zaktualizuj ilości materiałów
      if (taskData.materials && taskData.materials.length > 0) {
        const updatedMaterials = taskData.materials.map(material => {
          const recipeIngredient = recipe.ingredients.find(ing => ing.id === material.id);
          if (recipeIngredient) {
            return {
              ...material,
              quantity: (recipeIngredient.quantity || 0) * newQuantity
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

  if (loading) {
    return <div>Ładowanie zadania...</div>;
  }

  return (
    <Container maxWidth="md">
      <Paper elevation={3} sx={{ p: 3, mt: 3, mb: 3 }}>
        <Typography variant="h5" component="h1" gutterBottom sx={{ mb: 3, color: 'primary.main', fontWeight: 'bold' }}>
          {taskId && taskId !== 'new' ? 'Edytuj zadanie produkcyjne' : 'Nowe zadanie produkcyjne'}
        </Typography>
        
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
                      {recipes.map((recipe) => (
                        <MenuItem key={recipe.id} value={recipe.id}>
                          {recipe.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <Autocomplete
                    id="inventory-product"
                    options={inventoryProducts}
                    getOptionLabel={(option) => option.name}
                    value={taskData.inventoryProductId ? { id: taskData.inventoryProductId, name: taskData.productName } : null}
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
                      />
                    )}
                  />
                </Grid>
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
                      <MenuItem value="szt.">szt.</MenuItem>
                      <MenuItem value="kg">kg</MenuItem>
                      <MenuItem value="caps">caps</MenuItem>
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
                  <TextField
                    fullWidth
                    label="Czas produkcji na jednostkę (min)"
                    name="productionTimePerUnit"
                    value={taskData.productionTimePerUnit}
                    onChange={handleProductionTimePerUnitChange}
                    type="number"
                    variant="outlined"
                    InputProps={{ inputProps: { min: 0, step: 0.1 } }}
                    helperText="Czas produkcji dla 1 sztuki w minutach"
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
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth variant="outlined">
                    <InputLabel>Status</InputLabel>
                    <Select
                      name="status"
                      value={taskData.status || 'Zaplanowane'}
                      onChange={handleChange}
                      label="Status"
                    >
                      <MenuItem value="Zaplanowane">Zaplanowane</MenuItem>
                      <MenuItem value="W trakcie">W trakcie</MenuItem>
                      <MenuItem value="Zakończone">Zakończone</MenuItem>
                      <MenuItem value="Anulowane">Anulowane</MenuItem>
                    </Select>
                    <FormHelperText>Status zadania produkcyjnego</FormHelperText>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth variant="outlined">
                    <InputLabel>Priorytet</InputLabel>
                    <Select
                      name="priority"
                      value={taskData.priority || 'Normalny'}
                      onChange={handleChange}
                      label="Priorytet"
                    >
                      <MenuItem value="Niski">Niski</MenuItem>
                      <MenuItem value="Normalny">Normalny</MenuItem>
                      <MenuItem value="Wysoki">Wysoki</MenuItem>
                      <MenuItem value="Krytyczny">Krytyczny</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
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
                      {workstations.map((workstation) => (
                        <MenuItem key={workstation.id} value={workstation.id}>
                          {workstation.name}
                        </MenuItem>
                      ))}
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
                      options={purchaseOrders}
                      getOptionLabel={(option) => `${option.number} - ${option.supplier?.name || 'Brak dostawcy'}`}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Wybierz zamówienie zakupowe"
                          variant="outlined"
                          fullWidth
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
                onClick={() => navigate('/production')}
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
    </Container>
  );
};

export default TaskForm;