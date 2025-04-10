import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Paper,
  Typography,
  Grid,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  IconButton,
  CircularProgress,
  Card,
  CardContent,
  Link,
  Stack,
  TextField,
  Input,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Print as PrintIcon,
  Email as EmailIcon,
  LocalShipping as LocalShippingIcon,
  Schedule as ScheduleIcon,
  EventNote as EventNoteIcon,
  Payment as PaymentIcon,
  Person as PersonIcon,
  LocationOn as LocationOnIcon,
  Phone as PhoneIcon,
  Upload as UploadIcon,
  DownloadRounded as DownloadIcon,
  Delete as DeleteIcon,
  Engineering as EngineeringIcon,
  PlaylistAdd as PlaylistAddIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { getOrderById, ORDER_STATUSES, updateOrder } from '../../services/orderService';
import { useNotification } from '../../hooks/useNotification';
import { formatCurrency } from '../../utils/formatUtils';
import { formatTimestamp, formatDate } from '../../utils/dateUtils';
import { storage } from '../../services/firebase/config';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '../../contexts/AuthContext';
import { getAllPurchaseOrders } from '../../services/purchaseOrderService';
import { db } from '../../services/firebase/config';
import { getDoc, doc } from 'firebase/firestore';
import { getUsersDisplayNames } from '../../services/userService';

