import React from 'react';
import {
  Grid,
  Card,
  CardHeader,
  CardContent,
  Divider,
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Chip,
  Paper,
  Alert
} from '@mui/material';
import { loadingContainer, mb1, mt2 } from '../../../../styles/muiCommonStyles';

const CmrItemsWeightsTab = ({ cmrData, linkedOrders, itemsWeightDetails, weightDetailsLoading, weightSummary, t }) => {
  return (
    <Grid container spacing={3}>
      {/* Elementy dokumentu CMR */}
      <Grid item xs={12}>
        <Card>
          <CardHeader
            title={t('details.items.title')}
            titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
            sx={{ pb: 1 }}
          />
          <Divider />
          <CardContent>
            {weightDetailsLoading ? (
              <Box sx={loadingContainer}>
                <CircularProgress />
                <Typography variant="body1" sx={{ ml: 2 }}>
                  {t('details.loading.weights')}
                </Typography>
              </Box>
            ) : cmrData.items && cmrData.items.length > 0 ? (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Lp.</TableCell>
                      <TableCell>{t('details.items.description')}</TableCell>
                      <TableCell>Zamówienie</TableCell>
                      <TableCell>Pozycja CO</TableCell>
                      <TableCell>{t('details.items.quantity')}</TableCell>
                      <TableCell>{t('details.items.unit')}</TableCell>
                      <TableCell>{t('details.items.weight')}</TableCell>
                      <TableCell>{t('details.palletDetails.title')}</TableCell>
                      <TableCell>{t('details.boxDetails.title')}</TableCell>
                      <TableCell>{t('details.items.weightDetails')}</TableCell>
                      <TableCell>{t('details.items.batchInfo')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {cmrData.items.map((item, index) => {
                      const weightDetail = itemsWeightDetails.find(detail =>
                        detail.itemId === (item.id || item.description)
                      );

                      const linkedOrder = item.orderId ? linkedOrders.find(o => o.id === item.orderId) : null;
                      const orderItem = linkedOrder && item.orderItemId ?
                        linkedOrder.items?.find(oi => oi.id === item.orderItemId) : null;

                      return (
                        <TableRow key={item.id || index}>
                          <TableCell>{index + 1}</TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                              {item.description}
                              {item.isEco === true && (
                                <Chip label="ECO" size="small" color="success" variant="outlined" sx={{ fontSize: '0.65rem', height: 18, ml: 0.5 }} />
                              )}
                              {item.isEco === false && item.orderNumber && (
                                <Chip label="STD" size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 18, ml: 0.5 }} />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                              {item.orderNumber || linkedOrder?.orderNumber ||
                                <em style={{ color: '#999' }}>Brak przypisania</em>
                              }
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                              {item.orderItemName || orderItem?.name || (item.originalOrderItem?.name) ||
                                <em style={{ color: '#999' }}>-</em>
                              }
                            </Typography>
                          </TableCell>
                          <TableCell>
                            {item.quantity}
                            {item.orderItemTotalQuantity && (
                              <Typography variant="caption" display="block" color="text.secondary">
                                z {item.orderItemTotalQuantity} {item.unit || 'szt.'} zamówionych
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>{item.unit}</TableCell>
                          <TableCell>{item.weight}</TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box>
                                <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                  {weightDetail?.palletsCount || 0}
                                </Typography>
                                {item.volume && (
                                  <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                                    ({item.volume} m³)
                                  </Typography>
                                )}
                              </Box>
                              {weightDetail?.hasDetailedData && (
                                <Chip
                                  size="small"
                                  color="success"
                                  label="✓"
                                  sx={{ height: 20, minWidth: 20 }}
                                />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                {weightDetail?.boxesCount || 0}
                              </Typography>
                              {weightDetail?.hasDetailedData && (
                                <Chip
                                  size="small"
                                  color="success"
                                  label="✓"
                                  sx={{ height: 20, minWidth: 20 }}
                                />
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            {weightDetail?.hasDetailedData ? (
                              <Box>
                                {weightDetail.pallets && weightDetail.pallets.length > 0 && (
                                  <Box sx={mb1}>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                      {t('details.palletDetails.title')}:
                                    </Typography>
                                    {weightDetail.pallets.map((pallet, palletIndex) => (
                                      <Typography key={palletIndex} variant="caption" display="block" sx={{ fontSize: '0.75rem' }}>
                                        #{pallet.palletNumber}: {pallet.totalWeight} kg
                                        ({pallet.boxesCount} kart., {pallet.itemsCount} szt.)
                                        {!pallet.isFull && ' (niepełna)'}
                                      </Typography>
                                    ))}
                                  </Box>
                                )}

                                {weightDetail.hasBoxes && weightDetail.boxes && (weightDetail.boxes.fullBox || weightDetail.boxes.partialBox) && (
                                  <Box>
                                    <Typography variant="caption" sx={{ fontWeight: 'bold', color: 'secondary.main' }}>
                                      {t('details.boxDetails.title')}:
                                    </Typography>
                                    {weightDetail.boxes.fullBox && (
                                      <Typography variant="caption" display="block" sx={{ fontSize: '0.75rem' }}>
                                        Pełny: {weightDetail.boxes.fullBox.totalWeight} kg
                                        ({weightDetail.boxes.fullBox.itemsCount} szt.)
                                        {weightDetail.boxes.fullBoxesCount > 1 && ` ×${weightDetail.boxes.fullBoxesCount}`}
                                      </Typography>
                                    )}
                                    {weightDetail.boxes.partialBox && (
                                      <Typography variant="caption" display="block" sx={{ fontSize: '0.75rem' }}>
                                        Niepełny: {weightDetail.boxes.partialBox.totalWeight} kg
                                        ({weightDetail.boxes.partialBox.itemsCount} szt.)
                                      </Typography>
                                    )}
                                  </Box>
                                )}

                                {weightDetail.inventoryData && (
                                  <Typography variant="caption" display="block" sx={{
                                    fontSize: '0.7rem',
                                    color: 'text.secondary',
                                    mt: 0.5
                                  }}>
                                    {weightDetail.hasBoxes ? (
                                      `${weightDetail.inventoryData.itemsPerBox} szt./karton, ${weightDetail.inventoryData.boxesPerPallet} kart./paleta`
                                    ) : (
                                      'Pozycja bez kartonów - pakowanie bezpośrednio na palety'
                                    )}
                                  </Typography>
                                )}
                              </Box>
                            ) : (
                              <Typography variant="caption" sx={{
                                fontStyle: 'italic',
                                color: 'warning.main',
                                fontSize: '0.75rem'
                              }}>
                                {weightDetail?.error ?
                                  `Błąd: ${weightDetail.error}` :
                                  'Brak danych magazynowych'
                                }
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            {item.linkedBatches && item.linkedBatches.length > 0 ? (
                              <Box>
                                {item.linkedBatches.map((batch, batchIndex) => (
                                  <Typography key={batch.id} variant="body2" sx={{ fontSize: '0.9rem' }}>
                                    {batch.batchNumber || batch.lotNumber || '-'}
                                    ({batch.quantity} {batch.unit || t('common:common.pieces')})
                                    {batchIndex < item.linkedBatches.length - 1 ? '; ' : ''}
                                  </Typography>
                                ))}
                              </Box>
                            ) : (
                              <Typography variant="body2" sx={{ fontSize: '0.9rem', fontStyle: 'italic' }}>
                                Brak powiązanych partii
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography variant="body1" sx={{ textAlign: 'center', py: 2 }}>
                {t('details.items.noItems')}
              </Typography>
            )}
          </CardContent>
        </Card>
      </Grid>

      {/* Podsumowanie wag CMR */}
      {weightSummary && (weightSummary.totalPallets > 0 || weightSummary.totalBoxes > 0) && (
        <Grid item xs={12}>
          <Card>
            <CardHeader
              title={t('details.weightSummary.title')}
              titleTypographyProps={{ variant: 'h6', fontWeight: 600 }}
              sx={{ pb: 1 }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                  <Paper sx={{
                    p: 2,
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'info.dark' : 'info.light',
                    border: 1,
                    borderColor: 'info.main'
                  }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1, color: 'info.main' }}>
                      {t('details.weightSummary.totalSummary')}
                    </Typography>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2">{t('details.weightSummary.totalWeight')}:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          {weightSummary.totalWeight} kg
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2">{t('details.weightSummary.totalPallets')}:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          {weightSummary.totalPallets}
                        </Typography>
                      </Box>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2">{t('details.weightSummary.totalBoxes')}:</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                          {weightSummary.totalBoxes}
                        </Typography>
                      </Box>
                    </Box>
                  </Paper>
                </Grid>

                <Grid item xs={12} md={8}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 'bold', mb: 2 }}>
                    {t('details.weightSummary.detailedBreakdown')}
                  </Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ bgcolor: (theme) => theme.palette.mode === 'dark' ? 'background.paper' : 'grey.50' }}>
                          <TableCell sx={{ fontWeight: 'bold' }}>{t('details.weightSummary.position')}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>{t('details.weightSummary.weight')}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>{t('details.weightSummary.pallets')}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>{t('details.weightSummary.boxes')}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>{t('details.weightSummary.dataStatus')}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {weightSummary.itemsBreakdown.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                {item.description}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {item.quantity} {item.unit}
                                {item.orderItemTotalQuantity && (
                                  <> (z {item.orderItemTotalQuantity} zamówionych)</>
                                )}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                {item.weight}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {item.palletsCount}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {item.boxesCount}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                label={item.hasDetailedData ? t('details.weightSummary.detailed') : t('details.weightSummary.basic')}
                                color={item.hasDetailedData ? 'success' : 'warning'}
                                variant={item.hasDetailedData ? 'filled' : 'outlined'}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Grid>
              </Grid>

              <Alert severity="info" sx={mt2}>
                <Typography variant="body2">
                  <strong>{t('details.calculationInfo.title')}</strong><br />
                  • {t('details.calculationInfo.detailedAvailable')}<br />
                  • {t('details.calculationInfo.weightsInclude')}<br />
                  • {t('details.calculationInfo.basicOnly')}
                </Typography>
              </Alert>
            </CardContent>
          </Card>
        </Grid>
      )}
    </Grid>
  );
};

export default CmrItemsWeightsTab;
