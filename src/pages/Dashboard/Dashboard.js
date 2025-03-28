// src/pages/Dashboard/Dashboard.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Container, 
  Grid, 
  Paper, 
  Typography, 
  Box, 
  Button, 
  Card, 
  CardContent, 
  CardActions,
  List,
  ListItem,
  ListItemText,
  Divider,
  Chip,
  LinearProgress,
  Icon
} from '@mui/material';
import {
  MenuBook as RecipesIcon,
  Schedule as ProductionIcon,
  Inventory as InventoryIcon,
  VerifiedUser as QualityIcon,
  ShoppingCart as OrdersIcon,
  Add as AddIcon,
  InsertChart as AnalyticsIcon,
  ArrowUpward as ArrowUpIcon,
  ArrowDownward as ArrowDownIcon,
  Timeline as TimelineIcon
} from '@mui/icons-material';
import { getTasksByStatus } from '../../services/productionService';
import { getAllRecipes } from '../../services/recipeService';
import { getOrdersStats } from '../../services/orderService';
import { getKpiData } from '../../services/analyticsService';
import { useAuth } from '../../hooks/useAuth';
import { formatDate } from '../../utils/formatters';
import { formatCurrency } from '../../utils/formatUtils';
import { formatTimestamp } from '../../utils/dateUtils';

