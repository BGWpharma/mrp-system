import React, { memo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  TextField,
  Typography,
  CircularProgress
} from '@mui/material';

const EditConsumptionDialog = memo(({
  open,
  onClose,
  onConfirm,
  editedQuantity,
  onQuantityChange,
  unit = 'szt.',
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
      <DialogTitle>Edytuj konsumpcję</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Wprowadź nową ilość konsumpcji dla wybranej partii:
        </DialogContentText>
        <TextField
          label={t('common:common.newQuantity')}
          type="number"
          value={editedQuantity}
          onChange={(e) => onQuantityChange(e.target.value)}
          onWheel={(e) => e.target.blur()}
          fullWidth
          InputProps={{
            endAdornment: <Typography variant="body2">{unit}</Typography>
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          Anuluj
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color="primary"
          disabled={loading}
        >
          {loading ? <CircularProgress size={24} /> : 'Zapisz zmiany'}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

EditConsumptionDialog.displayName = 'EditConsumptionDialog';

export default EditConsumptionDialog;
