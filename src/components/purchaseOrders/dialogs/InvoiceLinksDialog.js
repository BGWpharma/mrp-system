import React from 'react';
import {
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Button, Box, Typography, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TextField, IconButton
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';
import { mb2 } from '../../../styles/muiCommonStyles';

const InvoiceLinksDialog = ({ open, onClose, tempInvoiceLinks, setTempInvoiceLinks, invoiceLink, setInvoiceLink, onSave, t }) => (
  <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogTitle>Linki do faktur</DialogTitle>
    <DialogContent>
      <DialogContentText sx={mb2}>
        Zarządzaj linkami do faktur dla tego zamówienia. Możesz dodać wiele faktur, np. główną fakturę i dodatkowe faktury za transport, ubezpieczenie itp.
      </DialogContentText>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <Button
          startIcon={<AddIcon />}
          onClick={() => setTempInvoiceLinks([...tempInvoiceLinks, { id: `invoice-${Date.now()}`, description: '', url: '' }])}
          variant="outlined" size="small"
        >
          Dodaj fakturę
        </Button>
      </Box>
      {tempInvoiceLinks.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>
          Brak faktur. Kliknij "Dodaj fakturę", aby dodać link do faktury.
        </Typography>
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Opis</TableCell>
                <TableCell>Link do faktury</TableCell>
                <TableCell width="100px"></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tempInvoiceLinks.map((invoice, index) => (
                <TableRow key={invoice.id || index}>
                  <TableCell>
                    <TextField fullWidth size="small" value={invoice.description}
                      onChange={(e) => {
                        const updated = [...tempInvoiceLinks];
                        updated[index].description = e.target.value;
                        setTempInvoiceLinks(updated);
                      }}
                      placeholder={t('purchaseOrders.invoiceDescriptionPlaceholder')}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField fullWidth size="small" value={invoice.url}
                      onChange={(e) => {
                        const updated = [...tempInvoiceLinks];
                        updated[index].url = e.target.value;
                        setTempInvoiceLinks(updated);
                        if (index === 0) setInvoiceLink(e.target.value);
                      }}
                      placeholder="https://drive.google.com/file/d/..."
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton size="small" color="error"
                      onClick={() => {
                        const updated = tempInvoiceLinks.filter((_, i) => i !== index);
                        setTempInvoiceLinks(updated);
                        if (index === 0 && updated.length > 0) setInvoiceLink(updated[0].url);
                        else if (updated.length === 0) setInvoiceLink('');
                      }}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <input type="hidden" value={invoiceLink} />
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Anuluj</Button>
      <Button onClick={onSave} color="primary">Zapisz</Button>
    </DialogActions>
  </Dialog>
);

export default InvoiceLinksDialog;
