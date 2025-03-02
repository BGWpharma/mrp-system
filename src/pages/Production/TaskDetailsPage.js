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
  CircularProgress,
  IconButton
} from '@mui/material';
import {
  Edit as EditIcon,
  ArrowBack as ArrowBackIcon,
  PlayArrow as StartIcon,
  Stop as StopIcon,
  CheckCircle as CompleteIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { getTaskById, updateTaskStatus, deleteTask } from '../../services/productionService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';

const TaskDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTask = async () => {
      try {
        setLoading(true);
        const fetchedTask = await getTaskById(id);
        setTask(fetchedTask);
      } catch (error) {
        showError('Błąd podczas pobierania zadania: ' + error.message);
        console.error('Error fetching task:', error);
        navigate('/production');
      } finally {
        setLoading(false);
      }
    };
    
    fetchTask();
  }, [id, navigate, showError]);

  const handleStatusChange = async (newStatus) => {
    try {
      await updateTaskStatus(id, newStatus, currentUser.uid);
      showSuccess(`Status zadania zmieniony na: ${newStatus}`);
      
      // Odśwież dane zadania
      const updatedTask = await getTaskById(id);
      setTask(updatedTask);
    } catch (error) {
      showError('Błąd podczas zmiany statusu: ' + error.message);
      console.error('Error updating task status:', error);
    }
  };

  const handleDelete = async () => {
    if (window.confirm('Czy na pewno chcesz usunąć to zadanie produkcyjne?')) {
      try {
        await deleteTask(id);
        showSuccess('Zadanie zostało usunięte');
        navigate('/production');
      } catch (error) {
        showError('Błąd podczas usuwania zadania: ' + error.message);
        console.error('Error deleting task:', error);
      }
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Zaplanowane':
        return 'primary';
      case 'W trakcie':
        return 'warning';
      case 'Zakończone':
        return 'success';
      case 'Anulowane':
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusActions = () => {
    if (!task) return null;
    
    switch (task.status) {
      case 'Zaplanowane':
        return (
          <Button 
            variant="contained" 
            color="warning" 
            startIcon={<StartIcon />}
            onClick={() => handleStatusChange('W trakcie')}
          >
            Rozpocznij produkcję
          </Button>
        );
      case 'W trakcie':
        return (
          <>
            <Button 
              variant="contained" 
              color="success" 
              startIcon={<CompleteIcon />}
              onClick={() => handleStatusChange('Zakończone')}
              sx={{ mr: 1 }}
            >
              Zakończ produkcję
            </Button>
            <Button 
              variant="contained" 
              color="error" 
              startIcon={<StopIcon />}
              onClick={() => handleStatusChange('Anulowane')}
            >
              Anuluj produkcję
            </Button>
          </>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  if (!task) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h5">Zadanie nie zostało znalezione</Typography>
        <Button 
          variant="contained" 
          component={Link} 
          to="/production"
          startIcon={<ArrowBackIcon />}
          sx={{ mt: 2 }}
        >
          Powrót do produkcji
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate('/production')}
        >
          Powrót
        </Button>
        <Typography variant="h5">
          Szczegóły zadania produkcyjnego
        </Typography>
        <Box>
          <IconButton 
            color="primary" 
            component={Link}
            to={`/production/tasks/${id}/edit`}
            title="Edytuj"
          >
            <EditIcon />
          </IconButton>
          <IconButton 
            color="error" 
            onClick={handleDelete}
            title="Usuń"
          >
            <DeleteIcon />
          </IconButton>
        </Box>
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12}>
            <Typography variant="h6">{task.name}</Typography>
            <Chip 
              label={task.status} 
              color={getStatusColor(task.status)} 
              sx={{ mt: 1 }}
            />
          </Grid>
          <Grid item xs={12}>
            <Divider />
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2">Produkt</Typography>
            <Typography variant="body1">{task.productName}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2">Ilość</Typography>
            <Typography variant="body1">{task.quantity} {task.unit}</Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2">Zaplanowano na</Typography>
            <Typography variant="body1">
              {task.scheduledDate ? formatDate(task.scheduledDate) : 'Nie określono'}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={6}>
            <Typography variant="subtitle2">Priorytet</Typography>
            <Typography variant="body1">{task.priority || 'Normalny'}</Typography>
          </Grid>
          {task.description && (
            <Grid item xs={12}>
              <Typography variant="subtitle2">Opis</Typography>
              <Typography variant="body1">{task.description}</Typography>
            </Grid>
          )}
          {task.notes && (
            <Grid item xs={12}>
              <Typography variant="subtitle2">Notatki</Typography>
              <Typography variant="body1">{task.notes}</Typography>
            </Grid>
          )}
        </Grid>
      </Paper>

      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
        {getStatusActions()}
      </Box>
    </Container>
  );
};

export default TaskDetailsPage; 