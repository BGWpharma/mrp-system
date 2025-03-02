// src/components/quality/ResultsEntryForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
  Divider,
  FormHelperText,
  IconButton,
  Alert,
  Switch,
  FormControlLabel,
  FormGroup,
  Radio,
  RadioGroup,
  Tooltip,
  Chip
} from '@mui/material';
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  PhotoCamera as PhotoCameraIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Info as InfoIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { addTestResult, getTestById } from '../../services/qualityService';
import { getAllInventoryItems } from '../../services/inventoryService';
import { getProductionTasks } from '../../services/productionService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatTimestamp } from '../../utils/dateUtils';

const ResultsEntryForm = ({ testId }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState(null);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [productionTasks, setProductionTasks] = useState([]);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [validationErrors, setValidationErrors] = useState({});
  
  const [resultData, setResultData] = useState({
    testId: testId,
    testName: '',
    date: new Date(),
    parameters: [],
    inventoryItemId: '',
    productionTaskId: '',
    batchNumber: '',
    productName: '',
    notes: '',
    status: 'Oczekujący', // Oczekujący, Pozytywny, Negatywny
    createdBy: '',
    createdAt: new Date()
  });
  
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Pobierz dane testu
        const testData = await getTestById(testId);
        setTest(testData);
        
        // Przygotuj parametry
        const parametersArray = testData.parameters.map(param => {
          // Domyślna wartość zależna od typu parametru
          let defaultValue = '';
          if (param.type === 'boolean') {
            defaultValue = null; // null oznacza, że nie wybrano jeszcze Tak/Nie
          } else if (param.type === 'select') {
            defaultValue = param.options && param.options.length > 0 ? param.options[0] : '';
          } else if (param.type === 'numeric') {
            defaultValue = '';
          }
          
          return {
            name: param.name,
            type: param.type || 'numeric',
            value: defaultValue,
            unit: param.unit || '',
            minValue: param.minValue || '',
            maxValue: param.maxValue || '',
            description: param.description || '',
            isCompliant: null, // null - nie sprawdzono, true - zgodny, false - niezgodny
            options: param.options || [],
            isRequired: param.isRequired !== false,
            precision: param.precision || 2,
            criticalParameter: param.criticalParameter || false
          };
        });
        
        setResultData(prev => ({
          ...prev,
          testName: testData.name,
          parameters: parametersArray
        }));
        
        // Pobierz dane do wyboru z listy
        const items = await getAllInventoryItems();
        setInventoryItems(items);
        
        const tasks = await getProductionTasks();
        setProductionTasks(tasks);
        
      } catch (error) {
        showError('Błąd podczas pobierania danych: ' + error.message);
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    if (testId) {
      fetchData();
    }
  }, [testId, showError]);
  
  const validateResults = () => {
    const errors = {};
    
    // Ogólna walidacja
    if (test && test.requirePhoto && !photoFile) {
      errors.photo = 'Zdjęcie jest wymagane dla tego testu';
    }
    
    // Sprawdź czy wybrano produkt LUB zadanie produkcyjne
    if (!resultData.inventoryItemId && !resultData.productionTaskId && !resultData.productName) {
      errors.product = 'Wybierz produkt, zadanie produkcyjne lub wprowadź nazwę produktu';
    }
    
    // Walidacja parametrów
    resultData.parameters.forEach((param, index) => {
      // Sprawdź wymagane parametry
      if (param.isRequired && (param.value === '' || param.value === null)) {
        errors[`parameter_${index}`] = 'Wartość parametru jest wymagana';
      }
      
      // Walidacja dla typów numerycznych
      if (param.type === 'numeric' && param.value !== '') {
        const numValue = parseFloat(param.value);
        
        if (isNaN(numValue)) {
          errors[`parameter_${index}`] = 'Wartość musi być liczbą';
        } else {
          // Walidacja zakresów min/max (jeśli są zdefiniowane)
          if (param.minValue !== '' && numValue < parseFloat(param.minValue)) {
            errors[`parameter_${index}`] = `Wartość poniżej minimum ${param.minValue} ${param.unit}`;
          }
          if (param.maxValue !== '' && numValue > parseFloat(param.maxValue)) {
            errors[`parameter_${index}`] = `Wartość powyżej maksimum ${param.maxValue} ${param.unit}`;
          }
        }
      }
    });
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };
  
  // Sprawdza zgodność parametru z wymaganiami
  const checkParameterCompliance = (param) => {
    if (param.type !== 'numeric' || param.value === '') return null;
    
    const value = parseFloat(param.value);
    if (isNaN(value)) return false;
    
    // Jeśli min lub max są zdefiniowane, sprawdzamy zgodność
    if (param.minValue !== '' && value < parseFloat(param.minValue)) return false;
    if (param.maxValue !== '' && value > parseFloat(param.maxValue)) return false;
    
    // Jeśli przeszliśmy wszystkie testy, parametr jest zgodny
    return true;
  };
  
  // Sprawdza ogólny status testu na podstawie wszystkich parametrów
  const determineTestStatus = () => {
    const parameters = [...resultData.parameters];
    let hasCriticalFailure = false;
    let hasAnyFailure = false;
    
    parameters.forEach(param => {
      const isCompliant = checkParameterCompliance(param);
      param.isCompliant = isCompliant;
      
      // Jeśli parametr krytyczny jest niezgodny i automatyczne odrzucanie jest włączone
      if (param.criticalParameter && isCompliant === false && test.autoFailOnCritical) {
        hasCriticalFailure = true;
      }
      
      // Dowolny niezgodny parametr
      if (isCompliant === false) {
        hasAnyFailure = true;
      }
    });
    
    const updatedStatus = hasCriticalFailure || hasAnyFailure ? 'Negatywny' : 'Pozytywny';
    
    // Aktualizuj parametry i status
    setResultData(prev => ({
      ...prev,
      parameters: parameters,
      status: updatedStatus
    }));
    
    return updatedStatus;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateResults()) {
      showError('Formularz zawiera błędy. Sprawdź wprowadzone dane.');
      return;
    }
    
    setSaving(true);
    
    try {
      // Sprawdź zgodność parametrów i określ status testu
      const testStatus = determineTestStatus();

      // Dane do zapisania
      const testResult = {
        ...resultData,
        status: testStatus,
        createdBy: currentUser.uid,
        createdAt: new Date()
      };
      
      // Dodaj wynik testu z ewentualnym zdjęciem
      await addTestResult(testResult, photoFile);
      
      showSuccess('Wynik testu został zapisany');
      navigate('/quality');
    } catch (error) {
      showError('Błąd podczas zapisywania wyniku: ' + error.message);
      console.error('Error saving test result:', error);
    } finally {
      setSaving(false);
    }
  };
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setResultData(prev => ({ ...prev, [name]: value }));
  };
  
  const handleParameterChange = (index, value) => {
    const updatedParameters = [...resultData.parameters];
    updatedParameters[index] = { 
      ...updatedParameters[index], 
      value,
      // Resetuj status zgodności przy zmianie wartości
      isCompliant: null
    };
    
    setResultData(prev => ({
      ...prev,
      parameters: updatedParameters,
      // Resetuj status wyniku przy zmianie parametrów
      status: 'Oczekujący'
    }));
    
    // Wyczyść błąd walidacji dla tego parametru
    if (validationErrors[`parameter_${index}`]) {
      const updatedErrors = { ...validationErrors };
      delete updatedErrors[`parameter_${index}`];
      setValidationErrors(updatedErrors);
    }
  };
  
  const handleInventoryItemChange = (e) => {
    const itemId = e.target.value;
    const selectedItem = inventoryItems.find(item => item.id === itemId);
    
    setResultData(prev => ({
      ...prev,
      inventoryItemId: itemId,
      // Aktualizuj nazwę produktu na podstawie wybranego elementu z inwentarza
      productName: selectedItem ? selectedItem.name : prev.productName
    }));
  };
  
  const handleProductionTaskChange = (e) => {
    const taskId = e.target.value;
    const selectedTask = productionTasks.find(task => task.id === taskId);
    
    setResultData(prev => ({
      ...prev,
      productionTaskId: taskId,
      // Aktualizuj nazwę produktu na podstawie wybranego zadania produkcyjnego
      productName: selectedTask ? selectedTask.productName : prev.productName
    }));
  };
  
  const handlePhotoChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setPhotoFile(file);
      
      // Pokaż podgląd zdjęcia
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotoPreview(event.target.result);
      };
      reader.readAsDataURL(file);
      
      // Wyczyść błąd walidacji
      if (validationErrors.photo) {
        const updatedErrors = { ...validationErrors };
        delete updatedErrors.photo;
        setValidationErrors(updatedErrors);
      }
    }
  };
  
  const removePhoto = () => {
    setPhotoFile(null);
    setPhotoPreview(null);
  };
  
  // Określa kolor statusu zgodności
  const getComplianceColor = (isCompliant) => {
    if (isCompliant === null) return 'info';
    return isCompliant ? 'success' : 'error';
  };
  
  // Renderuje komponent wejściowy w zależności od typu parametru
  const renderParameterInput = (param, index) => {
    const error = validationErrors[`parameter_${index}`];
    
    switch (param.type) {
      case 'boolean':
        return (
          <FormControl component="fieldset" error={!!error}>
            <RadioGroup
              row
              value={param.value}
              onChange={(e) => handleParameterChange(index, e.target.value === 'true')}
            >
              <FormControlLabel value={true} control={<Radio />} label="Tak" />
              <FormControlLabel value={false} control={<Radio />} label="Nie" />
            </RadioGroup>
            {error && <FormHelperText error>{error}</FormHelperText>}
          </FormControl>
        );
      
      case 'select':
        return (
          <FormControl fullWidth error={!!error} size="small">
            <Select
              value={param.value}
              onChange={(e) => handleParameterChange(index, e.target.value)}
            >
              {param.options.map((option, i) => (
                <MenuItem key={i} value={option}>{option}</MenuItem>
              ))}
            </Select>
            {error && <FormHelperText>{error}</FormHelperText>}
          </FormControl>
        );
      
      case 'text':
        return (
          <TextField
            value={param.value}
            onChange={(e) => handleParameterChange(index, e.target.value)}
            fullWidth
            size="small"
            error={!!error}
            helperText={error}
          />
        );
      
      case 'multiline':
        return (
          <TextField
            value={param.value}
            onChange={(e) => handleParameterChange(index, e.target.value)}
            fullWidth
            multiline
            rows={2}
            size="small"
            error={!!error}
            helperText={error}
          />
        );
      
      case 'numeric':
      default:
        return (
          <TextField
            type="number"
            value={param.value}
            onChange={(e) => handleParameterChange(index, e.target.value)}
            fullWidth
            inputProps={{ 
              step: `0.${'0'.repeat(param.precision - 1)}1`,
              style: { textAlign: 'right' }
            }}
            size="small"
            error={!!error}
            helperText={error}
          />
        );
    }
  };
  
  // Renderuje ikonę status zgodności
  const renderComplianceStatus = (isCompliant, isCritical = false) => {
    if (isCompliant === null) return null;
    
    const Icon = isCompliant ? CheckCircleIcon : isCritical ? ErrorIcon : WarningIcon;
    const color = isCompliant ? 'success' : 'error';
    const tooltip = isCompliant 
      ? 'Wartość zgodna z wymaganiami' 
      : isCritical 
        ? 'Parametr krytyczny poza zakresem - test nie zaliczony' 
        : 'Wartość poza dopuszczalnym zakresem';
    
    return (
      <Tooltip title={tooltip}>
        <Icon color={color} />
      </Tooltip>
    );
  };
  
  // Renderuje informację o zakresie
  const renderRangeInfo = (param) => {
    if (param.type !== 'numeric') return null;
    
    const hasMin = param.minValue !== '';
    const hasMax = param.maxValue !== '';
    
    if (!hasMin && !hasMax) return 'Brak limitów';
    
    if (hasMin && hasMax) {
      return `${param.minValue} - ${param.maxValue} ${param.unit}`;
    } else if (hasMin) {
      return `min. ${param.minValue} ${param.unit}`;
    } else {
      return `maks. ${param.maxValue} ${param.unit}`;
    }
  };
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
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
          Wprowadzanie wyników testu: {test?.name}
        </Typography>
        <Button 
          variant="contained" 
          color="primary" 
          type="submit"
          startIcon={<SaveIcon />}
          disabled={saving}
        >
          {saving ? 'Zapisywanie...' : 'Zapisz wynik'}
        </Button>
      </Box>
      
      {/* Podsumowanie statusu testu */}
      {resultData.status !== 'Oczekujący' && (
        <Alert 
          severity={resultData.status === 'Pozytywny' ? 'success' : 'error'}
          sx={{ mb: 3 }}
        >
          {resultData.status === 'Pozytywny' 
            ? 'Wszystkie parametry zgodne z wymaganiami' 
            : 'Niektóre parametry są poza dopuszczalnym zakresem'}
        </Alert>
      )}
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Produkt / Partia</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth error={!!validationErrors.product}>
              <InputLabel>Element z inwentarza</InputLabel>
              <Select
                name="inventoryItemId"
                value={resultData.inventoryItemId}
                onChange={handleInventoryItemChange}
                label="Element z inwentarza"
              >
                <MenuItem value="">Nie wybrano</MenuItem>
                {inventoryItems.map(item => (
                  <MenuItem key={item.id} value={item.id}>
                    {item.name} ({item.category})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Zadanie produkcyjne</InputLabel>
              <Select
                name="productionTaskId"
                value={resultData.productionTaskId}
                onChange={handleProductionTaskChange}
                label="Zadanie produkcyjne"
              >
                <MenuItem value="">Nie wybrano</MenuItem>
                {productionTasks.map(task => (
                  <MenuItem key={task.id} value={task.id}>
                    {task.productName} ({formatTimestamp(task.scheduledDate)})
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
              error={!!validationErrors.product}
              helperText={validationErrors.product}
            />
          </Grid>
        </Grid>
      </Paper>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Parametry do sprawdzenia</Typography>
        
        {test?.instructions && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2">Instrukcje:</Typography>
            <Typography variant="body2">{test.instructions}</Typography>
          </Box>
        )}
        
        <Table>
          <TableHead>
            <TableRow>
              <TableCell width="30%">Parametr</TableCell>
              <TableCell width="30%">Wartość</TableCell>
              <TableCell width="15%">Jednostka</TableCell>
              <TableCell width="15%">Dopuszczalny zakres</TableCell>
              <TableCell width="10%">Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {resultData.parameters.map((param, index) => (
              <TableRow key={index} sx={param.criticalParameter ? { bgcolor: 'rgba(255, 0, 0, 0.05)' } : {}}>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <Typography>
                      {param.name}
                      {param.isRequired && ' *'}
                    </Typography>
                    {param.criticalParameter && (
                      <Tooltip title="Parametr krytyczny - musi być w zakresie, aby test został zaliczony">
                        <Chip 
                          label="Krytyczny" 
                          size="small" 
                          color="error" 
                          sx={{ ml: 1 }} 
                        />
                      </Tooltip>
                    )}
                  </Box>
                  {param.description && (
                    <Typography variant="caption" color="textSecondary">
                      {param.description}
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  {renderParameterInput(param, index)}
                </TableCell>
                <TableCell>
                  {param.type === 'numeric' && param.unit}
                </TableCell>
                <TableCell>
                  {renderRangeInfo(param)}
                </TableCell>
                <TableCell align="center">
                  {renderComplianceStatus(param.isCompliant, param.criticalParameter)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Dokumentacja zdjęciowa</Typography>
        
        {photoPreview ? (
          <Box sx={{ mb: 2, position: 'relative' }}>
            <img 
              src={photoPreview} 
              alt="Zdjęcie testu" 
              style={{ maxWidth: '100%', maxHeight: '300px', display: 'block' }} 
            />
            <IconButton 
              sx={{ position: 'absolute', top: 8, right: 8, bgcolor: 'rgba(255,255,255,0.8)' }}
              onClick={removePhoto}
            >
              <DeleteIcon />
            </IconButton>
          </Box>
        ) : (
          <Box sx={{ mb: 2 }}>
            <Button
              variant="outlined"
              component="label"
              startIcon={<PhotoCameraIcon />}
              color={validationErrors.photo ? "error" : "primary"}
            >
              Dodaj zdjęcie
              <input
                type="file"
                accept="image/*"
                hidden
                onChange={handlePhotoChange}
              />
            </Button>
            {test?.requirePhoto && <Typography variant="caption" color="error" sx={{ ml: 2 }}>Zdjęcie jest wymagane dla tego testu</Typography>}
            {validationErrors.photo && <FormHelperText error>{validationErrors.photo}</FormHelperText>}
          </Box>
        )}
      </Paper>
      
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Uwagi</Typography>
        <TextField
          name="notes"
          value={resultData.notes}
          onChange={handleChange}
          fullWidth
          multiline
          rows={4}
          placeholder="Dodatkowe obserwacje, uwagi..."
        />
      </Paper>
    </Box>
  );
};

export default ResultsEntryForm;