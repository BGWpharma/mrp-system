import React, { memo, lazy, Suspense } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  FormLabel,
  RadioGroup,
  Radio,
  Alert,
  InputAdornment,
  Switch,
  Tabs,
  Tab,
} from '@mui/material';
import {
  Search as SearchIcon,
  Refresh as RefreshIcon,
  BuildCircle as BuildCircleIcon,
  BugReport as BugReportIcon,
} from '@mui/icons-material';
import { formatDate } from '../../utils/formatters';
import { StartProductionDialog, AddHistoryDialog, DeleteConfirmDialog, AdditionalCostDialog } from './dialogs';
import { CommentsDrawer } from './shared';
import ManualBatchSelection from './ManualBatchSelection';
import {
  loadingContainer,
  mb2,
  mb3,
  width130,
  width140,
} from '../../styles/muiCommonStyles';

const ProductionControlFormDialog = lazy(() => import('./ProductionControlFormDialog'));
const CompletedMOFormDialog = lazy(() => import('./CompletedMOFormDialog'));
const ProductionShiftFormDialog = lazy(() => import('./ProductionShiftFormDialog'));

const TaskDialogsContainer = memo(({
  // Translation
  t,
  // Task data
  task,
  loading,

  // Delete history dialog
  deleteHistoryDialogOpen,
  setDeleteHistoryDialogOpen,
  handleConfirmDeleteHistoryItem,

  // Delete task dialog
  deleteDialog,
  setDeleteDialog,
  handleDelete,

  // Packaging dialog
  packagingDialogOpen,
  setPackagingDialogOpen,
  loadingPackaging,
  searchPackaging,
  setSearchPackaging,
  consumePackagingImmediately,
  setConsumePackagingImmediately,
  filteredPackagingItems,
  packagingItems,
  handlePackagingSelection,
  handlePackagingBatchSelection,
  handlePackagingBatchQuantityChange,
  handleAddPackagingToTask,

  // Add history dialog
  addHistoryDialogOpen,
  setAddHistoryDialogOpen,
  handleAddHistorySubmit,
  availableMachines,
  warehouses,

  // Raw materials dialog
  rawMaterialsDialogOpen,
  setRawMaterialsDialogOpen,
  materialCategoryTab,
  setMaterialCategoryTab,
  searchRawMaterials,
  setSearchRawMaterials,
  loadingRawMaterials,
  filteredRawMaterialsItems,
  rawMaterialsItems,
  fetchAvailableRawMaterials,
  handleRawMaterialsSelection,
  handleRawMaterialsQuantityChange,
  handleAddRawMaterialsSubmit,

  // Delete material dialog
  deleteMaterialDialogOpen,
  setDeleteMaterialDialogOpen,
  handleConfirmDeleteMaterial,
  materialToDelete,

  // Additional cost dialog
  additionalCostDialogOpen,
  setAdditionalCostDialogOpen,
  editingAdditionalCost,
  setEditingAdditionalCost,
  handleSaveAdditionalCost,
  savingAdditionalCost,

  // Delete additional cost dialog
  deleteAdditionalCostDialogOpen,
  setDeleteAdditionalCostDialogOpen,
  additionalCostToDelete,
  setAdditionalCostToDelete,
  handleConfirmDeleteAdditionalCost,

  // Consume materials dialog
  consumeMaterialsDialogOpen,
  setConsumeMaterialsDialogOpen,
  consumedMaterials,
  selectedBatchesToConsume,
  consumeQuantities,
  consumeErrors,
  consumingMaterials,
  handleBatchToConsumeSelection,
  handleConsumeQuantityChange,
  handleConfirmConsumeMaterials,

  // Reserve dialog
  reserveDialogOpen,
  setReserveDialogOpen,
  reservationMethod,
  handleReservationMethodChange,
  autoCreatePOReservations,
  setAutoCreatePOReservations,
  reservingMaterials,
  handleReserveMaterials,

  // ManualBatchSelection props
  materialBatchesLoading,
  showExhaustedBatches,
  setShowExhaustedBatches,
  fetchBatchesForMaterialsOptimized,
  materialQuantities,
  getRequiredQuantityForReservation,
  batches,
  selectedBatches,
  expandedMaterial,
  setExpandedMaterial,
  handleBatchSelection,
  awaitingOrdersLoading,
  awaitingOrders,

  // Edit consumption dialog
  editConsumptionDialogOpen,
  setEditConsumptionDialogOpen,
  editedQuantity,
  setEditedQuantity,
  handleConfirmEditConsumption,

  // Delete consumption dialog
  deleteConsumptionDialogOpen,
  setDeleteConsumptionDialogOpen,
  restoreReservation,
  setRestoreReservation,
  deletingConsumption,
  handleConfirmDeleteConsumption,

  // Start production dialog
  dialogs,
  closeDialog,
  handleStartProductionWithExpiry,

  // Production control form dialog
  productionControlDialogOpen,
  setProductionControlDialogOpen,
  handleProductionControlFormSuccess,

  // Completed MO form dialog
  completedMODialogOpen,
  setCompletedMODialogOpen,
  handleCompletedMOFormSuccess,

  // Production shift form dialog
  productionShiftDialogOpen,
  setProductionShiftDialogOpen,
  handleProductionShiftFormSuccess,

  // Debug batch dialog
  debugBatchDialogOpen,
  setDebugBatchDialogOpen,
  debugLoading,
  debugResults,
  debugBatchConsistency,
  handleRepairConsumedMaterialBatch,
  handleRepairAllConsumedMaterialBatches,

  // Comments drawer
  commentsDrawerOpen,
  handleCloseCommentsDrawer,
  newComment,
  setNewComment,
  handleAddComment,
  handleDeleteComment,
  addingComment,
  currentUser,
}) => {
  return (
    <>
      {/* Dialog usuwania historii */}
      {deleteHistoryDialogOpen && (
        <DeleteConfirmDialog
          open
          onClose={() => setDeleteHistoryDialogOpen(false)}
          onConfirm={handleConfirmDeleteHistoryItem}
          title={t('common:common.confirmDeletion')}
          message="Czy na pewno chcesz usunąć wybrany wpis z historii produkcji? Ta operacja jest nieodwracalna."
          confirmText="Usuń wpis"
          loading={loading}
        />
      )}

      {/* Dialog usuwania zadania */}
      {deleteDialog && (
        <DeleteConfirmDialog
          open
          onClose={() => setDeleteDialog(false)}
          onConfirm={handleDelete}
          title={t('common:common.confirmDeletion')}
          message={`Czy na pewno chcesz usunąć to zadanie produkcyjne (MO: ${task?.moNumber})? Ta operacja jest nieodwracalna.`}
          confirmText="Usuń zadanie"
          loading={loading}
        />
      )}
      
      {/* Dialog wyboru opakowań */}
      {packagingDialogOpen && (
      <Dialog
        open
        onClose={() => setPackagingDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Dodaj opakowania do zadania</DialogTitle>
        <DialogContent>
          <DialogContentText sx={mb2}>
            Wybierz opakowania, które chcesz dodać do zadania produkcyjnego.
          </DialogContentText>
          
          <TextField
            fullWidth
            margin="normal"
            label="Wyszukaj opakowanie"
            variant="outlined"
            value={searchPackaging}
            onChange={(e) => setSearchPackaging(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={mb2}
          />
          
          <FormControlLabel
            control={
              <Switch
                checked={consumePackagingImmediately}
                onChange={(e) => setConsumePackagingImmediately(e.target.checked)}
                color="primary"
              />
            }
            label="Konsumuj opakowania natychmiast z wybranych partii"
            sx={mb2}
          />
          
          {loadingPackaging ? (
            <Box sx={loadingContainer}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">Wybierz</TableCell>
                    <TableCell>Nazwa</TableCell>
                    <TableCell>Kategoria</TableCell>
                    <TableCell>Dostępne partie</TableCell>
                    <TableCell>Wybrana partia</TableCell>
                    <TableCell>{t('consumption.quantityToAdd')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredPackagingItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        {packagingItems.length === 0 
                          ? "Brak dostępnych opakowań"
                          : "Brak wyników dla podanego wyszukiwania"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredPackagingItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={item.selected}
                            onChange={(e) => handlePackagingSelection(item.id, e.target.checked)}
                          />
                        </TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>{item.category}</TableCell>
                        <TableCell>
                          {item.batches && item.batches.length > 0 
                            ? `${item.batches.length} partii dostępnych`
                            : 'Brak dostępnych partii'}
                        </TableCell>
                        <TableCell>
                          <FormControl fullWidth size="small" disabled={!item.selected}>
                            <InputLabel>{t('common:common.selectBatch')}</InputLabel>
                            <Select
                              value={item.selectedBatch?.id || ''}
                              onChange={(e) => handlePackagingBatchSelection(item.id, e.target.value)}
                              label={t('common:common.selectBatch')}
                            >
                              {item.batches && item.batches.map((batch) => (
                                <MenuItem key={batch.id} value={batch.id}>
                                  {`LOT: ${batch.lotNumber || batch.batchNumber || 'Brak numeru'} - ${batch.quantity} ${item.unit}${batch.expiryDate ? ` (Ważne do: ${formatDate(batch.expiryDate)})` : ''}`}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </TableCell>
                        <TableCell>
                          <TextField
                            type="number"
                            value={item.batchQuantity || ''}
                            onChange={(e) => handlePackagingBatchQuantityChange(item.id, e.target.value)}
                            onWheel={(e) => e.target.blur()}
                            disabled={!item.selected || !item.selectedBatch}
                            inputProps={{ 
                              min: 0, 
                              max: item.selectedBatch ? item.selectedBatch.quantity : 0, 
                              step: 'any' 
                            }}
                            size="small"
                            sx={width130}
                            placeholder={item.selectedBatch ? `Max: ${item.selectedBatch.quantity}` : '0'}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPackagingDialogOpen(false)}>
            Anuluj
          </Button>
          <Button 
            onClick={handleAddPackagingToTask} 
            variant="contained" 
            color="primary"
            disabled={loadingPackaging || packagingItems.filter(item => item.selected && item.selectedBatch && item.batchQuantity > 0).length === 0}
          >
            {loadingPackaging ? <CircularProgress size={24} /> : 'Dodaj wybrane opakowania'}
          </Button>
        </DialogActions>
      </Dialog>
      )}
      
      {/* Dialog dodawania wpisu historii produkcji */}
      {addHistoryDialogOpen && (
      <AddHistoryDialog
        open
        onClose={() => setAddHistoryDialogOpen(false)}
        onSubmit={handleAddHistorySubmit}
        task={task}
        machines={availableMachines}
        warehouses={warehouses}
        loading={loading}
        t={t}
      />
      )}
      
      {/* Dialog wyboru surowców */}
      {rawMaterialsDialogOpen && (
      <Dialog
        open
        onClose={() => setRawMaterialsDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Dodaj surowiec do zadania</DialogTitle>
        <DialogContent>
          <DialogContentText sx={mb2}>
            Wybierz surowiec lub opakowanie jednostkowe, które chcesz dodać do zadania produkcyjnego.
            <br />
            <strong>Uwaga:</strong> Możesz dodać dowolną ilość - to jest tylko planowanie, nie rezerwacja materiałów.
          </DialogContentText>
          
          <Tabs 
            value={materialCategoryTab} 
            onChange={async (e, newValue) => {
              setMaterialCategoryTab(newValue);
              setSearchRawMaterials('');
              const targetCategory = newValue === 0 ? 'Surowce' : 'Opakowania jednostkowe';
              await fetchAvailableRawMaterials(targetCategory);
            }}
            sx={{ ...mb2, borderBottom: 1, borderColor: 'divider' }}
          >
            <Tab label="Surowce" />
            <Tab label="Opakowania jednostkowe" />
          </Tabs>
          
          <TextField
            fullWidth
            margin="normal"
            label={materialCategoryTab === 0 ? "Wyszukaj surowiec" : "Wyszukaj opakowanie jednostkowe"}
            variant="outlined"
            value={searchRawMaterials}
            onChange={(e) => setSearchRawMaterials(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
            }}
            sx={mb2}
          />
          
          {loadingRawMaterials ? (
            <Box sx={loadingContainer}>
              <CircularProgress />
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox">Wybierz</TableCell>
                    <TableCell>Nazwa</TableCell>
                    <TableCell>Dostępna ilość</TableCell>
                    <TableCell>{t('consumption.quantityToAdd')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredRawMaterialsItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center">
                        {rawMaterialsItems.length === 0 
                          ? "Brak dostępnych materiałów"
                          : "Brak wyników dla podanego wyszukiwania"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredRawMaterialsItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={item.selected}
                            onChange={(e) => handleRawMaterialsSelection(item.id, e.target.checked)}
                          />
                        </TableCell>
                        <TableCell>{item.name}</TableCell>
                        <TableCell>
                          <Box>
                            <Typography variant="body2">
                              {item.availableQuantity} {item.unit}
                            </Typography>
                            {item.selected && item.quantity > item.availableQuantity && (
                              <Typography variant="caption" color="warning.main">
                                ⚠️ Więcej niż dostępne
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <TextField
                            type="number"
                            value={item.quantity || ''}
                            onChange={(e) => handleRawMaterialsQuantityChange(item.id, e.target.value)}
                            disabled={!item.selected}
                            inputProps={{ min: 0, step: 'any' }}
                            size="small"
                            sx={{ 
                              width: '100px',
                              '& .MuiOutlinedInput-root': {
                                borderColor: item.selected && item.quantity > item.availableQuantity ? 'warning.main' : undefined
                              }
                            }}
                            placeholder={t('consumption.quantityToAdd')}
                            color={item.selected && item.quantity > item.availableQuantity ? 'warning' : 'primary'}
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRawMaterialsDialogOpen(false)}>
            Anuluj
          </Button>
          <Button 
            onClick={async () => {
              const selectedItems = rawMaterialsItems.filter(item => item.selected && item.quantity > 0);
              const result = await handleAddRawMaterialsSubmit({ items: selectedItems });
              if (result?.success) {
                setRawMaterialsDialogOpen(false);
              }
            }}
            variant="contained" 
            color="secondary"
            disabled={loadingRawMaterials || rawMaterialsItems.filter(item => item.selected && item.quantity > 0).length === 0}
          >
            {loadingRawMaterials ? <CircularProgress size={24} /> : 'Dodaj wybrane materiały'}
          </Button>
        </DialogActions>
      </Dialog>
      )}

      {/* Dialog usuwania materiału */}
      {deleteMaterialDialogOpen && (
      <DeleteConfirmDialog
        open
        onClose={() => setDeleteMaterialDialogOpen(false)}
        onConfirm={handleConfirmDeleteMaterial}
        title={t('consumption.confirmMaterialDeletion')}
        message={`Czy na pewno chcesz usunąć materiał "${materialToDelete?.name}" z zadania produkcyjnego? Ta operacja jest nieodwracalna.`}
        confirmText="Usuń materiał"
        loading={loading}
      />
      )}

      {/* Dialog dodatkowego kosztu MO */}
      {additionalCostDialogOpen && (
      <AdditionalCostDialog
        open
        onClose={() => {
          setAdditionalCostDialogOpen(false);
          setEditingAdditionalCost(null);
        }}
        onSave={handleSaveAdditionalCost}
        initialData={editingAdditionalCost}
        loading={savingAdditionalCost}
        t={(key) => t(key)}
      />
      )}

      {/* Dialog potwierdzenia usunięcia dodatkowego kosztu */}
      {deleteAdditionalCostDialogOpen && (
      <DeleteConfirmDialog
        open
        onClose={() => {
          setDeleteAdditionalCostDialogOpen(false);
          setAdditionalCostToDelete(null);
        }}
        onConfirm={handleConfirmDeleteAdditionalCost}
        title={t('additionalCosts.title')}
        message={t('additionalCosts.deleteConfirm')}
        confirmText={t('deleteTask')}
        loading={loading}
      />
      )}

      {/* Dialog konsumpcji materiałów */}
      {consumeMaterialsDialogOpen && (
      <Dialog
        open
        onClose={() => setConsumeMaterialsDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Konsumuj materiały</DialogTitle>
        <DialogContent>
          <DialogContentText sx={mb2}>
            Wybierz partie materiałów i ilości, które chcesz skonsumować. Konsumpcja zmniejszy dostępną ilość w magazynie.
          </DialogContentText>
          
          {consumedMaterials.length === 0 ? (
            <Alert severity="info">
              Brak zarezerwowanych materiałów do konsumpcji.
            </Alert>
          ) : (
            consumedMaterials.map((material) => {
              const materialId = material.inventoryItemId || material.id;
              const reservedBatches = task.materialBatches[materialId] || [];
              
              return (
                <Box key={materialId} sx={mb3}>
                  <Typography variant="h6" gutterBottom>
                    {material.name} ({material.unit})
                  </Typography>
                  
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell padding="checkbox">Konsumuj</TableCell>
                          <TableCell>Numer partii</TableCell>
                          <TableCell>Zarezerwowana ilość</TableCell>
                          <TableCell>Ilość do konsumpcji</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {reservedBatches.map((batch) => {
                          const batchKey = `${materialId}_${batch.batchId}`;
                          const isSelected = selectedBatchesToConsume[materialId]?.[batch.batchId] || false;
                          
                          return (
                            <TableRow key={batch.batchId}>
                              <TableCell padding="checkbox">
                                <Checkbox
                                  checked={isSelected}
                                  onChange={(e) => handleBatchToConsumeSelection(materialId, batch.batchId, e.target.checked)}
                                />
                              </TableCell>
                              <TableCell>{batch.batchNumber}</TableCell>
                              <TableCell>{batch.quantity} {material.unit}</TableCell>
                              <TableCell>
                                <TextField
                                  type="number"
                                  value={consumeQuantities[batchKey] || 0}
                                  onChange={(e) => handleConsumeQuantityChange(materialId, batch.batchId, e.target.value)}
                                  onFocus={(e) => {
                                    if ((consumeQuantities[batchKey] || 0) === 0) {
                                      e.target.select();
                                    }
                                  }}
                                  onBlur={(e) => {
                                    if (e.target.value === '' || e.target.value === null) {
                                      handleConsumeQuantityChange(materialId, batch.batchId, 0);
                                    }
                                  }}
                                  onWheel={(e) => e.target.blur()}
                                  disabled={!isSelected}
                                  error={Boolean(consumeErrors[batchKey])}
                                  helperText={consumeErrors[batchKey]}
                                  inputProps={{ min: 0, max: batch.quantity, step: 'any' }}
                                  size="small"
                                  sx={width140}
                                  InputProps={{
                                    endAdornment: <Typography variant="caption">{material.unit}</Typography>
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              );
            })
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConsumeMaterialsDialogOpen(false)} disabled={consumingMaterials}>
            Anuluj
          </Button>
          <Button 
            onClick={handleConfirmConsumeMaterials} 
            variant="contained" 
            color="warning"
            disabled={consumingMaterials || consumedMaterials.length === 0}
            startIcon={consumingMaterials ? <CircularProgress size={20} /> : null}
          >
            {consumingMaterials ? 'Konsumowanie...' : 'Konsumuj materiały'}
          </Button>
        </DialogActions>
      </Dialog>
      )}

      {/* Dialog rezerwacji surowców */}
      {reserveDialogOpen && (
      <Dialog
        open
        onClose={() => setReserveDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>Rezerwacja surowców</DialogTitle>
        <DialogContent>
          <DialogContentText sx={mb2}>
            Wybierz partie materiałów, które chcesz zarezerwować dla tego zadania produkcyjnego.
          </DialogContentText>
          
          <FormControl component="fieldset" sx={mb2}>
            <FormLabel component="legend">Metoda rezerwacji</FormLabel>
            <RadioGroup 
              row 
              value={reservationMethod} 
              onChange={handleReservationMethodChange}
            >
              <FormControlLabel 
                value="automatic" 
                control={<Radio />} 
                label="Automatyczna (FIFO)" 
              />
              <FormControlLabel 
                value="manual" 
                control={<Radio />} 
                label={t('consumption.manualBatchSelection')} 
              />
            </RadioGroup>
          </FormControl>
          
          {reservationMethod === 'manual' && (
            <ManualBatchSelection
              task={task}
              materialBatchesLoading={materialBatchesLoading}
              showExhaustedBatches={showExhaustedBatches}
              setShowExhaustedBatches={setShowExhaustedBatches}
              fetchBatchesForMaterialsOptimized={fetchBatchesForMaterialsOptimized}
              materialQuantities={materialQuantities}
              getRequiredQuantityForReservation={getRequiredQuantityForReservation}
              batches={batches}
              selectedBatches={selectedBatches}
              expandedMaterial={expandedMaterial}
              setExpandedMaterial={setExpandedMaterial}
              handleBatchSelection={handleBatchSelection}
              awaitingOrdersLoading={awaitingOrdersLoading}
              awaitingOrders={awaitingOrders}
              handleReserveMaterials={handleReserveMaterials}
              reservingMaterials={reservingMaterials}
              reservationMethod={reservationMethod}
              t={t}
            />
          )}
          
          {reservationMethod === 'automatic' && (
            <>
              <Alert severity="info" sx={mb2}>
                System automatycznie zarezerwuje najstarsze dostępne partie materiałów (FIFO).
              </Alert>
              
              <FormControlLabel
                control={
                  <Checkbox
                    checked={autoCreatePOReservations}
                    onChange={(e) => setAutoCreatePOReservations(e.target.checked)}
                    color="primary"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Automatycznie twórz rezerwacje z zamówień zakupu (PO)
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Jeśli braknie partii magazynowych, system automatycznie zarezerwuje brakującą ilość z otwartych zamówień zakupowych
                    </Typography>
                  </Box>
                }
                sx={{ ...mb2, alignItems: 'flex-start' }}
              />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReserveDialogOpen(false)}>
            Anuluj
          </Button>
          <Button 
            onClick={handleReserveMaterials} 
            variant="contained" 
            color="primary"
            disabled={reservingMaterials}
          >
            {reservingMaterials ? <CircularProgress size={24} /> : 'Rezerwuj materiały'}
          </Button>
        </DialogActions>
      </Dialog>
      )}

      {/* Dialog korekty konsumpcji */}
      {editConsumptionDialogOpen && (
      <Dialog
        open
        onClose={() => setEditConsumptionDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Edytuj konsumpcję</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Wprowadź nową ilość konsumpcji dla wybranej partii:
          </DialogContentText>
          <TextField
            label={t('common:common.newQuantity')}
            type="number"
            value={editedQuantity}
            onChange={(e) => setEditedQuantity(e.target.value)}
            onWheel={(e) => e.target.blur()}
            fullWidth
            InputProps={{
              endAdornment: <Typography variant="body2">{task?.unit || 'szt.'}</Typography>
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditConsumptionDialogOpen(false)}>
            Anuluj
          </Button>
          <Button 
            onClick={handleConfirmEditConsumption} 
            variant="contained" 
            color="primary"
            disabled={loading}
          >
            {loading ? <CircularProgress size={24} /> : 'Zapisz zmiany'}
          </Button>
        </DialogActions>
      </Dialog>
      )}

      {/* Dialog usuwania konsumpcji */}
      {deleteConsumptionDialogOpen && (
      <Dialog
        open
        onClose={() => setDeleteConsumptionDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>{t('consumption.confirmConsumptionDeletion')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć wybraną konsumpcję? Ta operacja jest nieodwracalna.
          </DialogContentText>
          <FormControlLabel
            control={
              <Checkbox
                checked={restoreReservation}
                onChange={(e) => setRestoreReservation(e.target.checked)}
                color="primary"
              />
            }
            label={t('consumption.restoreReservationAfterDeletion')}
            sx={{ mt: 2, display: 'block' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConsumptionDialogOpen(false)} disabled={deletingConsumption}>
            Anuluj
          </Button>
          <Button 
            onClick={handleConfirmDeleteConsumption} 
            variant="contained" 
            color="error"
            disabled={deletingConsumption}
            startIcon={deletingConsumption ? <CircularProgress size={20} /> : null}
          >
            {deletingConsumption ? 'Usuwanie...' : 'Usuń konsumpcję'}
          </Button>
        </DialogActions>
      </Dialog>
      )}

      {/* Dialog rozpoczęcia produkcji */}
      {dialogs.startProduction && (
      <StartProductionDialog
        open
        onClose={() => closeDialog('startProduction')}
        onStart={handleStartProductionWithExpiry}
        loading={loading}
        t={t}
      />
      )}

      {/* Dialog formularza kontroli produkcji */}
      {productionControlDialogOpen && (
      <Suspense fallback={null}>
        <ProductionControlFormDialog
          open
          onClose={() => setProductionControlDialogOpen(false)}
          task={task}
          onSuccess={handleProductionControlFormSuccess}
        />
      </Suspense>
      )}

      {/* Dialog formularza zakończonego MO */}
      {completedMODialogOpen && (
      <Suspense fallback={null}>
        <CompletedMOFormDialog
          open
          onClose={() => setCompletedMODialogOpen(false)}
          task={task}
          onSuccess={handleCompletedMOFormSuccess}
        />
      </Suspense>
      )}

      {/* Dialog formularza zmiany produkcyjnej */}
      {productionShiftDialogOpen && (
      <Suspense fallback={null}>
        <ProductionShiftFormDialog
          open
          onClose={() => setProductionShiftDialogOpen(false)}
          task={task}
          onSuccess={handleProductionShiftFormSuccess}
        />
      </Suspense>
      )}

      {/* DEBUG: Dialog wyników sprawdzania spójności partii */}
      {debugBatchDialogOpen && (
      <Dialog
        open
        onClose={() => setDebugBatchDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <BugReportIcon color="warning" />
          Debug: Spójność partii w zadaniu
        </DialogTitle>
        <DialogContent dividers>
          {debugLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : (
            <Box sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
              {debugResults.map((result, idx) => (
                <Box 
                  key={idx} 
                  sx={{ 
                    mb: 1, 
                    p: result.type === 'header' ? 1 : 0.5,
                    bgcolor: result.type === 'header' ? 'grey.100' : 'transparent',
                    borderLeft: result.type === 'error' ? '4px solid red' : 
                               result.type === 'warning' ? '4px solid orange' : 
                               result.type === 'success' ? '4px solid green' : 
                               result.type === 'material' ? '4px solid blue' : 'none',
                    pl: result.type !== 'header' ? 2 : 1
                  }}
                >
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      fontFamily: 'monospace',
                      fontWeight: result.type === 'header' || result.type === 'material' ? 'bold' : 'normal',
                      color: result.type === 'error' ? 'error.main' : 
                             result.type === 'warning' ? 'warning.main' : 
                             result.type === 'success' ? 'success.main' : 'text.primary'
                    }}
                  >
                    {result.text}
                  </Typography>
                  {result.details && (
                    <Box sx={{ pl: 2, mt: 0.5 }}>
                      {Object.entries(result.details).map(([key, value]) => (
                        <Typography key={key} variant="caption" component="div" sx={{ fontFamily: 'monospace', color: 'text.secondary' }}>
                          <strong>{key}:</strong> {typeof value === 'object' ? JSON.stringify(value) : value}
                        </Typography>
                      ))}
                    </Box>
                  )}
                  {result.canRepair && result.repairData && (
                    <Box sx={{ mt: 1, pl: 2 }}>
                      <Button
                        variant="contained"
                        color="warning"
                        size="small"
                        startIcon={<BuildCircleIcon />}
                        onClick={() => handleRepairConsumedMaterialBatch(result.repairData)}
                      >
                        Napraw powiązanie: {result.repairData.oldBatchId.substring(0, 8)}... → {result.repairData.newBatchId.substring(0, 8)}...
                      </Button>
                    </Box>
                  )}
                </Box>
              ))}
              {debugResults.length === 0 && (
                <Typography color="text.secondary">
                  Kliknij przycisk debugowania żeby sprawdzić spójność partii
                </Typography>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDebugBatchDialogOpen(false)}>
            Zamknij
          </Button>
          {debugResults.some(r => r.canRepair && r.repairData) && (
            <Button 
              onClick={handleRepairAllConsumedMaterialBatches}
              disabled={debugLoading}
              variant="contained"
              color="warning"
              startIcon={<BuildCircleIcon />}
            >
              Napraw wszystkie ({debugResults.filter(r => r.canRepair).length})
            </Button>
          )}
          <Button 
            onClick={debugBatchConsistency} 
            disabled={debugLoading}
            startIcon={<RefreshIcon />}
          >
            Odśwież
          </Button>
        </DialogActions>
      </Dialog>
      )}

      {/* Drawer komentarzy */}
      {commentsDrawerOpen && (
      <CommentsDrawer
        open
        onClose={handleCloseCommentsDrawer}
        comments={task?.comments || []}
        newComment={newComment}
        onNewCommentChange={setNewComment}
        onAddComment={handleAddComment}
        onDeleteComment={(comment) => handleDeleteComment(comment.id)}
        addingComment={addingComment}
        currentUserId={currentUser?.uid}
        isAdmin={currentUser?.role === 'administrator'}
        t={t}
      />
      )}
    </>
  );
});

TaskDialogsContainer.displayName = 'TaskDialogsContainer';
export default TaskDialogsContainer;
