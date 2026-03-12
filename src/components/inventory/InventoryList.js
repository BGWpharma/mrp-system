// src/components/inventory/InventoryList.js
import React, { useState, lazy, Suspense } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Paper, Button, TextField, IconButton, Typography, Box, Chip,
  Tooltip, Badge, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, FormControl, InputLabel, Select, MenuItem,
  Link, Tab, Tabs, Menu, ListItemIcon, ListItemText, Checkbox,
  Pagination, Fade, Grow
} from '@mui/material';
import {
  Add as AddIcon, Search as SearchIcon, Edit as EditIcon,
  Delete as DeleteIcon, ArrowUpward as ReceiveIcon,
  ArrowDownward as IssueIcon, History as HistoryIcon,
  Warning as WarningIcon, Info as InfoIcon,
  ViewList as ViewListIcon, BookmarkAdded as ReservationIcon,
  Warehouse as WarehouseIcon, QrCode as QrCodeIcon,
  MoreVert as MoreVertIcon, DeleteForever as DeleteForeverIcon,
  ViewColumn as ViewColumnIcon, ArrowDropUp as ArrowDropUpIcon,
  TableChart as CsvIcon, Refresh as RefreshIcon,
  Upload as UploadIcon, Layers as LayersIcon,
  Calculate as CalculateIcon, Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon
} from '@mui/icons-material';
import ArchiveFilterChip from '../common/ArchiveFilterChip';
import { useColumnPreferences } from '../../contexts/ColumnPreferencesContext';
import { INVENTORY_CATEGORIES } from '../../utils/constants';
import { recalculateAllInventoryQuantities } from '../../services/inventory';
import { formatDate } from '../../utils/formatting';
import EditReservationDialog from './EditReservationDialog';
import ConfirmDialog from '../common/ConfirmDialog';
import EmptyState from '../common/EmptyState';
import TableSkeleton from '../common/TableSkeleton';
import { flexCenter, flexBetween, mr1, mb3 } from '../../styles/muiCommonStyles';

import { useInventoryData } from '../../hooks/inventory/useInventoryData';
import { useInventoryWarehouses } from '../../hooks/inventory/useInventoryWarehouses';
import { useInventoryReservations } from '../../hooks/inventory/useInventoryReservations';
import { useInventoryExport } from '../../hooks/inventory/useInventoryExport';
import { useInventoryImport } from '../../hooks/inventory/useInventoryImport';
import { useInventoryLabels } from '../../hooks/inventory/useInventoryLabels';

const LabelDialog = lazy(() => import('./LabelDialog'));
const WarehousesTab = lazy(() => import('./tabs/WarehousesTab'));
const ReservationsTab = lazy(() => import('./tabs/ReservationsTab'));
const ExpiryDatesPage = lazy(() => import('../../pages/Inventory/ExpiryDatesPage'));
const SuppliersPage = lazy(() => import('../../pages/Suppliers/SuppliersPage'));
const StocktakingPage = lazy(() => import('../../pages/Inventory/StocktakingPage'));

const TabFallback = () => (
  <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>
);

