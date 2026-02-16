import React, { useState, useEffect } from 'react';
import { 
  Grid, 
  TextField, 
  Typography, 
  Box, 
  Button, 
  Card, 
  CardContent, 
  CardHeader, 
  Divider,
  MenuItem,
  IconButton,
  FormHelperText,
  FormControl,
  InputLabel,
  Select,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Autocomplete,
  Snackbar,
  Alert,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Chip,
  Collapse
} from '@mui/material';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import pl from 'date-fns/locale/pl';
import { format } from 'date-fns';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import SearchIcon from '@mui/icons-material/Search';
import LinkIcon from '@mui/icons-material/Link';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { Calculate as CalculateIcon } from '@mui/icons-material';
import { 
  CMR_STATUSES, 
  CMR_PAYMENT_STATUSES, 
  TRANSPORT_TYPES,
  getTransportTypeLabel,
  translatePaymentStatus 
} from '../../../services/cmrService';
import { getOrderById, getAllOrders, searchOrdersByNumber } from '../../../services/orderService';
import { getCustomerById } from '../../../services/customerService';
import { getCompanyData } from '../../../services/companyService';
import { getAllCarriers, createCarrier, updateCarrier, deleteCarrier } from '../../../services/carrierService';
import BatchSelector from '../../../components/cmr/BatchSelector';
import WeightCalculationDialog from '../../../components/cmr/WeightCalculationDialog';
import { calculatePalletWeights, calculateBoxWeights, calculateCmrItemWeight, getInventoryDataFromBatches } from '../../../utils/cmrWeightCalculator';
import { useTheme } from '../../../contexts/ThemeContext';
import { useAuth } from '../../../hooks/useAuth';
import { useTranslation } from '../../../hooks/useTranslation';

/**
 * Komponent wyświetlający podsumowanie wagi i palet dla pojedynczej pozycji CMR
 */
const ItemWeightSummary = ({ item, itemIndex, isCollapsed, onToggleCollapse }) => {
  const [weightDetails, setWeightDetails] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const muiTheme = useMuiTheme();

  // Cache dla danych magazynowych - używamy tego samego TTL co w głównym komponencie
  const CACHE_TTL = 5 * 60 * 1000; // 5 minut w milisekundach
  
  // Funkcja do pobrania danych magazynowych z cache lub API
  const getInventoryDataCached = async (linkedBatches) => {
    if (!linkedBatches || linkedBatches.length === 0) return null;
    
    const cacheKey = linkedBatches.map(batch => batch.id).sort().join(',');
    const now = Date.now();
    
    // Sprawdź cache
    const cachedData = localStorage.getItem(`inventory_cache_${cacheKey}`);
    if (cachedData) {
      const { data, timestamp } = JSON.parse(cachedData);
      if (now - timestamp < CACHE_TTL) {
        return data;
      }
    }
    
    try {
      const inventoryData = await getInventoryDataFromBatches(linkedBatches);
      
      // Zapisz do cache
      localStorage.setItem(`inventory_cache_${cacheKey}`, JSON.stringify({
        data: inventoryData,
        timestamp: now
      }));
      
      return inventoryData;
    } catch (error) {
      console.error('Błąd podczas pobierania danych magazynowych:', error);
      return null;
    }
  };

  // Funkcja do wyliczania szczegółów wagi
  const calculateWeightDetails = async () => {
    if (!item.linkedBatches || item.linkedBatches.length === 0) {
      setWeightDetails(null);
      return;
    }

    setIsLoading(true);
    try {
      const inventoryData = await getInventoryDataCached(item.linkedBatches);
      
      if (inventoryData) {
        const palletData = calculatePalletWeights({
          quantity: parseFloat(item.quantity) || 0,
          unitWeight: inventoryData.weight || 0,
          itemsPerBox: inventoryData.itemsPerBox || 0,
          boxesPerPallet: inventoryData.boxesPerPallet || 0
        });

        // Oblicz szczegóły kartonów tylko jeśli pozycja ma kartony
        let boxData = { fullBox: null, partialBox: null, totalBoxes: 0 };
        if (inventoryData.itemsPerBox && inventoryData.itemsPerBox > 0) {
          boxData = calculateBoxWeights({
            quantity: parseFloat(item.quantity) || 0,
            unitWeight: inventoryData.weight || 0,
            itemsPerBox: inventoryData.itemsPerBox
          });
        }

        setWeightDetails({
          hasDetailedData: true,
          weight: parseFloat(item.weight) || 0,
          quantity: parseFloat(item.quantity) || 0,
          unit: item.unit || 'szt.',
          palletsCount: palletData.palletsCount,
          pallets: palletData.pallets,
          boxesCount: boxData.totalBoxes,
          boxes: boxData,
          hasBoxes: inventoryData.itemsPerBox && inventoryData.itemsPerBox > 0
        });
      } else {
        setWeightDetails({
          hasDetailedData: false,
          weight: parseFloat(item.weight) || 0,
          quantity: parseFloat(item.quantity) || 0,
          unit: item.unit || 'szt.',
          palletsCount: 0,
          pallets: [],
          boxesCount: 0,
          boxes: { fullBox: null, partialBox: null }
        });
      }
    } catch (error) {
      console.error('Błąd podczas wyliczania szczegółów wagi:', error);
      setWeightDetails(null);
    } finally {
      setIsLoading(false);
    }
  };

  // Przelicz szczegóły przy każdej zmianie pozycji
  useEffect(() => {
    calculateWeightDetails();
  }, [item.quantity, item.weight, item.linkedBatches]);

  // Jeśli nie ma danych do wyświetlenia, nie pokazuj nic
  if (!item.linkedBatches || item.linkedBatches.length === 0) {
    return null;
  }

  return (
    <Grid item xs={12}>
      <Card sx={{ 
        mt: 2, 
        bgcolor: muiTheme.palette.mode === 'dark' ? 'background.paper' : 'grey.50' 
      }}>
        <CardHeader
          title={
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Typography variant="subtitle2">
                Podsumowanie wagi - Pozycja {itemIndex + 1}
              </Typography>
              <IconButton 
                onClick={onToggleCollapse}
                size="small"
                sx={{ ml: 1 }}
              >
                {isCollapsed ? <ExpandMoreIcon /> : <ExpandLessIcon />}
              </IconButton>
            </Box>
          }
          sx={{ pb: 1 }}
        />
        
        <Collapse in={!isCollapsed}>
          <CardContent sx={{ pt: 0 }}>
            {isLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <CircularProgress size={24} />
              </Box>
            ) : weightDetails ? (
              <Grid container spacing={2}>
                {/* Podstawowe informacje */}
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="body2">
                    <strong>Ilość:</strong> {weightDetails.quantity} {weightDetails.unit}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="body2">
                    <strong>Waga pozycji:</strong> {weightDetails.weight} kg
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="body2">
                    <strong>Liczba palet:</strong> {weightDetails.palletsCount}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="body2">
                    <strong>Liczba kartonów:</strong> {weightDetails.boxesCount}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Typography variant="body2" color={weightDetails.hasDetailedData ? 'success.main' : 'warning.main'}>
                    {weightDetails.hasDetailedData ? '✓ Dane szczegółowe' : '⚠ Brak danych magazynowych'}
                  </Typography>
                </Grid>

                {/* Szczegóły palet */}
                {weightDetails.hasDetailedData && weightDetails.pallets.length > 0 && (
                  <Grid item xs={12}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1, mt: 1 }}>
                      Szczegóły palet:
                    </Typography>
                    <Grid container spacing={1}>
                      {/* Pełna paleta */}
                      {weightDetails.pallets.find(p => p.isFull) && (
                        <Grid item xs={12} sm={6}>
                          <Box sx={{ 
                            p: 1.5, 
                            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'success.dark' : 'success.light',
                            borderRadius: 1,
                            border: 1,
                            borderColor: 'success.main'
                          }}>
                            {(() => {
                              const fullPallet = weightDetails.pallets.find(p => p.isFull);
                              const fullPalletsCount = weightDetails.pallets.filter(p => p.isFull).length;
                              return (
                                <>
                                  <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                    Pełna paleta ({fullPalletsCount} szt.)
                                  </Typography>
                                  <Typography variant="caption" display="block">
                                    Produkty: {fullPallet.itemsCount} szt. ({fullPallet.productWeight} kg)
                                  </Typography>
                                  <Typography variant="caption" display="block">
                                    Kartony: {fullPallet.boxesCount} szt. ({fullPallet.packagesWeight} kg)
                                  </Typography>
                                  <Typography variant="caption" display="block">
                                    Paleta: {fullPallet.palletWeight} kg
                                  </Typography>
                                  <Typography variant="caption" display="block" sx={{ fontWeight: 'bold', mt: 0.5 }}>
                                    Waga palety: {fullPallet.totalWeight} kg
                                  </Typography>
                                </>
                              );
                            })()}
                          </Box>
                        </Grid>
                      )}
                      
                      {/* Niepełna paleta */}
                      {weightDetails.pallets.find(p => !p.isFull) && (
                        <Grid item xs={12} sm={6}>
                          <Box sx={{ 
                            p: 1.5, 
                            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'warning.dark' : 'warning.light',
                            borderRadius: 1,
                            border: 1,
                            borderColor: 'warning.main'
                          }}>
                            {(() => {
                              const partialPallet = weightDetails.pallets.find(p => !p.isFull);
                              return (
                                <>
                                  <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                                    Niepełna paleta (1 szt.)
                                  </Typography>
                                  <Typography variant="caption" display="block">
                                    Produkty: {partialPallet.itemsCount} szt. ({partialPallet.productWeight} kg)
                                  </Typography>
                                  <Typography variant="caption" display="block">
                                    Kartony: {partialPallet.boxesCount} szt. ({partialPallet.packagesWeight} kg)
                                  </Typography>
                                  <Typography variant="caption" display="block">
                                    Paleta: {partialPallet.palletWeight} kg
                                  </Typography>
                                  <Typography variant="caption" display="block" sx={{ fontWeight: 'bold', mt: 0.5 }}>
                                    Waga palety: {partialPallet.totalWeight} kg
                                  </Typography>
                                </>
                              );
                            })()}
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </Grid>
                )}

                {/* Szczegóły kartonów - tylko gdy pozycja ma kartony */}
                {weightDetails.hasDetailedData && weightDetails.hasBoxes && weightDetails.boxes && (weightDetails.boxes.fullBox || weightDetails.boxes.partialBox) && (
                  <Grid item xs={12}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 1, mt: 1 }}>
                      Szczegóły kartonów:
                    </Typography>
                    <Grid container spacing={1}>
                      {/* Pełny karton */}
                      {weightDetails.boxes.fullBox && (
                        <Grid item xs={12} sm={6}>
                          <Box sx={{ 
                            p: 1.5, 
                            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'info.dark' : 'info.light',
                            borderRadius: 1,
                            border: 1,
                            borderColor: 'info.main'
                          }}>
                            <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                              Pełny karton ({weightDetails.boxes.fullBoxesCount} szt.)
                            </Typography>
                            <Typography variant="caption" display="block">
                              Produkty: {weightDetails.boxes.fullBox.itemsCount} szt. ({weightDetails.boxes.fullBox.productWeight} kg)
                            </Typography>
                            <Typography variant="caption" display="block">
                              Karton: {weightDetails.boxes.fullBox.packageWeight} kg
                            </Typography>
                            <Typography variant="caption" display="block" sx={{ fontWeight: 'bold', mt: 0.5 }}>
                              Waga kartonu: {weightDetails.boxes.fullBox.totalWeight} kg
                            </Typography>
                          </Box>
                        </Grid>
                      )}
                      
                      {/* Niepełny karton */}
                      {weightDetails.boxes.partialBox && (
                        <Grid item xs={12} sm={6}>
                          <Box sx={{ 
                            p: 1.5, 
                            bgcolor: (theme) => theme.palette.mode === 'dark' ? 'warning.dark' : 'warning.light',
                            borderRadius: 1,
                            border: 1,
                            borderColor: 'warning.main'
                          }}>
                            <Typography variant="caption" sx={{ fontWeight: 'bold' }}>
                              Niepełny karton (1 szt.)
                            </Typography>
                            <Typography variant="caption" display="block">
                              Produkty: {weightDetails.boxes.partialBox.itemsCount} szt. ({weightDetails.boxes.partialBox.productWeight} kg)
                            </Typography>
                            <Typography variant="caption" display="block">
                              Karton: {weightDetails.boxes.partialBox.packageWeight} kg
                            </Typography>
                            <Typography variant="caption" display="block" sx={{ fontWeight: 'bold', mt: 0.5 }}>
                              Waga kartonu: {weightDetails.boxes.partialBox.totalWeight} kg
                            </Typography>
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </Grid>
                )}
              </Grid>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                Brak danych do wyświetlenia
              </Typography>
            )}
          </CardContent>
        </Collapse>
      </Card>
    </Grid>
  );
};

/**
 * Komponent formularza CMR rozszerzony o możliwość uzupełniania pól na podstawie zamówienia klienta (CO).
 * 
 * @param {Object} initialData - Początkowe dane formularza
 * @param {Function} onSubmit - Funkcja wywołana po zapisaniu formularza
 * @param {Function} onCancel - Funkcja wywołana po anulowaniu edycji
 * @returns {JSX.Element} Formularz CMR
 */
