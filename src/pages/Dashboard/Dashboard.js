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
  Chip
} from '@mui/material';
import {
  MenuBook as RecipesIcon,
  Schedule as ProductionIcon,
  Inventory as InventoryIcon,
  VerifiedUser as QualityIcon,
  ShoppingCart as OrdersIcon,
  Add as AddIcon,
  InsertChart as AnalyticsIcon
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

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Typography variant="h4" gutterBottom>
        Dashboard
      </Typography>
      <Typography variant="subtitle1" sx={{ mb: 4 }}>
        Witaj, {currentUser.displayName || currentUser.email}
      </Typography>

      <Grid container spacing={3}>
        {/* Skróty do głównych modułów */}
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <RecipesIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Receptury</Typography>
              <Typography variant="body2" color="text.secondary">
                Zarządzaj recepturami i składnikami
              </Typography>
            </CardContent>
            <CardActions>
              <Button 
                component={Link} 
                to="/recipes" 
                fullWidth
              >
                Przejdź
              </Button>
              <Button 
                component={Link} 
                to="/recipes/new" 
                color="primary"
                variant="contained"
                fullWidth
                startIcon={<AddIcon />}
              >
                Nowa
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <ProductionIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Produkcja</Typography>
              <Typography variant="body2" color="text.secondary">
                Planuj i zarządzaj produkcją
              </Typography>
            </CardContent>
            <CardActions>
              <Button 
                component={Link} 
                to="/production" 
                fullWidth
              >
                Przejdź
              </Button>
              <Button 
                component={Link} 
                to="/production/new-task" 
                color="primary"
                variant="contained"
                fullWidth
                startIcon={<AddIcon />}
              >
                Nowe
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <InventoryIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Magazyn</Typography>
              <Typography variant="body2" color="text.secondary">
                Zarządzaj stanami magazynowymi
              </Typography>
            </CardContent>
            <CardActions>
              <Button 
                component={Link} 
                to="/inventory" 
                fullWidth
              >
                Przejdź
              </Button>
              <Button 
                component={Link} 
                to="/inventory/new" 
                color="primary"
                variant="contained"
                fullWidth
                startIcon={<AddIcon />}
              >
                Przyjmij
              </Button>
            </CardActions>
          </Card>
        </Grid>

        <Grid item xs={12} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <QualityIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Jakość</Typography>
              <Typography variant="body2" color="text.secondary">
                Kontroluj jakość produkcji
              </Typography>
            </CardContent>
            <CardActions>
              <Button 
                component={Link} 
                to="/quality" 
                fullWidth
              >
                Przejdź
              </Button>
              <Button 
                component={Link} 
                to="/quality/new-test" 
                color="primary"
                variant="contained"
                fullWidth
                startIcon={<AddIcon />}
              >
                Nowy test
              </Button>
            </CardActions>
          </Card>
        </Grid>
        
        {/* Dodaję moduł Zamówień */}
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <OrdersIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Zamówienia</Typography>
              <Typography variant="body2" color="text.secondary">
                Zarządzaj zamówieniami klientów
              </Typography>
            </CardContent>
            <CardActions>
              <Button 
                component={Link} 
                to="/orders" 
                fullWidth
              >
                Przejdź
              </Button>
              <Button 
                component={Link} 
                to="/orders/new" 
                color="primary"
                variant="contained"
                fullWidth
                startIcon={<AddIcon />}
              >
                Nowe
              </Button>
            </CardActions>
          </Card>
        </Grid>
        
        {/* Dodaję moduł Analizy i Raporty */}
        <Grid item xs={12} md={3}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <AnalyticsIcon sx={{ fontSize: 40, color: 'primary.main', mb: 1 }} />
              <Typography variant="h6">Analizy i Raporty</Typography>
              <Typography variant="body2" color="text.secondary">
                Panel analityczny i raporty
              </Typography>
            </CardContent>
            <CardActions>
              <Button 
                component={Link} 
                to="/analytics" 
                fullWidth
                variant="contained"
                color="primary"
              >
                Przejdź
              </Button>
            </CardActions>
          </Card>
        </Grid>

        {/* Zadania produkcyjne w trakcie */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" gutterBottom>
              Zadania produkcyjne w trakcie
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            {tasks && tasks.length === 0 ? (
              <Box sx={{ mt: 2, mb: 2 }}>
                <Typography variant="body2" color="text.secondary" align="center">
                  Brak aktywnych zadań produkcyjnych
                </Typography>
                {analyticsData && analyticsData.production && (
                  <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-around' }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" color="primary.main">
                        {analyticsData.production.tasksInProgress}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        W trakcie
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" color="success.main">
                        {analyticsData.production.completedTasks}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Ukończone
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" color="info.main">
                        {analyticsData.production.efficiency}%
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Wydajność
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Box>
            ) : (
              <List>
                {tasks && tasks.map((task) => (
                  <React.Fragment key={task.id}>
                    <ListItem button component={Link} to={`/production/tasks/${task.id}`}>
                      <ListItemText
                        primary={task.name}
                        secondary={
                          <>
                            <Typography component="span" variant="body2" color="text.primary">
                              {task.productName}
                            </Typography>
                            {' — '}{task.quantity} {task.unit}
                          </>
                        }
                      />
                      <Chip 
                        label="W trakcie" 
                        color="warning" 
                        size="small" 
                        sx={{ ml: 1 }}
                      />
                    </ListItem>
                    <Divider />
                  </React.Fragment>
                ))}
              </List>
            )}
            
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button 
                component={Link} 
                to="/production"
                variant="text"
              >
                Zobacz wszystkie
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Ostatnie zamówienia */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" gutterBottom>
              Ostatnie zamówienia
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            {!orderStats || !orderStats.recentOrders || orderStats.recentOrders.length === 0 ? (
              <Box sx={{ mt: 2, mb: 2 }}>
                <Typography variant="body2" color="text.secondary" align="center">
                  Brak zamówień
                </Typography>
                
                {analyticsData && analyticsData.sales && (
                  <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-around' }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" color="primary.main">
                        {analyticsData.sales.totalOrders}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Łącznie
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" color="primary.main">
                        {formatCurrency(analyticsData.sales.totalValue)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Wartość
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography 
                        variant="h6" 
                        color={analyticsData.sales.growthRate >= 0 ? 'success.main' : 'error.main'}
                      >
                        {analyticsData.sales.growthRate >= 0 ? '+' : ''}{analyticsData.sales.growthRate.toFixed(1)}%
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Wzrost
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Box>
            ) : (
              <List>
                {orderStats.recentOrders.map((order) => (
                  <React.Fragment key={order.id}>
                    <ListItem button component={Link} to={`/orders/${order.id}`}>
                      <ListItemText
                        primary={order.customer}
                        secondary={
                          <>
                            <Typography component="span" variant="body2" color="text.primary">
                              {formatCurrency(order.value)}
                            </Typography>
                            {' — '}{formatTimestamp(order.date, false)}
                          </>
                        }
                      />
                      <Chip 
                        label={order.status} 
                        color={getStatusColor(order.status)} 
                        size="small" 
                        sx={{ ml: 1 }}
                      />
                    </ListItem>
                    <Divider />
                  </React.Fragment>
                ))}
              </List>
            )}
            
            {orderStats && (
              <Box sx={{ mt: 2, mb: 2, display: 'flex', justifyContent: 'space-around' }}>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h6" color="primary">
                    {orderStats.total}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Zamówień łącznie
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h6" color="primary">
                    {formatCurrency(orderStats.totalValue)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Wartość łącznie
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'center' }}>
                  <Typography variant="h6" color="warning.main">
                    {orderStats.byStatus['W realizacji'] || 0}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    W realizacji
                  </Typography>
                </Box>
              </Box>
            )}
            
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button 
                component={Link} 
                to="/orders"
                variant="text"
              >
                Zobacz wszystkie
              </Button>
            </Box>
          </Paper>
        </Grid>

        {/* Ostatnie receptury */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" gutterBottom>
              Ostatnie receptury
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            {!recipes || recipes.length === 0 ? (
              <Box sx={{ mt: 2, mb: 2 }}>
                <Typography variant="body2" color="text.secondary" align="center">
                  Brak receptur
                </Typography>
                
                {analyticsData && analyticsData.inventory && (
                  <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-around' }}>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" color="primary.main">
                        {analyticsData.inventory.totalItems}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Produktów magazynowych
                      </Typography>
                    </Box>
                    <Box sx={{ textAlign: 'center' }}>
                      <Typography variant="h6" color="error.main">
                        {analyticsData.inventory.lowStockItems}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Niski stan
                      </Typography>
                    </Box>
                  </Box>
                )}
              </Box>
            ) : (
              <List>
                {recipes.map((recipe) => (
                  <React.Fragment key={recipe.id}>
                    <ListItem button component={Link} to={`/recipes/${recipe.id}`}>
                      <ListItemText
                        primary={recipe.name}
                        secondary={`Ostatnia aktualizacja: ${formatDate(recipe.updatedAt)}`}
                      />
                      <Chip 
                        label={recipe.status || 'Robocza'} 
                        color={recipe.status === 'Zatwierdzona' ? 'success' : 'default'} 
                        size="small" 
                        sx={{ ml: 1 }}
                      />
                    </ListItem>
                    <Divider />
                  </React.Fragment>
                ))}
              </List>
            )}
            
            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
              <Button 
                component={Link} 
                to="/recipes"
                variant="text"
              >
                Zobacz wszystkie
              </Button>
            </Box>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default Dashboard;