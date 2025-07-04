import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Box,
  Typography
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';
import ProductionControlForm from './ProductionControlForm';

const ProductionControlFormDialog = ({ 
  open, 
  onClose, 
  task = null,
  onSuccess = null 
}) => {
  // Przygotuj dane wstępne na podstawie zadania produkcyjnego
  const preparePrefilledData = () => {
    if (!task) return {};

    return {
      manufacturingOrder: task.moNumber || '',
      customerOrder: task.orderNumber || '',
      productName: task.productName || '',
      lotNumber: task.lotNumber || `SN/${task.moNumber}`,
      quantity: task.quantity || '',
      expiryDate: task.expiryDate ? new Date(task.expiryDate) : null
    };
  };

  const handleSuccess = (formData) => {
    if (onSuccess) {
      onSuccess(formData);
    }
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { 
          minHeight: '80vh',
          maxHeight: '90vh'
        }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography variant="h6">
            Formularz Kontroli Produkcji
          </Typography>
          <IconButton
            aria-label="close"
            onClick={onClose}
            sx={{
              color: (theme) => theme.palette.grey[500],
            }}
          >
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      <DialogContent sx={{ p: 3 }}>
        <ProductionControlForm
          isDialog={true}
          onClose={onClose}
          prefilledData={preparePrefilledData()}
          onSuccess={handleSuccess}
        />
      </DialogContent>
    </Dialog>
  );
};

export default ProductionControlFormDialog; 