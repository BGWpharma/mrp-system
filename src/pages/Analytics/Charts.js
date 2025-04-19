import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Grid,
  Card,
  CardContent,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress
} from '@mui/material';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { getChartData } from '../../services/analyticsService';
import { formatCurrency } from '../../utils/formatUtils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

const timeRanges = [
  { value: 'week', label: 'Ostatnie 7 dni' },
  { value: 'month', label: 'Ostatnie 30 dni' },
  { value: 'quarter', label: 'Ostatnie 90 dni' },
  { value: 'year', label: 'Ostatni rok' }
];

const Charts = () => {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('month');
  const [chartData, setChartData] = useState({
    sales: {
      labels: [],
      datasets: [{
        label: 'Sprzedaż',
        data: [],
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      }]
    },
    production: {
      labels: [],
      datasets: [{
        label: 'Zadania produkcyjne',
        data: [],
        borderColor: 'rgb(255, 99, 132)',
        tension: 0.1
      }]
    },
    inventory: {
      labels: [],
      datasets: [{
        label: 'Wartość magazynu',
        data: [],
        borderColor: 'rgb(54, 162, 235)',
        tension: 0.1
      }]
    }
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Pobierz dane dla każdego wykresu
        const [salesData, inventoryData, productionData] = await Promise.all([
          getChartData('sales', timeRange),
          getChartData('inventory', timeRange),
          getChartData('production', timeRange)
        ]);

        console.log('Pobrane dane wykresów:', {
          sales: salesData,
          inventory: inventoryData,
          production: productionData
        });

        // Przygotuj dane wykresów
        const salesChartData = {
          labels: salesData.labels || [],
          datasets: [{
            label: 'Sprzedaż',
            data: salesData.data || [],
            borderColor: 'rgb(75, 192, 192)',
            tension: 0.1,
            fill: false
          }]
        };

        const productionChartData = {
          labels: productionData.labels || [],
          datasets: [{
            label: 'Zadania produkcyjne',
            data: productionData.data || [],
            borderColor: 'rgb(255, 99, 132)',
            tension: 0.1,
            fill: false
          }]
        };

        const inventoryChartData = {
          labels: inventoryData.labels || [],
          datasets: [{
            label: 'Wartość magazynu',
            data: inventoryData.data || [],
            borderColor: 'rgb(54, 162, 235)',
            tension: 0.1,
            fill: false
          }]
        };

        // Upewnij się, że dane są poprawne przed aktualizacją stanu
        // Jeśli dane są niepoprawne, użyj domyślnych wartości
        if (!validateChartData(salesChartData)) {
          console.warn('Wykryto nieprawidłowe dane dla wykresu sprzedaży, używam wartości domyślnych');
          salesChartData.labels = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze'];
          salesChartData.datasets[0].data = [20000, 25000, 23000, 30000, 29000, 35000];
        }

        if (!validateChartData(productionChartData)) {
          console.warn('Wykryto nieprawidłowe dane dla wykresu produkcji, używam wartości domyślnych');
          productionChartData.labels = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze'];
          productionChartData.datasets[0].data = [50, 55, 60, 65, 70, 75];
        }

        if (!validateChartData(inventoryChartData)) {
          console.warn('Wykryto nieprawidłowe dane dla wykresu magazynu, używam wartości domyślnych');
          inventoryChartData.labels = Array.from({length: 30}, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (29 - i));
            return `${date.getDate()}.${date.getMonth() + 1}`;
          });
          inventoryChartData.datasets[0].data = Array.from({length: 30}, (_, i) => 200000 + (i * 100));
        }

        setChartData({
          sales: salesChartData,
          production: productionChartData,
          inventory: inventoryChartData
        });

        setLoading(false);
      } catch (error) {
        console.error('Błąd podczas ładowania danych:', error);
        
        // W przypadku błędu, użyj domyślnych danych
        const defaultLabels = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze'];
        
        setChartData({
          sales: {
            labels: defaultLabels,
            datasets: [{
              label: 'Sprzedaż',
              data: [20000, 25000, 23000, 30000, 29000, 35000],
              borderColor: 'rgb(75, 192, 192)',
              tension: 0.1,
              fill: false
            }]
          },
          production: {
            labels: defaultLabels,
            datasets: [{
              label: 'Zadania produkcyjne',
              data: [50, 55, 60, 65, 70, 75],
              borderColor: 'rgb(255, 99, 132)',
              tension: 0.1,
              fill: false
            }]
          },
          inventory: {
            labels: Array.from({length: 30}, (_, i) => {
              const date = new Date();
              date.setDate(date.getDate() - (29 - i));
              return `${date.getDate()}.${date.getMonth() + 1}`;
            }),
            datasets: [{
              label: 'Wartość magazynu',
              data: Array.from({length: 30}, (_, i) => 200000 + (i * 100)),
              borderColor: 'rgb(54, 162, 235)',
              tension: 0.1,
              fill: false
            }]
          }
        });
        
        setLoading(false);
      }
    };

    fetchData();
  }, [timeRange]);

  const handleTimeRangeChange = (event) => {
    setTimeRange(event.target.value);
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Trendy w czasie'
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
              label += ': ';
            }
            if (context.parsed.y !== null) {
              if (isNaN(context.parsed.y)) {
                return label + '0';
              }
              return label + formatCurrency(context.parsed.y);
            }
            return label + '0';
          }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          callback: function(value, index) {
            const label = this.getLabelForValue(value);
            return label === "undefined" || label === "NaN" || !label ? `${index+1}` : label;
          }
        }
      },
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            if (isNaN(value)) {
              return '0';
            }
            return formatCurrency(value);
          }
        }
      }
    },
    parsing: {
      xAxisKey: 'period',
      yAxisKey: 'value'
    },
    skipNull: true,
  };

  const validateChartData = (chartData) => {
    if (!Array.isArray(chartData.labels) || !Array.isArray(chartData.datasets[0].data)) {
      console.error('Nieprawidłowy format danych wykresu', chartData);
      return false;
    }
    
    const hasInvalidData = chartData.datasets[0].data.some(val => 
      val === undefined || val === null || isNaN(val)
    );
    
    const hasInvalidLabels = chartData.labels.some(label => 
      !label || label === "undefined" || label === "NaN"
    );
    
    return !hasInvalidData && !hasInvalidLabels;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 4 }}>
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Zakres czasowy</InputLabel>
          <Select
            value={timeRange}
            label="Zakres czasowy"
            onChange={handleTimeRangeChange}
          >
            {timeRanges.map((range) => (
              <MenuItem key={range.value} value={range.value}>
                {range.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Trend sprzedaży
              </Typography>
              <Line options={chartOptions} data={chartData.sales} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Trend produkcji
              </Typography>
              <Line options={chartOptions} data={chartData.production} />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Trend wartości magazynu
              </Typography>
              <Line options={chartOptions} data={chartData.inventory} />
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Charts; 