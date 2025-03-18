import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Container, 
  Typography, 
  Paper, 
  Grid, 
  CircularProgress,
  Button, 
  IconButton, 
  Menu,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControlLabel,
  Switch,
  Divider,
  Select,
  InputLabel,
  FormControl,
  Tooltip,
  Card,
  CardHeader,
  CardContent
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { 
  Refresh as RefreshIcon,
  Settings as SettingsIcon,
  Add as AddIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { getKpiData, getChartData, getDashboardConfig, saveDashboardConfig } from '../../services/analyticsService';
import KpiCard from './components/KpiCard';
import SalesChart from './components/SalesChart';
import InventoryChart from './components/InventoryChart';
import ProductionChart from './components/ProductionChart';
import QualityChart from './components/QualityChart';

// Komponent siatki responsywnej
const ResponsiveGridLayout = WidthProvider(Responsive);

const Dashboard = () => {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [kpiData, setKpiData] = useState(null);
  const [dashboardConfig, setDashboardConfig] = useState(null);
  const [chartData, setChartData] = useState({});
  const [timeFrame, setTimeFrame] = useState('month');
  
  // Stan dla menu ustawień
  const [settingsAnchorEl, setSettingsAnchorEl] = useState(null);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [addWidgetDialogOpen, setAddWidgetDialogOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  
  // Pobieranie danych przy ładowaniu komponentu
  useEffect(() => {
    loadDashboardData();
  }, []);
  
  // Ładowanie danych dashboardu
  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Pobieranie konfiguracji dashboardu
      const config = await getDashboardConfig('current-user-id'); // Zastąp faktycznym ID użytkownika
      setDashboardConfig(config);
      
      // Pobieranie danych KPI
      const kpi = await getKpiData();
      setKpiData(kpi);
      
      // Pobieranie danych do wykresów
      await loadChartData(config);
      
      setLoading(false);
    } catch (err) {
      console.error('Błąd podczas ładowania danych dashboardu:', err);
      setError('Wystąpił błąd podczas ładowania danych. Spróbuj odświeżyć stronę.');
      setLoading(false);
    }
  };
  
  // Pobieranie danych do wykresów na podstawie konfiguracji
  const loadChartData = async (config) => {
    const chartDataObj = {};
    
    try {
      // Ładowanie domyślnych danych dla statycznych wykresów
      chartDataObj['sales-timeline'] = await getChartData('sales', timeFrame);
      chartDataObj['inventory-status'] = await getChartData('inventory', timeFrame);
      chartDataObj['production-efficiency'] = await getChartData('production', timeFrame);
      chartDataObj['quality-metrics'] = await getChartData('quality', timeFrame);
      
      // Jeśli mamy konfigurację, ładujemy dane dla wszystkich zdefiniowanych widgetów
      if (config && config.widgets) {
        // Obsługa konfiguracji jako tablicy
        if (Array.isArray(config.widgets)) {
          const chartWidgets = config.widgets.filter(widget => widget.type === 'chart' && widget.visible);
          
          for (const widget of chartWidgets) {
            try {
              const data = await getChartData(widget.dataSource, timeFrame);
              chartDataObj[widget.id] = data;
            } catch (err) {
              console.error(`Błąd podczas pobierania danych dla wykresu ${widget.id}:`, err);
            }
          }
        } 
        // Obsługa konfiguracji jako obiektu
        else if (typeof config.widgets === 'object') {
          for (const widgetId in config.widgets) {
            const widget = config.widgets[widgetId];
            if (widget.type === 'chart' && widget.visible) {
              try {
                const data = await getChartData(widget.dataSource, timeFrame);
                chartDataObj[widgetId] = data;
              } catch (err) {
                console.error(`Błąd podczas pobierania danych dla wykresu ${widgetId}:`, err);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Błąd podczas ładowania danych dla wykresów:', err);
    }
    
    setChartData(chartDataObj);
  };
  
  // Obsługa zmiany układu
  const handleLayoutChange = (layout) => {
    if (editMode && dashboardConfig) {
      const newConfig = { ...dashboardConfig };
      newConfig.layout = layout;
      setDashboardConfig(newConfig);
    }
  };
  
  // Zapisywanie konfiguracji
  const saveConfig = async () => {
    try {
      await saveDashboardConfig('current-user-id', dashboardConfig);
      setEditMode(false);
      setConfigDialogOpen(false);
    } catch (err) {
      console.error('Błąd podczas zapisywania konfiguracji:', err);
      setError('Wystąpił błąd podczas zapisywania konfiguracji.');
    }
  };
  
  // Obsługa menu ustawień
  const handleSettingsClick = (event) => {
    setSettingsAnchorEl(event.currentTarget);
  };
  
  const handleSettingsClose = () => {
    setSettingsAnchorEl(null);
  };
  
  const handleEditModeToggle = () => {
    setEditMode(!editMode);
    handleSettingsClose();
  };
  
  const handleConfigDialogOpen = () => {
    setConfigDialogOpen(true);
    handleSettingsClose();
  };
  
  const handleAddWidget = () => {
    setAddWidgetDialogOpen(true);
    handleSettingsClose();
  };
  
  // Zmiana widoczności widżetu
  const handleWidgetVisibilityChange = (id, visible) => {
    const newConfig = { ...dashboardConfig };
    const widgetIndex = newConfig.widgets.findIndex(widget => widget.id === id);
    
    if (widgetIndex !== -1) {
      newConfig.widgets[widgetIndex].visible = visible;
      setDashboardConfig(newConfig);
    }
  };
  
  // Renderowanie widżetów
  const renderWidget = (widget) => {
    if (!widget) return null;
    if (!widget.visible) return null;
    
    switch (widget.type) {
      case 'kpi':
        // Renderowanie odpowiedniego komponentu KPI na podstawie ID widżetu
        switch (widget.id) {
          case 'sales':
            return <KpiCard title="Sprzedaż" data={kpiData?.sales} type="sales" />;
          case 'inventory':
            return <KpiCard title="Magazyn" data={kpiData?.inventory} type="inventory" />;
          case 'production':
            return <KpiCard title="Produkcja" data={kpiData?.production} type="production" />;
          case 'quality':
            return <KpiCard title="Raporty" data={kpiData?.quality} type="quality" />;
          default:
            return <Typography>Nieznany widżet KPI</Typography>;
        }
      
      case 'chart':
        // Renderowanie odpowiedniego komponentu wykresu na podstawie dataSource widżetu
        switch (widget.dataSource) {
          case 'sales':
            return <SalesChart 
                    title={widget.title || "Sprzedaż w czasie"} 
                    data={chartData[widget.id] || chartData['sales-timeline'] || []} 
                    chartType={widget.chartType || 'line'} 
                   />;
          case 'inventory':
            return <InventoryChart 
                    title={widget.title || "Stany magazynowe"} 
                    data={chartData[widget.id] || chartData['inventory-status'] || []} 
                   />;
          case 'production':
            return <ProductionChart 
                    title={widget.title || "Efektywność produkcji"} 
                    data={chartData[widget.id] || chartData['production-efficiency'] || []} 
                    chartType={widget.chartType || 'bar'} 
                   />;
          case 'quality':
            return <QualityChart 
                    title={widget.title || "Wskaźniki jakości"} 
                    data={chartData[widget.id] || chartData['quality-metrics'] || []} 
                    chartType={widget.chartType || 'line'} 
                   />;
          default:
            return <Typography>Nieznany typ wykresu</Typography>;
        }
      
      default:
        return <Typography>Nieznany typ widżetu</Typography>;
    }
  };
  
  // Sprawdza, czy w konfiguracji istnieją karty KPI
  const hasKpiWidgetsInConfig = () => {
    if (!dashboardConfig || !dashboardConfig.widgets) return false;
    
    if (Array.isArray(dashboardConfig.widgets)) {
      return dashboardConfig.widgets.some(widget => widget.type === 'kpi' && widget.visible);
    } else {
      return Object.values(dashboardConfig.widgets).some(widget => widget.type === 'kpi' && widget.visible);
    }
  };

  // Sprawdza, czy konfiguracja zawiera jakiekolwiek widżety wykresu
  const hasChartWidgetsInConfig = () => {
    if (!dashboardConfig || !dashboardConfig.widgets) return false;
    
    if (Array.isArray(dashboardConfig.widgets)) {
      return dashboardConfig.widgets.some(widget => widget.type === 'chart' && widget.visible);
    } else {
      return Object.values(dashboardConfig.widgets).some(widget => widget.type === 'chart' && widget.visible);
    }
  };
  
  // Jeśli dane są ładowane, wyświetl spinner
  if (loading) {
    return (
      <Container>
        <Box 
          display="flex" 
          justifyContent="center" 
          alignItems="center"
          minHeight="80vh"
        >
          <CircularProgress />
          <Typography variant="h6" ml={2}>
            Ładowanie danych dashboardu...
          </Typography>
        </Box>
      </Container>
    );
  }
  
  // Jeśli wystąpił błąd, wyświetl komunikat o błędzie
  if (error) {
    return (
      <Container>
        <Box mt={4}>
          <Paper sx={{ p: 3, backgroundColor: theme.palette.error.light }}>
            <Typography variant="h6" color="error">
              {error}
            </Typography>
            <Button 
              variant="contained" 
              onClick={loadDashboardData} 
              sx={{ mt: 2 }}
            >
              Spróbuj ponownie
            </Button>
          </Paper>
        </Box>
      </Container>
    );
  }
  
  // Jeśli brak konfiguracji lub danych, wyświetl komunikat
  if (!dashboardConfig || !kpiData) {
    return (
      <Container>
        <Box mt={4}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6">
              Brak danych do wyświetlenia.
            </Typography>
            <Button 
              variant="contained" 
              onClick={loadDashboardData} 
              sx={{ mt: 2 }}
            >
              Odśwież
            </Button>
          </Paper>
        </Box>
      </Container>
    );
  }
  
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        Dashboard analityczny
      </Typography>
      <Typography variant="body1" color="textSecondary" sx={{ mb: 2 }}>
        {editMode ? 
          'Tryb edycji: przeciągnij widgety, aby zmienić ich położenie' : 
          'Przegląd kluczowych wskaźników i analiz biznesowych'
        }
      </Typography>
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Box>
          <FormControl sx={{ minWidth: 180, mr: 2 }}>
            <InputLabel id="timeframe-select-label">Okres czasu</InputLabel>
            <Select
              labelId="timeframe-select-label"
              id="timeframe-select"
              value={timeFrame}
              label="Okres czasu"
              onChange={(e) => setTimeFrame(e.target.value)}
              size="small"
            >
              <MenuItem value="week">Ostatni tydzień</MenuItem>
              <MenuItem value="month">Ostatni miesiąc</MenuItem>
              <MenuItem value="quarter">Ostatni kwartał</MenuItem>
              <MenuItem value="year">Ostatni rok</MenuItem>
            </Select>
          </FormControl>
        </Box>
        
        <Box>
          <Tooltip title="Odśwież dane">
            <IconButton onClick={loadDashboardData} sx={{ mr: 1 }}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Ustawienia dashboardu">
            <IconButton onClick={handleSettingsClick}>
              <SettingsIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      
      {/* Karty KPI w układzie siatki */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} sm={6} md={3}>
          <KpiCard title="Sprzedaż" data={kpiData?.sales} type="sales" />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <KpiCard title="Magazyn" data={kpiData?.inventory} type="inventory" />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <KpiCard title="Produkcja" data={kpiData?.production} type="production" />
        </Grid>
        <Grid item xs={6} sm={6} md={3}>
          <KpiCard title="Raporty" data={kpiData?.quality} type="quality" />
        </Grid>
      </Grid>
      
      {/* Widgety wykresów */}
      <Grid container spacing={2} sx={{ mt: 2 }}>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%', minHeight: 300 }}>
            <CardHeader 
              title={
                <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                  Sprzedaż w czasie
                </Typography>
              } 
              sx={{ pb: 0 }}
            />
            <CardContent sx={{ height: 'calc(100% - 60px)' }}>
              <Box sx={{ height: '100%', minHeight: 240 }}>
                <SalesChart 
                  data={chartData['sales-timeline'] || []} 
                  chartType="line"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%', minHeight: 300 }}>
            <CardHeader 
              title={
                <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                  Stany magazynowe
                </Typography>
              } 
              sx={{ pb: 0 }}
            />
            <CardContent sx={{ height: 'calc(100% - 60px)' }}>
              <Box sx={{ height: '100%', minHeight: 240 }}>
                <InventoryChart 
                  data={chartData['inventory-status'] || []}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%', minHeight: 300 }}>
            <CardHeader 
              title={
                <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                  Efektywność produkcji
                </Typography>
              } 
              sx={{ pb: 0 }}
            />
            <CardContent sx={{ height: 'calc(100% - 60px)' }}>
              <Box sx={{ height: '100%', minHeight: 240 }}>
                <ProductionChart 
                  data={chartData['production-efficiency'] || []} 
                  chartType="bar"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card sx={{ height: '100%', minHeight: 300 }}>
            <CardHeader 
              title={
                <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                  Wskaźniki jakości
                </Typography>
              } 
              sx={{ pb: 0 }}
            />
            <CardContent sx={{ height: 'calc(100% - 60px)' }}>
              <Box sx={{ height: '100%', minHeight: 240 }}>
                <QualityChart 
                  data={chartData['quality-metrics'] || []} 
                  chartType="line"
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      
      {/* Dialog konfiguracji widżetów */}
      <Dialog
        open={configDialogOpen}
        onClose={() => setConfigDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Konfiguracja dashboardu
          <IconButton
            onClick={() => setConfigDialogOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="h6" gutterBottom>
            Widoczność widżetów
          </Typography>
          <Grid container spacing={2}>
            {dashboardConfig?.widgets.map((widget) => (
              <Grid item xs={12} sm={6} key={widget.id}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={widget.visible}
                      onChange={(e) => handleWidgetVisibilityChange(widget.id, e.target.checked)}
                      name={`widget-${widget.id}`}
                    />
                  }
                  label={widget.title}
                />
              </Grid>
            ))}
          </Grid>
          
          <Divider sx={{ my: 3 }} />
          
          <Typography variant="h6" gutterBottom>
            Układ dashboardu
          </Typography>
          <Typography variant="body2" color="textSecondary">
            Aby zmienić układ dashboardu, włącz tryb edycji i przeciągnij widżety.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfigDialogOpen(false)}>Anuluj</Button>
          <Button onClick={saveConfig} variant="contained" color="primary">
            Zapisz zmiany
          </Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog dodawania widżetu */}
      <Dialog
        open={addWidgetDialogOpen}
        onClose={() => setAddWidgetDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Dodaj nowy widżet
          <IconButton
            onClick={() => setAddWidgetDialogOpen(false)}
            sx={{ position: 'absolute', right: 8, top: 8 }}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" gutterBottom>
            Funkcja dodawania nowych widżetów będzie dostępna w przyszłych wersjach aplikacji.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddWidgetDialogOpen(false)}>Zamknij</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Dashboard; 