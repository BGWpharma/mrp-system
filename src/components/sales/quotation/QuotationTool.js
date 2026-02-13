/**
 * Narzędzie do wyceny klientów - styl arkusza kalkulacyjnego
 * 
 * Funkcjonalności:
 * - Dodawanie komponentów (surowców) z procentową zawartością
 * - Wybór opakowania
 * - Automatyczne obliczanie czasu pracy na podstawie gramatury
 * - Kalkulacja COGS (koszt komponentów + opakowanie + praca)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  Button,
  Autocomplete,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  InputAdornment,
  Divider,
  Alert,
  CircularProgress,
  Tooltip,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  Card,
  CardContent,
  FormControlLabel,
  Checkbox,
  useTheme,
  useMediaQuery
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  Calculate as CalculateIcon,
  Inventory as InventoryIcon,
  LocalShipping as PackagingIcon,
  AccessTime as TimeIcon,
  Euro as EuroIcon,
  Edit as EditIcon,
  Info as InfoIcon,
  FolderOpen as LoadIcon,
  History as HistoryIcon,
  MenuBook as RecipeIcon,
  ContentCopy as CopyIcon
} from '@mui/icons-material';
import { useTranslation } from '../../../hooks/useTranslation';
import { useNotification } from '../../../hooks/useNotification';
import { useAuth } from '../../../hooks/useAuth';
import {
  getRawMaterials,
  getPackagingItems,
  getCurrentCostPerMinute,
  calculateQuotation,
  calculateTotalWeight,
  calculateLaborTime,
  calculateLaborCostByFormat,
  saveQuotation,
  updateQuotation,
  deleteQuotation,
  getAllQuotations,
  getAutoPackWeight,
  searchRecipesForQuotation,
  getRecipeForQuotation,
  DEFAULT_COST_PER_MINUTE
} from '../../../services/quotationService';

// Jednostki dostępne dla komponentów
const AVAILABLE_UNITS = [
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'mg', label: 'mg' },
  { value: 'µg', label: 'µg' },
  { value: 'l', label: 'l' },
  { value: 'ml', label: 'ml' },
  { value: 'szt.', label: 'szt.' },
  { value: 'caps', label: 'caps' }
];

const QuotationTool = () => {
  const { t } = useTranslation('invoices');
  const { showNotification } = useNotification();
  const { currentUser } = useAuth();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

  // Stan danych źródłowych
  const [rawMaterials, setRawMaterials] = useState([]);
  const [packagingItems, setPackagingItems] = useState([]);
  const [costPerMinute, setCostPerMinute] = useState(DEFAULT_COST_PER_MINUTE);
  const [costPerMinuteSource, setCostPerMinuteSource] = useState(null); // Źródło kosztu/min
  const [loading, setLoading] = useState(true);

  // Stan wyceny
  const [quotationId, setQuotationId] = useState(null); // ID edytowanej wyceny (null = nowa)
  const [quotationName, setQuotationName] = useState('');
  const [components, setComponents] = useState([]);
  const [packaging, setPackaging] = useState(null);
  const [packagingQuantity, setPackagingQuantity] = useState(1);
  const [flavored, setFlavored] = useState(false);    // Produkt smakowy
  const [customTargetTimeSec, setCustomTargetTimeSec] = useState(null); // Nadpisany czas/szt (null = z matrycy)

  // Stan kalkulacji
  const [calculatedQuotation, setCalculatedQuotation] = useState(null);
  const [calculating, setCalculating] = useState(false);

  // Stan zapisanych wycen
  const [savedQuotations, setSavedQuotations] = useState([]);
  const [loadingQuotations, setLoadingQuotations] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quotationsDialog, setQuotationsDialog] = useState(false);
  const [deleteConfirmDialog, setDeleteConfirmDialog] = useState(null);

  // Dialog dodawania nowego komponentu ręcznego
  const [manualComponentDialog, setManualComponentDialog] = useState(false);
  const [manualComponent, setManualComponent] = useState({
    name: '',
    quantity: '',
    unit: 'g',
    unitPrice: ''
  });

  // Dialog wczytywania z receptury
  const [recipeDialog, setRecipeDialog] = useState(false);
  const [recipeSearchTerm, setRecipeSearchTerm] = useState('');
  const [recipeSearchResults, setRecipeSearchResults] = useState([]);
  const [recipeSearchLoading, setRecipeSearchLoading] = useState(false);
  const [recipeLoading, setRecipeLoading] = useState(false);

  // Ładowanie danych początkowych
  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [materials, packagings, costMinData] = await Promise.all([
        getRawMaterials(),
        getPackagingItems(),
        getCurrentCostPerMinute()
      ]);
      
      setRawMaterials(materials);
      setPackagingItems(packagings);
      
      // costMinData to obiekt { costPerMinute, source, hasData }
      // Jeśli są dane z kosztów zakładu, użyj ich; w przeciwnym razie zostaw DEFAULT_COST_PER_MINUTE
      if (costMinData.hasData && costMinData.costPerMinute > 0) {
        setCostPerMinute(costMinData.costPerMinute);
        setCostPerMinuteSource(costMinData.source || null);
      } else {
        setCostPerMinuteSource(null);
      }
    } catch (error) {
      console.error('Błąd ładowania danych:', error);
      showNotification(t('quotation.errors.loadData', 'Błąd podczas ładowania danych'), 'error');
    } finally {
      setLoading(false);
    }
  };

  // Ładowanie zapisanych wycen
  const loadSavedQuotations = async () => {
    setLoadingQuotations(true);
    try {
      const quotations = await getAllQuotations();
      setSavedQuotations(quotations);
    } catch (error) {
      console.error('Błąd ładowania wycen:', error);
      showNotification(t('quotation.errors.loadQuotations', 'Błąd podczas ładowania zapisanych wycen'), 'error');
    } finally {
      setLoadingQuotations(false);
    }
  };

  // Zapisywanie wyceny
  const handleSaveQuotation = async () => {
    if (!quotationName.trim()) {
      showNotification(t('quotation.errors.nameRequired', 'Podaj nazwę wyceny'), 'warning');
      return;
    }

    if (components.length === 0) {
      showNotification(t('quotation.errors.noComponents', 'Dodaj co najmniej jeden komponent'), 'warning');
      return;
    }

    setSaving(true);
    try {
      const quotationData = {
        name: quotationName.trim(),
        components: components.map(c => ({
          inventoryItemId: c.inventoryItemId,
          name: c.name,
          quantity: parseFloat(c.quantity) || 0,
          unit: c.unit,
          unitPrice: parseFloat(c.unitPrice) || 0,
          isManual: c.isManual || false,
          hasBatchPrice: c.hasBatchPrice
        })),
        packaging: packaging ? {
          inventoryItemId: packaging.id,
          name: packaging.name,
          category: packaging.category,
          unitPrice: parseFloat(packaging.unitPrice) || 0,
          quantity: packagingQuantity
        } : null,
        packWeight: effectivePackWeight,
        flavored,
        costPerMinute,
        customTargetTimeSec,
        summary: quickCalculation
      };

      if (quotationId) {
        // Aktualizacja istniejącej wyceny
        await updateQuotation(quotationId, quotationData);
        showNotification(t('quotation.updated', 'Wycena została zaktualizowana'), 'success');
      } else {
        // Zapisanie nowej wyceny
        const newId = await saveQuotation(quotationData, currentUser?.uid);
        setQuotationId(newId);
        showNotification(t('quotation.saved', 'Wycena została zapisana'), 'success');
      }
    } catch (error) {
      console.error('Błąd zapisu wyceny:', error);
      showNotification(t('quotation.errors.save', 'Błąd podczas zapisywania wyceny'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // Ładowanie wyceny do edycji
  const handleLoadQuotation = (quotation) => {
    setQuotationId(quotation.id);
    setQuotationName(quotation.name || '');
    
    // Odtwórz komponenty z dodatkowymi danymi z rawMaterials
    const loadedComponents = (quotation.components || []).map(c => {
      const inventoryItem = rawMaterials.find(m => m.id === c.inventoryItemId);
      return {
        id: Date.now().toString() + Math.random(),
        inventoryItemId: c.inventoryItemId,
        name: c.name,
        quantity: c.quantity,
        unit: c.unit,
        unitPrice: c.unitPrice,
        isManual: c.isManual || false,
        hasBatchPrice: inventoryItem?.hasBatchPrice ?? c.hasBatchPrice
      };
    });
    setComponents(loadedComponents);

    // Odtwórz opakowanie
    if (quotation.packaging) {
      const packagingItem = packagingItems.find(p => p.id === quotation.packaging.inventoryItemId);
      if (packagingItem) {
        setPackaging({
          ...packagingItem,
          unitPrice: quotation.packaging.unitPrice
        });
      } else {
        setPackaging({
          id: quotation.packaging.inventoryItemId,
          name: quotation.packaging.name,
          category: quotation.packaging.category,
          unitPrice: quotation.packaging.unitPrice
        });
      }
      setPackagingQuantity(quotation.packaging.quantity || 1);
    } else {
      setPackaging(null);
      setPackagingQuantity(1);
    }

    // Ustaw koszt/minutę jeśli zapisany
    if (quotation.costPerMinute) {
      setCostPerMinute(quotation.costPerMinute);
    }

    // Ustaw format produktu (flavored)
    setFlavored(quotation.flavored ?? false);

    // Ustaw nadpisany czas/szt. (null = z matrycy)
    setCustomTargetTimeSec(quotation.customTargetTimeSec ?? null);

    setQuotationsDialog(false);
    showNotification(t('quotation.loaded', 'Wycena została załadowana'), 'success');
  };

  // Duplikowanie wyceny
  const handleDuplicateQuotation = (quotation) => {
    handleLoadQuotation(quotation);
    setQuotationId(null); // Reset ID aby zapisać jako nową
    setQuotationName(`${quotation.name} (kopia)`);
    showNotification(t('quotation.duplicated', 'Wycena zduplikowana - zapisz jako nową'), 'info');
  };

  // Usuwanie wyceny
  const handleDeleteQuotation = async (quotationToDelete) => {
    try {
      await deleteQuotation(quotationToDelete.id);
      setSavedQuotations(prev => prev.filter(q => q.id !== quotationToDelete.id));
      
      // Jeśli usuwamy aktualnie edytowaną wycenę, resetuj
      if (quotationId === quotationToDelete.id) {
        handleReset();
      }
      
      setDeleteConfirmDialog(null);
      showNotification(t('quotation.deleted', 'Wycena została usunięta'), 'success');
    } catch (error) {
      console.error('Błąd usuwania wyceny:', error);
      showNotification(t('quotation.errors.delete', 'Błąd podczas usuwania wyceny'), 'error');
    }
  };

  // Otwórz dialog z zapisanymi wycenami
  const handleOpenQuotationsDialog = async () => {
    setQuotationsDialog(true);
    await loadSavedQuotations();
  };

  // Obliczanie wartości w czasie rzeczywistym
  const totalGramatura = useMemo(() => {
    return calculateTotalWeight(components);
  }, [components]);

  // Auto-detekcja formatu opakowania z gramatury surowców
  const effectivePackWeight = useMemo(() => {
    return getAutoPackWeight(totalGramatura);
  }, [totalGramatura]);

  // Koszt pracy: tryb matrycy formatu (pack weight) lub fallback (gramatura)
  // Formuła: (targetTimeSec / 60) * costPerMinute * quantity
  const laborCalculation = useMemo(() => {
    const formatLabor = calculateLaborCostByFormat(effectivePackWeight, flavored, packagingQuantity, costPerMinute, customTargetTimeSec);
    if (formatLabor) {
      return {
        laborCost: formatLabor.laborCostTotal,
        estimatedMinutes: formatLabor.estimatedMinutes,
        targetTimeSec: formatLabor.targetTimeSec,
        matrixTargetTimeSec: formatLabor.matrixTargetTimeSec,
        costPerMinute,
        timeOverridden: formatLabor.timeOverridden,
        source: 'format'
      };
    }
    const estimatedMinutes = calculateLaborTime(totalGramatura);
    return {
      laborCost: estimatedMinutes * costPerMinute,
      estimatedMinutes,
      targetTimeSec: null,
      matrixTargetTimeSec: null,
      costPerMinute,
      timeOverridden: false,
      source: 'gramatura'
    };
  }, [components, effectivePackWeight, flavored, packagingQuantity, totalGramatura, costPerMinute, customTargetTimeSec]);

  // Szybka kalkulacja bez zapytań do API
  const quickCalculation = useMemo(() => {
    let componentsCost = 0;
    components.forEach(comp => {
      const qty = parseFloat(comp.quantity) || 0;
      const price = parseFloat(comp.unitPrice) || 0;
      componentsCost += qty * price;
    });

    const packagingCost = packaging 
      ? (parseFloat(packaging.unitPrice) || 0) * packagingQuantity 
      : 0;

    const laborCost = laborCalculation.laborCost;

    return {
      componentsCost: parseFloat(componentsCost.toFixed(2)),
      packagingCost: parseFloat(packagingCost.toFixed(2)),
      laborCost: parseFloat(laborCost.toFixed(2)),
      totalCOGS: parseFloat((componentsCost + packagingCost + laborCost).toFixed(2)),
      laborSource: laborCalculation.source
    };
  }, [components, packaging, packagingQuantity, laborCalculation]);

  // Dodawanie komponentu z magazynu
  const handleAddComponent = () => {
    setComponents(prev => [...prev, {
      id: Date.now().toString(),
      inventoryItemId: null,
      name: '',
      quantity: '',
      unit: 'g',
      unitPrice: 0,
      isManual: false
    }]);
  };

  // Aktualizacja komponentu
  const handleComponentChange = (index, field, value) => {
    setComponents(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Wybór komponentu z magazynu
  const handleSelectInventoryItem = (index, item) => {
    if (!item) {
      handleComponentChange(index, 'inventoryItemId', null);
      handleComponentChange(index, 'name', '');
      handleComponentChange(index, 'unitPrice', 0);
      handleComponentChange(index, 'unit', 'g');
      handleComponentChange(index, 'hasBatchPrice', null);
      return;
    }
    
    setComponents(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        inventoryItemId: item.id,
        name: item.name,
        unitPrice: item.unitPrice || 0,
        unit: item.unit || 'kg',
        isManual: false,
        hasBatchPrice: item.hasBatchPrice // Flaga czy cena pochodzi z partii
      };
      return updated;
    });
  };

  // Usuwanie komponentu
  const handleRemoveComponent = (index) => {
    setComponents(prev => prev.filter((_, i) => i !== index));
  };

  // Dodawanie komponentu ręcznego
  const handleAddManualComponent = () => {
    if (!manualComponent.name || !manualComponent.quantity || !manualComponent.unitPrice) {
      showNotification(t('quotation.errors.fillAllFields', 'Wypełnij wszystkie pola'), 'warning');
      return;
    }

    setComponents(prev => [...prev, {
      id: Date.now().toString(),
      inventoryItemId: null,
      name: manualComponent.name,
      quantity: parseFloat(manualComponent.quantity),
      unit: manualComponent.unit,
      unitPrice: parseFloat(manualComponent.unitPrice),
      isManual: true
    }]);

    setManualComponent({ name: '', quantity: '', unit: 'g', unitPrice: '' });
    setManualComponentDialog(false);
    showNotification(t('quotation.componentAdded', 'Komponent dodany'), 'success');
  };

  // ==================== WCZYTYWANIE Z RECEPTURY ====================

  // Debounced wyszukiwanie receptur
  const recipeSearchTimerRef = React.useRef(null);

  const handleRecipeSearch = useCallback((term) => {
    setRecipeSearchTerm(term);
    
    if (recipeSearchTimerRef.current) {
      clearTimeout(recipeSearchTimerRef.current);
    }

    recipeSearchTimerRef.current = setTimeout(async () => {
      setRecipeSearchLoading(true);
      try {
        const results = await searchRecipesForQuotation(term, 15);
        setRecipeSearchResults(results);
      } catch (error) {
        console.error('Błąd wyszukiwania receptur:', error);
      } finally {
        setRecipeSearchLoading(false);
      }
    }, 300);
  }, []);

  // Otwieranie dialogu - załaduj ostatnie receptury
  const handleOpenRecipeDialog = useCallback(async () => {
    setRecipeDialog(true);
    setRecipeSearchTerm('');
    setRecipeSearchLoading(true);
    try {
      const results = await searchRecipesForQuotation('', 15);
      setRecipeSearchResults(results);
    } catch (error) {
      console.error('Błąd ładowania receptur:', error);
    } finally {
      setRecipeSearchLoading(false);
    }
  }, []);

  // Załadowanie składników z wybranej receptury
  const handleLoadFromRecipe = useCallback(async (recipe) => {
    if (!recipe?.id) return;
    
    setRecipeLoading(true);
    try {
      const fullRecipe = await getRecipeForQuotation(recipe.id);
      const ingredients = fullRecipe.ingredients || [];

      if (ingredients.length === 0) {
        showNotification(t('quotation.recipeNoIngredients', 'Receptura nie zawiera składników'), 'warning');
        setRecipeLoading(false);
        return;
      }

      // Rozdziel składniki: surowce vs opakowania jednostkowe
      const componentIngredients = [];
      let foundPackaging = null;

      ingredients.forEach(ing => {
        // Sprawdź czy składnik to opakowanie jednostkowe
        const packMatch = packagingItems.find(p => 
          (ing.id && p.id === ing.id) || 
          (ing.itemId && p.id === ing.itemId) ||
          (ing.name && p.name === ing.name)
        );

        if (packMatch) {
          // Pierwsze znalezione opakowanie ustawiamy w sekcji opakowanie
          if (!foundPackaging) {
            foundPackaging = {
              item: packMatch,
              quantity: parseInt(ing.quantity) || 1
            };
          }
          return; // Nie dodawaj do komponentów
        }

        // Szukaj dopasowania w surowcach
        const rawMatch = rawMaterials.find(m => 
          (ing.id && m.id === ing.id) || 
          (ing.itemId && m.id === ing.itemId) ||
          (ing.name && m.name === ing.name)
        );

        componentIngredients.push({
          id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
          inventoryItemId: rawMatch?.id || ing.id || null,
          name: ing.name || '',
          quantity: parseFloat(ing.quantity) || 0,
          unit: ing.unit || 'g',
          unitPrice: rawMatch?.unitPrice || 0,
          isManual: !rawMatch,
          hasBatchPrice: rawMatch?.hasBatchPrice ?? null
        });
      });

      setComponents(componentIngredients);

      // Ustaw opakowanie jeśli znaleziono
      if (foundPackaging) {
        setPackaging(foundPackaging.item);
        setPackagingQuantity(foundPackaging.quantity);
      }
      
      // Ustaw nazwę wyceny z nazwy receptury jeśli pusta
      if (!quotationName.trim()) {
        setQuotationName(fullRecipe.name || '');
      }

      setRecipeDialog(false);
      const matchedCount = componentIngredients.filter(c => !c.isManual).length;
      const parts = [];
      parts.push(t('quotation.recipeLoadedComponents', '{{count}} składników', { count: componentIngredients.length }));
      if (foundPackaging) {
        parts.push(t('quotation.recipeLoadedPackaging', '+ opakowanie: {{name}}', { name: foundPackaging.item.name }));
      }
      showNotification(parts.join(' '), 'success');
    } catch (error) {
      console.error('Błąd ładowania receptury:', error);
      showNotification(t('quotation.errors.loadRecipe', 'Błąd podczas ładowania receptury'), 'error');
    } finally {
      setRecipeLoading(false);
    }
  }, [rawMaterials, packagingItems, quotationName, showNotification, t]);

  // Wybór opakowania
  const handleSelectPackaging = (item) => {
    setPackaging(item);
  };

  // Pełna kalkulacja z pobieraniem cen
  const handleCalculate = async () => {
    if (components.length === 0) {
      showNotification(t('quotation.errors.noComponents', 'Dodaj co najmniej jeden komponent'), 'warning');
      return;
    }

    setCalculating(true);
    try {
      const result = await calculateQuotation({
        components,
        packaging: packaging ? {
          inventoryItemId: packaging.id,
          name: packaging.name,
          unitPrice: packaging.unitPrice,
          quantity: packagingQuantity
        } : null,
        packWeight: effectivePackWeight,
        flavored,
        customCostPerMinute: costPerMinute,
        customTargetTimeSec
      });

      setCalculatedQuotation(result);
      showNotification(t('quotation.calculated', 'Wycena obliczona'), 'success');
    } catch (error) {
      console.error('Błąd kalkulacji:', error);
      showNotification(t('quotation.errors.calculate', 'Błąd podczas obliczania wyceny'), 'error');
    } finally {
      setCalculating(false);
    }
  };

  // Reset wyceny
  const handleReset = () => {
    setQuotationId(null);
    setQuotationName('');
    setComponents([]);
    setPackaging(null);
    setPackagingQuantity(1);
    setFlavored(false);
    setCustomTargetTimeSec(null);
    setCalculatedQuotation(null);
  };

  // Obliczanie procentu dla komponentu
  const getComponentPercentage = (component) => {
    if (totalGramatura === 0) return 0;
    const qty = parseFloat(component.quantity) || 0;
    
    // Konwersja do gramów
    let grams = qty;
    const unit = (component.unit || '').toLowerCase();
    if (unit === 'kg') grams = qty * 1000;
    else if (unit === 'mg') grams = qty / 1000;
    else if (unit === 'µg' || unit === 'ug' || unit === 'mcg') grams = qty / 1000000;
    
    return ((grams / totalGramatura) * 100).toFixed(1);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: isMobile ? 1 : 2 }}>
      {/* Nagłówek */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CalculateIcon />
            {t('quotation.title', 'Narzędzie wyceny COGS')}
          </Typography>
          {quotationId && (
            <Chip 
              size="small" 
              label={t('quotation.editing', 'Edycja')} 
              color="primary" 
              variant="outlined"
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button
            variant="outlined"
            startIcon={<LoadIcon />}
            onClick={handleOpenQuotationsDialog}
            size={isMobile ? 'small' : 'medium'}
          >
            {t('quotation.load', 'Wczytaj')}
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={handleReset}
            size={isMobile ? 'small' : 'medium'}
          >
            {t('quotation.reset', 'Nowa')}
          </Button>
          <Button
            variant="outlined"
            color="success"
            startIcon={saving ? <CircularProgress size={20} /> : <SaveIcon />}
            onClick={handleSaveQuotation}
            disabled={saving || !quotationName.trim() || components.length === 0}
            size={isMobile ? 'small' : 'medium'}
          >
            {quotationId ? t('quotation.update', 'Aktualizuj') : t('quotation.save', 'Zapisz')}
          </Button>
          <Button
            variant="contained"
            startIcon={calculating ? <CircularProgress size={20} /> : <CalculateIcon />}
            onClick={handleCalculate}
            disabled={calculating || components.length === 0}
            size={isMobile ? 'small' : 'medium'}
          >
            {t('quotation.calculate', 'Oblicz')}
          </Button>
        </Box>
      </Box>

      {/* Nazwa wyceny */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <TextField
          fullWidth
          label={t('quotation.name', 'Nazwa wyceny')}
          value={quotationName}
          onChange={(e) => setQuotationName(e.target.value)}
          placeholder={t('quotation.namePlaceholder', 'np. Wycena kapsułek witamina C')}
          size="small"
          required
          error={!quotationName.trim() && components.length > 0}
          helperText={!quotationName.trim() && components.length > 0 ? t('quotation.nameRequired', 'Podaj nazwę aby zapisać wycenę') : ''}
        />
      </Paper>

      {/* Sekcja komponentów */}
      <Paper sx={{ p: 2, mb: 2, borderLeft: '4px solid', borderLeftColor: 'primary.main', borderRadius: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider' }}>
          <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 600 }}>
            <InventoryIcon fontSize="small" color="primary" />
            {t('quotation.components', 'Komponenty (Surowce)')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<RecipeIcon />}
              onClick={handleOpenRecipeDialog}
              color="info"
            >
              {t('quotation.loadFromRecipe', 'Z receptury')}
            </Button>
            <Button
              variant="outlined"
              size="small"
              startIcon={<AddIcon />}
              onClick={() => setManualComponentDialog(true)}
            >
              {t('quotation.addManual', '+ Nowy ręczny')}
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              onClick={handleAddComponent}
            >
              {t('quotation.addComponent', 'Dodaj')}
            </Button>
          </Box>
        </Box>

        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& .MuiTableCell-head': { fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'text.secondary', borderBottom: 2, borderColor: 'primary.main', py: 1.5 } }}>
                <TableCell sx={{ minWidth: 200 }}>{t('quotation.table.sku', 'SKU')}</TableCell>
                <TableCell sx={{ width: 80 }} align="center">{t('quotation.table.percentage', '%')}</TableCell>
                <TableCell sx={{ width: 100 }}>{t('quotation.table.quantity', 'Ilość')}</TableCell>
                <TableCell sx={{ width: 80 }}>{t('quotation.table.unit', 'Jedn.')}</TableCell>
                <TableCell sx={{ width: 120 }}>{t('quotation.table.unitPrice', 'Cena/jedn.')}</TableCell>
                <TableCell sx={{ width: 100 }} align="right">{t('quotation.table.cost', 'Koszt')}</TableCell>
                <TableCell sx={{ width: 50 }}></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {components.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    {t('quotation.noComponents', 'Brak komponentów. Kliknij "Dodaj" aby dodać pierwszy komponent.')}
                  </TableCell>
                </TableRow>
              ) : (
                components.map((component, index) => (
                  <TableRow key={component.id} hover>
                    {/* SKU / Nazwa */}
                    <TableCell>
                      {component.isManual ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Chip size="small" label="Ręczny" color="warning" variant="outlined" />
                          <Typography variant="body2">{component.name}</Typography>
                        </Box>
                      ) : (
                        <Autocomplete
                          size="small"
                          options={rawMaterials}
                          getOptionLabel={(option) => option.name || ''}
                          value={rawMaterials.find(m => m.id === component.inventoryItemId) || null}
                          onChange={(_, newValue) => handleSelectInventoryItem(index, newValue)}
                          renderOption={({ key, ...props }, option) => (
                            <Box component="li" key={key} {...props} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" sx={{ flex: 1 }}>{option.name}</Typography>
                              {option.hasBatchPrice ? (
                                <Chip 
                                  size="small" 
                                  label={`${option.unitPrice.toFixed(2)} €/${option.unit}`} 
                                  color="success" 
                                  variant="outlined"
                                  sx={{ fontSize: '0.7rem', height: 20 }}
                                />
                              ) : (
                                <Chip 
                                  size="small" 
                                  label={t('quotation.noBatchPrice', 'Brak ceny')} 
                                  color="warning" 
                                  variant="outlined"
                                  sx={{ fontSize: '0.7rem', height: 20 }}
                                />
                              )}
                            </Box>
                          )}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              placeholder={t('quotation.selectComponent', 'Wybierz surowiec...')}
                              variant="outlined"
                            />
                          )}
                          sx={{ minWidth: 180 }}
                        />
                      )}
                    </TableCell>

                    {/* Procent */}
                    <TableCell align="center">
                      <Typography variant="body2" color="primary" fontWeight="medium">
                        {getComponentPercentage(component)}%
                      </Typography>
                    </TableCell>

                    {/* Ilość */}
                    <TableCell>
                      <TextField
                        size="small"
                        type="number"
                        value={component.quantity}
                        onChange={(e) => handleComponentChange(index, 'quantity', e.target.value)}
                        inputProps={{ min: 0, step: 0.001 }}
                        sx={{ width: 90 }}
                      />
                    </TableCell>

                    {/* Jednostka */}
                    <TableCell>
                      <Select
                        size="small"
                        value={component.unit}
                        onChange={(e) => handleComponentChange(index, 'unit', e.target.value)}
                        sx={{ width: 70 }}
                      >
                        {AVAILABLE_UNITS.map(u => (
                          <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>
                        ))}
                      </Select>
                    </TableCell>

                    {/* Cena jednostkowa */}
                    <TableCell>
                      <Tooltip 
                        title={
                          component.isManual 
                            ? t('quotation.manualPrice', 'Cena wprowadzona ręcznie')
                            : component.hasBatchPrice === false 
                              ? t('quotation.noBatchPriceTooltip', 'Brak ceny z partii - wprowadź ręcznie')
                              : t('quotation.batchPriceTooltip', 'Cena z najnowszej partii magazynowej')
                        }
                        arrow
                      >
                        <TextField
                          size="small"
                          type="number"
                          value={component.unitPrice}
                          onChange={(e) => handleComponentChange(index, 'unitPrice', e.target.value)}
                          inputProps={{ min: 0, step: 0.01 }}
                          InputProps={{
                            endAdornment: <InputAdornment position="end">€</InputAdornment>
                          }}
                          sx={{ 
                            width: 110,
                            '& .MuiOutlinedInput-root': {
                              backgroundColor: (!component.isManual && component.hasBatchPrice === false) 
                                ? 'rgba(255, 152, 0, 0.1)' 
                                : 'inherit'
                            }
                          }}
                          error={!component.isManual && component.hasBatchPrice === false && !component.unitPrice}
                        />
                      </Tooltip>
                    </TableCell>

                    {/* Koszt */}
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight="medium">
                        {((parseFloat(component.quantity) || 0) * (parseFloat(component.unitPrice) || 0)).toFixed(2)} €
                      </Typography>
                    </TableCell>

                    {/* Akcje */}
                    <TableCell>
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleRemoveComponent(index)}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Suma komponentów */}
        {components.length > 0 && (
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mt: 2, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2" fontWeight={600}>
              {t('quotation.componentsTotal', 'Koszt komponentów')}: {quickCalculation.componentsCost.toFixed(2)} €
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Sekcja opakowania */}
      <Paper sx={{ p: 2, mb: 2, borderLeft: '4px solid', borderLeftColor: 'secondary.main', borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider', fontWeight: 600 }}>
          <PackagingIcon fontSize="small" color="secondary" />
          {t('quotation.packaging', 'Opakowanie')}
        </Typography>

        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <Autocomplete
              size="small"
              options={packagingItems}
              getOptionLabel={(option) => `${option.name} (${option.category})`}
              value={packaging}
              onChange={(_, newValue) => handleSelectPackaging(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('quotation.selectPackaging', 'Rodzaj opakowania')}
                  variant="outlined"
                />
              )}
            />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField
              size="small"
              fullWidth
              type="number"
              label={t('quotation.quantity', 'Ilość')}
              value={packagingQuantity}
              onChange={(e) => setPackagingQuantity(parseInt(e.target.value) || 1)}
              inputProps={{ min: 1 }}
            />
          </Grid>
          <Grid item xs={6} md={2}>
            <TextField
              size="small"
              fullWidth
              type="number"
              label={t('quotation.unitPrice', 'Cena/szt.')}
              value={packaging?.unitPrice || ''}
              onChange={(e) => setPackaging(prev => prev ? { ...prev, unitPrice: parseFloat(e.target.value) || 0 } : null)}
              InputProps={{
                endAdornment: <InputAdornment position="end">€</InputAdornment>
              }}
              disabled={!packaging}
            />
          </Grid>
          <Grid item xs={12} md={2} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Typography variant="subtitle2" fontWeight={600}>
              {t('quotation.packagingCost', 'Koszt')}: {quickCalculation.packagingCost.toFixed(2)} €
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Sekcja kosztu pracy */}
      <Paper sx={{ p: 2, mb: 2, borderLeft: '4px solid', borderLeftColor: 'warning.main', borderRadius: 2 }}>
        <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2, pb: 1.5, borderBottom: 1, borderColor: 'divider', fontWeight: 600 }}>
          <TimeIcon fontSize="small" color="warning" />
          {t('quotation.laborCost', 'Koszt pracy')}
        </Typography>

        <Grid container spacing={2} alignItems="center">
          {/* Gramatura surowca - informacyjnie */}
          <Grid item xs={6} md={2}>
            <TextField
              size="small"
              fullWidth
              label={t('quotation.gramatura', 'Gramatura surowca')}
              value={totalGramatura.toFixed(1)}
              InputProps={{
                endAdornment: <InputAdornment position="end">g</InputAdornment>,
                readOnly: true
              }}
              helperText={effectivePackWeight ? `${t('quotation.autoFormat', 'Format')}: ${effectivePackWeight}g` : ''}
            />
          </Grid>
          {/* Produkt smakowy */}
          <Grid item xs={6} md={2} sx={{ display: 'flex', alignItems: 'center' }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={flavored}
                  onChange={(e) => { setFlavored(e.target.checked); setCustomTargetTimeSec(null); }}
                  color="primary"
                  size="small"
                />
              }
              label={t('quotation.flavored', 'Produkt smakowy')}
            />
          </Grid>
          {/* Czas/szt. - edytowalny */}
          <Grid item xs={6} md={2}>
            <TextField
              size="small"
              fullWidth
              type="number"
              label={laborCalculation.source === 'format' ? t('quotation.targetTime', 'Czas/szt.') : t('quotation.estimatedTime', 'Szacowany czas')}
              value={laborCalculation.source === 'format'
                ? (customTargetTimeSec != null ? customTargetTimeSec : laborCalculation.matrixTargetTimeSec ?? '')
                : Math.round(laborCalculation.estimatedMinutes * 60)}
              onChange={(e) => {
                if (laborCalculation.source === 'format') {
                  const val = e.target.value;
                  setCustomTargetTimeSec(val === '' ? null : parseFloat(val));
                }
              }}
              InputProps={{
                endAdornment: <InputAdornment position="end">sek</InputAdornment>,
                readOnly: laborCalculation.source !== 'format'
              }}
              inputProps={{ min: 0, step: 1 }}
              helperText={
                laborCalculation.source === 'format' && customTargetTimeSec != null
                  ? t('quotation.timeOverridden', 'Ręcznie zmieniony (matryca: {{matrixTime}} sek)', { matrixTime: laborCalculation.matrixTargetTimeSec })
                  : undefined
              }
            />
          </Grid>
          {/* Koszt/minutę - zawsze widoczny i edytowalny */}
          <Grid item xs={6} md={2}>
            <Tooltip
              title={
                costPerMinuteSource 
                  ? t('quotation.costPerMinuteSourceTooltip', 'Źródło: Koszty zakładu {{startDate}} - {{endDate}}', {
                      startDate: costPerMinuteSource.startDate?.toLocaleDateString?.() || '?',
                      endDate: costPerMinuteSource.endDate?.toLocaleDateString?.() || '?'
                    })
                  : t('quotation.costPerMinuteDefault', 'Domyślnie {{defaultCost}} €/min', { defaultCost: DEFAULT_COST_PER_MINUTE })
              }
              arrow
            >
              <TextField
                size="small"
                fullWidth
                type="number"
                label={t('quotation.costPerMinute', 'Koszt/minutę')}
                value={costPerMinute}
                onChange={(e) => setCostPerMinute(parseFloat(e.target.value) || 0)}
                InputProps={{
                  endAdornment: <InputAdornment position="end">€</InputAdornment>
                }}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Tooltip>
          </Grid>
          <Grid item xs={6} md={2} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
            <Typography variant="subtitle2" fontWeight={600}>
              {t('quotation.laborTotal', 'Koszt pracy')}: {quickCalculation.laborCost.toFixed(2)} €
            </Typography>
          </Grid>
        </Grid>

        {/* Info o źródle danych */}
        <Alert 
          severity={laborCalculation.source === 'format' ? "success" : (costPerMinuteSource ? "info" : "warning")} 
          sx={{ mt: 2 }} 
          icon={<InfoIcon />}
        >
          <Typography variant="body2">
            {laborCalculation.source === 'format' ? (
              <>
                {t('quotation.laborInfoFormat', 'Koszt pracy z matrycy formatu produktu ({{packWeight}}g, {{flavorLabel}}).', {
                  packWeight: effectivePackWeight,
                  flavorLabel: flavored ? t('quotation.flavoredLabel', 'smakowy') : t('quotation.unflavored', 'bez smaku')
                })}
                {' '}
                {t('quotation.laborFormula', 'Formuła: ({{time}}s / 60) × {{costPerMin}} €/min × {{qty}} szt. = {{total}} €', {
                  time: laborCalculation.targetTimeSec,
                  costPerMin: costPerMinute,
                  qty: packagingQuantity,
                  total: quickCalculation.laborCost.toFixed(2)
                })}
              </>
            ) : costPerMinuteSource ? (
              <>
                {t('quotation.laborInfoWithSource', 'Koszt/minutę pobrany z najnowszego wpisu kosztów zakładu')}
                {' '}
                <strong>
                  ({costPerMinuteSource.startDate?.toLocaleDateString?.() || '?'} - {costPerMinuteSource.endDate?.toLocaleDateString?.() || '?'})
                </strong>
                {costPerMinuteSource.effectiveHours && (
                  <> — {t('quotation.effectiveTime', 'efektywny czas')}: {costPerMinuteSource.effectiveHours?.toFixed(1)}h</>
                )}
              </>
            ) : (
              t('quotation.laborInfoNoSource', 'Brak wpisów kosztów zakładu. Koszt/minutę ustawiony na domyślną wartość ({{defaultCost}} €).', { defaultCost: DEFAULT_COST_PER_MINUTE })
            )}
          </Typography>
        </Alert>
      </Paper>

      {/* Podsumowanie COGS */}
      <Paper sx={{ 
        p: 0, overflow: 'hidden', borderRadius: 2,
        border: '1px solid',
        borderColor: theme.palette.mode === 'dark' ? 'rgba(46,125,50,0.3)' : 'rgba(46,125,50,0.2)'
      }}>
        {/* Nagłówek sekcji */}
        <Box sx={{ 
          px: 3, py: 1.5,
          background: theme.palette.mode === 'dark' 
            ? 'linear-gradient(135deg, rgba(46,125,50,0.18) 0%, rgba(27,94,32,0.08) 100%)'
            : 'linear-gradient(135deg, rgba(46,125,50,0.1) 0%, rgba(200,230,201,0.3) 100%)',
          borderBottom: '1px solid',
          borderColor: 'divider'
        }}>
          <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 600 }}>
            <EuroIcon fontSize="small" color="success" />
            {t('quotation.summary', 'Podsumowanie COGS')}
          </Typography>
        </Box>

        <Box sx={{ px: 3, py: 2.5 }}>
          {/* Pasek proporcji */}
          {quickCalculation.totalCOGS > 0 && (
            <Box sx={{ mb: 2.5 }}>
              <Box sx={{ display: 'flex', height: 8, borderRadius: 1, overflow: 'hidden', bgcolor: 'action.hover' }}>
                <Box sx={{ width: `${(quickCalculation.componentsCost / quickCalculation.totalCOGS) * 100}%`, bgcolor: 'primary.main', transition: 'width 0.5s ease' }} />
                <Box sx={{ width: `${(quickCalculation.packagingCost / quickCalculation.totalCOGS) * 100}%`, bgcolor: 'secondary.main', transition: 'width 0.5s ease' }} />
                <Box sx={{ width: `${(quickCalculation.laborCost / quickCalculation.totalCOGS) * 100}%`, bgcolor: 'warning.main', transition: 'width 0.5s ease' }} />
              </Box>
            </Box>
          )}

          {/* Pozycje kosztów - jednoliniowy układ: kropka | nazwa | kwota | procent */}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0, mr: 1.5 }} />
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                {t('quotation.componentsTotal', 'Koszt komponentów')}
              </Typography>
              <Typography variant="body2" fontWeight={600} sx={{ minWidth: 80, textAlign: 'right' }}>
                {quickCalculation.componentsCost.toFixed(2)} €
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 55, textAlign: 'right', ml: 1 }}>
                {quickCalculation.totalCOGS > 0 ? `${((quickCalculation.componentsCost / quickCalculation.totalCOGS) * 100).toFixed(1)}%` : '—'}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'secondary.main', flexShrink: 0, mr: 1.5 }} />
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                {t('quotation.packagingTotal', 'Koszt opakowania')}
              </Typography>
              <Typography variant="body2" fontWeight={600} sx={{ minWidth: 80, textAlign: 'right' }}>
                {quickCalculation.packagingCost.toFixed(2)} €
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 55, textAlign: 'right', ml: 1 }}>
                {quickCalculation.totalCOGS > 0 ? `${((quickCalculation.packagingCost / quickCalculation.totalCOGS) * 100).toFixed(1)}%` : '—'}
              </Typography>
            </Box>

            <Box sx={{ display: 'flex', alignItems: 'center', py: 0.5 }}>
              <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: 'warning.main', flexShrink: 0, mr: 1.5 }} />
              <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>
                {t('quotation.laborTotal', 'Koszt pracy')}
              </Typography>
              <Typography variant="body2" fontWeight={600} sx={{ minWidth: 80, textAlign: 'right' }}>
                {quickCalculation.laborCost.toFixed(2)} €
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ minWidth: 55, textAlign: 'right', ml: 1 }}>
                {quickCalculation.totalCOGS > 0 ? `${((quickCalculation.laborCost / quickCalculation.totalCOGS) * 100).toFixed(1)}%` : '—'}
              </Typography>
            </Box>
          </Box>

          {/* Suma COGS */}
          <Box sx={{ 
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            mt: 2, pt: 2, borderTop: 2, borderColor: 'divider'
          }}>
            <Typography variant="subtitle1" fontWeight={700}>
              {t('quotation.totalCOGS', 'SZACOWANY COGS')}
            </Typography>
            <Typography variant="h5" color="success.main" fontWeight={700}>
              {quickCalculation.totalCOGS.toFixed(2)} €
            </Typography>
          </Box>
        </Box>
      </Paper>

      {/* Dialog dodawania komponentu ręcznego */}
      <Dialog open={manualComponentDialog} onClose={() => setManualComponentDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>
          {t('quotation.addManualTitle', 'Dodaj nowy komponent (ręcznie)')}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label={t('quotation.componentName', 'Nazwa komponentu')}
                value={manualComponent.name}
                onChange={(e) => setManualComponent(prev => ({ ...prev, name: e.target.value }))}
                placeholder={t('quotation.componentNamePlaceholder', 'np. Witamina D3')}
              />
            </Grid>
            <Grid item xs={6}>
              <TextField
                fullWidth
                type="number"
                label={t('quotation.quantity', 'Ilość')}
                value={manualComponent.quantity}
                onChange={(e) => setManualComponent(prev => ({ ...prev, quantity: e.target.value }))}
                inputProps={{ min: 0, step: 0.001 }}
              />
            </Grid>
            <Grid item xs={6}>
              <FormControl fullWidth>
                <InputLabel>{t('quotation.unit', 'Jednostka')}</InputLabel>
                <Select
                  value={manualComponent.unit}
                  label={t('quotation.unit', 'Jednostka')}
                  onChange={(e) => setManualComponent(prev => ({ ...prev, unit: e.target.value }))}
                >
                  {AVAILABLE_UNITS.map(u => (
                    <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                type="number"
                label={t('quotation.unitPriceLabel', 'Cena jednostkowa (€)')}
                value={manualComponent.unitPrice}
                onChange={(e) => setManualComponent(prev => ({ ...prev, unitPrice: e.target.value }))}
                inputProps={{ min: 0, step: 0.01 }}
                InputProps={{
                  endAdornment: <InputAdornment position="end">€/{manualComponent.unit}</InputAdornment>
                }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setManualComponentDialog(false)}>
            {t('common.cancel', 'Anuluj')}
          </Button>
          <Button variant="contained" onClick={handleAddManualComponent}>
            {t('quotation.add', 'Dodaj')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog listy zapisanych wycen */}
      <Dialog 
        open={quotationsDialog} 
        onClose={() => setQuotationsDialog(false)} 
        maxWidth="md" 
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon />
          {t('quotation.savedQuotations', 'Zapisane wyceny')}
        </DialogTitle>
        <DialogContent>
          {loadingQuotations ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : savedQuotations.length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              {t('quotation.noSavedQuotations', 'Brak zapisanych wycen. Utwórz pierwszą wycenę i zapisz ją.')}
            </Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{t('quotation.table.name', 'Nazwa')}</TableCell>
                    <TableCell align="right">{t('quotation.table.components', 'Komponenty')}</TableCell>
                    <TableCell align="right">{t('quotation.table.cogs', 'COGS')}</TableCell>
                    <TableCell>{t('quotation.table.date', 'Data')}</TableCell>
                    <TableCell align="center">{t('quotation.table.actions', 'Akcje')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {savedQuotations.map((quotation) => (
                    <TableRow key={quotation.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {quotation.name}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip 
                          size="small" 
                          label={quotation.components?.length || 0} 
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" color="primary" fontWeight="medium">
                          {quotation.summary?.totalCOGS?.toFixed(2) || '0.00'} €
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {quotation.createdAt?.toDate?.()?.toLocaleDateString?.() || 
                           quotation.createdAt?.toLocaleDateString?.() || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title={t('quotation.loadQuotation', 'Załaduj do edycji')}>
                          <IconButton 
                            size="small" 
                            color="primary"
                            onClick={() => handleLoadQuotation(quotation)}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('quotation.duplicate', 'Duplikuj')}>
                          <IconButton 
                            size="small" 
                            color="info"
                            onClick={() => handleDuplicateQuotation(quotation)}
                          >
                            <CopyIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('quotation.deleteQuotation', 'Usuń')}>
                          <IconButton 
                            size="small" 
                            color="error"
                            onClick={() => setDeleteConfirmDialog(quotation)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQuotationsDialog(false)}>
            {t('common.close', 'Zamknij')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={Boolean(deleteConfirmDialog)}
        onClose={() => setDeleteConfirmDialog(null)}
      >
        <DialogTitle>
          {t('quotation.deleteConfirmTitle', 'Potwierdzenie usunięcia')}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {t('quotation.deleteConfirmMessage', 'Czy na pewno chcesz usunąć wycenę "{{name}}"?', {
              name: deleteConfirmDialog?.name || ''
            })}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmDialog(null)}>
            {t('common.cancel', 'Anuluj')}
          </Button>
          <Button 
            variant="contained" 
            color="error" 
            onClick={() => handleDeleteQuotation(deleteConfirmDialog)}
          >
            {t('common.delete', 'Usuń')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog wczytywania z receptury */}
      <Dialog
        open={recipeDialog}
        onClose={() => setRecipeDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <RecipeIcon color="info" />
          {t('quotation.loadFromRecipeTitle', 'Wczytaj składniki z receptury')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            {t('quotation.loadFromRecipeDesc', 'Wyszukaj recepturę i załaduj jej składniki jako komponenty wyceny. Ceny zostaną automatycznie dopasowane z magazynu.')}
          </Typography>
          
          <TextField
            fullWidth
            size="small"
            autoFocus
            placeholder={t('quotation.recipeSearchPlaceholder', 'Szukaj receptury po nazwie...')}
            value={recipeSearchTerm}
            onChange={(e) => handleRecipeSearch(e.target.value)}
            InputProps={{
              endAdornment: recipeSearchLoading ? (
                <InputAdornment position="end">
                  <CircularProgress size={18} />
                </InputAdornment>
              ) : null
            }}
            sx={{ mb: 2 }}
          />

          {/* Wyniki wyszukiwania */}
          {recipeLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : recipeSearchResults.length === 0 ? (
            <Typography variant="body2" color="text.secondary" align="center" sx={{ py: 3 }}>
              {recipeSearchTerm
                ? t('quotation.recipeNoResults', 'Brak wyników dla "{{term}}"', { term: recipeSearchTerm })
                : t('quotation.recipeTypeToSearch', 'Wpisz nazwę receptury aby wyszukać')}
            </Typography>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, maxHeight: 350, overflowY: 'auto' }}>
              {recipeSearchResults.map((recipe) => (
                <Box
                  key={recipe.id}
                  onClick={() => handleLoadFromRecipe(recipe)}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    px: 2, py: 1.5,
                    borderRadius: 1.5,
                    cursor: 'pointer',
                    border: '1px solid',
                    borderColor: 'divider',
                    transition: 'all 0.15s ease',
                    '&:hover': {
                      borderColor: 'info.main',
                      bgcolor: theme.palette.mode === 'dark' ? 'rgba(33, 150, 243, 0.08)' : 'rgba(33, 150, 243, 0.04)'
                    }
                  }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" fontWeight={600} noWrap>
                      {recipe.name}
                    </Typography>
                    {recipe.description && (
                      <Typography variant="caption" color="text.secondary" noWrap>
                        {recipe.description}
                      </Typography>
                    )}
                  </Box>
                  <Chip 
                    size="small" 
                    label={`${recipe.ingredientsCount} ${t('quotation.ingredientsShort', 'skł.')}`}
                    variant="outlined"
                    color="info"
                    sx={{ ml: 1, flexShrink: 0 }}
                  />
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRecipeDialog(false)}>
            {t('common.close', 'Zamknij')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default QuotationTool;
