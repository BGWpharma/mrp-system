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
  FormHelperText
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material';
import { createTask, updateTask, getTaskById } from '../../services/productionService';
import { getAllRecipes } from '../../services/recipeService';
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
    notes: ''
  });

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
          const task = await getTaskById(taskId);
          
          // Konwertuj timestamp na Date lub ustaw bieżącą datę
          const scheduledDate = task.scheduledDate ? 
            (task.scheduledDate.toDate ? task.scheduledDate.toDate() : new Date(task.scheduledDate)) : 
            new Date();
          
          // Konwertuj timestamp endDate lub ustaw domyślną datę (1 godzina po scheduledDate)
          const endDate = task.endDate ? 
            (task.endDate.toDate ? task.endDate.toDate() : new Date(task.endDate)) : 
            new Date(scheduledDate.getTime() + 60 * 60 * 1000);
          
          setTaskData({
            ...task,
            scheduledDate,
            endDate
          });
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
            {taskId ? 'Edycja zadania produkcyjnego' : 'Nowe zadanie produkcyjne'}
          </Typography>
          <Button 
            variant="contained" 
            color="primary" 
            type="submit"
            startIcon={<SaveIcon />}
            disabled={saving}
          >
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </Button>
        </Box>

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