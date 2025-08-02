import React, { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Warehouse as WarehouseIcon
} from '@mui/icons-material';
import { getAllWarehouses, createWarehouse, updateWarehouse, deleteWarehouse } from '../../services/inventory';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';

const WarehousesList = () => {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState('add'); // 'add' lub 'edit'
  const [selectedWarehouse, setSelectedWarehouse] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    description: ''
  });
  const [saving, setSaving] = useState(false);

  const { showSuccess, showError } = useNotification();
  const { currentUser } = useAuth();

  useEffect(() => {
    fetchWarehouses();
  }, []);

  const fetchWarehouses = async () => {
    setLoading(true);
    try {
      const warehousesList = await getAllWarehouses();
      setWarehouses(warehousesList);
    } catch (error) {
      showError('Błąd podczas pobierania magazynów: ' + error.message);
      console.error('Error fetching warehouses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (mode, warehouse = null) => {
    setDialogMode(mode);
    setSelectedWarehouse(warehouse);
    
    if (mode === 'edit' && warehouse) {
      setFormData({
        name: warehouse.name || '',
        address: warehouse.address || '',
        description: warehouse.description || ''
      });
    } else {
      setFormData({
        name: '',
        address: '',
        description: ''
      });
    }
    
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedWarehouse(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      showError('Nazwa magazynu jest wymagana');
      return;
    }
    
    setSaving(true);
    
    try {
      if (dialogMode === 'add') {
        await createWarehouse(formData, currentUser.uid);
        showSuccess('Magazyn został utworzony');
      } else {
        await updateWarehouse(selectedWarehouse.id, formData, currentUser.uid);
        showSuccess('Magazyn został zaktualizowany');
      }
      
      handleCloseDialog();
      fetchWarehouses();
    } catch (error) {
      showError('Błąd podczas zapisywania magazynu: ' + error.message);
      console.error('Error saving warehouse:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteWarehouse = async (warehouseId) => {
    if (!window.confirm('Czy na pewno chcesz usunąć ten magazyn? Ta operacja jest nieodwracalna.')) {
      return;
    }
    
    try {
      await deleteWarehouse(warehouseId);
      showSuccess('Magazyn został usunięty');
      fetchWarehouses();
    } catch (error) {
      showError('Błąd podczas usuwania magazynu: ' + error.message);
      console.error('Error deleting warehouse:', error);
    }
  };

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h5">Magazyny</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog('add')}
        >
          Dodaj magazyn
        </Button>
      </Box>

      <Paper sx={{ width: '100%', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: 440 }}>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Table stickyHeader aria-label="sticky table">
              <TableHead>
                <TableRow>
                  <TableCell>Nazwa</TableCell>
                  <TableCell>Adres</TableCell>
                  <TableCell>Opis</TableCell>
                  <TableCell align="right">Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {warehouses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center">
                      <Typography variant="body1" sx={{ py: 2 }}>
                        Brak magazynów. Dodaj pierwszy magazyn, aby rozpocząć.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  warehouses.map((warehouse) => (
                    <TableRow key={warehouse.id} hover>
                      <TableCell>{warehouse.name}</TableCell>
                      <TableCell>{warehouse.address}</TableCell>
                      <TableCell>{warehouse.description}</TableCell>
                      <TableCell align="right">
                        <IconButton
                          color="primary"
                          onClick={() => handleOpenDialog('edit', warehouse)}
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          color="error"
                          onClick={() => handleDeleteWarehouse(warehouse.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      </Paper>

      {/* Dialog do dodawania/edycji magazynu */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {dialogMode === 'add' ? 'Dodaj nowy magazyn' : 'Edytuj magazyn'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                name="name"
                label="Nazwa magazynu"
                value={formData.name}
                onChange={handleFormChange}
                fullWidth
                required
                error={!formData.name.trim()}
                helperText={!formData.name.trim() ? 'Nazwa jest wymagana' : ''}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="address"
                label="Adres"
                value={formData.address}
                onChange={handleFormChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="description"
                label="Opis"
                value={formData.description}
                onChange={handleFormChange}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Anuluj</Button>
          <Button
            onClick={handleSubmit}
            variant="contained"
            color="primary"
            disabled={saving || !formData.name.trim()}
          >
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default WarehousesList; 