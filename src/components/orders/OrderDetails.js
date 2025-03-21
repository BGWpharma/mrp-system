import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
  Input
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
  Engineering as EngineeringIcon
} from '@mui/icons-material';
import { getOrderById, ORDER_STATUSES, updateOrder } from '../../services/orderService';
import { useNotification } from '../../hooks/useNotification';
import { formatCurrency } from '../../utils/formatUtils';
import { formatTimestamp, formatDate } from '../../utils/dateUtils';
import { storage } from '../../services/firebase/config';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

const OrderDetails = () => {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const { showError, showSuccess } = useNotification();
  const navigate = useNavigate();
  const fileInputRef = React.useRef(null);

  useEffect(() => {
    const fetchOrderDetails = async () => {
      try {
        setLoading(true);
        const orderData = await getOrderById(orderId);
        setOrder(orderData);
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
  }, [orderId, showError]);

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
      await updateOrder(orderId, { ...order, deliveryProof: downloadURL }, order.createdBy);
      
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
      await updateOrder(orderId, { ...order, deliveryProof: null }, order.createdBy);
      
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
          Zamówienie {order.orderNumber || `#${order.id.substring(0, 8).toUpperCase()}`}
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
              Data zamówienia: {formatTimestamp(order.orderDate)}
            </Typography>
            {order.expectedDeliveryDate && (
              <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <ScheduleIcon sx={{ mr: 1 }} fontSize="small" />
                Oczekiwana dostawa: {formatTimestamp(order.expectedDeliveryDate)}
              </Typography>
            )}
            {order.deliveryDate && (
              <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center' }}>
                <LocalShippingIcon sx={{ mr: 1 }} fontSize="small" />
                Dostarczone: {formatTimestamp(order.deliveryDate)}
              </Typography>
            )}
          </Grid>
          <Grid item xs={12} sm={6}>
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', flexDirection: 'column', height: '100%' }}>
              <Typography variant="h6" align="right">
                Łączna wartość:
              </Typography>
              <Typography variant="h4" align="right" color="primary.main" sx={{ fontWeight: 'bold' }}>
                {formatCurrency(order.totalValue || 0)}
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
            <TableRow>
              <TableCell colSpan={2} />
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                Razem:
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
                {formatCurrency(order.totalValue || 0)}
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
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Uwagi</Typography>
          <Divider sx={{ mb: 2 }} />
          <Typography variant="body1">
            {order.notes}
          </Typography>
        </Paper>
      )}

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Zadania produkcyjne
        </Typography>
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
                      color={getStatusChipColor(task.status)}
                      size="small"
                      icon={<EngineeringIcon />}
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => navigate(`/production/tasks/${task.id}`)}
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
    </Box>
  );
};

export default OrderDetails; 