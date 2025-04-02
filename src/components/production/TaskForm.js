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
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Alert,
  AlertTitle
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  Calculate as CalculateIcon
} from '@mui/icons-material';
import {
  createTask,
  updateTask,
  getTaskById,
  reserveMaterialsForTask
} from '../../services/productionService';
import { getAllRecipes, getRecipeById } from '../../services/recipeService';
import {
  getAllInventoryItems,
  getInventoryItemById,
  getIngredientPrices,
  getProductsWithEarliestExpiry,
  getProductsFIFO,
  bookInventoryForTask
} from '../../services/inventoryService';
import { calculateManufacturingOrderCosts, calculateEstimatedProductionTime } from '../../utils/costCalculator';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';

const TaskForm = ({ taskId }) => {
  const [loading, setLoading] = useState(!!taskId);
  const [saving, setSaving] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const [recipe, setRecipe] = useState(null);
  const [inventoryProducts, setInventoryProducts] = useState([]);
  const { currentUser } = useAuth();
  const { showSuccess, showError, showWarning } = useNotification();
  const navigate = useNavigate();
  
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
    priority: 'Normalny',
    status: 'Zaplanowane',
    notes: '',
    moNumber: ''
  });

  // Dodajemy stan dla kalkulacji kosztów
  const [costCalculation, setCostCalculation] = useState(null);
  const [calculatingCosts, setCalculatingCosts] = useState(false);

  // Dodajemy stan dla wybranego produktu z magazynu
  const [selectedProduct, setSelectedProduct] = useState(null);

  // Dodaj nowy stan dla zarezerwowanych składników
  const [bookedIngredients, setBookedIngredients] = useState([]);
  const [showBookingDetails, setShowBookingDetails] = useState(false);
  
  // Dodaj stan dla metody rezerwacji
  const [reservationMethod, setReservationMethod] = useState('fifo'); // 'expiry' lub 'fifo'

  const [recipeYieldError, setRecipeYieldError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        await fetchRecipes();
        await fetchInventoryProducts();
        
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

  const fetchTask = async () => {
    try {
      const task = await getTaskById(taskId);
      setTaskData(task);
      
      // Jeśli zadanie ma powiązany produkt z magazynu, pobierz go
      if (task.inventoryProductId) {
        const inventoryItem = await getInventoryItemById(task.inventoryProductId);
        if (inventoryItem) {
          setSelectedProduct(inventoryItem);
        }
      }
      
      // Jeśli zadanie ma przypisaną recepturę, pobierz jej szczegóły
      if (task.recipeId) {
        const recipe = await getRecipeById(task.recipeId);
        // Nie aktualizujemy nazwy produktu, ponieważ może być już wybrana z magazynu
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
      
      // Przygotuj dane zadania z kosztami
      let taskDataWithCosts = { ...taskData };
      if (costCalculation) {
        taskDataWithCosts = {
          ...taskDataWithCosts,
          costs: costCalculation
        };
      }
      
      let savedTaskId;
      
      if (taskId) {
        // Aktualizacja zadania
        await updateTask(taskId, taskDataWithCosts, currentUser.uid);
        savedTaskId = taskId;
        showSuccess('Zadanie zostało zaktualizowane');
      } else {
        // Utworzenie nowego zadania
        const newTask = await createTask(taskDataWithCosts, currentUser.uid);
        savedTaskId = newTask.id;
        showSuccess('Zadanie zostało utworzone');
        
        // Dokonaj faktycznej rezerwacji składników tylko po utworzeniu nowego zadania
        if (taskData.materials && taskData.materials.length > 0) {
          try {
            // Zarezerwuj składniki faktycznie po utworzeniu zadania
            const bookingResult = await reserveMaterialsForTask(savedTaskId, taskData.materials, reservationMethod);
            if (bookingResult.success) {
              showSuccess('Materiały zostały zarezerwowane dla zadania');
            } else if (bookingResult.errors && bookingResult.errors.length > 0) {
              let errorMsg = 'Zadanie zostało utworzone, ale nie wszystkie materiały zostały zarezerwowane:';
              bookingResult.errors.forEach(err => {
                errorMsg += '\n- ' + err;
              });
              showError(errorMsg);
            }
          } catch (bookingError) {
            showError(`Zadanie zostało utworzone, ale wystąpił błąd podczas rezerwacji materiałów: ${bookingError.message}`);
            console.error('Error booking ingredients:', bookingError);
          }
        }
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
      
      // Ustawienie szacowanego czasu trwania na podstawie czasu przygotowania z receptury
      if (selectedRecipe.preparationTime) {
        const quantity = taskData.quantity || 1;
        const estimatedTime = calculateEstimatedProductionTime(selectedRecipe, quantity);
        setTaskData(prev => ({
          ...prev,
          estimatedDuration: estimatedTime
        }));
        
        // Zaktualizuj datę zakończenia na podstawie szacowanego czasu
        if (taskData.scheduledDate) {
          const startDate = new Date(taskData.scheduledDate);
          const endDate = new Date(startDate.getTime() + (estimatedTime * 60 * 1000));
          setTaskData(prev => ({
            ...prev,
            endDate
          }));
        }
      }
      
    } catch (error) {
      console.error('Error loading recipe details:', error);
      showError('Błąd podczas ładowania szczegółów receptury');
    }
  };

  const handleDateChange = (newDate) => {
    setTaskData(prev => ({
      ...prev,
      scheduledDate: newDate
    }));
  };

  const handleEndDateChange = (newDate) => {
    setTaskData(prev => ({
      ...prev,
      endDate: newDate
    }));
  };

  const handleDurationChange = (e) => {
    const duration = parseInt(e.target.value);
    if (!isNaN(duration) && duration > 0) {
      // Aktualizacja endDate na podstawie scheduledDate i podanego czasu trwania
      const endDate = new Date(taskData.scheduledDate.getTime() + duration * 60 * 1000);
      setTaskData(prev => ({
        ...prev,
        estimatedDuration: duration,
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
      // Zaktualizuj szacowany czas produkcji
      const estimatedTime = calculateEstimatedProductionTime(recipe, newQuantity);
      setTaskData(prev => ({
        ...prev,
        estimatedDuration: estimatedTime
      }));
      
      // Zaktualizuj datę zakończenia
      if (taskData.scheduledDate) {
        const startDate = new Date(taskData.scheduledDate);
        const endDate = new Date(startDate.getTime() + (estimatedTime * 60 * 1000));
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

  // Funkcja do kalkulacji kosztów zadania produkcyjnego
  const handleCalculateCosts = async () => {
    try {
      setCalculatingCosts(true);
      
      // Sprawdź, czy zadanie ma przypisaną recepturę
      if (!taskData.recipeId) {
        showError('Zadanie musi mieć przypisaną recepturę, aby obliczyć koszty');
        setCalculatingCosts(false);
        return;
      }
      
      // Pobierz szczegóły receptury
      const recipe = await getRecipeById(taskData.recipeId);
      
      if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
        showError('Receptura nie zawiera składników, nie można obliczyć kosztów');
        setCalculatingCosts(false);
        return;
      }
      
      // Pobierz ID składników z receptury
      const ingredientIds = recipe.ingredients
        .filter(ing => ing.id) // Tylko składniki z ID (z magazynu)
        .map(ing => ing.id);
      
      if (ingredientIds.length === 0) {
        showError('Brak składników z magazynu w recepturze. Tylko składniki wybrane z magazynu mają przypisane ceny.');
        setCalculatingCosts(false);
        return;
      }
      
      // Informuj użytkownika, jeśli nie wszystkie składniki mają ceny
      if (ingredientIds.length < recipe.ingredients.length) {
        showError('Uwaga: Tylko składniki wybrane z magazynu mają przypisane ceny. Składniki dodane ręcznie nie będą uwzględnione w kalkulacji kosztów.');
      }
      
      console.log('Pobieranie cen dla składników:', ingredientIds);
      
      // Pobierz ceny składników
      const pricesMap = await getIngredientPrices(ingredientIds);
      
      console.log('Otrzymana mapa cen:', pricesMap);
      
      // Oblicz koszty używając nowej funkcji zgodnej z MRPeasy
      const costData = calculateManufacturingOrderCosts(taskData, recipe, pricesMap);
      setCostCalculation(costData);
      
      // Wyświetl informację o obliczonych kosztach
      showSuccess(`Obliczono koszty produkcji: ${costData.totalProductionCost.toFixed(2)} EUR`);
      
    } catch (error) {
      console.error('Błąd podczas kalkulacji kosztów:', error);
      showError('Nie udało się obliczyć kosztów: ' + error.message);
    } finally {
      setCalculatingCosts(false);
    }
  };

  // Funkcja obsługująca wybór produktu z magazynu
  const handleProductSelect = (event, newValue) => {
    setSelectedProduct(newValue);
    if (newValue) {
      setTaskData(prev => ({
        ...prev,
        productName: newValue.name,
        unit: newValue.unit || 'szt.',
        inventoryProductId: newValue.id
      }));
    } else {
      // Jeśli usunięto wybór produktu, usuń też ID produktu z magazynu
      setTaskData(prev => {
        const updatedData = { ...prev };
        delete updatedData.inventoryProductId;
        return updatedData;
      });
    }
  };

  // Modyfikuję funkcję handleBookIngredients, aby obsługiwała różne metody rezerwacji
  const handleBookIngredients = async () => {
    if (!taskData.recipeId) {
      showError('Wybierz recepturę, aby zaplanować składniki');
      return;
    }

    // Sprawdź, czy quantity jest prawidłową liczbą
    const taskQuantity = parseFloat(taskData.quantity);
    if (isNaN(taskQuantity) || taskQuantity <= 0) {
      showError('Podaj prawidłową ilość produktu do wyprodukowania (liczba większa od zera)');
      return;
    }

    try {
      setLoading(true);
      // Pobierz szczegóły receptury
      const recipe = await getRecipeById(taskData.recipeId);
      
      if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
        showError('Receptura nie zawiera składników');
        setLoading(false);
        return;
      }

      // Sprawdź, czy yield jest prawidłową liczbą
      let recipeYield = 1;
      if (recipe.yield) {
        if (typeof recipe.yield === 'object' && recipe.yield.quantity) {
          recipeYield = parseFloat(recipe.yield.quantity);
        } else if (typeof recipe.yield === 'number') {
          recipeYield = recipe.yield;
        } else if (typeof recipe.yield === 'string') {
          recipeYield = parseFloat(recipe.yield);
        }
      }
      
      if (isNaN(recipeYield) || recipeYield <= 0) {
        showError('Receptura ma nieprawidłową wydajność. Sprawdź dane receptury.');
        setRecipeYieldError(true);
        setLoading(false);
        return;
      } else {
        setRecipeYieldError(false);
      }
      
      // Przygotuj listę materiałów do zadania, ale bez faktycznej rezerwacji
      const materialsForTask = [];
      const tempBookedIngredients = []; // Tylko do pokazania, bez faktycznej rezerwacji
      const missingIngredients = []; // Lista składników, których nie ma w magazynie
      let hasErrors = false;
      let hasWarnings = false;
      
      // Dla każdego składnika z receptury
      for (const ingredient of recipe.ingredients) {
        if (!ingredient.id) {
          // Pomiń składniki, które nie są powiązane z magazynem
          continue;
        }
        
        // Sprawdź, czy ilość składnika jest prawidłową liczbą
        const ingredientQuantity = parseFloat(ingredient.quantity);
        if (isNaN(ingredientQuantity)) {
          showError(`Składnik ${ingredient.name} ma nieprawidłową ilość. Sprawdź dane receptury.`);
          continue;
        }
        
        // Oblicz ilość potrzebną do produkcji
        let requiredQuantity = (ingredientQuantity * taskQuantity) / recipeYield;
        
        // Dodatkowa walidacja - upewnij się, że requiredQuantity jest dodatnie
        if (requiredQuantity <= 0) {
          showError(`Obliczona ilość dla składnika ${ingredient.name} jest nieprawidłowa (${requiredQuantity}). Sprawdź dane receptury.`);
          continue;
        }
        
        try {
          // Sprawdź czy składnik istnieje w magazynie
          try {
            const item = await getInventoryItemById(ingredient.id);
            
            // Dodaj do listy materiałów do zadania
            materialsForTask.push({
              id: ingredient.id,
              name: ingredient.name,
              quantity: requiredQuantity,
              unit: ingredient.unit || item.unit,
              category: ingredient.category || item.category
            });
            
            // Tylko sprawdź, czy jest wystarczająca ilość
            if (item.quantity < requiredQuantity) {
              hasWarnings = true;
              showError(`Niewystarczająca ilość składnika ${ingredient.name} w magazynie. Dostępne: ${item.quantity} ${item.unit}, wymagane: ${requiredQuantity.toFixed(2)} ${item.unit}`);
            }
            
            // Pobierz batche (partie) składnika zgodnie z wybraną metodą
            let batches = [];
            try {
              if (reservationMethod === 'expiry') {
                batches = await getProductsWithEarliestExpiry(ingredient.id, requiredQuantity);
              } else {
                batches = await getProductsFIFO(ingredient.id, requiredQuantity);
              }
            } catch (error) {
              console.warn(`Nie można pobrać partii dla ${ingredient.name}:`, error);
            }
            
            // Dodaj do listy zarezerwowanych składników (tylko do pokazania)
            tempBookedIngredients.push({
              id: ingredient.id,
              name: ingredient.name,
              quantity: requiredQuantity,
              unit: item.unit,
              batches: batches.map(b => ({
                ...b,
                selectedQuantity: b.selectedQuantity || b.quantity
              }))
            });
            
          } catch (error) {
            // Składnik nie istnieje w magazynie, dodajemy do listy brakujących
            console.warn(`Składnik ${ingredient.name} (ID: ${ingredient.id}) nie istnieje w magazynie:`, error);
            missingIngredients.push({
              name: ingredient.name,
              id: ingredient.id,
              quantity: requiredQuantity,
              unit: ingredient.unit || 'szt.'
            });
            
            // Mimo to dodaj do listy materiałów, ale oznacz jako brakujący
            materialsForTask.push({
              id: ingredient.id,
              name: ingredient.name,
              quantity: requiredQuantity,
              unit: ingredient.unit || 'szt.',
              category: ingredient.category || 'Surowce',
              missing: true  // Oznacz jako brakujący
            });
            
            hasWarnings = true;
          }
        } catch (error) {
          hasErrors = true;
          const errorMessage = error.message || 'Nieznany błąd';
          showError(`Błąd przy sprawdzaniu składnika ${ingredient.name}: ${errorMessage}`);
          console.error(`Błąd przy sprawdzaniu składnika ${ingredient.name}:`, error);
        }
      }
      
      if (materialsForTask.length > 0) {
        // Zapisz listę materiałów do formularza, aby została zapisana z zadaniem
        setTaskData(prev => ({
          ...prev,
          materials: materialsForTask
        }));
        
        // Ustawienie tymczasowo zarezerwowanych składników do wyświetlenia
        setBookedIngredients(tempBookedIngredients);
        setShowBookingDetails(true);
        
        if (missingIngredients.length > 0) {
          showWarning(`Uwaga: ${missingIngredients.length} składnik(ów) nie istnieje w magazynie. Dodaj je do magazynu przed rozpoczęciem produkcji.`);
          // Wyświetl listę brakujących składników
          missingIngredients.forEach(ingredient => {
            showWarning(`Brakujący składnik: ${ingredient.name}, potrzeba: ${ingredient.quantity} ${ingredient.unit}`);
          });
        }
        
        if (hasErrors) {
          showError('Niektóre składniki mogą być niedostępne. Sprawdź komunikaty powyżej.');
        } else if (hasWarnings) {
          showWarning('Zadanie zostało zaplanowane, ale niektóre składniki są niedostępne lub brakujące. Zadanie można zapisać, ale rezerwacja materiałów może być niepełna.');
        } else {
          showSuccess('Zaplanowano wszystkie materiały na zadanie produkcyjne. Materiały zostaną zarezerwowane po zapisaniu zadania.');
        }
      } else {
        showError('Nie udało się zaplanować żadnego materiału. Sprawdź dane receptury i dostępność w magazynie.');
      }
    } catch (error) {
      const errorMessage = error.message || 'Nieznany błąd';
      showError('Błąd podczas planowania materiałów: ' + errorMessage);
      console.error('Error planning materials:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Ładowanie zadania...</div>;
  }

  return (
    <Container maxWidth="md">
      <Paper elevation={3} sx={{ p: 3, mt: 3 }}>
        <Typography variant="h5" component="h1" gutterBottom>
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
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <TextField
                  required
                  label="Nazwa zadania"
                  name="name"
                  value={taskData.name}
                  onChange={handleChange}
                  fullWidth
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
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
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
                  value={selectedProduct}
                  onChange={handleProductSelect}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Produkt z magazynu (opcjonalnie)"
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
                  disabled={!!selectedProduct}
                  helperText={selectedProduct ? "Nazwa produktu pobrana z magazynu" : ""}
                />
              </Grid>
              <Grid item xs={8}>
                <TextField
                  label="Ilość"
                  name="quantity"
                  type="number"
                  value={taskData.quantity || ''}
                  onChange={handleQuantityChange}
                  fullWidth
                  required
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
              <Grid item xs={4}>
                <FormControl fullWidth>
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
              <Grid item xs={6}>
                <DateTimePicker
                  label="Data rozpoczęcia"
                  value={taskData.scheduledDate}
                  onChange={handleDateChange}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      required: true
                    }
                  }}
                />
              </Grid>
              <Grid item xs={6}>
                <DateTimePicker
                  label="Data zakończenia"
                  value={taskData.endDate}
                  onChange={handleEndDateChange}
                  minDate={taskData.scheduledDate}
                  slotProps={{
                    textField: {
                      fullWidth: true,
                      required: true
                    }
                  }}
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Szacowany czas trwania (min)"
                  name="estimatedDuration"
                  type="number"
                  value={taskData.estimatedDuration || ''}
                  onChange={handleDurationChange}
                  fullWidth
                  inputProps={{ min: 0 }}
                  helperText="Automatycznie aktualizuje datę zakończenia"
                />
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth>
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
              <Grid item xs={6}>
                <FormControl fullWidth>
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
            </Grid>

            {/* Sekcja kosztów produkcji */}
            <Box sx={{ mt: 4, mb: 2 }}>
              <Divider>
                <Typography variant="h6">Koszty produkcji</Typography>
              </Divider>
            </Box>

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Paper sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                  {costCalculation ? (
                    <Box>
                      <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}>
                          <Typography variant="subtitle1" fontWeight="bold">Koszty materiałów:</Typography>
                          <Typography>{costCalculation.materialCost.toFixed(2)} EUR</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <Typography variant="subtitle1" fontWeight="bold">Koszty pracy:</Typography>
                          <Typography>{costCalculation.actualLaborCost.toFixed(2)} EUR</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <Typography variant="subtitle1" fontWeight="bold">Koszty maszyn:</Typography>
                          <Typography>{costCalculation.machineCost.toFixed(2)} EUR</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <Typography variant="subtitle1" fontWeight="bold">Koszty pośrednie:</Typography>
                          <Typography>{costCalculation.overheadCost.toFixed(2)} EUR</Typography>
                        </Grid>
                        <Grid item xs={12}>
                          <Divider sx={{ my: 1 }} />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <Typography variant="subtitle1" fontWeight="bold">Koszt jednostkowy:</Typography>
                          <Typography>{costCalculation.unitCost.toFixed(2)} EUR / {taskData.unit}</Typography>
                        </Grid>
                        <Grid item xs={12} sm={6}>
                          <Typography variant="subtitle1" fontWeight="bold">Całkowity koszt zadania:</Typography>
                          <Typography variant="h6" color="primary">{costCalculation.totalProductionCost.toFixed(2)} EUR</Typography>
                        </Grid>
                      </Grid>
                    </Box>
                  ) : (
                    <Box sx={{ textAlign: 'center', py: 2 }}>
                      <Typography variant="body1" color="text.secondary">
                        Wybierz recepturę i ilość, aby obliczyć koszty produkcji
                      </Typography>
                      <Button
                        variant="outlined"
                        color="primary"
                        startIcon={<CalculateIcon />}
                        onClick={handleCalculateCosts}
                        disabled={!taskData.recipeId || calculatingCosts}
                        sx={{ mr: 2 }}
                      >
                        {calculatingCosts ? 'Obliczanie...' : 'Oblicz koszty'}
                      </Button>
                    </Box>
                  )}
                </Paper>
              </Grid>
            </Grid>

            {/* Wybór metody rezerwacji */}
            <FormControl component="fieldset" sx={{ mb: 2, mt: 2 }}>
              <FormLabel component="legend">Metoda rezerwacji składników</FormLabel>
              <RadioGroup
                row
                name="reservationMethod"
                value={reservationMethod}
                onChange={(e) => setReservationMethod(e.target.value)}
              >
                <FormControlLabel 
                  value="fifo" 
                  control={<Radio />} 
                  label="FIFO (First In, First Out)" 
                />
                <FormControlLabel 
                  value="expiry" 
                  control={<Radio />} 
                  label="Według daty ważności (najkrótszej)" 
                />
              </RadioGroup>
            </FormControl>

            {/* Przycisk do bookowania składników */}
            <Button
              variant="outlined"
              color="secondary"
              onClick={handleBookIngredients}
              disabled={!taskData.recipeId || loading}
            >
              Zarezerwuj składniki
            </Button>

            {/* Wyświetl szczegóły zarezerwowanych składników */}
            {showBookingDetails && bookedIngredients.length > 0 && (
              <Box mt={3} p={2} border={1} borderColor="divider" borderRadius={1}>
                <Typography variant="h6" gutterBottom>
                  Zarezerwowane składniki:
                </Typography>
                {bookedIngredients.map((ingredient, index) => (
                  <Box key={index} mb={1}>
                    <Typography>
                      {ingredient.name}: {ingredient.quantity.toFixed(2)} {ingredient.unit}
                    </Typography>
                    {ingredient.batches && ingredient.batches.length > 0 && (
                      <Box ml={2}>
                        <Typography variant="body2" color="textSecondary">
                          Partie:
                        </Typography>
                        {ingredient.batches.map((batch, batchIndex) => (
                          <Typography key={batchIndex} variant="body2" color="textSecondary" ml={2}>
                            • {batch.batchNumber || 'Bez numeru'}: {batch.selectedQuantity.toFixed(2)} {ingredient.unit}
                            {batch.expiryDate && ` (Ważne do: ${new Date(batch.expiryDate.seconds * 1000).toLocaleDateString()})`}
                          </Typography>
                        ))}
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
            )}

            <Box sx={{ mt: 4, mb: 2 }}>
              <Divider>
                <Typography variant="h6">Dodatkowe informacje</Typography>
              </Divider>
            </Box>

            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Notatki</Typography>
              <TextField
                name="notes"
                value={taskData.notes || ''}
                onChange={handleChange}
                fullWidth
                multiline
                rows={4}
                placeholder="Dodatkowe uwagi, instrukcje dla operatorów, informacje o materiałach..."
              />
            </Paper>

            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Button 
                startIcon={<ArrowBackIcon />} 
                onClick={() => navigate('/production')}
              >
                Powrót
              </Button>
              <Button 
                type="submit" 
                variant="contained" 
                color="primary"
                disabled={saving}
                startIcon={<SaveIcon />}
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