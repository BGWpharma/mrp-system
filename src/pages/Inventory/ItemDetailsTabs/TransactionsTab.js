import React, { useState, useEffect } from 'react';
import { 
  Box, 
  Typography, 
  TableContainer, 
  Table, 
  TableHead, 
  TableRow, 
  TableCell, 
  TableBody, 
  Button, 
  CircularProgress, 
  Alert,
  Paper,
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { getInventoryTransactionsPaginated } from '../../../services/inventory';
import { getUsersDisplayNames } from '../../../services/userService';

const TransactionsTab = ({ t, itemId, itemUnit, batches, formatDateTime }) => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [userNames, setUserNames] = useState({});
  const [lastVisible, setLastVisible] = useState(null);
  const [pages, setPages] = useState(new Map()); // Cache dla stron

  // Pobierz nazwy użytkowników
  const fetchUserNames = async (transactions) => {
    if (!transactions || transactions.length === 0) return;
    
    const userIds = transactions
      .filter(transaction => transaction.createdBy)
      .map(transaction => transaction.createdBy);
    
    const uniqueUserIds = [...new Set(userIds)];
    
    if (uniqueUserIds.length === 0) return;
    
    try {
      const names = await getUsersDisplayNames(uniqueUserIds);
      setUserNames(prev => ({ ...prev, ...names }));
    } catch (error) {
      console.error('Błąd podczas pobierania danych użytkowników:', error);
    }
  };

  // Pobierz transakcje dla określonej strony
  const fetchTransactions = async (targetPage = 1, size = pageSize) => {
    if (loading) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Sprawdź czy strona jest już w cache
      const cacheKey = `${targetPage}-${size}`;
      if (pages.has(cacheKey)) {
        const cachedData = pages.get(cacheKey);
        setTransactions(cachedData.transactions);
        setLastVisible(cachedData.lastVisible);
        setHasMore(cachedData.hasMore);
        return;
      }

      // Oblicz które dokumenty należy pominąć dla docelowej strony
      let cursor = null;
      if (targetPage > 1) {
        // Znajdź kursor dla poprzedniej strony
        const prevPageKey = `${targetPage - 1}-${size}`;
        if (pages.has(prevPageKey)) {
          cursor = pages.get(prevPageKey).lastVisible;
        } else {
          // Jeśli nie mamy poprzedniej strony w cache, zaczynamy od początku
          // i pobieramy wszystkie strony do docelowej
          await fetchPagesUpTo(targetPage, size);
          return;
        }
      }

      const result = await getInventoryTransactionsPaginated({
        limit: size,
        lastVisible: cursor,
        filters: [
          { field: 'itemId', operator: '==', value: itemId }
        ],
        orderBy: { field: 'createdAt', direction: 'desc' }
      });

      // Przetwórz transakcje - dodaj konwersję dat
      const processedTransactions = result.transactions.map(transaction => ({
        ...transaction,
        createdAt: transaction.createdAt?.toDate ? transaction.createdAt.toDate() : transaction.createdAt,
        transactionDate: transaction.transactionDate?.toDate ? transaction.transactionDate.toDate() : transaction.transactionDate
      }));

      // Zapisz w cache
      pages.set(cacheKey, {
        transactions: processedTransactions,
        lastVisible: result.lastVisible,
        hasMore: result.hasMore
      });

      setTransactions(processedTransactions);
      setLastVisible(result.lastVisible);
      setHasMore(result.hasMore);
      
      // Oszacuj całkowitą liczbę stron (przybliżenie)
      if (result.hasMore) {
        setTotalPages(Math.max(targetPage + 1, totalPages));
      } else {
        setTotalPages(targetPage);
      }

      // Pobierz nazwy użytkowników
      await fetchUserNames(processedTransactions);

    } catch (err) {
      console.error('Błąd podczas pobierania transakcji:', err);
      setError('Nie udało się pobrać historii transakcji');
    } finally {
      setLoading(false);
    }
  };

  // Pobierz wszystkie strony do określonej strony
  const fetchPagesUpTo = async (targetPage, size) => {
    let cursor = null;
    
    for (let i = 1; i <= targetPage; i++) {
      const cacheKey = `${i}-${size}`;
      
      if (pages.has(cacheKey)) {
        cursor = pages.get(cacheKey).lastVisible;
        continue;
      }

      const result = await getInventoryTransactionsPaginated({
        limit: size,
        lastVisible: cursor,
        filters: [
          { field: 'itemId', operator: '==', value: itemId }
        ],
        orderBy: { field: 'createdAt', direction: 'desc' }
      });

      const processedTransactions = result.transactions.map(transaction => ({
        ...transaction,
        createdAt: transaction.createdAt?.toDate ? transaction.createdAt.toDate() : transaction.createdAt,
        transactionDate: transaction.transactionDate?.toDate ? transaction.transactionDate.toDate() : transaction.transactionDate
      }));

      pages.set(cacheKey, {
        transactions: processedTransactions,
        lastVisible: result.lastVisible,
        hasMore: result.hasMore
      });

      cursor = result.lastVisible;
      
      if (!result.hasMore) {
        setTotalPages(i);
        break;
      }
    }

    // Ustaw dane dla docelowej strony
    const targetCacheKey = `${targetPage}-${size}`;
    if (pages.has(targetCacheKey)) {
      const cachedData = pages.get(targetCacheKey);
      setTransactions(cachedData.transactions);
      setLastVisible(cachedData.lastVisible);
      setHasMore(cachedData.hasMore);
      await fetchUserNames(cachedData.transactions);
    }
  };

  // Pobierz pierwszą stronę przy załadowaniu komponentu
  useEffect(() => {
    fetchTransactions(1, pageSize);
  }, [itemId]);

  // Obsługa zmiany strony
  const handlePageChange = (event, newPage) => {
    setPage(newPage);
    fetchTransactions(newPage, pageSize);
  };

  // Obsługa zmiany rozmiaru strony
  const handlePageSizeChange = (event) => {
    const newSize = event.target.value;
    setPageSize(newSize);
    setPage(1);
    setPages(new Map()); // Wyczyść cache
    fetchTransactions(1, newSize);
  };

  return (
    <>
      <Box sx={{
        p: 2,
        mb: 2,
        borderRadius: 2,
        bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
          {t('inventory.itemDetails.tabs.transactionHistory')}
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>{t('common.pageSize')}</InputLabel>
            <Select
              value={pageSize}
              label={t('common.pageSize')}
              onChange={handlePageSizeChange}
            >
              <MenuItem value={10}>10</MenuItem>
              <MenuItem value={25}>25</MenuItem>
              <MenuItem value={50}>50</MenuItem>
              <MenuItem value={100}>100</MenuItem>
            </Select>
          </FormControl>
          <Button 
            variant="outlined" 
            onClick={() => {
              setPages(new Map());
              fetchTransactions(page, pageSize);
            }}
            disabled={loading}
          >
            {t('common.refresh')}
          </Button>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {loading && transactions.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      ) : transactions.length === 0 ? (
        <Typography variant="body1" align="center">
          {t('inventory.itemDetails.noTransactionHistory')}
        </Typography>
      ) : (
        <>
          <Paper sx={{ position: 'relative' }}>
            {loading && (
              <Box sx={{ 
                position: 'absolute', 
                top: 0, 
                left: 0, 
                right: 0, 
                bottom: 0, 
                bgcolor: 'rgba(255, 255, 255, 0.7)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                zIndex: 1
              }}>
                <CircularProgress />
              </Box>
            )}
            <TableContainer>
              <Table sx={{ '& thead th': { fontWeight: 'bold', bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : '#f8f9fa' } }}>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('common.date')}</TableCell>
                    <TableCell>{t('inventory.itemDetails.quantity')}</TableCell>
                    <TableCell>{t('inventory.itemDetails.reason')}</TableCell>
                    <TableCell>{t('inventory.itemDetails.reference')}</TableCell>
                    <TableCell>{t('inventory.itemDetails.warehouse')}</TableCell>
                    <TableCell>{t('common.notes')}</TableCell>
                    <TableCell>{t('common.user')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {transactions.map((transaction) => {
                    const transactionDate = transaction.transactionDate || transaction.createdAt || null;
                    const warehouseName = transaction.warehouseName || 
                      (transaction.warehouseId ? 
                        batches.find(b => b.warehouseId === transaction.warehouseId)?.warehouseName || 
                        transaction.warehouseId : '—');
                    let notesText = transaction.notes || '—';
                    if (notesText.includes('MO:') && transaction.moNumber) {
                      notesText = notesText.replace(/MO: ([a-zA-Z0-9]+)/, `MO: ${transaction.moNumber}`);
                    }
                    
                    return (
                      <TableRow key={transaction.id}>
                        <TableCell>{transactionDate ? formatDateTime(transactionDate) : '—'}</TableCell>
                        <TableCell>{transaction.quantity} {itemUnit}</TableCell>
                        <TableCell>{transaction.reason || '—'}</TableCell>
                        <TableCell>{transaction.moNumber || transaction.reference || '—'}</TableCell>
                        <TableCell>{warehouseName}</TableCell>
                        <TableCell>{notesText}</TableCell>
                        <TableCell>{userNames[transaction.createdBy] || transaction.createdBy || '—'}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          {/* Paginacja */}
          {totalPages > 1 && (
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
              <Pagination 
                count={totalPages}
                page={page}
                onChange={handlePageChange}
                color="primary"
                showFirstButton
                showLastButton
                disabled={loading}
              />
            </Box>
          )}

          {/* Informacja o statusie */}
          <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {t('common.showing')} {transactions.length} {t('common.results')} {t('common.onPage')} {page}
            </Typography>
            {hasMore && page === totalPages && (
              <Typography variant="body2" color="text.secondary">
                {t('common.moreResultsAvailable')}
              </Typography>
            )}
          </Box>
        </>
      )}
    </>
  );
};

export default TransactionsTab;