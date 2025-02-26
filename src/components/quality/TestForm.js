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
  FormControlLabel
} from '@mui/material';
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { createTest, updateTest, getTestById } from '../../services/qualityService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';

const DEFAULT_PARAMETER = { 
  name: '', 
  unit: '', 
  minValue: '', 
  maxValue: '', 
  description: '' 
};

const TestForm = ({ testId }) => {
  const [loading, setLoading] = useState(!!testId);
  const [saving, setSaving] = useState(false);
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  const [testData, setTestData] = useState({
    name: '',
    description: '',
    category: '',
    productionStage: '',
    parameters: [{ ...DEFAULT_PARAMETER }],
    instructions: '',
    frequency: '',
    status: 'Aktywny'
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
          
          setTestData(test);
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
              label="Częstotliwość"
              name="frequency"
              value={testData.frequency || ''}
              onChange={handleChange}
              fullWidth
              placeholder="np. Co partię, Codziennie, Co tydzień"
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
        
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nazwa parametru</TableCell>
              <TableCell>Jednostka</TableCell>
              <TableCell>Min. wartość</TableCell>
              <TableCell>Maks. wartość</TableCell>
              <TableCell>Opis</TableCell>
              <TableCell width="60px">Akcje</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {testData.parameters.map((param, index) => (
              <TableRow key={index}>
                <TableCell>
                  <TextField
                    required
                    value={param.name}
                    onChange={(e) => handleParameterChange(index, 'name', e.target.value)}
                    fullWidth
                    placeholder="np. pH, Temperatura"
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    value={param.unit || ''}
                    onChange={(e) => handleParameterChange(index, 'unit', e.target.value)}
                    fullWidth
                    placeholder="np. °C, %"
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    value={param.minValue || ''}
                    onChange={(e) => handleParameterChange(index, 'minValue', e.target.value)}
                    fullWidth
                    size="small"
                    inputProps={{ step: 'any' }}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    type="number"
                    value={param.maxValue || ''}
                    onChange={(e) => handleParameterChange(index, 'maxValue', e.target.value)}
                    fullWidth
                    size="small"
                    inputProps={{ step: 'any' }}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    value={param.description || ''}
                    onChange={(e) => handleParameterChange(index, 'description', e.target.value)}
                    fullWidth
                    placeholder="Dodatkowe informacje"
                    size="small"
                  />
                </TableCell>
                <TableCell>
                  <IconButton 
                    color="error" 
                    onClick={() => removeParameter(index)}
                    disabled={testData.parameters.length === 1}
                    size="small"
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

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
          placeholder="Szczegółowe instrukcje jak przeprowadzić test..."
        />
      </Paper>
    </Box>
  );
};

export default TestForm;