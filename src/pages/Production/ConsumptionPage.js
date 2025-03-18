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
  Divider,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText
} from '@mui/material';
import {
  Save as SaveIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Done as ConfirmIcon,
  Check as CheckIcon,
  Cancel as CancelIcon
} from '@mui/icons-material';
import {
  getTaskById,
  updateActualMaterialUsage,
  confirmMaterialConsumption
} from '../../services/productionService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

const ConsumptionPage = () => {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [materialQuantities, setMaterialQuantities] = useState({});
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [errors, setErrors] = useState({});
  
  // Pobieranie danych zadania
  useEffect(() => {
    fetchTaskData();
  }, [taskId]);
  
  const fetchTaskData = async () => {
    try {
      setLoading(true);
      
      const taskData = await getTaskById(taskId);
      setTask(taskData);
      
      // Przygotuj materiały do wyświetlenia, używając bezpośrednio quantity
      if (taskData?.materials?.length > 0) {
        const materialsList = taskData.materials.map(material => ({
          ...material,
          plannedQuantity: material.quantity
        }));
        
        setMaterials(materialsList);
        
        // Inicjalizacja rzeczywistych ilości
        const quantities = {};
        materialsList.forEach(material => {
          // Pobierz actualQuantity z danych zadania lub użyj plannedQuantity jako wartości domyślnej
          const actualQuantity = taskData.actualMaterialUsage && taskData.actualMaterialUsage[material.id] !== undefined
            ? taskData.actualMaterialUsage[material.id]
            : material.plannedQuantity;
          
          quantities[material.id] = actualQuantity;
        });
        
        setMaterialQuantities(quantities);
      }
      
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania danych zadania:', error);
      showError('Nie udało się pobrać danych zadania');
      setLoading(false);
    }
  };
  
  const handleQuantityChange = (materialId, value) => {
    const numValue = value === '' ? '' : parseFloat(value);
    
    if (value === '' || !isNaN(numValue)) {
      setMaterialQuantities(prev => ({
        ...prev,
        [materialId]: numValue
      }));
      
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
    
    Object.entries(materialQuantities).forEach(([materialId, quantity]) => {
      if (isNaN(quantity) || quantity === '') {
        newErrors[materialId] = 'Wartość musi być liczbą';
        isValid = false;
      } else if (quantity < 0) {
        newErrors[materialId] = 'Wartość nie może być ujemna';
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
      
      await updateActualMaterialUsage(taskId, materialQuantities);
      showSuccess('Zużycie materiałów zaktualizowane');
      setEditMode(false);
      fetchTaskData(); // Odśwież dane
    } catch (error) {
      console.error('Błąd podczas zapisywania zmian:', error);
      showError('Nie udało się zaktualizować zużycia materiałów');
    }
  };
  
  const handleConfirmConsumption = async () => {
    try {
      setConfirmationDialogOpen(false);
      setLoading(true);
      
      await confirmMaterialConsumption(taskId);
      showSuccess('Zużycie materiałów potwierdzone. Stany magazynowe zostały zaktualizowane.');
      fetchTaskData(); // Odśwież dane
    } catch (error) {
      console.error('Błąd podczas potwierdzania zużycia:', error);
      showError('Nie udało się potwierdzić zużycia materiałów: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd.MM.yyyy HH:mm', { locale: pl });
    } catch (e) {
      return dateString;
    }
  };
  
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }
  
  if (!task) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">Nie znaleziono zadania o ID: {taskId}</Alert>
      </Container>
    );
  }
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <IconButton 
            onClick={() => navigate(`/production/tasks/${taskId}`)} 
            sx={{ mr: 1 }}
            color="primary"
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h5">
            Zarządzanie zużyciem materiałów
          </Typography>
        </Box>
        
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
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1">Zadanie: {task.name}</Typography>
            <Typography variant="body1">Produkt: {task.productName}</Typography>
            <Typography variant="body1">Ilość: {task.quantity} {task.unit}</Typography>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="body1">Status: {task.status}</Typography>
            <Typography variant="body1">Data rozpoczęcia: {formatDate(task.startDate)}</Typography>
            {task.materialConsumptionConfirmed && (
              <Typography variant="body1">
                Zużycie potwierdzone: {formatDate(task.materialConsumptionDate)}
              </Typography>
            )}
          </Grid>
        </Grid>
      </Paper>
      
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
      
      <Typography variant="h6" gutterBottom>
        Materiały
      </Typography>
      
      <TableContainer component={Paper}>
        <Table size="small">
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
            {materials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">Brak materiałów przypisanych do tego zadania</TableCell>
              </TableRow>
            ) : (
              materials.map((material) => {
                const plannedQuantity = material.plannedQuantity || 0;
                const actualQuantity = materialQuantities[material.id];
                
                // Oblicz różnicę tylko jeśli actualQuantity jest prawidłową liczbą
                let difference, differenceDisplay;
                
                if (actualQuantity !== undefined && !isNaN(actualQuantity) && actualQuantity !== '') {
                  difference = actualQuantity - plannedQuantity;
                  differenceDisplay = `${difference > 0 ? '+' : ''}${difference} ${material.unit}`;
                } else {
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
                          sx={{ width: '150px' }}
                        />
                      ) : (
                        `${actualQuantity === '' ? '-' : actualQuantity} ${material.unit}`
                      )}
                    </TableCell>
                    <TableCell 
                      align="right" 
                      sx={{ 
                        color: !isNaN(actualQuantity) && actualQuantity !== '' && difference !== 0
                          ? difference < 0 ? 'success.main' : 'error.main'
                          : 'text.primary'
                      }}
                    >
                      {differenceDisplay}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
      
      {/* Dialog potwierdzenia */}
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
    </Container>
  );
};

export default ConsumptionPage; 