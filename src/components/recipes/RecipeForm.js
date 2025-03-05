// src/components/recipes/RecipeForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  CardActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Autocomplete,
  CircularProgress,
  Chip
} from '@mui/material';
import {
  Save as SaveIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Calculate as CalculateIcon,
  Inventory as InventoryIcon,
  Edit as EditIcon,
  Build as BuildIcon
} from '@mui/icons-material';
import { createRecipe, updateRecipe, getRecipeById, fixRecipeYield } from '../../services/recipeService';
import { getAllInventoryItems, getIngredientPrices } from '../../services/inventoryService';
import { calculateRecipeTotalCost } from '../../utils/costCalculator';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';

const DEFAULT_INGREDIENT = { name: '', quantity: '', unit: 'g', allergens: [] };

const RecipeForm = ({ recipeId }) => {
  const { currentUser } = useAuth();
  const { showSuccess, showError, showWarning } = useNotification();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!!recipeId);
  const [saving, setSaving] = useState(false);
  
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

  // Dodajemy stan dla kalkulacji kosztów
  const [costCalculation, setCostCalculation] = useState(null);
  const [showCostDetails, setShowCostDetails] = useState(false);
  const [calculatingCosts, setCalculatingCosts] = useState(false);

  // Dodajemy stan dla składników z magazynu
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(false);

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

    // Pobierz składniki z magazynu
    const fetchInventoryItems = async () => {
      try {
        setLoadingInventory(true);
        const items = await getAllInventoryItems();
        setInventoryItems(items);
      } catch (error) {
        console.error('Błąd podczas pobierania składników z magazynu:', error);
        showError('Nie udało się pobrać składników z magazynu');
      } finally {
        setLoadingInventory(false);
      }
    };
    
    fetchInventoryItems();
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
        [name]: name === 'quantity' ? parseFloat(value) || '' : value
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

  // Funkcja do kalkulacji kosztów receptury
  const handleCalculateCosts = async () => {
    try {
      setCalculatingCosts(true);
      
      // Sprawdź, czy receptura ma składniki
      if (!recipeData.ingredients || recipeData.ingredients.length === 0) {
        showError('Receptura musi zawierać składniki, aby obliczyć koszty');
        setCalculatingCosts(false);
        return;
      }
      
      // Pobierz ID składników z magazynu
      const ingredientIds = recipeData.ingredients
        .filter(ing => ing.id) // Tylko składniki z ID (z magazynu)
        .map(ing => ing.id);
      
      // Logowanie dla celów diagnostycznych
      console.log('Składniki w recepturze:', recipeData.ingredients);
      console.log('Składniki z ID (z magazynu):', ingredientIds);
      
      // Sprawdź, czy mamy jakiekolwiek składniki z magazynu
      if (ingredientIds.length === 0) {
        showError('Brak składników z magazynu. Tylko składniki wybrane z magazynu mają przypisane ceny. Dodaj składniki z magazynu, aby obliczyć koszty.');
        setCalculatingCosts(false);
        return;
      }
      
      // Informuj użytkownika, jeśli nie wszystkie składniki mają ceny
      if (ingredientIds.length < recipeData.ingredients.length) {
        showWarning('Uwaga: Tylko składniki wybrane z magazynu mają przypisane ceny. Składniki dodane ręcznie nie będą uwzględnione w kalkulacji kosztów.');
      }
      
      console.log('Pobieranie cen dla składników:', ingredientIds);
      
      // Pobierz ceny składników
      const pricesMap = await getIngredientPrices(ingredientIds);
      
      console.log('Otrzymana mapa cen:', pricesMap);
      
      // Sprawdź, czy wszystkie składniki mają ceny
      const missingPrices = ingredientIds.filter(id => {
        if (!pricesMap[id]) return true;
        
        const hasBatchPrice = pricesMap[id].batchPrice !== undefined && pricesMap[id].batchPrice > 0;
        const hasItemPrice = pricesMap[id].itemPrice !== undefined && pricesMap[id].itemPrice > 0;
        
        return !hasBatchPrice && !hasItemPrice;
      });
      
      if (missingPrices.length > 0) {
        const missingNames = missingPrices.map(id => {
          const ing = recipeData.ingredients.find(i => i.id === id);
          return ing ? ing.name : id;
        });
        
        showWarning(`Uwaga: Następujące składniki nie mają przypisanych cen: ${missingNames.join(', ')}. Edytuj partie tych składników w magazynie, aby dodać ceny.`);
      }
      
      // Sprawdź, czy mamy jakiekolwiek ceny
      const hasAnyPrices = Object.values(pricesMap).some(price => 
        (price.batchPrice !== undefined && price.batchPrice > 0) || 
        (price.itemPrice !== undefined && price.itemPrice > 0)
      );
      
      if (!hasAnyPrices) {
        showError('Żaden ze składników nie ma przypisanej ceny. Edytuj składniki w magazynie, aby dodać ceny.');
        setCalculatingCosts(false);
        return;
      }
      
      // Oblicz koszty
      const costData = calculateRecipeTotalCost(recipeData, pricesMap);
      console.log('Wynik kalkulacji kosztów:', costData);
      
      setCostCalculation(costData);
      setShowCostDetails(true);
      
    } catch (error) {
      console.error('Błąd podczas kalkulacji kosztów:', error);
      showError('Nie udało się obliczyć kosztów: ' + error.message);
    } finally {
      setCalculatingCosts(false);
    }
  };

  // Funkcja do dodawania składnika z magazynu
  const handleAddInventoryItem = (item) => {
    if (!item) return;
    
    // Sprawdź, czy składnik już istnieje w recepturze
    const existingIndex = recipeData.ingredients.findIndex(
      ing => ing.id === item.id
    );
    
    if (existingIndex >= 0) {
      showError('Ten składnik już istnieje w recepturze');
      return;
    }
    
    // Dodaj nowy składnik z danymi z magazynu
    const newIngredient = {
      id: item.id,
      name: item.name,
      quantity: '',
      unit: item.unit || 'szt.',
      notes: ''
    };
    
    setRecipeData({
      ...recipeData,
      ingredients: [...recipeData.ingredients, newIngredient]
    });
  };

  // Funkcja naprawiająca wydajność receptury
  const handleFixYield = async () => {
    if (!recipeId) return;
    
    try {
      setSaving(true);
      const result = await fixRecipeYield(recipeId, currentUser.uid);
      showSuccess(result.message);
      
      // Odśwież dane receptury
      const updatedRecipe = await getRecipeById(recipeId);
      setRecipeData(updatedRecipe);
    } catch (error) {
      console.error('Błąd podczas naprawiania wydajności:', error);
      showError('Nie udało się naprawić wydajności receptury');
    } finally {
      setSaving(false);
    }
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
          {recipeId && (
            <Grid item xs={6}>
              <Button 
                variant="outlined" 
                color="secondary" 
                onClick={handleFixYield}
                disabled={saving}
                startIcon={<BuildIcon />}
              >
                Napraw wydajność
              </Button>
            </Grid>
          )}
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
        <Typography variant="h6" gutterBottom>
          Składniki
        </Typography>
        
        {/* Dodajemy wybór składników z magazynu */}
        <Box sx={{ mb: 2 }}>
          <Autocomplete
            options={inventoryItems}
            getOptionLabel={(option) => option.name || ''}
            loading={loadingInventory}
            onChange={(event, newValue) => handleAddInventoryItem(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Dodaj składnik z magazynu"
                variant="outlined"
                fullWidth
                helperText="Tylko składniki z magazynu mają przypisane ceny do kalkulacji kosztów. Składniki dodane ręcznie nie będą uwzględnione w kalkulacji."
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {loadingInventory ? <CircularProgress color="inherit" size={20} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                  startAdornment: <InventoryIcon color="action" sx={{ mr: 1 }} />
                }}
              />
            )}
            renderOption={(props, option) => {
              const { key, ...otherProps } = props;
              return (
                <li key={key} {...otherProps}>
                  <Box>
                    <Typography variant="body1">{option.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.unitPrice ? `Cena: ${option.unitPrice.toFixed(2)} zł/${option.unit}` : 'Brak ceny jednostkowej'}
                    </Typography>
                  </Box>
                </li>
              );
            }}
          />
        </Box>
        
        <Divider sx={{ my: 2 }} />
        
        {recipeData.ingredients.length > 0 ? (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nazwa składnika</TableCell>
                  <TableCell>Ilość</TableCell>
                  <TableCell>Jednostka</TableCell>
                  <TableCell>Uwagi</TableCell>
                  <TableCell>Źródło</TableCell>
                  <TableCell>Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {recipeData.ingredients.map((ingredient, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <TextField
                        fullWidth
                        variant="standard"
                        value={ingredient.name}
                        onChange={(e) => handleIngredientChange(index, 'name', e.target.value)}
                        disabled={!!ingredient.id} // Blokujemy edycję nazwy dla składników z magazynu
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        fullWidth
                        variant="standard"
                        type="number"
                        value={ingredient.quantity}
                        onChange={(e) => handleIngredientChange(index, 'quantity', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        fullWidth
                        variant="standard"
                        value={ingredient.unit}
                        onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
                        disabled={!!ingredient.id} // Blokujemy edycję jednostki dla składników z magazynu
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        fullWidth
                        variant="standard"
                        value={ingredient.notes || ''}
                        onChange={(e) => handleIngredientChange(index, 'notes', e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      {ingredient.id ? (
                        <Chip 
                          size="small" 
                          color="primary" 
                          label="Magazyn" 
                          icon={<InventoryIcon />} 
                          title="Składnik z magazynu - ma przypisaną cenę do kalkulacji kosztów" 
                        />
                      ) : (
                        <Chip 
                          size="small" 
                          color="default" 
                          label="Ręczny" 
                          icon={<EditIcon />} 
                          title="Składnik dodany ręcznie - brak ceny do kalkulacji kosztów" 
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <IconButton 
                        color="error" 
                        onClick={() => removeIngredient(index)}
                        size="small"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>
            Brak składników. Dodaj składniki z magazynu lub ręcznie.
          </Typography>
        )}
        
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={addIngredient}
          sx={{ mt: 2 }}
        >
          Dodaj składnik ręcznie
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

      {/* Sekcja kalkulacji kosztów */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Kalkulacja kosztów</Typography>
          <Button
            variant="outlined"
            startIcon={<CalculateIcon />}
            onClick={handleCalculateCosts}
            disabled={calculatingCosts || !recipeData.ingredients.length}
          >
            {calculatingCosts ? 'Obliczanie...' : 'Oblicz koszty'}
          </Button>
        </Box>
        
        {costCalculation && (
          <Box>
            <Grid container spacing={2} sx={{ mb: 2 }}>
              <Grid item xs={12} sm={4}>
                <Typography variant="subtitle2">Koszt składników:</Typography>
                <Typography variant="body1">{costCalculation.ingredientsCost.toFixed(2)} zł</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="subtitle2">Koszt robocizny:</Typography>
                <Typography variant="body1">{costCalculation.laborCost.toFixed(2)} zł</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="subtitle2">Koszt energii:</Typography>
                <Typography variant="body1">{costCalculation.energyCost.toFixed(2)} zł</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="subtitle2">Koszty pośrednie:</Typography>
                <Typography variant="body1">{costCalculation.overheadCost.toFixed(2)} zł</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="subtitle2">Koszt całkowity:</Typography>
                <Typography variant="body1" fontWeight="bold">{costCalculation.totalCost.toFixed(2)} zł</Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="subtitle2">Koszt jednostkowy:</Typography>
                <Typography variant="body1" fontWeight="bold">
                  {costCalculation.unitCost.toFixed(2)} zł / {costCalculation.yieldUnit}
                </Typography>
              </Grid>
            </Grid>
            
            <Button 
              variant="text" 
              onClick={() => setShowCostDetails(!showCostDetails)}
              sx={{ mb: 2 }}
            >
              {showCostDetails ? 'Ukryj szczegóły' : 'Pokaż szczegóły'}
            </Button>
            
            {showCostDetails && (
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Składnik</TableCell>
                      <TableCell align="right">Ilość</TableCell>
                      <TableCell align="right">Cena jedn.</TableCell>
                      <TableCell align="right">Koszt</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {costCalculation.ingredientsDetails.map((detail, index) => (
                      <TableRow key={index}>
                        <TableCell>{detail.name}</TableCell>
                        <TableCell align="right">{detail.quantity} {detail.unit}</TableCell>
                        <TableCell align="right">{detail.unitPrice.toFixed(2)} zł</TableCell>
                        <TableCell align="right">{detail.cost.toFixed(2)} zł</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Box>
        )}
        
        {!costCalculation && (
          <Typography variant="body2" color="text.secondary">
            Kliknij "Oblicz koszty", aby zobaczyć kalkulację kosztów dla tej receptury.
            Upewnij się, że dodałeś składniki i czas przygotowania.
          </Typography>
        )}
      </Paper>
    </Box>
  );
};

export default RecipeForm;