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
  CircularProgress,
  Divider
} from '@mui/material';
import { formatCurrency } from '../../../utils/formatUtils';

/**
 * Komponent wyświetlający statystyki zamówień według klientów
 */
const CustomerStatsComponent = ({ customerStats, loading, title }) => {
  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        {title || 'Statystyki według klientów'}
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
                <TableCell>Klient</TableCell>
                <TableCell align="right">Liczba zamówień</TableCell>
                <TableCell align="right">Wartość zamówień</TableCell>
                <TableCell align="right">Średnia wartość</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.keys(customerStats).map((customerId) => {
                const customerStat = customerStats[customerId];
                const avgValue = customerStat.count > 0 
                  ? customerStat.totalValue / customerStat.count 
                  : 0;
                
                return (
                  <TableRow key={customerId}>
                    <TableCell>{customerStat.name}</TableCell>
                    <TableCell align="right">{customerStat.count}</TableCell>
                    <TableCell align="right">{formatCurrency(customerStat.totalValue)}</TableCell>
                    <TableCell align="right">{formatCurrency(avgValue)}</TableCell>
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

export default CustomerStatsComponent; 