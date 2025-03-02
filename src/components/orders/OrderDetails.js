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
  Stack
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
  Phone as PhoneIcon
} from '@mui/icons-material';
import { getOrderById, ORDER_STATUSES } from '../../services/orderService';
import { useNotification } from '../../hooks/useNotification';
import { formatCurrency } from '../../utils/formatUtils';
import { formatTimestamp, formatDate } from '../../utils/dateUtils';

const OrderDetails = () => {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showError } = useNotification();
  const navigate = useNavigate();

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
      window.location.href = `mailto:${emailAddress}?subject=Zamówienie ${order.id.substring(0, 8).toUpperCase()}`;
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
          Zamówienie #{order.id.substring(0, 8).toUpperCase()}
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
              Adres: {order.customer?.address || '-'}
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
    </Box>
  );
};

export default OrderDetails; 