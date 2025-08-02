import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  CircularProgress,
  InputAdornment,
  FormControl,
  FormControlLabel,
  Checkbox,
  InputLabel,
  FormHelperText,
  Select,
  MenuItem,
  Autocomplete
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';
import { ArrowBack as ArrowBackIcon, Save as SaveIcon, ShoppingCart as ShoppingCartIcon } from '@mui/icons-material';
import { getInventoryItemById, getItemBatches, updateBatch, getInventoryBatch } from '../../services/inventory';
import { getLimitedPurchaseOrdersForBatchEdit, getPurchaseOrderById } from '../../services/purchaseOrderService';
import { updateBatchesForPurchaseOrder } from '../../services/purchaseOrderService';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';

const BatchEditForm = () => {
  const { id, batchId } = useParams();
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();
  const { currentUser } = useAuth();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [item, setItem] = useState(null);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [loadingPurchaseOrders, setLoadingPurchaseOrders] = useState(false);
  const [selectedPurchaseOrder, setSelectedPurchaseOrder] = useState(null);
  const [selectedPOItemId, setSelectedPOItemId] = useState('');
  const [purchaseOrdersLoaded, setPurchaseOrdersLoaded] = useState(false);

  const [batchData, setBatchData] = useState({
    batchNumber: '',
    lotNumber: '',
    expiryDate: null,
    noExpiryDate: false,
    notes: '',
    unitPrice: '',
    quantity: '',
    initialQuantity: '',
    itemId: '',
    purchaseOrderDetails: null
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Określ ID partii - może być w parametrze batchId lub id (jeśli wchodzimy bezpośrednio ze ścieżki /inventory/batch/:batchId)
        const actualBatchId = batchId || id;
        
        if (!actualBatchId) {
          showError('Brak ID partii');
          navigate('/inventory');
          return;
        }
        
        // Jeśli mamy zarówno id produktu jak i batchId, używamy zwykłej ścieżki
        if (id && batchId) {
          // Pobierz dane pozycji magazynowej
          const itemData = await getInventoryItemById(id);
          setItem(itemData);
          
          // Pobierz partie dla tej pozycji
          const batches = await getItemBatches(id);
          
          // Znajdź konkretną partię
          const batch = batches.find(b => b.id === batchId);
          
          if (!batch) {
            showError('Nie znaleziono partii o podanym ID');
            navigate(`/inventory/${id}/batches`);
            return;
          }
          
          // Sprawdź, czy partia ma datę ważności
          const hasExpiryDate = batch.expiryDate !== null && batch.expiryDate !== undefined;
          
          // Ustaw dane partii w formularzu
          setBatchData({
            batchNumber: batch.batchNumber || '',
            lotNumber: batch.lotNumber || '',
            expiryDate: hasExpiryDate ? (batch.expiryDate.toDate ? batch.expiryDate.toDate() : new Date(batch.expiryDate)) : null,
            noExpiryDate: !hasExpiryDate,
            notes: batch.notes || '',
            unitPrice: batch.unitPrice || '',
            quantity: batch.quantity || 0,
            initialQuantity: batch.initialQuantity || 0,
            itemId: batch.itemId || id,
            purchaseOrderDetails: batch.purchaseOrderDetails || null,
            baseUnitPrice: batch.baseUnitPrice || batch.unitPrice || '',
            additionalCostPerUnit: batch.additionalCostPerUnit || 0
          });

          // Jeśli partia ma powiązanie z PO, pobierz szczegóły PO
          if (batch.purchaseOrderDetails && batch.purchaseOrderDetails.id) {
            try {
              const poData = await getPurchaseOrderById(batch.purchaseOrderDetails.id);
              setSelectedPurchaseOrder(poData);
              if (batch.purchaseOrderDetails.itemPoId) {
                setSelectedPOItemId(batch.purchaseOrderDetails.itemPoId);
              }
            } catch (error) {
              console.error('Błąd podczas pobierania szczegółów PO:', error);
            }
          }
        } else {
          // Jeśli mamy tylko ID partii (ze ścieżki /inventory/batch/:batchId)
          // Pobierz dane partii bezpośrednio
          const batch = await getInventoryBatch(actualBatchId);
          
          if (!batch) {
            showError('Nie znaleziono partii o podanym ID');
            navigate('/inventory');
            return;
          }
          
          // Sprawdź, czy partia ma datę ważności
          const hasExpiryDate = batch.expiryDate !== null && batch.expiryDate !== undefined;
          
          // Ustaw dane partii w formularzu
          setBatchData({
            batchNumber: batch.batchNumber || '',
            lotNumber: batch.lotNumber || '',
            expiryDate: hasExpiryDate ? (batch.expiryDate.toDate ? batch.expiryDate.toDate() : new Date(batch.expiryDate)) : null,
            noExpiryDate: !hasExpiryDate,
            notes: batch.notes || '',
            unitPrice: batch.unitPrice || '',
            quantity: batch.quantity || 0,
            initialQuantity: batch.initialQuantity || 0,
            itemId: batch.itemId,
            purchaseOrderDetails: batch.purchaseOrderDetails || null,
            baseUnitPrice: batch.baseUnitPrice || batch.unitPrice || '',
            additionalCostPerUnit: batch.additionalCostPerUnit || 0
          });

          // Jeśli partia ma powiązanie z PO, pobierz szczegóły PO
          if (batch.purchaseOrderDetails && batch.purchaseOrderDetails.id) {
            try {
              const poData = await getPurchaseOrderById(batch.purchaseOrderDetails.id);
              setSelectedPurchaseOrder(poData);
              if (batch.purchaseOrderDetails.itemPoId) {
                setSelectedPOItemId(batch.purchaseOrderDetails.itemPoId);
              }
            } catch (error) {
              console.error('Błąd podczas pobierania szczegółów PO:', error);
            }
          }
          
          // Jeśli mamy itemId w partii, pobierz dane produktu
          if (batch.itemId) {
            const itemData = await getInventoryItemById(batch.itemId);
            setItem(itemData);
          }
        }

        // USUNIĘTO: Pobieranie zamówień zakupowych na początku
        // Będą ładowane dopiero gdy użytkownik kliknie w pole Autocomplete
        
      } catch (error) {
        showError('Błąd podczas pobierania danych: ' + error.message);
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [id, batchId, navigate, showError]);

  // Nowa funkcja do lazy loading zamówień zakupowych
  const loadPurchaseOrdersIfNeeded = async () => {
    if (!purchaseOrdersLoaded && !loadingPurchaseOrders) {
      setLoadingPurchaseOrders(true);
      try {
        const poList = await getLimitedPurchaseOrdersForBatchEdit();
        setPurchaseOrders(poList);
        setPurchaseOrdersLoaded(true);
      } catch (error) {
        console.error('Błąd podczas pobierania listy zamówień zakupowych:', error);
      } finally {
        setLoadingPurchaseOrders(false);
      }
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setBatchData(prev => ({ ...prev, [name]: value }));
  };

  const handleBaseUnitPriceChange = (e) => {
    const value = e.target.value;
    
    // Aktualizujemy cenę bazową
    const baseUnitPrice = value ? parseFloat(value) : 0;
    
    // Jeśli mamy dodatkowy koszt na jednostkę, aktualizujemy też cenę końcową
    if (batchData.additionalCostPerUnit !== undefined) {
      const additionalCost = parseFloat(batchData.additionalCostPerUnit) || 0;
      const newUnitPrice = baseUnitPrice + additionalCost;
      
      // Aktualizujemy oba pola
      setBatchData(prev => ({ 
        ...prev, 
        baseUnitPrice: value,
        unitPrice: newUnitPrice.toString()
      }));
    } else {
      // Jeśli nie ma dodatkowego kosztu, cena bazowa = cena końcowa
      setBatchData(prev => ({ 
        ...prev, 
        baseUnitPrice: value,
        unitPrice: value
      }));
    }
  };

  const handleDateChange = (date) => {
    setBatchData(prev => ({ ...prev, expiryDate: date }));
  };

  const handleNoExpiryDateChange = (e) => {
    const { checked } = e.target;
    setBatchData(prev => ({ 
      ...prev, 
      noExpiryDate: checked,
      expiryDate: checked ? null : prev.expiryDate 
    }));
  };

  const handlePurchaseOrderChange = async (event, newValue) => {
    setSelectedPurchaseOrder(newValue);
    setSelectedPOItemId(''); // Reset wybranej pozycji PO
  };

  const handlePOItemChange = (event) => {
    setSelectedPOItemId(event.target.value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      setSaving(true);
      
      // Walidacja
      if (batchData.unitPrice && isNaN(parseFloat(batchData.unitPrice))) {
        throw new Error('Cena jednostkowa musi być liczbą');
      }
      
      if (batchData.quantity && isNaN(parseFloat(batchData.quantity))) {
        throw new Error('Ilość musi być liczbą');
      }
      
      if (parseFloat(batchData.quantity) < 0) {
        throw new Error('Ilość nie może być ujemna');
      }
      
      // Przygotuj dane PO do aktualizacji
      let purchaseOrderDetails = null;
      if (selectedPurchaseOrder) {
        purchaseOrderDetails = {
          id: selectedPurchaseOrder.id,
          number: selectedPurchaseOrder.number || null,
          status: selectedPurchaseOrder.status || null,
          supplier: selectedPurchaseOrder.supplier ? {
            id: selectedPurchaseOrder.supplier.id || null,
            name: selectedPurchaseOrder.supplier.name || null,
            code: selectedPurchaseOrder.supplier.code || null
          } : null,
          orderDate: selectedPurchaseOrder.orderDate || null,
          deliveryDate: selectedPurchaseOrder.expectedDeliveryDate || selectedPurchaseOrder.deliveryDate || null,
          itemPoId: selectedPOItemId || null
        };
      }

      // Przygotuj dane do aktualizacji
      const updateData = {
        batchNumber: batchData.batchNumber,
        lotNumber: batchData.lotNumber,
        expiryDate: batchData.noExpiryDate ? null : batchData.expiryDate,
        notes: batchData.notes,
        unitPrice: batchData.unitPrice ? parseFloat(batchData.unitPrice) : 0,
        quantity: batchData.quantity ? parseFloat(batchData.quantity) : 0,
        initialQuantity: batchData.initialQuantity ? parseFloat(batchData.initialQuantity) : 0,
        purchaseOrderDetails: purchaseOrderDetails,
        // Zapisujemy również wartość baseUnitPrice
        baseUnitPrice: batchData.baseUnitPrice ? parseFloat(batchData.baseUnitPrice) : 0,
        // Zachowujemy additionalCostPerUnit jeśli istnieje
        ...(batchData.additionalCostPerUnit !== undefined && { 
          additionalCostPerUnit: parseFloat(batchData.additionalCostPerUnit) || 0 
        })
      };
      
      // Określ ID partii - może być w parametrze batchId lub id
      const actualBatchId = batchId || id;
      
      // Aktualizuj partię
      await updateBatch(actualBatchId, updateData, currentUser.uid);
      
      // Jeśli wybrano PO, aktualizuj również ceny bazując na dodatkowych kosztach PO
      if (purchaseOrderDetails && purchaseOrderDetails.id) {
        await updateBatchesForPurchaseOrder(purchaseOrderDetails.id, currentUser.uid);
      }
      
      showSuccess('Partia została zaktualizowana');
      
      // Nawiguj z powrotem - albo do listy partii produktu, albo do inwentarza głównego
      if (id && batchId) {
        navigate(`/inventory/${id}/batches`);
      } else if (batchData.itemId) {
        navigate(`/inventory/${batchData.itemId}/batches`);
      } else {
        navigate('/inventory');
      }
    } catch (error) {
      showError('Błąd podczas aktualizacji partii: ' + error.message);
      console.error('Error updating batch:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    // Wróć do odpowiedniej strony w zależności od tego, z której ścieżki przyszliśmy
    if (id && batchId) {
      navigate(`/inventory/${id}/batches`);
    } else if (batchData.itemId) {
      // Przekieruj do listy partii produktu zamiast do edycji
      navigate(`/inventory/${batchData.itemId}/batches`);
    } else {
      navigate('/inventory');
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
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={handleBack}
          >
            Powrót
          </Button>
          <Typography variant="h5">
            Edycja partii: {item?.name || 'Partia nr ' + (batchData.lotNumber || batchData.batchNumber)}
          </Typography>
          <Button 
            variant="contained" 
            color="primary" 
            type="submit"
            startIcon={<SaveIcon />}
            disabled={saving}
          >
            {saving ? 'Zapisywanie...' : 'Zapisz zmiany'}
          </Button>
        </Box>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Dane partii</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Numer partii"
                name="batchNumber"
                value={batchData.batchNumber}
                onChange={handleChange}
                margin="normal"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Numer LOT"
                name="lotNumber"
                value={batchData.lotNumber}
                onChange={handleChange}
                margin="normal"
                disabled // Numer LOT nie powinien być edytowalny
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth margin="normal">
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
                        onChange={handleNoExpiryDateChange}
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
                    <DatePicker
                      label="Wybierz datę"
                      value={batchData.expiryDate}
                      onChange={handleDateChange}
                      format="dd-MM-yyyy"
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          margin: 'normal'
                        }
                      }}
                    />
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
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Cena bazowa (EUR)"
                name="baseUnitPrice"
                type="number"
                value={batchData.baseUnitPrice || ''}
                onChange={handleBaseUnitPriceChange}
                margin="normal"
                InputProps={{
                  startAdornment: <InputAdornment position="start">EUR</InputAdornment>,
                  inputProps: { min: 0, step: 0.0001 }
                }}
                helperText="Cena podstawowa bez dodatkowych kosztów"
              />
            </Grid>
            {batchData.additionalCostPerUnit > 0 && (
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Cena jednostkowa (EUR)"
                  type="number"
                  value={batchData.unitPrice || ''}
                  margin="normal"
                  InputProps={{
                    startAdornment: <InputAdornment position="start">EUR</InputAdornment>,
                    readOnly: true
                  }}
                  disabled
                  helperText={`Cena końcowa (baza + dodatkowy koszt: ${parseFloat(batchData.additionalCostPerUnit).toFixed(4)} EUR)`}
                />
              </Grid>
            )}
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Ilość"
                name="quantity"
                type="number"
                value={batchData.quantity}
                onChange={handleChange}
                margin="normal"
                InputProps={{
                  endAdornment: <InputAdornment position="end">{item?.unit || 'szt.'}</InputAdornment>,
                  inputProps: { min: 0, step: 0.01 }
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                fullWidth
                label="Wartość do wyliczeń PO"
                name="initialQuantity"
                type="number"
                value={batchData.initialQuantity}
                onChange={handleChange}
                margin="normal"
                InputProps={{
                  endAdornment: <InputAdornment position="end">{item?.unit || 'szt.'}</InputAdornment>,
                  inputProps: { min: 0, step: 0.01 }
                }}
                helperText="Ilość używana do kalkulacji kosztów w zamówieniu zakupowym"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Notatki"
                name="notes"
                value={batchData.notes}
                onChange={handleChange}
                margin="normal"
                multiline
                rows={4}
              />
            </Grid>
          </Grid>
        </Paper>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <ShoppingCartIcon sx={{ mr: 1 }} color="primary" />
            Powiązanie z zamówieniem zakupowym (PO)
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Powiąż tę partię z zamówieniem zakupowym, aby automatycznie uwzględnić dodatkowe koszty w cenie jednostkowej.
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <Autocomplete
                options={purchaseOrders || []}
                getOptionLabel={(option) => `${option.number || 'Bez numeru'} - ${option.supplier?.name || 'Dostawca nieznany'}`}
                isOptionEqualToValue={(option, value) => option.id === value.id}
                value={selectedPurchaseOrder}
                onChange={handlePurchaseOrderChange}
                loading={loadingPurchaseOrders}
                onOpen={loadPurchaseOrdersIfNeeded}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Wybierz zamówienie zakupowe"
                    margin="normal"
                    fullWidth
                    helperText={loadingPurchaseOrders ? "Ładowanie zamówień..." : "Wybierz PO, z którym chcesz powiązać tę partię"}
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {loadingPurchaseOrders ? <CircularProgress color="inherit" size={20} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
            </Grid>
            
            {selectedPurchaseOrder && selectedPurchaseOrder.items && selectedPurchaseOrder.items.length > 0 && (
              <Grid item xs={12}>
                <FormControl fullWidth margin="normal">
                  <InputLabel id="po-item-select-label">Wybierz pozycję z zamówienia</InputLabel>
                  <Select
                    labelId="po-item-select-label"
                    value={selectedPOItemId}
                    onChange={handlePOItemChange}
                    label="Wybierz pozycję z zamówienia"
                  >
                    {selectedPurchaseOrder.items.map((item, index) => (
                      <MenuItem key={item.id || `item-${index}`} value={item.id || `item-${index}`}>
                        {item.name} - {item.quantity} {item.unit || 'szt.'} - {item.unitPrice} {selectedPurchaseOrder.currency || 'EUR'}
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    Wybierz konkretną pozycję z zamówienia, aby dokładnie śledzić pochodzenie materiału
                  </FormHelperText>
                </FormControl>
              </Grid>
            )}
            
            {batchData.purchaseOrderDetails && (
              <Grid item xs={12}>
                <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Aktualne powiązanie z PO:
                  </Typography>
                  <Typography variant="body2">
                    <strong>Numer PO:</strong> {batchData.purchaseOrderDetails.number || 'Nieznany'}
                  </Typography>
                  {batchData.purchaseOrderDetails.supplier && (
                    <Typography variant="body2">
                      <strong>Dostawca:</strong> {batchData.purchaseOrderDetails.supplier.name || 'Nieznany'}
                    </Typography>
                  )}
                  {batchData.baseUnitPrice !== undefined && batchData.additionalCostPerUnit !== undefined && (
                    <>
                      <Typography variant="body2">
                        <strong>Cena bazowa:</strong> {parseFloat(batchData.baseUnitPrice).toFixed(4)} EUR
                      </Typography>
                      <Typography variant="body2">
                        <strong>Dodatkowy koszt:</strong> {parseFloat(batchData.additionalCostPerUnit).toFixed(4)} EUR / szt.
                      </Typography>
                      <Typography variant="body2">
                        <strong>Cena całkowita:</strong> {parseFloat(batchData.unitPrice).toFixed(4)} EUR
                      </Typography>
                    </>
                  )}
                  {batchData.purchaseOrderDetails.id && (
                    <Button 
                      variant="outlined" 
                      size="small" 
                      component={Link}
                      to={`/purchase-orders/${batchData.purchaseOrderDetails.id}`}
                      sx={{ mt: 1 }}
                    >
                      Zobacz PO
                    </Button>
                  )}
                </Box>
              </Grid>
            )}
          </Grid>
        </Paper>
        
        {item && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>Informacje o produkcie</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Nazwa produktu"
                  value={item.name || ''}
                  margin="normal"
                  InputProps={{
                    readOnly: true,
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Kategoria"
                  value={item.category || ''}
                  margin="normal"
                  InputProps={{
                    readOnly: true,
                  }}
                />
              </Grid>
              {item.sku && (
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="SKU"
                    value={item.sku || ''}
                    margin="normal"
                    InputProps={{
                      readOnly: true,
                    }}
                  />
                </Grid>
              )}
            </Grid>
          </Paper>
        )}
      </Box>
    </LocalizationProvider>
  );
};

export default BatchEditForm; 