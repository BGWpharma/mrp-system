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
  AreaChart,
  Area,
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
    paid: item.cumulativePaid,
    expected: item.cumulativeExpected,
    dailyPaid: item.dailyPaid,
    dailyExpected: item.dailyExpected
  }));

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <Paper 
          sx={{ 
            p: 2, 
            border: `1px solid ${theme.palette.divider}`,
            boxShadow: 3
          }}
        >
          <Typography variant="subtitle2" gutterBottom>
            {payload[0]?.payload?.fullDate}
          </Typography>
          {payload.map((entry, index) => (
            <Box key={index} sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
              <Box
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  bgcolor: entry.color
                }}
              />
              <Typography variant="body2" color="text.secondary">
                {entry.name}:
              </Typography>
              <Typography variant="body2" fontWeight="bold">
                {formatCurrency(entry.value, currency)}
              </Typography>
            </Box>
          ))}
          {payload[0]?.payload?.dailyPaid > 0 && (
            <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
              Dzienna wpłata: {formatCurrency(payload[0].payload.dailyPaid, currency)}
            </Typography>
          )}
          {payload[0]?.payload?.dailyExpected > 0 && (
            <Typography variant="caption" display="block" color="text.secondary">
              Dzienna oczekiwana: {formatCurrency(payload[0].payload.dailyExpected, currency)}
            </Typography>
          )}
        </Paper>
      );
    }
    return null;
  };

  return (
    <Paper sx={{ p: 3, mb: 3 }}>
      <Typography variant="h6" gutterBottom>
        {t('cashflow.chart.title')}
      </Typography>
      <Box sx={{ width: '100%', height: 400, mt: 2 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={formattedData}
            margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorPaid" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={theme.palette.success.main} stopOpacity={0.8}/>
                <stop offset="95%" stopColor={theme.palette.success.main} stopOpacity={0.1}/>
              </linearGradient>
              <linearGradient id="colorExpected" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={theme.palette.warning.main} stopOpacity={0.8}/>
                <stop offset="95%" stopColor={theme.palette.warning.main} stopOpacity={0.1}/>
              </linearGradient>
            </defs>
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
              wrapperStyle={{ paddingTop: '20px' }}
              formatter={(value) => {
                if (value === 'paid') return t('cashflow.chart.cumulativePaid');
                if (value === 'expected') return t('cashflow.chart.cumulativeExpected');
                return value;
              }}
            />
            <Area
              type="monotone"
              dataKey="paid"
              stroke={theme.palette.success.main}
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorPaid)"
              name="paid"
            />
            <Area
              type="monotone"
              dataKey="expected"
              stroke={theme.palette.warning.main}
              strokeWidth={2}
              strokeDasharray="5 5"
              fillOpacity={1}
              fill="url(#colorExpected)"
              name="expected"
            />
          </AreaChart>
        </ResponsiveContainer>
      </Box>
      <Box sx={{ mt: 2, display: 'flex', gap: 3, justifyContent: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ width: 20, height: 3, bgcolor: 'success.main' }} />
          <Typography variant="caption" color="text.secondary">
            {t('cashflow.chart.cumulativePaid')}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box 
            sx={{ 
              width: 20, 
              height: 3, 
              bgcolor: 'warning.main',
              backgroundImage: 'repeating-linear-gradient(90deg, transparent, transparent 5px, white 5px, white 7px)'
            }} 
          />
          <Typography variant="caption" color="text.secondary">
            {t('cashflow.chart.cumulativeExpected')}
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
};

export default CashflowChart;

