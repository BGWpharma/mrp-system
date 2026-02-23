import React, { memo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Box,
  Alert,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Checkbox,
  Typography,
  CircularProgress
} from '@mui/material';

const ReserveMaterialsDialog = memo(({
  open,
  onClose,
  onReserve,
  reservationMethod = 'automatic',
  onReservationMethodChange,
  autoCreatePOReservations = true,
  onAutoCreatePOReservationsChange,
  loading = false,
  renderManualBatchSelection,
  t = (key) => key
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle>Rezerwacja surowców</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Wybierz partie materiałów, które chcesz zarezerwować dla tego zadania produkcyjnego.
        </DialogContentText>

        <FormControl component="fieldset" sx={{ mb: 2 }}>
          <FormLabel component="legend">Metoda rezerwacji</FormLabel>
          <RadioGroup
            row
            value={reservationMethod}
            onChange={onReservationMethodChange}
          >
            <FormControlLabel
              value="automatic"
              control={<Radio />}
              label="Automatyczna (FIFO)"
            />
            <FormControlLabel
              value="manual"
              control={<Radio />}
              label={t('consumption.manualBatchSelection')}
            />
          </RadioGroup>
        </FormControl>

        {reservationMethod === 'manual' && renderManualBatchSelection && renderManualBatchSelection()}

        {reservationMethod === 'automatic' && (
          <>
            <Alert severity="info" sx={{ mb: 2 }}>
              System automatycznie zarezerwuje najstarsze dostępne partie materiałów (FIFO).
            </Alert>

            <FormControlLabel
              control={
                <Checkbox
                  checked={autoCreatePOReservations}
                  onChange={(e) => onAutoCreatePOReservationsChange(e.target.checked)}
                  color="primary"
                />
              }
              label={
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    Automatycznie twórz rezerwacje z zamówień zakupu (PO)
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Jeśli braknie partii magazynowych, system automatycznie zarezerwuje brakującą ilość z otwartych zamówień zakupowych
                  </Typography>
                </Box>
              }
              sx={{ mb: 2, alignItems: 'flex-start' }}
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          Anuluj
        </Button>
        <Button
          onClick={onReserve}
          variant="contained"
          color="primary"
          disabled={loading}
        >
          {loading ? <CircularProgress size={24} /> : 'Rezerwuj materiały'}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

ReserveMaterialsDialog.displayName = 'ReserveMaterialsDialog';

export default ReserveMaterialsDialog;
