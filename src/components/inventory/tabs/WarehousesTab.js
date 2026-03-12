import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, TextField, IconButton, Typography, Box,
  Tooltip, CircularProgress, Grid, Link, InputAdornment, TableSortLabel,
  TablePagination, Dialog, DialogTitle, DialogContent, DialogActions
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Search as SearchIcon, Info as InfoIcon, ViewList as ViewListIcon,
  Clear as ClearIcon
} from '@mui/icons-material';
import { formatQuantity, formatDate } from '../../../utils/formatting';
import { useTranslation } from '../../../hooks/useTranslation';

const WarehousesTab = ({
  warehouses, warehousesLoading,
  selectedWarehouseForView,
  warehouseItems, warehouseItemsLoading,
  warehouseItemsTotalCount, warehouseItemsPageSize, warehouseItemsPage,
  warehouseSearchTerm, warehouseItemsSort, warehouseSearchTermRef,
  handleOpenWarehouseDialog, handleDeleteWarehouse, handleWarehouseClick,
  handleBackToWarehouses, handleShowItemBatches,
  handleWarehouseSearchTermChange, clearWarehouseSearch,
  handleWarehousePageChange, handleWarehousePageSizeChange, handleWarehouseTableSort,
  // Batches dialog
  batchesDialogOpen, handleCloseBatchesDialog, selectedItem,
  selectedItemBatches, loadingBatches,
  // Warehouse dialog
  openWarehouseDialog, handleCloseWarehouseDialog, dialogMode,
  warehouseFormData, handleWarehouseFormChange, handleSubmitWarehouse, savingWarehouse
}) => {
  const { t } = useTranslation('inventory');

  return (
    <>
      {!selectedWarehouseForView ? (
        <>
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
            <Button variant="contained" color="primary" onClick={() => handleOpenWarehouseDialog('add')} startIcon={<AddIcon />}>
              {t('inventory.states.locations.newLocation')}
            </Button>
          </Box>
          <TableContainer component={Paper}>
            <Table sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow>
                  <TableCell>{t('inventory.states.locations.name')}</TableCell>
                  <TableCell>{t('inventory.states.locations.address')}</TableCell>
                  <TableCell>{t('inventory.states.locations.description')}</TableCell>
                  <TableCell align="right">{t('inventory.states.table.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {warehousesLoading ? (
                  <TableRow><TableCell colSpan={4} align="center"><CircularProgress /></TableCell></TableRow>
                ) : warehouses.length === 0 ? (
                  <TableRow><TableCell colSpan={4} align="center">{t('inventory.states.locations.noLocations')}</TableCell></TableRow>
                ) : (
                  warehouses.map((warehouse) => (
                    <TableRow key={warehouse.id}>
                      <TableCell>
                        <Link component="button" variant="body1" onClick={() => handleWarehouseClick(warehouse)}>
                          {warehouse.name}
                        </Link>
                      </TableCell>
                      <TableCell>{warehouse.address}</TableCell>
                      <TableCell>{warehouse.description}</TableCell>
                      <TableCell align="right">
                        <IconButton color="primary" onClick={() => handleOpenWarehouseDialog('edit', warehouse)}><EditIcon /></IconButton>
                        <IconButton color="error" onClick={() => handleDeleteWarehouse(warehouse.id)}><DeleteIcon /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      ) : (
        <>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <Button variant="outlined" onClick={handleBackToWarehouses} sx={{ mr: 2 }}>
              &larr; {t('inventory.states.locations.backToLocations')}
            </Button>
            <Typography variant="h6">
              {t('inventory.states.locations.itemsInLocation', { locationName: selectedWarehouseForView.name })}
            </Typography>
          </Box>

          <Paper sx={{ mb: 3, p: 2 }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={6} md={4}>
                <TextField
                  fullWidth variant="outlined"
                  placeholder={t('inventory.states.locations.searchItems')}
                  value={warehouseSearchTerm}
                  onChange={handleWarehouseSearchTermChange}
                  InputProps={{
                    startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
                    endAdornment: warehouseSearchTerm && (
                      <InputAdornment position="end">
                        <IconButton size="small" onClick={clearWarehouseSearch}><ClearIcon /></IconButton>
                      </InputAdornment>
                    ),
                  }}
                />
              </Grid>
              <Grid item xs={12} sm={6} md={8}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                  <Typography variant="body2" color="textSecondary">
                    {t('inventory.states.locations.foundItems', { count: warehouseItemsTotalCount })}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </Paper>

          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>
                    <TableSortLabel active={warehouseItemsSort.field === 'name'} direction={warehouseItemsSort.field === 'name' ? warehouseItemsSort.order : 'asc'} onClick={() => handleWarehouseTableSort('name')}>
                      {t('inventory.states.table.sku')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>
                    <TableSortLabel active={warehouseItemsSort.field === 'category'} direction={warehouseItemsSort.field === 'category' ? warehouseItemsSort.order : 'asc'} onClick={() => handleWarehouseTableSort('category')}>
                      {t('inventory.states.table.category')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell>{t('inventory.states.locations.unit')}</TableCell>
                  <TableCell align="right">
                    <TableSortLabel active={warehouseItemsSort.field === 'totalQuantity'} direction={warehouseItemsSort.field === 'totalQuantity' ? warehouseItemsSort.order : 'asc'} onClick={() => handleWarehouseTableSort('totalQuantity')}>
                      {t('inventory.states.locations.quantity')}
                    </TableSortLabel>
                  </TableCell>
                  <TableCell align="right">{t('inventory.states.table.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {warehouseItemsLoading ? (
                  <TableRow><TableCell colSpan={5} align="center"><CircularProgress /></TableCell></TableRow>
                ) : warehouseItems.length === 0 ? (
                  <TableRow><TableCell colSpan={5} align="center">{t('inventory.states.locations.noItemsInLocation')}</TableCell></TableRow>
                ) : (
                  warehouseItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell><Link component={RouterLink} to={`/inventory/${item.id}`}>{item.name}</Link></TableCell>
                      <TableCell>{item.category || '-'}</TableCell>
                      <TableCell>{item.unit || 'szt.'}</TableCell>
                      <TableCell align="right">{formatQuantity(item.quantity) || 0}</TableCell>
                      <TableCell align="right">
                        <Tooltip title={t('inventory.states.locations.showBatches')}>
                          <IconButton color="info" onClick={() => handleShowItemBatches(item)}><ViewListIcon /></IconButton>
                        </Tooltip>
                        <IconButton color="primary" component={RouterLink} to={`/inventory/${item.id}`}><InfoIcon /></IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <TablePagination
              rowsPerPageOptions={[5, 10, 25, 50]} component="div"
              count={warehouseItemsTotalCount} rowsPerPage={warehouseItemsPageSize}
              page={warehouseItemsPage - 1}
              onPageChange={handleWarehousePageChange} onRowsPerPageChange={handleWarehousePageSizeChange}
              labelRowsPerPage={t('inventory.states.pagination.itemsPerPage') + ':'}
              labelDisplayedRows={({ from, to, count }) => t('inventory.states.pagination.displayedRows', { from, to, count })}
            />
          </TableContainer>
        </>
      )}

      {/* Batches dialog */}
      <Dialog open={batchesDialogOpen} onClose={handleCloseBatchesDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {t('inventory.states.locations.batchesFor', { itemName: selectedItem?.name, locationName: selectedWarehouseForView?.name })}
        </DialogTitle>
        <DialogContent>
          {loadingBatches ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}><CircularProgress /></Box>
          ) : selectedItemBatches.length === 0 ? (
            <Typography variant="body1" align="center" sx={{ py: 3 }}>{t('inventory.states.locations.noBatchesFound')}</Typography>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>{t('inventory.states.locations.batchNumber')}</TableCell>
                    <TableCell>{t('inventory.states.locations.quantity')}</TableCell>
                    <TableCell>{t('inventory.states.locations.expiryDate')}</TableCell>
                    <TableCell>{t('inventory.states.locations.supplier')}</TableCell>
                    <TableCell>{t('inventory.states.locations.receivedDate')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {selectedItemBatches.map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell>{batch.batchNumber || batch.lotNumber || '-'}</TableCell>
                      <TableCell>{batch.quantity} {selectedItem?.unit || 'szt.'}</TableCell>
                      <TableCell>{batch.expiryDate ? formatDate(batch.expiryDate) : '-'}</TableCell>
                      <TableCell>{batch.purchaseOrderDetails?.supplier?.name || batch.supplier?.name || '-'}</TableCell>
                      <TableCell>{batch.receivedDate ? formatDate(batch.receivedDate) : '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseBatchesDialog}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>

      {/* Warehouse add/edit dialog */}
      <Dialog open={openWarehouseDialog} onClose={handleCloseWarehouseDialog} fullWidth>
        <DialogTitle>
          {dialogMode === 'add' ? t('inventory.states.locations.addNewLocation') : t('inventory.states.locations.editLocation')}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField name="name" label={t('inventory.states.locations.locationName')} value={warehouseFormData.name}
                onChange={handleWarehouseFormChange} fullWidth required error={!warehouseFormData.name.trim()}
                helperText={!warehouseFormData.name.trim() ? t('inventory.states.locations.nameRequired') : ''} />
            </Grid>
            <Grid item xs={12}>
              <TextField name="address" label={t('inventory.states.locations.address')} value={warehouseFormData.address}
                onChange={handleWarehouseFormChange} fullWidth />
            </Grid>
            <Grid item xs={12}>
              <TextField name="description" label={t('inventory.states.locations.description')} value={warehouseFormData.description}
                onChange={handleWarehouseFormChange} fullWidth multiline rows={3} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseWarehouseDialog}>{t('common.cancel')}</Button>
          <Button onClick={handleSubmitWarehouse} variant="contained" color="primary" disabled={savingWarehouse || !warehouseFormData.name.trim()}>
            {savingWarehouse ? t('inventory.states.locations.saving') : t('common.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default WarehousesTab;
