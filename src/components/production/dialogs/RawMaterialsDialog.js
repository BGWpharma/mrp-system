/**
 * Dialog do dodawania surowców do zadania produkcyjnego
 * Wydzielony z TaskDetailsPage.js dla lepszej organizacji kodu
 */

import React, { useState, useCallback, useEffect, memo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Alert,
  TextField,
  Typography,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Paper,
  InputAdornment,
  Tabs,
  Tab
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';

const RawMaterialsDialog = memo(({
  open,
  onClose,
  onSubmit,
  inventoryItems = [],
  loading = false,
  loadingItems = false,
  t = (key) => key
}) => {
  const [search, setSearch] = useState('');
  const [categoryTab, setCategoryTab] = useState(0); // 0 = Surowce, 1 = Opakowania jednostkowe
  const [selectedItems, setSelectedItems] = useState({});
  const [quantities, setQuantities] = useState({});
  const [error, setError] = useState(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSearch('');
      setCategoryTab(0);
      setSelectedItems({});
      setQuantities({});
      setError(null);
    }
  }, [open]);

  const handleSelectionChange = useCallback((id, selected) => {
    setSelectedItems(prev => ({
      ...prev,
      [id]: selected
    }));
  }, []);

  const handleQuantityChange = useCallback((id, value) => {
    setQuantities(prev => ({
      ...prev,
      [id]: value
    }));
  }, []);

  const handleSubmit = useCallback(async () => {
    const selectedItemsList = Object.entries(selectedItems)
      .filter(([_, selected]) => selected)
      .map(([id]) => {
        const item = inventoryItems.find(p => p.id === id);
        return {
          ...item,
          quantity: parseFloat(quantities[id]) || 1
        };
      });

    if (selectedItemsList.length === 0) {
      setError('Wybierz przynajmniej jeden materiał');
      return;
    }

    // Sprawdź czy wszystkie mają ustawioną ilość
    const itemsWithoutQuantity = selectedItemsList.filter(item => !quantities[item.id] || parseFloat(quantities[item.id]) <= 0);
    if (itemsWithoutQuantity.length > 0) {
      setError('Podaj ilość dla wszystkich wybranych materiałów');
      return;
    }

    setError(null);
    
    const result = await onSubmit({
      items: selectedItemsList
    });
    
    if (result?.success) {
      onClose();
    } else if (result?.error) {
      setError(result.error.message || 'Wystąpił błąd');
    }
  }, [selectedItems, quantities, inventoryItems, onSubmit, onClose]);

  const handleClose = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  // Filtruj materiały według kategorii i wyszukiwania
  const filteredItems = React.useMemo(() => {
    let items = inventoryItems;
    
    // Filtruj według kategorii
    const categoryFilters = {
      0: ['Surowce', 'Surowiec', 'Raw material', 'Raw materials'],
      1: ['Opakowania jednostkowe', 'Opakowanie jednostkowe', 'Unit packaging']
    };
    
    const categoryKeywords = categoryFilters[categoryTab] || [];
    items = items.filter(item => 
      categoryKeywords.some(keyword => 
        item.category?.toLowerCase().includes(keyword.toLowerCase())
      )
    );
    
    // Filtruj według wyszukiwania
    if (search.trim()) {
      const searchLower = search.toLowerCase();
      items = items.filter(item => 
        item.name?.toLowerCase().includes(searchLower) ||
        item.sku?.toLowerCase().includes(searchLower)
      );
    }
    
    return items;
  }, [inventoryItems, categoryTab, search]);

  const selectedCount = Object.values(selectedItems).filter(Boolean).length;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        Dodaj materiały do zadania
        {selectedCount > 0 && (
          <Typography variant="body2" color="primary" component="span" sx={{ ml: 2 }}>
            (wybrano: {selectedCount})
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
          <Tabs value={categoryTab} onChange={(_, v) => setCategoryTab(v)}>
            <Tab label="Surowce" />
            <Tab label="Opakowania jednostkowe" />
          </Tabs>
        </Box>

        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            placeholder="Szukaj materiałów..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              )
            }}
            size="small"
          />
        </Box>

        {loadingItems ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : filteredItems.length === 0 ? (
          <Alert severity="info">
            {search.trim() 
              ? 'Nie znaleziono materiałów pasujących do wyszukiwania'
              : 'Brak dostępnych materiałów w tej kategorii'}
          </Alert>
        ) : (
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      indeterminate={selectedCount > 0 && selectedCount < filteredItems.length}
                      checked={selectedCount === filteredItems.length && filteredItems.length > 0}
                      onChange={(e) => {
                        const newSelection = {};
                        filteredItems.forEach(item => {
                          newSelection[item.id] = e.target.checked;
                        });
                        setSelectedItems(newSelection);
                      }}
                    />
                  </TableCell>
                  <TableCell>Nazwa</TableCell>
                  <TableCell>Kategoria</TableCell>
                  <TableCell>Dostępna ilość</TableCell>
                  <TableCell>Jednostka</TableCell>
                  <TableCell>Ilość do dodania *</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow 
                    key={item.id}
                    hover
                    selected={selectedItems[item.id]}
                    onClick={() => handleSelectionChange(item.id, !selectedItems[item.id])}
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox
                        checked={selectedItems[item.id] || false}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleSelectionChange(item.id, e.target.checked)}
                      />
                    </TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.category || '—'}</TableCell>
                    <TableCell>{item.quantity?.toFixed(3) || 0}</TableCell>
                    <TableCell>{item.unit || 'szt.'}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <TextField
                        type="number"
                        size="small"
                        value={quantities[item.id] || ''}
                        onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                        placeholder="0"
                        inputProps={{ min: 0, step: 0.001 }}
                        disabled={!selectedItems[item.id]}
                        sx={{ width: 100 }}
                        required={selectedItems[item.id]}
                        error={selectedItems[item.id] && (!quantities[item.id] || parseFloat(quantities[item.id]) <= 0)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Anuluj
        </Button>
        <Button 
          onClick={handleSubmit} 
          variant="contained"
          color="primary"
          disabled={loading || selectedCount === 0}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {loading ? 'Dodawanie...' : `Dodaj (${selectedCount})`}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

RawMaterialsDialog.displayName = 'RawMaterialsDialog';

export default RawMaterialsDialog;

