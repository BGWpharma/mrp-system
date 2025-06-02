import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Container, 
  Typography, 
  Grid, 
  Card, 
  CardContent, 
  CardHeader, 
  Divider, 
  CircularProgress,
  Paper,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Chip,
  Alert,
  Tabs,
  Tab,
  Button,
  IconButton,
  Tooltip
} from '@mui/material';
import { 
  ShoppingCart as OrdersIcon,
  Inventory as InventoryIcon,
  Schedule as ProductionIcon,
  CheckCircle as CompletedIcon,
  Pending as PendingIcon,
  LocalShipping as ShippingIcon,
  Euro as EuroIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';

import { getKpiData } from '../../services/analyticsService';
import { getOrdersStats } from '../../services/orderService';
import { getTasksByStatus } from '../../services/productionService';
import { getAllPurchaseOrders } from '../../services/purchaseOrderService';
import { formatCurrency } from '../../utils/formatUtils';
import { formatTimestamp } from '../../utils/dateUtils';
import Charts from './Charts';

// ✅ OPTYMALIZACJA: Cache dla danych analitycznych
const analyticsCache = {
  data: null,
  timestamp: null,
  cacheTime: 5 * 60 * 1000, // 5 minut cache
  
  get: function(key) {
    if (!this.data || !this.timestamp) return null;
    if (Date.now() - this.timestamp > this.cacheTime) {
      this.clear();
      return null;
    }
    return this.data;
  },
  
  set: function(data) {
    this.data = data;
    this.timestamp = Date.now();
  },
  
  clear: function() {
    this.data = null;
    this.timestamp = null;
  },
  
  isExpired: function() {
    return !this.timestamp || Date.now() - this.timestamp > this.cacheTime;
  }
};

const Dashboard = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState({});
  const [recentOrders, setRecentOrders] = useState([]);
  const [activeTasks, setActiveTasks] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [activeTab, setActiveTab] = useState(0);
  
  const fetchData = async (forceRefresh = false) => {
    try {
      setLoading(true);
      setError(null);
      
      // ✅ OPTYMALIZACJA: Sprawdź cache jeśli nie wymuszamy odświeżenia
      if (!forceRefresh) {
        const cachedData = analyticsCache.get();
        if (cachedData) {
          console.log('✅ Ładowanie danych analitycznych z cache');
          setData(cachedData.kpiData || {});
          setActiveTasks(cachedData.tasks || []);
          setRecentOrders(cachedData.orderStats?.recentOrders || []);
          setPurchaseOrders(cachedData.poList || []);
          setLoading(false);
          return;
        }
      }
      
      console.log('🔄 Pobieranie świeżych danych analitycznych...');
      
      // Równoległe pobieranie danych
      const [kpiData, tasks, orderStats, poList] = await Promise.all([
        getKpiData(),
        getTasksByStatus('W trakcie'),
        getOrdersStats(),
        getAllPurchaseOrders()
      ]);
      
      const fetchedData = { kpiData, tasks, orderStats, poList };
      
      // Zapisz do cache
      analyticsCache.set(fetchedData);
      
      setData(kpiData);
      setActiveTasks(tasks || []);
      setRecentOrders(orderStats?.recentOrders || []);
      setPurchaseOrders(poList || []);
      
      console.log('✅ Dane analityczne zostały załadowane i zapisane w cache');
    } catch (err) {
      console.error('Błąd podczas ładowania danych analitycznych:', err);
      setError('Wystąpił błąd podczas ładowania danych. Spróbuj odświeżyć stronę.');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchData();
  }, []);
  
  const getStatusColor = (status) => {
    switch (status) {
      case 'Nowe': return 'info';
      case 'W realizacji': return 'warning';
      case 'Gotowe do wysyłki': return 'success';
      case 'Wysłane': return 'primary';
      case 'Dostarczone': return 'success';
      case 'Anulowane': return 'error';
      default: return 'default';
    }
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <CircularProgress />
      </Container>
    );
  }
  
  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      {/* ✅ OPTYMALIZACJA: Nagłówek z przyciskiem odświeżania */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Analityka
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            Podgląd kluczowych wskaźników działania systemu
            {analyticsCache.timestamp && (
              <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                Ostatnia aktualizacja: {new Date(analyticsCache.timestamp).toLocaleTimeString('pl-PL')}
              </Typography>
            )}
          </Typography>
        </Box>
        <Tooltip title={`Odśwież dane${analyticsCache.isExpired() ? ' (cache wygasł)' : ''}`}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => fetchData(true)}
            disabled={loading}
            color={analyticsCache.isExpired() ? 'warning' : 'primary'}
          >
            {loading ? 'Odświeżanie...' : 'Odśwież'}
          </Button>
        </Tooltip>
      </Box>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }}>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tab label="Statystyki" />
          <Tab label="Wykresy" />
        </Tabs>
      </Box>
      
      {activeTab === 0 ? (
        <>
          {/* Statystyki */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
                <CardHeader 
                  title="Sprzedaż" 
                  avatar={<OrdersIcon color="primary" />}
                  titleTypographyProps={{ variant: 'h6' }}
                />
                <Divider />
                <CardContent>
                  <Typography variant="h3" align="center" sx={{ mb: 2 }}>
                    {formatCurrency(data?.sales?.totalValue || 0)}
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 1.5, textAlign: 'center' }}>
                        <Typography variant="body2" color="textSecondary">Zamówienia</Typography>
                        <Typography variant="h6">{data?.sales?.totalOrders || 0}</Typography>
                      </Paper>
        </Grid>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 1.5, textAlign: 'center' }}>
                        <Typography variant="body2" color="textSecondary">W realizacji</Typography>
                        <Typography variant="h6">{data?.sales?.ordersInProgress || 0}</Typography>
                      </Paper>
        </Grid>
        </Grid>
                </CardContent>
              </Card>
      </Grid>
      
            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
            <CardHeader 
                  title="Magazyn" 
                  avatar={<InventoryIcon color="primary" />}
                  titleTypographyProps={{ variant: 'h6' }}
                />
                <Divider />
                <CardContent>
                  <Typography variant="h3" align="center" sx={{ mb: 2 }}>
                    {data?.inventory?.totalItems || 0}
                  </Typography>
                  <Paper sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="body2" color="textSecondary">Całkowita wartość</Typography>
                    <Typography variant="h6">{formatCurrency(data?.inventory?.totalValue || 0)}</Typography>
                  </Paper>
            </CardContent>
          </Card>
        </Grid>

            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
            <CardHeader 
                  title="Produkcja" 
                  avatar={<ProductionIcon color="primary" />}
                  titleTypographyProps={{ variant: 'h6' }}
                />
                <Divider />
                <CardContent>
                  <Typography variant="h3" align="center" sx={{ mb: 2 }}>
                    {data?.production?.tasksInProgress || 0}
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12}>
                      <Paper sx={{ p: 1.5, textAlign: 'center' }}>
                        <Typography variant="body2" color="textSecondary">Ukończone zadania</Typography>
                        <Typography variant="h6">{data?.production?.completedTasks || 0}</Typography>
                      </Paper>
                    </Grid>
                  </Grid>
            </CardContent>
          </Card>
        </Grid>
          </Grid>

          {/* Ostatnie zamówienia klientów */}
          <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
              <Card>
            <CardHeader 
                  title="Ostatnie zamówienia (CO)" 
                  titleTypographyProps={{ variant: 'h6' }}
                />
                <Divider />
                <CardContent sx={{ p: 0 }}>
                  {recentOrders.length > 0 ? (
                    <List sx={{ maxHeight: '300px', overflow: 'auto' }}>
                      {recentOrders.slice(0, 5).map((order) => (
                        <ListItem key={order.id} divider>
                          <ListItemIcon>
                            {order.status === 'Dostarczone' ? <CompletedIcon color="success" /> : 
                             order.status === 'Wysłane' ? <ShippingIcon color="primary" /> : 
                             <PendingIcon color="warning" />}
                          </ListItemIcon>
                          <ListItemText
                            primary={String(order.orderNumber || `Zamówienie ${order.id ? order.id.substring(0, 8) : ''}`)}
                            secondary={`${formatCurrency(order.totalValue || 0)} - ${formatTimestamp(order.date, false)}`}
                          />
                          <Chip
                            label={String(order.status || 'Brak statusu')}
                            color={getStatusColor(order.status)}
                            size="small"
                            sx={{ ml: 1 }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                      <Typography variant="body2" color="textSecondary">
                        Brak danych o zamówieniach klientów
                      </Typography>
              </Box>
                  )}
            </CardContent>
          </Card>
        </Grid>

            {/* Aktywne zadania produkcyjne */}
        <Grid item xs={12} md={6}>
              <Card>
            <CardHeader 
                  title="Aktywne zadania produkcyjne" 
                  titleTypographyProps={{ variant: 'h6' }}
                />
                <Divider />
                <CardContent sx={{ p: 0 }}>
                  {activeTasks.length > 0 ? (
                    <List sx={{ maxHeight: '300px', overflow: 'auto' }}>
                      {activeTasks.slice(0, 5).map((task) => (
                        <ListItem key={task.id} divider>
                          <ListItemIcon>
                            <ProductionIcon color="primary" />
                          </ListItemIcon>
                          <ListItemText
                            primary={task.name}
                            secondary={`${task.productName} - ${task.quantity} ${task.unit || 'szt.'}`}
                          />
                          <Chip
                            label="W trakcie"
                            color="warning"
                            size="small"
                            sx={{ ml: 1 }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                      <Typography variant="body2" color="textSecondary">
                        Brak aktywnych zadań produkcyjnych
                      </Typography>
              </Box>
                  )}
            </CardContent>
          </Card>
      </Grid>
      
            {/* Ostatnie zamówienia zakupowe */}
            <Grid item xs={12}>
              <Card>
                <CardHeader 
                  title="Zamówienia zakupowe (PO)" 
                  titleTypographyProps={{ variant: 'h6' }}
                />
                <Divider />
                <CardContent sx={{ p: 0 }}>
                  {purchaseOrders.length > 0 ? (
                    <List sx={{ maxHeight: '300px', overflow: 'auto' }}>
                      {purchaseOrders.slice(0, 5).map((po) => (
                        <ListItem key={po.id} divider>
                          <ListItemIcon>
                            <EuroIcon color="primary" />
                          </ListItemIcon>
                          <ListItemText
                            primary={String(po.number || `PO${po.id ? po.id.substring(0, 6).padStart(5, '0') : '00000'}`)}
                            secondary={`${formatCurrency(po.totalGross || po.totalValue || 0)} - ${formatTimestamp(po.date, false)}`}
                          />
                          <Chip
                            label={String(po.status || 'Brak statusu')}
                            color={getStatusColor(po.status)}
                            size="small"
                            sx={{ ml: 1 }}
                          />
                        </ListItem>
                      ))}
                    </List>
                  ) : (
                    <Box sx={{ p: 3, textAlign: 'center' }}>
                      <Typography variant="body2" color="textSecondary">
                        Brak danych o zamówieniach zakupowych
                      </Typography>
                    </Box>
                  )}
                </CardContent>
              </Card>
              </Grid>
          </Grid>
        </>
      ) : (
        <Charts />
      )}
    </Container>
  );
};

export default Dashboard; 