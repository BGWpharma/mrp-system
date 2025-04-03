import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { 
  Container, Typography, Paper, Button, Box, Chip, Grid, Divider, 
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  FormControl, InputLabel, Select, MenuItem, TextField
} from '@mui/material';
import { 
  Edit as EditIcon, 
  Delete as DeleteIcon, 
  Print as PrintIcon,
  Article as ArticleIcon,
  Description as DescriptionIcon,
  Inventory as InventoryIcon,
  ArrowBack as ArrowBackIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  getPurchaseOrderById,
  deletePurchaseOrder,
  updatePurchaseOrderStatus,
  updatePurchaseOrder,
  PURCHASE_ORDER_STATUSES,
  translateStatus
} from '../../services/purchaseOrderService';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { useReactToPrint } from 'react-to-print';
import { db } from '../../services/firebase/config';
import { updateDoc, doc } from 'firebase/firestore';

const PurchaseOrderDetails = ({ orderId }) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(true);
  const [purchaseOrder, setPurchaseOrder] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [itemToReceive, setItemToReceive] = useState(null);
  const [invoiceLinkDialogOpen, setInvoiceLinkDialogOpen] = useState(false);
  const [invoiceLink, setInvoiceLink] = useState('');
  
  const printRef = useRef();
  
  const handlePrint = useReactToPrint({
    content: () => printRef.current,
  });
  
  useEffect(() => {
    const fetchPurchaseOrder = async () => {
      try {
        const data = await getPurchaseOrderById(orderId);
        setPurchaseOrder(data);
      } catch (error) {
        showError('Błąd podczas pobierania danych zamówienia: ' + error.message);
      } finally {
        setLoading(false);
      }
    };
    
    if (orderId) {
      fetchPurchaseOrder();
    }
  }, [orderId, showError]);
  
  if (loading) {
    return <Typography>Ładowanie szczegółów zamówienia...</Typography>;
  }
  
  if (!purchaseOrder) {
    return <Typography>Nie znaleziono zamówienia</Typography>;
  }
  
  const handleEditClick = () => {
    navigate(`/purchase-orders/${orderId}/edit`);
  };
  
  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };
  
  const handleDeleteConfirm = async () => {
    try {
      await deletePurchaseOrder(orderId);
      showSuccess('Zamówienie zostało usunięte');
      navigate('/purchase-orders');
    } catch (error) {
      showError('Błąd podczas usuwania zamówienia: ' + error.message);
    }
    setDeleteDialogOpen(false);
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
      // Aktualizacja statusu
      await updatePurchaseOrderStatus(orderId, newStatus, currentUser?.uid);
      
      // Pobierz zaktualizowane dane zamówienia
      const updatedData = await getPurchaseOrderById(orderId);
      setPurchaseOrder(updatedData);
      
      setStatusDialogOpen(false);
      showSuccess('Status zamówienia został zaktualizowany');
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu:', error);
      showError('Nie udało się zaktualizować statusu zamówienia');
      setStatusDialogOpen(false);
    }
  };
  
  const handleReceiveClick = (item) => {
    setItemToReceive(item);
    setReceiveDialogOpen(true);
  };
  
  const handleReceiveItem = () => {
    if (!itemToReceive || !itemToReceive.inventoryItemId) {
      showError('Ten produkt nie jest powiązany z pozycją magazynową');
      setReceiveDialogOpen(false);
      return;
    }
    
    // Upewnij się, że cena jednostkowa jest liczbą
    const unitPrice = typeof itemToReceive.unitPrice === 'number' 
      ? itemToReceive.unitPrice 
      : parseFloat(itemToReceive.unitPrice || 0);
    
    // Przekieruj do strony przyjęcia towaru z parametrami
    navigate(`/inventory/${itemToReceive.inventoryItemId}/receive?poNumber=${purchaseOrder.number}&quantity=${itemToReceive.quantity}&unitPrice=${unitPrice}`);
    setReceiveDialogOpen(false);
  };
  
  const handleInvoiceLinkDialogOpen = () => {
    setInvoiceLink(purchaseOrder.invoiceLink || '');
    setInvoiceLinkDialogOpen(true);
  };

  const handleInvoiceLinkSave = async () => {
    try {
      // Przygotuj dane do aktualizacji
      const updatedData = {
        ...purchaseOrder,
        invoiceLink: invoiceLink
      };
      
      // Zaktualizuj zamówienie w bazie danych
      await updatePurchaseOrder(orderId, updatedData);
      
      // Zaktualizuj lokalny stan
      setPurchaseOrder({
        ...purchaseOrder,
        invoiceLink: invoiceLink
      });
      
      setInvoiceLinkDialogOpen(false);
      showSuccess('Link do faktury został zaktualizowany');
    } catch (error) {
      console.error('Błąd podczas zapisywania linku do faktury:', error);
      showError('Nie udało się zapisać linku do faktury');
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
  
  const formatDate = (dateIsoString) => {
    if (!dateIsoString) return 'Nie określono';
    const date = new Date(dateIsoString);
    return format(date, 'dd MMMM yyyy', { locale: pl });
  };
  
  const formatAddress = (address) => {
    if (!address) return 'Brak adresu';
    return `${address.street || ''}, ${address.postalCode || ''} ${address.city || ''}, ${address.country || ''}`;
  };
  
  const getSupplierMainAddress = (supplier) => {
    if (!supplier || !supplier.addresses || supplier.addresses.length === 0) {
      return null;
    }
    
    const mainAddress = supplier.addresses.find(addr => addr.isMain);
    return mainAddress || supplier.addresses[0];
  };
  
  // Sprawdza, czy zamówienie jest w stanie, w którym można przyjąć towary do magazynu
  const canReceiveItems = purchaseOrder.status === PURCHASE_ORDER_STATUSES.DELIVERED;
  
  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between' }}>
        <Button 
          variant="outlined" 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/purchase-orders')}
        >
          Powrót do listy
        </Button>
        <Box>
          <Button 
            variant="outlined" 
            startIcon={<PrintIcon />} 
            onClick={handlePrint}
            sx={{ mr: 1 }}
          >
            Drukuj
          </Button>
          <Button 
            variant="outlined" 
            startIcon={<DescriptionIcon />} 
            onClick={handleInvoiceLinkDialogOpen}
            sx={{ mr: 1 }}
          >
            {purchaseOrder.invoiceLink ? 'Zmień link do faktury' : 'Dodaj link do faktury'}
          </Button>
          <Button 
            variant="outlined" 
            startIcon={<EditIcon />} 
            onClick={handleEditClick}
            sx={{ mr: 1 }}
          >
            Edytuj
          </Button>
          <Button 
            variant="outlined" 
            color="error" 
            startIcon={<DeleteIcon />} 
            onClick={handleDeleteClick}
          >
            Usuń
          </Button>
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
                <Typography variant="body2">Wartość:</Typography>
                <Typography variant="body1">
                  {(() => {
                    // Obliczanie całkowitej wartości netto (produkty + dodatkowe koszty)
                    const productsValue = typeof purchaseOrder.items === 'object' && Array.isArray(purchaseOrder.items)
                      ? purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
                      : 0;
                    
                    const additionalCosts = purchaseOrder.additionalCostsItems && Array.isArray(purchaseOrder.additionalCostsItems) 
                      ? purchaseOrder.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
                      : (parseFloat(purchaseOrder.additionalCosts) || 0);
                    
                    const totalNetValue = productsValue + additionalCosts;
                    
                    return `${totalNetValue.toFixed(2)} ${purchaseOrder.currency}`;
                  })()}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Stawka VAT:</Typography>
                <Typography variant="body1">{purchaseOrder.vatRate || 0}%</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2">Wartość podatku:</Typography>
                <Typography variant="body1">
                  {(() => {
                    // Podatek VAT naliczany tylko od wartości produktów, bez dodatkowych kosztów
                    const productsValue = typeof purchaseOrder.items === 'object' && Array.isArray(purchaseOrder.items)
                      ? purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
                      : 0;
                    
                    const vatRate = purchaseOrder.vatRate || 0;
                    const vatValue = (productsValue * vatRate) / 100;
                    
                    return `${vatValue.toFixed(2)} ${purchaseOrder.currency}`;
                  })()}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="body2" fontWeight="bold">Wartość brutto:</Typography>
                <Typography variant="body1" fontWeight="bold">
                  {(() => {
                    // Obliczanie wartości brutto:
                    // 1. Pobierz wartość produktów
                    const productsValue = typeof purchaseOrder.items === 'object' && Array.isArray(purchaseOrder.items)
                      ? purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
                      : 0;
                    
                    // 2. Oblicz VAT (tylko od wartości produktów)
                    const vatRate = purchaseOrder.vatRate || 0;
                    const vatValue = (productsValue * vatRate) / 100;
                    
                    // 3. Oblicz dodatkowe koszty
                    const additionalCosts = purchaseOrder.additionalCostsItems && Array.isArray(purchaseOrder.additionalCostsItems) 
                      ? purchaseOrder.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
                      : (parseFloat(purchaseOrder.additionalCosts) || 0);
                    
                    // 4. Oblicz wartość brutto jako: wartość produktów + VAT + dodatkowe koszty
                    const grossValue = productsValue + vatValue + additionalCosts;
                    
                    // 5. Zapisz wartość brutto w bazie danych, jeśli się zmieniła
                    if (purchaseOrder.totalGross !== grossValue) {
                      // Aktualizacja w bazie danych
                      (async () => {
                        try {
                          await updateDoc(doc(db, 'purchaseOrders', orderId), {
                            totalGross: grossValue
                          });
                          console.log('Zaktualizowano wartość brutto PO:', grossValue);
                        } catch (error) {
                          console.error('Błąd podczas aktualizacji wartości brutto:', error);
                        }
                      })();
                    }
                    
                    console.log(`PO ${purchaseOrder.number || orderId} - wartość brutto: ${grossValue} (produkty: ${productsValue}, VAT: ${vatValue}, koszty: ${additionalCosts})`);
                    
                    return `${grossValue.toFixed(2)} ${purchaseOrder.currency}`;
                  })()}
                </Typography>
              </Box>
            </Box>
          </Grid>
          
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>Dostawca</Typography>
            {purchaseOrder.supplier ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                  {purchaseOrder.supplier.name}
                </Typography>
                {purchaseOrder.supplier.contactPerson && (
                  <Typography variant="body2">
                    Kontakt: {purchaseOrder.supplier.contactPerson}
                  </Typography>
                )}
                {purchaseOrder.supplier.email && (
                  <Typography variant="body2">
                    Email: {purchaseOrder.supplier.email}
                  </Typography>
                )}
                {purchaseOrder.supplier.phone && (
                  <Typography variant="body2">
                    Telefon: {purchaseOrder.supplier.phone}
                  </Typography>
                )}
                {getSupplierMainAddress(purchaseOrder.supplier) && (
                  <Typography variant="body2">
                    Adres: {formatAddress(getSupplierMainAddress(purchaseOrder.supplier))}
                  </Typography>
                )}
              </Box>
            ) : (
              <Typography variant="body2" color="textSecondary">
                Brak danych dostawcy
              </Typography>
            )}
          </Grid>
        </Grid>
      </Paper>
      
      {purchaseOrder.deliveryAddress && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>Adres dostawy</Typography>
          <Typography variant="body1">{purchaseOrder.deliveryAddress}</Typography>
        </Paper>
      )}
      
      <Paper sx={{ p: 3, mb: 3 }}>
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
                {canReceiveItems && <TableCell align="right">Akcje</TableCell>}
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
                  {canReceiveItems && (
                    <TableCell align="right">
                      <Button
                        variant="contained"
                        color="primary"
                        size="small"
                        startIcon={<InventoryIcon />}
                        onClick={() => handleReceiveClick(item)}
                        disabled={!item.inventoryItemId}
                      >
                        Przyjmij
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              
              <TableRow>
                <TableCell colSpan={canReceiveItems ? 4 : 3} align="right">
                  Wartość produktów:
                </TableCell>
                <TableCell align="right">
                  {typeof purchaseOrder.items === 'object' && Array.isArray(purchaseOrder.items)
                    ? `${purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0).toFixed(2)} ${purchaseOrder.currency}`
                    : `0.00 ${purchaseOrder.currency}`
                  }
                </TableCell>
                {canReceiveItems && <TableCell />}
              </TableRow>
              
              {/* Dodatkowe koszty - pokazujemy tylko jeśli istnieją */}
              {purchaseOrder.additionalCostsItems && purchaseOrder.additionalCostsItems.length > 0 ? (
                <>
                  {purchaseOrder.additionalCostsItems.map((cost, index) => (
                    <TableRow key={cost.id || index}>
                      <TableCell colSpan={canReceiveItems ? 4 : 3} align="right">
                        {cost.description || `Dodatkowy koszt ${index+1}`}:
                      </TableCell>
                      <TableCell align="right">
                        {`${parseFloat(cost.value).toFixed(2)} ${purchaseOrder.currency}`}
                      </TableCell>
                      {canReceiveItems && <TableCell />}
                    </TableRow>
                  ))}
                </>
              ) : purchaseOrder.additionalCosts > 0 && (
                <TableRow>
                  <TableCell colSpan={canReceiveItems ? 4 : 3} align="right">
                    Dodatkowe koszty
                    {purchaseOrder.additionalCostsDescription && (
                      <Typography variant="caption" sx={{ ml: 1 }}>
                        ({purchaseOrder.additionalCostsDescription})
                      </Typography>
                    )}:
                  </TableCell>
                  <TableCell align="right">
                    {`${parseFloat(purchaseOrder.additionalCosts).toFixed(2)} ${purchaseOrder.currency}`}
                  </TableCell>
                  {canReceiveItems && <TableCell />}
                </TableRow>
              )}
              
              <TableRow>
                <TableCell colSpan={canReceiveItems ? 4 : 3} align="right" sx={{ fontWeight: 'bold' }}>
                  Wartość netto:
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {(() => {
                    // Obliczanie całkowitej wartości netto (produkty + dodatkowe koszty)
                    const productsValue = typeof purchaseOrder.items === 'object' && Array.isArray(purchaseOrder.items)
                      ? purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
                      : 0;
                    
                    const additionalCosts = purchaseOrder.additionalCostsItems && Array.isArray(purchaseOrder.additionalCostsItems) 
                      ? purchaseOrder.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
                      : (parseFloat(purchaseOrder.additionalCosts) || 0);
                    
                    const totalNetValue = productsValue + additionalCosts;
                    
                    return `${totalNetValue.toFixed(2)} ${purchaseOrder.currency}`;
                  })()}
                </TableCell>
                {canReceiveItems && <TableCell />}
              </TableRow>
              <TableRow>
                <TableCell colSpan={canReceiveItems ? 4 : 3} align="right">
                  VAT {purchaseOrder.vatRate || 0}% (tylko od produktów):
                </TableCell>
                <TableCell align="right">
                  {(() => {
                    // Podatek VAT naliczany tylko od wartości produktów, bez dodatkowych kosztów
                    const productsValue = typeof purchaseOrder.items === 'object' && Array.isArray(purchaseOrder.items)
                      ? purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
                      : 0;
                    
                    const vatRate = purchaseOrder.vatRate || 0;
                    const vatValue = (productsValue * vatRate) / 100;
                    
                    return `${vatValue.toFixed(2)} ${purchaseOrder.currency}`;
                  })()}
                </TableCell>
                {canReceiveItems && <TableCell />}
              </TableRow>
              <TableRow>
                <TableCell colSpan={canReceiveItems ? 4 : 3} align="right" sx={{ fontWeight: 'bold' }}>
                  Wartość brutto:
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {(() => {
                    // Obliczanie wartości brutto:
                    // 1. Pobierz wartość produktów
                    const productsValue = typeof purchaseOrder.items === 'object' && Array.isArray(purchaseOrder.items)
                      ? purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
                      : 0;
                    
                    // 2. Oblicz VAT (tylko od wartości produktów)
                    const vatRate = purchaseOrder.vatRate || 0;
                    const vatValue = (productsValue * vatRate) / 100;
                    
                    // 3. Oblicz dodatkowe koszty
                    const additionalCosts = purchaseOrder.additionalCostsItems && Array.isArray(purchaseOrder.additionalCostsItems) 
                      ? purchaseOrder.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
                      : (parseFloat(purchaseOrder.additionalCosts) || 0);
                    
                    // 4. Oblicz wartość brutto jako: wartość produktów + VAT + dodatkowe koszty
                    const grossValue = productsValue + vatValue + additionalCosts;
                    
                    // 5. Zapisz wartość brutto w bazie danych, jeśli się zmieniła
                    if (purchaseOrder.totalGross !== grossValue) {
                      // Aktualizacja w bazie danych
                      (async () => {
                        try {
                          await updateDoc(doc(db, 'purchaseOrders', orderId), {
                            totalGross: grossValue
                          });
                          console.log('Zaktualizowano wartość brutto PO:', grossValue);
                        } catch (error) {
                          console.error('Błąd podczas aktualizacji wartości brutto:', error);
                        }
                      })();
                    }
                    
                    console.log(`PO ${purchaseOrder.number || orderId} - wartość brutto: ${grossValue} (produkty: ${productsValue}, VAT: ${vatValue}, koszty: ${additionalCosts})`);
                    
                    return `${grossValue.toFixed(2)} ${purchaseOrder.currency}`;
                  })()}
                </TableCell>
                {canReceiveItems && <TableCell />}
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      
      {purchaseOrder.notes && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>Uwagi</Typography>
          <Typography variant="body2">{purchaseOrder.notes}</Typography>
        </Paper>
      )}
      
      {purchaseOrder.invoiceLink && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>Faktura</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <Typography variant="body2" sx={{ mr: 2 }}>Link do faktury:</Typography>
            <Button 
              variant="contained" 
              color="primary" 
              component="a" 
              href={purchaseOrder.invoiceLink} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Otwórz fakturę
            </Button>
          </Box>
        </Paper>
      )}
      
      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć to zamówienie zakupowe? Ta operacja jest nieodwracalna.
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
          <FormControl fullWidth sx={{ mt: 2 }}>
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
          <Button onClick={handleStatusUpdate} color="primary">Zapisz</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog przyjęcia towaru */}
      <Dialog
        open={receiveDialogOpen}
        onClose={() => setReceiveDialogOpen(false)}
      >
        <DialogTitle>Przyjmij towar do magazynu</DialogTitle>
        <DialogContent>
          {itemToReceive && (
            <>
              <DialogContentText>
                Czy chcesz przyjąć do magazynu następujący produkt:
              </DialogContentText>
              <Box sx={{ mt: 2, mb: 2 }}>
                <Typography variant="subtitle1">{itemToReceive.name}</Typography>
                <Typography>
                  Ilość: {itemToReceive.quantity} {itemToReceive.unit}
                </Typography>
                <Typography>
                  Cena jednostkowa: {Number(itemToReceive.unitPrice || 0).toFixed(2)} {purchaseOrder.currency}
                </Typography>
              </Box>
              {!itemToReceive.inventoryItemId && (
                <DialogContentText color="error">
                  Ten produkt nie jest powiązany z pozycją magazynową. Najpierw dodaj go do magazynu.
                </DialogContentText>
              )}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReceiveDialogOpen(false)}>Anuluj</Button>
          <Button 
            onClick={handleReceiveItem} 
            color="primary"
            disabled={!itemToReceive || !itemToReceive.inventoryItemId}
          >
            Przejdź do przyjęcia
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog wprowadzania linku do faktury */}
      <Dialog
        open={invoiceLinkDialogOpen}
        onClose={() => setInvoiceLinkDialogOpen(false)}
      >
        <DialogTitle>{purchaseOrder.invoiceLink ? 'Edytuj link do faktury' : 'Dodaj link do faktury'}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Wprowadź link do faktury z Google Drive:
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Link do faktury"
            type="url"
            fullWidth
            variant="outlined"
            value={invoiceLink}
            onChange={(e) => setInvoiceLink(e.target.value)}
            sx={{ mt: 2 }}
            placeholder="https://drive.google.com/file/d/..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvoiceLinkDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleInvoiceLinkSave} color="primary">Zapisz</Button>
        </DialogActions>
      </Dialog>
      
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
              <Typography variant="body2">
                Wartość netto produktów: {(() => {
                  const productsValue = typeof purchaseOrder.items === 'object' && Array.isArray(purchaseOrder.items)
                    ? purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
                    : 0;
                  return `${productsValue.toFixed(2)} ${purchaseOrder.currency}`;
                })()}
              </Typography>
              {(purchaseOrder.additionalCostsItems && purchaseOrder.additionalCostsItems.length > 0) || purchaseOrder.additionalCosts > 0 ? (
                <Typography variant="body2">
                  Dodatkowe koszty: {(() => {
                    const additionalCosts = purchaseOrder.additionalCostsItems && Array.isArray(purchaseOrder.additionalCostsItems) 
                      ? purchaseOrder.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
                      : (parseFloat(purchaseOrder.additionalCosts) || 0);
                    return `${additionalCosts.toFixed(2)} ${purchaseOrder.currency}`;
                  })()}
                </Typography>
              ) : null}
              <Typography variant="body2">Stawka VAT: {purchaseOrder.vatRate || 0}%</Typography>
              <Typography variant="body2">
                Wartość podatku (tylko od produktów): {(() => {
                  // Podatek VAT naliczany tylko od wartości produktów, bez dodatkowych kosztów
                  const productsValue = typeof purchaseOrder.items === 'object' && Array.isArray(purchaseOrder.items)
                    ? purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
                    : 0;
                  const vatRate = purchaseOrder.vatRate || 0;
                  const vatValue = (productsValue * vatRate) / 100;
                  return `${vatValue.toFixed(2)} ${purchaseOrder.currency}`;
                })()}
              </Typography>
              <Typography variant="body2" fontWeight="bold">
                Wartość brutto: {(() => {
                  // Obliczanie wartości brutto:
                  // 1. Pobierz wartość produktów
                  const productsValue = typeof purchaseOrder.items === 'object' && Array.isArray(purchaseOrder.items)
                    ? purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
                    : 0;
                  
                  // 2. Oblicz VAT (tylko od wartości produktów)
                  const vatRate = purchaseOrder.vatRate || 0;
                  const vatValue = (productsValue * vatRate) / 100;
                  
                  // 3. Oblicz dodatkowe koszty
                  const additionalCosts = purchaseOrder.additionalCostsItems && Array.isArray(purchaseOrder.additionalCostsItems) 
                    ? purchaseOrder.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
                    : (parseFloat(purchaseOrder.additionalCosts) || 0);
                  
                  // 4. Oblicz wartość brutto jako: wartość produktów + VAT + dodatkowe koszty
                  const grossValue = productsValue + vatValue + additionalCosts;
                  
                  // 5. Zapisz wartość brutto w bazie danych, jeśli się zmieniła
                  if (purchaseOrder.totalGross !== grossValue) {
                    // Aktualizacja w bazie danych
                    (async () => {
                      try {
                        await updateDoc(doc(db, 'purchaseOrders', orderId), {
                          totalGross: grossValue
                        });
                        console.log('Zaktualizowano wartość brutto PO:', grossValue);
                      } catch (error) {
                        console.error('Błąd podczas aktualizacji wartości brutto:', error);
                      }
                    })();
                  }
                  
                  console.log(`PO ${purchaseOrder.number || orderId} - wartość brutto: ${grossValue} (produkty: ${productsValue}, VAT: ${vatValue}, koszty: ${additionalCosts})`);
                  
                  return `${grossValue.toFixed(2)} ${purchaseOrder.currency}`;
                })()}
              </Typography>
              {purchaseOrder.invoiceLink && (
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Faktura: <a href={purchaseOrder.invoiceLink} target="_blank" rel="noopener noreferrer">{purchaseOrder.invoiceLink}</a>
                </Typography>
              )}
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
                  <TableCell colSpan={3} align="right">
                    Wartość produktów netto:
                  </TableCell>
                  <TableCell align="right">
                    {typeof purchaseOrder.items === 'object' && Array.isArray(purchaseOrder.items)
                      ? `${purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0).toFixed(2)} ${purchaseOrder.currency}`
                      : `0.00 ${purchaseOrder.currency}`
                    }
                  </TableCell>
                </TableRow>

                {/* Dodatkowe koszty w wydruku */}
                {purchaseOrder.additionalCostsItems && purchaseOrder.additionalCostsItems.length > 0 ? (
                  <>
                    {purchaseOrder.additionalCostsItems.map((cost, index) => (
                      <TableRow key={cost.id || index}>
                        <TableCell colSpan={3} align="right">
                          {cost.description || `Dodatkowy koszt ${index+1}`}:
                        </TableCell>
                        <TableCell align="right">
                          {`${parseFloat(cost.value).toFixed(2)} ${purchaseOrder.currency}`}
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                ) : purchaseOrder.additionalCosts > 0 && (
                  <TableRow>
                    <TableCell colSpan={3} align="right">
                      Dodatkowe koszty{purchaseOrder.additionalCostsDescription ? ` (${purchaseOrder.additionalCostsDescription})` : ''}:
                    </TableCell>
                    <TableCell align="right">
                      {`${parseFloat(purchaseOrder.additionalCosts).toFixed(2)} ${purchaseOrder.currency}`}
                    </TableCell>
                  </TableRow>
                )}
                
                <TableRow>
                  <TableCell colSpan={3} align="right" sx={{ fontWeight: 'bold' }}>
                    Wartość netto:
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {(() => {
                      // Obliczanie całkowitej wartości netto (produkty + dodatkowe koszty)
                      const productsValue = typeof purchaseOrder.items === 'object' && Array.isArray(purchaseOrder.items)
                        ? purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
                        : 0;
                      
                      const additionalCosts = purchaseOrder.additionalCostsItems && Array.isArray(purchaseOrder.additionalCostsItems) 
                        ? purchaseOrder.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
                        : (parseFloat(purchaseOrder.additionalCosts) || 0);
                      
                      const totalNetValue = productsValue + additionalCosts;
                      
                      return `${totalNetValue.toFixed(2)} ${purchaseOrder.currency}`;
                    })()}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} align="right">
                    VAT {purchaseOrder.vatRate || 0}% (tylko od produktów):
                  </TableCell>
                  <TableCell align="right">
                    {(() => {
                      // Podatek VAT naliczany tylko od wartości produktów, bez dodatkowych kosztów
                      const productsValue = typeof purchaseOrder.items === 'object' && Array.isArray(purchaseOrder.items)
                        ? purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
                        : 0;
                        
                      const vatRate = purchaseOrder.vatRate || 0;
                      const vatValue = (productsValue * vatRate) / 100;
                      
                      return `${vatValue.toFixed(2)} ${purchaseOrder.currency}`;
                    })()}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell colSpan={3} align="right" sx={{ fontWeight: 'bold' }}>
                    Wartość brutto:
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {(() => {
                      // Obliczanie wartości brutto:
                      // 1. Pobierz wartość produktów
                      const productsValue = typeof purchaseOrder.items === 'object' && Array.isArray(purchaseOrder.items)
                        ? purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)
                        : 0;
                        
                      // 2. Oblicz VAT (tylko od wartości produktów)
                      const vatRate = purchaseOrder.vatRate || 0;
                      const vatValue = (productsValue * vatRate) / 100;
                      
                      // 3. Oblicz dodatkowe koszty
                      const additionalCosts = purchaseOrder.additionalCostsItems && Array.isArray(purchaseOrder.additionalCostsItems) 
                        ? purchaseOrder.additionalCostsItems.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
                        : (parseFloat(purchaseOrder.additionalCosts) || 0);
                        
                      // 4. Oblicz wartość brutto jako: wartość produktów + VAT + dodatkowe koszty
                      const grossValue = productsValue + vatValue + additionalCosts;
                      
                      // 5. Zapisz wartość brutto w bazie danych, jeśli się zmieniła
                      if (purchaseOrder.totalGross !== grossValue) {
                        // Aktualizacja w bazie danych
                        (async () => {
                          try {
                            await updateDoc(doc(db, 'purchaseOrders', orderId), {
                              totalGross: grossValue
                            });
                            console.log('Zaktualizowano wartość brutto PO:', grossValue);
                          } catch (error) {
                            console.error('Błąd podczas aktualizacji wartości brutto:', error);
                          }
                        })();
                      }
                      
                      console.log(`PO ${purchaseOrder.number || orderId} - wartość brutto: ${grossValue} (produkty: ${productsValue}, VAT: ${vatValue}, koszty: ${additionalCosts})`);
                      
                      return `${grossValue.toFixed(2)} ${purchaseOrder.currency}`;
                    })()}
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
          
          <Box sx={{ mt: 4, mb: 2 }}>
            <Typography variant="body2" gutterBottom>Data wydruku: {format(new Date(), 'dd.MM.yyyy HH:mm', { locale: pl })}</Typography>
          </Box>
          
          <Divider sx={{ mb: 2 }} />
          
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <Typography variant="body2">Podpis zamawiającego:</Typography>
              <Box sx={{ mt: 4, borderTop: '1px solid #aaa', width: '80%' }} />
            </Grid>
            <Grid item xs={6}>
              <Typography variant="body2">Podpis dostawcy:</Typography>
              <Box sx={{ mt: 4, borderTop: '1px solid #aaa', width: '80%' }} />
            </Grid>
          </Grid>
        </Box>
      </Box>
    </Box>
  );
};

export default PurchaseOrderDetails; 