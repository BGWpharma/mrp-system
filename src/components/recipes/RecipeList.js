// src/components/recipes/RecipeList.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Paper, 
  Button, 
  TextField, 
  IconButton,
  Typography,
  Chip,
  Box
} from '@mui/material';
import { 
  Add as AddIcon, 
  Search as SearchIcon, 
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon
} from '@mui/icons-material';
import { getAllRecipes, deleteRecipe } from '../../services/recipeService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';

const RecipeList = () => {
  const [recipes, setRecipes] = useState([]);
  const [filteredRecipes, setFilteredRecipes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const { showSuccess, showError } = useNotification();

  // Pobierz wszystkie receptury przy montowaniu komponentu
  useEffect(() => {
    fetchRecipes();
  }, []);

  // Filtruj receptury przy zmianie searchTerm lub receptur
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredRecipes(recipes);
    } else {
      const filtered = recipes.filter(recipe => 
        recipe.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        recipe.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredRecipes(filtered);
    }
  }, [searchTerm, recipes]);

  const fetchRecipes = async () => {
    try {
      setLoading(true);
      const fetchedRecipes = await getAllRecipes();
      setRecipes(fetchedRecipes);
      setFilteredRecipes(fetchedRecipes);
    } catch (error) {
      showError('Błąd podczas pobierania receptur: ' + error.message);
      console.error('Error fetching recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Czy na pewno chcesz usunąć tę recepturę?')) {
      try {
        await deleteRecipe(id);
        showSuccess('Receptura została usunięta');
        // Odśwież listę receptur
        fetchRecipes();
      } catch (error) {
        showError('Błąd podczas usuwania receptury: ' + error.message);
        console.error('Error deleting recipe:', error);
      }
    }
  };

  if (loading) {
    return <div>Ładowanie receptur...</div>;
  }

  return (
    <div>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Receptury</Typography>
        <Button 
          variant="contained" 
          color="primary" 
          component={Link} 
          to="/recipes/new"
          startIcon={<AddIcon />}
        >
          Nowa receptura
        </Button>
      </Box>

      <Box sx={{ display: 'flex', mb: 3 }}>
        <TextField
          label="Szukaj receptury"
          variant="outlined"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          fullWidth
          InputProps={{
            startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
          }}
        />
      </Box>

      {filteredRecipes.length === 0 ? (
        <Typography variant="body1" align="center">
          Nie znaleziono receptur
        </Typography>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nazwa</TableCell>
                <TableCell>Opis</TableCell>
                <TableCell>Wersja</TableCell>
                <TableCell>Ostatnia aktualizacja</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredRecipes.map((recipe) => (
                <TableRow key={recipe.id}>
                  <TableCell component="th" scope="row">
                    {recipe.name}
                  </TableCell>
                  <TableCell>
                    {recipe.description?.substring(0, 50)}
                    {recipe.description?.length > 50 ? '...' : ''}
                  </TableCell>
                  <TableCell>{recipe.version || 1}</TableCell>
                  <TableCell>{formatDate(recipe.updatedAt)}</TableCell>
                  <TableCell>
                    <Chip 
                      label={recipe.status || 'Robocza'} 
                      color={recipe.status === 'Zatwierdzona' ? 'success' : 'default'} 
                      size="small" 
                    />
                  </TableCell>
                  <TableCell align="right">
                    <IconButton 
                      component={Link} 
                      to={`/recipes/${recipe.id}`}
                      color="primary"
                      title="Podgląd"
                    >
                      <ViewIcon />
                    </IconButton>
                    <IconButton 
                      component={Link} 
                      to={`/recipes/${recipe.id}/edit`}
                      color="primary"
                      title="Edytuj"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton 
                      onClick={() => handleDelete(recipe.id)} 
                      color="error"
                      title="Usuń"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
};

export default RecipeList;