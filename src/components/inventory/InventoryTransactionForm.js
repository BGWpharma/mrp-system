// src/components/inventory/InventoryTransactionForm.js
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
  FormHelperText,
  Radio,
  RadioGroup,
  FormControlLabel,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  MenuItem,
  Select,
  InputLabel,
  Checkbox,
  FormGroup,
  Switch
} from '@mui/material';
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  ArrowUpward as ReceiveIcon,
  ArrowDownward as IssueIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl } from 'date-fns/locale';
import { getInventoryItemById, receiveInventory, issueInventory, getItemBatches, getAllWarehouses } from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { Timestamp } from 'firebase/firestore';

const InventoryTransactionForm = ({ itemId, transactionType, initialData }) => {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [batches, setBatches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  const isReceive = transactionType === 'receive';
  
  const [transactionData, setTransactionData] = useState({
    quantity: '',
    reason: '',
    reference: '',
    notes: '',
    unitPrice: '',
    warehouseId: '',
    moNumber: '',
    orderNumber: '',
    orderId: '',
    source: '',
    sourceId: ''
  });

  const [batchData, setBatchData] = useState({
    useBatch: isReceive, // Domyślnie włączone dla przyjęcia
    batchNumber: '',
    expiryDate: null,
    batchNotes: '',
    batchId: '', // Dla wydania - ID wybranej partii
    noExpiryDate: false // Nowe pole do oznaczenia braku terminu ważności
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (!itemId) {
          showError('Nie wybrano pozycji magazynowej');
          navigate('/inventory');
          return;
        }
        
        const [fetchedItem, warehousesList] = await Promise.all([
          getInventoryItemById(itemId),
          getAllWarehouses()
        ]);
        
        setItem(fetchedItem);
        setWarehouses(warehousesList);
        
        // Zastosuj początkoweowe dane, jeśli zostały przekazane
        if (initialData) {
          setTransactionData(prev => ({
            ...prev,
            quantity: initialData.quantity || prev.quantity,
            reason: initialData.reason || prev.reason,
            reference: initialData.reference || prev.reference,
            notes: initialData.notes || prev.notes,
            unitPrice: initialData.unitPrice ? Number(initialData.unitPrice) : prev.unitPrice,
            // Dodajemy nowe pola dla źródła
            moNumber: initialData.moNumber || prev.moNumber,
            orderNumber: initialData.orderNumber || prev.orderNumber,
            orderId: initialData.orderId || prev.orderId,
            source: initialData.source || prev.source,
            sourceId: initialData.sourceId || prev.sourceId,
            // Wykorzystujemy pierwszy magazyn jako domyślny, jeśli nie ma ustawionego
            warehouseId: prev.warehouseId || (warehousesList.length > 0 ? warehousesList[0].id : '')
          }));
          
          // Jeśli przekazano lotNumber, ustaw go w danych partii
          if (initialData.lotNumber) {
            setBatchData(prev => ({
              ...prev,
              batchNumber: initialData.lotNumber,
              batchNotes: initialData.notes || prev.batchNotes
            }));
          }
        } else if (warehousesList.length > 0) {
          // Ustaw domyślny magazyn, jeśli nie ma initialData
          setTransactionData(prev => ({
            ...prev,
            warehouseId: prev.warehouseId || warehousesList[0].id
          }));
        }
        
        // Pobierz partie dla wydania
        if (!isReceive && transactionData.warehouseId) {
          const fetchedBatches = await getItemBatches(itemId, transactionData.warehouseId);
          setBatches(fetchedBatches.filter(batch => batch.quantity > 0));
        }
      } catch (error) {
        showError('Błąd podczas pobierania danych: ' + error.message);
        console.error('Error fetching data:', error);
        navigate('/inventory');
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [itemId, navigate, showError, isReceive, transactionData.warehouseId, initialData]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setProcessing(true);
    
    try {
      if (!transactionData.quantity || parseFloat(transactionData.quantity) <= 0) {
        throw new Error('Ilość musi być większa od zera');
      }
      
      if (!transactionData.warehouseId) {
        throw new Error('Należy wybrać magazyn');
      }
      
      // Przygotuj dane transakcji
      const transactionPayload = {
        reason: transactionData.reason,
        reference: transactionData.reference,
        notes: transactionData.notes,
        warehouseId: transactionData.warehouseId,
        unitPrice: isReceive ? parseFloat(transactionData.unitPrice) || 0 : undefined
      };
      
      // Dodaj dodatkowe informacje o pochodzeniu jeśli dostępne
      if (transactionData.moNumber) {
        transactionPayload.moNumber = transactionData.moNumber;
      }
      
      if (transactionData.orderNumber) {
        transactionPayload.orderNumber = transactionData.orderNumber;
      }
      
      if (transactionData.orderId) {
        transactionPayload.orderId = transactionData.orderId;
      }
      
      if (transactionData.source) {
        transactionPayload.source = transactionData.source;
      }
      
      if (transactionData.sourceId) {
        transactionPayload.sourceId = transactionData.sourceId;
      }
      
      // Dodaj dane partii, jeśli włączone
      if (isReceive && batchData.useBatch) {
        if (!batchData.expiryDate && !batchData.noExpiryDate) {
          throw new Error('Data ważności jest wymagana lub zaznacz opcję "Brak terminu ważności"');
        }
        
        transactionPayload.batchNumber = batchData.batchNumber;
        if (!batchData.noExpiryDate) {
          transactionPayload.expiryDate = Timestamp.fromDate(batchData.expiryDate);
        } else {
          transactionPayload.noExpiryDate = true;
        }
        transactionPayload.batchNotes = batchData.batchNotes;
        
        // Jeśli nie ma własnych notatek dla partii, ale są dla transakcji,
        // wykorzystaj je również dla partii
        if (!transactionPayload.batchNotes && transactionData.notes) {
          transactionPayload.batchNotes = transactionData.notes;
        }
        
        // Dodaj oznaczenie partii jako lotNumber
        transactionPayload.lotNumber = batchData.batchNumber;
      } else if (!isReceive && batchData.useBatch && batchData.batchId) {
        transactionPayload.batchId = batchData.batchId;
      }
      
      if (isReceive) {
        await receiveInventory(itemId, transactionData.quantity, transactionPayload, currentUser.uid);
        showSuccess(`Przyjęto ${transactionData.quantity} ${item.unit} do magazynu`);
      } else {
        await issueInventory(itemId, transactionData.quantity, transactionPayload, currentUser.uid);
        showSuccess(`Wydano ${transactionData.quantity} ${item.unit} z magazynu`);
      }
      
      navigate('/inventory');
    } catch (error) {
      showError('Błąd podczas przetwarzania transakcji: ' + error.message);
      console.error('Error processing transaction:', error);
    } finally {
      setProcessing(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setTransactionData(prev => ({ ...prev, [name]: value }));
  };

  const handleBatchChange = (e) => {
    const { name, value, checked, type } = e.target;
    setBatchData(prev => ({ 
      ...prev, 
      [name]: type === 'checkbox' ? checked : value 
    }));
  };

  const handleDateChange = (date) => {
    setBatchData(prev => ({ ...prev, expiryDate: date }));
  };

  if (loading) {
    return <div>Ładowanie danych...</div>;
  }

  if (!item) {
    return <div>Nie znaleziono pozycji magazynowej</div>;
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/inventory')}
        >
          Powrót
        </Button>
        <Typography variant="h5">
          {isReceive ? 'Przyjęcie towaru' : 'Wydanie towaru'}
        </Typography>
        <Button 
          variant="contained" 
          color={isReceive ? 'success' : 'warning'} 
          type="submit"
          startIcon={isReceive ? <ReceiveIcon /> : <IssueIcon />}
          disabled={processing}
        >
          {processing ? 'Przetwarzanie...' : (isReceive ? 'Przyjmij' : 'Wydaj')}
        </Button>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Informacje o pozycji</Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <Typography variant="body1">
              <strong>Nazwa:</strong> {item.name}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body1">
              <strong>Kategoria:</strong> {item.category || 'Brak kategorii'}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body1">
              <strong>Aktualny stan:</strong> {item.quantity} {item.unit}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="body1">
              <strong>Lokalizacja:</strong> {item.location || 'Nie określono'}
            </Typography>
          </Grid>
          {item.description && (
            <Grid item xs={12}>
              <Typography variant="body1">
                <strong>Opis:</strong> {item.description}
              </Typography>
            </Grid>
          )}
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Szczegóły transakcji</Typography>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <FormControl fullWidth required>
              <InputLabel id="warehouse-label">Magazyn</InputLabel>
              <Select
                labelId="warehouse-label"
                name="warehouseId"
                value={transactionData.warehouseId}
                onChange={handleChange}
                label="Magazyn"
                error={!transactionData.warehouseId}
              >
                <MenuItem value="">
                  <em>Wybierz magazyn</em>
                </MenuItem>
                {warehouses.map((warehouse) => (
                  <MenuItem key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </MenuItem>
                ))}
              </Select>
              {!transactionData.warehouseId && (
                <FormHelperText error>Wybór magazynu jest wymagany</FormHelperText>
              )}
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              required
              label="Ilość"
              name="quantity"
              type="number"
              value={transactionData.quantity}
              onChange={handleChange}
              fullWidth
              inputProps={{ 
                min: 0.01, 
                step: "0.01" 
              }}
              error={isReceive ? false : (parseFloat(transactionData.quantity || 0) > item.quantity)}
              helperText={
                isReceive ? undefined : 
                (parseFloat(transactionData.quantity || 0) > item.quantity ? 
                  'Ilość do wydania przekracza dostępny stan magazynowy' : undefined)
              }
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <FormControl component="fieldset">
              <Typography variant="subtitle2" gutterBottom>Powód</Typography>
              <RadioGroup
                name="reason"
                value={transactionData.reason}
                onChange={handleChange}
                row
              >
                {isReceive ? (
                  <>
                    <FormControlLabel value="purchase" control={<Radio />} label="Zakup" />
                    <FormControlLabel value="return" control={<Radio />} label="Zwrot" />
                    <FormControlLabel value="production" control={<Radio />} label="Z produkcji" />
                    <FormControlLabel value="other" control={<Radio />} label="Inny" />
                  </>
                ) : (
                  <>
                    <FormControlLabel value="production" control={<Radio />} label="Do produkcji" />
                    <FormControlLabel value="sale" control={<Radio />} label="Sprzedaż" />
                    <FormControlLabel value="defect" control={<Radio />} label="Wada/Zniszczenie" />
                    <FormControlLabel value="other" control={<Radio />} label="Inny" />
                  </>
                )}
              </RadioGroup>
            </FormControl>
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Numer referencyjny"
              name="reference"
              value={transactionData.reference || ''}
              onChange={handleChange}
              fullWidth
              placeholder={isReceive ? "Nr faktury, zamówienia, itp." : "Nr zlecenia produkcyjnego, itp."}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              label="Notatki"
              name="notes"
              value={transactionData.notes || ''}
              onChange={handleChange}
              fullWidth
              multiline
              rows={3}
              placeholder="Dodatkowe informacje dotyczące transakcji..."
            />
          </Grid>
          {isReceive && (
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Cena jednostkowa (EUR)"
                name="unitPrice"
                type="number"
                value={transactionData.unitPrice}
                onChange={handleChange}
                inputProps={{ min: 0, step: 0.01 }}
                helperText="Cena za jednostkę, używana w kalkulacji kosztów receptur i produkcji. Ważne dla dokładnych obliczeń!"
                required
              />
            </Grid>
          )}
        </Grid>
      </Paper>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mb: 2,
          borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
          pb: 1
        }}>
          <Typography variant="h6">
            {isReceive ? 'Informacje o partii' : 'Wybór partii'}
          </Typography>
          <FormControlLabel 
            control={
              <Switch 
                checked={batchData.useBatch} 
                onChange={handleBatchChange}
                name="useBatch"
                color="primary"
                size="small"
              />
            } 
            label={
              <Typography variant="body2" color="text.secondary">
                {isReceive ? "Dodaj informacje o partii" : "Wybierz konkretną partię"}
              </Typography>
            }
          />
        </Box>

        {batchData.useBatch && (
          <Grid container spacing={3}>
            {isReceive ? (
              // Formularz dla przyjęcia
              <>
                <Grid item xs={12} sm={6}>
                  <TextField
                    label="Numer partii/LOT"
                    name="batchNumber"
                    value={batchData.batchNumber}
                    onChange={handleBatchChange}
                    fullWidth
                    placeholder="Numer partii od dostawcy lub zostaw puste dla auto-generacji"
                    helperText="Jeśli pole pozostanie puste, system automatycznie wygeneruje numer LOT"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth>
                    <InputLabel shrink id="expiry-date-label">Data ważności</InputLabel>
                    <Box sx={{ 
                      mt: 2,
                      display: 'flex', 
                      flexDirection: 'column'
                    }}>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={batchData.noExpiryDate}
                            onChange={(e) => {
                              const { checked } = e.target;
                              setBatchData(prev => ({ 
                                ...prev, 
                                noExpiryDate: checked,
                                expiryDate: checked ? null : prev.expiryDate 
                              }));
                            }}
                            name="noExpiryDate"
                            color="primary"
                          />
                        }
                        label={
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontWeight: batchData.noExpiryDate ? 'bold' : 'normal',
                              color: batchData.noExpiryDate ? 'text.primary' : 'text.secondary'  
                            }}
                          >
                            Brak terminu ważności
                          </Typography>
                        }
                        sx={{ 
                          mb: 1, 
                          p: 1, 
                          border: batchData.noExpiryDate ? '1px solid rgba(0, 0, 0, 0.23)' : 'none',
                          borderRadius: 1,
                          bgcolor: batchData.noExpiryDate ? 'rgba(0, 0, 0, 0.04)' : 'transparent'
                        }}
                      />
                      {!batchData.noExpiryDate && (
                        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                          <DatePicker
                            label="Wybierz datę"
                            value={batchData.expiryDate}
                            onChange={handleDateChange}
                            renderInput={(params) => 
                              <TextField 
                                {...params} 
                                fullWidth
                                variant="outlined"
                                required
                                error={!batchData.expiryDate && !batchData.noExpiryDate}
                                helperText={!batchData.expiryDate && !batchData.noExpiryDate ? "Data ważności jest wymagana" : ""}
                              />
                            }
                            disablePast
                          />
                        </LocalizationProvider>
                      )}
                    </Box>
                    {batchData.noExpiryDate && (
                      <FormHelperText>
                        Produkt nie będzie śledzony pod kątem terminu przydatności. 
                        Zalecane tylko dla przedmiotów bez określonego terminu ważności.
                      </FormHelperText>
                    )}
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    label="Dodatkowe informacje o partii"
                    name="batchNotes"
                    value={batchData.batchNotes}
                    onChange={handleBatchChange}
                    fullWidth
                    multiline
                    rows={2}
                    placeholder="Dodatkowe informacje o partii, certyfikaty, itp."
                  />
                </Grid>
              </>
            ) : (
              // Formularz dla wydania
              <Grid item xs={12}>
                <FormControl fullWidth required error={batchData.useBatch && !batchData.batchId}>
                  <InputLabel>Wybierz partię</InputLabel>
                  <Select
                    name="batchId"
                    value={batchData.batchId}
                    onChange={handleBatchChange}
                    label="Wybierz partię"
                  >
                    {batches.length === 0 ? (
                      <MenuItem value="" disabled>Brak dostępnych partii</MenuItem>
                    ) : (
                      batches.map(batch => {
                        const expiryDate = batch.expiryDate instanceof Timestamp 
                          ? batch.expiryDate.toDate() 
                          : new Date(batch.expiryDate);
                        
                        const isExpired = expiryDate < new Date();
                        const expiryDateFormatted = expiryDate.toLocaleDateString('pl-PL');
                        
                        return (
                          <MenuItem 
                            key={batch.id} 
                            value={batch.id}
                            disabled={batch.quantity < parseFloat(transactionData.quantity || 0)}
                          >
                            {batch.batchNumber ? `${batch.batchNumber} - ` : ''}
                            Ilość: {batch.quantity} {item.unit} | 
                            Ważne do: {expiryDateFormatted}
                            {isExpired ? ' (PRZETERMINOWANE)' : ''}
                          </MenuItem>
                        );
                      })
                    )}
                  </Select>
                  {batchData.useBatch && !batchData.batchId && (
                    <FormHelperText>Wybierz partię do wydania</FormHelperText>
                  )}
                </FormControl>
                {batches.length > 0 && !batchData.batchId && (
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Partie są sortowane według daty ważności (FEFO - First Expired, First Out)
                  </Typography>
                )}
              </Grid>
            )}
          </Grid>
        )}
        
        {!batchData.useBatch && !isReceive && (
          <Typography variant="body2" color="text.secondary">
            Towar zostanie wydany automatycznie według zasady FEFO (First Expired, First Out) - 
            najpierw wydawane są partie z najkrótszym terminem ważności.
          </Typography>
        )}
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
        <Button 
          sx={{ mr: 2 }}
          onClick={() => navigate('/inventory')}
        >
          Anuluj
        </Button>
        <Button 
          variant="contained" 
          color={isReceive ? 'success' : 'warning'} 
          type="submit"
          startIcon={isReceive ? <ReceiveIcon /> : <IssueIcon />}
          disabled={processing}
        >
          {processing ? 'Przetwarzanie...' : (isReceive ? 'Przyjmij' : 'Wydaj')}
        </Button>
      </Box>
    </Box>
  );
};

export default InventoryTransactionForm;