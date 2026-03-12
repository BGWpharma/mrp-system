import React from 'react';
import {
  Box,
  TextField,
  Typography,
  Grid,
  IconButton,
  Table,
  TableRow,
  TableCell,
  Tooltip,
  InputAdornment,
  Autocomplete,
  Chip,
  ToggleButtonGroup,
  ToggleButton,
  Collapse,
  CircularProgress
} from '@mui/material';
import {
  Delete as DeleteIcon,
  EventNote as EventNoteIcon,
  Refresh as RefreshIcon,
  KeyboardArrowDown as ExpandMoreIcon,
  KeyboardArrowUp as ExpandLessIcon,
  DragIndicator as DragIndicatorIcon
} from '@mui/icons-material';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const SortableRow = ({ 
  item, 
  index, 
  expandedRows,
  services,
  recipes,
  validationErrors,
  inputSx,
  handleItemChange,
  handleProductSelect,
  toggleExpandRow,
  refreshItemPrice,
  removeItem,
  formatCurrency,
  calculateItemTotalValue,
  calculateTotalItemsValue,
  globalDiscount,
  itemsLength,
  refreshProductionTasks,
  refreshingPTs,
  navigate,
  formatDateToDisplay,
  t
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging && {
      opacity: 0.5,
      zIndex: 1000,
    }),
  };

  return (
    <React.Fragment>
      <TableRow 
        ref={setNodeRef}
        style={style}
        sx={{ 
          '&:nth-of-type(odd)': { 
            bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : 'background.paper' 
          },
          '&:nth-of-type(even)': { 
            bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'grey.50' 
          },
          '&:hover': {
            bgcolor: 'action.hover'
          },
          ...(isDragging && {
            bgcolor: 'action.selected',
            boxShadow: 3
          })
        }}
      >
        <TableCell {...attributes} {...listeners} sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' } }}>
          <DragIndicatorIcon 
            sx={{ 
              color: 'action.active',
            }} 
          />
        </TableCell>
        
        <TableCell>
          <IconButton
            aria-label="rozwiń szczegóły"
            size="small"
            onClick={() => toggleExpandRow(index)}
          >
            {expandedRows[index] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
          </IconButton>
        </TableCell>
        
        <TableCell>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <ToggleButtonGroup
              size="small"
              value={item.itemType || (item.isRecipe ? 'recipe' : 'product')}
              exclusive
              onChange={(_, newType) => {
                if (newType !== null) {
                  handleItemChange(index, 'itemType', newType);
                }
              }}
              aria-label="typ produktu"
            >
              <ToggleButton value="product" size="small">
                Produkt
              </ToggleButton>
              <ToggleButton value="recipe" size="small">
                Receptura
              </ToggleButton>
              <ToggleButton value="service" size="small">
                {t('common:common.service')}
              </ToggleButton>
            </ToggleButtonGroup>
            
            {(item.itemType === 'service') ? (
              <Autocomplete
                options={services}
                getOptionLabel={(option) => option.name || ''}
                value={services.find(s => s.id === item.serviceId) || null}
                onChange={(_, newValue) => handleProductSelect(index, newValue, 'service')}
                renderInput={(params) => (
                  <TextField 
                    {...params} 
                    label={t('common:common.service')}
                    size="small"
                    error={!!validationErrors[`item_${index}_name`]}
                    helperText={validationErrors[`item_${index}_name`]}
                  />
                )}
              />
            ) : (item.itemType === 'recipe' || item.isRecipe) ? (
              <Autocomplete
                options={recipes}
                getOptionLabel={(option) => option.name || ''}
                value={item.recipeId ? { id: item.recipeId, name: item.name } : null}
                isOptionEqualToValue={(option, value) => option.id === value?.id}
                onChange={(_, newValue) => handleProductSelect(index, newValue, 'recipe')}
                renderInput={(params) => (
                  <TextField 
                    {...params} 
                    label="Receptura"
                    size="small"
                    error={!!validationErrors[`item_${index}_name`]}
                    helperText={validationErrors[`item_${index}_name`]}
                  />
                )}
              />
            ) : (
              <TextField
                label="Nazwa produktu"
                value={item.name}
                onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                fullWidth
                error={!!validationErrors[`item_${index}_name`]}
                helperText={validationErrors[`item_${index}_name`]}
                size="small"
                variant="outlined"
              />
            )}
          </Box>
        </TableCell>
        
        <TableCell>
          <TextField
            type="number"
            value={item.quantity}
            onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
            inputProps={{ min: 1 }}
            fullWidth
            error={!!validationErrors[`item_${index}_quantity`]}
            helperText={validationErrors[`item_${index}_quantity`]}
            size="small"
            variant="outlined"
            sx={inputSx}
          />
        </TableCell>
        
        <TableCell>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Typography 
              variant="body2" 
              sx={{ 
                color: item.producedQuantity ? 
                  (item.producedQuantity >= item.quantity ? 'success.main' : 'warning.main') 
                  : 'text.secondary',
                fontWeight: item.producedQuantity ? 'bold' : 'normal',
                fontSize: '0.875rem'
              }}
            >
              {item.producedQuantity !== undefined && item.producedQuantity !== null ? 
                parseFloat(item.producedQuantity).toFixed(2) : 
                '-'}
            </Typography>
          </Box>
        </TableCell>
        
        <TableCell>
          <TextField
            value={item.unit}
            onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
            fullWidth
            size="small"
            variant="outlined"
            sx={inputSx}
          />
        </TableCell>
        
        <TableCell>
          <TextField
            type="number"
            value={item.price}
            onChange={(e) => handleItemChange(index, 'price', e.target.value)}
            InputProps={{
              startAdornment: <InputAdornment position="start">EUR</InputAdornment>,
              endAdornment: (
                <InputAdornment position="end">
                  <Tooltip title="Odśwież cenę jednostkową">
                    <IconButton
                      aria-label="odśwież cenę"
                      onClick={() => refreshItemPrice(index)}
                      edge="end"
                      size="small"
                    >
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ),
            }}
            inputProps={{ min: 0, step: 'any' }}
            fullWidth
            error={!!validationErrors[`item_${index}_price`]}
            helperText={validationErrors[`item_${index}_price`]}
            size="small"
            variant="outlined"
            sx={inputSx}
          />
        </TableCell>
        
        <TableCell>
          <Box sx={{ fontWeight: 'bold' }}>
            {formatCurrency(item.quantity * item.price)}
          </Box>
        </TableCell>
        
        <TableCell>
          <Box sx={{ fontWeight: 'medium' }}>
            {(() => {
              const itemTotalValue = calculateItemTotalValue(item);
              const allItemsValue = calculateTotalItemsValue();
              const proportion = allItemsValue > 0 ? itemTotalValue / allItemsValue : 0;
              const discount = parseFloat(globalDiscount) || 0;
              const discountMultiplier = (100 - discount) / 100;
              const valueAfterDiscount = itemTotalValue * discountMultiplier;
              const quantity = parseFloat(item.quantity) || 1;
              const unitCost = valueAfterDiscount / quantity;
              return formatCurrency(unitCost, 'EUR', 4, true);
            })()}
          </Box>
        </TableCell>
        
        <TableCell align="right">
          {(() => {
            if (item.productionTaskId && item.fullProductionCost !== undefined) {
              if (item.fullProductionUnitCost !== undefined && item.fullProductionUnitCost !== null) {
                return (
                  <Box sx={{ fontWeight: 'medium', color: 'primary.main' }}>
                    {formatCurrency(item.fullProductionUnitCost)}
                  </Box>
                );
              }
              const quantity = parseFloat(item.quantity) || 1;
              const price = parseFloat(item.price) || 0;
              const unitFullProductionCost = (item.fromPriceList && parseFloat(item.price || 0) > 0)
                ? parseFloat(item.fullProductionCost) / quantity
                : (parseFloat(item.fullProductionCost) / quantity) + price;
              return (
                <Box sx={{ fontWeight: 'medium', color: 'warning.main' }}>
                  {formatCurrency(unitFullProductionCost)}
                </Box>
              );
            } else {
              return <Typography variant="body2" color="text.secondary">-</Typography>;
            }
          })()}
        </TableCell>
        
        <TableCell>
          <IconButton 
            color="error" 
            onClick={() => removeItem(index)}
            disabled={itemsLength === 1}
            size="small"
          >
            <DeleteIcon />
          </IconButton>
        </TableCell>
      </TableRow>
      
      {!isDragging && (
        <TableRow>
          <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={10}>
            <Collapse in={expandedRows[index]} timeout="auto" unmountOnExit>
              <Box sx={{ margin: 1 }}>
                <Typography variant="h6" gutterBottom component="div" sx={{ color: 'primary.main' }}>
                  {t('orderForm.itemDetails.title')}
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={6}>
                    <TextField
                      label={t('orderForm.itemDetails.description')}
                      value={item.description || ''}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      fullWidth
                      multiline
                      rows={3}
                      size="small"
                      variant="outlined"
                      placeholder={t('orderForm.placeholders.addItemDescription')}
                    />
                  </Grid>
                  
                  <Grid item xs={12} md={3}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        {t('orderForm.itemDetails.fromPriceList')}
                      </Typography>
                      <Chip 
                        label={item.fromPriceList ? t('common.yes') : t('common.no')} 
                        size="small" 
                        color={item.fromPriceList ? "success" : "default"}
                        variant={item.fromPriceList ? "filled" : "outlined"}
                        sx={{ borderRadius: 1, alignSelf: 'flex-start' }}
                      />
                    </Box>
                  </Grid>
                  
                  <Grid item xs={12} md={3}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="subtitle2" color="text.secondary">
                          {t('orderForm.itemDetails.productionTask')}
                        </Typography>
                        <Tooltip title="Odśwież status zadań produkcyjnych">
                          <IconButton 
                            size="small" 
                            color="primary"
                            onClick={refreshProductionTasks}
                            disabled={refreshingPTs}
                          >
                            <RefreshIcon fontSize="small" />
                            {refreshingPTs && <CircularProgress size={16} sx={{ position: 'absolute' }} />}
                          </IconButton>
                        </Tooltip>
                      </Box>
                      {item.productionTaskId ? (
                        <Tooltip title="Przejdź do zadania produkcyjnego">
                          <Chip
                            label={item.productionTaskNumber || `MO-${item.productionTaskId.substr(0, 6)}`}
                            size="small"
                            color={
                              item.productionStatus === 'Zakończone' ? 'success' :
                              item.productionStatus === 'W trakcie' ? 'warning' :
                              item.productionStatus === 'Anulowane' ? 'error' :
                              item.productionStatus === 'Zaplanowane' ? 'primary' : 'default'
                            }
                            onClick={() => navigate(`/production/tasks/${item.productionTaskId}`)}
                            sx={{ cursor: 'pointer', borderRadius: 1, alignSelf: 'flex-start' }}
                            icon={<EventNoteIcon />}
                          />
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </Box>
                  </Grid>
                  
                  <Grid item xs={12} md={3}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        {t('orderForm.itemDetails.productionCost')}
                      </Typography>
                      {item.productionTaskId && item.productionCost !== undefined ? (
                        <Box sx={{ fontWeight: 'medium', color: 'text.secondary' }}>
                          {formatCurrency(item.productionCost)}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </Box>
                  </Grid>
                  
                  <Grid item xs={12} md={3}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        {t('orderForm.itemDetails.profit')}
                      </Typography>
                      {item.fromPriceList && parseFloat(item.price || 0) > 0 && item.productionCost !== undefined ? (
                        <Box sx={{ 
                          fontWeight: 'medium', 
                          color: (item.quantity * item.price - item.productionCost) > 0 ? 'success.main' : 'error.main' 
                        }}>
                          {formatCurrency(item.quantity * item.price - item.productionCost)}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </Box>
                  </Grid>
                  
                  <Grid item xs={12} md={3}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        {t('orderForm.itemDetails.lastCost')}
                      </Typography>
                      {item.lastUsageInfo ? (
                        <Tooltip title={
                          item.lastUsageInfo.estimatedCost 
                            ? `${t('orderForm.itemDetails.estimatedMaterialsCost')}: ${formatCurrency(item.lastUsageInfo.cost)} EUR (${t('orderForm.itemDetails.basedOnMaterials', { count: item.lastUsageInfo.costDetails?.length || 0 })})${
                                item.lastUsageInfo.costDetails?.some(detail => detail.priceConverted) 
                                  ? `\n\n${t('orderForm.itemDetails.currencyConversionWarning')}`
                                  : ''
                              }`
                            : `${t('orderForm.itemDetails.date')}: ${formatDateToDisplay(item.lastUsageInfo.date)}, ${t('orderForm.itemDetails.lastCost')}: ${formatCurrency(item.lastUsageInfo.cost)}`
                        }>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              {item.lastUsageInfo.estimatedCost ? t('orderForm.itemDetails.estimated') : formatDateToDisplay(item.lastUsageInfo.date)}
                            </Typography>
                            <Typography 
                              variant="body2" 
                              fontWeight="medium" 
                              sx={{ 
                                color: item.lastUsageInfo.estimatedCost ? 'info.main' : 'purple' 
                              }}
                            >
                              {formatCurrency(item.lastUsageInfo.cost)}
                              {item.lastUsageInfo.estimatedCost && (
                                <Typography component="span" variant="caption" sx={{ ml: 0.5, color: 'text.secondary' }}>
                                  (est.)
                                </Typography>
                              )}
                              {item.lastUsageInfo.estimatedCost && item.lastUsageInfo.costDetails?.some(detail => detail.priceConverted) && (
                                <Typography variant="caption" sx={{ display: 'block', fontSize: '0.7rem', opacity: 0.7, color: 'warning.main' }}>
                                  ({t('orderForm.itemDetails.convertedFromOtherCurrencies')})
                                </Typography>
                              )}
                            </Typography>
                          </Box>
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </Box>
                  </Grid>
                  
                  <Grid item xs={12} md={3}>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <Typography variant="subtitle2" color="text.secondary">
                        {t('orderForm.itemDetails.totalItemValue')}
                      </Typography>
                      <Box sx={{ fontWeight: 'bold', color: 'success.main' }}>
                        {formatCurrency(calculateItemTotalValue(item))}
                      </Box>
                    </Box>
                  </Grid>
                </Grid>
              </Box>
            </Collapse>
          </TableCell>
        </TableRow>
      )}
    </React.Fragment>
  );
};

export default SortableRow;
