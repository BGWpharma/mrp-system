import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Container, Paper, Box, Typography, Button, CircularProgress } from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { getOrderById } from '../../services/orderService';
import ShippingLabel from '../../components/orders/ShippingLabel';
import { useNotification } from '../../hooks/useNotification';

const ShippingLabelPage = () => {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { showError } = useNotification();
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const labelRef = useRef(null);

  // Pobierz dane zamówienia
  useEffect(() => {
    const fetchOrderData = async () => {
      try {
        setLoading(true);
        // Pobierz dane zamówienia z API
        const orderData = await getOrderById(orderId);
        setOrder(orderData);

        // Sprawdź, czy w location.state jest wybrany produkt
        if (location.state?.item) {
          setSelectedItem(location.state.item);
        }
      } catch (error) {
        console.error('Błąd podczas pobierania danych zamówienia:', error);
        showError('Nie udało się pobrać danych zamówienia. Sprawdź połączenie i spróbuj ponownie.');
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchOrderData();
    }
  }, [orderId, location.state, showError]);

  const handleBack = () => {
    // Sprawdź, czy mamy określoną stronę powrotu
    const returnPath = location.state?.returnTo || `/orders/${orderId}`;
    navigate(returnPath);
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }

  if (!order) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" color="error" gutterBottom>
            Nie znaleziono zamówienia
          </Typography>
          <Button
            startIcon={<ArrowBackIcon />}
            variant="contained"
            onClick={() => navigate('/orders')}
          >
            Powrót do listy zamówień
          </Button>
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Button
            startIcon={<ArrowBackIcon />}
            variant="outlined"
            onClick={handleBack}
          >
            Powrót
          </Button>
          <Typography variant="h5">
            Etykieta wysyłkowa - Zamówienie {order.orderNumber || order.id?.substring(0, 8).toUpperCase()}
          </Typography>
          <Box sx={{ width: 100 }} /> {/* Pusty element dla wyrównania */}
        </Box>

        {selectedItem && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body1">
              Wybrano produkt: <strong>{selectedItem.name}</strong>
            </Typography>
          </Box>
        )}

        {/* Komponent etykiety z przekazaną referencją */}
        <ShippingLabel 
          ref={labelRef}
          order={order} 
          item={selectedItem} 
          onClose={handleBack} 
        />
      </Paper>
    </Container>
  );
};

export default ShippingLabelPage; 