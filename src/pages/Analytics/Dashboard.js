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
import { useTranslation } from 'react-i18next';

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
  const { t, i18n } = useTranslation();
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
          console.log('✅ Loading analytics data from cache');
          setData(cachedData.kpiData || {});
          setActiveTasks(cachedData.tasks || []);
          setRecentOrders(cachedData.orderStats?.recentOrders || []);
          setPurchaseOrders(cachedData.poList || []);
          setLoading(false);
          return;
        }
      }
      
      console.log('🔄 Fetching fresh analytics data...');
      
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
      
      console.log('✅ Analytics data loaded and cached');
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
      case 'Zakończone': return 'success';
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
            {t('analytics.title')}
          </Typography>
          <Typography variant="subtitle1" color="text.secondary">
            {t('analytics.subtitle')}
            {analyticsCache.timestamp && (
              <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                {t('analytics.lastUpdate')}: {new Date(analyticsCache.timestamp).toLocaleTimeString(i18n.language)}
              </Typography>
            )}
          </Typography>
        </Box>
        <Tooltip title={`${t('analytics.refreshData')}${analyticsCache.isExpired() ? t('analytics.cacheExpired') : ''}`}>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={() => fetchData(true)}
            disabled={loading}
            color={analyticsCache.isExpired() ? 'warning' : 'primary'}
          >
            {loading ? t('analytics.refreshing') : t('analytics.refresh')}
          </Button>
        </Tooltip>
      </Box>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 4 }}>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tab label={t('analytics.tabs.statistics')} />
          <Tab label={t('analytics.tabs.charts')} />
        </Tabs>
      </Box>
      
      {activeTab === 0 ? (
        <>
          {/* Statystyki */}
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
                <CardHeader 
                  title={t('analytics.cards.sales.title')} 
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
                        <Typography variant="body2" color="textSecondary">{t('analytics.cards.sales.orders')}</Typography>
                        <Typography variant="h6">{data?.sales?.totalOrders || 0}</Typography>
                      </Paper>
        </Grid>
                    <Grid item xs={6}>
                      <Paper sx={{ p: 1.5, textAlign: 'center' }}>
                        <Typography variant="body2" color="textSecondary">{t('analytics.cards.sales.inProgress')}</Typography>
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
                  title={t('analytics.cards.inventory.title')} 
                  avatar={<InventoryIcon color="primary" />}
                  titleTypographyProps={{ variant: 'h6' }}
                />
                <Divider />
                <CardContent>
                  <Typography variant="h3" align="center" sx={{ mb: 2 }}>
                    {data?.inventory?.totalItems || 0}
                  </Typography>
                  <Paper sx={{ p: 1.5, textAlign: 'center' }}>
                    <Typography variant="body2" color="textSecondary">{t('analytics.cards.inventory.totalValue')}</Typography>
                    <Typography variant="h6">{formatCurrency(data?.inventory?.totalValue || 0)}</Typography>
                  </Paper>
            </CardContent>
          </Card>
        </Grid>

            <Grid item xs={12} md={4}>
              <Card sx={{ height: '100%' }}>
            <CardHeader 
                  title={t('analytics.cards.production.title')} 
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
                        <Typography variant="body2" color="textSecondary">{t('analytics.cards.production.completedTasks')}</Typography>
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
                  title={t('analytics.sections.recentOrders.title')} 
                  titleTypographyProps={{ variant: 'h6' }}
                />
                <Divider />
                <CardContent sx={{ p: 0 }}>
                  {recentOrders.length > 0 ? (
                    <List sx={{ maxHeight: '300px', overflow: 'auto' }}>
                      {recentOrders.slice(0, 5).map((order) => (
                        <ListItem key={order.id} divider>
                          <ListItemIcon>
                                          {order.status === 'Zakończone' ? <CompletedIcon color="success" /> : 
                             <PendingIcon color="warning" />}
                          </ListItemIcon>
                          <ListItemText
                            primary={String(order.orderNumber || `${t('analytics.sections.recentOrders.orderPrefix')} ${order.id ? order.id.substring(0, 8) : ''}`)}
                            secondary={`${formatCurrency(order.totalValue || 0)} - ${formatTimestamp(order.date, false)}`}
                          />
                          <Chip
                            label={String(order.status || t('analytics.status.noStatus'))}
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
                        {t('analytics.sections.recentOrders.noData')}
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
                  title={t('analytics.sections.activeTasks.title')} 
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
                            label={t('analytics.sections.activeTasks.inProgress')}
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
                        {t('analytics.sections.activeTasks.noData')}
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
                  title={t('analytics.sections.purchaseOrders.title')} 
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
                            label={String(po.status || t('analytics.status.noStatus'))}
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
                        {t('analytics.sections.purchaseOrders.noData')}
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