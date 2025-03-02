import React from 'react';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  CardHeader, 
  Divider,
  useTheme
} from '@mui/material';
import { 
  BarChart, 
  Bar, 
  PieChart,
  Pie,
  Cell,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  Sector
} from 'recharts';
import { formatCurrency } from '../../../utils/formatUtils';

/**
 * Komponent wykresu inwentarza
 * 
 * @param {Object} props Właściwości komponentu
 * @param {string} props.title Tytuł wykresu
 * @param {Array} props.data Dane inwentarza
 * @param {Object} props.sx Dodatkowe styles
 */
const InventoryChart = ({ title, data, sx }) => {
  const theme = useTheme();
  const [activeIndex, setActiveIndex] = React.useState(0);
  
  // Kolory dla wykresów
  const COLORS = [
    theme.palette.primary.main,
    theme.palette.secondary.main,
    theme.palette.success.main,
    theme.palette.warning.main,
    theme.palette.error.main,
    theme.palette.info.main,
    '#9c27b0',
    '#607d8b',
    '#795548'
  ];
  
  // Jeśli brak danych, wyświetl informację
  if (!data || data.length === 0) {
    return (
      <Card sx={{ ...sx, height: '100%' }}>
        <CardContent sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Typography variant="body2" color="textSecondary">
            Brak danych magazynowych do wyświetlenia
          </Typography>
        </CardContent>
      </Card>
    );
  }

  // Sortowanie danych malejąco według wartości
  const sortedData = [...data].sort((a, b) => b.value - a.value);
  
  // Formatowanie danych do wykresu
  const chartData = sortedData.map(item => ({
    name: item.name,
    value: item.value
  }));
  
  // Obliczenie łącznej wartości
  const totalValue = chartData.reduce((sum, item) => sum + item.value, 0);
  
  // Obsługa aktywnego sektora
  const onPieEnter = (_, index) => {
    setActiveIndex(index);
  };

  // Renderowanie aktywnego sektora
  const renderActiveShape = (props) => {
    const { 
      cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value 
    } = props;
    
    return (
      <g>
        <text x={cx} y={cy - 25} dy={8} textAnchor="middle" fill={theme.palette.text.primary}>
          {payload.name}
        </text>
        <text x={cx} y={cy} dy={8} textAnchor="middle" fill={theme.palette.text.primary} fontWeight="bold">
          {formatCurrency(value)}
        </text>
        <text x={cx} y={cy + 25} dy={8} textAnchor="middle" fill={theme.palette.text.secondary}>
          {`${(percent * 100).toFixed(1)}%`}
        </text>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius + 6}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={outerRadius + 6}
          outerRadius={outerRadius + 10}
          fill={fill}
        />
      </g>
    );
  };

  // Konfiguracja tooltipa
  const CustomTooltip = ({ active, payload }) => {
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
          <Typography variant="body2" fontWeight="bold" color="primary">
            {payload[0].name}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="textSecondary">
              Wartość: <span style={{ fontWeight: 'bold', color: theme.palette.text.primary }}>{formatCurrency(payload[0].value)}</span>
            </Typography>
            <Typography variant="body2" color="textSecondary">
              Udział: <span style={{ fontWeight: 'bold', color: theme.palette.text.primary }}>{`${(payload[0].value / totalValue * 100).toFixed(1)}%`}</span>
            </Typography>
          </Box>
        </Box>
      );
    }
    return null;
  };

  const renderLegend = (props) => {
    const { payload } = props;
    
    return (
      <Box 
        sx={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          justifyContent: 'center', 
          mt: 1
        }}
      >
        {payload.slice(0, 5).map((entry, index) => (
          <Box 
            key={`legend-${index}`} 
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              mr: 2, 
              mb: 1,
              cursor: 'pointer'
            }}
            onClick={() => setActiveIndex(index)}
          >
            <Box 
              sx={{ 
                width: 12, 
                height: 12, 
                backgroundColor: entry.color,
                borderRadius: '50%',
                mr: 1
              }} 
            />
            <Typography 
              variant="caption" 
              sx={{ 
                color: activeIndex === index ? 'text.primary' : 'text.secondary',
                fontWeight: activeIndex === index ? 'bold' : 'regular'
              }}
            >
              {entry.value}
            </Typography>
          </Box>
        ))}
      </Box>
    );
  };

  return (
    <Card sx={{ ...sx, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        title={<Typography variant="h6">{title || 'Struktura magazynu'}</Typography>}
        sx={{ pb: 0 }}
      />
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', pt: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', mb: 1 }}>
          <Typography variant="body2" color="textSecondary">
            Łączna wartość magazynu
          </Typography>
          <Typography variant="h6" color="primary" fontWeight="bold">
            {formatCurrency(totalValue)}
          </Typography>
        </Box>
        
        <ResponsiveContainer width="99%" height={250}>
          <PieChart>
            <Pie
              activeIndex={activeIndex}
              activeShape={renderActiveShape}
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              onMouseEnter={onPieEnter}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend content={renderLegend} />
          </PieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

export default InventoryChart; 