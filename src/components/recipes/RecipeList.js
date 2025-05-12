// src/components/recipes/RecipeList.js
import React, { useState, useEffect, useCallback } from 'react';
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
  Snackbar,
  Pagination,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  CircularProgress
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
  Info as InfoIcon,
  ArrowDropUp as ArrowDropUpIcon,
  ExpandMore as ExpandMoreIcon,
  Cached as CachedIcon
} from '@mui/icons-material';
import { getAllRecipes, deleteRecipe, getRecipesByCustomer, getRecipesWithPagination } from '../../services/recipeService';
import { useCustomersCache } from '../../hooks/useCustomersCache';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';
import searchService from '../../services/searchService';

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
  
  // Użyj nowego hooka do buforowania danych klientów
  const { customers, loading: loadingCustomers, error: customersError, refreshCustomers } = useCustomersCache();
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  
  // Dodajemy zakładki dla zmiany widoku
  const [tabValue, setTabValue] = useState(0); // 0 - wszystkie, 1 - grupowane wg klienta
  
  // Grupujemy receptury wg klienta
  const [groupedRecipes, setGroupedRecipes] = useState({});
  
  // Dodajemy stan dla powiadomienia o indeksie Firestore
  const [showIndexAlert, setShowIndexAlert] = useState(false);

  // Dodajemy stan dla sortowania
  const [tableSort, setTableSort] = useState({
    field: 'name',
    order: 'asc'
  });

  // Dodajemy stany do obsługi paginacji
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Dodajemy stan dla debounce wyszukiwania
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [searchTimeout, setSearchTimeout] = useState(null);

  // Dodajemy stan dla rozwiniętych paneli klientów
  const [expandedPanel, setExpandedPanel] = useState(null);
  const [customerRecipes, setCustomerRecipes] = useState({});
  const [loadingCustomerRecipes, setLoadingCustomerRecipes] = useState({});
  
  // Dodaje stan dla informacji o indeksie wyszukiwania
  const [searchIndexStatus, setSearchIndexStatus] = useState({
    isLoaded: false,
    lastRefreshed: null
  });
  
  // Obsługa debounce dla wyszukiwania
  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    const timeoutId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms opóźnienia
    
    setSearchTimeout(timeoutId);
    
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTerm]);
  
  // Zmodyfikowana funkcja pobierająca receptury używająca indeksu wyszukiwania
  const fetchRecipes = useCallback(async () => {
    try {
      setLoading(true);
      
      // Opcje wyszukiwania
      const searchOptions = {
        page,
        limit,
        sortField: tableSort.field,
        sortOrder: tableSort.order,
        customerId: selectedCustomerId || null
      };
      
      // Użyj nowego searchService zamiast bezpośredniego zapytania do Firestore
      const result = await searchService.searchRecipes(debouncedSearchTerm, searchOptions);
          
      // Ustawienie stanów po wyszukiwaniu
      setRecipes(result.data);
      setFilteredRecipes(result.data);
      setTotalItems(result.pagination.totalItems);
      setTotalPages(result.pagination.totalPages);
      
      // Aktualizacja informacji o indeksie
      setSearchIndexStatus({
        isLoaded: true,
        lastRefreshed: new Date()
      });
      
      console.log('Pobrano receptur z indeksu wyszukiwania:', result.data.length);
      console.log('Łącznie receptur w indeksie:', result.pagination.totalItems);
      
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas wyszukiwania receptur:', error);
      
      // Jeśli wystąpił błąd z indeksem, spróbuj użyć standardowego podejścia
      try {
        console.warn('Próba użycia standardowego API po błędzie indeksu wyszukiwania');
        
        const fallbackResult = await getRecipesWithPagination(
          page, 
          limit, 
          tableSort.field, 
          tableSort.order,
          selectedCustomerId,
          debouncedSearchTerm
        );
        
        setRecipes(fallbackResult.data);
        setFilteredRecipes(fallbackResult.data);
        setTotalItems(fallbackResult.pagination.totalItems);
        setTotalPages(fallbackResult.pagination.totalPages);
      } catch (fallbackError) {
        console.error('Błąd podczas awaryjnego pobierania receptur:', fallbackError);
        showError('Nie udało się pobrać receptur');
      }
      
      setLoading(false);
    }
  }, [page, limit, tableSort, selectedCustomerId, debouncedSearchTerm, showError]);
      
  // Odświeżamy indeks wyszukiwania - funkcja do ręcznego wywołania przez użytkownika
  const refreshSearchIndex = async () => {
    try {
      setLoading(true);
      await searchService.refreshIndex('recipes');
      
      // Po odświeżeniu indeksu, pobierz dane ponownie
      await fetchRecipes();
      
      showSuccess('Indeks wyszukiwania został zaktualizowany');
    
      // Aktualizacja informacji o indeksie
      setSearchIndexStatus({
        isLoaded: true,
        lastRefreshed: new Date()
      });
    } catch (error) {
      console.error('Błąd podczas odświeżania indeksu wyszukiwania:', error);
      showError('Nie udało się odświeżyć indeksu wyszukiwania');
    } finally {
      setLoading(false);
    }
  };

  // Efekt uruchamiający pobieranie przy zmianie parametrów
  useEffect(() => {
    fetchRecipes();
  }, [fetchRecipes]);
  
  // Ustawiamy klientów do wyświetlenia w zakładce "grupowane wg klienta"
  useEffect(() => {
    if (tabValue === 1 && customers.length > 0) {
      prepareCustomerGroups();
    }
  }, [tabValue, customers]);
    
  // Funkcja przygotowująca grupy klientów do wyświetlenia
  const prepareCustomerGroups = () => {
    const grouped = {};
    
    // Domyślna grupa dla receptur bez klienta
    grouped['noCustomer'] = {
      id: 'noCustomer',
      name: 'Receptury ogólne',
      recipes: []
    };
    
    // Utwórz grupy dla każdego klienta
    customers.forEach(customer => {
      grouped[customer.id] = {
        id: customer.id,
        name: customer.name,
        customer: customer,
        recipes: []
      };
    });
    
    setGroupedRecipes(grouped);
  };

  // Funkcja pobierająca receptury dla konkretnego klienta - używa indeksu wyszukiwania
  const fetchRecipesForCustomer = async (customerId) => {
    try {
      // Oznacz, że pobieramy receptury dla tego klienta
      setLoadingCustomerRecipes(prev => ({ ...prev, [customerId]: true }));
      
      let customerRecipesData;
      
      // Użyj searchService zamiast bezpośrednich zapytań do Firestore
      const searchOptions = {
        sortField: 'name',
        sortOrder: 'asc',
        // Filtruj receptury bez klienta lub dla konkretnego klienta
        customerId: customerId === 'noCustomer' ? null : customerId,
        // Pobierz wszystkie wyniki (duża wartość limitu)
        page: 1,
        limit: 1000
      };
      
      // Wykonaj wyszukiwanie z opcjami
      const result = await searchService.searchRecipes(debouncedSearchTerm, searchOptions);
      customerRecipesData = result.data;
      
      // Zapisz receptury dla danego klienta
      setCustomerRecipes(prev => ({
        ...prev,
        [customerId]: customerRecipesData
      }));
      
    } catch (error) {
      console.error(`Błąd podczas pobierania receptur dla klienta ${customerId}:`, error);
      
      // W przypadku błędu, spróbuj tradycyjnego podejścia
      try {
        let fallbackData;
        
        if (customerId === 'noCustomer') {
          // Dla receptur ogólnych (bez klienta) użyj filtrowania po stronie klienta
          const allRecipes = await getAllRecipes();
          fallbackData = allRecipes.filter(recipe => !recipe.customerId);
      } else {
          // Dla konkretnego klienta pobierz receptury bezpośrednio
          fallbackData = await getRecipesByCustomer(customerId);
        }
        
        // Zastosuj filtrowanie według searchTerm, jeśli istnieje
        if (debouncedSearchTerm && debouncedSearchTerm.trim() !== '') {
          const searchTermLower = debouncedSearchTerm.toLowerCase().trim();
          fallbackData = fallbackData.filter(recipe => 
            (recipe.name && recipe.name.toLowerCase().includes(searchTermLower)) ||
            (recipe.description && recipe.description.toLowerCase().includes(searchTermLower))
          );
        }
        
        // Zapisz receptury dla danego klienta
        setCustomerRecipes(prev => ({
          ...prev,
          [customerId]: fallbackData
        }));
      } catch (fallbackError) {
        console.error(`Błąd podczas awaryjnego pobierania receptur dla klienta ${customerId}:`, fallbackError);
        showError(`Nie udało się pobrać receptur dla wybranego klienta`);
      }
    } finally {
      // Oznacz, że zakończyliśmy pobieranie dla tego klienta
      setLoadingCustomerRecipes(prev => ({ ...prev, [customerId]: false }));
    }
  };

  const handleTableSort = (field) => {
    const newOrder = tableSort.field === field && tableSort.order === 'asc' ? 'desc' : 'asc';
    setTableSort({
      field,
      order: newOrder
    });
    setPage(1); // Reset do pierwszej strony po zmianie sortowania
  };

  // Obsługa zmiany strony paginacji
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };
  
  // Obsługa zmiany liczby elementów na stronę
  const handleChangeRowsPerPage = (event) => {
    setLimit(parseInt(event.target.value, 10));
    setPage(1); // Wracamy na pierwszą stronę po zmianie rozmiaru
  };
  
  // Obsługa kliknięcia panelu klienta
  const handlePanelChange = (customerId) => (event, isExpanded) => {
    const newExpandedPanel = isExpanded ? customerId : null;
    setExpandedPanel(newExpandedPanel);
    
    // Jeśli panel jest rozwijany i nie mamy jeszcze receptur dla tego klienta, pobierz je
    if (isExpanded && (!customerRecipes[customerId] || customerRecipes[customerId].length === 0)) {
      fetchRecipesForCustomer(customerId);
    }
  };

  const handleDeleteRecipe = async (recipeId) => {
    if (window.confirm('Czy na pewno chcesz usunąć tę recepturę?')) {
      try {
        await deleteRecipe(recipeId);
        showSuccess('Receptura została usunięta');
        
        // Odśwież właściwą listę po usunięciu
        if (tabValue === 0) {
          // Odśwież również indeks wyszukiwania po usunięciu receptury
          await searchService.refreshIndex('recipes');
          fetchRecipes();
        } else {
          // W widoku grupowanym - odśwież tylko dane dla aktualnie rozwiniętego klienta
          if (expandedPanel) {
            // Odśwież indeks przed pobraniem nowych danych
            await searchService.refreshIndex('recipes');
            fetchRecipesForCustomer(expandedPanel);
          }
        }
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
    setPage(1); // Reset do pierwszej strony po zmianie filtra
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
                <TableCell onClick={() => handleTableSort('name')} style={{ cursor: 'pointer' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    SKU
                    {tableSort.field === 'name' && (
                      <ArrowDropUpIcon 
                        sx={{ 
                          transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.2s'
                        }} 
                      />
                    )}
                  </Box>
                </TableCell>
                <TableCell onClick={() => handleTableSort('description')} style={{ cursor: 'pointer' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    Opis
                    {tableSort.field === 'description' && (
                      <ArrowDropUpIcon 
                        sx={{ 
                          transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.2s'
                        }} 
                      />
                    )}
                  </Box>
                </TableCell>
                <TableCell onClick={() => handleTableSort('customer')} style={{ cursor: 'pointer' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    Klient
                    {tableSort.field === 'customer' && (
                      <ArrowDropUpIcon 
                        sx={{ 
                          transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.2s'
                        }} 
                      />
                    )}
                  </Box>
                </TableCell>
                <TableCell onClick={() => handleTableSort('updatedAt')} style={{ cursor: 'pointer' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    Ostatnia aktualizacja
                    {tableSort.field === 'updatedAt' && (
                      <ArrowDropUpIcon 
                        sx={{ 
                          transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.2s'
                        }} 
                      />
                    )}
                  </Box>
                </TableCell>
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
                  <TableCell>
                    {recipe.updatedAt 
                      ? (recipe.updatedAt && typeof recipe.updatedAt === 'object' && typeof recipe.updatedAt.toDate === 'function'
                         ? formatDate(recipe.updatedAt.toDate()) 
                         : formatDate(recipe.updatedAt)) 
                      : '-'}
                  </TableCell>
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
  
  // Renderowanie widoku zgrupowanego wg klientów jako zwijane panele
  const renderGroupedRecipes = () => {
    // Sprawdź, czy mamy klientów do wyświetlenia
    if (Object.keys(groupedRecipes).length === 0) {
      return (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      );
    }
        
        return (
      <Box>
        {/* Panele dla każdego klienta */}
        {Object.values(groupedRecipes).map((group) => (
          <Accordion 
            key={group.id} 
            expanded={expandedPanel === group.id} 
            onChange={handlePanelChange(group.id)}
            sx={{ mb: 2 }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{ bgcolor: 'action.hover' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                {group.id === 'noCustomer' ? (
                  <Typography variant="subtitle1">Receptury ogólne</Typography>
              ) : (
                  <>
                  <PersonIcon sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="subtitle1">{group.name}</Typography>
                  </>
                )}
                
                {/* Dodajemy licznik receptur, jeśli został już załadowany */}
                {customerRecipes[group.id] && (
                  <Chip 
                    label={`${customerRecipes[group.id].length} receptur`}
                    size="small"
                    sx={{ ml: 2 }}
                  />
                )}
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {loadingCustomerRecipes[group.id] ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                  <CircularProgress />
                </Box>
              ) : customerRecipes[group.id] ? (
                customerRecipes[group.id].length > 0 ? (
                  renderRecipesTable(customerRecipes[group.id])
                ) : (
                  <Typography variant="body2" color="text.secondary" align="center">
                    Brak receptur dla tego klienta
                  </Typography>
                )
              ) : (
                <Typography variant="body2" color="text.secondary" align="center">
                  Kliknij, aby załadować receptury
                </Typography>
              )}
            </AccordionDetails>
          </Accordion>
        ))}
          </Box>
        );
  };

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
        <Box sx={{ display: 'flex', gap: 2 }}>
          {/* Przycisk do odświeżania indeksu wyszukiwania */}
          <Tooltip title="Odśwież indeks wyszukiwania">
            <Button
              variant="outlined"
              startIcon={<CachedIcon />}
              onClick={refreshSearchIndex}
              disabled={loading}
            >
              Odśwież indeks
            </Button>
          </Tooltip>
          
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          component={Link}
          to="/recipes/new"
        >
          Dodaj recepturę
        </Button>
        </Box>
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
      
      {/* Informacja o indeksie wyszukiwania */}
      {searchIndexStatus.isLoaded && (
        <Box sx={{ mb: 2 }}>
          <Typography variant="body2" color="text.secondary">
            Indeks wyszukiwania aktywny
            {searchIndexStatus.lastRefreshed && 
              ` (ostatnie odświeżenie: ${formatDate(searchIndexStatus.lastRefreshed)})`}
          </Typography>
        </Box>
      )}
      
      <Box sx={{ mb: 3 }}>
        <Tabs value={tabValue} onChange={handleTabChange} textColor="primary" indicatorColor="primary">
          <Tab label="Lista receptur" />
          <Tab label="Grupowane wg klienta" />
        </Tabs>
      </Box>
      
      {loading && tabValue === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        tabValue === 0 ? (
          <>
            {renderRecipesTable(filteredRecipes)}
            
            {/* Dodajemy kontrolki paginacji */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 3 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <Typography variant="body2">
                  Wierszy na stronę:
                </Typography>
                <Select
                  value={limit}
                  onChange={handleChangeRowsPerPage}
                  size="small"
                >
                  {[5, 10, 25, 50].map(pageSize => (
                    <MenuItem key={pageSize} value={pageSize}>
                      {pageSize}
                    </MenuItem>
                  ))}
                </Select>
              </Box>
              <Pagination 
                count={totalPages}
                page={page}
                onChange={handleChangePage}
                color="primary"
                showFirstButton
                showLastButton
              />
              <Typography variant="body2">
                Wyświetlanie {filteredRecipes.length > 0 ? (page - 1) * limit + 1 : 0}-{Math.min(page * limit, totalItems)} z {totalItems}
              </Typography>
            </Box>
          </>
        ) : (
          renderGroupedRecipes()
        )
      )}
    </Box>
  );
};

export default RecipeList;