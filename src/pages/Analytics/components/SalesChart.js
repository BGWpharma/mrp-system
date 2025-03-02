import React from 'react';
import { 
  Typography, 
  Box, 
  useTheme,
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
  ReferenceLine,
  Label,
  Cell,
  AreaChart,
  Area
} from 'recharts';
import { formatCurrency, formatPercent } from '../../../utils/formatUtils';

/**
 * Formatuje wartości na osi Y dla lepszej czytelności
 * @param {number} value - wartość do sformatowania
 * @returns {string} sformatowana wartość (K dla tysięcy, M dla milionów)
 */
const formatYAxis = (value) => {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}k`;
  }
  return value;
};

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
  
  // Obliczanie maksymalnej i minimalnej wartości dla skali wykresu
  const dataValues = data.map(item => item.value);
  const maxValue = Math.max(...dataValues) * 1.1; // 10% marginesu na górze
  const minValue = Math.min(0, ...dataValues); // Nie dopuszczaj do negatywnych wartości chyba że takie istnieją
  
  // Obliczanie średniej wartości
  const avgValue = dataValues.reduce((sum, val) => sum + val, 0) / dataValues.length;

  /**
   * Komponent niestandardowego tooltipa dla lepszej prezentacji danych
   */
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
              Wartość: <span style={{ fontWeight: 'bold', color: theme.palette.text.primary }}>{formatCurrency(payload[0].value)}</span>
            </Typography>
            {payload[0].payload && payload[0].payload.change !== undefined && (
              <Typography variant="body2" color="textSecondary">
                Zmiana: <span style={{ 
                  fontWeight: 'bold', 
                  color: payload[0].payload.change >= 0 ? theme.palette.success.main : theme.palette.error.main 
                }}>
                  {formatPercent(payload[0].payload.change/100)}
                </span>
              </Typography>
            )}
          </Box>
        </Box>
      );
    }
    return null;
  };

  /**
   * Renderuje odpowiedni typ wykresu na podstawie parametru chartType
   */
  const renderChart = () => {
    switch (chartType) {
      case 'bar':
        return (
          <BarChart
            data={data}
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
              tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
              axisLine={{ stroke: theme.palette.divider }}
              tickLine={{ stroke: theme.palette.divider }}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <ReferenceLine 
              y={avgValue} 
              stroke={theme.palette.warning.main} 
              strokeDasharray="3 3"
            >
              <Label 
                value="Średnia" 
                position="insideBottomRight" 
                fill={theme.palette.warning.main}
                fontSize={12}
              />
            </ReferenceLine>
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={barColors[index % barColors.length]} />
              ))}
            </Bar>
          </BarChart>
        );
      case 'area':
        return (
          <AreaChart
            data={data}
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
              tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
              axisLine={{ stroke: theme.palette.divider }}
              tickLine={{ stroke: theme.palette.divider }}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <ReferenceLine 
              y={avgValue} 
              stroke={theme.palette.warning.main} 
              strokeDasharray="3 3"
            >
              <Label 
                value="Średnia" 
                position="insideBottomRight" 
                fill={theme.palette.warning.main}
                fontSize={12}
              />
            </ReferenceLine>
            <Area 
              type="monotone" 
              dataKey="value" 
              stroke={areaColor} 
              fill={areaColor} 
              fillOpacity={0.2}
            />
          </AreaChart>
        );
      case 'line':
      default:
        return (
          <LineChart
            data={data}
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
              tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
              axisLine={{ stroke: theme.palette.divider }}
              tickLine={{ stroke: theme.palette.divider }}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <ReferenceLine 
              y={avgValue} 
              stroke={theme.palette.warning.main} 
              strokeDasharray="3 3"
            >
              <Label 
                value="Średnia" 
                position="insideBottomRight" 
                fill={theme.palette.warning.main}
                fontSize={12}
              />
            </ReferenceLine>
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke={lineColor} 
              strokeWidth={2}
              dot={{ fill: lineColor, r: 4 }}
              activeDot={{ fill: lineColor, r: 6, strokeWidth: 0 }}
            />
          </LineChart>
        );
    }
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
      {title && (
        <Box sx={{ mb: 1, display: 'flex', justifyContent: 'center' }}>
          <Typography variant="h6" color="textPrimary">
            {title}
          </Typography>
        </Box>
      )}
      
      <Box sx={{ flexGrow: 1, width: '100%', height: '100%', minHeight: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          {renderChart()}
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};

export default SalesChart; 