const OrderDetails = () => {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const { showError, showSuccess } = useNotification();
  const navigate = useNavigate();
  const fileInputRef = React.useRef(null);
  const { currentUser } = useAuth();
  const [openPurchaseOrderDialog, setOpenPurchaseOrderDialog] = useState(false);
  const [availablePurchaseOrders, setAvailablePurchaseOrders] = useState([]);
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState('');
  const [loadingPurchaseOrders, setLoadingPurchaseOrders] = useState(false);
  const [userNames, setUserNames] = useState({});

  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        setLoading(true);
        const orderData = await getOrderById(orderId);
        setOrder(orderData);
        
        // Jeśli zamówienie ma historię zmian statusu, pobierz dane użytkowników
        if (orderData.statusHistory && orderData.statusHistory.length > 0) {
          const userIds = orderData.statusHistory.map(change => change.changedBy).filter(id => id);
          const uniqueUserIds = [...new Set(userIds)];
          const names = await getUsersDisplayNames(uniqueUserIds);
          setUserNames(names);
        }
      } catch (error) {
        showError('Błąd podczas pobierania szczegółów zamówienia: ' + error.message);
        console.error('Error fetching order details:', error);
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchOrderDetails();
    }
  }, [orderId, showError, navigate]);

  // Funkcja do ręcznego odświeżania danych zamówienia
  const refreshOrderData = async () => {
    try {
      setLoading(true);
      const refreshedOrderData = await getOrderById(orderId);
      setOrder(refreshedOrderData);
      showSuccess('Dane zamówienia zostały odświeżone');
    } catch (error) {
      showError('Błąd podczas odświeżania danych zamówienia: ' + error.message);
      console.error('Error refreshing order data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBackClick = () => {
    navigate('/orders');
  };

  const handleEditClick = () => {
    navigate(`/orders/edit/${orderId}`);
  };

  const handlePrintInvoice = () => {
    // Funkcjonalność drukowania faktury do zaimplementowania w przyszłości
    window.print();
  };

  const handleSendEmail = () => {
    // Funkcjonalność wysyłania emaila do zaimplementowania w przyszłości
    const emailAddress = order?.customer?.email;
    if (emailAddress) {
      window.location.href = `mailto:${emailAddress}?subject=Zamówienie ${order.orderNumber || order.id.substring(0, 8).toUpperCase()}`;
    }
  };

  const handleDeliveryProofUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      
      // Tworzymy referencję do pliku w Firebase Storage
      const storageRef = ref(storage, `delivery_proofs/${orderId}/${file.name}`);
      
      // Przesyłamy plik
      await uploadBytes(storageRef, file);
      
      // Pobieramy URL do pliku
      const downloadURL = await getDownloadURL(storageRef);
      
      // Aktualizujemy zamówienie z URL do dowodu dostawy
      await updateOrder(orderId, { ...order, deliveryProof: downloadURL }, currentUser.uid);
      
      // Aktualizujemy stan lokalny
      setOrder({ ...order, deliveryProof: downloadURL });
      
      showSuccess('Dowód dostawy został pomyślnie przesłany');
    } catch (error) {
      console.error('Błąd podczas przesyłania pliku:', error);
      showError('Wystąpił błąd podczas przesyłania pliku');
    } finally {
      setUploading(false);
    }
  };
  
  const handleDeleteDeliveryProof = async () => {
    if (!order.deliveryProof) return;
    
    try {
      setUploading(true);
      
      // Wyciągamy ścieżkę pliku z URL
      const fileUrl = order.deliveryProof;
      const storageRef = ref(storage, fileUrl);
      
      // Usuwamy plik z Firebase Storage
      await deleteObject(storageRef);
      
      // Aktualizujemy zamówienie
      await updateOrder(orderId, { ...order, deliveryProof: null }, currentUser.uid);
      
      // Aktualizujemy stan lokalny
      setOrder({ ...order, deliveryProof: null });
      
      showSuccess('Dowód dostawy został usunięty');
    } catch (error) {
      console.error('Błąd podczas usuwania pliku:', error);
      showError('Wystąpił błąd podczas usuwania pliku');
    } finally {
      setUploading(false);
    }
  };

  const getStatusChipColor = (status) => {
    switch (status) {
      case 'Nowe': return 'primary';
      case 'W realizacji': return 'info';
      case 'Gotowe do wysyłki': return 'warning';
      case 'Wysłane': return 'secondary';
      case 'Dostarczone': return 'success';
      case 'Anulowane': return 'error';
      default: return 'default';
    }
  };

  const getProductionStatusColor = (status) => {
    switch (status) {
      case 'Nowe': return 'default';
      case 'Zaplanowane': return 'primary';
      case 'W trakcie': return 'secondary';
      case 'Wstrzymane': return 'warning';
      case 'Zakończone': return 'success';
      case 'Anulowane': return 'error';
      case 'Potwierdzenie zużycia': return 'info';
      default: return 'default';
    }
  };

  const handleAssignPurchaseOrder = () => {
    setOpenPurchaseOrderDialog(true);
    fetchAvailablePurchaseOrders();
  };
  
  const fetchAvailablePurchaseOrders = async () => {
    try {
      setLoadingPurchaseOrders(true);
      const allPurchaseOrders = await getAllPurchaseOrders();
      
      // Filtruj, aby wyświetlić tylko PO, które jeszcze nie są przypisane do tego zamówienia
      const alreadyLinkedIds = (order.linkedPurchaseOrders || []).map(po => po.id);
      const filteredPOs = allPurchaseOrders.filter(po => !alreadyLinkedIds.includes(po.id));
      
      setAvailablePurchaseOrders(filteredPOs);
    } catch (error) {
      console.error('Błąd podczas pobierania dostępnych zamówień zakupowych:', error);
    } finally {
      setLoadingPurchaseOrders(false);
    }
  };
  
  const handleClosePurchaseOrderDialog = () => {
    setOpenPurchaseOrderDialog(false);
    setSelectedPurchaseOrderId('');
  };
  
  const handlePurchaseOrderSelection = (event) => {
    setSelectedPurchaseOrderId(event.target.value);
  };
  
  const handleAssignSelected = async () => {
    if (!selectedPurchaseOrderId) return;
    
    try {
      const selectedPO = availablePurchaseOrders.find(po => po.id === selectedPurchaseOrderId);
      if (!selectedPO) return;
      
      // Przygotuj dane dla nowo powiązanego PO
      const poToLink = {
        id: selectedPO.id,
        number: selectedPO.number,
        supplier: selectedPO.supplier?.name || selectedPO.supplier || 'Nieznany dostawca',
        items: selectedPO.items?.length || 0,
        totalGross: selectedPO.totalGross || 0,
        status: selectedPO.status || 'draft'
      };
      
      // Dodaj nowe PO do listy
      const updatedLinkedPOs = [...(order.linkedPurchaseOrders || []), poToLink];
      
      // Zaktualizuj zamówienie w bazie danych
      const updatedOrder = {
        ...order,
        linkedPurchaseOrders: updatedLinkedPOs
      };
      
      await updateOrder(order.id, updatedOrder, currentUser.uid);
      
      // Zaktualizuj stan lokalny
      setOrder(updatedOrder);
      
      // Zamknij dialog
      handleClosePurchaseOrderDialog();
    } catch (error) {
      console.error('Błąd podczas przypisywania zamówienia zakupowego:', error);
    }
  };

  // Funkcja zwracająca nazwę użytkownika zamiast ID
  const getUserName = (userId) => {
    return userNames[userId] || userId || 'System';
  };

  // Dodaję komponent wyświetlający historię zmian statusu przed sekcją z listą produktów
  const renderStatusHistory = () => {
    if (!order.statusHistory || order.statusHistory.length === 0) {
      return null;
    }
    
    return (
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
            {[...order.statusHistory].reverse().map((change, index) => (
              <TableRow key={index}>
                <TableCell>
                  {change.changedAt ? new Date(change.changedAt).toLocaleString('pl') : 'Brak daty'}
                </TableCell>
                <TableCell>{change.oldStatus}</TableCell>
                <TableCell>{change.newStatus}</TableCell>
                <TableCell>{getUserName(change.changedBy)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    );
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!order) {
    return (
      <Box sx={{ textAlign: 'center', mt: 4 }}>
        <Typography variant="h6" color="error">
          Nie znaleziono zamówienia
        </Typography>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={handleBackClick}
          sx={{ mt: 2 }}
        >
          Powrót do listy zamówień
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ pb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={handleBackClick}
        >
          Powrót
        </Button>
        <Typography variant="h5">
          Zamówienie {order.orderNumber || order.id.substring(0, 8).toUpperCase()}
        </Typography>
        <Box>
          <Button 
            startIcon={<EditIcon />} 
            variant="outlined"
            onClick={handleEditClick}
            sx={{ mr: 1 }}
          >
            Edytuj
          </Button>
          <Button 
            startIcon={<PrintIcon />} 
            variant="outlined"
            onClick={handlePrintInvoice}
          >
            Drukuj
          </Button>
        </Box>
      </Box>

      {/* Status i informacje podstawowe */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6" sx={{ mr: 2 }}>Status:</Typography>
              <Chip 
                label={order.status} 
                color={getStatusChipColor(order.status)}
                size="medium"
              />
            </Box>
            <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <EventNoteIcon sx={{ mr: 1 }} fontSize="small" />
              Data zamówienia: {formatTimestamp(order.orderDate, true)}
            </Typography>
            {order.expectedDeliveryDate && (
              <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ScheduleIcon sx={{ mr: 1 }} fontSize="small" />
                Oczekiwana dostawa: {formatTimestamp(order.expectedDeliveryDate, true)}
              </Typography>
            )}
            {order.deliveryDate && (
              <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center' }}>
                <LocalShippingIcon sx={{ mr: 1 }} fontSize="small" />
                Dostarczone: {formatTimestamp(order.deliveryDate, true)}
              </Typography>
            )}
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', flexDirection: 'column', height: '100%' }}>
              <Typography variant="h6" align="right">
                Łączna wartość:
              </Typography>
              <Typography variant="h4" align="right" color="primary.main" sx={{ fontWeight: 'bold' }}>
                {(() => {
                  // Oblicz wartość produktów
                  const productsValue = order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
                  
                  // Koszt dostawy
                  const shippingCost = parseFloat(order.shippingCost) || 0;
                  
                  // Oblicz sumę wartości brutto zamówień zakupu
                  const poTotal = (order.linkedPurchaseOrders || []).reduce((sum, po) => {
                    try {
                      // Jeśli zamówienie ma wartość brutto, użyj jej
                      if (po.totalGross !== undefined && po.totalGross !== null) {
                        return sum + (parseFloat(po.totalGross) || 0);
                      }
                      
                      // W przeciwnym razie oblicz wartość brutto
                      const poValue = parseFloat(po.value) || 0;
                      const vatRate = parseFloat(po.vatRate) || 23;
                      const vatValue = (poValue * vatRate) / 100;
                      
                      // Sprawdzenie różnych formatów dodatkowych kosztów
                      let additionalCosts = 0;
                      if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
                        additionalCosts = po.additionalCostsItems.reduce((costsSum, cost) => {
                          return costsSum + (parseFloat(cost.value) || 0);
                        }, 0);
                      } else if (po.additionalCosts !== undefined) {
                        additionalCosts = typeof po.additionalCosts === 'number' ? po.additionalCosts : parseFloat(po.additionalCosts) || 0;
                      }
                      
                      // Wartość brutto: produkty + VAT + dodatkowe koszty
                      return sum + poValue + vatValue + additionalCosts;
                    } catch (error) {
                      console.error('Błąd podczas obliczania wartości PO:', error);
                      return sum;
                    }
                  }, 0);
                  
                  // Łączna wartość
                  const total = productsValue + shippingCost + poTotal;
                  
                  return formatCurrency(total);
                })()}
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      {/* Informacje o kliencie i płatności */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Dane klienta</Typography>
              <IconButton 
                size="small" 
                color="primary"
                onClick={handleSendEmail}
                disabled={!order.customer?.email}
              >
                <EmailIcon />
              </IconButton>
            </Box>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="h6" sx={{ mb: 1 }}>{order.customer?.name || 'Brak nazwy klienta'}</Typography>
            <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <PersonIcon sx={{ mr: 1 }} fontSize="small" />
              Email: {order.customer?.email || '-'}
            </Typography>
            <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <PhoneIcon sx={{ mr: 1 }} fontSize="small" />
              Telefon: {order.customer?.phone || '-'}
            </Typography>
            <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center' }}>
              <LocationOnIcon sx={{ mr: 1 }} fontSize="small" />
              Adres dostawy: {order.customer?.shippingAddress || '-'}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Płatność i dostawa</Typography>
            <Divider sx={{ mb: 2 }} />
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="subtitle2">Metoda płatności:</Typography>
                <Typography variant="body1" sx={{ mb: 1 }}>{order.paymentMethod || '-'}</Typography>
                
                <Typography variant="subtitle2">Status płatności:</Typography>
                <Chip 
                  label={order.paymentStatus || 'Nieopłacone'} 
                  color={order.paymentStatus === 'Opłacone' ? 'success' : order.paymentStatus === 'Opłacone częściowo' ? 'warning' : 'error'}
                  size="small"
                  sx={{ mt: 0.5 }}
                />
              </Grid>
              <Grid item xs={6}>
                <Typography variant="subtitle2">Metoda dostawy:</Typography>
                <Typography variant="body1" sx={{ mb: 1 }}>{order.shippingMethod || '-'}</Typography>
                
                <Typography variant="subtitle2">Koszt dostawy:</Typography>
                <Typography variant="body1">{formatCurrency(order.shippingCost || 0)}</Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {/* Wyświetlenie historii zmian statusu */}
      {renderStatusHistory()}

      {/* Lista produktów */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Produkty</Typography>
        <Divider sx={{ mb: 2 }} />
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Produkt</TableCell>
              <TableCell align="right">Ilość</TableCell>
              <TableCell align="right">Cena</TableCell>
              <TableCell align="right">Wartość</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {order.items && order.items.map((item, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Typography variant="body1">{item.name}</Typography>
                  {item.id && (
                    <Typography variant="caption" color="textSecondary">
                      ID: {item.id}
                    </Typography>
                  )}
                </TableCell>
                <TableCell align="right">
                  {item.quantity} {item.unit}
                </TableCell>
                <TableCell align="right">
                  {formatCurrency(item.price)}
                </TableCell>
                <TableCell align="right">
                  {formatCurrency(item.price * item.quantity)}
                </TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={2} />
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                Suma częściowa:
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                {formatCurrency(order.items?.reduce((sum, item) => sum + item.price * item.quantity, 0) || 0)}
              </TableCell>
            </TableRow>
            <TableRow>
              <TableCell colSpan={2} />
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                Koszt dostawy:
              </TableCell>
              <TableCell align="right">
                {formatCurrency(order.shippingCost || 0)}
              </TableCell>
            </TableRow>
            {(order.linkedPurchaseOrders && order.linkedPurchaseOrders.length > 0) && (
              <TableRow>
                <TableCell colSpan={2} />
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  Wartość zamówień zakupu (brutto):
                </TableCell>
                <TableCell align="right">
                  {(() => {
                    // Obliczanie łącznej wartości brutto wszystkich zamówień zakupu
                    const totalGross = order.linkedPurchaseOrders.reduce((sum, po) => {
                      try {
                        // Jeśli zamówienie ma już wartość brutto, używamy jej
                        if (po.totalGross !== undefined && po.totalGross !== null) {
                          return sum + parseFloat(po.totalGross);
                        }
                        
                        // W przeciwnym razie obliczamy wartość brutto
                        const productsValue = parseFloat(po.value) || 0;
                        const vatRate = parseFloat(po.vatRate) || 23;
                        const vatValue = (productsValue * vatRate) / 100;
                        
                        // Sprawdź zarówno nowy jak i stary format dodatkowych kosztów
                        let additionalCosts = 0;
                        if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
                          additionalCosts = po.additionalCostsItems.reduce((costsSum, cost) => {
                            return costsSum + (parseFloat(cost.value) || 0);
                          }, 0);
                        } else if (po.additionalCosts !== undefined) {
                          additionalCosts = typeof po.additionalCosts === 'number' ? po.additionalCosts : parseFloat(po.additionalCosts) || 0;
                        }
                        
                        // Wartość brutto: produkty + VAT + dodatkowe koszty
                        const grossValue = productsValue + vatValue + additionalCosts;
                        
                        return sum + grossValue;
                      } catch (error) {
                        console.error('Błąd podczas obliczania wartości PO:', error);
                        return sum;
                      }
                    }, 0);
                    
                    return formatCurrency(totalGross);
                  })()}
                </TableCell>
              </TableRow>
            )}
            <TableRow>
              <TableCell colSpan={2} />
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                Razem:
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
                {(() => {
                  // Oblicz wartość produktów
                  const productsValue = order.items?.reduce((sum, item) => sum + (item.price * item.quantity), 0) || 0;
                  
                  // Koszt dostawy
                  const shippingCost = parseFloat(order.shippingCost) || 0;
                  
                  // Oblicz sumę wartości brutto zamówień zakupu
                  const poTotal = (order.linkedPurchaseOrders || []).reduce((sum, po) => {
                    try {
                      // Jeśli zamówienie ma wartość brutto, użyj jej
                      if (po.totalGross !== undefined && po.totalGross !== null) {
                        return sum + (parseFloat(po.totalGross) || 0);
                      }
                      
                      // W przeciwnym razie oblicz wartość brutto
                      const poValue = parseFloat(po.value) || 0;
                      const vatRate = parseFloat(po.vatRate) || 23;
                      const vatValue = (poValue * vatRate) / 100;
                      
                      // Sprawdź zarówno nowy jak i stary format dodatkowych kosztów
                      let additionalCosts = 0;
                      if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
                        additionalCosts = po.additionalCostsItems.reduce((costsSum, cost) => {
                          return costsSum + (parseFloat(cost.value) || 0);
                        }, 0);
                      } else if (po.additionalCosts !== undefined) {
                        additionalCosts = typeof po.additionalCosts === 'number' ? po.additionalCosts : parseFloat(po.additionalCosts) || 0;
                      }
                      
                      return sum + poValue + vatValue + additionalCosts;
                    } catch (error) {
                      console.error('Błąd podczas obliczania wartości PO:', error);
                      return sum;
                    }
                  }, 0);
                  
                  // Łączna wartość
                  return formatCurrency(productsValue + shippingCost + poTotal);
                })()}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Paper>

      {/* Sekcja dowodu dostawy */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Dowód dostawy</Typography>
        <Divider sx={{ mb: 2 }} />
        
        {order.deliveryProof ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Box sx={{ width: '100%', maxWidth: 600, mb: 2 }}>
              <img 
                src={order.deliveryProof} 
                alt="Dowód dostawy" 
                style={{ width: '100%', height: 'auto', borderRadius: 4 }} 
              />
            </Box>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button 
                variant="outlined"
                startIcon={<DownloadIcon />}
                href={order.deliveryProof}
                target="_blank"
                rel="noopener noreferrer"
              >
                Pobierz
              </Button>
              <Button 
                variant="outlined" 
                color="error" 
                startIcon={<DeleteIcon />}
                onClick={handleDeleteDeliveryProof}
                disabled={uploading}
              >
                Usuń
              </Button>
            </Box>
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <Typography variant="body1" sx={{ mb: 2 }}>
              Brak załączonego dowodu dostawy. Dodaj skan lub zdjęcie potwierdzenia dostawy.
            </Typography>
            <input
              ref={fileInputRef}
              accept="image/*, application/pdf"
              style={{ display: 'none' }}
              id="delivery-proof-upload"
              type="file"
              onChange={handleDeliveryProofUpload}
            />
            <label htmlFor="delivery-proof-upload">
              <Button
                variant="contained"
                component="span"
                startIcon={<UploadIcon />}
                disabled={uploading}
              >
                {uploading ? 'Przesyłanie...' : 'Dodaj dowód dostawy'}
              </Button>
            </label>
          </Box>
        )}
      </Paper>

      {/* Uwagi */}
      {order.notes && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Uwagi</Typography>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body1">
            {order.notes}
          </Typography>
        </Paper>
      )}
      
      {/* Powiązane zamówienia zakupu */}
      {order && (
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Powiązane zamówienia zakupu</Typography>
            <Button 
              variant="outlined" 
              startIcon={<PlaylistAddIcon />} 
              onClick={handleAssignPurchaseOrder}
            >
              Przypisz PO
            </Button>
          </Box>
          <Divider sx={{ mb: 2 }} />
          
          {order.linkedPurchaseOrders && order.linkedPurchaseOrders.length > 0 ? (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Numer zamówienia</TableCell>
                  <TableCell>Dostawca</TableCell>
                  <TableCell>Ilość pozycji</TableCell>
                  <TableCell align="right">Wartość brutto</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Akcje</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {order.linkedPurchaseOrders.map((po, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Chip 
                        label={po.number} 
                        color="primary" 
                        variant="outlined" 
                        size="small"
                        sx={{ fontWeight: 'bold' }}
                      />
                    </TableCell>
                    <TableCell>{po.supplier}</TableCell>
                    <TableCell>{po.items}</TableCell>
                    <TableCell align="right">
                      {(() => {
                        try {
                          // Jeśli zamówienie ma już wartość brutto, używamy jej
                          if (po.totalGross !== undefined && po.totalGross !== null) {
                            return formatCurrency(parseFloat(po.totalGross));
                          }
                          
                          // W przeciwnym razie obliczamy wartość brutto
                          const productsValue = parseFloat(po.value) || 0;
                          const vatRate = parseFloat(po.vatRate) || 23;
                          const vatValue = (productsValue * vatRate) / 100;
                          
                          // Sprawdzenie różnych formatów dodatkowych kosztów
                          let additionalCosts = 0;
                          if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
                            additionalCosts = po.additionalCostsItems.reduce((costsSum, cost) => {
                              return costsSum + (parseFloat(cost.value) || 0);
                            }, 0);
                          } else if (po.additionalCosts !== undefined) {
                            additionalCosts = typeof po.additionalCosts === 'number' ? po.additionalCosts : parseFloat(po.additionalCosts) || 0;
                          }
                          
                          // Wartość brutto: produkty + VAT + dodatkowe koszty
                          const grossValue = productsValue + vatValue + additionalCosts;
                          
                          return formatCurrency(grossValue);
                        } catch (error) {
                          console.error('Błąd podczas obliczania wartości PO:', error);
                          return formatCurrency(0);
                        }
                      })()}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={po.status || "Robocze"} 
                        color={
                          po.status === 'completed' ? 'success' : 
                          po.status === 'in_progress' ? 'warning' : 
                          'default'
                        }
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => navigate(`/purchase-orders/${po.id}`)}
                      >
                        Szczegóły
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                
                {/* Podsumowanie wartości */}
                <TableRow>
                  <TableCell colSpan={3} align="right" sx={{ fontWeight: 'bold' }}>
                    Łączna wartość brutto zamówień zakupu:
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                    {(() => {
                      // Obliczanie łącznej wartości brutto wszystkich zamówień zakupu
                      const totalGross = order.linkedPurchaseOrders.reduce((sum, po) => {
                        try {
                          // Jeśli zamówienie ma już wartość brutto, używamy jej
                          if (po.totalGross !== undefined && po.totalGross !== null) {
                            return sum + parseFloat(po.totalGross);
                          }
                          
                          // W przeciwnym razie obliczamy wartość brutto
                          const productsValue = parseFloat(po.value) || 0;
                          const vatRate = parseFloat(po.vatRate) || 23;
                          const vatValue = (productsValue * vatRate) / 100;
                          
                          // Sprawdź zarówno nowy jak i stary format dodatkowych kosztów
                          let additionalCosts = 0;
                          if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
                            additionalCosts = po.additionalCostsItems.reduce((costsSum, cost) => {
                              return costsSum + (parseFloat(cost.value) || 0);
                            }, 0);
                          } else if (po.additionalCosts !== undefined) {
                            additionalCosts = typeof po.additionalCosts === 'number' ? po.additionalCosts : parseFloat(po.additionalCosts) || 0;
                          }
                          
                          return sum + productsValue + vatValue + additionalCosts;
                        } catch (error) {
                          console.error('Błąd podczas obliczania wartości PO:', error);
                          return sum;
                        }
                      }, 0);
                      
                      return formatCurrency(totalGross);
                    })()}
                  </TableCell>
                  <TableCell colSpan={2} />
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <Typography variant="body1" color="text.secondary">
              Brak powiązanych zamówień zakupu
            </Typography>
          )}
        </Paper>
      )}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Zadania produkcyjne</Typography>
          <IconButton 
            color="primary" 
            onClick={refreshOrderData} 
            title="Odśwież dane zadań produkcyjnych"
          >
            <RefreshIcon />
          </IconButton>
        </Box>
        <Divider sx={{ mb: 2 }} />
        
        {!order.productionTasks || order.productionTasks.length === 0 ? (
          <Typography variant="body1" color="text.secondary">
            Brak powiązanych zadań produkcyjnych
          </Typography>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nr MO</TableCell>
                <TableCell>Nazwa zadania</TableCell>
                <TableCell>Produkt</TableCell>
                <TableCell>Ilość</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Numer partii</TableCell>
                <TableCell align="right">Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {order.productionTasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell>{task.moNumber}</TableCell>
                  <TableCell>{task.name}</TableCell>
                  <TableCell>{task.productName}</TableCell>
                  <TableCell>{task.quantity} {task.unit}</TableCell>
                  <TableCell>
                    <Chip 
                      label={task.status} 
                      color={getProductionStatusColor(task.status)}
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    {task.lotNumber ? (
                      <Tooltip title="Numer partii produkcyjnej">
                        <Chip
                          label={task.lotNumber}
                          color="success"
                          size="small"
                          variant="outlined"
                        />
                      </Tooltip>
                    ) : task.status === 'Zakończone' ? (
                      <Chip
                        label="Brak numeru LOT"
                        color="warning"
                        size="small"
                        variant="outlined"
                      />
                    ) : null}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      component={RouterLink}
                      to={`/production/tasks/${task.id}`}
                      variant="outlined"
                    >
                      Szczegóły
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* Dialog wyboru zamówienia zakupowego */}
      <Dialog open={openPurchaseOrderDialog} onClose={handleClosePurchaseOrderDialog} maxWidth="md" fullWidth>
        <DialogTitle>Przypisz zamówienie zakupowe</DialogTitle>
        <DialogContent>
          {loadingPurchaseOrders ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : availablePurchaseOrders.length > 0 ? (
            <Box sx={{ mt: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Wybierz zamówienie zakupowe</InputLabel>
                <Select
                  value={selectedPurchaseOrderId}
                  onChange={handlePurchaseOrderSelection}
                  label="Wybierz zamówienie zakupowe"
                >
                  {availablePurchaseOrders.map(po => (
                    <MenuItem key={po.id} value={po.id}>
                      {po.number} - {po.supplier?.name || 'Nieznany dostawca'} - Wartość: {po.totalGross} {po.currency || 'EUR'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          ) : (
            <Typography variant="body1" sx={{ mt: 2 }}>
              Brak dostępnych zamówień zakupowych, które można przypisać.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClosePurchaseOrderDialog}>Anuluj</Button>
          <Button 
            onClick={handleAssignSelected} 
            variant="contained" 
            disabled={!selectedPurchaseOrderId || loadingPurchaseOrders}
          >
            Przypisz
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OrderDetails; 