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
  Divider
} from '@mui/material';
import { formatCurrency } from '../../../utils/formatUtils';

/**
 * Komponent wyświetlający statystyki zamówień według statusu
 */
const StatusStatsComponent = ({ statusStats, totalValue, loading, title }) => {
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
        {title || 'Statystyki według statusu'}
      </Typography>
      <Divider sx={{ mb: 2 }} />
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Status</TableCell>
                <TableCell align="right">Liczba zamówień</TableCell>
                <TableCell align="right">Wartość zamówień</TableCell>
                <TableCell align="right">% całości</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.keys(statusStats).map((status) => {
                const statusStat = statusStats[status];
                const percentage = totalValue > 0 
                  ? (statusStat.totalValue / totalValue * 100).toFixed(2)
                  : 0;
                
                return (
                  <TableRow key={status}>
                    <TableCell>
                      <Chip 
                        label={status} 
                        size="small"
                        sx={{
                          backgroundColor: getStatusColor(status),
                          color: 'white'
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">{statusStat.count}</TableCell>
                    <TableCell align="right">{formatCurrency(statusStat.totalValue)}</TableCell>
                    <TableCell align="right">{percentage}%</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
};

export default StatusStatsComponent; 