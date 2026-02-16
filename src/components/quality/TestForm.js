// src/components/quality/TestForm.js
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
  IconButton,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  FormHelperText,
  Switch,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Tooltip,
  Chip
} from '@mui/material';
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { createTest, updateTest, getTestById } from '../../services/qualityService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';

const DEFAULT_PARAMETER = { 
  name: '', 
  type: 'numeric',
  unit: '', 
  minValue: '', 
  maxValue: '', 
  description: '',
  options: [],
  isRequired: true,
  precision: 2,
  criticalParameter: false
};

const PARAMETER_TYPES = [
  { value: 'numeric', label: 'Numeryczny' },
  { value: 'boolean', label: 'Tak/Nie' },
  { value: 'select', label: 'Lista wyboru' },
  { value: 'text', label: 'Tekst' },
  { value: 'multiline', label: 'Tekst wieloliniowy' }
];

const TestForm = ({ testId }) => {
  const [loading, setLoading] = useState(!!testId);
  const [saving, setSaving] = useState(false);
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('production');
  const navigate = useNavigate();
  
  const [testData, setTestData] = useState({
    name: '',
    description: '',
    category: '',
    productionStage: '',
    parameters: [{ ...DEFAULT_PARAMETER }],
    instructions: '',
    frequency: '',
    status: 'Aktywny',
    autoFailOnCritical: true, // Automatycznie failuje test, jeśli parametr krytyczny jest poza zakresem
    requirePhoto: false // Wymaga dodania zdjęcia do wyniku testu
  });

  useEffect(() => {
    if (testId) {
      const fetchTest = async () => {
        try {
          const test = await getTestById(testId);
          
          // Upewnij się, że zawsze jest przynajmniej jeden parametr
          if (!test.parameters || test.parameters.length === 0) {
            test.parameters = [{ ...DEFAULT_PARAMETER }];
          }

          // Upewnij się, że wszystkie parametry mają typ i inne nowe pola
          const updatedParameters = test.parameters.map(param => ({
            ...DEFAULT_PARAMETER,
            ...param,
            type: param.type || 'numeric',
            options: param.options || [],
            isRequired: param.isRequired !== false,
            precision: param.precision || 2,
            criticalParameter: param.criticalParameter || false
          }));
          
          setTestData({
            ...test,
            parameters: updatedParameters,
            autoFailOnCritical: test.autoFailOnCritical !== false,
            requirePhoto: test.requirePhoto || false
          });
        } catch (error) {
          showError('Błąd podczas pobierania testu: ' + error.message);
          console.error('Error fetching test:', error);
        } finally {
          setLoading(false);
        }
      };
      
      fetchTest();
    }
  }, [testId, showError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      // Walidacja
      for (const param of testData.parameters) {
        if (!param.name.trim()) {
          throw new Error('Wszystkie parametry muszą mieć nazwy');
        }
        
        if (param.type === 'select' && (!param.options || param.options.length === 0)) {
          throw new Error(`Parametr "${param.name}" typu lista wyboru musi mieć zdefiniowane opcje`);
        }
        
        if (param.type === 'numeric') {
          if (param.minValue && param.maxValue && parseFloat(param.minValue) > parseFloat(param.maxValue)) {
            throw new Error(`Dla parametru "${param.name}" wartość minimalna nie może być większa od maksymalnej`);
          }
        }
      }
      
      if (testId) {
        await updateTest(testId, testData, currentUser.uid);
        showSuccess('Test został zaktualizowany');
      } else {
        await createTest(testData, currentUser.uid);
        showSuccess('Test został utworzony');
      }
      navigate('/quality');
    } catch (error) {
      showError('Błąd podczas zapisywania testu: ' + error.message);
      console.error('Error saving test:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setTestData(prev => ({ ...prev, [name]: value }));
  };

  const handleSwitchChange = (name) => (e) => {
    setTestData(prev => ({ 
      ...prev, 
      [name]: e.target.checked 
    }));
  };

  const handleStatusChange = (e) => {
    setTestData(prev => ({ 
      ...prev, 
      status: e.target.checked ? 'Aktywny' : 'Nieaktywny' 
    }));
  };

  const handleParameterChange = (index, field, value) => {
    const updatedParameters = [...testData.parameters];
    updatedParameters[index] = {
      ...updatedParameters[index],
      [field]: value
    };
    
    // Jeśli zmieniamy typ, resetujemy niektóre pola
    if (field === 'type') {
      if (value === 'boolean' || value === 'text' || value === 'multiline') {
        updatedParameters[index].minValue = '';
        updatedParameters[index].maxValue = '';
        updatedParameters[index].unit = '';
      }
      
      if (value !== 'select') {
        updatedParameters[index].options = [];
      }
    }
    
    setTestData(prev => ({
      ...prev,
      parameters: updatedParameters
    }));
  };

  const handleOptionsChange = (index, options) => {
    handleParameterChange(index, 'options', options);
  };

  const addOption = (paramIndex) => {
    const updatedParameters = [...testData.parameters];
    const param = updatedParameters[paramIndex];
    param.options = [...(param.options || []), ''];
    
    setTestData(prev => ({
      ...prev,
      parameters: updatedParameters
    }));
  };

  const updateOption = (paramIndex, optionIndex, value) => {
    const updatedParameters = [...testData.parameters];
    const param = updatedParameters[paramIndex];
    const options = [...param.options];
    options[optionIndex] = value;
    
    param.options = options;
    
    setTestData(prev => ({
      ...prev,
      parameters: updatedParameters
    }));
  };

  const removeOption = (paramIndex, optionIndex) => {
    const updatedParameters = [...testData.parameters];
    const param = updatedParameters[paramIndex];
    const options = [...param.options];
    options.splice(optionIndex, 1);
    
    param.options = options;
    
    setTestData(prev => ({
      ...prev,
      parameters: updatedParameters
    }));
  };

  const addParameter = () => {
    setTestData(prev => ({
      ...prev,
      parameters: [...prev.parameters, { ...DEFAULT_PARAMETER }]
    }));
  };

  const removeParameter = (index) => {
    const updatedParameters = [...testData.parameters];
    updatedParameters.splice(index, 1);
    
    setTestData(prev => ({
      ...prev,
      parameters: updatedParameters.length ? updatedParameters : [{ ...DEFAULT_PARAMETER }]
    }));
  };

  if (loading) {
    return <div>Ładowanie testu...</div>;
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
          {testId ? 'Edycja testu jakościowego' : 'Nowy test jakościowy'}
        </Typography>
        <Button 
          variant="contained" 
          color="primary" 
          type="submit"
          startIcon={<SaveIcon />}
          disabled={saving}
        >
          {saving ? 'Zapisywanie...' : 'Zapisz'}
        </Button>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <TextField
              required
              label="Nazwa testu"
              name="name"
              value={testData.name}
              onChange={handleChange}
              fullWidth
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <FormControlLabel
                control={
                  <Switch 
                    checked={testData.status === 'Aktywny'} 
                    onChange={handleStatusChange} 
                    color="success"
                  />
                }
                label={testData.status === 'Aktywny' ? 'Test aktywny' : 'Test nieaktywny'}
              />
              <FormControlLabel
                control={
                  <Switch 
                    checked={testData.autoFailOnCritical} 
                    onChange={handleSwitchChange('autoFailOnCritical')} 
                    color="warning"
                  />
                }
                label="Automatycznie odrzucaj przy parametrach krytycznych"
              />
              <FormControlLabel
                control={
                  <Switch 
                    checked={testData.requirePhoto} 
                    onChange={handleSwitchChange('requirePhoto')} 
                    color="primary"
                  />
                }
                label={t('quality.requirePhoto')}
              />
            </Box>
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Opis"
              name="description"
              value={testData.description || ''}
              onChange={handleChange}
              fullWidth
              multiline
              rows={2}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Kategoria</InputLabel>
              <Select
                name="category"
                value={testData.category || ''}
                onChange={handleChange}
                label="Kategoria"
              >
                <MenuItem value="">Wybierz kategorię</MenuItem>
                <MenuItem value="Chemiczny">Chemiczny</MenuItem>
                <MenuItem value="Fizyczny">Fizyczny</MenuItem>
                <MenuItem value="Organoleptyczny">Organoleptyczny</MenuItem>
                <MenuItem value="Mikrobiologiczny">Mikrobiologiczny</MenuItem>
                <MenuItem value="Inny">Inny</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth>
              <InputLabel>Etap produkcji</InputLabel>
              <Select
                name="productionStage"
                value={testData.productionStage || ''}
                onChange={handleChange}
                label="Etap produkcji"
              >
                <MenuItem value="">Wybierz etap</MenuItem>
                <MenuItem value="Surowce">Surowce</MenuItem>
                <MenuItem value="Produkcja w toku">Produkcja w toku</MenuItem>
                <MenuItem value="Produkt końcowy">Produkt końcowy</MenuItem>
                <MenuItem value="Magazynowanie">Magazynowanie</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              label={t('quality.frequency')}
              name="frequency"
              value={testData.frequency || ''}
              onChange={handleChange}
              fullWidth
              placeholder={t('quality.frequencyPlaceholder')}
            />
          </Grid>
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Parametry testu</Typography>
          <Button 
            variant="outlined" 
            startIcon={<AddIcon />} 
            onClick={addParameter}
          >
            Dodaj parametr
          </Button>
        </Box>
        <Divider sx={{ mb: 2 }} />
        
        {testData.parameters.map((param, index) => (
          <Accordion key={index} sx={{ mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'space-between' }}>
                <Typography>
                  {param.name || `Parametr #${index + 1}`} 
                  {param.type && ` (${PARAMETER_TYPES.find(t => t.value === param.type)?.label || param.type})`}
                </Typography>
                {param.criticalParameter && (
                  <Chip label="Parametr krytyczny" color="error" size="small" sx={{ ml: 1 }} />
                )}
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    required
                    label="Nazwa parametru"
                    value={param.name}
                    onChange={(e) => handleParameterChange(index, 'name', e.target.value)}
                    fullWidth
                    placeholder="np. pH, Temperatura"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel>Typ parametru</InputLabel>
                    <Select
                      value={param.type}
                      onChange={(e) => handleParameterChange(index, 'type', e.target.value)}
                      label="Typ parametru"
                    >
                      {PARAMETER_TYPES.map(type => (
                        <MenuItem key={type.value} value={type.value}>{type.label}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                
                {param.type === 'numeric' && (
                  <>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        label="Jednostka"
                        value={param.unit || ''}
                        onChange={(e) => handleParameterChange(index, 'unit', e.target.value)}
                        fullWidth
                        placeholder="np. °C, %"
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        type="number"
                        label={t('quality.minValue')}
                        value={param.minValue || ''}
                        onChange={(e) => handleParameterChange(index, 'minValue', e.target.value)}
                        fullWidth
                        inputProps={{ step: 'any' }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        type="number"
                        label={t('quality.maxValue')}
                        value={param.maxValue || ''}
                        onChange={(e) => handleParameterChange(index, 'maxValue', e.target.value)}
                        fullWidth
                        inputProps={{ step: 'any' }}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <TextField
                        type="number"
                        label="Precyzja (liczba miejsc po przecinku)"
                        value={param.precision || 2}
                        onChange={(e) => handleParameterChange(index, 'precision', parseInt(e.target.value) || 0)}
                        fullWidth
                        inputProps={{ min: 0, max: 10 }}
                      />
                    </Grid>
                  </>
                )}
                
                {param.type === 'select' && (
                  <Grid item xs={12}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Opcje wyboru:</Typography>
                    <Box sx={{ mb: 1 }}>
                      {param.options && param.options.map((option, optIndex) => (
                        <Box key={optIndex} sx={{ display: 'flex', mb: 1 }}>
                          <TextField
                            value={option}
                            onChange={(e) => updateOption(index, optIndex, e.target.value)}
                            fullWidth
                            size="small"
                            placeholder={`Opcja ${optIndex + 1}`}
                          />
                          <IconButton 
                            color="error" 
                            onClick={() => removeOption(index, optIndex)}
                            size="small"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      ))}
                    </Box>
                    <Button 
                      startIcon={<AddIcon />} 
                      onClick={() => addOption(index)}
                      size="small"
                    >
                      Dodaj opcję
                    </Button>
                  </Grid>
                )}
                
                <Grid item xs={12}>
                  <TextField
                    label="Opis"
                    value={param.description || ''}
                    onChange={(e) => handleParameterChange(index, 'description', e.target.value)}
                    fullWidth
                    multiline
                    rows={2}
                    placeholder="Dodatkowe informacje, instrukcje pomiaru..."
                  />
                </Grid>
                
                <Grid item xs={12}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                      <FormControlLabel
                        control={
                          <Switch
                            checked={param.isRequired}
                            onChange={(e) => handleParameterChange(index, 'isRequired', e.target.checked)}
                            color="primary"
                          />
                        }
                        label="Wymagany"
                      />
                      <FormControlLabel
                        control={
                          <Switch
                            checked={param.criticalParameter}
                            onChange={(e) => handleParameterChange(index, 'criticalParameter', e.target.checked)}
                            color="error"
                          />
                        }
                        label={
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Typography sx={{ mr: 0.5 }}>Parametr krytyczny</Typography>
                            <Tooltip title="Parametr krytyczny powoduje automatyczne odrzucenie testu, jeśli jest poza zakresem (gdy włączona jest taka opcja dla testu).">
                              <InfoIcon fontSize="small" color="info" />
                            </Tooltip>
                          </Box>
                        }
                      />
                    </Box>
                    <Button 
                      variant="outlined" 
                      color="error" 
                      startIcon={<DeleteIcon />}
                      onClick={() => removeParameter(index)}
                      disabled={testData.parameters.length === 1}
                    >
                      Usuń parametr
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </AccordionDetails>
          </Accordion>
        ))}

        {testData.parameters.length === 0 && (
          <Typography variant="body2" align="center" sx={{ mt: 2 }}>
            Dodaj co najmniej jeden parametr do testu
          </Typography>
        )}
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Instrukcje wykonania testu</Typography>
        <TextField
          name="instructions"
          value={testData.instructions || ''}
          onChange={handleChange}
          fullWidth
          multiline
          rows={4}
          placeholder={t('quality.testInstructionsPlaceholder')}
        />
      </Paper>
    </Box>
  );
};

export default TestForm;