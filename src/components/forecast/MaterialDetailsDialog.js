import React, { memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Box, Typography, Grid, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Paper
} from '@mui/material';
import ShoppingCartIcon from '@mui/icons-material/ShoppingCart';

const MaterialDetailsDialog = memo(({
  open,
  onClose,
  material,
  tasks = [],
  formatNumber,
  formatDateDisplay,
  t
}) => {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t('forecast.materialDetails')}</DialogTitle>
      <DialogContent>
        {material && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="h6">{material.name}</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              {t('forecast.category')}: {material.category}
            </Typography>

            <Grid container spacing={2} sx={{ mb: 3 }}>
              <Grid item xs={6} md={3}>
                <Typography variant="body2" color="text.secondary">{t('forecast.details.availableQuantity')}:</Typography>
                <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                  {formatNumber(material.availableQuantity)} {material.unit}
                </Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="body2" color="text.secondary">{t('forecast.details.requiredQuantity')}:</Typography>
                <Typography variant="body1" sx={{ fontWeight: 'medium' }}>
                  {formatNumber(material.requiredQuantity)} {material.unit}
                </Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="body2" color="text.secondary">{t('forecast.details.alreadyConsumed')}:</Typography>
                <Typography variant="body1" sx={{ fontWeight: 'medium', color: 'info.main' }}>
                  {formatNumber(material.consumedQuantity || 0)} {material.unit}
                </Typography>
              </Grid>
              <Grid item xs={6} md={3}>
                <Typography variant="body2" color="text.secondary">{t('forecast.details.balance')}:</Typography>
                <Typography variant="body1" sx={{ fontWeight: 'medium' }} color={material.balance < 0 ? 'error.main' : 'success.main'}>
                  {formatNumber(material.balance)} {material.unit}
                </Typography>
              </Grid>
            </Grid>

            {material.futureDeliveries && material.futureDeliveries.length > 0 && (
              <>
                <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                  {t('forecast.expectedDeliveriesDetails', { total: formatNumber(material.futureDeliveriesTotal), unit: material.unit })}
                </Typography>
                <TableContainer component={Paper} variant="outlined" sx={{ mb: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('forecast.poNumber')}</TableCell>
                        <TableCell>{t('forecast.details.supplier')}</TableCell>
                        <TableCell>{t('forecast.table.status')}</TableCell>
                        <TableCell align="right">{t('forecast.details.quantity')}</TableCell>
                        <TableCell align="right">{t('forecast.deliveryDate')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {material.futureDeliveries.map((delivery, index) => (
                        <TableRow key={`delivery-${index}`}>
                          <TableCell>
                            <Typography
                              variant="body2"
                              sx={{ cursor: 'pointer', textDecoration: 'underline', color: 'primary.main' }}
                              onClick={() => navigate(`/purchase-orders/${delivery.poId}`)}
                            >
                              {delivery.poNumber}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" color="text.secondary">
                              {delivery.supplierName || t('forecast.details.noSupplier')}
                            </Typography>
                          </TableCell>
                          <TableCell>{delivery.status}</TableCell>
                          <TableCell align="right">{formatNumber(delivery.quantity)} {material.unit}</TableCell>
                          <TableCell align="right">
                            {delivery.expectedDeliveryDate && delivery.expectedDeliveryDate !== ''
                              ? formatDateDisplay(new Date(delivery.expectedDeliveryDate)) || t('forecast.noDate')
                              : t('forecast.noDate')
                            }
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}

            {material.tasks && material.tasks.length > 0 && (
              <>
                <Typography variant="subtitle1" sx={{ mt: 2, mb: 1 }}>
                  {t('forecast.tasksUsingMaterial')}
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('forecast.taskName')}</TableCell>
                        <TableCell>{t('forecast.moNumber')}</TableCell>
                        <TableCell align="right">{t('forecast.productQuantity')}</TableCell>
                        <TableCell align="right">{t('forecast.materialPerUnit')}</TableCell>
                        <TableCell align="right">{t('forecast.executionDate')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {material.tasks.map(taskId => {
                        const task = tasks.find(t => t.id === taskId);
                        if (!task) return null;

                        const materialInTask = task.materials?.find(m => m.id === material.id);
                        const actualMaterialUsage = task.actualMaterialUsage || {};
                        const materialId = materialInTask?.id || material.id;
                        const inventoryItemId = materialInTask?.inventoryItemId;
                        const actualTotalQuantity = actualMaterialUsage[materialId] ?? actualMaterialUsage[inventoryItemId];
                        const quantityPerUnit = actualTotalQuantity !== undefined
                          ? parseFloat(actualTotalQuantity)
                          : (materialInTask?.quantity || 0);

                        return (
                          <TableRow key={taskId}>
                            <TableCell>
                              <Link
                                to={`/production/tasks/${taskId}`}
                                style={{ cursor: 'pointer', textDecoration: 'underline', color: 'inherit' }}
                              >
                                <Typography variant="body2" sx={{ color: 'primary.main' }}>
                                  {task.name}
                                </Typography>
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" color="text.secondary">
                                {task.moNumber || task.orderNumber || '-'}
                              </Typography>
                            </TableCell>
                            <TableCell align="right">{formatNumber(task.quantity || 0)}</TableCell>
                            <TableCell align="right">{formatNumber(quantityPerUnit)} {material.unit}</TableCell>
                            <TableCell align="right">
                              {task.scheduledDate && task.scheduledDate !== ''
                                ? (() => {
                                    try {
                                      let taskDate;
                                      if (task.scheduledDate?.toDate) {
                                        taskDate = task.scheduledDate.toDate();
                                      } else if (typeof task.scheduledDate === 'string') {
                                        taskDate = new Date(task.scheduledDate);
                                      } else if (task.scheduledDate instanceof Date) {
                                        taskDate = task.scheduledDate;
                                      } else {
                                        return t('forecast.noDate');
                                      }
                                      return formatDateDisplay(taskDate) || t('forecast.noDate');
                                    } catch (error) {
                                      return t('forecast.noDate');
                                    }
                                  })()
                                : t('forecast.noDate')
                              }
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}

            {material.balance < 0 && (
              <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  color="primary"
                  startIcon={<ShoppingCartIcon />}
                  onClick={() => {
                    navigate('/purchase-orders/new', {
                      state: { materialId: material.id, requiredQuantity: Math.abs(material.balance) }
                    });
                    onClose();
                  }}
                >
                  {t('forecast.orderMaterial')}
                </Button>
              </Box>
            )}
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('forecast.close')}</Button>
      </DialogActions>
    </Dialog>
  );
});

MaterialDetailsDialog.displayName = 'MaterialDetailsDialog';

export default MaterialDetailsDialog;
