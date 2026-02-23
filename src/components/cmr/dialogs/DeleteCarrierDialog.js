import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';

const DeleteCarrierDialog = React.memo(({
  open,
  onClose,
  carrierToDelete,
  onConfirmDelete,
  deletingCarrier
}) => (
  <Dialog
    open={open}
    onClose={onClose}
    maxWidth="xs"
    fullWidth
  >
    <DialogTitle>Potwierdź usunięcie</DialogTitle>
    <DialogContent>
      <Typography>
        Czy na pewno chcesz usunąć przewoźnika <strong>{carrierToDelete?.name}</strong>?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
        Ta operacja jest nieodwracalna.
      </Typography>
    </DialogContent>
    <DialogActions>
      <Button 
        onClick={onClose} 
        disabled={deletingCarrier}
      >
        Anuluj
      </Button>
      <Button 
        onClick={onConfirmDelete} 
        variant="contained" 
        color="error"
        disabled={deletingCarrier}
        startIcon={deletingCarrier ? <CircularProgress size={20} /> : <DeleteIcon />}
      >
        {deletingCarrier ? 'Usuwanie...' : 'Usuń'}
      </Button>
    </DialogActions>
  </Dialog>
));

DeleteCarrierDialog.displayName = 'DeleteCarrierDialog';

export default DeleteCarrierDialog;
