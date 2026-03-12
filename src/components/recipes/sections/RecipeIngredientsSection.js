import React from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableFooter,
  TableRow,
  Autocomplete,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Delete as DeleteIcon,
  Add as AddIcon,
  Inventory as InventoryIcon,
  Edit as EditIcon,
  SwapHoriz as SwapIcon,
  Sync as SyncIcon,
  DragIndicator as DragIndicatorIcon,
} from '@mui/icons-material';
import {
  DndContext,
  closestCenter,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { mr1, mb3 } from '../../../styles/muiCommonStyles';

const SortableIngredientRow = ({ 
  ingredient, 
  index, 
  showDisplayUnits,
  displayUnits,
  handleIngredientChange,
  formatDisplayValue,
  getDisplayValue,
  getDisplayUnit,
  canConvertUnit,
  toggleIngredientUnit,
  removeIngredient,
  percentage,
  t
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: ingredient._sortId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging && {
      opacity: 0.5,
      zIndex: 1000,
    }),
  };

  return (
    <TableRow 
      ref={setNodeRef}
      style={style}
      hover 
      sx={{ 
        '&:nth-of-type(even)': { bgcolor: 'action.hover' },
        ...(isDragging && { bgcolor: 'action.selected', boxShadow: 3 })
      }}
    >
      <TableCell {...attributes} {...listeners} sx={{ cursor: 'grab', '&:active': { cursor: 'grabbing' }, width: '40px' }}>
        <DragIndicatorIcon sx={{ color: 'action.active' }} />
      </TableCell>
      <TableCell>
        <TextField
          fullWidth
          variant="standard"
          value={ingredient.name}
          onChange={(e) => handleIngredientChange(index, 'name', e.target.value)}
          disabled={!!ingredient.id}
        />
      </TableCell>
      <TableCell>
        <TextField
          fullWidth
          variant="standard"
          type="number"
          value={showDisplayUnits && displayUnits[index] 
            ? formatDisplayValue(getDisplayValue(index, ingredient.quantity, ingredient.unit))
            : ingredient.quantity}
          onChange={(e) => handleIngredientChange(index, 'quantity', e.target.value)}
          InputProps={{
            endAdornment: showDisplayUnits && displayUnits[index] && (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                (oryginalnie: {formatDisplayValue(ingredient.quantity)} {ingredient.unit})
              </Typography>
            )
          }}
        />
      </TableCell>
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <TextField
            fullWidth
            variant="standard"
            value={showDisplayUnits && displayUnits[index] 
              ? getDisplayUnit(index, ingredient.unit)
              : ingredient.unit}
            onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
            disabled={!!ingredient.id}
          />
          {canConvertUnit(ingredient.unit) && (
            <Tooltip title={t('recipes.ingredients.switchUnit')}>
              <IconButton 
                size="small" 
                color="primary" 
                onClick={() => toggleIngredientUnit(index)}
                sx={{ ml: 1 }}
              >
                <SwapIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </TableCell>
      <TableCell align="center">
        <Typography variant="body2" color="text.secondary" fontWeight="500">
          {percentage !== null ? `${percentage.toFixed(2)}%` : '—'}
        </Typography>
      </TableCell>
      <TableCell>
        <TextField
          fullWidth
          variant="standard"
          value={ingredient.casNumber || ''}
          onChange={(e) => handleIngredientChange(index, 'casNumber', e.target.value)}
        />
      </TableCell>
      <TableCell>
        <TextField
          fullWidth
          variant="standard"
          value={ingredient.notes || ''}
          onChange={(e) => handleIngredientChange(index, 'notes', e.target.value)}
        />
      </TableCell>
      <TableCell>
        {ingredient.id ? (
          <Chip 
            size="small" 
            color="primary" 
            label={t('recipes.ingredients.fromInventoryChip')} 
            icon={<InventoryIcon />} 
            title={t('recipes.ingredients.fromInventoryTooltip')} 
            sx={{ borderRadius: '16px' }}
          />
        ) : (
          <Chip 
            size="small" 
            color="default" 
            label={t('recipes.ingredients.manualChip')} 
            icon={<EditIcon />} 
            title={t('recipes.ingredients.manualTooltip')} 
            sx={{ borderRadius: '16px' }}
          />
        )}
      </TableCell>
      <TableCell>
        <IconButton 
          color="error" 
          onClick={() => removeIngredient(index)}
          size="small"
        >
          <DeleteIcon />
        </IconButton>
      </TableCell>
    </TableRow>
  );
};

const RecipeIngredientsSection = React.forwardRef(({
  recipeData,
  inventoryItems,
  loadingInventory,
  loading,
  sensors,
  ingredientsSummary,
  displayUnits,
  showDisplayUnits,
  handleIngredientDragEnd,
  handleIngredientChange,
  handleAddInventoryItem,
  removeIngredient,
  formatDisplayValue,
  getDisplayValue,
  getDisplayUnit,
  canConvertUnit,
  toggleIngredientUnit,
  linkAllIngredientsWithInventory,
  syncCASNumbers,
  setDisplayUnits,
  setShowDisplayUnits,
  setAddInventoryItemDialogOpen,
  t
}, ref) => {
  return (
    <Paper 
      ref={ref}
      elevation={3} 
      sx={{ 
        p: 0, 
        mb: 3, 
        borderRadius: '12px', 
        overflow: 'hidden' 
      }}
    >
      <Box 
        sx={{ 
          p: 2, 
          display: 'flex', 
          alignItems: 'center', 
          gap: 1,
          borderBottom: '1px solid',
          borderColor: 'divider',
          bgcolor: 'action.hover',
          justifyContent: 'space-between'
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <InventoryIcon color="primary" sx={mr1} />
          <Typography variant="h6" fontWeight="500">{t('recipes.ingredients.title')}</Typography>
        </Box>
        
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button 
            variant="outlined"
            size="small"
            color="primary"
            onClick={() => linkAllIngredientsWithInventory(false)}
            sx={{ borderRadius: '20px' }}
          >
            {t('recipes.ingredients.link')}
          </Button>
          <Button 
            variant="outlined"
            size="small"
            color="warning"
            onClick={() => linkAllIngredientsWithInventory(true)}
            sx={{ borderRadius: '20px' }}
          >
            {t('recipes.ingredients.reset')}
          </Button>
        </Box>
      </Box>
      
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => setAddInventoryItemDialogOpen(true)}
            sx={{ borderRadius: '20px' }}
          >
            {t('recipes.ingredients.addNewInventoryItem')}
          </Button>
          <Typography variant="caption" color="text.secondary">
            {t('recipes.ingredients.addNewInventoryItemHelper')}
          </Typography>
        </Box>
        
        <Box sx={mb3}>
          <Autocomplete
            options={inventoryItems}
            getOptionLabel={(option) => option.name || ''}
            loading={loadingInventory}
            onChange={(event, newValue) => handleAddInventoryItem(newValue)}
            renderInput={(params) => (
              <TextField
                {...params}
                label={t('recipes.ingredients.addFromInventory')}
                variant="outlined"
                fullWidth
                helperText={t('recipes.ingredients.inventoryHelpText')}
                InputProps={{
                  ...params.InputProps,
                  sx: { borderRadius: '8px' },
                  endAdornment: (
                    <>
                      {loadingInventory ? <CircularProgress color="inherit" size={20} /> : null}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                  startAdornment: <InventoryIcon color="action" sx={mr1} />
                }}
              />
            )}
            renderOption={(props, option) => {
              const { key, ...otherProps } = props;
              return (
                <li key={key} {...otherProps}>
                  <Box>
                    <Typography variant="body1">{option.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {option.unitPrice ? t('recipes.ingredients.priceInfo', {price: option.unitPrice.toFixed(2), unit: option.unit}) : t('recipes.ingredients.noPriceInfo')}
                    </Typography>
                  </Box>
                </li>
              );
            }}
          />
        </Box>
        
        {showDisplayUnits && Object.keys(displayUnits).length > 0 && (
          <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', bgcolor: 'info.lighter', p: 1, borderRadius: '8px' }}>
            <Typography variant="body2" color="info.dark" sx={{ flex: 1 }}>
              <b>Uwaga:</b> Niektóre jednostki są wyświetlane w alternatywnej formie dla wygody. Receptura będzie zapisana w oryginalnych jednostkach.
            </Typography>
            <Button 
              variant="outlined" 
              size="small" 
              color="info" 
              startIcon={<SwapIcon />}
              onClick={() => {
                setDisplayUnits({});
                setShowDisplayUnits(false);
              }}
            >
              Przywróć oryginalne jednostki
            </Button>
          </Box>
        )}
        
        {recipeData.ingredients.length > 0 ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleIngredientDragEnd}>
            <TableContainer sx={{ borderRadius: '8px', border: '1px solid', borderColor: 'divider' }}>
              <Table>
                <TableHead sx={{ bgcolor: 'action.selected' }}>
                  <TableRow>
                    <TableCell width="3%"></TableCell>
                    <TableCell width="20%"><Typography variant="subtitle2">{t('recipes.ingredients.ingredientSKU')}</Typography></TableCell>
                    <TableCell width="13%"><Typography variant="subtitle2">{t('recipes.ingredients.quantity')}</Typography></TableCell>
                    <TableCell width="8%"><Typography variant="subtitle2">{t('recipes.ingredients.unit')}</Typography></TableCell>
                    <TableCell width="7%" align="center"><Typography variant="subtitle2">{t('recipes.ingredients.percentage')}</Typography></TableCell>
                    <TableCell width="14%">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="subtitle2">{t('recipes.ingredients.casNumber')}</Typography>
                        <Tooltip title={t('recipes.ingredients.syncCAS')}>
                          <IconButton 
                            size="small" 
                            color="primary" 
                            onClick={syncCASNumbers}
                            disabled={loading}
                            sx={{ ml: 1 }}
                          >
                            <SyncIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                    <TableCell width="12%"><Typography variant="subtitle2">{t('recipes.ingredients.notes')}</Typography></TableCell>
                    <TableCell width="10%"><Typography variant="subtitle2">{t('recipes.ingredients.source')}</Typography></TableCell>
                    <TableCell width="5%"><Typography variant="subtitle2">{t('recipes.ingredients.actions')}</Typography></TableCell>
                  </TableRow>
                </TableHead>
                <SortableContext items={recipeData.ingredients.map(ing => ing._sortId)} strategy={verticalListSortingStrategy}>
                  <TableBody>
                    {recipeData.ingredients.map((ingredient, index) => (
                      <SortableIngredientRow
                        key={ingredient._sortId}
                        ingredient={ingredient}
                        index={index}
                        showDisplayUnits={showDisplayUnits}
                        displayUnits={displayUnits}
                        handleIngredientChange={handleIngredientChange}
                        formatDisplayValue={formatDisplayValue}
                        getDisplayValue={getDisplayValue}
                        getDisplayUnit={getDisplayUnit}
                        canConvertUnit={canConvertUnit}
                        toggleIngredientUnit={toggleIngredientUnit}
                        removeIngredient={removeIngredient}
                        percentage={ingredientsSummary.percentages[index] ?? null}
                        t={t}
                      />
                    ))}
                  </TableBody>
                </SortableContext>
                <TableFooter>
                  <TableRow sx={{ 
                    bgcolor: 'action.selected',
                    '& td': { borderBottom: 'none' }
                  }}>
                    <TableCell />
                    <TableCell>
                      <Typography variant="subtitle2" fontWeight="700">
                        {t('recipes.ingredients.totalWeight')}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="subtitle2" fontWeight="700">
                        {ingredientsSummary.totalWeight % 1 === 0 
                          ? ingredientsSummary.totalWeight 
                          : ingredientsSummary.totalWeight.toFixed(4)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="subtitle2" fontWeight="700">
                        {ingredientsSummary.unitLabel}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Typography variant="subtitle2" fontWeight="700">
                        {ingredientsSummary.totalWeight > 0 ? '100%' : '—'}
                      </Typography>
                    </TableCell>
                    <TableCell colSpan={4} />
                  </TableRow>
                </TableFooter>
              </Table>
            </TableContainer>
          </DndContext>
        ) : (
          <Paper 
            sx={{ 
              p: 3, 
              textAlign: 'center', 
              bgcolor: 'action.hover',
              borderRadius: '8px',
              border: '1px dashed',
              borderColor: 'divider'
            }}
          >
            <InventoryIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
            <Typography variant="body1" color="text.secondary" gutterBottom>
              {t('recipes.ingredients.noIngredients')} 
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('recipes.ingredients.noIngredientsHelpText')}
            </Typography>
          </Paper>
        )}
      </Box>
    </Paper>
  );
});

RecipeIngredientsSection.displayName = 'RecipeIngredientsSection';

export default RecipeIngredientsSection;
