import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert
} from '@mui/material';
import { formatCurrency } from '../../../utils/formatUtils';

/**
 * Komponent wyświetlający tabelę zamówień klientów na raporcie
 */
const COReportComponent = ({ orders, loading, title }) => {
  // Formatowanie wyświetlanych dat
  const formatDate = (dateObj) => {
    if (!dateObj) return 'Brak daty';
    
    const date = dateObj instanceof Date 
      ? dateObj 
      : dateObj.toDate 
        ? dateObj.toDate() 
        : new Date(dateObj);
        
    return date.toLocaleDateString('pl-PL');
  };
  
  // Określa kolor chipa na podstawie statusu zamówienia
  const getStatusColor = (status) => {
    switch (status) {
      case 'Zrealizowane':
        return '#4caf50'; // oryginalny zielony
      case 'Dostarczone':
        return '#4caf50'; // oryginalny zielony
      case 'Nowe':
        return '#1976d2'; // oryginalny niebieski
      case 'W realizacji':
        return '#2196f3'; // oryginalny jasnoniebieski
      case 'Gotowe do wysyłki':
        return '#ff9800'; // oryginalny pomarańczowy
      case 'Wysłane':
        return '#9c27b0'; // oryginalny fioletowy
      case 'Anulowane':
        return '#f44336'; // oryginalny czerwony
      default:
        return '#757575'; // oryginalny szary
    }
  };
  
  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        {title || 'Zamówienia klientów'}
      </Typography>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      ) : orders.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          Brak zamówień spełniających kryteria
        </Alert>
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nr zamówienia</TableCell>
                <TableCell>Data</TableCell>
                <TableCell>Klient</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Wartość</TableCell>
                <TableCell align="right">Przewidywana dostawa</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{order.orderNumber || 'Brak numeru'}</TableCell>
                  <TableCell>{formatDate(order.orderDate)}</TableCell>
                  <TableCell>{order.customer?.name || 'Brak danych klienta'}</TableCell>
                  <TableCell>
                    <Chip 
                      label={order.status || 'Nieznany'} 
                      size="small"
                      sx={{
                        backgroundColor: getStatusColor(order.status),
                        color: 'white'
                      }}
                    />
                  </TableCell>
                  <TableCell align="right">{formatCurrency(order.totalValue || 0)}</TableCell>
                  <TableCell align="right">{formatDate(order.expectedDeliveryDate)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
};

export default COReportComponent; 