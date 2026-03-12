// src/components/recipes/RecipeForm.js
import React, { useState, useMemo, useCallback, useRef, Suspense, lazy } from 'react';
import ConfirmDialog from '../common/ConfirmDialog';
import { useNavigate } from 'react-router-dom';
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
  TableRow,
  Autocomplete,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  Grid,
} from '@mui/material';
import {
  Save as SaveIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
  ArrowBack as ArrowBackIcon,
  Inventory as InventoryIcon,
  Edit as EditIcon,
  ProductionQuantityLimits as ProductIcon,
  SwapHoriz as SwapIcon,
  Science as ScienceIcon,
  KeyboardArrowUp as ArrowUpIcon,
  KeyboardArrowDown as ArrowDownIcon,
  PhotoCamera as PhotoCameraIcon,
  Link as LinkIcon,
} from '@mui/icons-material';
import { useTranslation } from '../../hooks/useTranslation';
import { NUTRITIONAL_CATEGORIES } from '../../utils/constants';
import { mr1, mb3 } from '../../styles/muiCommonStyles';
import RecipeDesignAttachments from './RecipeDesignAttachments';
import RecipeRulesAttachments from './RecipeRulesAttachments';
import { Gavel as GavelIcon } from '@mui/icons-material';
import FormSectionNav from '../common/FormSectionNav';

import { useRecipeFormData } from '../../hooks/recipes/useRecipeFormData';
import { useRecipeIngredients } from '../../hooks/recipes/useRecipeIngredients';
import { useRecipeInventoryLink } from '../../hooks/recipes/useRecipeInventoryLink';
import { useRecipeNutrition } from '../../hooks/recipes/useRecipeNutrition';
import { useRecipePriceList } from '../../hooks/recipes/useRecipePriceList';

import RecipeBasicDataSection from './sections/RecipeBasicDataSection';
import RecipeCertificationsSection from './sections/RecipeCertificationsSection';
import RecipeIngredientsSection from './sections/RecipeIngredientsSection';

const CreateProductDialog = lazy(() => import('./dialogs/CreateProductDialog'));
const LinkInventoryDialog = lazy(() => import('./dialogs/LinkInventoryDialog'));
const AddNutrientDialog = lazy(() => import('./dialogs/AddNutrientDialog'));
const AddInventoryItemDialog = lazy(() => import('./dialogs/AddInventoryItemDialog'));
const AddToPriceListDialog = lazy(() => import('./dialogs/AddToPriceListDialog'));
const SyncNameDialog = lazy(() => import('./dialogs/SyncNameDialog'));

const DialogFallback = () => null;

