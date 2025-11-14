import React, { useState, useEffect } from 'react';
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
  Alert
} from '@mui/material';
import {
  Info as InfoIcon,
  LocalShipping as LocalShippingIcon,
  Warehouse as WarehouseIcon,
  Event as EventIcon,
  Euro as EuroIcon,
  Inventory as InventoryIcon
} from '@mui/icons-material';
import { getBatchReservations } from '../../services/inventory';
import { useTranslation } from '../../hooks/useTranslation';
import { Timestamp } from 'firebase/firestore';

const BatchDetailsDialog = ({ open, onClose, batch }) => {
  const { t } = useTranslation();
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);

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
    }
  }, [open, batch]);

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
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, borderTop: 1, borderColor: 'divider' }}>
        <Button onClick={onClose} variant="contained">
          Zamknij
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default BatchDetailsDialog;

