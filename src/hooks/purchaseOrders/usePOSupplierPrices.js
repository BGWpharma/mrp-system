import { getBestSupplierPricesForItems } from '../../services/supplierService';
import { formatAddress } from '../../utils/addressUtils';

export const usePOSupplierPrices = ({
  poData,
  setPoData,
  inventoryItems,
  suppliers,
  supplierSuggestions,
  setSupplierSuggestions,
  setLoadingSupplierSuggestions,
  showSuccess,
  showError
}) => {
  const findBestSuppliers = async () => {
    if (!poData.items || poData.items.length === 0) {
      showError('Brak pozycji w zamówieniu');
      return;
    }

    try {
      setLoadingSupplierSuggestions(true);

      const itemsToCheck = poData.items
        .filter(item => item.inventoryItemId)
        .map(item => ({ itemId: item.inventoryItemId, quantity: item.quantity }));

      if (itemsToCheck.length === 0) {
        showError('Brak pozycji magazynowych do sprawdzenia');
        setLoadingSupplierSuggestions(false);
        return;
      }

      const bestPrices = await getBestSupplierPricesForItems(itemsToCheck);
      setSupplierSuggestions(bestPrices);

      let hasDefaultPrices = false;
      let anyPriceFound = false;

      const updatedItems = poData.items.map(item => {
        if (item.inventoryItemId && bestPrices[item.inventoryItemId]) {
          const bestPrice = bestPrices[item.inventoryItemId];
          anyPriceFound = true;

          const supplier = suppliers.find(s => s.id === bestPrice.supplierId);
          const supplierName = supplier ? supplier.name : 'Nieznany dostawca';

          if (bestPrice.isDefault) hasDefaultPrices = true;

          const discount = item.discount || 0;
          const discountMultiplier = (100 - parseFloat(discount)) / 100;
          const priceAfterDiscount = bestPrice.price * discountMultiplier;

          return {
            ...item,
            supplierPrice: bestPrice.price,
            supplierId: bestPrice.supplierId,
            supplierName,
            unitPrice: bestPrice.price,
            totalPrice: priceAfterDiscount * item.quantity
          };
        }
        return item;
      });

      setPoData(prev => ({ ...prev, items: updatedItems }));

      const supplierCounts = {};
      for (const itemId in bestPrices) {
        const supplierId = bestPrices[itemId].supplierId;
        supplierCounts[supplierId] = (supplierCounts[supplierId] || 0) + 1;
      }

      let bestSupplierId = null;
      let maxCount = 0;
      for (const supplierId in supplierCounts) {
        if (supplierCounts[supplierId] > maxCount) {
          maxCount = supplierCounts[supplierId];
          bestSupplierId = supplierId;
        }
      }

      if (!poData.supplier && bestSupplierId) {
        const supplier = suppliers.find(s => s.id === bestSupplierId);
        if (supplier) {
          setPoData(prev => ({
            ...prev,
            supplier,
            deliveryAddress: supplier.addresses && supplier.addresses.length > 0
              ? formatAddress(supplier.addresses.find(a => a.isMain) || supplier.addresses[0])
              : ''
          }));
        }
      }

      if (hasDefaultPrices) {
        showSuccess('Zastosowano domyślne ceny dostawców');
      } else if (anyPriceFound) {
        showError('Nie znaleziono domyślnych cen dostawców. Zastosowano najlepsze dostępne ceny.');
      } else {
        showError('Nie znaleziono żadnych cen dostawców dla wybranych produktów.');
      }
    } catch (error) {
      console.error('Błąd podczas używania domyślnych cen dostawców:', error);
      showError('Błąd podczas używania domyślnych cen dostawców');
    } finally {
      setLoadingSupplierSuggestions(false);
    }
  };

  const useDefaultSupplierPrices = async () => {
    if (!poData.items || poData.items.length === 0) {
      showError('Brak pozycji w zamówieniu');
      return;
    }

    try {
      setLoadingSupplierSuggestions(true);

      const itemsToCheck = poData.items
        .filter(item => item.inventoryItemId)
        .map(item => ({ itemId: item.inventoryItemId, quantity: item.quantity }));

      if (itemsToCheck.length === 0) {
        showError('Brak pozycji magazynowych do sprawdzenia');
        setLoadingSupplierSuggestions(false);
        return;
      }

      const bestPrices = await getBestSupplierPricesForItems(itemsToCheck);
      setSupplierSuggestions(bestPrices);

      let hasDefaultPrices = false;
      let anyPriceFound = false;

      const updatedItems = poData.items.map(item => {
        if (item.inventoryItemId && bestPrices[item.inventoryItemId]) {
          const bestPrice = bestPrices[item.inventoryItemId];
          anyPriceFound = true;

          const supplier = suppliers.find(s => s.id === bestPrice.supplierId);
          const supplierName = supplier ? supplier.name : 'Nieznany dostawca';

          if (bestPrice.isDefault) hasDefaultPrices = true;

          const discount = item.discount || 0;
          const discountMultiplier = (100 - parseFloat(discount)) / 100;
          const priceAfterDiscount = bestPrice.price * discountMultiplier;

          return {
            ...item,
            supplierPrice: bestPrice.price,
            supplierId: bestPrice.supplierId,
            supplierName,
            unitPrice: bestPrice.price,
            totalPrice: priceAfterDiscount * item.quantity
          };
        }
        return item;
      });

      setPoData(prev => ({ ...prev, items: updatedItems }));

      const supplierCounts = {};
      for (const itemId in bestPrices) {
        const supplierId = bestPrices[itemId].supplierId;
        supplierCounts[supplierId] = (supplierCounts[supplierId] || 0) + 1;
      }

      let bestSupplierId = null;
      let maxCount = 0;
      for (const supplierId in supplierCounts) {
        if (supplierCounts[supplierId] > maxCount) {
          maxCount = supplierCounts[supplierId];
          bestSupplierId = supplierId;
        }
      }

      if (!poData.supplier && bestSupplierId) {
        const supplier = suppliers.find(s => s.id === bestSupplierId);
        if (supplier) {
          setPoData(prev => ({
            ...prev,
            supplier,
            deliveryAddress: supplier.addresses && supplier.addresses.length > 0
              ? formatAddress(supplier.addresses.find(a => a.isMain) || supplier.addresses[0])
              : ''
          }));
        }
      }

      if (hasDefaultPrices) {
        showSuccess('Zastosowano domyślne ceny dostawców');
      } else if (anyPriceFound) {
        showError('Nie znaleziono domyślnych cen dostawców. Zastosowano najlepsze dostępne ceny.');
      } else {
        showError('Nie znaleziono żadnych cen dostawców dla wybranych produktów.');
      }
    } catch (error) {
      console.error('Błąd podczas używania domyślnych cen dostawców:', error);
      showError('Błąd podczas używania domyślnych cen dostawców');
    } finally {
      setLoadingSupplierSuggestions(false);
    }
  };

  const applyBestSupplierPrices = () => {
    if (!supplierSuggestions || Object.keys(supplierSuggestions).length === 0) {
      showError('Brak sugestii dostawców do zastosowania');
      return;
    }

    const updatedItems = poData.items.map(item => {
      if (item.inventoryItemId && supplierSuggestions[item.inventoryItemId]) {
        const suggestion = supplierSuggestions[item.inventoryItemId];
        const discount = item.discount || 0;
        const discountMultiplier = (100 - parseFloat(discount)) / 100;
        const priceAfterDiscount = suggestion.price * discountMultiplier;

        return {
          ...item,
          unitPrice: suggestion.price,
          totalPrice: priceAfterDiscount * item.quantity
        };
      }
      return item;
    });

    setPoData(prev => ({ ...prev, items: updatedItems }));
    showSuccess('Zastosowano sugerowane ceny dostawców');
  };

  const fillMinimumOrderQuantities = () => {
    if (!poData.items || poData.items.length === 0) {
      showError('Brak pozycji w zamówieniu');
      return;
    }

    try {
      const updatedItems = poData.items.map(item => {
        const inventoryItem = inventoryItems.find(i => i.id === item.inventoryItemId);
        if (!inventoryItem) return item;

        const minOrderQuantity = inventoryItem.minOrderQuantity || 0;

        if (minOrderQuantity > 0 && parseFloat(item.quantity) < minOrderQuantity && item.unit === inventoryItem.unit) {
          const discount = item.discount || 0;
          const discountMultiplier = (100 - parseFloat(discount)) / 100;
          const priceAfterDiscount = (item.unitPrice || 0) * discountMultiplier;
          return {
            ...item,
            quantity: minOrderQuantity,
            totalPrice: priceAfterDiscount * minOrderQuantity
          };
        }

        return item;
      });

      const hasChanges = updatedItems.some((updatedItem, index) =>
        updatedItem.quantity !== poData.items[index].quantity
      );

      if (hasChanges) {
        setPoData(prev => ({ ...prev, items: updatedItems }));
        showSuccess('Uzupełniono minimalne ilości zamówienia');
      } else {
        showError('Wszystkie pozycje już spełniają minimalne ilości zamówienia');
      }
    } catch (error) {
      console.error('Błąd podczas uzupełniania minimalnych ilości:', error);
      showError('Wystąpił błąd podczas uzupełniania minimalnych ilości');
    }
  };

  return {
    findBestSuppliers,
    useDefaultSupplierPrices,
    applyBestSupplierPrices,
    fillMinimumOrderQuantities
  };
};

export default usePOSupplierPrices;
