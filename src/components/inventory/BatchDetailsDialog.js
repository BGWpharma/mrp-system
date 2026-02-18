import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  CircularProgress,
  Divider,
  Grid,
  Alert,
  Collapse,
  Tooltip,
  IconButton
} from '@mui/material';
import {
  Info as InfoIcon,
  LocalShipping as LocalShippingIcon,
  Warehouse as WarehouseIcon,
  Event as EventIcon,
  Euro as EuroIcon,
  Inventory as InventoryIcon,
  History as HistoryIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Search as SearchIcon
} from '@mui/icons-material';
import { getBatchReservations, getBatchTransactionHistory } from '../../services/inventory';
import { useTranslation } from '../../hooks/useTranslation';
import { Timestamp } from 'firebase/firestore';

// Mapowanie typów transakcji na polskie nazwy i kolory
const TRANSACTION_TYPE_LABELS = {
  'RECEIVE': { label: 'Przyjęcie', color: 'success' },
  'ISSUE': { label: 'Wydanie', color: 'warning' },
  'booking': { label: 'Rezerwacja', color: 'primary' },
  'booking_cancel': { label: 'Anulowanie rezerwacji', color: 'default' },
  'adjustment-add': { label: 'Korekta (+)', color: 'info' },
  'adjustment-remove': { label: 'Korekta (−)', color: 'error' },
  'TRANSFER': { label: 'Transfer', color: 'secondary' },
  'DELETE_BATCH_AFTER_TRANSFER': { label: 'Usunięcie po transferze', color: 'error' },
  'DELETE_BATCH': { label: 'Usunięcie partii', color: 'error' },
  'stocktaking': { label: 'Inwentaryzacja', color: 'info' },
  'stocktaking-deletion': { label: 'Usunięcie (inwent.)', color: 'error' },
  'stocktaking-completed': { label: 'Inwentaryzacja zakończona', color: 'success' },
  'stocktaking-correction-completed': { label: 'Korekta inwent.', color: 'info' },
  'stocktaking-reopen': { label: 'Wznowienie inwent.', color: 'warning' }
};

