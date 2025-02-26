// src/components/inventory/InventoryTransactionForm.js
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  Divider
} from '@mui/material';
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  ArrowUpward as ReceiveIcon,
  ArrowDownward as IssueIcon
} from '@mui/icons-material';
import { getInventoryItemById, receiveInventory, issueInventory } from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';

const InventoryTransactionForm = () => {
  const { itemId, transactionType } = useParams();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  const isReceive = transactionType === 'receive';
  
  const [transactionData, setTransactionData] = useState({
    quantity: '',
    reason: '',
    reference: '',
    notes: ''
  });

  useEffect(() => {
    const fetchItem = async () => {
      try {
        if (!itemId) {
          showError('Nie wybrano pozycji magazynowej');
          navigate('/inventory');
          return;
        }
        
        const fetchedItem = await getInventoryItemById(itemId);
        setItem(fetchedItem);
      } catch (error) {
        showError('Błąd podczas pobierania pozycji: ' + error.message);
        console.error('Error fetching inventory item:', error);
        navigate('/inventory');
      } finally {
        setLoading(false);
      }
    };
    
    fetchItem();
  }, [itemId, navigate, showError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setProcessing(true);
    
    try {
      if (!transactionData.quantity || parseFloat(transactionData.quantity) <= 0) {
        throw new Error('Ilość musi być większa od zera');
      }
      
      if (isReceive) {
        await receiveInventory(itemId, transactionData.quantity, {
          reason: transactionData.reason,
          reference: transactionData.reference,
          notes: transactionData.notes
        }, currentUser.uid);
        showSuccess(`Przyjęto ${transactionData.quantity} ${item.unit} do magazynu`);
      } else {
        await issueInventory(itemId, transactionData.quantity, {
          reason: transactionData.reason,
          reference: transactionData.reference,
          notes: transactionData.notes
        }, currentUser.uid);
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
        </Grid>
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
          disabled={processing || !transactionData.quantity || (isReceive ? false : parseFloat(transactionData.quantity || 0) > item.quantity)}
        >
          {processing ? 'Przetwarzanie...' : (isReceive ? 'Przyjmij' : 'Wydaj')}
        </Button>
      </Box>
    </Box>
  );
};

export default InventoryTransactionForm;