const RecipeForm = ({ recipeId }) => {
  const formData = useRecipeFormData(recipeId);
  const {
    loading, saving,
    confirmDialog, setConfirmDialog,
    recipeData, setRecipeData,
    inventoryItems, setInventoryItems,
    loadingInventory,
    createProductDialogOpen, setCreateProductDialogOpen,
    creatingProduct,
    warehouses,
    productData,
    customers,
    workstations,
    designAttachments, setDesignAttachments,
    rulesAttachments, setRulesAttachments,
    newCustomCert, setNewCustomCert,
    originalRecipeName,
    syncNameDialogOpen, setSyncNameDialogOpen,
    linkedInventoryItem,
    syncingName,
    newRecipeId,
    addInventoryItemDialogOpen, setAddInventoryItemDialogOpen,
    newInventoryItemData, setNewInventoryItemData,
    addingInventoryItem,
    currentUser,
    navigate,
    t,
    showInfo,
    handleSubmit: formHandleSubmit,
    handleSaveWithoutSync,
    handleSaveWithSync,
    handleChange,
    handleCertificationChange,
    handleAddCustomCert,
    handleRemoveCustomCert,
    handleProductDataChange,
    handleCreateProduct,
    handleAddInventoryItem,
    handleAddNewInventoryItem,
  } = formData;

  const ingredients = useRecipeIngredients({
    recipeData, setRecipeData,
    setLoading: formData.setLoading,
    showSuccess: formData.showSuccess,
    showError: formData.showError,
    showWarning: formData.showWarning,
    showInfo: formData.showInfo,
    t
  });

  const inventoryLink = useRecipeInventoryLink({
    recipeId,
    recipeData,
    currentUser,
    setInventoryItems,
    setConfirmDialog,
    showSuccess: formData.showSuccess,
    showError: formData.showError,
    t
  });

  const nutrition = useRecipeNutrition({
    recipeData, setRecipeData,
    showSuccess: formData.showSuccess,
    showError: formData.showError,
    t
  });

  const priceList = useRecipePriceList({
    recipeData,
    newRecipeId,
    navigate,
    currentUser,
    showSuccess: formData.showSuccess,
    showError: formData.showError,
    t
  });

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    formData.setSaving(true);
    
    try {
      if (ingredients.showDisplayUnits && (Object.keys(ingredients.displayUnits).length > 0 || ingredients.costUnitDisplay || ingredients.timeUnitDisplay)) {
        showInfo(t('recipes.messages.conversionInfo'));
      }
      
      const ingredientsForSave = recipeData.ingredients.map(({ _sortId, ...rest }) => rest);
      
      const recipeDataWithAttachments = {
        ...recipeData,
        ingredients: ingredientsForSave,
        designAttachments: designAttachments,
        rulesAttachments: rulesAttachments
      };
      
      if (recipeId && recipeData.name !== originalRecipeName && originalRecipeName !== '') {
        const { getInventoryItemByRecipeId } = await import('../../services/inventory');
        try {
          const linkedItem = await getInventoryItemByRecipeId(recipeId);
          
          if (linkedItem) {
            formData.setLinkedInventoryItem(linkedItem);
            formData.setSaving(false);
            setSyncNameDialogOpen(true);
            return;
          }
        } catch (error) {
          console.warn('Nie udało się sprawdzić powiązanej pozycji magazynowej:', error);
        }
      }
      
      await formData.saveRecipe(recipeDataWithAttachments, false);
      
      if (!recipeId) {
        await priceList.openPriceListDialog();
      }
    } catch (error) {
      formData.showError(t('recipes.messages.saveError', { error: error.message }));
      console.error('Error saving recipe:', error);
    } finally {
      formData.setSaving(false);
    }
  }, [recipeData, recipeId, originalRecipeName, designAttachments, rulesAttachments, ingredients, formData, priceList, showInfo, t, setSyncNameDialogOpen]);

  const basicDataRef = useRef(null);
  const certificationsRef = useRef(null);
  const ingredientsRef = useRef(null);
  const nutrientsRef = useRef(null);
  const designAttachmentsRef = useRef(null);
  const rulesAttachmentsRef = useRef(null);
  const notesRef = useRef(null);

  const formSections = [
    { label: 'Dane podstawowe', ref: basicDataRef },
    { label: 'Certyfikacje', ref: certificationsRef },
    { label: 'Składniki', ref: ingredientsRef },
    { label: 'Składniki odżywcze', ref: nutrientsRef },
    { label: 'Załączniki designu', ref: designAttachmentsRef },
    { label: 'Załączniki zasad', ref: rulesAttachmentsRef },
    { label: 'Notatki', ref: notesRef },
  ];

  const renderInventoryLinkButtons = () => {
    if (!recipeId) return null;
    return (
      <Box sx={{ display: 'flex', gap: 1, ml: 2 }}>
        <Button
          variant="outlined"
          color="primary"
          startIcon={<ProductIcon />}
          onClick={() => setCreateProductDialogOpen(true)}
        >
          {t('recipes.inventoryButtons.createNew')}
        </Button>
        <Button
          variant="outlined"
          color="secondary"
          startIcon={<LinkIcon />}
          onClick={() => inventoryLink.setLinkInventoryDialogOpen(true)}
        >
          {t('recipes.inventoryButtons.linkExisting')}
        </Button>
      </Box>
    );
  };

  if (loading) {
    return <div>{t('recipes.details.loading')}</div>;
  }

  return (
    <Box component="form" onSubmit={handleSubmit} noValidate>
      {/* Nagłówek z przyciskami */}
      <Paper 
        elevation={2} 
        sx={{ 
          p: 2, 
          mb: 3, 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          background: theme => theme.palette.mode === 'dark' 
            ? 'linear-gradient(to right, rgba(40,50,80,1), rgba(30,40,70,1))' 
            : 'linear-gradient(to right, #f5f7fa, #e4eaf0)'
        }}
      >
        <Button 
          variant="outlined"
          startIcon={<ArrowBackIcon />} 
          onClick={() => navigate(recipeId ? `/recipes/${recipeId}` : '/recipes')}
          sx={{ borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
        >
          {t('recipes.buttons.back')}
        </Button>
        <Typography variant="h5" sx={{ fontWeight: 'medium' }}>
          {recipeId ? t('recipes.editRecipe') : t('recipes.addNewRecipe')}
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button 
            variant="contained" 
            color="primary" 
            type="submit"
            startIcon={<SaveIcon />}
            disabled={saving}
            sx={{ borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.15)', px: 3 }}
          >
            {saving ? t('recipes.buttons.saving') : t('recipes.buttons.save')}
          </Button>
          {recipeId && renderInventoryLinkButtons()}
          <Tooltip title={t('recipes.buttons.unitConversion')}>
            <IconButton color="info">
              <SwapIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Paper>

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 0 }}>
        <FormSectionNav sections={formSections} />
        <Box sx={{ flex: 1, minWidth: 0 }}>

      <RecipeBasicDataSection
        ref={basicDataRef}
        recipeData={recipeData}
        customers={customers}
        workstations={workstations}
        costUnitDisplay={ingredients.costUnitDisplay}
        timeUnitDisplay={ingredients.timeUnitDisplay}
        handleChange={handleChange}
        handleCostInputChange={ingredients.handleCostInputChange}
        handleTimeInputChange={ingredients.handleTimeInputChange}
        getCostDisplayValue={ingredients.getCostDisplayValue}
        getTimeDisplayValue={ingredients.getTimeDisplayValue}
        canConvertUnit={ingredients.canConvertUnit}
        toggleCostUnit={ingredients.toggleCostUnit}
        toggleTimeUnit={ingredients.toggleTimeUnit}
        formatDisplayValue={ingredients.formatDisplayValue}
        t={t}
      />

      <RecipeCertificationsSection
        ref={certificationsRef}
        recipeData={recipeData}
        newCustomCert={newCustomCert}
        setNewCustomCert={setNewCustomCert}
        handleCertificationChange={handleCertificationChange}
        handleAddCustomCert={handleAddCustomCert}
        handleRemoveCustomCert={handleRemoveCustomCert}
        t={t}
      />

      <RecipeIngredientsSection
        ref={ingredientsRef}
        recipeData={recipeData}
        inventoryItems={inventoryItems}
        loadingInventory={loadingInventory}
        loading={loading}
        sensors={ingredients.sensors}
        ingredientsSummary={ingredients.ingredientsSummary}
        displayUnits={ingredients.displayUnits}
        showDisplayUnits={ingredients.showDisplayUnits}
        handleIngredientDragEnd={ingredients.handleIngredientDragEnd}
        handleIngredientChange={ingredients.handleIngredientChange}
        handleAddInventoryItem={handleAddInventoryItem}
        removeIngredient={ingredients.removeIngredient}
        formatDisplayValue={ingredients.formatDisplayValue}
        getDisplayValue={ingredients.getDisplayValue}
        getDisplayUnit={ingredients.getDisplayUnit}
        canConvertUnit={ingredients.canConvertUnit}
        toggleIngredientUnit={ingredients.toggleIngredientUnit}
        linkAllIngredientsWithInventory={ingredients.linkAllIngredientsWithInventory}
        syncCASNumbers={ingredients.syncCASNumbers}
        setDisplayUnits={ingredients.setDisplayUnits}
        setShowDisplayUnits={ingredients.setShowDisplayUnits}
        setAddInventoryItemDialogOpen={setAddInventoryItemDialogOpen}
        t={t}
      />

      {/* Sekcja składników odżywczych */}
      <Paper 
        ref={nutrientsRef}
        elevation={3} 
        sx={{ p: 0, mb: 3, borderRadius: '12px', overflow: 'hidden' }}
      >
        <Box 
          sx={{ 
            p: 2, display: 'flex', alignItems: 'center', gap: 1,
            borderBottom: '1px solid', borderColor: 'divider',
            bgcolor: 'action.hover', justifyContent: 'space-between'
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            <ScienceIcon color="secondary" sx={mr1} />
            <Typography variant="h6" fontWeight="500">{t('recipes.nutrients.title')}</Typography>
          </Box>
          
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button 
              variant="outlined"
              size="small"
              onClick={nutrition.addMicronutrient}
              startIcon={<AddIcon />}
              sx={{ borderRadius: '20px' }}
            >
              {t('recipes.nutrients.addNutrient')}
            </Button>
            <Button 
              variant="outlined"
              size="small"
              color="secondary"
              onClick={nutrition.handleOpenAddNutrientDialog}
              startIcon={<ScienceIcon />}
              sx={{ borderRadius: '20px' }}
            >
              {t('recipes.nutrients.newNutrient')}
            </Button>
          </Box>
        </Box>
        
        <Box sx={{ p: 3 }}>
          <Box sx={mb3}>
            <TextField
              label={t('recipes.nutrients.nutritionalBasis')}
              name="nutritionalBasis"
              value={recipeData.nutritionalBasis}
              onChange={nutrition.handleNutritionalBasisChange}
              fullWidth
              sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
              helperText={t('recipes.nutrients.nutritionalBasisHelpText')}
              InputProps={{
                startAdornment: (
                  <Box sx={{ color: 'text.secondary', mr: 1, display: 'flex', alignItems: 'center' }}>
                    <ScienceIcon fontSize="small" />
                  </Box>
                )
              }}
            />
          </Box>
          
          {recipeData.micronutrients && recipeData.micronutrients.length > 0 ? (
            <TableContainer sx={{ borderRadius: '8px', border: '1px solid', borderColor: 'divider' }}>
              <Table>
                <TableHead sx={{ bgcolor: 'action.selected' }}>
                  <TableRow>
                    <TableCell width="18%"><Typography variant="subtitle2">{t('recipes.nutrients.component')}</Typography></TableCell>
                    <TableCell width="18%"><Typography variant="subtitle2">{t('recipes.nutrients.name')}</Typography></TableCell>
                    <TableCell width="12%"><Typography variant="subtitle2">{t('recipes.nutrients.quantity')}</Typography></TableCell>
                    <TableCell width="8%"><Typography variant="subtitle2">{t('recipes.nutrients.unit')}</Typography></TableCell>
                    <TableCell width="14%"><Typography variant="subtitle2">{t('recipes.nutrients.category')}</Typography></TableCell>
                    <TableCell width="20%"><Typography variant="subtitle2">{t('recipes.nutrients.notes')}</Typography></TableCell>
                    <TableCell width="10%"><Typography variant="subtitle2">{t('recipes.nutrients.actions')}</Typography></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recipeData.micronutrients.map((micronutrient, index) => (
                    <TableRow key={micronutrient.id || `micronutrient-${index}-${micronutrient.code || 'empty'}`} hover sx={{ '&:nth-of-type(even)': { bgcolor: 'action.hover' } }}>
                      <TableCell>
                        <Autocomplete
                          fullWidth
                          variant="standard"
                          options={[
                            ...(nutrition.loadingComponents ? [] : [{ 
                              isAddNewOption: true,
                              name: t('recipes.nutrients.addNewNutritionalComponent'),
                              code: 'ADD_NEW',
                              unit: '',
                              category: 'Brak'
                            }]),
                            ...nutrition.nutritionalComponents
                          ]}
                          groupBy={(option) => option.category}
                          getOptionLabel={(option) => option.code || ''}
                          value={nutrition.nutritionalComponents.find(c => c.code === micronutrient.code) || null}
                          onChange={(event, newValue) => {
                            if (newValue?.isAddNewOption) {
                              nutrition.handleOpenAddNutrientDialog();
                            } else if (newValue) {
                              const newMicronutrients = [...recipeData.micronutrients];
                              newMicronutrients[index] = {
                                ...newMicronutrients[index],
                                code: newValue.code,
                                name: newValue.name,
                                unit: newValue.unit,
                                category: newValue.category
                              };
                              setRecipeData(prev => ({ ...prev, micronutrients: newMicronutrients }));
                            } else {
                              const newMicronutrients = [...recipeData.micronutrients];
                              newMicronutrients[index] = {
                                ...newMicronutrients[index],
                                code: '', name: '', unit: '', category: ''
                              };
                              setRecipeData(prev => ({ ...prev, micronutrients: newMicronutrients }));
                            }
                          }}
                          loading={nutrition.loadingComponents}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              variant="standard"
                              placeholder={t('recipes.nutrients.selectComponent')}
                              InputProps={{
                                ...params.InputProps,
                                endAdornment: (
                                  <>
                                    {nutrition.loadingComponents ? <CircularProgress color="inherit" size={20} /> : null}
                                    {params.InputProps.endAdornment}
                                  </>
                                ),
                              }}
                            />
                          )}
                          renderOption={(props, option, { index: optionIndex }) => {
                            const { key, ...restProps } = props;
                            return (
                              <Box
                                key={option.isAddNewOption ? 'add-new-option' : `option-${option.code}-${optionIndex}`}
                                component="li"
                                {...restProps}
                                sx={option.isAddNewOption ? {
                                  p: 1.5,
                                  bgcolor: theme => theme.palette.mode === 'dark' 
                                    ? 'rgba(156, 39, 176, 0.25)'
                                    : 'rgba(156, 39, 176, 0.1)'
                                } : restProps.sx}
                              >
                              {option.isAddNewOption ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, width: '100%', py: 0.5 }}>
                                  <ScienceIcon sx={{ color: 'secondary.main', fontSize: '1.2rem' }} />
                                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'secondary.main' }}>
                                    {option.name}
                                  </Typography>
                                </Box>
                              ) : (
                                <Box sx={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography variant="body2" sx={{ fontWeight: 'bold' }}>{option.code}</Typography>
                                    <Chip 
                                      size="small" 
                                      label={option.category}
                                      color={
                                        option.category === 'Witaminy' ? 'success' :
                                        option.category === 'Minerały' ? 'info' :
                                        option.category === 'Makroelementy' ? 'primary' :
                                        option.category === 'Energia' ? 'warning' :
                                        option.category === 'Składniki aktywne' ? 'secondary' :
                                        'default'
                                      }
                                      sx={{ ml: 'auto' }}
                                    />
                                  </Box>
                                  <Typography variant="body2" color="text.secondary">
                                    {option.name} ({option.unit})
                                  </Typography>
                                </Box>
                              )}
                              </Box>
                            );
                          }}
                          renderGroup={(params) => (
                            <Box key={`group-${params.group}-${params.key || 'default'}`}>
                              <Typography
                                variant="overline"
                                sx={{
                                  px: 2, py: 1, display: 'block',
                                  bgcolor: 'action.selected', color: 'text.primary',
                                  fontWeight: 'bold', fontSize: '0.75rem'
                                }}
                              >
                                {params.group}
                              </Typography>
                              {params.children}
                            </Box>
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField fullWidth variant="standard" value={micronutrient.name}
                          InputProps={{ readOnly: true }}
                          sx={{ '& .MuiInputBase-input': { color: theme => theme.palette.text.secondary } }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField fullWidth variant="standard" type="number"
                          value={micronutrient.quantity}
                          onChange={(e) => nutrition.handleMicronutrientChange(index, 'quantity', e.target.value)}
                          inputProps={{ min: 0, step: 0.001 }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField fullWidth variant="standard" value={micronutrient.unit}
                          InputProps={{ readOnly: true }}
                          sx={{ '& .MuiInputBase-input': { color: theme => theme.palette.text.secondary } }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip 
                          size="small" 
                          color={
                            micronutrient.category === 'Witaminy' ? 'success' :
                            micronutrient.category === 'Minerały' ? 'info' :
                            micronutrient.category === 'Makroelementy' ? 'primary' :
                            micronutrient.category === 'Energia' ? 'warning' :
                            micronutrient.category === 'Składniki aktywne' ? 'secondary' :
                            'default'
                          } 
                          label={micronutrient.category} 
                          sx={{ borderRadius: '16px' }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField fullWidth variant="standard"
                          value={micronutrient.notes || ''}
                          onChange={(e) => nutrition.handleMicronutrientChange(index, 'notes', e.target.value)}
                          placeholder="Uwagi..."
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5 }}>
                          <Tooltip title="Przesuń w górę">
                            <IconButton color="primary" onClick={() => nutrition.moveMicronutrientUp(index)} size="small" disabled={index === 0}>
                              <ArrowUpIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Przesuń w dół">
                            <IconButton color="primary" onClick={() => nutrition.moveMicronutrientDown(index)} size="small" disabled={index === recipeData.micronutrients.length - 1}>
                              <ArrowDownIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Usuń składnik">
                            <IconButton color="error" onClick={() => nutrition.removeMicronutrient(index)} size="small">
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Paper 
              sx={{ 
                p: 3, textAlign: 'center', bgcolor: 'action.hover',
                borderRadius: '8px', border: '1px dashed', borderColor: 'divider'
              }}
            >
              <ScienceIcon sx={{ fontSize: 40, color: 'text.secondary', mb: 1 }} />
              <Typography variant="body1" color="text.secondary" gutterBottom>
                {t('recipes.nutrients.noNutrients')} 
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('recipes.nutrients.noNutrientsHelpText')}
              </Typography>
            </Paper>
          )}
        </Box>
      </Paper>

      {/* Sekcja załączników designu */}
      <Paper 
        ref={designAttachmentsRef}
        elevation={3} 
        sx={{ p: 0, mb: 3, borderRadius: '12px', overflow: 'hidden' }}
      >
        <Box 
          sx={{ 
            p: 1.5, display: 'flex', alignItems: 'center', gap: 1,
            borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'action.hover'
          }}
        >
          <PhotoCameraIcon color="primary" sx={{ fontSize: 20 }} />
          <Typography variant="subtitle1" fontWeight="500">Załączniki designu produktu</Typography>
        </Box>
        <Box sx={{ p: 2 }}>
          <RecipeDesignAttachments
            recipeId={recipeId || 'temp'}
            attachments={designAttachments}
            onAttachmentsChange={setDesignAttachments}
            disabled={saving}
            showTitle={false}
            compact={true}
          />
        </Box>
      </Paper>

      {/* Sekcja załączników zasad */}
      <Paper 
        ref={rulesAttachmentsRef}
        elevation={3} 
        sx={{ p: 0, mb: 3, borderRadius: '12px', overflow: 'hidden' }}
      >
        <Box 
          sx={{ 
            p: 1.5, display: 'flex', alignItems: 'center', gap: 1,
            borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'action.hover'
          }}
        >
          <GavelIcon color="primary" sx={{ fontSize: 20 }} />
          <Typography variant="subtitle1" fontWeight="500">{t('recipes.rulesAttachments.title')}</Typography>
        </Box>
        <Box sx={{ p: 2 }}>
          <RecipeRulesAttachments
            recipeId={recipeId || 'temp'}
            attachments={rulesAttachments}
            onAttachmentsChange={setRulesAttachments}
            disabled={saving}
            showTitle={false}
            compact={true}
          />
        </Box>
      </Paper>

      {/* Sekcja notatek */}
      <Paper 
        ref={notesRef}
        elevation={3} 
        sx={{ p: 0, mb: 3, borderRadius: '12px', overflow: 'hidden' }}
      >
        <Box 
          sx={{ 
            p: 2, display: 'flex', alignItems: 'center', gap: 1,
            borderBottom: '1px solid', borderColor: 'divider', bgcolor: 'action.hover'
          }}
        >
          <EditIcon color="primary" />
          <Typography variant="h6" fontWeight="500">{t('recipes.additionalNotes')}</Typography>
        </Box>
        <Box sx={{ p: 3 }}>
          <TextField
            label={t('common.notes')}
            name="notes"
            value={recipeData.notes || ''}
            onChange={handleChange}
            fullWidth
            multiline
            rows={4}
            placeholder="Dodatkowe informacje, instrukcje, uwagi dotyczące receptury..."
            sx={{ '& .MuiOutlinedInput-root': { borderRadius: '8px' } }}
            helperText={t('recipes.additionalNotesHelper')}
          />
        </Box>
      </Paper>

        </Box>
      </Box>

      {/* Lazy-loaded dialogs */}
      <Suspense fallback={<DialogFallback />}>
        {createProductDialogOpen && (
          <CreateProductDialog
            open={createProductDialogOpen}
            onClose={() => setCreateProductDialogOpen(false)}
            productData={productData}
            onProductDataChange={handleProductDataChange}
            onCreate={handleCreateProduct}
            creating={creatingProduct}
            warehouses={warehouses}
            t={t}
          />
        )}
      </Suspense>

      <Suspense fallback={<DialogFallback />}>
        {inventoryLink.linkInventoryDialogOpen && (
          <LinkInventoryDialog
            open={inventoryLink.linkInventoryDialogOpen}
            onClose={() => {
              inventoryLink.setLinkInventoryDialogOpen(false);
              inventoryLink.setSelectedInventoryItem(null);
              inventoryLink.setInventorySearchQuery('');
            }}
            inventorySearchQuery={inventoryLink.inventorySearchQuery}
            onSearch={inventoryLink.handleLinkDialogSearch}
            selectedInventoryItem={inventoryLink.selectedInventoryItem}
            onSelectItem={inventoryLink.setSelectedInventoryItem}
            linkDialogItems={inventoryLink.linkDialogItems}
            linkDialogLoading={inventoryLink.linkDialogLoading}
            linkDialogTotalCount={inventoryLink.linkDialogTotalCount}
            linkingInventory={inventoryLink.linkingInventory}
            onLink={inventoryLink.handleLinkExistingInventoryItem}
            t={t}
          />
        )}
      </Suspense>

      <Suspense fallback={<DialogFallback />}>
        {nutrition.addNutrientDialogOpen && (
          <AddNutrientDialog
            open={nutrition.addNutrientDialogOpen}
            onClose={nutrition.handleCloseAddNutrientDialog}
            newNutrientData={nutrition.newNutrientData}
            onNutrientDataChange={nutrition.setNewNutrientData}
            onSave={nutrition.handleSaveNewNutrient}
            t={t}
          />
        )}
      </Suspense>

      <Suspense fallback={<DialogFallback />}>
        {addInventoryItemDialogOpen && (
          <AddInventoryItemDialog
            open={addInventoryItemDialogOpen}
            onClose={() => setAddInventoryItemDialogOpen(false)}
            newInventoryItemData={newInventoryItemData}
            onInventoryItemDataChange={setNewInventoryItemData}
            onAdd={handleAddNewInventoryItem}
            adding={addingInventoryItem}
            t={t}
          />
        )}
      </Suspense>

      <Suspense fallback={<DialogFallback />}>
        {priceList.addToPriceListDialogOpen && (
          <AddToPriceListDialog
            open={priceList.addToPriceListDialogOpen}
            onClose={priceList.handleClosePriceListDialog}
            recipeData={recipeData}
            priceLists={priceList.priceLists}
            loadingPriceLists={priceList.loadingPriceLists}
            priceListData={priceList.priceListData}
            onPriceListDataChange={priceList.handlePriceListDataChange}
            onAddToPriceList={priceList.handleAddToPriceList}
            onSkip={priceList.handleSkipPriceList}
            addingToPriceList={priceList.addingToPriceList}
            t={t}
          />
        )}
      </Suspense>

      <Suspense fallback={<DialogFallback />}>
        {syncNameDialogOpen && (
          <SyncNameDialog
            open={syncNameDialogOpen}
            onClose={() => setSyncNameDialogOpen(false)}
            originalRecipeName={originalRecipeName}
            newRecipeName={recipeData.name}
            linkedInventoryItem={linkedInventoryItem}
            syncingName={syncingName}
            onSaveWithoutSync={handleSaveWithoutSync}
            onSaveWithSync={handleSaveWithSync}
            t={t}
          />
        )}
      </Suspense>

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog(prev => ({ ...prev, open: false }))}
      />
    </Box>
  );
};

export default RecipeForm;
