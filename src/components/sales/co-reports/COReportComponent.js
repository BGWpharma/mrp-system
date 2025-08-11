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
import { useTranslation } from '../../../hooks/useTranslation';

/**
 * Komponent wyświetlający tabelę zamówień klientów na raporcie
 */
const COReportComponent = ({ orders, loading, title }) => {
  const { t, currentLanguage, formatDate: formatDateLocalized } = useTranslation();
  // Formatowanie wyświetlanych dat
  const formatDate = (dateObj) => {
    if (!dateObj) return t('common.noDate');
    
    const date = dateObj instanceof Date 
      ? dateObj 
      : dateObj.toDate 
        ? dateObj.toDate() 
        : new Date(dateObj);
        
    return date.toLocaleDateString(currentLanguage === 'pl' ? 'pl-PL' : 'en-US');
  };
  
  // Określa kolor chipa na podstawie statusu zamówienia
  const getStatusColor = (status) => {
    switch (status) {
      case 'Zakończone':
        return '#4caf50'; // oryginalny zielony
      case 'Nowe':
        return '#1976d2'; // oryginalny niebieski
      case 'W realizacji':
        return '#2196f3'; // oryginalny jasnoniebieski
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
          {t('coReports.ordersList.empty')}
        </Alert>
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('coReports.table.orderNumber')}</TableCell>
                <TableCell>{t('coReports.table.date')}</TableCell>
                <TableCell>{t('coReports.table.customer')}</TableCell>
                <TableCell>{t('coReports.table.status')}</TableCell>
                <TableCell align="right">{t('coReports.table.value')}</TableCell>
                <TableCell align="right">{t('coReports.table.expectedDelivery')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>{order.orderNumber || t('coReports.common.noNumber')}</TableCell>
                  <TableCell>{formatDate(order.orderDate)}</TableCell>
                  <TableCell>{order.customer?.name || t('coReports.common.noCustomerData')}</TableCell>
                  <TableCell>
                    <Chip 
                      label={order.status || t('common.status')} 
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