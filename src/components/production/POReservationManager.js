/**
 * Komponent zarządzania rezerwacjami z zamówień zakupowych (PO)
 * 
 * Funkcjonalności:
 * - Lista aktualnych rezerwacji z PO
 * - Dialog dodawania nowej rezerwacji z PO
 * - Dialog konwersji na standardową rezerwację
 * - Podgląd powiązanych partii magazynowych
 * - Anulowanie rezerwacji
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Tooltip,
  Alert,
  AlertTitle,
  Grid,
  TextField,
  Autocomplete,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Divider,
  Card,
  CardContent,
  CardActions,
  CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Cancel as CancelIcon,
  Transform as ConvertIcon,
  Visibility as ViewIcon,
  LocalShipping as DeliveryIcon,
  Inventory as BatchIcon,
  Info as InfoIcon,
  CheckCircle as CheckIcon,
  HourglassEmpty as PendingIcon,
  Error as ErrorIcon,
  Refresh as RefreshIcon,
  BugReport as BugReportIcon
} from '@mui/icons-material';
import { formatDateTime, formatCurrency } from '../../utils/formatters';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import {
  getPOReservationsForTask,
  createPOReservation,
  cancelPOReservation,
  convertPOReservationToStandard,
  getAvailablePOItems,
  getPOReservationStats,
  syncPOReservationsWithBatches,
  refreshLinkedBatchesQuantities
} from '../../services/poReservationService';

const POReservationManager = ({ taskId, materials = [], onUpdate }) => {
  const { showSuccess, showError, showInfo } = useNotification();
  const { currentUser } = useAuth();
  
  // Stan komponentu
  const [reservations, setReservations] = useState([]);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState(''); // 'add', 'convert', 'view'
  const [selectedReservation, setSelectedReservation] = useState(null);
  
  // Stan dialogu dodawania rezerwacji
  const [selectedMaterial, setSelectedMaterial] = useState(null);
  const [availablePOItems, setAvailablePOItems] = useState([]);
  const [selectedPOItem, setSelectedPOItem] = useState(null);
  const [reservationQuantity, setReservationQuantity] = useState('');
  
  // Stan dialogu konwersji
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [conversionQuantity, setConversionQuantity] = useState('');
  
  // Stan synchronizacji
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Stan dostępnych ilości w partiach (batchId -> dostępna ilość)
  const [batchAvailableQuantities, setBatchAvailableQuantities] = useState({});
  
  // Pobierz dane początkowe
  useEffect(() => {
    loadReservations();
  }, [taskId]);
  
  const loadReservations = async () => {
    try {
      setLoading(true);
      const [reservationsData, statsData] = await Promise.all([
        getPOReservationsForTask(taskId),
        getPOReservationStats(taskId)
      ]);
      
      setReservations(reservationsData);
      setStats(statsData);
      
      // Oblicz dostępne ilości w partiach
      if (reservationsData.length > 0) {
        setTimeout(() => calculateBatchAvailableQuantities(reservationsData), 100);
      }
    } catch (error) {
      console.error('Błąd podczas ładowania rezerwacji PO:', error);
      showError('Nie udało się pobrać rezerwacji z zamówień zakupowych');
    } finally {
      setLoading(false);
    }
  };
  
  // Otwórz dialog dodawania rezerwacji
  const handleOpenAddDialog = async () => {
    setDialogType('add');
    setSelectedMaterial(null);
    setSelectedPOItem(null);
    setReservationQuantity('');
    setAvailablePOItems([]);
    setDialogOpen(true);
  };
  
  // Obsługa wyboru materiału w dialogu dodawania
  const handleMaterialSelect = async (material) => {
    setSelectedMaterial(material);
    setSelectedPOItem(null);
    setReservationQuantity('');
    
    if (material) {
      try {
        const materialId = material.inventoryItemId || material.id;
        const items = await getAvailablePOItems(materialId);
        setAvailablePOItems(items);
        
        if (items.length === 0) {
          showInfo(`Brak dostępnych pozycji w PO dla materiału: ${material.name}`);
        }
      } catch (error) {
        console.error('Błąd podczas pobierania pozycji PO:', error);
        showError('Nie udało się pobrać dostępnych pozycji z zamówień');
      }
    }
  };
  
  // Obsługa wyboru pozycji PO
  const handlePOItemSelect = (poItem) => {
    setSelectedPOItem(poItem);
    // Ustaw domyślną ilość na dostępną ilość lub wymaganą przez zadanie
    const maxQuantity = Math.min(
      poItem.availableQuantity,
      selectedMaterial?.quantity || poItem.availableQuantity
    );
    setReservationQuantity(maxQuantity.toString());
  };
  
  // Dodaj rezerwację
  const handleAddReservation = async () => {
    if (!selectedMaterial || !selectedPOItem || !reservationQuantity) {
      showError('Uzupełnij wszystkie wymagane pola');
      return;
    }
    
    const quantity = parseFloat(reservationQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      showError('Ilość musi być liczbą większą od zera');
      return;
    }
    
    if (quantity > selectedPOItem.availableQuantity) {
      showError(`Ilość przekracza dostępną ilość: ${selectedPOItem.availableQuantity} ${selectedPOItem.unit}`);
      return;
    }
    
    try {
      await createPOReservation(
        taskId,
        selectedPOItem.poId,
        selectedPOItem.poItemId,
        quantity,
        currentUser.uid
      );
      
      showSuccess(`Utworzono rezerwację z PO ${selectedPOItem.poNumber}`);
      setDialogOpen(false);
      
      // Odśwież dane - automatyczna synchronizacja została już wykonana w serwisie
      console.log('Odświeżanie listy rezerwacji po utworzeniu nowej rezerwacji...');
      
      // Krótkie opóźnienie żeby dać czas na pełne zakończenie synchronizacji
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await loadReservations();
      onUpdate?.();
      console.log('Lista rezerwacji została odświeżona');
    } catch (error) {
      console.error('Błąd podczas tworzenia rezerwacji:', error);
      showError(error.message || 'Nie udało się utworzyć rezerwacji');
    }
  };
  
  // Usuń rezerwację
  const handleCancelReservation = async (reservationId) => {
    // Znajdź rezerwację żeby sprawdzić jej status
    const reservation = reservations.find(r => r.id === reservationId);
    
    let confirmMessage = 'Czy na pewno chcesz usunąć tę rezerwację?';
    if (reservation?.status === 'delivered') {
      confirmMessage = 'Ta rezerwacja została już dostarczona. Czy na pewno chcesz ją usunąć? To może wpłynąć na śledzenie dostaw.';
    }
    
    if (!window.confirm(confirmMessage)) {
      return;
    }
    
    try {
      await cancelPOReservation(reservationId, currentUser.uid);
      showSuccess('Rezerwacja została usunięta');
      loadReservations();
      onUpdate?.();
    } catch (error) {
      console.error('Błąd podczas usuwania rezerwacji:', error);
      showError(error.message || 'Nie udało się usunąć rezerwacji');
    }
  };
  
  // Otwórz dialog konwersji
  const handleOpenConvertDialog = (reservation) => {
    setSelectedReservation(reservation);
    setSelectedBatch(null);
    // Ustaw domyślną ilość na podstawie zarezerwowanej ilości, a nie dostarczonej
    const availableToConvert = Math.min(
      reservation.reservedQuantity - reservation.convertedQuantity,
      reservation.deliveredQuantity - reservation.convertedQuantity
    );
    setConversionQuantity(Math.max(0, availableToConvert).toString());
    setDialogType('convert');
    setDialogOpen(true);
  };
  
  // Konwertuj na standardową rezerwację
  const handleConvertReservation = async () => {
    if (!selectedReservation || !selectedBatch || !conversionQuantity) {
      showError('Uzupełnij wszystkie wymagane pola');
      return;
    }
    
    const quantity = parseFloat(conversionQuantity);
    if (isNaN(quantity) || quantity <= 0) {
      showError('Ilość musi być liczbą większą od zera');
      return;
    }
    
    try {
      const result = await convertPOReservationToStandard(
        selectedReservation.id,
        selectedBatch.batchId,
        quantity,
        currentUser.uid
      );
      
      showSuccess(result.message);
      setDialogOpen(false);
      loadReservations();
      onUpdate?.();
    } catch (error) {
      console.error('Błąd podczas konwersji rezerwacji:', error);
      showError(error.message || 'Nie udało się przekształcić rezerwacji');
    }
  };
  
  // Otwórz dialog podglądu
  const handleOpenViewDialog = (reservation) => {
    setSelectedReservation(reservation);
    setDialogType('view');
    setDialogOpen(true);
  };

  // Synchronizuj rezerwacje z partiami magazynowymi
  const handleSyncReservations = async () => {
    if (!window.confirm('Czy chcesz zsynchronizować rezerwacje PO z partiami magazynowymi? To może pomóc w przypadku problemów z wyświetlaniem partii.')) {
      return;
    }
    
    try {
      setSyncing(true);
      const result = await syncPOReservationsWithBatches(taskId, currentUser.uid);
      
      if (result.syncedCount > 0) {
        showSuccess(`Zsynchronizowano ${result.syncedCount} z ${result.totalReservations} rezerwacji`);
      } else {
        showInfo('Wszystkie rezerwacje są już zsynchronizowane');
      }
      
      // Odśwież listę rezerwacji
      await loadReservations();
      
      // Odśwież dostępne ilości w partiach
      if (reservations.length > 0) {
        await calculateBatchAvailableQuantities();
      }
      
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Błąd podczas synchronizacji:', error);
      showError('Nie udało się zsynchronizować rezerwacji: ' + error.message);
    } finally {
      setSyncing(false);
    }
  };

  // Odśwież ilości w powiązanych partiach
  const handleRefreshQuantities = async () => {
    if (!window.confirm('Czy chcesz odświeżyć ilości w powiązanych partiach? To zaktualizuje wszystkie rezerwacje PO z aktualnymi ilościami w magazynie.')) {
      return;
    }
    
    try {
      setRefreshing(true);
      const result = await refreshLinkedBatchesQuantities();
      
      if (result.updatedCount > 0) {
        showSuccess(`Odświeżono ilości w ${result.updatedCount} z ${result.totalReservations} rezerwacji`);
      } else {
        showInfo('Wszystkie ilości są aktualne');
      }
      
      // Odśwież listę rezerwacji
      await loadReservations();
      
      // Odśwież dostępne ilości w partiach
      if (reservations.length > 0) {
        await calculateBatchAvailableQuantities();
      }
      
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Błąd podczas odświeżania ilości:', error);
      showError('Nie udało się odświeżyć ilości: ' + error.message);
    } finally {
      setRefreshing(false);
    }
  };

  // Debuguj konkretną rezerwację - sprawdź partie magazynowe
  const handleDebugReservation = async (reservation) => {
    try {
      console.log('=== DEBUGOWANIE REZERWACJI ===');
      console.log('Rezerwacja:', reservation);
      
      // Sprawdź partie w różnych formatach
      const { getDocs, query, collection, where } = await import('firebase/firestore');
      const { db } = await import('../../firebase');
      
      console.log('Szukam partii dla:');
      console.log('- PO ID:', reservation.poId);
      console.log('- PO Item ID:', reservation.poItemId);
      console.log('- Material ID:', reservation.materialId);
      
      // Format 1: purchaseOrderDetails
      const query1 = query(
        collection(db, 'inventoryBatches'),
        where('purchaseOrderDetails.id', '==', reservation.poId),
        where('purchaseOrderDetails.itemPoId', '==', reservation.poItemId)
      );
      const snapshot1 = await getDocs(query1);
      console.log('Format 1 (purchaseOrderDetails):', snapshot1.docs.length, 'partii');
      
      // Format 2: sourceDetails
      const query2 = query(
        collection(db, 'inventoryBatches'),
        where('sourceDetails.orderId', '==', reservation.poId),
        where('sourceDetails.itemPoId', '==', reservation.poItemId)
      );
      const snapshot2 = await getDocs(query2);
      console.log('Format 2 (sourceDetails):', snapshot2.docs.length, 'partii');
      
      // Format 3: po materialId
      const query3 = query(
        collection(db, 'inventoryBatches'),
        where('itemId', '==', reservation.materialId),
        where('purchaseOrderDetails.id', '==', reservation.poId)
      );
      const snapshot3 = await getDocs(query3);
      console.log('Format 3 (po materialId):', snapshot3.docs.length, 'partii');
      
      // Wszystkie partie dla tego PO
      const queryAll = query(
        collection(db, 'inventoryBatches'),
        where('purchaseOrderDetails.id', '==', reservation.poId)
      );
      const snapshotAll = await getDocs(queryAll);
      console.log('Wszystkie partie dla PO:', snapshotAll.docs.length);
      
      snapshotAll.docs.forEach(doc => {
        const data = doc.data();
        console.log('Partia:', {
          id: doc.id,
          itemId: data.itemId,
          poId: data.purchaseOrderDetails?.id,
          itemPoId: data.purchaseOrderDetails?.itemPoId,
          batchNumber: data.batchNumber || data.lotNumber
        });
      });
      
      alert('Sprawdź konsolę przeglądarki (F12) aby zobaczyć szczegóły debugowania');
      
    } catch (error) {
      console.error('Błąd podczas debugowania:', error);
      showError('Błąd podczas debugowania: ' + error.message);
    }
  };

  // Oblicz dostępne ilości w partiach uwzględniając rezerwacje
  const calculateBatchAvailableQuantities = async (reservationsData = null) => {
    try {
      const quantities = {};
      const dataToUse = reservationsData || reservations;
      
      // Dla każdej rezerwacji z powiązanymi partiami
      for (const reservation of dataToUse) {
        if (reservation.linkedBatches && reservation.linkedBatches.length > 0) {
          for (const batch of reservation.linkedBatches) {
            if (!quantities[batch.batchId]) {
              // Pobierz rezerwacje dla tej partii
              const { getBatchReservations } = await import('../../services/inventory');
              const batchReservations = await getBatchReservations(batch.batchId);
              
              const totalReserved = batchReservations.reduce((sum, res) => sum + (res.quantity || 0), 0);
              const availableQuantity = Math.max(0, batch.quantity - totalReserved);
              
              quantities[batch.batchId] = {
                total: batch.quantity,
                reserved: totalReserved,
                available: availableQuantity
              };
            }
          }
        }
      }
      
      setBatchAvailableQuantities(quantities);
    } catch (error) {
      console.error('Błąd podczas obliczania dostępnych ilości:', error);
    }
  };
  
  // Zamknij dialog
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setDialogType('');
    setSelectedReservation(null);
    setSelectedMaterial(null);
    setSelectedPOItem(null);
    setSelectedBatch(null);
    setReservationQuantity('');
    setConversionQuantity('');
  };
  
  // Renderuj status chip
  const renderStatusChip = (status) => {
    const configs = {
      pending: { color: 'warning', icon: <PendingIcon />, label: 'Oczekuje' },
      delivered: { color: 'success', icon: <DeliveryIcon />, label: 'Dostarczone' },
      converted: { color: 'primary', icon: <CheckIcon />, label: 'Przekształcone' }
    };
    
    const config = configs[status] || configs.pending;
    
    return (
      <Chip
        icon={config.icon}
        label={config.label}
        color={config.color}
        size="small"
        variant="outlined"
      />
    );
  };
  
  if (loading) {
    return (
      <Box display="flex" justifyContent="center" p={3}>
        <CircularProgress />
      </Box>
    );
  }
  
  return (
    <Box>
      {/* Nagłówek */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" component="h2">
          Rezerwacje z zamówień zakupowych
        </Typography>
        <Box>
          <Button
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={handleOpenAddDialog}
            disabled={!materials.length}
            sx={{ mr: 1 }}
          >
            Dodaj rezerwację
          </Button>
          {stats.total > 0 && (
            <>
              <Button
                variant="outlined"
                startIcon={syncing ? <CircularProgress size={16} /> : <RefreshIcon />}
                onClick={handleSyncReservations}
                disabled={syncing || refreshing}
                sx={{ mr: 1 }}
                size="small"
              >
                {syncing ? 'Synchronizuję...' : 'Synchronizuj'}
              </Button>
              
              <Button
                variant="outlined"
                startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshIcon />}
                onClick={handleRefreshQuantities}
                disabled={syncing || refreshing}
                color="secondary"
                size="small"
              >
                {refreshing ? 'Odświeżam...' : 'Odśwież ilości'}
              </Button>
            </>
          )}
        </Box>
      </Box>
      
      {/* Lista rezerwacji */}
      {reservations.length === 0 ? (
        <Alert severity="info">
          <AlertTitle>Brak rezerwacji z zamówień zakupowych</AlertTitle>
          Nie utworzono jeszcze żadnych rezerwacji z PO dla tego zadania.
          {materials.length > 0 && ' Kliknij "Dodaj rezerwację" aby rozpocząć.'}
        </Alert>
      ) : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Materiał</TableCell>
                <TableCell>PO</TableCell>
                <TableCell>Ilość</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Powiązane partie</TableCell>
                <TableCell align="right">Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reservations.map((reservation) => (
                <TableRow key={reservation.id}>
                  <TableCell>{reservation.materialName}</TableCell>
                  <TableCell>
                    <Tooltip title={`Pozycja w PO: ${reservation.poItemId}`}>
                      <Chip
                        label={reservation.poNumber}
                        size="small"
                        color="primary"
                        variant="outlined"
                      />
                    </Tooltip>
                  </TableCell>
                  <TableCell>
                    {reservation.reservedQuantity} {reservation.unit}
                    {reservation.status === 'delivered' && (
                      <Typography variant="caption" display="block" color="text.secondary">
                        Dostarczone: {reservation.deliveredQuantity} {reservation.unit}
                      </Typography>
                    )}
                    {reservation.convertedQuantity > 0 && (
                      <Typography variant="caption" display="block" color="primary">
                        Przekształcone: {reservation.convertedQuantity} {reservation.unit}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{renderStatusChip(reservation.status)}</TableCell>
                  <TableCell>
                    {reservation.linkedBatches && reservation.linkedBatches.length > 0 ? (
                      <Box>
                        {reservation.linkedBatches.map((batch, index) => {
                          const batchInfo = batchAvailableQuantities[batch.batchId];
                          const availableInfo = batchInfo ? ` (dostępne: ${batchInfo.available})` : '';
                          
                          return (
                            <Chip
                              key={batch.batchId}
                              label={`${batch.batchNumber}: ${batch.quantity}${availableInfo}`}
                              size="small"
                              variant="outlined"
                              color={batchInfo && batchInfo.available > 0 ? "success" : "warning"}
                              sx={{ 
                                mb: index < reservation.linkedBatches.length - 1 ? 0.5 : 0,
                                mr: 0.5,
                                display: 'block'
                              }}
                            />
                          );
                        })}
                      </Box>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        {reservation.status === 'delivered' ? 'Brak powiązanych partii' : 'Oczekuje na dostawę'}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title="Podgląd">
                      <IconButton size="small" onClick={() => handleOpenViewDialog(reservation)}>
                        <ViewIcon />
                      </IconButton>
                    </Tooltip>
                    
                    {reservation.status === 'delivered' && 
                     reservation.deliveredQuantity > reservation.convertedQuantity && (
                      <Tooltip title="Przekształć na standardową rezerwację">
                        <IconButton size="small" onClick={() => handleOpenConvertDialog(reservation)}>
                          <ConvertIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    
                    {reservation.status === 'delivered' && 
                     (!reservation.linkedBatches || reservation.linkedBatches.length === 0) && (
                      <Tooltip title="Debuguj - sprawdź partie magazynowe">
                        <IconButton 
                          size="small" 
                          color="warning"
                          onClick={() => handleDebugReservation(reservation)}
                        >
                          <BugReportIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                    
                    {(reservation.status === 'pending' || reservation.status === 'delivered') && (
                      <Tooltip title="Usuń rezerwację">
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => handleCancelReservation(reservation.id)}
                        >
                          <CancelIcon />
                        </IconButton>
                      </Tooltip>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      
      {/* Dialog dodawania rezerwacji */}
      <Dialog open={dialogOpen && dialogType === 'add'} maxWidth="md" fullWidth>
        <DialogTitle>Dodaj rezerwację z zamówienia zakupowego</DialogTitle>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <Autocomplete
                value={selectedMaterial}
                onChange={(event, newValue) => handleMaterialSelect(newValue)}
                options={materials}
                getOptionLabel={(option) => option.name || ''}
                renderInput={(params) => (
                  <TextField {...params} label="Wybierz materiał" fullWidth />
                )}
                renderOption={(props, option) => (
                  <li {...props}>
                    <Box>
                      <Typography variant="body1">{option.name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Wymagane: {option.quantity} {option.unit}
                      </Typography>
                    </Box>
                  </li>
                )}
              />
            </Grid>
            
            {selectedMaterial && (
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  Dostępne pozycje w zamówieniach zakupowych:
                </Typography>
                {availablePOItems.length === 0 ? (
                  <Alert severity="warning">
                    Brak dostępnych pozycji w zamówieniach zakupowych dla tego materiału
                  </Alert>
                ) : (
                  <List>
                    {availablePOItems.map((item, index) => (
                      <React.Fragment key={index}>
                        <Box>
                          <ListItem
                            button
                            selected={selectedPOItem?.poId === item.poId && selectedPOItem?.poItemId === item.poItemId}
                            onClick={() => handlePOItemSelect(item)}
                          >
                            <ListItemText
                              primary={
                                <Box display="flex" alignItems="center" gap={1}>
                                  <Chip label={item.poNumber} size="small" color="primary" />
                                  <Typography>{item.supplier?.name}</Typography>
                                  <Chip 
                                    label={item.status} 
                                    size="small" 
                                    color={item.status === 'draft' ? 'default' : 'success'} 
                                  />
                                </Box>
                              }
                              secondary={
                                <Box>
                                  <Typography variant="body2">
                                    Dostępne: {item.availableQuantity} {item.unit} z {item.totalQuantity} {item.unit}
                                  </Typography>
                                  <Typography variant="body2">
                                    Cena: {formatCurrency(item.unitPrice, item.currency)} / {item.unit}
                                  </Typography>
                                  {item.expectedDeliveryDate && (
                                    <Typography variant="body2" color="text.secondary">
                                      Planowana dostawa: {formatDateTime(item.expectedDeliveryDate).split(',')[0]}
                                    </Typography>
                                  )}
                                </Box>
                              }
                            />
                          </ListItem>
                          
                          {/* Formularz ilości dla wybranej pozycji */}
                          {selectedPOItem?.poId === item.poId && selectedPOItem?.poItemId === item.poItemId && (
                            <Box sx={{ px: 3, pb: 2, bgcolor: 'action.hover', mx: 2, mb: 1, borderRadius: 1 }}>
                              <Typography variant="subtitle2" sx={{ pt: 2, pb: 1, fontWeight: 'bold' }}>
                                Ilość do zarezerwowania:
                              </Typography>
                              
                              <TextField
                                label="Ilość"
                                type="number"
                                value={reservationQuantity}
                                onChange={(e) => setReservationQuantity(e.target.value)}
                                fullWidth
                                size="small"
                                variant="outlined"
                                inputProps={{ 
                                  min: 0, 
                                  max: item.availableQuantity,
                                  step: 'any'
                                }}
                                helperText={`Dostępne: ${item.availableQuantity} ${item.unit} • Potrzebne: ${selectedMaterial.quantity} ${selectedMaterial.unit}`}
                              />
                              
                              {reservationQuantity && (
                                <Box sx={{ mt: 1 }}>
                                  <Typography variant="body2" color="primary" fontWeight="bold">
                                    Wartość rezerwacji: {formatCurrency(
                                      parseFloat(reservationQuantity) * item.unitPrice, 
                                      item.currency
                                    )}
                                  </Typography>
                                </Box>
                              )}
                            </Box>
                          )}
                        </Box>
                        {index < availablePOItems.length - 1 && <Divider />}
                      </React.Fragment>
                    ))}
                  </List>
                )}
              </Grid>
            )}

          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Anuluj</Button>
          <Button 
            onClick={handleAddReservation} 
            variant="contained"
            disabled={!selectedMaterial || !selectedPOItem || !reservationQuantity}
          >
            Dodaj rezerwację
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog konwersji */}
      <Dialog open={dialogOpen && dialogType === 'convert'} maxWidth="sm" fullWidth>
        <DialogTitle>Przekształć na standardową rezerwację</DialogTitle>
        <DialogContent>
          {selectedReservation && (
            <Grid container spacing={3} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <Alert severity="info">
                  <AlertTitle>Rezerwacja z PO {selectedReservation.poNumber}</AlertTitle>
                  Materiał: {selectedReservation.materialName}<br/>
                  Zarezerwowane: {selectedReservation.reservedQuantity} {selectedReservation.unit}<br/>
                  Dostarczone: {selectedReservation.deliveredQuantity} {selectedReservation.unit}<br/>
                  Już przekształcone: {selectedReservation.convertedQuantity} {selectedReservation.unit}<br/>
                  Dostępne do przekształcenia: {Math.min(
                    selectedReservation.reservedQuantity - selectedReservation.convertedQuantity,
                    selectedReservation.deliveredQuantity - selectedReservation.convertedQuantity
                  )} {selectedReservation.unit}
                </Alert>
              </Grid>
              
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Wybierz partię</InputLabel>
                  <Select
                    value={selectedBatch?.batchId || ''}
                    onChange={(e) => {
                      const batch = selectedReservation.linkedBatches.find(
                        b => b.batchId === e.target.value
                      );
                      setSelectedBatch(batch);
                    }}
                  >
                    {selectedReservation.linkedBatches?.map((batch) => (
                      <MenuItem key={batch.batchId} value={batch.batchId}>
                        <Box>
                          <Typography>{batch.batchNumber}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {batch.quantity} {selectedReservation.unit} - {formatCurrency(batch.unitPrice)}
                          </Typography>
                        </Box>
                      </MenuItem>
                    )) || []}
                  </Select>
                </FormControl>
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  label="Ilość do przekształcenia"
                  type="number"
                  value={conversionQuantity}
                  onChange={(e) => setConversionQuantity(e.target.value)}
                  fullWidth
                  inputProps={{ 
                    min: 0, 
                    max: Math.min(
                      selectedReservation.reservedQuantity - selectedReservation.convertedQuantity,
                      selectedReservation.deliveredQuantity - selectedReservation.convertedQuantity
                    ),
                    step: 'any'
                  }}
                  helperText={`Zarezerwowano: ${Math.min(
                    selectedReservation.reservedQuantity - selectedReservation.convertedQuantity,
                    selectedReservation.deliveredQuantity - selectedReservation.convertedQuantity
                  )} ${selectedReservation.unit}`}
                />
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Anuluj</Button>
          <Button 
            onClick={handleConvertReservation} 
            variant="contained"
            disabled={!selectedBatch || !conversionQuantity}
          >
            Przekształć
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog podglądu */}
      <Dialog open={dialogOpen && dialogType === 'view'} maxWidth="md" fullWidth>
        <DialogTitle>
          Szczegóły rezerwacji z PO {selectedReservation?.poNumber}
        </DialogTitle>
        <DialogContent>
          {selectedReservation && (
            <Grid container spacing={3} sx={{ mt: 1 }}>
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Informacje podstawowe</Typography>
                    <Typography><strong>Materiał:</strong> {selectedReservation.materialName}</Typography>
                    <Typography><strong>Ilość zarezerwowana:</strong> {selectedReservation.reservedQuantity} {selectedReservation.unit}</Typography>
                    <Typography><strong>Cena jednostkowa:</strong> {formatCurrency(selectedReservation.unitPrice, selectedReservation.currency)}</Typography>
                    <Typography><strong>Status:</strong> {renderStatusChip(selectedReservation.status)}</Typography>
                    <Typography><strong>Data rezerwacji:</strong> {formatDateTime(selectedReservation.reservedAt)}</Typography>
                  </CardContent>
                </Card>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Dostawca</Typography>
                    <Typography><strong>Nazwa:</strong> {selectedReservation.supplier?.name || '-'}</Typography>
                    <Typography><strong>Planowana dostawa:</strong> {selectedReservation.expectedDeliveryDate ? formatDateTime(selectedReservation.expectedDeliveryDate).split(',')[0] : '-'}</Typography>
                    {selectedReservation.status === 'delivered' && (
                      <>
                        <Typography><strong>Dostarczone:</strong> {selectedReservation.deliveredQuantity} {selectedReservation.unit}</Typography>
                        <Typography><strong>Data dostawy:</strong> {selectedReservation.deliveredAt ? formatDateTime(selectedReservation.deliveredAt) : '-'}</Typography>
                      </>
                    )}
                  </CardContent>
                </Card>
              </Grid>
              
              {selectedReservation.linkedBatches && selectedReservation.linkedBatches.length > 0 && (
                <Grid item xs={12}>
                  <Card variant="outlined">
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        <BatchIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
                        Powiązane partie magazynowe
                      </Typography>
                      <List>
                        {selectedReservation.linkedBatches.map((batch, index) => (
                          <ListItem key={index}>
                            <ListItemText
                              primary={batch.batchNumber}
                              secondary={
                                <Box>
                                  <Typography variant="body2">
                                    Ilość: {batch.quantity} {selectedReservation.unit}
                                  </Typography>
                                  <Typography variant="body2">
                                    Cena: {formatCurrency(batch.unitPrice)}
                                  </Typography>
                                  {batch.expiryDate && (
                                    <Typography variant="body2">
                                      Data ważności: {formatDateTime(batch.expiryDate).split(',')[0]}
                                    </Typography>
                                  )}
                                </Box>
                              }
                            />
                          </ListItem>
                        ))}
                      </List>
                    </CardContent>
                  </Card>
                </Grid>
              )}
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Zamknij</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default POReservationManager; 