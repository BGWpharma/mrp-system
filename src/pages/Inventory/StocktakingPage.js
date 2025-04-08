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
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Visibility as ViewIcon,
  Edit as EditIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { getAllStocktakings } from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { formatDate } from '../../utils/formatters';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/config';

const StocktakingPage = () => {
  const [stocktakings, setStocktakings] = useState([]);
  const [filteredStocktakings, setFilteredStocktakings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  const { currentUser } = useAuth();
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
  
  // Funkcja pobierająca dane użytkowników
  const fetchUserNames = async (userIds) => {
    if (!userIds || userIds.length === 0) return;
    
    const uniqueUserIds = [...new Set(userIds)]; // Usuń duplikaty
    const names = {};
    
    for (const userId of uniqueUserIds) {
      if (!userId) continue;
      
      try {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          // Wybierz najlepszą dostępną informację o użytkowniku: displayName, email lub ID
          names[userId] = userData.displayName || userData.email || userId;
        } else {
          names[userId] = userId; // Fallback na ID, jeśli nie znaleziono użytkownika
        }
      } catch (error) {
        console.error("Błąd podczas pobierania danych użytkownika:", error);
        names[userId] = userId; // Fallback na ID w przypadku błędu
      }
    }
    
    setUserNames(names);
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
                      <IconButton
                        component={Link}
                        to={`/inventory/stocktaking/${stocktaking.id}/edit`}
                        color="secondary"
                        size="small"
                      >
                        <EditIcon />
                      </IconButton>
                    )}
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

export default StocktakingPage; 