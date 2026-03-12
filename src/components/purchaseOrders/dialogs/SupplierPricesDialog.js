import React from 'react';
import {
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';

const SupplierPricesDialog = ({ open, onClose, onConfirm }) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>Zaktualizować ceny dostawców?</DialogTitle>
    <DialogContent>
      <DialogContentText>
        Zamówienie zostanie oznaczone jako zakończone.
      </DialogContentText>
      <DialogContentText sx={{ mt: 2, fontWeight: 'bold' }}>
        Czy chcesz również automatycznie zaktualizować ceny dostawców w pozycjach magazynowych na podstawie cen z tego zamówienia?
      </DialogContentText>
      <DialogContentText sx={{ mt: 2, fontSize: '0.875rem', color: 'text.secondary' }}>
        • Zaktualizowane ceny zostaną ustawione jako domyślne<br/>
        • Historia zmian cen zostanie zachowana<br/>
        • Można to zrobić później ręcznie z menu akcji
      </DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose} color="inherit">Anuluj</Button>
      <Button onClick={() => onConfirm(false)} color="primary" variant="outlined">
        Tylko zmień status
      </Button>
      <Button onClick={() => onConfirm(true)} color="primary" variant="contained" startIcon={<RefreshIcon />}>
        Zmień status i zaktualizuj ceny
      </Button>
    </DialogActions>
  </Dialog>
);

export default SupplierPricesDialog;
