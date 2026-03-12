import { useState, useCallback } from 'react';
import { getAllPriceLists, addPriceListItem } from '../../services/products';

export function useRecipePriceList({ recipeData, newRecipeId, navigate, currentUser, showSuccess, showError, t }) {
  const [addToPriceListDialogOpen, setAddToPriceListDialogOpen] = useState(false);
  const [priceLists, setPriceLists] = useState([]);
  const [loadingPriceLists, setLoadingPriceLists] = useState(false);
  const [addingToPriceList, setAddingToPriceList] = useState(false);
  const [priceListData, setPriceListData] = useState({
    priceListId: '',
    price: 0,
    notes: ''
  });

  const fetchPriceLists = useCallback(async () => {
    try {
      setLoadingPriceLists(true);
      const data = await getAllPriceLists();
      setPriceLists(data);
    } catch (error) {
      console.error('Błąd podczas pobierania list cenowych:', error);
      showError(t('recipes.messages.fetchPriceListsError'));
    } finally {
      setLoadingPriceLists(false);
    }
  }, [showError, t]);

  const handleClosePriceListDialog = useCallback(() => {
    setAddToPriceListDialogOpen(false);
    setPriceListData({ priceListId: '', price: 0, notes: '' });
    
    if (newRecipeId) {
      navigate(`/recipes/${newRecipeId}/edit`, { state: { openProductDialog: true } });
    }
  }, [newRecipeId, navigate]);

  const handlePriceListDataChange = useCallback((field, value) => {
    setPriceListData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleAddToPriceList = useCallback(async () => {
    if (!priceListData.priceListId) {
      showError(t('recipes.messages.selectPriceList'));
      return;
    }

    if (!priceListData.price || priceListData.price < 0) {
      showError(t('recipes.messages.enterValidPrice'));
      return;
    }

    try {
      setAddingToPriceList(true);
      
      const itemData = {
        productId: newRecipeId,
        productName: recipeData.name,
        price: parseFloat(priceListData.price),
        unit: recipeData.yield?.unit || 'szt.',
        notes: priceListData.notes,
        isRecipe: true
      };

      await addPriceListItem(priceListData.priceListId, itemData, currentUser.uid);
      showSuccess(t('recipes.messages.addedToPriceList'));
      handleClosePriceListDialog();
    } catch (error) {
      console.error('Błąd podczas dodawania do listy cenowej:', error);
      showError(t('recipes.messages.addToPriceListError', { error: error.message }));
    } finally {
      setAddingToPriceList(false);
    }
  }, [priceListData, newRecipeId, recipeData, currentUser, handleClosePriceListDialog, showSuccess, showError, t]);

  const handleSkipPriceList = useCallback(() => {
    handleClosePriceListDialog();
  }, [handleClosePriceListDialog]);

  const openPriceListDialog = useCallback(async () => {
    await fetchPriceLists();
    setAddToPriceListDialogOpen(true);
  }, [fetchPriceLists]);

  return {
    addToPriceListDialogOpen, setAddToPriceListDialogOpen,
    priceLists,
    loadingPriceLists,
    addingToPriceList,
    priceListData,
    fetchPriceLists,
    handleClosePriceListDialog,
    handlePriceListDataChange,
    handleAddToPriceList,
    handleSkipPriceList,
    openPriceListDialog,
  };
}
