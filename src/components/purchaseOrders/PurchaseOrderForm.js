import React, { useState, useEffect, useContext, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from '../../hooks/useTranslation';
import { parseISO, isValid, format } from 'date-fns';
import {
  Box,
  Button,
  TextField,
  Grid,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  IconButton,
  Divider,
  Paper,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Alert,
  CircularProgress,
  Tooltip,
  Container,
  InputAdornment,
  Badge,
  FormHelperText,
  alpha,
  Checkbox,
  FormControlLabel
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  FindInPage as FindInPageIcon,
  FindReplace as SuggestIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  Check as CheckIcon,
  StarOutline as StarIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  PlaylistAddCheck as PlaylistAddCheckIcon,
  Search as SearchIcon,
  Autorenew as AutorenewIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl, enUS } from 'date-fns/locale';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { 
  createPurchaseOrder, 
  getPurchaseOrderById, 
  updatePurchaseOrder,
  PURCHASE_ORDER_STATUSES,
  translateStatus
} from '../../services/purchaseOrderService';
import { 
  getAllInventoryItems,
  getAllWarehouses
} from '../../services/inventory';
import { CURRENCY_OPTIONS } from '../../config';
import { formatCurrency } from '../../utils/formatUtils';
import { formatNumberClean } from '../../utils/formatters';
import { formatDateForInput } from '../../utils/dateUtils';
import { formatAddress } from '../../utils/addressUtils';
import { 
  getAllSuppliers,
  getBestSupplierPriceForItem, 
  getBestSupplierPricesForItems,
  getSupplierPriceForItem
} from '../../services/supplierService';
import { getExchangeRate, getExchangeRates } from '../../services/exchangeRateService';
import PurchaseOrderFileUpload from './PurchaseOrderFileUpload';
import PurchaseOrderCategorizedFileUpload from './PurchaseOrderCategorizedFileUpload';
import SavingOverlay from '../common/SavingOverlay';

const PurchaseOrderForm = ({ orderId }) => {
  const { t, currentLanguage } = useTranslation();
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
  
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setLoading(true);
        console.log("Pobieranie danych formularza PO, ID:", currentOrderId);
        
        // Pobierz wszystkie dane współbieżnie dla przyspieszenia
        const [suppliersData, itemsData, warehousesData] = await Promise.all([
          getAllSuppliers(),
          getAllInventoryItems(), 
          getAllWarehouses()
        ]);
        
        setSuppliers(suppliersData);
        setInventoryItems(itemsData);
        setWarehouses(warehousesData);
        
        // Jeśli edytujemy istniejące zamówienie, pobierz jego dane
        if (currentOrderId && currentOrderId !== 'new') {
          console.log("Pobieranie danych istniejącego zamówienia:", currentOrderId);
          const poDetails = await getPurchaseOrderById(currentOrderId);
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
        console.error('Błąd podczas pobierania danych:', error);
        showError('Nie udało się pobrać danych: ' + error.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInitialData();
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
        expiryDate: '' // Data ważności
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
              plannedDeliveryDate: updatedItems[index].plannedDeliveryDate || '',
              actualDeliveryDate: updatedItems[index].actualDeliveryDate || ''
            };
            
            console.log(`[DEBUG] Aktualizacja pozycji z ceną dostawcy:`, updatedItems[index]);
            setPoData(prev => ({ ...prev, items: updatedItems }));
            
            // Pokaż informację o cenie dostawcy
            showSuccess(`Zastosowano cenę dostawcy: ${supplierPrice.price} ${poData.currency}`);
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
      plannedDeliveryDate: updatedItems[index].plannedDeliveryDate || '',
      actualDeliveryDate: updatedItems[index].actualDeliveryDate || ''
    };
    
    console.log(`[DEBUG] Aktualizacja pozycji bez ceny dostawcy:`, updatedItems[index]);
    setPoData(prev => ({ ...prev, items: updatedItems }));
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
  const findBestSuppliers = async () => {
    if (!poData.items || poData.items.length === 0) {
      showError('Brak pozycji w zamówieniu');
      return;
    }
    
    try {
      setLoadingSupplierSuggestions(true);
      
      // Przygotuj listę elementów do sprawdzenia
      const itemsToCheck = poData.items
        .filter(item => item.inventoryItemId)
        .map(item => ({
          itemId: item.inventoryItemId,
          quantity: item.quantity
        }));
      
      if (itemsToCheck.length === 0) {
        showError('Brak pozycji magazynowych do sprawdzenia');
        setLoadingSupplierSuggestions(false);
        return;
      }
      
      // Znajdź najlepsze ceny dostawców (funkcja sprawdzi również domyślne ceny)
      const bestPrices = await getBestSupplierPricesForItems(itemsToCheck);
      setSupplierSuggestions(bestPrices);
      
      let hasDefaultPrices = false;
      let anyPriceFound = false;
      
      // Aktualizuj pozycje zamówienia z najlepszymi/domyślnymi cenami
      const updatedItems = poData.items.map(item => {
        if (item.inventoryItemId && bestPrices[item.inventoryItemId]) {
          const bestPrice = bestPrices[item.inventoryItemId];
          anyPriceFound = true;
          
          // Znajdź nazwę dostawcy
          const supplier = suppliers.find(s => s.id === bestPrice.supplierId);
          const supplierName = supplier ? supplier.name : 'Nieznany dostawca';
          
          // Sprawdź czy to domyślna cena
          if (bestPrice.isDefault) {
            hasDefaultPrices = true;
          }
          
          // Uwzględnij rabat przy obliczaniu totalPrice
          const discount = item.discount || 0;
          const discountMultiplier = (100 - parseFloat(discount)) / 100;
          const priceAfterDiscount = bestPrice.price * discountMultiplier;
          
          return {
            ...item,
            supplierPrice: bestPrice.price,
            supplierId: bestPrice.supplierId,
            supplierName: supplierName,
            unitPrice: bestPrice.price,
            totalPrice: priceAfterDiscount * item.quantity
          };
        }
        return item;
      });
      
      // Aktualizuj poData z zaktualizowanymi pozycjami
      setPoData(prev => ({
        ...prev,
        items: updatedItems
      }));
      
      // Znajdź dostawcę z największą liczbą pozycji
      const supplierCounts = {};
      for (const itemId in bestPrices) {
        const supplierId = bestPrices[itemId].supplierId;
        supplierCounts[supplierId] = (supplierCounts[supplierId] || 0) + 1;
      }
      
      // Znajdź dostawcę z największą liczbą pozycji
      let bestSupplierId = null;
      let maxCount = 0;
      
      for (const supplierId in supplierCounts) {
        if (supplierCounts[supplierId] > maxCount) {
          maxCount = supplierCounts[supplierId];
          bestSupplierId = supplierId;
        }
      }
      
      // Jeśli nie mamy jeszcze wybranego dostawcy, ustaw dostawcę z największą liczbą pozycji
      if (!poData.supplier && bestSupplierId) {
        const supplier = suppliers.find(s => s.id === bestSupplierId);
        if (supplier) {
          setPoData(prev => ({
            ...prev,
            supplier: supplier,
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
  
  // Funkcja do znajdowania i używania domyślnych cen dostawców
  const useDefaultSupplierPrices = async () => {
    if (!poData.items || poData.items.length === 0) {
      showError('Brak pozycji w zamówieniu');
      return;
    }
    
    try {
      setLoadingSupplierSuggestions(true);
      
      // Przygotuj listę elementów do sprawdzenia
      const itemsToCheck = poData.items
        .filter(item => item.inventoryItemId)
        .map(item => ({
          itemId: item.inventoryItemId,
          quantity: item.quantity
        }));
      
      if (itemsToCheck.length === 0) {
        showError('Brak pozycji magazynowych do sprawdzenia');
        setLoadingSupplierSuggestions(false);
        return;
      }
      
      // Znajdź najlepsze ceny dostawców (funkcja sprawdzi również domyślne ceny)
      const bestPrices = await getBestSupplierPricesForItems(itemsToCheck);
      setSupplierSuggestions(bestPrices);
      
      let hasDefaultPrices = false;
      let anyPriceFound = false;
      
      // Aktualizuj pozycje zamówienia z najlepszymi/domyślnymi cenami
      const updatedItems = poData.items.map(item => {
        if (item.inventoryItemId && bestPrices[item.inventoryItemId]) {
          const bestPrice = bestPrices[item.inventoryItemId];
          anyPriceFound = true;
          
          // Znajdź nazwę dostawcy
          const supplier = suppliers.find(s => s.id === bestPrice.supplierId);
          const supplierName = supplier ? supplier.name : 'Nieznany dostawca';
          
          // Sprawdź czy to domyślna cena
          if (bestPrice.isDefault) {
            hasDefaultPrices = true;
          }
          
          // Uwzględnij rabat przy obliczaniu totalPrice
          const discount = item.discount || 0;
          const discountMultiplier = (100 - parseFloat(discount)) / 100;
          const priceAfterDiscount = bestPrice.price * discountMultiplier;
          
          return {
            ...item,
            supplierPrice: bestPrice.price,
            supplierId: bestPrice.supplierId,
            supplierName: supplierName,
            unitPrice: bestPrice.price,
            totalPrice: priceAfterDiscount * item.quantity
          };
        }
        return item;
      });
      
      // Aktualizuj poData z zaktualizowanymi pozycjami
      setPoData(prev => ({
        ...prev,
        items: updatedItems
      }));
      
      // Znajdź dostawcę z największą liczbą pozycji
      const supplierCounts = {};
      for (const itemId in bestPrices) {
        const supplierId = bestPrices[itemId].supplierId;
        supplierCounts[supplierId] = (supplierCounts[supplierId] || 0) + 1;
      }
      
      // Znajdź dostawcę z największą liczbą pozycji
      let bestSupplierId = null;
      let maxCount = 0;
      
      for (const supplierId in supplierCounts) {
        if (supplierCounts[supplierId] > maxCount) {
          maxCount = supplierCounts[supplierId];
          bestSupplierId = supplierId;
        }
      }
      
      // Jeśli nie mamy jeszcze wybranego dostawcy, ustaw dostawcę z największą liczbą pozycji
      if (!poData.supplier && bestSupplierId) {
        const supplier = suppliers.find(s => s.id === bestSupplierId);
        if (supplier) {
          setPoData(prev => ({
            ...prev,
            supplier: supplier,
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
  
  // Funkcja do aktualizacji zamówienia z najlepszymi cenami
  const applyBestSupplierPrices = () => {
    if (!supplierSuggestions || Object.keys(supplierSuggestions).length === 0) {
      showError('Brak sugestii dostawców do zastosowania');
      return;
    }
    
    // Aktualizuj wszystkie pozycje z sugerowanymi cenami
    const updatedItems = poData.items.map(item => {
      if (item.inventoryItemId && supplierSuggestions[item.inventoryItemId]) {
        const suggestion = supplierSuggestions[item.inventoryItemId];
        
        // Uwzględnij rabat przy obliczaniu totalPrice
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
    
    setPoData(prev => ({
      ...prev,
      items: updatedItems
    }));
    
    showSuccess('Zastosowano sugerowane ceny dostawców');
  };
  
  // Funkcja do uzupełniania minimalnych ilości zamówienia
  const fillMinimumOrderQuantities = () => {
    if (!poData.items || poData.items.length === 0) {
      showError('Brak pozycji w zamówieniu');
      return;
    }
    
    console.log('[DEBUG] Rozpoczynam uzupełnianie minimalnych ilości zamówienia');
    console.log('[DEBUG] poData.items:', poData.items);
    console.log('[DEBUG] inventoryItems:', inventoryItems);
    
    try {
      // Aktualizuj pozycje zamówienia uwzględniając minimalne ilości zamówienia
      const updatedItems = poData.items.map(item => {
        // Sprawdź czy istnieje element magazynowy o tym ID
        const inventoryItem = inventoryItems.find(i => i.id === item.inventoryItemId);
        console.log(`[DEBUG] Pozycja: ${item.name}, ID: ${item.inventoryItemId}`);
        console.log(`[DEBUG] Znaleziony inventoryItem:`, inventoryItem);
        
        if (!inventoryItem) {
          console.log(`[DEBUG] Nie znaleziono elementu magazynowego dla ID: ${item.inventoryItemId}`);
          return item;
        }
        
        // Jeśli istnieje minimalna ilość zakupu i aktualna ilość jest mniejsza, zaktualizuj
        const minOrderQuantity = inventoryItem.minOrderQuantity || 0;
        console.log(`[DEBUG] minOrderQuantity:`, minOrderQuantity);
        console.log(`[DEBUG] item.quantity:`, parseFloat(item.quantity));
        console.log(`[DEBUG] item.unit:`, item.unit);
        console.log(`[DEBUG] inventoryItem.unit:`, inventoryItem.unit);
        
        if (minOrderQuantity > 0 && parseFloat(item.quantity) < minOrderQuantity && item.unit === inventoryItem.unit) {
          console.log(`[DEBUG] Aktualizuję ilość z ${item.quantity} na ${minOrderQuantity}`);
          const updatedQuantity = minOrderQuantity;
          // Uwzględnij rabat przy obliczaniu totalPrice
          const discount = item.discount || 0;
          const discountMultiplier = (100 - parseFloat(discount)) / 100;
          const priceAfterDiscount = (item.unitPrice || 0) * discountMultiplier;
          return {
            ...item,
            quantity: updatedQuantity,
            totalPrice: priceAfterDiscount * updatedQuantity
          };
        }
        
        console.log(`[DEBUG] Nie aktualizuję ilości dla: ${item.name}`);
        return item;
      });
      
      // Sprawdź czy dokonano jakichkolwiek zmian
      const hasChanges = updatedItems.some((updatedItem, index) => 
        updatedItem.quantity !== poData.items[index].quantity
      );
      
      console.log(`[DEBUG] Czy dokonano zmian: ${hasChanges}`);
      
      if (hasChanges) {
        console.log(`[DEBUG] Aktualizuję pozycje zamówienia`);
        setPoData(prev => ({
          ...prev,
          items: updatedItems
        }));
        showSuccess('Uzupełniono minimalne ilości zamówienia');
      } else {
        showError('Wszystkie pozycje już spełniają minimalne ilości zamówienia');
      }
    } catch (error) {
      console.error('Błąd podczas uzupełniania minimalnych ilości:', error);
      showError('Wystąpił błąd podczas uzupełniania minimalnych ilości');
    }
  };
  
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
  
  // Funkcja fetchData wywołuje fetchInitialData
  const fetchData = async () => {
    try {
      setLoading(true);
      console.log("Pobieranie danych formularza PO, ID:", currentOrderId);
      
      // Pobierz dostawców
      const suppliersData = await getAllSuppliers();
      setSuppliers(suppliersData);
      
      // Pobierz przedmioty magazynowe
      const itemsData = await getAllInventoryItems();
      setInventoryItems(itemsData);
      
      // Pobierz magazyny
      const warehousesData = await getAllWarehouses();
      setWarehouses(warehousesData);
      
      // Jeśli edytujemy istniejące zamówienie, pobierz jego dane
      if (currentOrderId && currentOrderId !== 'new') {
        console.log("Pobieranie danych istniejącego zamówienia:", currentOrderId);
        const poDetails = await getPurchaseOrderById(currentOrderId);
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
      
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas pobierania danych:', error);
      showError('Nie udało się pobrać danych: ' + error.message);
      setLoading(false);
    }
  };
  
  // Efekt dla pobierania danych
  useEffect(() => {
    fetchData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);
  
  // Funkcja dodająca nowy link do faktury
  const handleAddInvoiceLink = () => {
    const newInvoiceLink = {
      id: `invoice-${Date.now()}`,
      description: '',
      url: ''
    };
    
    setPoData(prev => ({
      ...prev,
      invoiceLinks: [...(prev.invoiceLinks || []), newInvoiceLink],
      // Aktualizacja starego pola invoiceLink dla kompatybilności
      // Jeśli jest to pierwsza faktura, ustawiamy też stare pole
      invoiceLink: prev.invoiceLinks?.length === 0 ? newInvoiceLink.url : prev.invoiceLink
    }));
  };
  
  // Funkcja obsługująca zmianę danych linku do faktury
  const handleInvoiceLinkChange = (id, field, value) => {
    const updatedInvoiceLinks = (poData.invoiceLinks || []).map(link => {
      if (link.id === id) {
        const updatedLink = { ...link, [field]: value };
        
        // Jeśli aktualizujemy URL pierwszej faktury, zaktualizuj też stare pole invoiceLink dla kompatybilności
        if (field === 'url' && poData.invoiceLinks.indexOf(link) === 0) {
          setPoData(prev => ({
            ...prev,
            invoiceLink: value
          }));
        }
        
        return updatedLink;
      }
      return link;
    });
    
    setPoData(prev => ({
      ...prev,
      invoiceLinks: updatedInvoiceLinks
    }));
  };
  
  // Funkcja usuwająca link do faktury
  const handleRemoveInvoiceLink = (id) => {
    setPoData(prev => ({
      ...prev,
      invoiceLinks: prev.invoiceLinks.filter(link => link.id !== id)
    }));
  };

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
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5">
          {currentOrderId && currentOrderId !== 'new' ? t('purchaseOrders.form.editTitle') : t('purchaseOrders.form.createTitle')}
        </Typography>
        
        {/* Wyświetlanie numeru PO w trybie edycji */}
        {currentOrderId && currentOrderId !== 'new' && poData.number && (
          <Alert severity="info" sx={{ mt: 2 }}>
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
            {/* Dostawca */}
            <Grid item xs={12} md={6}>
              <Autocomplete
                options={suppliers}
                getOptionLabel={(option) => option.name}
                value={poData.supplier}
                onChange={handleSupplierChange}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label={t('purchaseOrders.form.supplier')}
                    required
                    fullWidth
                  />
                )}
              />
            </Grid>
            
            {/* Magazyn docelowy */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth required>
                <InputLabel>{t('purchaseOrders.form.targetWarehouse')}</InputLabel>
                <Select
                  name="targetWarehouseId"
                  value={poData.targetWarehouseId}
                  onChange={handleChange}
                  label={t('purchaseOrders.form.targetWarehouse')}
                >
                  <MenuItem value=""><em>{t('purchaseOrders.form.selectWarehouse')}</em></MenuItem>
                  {warehouses.map((warehouse) => (
                    <MenuItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            {/* Data zamówienia */}
            <Grid item xs={12} md={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                <DatePicker
                  label={t('purchaseOrders.form.orderDate')}
                  value={(() => {
                    if (!poData.orderDate) return null;
                    try {
                      // Jeśli to już obiekt Date, użyj go bezpośrednio
                      if (poData.orderDate instanceof Date) {
                        return isValid(poData.orderDate) ? poData.orderDate : null;
                      }
                      // Jeśli to Firestore Timestamp
                      if (poData.orderDate && typeof poData.orderDate.toDate === 'function') {
                        return poData.orderDate.toDate();
                      }
                      // Jeśli to string, spróbuj sparsować
                      if (typeof poData.orderDate === 'string') {
                        if (poData.orderDate.includes('Invalid') || poData.orderDate.trim() === '') {
                          return null;
                        }
                        const date = poData.orderDate.includes('T') || poData.orderDate.includes('Z') 
                          ? parseISO(poData.orderDate) 
                          : new Date(poData.orderDate + 'T00:00:00');
                        return isValid(date) ? date : null;
                      }
                      return null;
                    } catch (error) {
                      console.error('Błąd parsowania orderDate:', error, poData.orderDate);
                      return null;
                    }
                  })()}
                  onChange={(date) => handleDateChange('orderDate', date)}
                  minDate={new Date('1900-01-01')}
                  maxDate={new Date('2100-12-31')}
                  slotProps={{ textField: { fullWidth: true, error: false } }}
                />
              </LocalizationProvider>
            </Grid>
            
            {/* Planowana data dostawy */}
            <Grid item xs={12} md={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                <DatePicker
                  label={t('purchaseOrders.form.expectedDeliveryDate')}
                  value={(() => {
                    if (!poData.expectedDeliveryDate) return null;
                    try {
                      // Jeśli to już obiekt Date, użyj go bezpośrednio
                      if (poData.expectedDeliveryDate instanceof Date) {
                        return isValid(poData.expectedDeliveryDate) ? poData.expectedDeliveryDate : null;
                      }
                      // Jeśli to Firestore Timestamp
                      if (poData.expectedDeliveryDate && typeof poData.expectedDeliveryDate.toDate === 'function') {
                        return poData.expectedDeliveryDate.toDate();
                      }
                      // Jeśli to string, spróbuj sparsować
                      if (typeof poData.expectedDeliveryDate === 'string') {
                        if (poData.expectedDeliveryDate.includes('Invalid') || poData.expectedDeliveryDate.trim() === '') {
                          return null;
                        }
                        const date = poData.expectedDeliveryDate.includes('T') || poData.expectedDeliveryDate.includes('Z') 
                          ? parseISO(poData.expectedDeliveryDate) 
                          : new Date(poData.expectedDeliveryDate + 'T00:00:00');
                        return isValid(date) ? date : null;
                      }
                      return null;
                    } catch (error) {
                      console.error('Błąd parsowania expectedDeliveryDate:', error, poData.expectedDeliveryDate);
                      return null;
                    }
                  })()}
                  onChange={(date) => handleDateChange('expectedDeliveryDate', date)}
                  minDate={new Date('1900-01-01')}
                  maxDate={new Date('2100-12-31')}
                  slotProps={{ textField: { fullWidth: true, required: true, error: false } }}
                />
              </LocalizationProvider>
            </Grid>
            
            {/* Adres dostawcy */}
            <Grid item xs={12}>
              <TextField
                name="deliveryAddress"
                label={t('purchaseOrders.form.supplierAddress')}
                value={poData.deliveryAddress}
                onChange={handleChange}
                fullWidth
                multiline
                rows={3}
              />
              
              {/* Lista adresów dostawcy */}
              {poData.supplier && poData.supplier.addresses && poData.supplier.addresses.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    {t('purchaseOrders.form.selectSupplierAddress')}
                  </Typography>
                  <Grid container spacing={1}>
                    {poData.supplier.addresses.map((address, idx) => (
                      <Grid item xs={12} sm={6} key={address.id || idx}>
                        <Button
                          variant="outlined"
                          size="small"
                          fullWidth
                          sx={{ justifyContent: 'flex-start', textAlign: 'left', py: 1 }}
                          onClick={() => setPoData({ ...poData, deliveryAddress: formatAddress(address) })}
                        >
                          <Box>
                            <Typography variant="body2" fontWeight="bold">
                              {address.name} {address.isMain && t('purchaseOrders.form.mainAddress')}
                            </Typography>
                            <Typography variant="body2">{formatAddress(address)}</Typography>
                          </Box>
                        </Button>
                      </Grid>
                    ))}
                  </Grid>
                </Box>
              )}
            </Grid>
            
            {/* Uwagi */}
            <Grid item xs={12}>
              <TextField
                name="notes"
                label={t('purchaseOrders.form.notes')}
                value={poData.notes}
                onChange={handleChange}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>
            

            
            {/* Dodatkowe koszty */}
            <Grid item xs={12}>
              <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="subtitle1">
                    {t('purchaseOrders.form.additionalCosts.title')}
                  </Typography>
                </Box>
                <Button
                  startIcon={<AddIcon />}
                  onClick={handleAddAdditionalCost}
                  variant="outlined"
                  size="small"
                >
                  {t('purchaseOrders.form.additionalCosts.addCost')}
                </Button>
              </Box>
              
              {poData.additionalCostsItems.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>
                  {t('purchaseOrders.form.additionalCosts.noCosts')}
                </Typography>
              ) : (
                <TableContainer component={Paper} sx={{ mb: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('purchaseOrders.form.additionalCosts.description')}</TableCell>
                        <TableCell align="right">{t('purchaseOrders.form.additionalCosts.amount')}</TableCell>
                        <TableCell align="right">{t('purchaseOrders.form.currency')}</TableCell>
                        <TableCell align="right">{t('purchaseOrders.form.additionalCosts.vatRate')}</TableCell>
                        <TableCell width="50px"></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {poData.additionalCostsItems.map((cost) => (
                        <React.Fragment key={cost.id}>
                          <TableRow hover>
                            <TableCell>
                              <TextField
                                fullWidth
                                size="small"
                                value={cost.description}
                                onChange={(e) => handleAdditionalCostChange(cost.id, 'description', e.target.value)}
                                placeholder={t('purchaseOrders.form.additionalCosts.placeholder')}
                                sx={{ minWidth: '250px' }}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <TextField
                                type="number"
                                size="small"
                                value={cost.currency === poData.currency ? cost.value : (cost.originalValue || 0)}
                                onChange={(e) => handleAdditionalCostChange(cost.id, 'value', e.target.value)}
                                inputProps={{ step: 'any' }}
                                sx={{ 
                                  width: 120,
                                  '& input[type=number]': {
                                    '-moz-appearance': 'textfield',
                                  },
                                  '& input[type=number]::-webkit-outer-spin-button': {
                                    '-webkit-appearance': 'none',
                                    margin: 0,
                                  },
                                  '& input[type=number]::-webkit-inner-spin-button': {
                                    '-webkit-appearance': 'none',
                                    margin: 0,
                                  },
                                }}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <FormControl size="small" sx={{ width: 100 }}>
                                <Select
                                  value={cost.currency || poData.currency}
                                  onChange={(e) => handleAdditionalCostChange(cost.id, 'currency', e.target.value)}
                                  size="small"
                                >
                                  <MenuItem value="EUR">EUR</MenuItem>
                                  <MenuItem value="PLN">PLN</MenuItem>
                                  <MenuItem value="USD">USD</MenuItem>
                                  <MenuItem value="GBP">GBP</MenuItem>
                                  <MenuItem value="CHF">CHF</MenuItem>
                                </Select>
                              </FormControl>
                            </TableCell>
                            <TableCell align="right">
                              <FormControl size="small" sx={{ width: 100 }}>
                                <Select
                                  value={cost.vatRate !== undefined ? cost.vatRate : 0}
                                  onChange={(e) => handleAdditionalCostChange(cost.id, 'vatRate', e.target.value)}
                                  size="small"
                                >
                                  <MenuItem value={0}>0%</MenuItem>
                                  <MenuItem value={5}>5%</MenuItem>
                                  <MenuItem value={8}>8%</MenuItem>
                                  <MenuItem value={23}>23%</MenuItem>
                                  <MenuItem value="ZW">ZW</MenuItem>
                                  <MenuItem value="NP">NP</MenuItem>
                                </Select>
                              </FormControl>
                            </TableCell>
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                                <Tooltip title={t('purchaseOrders.form.additionalCosts.expandFields')}>
                                  <IconButton 
                                    size="small" 
                                    onClick={() => {
                                      const expandedCostItems = { ...poData.expandedCostItems || {} };
                                      expandedCostItems[cost.id] = !expandedCostItems[cost.id];
                                      setPoData(prev => ({ ...prev, expandedCostItems }));
                                    }}
                                  >
                                    {poData.expandedCostItems && poData.expandedCostItems[cost.id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                                  </IconButton>
                                </Tooltip>
                                <IconButton
                                  size="small"
                                  onClick={() => handleRemoveAdditionalCost(cost.id)}
                                  color="error"
                                >
                                  <DeleteIcon />
                                </IconButton>
                              </Box>
                            </TableCell>
                          </TableRow>
                          
                          {/* Dodatkowy wiersz z pozostałymi polami - widoczny po rozwinięciu */}
                          {poData.expandedCostItems && poData.expandedCostItems[cost.id] && (
                            <TableRow sx={{ backgroundColor: 'action.hover' }}>
                              <TableCell colSpan={5}>
                                <Grid container spacing={2} sx={{ py: 1 }}>
                                  <Grid item xs={12} sm={4}>
                                    <Typography variant="caption" display="block" gutterBottom>
                                      {t('purchaseOrders.form.additionalCosts.originalAmount')}
                                    </Typography>
                                    {cost.currency !== poData.currency ? (
                                      <Tooltip title={`Oryginalnie w ${cost.currency}`}>
                                        <Typography variant="body2">
                                          {formatCurrency(cost.originalValue || 0, cost.currency)}
                                        </Typography>
                                      </Tooltip>
                                    ) : (
                                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                        -
                                      </Typography>
                                    )}
                                  </Grid>
                                  <Grid item xs={12} sm={4}>
                                    <Typography variant="caption" display="block" gutterBottom>
                                      Kwota po przewalutowaniu
                                    </Typography>
                                    {cost.currency !== poData.currency ? (
                                      <Tooltip title={`Po przewalutowaniu na ${poData.currency}`}>
                                        <Typography variant="body2">
                                          {formatCurrency(cost.value || 0, poData.currency)}
                                        </Typography>
                                      </Tooltip>
                                    ) : (
                                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                        -
                                      </Typography>
                                    )}
                                  </Grid>
                                  <Grid item xs={12} sm={4}>
                                    <Typography variant="caption" display="block" gutterBottom>
                                      Nr faktury
                                    </Typography>
                                    <TextField
                                      fullWidth
                                      size="small"
                                      value={cost.invoiceNumber || ''}
                                      onChange={(e) => handleAdditionalCostChange(cost.id, 'invoiceNumber', e.target.value)}
                                      placeholder="Nr faktury"
                                    />
                                  </Grid>
                                  <Grid item xs={12} sm={4}>
                                    <Typography variant="caption" display="block" gutterBottom>
                                      Data faktury
                                    </Typography>
                                    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                                      <DatePicker
                                        value={(() => {
                                          if (!cost.invoiceDate) return null;
                                          try {
                                            // Jeśli to już obiekt Date, użyj go bezpośrednio
                                            if (cost.invoiceDate instanceof Date) {
                                              return isValid(cost.invoiceDate) ? cost.invoiceDate : null;
                                            }
                                            
                                            // Jeśli to Firestore Timestamp
                                            if (cost.invoiceDate && typeof cost.invoiceDate.toDate === 'function') {
                                              const date = cost.invoiceDate.toDate();
                                              return isValid(date) ? date : null;
                                            }
                                            
                                            // Jeśli to string
                                            if (typeof cost.invoiceDate === 'string') {
                                              const trimmed = cost.invoiceDate.trim();
                                              if (trimmed === '' || trimmed.includes('Invalid')) {
                                                return null;
                                              }
                                              
                                              // Parsuj string do Date
                                              let date;
                                              if (trimmed.includes('T') || trimmed.includes('Z')) {
                                                date = parseISO(trimmed);
                                              } else {
                                                // Format YYYY-MM-DD lub podobny
                                                date = new Date(trimmed + 'T00:00:00');
                                              }
                                              
                                              return isValid(date) ? date : null;
                                            }
                                            
                                            return null;
                                          } catch (error) {
                                            console.error('Błąd parsowania invoiceDate (dodatkowy koszt):', error, cost.invoiceDate);
                                            return null;
                                          }
                                        })()}
                                        onChange={(newValue) => {
                                          // Zapisz obiekt Date bezpośrednio
                                          if (newValue && newValue instanceof Date && !isNaN(newValue.getTime())) {
                                            handleAdditionalCostChange(cost.id, 'invoiceDate', newValue);
                                          } else {
                                            // Usuń datę
                                            handleAdditionalCostChange(cost.id, 'invoiceDate', null);
                                          }
                                        }}
                                        onError={(error) => {
                                          // Obsługuj błędy parsowania bez resetowania wartości
                                          console.log('DatePicker error:', error);
                                        }}
                                        disableHighlightToday={false}
                                        reduceAnimations={true}
                                        minDate={new Date('1900-01-01')}
                                        maxDate={new Date('2100-12-31')}
                                        slotProps={{ 
                                          textField: { 
                                            fullWidth: true, 
                                            size: 'small',
                                            placeholder: 'dd.mm.yyyy',
                                            onBlur: (event) => {
                                              // Dodatowa obsługa onBlur żeby zachować wartości podczas edycji
                                              console.log('DatePicker blur:', event.target.value);
                                            },
                                            error: false
                                          },
                                          field: { 
                                            clearable: true,
                                            shouldRespectLeadingZeros: true
                                          }
                                        }}
                                        format="dd.MM.yyyy"
                                        views={['year', 'month', 'day']}
                                        dayOfWeekFormatter={(date) => {
                                    try {
                                      if (!date || !isValid(date)) {
                                        return '';
                                      }
                                      // Użyj krótszego formatu dla dni tygodnia
                                      return format(date, 'EEE', { locale: pl }).slice(0, 2);
                                    } catch (error) {
                                      console.warn('dayOfWeekFormatter error:', error, date);
                                      return '';
                                    }
                                  }}
                                      />
                                    </LocalizationProvider>
                                  </Grid>
                                  <Grid item xs={12} sm={4}>
                                    <Typography variant="caption" display="block" gutterBottom>
                                      Kurs
                                    </Typography>
                                    <TextField
                                      type="number"
                                      fullWidth
                                      size="small"
                                      value={cost.exchangeRate || 0}
                                      onChange={(e) => handleAdditionalCostChange(cost.id, 'exchangeRate', e.target.value)}
                                      placeholder="Kurs"
                                      inputProps={{ min: 0, step: 'any' }}
                                      disabled={cost.currency === poData.currency}
                                      sx={{
                                        '& input[type=number]': {
                                          '-moz-appearance': 'textfield',
                                        },
                                        '& input[type=number]::-webkit-outer-spin-button': {
                                          '-webkit-appearance': 'none',
                                          margin: 0,
                                        },
                                        '& input[type=number]::-webkit-inner-spin-button': {
                                          '-webkit-appearance': 'none',
                                          margin: 0,
                                        },
                                      }}
                                    />
                                  </Grid>
                                  
                                  {/* Nowe pole: Przypisanie do pozycji */}
                                  <Grid item xs={12}>
                                    <Typography variant="caption" display="block" gutterBottom>
                                      Przypisz koszt do pozycji
                                    </Typography>
                                    <FormControl fullWidth size="small">
                                      <Select
                                        multiple
                                        value={cost.affectedItems || []}
                                        onChange={(e) => handleAdditionalCostChange(cost.id, 'affectedItems', e.target.value)}
                                        renderValue={(selected) => {
                                          if (!selected || selected.length === 0) {
                                            return <em style={{ color: '#666' }}>Wszystkie pozycje (domyślnie)</em>;
                                          }
                                          const selectedItems = poData.items.filter(item => selected.includes(item.id));
                                          if (selectedItems.length === poData.items.length) {
                                            return <em style={{ color: '#666' }}>Wszystkie pozycje</em>;
                                          }
                                          return `${selectedItems.length} z ${poData.items.length} pozycji`;
                                        }}
                                        displayEmpty
                                        sx={{ 
                                          backgroundColor: 'background.paper',
                                          '& .MuiSelect-select em': {
                                            fontStyle: 'normal'
                                          }
                                        }}
                                      >
                                        <MenuItem value="" disabled>
                                          <em>Wybierz pozycje lub pozostaw puste dla wszystkich</em>
                                        </MenuItem>
                                        {poData.items && poData.items.length > 0 ? (
                                          poData.items.map((item) => (
                                            <MenuItem key={item.id} value={item.id}>
                                              <Checkbox 
                                                checked={(cost.affectedItems || []).includes(item.id)}
                                                size="small"
                                              />
                                              <Box sx={{ ml: 1 }}>
                                                <Typography variant="body2">
                                                  {item.name}
                                                </Typography>
                                                <Typography variant="caption" color="text.secondary">
                                                  {item.quantity} {item.unit} × {formatCurrency(item.unitPrice || 0, poData.currency)} = {formatCurrency(item.totalPrice || 0, poData.currency)}
                                                </Typography>
                                              </Box>
                                            </MenuItem>
                                          ))
                                        ) : (
                                          <MenuItem disabled>
                                            <Typography variant="body2" color="text.secondary">
                                              Brak pozycji w zamówieniu
                                            </Typography>
                                          </MenuItem>
                                        )}
                                      </Select>
                                    </FormControl>
                                    {cost.affectedItems && cost.affectedItems.length > 0 && (
                                      <Typography variant="caption" color="primary" sx={{ mt: 0.5, display: 'block' }}>
                                        ℹ️ Koszt będzie rozliczony proporcjonalnie tylko na wybrane pozycje
                                      </Typography>
                                    )}
                                    {(!cost.affectedItems || cost.affectedItems.length === 0) && (
                                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                        ℹ️ Koszt będzie rozliczony proporcjonalnie na wszystkie pozycje
                                      </Typography>
                                    )}
                                  </Grid>
                                </Grid>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                      <TableRow>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                          Suma:
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                          {formatNumberClean(poData.additionalCostsItems.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0))} {poData.currency}
                        </TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell />
                      </TableRow>
                      {/* Dodane wiersze z kwotami VAT dla poszczególnych stawek */}
                      {Array.from(new Set(poData.additionalCostsItems.map(cost => cost.vatRate)))
                        .filter(vatRate => typeof vatRate === 'number') // Filtrowanie tylko liczbowych stawek VAT
                        .sort((a, b) => a - b) // Sortowanie rosnąco
                        .map(vatRate => {
                          const costsWithSameVat = poData.additionalCostsItems.filter(cost => cost.vatRate === vatRate);
                          const sumNet = costsWithSameVat.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
                          const vatValue = (sumNet * vatRate) / 100;
                          
                          return (
                            <TableRow key={`vat-${vatRate}`}>
                              <TableCell align="right" sx={{ fontStyle: 'italic' }}>
                                VAT {vatRate}%:
                              </TableCell>
                              <TableCell align="right" sx={{ fontStyle: 'italic' }}>
                                {formatNumberClean(vatValue)} {poData.currency}
                              </TableCell>
                              <TableCell />
                              <TableCell />
                              <TableCell />
                            </TableRow>
                          );
                        })}
                      <TableRow>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                          Suma brutto:
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                          {(() => {
                            const netTotal = poData.additionalCostsItems.reduce(
                              (sum, item) => sum + (parseFloat(item.value) || 0), 0
                            );
                            const vatTotal = poData.additionalCostsItems.reduce((sum, item) => {
                              const itemValue = parseFloat(item.value) || 0;
                              const vatRate = typeof item.vatRate === 'number' ? item.vatRate : 0;
                              return sum + (itemValue * vatRate) / 100;
                            }, 0);
                            return formatNumberClean(netTotal + vatTotal);
                          })()} {poData.currency}
                        </TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell />
                      </TableRow>
                    </TableBody>
                  </Table>
                  
                  {/* Informacja o kursach walut */}
                  {poData.additionalCostsItems.some(cost => cost.currency !== poData.currency) && (
                    <Box sx={{ py: 1, px: 2 }}>
                      <Typography variant="caption" sx={{ fontStyle: 'italic' }} className="exchange-rate-info">
                        Wartości w walutach obcych zostały przeliczone według kursów z dnia poprzedzającego datę faktury lub z dnia utworzenia PO (jeśli brak daty faktury).
                      </Typography>
                    </Box>
                  )}
                </TableContainer>
              )}
            </Grid>
          </Grid>
          
          <Divider sx={{ my: 3 }} />
          
          {/* Pozycje zamówienia */}
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h6">{t('purchaseOrders.form.orderItems.title')}</Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                startIcon={<AddIcon />}
                onClick={handleAddItem}
                size="small"
              >
                {t('purchaseOrders.form.orderItems.addItem')}
              </Button>
              
              <Button
                variant="outlined"
                color="info"
                startIcon={<PlaylistAddCheckIcon />}
                onClick={fillMinimumOrderQuantities}
                size="small"
              >
                {t('purchaseOrders.form.orderItems.fillMinimumQuantities')}
              </Button>
              
              <Button
                variant="outlined"
                color="warning"
                startIcon={<SearchIcon />}
                onClick={findBestSuppliers}
                disabled={loadingSupplierSuggestions}
                size="small"
              >
                {t('purchaseOrders.form.orderItems.findBestPrices')}
              </Button>

              {Object.keys(supplierSuggestions).length > 0 && (
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={<AutorenewIcon />}
                  onClick={applyBestSupplierPrices}
                  size="small"
                >
                  {t('purchaseOrders.form.orderItems.applyBestPrices')}
                </Button>
              )}
            </Box>
          </Box>
          
          <TableContainer component={Paper} sx={{ overflowX: 'visible' }}>
            <Table>
              <TableHead>
                <TableRow>
                  {/* Podstawowe kolumny - zawsze widoczne */}
                  <TableCell width="20%">{t('purchaseOrders.form.orderItems.product')}</TableCell>
                  <TableCell width="10%">{t('purchaseOrders.form.orderItems.quantity')}</TableCell>
                  <TableCell width="7%">{t('purchaseOrders.form.orderItems.unit')}</TableCell>
                  <TableCell width="15%">{t('purchaseOrders.form.orderItems.unitPrice')}</TableCell>
                  <TableCell width="8%">{t('purchaseOrders.form.orderItems.discount')}</TableCell>
                  <TableCell width="7%">{t('purchaseOrders.form.currency')}</TableCell>
                  <TableCell width="5%">{t('purchaseOrders.form.orderItems.vatRate')}</TableCell>
                  <TableCell width="12%">{t('purchaseOrders.form.orderItems.expiryDate')}</TableCell>
                  <TableCell width="15%">{t('purchaseOrders.form.orderItems.amountAfterConversion')}</TableCell>
                  <TableCell width="5%"></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {poData.items.map((item, index) => (
                  <React.Fragment key={index}>
                    <TableRow hover>
                      {/* Podstawowe kolumny - zawsze widoczne */}
                      <TableCell>
                        <Autocomplete
                          options={inventoryItems}
                          getOptionLabel={(option) => option.name}
                          value={inventoryItems.find(i => i.id === item.inventoryItemId) || null}
                          onChange={(event, newValue) => handleItemSelect(index, newValue)}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              label={t('purchaseOrders.form.orderItems.product')}
                              required
                              size="small"
                            />
                          )}
                          sx={{ width: '100%' }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          value={item.quantity}
                          onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                          size="small"
                          inputProps={{ min: 0, step: 'any' }}
                          sx={{ 
                            width: '100%',
                            '& input[type=number]': {
                              '-moz-appearance': 'textfield',
                            },
                            '& input[type=number]::-webkit-outer-spin-button': {
                              '-webkit-appearance': 'none',
                              margin: 0,
                            },
                            '& input[type=number]::-webkit-inner-spin-button': {
                              '-webkit-appearance': 'none',
                              margin: 0,
                            },
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          value={item.unit}
                          onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                          size="small"
                          sx={{ width: '100%' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                          {supplierSuggestions[item.inventoryItemId]?.isDefault && (
                            <Tooltip title={t('purchaseOrders.form.orderItems.defaultSupplierPrice')}>
                              <StarIcon color="primary" sx={{ mr: 1 }} />
                            </Tooltip>
                          )}
                          <TextField
                            type="number"
                            value={item.currency === poData.currency ? item.unitPrice : (item.originalUnitPrice || 0)}
                            onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                            size="small"
                            inputProps={{ min: 0, step: 'any' }}
                            sx={{ 
                              width: '100%',
                              '& input[type=number]': {
                                '-moz-appearance': 'textfield',
                              },
                              '& input[type=number]::-webkit-outer-spin-button': {
                                '-webkit-appearance': 'none',
                                margin: 0,
                              },
                              '& input[type=number]::-webkit-inner-spin-button': {
                                '-webkit-appearance': 'none',
                                margin: 0,
                              },
                            }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          value={item.discount || 0}
                          onChange={(e) => handleItemChange(index, 'discount', e.target.value)}
                          size="small"
                          inputProps={{ min: 0, max: 100, step: 'any' }}
                          InputProps={{
                            endAdornment: '%',
                          }}
                          sx={{ 
                            width: '100%',
                            '& input[type=number]': {
                              '-moz-appearance': 'textfield',
                            },
                            '& input[type=number]::-webkit-outer-spin-button': {
                              '-webkit-appearance': 'none',
                              margin: 0,
                            },
                            '& input[type=number]::-webkit-inner-spin-button': {
                              '-webkit-appearance': 'none',
                              margin: 0,
                            },
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <FormControl size="small" sx={{ width: '100%' }}>
                          <Select
                            value={item.currency || poData.currency}
                            onChange={(e) => handleItemChange(index, 'currency', e.target.value)}
                            size="small"
                          >
                            <MenuItem value="EUR">EUR</MenuItem>
                            <MenuItem value="PLN">PLN</MenuItem>
                            <MenuItem value="USD">USD</MenuItem>
                            <MenuItem value="GBP">GBP</MenuItem>
                            <MenuItem value="CHF">CHF</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell>
                        <FormControl size="small" sx={{ width: '100%' }}>
                          <Select
                            value={item.vatRate !== undefined ? item.vatRate : 0}
                            onChange={(e) => handleItemChange(index, 'vatRate', e.target.value)}
                            size="small"
                          >
                            <MenuItem value={0}>0%</MenuItem>
                            <MenuItem value={5}>5%</MenuItem>
                            <MenuItem value={8}>8%</MenuItem>
                            <MenuItem value={23}>23%</MenuItem>
                            <MenuItem value="ZW">ZW</MenuItem>
                            <MenuItem value="NP">NP</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                            <DatePicker
                              value={(() => {
                                if (!item.expiryDate || item.noExpiryDate) return null;
                                try {
                                  let date;
                                  if (typeof item.expiryDate === 'string') {
                                    if (item.expiryDate.includes('Invalid') || item.expiryDate.trim() === '') {
                                      return null;
                                    }
                                    date = item.expiryDate.includes('T') || item.expiryDate.includes('Z') 
                                      ? parseISO(item.expiryDate) 
                                      : new Date(item.expiryDate + 'T00:00:00');
                                  } else if (item.expiryDate instanceof Date) {
                                    date = item.expiryDate;
                                  } else if (item.expiryDate && typeof item.expiryDate.toDate === 'function') {
                                    date = item.expiryDate.toDate();
                                  } else {
                                    return null;
                                  }
                                  return isValid(date) ? date : null;
                                } catch (error) {
                                  console.error('Błąd parsowania expiryDate:', error, item.expiryDate);
                                  return null;
                                }
                              })()}
                              onChange={(newValue) => {
                                // Zapisz obiekt Date bezpośrednio
                                if (newValue && newValue instanceof Date && !isNaN(newValue.getTime())) {
                                  handleItemChange(index, 'expiryDate', newValue);
                                  // Usuń flagę "brak daty ważności" jeśli ustawiono datę
                                  if (item.noExpiryDate) {
                                    handleItemChange(index, 'noExpiryDate', false);
                                  }
                                } else {
                                  // Usuń datę
                                  handleItemChange(index, 'expiryDate', null);
                                }
                              }}
                              disabled={item.noExpiryDate}
                              minDate={new Date()}
                              maxDate={new Date('2100-12-31')}
                              slotProps={{ 
                                textField: { 
                                  fullWidth: true, 
                                  size: 'small',
                                  placeholder: item.noExpiryDate ? 'Brak daty ważności' : 'dd.mm.yyyy',
                                  error: false
                                } 
                              }}
                              format="dd.MM.yyyy"
                            />
                          </LocalizationProvider>
                          <FormControlLabel
                            control={
                              <Checkbox
                                checked={item.noExpiryDate || false}
                                onChange={(e) => {
                                  const isChecked = e.target.checked;
                                  handleItemChange(index, 'noExpiryDate', isChecked);
                                  if (isChecked) {
                                    // Usuń datę ważności jeśli zaznaczono "brak daty ważności"
                                    handleItemChange(index, 'expiryDate', null);
                                  }
                                }}
                                size="small"
                              />
                            }
                            label="Brak daty"
                            sx={{ 
                              margin: 0,
                              '& .MuiFormControlLabel-label': { 
                                fontSize: '0.75rem',
                                color: 'text.secondary'
                              }
                            }}
                          />
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                          {formatCurrency(item.totalPrice || 0, poData.currency)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                          <Tooltip title="Rozwiń dodatkowe pola">
                            <IconButton 
                              size="small" 
                              onClick={() => {
                                const expandedItems = { ...poData.expandedItems || {} };
                                expandedItems[index] = !expandedItems[index];
                                setPoData(prev => ({ ...prev, expandedItems }));
                              }}
                            >
                              {poData.expandedItems && poData.expandedItems[index] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                            </IconButton>
                          </Tooltip>
                          <IconButton
                            size="small"
                            onClick={() => handleRemoveItem(index)}
                            color="error"
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      </TableCell>
                    </TableRow>
                    
                    {/* Dodatkowy wiersz z pozostałymi polami - widoczny po rozwinięciu */}
                    {poData.expandedItems && poData.expandedItems[index] && (
                      <TableRow sx={{ backgroundColor: 'action.hover' }}>
                        <TableCell colSpan={10}>
                          <Grid container spacing={2} sx={{ py: 1 }}>
                            <Grid item xs={12} sm={4}>
                              <Typography variant="caption" display="block" gutterBottom>
                                Kwota przed rabatem
                              </Typography>
                              <Typography variant="body2">
                                {formatCurrency((item.unitPrice || 0) * item.quantity, poData.currency)}
                                {item.discount > 0 && (
                                  <Typography variant="caption" component="span" sx={{ ml: 1, color: 'success.main' }}>
                                    (rabat {item.discount}%)
                                  </Typography>
                                )}
                              </Typography>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                              <Typography variant="caption" display="block" gutterBottom>
                                Kwota oryginalna
                              </Typography>
                              <Typography variant="body2">
                                {item.currency !== poData.currency 
                                  ? formatCurrency((item.originalUnitPrice || 0) * item.quantity, item.currency)
                                  : '-'}
                              </Typography>
                              {item.vatRate > 0 && (
                                <>
                                  <Typography variant="caption" display="block" gutterBottom sx={{ mt: 1 }}>
                                    Kwota z VAT ({item.vatRate}%)
                                  </Typography>
                                  <Typography variant="body2" sx={{ fontWeight: 'medium', color: 'primary.main' }}>
                                    {item.currency !== poData.currency 
                                      ? formatCurrency((item.originalUnitPrice || 0) * item.quantity * (1 + (item.vatRate || 0) / 100), item.currency)
                                      : formatCurrency((item.unitPrice || 0) * item.quantity * (1 + (item.vatRate || 0) / 100), poData.currency)}
                                  </Typography>
                                </>
                              )}
                            </Grid>
                            <Grid item xs={12} sm={4}>
                              <Typography variant="caption" display="block" gutterBottom>
                                Nr faktury
                              </Typography>
                              <TextField
                                fullWidth
                                size="small"
                                value={item.invoiceNumber || ''}
                                onChange={(e) => handleItemChange(index, 'invoiceNumber', e.target.value)}
                                placeholder="Nr faktury"
                              />
                            </Grid>
                            <Grid item xs={12} sm={4}>
                              <Typography variant="caption" display="block" gutterBottom>
                                Data faktury
                              </Typography>
                              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                                <DatePicker
                                  value={(() => {
                                    if (!item.invoiceDate) return null;
                                    try {
                                      // Jeśli to już obiekt Date, użyj go bezpośrednio
                                      if (item.invoiceDate instanceof Date) {
                                        return isValid(item.invoiceDate) ? item.invoiceDate : null;
                                      }
                                      
                                      // Jeśli to Firestore Timestamp
                                      if (item.invoiceDate && typeof item.invoiceDate.toDate === 'function') {
                                        const date = item.invoiceDate.toDate();
                                        return isValid(date) ? date : null;
                                      }
                                      
                                      // Jeśli to string
                                      if (typeof item.invoiceDate === 'string') {
                                        const trimmed = item.invoiceDate.trim();
                                        if (trimmed === '' || trimmed.includes('Invalid')) {
                                          return null;
                                        }
                                        
                                        // Parsuj string do Date
                                        let date;
                                        if (trimmed.includes('T') || trimmed.includes('Z')) {
                                          date = parseISO(trimmed);
                                        } else {
                                          // Format YYYY-MM-DD lub podobny
                                          date = new Date(trimmed + 'T00:00:00');
                                        }
                                        
                                        return isValid(date) ? date : null;
                                      }
                                      
                                      return null;
                                    } catch (error) {
                                      console.error('Błąd parsowania invoiceDate (pozycja):', error, item.invoiceDate);
                                      return null;
                                    }
                                  })()}
                                  onChange={(newValue) => {
                                    // Zapisz obiekt Date bezpośrednio
                                    if (newValue && newValue instanceof Date && !isNaN(newValue.getTime())) {
                                      handleItemChange(index, 'invoiceDate', newValue);
                                    } else {
                                      // Usuń datę
                                      handleItemChange(index, 'invoiceDate', null);
                                    }
                                  }}
                                  onError={(error) => {
                                    // Obsługuj błędy parsowania bez resetowania wartości
                                    console.log('DatePicker error:', error);
                                  }}
                                  disableHighlightToday={false}
                                  reduceAnimations={true}
                                  minDate={new Date('1900-01-01')}
                                  maxDate={new Date('2100-12-31')}
                                  slotProps={{ 
                                    textField: { 
                                      fullWidth: true, 
                                      size: 'small',
                                      placeholder: 'dd.mm.yyyy',
                                      onBlur: (event) => {
                                        // Dodatowa obsługa onBlur żeby zachować wartości podczas edycji
                                        console.log('DatePicker blur:', event.target.value);
                                      },
                                      error: false
                                    },
                                    field: { 
                                      clearable: true,
                                      shouldRespectLeadingZeros: true
                                    }
                                  }}
                                  format="dd.MM.yyyy"
                                  views={['year', 'month', 'day']}
                                />
                              </LocalizationProvider>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                              <Typography variant="caption" display="block" gutterBottom>
                                Termin płatności
                              </Typography>
                              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                                <DatePicker
                                  value={(() => {
                                    if (!item.paymentDueDate) return null;
                                    try {
                                      let date;
                                      if (typeof item.paymentDueDate === 'string') {
                                        if (item.paymentDueDate.includes('Invalid') || item.paymentDueDate.trim() === '') {
                                          return null;
                                        }
                                        date = item.paymentDueDate.includes('T') || item.paymentDueDate.includes('Z') 
                                          ? parseISO(item.paymentDueDate) 
                                          : new Date(item.paymentDueDate + 'T00:00:00');
                                      } else if (item.paymentDueDate instanceof Date) {
                                        date = item.paymentDueDate;
                                      } else if (item.paymentDueDate && typeof item.paymentDueDate.toDate === 'function') {
                                        date = item.paymentDueDate.toDate();
                                      } else {
                                        return null;
                                      }
                                      return isValid(date) ? date : null;
                                    } catch (error) {
                                      console.error('Błąd parsowania paymentDueDate:', error, item.paymentDueDate);
                                      return null;
                                    }
                                  })()}
                                  onChange={(newValue) => {
                                    // Zapisz obiekt Date bezpośrednio
                                    if (newValue && newValue instanceof Date && !isNaN(newValue.getTime())) {
                                      handleItemChange(index, 'paymentDueDate', newValue);
                                    } else {
                                      // Usuń datę
                                      handleItemChange(index, 'paymentDueDate', null);
                                    }
                                  }}
                                  minDate={new Date('1900-01-01')}
                                  maxDate={new Date('2100-12-31')}
                                  slotProps={{ 
                                    textField: { 
                                      fullWidth: true, 
                                      size: 'small',
                                      placeholder: 'dd.mm.yyyy',
                                      error: false
                                    } 
                                  }}
                                  format="dd.MM.yyyy"
                                />
                              </LocalizationProvider>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                              <Typography variant="caption" display="block" gutterBottom>
                                Planowana data dostawy
                              </Typography>
                              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                                <DatePicker
                                  value={(() => {
                                    if (!item.plannedDeliveryDate) return null;
                                    try {
                                      let date;
                                      if (typeof item.plannedDeliveryDate === 'string') {
                                        if (item.plannedDeliveryDate.includes('Invalid') || item.plannedDeliveryDate.trim() === '') {
                                          return null;
                                        }
                                        date = item.plannedDeliveryDate.includes('T') || item.plannedDeliveryDate.includes('Z') 
                                          ? parseISO(item.plannedDeliveryDate) 
                                          : new Date(item.plannedDeliveryDate + 'T00:00:00');
                                      } else if (item.plannedDeliveryDate instanceof Date) {
                                        date = item.plannedDeliveryDate;
                                      } else if (item.plannedDeliveryDate && typeof item.plannedDeliveryDate.toDate === 'function') {
                                        date = item.plannedDeliveryDate.toDate();
                                      } else {
                                        return null;
                                      }
                                      return isValid(date) ? date : null;
                                    } catch (error) {
                                      console.error('Błąd parsowania plannedDeliveryDate:', error, item.plannedDeliveryDate);
                                      return null;
                                    }
                                  })()}
                                  onChange={(newValue) => {
                                    // Zapisz obiekt Date bezpośrednio
                                    if (newValue && newValue instanceof Date && !isNaN(newValue.getTime())) {
                                      handleItemChange(index, 'plannedDeliveryDate', newValue);
                                    } else {
                                      // Usuń datę
                                      handleItemChange(index, 'plannedDeliveryDate', null);
                                    }
                                  }}
                                  minDate={new Date('1900-01-01')}
                                  maxDate={new Date('2100-12-31')}
                                  slotProps={{ 
                                    textField: { 
                                      fullWidth: true, 
                                      size: 'small',
                                      placeholder: 'dd.mm.yyyy',
                                      error: false
                                    } 
                                  }}
                                  format="dd.MM.yyyy"
                                />
                              </LocalizationProvider>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                              <Typography variant="caption" display="block" gutterBottom>
                                Rzeczywista data dostawy
                              </Typography>
                              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                                <DatePicker
                                  value={(() => {
                                    if (!item.actualDeliveryDate) return null;
                                    try {
                                      let date;
                                      if (typeof item.actualDeliveryDate === 'string') {
                                        if (item.actualDeliveryDate.includes('Invalid') || item.actualDeliveryDate.trim() === '') {
                                          return null;
                                        }
                                        date = item.actualDeliveryDate.includes('T') || item.actualDeliveryDate.includes('Z') 
                                          ? parseISO(item.actualDeliveryDate) 
                                          : new Date(item.actualDeliveryDate + 'T00:00:00');
                                      } else if (item.actualDeliveryDate instanceof Date) {
                                        date = item.actualDeliveryDate;
                                      } else if (item.actualDeliveryDate && typeof item.actualDeliveryDate.toDate === 'function') {
                                        date = item.actualDeliveryDate.toDate();
                                      } else {
                                        return null;
                                      }
                                      return isValid(date) ? date : null;
                                    } catch (error) {
                                      console.error('Błąd parsowania actualDeliveryDate:', error, item.actualDeliveryDate);
                                      return null;
                                    }
                                  })()}
                                  onChange={(newValue) => {
                                    // Zapisz obiekt Date bezpośrednio
                                    if (newValue && newValue instanceof Date && !isNaN(newValue.getTime())) {
                                      handleItemChange(index, 'actualDeliveryDate', newValue);
                                    } else {
                                      // Usuń datę
                                      handleItemChange(index, 'actualDeliveryDate', null);
                                    }
                                  }}
                                  minDate={new Date('1900-01-01')}
                                  maxDate={new Date('2100-12-31')}
                                  slotProps={{ 
                                    textField: { 
                                      fullWidth: true, 
                                      size: 'small',
                                      placeholder: 'dd.mm.yyyy',
                                      error: false
                                    } 
                                  }}
                                  format="dd.MM.yyyy"
                                />
                              </LocalizationProvider>
                            </Grid>
                            <Grid item xs={12} sm={4}>
                              <Typography variant="caption" display="block" gutterBottom>
                                Kurs
                              </Typography>
                              <TextField
                                type="number"
                                fullWidth
                                size="small"
                                value={item.exchangeRate || 0}
                                onChange={(e) => handleItemChange(index, 'exchangeRate', e.target.value)}
                                placeholder="Kurs"
                                inputProps={{ min: 0, step: 'any' }}
                                disabled={item.currency === poData.currency}
                                sx={{
                                  '& input[type=number]': {
                                    '-moz-appearance': 'textfield',
                                  },
                                  '& input[type=number]::-webkit-outer-spin-button': {
                                    '-webkit-appearance': 'none',
                                    margin: 0,
                                  },
                                  '& input[type=number]::-webkit-inner-spin-button': {
                                    '-webkit-appearance': 'none',
                                    margin: 0,
                                  },
                                }}
                              />
                            </Grid>
                            {Object.keys(supplierSuggestions).length > 0 && item.inventoryItemId && supplierSuggestions[item.inventoryItemId] && (
                              <Grid item xs={12}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                                  <InfoIcon fontSize="small" sx={{ mr: 1, color: 'info.main' }} />
                                  <Typography variant="body2">
                                    Sugerowana cena: {formatCurrency(supplierSuggestions[item.inventoryItemId].price)}
                                    {item.supplierName && ` (Dostawca: ${item.supplierName})`}
                                  </Typography>
                                </Box>
                              </Grid>
                            )}
                          </Grid>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          

          
          {loadingSupplierSuggestions && (
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2">Szukanie najlepszych cen dostawców...</Typography>
            </Box>
          )}
          
          {Object.keys(supplierSuggestions).length > 0 && (
            <Alert severity="info" sx={{ mt: 2, mb: 3 }}>
              Znaleziono sugestie cen dostawców dla {Object.keys(supplierSuggestions).length} pozycji.
              Kliknij "Zastosuj najlepsze ceny", aby zaktualizować zamówienie.
            </Alert>
          )}
          
          <Box sx={{ my: 3 }}>
            <Divider />
          </Box>
          
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Grid container spacing={2} justifyContent="flex-end">
              <Grid item xs={12} md={5}>
                <Paper sx={{ 
                  p: 3, 
                  backgroundColor: (theme) => theme.palette.mode === 'dark' 
                    ? alpha(theme.palette.background.paper, 0.9)
                    : 'grey.50' 
                }}>
                  <Typography variant="h6" gutterBottom sx={{ mb: 2, fontWeight: 'bold' }}>
                    {t('purchaseOrders.form.summary.title', 'Podsumowanie kosztów')}
                  </Typography>
                  
                  {/* Sekcja produktów */}
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'medium', color: 'text.primary' }}>
                      {t('purchaseOrders.form.summary.itemsValue')}: <strong>{formatNumberClean(poData.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0))} {poData.currency}</strong>
                    </Typography>
                    
                    {/* Sekcja VAT dla produktów */}
                    {poData.items.length > 0 && (
                      <Box sx={{ ml: 2, mt: 1 }}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          {t('purchaseOrders.form.summary.additionalCostsVat', 'VAT od produktów')}:
                        </Typography>
                        {/* Grupowanie pozycji według stawki VAT */}
                        {Array.from(new Set(poData.items.map(item => item.vatRate))).sort((a, b) => a - b).map(vatRate => {
                          if (vatRate === undefined) return null;
                          
                          const itemsWithSameVat = poData.items.filter(item => item.vatRate === vatRate);
                          const sumNet = itemsWithSameVat.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
                          const vatValue = typeof vatRate === 'number' ? (sumNet * vatRate) / 100 : 0;
                          
                          return (
                            <Typography key={vatRate} variant="body2" sx={{ pl: 1, color: 'text.secondary' }}>
                              Stawka {vatRate}%: <strong>{formatNumberClean(vatValue)} {poData.currency}</strong> <span style={{ fontSize: '0.85em' }}>(od {formatNumberClean(sumNet)} {poData.currency})</span>
                            </Typography>
                          );
                        })}
                      </Box>
                    )}
                  </Box>
                  
                  {/* Sekcja dodatkowych kosztów */}
                  {poData.additionalCostsItems.length > 0 && (
                    <Box sx={{ mb: 2 }}>
                      <Typography variant="subtitle1" sx={{ fontWeight: 'medium', color: 'text.primary' }}>
                        {t('purchaseOrders.form.summary.additionalCostsNet')}: <strong>{formatNumberClean(poData.additionalCostsNetTotal || 0)} {poData.currency}</strong>
                      </Typography>
                      
                      <Box sx={{ ml: 2, mt: 1 }}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          {t('purchaseOrders.form.summary.additionalCostsVat')}: <strong>{formatNumberClean(poData.additionalCostsVatTotal || 0)} {poData.currency}</strong>
                        </Typography>
                        {/* Grupowanie kosztów według stawki VAT */}
                        {Array.from(new Set(poData.additionalCostsItems.map(cost => cost.vatRate))).sort((a, b) => a - b).map(vatRate => {
                          if (vatRate === undefined) return null;
                          
                          const costsWithSameVat = poData.additionalCostsItems.filter(cost => cost.vatRate === vatRate);
                          const sumNet = costsWithSameVat.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
                          const vatValue = typeof vatRate === 'number' ? (sumNet * vatRate) / 100 : 0;
                          
                          return (
                            <Typography key={vatRate} variant="body2" sx={{ pl: 1, color: 'text.secondary' }}>
                              Stawka {vatRate}%: <strong>{formatNumberClean(vatValue)} {poData.currency}</strong> <span style={{ fontSize: '0.85em' }}>(od {formatNumberClean(sumNet)} {poData.currency})</span>
                            </Typography>
                          );
                        })}
                      </Box>
                      
                      {/* Informacja o kursach walut przy dodatkowych kosztach */}
                      {poData.additionalCostsItems.some(cost => cost.currency !== poData.currency) && (
                        <Box sx={{ 
                          mt: 1, 
                          p: 1, 
                          backgroundColor: (theme) => theme.palette.mode === 'dark' 
                            ? alpha(theme.palette.info.main, 0.15)
                            : 'info.light', 
                          borderRadius: 1 
                        }}>
                          <Typography variant="caption" sx={{ 
                            fontStyle: 'italic', 
                            color: (theme) => theme.palette.mode === 'dark' 
                              ? theme.palette.info.light 
                              : 'info.dark' 
                          }} className="exchange-rate-info">
                            {t('purchaseOrders.form.summary.exchangeRateInfo')}
                          </Typography>
                        </Box>
                      )}
                    </Box>
                  )}
                  
                  <Divider sx={{ my: 2 }} />
                  
                  {/* Podsumowanie końcowe */}
                  {parseFloat(poData.globalDiscount || 0) > 0 && (
                    <Box sx={{ mb: 1 }}>
                      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                        {t('purchaseOrders.form.summary.beforeDiscount')}: <strong>{formatNumberClean(poData.totalGrossBeforeDiscount || 0)} {poData.currency}</strong>
                      </Typography>
                    </Box>
                  )}
                  
                  <Box sx={{ mb: 1 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                      {t('purchaseOrders.form.summary.netValueTotal')}: <strong>{formatNumberClean(poData.totalValue || 0)} {poData.currency}</strong>
                    </Typography>
                  </Box>
                  
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'medium' }}>
                      {t('purchaseOrders.form.summary.vatTotal')}: <strong>{formatNumberClean(poData.totalVat || 0)} {poData.currency}</strong>
                    </Typography>
                  </Box>
                  
                  {/* Rabat globalny */}
                  <Box sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'medium', minWidth: '150px' }}>
                      {t('purchaseOrders.form.summary.globalDiscount')}:
                    </Typography>
                    <TextField
                      type="number"
                      size="small"
                      value={poData.globalDiscount || 0}
                      onChange={(e) => handleChange({ target: { name: 'globalDiscount', value: e.target.value } })}
                      inputProps={{ 
                        min: 0, 
                        max: 100, 
                        step: 0.01,
                        'aria-label': 'Rabat globalny'
                      }}
                      sx={{ 
                        width: 120,
                        '& input[type=number]': {
                          '-moz-appearance': 'textfield',
                        },
                        '& input[type=number]::-webkit-outer-spin-button': {
                          '-webkit-appearance': 'none',
                          margin: 0,
                        },
                        '& input[type=number]::-webkit-inner-spin-button': {
                          '-webkit-appearance': 'none',
                          margin: 0,
                        },
                      }}
                      InputProps={{
                        endAdornment: <Typography variant="body2" sx={{ color: 'text.secondary' }}>%</Typography>
                      }}
                    />
                                          {parseFloat(poData.globalDiscount || 0) > 0 && (
                        <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 'medium' }}>
                          {t('purchaseOrders.form.summary.savings')}: -{formatNumberClean(poData.discountAmount || 0)} {poData.currency}
                        </Typography>
                      )}
                  </Box>
                  
                  <Box sx={{ 
                    p: 2, 
                    backgroundColor: (theme) => theme.palette.mode === 'dark' 
                      ? alpha(theme.palette.primary.main, 0.2)
                      : 'primary.light', 
                    borderRadius: 1 
                  }}>
                    <Typography variant="h6" sx={{ 
                      fontWeight: 'bold', 
                      color: (theme) => theme.palette.mode === 'dark' 
                        ? theme.palette.primary.light 
                        : 'primary.dark' 
                    }}>
                      {t('purchaseOrders.form.summary.grossValue')}: <strong>{formatNumberClean(poData.totalGross || 0)} {poData.currency}</strong>
                    </Typography>
                  </Box>
                </Paper>
              </Grid>
            </Grid>
          </Box>
          
          <Divider sx={{ my: 3 }} />
          
          {/* Faktury - wielu linków */}
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle1">{t('purchaseOrders.form.invoices.title')}</Typography>
                <Button
                  startIcon={<AddIcon />}
                  onClick={handleAddInvoiceLink}
                  variant="outlined"
                  size="small"
                >
                  {t('purchaseOrders.form.invoices.addInvoice')}
                </Button>
              </Box>
              
              {!poData.invoiceLinks || poData.invoiceLinks.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>
                  {t('purchaseOrders.form.invoices.noInvoices')}
                </Typography>
              ) : (
                <TableContainer component={Paper} sx={{ mb: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('purchaseOrders.form.invoices.description')}</TableCell>
                        <TableCell>{t('purchaseOrders.form.invoices.link')}</TableCell>
                        <TableCell width="100px"></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {poData.invoiceLinks.map((invoice, index) => (
                        <TableRow key={invoice.id}>
                          <TableCell>
                            <TextField
                              fullWidth
                              size="small"
                              value={invoice.description}
                              onChange={(e) => handleInvoiceLinkChange(invoice.id, 'description', e.target.value)}
                              placeholder={t('purchaseOrders.form.invoices.descriptionPlaceholder')}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              fullWidth
                              size="small"
                              value={invoice.url}
                              onChange={(e) => handleInvoiceLinkChange(invoice.id, 'url', e.target.value)}
                              placeholder={t('purchaseOrders.form.invoices.linkPlaceholder')}
                            />
                          </TableCell>
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={() => handleRemoveInvoiceLink(invoice.id)}
                              color="error"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
              
              {/* Zachowujemy stare pole dla kompatybilności, ale ukrywamy je */}
              <input
                type="hidden"
                name="invoiceLink"
                value={poData.invoiceLink || ''}
              />
            </Grid>
            
            {/* Załączniki - nowy skategoryzowany komponent */}
            <Grid item xs={12}>
              <Typography variant="subtitle1" gutterBottom>
                {t('purchaseOrders.form.attachments')}
              </Typography>
              <PurchaseOrderCategorizedFileUpload
                orderId={currentOrderId || 'temp'}
                coaAttachments={poData.coaAttachments || []}
                invoiceAttachments={poData.invoiceAttachments || []}
                generalAttachments={poData.generalAttachments || []}
                onAttachmentsChange={handleCategorizedAttachmentsChange}
                disabled={saving}
              />
            </Grid>
          </Grid>

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
    </Container>
  );
};

export default PurchaseOrderForm; 