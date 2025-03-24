import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
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
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Chip,
  IconButton,
  InputAdornment,
  Autocomplete,
  CircularProgress,
  Divider,
  Alert,
  Tooltip
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  Search as SearchIcon,
  ListAlt as ReportIcon,
  Done as DoneIcon,
  Close as CancelIcon,
  Save as SaveIcon
} from '@mui/icons-material';
import {
  getStocktakingById,
  getStocktakingItems,
  addItemToStocktaking,
  updateStocktakingItem,
  deleteStocktakingItem,
  completeStocktaking,
  getAllInventoryItems
} from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';

const StocktakingDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [stocktaking, setStocktaking] = useState(null);
  const [items, setItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState(null);
  
  const [inventoryItems, setInventoryItems] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [countedQuantity, setCountedQuantity] = useState('');
  const [notes, setNotes] = useState('');
  
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmAdjustInventory, setConfirmAdjustInventory] = useState(true);
  const [editItemId, setEditItemId] = useState(null);
  const [deleteItemId, setDeleteItemId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  useEffect(() => {
    fetchStocktakingData();
    fetchInventoryItems();
  }, [id]);
  
  useEffect(() => {
    filterItems();
  }, [searchTerm, items]);
  
  const fetchStocktakingData = async () => {
    try {
      setLoading(true);
      const stocktakingData = await getStocktakingById(id);
      setStocktaking(stocktakingData);
      
      const stocktakingItems = await getStocktakingItems(id);
      setItems(stocktakingItems);
      setFilteredItems(stocktakingItems);
    } catch (error) {
      console.error('Błąd podczas pobierania danych inwentaryzacji:', error);
      setError('Nie udało się pobrać danych inwentaryzacji');
    } finally {
      setLoading(false);
    }
  };
  
  const fetchInventoryItems = async () => {
    try {
      const inventoryItemsData = await getAllInventoryItems();
      setInventoryItems(inventoryItemsData);
    } catch (error) {
      console.error('Błąd podczas pobierania produktów z magazynu:', error);
    }
  };
  
  const filterItems = () => {
    if (!searchTerm.trim()) {
      setFilteredItems(items);
      return;
    }
    
    const term = searchTerm.toLowerCase();
    const filtered = items.filter(item => 
      (item.name && item.name.toLowerCase().includes(term)) ||
      (item.category && item.category.toLowerCase().includes(term))
    );
    
    setFilteredItems(filtered);
  };
  
  const handleAddItem = async () => {
    if (!selectedItem) {
      showError('Wybierz produkt z magazynu');
      return;
    }
    
    if (countedQuantity === '' || isNaN(countedQuantity) || Number(countedQuantity) < 0) {
      showError('Podaj prawidłową ilość policzoną');
      return;
    }
    
    try {
      await addItemToStocktaking(id, {
        inventoryItemId: selectedItem.id,
        countedQuantity: Number(countedQuantity),
        notes
      }, currentUser.uid);
      
      showSuccess('Produkt został dodany do inwentaryzacji');
      setAddItemDialogOpen(false);
      
      // Reset form
      setSelectedItem(null);
      setCountedQuantity('');
      setNotes('');
      
      // Refresh data
      fetchStocktakingData();
    } catch (error) {
      console.error('Błąd podczas dodawania przedmiotu:', error);
      showError(`Błąd podczas dodawania: ${error.message}`);
    }
  };
  
  const handleEditItem = async (itemId) => {
    const item = items.find(i => i.id === itemId);
    if (!item) return;
    
    setEditItemId(itemId);
    setCountedQuantity(item.countedQuantity.toString());
    setNotes(item.notes || '');
  };
  
  const handleSaveEdit = async () => {
    if (countedQuantity === '' || isNaN(countedQuantity) || Number(countedQuantity) < 0) {
      showError('Podaj prawidłową ilość policzoną');
      return;
    }
    
    try {
      await updateStocktakingItem(editItemId, {
        countedQuantity: Number(countedQuantity),
        notes
      }, currentUser.uid);
      
      showSuccess('Przedmiot został zaktualizowany');
      setEditItemId(null);
      setCountedQuantity('');
      setNotes('');
      
      // Refresh data
      fetchStocktakingData();
    } catch (error) {
      console.error('Błąd podczas aktualizacji przedmiotu:', error);
      showError(`Błąd podczas aktualizacji: ${error.message}`);
    }
  };
  
  const handleCancelEdit = () => {
    setEditItemId(null);
    setCountedQuantity('');
    setNotes('');
  };
  
  const handleDeleteItem = (itemId) => {
    setDeleteItemId(itemId);
    setDeleteDialogOpen(true);
  };
  
  const confirmDeleteItem = async () => {
    try {
      await deleteStocktakingItem(deleteItemId);
      showSuccess('Przedmiot został usunięty z inwentaryzacji');
      setDeleteDialogOpen(false);
      
      // Refresh data
      fetchStocktakingData();
    } catch (error) {
      console.error('Błąd podczas usuwania przedmiotu:', error);
      showError(`Błąd podczas usuwania: ${error.message}`);
    }
  };
  
  const handleCompleteStocktaking = () => {
    setConfirmDialogOpen(true);
  };
  
  const confirmComplete = async () => {
    try {
      await completeStocktaking(id, confirmAdjustInventory, currentUser.uid);
      
      const message = confirmAdjustInventory
        ? 'Inwentaryzacja zakończona i stany magazynowe zaktualizowane'
        : 'Inwentaryzacja zakończona bez aktualizacji stanów magazynowych';
      
      showSuccess(message);
      setConfirmDialogOpen(false);
      
      // Refresh data
      fetchStocktakingData();
    } catch (error) {
      console.error('Błąd podczas kończenia inwentaryzacji:', error);
      showError(`Błąd podczas kończenia inwentaryzacji: ${error.message}`);
    }
  };
  
  const getDiscrepancyColor = (discrepancy) => {
    if (discrepancy === 0) return 'success';
    if (discrepancy > 0) return 'primary';
    return 'error';
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
  
  const isCompleted = stocktaking && stocktaking.status === 'Zakończona';
  
  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      </Container>
    );
  }
  
  if (error) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">{error}</Alert>
        <Box sx={{ mt: 2 }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            component={Link}
            to="/inventory/stocktaking"
          >
            Powrót do listy inwentaryzacji
          </Button>
        </Box>
      </Container>
    );
  }
  
  if (!stocktaking) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Alert severity="error">Nie znaleziono inwentaryzacji</Alert>
        <Box sx={{ mt: 2 }}>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            component={Link}
            to="/inventory/stocktaking"
          >
            Powrót do listy inwentaryzacji
          </Button>
        </Box>
      </Container>
    );
  }
  
  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Button
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          component={Link}
          to="/inventory/stocktaking"
        >
          Powrót
        </Button>
        <Typography variant="h4" component="h1">
          Szczegóły inwentaryzacji
        </Typography>
        <Box>
          {!isCompleted && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<EditIcon />}
              component={Link}
              to={`/inventory/stocktaking/${id}/edit`}
              sx={{ mr: 1 }}
            >
              Edytuj
            </Button>
          )}
          <Button
            variant="contained"
            color="secondary"
            startIcon={<ReportIcon />}
            component={Link}
            to={`/inventory/stocktaking/${id}/report`}
          >
            Raport
          </Button>
        </Box>
      </Box>
      
      <Paper sx={{ p: 3, mb: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>
              Informacje podstawowe
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body1">
                <strong>Nazwa:</strong> {stocktaking.name}
              </Typography>
              <Typography variant="body1">
                <strong>Status:</strong> {renderStatusChip(stocktaking.status)}
              </Typography>
              <Typography variant="body1">
                <strong>Lokalizacja:</strong> {stocktaking.location || 'Wszystkie lokalizacje'}
              </Typography>
              <Typography variant="body1">
                <strong>Data planowana:</strong> {stocktaking.scheduledDate ? formatDate(stocktaking.scheduledDate) : '-'}
              </Typography>
              {stocktaking.description && (
                <Typography variant="body1">
                  <strong>Opis:</strong> {stocktaking.description}
                </Typography>
              )}
            </Box>
          </Grid>
          <Grid item xs={12} md={6}>
            <Typography variant="subtitle1" gutterBottom>
              Informacje dodatkowe
            </Typography>
            <Box sx={{ mb: 2 }}>
              <Typography variant="body1">
                <strong>Data utworzenia:</strong> {stocktaking.createdAt ? formatDate(stocktaking.createdAt) : '-'}
              </Typography>
              <Typography variant="body1">
                <strong>Utworzona przez:</strong> {stocktaking.createdBy || '-'}
              </Typography>
              {stocktaking.completedAt && (
                <Typography variant="body1">
                  <strong>Data zakończenia:</strong> {formatDate(stocktaking.completedAt)}
                </Typography>
              )}
              {stocktaking.notes && (
                <Typography variant="body1">
                  <strong>Uwagi:</strong> {stocktaking.notes}
                </Typography>
              )}
            </Box>
          </Grid>
        </Grid>
      </Paper>
      
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h5">
          Produkty ({items.length})
        </Typography>
        <Box>
          {!isCompleted && (
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={() => setAddItemDialogOpen(true)}
              sx={{ mr: 1 }}
            >
              Dodaj produkt
            </Button>
          )}
          {!isCompleted && items.length > 0 && (
            <Button
              variant="contained"
              color="success"
              startIcon={<DoneIcon />}
              onClick={handleCompleteStocktaking}
            >
              Zakończ inwentaryzację
            </Button>
          )}
        </Box>
      </Box>
      
      <Paper sx={{ p: 2, mb: 3 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Szukaj produktów..."
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
      
      {items.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          Brak produktów w inwentaryzacji. {!isCompleted && 'Możesz dodać produkty klikając przycisk "Dodaj produkt".'}
        </Alert>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nazwa produktu</TableCell>
                <TableCell>Kategoria</TableCell>
                <TableCell align="right">Stan systemowy</TableCell>
                <TableCell align="right">Stan policzony</TableCell>
                <TableCell align="right">Różnica</TableCell>
                <TableCell>Uwagi</TableCell>
                {!isCompleted && <TableCell align="center">Akcje</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id} hover>
                  {editItemId === item.id ? (
                    <>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell align="right">{item.systemQuantity} {item.unit}</TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          size="small"
                          value={countedQuantity}
                          onChange={(e) => setCountedQuantity(e.target.value)}
                          inputProps={{ min: 0, step: 0.01 }}
                          sx={{ width: '100px' }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Chip 
                          label={`${Number(countedQuantity) - item.systemQuantity}`} 
                          color={Number(countedQuantity) - item.systemQuantity === 0 ? 'success' : Number(countedQuantity) - item.systemQuantity > 0 ? 'primary' : 'error'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          fullWidth
                        />
                      </TableCell>
                      <TableCell align="center">
                        <IconButton color="primary" onClick={handleSaveEdit} size="small">
                          <SaveIcon />
                        </IconButton>
                        <IconButton color="secondary" onClick={handleCancelEdit} size="small">
                          <CancelIcon />
                        </IconButton>
                      </TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell align="right">{item.systemQuantity} {item.unit}</TableCell>
                      <TableCell align="right">{item.countedQuantity} {item.unit}</TableCell>
                      <TableCell align="right">
                        <Chip 
                          label={item.discrepancy} 
                          color={getDiscrepancyColor(item.discrepancy)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{item.notes || '-'}</TableCell>
                      {!isCompleted && (
                        <TableCell align="center">
                          <IconButton color="primary" onClick={() => handleEditItem(item.id)} size="small">
                            <EditIcon />
                          </IconButton>
                          <IconButton color="error" onClick={() => handleDeleteItem(item.id)} size="small">
                            <DeleteIcon />
                          </IconButton>
                        </TableCell>
                      )}
                    </>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      
      {/* Dialog dodawania produktu */}
      <Dialog open={addItemDialogOpen} onClose={() => setAddItemDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Dodaj produkt do inwentaryzacji</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 2 }}>
            <Autocomplete
              options={inventoryItems}
              getOptionLabel={(option) => `${option.name} (${option.quantity} ${option.unit})`}
              value={selectedItem}
              onChange={(event, newValue) => setSelectedItem(newValue)}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Wybierz produkt z magazynu"
                  fullWidth
                  required
                  margin="normal"
                />
              )}
            />
            <TextField
              label="Stan policzony"
              type="number"
              fullWidth
              required
              value={countedQuantity}
              onChange={(e) => setCountedQuantity(e.target.value)}
              margin="normal"
              inputProps={{ min: 0, step: 0.01 }}
            />
            <TextField
              label="Uwagi"
              fullWidth
              multiline
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              margin="normal"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddItemDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleAddItem} color="primary">Dodaj</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog usuwania produktu */}
      <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć ten produkt z inwentaryzacji? Ta operacja jest nieodwracalna.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Anuluj</Button>
          <Button onClick={confirmDeleteItem} color="error">Usuń</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog zakończenia inwentaryzacji */}
      <Dialog open={confirmDialogOpen} onClose={() => setConfirmDialogOpen(false)}>
        <DialogTitle>Zakończ inwentaryzację</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz zakończyć tę inwentaryzację? Po zakończeniu, nie będzie można dodawać ani edytować produktów.
          </DialogContentText>
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Dostosuj stany magazynowe?
            </Typography>
            <Grid container spacing={2}>
              <Grid item>
                <Button
                  variant={confirmAdjustInventory ? 'contained' : 'outlined'}
                  color="primary"
                  onClick={() => setConfirmAdjustInventory(true)}
                >
                  Tak, dostosuj stany
                </Button>
              </Grid>
              <Grid item>
                <Button
                  variant={!confirmAdjustInventory ? 'contained' : 'outlined'}
                  color="secondary"
                  onClick={() => setConfirmAdjustInventory(false)}
                >
                  Nie, tylko zakończ
                </Button>
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmDialogOpen(false)}>Anuluj</Button>
          <Button onClick={confirmComplete} color="primary">
            Zakończ inwentaryzację
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default StocktakingDetailsPage; 