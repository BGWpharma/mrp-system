import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Grid,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Chip,
  Tooltip,
  Card,
  CardContent,
  Divider,
  FormControlLabel,
  Checkbox
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  Check as CheckIcon
} from '@mui/icons-material';
import {
  getTaskById,
  updateTaskStatus
} from '../../services/productionService';
import { 
  checkOrderQuantitySync, 
  syncTaskQuantityToOrder 
} from '../../services/productionOrderSyncService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { doc, updateDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase/config';

const ConsumptionPage = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState(null);
  const [consumptionData, setConsumptionData] = useState([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [selectedConsumption, setSelectedConsumption] = useState(null);
  const [editedQuantity, setEditedQuantity] = useState('');
  const [editError, setEditError] = useState('');
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [restoreReservation, setRestoreReservation] = useState(true);
  const [validationResults, setValidationResults] = useState(null);
  const [validationDetailsOpen, setValidationDetailsOpen] = useState(false);
  const [quantitySyncData, setQuantitySyncData] = useState(null);
  const [showQuantitySyncDialog, setShowQuantitySyncDialog] = useState(false);
  const [syncingQuantity, setSyncingQuantity] = useState(false);
  
  // Pobieranie danych zadania
  useEffect(() => {
    fetchTaskData();
  }, [taskId]);
  
  const fetchTaskData = async () => {
    try {
      setLoading(true);
      
      const taskData = await getTaskById(taskId);
      setTask(taskData);
      
      // Przetwórz dane konsumpcji z sesji produkcyjnych
      if (taskData?.consumedMaterials?.length > 0) {
        // Pobierz rzeczywiste ceny z partii magazynowych
        const enrichedConsumptions = await Promise.all(
          taskData.consumedMaterials.map(async (consumption) => {
            // Znajdź materiał w liście materiałów zadania
            const material = taskData.materials?.find(m => 
              (m.inventoryItemId || m.id) === consumption.materialId
            );
            
            let unitPrice = consumption.unitPrice || 0;
            
            // Pobierz rzeczywistą cenę z partii magazynowej
            if (consumption.batchId) {
              try {
                const { getInventoryBatch } = await import('../../services/inventory');
                const batchData = await getInventoryBatch(consumption.batchId);
                
                if (batchData && batchData.unitPrice !== undefined) {
                  unitPrice = batchData.unitPrice;
                  console.log(`Pobrano rzeczywistą cenę z partii ${consumption.batchId}: ${unitPrice} €`);
                } else {
                  console.warn(`Nie znaleziono ceny w partii ${consumption.batchId}, używam ceny z konsumpcji: ${unitPrice} €`);
                }
              } catch (error) {
                console.error(`Błąd podczas pobierania ceny z partii ${consumption.batchId}:`, error);
                // Użyj ceny z materiału jako fallback tylko w przypadku błędu
                unitPrice = consumption.unitPrice || material?.unitPrice || 0;
              }
            }
            
            return {
              ...consumption,
              materialName: material?.name || 'Nieznany materiał',
              materialUnit: material?.unit || 'szt.',
              // Użyj rzeczywistej ceny z partii
              unitPrice: unitPrice
            };
          })
        );
        
        setConsumptionData(enrichedConsumptions);
      } else {
        setConsumptionData([]);
      }
      
    } catch (error) {
      console.error('Błąd podczas pobierania danych zadania:', error);
      showError('Nie udało się pobrać danych zadania');
    } finally {
      setLoading(false);
    }
  };

  // ✅ NOWA FUNKCJA: Selektywne odświeżanie podstawowych danych zadania
  const refreshTaskBasicData = async () => {
    try {
      console.log('🔄 Odświeżanie podstawowych danych zadania...');
      
      const taskData = await getTaskById(taskId);
      setTask(taskData);
      
      console.log('✅ Odświeżenie podstawowych danych zakończone');
    } catch (error) {
      console.error('❌ Błąd podczas odświeżania danych:', error);
      showError('Nie udało się odświeżyć danych zadania: ' + error.message);
    }
  };
  
  const formatDate = (dateValue) => {
    if (!dateValue) return 'Nie określono';
    
    try {
      let date;
      if (dateValue instanceof Date) {
        date = dateValue;
      } else if (typeof dateValue === 'string') {
        date = new Date(dateValue);
      } else if (dateValue.toDate) {
        date = dateValue.toDate();
      } else if (dateValue.seconds) {
        date = new Date(dateValue.seconds * 1000);
      } else {
        return 'Nieprawidłowy format daty';
      }
      
      return format(date, 'dd.MM.yyyy HH:mm', { locale: pl });
    } catch (error) {
      console.error('Błąd formatowania daty:', error);
      return 'Błąd formatowania daty';
    }
  };
  
  const handleEditConsumption = (consumption) => {
    setSelectedConsumption(consumption);
    setEditedQuantity(consumption.quantity.toString());
    setEditError('');
    setEditDialogOpen(true);
  };
  
  const handleDeleteConsumption = (consumption) => {
    setSelectedConsumption(consumption);
    setDeleteDialogOpen(true);
  };
  
  const handleSaveEdit = async () => {
    try {
      const quantity = parseFloat(editedQuantity);
      
      if (isNaN(quantity) || quantity <= 0) {
        setEditError('Podaj prawidłową ilość większą od zera');
        return;
      }
      
      setLoading(true);

      if (!selectedConsumption) {
        showError('Nie wybrano konsumpcji do edycji');
        return;
      }

      // Oblicz różnicę w ilości
      const quantityDifference = quantity - selectedConsumption.quantity;

      // Walidacja dostępności magazynowej przed zwiększeniem konsumpcji
      if (quantityDifference > 0) {
        try {
          const { getInventoryBatch } = await import('../../services/inventory');
          const currentBatch = await getInventoryBatch(selectedConsumption.batchId);
          
          if (!currentBatch) {
            showError('Nie znaleziono partii magazynowej');
            return;
          }

          const physicalQuantity = Number(currentBatch.quantity) || 0;
          
          // Sprawdź aktywne rezerwacje dla tej partii (poza obecnym zadaniem)
          const transactionsRef = collection(db, 'inventoryTransactions');
          const reservationsQuery = query(
            transactionsRef,
            where('type', '==', 'booking'),
            where('batchId', '==', selectedConsumption.batchId),
            where('referenceId', '!=', taskId) // Wykluczamy obecne zadanie
          );
          
          const reservationsSnapshot = await getDocs(reservationsQuery);
          const totalReservedByOthers = reservationsSnapshot.docs.reduce((total, doc) => {
            return total + (Number(doc.data().quantity) || 0);
          }, 0);
          
          const effectivelyAvailable = physicalQuantity - totalReservedByOthers;
          
          if (quantityDifference > effectivelyAvailable) {
            showError(`Niewystarczająca ilość w partii magazynowej po uwzględnieniu rezerwacji. Fizycznie dostępne: ${physicalQuantity.toFixed(3)} ${selectedConsumption.unit || 'szt.'}, zarezerwowane przez inne zadania: ${totalReservedByOthers.toFixed(3)} ${selectedConsumption.unit || 'szt.'}, efektywnie dostępne: ${effectivelyAvailable.toFixed(3)} ${selectedConsumption.unit || 'szt.'}, wymagane dodatkowo: ${quantityDifference.toFixed(3)} ${selectedConsumption.unit || 'szt.'}`);
            return;
          }
          
          console.log('Walidacja dostępności przeszła pomyślnie:', {
            fizycznieDosstępne: physicalQuantity,
            zarezerwowanePrzezInne: totalReservedByOthers,
            efektywnieDosstępne: effectivelyAvailable,
            wymaganeDodatkowo: quantityDifference,
            batchId: selectedConsumption.batchId
          });
          
        } catch (error) {
          console.error('Błąd podczas walidacji dostępności:', error);
          showError('Nie udało się sprawdzić dostępności w magazynie: ' + error.message);
          return;
        }
      }

      // Pobierz rzeczywistą cenę z partii magazynowej
      let actualUnitPrice = selectedConsumption.unitPrice;
      if (selectedConsumption.batchId) {
        try {
          const { getInventoryBatch } = await import('../../services/inventory');
          const batchData = await getInventoryBatch(selectedConsumption.batchId);
          
          if (batchData && batchData.unitPrice !== undefined) {
            actualUnitPrice = batchData.unitPrice;
            console.log(`Używam rzeczywistej ceny z partii ${selectedConsumption.batchId}: ${actualUnitPrice} €`);
          }
        } catch (error) {
          console.error(`Błąd podczas pobierania ceny z partii ${selectedConsumption.batchId}:`, error);
        }
      }

      // Aktualizuj stan magazynowy
      const { updateBatch } = await import('../../services/inventory');
      const { getInventoryBatch } = await import('../../services/inventory');
      
      const currentBatch = await getInventoryBatch(selectedConsumption.batchId);
      if (currentBatch) {
        // Upewnij się, że wartości są liczbami
        const currentQuantity = Number(currentBatch.quantity) || 0;
        const editedQty = Number(quantity) || 0;
        const selectedQty = Number(selectedConsumption.quantity) || 0;
        const quantityDiff = editedQty - selectedQty;
        
        // Jeśli zwiększamy ilość konsumpcji (quantityDiff > 0), zmniejszamy stan magazynowy
        // Jeśli zmniejszamy ilość konsumpcji (quantityDiff < 0), zwiększamy stan magazynowy
        const newQuantity = Math.max(0, currentQuantity - quantityDiff);
        
        console.log('Edycja konsumpcji:', {
          currentQuantity,
          editedQty,
          selectedQty,
          quantityDiff,
          newQuantity,
          batchId: selectedConsumption.batchId
        });
        
        await updateBatch(selectedConsumption.batchId, {
          quantity: newQuantity
        }, currentUser.uid);
      }

      // Aktualizuj rezerwacje - skoryguj ilość zarezerwowaną
      try {
        const { updateReservation } = await import('../../services/inventory');
        const transactionsRef = collection(db, 'inventoryTransactions');
        
        // Znajdź rezerwację dla tego materiału, partii i zadania
        let reservationQuery = query(
          transactionsRef,
          where('type', '==', 'booking'),
          where('referenceId', '==', taskId),
          where('itemId', '==', selectedConsumption.materialId),
          where('batchId', '==', selectedConsumption.batchId)
        );
        
        let reservationSnapshot = await getDocs(reservationQuery);
        
        // Jeśli nie znaleziono rezerwacji z statusem, spróbuj bez filtra statusu
        if (reservationSnapshot.empty) {
          reservationQuery = query(
            transactionsRef,
            where('type', '==', 'booking'),
            where('referenceId', '==', taskId),
            where('itemId', '==', selectedConsumption.materialId),
            where('batchId', '==', selectedConsumption.batchId)
          );
          
          reservationSnapshot = await getDocs(reservationQuery);
        }
        
        if (!reservationSnapshot.empty) {
          const reservationDoc = reservationSnapshot.docs[0];
          const reservation = reservationDoc.data();
          const currentReservedQuantity = Number(reservation.quantity) || 0;
          const quantityDiff = quantity - selectedConsumption.quantity;
          
          // Skoryguj rezerwację: jeśli zwiększamy konsumpcję, zmniejszamy rezerwację
          const newReservedQuantity = Math.max(0, currentReservedQuantity - quantityDiff);
          
          console.log('Korekta rezerwacji przy edycji:', {
            reservationId: reservationDoc.id,
            materialId: selectedConsumption.materialId,
            batchId: selectedConsumption.batchId,
            currentReservedQuantity,
            quantityDiff,
            newReservedQuantity
          });
          
          if (newReservedQuantity > 0) {
            await updateReservation(
              reservationDoc.id,
              selectedConsumption.materialId,
              newReservedQuantity,
              selectedConsumption.batchId,
              currentUser.uid
            );
          } else {
            const { deleteReservation } = await import('../../services/inventory');
            await deleteReservation(reservationDoc.id, currentUser.uid);
          }
        }
        
        // Zaktualizuj task.materialBatches
        const updatedMaterialBatches = { ...task.materialBatches };
        const materialId = selectedConsumption.materialId;
        
        if (updatedMaterialBatches[materialId]) {
          const batchIndex = updatedMaterialBatches[materialId].findIndex(
            batch => batch.batchId === selectedConsumption.batchId
          );
          
          if (batchIndex >= 0) {
            const currentReservedQuantity = Number(updatedMaterialBatches[materialId][batchIndex].quantity) || 0;
            const quantityDiff = quantity - selectedConsumption.quantity;
            const newReservedQuantity = Math.max(0, currentReservedQuantity - quantityDiff);
            
            if (newReservedQuantity > 0) {
              updatedMaterialBatches[materialId][batchIndex].quantity = newReservedQuantity;
            } else {
              updatedMaterialBatches[materialId].splice(batchIndex, 1);
            }
            
            // Jeśli dla materiału nie zostały żadne zarezerwowane partie
            if (updatedMaterialBatches[materialId].length === 0) {
              delete updatedMaterialBatches[materialId];
            }
            
            // Zaktualizuj task.materialBatches w bazie danych
            await updateDoc(doc(db, 'productionTasks', taskId), {
              materialBatches: updatedMaterialBatches,
              updatedAt: serverTimestamp()
            });
          }
        }
        
      } catch (error) {
        console.error('Błąd podczas aktualizacji rezerwacji przy edycji:', error);
        showError('Nie udało się zaktualizować rezerwacji: ' + error.message);
      }
      
      // Znajdź indeks edytowanej konsumpcji
      const consumptionIndex = task.consumedMaterials.findIndex(c => 
        c.materialId === selectedConsumption.materialId &&
        c.batchId === selectedConsumption.batchId &&
        c.timestamp === selectedConsumption.timestamp
      );
      
      if (consumptionIndex === -1) {
        throw new Error('Nie znaleziono konsumpcji do edycji');
      }
      
      // Aktualizuj listę konsumpcji
      const updatedConsumedMaterials = [...task.consumedMaterials];
      updatedConsumedMaterials[consumptionIndex] = {
        ...updatedConsumedMaterials[consumptionIndex],
        quantity: quantity,
        editedAt: new Date().toISOString(),
        editedBy: currentUser.uid,
        editedByName: currentUser.displayName || currentUser.email,
        originalQuantity: selectedConsumption.originalQuantity || selectedConsumption.quantity,
        // Użyj rzeczywistej ceny z partii magazynowej
        unitPrice: actualUnitPrice
      };
      
      // Zaktualizuj zadanie w bazie danych
      await updateDoc(doc(db, 'productionTasks', taskId), {
        consumedMaterials: updatedConsumedMaterials,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });
      
      showSuccess('Konsumpcja materiału została zaktualizowana wraz z rezerwacjami');
      setEditDialogOpen(false);
      setSelectedConsumption(null);
      
      // Odśwież dane (selektywnie)
      await refreshTaskBasicData();
      
    } catch (error) {
      console.error('Błąd podczas edycji konsumpcji:', error);
      showError('Nie udało się zaktualizować konsumpcji: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const handleConfirmDelete = async () => {
    try {
      setLoading(true);

      if (!selectedConsumption) {
        showError('Nie wybrano konsumpcji do usunięcia');
        return;
      }

      // Przywróć stan magazynowy
      const { updateBatch } = await import('../../services/inventory');
      const { getInventoryBatch } = await import('../../services/inventory');
      
      const currentBatch = await getInventoryBatch(selectedConsumption.batchId);
      if (currentBatch) {
        // Upewnij się, że wartości są liczbami
        const currentQuantity = Number(currentBatch.quantity) || 0;
        const consumedQuantity = Number(selectedConsumption.quantity) || 0;
        const newQuantity = currentQuantity + consumedQuantity;
        
        console.log('Przywracanie ilości:', {
          currentQuantity,
          consumedQuantity,
          newQuantity,
          batchId: selectedConsumption.batchId
        });
        
        await updateBatch(selectedConsumption.batchId, {
          quantity: newQuantity
        }, currentUser.uid);
      }

      // Przywróć rezerwację tylko jeśli użytkownik tego chce
      if (restoreReservation) {
        try {
          const { updateReservation, bookInventoryForTask } = await import('../../services/inventory');
          const transactionsRef = collection(db, 'inventoryTransactions');
          
          // Znajdź rezerwację dla tego materiału, partii i zadania
          let reservationQuery = query(
            transactionsRef,
            where('type', '==', 'booking'),
            where('referenceId', '==', taskId),
            where('itemId', '==', selectedConsumption.materialId),
            where('batchId', '==', selectedConsumption.batchId)
          );
          
          let reservationSnapshot = await getDocs(reservationQuery);
          
          // Jeśli nie znaleziono rezerwacji z statusem, spróbuj bez filtra statusu
          if (reservationSnapshot.empty) {
            reservationQuery = query(
              transactionsRef,
              where('type', '==', 'booking'),
              where('referenceId', '==', taskId),
              where('itemId', '==', selectedConsumption.materialId),
              where('batchId', '==', selectedConsumption.batchId)
            );
            
            reservationSnapshot = await getDocs(reservationQuery);
          }
          
          if (!reservationSnapshot.empty) {
            // Jeśli rezerwacja istnieje, zwiększ jej ilość
            const reservationDoc = reservationSnapshot.docs[0];
            const reservation = reservationDoc.data();
            const currentReservedQuantity = Number(reservation.quantity) || 0;
            const consumedQuantity = Number(selectedConsumption.quantity) || 0;
            const newReservedQuantity = currentReservedQuantity + consumedQuantity;
            
            console.log('Przywracanie rezerwacji:', {
              reservationId: reservationDoc.id,
              materialId: selectedConsumption.materialId,
              batchId: selectedConsumption.batchId,
              currentReservedQuantity,
              consumedQuantity,
              newReservedQuantity
            });
            
            await updateReservation(
              reservationDoc.id,
              selectedConsumption.materialId,
              newReservedQuantity,
              selectedConsumption.batchId,
              currentUser.uid
            );
          } else {
            // Jeśli rezerwacja nie istnieje, utwórz nową
            console.log('Tworzenie nowej rezerwacji po usunięciu konsumpcji:', {
              materialId: selectedConsumption.materialId,
              batchId: selectedConsumption.batchId,
              quantity: selectedConsumption.quantity
            });
            
            await bookInventoryForTask(
              selectedConsumption.materialId,
              selectedConsumption.quantity,
              taskId,
              currentUser.uid,
              'manual',
              selectedConsumption.batchId
            );
          }
          
          // Zaktualizuj task.materialBatches - przywróć ilość zarezerwowaną
          const updatedMaterialBatches = { ...task.materialBatches };
          const materialId = selectedConsumption.materialId;
          
          if (!updatedMaterialBatches[materialId]) {
            updatedMaterialBatches[materialId] = [];
          }
          
          const batchIndex = updatedMaterialBatches[materialId].findIndex(
            batch => batch.batchId === selectedConsumption.batchId
          );
          
          if (batchIndex >= 0) {
            // Jeśli partia istnieje, zwiększ jej ilość
            const currentReservedQuantity = Number(updatedMaterialBatches[materialId][batchIndex].quantity) || 0;
            const consumedQuantity = Number(selectedConsumption.quantity) || 0;
            updatedMaterialBatches[materialId][batchIndex].quantity = currentReservedQuantity + consumedQuantity;
          } else {
            // Jeśli partia nie istnieje, dodaj ją
            const { getInventoryBatch } = await import('../../services/inventory');
            const batchInfo = await getInventoryBatch(selectedConsumption.batchId);
            
            updatedMaterialBatches[materialId].push({
              batchId: selectedConsumption.batchId,
              quantity: selectedConsumption.quantity,
              batchNumber: batchInfo?.lotNumber || batchInfo?.batchNumber || 'Bez numeru'
            });
          }
          
          // Zaktualizuj task.materialBatches w bazie danych
          await updateDoc(doc(db, 'productionTasks', taskId), {
            materialBatches: updatedMaterialBatches,
            updatedAt: serverTimestamp()
          });
          
        } catch (error) {
          console.error('Błąd podczas przywracania rezerwacji:', error);
          showError('Nie udało się przywrócić rezerwacji: ' + error.message);
        }
      }
      
      // Usuń konsumpcję z listy
      const updatedConsumedMaterials = task.consumedMaterials.filter(c => 
        !(c.materialId === selectedConsumption.materialId &&
          c.batchId === selectedConsumption.batchId &&
          c.timestamp === selectedConsumption.timestamp)
      );
      
      // Zaktualizuj zadanie w bazie danych
      await updateDoc(doc(db, 'productionTasks', taskId), {
        consumedMaterials: updatedConsumedMaterials,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });
      
      const successMessage = restoreReservation 
        ? 'Konsumpcja materiału została usunięta i rezerwacja przywrócona'
        : 'Konsumpcja materiału została usunięta';
      showSuccess(successMessage);
      setDeleteDialogOpen(false);
      setSelectedConsumption(null);
      setRestoreReservation(true); // Reset do domyślnej wartości
      
      // Odśwież dane (pełne odświeżenie z konsumpcjami)
      await fetchTaskData();
      
    } catch (error) {
      console.error('Błąd podczas usuwania konsumpcji:', error);
      showError('Nie udało się usunąć konsumpcji: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const calculateTotalCost = (quantity, unitPrice) => {
    return (quantity * unitPrice).toFixed(2);
  };
  
  const getTotalConsumptionValue = () => {
    return consumptionData.reduce((total, consumption) => {
      if (consumption.includeInCosts !== false) {
        return total + (consumption.quantity * consumption.unitPrice);
      }
      return total;
    }, 0).toFixed(2);
  };

  // Walidacja konsumpcji poprocesowej
  const validatePostProductionConsumption = (taskData = task, consumptionDataToValidate = consumptionData) => {
    const validationErrors = [];
    const validationWarnings = [];

    if (!taskData || !taskData.materials) {
      return { 
        isValid: false, 
        errors: ['Brak danych o materiałach w zadaniu'], 
        warnings: [] 
      };
    }

    // Sprawdzenie każdego materiału w zadaniu
    for (const material of taskData.materials) {
      const materialId = material.inventoryItemId || material.id;
      const materialName = material.name || 'Nieznany materiał';
      
      // Wymagana ilość materiału z zadania
      const requiredQuantity = material.quantity || 0;
      
      // Skonsumowana ilość materiału
      const consumedQuantity = consumptionDataToValidate
        .filter(consumption => consumption.materialId === materialId)
        .reduce((total, consumption) => total + Number(consumption.quantity || 0), 0);
      
      // Sprawdzenie czy materiał ma jeszcze aktywne rezerwacje
      const hasActiveReservations = taskData.materialBatches && 
                                   taskData.materialBatches[materialId] && 
                                   taskData.materialBatches[materialId].length > 0;
      
      // Walidacja 1: Sprawdzenie czy pozostały aktywne rezerwacje (BŁĄD KRYTYCZNY)
      if (hasActiveReservations) {
        const totalReservedQuantity = taskData.materialBatches[materialId]
          .reduce((total, batch) => total + Number(batch.quantity || 0), 0);
        
        if (totalReservedQuantity > 0) {
          validationErrors.push(
            `Materiał "${materialName}": pozostała nierozliczona rezerwacja w ilości ${totalReservedQuantity.toFixed(3)} ${material.unit || 'szt.'} - należy skonsumować lub anulować rezerwację`
          );
        }
      }
      
      // Walidacja 2: Sprawdzenie czy ilość skonsumowana jest odpowiednia (OPCJONALNE - tylko ostrzeżenia)
      const consumptionDifference = Math.abs(consumedQuantity - requiredQuantity);
      const tolerancePercentage = 0.05; // 5% tolerancja
      const toleranceAmount = requiredQuantity * tolerancePercentage;
      
      if (consumedQuantity < requiredQuantity) {
        const shortfall = requiredQuantity - consumedQuantity;
        
        if (shortfall > toleranceAmount) {
          validationWarnings.push(
            `Materiał "${materialName}": skonsumowano mniej niż planowane - wymagane: ${requiredQuantity.toFixed(3)}, skonsumowane: ${consumedQuantity.toFixed(3)}, niedobór: ${shortfall.toFixed(3)} ${material.unit || 'szt.'}`
          );
        } else if (shortfall > 0) {
          validationWarnings.push(
            `Materiał "${materialName}": skonsumowano nieco mniej niż planowane - wymagane: ${requiredQuantity.toFixed(3)}, skonsumowane: ${consumedQuantity.toFixed(3)}, różnica: ${shortfall.toFixed(3)} ${material.unit || 'szt.'}`
          );
        }
      } else if (consumedQuantity > requiredQuantity) {
        const excess = consumedQuantity - requiredQuantity;
        
        if (excess > toleranceAmount) {
          validationWarnings.push(
            `Materiał "${materialName}": skonsumowano więcej niż planowane - wymagane: ${requiredQuantity.toFixed(3)}, skonsumowane: ${consumedQuantity.toFixed(3)}, nadwyżka: ${excess.toFixed(3)} ${material.unit || 'szt.'}`
          );
        }
      }
      
      // Walidacja 3: Sprawdzenie czy materiał w ogóle został skonsumowany (jeśli był wymagany) - OPCJONALNE
      if (requiredQuantity > 0 && consumedQuantity === 0) {
        validationWarnings.push(
          `Materiał "${materialName}": brak konsumpcji mimo planowanej ilości ${requiredQuantity.toFixed(3)} ${material.unit || 'szt.'}`
        );
      }
    }

    // Sprawdzenie czy są materiały skonsumowane które nie były w oryginalnym zadaniu
    const taskMaterialIds = new Set(taskData.materials.map(m => m.inventoryItemId || m.id));
    const consumedMaterialIds = new Set(consumptionDataToValidate.map(c => c.materialId));
    
    for (const consumedMaterialId of consumedMaterialIds) {
      if (!taskMaterialIds.has(consumedMaterialId)) {
        const consumedMaterial = consumptionDataToValidate.find(c => c.materialId === consumedMaterialId);
        validationWarnings.push(
          `Skonsumowano materiał "${consumedMaterial?.materialName || 'Nieznany'}" który nie był pierwotnie przewidziany w zadaniu`
        );
      }
    }

    const isValid = validationErrors.length === 0;
    
    return {
      isValid,
      errors: validationErrors,
      warnings: validationWarnings
    };
  };

  // Funkcja do usuwania pozostałych rezerwacji
  const handleClearRemainingReservations = async () => {
    try {
      setConfirmLoading(true);
      
      console.log('=== DEBUG: Rozpoczynam usuwanie pozostałych rezerwacji ===');
      console.log('Task ID:', taskId);
      console.log('Task data:', task);
      
      if (!task || !task.materials) {
        throw new Error('Brak danych o materiałach w zadaniu');
      }

      // Import funkcji do czyszczenia rezerwacji
      const { cleanupTaskReservations } = await import('../../services/inventory');
      
      // Najpierw sprawdź rzeczywiste rezerwacje w bazie danych
      // zamiast polegać tylko na task.materialBatches
      console.log('=== DEBUG: Sprawdzam materiały z rezerwacjami ===');
      
      const materialsWithReservations = [];
      
      // Metoda 1: Sprawdź task.materialBatches (jeśli istnieje)
      if (task.materialBatches) {
        console.log('task.materialBatches:', task.materialBatches);
        
        for (const material of task.materials) {
          const materialId = material.inventoryItemId || material.id;
          
          if (task.materialBatches[materialId] && task.materialBatches[materialId].length > 0) {
            const totalReservedQuantity = task.materialBatches[materialId]
              .reduce((total, batch) => total + Number(batch.quantity || 0), 0);
            
            console.log(`Materiał ${material.name} (${materialId}): ${totalReservedQuantity} zarezerwowane`);
            
            if (totalReservedQuantity > 0) {
              materialsWithReservations.push(materialId);
            }
          }
        }
      }
      
      // Metoda 2: Jeśli nie znaleziono materialBatches, spróbuj usunąć wszystkie rezerwacje dla zadania
      if (materialsWithReservations.length === 0) {
        console.log('=== DEBUG: Brak materialBatches, próbuję usunąć wszystkie rezerwacje zadania ===');
        
        // Wywołaj cleanupTaskReservations bez itemIds - usunie wszystkie rezerwacje zadania
        const result = await cleanupTaskReservations(taskId);
        console.log('Wynik czyszczenia:', result);
        
        if (result.cleanedReservations > 0) {
          showSuccess(`Usunięto ${result.cleanedReservations} rezerwacji dla zadania.`);
        } else {
          showSuccess('Brak rezerwacji do usunięcia.');
          
          // Sprawdź czy może być problem z niezsynchronizowanymi danymi
          if (task.materialBatches && Object.keys(task.materialBatches).length > 0) {
            console.log('=== DEBUG: Wykryto niezsynchronizowane dane - czyszczę materialBatches w zadaniu ===');
            
            // Wyczyść materialBatches w dokumencie zadania
            await updateDoc(doc(db, 'productionTasks', taskId), {
              materialBatches: {},
              materialsReserved: false,
              updatedAt: serverTimestamp(),
              updatedBy: currentUser.uid
            });
            
            showSuccess('Wyczyszczono niezsynchronizowane dane rezerwacji w zadaniu.');
            
            // Odśwież dane zadania
            await fetchTaskData();
            
            // Wykonaj walidację ponownie
            const updatedTaskData = await getTaskById(taskId);
            let updatedConsumptionData = [];
            if (updatedTaskData?.consumedMaterials?.length > 0) {
              updatedConsumptionData = updatedTaskData.consumedMaterials;
            }
            
            const newValidation = validatePostProductionConsumption(updatedTaskData, updatedConsumptionData);
            setValidationResults(newValidation);
            
            if (newValidation.isValid) {
              showSuccess('Walidacja przeszła pomyślnie po wyczyszczeniu danych. Możesz teraz zatwierdzić zadanie.');
            }
          }
          return;
        }
      } else {
        console.log('=== DEBUG: Znaleziono materiały z rezerwacjami:', materialsWithReservations);
        
        // Usuń rezerwacje dla konkretnych materiałów
        const result = await cleanupTaskReservations(taskId, materialsWithReservations);
        console.log('Wynik czyszczenia dla materiałów:', result);
        
        if (result.cleanedReservations > 0) {
          showSuccess(`Usunięto pozostałe rezerwacje dla ${materialsWithReservations.length} materiałów.`);
        } else {
          // Jeśli nie znaleziono rezerwacji w bazie, ale są w materialBatches
          console.log('=== DEBUG: Brak rezerwacji w bazie, ale są w materialBatches - czyszczę strukturę zadania ===');
          
          // Wyczyść tylko te materiały z materialBatches
          const updatedMaterialBatches = { ...task.materialBatches };
          materialsWithReservations.forEach(materialId => {
            delete updatedMaterialBatches[materialId];
          });
          
          const hasAnyReservations = Object.keys(updatedMaterialBatches).length > 0;
          
          await updateDoc(doc(db, 'productionTasks', taskId), {
            materialBatches: updatedMaterialBatches,
            materialsReserved: hasAnyReservations,
            updatedAt: serverTimestamp(),
            updatedBy: currentUser.uid
          });
          
          showSuccess(`Wyczyszczono niezsynchronizowane dane rezerwacji dla ${materialsWithReservations.length} materiałów.`);
        }
      }
      
      // Odśwież dane zadania i pobierz zaktualizowane dane
      console.log('=== DEBUG: Odświeżam dane zadania ===');
      await fetchTaskData();
      
      // Pobierz najnowsze dane zadania i konsumpcji
      const updatedTaskData = await getTaskById(taskId);
      let updatedConsumptionData = [];
      if (updatedTaskData?.consumedMaterials?.length > 0) {
        updatedConsumptionData = updatedTaskData.consumedMaterials;
      }
      
      // Ponownie wykonaj walidację z przekazanymi aktualnymi danymi
      const newValidation = validatePostProductionConsumption(updatedTaskData, updatedConsumptionData);
      setValidationResults(newValidation);
      
      console.log('=== DEBUG: Nowe wyniki walidacji:', newValidation);
      
      // Jeśli walidacja przeszła pomyślnie, pokaż komunikat
      if (newValidation.isValid) {
        showSuccess('Walidacja przeszła pomyślnie. Możesz teraz zatwierdzić zadanie.');
      }
      
    } catch (error) {
      console.error('Błąd podczas usuwania pozostałych rezerwacji:', error);
      showError('Nie udało się usunąć pozostałych rezerwacji: ' + error.message);
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleConfirmTask = async () => {
    try {
      setConfirmLoading(true);
      
      // Walidacja została już wykonana przy otwieraniu dialogu
      // Zapisz wyniki walidacji wraz z zatwierdzeniem
      const validation = validationResults || validatePostProductionConsumption();
      
      // Najpierw oznacz zadanie jako mające potwierdzone zużycie materiałów
      await updateDoc(doc(db, 'productionTasks', taskId), {
        materialConsumptionConfirmed: true,
        materialConsumptionConfirmedAt: new Date().toISOString(),
        materialConsumptionConfirmedBy: currentUser.uid,
        materialConsumptionConfirmedByName: currentUser.displayName || currentUser.email,
        validationResults: {
          errors: validation.errors,
          warnings: validation.warnings,
          validatedAt: new Date().toISOString(),
          validatedBy: currentUser.uid
        },
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });
      
      // Następnie zaktualizuj status zadania na "Zakończone"
      await updateTaskStatus(taskId, 'Zakończone', currentUser.uid);
      
      showSuccess('Konsumpcja została zatwierdzona. Zadanie oznaczono jako zakończone.');
      setConfirmDialogOpen(false);
      setValidationResults(null);
      
      // Odśwież dane zadania
      await fetchTaskData();
      
      // Sprawdź czy trzeba zsynchronizować ilość z zamówieniem
      try {
        const syncData = await checkOrderQuantitySync(taskId);
        if (syncData) {
          setQuantitySyncData(syncData);
          setShowQuantitySyncDialog(true);
        }
      } catch (error) {
        console.error('Błąd podczas sprawdzania synchronizacji:', error);
        // Nie przerywaj procesu, tylko pokaż ostrzeżenie w konsoli
      }
      
    } catch (error) {
      console.error('Błąd podczas zatwierdzania zadania:', error);
      showError('Nie udało się zatwierdzić zadania: ' + error.message);
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleSyncQuantity = async (shouldSync) => {
    if (!shouldSync || !quantitySyncData) {
      setShowQuantitySyncDialog(false);
      setQuantitySyncData(null);
      return;
    }
    
    try {
      setSyncingQuantity(true);
      
      const result = await syncTaskQuantityToOrder(taskId, currentUser.uid);
      
      if (result.success) {
        showSuccess(result.message);
      }
      
      setShowQuantitySyncDialog(false);
      setQuantitySyncData(null);
      
    } catch (error) {
      console.error('Błąd podczas synchronizacji ilości:', error);
      showError('Nie udało się zaktualizować ilości w zamówieniu: ' + error.message);
    } finally {
      setSyncingQuantity(false);
    }
  };
  
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }
  
  if (!task) {
    return (
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Alert severity="error">
          Nie udało się załadować danych zadania
        </Alert>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      {/* Nagłówek */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton onClick={() => navigate(`/production/tasks/${taskId}`)} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" component="h1">
            Zarządzanie zużyciem materiałów
          </Typography>
        </Box>
        
        {/* Przycisk zatwierdzenia konsumpcji - widoczny tylko gdy zadanie nie jest zakończone */}
        {task?.status !== 'Zakończone' && (
          <Button
            variant="contained"
            color="success"
            startIcon={<CheckIcon />}
            onClick={() => {
              const validation = validatePostProductionConsumption();
              setValidationResults(validation);
              setConfirmDialogOpen(true);
            }}
            size="large"
            sx={{ 
              minWidth: '200px',
              fontWeight: 'bold',
              bgcolor: 'success.main',
              '&:hover': {
                bgcolor: 'success.dark'
              }
            }}
          >
            Zatwierdź konsumpcję
          </Button>
        )}
      </Box>
      
      {/* Informacje o zadaniu */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                {task.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Produkt: {task.productName} ({task.quantity} {task.unit || 'szt.'})
              </Typography>
              {task.moNumber && (
                <Typography variant="body2" color="text.secondary">
                  MO: {task.moNumber}
                </Typography>
              )}
            </Grid>
            <Grid item xs={12} md={6}>
              <Chip 
                label={task.status} 
                color={task.status === 'Zakończone' ? 'success' : (task.status === 'Potwierdzenie zużycia' ? 'info' : 'primary')}
                sx={{ mb: 1 }}
              />
              <Typography variant="body2" color="text.secondary">
                Data rozpoczęcia: {formatDate(task.scheduledDate)}
              </Typography>
              {task.endDate && (
                <Typography variant="body2" color="text.secondary">
                  Data zakończenia: {formatDate(task.endDate)}
                </Typography>
              )}
              
              {/* Informacje o zatwierdzeniu konsumpcji */}
              {task.materialConsumptionConfirmed && (
                <Box sx={{ mt: 2, p: 2, bgcolor: 'success.50', borderRadius: 1, border: '1px solid', borderColor: 'success.200' }}>
                  <Typography variant="subtitle2" color="success.main" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                    <CheckCircleIcon sx={{ mr: 1, fontSize: '1.1rem' }} />
                    Konsumpcja zatwierdzona
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Przez: {task.materialConsumptionConfirmedByName || 'Nieznany użytkownik'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Data: {formatDate(task.materialConsumptionConfirmedAt)}
                  </Typography>
                  
                  {/* Wyniki walidacji przy zatwierdzeniu */}
                  {task.validationResults && (
                    <Box sx={{ mt: 2, pt: 2, borderTop: '1px solid', borderColor: 'success.300' }}>
                      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        Wyniki walidacji:
                      </Typography>
                      
                      {task.validationResults.errors && task.validationResults.errors.length > 0 && (
                        <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
                          • Błędy: {task.validationResults.errors.length}
                        </Typography>
                      )}
                      
                      {task.validationResults.warnings && task.validationResults.warnings.length > 0 && (
                        <Typography variant="caption" color="warning.main" sx={{ display: 'block' }}>
                          • Ostrzeżenia: {task.validationResults.warnings.length}
                        </Typography>
                      )}
                      
                      {(!task.validationResults.errors || task.validationResults.errors.length === 0) && 
                       (!task.validationResults.warnings || task.validationResults.warnings.length === 0) && (
                        <Typography variant="caption" color="success.main" sx={{ display: 'block' }}>
                          • Walidacja przeszła pomyślnie
                        </Typography>
                      )}
                      
                      <Button
                        size="small"
                        variant="text"
                        onClick={() => setValidationDetailsOpen(true)}
                        sx={{ mt: 1, fontSize: '0.75rem', textTransform: 'none' }}
                      >
                        Zobacz szczegóły walidacji
                      </Button>
                    </Box>
                  )}
                </Box>
              )}
              
              {/* Informacja o oczekującej konsumpcji */}
              {task.status === 'Potwierdzenie zużycia' && !task.materialConsumptionConfirmed && (
                <Box sx={{ mt: 2, p: 2, bgcolor: 'info.50', borderRadius: 1, border: '1px solid', borderColor: 'info.200' }}>
                  <Typography variant="subtitle2" color="info.main" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                    <ScheduleIcon sx={{ mr: 1, fontSize: '1.1rem' }} />
                    Oczekuje na zatwierdzenie konsumpcji
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Sprawdź i zatwierdź zużycie materiałów aby zakończyć zadanie
                  </Typography>
                </Box>
              )}
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      
      {/* Podsumowanie konsumpcji */}
      {consumptionData.length > 0 && (
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Podsumowanie konsumpcji
            </Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={4}>
                <Typography variant="body2" color="text.secondary">
                  Liczba konsumpcji
                </Typography>
                <Typography variant="h6">
                  {consumptionData.length}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="body2" color="text.secondary">
                  Różne materiały
                </Typography>
                <Typography variant="h6">
                  {new Set(consumptionData.map(c => c.materialId)).size}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={4}>
                <Typography variant="body2" color="text.secondary">
                  Wartość konsumpcji
                </Typography>
                <Typography variant="h6">
                  {getTotalConsumptionValue()} €
                </Typography>
              </Grid>
            </Grid>
          </CardContent>
        </Card>
      )}
      
      {/* Lista konsumpcji */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Historia konsumpcji materiałów
        </Typography>
        
        {consumptionData.length === 0 ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <InfoIcon sx={{ mr: 1 }} />
              Brak zarejestrowanych konsumpcji materiałów dla tego zadania.
              Konsumpcje są automatycznie tworzone podczas sesji produkcyjnych.
            </Box>
          </Alert>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Materiał</TableCell>
                  <TableCell>Partia (LOT)</TableCell>
                  <TableCell align="right">Ilość</TableCell>
                  <TableCell align="right">Cena jedn.</TableCell>
                  <TableCell align="right">Wartość</TableCell>
                  <TableCell>Data konsumpcji</TableCell>
                  <TableCell>Użytkownik</TableCell>
                  <TableCell>Uwzględnij w kosztach</TableCell>
                  <TableCell align="center">Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {consumptionData.map((consumption, index) => (
                  <TableRow key={`${consumption.materialId}-${consumption.batchId}-${consumption.timestamp}-${index}`}>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                        {consumption.materialName}
                      </Typography>
                      {consumption.editedAt && (
                        <Typography variant="caption" color="text.secondary">
                          Edytowano: {formatDate(consumption.editedAt)}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={consumption.batchNumber || consumption.batchId} 
                        size="small" 
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {consumption.quantity} {consumption.materialUnit}
                      </Typography>
                      {consumption.originalQuantity && consumption.originalQuantity !== consumption.quantity && (
                        <Typography variant="caption" color="text.secondary">
                          (oryg: {consumption.originalQuantity})
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {consumption.unitPrice?.toFixed(4) || '0.00'} €
                    </TableCell>
                    <TableCell align="right">
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: consumption.includeInCosts !== false ? 'medium' : 'normal',
                          color: consumption.includeInCosts !== false ? 'text.primary' : 'text.secondary'
                        }}
                      >
                        {calculateTotalCost(consumption.quantity, consumption.unitPrice || 0)} €
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDate(consumption.timestamp)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {consumption.userName || 'Nieznany użytkownik'}
                      </Typography>
                      {consumption.editedByName && (
                        <Typography variant="caption" color="text.secondary">
                          Edytowane przez: {consumption.editedByName}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        icon={consumption.includeInCosts !== false ? <CheckCircleIcon /> : <WarningIcon />}
                        label={consumption.includeInCosts !== false ? 'Tak' : 'Nie'} 
                        color={consumption.includeInCosts !== false ? 'success' : 'default'}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Edytuj konsumpcję">
                        <IconButton 
                          size="small" 
                          onClick={() => handleEditConsumption(consumption)}
                          color="primary"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Usuń konsumpcję">
                        <IconButton 
                          size="small" 
                          onClick={() => handleDeleteConsumption(consumption)}
                          color="error"
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
      </Paper>
      
      {/* Dialog edycji konsumpcji */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edytuj konsumpcję materiału</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Edytujesz konsumpcję materiału: <strong>{selectedConsumption?.materialName}</strong><br/>
            Partia: <strong>{selectedConsumption?.batchNumber || selectedConsumption?.batchId}</strong>
          </DialogContentText>
          
          {editError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {editError}
            </Alert>
          )}
          
          <TextField
            autoFocus
            margin="dense"
            label="Ilość"
            type="number"
            fullWidth
            variant="outlined"
            value={editedQuantity}
            onChange={(e) => {
              setEditedQuantity(e.target.value);
              setEditError('');
            }}
            inputProps={{ min: 0, step: 'any' }}
            InputProps={{
              endAdornment: <Typography variant="body2">{selectedConsumption?.materialUnit}</Typography>
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleSaveEdit} variant="contained" disabled={loading}>
            Zapisz
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog usuwania konsumpcji */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Usuń konsumpcję materiału</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć konsumpcję materiału <strong>{selectedConsumption?.materialName}</strong> 
            z partii <strong>{selectedConsumption?.batchNumber || selectedConsumption?.batchId}</strong>?
            <br/><br/>
            Ilość: {selectedConsumption?.quantity} {selectedConsumption?.materialUnit}
            <br/>
            Data: {formatDate(selectedConsumption?.timestamp)}
          </DialogContentText>
          
          <Box sx={{ mt: 2 }}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={restoreReservation}
                  onChange={(e) => setRestoreReservation(e.target.checked)}
                  color="primary"
                />
              }
              label="Przywróć rezerwację materiału w MO"
            />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', ml: 4 }}>
              Zaznacz, aby przywrócić rezerwację materiału dla tego zadania po usunięciu konsumpcji
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleConfirmDelete} variant="contained" color="error" disabled={loading}>
            Usuń
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog zatwierdzania zadania */}
      <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Zatwierdź zadanie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz zatwierdzić zadanie <strong>{task.name}</strong> jako zakończone?
            <br/><br/>
            Zatwierdzenie zadania oznaczy, że wszystkie konsumpcje zostały zarejestrowane i zadanie jest ukończone.
          </DialogContentText>
          
          {/* Wyniki walidacji */}
          {validationResults && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="h6" gutterBottom>
                Wyniki walidacji konsumpcji
              </Typography>
              
              {/* Błędy krytyczne */}
              {validationResults.errors.length > 0 && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Błędy krytyczne - zadanie nie może zostać zatwierdzone:
                  </Typography>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {validationResults.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              
              {/* Ostrzeżenia */}
              {validationResults.warnings.length > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Ostrzeżenia - sprawdź poniższe kwestie:
                  </Typography>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {validationResults.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              
              {/* Sukces */}
              {validationResults.isValid && validationResults.warnings.length === 0 && (
                <Alert severity="success" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2">
                    ✓ Walidacja przeszła pomyślnie - konsumpcja materiałów jest prawidłowa
                  </Typography>
                </Alert>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setConfirmDialogOpen(false);
            setValidationResults(null);
          }}>
            Anuluj
          </Button>
          
          {/* Przycisk do usuwania pozostałych rezerwacji - pokazuj tylko gdy są błędy związane z rezerwacjami */}
          {validationResults && !validationResults.isValid && 
           validationResults.errors.some(error => error.includes('pozostała nierozliczona rezerwacja')) && (
            <Button 
              onClick={handleClearRemainingReservations}
              variant="outlined" 
              color="warning"
              disabled={confirmLoading}
                             startIcon={<DeleteIcon />}
              sx={{ mr: 1 }}
            >
              Usuń pozostałe rezerwacje
            </Button>
          )}
          
          <Button 
            onClick={handleConfirmTask} 
            variant="contained" 
            color={validationResults?.isValid ? "success" : "warning"}
            disabled={confirmLoading || (validationResults && !validationResults.isValid)}
          >
            {validationResults?.isValid 
              ? (validationResults.warnings.length > 0 ? 'Zatwierdź mimo ostrzeżeń' : 'Zatwierdź')
              : 'Nie można zatwierdzić'}
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog szczegółów walidacji */}
      <Dialog open={validationDetailsOpen} onClose={() => setValidationDetailsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Szczegóły walidacji konsumpcji</DialogTitle>
        <DialogContent>
          {task?.validationResults ? (
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Walidacja wykonana: {formatDate(task.validationResults.validatedAt)}
              </Typography>
              
              {/* Błędy */}
              {task.validationResults.errors && task.validationResults.errors.length > 0 ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Błędy krytyczne ({task.validationResults.errors.length}):
                  </Typography>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {task.validationResults.errors.map((error, index) => (
                      <li key={index}>{error}</li>
                    ))}
                  </ul>
                </Alert>
              ) : (
                <Alert severity="success" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2">
                    ✓ Brak błędów krytycznych
                  </Typography>
                </Alert>
              )}
              
              {/* Ostrzeżenia */}
              {task.validationResults.warnings && task.validationResults.warnings.length > 0 ? (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Ostrzeżenia ({task.validationResults.warnings.length}):
                  </Typography>
                  <ul style={{ margin: 0, paddingLeft: '20px' }}>
                    {task.validationResults.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </Alert>
              ) : (
                <Alert severity="success" sx={{ mb: 2 }}>
                  <Typography variant="subtitle2">
                    ✓ Brak ostrzeżeń
                  </Typography>
                </Alert>
              )}
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Brak dostępnych wyników walidacji dla tego zadania.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setValidationDetailsOpen(false)}>
            Zamknij
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog synchronizacji ilości z zamówieniem */}
      <Dialog
        open={showQuantitySyncDialog}
        onClose={() => !syncingQuantity && handleSyncQuantity(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Synchronizacja ilości z zamówieniem
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Wyprodukowana ilość różni się od ilości w zamówieniu. Czy chcesz zaktualizować zamówienie?
          </DialogContentText>
          
          {quantitySyncData && (
            <Box sx={{ 
              mt: 2, 
              p: 2, 
              bgcolor: 'background.default',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1 
            }}>
              <Typography variant="body2" gutterBottom>
                <strong>Zadanie:</strong> {quantitySyncData.taskNumber}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Zamówienie:</strong> {quantitySyncData.orderNumber}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Pozycja:</strong> {quantitySyncData.orderItemName}
              </Typography>
              <Divider sx={{ my: 1 }} />
              <Typography variant="body2" gutterBottom>
                <strong>Aktualna ilość w CO:</strong> {quantitySyncData.currentOrderQuantity} {quantitySyncData.unit}
              </Typography>
              <Typography variant="body2" gutterBottom color="primary">
                <strong>Wyprodukowana ilość:</strong> {quantitySyncData.producedQuantity} {quantitySyncData.unit}
              </Typography>
              <Typography 
                variant="body2" 
                gutterBottom
                color={quantitySyncData.difference >= 0 ? 'success.main' : 'error.main'}
              >
                <strong>Różnica:</strong> {quantitySyncData.difference > 0 ? '+' : ''}{quantitySyncData.difference} {quantitySyncData.unit}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => handleSyncQuantity(false)} 
            disabled={syncingQuantity}
            color="inherit"
          >
            Nie, zostaw bez zmian
          </Button>
          <Button 
            onClick={() => handleSyncQuantity(true)} 
            disabled={syncingQuantity}
            variant="contained"
            color="primary"
            autoFocus
          >
            {syncingQuantity ? 'Aktualizowanie...' : 'Tak, zaktualizuj zamówienie'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ConsumptionPage; 