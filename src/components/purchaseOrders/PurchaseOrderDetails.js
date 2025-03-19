import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Container, Typography, Paper, Button, Box, Chip, Grid, Divider, 
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import { 
  Edit as EditIcon, 
  Delete as DeleteIcon, 
  Print as PrintIcon,
  Article as ArticleIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  getPurchaseOrderById,
  deletePurchaseOrder,
  updatePurchaseOrderStatus,
  PURCHASE_ORDER_STATUSES,
  translateStatus
} from '../../services/purchaseOrderService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useReactToPrint } from 'react-to-print';

const PurchaseOrderDetails = ({ orderId }) => {
  const [purchaseOrder, setPurchaseOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const printRef = useRef();
  
  // Funkcja do drukowania lub eksportu do PDF
  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Zamówienie ${purchaseOrder?.number}`,
  });
  
  useEffect(() => {
    const fetchPurchaseOrder = async () => {
      try {
        // Sprawdź, czy ID jest zdefiniowane
        if (!orderId) {
          throw new Error('Brak ID zamówienia');
        }
        
        setLoading(true);
        const data = await getPurchaseOrderById(orderId);
        setPurchaseOrder(data);
        setLoading(false);
      } catch (error) {
        console.error('Błąd podczas pobierania zamówienia:', error);
        showError('Nie udało się pobrać danych zamówienia');
        setLoading(false);
        // Przekieruj do listy zamówień, jeśli nie znaleziono zamówienia
        navigate('/purchase-orders');
      }
    };
    
    fetchPurchaseOrder();
  }, [orderId, navigate, showError]);
  
  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    try {
      await deletePurchaseOrder(orderId);
      setDeleteDialogOpen(false);
      showSuccess('Zamówienie zostało usunięte');
      navigate('/purchase-orders');
    } catch (error) {
      console.error('Błąd podczas usuwania zamówienia:', error);
      showError('Nie udało się usunąć zamówienia');
      setDeleteDialogOpen(false);
    }
  };
  
  const handleStatusClick = () => {
    setNewStatus(purchaseOrder.status);
    setStatusDialogOpen(true);
  };
  
  const handleStatusUpdate = async () => {
    if (newStatus === purchaseOrder.status) {
      setStatusDialogOpen(false);
      return;
    }
    
    try {
      const updatedPO = await updatePurchaseOrderStatus(orderId, newStatus, currentUser?.uid);
      setPurchaseOrder(updatedPO);
      setStatusDialogOpen(false);
      showSuccess('Status zamówienia został zaktualizowany');
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu:', error);
      showError('Nie udało się zaktualizować statusu zamówienia');
      setStatusDialogOpen(false);
    }
  };
  
  const getStatusChip = (status) => {
    const statusConfig = {
      [PURCHASE_ORDER_STATUSES.DRAFT]: { color: 'default', label: translateStatus(status) },
      [PURCHASE_ORDER_STATUSES.PENDING]: { color: 'warning', label: translateStatus(status) },
      [PURCHASE_ORDER_STATUSES.CONFIRMED]: { color: 'info', label: translateStatus(status) },
      [PURCHASE_ORDER_STATUSES.SHIPPED]: { color: 'primary', label: translateStatus(status) },
      [PURCHASE_ORDER_STATUSES.DELIVERED]: { color: 'success', label: translateStatus(status) },
      [PURCHASE_ORDER_STATUSES.CANCELLED]: { color: 'error', label: translateStatus(status) },
      [PURCHASE_ORDER_STATUSES.COMPLETED]: { color: 'success', label: translateStatus(status) }
    };
    
    const config = statusConfig[status] || { color: 'default', label: status };
    
    return (
      <Chip 
        label={config.label} 
        color={config.color}
        size="small"
        onClick={handleStatusClick}
      />
    );
  };
  
  // Funkcja formatująca datę
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd.MM.yyyy', { locale: pl });
    } catch (error) {
      console.error('Błąd formatowania daty:', error);
      return dateString;
    }
  };
  
  // Funkcja formatująca adres dostawcy
  const formatAddress = (address) => {
    if (!address) return '';
    return `${address.name ? address.name + ', ' : ''}${address.street}, ${address.postalCode} ${address.city}, ${address.country}`;
  };
  
  // Pobierz główny adres dostawcy
  const getSupplierMainAddress = (supplier) => {
    if (!supplier || !supplier.addresses || supplier.addresses.length === 0) {
      return null;
    }
    
    return supplier.addresses.find(a => a.isMain) || supplier.addresses[0];
  };
  
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography>Ładowanie danych zamówienia...</Typography>
      </Container>
    );
  }
  
  if (!purchaseOrder) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography>Nie znaleziono zamówienia</Typography>
      </Container>
    );
  }
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
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
          
          {purchaseOrder.status === PURCHASE_ORDER_STATUSES.DRAFT && (
            <Button
              variant="outlined"
              color="secondary"
              startIcon={<EditIcon />}
              onClick={() => navigate(`/purchase-orders/${orderId}/edit`)}
            >
              Edytuj
            </Button>
          )}
          
          {purchaseOrder.status === PURCHASE_ORDER_STATUSES.DRAFT && (
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
                <Typography variant="body1">{formatDate(purchaseOrder.orderDate)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Planowana data dostawy:</Typography>
                <Typography variant="body1">{formatDate(purchaseOrder.expectedDeliveryDate)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Wartość zamówienia:</Typography>
                <Typography variant="body1">{purchaseOrder.totalValue.toFixed(2)} {purchaseOrder.currency}</Typography>
              </Box>
            </Box>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>Dostawca</Typography>
            {purchaseOrder.supplier ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="body1">{purchaseOrder.supplier.name}</Typography>
                <Typography variant="body2">
                  Osoba kontaktowa: {purchaseOrder.supplier.contactPerson || '-'}
                </Typography>
                <Typography variant="body2">
                  E-mail: {purchaseOrder.supplier.email || '-'}
                </Typography>
                <Typography variant="body2">
                  Telefon: {purchaseOrder.supplier.phone || '-'}
                </Typography>
                {getSupplierMainAddress(purchaseOrder.supplier) && (
                  <Typography variant="body2">
                    Adres: {formatAddress(getSupplierMainAddress(purchaseOrder.supplier))}
                  </Typography>
                )}
              </Box>
            ) : (
              <Typography variant="body2">Brak danych dostawcy</Typography>
            )}
          </Grid>
        </Grid>
        
        <Divider sx={{ my: 3 }} />
        
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="subtitle1" gutterBottom>Adres dostawy</Typography>
            <Typography variant="body1">{purchaseOrder.deliveryAddress || '-'}</Typography>
          </Grid>
        </Grid>
        
        <Divider sx={{ my: 3 }} />
        
        <Typography variant="subtitle1" gutterBottom>Zamawiane produkty</Typography>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Nazwa</TableCell>
                <TableCell align="right">Ilość</TableCell>
                <TableCell>Jednostka</TableCell>
                <TableCell align="right">Cena jedn.</TableCell>
                <TableCell align="right">Wartość</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {purchaseOrder.items.map((item, index) => (
                <TableRow key={item.id || index}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell align="right">{item.quantity}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell align="right">
                    {typeof item.unitPrice === 'number' 
                      ? `${item.unitPrice.toFixed(2)} ${purchaseOrder.currency}` 
                      : `${item.unitPrice || 0} ${purchaseOrder.currency}`}
                  </TableCell>
                  <TableCell align="right">
                    {typeof item.totalPrice === 'number' 
                      ? `${item.totalPrice.toFixed(2)} ${purchaseOrder.currency}`
                      : `${item.totalPrice || 0} ${purchaseOrder.currency}`}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={4} align="right">
                  <Typography variant="body1" fontWeight="bold">Razem:</Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body1" fontWeight="bold">
                    {typeof purchaseOrder.totalValue === 'number'
                      ? `${purchaseOrder.totalValue.toFixed(2)} ${purchaseOrder.currency}`
                      : `${purchaseOrder.totalValue || 0} ${purchaseOrder.currency}`}
                  </Typography>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
        
        {purchaseOrder.notes && (
          <Box sx={{ mt: 3 }}>
            <Typography variant="subtitle1" gutterBottom>Uwagi</Typography>
            <Typography variant="body2">{purchaseOrder.notes}</Typography>
          </Box>
        )}
      </Paper>
      
      {/* Sekcja ukryta, widoczna tylko podczas drukowania */}
      <Box sx={{ display: 'none' }}>
        <Box ref={printRef} sx={{ p: 4 }}>
          <Typography variant="h5" align="center" gutterBottom>
            Zamówienie Zakupu {purchaseOrder.number}
          </Typography>
          <Divider sx={{ mb: 3 }} />
          
          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid item xs={6}>
              <Typography variant="subtitle1" gutterBottom>Informacje o zamówieniu</Typography>
              <Typography variant="body2">Data zamówienia: {formatDate(purchaseOrder.orderDate)}</Typography>
              <Typography variant="body2">Status: {translateStatus(purchaseOrder.status)}</Typography>
              <Typography variant="body2">Planowana data dostawy: {formatDate(purchaseOrder.expectedDeliveryDate)}</Typography>
            </Grid>
            <Grid item xs={6}>
              <Typography variant="subtitle1" gutterBottom>Dostawca</Typography>
              {purchaseOrder.supplier && (
                <>
                  <Typography variant="body2">{purchaseOrder.supplier.name}</Typography>
                  <Typography variant="body2">Kontakt: {purchaseOrder.supplier.contactPerson}</Typography>
                  <Typography variant="body2">Email: {purchaseOrder.supplier.email}</Typography>
                  <Typography variant="body2">Telefon: {purchaseOrder.supplier.phone}</Typography>
                  {getSupplierMainAddress(purchaseOrder.supplier) && (
                    <Typography variant="body2">
                      Adres: {formatAddress(getSupplierMainAddress(purchaseOrder.supplier))}
                    </Typography>
                  )}
                </>
              )}
            </Grid>
            
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>Adres dostawy</Typography>
              <Typography variant="body2">{purchaseOrder.deliveryAddress}</Typography>
            </Grid>
          </Grid>
          
          <Typography variant="subtitle1" gutterBottom>Zamawiane produkty</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Nazwa</TableCell>
                  <TableCell align="right">Ilość</TableCell>
                  <TableCell>Jednostka</TableCell>
                  <TableCell align="right">Cena jedn.</TableCell>
                  <TableCell align="right">Wartość</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {purchaseOrder.items.map((item, index) => (
                  <TableRow key={item.id || index}>
                    <TableCell>{item.name}</TableCell>
                    <TableCell align="right">{item.quantity}</TableCell>
                    <TableCell>{item.unit}</TableCell>
                    <TableCell align="right">
                      {typeof item.unitPrice === 'number' 
                        ? `${item.unitPrice.toFixed(2)} ${purchaseOrder.currency}` 
                        : `${item.unitPrice || 0} ${purchaseOrder.currency}`}
                    </TableCell>
                    <TableCell align="right">
                      {typeof item.totalPrice === 'number' 
                        ? `${item.totalPrice.toFixed(2)} ${purchaseOrder.currency}`
                        : `${item.totalPrice || 0} ${purchaseOrder.currency}`}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell colSpan={4} align="right">
                    <Typography variant="body1" fontWeight="bold">Razem:</Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body1" fontWeight="bold">
                      {typeof purchaseOrder.totalValue === 'number'
                        ? `${purchaseOrder.totalValue.toFixed(2)} ${purchaseOrder.currency}`
                        : `${purchaseOrder.totalValue || 0} ${purchaseOrder.currency}`}
                    </Typography>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          
          {purchaseOrder.notes && (
            <Box sx={{ mt: 3 }}>
              <Typography variant="subtitle1" gutterBottom>Uwagi</Typography>
              <Typography variant="body2">{purchaseOrder.notes}</Typography>
            </Box>
          )}
          
          <Box sx={{ mt: 5, display: 'flex', justifyContent: 'space-between' }}>
            <Box sx={{ width: '40%', borderTop: '1px solid black', pt: 1, textAlign: 'center' }}>
              <Typography variant="body2">Osoba zamawiająca</Typography>
            </Box>
            <Box sx={{ width: '40%', borderTop: '1px solid black', pt: 1, textAlign: 'center' }}>
              <Typography variant="body2">Akceptacja</Typography>
            </Box>
          </Box>
        </Box>
      </Box>
      
      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Potwierdzenie usunięcia</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć zamówienie zakupowe {purchaseOrder.number}? Tej operacji nie można cofnąć.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleDeleteConfirm} color="error" autoFocus>
            Usuń
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog zmiany statusu */}
      <Dialog
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
      >
        <DialogTitle>Zmiana statusu zamówienia</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Zmień status zamówienia zakupowego {purchaseOrder.number}:
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              label="Status"
            >
              {Object.values(PURCHASE_ORDER_STATUSES).map((status) => (
                <MenuItem key={status} value={status}>
                  {translateStatus(status)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleStatusUpdate} color="primary">
            Zapisz
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default PurchaseOrderDetails; 