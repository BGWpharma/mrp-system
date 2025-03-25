import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Typography,
  CircularProgress,
} from '@mui/material';

const EditReservationDialog = ({
  open,
  onClose,
  onSave,
  editForm,
  setEditForm,
  selectedItem,
  selectedItemBatches,
  loadingBatches = false,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle>
        Edytuj rezerwację
      </DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            Możesz zmienić ilość zarezerwowanego materiału oraz wybrać konkretny LOT/partię.
          </Typography>
          
          <TextField
            fullWidth
            label="Ilość"
            type="number"
            value={editForm.quantity}
            onChange={(e) => setEditForm(prev => ({ ...prev, quantity: e.target.value }))}
            margin="normal"
            inputProps={{ min: 0, step: 0.01 }}
          />
          
          <FormControl fullWidth margin="normal">
            <InputLabel>Partia (LOT)</InputLabel>
            {loadingBatches ? (
              <CircularProgress size={20} sx={{ mt: 2, ml: 2 }} />
            ) : (
              <Select
                value={editForm.batchId}
                onChange={(e) => setEditForm(prev => ({ ...prev, batchId: e.target.value }))}
                label="Partia (LOT)"
              >
                <MenuItem value="">
                  <em>Brak (auto-wybór)</em>
                </MenuItem>
                {selectedItemBatches.map((batch) => (
                  <MenuItem key={batch.id} value={batch.id}>
                    {batch.lotNumber || batch.batchNumber || 'Bez numeru'} 
                    ({batch.quantity} {selectedItem?.unit} dostępne)
                    {batch.expiryDate && ` - Ważne do: ${new Date(batch.expiryDate).toLocaleDateString()}`}
                  </MenuItem>
                ))}
              </Select>
            )}
          </FormControl>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Anuluj</Button>
        <Button 
          onClick={onSave}
          variant="contained"
          color="primary"
        >
          Zapisz zmiany
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EditReservationDialog; 