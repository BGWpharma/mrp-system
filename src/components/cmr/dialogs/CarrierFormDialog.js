import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  CircularProgress
} from '@mui/material';

const CarrierFormDialog = React.memo(({
  open,
  onClose,
  carrierDialogMode,
  newCarrierData,
  onNewCarrierChange,
  onSaveCarrier,
  savingCarrier,
  t
}) => (
  <Dialog 
    open={open} 
    onClose={onClose}
    maxWidth="sm"
    fullWidth
  >
    <DialogTitle>
      {carrierDialogMode === 'edit' ? 'Edytuj przewoźnika' : 'Dodaj nowego przewoźnika'}
    </DialogTitle>
    <DialogContent>
      <Grid container spacing={2} sx={{ mt: 1 }}>
        <Grid item xs={12}>
          <TextField
            label={t('form.carrierName')}
            name="name"
            value={newCarrierData.name}
            onChange={onNewCarrierChange}
            fullWidth
            autoFocus
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            label="Adres"
            name="address"
            value={newCarrierData.address}
            onChange={onNewCarrierChange}
            fullWidth
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            label="Kod pocztowy"
            name="postalCode"
            value={newCarrierData.postalCode}
            onChange={onNewCarrierChange}
            fullWidth
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            label="Miasto"
            name="city"
            value={newCarrierData.city}
            onChange={onNewCarrierChange}
            fullWidth
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            label="Kraj"
            name="country"
            value={newCarrierData.country}
            onChange={onNewCarrierChange}
            fullWidth
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="NIP"
            name="nip"
            value={newCarrierData.nip}
            onChange={onNewCarrierChange}
            fullWidth
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            label="Telefon"
            name="phone"
            value={newCarrierData.phone}
            onChange={onNewCarrierChange}
            fullWidth
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            label="Email"
            name="email"
            value={newCarrierData.email}
            onChange={onNewCarrierChange}
            fullWidth
            type="email"
          />
        </Grid>
      </Grid>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} disabled={savingCarrier}>
        Anuluj
      </Button>
      <Button 
        onClick={onSaveCarrier} 
        variant="contained" 
        disabled={savingCarrier || !newCarrierData.name.trim()}
        startIcon={savingCarrier ? <CircularProgress size={20} /> : null}
      >
        {savingCarrier ? 'Zapisywanie...' : (carrierDialogMode === 'edit' ? 'Zapisz zmiany' : 'Zapisz przewoźnika')}
      </Button>
    </DialogActions>
  </Dialog>
));

CarrierFormDialog.displayName = 'CarrierFormDialog';

export default CarrierFormDialog;
