import React from 'react';
import {
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Button, Table, TableBody, TableCell, TableHead, TableRow, Chip
} from '@mui/material';
import { format, isValid } from 'date-fns';
import { pl } from 'date-fns/locale';
import { mb2 } from '../../../styles/muiCommonStyles';

const ShortExpiryDialog = ({ open, onClose, shortExpiryItems, purchaseOrder, onConfirm }) => (
  <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogTitle>Ostrzeżenie - Krótkie daty ważności</DialogTitle>
    <DialogContent>
      <DialogContentText sx={mb2}>
        Następujące pozycje mają datę ważności krótszą niż 16 miesięcy od daty zamówienia:
      </DialogContentText>
      {shortExpiryItems.length > 0 && (
        <Table size="small" sx={{ mt: 2 }}>
          <TableHead>
            <TableRow>
              <TableCell>Nazwa produktu</TableCell>
              <TableCell>Data ważności</TableCell>
              <TableCell>Miesiące do wygaśnięcia</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {shortExpiryItems.map((item, index) => {
              const orderDate = new Date(purchaseOrder?.orderDate);
              const expiryDate = typeof item.expiryDate === 'string'
                ? new Date(item.expiryDate)
                : item.expiryDate instanceof Date
                  ? item.expiryDate
                  : item.expiryDate?.toDate?.() || new Date();
              const monthsDiff = Math.floor((expiryDate - orderDate) / (1000 * 60 * 60 * 24 * 30.44));
              return (
                <TableRow key={index}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell>
                    {isValid(expiryDate) ? format(expiryDate, 'dd.MM.yyyy', { locale: pl }) : 'Nieprawidłowa data'}
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={`${monthsDiff} miesięcy`}
                      color={monthsDiff < 12 ? 'error' : monthsDiff < 16 ? 'warning' : 'default'}
                      size="small"
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <DialogContentText sx={{ mt: 2, fontWeight: 'bold' }}>
        Czy na pewno chcesz kontynuować zmianę statusu na "Zamówione"?
      </DialogContentText>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Anuluj</Button>
      <Button onClick={onConfirm} color="warning" variant="contained">
        Kontynuuj mimo ostrzeżenia
      </Button>
    </DialogActions>
  </Dialog>
);

export default ShortExpiryDialog;
