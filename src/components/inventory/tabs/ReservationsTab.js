import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, TextField, IconButton, Typography, Box,
  CircularProgress, Link
} from '@mui/material';
import {
  Search as SearchIcon, Edit as EditIcon, Delete as DeleteIcon,
  History as HistoryIcon, DeleteForever as DeleteForeverIcon
} from '@mui/icons-material';
import { formatDate } from '../../../utils/formatting';
import { useTranslation } from '../../../hooks/useTranslation';
import { mr1, mb3 } from '../../../styles/muiCommonStyles';

const ReservationsTab = ({
  filteredAllReservations, loadingAllReservations, moFilter,
  updatingTasks, cleaningReservations,
  handleMoFilterChange, handleUpdateReservationTasks,
  handleCleanupDeletedTaskReservations, fetchAllReservations,
  setSelectedItem, handleEditReservation, handleDeleteReservation
}) => {
  const { t } = useTranslation('inventory');

  return (
    <>
      <Box sx={mb3}>
        <Typography variant="h6" component="h2" gutterBottom>
          {t('inventory.states.reservationsTab.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          {t('inventory.states.reservationsTab.description')}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', mb: 2, gap: 2 }}>
        <TextField
          label={t('inventory.states.reservationsTab.filterByMo')}
          variant="outlined" size="small" fullWidth
          value={moFilter} onChange={handleMoFilterChange}
          InputProps={{ startAdornment: <SearchIcon color="action" sx={mr1} /> }}
        />
        <Button
          variant="contained" color="primary"
          onClick={() => { handleUpdateReservationTasks().then(() => fetchAllReservations()); }}
          disabled={updatingTasks}
          startIcon={updatingTasks ? <CircularProgress size={24} /> : <HistoryIcon />}
        >
          {t('inventory.states.reservationsTab.updateTasks')}
        </Button>
        <Button
          variant="outlined" color="secondary"
          onClick={() => { handleCleanupDeletedTaskReservations().then(() => fetchAllReservations()); }}
          disabled={cleaningReservations}
          startIcon={cleaningReservations ? <CircularProgress size={24} /> : <DeleteForeverIcon />}
        >
          {t('inventory.states.reservationsTab.removeOutdated')}
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{t('inventory.states.reservationsTab.moNumber')}</TableCell>
              <TableCell>{t('inventory.states.reservationsTab.taskName')}</TableCell>
              <TableCell>{t('inventory.states.table.sku')}</TableCell>
              <TableCell>{t('inventory.states.reservationsTab.reservedQuantity')}</TableCell>
              <TableCell>{t('inventory.states.reservationsTab.batchNumber')}</TableCell>
              <TableCell>{t('inventory.states.reservationsTab.reservationDate')}</TableCell>
              <TableCell align="right">{t('inventory.states.table.actions')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loadingAllReservations ? (
              <TableRow><TableCell colSpan={8} align="center"><CircularProgress /></TableCell></TableRow>
            ) : filteredAllReservations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  <Typography>
                    {moFilter ? t('inventory.states.reservationsTab.noFilterResults') : t('inventory.states.reservationsTab.noReservations')}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              filteredAllReservations.map((reservation) => (
                <TableRow key={reservation.id}>
                  <TableCell><Typography variant="body2">{reservation.taskNumber || t('inventory.states.reservationsTab.noMoNumber')}</Typography></TableCell>
                  <TableCell><Typography variant="body2">{reservation.taskName || '-'}</Typography></TableCell>
                  <TableCell><Link component={RouterLink} to={`/inventory/${reservation.itemId}`}>{reservation.itemName}</Link></TableCell>
                  <TableCell>{reservation.quantity}</TableCell>
                  <TableCell>{reservation.batchNumber || '-'}</TableCell>
                  <TableCell>{reservation.createdAtDate ? formatDate(reservation.createdAtDate) : '-'}</TableCell>
                  <TableCell align="right">
                    <IconButton color="primary" onClick={() => {
                      setSelectedItem({ id: reservation.itemId, name: reservation.itemName });
                      handleEditReservation(reservation);
                    }}>
                      <EditIcon />
                    </IconButton>
                    <IconButton color="error" onClick={() => handleDeleteReservation(reservation.id)}>
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
};

export default ReservationsTab;
