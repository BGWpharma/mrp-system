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
  Tabs
} from '@mui/material';
import {
  Edit as EditIcon,
  ArrowBack as ArrowBackIcon,
  ArrowUpward as ReceiveIcon,
  ArrowDownward as IssueIcon,
  History as HistoryIcon
} from '@mui/icons-material';
import { getInventoryItemById, getItemTransactions } from '../../services/inventoryService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';

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
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);

  useEffect(() => {
    const fetchItemData = async () => {
      try {
        setLoading(true);
        const itemData = await getInventoryItemById(id);
        setItem(itemData);
        
        // Pobierz historię transakcji
        const transactionsData = await getItemTransactions(id);
        setTransactions(transactionsData);
      } catch (error) {
        showError('Błąd podczas pobierania danych pozycji: ' + error.message);
        console.error('Error fetching item details:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchItemData();
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
            variant="contained" 
            color="primary" 
            component={Link}
            to={`/inventory/${id}/edit`}
            startIcon={<EditIcon />}
            sx={{ mr: 1 }}
          >
            Edytuj
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

        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="item tabs">
            <Tab label="Szczegółowe informacje" id="item-tab-0" />
            <Tab label="Historia transakcji" id="item-tab-1" />
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
    </Container>
  );
};

export default ItemDetailsPage;