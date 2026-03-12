import { useState, useEffect, useCallback, useRef } from 'react';
import { getAllInventoryItems, updateInventoryItem } from '../../services/inventory';

export function useRecipeInventoryLink({ recipeId, recipeData, currentUser, setInventoryItems, setConfirmDialog, showSuccess, showError, t }) {
  const [linkInventoryDialogOpen, setLinkInventoryDialogOpen] = useState(false);
  const [linkingInventory, setLinkingInventory] = useState(false);
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [selectedInventoryItem, setSelectedInventoryItem] = useState(null);
  
  const [linkDialogItems, setLinkDialogItems] = useState([]);
  const [linkDialogLoading, setLinkDialogLoading] = useState(false);
  const [linkDialogTotalCount, setLinkDialogTotalCount] = useState(0);
  const linkDialogSearchTimer = useRef(null);
  const linkDialogAllItems = useRef(null);

  const fetchLinkDialogItems = useCallback(async (searchQuery = '') => {
    try {
      setLinkDialogLoading(true);
      
      if (!linkDialogAllItems.current) {
        const allItems = await getAllInventoryItems();
        linkDialogAllItems.current = allItems
          .filter(item => 
            (item.category === 'Gotowe produkty' || item.category === 'Produkty gotowe' || item.isFinishedProduct === true) &&
            item.recipeId !== recipeId
          )
          .sort((a, b) => {
            const aLinked = !!a.recipeId;
            const bLinked = !!b.recipeId;
            if (aLinked !== bLinked) return aLinked ? 1 : -1;
            return (a.name || '').localeCompare(b.name || '', 'pl');
          });
      }
      
      const allAvailable = linkDialogAllItems.current;
      
      let filtered = allAvailable;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        filtered = allAvailable.filter(item => 
          item.name?.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q) ||
          item.category?.toLowerCase().includes(q) ||
          item.recipeInfo?.name?.toLowerCase().includes(q)
        );
      }
      
      setLinkDialogTotalCount(filtered.length);
      setLinkDialogItems(filtered.slice(0, 100));
    } catch (error) {
      console.error('Błąd ładowania pozycji dla dialogu powiązania:', error);
      showError(t('recipes.messages.loadInventoryItemsError'));
    } finally {
      setLinkDialogLoading(false);
    }
  }, [recipeId, showError, t]);

  const handleLinkDialogSearch = useCallback((searchValue) => {
    setInventorySearchQuery(searchValue);
    
    if (linkDialogSearchTimer.current) {
      clearTimeout(linkDialogSearchTimer.current);
    }
    
    linkDialogSearchTimer.current = setTimeout(() => {
      fetchLinkDialogItems(searchValue);
    }, 300);
  }, [fetchLinkDialogItems]);

  useEffect(() => {
    if (linkInventoryDialogOpen) {
      linkDialogAllItems.current = null;
      fetchLinkDialogItems('');
    } else {
      setLinkDialogItems([]);
      setLinkDialogTotalCount(0);
      linkDialogAllItems.current = null;
    }
    
    return () => {
      if (linkDialogSearchTimer.current) {
        clearTimeout(linkDialogSearchTimer.current);
      }
    };
  }, [linkInventoryDialogOpen, fetchLinkDialogItems]);

  const handleLinkExistingInventoryItem = useCallback(async () => {
    if (!selectedInventoryItem) {
      showError(t('recipes.linkInventoryDialog.selectItemError'));
      return;
    }
    
    if (selectedInventoryItem.recipeId) {
      setConfirmDialog({
        open: true,
        title: 'Potwierdzenie',
        message: `Pozycja "${selectedInventoryItem.name}" jest powiązana z recepturą "${selectedInventoryItem.recipeInfo?.name || 'nieznaną'}". Czy na pewno chcesz nadpisać to powiązanie?`,
        onConfirm: async () => {
          setConfirmDialog(prev => ({ ...prev, open: false }));
          try {
            setLinkingInventory(true);
            await updateInventoryItem(selectedInventoryItem.id, {
              name: selectedInventoryItem.name,
              recipeId: recipeId,
              recipeInfo: {
                name: recipeData.name,
                yield: recipeData.yield,
                version: recipeData.version || 1
              },
              isFinishedProduct: true
            }, currentUser.uid);
            showSuccess(t('recipes.linkInventoryDialog.successMessage', { itemName: selectedInventoryItem.name }));
            setLinkInventoryDialogOpen(false);
            setSelectedInventoryItem(null);
            setInventorySearchQuery('');
            const updatedItems = await getAllInventoryItems();
            setInventoryItems(updatedItems);
          } catch (error) {
            showError(t('recipes.messages.createProductError', { error: error.message }));
            console.error('Error linking inventory item:', error);
          } finally {
            setLinkingInventory(false);
          }
        }
      });
      return;
    }
    
    try {
      setLinkingInventory(true);
      
      await updateInventoryItem(selectedInventoryItem.id, {
        name: selectedInventoryItem.name,
        recipeId: recipeId,
        recipeInfo: {
          name: recipeData.name,
          yield: recipeData.yield,
          version: recipeData.version || 1
        },
        isFinishedProduct: true
      }, currentUser.uid);
      
      showSuccess(t('recipes.linkInventoryDialog.successMessage', { itemName: selectedInventoryItem.name }));
      setLinkInventoryDialogOpen(false);
      setSelectedInventoryItem(null);
      setInventorySearchQuery('');
      
      const updatedItems = await getAllInventoryItems();
      setInventoryItems(updatedItems);
      
    } catch (error) {
      showError(t('recipes.linkInventoryDialog.errorMessage', { error: error.message }));
      console.error('Error linking inventory item:', error);
    } finally {
      setLinkingInventory(false);
    }
  }, [selectedInventoryItem, recipeId, recipeData, currentUser, setConfirmDialog, setInventoryItems, showSuccess, showError, t]);

  return {
    linkInventoryDialogOpen, setLinkInventoryDialogOpen,
    linkingInventory,
    inventorySearchQuery, setInventorySearchQuery,
    selectedInventoryItem, setSelectedInventoryItem,
    linkDialogItems,
    linkDialogLoading,
    linkDialogTotalCount,
    handleLinkDialogSearch,
    handleLinkExistingInventoryItem,
  };
}
