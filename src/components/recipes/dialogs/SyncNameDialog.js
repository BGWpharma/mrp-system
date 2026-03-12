import React from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
} from '@mui/material';
import {
  Sync as SyncIcon,
  Inventory as InventoryIcon,
} from '@mui/icons-material';

const SyncNameDialog = ({
  open,
  onClose,
  originalRecipeName,
  newRecipeName,
  linkedInventoryItem,
  syncingName,
  onSaveWithoutSync,
  onSaveWithSync,
  t
}) => {
  return (
    <Dialog 
      open={open} 
      onClose={() => !syncingName && onClose()}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: '12px',
          overflow: 'hidden'
        }
      }}
    >
      <Box sx={{ 
        p: 2, 
        display: 'flex', 
        alignItems: 'center', 
        gap: 1,
        borderBottom: '1px solid',
        borderColor: 'divider',
        bgcolor: 'action.hover'
      }}>
        <SyncIcon color="primary" />
        <DialogTitle sx={{ p: 0 }}>{t('recipes.syncNameDialog.title')}</DialogTitle>
      </Box>
      
      <DialogContent sx={{ pt: 3 }}>
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('recipes.syncNameDialog.nameChangeDetected')} "<strong>{originalRecipeName}</strong>" {t('recipes.syncNameDialog.to')} "<strong>{newRecipeName}</strong>".
        </Alert>
        
        <Typography sx={{ mb: 1 }}>
          {t('recipes.syncNameDialog.linkedInventoryInfo')}
        </Typography>
        
        <Paper 
          elevation={0} 
          sx={{ 
            p: 2, 
            mb: 2, 
            bgcolor: 'action.hover',
            borderRadius: '8px',
            border: '1px solid',
            borderColor: 'divider'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <InventoryIcon color="action" />
            <Typography variant="body1" fontWeight="medium">
              {linkedInventoryItem?.name}
            </Typography>
          </Box>
        </Paper>
        
        <Typography>
          {t('recipes.syncNameDialog.syncQuestion')}
        </Typography>
      </DialogContent>
      
      <DialogActions sx={{ px: 3, py: 2, borderTop: '1px solid', borderColor: 'divider' }}>
        <Button 
          onClick={onSaveWithoutSync}
          variant="outlined"
          disabled={syncingName}
          sx={{ borderRadius: '8px' }}
        >
          {t('recipes.syncNameDialog.keepOldName')}
        </Button>
        <Button 
          onClick={onSaveWithSync} 
          variant="contained" 
          color="primary"
          disabled={syncingName}
          startIcon={syncingName ? <CircularProgress size={20} /> : <SyncIcon />}
          sx={{ 
            borderRadius: '8px', 
            boxShadow: '0 4px 6px rgba(0,0,0,0.15)',
            px: 3
          }}
        >
          {syncingName ? t('recipes.syncNameDialog.updating') : t('recipes.syncNameDialog.syncNames')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default SyncNameDialog;
