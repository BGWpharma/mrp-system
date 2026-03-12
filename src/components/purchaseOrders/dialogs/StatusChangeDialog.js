import React from 'react';
import {
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Button, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { translateStatus } from '../../../services/purchaseOrders';
import { mb2 } from '../../../styles/muiCommonStyles';

const StatusChangeDialog = ({ open, onClose, newStatus, onStatusChange, onSave }) => (
  <Dialog open={open} onClose={onClose}>
    <DialogTitle>Zmień status zamówienia</DialogTitle>
    <DialogContent>
      <DialogContentText sx={mb2}>
        Wybierz nowy status zamówienia:
      </DialogContentText>
      <FormControl fullWidth>
        <InputLabel>Status</InputLabel>
        <Select value={newStatus} onChange={(e) => onStatusChange(e.target.value)} label="Status">
          <MenuItem value="draft">{translateStatus('draft')}</MenuItem>
          <MenuItem value="ordered">{translateStatus('ordered')}</MenuItem>
          <MenuItem value="confirmed">{translateStatus('confirmed')}</MenuItem>
          <MenuItem value="shipped">{translateStatus('shipped')}</MenuItem>
          <MenuItem value="partial">{translateStatus('partial')}</MenuItem>
          <MenuItem value="delivered">{translateStatus('delivered')}</MenuItem>
          <MenuItem value="completed">{translateStatus('completed')}</MenuItem>
          <MenuItem value="cancelled">{translateStatus('cancelled')}</MenuItem>
        </Select>
      </FormControl>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Anuluj</Button>
      <Button onClick={onSave} color="primary">Zapisz</Button>
    </DialogActions>
  </Dialog>
);

export default StatusChangeDialog;
