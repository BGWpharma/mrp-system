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
  Add as AddIcon
} from '@mui/icons-material';
import { getTasksByStatus } from '../../services/productionService';
import { getAllRecipes } from '../../services/recipeService';
import { useAuth } from '../../hooks/useAuth';
import { formatDate } from '../../utils/formatters';

const Dashboard = () => {
  const { currentUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState([]);
  const [recipes, setRecipes] = useState([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Pobierz zadania produkcyjne w trakcie
        const tasksInProgress = await getTasksByStatus('W trakcie');
        setTasks(tasksInProgress);
        
        // Pobierz ostatnie receptury
        const allRecipes = await getAllRecipes();
        setRecipes(allRecipes.slice(0, 5)); // Tylko 5 najnowszych
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, []);

  if (loading) {
    return <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>Ładowanie danych...</Container>;
  }

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

        {/* Zadania produkcyjne w trakcie */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" gutterBottom>
              Zadania produkcyjne w trakcie
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            {tasks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" align="center">
                Brak aktywnych zadań produkcyjnych
              </Typography>
            ) : (
              <List>
                {tasks.map((task) => (
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

        {/* Ostatnie receptury */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 2, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" gutterBottom>
              Ostatnie receptury
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            {recipes.length === 0 ? (
              <Typography variant="body2" color="text.secondary" align="center">
                Brak receptur
              </Typography>
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