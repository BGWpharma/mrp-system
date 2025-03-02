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
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  Legend, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { formatCurrency, formatPercent } from '../../../utils/formatUtils';

// Kolory dla wykresów
const COLORS = ['#00C49F', '#FF8042', '#0088FE', '#FFBB28'];

/**
 * Komponent wykresu jakościowego
 * 
 * @param {Object} props Właściwości komponentu
 * @param {string} props.title Tytuł wykresu
 * @param {Array} props.data Dane do wykresu
 * @param {string} props.chartType Typ wykresu (area, line, bar, pie)
 * @param {Object} props.sx Dodatkowe style
 */
const QualityChart = ({ title, data, sx }) => {
  const theme = useTheme();
  
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
          Brak danych jakościowych do wyświetlenia
        </Typography>
      </Box>
    );
  }

  // Przygotowanie danych do wykresu
  const chartData = data.map(item => ({
    name: item.category,
    value: item.defectCount,
    percent: item.percentage
  }));
  
  // Obliczenie łącznej liczby defektów
  const totalDefects = chartData.reduce((sum, item) => sum + item.value, 0);
  
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
            {payload[0].payload.name}
          </Typography>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="textSecondary">
              Liczba: <span style={{ fontWeight: 'bold', color: theme.palette.text.primary }}>
                {payload[0].value}
              </span>
            </Typography>
            {payload[0].payload.percent !== undefined && (
              <Typography variant="body2" color="textSecondary">
                Udział: <span style={{ fontWeight: 'bold', color: theme.palette.text.primary }}>
                  {formatPercent(payload[0].payload.percent/100)}
                </span>
              </Typography>
            )}
          </Box>
        </Box>
      );
    }
    return null;
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
          Łączna liczba defektów
        </Typography>
        <Typography variant="h6" color="error" fontWeight="bold">
          {totalDefects}
        </Typography>
      </Box>
      
      <Box sx={{ flexGrow: 1, width: '100%', height: '100%', minHeight: 250 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 20, right: 30, left: 80, bottom: 20 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
            <XAxis 
              type="number"
              tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
              axisLine={{ stroke: theme.palette.divider }}
              tickLine={{ stroke: theme.palette.divider }}
            />
            <YAxis 
              dataKey="name" 
              type="category"
              tick={{ fill: theme.palette.text.secondary, fontSize: 12 }}
              axisLine={{ stroke: theme.palette.divider }}
              tickLine={{ stroke: theme.palette.divider }}
              width={80}
            />
            <RechartsTooltip content={<CustomTooltip />} />
            <Bar 
              dataKey="value" 
              radius={[0, 4, 4, 0]} 
              fill={theme.palette.error.main}
              label={{
                position: 'right',
                content: (props) => {
                  const { x, y, width, height, value } = props;
                  
                  // Sprawdź czy props.payload.percent istnieje
                  if (!props.payload || props.payload.percent === undefined) {
                    return null;
                  }
                  
                  return (
                    <g>
                      <text 
                        x={x + width + 5} 
                        y={y + height / 2} 
                        fill={theme.palette.text.secondary}
                        textAnchor="start"
                        dominantBaseline="middle"
                        fontSize={12}
                      >
                        {formatPercent(props.payload.percent/100)}
                      </text>
                    </g>
                  );
                }
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </Box>
    </Box>
  );
};

export default QualityChart; 