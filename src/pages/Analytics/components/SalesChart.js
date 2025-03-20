import React from 'react';
import { 
  Box, 
  Typography, 
  useTheme 
} from '@mui/material';
import { 
  AreaChart, 
  Area, 
  BarChart,
  Bar,
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

/**
 * Komponent wykresu sprzedaży, pokazujący trendy w formie wybranego typu wykresu
 * @param {Object} props - właściwości komponentu
 * @param {string} props.title - tytuł wykresu
 * @param {Array} props.data - dane sprzedażowe do wyświetlenia
 * @param {string} props.chartType - typ wykresu (bar, line, area)
 * @param {Object} props.sx - stylizacja komponentu
 * @returns {JSX.Element}
 */
const SalesChart = ({ title, data, chartType = 'line', sx }) => {
  const theme = useTheme();
  
  // Kolory dla wykresu
  const barColors = [
    theme.palette.primary.main,
    theme.palette.primary.light
  ];
  
  const lineColor = theme.palette.primary.main;
  const areaColor = theme.palette.primary.main;
  
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
          Brak danych sprzedażowych do wyświetlenia
        </Typography>
      </Box>
    );
  }
  
  // Filtrujemy nieprawidłowe dane
  const validData = data.filter(item => 
    item && 
    item.date && 
    typeof item.value === 'number' && 
    !isNaN(item.value)
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
          Nieprawidłowe dane sprzedażowe
        </Typography>
      </Box>
    );
  }
  
  // Obliczanie maksymalnej i minimalnej wartości dla skali wykresu
  const dataValues = validData.map(item => item.value);
  const maxValue = Math.max(...dataValues) * 1.1; // 10% marginesu na górze
  const minValue = Math.min(0, ...dataValues); // Nie dopuszczaj do negatywnych wartości chyba że takie istnieją
  
  // Obliczanie średniej wartości
  const avgValue = dataValues.reduce((sum, val) => sum + val, 0) / dataValues.length;
  
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

  // Renderowanie odpowiedniego wykresu w zależności od typu
  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={validData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatDate}
                tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                axisLine={{ stroke: theme.palette.divider }}
                tickLine={{ stroke: theme.palette.divider }}
              />
              <YAxis 
                domain={[minValue, maxValue]}
                tickFormatter={(value) => formatCurrency(value, { compact: true })}
                tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                axisLine={{ stroke: theme.palette.divider }}
                tickLine={{ stroke: theme.palette.divider }}
              />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                labelFormatter={(label) => {
                  const item = validData.find(d => d.date === label);
                  return item ? `Data: ${formatDate(label)}` : label;
                }}
              />
              <Bar dataKey="value" fill={barColors[0]} radius={[4, 4, 0, 0]} />
              <Tooltip formatter={(value) => formatCurrency(value)} />
            </BarChart>
          </ResponsiveContainer>
        );
        
      case 'area':
        return (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={validData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatDate}
                tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                axisLine={{ stroke: theme.palette.divider }}
                tickLine={{ stroke: theme.palette.divider }}
              />
              <YAxis 
                domain={[minValue, maxValue]}
                tickFormatter={(value) => formatCurrency(value, { compact: true })}
                tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                axisLine={{ stroke: theme.palette.divider }}
                tickLine={{ stroke: theme.palette.divider }}
              />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                labelFormatter={(label) => {
                  const item = validData.find(d => d.date === label);
                  return item ? `Data: ${formatDate(label)}` : label;
                }}
              />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={areaColor} 
                fillOpacity={0.3}
                fill={areaColor} 
              />
              <Tooltip formatter={(value) => formatCurrency(value)} />
            </AreaChart>
          </ResponsiveContainer>
        );
        
      case 'line':
      default:
        return (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={validData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis 
                dataKey="date" 
                tickFormatter={formatDate}
                tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                axisLine={{ stroke: theme.palette.divider }}
                tickLine={{ stroke: theme.palette.divider }}
              />
              <YAxis 
                domain={[minValue, maxValue]}
                tickFormatter={(value) => formatCurrency(value, { compact: true })}
                tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
                axisLine={{ stroke: theme.palette.divider }}
                tickLine={{ stroke: theme.palette.divider }}
              />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                labelFormatter={(label) => {
                  const item = validData.find(d => d.date === label);
                  return item ? `Data: ${formatDate(label)}` : label;
                }}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke={lineColor} 
                strokeWidth={2}
                dot={{ fill: lineColor, r: 4 }}
                activeDot={{ fill: lineColor, r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        );
    }
  };

  return (
    <Box sx={{ ...sx, height: '100%', width: '100%' }}>
      {title && (
        <Typography variant="h6" sx={{ mb: 2 }}>
          {title}
        </Typography>
      )}
      
      <Box sx={{ mb: 1 }}>
        <Typography variant="body2" sx={{ mb: 0.5 }}>
          Wartość {isNaN(avgValue) ? "0,00 zł" : formatCurrency(avgValue)}
        </Typography>
      </Box>
      
      <Box sx={{ height: 'calc(100% - 60px)' }}>
        {renderChart()}
      </Box>
    </Box>
  );
};

export default SalesChart; 