// src/components/recipes/RecipeForm.js
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  TableFooter,
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
  Grid,
  FormControlLabel,
  Checkbox,
  FormGroup
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
  KeyboardArrowDown as ArrowDownIcon,
  PhotoCamera as PhotoCameraIcon,
  DragIndicator as DragIndicatorIcon,
  Link as LinkIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { createRecipe, updateRecipe, getRecipeById, fixRecipeYield } from '../../services/recipeService';
import { getAllInventoryItems, getIngredientPrices, createInventoryItem, getAllWarehouses, getInventoryItemByRecipeId, updateInventoryItem } from '../../services/inventory';
import { getAllPriceLists, addPriceListItem, updateProductNameInPriceLists } from '../../services/priceListService';
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
// ✅ OPTYMALIZACJA: Import wspólnych stylów MUI
import { 
  flexCenter, 
  flexBetween,
  loadingContainer,
  mb1,
  mb2,
  mb3,
  mt1,
  mt2,
  mr1,
  p2
} from '../../styles/muiCommonStyles';
import RecipeDesignAttachments from './RecipeDesignAttachments';
import RecipeRulesAttachments from './RecipeRulesAttachments';
import { Gavel as GavelIcon } from '@mui/icons-material';

// Funkcja do generowania unikalnego ID składnika
const generateIngredientId = () => {
  return `ing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Komponent dla sortowalnego wiersza składnika z drag-and-drop
const SortableIngredientRow = ({ 
  ingredient, 
  index, 
  showDisplayUnits,
  displayUnits,
  handleIngredientChange,
  formatDisplayValue,
  getDisplayValue,
  getDisplayUnit,
  canConvertUnit,
  toggleIngredientUnit,
  removeIngredient,
  percentage,
  t
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ingredient._sortId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging && {
      opacity: 0.5,
      zIndex: 1000,
    }),
  };

  return (
    <TableRow 
      ref={setNodeRef}
      style={style}
      hover 
      sx={{ 
        '&:nth-of-type(even)': { 
          bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(30, 40, 60, 0.2)' : 'rgba(245, 247, 250, 0.5)' 
        },
        ...(isDragging && {
          bgcolor: 'action.selected',
          boxShadow: 3
        })
      }}
    >
      {/* Uchwyt do przeciągania */}
      <TableCell {...attributes} {...listeners} sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' }, width: '40px' }}>
        <DragIndicatorIcon 
          sx={{ 
            color: 'action.active',
          }} 
        />
      </TableCell>
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
      <TableCell align="center">
        <Typography variant="body2" color="text.secondary" fontWeight="500">
          {percentage !== null ? `${percentage.toFixed(2)}%` : '—'}
        </Typography>
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
  );
};

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
    nutritionalBasis: '1 caps', // Nowe pole dla podstawy składników odżywczych
    density: '', // Nowe pole dla gęstości produktu
    certifications: {
      halal: false,
      eco: false,
      vege: false,
      vegan: false,
      kosher: false
    }
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
  
  // Stany dla dialogu dodawania nowej pozycji magazynowej (składnika)
  const [addInventoryItemDialogOpen, setAddInventoryItemDialogOpen] = useState(false);
  const [newInventoryItemData, setNewInventoryItemData] = useState({
    name: '',
    description: '',
    category: 'Surowce',
    unit: 'kg',
    casNumber: '',
    barcode: '',
    location: ''
  });
  const [addingInventoryItem, setAddingInventoryItem] = useState(false);
  
  // Stany dla dialogu dodawania nowego składnika odżywczego
  const [addNutrientDialogOpen, setAddNutrientDialogOpen] = useState(false);
  const [newNutrientData, setNewNutrientData] = useState({
    code: '',
    name: '',
    unit: '',
    category: ''
  });
  
  // Stany dla dialogu powiązania z istniejącą pozycją magazynową
  const [linkInventoryDialogOpen, setLinkInventoryDialogOpen] = useState(false);
  const [linkingInventory, setLinkingInventory] = useState(false);
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [selectedInventoryItem, setSelectedInventoryItem] = useState(null);
  
  // Stany dla on-demand ładowania pozycji w dialogu powiązania
  const [linkDialogItems, setLinkDialogItems] = useState([]);
  const [linkDialogLoading, setLinkDialogLoading] = useState(false);
  const [linkDialogTotalCount, setLinkDialogTotalCount] = useState(0);
  const linkDialogSearchTimer = useRef(null);
  const linkDialogAllItems = useRef(null); // Cache wszystkich pozycji bez recipeId
  
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
  
  // Stan dla załączników designu
  const [designAttachments, setDesignAttachments] = useState([]);
  // Stan dla załączników zasad
  const [rulesAttachments, setRulesAttachments] = useState([]);
  
  // Stany dla dialogu synchronizacji nazwy z pozycją magazynową
  const [originalRecipeName, setOriginalRecipeName] = useState('');
  const [syncNameDialogOpen, setSyncNameDialogOpen] = useState(false);
  const [linkedInventoryItem, setLinkedInventoryItem] = useState(null);
  const [pendingRecipeData, setPendingRecipeData] = useState(null);
  const [syncingName, setSyncingName] = useState(false);

  // Sensory dla drag-and-drop
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Obliczanie sumy wagi (tylko kg/g) i procentowego udziału składników
  const ingredientsSummary = useMemo(() => {
    const ingredients = recipeData.ingredients;
    if (!ingredients || ingredients.length === 0) {
      return { totalWeight: 0, percentages: [], unitLabel: '' };
    }

    // Normalizuj ilości do gramów — tylko składniki w kg/g
    const normalizedQuantities = ingredients.map(ing => {
      const qty = parseFloat(ing.quantity) || 0;
      const unit = (ing.unit || '').toLowerCase().trim();
      if (unit === 'kg') return qty * 1000;
      if (unit === 'g') return qty;
      return null; // nie-wagowe składniki nie wchodzą do sumy
    });

    const totalGrams = normalizedQuantities.reduce((sum, q) => q !== null ? sum + q : sum, 0);

    // Procent obliczany tylko dla składników wagowych (kg/g)
    const percentages = normalizedQuantities.map(q => 
      q !== null && totalGrams > 0 ? (q / totalGrams) * 100 : null
    );

    // Wyświetlaj sumę w kg jeśli >= 1000g, inaczej w g
    const unitLabel = totalGrams >= 1000 ? 'kg' : 'g';
    const displayTotal = totalGrams >= 1000 ? totalGrams / 1000 : totalGrams;

    return { totalWeight: displayTotal, percentages, unitLabel };
  }, [recipeData.ingredients]);

  // Funkcja do obsługi zakończenia przeciągania składnika
  const handleIngredientDragEnd = (event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setRecipeData((prev) => {
      const oldIndex = prev.ingredients.findIndex((ing) => ing._sortId === active.id);
      const newIndex = prev.ingredients.findIndex((ing) => ing._sortId === over.id);

      return {
        ...prev,
        ingredients: arrayMove(prev.ingredients, oldIndex, newIndex),
      };
    });
  };

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
    showInfo(t('recipes.messages.ingredientUnitChanged', { name: ingredient.name, nextUnit, originalUnit: ingredient.unit }));
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
        showInfo(t('recipes.messages.costUnitChanged', { unit: altUnit }));
      }
    } else {
      // Jeśli już jest ustawiona, wyczyść
      setCostUnitDisplay(null);
      showInfo(t('recipes.messages.costUnitRestored'));
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
        showInfo(t('recipes.messages.timeUnitChanged', { unit: altUnit }));
      }
    } else {
      // Jeśli już jest ustawiona, wyczyść
      setTimeUnitDisplay(null);
      showInfo(t('recipes.messages.timeUnitRestored'));
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
          
          // Upewnij się, że ingredients mają _sortId do drag-and-drop
          const ingredientsWithSortIds = (recipe.ingredients || []).map((ingredient, index) => ({
            ...ingredient,
            _sortId: ingredient._sortId || generateIngredientId()
          }));
          
          // Upewnij się, że certifications istnieje z domyślnymi wartościami
          const certifications = recipe.certifications || {
            halal: false,
            eco: false,
            vege: false,
            vegan: false,
            kosher: false
          };
          
          const recipeWithMicronutrients = {
            ...recipe,
            ingredients: ingredientsWithSortIds,
            micronutrients: micronutrientsWithIds,
            certifications: certifications
          };
          
          setRecipeData(recipeWithMicronutrients);
          
          // Zapisz oryginalną nazwę dla wykrywania zmian
          setOriginalRecipeName(recipe.name);
          
          // Ustawiamy domyślne dane produktu na podstawie receptury
          setProductData(prev => ({
            ...prev,
            name: recipe.name,
            description: recipe.description || '',
            category: 'Gotowe produkty',
            unit: recipe.yield?.unit || 'szt.',
            recipeId: recipeId
          }));
          
          // Ustaw załączniki designu jeśli istnieją
          setDesignAttachments(recipe.designAttachments || []);
          // Ustaw załączniki zasad jeśli istnieją
          setRulesAttachments(recipe.rulesAttachments || []);
          
          // Sprawdź czy mamy otworzyć okno dodawania produktu
          if (location.state?.openProductDialog) {
            setCreateProductDialogOpen(true);
          }
        } catch (error) {
          showError(t('recipes.messages.fetchRecipeError', { error: error.message }));
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
        showError(t('recipes.messages.fetchInventoryError'));
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
        showError(t('recipes.messages.fetchCustomersError'));
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
        showError(t('recipes.messages.fetchWorkstationsError'));
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
      showError(t('recipes.messages.fetchPriceListsError'));
    } finally {
      setLoadingPriceLists(false);
    }
  };

  // Funkcja pomocnicza do zapisywania receptury
  const saveRecipe = async (recipeDataToSave, syncInventoryName = false) => {
    if (recipeId) {
      await updateRecipe(recipeId, recipeDataToSave, currentUser.uid);
      
      // Sprawdź czy nazwa się zmieniła
      const nameChanged = originalRecipeName !== '' && recipeData.name !== originalRecipeName;
      
      // Jeśli nazwa się zmieniła, automatycznie aktualizuj listy cenowe
      let priceListsUpdated = 0;
      if (nameChanged) {
        try {
          priceListsUpdated = await updateProductNameInPriceLists(recipeId, recipeData.name, currentUser.uid);
        } catch (error) {
          console.warn('Nie udało się zaktualizować nazwy w listach cenowych:', error);
        }
      }
      
      // Jeśli trzeba zsynchronizować nazwę z pozycją magazynową
      if (syncInventoryName && linkedInventoryItem) {
        await updateInventoryItem(linkedInventoryItem.id, {
          name: recipeData.name
        }, currentUser.uid);
        
        if (priceListsUpdated > 0) {
          showSuccess(t('recipes.messages.recipeInventoryAndPriceListsUpdated', { priceListsCount: priceListsUpdated }));
        } else {
          showSuccess(t('recipes.messages.recipeAndInventoryUpdated'));
        }
      } else {
        if (priceListsUpdated > 0) {
          showSuccess(t('recipes.messages.recipeAndPriceListsUpdated', { priceListsCount: priceListsUpdated }));
        } else {
          showSuccess(t('recipes.messages.recipeUpdated'));
        }
      }
      
      navigate(`/recipes/${recipeId}`);
    } else {
      const newRecipe = await createRecipe(recipeDataToSave, currentUser.uid);
      setNewRecipeId(newRecipe.id);
      showSuccess(t('recipes.messages.recipeCreated'));
      
      // Pokaż dialog pytający o dodanie do listy cenowej
      await fetchPriceLists();
      setAddToPriceListDialogOpen(true);
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
      
      // Usuń pole _sortId ze składników przed zapisem (używane tylko do drag-and-drop)
      const ingredientsForSave = recipeData.ingredients.map(({ _sortId, ...rest }) => rest);
      
      // Dodaj załączniki designu i zasad do danych receptury
      const recipeDataWithAttachments = {
        ...recipeData,
        ingredients: ingredientsForSave,
        designAttachments: designAttachments,
        rulesAttachments: rulesAttachments
      };
      
      // Sprawdź czy to edycja i czy nazwa się zmieniła
      if (recipeId && recipeData.name !== originalRecipeName && originalRecipeName !== '') {
        // Sprawdź czy jest powiązana pozycja magazynowa
        try {
          const linkedItem = await getInventoryItemByRecipeId(recipeId);
          
          if (linkedItem) {
            // Zapisz dane i pokaż dialog
            setPendingRecipeData(recipeDataWithAttachments);
            setLinkedInventoryItem(linkedItem);
            setSyncNameDialogOpen(true);
            setSaving(false);
            return; // Przerwij - użytkownik zdecyduje w dialogu
          }
        } catch (error) {
          console.warn('Nie udało się sprawdzić powiązanej pozycji magazynowej:', error);
          // Kontynuuj normalny zapis jeśli nie udało się sprawdzić
        }
      }
      
      // Normalny zapis bez synchronizacji
      await saveRecipe(recipeDataWithAttachments, false);
    } catch (error) {
      showError(t('recipes.messages.saveError', { error: error.message }));
      console.error('Error saving recipe:', error);
    } finally {
      setSaving(false);
    }
  };

  // Obsługa dialogu synchronizacji nazwy - zapisz bez synchronizacji
  const handleSaveWithoutSync = async () => {
    setSyncNameDialogOpen(false);
    setSyncingName(true);
    
    try {
      await saveRecipe(pendingRecipeData, false);
    } catch (error) {
      showError(t('recipes.messages.saveError', { error: error.message }));
      console.error('Error saving recipe:', error);
    } finally {
      setSyncingName(false);
      setPendingRecipeData(null);
      setLinkedInventoryItem(null);
    }
  };

  // Obsługa dialogu synchronizacji nazwy - zapisz z synchronizacją
  const handleSaveWithSync = async () => {
    setSyncNameDialogOpen(false);
    setSyncingName(true);
    
    try {
      await saveRecipe(pendingRecipeData, true);
    } catch (error) {
      showError(t('recipes.messages.saveError', { error: error.message }));
      console.error('Error saving recipe:', error);
    } finally {
      setSyncingName(false);
      setPendingRecipeData(null);
      setLinkedInventoryItem(null);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setRecipeData(prev => ({ ...prev, [name]: value }));
  };

  const handleCertificationChange = (certName) => (e) => {
    setRecipeData(prev => ({
      ...prev,
      certifications: {
        ...prev.certifications,
        [certName]: e.target.checked
      }
    }));
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
      _sortId: generateIngredientId(),
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

  // Funkcja do obsługi dodawania nowej pozycji magazynowej
  const handleAddNewInventoryItem = async () => {
    if (!newInventoryItemData.name.trim()) {
      showError(t('recipes.ingredients.newItemDialog.nameRequired'));
      return;
    }

    try {
      setAddingInventoryItem(true);
      
      // Przygotuj dane pozycji magazynowej
      const itemData = {
        name: newInventoryItemData.name.trim(),
        description: newInventoryItemData.description.trim(),
        category: newInventoryItemData.category,
        unit: newInventoryItemData.unit,
        casNumber: newInventoryItemData.casNumber.trim(),
        barcode: newInventoryItemData.barcode.trim(),
        location: newInventoryItemData.location.trim(),
        minStock: 0,
        maxStock: 0,
        minOrderQuantity: 0
      };
      
      // Utwórz nową pozycję magazynową
      const result = await createInventoryItem(itemData, currentUser.uid);
      
      showSuccess(t('recipes.messages.inventoryItemAdded', { name: result.name }));
      
      // Odśwież listę pozycji magazynowych
      const items = await getAllInventoryItems();
      setInventoryItems(items);
      
      // Automatycznie dodaj nowo utworzoną pozycję do składników receptury
      const newIngredient = {
        _sortId: generateIngredientId(),
        id: result.id,
        name: result.name,
        quantity: '',
        unit: result.unit || 'g',
        notes: '',
        casNumber: result.casNumber || ''
      };
      
      setRecipeData({
        ...recipeData,
        ingredients: [...recipeData.ingredients, newIngredient]
      });
      
      // Zamknij dialog i zresetuj formularz
      setAddInventoryItemDialogOpen(false);
      setNewInventoryItemData({
        name: '',
        description: '',
        category: 'Surowce',
        unit: 'kg',
        casNumber: '',
        barcode: '',
        location: ''
      });
      
    } catch (error) {
      showError(t('recipes.messages.addInventoryItemError', { error: error.message }));
      console.error('Error adding inventory item:', error);
    } finally {
      setAddingInventoryItem(false);
    }
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
      showError(t('recipes.messages.fixYieldError'));
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
      showError(t('recipes.messages.productSkuAndLocationRequired'));
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
      
      showSuccess(t('recipes.messages.productCreated', { name: createdProduct.name, warehouse: selectedWarehouse?.name || '' }));
      setCreateProductDialogOpen(false);
      
      // Odśwież listę składników, aby nowo utworzony produkt był widoczny
      const updatedItems = await getAllInventoryItems();
      setInventoryItems(updatedItems);
      
    } catch (error) {
      showError(t('recipes.messages.createProductError', { error: error.message }));
      console.error('Error creating product:', error);
    } finally {
      setCreatingProduct(false);
    }
  };

  // Funkcja do powiązania istniejącej pozycji magazynowej z recepturą
  const handleLinkExistingInventoryItem = async () => {
    if (!selectedInventoryItem) {
      showError(t('recipes.linkInventoryDialog.selectItemError'));
      return;
    }
    
    // Jeśli pozycja jest już powiązana z inną recepturą - potwierdź nadpisanie
    if (selectedInventoryItem.recipeId) {
      const confirmOverwrite = window.confirm(
        `Pozycja "${selectedInventoryItem.name}" jest powiązana z recepturą "${selectedInventoryItem.recipeInfo?.name || 'nieznaną'}". Czy na pewno chcesz nadpisać to powiązanie?`
      );
      if (!confirmOverwrite) return;
    }
    
    try {
      setLinkingInventory(true);
      
      // Aktualizuj pozycję magazynową - dodaj/nadpisz recipeId i recipeInfo
      await updateInventoryItem(selectedInventoryItem.id, {
        name: selectedInventoryItem.name, // Wymagane przez walidator
        recipeId: recipeId,
        recipeInfo: {
          name: recipeData.name,
          yield: recipeData.yield,
          version: recipeData.version || 1
        },
        isFinishedProduct: true
      }, currentUser.uid);
      
      showSuccess(t('recipes.linkInventoryDialog.successMessage', { itemName: selectedInventoryItem.name }));
      setLinkInventoryDialogOpen(false);
      setSelectedInventoryItem(null);
      setInventorySearchQuery('');
      
      // Odśwież listę pozycji magazynowych
      const updatedItems = await getAllInventoryItems();
      setInventoryItems(updatedItems);
      
    } catch (error) {
      showError(t('recipes.linkInventoryDialog.errorMessage', { error: error.message }));
      console.error('Error linking inventory item:', error);
    } finally {
      setLinkingInventory(false);
    }
  };

  // On-demand ładowanie pozycji magazynowych dla dialogu powiązania
  const fetchLinkDialogItems = useCallback(async (searchQuery = '') => {
    try {
      setLinkDialogLoading(true);
      
      // Pobierz i zcachuj pozycje "Gotowe produkty" (tylko raz na otwarcie dialogu)
      // Wyklucz pozycje już powiązane z AKTUALNĄ recepturą (nie ma sensu przypisywać ponownie)
      if (!linkDialogAllItems.current) {
        const allItems = await getAllInventoryItems();
        linkDialogAllItems.current = allItems
          .filter(item => 
            (item.category === 'Gotowe produkty' || item.category === 'Produkty gotowe' || item.isFinishedProduct === true) &&
            item.recipeId !== recipeId // Wyklucz tylko pozycje już powiązane z TĄ recepturą
          )
          // Sortuj: wolne pozycje na górze, powiązane z inną recepturą na dole
          .sort((a, b) => {
            const aLinked = !!a.recipeId;
            const bLinked = !!b.recipeId;
            if (aLinked !== bLinked) return aLinked ? 1 : -1;
            return (a.name || '').localeCompare(b.name || '', 'pl');
          });
      }
      
      const allAvailable = linkDialogAllItems.current;
      
      // Filtruj po wyszukiwaniu
      let filtered = allAvailable;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        filtered = allAvailable.filter(item => 
          item.name?.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          item.category?.toLowerCase().includes(q) ||
          item.recipeInfo?.name?.toLowerCase().includes(q)
        );
      }
      
      setLinkDialogTotalCount(filtered.length);
      setLinkDialogItems(filtered.slice(0, 100)); // Pokaż do 100 wyników
    } catch (error) {
      console.error('Błąd ładowania pozycji dla dialogu powiązania:', error);
      showError(t('recipes.messages.loadInventoryItemsError'));
    } finally {
      setLinkDialogLoading(false);
    }
  }, [showError]);
  
  // Debounced wyszukiwanie w dialogu powiązania
  const handleLinkDialogSearch = useCallback((searchValue) => {
    setInventorySearchQuery(searchValue);
    
    // Wyczyść poprzedni timer
    if (linkDialogSearchTimer.current) {
      clearTimeout(linkDialogSearchTimer.current);
    }
    
    // Ustaw nowy timer z debounce 300ms
    linkDialogSearchTimer.current = setTimeout(() => {
      fetchLinkDialogItems(searchValue);
    }, 300);
  }, [fetchLinkDialogItems]);
  
  // Ładuj pozycje przy otwarciu dialogu
  useEffect(() => {
    if (linkInventoryDialogOpen) {
      linkDialogAllItems.current = null; // Wyczyść cache przy każdym otwarciu
      fetchLinkDialogItems('');
    } else {
      // Wyczyść przy zamknięciu
      setLinkDialogItems([]);
      setLinkDialogTotalCount(0);
      linkDialogAllItems.current = null;
    }
    
    // Cleanup timer
    return () => {
      if (linkDialogSearchTimer.current) {
        clearTimeout(linkDialogSearchTimer.current);
      }
    };
  }, [linkInventoryDialogOpen, fetchLinkDialogItems]);

  // Dodajemy przyciski do zarządzania powiązaniem z magazynem
  const renderInventoryLinkButtons = () => {
    // Przyciski dostępne tylko przy edycji istniejącej receptury
    if (!recipeId) return null;
    
    return (
      <Box sx={{ display: 'flex', gap: 1, ml: 2 }}>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<ProductIcon />}
          onClick={() => setCreateProductDialogOpen(true)}
        >
          {t('recipes.inventoryButtons.createNew')}
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<LinkIcon />}
          onClick={() => setLinkInventoryDialogOpen(true)}
        >
          {t('recipes.inventoryButtons.linkExisting')}
        </Button>
      </Box>
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
    
    showSuccess(t('recipes.messages.ingredientLinked', { name: ingredientName }));
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
        showInfo(t('recipes.messages.allIngredientsLinked'));
      }
    } catch (error) {
      showError(t('recipes.messages.linkIngredientsError', { error: error.message }));
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
        
        showSuccess(t('recipes.messages.casSynced', { count: syncedCount }));
      }
      
      if (skippedCount > 0) {
        showInfo(t('recipes.messages.casSkipped', { count: skippedCount }));
      }
      
      if (syncedCount === 0) {
        showInfo(t('recipes.messages.noCasToUpdate'));
      }
    } catch (error) {
      showError(t('recipes.messages.casSyncError', { error: error.message }));
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
        showError(t('recipes.messages.allFieldsRequired'));
        return;
      }

      // Dodaj składnik do bazy danych
      await addNutritionalComponent({
        ...newNutrientData,
        isActive: true
      });
      
      showSuccess(t('recipes.messages.nutrientAdded'));
      
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
      showError(t('recipes.messages.addNutrientError'));
    }
  };

  // Funkcje do obsługi dialogu dodawania do listy cenowej
  const handleClosePriceListDialog = () => {
    setAddToPriceListDialogOpen(false);
    setPriceListData({ priceListId: '', price: 0, notes: '' });
    
    // Przekieruj do strony edycji receptury z parametrem do automatycznego otwarcia dialogu produktu
    if (newRecipeId) {
      navigate(`/recipes/${newRecipeId}/edit`, { state: { openProductDialog: true } });
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
      showError(t('recipes.messages.selectPriceList'));
      return;
    }

    if (!priceListData.price || priceListData.price < 0) {
      showError(t('recipes.messages.enterValidPrice'));
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
      showSuccess(t('recipes.messages.addedToPriceList'));
      handleClosePriceListDialog();
    } catch (error) {
      console.error('Błąd podczas dodawania do listy cenowej:', error);
      showError(t('recipes.messages.addToPriceListError', { error: error.message }));
    } finally {
      setAddingToPriceList(false);
    }
  };

  const handleSkipPriceList = () => {
    handleClosePriceListDialog();
  };

  if (loading) {
    return <div>{t('recipes.details.loading')}</div>;
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
          {recipeId && renderInventoryLinkButtons()}
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
            
            <Grid item xs={12} sm={6}>
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
            
            <Grid item xs={12} sm={6}>
              <TextField
                name="density"
                label={t('recipes.density')}
                value={recipeData.density}
                onChange={handleChange}
                fullWidth
                type="number"
                inputProps={{
                  step: "0.01",
                  min: "0"
                }}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                helperText={t('recipes.densityHelpText')}
                InputProps={{
                  startAdornment: (
                    <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                      <ScienceIcon fontSize="small" />
                    </Box>
                  ),
                }}
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
          </Grid>
        </Box>
      </Paper>

      {/* Sekcja certyfikacji */}
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
          <ScienceIcon color="primary" />
          <Typography variant="h6" fontWeight="500">{t('recipes.certifications.title')}</Typography>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <FormGroup row sx={{ gap: 3 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={recipeData.certifications?.halal || false}
                  onChange={handleCertificationChange('halal')}
                  color="primary"
                />
              }
              label={t('recipes.certifications.halal')}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={recipeData.certifications?.eco || false}
                  onChange={handleCertificationChange('eco')}
                  color="primary"
                />
              }
              label={t('recipes.certifications.eco')}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={recipeData.certifications?.vege || false}
                  onChange={handleCertificationChange('vege')}
                  color="primary"
                />
              }
              label={t('recipes.certifications.vege')}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={recipeData.certifications?.vegan || false}
                  onChange={handleCertificationChange('vegan')}
                  color="primary"
                />
              }
              label={t('recipes.certifications.vegan')}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={recipeData.certifications?.kosher || false}
                  onChange={handleCertificationChange('kosher')}
                  color="primary"
                />
              }
              label={t('recipes.certifications.kosher')}
            />
          </FormGroup>
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
            <InventoryIcon color="primary" sx={mr1} />
            <Typography variant="h6" fontWeight="500">{t('recipes.ingredients.title')}</Typography>
          </Box>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
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
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => setAddInventoryItemDialogOpen(true)}
              sx={{ borderRadius: '20px' }}
            >
              {t('recipes.ingredients.addNewInventoryItem')}
            </Button>
            <Typography variant="caption" color="text.secondary">
              {t('recipes.ingredients.addNewInventoryItemHelper')}
            </Typography>
          </Box>
          
          <Box sx={mb3}>
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
                    startAdornment: <InventoryIcon color="action" sx={mr1} />
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
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleIngredientDragEnd}>
              <TableContainer sx={{ borderRadius: '8px', border: '1px solid', borderColor: 'divider' }}>
                <Table>
                  <TableHead sx={{ bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(30, 40, 60, 0.6)' : 'rgba(240, 245, 250, 0.8)' }}>
                    <TableRow>
                      <TableCell width="3%"></TableCell>
                      <TableCell width="20%"><Typography variant="subtitle2">{t('recipes.ingredients.ingredientSKU')}</Typography></TableCell>
                      <TableCell width="13%"><Typography variant="subtitle2">{t('recipes.ingredients.quantity')}</Typography></TableCell>
                      <TableCell width="8%"><Typography variant="subtitle2">{t('recipes.ingredients.unit')}</Typography></TableCell>
                      <TableCell width="7%" align="center"><Typography variant="subtitle2">{t('recipes.ingredients.percentage')}</Typography></TableCell>
                      <TableCell width="14%">
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
                      <TableCell width="12%"><Typography variant="subtitle2">{t('recipes.ingredients.notes')}</Typography></TableCell>
                      <TableCell width="10%"><Typography variant="subtitle2">{t('recipes.ingredients.source')}</Typography></TableCell>
                      <TableCell width="5%"><Typography variant="subtitle2">{t('recipes.ingredients.actions')}</Typography></TableCell>
                    </TableRow>
                  </TableHead>
                  <SortableContext items={recipeData.ingredients.map(ing => ing._sortId)} strategy={verticalListSortingStrategy}>
                    <TableBody>
                      {recipeData.ingredients.map((ingredient, index) => (
                        <SortableIngredientRow
                          key={ingredient._sortId}
                          ingredient={ingredient}
                          index={index}
                          showDisplayUnits={showDisplayUnits}
                          displayUnits={displayUnits}
                          handleIngredientChange={handleIngredientChange}
                          formatDisplayValue={formatDisplayValue}
                          getDisplayValue={getDisplayValue}
                          getDisplayUnit={getDisplayUnit}
                          canConvertUnit={canConvertUnit}
                          toggleIngredientUnit={toggleIngredientUnit}
                          removeIngredient={removeIngredient}
                          percentage={ingredientsSummary.percentages[index] ?? null}
                          t={t}
                        />
                      ))}
                    </TableBody>
                  </SortableContext>
                  {/* Wiersz podsumowania - suma wagi i 100% */}
                  <TableFooter>
                    <TableRow sx={{ 
                      bgcolor: theme => theme.palette.mode === 'dark' ? 'rgba(30, 40, 60, 0.8)' : 'rgba(232, 240, 254, 0.8)',
                      '& td': { borderBottom: 'none' }
                    }}>
                      <TableCell />
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight="700">
                          {t('recipes.ingredients.totalWeight')}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight="700">
                          {ingredientsSummary.totalWeight % 1 === 0 
                            ? ingredientsSummary.totalWeight 
                            : ingredientsSummary.totalWeight.toFixed(4)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="subtitle2" fontWeight="700">
                          {ingredientsSummary.unitLabel}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Typography variant="subtitle2" fontWeight="700">
                          {ingredientsSummary.totalWeight > 0 ? '100%' : '—'}
                        </Typography>
                      </TableCell>
                      <TableCell colSpan={4} />
                    </TableRow>
                  </TableFooter>
                </Table>
              </TableContainer>
            </DndContext>
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
            <ScienceIcon color="secondary" sx={mr1} />
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
          <Box sx={mb3}>
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

      {/* Sekcja załączników designu - kompaktowa */}
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
            p: 1.5, 
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
          <PhotoCameraIcon color="primary" sx={{ fontSize: 20 }} />
          <Typography variant="subtitle1" fontWeight="500">Załączniki designu produktu</Typography>
        </Box>
        
        <Box sx={{ p: 2 }}>
          <RecipeDesignAttachments
            recipeId={recipeId || 'temp'}
            attachments={designAttachments}
            onAttachmentsChange={setDesignAttachments}
            disabled={saving}
            showTitle={false}
            compact={true}
          />
        </Box>
      </Paper>

      {/* Sekcja załączników zasad */}
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
            p: 1.5, 
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
          <GavelIcon color="primary" sx={{ fontSize: 20 }} />
          <Typography variant="subtitle1" fontWeight="500">{t('recipes.rulesAttachments.title')}</Typography>
        </Box>
        
        <Box sx={{ p: 2 }}>
          <RecipeRulesAttachments
            recipeId={recipeId || 'temp'}
            attachments={rulesAttachments}
            onAttachmentsChange={setRulesAttachments}
            disabled={saving}
            showTitle={false}
            compact={true}
          />
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
          <Typography variant="h6" fontWeight="500">{t('recipes.additionalNotes')}</Typography>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <TextField
            label={t('common.notes')}
            name="notes"
            value={recipeData.notes || ''}
            onChange={handleChange}
            fullWidth
            multiline
            rows={4}
            placeholder="Dodatkowe informacje, instrukcje, uwagi dotyczące receptury..."
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            helperText={t('recipes.additionalNotesHelper')}
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
          <DialogTitle sx={{ p: 0 }}>{t('recipes.createProductDialog.title')}</DialogTitle>
        </Box>
        
        <DialogContent sx={mt2}>
          <DialogContentText sx={mb2}>
            {t('recipes.createProductDialog.description')}
          </DialogContentText>
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                name="name"
                label={t('recipes.createProductDialog.productSKU')}
                value={productData.name}
                onChange={handleProductDataChange}
                fullWidth
                required
                error={!productData.name}
                helperText={!productData.name ? t('recipes.createProductDialog.skuRequired') : ''}
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
                <InputLabel id="warehouse-select-label">{t('recipes.createProductDialog.location')}</InputLabel>
                <Select
                  labelId="warehouse-select-label"
                  id="warehouse-select"
                  name="warehouseId"
                  value={productData.warehouseId}
                  onChange={handleProductDataChange}
                  label={t('recipes.createProductDialog.location')}
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
                label={t('recipes.createProductDialog.productDescription')}
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
                label={t('recipes.createProductDialog.category')}
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
                <InputLabel id="unit-select-label">{t('recipes.createProductDialog.unit')}</InputLabel>
                <Select
                  labelId="unit-select-label"
                  id="unit-select"
                  name="unit"
                  value={productData.unit}
                  onChange={handleProductDataChange}
                  label={t('recipes.createProductDialog.unit')}
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
                label={t('recipes.createProductDialog.initialQuantity')}
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
                label={t('recipes.createProductDialog.minLevel')}
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
                label={t('recipes.createProductDialog.optimalLevel')}
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
            {t('recipes.createProductDialog.cancel')}
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
            {creatingProduct ? t('recipes.createProductDialog.saving') : t('recipes.createProductDialog.addToInventory')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog powiązania z istniejącą pozycją magazynową */}
      <Dialog 
        open={linkInventoryDialogOpen} 
        onClose={() => {
          setLinkInventoryDialogOpen(false);
          setSelectedInventoryItem(null);
          setInventorySearchQuery('');
        }}
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
          <LinkIcon color="secondary" />
          <DialogTitle sx={{ p: 0 }}>{t('recipes.linkInventoryDialog.title')}</DialogTitle>
        </Box>
        
        <DialogContent sx={{ mt: 2 }}>
          <DialogContentText sx={{ mb: 2 }}>
            {t('recipes.linkInventoryDialog.description')}
          </DialogContentText>
          
          {/* Wyszukiwarka */}
          <TextField
            fullWidth
            placeholder={t('recipes.linkInventoryDialog.searchPlaceholder')}
            value={inventorySearchQuery}
            onChange={(e) => handleLinkDialogSearch(e.target.value)}
            sx={{ mb: 1, '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} />,
              endAdornment: linkDialogLoading ? <CircularProgress size={20} /> : null
            }}
          />
          
          {/* Info o ilości wyników */}
          {!linkDialogLoading && linkDialogTotalCount > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
              {linkDialogTotalCount > 100 
                ? t('recipes.linkInventoryDialog.showing100of', { total: linkDialogTotalCount })
                : t('recipes.linkInventoryDialog.foundItems', { count: linkDialogTotalCount })
              }
            </Typography>
          )}
          
          {/* Lista pozycji magazynowych */}
          <Box sx={{ 
            maxHeight: 400, 
            overflow: 'auto',
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: '8px'
          }}>
            {linkDialogLoading && linkDialogItems.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center' }}>
                <CircularProgress size={32} />
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {t('recipes.linkInventoryDialog.loadingItems')}
                </Typography>
              </Box>
            ) : linkDialogItems.length === 0 ? (
              <Box sx={{ p: 3, textAlign: 'center', color: 'text.secondary' }}>
                {inventorySearchQuery 
                  ? t('recipes.linkInventoryDialog.noResults')
                  : t('recipes.linkInventoryDialog.noAvailableItems')
                }
              </Box>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox"></TableCell>
                    <TableCell>{t('recipes.linkInventoryDialog.columns.name')}</TableCell>
                    <TableCell>{t('recipes.linkInventoryDialog.columns.unit')}</TableCell>
                    <TableCell>{t('recipes.linkInventoryDialog.linkStatus')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {linkDialogItems.map((item) => (
                    <TableRow 
                      key={item.id}
                      hover
                      selected={selectedInventoryItem?.id === item.id}
                      onClick={() => setSelectedInventoryItem(item)}
                      sx={{ 
                        cursor: 'pointer',
                        opacity: item.recipeId ? 0.75 : 1
                      }}
                    >
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedInventoryItem?.id === item.id}
                          onChange={() => setSelectedInventoryItem(
                            selectedInventoryItem?.id === item.id ? null : item
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {item.name}
                        </Typography>
                      </TableCell>
                      <TableCell>{item.unit || '-'}</TableCell>
                      <TableCell>
                        {item.recipeId ? (
                          <Chip 
                            label={item.recipeInfo?.name || t('recipes.linkInventoryDialog.otherRecipe')} 
                            size="small" 
                            color="warning"
                            variant="outlined"
                            sx={{ maxWidth: 200 }}
                          />
                        ) : (
                          <Chip 
                            label={t('recipes.linkInventoryDialog.available')} 
                            size="small" 
                            color="success"
                            variant="outlined"
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Box>
          
          {/* Informacja o wybranej pozycji */}
          {selectedInventoryItem && (
            <>
              <Alert severity={selectedInventoryItem.recipeId ? "warning" : "info"} sx={{ mt: 2 }}>
                {selectedInventoryItem.recipeId ? (
                  <>
                    {t('recipes.linkInventoryDialog.alreadyLinkedWarning', { 
                      name: selectedInventoryItem.name, 
                      recipeName: selectedInventoryItem.recipeInfo?.name || t('recipes.linkInventoryDialog.otherRecipe') 
                    })}
                  </>
                ) : (
                  <>
                    {t('recipes.linkInventoryDialog.selectedItem')}: <strong>{selectedInventoryItem.name}</strong>
                  </>
                )}
              </Alert>
            </>
          )}
        </DialogContent>
        
        <DialogActions sx={{ p: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button 
            onClick={() => {
              setLinkInventoryDialogOpen(false);
              setSelectedInventoryItem(null);
              setInventorySearchQuery('');
            }}
            sx={{ borderRadius: '8px' }}
          >
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleLinkExistingInventoryItem} 
            variant="contained" 
            color="secondary"
            disabled={linkingInventory || !selectedInventoryItem}
            startIcon={linkingInventory ? <CircularProgress size={20} /> : <LinkIcon />}
            sx={{ 
              borderRadius: '8px', 
              boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
              px: 3
            }}
          >
            {linkingInventory 
              ? t('recipes.linkInventoryDialog.linking') 
              : t('recipes.linkInventoryDialog.linkButton')
            }
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
          <DialogTitle sx={{ p: 0 }}>{t('recipes.addNutrientDialog.title')}</DialogTitle>
        </Box>
        
        <DialogContent sx={mt2}>
          <DialogContentText sx={mb2}>
            {t('recipes.addNutrientDialog.description')}
          </DialogContentText>
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12} md={6}>
              <TextField
                label={t('recipes.addNutrientDialog.code')}
                value={newNutrientData.code}
                onChange={(e) => setNewNutrientData(prev => ({ ...prev, code: e.target.value }))}
                fullWidth
                required
                error={!newNutrientData.code}
                helperText={!newNutrientData.code ? t('recipes.addNutrientDialog.codeRequired') : t('recipes.addNutrientDialog.codeHelper')}
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
                label={t('recipes.addNutrientDialog.unit')}
                value={newNutrientData.unit}
                onChange={(e) => setNewNutrientData(prev => ({ ...prev, unit: e.target.value }))}
                fullWidth
                required
                error={!newNutrientData.unit}
                helperText={!newNutrientData.unit ? t('recipes.addNutrientDialog.unitRequired') : t('recipes.addNutrientDialog.unitHelper')}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label={t('recipes.addNutrientDialog.name')}
                value={newNutrientData.name}
                onChange={(e) => setNewNutrientData(prev => ({ ...prev, name: e.target.value }))}
                fullWidth
                required
                error={!newNutrientData.name}
                helperText={!newNutrientData.name ? t('recipes.addNutrientDialog.nameRequired') : t('recipes.addNutrientDialog.nameHelper')}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              />
            </Grid>
            
            <Grid item xs={12}>
              <FormControl fullWidth required sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
                <InputLabel id="category-select-label">{t('recipes.addNutrientDialog.category')}</InputLabel>
                <Select
                  labelId="category-select-label"
                  value={newNutrientData.category}
                  onChange={(e) => setNewNutrientData(prev => ({ ...prev, category: e.target.value }))}
                  label={t('recipes.addNutrientDialog.category')}
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
                  {!newNutrientData.category ? t('recipes.addNutrientDialog.categoryRequired') : ''}
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
            {t('recipes.addNutrientDialog.cancel')}
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
            {t('recipes.addNutrientDialog.addButton')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog dodawania nowej pozycji magazynowej */}
      <Dialog 
        open={addInventoryItemDialogOpen} 
        onClose={() => setAddInventoryItemDialogOpen(false)}
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
          <InventoryIcon color="primary" />
          <DialogTitle sx={{ p: 0 }}>{t('recipes.ingredients.newItemDialog.title')}</DialogTitle>
        </Box>
        
        <DialogContent sx={mt2}>
          <DialogContentText sx={mb2}>
            {t('recipes.ingredients.newItemDialog.description')}
          </DialogContentText>
          <Alert severity="info" sx={{ mb: 2 }}>
            <strong>{t('recipes.ingredients.newItemDialog.alertTitle')}</strong> {t('recipes.ingredients.newItemDialog.alertMessage')}
          </Alert>
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                label={t('recipes.ingredients.newItemDialog.nameSKU')}
                value={newInventoryItemData.name}
                onChange={(e) => setNewInventoryItemData({ ...newInventoryItemData, name: e.target.value })}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                autoFocus
                placeholder={t('recipes.ingredients.newItemDialog.namePlaceholder')}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth required sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
                <InputLabel>{t('recipes.ingredients.newItemDialog.category')}</InputLabel>
                <Select
                  value={newInventoryItemData.category}
                  onChange={(e) => setNewInventoryItemData({ ...newInventoryItemData, category: e.target.value })}
                  label={t('recipes.ingredients.newItemDialog.category')}
                >
                  <MenuItem value="Surowce">{t('recipes.ingredients.newItemDialog.categoryRawMaterials')}</MenuItem>
                  <MenuItem value="Opakowania zbiorcze">{t('recipes.ingredients.newItemDialog.categoryCollectivePackaging')}</MenuItem>
                  <MenuItem value="Opakowania jednostkowe">{t('recipes.ingredients.newItemDialog.categoryIndividualPackaging')}</MenuItem>
                  <MenuItem value="Gotowe produkty">{t('recipes.ingredients.newItemDialog.categoryFinishedProducts')}</MenuItem>
                  <MenuItem value="Inne">{t('recipes.ingredients.newItemDialog.categoryOther')}</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <FormControl fullWidth required sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}>
                <InputLabel>{t('recipes.ingredients.newItemDialog.unit')}</InputLabel>
                <Select
                  value={newInventoryItemData.unit}
                  onChange={(e) => setNewInventoryItemData({ ...newInventoryItemData, unit: e.target.value })}
                  label={t('recipes.ingredients.newItemDialog.unit')}
                >
                  <MenuItem value="szt.">szt.</MenuItem>
                  <MenuItem value="kg">kg</MenuItem>
                  <MenuItem value="caps">caps</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('recipes.ingredients.newItemDialog.description')}
                value={newInventoryItemData.description}
                onChange={(e) => setNewInventoryItemData({ ...newInventoryItemData, description: e.target.value })}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                multiline
                rows={2}
                placeholder={t('recipes.ingredients.newItemDialog.descriptionPlaceholder')}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={t('recipes.ingredients.newItemDialog.casNumber')}
                value={newInventoryItemData.casNumber}
                onChange={(e) => setNewInventoryItemData({ ...newInventoryItemData, casNumber: e.target.value })}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                placeholder={t('recipes.ingredients.newItemDialog.casPlaceholder')}
                helperText={t('recipes.ingredients.newItemDialog.casHelper')}
              />
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label={t('recipes.ingredients.newItemDialog.barcode')}
                value={newInventoryItemData.barcode}
                onChange={(e) => setNewInventoryItemData({ ...newInventoryItemData, barcode: e.target.value })}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                placeholder={t('recipes.ingredients.newItemDialog.barcodePlaceholder')}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('recipes.ingredients.newItemDialog.location')}
                value={newInventoryItemData.location}
                onChange={(e) => setNewInventoryItemData({ ...newInventoryItemData, location: e.target.value })}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                placeholder={t('recipes.ingredients.newItemDialog.locationPlaceholder')}
                helperText={t('recipes.ingredients.newItemDialog.locationHelper')}
              />
            </Grid>
          </Grid>
        </DialogContent>
        
        <DialogActions sx={{
          p: 2,
          bgcolor: theme => theme.palette.mode === 'dark' 
            ? 'rgba(25, 35, 55, 0.3)' 
            : 'rgba(245, 247, 250, 0.5)',
          borderTop: '1px solid',
          borderColor: 'divider'
        }}>
          <Button 
            onClick={() => setAddInventoryItemDialogOpen(false)} 
            variant="outlined" 
            color="inherit"
            disabled={addingInventoryItem}
            sx={{ borderRadius: '8px' }}
          >
            {t('recipes.ingredients.newItemDialog.cancel')}
          </Button>
          <Button 
            onClick={handleAddNewInventoryItem} 
            variant="contained" 
            color="primary"
            disabled={addingInventoryItem || !newInventoryItemData.name.trim() || !newInventoryItemData.category || !newInventoryItemData.unit}
            startIcon={addingInventoryItem ? <CircularProgress size={20} /> : <AddIcon />}
            sx={{ 
              borderRadius: '8px', 
              boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
              px: 3
            }}
          >
            {addingInventoryItem ? t('recipes.ingredients.newItemDialog.adding') : t('recipes.ingredients.newItemDialog.addButton')}
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
          <DialogTitle sx={{ p: 0 }}>{t('recipes.priceListDialog.title')}</DialogTitle>
        </Box>
        
        <DialogContent sx={mt2}>
          <DialogContentText sx={mb2}>
            {t('recipes.priceListDialog.description', { name: recipeData.name })}
          </DialogContentText>
          
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl 
                fullWidth 
                required 
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                disabled={loadingPriceLists}
              >
                <InputLabel id="price-list-select-label">{t('recipes.priceListDialog.priceList')}</InputLabel>
                <Select
                  labelId="price-list-select-label"
                  value={priceListData.priceListId}
                  onChange={(e) => handlePriceListDataChange('priceListId', e.target.value)}
                  label={t('recipes.priceListDialog.priceList')}
                  error={!priceListData.priceListId}
                >
                  {loadingPriceLists ? (
                    <MenuItem disabled>
                      <CircularProgress size={20} sx={mr1} />
                      {t('recipes.priceListDialog.loadingPriceLists')}
                    </MenuItem>
                  ) : priceLists.length > 0 ? (
                    priceLists.map((priceList) => (
                      <MenuItem key={priceList.id} value={priceList.id}>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {priceList.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {priceList.customerName || t('recipes.priceListDialog.unknownCustomer')}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))
                  ) : (
                    <MenuItem disabled>
                      {t('recipes.priceListDialog.noPriceLists')}
                    </MenuItem>
                  )}
                </Select>
                <FormHelperText>
                  {!priceListData.priceListId ? t('recipes.priceListDialog.selectPriceList') : ''}
                </FormHelperText>
              </FormControl>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <TextField
                label={t('recipes.priceListDialog.unitPrice')}
                type="number"
                value={priceListData.price}
                onChange={(e) => handlePriceListDataChange('price', parseFloat(e.target.value) || 0)}
                fullWidth
                required
                error={!priceListData.price || priceListData.price < 0}
                helperText={
                  !priceListData.price || priceListData.price < 0 
                    ? t('recipes.priceListDialog.enterValidPrice') 
                    : t('recipes.priceListDialog.perUnit', { unit: recipeData.yield?.unit || 'szt.' })
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
                label={t('recipes.priceListDialog.unit')}
                value={recipeData.yield?.unit || 'szt.'}
                fullWidth
                disabled
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                helperText={t('recipes.priceListDialog.unitFromRecipe')}
              />
            </Grid>
            
            <Grid item xs={12}>
              <TextField
                label={t('recipes.priceListDialog.notes')}
                value={priceListData.notes}
                onChange={(e) => handlePriceListDataChange('notes', e.target.value)}
                fullWidth
                multiline
                rows={2}
                sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
                helperText={t('recipes.priceListDialog.notesHelper')}
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
            {t('recipes.priceListDialog.skip')}
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
            {addingToPriceList ? t('recipes.priceListDialog.adding') : t('recipes.priceListDialog.addButton')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog synchronizacji nazwy z pozycją magazynową */}
      <Dialog 
        open={syncNameDialogOpen} 
        onClose={() => !syncingName && setSyncNameDialogOpen(false)}
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
          <SyncIcon color="primary" />
          <DialogTitle sx={{ p: 0 }}>{t('recipes.syncNameDialog.title')}</DialogTitle>
        </Box>
        
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('recipes.syncNameDialog.nameChangeDetected')} "<strong>{originalRecipeName}</strong>" {t('recipes.syncNameDialog.to')} "<strong>{recipeData.name}</strong>".
          </Alert>
          
          <Typography sx={{ mb: 1 }}>
            {t('recipes.syncNameDialog.linkedInventoryInfo')}
          </Typography>
          
          <Paper 
            elevation={0} 
            sx={{ 
              p: 2, 
              mb: 2, 
              bgcolor: theme => theme.palette.mode === 'dark' 
                ? 'rgba(255,255,255,0.05)' 
                : 'rgba(0,0,0,0.03)',
              borderRadius: '8px',
              border: '1px solid',
              borderColor: 'divider'
            }}
          >
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <InventoryIcon color="action" />
              <Typography variant="body1" fontWeight="medium">
                {linkedInventoryItem?.name}
              </Typography>
            </Box>
          </Paper>
          
          <Typography>
            {t('recipes.syncNameDialog.syncQuestion')}
          </Typography>
        </DialogContent>
        
        <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
          <Button 
            onClick={handleSaveWithoutSync}
            variant="outlined"
            disabled={syncingName}
            sx={{ borderRadius: '8px' }}
          >
            {t('recipes.syncNameDialog.keepOldName')}
          </Button>
          <Button 
            onClick={handleSaveWithSync} 
            variant="contained" 
            color="primary"
            disabled={syncingName}
            startIcon={syncingName ? <CircularProgress size={20} /> : <SyncIcon />}
            sx={{ 
              borderRadius: '8px', 
              boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
              px: 3
            }}
          >
            {syncingName ? t('recipes.syncNameDialog.updating') : t('recipes.syncNameDialog.syncNames')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RecipeForm;