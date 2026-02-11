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
  PACK_WEIGHT_OPTIONS
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
  const [costPerMinute, setCostPerMinute] = useState(0);
  const [costPerMinuteSource, setCostPerMinuteSource] = useState(null); // Źródło kosztu/min
  const [loading, setLoading] = useState(true);

  // Stan wyceny
  const [quotationId, setQuotationId] = useState(null); // ID edytowanej wyceny (null = nowa)
  const [quotationName, setQuotationName] = useState('');
  const [components, setComponents] = useState([]);
  const [packaging, setPackaging] = useState(null);
  const [packagingQuantity, setPackagingQuantity] = useState(1);
  const [packWeight, setPackWeight] = useState(null);  // Gramatura opakowania (g): 60, 90, 120, 180, 300, 900
  const [flavored, setFlavored] = useState(false);    // Produkt smakowy (tylko dla 300g)

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
      setCostPerMinute(costMinData.costPerMinute || 0);
      setCostPerMinuteSource(costMinData.source || null);
      
      if (!costMinData.hasData) {
        showNotification(t('quotation.noCostPerMinuteData', 'Brak danych o kosztach zakładu - wprowadź koszt/minutę ręcznie'), 'warning');
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
        packWeight,
        flavored,
        costPerMinute,
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

    // Ustaw format produktu (pack weight, flavored)
    setPackWeight(quotation.packWeight ?? null);
    setFlavored(quotation.flavored ?? false);

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

  // Koszt pracy: tryb matrycy formatu (pack weight) lub fallback (gramatura)
  const laborCalculation = useMemo(() => {
    const formatLabor = calculateLaborCostByFormat(packWeight, flavored, packagingQuantity);
    if (formatLabor) {
      return {
        laborCost: formatLabor.laborCostTotal,
        estimatedMinutes: formatLabor.estimatedMinutes,
        targetTimeSec: formatLabor.targetTimeSec,
        costPerHourEur: formatLabor.costPerHourEur,
        source: 'format'
      };
    }
    const estimatedMinutes = calculateLaborTime(totalGramatura);
    return {
      laborCost: estimatedMinutes * costPerMinute,
      estimatedMinutes,
      targetTimeSec: null,
      costPerHourEur: null,
      source: 'gramatura'
    };
  }, [components, packWeight, flavored, packagingQuantity, totalGramatura, costPerMinute]);

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
        packWeight,
        flavored,
        customCostPerMinute: costPerMinute
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
    setPackWeight(null);
    setFlavored(false);
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
      <Paper sx={{ p: 2, mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InventoryIcon fontSize="small" />
            {t('quotation.components', 'Komponenty (Surowce)')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
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
              <TableRow sx={{ backgroundColor: theme.palette.action.hover }}>
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
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, pt: 2, borderTop: 1, borderColor: 'divider' }}>
            <Typography variant="subtitle2">
              {t('quotation.componentsTotal', 'Suma komponentów')}: <strong>{quickCalculation.componentsCost.toFixed(2)} €</strong>
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Sekcja opakowania */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <PackagingIcon fontSize="small" />
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
          <Grid item xs={12} md={2}>
            <Typography variant="body2" align="right">
              {t('quotation.packagingCost', 'Koszt')}: <strong>{quickCalculation.packagingCost.toFixed(2)} €</strong>
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      {/* Sekcja kosztu pracy */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <TimeIcon fontSize="small" />
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
            />
          </Grid>
          {/* Gramatura opakowania (format produktu) */}
          <Grid item xs={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>{t('quotation.packWeight', 'Gramatura opakowania')}</InputLabel>
              <Select
                value={packWeight ?? ''}
                label={t('quotation.packWeight', 'Gramatura opakowania')}
                onChange={(e) => {
                  const val = e.target.value;
                  setPackWeight(val === '' ? null : Number(val));
                  if (val !== 300) setFlavored(false);
                }}
              >
                <MenuItem value="">{t('quotation.packWeightNone', '— Nie wybrano —')}</MenuItem>
                {PACK_WEIGHT_OPTIONS.map(w => (
                  <MenuItem key={w} value={w}>{w} g</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {t('quotation.packWeightHelp', 'Matryca czasu/kosztu')}
            </Typography>
          </Grid>
          {/* Produkt smakowy - tylko gdy 300g */}
          {packWeight === 300 && (
            <Grid item xs={12} md={2}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={flavored}
                    onChange={(e) => setFlavored(e.target.checked)}
                    color="primary"
                    size="small"
                  />
                }
                label={t('quotation.flavored', 'Produkt smakowy')}
              />
            </Grid>
          )}
          {/* Szacowany czas / Czas z matrycy */}
          <Grid item xs={6} md={2}>
            <TextField
              size="small"
              fullWidth
              label={laborCalculation.source === 'format' ? t('quotation.targetTime', 'Czas/szt.') : t('quotation.estimatedTime', 'Szacowany czas')}
              value={laborCalculation.source === 'format' 
                ? `${laborCalculation.targetTimeSec} s` 
                : laborCalculation.estimatedMinutes}
              InputProps={{
                endAdornment: <InputAdornment position="end">{laborCalculation.source === 'format' ? '' : 'min'}</InputAdornment>,
                readOnly: true
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
              {t('quotation.fromMatrix', '(z matrycy czasu)')}
            </Typography>
          </Grid>
          {/* Koszt/h - tylko w trybie formatu; w fallback kost/min */}
          {laborCalculation.source === 'format' ? (
            <Grid item xs={6} md={2}>
              <TextField
                size="small"
                fullWidth
                label={t('quotation.costPerHour', 'Koszt/h')}
                value={laborCalculation.costPerHourEur?.toFixed(2)}
                InputProps={{
                  endAdornment: <InputAdornment position="end">€</InputAdornment>,
                  readOnly: true
                }}
              />
            </Grid>
          ) : (
            <Grid item xs={6} md={2}>
              <Tooltip
                title={
                  costPerMinuteSource 
                    ? t('quotation.costPerMinuteSourceTooltip', 'Źródło: Koszty zakładu {{startDate}} - {{endDate}}', {
                        startDate: costPerMinuteSource.startDate?.toLocaleDateString?.() || '?',
                        endDate: costPerMinuteSource.endDate?.toLocaleDateString?.() || '?'
                      })
                    : t('quotation.noCostPerMinuteSource', 'Brak danych - wprowadź ręcznie')
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
                  sx={{
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: costPerMinuteSource ? 'inherit' : 'rgba(255, 152, 0, 0.1)'
                    }
                  }}
                />
              </Tooltip>
            </Grid>
          )}
          <Grid item xs={6} md={2}>
            <Typography variant="body2" align="right">
              {t('quotation.laborTotal', 'Koszt pracy')}: <strong>{quickCalculation.laborCost.toFixed(2)} €</strong>
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
              t('quotation.laborInfoFormat', 'Koszt pracy z matrycy formatu produktu (gramatura opakowania + smak).')
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
                {' '}
                {t('quotation.laborInfoSelectFormat', 'Wybierz gramaturę opakowania dla precyzyjniejszej kalkulacji.')}
              </>
            ) : (
              t('quotation.laborInfoNoSource', 'Brak wpisów kosztów zakładu. Wprowadź koszt/minutę ręcznie lub dodaj wpis w zakładce "Koszty zakładu". Wybierz gramaturę opakowania dla precyzyjniejszej kalkulacji.')
            )}
          </Typography>
        </Alert>
      </Paper>

      {/* Podsumowanie COGS */}
      <Paper sx={{ p: 2, backgroundColor: theme.palette.mode === 'dark' ? 'grey.900' : 'grey.50' }}>
        <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
          <EuroIcon fontSize="small" />
          {t('quotation.summary', 'Podsumowanie COGS')}
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} md={8}>
            <Table size="small">
              <TableBody>
                <TableRow>
                  <TableCell>{t('quotation.componentsTotal', 'Koszt komponentów')}</TableCell>
                  <TableCell align="right">{quickCalculation.componentsCost.toFixed(2)} €</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{t('quotation.packagingTotal', 'Koszt opakowania')}</TableCell>
                  <TableCell align="right">{quickCalculation.packagingCost.toFixed(2)} €</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>{t('quotation.laborTotal', 'Koszt pracy')}</TableCell>
                  <TableCell align="right">{quickCalculation.laborCost.toFixed(2)} €</TableCell>
                </TableRow>
                <TableRow sx={{ '& td': { borderTop: 2, borderColor: 'divider' } }}>
                  <TableCell>
                    <Typography variant="subtitle1" fontWeight="bold">
                      {t('quotation.totalCOGS', 'SZACOWANY COGS')}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="h6" color="primary" fontWeight="bold">
                      {quickCalculation.totalCOGS.toFixed(2)} €
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Grid>

          {/* Wizualizacja struktury kosztów */}
          <Grid item xs={12} md={4}>
            <Typography variant="caption" color="text.secondary" gutterBottom>
              {t('quotation.costStructure', 'Struktura kosztów')}
            </Typography>
            <Box sx={{ mt: 1 }}>
              {quickCalculation.totalCOGS > 0 && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                    <Box sx={{ width: `${(quickCalculation.componentsCost / quickCalculation.totalCOGS) * 100}%`, height: 8, bgcolor: 'primary.main', borderRadius: 1, mr: 1, minWidth: 4 }} />
                    <Typography variant="caption">
                      {((quickCalculation.componentsCost / quickCalculation.totalCOGS) * 100).toFixed(1)}% {t('quotation.materials', 'Materiały')}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                    <Box sx={{ width: `${(quickCalculation.packagingCost / quickCalculation.totalCOGS) * 100}%`, height: 8, bgcolor: 'secondary.main', borderRadius: 1, mr: 1, minWidth: 4 }} />
                    <Typography variant="caption">
                      {((quickCalculation.packagingCost / quickCalculation.totalCOGS) * 100).toFixed(1)}% {t('quotation.packagingLabel', 'Opakowanie')}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Box sx={{ width: `${(quickCalculation.laborCost / quickCalculation.totalCOGS) * 100}%`, height: 8, bgcolor: 'warning.main', borderRadius: 1, mr: 1, minWidth: 4 }} />
                    <Typography variant="caption">
                      {((quickCalculation.laborCost / quickCalculation.totalCOGS) * 100).toFixed(1)}% {t('quotation.laborLabel', 'Praca')}
                    </Typography>
                  </Box>
                </>
              )}
            </Box>
          </Grid>
        </Grid>
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
    </Box>
  );
};

export default QuotationTool;
