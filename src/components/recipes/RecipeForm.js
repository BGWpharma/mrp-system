// src/components/recipes/RecipeForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
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
  FormHelperText,
  Tooltip,
  Alert,
  Grid
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
  AccessTime as AccessTimeIcon,
  SwapHoriz as SwapIcon,
  Science as ScienceIcon,
  Sync as SyncIcon,
  KeyboardArrowUp as ArrowUpIcon,
  KeyboardArrowDown as ArrowDownIcon
} from '@mui/icons-material';
import { createRecipe, updateRecipe, getRecipeById, fixRecipeYield } from '../../services/recipeService';
import { getAllInventoryItems, getIngredientPrices, createInventoryItem, getAllWarehouses } from '../../services/inventoryService';
import { getAllPriceLists, addPriceListItem } from '../../services/priceListService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { getAllCustomers } from '../../services/customerService';
import { getAllWorkstations } from '../../services/workstationService';
import { UNIT_GROUPS, UNIT_CONVERSION_FACTORS } from '../../utils/constants';
import { NUTRITIONAL_CATEGORIES, DEFAULT_NUTRITIONAL_COMPONENT } from '../../utils/constants';
import { useNutritionalComponents } from '../../hooks/useNutritionalComponents';
import { addNutritionalComponent } from '../../services/nutritionalComponentsService';

