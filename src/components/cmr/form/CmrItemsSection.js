import React from 'react';
import {
  Grid,
  TextField,
  Typography,
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Divider,
  IconButton,
  FormHelperText,
  Chip,
  Alert
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import LinkIcon from '@mui/icons-material/Link';
import { Calculate as CalculateIcon } from '@mui/icons-material';

const CmrItemsSection = React.memo(({
  formData,
  formErrors,
  handleItemChange,
  addItem,
  removeItem,
  handleOpenBatchSelector,
  handleRefreshInventoryData,
  handleRemoveBatch,
  handleOpenWeightCalculator,
  linkedOrders,
  availableOrderItems,
  onOpenOrderItemsSelector,
  collapsedItems,
  toggleItemCollapse,
  weightSummary,
  mode,
  t,
  ItemWeightSummary
}) => {
  return (
    <>
      {/* Items list */}
      <Grid item xs={12}>
        <Card>
          <CardHeader
            title="Elementy dokumentu CMR"
            titleTypographyProps={{ variant: 'h6' }}
            action={
              <Box sx={{ display: 'flex', gap: 1 }}>
                {linkedOrders.length > 0 && availableOrderItems.length > 0 && (
                  <Button
                    startIcon={<LinkIcon />}
                    onClick={onOpenOrderItemsSelector}
                    color="secondary"
                    variant="outlined"
                  >
                    Dodaj z zamówienia
                  </Button>
                )}
                <Button
                  startIcon={<AddIcon />}
                  onClick={addItem}
                  color="primary"
                >
                  Dodaj pozycję
                </Button>
              </Box>
            }
          />
          <Divider />
          <CardContent>
            {formData.items.map((item, index) => (
              <Box key={index} sx={{ mb: 3, p: 2, borderRadius: 1, bgcolor: 'background.default' }}>
                <Grid container spacing={2} alignItems="center">
                  <Grid item xs={12}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2">
                        Pozycja {index + 1}
                      </Typography>
                      {formData.items.length > 1 && (
                        <IconButton
                          color="error"
                          onClick={() => removeItem(index)}
                          size="small"
                        >
                          <DeleteIcon />
                        </IconButton>
                      )}
                    </Box>
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      label="Opis towaru"
                      value={item.description}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      fullWidth
                      error={formErrors.items && formErrors.items[index]?.description}
                      helperText={formErrors.items && formErrors.items[index]?.description}
                    />
                    {item.suggestedInventoryItem && item.matchedRecipe && (
                      <Alert severity="info" sx={{ mt: 1, fontSize: '0.8rem' }}>
                        🎯 Sugerowana pozycja magazynowa: <strong>{item.suggestedInventoryItem.name}</strong>
                        (na podstawie receptury: <em>{item.matchedRecipe.name}</em>)
                      </Alert>
                    )}
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label={t('common:common.quantity')}
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      fullWidth
                      type="number"
                      error={formErrors.items && formErrors.items[index]?.quantity}
                      helperText={formErrors.items && formErrors.items[index]?.quantity}
                    />
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <TextField
                      label="Jednostka"
                      value={item.unit}
                      onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                      fullWidth
                      error={formErrors.items && formErrors.items[index]?.unit}
                      helperText={formErrors.items && formErrors.items[index]?.unit}
                    />
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
                      <TextField
                        label="Waga (kg)"
                        value={item.weight}
                        onChange={(e) => handleItemChange(index, 'weight', e.target.value)}
                        fullWidth
                        type="number"
                        InputProps={{
                          endAdornment: (
                            <IconButton
                              size="small"
                              onClick={() => handleOpenWeightCalculator(index)}
                              title={t('form.calculateWeightFromInventory')}
                              sx={{
                                color: 'primary.main',
                                '&:hover': { bgcolor: (theme) => theme.palette.mode === 'dark' ? 'primary.dark' : 'primary.light' }
                              }}
                            >
                              <CalculateIcon fontSize="small" />
                            </IconButton>
                          )
                        }}
                      />
                    </Box>
                  </Grid>

                  <Grid item xs={12} sm={6} md={2}>
                    <TextField
                      label={t('form.palletCount')}
                      value={item.palletsCount || 0}
                      disabled
                      fullWidth
                      type="number"
                      InputProps={{
                        readOnly: true,
                      }}
                      helperText="Obliczone automatycznie"
                      sx={{
                        '& .MuiInputBase-input.Mui-disabled': {
                          WebkitTextFillColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.7)' : 'rgba(0, 0, 0, 0.6)',
                        }
                      }}
                    />
                  </Grid>

                  <Grid item xs={12} sm={6} md={2}>
                    <TextField
                      label={t('form.volumeM3')}
                      value={item.volume}
                      onChange={(e) => handleItemChange(index, 'volume', e.target.value)}
                      fullWidth
                      type="number"
                    />
                  </Grid>

                  <Grid item xs={12}>
                    <TextField
                      label="Uwagi"
                      value={item.notes}
                      onChange={(e) => handleItemChange(index, 'notes', e.target.value)}
                      fullWidth
                      multiline
                      rows={2}
                    />
                  </Grid>

                  {/* Batch linking */}
                  <Grid item xs={12}>
                    <Box sx={{ mt: 2 }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          Powiązane partie magazynowe
                        </Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<LinkIcon />}
                            onClick={() => handleOpenBatchSelector(index)}
                          >
                            Wybierz partie
                          </Button>
                          {item.linkedBatches && item.linkedBatches.length > 0 && (
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<RefreshIcon />}
                              onClick={() => handleRefreshInventoryData(index)}
                              color="secondary"
                              title={t('form.refreshInventoryParams')}
                            >
                              Odśwież
                            </Button>
                          )}
                        </Box>
                      </Box>

                      {item.linkedBatches && item.linkedBatches.length > 0 ? (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mt: 1 }}>
                          {item.linkedBatches.map((batch) => (
                            <Chip
                              key={batch.id}
                              label={`${batch.batchNumber || batch.lotNumber || 'Bez numeru'} (${batch.quantity} ${batch.unit || 'szt.'})`}
                              variant="outlined"
                              size="small"
                              onDelete={() => handleRemoveBatch(index, batch.id)}
                              color="primary"
                            />
                          ))}
                        </Box>
                      ) : (
                        <Typography
                          variant="body2"
                          color={formErrors.items && formErrors.items[index]?.linkedBatches ? "error" : "text.secondary"}
                          sx={{ fontStyle: 'italic' }}
                        >
                          {formErrors.items && formErrors.items[index]?.linkedBatches
                            ? formErrors.items[index].linkedBatches
                            : 'Brak powiązanych partii'
                          }
                        </Typography>
                      )}

                      {formErrors.items && formErrors.items[index]?.linkedBatches && (
                        <FormHelperText error sx={{ mt: 1 }}>
                          {formErrors.items[index].linkedBatches}
                        </FormHelperText>
                      )}
                    </Box>
                  </Grid>

                  {ItemWeightSummary && (
                    <ItemWeightSummary
                      item={item}
                      itemIndex={index}
                      isCollapsed={collapsedItems.has(index)}
                      onToggleCollapse={() => toggleItemCollapse(index)}
                    />
                  )}
                </Grid>
              </Box>
            ))}
          </CardContent>
        </Card>
      </Grid>

      {/* Weight summary */}
      {formData.items.length > 0 && (
        <Grid item xs={12}>
          <Card>
            <CardHeader
              title={t('form.generalSummary')}
              titleTypographyProps={{ variant: 'h6' }}
            />
            <Divider />
            <CardContent>
              <Grid container spacing={3}>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{
                    p: 2,
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'primary.dark' : 'primary.light',
                    borderRadius: 1,
                    textAlign: 'center'
                  }}>
                    <Typography
                      variant="h6"
                      sx={{
                        color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#0d47a1',
                        fontWeight: 600
                      }}
                      gutterBottom
                    >
                      Całkowita waga
                    </Typography>
                    <Typography
                      variant="h4"
                      sx={{
                        color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#0d47a1',
                        fontWeight: 700
                      }}
                    >
                      {weightSummary.totalWeight} kg
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{
                    p: 2,
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'success.dark' : 'success.light',
                    borderRadius: 1,
                    textAlign: 'center'
                  }}>
                    <Typography
                      variant="h6"
                      sx={{
                        color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#1b5e20',
                        fontWeight: 600
                      }}
                      gutterBottom
                    >
                      Łączna liczba palet
                    </Typography>
                    <Typography
                      variant="h4"
                      sx={{
                        color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#1b5e20',
                        fontWeight: 700
                      }}
                    >
                      {weightSummary.totalPallets}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{
                    p: 2,
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'info.dark' : 'info.light',
                    borderRadius: 1,
                    textAlign: 'center'
                  }}>
                    <Typography
                      variant="h6"
                      sx={{
                        color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#01579b',
                        fontWeight: 600
                      }}
                      gutterBottom
                    >
                      Liczba pozycji
                    </Typography>
                    <Typography
                      variant="h4"
                      sx={{
                        color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#01579b',
                        fontWeight: 700
                      }}
                    >
                      {formData.items.length}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{
                    p: 2,
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'warning.dark' : 'warning.light',
                    borderRadius: 1,
                    textAlign: 'center'
                  }}>
                    <Typography
                      variant="h6"
                      sx={{
                        color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#e65100',
                        fontWeight: 600
                      }}
                      gutterBottom
                    >
                      Pozycje z danymi
                    </Typography>
                    <Typography
                      variant="h4"
                      sx={{
                        color: (theme) => theme.palette.mode === 'dark' ? '#fff' : '#e65100',
                        fontWeight: 700
                      }}
                    >
                      {weightSummary.itemsWeightBreakdown.filter(item => item.hasDetailedData).length}
                    </Typography>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>
      )}
    </>
  );
});

CmrItemsSection.displayName = 'CmrItemsSection';

export default CmrItemsSection;
