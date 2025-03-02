import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Box,
  Button,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  AlertTitle,
  TextField,
  InputAdornment,
  IconButton,
  CircularProgress
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Warning as WarningIcon,
  Error as ErrorIcon
} from '@mui/icons-material';
import { getExpiringBatches, getExpiredBatches } from '../../services/inventoryService';
import { useNotification } from '../../hooks/useNotification';
import { Timestamp } from 'firebase/firestore';

// TabPanel component
function TabPanel(props) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`expiry-tabpanel-${index}`}
      aria-labelledby={`expiry-tab-${index}`}
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

const ExpiryDatesPage = () => {
  const navigate = useNavigate();
  const { showError } = useNotification();
  const [expiringBatches, setExpiringBatches] = useState([]);
  const [expiredBatches, setExpiredBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tabValue, setTabValue] = useState(0);
  const [daysThreshold, setDaysThreshold] = useState(30);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Pobierz partie z krótkim terminem ważności
        const expiringData = await getExpiringBatches(daysThreshold);
        setExpiringBatches(expiringData);
        
        // Pobierz przeterminowane partie
        const expiredData = await getExpiredBatches();
        setExpiredBatches(expiredData);
      } catch (error) {
        showError('Błąd podczas pobierania danych: ' + error.message);
        console.error('Error fetching expiry data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [showError, daysThreshold]);

  const handleTabChange = (event, newValue) => {
    setTabValue(newValue);
  };

  const handleDaysThresholdChange = (e) => {
    const value = parseInt(e.target.value);
    if (!isNaN(value) && value > 0) {
      setDaysThreshold(value);
    }
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const clearSearch = () => {
    setSearchTerm('');
  };

  // Filtrowanie partii według wyszukiwanego terminu
  const filterBatches = (batches) => {
    if (!searchTerm) return batches;
    
    const term = searchTerm.toLowerCase();
    return batches.filter(batch => 
      batch.itemName.toLowerCase().includes(term) || 
      (batch.batchNumber && batch.batchNumber.toLowerCase().includes(term)) ||
      (batch.notes && batch.notes.toLowerCase().includes(term))
    );
  };

  const filteredExpiringBatches = filterBatches(expiringBatches);
  const filteredExpiredBatches = filterBatches(expiredBatches);

  if (loading) {
    return (
      <Container maxWidth="lg" sx={{ mt: 4, mb: 4, display: 'flex', justifyContent: 'center' }}>
        <CircularProgress />
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
          Daty ważności produktów
        </Typography>
        <Box />
      </Box>

      {expiredBatches.length > 0 && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <AlertTitle>Przeterminowane produkty</AlertTitle>
          W magazynie znajduje się {expiredBatches.length} {expiredBatches.length === 1 ? 'przeterminowana partia' : 
            expiredBatches.length < 5 ? 'przeterminowane partie' : 'przeterminowanych partii'} produktów.
        </Alert>
      )}

      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <TextField
            label="Próg dni do wygaśnięcia"
            type="number"
            value={daysThreshold}
            onChange={handleDaysThresholdChange}
            sx={{ width: 200, mr: 2 }}
            InputProps={{
              inputProps: { min: 1 }
            }}
          />
          <Typography variant="body2" color="text.secondary">
            Pokazuje produkty wygasające w ciągu {daysThreshold} dni
          </Typography>
        </Box>
        
        <TextField
          label="Szukaj"
          value={searchTerm}
          onChange={handleSearchChange}
          sx={{ width: 300 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
            endAdornment: searchTerm && (
              <InputAdornment position="end">
                <IconButton onClick={clearSearch} edge="end">
                  <ClearIcon />
                </IconButton>
              </InputAdornment>
            )
          }}
        />
      </Box>

      <Paper sx={{ mb: 3 }}>
        <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
          <Tabs value={tabValue} onChange={handleTabChange} aria-label="expiry tabs">
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <WarningIcon sx={{ mr: 1, color: 'warning.main' }} />
                  <span>Wkrótce wygasające ({filteredExpiringBatches.length})</span>
                </Box>
              } 
              id="expiry-tab-0" 
            />
            <Tab 
              label={
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <ErrorIcon sx={{ mr: 1, color: 'error.main' }} />
                  <span>Przeterminowane ({filteredExpiredBatches.length})</span>
                </Box>
              } 
              id="expiry-tab-1" 
            />
          </Tabs>
        </Box>

        <TabPanel value={tabValue} index={0}>
          {filteredExpiringBatches.length === 0 ? (
            <Typography variant="body1">
              {searchTerm ? 'Brak wyników wyszukiwania dla produktów wkrótce wygasających.' : 'Brak produktów wkrótce wygasających.'}
            </Typography>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Produkt</TableCell>
                    <TableCell>Numer partii</TableCell>
                    <TableCell>Data ważności</TableCell>
                    <TableCell>Pozostało dni</TableCell>
                    <TableCell>Ilość</TableCell>
                    <TableCell>Akcje</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredExpiringBatches.map(batch => {
                    const expiryDate = batch.expiryDate instanceof Timestamp 
                      ? batch.expiryDate.toDate() 
                      : new Date(batch.expiryDate);
                    
                    const today = new Date();
                    const diffTime = Math.abs(expiryDate - today);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    return (
                      <TableRow key={batch.id}>
                        <TableCell>
                          <Link to={`/inventory/${batch.itemId}`} style={{ textDecoration: 'none' }}>
                            {batch.itemName}
                          </Link>
                        </TableCell>
                        <TableCell>{batch.batchNumber || '-'}</TableCell>
                        <TableCell>{expiryDate.toLocaleDateString('pl-PL')}</TableCell>
                        <TableCell>
                          <Chip 
                            label={`${diffDays} dni`} 
                            color={diffDays <= 7 ? "error" : "warning"} 
                            size="small" 
                          />
                        </TableCell>
                        <TableCell>{batch.quantity}</TableCell>
                        <TableCell>
                          <Button 
                            variant="outlined" 
                            size="small" 
                            component={Link}
                            to={`/inventory/${batch.itemId}/issue`}
                          >
                            Wydaj
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>

        <TabPanel value={tabValue} index={1}>
          {filteredExpiredBatches.length === 0 ? (
            <Typography variant="body1">
              {searchTerm ? 'Brak wyników wyszukiwania dla przeterminowanych produktów.' : 'Brak przeterminowanych produktów.'}
            </Typography>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Produkt</TableCell>
                    <TableCell>Numer partii</TableCell>
                    <TableCell>Data ważności</TableCell>
                    <TableCell>Przeterminowane o</TableCell>
                    <TableCell>Ilość</TableCell>
                    <TableCell>Akcje</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredExpiredBatches.map(batch => {
                    const expiryDate = batch.expiryDate instanceof Timestamp 
                      ? batch.expiryDate.toDate() 
                      : new Date(batch.expiryDate);
                    
                    const today = new Date();
                    const diffTime = Math.abs(today - expiryDate);
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    
                    return (
                      <TableRow key={batch.id}>
                        <TableCell>
                          <Link to={`/inventory/${batch.itemId}`} style={{ textDecoration: 'none' }}>
                            {batch.itemName}
                          </Link>
                        </TableCell>
                        <TableCell>{batch.batchNumber || '-'}</TableCell>
                        <TableCell>{expiryDate.toLocaleDateString('pl-PL')}</TableCell>
                        <TableCell>
                          <Chip 
                            label={`${diffDays} dni`} 
                            color="error" 
                            size="small" 
                          />
                        </TableCell>
                        <TableCell>{batch.quantity}</TableCell>
                        <TableCell>
                          <Button 
                            variant="outlined" 
                            size="small" 
                            component={Link}
                            to={`/inventory/${batch.itemId}/issue`}
                            color="error"
                          >
                            Utylizuj
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </TabPanel>
      </Paper>
    </Container>
  );
};

export default ExpiryDatesPage; 