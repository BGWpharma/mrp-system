import { useState, useCallback } from 'react';
import { useNutritionalComponents } from '../products';
import { addNutritionalComponent } from '../../services/products';
import { DEFAULT_NUTRITIONAL_COMPONENT } from '../../utils/constants';

export function useRecipeNutrition({ recipeData, setRecipeData, showSuccess, showError, t }) {
  const { components: nutritionalComponents, loading: loadingComponents, usingFallback, refreshComponents } = useNutritionalComponents();
  
  const [addNutrientDialogOpen, setAddNutrientDialogOpen] = useState(false);
  const [newNutrientData, setNewNutrientData] = useState({
    code: '',
    name: '',
    unit: '',
    category: ''
  });

  const handleMicronutrientChange = useCallback((index, field, value) => {
    const newMicronutrients = [...recipeData.micronutrients];
    
    if (field === 'code') {
      const selectedMicronutrient = nutritionalComponents.find(m => m.code === value);
      if (selectedMicronutrient) {
        newMicronutrients[index] = {
          ...newMicronutrients[index],
          code: selectedMicronutrient.code,
          name: selectedMicronutrient.name,
          unit: selectedMicronutrient.unit,
          category: selectedMicronutrient.category
        };
      }
    } else {
      newMicronutrients[index] = {
        ...newMicronutrients[index],
        [field]: value
      };
    }
    
    setRecipeData(prev => ({ ...prev, micronutrients: newMicronutrients }));
  }, [recipeData.micronutrients, nutritionalComponents, setRecipeData]);

  const addMicronutrient = useCallback(() => {
    const newMicronutrient = { 
      ...DEFAULT_NUTRITIONAL_COMPONENT,
      id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    setRecipeData(prev => ({
      ...prev,
      micronutrients: [...prev.micronutrients, newMicronutrient]
    }));
  }, [setRecipeData]);

  const removeMicronutrient = useCallback((index) => {
    const newMicronutrients = [...recipeData.micronutrients];
    newMicronutrients.splice(index, 1);
    setRecipeData(prev => ({ ...prev, micronutrients: newMicronutrients }));
  }, [recipeData.micronutrients, setRecipeData]);

  const moveMicronutrientUp = useCallback((index) => {
    if (index === 0) return;
    const newMicronutrients = [...recipeData.micronutrients];
    const temp = newMicronutrients[index];
    newMicronutrients[index] = newMicronutrients[index - 1];
    newMicronutrients[index - 1] = temp;
    setRecipeData(prev => ({ ...prev, micronutrients: newMicronutrients }));
  }, [recipeData.micronutrients, setRecipeData]);

  const moveMicronutrientDown = useCallback((index) => {
    if (index === recipeData.micronutrients.length - 1) return;
    const newMicronutrients = [...recipeData.micronutrients];
    const temp = newMicronutrients[index];
    newMicronutrients[index] = newMicronutrients[index + 1];
    newMicronutrients[index + 1] = temp;
    setRecipeData(prev => ({ ...prev, micronutrients: newMicronutrients }));
  }, [recipeData.micronutrients, setRecipeData]);

  const handleNutritionalBasisChange = useCallback((e) => {
    setRecipeData(prev => ({ ...prev, nutritionalBasis: e.target.value }));
  }, [setRecipeData]);

  const handleOpenAddNutrientDialog = useCallback(() => {
    setNewNutrientData({ code: '', name: '', unit: '', category: '' });
    setAddNutrientDialogOpen(true);
  }, []);

  const handleCloseAddNutrientDialog = useCallback(() => {
    setAddNutrientDialogOpen(false);
    setNewNutrientData({ code: '', name: '', unit: '', category: '' });
  }, []);

  const handleSaveNewNutrient = useCallback(async () => {
    try {
      if (!newNutrientData.code || !newNutrientData.name || !newNutrientData.unit || !newNutrientData.category) {
        showError(t('recipes.messages.allFieldsRequired'));
        return;
      }

      await addNutritionalComponent({ ...newNutrientData, isActive: true });
      showSuccess(t('recipes.messages.nutrientAdded'));
      await refreshComponents();
      
      const newMicronutrient = {
        code: newNutrientData.code,
        name: newNutrientData.name,
        unit: newNutrientData.unit,
        category: newNutrientData.category,
        quantity: '',
        notes: '',
        id: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
      };
      
      setRecipeData(prev => ({
        ...prev,
        micronutrients: [...prev.micronutrients, newMicronutrient]
      }));
      
      handleCloseAddNutrientDialog();
    } catch (error) {
      console.error('Błąd przy dodawaniu składnika:', error);
      showError(t('recipes.messages.addNutrientError'));
    }
  }, [newNutrientData, refreshComponents, setRecipeData, handleCloseAddNutrientDialog, showSuccess, showError, t]);

  return {
    nutritionalComponents,
    loadingComponents,
    usingFallback,
    addNutrientDialogOpen, setAddNutrientDialogOpen,
    newNutrientData, setNewNutrientData,
    handleMicronutrientChange,
    addMicronutrient,
    removeMicronutrient,
    moveMicronutrientUp,
    moveMicronutrientDown,
    handleNutritionalBasisChange,
    handleOpenAddNutrientDialog,
    handleCloseAddNutrientDialog,
    handleSaveNewNutrient,
  };
}
