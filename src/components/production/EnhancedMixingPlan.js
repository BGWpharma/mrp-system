/**
 * Komponent ulepszonego planu mieszań z możliwością powiązania rezerwacji
 * 
 * Funkcjonalności:
 * - Wyświetlanie planu mieszań z checklistą
 * - Powiązywanie składników z rezerwacjami z PO
 * - Powiązywanie składników ze standardowymi rezerwacjami magazynowymi
 * - Zarządzanie mapowaniem składników na rezerwacje
 */

import React, { useState, useEffect, memo } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Button,
  FormControlLabel,
  Checkbox,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Autocomplete,
  TextField,
  Alert,
  AlertTitle,
  Card,
  CardContent,
  IconButton,
  Tooltip,
  Divider,
  CircularProgress,
  InputAdornment,
  FormHelperText
} from '@mui/material';
import {
  Link as LinkIcon,
  Cancel as UnlinkIcon,
  Info as InfoIcon,
  Assignment as AssignmentIcon,
  Refresh as RefreshIcon,
  LocationOn as LocationIcon,
  Schedule as ExpiryIcon,
  Edit as EditIcon
} from '@mui/icons-material';

import { useTranslation } from '../../hooks/useTranslation';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../contexts/ThemeContext';
import { baseColors, palettes } from '../../styles/colorConfig';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import {
  getStandardReservationsForTask,
  linkIngredientToReservation,
  unlinkIngredientFromReservation,
  getIngredientReservationLinks,
  getVirtualReservationsFromSnapshots
} from '../../services/mixingPlanReservationService';

