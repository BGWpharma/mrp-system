/**
 * Komponent do ręcznego wyboru partii materiałów do rezerwacji
 * Wydzielony z TaskDetailsPage.js dla lepszej organizacji kodu
 */

import React, { memo, useMemo } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Button,
  Chip,
  Checkbox,
  FormControlLabel,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { formatDate } from '../../../utils/formatting';
import { getConsumedQuantityForMaterial } from '../../../utils/productionUtils';

const ManualBatchSelectionContent = memo(({
  task,
  materials,
  batches,
  selectedBatches,
  materialQuantities,
  expandedMaterial,
  setExpandedMaterial,
  showExhaustedBatches,
  setShowExhaustedBatches,
  materialBatchesLoading,
  onRefreshBatches,
  onBatchSelection,
  getRequiredQuantityForReservation
}) => {
  if (materialBatchesLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ mt: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle1">
          Wybierz partie dla każdego materiału:
        </Typography>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={showExhaustedBatches}
                onChange={(e) => setShowExhaustedBatches(e.target.checked)}
                size="small"
              />
            }
            label="Pokaż wyczerpane partie"
            sx={{ fontSize: '0.875rem' }}
          />
          <Button
            variant="outlined"
            size="small"
            startIcon={<RefreshIcon />}
            onClick={onRefreshBatches}
            disabled={materialBatchesLoading}
            sx={{ minWidth: 'auto' }}
          >
            Odśwież partie
          </Button>
        </Box>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        💡 Możesz zarezerwować mniejszą ilość niż wymagana. Niezarezerwowane materiały można uzupełnić później.
      </Typography>
      
      {(materials || []).map((material) => {
        const materialId = material.inventoryItemId || material.id;
        if (!materialId) return null;
        
        // Oblicz wymaganą ilość do rezerwacji uwzględniając skonsumowane materiały
        const baseQuantity = materialQuantities[materialId] !== undefined 
          ? materialQuantities[materialId] 
          : material.quantity;
        const consumedQuantity = getConsumedQuantityForMaterial(task.consumedMaterials, materialId);
        const requiredQuantity = getRequiredQuantityForReservation(material, materialId);
        
        let materialBatches = batches[materialId] || [];
        
        // Filtruj wyczerpane partie jeśli opcja jest wyłączona
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
        
        // Sortuj partie
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
              <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                <Box>
                  <Typography>{material.name}</Typography>
                  {consumedQuantity > 0 && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      Skonsumowano: {consumedQuantity.toFixed(3)} {material.unit} z {baseQuantity.toFixed(3)} {material.unit}
                    </Typography>
                  )}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <Chip
                    label={`${totalSelectedQuantity.toFixed(3)} / ${parseFloat(requiredQuantity).toFixed(3)} ${material.unit}`}
                    color={isComplete ? "success" : requiredQuantity > 0 ? "warning" : "default"}
                    size="small"
                    sx={{ mr: 1 }}
                  />
                  {requiredQuantity <= 0 && task.materialConsumptionConfirmed && (
                    <Chip label="W pełni skonsumowany" color="success" size="small" sx={{ mr: 1 }} />
                  )}
                  {totalSelectedQuantity > 0 && totalSelectedQuantity < requiredQuantity && requiredQuantity > 0 && (
                    <Chip label="Częściowa rezerwacja" color="warning" size="small" sx={{ mr: 1 }} variant="outlined" />
                  )}
                  {isAlreadyReserved && (
                    <Chip label="Zarezerwowany" color="primary" size="small" sx={{ mr: 1 }} />
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
                                  <Chip label="Zarezerwowana" color="primary" size="small" sx={{ ml: 1 }} variant="outlined" />
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
                                <Typography variant="caption" color={effectiveQuantity > 0 ? "success.main" : "error"} display="block">
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
                                    onBatchSelection(materialId, batch.id, quantity);
                                  }}
                                  onFocus={(e) => {
                                    if (selectedQuantity === 0) {
                                      e.target.select();
                                    }
                                  }}
                                  onBlur={(e) => {
                                    if (e.target.value === '' || e.target.value === null) {
                                      onBatchSelection(materialId, batch.id, 0);
                                    }
                                  }}
                                  onWheel={(e) => e.target.blur()}
                                  inputProps={{ 
                                    min: 0, 
                                    max: effectiveQuantity,
                                    step: 'any'
                                  }}
                                  size="small"
                                  sx={{ width: '100px' }}
                                  disabled={effectiveQuantity <= 0 && !isReservedForTask}
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
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
});

ManualBatchSelectionContent.displayName = 'ManualBatchSelectionContent';

export default ManualBatchSelectionContent;

