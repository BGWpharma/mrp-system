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
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox,
  Tabs,
  Tab,
  CircularProgress,
  InputAdornment
} from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';

const RawMaterialsDialog = memo(({
  open,
  onClose,
  onSubmit,
  items = [],
  filteredItems = [],
  searchValue = '',
  onSearchChange,
  categoryTab = 0,
  onCategoryTabChange,
  loading = false,
  onItemSelection,
  onQuantityChange,
  t = (key) => key
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>Dodaj surowiec do zadania</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Wybierz surowiec lub opakowanie jednostkowe, które chcesz dodać do zadania produkcyjnego.
          <br />
          <strong>Uwaga:</strong> Możesz dodać dowolną ilość - to jest tylko planowanie, nie rezerwacja materiałów.
        </DialogContentText>

        <Tabs
          value={categoryTab}
          onChange={(e, newValue) => onCategoryTabChange(newValue)}
          sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
        >
          <Tab label="Surowce" />
          <Tab label="Opakowania jednostkowe" />
        </Tabs>

        <TextField
          fullWidth
          margin="normal"
          label={categoryTab === 0 ? "Wyszukaj surowiec" : "Wyszukaj opakowanie jednostkowe"}
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
                  <TableCell>Dostępna ilość</TableCell>
                  <TableCell>{t('consumption.quantityToAdd')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      {items.length === 0
                        ? "Brak dostępnych materiałów"
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
                      <TableCell>
                        <Box>
                          <Typography variant="body2">
                            {item.availableQuantity} {item.unit}
                          </Typography>
                          {item.selected && item.quantity > item.availableQuantity && (
                            <Typography variant="caption" color="warning.main">
                              ⚠️ Więcej niż dostępne
                            </Typography>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          value={item.quantity || ''}
                          onChange={(e) => onQuantityChange(item.id, e.target.value)}
                          disabled={!item.selected}
                          inputProps={{ min: 0, step: 'any' }}
                          size="small"
                          sx={{
                            width: '100px',
                            '& .MuiOutlinedInput-root': {
                              borderColor: item.selected && item.quantity > item.availableQuantity ? 'warning.main' : undefined
                            }
                          }}
                          placeholder={t('consumption.quantityToAdd')}
                          color={item.selected && item.quantity > item.availableQuantity ? 'warning' : 'primary'}
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
          color="secondary"
          disabled={loading || items.filter(item => item.selected && item.quantity > 0).length === 0}
        >
          {loading ? <CircularProgress size={24} /> : 'Dodaj wybrane materiały'}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

RawMaterialsDialog.displayName = 'RawMaterialsDialog';

export default RawMaterialsDialog;
