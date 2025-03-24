import React from 'react';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Button
} from '@mui/material';

/**
 * Komponent dialogowy do potwierdzenia usunięcia elementu
 */
const DeleteConfirmationDialog = ({ 
  open, 
  onClose, 
  onConfirm, 
  title = "Potwierdzenie usunięcia", 
  content = "Czy na pewno chcesz usunąć ten element?", 
  confirmButtonText = "Usuń", 
  cancelButtonText = "Anuluj" 
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="delete-dialog-title"
      aria-describedby="delete-dialog-description"
    >
      <DialogTitle id="delete-dialog-title">
        {title}
      </DialogTitle>
      <DialogContent>
        <DialogContentText id="delete-dialog-description">
          {content}
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary">
          {cancelButtonText}
        </Button>
        <Button onClick={onConfirm} color="error" variant="contained" autoFocus>
          {confirmButtonText}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteConfirmationDialog; 