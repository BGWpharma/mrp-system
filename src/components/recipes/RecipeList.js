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
  CircularProgress,
  useTheme,
  useMediaQuery,
  Card,
  CardContent,
  CardActions,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress
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
  Cached as CachedIcon,
  Download as DownloadIcon,
  Sync as SyncIcon
} from '@mui/icons-material';
import { getAllRecipes, deleteRecipe, getRecipesByCustomer, getRecipesWithPagination, syncAllRecipesCAS } from '../../services/recipeService';
import { getInventoryItemByRecipeId } from '../../services/inventoryService';
import { useCustomersCache } from '../../hooks/useCustomersCache';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';
import searchService from '../../services/searchService';
import { getAllWorkstations } from '../../services/workstationService';
import { useRecipeListState } from '../../contexts/RecipeListStateContext';

// UWAGA: Do poprawnego działania zapytań filtrowania wg. klienta wymagany jest
// indeks złożony w Firestore dla kolekcji "recipes":
// - Pola do zaindeksowania: customerId (Ascending), updatedAt (Descending)
// Bez tego indeksu zapytania filtrujące nie będą działać poprawnie.

const RecipeList = () => {
  const [recipes, setRecipes] = useState([]);
  const [filteredRecipes, setFilteredRecipes] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  // Użyj nowego hooka do buforowania danych klientów
  const { customers, loading: loadingCustomers, error: customersError, refreshCustomers } = useCustomersCache();
  
  // Użyj kontekstu stanu listy receptur
  const { state: listState, actions: listActions } = useRecipeListState();
  
  // Zmienne stanu z kontekstu
  const searchTerm = listState.searchTerm;
  const selectedCustomerId = listState.selectedCustomerId;
  const notesFilter = listState.notesFilter;
  const tabValue = listState.tabValue;
  
  // Grupujemy receptury wg klienta
  const [groupedRecipes, setGroupedRecipes] = useState({});
  
  // Dodajemy stan dla powiadomienia o indeksie Firestore
  const [showIndexAlert, setShowIndexAlert] = useState(false);

  const page = listState.page;
  const limit = listState.limit;
  const tableSort = listState.tableSort;
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Dodajemy stan dla debounce wyszukiwania
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [searchTimeout, setSearchTimeout] = useState(null);

  // Dodajemy stan dla rozwiniętych paneli klientów
  const expandedPanel = listState.expandedPanel;
  const [customerRecipes, setCustomerRecipes] = useState({});
  const [loadingCustomerRecipes, setLoadingCustomerRecipes] = useState({});
  
  // Dodaje stan dla informacji o indeksie wyszukiwania
  const [searchIndexStatus, setSearchIndexStatus] = useState({
    isLoaded: false,
    lastRefreshed: null
  });

  // Dodajemy stan dla stanowisk produkcyjnych
  const [workstations, setWorkstations] = useState([]);
  
  // Stan do przechowywania pozycji magazynowych powiązanych z recepturami
  const [inventoryProducts, setInventoryProducts] = useState({});
  
  // Stan dla synchronizacji CAS
  const [syncingCAS, setSyncingCAS] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const mode = theme.palette.mode;
  
  // Funkcja do pobierania stanowisk produkcyjnych
  const fetchWorkstations = useCallback(async () => {
    try {
      const workstationsData = await getAllWorkstations();
      setWorkstations(workstationsData);
    } catch (error) {
      console.error('Błąd podczas pobierania stanowisk:', error);
    }
  }, []);
  
  // Funkcja do pobierania pozycji magazynowych dla receptur
  const fetchInventoryProducts = useCallback(async (recipesList) => {
    const inventoryProductsMap = {};
    
    for (const recipe of recipesList) {
      try {
        const inventoryItem = await getInventoryItemByRecipeId(recipe.id);
        if (inventoryItem) {
          inventoryProductsMap[recipe.id] = inventoryItem;
        }
      } catch (error) {
        console.error(`Błąd podczas pobierania pozycji magazynowej dla receptury ${recipe.id}:`, error);
      }
    }
    
    setInventoryProducts(prev => ({ ...prev, ...inventoryProductsMap }));
  }, []);
  
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

  // Czyść cache receptur dla klientów gdy zmieni się filtrowanie
  useEffect(() => {
    setCustomerRecipes({});
  }, [debouncedSearchTerm, notesFilter]);
  
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
        customerId: selectedCustomerId || null,
        hasNotes: notesFilter
      };
      
      // Użyj nowego searchService zamiast bezpośredniego zapytania do Firestore
      const result = await searchService.searchRecipes(debouncedSearchTerm, searchOptions);
          
      // Ustawienie stanów po wyszukiwaniu
      setRecipes(result.data);
      setFilteredRecipes(result.data);
      setTotalItems(result.pagination.totalItems);
      setTotalPages(result.pagination.totalPages);
      
      // Pobierz pozycje magazynowe dla receptur
      if (result.data.length > 0) {
        await fetchInventoryProducts(result.data);
      }
      
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
          debouncedSearchTerm,
          notesFilter
        );
        
        setRecipes(fallbackResult.data);
        setFilteredRecipes(fallbackResult.data);
        setTotalItems(fallbackResult.pagination.totalItems);
        setTotalPages(fallbackResult.pagination.totalPages);
        
        // Pobierz pozycje magazynowe dla receptur w fallback
        if (fallbackResult.data.length > 0) {
          await fetchInventoryProducts(fallbackResult.data);
        }
      } catch (fallbackError) {
        console.error('Błąd podczas awaryjnego pobierania receptur:', fallbackError);
        showError('Nie udało się pobrać receptur');
      }
      
      setLoading(false);
    }
  }, [page, limit, tableSort, selectedCustomerId, debouncedSearchTerm, notesFilter, showError]);
      
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
  
  // Pobieranie stanowisk produkcyjnych przy ładowaniu komponentu
  useEffect(() => {
    fetchWorkstations();
  }, [fetchWorkstations]);
  
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
        // Uwzględnij filtr notatek
        hasNotes: notesFilter,
        // Pobierz wszystkie wyniki (duża wartość limitu)
        page: 1,
        limit: 1000
      };
      
      // Wykonaj wyszukiwanie z opcjami
      const result = await searchService.searchRecipes(debouncedSearchTerm, searchOptions);
      customerRecipesData = result.data;
      
      // Pobierz pozycje magazynowe dla receptur klienta
      if (customerRecipesData.length > 0) {
        await fetchInventoryProducts(customerRecipesData);
      }
      
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
        
        // Zastosuj filtrowanie według notatek, jeśli istnieje
        if (notesFilter !== null) {
          fallbackData = fallbackData.filter(recipe => {
            const hasRecipeNotes = recipe.notes && recipe.notes.trim() !== '';
            return notesFilter ? hasRecipeNotes : !hasRecipeNotes;
          });
        }
        
        // Zastosuj filtrowanie według searchTerm, jeśli istnieje
        if (debouncedSearchTerm && debouncedSearchTerm.trim() !== '') {
          const searchTermLower = debouncedSearchTerm.toLowerCase().trim();
          fallbackData = fallbackData.filter(recipe => 
            (recipe.name && recipe.name.toLowerCase().includes(searchTermLower)) ||
            (recipe.description && recipe.description.toLowerCase().includes(searchTermLower))
          );
        }
        
        // Pobierz pozycje magazynowe dla receptur klienta (fallback)
        if (fallbackData.length > 0) {
          await fetchInventoryProducts(fallbackData);
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
    listActions.setTableSort({
      field,
      order: newOrder
    });
    listActions.setPage(1); // Reset do pierwszej strony po zmianie sortowania
  };

  // Obsługa zmiany strony paginacji
  const handleChangePage = (event, newPage) => {
    listActions.setPage(newPage);
  };
  
  // Obsługa zmiany liczby elementów na stronę
  const handleChangeRowsPerPage = (event) => {
    listActions.setLimit(parseInt(event.target.value, 10));
    listActions.setPage(1); // Wracamy na pierwszą stronę po zmianie rozmiaru
  };
  
  // Obsługa kliknięcia panelu klienta
  const handlePanelChange = (customerId) => (event, isExpanded) => {
    const newExpandedPanel = isExpanded ? customerId : null;
    listActions.setExpandedPanel(newExpandedPanel);
    
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
    listActions.setSelectedCustomerId(newCustomerId);
    listActions.setPage(1); // Reset do pierwszej strony po zmianie filtra
  };

  const handleNotesFilterChange = (event) => {
    const newNotesFilter = event.target.value === '' ? null : event.target.value === 'true';
    console.log('Zmieniono filtr notatek na:', newNotesFilter);
    listActions.setNotesFilter(newNotesFilter);
    listActions.setPage(1); // Reset do pierwszej strony po zmianie filtra
    
    // Wyczyść cache receptur dla klientów aby wymusić ponowne pobranie z nowym filtrem
    setCustomerRecipes({});
    
    // Jeśli jesteśmy w widoku grupowanym i mamy rozwinięty panel, odśwież go
    if (tabValue === 1 && expandedPanel) {
      fetchRecipesForCustomer(expandedPanel);
    }
  };
  
  const handleTabChange = (event, newValue) => {
    listActions.setTabValue(newValue);
  };

  const handleSearchTermChange = (e) => {
    listActions.setSearchTerm(e.target.value);
  };

  // Funkcja eksportu receptur do CSV
  const handleExportCSV = async () => {
    try {
      // Pobierz wszystkie receptury dla eksportu bezpośrednio z Firestore (pełne dane)
      let allRecipes = [];
      
      // Zawsze używaj bezpośredniego pobierania z Firestore dla eksportu, aby mieć pełne dane
      try {
        // Pobierz wszystkie receptury bezpośrednio z getAllRecipes
        const allRecipesFromFirestore = await getAllRecipes();
        
        // Zastosuj filtry jeśli są aktywne
        allRecipes = allRecipesFromFirestore;
        
        // Filtruj po kliencie jeśli wybrano
        if (selectedCustomerId) {
          allRecipes = allRecipes.filter(recipe => recipe.customerId === selectedCustomerId);
        }
        
        // Filtruj po notatkach jeśli wybrano
        if (notesFilter !== null) {
          allRecipes = allRecipes.filter(recipe => {
            const hasRecipeNotes = recipe.notes && recipe.notes.trim() !== '';
            return notesFilter ? hasRecipeNotes : !hasRecipeNotes;
          });
        }
        
        // Filtruj po wyszukiwanym terminie jeśli jest
        if (debouncedSearchTerm && debouncedSearchTerm.trim() !== '') {
          const searchTermLower = debouncedSearchTerm.toLowerCase().trim();
          allRecipes = allRecipes.filter(recipe => 
            (recipe.name && recipe.name.toLowerCase().includes(searchTermLower)) ||
            (recipe.description && recipe.description.toLowerCase().includes(searchTermLower))
          );
        }
      } catch (error) {
        console.error('Błąd podczas pobierania receptur z Firestore:', error);
        showError('Nie udało się pobrać receptur do eksportu');
        return;
      }

      if (allRecipes.length === 0) {
        showError('Brak receptur do eksportu');
        return;
      }

      // Przygotuj dane dla CSV zgodnie z wymaganymi nagłówkami
      const csvData = allRecipes.map((recipe, index) => {
        // Znajdź klienta
        const customer = customers.find(c => c.id === recipe.customerId);
        
        // Znajdź stanowisko produkcyjne
        const workstation = workstations.find(w => w.id === recipe.defaultWorkstationId);
        
        // Sprawdź różne możliwe pola dla czasu produkcji
        let timePerPiece = 0;
        if (recipe.productionTimePerUnit) {
          timePerPiece = parseFloat(recipe.productionTimePerUnit);
        } else if (recipe.prepTime) {
          timePerPiece = parseFloat(recipe.prepTime);
        } else if (recipe.preparationTime) {
          timePerPiece = parseFloat(recipe.preparationTime);
        }
        
        // Oblicz liczbę komponentów (składników + komponenty)
        const ingredientsCount = recipe.ingredients ? recipe.ingredients.length : 0;
        const componentsCount = recipe.components ? recipe.components.length : 0;
        const totalComponents = ingredientsCount + componentsCount;
        
        return {
          SKU: recipe.name || '',
          description: recipe.description || '',
          Client: customer ? customer.name : '',
          Workstation: workstation ? workstation.name : '',
          'cost/piece': recipe.processingCostPerUnit ? recipe.processingCostPerUnit.toFixed(2) : '0.00',
          'time/piece': timePerPiece.toFixed(2),
          'Amount of Components': totalComponents.toString()
        };
      });

      // Utwórz nagłówki CSV
      const headers = ['SKU', 'description', 'Client', 'Workstation', 'cost/piece', 'time/piece', 'Amount of Components'];
      
      // Utwórz zawartość CSV
      const csvContent = [
        headers.map(header => `"${header}"`).join(','),
        ...csvData.map(row => 
          headers.map(header => `"${row[header] || ''}"`).join(',')
        )
      ].join('\n');

      // Utwórz blob i pobierz plik
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      // Nazwa pliku z aktualną datą
      const currentDate = new Date().toISOString().slice(0, 10);
      const filename = `receptury_${currentDate}.csv`;
      
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showSuccess(`Wyeksportowano ${allRecipes.length} receptur do pliku CSV`);
    } catch (error) {
      console.error('Błąd podczas eksportu CSV:', error);
      showError('Nie udało się wyeksportować receptur do CSV');
    }
  };

  // Funkcja do synchronizacji numerów CAS dla wszystkich receptur
  const handleSyncAllCAS = async () => {
    setSyncingCAS(true);
    setSyncProgress(null);
    
    try {
      const results = await syncAllRecipesCAS((progress) => {
        setSyncProgress(progress);
      });
      
      if (results.success) {
        showSuccess(
          `Synchronizacja zakończona! Zaktualizowano ${results.syncedRecipes} receptur ` +
          `(pominięto ${results.skippedRecipes}, błędy: ${results.errorRecipes})`
        );
        
        // Odśwież listę receptur
        await fetchRecipes();
      } else {
        showError(`Błąd synchronizacji: ${results.error}`);
      }
    } catch (error) {
      console.error('Błąd podczas synchronizacji CAS:', error);
      showError('Błąd podczas synchronizacji numerów CAS: ' + error.message);
    } finally {
      setSyncingCAS(false);
      setSyncProgress(null);
    }
  };

  // Renderowanie tabeli receptur
  const renderRecipesTable = (recipesToRender) => {
    // Dla urządzeń mobilnych wyświetlamy karty zamiast tabeli
    if (isMobile) {
      return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {recipesToRender.length === 0 ? (
            <Typography variant="body1" align="center" sx={{ py: 2 }}>
              Nie znaleziono receptur
            </Typography>
          ) : (
            recipesToRender.map((recipe) => {
              // Znajdź klienta przypisanego do receptury
              const customer = customers.find(c => c.id === recipe.customerId);
              
              return (
                <Card key={recipe.id} variant="outlined" sx={{ 
                  mb: 1, 
                  bgcolor: mode === 'dark' ? 'background.paper' : 'rgb(249, 249, 249)', 
                  borderRadius: '4px',
                  boxShadow: 'none',
                  overflow: 'visible',
                  borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'
                }}>
                  <CardContent sx={{ pb: 0, pt: 1.5, px: 1.5 }}>
                    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                      <Typography variant="subtitle1" component="div" sx={{ 
                        fontWeight: 'bold', 
                        fontSize: '0.9rem',
                        mb: 0.5 
                      }}>
                        {recipe.name}
                      </Typography>
                      
                      <Typography variant="body2" color="text.secondary" sx={{ 
                        fontSize: '0.8rem',
                        mb: 0.5
                      }}>
                        {recipe.description || '-'}
                      </Typography>
                      
                      {customer && (
                        <Box sx={{ mb: 0.5 }}>
                          <Box 
                            component="span" 
                            sx={{ 
                              display: 'inline-flex', 
                              alignItems: 'center',
                              fontSize: '0.75rem',
                              color: 'primary.main'
                            }}
                          >
                            <PersonIcon sx={{ fontSize: '0.9rem', mr: 0.5 }} />
                            {customer.name}
                          </Box>
                        </Box>
                      )}
                      
                      {inventoryProducts[recipe.id] && (
                        <Box sx={{ mb: 0.5 }}>
                          <Link 
                            to={`/inventory/${inventoryProducts[recipe.id].id}`} 
                            style={{ textDecoration: 'none', color: 'inherit' }}
                          >
                            <Chip 
                              label={`Magazyn: ${inventoryProducts[recipe.id].quantity || 0} ${inventoryProducts[recipe.id].unit || 'szt.'} - ${inventoryProducts[recipe.id].name}`}
                              size="small"
                              color="secondary"
                              variant="outlined"
                              sx={{ fontSize: '0.7rem', cursor: 'pointer' }}
                            />
                          </Link>
                        </Box>
                      )}
                    </Box>
                  </CardContent>
                  
                  <Box sx={{ 
                    display: 'flex', 
                    justifyContent: 'flex-end', 
                    p: 0.5,
                    mt: 1,
                    borderTop: `1px solid ${mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)'}`
                  }}>
                    <IconButton 
                      size="small" 
                      color="primary"
                      sx={{ padding: '4px' }}
                      component={Link} 
                      to={`/recipes/${recipe.id}`}
                    >
                      <ViewIcon fontSize="small" />
                    </IconButton>
                    <IconButton 
                      size="small" 
                      color="primary"
                      sx={{ padding: '4px' }}
                      component={Link} 
                      to={`/recipes/${recipe.id}/edit`}
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton 
                      size="small" 
                      color="error"
                      sx={{ padding: '4px' }}
                      onClick={() => handleDeleteRecipe(recipe.id)}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                    <IconButton 
                      size="small" 
                      color="secondary"
                      sx={{ padding: '4px' }}
                      component={Link}
                      to={`/recipes/${recipe.id}/edit`}
                      state={{ openProductDialog: true }}
                    >
                      <ProductIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Card>
              );
            })
          )}
        </Box>
      );
    }
    
    // Dla większych ekranów wyświetlamy standardową tabelę
    return (
      <TableContainer component={Paper} variant="outlined" sx={{ overflowX: 'auto' }}>
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
              <TableCell sx={{ width: '280px', maxWidth: '280px' }}>Pozycja magazynowa</TableCell>
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
                <TableCell colSpan={6} align="center">
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
                    <TableCell sx={{ width: '280px', maxWidth: '280px', overflow: 'hidden' }}>
                      {inventoryProducts[recipe.id] ? (
                        <Link 
                          to={`/inventory/${inventoryProducts[recipe.id].id}`} 
                          style={{ textDecoration: 'none', color: 'inherit' }}
                        >
                          <Chip 
                            label={`${inventoryProducts[recipe.id].quantity || 0} ${inventoryProducts[recipe.id].unit || 'szt.'} - ${inventoryProducts[recipe.id].name}`}
                            size="small"
                            color="secondary"
                            variant="outlined"
                            sx={{ 
                              cursor: 'pointer',
                              maxWidth: '100%',
                              '& .MuiChip-label': {
                                textOverflow: 'ellipsis',
                                overflow: 'hidden',
                                whiteSpace: 'nowrap',
                                maxWidth: '240px'
                              }
                            }}
                            title={`${inventoryProducts[recipe.id].quantity || 0} ${inventoryProducts[recipe.id].unit || 'szt.'} - ${inventoryProducts[recipe.id].name}`}
                          />
                        </Link>
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Brak pozycji
                        </Typography>
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
  };
  
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
            sx={{ 
              mb: 2,
              bgcolor: mode === 'dark' ? 'background.paper' : undefined,
              borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.12)' : undefined
            }}
          >
            <AccordionSummary
              expandIcon={<ExpandMoreIcon />}
              sx={{ 
                bgcolor: mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'action.hover'
              }}
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
            <AccordionDetails sx={{ 
              bgcolor: mode === 'dark' ? 'background.paper' : undefined
            }}>
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
    <Box sx={{ 
      maxWidth: '1200px', 
      mx: 'auto', 
      py: isMobile ? 1 : 3, 
      px: isMobile ? 1 : 0,
      bgcolor: isMobile ? (mode === 'dark' ? 'background.paper' : '#f5f5f5') : 'transparent'
    }}>
      {/* Alert o potrzebnym indeksie */}
      {showIndexAlert && (
        <Alert 
          severity="warning" 
          sx={{ mb: isMobile ? 2 : 3 }}
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
      
      <Box sx={{ 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'stretch' : 'center', 
        mb: isMobile ? 2 : 3,
        gap: isMobile ? 1 : 0
      }}>
        <Typography variant="h5">Receptury</Typography>
        <Box sx={{ 
          display: 'flex', 
          gap: 1, 
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          justifyContent: isMobile ? 'space-between' : 'flex-end'
        }}>
          {/* Przycisk do odświeżania indeksu wyszukiwania */}
          {!isMobile && (
            <Tooltip title="Odśwież indeks wyszukiwania">
              <Button
                variant="outlined"
                startIcon={<CachedIcon />}
                onClick={refreshSearchIndex}
                disabled={loading}
                size={isMobile ? "small" : "medium"}
              >
                Odśwież indeks
              </Button>
            </Tooltip>
          )}

          {/* Przycisk eksportu CSV */}
          <Tooltip title="Eksportuj receptury do pliku CSV">
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleExportCSV}
              disabled={loading || (tabValue === 0 ? filteredRecipes.length === 0 : (!expandedPanel || !customerRecipes[expandedPanel] || customerRecipes[expandedPanel].length === 0))}
              size={isMobile ? "small" : "medium"}
              color="secondary"
            >
              {isMobile ? 'CSV' : 'Eksportuj CSV'}
            </Button>
          </Tooltip>

          {/* Przycisk synchronizacji numerów CAS */}
          <Tooltip title="Aktualizuj numery CAS we wszystkich recepturach">
            <Button
              variant="outlined"
              startIcon={syncingCAS ? <CircularProgress size={16} /> : <SyncIcon />}
              onClick={handleSyncAllCAS}
              disabled={loading || syncingCAS}
              size={isMobile ? "small" : "medium"}
              color="warning"
            >
              {isMobile ? 'CAS' : 'Aktualizuj CAS'}
            </Button>
          </Tooltip>
          
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            component={Link}
            to="/recipes/new"
            size={isMobile ? "small" : "medium"}
            fullWidth={isMobile}
            sx={isMobile ? {
              bgcolor: mode === 'dark' ? 'primary.main' : '#1976d2',
              color: 'white',
              fontWeight: 'normal',
              textTransform: 'none',
              borderRadius: '4px',
              py: 1,
              fontSize: '0.9rem'
            } : {}}
          >
            {isMobile ? 'Dodaj recepturę' : 'Dodaj recepturę'}
          </Button>
        </Box>
      </Box>
      
      <Box sx={{ 
        mb: isMobile ? 2 : 3, 
        display: 'flex', 
        flexDirection: isMobile ? 'column' : 'row',
        flexWrap: 'wrap', 
        gap: isMobile ? 1 : 2
      }}>
        <TextField
          placeholder="Szukaj receptur..."
          value={searchTerm}
          onChange={handleSearchTermChange}
          variant="outlined"
          size="small"
          fullWidth={isMobile}
          sx={{ 
            flexGrow: 1, 
            minWidth: isMobile ? 'auto' : '200px',
            '& .MuiOutlinedInput-root': isMobile ? {
              borderRadius: '4px',
              bgcolor: mode === 'dark' ? 'background.paper' : 'white',
              '& fieldset': {
                borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.23)' : 'rgba(0, 0, 0, 0.15)',
              },
            } : {}
          }}
          InputProps={{
            startAdornment: <SearchIcon sx={{ color: 'action.active', mr: 1 }} />
          }}
        />
        
        <FormControl 
          sx={{ 
            minWidth: isMobile ? 'auto' : '200px',
            '& .MuiOutlinedInput-root': isMobile ? {
              borderRadius: '4px',
              bgcolor: mode === 'dark' ? 'background.paper' : 'white',
              '& fieldset': {
                borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.23)' : 'rgba(0, 0, 0, 0.15)',
              },
            } : {}
          }} 
          size="small"
          fullWidth={isMobile}
        >
          <InputLabel id="customer-filter-label" sx={isMobile ? { fontSize: '0.9rem' } : {}}>Filtruj wg klienta</InputLabel>
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

        <FormControl 
          sx={{ 
            minWidth: isMobile ? 'auto' : '180px',
            '& .MuiOutlinedInput-root': isMobile ? {
              borderRadius: '4px',
              bgcolor: mode === 'dark' ? 'background.paper' : 'white',
              '& fieldset': {
                borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.23)' : 'rgba(0, 0, 0, 0.15)',
              },
            } : {}
          }} 
          size="small"
          fullWidth={isMobile}
        >
          <InputLabel id="notes-filter-label" sx={isMobile ? { fontSize: '0.9rem' } : {}}>Filtruj wg notatek</InputLabel>
          <Select
            labelId="notes-filter-label"
            value={notesFilter === null ? '' : notesFilter.toString()}
            onChange={handleNotesFilterChange}
            label="Filtruj wg notatek"
            displayEmpty
            startAdornment={<InfoIcon sx={{ color: 'action.active', mr: 1 }} />}
          >
            <MenuItem value="">Wszystkie receptury</MenuItem>
            <MenuItem value="true">Z notatkami</MenuItem>
            <MenuItem value="false">Bez notatek</MenuItem>
          </Select>
        </FormControl>
      </Box>
      
      {/* Informacja o indeksie wyszukiwania */}
      {searchIndexStatus.isLoaded && (
        <Box sx={{ mb: isMobile ? 1 : 2 }}>
          <Typography 
            variant="body2" 
            color="text.secondary" 
            sx={isMobile ? { 
              fontSize: '0.75rem', 
              bgcolor: mode === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)',
              p: 1,
              borderRadius: '4px'
            } : {}}
          >
            Indeks wyszukiwania aktywny
            {searchIndexStatus.lastRefreshed && 
              ` (ostatnie odświeżenie: ${formatDate(searchIndexStatus.lastRefreshed)})`}
          </Typography>
        </Box>
      )}
      
      <Box sx={{ mb: isMobile ? 2 : 3 }}>
        <Tabs 
          value={tabValue} 
          onChange={handleTabChange} 
          textColor="primary" 
          indicatorColor="primary"
          variant={isMobile ? "fullWidth" : "standard"}
          sx={isMobile ? {
            '& .MuiTab-root': {
              textTransform: 'none',
              fontSize: '0.85rem',
              fontWeight: 'medium',
              minHeight: '40px'
            },
            bgcolor: mode === 'dark' ? 'background.paper' : undefined,
            borderRadius: '4px'
          } : {}}
        >
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
            
            {/* Kontrolki paginacji dostosowane do urządzeń mobilnych */}
            <Box sx={{ 
              display: 'flex', 
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between', 
              alignItems: isMobile ? 'center' : 'center', 
              mt: isMobile ? 2 : 3,
              gap: isMobile ? 2 : 0
            }}>
              {!isMobile && (
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
              )}
              
              <Pagination 
                count={totalPages}
                page={page}
                onChange={handleChangePage}
                color="primary"
                showFirstButton={!isMobile}
                showLastButton={!isMobile}
                size={isMobile ? "small" : "medium"}
                sx={mode === 'dark' && isMobile ? {
                  '& .MuiPaginationItem-root': {
                    color: 'text.primary'
                  }
                } : {}}
              />
              
              {!isMobile && (
                <Typography variant="body2">
                  Wyświetlanie {filteredRecipes.length > 0 ? (page - 1) * limit + 1 : 0}-{Math.min(page * limit, totalItems)} z {totalItems}
                </Typography>
              )}
            </Box>
          </>
        ) : (
          renderGroupedRecipes()
        )
      )}

      {/* Dialog postępu synchronizacji CAS */}
      <Dialog 
        open={syncingCAS} 
        disableEscapeKeyDown 
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>
          Synchronizacja numerów CAS
        </DialogTitle>
        <DialogContent>
          <Box sx={{ width: '100%' }}>
            {syncProgress && (
              <>
                <Typography variant="body2" gutterBottom>
                  Przetwarzanie: {syncProgress.recipeName}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {syncProgress.current} z {syncProgress.total} receptur
                </Typography>
                <LinearProgress 
                  variant="determinate" 
                  value={(syncProgress.current / syncProgress.total) * 100} 
                  sx={{ mt: 2 }}
                />
              </>
            )}
            {!syncProgress && (
              <>
                <Typography variant="body2" gutterBottom>
                  Przygotowywanie synchronizacji...
                </Typography>
                <LinearProgress sx={{ mt: 2 }} />
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Typography variant="body2" color="text.secondary">
            Proszę czekać, trwa aktualizacja numerów CAS
          </Typography>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RecipeList;