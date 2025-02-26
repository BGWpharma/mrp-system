// src/components/quality/ResultsEntryForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  FormControl,
  InputLabel,
  MenuItem,
  Select
} from '@mui/material';
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  CheckCircle as PassIcon,
  Cancel as FailIcon
} from '@mui/icons-material';
import { getTestById, addTestResult } from '../../services/qualityService';
import { getAllInventoryItems } from '../../services/inventoryService';
import { getAllTasks } from '../../services/productionService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';

const ResultsEntryForm = () => {
  const { testId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState(null);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [productionTasks, setProductionTasks] = useState([]);
  
  const [resultData, setResultData] = useState({
    testId: testId,
    parameters: [],
    batchId: '',
    batchNumber: '',
    productName: '',
    productionTaskId: '',
    notes: ''
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Pobierz definicję testu
        const testData = await getTestById(testId);
        setTest(testData);
        
        // Inicjalizuj parametry wyników
        const initialParameters = testData.parameters.map(param => ({
          name: param.name,
          value: '',
          unit: param.unit
        }));
        
        setResultData(prev => ({
          ...prev,
          parameters: initialParameters
        }));
        
        // Pobierz wszystkie pozycje magazynowe
        const items = await getAllInventoryItems();
        setInventoryItems(items);
        
        // Pobierz wszystkie zadania produkcyjne
        const tasks = await getAllTasks();
        setProductionTasks(tasks);
        
      } catch (error) {
        showError('Błąd podczas pobierania danych: ' + error.message);
        console.error('Error fetching data:', error);
        navigate('/quality');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [testId, navigate, showError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      // Sprawdź, czy wszystkie wymagane pola są wypełnione
      const emptyParameters = resultData.parameters.filter(param => param.value === '');
      if (emptyParameters.length > 0) {
        throw new Error('Wprowadź wartości dla wszystkich parametrów');
      }
      
      // Dodaj wynik testu
      await addTestResult(resultData, currentUser.uid);
      showSuccess('Wynik testu został zapisany');
      navigate('/quality');
    } catch (error) {
      showError('Błąd podczas zapisywania wyniku: ' + error.message);
      console.error('Error saving test result:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleParameterChange = (index, value) => {
    const updatedParameters = [...resultData.parameters];
    updatedParameters[index].value = value;
    
    setResultData(prev => ({
      ...prev,
      parameters: updatedParameters
    }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setResultData(prev => ({ ...prev, [name]: value }));
  };

  const handleInventoryItemChange = (e) => {
    const itemId = e.target.value;
    const selectedItem = inventoryItems.find(item => item.id === itemId);
    
    if (selectedItem) {
      setResultData(prev => ({
        ...prev,
        batchId: itemId,
        productName: selectedItem.name
      }));
    } else {
      setResultData(prev => ({
        ...prev,
        batchId: '',
        productName: ''
      }));
    }
  };

  const handleTaskChange = (e) => {
    const taskId = e.target.value;
    const selectedTask = productionTasks.find(task => task.id === taskId);
    
    if (selectedTask) {
      setResultData(prev => ({
        ...prev,
        productionTaskId: taskId,
        batchNumber: selectedTask.name,
        productName: selectedTask.productName || ''
      }));
    } else {
      setResultData(prev => ({
        ...prev,
        productionTaskId: '',
        batchNumber: ''
      }));
    }
  };

  const checkParameterStatus = (param, index) => {
    if (param.value === '') return null;
    
    const testParam = test.parameters[index];
    if (!testParam) return null;
    
    const value = parseFloat(param.value);
    
    if (
      (testParam.minValue !== undefined && testParam.minValue !== '' && value < parseFloat(testParam.minValue)) ||
      (testParam.maxValue !== undefined && testParam.maxValue !== '' && value > parseFloat(testParam.maxValue))
    ) {
      return <Chip icon={<FailIcon />} label="Poza zakresem" color="error" size="small" />;
    }
    
    return <Chip icon={<PassIcon />} label="OK" color="success" size="small" />;
  };

  if (loading) {
    return <div>Ładowanie formularza testu...</div>;
  }

  if (!test) {
    return <div>Nie znaleziono testu</div>;
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/quality')}
        >
          Powrót
        </Button>
        <Typography variant="h5">
          Wprowadzanie wyników testu
        </Typography>
        <Button 
          variant="contained" 
          color="primary" 
          type="submit"
          startIcon={<SaveIcon />}
          disabled={saving}
        >
          {saving ? 'Zapisywanie...' : 'Zapisz wyniki'}
        </Button>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          {test.name}
        </Typography>
        {test.description && (
          <Typography variant="body1" paragraph>
            {test.description}
          </Typography>
        )}
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <Typography variant="subtitle2">
              Kategoria: {test.category || 'Brak kategorii'}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="subtitle2">
              Etap produkcji: {test.productionStage || 'Nie określono'}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Typography variant="subtitle2">
              Częstotliwość: {test.frequency || 'Nie określono'}
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Informacje o produkcie/partii</Typography>
        <Divider sx={{ mb: 2 }} />
        
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Pozycja magazynowa</InputLabel>
              <Select
                value={resultData.batchId}
                onChange={handleInventoryItemChange}
                label="Pozycja magazynowa"
              >
                <MenuItem value="">
                  <em>Wybierz pozycję</em>
                </MenuItem>
                {inventoryItems.map(item => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name} ({item.quantity} {item.unit})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Zadanie produkcyjne</InputLabel>
              <Select
                value={resultData.productionTaskId}
                onChange={handleTaskChange}
                label="Zadanie produkcyjne"
              >
                <MenuItem value="">
                  <em>Wybierz zadanie</em>
                </MenuItem>
                {productionTasks.map(task => (
                  <MenuItem key={task.id} value={task.id}>
                    {task.name} - {task.productName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Numer partii"
              name="batchNumber"
              value={resultData.batchNumber}
              onChange={handleChange}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label="Nazwa produktu"
              name="productName"
              value={resultData.productName}
              onChange={handleChange}
              fullWidth
            />
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Parametry do sprawdzenia</Typography>
        
        {test.instructions && (
          <Alert severity="info" sx={{ mb: 3 }}>
            <Typography variant="subtitle2">Instrukcje:</Typography>
            <Typography variant="body2">{test.instructions}</Typography>
          </Alert>
        )}
        
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Parametr</TableCell>
                <TableCell>Wartość</TableCell>
                <TableCell>Jednostka</TableCell>
                <TableCell>Zakres akceptowalny</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {resultData.parameters.map((param, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Typography variant="subtitle2">
                      {param.name}
                    </Typography>
                    {test.parameters[index]?.description && (
                      <Typography variant="caption" display="block">
                        {test.parameters[index].description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    <TextField
                      required
                      type="number"
                      value={param.value}
                      onChange={(e) => handleParameterChange(index, e.target.value)}
                      fullWidth
                      inputProps={{ step: 'any' }}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {param.unit}
                  </TableCell>
                  <TableCell>
                    {test.parameters[index]?.minValue !== undefined && test.parameters[index]?.minValue !== '' && 
                      `Min: ${test.parameters[index].minValue}`
                    }
                    {test.parameters[index]?.minValue !== undefined && test.parameters[index]?.minValue !== '' && 
                     test.parameters[index]?.maxValue !== undefined && test.parameters[index]?.maxValue !== '' && 
                      ' / '
                    }
                    {test.parameters[index]?.maxValue !== undefined && test.parameters[index]?.maxValue !== '' && 
                      `Max: ${test.parameters[index].maxValue}`
                    }
                    {(test.parameters[index]?.minValue === undefined || test.parameters[index]?.minValue === '') &&
                     (test.parameters[index]?.maxValue === undefined || test.parameters[index]?.maxValue === '') &&
                      'Nie określono'
                    }
                  </TableCell>
                  <TableCell>
                    {checkParameterStatus(param, index)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Notatki</Typography>
        <TextField
          name="notes"
          value={resultData.notes || ''}
          onChange={handleChange}
          fullWidth
          multiline
          rows={3}
          placeholder="Dodatkowe uwagi, obserwacje..."
        />
      </Paper>
    </Box>
  );
};

export default ResultsEntryForm;