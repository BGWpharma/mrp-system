import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Container, 
  Typography, 
  Button, 
  Paper, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow,
  Box,
  TextField,
  InputAdornment,
  IconButton,
  Tooltip,
  Chip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { format } from 'date-fns';

import { getAllPriceLists, deletePriceList } from '../../../services/priceListService';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import ConfirmDialog from '../../../components/common/ConfirmDialog';
import Loader from '../../../components/common/Loader';

const PriceListsPage = () => {
  const [priceLists, setPriceLists] = useState([]);
  const [filteredPriceLists, setFilteredPriceLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [priceListToDelete, setPriceListToDelete] = useState(null);
  
  const { currentUser } = useAuth();
  const { showNotification } = useNotification();
  
  useEffect(() => {
    fetchPriceLists();
  }, []);
  
  useEffect(() => {
    filterPriceLists();
  }, [searchTerm, priceLists]);
  
  const fetchPriceLists = async () => {
    try {
      setLoading(true);
      const data = await getAllPriceLists();
      setPriceLists(data);
      setFilteredPriceLists(data);
    } catch (error) {
      console.error('Błąd podczas pobierania list cenowych:', error);
      showNotification('Błąd podczas pobierania list cenowych', 'error');
    } finally {
      setLoading(false);
    }
  };
  
  const filterPriceLists = () => {
    if (!searchTerm) {
      setFilteredPriceLists(priceLists);
      return;
    }
    
    const term = searchTerm.toLowerCase();
    const filtered = priceLists.filter(priceList => 
      priceList.name.toLowerCase().includes(term) || 
      priceList.customerName.toLowerCase().includes(term)
    );
    
    setFilteredPriceLists(filtered);
  };
  
  const handleDeleteClick = (priceList) => {
    setPriceListToDelete(priceList);
    setConfirmDialogOpen(true);
  };
  
  const handleConfirmDelete = async () => {
    if (!priceListToDelete) return;
    
    try {
      await deletePriceList(priceListToDelete.id);
      showNotification('Lista cenowa została usunięta', 'success');
      setPriceLists(prev => prev.filter(item => item.id !== priceListToDelete.id));
    } catch (error) {
      console.error('Błąd podczas usuwania listy cenowej:', error);
      showNotification('Błąd podczas usuwania listy cenowej', 'error');
    } finally {
      setConfirmDialogOpen(false);
      setPriceListToDelete(null);
    }
  };
  
  return (
    <Container maxWidth="lg">
      <Box sx={{ mt: 3, mb: 4 }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Listy cenowe klientów
        </Typography>
        
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
          <TextField
            placeholder="Szukaj listy cenowej..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            sx={{ width: '100%', maxWidth: 500 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            variant="outlined"
            size="small"
          />
          
          <Button
            component={Link}
            to="/sales/price-lists/new"
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
          >
            Nowa lista cenowa
          </Button>
        </Box>
        
        {loading ? (
          <Loader />
        ) : (
          <Paper elevation={3}>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Nazwa</TableCell>
                    <TableCell>Klient</TableCell>
                    <TableCell>Waluta</TableCell>
                    <TableCell>Ważna od</TableCell>
                    <TableCell>Ważna do</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Akcje</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPriceLists.length > 0 ? (
                    filteredPriceLists.map((priceList) => (
                      <TableRow key={priceList.id}>
                        <TableCell>{priceList.name}</TableCell>
                        <TableCell>{priceList.customerName}</TableCell>
                        <TableCell>{priceList.currency}</TableCell>
                        <TableCell>
                          {priceList.validFrom ? format(priceList.validFrom.toDate(), 'dd.MM.yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          {priceList.validTo ? format(priceList.validTo.toDate(), 'dd.MM.yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={priceList.isActive ? "Aktywna" : "Nieaktywna"} 
                            color={priceList.isActive ? "success" : "default"}
                            size="small"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <Tooltip title="Szczegóły">
                            <IconButton 
                              component={Link} 
                              to={`/sales/price-lists/${priceList.id}`}
                              size="small"
                            >
                              <VisibilityIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Edytuj">
                            <IconButton 
                              component={Link} 
                              to={`/sales/price-lists/${priceList.id}/edit`}
                              size="small"
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Usuń">
                            <IconButton 
                              color="error" 
                              size="small"
                              onClick={() => handleDeleteClick(priceList)}
                            >
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        Brak list cenowych. Kliknij "Nowa lista cenowa", aby utworzyć pierwszą.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        )}
      </Box>
      
      <ConfirmDialog
        open={confirmDialogOpen}
        title="Potwierdzenie usunięcia"
        message={`Czy na pewno chcesz usunąć listę cenową "${priceListToDelete?.name}"?`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDialogOpen(false)}
      />
    </Container>
  );
};

export default PriceListsPage; 