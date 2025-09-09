import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  FormControl,
  InputLabel,
  Select,
  CircularProgress,
  Typography,
  Divider
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl } from 'date-fns/locale';
import { subYears, format } from 'date-fns';
import { getAllSuppliers } from '../../services/supplierService';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';

const PurchaseOrderReportDialog = ({ open, onClose, onGenerate }) => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  
  // Domyślne daty - ostatni rok
  const [dateFrom, setDateFrom] = useState(() => subYears(new Date(), 1));
  const [dateTo, setDateTo] = useState(() => new Date());
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [selectedSupplierName, setSelectedSupplierName] = useState('');

  useEffect(() => {
    if (open) {
      loadSuppliers();
    }
  }, [open]);

  const loadSuppliers = async () => {
    setLoading(true);
    try {
      const suppliersData = await getAllSuppliers();
      setSuppliers(suppliersData || []);
    } catch (error) {
      console.error('Błąd podczas ładowania dostawców:', error);
      showError('Błąd podczas ładowania listy dostawców');
    } finally {
      setLoading(false);
    }
  };

  const handleSupplierChange = (event) => {
    const supplierId = event.target.value;
    setSelectedSupplierId(supplierId);
    
    if (supplierId === '') {
      setSelectedSupplierName('');
    } else {
      const supplier = suppliers.find(s => s.id === supplierId);
      setSelectedSupplierName(supplier ? supplier.name : '');
    }
  };

  const generateReport = async () => {
    if (!dateFrom || !dateTo) {
      showError('Proszę wybrać zakres dat');
      return;
    }

    if (dateFrom > dateTo) {
      showError('Data początkowa nie może być późniejsza niż data końcowa');
      return;
    }

    setGenerating(true);
    try {
      // Wywołaj funkcję przekazaną przez parent component
      await onGenerate({
        dateFrom,
        dateTo,
        supplierId: selectedSupplierId || null,
        supplierName: selectedSupplierName || 'Wszyscy dostawcy'
      });
      
      showSuccess('Raport został wygenerowany i pobrany');
      onClose();
    } catch (error) {
      console.error('Błąd podczas generowania raportu:', error);
      showError('Błąd podczas generowania raportu');
    } finally {
      setGenerating(false);
    }
  };

  const handleClose = () => {
    if (!generating) {
      onClose();
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          Generowanie raportu Purchase Orders (Excel)
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
            
            {/* Zakres dat */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                Zakres dat
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <DatePicker
                  label="Data od"
                  value={dateFrom}
                  onChange={(newValue) => setDateFrom(newValue)}
                  renderInput={(params) => <TextField {...params} fullWidth />}
                  disabled={generating}
                />
                <DatePicker
                  label="Data do"
                  value={dateTo}
                  onChange={(newValue) => setDateTo(newValue)}
                  renderInput={(params) => <TextField {...params} fullWidth />}
                  disabled={generating}
                />
              </Box>
            </Box>

            <Divider />

            {/* Wybór dostawcy */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                Dostawca
              </Typography>
              <FormControl fullWidth disabled={loading || generating}>
                <InputLabel>Wybierz dostawcę</InputLabel>
                <Select
                  value={selectedSupplierId}
                  onChange={handleSupplierChange}
                  label="Wybierz dostawcę"
                >
                  <MenuItem value="">
                    <em>Wszyscy dostawcy</em>
                  </MenuItem>
                  {suppliers.map((supplier) => (
                    <MenuItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 1 }}>
                  <CircularProgress size={20} />
                </Box>
              )}
            </Box>

            <Divider />

            {/* Podsumowanie */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                Podsumowanie raportu
              </Typography>
              <Typography variant="body2" color="textSecondary">
                <strong>Okres:</strong> {dateFrom ? format(dateFrom, 'dd.MM.yyyy') : '---'} - {dateTo ? format(dateTo, 'dd.MM.yyyy') : '---'}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                <strong>Dostawca:</strong> {selectedSupplierName || 'Wszyscy dostawcy'}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                Raport Excel będzie zawierał 4 arkusze: Podsumowanie PO, Pozycje szczegółowe, Podsumowanie pozycji i Statystyki dostawców.
              </Typography>
            </Box>
          </Box>
        </DialogContent>

        <DialogActions sx={{ p: 3 }}>
          <Button 
            onClick={handleClose} 
            disabled={generating}
            color="inherit"
          >
            Anuluj
          </Button>
          <Button 
            onClick={generateReport}
            variant="contained"
            disabled={generating || loading}
            startIcon={generating ? <CircularProgress size={16} /> : null}
          >
            {generating ? 'Generowanie...' : 'Generuj raport Excel'}
          </Button>
        </DialogActions>
      </Dialog>
    </LocalizationProvider>
  );
};

export default PurchaseOrderReportDialog;