const BatchDetailsDialog = ({ open, onClose, batch }) => {
  const { t } = useTranslation('inventory');
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [transactionHistory, setTransactionHistory] = useState([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  useEffect(() => {
    const fetchReservations = async () => {
      if (!batch || !batch.id) return;
      
      setLoading(true);
      try {
        const reservationsData = await getBatchReservations(batch.id);
        setReservations(reservationsData);
      } catch (error) {
        console.error('Błąd podczas pobierania rezerwacji partii:', error);
      } finally {
        setLoading(false);
      }
    };

    if (open && batch) {
      fetchReservations();
      // Reset historii przy otwarciu nowego dialogu
      setHistoryOpen(false);
      setTransactionHistory([]);
      setHistoryLoaded(false);
    }
  }, [open, batch]);

  const fetchTransactionHistory = useCallback(async () => {
    if (!batch || !batch.id || historyLoaded) return;
    
    setHistoryLoading(true);
    try {
      const history = await getBatchTransactionHistory(batch.id, { limit: 100 });
      setTransactionHistory(history);
      setHistoryLoaded(true);
    } catch (error) {
      console.error('Błąd podczas pobierania historii partii:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, [batch, historyLoaded]);

  const handleToggleHistory = () => {
    const newState = !historyOpen;
    setHistoryOpen(newState);
    if (newState && !historyLoaded) {
      fetchTransactionHistory();
    }
  };

  if (!batch) return null;

  const formatDate = (date) => {
    if (!date) return '—';
    
    try {
      let dateObj;
      if (date instanceof Timestamp) {
        dateObj = date.toDate();
      } else if (date instanceof Date) {
        dateObj = date;
      } else {
        dateObj = new Date(date);
      }
      
      // Sprawdź czy to nieprawidłowa data
      if (!dateObj || dateObj.getFullYear() <= 1970) {
        return '—';
      }
      
      return dateObj.toLocaleDateString('pl-PL');
    } catch (e) {
      console.error('Błąd formatowania daty:', e);
      return '—';
    }
  };

  const totalReservedQuantity = reservations.reduce((sum, res) => sum + (res.quantity || 0), 0);
  const availableQuantity = Math.max(0, (batch.quantity || 0) - totalReservedQuantity);

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { borderRadius: 2 }
      }}
    >
      <DialogTitle sx={{ 
        pb: 2, 
        borderBottom: 1, 
        borderColor: 'divider',
        display: 'flex',
        alignItems: 'center',
        gap: 1
      }}>
        <InfoIcon color="primary" />
        <Typography variant="h6" component="span">
          Szczegóły partii: {batch.batchNumber || batch.lotNumber || 'Brak numeru'}
        </Typography>
      </DialogTitle>

      <DialogContent sx={{ pt: 3 }}>
        {/* Podstawowe informacje */}
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <InventoryIcon fontSize="small" />
            Podstawowe informacje
          </Typography>
          
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Pozycja magazynowa
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                  {batch.itemName || '—'}
                </Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  <EventIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                  Data ważności
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                  {formatDate(batch.expiryDate)}
                </Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Ilość całkowita
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                  {batch.quantity} {batch.unit || 'szt.'}
                </Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  Ilość dostępna
                </Typography>
                <Typography 
                  variant="body1" 
                  sx={{ 
                    fontWeight: 'bold',
                    color: availableQuantity === 0 ? 'error.main' : 'success.main'
                  }}
                >
                  {availableQuantity.toFixed(2)} {batch.unit || 'szt.'}
                </Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  <WarehouseIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                  Magazyn
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                  {batch.warehouseName || 'Magazyn podstawowy'}
                </Typography>
              </Box>
            </Grid>
            
            <Grid item xs={12} sm={6}>
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="caption" color="text.secondary">
                  <LocalShippingIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                  Dostawca
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                  {batch.supplierName || '—'}
                </Typography>
              </Box>
            </Grid>
            
            {batch.unitPrice && (
              <Grid item xs={12} sm={6}>
                <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    <EuroIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                    Cena jednostkowa
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                    {parseFloat(batch.unitPrice).toFixed(4)} EUR
                  </Typography>
                </Box>
              </Grid>
            )}
            
            {batch.notes && (
              <Grid item xs={12}>
                <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                  <Typography variant="caption" color="text.secondary">
                    Notatki
                  </Typography>
                  <Typography variant="body2">
                    {batch.notes}
                  </Typography>
                </Box>
              </Grid>
            )}
          </Grid>
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Rezerwacje */}
        <Box>
          <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <EventIcon fontSize="small" />
            Rezerwacje ({reservations.length})
          </Typography>

          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : reservations.length === 0 ? (
            <Alert severity="info">
              Ta partia nie jest aktualnie zarezerwowana na żadne zlecenie produkcyjne ani transport.
            </Alert>
          ) : (
            <>
              <Box sx={{ mb: 2, p: 2, bgcolor: 'info.light', borderRadius: 1 }}>
                <Typography variant="body2" color="info.contrastText">
                  <strong>Całkowita zarezerwowana ilość:</strong> {totalReservedQuantity.toFixed(2)} {batch.unit || 'szt.'}
                </Typography>
              </Box>
              
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: 'background.default' }}>
                      <TableCell><strong>Nr MO / CMR</strong></TableCell>
                      <TableCell><strong>Nazwa zadania</strong></TableCell>
                      <TableCell align="right"><strong>Ilość</strong></TableCell>
                      <TableCell><strong>Status</strong></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {reservations.map((reservation, index) => (
                      <TableRow 
                        key={index}
                        sx={{ 
                          '&:hover': { bgcolor: 'action.hover' },
                          '&:last-child td, &:last-child th': { border: 0 }
                        }}
                      >
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            {reservation.taskNumber || reservation.moNumber || reservation.cmrNumber || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">
                            {reservation.taskName || '—'}
                          </Typography>
                          {reservation.clientName && (
                            <Typography variant="caption" color="text.secondary" display="block">
                              Klient: {reservation.clientName}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                            {(reservation.quantity || 0).toFixed(2)} {batch.unit || 'szt.'}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={
                              reservation.status === 'completed' ? 'Zrealizowane' :
                              reservation.status === 'cancelled' ? 'Anulowane' :
                              'Aktywne'
                            }
                            color={
                              reservation.status === 'completed' ? 'success' :
                              reservation.status === 'cancelled' ? 'default' :
                              'primary'
                            }
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Box>

        <Divider sx={{ my: 3 }} />

        {/* Historia transakcji partii - diagnostyka wirtualnego stanu */}
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <HistoryIcon fontSize="small" />
              Historia transakcji partii
            </Typography>
            <Tooltip title={historyOpen ? 'Zwiń historię' : 'Pokaż historię — sprawdź dlaczego partia jest wirtualnie na magazynie'}>
              <Button
                variant={historyOpen ? 'contained' : 'outlined'}
                color="secondary"
                size="small"
                startIcon={<SearchIcon />}
                endIcon={historyOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                onClick={handleToggleHistory}
              >
                {historyOpen ? 'Zwiń historię' : 'Zbadaj stan partii'}
              </Button>
            </Tooltip>
          </Box>

          {!historyOpen && (
            <Alert severity="info" sx={{ mt: 1 }}>
              Kliknij przycisk „Zbadaj stan partii", aby zobaczyć pełną historię transakcji i zrozumieć, 
              dlaczego partia ma aktualny stan magazynowy (rezerwacje, korekty, wydania itp.).
            </Alert>
          )}

          <Collapse in={historyOpen}>
            {historyLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
                <CircularProgress />
              </Box>
            ) : transactionHistory.length === 0 && historyLoaded ? (
              <Alert severity="warning" sx={{ mt: 2 }}>
                Brak zarejestrowanych transakcji dla tej partii. Partia mogła zostać utworzona przed wdrożeniem systemu logowania transakcji.
              </Alert>
            ) : transactionHistory.length > 0 ? (
              <>
                {/* Podsumowanie diagnostyczne */}
                <Box sx={{ mt: 2, mb: 2, p: 2, bgcolor: 'secondary.light', borderRadius: 1, opacity: 0.9 }}>
                  <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                    Podsumowanie ruchu partii:
                  </Typography>
                  <Grid container spacing={1}>
                    {(() => {
                      const summary = transactionHistory.reduce((acc, t) => {
                        const type = t.type || 'unknown';
                        if (!acc[type]) acc[type] = { count: 0, totalQty: 0 };
                        acc[type].count++;
                        acc[type].totalQty += t.quantity || 0;
                        return acc;
                      }, {});

                      return Object.entries(summary).map(([type, data]) => {
                        const typeInfo = TRANSACTION_TYPE_LABELS[type] || { label: type, color: 'default' };
                        return (
                          <Grid item xs={6} sm={4} key={type}>
                            <Chip
                              label={`${typeInfo.label}: ${data.count}x (${data.totalQty.toFixed(2)})`}
                              color={typeInfo.color}
                              size="small"
                              variant="outlined"
                              sx={{ width: '100%', justifyContent: 'flex-start' }}
                            />
                          </Grid>
                        );
                      });
                    })()}
                  </Grid>
                </Box>

                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'background.default' }}>
                        <TableCell><strong>Data</strong></TableCell>
                        <TableCell><strong>Typ operacji</strong></TableCell>
                        <TableCell align="right"><strong>Ilość</strong></TableCell>
                        <TableCell><strong>Referencja</strong></TableCell>
                        <TableCell><strong>Powód / Notatki</strong></TableCell>
                        <TableCell><strong>Użytkownik</strong></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {transactionHistory.map((transaction, index) => {
                        const typeInfo = TRANSACTION_TYPE_LABELS[transaction.type] || { label: transaction.type, color: 'default' };
                        const isNegative = ['ISSUE', 'booking', 'adjustment-remove', 'DELETE_BATCH', 'DELETE_BATCH_AFTER_TRANSFER', 'stocktaking-deletion'].includes(transaction.type);
                        
                        return (
                          <TableRow 
                            key={transaction.id || index}
                            sx={{ 
                              '&:hover': { bgcolor: 'action.hover' },
                              '&:last-child td, &:last-child th': { border: 0 },
                              bgcolor: isNegative ? 'error.50' : undefined
                            }}
                          >
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              <Typography variant="body2">
                                {formatDate(transaction.transactionDate || transaction.createdAt)}
                              </Typography>
                              {transaction.transactionDate && (
                                <Typography variant="caption" color="text.secondary">
                                  {(() => {
                                    try {
                                      const d = transaction.transactionDate instanceof Date 
                                        ? transaction.transactionDate 
                                        : new Date(transaction.transactionDate);
                                      return d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
                                    } catch { return ''; }
                                  })()}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={typeInfo.label}
                                color={typeInfo.color}
                                size="small"
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Typography 
                                variant="body2" 
                                sx={{ 
                                  fontWeight: 'bold',
                                  color: isNegative ? 'error.main' : 'success.main'
                                }}
                              >
                                {isNegative ? '−' : '+'}{(transaction.quantity || 0).toFixed(2)} {batch.unit || 'szt.'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                {transaction.taskNumber || transaction.moNumber || transaction.reference || '—'}
                              </Typography>
                              {transaction.taskName && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  {transaction.taskName}
                                </Typography>
                              )}
                              {transaction.clientName && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  Klient: {transaction.clientName}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontSize: '0.8rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {transaction.reason || transaction.notes || '—'}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="caption">
                                {transaction.createdByName || '—'}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>

                {transactionHistory.length >= 100 && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    Wyświetlono maksymalnie 100 ostatnich transakcji. Starsze wpisy mogą nie być widoczne.
                  </Alert>
                )}
              </>
            ) : null}
          </Collapse>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}>
        <Button onClick={onClose} variant="contained">
          {t('common:common.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BatchDetailsDialog;

