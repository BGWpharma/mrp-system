import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Grid,
  Button,
  Divider,
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  TextField,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Alert,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel
} from '@mui/material';
import {
  Edit as EditIcon,
  ArrowBack as ArrowBackIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  CheckCircle as CompleteIcon,
  Delete as DeleteIcon,
  Settings as SettingsIcon,
  Save as SaveIcon,
  Check as CheckIcon,
  Cancel as CancelIcon,
  Inventory as InventoryIcon,
  Warning as WarningIcon,
  Receipt as ReceiptIcon,
  Add as AddIcon,
  SaveAlt as SaveAltIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { getTaskById, updateTaskStatus, deleteTask, updateActualMaterialUsage, confirmMaterialConsumption, addTaskProductToInventory, startProduction, stopProduction, getProductionHistory } from '../../services/productionService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';
import { PRODUCTION_TASK_STATUSES, TIME_INTERVALS } from '../../utils/constants';

const TaskDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState({ open: false, severity: 'success', message: '' });
  
  // Stan dla dialogu konsumpcji materiałów
  const [consumptionDialogOpen, setConsumptionDialogOpen] = useState(false);
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [materials, setMaterials] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [materialQuantities, setMaterialQuantities] = useState({});
  const [errors, setErrors] = useState({});

  const [stopProductionDialogOpen, setStopProductionDialogOpen] = useState(false);
  const [completedQuantity, setCompletedQuantity] = useState('');
  const [timeSpent, setTimeSpent] = useState('');
  const [productionHistory, setProductionHistory] = useState([]);
  const [productionError, setProductionError] = useState(null);

  const [deleteDialog, setDeleteDialog] = useState(false);
  const [quantity, setQuantity] = useState(0);
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);

  useEffect(() => {
    const fetchTask = async () => {
      try {
        setLoading(true);
        const fetchedTask = await getTaskById(id);
        setTask(fetchedTask);
        
        // Przygotuj materiały do wyświetlenia
        if (fetchedTask?.materials?.length > 0) {
          // Użyj wartości quantity z materiałów - to jest całkowite zapotrzebowanie
          const materialsList = fetchedTask.materials.map(material => ({
            ...material,
            // Nie tworzymy plannedQuantity, bo używamy bezpośrednio wartości quantity,
            // która reprezentuje całkowite zapotrzebowanie
          }));
          
          setMaterials(materialsList);
          
          // Inicjalizacja rzeczywistych ilości
          const quantities = {};
          materialsList.forEach(material => {
            const actualQuantity = fetchedTask.actualMaterialUsage && fetchedTask.actualMaterialUsage[material.id] !== undefined
              ? fetchedTask.actualMaterialUsage[material.id]
              : material.quantity; // Używamy bezpośrednio wartości quantity jako domyślnej
            
            quantities[material.id] = actualQuantity;
          });
          
          setMaterialQuantities(quantities);
        }
      } catch (error) {
        showError('Błąd podczas pobierania zadania: ' + error.message);
        console.error('Error fetching task:', error);
        navigate('/production');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTask();
  }, [id, navigate, showError]);

  useEffect(() => {
    const fetchProductionHistory = async () => {
      if (task?.id) {
        try {
          const history = await getProductionHistory(task.id);
          setProductionHistory(history);
        } catch (error) {
          console.error('Błąd podczas pobierania historii produkcji:', error);
        }
      }
    };

    fetchProductionHistory();
  }, [task?.id]);

  const handleStatusChange = async (newStatus) => {
    try {
      if (newStatus === 'Zakończone' && !task.materialConsumptionConfirmed && task.materials && task.materials.length > 0) {
        setConsumptionDialogOpen(true);
        return;
      }

      setLoading(true);
      await updateTaskStatus(id, newStatus, currentUser.uid);
      
      setAlert({
        open: true,
        severity: 'success',
        message: `Status zmieniony na: ${newStatus}`
      });
      
      // Odśwież dane zadania
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
    } catch (error) {
      console.error('Błąd podczas zmiany statusu:', error);
      setAlert({
        open: true,
        severity: 'error',
        message: `Błąd podczas zmiany statusu: ${error.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  // Funkcje obsługujące zarządzanie materiałami
  const handleQuantityChange = (materialId, value) => {
    // Konwertuj wartość na liczbę tylko jeśli nie jest pusta
    const numValue = value === '' ? '' : parseFloat(value);
    
    // Zapisz wartość tylko jeśli jest pusta, lub jest poprawną liczbą
    if (value === '' || (!isNaN(numValue))) {
      setMaterialQuantities(prev => ({
        ...prev,
        [materialId]: numValue
      }));
      
      // Resetuj błędy
      if (errors[materialId]) {
        setErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[materialId];
          return newErrors;
        });
      }
    }
  };
  
  const validateQuantities = () => {
    const newErrors = {};
    let isValid = true;
    
    materials.forEach(material => {
      const quantity = materialQuantities[material.id];
      
      // Sprawdź czy quantity jest liczbą
      if (isNaN(quantity)) {
        newErrors[material.id] = 'Ilość musi być liczbą';
        isValid = false;
      }
      // Sprawdź czy quantity nie jest ujemne
      else if (quantity < 0) {
        newErrors[material.id] = 'Ilość nie może być ujemna';
        isValid = false;
      }
    });
    
    setErrors(newErrors);
    return isValid;
  };
  
  const handleSaveChanges = async () => {
    try {
      if (!validateQuantities()) {
        return;
      }
      
      await updateActualMaterialUsage(id, materialQuantities);
      showSuccess('Zużycie materiałów zaktualizowane');
      setEditMode(false);
      
      // Odśwież dane zadania
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);

      // Zaktualizuj też lokalne zmienne
      if (updatedTask?.materials?.length > 0) {
        const materialsList = updatedTask.materials.map(material => ({
          ...material,
          plannedQuantity: (material.quantity || 0) * (updatedTask.quantity || 1)
        }));
        
        setMaterials(materialsList);
      }
    } catch (error) {
      console.error('Błąd podczas zapisywania zmian:', error);
      showError('Nie udało się zaktualizować zużycia materiałów');
    }
  };
  
  const handleConfirmConsumption = async () => {
    try {
      setConfirmationDialogOpen(false);
      
      await confirmMaterialConsumption(id);
      showSuccess('Zużycie materiałów potwierdzone. Stany magazynowe zostały zaktualizowane.');
      
      // Odśwież dane zadania
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
      
      // Zamknij dialog konsumpcji po pomyślnym potwierdzeniu
      setConsumptionDialogOpen(false);
    } catch (error) {
      console.error('Błąd podczas potwierdzania zużycia:', error);
      showError('Nie udało się potwierdzić zużycia materiałów: ' + error.message);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Czy na pewno chcesz usunąć to zadanie produkcyjne?')) {
      try {
        await deleteTask(id);
        showSuccess('Zadanie zostało usunięte');
        navigate('/production');
      } catch (error) {
        showError('Błąd podczas usuwania zadania: ' + error.message);
        console.error('Error deleting task:', error);
      }
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Zaplanowane':
        return 'primary';
      case 'W trakcie':
        return 'warning';
      case 'Zakończone':
        return 'success';
      case 'Anulowane':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusActions = () => {
    if (!task) return null;
    
    switch (task.status) {
      case 'Zaplanowane':
        return (
          <Button 
            variant="contained" 
            color="warning" 
            startIcon={<StartIcon />}
            onClick={() => handleStatusChange('W trakcie')}
          >
            Rozpocznij produkcję
          </Button>
        );
      case 'W trakcie':
        return (
          <>
            <Button 
              variant="contained" 
              color="success" 
              startIcon={<CompleteIcon />}
              onClick={() => handleStatusChange('Zakończone')}
              sx={{ mr: 1 }}
            >
              Zakończ produkcję
            </Button>
            <Button 
              variant="contained" 
              color="error" 
              startIcon={<StopIcon />}
              onClick={() => setStopProductionDialogOpen(true)}
            >
              Zatrzymaj produkcję
            </Button>
          </>
        );
      default:
        return null;
    }
  };

  // Funkcja otwierająca dialog przyjęcia do magazynu
  const handleReceiveClick = () => {
    setReceiveDialogOpen(true);
  };
  
  // Funkcja obsługująca dodanie produktu do magazynu
  const handleReceiveItem = async () => {
    try {
      setLoading(true);
      setReceiveDialogOpen(false);
      
      // Jeśli produkt jest powiązany z pozycją w magazynie, przenieś do formularza przyjęcia
      if (task.inventoryProductId) {
        // Przekieruj do strony przyjęcia towaru z parametrami
        const unitPrice = task.costs && task.quantity ? 
          Number(task.costs.totalCost / task.quantity) : 0;
          
        navigate(`/inventory/${task.inventoryProductId}/receive?poNumber=PROD-${id.substring(0, 6)}&quantity=${task.quantity}&unitPrice=${unitPrice}&reason=production`);
      } else {
        // Jeśli nie ma powiązanej pozycji magazynowej, użyj standardowej funkcji
        await addTaskProductToInventory(id, currentUser.uid);
        
        setAlert({
          open: true,
          severity: 'success',
          message: 'Produkt został pomyślnie dodany do magazynu'
        });
        
        // Odśwież dane zadania
        const updatedTask = await getTaskById(id);
        setTask(updatedTask);
      }
    } catch (error) {
      console.error('Błąd podczas dodawania produktu do magazynu:', error);
      setAlert({
        open: true,
        severity: 'error',
        message: `Błąd podczas dodawania produktu do magazynu: ${error.message}`
      });
    } finally {
      setLoading(false);
    }
  };

  // Funkcja obsługująca dodanie produktu do magazynu
  const handleAddToInventory = () => {
    handleReceiveClick();
  };

  const handleStartProduction = async () => {
    try {
      await startProduction(id, currentUser.uid);
      showSuccess('Produkcja rozpoczęta');
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
    } catch (error) {
      showError('Błąd podczas rozpoczynania produkcji: ' + error.message);
    }
  };

  const handleStopProduction = async () => {
    try {
      setProductionError(null);
      
      if (!completedQuantity || !timeSpent) {
        setProductionError('Wypełnij wszystkie pola');
        return;
      }

      const quantity = parseFloat(completedQuantity);
      const time = parseFloat(timeSpent);

      if (isNaN(quantity) || quantity < 0) {
        setProductionError('Nieprawidłowa ilość');
        return;
      }

      if (isNaN(time) || time < 0) {
        setProductionError('Nieprawidłowy przedział czasowy');
        return;
      }

      const result = await stopProduction(id, quantity, time, currentUser.uid);
      
      setStopProductionDialogOpen(false);
      showSuccess(result.isCompleted ? 
        'Produkcja zakończona. Zadanie zostało ukończone.' : 
        'Sesja produkcyjna zapisana. Możesz kontynuować produkcję później.'
      );
      
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
      
      // Odśwież historię produkcji
      const history = await getProductionHistory(id);
      setProductionHistory(history);
    } catch (error) {
      showError('Błąd podczas zatrzymywania produkcji: ' + error.message);
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (!task) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h5">Zadanie nie zostało znalezione</Typography>
        <Button 
          variant="contained" 
          component={Link} 
          to="/production"
          startIcon={<ArrowBackIcon />}
          sx={{ mt: 2 }}
        >
          Powrót do produkcji
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
        <IconButton 
          component={Link} 
          to="/production" 
          sx={{ mr: 1 }}
          color="primary"
        >
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h5">
          Szczegóły zadania produkcyjnego
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Button 
          variant="outlined" 
          startIcon={<EditIcon />}
          component={Link}
          to={`/production/tasks/${id}/edit`}
          sx={{ mr: 1 }}
        >
          Edytuj
        </Button>
        {task && task.materials && task.materials.length > 0 && (
          <Button
            variant="outlined"
            startIcon={<SettingsIcon />}
            onClick={() => setConsumptionDialogOpen(true)}
            sx={{ mr: 1 }}
          >
            Zarządzaj materiałami
          </Button>
        )}
        <Button 
          variant="outlined" 
          color="error" 
          startIcon={<DeleteIcon />}
          onClick={() => setDeleteDialog(true)}
        >
          Usuń
        </Button>
      </Box>
      
      {alert.open && (
        <Alert severity={alert.severity} sx={{ mb: 2 }}>
          {alert.message}
        </Alert>
      )}
      
      <Paper sx={{ p: 2 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="h6" gutterBottom>
              {task.name}
            </Typography>
            <Typography variant="body1" gutterBottom>
              Produkt: {task.productName}
            </Typography>
            <Typography variant="body1" gutterBottom>
              Ilość: {task.quantity} {task.unit}
            </Typography>
            <Typography variant="body1" gutterBottom>
              Kategoria: {task.category || 'Brak kategorii'}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Typography variant="body1" sx={{ mr: 1 }}>
                Status:
              </Typography>
              <Chip
                label={task.status}
                color={getStatusColor(task.status)}
              />
            </Box>
            <Typography variant="body1" gutterBottom>
              Priorytet: {task.priority || 'Normalny'}
            </Typography>
            <Typography variant="body1" gutterBottom>
              Zaplanowano na: {formatDate(task.scheduledDate)}
            </Typography>
            {task.startDate && (
              <Typography variant="body1" gutterBottom>
                Data rozpoczęcia: {formatDate(task.startDate)}
              </Typography>
            )}
            {task.completionDate && (
              <Typography variant="body1" gutterBottom>
                Data zakończenia: {formatDate(task.completionDate)}
              </Typography>
            )}
          </Grid>
        </Grid>
        
        <Divider sx={{ my: 2 }} />
        
        <Typography variant="h6" gutterBottom>
          Szczegóły
        </Typography>
        <Typography variant="body1" paragraph>
          {task.description || 'Brak opisu'}
        </Typography>
        
        <Divider sx={{ my: 2 }} />
        
        <Typography variant="h6" gutterBottom>
          Materiały
        </Typography>
        {task.materials && task.materials.length > 0 ? (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nazwa</TableCell>
                  <TableCell>Kategoria</TableCell>
                  <TableCell align="right">Ilość na jednostkę</TableCell>
                  <TableCell align="right">Całkowite zapotrzebowanie</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {task.materials.map((material) => (
                  <TableRow key={material.id}>
                    <TableCell>{material.name}</TableCell>
                    <TableCell>{material.category || '-'}</TableCell>
                    <TableCell align="right">{material.quantity / task.quantity} {material.unit}</TableCell>
                    <TableCell align="right">{material.quantity} {material.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography variant="body1">Brak przypisanych materiałów</Typography>
        )}
      </Paper>
      
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
        {getStatusActions()}
        {task && task.status === 'Zakończone' && task.readyForInventory && (
          <Button
            variant="contained"
            color="primary"
            startIcon={<InventoryIcon />}
            onClick={handleAddToInventory}
            sx={{ ml: 1 }}
          >
            Dodaj produkt do magazynu
          </Button>
        )}
      </Box>
      
      {/* Dialog zarządzania konsumpcją materiałów */}
      <Dialog
        open={consumptionDialogOpen}
        onClose={() => setConsumptionDialogOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">Zarządzanie zużyciem materiałów</Typography>
            <Box>
              {editMode ? (
                <>
                  <Button
                    variant="outlined"
                    startIcon={<CancelIcon />}
                    onClick={() => setEditMode(false)}
                    sx={{ mr: 1 }}
                  >
                    Anuluj
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<SaveIcon />}
                    onClick={handleSaveChanges}
                  >
                    Zapisz zmiany
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outlined"
                    startIcon={<EditIcon />}
                    onClick={() => setEditMode(true)}
                    sx={{ mr: 1 }}
                    disabled={task.materialConsumptionConfirmed}
                  >
                    Edytuj ilości
                  </Button>
                  <Button
                    variant="contained"
                    startIcon={<CheckIcon />}
                    onClick={() => setConfirmationDialogOpen(true)}
                    disabled={task.materialConsumptionConfirmed}
                  >
                    Potwierdź zużycie
                  </Button>
                </>
              )}
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {task.materialConsumptionConfirmed ? (
            <Alert severity="success" sx={{ mb: 3 }}>
              Zużycie materiałów dla tego zadania zostało potwierdzone. Stany magazynowe zostały już zaktualizowane.
            </Alert>
          ) : task.status === 'Zakończone' ? (
            <Alert severity="warning" sx={{ mb: 3 }}>
              Zadanie jest oznaczone jako zakończone, ale zużycie materiałów nie zostało jeszcze potwierdzone. Potwierdź zużycie materiałów.
            </Alert>
          ) : (
            <Alert severity="info" sx={{ mb: 3 }}>
              Potwierdź faktyczne zużycie materiałów dla tego zadania. W razie potrzeby możesz dostosować ilości przed potwierdzeniem.
            </Alert>
          )}
          
          {materials.length > 0 ? (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Materiał</TableCell>
                    <TableCell>Kategoria</TableCell>
                    <TableCell align="right">Planowana ilość</TableCell>
                    <TableCell align="right">Rzeczywiste zużycie</TableCell>
                    <TableCell align="right">Różnica</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {materials.map((material) => {
                    const plannedQuantity = material.quantity || 0;  // Używamy bezpośrednio wartości quantity
                    const actualQuantity = materialQuantities[material.id];
                    
                    let difference, differenceDisplay;
                    
                    if (actualQuantity !== undefined && !isNaN(actualQuantity)) {
                      difference = actualQuantity - plannedQuantity;
                      differenceDisplay = `${difference > 0 ? '+' : ''}${difference} ${material.unit}`;
                    } else {
                      difference = 0;
                      differenceDisplay = '-';
                    }
                    
                    return (
                      <TableRow key={material.id}>
                        <TableCell>{material.name}</TableCell>
                        <TableCell>{material.category || '-'}</TableCell>
                        <TableCell align="right">{plannedQuantity} {material.unit}</TableCell>
                        <TableCell align="right">
                          {editMode ? (
                            <TextField
                              type="number"
                              size="small"
                              value={actualQuantity === '' ? '' : actualQuantity || 0}
                              onChange={(e) => handleQuantityChange(material.id, e.target.value)}
                              InputProps={{
                                endAdornment: material.unit
                              }}
                              error={Boolean(errors[material.id])}
                              helperText={errors[material.id]}
                              sx={{ width: '120px' }}
                            />
                          ) : (
                            <Typography>{actualQuantity === '' ? '-' : actualQuantity} {material.unit}</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            color={difference === 0 ? 'text.primary' : difference < 0 ? 'success.main' : 'error.main'}
                          >
                            {differenceDisplay}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography>Brak materiałów dla tego zadania</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConsumptionDialogOpen(false)}>
            Zamknij
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog potwierdzenia zużycia materiałów */}
      <Dialog
        open={confirmationDialogOpen}
        onClose={() => setConfirmationDialogOpen(false)}
      >
        <DialogTitle>Potwierdź zużycie materiałów</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz potwierdzić zużycie materiałów? Ta operacja zaktualizuje stany magazynowe i nie będzie można jej cofnąć.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmationDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleConfirmConsumption} variant="contained" autoFocus>
            Potwierdź
          </Button>
        </DialogActions>
      </Dialog>

      {/* Sekcja historii produkcji */}
      {productionHistory.length > 0 && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>
            Historia produkcji
          </Typography>
          <Divider sx={{ mb: 2 }} />
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Data rozpoczęcia</TableCell>
                  <TableCell>Data zakończenia</TableCell>
                  <TableCell align="right">Wyprodukowana ilość</TableCell>
                  <TableCell align="right">Czas produkcji (min)</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {productionHistory.map((session, index) => (
                  <TableRow key={index}>
                    <TableCell>{formatDate(session.startDate)}</TableCell>
                    <TableCell>{formatDate(session.endDate)}</TableCell>
                    <TableCell align="right">{session.completedQuantity} {task.unit}</TableCell>
                    <TableCell align="right">{session.timeSpent}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={2} align="right" sx={{ fontWeight: 'bold' }}>
                    Suma:
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {productionHistory.reduce((sum, session) => sum + session.completedQuantity, 0)} {task.unit}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {productionHistory.reduce((sum, session) => sum + session.timeSpent, 0)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Dialog zatrzymania produkcji */}
      <Dialog
        open={stopProductionDialogOpen}
        onClose={() => setStopProductionDialogOpen(false)}
      >
        <DialogTitle>Zatrzymaj produkcję</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wprowadź informacje o zakończonej sesji produkcyjnej
          </DialogContentText>
          
          {productionError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {productionError}
            </Alert>
          )}

          <TextField
            label="Wyprodukowana ilość"
            type="number"
            value={completedQuantity}
            onChange={(e) => setCompletedQuantity(e.target.value)}
            fullWidth
            margin="dense"
            InputProps={{
              endAdornment: task?.unit
            }}
          />
          
          <FormControl fullWidth margin="dense">
            <InputLabel id="time-interval-label">Przedział czasowy produkcji</InputLabel>
            <Select
              labelId="time-interval-label"
              value={timeSpent}
              onChange={(e) => setTimeSpent(e.target.value)}
              label="Przedział czasowy produkcji"
            >
              {TIME_INTERVALS.map((interval) => (
                <MenuItem key={interval.value} value={interval.value}>
                  {interval.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStopProductionDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleStopProduction} variant="contained">
            Zatwierdź
          </Button>
        </DialogActions>
      </Dialog>

      {/* Okno dialogowe usuwania */}
      <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć to zadanie produkcyjne? Ta operacja jest nieodwracalna.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(false)}>Anuluj</Button>
          <Button onClick={handleDelete} color="error">Usuń</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog przyjęcia produktu do magazynu */}
      <Dialog
        open={receiveDialogOpen}
        onClose={() => setReceiveDialogOpen(false)}
      >
        <DialogTitle>Przyjmij produkt do magazynu</DialogTitle>
        <DialogContent>
          {task && (
            <>
              <DialogContentText>
                Czy chcesz przyjąć do magazynu następujący produkt:
              </DialogContentText>
              <Box sx={{ mt: 2, mb: 2 }}>
                <Typography variant="subtitle1">{task.productName}</Typography>
                <Typography>
                  Ilość: {task.quantity} {task.unit || 'szt.'}
                </Typography>
                {task.costs && (
                  <Typography>
                    Koszt jednostkowy: {Number(task.costs.totalCost / task.quantity).toFixed(2)} PLN
                  </Typography>
                )}
              </Box>
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReceiveDialogOpen(false)}>Anuluj</Button>
          <Button 
            onClick={handleReceiveItem} 
            color="primary"
          >
            {task && task.inventoryProductId ? 'Przejdź do przyjęcia' : 'Dodaj do magazynu'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default TaskDetailsPage; 