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
  Divider
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
import { createTask, updateTask, getTaskById } from '../../services/productionService';
import { getAllRecipes, getRecipeById } from '../../services/recipeService';
import { getIngredientPrices } from '../../services/inventoryService';
import { calculateProductionTaskCost } from '../../utils/costCalculator';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';

const TaskForm = ({ taskId }) => {
  const [loading, setLoading] = useState(!!taskId);
  const [saving, setSaving] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
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

  useEffect(() => {
    const fetchRecipes = async () => {
      try {
        const recipesData = await getAllRecipes();
        setRecipes(recipesData);
      } catch (error) {
        showError('Błąd podczas pobierania receptur: ' + error.message);
        console.error('Error fetching recipes:', error);
      }
    };

    fetchRecipes();

    if (taskId) {
      const fetchTask = async () => {
        try {
          setLoading(true);
          const task = await getTaskById(taskId);
          setTaskData(task);
          
          // Jeśli zadanie ma przypisaną recepturę, pobierz jej szczegóły
          if (task.recipeId) {
            const recipe = await getRecipeById(task.recipeId);
            setTaskData(prev => ({
              ...prev,
              recipeId: recipe.id,
              productName: recipe.name,
              unit: recipe.yield?.unit || 'szt.'
            }));
          }
        } catch (error) {
          showError('Błąd podczas pobierania zadania: ' + error.message);
          console.error('Error fetching task:', error);
        } finally {
          setLoading(false);
        }
      };
      
      fetchTask();
    }
  }, [taskId, showError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      if (taskId) {
        await updateTask(taskId, taskData, currentUser.uid);
        showSuccess('Zadanie zostało zaktualizowane');
      } else {
        await createTask(taskData, currentUser.uid);
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

  const handleRecipeChange = (event, newValue) => {
    if (newValue) {
      setTaskData(prev => ({
        ...prev,
        recipeId: newValue.id,
        productName: newValue.name,
        unit: newValue.yield?.unit || 'szt.'
      }));
    } else {
      setTaskData(prev => ({
        ...prev,
        recipeId: '',
        productName: ''
      }));
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
      
      // Pobierz ID składników
      const ingredientIds = taskData.recipeId ? taskData.recipeId.split(',').map(id => id.trim()).filter(Boolean) : [];
      
      if (ingredientIds.length === 0) {
        showError('Brak prawidłowych identyfikatorów składników');
        setCalculatingCosts(false);
        return;
      }
      
      // Pobierz ceny składników
      const pricesMap = await getIngredientPrices(ingredientIds);
      
      // Oblicz koszty
      const costData = calculateProductionTaskCost(taskData, recipes.find(recipe => recipe.id === taskData.recipeId), pricesMap);
      setCostCalculation(costData);
      
    } catch (error) {
      console.error('Błąd podczas kalkulacji kosztów:', error);
      showError('Nie udało się obliczyć kosztów: ' + error.message);
    } finally {
      setCalculatingCosts(false);
    }
  };

  if (loading) {
    return <div>Ładowanie zadania...</div>;
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => navigate('/production')}
          >
            Powrót
          </Button>
          <Typography variant="h5">
            {taskId ? 'Edytuj zadanie produkcyjne' : 'Nowe zadanie produkcyjne'}
          </Typography>
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

        {taskData.moNumber && (
          <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
            <Typography variant="subtitle1" color="primary" fontWeight="bold">
              Numer zlecenia produkcyjnego: {taskData.moNumber}
            </Typography>
          </Box>
        )}
        
        <Paper sx={{ p: 3, mb: 3 }}>
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
              <Autocomplete
                value={recipes.find(recipe => recipe.id === taskData.recipeId) || null}
                onChange={handleRecipeChange}
                options={recipes}
                getOptionLabel={(option) => option.name}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Receptura"
                    required
                  />
                )}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                required
                label="Nazwa produktu"
                name="productName"
                value={taskData.productName}
                onChange={handleChange}
                fullWidth
                helperText="Domyślnie wypełniane nazwą wybranej receptury"
              />
            </Grid>
            <Grid item xs={8}>
              <TextField
                required
                label="Ilość"
                name="quantity"
                type="number"
                value={taskData.quantity}
                onChange={handleChange}
                fullWidth
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
                  <MenuItem value="g">g</MenuItem>
                  <MenuItem value="kg">kg</MenuItem>
                  <MenuItem value="ml">ml</MenuItem>
                  <MenuItem value="l">l</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={6}>
              <DateTimePicker
                label="Data rozpoczęcia"
                value={taskData.scheduledDate}
                onChange={handleDateChange}
                renderInput={(params) => <TextField {...params} fullWidth required />}
              />
            </Grid>
            <Grid item xs={6}>
              <DateTimePicker
                label="Data zakończenia"
                value={taskData.endDate}
                onChange={handleEndDateChange}
                minDate={taskData.scheduledDate}
                renderInput={(params) => <TextField {...params} fullWidth required />}
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
        </Paper>

        {/* Sekcja kalkulacji kosztów */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Kalkulacja kosztów produkcji</Typography>
            <Button
              variant="outlined"
              startIcon={<CalculateIcon />}
              onClick={handleCalculateCosts}
              disabled={calculatingCosts || !taskData.recipeId}
            >
              {calculatingCosts ? 'Obliczanie...' : 'Oblicz koszty'}
            </Button>
          </Box>
          
          {costCalculation && (
            <Box>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography variant="subtitle2">Koszt jednostkowy produktu:</Typography>
                  <Typography variant="body1" fontWeight="bold">
                    {costCalculation.unitCost.toFixed(2)} zł / {costCalculation.yieldUnit}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography variant="subtitle2">Ilość do wyprodukowania:</Typography>
                  <Typography variant="body1">
                    {costCalculation.taskQuantity} {costCalculation.taskUnit}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={4}>
                  <Typography variant="subtitle2">Całkowity koszt zadania:</Typography>
                  <Typography variant="body1" fontWeight="bold" color="primary">
                    {costCalculation.taskTotalCost.toFixed(2)} zł
                  </Typography>
                </Grid>
              </Grid>
              
              <Divider sx={{ my: 2 }} />
              
              <Typography variant="subtitle1" gutterBottom>Szczegóły kosztów:</Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="subtitle2">Koszt składników:</Typography>
                  <Typography variant="body1">{costCalculation.ingredientsCost.toFixed(2)} zł</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="subtitle2">Koszt robocizny:</Typography>
                  <Typography variant="body1">{costCalculation.laborCost.toFixed(2)} zł</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="subtitle2">Koszt energii:</Typography>
                  <Typography variant="body1">{costCalculation.energyCost.toFixed(2)} zł</Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="subtitle2">Koszty pośrednie:</Typography>
                  <Typography variant="body1">{costCalculation.overheadCost.toFixed(2)} zł</Typography>
                </Grid>
              </Grid>
            </Box>
          )}
          
          {!costCalculation && (
            <Typography variant="body2" color="text.secondary">
              Kliknij "Oblicz koszty", aby zobaczyć kalkulację kosztów dla tego zadania produkcyjnego.
              Upewnij się, że zadanie ma przypisaną recepturę z odpowiednimi składnikami.
            </Typography>
          )}
        </Paper>

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
      </Box>
    </LocalizationProvider>
  );
};

export default TaskForm;