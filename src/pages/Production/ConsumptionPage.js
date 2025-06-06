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
                const { getInventoryBatch } = await import('../../services/inventoryService');
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

      // Pobierz rzeczywistą cenę z partii magazynowej
      let actualUnitPrice = selectedConsumption.unitPrice;
      if (selectedConsumption.batchId) {
        try {
          const { getInventoryBatch } = await import('../../services/inventoryService');
          const batchData = await getInventoryBatch(selectedConsumption.batchId);
          
          if (batchData && batchData.unitPrice !== undefined) {
            actualUnitPrice = batchData.unitPrice;
            console.log(`Używam rzeczywistej ceny z partii ${selectedConsumption.batchId}: ${actualUnitPrice} €`);
          }
        } catch (error) {
          console.error(`Błąd podczas pobierania ceny z partii ${selectedConsumption.batchId}:`, error);
        }
      }

      // Oblicz różnicę w ilości
      const quantityDifference = quantity - selectedConsumption.quantity;

      // Aktualizuj stan magazynowy
      const { updateBatch } = await import('../../services/inventoryService');
      const { getInventoryBatch } = await import('../../services/inventoryService');
      
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
        const { updateReservation } = await import('../../services/inventoryService');
        const transactionsRef = collection(db, 'inventoryTransactions');
        
        // Znajdź rezerwację dla tego materiału, partii i zadania
        let reservationQuery = query(
          transactionsRef,
          where('type', '==', 'booking'),
          where('referenceId', '==', taskId),
          where('itemId', '==', selectedConsumption.materialId),
          where('batchId', '==', selectedConsumption.batchId),
          where('status', 'in', ['active', 'pending'])
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
            const { deleteReservation } = await import('../../services/inventoryService');
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
      
      // Odśwież dane
      await fetchTaskData();
      
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
      const { updateBatch } = await import('../../services/inventoryService');
      const { getInventoryBatch } = await import('../../services/inventoryService');
      
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
          const { updateReservation, bookInventoryForTask } = await import('../../services/inventoryService');
          const transactionsRef = collection(db, 'inventoryTransactions');
          
          // Znajdź rezerwację dla tego materiału, partii i zadania
          let reservationQuery = query(
            transactionsRef,
            where('type', '==', 'booking'),
            where('referenceId', '==', taskId),
            where('itemId', '==', selectedConsumption.materialId),
            where('batchId', '==', selectedConsumption.batchId),
            where('status', 'in', ['active', 'pending'])
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
            const { getInventoryBatch } = await import('../../services/inventoryService');
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
      
      // Odśwież dane
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
  
  const handleConfirmTask = async () => {
    try {
      setConfirmLoading(true);
      
      // Najpierw oznacz zadanie jako mające potwierdzone zużycie materiałów
      await updateDoc(doc(db, 'productionTasks', taskId), {
        materialConsumptionConfirmed: true,
        materialConsumptionConfirmedAt: new Date().toISOString(),
        materialConsumptionConfirmedBy: currentUser.uid,
        materialConsumptionConfirmedByName: currentUser.displayName || currentUser.email,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });
      
      // Następnie zaktualizuj status zadania na "Zakończone"
      await updateTaskStatus(taskId, 'Zakończone', currentUser.uid);
      
      showSuccess('Konsumpcja została zatwierdzona. Zadanie oznaczono jako zakończone.');
      setConfirmDialogOpen(false);
      
      // Odśwież dane zadania
      await fetchTaskData();
      
    } catch (error) {
      console.error('Błąd podczas zatwierdzania zadania:', error);
      showError('Nie udało się zatwierdzić zadania: ' + error.message);
    } finally {
      setConfirmLoading(false);
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
            onClick={() => setConfirmDialogOpen(true)}
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
      <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)}>
        <DialogTitle>Zatwierdź zadanie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz zatwierdzić zadanie <strong>{task.name}</strong> jako zakończone?
            <br/><br/>
            Zatwierdzenie zadania oznaczy, że wszystkie konsumpcje zostały zarejestrowane i zadanie jest ukończone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleConfirmTask} variant="contained" color="success" disabled={confirmLoading}>
            Zatwierdź
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default ConsumptionPage; 