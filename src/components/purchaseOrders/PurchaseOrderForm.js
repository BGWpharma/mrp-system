import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import {
  Box,
  Button,
  Grid,
  Typography,
  Divider,
  Paper,
  Alert,
  Container
} from '@mui/material';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { 
  createPurchaseOrder, 
  getPurchaseOrderById, 
  updatePurchaseOrder,
  PURCHASE_ORDER_STATUSES
} from '../../services/purchaseOrderService';
import { 
  getAllInventoryItems,
  getAllWarehouses
} from '../../services/inventory';
import { formatDateForInput } from '../../utils/dateUtils';
import { formatAddress } from '../../utils/addressUtils';
import { 
  getAllSuppliers,
  getBestSupplierPriceForItem, 
  getSupplierPriceForItem
} from '../../services/supplierService';
import { getExchangeRate, getExchangeRates } from '../../services/exchangeRateService';
import SavingOverlay from '../common/SavingOverlay';
import PODocumentScanner from './PODocumentScanner';
import {
  POBasicFieldsSection,
  POAdditionalCostsSection,
  POOrderItemsSection,
  POSummarySection,
  POInvoicesAttachmentsSection
} from './form';
import { usePOSupplierPrices, usePODocumentHandlers } from '../../hooks/purchaseOrders';
// ✅ OPTYMALIZACJA: Import wspólnych stylów MUI
import { 
  mb3,
  mt2
} from '../../styles/muiCommonStyles';


