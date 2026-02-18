import React, { useState, useEffect } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Alert,
  List,
  ListItem,
  ListItemText,
  CircularProgress,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import {
  GetApp as GetAppIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { useTranslation } from '../../hooks/useTranslation';
import {
  exportInvoicesToOptimaXML,
  validateInvoiceForOptima
} from '../../services/comarchOptimaExportService';

const InvoiceOptimaExport = ({ selectedInvoices = [], allInvoices = [], customers = [] }) => {
  const { t } = useTranslation('invoices');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [validationResults, setValidationResults] = useState([]);

  // Filtry eksportu (podobne do CSV Export)
  const [exportFilters, setExportFilters] = useState({
    startDate: format(new Date(new Date().setMonth(new Date().getMonth() - 1)), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    customerId: '',
    status: ''
  });

  // Filtruj faktury według kryteriów
  const getFilteredInvoices = () => {
    return allInvoices.filter(invoice => {
      // Filtr daty
      if (exportFilters.startDate) {
        const invoiceDate = invoice.issueDate?.toDate?.() || new Date(invoice.issueDate);
        const startDate = new Date(exportFilters.startDate);
        if (invoiceDate < startDate) return false;
      }
      
      if (exportFilters.endDate) {
        const invoiceDate = invoice.issueDate?.toDate?.() || new Date(invoice.issueDate);
        const endDate = new Date(exportFilters.endDate);
        endDate.setHours(23, 59, 59, 999);
        if (invoiceDate > endDate) return false;
      }
      
      // Filtr klienta
      if (exportFilters.customerId && invoice.customer?.id !== exportFilters.customerId) {
        return false;
      }
      
      // Filtr statusu
      if (exportFilters.status && invoice.status !== exportFilters.status) {
        return false;
      }
      
      return true;
    });
  };

  // Waliduj faktury gdy zmienia się dialog lub filtry
  useEffect(() => {
    if (dialogOpen) {
      const invoicesToValidate = getFilteredInvoices();
      const results = invoicesToValidate.map(invoice => ({
        invoice,
        validation: validateInvoiceForOptima(invoice)
      }));
      
      setValidationResults(results);
    }
  }, [dialogOpen, exportFilters, allInvoices]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenDialog = () => {
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setValidationResults([]);
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setExportFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleExport = async () => {
    setExporting(true);
    
    try {
      const invoicesToExport = getFilteredInvoices();
      
      // Filtruj tylko prawidłowe faktury
      const validInvoices = invoicesToExport.filter(inv => {
        const validation = validateInvoiceForOptima(inv);
        return validation.isValid;
      });

      if (validInvoices.length === 0) {
        alert('Brak prawidłowych faktur do eksportu');
        return;
      }

      // Eksport jest teraz asynchroniczny (pobiera dane firmy i kursy NBP)
      const result = await exportInvoicesToOptimaXML(validInvoices);
      
      alert(`Wyeksportowano ${result.invoicesCount} faktur do pliku: ${result.filename}`);
      handleCloseDialog();
    } catch (error) {
      console.error('Błąd podczas eksportu:', error);
      alert('Wystąpił błąd podczas eksportu faktur: ' + error.message);
    } finally {
      setExporting(false);
    }
  };

  const validCount = validationResults.filter(r => r.validation.isValid).length;
  const invalidCount = validationResults.filter(r => !r.validation.isValid).length;
  const totalFiltered = getFilteredInvoices().length;

  return (
    <>
      <Button
        variant="contained"
        color="primary"
        startIcon={<GetAppIcon />}
        onClick={handleOpenDialog}
        disabled={allInvoices.length === 0}
      >
        Eksport do Comarch Optima (XML)
      </Button>

      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Eksport faktur do Comarch Optima ERP
        </DialogTitle>
        <DialogContent>
          <Box sx={{ mb: 3 }}>
            <Typography variant="body1" gutterBottom sx={{ mt: 2 }}>
              Ten eksport wygeneruje plik XML zgodny z formatem importu Comarch Optima ERP.
            </Typography>

            {/* Filtry */}
            <Box sx={{ mt: 3, mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1, border: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle2" gutterBottom sx={{ mb: 2 }}>
                Filtry eksportu:
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Data od"
                    type="date"
                    name="startDate"
                    value={exportFilters.startDate}
                    onChange={handleFilterChange}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    label="Data do"
                    type="date"
                    name="endDate"
                    value={exportFilters.endDate}
                    onChange={handleFilterChange}
                    InputLabelProps={{ shrink: true }}
                    size="small"
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Klient</InputLabel>
                    <Select
                      name="customerId"
                      value={exportFilters.customerId || ''}
                      label="Klient"
                      onChange={handleFilterChange}
                    >
                      <MenuItem value="">Wszyscy klienci</MenuItem>
                      {customers.map(customer => (
                        <MenuItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Status</InputLabel>
                    <Select
                      name="status"
                      value={exportFilters.status || ''}
                      label="Status"
                      onChange={handleFilterChange}
                    >
                      <MenuItem value="">Wszystkie statusy</MenuItem>
                      <MenuItem value="draft">Szkic</MenuItem>
                      <MenuItem value="issued">Wystawiona</MenuItem>
                      <MenuItem value="unpaid">Nieopłacona</MenuItem>
                      <MenuItem value="paid">Opłacona</MenuItem>
                      <MenuItem value="partially_paid">Częściowo opłacona</MenuItem>
                      <MenuItem value="overdue">Po terminie</MenuItem>
                      <MenuItem value="cancelled">Anulowana</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
              </Grid>
            </Box>

            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Podsumowanie:
            </Typography>
            
            <Alert severity={invalidCount > 0 ? "warning" : "success"} sx={{ mb: 2 }}>
              <strong>Faktur po filtrach:</strong> {totalFiltered}<br />
              <strong>Prawidłowe faktury:</strong> {validCount}<br />
              {invalidCount > 0 && (
                <>
                  <strong>Faktury z błędami:</strong> {invalidCount} (zostaną pominięte)
                </>
              )}
            </Alert>

            {invalidCount > 0 && (
              <>
                <Typography variant="subtitle2" color="error" sx={{ mt: 2, mb: 1 }}>
                  <WarningIcon sx={{ verticalAlign: 'middle', mr: 1 }} />
                  Faktury z błędami walidacji:
                </Typography>
                
                <List dense sx={{ maxHeight: 300, overflow: 'auto', bgcolor: 'background.paper' }}>
                  {validationResults
                    .filter(r => !r.validation.isValid)
                    .map((result, idx) => (
                      <ListItem key={idx} divider>
                        <ListItemText
                          primary={result.invoice.number || `Faktura ${idx + 1}`}
                          secondary={
                            <span style={{ color: 'red' }}>
                              {result.validation.errors.join(', ')}
                            </span>
                          }
                        />
                      </ListItem>
                    ))}
                </List>
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>
            Anuluj
          </Button>
          <Button
            onClick={handleExport}
            variant="contained"
            color="success"
            disabled={exporting || validCount === 0}
            startIcon={exporting ? <CircularProgress size={20} /> : <GetAppIcon />}
          >
            {exporting ? 'Eksportuję...' : `Eksportuj ${validCount} faktur do XML`}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default InvoiceOptimaExport;
