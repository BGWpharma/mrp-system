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
  Divider
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
  Cancel as CancelIcon
} from '@mui/icons-material';
import { getAllTasks, updateTaskStatus, deleteTask, addTaskProductToInventory, stopProduction } from '../../services/productionService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';
import { useTheme as useMuiTheme } from '@mui/material/styles';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigate } from 'react-router-dom';
import { TIME_INTERVALS } from '../../utils/constants';
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { pl } from 'date-fns/locale';

const TaskList = () => {
  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const muiTheme = useMuiTheme();
  const { mode } = useTheme();
  const navigate = useNavigate();
  const [stopProductionDialogOpen, setStopProductionDialogOpen] = useState(false);
  const [currentTaskId, setCurrentTaskId] = useState(null);
  const [completedQuantity, setCompletedQuantity] = useState('');
  const [timeSpent, setTimeSpent] = useState('');
  const [productionError, setProductionError] = useState(null);
  const [productionStartTime, setProductionStartTime] = useState(new Date());
  const [productionEndTime, setProductionEndTime] = useState(new Date());

  // Pobierz zadania przy montowaniu komponentu
  useEffect(() => {
    fetchTasks();
  }, []);

  // Filtruj zadania przy zmianie searchTerm, statusFilter lub tasks
  useEffect(() => {
    let filtered = [...tasks];
    
    // Filtruj według statusu
    if (statusFilter) {
      filtered = filtered.filter(task => task.status === statusFilter);
    }
    
    // Filtruj według wyszukiwanego tekstu
    if (searchTerm.trim() !== '') {
      filtered = filtered.filter(task => 
        task.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.productName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        task.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    setFilteredTasks(filtered);
  }, [searchTerm, statusFilter, tasks]);

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const fetchedTasks = await getAllTasks();
      setTasks(fetchedTasks);
      setFilteredTasks(fetchedTasks);
    } catch (error) {
      showError('Błąd podczas pobierania zadań: ' + error.message);
      console.error('Error fetching tasks:', error);
    } finally {
      setLoading(false);
    }
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
      await addTaskProductToInventory(id, currentUser.uid);
      showSuccess('Produkt został dodany do magazynu jako nowa partia (LOT)');
      // Odśwież listę zadań
      fetchTasks();
    } catch (error) {
      showError('Błąd podczas dodawania produktu do magazynu: ' + error.message);
      console.error('Error adding product to inventory:', error);
    }
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
      case 'Zaplanowane': return 'primary';
      case 'W trakcie': return 'warning';
      case 'Potwierdzenie zużycia': return 'info';
      case 'Zakończone': return 'success';
      case 'Anulowane': return 'error';
      case 'Wstrzymane': return 'default';
      default: return 'default';
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
          <IconButton 
            color="warning" 
            onClick={() => handleStatusChange(task.id, 'W trakcie')}
            title="Rozpocznij produkcję"
          >
            <StartIcon />
          </IconButton>
        );
      case 'W trakcie':
        return (
          <>
            <IconButton 
              color="success" 
              onClick={() => handleStatusChange(task.id, 'Zakończone')}
              title="Zakończ produkcję"
            >
              <CompleteIcon />
            </IconButton>
            <IconButton 
              color="error" 
              onClick={() => openStopProductionDialog(task.id)}
              title="Zatrzymaj produkcję"
            >
              <StopIcon />
            </IconButton>
          </>
        );
      case 'Potwierdzenie zużycia':
        return (
          <IconButton 
            color="info" 
            component={Link}
            to={`/production/consumption/${task.id}`}
            title="Potwierdź zużycie materiałów"
          >
            <CheckIcon />
          </IconButton>
        );
      case 'Zakończone':
        // Jeśli zadanie jest zakończone i nie zostało jeszcze dodane do magazynu
        if (!task.inventoryUpdated) {
          return (
            <IconButton 
              color="primary" 
              onClick={() => handleAddToInventory(task.id)}
              title="Dodaj produkt do magazynu"
            >
              <InventoryIcon />
            </IconButton>
          );
        }
        return null;
      default:
        return null;
    }
  };

  if (loading) {
    return <div>Ładowanie zadań produkcyjnych...</div>;
  }

  return (
    <Container>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Zadania produkcyjne</Typography>
      </Box>

      <Box sx={{ display: 'flex', mb: 3, gap: 2 }}>
        <TextField
          label="Szukaj zadania"
          variant="outlined"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          fullWidth
          InputProps={{
            startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
          }}
        />
        <FormControl sx={{ minWidth: 200 }}>
          <InputLabel>Status</InputLabel>
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
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
      </Box>

      {filteredTasks.length === 0 ? (
        <Typography variant="body1" align="center">
          Nie znaleziono zadań produkcyjnych
        </Typography>
      ) : (
        <TableContainer component={Paper} sx={{ mt: 3 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nazwa zadania</TableCell>
                <TableCell>Numer MO</TableCell>
                <TableCell>Produkt</TableCell>
                <TableCell>Ilość</TableCell>
                <TableCell>Data rozpoczęcia</TableCell>
                <TableCell>Planowana data zakończenia</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Koszt</TableCell>
                <TableCell align="right">Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell component="th" scope="row">
                    {task.name}
                  </TableCell>
                  <TableCell>
                    {task.moNumber || '-'}
                  </TableCell>
                  <TableCell>{task.productName}</TableCell>
                  <TableCell>
                    {task.quantity} {task.unit}
                  </TableCell>
                  <TableCell>
                    {task.scheduledDate ? formatDate(task.scheduledDate, { timeStyle: undefined }) : 'Nie określono'}
                  </TableCell>
                  <TableCell>
                    {task.endDate ? formatDate(task.endDate, { timeStyle: undefined }) : 'Nie określono'}
                  </TableCell>
                  <TableCell>
                    <Chip 
                      label={task.status} 
                      color={getStatusColor(task.status)} 
                      size="small" 
                    />
                  </TableCell>
                  <TableCell>
                    {task.costs ? (
                      task.costs.totalCost.toLocaleString('pl-PL') + ' EUR'
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {getStatusActions(task)}
                    <IconButton
                      size="small"
                      onClick={() => navigate(`/production/tasks/${task.id}`)}
                      title="Szczegóły"
                      color="primary"
                    >
                      <InfoIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => navigate(`/production/tasks/${task.id}/edit`)}
                      title="Edytuj"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDelete(task.id)}
                      title="Usuń"
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

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
    </Container>
  );
};

export default TaskList;