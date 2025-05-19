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
        return 'success';
      case 'Nowe':
        return 'info';
      case 'W realizacji':
        return 'warning';
      case 'Anulowane':
        return 'error';
      default:
        return 'default';
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
                      color={getStatusColor(order.status)} 
                      size="small" 
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