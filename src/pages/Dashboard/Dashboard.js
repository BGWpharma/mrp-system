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
  Icon,
  CircularProgress
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
  Timeline as TimelineIcon,
  Storage as WarehouseIcon,
  Business as WorkstationIcon
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
  const [tasksLoading, setTasksLoading] = useState(true);
  const [recipesLoading, setRecipesLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [orderStats, setOrderStats] = useState(null);
  const [analyticsData, setAnalyticsData] = useState(null);

  useEffect(() => {
    // Pobieranie zadań produkcyjnych
    const fetchTasks = async () => {
      try {
        setTasksLoading(true);
        console.log('Próba pobrania zadań w trakcie...');
        const tasksInProgress = await getTasksByStatus('W trakcie');
        
        if (!tasksInProgress || tasksInProgress.length === 0) {
          console.log('Brak zadań w trakcie, sprawdzam zadania zaplanowane...');
          const plannedTasks = await getTasksByStatus('Zaplanowane');
          
          if (plannedTasks && plannedTasks.length > 0) {
            console.log('Znaleziono zadania zaplanowane, ale brak zadań w trakcie');
            setTasks([]); 
          } else {
            console.log('Brak jakichkolwiek zadań produkcyjnych w bazie');
            setTasks([]);
          }
        } else {
          console.log(`Ustawiam ${tasksInProgress.length} zadań w trakcie`);
          setTasks(tasksInProgress);
        }
      } catch (error) {
        console.error('Błąd podczas pobierania zadań:', error);
        setTasks([]);
      } finally {
        setTasksLoading(false);
      }
    };
    
    // Pobieranie receptur
    const fetchRecipes = async () => {
      try {
        setRecipesLoading(true);
        const allRecipes = await getAllRecipes();
        console.log('Wszystkie receptury:', allRecipes);
        setRecipes(allRecipes ? allRecipes.slice(0, 5) : []);
      } catch (error) {
        console.error('Błąd podczas pobierania receptur:', error);
        setRecipes([]);
      } finally {
        setRecipesLoading(false);
      }
    };
    
    // Pobieranie statystyk zamówień
    const fetchOrderStats = async () => {
      try {
        setOrdersLoading(true);
        const stats = await getOrdersStats(true);
        console.log('Statystyki zamówień:', stats);
        setOrderStats(stats || null);
      } catch (error) {
        console.error('Błąd podczas pobierania statystyk zamówień:', error);
        setOrderStats(null);
      } finally {
        setOrdersLoading(false);
      }
    };
    
    // Pobieranie danych analitycznych
    const fetchAnalytics = async () => {
      try {
        setAnalyticsLoading(true);
        const kpiData = await getKpiData();
        console.log('Dane KPI:', kpiData);
        setAnalyticsData(kpiData || null);
      } catch (error) {
        console.error('Błąd podczas pobierania danych KPI:', error);
        setAnalyticsData(null);
      } finally {
        setAnalyticsLoading(false);
      }
    };
    
    // Uruchamiamy wszystkie pobierania równolegle
    Promise.all([
      fetchTasks(),
      fetchRecipes(),
      fetchOrderStats(),
      fetchAnalytics()
    ]).finally(() => {
      setLoading(false);
    });
    
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

  // Renderowanie wskaźnika ładowania sekcji
  const SectionLoading = () => (
    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
      <CircularProgress size={24} />
    </Box>
  );

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
                <Typography variant="body2" color="text.secondary">
                  Zarządzaj recepturami i składnikami
                </Typography>
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
                {analyticsData?.production?.tasksInProgress || 0} aktywnych zadań
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Planuj i zarządzaj produkcją
                </Typography>
              </Box>
            </CardContent>
            <CardActions sx={{ p: 2, pt: 0, justifyContent: 'center' }}>
              <Button component={Link} to="/production" sx={{ flexGrow: 1 }}>
                Przejdź
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card sx={{ borderRadius: 2, boxShadow: 3 }}>
            <CardContent sx={{ textAlign: 'center', p: 3 }}>
              <InventoryIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Stany Magazynowe</Typography>
              <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                {analyticsData?.inventory?.totalItems || 0} produktów
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Zarządzaj stanami magazynowymi
                </Typography>
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
              <WorkstationIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Stanowiska</Typography>
              <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                Stanowiska robocze
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  Zarządzaj stanowiskami produkcyjnymi
                </Typography>
              </Box>
            </CardContent>
            <CardActions sx={{ p: 2, pt: 0, justifyContent: 'space-between' }}>
              <Button component={Link} to="/production/workstations" sx={{ flexGrow: 1 }}>
                Przejdź
              </Button>
              <Button 
                component={Link} 
                to="/production/workstations/new" 
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
        
        {/* Zamówienia */}
        <Grid item xs={12} md={12}>
          <Card sx={{ borderRadius: 2, boxShadow: 3 }}>
            <CardContent sx={{ textAlign: 'center', p: 3 }}>
              <OrdersIcon sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Zamówienia klientów</Typography>
              
              {ordersLoading ? (
                <SectionLoading />
              ) : (
                <>
                  <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                    {orderStats?.total || 0} zamówień ({orderStats?.totalValue ? formatCurrency(orderStats.totalValue) : '0,00 EUR'})
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      Zarządzaj zamówieniami klientów
                    </Typography>
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
                              primary={`#${order.orderNumber || order.id?.substring(0, 8).toUpperCase()}`}
                              secondary={`${order.customer} - ${formatCurrency(order.value)} - ${formatTimestamp(order.date, false)}`}
                              primaryTypographyProps={{ variant: 'body2', fontWeight: 'bold' }}
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
                </>
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
                      {analyticsData?.production?.completedTasks || 0}
                    </Typography>
                    <Typography variant="body1">
                      Ukończone
                    </Typography>
                  </Box>
                </Grid>
                
                <Grid item xs={12} md={4}>
                  <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'info.light', borderRadius: 2, color: 'white' }}>
                    <Typography variant="h3" sx={{ mb: 1 }}>
                      {analyticsData?.sales?.totalOrders || 0}
                    </Typography>
                    <Typography variant="body1">
                      Zamówienia
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
        
        {/* Karta Analityki */}
        <Grid item xs={12}>
          <Card sx={{ borderRadius: 2, boxShadow: 3 }}>
            <CardContent sx={{ p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">
                  Analityka systemu
                </Typography>
                <Button 
                  component={Link} 
                  to="/analytics"
                  variant="outlined"
                  size="small"
                  startIcon={<AnalyticsIcon />}
                >
                  Przejdź do analityki
                </Button>
              </Box>
              <Divider sx={{ mb: 2 }} />
              
              <Typography variant="body1" gutterBottom>
                Sprawdź szczegółową analitykę systemu w nowym, uproszczonym widoku. 
                Monitoruj kluczowe wskaźniki dla magazynu, produkcji i zamówień.
              </Typography>
              
              <Box sx={{ mt: 2, p: 2, bgcolor: 'background.paper', borderRadius: 2, border: '1px dashed', borderColor: 'divider' }}>
                <Typography variant="subtitle2" gutterBottom>
                  Dostępne statystyki:
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <OrdersIcon sx={{ mr: 1, color: 'primary.main' }} />
                      <Typography variant="body2">
                        Zamówienia i sprzedaż
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <InventoryIcon sx={{ mr: 1, color: 'primary.main' }} />
                      <Typography variant="body2">
                        Stany magazynowe
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <ProductionIcon sx={{ mr: 1, color: 'primary.main' }} />
                      <Typography variant="body2">
                        Zadania produkcyjne
                      </Typography>
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Dashboard;