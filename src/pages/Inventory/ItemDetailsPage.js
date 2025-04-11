// src/pages/Inventory/ItemDetailsPage.js
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tab,
  Tabs,
  Alert,
  AlertTitle
} from '@mui/material';
import {
  Edit as EditIcon,
  ArrowBack as ArrowBackIcon,
  ArrowUpward as ReceiveIcon,
  ArrowDownward as IssueIcon,
  History as HistoryIcon,
  Warning as WarningIcon,
  ViewList as ViewListIcon,
  Add as AddIcon,
  QrCode as QrCodeIcon
} from '@mui/icons-material';
import { getInventoryItemById, getItemTransactions, getItemBatches, getSupplierPrices } from '../../services/inventoryService';
import { getAllSuppliers } from '../../services/supplierService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';
import { Timestamp } from 'firebase/firestore';
import LabelDialog from '../../components/inventory/LabelDialog';

// TabPanel component
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`item-tabpanel-${index}`}
      aria-labelledby={`item-tab-${index}`}
      {...other}
    >
      {value === index && (
        <Box sx={{ p: 3 }}>
          {children}
        </Box>
      )}
    </div>
  );
}

const ItemDetailsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showError } = useNotification();
  const [item, setItem] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [batches, setBatches] = useState([]);
  const [supplierPrices, setSupplierPrices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);

  useEffect(() => {
    const fetchItemData = async () => {
      try {
        setLoading(true);
        const itemData = await getInventoryItemById(id);
        setItem(itemData);
        
        // Pobierz historię transakcji
        const transactionsData = await getItemTransactions(id);
        setTransactions(transactionsData);
        
        // Pobierz partie
        const batchesData = await getItemBatches(id);
        setBatches(batchesData);

        // Pobierz ceny dostawców
        const supplierPricesData = await getSupplierPrices(id);
        if (supplierPricesData && supplierPricesData.length > 0) {
          const suppliersList = await getAllSuppliers();
          const pricesWithDetails = supplierPricesData.map(price => {
            const supplier = suppliersList.find(s => s.id === price.supplierId);
            return {
              ...price,
              supplierName: supplier ? supplier.name : 'Nieznany dostawca'
            };
          });
          setSupplierPrices(pricesWithDetails);
        }
      } catch (error) {
        showError('Błąd podczas pobierania danych pozycji: ' + error.message);
        console.error('Error fetching item details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchItemData();
    
    // Dodaj nasłuchiwanie na zdarzenie aktualizacji magazynu
    const handleInventoryUpdate = (event) => {
      // Sprawdź, czy aktualizacja dotyczy tego produktu
      if (event.detail && event.detail.itemId === id) {
        console.log('Wykryto aktualizację produktu, odświeżam dane...');
        fetchItemData();
      }
    };
    
    window.addEventListener('inventory-updated', handleInventoryUpdate);
    
    // Usuń nasłuchiwanie przy odmontowaniu komponentu
    return () => {
      window.removeEventListener('inventory-updated', handleInventoryUpdate);
    };
  }, [id, showError]);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const getStockLevelIndicator = (quantity, minStock, maxStock) => {
    if (quantity <= 0) {
      return <Chip label="Brak" color="error" />;
    } else if (minStock && quantity <= minStock) {
      return <Chip label="Niski stan" color="warning" />;
    } else if (maxStock && quantity >= maxStock) {
      return <Chip label="Wysoki stan" color="info" />;
    } else {
      return <Chip label="Optymalny stan" color="success" />;
    }
  };

  // Sprawdź, czy są partie z krótkim terminem ważności (30 dni)
  const getExpiringBatches = () => {
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);
    
    return batches.filter(batch => {
      if (batch.quantity <= 0) return false;
      
      const expiryDate = batch.expiryDate instanceof Timestamp 
        ? batch.expiryDate.toDate() 
        : new Date(batch.expiryDate);
      
      return expiryDate > today && expiryDate <= thirtyDaysFromNow;
    });
  };
  
  // Sprawdź, czy są przeterminowane partie
  const getExpiredBatches = () => {
    const today = new Date();
    
    return batches.filter(batch => {
      if (batch.quantity <= 0) return false;
      
      const expiryDate = batch.expiryDate instanceof Timestamp 
        ? batch.expiryDate.toDate() 
        : new Date(batch.expiryDate);
      
      return expiryDate < today;
    });
  };
  
  const expiringBatches = getExpiringBatches();
  const expiredBatches = getExpiredBatches();

  // Funkcja otwierająca dialog etykiet
  const handleOpenLabelDialog = () => {
    setLabelDialogOpen(true);
  };
  
  // Funkcja zamykająca dialog etykiet
  const handleCloseLabelDialog = () => {
    setLabelDialogOpen(false);
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
          onClick={() => navigate('/inventory')}
          variant="outlined"
        >
          Powrót
        </Button>
        <Typography variant="h5" fontWeight="bold">
          Szczegóły pozycji magazynowej
        </Typography>
        <Box>
          <Button 
            variant="outlined" 
            component={Link} 
            to={`/inventory/${id}/edit`}
            startIcon={<EditIcon />}
            sx={{ mr: 1 }}
          >
            Edytuj
          </Button>
          <Button 
            variant="outlined" 
            component={Link} 
            to={`/inventory/${id}/batches`}
            startIcon={<ViewListIcon />}
            sx={{ mr: 1 }}
          >
            Zarządzaj partiami
          </Button>
          <Button 
            variant="outlined"
            onClick={handleOpenLabelDialog}
            startIcon={<QrCodeIcon />}
            sx={{ mr: 1 }}
          >
            Drukuj etykietę
          </Button>
          <Button 
            variant="contained" 
            color="primary"
            component={Link} 
            to={`/inventory/${id}/receive`}
            startIcon={<AddIcon />}
          >
            Przyjmij dostawę
          </Button>
        </Box>
      </Box>

      {/* Sekcja głównych informacji */}
      <Paper elevation={3} sx={{ mb: 3, overflow: 'hidden', borderRadius: 2 }}>
        <Box sx={{ p: 3, bgcolor: '#f8f9fa' }}>
          <Typography variant="h4" gutterBottom fontWeight="bold">
            {item.name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Chip 
              label={item.category || 'Brak kategorii'} 
              color="primary" 
              sx={{ mr: 2, fontWeight: 'medium' }}
            />
            {getStockLevelIndicator(item.quantity, item.minStock, item.maxStock)}
          </Box>
          {item.description && (
            <Paper sx={{ p: 2, mb: 2, bgcolor: 'white', borderRadius: 1 }}>
              <Typography variant="body1">
              {item.description}
            </Typography>
            </Paper>
          )}
        </Box>
        
        {/* Statystyki produktu */}
        <Box sx={{ 
          p: 3, 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: 4, 
          justifyContent: 'space-between', 
          borderTop: '1px solid #e0e0e0',
          bgcolor: 'white'
        }}>
          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            minWidth: '150px'
          }}>
            <Typography variant="h6" fontWeight="bold" color="primary">
              {item.quantity}
            </Typography>
            <Typography variant="subtitle1">
              {item.unit}
            </Typography>
            <Typography variant="body2" color="text.secondary">
                Stan magazynowy
              </Typography>
          </Box>

          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            minWidth: '150px'
          }}>
            <Typography variant="h6" fontWeight="bold">
              {item.location || 'Nie określono'}
              </Typography>
            <Typography variant="body2" color="text.secondary">
                Lokalizacja
              </Typography>
          </Box>

          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            minWidth: '150px'
          }}>
            <Typography variant="h6" fontWeight="bold">
              {item.minStock || 'Nie określono'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Min. ilość
            </Typography>
          </Box>

          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            minWidth: '150px'
          }}>
            <Typography variant="h6" fontWeight="bold">
              {item.maxStock || 'Nie określono'}
              </Typography>
            <Typography variant="body2" color="text.secondary">
              Maks. ilość
              </Typography>
          </Box>

          <Box sx={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center',
            minWidth: '150px'
          }}>
            <Typography variant="h6" fontWeight="bold">
                {formatDate(item.updatedAt)}
              </Typography>
            <Typography variant="body2" color="text.secondary">
              Ostatnia aktualizacja
            </Typography>
          </Box>
        </Box>

        {/* Przyciski akcji */}
        <Box sx={{ 
          display: 'flex', 
          p: 2, 
          borderTop: '1px solid #e0e0e0',
          bgcolor: '#f8f9fa'
        }}>
          <Button 
            variant="contained" 
            color="success" 
            startIcon={<ReceiveIcon />}
            component={Link}
            to={`/inventory/${id}/receive`}
            sx={{ mr: 2, borderRadius: 4, px: 3 }}
          >
            Przyjmij
          </Button>
          <Button 
            variant="contained" 
            color="warning" 
            startIcon={<IssueIcon />}
            component={Link}
            to={`/inventory/${id}/issue`}
            disabled={item.quantity <= 0}
            sx={{ borderRadius: 4, px: 3 }}
          >
            Wydaj
          </Button>
        </Box>
      </Paper>

      {/* Alerty */}
        {expiredBatches.length > 0 && (
        <Paper elevation={3} sx={{ mb: 3, overflow: 'hidden', borderRadius: 2 }}>
          <Alert severity="error" sx={{ borderRadius: 0 }}>
            <AlertTitle><strong>Przeterminowane partie</strong></AlertTitle>
            <Typography>
              W magazynie znajduje się <strong>{expiredBatches.length}</strong> {expiredBatches.length === 1 ? 'przeterminowana partia' : 
              expiredBatches.length < 5 ? 'przeterminowane partie' : 'przeterminowanych partii'} tego produktu.
              Łącznie <strong>{expiredBatches.reduce((sum, batch) => sum + batch.quantity, 0)} {item?.unit}</strong>.
            </Typography>
          </Alert>
        </Paper>
        )}
        
        {expiringBatches.length > 0 && (
        <Paper elevation={3} sx={{ mb: 3, overflow: 'hidden', borderRadius: 2 }}>
          <Alert severity="warning" sx={{ borderRadius: 0 }}>
            <AlertTitle><strong>Partie z krótkim terminem ważności</strong></AlertTitle>
            <Typography>
              W magazynie znajduje się <strong>{expiringBatches.length}</strong> {expiringBatches.length === 1 ? 'partia' : 
              expiringBatches.length < 5 ? 'partie' : 'partii'} tego produktu z terminem ważności krótszym niż 30 dni.
              Łącznie <strong>{expiringBatches.reduce((sum, batch) => sum + batch.quantity, 0)} {item?.unit}</strong>.
            </Typography>
          </Alert>
        </Paper>
      )}

      {/* Główne zakładki */}
      <Paper elevation={3} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: '#f8f9fa' }}>
          <Tabs 
            value={tabValue} 
            onChange={handleTabChange} 
            aria-label="item tabs"
            variant="fullWidth"
            textColor="primary"
            indicatorColor="primary"
          >
            <Tab label="Szczegółowe informacje" id="item-tab-0" sx={{ fontWeight: 'medium', py: 2 }} />
            <Tab label="Partie i daty ważności" id="item-tab-1" sx={{ fontWeight: 'medium', py: 2 }} />
            <Tab label="Historia transakcji" id="item-tab-2" sx={{ fontWeight: 'medium', py: 2 }} />
          </Tabs>
        </Box>

        {/* Zawartość zakładki Szczegółowe informacje */}
        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Paper elevation={1} sx={{ p: 2, mb: 3, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid #e0e0e0', pb: 1, fontWeight: 'bold' }}>
                  Parametry magazynowe
                </Typography>
              <TableContainer>
                  <Table sx={{ '& td, & th': { borderBottom: '1px solid #f5f5f5', py: 1.5 } }}>
                  <TableBody>
                    <TableRow>
                        <TableCell component="th" sx={{ width: '40%', fontWeight: 'medium' }}>Minimalny stan</TableCell>
                      <TableCell>{item.minStock ? `${item.minStock} ${item.unit}` : 'Nie określono'}</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>Maksymalny stan</TableCell>
                      <TableCell>{item.maxStock ? `${item.maxStock} ${item.unit}` : 'Nie określono'}</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>Ilość kartonów na paletę</TableCell>
                      <TableCell>{item.boxesPerPallet ? `${item.boxesPerPallet} szt.` : 'Nie określono'}</TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell component="th" sx={{ fontWeight: 'medium' }}>Ilość produktu per karton</TableCell>
                      <TableCell>{item.itemsPerBox ? `${item.itemsPerBox} ${item.unit}` : 'Nie określono'}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
              </Paper>

              {supplierPrices.length > 0 && (
                <Paper elevation={1} sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid #e0e0e0', pb: 1, fontWeight: 'bold' }}>
                    Dostawcy i ceny
                  </Typography>
                  <TableContainer>
                    <Table size="small" sx={{ '& th': { fontWeight: 'bold', bgcolor: '#f8f9fa' } }}>
                      <TableHead>
                        <TableRow>
                          <TableCell>Dostawca</TableCell>
                          <TableCell align="right">Cena</TableCell>
                          <TableCell align="right">Min. ilość</TableCell>
                          <TableCell align="right">Czas dostawy</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {supplierPrices.map(price => (
                          <TableRow key={price.id} hover>
                            <TableCell sx={{ fontWeight: price.isDefault ? 'bold' : 'normal' }}>
                              {price.isDefault && <Chip size="small" label="Domyślny" color="primary" variant="outlined" sx={{ mr: 1, height: 20 }} />}
                              {price.supplierName}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'medium' }}>
                              {price.price.toFixed(2)} {price.currency || item.currency || 'EUR'}
                            </TableCell>
                            <TableCell align="right">{price.minQuantity || 1} {item.unit}</TableCell>
                            <TableCell align="right">{price.leadTime || 7} dni</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              )}
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Paper elevation={1} sx={{ p: 2, borderRadius: 2 }}>
                <Typography variant="h6" gutterBottom sx={{ borderBottom: '1px solid #e0e0e0', pb: 1, fontWeight: 'bold' }}>
                  Notatki
                </Typography>
                <Box sx={{ p: 2, bgcolor: '#fafafa', borderRadius: 1, minHeight: '200px' }}>
                  <Typography variant="body1" style={{ whiteSpace: 'pre-line' }}>
                {item.notes || 'Brak notatek'}
              </Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </TabPanel>

        {/* Zawartość zakładki Partie */}
        <TabPanel value={tabValue} index={1}>
          <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
            Partie i daty ważności
          </Typography>
          
          {batches.length === 0 ? (
            <Paper elevation={1} sx={{ p: 3, borderRadius: 2, textAlign: 'center', bgcolor: '#f8f9fa' }}>
            <Typography variant="body1">Brak zarejestrowanych partii dla tego produktu.</Typography>
            </Paper>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 2, borderRadius: 2, overflow: 'hidden', elevation: 1 }}>
              <Table sx={{ '& th': { fontWeight: 'bold', bgcolor: '#f8f9fa' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Numer partii</TableCell>
                    <TableCell>Data ważności</TableCell>
                    <TableCell>Ilość</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Data przyjęcia</TableCell>
                    <TableCell>Notatki</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {batches
                    .sort((a, b) => {
                      const dateA = a.expiryDate instanceof Timestamp ? a.expiryDate.toDate() : new Date(a.expiryDate);
                      const dateB = b.expiryDate instanceof Timestamp ? b.expiryDate.toDate() : new Date(b.expiryDate);
                      return dateA - dateB;
                    })
                    .map(batch => {
                      const expiryDate = batch.expiryDate instanceof Timestamp 
                        ? batch.expiryDate.toDate() 
                        : new Date(batch.expiryDate);
                      
                      const receivedDate = batch.receivedDate instanceof Timestamp 
                        ? batch.receivedDate.toDate() 
                        : new Date(batch.receivedDate);
                      
                      const today = new Date();
                      const thirtyDaysFromNow = new Date();
                      thirtyDaysFromNow.setDate(today.getDate() + 30);
                      
                      let status = 'valid';
                      if (expiryDate < today) {
                        status = 'expired';
                      } else if (expiryDate <= thirtyDaysFromNow) {
                        status = 'expiring';
                      }
                      
                      return (
                        <TableRow 
                          key={batch.id} 
                          hover
                          sx={{
                            bgcolor: status === 'expired' ? 'rgba(255, 0, 0, 0.05)' : 
                                    status === 'expiring' ? 'rgba(255, 152, 0, 0.05)' : 
                                    'inherit'
                          }}
                        >
                          <TableCell sx={{ fontWeight: 'medium' }}>{batch.batchNumber || '-'}</TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <Typography sx={{ fontWeight: 'medium' }}>
                            {expiryDate.toLocaleDateString('pl-PL')}
                              </Typography>
                            {status === 'expired' && (
                              <Chip 
                                size="small" 
                                label="Przeterminowane" 
                                color="error" 
                                sx={{ ml: 1 }} 
                              />
                            )}
                            {status === 'expiring' && (
                              <Chip 
                                size="small" 
                                label="Wkrótce wygaśnie" 
                                color="warning" 
                                sx={{ ml: 1 }} 
                              />
                            )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                              <Typography sx={{ fontWeight: 'medium' }}>
                            {batch.quantity} {item.unit}
                              </Typography>
                            {batch.quantity === 0 && (
                              <Chip 
                                size="small" 
                                label="Wydane" 
                                color="default" 
                                sx={{ ml: 1 }} 
                              />
                            )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            {status === 'expired' && 'Przeterminowane'}
                            {status === 'expiring' && 'Kończy się termin'}
                            {status === 'valid' && batch.quantity > 0 && 'Dostępne'}
                            {batch.quantity <= 0 && 'Wydane'}
                          </TableCell>
                          <TableCell>{receivedDate.toLocaleDateString('pl-PL')}</TableCell>
                          <TableCell>{batch.notes || '-'}</TableCell>
                        </TableRow>
                      );
                    })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={2}>
          <Typography variant="h6" gutterBottom>Historia transakcji</Typography>
          
          {transactions.length === 0 ? (
            <Typography variant="body1" align="center">
              Brak historii transakcji dla tej pozycji
            </Typography>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Data</TableCell>
                    <TableCell>Typ</TableCell>
                    <TableCell>Ilość</TableCell>
                    <TableCell>Powód</TableCell>
                    <TableCell>Referencja</TableCell>
                    <TableCell>Notatki</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell>{formatDate(transaction.transactionDate)}</TableCell>
                      <TableCell>
                        <Chip 
                          label={transaction.type === 'RECEIVE' ? 'Przyjęcie' : 'Wydanie'} 
                          color={transaction.type === 'RECEIVE' ? 'success' : 'warning'} 
                          size="small" 
                        />
                      </TableCell>
                      <TableCell>{transaction.quantity} {item.unit}</TableCell>
                      <TableCell>{transaction.reason || '—'}</TableCell>
                      <TableCell>{transaction.reference || '—'}</TableCell>
                      <TableCell>{transaction.notes || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>
      </Paper>

      {/* Dialog etykiet */}
      <LabelDialog
        open={labelDialogOpen}
        onClose={handleCloseLabelDialog}
        item={item}
        batches={batches}
      />
    </Container>
  );
};

export default ItemDetailsPage;