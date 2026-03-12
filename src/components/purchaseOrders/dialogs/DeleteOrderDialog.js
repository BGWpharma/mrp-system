import React from 'react';
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button } from '@mui/material';

const DeleteOrderDialog = ({ open, onClose, onConfirm, purchaseOrder, orderId }) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Potwierdzenie usunięcia</DialogTitle>
    <DialogContent>
      <DialogContentText>
        Czy na pewno chcesz usunąć to zamówienie zakupu?
      </DialogContentText>
      <DialogContentText sx={{ mt: 2, fontWeight: 'bold', color: 'error.main' }}>
        Ta operacja jest nieodwracalna!
      </DialogContentText>
      {purchaseOrder && (
        <DialogContentText sx={{ mt: 2 }}>
          <strong>Zamówienie:</strong> {purchaseOrder.number || `#${orderId.substring(0, 8).toUpperCase()}`}<br/>
          <strong>Dostawca:</strong> {purchaseOrder.supplier?.name || 'Nieznany'}<br/>
          <strong>Wartość:</strong> {purchaseOrder.totalGross ? `${Number(purchaseOrder.totalGross).toFixed(2)} ${purchaseOrder.currency || 'PLN'}` : 'Nieznana'}
        </DialogContentText>
      )}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Anuluj</Button>
      <Button onClick={onConfirm} color="error" variant="contained">Usuń</Button>
    </DialogActions>
  </Dialog>
);

export default DeleteOrderDialog;
