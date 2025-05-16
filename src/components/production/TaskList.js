// src/components/production/TaskList.js
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
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Container,
  Tooltip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Alert,
  Grid,
  Divider,
  Menu,
  ListItemText,
  Checkbox,
  useTheme,
  useMediaQuery,
  Card,
  CardContent,
  CardActions,
  Pagination
} from '@mui/material';
import { 
  Add as AddIcon, 
  Search as SearchIcon, 
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  CheckCircle as CompleteIcon,
  Inventory as InventoryIcon,
  Check as CheckIcon,
  Info as InfoIcon,
  Visibility as ViewIcon,
  Done as DoneIcon,
  Cancel as CancelIcon,
  ViewColumn as ViewColumnIcon,
  BuildCircle as BuildCircleIcon
} from '@mui/icons-material';
import { getAllTasks, updateTaskStatus, deleteTask, addTaskProductToInventory, stopProduction, getTasksWithPagination } from '../../services/productionService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/dateUtils';
import { formatDateTime } from '../../utils/formatters';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useTheme as useThemeContext } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { TIME_INTERVALS } from '../../utils/constants';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';
import { getWorkstationById } from '../../services/workstationService';
import { useColumnPreferences } from '../../contexts/ColumnPreferencesContext';

const TaskList = () => {
  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [workstationNames, setWorkstationNames] = useState({});
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const muiTheme = useMuiTheme();
  const { mode } = useThemeContext();
  const navigate = useNavigate();
  const [stopProductionDialogOpen, setStopProductionDialogOpen] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [completedQuantity, setCompletedQuantity] = useState('');
  const [timeSpent, setTimeSpent] = useState('');
  const [productionError, setProductionError] = useState(null);
  const [productionStartTime, setProductionStartTime] = useState(new Date());
  const [productionEndTime, setProductionEndTime] = useState(new Date());
  const [addToInventoryDialogOpen, setAddToInventoryDialogOpen] = useState(false);
  const [inventoryData, setInventoryData] = useState({
    expiryDate: null,
    lotNumber: '',
    finalQuantity: '',
  });
  const [inventoryError, setInventoryError] = useState(null);
  
  // Stan dla ukrywania kolumn
  const [columnMenuAnchor, setColumnMenuAnchor] = useState(null);
  
  // Używamy kontekstu preferencji kolumn
  const { getColumnPreferencesForView, updateColumnPreferences } = useColumnPreferences();
  // Pobieramy preferencje dla widoku 'productionTasks'
  const visibleColumns = getColumnPreferencesForView('productionTasks');

  // Dodajemy wykrywanie urządzeń mobilnych
  const theme = useMuiTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Stany do obsługi paginacji
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10); 
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [searchTimeout, setSearchTimeout] = useState(null);

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

  // Reset strony do pierwszej przy zmianie wyszukiwania
  useEffect(() => {
    if (debouncedSearchTerm !== searchTerm) {
      setPage(1);
    }
  }, [debouncedSearchTerm]);

  // Pobierz zadania przy montowaniu komponentu i zmianie paginacji
  useEffect(() => {
    fetchTasks();
  }, [page, limit, debouncedSearchTerm, statusFilter]);

  // Filtruj zadania przy zmianie searchTerm, statusFilter lub tasks
  useEffect(() => {
    setFilteredTasks(tasks);
  }, [tasks]);

  // Pobierz nazwy stanowisk dla zadań
  useEffect(() => {
    const fetchWorkstationNames = async () => {
      const workstationData = {};
      
      for (const task of tasks) {
        if (task.workstationId && !workstationData[task.workstationId]) {
          try {
            const workstation = await getWorkstationById(task.workstationId);
            workstationData[task.workstationId] = workstation.name;
          } catch (error) {
            console.error(`Błąd podczas pobierania stanowiska dla ID ${task.workstationId}:`, error);
            workstationData[task.workstationId] = "Nieznane stanowisko";
          }
        }
      }
      
      setWorkstationNames(workstationData);
    };
    
    if (tasks.length > 0) {
      fetchWorkstationNames();
    }
  }, [tasks]);

  // Obsługa zmiany filtra statusu
  const handleStatusFilterChange = (event) => {
    setStatusFilter(event.target.value);
    setPage(1); // Reset do pierwszej strony po zmianie filtra
  };

  // Obsługa zmiany pola wyszukiwania
  const handleSearchChange = (event) => {
    setSearchTerm(event.target.value);
    // Reset strony zostanie obsłużony przez efekt debounce, który ustawi debouncedSearchTerm
  };

  const fetchTasks = async () => {
    try {
      setLoading(true);
      
      // Przygotuj filtry dla zapytania
      const filters = {};
      if (statusFilter) {
        filters.status = statusFilter;
      }
      if (debouncedSearchTerm) {
        filters.searchTerm = debouncedSearchTerm;
      }
      
      // Użyj nowej funkcji z paginacją
      const result = await getTasksWithPagination(
        page,
        limit,
        'scheduledDate',
        'asc',
        filters
      );
      
      console.log("Pobrane zadania z paginacją:", result.data);
      setTasks(result.data);
      setFilteredTasks(result.data);
      setTotalItems(result.pagination.totalItems);
      setTotalPages(result.pagination.totalPages);
    } catch (error) {
      showError('Błąd podczas pobierania zadań: ' + error.message);
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  // Obsługa zmiany strony
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  // Obsługa zmiany liczby elementów na stronie
  const handleChangeRowsPerPage = (event) => {
    setLimit(parseInt(event.target.value, 10));
    setPage(1); // Reset do pierwszej strony po zmianie limitu
  };

  const handleDelete = async (id) => {
    if (window.confirm('Czy na pewno chcesz usunąć to zadanie?')) {
      try {
        await deleteTask(id);
        showSuccess('Zadanie zostało usunięte');
        // Odśwież listę zadań
        fetchTasks();
      } catch (error) {
        showError('Błąd podczas usuwania zadania: ' + error.message);
        console.error('Error deleting task:', error);
      }
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    try {
      await updateTaskStatus(id, newStatus, currentUser.uid);
      showSuccess(`Status zadania zmieniony na: ${newStatus}`);
      // Odśwież listę zadań
      fetchTasks();
    } catch (error) {
      showError('Błąd podczas zmiany statusu: ' + error.message);
      console.error('Error updating task status:', error);
    }
  };

  // Funkcja obsługująca dodanie produktu do magazynu
  const handleAddToInventory = async (id) => {
    try {
      if (!inventoryData.expiryDate) {
        setInventoryError('Podaj datę ważności produktu');
        return;
      }

      if (!inventoryData.lotNumber.trim()) {
        setInventoryError('Podaj numer partii (LOT)');
        return;
      }

      const quantity = parseFloat(inventoryData.finalQuantity);
      if (isNaN(quantity) || quantity <= 0) {
        setInventoryError('Nieprawidłowa ilość końcowa');
        return;
      }

      // Dodaj parametry do wywołania API
      await addTaskProductToInventory(id, currentUser.uid, {
        expiryDate: inventoryData.expiryDate.toISOString(),
        lotNumber: inventoryData.lotNumber,
        finalQuantity: quantity
      });
      
      // Znajdź zadanie w tablicy tasks, aby uzyskać dostęp do jego danych
      const task = tasks.find(t => t.id === id);
      let message = 'Produkt został dodany do magazynu jako nowa partia (LOT)';
      
      // Dodaj informacje o numerze MO i CO, jeśli są dostępne
      if (task) {
        if (task.moNumber) {
          message += ` z MO: ${task.moNumber}`;
        }
        
        if (task.orderNumber) {
          message += ` i CO: ${task.orderNumber}`;
        }
      }
      
      showSuccess(message);
      setAddToInventoryDialogOpen(false);
      resetInventoryForm();
      
      // Odśwież listę zadań
      fetchTasks();
    } catch (error) {
      setInventoryError('Błąd podczas dodawania produktu do magazynu: ' + error.message);
      console.error('Error adding product to inventory:', error);
    }
  };

  const openAddToInventoryDialog = (task) => {
    setCurrentTaskId(task.id);
    
    // Dodaję logowanie do celów diagnostycznych
    console.log('Dane zadania:', task);
    console.log('Data ważności z zadania:', task.expiryDate);
    
    // Poprawna konwersja daty ważności z różnych formatów
    let expiryDate = null;
    
    if (task.expiryDate) {
      try {
        // Sprawdź typ daty i odpowiednio ją skonwertuj
        if (task.expiryDate instanceof Date) {
          expiryDate = task.expiryDate;
        } else if (task.expiryDate.toDate && typeof task.expiryDate.toDate === 'function') {
          // Obsługa obiektu Firebase Timestamp
          expiryDate = task.expiryDate.toDate();
        } else if (task.expiryDate.seconds) {
          // Obsługa obiektu timestamp z sekundami
          expiryDate = new Date(task.expiryDate.seconds * 1000);
        } else if (typeof task.expiryDate === 'string') {
          // Obsługa formatu string
          expiryDate = new Date(task.expiryDate);
        }
        console.log('Skonwertowana data ważności:', expiryDate);
      } catch (error) {
        console.error('Błąd konwersji daty ważności:', error);
        // W przypadku błędu konwersji, ustaw datę domyślną
        expiryDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
      }
    } else {
      // Domyślna data ważności (1 rok od dzisiaj)
      expiryDate = new Date(new Date().setFullYear(new Date().getFullYear() + 1));
    }
    
    // Ustaw wartości w formularzu na podstawie danych z zadania produkcyjnego
    setInventoryData({
      expiryDate: expiryDate,
      lotNumber: task.lotNumber || `LOT-${task.moNumber || ''}`,
      finalQuantity: task.quantity.toString()
    });
    
    console.log('Dane formularza po konwersji:', {
      expiryDate: expiryDate,
      lotNumber: task.lotNumber || `LOT-${task.moNumber || ''}`,
      finalQuantity: task.quantity.toString()
    });
    
    setAddToInventoryDialogOpen(true);
  };

  const resetInventoryForm = () => {
    setInventoryData({
      expiryDate: null,
      lotNumber: '',
      finalQuantity: ''
    });
    setInventoryError(null);
    setCurrentTaskId(null);
  };

  const handleStopProduction = async () => {
    try {
      setProductionError(null);
      
      if (!completedQuantity) {
        setProductionError('Podaj wyprodukowaną ilość');
        return;
      }

      const quantity = parseFloat(completedQuantity);
      
      if (isNaN(quantity) || quantity < 0) {
        setProductionError('Nieprawidłowa ilość');
        return;
      }
      
      if (!productionStartTime || !productionEndTime) {
        setProductionError('Podaj przedział czasowy produkcji');
        return;
      }
      
      if (productionEndTime < productionStartTime) {
        setProductionError('Czas zakończenia nie może być wcześniejszy niż czas rozpoczęcia');
        return;
      }
      
      // Oblicz czas trwania w minutach
      const durationMs = productionEndTime.getTime() - productionStartTime.getTime();
      const durationMinutes = Math.round(durationMs / (1000 * 60));
      
      if (durationMinutes <= 0) {
        setProductionError('Przedział czasowy musi być dłuższy niż 0 minut');
        return;
      }

      // Przekazujemy czas trwania w minutach oraz daty rozpoczęcia i zakończenia
      const result = await stopProduction(
        currentTaskId, 
        quantity, 
        durationMinutes, 
        currentUser.uid,
        {
          startTime: productionStartTime.toISOString(),
          endTime: productionEndTime.toISOString()
        }
      );
      
      setStopProductionDialogOpen(false);
      showSuccess(result.isCompleted ? 
        'Produkcja zakończona. Zadanie zostało ukończone.' : 
        'Sesja produkcyjna zapisana. Możesz kontynuować produkcję później.'
      );
      
      // Resetuj stan formularza
      setCompletedQuantity('');
      setProductionStartTime(new Date());
      setProductionEndTime(new Date());
      setCurrentTaskId(null);
      
      // Odśwież listę zadań
      fetchTasks();
    } catch (error) {
      showError('Błąd podczas zatrzymywania produkcji: ' + error.message);
      console.error('Error stopping production:', error);
    }
  };

  const openStopProductionDialog = (taskId) => {
    setCurrentTaskId(taskId);
    setStopProductionDialogOpen(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Zaplanowane':
      case 'planned':
        return 'primary';
      case 'W trakcie':
      case 'in_progress':
        return 'warning';
      case 'Potwierdzenie zużycia':
        return 'info';
      case 'Zakończone':
      case 'completed':
        return 'success';
      case 'Anulowane':
      case 'cancelled':
        return 'error';
      case 'Wstrzymane':
        return 'default';
      default:
        return 'default';
    }
  };

  // Funkcja zwracająca chip informujący o statusie dodania produktu do magazynu
  const getInventoryStatus = (task) => {
    if (task.status !== 'Zakończone') {
      return null;
    }

    if (task.inventoryUpdated) {
      return (
        <Tooltip title={`Produkt dodany do magazynu jako partia LOT (${task.inventoryBatchId?.substring(0, 6) || ''})`}>
          <Chip 
            label="Dodano jako partia" 
            color="success" 
            size="small" 
            variant="outlined"
          />
        </Tooltip>
      );
    } else if (task.readyForInventory) {
      return (
        <Tooltip title="Gotowy do dodania do magazynu jako partia">
          <Chip 
            label="Gotowy do dodania" 
            color="info" 
            size="small" 
            variant="outlined"
          />
        </Tooltip>
      );
    } else if (task.inventoryError) {
      return (
        <Tooltip title={`Błąd: ${task.inventoryError}`}>
          <Chip 
            label="Błąd" 
            color="error" 
            size="small" 
            variant="outlined"
          />
        </Tooltip>
      );
    } else {
      return (
        <Tooltip title="Produkt nie został dodany do magazynu">
          <Chip 
            label="Nie dodano" 
            color="warning" 
            size="small" 
            variant="outlined"
          />
        </Tooltip>
      );
    }
  };

  const getStatusActions = (task) => {
    switch (task.status) {
      case 'Zaplanowane':
      case 'Wstrzymane':
        return (
          <Tooltip title="Rozpocznij produkcję">
            <IconButton 
              color="warning" 
              onClick={() => handleStatusChange(task.id, 'W trakcie')}
              size="small"
            >
              <StartIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
      case 'W trakcie':
        return (
          <Tooltip title="Zatrzymaj produkcję">
            <IconButton 
              color="error" 
              onClick={() => openStopProductionDialog(task.id)}
              size="small"
            >
              <StopIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
      case 'Potwierdzenie zużycia':
        return (
          <Tooltip title="Potwierdź zużycie materiałów">
            <IconButton 
              color="info" 
              component={Link}
              to={`/production/consumption/${task.id}`}
              size="small"
            >
              <CheckIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
      case 'Zakończone':
        // Jeśli zadanie jest zakończone i nie zostało jeszcze dodane do magazynu
        if (!task.inventoryUpdated) {
          return (
            <Tooltip title="Dodaj produkt do magazynu">
              <IconButton 
                color="primary" 
                onClick={() => openAddToInventoryDialog(task)}
                size="small"
              >
                <InventoryIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          );
        }
        return (
          <Tooltip title="Korekta poprocesowa">
            <IconButton 
              color="secondary" 
              component={Link}
              to={`/production/consumption/${task.id}`}
              size="small"
            >
              <BuildCircleIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        );
      default:
        return null;
    }
  };

  // Funkcje do zarządzania widocznością kolumn
  const handleColumnMenuOpen = (event) => {
    setColumnMenuAnchor(event.currentTarget);
  };
  
  const handleColumnMenuClose = () => {
    setColumnMenuAnchor(null);
  };
  
  const toggleColumnVisibility = (columnName) => {
    // Zamiast lokalnego setVisibleColumns, używamy funkcji updateColumnPreferences z kontekstu
    updateColumnPreferences('productionTasks', columnName, !visibleColumns[columnName]);
  };

  // Renderowanie zadania jako karta na urządzeniach mobilnych
  const renderTaskCard = (task) => {
    // Obliczenie pozostałej ilości do produkcji
    const totalCompletedQuantity = task.totalCompletedQuantity || 0;
    const remainingQuantity = Math.max(0, task.quantity - totalCompletedQuantity);
    
    return (
      <Card key={task.id} variant="outlined" sx={{ mb: 1.5, bgcolor: 'rgb(249, 249, 249)' }}>
        <CardContent sx={{ pb: 1, pt: 1.5, px: 1.5 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Typography variant="subtitle1" component={Link} to={`/production/tasks/${task.id}`} sx={{ 
                textDecoration: 'none',
                color: 'primary.main',
                fontWeight: 'medium',
                fontSize: '0.95rem'
              }}>
                {task.name}
              </Typography>
              <Chip 
                label={task.status} 
                color={getStatusColor(task.status)}
                size="small" 
                sx={{ fontSize: '0.7rem', height: '24px' }}
              />
            </Box>
            
            {task.moNumber && (
              <Chip 
                size="small" 
                label={`MO: ${task.moNumber}`} 
                color="secondary" 
                variant="outlined" 
                sx={{ alignSelf: 'flex-start', fontSize: '0.7rem', height: '20px' }}
              />
            )}
            
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
              <Box sx={{ minWidth: '45%' }}>
                <Typography variant="caption" color="text.secondary">
                  Produkt:
                </Typography>
                <Typography variant="body2">
                  {task.productName}
                </Typography>
              </Box>
              
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Ilość:
                </Typography>
                <Typography variant="body2">
                  {task.quantity} {task.unit || 'szt.'}
                </Typography>
              </Box>
              
              <Box>
                <Typography variant="caption" color="text.secondary">
                  Pozostało:
                </Typography>
                <Typography 
                  variant="body2" 
                  color={remainingQuantity === 0 ? 'success.main' : (remainingQuantity < task.quantity * 0.2 ? 'warning.main' : 'inherit')}
                >
                  {remainingQuantity} {task.unit || 'szt.'}
                </Typography>
              </Box>
            </Box>
            
            {workstationNames[task.workstationId] && (
              <Box sx={{ mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Stanowisko:
                </Typography>
                <Typography variant="body2">
                  {workstationNames[task.workstationId] || task.workstationName || '-'}
                </Typography>
              </Box>
            )}
            
            {task.materials && task.materials.length > 0 && (
              <Box sx={{ mt: 0.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Surowce:
                </Typography>
                <Chip 
                  label={task.materialsReserved || task.autoReserveMaterials ? "Zarezerwowane" : "Niezarezerwowane"} 
                  color={task.materialsReserved || task.autoReserveMaterials ? "success" : "warning"} 
                  size="small" 
                  variant="outlined"
                  sx={{ fontSize: '0.7rem', height: '20px', ml: 0.5 }}
                />
              </Box>
            )}
          </Box>
        </CardContent>
        
        <Divider />
        
        <CardActions sx={{ px: 1, py: 0.5, justifyContent: 'flex-end' }}>
          {getStatusActions(task)}
          
          <Tooltip title="Szczegóły zadania">
            <IconButton
              size="small"
              component={Link}
              to={`/production/tasks/${task.id}`}
              color="primary"
            >
              <InfoIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Edytuj zadanie">
            <IconButton
              size="small"
              component={Link}
              to={`/production/tasks/${task.id}/edit`}
              color="secondary"
            >
              <EditIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="Usuń zadanie">
            <IconButton
              size="small"
              onClick={() => handleDelete(task.id)}
              color="error"
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </CardActions>
      </Card>
    );
  };

  if (loading) {
    return <div>Ładowanie zadań produkcyjnych...</div>;
  }

  return (
    <Container maxWidth="xl" sx={{ px: isMobile ? 1 : 2 }}>
      <Box sx={{ mb: isMobile ? 2 : 4 }}>
        <Typography variant="h5" gutterBottom align="center" sx={{ fontSize: isMobile ? '1.25rem' : '1.5rem' }}>
          Zadania Produkcyjne
        </Typography>
        
        <Box sx={{ 
          display: 'flex', 
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between', 
          mb: 2,
          gap: isMobile ? 1 : 0
        }}>
          <Button 
            variant="contained" 
            color="primary" 
            startIcon={<AddIcon />}
            component={Link}
            to="/production/create-from-order"
            fullWidth={isMobile}
            size={isMobile ? "small" : "medium"}
            sx={isMobile ? { mb: 1 } : {}}
          >
            Nowe Zadanie
          </Button>
          
          <Box sx={{ 
            display: 'flex', 
            flexDirection: isMobile ? 'column' : 'row',
            gap: isMobile ? 1 : 2,
            width: isMobile ? '100%' : 'auto'
          }}>
            <FormControl 
              variant="outlined" 
              size="small" 
              sx={{ 
                minWidth: isMobile ? '100%' : 200,
                '& .MuiOutlinedInput-root': {
                  borderRadius: '4px',
                  bgcolor: mode === 'dark' ? 'background.paper' : 'white',
                }
              }}
            >
              <InputLabel id="status-filter-label">Status</InputLabel>
              <Select
                labelId="status-filter-label"
                id="status-filter"
                value={statusFilter}
                onChange={handleStatusFilterChange}
                label="Status"
              >
                <MenuItem value="">Wszystkie</MenuItem>
                <MenuItem value="Zaplanowane">Zaplanowane</MenuItem>
                <MenuItem value="W trakcie">W trakcie</MenuItem>
                <MenuItem value="Wstrzymane">Wstrzymane</MenuItem>
                <MenuItem value="Zakończone">Zakończone</MenuItem>
                <MenuItem value="Anulowane">Anulowane</MenuItem>
              </Select>
            </FormControl>
            
            <Box sx={{ 
              display: 'flex',
              width: isMobile ? '100%' : 'auto',
              gap: 1
            }}>
              <TextField
                variant="outlined"
                size="small"
                placeholder="Szukaj zadania..."
                value={searchTerm}
                onChange={handleSearchChange}
                fullWidth={isMobile}
                InputProps={{
                  startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
                  sx: {
                    borderRadius: '4px',
                    bgcolor: mode === 'dark' ? 'background.paper' : 'white'
                  }
                }}
              />
              
              <Tooltip title="Konfiguruj widoczne kolumny">
                <IconButton onClick={handleColumnMenuOpen} size={isMobile ? "small" : "medium"}>
                  <ViewColumnIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>
        </Box>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
            <CircularProgress />
          </Box>
        ) : filteredTasks.length === 0 ? (
          <Paper sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body1">Brak zadań produkcyjnych spełniających kryteria.</Typography>
          </Paper>
        ) : isMobile ? (
          // Widok mobilny - karty zamiast tabeli
          <Box sx={{ mt: 1 }}>
            {filteredTasks.map(renderTaskCard)}
          </Box>
        ) : (
          // Widok desktopowy - tabela
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  {visibleColumns.name && <TableCell>Nazwa zadania</TableCell>}
                  {visibleColumns.productName && <TableCell>Produkt</TableCell>}
                  {visibleColumns.quantity && <TableCell>Ilość</TableCell>}
                  {visibleColumns.remainingQuantity && <TableCell>Pozostało do produkcji</TableCell>}
                  {visibleColumns.workstation && <TableCell>Stanowisko</TableCell>}
                  {visibleColumns.status && <TableCell>Status</TableCell>}
                  {visibleColumns.materialsReserved && <TableCell>Surowce zarezerwowane</TableCell>}
                  {visibleColumns.plannedStart && <TableCell>Planowany start</TableCell>}
                  {visibleColumns.plannedEnd && <TableCell>Planowane zakończenie</TableCell>}
                  {visibleColumns.cost && <TableCell>Koszt jednostkowy</TableCell>}
                  {visibleColumns.totalCost && <TableCell>Koszt całkowity</TableCell>}
                  {visibleColumns.actions && <TableCell>Akcje</TableCell>}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredTasks.map((task) => {
                  // Obliczenie pozostałej ilości do produkcji
                  const totalCompletedQuantity = task.totalCompletedQuantity || 0;
                  const remainingQuantity = Math.max(0, task.quantity - totalCompletedQuantity);
                  
                  return (
                    <TableRow key={task.id}>
                      {visibleColumns.name && (
                        <TableCell>
                          <Link to={`/production/tasks/${task.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                            <Typography variant="body1" color="primary">{task.name}</Typography>
                            {task.clientName && (
                              <Typography variant="body2" color="textSecondary">
                                {task.clientName}
                              </Typography>
                            )}
                            {task.moNumber && (
                              <Chip 
                                size="small" 
                                label={`MO: ${task.moNumber}`} 
                                color="secondary" 
                                variant="outlined" 
                                sx={{ mt: 0.5 }}
                              />
                            )}
                          </Link>
                        </TableCell>
                      )}
                      {visibleColumns.productName && (
                        <TableCell>
                          <Typography variant="body1">{task.productName}</Typography>
                        </TableCell>
                      )}
                      {visibleColumns.quantity && (
                        <TableCell>
                          {task.quantity} {task.unit || 'szt.'}
                        </TableCell>
                      )}
                      {visibleColumns.remainingQuantity && (
                        <TableCell>
                          <Typography 
                            variant="body1" 
                            color={remainingQuantity === 0 ? 'success.main' : (remainingQuantity < task.quantity * 0.2 ? 'warning.main' : 'inherit')}
                          >
                            {remainingQuantity} {task.unit || 'szt.'}
                          </Typography>
                        </TableCell>
                      )}
                      {visibleColumns.workstation && (
                        <TableCell>
                          {workstationNames[task.workstationId] || task.workstationName || '-'}
                        </TableCell>
                      )}
                      {visibleColumns.status && (
                        <TableCell>
                          <Chip 
                            label={task.status} 
                            color={getStatusColor(task.status)} 
                          />
                        </TableCell>
                      )}
                      {visibleColumns.materialsReserved && (
                        <TableCell>
                          {task.materials && task.materials.length > 0 ? (
                            task.materialsReserved || task.autoReserveMaterials ? (
                              <Chip 
                                label="Zarezerwowane" 
                                color="success" 
                                size="small" 
                                variant="outlined"
                              />
                            ) : (
                              <Chip 
                                label="Niezarezerwowane" 
                                color="warning" 
                                size="small" 
                                variant="outlined"
                              />
                            )
                          ) : (
                            <Chip 
                              label="Brak materiałów" 
                              color="default" 
                              size="small" 
                              variant="outlined"
                            />
                          )}
                        </TableCell>
                      )}
                      {visibleColumns.plannedStart && (
                        <TableCell>
                          {task.scheduledDate ? formatDateTime(task.scheduledDate) : '-'}
                        </TableCell>
                      )}
                      {visibleColumns.plannedEnd && (
                        <TableCell>
                          {task.endDate ? formatDateTime(task.endDate) : '-'}
                        </TableCell>
                      )}
                      {visibleColumns.cost && (
                        <TableCell>
                          {task.unitMaterialCost !== undefined ? 
                            `${parseFloat(task.unitMaterialCost)} €` : 
                            (task.totalMaterialCost !== undefined && task.quantity ? 
                              `${parseFloat(task.totalMaterialCost) / parseFloat(task.quantity)} €` : '-')}
                        </TableCell>
                      )}
                      {visibleColumns.totalCost && (
                        <TableCell>
                          {task.totalMaterialCost !== undefined ? 
                            `${parseFloat(task.totalMaterialCost).toFixed(2)} €` : '-'}
                        </TableCell>
                      )}
                      {visibleColumns.actions && (
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5 }}>
                            {/* Przycisk akcji zależny od statusu */}
                            {getStatusActions(task)}
                            
                            {/* Przyciski standardowe */}
                            <Tooltip title="Szczegóły zadania">
                              <IconButton
                                size="small"
                                component={Link}
                                to={`/production/tasks/${task.id}`}
                                color="primary"
                              >
                                <InfoIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>

                            <Tooltip title="Edytuj zadanie">
                              <IconButton
                                size="small"
                                component={Link}
                                to={`/production/tasks/${task.id}/edit`}
                                color="secondary"
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>

                            <Tooltip title="Usuń zadanie">
                              <IconButton
                                size="small"
                                onClick={() => handleDelete(task.id)}
                                color="error"
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Box>
      
      {/* Menu konfiguracji kolumn */}
      <Menu
        anchorEl={columnMenuAnchor}
        open={Boolean(columnMenuAnchor)}
        onClose={handleColumnMenuClose}
      >
        <MenuItem onClick={() => toggleColumnVisibility('name')}>
          <Checkbox checked={visibleColumns.name} />
          <ListItemText primary="Nazwa zadania" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('productName')}>
          <Checkbox checked={visibleColumns.productName} />
          <ListItemText primary="Produkt" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('quantity')}>
          <Checkbox checked={visibleColumns.quantity} />
          <ListItemText primary="Ilość" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('remainingQuantity')}>
          <Checkbox checked={visibleColumns.remainingQuantity} />
          <ListItemText primary="Pozostało do produkcji" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('workstation')}>
          <Checkbox checked={visibleColumns.workstation} />
          <ListItemText primary="Stanowisko" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('status')}>
          <Checkbox checked={visibleColumns.status} />
          <ListItemText primary="Status" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('materialsReserved')}>
          <Checkbox checked={visibleColumns.materialsReserved} />
          <ListItemText primary="Surowce zarezerwowane" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('plannedStart')}>
          <Checkbox checked={visibleColumns.plannedStart} />
          <ListItemText primary="Planowany start" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('plannedEnd')}>
          <Checkbox checked={visibleColumns.plannedEnd} />
          <ListItemText primary="Planowane zakończenie" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('cost')}>
          <Checkbox checked={visibleColumns.cost} />
          <ListItemText primary="Koszt jednostkowy" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('totalCost')}>
          <Checkbox checked={visibleColumns.totalCost} />
          <ListItemText primary="Koszt całkowity" />
        </MenuItem>
        <MenuItem onClick={() => toggleColumnVisibility('actions')}>
          <Checkbox checked={visibleColumns.actions} />
          <ListItemText primary="Akcje" />
        </MenuItem>
      </Menu>
      
      {/* Dialog zatrzymania produkcji */}
      <Dialog
        open={stopProductionDialogOpen}
        onClose={() => setStopProductionDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Zatrzymaj produkcję</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wprowadź informacje o zakończonej sesji produkcyjnej
          </DialogContentText>
          
          {productionError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {productionError}
            </Alert>
          )}

          <TextField
            label="Wyprodukowana ilość"
            type="number"
            value={completedQuantity}
            onChange={(e) => setCompletedQuantity(e.target.value)}
            fullWidth
            margin="dense"
            InputProps={{
              endAdornment: <Typography variant="body2">szt.</Typography>
            }}
          />
          
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, my: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Przedział czasowy produkcji:
              </Typography>
              
              <DateTimePicker
                label="Czas rozpoczęcia"
                value={productionStartTime}
                onChange={(newValue) => setProductionStartTime(newValue)}
                ampm={false}
                format="dd-MM-yyyy HH:mm"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    margin: 'dense',
                    variant: 'outlined'
                  }
                }}
              />
              
              <DateTimePicker
                label="Czas zakończenia"
                value={productionEndTime}
                onChange={(newValue) => setProductionEndTime(newValue)}
                ampm={false}
                format="dd-MM-yyyy HH:mm"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    margin: 'dense',
                    variant: 'outlined'
                  }
                }}
              />
              
              {productionStartTime && productionEndTime && (
                <Typography variant="body2" color="textSecondary">
                  Czas trwania: {Math.round((productionEndTime.getTime() - productionStartTime.getTime()) / (1000 * 60))} minut
                </Typography>
              )}
            </Box>
          </LocalizationProvider>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStopProductionDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={handleStopProduction} variant="contained">
            Zatwierdź
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog dodawania produktu do magazynu */}
      <Dialog
        open={addToInventoryDialogOpen}
        onClose={() => setAddToInventoryDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Dodaj produkt do magazynu</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wprowadź informacje o partii produktu przed dodaniem do magazynu
          </DialogContentText>
          
          {inventoryError && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {inventoryError}
            </Alert>
          )}
          
          <TextField
            label="Ilość końcowa"
            type="number"
            value={inventoryData.finalQuantity}
            onChange={(e) => setInventoryData({...inventoryData, finalQuantity: e.target.value})}
            fullWidth
            margin="dense"
            helperText="Wprowadź faktyczną ilość produktu końcowego"
          />
          
          <TextField
            label="Numer partii (LOT)"
            value={inventoryData.lotNumber}
            onChange={(e) => setInventoryData({...inventoryData, lotNumber: e.target.value})}
            fullWidth
            margin="dense"
            helperText="Wprowadź unikalny identyfikator partii produkcyjnej"
          />
          
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
            <Box sx={{ my: 2 }}>
              <DateTimePicker
                label="Data ważności"
                value={inventoryData.expiryDate}
                onChange={(newValue) => setInventoryData({...inventoryData, expiryDate: newValue})}
                views={['year', 'month', 'day']}
                format="dd-MM-yyyy"
                slotProps={{
                  textField: {
                    fullWidth: true,
                    margin: 'dense',
                    variant: 'outlined',
                    helperText: "Data ważności produktu",
                    error: !inventoryData.expiryDate,
                    InputProps: {
                      onError: (error) => {
                        console.error("Błąd w polu daty:", error);
                      }
                    }
                  },
                  actionBar: {
                    actions: ['clear', 'today']
                  }
                }}
              />
            </Box>
          </LocalizationProvider>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddToInventoryDialogOpen(false)}>
            Anuluj
          </Button>
          <Button onClick={() => handleAddToInventory(currentTaskId)} variant="contained" color="primary">
            Dodaj do magazynu
          </Button>
        </DialogActions>
      </Dialog>

      {/* Komponent Pagination */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2, flexDirection: 'column', alignItems: 'center' }}>
        <Box sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
          <Typography variant="body2" color="textSecondary">
            Wyświetlanie {tasks.length > 0 ? (page - 1) * limit + 1 : 0} - {Math.min(page * limit, totalItems)} z {totalItems} zadań
          </Typography>
          
          <FormControl variant="outlined" size="small" sx={{ minWidth: 80 }}>
            <Select
              value={limit}
              onChange={handleChangeRowsPerPage}
            >
              <MenuItem value={5}>5</MenuItem>
              <MenuItem value={10}>10</MenuItem>
              <MenuItem value={25}>25</MenuItem>
              <MenuItem value={50}>50</MenuItem>
            </Select>
          </FormControl>
        </Box>
        
        <Pagination
          count={totalPages}
          page={page}
          onChange={handleChangePage}
          shape="rounded"
          color="primary"
        />
      </Box>
    </Container>
  );
};

export default TaskList;