// src/components/recipes/RecipeList.js
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
  Box,
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tabs,
  Tab,
  Alert,
  Snackbar
} from '@mui/material';
import { 
  Add as AddIcon, 
  Search as SearchIcon, 
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as ViewIcon,
  ProductionQuantityLimits as ProductIcon,
  Person as PersonIcon,
  FilterList as FilterIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { getAllRecipes, deleteRecipe, getRecipesByCustomer } from '../../services/recipeService';
import { getAllCustomers } from '../../services/customerService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';

// UWAGA: Do poprawnego działania zapytań filtrowania wg. klienta wymagany jest
// indeks złożony w Firestore dla kolekcji "recipes":
// - Pola do zaindeksowania: customerId (Ascending), updatedAt (Descending)
// Bez tego indeksu zapytania filtrujące nie będą działać poprawnie.

const RecipeList = () => {
  const [recipes, setRecipes] = useState([]);
  const [filteredRecipes, setFilteredRecipes] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  // Dodajemy stan dla filtrowania wg klienta
  const [customers, setCustomers] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  
  // Dodajemy zakładki dla zmiany widoku
  const [tabValue, setTabValue] = useState(0); // 0 - wszystkie, 1 - grupowane wg klienta
  
  // Grupujemy receptury wg klienta
  const [groupedRecipes, setGroupedRecipes] = useState({});
  
  // Dodajemy stan dla powiadomienia o indeksie Firestore
  const [showIndexAlert, setShowIndexAlert] = useState(false);

  // Pobierz wszystkie receptury przy montowaniu komponentu
  useEffect(() => {
    fetchRecipes();
    fetchCustomers();
  }, [selectedCustomerId]);

  // Filtruj receptury przy zmianie searchTerm lub receptur
  useEffect(() => {
    filterRecipes();
  }, [searchTerm, recipes, tabValue]);
  
  // Grupuj receptury wg klienta przy zmianie receptur lub listy klientów
  useEffect(() => {
    groupRecipesByCustomer();
  }, [recipes, customers]);
  
  const fetchCustomers = async () => {
    try {
      setLoadingCustomers(true);
      const customersData = await getAllCustomers();
      setCustomers(customersData);
    } catch (error) {
      console.error('Błąd podczas pobierania klientów:', error);
      showError('Nie udało się pobrać listy klientów');
    } finally {
      setLoadingCustomers(false);
    }
  };

  const fetchRecipes = async () => {
    try {
      setLoading(true);
      
      let recipesData;
      
      console.log('Filtrowanie receptur dla klienta ID:', selectedCustomerId);
      
      if (selectedCustomerId) {
        try {
          // Pobierz receptury dla wybranego klienta
          console.log('Pobieranie receptur dla klienta:', selectedCustomerId);
          recipesData = await getRecipesByCustomer(selectedCustomerId);
          console.log('Znaleziono receptur dla klienta:', recipesData.length);
        } catch (error) {
          console.error('Błąd filtrowania po kliencie:', error);
          
          // Sprawdź, czy to błąd braku indeksu
          if (error.message && error.message.includes('index')) {
            setShowIndexAlert(true);
            // Alternatywny sposób filtrowania - pobierz wszystkie i filtruj po stronie klienta
            console.log('Alternatywne filtrowanie po stronie klienta');
            recipesData = await getAllRecipes();
            recipesData = recipesData.filter(recipe => recipe.customerId === selectedCustomerId);
          } else {
            throw error; // Przekaż dalej inne błędy
          }
        }
      } else {
        // Pobierz wszystkie receptury
        console.log('Pobieranie wszystkich receptur');
        recipesData = await getAllRecipes();
        console.log('Znaleziono wszystkich receptur:', recipesData.length);
      }
      
      setRecipes(recipesData);
      setFilteredRecipes(recipesData);
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania receptur:', error);
      showError('Nie udało się pobrać receptur');
      setLoading(false);
    }
  };

  const filterRecipes = () => {
    let filtered = [...recipes];
    
    // Filtruj wg wyszukiwanego terminu
    if (searchTerm.trim() !== '') {
      filtered = filtered.filter(recipe => 
        recipe.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        recipe.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    setFilteredRecipes(filtered);
  };
  
  const groupRecipesByCustomer = () => {
    const grouped = {};
    
    // Domyślna grupa dla receptur bez klienta
    grouped['noCustomer'] = {
      name: 'Receptury ogólne',
      recipes: []
    };
    
    // Utwórz grupy dla każdego klienta
    customers.forEach(customer => {
      grouped[customer.id] = {
        name: customer.name,
        customer: customer,
        recipes: []
      };
    });
    
    // Przypisz receptury do odpowiednich grup
    recipes.forEach(recipe => {
      if (!recipe.customerId) {
        grouped['noCustomer'].recipes.push(recipe);
      } else if (grouped[recipe.customerId]) {
        grouped[recipe.customerId].recipes.push(recipe);
      } else {
        // Jeśli klient został usunięty, dodaj recepturę do grupy "bez klienta"
        grouped['noCustomer'].recipes.push(recipe);
      }
    });
    
    setGroupedRecipes(grouped);
  };

  const handleDeleteRecipe = async (recipeId) => {
    if (window.confirm('Czy na pewno chcesz usunąć tę recepturę?')) {
      try {
        await deleteRecipe(recipeId);
        showSuccess('Receptura została usunięta');
        fetchRecipes(); // Odśwież listę po usunięciu
      } catch (error) {
        console.error('Błąd podczas usuwania receptury:', error);
        showError('Nie udało się usunąć receptury: ' + error.message);
      }
    }
  };
  
  const handleCustomerFilterChange = (event) => {
    const newCustomerId = event.target.value;
    console.log('Zmieniono filtr klienta na:', newCustomerId);
    setSelectedCustomerId(newCustomerId);
    // fetchRecipes zostanie wywołane przez useEffect, gdy selectedCustomerId się zmieni
  };
  
  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  // Renderowanie tabeli receptur
  const renderRecipesTable = (recipesToRender) => (
    <TableContainer component={Paper} variant="outlined">
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>SKU</TableCell>
                <TableCell>Opis</TableCell>
                <TableCell>Klient</TableCell>
                <TableCell>Ostatnia aktualizacja</TableCell>
                <TableCell align="right">Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
          {recipesToRender.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} align="center">
                Nie znaleziono receptur
              </TableCell>
            </TableRow>
          ) : (
            recipesToRender.map((recipe) => {
              // Znajdź klienta przypisanego do receptury
              const customer = customers.find(c => c.id === recipe.customerId);
              
              return (
                <TableRow key={recipe.id}>
                  <TableCell>
                    <Link to={`/recipes/${recipe.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      <Typography variant="body1" component="span" sx={{ fontWeight: 'medium' }}>
                        {recipe.name}
                      </Typography>
                    </Link>
                  </TableCell>
                  <TableCell>{recipe.description || '-'}</TableCell>
                  <TableCell>
                    {customer ? (
                    <Chip 
                        icon={<PersonIcon />} 
                        label={customer.name} 
                      size="small" 
                        variant="outlined" 
                        color="primary"
                    />
                    ) : (
                      <Chip label="Ogólna" size="small" variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell>{recipe.updatedAt ? formatDate(recipe.updatedAt.toDate()) : '-'}</TableCell>
                  <TableCell align="right">
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <Tooltip title="Podgląd">
                    <IconButton 
                          size="small" 
                          color="primary"
                      component={Link} 
                      to={`/recipes/${recipe.id}`}
                    >
                          <ViewIcon fontSize="small" />
                    </IconButton>
                      </Tooltip>
                      <Tooltip title="Edytuj">
                    <IconButton 
                          size="small" 
                          color="primary"
                      component={Link} 
                      to={`/recipes/${recipe.id}/edit`}
                    >
                          <EditIcon fontSize="small" />
                    </IconButton>
                      </Tooltip>
                      <Tooltip title="Usuń">
                      <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => handleDeleteRecipe(recipe.id)}
                      >
                          <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                      <Tooltip title="Dodaj do magazynu">
                    <IconButton 
                          size="small" 
                          color="secondary"
                          component={Link}
                          to={`/recipes/${recipe.id}/edit`}
                          state={{ openProductDialog: true }}
                        >
                          <ProductIcon fontSize="small" />
                    </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              );
            })
          )}
            </TableBody>
          </Table>
        </TableContainer>
  );
  
  // Renderowanie widoku zgrupowanego wg klientów
  const renderGroupedRecipes = () => (
    <Box>
      {Object.keys(groupedRecipes).map(groupId => {
        const group = groupedRecipes[groupId];
        
        // Nie pokazuj pustych grup
        if (group.recipes.length === 0) return null;
        
        return (
          <Box key={groupId} sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              {groupId === 'noCustomer' ? (
                <Typography variant="h6">{group.name}</Typography>
              ) : (
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <PersonIcon sx={{ mr: 1, color: 'primary.main' }} />
                  <Typography variant="h6">{group.name}</Typography>
                </Box>
              )}
              <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
                ({group.recipes.length} {group.recipes.length === 1 ? 'receptura' : 'receptury'})
              </Typography>
            </Box>
            {renderRecipesTable(group.recipes)}
          </Box>
        );
      })}
    </Box>
  );

  return (
    <Box sx={{ maxWidth: '1200px', mx: 'auto', py: 3 }}>
      {/* Alert o potrzebnym indeksie */}
      {showIndexAlert && (
        <Alert 
          severity="warning" 
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => setShowIndexAlert(false)}>
              Zamknij
            </Button>
          }
        >
          <Typography variant="subtitle2">
            Uwaga: Brak wymaganego indeksu w bazie danych
          </Typography>
          <Typography variant="body2">
            Filtrowanie wg klienta może działać wolniej. Administrator powinien dodać indeks 
            do kolekcji "recipes": customerId (Ascending), updatedAt (Descending).
          </Typography>
        </Alert>
      )}
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Receptury</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          component={Link}
          to="/recipes/new"
        >
          Dodaj recepturę
        </Button>
      </Box>
      
      <Box sx={{ mb: 3, display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        <TextField
          placeholder="Szukaj receptur..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          variant="outlined"
          size="small"
          sx={{ flexGrow: 1, minWidth: '200px' }}
          InputProps={{
            startAdornment: <SearchIcon sx={{ color: 'action.active', mr: 1 }} />
          }}
        />
        
        <FormControl sx={{ minWidth: '200px' }} size="small">
          <InputLabel id="customer-filter-label">Filtruj wg klienta</InputLabel>
          <Select
            labelId="customer-filter-label"
            value={selectedCustomerId}
            onChange={handleCustomerFilterChange}
            label="Filtruj wg klienta"
            displayEmpty
            startAdornment={<FilterIcon sx={{ color: 'action.active', mr: 1 }} />}
          >
            <MenuItem value="">Wszyscy klienci</MenuItem>
            {customers.map((customer) => (
              <MenuItem key={customer.id} value={customer.id}>
                {customer.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      
      <Box sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} textColor="primary" indicatorColor="primary">
          <Tab label="Lista receptur" />
          <Tab label="Grupowane wg klienta" />
        </Tabs>
      </Box>
      
      {loading ? (
        <Typography>Ładowanie receptur...</Typography>
      ) : (
        tabValue === 0 ? (
          renderRecipesTable(filteredRecipes)
        ) : (
          renderGroupedRecipes()
        )
      )}
    </Box>
  );
};

export default RecipeList;