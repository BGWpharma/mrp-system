/**
 * Dialog do rezerwacji materiałów dla zadania produkcyjnego
 * Wydzielony z TaskDetailsPage.js dla lepszej organizacji kodu
 */

import React, { useState, useCallback, useEffect, memo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Alert,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Typography,
  CircularProgress,
  Divider,
  Switch
} from '@mui/material';

const ReserveMaterialsDialog = memo(({
  open,
  onClose,
  onReserve,
  task,
  materials = [],
  loading = false,
  singleMaterialId = null, // Jeśli ustawione, rezerwuj tylko ten materiał
  t = (key) => key
}) => {
  const [reservationMethod, setReservationMethod] = useState('automatic');
  const [autoCreatePOReservations, setAutoCreatePOReservations] = useState(true);
  const [error, setError] = useState(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setReservationMethod('automatic');
      setAutoCreatePOReservations(true);
      setError(null);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    setError(null);
    
    const result = await onReserve({
      method: reservationMethod,
      autoCreatePOReservations,
      singleMaterialId
    });
    
    if (result?.success) {
      onClose();
    } else if (result?.error) {
      setError(result.error.message || 'Wystąpił błąd podczas rezerwacji');
    }
  }, [reservationMethod, autoCreatePOReservations, singleMaterialId, onReserve, onClose]);

  const handleClose = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  // Oblicz statystyki materiałów
  const materialStats = React.useMemo(() => {
    const targetMaterials = singleMaterialId 
      ? materials.filter(m => m.id === singleMaterialId || m.inventoryItemId === singleMaterialId)
      : materials;
    
    return {
      total: targetMaterials.length,
      withBatches: targetMaterials.filter(m => {
        const materialId = m.inventoryItemId || m.id;
        return task?.materialBatches?.[materialId]?.length > 0;
      }).length
    };
  }, [materials, singleMaterialId, task?.materialBatches]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        {singleMaterialId ? 'Rezerwuj materiał' : 'Rezerwuj materiały'}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mb: 3 }}>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            {singleMaterialId 
              ? 'Wybierz metodę rezerwacji dla wybranego materiału.'
              : `Wybierz metodę rezerwacji dla ${materialStats.total} materiałów.`
            }
          </Typography>

          {materialStats.withBatches > 0 && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {materialStats.withBatches} z {materialStats.total} materiałów ma już przypisane partie.
              Rezerwacja zostanie uzupełniona dla brakujących ilości.
            </Alert>
          )}
        </Box>

        <FormControl component="fieldset" sx={{ width: '100%' }}>
          <FormLabel component="legend">Metoda rezerwacji</FormLabel>
          <RadioGroup
            value={reservationMethod}
            onChange={(e) => setReservationMethod(e.target.value)}
          >
            <FormControlLabel 
              value="automatic" 
              control={<Radio />} 
              label={
                <Box>
                  <Typography variant="body1">Automatyczna (FEFO)</Typography>
                  <Typography variant="caption" color="textSecondary">
                    System automatycznie wybierze partie z najkrótszą datą ważności
                  </Typography>
                </Box>
              }
            />
            <FormControlLabel 
              value="manual" 
              control={<Radio />} 
              label={
                <Box>
                  <Typography variant="body1">Manualna</Typography>
                  <Typography variant="caption" color="textSecondary">
                    Wybierz partie ręcznie w zakładce Materiały i Koszty
                  </Typography>
                </Box>
              }
            />
          </RadioGroup>
        </FormControl>

        <Divider sx={{ my: 2 }} />

        <FormControlLabel
          control={
            <Switch
              checked={autoCreatePOReservations}
              onChange={(e) => setAutoCreatePOReservations(e.target.checked)}
            />
          }
          label={
            <Box>
              <Typography variant="body2">
                Automatycznie twórz rezerwacje z zamówień zakupu (PO)
              </Typography>
              <Typography variant="caption" color="textSecondary">
                Gdy brakuje partii magazynowych, system zarezerwuje ilości z oczekujących dostaw
              </Typography>
            </Box>
          }
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Anuluj
        </Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          color="primary"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {loading ? 'Rezerwowanie...' : 'Zarezerwuj'}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

ReserveMaterialsDialog.displayName = 'ReserveMaterialsDialog';

export default ReserveMaterialsDialog;

