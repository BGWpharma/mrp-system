import React from 'react';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useTheme } from '../../../contexts/ThemeContext';
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
  Tooltip, 
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
const ProductionChart = ({ title, data, chartType = 'bar', sx }) => {
  const muiTheme = useMuiTheme();
  const { mode } = useTheme();
  
  // Jeśli brak danych, wyświetl informację
  if (!data || data.length === 0) {
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
  
  // Filtrujemy nieprawidłowe dane
  const validData = data.filter(item => 
    item && 
    typeof item.efficiency === 'number' && 
    !isNaN(item.efficiency)
  );
  
  // Jeśli brak prawidłowych danych
  if (validData.length === 0) {
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
          Nieprawidłowe dane produkcyjne
        </Typography>
      </Box>
    );
  }
  
  // Formatowanie daty dla etykiety
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    
    try {
      const date = new Date(dateStr);
      
      if (isNaN(date.getTime())) {
        // Jeśli to nie jest poprawna data, zwróć oryginalny string
        return dateStr;
      }
      
      return new Intl.DateTimeFormat('pl-PL', { 
        month: 'short', 
        day: 'numeric' 
      }).format(date);
    } catch (error) {
      return dateStr;
    }
  };

  return (
    <Box sx={{ ...sx, height: '100%', width: '100%' }}>
      {title && (
        <Typography variant="h6" sx={{ mb: 2 }}>
          {title}
        </Typography>
      )}
      
      <Typography variant="body2" sx={{ mb: 1 }}>
        Brak danych produkcyjnych do wyświetlenia
      </Typography>
      
      <Box sx={{ height: 'calc(100% - 60px)' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={validData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              tick={{ fill: muiTheme.palette.text.secondary, fontSize: 12 }}
              axisLine={{ stroke: muiTheme.palette.divider }}
              tickLine={{ stroke: muiTheme.palette.divider }}
            />
            <YAxis 
              tickFormatter={(value) => `${value}%`}
              tick={{ fill: muiTheme.palette.text.secondary, fontSize: 12 }}
              axisLine={{ stroke: muiTheme.palette.divider }}
              tickLine={{ stroke: muiTheme.palette.divider }}
            />
            <Tooltip 
              formatter={(value) => `${value}%`}
              labelFormatter={(label) => {
                const item = validData.find(d => d.date === label);
                return item ? `Data: ${formatDate(label)}` : label;
              }}
            />
            <Bar 
              dataKey="efficiency" 
              fill={muiTheme.palette.primary.main} 
              radius={[4, 4, 0, 0]} 
            />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};

export default ProductionChart; 