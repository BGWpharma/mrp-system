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
import { getInventoryItemById, getItemTransactions, getItemBatches } from '../../services/inventoryService';
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
        >
          Powrót
        </Button>
        <Typography variant="h5">
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
            variant="outlined" 
            component={Link} 
            to={`/inventory/${id}/receive`}
            startIcon={<AddIcon />}
          >
            Przyjmij dostawę
          </Button>
        </Box>
      </Box>

      <Paper sx={{ mb: 3 }}>
        <Box sx={{ p: 3 }}>
          <Typography variant="h4" gutterBottom>
            {item.name}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Chip 
              label={item.category || 'Brak kategorii'} 
              color="primary" 
              sx={{ mr: 2 }}
            />
            {getStockLevelIndicator(item.quantity, item.minStock, item.maxStock)}
          </Box>
          {item.description && (
            <Typography variant="body1" paragraph>
              {item.description}
            </Typography>
          )}
          <Grid container spacing={3}>
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle2" color="text.secondary">
                Stan magazynowy
              </Typography>
              <Typography variant="h6">
                {item.quantity} {item.unit}
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle2" color="text.secondary">
                Lokalizacja
              </Typography>
              <Typography variant="h6">
                {item.location || 'Nie określono'}
              </Typography>
            </Grid>
            <Grid item xs={12} md={4}>
              <Typography variant="subtitle2" color="text.secondary">
                Ostatnia aktualizacja
              </Typography>
              <Typography variant="h6">
                {formatDate(item.updatedAt)}
              </Typography>
            </Grid>
          </Grid>
        </Box>

        <Box sx={{ display: 'flex', p: 2, bgcolor: 'background.default' }}>
          <Button 
            variant="contained" 
            color="success" 
            startIcon={<ReceiveIcon />}
            component={Link}
            to={`/inventory/${id}/receive`}
            sx={{ mr: 2 }}
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
          >
            Wydaj
          </Button>
        </Box>

        {expiredBatches.length > 0 && (
          <Alert severity="error" sx={{ mb: 3 }}>
            <AlertTitle>Przeterminowane partie</AlertTitle>
            W magazynie znajduje się {expiredBatches.length} {expiredBatches.length === 1 ? 'przeterminowana partia' : 
              expiredBatches.length < 5 ? 'przeterminowane partie' : 'przeterminowanych partii'} tego produktu.
            Łącznie {expiredBatches.reduce((sum, batch) => sum + batch.quantity, 0)} {item?.unit}.
          </Alert>
        )}
        
        {expiringBatches.length > 0 && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            <AlertTitle>Partie z krótkim terminem ważności</AlertTitle>
            W magazynie znajduje się {expiringBatches.length} {expiringBatches.length === 1 ? 'partia' : 
              expiringBatches.length < 5 ? 'partie' : 'partii'} tego produktu z terminem ważności krótszym niż 30 dni.
            Łącznie {expiringBatches.reduce((sum, batch) => sum + batch.quantity, 0)} {item?.unit}.
          </Alert>
        )}

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="item tabs">
            <Tab label="Szczegółowe informacje" id="item-tab-0" />
            <Tab label="Partie i daty ważności" id="item-tab-1" />
            <Tab label="Historia transakcji" id="item-tab-2" />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Parametry magazynowe</Typography>
              <TableContainer>
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell component="th">Minimalny stan</TableCell>
                      <TableCell>{item.minStock ? `${item.minStock} ${item.unit}` : 'Nie określono'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th">Maksymalny stan</TableCell>
                      <TableCell>{item.maxStock ? `${item.maxStock} ${item.unit}` : 'Nie określono'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th">Dostawca</TableCell>
                      <TableCell>{item.supplierInfo || 'Nie określono'}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
            
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>Notatki</Typography>
              <Typography variant="body1" paragraph style={{ whiteSpace: 'pre-line' }}>
                {item.notes || 'Brak notatek'}
              </Typography>
            </Grid>
          </Grid>
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          <Typography variant="h6" gutterBottom>Partie i daty ważności</Typography>
          
          {batches.length === 0 ? (
            <Typography variant="body1">Brak zarejestrowanych partii dla tego produktu.</Typography>
          ) : (
            <TableContainer component={Paper} sx={{ mt: 2 }}>
              <Table>
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
                        <TableRow key={batch.id}>
                          <TableCell>{batch.batchNumber || '-'}</TableCell>
                          <TableCell>
                            {expiryDate.toLocaleDateString('pl-PL')}
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
                          </TableCell>
                          <TableCell>
                            {batch.quantity} {item.unit}
                            {batch.quantity === 0 && (
                              <Chip 
                                size="small" 
                                label="Wydane" 
                                color="default" 
                                sx={{ ml: 1 }} 
                              />
                            )}
                          </TableCell>
                          <TableCell>
                            {status === 'expired' ? (
                              <Chip label="Przeterminowane" color="error" />
                            ) : status === 'expiring' ? (
                              <Chip label="Wkrótce wygaśnie" color="warning" />
                            ) : batch.quantity <= 0 ? (
                              <Chip label="Wydane" color="default" />
                            ) : (
                              <Chip label="Aktualne" color="success" />
                            )}
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