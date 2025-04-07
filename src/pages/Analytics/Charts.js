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

        setChartData({
          sales: {
            labels: salesData.labels,
            datasets: [{
              label: 'Sprzedaż',
              data: salesData.data,
              borderColor: 'rgb(75, 192, 192)',
              tension: 0.1
            }]
          },
          production: {
            labels: productionData.labels,
            datasets: [{
              label: 'Zadania produkcyjne',
              data: productionData.data,
              borderColor: 'rgb(255, 99, 132)',
              tension: 0.1
            }]
          },
          inventory: {
            labels: inventoryData.labels,
            datasets: [{
              label: 'Wartość magazynu',
              data: inventoryData.data,
              borderColor: 'rgb(54, 162, 235)',
              tension: 0.1
            }]
          }
        });

        setLoading(false);
      } catch (error) {
        console.error('Błąd podczas ładowania danych:', error);
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
              label += formatCurrency(context.parsed.y);
            }
            return label;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: function(value) {
            return formatCurrency(value);
          }
        }
      }
    }
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