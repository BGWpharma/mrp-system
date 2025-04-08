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
  Tooltip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch
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
  Save as SaveIcon,
  Inventory as InventoryIcon
} from '@mui/icons-material';
import {
  getStocktakingById,
  getStocktakingItems,
  addItemToStocktaking,
  updateStocktakingItem,
  deleteStocktakingItem,
  completeStocktaking,
  getAllInventoryItems,
  getItemBatches
} from '../../services/inventoryService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../services/firebase/config';

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
  
  // Dodane stany dla obsługi LOTów
  const [isLotMode, setIsLotMode] = useState(true); // Domyślnie tryb LOT włączony
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [loadingBatches, setLoadingBatches] = useState(false);
  
  const [addItemDialogOpen, setAddItemDialogOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [confirmAdjustInventory, setConfirmAdjustInventory] = useState(true);
  const [editItemId, setEditItemId] = useState(null);
  const [deleteItemId, setDeleteItemId] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  // Dodaję stan do przechowywania nazw użytkowników
  const [userNames, setUserNames] = useState({});
  
  useEffect(() => {
    fetchStocktakingData();
    fetchInventoryItems();
  }, [id]);
  
  useEffect(() => {
    filterItems();
  }, [searchTerm, items]);
  
  // Funkcja pobierająca dane użytkownika
  const fetchUserNames = async (userIds) => {
    if (!userIds || userIds.length === 0) return;
    
    const names = {};
    
    for (const userId of userIds) {
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
  
  const fetchStocktakingData = async () => {
    try {
      setLoading(true);
      const stocktakingData = await getStocktakingById(id);
      setStocktaking(stocktakingData);
      
      const stocktakingItems = await getStocktakingItems(id);
      setItems(stocktakingItems);
      setFilteredItems(stocktakingItems);
      
      // Pobierz nazwę użytkownika, który utworzył inwentaryzację
      if (stocktakingData && stocktakingData.createdBy) {
        fetchUserNames([stocktakingData.createdBy]);
      }
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
  
  // Nowa funkcja do pobierania partii dla wybranego produktu
  const fetchItemBatches = async (itemId) => {
    if (!itemId) {
      setBatches([]);
      setSelectedBatch(null);
      return;
    }
    
    try {
      setLoadingBatches(true);
      const batchesData = await getItemBatches(itemId);
      setBatches(batchesData);
      setLoadingBatches(false);
    } catch (error) {
      console.error('Błąd podczas pobierania partii:', error);
      setLoadingBatches(false);
    }
  };
  
  // Obsługa wyboru produktu (teraz wyzwala pobieranie partii)
  const handleItemSelect = (item) => {
    setSelectedItem(item);
    if (isLotMode && item) {
      fetchItemBatches(item.id);
    } else {
      setBatches([]);
      setSelectedBatch(null);
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
      (item.category && item.category.toLowerCase().includes(term)) ||
      // Dodaj wyszukiwanie po numerze LOT/partii
      (item.lotNumber && item.lotNumber.toLowerCase().includes(term)) ||
      (item.batchNumber && item.batchNumber.toLowerCase().includes(term))
    );
    
    setFilteredItems(filtered);
  };
  
  const handleAddItem = async () => {
    // Walidacja dla trybu LOT
    if (isLotMode) {
      if (!selectedItem) {
        showError('Wybierz produkt z magazynu');
        return;
      }
      
      if (!selectedBatch) {
        showError('Wybierz partię (LOT) produktu');
        return;
      }
      
      if (countedQuantity === '' || isNaN(countedQuantity) || Number(countedQuantity) < 0) {
        showError('Podaj prawidłową ilość policzoną');
        return;
      }
      
      try {
        // Dodaj pozycję jako partię (LOT)
        await addItemToStocktaking(id, {
          batchId: selectedBatch.id,
          countedQuantity: Number(countedQuantity),
          notes
        }, currentUser.uid);
        
        showSuccess('Partia została dodana do inwentaryzacji');
        setAddItemDialogOpen(false);
        
        // Reset form
        setSelectedItem(null);
        setSelectedBatch(null);
        setBatches([]);
        setCountedQuantity('');
        setNotes('');
        
        // Refresh data
        fetchStocktakingData();
      } catch (error) {
        console.error('Błąd podczas dodawania partii:', error);
        showError(`Błąd podczas dodawania: ${error.message}`);
      }
    } else {
      // Oryginalna logika dla pozycji magazynowych
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
                <strong>Utworzona przez:</strong> {stocktaking.createdBy ? getUserName(stocktaking.createdBy) : '-'}
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
                <TableCell>LOT/Partia</TableCell>
                <TableCell>Kategoria</TableCell>
                <TableCell align="right">Stan systemowy</TableCell>
                <TableCell align="right">Stan policzony</TableCell>
                <TableCell align="right">Różnica</TableCell>
                <TableCell align="right">Cena jedn.</TableCell>
                <TableCell align="right">Wartość różnicy</TableCell>
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
                      <TableCell>
                        {item.lotNumber || item.batchNumber || 'N/D'}
                        {item.expiryDate && (
                          <Typography variant="caption" display="block" color="textSecondary">
                            Ważne do: {new Date(item.expiryDate.seconds * 1000).toLocaleDateString('pl-PL')}
                          </Typography>
                        )}
                      </TableCell>
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
                      <TableCell align="right">
                        {item.unitPrice ? `${item.unitPrice.toFixed(2)} EUR` : '-'}
                      </TableCell>
                      <TableCell align="right">
                        {item.unitPrice 
                          ? `${((Number(countedQuantity) - item.systemQuantity) * item.unitPrice).toFixed(2)} EUR` 
                          : '-'
                        }
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
                      <TableCell>
                        {item.lotNumber || item.batchNumber || 'N/D'}
                        {item.expiryDate && (
                          <Typography variant="caption" display="block" color="textSecondary">
                            Ważne do: {new Date(item.expiryDate.seconds * 1000).toLocaleDateString('pl-PL')}
                          </Typography>
                        )}
                      </TableCell>
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
                      <TableCell align="right">
                        {item.unitPrice ? `${item.unitPrice.toFixed(2)} EUR` : '-'}
                      </TableCell>
                      <TableCell align="right">
                        {item.differenceValue !== undefined 
                          ? `${item.differenceValue.toFixed(2)} EUR`
                          : item.unitPrice && item.discrepancy
                            ? `${(item.discrepancy * item.unitPrice).toFixed(2)} EUR`
                            : '-'
                        }
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
            {/* Przełącznik trybu LOT/Pozycja magazynowa */}
            <FormControlLabel
              control={
                <Switch
                  checked={isLotMode}
                  onChange={(e) => {
                    setIsLotMode(e.target.checked);
                    // Reset stanu przy zmianie trybu
                    setSelectedBatch(null);
                    setBatches([]);
                  }}
                  color="primary"
                />
              }
              label={isLotMode ? "Tryb inwentaryzacji LOT" : "Tryb inwentaryzacji pozycji magazynowej"}
              sx={{ mb: 2 }}
            />
            
            <Autocomplete
              options={inventoryItems}
              getOptionLabel={(option) => `${option.name} (${option.quantity} ${option.unit})`}
              value={selectedItem}
              onChange={(event, newValue) => handleItemSelect(newValue)}
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
            
            {/* Pole wyboru partii, widoczne tylko dla trybu LOT */}
            {isLotMode && selectedItem && (
              <FormControl fullWidth margin="normal">
                <InputLabel id="batch-select-label">Wybierz partię (LOT)</InputLabel>
                <Select
                  labelId="batch-select-label"
                  value={selectedBatch || ''}
                  onChange={(e) => setSelectedBatch(e.target.value)}
                  displayEmpty
                  required
                  renderValue={(selected) => {
                    if (!selected) return <em>Wybierz partię</em>;
                    return `LOT: ${selected.lotNumber || selected.batchNumber} - Ilość: ${selected.quantity} ${selectedItem.unit}`;
                  }}
                  label="Wybierz partię (LOT)"
                >
                  {loadingBatches ? (
                    <MenuItem disabled>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
                        <CircularProgress size={24} sx={{ mr: 1 }} />
                        <Typography>Ładowanie partii...</Typography>
                      </Box>
                    </MenuItem>
                  ) : batches.length === 0 ? (
                    <MenuItem disabled>Brak partii dla wybranego produktu</MenuItem>
                  ) : (
                    batches.map((batch) => (
                      <MenuItem key={batch.id} value={batch}>
                        <Grid container>
                          <Grid item xs={12}>
                            <Typography variant="body1">
                              LOT: {batch.lotNumber || batch.batchNumber || 'Brak numeru'}
                            </Typography>
                          </Grid>
                          <Grid item xs={12}>
                            <Typography variant="body2" color="textSecondary">
                              Ilość: {batch.quantity} {selectedItem.unit} 
                              {batch.expiryDate && ` | Data ważności: ${new Date(batch.expiryDate).toLocaleDateString('pl-PL')}`}
                              {batch.unitPrice > 0 && ` | Cena: ${batch.unitPrice.toFixed(2)} EUR`}
                            </Typography>
                          </Grid>
                        </Grid>
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            )}
            
            {/* Wyświetl informację o cenie jednostkowej dla wybranej partii */}
            {isLotMode && selectedBatch && selectedBatch.unitPrice > 0 && (
              <Alert severity="info" sx={{ mt: 1, mb: 1 }}>
                Cena jednostkowa partii: {selectedBatch.unitPrice.toFixed(2)} EUR
              </Alert>
            )}
            
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
            
            {/* Wyświetl różnicę i jej wartość pieniężną, jeśli wybrano partię */}
            {isLotMode && selectedBatch && countedQuantity !== '' && !isNaN(countedQuantity) && (
              <Alert 
                severity={Number(countedQuantity) === selectedBatch.quantity ? "success" : Number(countedQuantity) > selectedBatch.quantity ? "info" : "warning"}
                sx={{ mt: 1, mb: 1 }}
              >
                Różnica: {Number(countedQuantity) - selectedBatch.quantity} {selectedItem?.unit}
                {selectedBatch.unitPrice > 0 && ` | Wartość różnicy: ${((Number(countedQuantity) - selectedBatch.quantity) * selectedBatch.unitPrice).toFixed(2)} EUR`}
              </Alert>
            )}
            
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
            <FormControlLabel
              control={
                <Switch
                  checked={confirmAdjustInventory}
                  onChange={(e) => setConfirmAdjustInventory(e.target.checked)}
                  color="primary"
                />
              }
              label={confirmAdjustInventory ? "Tak, dostosuj stany magazynowe" : "Nie, tylko zakończ inwentaryzację"}
            />
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