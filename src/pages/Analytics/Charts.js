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
  CircularProgress,
  ToggleButtonGroup,
  ToggleButton
} from '@mui/material';
import { Line, Bar, Pie, Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { getChartData } from '../../services/analyticsService';
import { formatCurrency } from '../../utils/formatUtils';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
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
  const [chartType, setChartType] = useState('line');
  const [productionView, setProductionView] = useState('completed'); // 'completed' lub 'both'
  const [categoriesView, setCategoriesView] = useState('value'); // 'value' lub 'count'
  const [categoriesChartType, setCategoriesChartType] = useState('pie'); // 'pie' lub 'doughnut'
  
  const [chartData, setChartData] = useState({
    sales: {
      labels: [],
      datasets: [{
        label: 'Sprzedaż (PLN)',
        data: [],
        borderColor: 'rgb(75, 192, 192)',
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
        tension: 0.1
      }]
    },
    production: {
      labels: [],
      datasets: [{
        label: 'Ukończone zadania',
        data: [],
        borderColor: 'rgb(255, 99, 132)',
        backgroundColor: 'rgba(255, 99, 132, 0.5)',
        tension: 0.1
      }]
    },
    inventory: {
      labels: [],
      datasets: [{
        label: 'Wartość magazynu (PLN)',
        data: [],
        borderColor: 'rgb(54, 162, 235)',
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
        tension: 0.1
      }]
    },
    categories: {
      labels: [],
      datasets: [{
        label: 'Wartość według kategorii (PLN)',
        data: [],
        backgroundColor: [
          'rgba(255, 99, 132, 0.7)',
          'rgba(54, 162, 235, 0.7)',
          'rgba(255, 206, 86, 0.7)',
          'rgba(75, 192, 192, 0.7)',
          'rgba(153, 102, 255, 0.7)',
          'rgba(255, 159, 64, 0.7)',
          'rgba(255, 99, 132, 0.5)',
          'rgba(54, 162, 235, 0.5)',
          'rgba(255, 206, 86, 0.5)',
          'rgba(75, 192, 192, 0.5)'
        ],
        borderColor: [
          'rgba(255, 99, 132, 1)',
          'rgba(54, 162, 235, 1)',
          'rgba(255, 206, 86, 1)',
          'rgba(75, 192, 192, 1)',
          'rgba(153, 102, 255, 1)',
          'rgba(255, 159, 64, 1)',
          'rgba(255, 99, 132, 0.8)',
          'rgba(54, 162, 235, 0.8)',
          'rgba(255, 206, 86, 0.8)',
          'rgba(75, 192, 192, 0.8)'
        ],
        borderWidth: 1
      }]
    }
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Pobierz dane dla każdego wykresu
        const [salesData, inventoryData, productionData, categoriesData] = await Promise.all([
          getChartData('sales', timeRange),
          getChartData('inventory', timeRange),
          getChartData('production', timeRange),
          getChartData('categories')
        ]);

        console.log('Pobrane dane wykresów:', {
          sales: salesData,
          inventory: inventoryData,
          production: productionData,
          categories: categoriesData
        });

        // Przygotuj dane wykresów
        const salesChartData = {
          labels: salesData.labels || [],
          datasets: [{
            label: 'Sprzedaż (PLN)',
            data: salesData.data || [],
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.5)',
            tension: 0.1,
            fill: chartType === 'bar'
          }]
        };

        // Przygotuj dane wykresu produkcji - obsługa zarówno ukończonych, jak i zaplanowanych zadań
        const productionChartData = {
          labels: productionData.labels || [],
          datasets: [{
            label: 'Ukończone zadania',
            data: productionData.data || [],
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.5)',
            tension: 0.1,
            fill: chartType === 'bar'
          }]
        };
        
        // Dodaj drugą serię danych (zaplanowane zadania), jeśli są dostępne
        if (productionData.plannedData && productionView === 'both') {
          productionChartData.datasets.push({
            label: 'Zaplanowane zadania',
            data: productionData.plannedData || [],
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            tension: 0.1,
            fill: chartType === 'bar'
          });
        }

        const inventoryChartData = {
          labels: inventoryData.labels || [],
          datasets: [{
            label: 'Wartość magazynu (PLN)',
            data: inventoryData.data || [],
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            tension: 0.1,
            fill: chartType === 'bar'
          }]
        };
        
        // Przygotuj dane wykresu kategorii produktów
        const categoriesChartData = {
          labels: categoriesData.labels || [],
          datasets: [{
            label: categoriesView === 'value' ? 'Wartość według kategorii (PLN)' : 'Liczba produktów',
            data: categoriesView === 'value' ? categoriesData.data : categoriesData.countData,
            backgroundColor: [
              'rgba(255, 99, 132, 0.7)',
              'rgba(54, 162, 235, 0.7)',
              'rgba(255, 206, 86, 0.7)',
              'rgba(75, 192, 192, 0.7)',
              'rgba(153, 102, 255, 0.7)',
              'rgba(255, 159, 64, 0.7)',
              'rgba(255, 99, 132, 0.5)',
              'rgba(54, 162, 235, 0.5)',
              'rgba(255, 206, 86, 0.5)',
              'rgba(75, 192, 192, 0.5)'
            ],
            borderColor: [
              'rgba(255, 99, 132, 1)',
              'rgba(54, 162, 235, 1)',
              'rgba(255, 206, 86, 1)',
              'rgba(75, 192, 192, 1)',
              'rgba(153, 102, 255, 1)',
              'rgba(255, 159, 64, 1)',
              'rgba(255, 99, 132, 0.8)',
              'rgba(54, 162, 235, 0.8)',
              'rgba(255, 206, 86, 0.8)',
              'rgba(75, 192, 192, 0.8)'
            ],
            borderWidth: 1
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
          
          if (productionChartData.datasets.length > 1) {
            productionChartData.datasets[1].data = [60, 65, 70, 75, 85, 90];
          }
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
        
        if (!validateCategoriesChartData(categoriesChartData)) {
          console.warn('Wykryto nieprawidłowe dane dla wykresu kategorii, używam wartości domyślnych');
          categoriesChartData.labels = ['Surowce', 'Produkty gotowe', 'Opakowania', 'Półprodukty', 'Inne'];
          categoriesChartData.datasets[0].data = [120000, 85000, 45000, 30000, 15000];
        }

        // Filtruj nieprawidłowe etykiety
        salesChartData.labels = salesChartData.labels.filter(label => 
          label !== undefined && label !== "undefined" && label !== "NaN" && label !== null
        );
        
        productionChartData.labels = productionChartData.labels.filter(label => 
          label !== undefined && label !== "undefined" && label !== "NaN" && label !== null
        );
        
        inventoryChartData.labels = inventoryChartData.labels.filter(label => 
          label !== undefined && label !== "undefined" && label !== "NaN" && label !== null
        );
        
        categoriesChartData.labels = categoriesChartData.labels.filter(label => 
          label !== undefined && label !== "undefined" && label !== "NaN" && label !== null
        );

        setChartData({
          sales: salesChartData,
          production: productionChartData,
          inventory: inventoryChartData,
          categories: categoriesChartData
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
              label: 'Sprzedaż (PLN)',
              data: [20000, 25000, 23000, 30000, 29000, 35000],
              borderColor: 'rgb(75, 192, 192)',
              backgroundColor: 'rgba(75, 192, 192, 0.5)',
              tension: 0.1,
              fill: chartType === 'bar'
            }]
          },
          production: {
            labels: defaultLabels,
            datasets: [{
              label: 'Ukończone zadania',
              data: [50, 55, 60, 65, 70, 75],
              borderColor: 'rgb(255, 99, 132)',
              backgroundColor: 'rgba(255, 99, 132, 0.5)',
              tension: 0.1,
              fill: chartType === 'bar'
            }]
          },
          inventory: {
            labels: Array.from({length: 30}, (_, i) => {
              const date = new Date();
              date.setDate(date.getDate() - (29 - i));
              return `${date.getDate()}.${date.getMonth() + 1}`;
            }),
            datasets: [{
              label: 'Wartość magazynu (PLN)',
              data: Array.from({length: 30}, (_, i) => 200000 + (i * 100)),
              borderColor: 'rgb(54, 162, 235)',
              backgroundColor: 'rgba(54, 162, 235, 0.5)',
              tension: 0.1,
              fill: chartType === 'bar'
            }]
          },
          categories: {
            labels: ['Surowce', 'Produkty gotowe', 'Opakowania', 'Półprodukty', 'Inne'],
            datasets: [{
              label: categoriesView === 'value' ? 'Wartość według kategorii (PLN)' : 'Liczba produktów',
              data: categoriesView === 'value' 
                ? [120000, 85000, 45000, 30000, 15000]
                : [25, 30, 15, 10, 5],
              backgroundColor: [
                'rgba(255, 99, 132, 0.7)',
                'rgba(54, 162, 235, 0.7)',
                'rgba(255, 206, 86, 0.7)',
                'rgba(75, 192, 192, 0.7)',
                'rgba(153, 102, 255, 0.7)'
              ],
              borderColor: [
                'rgba(255, 99, 132, 1)',
                'rgba(54, 162, 235, 1)',
                'rgba(255, 206, 86, 1)',
                'rgba(75, 192, 192, 1)',
                'rgba(153, 102, 255, 1)'
              ],
              borderWidth: 1
            }]
          }
        });
        
        setLoading(false);
      }
    };

    fetchData();
  }, [timeRange, chartType, productionView, categoriesView, categoriesChartType]);

  const handleTimeRangeChange = (event) => {
    setTimeRange(event.target.value);
  };
  
  const handleChartTypeChange = (event, newType) => {
    if (newType !== null) {
      setChartType(newType);
    }
  };
  
  const handleProductionViewChange = (event, newView) => {
    if (newView !== null) {
      setProductionView(newView);
    }
  };
  
  const handleCategoriesViewChange = (event, newView) => {
    if (newView !== null) {
      setCategoriesView(newView);
    }
  };
  
  const handleCategoriesChartTypeChange = (event, newType) => {
    if (newType !== null) {
      setCategoriesChartType(newType);
    }
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
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
              
              // Formatowanie zależne od typu danych
              if (label.includes('PLN')) {
                return label + formatCurrency(context.parsed.y);
              } else {
                return label + context.parsed.y.toFixed(0);
              }
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
            // Naprawia problem z undefined/NaN
            if (!label || label === "undefined" || label === "NaN") {
              return '';
            }
            return label;
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
            
            // Formatuj wartości powyżej 1000 w skróconej formie
            if (value >= 1000) {
              return (value / 1000).toFixed(1) + ' tys.';
            }
            return value;
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
  
  const pieChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        display: true,
        labels: {
          boxWidth: 12,
          font: {
            size: 10
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.label || '';
            if (label) {
              label += ': ';
            }
            
            const value = context.raw || 0;
            
            // Formatowanie w zależności od widoku (wartość/liczba)
            if (categoriesView === 'value') {
              return label + formatCurrency(value);
            } else {
              return label + value + ' produktów';
            }
          }
        }
      }
    }
  };

  const validateChartData = (chartData) => {
    if (!chartData || !chartData.labels || !chartData.datasets || !chartData.datasets[0] || !chartData.datasets[0].data) {
      console.error('Nieprawidłowy format danych wykresu', chartData);
      return false;
    }
    
    if (!Array.isArray(chartData.labels) || !Array.isArray(chartData.datasets[0].data)) {
      console.error('Nieprawidłowy format danych wykresu - brak tablic', chartData);
      return false;
    }
    
    if (chartData.labels.length === 0 || chartData.datasets[0].data.length === 0) {
      console.error('Puste dane wykresu', chartData);
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
  
  const validateCategoriesChartData = (chartData) => {
    if (!chartData || !chartData.labels || !chartData.datasets || !chartData.datasets[0] || !chartData.datasets[0].data) {
      console.error('Nieprawidłowy format danych wykresu kategorii', chartData);
      return false;
    }
    
    if (!Array.isArray(chartData.labels) || !Array.isArray(chartData.datasets[0].data)) {
      console.error('Nieprawidłowy format danych wykresu kategorii - brak tablic', chartData);
      return false;
    }
    
    if (chartData.labels.length === 0 || chartData.datasets[0].data.length === 0) {
      console.error('Puste dane wykresu kategorii', chartData);
      return false;
    }
    
    // Długości tablic labels i data muszą być takie same
    if (chartData.labels.length !== chartData.datasets[0].data.length) {
      console.error('Niezgodność długości tablic labels i data', chartData);
      return false;
    }
    
    return true;
  };

  // Wybierz odpowiedni komponent wykresu w zależności od typu
  const ChartComponent = chartType === 'bar' ? Bar : Line;
  const CategoriesChartComponent = categoriesChartType === 'pie' ? Pie : Doughnut;

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
        <FormControl>
          <InputLabel>Zakres czasowy</InputLabel>
          <Select
            value={timeRange}
            label="Zakres czasowy"
            onChange={handleTimeRangeChange}
            sx={{ minWidth: 200 }}
          >
            {timeRanges.map((range) => (
              <MenuItem key={range.value} value={range.value}>
                {range.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        
        <ToggleButtonGroup
          value={chartType}
          exclusive
          onChange={handleChartTypeChange}
          aria-label="typ wykresu"
        >
          <ToggleButton value="line">Liniowy</ToggleButton>
          <ToggleButton value="bar">Słupkowy</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Grid container spacing={3}>
        {/* Zmiana układu na 2x2 kafelki */}
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h6" gutterBottom>
                Trend sprzedaży
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Wartość sprzedaży w czasie pokazująca trendy wzrostowe lub spadkowe w przychodach firmy.
              </Typography>
              <Box sx={{ flexGrow: 1, height: '280px' }}>
                <ChartComponent options={chartOptions} data={chartData.sales} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">
                  Trend produkcji
                </Typography>
                <ToggleButtonGroup
                  size="small"
                  value={productionView}
                  exclusive
                  onChange={handleProductionViewChange}
                  aria-label="widok produkcji"
                >
                  <ToggleButton value="completed">Ukończone</ToggleButton>
                  <ToggleButton value="both">Oba typy</ToggleButton>
                </ToggleButtonGroup>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Liczba zadań produkcyjnych ukończonych i zaplanowanych w kolejnych miesiącach.
              </Typography>
              <Box sx={{ flexGrow: 1, height: '280px' }}>
                <ChartComponent options={chartOptions} data={chartData.production} />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Typography variant="h6" gutterBottom>
                Trend wartości magazynu
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Zmiana całkowitej wartości zapasów magazynowych w czasie - pozwala monitorować zapasy i planować zakupy.
              </Typography>
              <Box sx={{ flexGrow: 1, height: '280px' }}>
                <ChartComponent options={chartOptions} data={chartData.inventory} />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%' }}>
            <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="h6">
                  Kategorie produktów
                </Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <ToggleButtonGroup
                    size="small"
                    value={categoriesView}
                    exclusive
                    onChange={handleCategoriesViewChange}
                    aria-label="widok kategorii"
                  >
                    <ToggleButton value="value">Wartość</ToggleButton>
                    <ToggleButton value="count">Liczba</ToggleButton>
                  </ToggleButtonGroup>
                  
                  <ToggleButtonGroup
                    size="small"
                    value={categoriesChartType}
                    exclusive
                    onChange={handleCategoriesChartTypeChange}
                    aria-label="typ wykresu kategorii"
                  >
                    <ToggleButton value="pie">Kołowy</ToggleButton>
                    <ToggleButton value="doughnut">Pierścieniowy</ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Porównanie kategorii produktów według {categoriesView === 'value' ? 'wartości magazynowej' : 'liczby produktów'}.
              </Typography>
              <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '280px' }}>
                <Box sx={{ width: '100%', height: '100%', maxWidth: '280px' }}>
                  <CategoriesChartComponent options={pieChartOptions} data={chartData.categories} />
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Charts; 