// src/pages/Recipes/RecipeDetailsPage.js
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Grid,
  Button,
  Divider,
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  List,
  ListItem,
  ListItemText,
  Tab,
  Tabs
} from '@mui/material';
import {
  Edit as EditIcon,
  ArrowBack as ArrowBackIcon,
  History as HistoryIcon,
  Print as PrintIcon
} from '@mui/icons-material';
import { getRecipeById, getRecipeVersions } from '../../services/recipeService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';

// TabPanel component for recipe detail tabs
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`recipe-tabpanel-${index}`}
      aria-labelledby={`recipe-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const RecipeDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showError } = useNotification();
  const [recipe, setRecipe] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    const fetchRecipeData = async () => {
      try {
        setLoading(true);
        const recipeData = await getRecipeById(id);
        setRecipe(recipeData);
        
        // Pobierz historię wersji
        const versionsData = await getRecipeVersions(id);
        setVersions(versionsData);
      } catch (error) {
        showError('Błąd podczas pobierania receptury: ' + error.message);
        console.error('Error fetching recipe details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecipeData();
  }, [id, showError]);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  if (loading) {
    return <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>Ładowanie receptury...</Container>;
  }

  if (!recipe) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h5">Receptura nie została znaleziona</Typography>
        <Button 
          variant="contained" 
          component={Link} 
          to="/recipes"
          startIcon={<ArrowBackIcon />}
          sx={{ mt: 2 }}
        >
          Powrót do listy receptur
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/recipes')}
        >
          Powrót
        </Button>
        <Typography variant="h5">
          Szczegóły receptury
        </Typography>
        <Box>
          <Button 
            variant="outlined" 
            startIcon={<PrintIcon />}
            sx={{ mr: 1 }}
            onClick={() => window.print()}
          >
            Drukuj
          </Button>
          <Button 
            variant="contained" 
            color="primary" 
            component={Link}
            to={`/recipes/${id}/edit`}
            startIcon={<EditIcon />}
          >
            Edytuj
          </Button>
        </Box>
      </Box>

      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Typography variant="h4" gutterBottom>
            {recipe.name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Chip 
              label={recipe.status || 'Robocza'} 
              color={recipe.status === 'Zatwierdzona' ? 'success' : 'default'} 
              sx={{ mr: 2 }}
            />
            <Typography variant="subtitle1" color="text.secondary">
              Wersja: {recipe.version || 1} | Ostatnia aktualizacja: {formatDate(recipe.updatedAt)}
            </Typography>
          </Box>
          {recipe.description && (
            <Typography variant="body1" paragraph>
              {recipe.description}
            </Typography>
          )}
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="text.secondary">
                Czas przygotowania: {recipe.prepTime ? `${recipe.prepTime} min` : 'Nie określono'}
              </Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="text.secondary">
                Wydajność: {recipe.yield.quantity} {recipe.yield.unit}
              </Typography>
            </Grid>
          </Grid>
        </Box>

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="recipe tabs">
            <Tab label="Składniki i instrukcje" id="recipe-tab-0" />
            <Tab label="Historia wersji" id="recipe-tab-1" />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={4}>
            <Grid item xs={12} md={5}>
              <Typography variant="h6" gutterBottom>Składniki</Typography>
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Składnik</TableCell>
                      <TableCell align="right">Ilość</TableCell>
                      <TableCell>Jednostka</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {recipe.ingredients.map((ingredient, index) => (
                      <TableRow key={index}>
                        <TableCell component="th" scope="row">
                          {ingredient.name}
                        </TableCell>
                        <TableCell align="right">{ingredient.quantity}</TableCell>
                        <TableCell>{ingredient.unit}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
            <Grid item xs={12} md={7}>
              <Typography variant="h6" gutterBottom>Instrukcja przygotowania</Typography>
              <Typography variant="body1" paragraph style={{ whiteSpace: 'pre-line' }}>
                {recipe.instructions || 'Brak instrukcji'}
              </Typography>
              
              {recipe.notes && (
                <>
                  <Typography variant="h6" gutterBottom sx={{ mt: 3 }}>Notatki dodatkowe</Typography>
                  <Typography variant="body1" paragraph style={{ whiteSpace: 'pre-line' }}>
                    {recipe.notes}
                  </Typography>
                </>
              )}
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Typography variant="h6" gutterBottom>Historia wersji</Typography>
          <List>
            {versions.map((version) => (
              <React.Fragment key={version.id}>
                <ListItem>
                  <ListItemText
                    primary={`Wersja ${version.version}`}
                    secondary={`Utworzona: ${formatDate(version.createdAt)} | Autor: ${version.createdBy}`}
                  />
                  <Button 
                    variant="outlined" 
                    size="small"
                    startIcon={<HistoryIcon />}
                    // W przyszłości można dodać funkcję przywracania wersji
                  >
                    Przywróć
                  </Button>
                </ListItem>
                <Divider />
              </React.Fragment>
            ))}
          </List>
        </TabPanel>
      </Paper>
    </Container>
  );
};

export default RecipeDetailsPage;