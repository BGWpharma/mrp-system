import React, { memo } from 'react';
import { Link } from 'react-router-dom';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  IconButton,
  Alert,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon,
  ArrowForward as ArrowForwardIcon,
} from '@mui/icons-material';
import { formatDate } from '../../utils/formatters';
import { getConsumedQuantityForMaterial } from '../../utils/productionUtils';
import {
  loadingContainer,
  sectionHeader,
  actionButtons,
  flexBetween,
  flexCenter,
  flexEndMt2,
  mr1,
  mb2,
  mt2,
  mt3,
  width130,
} from '../../styles/muiCommonStyles';

const ManualBatchSelection = memo(({
  task,
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
  handleReserveMaterials,
  reservingMaterials,
  reservationMethod,
  t,
}) => {
  if (materialBatchesLoading) {
    return (
      <Box sx={loadingContainer}>
        <CircularProgress />
      </Box>
    );
  }

  const formatOrderDate = (dateValue) => {
    if (!dateValue) return '-';
    try {
      let date;
      if (dateValue.toDate && typeof dateValue.toDate === 'function') {
        date = dateValue.toDate();
      } else if (dateValue.seconds) {
        date = new Date(dateValue.seconds * 1000);
      } else {
        date = new Date(dateValue);
      }
      if (isNaN(date.getTime())) return '-';
      return date.toLocaleDateString('pl-PL');
    } catch (error) {
      console.error('Błąd formatowania daty:', error, dateValue);
      return '-';
    }
  };

  return (
    <Box sx={mt2}>
      <Box sx={sectionHeader}>
        <Typography variant="subtitle1">
          Wybierz partie dla każdego materiału:
        </Typography>
        <Box sx={actionButtons}>
          <FormControlLabel
            control={
              <Checkbox
                checked={showExhaustedBatches}
                onChange={(e) => setShowExhaustedBatches(e.target.checked)}
                size="small"
              />
            }
            label={t('consumption.showDepletedBatches')}
            sx={{ fontSize: '0.875rem' }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={fetchBatchesForMaterialsOptimized}
            disabled={materialBatchesLoading}
            sx={{ minWidth: 'auto' }}
          >
            Odśwież partie
          </Button>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={mb2}>
        💡 Możesz zarezerwować mniejszą ilość niż wymagana. Niezarezerwowane materiały można uzupełnić później.
      </Typography>
      
      {task.materials.map((material) => {
        const materialId = material.inventoryItemId || material.id;
        if (!materialId) return null;
        
        const baseQuantity = materialQuantities[materialId] !== undefined 
          ? materialQuantities[materialId] 
          : material.quantity;
        const consumedQuantity = getConsumedQuantityForMaterial(task.consumedMaterials, materialId);
        const requiredQuantity = getRequiredQuantityForReservation(material, materialId);
        
        let materialBatches = batches[materialId] || [];
        
        if (!showExhaustedBatches) {
          materialBatches = materialBatches.filter(batch => {
            const effectiveQuantity = batch.effectiveQuantity || 0;
            const isReservedForTask = task.materialBatches && 
                                     task.materialBatches[materialId] && 
                                     task.materialBatches[materialId].some(b => b.batchId === batch.id);
            return effectiveQuantity > 0 || isReservedForTask;
          });
        }
        
        const selectedMaterialBatches = selectedBatches[materialId] || [];
        const totalSelectedQuantity = selectedMaterialBatches.reduce((sum, batch) => sum + parseFloat(batch.quantity || 0), 0);
        const isComplete = true;
        
        const isAlreadyReserved = task.materialBatches && task.materialBatches[materialId] && task.materialBatches[materialId].length > 0;
        
        materialBatches = [...materialBatches].sort((a, b) => {
          const aIsReserved = task.materialBatches && 
                             task.materialBatches[materialId] && 
                             task.materialBatches[materialId].some(batch => batch.batchId === a.id);
          const bIsReserved = task.materialBatches && 
                             task.materialBatches[materialId] && 
                             task.materialBatches[materialId].some(batch => batch.batchId === b.id);
          
          if (aIsReserved === bIsReserved) {
            if (!a.expiryDate && !b.expiryDate) return 0;
            if (!a.expiryDate) return 1;
            if (!b.expiryDate) return -1;
            return new Date(a.expiryDate) - new Date(b.expiryDate);
          }
          return aIsReserved ? -1 : 1;
        });
        
        return (
          <Accordion 
            key={materialId}
            expanded={expandedMaterial === materialId}
            onChange={() => setExpandedMaterial(expandedMaterial === materialId ? null : materialId)}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Box sx={{ ...flexBetween, width: '100%' }}>
                <Box>
                <Typography>{material.name}</Typography>
                  {consumedQuantity > 0 && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Skonsumowano: {consumedQuantity.toFixed(3)} {material.unit} z {baseQuantity.toFixed(3)} {material.unit}
                    </Typography>
                  )}
                </Box>
                <Box sx={flexCenter}>
                  <Chip
                    label={`${totalSelectedQuantity.toFixed(3)} / ${parseFloat(requiredQuantity).toFixed(3)} ${material.unit}`}
                    color={isComplete ? "success" : requiredQuantity > 0 ? "warning" : "default"}
                    size="small"
                    sx={mr1}
                  />
                  {requiredQuantity <= 0 && task.materialConsumptionConfirmed && (
                    <Chip
                      label={t('consumption.fullyConsumed')}
                      color="success"
                      size="small"
                      sx={mr1}
                    />
                  )}
                  {totalSelectedQuantity > 0 && totalSelectedQuantity < requiredQuantity && requiredQuantity > 0 && (
                    <Chip
                      label={t('consumption.partialReservation')}
                      color="warning"
                      size="small"
                      sx={mr1}
                      variant="outlined"
                    />
                  )}
                  {isAlreadyReserved && (
                    <Chip
                      label="Zarezerwowany"
                      color="primary"
                      size="small"
                      sx={mr1}
                    />
                  )}
                </Box>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {materialBatches.length === 0 ? (
                <Typography color="error">
                  Brak dostępnych partii dla tego materiału
                </Typography>
              ) : (
                <>
                  <Typography variant="subtitle2" gutterBottom>Partie magazynowe:</Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Nr partii</TableCell>
                          <TableCell>Magazyn</TableCell>
                          <TableCell>Data ważności</TableCell>
                          <TableCell>Dostępna ilość</TableCell>
                          <TableCell>Cena jedn.</TableCell>
                          <TableCell>Do rezerwacji</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {materialBatches.map((batch) => {
                          const selectedBatch = selectedMaterialBatches.find(b => b.batchId === batch.id);
                          const selectedQuantity = selectedBatch ? selectedBatch.quantity : 0;
                          const isReservedForTask = task.materialBatches && 
                                                   task.materialBatches[materialId] && 
                                                   task.materialBatches[materialId].some(b => b.batchId === batch.id);
                          const effectiveQuantity = batch.effectiveQuantity || 0;
                          const reservedByOthers = batch.reservedByOthers || 0;
                          
                          return (
                            <TableRow key={batch.id}>
                              <TableCell>
                                {batch.batchNumber || batch.lotNumber || 'Bez numeru'}
                                {isReservedForTask && (
                                  <Chip 
                                    label="Zarezerwowana" 
                                    color="primary" 
                                    size="small" 
                                    sx={{ ml: 1 }} 
                                    variant="outlined" 
                                  />
                                )}
                              </TableCell>
                              <TableCell>
                                {batch.warehouseInfo ? batch.warehouseInfo.name : 'Magazyn główny'}
                              </TableCell>
                              <TableCell>
                                {batch.expiryDate ? formatDate(batch.expiryDate) : 'Brak'}
                              </TableCell>
                              <TableCell>
                                {parseFloat(batch.quantity).toFixed(3)} {material.unit}
                                {reservedByOthers > 0 && (
                                  <Typography variant="caption" color="error" display="block">
                                    Zarezerwowane: {parseFloat(reservedByOthers).toFixed(3)} {material.unit}
                                  </Typography>
                                )}
                                <Typography variant="caption" color={effectiveQuantity > 0 ? "success" : "error"} display="block">
                                  Dostępne: {parseFloat(effectiveQuantity).toFixed(3)} {material.unit}
                                </Typography>
                              </TableCell>
                              <TableCell>
                                {batch.unitPrice ? `${parseFloat(batch.unitPrice).toFixed(4)} €` : '—'}
                              </TableCell>
                              <TableCell>
                                <TextField
                                  type="number"
                                  value={selectedQuantity}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value);
                                    const quantity = isNaN(value) ? 0 : Math.min(value, effectiveQuantity);
                                    handleBatchSelection(materialId, batch.id, quantity);
                                  }}
                                  onFocus={(e) => {
                                    if (selectedQuantity === 0) {
                                      e.target.select();
                                    }
                                  }}
                                  onBlur={(e) => {
                                    if (e.target.value === '' || e.target.value === null) {
                                      handleBatchSelection(materialId, batch.id, 0);
                                    }
                                  }}
                                  onWheel={(e) => e.target.blur()}
                                  inputProps={{ 
                                    min: 0, 
                                    max: effectiveQuantity,
                                    step: 'any'
                                  }}
                                  size="small"
                                  sx={width130}
                                  error={effectiveQuantity <= 0}
                                  helperText={effectiveQuantity <= 0 ? "Brak dostępnej ilości" : ""}
                                  disabled={effectiveQuantity <= 0}
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </>
              )}
              
              <Box sx={mt3}>
                <Typography variant="subtitle2" gutterBottom>Oczekiwane zamówienia:</Typography>
                {awaitingOrdersLoading ? (
                  <Box sx={{ ...loadingContainer, p: 2 }}>
                    <CircularProgress size={24} />
                  </Box>
                ) : (
                  <>
                    {awaitingOrders[materialId] && awaitingOrders[materialId].length > 0 ? (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Nr zamówienia</TableCell>
                              <TableCell>Status</TableCell>
                              <TableCell>Zamówione</TableCell>
                              <TableCell>Otrzymane</TableCell>
                              <TableCell>Cena jednostkowa</TableCell>
                              <TableCell>Data zamówienia</TableCell>
                              <TableCell>Oczekiwana dostawa</TableCell>
                              <TableCell>Akcje</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {awaitingOrders[materialId].flatMap(order => 
                              order.items ? order.items.map(item => ({ ...item, orderData: order })) : []
                            ).map((item, index) => {
                              const order = item.orderData;
                              const statusText = (() => {
                                switch(order.status) {
                                  case 'pending': return 'Oczekujące';
                                  case 'approved': return 'Zatwierdzone';
                                  case 'ordered': return 'Zamówione';
                                  case 'partial': return 'Częściowo dostarczone';
                                  case 'confirmed': return 'Potwierdzone';
                                  default: return order.status;
                                }
                              })();
                              
                              const statusColor = (() => {
                                switch(order.status) {
                                  case 'pending': return '#757575';
                                  case 'approved': return '#ffeb3b';
                                  case 'ordered': return '#1976d2';
                                  case 'partial': return '#81c784';
                                  case 'confirmed': return '#4caf50';
                                  default: return '#757575';
                                }
                              })();

                              return (
                                <TableRow key={`${order.id}-${index}`}>
                                  <TableCell>{order.number || order.poNumber || '-'}</TableCell>
                                  <TableCell>
                                    <Chip 
                                      label={statusText} 
                                      size="small"
                                      sx={{
                                        backgroundColor: statusColor,
                                        color: order.status === 'approved' ? 'black' : 'white'
                                      }}
                                    />
                                  </TableCell>
                                  <TableCell align="right">
                                    {item.quantityOrdered || item.quantity || '-'} {item.unit || ''}
                                  </TableCell>
                                  <TableCell align="right">
                                    {item.quantityReceived || '0'} {item.unit || ''}
                                  </TableCell>
                                  <TableCell align="right">
                                    {(() => {
                                      if (!item.unitPrice) return '-';
                                      const price = parseFloat(item.unitPrice);
                                      return !isNaN(price) ? `${price.toFixed(2)} EUR` : '-';
                                    })()}
                                  </TableCell>
                                  <TableCell>
                                    {formatOrderDate(order.orderDate || order.createdAt)}
                                  </TableCell>
                                  <TableCell>
                                    {formatOrderDate(item.expectedDeliveryDate || order.expectedDeliveryDate) || 'Nie określono'}
                                  </TableCell>
                                  <TableCell>
                                    <IconButton
                                      component={Link}
                                      to={`/purchase-orders/${order.id}`}
                                      size="small"
                                      color="primary"
                                      title="Przejdź do zamówienia"
                                    >
                                      <ArrowForwardIcon />
                                    </IconButton>
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Typography variant="body2" color="textSecondary">
                        Brak oczekujących zamówień dla tego materiału
                      </Typography>
                    )}
                  </>
                )}
              </Box>
                  
              <Box sx={flexEndMt2}>
                <Button 
                  variant="contained" 
                  color="primary"
                  size="small"
                  disabled={!isComplete || reservingMaterials || (isAlreadyReserved && reservationMethod !== 'manual')}
                  onClick={() => handleReserveMaterials(materialId)}
                >
                  {isAlreadyReserved ? 'Zaktualizuj rezerwację' : 'Rezerwuj ten materiał'}
                </Button>
              </Box>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
});

ManualBatchSelection.displayName = 'ManualBatchSelection';
export default ManualBatchSelection;