const Dashboard = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [orderStats, setOrderStats] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Pobierz zadania produkcyjne w trakcie
        console.log('Próba pobrania zadań w trakcie...');
        const tasksInProgress = await getTasksByStatus('W trakcie');
        console.log('Zadania produkcyjne w trakcie:', tasksInProgress);
        
        // Jeśli nie ma zadań w trakcie, sprawdź inne statusy, aby zweryfikować połączenie z bazą
        if (!tasksInProgress || tasksInProgress.length === 0) {
          console.log('Brak zadań w trakcie, sprawdzam zadania zaplanowane...');
          const plannedTasks = await getTasksByStatus('Zaplanowane');
          console.log('Zadania zaplanowane:', plannedTasks);
          
          // Jeśli są zadania o innym statusie, ale nie ma w trakcie
          if (plannedTasks && plannedTasks.length > 0) {
            console.log('Znaleziono zadania zaplanowane, ale brak zadań w trakcie');
            setTasks([]); // Pusto, bo nie ma zadań w trakcie
          } else {
            console.log('Brak jakichkolwiek zadań produkcyjnych w bazie');
            setTasks([]);
          }
        } else {
          // Ustaw znalezione zadania w trakcie
          console.log(`Ustawiam ${tasksInProgress.length} zadań w trakcie`);
          setTasks(tasksInProgress);
        }
        
        // Pobierz ostatnie receptury
        const allRecipes = await getAllRecipes();
        console.log('Wszystkie receptury:', allRecipes);
        setRecipes(allRecipes ? allRecipes.slice(0, 5) : []); // Tylko 5 najnowszych
        
        // Pobierz statystyki zamówień
        const stats = await getOrdersStats();
        console.log('Statystyki zamówień:', stats);
        setOrderStats(stats || null);
        
        // Pobierz dane analityczne
        const kpiData = await getKpiData();
        console.log('Dane KPI:', kpiData);
        setAnalyticsData(kpiData || null);
      } catch (error) {
        console.error('Błąd podczas pobierania danych dashboardu:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  if (loading) {
    return <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>Ładowanie danych...</Container>;
  }

  // Mapowanie statusów zamówień na kolory
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

  // Dane dla wykresów statystyk
  const mockData = {
    salesTrend: 8.6,
    accountsGrowth: 23.7,
    inventoryUtilization: 78,
    productionEfficiency: 68,
    ordersTrend: -5.2
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      <Typography variant="subtitle1" sx={{ mb: 4 }}>
        Witaj, {currentUser.displayName || currentUser.email}
      </Typography>

      <Grid container spacing={3}>
        {/* Główne karty KPI */}
        <Grid item xs={12} md={3}>
          <Card sx={{ borderRadius: 2, boxShadow: 3 }}>
            <CardContent sx={{ textAlign: 'center', p: 3 }}>
              <RecipesIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Receptury</Typography>
              <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                {recipes?.length || 0}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {mockData.salesTrend > 0 ? (
                  <ArrowUpIcon sx={{ color: 'success.main', fontSize: 16 }} />
                ) : (
                  <ArrowDownIcon sx={{ color: 'error.main', fontSize: 16 }} />
                )}
                <Typography 
                  variant="body2" 
                  color={mockData.salesTrend > 0 ? 'success.main' : 'error.main'}
                  sx={{ mr: 1 }}
                >
                  {Math.abs(mockData.salesTrend)}%
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Zarządzaj recepturami i składnikami
                </Typography>
              </Box>
              {/* Tło stylizowane na wykres */}
              <Box sx={{ position: 'relative', mt: 2 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={mockData.inventoryUtilization} 
                  sx={{ 
                    height: 8, 
                    borderRadius: 4, 
                    backgroundColor: 'rgba(0,230,130,0.1)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: 'success.main'
                    }
                  }} 
                />
              </Box>
            </CardContent>
            <CardActions sx={{ p: 2, pt: 0, justifyContent: 'space-between' }}>
              <Button component={Link} to="/recipes" sx={{ flexGrow: 1 }}>
                Przejdź
              </Button>
              <Button 
                component={Link} 
                to="/recipes/new" 
                color="primary"
                variant="contained"
                sx={{ flexGrow: 1 }}
                startIcon={<AddIcon />}
              >
                Nowa
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ borderRadius: 2, boxShadow: 3 }}>
            <CardContent sx={{ textAlign: 'center', p: 3 }}>
              <ProductionIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Produkcja</Typography>
              <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                {tasks?.length || 0} aktywnych zadań
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Planuj i zarządzaj produkcją
                </Typography>
              </Box>
              {/* Tło stylizowane na wykres */}
              <Box sx={{ position: 'relative', mt: 2 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={mockData.productionEfficiency} 
                  sx={{ 
                    height: 8, 
                    borderRadius: 4, 
                    backgroundColor: 'rgba(33,150,243,0.1)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: 'primary.main'
                    }
                  }} 
                />
              </Box>
            </CardContent>
            <CardActions sx={{ p: 2, pt: 0, justifyContent: 'space-between' }}>
              <Button component={Link} to="/production" sx={{ flexGrow: 1 }}>
                Przejdź
              </Button>
              <Button 
                component={Link} 
                to="/production/new-task" 
                color="primary"
                variant="contained"
                sx={{ flexGrow: 1 }}
                startIcon={<AddIcon />}
              >
                Nowe
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ borderRadius: 2, boxShadow: 3 }}>
            <CardContent sx={{ textAlign: 'center', p: 3 }}>
              <InventoryIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Magazyn</Typography>
              <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                {analyticsData?.inventory?.totalItems || 0} produktów
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {mockData.accountsGrowth > 0 ? (
                  <ArrowUpIcon sx={{ color: 'success.main', fontSize: 16 }} />
                ) : (
                  <ArrowDownIcon sx={{ color: 'error.main', fontSize: 16 }} />
                )}
                <Typography 
                  variant="body2" 
                  color={mockData.accountsGrowth > 0 ? 'success.main' : 'error.main'}
                  sx={{ mr: 1 }}
                >
                  {Math.abs(mockData.accountsGrowth)}%
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Zarządzaj stanami magazynowymi
                </Typography>
              </Box>
              {/* Tło stylizowane na wykres */}
              <Box sx={{ position: 'relative', mt: 2 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={85} 
                  sx={{ 
                    height: 8, 
                    borderRadius: 4, 
                    backgroundColor: 'rgba(255,152,0,0.1)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: 'warning.main'
                    }
                  }} 
                />
              </Box>
            </CardContent>
            <CardActions sx={{ p: 2, pt: 0, justifyContent: 'space-between' }}>
              <Button component={Link} to="/inventory" sx={{ flexGrow: 1 }}>
                Przejdź
              </Button>
              <Button 
                component={Link} 
                to="/inventory/new" 
                color="primary"
                variant="contained"
                sx={{ flexGrow: 1 }}
                startIcon={<AddIcon />}
              >
                Przyjmij
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ borderRadius: 2, boxShadow: 3 }}>
            <CardContent sx={{ textAlign: 'center', p: 3 }}>
              <QualityIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Raporty</Typography>
              <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                Analizy i zestawienia
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Przeglądaj raporty i analizy
                </Typography>
              </Box>
              {/* Tło stylizowane na wykres */}
              <Box sx={{ position: 'relative', mt: 2 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={55} 
                  sx={{ 
                    height: 8, 
                    borderRadius: 4, 
                    backgroundColor: 'rgba(233,30,99,0.1)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: 'secondary.main'
                    }
                  }} 
                />
              </Box>
            </CardContent>
            <CardActions sx={{ p: 2, pt: 0, justifyContent: 'space-between' }}>
              <Button component={Link} to="/quality" sx={{ flexGrow: 1 }}>
                Przejdź
              </Button>
              <Button 
                component={Link} 
                to="/quality/new-test" 
                color="primary"
                variant="contained"
                sx={{ flexGrow: 1 }}
                startIcon={<AddIcon />}
              >
                Nowy test
              </Button>
            </CardActions>
          </Card>
        </Grid>
        
        {/* Zamówienia */}
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 2, boxShadow: 3 }}>
            <CardContent sx={{ textAlign: 'center', p: 3 }}>
              <OrdersIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Zamówienia klientów</Typography>
              <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                {orderStats?.total || 0} zamówień ({formatCurrency(orderStats?.totalValue || 0)})
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {mockData.ordersTrend > 0 ? (
                  <ArrowUpIcon sx={{ color: 'success.main', fontSize: 16 }} />
                ) : (
                  <ArrowDownIcon sx={{ color: 'error.main', fontSize: 16 }} />
                )}
                <Typography 
                  variant="body2" 
                  color={mockData.ordersTrend > 0 ? 'success.main' : 'error.main'}
                  sx={{ mr: 1 }}
                >
                  {Math.abs(mockData.ordersTrend)}%
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Zarządzaj zamówieniami klientów
                </Typography>
              </Box>
              
              {/* Tło stylizowane na wykres */}
              <Box sx={{ position: 'relative', mt: 2 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={64} 
                  sx={{ 
                    height: 8, 
                    borderRadius: 4, 
                    backgroundColor: 'rgba(76,175,80,0.1)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: 'success.main'
                    }
                  }} 
                />
              </Box>
              
              {orderStats?.recentOrders && orderStats.recentOrders.length > 0 && (
                <Box sx={{ mt: 3, textAlign: 'left' }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Ostatnie zamówienia:
                  </Typography>
                  <List sx={{ maxHeight: '150px', overflow: 'auto' }}>
                    {orderStats.recentOrders.slice(0, 3).map((order) => (
                      <ListItem key={order.id} sx={{ py: 0.5 }}>
                        <ListItemText
                          primary={order.customer}
                          secondary={`${formatCurrency(order.value)} - ${formatTimestamp(order.date, false)}`}
                          primaryTypographyProps={{ variant: 'body2' }}
                          secondaryTypographyProps={{ variant: 'caption' }}
                        />
                        <Chip
                          label={order.status}
                          color={getStatusColor(order.status)}
                          size="small"
                          sx={{ ml: 1 }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </CardContent>
            <CardActions sx={{ p: 2, pt: 0, justifyContent: 'space-between' }}>
              <Button component={Link} to="/orders" sx={{ flexGrow: 1 }}>
                Przejdź
              </Button>
              <Button 
                component={Link} 
                to="/orders/new" 
                color="primary"
                variant="contained"
                sx={{ flexGrow: 1 }}
                startIcon={<AddIcon />}
              >
                Nowe
              </Button>
            </CardActions>
          </Card>
        </Grid>
        
        {/* Analizy i Raporty */}
        <Grid item xs={12} md={6}>
          <Card sx={{ borderRadius: 2, boxShadow: 3 }}>
            <CardContent sx={{ textAlign: 'center', p: 3 }}>
              <AnalyticsIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Analizy i Raporty</Typography>
              <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                Szczegółowa analityka biznesowa
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Panel analityczny i raporty
                </Typography>
              </Box>
              
              {/* Tło stylizowane na wykres */}
              <Box sx={{ position: 'relative', mt: 2 }}>
                <LinearProgress 
                  variant="determinate" 
                  value={78} 
                  sx={{ 
                    height: 8, 
                    borderRadius: 4, 
                    backgroundColor: 'rgba(156,39,176,0.1)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: 'secondary.dark'
                    }
                  }} 
                />
              </Box>
              
              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'space-around' }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h6" color="primary.main">
                    {analyticsData?.production?.tasksInProgress || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    W trakcie
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h6" color="success.main">
                    {analyticsData?.production?.completedTasks || 2}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Ukończone
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h6" color="info.main">
                    {analyticsData?.production?.efficiency || 0}%
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Wydajność
                  </Typography>
                </Box>
              </Box>
            </CardContent>
            <CardActions sx={{ p: 2, pt: 0, justifyContent: 'center' }}>
              <Button 
                component={Link} 
                to="/analytics" 
                fullWidth
                variant="contained"
                color="primary"
              >
                Przejdź do analiz
              </Button>
            </CardActions>
          </Card>
        </Grid>
        
        {/* Zadania produkcyjne w trakcie */}
        <Grid item xs={12}>
          <Card sx={{ borderRadius: 2, boxShadow: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Zadania produkcyjne w trakcie
                </Typography>
                <Button 
                  component={Link} 
                  to="/production"
                  variant="outlined"
                  size="small"
                >
                  Zobacz wszystkie
                </Button>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'primary.light', borderRadius: 2, color: 'white' }}>
                    <Typography variant="h3" sx={{ mb: 1 }}>
                      {analyticsData?.production?.tasksInProgress || 0}
                    </Typography>
                    <Typography variant="body1">
                      W trakcie
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'success.light', borderRadius: 2, color: 'white' }}>
                    <Typography variant="h3" sx={{ mb: 1 }}>
                      {analyticsData?.production?.completedTasks || 2}
                    </Typography>
                    <Typography variant="body1">
                      Ukończone
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'info.light', borderRadius: 2, color: 'white' }}>
                    <Typography variant="h3" sx={{ mb: 1 }}>
                      0%
                    </Typography>
                    <Typography variant="body1">
                      Wydajność
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
              
              {tasks && tasks.length > 0 ? (
                <Box sx={{ mt: 3 }}>
                  <List sx={{ bgcolor: 'background.paper', borderRadius: 2 }}>
                    {tasks.map((task) => (
                      <ListItem 
                        key={task.id} 
                        button 
                        component={Link} 
                        to={`/production/tasks/${task.id}`}
                        sx={{ 
                          borderBottom: '1px solid', 
                          borderColor: 'divider',
                          '&:last-child': { borderBottom: 'none' }
                        }}
                      >
                        <ListItemText
                          primary={task.name}
                          secondary={`${task.productName} - ${task.quantity} ${task.unit}`}
                        />
                        <Chip 
                          label="W trakcie" 
                          color="warning" 
                          size="small" 
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              ) : (
                <Box sx={{ mt: 3, p: 3, textAlign: 'center', bgcolor: 'background.paper', borderRadius: 2 }}>
                  <Typography variant="body1" color="text.secondary">
                    Brak aktywnych zadań produkcyjnych
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Dashboard;