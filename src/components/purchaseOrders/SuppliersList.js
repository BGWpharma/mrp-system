import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, TextField, Box, IconButton, Dialog,
  DialogActions, DialogContent, DialogContentText, DialogTitle
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Visibility as ViewIcon } from '@mui/icons-material';
import { getAllSuppliers, deleteSupplier } from '../../services/purchaseOrderService';
import { useNotification } from '../../hooks/useNotification';

const SuppliersList = () => {
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
      showError('Nie udało się pobrać listy dostawców');
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
      showSuccess('Dostawca został usunięty');
      setDeleteDialogOpen(false);
      setSupplierToDelete(null);
    } catch (error) {
      console.error('Błąd podczas usuwania dostawcy:', error);
      showError('Nie udało się usunąć dostawcy');
    }
  };
  
  if (loading) {
    return (
      <Container>
        <Typography variant="h6">Ładowanie dostawców...</Typography>
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
          Nowy Dostawca
        </Button>
      </Box>
      
      <Box sx={{ mb: 3 }}>
        <TextField
          label="Szukaj"
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={handleSearchChange}
          fullWidth
        />
      </Box>
      
      {filteredSuppliers.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1">Brak dostawców spełniających kryteria wyszukiwania</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nazwa</TableCell>
                <TableCell>Osoba kontaktowa</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Telefon</TableCell>
                <TableCell>Adres</TableCell>
                <TableCell>Akcje</TableCell>
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
                      : 'Brak adresu'
                    }
                  </TableCell>
                  <TableCell>
                    <IconButton color="primary" onClick={() => navigate(`/suppliers/${supplier.id}/view`)} title="Podgląd">
                      <ViewIcon />
                    </IconButton>
                    <IconButton color="secondary" onClick={() => navigate(`/suppliers/${supplier.id}/edit`)} title="Edytuj">
                      <EditIcon />
                    </IconButton>
                    <IconButton color="error" onClick={() => handleDeleteClick(supplier)} title="Usuń">
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
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć dostawcę {supplierToDelete?.name}? Tej operacji nie można cofnąć.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleDeleteConfirm} color="error">Usuń</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default SuppliersList; 