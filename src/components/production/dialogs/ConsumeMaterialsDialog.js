import React, { memo } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
  Box,
  Alert,
  TextField,
  Typography,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Checkbox
} from '@mui/material';

const ConsumeMaterialsDialog = memo(({
  open,
  onClose,
  onConfirm,
  materials = [],
  task,
  selectedBatchesToConsume = {},
  consumeQuantities = {},
  consumeErrors = {},
  loading = false,
  onBatchSelectionChange,
  onQuantityChange
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="lg"
      fullWidth
    >
      <DialogTitle>Konsumuj materiały</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          Wybierz partie materiałów i ilości, które chcesz skonsumować. Konsumpcja zmniejszy dostępną ilość w magazynie.
        </DialogContentText>

        {materials.length === 0 ? (
          <Alert severity="info">
            Brak zarezerwowanych materiałów do konsumpcji.
          </Alert>
        ) : (
          materials.map((material) => {
            const materialId = material.inventoryItemId || material.id;
            const reservedBatches = task?.materialBatches?.[materialId] || [];

            return (
              <Box key={materialId} sx={{ mb: 3 }}>
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
                                onChange={(e) => onBatchSelectionChange(materialId, batch.batchId, e.target.checked)}
                              />
                            </TableCell>
                            <TableCell>{batch.batchNumber}</TableCell>
                            <TableCell>{batch.quantity} {material.unit}</TableCell>
                            <TableCell>
                              <TextField
                                type="number"
                                value={consumeQuantities[batchKey] || 0}
                                onChange={(e) => onQuantityChange(materialId, batch.batchId, e.target.value)}
                                onFocus={(e) => {
                                  if ((consumeQuantities[batchKey] || 0) === 0) {
                                    e.target.select();
                                  }
                                }}
                                onBlur={(e) => {
                                  if (e.target.value === '' || e.target.value === null) {
                                    onQuantityChange(materialId, batch.batchId, 0);
                                  }
                                }}
                                onWheel={(e) => e.target.blur()}
                                disabled={!isSelected}
                                error={Boolean(consumeErrors[batchKey])}
                                helperText={consumeErrors[batchKey]}
                                inputProps={{ min: 0, max: batch.quantity, step: 'any' }}
                                size="small"
                                sx={{ width: 140 }}
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
        <Button onClick={onClose} disabled={loading}>
          Anuluj
        </Button>
        <Button
          onClick={onConfirm}
          variant="contained"
          color="warning"
          disabled={loading || materials.length === 0}
          startIcon={loading ? <CircularProgress size={20} /> : null}
        >
          {loading ? 'Konsumowanie...' : 'Konsumuj materiały'}
        </Button>
      </DialogActions>
    </Dialog>
  );
});

ConsumeMaterialsDialog.displayName = 'ConsumeMaterialsDialog';

export default ConsumeMaterialsDialog;
