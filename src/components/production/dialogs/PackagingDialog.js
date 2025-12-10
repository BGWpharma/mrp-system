/**
 * Dialog do dodawania opakowań do zadania produkcyjnego
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
  FormControlLabel,
  Switch
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';

const PackagingDialog = memo(({
  open,
  onClose,
  onSubmit,
  packagingItems = [],
  loading = false,
  loadingItems = false,
  t = (key) => key
}) => {
  const [search, setSearch] = useState('');
  const [selectedItems, setSelectedItems] = useState({});
  const [quantities, setQuantities] = useState({});
  const [consumeImmediately, setConsumeImmediately] = useState(true);
  const [error, setError] = useState(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedItems({});
      setQuantities({});
      setConsumeImmediately(true);
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
        const item = packagingItems.find(p => p.id === id);
        return {
          ...item,
          quantity: parseFloat(quantities[id]) || 1
        };
      });

    if (selectedItemsList.length === 0) {
      setError('Wybierz przynajmniej jedno opakowanie');
      return;
    }

    setError(null);
    
    const result = await onSubmit({
      items: selectedItemsList,
      consumeImmediately
    });
    
    if (result?.success) {
      onClose();
    } else if (result?.error) {
      setError(result.error.message || 'Wystąpił błąd');
    }
  }, [selectedItems, quantities, consumeImmediately, packagingItems, onSubmit, onClose]);

  const handleClose = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  // Filtruj opakowania
  const filteredItems = React.useMemo(() => {
    if (!search.trim()) return packagingItems;
    
    const searchLower = search.toLowerCase();
    return packagingItems.filter(item => 
      item.name?.toLowerCase().includes(searchLower) ||
      item.sku?.toLowerCase().includes(searchLower)
    );
  }, [packagingItems, search]);

  const selectedCount = Object.values(selectedItems).filter(Boolean).length;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        Dodaj opakowania do zadania
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

        <Box sx={{ mb: 2 }}>
          <TextField
            fullWidth
            placeholder="Szukaj opakowań..."
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

        <FormControlLabel
          control={
            <Switch
              checked={consumeImmediately}
              onChange={(e) => setConsumeImmediately(e.target.checked)}
            />
          }
          label="Automatycznie konsumuj opakowania po dodaniu"
          sx={{ mb: 2 }}
        />

        {loadingItems ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : filteredItems.length === 0 ? (
          <Alert severity="info">
            {search.trim() 
              ? 'Nie znaleziono opakowań pasujących do wyszukiwania'
              : 'Brak dostępnych opakowań'}
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
                  <TableCell>SKU</TableCell>
                  <TableCell>Dostępna ilość</TableCell>
                  <TableCell>Ilość do dodania</TableCell>
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
                    <TableCell>{item.sku || '—'}</TableCell>
                    <TableCell>{item.quantity} {item.unit}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <TextField
                        type="number"
                        size="small"
                        value={quantities[item.id] || ''}
                        onChange={(e) => handleQuantityChange(item.id, e.target.value)}
                        placeholder="1"
                        inputProps={{ min: 0, step: 1 }}
                        disabled={!selectedItems[item.id]}
                        sx={{ width: 100 }}
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

PackagingDialog.displayName = 'PackagingDialog';

export default PackagingDialog;

