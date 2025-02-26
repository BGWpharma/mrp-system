// src/components/recipes/RecipeForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  Divider,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Card,
  CardContent,
  CardActions
} from '@mui/material';
import {
  Save as SaveIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material';
import { createRecipe, updateRecipe, getRecipeById } from '../../services/recipeService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';

const DEFAULT_INGREDIENT = { name: '', quantity: '', unit: 'g', allergens: [] };

const RecipeForm = ({ recipeId }) => {
  const [loading, setLoading] = useState(!!recipeId);
  const [saving, setSaving] = useState(false);
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  const [recipeData, setRecipeData] = useState({
    name: '',
    description: '',
    instructions: '',
    yield: { quantity: '', unit: 'szt.' },
    prepTime: '',
    ingredients: [{ ...DEFAULT_INGREDIENT }],
    allergens: [],
    notes: '',
    status: 'Robocza'
  });

  useEffect(() => {
    if (recipeId) {
      const fetchRecipe = async () => {
        try {
          const recipe = await getRecipeById(recipeId);
          setRecipeData(recipe);
        } catch (error) {
          showError('Błąd podczas pobierania receptury: ' + error.message);
          console.error('Error fetching recipe:', error);
        } finally {
          setLoading(false);
        }
      };
      
      fetchRecipe();
    }
  }, [recipeId, showError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      if (recipeId) {
        await updateRecipe(recipeId, recipeData, currentUser.uid);
        showSuccess('Receptura została zaktualizowana');
      } else {
        await createRecipe(recipeData, currentUser.uid);
        showSuccess('Receptura została utworzona');
      }
      navigate('/recipes');
    } catch (error) {
      showError('Błąd podczas zapisywania receptury: ' + error.message);
      console.error('Error saving recipe:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setRecipeData(prev => ({ ...prev, [name]: value }));
  };

  const handleYieldChange = (e) => {
    const { name, value } = e.target;
    setRecipeData(prev => ({
      ...prev,
      yield: {
        ...prev.yield,
        [name]: value
      }
    }));
  };

  const handleIngredientChange = (index, field, value) => {
    const updatedIngredients = [...recipeData.ingredients];
    updatedIngredients[index] = {
      ...updatedIngredients[index],
      [field]: value
    };
    
    setRecipeData(prev => ({
      ...prev,
      ingredients: updatedIngredients
    }));
  };

  const addIngredient = () => {
    setRecipeData(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { ...DEFAULT_INGREDIENT }]
    }));
  };

  const removeIngredient = (index) => {
    const updatedIngredients = [...recipeData.ingredients];
    updatedIngredients.splice(index, 1);
    
    setRecipeData(prev => ({
      ...prev,
      ingredients: updatedIngredients
    }));
  };

  if (loading) {
    return <div>Ładowanie receptury...</div>;
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/recipes')}
        >
          Powrót
        </Button>
        <Typography variant="h5">
          {recipeId ? 'Edycja receptury' : 'Nowa receptura'}
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
              label="Nazwa receptury"
              name="name"
              value={recipeData.name}
              onChange={handleChange}
              fullWidth
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Opis"
              name="description"
              value={recipeData.description || ''}
              onChange={handleChange}
              fullWidth
              multiline
              rows={2}
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              label="Czas przygotowania (min)"
              name="prepTime"
              type="number"
              value={recipeData.prepTime || ''}
              onChange={handleChange}
              fullWidth
            />
          </Grid>
          <Grid item xs={3}>
            <TextField
              required
              label="Wydajność"
              name="quantity"
              type="number"
              value={recipeData.yield.quantity}
              onChange={handleYieldChange}
              fullWidth
              inputProps={{ min: 0 }}
            />
          </Grid>
          <Grid item xs={3}>
            <FormControl fullWidth>
              <InputLabel>Jednostka</InputLabel>
              <Select
                name="unit"
                value={recipeData.yield.unit}
                onChange={handleYieldChange}
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
          <Grid item xs={12}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                name="status"
                value={recipeData.status || 'Robocza'}
                onChange={handleChange}
                label="Status"
              >
                <MenuItem value="Robocza">Robocza</MenuItem>
                <MenuItem value="W przeglądzie">W przeglądzie</MenuItem>
                <MenuItem value="Zatwierdzona">Zatwierdzona</MenuItem>
                <MenuItem value="Wycofana">Wycofana</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Składniki</Typography>
        <Divider sx={{ mb: 2 }} />
        
        {recipeData.ingredients.map((ingredient, index) => (
          <Box key={index} sx={{ mb: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={4}>
                <TextField
                  required
                  label="Nazwa składnika"
                  value={ingredient.name}
                  onChange={(e) => handleIngredientChange(index, 'name', e.target.value)}
                  fullWidth
                />
              </Grid>
              <Grid item xs={3}>
                <TextField
                  required
                  label="Ilość"
                  type="number"
                  value={ingredient.quantity}
                  onChange={(e) => handleIngredientChange(index, 'quantity', e.target.value)}
                  fullWidth
                  inputProps={{ min: 0, step: 0.01 }}
                />
              </Grid>
              <Grid item xs={3}>
                <FormControl fullWidth>
                  <InputLabel>Jednostka</InputLabel>
                  <Select
                    value={ingredient.unit}
                    onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
                    label="Jednostka"
                  >
                    <MenuItem value="g">g</MenuItem>
                    <MenuItem value="kg">kg</MenuItem>
                    <MenuItem value="ml">ml</MenuItem>
                    <MenuItem value="l">l</MenuItem>
                    <MenuItem value="szt.">szt.</MenuItem>
                    <MenuItem value="łyżka">łyżka</MenuItem>
                    <MenuItem value="łyżeczka">łyżeczka</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={2}>
                <IconButton 
                  color="error" 
                  onClick={() => removeIngredient(index)}
                  disabled={recipeData.ingredients.length === 1}
                >
                  <DeleteIcon />
                </IconButton>
              </Grid>
            </Grid>
          </Box>
        ))}
        
        <Button 
          variant="outlined" 
          startIcon={<AddIcon />} 
          onClick={addIngredient}
          sx={{ mt: 2 }}
        >
          Dodaj składnik
        </Button>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Instrukcja przygotowania</Typography>
        <Divider sx={{ mb: 2 }} />
        <TextField
          name="instructions"
          value={recipeData.instructions || ''}
          onChange={handleChange}
          fullWidth
          multiline
          rows={6}
          placeholder="Wpisz instrukcję przygotowania krok po kroku..."
        />
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Notatki dodatkowe</Typography>
        <Divider sx={{ mb: 2 }} />
        <TextField
          name="notes"
          value={recipeData.notes || ''}
          onChange={handleChange}
          fullWidth
          multiline
          rows={3}
          placeholder="Dodatkowe uwagi, alternatywne składniki, informacje o alergenach..."
        />
      </Paper>
    </Box>
  );
};

export default RecipeForm;