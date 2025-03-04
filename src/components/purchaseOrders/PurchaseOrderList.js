import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Container, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Button, TextField, Box, Chip, IconButton, Dialog,
  DialogActions, DialogContent, DialogContentText, DialogTitle, MenuItem, Select, FormControl, InputLabel
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Visibility as ViewIcon } from '@mui/icons-material';
import { getAllPurchaseOrders, deletePurchaseOrder, updatePurchaseOrderStatus } from '../../services/purchaseOrderService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { STATUS_TRANSLATIONS, PURCHASE_ORDER_STATUSES } from '../../config';

const PurchaseOrderList = () => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [filteredPOs, setFilteredPOs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [poToDelete, setPoToDelete] = useState(null);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [poToUpdateStatus, setPoToUpdateStatus] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  
  useEffect(() => {
    fetchPurchaseOrders();
  }, []);
  
  useEffect(() => {
    filterPurchaseOrders();
  }, [searchTerm, statusFilter, purchaseOrders]);
  
  const fetchPurchaseOrders = async () => {
    try {
      setLoading(true);
      const data = await getAllPurchaseOrders();
      setPurchaseOrders(data);
      setFilteredPOs(data);
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania zamówień zakupu:', error);
      showError('Nie udało się pobrać listy zamówień zakupu');
      setLoading(false);
    }
  };
  
  const filterPurchaseOrders = () => {
    let filtered = [...purchaseOrders];
    
    // Filtrowanie po statusie
    if (statusFilter !== 'all') {
      filtered = filtered.filter(po => po.status === statusFilter);
    }
    
    // Filtrowanie po wyszukiwanym tekście
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(po => 
        po.number?.toLowerCase().includes(term) ||
        po.supplier?.name?.toLowerCase().includes(term)
      );
    }
    
    setFilteredPOs(filtered);
  };
  
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };
  
  const handleStatusFilterChange = (e) => {
    setStatusFilter(e.target.value);
  };
  
  const handleDeleteClick = (po) => {
    setPoToDelete(po);
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    try {
      await deletePurchaseOrder(poToDelete.id);
      setPurchaseOrders(purchaseOrders.filter(po => po.id !== poToDelete.id));
      showSuccess('Zamówienie zakupu zostało usunięte');
      setDeleteDialogOpen(false);
      setPoToDelete(null);
    } catch (error) {
      console.error('Błąd podczas usuwania zamówienia zakupu:', error);
      showError('Nie udało się usunąć zamówienia zakupu');
    }
  };
  
  const handleStatusClick = (po) => {
    setPoToUpdateStatus(po);
    setNewStatus(po.status);
    setStatusDialogOpen(true);
  };
  
  const handleStatusUpdate = async () => {
    try {
      await updatePurchaseOrderStatus(poToUpdateStatus.id, newStatus, currentUser.uid);
      
      // Aktualizacja stanu lokalnego
      const updatedPOs = purchaseOrders.map(po => {
        if (po.id === poToUpdateStatus.id) {
          return { ...po, status: newStatus };
        }
        return po;
      });
      
      setPurchaseOrders(updatedPOs);
      showSuccess('Status zamówienia zakupu został zaktualizowany');
      setStatusDialogOpen(false);
      setPoToUpdateStatus(null);
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu zamówienia:', error);
      showError('Nie udało się zaktualizować statusu zamówienia');
    }
  };
  
  const getStatusChip = (status) => {
    let label = STATUS_TRANSLATIONS[status] || status;
    let color = 'default';
    
    switch (status) {
      case PURCHASE_ORDER_STATUSES.DRAFT:
        color = 'default';
        break;
      case PURCHASE_ORDER_STATUSES.PENDING:
        color = 'primary';
        break;
      case PURCHASE_ORDER_STATUSES.CONFIRMED:
        color = 'info';
        break;
      case PURCHASE_ORDER_STATUSES.SHIPPED:
        color = 'secondary';
        break;
      case PURCHASE_ORDER_STATUSES.DELIVERED:
        color = 'success';
        break;
      case PURCHASE_ORDER_STATUSES.CANCELLED:
        color = 'error';
        break;
      case PURCHASE_ORDER_STATUSES.COMPLETED:
        color = 'success';
        break;
      default:
        break;
    }
    
    return <Chip label={label} color={color} />;
  };
  
  if (loading) {
    return (
      <Container>
        <Typography variant="h6">Ładowanie zamówień zakupu...</Typography>
      </Container>
    );
  }
  
  return (
    <Container>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Zamówienia Zakupu</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => navigate('/purchase-orders/new')}
        >
          Nowe Zamówienie
        </Button>
      </Box>
      
      <Box sx={{ display: 'flex', mb: 3, gap: 2 }}>
        <TextField
          label="Szukaj"
          variant="outlined"
          size="small"
          value={searchTerm}
          onChange={handleSearchChange}
          sx={{ flexGrow: 1 }}
        />
        
        <FormControl variant="outlined" size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            onChange={handleStatusFilterChange}
            label="Status"
          >
            <MenuItem value="all">Wszystkie</MenuItem>
            <MenuItem value="draft">Szkic</MenuItem>
            <MenuItem value="sent">Wysłane</MenuItem>
            <MenuItem value="confirmed">Potwierdzone</MenuItem>
            <MenuItem value="received">Otrzymane</MenuItem>
            <MenuItem value="cancelled">Anulowane</MenuItem>
          </Select>
        </FormControl>
      </Box>
      
      {filteredPOs.length === 0 ? (
        <Paper sx={{ p: 3, textAlign: 'center' }}>
          <Typography variant="body1">Brak zamówień zakupu spełniających kryteria wyszukiwania</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Numer</TableCell>
                <TableCell>Dostawca</TableCell>
                <TableCell>Data zamówienia</TableCell>
                <TableCell>Planowana dostawa</TableCell>
                <TableCell>Wartość</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredPOs.map((po) => (
                <TableRow key={po.id}>
                  <TableCell>{po.number}</TableCell>
                  <TableCell>{po.supplier?.name}</TableCell>
                  <TableCell>{po.orderDate ? new Date(po.orderDate).toLocaleDateString('pl-PL') : '-'}</TableCell>
                  <TableCell>{po.expectedDeliveryDate ? new Date(po.expectedDeliveryDate).toLocaleDateString('pl-PL') : '-'}</TableCell>
                  <TableCell>{po.totalValue?.toFixed(2)} {po.currency}</TableCell>
                  <TableCell>
                    <Chip 
                      label={STATUS_TRANSLATIONS[po.status] || po.status} 
                      color={getStatusChip(po.status).props.color} 
                      onClick={() => handleStatusClick(po)} 
                    />
                  </TableCell>
                  <TableCell>
                    <IconButton
                      color="primary"
                      onClick={() => navigate(`/purchase-orders/${po.id}`)}
                      title="Podgląd"
                    >
                      <ViewIcon />
                    </IconButton>
                    
                    {po.status === 'draft' && (
                      <IconButton
                        color="secondary"
                        onClick={() => navigate(`/purchase-orders/${po.id}/edit`)}
                        title="Edytuj"
                      >
                        <EditIcon />
                      </IconButton>
                    )}
                    
                    {po.status === 'draft' && (
                      <IconButton
                        color="error"
                        onClick={() => handleDeleteClick(po)}
                        title="Usuń"
                      >
                        <DeleteIcon />
                      </IconButton>
                    )}
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
            Czy na pewno chcesz usunąć zamówienie zakupu {poToDelete?.number}? Tej operacji nie można cofnąć.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleDeleteConfirm} color="error">Usuń</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog zmiany statusu */}
      <Dialog
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
      >
        <DialogTitle>Zmień status zamówienia</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Wybierz nowy status dla zamówienia {poToUpdateStatus?.number}:
          </DialogContentText>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              label="Status"
            >
              <MenuItem value="draft">Szkic</MenuItem>
              <MenuItem value="sent">Wysłane</MenuItem>
              <MenuItem value="confirmed">Potwierdzone</MenuItem>
              <MenuItem value="received">Otrzymane</MenuItem>
              <MenuItem value="cancelled">Anulowane</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleStatusUpdate} color="primary">Zapisz</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default PurchaseOrderList; 