const EnhancedMixingPlan = ({ 
  task, 
  onChecklistItemUpdate,
  onPlanUpdate 
}) => {
  const { t } = useTranslation('taskDetails');
  const { showSuccess, showError, showInfo } = useNotification();
  const { currentUser } = useAuth();
  const { mode } = useTheme();
  
  // Kolory odpowiednie dla aktualnego motywu
  const colors = baseColors[mode];
  const borderColor = colors.divider;

  // Stan komponentu
  const [standardReservations, setStandardReservations] = useState([]);
  const [ingredientLinks, setIngredientLinks] = useState({});
  const [loading, setLoading] = useState(true);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState(null);
  const [availableReservations, setAvailableReservations] = useState([]);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [linkQuantity, setLinkQuantity] = useState('');
  const [maxAvailableQuantity, setMaxAvailableQuantity] = useState(0);
  const [requiredQuantity, setRequiredQuantity] = useState(0);
  const [realtimeTask, setRealtimeTask] = useState(null);
  const [isTaskUpdating, setIsTaskUpdating] = useState(false);
  const [isLinksUpdating, setIsLinksUpdating] = useState(false);
  
  // Stany dla edycji ilości składników
  const [editQuantityDialogOpen, setEditQuantityDialogOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [editQuantityValue, setEditQuantityValue] = useState('');
  const [editQuantityLoading, setEditQuantityLoading] = useState(false);

  // Oblicz statystyki powiązań i postępu
  const totalIngredients = task?.mixingPlanChecklist
    ? task.mixingPlanChecklist.filter(item => item.type === 'ingredient').length
    : 0;
  const linkedIngredients = Object.keys(ingredientLinks).length;
  const linkagePercentage = totalIngredients > 0 
    ? Math.round((linkedIngredients / totalIngredients) * 100)
    : 0;



  // Real-time listener dla zadania (dla synchronizacji zmian checklisty z kiosku)
  useEffect(() => {
    if (!task?.id) return;

    let unsubscribeTask = null;
    let unsubscribeLinks = null;

    const setupRealtimeListeners = async () => {
      try {
        // 1. Real-time listener dla zadania produkcyjnego (dla checklisty)
        const taskRef = doc(db, 'productionTasks', task.id);
        unsubscribeTask = onSnapshot(taskRef, (docSnapshot) => {
          if (docSnapshot.exists()) {
            const taskData = { id: docSnapshot.id, ...docSnapshot.data() };
            
            // Sprawdź czy checklist się zmienił
            const newChecklist = taskData.mixingPlanChecklist || [];
            const oldChecklist = task.mixingPlanChecklist || [];
            
            const checklistChanged = JSON.stringify(newChecklist) !== JSON.stringify(oldChecklist);
            
            if (checklistChanged) {
              setIsTaskUpdating(true);
              setRealtimeTask(taskData);
              
              // Animacja aktualizacji
              setTimeout(() => setIsTaskUpdating(false), 500);
              
              console.log('🔄 Plan mieszań zaktualizowany w czasie rzeczywistym z kiosku');
              showInfo('Plan mieszań został zaktualizowany automatycznie');
            }
          }
        }, (error) => {
          console.error('Błąd listenera zadania w planie mieszań:', error);
        });

        // 2. Real-time listener dla powiązań rezerwacji
        const linksRef = collection(db, 'ingredientReservationLinks');
        const linksQuery = query(linksRef, where('taskId', '==', task.id));
        
        unsubscribeLinks = onSnapshot(linksQuery, async (snapshot) => {
          try {
            setIsLinksUpdating(true);
            
            // Odśwież powiązania gdy coś się zmieni
            const updatedLinks = await getIngredientReservationLinks(task.id);
            setIngredientLinks(updatedLinks);
            
            // Animacja aktualizacji
            setTimeout(() => setIsLinksUpdating(false), 800);
            
            console.log('🔄 Powiązania rezerwacji zaktualizowane w czasie rzeczywistym');
            showInfo('Powiązania rezerwacji zostały zaktualizowane automatycznie');
          } catch (error) {
            console.error('Błąd podczas aktualizacji powiązań:', error);
            setIsLinksUpdating(false);
          }
        });

        // 3. Pobierz dane początkowe
        await loadData();
        
      } catch (error) {
        console.error('Błąd podczas konfiguracji real-time listenerów:', error);
      }
    };

    setupRealtimeListeners();

    // Cleanup function
    return () => {
      if (unsubscribeTask) {
        unsubscribeTask();
        console.log('🛑 Odłączono listener zadania w planie mieszań');
      }
      if (unsubscribeLinks) {
        unsubscribeLinks();
        console.log('🛑 Odłączono listener powiązań w planie mieszań');
      }
    };
  }, [task?.id, showInfo]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      console.log('=== ŁADOWANIE DANYCH PLANU MIESZAŃ ===');
      console.log('ID zadania:', task.id);
      
      const [standardRes, virtualRes, links] = await Promise.all([
        getStandardReservationsForTask(task.id), // Dla nowych powiązań
        getVirtualReservationsFromSnapshots(task.id), // Z snapshotów dla istniejących
        getIngredientReservationLinks(task.id)
      ]);

      console.log('Pobrane rezerwacje standardowe (nowe):', standardRes);
      console.log('Pobrane wirtualne rezerwacje (snapshoty):', virtualRes);
      console.log('Pobrane powiązania:', links);
      
      // Połącz rzeczywiste rezerwacje z wirtualnymi ze snapshotów
      const allReservations = [...standardRes, ...virtualRes];
      console.log('Wszystkie dostępne rezerwacje:', allReservations);
      console.log('=====================================');

      setStandardReservations(allReservations);
      setIngredientLinks(links);
    } catch (error) {
      console.error('Błąd podczas pobierania danych planu mieszań:', error);
      showError('Nie udało się pobrać danych rezerwacji');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
    showInfo('Dane zostały odświeżone');
  };

  // Funkcja do parsowania ilości ze składnika
  const parseIngredientQuantity = (ingredient) => {
    // Próbuj wyciągnąć ilość z pola details (np. "Ilość: 2.5000 kg")
    if (ingredient.details) {
      const match = ingredient.details.match(/(\d+(?:\.\d+)?)/);
      if (match) {
        return parseFloat(match[1]);
      }
    }
    return 0;
  };



  // Otwórz dialog powiązania składnika z rezerwacją
  const handleLinkIngredient = (ingredient) => {
    setSelectedIngredient(ingredient);
    
    // Parsuj wymaganą ilość ze składnika
    const required = parseIngredientQuantity(ingredient);
    setRequiredQuantity(required);
    setLinkQuantity(required.toString());
    
    console.log('=== DEBUG POWIĄZANIA ===');
    console.log('Składnik:', ingredient);
    console.log('Nazwa składnika:', ingredient.text);
    console.log('Wszystkie rezerwacje standardowe:', standardReservations);
    
    // Przygotuj listę dostępnych rezerwacji dla tego składnika
    const ingredientName = ingredient.text;
    
    // Filtruj tylko rzeczywiste rezerwacje (nie wirtualne ze snapshotów) dla tego składnika
    const available = standardReservations.filter(res => {
      console.log(`Sprawdzam rezerwację - Nazwa materiału: "${res.materialName}", Składnik: "${ingredientName}", AvailableQty: ${res.availableQuantity}, ReservedQty: ${res.reservedQuantity}`);
      
      // Sprawdź czy to rzeczywista rezerwacja (ma reservedQuantity > linkedQuantity)
      // Wirtualne rezerwacje ze snapshotów mają reservedQuantity === linkedQuantity
      const isRealReservation = res.reservedQuantity > res.linkedQuantity;
      const matchesIngredient = res.materialName === ingredientName;
      const hasAvailableQuantity = res.availableQuantity > 0;
      
      console.log(`- IsReal: ${isRealReservation}, Matches: ${matchesIngredient}, HasQty: ${hasAvailableQuantity}`);
      
      return matchesIngredient && hasAvailableQuantity && isRealReservation;
    }).map(res => ({ ...res, type: 'standard' }));
    
    console.log('Dostępne rezerwacje po filtrowaniu:', available);
    console.log('========================');
    
    setAvailableReservations(available);
    setLinkDialogOpen(true);
  };

  // Aktualizuj maksymalną dostępną ilość gdy wybrana zostanie rezerwacja
  useEffect(() => {
    if (selectedReservation) {
      const maxQty = selectedReservation.availableQuantity;
      setMaxAvailableQuantity(maxQty);
      
      // Jeśli aktualna ilość powiązania przekracza dostępną, zmniejsz ją
      if (parseFloat(linkQuantity) > maxQty) {
        setLinkQuantity(Math.min(requiredQuantity, maxQty).toString());
      }
    }
  }, [selectedReservation, requiredQuantity, linkQuantity]);

  // Powiąż składnik z rezerwacją
  const handleConfirmLink = async () => {
    if (!selectedIngredient || !selectedReservation || !linkQuantity) return;

    const quantity = parseFloat(linkQuantity);
    
    if (isNaN(quantity) || quantity <= 0) {
      showError('Podaj prawidłową ilość powiązania');
      return;
    }

    if (quantity > maxAvailableQuantity) {
      showError(`Ilość nie może przekraczać dostępnej (${maxAvailableQuantity})`);
      return;
    }

    try {
      await linkIngredientToReservation(
        task.id,
        selectedIngredient.id,
        selectedReservation.id,
        selectedReservation.type,
        quantity, // Przekaż ilość powiązania
        currentUser.uid
      );

      // Nie odświeżaj manualnie - real-time listener to zrobi automatycznie
      console.log('✅ Powiązanie utworzone, czekam na real-time listener...');
      
      // Zamknij dialog
      setLinkDialogOpen(false);
      setSelectedIngredient(null);
      setSelectedReservation(null);
      setLinkQuantity('');
      setMaxAvailableQuantity(0);
      setRequiredQuantity(0);
      
      showSuccess(`Składnik został powiązany z rezerwacją (${quantity} ${selectedReservation.unit || 'szt.'})`);
      
      // Poinformuj komponent nadrzędny o aktualizacji
      if (onPlanUpdate) {
        onPlanUpdate();
      }
    } catch (error) {
      console.error('Błąd podczas powiązania składnika:', error);
      showError('Nie udało się powiązać składnika z rezerwacją');
    }
  };

  // Funkcje dla edycji ilości składników
  const handleEditQuantity = (ingredient) => {
    // Wyodrębnij aktualną ilość z details
    const quantityMatch = ingredient.details.match(/Ilość:\s*([\d,\.]+)/);
    const currentQuantity = quantityMatch ? quantityMatch[1] : '';
    
    setEditingIngredient(ingredient);
    setEditQuantityValue(currentQuantity);
    setEditQuantityDialogOpen(true);
  };

  const handleSaveQuantity = async () => {
    if (!editingIngredient || !editQuantityValue) return;

    const newQuantity = parseFloat(editQuantityValue.replace(',', '.'));
    
    if (isNaN(newQuantity) || newQuantity < 0) {
      showError('Podaj prawidłową ilość (liczba dodatnia)');
      return;
    }

    try {
      setEditQuantityLoading(true);
      
      // Importuj funkcję dynamicznie
      const { updateIngredientQuantityInMixingPlan } = await import('../../services/productionService');
      
      const result = await updateIngredientQuantityInMixingPlan(
        task.id,
        editingIngredient.id,
        newQuantity,
        currentUser.uid
      );
      
      if (result.success) {
        showSuccess(result.message);
        setEditQuantityDialogOpen(false);
        setEditingIngredient(null);
        setEditQuantityValue('');
        
        // Wywołaj callback dla odświeżenia danych
        if (onPlanUpdate) {
          onPlanUpdate();
        }
      }
    } catch (error) {
      console.error('Błąd podczas aktualizacji ilości:', error);
      showError('Błąd podczas aktualizacji ilości: ' + error.message);
    } finally {
      setEditQuantityLoading(false);
    }
  };

  const handleCancelEditQuantity = () => {
    setEditQuantityDialogOpen(false);
    setEditingIngredient(null);
    setEditQuantityValue('');
  };

  // Usuń powiązanie składnika z rezerwacją
  const handleUnlinkIngredient = async (ingredientId) => {
    try {
      await unlinkIngredientFromReservation(task.id, ingredientId, currentUser.uid);
      
      // Nie odświeżaj manualnie - real-time listener to zrobi automatycznie
      console.log('✅ Powiązanie usunięte, czekam na real-time listener...');
      
      showSuccess('Powiązanie zostało usunięte');
      
      // Poinformuj komponent nadrzędny o aktualizacji
      if (onPlanUpdate) {
        onPlanUpdate();
      }
    } catch (error) {
      console.error('Błąd podczas usuwania powiązania:', error);
      showError('Nie udało się usunąć powiązania');
    }
  };

  // Renderuj chip rezerwacji (tylko standardowe)
  const renderReservationChip = (reservation) => {
    return (
      <Chip
        size="small"
        label={`LOT: ${reservation.batchNumber}`}
        color="secondary"
        variant="outlined"
        icon={<AssignmentIcon />}
      />
    );
  };

  // Renderuj status powiązania składnika (używa snapshotu zamiast standardReservations)
  const renderIngredientLinkStatus = (ingredient) => {
    const link = ingredientLinks[ingredient.id];
    
    if (link) {
      // UŻYJ DANYCH ZE SNAPSHOTU zamiast szukania w standardReservations
      const reservationFromSnapshot = {
        id: link.reservationId,
        batchNumber: link.batchSnapshot?.batchNumber || 'Brak numeru',
        unit: link.batchSnapshot?.unit || 'szt.',
        materialName: link.batchSnapshot?.materialName || 'Nieznany materiał',
        warehouseName: link.batchSnapshot?.warehouseName,
        warehouseAddress: link.batchSnapshot?.warehouseAddress,
        expiryDateString: link.batchSnapshot?.expiryDateString
      };
      
      return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flexGrow: 1 }}>
            {renderReservationChip({ ...reservationFromSnapshot, type: link.reservationType })}
            
            {/* Podstawowe informacje o powiązaniu */}
            <Typography variant="caption" sx={{ color: colors.text.secondary, mt: 0.5 }}>
              Powiązano: {link.linkedQuantity || link.quantity} {reservationFromSnapshot.unit}
            </Typography>
            
            {/* Informacje o konsumpcji jeśli istnieją */}
            {link.consumedQuantity > 0 && (
              <Box sx={{ width: '100%', mt: 0.5 }}>
                <Typography variant="caption" sx={{ 
                  color: link.isFullyConsumed ? 'success.main' : 'warning.main' 
                }}>
                  Skonsumowano: {link.consumedQuantity} / Pozostało: {link.remainingQuantity} {reservationFromSnapshot.unit}
                </Typography>
                
                {/* Pasek postępu konsumpcji */}
                {link.consumptionPercentage !== undefined && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                    <Box sx={{ 
                      width: '60px', 
                      height: '4px', 
                      bgcolor: mode === 'dark' ? 'rgba(255, 255, 255, 0.2)' : 'grey.200', 
                      borderRadius: 2,
                      overflow: 'hidden'
                    }}>
                      <Box sx={{
                        width: `${link.consumptionPercentage}%`,
                        height: '100%',
                        bgcolor: link.consumptionPercentage === 100 ? 'success.main' : 'primary.main',
                        transition: 'width 0.3s ease'
                      }} />
                    </Box>
                    <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.7rem' }}>
                      {link.consumptionPercentage}%
                    </Typography>
                  </Box>
                )}
              </Box>
            )}
            
            {/* Historia konsumpcji - tylko jeśli istnieje */}
            {link.consumptionHistory && link.consumptionHistory.length > 0 && (
              <Typography 
                variant="caption" 
                sx={{ 
                  color: 'primary.main', 
                  cursor: 'help',
                  textDecoration: 'underline',
                  fontSize: '0.7rem',
                  mt: 0.5
                }}
                title={`Historia konsumpcji: ${link.consumptionHistory.length} wpisów`}
              >
                Historia ({link.consumptionHistory.length} wpisów)
              </Typography>
            )}
          </Box>
          
          {/* Pokazuj przycisk odłączenia tylko jeśli nie jest w pełni skonsumowane */}
          {!link.isFullyConsumed && (
            <IconButton
              size="small"
              onClick={() => handleUnlinkIngredient(ingredient.id)}
              color="error"
              sx={{ alignSelf: 'flex-start' }}
            >
              <UnlinkIcon fontSize="small" />
            </IconButton>
          )}
          
          {/* Ikona informacji dla w pełni skonsumowanych */}
          {link.isFullyConsumed && (
            <Tooltip title="Powiązanie zostało w pełni skonsumowane">
              <InfoIcon fontSize="small" color="success" sx={{ alignSelf: 'flex-start' }} />
            </Tooltip>
          )}
        </Box>
      );
    }
    
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LinkIcon fontSize="small" sx={{ color: colors.text.disabled }} />
        <Typography variant="caption" sx={{ color: colors.text.secondary, fontStyle: 'italic' }}>
          Kliknij wiersz aby powiązać
        </Typography>
      </Box>
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!task?.mixingPlanChecklist || task.mixingPlanChecklist.length === 0) {
    return (
      <Alert severity="info">
        <AlertTitle>Brak planu mieszań</AlertTitle>
        Plan mieszań nie został jeszcze wygenerowany dla tego zadania.
      </Alert>
    );
  }

  return (
    <Paper sx={{ p: 1.5, mb: 1.5 }}>
      {/* Nagłówek z przyciskami */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="h6" sx={{ fontSize: '1.1rem' }}>{t('mixingPlan.title')}</Typography>
          {totalIngredients > 0 && (
            <Chip
              label={`${linkedIngredients}/${totalIngredients} (${linkagePercentage}%)`}
              size="small"
              color={linkagePercentage === 100 ? 'success' : linkagePercentage > 50 ? 'warning' : 'default'}
              variant="outlined"
              sx={{ height: 20, fontSize: '0.7rem' }}
            />
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {/* Wskaźnik synchronizacji */}
          {(isTaskUpdating || isLinksUpdating) && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: 'success.main',
                  animation: 'pulse 1.5s infinite',
                  '@keyframes pulse': {
                    '0%': { opacity: 1 },
                    '50%': { opacity: 0.5 },
                    '100%': { opacity: 1 }
                  }
                }}
              />
              <Typography variant="caption" sx={{ color: 'success.main', fontSize: '0.7rem' }}>
                {isLinksUpdating ? 'Aktualizacja powiązań...' : 'Synchronizacja...'}
              </Typography>
            </Box>
          )}
          
          <Button
            startIcon={<RefreshIcon />}
            onClick={refreshData}
            disabled={refreshing}
            size="small"
            sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
          >
            Odśwież
          </Button>
        </Box>
      </Box>



      {/* Lista mieszań - użyj danych real-time jeśli dostępne */}
      {(realtimeTask || task).mixingPlanChecklist.filter(item => item.type === 'header').map(headerItem => {
        const currentTask = realtimeTask || task;
        const ingredients = currentTask.mixingPlanChecklist.filter(
          item => item.parentId === headerItem.id && item.type === 'ingredient'
        );
        const checkItems = currentTask.mixingPlanChecklist.filter(
          item => item.parentId === headerItem.id && item.type === 'check'
        );
        

        
        return (
          <Box key={headerItem.id} sx={{ 
            mb: 2, 
            border: '1px solid', 
            borderColor: borderColor, 
            borderRadius: 3, 
            overflow: 'hidden',
            bgcolor: colors.paper
          }}>
            {/* Nagłówek mieszania z tłem */}
            <Box sx={{ 
              p: 2, 
              bgcolor: colors.background,
              borderBottom: '1px solid',
              borderColor: borderColor
            }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main', mb: 0.5 }}>
                {headerItem.text}
              </Typography>
              {headerItem.details && (
                <Typography variant="body2" sx={{ color: colors.text.secondary }}>
                  {headerItem.details}
                </Typography>
              )}
            </Box>
            
            <Box sx={{ p: 2 }}>
            
            <Grid container spacing={1.5}>
              {/* Składniki z możliwością powiązania rezerwacji */}
              <Grid item xs={12} md={8}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: colors.text.primary }}>
                  Składniki i rezerwacje
                </Typography>
                
                {ingredients.length === 0 ? (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Brak składników w tym mieszaniu
                  </Alert>
                ) : (
                  <Box sx={{ 
                    border: '1px solid',
                    borderColor: borderColor,
                    borderRadius: 2,
                    overflow: 'hidden'
                  }}>
                    {/* Nagłówek grid */}
                    <Box sx={{ 
                      display: 'grid', 
                      gridTemplateColumns: '2fr 1fr 2fr 60px',
                      gap: 2,
                      bgcolor: colors.background,
                      p: 1.5,
                      borderBottom: '1px solid',
                      borderColor: borderColor
                    }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.text.primary }}>
                        Składnik
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.text.primary }}>
                        Ilość
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.text.primary }}>
                        Rezerwacja
                      </Typography>
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: colors.text.primary }}>
                        Akcje
                      </Typography>
                    </Box>
                    
                    {/* Wiersze składników */}
                    {ingredients.map((ingredient, index) => {
                      const link = ingredientLinks[ingredient.id];
                      const isLinked = !!link;
                      
                      return (
                      <Box 
                        key={ingredient.id} 
                        sx={{ 
                          display: 'grid', 
                          gridTemplateColumns: '2fr 1fr 2fr 60px',
                          gap: 2,
                          p: 1.5,
                          borderBottom: index < ingredients.length - 1 ? '1px solid' : 'none',
                          borderColor: borderColor,
                          cursor: !isLinked ? 'pointer' : 'default',
                          '&:hover': {
                            bgcolor: !isLinked ? (mode === 'dark' ? 'rgba(25, 118, 210, 0.2)' : 'primary.light') : colors.background,
                            opacity: !isLinked ? 0.8 : 1
                          }
                        }}
                        onClick={() => !isLinked && handleLinkIngredient(ingredient)}
                      >
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: colors.text.primary }}>
                            {ingredient.text}
                          </Typography>
                        </Box>
                        
                        <Box>
                          <Typography variant="body2" sx={{ color: colors.text.secondary }}>
                            {ingredient.details}
                          </Typography>
                        </Box>
                        
                        <Box>
                          {renderIngredientLinkStatus(ingredient)}
                        </Box>
                        
                        <Box>
                          <Tooltip title="Edytuj ilość">
                            <IconButton 
                              size="small" 
                              onClick={() => handleEditQuantity(ingredient)}
                              sx={{ color: 'primary.main' }}
                            >
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </Box>
                      );
                    })}
                  </Box>
                )}
              </Grid>
              
              {/* Status wykonania - checkboxy */}
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: colors.text.primary }}>
                  Status wykonania
                </Typography>
                <Box sx={{ 
                  border: '1px solid',
                  borderColor: borderColor,
                  borderRadius: 2,
                  bgcolor: colors.paper
                }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                  {checkItems.map((item, index) => (
                    <Box key={item.id} sx={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'space-between',
                      p: 1.5,
                      borderBottom: index < checkItems.length - 1 ? '1px solid' : 'none',
                      borderColor: borderColor,
                      '&:hover': {
                        bgcolor: colors.background
                      }
                    }}>
                      <FormControlLabel 
                        control={
                          <Checkbox 
                            checked={item.completed || false}
                            size="small"
                            onChange={(e) => onChecklistItemUpdate(item.id, e.target.checked)}
                          />
                        } 
                        label={
                          <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                            {item.text}
                          </Typography>
                        }
                        sx={{ margin: 0 }}
                      />
                      {item.completed && (
                        <Chip 
                          size="small" 
                          label={item.completedAt ? new Date(item.completedAt).toLocaleDateString('pl-PL') : '-'} 
                          color="success" 
                          variant="outlined" 
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      )}
                    </Box>
                  ))}
                </Box>
                </Box>
              </Grid>
            </Grid>
            </Box>
          </Box>
        );
      })}

      {/* Dialog powiązania składnika z rezerwacją */}
      <Dialog open={linkDialogOpen} onClose={() => setLinkDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          Powiąż składnik z rezerwacją
          {selectedIngredient && (
            <Typography variant="subtitle2" color="text.secondary">
              Składnik: {selectedIngredient.text}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          {availableReservations.length === 0 ? (
            <Alert severity="warning">
              <AlertTitle>Brak dostępnych rezerwacji</AlertTitle>
              Nie znaleziono dostępnych rezerwacji dla tego składnika.
              Sprawdź czy materiał ma aktywne rezerwacje w systemie.
            </Alert>
          ) : (
            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" sx={{ mb: 2 }}>
                Wybierz rezerwację do powiązania ze składnikiem:
              </Typography>
              
              <Autocomplete
                options={availableReservations}
                value={selectedReservation}
                onChange={(event, newValue) => setSelectedReservation(newValue)}
                getOptionLabel={(option) => `LOT: ${option.batchNumber} - ${option.availableQuantity} ${option.unit}`}
                renderOption={(props, option) => (
                  <Box component="li" {...props}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {renderReservationChip(option)}
                        <Typography variant="body2">
                          {option.materialName}
                        </Typography>
                      </Box>
                      <Typography variant="caption" color="text.secondary">
                        Dostępne: {option.availableQuantity} {option.unit}
                        {option.linkedQuantity > 0 && (
                          <span style={{ color: '#ff9800', marginLeft: 8 }}>
                            (Powiązano: {option.linkedQuantity} {option.unit})
                          </span>
                        )}
                      </Typography>
                      
                      {/* Informacje o lokalizacji */}
                      {option.warehouseName && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                          <LocationIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary">
                            {option.warehouseName}
                            {option.warehouseAddress && ` (${option.warehouseAddress})`}
                          </Typography>
                        </Box>
                      )}
                      
                      {/* Informacje o dacie ważności */}
                      {option.expiryDateString && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                          <ExpiryIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                          <Typography variant="caption" color="text.secondary">
                            Ważność: {option.expiryDateString}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  </Box>
                )}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Wybierz rezerwację"
                    variant="outlined"
                    fullWidth
                  />
                )}
                sx={{ mb: 2 }}
              />

              {/* Szczegóły wybranej rezerwacji */}
              {selectedReservation && (
                <Paper sx={{ 
                  mb: 2, 
                  p: 2, 
                  bgcolor: (theme) => theme.palette.mode === 'dark' 
                    ? theme.palette.grey[900] 
                    : theme.palette.grey[50],
                  elevation: 1
                }}>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>
                    Szczegóły wybranej partii:
                  </Typography>
                  
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {/* Lokalizacja */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <LocationIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                      <Typography variant="body2">
                        <strong>Lokalizacja:</strong> {selectedReservation.warehouseName || 'Nieznana'}
                        {selectedReservation.warehouseAddress && ` (${selectedReservation.warehouseAddress})`}
                      </Typography>
                    </Box>
                    
                    {/* Data ważności */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <ExpiryIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                      <Typography variant="body2">
                        <strong>Data ważności:</strong> {selectedReservation.expiryDateString || 'Brak terminu ważności'}
                      </Typography>
                    </Box>
                    
                    {/* Numer partii */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <AssignmentIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                      <Typography variant="body2">
                        <strong>Numer partii:</strong> {selectedReservation.batchNumber}
                      </Typography>
                    </Box>
                  </Box>
                </Paper>
              )}

              {/* Kontrola ilości powiązania */}
              {selectedReservation && (
                <Box sx={{ mt: 2 }}>
                  <TextField
                    label="Ilość do powiązania"
                    type="number"
                    value={linkQuantity}
                    onChange={(e) => setLinkQuantity(e.target.value)}
                    fullWidth
                    variant="outlined"
                    inputProps={{
                      min: 0,
                      max: maxAvailableQuantity,
                      step: 0.0001
                    }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          {selectedReservation.unit || 'szt.'}
                        </InputAdornment>
                      )
                    }}
                    helperText={
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Wymagane: {requiredQuantity} {selectedReservation.unit || 'szt.'} | 
                          Dostępne: {maxAvailableQuantity} {selectedReservation.unit || 'szt.'}
                        </Typography>
                        {parseFloat(linkQuantity) > maxAvailableQuantity && (
                          <Typography variant="caption" color="error" display="block">
                            Ilość przekracza dostępną rezerwację
                          </Typography>
                        )}
                        {parseFloat(linkQuantity) > requiredQuantity && (
                          <Typography variant="caption" color="warning.main" display="block">
                            Ilość większa niż wymagana do mieszania
                          </Typography>
                        )}
                      </Box>
                    }
                  />
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLinkDialogOpen(false)}>
            Anuluj
          </Button>
          <Button 
            onClick={handleConfirmLink}
            variant="contained"
            disabled={!selectedReservation || !linkQuantity || parseFloat(linkQuantity) <= 0 || parseFloat(linkQuantity) > maxAvailableQuantity}
          >
            Powiąż
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog edycji ilości składnika */}
      <Dialog open={editQuantityDialogOpen} onClose={handleCancelEditQuantity} maxWidth="sm" fullWidth>
        <DialogTitle>
          Edytuj ilość składnika
          {editingIngredient && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              {editingIngredient.text}
            </Typography>
          )}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Nowa ilość"
            type="number"
            fullWidth
            variant="outlined"
            value={editQuantityValue}
            onChange={(e) => setEditQuantityValue(e.target.value)}
            helperText={editingIngredient ? `Aktualna ilość: ${editingIngredient.details}` : ''}
            InputProps={{
              inputProps: { 
                min: 0, 
                step: 0.001,
                style: { textAlign: 'right' }
              },
              endAdornment: editingIngredient && (
                <InputAdornment position="end">
                  {(() => {
                    const unitMatch = editingIngredient.details.match(/\s(\w+)$/);
                    return unitMatch ? unitMatch[1] : 'kg';
                  })()}
                </InputAdornment>
              )
            }}
            sx={{ mt: 2 }}
          />
          <Alert severity="info" sx={{ mt: 2 }}>
            <AlertTitle>Informacja</AlertTitle>
            Zmiana ilości składnika zaktualizuje plan mieszań i automatycznie przeliczy sumę dla całego mieszania.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelEditQuantity}>
            Anuluj
          </Button>
          <Button 
            onClick={handleSaveQuantity}
            variant="contained"
            disabled={editQuantityLoading || !editQuantityValue || parseFloat(editQuantityValue.replace(',', '.')) < 0}
            startIcon={editQuantityLoading ? <CircularProgress size={16} /> : null}
          >
            {editQuantityLoading ? 'Zapisuję...' : 'Zapisz'}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default memo(EnhancedMixingPlan);