const PurchaseOrderForm = ({ orderId }) => {
  const { t, currentLanguage } = useTranslation('purchaseOrders');
  const { poId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  // Używamy orderId z props, a jeśli nie istnieje, to poId z useParams()
  const currentOrderId = orderId || poId;
  
  const [loading, setLoading] = useState(!!currentOrderId && currentOrderId !== 'new');
  const [saving, setSaving] = useState(false);
  const [savingMessage, setSavingMessage] = useState('');
  const [savingSubtitle, setSavingSubtitle] = useState('');
  const [loadingSupplierSuggestions, setLoadingSupplierSuggestions] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [supplierSuggestions, setSupplierSuggestions] = useState({});
  const [exchangeRates, setExchangeRates] = useState({});
  const [loadingRates, setLoadingRates] = useState(false);
  
  // Stan dla skanera dokumentów (WZ/Faktura)
  const [documentScannerOpen, setDocumentScannerOpen] = useState(false);
  
  const [poData, setPoData] = useState({
    number: '',
    supplier: null,
    items: [],
    totalValue: 0,
    totalGross: 0,
    additionalCostsItems: [], // Tablica obiektów z dodatkowymi kosztami
    globalDiscount: 0, // Rabat procentowy dla całej wartości PO
    currency: 'EUR',
    targetWarehouseId: '', // Nowe pole dla magazynu docelowego
    orderDate: formatDateForInput(new Date()),
    expectedDeliveryDate: '',
    deliveryAddress: '',
    incoterms: '', // Warunki dostawy INCOTERMS
    notes: '',
    status: PURCHASE_ORDER_STATUSES.DRAFT,
    invoiceLink: '',
    invoiceLinks: [], // Nowe pole dla wielu linków do faktur
    attachments: [], // Stare pole dla kompatybilności wstecznej
    coaAttachments: [], // Nowe pole dla certyfikatów analizy (CoA)
    invoiceAttachments: [], // Nowe pole dla załączników faktur
    generalAttachments: [], // Nowe pole dla ogólnych załączników
    expandedItems: {},
    expandedCostItems: {} // Nowe pole dla rozwiniętych dodatkowych kosztów
  });

  const {
    findBestSuppliers,
    applyBestSupplierPrices,
    fillMinimumOrderQuantities
  } = usePOSupplierPrices({
    poData, setPoData, inventoryItems, suppliers,
    supplierSuggestions, setSupplierSuggestions, setLoadingSupplierSuggestions,
    showSuccess, showError
  });

  const {
    handleApplyDeliveryUpdates,
    handleApplyInvoiceUpdates
  } = usePODocumentHandlers({ setPoData });

  useEffect(() => {
    let cancelled = false;
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        console.log("Pobieranie danych formularza PO, ID:", currentOrderId);
        
        const [suppliersData, itemsData, warehousesData] = await Promise.all([
          getAllSuppliers(),
          getAllInventoryItems(), 
          getAllWarehouses()
        ]);
        if (cancelled) return;
        
        setSuppliers(suppliersData);
        setInventoryItems(itemsData);
        setWarehouses(warehousesData);
        
        // Jeśli edytujemy istniejące zamówienie, pobierz jego dane
        if (currentOrderId && currentOrderId !== 'new') {
          console.log("Pobieranie danych istniejącego zamówienia:", currentOrderId);
          const poDetails = await getPurchaseOrderById(currentOrderId);
          if (cancelled) return;
          console.log("Pobrane dane zamówienia:", poDetails);
          
          // Zachowaj daty jako obiekty Date
          const orderDate = poDetails.orderDate ? (poDetails.orderDate.toDate ? poDetails.orderDate.toDate() : new Date(poDetails.orderDate)) : new Date();
          const deliveryDate = poDetails.expectedDeliveryDate ? (poDetails.expectedDeliveryDate.toDate ? poDetails.expectedDeliveryDate.toDate() : new Date(poDetails.expectedDeliveryDate)) : null;
          
          // Pobierz obiekty supplier z tablicy wszystkich dostawców
          let matchedSupplier = null;
          if (poDetails.supplier) {
            matchedSupplier = poDetails.supplier;
          } else if (poDetails.supplierId) {
            matchedSupplier = suppliersData.find(s => s.id === poDetails.supplierId);
          }
          
          console.log("Dopasowany dostawca:", matchedSupplier);
          
          // Konwersja ze starego formatu na nowy (jeśli istnieją tylko stare pola)
          let additionalCostsItems = poDetails.additionalCostsItems || [];
          
          // Migracja załączników - jeśli istnieją nowe pola, użyj ich, w przeciwnym razie migruj stare
          let coaAttachments = poDetails.coaAttachments || [];
          let invoiceAttachments = poDetails.invoiceAttachments || [];
          let generalAttachments = poDetails.generalAttachments || [];
          
          // Sprawdź czy nowe pola są puste (nie istnieją lub są pustymi tablicami)
          const hasNewAttachments = (coaAttachments.length > 0) || (invoiceAttachments.length > 0) || (generalAttachments.length > 0);
          const hasOldAttachments = poDetails.attachments && poDetails.attachments.length > 0;
          
          // Jeśli nie ma nowych załączników ale są stare, migruj je do generalAttachments
          if (!hasNewAttachments && hasOldAttachments) {
            console.log('Migrujemy stare załączniki do generalAttachments (fetchInitialData):', poDetails.attachments);
            generalAttachments = [...poDetails.attachments];
          }

          // Używamy oryginalnych pozycji z bazy - totalPrice już uwzględnia rabaty po naprawieniu zapisywania
          
          // Ustaw cały stan formularza za jednym razem, zamiast wielu wywołań setState
          setPoData({
            ...poData,
            ...poDetails,
            orderDate: orderDate,
            expectedDeliveryDate: deliveryDate,
            supplier: matchedSupplier,
            items: poDetails.items || [], // Użyj oryginalnych pozycji z bazy
            additionalCostsItems: additionalCostsItems,
            attachments: poDetails.attachments || [], // Stare pole dla kompatybilności
            coaAttachments: coaAttachments,
            invoiceAttachments: invoiceAttachments,
            generalAttachments: generalAttachments,
          });
        }
      } catch (error) {
        if (cancelled) return;
        console.error('Błąd podczas pobierania danych:', error);
        showError('Nie udało się pobrać danych: ' + error.message);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    fetchInitialData();
    return () => { cancelled = true; };
  }, [currentOrderId, showError, location.state]);
  
  // Funkcja do pobierania kursów walut
  const fetchExchangeRates = () => {
    try {
      setLoadingRates(true);
      
      const currencies = ['EUR', 'PLN', 'USD', 'GBP', 'CHF'];
      const baseCurrency = poData.currency; // Waluta bazowa zamówienia
      
      // Sprawdź, czy baseCurrency jest jedną z obsługiwanych walut
      if (!currencies.includes(baseCurrency)) {
        console.warn(`Nieobsługiwana waluta bazowa: ${baseCurrency}. Używam domyślnej waluty EUR.`);
        setPoData(prev => ({ ...prev, currency: 'EUR' }));
        return; // Funkcja zostanie ponownie wywołana przez useEffect po zmianie currency
      }
      
      // Ustaw puste kursy - wszystkie kursy będą pobierane na podstawie daty faktury lub daty utworzenia PO
      const emptyRates = {};
      emptyRates[baseCurrency] = 1;
      
      for (const currency of currencies) {
        if (currency !== baseCurrency) {
          emptyRates[currency] = 0;
        }
      }
      
      console.log('Ustawiam puste kursy walut - będą pobierane na podstawie daty faktury lub daty utworzenia PO');
      setExchangeRates(emptyRates);
    } catch (error) {
      console.error('Błąd podczas inicjalizacji kursów walut:', error);
      
      // Ustaw puste kursy w razie błędu
      setExchangeRates({
        EUR: poData.currency === 'EUR' ? 1 : 0,
        PLN: poData.currency === 'PLN' ? 1 : 0,
        USD: poData.currency === 'USD' ? 1 : 0,
        GBP: poData.currency === 'GBP' ? 1 : 0,
        CHF: poData.currency === 'CHF' ? 1 : 0
      });
    } finally {
      setLoadingRates(false);
    }
  };
  
  // Pomocnicza funkcja do pobierania domyślnego kursu
  const getDefaultRate = (fromCurrency, toCurrency) => {
    const defaultRates = {
      'EUR': { 'PLN': 0, 'USD': 0, 'GBP': 0, 'CHF': 0 },
      'PLN': { 'EUR': 0, 'USD': 0, 'GBP': 0, 'CHF': 0 },
      'USD': { 'EUR': 0, 'PLN': 0, 'GBP': 0, 'CHF': 0 },
      'GBP': { 'EUR': 0, 'PLN': 0, 'USD': 0, 'CHF': 0 },
      'CHF': { 'EUR': 0, 'PLN': 0, 'USD': 0, 'GBP': 0 }
    };
    
    if (defaultRates[fromCurrency] && defaultRates[fromCurrency][toCurrency] !== undefined) {
      return defaultRates[fromCurrency][toCurrency];
    }
    
    return 0;
  };
  
  // Inicjalizuj kursy walut przy zmianie waluty bazowej
  useEffect(() => {
    fetchExchangeRates();
  }, [poData.currency]);

  // Funkcja do obliczania sumy
  const calculateTotals = useCallback((items = [], additionalCosts = [], globalDiscount = 0) => {
    // Obliczanie wartości netto i VAT dla pozycji produktów
    let itemsNetTotal = 0;
    let itemsVatTotal = 0;
    
    items.forEach(item => {
      const itemNet = parseFloat(item.totalPrice) || 0;
      itemsNetTotal += itemNet;
      
      // Obliczanie VAT dla pozycji na podstawie jej indywidualnej stawki VAT
      const vatRate = typeof item.vatRate === 'number' ? item.vatRate : 0;
      const itemVat = (itemNet * vatRate) / 100;
      itemsVatTotal += itemVat;
    });
    
    // Obliczanie wartości netto i VAT dla dodatkowych kosztów
    let additionalCostsNetTotal = 0;
    let additionalCostsVatTotal = 0;
    
    additionalCosts.forEach(cost => {
      const costNet = parseFloat(cost.value) || 0;
      additionalCostsNetTotal += costNet;
      
      // Obliczanie VAT dla dodatkowego kosztu na podstawie jego indywidualnej stawki VAT
      const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
      const costVat = (costNet * vatRate) / 100;
      additionalCostsVatTotal += costVat;
    });
    
    // Suma wartości netto przed rabatem: produkty + dodatkowe koszty
    const totalNetBeforeDiscount = itemsNetTotal + additionalCostsNetTotal;
    
    // Suma VAT przed rabatem: VAT od produktów + VAT od dodatkowych kosztów
    const totalVatBeforeDiscount = itemsVatTotal + additionalCostsVatTotal;
    
    // Wartość brutto przed rabatem: suma netto + suma VAT
    const totalGrossBeforeDiscount = totalNetBeforeDiscount + totalVatBeforeDiscount;
    
    // Obliczanie rabatu globalnego (stosowany do wartości brutto)
    const globalDiscountMultiplier = (100 - parseFloat(globalDiscount || 0)) / 100;
    const discountAmount = totalGrossBeforeDiscount * (parseFloat(globalDiscount || 0) / 100);
    
    // Końcowe wartości z uwzględnieniem rabatu globalnego
    const totalNet = totalNetBeforeDiscount * globalDiscountMultiplier;
    const totalVat = totalVatBeforeDiscount * globalDiscountMultiplier;
    const totalGross = totalGrossBeforeDiscount * globalDiscountMultiplier;
    
    console.log('Obliczenia calculateTotals:');
    console.log('itemsNetTotal:', itemsNetTotal);
    console.log('itemsVatTotal:', itemsVatTotal);
    console.log('additionalCostsNetTotal:', additionalCostsNetTotal);
    console.log('additionalCostsVatTotal:', additionalCostsVatTotal);
    console.log('totalNetBeforeDiscount:', totalNetBeforeDiscount);
    console.log('totalVatBeforeDiscount:', totalVatBeforeDiscount);
    console.log('totalGrossBeforeDiscount:', totalGrossBeforeDiscount);
    console.log('globalDiscount:', globalDiscount, '%');
    console.log('discountAmount:', discountAmount);
    console.log('totalNet (po rabacie):', totalNet);
    console.log('totalVat (po rabacie):', totalVat);
    console.log('totalGross (po rabacie):', totalGross);
    
    return {
      itemsNetTotal,
      itemsVatTotal,
      additionalCostsNetTotal,
      additionalCostsVatTotal,
      totalNetBeforeDiscount,
      totalVatBeforeDiscount,
      totalGrossBeforeDiscount,
      discountAmount,
      totalNet,
      totalVat,
      totalGross
    };
  }, []);

  // Aktualizacja totali przy zmianie elementów
  useEffect(() => {
    const totals = calculateTotals(poData.items, poData.additionalCostsItems, poData.globalDiscount);
    setPoData(prev => ({
      ...prev,
      totalValue: totals.totalNet,
      totalVat: totals.totalVat,
      totalGross: totals.totalGross,
      itemsNetTotal: totals.itemsNetTotal,
      itemsVatTotal: totals.itemsVatTotal,
      additionalCostsNetTotal: totals.additionalCostsNetTotal,
      additionalCostsVatTotal: totals.additionalCostsVatTotal,
      totalNetBeforeDiscount: totals.totalNetBeforeDiscount,
      totalVatBeforeDiscount: totals.totalVatBeforeDiscount,
      totalGrossBeforeDiscount: totals.totalGrossBeforeDiscount,
      discountAmount: totals.discountAmount
    }));
  }, [poData.items, poData.additionalCostsItems, poData.globalDiscount, calculateTotals]);
  
  // Funkcja do przeliczania totalPrice pozycji z uwzględnieniem rabatu
  const recalculateItemTotalPrice = (item) => {
    const quantity = parseFloat(item.quantity) || 0;
    const discount = parseFloat(item.discount) || 0;
    const discountMultiplier = (100 - discount) / 100;
    
    // Dla pozycji w walucie obcej, najpierw zastosuj rabat do originalUnitPrice, potem przelicz na walutę PO
    if (item.currency && item.currency !== poData.currency && item.originalUnitPrice && item.exchangeRate) {
      const originalPrice = parseFloat(item.originalUnitPrice) || 0;
      const exchangeRate = parseFloat(item.exchangeRate) || 1;
      
      // Zastosuj rabat do oryginalnej ceny, potem przelicz na walutę PO
      const originalPriceAfterDiscount = originalPrice * discountMultiplier;
      const convertedPriceAfterDiscount = originalPriceAfterDiscount * exchangeRate;
      
      return quantity * convertedPriceAfterDiscount;
    }
    
    // Dla pozycji w walucie PO używaj unitPrice
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const priceAfterDiscount = unitPrice * discountMultiplier;
    
    return quantity * priceAfterDiscount;
  };
  
  // Funkcja recalculateAllItemPrices usunięta - nie jest już potrzebna
  // ponieważ totalPrice jest poprawnie zapisywany w bazie z uwzględnieniem rabatów
  
  const handleChange = (e, value) => {
    // Obsługa przypadku gdy funkcja jest wywoływana z nazwą i wartością
    if (typeof e === 'string' && value !== undefined) {
      const name = e;
      setPoData(prev => ({ ...prev, [name]: value }));
      return;
    }
    
    // Standardowa obsługa gdy przekazywany jest event
    const { name, value: eventValue } = e.target;
    setPoData(prev => ({ ...prev, [name]: eventValue }));
  };
  
  const handleDateChange = (name, date) => {
    console.log(`Zmiana daty ${name}:`, date);
    
    if (date) {
      try {
        // Sprawdź czy data jest prawidłowa
        if (!(date instanceof Date) || isNaN(date.getTime())) {
          console.warn(`Nieprawidłowa data dla ${name}:`, date);
          setPoData(prev => ({ ...prev, [name]: null }));
          return;
        }
        
        // Zapisz obiekt Date bezpośrednio - nie konwertuj na string
        console.log(`Ustawiam datę ${name}:`, date);
        setPoData(prev => ({ ...prev, [name]: date }));
      } catch (error) {
        console.error(`Błąd podczas ustawienia daty ${name}:`, error);
        // W przypadku błędu, ustaw null
        setPoData(prev => ({ ...prev, [name]: null }));
      }
    } else {
      console.log(`Usunięcie daty ${name}`);
      setPoData(prev => ({ ...prev, [name]: null }));
    }
  };
  
  const handleSupplierChange = (event, newValue) => {
    setPoData({ 
      ...poData, 
      supplier: newValue,
      // Jeśli dostawca ma adresy, ustaw domyślny adres dostawy na adres główny lub pierwszy z listy
      deliveryAddress: newValue && newValue.addresses && newValue.addresses.length > 0
        ? formatAddress(newValue.addresses.find(a => a.isMain) || newValue.addresses[0])
        : ''
    });
  };
  
  const handleAddItem = () => {
    setPoData(prev => ({
      ...prev,
      items: [...prev.items, {
        id: `temp-${Date.now()}`,
        name: '',
        quantity: 1,
        unit: 'szt',
        unitPrice: 0,
        totalPrice: 0,
        discount: 0, // Domyślny rabat 0%
        vatRate: 0, // Domyślna stawka VAT 0%
        currency: poData.currency, // Domyślna waluta zgodna z zamówieniem
        originalUnitPrice: 0, // Wartość w oryginalnej walucie
        exchangeRate: 1, // Kurs wymiany
        invoiceNumber: '', // Numer faktury
        invoiceDate: '', // Data faktury
        paymentDueDate: '', // Termin płatności
        plannedDeliveryDate: '', // Planowana data dostawy
        actualDeliveryDate: '', // Rzeczywista data dostawy
        expiryDate: '', // Data ważności
        noExpiryDate: false // Brak daty ważności
      }]
    }));
  };
  
  const handleRemoveItem = (index) => {
    const updatedItems = [...poData.items];
    updatedItems.splice(index, 1);
    setPoData(prev => ({ ...prev, items: updatedItems }));
  };
  
  const handleItemChange = async (index, field, value) => {
    // Pobranie aktualnej pozycji przed zmianą
    const currentItem = poData.items[index];
    if (!currentItem) return;

    // Specjalna obsługa dla zmiany daty faktury
    if (field === 'invoiceDate' && value) {
      try {
        // Uaktualnij datę faktury zawsze (niezależnie od waluty)
        let updatedItems = [...poData.items];
        updatedItems[index] = {
          ...updatedItems[index],
          invoiceDate: value
        };
        
        // Sprawdź czy data jest kompletna i poprawna przed próbą pobrania kursu
        const invoiceDate = new Date(value);
        const isValidDate = !isNaN(invoiceDate.getTime()) && 
                           invoiceDate.getFullYear() > 1900 && 
                           invoiceDate.getFullYear() < 2100;
        
        // Pobierz kurs tylko jeśli:
        // 1. Data jest kompletna i poprawna
        // 2. Waluta pozycji jest inna niż waluta zamówienia i nie jest to EUR
        if (isValidDate && 
            currentItem.currency && 
            currentItem.currency !== poData.currency && 
            !(currentItem.currency === 'EUR' && poData.currency === 'EUR')) {
          
          const rateFetchDate = new Date(invoiceDate);
          rateFetchDate.setDate(rateFetchDate.getDate() - 1);
          
          console.log(`Dla faktury z datą ${value} pobieram kurs z dnia ${rateFetchDate.toISOString().split('T')[0]}`);
          
          let rate = 0;
          try {
            rate = await getExchangeRate(currentItem.currency, poData.currency, rateFetchDate);
            console.log(`Pobrany kurs dla ${currentItem.currency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}: ${rate}`);
            
            // Aktualizuj pozycję z nowym kursem i przeliczoną wartością
            const originalPrice = parseFloat(currentItem.originalUnitPrice) || parseFloat(currentItem.unitPrice) || 0;
            const convertedPrice = originalPrice * rate;
            
            updatedItems[index] = {
              ...updatedItems[index],
              exchangeRate: rate,
              unitPrice: convertedPrice.toFixed(6),
              totalPrice: (convertedPrice * currentItem.quantity).toFixed(2)
            };
            
            // Aktualizuj kursy dla wszystkich pozycji z tą samą walutą i datą faktury
            if (rate > 0) {
              updateItemExchangeRates(currentItem.currency, value, rate);
            }
          } catch (error) {
            console.error(`Błąd podczas pobierania kursu dla ${currentItem.currency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}:`, error);
            showError(`Nie udało się pobrać kursu dla ${currentItem.currency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}.`);
          }
        } else if (!isValidDate && currentItem.currency && currentItem.currency !== poData.currency) {
          // Jeśli data jest niepełna ale istnieje waluta inna niż domyślna, wyczyść kurs
          console.log(`Data faktury ${value} jest niepełna - nie pobieram kursu`);
        }
        
        setPoData(prev => ({ ...prev, items: updatedItems }));
        return;
      } catch (error) {
        console.error('Błąd podczas przetwarzania daty faktury:', error);
        // W przypadku błędu, i tak aktualizuj datę faktury
        let updatedItems = [...poData.items];
        updatedItems[index] = {
          ...updatedItems[index],
          invoiceDate: value
        };
        setPoData(prev => ({ ...prev, items: updatedItems }));
        return;
      }
    }
    
    // Specjalna obsługa dla zmiany waluty
    if (field === 'currency') {
      const newCurrency = value;
      const oldCurrency = currentItem.currency || poData.currency;
      
      // Jeśli zmieniono walutę, przelicz wartość
      if (newCurrency !== oldCurrency) {
        try {
          console.log(`Zmiana waluty pozycji z ${oldCurrency} na ${newCurrency}`);
          const originalPrice = parseFloat(currentItem.originalUnitPrice) || parseFloat(currentItem.unitPrice) || 0;
          
          // Przygotuj aktualizowaną pozycję
          let updatedItems = [...poData.items];
          
          // Najpierw zaktualizuj walutę i zachowaj oryginalną wartość
          updatedItems[index] = {
            ...updatedItems[index],
            currency: newCurrency,
            originalUnitPrice: originalPrice
          };
          
          // Jeśli nowa waluta to EUR i waluta zamówienia to również EUR, nie przewalutowuj
          if (newCurrency === 'EUR' && poData.currency === 'EUR') {
            updatedItems[index] = {
              ...updatedItems[index],
              exchangeRate: 1,
              unitPrice: originalPrice.toFixed(6)
            };
            
            // Użyj recalculateItemTotalPrice żeby uwzględnić rabat
            updatedItems[index].totalPrice = recalculateItemTotalPrice(updatedItems[index]).toFixed(2);
            
            setPoData(prev => ({ ...prev, items: updatedItems }));
            return;
          }
          
          // Jeśli mamy datę faktury, użyj daty poprzedzającej do pobrania kursu
          if (currentItem.invoiceDate) {
            const invoiceDate = new Date(currentItem.invoiceDate);
            const rateFetchDate = new Date(invoiceDate);
            rateFetchDate.setDate(rateFetchDate.getDate() - 1);
            
            console.log(`Pobieranie kursu dla zmiany waluty z datą faktury ${currentItem.invoiceDate}, data kursu: ${rateFetchDate.toISOString().split('T')[0]}`);
            
            let rate = 0;
            try {
              rate = await getExchangeRate(newCurrency, poData.currency, rateFetchDate);
              console.log(`Pobrany kurs dla ${newCurrency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}: ${rate}`);
              
              // Przelicz wartość
              const convertedPrice = originalPrice * rate;
              
              // Aktualizuj pozycję z nowym kursem i przeliczoną wartością
              updatedItems[index] = {
                ...updatedItems[index],
                exchangeRate: rate,
                unitPrice: convertedPrice.toFixed(6)
              };
              
              // Użyj funkcji recalculateItemTotalPrice do obliczenia totalPrice z rabatem
              updatedItems[index].totalPrice = recalculateItemTotalPrice(updatedItems[index]).toFixed(2);
              
              // Aktualizacja kursów dla wszystkich pozycji z tą samą walutą i datą faktury
              if (rate > 0) {
                updateItemExchangeRates(newCurrency, currentItem.invoiceDate, rate);
              }
            } catch (error) {
              console.error(`Błąd podczas pobierania kursu dla ${newCurrency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}:`, error);
              showError(`Nie udało się pobrać kursu dla ${newCurrency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}.`);
              
              // Ustaw kurs na 0 w przypadku błędu
              updatedItems[index] = {
                ...updatedItems[index],
                exchangeRate: 0
              };
            }
          } else {
            // Jeśli nie mamy daty faktury, użyj daty utworzenia PO
            const orderDate = new Date(poData.orderDate);
            console.log(`Brak daty faktury. Używam daty utworzenia PO: ${orderDate.toISOString().split('T')[0]}`);
            
            let rate = 0;
            try {
              rate = await getExchangeRate(newCurrency, poData.currency, orderDate);
              console.log(`Pobrany kurs dla ${newCurrency}/${poData.currency} z dnia utworzenia PO ${orderDate.toISOString().split('T')[0]}: ${rate}`);
              
              // Przelicz wartość
              const convertedPrice = originalPrice * rate;
              
              // Aktualizuj pozycję z nowym kursem i przeliczoną wartością
              updatedItems[index] = {
                ...updatedItems[index],
                exchangeRate: rate,
                unitPrice: convertedPrice.toFixed(6)
              };
              
              // Użyj funkcji recalculateItemTotalPrice do obliczenia totalPrice z rabatem
              updatedItems[index].totalPrice = recalculateItemTotalPrice(updatedItems[index]).toFixed(2);
              
              showSuccess(`Zastosowano kurs z dnia utworzenia PO (${orderDate.toISOString().split('T')[0]}) dla waluty ${newCurrency}: ${rate}`);
            } catch (error) {
              console.error(`Błąd podczas pobierania kursu dla ${newCurrency}/${poData.currency} z dnia ${orderDate.toISOString().split('T')[0]}:`, error);
              showError(`Nie udało się pobrać kursu dla ${newCurrency}/${poData.currency} z dnia ${orderDate.toISOString().split('T')[0]}.`);
              
              // Ustaw kurs na 0 w przypadku błędu
              updatedItems[index] = {
                ...updatedItems[index],
                exchangeRate: 0
              };
            }
          }
          
          setPoData(prev => ({ ...prev, items: updatedItems }));
          return;
        } catch (error) {
          console.error('Błąd podczas zmiany waluty:', error);
        }
      }
    }
    
    // Specjalna obsługa dla zmiany kursu waluty ręcznie
    if (field === 'exchangeRate') {
      const newRate = parseFloat(value) || 0;
      
      // Jeśli waluta pozycji jest inna niż waluta zamówienia, przelicz wartość
      if (currentItem.currency && currentItem.currency !== poData.currency) {
        try {
          const originalPrice = parseFloat(currentItem.originalUnitPrice) || 0;
          const convertedPrice = originalPrice * newRate;
          
          const updatedItems = poData.items.map((item, i) => {
            if (i === index) {
              const updatedItem = { 
                ...item, 
                exchangeRate: newRate,
                unitPrice: convertedPrice.toFixed(6)
              };
              // Użyj funkcji recalculateItemTotalPrice do obliczenia totalPrice z rabatem
              updatedItem.totalPrice = recalculateItemTotalPrice(updatedItem).toFixed(2);
              return updatedItem;
            }
            return item;
          });
          
          setPoData(prev => ({ ...prev, items: updatedItems }));
          
          // Aktualizuj wszystkie powiązane pozycje z tą samą walutą i datą faktury
          if (newRate > 0 && currentItem.invoiceDate) {
            updateItemExchangeRates(currentItem.currency, currentItem.invoiceDate, newRate);
          }
          
          return;
        } catch (error) {
          console.error('Błąd podczas przeliczania wartości z nowym kursem:', error);
        }
      }
    }
    
    // Specjalna obsługa dla zmiany unitPrice gdy waluta jest inna niż domyślna
    if (field === 'unitPrice') {
      // Jeśli waluta pozycji jest inna niż waluta zamówienia
      if (currentItem.currency && currentItem.currency !== poData.currency) {
        try {
          // Zachowujemy oryginalną cenę, a nie przeliczoną
          const newUnitPrice = parseFloat(value) || 0;
          
          // Przygotuj aktualizowaną pozycję
          let updatedItems = [...poData.items];
          
          // Pobierz kurs
          const rate = parseFloat(currentItem.exchangeRate) || 0;
          
          // Aktualizuj originalUnitPrice, a unitPrice przelicz na podstawie kursu
          const convertedPrice = newUnitPrice * rate;
          
          updatedItems[index] = {
            ...updatedItems[index],
            originalUnitPrice: newUnitPrice,
            unitPrice: convertedPrice.toFixed(6),
            totalPrice: (convertedPrice * currentItem.quantity).toFixed(2)
          };
          
          setPoData(prev => ({ ...prev, items: updatedItems }));
          return;
        } catch (error) {
          console.error('Błąd podczas aktualizacji ceny jednostkowej w walucie obcej:', error);
        }
      }
    }
    
    // Standardowa obsługa dla pozostałych przypadków
    const updatedItems = [...poData.items];
    
    // Dla pola vatRate upewnij się, że nie jest undefined
    if (field === 'vatRate' && value === undefined) {
      value = 0; // Domyślna wartość VAT
    }
    
    updatedItems[index][field] = value;
    
    // Przelicz totalPrice jeśli zmieniono quantity, unitPrice, discount lub currency
    if (field === 'quantity' || field === 'unitPrice' || field === 'discount' || field === 'currency') {
      const quantity = field === 'quantity' ? value : updatedItems[index].quantity;
      const unitPrice = field === 'unitPrice' ? value : updatedItems[index].unitPrice;
      const discount = field === 'discount' ? value : (updatedItems[index].discount || 0);
      
      // Użyj poprawionej funkcji przeliczania która uwzględnia waluty obce
      updatedItems[index].totalPrice = recalculateItemTotalPrice(updatedItems[index]).toFixed(2);
      
      // Jeśli zmieniono unitPrice i waluta pozycji jest taka sama jak waluta zamówienia
      if (field === 'unitPrice' && (!updatedItems[index].currency || updatedItems[index].currency === poData.currency)) {
        updatedItems[index].originalUnitPrice = unitPrice;
      }
      
      // Jeśli zmieniono walutę pozycji, wyzeruj kursy wymiany aby wymusić ponowne pobieranie
      if (field === 'currency') {
        const newCurrency = updatedItems[index].currency;
        
        if (newCurrency === poData.currency) {
          // Powrót do waluty bazowej PO - przywróć oryginalną cenę
          updatedItems[index].exchangeRate = 1;
          
          // Przywróć oryginalną cenę z originalUnitPrice (przed przeliczeniem na obcą walutę)
          const originalPrice = parseFloat(currentItem.originalUnitPrice) || 0;
          updatedItems[index].unitPrice = originalPrice;
          updatedItems[index].originalUnitPrice = originalPrice;
        } else {
          // Zmiana na walutę obcą - wyzeruj kurs aby wymusić pobieranie
          updatedItems[index].exchangeRate = 0;
          // Zachowaj aktualną cenę jako oryginalną dla nowej waluty
          updatedItems[index].originalUnitPrice = updatedItems[index].unitPrice || 0;
        }
      }
    }
    
    setPoData(prev => ({ ...prev, items: updatedItems }));
  };
  
  const handleItemSelect = (index, selectedItem) => {
    if (!selectedItem) return;
    
    console.log(`[DEBUG] handleItemSelect - Wybrano pozycję:`, selectedItem);
    console.log(`[DEBUG] handleItemSelect - minOrderQuantity:`, selectedItem.minOrderQuantity);
    
    // Sprawdź czy dostawca ma cenę dla tego przedmiotu
    if (poData.supplier && poData.supplier.id) {
      (async () => {
        try {
          console.log(`[DEBUG] Sprawdzam cenę dla dostawcy ${poData.supplier.id} i produktu ${selectedItem.id}`);
          const supplierPrice = await getSupplierPriceForItem(selectedItem.id, poData.supplier.id);
          
          if (supplierPrice) {
            console.log(`[DEBUG] Znaleziono cenę dostawcy:`, supplierPrice);
            console.log(`[DEBUG] minQuantity z ceny dostawcy:`, supplierPrice.minQuantity);
            
            // Aktualizuj pozycję z ceną dostawcy
            const updatedItems = [...poData.items];
            const discount = updatedItems[index].discount || 0;
            const quantity = updatedItems[index].quantity || Math.max(1, supplierPrice.minQuantity || 1);
            const unitPrice = supplierPrice.price || 0;
            const discountMultiplier = (100 - parseFloat(discount)) / 100;
            const priceAfterDiscount = unitPrice * discountMultiplier;
            
            updatedItems[index] = {
              ...updatedItems[index],
              inventoryItemId: selectedItem.id,
              name: selectedItem.name,
              unit: selectedItem.unit || 'szt',
              // Używamy ceny dostawcy
              unitPrice: unitPrice,
              // Zachowujemy istniejącą ilość, jeśli jest, lub używamy minQuantity, jeśli jest większe od 1
              quantity: quantity,
              totalPrice: quantity * priceAfterDiscount,
              discount: discount, // Zachowujemy istniejący rabat
              vatRate: updatedItems[index].vatRate || 0, // Zachowujemy stawkę VAT lub ustawiamy domyślną 0%
              minOrderQuantity: supplierPrice.minQuantity || selectedItem.minOrderQuantity || 0,
              // Zachowujemy istniejące wartości dla nowych pól lub ustawiamy domyślne
              currency: updatedItems[index].currency || poData.currency,
              originalUnitPrice: supplierPrice.price || 0,
              exchangeRate: updatedItems[index].currency === poData.currency ? 1 : (updatedItems[index].exchangeRate || 0),
              invoiceNumber: updatedItems[index].invoiceNumber || '',
              invoiceDate: updatedItems[index].invoiceDate || '',
              paymentDueDate: updatedItems[index].paymentDueDate || '',
              plannedDeliveryDate: updatedItems[index].plannedDeliveryDate || '',
              actualDeliveryDate: updatedItems[index].actualDeliveryDate || '',
              // Automatycznie oznacz "brak daty ważności" dla opakowań
              noExpiryDate: (selectedItem.category === 'Opakowania jednostkowe' || selectedItem.category === 'Opakowania zbiorcze') ? true : (updatedItems[index].noExpiryDate || false),
              // Wyczyść datę ważności dla opakowań
              expiryDate: (selectedItem.category === 'Opakowania jednostkowe' || selectedItem.category === 'Opakowania zbiorcze') ? null : (updatedItems[index].expiryDate || '')
            };
            
            console.log(`[DEBUG] Aktualizacja pozycji z ceną dostawcy:`, updatedItems[index]);
            setPoData(prev => ({ ...prev, items: updatedItems }));
            
            // Pokaż informację o cenie dostawcy
            showSuccess(`Zastosowano cenę dostawcy: ${supplierPrice.price} ${poData.currency}`);
            
            // Pokaż informację o automatycznym zaznaczeniu "brak daty ważności" dla opakowań
            if (selectedItem.category === 'Opakowania jednostkowe' || selectedItem.category === 'Opakowania zbiorcze') {
              showSuccess('Automatycznie zaznaczono "brak daty ważności" dla opakowania');
            }
            return;
          } else {
            console.log(`[DEBUG] Nie znaleziono ceny dostawcy`);
          }
        } catch (error) {
          console.error('Błąd podczas sprawdzania ceny dostawcy:', error);
        }
      })();
    }
    
    // Jeśli nie ma ceny dostawcy lub wystąpił błąd, używamy domyślnych wartości
    const updatedItems = [...poData.items];
    const discount = updatedItems[index].discount || 0;
    const quantity = updatedItems[index].quantity || 1;
    const unitPrice = updatedItems[index].unitPrice || 0;
    const discountMultiplier = (100 - parseFloat(discount)) / 100;
    const priceAfterDiscount = unitPrice * discountMultiplier;
    
    updatedItems[index] = {
      ...updatedItems[index],
      inventoryItemId: selectedItem.id,
      name: selectedItem.name,
      unit: selectedItem.unit || 'szt',
      // Zachowujemy istniejące wartości jeśli są, lub ustawiamy domyślne
      quantity: quantity,
      unitPrice: unitPrice,
      totalPrice: quantity * priceAfterDiscount,
      discount: discount, // Zachowujemy istniejący rabat
      vatRate: updatedItems[index].vatRate || 0, // Zachowujemy stawkę VAT lub ustawiamy domyślną 0%
      minOrderQuantity: selectedItem.minOrderQuantity || 0,
      // Zachowujemy istniejące wartości dla nowych pól lub ustawiamy domyślne
      currency: updatedItems[index].currency || poData.currency,
      originalUnitPrice: updatedItems[index].unitPrice || 0,
      exchangeRate: updatedItems[index].currency === poData.currency ? 1 : (updatedItems[index].exchangeRate || 0),
      invoiceNumber: updatedItems[index].invoiceNumber || '',
      invoiceDate: updatedItems[index].invoiceDate || '',
      paymentDueDate: updatedItems[index].paymentDueDate || '',
      plannedDeliveryDate: updatedItems[index].plannedDeliveryDate || '',
      actualDeliveryDate: updatedItems[index].actualDeliveryDate || '',
      // Automatycznie oznacz "brak daty ważności" dla opakowań
      noExpiryDate: (selectedItem.category === 'Opakowania jednostkowe' || selectedItem.category === 'Opakowania zbiorcze') ? true : (updatedItems[index].noExpiryDate || false),
      // Wyczyść datę ważności dla opakowań
      expiryDate: (selectedItem.category === 'Opakowania jednostkowe' || selectedItem.category === 'Opakowania zbiorcze') ? null : (updatedItems[index].expiryDate || '')
    };
    
    console.log(`[DEBUG] Aktualizacja pozycji bez ceny dostawcy:`, updatedItems[index]);
    setPoData(prev => ({ ...prev, items: updatedItems }));
    
    // Pokaż informację o automatycznym zaznaczeniu "brak daty ważności" dla opakowań
    if (selectedItem.category === 'Opakowania jednostkowe' || selectedItem.category === 'Opakowania zbiorcze') {
      showSuccess('Automatycznie zaznaczono "brak daty ważności" dla opakowania');
    }
  };
  
  // Funkcja savePurchaseOrder do zapisu lub aktualizacji zamówienia
  const savePurchaseOrder = async (orderData, orderId, userId) => {
    try {
      let result;
      
      // Upewnij się, że wszystkie wartości unitPrice i value mają odpowiednią precyzję
      if (orderData.items && orderData.items.length > 0) {
        orderData.items = orderData.items.map(item => {
          const unitPrice = parseFloat(item.unitPrice) || 0;
          const quantity = parseFloat(item.quantity) || 0;
          const discount = parseFloat(item.discount) || 0;
          
          // Oblicz totalPrice z uwzględnieniem rabatu
          const discountMultiplier = (100 - discount) / 100;
          let totalPrice;
          
          // Dla pozycji w walucie obcej, zastosuj rabat do originalUnitPrice przed przeliczeniem
          if (item.currency && item.currency !== poData.currency && item.originalUnitPrice && item.exchangeRate) {
            const originalPrice = parseFloat(item.originalUnitPrice) || 0;
            const exchangeRate = parseFloat(item.exchangeRate) || 1;
            const originalPriceAfterDiscount = originalPrice * discountMultiplier;
            const convertedPriceAfterDiscount = originalPriceAfterDiscount * exchangeRate;
            totalPrice = (quantity * convertedPriceAfterDiscount).toFixed(2);
          } else {
            // Dla pozycji w walucie PO
            const priceAfterDiscount = unitPrice * discountMultiplier;
            totalPrice = (quantity * priceAfterDiscount).toFixed(2);
          }
          
          return {
            ...item,
            unitPrice: unitPrice.toFixed(6), // Zapewniamy 6 miejsc po przecinku
            totalPrice: totalPrice,
            // Konwertuj daty do ISO string dla kompatybilności z listą
            invoiceDate: (() => {
              // Walidacja i czyszczenie nieprawidłowych dat
              if (!item.invoiceDate) return null;
              
              let cleanDate = null;
              if (item.invoiceDate instanceof Date) {
                // Sprawdź czy rok jest rozsądny
                const year = item.invoiceDate.getFullYear();
                if (year > 1900 && year < 2100) {
                  cleanDate = item.invoiceDate.toISOString();
                } else {
                  cleanDate = null;
                }
              } else if (typeof item.invoiceDate === 'string') {
                // Sprawdź czy string zawiera prawidłowy rok
                if (item.invoiceDate.match(/^\d{4}-/) && !item.invoiceDate.startsWith('0')) {
                  cleanDate = item.invoiceDate;
                } else {
                  cleanDate = null;
                }
              }
              
              return cleanDate;
            })(),
            plannedDeliveryDate: (() => {
              // Walidacja i czyszczenie nieprawidłowych dat
              if (!item.plannedDeliveryDate) return null;
              
              let cleanDate = null;
              if (item.plannedDeliveryDate instanceof Date) {
                // Sprawdź czy rok jest rozsądny
                const year = item.plannedDeliveryDate.getFullYear();
                if (year > 1900 && year < 2100) {
                  cleanDate = item.plannedDeliveryDate.toISOString();
                } else {
                  cleanDate = null;
                }
              } else if (typeof item.plannedDeliveryDate === 'string') {
                // Sprawdź czy string zawiera prawidłowy rok
                if (item.plannedDeliveryDate.match(/^\d{4}-/) && !item.plannedDeliveryDate.startsWith('0')) {
                  cleanDate = item.plannedDeliveryDate;
                } else {
                  cleanDate = null;
                }
              }
              
              return cleanDate;
            })(),
            actualDeliveryDate: (() => {
              // Walidacja i czyszczenie nieprawidłowych dat
              if (!item.actualDeliveryDate) return null;
              
              let cleanDate = null;
              if (item.actualDeliveryDate instanceof Date) {
                // Sprawdź czy rok jest rozsądny
                const year = item.actualDeliveryDate.getFullYear();
                if (year > 1900 && year < 2100) {
                  cleanDate = item.actualDeliveryDate.toISOString();
                } else {
                  cleanDate = null;
                }
              } else if (typeof item.actualDeliveryDate === 'string') {
                // Sprawdź czy string zawiera prawidłowy rok
                if (item.actualDeliveryDate.match(/^\d{4}-/) && !item.actualDeliveryDate.startsWith('0')) {
                  cleanDate = item.actualDeliveryDate;
                } else {
                  cleanDate = null;
                }
              }
              
              return cleanDate;
            })()
          };
        });
      }

      // Upewnij się, że wszystkie wartości kosztów dodatkowych mają odpowiednią precyzję
      if (orderData.additionalCostsItems && orderData.additionalCostsItems.length > 0) {
        orderData.additionalCostsItems = orderData.additionalCostsItems.map(cost => {
          const value = parseFloat(cost.value) || 0;
          return {
            ...cost,
            value: value.toFixed(6), // Zapewniamy 6 miejsc po przecinku
            // Konwertuj datę faktury do ISO string dla kompatybilności z listą
            invoiceDate: (() => {
              // Walidacja i czyszczenie nieprawidłowych dat
              if (!cost.invoiceDate) return null;
              
              let cleanDate = null;
              if (cost.invoiceDate instanceof Date) {
                // Sprawdź czy rok jest rozsądny
                const year = cost.invoiceDate.getFullYear();
                if (year > 1900 && year < 2100) {
                  cleanDate = cost.invoiceDate.toISOString();
                } else {
                  cleanDate = null;
                }
              } else if (typeof cost.invoiceDate === 'string') {
                // Sprawdź czy string zawiera prawidłowy rok
                if (cost.invoiceDate.match(/^\d{4}-/) && !cost.invoiceDate.startsWith('0')) {
                  cleanDate = cost.invoiceDate;
                } else {
                  cleanDate = null;
                }
              }
              
              return cleanDate;
            })()
          };
        });
      }
      
      // Obliczanie wartości przy użyciu funkcji calculateTotals
      const totals = calculateTotals(orderData.items, orderData.additionalCostsItems, orderData.globalDiscount);
      
      // Dodaj obliczone wartości do zapisywanych danych
      orderData.totalValue = totals.totalNet;
      orderData.totalGross = totals.totalGross;
      orderData.totalVat = totals.totalVat;
      
      // Konwertuj główne daty zamówienia do ISO string dla kompatybilności z listą
      if (orderData.orderDate instanceof Date) {
        orderData.orderDate = orderData.orderDate.toISOString();
      }
      if (orderData.expectedDeliveryDate instanceof Date) {
        orderData.expectedDeliveryDate = orderData.expectedDeliveryDate.toISOString();
      }
      
      console.log(`Zapisuję PO, wartość brutto: ${totals.totalGross} (netto produkty: ${totals.itemsNetTotal}, VAT produkty: ${totals.itemsVatTotal}, netto koszty: ${totals.additionalCostsNetTotal}, VAT koszty: ${totals.additionalCostsVatTotal})`);
      
      // Rozróżnienie między tworzeniem nowego zamówienia a aktualizacją istniejącego
      if (orderId && orderId !== 'new') {
        // Aktualizacja istniejącego zamówienia
        result = await updatePurchaseOrder(orderId, {
          ...orderData,
          updatedBy: userId
        }, userId);
        console.log('Zaktualizowano zamówienie zakupu:', result);
      } else {
        // Tworzenie nowego zamówienia
        result = await createPurchaseOrder({
          ...orderData,
          createdBy: userId
        }, userId);
        console.log('Utworzono nowe zamówienie zakupu:', result);
      }
      
      return result;
    } catch (error) {
      console.error('Błąd podczas zapisywania zamówienia:', error);
      throw error;
    }
  };
  
  // Funkcja validateForm do walidacji formularza
  const validateForm = () => {
    // Sprawdź czy wybrano dostawcę
    if (!poData.supplier) {
      showError('Wybierz dostawcę');
      return false;
    }
    
    // Sprawdź czy wybrano magazyn docelowy
    if (!poData.targetWarehouseId) {
      showError('Wybierz magazyn docelowy');
      return false;
    }
    
    // Sprawdź czy dodano przynajmniej jeden przedmiot
    if (poData.items.length === 0) {
      showError('Dodaj przynajmniej jeden przedmiot do zamówienia');
      return false;
    }
    
    // Sprawdź poprawność danych dla każdego przedmiotu
    const invalidItem = poData.items.find(item => !item.name || !item.quantity);
    if (invalidItem) {
      showError('Uzupełnij wszystkie dane dla każdego przedmiotu');
      return false;
    }
    
    // Sprawdź czy wszystkie pozycje mają datę ważności przy zmianie statusu na "zamówione"
    if (poData.status === PURCHASE_ORDER_STATUSES.ORDERED) {
      const itemWithoutExpiryDate = poData.items.find(item => !item.expiryDate && !item.noExpiryDate);
      if (itemWithoutExpiryDate) {
        showError('Wszystkie pozycje muszą mieć określoną datę ważności lub być oznaczone jako "brak daty ważności" przed zmianą statusu na "Zamówione"');
        return false;
      }
    }
    
    // Sprawdź minimalne ilości zamówienia - ale tylko wyświetl informację, nie blokuj zapisu
    const itemWithWrongMinQuantity = poData.items.find(item => {
      const inventoryItem = inventoryItems.find(i => i.id === item.inventoryItemId);
      if (!inventoryItem) return false;
      
      const minOrderQuantity = inventoryItem.minOrderQuantity || 0;
      return minOrderQuantity > 0 && 
             parseFloat(item.quantity) < minOrderQuantity && 
             item.unit === inventoryItem.unit;
    });
    
    if (itemWithWrongMinQuantity) {
      // Zamiast blokować zapis, tylko pokazujemy informację
      showError('Niektóre pozycje nie spełniają minimalnych ilości zamówienia. Możesz użyć przycisku "Uzupełnij minimalne ilości" lub kontynuować z obecnymi ilościami.');
    }
    
    return true;
  };
  
  const handleSubmit = async (e) => {
    // Zapobiegaj domyślnemu zachowaniu formularza
    if (e) e.preventDefault();
    
    // Sprawdź, czy formularz jest wypełniony poprawnie
    if (!validateForm()) {
      return;
    }
    
    // Pokazuj overlay z informacją o zapisywaniu
    setSaving(true);
    setSavingMessage('Przygotowywanie danych...');
    setSavingSubtitle('Sprawdzanie poprawności formularza i przygotowywanie zamówienia');
    
    try {
      // Przygotuj dane zamówienia do zapisu
      const { supplier, ...orderDataToSave } = poData;
      
      // Upewnij się, że dostawca istnieje
      if (!supplier) {
        showError('Wybierz dostawcę');
        setSaving(false);
        return;
      }
      
      // Ustaw ID dostawcy w danych zamówienia
      const orderWithSupplierId = {
        ...orderDataToSave,
        supplierId: supplier.id,
        supplier: supplier,
      };
      
      console.log("Dane zamówienia do zapisu:", orderWithSupplierId);
      
      // Aktualizuj komunikat o zapisywaniu
      setSavingMessage('Zapisuje i aktualizuje wartości...');
      setSavingSubtitle('Obliczanie sum, podatków i zapisywanie do bazy danych');
      
      // Zapisz zamówienie do bazy danych - calculateTotals wewnątrz savePurchaseOrder 
      // obliczy prawidłowe wartości na podstawie indywidualnych stawek VAT
      const result = await savePurchaseOrder(orderWithSupplierId, currentOrderId, currentUser.uid);
      console.log("Zapisane zamówienie:", result);
      
      // Powiadomienie o sukcesie
      showSuccess('Zamówienie zakupu zostało zapisane!');
      
      // Przekieruj do widoku szczegółów zamówienia jeśli nie jesteśmy w trybie wyboru zamówienia
      if (location.pathname.includes('/purchase-orders/')) {
        navigate(`/purchase-orders/${result.id}`);
      } else {
        // W trybie wyboru zamówienia, wywołaj callback z wybranym zamówieniem
        const onSelect = location.state?.onSelect;
        if (typeof onSelect === 'function') {
          onSelect(result);
        }
      }
    } catch (error) {
      console.error("Błąd podczas zapisywania zamówienia:", error);
      showError(`Nie udało się zapisać zamówienia: ${error.message}`);
    } finally {
      setSaving(false);
      setSavingMessage('');
      setSavingSubtitle('');
    }
  };
  
  const handleCancel = () => {
    navigate('/purchase-orders');
  };
  
  // Funkcja do znajdowania najlepszych cen dostawców
  
  // Obsługa zmian w dodatkowych kosztach
  const handleAdditionalCostsChange = (e) => {
    const { name, value } = e.target;
    setPoData(prev => ({ ...prev, [name]: value }));
  };
  
  // Funkcja do przeliczania wartości między walutami
  const convertCurrency = (amount, fromCurrency, toCurrency) => {
    if (!amount || amount === 0) return 0;
    if (fromCurrency === toCurrency) return amount;
    
    const rate = exchangeRates[fromCurrency] / exchangeRates[toCurrency];
    if (!rate) {
      console.error(`Brak kursu dla pary walut ${fromCurrency}/${toCurrency}`);
      return amount;
    }
    
    // Wartość przeliczona bez zaokrąglania
    return amount * rate;
  };

  // Funkcja dodawania nowej pozycji dodatkowych kosztów
  const handleAddAdditionalCost = () => {
    const newCostId = `cost-${Date.now()}`;
    
    // Dodaj nową pozycję kosztów
    setPoData(prev => ({
      ...prev,
      additionalCostsItems: [
        ...prev.additionalCostsItems,
        {
          id: newCostId,
          description: '',
          value: '',
          vatRate: 0, // Domyślna stawka VAT 0%
          currency: poData.currency, // Domyślna waluta zgodna z zamówieniem
          originalValue: '', // Wartość w oryginalnej walucie
          exchangeRate: 1, // Kurs wymiany
          invoiceNumber: '', // Numer faktury
          invoiceDate: '', // Data faktury
        }
      ],
      expandedCostItems: {
        ...prev.expandedCostItems,
        [newCostId]: true // Automatycznie rozwinięty nowy koszt
      }
    }));

    // Usuwamy wywołanie synchronizeExchangeRates, które może powodować problemy
    // Synchronizacja będzie wykonana automatycznie przy zmianie waluty lub daty faktury
  };
  
  // Funkcja do synchronizacji kursów walut dla pozycji kosztów dodatkowych
  const synchronizeExchangeRates = () => {
    try {
      // Obiekty do przechowywania unikalnych par waluta-data i najnowszych kursów
      const currencyDateRates = {};
      
      // 1. Znajdź najnowsze kursy dla każdej pary waluta-data w dodatkowych kosztach
      poData.additionalCostsItems.forEach(cost => {
        if (cost.currency && cost.currency !== poData.currency && cost.invoiceDate && cost.exchangeRate) {
          const key = `${cost.currency}-${cost.invoiceDate}`;
          
          // Zapisz kurs tylko jeśli jeszcze nie istnieje lub jest nowszy
          if (!currencyDateRates[key] || currencyDateRates[key].rate < cost.exchangeRate) {
            currencyDateRates[key] = {
              currency: cost.currency,
              invoiceDate: cost.invoiceDate,
              rate: cost.exchangeRate
            };
          }
        }
      });
      
      // 2. Znajdź najnowsze kursy dla każdej pary waluta-data w pozycjach produktów
      poData.items.forEach(item => {
        if (item.currency && item.currency !== poData.currency && item.invoiceDate && item.exchangeRate) {
          const key = `${item.currency}-${item.invoiceDate}`;
          
          // Zapisz kurs tylko jeśli jeszcze nie istnieje lub jest nowszy
          if (!currencyDateRates[key] || currencyDateRates[key].rate < item.exchangeRate) {
            currencyDateRates[key] = {
              currency: item.currency,
              invoiceDate: item.invoiceDate,
              rate: item.exchangeRate
            };
          }
        }
      });
      
      // 3. Zastosuj znalezione kursy do wszystkich pozycji bez używania Promise.all
      Object.values(currencyDateRates).forEach(({ currency, invoiceDate, rate }) => {
        // Wykonujemy aktualizacje bezpośrednio, bez wywołań asynchronicznych
        updateRelatedCostExchangeRatesSync(currency, invoiceDate, rate);
        updateItemExchangeRatesSync(currency, invoiceDate, rate);
      });
      
      console.log('Synchronizacja kursów walut zakończona');
    } catch (error) {
      console.error('Błąd podczas synchronizacji kursów:', error);
    }
  };

  // Synchroniczna wersja updateRelatedCostExchangeRates
  const updateRelatedCostExchangeRatesSync = (currency, invoiceDate, rate) => {
    if (!invoiceDate || !currency || currency === poData.currency) return;
    
    try {
      // Aktualizuj wszystkie pozycje kosztów z tą samą walutą i datą faktury
      const updatedCosts = poData.additionalCostsItems.map(cost => {
        if (cost.currency === currency && cost.invoiceDate === invoiceDate) {
          const originalValue = parseFloat(cost.originalValue) || 0;
          const convertedValue = originalValue * rate;
          
          return {
            ...cost,
            exchangeRate: rate,
            value: convertedValue.toFixed(6)
          };
        }
        return cost;
      });
      
      setPoData(prev => ({ ...prev, additionalCostsItems: updatedCosts }));
    } catch (error) {
      console.error(`Błąd podczas aktualizacji kursów dla ${currency}:`, error);
    }
  };

  // Synchroniczna wersja updateItemExchangeRates
  const updateItemExchangeRatesSync = (currency, invoiceDate, rate) => {
    if (!invoiceDate || !currency || currency === poData.currency) return;
    
    try {
      // Aktualizuj wszystkie pozycje produktów z tą samą walutą i datą faktury
      const updatedItems = poData.items.map(item => {
        if (item.currency === currency && item.invoiceDate === invoiceDate) {
          const originalPrice = parseFloat(item.originalUnitPrice) || 0;
          const convertedPrice = originalPrice * rate;
          
          // Uwzględnij rabat przy obliczaniu totalPrice
          const discount = item.discount || 0;
          const discountMultiplier = (100 - parseFloat(discount)) / 100;
          const priceAfterDiscount = convertedPrice * discountMultiplier;
          
          return {
            ...item,
            exchangeRate: rate,
            unitPrice: convertedPrice.toFixed(6),
            totalPrice: (priceAfterDiscount * item.quantity).toFixed(2)
          };
        }
        return item;
      });
      
      setPoData(prev => ({ ...prev, items: updatedItems }));
    } catch (error) {
      console.error(`Błąd podczas aktualizacji kursów dla ${currency}:`, error);
    }
  };
  
  // Funkcja obsługi zmiany dodatkowych kosztów
  const handleAdditionalCostChange = async (id, field, value) => {
    // Pobierz aktualny koszt przed zmianą
    const currentCost = poData.additionalCostsItems.find(item => item.id === id);
    if (!currentCost) return;

    // Specjalna obsługa dla zmiany daty faktury
    if (field === 'invoiceDate') {
      try {
        // Uaktualnij datę faktury zawsze (niezależnie od waluty)
        let updatedCosts = [...poData.additionalCostsItems];
        const costIndex = updatedCosts.findIndex(item => item.id === id);
        
        if (costIndex !== -1) {
          updatedCosts[costIndex] = {
            ...updatedCosts[costIndex],
            invoiceDate: value
          };
          
          // Sprawdź czy data jest kompletna i poprawna przed próbą pobrania kursu
          const invoiceDate = new Date(value);
          const isValidDate = !isNaN(invoiceDate.getTime()) && 
                             invoiceDate.getFullYear() > 1900 && 
                             invoiceDate.getFullYear() < 2100;
          
          // Pobierz kurs tylko jeśli:
          // 1. Data jest kompletna i poprawna
          // 2. Waluta pozycji jest inna niż waluta zamówienia
          if (isValidDate && currentCost.currency && currentCost.currency !== poData.currency) {
            try {
              const rateFetchDate = new Date(invoiceDate);
              rateFetchDate.setDate(rateFetchDate.getDate() - 1);
              
              console.log(`Próbuję pobrać kurs dla ${currentCost.currency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}`);
              
              const rate = await getExchangeRate(currentCost.currency, poData.currency, rateFetchDate);
              console.log(`Pobrany kurs: ${rate}`);
              
              if (rate > 0) {
                // Aktualizuj pozycję z nowym kursem i przeliczoną wartością
                const originalValue = parseFloat(currentCost.originalValue) || parseFloat(currentCost.value) || 0;
                const convertedValue = originalValue * rate;
                
                updatedCosts[costIndex] = {
                  ...updatedCosts[costIndex],
                  exchangeRate: rate,
                  originalValue: originalValue,
                  value: convertedValue.toFixed(6)
                };
              }
            } catch (error) {
              console.error(`Błąd podczas pobierania kursu:`, error);
              // W przypadku błędu nie zmieniamy kursu, tylko aktualizujemy datę
            }
          } else if (!isValidDate && currentCost.currency && currentCost.currency !== poData.currency) {
            console.log(`Data faktury jest niepełna - nie pobieram kursu dla dodatkowego kosztu`);
          }
          
          setPoData(prev => ({ ...prev, additionalCostsItems: updatedCosts }));
        }
        
        return;
      } catch (error) {
        console.error('Błąd podczas przetwarzania daty faktury:', error);
        // W przypadku błędu, i tak aktualizuj datę faktury
        let updatedCosts = [...poData.additionalCostsItems];
        const costIndex = updatedCosts.findIndex(item => item.id === id);
        if (costIndex !== -1) {
          updatedCosts[costIndex] = {
            ...updatedCosts[costIndex],
            invoiceDate: value
          };
          setPoData(prev => ({ ...prev, additionalCostsItems: updatedCosts }));
        }
        return;
      }
    }
    
    // Specjalna obsługa dla zmiany waluty
    if (field === 'currency') {
      const newCurrency = value;
      const oldCurrency = currentCost.currency || poData.currency;
          
          // Jeśli zmieniono walutę, przelicz wartość
          if (newCurrency !== oldCurrency) {
        try {
          console.log(`Zmiana waluty kosztu z ${oldCurrency} na ${newCurrency}`);
          const originalValue = parseFloat(currentCost.originalValue) || parseFloat(currentCost.value) || 0;
          
          // Przygotuj aktualizowaną pozycję
          let updatedCosts = [...poData.additionalCostsItems];
          const costIndex = updatedCosts.findIndex(item => item.id === id);
          
          if (costIndex !== -1) {
            // Najpierw zaktualizuj walutę i zachowaj oryginalną wartość
            updatedCosts[costIndex] = {
              ...updatedCosts[costIndex],
              currency: newCurrency,
              originalValue: originalValue
            };
            
            // Jeśli mamy datę faktury, użyj daty poprzedzającej do pobrania kursu
            if (currentCost.invoiceDate) {
              const invoiceDate = new Date(currentCost.invoiceDate);
              const rateFetchDate = new Date(invoiceDate);
              rateFetchDate.setDate(rateFetchDate.getDate() - 1);
              
              console.log(`Pobieranie kursu dla zmiany waluty z datą faktury ${currentCost.invoiceDate}, data kursu: ${rateFetchDate.toISOString().split('T')[0]}`);
              
              let rate = 0;
              try {
                rate = await getExchangeRate(newCurrency, poData.currency, rateFetchDate);
                console.log(`Pobrany kurs dla ${newCurrency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}: ${rate}`);
                
                // Przelicz wartość
                const convertedValue = originalValue * rate;
                
                // Aktualizuj pozycję z nowym kursem i przeliczoną wartością
                updatedCosts[costIndex] = {
                  ...updatedCosts[costIndex],
                  exchangeRate: rate,
                  originalValue: originalValue,
                  value: convertedValue.toFixed(6)
                };
                
                // Aktualizacja kursów dla wszystkich pozycji z tą samą walutą i datą faktury
                if (rate > 0) {
                  updateRelatedCostExchangeRates(currentCost.currency, value, rate);
                }
              } catch (error) {
                console.error(`Błąd podczas pobierania kursu dla ${newCurrency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}:`, error);
                showError(`Nie udało się pobrać kursu dla ${newCurrency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}.`);
                
                // Ustaw kurs na 0 w przypadku błędu
                updatedCosts[costIndex] = {
                  ...updatedCosts[costIndex],
                  exchangeRate: 0
                };
              }
            } else {
              // Jeśli nie mamy daty faktury, użyj daty utworzenia PO
              const orderDate = new Date(poData.orderDate);
              console.log(`Brak daty faktury dla kosztu. Używam daty utworzenia PO: ${orderDate.toISOString().split('T')[0]}`);
              
              let rate = 0;
              try {
                rate = await getExchangeRate(newCurrency, poData.currency, orderDate);
                console.log(`Pobrany kurs dla ${newCurrency}/${poData.currency} z dnia utworzenia PO ${orderDate.toISOString().split('T')[0]}: ${rate}`);
                
                // Przelicz wartość
                const convertedValue = originalValue * rate;
                
                // Aktualizuj pozycję z nowym kursem i przeliczoną wartością
                updatedCosts[costIndex] = {
                  ...updatedCosts[costIndex],
                  exchangeRate: rate,
                  originalValue: originalValue,
                  value: convertedValue.toFixed(6)
                };
                
                showSuccess(`Zastosowano kurs z dnia utworzenia PO (${orderDate.toISOString().split('T')[0]}) dla waluty ${newCurrency}: ${rate}`);
              } catch (error) {
                console.error(`Błąd podczas pobierania kursu dla ${newCurrency}/${poData.currency} z dnia ${orderDate.toISOString().split('T')[0]}:`, error);
                showError(`Nie udało się pobrać kursu dla ${newCurrency}/${poData.currency} z dnia ${orderDate.toISOString().split('T')[0]}.`);
                
                // Ustaw kurs na 0 w przypadku błędu
                updatedCosts[costIndex] = {
                  ...updatedCosts[costIndex],
                  exchangeRate: 0
                };
              }
            }
            
            setPoData(prev => ({ ...prev, additionalCostsItems: updatedCosts }));
          }
          
          return;
        } catch (error) {
          console.error('Błąd podczas zmiany waluty:', error);
        }
      }
    }
    
    // Specjalna obsługa dla zmiany kursu waluty ręcznie
    if (field === 'exchangeRate') {
      const newRate = parseFloat(value) || 0;
      
      // Jeśli waluta pozycji jest inna niż waluta zamówienia, przelicz wartość
      if (currentCost.currency !== poData.currency) {
        try {
          const originalValue = parseFloat(currentCost.originalValue) || 0;
          const convertedValue = originalValue * newRate;
          
          const updatedCosts = poData.additionalCostsItems.map(item => {
            if (item.id === id) {
              return { 
                ...item, 
                exchangeRate: newRate,
                value: convertedValue.toFixed(6)
              };
            }
            return item;
          });
          
          setPoData(prev => ({ ...prev, additionalCostsItems: updatedCosts }));
          return;
        } catch (error) {
          console.error('Błąd podczas przeliczania wartości z nowym kursem:', error);
        }
          }
        }
        
        // Specjalna obsługa dla zmiany wartości
        if (field === 'value') {
          const newValue = parseFloat(value) || 0;
          
          // Jeśli waluta pozycji jest inna niż waluta zamówienia
      if (currentCost.currency !== poData.currency) {
        try {
          // Przygotuj aktualizowaną pozycję
          let updatedCosts = [...poData.additionalCostsItems];
          const costIndex = updatedCosts.findIndex(item => item.id === id);
          
          if (costIndex !== -1) {
            // Najpierw zaktualizuj oryginalną wartość
            updatedCosts[costIndex] = {
              ...updatedCosts[costIndex],
              originalValue: newValue
            };
            
            // Pobierz kurs na podstawie daty faktury lub daty utworzenia PO
            if (currentCost.invoiceDate) {
              const rate = parseFloat(currentCost.exchangeRate) || 0;
              if (rate > 0) {
            // Przelicz wartość na walutę bazową zamówienia
                const convertedValue = newValue * rate;
                
                // Aktualizuj pozycję z przeliczoną wartością
                updatedCosts[costIndex] = {
                  ...updatedCosts[costIndex],
                  originalValue: newValue,
                  value: convertedValue.toFixed(6)
            };
          } else {
                // Jeśli nie ma kursu, spróbuj go pobrać
                const invoiceDate = new Date(currentCost.invoiceDate);
                const rateFetchDate = new Date(invoiceDate);
                rateFetchDate.setDate(rateFetchDate.getDate() - 1);
                
                try {
                  const rate = await getExchangeRate(currentCost.currency, poData.currency, rateFetchDate);
                  console.log(`Pobrany kurs dla wartości z datą faktury ${currentCost.invoiceDate}, data kursu: ${rateFetchDate.toISOString().split('T')[0]}: ${rate}`);
                  
                  // Przelicz wartość na walutę bazową zamówienia
                  const convertedValue = newValue * rate;
                  
                  // Aktualizuj pozycję z nowym kursem i przeliczoną wartością
                  updatedCosts[costIndex] = {
                    ...updatedCosts[costIndex],
                    exchangeRate: rate,
                    originalValue: newValue,
                    value: convertedValue.toFixed(6)
                  };
                  
                  // Aktualizacja kursów dla wszystkich pozycji z tą samą walutą i datą faktury
                  if (rate > 0) {
                    updateRelatedCostExchangeRates(currentCost.currency, currentCost.invoiceDate, rate);
                  }
                } catch (error) {
                  console.error(`Błąd podczas pobierania kursu dla ${currentCost.currency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}:`, error);
                  showError(`Nie udało się pobrać kursu dla ${currentCost.currency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}.`);
                }
              }
          } else {
              // Jeśli nie mamy daty faktury, użyj daty utworzenia PO
              const orderDate = new Date(poData.orderDate);
              console.log(`Brak daty faktury dla kosztu wartości. Używam daty utworzenia PO: ${orderDate.toISOString().split('T')[0]}`);
              
              try {
                const rate = await getExchangeRate(currentCost.currency, poData.currency, orderDate);
                console.log(`Pobrany kurs dla ${currentCost.currency}/${poData.currency} z dnia utworzenia PO ${orderDate.toISOString().split('T')[0]}: ${rate}`);
                
                // Przelicz wartość na walutę bazową zamówienia
                const convertedValue = newValue * rate;
                
                // Aktualizuj pozycję z nowym kursem i przeliczoną wartością
                updatedCosts[costIndex] = {
                  ...updatedCosts[costIndex],
                  exchangeRate: rate,
                  originalValue: newValue,
                  value: convertedValue.toFixed(6)
                };
                
                showSuccess(`Zastosowano kurs z dnia utworzenia PO (${orderDate.toISOString().split('T')[0]}) dla waluty ${currentCost.currency}: ${rate}`);
              } catch (error) {
                console.error(`Błąd podczas pobierania kursu dla ${currentCost.currency}/${poData.currency} z dnia ${orderDate.toISOString().split('T')[0]}:`, error);
                showError(`Nie udało się pobrać kursu dla ${currentCost.currency}/${poData.currency} z dnia ${orderDate.toISOString().split('T')[0]}.`);
              }
            }
            
            setPoData(prev => ({ ...prev, additionalCostsItems: updatedCosts }));
          }
          
          return;
        } catch (error) {
          console.error('Błąd podczas przeliczania wartości:', error);
        }
      }
    }
    
    // Standardowa obsługa dla pozostałych przypadków
    const updatedCosts = poData.additionalCostsItems.map(item => {
      if (item.id === id) {
        // Dla pola vatRate upewnij się, że nie jest undefined
        if (field === 'vatRate' && value === undefined) {
          value = 0; // Domyślna wartość VAT
        }
        
        // Dla wartości, jeśli waluta jest taka sama jak waluta zamówienia
        if (field === 'value' && item.currency === poData.currency) {
          const newValue = parseFloat(value) || 0;
            return { 
              ...item, 
              originalValue: newValue,
              value: newValue
            };
        }
        
        // Standardowa obsługa innych pól
        return { ...item, [field]: value };
      }
      return item;
    });
    
    setPoData(prev => ({ ...prev, additionalCostsItems: updatedCosts }));
  };
  
  // Funkcja usuwania pozycji dodatkowych kosztów
  const handleRemoveAdditionalCost = (id) => {
    setPoData(prev => ({
      ...prev,
      additionalCostsItems: prev.additionalCostsItems.filter(item => item.id !== id)
    }));
  };
  
  // Funkcja do aktualizacji informacji o kursach walut w informacjach
  const updateExchangeRatesInfo = () => {
    // Aktualizuj komunikaty, aby odzwierciedlały nową logikę kursów
    const infoText = "Wartości w walutach obcych zostały przeliczone według kursów z dnia poprzedzającego datę faktury lub z dnia utworzenia PO (jeśli brak daty faktury).";
    
    const exchangeRateInfoElements = document.querySelectorAll('.exchange-rate-info');
    exchangeRateInfoElements.forEach(element => {
      element.textContent = infoText;
    });
  };
  
  // Funkcja do aktualizacji kursów wymiany dla powiązanych pozycji
  const updateRelatedCostExchangeRates = async (currency, invoiceDate, rate) => {
    if (!invoiceDate || !currency || currency === poData.currency) return;
    
    try {
      // Jeśli nie mamy jeszcze kursu, spróbuj go pobrać
      if (!rate) {
        const dateObj = new Date(invoiceDate);
        const rateFetchDate = new Date(dateObj);
        rateFetchDate.setDate(rateFetchDate.getDate() - 1);
        
        try {
          rate = await getExchangeRate(currency, poData.currency, rateFetchDate);
        } catch (error) {
          console.error(`Nie udało się pobrać kursu dla ${currency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}:`, error);
          return;
        }
      }
      
      // Aktualizuj wszystkie pozycje kosztów z tą samą walutą i datą faktury
      const updatedCosts = poData.additionalCostsItems.map(cost => {
        if (cost.currency === currency && cost.invoiceDate === invoiceDate) {
          const originalValue = parseFloat(cost.originalValue) || 0;
          const convertedValue = originalValue * rate;
          
          return {
            ...cost,
            exchangeRate: rate,
            value: convertedValue.toFixed(6)
          };
        }
        return cost;
      });
      
      setPoData(prev => ({ ...prev, additionalCostsItems: updatedCosts }));
    } catch (error) {
      console.error(`Błąd podczas aktualizacji kursów dla ${currency}:`, error);
    }
  };
  
  // Funkcja do aktualizacji kursów wymiany dla powiązanych pozycji produktów
  const updateItemExchangeRates = async (currency, invoiceDate, rate) => {
    if (!invoiceDate || !currency || currency === poData.currency) return;
    
    try {
      // Jeśli nie mamy jeszcze kursu, spróbuj go pobrać
      if (!rate) {
        const dateObj = new Date(invoiceDate);
        const rateFetchDate = new Date(dateObj);
        rateFetchDate.setDate(rateFetchDate.getDate() - 1);
        
        try {
          rate = await getExchangeRate(currency, poData.currency, rateFetchDate);
        } catch (error) {
          console.error(`Nie udało się pobrać kursu dla ${currency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}:`, error);
          return;
        }
      }
      
      // Aktualizuj wszystkie pozycje produktów z tą samą walutą i datą faktury
      const updatedItems = poData.items.map(item => {
        if (item.currency === currency && item.invoiceDate === invoiceDate) {
          const originalPrice = parseFloat(item.originalUnitPrice) || 0;
          const convertedPrice = originalPrice * rate;
          
          // Uwzględnij rabat przy obliczaniu totalPrice
          const discount = item.discount || 0;
          const discountMultiplier = (100 - parseFloat(discount)) / 100;
          const priceAfterDiscount = convertedPrice * discountMultiplier;
          
          return {
            ...item,
            exchangeRate: rate,
            unitPrice: convertedPrice.toFixed(6),
            totalPrice: (priceAfterDiscount * item.quantity).toFixed(2)
          };
        }
        return item;
      });
      
      setPoData(prev => ({ ...prev, items: updatedItems }));
    } catch (error) {
      console.error(`Błąd podczas aktualizacji kursów dla ${currency}:`, error);
    }
  };
  
  // Efekt dla pobierania danych
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
    try {
      setLoading(true);
      console.log("Pobieranie danych formularza PO, ID:", currentOrderId);
      
      // Pobierz dostawców
      const suppliersData = await getAllSuppliers();
      if (cancelled) return;
      setSuppliers(suppliersData);
      
      // Pobierz przedmioty magazynowe
      const itemsData = await getAllInventoryItems();
      if (cancelled) return;
      setInventoryItems(itemsData);
      
      // Pobierz magazyny
      const warehousesData = await getAllWarehouses();
      if (cancelled) return;
      setWarehouses(warehousesData);
      
      // Jeśli edytujemy istniejące zamówienie, pobierz jego dane
      if (currentOrderId && currentOrderId !== 'new') {
        console.log("Pobieranie danych istniejącego zamówienia:", currentOrderId);
        const poDetails = await getPurchaseOrderById(currentOrderId);
        if (cancelled) return;
        console.log("Pobrane dane zamówienia:", poDetails);
        
        // Zachowaj daty jako obiekty Date
        const orderDate = poDetails.orderDate ? (poDetails.orderDate.toDate ? poDetails.orderDate.toDate() : new Date(poDetails.orderDate)) : new Date();
        const deliveryDate = poDetails.expectedDeliveryDate ? (poDetails.expectedDeliveryDate.toDate ? poDetails.expectedDeliveryDate.toDate() : new Date(poDetails.expectedDeliveryDate)) : null;
        
        // Pobierz obiekty supplier z tablicy wszystkich dostawców
        let matchedSupplier = null;
        if (poDetails.supplier) {
          matchedSupplier = poDetails.supplier;
        } else if (poDetails.supplierId) {
          matchedSupplier = suppliersData.find(s => s.id === poDetails.supplierId);
        }
        
        console.log("Dopasowany dostawca:", matchedSupplier);
        
        // Konwersja ze starego formatu na nowy (jeśli istnieją tylko stare pola)
        let additionalCostsItems = poDetails.additionalCostsItems || [];
        
        // Jeśli istnieje tylko stare pole additionalCosts, skonwertuj na nowy format
        if (!poDetails.additionalCostsItems && (poDetails.additionalCosts > 0 || poDetails.additionalCostsDescription)) {
          additionalCostsItems = [{
            id: `cost-${Date.now()}`,
            value: poDetails.additionalCosts || 0,
            description: poDetails.additionalCostsDescription || 'Dodatkowe koszty',
            vatRate: 0 // Domyślna stawka VAT
          }];
        }
        
        // Upewnij się, że wszystkie pozycje mają ustawione pole vatRate
        const itemsWithVatRate = poDetails.items ? poDetails.items.map(item => ({
          ...item,
          vatRate: typeof item.vatRate === 'number' ? item.vatRate : 0 // Domyślna stawka VAT 0%
        })) : [];
        
        // Upewnij się, że wszystkie dodatkowe koszty mają ustawione pole vatRate
        const costsWithVatRate = additionalCostsItems.map(cost => ({
          ...cost,
          vatRate: typeof cost.vatRate === 'number' ? cost.vatRate : 0 // Domyślna stawka VAT 0%
        }));
        
        // Migracja załączników - jeśli istnieją nowe pola, użyj ich, w przeciwnym razie migruj stare
        let coaAttachments = poDetails.coaAttachments || [];
        let invoiceAttachments = poDetails.invoiceAttachments || [];
        let generalAttachments = poDetails.generalAttachments || [];
        
        // Sprawdź czy nowe pola są puste (nie istnieją lub są pustymi tablicami)
        const hasNewAttachments = (coaAttachments.length > 0) || (invoiceAttachments.length > 0) || (generalAttachments.length > 0);
        const hasOldAttachments = poDetails.attachments && poDetails.attachments.length > 0;
        
        // Jeśli nie ma nowych załączników ale są stare, migruj je do generalAttachments
        if (!hasNewAttachments && hasOldAttachments) {
          console.log('Migrujemy stare załączniki do generalAttachments (fetchData):', poDetails.attachments);
          generalAttachments = [...poDetails.attachments];
        }
        
        setPoData({
          ...poDetails,
          supplier: matchedSupplier,
          orderDate: orderDate,
          expectedDeliveryDate: deliveryDate,
          invoiceLink: poDetails.invoiceLink || '',
          items: itemsWithVatRate,
          additionalCostsItems: costsWithVatRate,
          // Załączniki - zarówno stare jak i nowe pola
          attachments: poDetails.attachments || [],
          coaAttachments: coaAttachments,
          invoiceAttachments: invoiceAttachments,
          generalAttachments: generalAttachments
        });
      } else if (location.state?.materialId) {
        // Jeśli mamy materialId z parametrów stanu (z prognozy zapotrzebowania),
        // dodaj od razu pozycję do zamówienia
        const materialId = location.state.materialId;
        const requiredQuantity = location.state.requiredQuantity || 1;
        
        const inventoryItem = itemsData.find(item => item.id === materialId);
        if (inventoryItem) {
          // Znajdź najlepszą cenę dostawcy dla tego materiału
          const bestPrice = await getBestSupplierPriceForItem(materialId, requiredQuantity);
          if (cancelled) return;
          
          // Znajdź dostawcę
          let supplier = null;
          if (bestPrice && bestPrice.supplierId) {
            supplier = suppliersData.find(s => s.id === bestPrice.supplierId);
          }
          
          // Przygotuj początkowy stan z wybranym dostawcą i materiałem
          const initialItems = [{
            id: `temp-${Date.now()}`,
            inventoryItemId: materialId,
            name: inventoryItem.name,
            quantity: requiredQuantity,
            unit: inventoryItem.unit || 'szt',
            unitPrice: bestPrice ? bestPrice.price : 0,
            discount: 0, // Domyślny rabat 0%
            totalPrice: bestPrice ? bestPrice.price * requiredQuantity : 0
          }];
          
          setPoData(prev => ({
            ...prev,
            supplier: supplier,
            items: initialItems,
            deliveryAddress: supplier && supplier.addresses && supplier.addresses.length > 0
              ? formatAddress(supplier.addresses.find(a => a.isMain) || supplier.addresses[0])
              : ''
          }));
          
          if (supplier) {
            showError(`Znaleziono dostawcę ${supplier.name} z najlepszą ceną dla ${inventoryItem.name}.`);
          }
        }
      }
      
      if (!cancelled) {
        setLoading(false);
      }
    } catch (error) {
      if (cancelled) return;
      console.error('Błąd podczas pobierania danych:', error);
      showError('Nie udało się pobrać danych: ' + error.message);
      setLoading(false);
    }
  };
    
    fetchData();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Obsługa załączników (stary sposób - dla kompatybilności)
  const handleAttachmentsChange = (newAttachments) => {
    setPoData(prev => ({
      ...prev,
      attachments: newAttachments
    }));
  };

  // Obsługa skategoryzowanych załączników
  const handleCategorizedAttachmentsChange = (newAttachments) => {
    setPoData(prev => ({
      ...prev,
      coaAttachments: newAttachments.coaAttachments || [],
      invoiceAttachments: newAttachments.invoiceAttachments || [],
      generalAttachments: newAttachments.generalAttachments || [],
      // Aktualizuj także stare pole dla kompatybilności
      attachments: [
        ...(newAttachments.coaAttachments || []),
        ...(newAttachments.invoiceAttachments || []),
        ...(newAttachments.generalAttachments || [])
      ]
    }));
  };

  // Obsługa aktualizacji z dokumentu dostawy (WZ) - ze skanera OCR

  // Funkcja do ponownego przeliczenia wszystkich wartości walutowych
  const recalculateAllCurrencyValues = async () => {
    try {
      // Kopia aktualnych danych
      let updatedItems = [...poData.items];
      let updated = false;
      
      // Dla każdej pozycji w innej walucie niż waluta zamówienia
      for (let i = 0; i < updatedItems.length; i++) {
        const item = updatedItems[i];
        
        if (item.currency && item.currency !== poData.currency && item.invoiceDate) {
          const originalPrice = parseFloat(item.originalUnitPrice) || 0;
          
          // Pobierz datę poprzedniego dnia dla daty faktury
          const invoiceDate = new Date(item.invoiceDate);
          const rateFetchDate = new Date(invoiceDate);
          rateFetchDate.setDate(rateFetchDate.getDate() - 1);
          
          try {
            const rate = await getExchangeRate(item.currency, poData.currency, rateFetchDate);
            console.log(`Przeliczam kurs dla ${item.currency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}: ${rate}`);
            
            // Przelicz wartość z pełną precyzją
            const convertedPrice = originalPrice * rate;
            
            // Uwzględnij rabat przy obliczaniu totalPrice
            const discount = item.discount || 0;
            const discountMultiplier = (100 - parseFloat(discount)) / 100;
            const priceAfterDiscount = convertedPrice * discountMultiplier;
            
            // Aktualizuj pozycję z nowym kursem i przeliczoną wartością
            updatedItems[i] = {
              ...updatedItems[i],
              exchangeRate: rate,
              unitPrice: convertedPrice.toFixed(6),
              totalPrice: (priceAfterDiscount * item.quantity).toFixed(2)
            };
            
            updated = true;
          } catch (error) {
            console.error(`Błąd podczas przeliczania kursu dla pozycji ${i}:`, error);
            showError(`Nie udało się przeliczyć kursu dla pozycji ${item.name}`);
          }
        }
      }
      
      // Aktualizuj również dodatkowe koszty
      let updatedCosts = [...poData.additionalCostsItems];
      
      for (let i = 0; i < updatedCosts.length; i++) {
        const cost = updatedCosts[i];
        
        if (cost.currency && cost.currency !== poData.currency && cost.invoiceDate) {
          const originalValue = parseFloat(cost.originalValue) || 0;
          
          // Pobierz datę poprzedniego dnia dla daty faktury
          const invoiceDate = new Date(cost.invoiceDate);
          const rateFetchDate = new Date(invoiceDate);
          rateFetchDate.setDate(rateFetchDate.getDate() - 1);
          
          try {
            const rate = await getExchangeRate(cost.currency, poData.currency, rateFetchDate);
            console.log(`Przeliczam kurs dla kosztu ${cost.currency}/${poData.currency} z dnia ${rateFetchDate.toISOString().split('T')[0]}: ${rate}`);
            
            // Przelicz wartość z pełną precyzją
            const convertedValue = originalValue * rate;
            
            // Aktualizuj koszt z nowym kursem i przeliczoną wartością
            updatedCosts[i] = {
              ...updatedCosts[i],
              exchangeRate: rate,
              originalValue: originalValue,
              value: convertedValue.toFixed(6)
            };
            
            updated = true;
          } catch (error) {
            console.error(`Błąd podczas przeliczania kursu dla kosztu ${i}:`, error);
            showError(`Nie udało się przeliczyć kursu dla kosztu ${cost.description || 'dodatkowego'}`);
          }
        }
      }
      
      if (updated) {
        // Aktualizuj stan
        setPoData(prev => ({
          ...prev,
          items: updatedItems,
          additionalCostsItems: updatedCosts
        }));
        
        showSuccess('Przeliczono wszystkie wartości walutowe z większą precyzją');
      } else {
        showError('Nie znaleziono pozycji do przeliczenia');
      }
    } catch (error) {
      console.error('Błąd podczas przeliczania wszystkich wartości:', error);
      showError('Wystąpił błąd podczas przeliczania wartości');
    }
  };
  
  if (loading) {
    return (
      <Container maxWidth="xl">
        <Typography variant="h6">{t('purchaseOrders.form.loadingData')}</Typography>
      </Container>
    );
  }
  
  return (
    <Container maxWidth="xl">
      <Box sx={mb3}>
        <Typography variant="h5">
          {currentOrderId && currentOrderId !== 'new' ? t('purchaseOrders.form.editTitle') : t('purchaseOrders.form.createTitle')}
        </Typography>
        
        {/* Wyświetlanie numeru PO w trybie edycji */}
        {currentOrderId && currentOrderId !== 'new' && poData.number && (
          <Alert severity="info" sx={mt2}>
            <Typography variant="h6" component="span" sx={{ fontWeight: 'bold' }}>
              {t('purchaseOrders.form.poNumber', { number: poData.number })}
            </Typography>
          </Alert>
        )}
      </Box>
      
      <Paper sx={{ p: 3 }}>
        {/* Przyciski akcji na samej górze formularza */}
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button
            variant="outlined"
            onClick={handleCancel}
            disabled={saving}
          >
            {t('purchaseOrders.form.actions.cancel')}
          </Button>
          <Button
            type="submit"
            variant="contained"
            color="primary"
            disabled={saving}
            onClick={handleSubmit}
          >
            {saving ? t('purchaseOrders.form.actions.saving') : t('purchaseOrders.form.actions.save')}
          </Button>
        </Box>
        
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <POBasicFieldsSection
              poData={poData}
              suppliers={suppliers}
              warehouses={warehouses}
              handleSupplierChange={handleSupplierChange}
              handleChange={handleChange}
              handleDateChange={handleDateChange}
              setPoData={setPoData}
              currentLanguage={currentLanguage}
              t={t}
            />
            
            <POAdditionalCostsSection
              poData={poData}
              setPoData={setPoData}
              handleAddAdditionalCost={handleAddAdditionalCost}
              handleAdditionalCostChange={handleAdditionalCostChange}
              handleRemoveAdditionalCost={handleRemoveAdditionalCost}
              currentLanguage={currentLanguage}
              t={t}
            />
          </Grid>
          
          <Divider sx={{ my: 3 }} />
          
          <POOrderItemsSection
            poData={poData}
            setPoData={setPoData}
            inventoryItems={inventoryItems}
            handleAddItem={handleAddItem}
            handleRemoveItem={handleRemoveItem}
            handleItemChange={handleItemChange}
            handleItemSelect={handleItemSelect}
            supplierSuggestions={supplierSuggestions}
            loadingSupplierSuggestions={loadingSupplierSuggestions}
            findBestSuppliers={findBestSuppliers}
            applyBestSupplierPrices={applyBestSupplierPrices}
            fillMinimumOrderQuantities={fillMinimumOrderQuantities}
            setDocumentScannerOpen={setDocumentScannerOpen}
            currentLanguage={currentLanguage}
            t={t}
          />

          <POSummarySection
            poData={poData}
            handleChange={handleChange}
            t={t}
          />
          
          <Divider sx={{ my: 3 }} />
          
          <POInvoicesAttachmentsSection
            poData={poData}
            currentOrderId={currentOrderId}
            handleCategorizedAttachmentsChange={handleCategorizedAttachmentsChange}
            saving={saving}
            t={t}
          />

          <Box sx={{ mb: 3, mt: 1, display: 'flex', justifyContent: 'flex-end'}}>
            <Button
              variant="outlined"
              onClick={handleCancel}
              disabled={saving}
              sx={{ mr: 2 }}
            >
              {t('purchaseOrders.form.actions.cancel')}
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={saving}
            >
              {saving ? t('purchaseOrders.form.actions.saving') : t('purchaseOrders.form.actions.save')}
            </Button>
          </Box>
        </form>
      </Paper>
      
      {/* Overlay z informacją o zapisywaniu */}
      <SavingOverlay 
        open={saving} 
        message={savingMessage || 'Zapisuje...'} 
        subtitle={savingSubtitle}
      />
      
      {/* Dialog skanera dokumentów (WZ/Faktura) */}
      <PODocumentScanner
        open={documentScannerOpen}
        onClose={() => setDocumentScannerOpen(false)}
        poItems={poData.items}
        onApplyDeliveryUpdates={handleApplyDeliveryUpdates}
        onApplyInvoiceUpdates={handleApplyInvoiceUpdates}
        disabled={saving}
      />
    </Container>
  );
};

export default PurchaseOrderForm; 