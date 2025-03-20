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
 * Renderuje aktywny sektor w wykresie kołowym
 */
const renderActiveShape = (props) => {
  const RADIAN = Math.PI / 180;
  const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle,
    fill, payload, percent, value } = props;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
  const mx = cx + (outerRadius + 30) * cos;
  const my = cy + (outerRadius + 30) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor = cos >= 0 ? 'start' : 'end';

  return (
    <g>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
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
      <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="#333">{payload.name}</text>
      <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="#999">
        {`${formatCurrency(value)} (${(percent * 100).toFixed(0)}%)`}
      </text>
    </g>
  );
};

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
          Brak danych magazynowych do wyświetlenia
        </Typography>
      </Box>
    );
  }

  // Sortowanie danych malejąco według wartości i filtrowanie nieprawidłowych wartości
  const validData = data.filter(item => 
    item && 
    item.name && 
    typeof item.value === 'number' && 
    !isNaN(item.value)
  );
  
  const sortedData = [...validData].sort((a, b) => b.value - a.value);
  
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

  return (
    <Box sx={{ ...sx, height: '100%', width: '100%' }}>
      {title && (
        <Typography variant="h6" sx={{ mb: 2 }}>
          {title}
        </Typography>
      )}
      
      <Typography variant="body2" sx={{ mb: 1 }}>
        Struktura magazynu
      </Typography>
      
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <ResponsiveContainer width="100%" height={240}>
          <PieChart>
            <Pie
              activeIndex={activeIndex}
              activeShape={renderActiveShape}
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
              onMouseEnter={onPieEnter}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(value)} />
          </PieChart>
        </ResponsiveContainer>
        
        <Typography align="center" variant="subtitle1" sx={{ mt: 1, mb: 0.5 }}>
          Łączna wartość magazynu
        </Typography>
        <Typography align="center" variant="h5" color="primary" sx={{ fontWeight: 'bold' }}>
          {isNaN(totalValue) ? '0,00 zł' : formatCurrency(totalValue)}
        </Typography>
      </Box>
    </Box>
  );
};

export default InventoryChart; 