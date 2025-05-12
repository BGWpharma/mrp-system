import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Box,
  TextField,
  Button,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Grid,
  Divider,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import { getCurrentCounters, updateCounters, getCustomerNames } from '../../services/counterService';

/**
 * Komponent do edycji liczników systemowych
 */
const CounterEditor = () => {
  const [counterData, setCounterData] = useState(null);
  const [counterId, setCounterId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [editResult, setEditResult] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [customerNames, setCustomerNames] = useState({});
  
  // Załaduj liczniki przy pierwszym renderze
  useEffect(() => {
    fetchCounters();
    fetchCustomerNames();
  }, []);
  
  // Pobierz aktualne liczniki
  const fetchCounters = async () => {
    try {
      setIsLoading(true);
      setEditResult(null);
      
      const result = await getCurrentCounters();
      setCounterData(result.data);
      setCounterId(result.id);
    } catch (error) {
      console.error('Błąd podczas pobierania liczników:', error);
      setEditResult({
        success: false,
        message: 'Nie udało się pobrać liczników: ' + error.message
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Pobiera dane klientów
  const fetchCustomerNames = async () => {
    try {
      const names = await getCustomerNames();
      setCustomerNames(names);
    } catch (error) {
      console.error('Błąd podczas pobierania danych klientów:', error);
    }
  };
  
  // Obsługa zmiany wartości w polach formularza
  const handleCounterChange = (counterKey, value) => {
    const numberValue = parseInt(value, 10);
    
    if (isNaN(numberValue) || numberValue < 1) {
      // Wartość musi być liczbą całkowitą większą od 0
      return;
    }
    
    setCounterData({
      ...counterData,
      [counterKey]: numberValue
    });
  };
  
  // Obsługa zmiany wartości licznika klienta
  const handleCustomerCounterChange = (customerId, value) => {
    const numberValue = parseInt(value, 10);
    
    if (isNaN(numberValue) || numberValue < 1) {
      // Wartość musi być liczbą całkowitą większą od 0
      return;
    }
    
    setCounterData({
      ...counterData,
      customerCounters: {
        ...counterData.customerCounters,
        [customerId]: numberValue
      }
    });
  };
  
  // Usuń licznik klienta
  const handleRemoveCustomerCounter = (customerId) => {
    const newCustomerCounters = { ...counterData.customerCounters };
    delete newCustomerCounters[customerId];
    
    setCounterData({
      ...counterData,
      customerCounters: newCustomerCounters
    });
  };
  
  // Zapisz zmiany
  const handleSaveCounters = async () => {
    try {
      setIsLoading(true);
      setEditResult(null);
      
      await updateCounters(counterId, counterData);
      
      setEditResult({
        success: true,
        message: 'Zapisano zmiany w licznikach.'
      });
      
      // Odśwież dane po zapisie
      await fetchCounters();
    } catch (error) {
      console.error('Błąd podczas aktualizacji liczników:', error);
      setEditResult({
        success: false,
        message: 'Błąd podczas zapisywania liczników: ' + error.message
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Resetowanie liczników
  const handleResetCounters = async () => {
    setConfirmOpen(false);
    try {
      setIsLoading(true);
      setEditResult(null);
      
      const defaultCounters = {
        MO: 1,
        PO: 1,
        CO: 1,
        LOT: 1,
        customerCounters: {}
      };
      
      await updateCounters(counterId, defaultCounters);
      
      setEditResult({
        success: true,
        message: 'Liczniki zostały zresetowane.'
      });
      
      // Odśwież dane po zapisie
      await fetchCounters();
    } catch (error) {
      console.error('Błąd podczas resetowania liczników:', error);
      setEditResult({
        success: false,
        message: 'Błąd podczas resetowania liczników: ' + error.message
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  // Pobierz nazwę klienta na podstawie ID
  const getCustomerName = (customerId) => {
    return customerNames[customerId] || `Klient ID: ${customerId}`;
  };
  
  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Edycja liczników systemowych
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Tutaj możesz edytować liczniki używane do generowania numerów dokumentów w systemie.
          Zmiana wartości liczników wpłynie na numery nowych dokumentów. Zachowaj ostrożność!
        </Typography>
        
        {editResult && (
          <Alert severity={editResult.success ? "success" : "error"} sx={{ my: 2 }}>
            {editResult.message}
          </Alert>
        )}
        
        {isLoading && !counterData ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
            <CircularProgress />
          </Box>
        ) : counterData ? (
          <>
            <Typography variant="subtitle1" gutterBottom sx={{ mt: 2, fontWeight: 'bold' }}>
              Globalne liczniki dokumentów
            </Typography>
            
            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Zlecenia produkcyjne (MO)"
                  fullWidth
                  value={counterData.MO}
                  onChange={(e) => handleCounterChange('MO', e.target.value)}
                  type="number"
                  InputProps={{ inputProps: { min: 1 } }}
                  helperText="Format: MO00001"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Zamówienia zakupu (PO)"
                  fullWidth
                  value={counterData.PO}
                  onChange={(e) => handleCounterChange('PO', e.target.value)}
                  type="number"
                  InputProps={{ inputProps: { min: 1 } }}
                  helperText="Format: PO00001"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Zamówienia klientów (CO)"
                  fullWidth
                  value={counterData.CO}
                  onChange={(e) => handleCounterChange('CO', e.target.value)}
                  type="number"
                  InputProps={{ inputProps: { min: 1 } }}
                  helperText="Format: CO00001"
                />
              </Grid>
              <Grid item xs={12} sm={6} md={3}>
                <TextField
                  label="Partie magazynowe (LOT)"
                  fullWidth
                  value={counterData.LOT}
                  onChange={(e) => handleCounterChange('LOT', e.target.value)}
                  type="number"
                  InputProps={{ inputProps: { min: 1 } }}
                  helperText="Format: LOT00001"
                />
              </Grid>
            </Grid>
            
            <Divider sx={{ my: 2 }} />
            
            <Accordion
              expanded={expanded}
              onChange={() => setExpanded(!expanded)}
              sx={{ mb: 2 }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>
                  Liczniki zamówień klientów ({Object.keys(counterData.customerCounters || {}).length})
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                {Object.keys(counterData.customerCounters || {}).length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    Brak indywidualnych liczników dla klientów.
                  </Typography>
                ) : (
                  <Grid container spacing={2}>
                    {Object.entries(counterData.customerCounters || {}).map(([clientId, value]) => (
                      <Grid item xs={12} sm={6} md={4} key={clientId}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <TextField
                            label={getCustomerName(clientId)}
                            value={value}
                            onChange={(e) => handleCustomerCounterChange(clientId, e.target.value)}
                            type="number"
                            InputProps={{ inputProps: { min: 1 } }}
                            sx={{ flexGrow: 1 }}
                          />
                          <IconButton
                            color="error"
                            onClick={() => handleRemoveCustomerCounter(clientId)}
                            sx={{ ml: 1 }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      </Grid>
                    ))}
                  </Grid>
                )}
              </AccordionDetails>
            </Accordion>
          </>
        ) : (
          <Alert severity="error">
            Nie udało się załadować liczników. Spróbuj odświeżyć stronę.
          </Alert>
        )}
      </CardContent>
      <CardActions sx={{ justifyContent: 'space-between', px: 2, pb: 2 }}>
        <Box>
          <Button 
            variant="outlined" 
            color="error"
            onClick={() => setConfirmOpen(true)}
            disabled={isLoading || !counterData}
            startIcon={<DeleteIcon />}
          >
            Resetuj liczniki
          </Button>
        </Box>
        <Box>
          <Button
            variant="outlined"
            color="primary"
            onClick={() => {
              fetchCounters();
              fetchCustomerNames();
            }}
            disabled={isLoading}
            sx={{ mr: 1 }}
          >
            Odśwież
          </Button>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSaveCounters}
            disabled={isLoading || !counterData}
            startIcon={isLoading ? <CircularProgress size={20} /> : <SaveIcon />}
          >
            {isLoading ? 'Zapisywanie...' : 'Zapisz zmiany'}
          </Button>
        </Box>
      </CardActions>
      
      {/* Dialog potwierdzenia resetowania liczników */}
      <Dialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
      >
        <DialogTitle>Potwierdź resetowanie liczników</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz zresetować wszystkie liczniki do wartości początkowej (1)?
            Ta operacja jest nieodwracalna i może spowodować problemy z numeracją dokumentów.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} color="primary">
            Anuluj
          </Button>
          <Button onClick={handleResetCounters} color="error" autoFocus>
            Resetuj liczniki
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
};

export default CounterEditor;