const CmrForm = ({ initialData, onSubmit, onCancel }) => {
  const muiTheme = useMuiTheme();
  const { mode } = useTheme();
  const { currentUser } = useAuth();
  const { t } = useTranslation('cmr');
  const emptyItem = {
    description: '',
    quantity: '',
    unit: 'szt.',
    weight: '',
    volume: '',
    notes: '',
    linkedBatches: [],
    palletsCount: 0
  };
  
  const emptyFormData = {
    cmrNumber: '',
    issueDate: new Date(),
    deliveryDate: null,
    status: CMR_STATUSES.DRAFT,
    paymentStatus: CMR_PAYMENT_STATUSES.UNPAID,
    transportType: TRANSPORT_TYPES.ROAD,
    
    // Dane nadawcy
    sender: '',
    senderAddress: '',
    senderPostalCode: '',
    senderCity: '',
    senderCountry: '',
    
    // Dane odbiorcy
    recipient: '',
    recipientAddress: '', // Połączone pole adresu
    
    // Dane przewoźnika
    carrier: '',
    carrierAddress: '',
    carrierPostalCode: '',
    carrierCity: '',
    carrierCountry: '',
    
    // Miejsce załadunku i rozładunku
    loadingPlace: '',
    loadingDate: null,
    deliveryPlace: '',
    
    // Dane dotyczące przesyłki
    attachedDocuments: '',
    instructionsFromSender: 'Towar stanowi żywność – suplementy diety i nie może być przewożony w jednym pojeździe z chemikaliami ani innymi substancjami mogącymi powodować skażenie. Pełną odpowiedzialność za dobór środka transportu, warunki przewozu oraz ewentualne pogorszenie jakości lub skażenie towaru ponosi przewoźnik / firma spedycyjna.',
    
    // Opłaty
    freight: '',
    carriage: '',
    discounts: '',
    balance: '',
    specialAgreements: '',
    
    // Płatność
    paymentMethod: 'sender', // sender, recipient, other
    
    // Dane pojazdu
    vehicleInfo: {
      vehicleRegistration: '',
      trailerRegistration: '',
    },
    
    // Rezerwacje
    reservations: '',
    
    items: [],
    notes: ''
  };
  
  const [formData, setFormData] = useState(emptyFormData);
  const [formErrors, setFormErrors] = useState({});
  
  // Dodane stany dla obsługi wyboru dokumentu CO
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [isLoadingOrder, setIsLoadingOrder] = useState(false);
  const [availableOrders, setAvailableOrders] = useState([]);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  
  // Dodane stany dla wyboru, które dane importować z CO
  const [importOptions, setImportOptions] = useState({
    recipientData: true,
    deliveryPlace: true,
    documents: true
  });
  
  // Stan do zwijania/rozwijania opcji importu
  const [isImportOptionsExpanded, setIsImportOptionsExpanded] = useState(false);
  
  // Dodane stany dla dialogu wyboru pól nadawcy
  const [isSenderDialogOpen, setIsSenderDialogOpen] = useState(false);
  const [isLoadingSenderData, setIsLoadingSenderData] = useState(false);
  const [senderImportOptions, setSenderImportOptions] = useState({
    name: true,
    address: true,
    postalCode: true,
    city: true,
    country: true
  });
  
  // Dodane stany dla obsługi komunikatów
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarSeverity, setSnackbarSeverity] = useState('info');
  
  // Stany dla wyboru partii magazynowych
  const [batchSelectorOpen, setBatchSelectorOpen] = useState(false);
  const [currentItemIndex, setCurrentItemIndex] = useState(null);
  
  // Stany dla powiązanych zamówień i ich pozycji
  const [linkedOrders, setLinkedOrders] = useState([]);
  const [availableOrderItems, setAvailableOrderItems] = useState([]);
  const [orderItemsSelectorOpen, setOrderItemsSelectorOpen] = useState(false);
  const [orderItemsSearchQuery, setOrderItemsSearchQuery] = useState('');
  
  // Stany dla kalkulatora wagi
  const [weightCalculatorOpen, setWeightCalculatorOpen] = useState(false);
  const [currentWeightItemIndex, setCurrentWeightItemIndex] = useState(null);
  
  // Stany dla podsumowania wagi
  const [weightSummary, setWeightSummary] = useState({
    totalWeight: 0,
    totalPallets: 0,
    itemsWeightBreakdown: []
  });
  
  // Stan dla zwijania/rozwijania podsumowań poszczególnych pozycji
  const [collapsedItems, setCollapsedItems] = useState(new Set());
  
  // Cache dla danych magazynowych z TTL (5 minut)
  const [inventoryDataCache, setInventoryDataCache] = useState(new Map());
  const CACHE_TTL = 5 * 60 * 1000; // 5 minut w milisekundach

  // Stany dla przewoźników
  const [carriers, setCarriers] = useState([]);
  const [carriersLoading, setCarriersLoading] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState(null);
  const [carrierDialogOpen, setCarrierDialogOpen] = useState(false);
  const [carrierDialogMode, setCarrierDialogMode] = useState('add'); // 'add' lub 'edit'
  const [editingCarrierId, setEditingCarrierId] = useState(null);
  const [newCarrierData, setNewCarrierData] = useState({
    name: '',
    address: '',
    postalCode: '',
    city: '',
    country: 'Polska',
    nip: '',
    phone: '',
    email: ''
  });
  const [savingCarrier, setSavingCarrier] = useState(false);
  const [deleteCarrierDialogOpen, setDeleteCarrierDialogOpen] = useState(false);
  const [carrierToDelete, setCarrierToDelete] = useState(null);
  const [deletingCarrier, setDeletingCarrier] = useState(false);

  // Funkcja do czyszczenia wygasłych wpisów z cache
  const cleanExpiredCache = () => {
    const now = Date.now();
    setInventoryDataCache(prev => {
      const newCache = new Map();
      prev.forEach((entry, key) => {
        if (now - entry.timestamp < CACHE_TTL) {
          newCache.set(key, entry);
        }
      });
      return newCache;
    });
  };
  
  // Funkcja do wyświetlania komunikatów
  const showMessage = (message, severity = 'info') => {
    setSnackbarMessage(message);
    setSnackbarSeverity(severity);
    setSnackbarOpen(true);
  };

  // Funkcja do przełączania stanu zwijania pozycji
  const toggleItemCollapse = (itemIndex) => {
    setCollapsedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemIndex)) {
        newSet.delete(itemIndex);
      } else {
        newSet.add(itemIndex);
      }
      return newSet;
    });
  };
  
  // Funkcja do zamykania komunikatu
  const handleCloseSnackbar = () => {
    setSnackbarOpen(false);
  };
  
  // Funkcje do obsługi wyboru partii magazynowych
  const handleOpenBatchSelector = (itemIndex) => {
    setCurrentItemIndex(itemIndex);
    setBatchSelectorOpen(true);
  };
  
  const handleCloseBatchSelector = () => {
    setBatchSelectorOpen(false);
    setCurrentItemIndex(null);
  };
  
  const handleSelectBatches = async (selectedBatches) => {
    if (currentItemIndex !== null) {
      // Najpierw zaktualizuj formData
      setFormData(prev => {
        const updatedItems = [...prev.items];
        updatedItems[currentItemIndex] = {
          ...updatedItems[currentItemIndex],
          linkedBatches: selectedBatches
        };
        return { ...prev, items: updatedItems };
      });

      // Automatycznie przelicz wagę po powiązaniu partii
      if (selectedBatches.length > 0) {
        const currentItem = formData.items[currentItemIndex];
        const updatedItem = {
          ...currentItem,
          linkedBatches: selectedBatches
        };
        
        // Przelicz wagę automatycznie po krótkim opóźnieniu
        setTimeout(() => calculateAndSetItemWeight(currentItemIndex, updatedItem), 200);
      }

      showMessage(`Powiązano ${selectedBatches.length} partii z pozycją ${currentItemIndex + 1}`, 'success');
    }
    
    setBatchSelectorOpen(false);
    setCurrentItemIndex(null);
  };
  
  const handleRemoveBatch = (itemIndex, batchId) => {
    setFormData(prev => {
      const updatedItems = [...prev.items];
      const updatedLinkedBatches = updatedItems[itemIndex].linkedBatches.filter(batch => batch.id !== batchId);
      
      updatedItems[itemIndex] = {
        ...updatedItems[itemIndex],
        linkedBatches: updatedLinkedBatches
      };
      
      // Jeśli usunięto wszystkie partie, wyczyść wagę
      if (updatedLinkedBatches.length === 0) {
        updatedItems[itemIndex].weight = '';
        setTimeout(() => calculateWeightSummary(updatedItems), 100);
      } else {
        // Przelicz wagę z pozostałymi partiami
        setTimeout(() => calculateAndSetItemWeight(itemIndex, updatedItems[itemIndex]), 200);
      }
      
      return { ...prev, items: updatedItems };
    });
  };

  // Funkcja do odświeżania parametrów magazynowych dla pozycji
  const handleRefreshInventoryData = async (itemIndex) => {
    const item = formData.items[itemIndex];
    
    if (!item.linkedBatches || item.linkedBatches.length === 0) {
      showMessage('Brak powiązanych partii do odświeżenia', 'warning');
      return;
    }

    try {
      // Wyczyść cache dla tej pozycji
      const firstBatch = item.linkedBatches[0];
      
      if (firstBatch.itemId && inventoryDataCache.has(firstBatch.itemId)) {
        setInventoryDataCache(prev => {
          const newCache = new Map(prev);
          newCache.delete(firstBatch.itemId);
          return newCache;
        });
      }

      // Pobierz aktualne dane magazynowe
      const freshInventoryData = await getInventoryDataFromBatches(item.linkedBatches);
      
      if (freshInventoryData) {
        // Zaktualizuj powiązane partie z nowymi parametrami
        const updatedLinkedBatches = item.linkedBatches.map(batch => ({
          ...batch,
          // Aktualizuj parametry z pozycji magazynowej
          itemName: freshInventoryData.name || batch.itemName,
          barcode: freshInventoryData.barcode || batch.barcode || '',
          // Zachowaj oryginalne dane partii
          quantity: batch.quantity,
          unit: batch.unit,
          batchNumber: batch.batchNumber,
          lotNumber: batch.lotNumber,
          expiryDate: batch.expiryDate,
          warehouseId: batch.warehouseId,
          warehouseName: batch.warehouseName
        }));

        setFormData(prev => {
          const updatedItems = [...prev.items];
          updatedItems[itemIndex] = {
            ...updatedItems[itemIndex],
            linkedBatches: updatedLinkedBatches
          };

          return { ...prev, items: updatedItems };
        });

        // Przelicz wagę z odświeżonymi danymi
        setTimeout(() => calculateAndSetItemWeight(itemIndex, {
          ...item,
          linkedBatches: updatedLinkedBatches
        }), 200);

        showMessage(`Odświeżono parametry magazynowe dla pozycji ${itemIndex + 1}`, 'success');
      } else {
        showMessage('Nie udało się pobrać danych magazynowych', 'error');
      }
    } catch (error) {
      console.error('Błąd podczas odświeżania danych magazynowych:', error);
      showMessage('Błąd podczas odświeżania parametrów magazynowych', 'error');
    }
  };

  // Funkcje do obsługi kalkulatora wagi
  const handleOpenWeightCalculator = (itemIndex) => {
    setCurrentWeightItemIndex(itemIndex);
    setWeightCalculatorOpen(true);
  };

  const handleCloseWeightCalculator = () => {
    setWeightCalculatorOpen(false);
    setCurrentWeightItemIndex(null);
  };

  const handleAcceptWeight = (calculatedWeight) => {
    if (currentWeightItemIndex !== null) {
      setFormData(prev => {
        const updatedItems = [...prev.items];
        updatedItems[currentWeightItemIndex] = {
          ...updatedItems[currentWeightItemIndex],
          weight: calculatedWeight.toString()
        };
        
        // Przelicz podsumowanie wagi po zmianie
        setTimeout(() => calculateWeightSummary(updatedItems), 100);
        
        return { ...prev, items: updatedItems };
      });
      
      showMessage(`Zastosowano obliczoną wagę: ${calculatedWeight} kg`, 'success');
    }
  };

  // Funkcja do pobierania danych magazynowych z cache z TTL
  const getInventoryDataCached = async (linkedBatches) => {
    if (!linkedBatches || linkedBatches.length === 0) {
      return null;
    }

    const firstBatch = linkedBatches[0];
    if (!firstBatch.itemId) {
      return null;
    }

    const now = Date.now();
    
    // Sprawdź cache z TTL
    if (inventoryDataCache.has(firstBatch.itemId)) {
      const cacheEntry = inventoryDataCache.get(firstBatch.itemId);
      
      // Sprawdź czy cache nie wygasł
      if (now - cacheEntry.timestamp < CACHE_TTL) {
        return cacheEntry.data;
      } else {
        // Usuń wygasły wpis z cache
        setInventoryDataCache(prev => {
          const newCache = new Map(prev);
          newCache.delete(firstBatch.itemId);
          return newCache;
        });
      }
    }

    // Pobierz z bazy danych i zapisz w cache z timestampem
    try {
      const inventoryData = await getInventoryDataFromBatches(linkedBatches);
      if (inventoryData) {
        const cacheEntry = {
          data: inventoryData,
          timestamp: now
        };
        setInventoryDataCache(prev => new Map(prev.set(firstBatch.itemId, cacheEntry)));
      }
      return inventoryData;
    } catch (error) {
      console.error('Błąd podczas pobierania danych magazynowych:', error);
      return null;
    }
  };

  // Funkcja do wyliczania szczegółów wagi dla pojedynczej pozycji
  const calculateItemWeightDetails = async (item) => {
    if (!item.linkedBatches || item.linkedBatches.length === 0) {
      return {
        hasDetailedData: false,
        palletsCount: 0,
        pallets: [],
        boxesCount: 0,
        boxes: { fullBox: null, partialBox: null }
      };
    }

    try {
      const inventoryData = await getInventoryDataCached(item.linkedBatches);
      
      if (inventoryData) {
        const palletData = calculatePalletWeights({
          quantity: parseFloat(item.quantity) || 0,
          unitWeight: inventoryData.weight || 0,
          itemsPerBox: inventoryData.itemsPerBox || 0,
          boxesPerPallet: inventoryData.boxesPerPallet || 0
        });

        // Oblicz szczegóły kartonów tylko jeśli pozycja ma kartony
        let boxData = { fullBox: null, partialBox: null, totalBoxes: 0 };
        if (inventoryData.itemsPerBox && inventoryData.itemsPerBox > 0) {
          boxData = calculateBoxWeights({
            quantity: parseFloat(item.quantity) || 0,
            unitWeight: inventoryData.weight || 0,
            itemsPerBox: inventoryData.itemsPerBox
          });
        }

        return {
          hasDetailedData: true,
          palletsCount: palletData.palletsCount,
          pallets: palletData.pallets,
          boxesCount: boxData.totalBoxes,
          boxes: boxData,
          hasBoxes: inventoryData.itemsPerBox && inventoryData.itemsPerBox > 0
        };
      }
    } catch (error) {
      console.error('Błąd podczas wyliczania szczegółów wagi:', error);
    }

    return {
      hasDetailedData: false,
      palletsCount: 0,
      pallets: [],
      boxesCount: 0,
      boxes: { fullBox: null, partialBox: null }
    };
  };

  // Funkcja do automatycznego wyliczania i zastępowania wagi pozycji
  const calculateAndSetItemWeight = async (itemIndex, item) => {
    if (!item.linkedBatches || item.linkedBatches.length === 0) {
      return;
    }

    try {
      const inventoryData = await getInventoryDataCached(item.linkedBatches);
      
      if (inventoryData && inventoryData.weight && inventoryData.itemsPerBox && inventoryData.boxesPerPallet) {
        const quantity = parseFloat(item.quantity) || 0;
        
        if (quantity > 0) {
          // Oblicz wagę używając kalkulatora
          const weightData = calculateCmrItemWeight({
            quantity: quantity,
            unitWeight: inventoryData.weight,
            itemsPerBox: inventoryData.itemsPerBox,
            boxesPerPallet: inventoryData.boxesPerPallet
          });

          // Oblicz ilość palet
          const palletData = calculatePalletWeights({
            quantity: quantity,
            unitWeight: inventoryData.weight,
            itemsPerBox: inventoryData.itemsPerBox,
            boxesPerPallet: inventoryData.boxesPerPallet
          });

          // Zastąp wagę i ilość palet w pozycji
          setFormData(prev => {
            const updatedItems = [...prev.items];
            updatedItems[itemIndex] = {
              ...updatedItems[itemIndex],
              weight: weightData.totalWeight.toString(),
              palletsCount: palletData.palletsCount
            };
            
            // Przelicz podsumowanie wagi po automatycznej zmianie
            setTimeout(() => calculateWeightSummary(updatedItems), 100);
            
            return { ...prev, items: updatedItems };
          });

          showMessage(`Automatycznie obliczono wagę: ${weightData.totalWeight} kg i ilość palet: ${palletData.palletsCount}`, 'success');
        }
      }
    } catch (error) {
      console.error('Błąd podczas automatycznego obliczania wagi:', error);
    }
  };

  // Funkcja do wyliczania podsumowania wagi CMR
  const calculateWeightSummary = async (items = formData.items) => {
    let totalWeight = 0;
    let totalPallets = 0;
    const itemsWeightBreakdown = [];

    for (const item of items) {
      const weight = parseFloat(item.weight) || 0;
      totalWeight += weight;

      // Jeśli pozycja ma powiązane partie, wylicz szczegóły palet
      if (item.linkedBatches && item.linkedBatches.length > 0) {
        try {
          const inventoryData = await getInventoryDataCached(item.linkedBatches);
          
          if (inventoryData) {
            const palletData = calculatePalletWeights({
              quantity: parseFloat(item.quantity) || 0,
              unitWeight: inventoryData.weight || 0,
              itemsPerBox: inventoryData.itemsPerBox || 0,
              boxesPerPallet: inventoryData.boxesPerPallet || 0
            });

            // Oblicz szczegóły kartonów tylko jeśli pozycja ma kartony
            let boxData = { fullBox: null, partialBox: null, totalBoxes: 0 };
            if (inventoryData.itemsPerBox && inventoryData.itemsPerBox > 0) {
              boxData = calculateBoxWeights({
                quantity: parseFloat(item.quantity) || 0,
                unitWeight: inventoryData.weight || 0,
                itemsPerBox: inventoryData.itemsPerBox
              });
            }

            totalPallets += palletData.palletsCount;

            itemsWeightBreakdown.push({
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              weight: weight,
              barcode: inventoryData.barcode, // Dodaj kod kreskowy
              palletsCount: palletData.palletsCount,
              pallets: palletData.pallets,
              boxesCount: boxData.totalBoxes,
              boxes: boxData,
              hasDetailedData: true,
              hasBoxes: inventoryData.itemsPerBox && inventoryData.itemsPerBox > 0,
              linkedBatches: item.linkedBatches,
              inventoryData: {
                itemsPerBox: inventoryData.itemsPerBox || 0,
                boxesPerPallet: inventoryData.boxesPerPallet || 0,
                unitWeight: inventoryData.weight,
                barcode: inventoryData.barcode
              }
            });
          } else {
            // Brak szczegółowych danych magazynowych
            itemsWeightBreakdown.push({
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              weight: weight,
              barcode: inventoryData?.barcode || null, // Dodaj kod kreskowy jeśli dostępny
              palletsCount: 0,
              pallets: [],
              boxesCount: 0,
              boxes: { fullBox: null, partialBox: null },
              hasDetailedData: false,
              linkedBatches: item.linkedBatches,
              inventoryData: null
            });
          }
        } catch (error) {
          console.error('Błąd podczas wyliczania wagi palet dla pozycji:', error);
          itemsWeightBreakdown.push({
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            weight: weight,
            barcode: null, // Brak kodu kreskowego przy błędzie
            palletsCount: 0,
            pallets: [],
            boxesCount: 0,
            boxes: { fullBox: null, partialBox: null },
            hasDetailedData: false,
            linkedBatches: item.linkedBatches,
            inventoryData: null
          });
        }
      } else {
        // Pozycja bez powiązanych partii
        itemsWeightBreakdown.push({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          weight: weight,
          barcode: null, // Brak kodu kreskowego bez powiązanych partii
          palletsCount: 0,
          pallets: [],
          boxesCount: 0,
          boxes: { fullBox: null, partialBox: null },
          hasDetailedData: false,
          linkedBatches: item.linkedBatches || [],
          inventoryData: null
        });
      }
    }

    setWeightSummary({
      totalWeight: Number(totalWeight.toFixed(3)),
      totalPallets,
      itemsWeightBreakdown
    });
  };
  
  // Funkcja do ładowania dostępnych zamówień klienta (CO)
  const loadAvailableOrders = async () => {
    try {
      // Pobierz zamówienia klienta (CO) z bazy danych
      // Filtrujemy tylko zamówienia klienta (nie zamówienia zakupu)
      const orders = await getAllOrders();
      // Filtrujemy zamówienia, które nie mają typu 'purchase'
      const customerOrders = orders.filter(order => order.type !== 'purchase');
      setAvailableOrders(customerOrders);
      
      if (customerOrders.length > 0) {
        showMessage(`Załadowano ${customerOrders.length} zamówień klienta`, 'info');
      } else {
        showMessage('Nie znaleziono żadnych zamówień klienta', 'warning');
      }
    } catch (error) {
      console.error('Błąd podczas pobierania zamówień klienta:', error);
      showMessage('Wystąpił błąd podczas pobierania zamówień klienta', 'error');
    }
  };
  
  useEffect(() => {
    if (initialData) {
      // Funkcja pomocnicza do konwersji dat
      const convertDate = (dateValue) => {
        console.log('CmrForm convertDate - wejście:', dateValue, 'typ:', typeof dateValue);
        
        if (!dateValue) {
          console.log('CmrForm convertDate - brak wartości, zwracam null');
          return null;
        }
        
        // Jeśli to już obiekt Date
        if (dateValue instanceof Date) {
          console.log('CmrForm convertDate - już obiekt Date:', dateValue);
          return dateValue;
        }
        
        // Obsługa timestampu Firestore
        if (dateValue && typeof dateValue === 'object' && typeof dateValue.toDate === 'function') {
          const converted = dateValue.toDate();
          console.log('CmrForm convertDate - skonwertowano Firestore Timestamp:', converted);
          return converted;
        }
        
        // Obsługa obiektów z sekundami (Firestore Timestamp format)
        if (dateValue && typeof dateValue === 'object' && dateValue.seconds) {
          const converted = new Date(dateValue.seconds * 1000);
          console.log('CmrForm convertDate - skonwertowano obiekt z sekundami:', converted);
          return converted;
        }
        
        // Obsługa stringów i innych formatów
        try {
          const converted = new Date(dateValue);
          console.log('CmrForm convertDate - skonwertowano string/inne:', converted);
          return converted;
        } catch (e) {
          console.warn('CmrForm convertDate - Nie można skonwertować daty:', dateValue, e);
          return null;
        }
      };
      
      console.log('CmrForm - initialData:', initialData);
      
      // Konwertuj daty z różnych formatów na obiekty Date
      const processedData = {
        ...initialData,
        issueDate: convertDate(initialData.issueDate) || new Date(),
        deliveryDate: convertDate(initialData.deliveryDate),
        loadingDate: convertDate(initialData.loadingDate),
        items: initialData.items || []
      };
      
      console.log('CmrForm - processedData po konwersji dat:', processedData);
      
      setFormData(processedData);
    }
    
    // Załaduj listę dostępnych zamówień klienta
    loadAvailableOrders();
    
    // Załaduj dane firmy i uzupełnij pole nadawcy
    loadCompanyData();
  }, [initialData]);
  
  // Przelicz podsumowanie wagi gdy zmienią się pozycje (tylko przy dodaniu/usunięciu pozycji)
  useEffect(() => {
    if (formData.items && formData.items.length > 0) {
      calculateWeightSummary(formData.items);
    }
  }, [formData.items.length]);

  // Czyszczenie cache co 5 minut
  useEffect(() => {
    const interval = setInterval(cleanExpiredCache, CACHE_TTL);
    return () => clearInterval(interval);
  }, []);

  // Pobieranie listy przewoźników
  useEffect(() => {
    const fetchCarriers = async () => {
      setCarriersLoading(true);
      try {
        const carriersList = await getAllCarriers();
        setCarriers(carriersList);
      } catch (error) {
        console.error('Błąd podczas pobierania przewoźników:', error);
      } finally {
        setCarriersLoading(false);
      }
    };
    
    fetchCarriers();
  }, []);

  // Załaduj powiązane zamówienia gdy są dostępne linkedOrderIds
  useEffect(() => {
    const loadLinkedOrders = async () => {
      if (formData.linkedOrderIds && formData.linkedOrderIds.length > 0) {
        try {
          const ordersToLoad = formData.linkedOrderIds.filter(orderId => 
            !linkedOrders.some(order => order.id === orderId)
          );
          
          if (ordersToLoad.length > 0) {
            const orders = await Promise.all(
              ordersToLoad.map(orderId => getOrderById(orderId))
            );
            
            const validOrders = orders.filter(order => order !== null);
            setLinkedOrders(prev => [...prev, ...validOrders]);
            
            // Dodaj pozycje z wszystkich zamówień
            const allOrderItems = [];
            validOrders.forEach(order => {
              if (order.items && order.items.length > 0) {
                const itemsWithOrderInfo = order.items.map(item => ({
                  ...item,
                  orderId: order.id,
                  orderNumber: order.orderNumber
                }));
                allOrderItems.push(...itemsWithOrderInfo);
              }
            });
            
            setAvailableOrderItems(prev => [...prev, ...allOrderItems]);
          }
        } catch (error) {
          console.error('Błąd podczas ładowania powiązanych zamówień:', error);
          showMessage('Błąd podczas ładowania powiązanych zamówień', 'error');
        }
      }
    };
    
    loadLinkedOrders();
  }, [formData.linkedOrderIds]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    // Usuń błąd po edycji pola
    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };
  
  const handleDateChange = (name, date) => {
    console.log('CmrForm handleDateChange - pole:', name, 'nowa wartość:', date, 'typ:', typeof date);
    setFormData(prev => ({ ...prev, [name]: date }));
    // Usuń błąd po edycji pola
    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };
  
  const handleItemChange = (index, field, value) => {
    setFormData(prev => {
      const updatedItems = [...prev.items];
      updatedItems[index] = { ...updatedItems[index], [field]: value };
      
      // Automatycznie przelicz wagę gdy zmienia się ilość i są powiązane partie
      if (field === 'quantity' && updatedItems[index].linkedBatches && updatedItems[index].linkedBatches.length > 0) {
        setTimeout(() => calculateAndSetItemWeight(index, updatedItems[index]), 300);
      } else {
        // Przelicz tylko podsumowanie dla innych zmian
        setTimeout(() => calculateWeightSummary(updatedItems), 100);
      }
      
      return { ...prev, items: updatedItems };
    });
  };
  
  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { ...emptyItem }]
    }));
  };
  
  // Nowa funkcja do dodawania pozycji z zamówienia - z automatycznym wyszukiwaniem przez receptury
  const addItemFromOrder = async (orderItem) => {
    const newItem = {
      description: orderItem.name || '',
      quantity: orderItem.quantity || '',
      unit: orderItem.unit || 'szt.',
      weight: orderItem.weight || '',
      volume: orderItem.volume || '',
      notes: `Importowano z zamówienia ${orderItem.orderNumber}`,
      linkedBatches: [],
      palletsCount: 0,
      orderItemId: orderItem.id,
      orderId: orderItem.orderId,
      orderNumber: orderItem.orderNumber,
      // Dodaj informacje o potencjalnej recepturze
      originalOrderItem: orderItem
    };

    // Spróbuj automatycznie znaleźć pozycję magazynową na podstawie receptury
    try {
      // Import potrzebnych funkcji
      const { getAllRecipes } = await import('../../../services/recipeService');
      const { getInventoryItemByRecipeId } = await import('../../../services/inventory');
      
      // Pobierz receptury
      const recipes = await getAllRecipes();
      
      // Znajdź recepturę odpowiadającą nazwie pozycji z zamówienia
      const matchingRecipe = recipes.find(recipe => {
        const recipeName = recipe.name.toLowerCase();
        const itemName = orderItem.name.toLowerCase();
        
        // Szukaj dokładnego dopasowania lub częściowego
        return recipeName === itemName || 
               recipeName.includes(itemName) || 
               itemName.includes(recipeName);
      });

      if (matchingRecipe) {
        // Sprawdź czy receptura ma powiązaną pozycję magazynową
        const inventoryItem = await getInventoryItemByRecipeId(matchingRecipe.id);
        
        if (inventoryItem) {
          newItem.notes += ` | Znaleziono pozycję magazynową "${inventoryItem.name}" na podstawie receptury "${matchingRecipe.name}"`;
          newItem.suggestedInventoryItem = inventoryItem;
          newItem.matchedRecipe = matchingRecipe;
          
          console.log(`Automatycznie dopasowano pozycję magazynową "${inventoryItem.name}" dla pozycji CMR "${orderItem.name}" na podstawie receptury "${matchingRecipe.name}"`);
          showMessage(`Dodano pozycję "${orderItem.name}" z sugerowaną pozycją magazynową "${inventoryItem.name}" (z receptury)`, 'success');
        } else {
          showMessage(`Dodano pozycję "${orderItem.name}" z zamówienia. Znaleziono recepturę "${matchingRecipe.name}", ale brak powiązanej pozycji magazynowej`, 'info');
        }
      } else {
        showMessage(`Dodano pozycję "${orderItem.name}" z zamówienia`, 'success');
      }
    } catch (error) {
      console.error('Błąd podczas automatycznego dopasowywania pozycji magazynowej:', error);
      showMessage(`Dodano pozycję "${orderItem.name}" z zamówienia`, 'success');
    }
    
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));
  };
  
  // Funkcja do usuwania powiązanego zamówienia
  const removeLinkedOrder = (orderId) => {
    setLinkedOrders(prev => prev.filter(order => order.id !== orderId));
    setAvailableOrderItems(prev => prev.filter(item => item.orderId !== orderId));
    
    // Zaktualizuj formData
    setFormData(prev => {
      const updatedForm = { ...prev };
      if (updatedForm.linkedOrderIds) {
        updatedForm.linkedOrderIds = updatedForm.linkedOrderIds.filter(id => id !== orderId);
      }
      if (updatedForm.linkedOrderNumbers) {
        const orderToRemove = linkedOrders.find(order => order.id === orderId);
        if (orderToRemove) {
          updatedForm.linkedOrderNumbers = updatedForm.linkedOrderNumbers.filter(
            num => num !== orderToRemove.orderNumber
          );
        }
      }
      return updatedForm;
    });
    
    showMessage('Usunięto powiązanie z zamówieniem', 'info');
  };
  
  const removeItem = (index) => {
    setFormData(prev => {
      const updatedItems = [...prev.items];
      updatedItems.splice(index, 1);
      return { ...prev, items: updatedItems };
    });
  };

  // Obsługa wyboru przewoźnika z dropdowna
  const handleCarrierSelect = (event, newValue) => {
    if (newValue && newValue.id === 'ADD_NEW') {
      // Otwórz dialog dodawania nowego przewoźnika
      setCarrierDialogMode('add');
      setCarrierDialogOpen(true);
      return;
    }
    
    setSelectedCarrier(newValue);
    
    if (newValue) {
      // Uzupełnij dane przewoźnika w formularzu
      setFormData(prev => ({
        ...prev,
        carrier: newValue.name,
        carrierAddress: newValue.address || '',
        carrierPostalCode: newValue.postalCode || '',
        carrierCity: newValue.city || '',
        carrierCountry: newValue.country || ''
      }));
    } else {
      // Wyczyść dane przewoźnika
      setFormData(prev => ({
        ...prev,
        carrier: '',
        carrierAddress: '',
        carrierPostalCode: '',
        carrierCity: '',
        carrierCountry: ''
      }));
    }
  };

  // Obsługa zmiany pól w dialogu nowego przewoźnika
  const handleNewCarrierChange = (e) => {
    const { name, value } = e.target;
    setNewCarrierData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Zapisanie nowego lub edytowanego przewoźnika
  const handleSaveCarrier = async () => {
    if (!newCarrierData.name.trim()) {
      showMessage('Nazwa przewoźnika jest wymagana', 'error');
      return;
    }
    
    setSavingCarrier(true);
    try {
      let savedCarrier;
      
      if (carrierDialogMode === 'edit' && editingCarrierId) {
        // Edycja istniejącego przewoźnika
        savedCarrier = await updateCarrier(editingCarrierId, newCarrierData);
        savedCarrier.id = editingCarrierId;
        
        // Zaktualizuj listę przewoźników
        setCarriers(prev => 
          prev.map(c => c.id === editingCarrierId ? { ...c, ...newCarrierData } : c)
            .sort((a, b) => a.name.localeCompare(b.name))
        );
        
        // Jeśli edytowany przewoźnik był wybrany, zaktualizuj dane w formularzu
        if (selectedCarrier?.id === editingCarrierId) {
          setSelectedCarrier({ ...selectedCarrier, ...newCarrierData });
          setFormData(prev => ({
            ...prev,
            carrier: newCarrierData.name,
            carrierAddress: newCarrierData.address || '',
            carrierPostalCode: newCarrierData.postalCode || '',
            carrierCity: newCarrierData.city || '',
            carrierCountry: newCarrierData.country || ''
          }));
        }
        
        showMessage('Przewoźnik został zaktualizowany', 'success');
      } else {
        // Dodanie nowego przewoźnika
        savedCarrier = await createCarrier(newCarrierData, currentUser?.uid);
        
        // Dodaj nowego przewoźnika do listy
        setCarriers(prev => [...prev, savedCarrier].sort((a, b) => a.name.localeCompare(b.name)));
        
        // Wybierz nowo utworzonego przewoźnika
        setSelectedCarrier(savedCarrier);
        setFormData(prev => ({
          ...prev,
          carrier: savedCarrier.name,
          carrierAddress: savedCarrier.address || '',
          carrierPostalCode: savedCarrier.postalCode || '',
          carrierCity: savedCarrier.city || '',
          carrierCountry: savedCarrier.country || ''
        }));
        
        showMessage('Przewoźnik został dodany', 'success');
      }
      
      // Zamknij dialog i wyczyść formularz
      handleCloseCarrierDialog();
    } catch (error) {
      console.error('Błąd podczas zapisywania przewoźnika:', error);
      showMessage('Błąd podczas zapisywania przewoźnika', 'error');
    } finally {
      setSavingCarrier(false);
    }
  };

  // Otwórz dialog edycji przewoźnika
  const handleEditCarrier = (carrier, e) => {
    e.stopPropagation(); // Zapobiegaj wyborowi opcji w dropdown
    setCarrierDialogMode('edit');
    setEditingCarrierId(carrier.id);
    setNewCarrierData({
      name: carrier.name || '',
      address: carrier.address || '',
      postalCode: carrier.postalCode || '',
      city: carrier.city || '',
      country: carrier.country || 'Polska',
      nip: carrier.nip || '',
      phone: carrier.phone || '',
      email: carrier.email || ''
    });
    setCarrierDialogOpen(true);
  };

  // Otwórz dialog potwierdzenia usunięcia
  const handleOpenDeleteCarrierDialog = (carrier, e) => {
    e.stopPropagation(); // Zapobiegaj wyborowi opcji w dropdown
    setCarrierToDelete(carrier);
    setDeleteCarrierDialogOpen(true);
  };

  // Usunięcie przewoźnika
  const handleConfirmDeleteCarrier = async () => {
    if (!carrierToDelete) return;
    
    setDeletingCarrier(true);
    try {
      await deleteCarrier(carrierToDelete.id);
      
      // Usuń z listy
      setCarriers(prev => prev.filter(c => c.id !== carrierToDelete.id));
      
      // Jeśli usunięty przewoźnik był wybrany, wyczyść selekcję
      if (selectedCarrier?.id === carrierToDelete.id) {
        setSelectedCarrier(null);
        setFormData(prev => ({
          ...prev,
          carrier: '',
          carrierAddress: '',
          carrierPostalCode: '',
          carrierCity: '',
          carrierCountry: ''
        }));
      }
      
      showMessage('Przewoźnik został usunięty', 'success');
      setDeleteCarrierDialogOpen(false);
      setCarrierToDelete(null);
    } catch (error) {
      console.error('Błąd podczas usuwania przewoźnika:', error);
      showMessage('Błąd podczas usuwania przewoźnika', 'error');
    } finally {
      setDeletingCarrier(false);
    }
  };

  // Zamknij dialog przewoźnika i wyczyść dane
  const handleCloseCarrierDialog = () => {
    setCarrierDialogOpen(false);
    setCarrierDialogMode('add');
    setEditingCarrierId(null);
    setNewCarrierData({
      name: '',
      address: '',
      postalCode: '',
      city: '',
      country: 'Polska',
      nip: '',
      phone: '',
      email: ''
    });
  };
  
  const validateForm = (skipBatchValidation = false) => {
    const errors = {};
    
    // Walidacja powiązania z CO
    if (linkedOrders.length === 0 && !formData.linkedOrderId) {
      errors.linkedOrderId = 'CMR musi być powiązany z co najmniej jednym zamówieniem klienta (CO)';
    }
    
    // Wymagane pola podstawowe
    if (!formData.sender) errors.sender = 'Nadawca jest wymagany';
    if (!formData.senderAddress) errors.senderAddress = 'Adres nadawcy jest wymagany';
    if (!formData.recipient) errors.recipient = 'Odbiorca jest wymagany';
    if (!formData.recipientAddress) errors.recipientAddress = 'Pełny adres odbiorcy jest wymagany';
    if (!formData.carrier) errors.carrier = 'Przewoźnik jest wymagany';
    if (!formData.carrierAddress) errors.carrierAddress = 'Adres przewoźnika jest wymagany';
    
    // Walidacja miejsca załadunku i rozładunku
    if (!formData.loadingPlace) errors.loadingPlace = 'Miejsce załadunku jest wymagane';
    if (!formData.deliveryPlace) errors.deliveryPlace = 'Miejsce rozładunku jest wymagane';
    
    // Walidacja dat
    if (!formData.issueDate) errors.issueDate = 'Data wystawienia jest wymagana';
    
    // Upewnij się, że pola specjalnych ustaleń i zastrzeżeń są zdefiniowane
    if (formData.specialAgreements === undefined) {
      formData.specialAgreements = '';
    }
    
    if (formData.reservations === undefined) {
      formData.reservations = '';
    }
    
    if (formData.notes === undefined) {
      formData.notes = '';
    }
    
    // Walidacja przedmiotów
    const itemErrors = [];
    formData.items.forEach((item, index) => {
      const itemError = {};
      if (!item.description) itemError.description = 'Opis jest wymagany';
      if (!item.quantity) itemError.quantity = 'Ilość jest wymagana';
      if (!item.unit) itemError.unit = 'Jednostka jest wymagana';
      
      // Walidacja powiązania z partiami magazynowymi - pomijamy dla statusu 'Szkic'
      if (!skipBatchValidation && (!item.linkedBatches || item.linkedBatches.length === 0)) {
        itemError.linkedBatches = 'Każda pozycja musi być powiązana z przynajmniej jedną partią magazynową';
      }
      
      if (Object.keys(itemError).length > 0) {
        itemErrors[index] = itemError;
      }
    });
    
    if (itemErrors.length > 0 && itemErrors.some(item => item !== undefined)) {
      errors.items = itemErrors;
    }
    
    console.log('Błędy walidacji formularza przed zapisaniem:', errors);
    console.log('Liczba błędów:', Object.keys(errors).length);
    
    setFormErrors(errors);
    const isValid = Object.keys(errors).length === 0;
    console.log('Formularz jest poprawny:', isValid);
    return isValid;
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    console.log('Próba wysłania formularza CMR:', formData);
    console.log('CmrForm handleSubmit - daty w formData:', {
      issueDate: formData.issueDate,
      deliveryDate: formData.deliveryDate,
      loadingDate: formData.loadingDate
    });
    
    // Upewnij się, że wszystkie pola są poprawnie uwzględnione przed wysłaniem formularza
    const dataToSubmit = {
      ...formData,
      // Upewnij się, że te pola są poprawnie przekazywane
      specialAgreements: formData.specialAgreements || '',
      reservations: formData.reservations || '',
      notes: formData.notes || ''
    };
    
    console.log('CmrForm handleSubmit - daty w dataToSubmit:', {
      issueDate: dataToSubmit.issueDate,
      deliveryDate: dataToSubmit.deliveryDate,
      loadingDate: dataToSubmit.loadingDate
    });
    
    // Upewnij się, że vehicleInfo jest zdefiniowane
    if (!dataToSubmit.vehicleInfo) dataToSubmit.vehicleInfo = {};
    
    // Pomiń walidację partii jeśli CMR jest w stanie 'Szkic'
    const skipBatchValidation = formData.status === CMR_STATUSES.DRAFT;
    const isValid = validateForm(skipBatchValidation);
    console.log('Wynik walidacji:', isValid);
    
    if (isValid) {
      console.log('Formularz jest poprawny, wysyłanie danych:', dataToSubmit);
      try {
        onSubmit(dataToSubmit);
      } catch (error) {
        console.error('Błąd podczas próby wywołania onSubmit:', error);
      }
    } else {
      console.log('Formularz zawiera błędy, nie można go wysłać');
    }
  };
  
  // Funkcja obsługująca zmianę opcji importu
  const handleImportOptionChange = (event) => {
    const { name, checked } = event.target;
    setImportOptions(prev => ({
      ...prev,
      [name]: checked
    }));
  };
  
  // Nowa funkcja do obsługi otwierania dialogu wyboru zamówienia klienta (CO)
  const handleOpenOrderDialog = () => {
    // Resetujemy stan i przywracamy domyślne opcje importu
    setOrderSearchQuery('');
    setSelectedOrderId('');
    setImportOptions({
      recipientData: true,
      deliveryPlace: true,
      deliveryDate: true,
      documents: true
    });
    setIsOrderDialogOpen(true);
  };
  
  // Nowa funkcja do obsługi zamykania dialogu wyboru zamówienia klienta (CO)
  const handleCloseOrderDialog = () => {
    setIsOrderDialogOpen(false);
  };
  
  // Nowa funkcja do obsługi wyboru zamówienia klienta (CO)
  const handleOrderSelect = async (orderId) => {
    if (!orderId) return;
    
    setIsLoadingOrder(true);
    
    try {
      // Pobierz dane zamówienia klienta na podstawie ID
      const order = await getOrderById(orderId);
      
      if (!order) {
        showMessage('Nie można znaleźć zamówienia o podanym ID', 'error');
        return;
      }
      
      // Jeśli zamówienie ma referencję do klienta, ale brakuje niektórych danych, spróbuj pobrać pełne dane klienta
      let customerData = order.customer || {};
      let customerDataSource = 'zamówienia';
      
      if (importOptions.recipientData && order.customer?.id && (!order.customer.postalCode || !order.customer.city || !order.customer.country)) {
        try {
          const fullCustomerData = await getCustomerById(order.customer.id);
          if (fullCustomerData) {
            customerData = {
              ...order.customer,
              ...fullCustomerData,
              // Zachowaj id z oryginalnych danych, na wypadek gdyby getCustomerById zwróciło inne id
              id: order.customer.id
            };
            customerDataSource = 'pełnych danych klienta';
          }
        } catch (customerError) {
          console.warn('Nie udało się pobrać pełnych danych klienta:', customerError);
          // Kontynuuj z dostępnymi danymi klienta
        }
      }
      
      // Przygotuj podsumowanie pobranych danych
      const importedDataSummary = [];
      
      // Uzupełnij formularz danymi z zamówienia
      setFormData(prev => {
        // Zachowujemy istniejące elementy formularza i nadpisujemy tylko te, które chcemy zaktualizować
        const updatedForm = { ...prev };
        
        // Zapisz powiązanie z zamówieniem (dodaj do istniejących)
        if (!updatedForm.linkedOrderIds) updatedForm.linkedOrderIds = [];
        if (!updatedForm.linkedOrderNumbers) updatedForm.linkedOrderNumbers = [];
        
        if (!updatedForm.linkedOrderIds.includes(orderId)) {
          updatedForm.linkedOrderIds.push(orderId);
          updatedForm.linkedOrderNumbers.push(order.orderNumber);
        }
        
        // Zachowaj kompatybilność z poprzednim formatem
        updatedForm.linkedOrderId = orderId;
        updatedForm.linkedOrderNumber = order.orderNumber;
        
        // Dane odbiorcy (klient z zamówienia)
        if (importOptions.recipientData) {
          updatedForm.recipient = customerData.name || '';
          
          // Użyj adresu do wysyłki jeśli dostępny, w przeciwnym razie adres do faktury, lub stary format adresu
          const recipientAddress = customerData.shippingAddress || 
                                  customerData.billingAddress || 
                                  customerData.address || '';
          
          updatedForm.recipientAddress = recipientAddress;
          
          importedDataSummary.push('Dane odbiorcy');
        }
        
        // Miejsce dostawy
        if (importOptions.deliveryPlace) {
          updatedForm.deliveryPlace = order.shippingAddress || customerData.shippingAddress || customerData.address || '';
          importedDataSummary.push('Miejsce dostawy');
        }
        

        
        // Dodajemy numer zamówienia jako dokument załączony
        if (importOptions.documents) {
          updatedForm.attachedDocuments = prev.attachedDocuments ? 
            `${prev.attachedDocuments}, Zamówienie nr ${order.orderNumber}` : 
            `Zamówienie nr ${order.orderNumber}`;
          importedDataSummary.push('Dokumenty');
        }
        
        // Usunęliśmy automatyczne dodawanie pozycji - użytkownik będzie mógł je dodać ręcznie
        
        return updatedForm;
      });
      
      // Zapisz dane zamówienia i jego pozycje dla późniejszego użycia
      setLinkedOrders(prev => {
        const existing = prev.find(o => o.id === order.id);
        if (existing) {
          return prev; // Zamówienie już jest na liście
        }
        return [...prev, order];
      });
      
      // Zaktualizuj listę dostępnych pozycji ze wszystkich zamówień
      setAvailableOrderItems(prev => {
        const existingItems = prev.filter(item => item.orderId !== order.id);
        const newItems = (order.items || []).map(item => ({
          ...item,
          orderId: order.id,
          orderNumber: order.orderNumber
        }));
        return [...existingItems, ...newItems];
      });
      
      // Wyświetl podsumowanie pobranych danych
      const summaryMessage = `Pomyślnie powiązano CMR z zamówieniem ${order.orderNumber}. 
Zaimportowano: ${importedDataSummary.join(', ')}.
${importOptions.recipientData ? `Źródło danych klienta: ${customerDataSource}.` : ''}
Pozycje z zamówienia będą dostępne do dodania w sekcji "Elementy dokumentu CMR".`;
      
      showMessage(summaryMessage, 'success');
      setIsOrderDialogOpen(false);
    } catch (error) {
      console.error('Błąd podczas pobierania danych zamówienia:', error);
      showMessage('Wystąpił błąd podczas pobierania danych zamówienia', 'error');
    } finally {
      setIsLoadingOrder(false);
    }
  };
  
  // Pomocnicza funkcja do ekstrakcji szczegółów adresowych (jeśli potrzebna)
  const extractAddressDetails = (fullAddress) => {
    if (!fullAddress) return {};
    
    // Próba wyodrębnienia kodu pocztowego i miasta
    // Typowy format polskiego adresu: "ul. Przykładowa 123, 00-000 Miasto"
    const postalCodeMatch = fullAddress.match(/(\d{2}-\d{3})\s+([^,]+)/);
    if (postalCodeMatch) {
      return {
        recipientPostalCode: postalCodeMatch[1],
        recipientCity: postalCodeMatch[2]
      };
    }
    
    return {};
  };
  
  // Nowa funkcja do wyszukiwania zamówienia po numerze CO
  const handleFindOrderByNumber = async () => {
    if (!orderSearchQuery) {
      showMessage('Wprowadź numer zamówienia', 'warning');
      return;
    }
    
    setIsLoadingOrder(true);
    
    try {
      // Użyj nowej funkcji searchOrdersByNumber do wyszukiwania zamówień
      const foundOrders = await searchOrdersByNumber(orderSearchQuery, true);
      
      if (foundOrders.length > 0) {
        // Jeśli znaleziono dokładnie jedno pasujące zamówienie, wybierz je automatycznie
        if (foundOrders.length === 1) {
          handleOrderSelect(foundOrders[0].id);
        } else {
          // Jeśli znaleziono więcej niż jedno, pokaż je w dropdownie
          setAvailableOrders(foundOrders);
          showMessage(`Znaleziono ${foundOrders.length} zamówień. Wybierz jedno z listy.`, 'info');
        }
      } else {
        showMessage('Nie znaleziono zamówienia o podanym numerze', 'warning');
      }
    } catch (error) {
      console.error('Błąd podczas wyszukiwania zamówienia:', error);
      showMessage('Wystąpił błąd podczas wyszukiwania zamówienia', 'error');
    } finally {
      setIsLoadingOrder(false);
    }
  };
  
  // Nowa funkcja do obsługi odświeżania listy zamówień
  const handleRefreshOrders = async () => {
    setIsLoadingOrder(true);
    try {
      await loadAvailableOrders();
    } catch (error) {
      console.error('Błąd podczas odświeżania listy zamówień:', error);
      showMessage('Wystąpił błąd podczas odświeżania listy zamówień', 'error');
    } finally {
      setIsLoadingOrder(false);
    }
  };
  
  // Funkcja obsługująca zmianę opcji importu dla nadawcy
  const handleSenderImportOptionChange = (event) => {
    const { name, checked } = event.target;
    setSenderImportOptions(prev => ({
      ...prev,
      [name]: checked
    }));
  };
  
  // Funkcja otwierająca dialog wyboru pól nadawcy
  const handleOpenSenderDialog = () => {
    // Resetujemy opcje importu do domyślnych wartości
    setSenderImportOptions({
      name: true,
      address: true,
      postalCode: true,
      city: true,
      country: true
    });
    setIsSenderDialogOpen(true);
  };
  
  // Funkcja zamykająca dialog wyboru pól nadawcy
  const handleCloseSenderDialog = () => {
    setIsSenderDialogOpen(false);
  };
  
  // Funkcja do pobierania danych firmy z bazy danych
  const loadCompanyData = async (useDialog = false) => {
    if (useDialog) {
      handleOpenSenderDialog();
      return;
    }
    
    setIsLoadingSenderData(true);
    try {
      const companyData = await getCompanyData();
      
      if (companyData) {
        // Ekstrakcja kodu pocztowego i miasta z pola city (jeśli w formacie "00-000 Miasto")
        let postalCode = '';
        let city = '';
        
        if (companyData.city) {
          const cityParts = companyData.city.split(' ');
          // Sprawdź, czy pierwszy element wygląda jak kod pocztowy (XX-XXX)
          if (cityParts.length > 1 && /^\d{2}-\d{3}$/.test(cityParts[0])) {
            postalCode = cityParts[0];
            city = cityParts.slice(1).join(' ');
          } else {
            // Jeśli nie ma formatu kodu pocztowego, użyj całej wartości jako miasto
            city = companyData.city;
          }
        }
        
        setFormData(prev => ({
          ...prev,
          sender: companyData.name || '',
          senderAddress: companyData.address || '',
          senderPostalCode: postalCode || companyData.postalCode || '',
          senderCity: city || companyData.city || '',
          senderCountry: companyData.country || 'Polska' // Domyślnie ustawiamy Polska
        }));
        
        showMessage('Dane nadawcy zostały uzupełnione danymi firmy', 'success');
      } else {
        showMessage('Nie znaleziono danych firmy', 'warning');
      }
    } catch (error) {
      console.error('Błąd podczas pobierania danych firmy:', error);
      showMessage('Wystąpił błąd podczas pobierania danych firmy', 'error');
    } finally {
      setIsLoadingSenderData(false);
    }
  };
  
  // Funkcja do importu wybranych pól nadawcy z danych firmy
  const handleImportSenderData = async () => {
    setIsLoadingSenderData(true);
    try {
      const companyData = await getCompanyData();
      
      if (companyData) {
        // Ekstrakcja kodu pocztowego i miasta z pola city (jeśli w formacie "00-000 Miasto")
        let postalCode = '';
        let city = '';
        
        if (companyData.city) {
          const cityParts = companyData.city.split(' ');
          // Sprawdź, czy pierwszy element wygląda jak kod pocztowy (XX-XXX)
          if (cityParts.length > 1 && /^\d{2}-\d{3}$/.test(cityParts[0])) {
            postalCode = cityParts[0];
            city = cityParts.slice(1).join(' ');
          } else {
            // Jeśli nie ma formatu kodu pocztowego, użyj całej wartości jako miasto
            city = companyData.city;
          }
        }
        
        // Przygotuj podsumowanie importowanych danych
        const importedFields = [];
        
        setFormData(prev => {
          const updatedForm = { ...prev };
          
          // Uzupełnij tylko wybrane pola
          if (senderImportOptions.name) {
            updatedForm.sender = companyData.name || '';
            importedFields.push('Nazwa nadawcy');
          }
          
          if (senderImportOptions.address) {
            updatedForm.senderAddress = companyData.address || '';
            importedFields.push('Adres nadawcy');
          }
          
          if (senderImportOptions.postalCode) {
            updatedForm.senderPostalCode = postalCode || companyData.postalCode || '';
            importedFields.push('Kod pocztowy');
          }
          
          if (senderImportOptions.city) {
            updatedForm.senderCity = city || companyData.city || '';
            importedFields.push('Miasto');
          }
          
          if (senderImportOptions.country) {
            updatedForm.senderCountry = companyData.country || 'Polska';
            importedFields.push('Kraj');
          }
          
          return updatedForm;
        });
        
        showMessage(`Dane nadawcy zostały zaktualizowane. Zaimportowano: ${importedFields.join(', ')}`, 'success');
      } else {
        showMessage('Nie znaleziono danych firmy', 'warning');
      }
    } catch (error) {
      console.error('Błąd podczas pobierania danych firmy:', error);
      showMessage('Wystąpił błąd podczas pobierania danych firmy', 'error');
    } finally {
      setIsLoadingSenderData(false);
      setIsSenderDialogOpen(false);
    }
  };
  
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
      <Grid container spacing={3}>
        
        {/* Dialog wyboru zamówienia klienta (CO) */}
        <Dialog open={isOrderDialogOpen} onClose={handleCloseOrderDialog} maxWidth="md" fullWidth>
          <DialogTitle>Wybierz zamówienie klienta (CO)</DialogTitle>
          <DialogContent>
            <Box sx={{ mb: 2 }}>
              <TextField
                label={t('form.searchByOrderNumber')}
                value={orderSearchQuery}
                onChange={(e) => setOrderSearchQuery(e.target.value)}
                fullWidth
                variant="outlined"
                sx={{ mb: 1 }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleFindOrderByNumber();
                  }
                }}
              />
              
              {/* Przyciski ułożone w poziomie */}
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  startIcon={<SearchIcon />}
                  onClick={handleFindOrderByNumber}
                  disabled={isLoadingOrder}
                >
                  Szukaj
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<RefreshIcon />}
                  onClick={handleRefreshOrders}
                  disabled={isLoadingOrder}
                >
                  Odśwież
                </Button>
              </Box>
            </Box>
            
            {/* Opcje importu - zwijane/rozwijane */}
            <Box sx={{ mb: 2 }}>
              <Button
                variant="text"
                onClick={() => setIsImportOptionsExpanded(!isImportOptionsExpanded)}
                sx={{ 
                  textTransform: 'none', 
                  p: 1,
                  justifyContent: 'flex-start',
                  width: '100%'
                }}
                endIcon={isImportOptionsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              >
                <Typography variant="h6">
                  Wybierz dane do importu:
                </Typography>
              </Button>
              
              <Collapse in={isImportOptionsExpanded}>
                <FormGroup sx={{ ml: 2 }}>
                  <FormControlLabel 
                    control={
                      <Checkbox 
                        checked={importOptions.recipientData} 
                        onChange={handleImportOptionChange} 
                        name="recipientData" 
                      />
                    } 
                    label="Dane odbiorcy" 
                  />
                  <FormControlLabel 
                    control={
                      <Checkbox 
                        checked={importOptions.deliveryPlace} 
                        onChange={handleImportOptionChange} 
                        name="deliveryPlace" 
                      />
                    } 
                    label="Miejsce dostawy" 
                  />

                  <FormControlLabel 
                    control={
                      <Checkbox 
                        checked={importOptions.documents} 
                        onChange={handleImportOptionChange} 
                        name="documents" 
                      />
                    } 
                    label="Informacje o dokumentach"
                  />
                </FormGroup>
              </Collapse>
            </Box>
            
            {isLoadingOrder ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
                <CircularProgress />
              </Box>
            ) : availableOrders.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 4 }}>
                <Typography variant="body1" color="text.secondary">
                  Brak dostępnych zamówień klienta
                </Typography>
              </Box>
            ) : (
              <Box sx={{ maxHeight: 300, overflow: 'auto', mt: 2 }}>
                {availableOrders.map(order => {
                  // Bezpieczne pobieranie nazwy klienta
                  const customerName = order.customer?.name || order.customerName || 'Nieznany klient';
                  
                  // Bezpieczne formatowanie daty
                  let formattedDate = 'Brak daty';
                  if (order.orderDate) {
                    try {
                      let dateObj;
                      if (order.orderDate instanceof Date) {
                        dateObj = order.orderDate;
                      } else if (order.orderDate.toDate && typeof order.orderDate.toDate === 'function') {
                        dateObj = order.orderDate.toDate();
                      } else if (typeof order.orderDate === 'string' || typeof order.orderDate === 'number') {
                        dateObj = new Date(order.orderDate);
                      }
                      
                      if (dateObj && !isNaN(dateObj.getTime())) {
                        formattedDate = dateObj.toLocaleDateString('pl-PL');
                      }
                    } catch (error) {
                      console.warn('Błąd formatowania daty zamówienia:', error);
                    }
                  }
                  
                  return (
                    <Box 
                      key={order.id}
                      sx={{ 
                        p: 2, 
                        border: (theme) => `1px solid ${theme.palette.divider}`, 
                        borderRadius: 1, 
                        mb: 1,
                        cursor: 'pointer',
                        bgcolor: 'background.paper',
                        '&:hover': { 
                          bgcolor: (theme) => theme.palette.mode === 'dark' 
                            ? 'rgba(255, 255, 255, 0.08)' 
                            : 'rgba(0, 0, 0, 0.04)',
                          borderColor: (theme) => theme.palette.mode === 'dark'
                            ? 'rgba(255, 255, 255, 0.2)'
                            : 'rgba(0, 0, 0, 0.2)'
                        },
                        transition: 'all 0.2s ease-in-out'
                      }}
                      onClick={() => handleOrderSelect(order.id)}
                    >
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Zamówienie: {order.orderNumber || `#${order.id.substring(0, 8)}`}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Klient: {customerName}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Data: {formattedDate}
                      </Typography>
                      {order.status && (
                        <Typography variant="caption" color="primary">
                          Status: {order.status}
                        </Typography>
                      )}
                    </Box>
                  );
                })}
              </Box>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseOrderDialog}>Anuluj</Button>
          </DialogActions>
        </Dialog>
        
        {/* Dialog wyboru danych nadawcy */}
        <Dialog open={isSenderDialogOpen} onClose={handleCloseSenderDialog} maxWidth="sm" fullWidth>
          <DialogTitle>Importuj dane firmy</DialogTitle>
          <DialogContent>
                <FormGroup>
              <Typography variant="h6" sx={{ mb: 1 }}>
                Wybierz dane do importu:
              </Typography>
                  <FormControlLabel 
                    control={
                      <Checkbox 
                        checked={senderImportOptions.name} 
                        onChange={handleSenderImportOptionChange} 
                        name="name" 
                      />
                    } 
                label="Nazwa firmy"
                  />
                  <FormControlLabel 
                    control={
                      <Checkbox 
                        checked={senderImportOptions.address} 
                        onChange={handleSenderImportOptionChange} 
                        name="address" 
                      />
                    } 
                label="Adres"
                  />
                  <FormControlLabel 
                    control={
                      <Checkbox 
                        checked={senderImportOptions.postalCode} 
                        onChange={handleSenderImportOptionChange} 
                        name="postalCode" 
                      />
                    } 
                    label="Kod pocztowy" 
                  />
                  <FormControlLabel 
                    control={
                      <Checkbox 
                        checked={senderImportOptions.city} 
                        onChange={handleSenderImportOptionChange} 
                        name="city" 
                      />
                    } 
                    label="Miasto" 
                  />
                  <FormControlLabel 
                    control={
                      <Checkbox 
                        checked={senderImportOptions.country} 
                        onChange={handleSenderImportOptionChange} 
                        name="country" 
                      />
                    } 
                    label="Kraj" 
                  />
                </FormGroup>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseSenderDialog}>Anuluj</Button>
            <Button 
              onClick={handleImportSenderData} 
              variant="contained"
              disabled={isLoadingSenderData}
            >
              {isLoadingSenderData ? <CircularProgress size={20} /> : 'Importuj dane'}
            </Button>
          </DialogActions>
        </Dialog>
        
        <form onSubmit={handleSubmit} style={{ width: '100%' }}>
          <Grid container spacing={3}>
        
            {/* Przyciski akcji - na górze */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2, mb: 2 }}>
                <Button 
                  variant="outlined" 
                  onClick={onCancel}
                >
                  Anuluj
                </Button>
                <Button 
                  variant="contained" 
                  color="primary" 
                  type="submit"
                  onClick={(e) => {
                    console.log('Przycisk Zapisz kliknięty');
                    handleSubmit(e);
                  }}
                >
                  Zapisz
                </Button>
              </Box>
            </Grid>
        
            {/* Status i podstawowe informacje */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
                  title="Podstawowe informacje" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <TextField
                        label="Numer CMR"
                        name="cmrNumber"
                        value={formData.cmrNumber}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                        error={formErrors.cmrNumber}
                        helperText={formErrors.cmrNumber}
                      />
                    </Grid>
                    
                    {/* Status ukryty - automatycznie ustawiony na DRAFT */}
                    
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth margin="normal">
                        <InputLabel>{t('common:common.paymentStatus')}</InputLabel>
                        <Select
                          name="paymentStatus"
                          value={formData.paymentStatus}
                          onChange={handleChange}
                          label={t('common:common.paymentStatus')}
                        >
                          <MenuItem value={CMR_PAYMENT_STATUSES.UNPAID}>
                            {translatePaymentStatus(CMR_PAYMENT_STATUSES.UNPAID)}
                          </MenuItem>
                          <MenuItem value={CMR_PAYMENT_STATUSES.PAID}>
                            {translatePaymentStatus(CMR_PAYMENT_STATUSES.PAID)}
                          </MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <DatePicker
                        label="Data wystawienia"
                        value={formData.issueDate}
                        onChange={(date) => handleDateChange('issueDate', date)}
                        slots={{
                          textField: TextField
                        }}
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            margin: "normal",
                            error: !!formErrors.issueDate,
                            helperText: formErrors.issueDate
                          }
                        }}
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <DatePicker
                        label="Data dostawy"
                        value={formData.deliveryDate}
                        onChange={(date) => handleDateChange('deliveryDate', date)}
                        slots={{
                          textField: TextField
                        }}
                        slotProps={{
                          textField: {
                            fullWidth: true,
                            margin: "normal"
                          }
                        }}
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                      <FormControl fullWidth margin="normal">
                        <InputLabel>Typ transportu</InputLabel>
                        <Select
                          name="transportType"
                          value={formData.transportType}
                          onChange={handleChange}
                          label="Typ transportu"
                        >
                          {Object.entries(TRANSPORT_TYPES).map(([key, value]) => (
                            <MenuItem key={key} value={value}>{getTransportTypeLabel(value)}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    </Grid>
                    
                    <Grid item xs={12}>
                      <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                        <Button 
                          variant={formData.linkedOrderId ? "contained" : "outlined"}
                          color={formData.linkedOrderId ? "success" : "primary"}
                          size="large" 
                          onClick={handleOpenOrderDialog}
                          fullWidth
                          sx={{ 
                            py: 1.5,
                            fontSize: '16px',
                            fontWeight: 'bold',
                            border: formErrors.linkedOrderId ? '2px solid #f44336' : undefined
                          }}
                        >
                          {linkedOrders.length > 0 
                            ? `✓ Powiązano z ${linkedOrders.length} CO` 
                            : 'Powiąż z CO (wymagane)'
                          }
                        </Button>
                      </Box>
                      
                      {/* Sekcja z powiązanymi zamówieniami */}
                      {linkedOrders.length > 0 && (
                        <Box sx={{ mt: 2 }}>
                          <Typography variant="subtitle2" sx={{ mb: 1 }}>
                            Powiązane zamówienia klienta:
                          </Typography>
                          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                            {linkedOrders.map((order) => (
                              <Chip
                                key={order.id}
                                label={`CO ${order.orderNumber} - ${order.customer?.name || 'Nieznany klient'}`}
                                variant="outlined"
                                color="primary"
                                onDelete={() => removeLinkedOrder(order.id)}
                                deleteIcon={<DeleteIcon />}
                                sx={{ mb: 1 }}
                              />
                            ))}
                          </Box>
                        </Box>
                      )}
                      
                      {formErrors.linkedOrderId && (
                        <FormHelperText error sx={{ mt: 0, mb: 1 }}>
                          {formErrors.linkedOrderId}
                        </FormHelperText>
                      )}
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
            
            {/* Dane nadawcy */}
            <Grid item xs={12}>
              <Card>
                <CardHeader 
                  title="Dane nadawcy" 
                  titleTypographyProps={{ variant: 'h6' }}
                />
                <Divider />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                  <TextField
                    label="Nazwa nadawcy"
                    name="sender"
                    value={formData.sender}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                        error={formErrors.sender}
                    helperText={formErrors.sender}
                  />
                    </Grid>
                    
                    <Grid item xs={12}>
                  <TextField
                    label="Adres nadawcy"
                    name="senderAddress"
                    value={formData.senderAddress}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                    </Grid>
                    
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label="Kod pocztowy nadawcy"
                        name="senderPostalCode"
                        value={formData.senderPostalCode}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label="Miasto nadawcy"
                        name="senderCity"
                        value={formData.senderCity}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={4}>
                  <TextField
                        label="Kraj nadawcy"
                    name="senderCountry"
                    value={formData.senderCountry}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
                </Grid>
                
            {/* Dane odbiorcy */}
            <Grid item xs={12}>
              <Card>
                <CardHeader 
                  title="Dane odbiorcy" 
                  titleTypographyProps={{ variant: 'h6' }}
                />
                <Divider />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                  <TextField
                    label="Nazwa odbiorcy"
                    name="recipient"
                    value={formData.recipient}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                        error={formErrors.recipient}
                    helperText={formErrors.recipient}
                  />
                    </Grid>
                    
                    <Grid item xs={12}>
                  <TextField
                    label="Adres odbiorcy"
                    name="recipientAddress"
                    value={formData.recipientAddress}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                    multiline
                    rows={4}
                    error={formErrors.recipientAddress}
                    helperText={formErrors.recipientAddress || "Pełny adres odbiorcy (ulica, kod pocztowy, miasto, kraj)"}
                    placeholder={t('form.addressPlaceholder')}
                  />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
                </Grid>
                
            {/* Dane przewoźnika */}
            <Grid item xs={12}>
              <Card>
                <CardHeader 
                  title={t('form.carrierData')} 
                  titleTypographyProps={{ variant: 'h6' }}
                />
                <Divider />
                <CardContent>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Autocomplete
                        value={selectedCarrier}
                        onChange={handleCarrierSelect}
                        options={[
                          { id: 'ADD_NEW', name: 'Dodaj nowego przewoźnika' },
                          ...carriers
                        ]}
                        getOptionLabel={(option) => option?.name || ''}
                        loading={carriersLoading}
                        isOptionEqualToValue={(option, value) => option?.id === value?.id}
                        renderOption={(props, option) => {
                          const { key, ...otherProps } = props;
                          if (option.id === 'ADD_NEW') {
                            return (
                              <Box
                                key={key}
                                component="li"
                                {...otherProps}
                                sx={{ 
                                  fontWeight: 'bold', 
                                  color: 'primary.main',
                                  borderBottom: '1px solid',
                                  borderColor: 'divider'
                                }}
                              >
                                <AddIcon sx={{ mr: 1 }} />
                                {option.name}
                              </Box>
                            );
                          }
                          return (
                            <Box 
                              key={key} 
                              component="li" 
                              {...otherProps}
                              sx={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                width: '100%'
                              }}
                            >
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="body1">{option.name}</Typography>
                                {option.city && (
                                  <Typography variant="caption" color="text.secondary">
                                    {option.city}{option.country ? `, ${option.country}` : ''}
                                  </Typography>
                                )}
                              </Box>
                              <Box sx={{ display: 'flex', gap: 0.5, ml: 1 }}>
                                <IconButton
                                  size="small"
                                  onClick={(e) => handleEditCarrier(option, e)}
                                  sx={{ 
                                    p: 0.5,
                                    '&:hover': { color: 'primary.main' }
                                  }}
                                >
                                  <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton
                                  size="small"
                                  onClick={(e) => handleOpenDeleteCarrierDialog(option, e)}
                                  sx={{ 
                                    p: 0.5,
                                    '&:hover': { color: 'error.main' }
                                  }}
                                >
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </Box>
                            </Box>
                          );
                        }}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label={t('form.selectCarrier')}
                            margin="normal"
                            error={!!formErrors.carrier}
                            helperText={formErrors.carrier}
                            InputProps={{
                              ...params.InputProps,
                              endAdornment: (
                                <>
                                  {carriersLoading ? <CircularProgress color="inherit" size={20} /> : null}
                                  {params.InputProps.endAdornment}
                                </>
                              ),
                            }}
                          />
                        )}
                        fullWidth
                      />
                    </Grid>
                    
                    <Grid item xs={12}>
                      <TextField
                        label={t('form.carrierAddress')}
                        name="carrierAddress"
                        value={formData.carrierAddress}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                        error={!!formErrors.carrierAddress}
                        helperText={formErrors.carrierAddress}
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label={t('form.carrierPostalCode')}
                        name="carrierPostalCode"
                        value={formData.carrierPostalCode}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label={t('form.carrierCity')}
                        name="carrierCity"
                        value={formData.carrierCity}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label={t('form.carrierCountry')}
                        name="carrierCountry"
                        value={formData.carrierCountry}
                        onChange={handleChange}
                        fullWidth
                        margin="normal"
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
        
        {/* Miejsce załadunku i rozładunku */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title={t('form.loadingUnloadingPlaces')} 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label={t('form.loadingAddress')}
                    name="loadingPlace"
                    value={formData.loadingPlace}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                    error={formErrors.loadingPlace}
                    helperText={formErrors.loadingPlace}
                  />
                    </Grid>
                    
                    <Grid item xs={12} sm={6}>
                    <DatePicker
                      label={t('form.loadingDate')}
                      value={formData.loadingDate}
                      onChange={(date) => handleDateChange('loadingDate', date)}
                      slots={{
                        textField: TextField
                      }}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          margin: "normal"
                        }
                      }}
                    />
                </Grid>
                
                    <Grid item xs={12}>
                  <TextField
                    label="Miejsce dostawy"
                    name="deliveryPlace"
                    value={formData.deliveryPlace}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                    error={formErrors.deliveryPlace}
                    helperText={formErrors.deliveryPlace}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Dokumenty i instrukcje */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Dokumenty i instrukcje" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label={t('form.attachedDocuments')}
                    name="attachedDocuments"
                    value={formData.attachedDocuments}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={3}
                    helperText="Wymień wszystkie dokumenty załączone do listu przewozowego"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Instrukcje nadawcy"
                    name="instructionsFromSender"
                    value={formData.instructionsFromSender}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={3}
                    helperText="Specjalne instrukcje od nadawcy"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Informacje o pojeździe */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title={t('form.vehicleInfo')} 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Numer rejestracyjny pojazdu"
                    name="vehicleInfo.vehicleRegistration"
                    value={formData.vehicleInfo.vehicleRegistration}
                    onChange={(e) => {
                      setFormData(prev => ({
                        ...prev,
                        vehicleInfo: {
                          ...prev.vehicleInfo,
                          vehicleRegistration: e.target.value
                        }
                      }));
                    }}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Numer rejestracyjny naczepy"
                    name="vehicleInfo.trailerRegistration"
                    value={formData.vehicleInfo.trailerRegistration}
                    onChange={(e) => {
                      setFormData(prev => ({
                        ...prev,
                        vehicleInfo: {
                          ...prev.vehicleInfo,
                          trailerRegistration: e.target.value
                        }
                      }));
                    }}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Elementy CMR */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Elementy dokumentu CMR" 
              titleTypographyProps={{ variant: 'h6' }}
              action={
                <Box sx={{ display: 'flex', gap: 1 }}>
                  {linkedOrders.length > 0 && availableOrderItems.length > 0 && (
                    <Button
                      startIcon={<LinkIcon />}
                      onClick={() => setOrderItemsSelectorOpen(true)}
                      color="secondary"
                      variant="outlined"
                    >
                      Dodaj z zamówienia
                    </Button>
                  )}
                  <Button
                    startIcon={<AddIcon />}
                    onClick={addItem}
                    color="primary"
                  >
                    Dodaj pozycję
                  </Button>
                </Box>
              }
            />
            <Divider />
            <CardContent>
              {formData.items.map((item, index) => (
                <Box key={index} sx={{ mb: 3, p: 2, borderRadius: 1, bgcolor: 'background.default' }}>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2">
                          Pozycja {index + 1}
                        </Typography>
                        {formData.items.length > 1 && (
                          <IconButton 
                            color="error" 
                            onClick={() => removeItem(index)}
                            size="small"
                          >
                            <DeleteIcon />
                          </IconButton>
                        )}
                      </Box>
                    </Grid>
                    
                    <Grid item xs={12}>
                      <TextField
                        label="Opis towaru"
                        value={item.description}
                        onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                        fullWidth
                        error={formErrors.items && formErrors.items[index]?.description}
                        helperText={formErrors.items && formErrors.items[index]?.description}
                      />
                      {/* Informacja o sugerowanej pozycji magazynowej */}
                      {item.suggestedInventoryItem && item.matchedRecipe && (
                        <Alert severity="info" sx={{ mt: 1, fontSize: '0.8rem' }}>
                          🎯 Sugerowana pozycja magazynowa: <strong>{item.suggestedInventoryItem.name}</strong> 
                          (na podstawie receptury: <em>{item.matchedRecipe.name}</em>)
                        </Alert>
                      )}
                    </Grid>
                    
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        label={t('common:common.quantity')}
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                        fullWidth
                        type="number"
                        error={formErrors.items && formErrors.items[index]?.quantity}
                        helperText={formErrors.items && formErrors.items[index]?.quantity}
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6} md={3}>
                      <TextField
                        label="Jednostka"
                        value={item.unit}
                        onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                        fullWidth
                        error={formErrors.items && formErrors.items[index]?.unit}
                        helperText={formErrors.items && formErrors.items[index]?.unit}
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6} md={3}>
                      <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                        <TextField
                          label="Waga (kg)"
                          value={item.weight}
                          onChange={(e) => handleItemChange(index, 'weight', e.target.value)}
                          fullWidth
                          type="number"
                          InputProps={{
                            endAdornment: (
                              <IconButton
                                size="small"
                                onClick={() => handleOpenWeightCalculator(index)}
                                title={t('form.calculateWeightFromInventory')}
                                sx={{ 
                                  color: 'primary.main',
                                  '&:hover': { bgcolor: (theme) => theme.palette.mode === 'dark' ? 'primary.dark' : 'primary.light' }
                                }}
                              >
                                <CalculateIcon fontSize="small" />
                              </IconButton>
                            )
                          }}
                        />
                      </Box>
                    </Grid>
                    
                    <Grid item xs={12} sm={6} md={2}>
                      <TextField
                        label={t('form.palletCount')}
                        value={item.palletsCount || 0}
                        disabled
                        fullWidth
                        type="number"
                        InputProps={{
                          readOnly: true,
                        }}
                        helperText="Obliczone automatycznie"
                        sx={{
                          '& .MuiInputBase-input.Mui-disabled': {
                            WebkitTextFillColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
                          }
                        }}
                      />
                    </Grid>
                    
                    <Grid item xs={12} sm={6} md={2}>
                      <TextField
                        label={t('form.volumeM3')}
                        value={item.volume}
                        onChange={(e) => handleItemChange(index, 'volume', e.target.value)}
                        fullWidth
                        type="number"
                      />
                    </Grid>
                    
                    <Grid item xs={12}>
                      <TextField
                        label="Uwagi"
                        value={item.notes}
                        onChange={(e) => handleItemChange(index, 'notes', e.target.value)}
                        fullWidth
                        multiline
                        rows={2}
                      />
                    </Grid>
                        
                        {/* Powiązanie z partiami magazynowymi */}
                        <Grid item xs={12}>
                          <Box sx={{ mt: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                              <Typography variant="subtitle2" color="text.secondary">
                                Powiązane partie magazynowe
                              </Typography>
                              <Box sx={{ display: 'flex', gap: 1 }}>
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<LinkIcon />}
                                  onClick={() => handleOpenBatchSelector(index)}
                                >
                                  Wybierz partie
                                </Button>
                                {item.linkedBatches && item.linkedBatches.length > 0 && (
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<RefreshIcon />}
                                    onClick={() => handleRefreshInventoryData(index)}
                                    color="secondary"
                                    title={t('form.refreshInventoryParams')}
                                  >
                                    Odśwież
                                  </Button>
                                )}
                              </Box>
                            </Box>
                            
                            {/* Wyświetlanie powiązanych partii */}
                            {item.linkedBatches && item.linkedBatches.length > 0 ? (
                              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                                {item.linkedBatches.map((batch) => (
                                  <Chip
                                    key={batch.id}
                                    label={`${batch.batchNumber || batch.lotNumber || 'Bez numeru'} (${batch.quantity} ${batch.unit || 'szt.'})`}
                                    variant="outlined"
                                    size="small"
                                    onDelete={() => handleRemoveBatch(index, batch.id)}
                                    color="primary"
                                  />
                                ))}
                              </Box>
                            ) : (
                              <Typography 
                                variant="body2" 
                                color={formErrors.items && formErrors.items[index]?.linkedBatches ? "error" : "text.secondary"} 
                                sx={{ fontStyle: 'italic' }}
                              >
                                {formErrors.items && formErrors.items[index]?.linkedBatches 
                                  ? formErrors.items[index].linkedBatches 
                                  : 'Brak powiązanych partii'
                                }
                              </Typography>
                            )}
                            
                            {/* Komunikat błędu dla partii */}
                            {formErrors.items && formErrors.items[index]?.linkedBatches && (
                              <FormHelperText error sx={{ mt: 1 }}>
                                {formErrors.items[index].linkedBatches}
                              </FormHelperText>
                            )}
                          </Box>
                    </Grid>

                    {/* Podsumowanie wagi i palet dla pozycji */}
                    <ItemWeightSummary 
                      item={item}
                      itemIndex={index}
                      isCollapsed={collapsedItems.has(index)}
                      onToggleCollapse={() => toggleItemCollapse(index)}
                    />
                  </Grid>
                </Box>
              ))}
            </CardContent>
          </Card>
        </Grid>

        {/* Podsumowanie ogólne wagi i palet */}
        {formData.items.length > 0 && (
          <Grid item xs={12}>
            <Card>
              <CardHeader 
                title={t('form.generalSummary')} 
                titleTypographyProps={{ variant: 'h6' }}
              />
              <Divider />
              <CardContent>
                <Grid container spacing={3}>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ 
                      p: 2, 
                      bgcolor: (theme) => theme.palette.mode === 'dark' ? 'primary.dark' : 'primary.light', 
                      borderRadius: 1, 
                      textAlign: 'center' 
                    }}>
                      <Typography 
                        variant="h6" 
                        sx={{ 
                          color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#0d47a1',
                          fontWeight: 600 
                        }} 
                        gutterBottom
                      >
                        Całkowita waga
                      </Typography>
                      <Typography 
                        variant="h4" 
                        sx={{ 
                          color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#0d47a1',
                          fontWeight: 700 
                        }}
                      >
                        {weightSummary.totalWeight} kg
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ 
                      p: 2, 
                      bgcolor: (theme) => theme.palette.mode === 'dark' ? 'success.dark' : 'success.light', 
                      borderRadius: 1, 
                      textAlign: 'center' 
                    }}>
                      <Typography 
                        variant="h6" 
                        sx={{ 
                          color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#1b5e20',
                          fontWeight: 600 
                        }} 
                        gutterBottom
                      >
                        Łączna liczba palet
                      </Typography>
                      <Typography 
                        variant="h4" 
                        sx={{ 
                          color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#1b5e20',
                          fontWeight: 700 
                        }}
                      >
                        {weightSummary.totalPallets}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ 
                      p: 2, 
                      bgcolor: (theme) => theme.palette.mode === 'dark' ? 'info.dark' : 'info.light', 
                      borderRadius: 1, 
                      textAlign: 'center' 
                    }}>
                      <Typography 
                        variant="h6" 
                        sx={{ 
                          color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#01579b',
                          fontWeight: 600 
                        }} 
                        gutterBottom
                      >
                        Liczba pozycji
                      </Typography>
                      <Typography 
                        variant="h4" 
                        sx={{ 
                          color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#01579b',
                          fontWeight: 700 
                        }}
                      >
                        {formData.items.length}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ 
                      p: 2, 
                      bgcolor: (theme) => theme.palette.mode === 'dark' ? 'warning.dark' : 'warning.light', 
                      borderRadius: 1, 
                      textAlign: 'center' 
                    }}>
                      <Typography 
                        variant="h6" 
                        sx={{ 
                          color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#e65100',
                          fontWeight: 600 
                        }} 
                        gutterBottom
                      >
                        Pozycje z danymi
                      </Typography>
                      <Typography 
                        variant="h4" 
                        sx={{ 
                          color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#e65100',
                          fontWeight: 700 
                        }}
                      >
                        {weightSummary.itemsWeightBreakdown.filter(item => item.hasDetailedData).length}
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>
        )}
        
        {/* Opłaty i płatności */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title={t('form.feesAndSpecialArrangements')} 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label={t('form.carriageFee')}
                    name="freight"
                    value={formData.freight}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Koszty dodatkowe"
                    name="carriage"
                    value={formData.carriage}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Bonifikaty"
                    name="discounts"
                    value={formData.discounts}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Saldo"
                    name="balance"
                    value={formData.balance}
                    onChange={handleChange}
                    fullWidth
                    margin="normal"
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <FormControl fullWidth margin="normal">
                    <InputLabel>{t('form.payment')}</InputLabel>
                    <Select
                      name="paymentMethod"
                      value={formData.paymentMethod}
                      onChange={handleChange}
                      label={t('form.payment')}
                    >
                      <MenuItem value="sender">Płaci nadawca</MenuItem>
                      <MenuItem value="recipient">Płaci odbiorca</MenuItem>
                      <MenuItem value="other">Inny sposób płatności</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                
                <Grid item xs={12}>
                  <TextField
                    label={t('form.specialArrangements')}
                    name="specialAgreements"
                    value={formData.specialAgreements || ''}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={3}
                    margin="normal"
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <TextField
                    label={t('form.carrierReservations')}
                    name="reservations"
                    value={formData.reservations || ''}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={3}
                    margin="normal"
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
        
        {/* Uwagi */}
        <Grid item xs={12}>
          <Card>
            <CardHeader 
              title="Uwagi i informacje dodatkowe" 
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <TextField
                label="Uwagi"
                name="notes"
                value={formData.notes || ''}
                onChange={handleChange}
                fullWidth
                multiline
                rows={4}
              />
            </CardContent>
          </Card>
        </Grid>
        
        {/* Przyciski */}
        <Grid item xs={12}>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
            <Button 
              variant="outlined" 
              onClick={onCancel}
            >
              Anuluj
            </Button>
            <Button 
              variant="contained" 
              color="primary" 
              type="submit"
              onClick={(e) => {
                console.log('Przycisk Zapisz kliknięty');
                handleSubmit(e);
              }}
            >
              Zapisz
            </Button>
          </Box>
        </Grid>
      </Grid>
    </form>
        
        {/* Dialog wyboru pozycji z zamówienia */}
        <Dialog open={orderItemsSelectorOpen} onClose={() => setOrderItemsSelectorOpen(false)} maxWidth="md" fullWidth>
          <DialogTitle>
            Dodaj pozycje z powiązanych zamówień
            {linkedOrders.length > 0 && (
              <Typography variant="subtitle2" color="text.secondary">
                Powiązane CO: {linkedOrders.map(order => order.orderNumber).join(', ')}
              </Typography>
            )}
          </DialogTitle>
          <DialogContent>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Wybierz pozycje z zamówień klienta, które chcesz dodać do dokumentu CMR:
            </Typography>
            
            {/* Pole wyszukiwania */}
            <TextField
              fullWidth
              placeholder="Wyszukaj pozycje..."
              value={orderItemsSearchQuery}
              onChange={(e) => setOrderItemsSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
              }}
              sx={{ mb: 2 }}
            />
            
            <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
              {availableOrderItems.filter(orderItem => {
                if (!orderItemsSearchQuery.trim()) return true;
                const searchTerm = orderItemsSearchQuery.toLowerCase();
                return (
                  (orderItem.name || '').toLowerCase().includes(searchTerm) ||
                  (orderItem.description || '').toLowerCase().includes(searchTerm) ||
                  (orderItem.orderNumber || '').toLowerCase().includes(searchTerm) ||
                  (orderItem.unit || '').toLowerCase().includes(searchTerm)
                );
              }).map((orderItem, index) => (
                <Box 
                  key={index}
                  sx={{ 
                    p: 2, 
                    border: (theme) => `1px solid ${theme.palette.divider}`, 
                    borderRadius: 1, 
                    mb: 1,
                    bgcolor: mode === 'dark' ? 'background.default' : 'background.paper'
                  }}
                >
                                     <Grid container spacing={2} alignItems="center">
                     <Grid item xs={12} sm={5}>
                       <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                         {orderItem.name || 'Bez nazwy'}
                       </Typography>
                       <Typography variant="body2" color="text.secondary">
                         Ilość: {orderItem.quantity} {orderItem.unit || 'szt.'}
                       </Typography>
                       <Typography variant="caption" color="primary" sx={{ fontWeight: 500 }}>
                         CO: {orderItem.orderNumber}
                       </Typography>
                     </Grid>
                     <Grid item xs={12} sm={5}>
                       {orderItem.description && (
                         <Typography variant="caption" color="text.secondary">
                           {orderItem.description}
                         </Typography>
                       )}
                     </Grid>
                    <Grid item xs={12} sm={2}>
                      <Button
                        variant="contained"
                        size="small"
                                                  onClick={() => {
                            addItemFromOrder(orderItem).catch(error => {
                              console.error('Błąd podczas dodawania pozycji z zamówienia:', error);
                              showMessage('Błąd podczas dodawania pozycji z zamówienia', 'error');
                            });
                          }}
                        sx={{ width: '100%' }}
                      >
                        Dodaj
                      </Button>
                    </Grid>
                  </Grid>
                </Box>
              ))}
              
              {availableOrderItems.filter(orderItem => {
                if (!orderItemsSearchQuery.trim()) return true;
                const searchTerm = orderItemsSearchQuery.toLowerCase();
                return (
                  (orderItem.name || '').toLowerCase().includes(searchTerm) ||
                  (orderItem.description || '').toLowerCase().includes(searchTerm) ||
                  (orderItem.orderNumber || '').toLowerCase().includes(searchTerm) ||
                  (orderItem.unit || '').toLowerCase().includes(searchTerm)
                );
              }).length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                  {orderItemsSearchQuery.trim() 
                    ? `Brak pozycji pasujących do wyszukiwania "${orderItemsSearchQuery}"`
                    : 'Brak dostępnych pozycji w zamówieniu'
                  }
                </Typography>
              )}
            </Box>
          </DialogContent>
          <DialogActions>
            {orderItemsSearchQuery.trim() && (
              <Button 
                onClick={() => setOrderItemsSearchQuery('')}
                color="inherit"
              >
                Wyczyść wyszukiwanie
              </Button>
            )}
            <Button onClick={() => {
              setOrderItemsSearchQuery('');
              setOrderItemsSelectorOpen(false);
            }}>
              Zamknij
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialog wyboru partii magazynowych */}
        <BatchSelector
          open={batchSelectorOpen}
          onClose={handleCloseBatchSelector}
          onSelectBatches={handleSelectBatches}
          selectedBatches={currentItemIndex !== null ? formData.items[currentItemIndex]?.linkedBatches || [] : []}
          itemDescription={currentItemIndex !== null ? formData.items[currentItemIndex]?.description || '' : ''}
          itemMarks={currentItemIndex !== null ? formData.items[currentItemIndex]?.marks || '' : ''}
          itemCode={currentItemIndex !== null ? formData.items[currentItemIndex]?.productCode || formData.items[currentItemIndex]?.marks || '' : ''}
          suggestedInventoryItem={currentItemIndex !== null ? formData.items[currentItemIndex]?.suggestedInventoryItem || null : null}
          matchedRecipe={currentItemIndex !== null ? formData.items[currentItemIndex]?.matchedRecipe || null : null}
        />
        
        {/* Dialog kalkulatora wagi */}
        <WeightCalculationDialog
          open={weightCalculatorOpen}
          onClose={handleCloseWeightCalculator}
          onAcceptWeight={handleAcceptWeight}
          cmrItem={currentWeightItemIndex !== null ? formData.items[currentWeightItemIndex] : null}
        />

        {/* Snackbar dla komunikatów */}
        <Snackbar
          open={snackbarOpen}
          autoHideDuration={6000}
          onClose={handleCloseSnackbar}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        >
          <Alert onClose={handleCloseSnackbar} severity={snackbarSeverity} sx={{ width: '100%' }}>
            {snackbarMessage}
          </Alert>
        </Snackbar>

        {/* Dialog dodawania/edycji przewoźnika */}
        <Dialog 
          open={carrierDialogOpen} 
          onClose={handleCloseCarrierDialog}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle>
            {carrierDialogMode === 'edit' ? 'Edytuj przewoźnika' : 'Dodaj nowego przewoźnika'}
          </DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  label={t('form.carrierName')}
                  name="name"
                  value={newCarrierData.name}
                  onChange={handleNewCarrierChange}
                  fullWidth
                  autoFocus
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Adres"
                  name="address"
                  value={newCarrierData.address}
                  onChange={handleNewCarrierChange}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Kod pocztowy"
                  name="postalCode"
                  value={newCarrierData.postalCode}
                  onChange={handleNewCarrierChange}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Miasto"
                  name="city"
                  value={newCarrierData.city}
                  onChange={handleNewCarrierChange}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  label="Kraj"
                  name="country"
                  value={newCarrierData.country}
                  onChange={handleNewCarrierChange}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="NIP"
                  name="nip"
                  value={newCarrierData.nip}
                  onChange={handleNewCarrierChange}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  label="Telefon"
                  name="phone"
                  value={newCarrierData.phone}
                  onChange={handleNewCarrierChange}
                  fullWidth
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  label="Email"
                  name="email"
                  value={newCarrierData.email}
                  onChange={handleNewCarrierChange}
                  fullWidth
                  type="email"
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseCarrierDialog} disabled={savingCarrier}>
              Anuluj
            </Button>
            <Button 
              onClick={handleSaveCarrier} 
              variant="contained" 
              disabled={savingCarrier || !newCarrierData.name.trim()}
              startIcon={savingCarrier ? <CircularProgress size={20} /> : null}
            >
              {savingCarrier ? 'Zapisywanie...' : (carrierDialogMode === 'edit' ? 'Zapisz zmiany' : 'Zapisz przewoźnika')}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Dialog potwierdzenia usunięcia przewoźnika */}
        <Dialog
          open={deleteCarrierDialogOpen}
          onClose={() => setDeleteCarrierDialogOpen(false)}
          maxWidth="xs"
          fullWidth
        >
          <DialogTitle>Potwierdź usunięcie</DialogTitle>
          <DialogContent>
            <Typography>
              Czy na pewno chcesz usunąć przewoźnika <strong>{carrierToDelete?.name}</strong>?
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Ta operacja jest nieodwracalna.
            </Typography>
          </DialogContent>
          <DialogActions>
            <Button 
              onClick={() => setDeleteCarrierDialogOpen(false)} 
              disabled={deletingCarrier}
            >
              Anuluj
            </Button>
            <Button 
              onClick={handleConfirmDeleteCarrier} 
              variant="contained" 
              color="error"
              disabled={deletingCarrier}
              startIcon={deletingCarrier ? <CircularProgress size={20} /> : <DeleteIcon />}
            >
              {deletingCarrier ? 'Usuwanie...' : 'Usuń'}
            </Button>
          </DialogActions>
        </Dialog>
      </Grid>
    </LocalizationProvider>
  );
};

export default CmrForm; 