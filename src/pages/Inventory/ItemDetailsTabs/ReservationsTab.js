import React from 'react';
import { Box, Typography, Paper, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, IconButton, Chip, Button, Alert, CircularProgress, FormControl, InputLabel, Select, MenuItem } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import DeleteIcon from '@mui/icons-material/Delete';
import SortIcon from '@mui/icons-material/SortByAlpha';

const ReservationsTab = ({
  t,
  updatingReservations,
  reservationFilter,
  handleFilterChange,
  handleSort,
  filteredReservations,
  itemUnit,
  handleDeleteReservation,
  fetchReservations,
  item,
  handleCleanupDeletedTaskReservations,
}) => {
  return (
    <>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, borderRadius: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'white' }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold' }}>{t('inventory.itemDetails.productReservations')}</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <Button 
            startIcon={updatingReservations ? <CircularProgress size={20} /> : <RefreshIcon />} 
            onClick={() => fetchReservations(item)}
            variant="outlined"
            disabled={updatingReservations}
            sx={{ mr: 2 }}
          >
            {t('common.refresh')}
          </Button>
          <Button 
            startIcon={updatingReservations ? <CircularProgress size={20} /> : <DeleteIcon />} 
            onClick={handleCleanupDeletedTaskReservations}
            variant="outlined"
            color="warning"
            disabled={updatingReservations}
            sx={{ mr: 2 }}
          >
            {updatingReservations ? t('inventory.itemDetails.cleaning') : t('inventory.itemDetails.removeDeletedReservations')}
          </Button>
          <FormControl variant="outlined" size="small" sx={{ minWidth: 150, mr: 2 }}>
            <InputLabel id="reservation-filter-label">{t('common.filter')}</InputLabel>
            <Select
              labelId="reservation-filter-label"
              value={reservationFilter}
              onChange={handleFilterChange}
              label={t('common.filter')}
            >
              <MenuItem value="all">{t('common.all')}</MenuItem>
              <MenuItem value="active">{t('inventory.itemDetails.activeOnly')}</MenuItem>
              <MenuItem value="fulfilled">{t('inventory.itemDetails.completedOnly')}</MenuItem>
            </Select>
          </FormControl>
        </Box>
      </Box>

      {filteredReservations.length === 0 ? (
        <Alert severity="info">{t('inventory.itemDetails.noReservations')}</Alert>
      ) : (
        <TableContainer component={Paper} elevation={0} variant="outlined">
          <Table sx={{ '& thead th': { fontWeight: 'bold', bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : '#f8f9fa' } }}>
            <TableHead>
              <TableRow>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {t('inventory.itemDetails.reservationDate')}
                    <IconButton size="small" onClick={() => handleSort('createdAt')}>
                      <SortIcon />
                    </IconButton>
                  </Box>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {t('inventory.itemDetails.quantity')}
                    <IconButton size="small" onClick={() => handleSort('quantity')}>
                      <SortIcon />
                    </IconButton>
                  </Box>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {t('inventory.itemDetails.productionTask')}
                    <IconButton size="small" onClick={() => handleSort('taskNumber')}>
                      <SortIcon />
                    </IconButton>
                  </Box>
                </TableCell>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    {t('inventory.itemDetails.moNumber')}
                    <IconButton size="small" onClick={() => handleSort('moNumber')}>
                      <SortIcon />
                    </IconButton>
                  </Box>
                </TableCell>
                <TableCell>{t('inventory.itemDetails.batch')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell align="right">{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredReservations.map((reservation) => {
                const createdDate = reservation.createdAt?.seconds ? 
                  reservation.createdAt.toDate() : 
                  new Date(reservation.createdAt);
                
                return (
                  <TableRow key={reservation.taskId} hover>
                    <TableCell>
                      {createdDate.toLocaleDateString('pl-PL')}
                    </TableCell>
                    <TableCell>
                      <Typography fontWeight="bold">
                        {reservation.totalQuantity} {itemUnit}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {reservation.taskName || '—'}
                    </TableCell>
                    <TableCell>
                      {reservation.moNumber || '—'}
                    </TableCell>
                    <TableCell>
                      {reservation.batches?.map((batch, batchIndex) => (
                        <Box key={batchIndex} sx={{ mb: 1 }}>
                          {batch.batchNumber}
                        </Box>
                      )) || '—'}
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={reservation.status === 'completed' ? t('inventory.itemDetails.completed') : t('inventory.itemDetails.active')} 
                        color={reservation.status === 'completed' ? 'default' : 'secondary'} 
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Box>
                        <IconButton 
                          size="small" 
                          color="error" 
                          onClick={() => handleDeleteReservation(reservation.taskId)}
                          aria-label={t('inventory.itemDetails.deleteReservation')}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
};

export default ReservationsTab;

