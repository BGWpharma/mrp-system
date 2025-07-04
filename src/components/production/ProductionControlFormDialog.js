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

    // Funkcja pomocnicza do formatowania daty
    const formatExpiryDate = (dateValue) => {
      try {
        if (!dateValue) return '';
        
        let date;
        
        // Jeśli to obiekt Date
        if (dateValue instanceof Date) {
          date = dateValue;
        }
        // Jeśli to timestamp Firestore
        else if (dateValue.toDate && typeof dateValue.toDate === 'function') {
          date = dateValue.toDate();
        }
        // Jeśli to timestamp z sekundami
        else if (dateValue.seconds) {
          date = new Date(dateValue.seconds * 1000);
        }
        // Jeśli to string
        else if (typeof dateValue === 'string') {
          date = new Date(dateValue);
        } else {
          return '';
        }
        
        // Sprawdź czy data jest poprawna
        if (isNaN(date.getTime())) {
          console.error('Invalid date format:', dateValue);
          return '';
        }
        
        // Formatuj datę do wyświetlenia w formacie DD.MM.YYYY (format polski)
        return date.toLocaleDateString('pl-PL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      } catch (error) {
        console.error('Error formatting expiry date:', error, dateValue);
        return '';
      }
    };

    return {
      manufacturingOrder: task.moNumber || '',
      customerOrder: task.orderNumber || '',
      productName: task.productName || '',
      lotNumber: task.lotNumber || `SN/${task.moNumber}`,
      quantity: task.quantity || '',
      expiryDate: formatExpiryDate(task.expiryDate)
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