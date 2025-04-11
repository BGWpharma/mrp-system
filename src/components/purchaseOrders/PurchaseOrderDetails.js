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
  ArrowBack as ArrowBackIcon,
  Person as PersonIcon,
  LocationOn as LocationOnIcon,
  Email as EmailIcon,
  Phone as PhoneIcon
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
import { updateDoc, doc, getDoc } from 'firebase/firestore';
import { formatCurrency } from '../../utils/formatUtils';
import { getUsersDisplayNames } from '../../services/userService';

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
  const [userNames, setUserNames] = useState({});
  
  const printRef = useRef(null);
  
  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Zamówienie ${purchaseOrder?.number || 'PO'}`,
    onBeforeGetContent: () => {
      return new Promise((resolve) => {
        console.log('printRef:', printRef.current);
        if (!printRef.current) {
          showError('Nie można znaleźć zawartości do wydruku. Spróbuj odświeżyć stronę.');
          return Promise.reject('Element do wydruku nie jest dostępny');
        }
        resolve();
      });
    },
    onPrintError: (error) => {
      console.error('Błąd podczas drukowania:', error);
      showError('Wystąpił błąd podczas drukowania. Spróbuj ponownie.');
    },
    removeAfterPrint: true
  });
  
  useEffect(() => {
    const fetchPurchaseOrder = async () => {
      try {
        const data = await getPurchaseOrderById(orderId);
        setPurchaseOrder(data);
        
        // Jeśli zamówienie ma historię zmian statusu, pobierz dane użytkowników
        if (data.statusHistory && data.statusHistory.length > 0) {
          const userIds = data.statusHistory.map(change => change.changedBy).filter(id => id);
          const uniqueUserIds = [...new Set(userIds)];
          const names = await getUsersDisplayNames(uniqueUserIds);
          setUserNames(names);
        }
      } catch (error) {
        showError('Błąd podczas pobierania danych zamówienia: ' + error.message);
      } finally {
        setLoading(false);
      }
    };
    
    if (orderId) {
      fetchPurchaseOrder();
    }
    
    // Sprawdź, czy należy odświeżyć dane po powrocie z innej strony
    const refreshId = localStorage.getItem('refreshPurchaseOrder');
    if (refreshId === orderId) {
      // Usuń flagę, aby nie odświeżać wielokrotnie
      localStorage.removeItem('refreshPurchaseOrder');
      // Odśwież dane po krótkim opóźnieniu, aby aplikacja zdążyła się załadować
      setTimeout(() => {
        fetchPurchaseOrder();
        showSuccess('Dane zamówienia zostały zaktualizowane po przyjęciu towaru');
      }, 500);
    }
  }, [orderId, showError]);
  
  // Funkcja zwracająca nazwę użytkownika zamiast ID
  const getUserName = (userId) => {
    return userNames[userId] || userId || 'System';
  };
  
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
      
      // Jeśli historia statusu została zaktualizowana, pobierz dane nowych użytkowników
      if (updatedData.statusHistory && updatedData.statusHistory.length > 0) {
        const userIds = updatedData.statusHistory.map(change => change.changedBy).filter(id => id);
        const uniqueUserIds = [...new Set(userIds)];
        const missingUserIds = uniqueUserIds.filter(id => !userNames[id]);
        
        if (missingUserIds.length > 0) {
          const newNames = await getUsersDisplayNames(missingUserIds);
          setUserNames(prevNames => ({
            ...prevNames,
            ...newNames
          }));
        }
      }
      
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
    const queryParams = new URLSearchParams();
    queryParams.append('poNumber', purchaseOrder.number);
    queryParams.append('orderId', orderId);
    queryParams.append('quantity', itemToReceive.quantity);
    queryParams.append('unitPrice', unitPrice);
    queryParams.append('reason', 'purchase');
    queryParams.append('source', 'purchase'); 
    queryParams.append('sourceId', orderId);
    
    // Dodaj dodatkowe informacje, które pomogą zidentyfikować pozycję w zamówieniu
    if (itemToReceive.id) {
      queryParams.append('itemPOId', itemToReceive.id);
    } else if (itemToReceive.itemId) {
      queryParams.append('itemPOId', itemToReceive.itemId);
    }
    
    // Dodaj nazwę produktu dla łatwiejszego dopasowania w zamówieniu
    if (itemToReceive.name) {
      queryParams.append('itemName', itemToReceive.name);
    }
    
    // Dodaj referencję do numeru zamówienia
    queryParams.append('reference', purchaseOrder.number);
    
    // Dodaj parametr returnTo, aby strona wiedziała, gdzie wrócić po wykonaniu operacji
    queryParams.append('returnTo', `/purchase-orders/${orderId}`);
    
    // Ustaw flagę, która spowoduje odświeżenie danych po powrocie
    localStorage.setItem('refreshPurchaseOrder', orderId);
    
    navigate(`/inventory/${itemToReceive.inventoryItemId}/receive?${queryParams.toString()}`);
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
    try {
      // Obsłuż różne rodzaje dat
      let date;
      
      // Jeśli to Timestamp z Firebase
      if (dateIsoString && typeof dateIsoString.toDate === 'function') {
        date = dateIsoString.toDate();
      } 
      // Jeśli to string ISO lub wartość, którą można przekształcić na Date
      else {
        date = new Date(dateIsoString);
      }
      
      // Sprawdź, czy data jest prawidłowa
      if (isNaN(date.getTime())) {
        console.warn(`Nieprawidłowa wartość daty: ${dateIsoString}`);
        return 'Nie określono';
      }
      
    return format(date, 'dd MMMM yyyy', { locale: pl });
    } catch (error) {
      console.error(`Błąd formatowania daty: ${dateIsoString}`, error);
      return 'Błąd odczytu daty';
    }
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
  const canReceiveItems = purchaseOrder.status === PURCHASE_ORDER_STATUSES.ORDERED || 
                          purchaseOrder.status === 'ordered' || 
                          purchaseOrder.status === 'partial' || 
                          purchaseOrder.status === PURCHASE_ORDER_STATUSES.PARTIAL ||
                          purchaseOrder.status === PURCHASE_ORDER_STATUSES.CONFIRMED || 
                          purchaseOrder.status === 'confirmed' ||
                          purchaseOrder.status === PURCHASE_ORDER_STATUSES.SHIPPED || 
                          purchaseOrder.status === 'shipped' ||
                          purchaseOrder.status === PURCHASE_ORDER_STATUSES.DELIVERED || 
                          purchaseOrder.status === 'delivered';
  
  // Dodajemy alternatywną funkcję do drukowania w przypadku problemów
  const handleDirectPrint = () => {
    console.log('Używam alternatywnej metody drukowania...');
    console.log('printRef:', printRef.current);
    
    if (!printRef.current) {
      showError('Nie można znaleźć zawartości do wydruku');
      return;
    }
    
    try {
      // Otwieramy nowe okno
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      
      // Przygotowujemy zawartość HTML
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Zamówienie ${purchaseOrder?.number || 'PO'}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              margin-bottom: 20px;
              padding-bottom: 10px;
              border-bottom: 1px solid #ddd;
            }
            .section {
              margin-bottom: 20px;
              padding: 15px;
              border: 1px solid #eee;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              padding: 8px;
              text-align: left;
              border-bottom: 1px solid #ddd;
            }
            th {
              background-color: #f2f2f2;
            }
            .supplier-info {
              margin-bottom: 15px;
            }
            .total-section {
              text-align: right;
              margin-top: 20px;
            }
          </style>
        </head>
        <body onload="window.print(); window.setTimeout(function() { window.close(); }, 500);">
          <div class="header">
            <h1>Zamówienie ${purchaseOrder?.number || ''}</h1>
            <p>Status: ${purchaseOrder?.status || ''}</p>
          </div>
          
          <div class="section">
            <div class="supplier-info">
              <h3>Dostawca</h3>
              <p>${purchaseOrder?.supplier?.name || 'Brak danych dostawcy'}</p>
              ${purchaseOrder?.supplier?.contactPerson ? `<p>Osoba kontaktowa: ${purchaseOrder.supplier.contactPerson}</p>` : ''}
              ${purchaseOrder?.supplier?.email ? `<p>Email: ${purchaseOrder.supplier.email}</p>` : ''}
              ${purchaseOrder?.supplier?.phone ? `<p>Telefon: ${purchaseOrder.supplier.phone}</p>` : ''}
            </div>
            
            <div>
              <h3>Informacje o zamówieniu</h3>
              <p>Data zamówienia: ${purchaseOrder?.orderDate ? new Date(purchaseOrder.orderDate).toLocaleDateString('pl') : 'Nie określono'}</p>
              <p>Oczekiwana data dostawy: ${purchaseOrder?.expectedDeliveryDate ? new Date(purchaseOrder.expectedDeliveryDate).toLocaleDateString('pl') : 'Nie określono'}</p>
            </div>
          </div>
          
          <div class="section">
            <h3>Pozycje zamówienia</h3>
            <table>
              <thead>
                <tr>
                  <th>Produkt</th>
                  <th>Ilość</th>
                  <th>Jednostka</th>
                  <th>Cena jedn.</th>
                  <th>Wartość</th>
                </tr>
              </thead>
              <tbody>
                ${purchaseOrder?.items?.map(item => `
                  <tr>
                    <td>${item.name}</td>
                    <td>${item.quantity}</td>
                    <td>${item.unit}</td>
                    <td>${formatCurrency(item.unitPrice, purchaseOrder.currency)}</td>
                    <td>${formatCurrency(item.totalPrice, purchaseOrder.currency)}</td>
                  </tr>
                `).join('') || '<tr><td colspan="5">Brak pozycji</td></tr>'}
              </tbody>
            </table>
            
            <div class="total-section">
              <p>Wartość netto: ${formatCurrency(purchaseOrder?.totalValue, purchaseOrder?.currency)}</p>
              <p>VAT (${purchaseOrder?.vatRate || 0}%): ${formatCurrency(purchaseOrder?.totalValue * (purchaseOrder?.vatRate / 100), purchaseOrder?.currency)}</p>
              <h3>Wartość brutto: ${formatCurrency(purchaseOrder?.totalGross, purchaseOrder?.currency)}</h3>
            </div>
          </div>
          
          ${purchaseOrder?.notes ? `
            <div class="section">
              <h3>Uwagi</h3>
              <p>${purchaseOrder.notes}</p>
            </div>
          ` : ''}
        </body>
        </html>
      `;
      
      // Wpisujemy do nowego okna
      printWindow.document.open();
      printWindow.document.write(printContent);
      printWindow.document.close();
    } catch (error) {
      console.error('Błąd podczas drukowania:', error);
      showError('Wystąpił błąd podczas drukowania. Spróbuj ponownie.');
    }
  };
  
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
            onClick={handleDirectPrint}
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
      
      <Box 
        ref={printRef} 
        sx={{ 
          mb: 3,
          '@media print': {
            padding: 0,
            margin: 0
          }
        }}
      >
        <Paper sx={{ p: 3, mb: 3 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <Box sx={{ mb: 2 }}>
                <Typography variant="h5" component="h1">
                  Zamówienie {purchaseOrder.number}
                  <Box component="span" sx={{ ml: 2 }}>
                    {getStatusChip(purchaseOrder.status)}
                  </Box>
                </Typography>
              </Box>
              
              <Typography variant="body1" gutterBottom>
                <strong>Data zamówienia:</strong> {formatDate(purchaseOrder.orderDate)}
              </Typography>
              
              <Typography variant="body1" gutterBottom>
                <strong>Oczekiwana data dostawy:</strong> {formatDate(purchaseOrder.expectedDeliveryDate)}
              </Typography>
              
              {purchaseOrder.status === PURCHASE_ORDER_STATUSES.DELIVERED && (
                <Typography variant="body1" gutterBottom>
                  <strong>Data dostawy:</strong> {formatDate(purchaseOrder.deliveredAt)}
                </Typography>
              )}
              
              {purchaseOrder.invoiceLink && (
                <Typography variant="body1" gutterBottom>
                  <strong>Faktura:</strong>{' '}
                  <Link href={purchaseOrder.invoiceLink} target="_blank" rel="noopener noreferrer">
                    Zobacz fakturę
                  </Link>
                </Typography>
              )}
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Dostawca</Typography>
              
              {purchaseOrder.supplier ? (
                <>
                  <Typography variant="body1" gutterBottom>
                    <strong>{purchaseOrder.supplier.name}</strong>
                  </Typography>
                  <Typography variant="body2" gutterBottom>
                    {purchaseOrder.supplier.contactPerson && (
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <PersonIcon sx={{ mr: 1, fontSize: 16 }} />
                        {purchaseOrder.supplier.contactPerson}
                      </Box>
                    )}
                    
                    {/* Adres główny dostawcy */}
                    {getSupplierMainAddress(purchaseOrder.supplier) && (
                      <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1 }}>
                        <LocationOnIcon sx={{ mr: 1, fontSize: 16, mt: 0.5 }} />
                        <span>{formatAddress(getSupplierMainAddress(purchaseOrder.supplier))}</span>
                      </Box>
                    )}
                    
                    {purchaseOrder.supplier.email && (
                      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                        <EmailIcon sx={{ mr: 1, fontSize: 16 }} />
                        <a href={`mailto:${purchaseOrder.supplier.email}`}>{purchaseOrder.supplier.email}</a>
                      </Box>
                    )}
                    
                    {purchaseOrder.supplier.phone && (
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        <PhoneIcon sx={{ mr: 1, fontSize: 16 }} />
                        <a href={`tel:${purchaseOrder.supplier.phone}`}>{purchaseOrder.supplier.phone}</a>
                      </Box>
                    )}
                  </Typography>
                </>
              ) : (
                <Typography variant="body2">
                  Brak danych dostawcy
                </Typography>
              )}
            </Grid>
          </Grid>
        </Paper>
        
        {/* Historia zmian statusu */}
        {purchaseOrder.statusHistory && purchaseOrder.statusHistory.length > 0 && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" gutterBottom>
              Historia zmian statusu
            </Typography>
            
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Data i godzina</TableCell>
                  <TableCell>Poprzedni status</TableCell>
                  <TableCell>Nowy status</TableCell>
                  <TableCell>Kto zmienił</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...purchaseOrder.statusHistory].reverse().map((change, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {change.changedAt ? new Date(change.changedAt).toLocaleString('pl') : 'Brak daty'}
                    </TableCell>
                    <TableCell>{translateStatus(change.oldStatus)}</TableCell>
                    <TableCell>{translateStatus(change.newStatus)}</TableCell>
                    <TableCell>{getUserName(change.changedBy)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}
        
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" gutterBottom>Elementy zamówienia</Typography>
          
          <TableContainer sx={{ mb: 3 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nazwa produktu</TableCell>
                  <TableCell align="right">Ilość</TableCell>
                  <TableCell>Jednostka</TableCell>
                  <TableCell align="right">Cena jedn.</TableCell>
                  <TableCell align="right">Wartość netto</TableCell>
                  <TableCell align="right">Odebrano</TableCell>
                  {/* Ukrywamy kolumnę akcji przy drukowaniu */}
                  <TableCell sx={{ '@media print': { display: 'none' } }}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {purchaseOrder.items?.map((item, index) => {
                  // Oblicz procent realizacji
                  const received = parseFloat(item.received || 0);
                  const quantity = parseFloat(item.quantity || 0);
                  const fulfilledPercentage = quantity > 0 ? (received / quantity) * 100 : 0;
                  
                  // Określ kolor tła dla wiersza
                  let rowColor = 'inherit'; // Domyślny kolor
                  if (fulfilledPercentage >= 100) {
                    rowColor = 'rgba(76, 175, 80, 0.1)'; // Lekko zielony dla w pełni odebranych
                  } else if (fulfilledPercentage > 0) {
                    rowColor = 'rgba(255, 152, 0, 0.1)'; // Lekko pomarańczowy dla częściowo odebranych
                  }
                  
                  return (
                    <TableRow 
                      key={index}
                      sx={{ backgroundColor: rowColor }}
                    >
                      <TableCell>{item.name}</TableCell>
                      <TableCell align="right">{item.quantity}</TableCell>
                      <TableCell>{item.unit}</TableCell>
                      <TableCell align="right">{formatCurrency(item.unitPrice, purchaseOrder.currency)}</TableCell>
                      <TableCell align="right">{formatCurrency(item.totalPrice, purchaseOrder.currency)}</TableCell>
                      <TableCell align="right">
                        {received} {received > 0 && `(${fulfilledPercentage.toFixed(0)}%)`}
                      </TableCell>
                      {/* Ukrywamy przycisk akcji przy drukowaniu */}
                      <TableCell align="right" sx={{ '@media print': { display: 'none' } }}>
                        {canReceiveItems && item.inventoryItemId && 
                         (parseFloat(item.received || 0) < parseFloat(item.quantity || 0)) && (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<InventoryIcon />}
                            onClick={() => handleReceiveClick(item)}
                          >
                            Przyjmij
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              {purchaseOrder.notes && (
                <>
                  <Typography variant="subtitle1" gutterBottom>Uwagi:</Typography>
                  <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.paper' }}>
                    <Typography variant="body2">
                      {purchaseOrder.notes}
                    </Typography>
                  </Paper>
                </>
              )}
            </Grid>
            <Grid item xs={12} md={6}>
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <Typography variant="body1" gutterBottom>
                  <strong>Wartość netto:</strong> {formatCurrency(purchaseOrder.totalValue, purchaseOrder.currency)}
                </Typography>
                
                <Typography variant="body1" gutterBottom>
                  <strong>VAT ({purchaseOrder.vatRate}%):</strong> {formatCurrency(purchaseOrder.totalValue * (purchaseOrder.vatRate / 100), purchaseOrder.currency)}
                </Typography>
                
                {purchaseOrder.additionalCostsItems?.length > 0 && purchaseOrder.additionalCostsItems.map((cost, index) => (
                  <Typography key={index} variant="body1" gutterBottom>
                    <strong>{cost.description || `Dodatkowy koszt ${index+1}`}:</strong> {formatCurrency(typeof cost.value === 'number' ? cost.value : parseFloat(cost.value) || 0, purchaseOrder.currency)}
                  </Typography>
                ))}
                
                <Typography variant="h6" sx={{ mt: 1 }}>
                  <strong>Wartość brutto:</strong> {formatCurrency(purchaseOrder.totalGross, purchaseOrder.currency)}
                </Typography>
              </Box>
            </Grid>
          </Grid>
        </Paper>
      </Box>
      
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end', '@media print': { display: 'none' } }}>
        <Button 
          color="error"
          variant="outlined" 
          startIcon={<DeleteIcon />} 
          onClick={handleDeleteClick}
        >
          Usuń zamówienie
        </Button>
      </Box>
      
      {/* Dialog usuwania */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć to zamówienie? Tej operacji nie można cofnąć.
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
          <DialogContentText sx={{ mb: 2 }}>
            Wybierz nowy status zamówienia:
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              label="Status"
            >
              <MenuItem value="draft">{translateStatus('draft')}</MenuItem>
              <MenuItem value="pending">{translateStatus('pending')}</MenuItem>
              <MenuItem value="approved">{translateStatus('approved')}</MenuItem>
              <MenuItem value="ordered">{translateStatus('ordered')}</MenuItem>
              <MenuItem value="partial">{translateStatus('partial')}</MenuItem>
              <MenuItem value="shipped">{translateStatus('shipped')}</MenuItem>
              <MenuItem value="delivered">{translateStatus('delivered')}</MenuItem>
              <MenuItem value="cancelled">{translateStatus('cancelled')}</MenuItem>
              <MenuItem value="completed">{translateStatus('completed')}</MenuItem>
              <MenuItem value="confirmed">{translateStatus('confirmed')}</MenuItem>
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
        <DialogTitle>Przyjęcie towaru do magazynu</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy chcesz przejść do strony przyjęcia towaru dla produktu: {itemToReceive?.name}?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReceiveDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleReceiveItem} color="primary">Przyjmij</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog linku do faktury */}
      <Dialog
        open={invoiceLinkDialogOpen}
        onClose={() => setInvoiceLinkDialogOpen(false)}
      >
        <DialogTitle>
          {purchaseOrder.invoiceLink ? 'Zmień link do faktury' : 'Dodaj link do faktury'}
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wprowadź link do faktury dla tego zamówienia. Może to być link do dokumentu w chmurze lub systemu księgowego.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            label="Link do faktury"
            type="url"
            fullWidth
            value={invoiceLink}
            onChange={(e) => setInvoiceLink(e.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvoiceLinkDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleInvoiceLinkSave} color="primary">Zapisz</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PurchaseOrderDetails; 