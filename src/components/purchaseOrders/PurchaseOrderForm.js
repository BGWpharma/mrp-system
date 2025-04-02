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
  InputAdornment
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  FindReplace as SuggestIcon,
  InfoOutlined as InfoIcon
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
  getBestSupplierPricesForItems 
} from '../../services/supplierService';

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
  
  const [poData, setPoData] = useState({
    number: '',
    supplier: null,
    items: [],
    totalValue: 0,
    totalGross: 0,
    additionalCostsItems: [], // Tablica obiektów z dodatkowymi kosztami
    currency: 'EUR',
    vatRate: 23, // Domyślna stawka VAT 23%
    targetWarehouseId: '', // Nowe pole dla magazynu docelowego
    orderDate: formatDateForInput(new Date()),
    expectedDeliveryDate: '',
    deliveryAddress: '',
    notes: '',
    status: PURCHASE_ORDER_STATUSES.DRAFT,
    invoiceLink: '',
  });
  
  useEffect(() => {
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
              description: poDetails.additionalCostsDescription || 'Dodatkowe koszty'
            }];
          }
          
          setPoData({
            ...poDetails,
            supplier: matchedSupplier,
            orderDate: formattedOrderDate,
            expectedDeliveryDate: formattedDeliveryDate,
            vatRate: poDetails.vatRate || 23,
            targetWarehouseId: poDetails.targetWarehouseId || '',
            invoiceLink: poDetails.invoiceLink || '',
            additionalCostsItems: additionalCostsItems
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
    
    fetchData();
  }, [currentOrderId, showError, location.state]);
  
  // Funkcja do obliczania sumy
  const calculateTotals = (items, additionalCosts = []) => {
    const itemsTotal = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    const additionalCostsTotal = additionalCosts.reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
    const totalNet = itemsTotal + additionalCostsTotal;
    
    // VAT naliczany tylko od wartości produktów, bez dodatkowych kosztów
    const vatValue = (itemsTotal * (poData.vatRate || 0)) / 100;
    // Wartość brutto to suma: wartość netto produktów + VAT + dodatkowe koszty
    const totalGross = itemsTotal + vatValue + additionalCostsTotal;
    
    return {
      itemsTotal,
      additionalCostsTotal,
      totalNet,
      totalGross,
    };
  };

  // Aktualizacja totali przy zmianie elementów
  useEffect(() => {
    const totals = calculateTotals(poData.items, poData.additionalCostsItems);
    setPoData(prev => ({
      ...prev,
      totalValue: totals.totalNet,
      totalGross: totals.totalGross
    }));
  }, [poData.items, poData.additionalCostsItems, poData.vatRate]);
  
  const handleChange = (e) => {
    const { name, value } = e.target;
    setPoData(prev => ({ ...prev, [name]: value }));
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
        totalPrice: 0
      }]
    }));
  };
  
  const handleRemoveItem = (index) => {
    const updatedItems = [...poData.items];
    updatedItems.splice(index, 1);
    setPoData(prev => ({ ...prev, items: updatedItems }));
  };
  
  const handleItemChange = (index, field, value) => {
    const updatedItems = [...poData.items];
    updatedItems[index][field] = value;
    
    // Przelicz totalPrice jeśli zmieniono quantity lub unitPrice
    if (field === 'quantity' || field === 'unitPrice') {
      const quantity = field === 'quantity' ? value : updatedItems[index].quantity;
      const unitPrice = field === 'unitPrice' ? value : updatedItems[index].unitPrice;
      updatedItems[index].totalPrice = quantity * unitPrice;
    }
    
    setPoData(prev => ({ ...prev, items: updatedItems }));
  };
  
  const handleItemSelect = (index, selectedItem) => {
    if (!selectedItem) return;
    
    const updatedItems = [...poData.items];
    updatedItems[index] = {
      ...updatedItems[index],
      id: selectedItem.id,
      inventoryItemId: selectedItem.id,
      name: selectedItem.name,
      unit: selectedItem.unit || 'szt',
      // Zachowujemy istniejące wartości jeśli są, lub ustawiamy domyślne
      quantity: updatedItems[index].quantity || 1,
      unitPrice: updatedItems[index].unitPrice || 0,
      totalPrice: (updatedItems[index].quantity || 1) * (updatedItems[index].unitPrice || 0)
    };
    
    setPoData(prev => ({ ...prev, items: updatedItems }));
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isFormValid()) {
      showError('Formularz zawiera błędy. Sprawdź wprowadzone dane.');
      return;
    }
    
    try {
      setSaving(true);
      
      // Przygotuj dane zamówienia
      const orderData = {
        ...poData,
        totalValue: poData.totalValue,
        totalGross: poData.totalGross,
        updatedBy: currentUser.uid
      };
      
      let result;
      
      // Rozróżnienie między tworzeniem nowego zamówienia a aktualizacją istniejącego
      if (currentOrderId && currentOrderId !== 'new') {
        // Aktualizacja istniejącego zamówienia
        result = await updatePurchaseOrder(currentOrderId, orderData);
        showSuccess('Zamówienie zakupu zostało zaktualizowane');
      } else {
        // Tworzenie nowego zamówienia
        result = await createPurchaseOrder(orderData, currentUser.uid);
        showSuccess('Zamówienie zakupu zostało utworzone');
      }
      
      // Przekieruj do listy zamówień
      navigate('/purchase-orders');
    } catch (error) {
      console.error('Błąd podczas zapisywania zamówienia zakupu:', error);
      showError('Wystąpił błąd: ' + error.message);
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
      
      // Znajdź najlepsze ceny dostawców
      const bestPrices = await getBestSupplierPricesForItems(itemsToCheck);
      setSupplierSuggestions(bestPrices);
      
      let hasRecommendations = false;
      
      // Aktualizuj pozycje zamówienia z najlepszymi cenami
      const updatedItems = poData.items.map(item => {
        if (item.inventoryItemId && bestPrices[item.inventoryItemId]) {
          const bestPrice = bestPrices[item.inventoryItemId];
          
          // Znajdź nazwę dostawcy
          const supplier = suppliers.find(s => s.id === bestPrice.supplierId);
          const supplierName = supplier ? supplier.name : 'Nieznany dostawca';
          
          // Jeśli najlepsza cena jest lepsza niż aktualna, zaznacz że mamy rekomendację
          if (!item.supplierPrice || bestPrice.price < item.unitPrice) {
            hasRecommendations = true;
          }
          
          return {
            ...item,
            supplierPrice: bestPrice.price,
            supplierId: bestPrice.supplierId,
            supplierName: supplierName
          };
        }
        return item;
      });
      
      // Aktualizuj poData z zaktualizowanymi pozycjami
      setPoData(prev => ({
        ...prev,
        items: updatedItems
      }));
      
      if (hasRecommendations) {
        showSuccess('Znaleziono najlepsze ceny dostawców dla pozycji zamówienia');
      } else {
        showInfo('Nie znaleziono lepszych cen niż aktualne');
      }
    } catch (error) {
      console.error('Błąd podczas szukania najlepszych cen dostawców:', error);
      showError('Błąd podczas szukania najlepszych cen dostawców');
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
    
    // Aktualizuj pozycje zamówienia
    const updatedItems = poData.items.map(item => {
      if (item.inventoryItemId && supplierSuggestions[item.inventoryItemId]) {
        const bestPrice = supplierSuggestions[item.inventoryItemId];
        return {
          ...item,
          unitPrice: bestPrice.price,
          totalPrice: bestPrice.price * item.quantity
        };
      }
      return item;
    });
    
    // Aktualizuj poData
    setPoData(prev => ({
      ...prev,
      items: updatedItems
    }));
    
    // Znajdź dostawcę z największą liczbą pozycji
    const supplierCounts = {};
    for (const itemId in supplierSuggestions) {
      const supplierId = supplierSuggestions[itemId].supplierId;
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
    
    showSuccess('Zastosowano najlepsze ceny dostawców');
  };
  
  // Dodaję funkcję isFormValid do sprawdzania poprawności formularza
  const isFormValid = () => {
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
    const invalidItem = poData.items.find(item => !item.name || !item.quantity || !item.unitPrice);
    if (invalidItem) {
      showError('Uzupełnij wszystkie dane dla każdego przedmiotu');
      return false;
    }
    
    return true;
  };
  
  // Dodaję funkcję obsługi zmiany dodatkowych kosztów
  const handleAdditionalCostsChange = (e) => {
    const { name, value } = e.target;
    const numericValue = name === 'additionalCostsItems' ? parseFloat(value) || 0 : value;
    setPoData(prev => ({ ...prev, [name]: numericValue }));
  };
  
  // Dodaję funkcję do dodawania nowej pozycji kosztów dodatkowych
  const handleAddAdditionalCost = () => {
    setPoData(prev => ({
      ...prev,
      additionalCostsItems: [
        ...prev.additionalCostsItems,
        {
          id: `cost-${Date.now()}`,
          value: 0,
          description: ''
        }
      ]
    }));
  };
  
  // Funkcja obsługi zmiany dodatkowych kosztów
  const handleAdditionalCostChange = (id, field, value) => {
    const updatedCosts = poData.additionalCostsItems.map(item => {
      if (item.id === id) {
        return { ...item, [field]: field === 'value' ? parseFloat(value) || 0 : value };
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
            <Grid item xs={12} md={3}>
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
            
            {/* Stawka VAT */}
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Stawka VAT</InputLabel>
                <Select
                  name="vatRate"
                  value={poData.vatRate}
                  onChange={handleChange}
                  label="Stawka VAT"
                >
                  <MenuItem value={0}>0%</MenuItem>
                  <MenuItem value={5}>5%</MenuItem>
                  <MenuItem value={8}>8%</MenuItem>
                  <MenuItem value={23}>23%</MenuItem>
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
            
            {/* Link do faktury */}
            <Grid item xs={12}>
              <TextField
                label="Link do faktury (Google Drive)"
                fullWidth
                value={poData.invoiceLink || ''}
                onChange={(e) => handleChange('invoiceLink', e.target.value)}
                placeholder="https://drive.google.com/file/d/..."
                helperText="Wprowadź link do faktury z Google Drive"
              />
            </Grid>
            
            {/* Dodatkowe koszty */}
            <Grid item xs={12}>
              <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="subtitle1">
                  Dodatkowe koszty
                </Typography>
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
                              value={cost.value}
                              onChange={(e) => handleAdditionalCostChange(cost.id, 'value', e.target.value)}
                              InputProps={{ 
                                inputProps: { min: 0, step: 0.01 },
                                endAdornment: <InputAdornment position="end">{poData.currency}</InputAdornment>
                              }}
                              sx={{ width: 150 }}
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
                      </TableRow>
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
          </Box>
          
          <TableContainer component={Paper}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Produkt</TableCell>
                  <TableCell>Ilość</TableCell>
                  <TableCell>Jedn.</TableCell>
                  <TableCell>Cena jedn.</TableCell>
                  <TableCell>Wartość</TableCell>
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
                        inputProps={{ min: 0, step: 0.01 }}
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
                    <TableCell>
                      <TextField
                        type="number"
                        value={item.unitPrice}
                        onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                        size="small"
                        inputProps={{ min: 0, step: 0.01 }}
                        sx={{ width: 100 }}
                      />
                    </TableCell>
                    <TableCell>{formatCurrency(item.totalPrice || 0)}</TableCell>
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
          
          <Box sx={{ mt: 2, display: 'flex', gap: 2 }}>
            <Button
              startIcon={<AddIcon />}
              onClick={handleAddItem}
              variant="outlined"
            >
              Dodaj pozycję
            </Button>
            
            <Button
              startIcon={<SuggestIcon />}
              onClick={findBestSuppliers}
              disabled={loadingSupplierSuggestions || poData.items.length === 0}
              variant="outlined"
              color="info"
            >
              {loadingSupplierSuggestions ? 'Szukanie...' : 'Znajdź najlepsze ceny'}
            </Button>
            
            {Object.keys(supplierSuggestions).length > 0 && (
              <Button
                onClick={applyBestSupplierPrices}
                variant="outlined"
                color="success"
              >
                Zastosuj najlepsze ceny
              </Button>
            )}
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
                  Wartość produktów netto: <strong>{poData.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0).toFixed(2)} {poData.currency}</strong>
                </Typography>
                {poData.additionalCostsItems.length > 0 && (
                  <>
                    {poData.additionalCostsItems.map((cost, index) => (
                      <Typography key={cost.id} variant="subtitle2" gutterBottom>
                        {cost.description || `Dodatkowy koszt ${index+1}`}: <strong>{parseFloat(cost.value).toFixed(2)} {poData.currency}</strong>
                      </Typography>
                    ))}
                    <Typography variant="subtitle1" gutterBottom>
                      Suma dodatkowych kosztów: <strong>{poData.additionalCostsItems.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0).toFixed(2)} {poData.currency}</strong>
                    </Typography>
                  </>
                )}
                <Typography variant="subtitle1" gutterBottom>
                  Wartość netto razem: <strong>{poData.totalValue.toFixed(2)} {poData.currency}</strong>
                </Typography>
                <Typography variant="subtitle1" gutterBottom>
                  Stawka VAT: <strong>{poData.vatRate}%</strong>
                </Typography>
                <Typography variant="subtitle1" gutterBottom>
                  Wartość podatku VAT (tylko od produktów): <strong>
                    {((poData.items.reduce((sum, item) => sum + (item.totalPrice || 0), 0) * poData.vatRate) / 100).toFixed(2)} {poData.currency}
                  </strong>
                </Typography>
                <Typography variant="h6" color="primary" gutterBottom>
                  Wartość brutto: <strong>{poData.totalGross.toFixed(2)} {poData.currency}</strong>
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