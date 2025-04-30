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
  DialogActions,
  FormHelperText
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
  ProductionQuantityLimits as ProductIcon,
  AccessTime as AccessTimeIcon
} from '@mui/icons-material';
import { createRecipe, updateRecipe, getRecipeById, fixRecipeYield } from '../../services/recipeService';
import { getAllInventoryItems, getIngredientPrices, createInventoryItem, getAllWarehouses } from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { getAllCustomers } from '../../services/customerService';
import { getAllWorkstations } from '../../services/workstationService';

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
    productionTimePerUnit: 0,
    defaultWorkstationId: ''
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
    category: 'Gotowe produkty',
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
  
  // Dodajemy stan dla listy stanowisk produkcyjnych
  const [workstations, setWorkstations] = useState([]);
  const [loadingWorkstations, setLoadingWorkstations] = useState(false);

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
            category: 'Gotowe produkty',
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
    
    // Pobierz lokalizacje
    const fetchWarehouses = async () => {
      try {
        const warehousesData = await getAllWarehouses();
        setWarehouses(warehousesData);
        
        // Ustaw domyślną lokalizację, jeśli istnieje
        if (warehousesData.length > 0) {
          setProductData(prev => ({
            ...prev,
            warehouseId: warehousesData[0].id
          }));
        }
      } catch (error) {
        console.error('Błąd podczas pobierania lokalizacji:', error);
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
    
    // Pobierz listę stanowisk produkcyjnych
    const fetchWorkstations = async () => {
      try {
        setLoadingWorkstations(true);
        const workstationsData = await getAllWorkstations();
        setWorkstations(workstationsData);
      } catch (error) {
        console.error('Błąd podczas pobierania stanowisk produkcyjnych:', error);
        showError('Nie udało się pobrać listy stanowisk produkcyjnych');
      } finally {
        setLoadingWorkstations(false);
      }
    };
    
    fetchInventoryItems();
    fetchWarehouses();
    fetchCustomers();
    fetchWorkstations();
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
      showError('SKU produktu i lokalizacja są wymagane');
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
      
      showSuccess(`SKU produktu "${createdProduct.name}" został pomyślnie dodany do stanów "${selectedWarehouse?.name || 'wybranym'}"`);
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
        Dodaj produkt do stanów
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
    
    showSuccess(`Powiązano składnik "${ingredientName}" z pozycją stanów`);
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
        showSuccess(`Powiązano ${linkedCount} składników ze stanami`);
      }
      
      if (notFoundCount > 0) {
        showWarning(`Dla ${notFoundCount} składników nie znaleziono odpowiedników w stanach`);
      }
      
      if (linkedCount === 0 && notFoundCount === 0 && !resetLinks) {
        showInfo('Wszystkie składniki są już powiązane ze stanami lub nie można znaleźć dopasowań');
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
      {/* Nagłówek z przyciskami */}
      <Paper 
        elevation={2} 
        sx={{ 
          p: 2, 
          mb: 3, 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          background: theme => theme.palette.mode === 'dark' 
            ? 'linear-gradient(to right, rgba(40,50,80,1), rgba(30,40,70,1))' 
            : 'linear-gradient(to right, #f5f7fa, #e4eaf0)'
        }}
      >
        <Button 
          variant="outlined"
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/recipes')}
          sx={{ 
            borderRadius: '8px', 
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          Powrót
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 'medium' }}>
          {recipeId ? 'Edytuj recepturę' : 'Dodaj nową recepturę'}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button 
            variant="contained" 
            color="primary" 
            type="submit"
            startIcon={<SaveIcon />}
            disabled={saving}
            sx={{ 
              borderRadius: '8px', 
              boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
              px: 3
            }}
          >
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </Button>
          {recipeId && renderCreateProductButton()}
        </Box>
      </Paper>

      {/* Sekcja danych podstawowych */}
      <Paper 
        elevation={3} 
        sx={{ 
          p: 0, 
          mb: 3, 
          borderRadius: '12px', 
          overflow: 'hidden',
          transition: 'all 0.3s ease'
        }}
      >
        <Box 
          sx={{ 
            p: 2, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: theme => theme.palette.mode === 'dark' 
              ? 'rgba(25, 35, 55, 0.5)' 
              : 'rgba(245, 247, 250, 0.8)'
          }}
        >
          <ProductIcon color="primary" />
          <Typography variant="h6" fontWeight="500">Dane podstawowe</Typography>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                name="name"
                label="SKU receptury"
                value={recipeData.name}
                onChange={handleChange}
                error={!recipeData.name}
                helperText={!recipeData.name ? 'SKU jest wymagany' : ''}
                sx={{ 
                  '& .MuiOutlinedInput-root': { 
                    borderRadius: '8px' 
                  } 
                }}
                InputProps={{
                  startAdornment: (
                    <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                      <ProductIcon fontSize="small" />
                    </Box>
                  ),
                }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
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
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                label="Koszt procesowy na sztukę (EUR)"
                name="processingCostPerUnit"
                type="number"
                InputProps={{ 
                  inputProps: { min: 0, step: 0.01 },
                  startAdornment: (
                    <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                      <CalculateIcon fontSize="small" />
                    </Box>
                  ),
                }}
                value={recipeData.processingCostPerUnit || 0}
                onChange={handleChange}
                fullWidth
                helperText="Koszt procesowy lub robocizny na jedną sztukę produktu"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                label="Czas produkcji na sztukę (min)"
                name="productionTimePerUnit"
                type="number"
                InputProps={{ 
                  inputProps: { min: 0, step: 0.01 },
                  startAdornment: (
                    <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                      <AccessTimeIcon fontSize="small" />
                    </Box>
                  ),
                }}
                value={recipeData.productionTimePerUnit || 0}
                onChange={handleChange}
                fullWidth
                helperText="Czas potrzebny na wyprodukowanie jednej sztuki produktu"
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            
            <Grid item xs={12} md={4}>
              <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
                <InputLabel>Status</InputLabel>
                <Select
                  name="status"
                  value={recipeData.status || 'Robocza'}
                  onChange={handleChange}
                  label="Status"
                  startAdornment={<Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}></Box>}
                >
                  <MenuItem value="Robocza">Robocza</MenuItem>
                  <MenuItem value="W przeglądzie">W przeglądzie</MenuItem>
                  <MenuItem value="Zatwierdzona">Zatwierdzona</MenuItem>
                  <MenuItem value="Wycofana">Wycofana</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
                <InputLabel>Domyślne stanowisko produkcyjne</InputLabel>
                <Select
                  name="defaultWorkstationId"
                  value={recipeData.defaultWorkstationId || ''}
                  onChange={handleChange}
                  label="Domyślne stanowisko produkcyjne"
                  startAdornment={<Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}><BuildIcon fontSize="small" /></Box>}
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
                <FormHelperText>Stanowisko będzie automatycznie przypisywane podczas generowania MO z CO</FormHelperText>
              </FormControl>
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
          </Grid>
        </Box>
      </Paper>

      {/* Sekcja składników */}
      <Paper 
        elevation={3} 
        sx={{ 
          p: 0, 
          mb: 3, 
          borderRadius: '12px', 
          overflow: 'hidden' 
        }}
      >
        <Box 
          sx={{ 
            p: 2, 
            display: 'flex', 
            alignItems: 'center', 
            gap: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: theme => theme.palette.mode === 'dark' 
              ? 'rgba(25, 35, 55, 0.5)' 
              : 'rgba(245, 247, 250, 0.8)',
            justifyContent: 'space-between'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <InventoryIcon color="primary" sx={{ mr: 1 }} />
            <Typography variant="h6" fontWeight="500">Składniki</Typography>
          </Box>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button 
              variant="outlined"
              size="small"
              onClick={addIngredient}
              startIcon={<AddIcon />}
              sx={{ borderRadius: '20px' }}
            >
              Dodaj składnik
            </Button>
            <Button 
              variant="outlined"
              size="small"
              color="secondary"
              onClick={handleAddInventoryItem}
              startIcon={<InventoryIcon />}
              sx={{ borderRadius: '20px' }}
            >
              Ze stanów
            </Button>
            <Button 
              variant="outlined"
              size="small"
              color="primary"
              onClick={() => linkAllIngredientsWithInventory(false)}
              sx={{ borderRadius: '20px' }}
            >
              Powiąż
            </Button>
            <Button 
              variant="outlined"
              size="small"
              color="warning"
              onClick={() => linkAllIngredientsWithInventory(true)}
              sx={{ borderRadius: '20px' }}
            >
              Resetuj
            </Button>
          </Box>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <Box sx={{ mb: 3 }}>
            <Autocomplete
              options={inventoryItems}
              getOptionLabel={(option) => option.name || ''}
              loading={loadingInventory}
              onChange={(event, newValue) => handleAddInventoryItem(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Dodaj składnik ze stanów"
                  variant="outlined"
                  fullWidth
                  helperText="Tylko składniki ze stanów mają przypisane ceny do kalkulacji kosztów. Składniki dodane ręcznie nie będą uwzględnione w kalkulacji."
                  InputProps={{
                    ...params.InputProps,
                    sx: { borderRadius: '8px' },
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
          
          {recipeData.ingredients.length > 0 ? (
            <TableContainer sx={{ borderRadius: '8px', border: '1px solid', borderColor: 'divider' }}>
              <Table>
                <TableHead sx={{ bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(30, 40, 60, 0.6)' : 'rgba(240, 245, 250, 0.8)' }}>
                  <TableRow>
                    <TableCell width="30%"><Typography variant="subtitle2">SKU składnika</Typography></TableCell>
                    <TableCell width="15%"><Typography variant="subtitle2">Ilość</Typography></TableCell>
                    <TableCell width="15%"><Typography variant="subtitle2">Jednostka</Typography></TableCell>
                    <TableCell width="20%"><Typography variant="subtitle2">Uwagi</Typography></TableCell>
                    <TableCell width="10%"><Typography variant="subtitle2">Źródło</Typography></TableCell>
                    <TableCell width="10%"><Typography variant="subtitle2">Akcje</Typography></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recipeData.ingredients.map((ingredient, index) => (
                    <TableRow key={index} hover sx={{ '&:nth-of-type(even)': { bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(30, 40, 60, 0.2)' : 'rgba(245, 247, 250, 0.5)' } }}>
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
                            label="Stany" 
                            icon={<InventoryIcon />} 
                            title="Składnik ze stanów - ma przypisaną cenę do kalkulacji kosztów" 
                            sx={{ borderRadius: '16px' }}
                          />
                        ) : (
                          <Chip 
                            size="small" 
                            color="default" 
                            label="Ręczny" 
                            icon={<EditIcon />} 
                            title="Składnik dodany ręcznie - brak ceny do kalkulacji kosztów" 
                            sx={{ borderRadius: '16px' }}
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
            <Paper 
              sx={{ 
                p: 3, 
                textAlign: 'center', 
                bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(25, 35, 55, 0.5)' : 'rgba(245, 247, 250, 0.8)',
                borderRadius: '8px',
                border: '1px dashed',
                borderColor: 'divider'
              }}
            >
              <InventoryIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body1" color="text.secondary" gutterBottom>
                Brak składników. 
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Dodaj składniki ze stanów lub ręcznie używając przycisków powyżej.
              </Typography>
            </Paper>
          )}
        </Box>
      </Paper>

      {/* Dialog dodawania produktu do stanów */}
      <Dialog 
        open={createProductDialogOpen} 
        onClose={() => setCreateProductDialogOpen(false)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '12px',
            overflow: 'hidden'
          }
        }}
      >
        <Box sx={{ 
          p: 2, 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: theme => theme.palette.mode === 'dark' 
            ? 'rgba(25, 35, 55, 0.5)' 
            : 'rgba(245, 247, 250, 0.8)'
        }}>
          <ProductIcon color="primary" />
          <DialogTitle sx={{ p: 0 }}>Dodaj produkt do stanów</DialogTitle>
        </Box>
        
        <DialogContent sx={{ mt: 2 }}>
          <DialogContentText sx={{ mb: 2 }}>
            Uzupełnij poniższe dane, aby dodać produkt z receptury do stanów. 
            Koszt produkcji zostanie obliczony na podstawie kosztów składników.
          </DialogContentText>
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                name="name"
                label="SKU produktu"
                value={productData.name}
                onChange={handleProductDataChange}
                fullWidth
                required
                error={!productData.name}
                helperText={!productData.name ? 'SKU jest wymagany' : ''}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                InputProps={{
                  startAdornment: (
                    <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                      <ProductIcon fontSize="small" />
                    </Box>
                  )
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth required sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
                <InputLabel id="warehouse-select-label">Lokalizacja</InputLabel>
                <Select
                  labelId="warehouse-select-label"
                  id="warehouse-select"
                  name="warehouseId"
                  value={productData.warehouseId}
                  onChange={handleProductDataChange}
                  label="Lokalizacja"
                  error={!productData.warehouseId}
                  startAdornment={<Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}></Box>}
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
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                name="category"
                label="Kategoria"
                value={productData.category}
                onChange={handleProductDataChange}
                fullWidth
                InputProps={{
                  readOnly: true,
                  startAdornment: (
                    <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}></Box>
                  )
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
                <InputLabel id="unit-select-label">Jednostka</InputLabel>
                <Select
                  labelId="unit-select-label"
                  id="unit-select"
                  name="unit"
                  value={productData.unit}
                  onChange={handleProductDataChange}
                  label="Jednostka"
                  startAdornment={<Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}></Box>}
                >
                  <MenuItem value="szt.">szt.</MenuItem>
                  <MenuItem value="kg">kg</MenuItem>
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
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
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
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
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
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button 
            onClick={() => setCreateProductDialogOpen(false)}
            variant="outlined"
            sx={{ borderRadius: '8px' }}
          >
            Anuluj
          </Button>
          <Button 
            onClick={handleCreateProduct} 
            variant="contained" 
            color="primary"
            disabled={creatingProduct || !productData.name || !productData.warehouseId}
            startIcon={creatingProduct ? <CircularProgress size={20} /> : <ProductIcon />}
            sx={{ 
              borderRadius: '8px', 
              boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
              px: 3
            }}
          >
            {creatingProduct ? 'Zapisywanie...' : 'Dodaj do stanów'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RecipeForm;