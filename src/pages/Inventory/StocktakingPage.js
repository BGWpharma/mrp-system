import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Container,
  Typography,
  Box,
  Paper,
  Button,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  TextField,
  InputAdornment,
  CircularProgress,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { getAllStocktakings, deleteStocktaking } from '../../services/inventoryService';
import { getUsersDisplayNames } from '../../services/userService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/config';

const StocktakingPage = () => {
  const [stocktakings, setStocktakings] = useState([]);
  const [filteredStocktakings, setFilteredStocktakings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [stocktakingToDelete, setStocktakingToDelete] = useState(null);
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const [userNames, setUserNames] = useState({});

  useEffect(() => {
    fetchStocktakings();
  }, []);

  useEffect(() => {
    filterStocktakings();
  }, [searchTerm, stocktakings]);

  const fetchStocktakings = async () => {
    try {
      setLoading(true);
      const stocktakingsData = await getAllStocktakings();
      setStocktakings(stocktakingsData);
      setFilteredStocktakings(stocktakingsData);
      
      // Pobierz nazwy użytkowników
      const userIds = stocktakingsData
        .map(stocktaking => stocktaking.createdBy)
        .filter(id => id); // Filtruj puste ID
        
      fetchUserNames(userIds);
    } catch (error) {
      console.error('Błąd podczas pobierania inwentaryzacji:', error);
      setError('Wystąpił błąd podczas ładowania inwentaryzacji.');
    } finally {
      setLoading(false);
    }
  };
  
  // Funkcja pobierająca dane użytkowników - zoptymalizowana wersja
  const fetchUserNames = async (userIds) => {
    if (!userIds || userIds.length === 0) return;
    
    const uniqueUserIds = [...new Set(userIds.filter(id => id))]; // Usuń duplikaty i puste wartości
    
    if (uniqueUserIds.length === 0) return;
    
    try {
      const names = await getUsersDisplayNames(uniqueUserIds);
      setUserNames(names);
    } catch (error) {
      console.error("Błąd podczas pobierania danych użytkowników:", error);
    }
  };
  
  // Funkcja zwracająca nazwę użytkownika zamiast ID
  const getUserName = (userId) => {
    return userNames[userId] || userId || 'System';
  };

  const filterStocktakings = () => {
    if (!searchTerm.trim()) {
      setFilteredStocktakings(stocktakings);
      return;
    }

    const term = searchTerm.toLowerCase();
    const filtered = stocktakings.filter((stocktaking) => 
      (stocktaking.name && stocktaking.name.toLowerCase().includes(term)) ||
      (stocktaking.location && stocktaking.location.toLowerCase().includes(term)) ||
      (stocktaking.status && stocktaking.status.toLowerCase().includes(term))
    );
    
    setFilteredStocktakings(filtered);
  };

  const renderStatusChip = (status) => {
    let color = 'default';
    
    switch (status) {
      case 'Otwarta':
        color = 'primary';
        break;
      case 'W trakcie':
        color = 'warning';
        break;
      case 'Zakończona':
        color = 'success';
        break;
      default:
        color = 'default';
    }
    
    return <Chip label={status} color={color} size="small" />;
  };

  const handleDeleteStocktaking = (stocktaking) => {
    setStocktakingToDelete(stocktaking);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteStocktaking = async () => {
    if (!stocktakingToDelete) return;
    
    try {
      await deleteStocktaking(stocktakingToDelete.id);
      showSuccess('Inwentaryzacja została usunięta');
      setDeleteDialogOpen(false);
      setStocktakingToDelete(null);
      
      // Odśwież listę inwentaryzacji
      fetchStocktakings();
    } catch (error) {
      console.error('Błąd podczas usuwania inwentaryzacji:', error);
      showError(`Błąd podczas usuwania: ${error.message}`);
    }
  };

  const cancelDeleteStocktaking = () => {
    setDeleteDialogOpen(false);
    setStocktakingToDelete(null);
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Inwentaryzacja
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          component={Link}
          to="/inventory/stocktaking/new"
        >
          Nowa inwentaryzacja
        </Button>
      </Box>
      
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Szukaj inwentaryzacji..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
        </Grid>
      </Paper>
      
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>
      ) : filteredStocktakings.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          Nie znaleziono żadnych inwentaryzacji. Możesz utworzyć nową klikając przycisk "Nowa inwentaryzacja".
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nazwa</TableCell>
                <TableCell>Lokalizacja</TableCell>
                <TableCell>Data utworzenia</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Utworzony przez</TableCell>
                <TableCell align="center">Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredStocktakings.map((stocktaking) => (
                <TableRow key={stocktaking.id} hover>
                  <TableCell>{stocktaking.name}</TableCell>
                  <TableCell>{stocktaking.location || '-'}</TableCell>
                  <TableCell>
                    {stocktaking.createdAt ? formatDate(stocktaking.createdAt) : '-'}
                  </TableCell>
                  <TableCell>{renderStatusChip(stocktaking.status)}</TableCell>
                  <TableCell>{getUserName(stocktaking.createdBy)}</TableCell>
                  <TableCell align="center">
                    <IconButton
                      component={Link}
                      to={`/inventory/stocktaking/${stocktaking.id}`}
                      color="primary"
                      size="small"
                    >
                      <ViewIcon />
                    </IconButton>
                    {stocktaking.status !== 'Zakończona' && (
                      <>
                        <IconButton
                          component={Link}
                          to={`/inventory/stocktaking/${stocktaking.id}/edit`}
                          color="secondary"
                          size="small"
                        >
                          <EditIcon />
                        </IconButton>
                        <IconButton
                          onClick={() => handleDeleteStocktaking(stocktaking)}
                          color="error"
                          size="small"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      
      {/* Dialog potwierdzenia usunięcia */}
      <Dialog open={deleteDialogOpen} onClose={cancelDeleteStocktaking}>
        <DialogTitle>Potwierdź usunięcie inwentaryzacji</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć inwentaryzację "{stocktakingToDelete?.name}"? 
            Ta operacja jest nieodwracalna i usunie również wszystkie powiązane elementy inwentaryzacji.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={cancelDeleteStocktaking}>Anuluj</Button>
          <Button onClick={confirmDeleteStocktaking} color="error">
            Usuń
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default StocktakingPage; 