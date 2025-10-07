/**
 * Komponent ulepszonego planu mieszań z możliwością powiązania rezerwacji
 * 
 * Funkcjonalności:
 * - Wyświetlanie planu mieszań z checklistą
 * - Powiązywanie składników z rezerwacjami z PO
 * - Powiązywanie składników ze standardowymi rezerwacjami magazynowymi
 * - Zarządzanie mapowaniem składników na rezerwacje
 */

import React, { useState, useEffect, memo, useMemo, useCallback, useRef } from 'react';
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
  FormHelperText,
  MenuItem
} from '@mui/material';
import {
  Link as LinkIcon,
  Cancel as UnlinkIcon,
  Info as InfoIcon,
  Assignment as AssignmentIcon,
  Refresh as RefreshIcon,
  LocationOn as LocationIcon,
  Schedule as ExpiryIcon,
  Edit as EditIcon,
  Add as AddIcon,
  Remove as RemoveIcon
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
  unlinkSpecificReservation,
  getIngredientReservationLinks,
  getVirtualReservationsFromSnapshots,
  getLinkedReservationIds
} from '../../services/mixingPlanReservationService';
import { debounce } from 'lodash';

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

  // Stany dla dodawania mieszanki
  const [addMixingDialogOpen, setAddMixingDialogOpen] = useState(false);
  const [newMixingIngredients, setNewMixingIngredients] = useState([{ name: '', quantity: '', unit: 'kg' }]);
  const [newMixingPiecesCount, setNewMixingPiecesCount] = useState('');
  const [addingMixing, setAddingMixing] = useState(false);
  const [taskMaterials, setTaskMaterials] = useState([]);
  const [removingMixing, setRemovingMixing] = useState(null);
  const [removeMixingDialogOpen, setRemoveMixingDialogOpen] = useState(false);
  const [mixingToRemove, setMixingToRemove] = useState(null);

  // Stany dla edycji ilości składników
  const [editQuantityDialogOpen, setEditQuantityDialogOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState(null);
  const [editQuantityValue, setEditQuantityValue] = useState('');
  const [editQuantityLoading, setEditQuantityLoading] = useState(false);

  // ✅ Ref do śledzenia ostatniego checklistu aby zapobiec pętlom synchronizacji
  const lastChecklistRef = useRef(null);
  const updateTimeoutRef = useRef(null);

  // Oblicz statystyki powiązań i postępu
  const totalIngredients = task?.mixingPlanChecklist
    ? task.mixingPlanChecklist.filter(item => item.type === 'ingredient').length
    : 0;
  const linkedIngredients = Object.keys(ingredientLinks).filter(key =>
    ingredientLinks[key] && ingredientLinks[key].length > 0
  ).length;
  const linkagePercentage = totalIngredients > 0
    ? Math.round((linkedIngredients / totalIngredients) * 100)
    : 0;

  // Pobierz materiały z zadania produkcyjnego dla autouzupełniania
  useEffect(() => {
    if (task?.materials && Array.isArray(task.materials)) {
      // Przekształć materiały zadania na format opcji autouzupełniania
      const materialOptions = task.materials.map(material => ({
        label: material.name,
        value: material.name,
        id: material.id || material.inventoryItemId,
        unit: material.unit || 'szt.'
      }));
      setTaskMaterials(materialOptions);
    } else {
      setTaskMaterials([]);
    }
  }, [task?.materials]);

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
            
            // ✅ POPRAWKA: Sprawdź czy checklist się zmienił względem ostatniego znanego stanu
            const newChecklist = taskData.mixingPlanChecklist || [];
            const newChecklistStr = JSON.stringify(newChecklist);
            
            // Porównaj z ostatnio zapisanym checklistem (nie z propem który może być nieaktualny)
            if (lastChecklistRef.current === null) {
              // Pierwsza inicjalizacja - zapisz aktualny stan bez wywoływania aktualizacji
              lastChecklistRef.current = newChecklistStr;
              console.log('🔷 Inicjalizacja listenera planu mieszań');
              return;
            }
            
            const checklistChanged = newChecklistStr !== lastChecklistRef.current;
            
            if (checklistChanged) {
              console.log('🔄 Wykryto zmianę w planie mieszań przez listener');
              lastChecklistRef.current = newChecklistStr;
              
              setIsTaskUpdating(true);
              setRealtimeTask(taskData);
              
              // Animacja aktualizacji
              setTimeout(() => setIsTaskUpdating(false), 500);
              
              // Plan mieszań zaktualizowany z kiosku lub z innej sesji
              showInfo('Plan mieszań został zaktualizowany automatycznie');
              
              // ✅ Odłóż wywołanie onPlanUpdate aby uniknąć konfliktów
              if (updateTimeoutRef.current) {
                clearTimeout(updateTimeoutRef.current);
              }
              updateTimeoutRef.current = setTimeout(() => {
                if (onPlanUpdate) {
                  console.log('🔄 Wywołanie onPlanUpdate po wykryciu zmiany');
                  onPlanUpdate();
                }
              }, 1500); // Opóźnienie 1.5s aby dać czas na zakończenie bieżących operacji
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
            
            // Odśwież ZARÓWNO powiązania JAK I standardowe rezerwacje aby zaktualizować dostępne ilości
            const [updatedLinks, updatedStandardRes, updatedVirtualRes] = await Promise.all([
              getIngredientReservationLinks(task.id),
              getStandardReservationsForTask(task.id), // Ponowne pobranie z uwzględnieniem nowych powiązań
              getVirtualReservationsFromSnapshots(task.id)
            ]);
            
            setIngredientLinks(updatedLinks);
            
            // Połącz rezerwacje z odświeżonymi dostępnymi ilościami
            const allReservations = [...updatedStandardRes, ...updatedVirtualRes];
            setStandardReservations(allReservations);
            
            // Animacja aktualizacji
            setTimeout(() => setIsLinksUpdating(false), 800);
            
            // Powiązania zaktualizowane
            showInfo('Powiązania i dostępne ilości zostały zaktualizowane automatycznie');
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
        // Odłączono listener zadania
      }
      if (unsubscribeLinks) {
        unsubscribeLinks();
        // Odłączono listener powiązań
      }
      // ✅ Wyczyść timeout onPlanUpdate
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
      // Wyczyść debounced funkcję
      handleLinkIngredient.cancel();
    };
  }, [task?.id, showInfo]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Ładowanie danych planu mieszań dla ${task.id}
      
      const [standardRes, virtualRes, links] = await Promise.all([
        getStandardReservationsForTask(task.id), // Dla nowych powiązań
        getVirtualReservationsFromSnapshots(task.id), // Z snapshotów dla istniejących
        getIngredientReservationLinks(task.id)
      ]);

      // Połącz rzeczywiste rezerwacje z wirtualnymi ze snapshotów
      const allReservations = [...standardRes, ...virtualRes];
      // Dostępne rezerwacje: ${allReservations.length}

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



  // 🚀 OPTYMALIZACJA C: Debounced funkcja otwierania dialogu powiązań
  const handleLinkIngredientImmediate = async (ingredient) => {
    setSelectedIngredient(ingredient);
    
    // Parsuj wymaganą ilość ze składnika
    const required = parseIngredientQuantity(ingredient);
    setRequiredQuantity(required);
    
    // Oblicz ile już powiązano dla tego składnika
    const existingLinks = ingredientLinks[ingredient.id] || [];
    const alreadyLinkedQuantity = existingLinks.reduce((sum, link) => sum + (link.linkedQuantity || 0), 0);
    
    // Oblicz ile jeszcze potrzeba powiązać
    const remainingToLink = Math.max(0, required - alreadyLinkedQuantity);
    
    // Kalkulacja: wymagane ${required}, powiązane ${alreadyLinkedQuantity}, pozostałe ${remainingToLink}
    
    // Ustaw domyślną ilość jako pozostałą do powiązania
    setLinkQuantity(remainingToLink > 0 ? remainingToLink.toString() : '0');
    
    // Debug powiązania dla składnika: ${ingredient.text}
    
    // Pobierz listę już powiązanych rezerwacji dla tego składnika
    const linkedReservationIds = await getLinkedReservationIds(task.id, ingredient.id);
    // Powiązane rezerwacje: ${linkedReservationIds.length}
    
    // Przygotuj listę dostępnych rezerwacji dla tego składnika
    const ingredientName = ingredient.text;
    
    // ✅ POPRAWKA: Bardziej elastyczne dopasowywanie nazw materiałów
    // Filtruj tylko rzeczywiste rezerwacje (nie wirtualne ze snapshotów) dla tego składnika
    // oraz wyklucz już powiązane rezerwacje
    const available = standardReservations.filter(res => {
      console.log(`🔍 Sprawdzam rezerwację - Nazwa materiału: "${res.materialName}", Składnik: "${ingredientName}", AvailableQty: ${res.availableQuantity}, ReservedQty: ${res.reservedQuantity}`);
      
      // Sprawdź czy to rzeczywista rezerwacja (ma reservedQuantity > linkedQuantity)
      // Wirtualne rezerwacje ze snapshotów mają reservedQuantity === linkedQuantity
      const isRealReservation = res.reservedQuantity > res.linkedQuantity;
      
      // ✅ ELASTYCZNE DOPASOWYWANIE: Sprawdź różne warianty dopasowania nazw
      const materialNameLower = (res.materialName || '').toLowerCase().trim();
      const ingredientNameLower = (ingredientName || '').toLowerCase().trim();
      
      // 1. Dokładne dopasowanie (case-insensitive)
      const exactMatch = materialNameLower === ingredientNameLower;
      
      // 2. Nazwa materiału zawiera nazwę składnika (np. "RAWGW-SWEET 25kg" zawiera "RAWGW-SWEET")
      const materialContainsIngredient = materialNameLower.includes(ingredientNameLower);
      
      // 3. Nazwa składnika zawiera nazwę materiału (np. "RAWGW-SWEET-EXTRA" zawiera "RAWGW-SWEET")
      const ingredientContainsMaterial = ingredientNameLower.includes(materialNameLower);
      
      // 4. Dopasowanie po usunięciu znaków specjalnych (np. "RAWGW-SWEET" vs "RAWGW SWEET")
      const normalizedMaterial = materialNameLower.replace(/[-_\s]/g, '');
      const normalizedIngredient = ingredientNameLower.replace(/[-_\s]/g, '');
      const normalizedMatch = normalizedMaterial === normalizedIngredient || 
                              normalizedMaterial.includes(normalizedIngredient) ||
                              normalizedIngredient.includes(normalizedMaterial);
      
      const matchesIngredient = exactMatch || materialContainsIngredient || ingredientContainsMaterial || normalizedMatch;
      
      const hasAvailableQuantity = res.availableQuantity > 0;
      const notAlreadyLinked = !linkedReservationIds.includes(res.id);
      
      console.log(`  ➜ IsReal: ${isRealReservation}, Matches: ${matchesIngredient} (exact: ${exactMatch}, contains: ${materialContainsIngredient}/${ingredientContainsMaterial}, normalized: ${normalizedMatch}), HasQty: ${hasAvailableQuantity}, NotLinked: ${notAlreadyLinked}`);
      
      return matchesIngredient && hasAvailableQuantity && isRealReservation && notAlreadyLinked;
    }).map(res => ({ ...res, type: 'standard' }));
    
    // Dostępne po filtrowaniu: ${available.length}
    
    setAvailableReservations(available);
    setLinkDialogOpen(true);
  };

  // Debounced wersja funkcji - zapobiega wielokrotnemu szybkiemu klikaniu
  const handleLinkIngredient = useMemo(
    () => debounce(handleLinkIngredientImmediate, 300),
    [standardReservations, ingredientLinks, task.id]
  );

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

      // Odśwież dane natychmiast - nie czekaj tylko na real-time listener
      console.log('✅ Powiązanie utworzone, odświeżam dane...');
      
      // Zamknij dialog
      setLinkDialogOpen(false);
      setSelectedIngredient(null);
      setSelectedReservation(null);
      setLinkQuantity('');
      setMaxAvailableQuantity(0);
      setRequiredQuantity(0);
      
      // Real-time listener automatycznie odświeży dane
      
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

  // Usuń konkretne powiązanie składnik-rezerwacja
  const handleUnlinkSpecificReservation = async (linkId) => {
    try {
      await unlinkSpecificReservation(linkId, currentUser.uid);
      
      // Odśwież dane natychmiast - nie czekaj tylko na real-time listener
      console.log('✅ Konkretne powiązanie usunięte, odświeżam dane...');
      
      // Real-time listener automatycznie odświeży dane
      
      showSuccess('Powiązanie zostało usunięte');
      
      // Poinformuj komponent nadrzędny o aktualizacji
      if (onPlanUpdate) {
        onPlanUpdate();
      }
    } catch (error) {
      console.error('Błąd podczas usuwania konkretnego powiązania:', error);
      showError('Nie udało się usunąć powiązania');
    }
  };

  // Usuń wszystkie powiązania składnika (zachowane dla kompatybilności)
  const handleUnlinkIngredient = async (ingredientId) => {
    try {
      await unlinkIngredientFromReservation(task.id, ingredientId, currentUser.uid);
      
      // Odśwież dane natychmiast - nie czekaj tylko na real-time listener
      console.log('✅ Wszystkie powiązania składnika usunięte, odświeżam dane...');
      
      // Real-time listener automatycznie odświeży dane
      
      showSuccess('Wszystkie powiązania zostały usunięte');
      
      // Poinformuj komponent nadrzędny o aktualizacji
      if (onPlanUpdate) {
        onPlanUpdate();
      }
    } catch (error) {
      console.error('Błąd podczas usuwania powiązań składnika:', error);
      showError('Nie udało się usunąć powiązań');
    }
  };

  // Funkcja do dodawania nowej mieszanki
  const handleAddMixing = async () => {
    if (!currentUser?.uid) {
      showError(t('auth.errors.notAuthenticated'));
      return;
    }

    if (newMixingIngredients.length === 0 || !newMixingIngredients[0].name) {
      showError(t('mixingPlan.noIngredients'));
      return;
    }

    // Sprawdź czy wszystkie składniki mają nazwy i ilości
    const validIngredients = newMixingIngredients.filter(ing => ing.name && ing.quantity > 0);
    if (validIngredients.length === 0) {
      showError(t('mixingPlan.invalidIngredients'));
      return;
    }

    try {
      setAddingMixing(true);

      const mixingData = {
        ingredients: validIngredients.map(ing => ({
          name: ing.name,
          quantity: parseFloat(ing.quantity),
          unit: ing.unit
        })),
        piecesCount: newMixingPiecesCount ? parseFloat(newMixingPiecesCount) : undefined
      };

      const { addMixingToPlan } = await import('../../services/productionService');
      const result = await addMixingToPlan(task.id, mixingData, currentUser.uid);

      if (result.success) {
        showSuccess(result.message);
        setAddMixingDialogOpen(false);
        setNewMixingIngredients([{ name: '', quantity: '', unit: 'kg' }]);
        setNewMixingPiecesCount('');

        // Odśwież dane zadania
        if (onPlanUpdate) {
          onPlanUpdate();
        }
      }
    } catch (error) {
      console.error('Błąd podczas dodawania mieszania:', error);
      showError(t('mixingPlan.errors.addMixingFailed') + ': ' + error.message);
    } finally {
      setAddingMixing(false);
    }
  };

  // Funkcja do dodawania składnika w modalu
  const addIngredientField = () => {
    setNewMixingIngredients([...newMixingIngredients, { name: '', quantity: '', unit: 'kg' }]);
  };

  // Funkcja do usuwania składnika w modalu
  const removeIngredientField = (index) => {
    const updated = newMixingIngredients.filter((_, i) => i !== index);
    setNewMixingIngredients(updated);
  };

  // Funkcja do aktualizacji składnika w modalu
  const updateIngredientField = (index, field, value) => {
    const updated = newMixingIngredients.map((ing, i) =>
      i === index ? { ...ing, [field]: value } : ing
    );
    setNewMixingIngredients(updated);
  };

  // Funkcja do usuwania mieszanki
  const handleRemoveMixing = async (mixingId) => {
    if (!currentUser?.uid) {
      showError(t('auth.errors.notAuthenticated'));
      return;
    }

    // Wyciągnij numer mieszania z ID
    const mixingNumber = mixingId.match(/mixing-(\d+)/)?.[1];
    if (!mixingNumber) {
      showError(t('mixingPlan.errors.invalidMixingId'));
      return;
    }

    // Otwórz dialog potwierdzenia zamiast używać confirm
    setMixingToRemove({ id: mixingId, number: mixingNumber });
    setRemoveMixingDialogOpen(true);
  };

  // Funkcja do potwierdzania usunięcia mieszanki
  const handleConfirmRemoveMixing = async () => {
    if (!mixingToRemove) return;

    try {
      setRemovingMixing(mixingToRemove.id);

      const { removeMixingFromPlan } = await import('../../services/productionService');
      const result = await removeMixingFromPlan(task.id, parseInt(mixingToRemove.number), currentUser.uid);

      if (result.success) {
        showSuccess(result.message);

        // Odśwież dane zadania
        if (onPlanUpdate) {
          onPlanUpdate();
        }
      }
    } catch (error) {
      console.error('Błąd podczas usuwania mieszania:', error);
      showError(t('mixingPlan.errors.removeMixingFailed') + ': ' + error.message);
    } finally {
      setRemovingMixing(null);
      setRemoveMixingDialogOpen(false);
      setMixingToRemove(null);
    }
  };

  // Funkcja do anulowania usunięcia mieszanki
  const handleCancelRemoveMixing = () => {
    setRemoveMixingDialogOpen(false);
    setMixingToRemove(null);
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

  // Renderuj status powiązań składnika (obsługuje wiele powiązań)
  const renderIngredientLinkStatus = (ingredient) => {
    const links = ingredientLinks[ingredient.id] || [];
    
    if (links.length > 0) {
      // Oblicz sumaryczne statystyki
      const totalLinkedQuantity = links.reduce((sum, link) => sum + (link.linkedQuantity || 0), 0);
      const totalConsumedQuantity = links.reduce((sum, link) => sum + (link.consumedQuantity || 0), 0);
      const totalRemainingQuantity = links.reduce((sum, link) => sum + (link.remainingQuantity || 0), 0);
      const averageConsumptionPercentage = links.length > 0 
        ? Math.round(links.reduce((sum, link) => sum + (link.consumptionPercentage || 0), 0) / links.length)
        : 0;
      
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75, width: '100%' }}>
          {/* Nagłówek z sumarycznymi informacjami */}
          <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', mb: 0.5 }}>
            <Box>
              <Typography variant="caption" sx={{ color: colors.text.primary, fontWeight: 'bold', fontSize: '0.75rem' }}>
                {links.length} rezerwacji → Razem: {totalLinkedQuantity} {links[0]?.batchSnapshot?.unit || 'szt.'}
              </Typography>
              <Typography variant="caption" sx={{ color: colors.text.secondary, display: 'block', fontStyle: 'italic', fontSize: '0.65rem' }}>
                Kliknij wiersz aby dodać kolejną
              </Typography>
            </Box>
          </Box>
          
          {/* Lista wszystkich powiązań */}
          {links.map((link, index) => {
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
              <Box 
                key={link.id} 
                sx={{ 
                  display: 'flex', 
                  alignItems: 'flex-start', 
                  gap: 1,
                  p: 0.75,
                  border: '1px solid',
                  borderColor: borderColor,
                  borderRadius: 1,
                  bgcolor: colors.background,
                  minHeight: 'auto'
                }}
              >
                <Box sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1, gap: 0.25 }}>
                  {/* Linia 1: LOT + ilość powiązana */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {renderReservationChip({ ...reservationFromSnapshot, type: link.reservationType })}
                    <Typography variant="caption" sx={{ color: colors.text.primary, fontWeight: 'bold', fontSize: '0.75rem' }}>
                      {link.linkedQuantity || link.quantity} {reservationFromSnapshot.unit}
                    </Typography>
                  </Box>
                  
                  {/* Linia 2: Lokalizacja + data ważności (w jednej linii) */}
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                    {reservationFromSnapshot.warehouseName && (
                      <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        📍 {reservationFromSnapshot.warehouseName}
                      </Typography>
                    )}
                    {reservationFromSnapshot.expiryDateString && (
                      <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: 0.25 }}>
                        📅 {reservationFromSnapshot.expiryDateString}
                      </Typography>
                    )}
                  </Box>
                  
                  {/* Linia 3: Informacje o konsumpcji (tylko jeśli istnieją) */}
                  {link.consumedQuantity > 0 && (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                      <Typography variant="caption" sx={{ 
                        color: link.isFullyConsumed ? 'success.main' : 'warning.main',
                        fontSize: '0.7rem'
                      }}>
                        Użyto: {link.consumedQuantity} / Pozostało: {link.remainingQuantity}
                      </Typography>
                      {link.consumptionPercentage !== undefined && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <Box sx={{ 
                            width: '30px', 
                            height: '3px', 
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
                          <Typography variant="caption" sx={{ color: colors.text.secondary, fontSize: '0.65rem' }}>
                            {link.consumptionPercentage}%
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  )}
                </Box>
                
                {/* Pokazuj przycisk odłączenia tylko jeśli nie jest w pełni skonsumowane */}
                {!link.isFullyConsumed && (
                  <IconButton
                    size="small"
                    onClick={() => handleUnlinkSpecificReservation(link.id)}
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
          })}
          
          {/* Sumaryczne informacje o konsumpcji */}
          {totalConsumedQuantity > 0 && (
            <Box sx={{ 
              mt: 0.5, 
              p: 0.5, 
              bgcolor: colors.primary + '0a', 
              borderRadius: 1,
              border: '1px solid',
              borderColor: colors.primary + '20'
            }}>
              <Typography variant="caption" sx={{ color: colors.text.primary, fontWeight: 'bold', fontSize: '0.7rem' }}>
                📊 Łącznie użyto: {totalConsumedQuantity} / Pozostało: {totalRemainingQuantity} / Avg: {averageConsumptionPercentage}%
              </Typography>
            </Box>
          )}
        </Box>
      );
    }
    
    return (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <LinkIcon fontSize="small" sx={{ color: colors.text.disabled }} />
        <Typography variant="caption" sx={{ color: colors.text.secondary, fontStyle: 'italic' }}>
          Kliknij wiersz aby powiązać z rezerwacją
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
            startIcon={<AddIcon />}
            onClick={() => setAddMixingDialogOpen(true)}
            size="small"
            sx={{ fontSize: '0.75rem', py: 0.5, px: 1 }}
          >
            {t('mixingPlan.addMixing')}
          </Button>

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
              borderColor: borderColor,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start'
            }}>
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 700, color: 'primary.main', mb: 0.5 }}>
                  {headerItem.text}
                </Typography>
                {headerItem.details && (
                  <Typography variant="body2" sx={{ color: colors.text.secondary }}>
                    {headerItem.details}
                  </Typography>
                )}
              </Box>
              <Button
                size="small"
                color="error"
                variant="outlined"
                startIcon={<UnlinkIcon />}
                onClick={() => handleRemoveMixing(headerItem.id)}
                disabled={removingMixing === headerItem.id}
                sx={{ minWidth: 'auto', px: 1 }}
              >
                {removingMixing === headerItem.id ? t('common.removing') : t('mixingPlan.removeMixing')}
              </Button>
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
                          cursor: 'pointer',
                          '&:hover': {
                            bgcolor: mode === 'dark' ? 'rgba(25, 118, 210, 0.2)' : 'primary.light',
                            opacity: 0.8
                          }
                        }}
                        onClick={() => handleLinkIngredient(ingredient)}
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
                          label={item.completedAt ? new Date(item.completedAt).toLocaleString('pl-PL', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : '-'} 
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
            <Typography component="div" variant="subtitle2" color="text.secondary">
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
              {/* Informacje o istniejących powiązaniach */}
              {selectedIngredient && (() => {
                const existingLinks = ingredientLinks[selectedIngredient.id] || [];
                const alreadyLinkedQuantity = existingLinks.reduce((sum, link) => sum + (link.linkedQuantity || 0), 0);
                const remainingToLink = Math.max(0, requiredQuantity - alreadyLinkedQuantity);
                
                return existingLinks.length > 0 ? (
                  <Alert severity="info" sx={{ mb: 2 }}>
                    <AlertTitle>Informacje o powiązaniach</AlertTitle>
                    <Typography variant="body2">
                      Wymagana łącznie: <strong>{requiredQuantity} {existingLinks[0]?.batchSnapshot?.unit || 'szt.'}</strong>
                    </Typography>
                    <Typography variant="body2">
                      Już powiązano: <strong>{alreadyLinkedQuantity} {existingLinks[0]?.batchSnapshot?.unit || 'szt.'}</strong> ({existingLinks.length} rezerwacji)
                    </Typography>
                    <Typography variant="body2" sx={{ color: remainingToLink > 0 ? 'warning.main' : 'success.main' }}>
                      Pozostało do powiązania: <strong>{remainingToLink} {existingLinks[0]?.batchSnapshot?.unit || 'szt.'}</strong>
                    </Typography>
                  </Alert>
                ) : null;
              })()}
              
              <Typography variant="body2" sx={{ mb: 2 }}>
                Wybierz rezerwację do powiązania ze składnikiem:
              </Typography>
              
              <Autocomplete
                options={availableReservations}
                value={selectedReservation}
                onChange={(event, newValue) => setSelectedReservation(newValue)}
                getOptionLabel={(option) => `LOT: ${option.batchNumber} - ${option.availableQuantity} ${option.unit}`}
                renderOption={(props, option) => {
                  const { key, ...otherProps } = props;
                  return (
                    <Box component="li" key={key} {...otherProps}>
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
                  );
                }}
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
                        {(() => {
                          const existingLinks = ingredientLinks[selectedIngredient?.id] || [];
                          const alreadyLinkedQuantity = existingLinks.reduce((sum, link) => sum + (link.linkedQuantity || 0), 0);
                          const remainingToLink = Math.max(0, requiredQuantity - alreadyLinkedQuantity);
                          
                          return (
                            <>
                              <Typography variant="caption" color="text.secondary">
                                Wymagane łącznie: {requiredQuantity} {selectedReservation.unit || 'szt.'} | 
                                Już powiązano: {alreadyLinkedQuantity} {selectedReservation.unit || 'szt.'} | 
                                Pozostało: {remainingToLink} {selectedReservation.unit || 'szt.'} | 
                                Dostępne w tej rezerwacji: {maxAvailableQuantity} {selectedReservation.unit || 'szt.'}
                              </Typography>
                              {parseFloat(linkQuantity) > maxAvailableQuantity && (
                                <Typography variant="caption" color="error" display="block">
                                  Ilość przekracza dostępną w tej rezerwacji
                                </Typography>
                              )}
                              {(alreadyLinkedQuantity + parseFloat(linkQuantity)) > requiredQuantity && (
                                <Typography variant="caption" color="info.main" display="block">
                                  Łączna ilość będzie większa niż wymagana do mieszania (nadwyżka: {((alreadyLinkedQuantity + parseFloat(linkQuantity)) - requiredQuantity).toFixed(2)} {selectedReservation.unit || 'szt.'})
                                </Typography>
                              )}
                              {remainingToLink <= 0 && alreadyLinkedQuantity === requiredQuantity && (
                                <Typography variant="caption" color="success.main" display="block">
                                  Składnik jest powiązany w dokładnej wymaganej ilości
                                </Typography>
                              )}
                              {remainingToLink < 0 && (
                                <Typography variant="caption" color="info.main" display="block">
                                  Składnik ma nadwyżkę: {Math.abs(remainingToLink).toFixed(2)} {selectedReservation.unit || 'szt.'}
                                </Typography>
                              )}
                            </>
                          );
                        })()}
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
            disabled={(() => {
              if (!selectedReservation || !linkQuantity || parseFloat(linkQuantity) <= 0 || parseFloat(linkQuantity) > maxAvailableQuantity) {
                return true;
              }
              
              // Umożliwienie powiązania większej ilości niż zaplanowano
              // Walidacja została usunięta - można teraz powiązać dowolną ilość dostępną w rezerwacji
              return false;
            })()}
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
            <Typography component="div" variant="body2" color="text.secondary" sx={{ mt: 1 }}>
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

      {/* Dialog do dodawania nowej mieszanki */}
      <Dialog
        open={addMixingDialogOpen}
        onClose={() => setAddMixingDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {t('mixingPlan.addMixingDialogTitle')}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, pt: 2 }}>

            {/* Liczba sztuk (opcjonalne) */}
            <TextField
              fullWidth
              label={t('mixingPlan.piecesCount')}
              type="number"
              value={newMixingPiecesCount}
              onChange={(e) => setNewMixingPiecesCount(e.target.value)}
              helperText={t('mixingPlan.piecesCountHelper')}
              InputProps={{
                inputProps: { min: 0, step: 0.01 }
              }}
            />

            {/* Składniki */}
            <Box>
              <Typography variant="subtitle1" gutterBottom>
                {t('mixingPlan.ingredients')}
              </Typography>

              {taskMaterials.length === 0 && (
                <Alert severity="info" sx={{ mb: 2 }}>
                  {t('mixingPlan.noTaskMaterials')}
                </Alert>
              )}

              {newMixingIngredients.map((ingredient, index) => (
                <Box key={index} sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                  <Autocomplete
                    fullWidth
                    options={taskMaterials}
                    getOptionLabel={(option) => option?.label || ''}
                    value={ingredient.name ? taskMaterials.find(material => material.value === ingredient.name) || { label: ingredient.name, value: ingredient.name } : null}
                    onChange={(event, newValue) => {
                      // Jeśli newValue jest null (kliknięcie poza polem), nie rób nic
                      if (newValue === null) {
                        return;
                      }

                      // Jeśli newValue ma wartość, ustaw ją
                      if (newValue && newValue.value) {
                        updateIngredientField(index, 'name', newValue.value);
                        // Automatycznie ustaw jednostkę jeśli materiał ją ma
                        if (newValue.unit && newValue.unit !== 'szt.') {
                          updateIngredientField(index, 'unit', newValue.unit);
                        }
                      } else {
                        // W innych przypadkach (np. wyczyszczenie pola przez użytkownika)
                        updateIngredientField(index, 'name', '');
                      }
                    }}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label={`${t('mixingPlan.ingredientName')} ${index + 1}`}
                        placeholder={t('mixingPlan.ingredientNamePlaceholder')}
                      />
                    )}
                    freeSolo
                    autoSelect
                    onBlur={(event) => {
                      // Gdy użytkownik kliknie poza polem, nie czyść wartości jeśli była wpisana ręcznie
                      const inputValue = event.target.value;
                      if (inputValue && inputValue.trim() !== '') {
                        // Sprawdź czy wartość jest już ustawiona jako ingredient.name
                        if (ingredient.name !== inputValue.trim()) {
                          updateIngredientField(index, 'name', inputValue.trim());
                        }
                      }
                    }}
                  />

                  <TextField
                    label={t('mixingPlan.quantity')}
                    type="number"
                    value={ingredient.quantity}
                    onChange={(e) => updateIngredientField(index, 'quantity', e.target.value)}
                    InputProps={{
                      inputProps: { min: 0, step: 0.01 }
                    }}
                    sx={{ width: 150 }}
                  />

                  <TextField
                    select
                    label={t('mixingPlan.unit')}
                    value={ingredient.unit}
                    onChange={(e) => updateIngredientField(index, 'unit', e.target.value)}
                    sx={{ width: 100 }}
                  >
                    <MenuItem value="kg">kg</MenuItem>
                    <MenuItem value="g">g</MenuItem>
                    <MenuItem value="mg">mg</MenuItem>
                    <MenuItem value="caps">caps</MenuItem>
                  </TextField>

                  {newMixingIngredients.length > 1 && (
                    <IconButton
                      color="error"
                      onClick={() => removeIngredientField(index)}
                      size="small"
                    >
                      <RemoveIcon />
                    </IconButton>
                  )}
                </Box>
              ))}

              <Button
                startIcon={<AddIcon />}
                onClick={addIngredientField}
                variant="outlined"
                size="small"
              >
                {t('mixingPlan.addIngredient')}
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddMixingDialogOpen(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleAddMixing}
            variant="contained"
            disabled={addingMixing}
            startIcon={addingMixing ? <CircularProgress size={16} /> : <AddIcon />}
          >
            {addingMixing ? t('common.adding') : t('mixingPlan.addMixing')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog potwierdzenia usunięcia mieszanki */}
      <Dialog
        open={removeMixingDialogOpen}
        onClose={handleCancelRemoveMixing}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          {t('mixingPlan.removeMixing')}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            {t('mixingPlan.confirmRemoveMixing', { number: mixingToRemove?.number })}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Ta akcja jest nieodwracalna.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelRemoveMixing}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleConfirmRemoveMixing}
            variant="contained"
            color="error"
            disabled={removingMixing !== null}
            startIcon={removingMixing !== null ? <CircularProgress size={16} /> : <UnlinkIcon />}
          >
            {removingMixing !== null ? t('common.removing') : t('mixingPlan.removeMixing')}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default memo(EnhancedMixingPlan);
