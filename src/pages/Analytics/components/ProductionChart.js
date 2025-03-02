import React from 'react';
import { useTheme } from '@mui/material/styles';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  CardHeader, 
  Divider 
} from '@mui/material';
import { 
  BarChart, 
  Bar, 
  LineChart,
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend, 
  ResponsiveContainer,
  ComposedChart,
  Area
} from 'recharts';
import { formatCurrency, formatPercent } from '../../../utils/formatUtils';

/**
 * Komponent wykresu produkcyjnego
 * 
 * @param {Object} props Właściwości komponentu
 * @param {string} props.title Tytuł wykresu
 * @param {Array} props.data Dane do wykresu
 * @param {string} props.chartType Typ wykresu (bar, line, composed)
 * @param {Object} props.sx Dodatkowe style
 */
const ProductionChart = ({ title, data, sx }) => {
  const theme = useTheme();
  
  // Jeśli brak danych, wyświetl informację
  if (!data || !data.efficiency || !data.targets || data.efficiency.length === 0) {
    return (
      <Box 
        sx={{ 
          ...sx, 
          height: '100%', 
          width: '100%', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          flexDirection: 'column'
        }}
      >
        <Typography variant="body2" color="textSecondary">
          Brak danych produkcyjnych do wyświetlenia
        </Typography>
      </Box>
    );
  }
  
  // Przygotowanie danych do wykresu
  const { efficiency, targets } = data;
  
  // Łączenie danych efektywności i celów
  const chartData = efficiency.map((item, index) => ({
    name: item.name,
    efficiency: item.value,
    target: targets[index] ? targets[index].value : 85,
  }));
  
  // Średnia efektywność
  const avgEfficiency = efficiency.reduce((sum, item) => sum + item.value, 0) / efficiency.length;
  const formattedAvgEfficiency = formatPercent(avgEfficiency / 100);
  
  // Tooltip dla wykresu
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <Box
          sx={{
            backgroundColor: 'background.paper',
            p: 1.5,
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 1,
            boxShadow: theme.shadows[2]
          }}
        >
          <Typography variant="body2" fontWeight="bold">
            {label}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="textSecondary">
              Efektywność: <span style={{ fontWeight: 'bold', color: theme.palette.primary.main }}>
                {formatPercent(payload[0].value / 100)}
              </span>
            </Typography>
            {payload[1] && (
              <Typography variant="body2" color="textSecondary">
                Cel: <span style={{ fontWeight: 'bold', color: theme.palette.warning.main }}>
                  {formatPercent(payload[1].value / 100)}
                </span>
              </Typography>
            )}
          </Box>
        </Box>
      );
    }
    return null;
  };

  // Funkcja dla formatowania osi Y
  const formatYAxis = (value) => {
    return `${value}%`;
  };

  return (
    <Box 
      sx={{ 
        width: '100%', 
        height: '100%', 
        display: 'flex', 
        flexDirection: 'column',
        ...sx 
      }}
    >
      <Box sx={{ mb: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <Typography variant="body2" color="textSecondary">
          Średnia efektywność
        </Typography>
        <Typography variant="h6" color="primary" fontWeight="bold">
          {formattedAvgEfficiency}
        </Typography>
      </Box>
      
      <Box sx={{ flexGrow: 1, width: '100%', height: '100%', minHeight: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 20, right: 30, left: 20, bottom: 30 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis 
              dataKey="name" 
              tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
              axisLine={{ stroke: theme.palette.divider }}
              tickLine={{ stroke: theme.palette.divider }}
            />
            <YAxis 
              tickFormatter={formatYAxis}
              domain={[0, 100]}
              tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
              axisLine={{ stroke: theme.palette.divider }}
              tickLine={{ stroke: theme.palette.divider }}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <Legend 
              iconType="circle" 
              wrapperStyle={{ 
                paddingTop: 10,
                fontSize: 12
              }} 
            />
            <Bar 
              dataKey="efficiency" 
              name="Efektywność" 
              barSize={20} 
              radius={[4, 4, 0, 0]} 
              fill={theme.palette.primary.main}
            />
            <Line 
              type="monotone" 
              dataKey="target" 
              name="Cel" 
              stroke={theme.palette.warning.main}
              strokeWidth={2}
              dot={{ fill: theme.palette.warning.main, r: 4 }}
              activeDot={{ r: 6 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};

export default ProductionChart; 