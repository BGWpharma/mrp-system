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
  ToggleButton,
  TextField
} from '@mui/material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';
import { format, subMonths, subWeeks, subDays, startOfMonth, endOfMonth } from 'date-fns';
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
  { value: 'year', label: 'Ostatni rok' },
  { value: 'custom', label: 'Niestandardowy zakres' }
];

const Charts = () => {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('month');
  const [chartType, setChartType] = useState('line');
  const [productionView, setProductionView] = useState('completed'); // 'completed' lub 'both'
  const [categoriesView, setCategoriesView] = useState('value'); // 'value' lub 'count'
  const [categoriesChartType, setCategoriesChartType] = useState('pie'); // 'pie' lub 'doughnut'
  
  // Dodane stany dla niestandardowego zakresu dat
  const [startDate, setStartDate] = useState(subMonths(new Date(), 1));
  const [endDate, setEndDate] = useState(new Date());
  const [dateRangeError, setDateRangeError] = useState(false);
  
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
        
        // Przygotuj parametry daty do zapytań
        let dateParams = {};
        if (timeRange === 'custom') {
          if (startDate && endDate && startDate <= endDate) {
            dateParams = {
              startDate: format(startDate, 'yyyy-MM-dd'),
              endDate: format(endDate, 'yyyy-MM-dd')
            };
            setDateRangeError(false);
          } else {
            // Błędny zakres dat
            setDateRangeError(true);
            setLoading(false);
            return;
          }
        }
        
        // Pobierz dane dla każdego wykresu z uwzględnieniem zakresu dat
        const [salesData, inventoryData, productionData, categoriesData] = await Promise.all([
          getChartData('sales', timeRange, 12, dateParams),
          getChartData('inventory', timeRange, 30, dateParams),
          getChartData('production', timeRange, 6, dateParams),
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
          labels: [],
          datasets: [{
            label: 'Sprzedaż (PLN)',
            data: [],
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.5)',
            tension: 0.1,
            fill: chartType === 'bar'
          }]
        };
        
        // Weryfikacja i przygotowanie danych sprzedaży
        if (salesData && Array.isArray(salesData.labels) && Array.isArray(salesData.data)) {
          // Utwórz pary etykieta-dane i odfiltruj nieprawidłowe
          const validPairs = salesData.labels
            .map((label, index) => ({ 
              label, 
              value: salesData.data[index]
            }))
            .filter(pair => 
              pair.label && 
              pair.label !== "undefined" && 
              pair.label !== "NaN" &&
              !isNaN(pair.value) && 
              pair.value !== null && 
              pair.value !== undefined
            );
          
          // Jeśli pozostały jakieś poprawne dane, użyj ich
          if (validPairs.length > 0) {
            salesChartData.labels = validPairs.map(pair => pair.label);
            salesChartData.datasets[0].data = validPairs.map(pair => pair.value);
          } else {
            // Jeśli nie ma poprawnych danych, użyj danych przykładowych
            const defaultLabels = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze'];
            salesChartData.labels = defaultLabels;
            salesChartData.datasets[0].data = [20000, 25000, 23000, 30000, 29000, 35000];
          }
        } else {
          // Jeśli nie ma poprawnej struktury danych, użyj danych przykładowych
          const defaultLabels = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze'];
          salesChartData.labels = defaultLabels;
          salesChartData.datasets[0].data = [20000, 25000, 23000, 30000, 29000, 35000];
        }

        // Przygotuj dane wykresu produkcji - obsługa zarówno ukończonych, jak i zaplanowanych zadań
        const productionChartData = {
          labels: [],
          datasets: [{
            label: 'Ukończone zadania',
            data: [],
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.5)',
            tension: 0.1,
            fill: chartType === 'bar'
          }]
        };
        
        // Weryfikacja i przygotowanie danych produkcji
        if (productionData && Array.isArray(productionData.labels) && Array.isArray(productionData.data)) {
          // Utwórz pary etykieta-dane i odfiltruj nieprawidłowe
          const validPairs = productionData.labels
            .map((label, index) => ({ 
              label, 
              value: productionData.data[index]
            }))
            .filter(pair => 
              pair.label && 
              pair.label !== "undefined" && 
              pair.label !== "NaN" &&
              !isNaN(pair.value) && 
              pair.value !== null && 
              pair.value !== undefined
            );
          
          // Jeśli pozostały jakieś poprawne dane, użyj ich
          if (validPairs.length > 0) {
            productionChartData.labels = validPairs.map(pair => pair.label);
            productionChartData.datasets[0].data = validPairs.map(pair => pair.value);
            
            // Dodaj drugą serię danych (zaplanowane zadania), jeśli są dostępne
            if (productionData.plannedData && productionView === 'both') {
              // Filtruj zaplanowane dane, korzystając z tych samych etykiet
              const validPlannedData = validPairs.map((pair, index) => {
                const plannedValue = productionData.plannedData[index];
                return !isNaN(plannedValue) && plannedValue !== null && plannedValue !== undefined ? plannedValue : null;
              }).filter(value => value !== null);
              
              if (validPlannedData.length > 0) {
                productionChartData.datasets.push({
                  label: 'Zaplanowane zadania',
                  data: validPlannedData,
                  borderColor: 'rgb(54, 162, 235)',
                  backgroundColor: 'rgba(54, 162, 235, 0.5)',
                  tension: 0.1,
                  fill: chartType === 'bar'
                });
              }
            }
          } else {
            // Jeśli nie ma poprawnych danych, użyj danych przykładowych
            const defaultLabels = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze'];
            productionChartData.labels = defaultLabels;
            productionChartData.datasets[0].data = [50, 55, 60, 65, 70, 75];
            
            if (productionView === 'both') {
              productionChartData.datasets.push({
                label: 'Zaplanowane zadania',
                data: [60, 65, 70, 75, 85, 90],
                borderColor: 'rgb(54, 162, 235)',
                backgroundColor: 'rgba(54, 162, 235, 0.5)',
                tension: 0.1,
                fill: chartType === 'bar'
              });
            }
          }
        } else {
          // Jeśli nie ma poprawnej struktury danych, użyj danych przykładowych
          const defaultLabels = ['Sty', 'Lut', 'Mar', 'Kwi', 'Maj', 'Cze'];
          productionChartData.labels = defaultLabels;
          productionChartData.datasets[0].data = [50, 55, 60, 65, 70, 75];
          
          if (productionView === 'both') {
            productionChartData.datasets.push({
              label: 'Zaplanowane zadania',
              data: [60, 65, 70, 75, 85, 90],
              borderColor: 'rgb(54, 162, 235)',
              backgroundColor: 'rgba(54, 162, 235, 0.5)',
              tension: 0.1,
              fill: chartType === 'bar'
            });
          }
        }

        const inventoryChartData = {
          labels: [],
          datasets: [{
            label: 'Wartość magazynu (PLN)',
            data: [],
            borderColor: 'rgb(54, 162, 235)',
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            tension: 0.1,
            fill: chartType === 'bar'
          }]
        };
        
        // Weryfikacja i przygotowanie danych magazynu
        if (inventoryData && Array.isArray(inventoryData.labels) && Array.isArray(inventoryData.data)) {
          // Utwórz pary etykieta-dane i odfiltruj nieprawidłowe
          const validPairs = inventoryData.labels
            .map((label, index) => ({ 
              label, 
              value: inventoryData.data[index]
            }))
            .filter(pair => 
              pair.label && 
              pair.label !== "undefined" && 
              pair.label !== "NaN" &&
              !isNaN(pair.value) && 
              pair.value !== null && 
              pair.value !== undefined
            );
          
          // Jeśli pozostały jakieś poprawne dane, użyj ich
          if (validPairs.length > 0) {
            inventoryChartData.labels = validPairs.map(pair => pair.label);
            inventoryChartData.datasets[0].data = validPairs.map(pair => pair.value);
          } else {
            // Jeśli nie ma poprawnych danych, użyj danych przykładowych
            const labels = Array.from({length: 30}, (_, i) => {
              const date = new Date();
              date.setDate(date.getDate() - (29 - i));
              return `${date.getDate()}.${date.getMonth() + 1}`;
            });
            inventoryChartData.labels = labels;
            inventoryChartData.datasets[0].data = Array.from({length: 30}, (_, i) => 200000 + (i * 100));
          }
        } else {
          // Jeśli nie ma poprawnej struktury danych, użyj danych przykładowych
          const labels = Array.from({length: 30}, (_, i) => {
            const date = new Date();
            date.setDate(date.getDate() - (29 - i));
            return `${date.getDate()}.${date.getMonth() + 1}`;
          });
          inventoryChartData.labels = labels;
          inventoryChartData.datasets[0].data = Array.from({length: 30}, (_, i) => 200000 + (i * 100));
        }
        
        // Przygotuj dane wykresu kategorii produktów
        const categoriesChartData = {
          labels: [],
          datasets: [{
            label: categoriesView === 'value' ? 'Wartość według kategorii (PLN)' : 'Liczba produktów',
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
        };
        
        // Weryfikacja i przygotowanie danych kategorii
        if (categoriesData && Array.isArray(categoriesData.labels)) {
          const dataSource = categoriesView === 'value' ? categoriesData.data : categoriesData.countData;
          
          if (Array.isArray(dataSource) && categoriesData.labels.length === dataSource.length) {
            // Utwórz pary etykieta-dane i odfiltruj nieprawidłowe
            const validPairs = categoriesData.labels
              .map((label, index) => ({ 
                label, 
                value: dataSource[index]
              }))
              .filter(pair => 
                pair.label && 
                pair.label !== "undefined" && 
                pair.label !== "NaN" &&
                !isNaN(pair.value) && 
                pair.value !== null && 
                pair.value !== undefined
              );
            
            // Jeśli pozostały jakieś poprawne dane, użyj ich
            if (validPairs.length > 0) {
              categoriesChartData.labels = validPairs.map(pair => pair.label);
              categoriesChartData.datasets[0].data = validPairs.map(pair => pair.value);
            } else {
              // Jeśli nie ma poprawnych danych, użyj danych przykładowych
              categoriesChartData.labels = ['Surowce', 'Produkty gotowe', 'Opakowania', 'Półprodukty', 'Inne'];
              categoriesChartData.datasets[0].data = categoriesView === 'value' 
                ? [120000, 85000, 45000, 30000, 15000]
                : [25, 30, 15, 10, 5];
            }
          } else {
            // Jeśli dane są niezgodne, użyj danych przykładowych
            categoriesChartData.labels = ['Surowce', 'Produkty gotowe', 'Opakowania', 'Półprodukty', 'Inne'];
            categoriesChartData.datasets[0].data = categoriesView === 'value' 
              ? [120000, 85000, 45000, 30000, 15000]
              : [25, 30, 15, 10, 5];
          }
        } else {
          // Jeśli nie ma poprawnej struktury danych, użyj danych przykładowych
          categoriesChartData.labels = ['Surowce', 'Produkty gotowe', 'Opakowania', 'Półprodukty', 'Inne'];
          categoriesChartData.datasets[0].data = categoriesView === 'value' 
            ? [120000, 85000, 45000, 30000, 15000]
            : [25, 30, 15, 10, 5];
        }

        // Nie używamy już funkcji validateChartData, ponieważ weryfikujemy dane podczas przypisania
        
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
  }, [timeRange, chartType, productionView, categoriesView, categoriesChartType, startDate, endDate]);

  const handleTimeRangeChange = (event) => {
    const newTimeRange = event.target.value;
    setTimeRange(newTimeRange);
    
    // Automatycznie ustaw odpowiednie daty dla predefiniowanych zakresów
    if (newTimeRange === 'week') {
      setStartDate(subWeeks(new Date(), 1));
      setEndDate(new Date());
    } else if (newTimeRange === 'month') {
      setStartDate(subMonths(new Date(), 1));
      setEndDate(new Date());
    } else if (newTimeRange === 'quarter') {
      setStartDate(subMonths(new Date(), 3));
      setEndDate(new Date());
    } else if (newTimeRange === 'year') {
      setStartDate(subMonths(new Date(), 12));
      setEndDate(new Date());
    }
  };
  
  const handleStartDateChange = (newDate) => {
    setStartDate(newDate);
    // Zresetuj błąd zakresu dat, sprawdzimy go przy pobieraniu danych
    setDateRangeError(false);
  };
  
  const handleEndDateChange = (newDate) => {
    setEndDate(newDate);
    // Zresetuj błąd zakresu dat, sprawdzimy go przy pobieraniu danych
    setDateRangeError(false);
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
            // Upewnij się, że nieprawidłowe etykiety nie są renderowane
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
            if (value === undefined || value === null || isNaN(value)) {
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
      <Box sx={{ mb: 4, display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'center' }, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 2, width: { xs: '100%', md: 'auto' } }}>
          <FormControl sx={{ minWidth: 180 }}>
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
          
          {timeRange === 'custom' && (
            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
              <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <DatePicker
                  label="Data początkowa"
                  value={startDate}
                  onChange={handleStartDateChange}
                  slotProps={{
                    textField: {
                      size: "small",
                      error: dateRangeError,
                      helperText: dateRangeError ? "Nieprawidłowy zakres" : null,
                      sx: { width: 150 }
                    }
                  }}
                />
                <Box sx={{ mx: 0.5 }}>-</Box>
                <DatePicker
                  label="Data końcowa"
                  value={endDate}
                  onChange={handleEndDateChange}
                  slotProps={{
                    textField: {
                      size: "small",
                      error: dateRangeError,
                      helperText: dateRangeError ? "Nieprawidłowy zakres" : null,
                      sx: { width: 150 }
                    }
                  }}
                />
              </Box>
            </LocalizationProvider>
          )}
        </Box>
        
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