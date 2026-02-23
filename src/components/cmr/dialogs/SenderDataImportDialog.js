import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  FormGroup
} from '@mui/material';

const SenderDataImportDialog = React.memo(({
  open,
  onClose,
  senderImportOptions,
  onSenderImportOptionChange,
  onImportSenderData,
  isLoadingSenderData
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>Importuj dane firmy</DialogTitle>
    <DialogContent>
      <FormGroup>
        <Typography variant="h6" sx={{ mb: 1 }}>
          Wybierz dane do importu:
        </Typography>
        <FormControlLabel 
          control={
            <Checkbox 
              checked={senderImportOptions.name} 
              onChange={onSenderImportOptionChange} 
              name="name" 
            />
          } 
          label="Nazwa firmy"
        />
        <FormControlLabel 
          control={
            <Checkbox 
              checked={senderImportOptions.address} 
              onChange={onSenderImportOptionChange} 
              name="address" 
            />
          } 
          label="Adres"
        />
        <FormControlLabel 
          control={
            <Checkbox 
              checked={senderImportOptions.postalCode} 
              onChange={onSenderImportOptionChange} 
              name="postalCode" 
            />
          } 
          label="Kod pocztowy" 
        />
        <FormControlLabel 
          control={
            <Checkbox 
              checked={senderImportOptions.city} 
              onChange={onSenderImportOptionChange} 
              name="city" 
            />
          } 
          label="Miasto" 
        />
        <FormControlLabel 
          control={
            <Checkbox 
              checked={senderImportOptions.country} 
              onChange={onSenderImportOptionChange} 
              name="country" 
            />
          } 
          label="Kraj" 
        />
      </FormGroup>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Anuluj</Button>
      <Button 
        onClick={onImportSenderData} 
        variant="contained"
        disabled={isLoadingSenderData}
      >
        {isLoadingSenderData ? <CircularProgress size={20} /> : 'Importuj dane'}
      </Button>
    </DialogActions>
  </Dialog>
));

SenderDataImportDialog.displayName = 'SenderDataImportDialog';

export default SenderDataImportDialog;
