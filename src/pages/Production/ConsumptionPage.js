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
  DialogContentText,
  Chip,
  Tooltip,
  Collapse
} from '@mui/material';
import {
  Save as SaveIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Done as ConfirmIcon,
  Check as CheckIcon,
  Cancel as CancelIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon
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
  const { showSuccess, showError, showInfo } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [task, setTask] = useState(null);
  const [materials, setMaterials] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const [materialQuantities, setMaterialQuantities] = useState({});
  const [batchQuantities, setBatchQuantities] = useState({});
  const [confirmationDialogOpen, setConfirmationDialogOpen] = useState(false);
  const [errors, setErrors] = useState({});
  const [batchErrors, setBatchErrors] = useState({});
  const [expandedMaterials, setExpandedMaterials] = useState({});
  
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
        
        // Inicjalizacja ilości dla partii
        const batchQty = {};
        
        // Dla każdego materiału sprawdź, czy ma przypisane partie
        materialsList.forEach(material => {
          const materialId = material.inventoryItemId || material.id;
          
          if (taskData.materialBatches && taskData.materialBatches[materialId]) {
            const materialBatches = taskData.materialBatches[materialId];
            
            // Inicjalizuj ilości dla każdej partii
            materialBatches.forEach(batch => {
              const batchKey = `${materialId}_${batch.batchId}`;
              
              // Jeśli istnieją niestandardowe ilości dla partii, użyj ich
              if (taskData.batchActualUsage && taskData.batchActualUsage[batchKey] !== undefined) {
                batchQty[batchKey] = taskData.batchActualUsage[batchKey];
              } else {
                // W przeciwnym razie użyj oryginalnej ilości partii
                batchQty[batchKey] = batch.quantity;
              }
            });
            
            // Domyślnie rozwiń materiały z partiami
            setExpandedMaterials(prev => ({
              ...prev,
              [materialId]: true
            }));
          }
        });
        
        setBatchQuantities(batchQty);
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
  
  const handleBatchQuantityChange = (materialId, batchId, value) => {
    const batchKey = `${materialId}_${batchId}`;
    const numValue = value === '' ? '' : parseFloat(value);
    
    if (value === '' || !isNaN(numValue)) {
      setBatchQuantities(prev => ({
        ...prev,
        [batchKey]: numValue
      }));
      
      if (batchErrors[batchKey]) {
        setBatchErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors[batchKey];
          return newErrors;
        });
      }
      
      // Zaktualizuj również całkowitą ilość materiału na podstawie sum partii
      updateTotalMaterialQuantity(materialId);
    }
  };
  
  const updateTotalMaterialQuantity = (materialId) => {
    // Znajdź wszystkie partie dla tego materiału
    if (!task || !task.materialBatches || !task.materialBatches[materialId]) {
      return;
    }
    
    const batches = task.materialBatches[materialId];
    let totalQuantity = 0;
    
    // Oblicz sumę ilości wszystkich partii
    batches.forEach(batch => {
      const batchKey = `${materialId}_${batch.batchId}`;
      const batchQty = batchQuantities[batchKey];
      
      if (batchQty !== undefined && !isNaN(batchQty)) {
        totalQuantity += parseFloat(batchQty);
      }
    });
    
    // Zaktualizuj całkowitą ilość materiału
    setMaterialQuantities(prev => ({
      ...prev,
      [materialId]: totalQuantity
    }));
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
    
    // Sprawdź również ilości partii
    const newBatchErrors = {};
    
    Object.entries(batchQuantities).forEach(([batchKey, quantity]) => {
      if (isNaN(quantity) || quantity === '') {
        newBatchErrors[batchKey] = 'Wartość musi być liczbą';
        isValid = false;
      } else if (quantity < 0) {
        newBatchErrors[batchKey] = 'Wartość nie może być ujemna';
        isValid = false;
      }
    });
    
    setBatchErrors(newBatchErrors);
    
    return isValid;
  };
  
  const handleSaveChanges = async () => {
    try {
      if (!validateQuantities()) {
        return;
      }
      
      setLoading(true);

      // Zbierz wszystkie faktyczne ilości materiałów
      const updatedQuantities = {};
      
      Object.keys(materialQuantities).forEach(materialId => {
        const value = materialQuantities[materialId];
        updatedQuantities[materialId] = value === '' ? 0 : parseFloat(value);
      });
      
      // Zbierz wszystkie faktyczne ilości partii
      const updatedBatchQuantities = {};
      
      Object.keys(batchQuantities).forEach(batchKey => {
        const value = batchQuantities[batchKey];
        updatedBatchQuantities[batchKey] = value === '' ? 0 : parseFloat(value);
      });
      
      // Zapisz zmiany z uwzględnieniem partii
      const result = await updateActualMaterialUsage(taskId, updatedQuantities, updatedBatchQuantities);
      
      showSuccess(result.message || 'Zużycie materiałów zaktualizowane.');
      
      // Jeśli zużycie było wcześniej potwierdzone, wyświetl dodatkowe powiadomienie
      if (result.message && result.message.includes('Poprzednie potwierdzenie zużycia zostało anulowane')) {
        setTimeout(() => {
          showInfo('Poprzednie potwierdzenie zużycia zostało anulowane z powodu zmiany ilości. Proszę ponownie potwierdzić zużycie materiałów.');
        }, 1000);
      }
      
      setEditMode(false);
      fetchTaskData(); // Odśwież dane
    } catch (error) {
      console.error('Błąd podczas zapisywania zmian:', error);
      showError('Nie udało się zapisać zmian: ' + error.message);
    } finally {
      setLoading(false);
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
  
  const handleToggleMaterialExpand = (materialId) => {
    setExpandedMaterials(prev => ({
      ...prev,
      [materialId]: !prev[materialId]
    }));
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
          Zadanie jest oznaczone jako zakończone, ale zużycie materiałów nie zostało jeszcze potwierdzone. Potwierdź zużycie materiałów, aby zwolnić rezerwacje z magazynu. Rezerwacje materiałów pozostają aktywne do momentu potwierdzenia zużycia.
        </Alert>
      ) : (
        <Alert severity="info" sx={{ mb: 3 }}>
          Potwierdź faktyczne zużycie materiałów dla tego zadania. W razie potrzeby możesz dostosować ilości przed potwierdzeniem. Rezerwacje materiałów pozostaną aktywne do momentu potwierdzenia zużycia.
        </Alert>
      )}
      
      <Typography variant="h6" gutterBottom>
        Materiały
      </Typography>
      
      <Alert severity="info" sx={{ mb: 3 }}>
        Zużycie materiałów realizowane jest z konkretnych partii (LOT) przypisanych do zadania. 
        Kliknij ikonę rozwijania przy danym materiale, aby zobaczyć i edytować szczegóły zużycia dla każdej partii.
        Po potwierdzeniu zużycia, stany magazynowe zostaną zaktualizowane dla konkretnych partii, a nie dla ogólnej pozycji magazynowej.
      </Alert>
      
      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Materiał</TableCell>
              <TableCell>Kategoria</TableCell>
              <TableCell align="right">Planowana ilość</TableCell>
              <TableCell align="right">Rzeczywiste zużycie</TableCell>
              <TableCell align="right">Różnica</TableCell>
              <TableCell align="right">Partie (LOT)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {materials.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">Brak materiałów przypisanych do tego zadania</TableCell>
              </TableRow>
            ) : (
              materials.map((material) => {
                const plannedQuantity = material.plannedQuantity || 0;
                const actualQuantity = materialQuantities[material.id];
                const materialId = material.inventoryItemId || material.id;
                
                // Oblicz różnicę tylko jeśli actualQuantity jest prawidłową liczbą
                let difference, differenceDisplay;
                
                if (actualQuantity !== undefined && !isNaN(actualQuantity) && actualQuantity !== '') {
                  difference = actualQuantity - plannedQuantity;
                  differenceDisplay = `${difference > 0 ? '+' : ''}${difference} ${material.unit}`;
                } else {
                  differenceDisplay = '-';
                }
                
                // Sprawdź, czy materiał ma przypisane partie
                const hasBatches = task.materialBatches && task.materialBatches[materialId] && 
                  task.materialBatches[materialId].length > 0;
                
                const isExpanded = Boolean(expandedMaterials[materialId]);
                
                return (
                  <React.Fragment key={material.id}>
                    <TableRow>
                      <TableCell>{material.name}</TableCell>
                      <TableCell>{material.category || '-'}</TableCell>
                      <TableCell align="right">{plannedQuantity} {material.unit}</TableCell>
                      <TableCell align="right">
                        {editMode && !hasBatches ? (
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
                      <TableCell align="right">
                        {hasBatches ? (
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                            <Typography variant="body2" sx={{ mr: 1 }}>
                              {task.materialBatches[materialId].length} {task.materialBatches[materialId].length === 1 ? 'partia' : 'partie'}
                            </Typography>
                            <IconButton 
                              size="small" 
                              onClick={() => handleToggleMaterialExpand(materialId)}
                            >
                              {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </IconButton>
                          </Box>
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Brak przypisanych partii
                          </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                    
                    {/* Rozwijane szczegóły partii (LOT) z możliwością edycji */}
                    {hasBatches && (
                      <TableRow>
                        <TableCell colSpan={6} sx={{ p: 0, borderBottom: 0 }}>
                          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <Box sx={{ p: 2, backgroundColor: '#f5f5f5' }}>
                              <Typography variant="subtitle2" gutterBottom>
                                Przypisane partie materiału
                              </Typography>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Numer partii</TableCell>
                                    <TableCell align="right">Przypisana ilość</TableCell>
                                    <TableCell align="right">Rzeczywiste zużycie</TableCell>
                                    <TableCell align="right">Różnica</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {task.materialBatches[materialId].map((batch, index) => {
                                    const batchKey = `${materialId}_${batch.batchId}`;
                                    const assignedQuantity = batch.quantity || 0;
                                    const actualBatchQuantity = batchQuantities[batchKey];
                                    
                                    // Oblicz różnicę dla partii
                                    let batchDifference, batchDifferenceDisplay;
                                    
                                    if (actualBatchQuantity !== undefined && !isNaN(actualBatchQuantity) && actualBatchQuantity !== '') {
                                      batchDifference = actualBatchQuantity - assignedQuantity;
                                      batchDifferenceDisplay = `${batchDifference > 0 ? '+' : ''}${batchDifference} ${material.unit}`;
                                    } else {
                                      batchDifferenceDisplay = '-';
                                    }
                                    
                                    return (
                                      <TableRow key={index}>
                                        <TableCell>{batch.batchNumber}</TableCell>
                                        <TableCell align="right">{assignedQuantity} {material.unit}</TableCell>
                                        <TableCell align="right">
                                          {editMode ? (
                                            <TextField
                                              type="number"
                                              size="small"
                                              value={actualBatchQuantity === '' ? '' : actualBatchQuantity || 0}
                                              onChange={(e) => handleBatchQuantityChange(materialId, batch.batchId, e.target.value)}
                                              InputProps={{
                                                endAdornment: material.unit
                                              }}
                                              error={Boolean(batchErrors[batchKey])}
                                              helperText={batchErrors[batchKey]}
                                              sx={{ width: '150px' }}
                                            />
                                          ) : (
                                            `${actualBatchQuantity === '' ? '-' : actualBatchQuantity} ${material.unit}`
                                          )}
                                        </TableCell>
                                        <TableCell 
                                          align="right" 
                                          sx={{ 
                                            color: !isNaN(actualBatchQuantity) && actualBatchQuantity !== '' && batchDifference !== 0
                                              ? batchDifference < 0 ? 'success.main' : 'error.main'
                                              : 'text.primary'
                                          }}
                                        >
                                          {batchDifferenceDisplay}
                                        </TableCell>
                                      </TableRow>
                                    );
                                  })}
                                </TableBody>
                              </Table>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
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
            Czy na pewno chcesz potwierdzić zużycie materiałów? Ta operacja spowoduje zmniejszenie ilości w konkretnych partiach (LOT) materiałów przypisanych do tego zadania i zaktualizuje stany magazynowe. Operacji tej nie będzie można cofnąć.
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