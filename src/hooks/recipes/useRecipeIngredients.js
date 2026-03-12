import { useState, useMemo, useCallback } from 'react';
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { UNIT_GROUPS, UNIT_CONVERSION_FACTORS } from '../../utils/constants';

export function useRecipeIngredients({ recipeData, setRecipeData, setLoading, showSuccess, showError, showWarning, showInfo, t }) {
  const [displayUnits, setDisplayUnits] = useState({});
  const [showDisplayUnits, setShowDisplayUnits] = useState(false);
  const [costUnitDisplay, setCostUnitDisplay] = useState(null);
  const [timeUnitDisplay, setTimeUnitDisplay] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const ingredientsSummary = useMemo(() => {
    const ingredients = recipeData.ingredients;
    if (!ingredients || ingredients.length === 0) {
      return { totalWeight: 0, percentages: [], unitLabel: '' };
    }

    const normalizedQuantities = ingredients.map(ing => {
      const qty = parseFloat(ing.quantity) || 0;
      const unit = (ing.unit || '').toLowerCase().trim();
      if (unit === 'kg') return qty * 1000;
      if (unit === 'g') return qty;
      return null;
    });

    const totalGrams = normalizedQuantities.reduce((sum, q) => q !== null ? sum + q : sum, 0);

    const percentages = normalizedQuantities.map(q => 
      q !== null && totalGrams > 0 ? (q / totalGrams) * 100 : null
    );

    const unitLabel = totalGrams >= 1000 ? 'kg' : 'g';
    const displayTotal = totalGrams >= 1000 ? totalGrams / 1000 : totalGrams;

    return { totalWeight: displayTotal, percentages, unitLabel };
  }, [recipeData.ingredients]);

  const handleIngredientDragEnd = useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setRecipeData((prev) => {
      const oldIndex = prev.ingredients.findIndex((ing) => ing._sortId === active.id);
      const newIndex = prev.ingredients.findIndex((ing) => ing._sortId === over.id);
      return {
        ...prev,
        ingredients: arrayMove(prev.ingredients, oldIndex, newIndex),
      };
    });
  }, [setRecipeData]);

  const getUnitGroup = useCallback((unit) => {
    for (const [group, units] of Object.entries(UNIT_GROUPS)) {
      if (units.includes(unit)) {
        return { group, units };
      }
    }
    return null;
  }, []);

  const canConvertUnit = useCallback((unit) => {
    return getUnitGroup(unit) !== null;
  }, [getUnitGroup]);

  const convertValue = useCallback((value, fromUnit, toUnit) => {
    if (!value || !fromUnit || !toUnit || fromUnit === toUnit) return value;
    const fromFactor = UNIT_CONVERSION_FACTORS[fromUnit] || 1;
    const toFactor = UNIT_CONVERSION_FACTORS[toUnit] || 1;
    const baseValue = parseFloat(value) * fromFactor;
    return baseValue / toFactor;
  }, []);

  const toggleIngredientUnit = useCallback((index) => {
    const ingredient = recipeData.ingredients[index];
    const unitGroup = getUnitGroup(ingredient.unit);
    if (!unitGroup) return;
    
    const availableUnits = unitGroup.units;
    const currentIndex = availableUnits.indexOf(ingredient.unit);
    const nextUnit = availableUnits[(currentIndex + 1) % availableUnits.length];
    
    setDisplayUnits(prev => ({ ...prev, [index]: nextUnit }));
    setShowDisplayUnits(true);
    showInfo(t('recipes.messages.ingredientUnitChanged', { name: ingredient.name, nextUnit, originalUnit: ingredient.unit }));
  }, [recipeData.ingredients, getUnitGroup, showInfo, t]);

  const toggleCostUnit = useCallback(() => {
    const unit = 'szt.';
    const unitGroup = getUnitGroup(unit);
    if (!unitGroup) return;
    
    if (!costUnitDisplay) {
      const availableUnits = unitGroup.units;
      const altUnit = availableUnits.find(u => u !== unit);
      if (altUnit) {
        setCostUnitDisplay(altUnit);
        setShowDisplayUnits(true);
        showInfo(t('recipes.messages.costUnitChanged', { unit: altUnit }));
      }
    } else {
      setCostUnitDisplay(null);
      showInfo(t('recipes.messages.costUnitRestored'));
    }
  }, [costUnitDisplay, getUnitGroup, showInfo, t]);

  const toggleTimeUnit = useCallback(() => {
    const unit = 'szt.';
    const unitGroup = getUnitGroup(unit);
    if (!unitGroup) return;
    
    if (!timeUnitDisplay) {
      const availableUnits = unitGroup.units;
      const altUnit = availableUnits.find(u => u !== unit);
      if (altUnit) {
        setTimeUnitDisplay(altUnit);
        setShowDisplayUnits(true);
        showInfo(t('recipes.messages.timeUnitChanged', { unit: altUnit }));
      }
    } else {
      setTimeUnitDisplay(null);
      showInfo(t('recipes.messages.timeUnitRestored'));
    }
  }, [timeUnitDisplay, getUnitGroup, showInfo, t]);

  const getDisplayValue = useCallback((index, quantity, unit) => {
    if (!showDisplayUnits || !displayUnits[index] || quantity === '' || quantity === null || quantity === undefined) return quantity;
    const numValue = parseFloat(quantity);
    if (isNaN(numValue)) return quantity;
    return convertValue(numValue, unit, displayUnits[index]);
  }, [showDisplayUnits, displayUnits, convertValue]);

  const getDisplayUnit = useCallback((index, unit) => {
    if (!showDisplayUnits || !displayUnits[index]) return unit;
    return displayUnits[index];
  }, [showDisplayUnits, displayUnits]);

  const formatDisplayValue = useCallback((value) => {
    if (value === null || value === undefined || value === '') return '';
    const numValue = parseFloat(value);
    if (Number.isInteger(numValue)) return numValue.toString();
    return numValue.toFixed(3).replace(/\.?0+$/, '');
  }, []);

  const getCostDisplayValue = useCallback(() => {
    if (!costUnitDisplay) return recipeData.processingCostPerUnit || 0;
    const numValue = parseFloat(recipeData.processingCostPerUnit) || 0;
    const convertedValue = convertValue(numValue, 'szt.', costUnitDisplay);
    return formatDisplayValue(convertedValue);
  }, [costUnitDisplay, recipeData.processingCostPerUnit, convertValue, formatDisplayValue]);

  const getTimeDisplayValue = useCallback(() => {
    if (!timeUnitDisplay) return recipeData.productionTimePerUnit || 0;
    const numValue = parseFloat(recipeData.productionTimePerUnit) || 0;
    const convertedValue = convertValue(numValue, 'szt.', timeUnitDisplay);
    return formatDisplayValue(convertedValue);
  }, [timeUnitDisplay, recipeData.productionTimePerUnit, convertValue, formatDisplayValue]);

  const handleCostInputChange = useCallback((e) => {
    if (!costUnitDisplay) {
      const { name, value } = e.target;
      setRecipeData(prev => ({ ...prev, [name]: value }));
      return;
    }
    const { value } = e.target;
    const numValue = parseFloat(value) || 0;
    const originalValue = convertValue(numValue, costUnitDisplay, 'szt.');
    setRecipeData(prev => ({ ...prev, processingCostPerUnit: originalValue }));
  }, [costUnitDisplay, convertValue, setRecipeData]);

  const handleTimeInputChange = useCallback((e) => {
    if (!timeUnitDisplay) {
      const { name, value } = e.target;
      setRecipeData(prev => ({ ...prev, [name]: value }));
      return;
    }
    const { value } = e.target;
    const numValue = parseFloat(value) || 0;
    const originalValue = convertValue(numValue, timeUnitDisplay, 'szt.');
    setRecipeData(prev => ({ ...prev, productionTimePerUnit: originalValue }));
  }, [timeUnitDisplay, convertValue, setRecipeData]);

  const handleIngredientChange = useCallback((index, field, value) => {
    const updatedIngredients = [...recipeData.ingredients];
    
    if (field === 'quantity' && showDisplayUnits && displayUnits[index]) {
      const ingredient = recipeData.ingredients[index];
      const originalUnit = ingredient.unit;
      const displayUnit = displayUnits[index];
      const numValue = parseFloat(value) || 0;
      const originalValue = convertValue(numValue, displayUnit, originalUnit);
      updatedIngredients[index] = { ...updatedIngredients[index], quantity: originalValue };
    } else {
      updatedIngredients[index] = { ...updatedIngredients[index], [field]: value };
    }
    
    setRecipeData(prev => ({ ...prev, ingredients: updatedIngredients }));
  }, [recipeData.ingredients, showDisplayUnits, displayUnits, convertValue, setRecipeData]);

  const removeIngredient = useCallback((index) => {
    const newIngredients = [...recipeData.ingredients];
    newIngredients.splice(index, 1);
    setRecipeData(prev => ({ ...prev, ingredients: newIngredients }));
  }, [recipeData.ingredients, setRecipeData]);

  const updateIngredientId = useCallback((ingredientName, newId) => {
    const updatedIngredients = recipeData.ingredients.map(ingredient => {
      if (ingredient.name === ingredientName && !ingredient.id) {
        return { ...ingredient, id: newId };
      }
      return ingredient;
    });
    setRecipeData(prev => ({ ...prev, ingredients: updatedIngredients }));
    showSuccess(t('recipes.messages.ingredientLinked', { name: ingredientName }));
  }, [recipeData.ingredients, setRecipeData, showSuccess, t]);

  const linkAllIngredientsWithInventory = useCallback(async (resetLinks = false) => {
    if (!recipeData.ingredients || recipeData.ingredients.length === 0) {
      showWarning(t('recipes.messages.noIngredientsToLink'));
      return;
    }
    
    try {
      setLoading(true);
      let linkedCount = 0;
      let notFoundCount = 0;
      let resetCount = 0;
      
      const updatedIngredients = [...recipeData.ingredients];
      
      if (resetLinks) {
        updatedIngredients.forEach((ingredient, index) => {
          if (ingredient.id) {
            updatedIngredients[index] = { ...ingredient, id: null };
            resetCount++;
          }
        });
        
        setRecipeData(prev => ({ ...prev, ingredients: updatedIngredients }));
        
        if (resetCount > 0) {
          showInfo(t('recipes.messages.resetLinks', { count: resetCount }));
        }
      }
      
      const unlinkedNames = updatedIngredients
        .filter(ing => !ing.id && ing.name)
        .map(ing => ing.name);
      
      if (unlinkedNames.length > 0) {
        const CHUNK_SIZE = 30;
        const inventoryRef = collection(db, 'inventory');
        const nameToItemMap = new Map();

        const uniqueNames = [...new Set(unlinkedNames)];
        for (let i = 0; i < uniqueNames.length; i += CHUNK_SIZE) {
          const chunk = uniqueNames.slice(i, i + CHUNK_SIZE);
          const q = query(inventoryRef, where('name', 'in', chunk));
          const snapshot = await getDocs(q);
          snapshot.forEach(doc => {
            const data = doc.data();
            if (data.name && !nameToItemMap.has(data.name)) {
              nameToItemMap.set(data.name, doc.id);
            }
          });
        }

        for (const ingredient of updatedIngredients) {
          if (!ingredient.id && ingredient.name) {
            const inventoryId = nameToItemMap.get(ingredient.name);
            if (inventoryId) {
              updateIngredientId(ingredient.name, inventoryId);
              linkedCount++;
            } else {
              notFoundCount++;
            }
          }
        }
      }
      
      if (linkedCount > 0) {
        showSuccess(t('recipes.messages.linkedIngredients', { count: linkedCount }));
      }
      if (notFoundCount > 0) {
        showWarning(t('recipes.messages.ingredientsNotFound', { count: notFoundCount }));
      }
      if (linkedCount === 0 && notFoundCount === 0 && !resetLinks) {
        showInfo(t('recipes.messages.allIngredientsLinked'));
      }
    } catch (error) {
      showError(t('recipes.messages.linkIngredientsError', { error: error.message }));
      console.error('Error linking ingredients:', error);
    } finally {
      setLoading(false);
    }
  }, [recipeData.ingredients, setRecipeData, setLoading, updateIngredientId, showSuccess, showError, showWarning, showInfo, t]);

  const syncCASNumbers = useCallback(async () => {
    if (!recipeData.ingredients || recipeData.ingredients.length === 0) {
      showWarning(t('recipes.messages.noIngredientsToLink'));
      return;
    }
    
    try {
      setLoading(true);
      let syncedCount = 0;
      let skippedCount = 0;
      
      const updatedIngredients = [...recipeData.ingredients];
      
      const linkedIds = updatedIngredients
        .filter(ing => ing.id)
        .map(ing => ing.id);
      
      if (linkedIds.length === 0) {
        showInfo(t('recipes.messages.noCasToUpdate'));
        setLoading(false);
        return;
      }

      const CHUNK_SIZE = 30;
      const inventoryMap = new Map();
      const inventoryRef = collection(db, 'inventory');

      for (let i = 0; i < linkedIds.length; i += CHUNK_SIZE) {
        const chunk = linkedIds.slice(i, i + CHUNK_SIZE);
        const q = query(inventoryRef, where('__name__', 'in', chunk));
        const snapshot = await getDocs(q);
        snapshot.forEach(doc => {
          inventoryMap.set(doc.id, { id: doc.id, ...doc.data() });
        });
      }

      for (const [index, ingredient] of updatedIngredients.entries()) {
        if (!ingredient.id) {
          skippedCount++;
          continue;
        }
        
        const inventoryItem = inventoryMap.get(ingredient.id);
        if (!inventoryItem) {
          skippedCount++;
          continue;
        }

        if (inventoryItem.casNumber && 
            (!ingredient.casNumber || 
             ingredient.casNumber.trim() === '' || 
             ingredient.casNumber.trim() !== inventoryItem.casNumber.trim())) {
          updatedIngredients[index] = { ...ingredient, casNumber: inventoryItem.casNumber };
          syncedCount++;
        } else {
          skippedCount++;
        }
      }
      
      if (syncedCount > 0) {
        setRecipeData(prev => ({ ...prev, ingredients: updatedIngredients }));
        showSuccess(t('recipes.messages.casSynced', { count: syncedCount }));
      }
      if (skippedCount > 0) {
        showInfo(t('recipes.messages.casSkipped', { count: skippedCount }));
      }
      if (syncedCount === 0) {
        showInfo(t('recipes.messages.noCasToUpdate'));
      }
    } catch (error) {
      showError(t('recipes.messages.casSyncError', { error: error.message }));
      console.error('Error syncing CAS numbers:', error);
    } finally {
      setLoading(false);
    }
  }, [recipeData.ingredients, setRecipeData, setLoading, showSuccess, showError, showWarning, showInfo, t]);

  return {
    sensors,
    ingredientsSummary,
    displayUnits, setDisplayUnits,
    showDisplayUnits, setShowDisplayUnits,
    costUnitDisplay,
    timeUnitDisplay,
    handleIngredientDragEnd,
    canConvertUnit,
    convertValue,
    toggleIngredientUnit,
    toggleCostUnit,
    toggleTimeUnit,
    getDisplayValue,
    getDisplayUnit,
    formatDisplayValue,
    getCostDisplayValue,
    getTimeDisplayValue,
    handleCostInputChange,
    handleTimeInputChange,
    handleIngredientChange,
    removeIngredient,
    linkAllIngredientsWithInventory,
    syncCASNumbers,
  };
}
