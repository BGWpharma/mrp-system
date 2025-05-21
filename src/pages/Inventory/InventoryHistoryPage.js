import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  Container,
  Paper,
  Typography,
  Button,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import { ArrowBack as ArrowBackIcon } from '@mui/icons-material';
import { getInventoryItemById, getItemTransactions } from '../../services/inventoryService';
import { useNotification } from '../../hooks/useNotification';
import { formatDate } from '../../utils/formatters';

const InventoryHistoryPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showError } = useNotification();
  const [item, setItem] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const itemData = await getInventoryItemById(id);
        setItem(itemData);
        
        const transactionsData = await getItemTransactions(id);
        setTransactions(transactionsData);
      } catch (error) {
        showError('Błąd podczas pobierania danych: ' + error.message);
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [id, showError]);

  if (loading) {
    return <div>Ładowanie danych...</div>;
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
          onClick={() => navigate(-1)}
        >
          Powrót
        </Button>
        <Typography variant="h5">
          Historia transakcji: {item.name}
        </Typography>
        <div></div> {/* Pusty element dla wyrównania */}
      </Box>

      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>Informacje o pozycji</Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mb: 3 }}>
          <Typography><strong>Nazwa:</strong> {item.name}</Typography>
          <Typography><strong>Kategoria:</strong> {item.category || 'Brak kategorii'}</Typography>
          <Typography><strong>Aktualny stan:</strong> {item.quantity} {item.unit}</Typography>
          <Typography><strong>Lokalizacja:</strong> {item.location || 'Nie określono'}</Typography>
        </Box>
      </Paper>

      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>Historia transakcji</Typography>
        
        {transactions.length === 0 ? (
          <Typography>Brak transakcji dla tej pozycji</Typography>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Data</TableCell>
                  <TableCell>Typ</TableCell>
                  <TableCell>Ilość</TableCell>
                  <TableCell>Stan po</TableCell>
                  <TableCell>Dokument</TableCell>
                  <TableCell>Uwagi</TableCell>
                  <TableCell>Użytkownik</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell>{formatDate(transaction.timestamp)}</TableCell>
                    <TableCell>
                      {transaction.type === 'receive' ? 'Przyjęcie' : 'Wydanie'}
                    </TableCell>
                    <TableCell>
                      {transaction.type === 'receive' ? '+' : '-'}{transaction.quantity} {item.unit}
                    </TableCell>
                    <TableCell>{transaction.balanceAfter} {item.unit}</TableCell>
                    <TableCell>{transaction.documentNumber || '—'}</TableCell>
                    <TableCell>{transaction.notes || '—'}</TableCell>
                    <TableCell>{transaction.createdByName || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Container>
  );
};

export default InventoryHistoryPage; 