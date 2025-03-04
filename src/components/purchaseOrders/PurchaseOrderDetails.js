import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Container, Typography, Paper, Box, Grid, Divider, Button, Chip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle
} from '@mui/material';
import { Edit as EditIcon, Delete as DeleteIcon, Print as PrintIcon } from '@mui/icons-material';
import { getPurchaseOrderById, deletePurchaseOrder, updatePurchaseOrderStatus } from '../../services/purchaseOrderService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';

const PurchaseOrderDetails = ({ orderId }) => {
  const { poId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  // Używamy orderId z props, a jeśli nie istnieje, to poId z useParams()
  const currentOrderId = orderId || poId;
  
  const [purchaseOrder, setPurchaseOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  
  useEffect(() => {
    if (currentOrderId && currentOrderId !== 'new') {
      fetchPurchaseOrder();
    } else {
      // Jeśli nie ma ID lub ID to 'new', ustawiamy loading na false
      setLoading(false);
    }
  }, [currentOrderId]);
  
  const fetchPurchaseOrder = async () => {
    try {
      setLoading(true);
      const data = await getPurchaseOrderById(currentOrderId);
      setPurchaseOrder(data);
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania zamówienia zakupu:', error);
      showError('Nie udało się pobrać danych zamówienia zakupu');
      setLoading(false);
    }
  };
  
  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    try {
      await deletePurchaseOrder(currentOrderId);
      showSuccess('Zamówienie zakupu zostało usunięte');
      navigate('/purchase-orders');
    } catch (error) {
      console.error('Błąd podczas usuwania zamówienia zakupu:', error);
      showError('Nie udało się usunąć zamówienia zakupu');
    }
  };
  
  const handleStatusClick = () => {
    setNewStatus(purchaseOrder.status);
    setStatusDialogOpen(true);
  };
  
  const handleStatusUpdate = async () => {
    try {
      await updatePurchaseOrderStatus(currentOrderId, newStatus, currentUser.uid);
      
      // Aktualizacja stanu lokalnego
      setPurchaseOrder(prev => ({
        ...prev,
        status: newStatus
      }));
      
      showSuccess('Status zamówienia zakupu został zaktualizowany');
      setStatusDialogOpen(false);
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu zamówienia:', error);
      showError('Nie udało się zaktualizować statusu zamówienia');
    }
  };
  
  const handlePrint = () => {
    window.print();
  };
  
  const getStatusChip = (status) => {
    let color = 'default';
    let label = 'Nieznany';
    
    switch (status) {
      case 'draft':
        color = 'default';
        label = 'Szkic';
        break;
      case 'sent':
        color = 'primary';
        label = 'Wysłane';
        break;
      case 'confirmed':
        color = 'info';
        label = 'Potwierdzone';
        break;
      case 'received':
        color = 'success';
        label = 'Otrzymane';
        break;
      case 'cancelled':
        color = 'error';
        label = 'Anulowane';
        break;
      default:
        break;
    }
    
    return <Chip label={label} color={color} onClick={handleStatusClick} />;
  };
  
  if (loading) {
    return (
      <Container>
        <Typography variant="h6">Ładowanie danych zamówienia...</Typography>
      </Container>
    );
  }
  
  if (!purchaseOrder) {
    return (
      <Container>
        <Typography variant="h6">Nie znaleziono zamówienia zakupu</Typography>
        <Button
          variant="contained"
          onClick={() => navigate('/purchase-orders')}
          sx={{ mt: 2 }}
        >
          Powrót do listy
        </Button>
      </Container>
    );
  }
  
  return (
    <Container>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">
          Zamówienie Zakupu: {purchaseOrder.number}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={<PrintIcon />}
            onClick={handlePrint}
          >
            Drukuj
          </Button>
          
          {purchaseOrder.status === 'draft' && (
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<EditIcon />}
              onClick={() => navigate(`/purchase-orders/${currentOrderId}/edit`)}
            >
              Edytuj
            </Button>
          )}
          
          {purchaseOrder.status === 'draft' && (
            <Button
              variant="outlined"
              color="error"
              startIcon={<DeleteIcon />}
              onClick={handleDeleteClick}
            >
              Usuń
            </Button>
          )}
        </Box>
      </Box>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>Informacje ogólne</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Numer:</Typography>
                <Typography variant="body1">{purchaseOrder.number}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Status:</Typography>
                {getStatusChip(purchaseOrder.status)}
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Data zamówienia:</Typography>
                <Typography variant="body1">
                  {purchaseOrder.orderDate ? new Date(purchaseOrder.orderDate).toLocaleDateString('pl-PL') : '-'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Planowana dostawa:</Typography>
                <Typography variant="body1">
                  {purchaseOrder.expectedDeliveryDate ? new Date(purchaseOrder.expectedDeliveryDate).toLocaleDateString('pl-PL') : '-'}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Waluta:</Typography>
                <Typography variant="body1">{purchaseOrder.currency}</Typography>
              </Box>
            </Box>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>Dostawca</Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              <Typography variant="body1">{purchaseOrder.supplier?.name}</Typography>
              <Typography variant="body2">Osoba kontaktowa: {purchaseOrder.supplier?.contactPerson || '-'}</Typography>
              <Typography variant="body2">Email: {purchaseOrder.supplier?.email || '-'}</Typography>
              <Typography variant="body2">Telefon: {purchaseOrder.supplier?.phone || '-'}</Typography>
            </Box>
          </Grid>
          
          {purchaseOrder.deliveryAddress && (
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>Adres dostawy</Typography>
              <Typography variant="body1">{purchaseOrder.deliveryAddress}</Typography>
            </Grid>
          )}
          
          {purchaseOrder.notes && (
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>Uwagi</Typography>
              <Typography variant="body1">{purchaseOrder.notes}</Typography>
            </Grid>
          )}
        </Grid>
      </Paper>
      
      <Typography variant="h6" gutterBottom>Pozycje zamówienia</Typography>
      
      <TableContainer component={Paper} sx={{ mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Produkt</TableCell>
              <TableCell align="right">Ilość</TableCell>
              <TableCell>Jednostka</TableCell>
              <TableCell align="right">Cena jedn.</TableCell>
              <TableCell align="right">Wartość</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {purchaseOrder.items.map((item, index) => (
              <TableRow key={index}>
                <TableCell>{item.name}</TableCell>
                <TableCell align="right">{item.quantity}</TableCell>
                <TableCell>{item.unit}</TableCell>
                <TableCell align="right">{item.unitPrice?.toFixed(2)} {purchaseOrder.currency}</TableCell>
                <TableCell align="right">{item.totalPrice?.toFixed(2)} {purchaseOrder.currency}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 3 }}>
        <Paper sx={{ p: 2, width: 300 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="subtitle1">Wartość całkowita:</Typography>
            <Typography variant="h6">{purchaseOrder.totalValue?.toFixed(2)} {purchaseOrder.currency}</Typography>
          </Box>
        </Paper>
      </Box>
      
      <Box sx={{ display: 'flex', justifyContent: 'flex-start', mb: 3 }}>
        <Button
          variant="outlined"
          onClick={() => navigate('/purchase-orders')}
        >
          Powrót do listy
        </Button>
      </Box>
      
      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć zamówienie zakupu {purchaseOrder.number}? Tej operacji nie można cofnąć.
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
            Wybierz nowy status dla zamówienia {purchaseOrder.number}:
          </DialogContentText>
          <Box sx={{ mt: 2 }}>
            <Grid container spacing={1}>
              {['draft', 'sent', 'confirmed', 'received', 'cancelled'].map((status) => (
                <Grid item key={status}>
                  <Chip
                    label={getStatusChip(status).props.label}
                    color={status === newStatus ? 'primary' : 'default'}
                    onClick={() => setNewStatus(status)}
                    sx={{ cursor: 'pointer' }}
                  />
                </Grid>
              ))}
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleStatusUpdate} color="primary">Zapisz</Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default PurchaseOrderDetails; 