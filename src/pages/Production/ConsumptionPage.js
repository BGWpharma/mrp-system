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
  Divider
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
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
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
        // Dodaj nazwy materiałów do danych konsumpcji
        const enrichedConsumptions = taskData.consumedMaterials.map(consumption => {
          // Znajdź materiał w liście materiałów zadania
          const material = taskData.materials?.find(m => 
            (m.inventoryItemId || m.id) === consumption.materialId
          );
          
          return {
            ...consumption,
            materialName: material?.name || 'Nieznany materiał',
            materialUnit: material?.unit || 'szt.',
            // Użyj ceny z konsumpcji jeśli jest dostępna, w przeciwnym razie ceny materiału
            unitPrice: consumption.unitPrice !== undefined ? consumption.unitPrice : (material?.unitPrice || 0)
          };
        });
        
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
        // Zachowaj oryginalną cenę jednostkową
        unitPrice: selectedConsumption.unitPrice
      };
      
      // Zaktualizuj zadanie w bazie danych
      await updateDoc(doc(db, 'productionTasks', taskId), {
        consumedMaterials: updatedConsumedMaterials,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser.uid
      });
      
      showSuccess('Konsumpcja materiału została zaktualizowana');
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
      
      showSuccess('Konsumpcja materiału została usunięta');
      setDeleteDialogOpen(false);
      setSelectedConsumption(null);
      
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
          <IconButton onClick={() => navigate(-1)} sx={{ mr: 2 }}>
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
                      {consumption.unitPrice?.toFixed(2) || '0.00'} €
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