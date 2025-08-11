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
import { useTranslation } from '../../../hooks/useTranslation';

/**
 * Komponent wyświetlający statystyki zamówień według klientów
 */
const CustomerStatsComponent = ({ customerStats, loading, title }) => {
  const { t } = useTranslation();
  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        {title || t('coReports.customerStats.title')}
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
                <TableCell>{t('coReports.table.customer')}</TableCell>
                <TableCell align="right">{t('coReports.table.ordersCount')}</TableCell>
                <TableCell align="right">{t('coReports.table.ordersValue')}</TableCell>
                <TableCell align="right">{t('coReports.table.avgValue')}</TableCell>
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