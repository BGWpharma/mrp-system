import { useState, useEffect, useCallback } from 'react';
import { getIngredientPrices } from '../../services/inventory';
import { getExchangeRate } from '../../services/finance';
import { useNotification } from '../useNotification';

export const useOrderFormCosts = (orderData, setOrderData, orderId, currentUser) => {
  const [costCalculation, setCostCalculation] = useState(null);
  const [calculatingCosts, setCalculatingCosts] = useState(false);
  const [exchangeRates, setExchangeRates] = useState({ EUR: 1, PLN: 4.3, USD: 1.08 });
  const [loadingRates, setLoadingRates] = useState(false);
  const [invoices, setInvoices] = useState([]);

  const { showSuccess, showError, showInfo } = useNotification();

  // Pobierz kursy walut przy starcie
  useEffect(() => {
    let cancelled = false;
    const doFetchRates = async () => {
      try {
        setLoadingRates(true);
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        
        const currencies = ['EUR', 'PLN', 'USD', 'GBP', 'CHF'];
        const baseCurrency = orderData.currency;
        
        if (!currencies.includes(baseCurrency)) {
          console.warn(`Nieobsługiwana waluta bazowa: ${baseCurrency}. Używam domyślnej waluty EUR.`);
          if (!cancelled) {
            setOrderData(prev => ({ ...prev, currency: 'EUR' }));
          }
          return;
        }
        
        const rates = {};
        rates[baseCurrency] = 1;
        
        const fetchPromises = currencies
          .filter(currency => currency !== baseCurrency)
          .map(async currency => {
            try {
              const rate = await getExchangeRate(currency, baseCurrency, yesterday);
              if (rate > 0) {
                rates[currency] = rate;
              } else {
                console.error(`Otrzymano nieprawidłowy kurs dla ${currency}/${baseCurrency}: ${rate}`);
              }
            } catch (err) {
              console.error(`Błąd podczas pobierania kursu ${currency}/${baseCurrency}:`, err);
            }
          });
        
        await Promise.all(fetchPromises);
        if (cancelled) return;
        
        const missingCurrencies = currencies
          .filter(currency => currency !== baseCurrency && !rates[currency]);
        
        if (missingCurrencies.length > 0) {
          console.warn(`Brak kursów dla walut: ${missingCurrencies.join(', ')}`);
          showInfo('Nie udało się pobrać kursów dla niektórych walut. Przeliczanie między walutami będzie możliwe po wprowadzeniu daty faktury.');
        }
        
        setExchangeRates(rates);
        
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania kursów walut:', error);
        showError('Nie udało się pobrać kursów walut. Przeliczanie między walutami będzie możliwe po wprowadzeniu daty faktury.');
        
        const rates = {};
        rates[orderData.currency || 'EUR'] = 1;
        setExchangeRates(rates);
      } finally {
        if (!cancelled) {
          setLoadingRates(false);
        }
      }
    };
    doFetchRates();
    return () => { cancelled = true; };
  }, []);

  // Przeliczanie walut
  const convertCurrency = useCallback((amount, fromCurrency, toCurrency) => {
    if (!amount || amount === 0) return 0;
    if (fromCurrency === toCurrency) return amount;
    
    const rate = exchangeRates[fromCurrency] / exchangeRates[toCurrency];
    if (!rate) {
      console.error(`Brak kursu dla pary walut ${fromCurrency}/${toCurrency}`);
      showInfo('Aby przeliczać waluty, podaj datę faktury.');
      return amount;
    }
    
    return amount * rate;
  }, [exchangeRates, showInfo]);

  // Kalkulacja kosztów
  const handleCalculateCosts = useCallback(async () => {
    try {
      setCalculatingCosts(true);
      
      if (!orderData.items || orderData.items.length === 0) {
        showError('Zamówienie musi zawierać produkty, aby obliczyć koszty');
        setCalculatingCosts(false);
        return;
      }
      
      const productIds = orderData.items.map(item => item.id).filter(Boolean);
      
      if (productIds.length === 0) {
        showError('Brak prawidłowych identyfikatorów produktów');
        setCalculatingCosts(false);
        return;
      }
      
      const pricesMap = await getIngredientPrices(productIds);
      
      let totalCost = 0;
      let totalRevenue = 0;
      
      const itemsWithCosts = orderData.items.map(item => {
        const productPrice = pricesMap[item.id] || 0;
        const itemCost = productPrice * item.quantity;
        const itemRevenue = item.price * item.quantity;
        
        totalCost += itemCost;
        totalRevenue += itemRevenue;
        
        return {
          ...item,
          cost: itemCost,
          revenue: itemRevenue,
          profit: itemRevenue - itemCost,
          margin: itemCost > 0 ? ((itemRevenue - itemCost) / itemRevenue * 100) : 0
        };
      });
      
      setCostCalculation({
        items: itemsWithCosts,
        totalCost: totalCost,
        totalRevenue: totalRevenue,
        totalProfit: totalRevenue - totalCost,
        profitMargin: totalRevenue > 0 ? ((totalRevenue - totalCost) / totalRevenue * 100) : 0
      });
      
    } catch (error) {
      console.error('Błąd podczas kalkulacji kosztów:', error);
      showError('Nie udało się obliczyć kosztów: ' + error.message);
    } finally {
      setCalculatingCosts(false);
    }
  }, [orderData.items, showError]);

  // Szacowanie kosztów dla wszystkich pozycji
  const calculateEstimatedCostsForAllItems = useCallback(async () => {
    if (!orderId || !currentUser) {
      showError('Musisz najpierw zapisać zamówienie, aby obliczyć szacowane koszty');
      return;
    }
    
    setCalculatingCosts(true);
    let processedItems = 0;
    let updatedItems = 0;
    
    try {
      const { getRecipeById } = await import('../../services/products');
      const { calculateEstimatedMaterialsCost } = await import('../../utils/calculations');
      
      for (let index = 0; index < orderData.items.length; index++) {
        const item = orderData.items[index];
        processedItems++;
        
        const isRecipe = item.itemType === 'recipe' || item.isRecipe;
        if (!isRecipe || !item.recipeId) continue;
        
        if (item.lastUsageInfo && item.lastUsageInfo.cost && item.lastUsageInfo.cost > 0 && !item.lastUsageInfo.estimatedCost) {
          continue;
        }
        
        try {
          const recipe = await getRecipeById(item.recipeId);
          if (!recipe) {
            continue;
          }
          
          const estimatedCost = await calculateEstimatedMaterialsCost(recipe);
          
          if (estimatedCost.totalCost > 0) {
            const updatedItemsArray = [...orderData.items];
            updatedItemsArray[index] = {
              ...updatedItemsArray[index],
              lastUsageInfo: {
                orderId: null,
                orderNumber: 'Szacowany',
                orderDate: new Date(),
                customerName: 'Kalkulacja kosztów',
                quantity: 1,
                price: estimatedCost.totalCost,
                cost: estimatedCost.totalCost,
                unit: recipe.unit || 'szt.',
                totalValue: estimatedCost.totalCost,
                estimatedCost: true,
                costDetails: estimatedCost.details
              }
            };
            
            setOrderData(prev => ({
              ...prev,
              items: updatedItemsArray
            }));
            
            updatedItems++;
          }
        } catch (error) {
          console.error(`Błąd podczas obliczania kosztu dla pozycji ${index}:`, error);
        }
      }
      
      showSuccess(`Przetworzono ${processedItems} pozycji, zaktualizowano ${updatedItems} szacowanych kosztów. Zapisz zamówienie, aby zachować zmiany.`);
      
    } catch (error) {
      console.error('Błąd podczas obliczania szacowanych kosztów:', error);
      showError('Wystąpił błąd podczas obliczania szacowanych kosztów');
    } finally {
      setCalculatingCosts(false);
    }
  }, [orderData.items, orderId, currentUser, setOrderData, showSuccess, showError]);

  // Zarządzanie fakturami
  const handleAddInvoice = useCallback(() => {
    setInvoices(prev => [
      ...prev,
      {
        id: Date.now().toString(),
        number: '',
        date: '',
        status: 'nieopłacona',
        amount: '',
        paidAmount: ''
      }
    ]);
  }, []);

  const handleInvoiceChange = useCallback((id, field, value) => {
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, [field]: value } : inv));
  }, []);

  const handleRemoveInvoice = useCallback((id) => {
    setInvoices(prev => prev.filter(inv => inv.id !== id));
  }, []);

  return {
    costCalculation,
    calculatingCosts,
    exchangeRates,
    loadingRates,
    invoices,

    convertCurrency,
    handleCalculateCosts,
    calculateEstimatedCostsForAllItems,

    handleAddInvoice,
    handleInvoiceChange,
    handleRemoveInvoice,
  };
};
