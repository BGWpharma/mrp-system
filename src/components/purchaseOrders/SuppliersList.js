import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import {
  Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, TextField, Box, IconButton, Dialog,
  DialogActions, DialogContent, DialogContentText, DialogTitle
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Visibility as ViewIcon } from '@mui/icons-material';
import { getAllSuppliers, deleteSupplier } from '../../services/supplierService';
import { useNotification } from '../../hooks/useNotification';

const SuppliersList = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();
  
  const [suppliers, setSuppliers] = useState([]);
  const [filteredSuppliers, setFilteredSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [supplierToDelete, setSupplierToDelete] = useState(null);
  
  useEffect(() => {
    fetchSuppliers();
  }, []);
  
  useEffect(() => {
    filterSuppliers();
  }, [searchTerm, suppliers]);
  
  const fetchSuppliers = async () => {
    try {
      setLoading(true);
      const data = await getAllSuppliers();
      setSuppliers(data);
      setFilteredSuppliers(data);
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania dostawców:', error);
      showError(t('suppliers.notifications.loadFailed'));
      setLoading(false);
    }
  };
  
  const filterSuppliers = () => {
    if (!searchTerm) {
      setFilteredSuppliers(suppliers);
      return;
    }
    
    const term = searchTerm.toLowerCase();
    const filtered = suppliers.filter(supplier => 
      supplier.name?.toLowerCase().includes(term) ||
      supplier.contactPerson?.toLowerCase().includes(term) ||
      supplier.email?.toLowerCase().includes(term) ||
      supplier.phone?.includes(term) ||
      supplier.taxId?.includes(term)
    );
    
    setFilteredSuppliers(filtered);
  };
  
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };
  
  const handleDeleteClick = (supplier) => {
    setSupplierToDelete(supplier);
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    try {
      await deleteSupplier(supplierToDelete.id);
      setSuppliers(suppliers.filter(s => s.id !== supplierToDelete.id));
      showSuccess(t('suppliers.notifications.deleted'));
      setDeleteDialogOpen(false);
      setSupplierToDelete(null);
    } catch (error) {
      console.error('Błąd podczas usuwania dostawcy:', error);
      showError(t('suppliers.notifications.deleteFailed'));
    }
  };
  
  if (loading) {
    return (
      <Container>
        <Typography variant="h6">{t('suppliers.loading')}</Typography>
      </Container>
    );
  }
  
  return (
    <Container>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 3 }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => navigate('/suppliers/new')}
        >
          {t('suppliers.newSupplier')}
        </Button>
      </Box>
      
      <Box sx={{ mb: 3 }}>
        <TextField
          label={t('suppliers.search')}
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={handleSearchChange}
          fullWidth
        />
      </Box>
      
      {filteredSuppliers.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1">{t('suppliers.noResultsFound')}</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('suppliers.table.name')}</TableCell>
                <TableCell>{t('suppliers.table.contactPerson')}</TableCell>
                <TableCell>{t('suppliers.table.email')}</TableCell>
                <TableCell>{t('suppliers.table.phone')}</TableCell>
                <TableCell>{t('suppliers.table.address')}</TableCell>
                <TableCell>{t('suppliers.table.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredSuppliers.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell>{supplier.name}</TableCell>
                  <TableCell>{supplier.contactPerson}</TableCell>
                  <TableCell>{supplier.email}</TableCell>
                  <TableCell>{supplier.phone}</TableCell>
                  <TableCell>
                    {supplier.addresses && supplier.addresses.length > 0 
                      ? supplier.addresses.find(a => a.isMain)?.street || supplier.addresses[0].street
                      : t('suppliers.noAddress')
                    }
                  </TableCell>
                  <TableCell>
                    <IconButton color="primary" onClick={() => navigate(`/suppliers/${supplier.id}/view`)} title={t('suppliers.actions.view')}>
                      <ViewIcon />
                    </IconButton>
                    <IconButton color="secondary" onClick={() => navigate(`/suppliers/${supplier.id}/edit`)} title={t('suppliers.actions.edit')}>
                      <EditIcon />
                    </IconButton>
                    <IconButton color="error" onClick={() => handleDeleteClick(supplier)} title={t('suppliers.actions.delete')}>
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      
      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>{t('suppliers.confirmDelete.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {t('suppliers.confirmDelete.message', { name: supplierToDelete?.name })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>{t('suppliers.confirmDelete.cancel')}</Button>
          <Button onClick={handleDeleteConfirm} color="error">{t('suppliers.confirmDelete.confirm')}</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default SuppliersList; 