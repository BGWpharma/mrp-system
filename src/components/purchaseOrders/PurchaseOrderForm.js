import React, { useState, useEffect, useContext } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
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
  FormHelperText
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  FindReplace as SuggestIcon,
  InfoOutlined as InfoIcon,
  FindInPage as FindInPageIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  Check as CheckIcon,
  StarOutline as StarIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl } from 'date-fns/locale';
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
} from '../../services/inventoryService';
import { CURRENCY_OPTIONS } from '../../config';
import { formatCurrency } from '../../utils/formatUtils';
import { formatDateForInput } from '../../utils/dateUtils';
import { formatAddress } from '../../utils/addressUtils';
import { 
  getAllSuppliers,
  getBestSupplierPriceForItem, 
  getBestSupplierPricesForItems,
  getSupplierPriceForItem
} from '../../services/supplierService';
import { getExchangeRate, getExchangeRates } from '../../services/exchangeRateService';

const PurchaseOrderForm = ({ orderId }) => {
  const { poId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  
  // Używamy orderId z props, a jeśli nie istnieje, to poId z useParams()
  const currentOrderId = orderId || poId;
  
  const [loading, setLoading] = useState(!!currentOrderId && currentOrderId !== 'new');
  const [saving, setSaving] = useState(false);
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
    currency: 'EUR',
    targetWarehouseId: '', // Nowe pole dla magazynu docelowego
    orderDate: formatDateForInput(new Date()),
    expectedDeliveryDate: '',
    deliveryAddress: '',
    notes: '',
    status: PURCHASE_ORDER_STATUSES.DRAFT,
    invoiceLink: '',
    invoiceLinks: [], // Nowe pole dla wielu linków do faktur
  });
  
  useEffect(() => {
    const fetchInitialData = async () => {
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
          
          // Użyj formatDateForInput do formatowania dat
          const formattedOrderDate = poDetails.orderDate ? formatDateForInput(poDetails.orderDate) : formatDateForInput(new Date());
          const formattedDeliveryDate = poDetails.expectedDeliveryDate ? formatDateForInput(poDetails.expectedDeliveryDate) : '';
          
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
              vatRate: 23 // Domyślna stawka VAT
            }];
          }
          
          // Upewnij się, że wszystkie pozycje mają ustawione pole vatRate
          const itemsWithVatRate = poDetails.items ? poDetails.items.map(item => ({
            ...item,
            vatRate: typeof item.vatRate === 'number' ? item.vatRate : 23 // Domyślna stawka VAT 23%
          })) : [];
          
          // Upewnij się, że wszystkie dodatkowe koszty mają ustawione pole vatRate
          const costsWithVatRate = additionalCostsItems.map(cost => ({
            ...cost,
            vatRate: typeof cost.vatRate === 'number' ? cost.vatRate : 23 // Domyślna stawka VAT 23%
          }));
          
          setPoData({
            ...poDetails,
            supplier: matchedSupplier,
            orderDate: formattedOrderDate,
            expectedDeliveryDate: formattedDeliveryDate,
            invoiceLink: poDetails.invoiceLink || '',
            items: itemsWithVatRate,
            additionalCostsItems: costsWithVatRate
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
              showInfo(`Znaleziono dostawcę ${supplier.name} z najlepszą ceną dla ${inventoryItem.name}.`);
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
      
      // Ustaw puste kursy - wszystkie kursy będą pobierane na podstawie daty faktury
      const emptyRates = {};
      emptyRates[baseCurrency] = 1;
      
      for (const currency of currencies) {
        if (currency !== baseCurrency) {
          emptyRates[currency] = 0;
        }
      }
      
      console.log('Ustawiam puste kursy walut - będą pobierane na podstawie daty faktury');
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
  const calculateTotals = (items, additionalCosts = []) => {
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
    
    // Suma wartości netto: produkty + dodatkowe koszty
    const totalNet = itemsNetTotal + additionalCostsNetTotal;
    
    // Suma VAT: VAT od produktów + VAT od dodatkowych kosztów
    const totalVat = itemsVatTotal + additionalCostsVatTotal;
    
    // Wartość brutto: suma netto + suma VAT
    const totalGross = totalNet + totalVat;
    
    console.log('Obliczenia calculateTotals:');
    console.log('itemsNetTotal:', itemsNetTotal);
    console.log('itemsVatTotal:', itemsVatTotal);
    console.log('additionalCostsNetTotal:', additionalCostsNetTotal);
    console.log('additionalCostsVatTotal:', additionalCostsVatTotal);
    console.log('totalNet:', totalNet);
    console.log('totalVat:', totalVat);
    console.log('totalGross:', totalGross);
    
    return {
      itemsNetTotal,
      itemsVatTotal,
      additionalCostsNetTotal,
      additionalCostsVatTotal,
      totalNet,
      totalVat,
      totalGross,
    };
  };

  // Aktualizacja totali przy zmianie elementów
  useEffect(() => {
    const totals = calculateTotals(poData.items, poData.additionalCostsItems);
    setPoData(prev => ({
      ...prev,
      totalValue: totals.totalNet,
      totalVat: totals.totalVat,
      totalGross: totals.totalGross,
      itemsNetTotal: totals.itemsNetTotal,
      itemsVatTotal: totals.itemsVatTotal,
      additionalCostsNetTotal: totals.additionalCostsNetTotal,
      additionalCostsVatTotal: totals.additionalCostsVatTotal
    }));
  }, [poData.items, poData.additionalCostsItems]);
  
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
        // Upewnij się, że data jest poprawnym obiektem Date
        const validDate = date instanceof Date && !isNaN(date) ? date : new Date(date);
        console.log(`Poprawna data ${name}:`, validDate);
        
        // Użyj funkcji formatDateForInput aby poprawnie sformatować datę
        const formattedDate = formatDateForInput(validDate);
        console.log(`Sformatowana data ${name}:`, formattedDate);
        
        setPoData(prev => ({ ...prev, [name]: formattedDate }));
      } catch (error) {
        console.error(`Błąd podczas formatowania daty ${name}:`, error);
        // W przypadku błędu, ustaw pustą datę
        setPoData(prev => ({ ...prev, [name]: '' }));
      }
    } else {
      console.log(`Usunięcie daty ${name}`);
      setPoData(prev => ({ ...prev, [name]: '' }));
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
        vatRate: 23, // Domyślna stawka VAT 23%
        currency: poData.currency, // Domyślna waluta zgodna z zamówieniem
        originalUnitPrice: 0, // Wartość w oryginalnej walucie
        exchangeRate: 1, // Kurs wymiany
        invoiceNumber: '', // Numer faktury
        invoiceDate: '', // Data faktury
        plannedDeliveryDate: '', // Planowana data dostawy
        actualDeliveryDate: '' // Rzeczywista data dostawy
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
        // Pobierz datę poprzedniego dnia dla daty faktury
        const invoiceDate = new Date(value);
        const rateFetchDate = new Date(invoiceDate);
        rateFetchDate.setDate(rateFetchDate.getDate() - 1);
        
        console.log(`Dla faktury z datą ${value} pobieram kurs z dnia ${rateFetchDate.toISOString().split('T')[0]}`);
        
        // Uaktualnij datę faktury niezależnie od waluty
        let updatedItems = [...poData.items];
        
        // Uaktualnij datę faktury
        updatedItems[index] = {
          ...updatedItems[index],
          invoiceDate: value
        };
        
        // Pobierz kurs tylko jeśli waluta pozycji jest inna niż waluta zamówienia i nie jest to EUR
        if (currentItem.currency && 
            currentItem.currency !== poData.currency && 
            !(currentItem.currency === 'EUR' && poData.currency === 'EUR')) {
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
        }
        
        setPoData(prev => ({ ...prev, items: updatedItems }));
        return;
      } catch (error) {
        console.error('Błąd podczas przetwarzania daty faktury:', error);
        showError('Nieprawidłowy format daty faktury');
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
              unitPrice: originalPrice.toFixed(6),
              totalPrice: (originalPrice * currentItem.quantity).toFixed(2)
            };
            
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
                unitPrice: convertedPrice.toFixed(6),
                totalPrice: (convertedPrice * currentItem.quantity).toFixed(2)
              };
              
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
            // Jeśli nie mamy daty faktury, poproś użytkownika o jej wprowadzenie
            showInfo(`Aby przeliczać wartości z waluty ${newCurrency} na ${poData.currency}, wprowadź datę faktury.`);
            
            // Ustaw kurs na 0 jeśli nie ma daty faktury
            updatedItems[index] = {
              ...updatedItems[index],
              exchangeRate: 0
            };
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
              return { 
                ...item, 
                exchangeRate: newRate,
                unitPrice: convertedPrice.toFixed(6),
                totalPrice: (convertedPrice * item.quantity).toFixed(2)
              };
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
      value = 23; // Domyślna wartość VAT
    }
    
    updatedItems[index][field] = value;
    
    // Przelicz totalPrice jeśli zmieniono quantity lub unitPrice
    if (field === 'quantity' || field === 'unitPrice') {
      const quantity = field === 'quantity' ? value : updatedItems[index].quantity;
      const unitPrice = field === 'unitPrice' ? value : updatedItems[index].unitPrice;
      updatedItems[index].totalPrice = quantity * unitPrice;
      
      // Jeśli zmieniono unitPrice i waluta pozycji jest taka sama jak waluta zamówienia
      if (field === 'unitPrice' && (!updatedItems[index].currency || updatedItems[index].currency === poData.currency)) {
        updatedItems[index].originalUnitPrice = unitPrice;
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
            updatedItems[index] = {
              ...updatedItems[index],
              inventoryItemId: selectedItem.id,
              name: selectedItem.name,
              unit: selectedItem.unit || 'szt',
              // Używamy ceny dostawcy
              unitPrice: supplierPrice.price || 0,
              // Zachowujemy istniejącą ilość, jeśli jest, lub używamy minQuantity, jeśli jest większe od 1
              quantity: updatedItems[index].quantity || Math.max(1, supplierPrice.minQuantity || 1),
              totalPrice: (updatedItems[index].quantity || 1) * (supplierPrice.price || 0),
              vatRate: updatedItems[index].vatRate || 23, // Zachowujemy stawkę VAT lub ustawiamy domyślną 23%
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
    updatedItems[index] = {
      ...updatedItems[index],
      inventoryItemId: selectedItem.id,
      name: selectedItem.name,
      unit: selectedItem.unit || 'szt',
      // Zachowujemy istniejące wartości jeśli są, lub ustawiamy domyślne
      quantity: updatedItems[index].quantity || 1,
      unitPrice: updatedItems[index].unitPrice || 0,
      totalPrice: (updatedItems[index].quantity || 1) * (updatedItems[index].unitPrice || 0),
      vatRate: updatedItems[index].vatRate || 23, // Zachowujemy stawkę VAT lub ustawiamy domyślną 23%
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
          return {
            ...item,
            unitPrice: unitPrice.toFixed(6), // Zapewniamy 6 miejsc po przecinku
            totalPrice: (unitPrice * (parseFloat(item.quantity) || 0)).toFixed(2)
          };
        });
      }

      // Upewnij się, że wszystkie wartości kosztów dodatkowych mają odpowiednią precyzję
      if (orderData.additionalCostsItems && orderData.additionalCostsItems.length > 0) {
        orderData.additionalCostsItems = orderData.additionalCostsItems.map(cost => {
          const value = parseFloat(cost.value) || 0;
          return {
            ...cost,
            value: value.toFixed(6) // Zapewniamy 6 miejsc po przecinku
          };
        });
      }
      
      // Obliczanie wartości przy użyciu funkcji calculateTotals
      const totals = calculateTotals(orderData.items, orderData.additionalCostsItems);
      
      // Dodaj obliczone wartości do zapisywanych danych
      orderData.totalValue = totals.totalNet;
      orderData.totalGross = totals.totalGross;
      orderData.totalVat = totals.totalVat;
      
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
      showInfo('Niektóre pozycje nie spełniają minimalnych ilości zamówienia. Możesz użyć przycisku "Uzupełnij minimalne ilości" lub kontynuować z obecnymi ilościami.');
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
    
    // Pokazuj loader podczas zapisywania
    setSaving(true);
    
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
    }
  };
  
  const handleCancel = () => {
    navigate('/purchase-orders');
  };
  
  // Funkcja do znajdowania najlepszych cen dostawców
  const findBestSuppliers = async () => {
    if (!poData.items || poData.items.length === 0) {
      showInfo('Brak pozycji w zamówieniu');
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
        showInfo('Brak pozycji magazynowych do sprawdzenia');
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
          
          return {
            ...item,
            supplierPrice: bestPrice.price,
            supplierId: bestPrice.supplierId,
            supplierName: supplierName,
            unitPrice: bestPrice.price,
            totalPrice: bestPrice.price * item.quantity
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
        showInfo('Nie znaleziono domyślnych cen dostawców. Zastosowano najlepsze dostępne ceny.');
      } else {
        showInfo('Nie znaleziono żadnych cen dostawców dla wybranych produktów.');
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
      showInfo('Brak pozycji w zamówieniu');
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
        showInfo('Brak pozycji magazynowych do sprawdzenia');
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
          
          return {
            ...item,
            supplierPrice: bestPrice.price,
            supplierId: bestPrice.supplierId,
            supplierName: supplierName,
            unitPrice: bestPrice.price,
            totalPrice: bestPrice.price * item.quantity
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
        showInfo('Nie znaleziono domyślnych cen dostawców. Zastosowano najlepsze dostępne ceny.');
      } else {
        showInfo('Nie znaleziono żadnych cen dostawców dla wybranych produktów.');
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
      showInfo('Brak sugestii dostawców do zastosowania');
      return;
    }
    
    // Aktualizuj wszystkie pozycje z sugerowanymi cenami
    const updatedItems = poData.items.map(item => {
      if (item.inventoryItemId && supplierSuggestions[item.inventoryItemId]) {
        const suggestion = supplierSuggestions[item.inventoryItemId];
        
        return {
          ...item,
          unitPrice: suggestion.price,
          totalPrice: suggestion.price * item.quantity
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
      showInfo('Brak pozycji w zamówieniu');
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
          return {
            ...item,
            quantity: updatedQuantity,
            totalPrice: (item.unitPrice || 0) * updatedQuantity
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
        showInfo('Wszystkie pozycje już spełniają minimalne ilości zamówienia');
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
          value: 0,
          vatRate: 23, // Domyślna stawka VAT 23%
          currency: poData.currency, // Domyślna waluta zgodna z zamówieniem
          originalValue: 0, // Wartość w oryginalnej walucie
          exchangeRate: 1, // Kurs wymiany
          invoiceNumber: '', // Numer faktury
          invoiceDate: '', // Data faktury
        }
      ]
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
          
          return {
            ...item,
            exchangeRate: rate,
            unitPrice: convertedPrice.toFixed(6),
            totalPrice: (convertedPrice * item.quantity).toFixed(2)
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
    if (field === 'invoiceDate' && value) {
      try {
        console.log(`Zmiana daty faktury na: ${value}`);
        
        // Formatowanie daty do obsługi przez input type="date"
        const formattedDate = formatDateForInput(value);
        console.log(`Sformatowana data faktury: ${formattedDate}`);
        
        // Uaktualnij datę faktury niezależnie od waluty
        let updatedCosts = [...poData.additionalCostsItems];
        const costIndex = updatedCosts.findIndex(item => item.id === id);
        
        if (costIndex !== -1) {
          // Uaktualnij datę faktury
          updatedCosts[costIndex] = {
            ...updatedCosts[costIndex],
            invoiceDate: formattedDate
          };
          
          // Pobierz kurs tylko jeśli waluta pozycji jest inna niż waluta zamówienia
          if (currentCost.currency && currentCost.currency !== poData.currency) {
            try {
              // Pobierz datę poprzedniego dnia dla daty faktury
              const invoiceDate = new Date(formattedDate);
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
          }
          
          setPoData(prev => ({ ...prev, additionalCostsItems: updatedCosts }));
        }
        
        return;
      } catch (error) {
        console.error('Błąd podczas przetwarzania daty faktury:', error);
        showError('Nieprawidłowy format daty faktury');
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
              // Jeśli nie mamy daty faktury, poproś użytkownika o jej wprowadzenie
              showInfo(`Aby przeliczać wartości z waluty ${newCurrency} na ${poData.currency}, wprowadź datę faktury.`);
              
              // Ustaw kurs na 0 jeśli nie ma daty faktury
              updatedCosts[costIndex] = {
                ...updatedCosts[costIndex],
                exchangeRate: 0
              };
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
            
            // Pobierz kurs na podstawie daty faktury
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
              // Jeśli nie mamy daty faktury, poproś użytkownika o jej wprowadzenie
              showInfo(`Aby przeliczać wartości z waluty ${currentCost.currency} na ${poData.currency}, wprowadź datę faktury.`);
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
          value = 23; // Domyślna wartość VAT
        }
        
        // Dla wartości, jeśli waluta jest taka sama jak waluta zamówienia
        if (field === 'value' && item.currency === poData.currency) {
          const newValue = parseFloat(value) || 0;
            return { 
              ...item, 
              originalValue: newValue,
            value: newValue.toFixed(6)
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
    // Aktualizuj komunikaty, aby odzwierciedlały że kursy są pobierane z dnia poprzedzającego datę faktury
    const infoText = "Wartości w walutach obcych zostały przeliczone według kursów z dnia poprzedzającego datę faktury.";
    
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
          
          return {
            ...item,
            exchangeRate: rate,
            unitPrice: convertedPrice.toFixed(6),
            totalPrice: (convertedPrice * item.quantity).toFixed(2)
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
        
        // Użyj formatDateForInput do formatowania dat
        const formattedOrderDate = poDetails.orderDate ? formatDateForInput(poDetails.orderDate) : formatDateForInput(new Date());
        const formattedDeliveryDate = poDetails.expectedDeliveryDate ? formatDateForInput(poDetails.expectedDeliveryDate) : '';
        
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
            vatRate: 23 // Domyślna stawka VAT
          }];
        }
        
        // Upewnij się, że wszystkie pozycje mają ustawione pole vatRate
        const itemsWithVatRate = poDetails.items ? poDetails.items.map(item => ({
          ...item,
          vatRate: typeof item.vatRate === 'number' ? item.vatRate : 23 // Domyślna stawka VAT 23%
        })) : [];
        
        // Upewnij się, że wszystkie dodatkowe koszty mają ustawione pole vatRate
        const costsWithVatRate = additionalCostsItems.map(cost => ({
          ...cost,
          vatRate: typeof cost.vatRate === 'number' ? cost.vatRate : 23 // Domyślna stawka VAT 23%
        }));
        
        setPoData({
          ...poDetails,
          supplier: matchedSupplier,
          orderDate: formattedOrderDate,
          expectedDeliveryDate: formattedDeliveryDate,
          invoiceLink: poDetails.invoiceLink || '',
          items: itemsWithVatRate,
          additionalCostsItems: costsWithVatRate
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
            showInfo(`Znaleziono dostawcę ${supplier.name} z najlepszą ceną dla ${inventoryItem.name}.`);
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
    const updatedInvoiceLinks = (poData.invoiceLinks || []).filter(link => link.id !== id);
    
    // Aktualizacja starego pola invoiceLink
    let updatedInvoiceLink = poData.invoiceLink;
    if (updatedInvoiceLinks.length > 0 && poData.invoiceLinks.findIndex(link => link.id === id) === 0) {
      // Jeśli usunięto pierwszy link, zaktualizuj stare pole do nowego pierwszego linku
      updatedInvoiceLink = updatedInvoiceLinks[0].url;
    } else if (updatedInvoiceLinks.length === 0) {
      // Jeśli usunięto wszystkie linki, wyczyść stare pole
      updatedInvoiceLink = '';
    }
    
    setPoData(prev => ({
      ...prev,
      invoiceLinks: updatedInvoiceLinks,
      invoiceLink: updatedInvoiceLink
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
            
            // Aktualizuj pozycję z nowym kursem i przeliczoną wartością
            updatedItems[i] = {
              ...updatedItems[i],
              exchangeRate: rate,
              unitPrice: convertedPrice.toFixed(6),
              totalPrice: (convertedPrice * item.quantity).toFixed(2)
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
        showInfo('Nie znaleziono pozycji do przeliczenia');
      }
    } catch (error) {
      console.error('Błąd podczas przeliczania wszystkich wartości:', error);
      showError('Wystąpił błąd podczas przeliczania wartości');
    }
  };
  
  if (loading) {
    return (
      <Container>
        <Typography variant="h6">Ładowanie danych zamówienia...</Typography>
      </Container>
    );
  }
  
  return (
    <Container>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5">
          {currentOrderId && currentOrderId !== 'new' ? 'Edycja Zamówienia Zakupu' : 'Utwórz Zamówienie Zakupu'}
        </Typography>
      </Box>
      
      <Paper sx={{ p: 3 }}>
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
                    label="Dostawca"
                    required
                    fullWidth
                  />
                )}
              />
            </Grid>
            
            {/* Magazyn docelowy */}
            <Grid item xs={12} md={6}>
              <FormControl fullWidth required>
                <InputLabel>Magazyn docelowy</InputLabel>
                <Select
                  name="targetWarehouseId"
                  value={poData.targetWarehouseId}
                  onChange={handleChange}
                  label="Magazyn docelowy"
                >
                  <MenuItem value=""><em>Wybierz magazyn</em></MenuItem>
                  {warehouses.map((warehouse) => (
                    <MenuItem key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            
            {/* Waluta */}
            <Grid item xs={12} md={3} style={{display: 'none'}}>
              <FormControl fullWidth>
                <InputLabel>Waluta</InputLabel>
                <Select
                  name="currency"
                  value={poData.currency}
                  onChange={handleChange}
                  label="Waluta"
                >
                  <MenuItem value="EUR">EUR</MenuItem>
                  <MenuItem value="PLN">PLN</MenuItem>
                  <MenuItem value="USD">USD</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            
            {/* Data zamówienia */}
            <Grid item xs={12} md={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DatePicker
                  label="Data zamówienia"
                  value={poData.orderDate ? new Date(poData.orderDate) : null}
                  onChange={(date) => handleDateChange('orderDate', date)}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </LocalizationProvider>
            </Grid>
            
            {/* Planowana data dostawy */}
            <Grid item xs={12} md={6}>
              <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={pl}>
                <DatePicker
                  label="Planowana data dostawy"
                  value={poData.expectedDeliveryDate ? new Date(poData.expectedDeliveryDate) : null}
                  onChange={(date) => handleDateChange('expectedDeliveryDate', date)}
                  slotProps={{ textField: { fullWidth: true, required: true } }}
                />
              </LocalizationProvider>
            </Grid>
            
            {/* Adres dostawcy */}
            <Grid item xs={12}>
              <TextField
                name="deliveryAddress"
                label="Adres dostawcy"
                value={poData.deliveryAddress}
                onChange={handleChange}
                fullWidth
                multiline
                rows={3}
                helperText={poData.supplier && poData.supplier.addresses && poData.supplier.addresses.length > 0 
                  ? 'Możesz wybrać z adresów dostawcy:' 
                  : 'Wprowadź adres dostawcy'
                }
              />
              
              {/* Lista adresów dostawcy */}
              {poData.supplier && poData.supplier.addresses && poData.supplier.addresses.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" gutterBottom>
                    Wybierz adres dostawcy:
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
                              {address.name} {address.isMain && '(główny)'}
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
                label="Uwagi"
                value={poData.notes}
                onChange={handleChange}
                fullWidth
                multiline
                rows={4}
              />
            </Grid>
            
            {/* Faktury - wielu linków */}
            <Grid item xs={12}>
              <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle1">Faktury</Typography>
                <Button
                  startIcon={<AddIcon />}
                  onClick={handleAddInvoiceLink}
                  variant="outlined"
                  size="small"
                >
                  Dodaj fakturę
                </Button>
              </Box>
              
              {!poData.invoiceLinks || poData.invoiceLinks.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>
                  Brak faktur. Kliknij "Dodaj fakturę", aby dodać link do faktury.
                </Typography>
              ) : (
                <TableContainer component={Paper} sx={{ mb: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Opis</TableCell>
                        <TableCell>Link do faktury</TableCell>
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
                              placeholder="Opis faktury, np. Faktura główna, Faktura transportowa itp."
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              fullWidth
                              size="small"
                              value={invoice.url}
                              onChange={(e) => handleInvoiceLinkChange(invoice.id, 'url', e.target.value)}
                              placeholder="https://drive.google.com/file/d/..."
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
            
            {/* Dodatkowe koszty */}
            <Grid item xs={12}>
              <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="subtitle1">
                    Dodatkowe koszty
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Dla każdego kosztu można ustawić indywidualną stawkę VAT
                  </Typography>
                </Box>
                <Button
                  startIcon={<AddIcon />}
                  onClick={handleAddAdditionalCost}
                  variant="outlined"
                  size="small"
                >
                  Dodaj koszt
                </Button>
              </Box>
              
              {poData.additionalCostsItems.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>
                  Brak dodatkowych kosztów. Kliknij "Dodaj koszt", aby dodać opłaty jak cła, transport, ubezpieczenie itp.
                </Typography>
              ) : (
                <TableContainer component={Paper} sx={{ mb: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Opis</TableCell>
                        <TableCell align="right">Kwota</TableCell>
                        <TableCell align="right">Waluta</TableCell>
                        <TableCell align="right">VAT</TableCell>
                        <TableCell align="right">Kwota oryg.</TableCell>
                        <TableCell align="right">Kwota po przew.</TableCell>
                        <TableCell>Nr faktury</TableCell>
                        <TableCell>Data faktury</TableCell>
                        <TableCell>Kurs</TableCell>
                        <TableCell width="50px"></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {poData.additionalCostsItems.map((cost) => (
                        <TableRow key={cost.id}>
                          <TableCell>
                            <TextField
                              fullWidth
                              size="small"
                              value={cost.description}
                              onChange={(e) => handleAdditionalCostChange(cost.id, 'description', e.target.value)}
                              placeholder="Np. cła, transport, ubezpieczenie"
                            />
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              type="number"
                              size="small"
                              value={cost.currency === poData.currency ? cost.value : (cost.originalValue || 0)}
                              onChange={(e) => handleAdditionalCostChange(cost.id, 'value', e.target.value)}
                              inputProps={{ min: 0, step: 'any' }}
                              sx={{ width: 120 }}
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
                                value={cost.vatRate !== undefined ? cost.vatRate : 23}
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
                          <TableCell align="right">
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
                          </TableCell>
                          <TableCell align="right">
                            {cost.currency !== poData.currency ? (
                              <Tooltip title={`Po przewalutowaniu na ${poData.currency}`}>
                                <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                                  {formatCurrency(cost.value || 0, poData.currency)}
                                </Typography>
                              </Tooltip>
                            ) : (
                              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                                -
                              </Typography>
                            )}
                          </TableCell>
                          <TableCell>
                            <TextField
                              fullWidth
                              size="small"
                              value={cost.invoiceNumber || ''}
                              onChange={(e) => handleAdditionalCostChange(cost.id, 'invoiceNumber', e.target.value)}
                              placeholder="Nr faktury"
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              type="date"
                              size="small"
                              value={cost.invoiceDate || ''}
                              onChange={(e) => handleAdditionalCostChange(cost.id, 'invoiceDate', e.target.value)}
                              InputLabelProps={{ shrink: true }}
                              sx={{ width: 150 }}
                              placeholder="Wybierz datę"
                              inputProps={{ 
                                max: formatDateForInput(new Date()), // Maksymalna data to dzisiaj
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <TextField
                              type="number"
                              size="small"
                              value={cost.exchangeRate || 0}
                              onChange={(e) => handleAdditionalCostChange(cost.id, 'exchangeRate', e.target.value)}
                              placeholder="Kurs"
                              inputProps={{ min: 0, step: 'any' }}
                              sx={{ width: 100 }}
                              disabled={cost.currency === poData.currency}
                            />
                          </TableCell>
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={() => handleRemoveAdditionalCost(cost.id)}
                              color="error"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                          Suma:
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                          {poData.additionalCostsItems.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0).toFixed(2)} {poData.currency}
                        </TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
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
                                {vatValue.toFixed(6)} {poData.currency}
                              </TableCell>
                              <TableCell />
                              <TableCell />
                              <TableCell />
                              <TableCell />
                              <TableCell />
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
                            return parseFloat(netTotal + vatTotal).toFixed(6);
                          })()} {poData.currency}
                        </TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
                      </TableRow>
                      {/* Informacja o kursach walut */}
                      {poData.additionalCostsItems.some(cost => cost.currency !== poData.currency) && (
                        <TableRow>
                          <TableCell colSpan={10} sx={{ py: 1 }}>
                            <Typography variant="caption" sx={{ fontStyle: 'italic' }} className="exchange-rate-info">
                              Wartości w walutach obcych zostały przeliczone według kursów z dnia poprzedzającego datę faktury.
                            </Typography>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Grid>
          </Grid>
          
          <Divider sx={{ my: 3 }} />
          
          {/* Pozycje zamówienia */}
          <Box sx={{ mb: 2 }}>
            <Typography variant="h6">Pozycje zamówienia</Typography>
            <Typography variant="body2" color="text.secondary">
              Dla każdej pozycji można ustawić indywidualną stawkę VAT
            </Typography>
          </Box>
          
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Produkt</TableCell>
                  <TableCell>Ilość</TableCell>
                  <TableCell>Jedn.</TableCell>
                  <TableCell>Cena jedn.</TableCell>
                  <TableCell>Waluta</TableCell>
                  <TableCell>VAT</TableCell>
                  <TableCell>Kwota oryg.</TableCell>
                  <TableCell>Kwota po przew.</TableCell>
                  <TableCell>Nr faktury</TableCell>
                  <TableCell>Data faktury</TableCell>
                  <TableCell>Plan. data dost.</TableCell>
                  <TableCell>Rzecz. data dost.</TableCell>
                  <TableCell>Kurs</TableCell>
                  {Object.keys(supplierSuggestions).length > 0 && (
                    <TableCell>Sugestia</TableCell>
                  )}
                  <TableCell></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {poData.items.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Autocomplete
                        options={inventoryItems}
                        getOptionLabel={(option) => option.name}
                        value={inventoryItems.find(i => i.id === item.inventoryItemId) || null}
                        onChange={(event, newValue) => handleItemSelect(index, newValue)}
                        renderInput={(params) => (
                          <TextField
                            {...params}
                            label="Produkt"
                            required
                            size="small"
                          />
                        )}
                        sx={{ width: 250 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        value={item.quantity}
                        onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                        size="small"
                        inputProps={{ min: 0, step: 'any' }}
                        sx={{ width: 100 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={item.unit}
                        onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                        size="small"
                        sx={{ width: 80 }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        {supplierSuggestions[item.inventoryItemId]?.isDefault && (
                          <Tooltip title="Domyślna cena dostawcy">
                            <StarIcon color="primary" sx={{ mr: 1 }} />
                          </Tooltip>
                        )}
                        <TextField
                          type="number"
                          value={item.currency === poData.currency ? item.unitPrice : (item.originalUnitPrice || 0)}
                          onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                          size="small"
                          inputProps={{ min: 0, step: 'any' }}
                          sx={{ width: 100 }}
                        />
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <FormControl size="small" sx={{ width: 100 }}>
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
                      <FormControl size="small" sx={{ width: 100 }}>
                        <Select
                          value={item.vatRate !== undefined ? item.vatRate : 23}
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
                      {item.currency !== poData.currency ? (
                        <Tooltip title={`Oryginalnie w ${item.currency}`}>
                          <Typography variant="body2">
                            {formatCurrency((item.originalUnitPrice || 0) * item.quantity, item.currency)}
                          </Typography>
                        </Tooltip>
                      ) : (
                        item.currency === 'EUR' && poData.currency === 'EUR' ? (
                          <Typography variant="body2">
                            {formatCurrency(item.totalPrice || 0, item.currency)}
                          </Typography>
                        ) : (
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            -
                          </Typography>
                        )
                      )}
                    </TableCell>
                    <TableCell>
                      {item.currency !== poData.currency ? (
                        <Tooltip title={`Po przewalutowaniu na ${poData.currency}`}>
                          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                            {formatCurrency(item.totalPrice || 0, poData.currency)}
                          </Typography>
                        </Tooltip>
                      ) : (
                        item.currency === 'EUR' && poData.currency === 'EUR' ? (
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            -
                          </Typography>
                        ) : (
                          <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                            {formatCurrency(item.totalPrice || 0, poData.currency)}
                          </Typography>
                        )
                      )}
                    </TableCell>
                    <TableCell>
                      <TextField
                        fullWidth
                        size="small"
                        value={item.invoiceNumber || ''}
                        onChange={(e) => handleItemChange(index, 'invoiceNumber', e.target.value)}
                        placeholder="Nr faktury"
                        sx={{ width: 120 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="date"
                        size="small"
                        value={item.invoiceDate || ''}
                        onChange={(e) => handleItemChange(index, 'invoiceDate', e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{ width: 150 }}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="date"
                        size="small"
                        value={item.plannedDeliveryDate || ''}
                        onChange={(e) => handleItemChange(index, 'plannedDeliveryDate', e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{ width: 150 }}
                        placeholder="Planowana dostawa"
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="date"
                        size="small"
                        value={item.actualDeliveryDate || ''}
                        onChange={(e) => handleItemChange(index, 'actualDeliveryDate', e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{ width: 150 }}
                        placeholder="Rzeczywista dostawa"
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        size="small"
                        value={item.exchangeRate || 0}
                        onChange={(e) => handleItemChange(index, 'exchangeRate', e.target.value)}
                        placeholder="Kurs"
                        inputProps={{ min: 0, step: 'any' }}
                        sx={{ width: 100 }}
                        disabled={item.currency === poData.currency}
                      />
                    </TableCell>
                    {Object.keys(supplierSuggestions).length > 0 && (
                      <TableCell>
                        {item.inventoryItemId && supplierSuggestions[item.inventoryItemId] && (
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <Typography variant="body2">
                              {formatCurrency(supplierSuggestions[item.inventoryItemId].price)} 
                            </Typography>
                            {item.supplierName && (
                              <Tooltip title={`Dostawca: ${item.supplierName}`}>
                                <InfoIcon fontSize="small" sx={{ ml: 1, color: 'info.main' }} />
                              </Tooltip>
                            )}
                          </Box>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => handleRemoveItem(index)}
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
          
          {/* Informacja o kursach walut */}
          {poData.items.some(item => item.currency !== poData.currency) && (
            <Box sx={{ mt: 2, mb: 1 }}>
              <Typography variant="caption" sx={{ fontStyle: 'italic' }} className="exchange-rate-info">
                Wartości w walutach obcych zostały przeliczone według kursów z dnia poprzedzającego datę faktury.
              </Typography>
            </Box>
          )}
          
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 2, mb: 2 }}>
            <Box>
            <Button
              variant="outlined"
                startIcon={<FindInPageIcon />}
                onClick={findBestSuppliers}
                disabled={loading || loadingSupplierSuggestions || poData.items.length === 0}
                sx={{ mr: 1 }}
            >
                Znajdź najlepsze ceny
            </Button>
            
            <Button
              variant="outlined"
                startIcon={<CheckCircleOutlineIcon />}
                onClick={useDefaultSupplierPrices}
                disabled={loading || loadingSupplierSuggestions || poData.items.length === 0}
                sx={{ mr: 1 }}
            >
                Użyj domyślnych cen
            </Button>
            
            <Button
              variant="outlined"
                startIcon={<SuggestIcon />}
                onClick={fillMinimumOrderQuantities}
                disabled={loading || loadingSupplierSuggestions || poData.items.length === 0}
                sx={{ mr: 1 }}
            >
                Uzupełnij minimalne ilości
            </Button>

            <Button
              variant="outlined"
                color="secondary"
                onClick={recalculateAllCurrencyValues}
                disabled={loading}
                sx={{ mr: 1 }}
            >
                Przelicz kursy
            </Button>
            
            {Object.keys(supplierSuggestions).length > 0 && (
              <Button
                  variant="contained"
                  color="secondary"
                  startIcon={<CheckIcon />}
                onClick={applyBestSupplierPrices}
                  disabled={loading || loadingSupplierSuggestions}
              >
                  Zastosuj ceny
              </Button>
            )}
            </Box>
            
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={handleAddItem}
            >
              Dodaj pozycję
            </Button>
          </Box>
          
          {loadingSupplierSuggestions && (
            <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <CircularProgress size={20} />
              <Typography variant="body2">Szukanie najlepszych cen dostawców...</Typography>
            </Box>
          )}
          
          {Object.keys(supplierSuggestions).length > 0 && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Znaleziono sugestie cen dostawców dla {Object.keys(supplierSuggestions).length} pozycji.
              Kliknij "Zastosuj najlepsze ceny", aby zaktualizować zamówienie.
            </Alert>
          )}
          
          <Box sx={{ my: 3 }}>
            <Divider />
          </Box>
          
          <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
            <Grid container spacing={2} justifyContent="flex-end">
              <Grid item xs={12} md={4}>
                <Typography variant="subtitle1" gutterBottom>
                  Wartość produktów netto: <strong>{parseFloat(poData.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0)).toFixed(2)} {poData.currency}</strong>
                </Typography>
                
                {/* Sekcja VAT dla produktów */}
                {poData.items.length > 0 && (
                  <>
                    <Typography variant="subtitle2" gutterBottom>
                      VAT od produktów:
                    </Typography>
                    {/* Grupowanie pozycji według stawki VAT */}
                    {Array.from(new Set(poData.items.map(item => item.vatRate))).sort((a, b) => a - b).map(vatRate => {
                      if (vatRate === undefined) return null;
                      
                      const itemsWithSameVat = poData.items.filter(item => item.vatRate === vatRate);
                      const sumNet = itemsWithSameVat.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
                      const vatValue = typeof vatRate === 'number' ? (sumNet * vatRate) / 100 : 0;
                      
                      return (
                        <Typography key={vatRate} variant="body2" gutterBottom sx={{ pl: 2 }}>
                          Stawka {vatRate}%: <strong>{parseFloat(vatValue).toFixed(2)} {poData.currency}</strong> (od {parseFloat(sumNet).toFixed(2)} {poData.currency})
                        </Typography>
                      );
                    })}
                  </>
                )}
                
                {/* Sekcja VAT dla dodatkowych kosztów */}
                {poData.additionalCostsItems.length > 0 && (
                  <>
                    <Typography variant="subtitle1" gutterBottom>
                      Suma dodatkowych kosztów: <strong>{parseFloat(poData.additionalCostsNetTotal || 0).toFixed(2)} {poData.currency}</strong>
                    </Typography>
                    
                    <Typography variant="subtitle2" gutterBottom>
                      VAT od dodatkowych kosztów: <strong>{parseFloat(poData.additionalCostsVatTotal || 0).toFixed(2)} {poData.currency}</strong>
                    </Typography>
                    {/* Grupowanie kosztów według stawki VAT */}
                    {Array.from(new Set(poData.additionalCostsItems.map(cost => cost.vatRate))).sort((a, b) => a - b).map(vatRate => {
                      if (vatRate === undefined) return null;
                      
                      const costsWithSameVat = poData.additionalCostsItems.filter(cost => cost.vatRate === vatRate);
                      const sumNet = costsWithSameVat.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
                      const vatValue = typeof vatRate === 'number' ? (sumNet * vatRate) / 100 : 0;
                      
                      return (
                        <Typography key={vatRate} variant="body2" gutterBottom sx={{ pl: 2 }}>
                          Stawka {vatRate}%: <strong>{parseFloat(vatValue).toFixed(2)} {poData.currency}</strong> (od {parseFloat(sumNet).toFixed(2)} {poData.currency})
                        </Typography>
                      );
                    })}
                    
                    {/* Informacja o kursach walut przy dodatkowych kosztach */}
                    {poData.additionalCostsItems.some(cost => cost.currency !== poData.currency) && (
                      <Typography variant="caption" sx={{ pl: 2, fontStyle: 'italic', display: 'block', mt: 1 }} className="exchange-rate-info">
                        Kwoty w innych walutach zostały przeliczone według kursów z dnia poprzedzającego datę faktury.
                      </Typography>
                    )}
                  </>
                )}
                
                <Typography variant="subtitle1" gutterBottom>
                  Wartość netto razem: <strong>{parseFloat(poData.totalValue || 0).toFixed(2)} {poData.currency}</strong>
                </Typography>
                
                    <Typography variant="subtitle1" gutterBottom>
                  Suma podatku VAT: <strong>{parseFloat(poData.totalVat || 0).toFixed(2)} {poData.currency}</strong>
                    </Typography>
                
                <Typography variant="h6" color="primary" gutterBottom>
                  Wartość brutto: <strong>{parseFloat(poData.totalGross || 0).toFixed(2)} {poData.currency}</strong>
                </Typography>
              </Grid>
            </Grid>
          </Box>
          
          <Box sx={{ mb: 3 }}>
            <Button
              variant="outlined"
              onClick={handleCancel}
              disabled={saving}
            >
              Anuluj
            </Button>
            <Button
              type="submit"
              variant="contained"
              color="primary"
              disabled={saving}
            >
              {saving ? 'Zapisywanie...' : 'Zapisz'}
            </Button>
          </Box>
        </form>
      </Paper>
    </Container>
  );
};

export default PurchaseOrderForm; 