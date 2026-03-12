import React from 'react';
import { Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Button } from '@mui/material';

const ReceiveItemDialog = ({ open, onClose, itemToReceive, onConfirm }) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Przyjęcie towaru do magazynu</DialogTitle>
    <DialogContent>
      <DialogContentText>
        Czy chcesz przejść do strony przyjęcia towaru dla produktu: {itemToReceive?.name}?
      </DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Anuluj</Button>
      <Button onClick={onConfirm} color="primary">Przyjmij</Button>
    </DialogActions>
  </Dialog>
);

export default ReceiveItemDialog;
