/**
 * Dialog do rozpoczęcia produkcji z ustawieniem daty ważności
 * Wydzielony z TaskDetailsPage.js dla lepszej organizacji kodu
 */

import React, { useState, useCallback, memo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Box,
  Alert
} from '@mui/material';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';

const StartProductionDialog = memo(({
  open,
  onClose,
  onStart,
  loading = false,
  t = (key) => key
}) => {
  const [expiryDate, setExpiryDate] = useState(null);
  const [error, setError] = useState(null);

  // Reset state when dialog opens
  React.useEffect(() => {
    if (open) {
      setExpiryDate(null);
      setError(null);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (!expiryDate) {
      setError('Podaj datę ważności gotowego produktu');
      return;
    }

    setError(null);
    const result = await onStart(expiryDate);
    
    if (result?.success) {
      onClose();
    } else if (result?.error) {
      setError(result.error.message || 'Wystąpił błąd');
    }
  }, [expiryDate, onStart, onClose]);

  const handleClose = useCallback(() => {
    setExpiryDate(null);
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>Rozpocznij produkcję</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Data ważności gotowego produktu jest wymagana do rozpoczęcia produkcji.
        </DialogContentText>
        
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
          <Box sx={{ my: 2 }}>
            <DateTimePicker
              label="Data ważności gotowego produktu *"
              value={expiryDate}
              onChange={setExpiryDate}
              views={['year', 'month', 'day']}
              format="dd-MM-yyyy"
              slotProps={{
                textField: {
                  fullWidth: true,
                  margin: 'dense',
                  variant: 'outlined',
                  helperText: "Data ważności produktu jest wymagana",
                  error: !expiryDate && !!error,
                  required: true
                },
                actionBar: {
                  actions: ['clear', 'today']
                }
              }}
            />
          </Box>
        </LocalizationProvider>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Anuluj
        </Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          disabled={!expiryDate || loading}
        >
          {loading ? 'Rozpoczynanie...' : 'Rozpocznij produkcję'}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

StartProductionDialog.displayName = 'StartProductionDialog';

export default StartProductionDialog;

