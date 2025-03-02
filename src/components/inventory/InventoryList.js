// src/components/inventory/InventoryList.js
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Paper, 
  Button, 
  TextField, 
  IconButton,
  Typography,
  Box,
  Chip,
  Tooltip,
  Badge
} from '@mui/material';
import { 
  Add as AddIcon, 
  Search as SearchIcon, 
  Edit as EditIcon,
  Delete as DeleteIcon,
  ArrowUpward as ReceiveIcon,
  ArrowDownward as IssueIcon,
  History as HistoryIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { getAllInventoryItems, deleteInventoryItem, getExpiringBatches, getExpiredBatches } from '../../services/inventoryService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';

const InventoryList = () => {
  const [inventoryItems, setInventoryItems] = useState([]);
  const [filteredItems, setFilteredItems] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [expiringCount, setExpiringCount] = useState(0);
  const [expiredCount, setExpiredCount] = useState(0);
  const { showSuccess, showError } = useNotification();

  // Pobierz wszystkie pozycje przy montowaniu komponentu
  useEffect(() => {
    fetchInventoryItems();
    fetchExpiryData();
  }, []);

  // Filtruj pozycje przy zmianie searchTerm lub inventoryItems
  useEffect(() => {
    if (searchTerm.trim() === '') {
      setFilteredItems(inventoryItems);
    } else {
      const filtered = inventoryItems.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.category?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredItems(filtered);
    }
  }, [searchTerm, inventoryItems]);

  const fetchInventoryItems = async () => {
    try {
      setLoading(true);
      const fetchedItems = await getAllInventoryItems();
      setInventoryItems(fetchedItems);
      setFilteredItems(fetchedItems);
    } catch (error) {
      showError('Błąd podczas pobierania pozycji magazynowych: ' + error.message);
      console.error('Error fetching inventory items:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchExpiryData = async () => {
    try {
      const expiringBatches = await getExpiringBatches();
      const expiredBatches = await getExpiredBatches();
      
      setExpiringCount(expiringBatches.length);
      setExpiredCount(expiredBatches.length);
    } catch (error) {
      console.error('Error fetching expiry data:', error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Czy na pewno chcesz usunąć tę pozycję magazynową?')) {
      try {
        await deleteInventoryItem(id);
        showSuccess('Pozycja została usunięta');
        // Odśwież listę pozycji
        fetchInventoryItems();
      } catch (error) {
        showError('Błąd podczas usuwania pozycji: ' + error.message);
        console.error('Error deleting inventory item:', error);
      }
    }
  };

  const getStockLevelIndicator = (quantity, minStock, maxStock) => {
    if (quantity <= 0) {
      return <Chip label="Brak" color="error" size="small" />;
    } else if (minStock && quantity <= minStock) {
      return <Chip label="Niski" color="warning" size="small" />;
    } else if (maxStock && quantity >= maxStock) {
      return <Chip label="Wysoki" color="info" size="small" />;
    } else {
      return <Chip label="OK" color="success" size="small" />;
    }
  };

  if (loading) {
    return <div>Ładowanie pozycji magazynowych...</div>;
  }

  return (
    <div>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h5">Magazyn</Typography>
        <Box>
          <Tooltip title="Sprawdź daty ważności produktów">
            <Button 
              variant="outlined" 
              color="warning" 
              component={Link} 
              to="/inventory/expiry-dates"
              startIcon={
                <Badge badgeContent={expiringCount + expiredCount} color="error" max={99}>
                  <WarningIcon />
                </Badge>
              }
              sx={{ mr: 2 }}
            >
              Daty ważności
            </Button>
          </Tooltip>
          <Button 
            variant="contained" 
            color="primary" 
            component={Link} 
            to="/inventory/new"
            startIcon={<AddIcon />}
          >
            Nowa pozycja
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: 'flex', mb: 3 }}>
        <TextField
          label="Szukaj pozycji"
          variant="outlined"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          fullWidth
          InputProps={{
            startAdornment: <SearchIcon color="action" sx={{ mr: 1 }} />,
          }}
        />
      </Box>

      {filteredItems.length === 0 ? (
        <Typography variant="body1" align="center">
          Nie znaleziono pozycji magazynowych
        </Typography>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Nazwa</TableCell>
                <TableCell>Kategoria</TableCell>
                <TableCell>Ilość</TableCell>
                <TableCell>Jednostka</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Ostatnia aktualizacja</TableCell>
                <TableCell align="right">Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell component="th" scope="row">
                    <Link to={`/inventory/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                      {item.name}
                    </Link>
                  </TableCell>
                  <TableCell>{item.category || '—'}</TableCell>
                  <TableCell align="right">{item.quantity}</TableCell>
                  <TableCell>{item.unit}</TableCell>
                  <TableCell>
                    {getStockLevelIndicator(item.quantity, item.minStock, item.maxStock)}
                  </TableCell>
                  <TableCell>
                    {formatDate(item.updatedAt)}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton 
                      component={Link} 
                      to={`/inventory/${item.id}/receive`}
                      color="success"
                      title="Przyjmij"
                    >
                      <ReceiveIcon />
                    </IconButton>
                    <IconButton 
                      component={Link} 
                      to={`/inventory/${item.id}/issue`}
                      color="warning"
                      title="Wydaj"
                    >
                      <IssueIcon />
                    </IconButton>
                    <IconButton 
                      component={Link} 
                      to={`/inventory/${item.id}/history`}
                      color="info"
                      title="Historia"
                    >
                      <HistoryIcon />
                    </IconButton>
                    <IconButton 
                      component={Link} 
                      to={`/inventory/${item.id}/edit`}
                      color="primary"
                      title="Edytuj"
                    >
                      <EditIcon />
                    </IconButton>
                    <IconButton 
                      onClick={() => handleDelete(item.id)} 
                      color="error"
                      title="Usuń"
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
};

export default InventoryList;