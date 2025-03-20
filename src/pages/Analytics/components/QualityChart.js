import React from 'react';
import { useTheme } from '@mui/material/styles';
import { 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  CardHeader, 
  Divider,
  LinearProgress
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

  // Przygotowanie danych do wykresu kołowego
  const getPieData = () => {
    // Znajdź dane o wkaźnikach jakości
    const qualityRates = data.filter(item => 
      item && item.name && 
      (item.name.toLowerCase().includes('pozytywne') || item.name.toLowerCase().includes('pass') ||
       item.name.toLowerCase().includes('negatywne') || item.name.toLowerCase().includes('fail'))
    );
    
    if (qualityRates.length === 0) {
      // Domyślne dane
      return [
        { name: 'Pozytywne testy', value: 95, fill: theme.palette.success.main },
        { name: 'Negatywne testy', value: 5, fill: theme.palette.error.main }
      ];
    }
    
    // Upewnij się, że wartości są poprawne
    const validRates = qualityRates.map(item => ({
      ...item,
      value: typeof item.value === 'number' && !isNaN(item.value) ? item.value : 0
    }));
    
    return validRates;
  };
  
  // Przygotowanie danych do wykresu liniowego
  const getLineData = () => {
    // Znajdź dane o trendach
    const trendData = data.filter(item => item && item.date && !isNaN(new Date(item.date).getTime()));
    
    if (trendData.length === 0) {
      // Brak danych o trendach
      return [];
    }
    
    return trendData;
  };
  
  // Kolorowanie paska postępu
  const getProgressColor = (value) => {
    if (value >= 90) return theme.palette.success.main;
    if (value >= 70) return theme.palette.warning.main;
    return theme.palette.error.main;
  };
  
  // Pozyskaj dane do różnych wykresów
  const pieData = getPieData();
  const lineData = getLineData();
  
  // Obliczenie sumy wartości dla wykresu kołowego
  const totalQuality = pieData.reduce((sum, item) => sum + item.value, 0);
  
  // Znajdź wartość wskaźnika pozytywnych wyników
  const passRate = pieData.find(item => 
    item.name.toLowerCase().includes('pozytywne') || 
    item.name.toLowerCase().includes('pass')
  )?.value || 0;
  
  return (
    <Box sx={{ ...sx, height: '100%', width: '100%' }}>
      {title && (
        <Typography variant="h6" sx={{ mb: 2 }}>
          {title}
        </Typography>
      )}
      
      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Łączna liczba defektów
        </Typography>
        
        <Typography align="center" color={passRate >= 90 ? "success.main" : passRate >= 75 ? "warning.main" : "error.main"} 
          variant="h5" sx={{ fontWeight: 'bold', mb: 1 }}>
          {isNaN(passRate) ? "NaN" : Math.round(passRate * 10) / 10}
        </Typography>
        
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Box sx={{ flexGrow: 1, mr: 1 }}>
            <LinearProgress 
              variant="determinate" 
              value={isNaN(passRate) ? 0 : Math.min(passRate, 100)} 
              sx={{ 
                height: 8, 
                borderRadius: 5,
                backgroundColor: theme.palette.grey[200],
                '& .MuiLinearProgress-bar': {
                  backgroundColor: getProgressColor(passRate)
                }
              }} 
            />
          </Box>
          <Typography variant="body2" color="text.secondary">
            {isNaN(passRate) ? "0%" : `${Math.round(passRate)}%`}
          </Typography>
        </Box>
      </Box>
      
      {pieData.length > 0 && (
        <Box sx={{ height: 200, mt: 2 }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Wskaźniki jakości
          </Typography>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(1)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.fill || (
                      entry.name.toLowerCase().includes('pozytywne') || 
                      entry.name.toLowerCase().includes('pass')
                        ? theme.palette.success.main
                        : theme.palette.error.main
                    )} 
                  />
                ))}
              </Pie>
              <RechartsTooltip 
                formatter={(value) => `${value.toFixed(1)}`} 
                labelFormatter={(name) => name} 
              />
            </PieChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Box>
  );
};

export default QualityChart; 