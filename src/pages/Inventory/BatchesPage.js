import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Grid,
  Button,
  Box,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Alert,
  AlertTitle,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormHelperText
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Warning as WarningIcon,
  Info as InfoIcon,
  Edit as EditIcon,
  SwapHoriz as SwapHorizIcon,
  QrCode as QrCodeIcon,
  Print as PrintIcon
} from '@mui/icons-material';
import { getInventoryItemById, getItemBatches, getAllWarehouses, transferBatch } from '../../services/inventoryService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import LabelDialog from '../../components/inventory/LabelDialog';

const BatchesPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showError, showSuccess } = useNotification();
  const { user } = useAuth();
  const [item, setItem] = useState(null);
  const [batches, setBatches] = useState([]);
  const [filteredBatches, setFilteredBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [targetWarehouseId, setTargetWarehouseId] = useState('');
  const [transferQuantity, setTransferQuantity] = useState('');
  const [transferErrors, setTransferErrors] = useState({});
  const [processingTransfer, setProcessingTransfer] = useState(false);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [selectedBatchForLabel, setSelectedBatchForLabel] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const itemData = await getInventoryItemById(id);
        setItem(itemData);
        
        const batchesData = await getItemBatches(id);
        setBatches(batchesData);
        setFilteredBatches(batchesData);
        
        const warehousesData = await getAllWarehouses();
        setWarehouses(warehousesData);
      } catch (error) {
        showError('Błąd podczas pobierania danych partii: ' + error.message);
        console.error('Error fetching batch data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, showError]);

  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredBatches(batches);
    } else {
      const filtered = batches.filter(batch => 
        (batch.batchNumber && batch.batchNumber.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (batch.notes && batch.notes.toLowerCase().includes(searchTerm.toLowerCase()))
      );
      setFilteredBatches(filtered);
    }
  }, [searchTerm, batches]);

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setPage(0);
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const getBatchStatus = (batch) => {
    if (batch.quantity <= 0) {
      return { label: 'Wyczerpana', color: 'default' };
    }

    const today = new Date();
    const expiryDate = batch.expiryDate instanceof Timestamp 
      ? batch.expiryDate.toDate() 
      : new Date(batch.expiryDate);
    
    if (expiryDate < today) {
      return { label: 'Przeterminowana', color: 'error' };
    }
    
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);
    
    if (expiryDate <= thirtyDaysFromNow) {
      return { label: 'Wygasa wkrótce', color: 'warning' };
    }
    
    return { label: 'Aktualna', color: 'success' };
  };

  const getExpiryWarning = () => {
    const expiredCount = filteredBatches.filter(batch => {
      if (batch.quantity <= 0) return false;
      
      const expiryDate = batch.expiryDate instanceof Timestamp 
        ? batch.expiryDate.toDate() 
        : new Date(batch.expiryDate);
      
      return expiryDate < new Date();
    }).length;
    
    const expiringCount = filteredBatches.filter(batch => {
      if (batch.quantity <= 0) return false;
      
      const today = new Date();
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(today.getDate() + 30);
      
      const expiryDate = batch.expiryDate instanceof Timestamp 
        ? batch.expiryDate.toDate() 
        : new Date(batch.expiryDate);
      
      return expiryDate >= today && expiryDate <= thirtyDaysFromNow;
    }).length;
    
    if (expiredCount > 0) {
      return (
        <Alert severity="error" sx={{ mb: 3 }}>
          <AlertTitle>Uwaga!</AlertTitle>
          Wykryto {expiredCount} {expiredCount === 1 ? 'przeterminowaną partię' : 
            expiredCount < 5 ? 'przeterminowane partie' : 'przeterminowanych partii'}
        </Alert>
      );
    } else if (expiringCount > 0) {
      return (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <AlertTitle>Uwaga!</AlertTitle>
          Wykryto {expiringCount} {expiringCount === 1 ? 'partię wygasającą' : 
            expiringCount < 5 ? 'partie wygasające' : 'partii wygasających'} w ciągu 30 dni
        </Alert>
      );
    }
    
    return null;
  };

  const openTransferDialog = (batch) => {
    console.log('Otwieranie dialogu dla partii:', batch);
    setSelectedBatch(batch);
    setTransferQuantity(batch.quantity.toString());
    setTargetWarehouseId('');
    setTransferErrors({});
    setTransferDialogOpen(true);
  };

  const closeTransferDialog = () => {
    setTransferDialogOpen(false);
    setSelectedBatch(null);
  };

  const validateTransferForm = () => {
    const errors = {};
    
    if (!targetWarehouseId) {
      errors.targetWarehouseId = 'Wybierz magazyn docelowy';
    }
    
    // Pobierz sourceWarehouseId z partii - musi być zdefiniowany
    const sourceWarehouseId = selectedBatch.warehouseId;
    
    if (!sourceWarehouseId) {
      errors.general = 'Nie można określić magazynu źródłowego. Odśwież stronę.';
    } else if (sourceWarehouseId === targetWarehouseId) {
      errors.targetWarehouseId = 'Magazyn docelowy musi być inny niż bieżący';
    }
    
    if (!transferQuantity) {
      errors.transferQuantity = 'Podaj ilość do przeniesienia';
    } else {
      const qty = parseFloat(transferQuantity);
      if (isNaN(qty) || qty <= 0) {
        errors.transferQuantity = 'Podaj prawidłową ilość większą od zera';
      } else if (qty > selectedBatch.quantity) {
        errors.transferQuantity = `Maksymalna dostępna ilość to ${selectedBatch.quantity}`;
      }
    }
    
    setTransferErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleTransferBatch = async () => {
    if (!validateTransferForm()) return;
    
    try {
      setProcessingTransfer(true);
      
      // Partie zawsze mają warehouseId w nowym modelu danych
      const sourceWarehouseId = selectedBatch.warehouseId;
      
      if (!sourceWarehouseId) {
        throw new Error('Nie można określić magazynu źródłowego. Spróbuj odświeżyć stronę.');
      }
      
      await transferBatch(
        selectedBatch.id,
        sourceWarehouseId,
        targetWarehouseId,
        transferQuantity,
        {
          userId: user?.uid || 'unknown',
          notes: `Przeniesienie partii ${selectedBatch.batchNumber || selectedBatch.lotNumber || 'bez numeru'}`
        }
      );
      
      showSuccess('Partia została przeniesiona pomyślnie');
      closeTransferDialog();
      
      const batchesData = await getItemBatches(id);
      setBatches(batchesData);
      setFilteredBatches(batchesData);
    } catch (error) {
      console.error('Error transferring batch:', error);
      showError(error.message);
    } finally {
      setProcessingTransfer(false);
    }
  };

  const handleOpenItemLabelDialog = () => {
    setSelectedBatchForLabel(null);
    setLabelDialogOpen(true);
  };

  const handleOpenBatchLabelDialog = (batch) => {
    setSelectedBatchForLabel(batch);
    setLabelDialogOpen(true);
  };

  const handleCloseLabelDialog = () => {
    setLabelDialogOpen(false);
    setTimeout(() => {
      setSelectedBatchForLabel(null);
    }, 300);
  };

  if (loading) {
    return <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>Ładowanie danych...</Container>;
  }

  if (!item) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
        <Typography variant="h5">Pozycja nie została znaleziona</Typography>
        <Button 
          variant="contained" 
          component={Link} 
          to="/inventory"
          startIcon={<ArrowBackIcon />}
          sx={{ mt: 2 }}
        >
          Powrót do magazynu
        </Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate(`/inventory/${id}`)}
        >
          Powrót do szczegółów
        </Button>
        <Typography variant="h5">
          Partie: {item.name}
        </Typography>
        <Box>
          <Button 
            variant="outlined"
            color="secondary" 
            startIcon={<QrCodeIcon />}
            onClick={handleOpenItemLabelDialog}
            sx={{ mr: 2 }}
          >
            Drukuj etykietę
          </Button>
          <Button 
            variant="contained" 
            color="primary" 
            component={Link}
            to={`/inventory/${id}/receive`}
          >
            Przyjmij nową partię
          </Button>
        </Box>
      </Box>

      {getExpiryWarning()}

      <Paper sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={6} md={4}>
            <TextField
              fullWidth
              variant="outlined"
              placeholder="Szukaj partii..."
              value={searchTerm}
              onChange={handleSearchChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: searchTerm && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={clearSearch}>
                      <ClearIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={8}>
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <Typography variant="body2" sx={{ mr: 2 }}>
                <strong>Stan całkowity:</strong> {item.quantity} {item.unit}
              </Typography>
              <Tooltip title="Partie są wydawane według zasady FEFO (First Expiry, First Out)">
                <IconButton size="small">
                  <InfoIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Grid>
        </Grid>
      </Paper>

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Numer partii</TableCell>
                <TableCell>Numer LOT</TableCell>
                <TableCell>Data przyjęcia</TableCell>
                <TableCell>Data ważności</TableCell>
                <TableCell>Magazyn</TableCell>
                <TableCell>Ilość początkowa</TableCell>
                <TableCell>Ilość aktualna</TableCell>
                <TableCell>Cena jedn.</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Notatki</TableCell>
                <TableCell>Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredBatches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center">
                    Brak partii do wyświetlenia
                  </TableCell>
                </TableRow>
              ) : (
                filteredBatches
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((batch) => {
                    const status = getBatchStatus(batch);
                    return (
                      <TableRow key={batch.id}>
                        <TableCell>{batch.batchNumber || '-'}</TableCell>
                        <TableCell>{batch.lotNumber || '-'}</TableCell>
                        <TableCell>
                          {formatDate(batch.receivedDate)}
                        </TableCell>
                        <TableCell>
                          {formatDate(batch.expiryDate)}
                        </TableCell>
                        <TableCell>
                          {batch.warehouseName || 'Magazyn podstawowy'}
                        </TableCell>
                        <TableCell>
                          {batch.initialQuantity} {item.unit}
                        </TableCell>
                        <TableCell>
                          {batch.quantity} {item.unit}
                        </TableCell>
                        <TableCell>
                          {batch.unitPrice ? `${batch.unitPrice.toFixed(2)} zł` : '-'}
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={status.label} 
                            color={status.color} 
                            size="small"
                            icon={status.color === 'error' || status.color === 'warning' ? <WarningIcon /> : null}
                          />
                        </TableCell>
                        <TableCell>{batch.notes || '-'}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex' }}>
                            <Tooltip title="Edytuj partię">
                              <IconButton 
                                size="small" 
                                color="primary"
                                onClick={() => navigate(`/inventory/${id}/batches/${batch.id}/edit`)}
                              >
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Drukuj etykietę">
                              <IconButton 
                                size="small" 
                                color="secondary"
                                onClick={() => handleOpenBatchLabelDialog(batch)}
                              >
                                <QrCodeIcon />
                              </IconButton>
                            </Tooltip>
                            {batch.quantity > 0 && (
                              <Tooltip title="Przenieś do innego magazynu">
                                <IconButton 
                                  size="small" 
                                  color="secondary"
                                  onClick={() => openTransferDialog(batch)}
                                >
                                  <SwapHorizIcon />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          rowsPerPageOptions={[5, 10, 25]}
          component="div"
          count={filteredBatches.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          labelRowsPerPage="Wierszy na stronę:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} z ${count}`}
        />
      </Paper>

      <Dialog open={transferDialogOpen} onClose={closeTransferDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          Przenieś partię do innego magazynu
        </DialogTitle>
        <DialogContent>
          {selectedBatch && (
            <Box sx={{ pt: 1 }}>
              <Typography variant="subtitle1" gutterBottom>
                Informacje o partii:
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Numer partii/LOT:</strong> {selectedBatch.batchNumber || selectedBatch.lotNumber || '-'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Bieżący magazyn:</strong> {selectedBatch.warehouseName || 'Magazyn podstawowy'}
              </Typography>
              <Typography variant="body2" gutterBottom>
                <strong>Dostępna ilość:</strong> {selectedBatch.quantity} {item?.unit || 'szt.'}
              </Typography>
              
              <Box sx={{ mt: 3, mb: 2 }}>
                <Grid container spacing={2}>
                  <Grid item xs={12}>
                    <FormControl fullWidth error={!!transferErrors.targetWarehouseId}>
                      <InputLabel>Magazyn docelowy</InputLabel>
                      <Select
                        value={targetWarehouseId}
                        onChange={(e) => setTargetWarehouseId(e.target.value)}
                        label="Magazyn docelowy"
                      >
                        {warehouses
                          .filter(wh => wh.id !== selectedBatch.warehouseId)
                          .map(warehouse => (
                            <MenuItem key={warehouse.id} value={warehouse.id}>
                              {warehouse.name}
                            </MenuItem>
                          ))
                        }
                      </Select>
                      {transferErrors.targetWarehouseId && (
                        <FormHelperText>{transferErrors.targetWarehouseId}</FormHelperText>
                      )}
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Ilość do przeniesienia"
                      type="number"
                      value={transferQuantity}
                      onChange={(e) => setTransferQuantity(e.target.value)}
                      inputProps={{ min: 0, max: selectedBatch.quantity, step: 'any' }}
                      error={!!transferErrors.transferQuantity}
                      helperText={transferErrors.transferQuantity || ''}
                    />
                  </Grid>
                </Grid>
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={closeTransferDialog} disabled={processingTransfer}>
            Anuluj
          </Button>
          <Button 
            variant="contained" 
            color="primary" 
            onClick={handleTransferBatch}
            disabled={processingTransfer}
          >
            {processingTransfer ? 'Przetwarzanie...' : 'Przenieś partię'}
          </Button>
        </DialogActions>
      </Dialog>

      <LabelDialog
        open={labelDialogOpen}
        onClose={handleCloseLabelDialog}
        item={item}
        batches={selectedBatchForLabel ? [selectedBatchForLabel] : batches}
      />
    </Container>
  );
};

export default BatchesPage; 