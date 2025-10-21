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
  Menu,
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
  Sync as SyncIcon,
  MoreVert as MoreVertIcon
} from '@mui/icons-material';
import { getAllRecipes, deleteRecipe, getRecipesByCustomer, getRecipesWithPagination, syncAllRecipesCAS } from '../../services/recipeService';
import { getInventoryItemByRecipeId, getBatchesForMultipleItems, getSupplierPrices } from '../../services/inventory';
import { getPurchaseOrderById } from '../../services/purchaseOrderService';
import { getSuppliersByIds } from '../../services/supplierService';
import { useCustomersCache } from '../../hooks/useCustomersCache';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
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
  const { showSuccess, showError, showInfo } = useNotification();
  const { t } = useTranslation();
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

  // Stan dla menu dropdown akcji
  const [actionsMenuAnchor, setActionsMenuAnchor] = useState(null);
  const isActionsMenuOpen = Boolean(actionsMenuAnchor);

  // Dodajemy stan dla stanowisk produkcyjnych
  const [workstations, setWorkstations] = useState([]);
  
  // Stan do przechowywania pozycji magazynowych powiązanych z recepturami
  const [inventoryProducts, setInventoryProducts] = useState({});
  
  // Stan dla synchronizacji CAS
  const [syncingCAS, setSyncingCAS] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  
  // Stan dla dialogu eksportu z dostawcami
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFilters, setExportFilters] = useState({
    customerId: '',
    notesFilter: null,
    searchTerm: ''
  });
  const [exporting, setExporting] = useState(false);
  
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
      
      showSuccess(t('recipes.list.indexUpdated'));
    
      // Aktualizacja informacji o indeksie
      setSearchIndexStatus({
        isLoaded: true,
        lastRefreshed: new Date()
      });
    } catch (error) {
      console.error('Błąd podczas odświeżania indeksu wyszukiwania:', error);
      showError(t('recipes.list.indexUpdateError'));
    } finally {
      setLoading(false);
    }
  };

  // Funkcje obsługi menu akcji
  const handleActionsMenuOpen = (event) => {
    setActionsMenuAnchor(event.currentTarget);
  };

  const handleActionsMenuClose = () => {
    setActionsMenuAnchor(null);
  };

  const handleMenuAction = (action) => {
    handleActionsMenuClose();
    switch (action) {
      case 'refreshIndex':
        refreshSearchIndex();
        break;
      case 'exportCSV':
        handleExportCSV();
        break;
      case 'exportWithSuppliers':
        handleOpenExportDialog();
        break;
      case 'syncCAS':
        handleSyncAllCAS();
        break;
      default:
        break;
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
      name: t('recipes.list.generalRecipes'),
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
    if (window.confirm(t('recipes.messages.confirmDelete'))) {
      try {
        await deleteRecipe(recipeId);
        showSuccess(t('recipes.messages.recipeDeleted'));
        
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
        showError(t('recipes.messages.deleteError', { error: error.message }));
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

      showSuccess(t('recipes.list.exportSuccess', { count: allRecipes.length }));
    } catch (error) {
      console.error('Błąd podczas eksportu CSV:', error);
      showError(t('recipes.list.exportError'));
    }
  };

  // Funkcja otwierająca dialog eksportu
  const handleOpenExportDialog = () => {
    // Ustaw domyślne filtry na podstawie aktualnych filtrów listy
    setExportFilters({
      customerId: selectedCustomerId || '',
      notesFilter: notesFilter,
      searchTerm: debouncedSearchTerm || ''
    });
    setExportDialogOpen(true);
  };

  // Funkcja zamykająca dialog eksportu
  const handleCloseExportDialog = () => {
    setExportDialogOpen(false);
  };

  // Funkcja obsługująca zmiany filtrów w dialogu
  const handleExportFilterChange = (field, value) => {
    setExportFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Funkcja eksportu receptur ze składnikami i dostawcami
  const handleExportRecipesWithSuppliers = async () => {
    try {
      setExporting(true);
      setExportDialogOpen(false);
      showInfo('Przygotowywanie eksportu receptur z dostawcami...');

      // Pobierz wszystkie receptury (z zastosowanymi filtrami z dialogu)
      let allRecipes = [];
      
      try {
        const allRecipesFromFirestore = await getAllRecipes();
        allRecipes = allRecipesFromFirestore;
        
        // Zastosuj filtry z dialogu eksportu
        if (exportFilters.customerId) {
          allRecipes = allRecipes.filter(recipe => recipe.customerId === exportFilters.customerId);
        }
        
        if (exportFilters.notesFilter !== null) {
          allRecipes = allRecipes.filter(recipe => {
            const hasRecipeNotes = recipe.notes && recipe.notes.trim() !== '';
            return exportFilters.notesFilter ? hasRecipeNotes : !hasRecipeNotes;
          });
        }
        
        if (exportFilters.searchTerm && exportFilters.searchTerm.trim() !== '') {
          const searchTermLower = exportFilters.searchTerm.toLowerCase().trim();
          allRecipes = allRecipes.filter(recipe => 
            (recipe.name && recipe.name.toLowerCase().includes(searchTermLower)) ||
            (recipe.description && recipe.description.toLowerCase().includes(searchTermLower))
          );
        }
      } catch (error) {
        console.error('Błąd podczas pobierania receptur:', error);
        showError('Nie udało się pobrać receptur do eksportu');
        setExporting(false);
        return;
      }

      if (allRecipes.length === 0) {
        showError('Brak receptur do eksportu');
        setExporting(false);
        return;
      }

      showInfo('Pobieranie danych o partiach i zamówieniach zakupu...');

      // KROK 1: Zbierz wszystkie unikalne ID składników ze wszystkich receptur
      const allIngredientIds = new Set();
      allRecipes.forEach(recipe => {
        (recipe.ingredients || []).forEach(ingredient => {
          if (ingredient.id) {
            allIngredientIds.add(ingredient.id);
          }
        });
      });

      console.log(`📦 Znaleziono ${allIngredientIds.size} unikalnych składników w recepturach`);

      // KROK 2: Pobierz partie dla wszystkich składników (w partiach po 100)
      let batchesMap = {};
      if (allIngredientIds.size > 0) {
        try {
          const ingredientIdsArray = Array.from(allIngredientIds);
          const batchSize = 100; // Limit walidacji
          
          // Podziel na partie po 100 elementów
          for (let i = 0; i < ingredientIdsArray.length; i += batchSize) {
            const batch = ingredientIdsArray.slice(i, i + batchSize);
            
            showInfo(`Pobieranie partii dla składników ${i + 1}-${Math.min(i + batchSize, ingredientIdsArray.length)}/${ingredientIdsArray.length}...`);
            
            const batchResults = await getBatchesForMultipleItems(batch);
            
            // Scal wyniki
            batchesMap = { ...batchesMap, ...batchResults };
          }
          
          const totalBatches = Object.values(batchesMap).reduce((sum, batches) => sum + batches.length, 0);
          console.log(`📦 Pobrano ${totalBatches} partii dla ${allIngredientIds.size} składników`);
        } catch (error) {
          console.error('Błąd podczas pobierania partii:', error);
          showError('Nie udało się pobrać partii magazynowych');
        }
      }

      // KROK 3: Zbierz wszystkie unikalne ID zamówień zakupu z partii
      const allPOIds = new Set();
      Object.values(batchesMap).forEach(batches => {
        batches.forEach(batch => {
          const poId = batch.purchaseOrderDetails?.id || batch.sourceDetails?.orderId;
          if (poId) {
            allPOIds.add(poId);
          }
        });
      });

      console.log(`📑 Znaleziono ${allPOIds.size} unikalnych zamówień zakupu`);

      // KROK 4: Pobierz wszystkie Purchase Orders
      const purchaseOrdersMap = {};
      if (allPOIds.size > 0) {
        showInfo(`Pobieranie ${allPOIds.size} zamówień zakupu...`);
        let loadedPOs = 0;
        
        for (const poId of allPOIds) {
          try {
            const po = await getPurchaseOrderById(poId);
            if (po) {
              purchaseOrdersMap[poId] = po;
              loadedPOs++;
              
              // Informuj o postępie co 10 PO
              if (loadedPOs % 10 === 0) {
                showInfo(`Pobrano ${loadedPOs}/${allPOIds.size} zamówień zakupu...`);
              }
            }
          } catch (error) {
            console.error(`Błąd podczas pobierania PO ${poId}:`, error);
          }
        }
        
        console.log(`📑 Pobrano ${loadedPOs} zamówień zakupu`);
      }

      // KROK 4A: Pobierz ceny dostawców z pozycji magazynowych
      const supplierPricesMap = {};
      const allSupplierIds = new Set();
      
      if (allIngredientIds.size > 0) {
        showInfo('Pobieranie cen dostawców z pozycji magazynowych...');
        let processedItems = 0;
        
        for (const itemId of allIngredientIds) {
          try {
            const supplierPrices = await getSupplierPrices(itemId, { includeInactive: false });
            if (supplierPrices && supplierPrices.length > 0) {
              supplierPricesMap[itemId] = supplierPrices;
              
              // Zbierz unikalne ID dostawców
              supplierPrices.forEach(sp => {
                if (sp.supplierId) {
                  allSupplierIds.add(sp.supplierId);
                }
              });
            }
            
            processedItems++;
            if (processedItems % 20 === 0) {
              showInfo(`Pobrano ceny dla ${processedItems}/${allIngredientIds.size} składników...`);
            }
          } catch (error) {
            console.error(`Błąd podczas pobierania cen dla składnika ${itemId}:`, error);
          }
        }
        
        console.log(`💰 Pobrano ceny dostawców dla ${Object.keys(supplierPricesMap).length} składników`);
      }

      // KROK 4B: Pobierz dane wszystkich dostawców
      const suppliersMap = {};
      if (allSupplierIds.size > 0) {
        showInfo(`Pobieranie danych ${allSupplierIds.size} dostawców...`);
        try {
          const suppliers = await getSuppliersByIds(Array.from(allSupplierIds));
          suppliers.forEach(supplier => {
            suppliersMap[supplier.id] = supplier;
          });
          console.log(`👥 Pobrano dane ${suppliers.length} dostawców`);
        } catch (error) {
          console.error('Błąd podczas pobierania dostawców:', error);
        }
      }

      showInfo('Generowanie eksportu...');

      // KROK 5: Przygotuj dane CSV z dostawcami dla składników
      const csvRows = [];
      let processedRecipes = 0;

      for (const recipe of allRecipes) {
        processedRecipes++;
        
        // Znajdź klienta
        const customer = customers.find(c => c.id === recipe.customerId);
        
        // Pobierz wszystkie składniki receptury
        const ingredients = recipe.ingredients || [];
        
        if (ingredients.length === 0) {
          // Przygotuj listę mikroelementów dla receptury bez składników
          const micronutrientsList = (recipe.micronutrients || [])
            .map(micro => {
              const parts = [];
              if (micro.code) parts.push(micro.code);
              if (micro.name) parts.push(micro.name);
              if (micro.quantity) parts.push(`${micro.quantity}${micro.unit || ''}`);
              return parts.join(' - ');
            })
            .join('; ');
          
          // Dodaj wiersz z mikroelementami jeśli receptura ma mikroelementy
          if (micronutrientsList) {
            csvRows.push({
              'Receptura (SKU)': recipe.name || '',
              'Opis receptury': recipe.description || '',
              'Klient': customer ? customer.name : '',
              'Składnik': '--- MIKROELEMENTY ---',
              'Ilość składnika': '',
              'Jednostka': '',
              'Dostawcy (z pozycji mag.)': '',
              'Dostawcy (z PO)': '',
              'Mikroelementy': micronutrientsList
            });
          } else {
            // Jeśli receptura nie ma składników ani mikroelementów, dodaj jeden wiersz informacyjny
            csvRows.push({
              'Receptura (SKU)': recipe.name || '',
              'Opis receptury': recipe.description || '',
              'Klient': customer ? customer.name : '',
              'Składnik': 'Brak składników',
              'Ilość składnika': '',
              'Jednostka': '',
              'Dostawcy (z pozycji mag.)': '-',
              'Dostawcy (z PO)': '-',
              'Mikroelementy': '-'
            });
          }
          
          // Dodaj pusty wiersz po recepturze
          csvRows.push({
            'Receptura (SKU)': '',
            'Opis receptury': '',
            'Klient': '',
            'Składnik': '',
            'Ilość składnika': '',
            'Jednostka': '',
            'Dostawcy (z pozycji mag.)': '',
            'Dostawcy (z PO)': '',
            'Mikroelementy': ''
          });
          
          continue;
        }

        // Przygotuj listę mikroelementów dla receptury
        const micronutrientsList = (recipe.micronutrients || [])
          .map(micro => {
            const parts = [];
            if (micro.code) parts.push(micro.code);
            if (micro.name) parts.push(micro.name);
            if (micro.quantity) parts.push(`${micro.quantity}${micro.unit || ''}`);
            return parts.join(' - ');
          })
          .join('; ');
        
        // Dodaj wiersz z mikroelementami dla receptury
        if (micronutrientsList) {
          csvRows.push({
            'Receptura (SKU)': recipe.name || '',
            'Opis receptury': recipe.description || '',
            'Klient': customer ? customer.name : '',
            'Składnik': '--- MIKROELEMENTY ---',
            'Ilość składnika': '',
            'Jednostka': '',
            'Dostawcy (z pozycji mag.)': '',
            'Dostawcy (z PO)': '',
            'Mikroelementy': micronutrientsList
          });
        }
        
        // Dla każdego składnika znajdź dostawców
        for (const ingredient of ingredients) {
          let suppliersFromPOText = '-';
          let suppliersFromInventoryText = '-';
          
          // A) Dostawcy z zamówień zakupu (PO)
          if (ingredient.id && batchesMap[ingredient.id]) {
            const ingredientBatches = batchesMap[ingredient.id];
            
            // Zbierz informacje o dostawcach z PO dla tego składnika
            const supplierInfos = [];
            const seenPOs = new Set(); // Unikalne PO dla tego składnika
            
            ingredientBatches.forEach(batch => {
              const poId = batch.purchaseOrderDetails?.id || batch.sourceDetails?.orderId;
              
              if (poId && !seenPOs.has(poId) && purchaseOrdersMap[poId]) {
                seenPOs.add(poId);
                const po = purchaseOrdersMap[poId];
                
                // Znajdź pozycję w PO dla tej partii
                const itemPoId = batch.purchaseOrderDetails?.itemPoId || batch.sourceDetails?.itemPoId;
                const poItem = po.items?.find(item => item.id === itemPoId);
                
                const supplierName = po.supplier?.name || 'Nieznany dostawca';
                const poNumber = po.number || poId;
                const price = poItem?.unitPrice ? `${parseFloat(poItem.unitPrice).toFixed(2)} ${po.currency || 'PLN'}` : '';
                
                // Format: "Dostawca (PO: PO/2024/001, 12.50 PLN)"
                let info = `${supplierName} (PO: ${poNumber}`;
                if (price) {
                  info += `, ${price}`;
                }
                info += ')';
                
                supplierInfos.push(info);
              }
            });
            
            if (supplierInfos.length > 0) {
              suppliersFromPOText = supplierInfos.join('; ');
            }
          }
          
          // B) Dostawcy z pozycji magazynowej (inventorySupplierPrices)
          if (ingredient.id && supplierPricesMap[ingredient.id]) {
            const prices = supplierPricesMap[ingredient.id];
            
            const supplierDetails = prices.map(sp => {
              const supplier = suppliersMap[sp.supplierId];
              const supplierName = supplier ? supplier.name : sp.supplierId;
              const price = sp.price ? `${sp.price.toFixed(2)} ${sp.currency || 'PLN'}` : '';
              return price ? `${supplierName} (${price})` : supplierName;
            });
            
            if (supplierDetails.length > 0) {
              suppliersFromInventoryText = supplierDetails.join('; ');
            }
          }
          
          csvRows.push({
            'Receptura (SKU)': recipe.name || '',
            'Opis receptury': recipe.description || '',
            'Klient': customer ? customer.name : '',
            'Składnik': ingredient.name || '',
            'Ilość składnika': ingredient.quantity || '',
            'Jednostka': ingredient.unit || '',
            'Dostawcy (z pozycji mag.)': suppliersFromInventoryText,
            'Dostawcy (z PO)': suppliersFromPOText,
            'Mikroelementy': '-'
          });
        }
        
        // Dodaj pusty wiersz po każdej recepturze dla lepszej czytelności
        csvRows.push({
          'Receptura (SKU)': '',
          'Opis receptury': '',
          'Klient': '',
          'Składnik': '',
          'Ilość składnika': '',
          'Jednostka': '',
          'Dostawcy (z pozycji mag.)': '',
          'Dostawcy (z PO)': '',
          'Mikroelementy': ''
        });
        
        // Informuj użytkownika o postępie
        if (processedRecipes % 10 === 0) {
          showInfo(`Przetworzono ${processedRecipes}/${allRecipes.length} receptur...`);
        }
      }

      // Utwórz nagłówki CSV
      const headers = [
        'Receptura (SKU)', 
        'Opis receptury', 
        'Klient', 
        'Składnik', 
        'Ilość składnika', 
        'Jednostka', 
        'Dostawcy (z pozycji mag.)',
        'Dostawcy (z PO)',
        'Mikroelementy'
      ];
      
      // Utwórz zawartość CSV
      const csvContent = [
        headers.map(header => `"${header}"`).join(','),
        ...csvRows.map(row => 
          headers.map(header => `"${(row[header] || '').toString().replace(/"/g, '""')}"`).join(',')
        )
      ].join('\n');

      // Dodaj BOM dla poprawnego kodowania polskich znaków w Excelu
      const BOM = '\uFEFF';
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      
      // Nazwa pliku z aktualną datą
      const currentDate = new Date().toISOString().slice(0, 10);
      const filename = `receptury_z_dostawcami_${currentDate}.csv`;
      
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showSuccess(`Eksport zakończony! Wyeksportowano ${allRecipes.length} receptur z ${csvRows.length} wierszami.`);
    } catch (error) {
      console.error('Błąd podczas eksportu receptur z dostawcami:', error);
      showError('Wystąpił błąd podczas eksportu');
    } finally {
      setExporting(false);
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
          t('recipes.list.syncCompleted', { 
            synced: results.syncedRecipes, 
            skipped: results.skippedRecipes, 
            errors: results.errorRecipes 
          })
        );
        
        // Odśwież listę receptur
        await fetchRecipes();
      } else {
        showError(t('recipes.list.syncError', { error: results.error }));
      }
    } catch (error) {
      console.error('Błąd podczas synchronizacji CAS:', error);
      showError(t('recipes.list.syncCASError', { error: error.message }));
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
              {t('recipes.list.noRecipesFound')}
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
                              label={t('recipes.list.chips.inventory', { 
                                quantity: inventoryProducts[recipe.id].quantity || 0, 
                                unit: inventoryProducts[recipe.id].unit || 'szt.', 
                                name: inventoryProducts[recipe.id].name 
                              })}
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
                  {t('recipes.list.columns.sku')}
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
                  {t('recipes.list.columns.description')}
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
                  {t('recipes.list.columns.customer')}
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
              <TableCell sx={{ width: '280px', maxWidth: '280px' }}>{t('recipes.list.columns.inventoryPosition')}</TableCell>
              <TableCell onClick={() => handleTableSort('updatedAt')} style={{ cursor: 'pointer' }}>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  {t('recipes.list.columns.lastUpdate')}
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
              <TableCell align="right">{t('recipes.list.columns.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {recipesToRender.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  {t('recipes.list.noRecipesFound')}
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
                        <Chip label={t('recipes.list.chips.general')} size="small" variant="outlined" />
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
                          {t('recipes.list.chips.noPosition')}
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
                        <Tooltip title={t('recipes.list.actions.view')}>
                          <IconButton 
                            size="small" 
                            color="primary"
                            component={Link} 
                            to={`/recipes/${recipe.id}`}
                          >
                            <ViewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('recipes.list.actions.edit')}>
                          <IconButton 
                            size="small" 
                            color="primary"
                            component={Link} 
                            to={`/recipes/${recipe.id}/edit`}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('recipes.list.actions.delete')}>
                          <IconButton 
                            size="small" 
                            color="error"
                            onClick={() => handleDeleteRecipe(recipe.id)}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={t('recipes.list.actions.addToInventory')}>
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
                  <Typography variant="subtitle1">{t('recipes.list.generalRecipes')}</Typography>
              ) : (
                  <>
                  <PersonIcon sx={{ mr: 1, color: 'primary.main' }} />
                    <Typography variant="subtitle1">{group.name}</Typography>
                  </>
                )}
                
                {/* Dodajemy licznik receptur, jeśli został już załadowany */}
                {customerRecipes[group.id] && (
                  <Chip 
                    label={t('recipes.list.chips.recipesCount', { count: customerRecipes[group.id].length })}
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
              {t('recipes.list.alerts.close')}
            </Button>
          }
        >
          <Typography variant="subtitle2">
            {t('recipes.list.alerts.indexWarningTitle')}
          </Typography>
          <Typography variant="body2">
            {t('recipes.list.alerts.indexWarningMessage')}
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
        <Typography variant="h5">{t('recipes.list.title')}</Typography>
        <Box sx={{ 
          display: 'flex', 
          gap: 1, 
          flexWrap: isMobile ? 'wrap' : 'nowrap',
          justifyContent: isMobile ? 'space-between' : 'flex-end'
        }}>
          {/* Menu akcji - grupuje przyciski w dropdown */}
          <Tooltip title="Akcje">
            <IconButton
              onClick={handleActionsMenuOpen}
              disabled={loading}
              color="default"
              sx={{ border: '1px solid rgba(0, 0, 0, 0.23)' }}
            >
              <MoreVertIcon />
            </IconButton>
          </Tooltip>
          
          <Menu
            anchorEl={actionsMenuAnchor}
            open={isActionsMenuOpen}
            onClose={handleActionsMenuClose}
            anchorOrigin={{
              vertical: 'bottom',
              horizontal: 'right',
            }}
            transformOrigin={{
              vertical: 'top',
              horizontal: 'right',
            }}
          >
            {!isMobile && (
              <MenuItem 
                onClick={() => handleMenuAction('refreshIndex')}
                disabled={loading}
              >
                <CachedIcon sx={{ mr: 1 }} />
                {t('recipes.list.refreshIndex')}
              </MenuItem>
            )}
            <MenuItem 
              onClick={() => handleMenuAction('exportCSV')}
              disabled={loading || (tabValue === 0 ? filteredRecipes.length === 0 : (!expandedPanel || !customerRecipes[expandedPanel] || customerRecipes[expandedPanel].length === 0))}
            >
              <DownloadIcon sx={{ mr: 1 }} />
              {t('recipes.list.exportCSV')}
            </MenuItem>
            <MenuItem 
              onClick={() => handleMenuAction('exportWithSuppliers')}
              disabled={loading || (tabValue === 0 ? filteredRecipes.length === 0 : (!expandedPanel || !customerRecipes[expandedPanel] || customerRecipes[expandedPanel].length === 0))}
            >
              <DownloadIcon sx={{ mr: 1 }} />
              {t('recipes.list.exportWithSuppliers')}
            </MenuItem>
            <MenuItem 
              onClick={() => handleMenuAction('syncCAS')}
              disabled={loading || syncingCAS}
            >
              {syncingCAS ? <CircularProgress size={16} sx={{ mr: 1 }} /> : <SyncIcon sx={{ mr: 1 }} />}
              {t('recipes.list.syncCAS')}
            </MenuItem>
          </Menu>
          
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
            {t('recipes.list.addRecipe')}
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
          placeholder={t('recipes.list.searchPlaceholder')}
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
          <InputLabel id="customer-filter-label" sx={isMobile ? { fontSize: '0.9rem' } : {}}>{t('recipes.list.filters.customer')}</InputLabel>
          <Select
            labelId="customer-filter-label"
            value={selectedCustomerId}
            onChange={handleCustomerFilterChange}
            label={t('recipes.list.filters.customer')}
            displayEmpty
            startAdornment={<FilterIcon sx={{ color: 'action.active', mr: 1 }} />}
          >
            <MenuItem value="">{t('recipes.list.filters.allCustomers')}</MenuItem>
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
          <InputLabel id="notes-filter-label" sx={isMobile ? { fontSize: '0.9rem' } : {}}>{t('recipes.list.filters.notes')}</InputLabel>
          <Select
            labelId="notes-filter-label"
            value={notesFilter === null ? '' : notesFilter.toString()}
            onChange={handleNotesFilterChange}
            label={t('recipes.list.filters.notes')}
            displayEmpty
            startAdornment={<InfoIcon sx={{ color: 'action.active', mr: 1 }} />}
          >
            <MenuItem value="">{t('recipes.list.filters.allRecipes')}</MenuItem>
            <MenuItem value="true">{t('recipes.list.filters.withNotes')}</MenuItem>
            <MenuItem value="false">{t('recipes.list.filters.withoutNotes')}</MenuItem>
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
            {t('recipes.list.indexActive')}
            {searchIndexStatus.lastRefreshed && 
              ` ${t('recipes.list.lastRefreshed', { date: formatDate(searchIndexStatus.lastRefreshed) })}`}
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
          <Tab label={t('recipes.list.tabs.recipesList')} />
          <Tab label={t('recipes.list.tabs.groupedByCustomer')} />
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
                    {t('recipes.list.rowsPerPage')}:
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
                  {t('recipes.list.displaying', { 
                    from: filteredRecipes.length > 0 ? (page - 1) * limit + 1 : 0, 
                    to: Math.min(page * limit, totalItems), 
                    count: totalItems 
                  })}
                </Typography>
              )}
            </Box>
          </>
        ) : (
          renderGroupedRecipes()
        )
      )}

      {/* Dialog filtrowania eksportu z dostawcami */}
      <Dialog 
        open={exportDialogOpen} 
        onClose={handleCloseExportDialog}
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>
          {t('recipes.list.exportWithSuppliersTitle')}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {t('recipes.list.exportWithSuppliersDescription')}
            </Typography>
            
            <TextField
              label={t('recipes.list.searchPlaceholder')}
              value={exportFilters.searchTerm}
              onChange={(e) => handleExportFilterChange('searchTerm', e.target.value)}
              variant="outlined"
              size="small"
              fullWidth
              InputProps={{
                startAdornment: <SearchIcon sx={{ color: 'action.active', mr: 1 }} />
              }}
            />
            
            <FormControl size="small" fullWidth>
              <InputLabel id="export-customer-filter-label">
                {t('recipes.list.filters.customer')}
              </InputLabel>
              <Select
                labelId="export-customer-filter-label"
                value={exportFilters.customerId}
                onChange={(e) => handleExportFilterChange('customerId', e.target.value)}
                label={t('recipes.list.filters.customer')}
                displayEmpty
              >
                <MenuItem value="">{t('recipes.list.filters.allCustomers')}</MenuItem>
                {customers.map((customer) => (
                  <MenuItem key={customer.id} value={customer.id}>
                    {customer.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl size="small" fullWidth>
              <InputLabel id="export-notes-filter-label">
                {t('recipes.list.filters.notes')}
              </InputLabel>
              <Select
                labelId="export-notes-filter-label"
                value={exportFilters.notesFilter === null ? '' : exportFilters.notesFilter.toString()}
                onChange={(e) => handleExportFilterChange('notesFilter', e.target.value === '' ? null : e.target.value === 'true')}
                label={t('recipes.list.filters.notes')}
                displayEmpty
              >
                <MenuItem value="">{t('recipes.list.filters.allRecipes')}</MenuItem>
                <MenuItem value="true">{t('recipes.list.filters.withNotes')}</MenuItem>
                <MenuItem value="false">{t('recipes.list.filters.withoutNotes')}</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseExportDialog} disabled={exporting}>
            {t('common.cancel')}
          </Button>
          <Button 
            onClick={handleExportRecipesWithSuppliers} 
            variant="contained" 
            disabled={exporting}
            startIcon={exporting ? <CircularProgress size={16} /> : <DownloadIcon />}
          >
            {exporting ? t('recipes.list.exporting') : t('recipes.list.export')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog postępu synchronizacji CAS */}
      <Dialog 
        open={syncingCAS} 
        disableEscapeKeyDown 
        maxWidth="sm" 
        fullWidth
      >
        <DialogTitle>
          {t('recipes.list.syncingCAS')}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ width: '100%' }}>
            {syncProgress && (
              <>
                <Typography variant="body2" gutterBottom>
                  {t('recipes.list.syncProgress', { recipeName: syncProgress.recipeName })}
                </Typography>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t('recipes.list.syncProgressCount', { current: syncProgress.current, total: syncProgress.total })}
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
                  {t('recipes.list.preparingSync')}
                </Typography>
                <LinearProgress sx={{ mt: 2 }} />
              </>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Typography variant="body2" color="text.secondary">
            {t('recipes.list.pleaseWait')}
          </Typography>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default RecipeList;