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
  FormControl,
  InputLabel,
  Select,
  CircularProgress,
  Snackbar,
  Alert,
  Collapse
} from '@mui/material';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import pl from 'date-fns/locale/pl';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { 
  CMR_STATUSES, 
  CMR_PAYMENT_STATUSES, 
  TRANSPORT_TYPES
} from '../../../services/cmrService';
import { getOrderById, getAllOrders, searchOrdersByNumber } from '../../../services/orderService';
import { getCustomerById } from '../../../services/customerService';
import { getCompanyData } from '../../../services/companyService';
import { getAllCarriers, createCarrier, updateCarrier, deleteCarrier } from '../../../services/carrierService';
import BatchSelector from '../../../components/cmr/BatchSelector';
import WeightCalculationDialog from '../../../components/cmr/WeightCalculationDialog';
import {
  OrderSelectionDialog,
  SenderDataImportDialog,
  OrderItemsSelectorDialog,
  CarrierFormDialog,
  DeleteCarrierDialog
} from '../../../components/cmr/dialogs';
import { calculatePalletWeights, calculateBoxWeights, calculateCmrItemWeight, getInventoryDataFromBatches } from '../../../utils/cmrWeightCalculator';
import {
  CmrBasicInfoCard,
  CmrSenderCard,
  CmrRecipientCard,
  CmrCarrierCard,
  CmrItemsSection
} from '../../../components/cmr/form';
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
        
        <OrderSelectionDialog
          open={isOrderDialogOpen}
          onClose={handleCloseOrderDialog}
          orderSearchQuery={orderSearchQuery}
          onOrderSearchQueryChange={setOrderSearchQuery}
          onFindOrderByNumber={handleFindOrderByNumber}
          onRefreshOrders={handleRefreshOrders}
          isLoadingOrder={isLoadingOrder}
          isImportOptionsExpanded={isImportOptionsExpanded}
          onToggleImportOptions={() => setIsImportOptionsExpanded(!isImportOptionsExpanded)}
          importOptions={importOptions}
          onImportOptionChange={handleImportOptionChange}
          availableOrders={availableOrders}
          onOrderSelect={handleOrderSelect}
          t={t}
        />
        
        <SenderDataImportDialog
          open={isSenderDialogOpen}
          onClose={handleCloseSenderDialog}
          senderImportOptions={senderImportOptions}
          onSenderImportOptionChange={handleSenderImportOptionChange}
          onImportSenderData={handleImportSenderData}
          isLoadingSenderData={isLoadingSenderData}
        />
        
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
        
            <CmrBasicInfoCard
              formData={formData}
              formErrors={formErrors}
              handleChange={handleChange}
              handleDateChange={handleDateChange}
              handleOpenOrderDialog={handleOpenOrderDialog}
              linkedOrders={linkedOrders}
              removeLinkedOrder={removeLinkedOrder}
              t={t}
            />
            
            <CmrSenderCard
              formData={formData}
              formErrors={formErrors}
              handleChange={handleChange}
            />
                
            <CmrRecipientCard
              formData={formData}
              formErrors={formErrors}
              handleChange={handleChange}
              t={t}
            />
                
            <CmrCarrierCard
              formData={formData}
              formErrors={formErrors}
              handleChange={handleChange}
              selectedCarrier={selectedCarrier}
              handleCarrierSelect={handleCarrierSelect}
              carriers={carriers}
              carriersLoading={carriersLoading}
              handleEditCarrier={handleEditCarrier}
              handleOpenDeleteCarrierDialog={handleOpenDeleteCarrierDialog}
              t={t}
            />
        
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
        
        <CmrItemsSection
          formData={formData}
          formErrors={formErrors}
          handleItemChange={handleItemChange}
          addItem={addItem}
          removeItem={removeItem}
          handleOpenBatchSelector={handleOpenBatchSelector}
          handleRefreshInventoryData={handleRefreshInventoryData}
          handleRemoveBatch={handleRemoveBatch}
          handleOpenWeightCalculator={handleOpenWeightCalculator}
          linkedOrders={linkedOrders}
          availableOrderItems={availableOrderItems}
          onOpenOrderItemsSelector={() => setOrderItemsSelectorOpen(true)}
          collapsedItems={collapsedItems}
          toggleItemCollapse={toggleItemCollapse}
          weightSummary={weightSummary}
          mode={mode}
          t={t}
          ItemWeightSummary={ItemWeightSummary}
        />
        
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
        
        <OrderItemsSelectorDialog
          open={orderItemsSelectorOpen}
          onClose={() => setOrderItemsSelectorOpen(false)}
          linkedOrders={linkedOrders}
          orderItemsSearchQuery={orderItemsSearchQuery}
          onOrderItemsSearchQueryChange={setOrderItemsSearchQuery}
          availableOrderItems={availableOrderItems}
          onAddItemFromOrder={addItemFromOrder}
          showMessage={showMessage}
          mode={mode}
        />

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

        <CarrierFormDialog
          open={carrierDialogOpen}
          onClose={handleCloseCarrierDialog}
          carrierDialogMode={carrierDialogMode}
          newCarrierData={newCarrierData}
          onNewCarrierChange={handleNewCarrierChange}
          onSaveCarrier={handleSaveCarrier}
          savingCarrier={savingCarrier}
          t={t}
        />

        <DeleteCarrierDialog
          open={deleteCarrierDialogOpen}
          onClose={() => setDeleteCarrierDialogOpen(false)}
          carrierToDelete={carrierToDelete}
          onConfirmDelete={handleConfirmDeleteCarrier}
          deletingCarrier={deletingCarrier}
        />
      </Grid>
    </LocalizationProvider>
  );
};

export default CmrForm; 