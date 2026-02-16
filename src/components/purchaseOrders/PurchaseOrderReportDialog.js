import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  CircularProgress,
  Typography,
  Divider,
  Autocomplete
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { pl, enUS } from 'date-fns/locale';
import { subYears, format } from 'date-fns';
import { getAllInventoryItems } from '../../services/inventory';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';

const PurchaseOrderReportDialog = ({ open, onClose, onGenerate }) => {
  const { t, currentLanguage } = useTranslation('purchaseOrders');
  const { showSuccess, showError } = useNotification();
  
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [inventoryItems, setInventoryItems] = useState([]);
  
  // Domyślne daty - ostatni rok
  const [dateFrom, setDateFrom] = useState(() => subYears(new Date(), 1));
  const [dateTo, setDateTo] = useState(() => new Date());
  const [selectedItem, setSelectedItem] = useState(null);

  useEffect(() => {
    if (open) {
      loadInventoryItems();
    }
  }, [open]);

  const loadInventoryItems = async () => {
    setLoading(true);
    try {
      const itemsData = await getAllInventoryItems();
      // Filtruj pozycje - usuń kategorie "Gotowe produkty" i "Inne"
      const filteredItems = (itemsData || []).filter(item => 
        item.category !== 'Gotowe produkty' && item.category !== 'Inne'
      );
      setInventoryItems(filteredItems);
    } catch (error) {
      console.error('Błąd podczas ładowania pozycji magazynowych:', error);
      showError('Błąd podczas ładowania listy pozycji magazynowych');
    } finally {
      setLoading(false);
    }
  };

  const handleItemChange = (event, newValue) => {
    setSelectedItem(newValue);
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
        itemId: selectedItem?.id || null,
        itemName: selectedItem?.name || 'Wszystkie pozycje'
      });
      
      showSuccess('Eksport został wygenerowany i pobrany');
      onClose();
    } catch (error) {
      console.error('Błąd podczas generowania eksportu:', error);
      showError('Błąd podczas generowania eksportu');
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
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          Eksport Purchase Orders
        </DialogTitle>
        
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
            
            {/* Zakres dat */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                Zakres oczekiwanych dat dostawy
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <DatePicker
                  label="Oczekiwana dostawa od"
                  value={dateFrom}
                  onChange={(newValue) => setDateFrom(newValue)}
                  renderInput={(params) => <TextField {...params} fullWidth />}
                  disabled={generating}
                />
                <DatePicker
                  label="Oczekiwana dostawa do"
                  value={dateTo}
                  onChange={(newValue) => setDateTo(newValue)}
                  renderInput={(params) => <TextField {...params} fullWidth />}
                  disabled={generating}
                />
              </Box>
            </Box>

            <Divider />

            {/* Wybór pozycji magazynowej */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 'bold' }}>
                Pozycja magazynowa
              </Typography>
              <Autocomplete
                fullWidth
                disabled={loading || generating}
                options={inventoryItems}
                value={selectedItem}
                onChange={handleItemChange}
                getOptionLabel={(option) => option?.name || ''}
                isOptionEqualToValue={(option, value) => option?.id === value?.id}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('searchItemOrLeaveEmpty')}
                    placeholder={t('startTypingItemName')}
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {loading ? <CircularProgress color="inherit" size={20} /> : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
                renderOption={(props, option) => (
                  <Box component="li" {...props} key={option.id}>
                    <Box>
                      <Typography variant="body2" fontWeight="medium">
                        {option.name}
                      </Typography>
                      {option.category && (
                        <Typography variant="caption" color="textSecondary">
                          Kategoria: {option.category}
                        </Typography>
                      )}
                    </Box>
                  </Box>
                )}
                noOptionsText={loading ? "Ładowanie..." : "Brak wyników"}
                clearText="Wyczyść"
                closeText="Zamknij"
                openText="Otwórz"
              />
            </Box>

            <Divider />

            {/* Podsumowanie */}
            <Box>
              <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                Podsumowanie eksportu
              </Typography>
              <Typography variant="body2" color="textSecondary">
                <strong>Oczekiwana dostawa:</strong> {dateFrom ? format(dateFrom, 'dd.MM.yyyy') : '---'} - {dateTo ? format(dateTo, 'dd.MM.yyyy') : '---'}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                <strong>Pozycja:</strong> {selectedItem?.name || 'Wszystkie pozycje'}
              </Typography>
              <Typography variant="body2" color="textSecondary" sx={{ mt: 1 }}>
                Plik Excel będzie zawierał 4 arkusze: Podsumowanie PO, Pozycje szczegółowe, Podsumowanie pozycji i Statystyki dostawców.
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
            {generating ? 'Generowanie...' : 'Generuj eksport'}
          </Button>
        </DialogActions>
      </Dialog>
    </LocalizationProvider>
  );
};

export default PurchaseOrderReportDialog;
