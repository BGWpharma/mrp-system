import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Paper,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  InputAdornment,
  FormControlLabel,
  Checkbox
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Check as CheckIcon
} from '@mui/icons-material';
import { getSupplierPrices, addSupplierPrice, updateSupplierPrice, deleteSupplierPrice, setDefaultSupplierPrice } from '../../services/inventoryService';
import { getAllSuppliers } from '../../services/supplierService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { DEFAULT_CURRENCY } from '../../config';

/**
 * Komponent do zarządzania cenami dostawców dla pozycji magazynowej
 */
const SupplierPricesList = ({ itemId, currency = DEFAULT_CURRENCY }) => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [supplierPrices, setSupplierPrices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  
  const [formData, setFormData] = useState({
    supplierId: '',
    price: '',
    minQuantity: 1,
    leadTime: 7,
    notes: '',
    isDefault: false
  });
  
  useEffect(() => {
    if (itemId) {
      fetchSupplierPrices();
    }
  }, [itemId]);
  
  // Pobieranie cen dostawców dla pozycji
  const fetchSupplierPrices = async () => {
    try {
      setLoading(true);
      const data = await getSupplierPrices(itemId);
      
      // Najpierw pobieramy dostawców, jeśli jeszcze nie zostali pobrani
      if (suppliers.length === 0) {
        const suppliersList = await getAllSuppliers();
        setSuppliers(suppliersList);
        
        // Dodajemy dane dostawcy do każdej ceny
        const pricesWithSupplierDetails = data.map((price) => {
          const supplier = suppliersList.find(s => s.id === price.supplierId);
          return {
            ...price,
            supplierName: supplier ? supplier.name : 'Nieznany dostawca'
          };
        });
        
        setSupplierPrices(pricesWithSupplierDetails);
      } else {
        // Dodajemy dane dostawcy do każdej ceny
        const pricesWithSupplierDetails = data.map((price) => {
          const supplier = suppliers.find(s => s.id === price.supplierId);
          return {
            ...price,
            supplierName: supplier ? supplier.name : 'Nieznany dostawca'
          };
        });
        
        setSupplierPrices(pricesWithSupplierDetails);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania cen dostawców:', error);
      showError('Nie udało się pobrać cen dostawców');
    } finally {
      setLoading(false);
    }
  };
  
  // Obsługa otwierania formularza dodawania/edycji
  const handleOpenDialog = (item = null) => {
    if (item) {
      setFormData({
        supplierId: item.supplierId,
        price: item.price,
        minQuantity: item.minQuantity || 1,
        leadTime: item.leadTime || 7,
        notes: item.notes || '',
        isDefault: item.isDefault || false
      });
      setEditingId(item.id);
    } else {
      setFormData({
        supplierId: '',
        price: '',
        minQuantity: 1,
        leadTime: 7,
        notes: '',
        isDefault: false
      });
      setEditingId(null);
    }
    setDialogOpen(true);
  };
  
  // Obsługa zamykania dialogu
  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
  };
  
  // Obsługa zmiany pól formularza
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'price' || name === 'minQuantity' || name === 'leadTime' 
        ? parseFloat(value) || 0
        : value
    }));
  };
  
  // Zapisywanie ceny dostawcy
  const handleSavePrice = async () => {
    try {
      if (!formData.supplierId) {
        showError('Wybierz dostawcę');
        return;
      }
      
      if (!formData.price || formData.price <= 0) {
        showError('Podaj prawidłową cenę');
        return;
      }
      
      const supplierPriceData = {
        itemId,
        supplierId: formData.supplierId,
        price: parseFloat(formData.price),
        minQuantity: parseInt(formData.minQuantity) || 1,
        leadTime: parseInt(formData.leadTime) || 7,
        notes: formData.notes,
        currency,
        isDefault: formData.isDefault
      };
      
      if (editingId) {
        // Aktualizacja istniejącej ceny
        await updateSupplierPrice(editingId, supplierPriceData, currentUser.uid);
        showSuccess('Cena dostawcy została zaktualizowana');
      } else {
        // Dodawanie nowej ceny
        await addSupplierPrice(supplierPriceData, currentUser.uid);
        showSuccess('Cena dostawcy została dodana');
      }
      
      handleCloseDialog();
      fetchSupplierPrices();
    } catch (error) {
      console.error('Błąd podczas zapisywania ceny dostawcy:', error);
      showError(error.message || 'Nie udało się zapisać ceny dostawcy');
    }
  };
  
  // Obsługa otwierania dialogu usuwania
  const handleDeleteClick = (item) => {
    setItemToDelete(item);
    setDeleteDialogOpen(true);
  };
  
  // Usuwanie ceny dostawcy
  const handleDeleteConfirm = async () => {
    try {
      if (!itemToDelete) return;
      
      await deleteSupplierPrice(itemToDelete.id);
      setSupplierPrices(supplierPrices.filter(item => item.id !== itemToDelete.id));
      showSuccess('Cena dostawcy została usunięta');
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    } catch (error) {
      console.error('Błąd podczas usuwania ceny dostawcy:', error);
      showError('Nie udało się usunąć ceny dostawcy');
    }
  };
  
  // Dodaję nową funkcję do ustawiania domyślnej ceny
  const handleSetDefaultPrice = async (priceId) => {
    try {
      await setDefaultSupplierPrice(itemId, priceId);
      
      // Aktualizuj lokalny stan - odznacz wszystkie inne ceny i oznacz wybraną jako domyślną
      const updatedPrices = supplierPrices.map(price => ({
        ...price,
        isDefault: price.id === priceId
      }));
      
      setSupplierPrices(updatedPrices);
      showSuccess('Ustawiono domyślną cenę dostawcy');
    } catch (error) {
      console.error('Błąd podczas ustawiania domyślnej ceny:', error);
      showError('Nie udało się ustawić domyślnej ceny');
    }
  };
  
  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Ceny dostawców</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Dodaj cenę dostawcy
        </Button>
      </Box>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      ) : supplierPrices.length === 0 ? (
        <Paper sx={{ p: 2 }}>
          <Typography variant="body1" color="textSecondary" align="center">
            Brak przypisanych cen dostawców. Kliknij "Dodaj cenę dostawcy", aby przypisać pierwszego dostawcę.
          </Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Dostawca</TableCell>
                <TableCell align="right">Cena</TableCell>
                <TableCell align="right">Min. ilość</TableCell>
                <TableCell align="right">Czas dostawy (dni)</TableCell>
                <TableCell>Uwagi</TableCell>
                <TableCell align="center">Domyślna</TableCell>
                <TableCell align="right">Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {supplierPrices.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.supplierName || 'Nieznany dostawca'}</TableCell>
                  <TableCell align="right">
                    {item.price.toFixed(2)} {item.currency || currency}
                  </TableCell>
                  <TableCell align="right">{item.minQuantity || 1}</TableCell>
                  <TableCell align="right">{item.leadTime || 7}</TableCell>
                  <TableCell>{item.notes}</TableCell>
                  <TableCell align="center">
                    <IconButton
                      color={item.isDefault ? "primary" : "default"}
                      onClick={() => handleSetDefaultPrice(item.id)}
                      size="small"
                      title={item.isDefault ? "Domyślna cena" : "Ustaw jako domyślną"}
                    >
                      <CheckIcon />
                    </IconButton>
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => handleOpenDialog(item)}
                      aria-label="edytuj"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteClick(item)}
                      aria-label="usuń"
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
      
      {/* Dialog dodawania/edycji ceny dostawcy */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingId ? 'Edytuj cenę dostawcy' : 'Dodaj cenę dostawcy'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel>Dostawca</InputLabel>
              <Select
                name="supplierId"
                value={formData.supplierId}
                onChange={handleInputChange}
                label="Dostawca"
                disabled={!!editingId}
              >
                <MenuItem value="">
                  <em>Wybierz dostawcę</em>
                </MenuItem>
                {suppliers.map((supplier) => (
                  <MenuItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            
            <TextField
              fullWidth
              type="number"
              label="Cena"
              name="price"
              value={formData.price}
              onChange={handleInputChange}
              InputProps={{
                endAdornment: <InputAdornment position="end">{currency}</InputAdornment>,
                inputProps: { min: 0, step: 0.01 }
              }}
              sx={{ mb: 2 }}
            />
            
            <TextField
              fullWidth
              type="number"
              label="Minimalna ilość"
              name="minQuantity"
              value={formData.minQuantity}
              onChange={handleInputChange}
              InputProps={{
                inputProps: { min: 1 }
              }}
              sx={{ mb: 2 }}
            />
            
            <TextField
              fullWidth
              type="number"
              label="Czas dostawy (dni)"
              name="leadTime"
              value={formData.leadTime}
              onChange={handleInputChange}
              InputProps={{
                inputProps: { min: 1 }
              }}
              sx={{ mb: 2 }}
            />
            
            <TextField
              fullWidth
              label="Uwagi"
              name="notes"
              value={formData.notes}
              onChange={handleInputChange}
              multiline
              rows={2}
            />
            
            <FormControlLabel
              control={
                <Checkbox
                  checked={formData.isDefault}
                  onChange={(e) => setFormData(prev => ({ ...prev, isDefault: e.target.checked }))}
                  name="isDefault"
                  color="primary"
                />
              }
              label="Ustaw jako domyślną cenę dostawcy"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog} startIcon={<CancelIcon />}>
            Anuluj
          </Button>
          <Button onClick={handleSavePrice} color="primary" startIcon={<SaveIcon />}>
            Zapisz
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog potwierdzenia usunięcia */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <Typography>
            Czy na pewno chcesz usunąć cenę dostawcy {itemToDelete?.supplierName}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleDeleteConfirm} color="error">
            Usuń
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

SupplierPricesList.propTypes = {
  itemId: PropTypes.string.isRequired,
  currency: PropTypes.string
};

export default SupplierPricesList; 