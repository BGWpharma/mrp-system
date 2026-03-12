import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { createRecipe, updateRecipe, getRecipeById, fixRecipeYield, getAllPriceLists, updateProductNameInPriceLists } from '../../services/products';
import { getAllInventoryItems, getAllWarehouses, getInventoryItemByRecipeId, updateInventoryItem, createInventoryItem } from '../../services/inventory';
import { getAllCustomers } from '../../services/crm';
import { getAllWorkstations } from '../../services/production/workstationService';
import { useAuth } from '../useAuth';
import { useNotification } from '../useNotification';
import { useTranslation } from '../useTranslation';

const generateIngredientId = () => {
  return `ing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

export function useRecipeFormData(recipeId) {
  const { currentUser } = useAuth();
  const { showSuccess, showError, showWarning, showInfo } = useNotification();
  const { t } = useTranslation('recipes');
  const navigate = useNavigate();
  const location = useLocation();

  const [loading, setLoading] = useState(!!recipeId);
  const [saving, setSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState({ open: false, title: '', message: '', onConfirm: null });

  const [recipeData, setRecipeData] = useState({
    name: '',
    description: '',
    yield: { quantity: 1, unit: 'szt.' },
    prepTime: '',
    ingredients: [],
    micronutrients: [],
    allergens: [],
    notes: '',
    status: 'Robocza',
    customerId: '',
    processingCostPerUnit: 0,
    productionTimePerUnit: 0,
    defaultWorkstationId: '',
    nutritionalBasis: '1 caps',
    density: '',
    certifications: {
      halal: false,
      eco: false,
      vege: false,
      vegan: false,
      kosher: false,
      custom: []
    }
  });

  const [inventoryItems, setInventoryItems] = useState([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [createProductDialogOpen, setCreateProductDialogOpen] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [warehouses, setWarehouses] = useState([]);
  const [productData, setProductData] = useState({
    name: '',
    description: '',
    category: 'Gotowe produkty',
    unit: 'szt.',
    minStockLevel: 0,
    maxStockLevel: 0,
    warehouseId: '',
    quantity: 0,
    recipeId: ''
  });

  const [customers, setCustomers] = useState([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [workstations, setWorkstations] = useState([]);
  const [loadingWorkstations, setLoadingWorkstations] = useState(false);

  const [designAttachments, setDesignAttachments] = useState([]);
  const [rulesAttachments, setRulesAttachments] = useState([]);
  const [newCustomCert, setNewCustomCert] = useState('');

  const [originalRecipeName, setOriginalRecipeName] = useState('');
  const [syncNameDialogOpen, setSyncNameDialogOpen] = useState(false);
  const [linkedInventoryItem, setLinkedInventoryItem] = useState(null);
  const [pendingRecipeData, setPendingRecipeData] = useState(null);
  const [syncingName, setSyncingName] = useState(false);
  const [newRecipeId, setNewRecipeId] = useState(null);

  // Stany dla dialogu dodawania nowej pozycji magazynowej (składnika)
  const [addInventoryItemDialogOpen, setAddInventoryItemDialogOpen] = useState(false);
  const [newInventoryItemData, setNewInventoryItemData] = useState({
    name: '',
    description: '',
    category: 'Surowce',
    unit: 'kg',
    casNumber: '',
    barcode: '',
    location: ''
  });
  const [addingInventoryItem, setAddingInventoryItem] = useState(false);

  useEffect(() => {
    let cancelled = false;

    if (recipeId) {
      const fetchRecipe = async () => {
        try {
          const recipe = await getRecipeById(recipeId);
          if (cancelled) return;
          
          const micronutrientsWithIds = (recipe.micronutrients || []).map((micronutrient, index) => ({
            ...micronutrient,
            id: micronutrient.id || `existing-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`
          }));
          
          const ingredientsWithSortIds = (recipe.ingredients || []).map((ingredient) => ({
            ...ingredient,
            _sortId: ingredient._sortId || generateIngredientId()
          }));
          
          const certifications = {
            halal: false,
            eco: false,
            vege: false,
            vegan: false,
            kosher: false,
            custom: [],
            ...(recipe.certifications || {})
          };
          
          const recipeWithMicronutrients = {
            ...recipe,
            ingredients: ingredientsWithSortIds,
            micronutrients: micronutrientsWithIds,
            certifications: certifications
          };
          
          setRecipeData(recipeWithMicronutrients);
          setOriginalRecipeName(recipe.name);
          setProductData(prev => ({
            ...prev,
            name: recipe.name,
            description: recipe.description || '',
            category: 'Gotowe produkty',
            unit: recipe.yield?.unit || 'szt.',
            recipeId: recipeId
          }));
          setDesignAttachments(recipe.designAttachments || []);
          setRulesAttachments(recipe.rulesAttachments || []);
          
          if (location.state?.openProductDialog) {
            setCreateProductDialogOpen(true);
          }
        } catch (error) {
          if (cancelled) return;
          showError(t('recipes.messages.fetchRecipeError', { error: error.message }));
          console.error('Error fetching recipe:', error);
        } finally {
          if (!cancelled) {
            setLoading(false);
          }
        }
      };
      
      fetchRecipe();
    }

    const fetchInventoryItems = async () => {
      try {
        setLoadingInventory(true);
        const items = await getAllInventoryItems();
        if (cancelled) return;
        setInventoryItems(items);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania składników z magazynu:', error);
        showError(t('recipes.messages.fetchInventoryError'));
      } finally {
        if (!cancelled) {
          setLoadingInventory(false);
        }
      }
    };
    
    const fetchWarehouses = async () => {
      try {
        const warehousesData = await getAllWarehouses();
        if (cancelled) return;
        setWarehouses(warehousesData);
        
        if (warehousesData.length > 0) {
          setProductData(prev => ({
            ...prev,
            warehouseId: warehousesData[0].id
          }));
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania lokalizacji:', error);
      }
    };

    const fetchCustomers = async () => {
      try {
        setLoadingCustomers(true);
        const customersData = await getAllCustomers();
        if (cancelled) return;
        setCustomers(customersData);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania klientów:', error);
        showError(t('recipes.messages.fetchCustomersError'));
      } finally {
        if (!cancelled) {
          setLoadingCustomers(false);
        }
      }
    };
    
    const fetchWorkstations = async () => {
      try {
        setLoadingWorkstations(true);
        const workstationsData = await getAllWorkstations();
        if (cancelled) return;
        setWorkstations(workstationsData);
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania stanowisk produkcyjnych:', error);
        showError(t('recipes.messages.fetchWorkstationsError'));
      } finally {
        if (!cancelled) {
          setLoadingWorkstations(false);
        }
      }
    };
    
    fetchInventoryItems();
    fetchWarehouses();
    fetchCustomers();
    fetchWorkstations();
    return () => { cancelled = true; };
  }, [recipeId, showError, location.state]);

  const fetchPriceLists = useCallback(async () => {
    // Returns priceLists — used by handleSubmit flow
    try {
      const data = await getAllPriceLists();
      return data;
    } catch (error) {
      console.error('Błąd podczas pobierania list cenowych:', error);
      showError(t('recipes.messages.fetchPriceListsError'));
      return [];
    }
  }, [showError, t]);

  const saveRecipe = useCallback(async (recipeDataToSave, syncInventoryName = false) => {
    if (recipeId) {
      await updateRecipe(recipeId, recipeDataToSave, currentUser.uid);
      
      const nameChanged = originalRecipeName !== '' && recipeData.name !== originalRecipeName;
      
      let priceListsUpdated = 0;
      if (nameChanged) {
        try {
          priceListsUpdated = await updateProductNameInPriceLists(recipeId, recipeData.name, currentUser.uid);
        } catch (error) {
          console.warn('Nie udało się zaktualizować nazwy w listach cenowych:', error);
        }
      }
      
      if (syncInventoryName && linkedInventoryItem) {
        await updateInventoryItem(linkedInventoryItem.id, {
          name: recipeData.name
        }, currentUser.uid);
        
        if (priceListsUpdated > 0) {
          showSuccess(t('recipes.messages.recipeInventoryAndPriceListsUpdated', { priceListsCount: priceListsUpdated }));
        } else {
          showSuccess(t('recipes.messages.recipeAndInventoryUpdated'));
        }
      } else {
        if (priceListsUpdated > 0) {
          showSuccess(t('recipes.messages.recipeAndPriceListsUpdated', { priceListsCount: priceListsUpdated }));
        } else {
          showSuccess(t('recipes.messages.recipeUpdated'));
        }
      }
      
      navigate(`/recipes/${recipeId}`);
    } else {
      const newRecipe = await createRecipe(recipeDataToSave, currentUser.uid);
      setNewRecipeId(newRecipe.id);
      showSuccess(t('recipes.messages.recipeCreated'));
      return newRecipe;
    }
  }, [recipeId, currentUser, originalRecipeName, recipeData.name, linkedInventoryItem, navigate, showSuccess, t]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setSaving(true);
    
    try {
      if (Object.keys({}).length > 0) {
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
        try {
          const linkedItem = await getInventoryItemByRecipeId(recipeId);
          
          if (linkedItem) {
            setPendingRecipeData(recipeDataWithAttachments);
            setLinkedInventoryItem(linkedItem);
            setSyncNameDialogOpen(true);
            setSaving(false);
            return;
          }
        } catch (error) {
          console.warn('Nie udało się sprawdzić powiązanej pozycji magazynowej:', error);
        }
      }
      
      const result = await saveRecipe(recipeDataWithAttachments, false);
      if (result) {
        const priceLists = await fetchPriceLists();
        return { newRecipeId: result.id, priceLists };
      }
    } catch (error) {
      showError(t('recipes.messages.saveError', { error: error.message }));
      console.error('Error saving recipe:', error);
    } finally {
      setSaving(false);
    }
  }, [recipeData, recipeId, originalRecipeName, designAttachments, rulesAttachments, saveRecipe, fetchPriceLists, showError, showInfo, t]);

  const handleSaveWithoutSync = useCallback(async () => {
    setSyncNameDialogOpen(false);
    setSyncingName(true);
    
    try {
      await saveRecipe(pendingRecipeData, false);
    } catch (error) {
      showError(t('recipes.messages.saveError', { error: error.message }));
      console.error('Error saving recipe:', error);
    } finally {
      setSyncingName(false);
      setPendingRecipeData(null);
      setLinkedInventoryItem(null);
    }
  }, [pendingRecipeData, saveRecipe, showError, t]);

  const handleSaveWithSync = useCallback(async () => {
    setSyncNameDialogOpen(false);
    setSyncingName(true);
    
    try {
      await saveRecipe(pendingRecipeData, true);
    } catch (error) {
      showError(t('recipes.messages.saveError', { error: error.message }));
      console.error('Error saving recipe:', error);
    } finally {
      setSyncingName(false);
      setPendingRecipeData(null);
      setLinkedInventoryItem(null);
    }
  }, [pendingRecipeData, saveRecipe, showError, t]);

  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setRecipeData(prev => ({ ...prev, [name]: value }));
  }, []);

  const handleYieldChange = useCallback((e) => {
    const { name, value } = e.target;
    if (name === 'quantity') {
      setRecipeData(prev => ({
        ...prev,
        yield: { ...prev.yield, quantity: 1 }
      }));
    } else {
      setRecipeData(prev => ({
        ...prev,
        yield: { ...prev.yield, [name]: value }
      }));
    }
  }, []);

  const handleCertificationChange = useCallback((certName) => (e) => {
    setRecipeData(prev => ({
      ...prev,
      certifications: {
        ...prev.certifications,
        [certName]: e.target.checked
      }
    }));
  }, []);

  const handleAddCustomCert = useCallback(() => {
    const trimmed = newCustomCert.trim();
    if (!trimmed) return;
    
    const currentCustom = recipeData.certifications?.custom || [];
    const allNames = [
      ...currentCustom.map(c => c.toLowerCase()),
      ...['halal', 'eco', 'vege', 'vegan', 'kosher']
    ];
    
    if (allNames.includes(trimmed.toLowerCase())) {
      showError(t('recipes.certifications.duplicateError'));
      return;
    }
    
    setRecipeData(prev => ({
      ...prev,
      certifications: {
        ...prev.certifications,
        custom: [...(prev.certifications?.custom || []), trimmed]
      }
    }));
    setNewCustomCert('');
  }, [newCustomCert, recipeData.certifications, showError, t]);

  const handleRemoveCustomCert = useCallback((certToRemove) => {
    setRecipeData(prev => ({
      ...prev,
      certifications: {
        ...prev.certifications,
        custom: (prev.certifications?.custom || []).filter(c => c !== certToRemove)
      }
    }));
  }, []);

  const handleProductDataChange = useCallback((e) => {
    const { name, value } = e.target;
    setProductData(prev => ({
      ...prev,
      [name]: name === 'quantity' || name === 'minStockLevel' || name === 'maxStockLevel' 
        ? parseFloat(value) || 0 
        : value
    }));
  }, []);

  const handleCreateProduct = useCallback(async () => {
    if (!productData.name || !productData.warehouseId) {
      showError(t('recipes.messages.productSkuAndLocationRequired'));
      return;
    }
    
    try {
      setCreatingProduct(true);
      
      let unitCost = 0;
      const selectedWarehouse = warehouses.find(w => w.id === productData.warehouseId);
      
      const newProductData = {
        ...productData,
        type: 'Produkt gotowy',
        isRawMaterial: false,
        isFinishedProduct: true,
        unitPrice: unitCost > 0 ? unitCost : null,
        batchPrice: null,
        recipeId: recipeId,
        productionCost: unitCost > 0 ? unitCost : null,
        recipeInfo: {
          name: recipeData.name,
          yield: recipeData.yield,
          version: recipeData.version || 1
        }
      };
      
      const createdProduct = await createInventoryItem(newProductData, currentUser.uid);
      
      showSuccess(t('recipes.messages.productCreated', { name: createdProduct.name, warehouse: selectedWarehouse?.name || '' }));
      setCreateProductDialogOpen(false);
      
      const updatedItems = await getAllInventoryItems();
      setInventoryItems(updatedItems);
      
    } catch (error) {
      showError(t('recipes.messages.createProductError', { error: error.message }));
      console.error('Error creating product:', error);
    } finally {
      setCreatingProduct(false);
    }
  }, [productData, warehouses, recipeId, recipeData, currentUser, showSuccess, showError, t]);

  const handleFixYield = useCallback(async () => {
    if (!recipeId) return;
    
    try {
      setSaving(true);
      const result = await fixRecipeYield(recipeId, currentUser.uid);
      showSuccess(result.message);
      
      const updatedRecipe = await getRecipeById(recipeId);
      setRecipeData(updatedRecipe);
    } catch (error) {
      console.error('Błąd podczas naprawiania wydajności:', error);
      showError(t('recipes.messages.fixYieldError'));
    } finally {
      setSaving(false);
    }
  }, [recipeId, currentUser, showSuccess, showError, t]);

  const handleAddInventoryItem = useCallback((item) => {
    if (!item) return;
    
    const existingIndex = recipeData.ingredients.findIndex(
      ing => ing.id === item.id
    );
    
    if (existingIndex >= 0) {
      showError(t('recipes.ingredients.existsError'));
      return;
    }
    
    const newIngredient = {
      _sortId: generateIngredientId(),
      id: item.id,
      name: item.name,
      quantity: '',
      unit: item.unit || 'szt.',
      notes: '',
      casNumber: item.casNumber || ''
    };
    
    setRecipeData(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, newIngredient]
    }));
  }, [recipeData.ingredients, showError, t]);

  const handleAddNewInventoryItem = useCallback(async () => {
    if (!newInventoryItemData.name.trim()) {
      showError(t('recipes.ingredients.newItemDialog.nameRequired'));
      return;
    }

    try {
      setAddingInventoryItem(true);
      
      const itemData = {
        name: newInventoryItemData.name.trim(),
        description: newInventoryItemData.description.trim(),
        category: newInventoryItemData.category,
        unit: newInventoryItemData.unit,
        casNumber: newInventoryItemData.casNumber.trim(),
        barcode: newInventoryItemData.barcode.trim(),
        location: newInventoryItemData.location.trim(),
        minStock: 0,
        maxStock: 0,
        minOrderQuantity: 0
      };
      
      const result = await createInventoryItem(itemData, currentUser.uid);
      
      showSuccess(t('recipes.messages.inventoryItemAdded', { name: result.name }));
      
      const items = await getAllInventoryItems();
      setInventoryItems(items);
      
      const newIngredient = {
        _sortId: generateIngredientId(),
        id: result.id,
        name: result.name,
        quantity: '',
        unit: result.unit || 'g',
        notes: '',
        casNumber: result.casNumber || ''
      };
      
      setRecipeData(prev => ({
        ...prev,
        ingredients: [...prev.ingredients, newIngredient]
      }));
      
      setAddInventoryItemDialogOpen(false);
      setNewInventoryItemData({
        name: '',
        description: '',
        category: 'Surowce',
        unit: 'kg',
        casNumber: '',
        barcode: '',
        location: ''
      });
      
    } catch (error) {
      showError(t('recipes.messages.addInventoryItemError', { error: error.message }));
      console.error('Error adding inventory item:', error);
    } finally {
      setAddingInventoryItem(false);
    }
  }, [newInventoryItemData, currentUser, showSuccess, showError, t]);

  return {
    loading, setLoading,
    saving, setSaving,
    confirmDialog, setConfirmDialog,
    recipeData, setRecipeData,
    inventoryItems, setInventoryItems,
    loadingInventory,
    createProductDialogOpen, setCreateProductDialogOpen,
    creatingProduct,
    warehouses,
    productData, setProductData,
    customers,
    loadingCustomers,
    workstations,
    loadingWorkstations,
    designAttachments, setDesignAttachments,
    rulesAttachments, setRulesAttachments,
    newCustomCert, setNewCustomCert,
    originalRecipeName,
    syncNameDialogOpen, setSyncNameDialogOpen,
    linkedInventoryItem, setLinkedInventoryItem,
    pendingRecipeData,
    syncingName,
    newRecipeId, setNewRecipeId,
    addInventoryItemDialogOpen, setAddInventoryItemDialogOpen,
    newInventoryItemData, setNewInventoryItemData,
    addingInventoryItem,
    currentUser,
    navigate,
    t,
    showSuccess, showError, showWarning, showInfo,
    handleSubmit,
    handleSaveWithoutSync,
    handleSaveWithSync,
    handleChange,
    handleYieldChange,
    handleCertificationChange,
    handleAddCustomCert,
    handleRemoveCustomCert,
    handleProductDataChange,
    handleCreateProduct,
    handleFixYield,
    handleAddInventoryItem,
    handleAddNewInventoryItem,
    saveRecipe,
    fetchPriceLists,
    generateIngredientId: () => generateIngredientId(),
  };
}
