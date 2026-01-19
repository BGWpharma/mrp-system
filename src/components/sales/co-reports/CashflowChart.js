// src/components/sales/co-reports/CashflowChart.js
import React from 'react';
import {
  Box,
  Paper,
  Typography,
  useTheme
} from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { formatCurrency } from '../../../utils/formatUtils';
import { useTranslation } from '../../../hooks/useTranslation';

/**
 * Komponent wyświetlający wykres cashflow w czasie
 * ROZSZERZONY O WYDATKI
 */
const CashflowChart = ({ chartData, currency = 'EUR' }) => {
  const theme = useTheme();
  const { t } = useTranslation('cashflow');

  if (!chartData || chartData.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {t('cashflow.noData')}
        </Typography>
      </Paper>
    );
  }

  // Formatuj dane dla wykresu
  const formattedData = chartData.map(item => ({
    date: new Date(item.date).toLocaleDateString('pl-PL', { 
      month: 'short', 
      day: 'numeric' 
    }),
    fullDate: new Date(item.date).toLocaleDateString('pl-PL'),
    // Przychody
    revenuePaid: item.cumulativeRevenuePaid || 0,
    revenueTotal: item.cumulativeRevenueTotal || 0,
    // Wydatki (PO + operacyjne łącznie)
    expensePaid: item.cumulativeExpensePaid || 0,
    expenseTotal: item.cumulativeExpenseTotal || 0,
    // Koszty operacyjne (osobna linia)
    operationalPaid: item.cumulativeOperationalPaid || 0,
    operationalTotal: item.cumulativeOperationalTotal || 0,
    // Netto
    netPaid: item.netPaid || 0,
    netTotal: item.netTotal || 0,
    // Dzienne
    dailyRevenue: item.dailyRevenue || 0,
    dailyExpense: item.dailyExpense || 0,
    dailyOperational: item.dailyOperational || 0
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      return (
        <Paper 
          sx={{ 
            p: 2, 
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: 3
          }}
        >
          <Typography variant="subtitle2" gutterBottom fontWeight="bold">
            {data?.fullDate}
          </Typography>
          
          <Typography variant="caption" display="block" sx={{ mt: 1, mb: 0.5, fontWeight: 'bold' }}>
            Przychody:
          </Typography>
          {payload.filter(p => p.dataKey.includes('revenue')).map((entry, index) => (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: entry.color }} />
              <Typography variant="body2" color="text.secondary" fontSize="0.75rem">
                {entry.name}:
              </Typography>
              <Typography variant="body2" fontWeight="bold" fontSize="0.75rem">
                {formatCurrency(entry.value, currency)}
              </Typography>
            </Box>
          ))}
          
          <Typography variant="caption" display="block" sx={{ mt: 1, mb: 0.5, fontWeight: 'bold' }}>
            Wydatki (łącznie):
          </Typography>
          {payload.filter(p => p.dataKey.includes('expense') && !p.dataKey.includes('operational')).map((entry, index) => (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: entry.color }} />
              <Typography variant="body2" color="text.secondary" fontSize="0.75rem">
                {entry.name}:
              </Typography>
              <Typography variant="body2" fontWeight="bold" fontSize="0.75rem">
                {formatCurrency(entry.value, currency)}
              </Typography>
            </Box>
          ))}
          
          <Typography variant="caption" display="block" sx={{ mt: 1, mb: 0.5, fontWeight: 'bold' }}>
            Koszty operacyjne:
          </Typography>
          {payload.filter(p => p.dataKey.includes('operational')).map((entry, index) => (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: entry.color }} />
              <Typography variant="body2" color="text.secondary" fontSize="0.75rem">
                {entry.name}:
              </Typography>
              <Typography variant="body2" fontWeight="bold" fontSize="0.75rem">
                {formatCurrency(entry.value, currency)}
              </Typography>
            </Box>
          ))}
          
          <Typography variant="caption" display="block" sx={{ mt: 1, mb: 0.5, fontWeight: 'bold' }}>
            Cashflow netto:
          </Typography>
          {payload.filter(p => p.dataKey.includes('net')).map((entry, index) => (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: entry.color }} />
              <Typography variant="body2" color="text.secondary" fontSize="0.75rem">
                {entry.name}:
              </Typography>
              <Typography variant="body2" fontWeight="bold" fontSize="0.75rem">
                {formatCurrency(entry.value, currency)}
              </Typography>
            </Box>
          ))}
        </Paper>
      );
    }
    return null;
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        {t('cashflow.chart.title')} - Przychody vs Wydatki
      </Typography>
      <Box sx={{ width: '100%', height: 400, mt: 2 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={formattedData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={theme.palette.divider} />
            <XAxis 
              dataKey="date" 
              stroke={theme.palette.text.secondary}
              style={{ fontSize: '0.75rem' }}
            />
            <YAxis 
              stroke={theme.palette.text.secondary}
              style={{ fontSize: '0.75rem' }}
              tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              wrapperStyle={{ paddingTop: '20px', fontSize: '0.75rem' }}
            />
            
            {/* Przychody - zapłacone */}
            <Line
              type="monotone"
              dataKey="revenuePaid"
              stroke={theme.palette.success.main}
              strokeWidth={3}
              name="Przychód (zapłacone)"
              dot={false}
            />
            
            {/* Przychody - z oczekiwanymi */}
            <Line
              type="monotone"
              dataKey="revenueTotal"
              stroke={theme.palette.success.light}
              strokeWidth={2}
              strokeDasharray="5 5"
              name="Przychód (z oczekiwanymi)"
              dot={false}
            />
            
            {/* Wydatki - zapłacone */}
            <Line
              type="monotone"
              dataKey="expensePaid"
              stroke={theme.palette.error.main}
              strokeWidth={3}
              name="Wydatki (zapłacone)"
              dot={false}
            />
            
            {/* Wydatki - z oczekiwanymi */}
            <Line
              type="monotone"
              dataKey="expenseTotal"
              stroke={theme.palette.error.light}
              strokeWidth={2}
              strokeDasharray="5 5"
              name="Wydatki (z oczekiwanymi)"
              dot={false}
            />
            
            {/* Koszty operacyjne - zapłacone */}
            <Line
              type="monotone"
              dataKey="operationalPaid"
              stroke={theme.palette.warning.main}
              strokeWidth={2}
              name="Koszty op. (zapłacone)"
              dot={false}
            />
            
            {/* Koszty operacyjne - z oczekiwanymi */}
            <Line
              type="monotone"
              dataKey="operationalTotal"
              stroke={theme.palette.warning.light}
              strokeWidth={1}
              strokeDasharray="5 5"
              name="Koszty op. (z oczekiwanymi)"
              dot={false}
            />
            
            {/* Cashflow netto - zapłacone */}
            <Line
              type="monotone"
              dataKey="netPaid"
              stroke={theme.palette.primary.main}
              strokeWidth={3}
              name="Cashflow netto (zapłacone)"
              dot={false}
            />
            
            {/* Cashflow netto - z oczekiwanymi */}
            <Line
              type="monotone"
              dataKey="netTotal"
              stroke={theme.palette.primary.light}
              strokeWidth={2}
              strokeDasharray="5 5"
              name="Cashflow netto (z oczekiwanymi)"
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>
      
      {/* Legenda */}
      <Box sx={{ mt: 2, display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 20, height: 3, bgcolor: 'success.main' }} />
          <Typography variant="caption" color="text.secondary">Przychód zapłacony</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 20, height: 3, bgcolor: 'error.main' }} />
          <Typography variant="caption" color="text.secondary">Wydatki (PO + op.)</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 20, height: 3, bgcolor: 'warning.main' }} />
          <Typography variant="caption" color="text.secondary">Koszty operacyjne</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 20, height: 3, bgcolor: 'primary.main' }} />
          <Typography variant="caption" color="text.secondary">Cashflow netto</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ 
            width: 20, 
            height: 3, 
            bgcolor: 'text.secondary',
            backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 3px, white 3px, white 5px)'
          }} />
          <Typography variant="caption" color="text.secondary">Z oczekiwanymi</Typography>
        </Box>
      </Box>
    </Paper>
  );
};

export default CashflowChart;
