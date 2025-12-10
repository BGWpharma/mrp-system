/**
 * Uniwersalny dialog potwierdzenia usunięcia
 * Używany do: usuwania historii, materiałów, konsumpcji, itp.
 */

import React, { memo, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  CircularProgress,
  Alert,
  Box,
  Typography
} from '@mui/material';
import {
  Warning as WarningIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';

const DeleteConfirmDialog = memo(({
  open,
  onClose,
  onConfirm,
  title = 'Potwierdź usunięcie',
  message = 'Czy na pewno chcesz usunąć ten element? Tej operacji nie można cofnąć.',
  confirmText = 'Usuń',
  cancelText = 'Anuluj',
  loading = false,
  error = null,
  warningMessage = null,
  itemName = null,
  variant = 'delete' // 'delete' | 'warning' | 'info'
}) => {
  const handleConfirm = useCallback(async () => {
    const result = await onConfirm();
    if (result?.success !== false) {
      onClose();
    }
  }, [onConfirm, onClose]);

  const getColor = () => {
    switch (variant) {
      case 'warning': return 'warning';
      case 'info': return 'info';
      default: return 'error';
    }
  };

  const getIcon = () => {
    switch (variant) {
      case 'warning': return <WarningIcon color="warning" sx={{ fontSize: 48, mb: 1 }} />;
      case 'info': return <WarningIcon color="info" sx={{ fontSize: 48, mb: 1 }} />;
      default: return <DeleteIcon color="error" sx={{ fontSize: 48, mb: 1 }} />;
    }
  };

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle sx={{ pb: 1 }}>{title}</DialogTitle>
      <DialogContent>
        <Box sx={{ textAlign: 'center', py: 2 }}>
          {getIcon()}
          
          {itemName && (
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
              {itemName}
            </Typography>
          )}
          
          <DialogContentText>
            {message}
          </DialogContentText>
        </Box>

        {warningMessage && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {warningMessage}
          </Alert>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button 
          onClick={onClose} 
          disabled={loading}
          variant="outlined"
        >
          {cancelText}
        </Button>
        <Button 
          onClick={handleConfirm} 
          variant="contained"
          color={getColor()}
          disabled={loading}
          startIcon={loading ? <CircularProgress size={20} color="inherit" /> : null}
        >
          {loading ? 'Usuwanie...' : confirmText}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

DeleteConfirmDialog.displayName = 'DeleteConfirmDialog';

export default DeleteConfirmDialog;

