// src/components/recipes/RecipeForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
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
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material';
import {
  Save as SaveIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Calculate as CalculateIcon,
  Inventory as InventoryIcon,
  Edit as EditIcon,
  Build as BuildIcon,
  ProductionQuantityLimits as ProductIcon
} from '@mui/icons-material';
import { createRecipe, updateRecipe, getRecipeById, fixRecipeYield } from '../../services/recipeService';
import { getAllInventoryItems, getIngredientPrices, createInventoryItem, getAllWarehouses } from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { getAllCustomers } from '../../services/customerService';

const RecipeForm = ({ recipeId }) => {
  const { currentUser } = useAuth();
  const { showSuccess, showError, showWarning, showInfo } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(!!recipeId);
  const [saving, setSaving] = useState(false);
  
  const [recipeData, setRecipeData] = useState({
    name: '',
    description: '',
    yield: { quantity: 1, unit: 'szt.' },
    prepTime: '',
    ingredients: [],
    allergens: [],
    notes: '',
    status: 'Robocza',
    customerId: '',
    processingCostPerUnit: 0,
    productionTimePerUnit: 0
  });

  // Dodajemy stan dla składników z magazynu
  const [inventoryItems, setInventoryItems] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  
  // Dodajemy stan dla tworzenia produktu w magazynie
  const [createProductDialogOpen, setCreateProductDialogOpen] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [productData, setProductData] = useState({
    name: '',
    description: '',
    category: '',
    unit: 'szt.',
    minStockLevel: 0,
    maxStockLevel: 0,
    warehouseId: '',
    quantity: 0,
    recipeId: ''
  });

  // Dodajemy stan dla listy klientów
  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);

  useEffect(() => {
    if (recipeId) {
      const fetchRecipe = async () => {
        try {
          const recipe = await getRecipeById(recipeId);
          setRecipeData(recipe);
          
          // Ustawiamy domyślne dane produktu na podstawie receptury
          setProductData(prev => ({
            ...prev,
            name: recipe.name,
            description: recipe.description || '',
            unit: recipe.yield?.unit || 'szt.',
            recipeId: recipeId
          }));
          
          // Sprawdź czy mamy otworzyć okno dodawania produktu
          if (location.state?.openProductDialog) {
            setCreateProductDialogOpen(true);
          }
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
    
    // Pobierz magazyny
    const fetchWarehouses = async () => {
      try {
        const warehousesData = await getAllWarehouses();
        setWarehouses(warehousesData);
        
        // Ustaw domyślny magazyn, jeśli istnieje
        if (warehousesData.length > 0) {
          setProductData(prev => ({
            ...prev,
            warehouseId: warehousesData[0].id
          }));
        }
      } catch (error) {
        console.error('Błąd podczas pobierania magazynów:', error);
      }
    };

    // Pobierz listę klientów
    const fetchCustomers = async () => {
      try {
        setLoadingCustomers(true);
        const customersData = await getAllCustomers();
        setCustomers(customersData);
      } catch (error) {
        console.error('Błąd podczas pobierania klientów:', error);
        showError('Nie udało się pobrać listy klientów');
      } finally {
        setLoadingCustomers(false);
      }
    };
    
    fetchInventoryItems();
    fetchWarehouses();
    fetchCustomers();
  }, [recipeId, showError, location.state]);

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
    
    // Zawsze ustawiamy quantity na 1, niezależnie od wprowadzonej wartości
    if (name === 'quantity') {
      setRecipeData(prev => ({
        ...prev,
        yield: {
          ...prev.yield,
          quantity: 1
        }
      }));
    } else {
      setRecipeData(prev => ({
        ...prev,
        yield: {
          ...prev.yield,
          [name]: value
        }
      }));
    }
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
      ingredients: [...prev.ingredients, { name: '', quantity: '', unit: 'g', allergens: [] }]
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

  // Funkcja do obsługi zmiany danych produktu
  const handleProductDataChange = (e) => {
    const { name, value } = e.target;
    setProductData(prev => ({
      ...prev,
      [name]: name === 'quantity' || name === 'minStockLevel' || name === 'maxStockLevel' 
        ? parseFloat(value) || 0 
        : value
    }));
  };
  
  // Funkcja do tworzenia produktu w magazynie
  const handleCreateProduct = async () => {
    if (!productData.name || !productData.warehouseId) {
      showError('Nazwa produktu i magazyn są wymagane');
      return;
    }
    
    try {
      setCreatingProduct(true);
      
      // Obliczymy koszt produktu bez odwoływania się do costCalculation
      let unitCost = 0;
      // Wartość kosztów jednostkowych będzie zerowa
      
      // Znajdź wybrany magazyn dla lepszego komunikatu
      const selectedWarehouse = warehouses.find(w => w.id === productData.warehouseId);
      
      // Dane produktu do utworzenia
      const newProductData = {
        ...productData,
        type: 'Produkt gotowy',
        isRawMaterial: false,
        isFinishedProduct: true,
        unitPrice: unitCost > 0 ? unitCost : null,
        batchPrice: null,
        recipeId: recipeId, // Przypisujemy ID receptury
        productionCost: unitCost > 0 ? unitCost : null,
        // Dodajemy informacje o recepturze
        recipeInfo: {
          name: recipeData.name,
          yield: recipeData.yield,
          version: recipeData.version || 1
        }
      };
      
      // Utwórz produkt w magazynie
      const createdProduct = await createInventoryItem(newProductData, currentUser.uid);
      
      showSuccess(`Produkt "${createdProduct.name}" został pomyślnie dodany do magazynu "${selectedWarehouse?.name || 'wybranym'}"`);
      setCreateProductDialogOpen(false);
      
      // Odśwież listę składników, aby nowo utworzony produkt był widoczny
      const updatedItems = await getAllInventoryItems();
      setInventoryItems(updatedItems);
      
    } catch (error) {
      showError('Błąd podczas tworzenia produktu: ' + error.message);
      console.error('Error creating product:', error);
    } finally {
      setCreatingProduct(false);
    }
  };

  // Dodajemy przycisk do tworzenia produktu w magazynie
  const renderCreateProductButton = () => {
    // Przycisk dostępny tylko przy edycji istniejącej receptury
    if (!recipeId) return null;
    
    return (
      <Button
        variant="outlined"
        color="primary"
        startIcon={<ProductIcon />}
        onClick={() => setCreateProductDialogOpen(true)}
        sx={{ ml: 2 }}
      >
        Dodaj produkt do magazynu
      </Button>
    );
  };

  // Funkcja do aktualizacji ID składnika w recepturze po dodaniu go do magazynu
  const updateIngredientId = (ingredientName, newId) => {
    // Znajdź wszystkie składniki o podanej nazwie, które nie mają jeszcze ID
    const updatedIngredients = recipeData.ingredients.map(ingredient => {
      if (ingredient.name === ingredientName && !ingredient.id) {
        return {
          ...ingredient,
          id: newId
        };
      }
      return ingredient;
    });
    
    // Zaktualizuj recepturę
    setRecipeData(prev => ({
      ...prev,
      ingredients: updatedIngredients
    }));
    
    showSuccess(`Powiązano składnik "${ingredientName}" z pozycją magazynową`);
  };
  
  // Funkcja do wyszukiwania i linkowania składników z magazynem
  const linkIngredientWithInventory = async (ingredient) => {
    if (!ingredient || !ingredient.name || ingredient.id) return;
    
    try {
      // Wyszukaj składnik w magazynie po nazwie
      const inventoryRef = collection(db, 'inventory');
      const q = query(
        inventoryRef,
        where('name', '==', ingredient.name),
        limit(1)
      );
      
      const querySnapshot = await getDocs(q);
      
      if (!querySnapshot.empty) {
        const item = { 
          id: querySnapshot.docs[0].id, 
          ...querySnapshot.docs[0].data() 
        };
        updateIngredientId(ingredient.name, item.id);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Błąd podczas wyszukiwania składnika:', error);
      return false;
    }
  };
  
  // Funkcja do linkowania wszystkich składników z magazynem
  const linkAllIngredientsWithInventory = async (resetLinks = false) => {
    if (!recipeData.ingredients || recipeData.ingredients.length === 0) {
      showWarning('Receptura nie zawiera składników');
      return;
    }
    
    try {
      setLoading(true);
      let linkedCount = 0;
      let notFoundCount = 0;
      let resetCount = 0;
      
      // Przygotuj kopię składników do modyfikacji
      const updatedIngredients = [...recipeData.ingredients];
      
      // Jeśli resetujemy powiązania, usuń wszystkie ID składników
      if (resetLinks) {
        updatedIngredients.forEach((ingredient, index) => {
          if (ingredient.id) {
            updatedIngredients[index] = {
              ...ingredient,
              id: null // Usuwamy ID
            };
            resetCount++;
          }
        });
        
        // Aktualizuj stan receptury z usuniętymi powiązaniami
        setRecipeData(prev => ({
          ...prev,
          ingredients: updatedIngredients
        }));
        
        if (resetCount > 0) {
          showInfo(`Usunięto powiązania dla ${resetCount} składników`);
        }
      }
      
      // Przeszukaj wszystkie niezlinkowane składniki
      for (const [index, ingredient] of updatedIngredients.entries()) {
        if (!ingredient.id && ingredient.name) {
          const linked = await linkIngredientWithInventory(ingredient);
          if (linked) {
            linkedCount++;
          } else {
            notFoundCount++;
          }
        }
      }
      
      if (linkedCount > 0) {
        showSuccess(`Powiązano ${linkedCount} składników z magazynem`);
      }
      
      if (notFoundCount > 0) {
        showWarning(`Dla ${notFoundCount} składników nie znaleziono odpowiedników w magazynie`);
      }
      
      if (linkedCount === 0 && notFoundCount === 0 && !resetLinks) {
        showInfo('Wszystkie składniki są już powiązane z magazynem lub nie można znaleźć dopasowań');
      }
    } catch (error) {
      showError('Błąd podczas linkowania składników: ' + error.message);
      console.error('Error linking ingredients:', error);
    } finally {
      setLoading(false);
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
          {recipeId ? 'Edytuj recepturę' : 'Dodaj nową recepturę'}
        </Typography>
        <Box>
          <Button 
            variant="contained" 
            color="primary" 
            type="submit"
            startIcon={<SaveIcon />}
            disabled={saving}
          >
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </Button>
          {recipeId && renderCreateProductButton()}
        </Box>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Dane podstawowe</Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              required
              name="name"
              label="Nazwa receptury"
              value={recipeData.name}
              onChange={handleChange}
              error={!recipeData.name}
              helperText={!recipeData.name ? 'Nazwa jest wymagana' : ''}
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel id="customer-select-label">Klient (opcjonalnie)</InputLabel>
              <Select
                labelId="customer-select-label"
                name="customerId"
                value={recipeData.customerId}
                onChange={handleChange}
                label="Klient (opcjonalnie)"
                displayEmpty
              >
                <MenuItem value="">
                  <em>Brak - receptura ogólna</em>
                </MenuItem>
                {customers.map((customer) => (
                  <MenuItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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
          <Grid item xs={12}>
            <TextField
              label="Czas przygotowania (min)"
              name="prepTime"
              type="number"
              value={recipeData.prepTime || ''}
              onChange={handleChange}
              fullWidth
            />
          </Grid>
          
          <Grid item xs={12} sm={6}>
            <TextField
              label="Koszt procesowy na sztukę (EUR)"
              name="processingCostPerUnit"
              type="number"
              InputProps={{ inputProps: { min: 0, step: 0.01 } }}
              value={recipeData.processingCostPerUnit || 0}
              onChange={handleChange}
              fullWidth
              helperText="Koszt procesowy lub robocizny na jedną sztukę produktu"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Czas produkcji na sztukę (min)"
              name="productionTimePerUnit"
              type="number"
              InputProps={{ inputProps: { min: 0, step: 0.1 } }}
              value={recipeData.productionTimePerUnit || 0}
              onChange={handleChange}
              fullWidth
              helperText="Czas potrzebny na wyprodukowanie jednej sztuki produktu"
            />
          </Grid>
          
          {/* Ukrywamy pola wydajności, dodajemy ukryte pole input */}
          <input 
            type="hidden" 
            name="yield.quantity" 
            value="1" 
          />
          <input 
            type="hidden" 
            name="yield.unit" 
            value="szt." 
          />
          
          {recipeId && (
            <Grid item xs={12}>
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
        <Typography variant="subtitle1" gutterBottom>
          Składniki
          <Button 
            size="small"
            onClick={addIngredient}
            sx={{ ml: 2 }}
          >
            Dodaj składnik
          </Button>
          <Button 
            size="small"
            color="secondary"
            onClick={handleAddInventoryItem}
            sx={{ ml: 1 }}
          >
            Z magazynu
          </Button>
          <Button 
            size="small"
            color="primary"
            onClick={() => linkAllIngredientsWithInventory(false)}
            sx={{ ml: 1 }}
          >
            Powiąż z magazynem
          </Button>
          <Button 
            size="small"
            color="warning"
            onClick={() => linkAllIngredientsWithInventory(true)}
            sx={{ ml: 1 }}
          >
            Resetuj powiązania
          </Button>
        </Typography>
        
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
                      {option.unitPrice ? `Cena: ${option.unitPrice.toFixed(2)} EUR/${option.unit}` : 'Brak ceny jednostkowej'}
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
                        disabled={!!ingredient.id}
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
                        disabled={!!ingredient.id}
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

      <Dialog 
        open={createProductDialogOpen} 
        onClose={() => setCreateProductDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Dodaj produkt do magazynu</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Uzupełnij poniższe dane, aby dodać produkt z receptury do magazynu. 
            Koszt produkcji zostanie obliczony na podstawie kosztów składników.
          </DialogContentText>
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                name="name"
                label="Nazwa produktu"
                value={productData.name}
                onChange={handleProductDataChange}
                fullWidth
                required
                error={!productData.name}
                helperText={!productData.name ? 'Nazwa jest wymagana' : ''}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth required>
                <InputLabel id="warehouse-select-label">Magazyn</InputLabel>
                <Select
                  labelId="warehouse-select-label"
                  id="warehouse-select"
                  name="warehouseId"
                  value={productData.warehouseId}
                  onChange={handleProductDataChange}
                  label="Magazyn"
                  error={!productData.warehouseId}
                >
                  {warehouses.map((warehouse) => (
                    <MenuItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                name="description"
                label="Opis produktu"
                value={productData.description}
                onChange={handleProductDataChange}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                name="category"
                label="Kategoria"
                value={productData.category}
                onChange={handleProductDataChange}
                fullWidth
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel id="unit-select-label">Jednostka</InputLabel>
                <Select
                  labelId="unit-select-label"
                  id="unit-select"
                  name="unit"
                  value={productData.unit}
                  onChange={handleProductDataChange}
                  label="Jednostka"
                >
                  <MenuItem value="szt.">sztuka</MenuItem>
                  <MenuItem value="kg">kilogram</MenuItem>
                  <MenuItem value="caps">caps</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                name="quantity"
                label="Ilość początkowa"
                type="number"
                value={productData.quantity}
                onChange={handleProductDataChange}
                fullWidth
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                name="minStockLevel"
                label="Minimalny poziom"
                type="number"
                value={productData.minStockLevel}
                onChange={handleProductDataChange}
                fullWidth
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <TextField
                name="maxStockLevel"
                label="Optymalny poziom"
                type="number"
                value={productData.maxStockLevel}
                onChange={handleProductDataChange}
                fullWidth
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateProductDialogOpen(false)}>Anuluj</Button>
          <Button 
            onClick={handleCreateProduct} 
            variant="contained" 
            color="primary"
            disabled={creatingProduct || !productData.name || !productData.warehouseId}
            startIcon={creatingProduct ? <CircularProgress size={20} /> : <ProductIcon />}
          >
            {creatingProduct ? 'Zapisywanie...' : 'Dodaj do magazynu'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RecipeForm;