const RecipeForm = ({ recipeId }) => {
  const { currentUser } = useAuth();
  const { showSuccess, showError, showWarning, showInfo } = useNotification();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(!!recipeId);
  const [saving, setSaving] = useState(false);
  
  // Hook do pobierania składników odżywczych z bazy danych
  const { components: nutritionalComponents, loading: loadingComponents, usingFallback, refreshComponents } = useNutritionalComponents();
  
  const [recipeData, setRecipeData] = useState({
    name: '',
    description: '',
    yield: { quantity: 1, unit: 'szt.' },
    prepTime: '',
    ingredients: [],
    micronutrients: [],
    allergens: [],
    notes: '',
    status: 'Robocza',
    customerId: '',
    processingCostPerUnit: 0,
    productionTimePerUnit: 0,
    defaultWorkstationId: '',
    nutritionalBasis: '1 caps' // Nowe pole dla podstawy składników odżywczych
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

  // Dodajemy stany do obsługi konwersji jednostek
  const [displayUnits, setDisplayUnits] = useState({});
  const [showDisplayUnits, setShowDisplayUnits] = useState(false);
  const [costUnitDisplay, setCostUnitDisplay] = useState(null);
  const [timeUnitDisplay, setTimeUnitDisplay] = useState(null);
  
  // Stany dla dialogu dodawania nowego składnika odżywczego
  const [addNutrientDialogOpen, setAddNutrientDialogOpen] = useState(false);
  const [newNutrientData, setNewNutrientData] = useState({
    code: '',
    name: '',
    unit: '',
    category: ''
  });
  
  // Stany dla dialogu dodawania receptury do listy cenowej
  const [addToPriceListDialogOpen, setAddToPriceListDialogOpen] = useState(false);
  const [priceLists, setPriceLists] = useState([]);
  const [loadingPriceLists, setLoadingPriceLists] = useState(false);
  const [addingToPriceList, setAddingToPriceList] = useState(false);
  const [priceListData, setPriceListData] = useState({
    priceListId: '',
    price: 0,
    notes: ''
  });
  const [newRecipeId, setNewRecipeId] = useState(null);

  // Funkcje pomocnicze do konwersji jednostek
  const getUnitGroup = (unit) => {
    for (const [group, units] of Object.entries(UNIT_GROUPS)) {
      if (units.includes(unit)) {
        return { group, units };
      }
    }
    return null;
  };
  
  const canConvertUnit = (unit) => {
    return getUnitGroup(unit) !== null;
  };
  
  const convertValue = (value, fromUnit, toUnit) => {
    if (!value || !fromUnit || !toUnit || fromUnit === toUnit) {
      return value;
    }
    
    const fromFactor = UNIT_CONVERSION_FACTORS[fromUnit] || 1;
    const toFactor = UNIT_CONVERSION_FACTORS[toUnit] || 1;
    
    // Konwersja do wartości bazowej, a następnie do docelowej jednostki
    const baseValue = parseFloat(value) * fromFactor;
    const convertedValue = baseValue / toFactor;
    
    return convertedValue;
  };
  
  const toggleIngredientUnit = (index) => {
    const ingredient = recipeData.ingredients[index];
    const unitGroup = getUnitGroup(ingredient.unit);
    
    if (!unitGroup) return; // Nie można konwertować tej jednostki
    
    // Znajdź dostępne jednostki i wybierz następną w kolejności
    const availableUnits = unitGroup.units;
    const currentIndex = availableUnits.indexOf(ingredient.unit);
    const nextUnit = availableUnits[(currentIndex + 1) % availableUnits.length];
    
    // Ustaw jednostkę wyświetlania dla tego składnika
    setDisplayUnits(prev => ({
      ...prev,
      [index]: nextUnit
    }));
    
    // Włącz tryb wyświetlania jednostek alternatywnych
    setShowDisplayUnits(true);
    
    // Pokaż informację o konwersji
    showInfo(`Składnik "${ingredient.name}" jest teraz wyświetlany w ${nextUnit}, ale będzie zapisany w ${ingredient.unit}`);
  };
  
  const toggleCostUnit = () => {
    // Sprawdź czy można konwertować jednostkę kosztu
    const unit = 'szt.'; // Domyślna jednostka dla kosztu
    const unitGroup = getUnitGroup(unit);
    
    if (!unitGroup) return; // Nie można konwertować tej jednostki
    
    // Jeśli nie ma ustawionej jednostki wyświetlania, użyj pierwszej alternatywnej
    if (!costUnitDisplay) {
      const availableUnits = unitGroup.units;
      const altUnit = availableUnits.find(u => u !== unit);
      if (altUnit) {
        setCostUnitDisplay(altUnit);
        setShowDisplayUnits(true);
        showInfo(`Koszty są teraz wyświetlane w ${altUnit}, ale będą zapisane w szt.`);
      }
    } else {
      // Jeśli już jest ustawiona, wyczyść
      setCostUnitDisplay(null);
      showInfo('Przywrócono oryginalną jednostkę kosztów (szt.)');
    }
  };
  
  const toggleTimeUnit = () => {
    // Sprawdź czy można konwertować jednostkę czasu
    const unit = 'szt.'; // Domyślna jednostka dla czasu
    const unitGroup = getUnitGroup(unit);
    
    if (!unitGroup) return; // Nie można konwertować tej jednostki
    
    // Jeśli nie ma ustawionej jednostki wyświetlania, użyj pierwszej alternatywnej
    if (!timeUnitDisplay) {
      const availableUnits = unitGroup.units;
      const altUnit = availableUnits.find(u => u !== unit);
      if (altUnit) {
        setTimeUnitDisplay(altUnit);
        setShowDisplayUnits(true);
        showInfo(`Czas produkcji jest teraz wyświetlany w ${altUnit}, ale będzie zapisany w szt.`);
      }
    } else {
      // Jeśli już jest ustawiona, wyczyść
      setTimeUnitDisplay(null);
      showInfo('Przywrócono oryginalną jednostkę czasu produkcji (szt.)');
    }
  };
  
  const getDisplayValue = (index, quantity, unit) => {
    if (!showDisplayUnits || !displayUnits[index] || quantity === '' || quantity === null || quantity === undefined) {
      return quantity;
    }
    
    const numValue = parseFloat(quantity);
    if (isNaN(numValue)) {
      return quantity;
    }
    
    return convertValue(numValue, unit, displayUnits[index]);
  };
  
  const getDisplayUnit = (index, unit) => {
    if (!showDisplayUnits || !displayUnits[index]) {
      return unit;
    }
    
    return displayUnits[index];
  };
  
  const formatDisplayValue = (value) => {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    
    const numValue = parseFloat(value);
    
    // Jeśli wartość jest liczbą całkowitą, wyświetl bez miejsc po przecinku
    if (Number.isInteger(numValue)) {
      return numValue.toString();
    }
    
    // W przeciwnym razie wyświetl maksymalnie 3 miejsca po przecinku
    return numValue.toFixed(3).replace(/\.?0+$/, '');
  };

  const getCostDisplayValue = () => {
    if (!costUnitDisplay) {
      return recipeData.processingCostPerUnit || 0;
    }
    
    const numValue = parseFloat(recipeData.processingCostPerUnit) || 0;
    const convertedValue = convertValue(numValue, 'szt.', costUnitDisplay);
    return formatDisplayValue(convertedValue);
  };
  
  const getTimeDisplayValue = () => {
    if (!timeUnitDisplay) {
      return recipeData.productionTimePerUnit || 0;
    }
    
    const numValue = parseFloat(recipeData.productionTimePerUnit) || 0;
    const convertedValue = convertValue(numValue, 'szt.', timeUnitDisplay);
    return formatDisplayValue(convertedValue);
  };

  useEffect(() => {
    if (recipeId) {
      const fetchRecipe = async () => {
        try {
          const recipe = await getRecipeById(recipeId);
          
          // Upewnij się, że micronutrients istnieje jako tablica i dodaj ID jeśli nie istnieje
          const micronutrientsWithIds = (recipe.micronutrients || []).map((micronutrient, index) => ({
            ...micronutrient,
            id: micronutrient.id || `existing-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`
          }));
          
          const recipeWithMicronutrients = {
            ...recipe,
            micronutrients: micronutrientsWithIds
          };
          
          setRecipeData(recipeWithMicronutrients);
          
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

  // Funkcja do pobierania list cenowych
  const fetchPriceLists = async () => {
    try {
      setLoadingPriceLists(true);
      const data = await getAllPriceLists();
      setPriceLists(data);
    } catch (error) {
      console.error('Błąd podczas pobierania list cenowych:', error);
      showError('Błąd podczas pobierania list cenowych');
    } finally {
      setLoadingPriceLists(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      // Wyświetl informację, jeśli używane są konwertowane jednostki
      if (showDisplayUnits && (Object.keys(displayUnits).length > 0 || costUnitDisplay || timeUnitDisplay)) {
        showInfo(t('recipes.messages.conversionInfo'));
      }
      
      if (recipeId) {
        await updateRecipe(recipeId, recipeData, currentUser.uid);
        showSuccess(t('recipes.messages.recipeUpdated'));
        navigate(`/recipes/${recipeId}`);
      } else {
        const newRecipe = await createRecipe(recipeData, currentUser.uid);
        setNewRecipeId(newRecipe.id);
        showSuccess(t('recipes.messages.recipeCreated'));
        
        // Pokaż dialog pytający o dodanie do listy cenowej
        await fetchPriceLists();
        setAddToPriceListDialogOpen(true);
      }
    } catch (error) {
      showError(t('recipes.messages.saveError', { error: error.message }));
      console.error('Error saving recipe:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setRecipeData(prev => ({ ...prev, [name]: value }));
  };

  const handleCostInputChange = (e) => {
    if (!costUnitDisplay) {
      // Jeśli nie ma aktywnej konwersji, użyj normalnej metody
      handleChange(e);
      return;
    }
    
    const { value } = e.target;
    const numValue = parseFloat(value) || 0;
    
    // Konwertuj z jednostki wyświetlania do oryginalnej jednostki (szt.)
    const originalValue = convertValue(numValue, costUnitDisplay, 'szt.');
    
    // Aktualizuj stan używając oryginalnej jednostki
    setRecipeData(prev => ({ 
      ...prev, 
      processingCostPerUnit: originalValue
    }));
  };
  
  const handleTimeInputChange = (e) => {
    if (!timeUnitDisplay) {
      // Jeśli nie ma aktywnej konwersji, użyj normalnej metody
      handleChange(e);
      return;
    }
    
    const { value } = e.target;
    const numValue = parseFloat(value) || 0;
    
    // Konwertuj z jednostki wyświetlania do oryginalnej jednostki (szt.)
    const originalValue = convertValue(numValue, timeUnitDisplay, 'szt.');
    
    // Aktualizuj stan używając oryginalnej jednostki
    setRecipeData(prev => ({ 
      ...prev, 
      productionTimePerUnit: originalValue
    }));
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
    
    if (field === 'quantity' && showDisplayUnits && displayUnits[index]) {
      // Jeśli zmieniamy ilość i mamy aktywną konwersję jednostek, musimy przeliczyć wartość
      const ingredient = recipeData.ingredients[index];
      const originalUnit = ingredient.unit;
      const displayUnit = displayUnits[index];
      
      const numValue = parseFloat(value) || 0;
      
      // Konwertuj z jednostki wyświetlania do oryginalnej jednostki
      const originalValue = convertValue(numValue, displayUnit, originalUnit);
      
      // Aktualizuj składnik z oryginalną wartością
      updatedIngredients[index] = {
        ...updatedIngredients[index],
        quantity: originalValue
      };
    } else {
      // Standardowa aktualizacja bez konwersji
      updatedIngredients[index] = {
        ...updatedIngredients[index],
        [field]: value
      };
    }
    
    setRecipeData(prev => ({
      ...prev,
      ingredients: updatedIngredients
    }));
  };

  const addIngredient = () => {
    setRecipeData(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, { name: '', quantity: '', unit: 'g', allergens: [], casNumber: '' }]
    }));
  };

  const removeIngredient = (index) => {
    const newIngredients = [...recipeData.ingredients];
    newIngredients.splice(index, 1);
    setRecipeData(prev => ({
      ...prev,
      ingredients: newIngredients
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
      showError(t('recipes.ingredients.existsError'));
      return;
    }
    
    // Dodaj nowy składnik z danymi z magazynu
    const newIngredient = {
      id: item.id,
      name: item.name,
      quantity: '',
      unit: item.unit || 'szt.',
      notes: '',
      casNumber: item.casNumber || ''
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
      showWarning(t('recipes.messages.noIngredientsToLink'));
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
          showInfo(t('recipes.messages.resetLinks', { count: resetCount }));
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
        showSuccess(t('recipes.messages.linkedIngredients', { count: linkedCount }));
      }
      
      if (notFoundCount > 0) {
        showWarning(t('recipes.messages.ingredientsNotFound', { count: notFoundCount }));
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

  // Funkcja do pobierania numerów CAS z pozycji magazynowych
  const syncCASNumbers = async () => {
    if (!recipeData.ingredients || recipeData.ingredients.length === 0) {
      showWarning(t('recipes.messages.noIngredientsToLink'));
      return;
    }
    
    try {
      setLoading(true);
      let syncedCount = 0;
      let skippedCount = 0;
      
      // Przygotuj kopię składników do modyfikacji
      const updatedIngredients = [...recipeData.ingredients];
      
      // Przejdź przez wszystkie składniki które mają powiązanie z magazynem
      for (const [index, ingredient] of updatedIngredients.entries()) {
        if (ingredient.id) {
          try {
            // Pobierz szczegóły pozycji magazynowej
            const inventoryRef = collection(db, 'inventory');
            const q = query(
              inventoryRef,
              where('__name__', '==', ingredient.id),
              limit(1)
            );
            
            const querySnapshot = await getDocs(q);
            
            if (!querySnapshot.empty) {
              const inventoryItem = {
                id: querySnapshot.docs[0].id,
                ...querySnapshot.docs[0].data()
              };
              
              // Aktualizuj numer CAS jeśli:
              // 1. Składnik nie ma numeru CAS lub ma pusty
              // 2. Numer CAS w pozycji magazynowej różni się od tego w składniku
              if (inventoryItem.casNumber && 
                  (!ingredient.casNumber || 
                   ingredient.casNumber.trim() === '' || 
                   ingredient.casNumber.trim() !== inventoryItem.casNumber.trim())) {
                
                updatedIngredients[index] = {
                  ...ingredient,
                  casNumber: inventoryItem.casNumber
                };
                syncedCount++;
                
                console.log(`Składnik "${ingredient.name}" - aktualizuję CAS z "${ingredient.casNumber || 'brak'}" na "${inventoryItem.casNumber}"`);
              } else {
                skippedCount++;
              }
            }
          } catch (error) {
            console.error(`Błąd podczas pobierania danych dla składnika ${ingredient.name}:`, error);
            skippedCount++;
          }
        } else {
          // Składnik nie jest powiązany z magazynem
          skippedCount++;
        }
      }
      
      // Aktualizuj stan receptury z pobranymi numerami CAS
      if (syncedCount > 0) {
        setRecipeData(prev => ({
          ...prev,
          ingredients: updatedIngredients
        }));
        
        showSuccess(`Pobrano numery CAS dla ${syncedCount} składników z pozycji magazynowych`);
      }
      
      if (skippedCount > 0) {
        showInfo(`Pominięto ${skippedCount} składników (brak powiązania z magazynem lub CAS już aktualny)`);
      }
      
      if (syncedCount === 0) {
        showInfo('Brak numerów CAS do aktualizacji. Wszystkie składniki mają już aktualne numery CAS lub nie są powiązane z magazynem.');
      }
    } catch (error) {
      showError('Błąd podczas pobierania numerów CAS: ' + error.message);
      console.error('Error syncing CAS numbers:', error);
    } finally {
      setLoading(false);
    }
  };

  // Funkcje obsługujące składniki odżywcze
  const handleMicronutrientChange = (index, field, value) => {
    const newMicronutrients = [...recipeData.micronutrients];
    
    if (field === 'code') {
      // Znajdź składnik odżywczy na podstawie kodu
      const selectedMicronutrient = nutritionalComponents.find(m => m.code === value);
      if (selectedMicronutrient) {
        newMicronutrients[index] = {
          ...newMicronutrients[index], // Zachowaj istniejące właściwości, w tym ID
          code: selectedMicronutrient.code,
          name: selectedMicronutrient.name,
          unit: selectedMicronutrient.unit,
          category: selectedMicronutrient.category
        };
      }
    } else {
      newMicronutrients[index] = {
        ...newMicronutrients[index],
        [field]: value
      };
    }
    
    setRecipeData(prev => ({
      ...prev,
      micronutrients: newMicronutrients
    }));
  };

  const addMicronutrient = () => {
    console.log('Adding new micronutrient');
    const newMicronutrient = { 
      ...DEFAULT_NUTRITIONAL_COMPONENT,
      id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    console.log('New micronutrient:', newMicronutrient);
    
    setRecipeData(prev => {
      const updated = {
        ...prev,
        micronutrients: [...prev.micronutrients, newMicronutrient]
      };
      console.log('Updated recipe data micronutrients:', updated.micronutrients);
      return updated;
    });
  };

  const removeMicronutrient = (index) => {
    const newMicronutrients = [...recipeData.micronutrients];
    newMicronutrients.splice(index, 1);
    setRecipeData(prev => ({
      ...prev,
      micronutrients: newMicronutrients
    }));
  };

  // Funkcje do ręcznego sortowania składników odżywczych
  const moveMicronutrientUp = (index) => {
    if (index === 0) return; // Nie można przesunąć pierwszego elementu w górę
    
    const newMicronutrients = [...recipeData.micronutrients];
    const temp = newMicronutrients[index];
    newMicronutrients[index] = newMicronutrients[index - 1];
    newMicronutrients[index - 1] = temp;
    
    setRecipeData(prev => ({
      ...prev,
      micronutrients: newMicronutrients
    }));
  };

  const moveMicronutrientDown = (index) => {
    if (index === recipeData.micronutrients.length - 1) return; // Nie można przesunąć ostatniego elementu w dół
    
    const newMicronutrients = [...recipeData.micronutrients];
    const temp = newMicronutrients[index];
    newMicronutrients[index] = newMicronutrients[index + 1];
    newMicronutrients[index + 1] = temp;
    
    setRecipeData(prev => ({
      ...prev,
      micronutrients: newMicronutrients
    }));
  };

  const handleNutritionalBasisChange = (e) => {
    setRecipeData(prev => ({
      ...prev,
      nutritionalBasis: e.target.value
    }));
  };

  // Funkcje obsługujące dodawanie nowego składnika odżywczego
  const handleOpenAddNutrientDialog = () => {
    setNewNutrientData({
      code: '',
      name: '',
      unit: '',
      category: ''
    });
    setAddNutrientDialogOpen(true);
  };

  const handleCloseAddNutrientDialog = () => {
    setAddNutrientDialogOpen(false);
    setNewNutrientData({
      code: '',
      name: '',
      unit: '',
      category: ''
    });
  };

  const handleSaveNewNutrient = async () => {
    try {
      if (!newNutrientData.code || !newNutrientData.name || !newNutrientData.unit || !newNutrientData.category) {
        showError('Wszystkie pola są wymagane');
        return;
      }

      // Dodaj składnik do bazy danych
      await addNutritionalComponent({
        ...newNutrientData,
        isActive: true
      });
      
      showSuccess('Nowy składnik odżywczy został dodany');
      
      // Odśwież listę składników
      await refreshComponents();
      
      // Automatycznie dodaj nowy składnik do receptury
      const newMicronutrient = {
        code: newNutrientData.code,
        name: newNutrientData.name,
        unit: newNutrientData.unit,
        category: newNutrientData.category,
        quantity: '',
        notes: '',
        id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };
      
      setRecipeData(prev => ({
        ...prev,
        micronutrients: [...prev.micronutrients, newMicronutrient]
      }));
      
      handleCloseAddNutrientDialog();
    } catch (error) {
      console.error('Błąd przy dodawaniu składnika:', error);
      showError('Wystąpił błąd podczas dodawania składnika');
    }
  };

  // Funkcje do obsługi dialogu dodawania do listy cenowej
  const handleClosePriceListDialog = () => {
    setAddToPriceListDialogOpen(false);
    setPriceListData({ priceListId: '', price: 0, notes: '' });
    
    // Przekieruj do strony szczegółów receptury
    if (newRecipeId) {
      navigate(`/recipes/${newRecipeId}`);
    }
  };

  const handlePriceListDataChange = (field, value) => {
    setPriceListData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAddToPriceList = async () => {
    if (!priceListData.priceListId) {
      showError('Wybierz listę cenową');
      return;
    }

    if (!priceListData.price || priceListData.price < 0) {
      showError('Wprowadź poprawną cenę');
      return;
    }

    try {
      setAddingToPriceList(true);
      
      const itemData = {
        productId: newRecipeId,
        productName: recipeData.name,
        price: parseFloat(priceListData.price),
        unit: recipeData.yield?.unit || 'szt.',
        notes: priceListData.notes,
        isRecipe: true
      };

      await addPriceListItem(priceListData.priceListId, itemData, currentUser.uid);
      showSuccess('Receptura została dodana do listy cenowej');
      handleClosePriceListDialog();
    } catch (error) {
      console.error('Błąd podczas dodawania do listy cenowej:', error);
      showError('Błąd podczas dodawania receptury do listy cenowej: ' + error.message);
    } finally {
      setAddingToPriceList(false);
    }
  };

  const handleSkipPriceList = () => {
    handleClosePriceListDialog();
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
          onClick={() => navigate(recipeId ? `/recipes/${recipeId}` : '/recipes')}
          sx={{ 
            borderRadius: '8px', 
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}
        >
          {t('recipes.buttons.back')}
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 'medium' }}>
          {recipeId ? t('recipes.editRecipe') : t('recipes.addNewRecipe')}
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
            {saving ? t('recipes.buttons.saving') : t('recipes.buttons.save')}
          </Button>
          {recipeId && renderCreateProductButton()}
          <Tooltip title={t('recipes.buttons.unitConversion')}>
            <IconButton color="info">
              <SwapIcon />
            </IconButton>
          </Tooltip>
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
          <Typography variant="h6" fontWeight="500">{t('recipes.basicData')}</Typography>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                required
                name="name"
                label={t('recipes.recipeSKU')}
                value={recipeData.name}
                onChange={handleChange}
                error={!recipeData.name}
                helperText={!recipeData.name ? t('recipes.messages.skuRequired') : ''}
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
                <InputLabel id="customer-select-label">{t('recipes.customer')}</InputLabel>
                <Select
                  labelId="customer-select-label"
                  name="customerId"
                  value={recipeData.customerId}
                  onChange={handleChange}
                  label={t('recipes.customer')}
                  displayEmpty
                >
                  <MenuItem value="">
                    <em>{t('recipes.noCustomer')}</em>
                  </MenuItem>
                  {customers.map((customer) => (
                    <MenuItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>{t('recipes.customerHelpText')}</FormHelperText>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label={t('recipes.description')}
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
                label={t('recipes.processingCost', { unit: costUnitDisplay || t('common.pieces') })}
                name="processingCostPerUnit"
                type="number"
                InputProps={{ 
                  inputProps: { min: 0, step: 0.01 },
                  startAdornment: (
                    <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                      <CalculateIcon fontSize="small" />
                    </Box>
                  ),
                  endAdornment: canConvertUnit('szt.') && (
                                                <Tooltip title={t('recipes.ingredients.switchUnit')}>
                      <IconButton 
                        size="small" 
                        color="primary" 
                        onClick={toggleCostUnit}
                        sx={{ ml: 1 }}
                      >
                        <SwapIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )
                }}
                value={getCostDisplayValue()}
                onChange={handleCostInputChange}
                fullWidth
                helperText={costUnitDisplay 
                  ? `Koszt w oryginalnej jednostce: ${formatDisplayValue(recipeData.processingCostPerUnit || 0)} EUR/szt.` 
                  : "Koszt procesowy lub robocizny na jedną sztukę produktu"}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                label={t('recipes.productionTime', { unit: timeUnitDisplay || t('common.pieces') })}
                name="productionTimePerUnit"
                type="number"
                InputProps={{ 
                  inputProps: { min: 0, step: 0.01 },
                  startAdornment: (
                    <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                      <AccessTimeIcon fontSize="small" />
                    </Box>
                  ),
                  endAdornment: canConvertUnit('szt.') && (
                    <Tooltip title="Przełącz jednostkę miary">
                      <IconButton 
                        size="small" 
                        color="primary" 
                        onClick={toggleTimeUnit}
                        sx={{ ml: 1 }}
                      >
                        <SwapIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )
                }}
                value={getTimeDisplayValue()}
                onChange={handleTimeInputChange}
                fullWidth
                helperText={timeUnitDisplay 
                  ? `Czas w oryginalnej jednostce: ${formatDisplayValue(recipeData.productionTimePerUnit || 0)} min/szt.` 
                  : "Czas potrzebny na wyprodukowanie jednej sztuki produktu"}
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
                <InputLabel>{t('recipes.defaultWorkstation')}</InputLabel>
                <Select
                  name="defaultWorkstationId"
                  value={recipeData.defaultWorkstationId || ''}
                  onChange={handleChange}
                  label={t('recipes.defaultWorkstation')}
                  startAdornment={<Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}><BuildIcon fontSize="small" /></Box>}
                >
                  <MenuItem value="">
                    <em>{t('recipes.none')}</em>
                  </MenuItem>
                  {workstations.map((workstation) => (
                    <MenuItem key={workstation.id} value={workstation.id}>
                      {workstation.name}
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>{t('recipes.workstationHelpText')}</FormHelperText>
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
            <Typography variant="h6" fontWeight="500">{t('recipes.ingredients.title')}</Typography>
          </Box>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button 
              variant="outlined"
              size="small"
              onClick={addIngredient}
              startIcon={<AddIcon />}
              sx={{ borderRadius: '20px' }}
            >
              {t('recipes.ingredients.addIngredient')}
            </Button>
            <Button 
              variant="outlined"
              size="small"
              color="secondary"
              onClick={handleAddInventoryItem}
              startIcon={<InventoryIcon />}
              sx={{ borderRadius: '20px' }}
            >
              {t('recipes.ingredients.fromInventory')}
            </Button>
            <Button 
              variant="outlined"
              size="small"
              color="primary"
              onClick={() => linkAllIngredientsWithInventory(false)}
              sx={{ borderRadius: '20px' }}
            >
              {t('recipes.ingredients.link')}
            </Button>
            <Button 
              variant="outlined"
              size="small"
              color="warning"
              onClick={() => linkAllIngredientsWithInventory(true)}
              sx={{ borderRadius: '20px' }}
            >
              {t('recipes.ingredients.reset')}
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
                  label={t('recipes.ingredients.addFromInventory')}
                  variant="outlined"
                  fullWidth
                  helperText={t('recipes.ingredients.inventoryHelpText')}
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
                        {option.unitPrice ? t('recipes.ingredients.priceInfo', {price: option.unitPrice.toFixed(2), unit: option.unit}) : t('recipes.ingredients.noPriceInfo')}
                      </Typography>
                    </Box>
                  </li>
                );
              }}
            />
          </Box>
          
          {showDisplayUnits && Object.keys(displayUnits).length > 0 && (
            <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', bgcolor: 'info.lighter', p: 1, borderRadius: '8px' }}>
              <Typography variant="body2" color="info.dark" sx={{ flex: 1 }}>
                <b>Uwaga:</b> Niektóre jednostki są wyświetlane w alternatywnej formie dla wygody. Receptura będzie zapisana w oryginalnych jednostkach.
              </Typography>
              <Button 
                variant="outlined" 
                size="small" 
                color="info" 
                startIcon={<SwapIcon />}
                onClick={() => {
                  setDisplayUnits({});
                  setShowDisplayUnits(false);
                }}
              >
                Przywróć oryginalne jednostki
              </Button>
            </Box>
          )}
          
          {recipeData.ingredients.length > 0 ? (
            <TableContainer sx={{ borderRadius: '8px', border: '1px solid', borderColor: 'divider' }}>
              <Table>
                <TableHead sx={{ bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(30, 40, 60, 0.6)' : 'rgba(240, 245, 250, 0.8)' }}>
                  <TableRow>
                    <TableCell width="25%"><Typography variant="subtitle2">{t('recipes.ingredients.ingredientSKU')}</Typography></TableCell>
                    <TableCell width="19%"><Typography variant="subtitle2">{t('recipes.ingredients.quantity')}</Typography></TableCell>
                    <TableCell width="10%"><Typography variant="subtitle2">{t('recipes.ingredients.unit')}</Typography></TableCell>
                    <TableCell width="15%">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="subtitle2">{t('recipes.ingredients.casNumber')}</Typography>
                        <Tooltip title={t('recipes.ingredients.syncCAS')}>
                          <IconButton 
                            size="small" 
                            color="primary" 
                            onClick={syncCASNumbers}
                            disabled={loading}
                            sx={{ ml: 1 }}
                          >
                            <SyncIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                    <TableCell width="16%"><Typography variant="subtitle2">{t('recipes.ingredients.notes')}</Typography></TableCell>
                    <TableCell width="10%"><Typography variant="subtitle2">{t('recipes.ingredients.source')}</Typography></TableCell>
                    <TableCell width="5%"><Typography variant="subtitle2">{t('recipes.ingredients.actions')}</Typography></TableCell>
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
                          value={showDisplayUnits && displayUnits[index] 
                            ? formatDisplayValue(getDisplayValue(index, ingredient.quantity, ingredient.unit))
                            : ingredient.quantity}
                          onChange={(e) => handleIngredientChange(index, 'quantity', e.target.value)}
                          InputProps={{
                            endAdornment: showDisplayUnits && displayUnits[index] && (
                              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                                (oryginalnie: {formatDisplayValue(ingredient.quantity)} {ingredient.unit})
                              </Typography>
                            )
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <TextField
                            fullWidth
                            variant="standard"
                            value={showDisplayUnits && displayUnits[index] 
                              ? getDisplayUnit(index, ingredient.unit)
                              : ingredient.unit}
                            onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
                            disabled={!!ingredient.id}
                          />
                          {canConvertUnit(ingredient.unit) && (
                            <Tooltip title={t('recipes.ingredients.switchUnit')}>
                              <IconButton 
                                size="small" 
                                color="primary" 
                                onClick={() => toggleIngredientUnit(index)}
                                sx={{ ml: 1 }}
                              >
                                <SwapIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <TextField
                          fullWidth
                          variant="standard"
                          value={ingredient.casNumber || ''}
                          onChange={(e) => handleIngredientChange(index, 'casNumber', e.target.value)}
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
                            label={t('recipes.ingredients.fromInventoryChip')} 
                            icon={<InventoryIcon />} 
                            title={t('recipes.ingredients.fromInventoryTooltip')} 
                            sx={{ borderRadius: '16px' }}
                          />
                        ) : (
                          <Chip 
                            size="small" 
                            color="default" 
                            label={t('recipes.ingredients.manualChip')} 
                            icon={<EditIcon />} 
                            title={t('recipes.ingredients.manualTooltip')} 
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
                {t('recipes.ingredients.noIngredients')} 
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('recipes.ingredients.noIngredientsHelpText')}
              </Typography>
            </Paper>
          )}
        </Box>
      </Paper>

      {/* Sekcja składników odżywczych */}
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
            <ScienceIcon color="secondary" sx={{ mr: 1 }} />
            <Typography variant="h6" fontWeight="500">{t('recipes.nutrients.title')}</Typography>
          </Box>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button 
              variant="outlined"
              size="small"
              onClick={addMicronutrient}
              startIcon={<AddIcon />}
              sx={{ borderRadius: '20px' }}
            >
              {t('recipes.nutrients.addNutrient')}
            </Button>
            <Button 
              variant="outlined"
              size="small"
              color="secondary"
              onClick={handleOpenAddNutrientDialog}
              startIcon={<ScienceIcon />}
              sx={{ borderRadius: '20px' }}
            >
              {t('recipes.nutrients.newNutrient')}
            </Button>
          </Box>
        </Box>
        
        <Box sx={{ p: 3 }}>
          {/* Pole dla podstawy składników odżywczych */}
          <Box sx={{ mb: 3 }}>
            <TextField
              label={t('recipes.nutrients.nutritionalBasis')}
              name="nutritionalBasis"
              value={recipeData.nutritionalBasis}
              onChange={handleNutritionalBasisChange}
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              helperText={t('recipes.nutrients.nutritionalBasisHelpText')}
              InputProps={{
                startAdornment: (
                  <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                    <ScienceIcon fontSize="small" />
                  </Box>
                )
              }}
            />
          </Box>
          
          {recipeData.micronutrients && recipeData.micronutrients.length > 0 ? (
            <TableContainer sx={{ borderRadius: '8px', border: '1px solid', borderColor: 'divider' }}>
              <Table>
                <TableHead sx={{ bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(30, 40, 60, 0.6)' : 'rgba(240, 245, 250, 0.8)' }}>
                  <TableRow>
                    <TableCell width="18%"><Typography variant="subtitle2">{t('recipes.nutrients.component')}</Typography></TableCell>
                    <TableCell width="18%"><Typography variant="subtitle2">{t('recipes.nutrients.name')}</Typography></TableCell>
                    <TableCell width="12%"><Typography variant="subtitle2">{t('recipes.nutrients.quantity')}</Typography></TableCell>
                    <TableCell width="8%"><Typography variant="subtitle2">{t('recipes.nutrients.unit')}</Typography></TableCell>
                    <TableCell width="14%"><Typography variant="subtitle2">{t('recipes.nutrients.category')}</Typography></TableCell>
                    <TableCell width="20%"><Typography variant="subtitle2">{t('recipes.nutrients.notes')}</Typography></TableCell>
                    <TableCell width="10%"><Typography variant="subtitle2">{t('recipes.nutrients.actions')}</Typography></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recipeData.micronutrients.map((micronutrient, index) => (
                    <TableRow key={micronutrient.id || `micronutrient-${index}-${micronutrient.code || 'empty'}`} hover sx={{ '&:nth-of-type(even)': { bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(30, 40, 60, 0.2)' : 'rgba(245, 247, 250, 0.5)' } }}>
                      <TableCell>
                        <Autocomplete
                          fullWidth
                          variant="standard"
                          options={[
                            // Dodaj specjalną opcję na początku listy, jeśli nie ma składników lub są ładowane
                            ...(loadingComponents ? [] : [{ 
                              isAddNewOption: true,
                              name: t('recipes.nutrients.addNewNutritionalComponent'),
                              code: 'ADD_NEW',
                              unit: '',
                              category: 'Brak'
                            }]),
                            ...nutritionalComponents
                          ]}
                          groupBy={(option) => option.category}
                          getOptionLabel={(option) => option.code || ''}
                          value={nutritionalComponents.find(c => c.code === micronutrient.code) || null}
                          // Debug: logowanie aktualnej wartości
                          onOpen={() => {
                            console.log('Autocomplete opened for index:', index);
                            console.log('Current micronutrient:', micronutrient);
                            console.log('Available components:', nutritionalComponents.length);
                            console.log('Found component:', nutritionalComponents.find(c => c.code === micronutrient.code));
                          }}
                          onChange={(event, newValue) => {
                            console.log('Autocomplete onChange:', { index, newValue });
                            if (newValue?.isAddNewOption) {
                              handleOpenAddNutrientDialog();
                            } else if (newValue) {
                              // Aktualizuj wszystkie pola jednocześnie
                              const newMicronutrients = [...recipeData.micronutrients];
                              newMicronutrients[index] = {
                                ...newMicronutrients[index], // Zachowaj istniejące właściwości, w tym ID
                                code: newValue.code,
                                name: newValue.name,
                                unit: newValue.unit,
                                category: newValue.category
                              };
                              console.log('Updated micronutrient:', newMicronutrients[index]);
                              setRecipeData(prev => ({
                                ...prev,
                                micronutrients: newMicronutrients
                              }));
                            } else {
                              // Jeśli newValue jest null (usunięcie wyboru), wyczyść pola
                              const newMicronutrients = [...recipeData.micronutrients];
                              newMicronutrients[index] = {
                                ...newMicronutrients[index],
                                code: '',
                                name: '',
                                unit: '',
                                category: ''
                              };
                              setRecipeData(prev => ({
                                ...prev,
                                micronutrients: newMicronutrients
                              }));
                            }
                          }}
                          loading={loadingComponents}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              variant="standard"
                              placeholder={t('recipes.nutrients.selectComponent')}
                              InputProps={{
                                ...params.InputProps,
                                endAdornment: (
                                  <>
                                    {loadingComponents ? <CircularProgress color="inherit" size={20} /> : null}
                                    {params.InputProps.endAdornment}
                                  </>
                                ),
                              }}
                            />
                          )}
                          renderOption={(props, option, { index: optionIndex }) => {
                            const { key, ...restProps } = props;
                            return (
                              <Box
                                key={option.isAddNewOption ? 'add-new-option' : `option-${option.code}-${optionIndex}`}
                                component="li"
                                {...restProps}
                                sx={option.isAddNewOption ? {
                                  p: 1.5,
                                  bgcolor: theme => theme.palette.mode === 'dark' 
                                    ? 'rgba(156, 39, 176, 0.25)'
                                    : 'rgba(156, 39, 176, 0.1)'
                                } : restProps.sx}
                              >
                              {option.isAddNewOption ? (
                                <Box sx={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: 1, 
                                  width: '100%',
                                  py: 0.5
                                }}>
                                  <ScienceIcon 
                                    sx={{ 
                                      color: 'secondary.main',
                                      fontSize: '1.2rem'
                                    }} 
                                  />
                                  <Typography 
                                    variant="body2" 
                                    sx={{ 
                                      fontWeight: 'bold',
                                      color: 'secondary.main'
                                    }}
                                  >
                                    {option.name}
                                  </Typography>
                                </Box>
                              ) : (
                                <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                      {option.code}
                                    </Typography>
                                    <Chip 
                                      size="small" 
                                      label={option.category}
                                      color={
                                        option.category === 'Witaminy' ? 'success' :
                                        option.category === 'Minerały' ? 'info' :
                                        option.category === 'Makroelementy' ? 'primary' :
                                        option.category === 'Energia' ? 'warning' :
                                        option.category === 'Składniki aktywne' ? 'secondary' :
                                        'default'
                                      }
                                      sx={{ ml: 'auto' }}
                                    />
                                  </Box>
                                  <Typography variant="body2" color="text.secondary">
                                    {option.name} ({option.unit})
                                  </Typography>
                                </Box>
                              )}
                              </Box>
                            );
                          }}
                          renderGroup={(params) => (
                            <Box key={`group-${params.group}-${params.key || 'default'}`}>
                              <Typography
                                variant="overline"
                                sx={{
                                  px: 2,
                                  py: 1,
                                  display: 'block',
                                  bgcolor: theme => theme.palette.mode === 'dark' 
                                    ? 'rgba(255, 255, 255, 0.08)' 
                                    : 'grey.100',
                                  color: theme => theme.palette.mode === 'dark'
                                    ? 'rgba(255, 255, 255, 0.9)'
                                    : 'rgba(0, 0, 0, 0.87)',
                                  fontWeight: 'bold',
                                  fontSize: '0.75rem'
                                }}
                              >
                                {params.group}
                              </Typography>
                              {params.children}
                            </Box>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          fullWidth
                          variant="standard"
                          value={micronutrient.name}
                          InputProps={{
                            readOnly: true
                          }}
                          sx={{ 
                            '& .MuiInputBase-input': { 
                              color: theme => theme.palette.text.secondary 
                            } 
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          fullWidth
                          variant="standard"
                          type="number"
                          value={micronutrient.quantity}
                          onChange={(e) => handleMicronutrientChange(index, 'quantity', e.target.value)}
                          inputProps={{ min: 0, step: 0.001 }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          fullWidth
                          variant="standard"
                          value={micronutrient.unit}
                          InputProps={{
                            readOnly: true
                          }}
                          sx={{ 
                            '& .MuiInputBase-input': { 
                              color: theme => theme.palette.text.secondary 
                            } 
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip 
                          size="small" 
                          color={
                            micronutrient.category === 'Witaminy' ? 'success' :
                            micronutrient.category === 'Minerały' ? 'info' :
                            micronutrient.category === 'Makroelementy' ? 'primary' :
                            micronutrient.category === 'Energia' ? 'warning' :
                            micronutrient.category === 'Składniki aktywne' ? 'secondary' :
                            'default'
                          } 
                          label={micronutrient.category} 
                          sx={{ borderRadius: '16px' }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          fullWidth
                          variant="standard"
                          value={micronutrient.notes || ''}
                          onChange={(e) => handleMicronutrientChange(index, 'notes', e.target.value)}
                          placeholder="Uwagi..."
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="Przesuń w górę">
                            <IconButton 
                              color="primary" 
                              onClick={() => moveMicronutrientUp(index)}
                              size="small"
                              disabled={index === 0}
                            >
                              <ArrowUpIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Przesuń w dół">
                            <IconButton 
                              color="primary" 
                              onClick={() => moveMicronutrientDown(index)}
                              size="small"
                              disabled={index === recipeData.micronutrients.length - 1}
                            >
                              <ArrowDownIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Usuń składnik">
                            <IconButton 
                              color="error" 
                              onClick={() => removeMicronutrient(index)}
                              size="small"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </Box>
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
              <ScienceIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body1" color="text.secondary" gutterBottom>
                {t('recipes.nutrients.noNutrients')} 
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('recipes.nutrients.noNutrientsHelpText')}
              </Typography>
            </Paper>
          )}
        </Box>
      </Paper>

      {/* Sekcja notatek dodatkowych */}
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
              : 'rgba(245, 247, 250, 0.8)'
          }}
        >
          <EditIcon color="primary" />
          <Typography variant="h6" fontWeight="500">Notatki dodatkowe</Typography>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <TextField
            label="Notatki"
            name="notes"
            value={recipeData.notes || ''}
            onChange={handleChange}
            fullWidth
            multiline
            rows={4}
            placeholder="Dodatkowe informacje, instrukcje, uwagi dotyczące receptury..."
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            helperText="Te notatki będą widoczne w szczegółach receptury i mogą zawierać instrukcje produkcyjne, uwagi o bezpieczeństwie lub inne istotne informacje."
          />
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

      {/* Dialog dodawania nowego składnika odżywczego */}
      <Dialog 
        open={addNutrientDialogOpen} 
        onClose={handleCloseAddNutrientDialog}
        maxWidth="sm"
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
          <ScienceIcon color="primary" />
          <DialogTitle sx={{ p: 0 }}>Dodaj nowy składnik odżywczy</DialogTitle>
        </Box>
        
        <DialogContent sx={{ mt: 2 }}>
          <DialogContentText sx={{ mb: 2 }}>
            Dodaj nowy składnik odżywczy do bazy danych. Po dodaniu będzie automatycznie dodany do receptury.
          </DialogContentText>
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                label="Kod składnika"
                value={newNutrientData.code}
                onChange={(e) => setNewNutrientData(prev => ({ ...prev, code: e.target.value }))}
                fullWidth
                required
                error={!newNutrientData.code}
                helperText={!newNutrientData.code ? 'Kod jest wymagany' : 'Krótki kod składnika (np. B12, Ca, OMEGA3)'}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                InputProps={{
                  startAdornment: (
                    <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                      <ScienceIcon fontSize="small" />
                    </Box>
                  )
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                label="Jednostka"
                value={newNutrientData.unit}
                onChange={(e) => setNewNutrientData(prev => ({ ...prev, unit: e.target.value }))}
                fullWidth
                required
                error={!newNutrientData.unit}
                helperText={!newNutrientData.unit ? 'Jednostka jest wymagana' : 'np. mg, µg, g, ml'}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="Nazwa składnika"
                value={newNutrientData.name}
                onChange={(e) => setNewNutrientData(prev => ({ ...prev, name: e.target.value }))}
                fullWidth
                required
                error={!newNutrientData.name}
                helperText={!newNutrientData.name ? 'Nazwa jest wymagana' : 'Pełna nazwa składnika'}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl fullWidth required sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
                <InputLabel id="category-select-label">Kategoria</InputLabel>
                <Select
                  labelId="category-select-label"
                  value={newNutrientData.category}
                  onChange={(e) => setNewNutrientData(prev => ({ ...prev, category: e.target.value }))}
                  label="Kategoria"
                  error={!newNutrientData.category}
                >
                  {Object.values(NUTRITIONAL_CATEGORIES).map((category) => (
                    <MenuItem key={category} value={category}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Chip 
                          size="small" 
                          label={category}
                          color={
                            category === 'Witaminy' ? 'success' :
                            category === 'Minerały' ? 'info' :
                            category === 'Makroelementy' ? 'primary' :
                            category === 'Energia' ? 'warning' :
                            category === 'Składniki aktywne' ? 'secondary' :
                            'default'
                          }
                        />
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
                <FormHelperText>
                  {!newNutrientData.category ? 'Kategoria jest wymagana' : ''}
                </FormHelperText>
              </FormControl>
            </Grid>
          </Grid>
        </DialogContent>
        
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button 
            onClick={handleCloseAddNutrientDialog}
            variant="outlined"
            sx={{ borderRadius: '8px' }}
          >
            Anuluj
          </Button>
          <Button 
            onClick={handleSaveNewNutrient} 
            variant="contained" 
            color="secondary"
            disabled={!newNutrientData.code || !newNutrientData.name || !newNutrientData.unit || !newNutrientData.category}
            startIcon={<ScienceIcon />}
            sx={{ 
              borderRadius: '8px', 
              boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
              px: 3
            }}
          >
            Dodaj składnik
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog dodawania receptury do listy cenowej */}
      <Dialog 
        open={addToPriceListDialogOpen} 
        onClose={handleClosePriceListDialog}
        maxWidth="sm"
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
          <DialogTitle sx={{ p: 0 }}>Dodaj recepturę do listy cenowej</DialogTitle>
        </Box>
        
        <DialogContent sx={{ mt: 2 }}>
          <DialogContentText sx={{ mb: 2 }}>
            Receptura "{recipeData.name}" została pomyślnie utworzona. Czy chcesz dodać ją do listy cenowej?
          </DialogContentText>
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl 
                fullWidth 
                required 
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                disabled={loadingPriceLists}
              >
                <InputLabel id="price-list-select-label">Lista cenowa</InputLabel>
                <Select
                  labelId="price-list-select-label"
                  value={priceListData.priceListId}
                  onChange={(e) => handlePriceListDataChange('priceListId', e.target.value)}
                  label="Lista cenowa"
                  error={!priceListData.priceListId}
                >
                  {loadingPriceLists ? (
                    <MenuItem disabled>
                      <CircularProgress size={20} sx={{ mr: 1 }} />
                      Ładowanie list cenowych...
                    </MenuItem>
                  ) : priceLists.length > 0 ? (
                    priceLists.map((priceList) => (
                      <MenuItem key={priceList.id} value={priceList.id}>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {priceList.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {priceList.customerName || 'Klient nieznany'}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))
                  ) : (
                    <MenuItem disabled>
                      Brak dostępnych list cenowych
                    </MenuItem>
                  )}
                </Select>
                <FormHelperText>
                  {!priceListData.priceListId ? 'Wybierz listę cenową' : ''}
                </FormHelperText>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                label="Cena jednostkowa (EUR)"
                type="number"
                value={priceListData.price}
                onChange={(e) => handlePriceListDataChange('price', parseFloat(e.target.value) || 0)}
                fullWidth
                required
                error={!priceListData.price || priceListData.price < 0}
                helperText={
                  !priceListData.price || priceListData.price < 0 
                    ? 'Wprowadź poprawną cenę' 
                    : `Za ${recipeData.yield?.unit || 'szt.'}`
                }
                inputProps={{ min: 0, step: 0.01 }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                InputProps={{
                  startAdornment: (
                    <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                      €
                    </Box>
                  )
                }}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                label="Jednostka"
                value={recipeData.yield?.unit || 'szt.'}
                fullWidth
                disabled
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                helperText="Jednostka z receptury"
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label="Notatki (opcjonalnie)"
                value={priceListData.notes}
                onChange={(e) => handlePriceListDataChange('notes', e.target.value)}
                fullWidth
                multiline
                rows={2}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                helperText="Dodatkowe informacje o cenie"
              />
            </Grid>
          </Grid>
        </DialogContent>
        
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button 
            onClick={handleSkipPriceList}
            variant="outlined"
            sx={{ borderRadius: '8px' }}
          >
            Pomiń
          </Button>
          <Button 
            onClick={handleAddToPriceList} 
            variant="contained" 
            color="primary"
            disabled={addingToPriceList || !priceListData.priceListId || !priceListData.price || priceListData.price < 0}
            startIcon={addingToPriceList ? <CircularProgress size={20} /> : <AddIcon />}
            sx={{ 
              borderRadius: '8px', 
              boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
              px: 3
            }}
          >
            {addingToPriceList ? 'Dodawanie...' : 'Dodaj do listy cenowej'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RecipeForm;