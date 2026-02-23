import React, { memo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Box,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  CircularProgress,
  FormControlLabel,
  Switch,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';
import { formatDate } from '../../../utils/formatters';

const PackagingDialog = memo(({
  open,
  onClose,
  onSubmit,
  items = [],
  filteredItems = [],
  searchValue = '',
  onSearchChange,
  consumeImmediately = true,
  onConsumeImmediatelyChange,
  loading = false,
  onItemSelection,
  onBatchSelection,
  onBatchQuantityChange,
  t = (key) => key
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>Dodaj opakowania do zadania</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Wybierz opakowania, które chcesz dodać do zadania produkcyjnego.
        </DialogContentText>

        <TextField
          fullWidth
          margin="normal"
          label="Wyszukaj opakowanie"
          variant="outlined"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
        />

        <FormControlLabel
          control={
            <Switch
              checked={consumeImmediately}
              onChange={(e) => onConsumeImmediatelyChange(e.target.checked)}
              color="primary"
            />
          }
          label="Konsumuj opakowania natychmiast z wybranych partii"
          sx={{ mb: 2 }}
        />

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">Wybierz</TableCell>
                  <TableCell>Nazwa</TableCell>
                  <TableCell>Kategoria</TableCell>
                  <TableCell>Dostępne partie</TableCell>
                  <TableCell>Wybrana partia</TableCell>
                  <TableCell>{t('consumption.quantityToAdd')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      {items.length === 0
                        ? "Brak dostępnych opakowań"
                        : "Brak wyników dla podanego wyszukiwania"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={item.selected}
                          onChange={(e) => onItemSelection(item.id, e.target.checked)}
                        />
                      </TableCell>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>
                        {item.batches && item.batches.length > 0
                          ? `${item.batches.length} partii dostępnych`
                          : 'Brak dostępnych partii'}
                      </TableCell>
                      <TableCell>
                        <FormControl fullWidth size="small" disabled={!item.selected}>
                          <InputLabel>{t('common:common.selectBatch')}</InputLabel>
                          <Select
                            value={item.selectedBatch?.id || ''}
                            onChange={(e) => onBatchSelection(item.id, e.target.value)}
                            label={t('common:common.selectBatch')}
                          >
                            {item.batches && item.batches.map((batch) => (
                              <MenuItem key={batch.id} value={batch.id}>
                                {`LOT: ${batch.lotNumber || batch.batchNumber || 'Brak numeru'} - ${batch.quantity} ${item.unit}${batch.expiryDate ? ` (Ważne do: ${formatDate(batch.expiryDate)})` : ''}`}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          value={item.batchQuantity || ''}
                          onChange={(e) => onBatchQuantityChange(item.id, e.target.value)}
                          onWheel={(e) => e.target.blur()}
                          disabled={!item.selected || !item.selectedBatch}
                          inputProps={{
                            min: 0,
                            max: item.selectedBatch ? item.selectedBatch.quantity : 0,
                            step: 'any'
                          }}
                          size="small"
                          sx={{ width: 130 }}
                          placeholder={item.selectedBatch ? `Max: ${item.selectedBatch.quantity}` : '0'}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>
          Anuluj
        </Button>
        <Button
          onClick={onSubmit}
          variant="contained"
          color="primary"
          disabled={loading || items.filter(item => item.selected && item.selectedBatch && item.batchQuantity > 0).length === 0}
        >
          {loading ? <CircularProgress size={24} /> : 'Dodaj wybrane opakowania'}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

PackagingDialog.displayName = 'PackagingDialog';

export default PackagingDialog;