const InventoryList = () => {
  const data = useInventoryData();
  const {
    loading, setLoading, confirmDialog, setConfirmDialog,
    showArchived, setShowArchived, expiringCount, expiredCount,
    totalItems, totalPages, mainTableLoading, showContent,
    selectedItem, setSelectedItem, anchorEl,
    displayedItems, customerNameMap, customers, customerFilter, setCustomerFilter,
    debouncedSearchTerm, debouncedSearchCategory,
    searchTerm, searchCategory, selectedWarehouse, currentTab,
    page, pageSize, tableSort, listActions,
    fetchInventoryItems, handleDelete, handleTableSort,
    handlePageChange, handlePageSizeChange,
    handleSearchTermChange, handleSearchCategoryChange,
    handleSearch, handleRefreshList,
    handleMenuOpen, handleMenuClose, handleRecalculateItemQuantity,
    showSuccess, showError, t
  } = data;

  const warehouseHook = useInventoryWarehouses({ setConfirmDialog });
  const reservationHook = useInventoryReservations({ setConfirmDialog, setLoading });
  const labelHook = useInventoryLabels({ fetchInventoryItems });

  const exportHook = useInventoryExport({
    selectedWarehouse, tableSort, debouncedSearchTerm, debouncedSearchCategory,
    setMainTableLoading: (v) => { /* handled internally */ },
    warehouses: warehouseHook.warehouses
  });

  const importHook = useInventoryImport({ fetchInventoryItems, tableSort });

  const { getColumnPreferencesForView, updateColumnPreferences } = useColumnPreferences();
  const visibleColumns = getColumnPreferencesForView('inventory');
  const [columnMenuAnchor, setColumnMenuAnchor] = useState(null);
  const [menuAnchorEl, setMenuAnchorEl] = useState(null);

  const handleTabChange = (event, newValue) => { listActions.setCurrentTab(newValue); };

  const handleColumnMenuOpen = (event) => { setColumnMenuAnchor(event.currentTarget); };
  const handleColumnMenuClose = () => { setColumnMenuAnchor(null); };
  const toggleColumnVisibility = (col) => { updateColumnPreferences('inventory', col, !visibleColumns[col]); };

  const handleMoreMenuOpen = (event) => { setMenuAnchorEl(event.currentTarget); };
  const handleMoreMenuClose = () => { setMenuAnchorEl(null); };

  const handleRecalculateAllQuantities = async () => {
    setConfirmDialog({
      open: true,
      title: 'Potwierdzenie',
      message: 'Czy na pewno chcesz przeliczać ilości wszystkich pozycji magazynowych na podstawie partii? To może zająć kilka minut dla dużych baz danych.',
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }));
        try {
          setLoading(true);
          const results = await recalculateAllInventoryQuantities();
          const changedItems = results.items.filter(item => !item.error && item.difference !== 0);
          showSuccess(`Przeliczono ilości dla ${results.success} pozycji. Zaktualizowano ${changedItems.length} pozycji. Błędy: ${results.failed}`);
          await fetchInventoryItems(tableSort.field, tableSort.order);
        } catch (error) {
          showError(`Nie udało się przeliczać ilości: ${error.message}`);
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleMenuItemClick = (action) => {
    handleMoreMenuClose();
    switch (action) {
      case 'csv': exportHook.openExportCategoryDialog(); break;
      case 'batches': exportHook.generateBatchesExportCSV(); break;
      case 'import': importHook.handleOpenImportDialog(); break;
      case 'refresh': handleRefreshList(); break;
      case 'recalculate': handleRecalculateAllQuantities(); break;
      default: break;
    }
  };

  const getStockLevelIndicator = (quantity, minStock, maxStock) => {
    if (quantity <= 0) return <Chip label="Brak" color="error" size="small" />;
    if (minStock && quantity <= minStock) return <Chip label="Niski" color="warning" size="small" />;
    if (maxStock && quantity >= maxStock) return <Chip label="Wysoki" color="info" size="small" />;
    return <Chip label="OK" color="success" size="small" />;
  };

  return (
    <div>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 2, sm: 0 } }}>
        <Typography variant="h5">{t('inventory.states.title')}</Typography>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, width: { xs: '100%', sm: 'auto' } }}>
          <Box sx={{ display: 'flex', gap: 1, width: '100%' }}>
            <Tooltip title={t('inventory.states.moreOptions')}>
              <Button variant="outlined" color="primary" onClick={handleMoreMenuOpen} startIcon={<MoreVertIcon />} sx={{ flex: 1 }} disabled={mainTableLoading}>
                {t('inventory.states.more')}
              </Button>
            </Tooltip>
            <Button variant="contained" color="primary" component={RouterLink} to="/inventory/new" startIcon={<AddIcon />} sx={{ flex: 1 }}>
              {t('inventory.states.newItem')}
            </Button>
          </Box>
        </Box>

        <Menu anchorEl={menuAnchorEl} open={Boolean(menuAnchorEl)} onClose={handleMoreMenuClose} PaperProps={{ elevation: 3, sx: { mt: 1 } }}>
          <MenuItem onClick={() => handleMenuItemClick('refresh')}><ListItemIcon><RefreshIcon fontSize="small" /></ListItemIcon><ListItemText>Odśwież listę</ListItemText></MenuItem>
          <MenuItem onClick={() => handleMenuItemClick('csv')}><ListItemIcon><CsvIcon fontSize="small" /></ListItemIcon><ListItemText>{t('inventory.states.csvReport')}</ListItemText></MenuItem>
          <MenuItem onClick={() => handleMenuItemClick('batches')}><ListItemIcon><LayersIcon fontSize="small" /></ListItemIcon><ListItemText>Export partii CSV</ListItemText></MenuItem>
          <MenuItem onClick={() => handleMenuItemClick('import')}><ListItemIcon><UploadIcon fontSize="small" /></ListItemIcon><ListItemText>Import CSV</ListItemText></MenuItem>
          <MenuItem onClick={() => handleMenuItemClick('recalculate')}><ListItemIcon><CalculateIcon fontSize="small" color="info" /></ListItemIcon><ListItemText sx={{ color: 'info.main' }}>Przelicz ilości z partii</ListItemText></MenuItem>
          <MenuItem component={RouterLink} to="/inventory/expiry-dates" onClick={handleMoreMenuClose}>
            <ListItemIcon><Badge badgeContent={expiringCount + expiredCount} color="error" max={99}><WarningIcon fontSize="small" /></Badge></ListItemIcon>
            <ListItemText>{t('inventory.states.expiryDates')}</ListItemText>
          </MenuItem>
        </Menu>
      </Box>

      <Tabs value={currentTab} onChange={handleTabChange} variant="scrollable" scrollButtons="auto" allowScrollButtonsMobile sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tab label={t('inventory.states.tabs.states')} />
        <Tab label={t('inventory.states.tabs.locations')} />
        <Tab label={t('inventory.states.tabs.expiryDates')} />
        <Tab label={t('inventory.states.tabs.suppliers')} />
        <Tab label={t('inventory.states.tabs.stocktaking')} />
        <Tab label={t('inventory.states.tabs.reservations')} />
      </Tabs>

      {/* Tab 0: Stany */}
      {currentTab === 0 && (
        <>
          <Fade in={true} timeout={300}>
            <Box sx={{ display: 'flex', mb: 3, flexWrap: 'wrap', gap: 2 }}>
              <TextField label={t('inventory.states.searchSku')} variant="outlined" value={searchTerm} onChange={handleSearchTermChange} size="small" sx={{ flexGrow: 1, minWidth: '200px' }}
                InputProps={{ startAdornment: <SearchIcon color="action" sx={mr1} /> }} />
              <FormControl sx={{ flexGrow: 1, minWidth: '200px' }}>
                <InputLabel id="category-select-label">{t('inventory.states.searchCategory')}</InputLabel>
                <Select labelId="category-select-label" value={searchCategory} label={t('inventory.states.searchCategory')} onChange={handleSearchCategoryChange} size="small">
                  <MenuItem value="">{t('inventory.states.allCategories')}</MenuItem>
                  {Object.values(INVENTORY_CATEGORIES).map((category) => (<MenuItem key={category} value={category}>{category}</MenuItem>))}
                </Select>
              </FormControl>
              <FormControl sx={{ minWidth: '200px' }}>
                <InputLabel id="customer-filter-label">Klient</InputLabel>
                <Select labelId="customer-filter-label" value={customerFilter} label="Klient" onChange={(e) => setCustomerFilter(e.target.value)} size="small">
                  <MenuItem value="">Wszyscy klienci</MenuItem>
                  {customers.map((customer) => (<MenuItem key={customer.id} value={customer.id}>{customer.name}</MenuItem>))}
                </Select>
              </FormControl>
              <Button variant="contained" onClick={handleSearch} size="medium">{t('inventory.states.searchNow')}</Button>
              <Tooltip title="Odśwież listę i wyczyść cache">
                <IconButton onClick={handleRefreshList} color="primary" size="medium" sx={{ ml: 1, border: '1px solid', borderColor: 'primary.main', '&:hover': { backgroundColor: 'primary.main', color: 'primary.contrastText' } }}>
                  <RefreshIcon />
                </IconButton>
              </Tooltip>
              <ArchiveFilterChip showArchived={showArchived} onToggle={() => setShowArchived(prev => !prev)} />
              <Tooltip title={t('inventory.states.configureColumns')}><IconButton onClick={handleColumnMenuOpen}><ViewColumnIcon /></IconButton></Tooltip>
            </Box>
          </Fade>

          {mainTableLoading ? (
            <Fade in={mainTableLoading} timeout={200}>
              <TableContainer component={Paper} sx={{ mt: 3 }}><Table><TableSkeleton columns={Object.values(visibleColumns).filter(Boolean).length - (visibleColumns.actions ? 1 : 0)} rows={5} hasActions={!!visibleColumns.actions} /></Table></TableContainer>
            </Fade>
          ) : displayedItems.length === 0 ? (
            <EmptyState title={t('inventory.states.noItemsFound')} />
          ) : (
            <Fade in={showContent} timeout={300}>
              <div>
                <TableContainer component={Paper} sx={{ mt: 3, transition: 'all 0.2s ease-in-out' }}>
                  <Table>
                    <TableHead>
                      <TableRow>
                        {visibleColumns.name && (<TableCell onClick={() => handleTableSort('name')} style={{ cursor: 'pointer' }}><Box sx={{ display: 'flex', alignItems: 'center' }}>{t('inventory.states.table.sku')}{tableSort.field === 'name' && <ArrowDropUpIcon sx={{ transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}</Box></TableCell>)}
                        {visibleColumns.category && (<TableCell onClick={() => handleTableSort('category')} style={{ cursor: 'pointer' }}><Box sx={{ display: 'flex', alignItems: 'center' }}>{t('inventory.states.table.category')}{tableSort.field === 'category' && <ArrowDropUpIcon sx={{ transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}</Box></TableCell>)}
                        {visibleColumns.casNumber && (<TableCell onClick={() => handleTableSort('casNumber')} style={{ cursor: 'pointer' }}><Box sx={{ display: 'flex', alignItems: 'center' }}>{t('inventory.states.table.casNumber')}{tableSort.field === 'casNumber' && <ArrowDropUpIcon sx={{ transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}</Box></TableCell>)}
                        {visibleColumns.barcode && (<TableCell onClick={() => handleTableSort('barcode')} style={{ cursor: 'pointer' }}><Box sx={{ display: 'flex', alignItems: 'center' }}>{t('inventory.states.table.barcode')}{tableSort.field === 'barcode' && <ArrowDropUpIcon sx={{ transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}</Box></TableCell>)}
                        {visibleColumns.totalQuantity && (<TableCell onClick={() => handleTableSort('totalQuantity')} style={{ cursor: 'pointer' }}><Box sx={{ display: 'flex', alignItems: 'center' }}>{t('inventory.states.table.totalQuantity')}{tableSort.field === 'totalQuantity' && <ArrowDropUpIcon sx={{ transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}</Box></TableCell>)}
                        {visibleColumns.reservedQuantity && (<TableCell onClick={() => handleTableSort('reservedQuantity')} style={{ cursor: 'pointer' }}><Box sx={{ display: 'flex', alignItems: 'center' }}>{t('inventory.states.table.reservedQuantity')}{tableSort.field === 'reservedQuantity' && <ArrowDropUpIcon sx={{ transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}</Box></TableCell>)}
                        {visibleColumns.availableQuantity && (<TableCell onClick={() => handleTableSort('availableQuantity')} style={{ cursor: 'pointer' }}><Box sx={{ display: 'flex', alignItems: 'center' }}>{t('inventory.states.table.availableQuantity')}{tableSort.field === 'availableQuantity' && <ArrowDropUpIcon sx={{ transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}</Box></TableCell>)}
                        {visibleColumns.status && (<TableCell onClick={() => handleTableSort('status')} style={{ cursor: 'pointer' }}><Box sx={{ display: 'flex', alignItems: 'center' }}>{t('inventory.states.table.status')}{tableSort.field === 'status' && <ArrowDropUpIcon sx={{ transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}</Box></TableCell>)}
                        {visibleColumns.customers && (<TableCell><Box sx={{ display: 'flex', alignItems: 'center' }}>Klienci</Box></TableCell>)}
                        {visibleColumns.location && (<TableCell onClick={() => handleTableSort('location')} style={{ cursor: 'pointer' }}><Box sx={{ display: 'flex', alignItems: 'center' }}>{t('inventory.states.table.location')}{tableSort.field === 'location' && <ArrowDropUpIcon sx={{ transform: tableSort.order === 'desc' ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />}</Box></TableCell>)}
                        {visibleColumns.actions && <TableCell align="right">{t('inventory.states.table.actions')}</TableCell>}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {displayedItems.map((item, index) => {
                        const bookedQuantity = item.bookedQuantity || 0;
                        const availableQuantity = item.quantity - bookedQuantity;
                        return (
                          <Grow key={item.id} in={showContent} timeout={100 + (index * 15)} style={{ transformOrigin: '0 0 0' }}>
                            <TableRow sx={{ transition: 'all 0.08s ease-in-out', opacity: item.archived ? 0.5 : 1, '&:hover': { backgroundColor: 'action.hover', transform: 'translateX(1px)' } }}>
                              {visibleColumns.name && (<TableCell><Typography variant="body1">{item.name}</Typography><Typography variant="body2" color="textSecondary">{item.description}</Typography>{(item.packingGroup || item.boxesPerPallet) && (<Box sx={{ mt: 0.5 }}>{item.packingGroup && <Chip size="small" label={`PG: ${item.packingGroup}`} color="default" sx={{ mr: 0.5 }} />}{item.boxesPerPallet && <Chip size="small" label={`${item.boxesPerPallet} kartonów/paletę`} color="info" />}</Box>)}</TableCell>)}
                              {visibleColumns.category && <TableCell>{item.category}</TableCell>}
                              {visibleColumns.casNumber && (<TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{item.casNumber ? <Typography variant="body2" sx={{ color: 'text.primary' }}>{item.casNumber}</Typography> : <Typography variant="body2" color="text.secondary">-</Typography>}</TableCell>)}
                              {visibleColumns.barcode && (<TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{item.barcode ? <Box sx={{ display: 'flex', alignItems: 'center' }}><QrCodeIcon sx={{ mr: 0.5, color: 'text.secondary', fontSize: '1rem' }} />{item.barcode}</Box> : <Typography variant="body2" color="text.secondary">-</Typography>}</TableCell>)}
                              {visibleColumns.totalQuantity && (<TableCell><Typography variant="body1">{item.quantity} {item.unit}</Typography></TableCell>)}
                              {visibleColumns.reservedQuantity && (<TableCell><Typography variant="body1" color={bookedQuantity > 0 ? "secondary" : "textSecondary"} sx={{ cursor: bookedQuantity > 0 ? 'pointer' : 'default', transition: 'color 0.2s ease-in-out' }} onClick={bookedQuantity > 0 ? () => reservationHook.handleShowReservations(item) : undefined}>{bookedQuantity} {item.unit}{bookedQuantity > 0 && (<Tooltip title={t('inventory.states.clickToViewReservations')}><ReservationIcon fontSize="small" sx={{ ml: 1, transition: 'transform 0.2s ease-in-out', '&:hover': { transform: 'scale(1.1)' } }} /></Tooltip>)}</Typography></TableCell>)}
                              {visibleColumns.availableQuantity && (<TableCell><Typography variant="body1" color={availableQuantity < item.minStockLevel ? "error" : "primary"}>{availableQuantity} {item.unit}</Typography></TableCell>)}
                              {visibleColumns.status && (<TableCell>{getStockLevelIndicator(availableQuantity, item.minStockLevel, item.optimalStockLevel)}</TableCell>)}
                              {visibleColumns.customers && (<TableCell><Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>{item.allCustomers ? <Chip label="Wszyscy" size="small" color="primary" /> : (<>{(item.customerIds || []).slice(0, 2).map(cId => <Chip key={cId} label={customerNameMap[cId] || '...'} size="small" variant="outlined" color="secondary" />)}{(item.customerIds || []).length > 2 && <Chip label={`+${item.customerIds.length - 2}`} size="small" color="default" />}</>)}</Box></TableCell>)}
                              {visibleColumns.location && <TableCell>{item.location || '-'}</TableCell>}
                              {visibleColumns.actions && (<TableCell align="right"><Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                                <IconButton component={RouterLink} to={`/inventory/${item.id}`} color="secondary" title={t('inventory.states.actions.details')} sx={{ transition: 'all 0.15s ease-in-out', '&:hover': { transform: 'scale(1.1)' } }}><InfoIcon /></IconButton>
                                <IconButton component={RouterLink} to={`/inventory/${item.id}/receive`} color="success" title={t('inventory.states.actions.receive')} sx={{ transition: 'all 0.15s ease-in-out', '&:hover': { transform: 'scale(1.1)' } }}><ReceiveIcon /></IconButton>
                                <IconButton component={RouterLink} to={`/inventory/${item.id}/issue`} color="warning" title={t('inventory.states.actions.issue')} sx={{ transition: 'all 0.15s ease-in-out', '&:hover': { transform: 'scale(1.1)' } }}><IssueIcon /></IconButton>
                                <Tooltip title={item.archived ? t('common:common.unarchive') : t('common:common.archive')}><IconButton onClick={() => labelHook.handleArchiveItem(item)} sx={{ transition: 'all 0.15s ease-in-out', '&:hover': { transform: 'scale(1.1)' } }}>{item.archived ? <UnarchiveIcon /> : <ArchiveIcon />}</IconButton></Tooltip>
                                <IconButton onClick={(e) => handleMenuOpen(e, item)} color="primary" title={t('inventory.states.actions.moreActions')} sx={{ transition: 'all 0.15s ease-in-out', '&:hover': { transform: 'scale(1.1)' } }}><MoreVertIcon /></IconButton>
                              </Box></TableCell>)}
                            </TableRow>
                          </Grow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>

                <Fade in={showContent} timeout={400}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center' }}>
                      <Typography variant="body2" sx={{ mr: 2 }}>{t('inventory.states.pagination.itemsPerPage')}:</Typography>
                      <Select value={pageSize} onChange={handlePageSizeChange} size="small">
                        <MenuItem value={5}>5</MenuItem><MenuItem value={10}>10</MenuItem><MenuItem value={20}>20</MenuItem><MenuItem value={50}>50</MenuItem>
                      </Select>
                    </Box>
                    <Pagination count={totalPages} page={page} onChange={handlePageChange} color="primary" />
                    <Typography variant="body2">{t('inventory.states.pagination.showing', { shown: displayedItems.length, total: totalItems })}</Typography>
                  </Box>
                </Fade>
              </div>
            </Fade>
          )}

          <Menu anchorEl={columnMenuAnchor} open={Boolean(columnMenuAnchor)} onClose={handleColumnMenuClose}>
            {['name', 'category', 'casNumber', 'barcode', 'totalQuantity', 'reservedQuantity', 'availableQuantity', 'status', 'customers', 'location', 'actions'].map(col => (
              <MenuItem key={col} onClick={() => toggleColumnVisibility(col)}>
                <Checkbox checked={visibleColumns[col]} />
                <ListItemText primary={col === 'customers' ? 'Klienci' : t(`inventory.states.table.${col}`)} />
              </MenuItem>
            ))}
          </Menu>
        </>
      )}

      {/* Tab 1: Lokalizacje */}
      {currentTab === 1 && (
        <Suspense fallback={<TabFallback />}>
          <WarehousesTab {...warehouseHook} />
        </Suspense>
      )}

      {/* Tab 2: Daty ważności */}
      {currentTab === 2 && (
        <Suspense fallback={<TabFallback />}>
          <Box sx={{ mt: -3 }}><ExpiryDatesPage embedded={true} /></Box>
        </Suspense>
      )}

      {/* Tab 3: Dostawcy */}
      {currentTab === 3 && (
        <Suspense fallback={<TabFallback />}>
          <Box sx={{ mt: -3 }}><SuppliersPage embedded={true} /></Box>
        </Suspense>
      )}

      {/* Tab 4: Inwentaryzacja */}
      {currentTab === 4 && (
        <Suspense fallback={<TabFallback />}>
          <Box sx={{ mt: -3 }}><StocktakingPage embedded={true} /></Box>
        </Suspense>
      )}

      {/* Tab 5: Rezerwacje */}
      {currentTab === 5 && (
        <Suspense fallback={<TabFallback />}>
          <ReservationsTab
            filteredAllReservations={reservationHook.filteredAllReservations}
            loadingAllReservations={reservationHook.loadingAllReservations}
            moFilter={reservationHook.moFilter}
            updatingTasks={reservationHook.updatingTasks}
            cleaningReservations={reservationHook.cleaningReservations}
            handleMoFilterChange={reservationHook.handleMoFilterChange}
            handleUpdateReservationTasks={reservationHook.handleUpdateReservationTasks}
            handleCleanupDeletedTaskReservations={reservationHook.handleCleanupDeletedTaskReservations}
            fetchAllReservations={reservationHook.fetchAllReservations}
            setSelectedItem={reservationHook.setSelectedItem}
            handleEditReservation={reservationHook.handleEditReservation}
            handleDeleteReservation={reservationHook.handleDeleteReservation}
          />
        </Suspense>
      )}

      {/* Reservation detail dialog */}
      <Dialog open={reservationHook.reservationDialogOpen} onClose={reservationHook.handleCloseReservationDialog} maxWidth="md" fullWidth>
        <DialogTitle>{t('inventory.states.reservations.title', { itemName: reservationHook.selectedItem?.name })}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, mt: 1 }}>
            <Typography variant="subtitle1">{t('inventory.states.reservations.totalReserved', { quantity: reservationHook.reservations.reduce((sum, res) => sum + res.quantity, 0), unit: reservationHook.selectedItem?.unit })}</Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              {reservationHook.reservations.filter(r => !r.taskNumber && r.referenceId).length > 0 && (
                <Typography variant="body2" sx={{ color: 'warning.main' }}>{t('inventory.states.reservations.missingMoNumbers')}</Typography>
              )}
              <Button variant="outlined" color="primary" size="small" onClick={reservationHook.handleUpdateReservationTasks} disabled={reservationHook.updatingTasks}
                startIcon={reservationHook.updatingTasks ? <CircularProgress size={20} /> : <HistoryIcon />}>
                {reservationHook.updatingTasks ? t('inventory.states.reservations.updating') : t('inventory.states.reservations.updateTaskData')}
              </Button>
              <Button variant="outlined" color="error" size="small" onClick={reservationHook.handleCleanupDeletedTaskReservations} disabled={reservationHook.cleaningReservations}
                startIcon={reservationHook.cleaningReservations ? <CircularProgress size={20} /> : <DeleteForeverIcon />}>
                {reservationHook.cleaningReservations ? t('inventory.states.reservations.cleaning') : t('inventory.states.reservations.removeDeletedMoReservations')}
              </Button>
            </Box>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('inventory.states.reservations.date')}</TableCell>
                  <TableCell>{t('inventory.states.reservations.user')}</TableCell>
                  <TableCell>{t('inventory.states.reservations.quantity')}</TableCell>
                  <TableCell>{t('inventory.states.reservations.batch')}</TableCell>
                  <TableCell>{t('inventory.states.reservations.status')}</TableCell>
                  <TableCell>{t('inventory.states.reservations.task')}</TableCell>
                  <TableCell>{t('inventory.states.table.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {reservationHook.filteredReservations.map((reservation) => (
                  <TableRow key={reservation.id}>
                    <TableCell>{formatDate(reservation.createdAt)}</TableCell>
                    <TableCell>{reservation.userName}</TableCell>
                    <TableCell>{reservation.quantity} {reservationHook.selectedItem?.unit}</TableCell>
                    <TableCell>{reservation.batchNumber || '-'}</TableCell>
                    <TableCell><Chip label={reservation.fulfilled ? t('inventory.states.reservations.fulfilled') : t('inventory.states.reservations.active')} color={reservation.fulfilled ? 'success' : 'primary'} size="small" /></TableCell>
                    <TableCell>
                      {reservation.taskNumber ? (
                        <Link component={RouterLink} to={`/production/tasks/${reservation.taskId}`} underline="hover" sx={{ display: 'flex', alignItems: 'center' }}>
                          <Chip label={`MO: ${reservation.taskNumber}`} color="secondary" size="small" variant="outlined" sx={mr1} />
                          {reservation.taskName && (<Tooltip title={reservation.taskName}><Box component="span" sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{reservation.taskName.substring(0, 15)}{reservation.taskName.length > 15 ? '...' : ''}</Box></Tooltip>)}
                        </Link>
                      ) : t('inventory.states.reservations.noTask')}
                    </TableCell>
                    <TableCell>
                      <Box display="flex" justifyContent="flex-end">
                        <IconButton color="primary" size="small" onClick={() => reservationHook.handleEditReservation(reservation)}><EditIcon fontSize="small" /></IconButton>
                        <IconButton color="error" size="small" onClick={() => reservationHook.handleDeleteReservation(reservation.id)}><DeleteIcon fontSize="small" /></IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </DialogContent>
        <DialogActions><Button onClick={reservationHook.handleCloseReservationDialog}>{t('common.close')}</Button></DialogActions>
      </Dialog>

      {/* Export category dialog */}
      <Dialog open={exportHook.exportCategoryDialogOpen} onClose={() => exportHook.setExportCategoryDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Select Categories for CSV Export</DialogTitle>
        <DialogContent>
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Select which product categories should be included in the CSV report.</Typography>
            <Box sx={{ mb: 2, borderBottom: 1, borderColor: 'divider', pb: 1 }}>
              <FormControl component="fieldset">
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Checkbox checked={exportHook.selectedExportCategories.length === Object.values(INVENTORY_CATEGORIES).length}
                    indeterminate={exportHook.selectedExportCategories.length > 0 && exportHook.selectedExportCategories.length < Object.values(INVENTORY_CATEGORIES).length}
                    onChange={exportHook.handleSelectAllCategories} />
                  <Typography variant="body1" sx={{ fontWeight: 'bold' }}>Select All ({exportHook.selectedExportCategories.length}/{Object.values(INVENTORY_CATEGORIES).length})</Typography>
                </Box>
              </FormControl>
            </Box>
            <Box sx={{ maxHeight: 300, overflow: 'auto' }}>
              {Object.values(INVENTORY_CATEGORIES).map((category) => (
                <Box key={category} sx={{ display: 'flex', alignItems: 'center', '&:hover': { bgcolor: 'action.hover' }, borderRadius: 1, px: 1 }}>
                  <Checkbox checked={exportHook.selectedExportCategories.includes(category)} onChange={() => exportHook.handleExportCategoryToggle(category)} />
                  <Typography variant="body2">{category}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => exportHook.setExportCategoryDialogOpen(false)}>Cancel</Button>
          <Button onClick={exportHook.generateCsvReport} variant="contained" color="primary" disabled={exportHook.selectedExportCategories.length === 0}>
            Export CSV ({exportHook.selectedExportCategories.length} categories)
          </Button>
        </DialogActions>
      </Dialog>

      {/* Import CSV dialog */}
      <Dialog open={importHook.importDialogOpen} onClose={importHook.handleCloseImportDialog} maxWidth="md" fullWidth>
        <DialogTitle>Import pozycji magazynowych z CSV</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ p: 2, bgcolor: 'info.light', borderRadius: 1, border: '1px solid', borderColor: 'info.main' }}>
              <Typography variant="body2" gutterBottom fontWeight="bold">Format pliku CSV:</Typography>
              <Typography variant="body2" component="div" sx={{ fontSize: '0.875rem' }}>
                • <strong>Wymagana kolumna:</strong> SKU (identyfikator pozycji)<br/>
                • <strong>Opcjonalne kolumny:</strong> Category, CAS Number, Barcode, Unit, Location, Min Stock Level, Max Stock Level, Cardboard Per Pallet, Pcs Per Cardboard, Gross Weight (kg), Description<br/>
                • <strong>Uwaga:</strong> Import aktualizuje tylko istniejące pozycje. Nowe pozycje nie będą tworzone.<br/>
                • <strong>Uwaga:</strong> Kolumny Total Quantity, Reserved Quantity, Available Quantity są ignorowane (ilości zarządzane są przez transakcje).
              </Typography>
            </Box>
            <Button variant="outlined" component="label" fullWidth startIcon={<UploadIcon />}>
              Wybierz plik CSV
              <input type="file" hidden accept=".csv" onChange={importHook.handleFileSelect} />
            </Button>
            {importHook.importFile && (
              <Box sx={{ p: 2, bgcolor: 'success.light', borderRadius: 1, border: '1px solid', borderColor: 'success.main' }}>
                <Typography variant="body2">✓ Wczytano plik: <strong>{importHook.importFile.name}</strong></Typography>
              </Box>
            )}
            {importHook.importError && (
              <Box sx={{ p: 2, bgcolor: 'error.light', borderRadius: 1, border: '1px solid', borderColor: 'error.main' }}>
                <Typography variant="body2" color="error.dark">{importHook.importError}</Typography>
              </Box>
            )}
            {importHook.importWarnings.length > 0 && (
              <Box sx={{ mt: 2, p: 2, bgcolor: 'warning.light', borderRadius: 1, border: '1px solid', borderColor: 'warning.main' }}>
                <Typography variant="subtitle2" gutterBottom fontWeight="bold">Znaleziono {importHook.importWarnings.length} ostrzeżeń:</Typography>
                <Box component="ul" sx={{ margin: 0, paddingLeft: 2, maxHeight: 200, overflow: 'auto' }}>
                  {importHook.importWarnings.map((warning, idx) => (
                    <li key={idx}><Typography variant="body2"><strong>{warning.sku}:</strong> {warning.message}</Typography></li>
                  ))}
                </Box>
              </Box>
            )}
            {importHook.importPreview.length > 0 && (
              <Box sx={{ mt: 2 }}>
                <Typography variant="subtitle2" gutterBottom fontWeight="bold">Podgląd zmian ({importHook.importPreview.filter(p => p.status === 'update').length} pozycji do aktualizacji):</Typography>
                <Box sx={{ maxHeight: 400, overflow: 'auto', mt: 2 }}>
                  {importHook.importPreview.map((item, index) => (
                    <Box key={index} sx={{ mb: 2, p: 2, border: '1px solid', borderColor: item.status === 'update' ? 'primary.main' : item.status === 'new' ? 'warning.main' : 'divider', borderRadius: 1, bgcolor: item.status === 'update' ? 'primary.light' : item.status === 'new' ? 'warning.light' : 'background.paper' }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                        <Typography variant="subtitle2" fontWeight="bold">{item.sku}</Typography>
                        <Chip label={item.message} size="small" color={item.status === 'update' ? 'primary' : item.status === 'new' ? 'warning' : 'default'} />
                      </Box>
                      {item.changes.length > 0 && (
                        <TableContainer><Table size="small"><TableHead><TableRow><TableCell>Pole</TableCell><TableCell>Wartość bieżąca</TableCell><TableCell>Nowa wartość</TableCell></TableRow></TableHead><TableBody>
                          {item.changes.map((change, idx) => (<TableRow key={idx}><TableCell>{change.field}</TableCell><TableCell sx={{ color: 'error.main' }}>{change.oldValue || '-'}</TableCell><TableCell sx={{ color: 'success.main' }}>{change.newValue || '-'}</TableCell></TableRow>))}
                        </TableBody></Table></TableContainer>
                      )}
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={importHook.handleCloseImportDialog} disabled={importHook.importing}>Anuluj</Button>
          <Button onClick={importHook.handleConfirmImport} variant="contained"
            disabled={importHook.importing || importHook.importPreview.filter(p => p.status === 'update').length === 0}
            startIcon={importHook.importing ? <CircularProgress size={16} /> : <UploadIcon />}>
            {importHook.importing ? 'Importowanie...' : `Zatwierdź import (${importHook.importPreview.filter(p => p.status === 'update').length} pozycji)`}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Label dialog */}
      {labelHook.labelDialogOpen && (
        <Suspense fallback={null}>
          <LabelDialog open={labelHook.labelDialogOpen} onClose={labelHook.handleCloseLabelDialog}
            item={labelHook.selectedItemForLabel} batches={labelHook.selectedItemBatches} />
        </Suspense>
      )}

      {/* Context menu for row actions */}
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
        <MenuItem component={RouterLink} to={selectedItem ? `/inventory/${selectedItem.id}/history` : '#'} onClick={handleMenuClose}>
          <ListItemIcon><HistoryIcon fontSize="small" /></ListItemIcon><ListItemText>{t('inventory.states.actions.history')}</ListItemText>
        </MenuItem>
        <MenuItem component={RouterLink} to={selectedItem ? `/inventory/${selectedItem.id}/batches` : '#'} onClick={handleMenuClose}>
          <ListItemIcon><ViewListIcon fontSize="small" /></ListItemIcon><ListItemText>{t('inventory.states.actions.batches')}</ListItemText>
        </MenuItem>
        <MenuItem component={RouterLink} to={selectedItem ? `/inventory/${selectedItem.id}/edit` : '#'} onClick={handleMenuClose}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon><ListItemText>{t('inventory.states.actions.edit')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleRecalculateItemQuantity}>
          <ListItemIcon><RefreshIcon fontSize="small" color="info" /></ListItemIcon><ListItemText sx={{ color: 'info.main' }}>Przelicz ilość z partii</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { if (selectedItem) handleDelete(selectedItem.id); handleMenuClose(); }}>
          <ListItemIcon><DeleteIcon fontSize="small" color="error" /></ListItemIcon><ListItemText sx={{ color: 'error.main' }}>{t('inventory.states.actions.delete')}</ListItemText>
        </MenuItem>
      </Menu>

      {/* Edit reservation dialog */}
      <EditReservationDialog
        open={reservationHook.editDialogOpen}
        onClose={() => reservationHook.setEditDialogOpen(false)}
        onSave={reservationHook.handleSaveReservation}
        editForm={reservationHook.editForm}
        setEditForm={reservationHook.setEditForm}
        selectedItem={reservationHook.selectedItem}
        selectedItemBatches={reservationHook.selectedItemBatches}
        loadingBatches={reservationHook.loadingBatches}
      />

      <ConfirmDialog
        open={confirmDialog.open} title={confirmDialog.title} message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm} onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
      />
    </div>
  );
};

export default InventoryList;
