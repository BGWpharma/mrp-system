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
  CircularProgress
} from '@mui/material';
import { 
  Add as AddIcon, 
  Search as SearchIcon, 
  Edit as EditIcon,
  Delete as DeleteIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  CheckCircle as CompleteIcon,
  Inventory as InventoryIcon
} from '@mui/icons-material';
import { getAllTasks, updateTaskStatus, deleteTask, addTaskProductToInventory } from '../../services/productionService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';

const TaskList = () => {
  const [tasks, setTasks] = useState([]);
  const [filteredTasks, setFilteredTasks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();

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
      showSuccess('Produkt został dodany do magazynu jako partia');
      // Odśwież listę zadań
      fetchTasks();
    } catch (error) {
      showError('Błąd podczas dodawania produktu do magazynu: ' + error.message);
      console.error('Error adding product to inventory:', error);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Zaplanowane': return 'primary';
      case 'W trakcie': return 'warning';
      case 'Zakończone': return 'success';
      case 'Anulowane': return 'error';
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
        <Tooltip title={`Produkt dodany do magazynu jako partia (ID: ${task.inventoryItemId})`}>
          <Chip 
            label="Dodano do magazynu" 
            color="success" 
            size="small" 
            variant="outlined"
          />
        </Tooltip>
      );
    } else if (task.readyForInventory) {
      return (
        <Tooltip title="Gotowy do dodania do magazynu">
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
              onClick={() => handleStatusChange(task.id, 'Anulowane')}
              title="Anuluj produkcję"
            >
              <StopIcon />
            </IconButton>
          </>
        );
      case 'Zakończone':
        // Jeśli zadanie jest zakończone i gotowe do dodania do magazynu, pokaż przycisk dodania do magazynu
        if (task.readyForInventory) {
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
        <Button 
          variant="contained" 
          color="primary" 
          component={Link} 
          to="/production/new-task"
          startIcon={<AddIcon />}
        >
          Nowe zadanie
        </Button>
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
                <TableCell>Status</TableCell>
                <TableCell>Koszt</TableCell>
                <TableCell>Magazyn</TableCell>
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
                    {task.scheduledDate ? formatDate(task.scheduledDate) : 'Nie określono'}
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
                      task.costs.totalCost.toLocaleString('pl-PL') + ' zł'
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell>
                    {getInventoryStatus(task)}
                  </TableCell>
                  <TableCell align="right">
                    {getStatusActions(task)}
                    <IconButton 
                      component={Link} 
                      to={`/production/tasks/${task.id}`}
                      color="primary"
                      title="Edytuj"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton 
                      onClick={() => handleDelete(task.id)} 
                      color="error"
                      title="Usuń"
                      disabled={task.status === 'W trakcie' || task.status === 'Zakończone'}
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
    </Container>
  );
};

export default TaskList;