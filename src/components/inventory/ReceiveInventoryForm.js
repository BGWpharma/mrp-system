import React, { useState } from 'react';
import { Grid, Typography, TextField, Box, Button } from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers';

const ReceiveInventoryForm = () => {
  const [transactionData, setTransactionData] = useState({
    quantity: '',
    reason: 'purchase',
    referenceNumber: '',
    notes: '',
    batchNumber: '',
    lotNumber: '',
    expiryDate: null,
    batchNotes: ''
  });

  const generateLOT = async () => {
    try {
      const { generateLOTNumber } = await import('../../utils/numberGenerators');
      const lotNumber = await generateLOTNumber();
      setTransactionData(prev => ({
        ...prev,
        lotNumber,
        batchNumber: prev.batchNumber || lotNumber
      }));
    } catch (error) {
      console.error('Błąd podczas generowania numeru LOT:', error);
      showError('Nie udało się wygenerować numeru LOT');
    }
  };

  const handleTransactionChange = (event) => {
    const { name, value } = event.target;
    setTransactionData({
      ...transactionData,
      [name]: value
    });
  };

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Typography variant="h6" gutterBottom>
          Dane partii
        </Typography>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Numer partii"
              name="batchNumber"
              value={transactionData.batchNumber}
              onChange={handleTransactionChange}
              margin="normal"
              helperText="Opcjonalny numer partii dostawcy"
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
              <TextField
                fullWidth
                label="Numer LOT"
                name="lotNumber"
                value={transactionData.lotNumber}
                onChange={handleTransactionChange}
                margin="normal"
                helperText="Wewnętrzny numer partii (LOT)"
              />
              <Button 
                variant="outlined" 
                onClick={generateLOT}
                sx={{ mt: 2, ml: 1, height: 56 }}
              >
                Generuj
              </Button>
            </Box>
          </Grid>
          <Grid item xs={12} sm={6}>
            <DatePicker
              label="Data ważności"
              value={transactionData.expiryDate}
              onChange={(newValue) => {
                setTransactionData({
                  ...transactionData,
                  expiryDate: newValue
                });
              }}
              renderInput={(params) => <TextField {...params} fullWidth margin="normal" />}
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Uwagi do partii"
              name="batchNotes"
              value={transactionData.batchNotes}
              onChange={handleTransactionChange}
              margin="normal"
              multiline
              rows={2}
            />
          </Grid>
        </Grid>
      </Grid>
    </Grid>
  );
};

export default ReceiveInventoryForm; 