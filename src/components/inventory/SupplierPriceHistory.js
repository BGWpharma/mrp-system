import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Tooltip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button
} from '@mui/material';
import {
  History as HistoryIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { getSupplierPriceHistory } from '../../services/inventory';
import { useNotification } from '../../hooks/useNotification';
import { formatCurrency } from '../../utils/formatters';
import { formatTimestamp } from '../../utils/dateUtils';
import { getUserById } from '../../services/userService';

/**
 * Komponent do wyświetlania historii zmian cen dostawcy
 */
const SupplierPriceHistory = ({ priceId, supplierId, itemId, currency = 'EUR' }) => {
  const { showError } = useNotification();
  
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [userNames, setUserNames] = useState({});
  
  useEffect(() => {
    if (dialogOpen && priceId) {
      fetchPriceHistory();
    }
  }, [dialogOpen, priceId]);
  
  // Pobieranie historii cen
  const fetchPriceHistory = async () => {
    try {
      setLoading(true);
      const data = await getSupplierPriceHistory(priceId);
      setHistory(data);
      
      // Pobierz dane użytkowników, którzy dokonali zmian
      const userIds = [...new Set(data.map(item => item.changedBy).filter(Boolean))];
      const userData = {};
      
      for (const userId of userIds) {
        try {
          const userDetails = await getUserById(userId);
          userData[userId] = userDetails ? 
            userDetails.displayName || userDetails.email || userId
            : userId;
        } catch (error) {
          console.error(`Błąd podczas pobierania danych użytkownika ${userId}:`, error);
          userData[userId] = userId;
        }
      }
      
      setUserNames(userData);
    } catch (error) {
      console.error('Błąd podczas pobierania historii cen:', error);
      showError('Nie udało się pobrać historii zmian cen');
    } finally {
      setLoading(false);
    }
  };
  
  // Obsługa otwierania dialogu historii
  const handleOpenDialog = () => {
    setDialogOpen(true);
  };
  
  // Obsługa zamykania dialogu
  const handleCloseDialog = () => {
    setDialogOpen(false);
  };
  
  // Formatowanie danych użytkownika
  const formatUserName = (userId) => {
    if (!userId) return 'Nieznany użytkownik';
    return userNames[userId] || userId;
  };
  
  return (
    <>
      <Tooltip title="Historia cen">
        <IconButton 
          size="small" 
          color="primary" 
          onClick={handleOpenDialog}
          aria-label="Historia cen"
        >
          <HistoryIcon />
        </IconButton>
      </Tooltip>
      
      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">Historia zmian cen dostawcy</Typography>
            <IconButton onClick={handleCloseDialog} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        
        <DialogContent dividers>
          {loading ? (
            <Box display="flex" justifyContent="center" my={3}>
              <CircularProgress />
            </Box>
          ) : history.length === 0 ? (
            <Typography align="center" my={2}>
              Brak historii zmian cen dla tego dostawcy
            </Typography>
          ) : (
            <TableContainer component={Paper}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Data zmiany</TableCell>
                    <TableCell>Stara cena</TableCell>
                    <TableCell>Nowa cena</TableCell>
                    <TableCell>Różnica</TableCell>
                    <TableCell>Zmiana %</TableCell>
                    <TableCell>Zmodyfikowano przez</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {history.map((item) => {
                    const diff = item.newPrice - item.oldPrice;
                    const percentChange = item.oldPrice !== 0 
                      ? ((diff / item.oldPrice) * 100).toFixed(2) 
                      : 'N/A';
                    
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{formatTimestamp(item.createdAt)}</TableCell>
                        <TableCell>{formatCurrency(item.oldPrice, item.currency || currency)}</TableCell>
                        <TableCell>{formatCurrency(item.newPrice, item.currency || currency)}</TableCell>
                        <TableCell style={{ 
                          color: diff > 0 ? 'red' : diff < 0 ? 'green' : 'inherit' 
                        }}>
                          {diff > 0 ? '+' : ''}{formatCurrency(diff, item.currency || currency)}
                        </TableCell>
                        <TableCell style={{ 
                          color: diff > 0 ? 'red' : diff < 0 ? 'green' : 'inherit' 
                        }}>
                          {percentChange !== 'N/A' ? (
                            <>
                              {diff > 0 ? '+' : ''}{percentChange}%
                            </>
                          ) : 'N/A'}
                        </TableCell>
                        <TableCell>{formatUserName(item.changedBy)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        
        <DialogActions>
          <Button onClick={handleCloseDialog} color="primary">
            Zamknij
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

SupplierPriceHistory.propTypes = {
  priceId: PropTypes.string.isRequired,
  supplierId: PropTypes.string,
  itemId: PropTypes.string,
  currency: PropTypes.string
};

export default SupplierPriceHistory; 