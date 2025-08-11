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
import { useTranslation } from '../../../hooks/useTranslation';

/**
 * Komponent wyświetlający statystyki zamówień według statusu
 */
const StatusStatsComponent = ({ statusStats, totalValue, loading, title }) => {
  const { t } = useTranslation();
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
        {title || t('coReports.statusStats.title')}
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
                <TableCell>{t('coReports.table.status')}</TableCell>
                <TableCell align="right">{t('coReports.table.ordersCount')}</TableCell>
                <TableCell align="right">{t('coReports.table.ordersValue')}</TableCell>
                <TableCell align="right">{t('coReports.table.percentOfTotal')}</TableCell>
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