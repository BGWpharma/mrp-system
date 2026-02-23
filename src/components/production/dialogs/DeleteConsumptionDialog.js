import React, { memo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  FormControlLabel,
  Checkbox,
  CircularProgress
} from '@mui/material';

const DeleteConsumptionDialog = memo(({
  open,
  onClose,
  onConfirm,
  restoreReservation,
  onRestoreReservationChange,
  loading = false,
  t = (key) => key
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>{t('consumption.confirmConsumptionDeletion')}</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Czy na pewno chcesz usunąć wybraną konsumpcję? Ta operacja jest nieodwracalna.
        </DialogContentText>
        <FormControlLabel
          control={
            <Checkbox
              checked={restoreReservation}
              onChange={(e) => onRestoreReservationChange(e.target.checked)}
              color="primary"
            />
          }
          label={t('consumption.restoreReservationAfterDeletion')}
          sx={{ mt: 2, display: 'block' }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={loading}>
          Anuluj
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color="error"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {loading ? 'Usuwanie...' : 'Usuń konsumpcję'}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

DeleteConsumptionDialog.displayName = 'DeleteConsumptionDialog';

export default DeleteConsumptionDialog;
