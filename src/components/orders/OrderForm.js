import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  FormHelperText,
  CircularProgress,
  Tooltip,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Autocomplete,
  FormControlLabel,
  Switch,
  Chip,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
  Checkbox
} from '@mui/material';
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  AttachMoney as AttachMoneyIcon,
  LocalShipping as LocalShippingIcon,
  EventNote as EventNoteIcon,
  Calculate as CalculateIcon,
  Upload as UploadIcon,
  DownloadRounded as DownloadIcon,
  Person as PersonIcon,
  CloudUpload as CloudUploadIcon,
  ShoppingCart as ShoppingCartIcon,
  Refresh as RefreshIcon,
  PlaylistAdd as PlaylistAddIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl } from 'date-fns/locale';
import { 
  createOrder, 
  updateOrder, 
  getOrderById, 
  ORDER_STATUSES, 
  PAYMENT_METHODS,
  DEFAULT_ORDER,
  uploadDeliveryProof,
  deleteDeliveryProof
} from '../../services/orderService';
import { getAllInventoryItems, getIngredientPrices } from '../../services/inventoryService';
import { getAllCustomers, createCustomer } from '../../services/customerService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatCurrency } from '../../utils/formatUtils';
import { formatDateForInput } from '../../utils/dateUtils';
import { getAllRecipes, getRecipeById } from '../../services/recipeService';
import { storage } from '../../services/firebase/config';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { calculateProductionCost } from '../../utils/costCalculator';
import { createPurchaseOrder, getPurchaseOrderById, getAllPurchaseOrders } from '../../services/purchaseOrderService';
import { getBestSupplierPricesForItems, getAllSuppliers } from '../../services/supplierService';
import { getPriceForCustomerProduct } from '../../services/priceListService';
import { 
  getInventoryItemByName as findProductByName, 
  getInventoryItemById as getProductById 
} from '../../services/inventoryService';
import { 
  getRecipeById as getRecipeByProductId 
} from '../../services/recipeService';
import { 
  getAllInventoryItems as getAllProducts 
} from '../../services/inventoryService';

const DEFAULT_ITEM = {
  id: '',
  name: '',
  quantity: 1,
  unit: 'szt.',
  price: 0,
  margin: 0,
  basePrice: 0,
  fromPriceList: false,
  isRecipe: false,
  itemType: 'product'
};

const OrderForm = ({ orderId }) => {
  const [loading, setLoading] = useState(!!orderId);
  const [saving, setSaving] = useState(false);
  const [orderData, setOrderData] = useState({...DEFAULT_ORDER});
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [isGeneratingPO, setIsGeneratingPO] = useState(false);
  const [isPODialogOpen, setIsPODialogOpen] = useState(false);
  const [isAssignPODialogOpen, setIsAssignPODialogOpen] = useState(false);
  const [materialsForPO, setMaterialsForPO] = useState([]);
  const [linkedPurchaseOrders, setLinkedPurchaseOrders] = useState([]);
  const [availablePurchaseOrders, setAvailablePurchaseOrders] = useState([]);
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState('');
  const [loadingPurchaseOrders, setLoadingPurchaseOrders] = useState(false);

  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  const navigate = useNavigate();
  const fileInputRef = React.useRef(null);

  const [costCalculation, setCostCalculation] = useState(null);
  const [calculatingCosts, setCalculatingCosts] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        if (orderId) {
          const fetchedOrder = await getOrderById(orderId);
          
          const orderDate = fetchedOrder.orderDate?.toDate ? fetchedOrder.orderDate.toDate() : new Date(fetchedOrder.orderDate);
          const expectedDeliveryDate = fetchedOrder.expectedDeliveryDate?.toDate ? 
            fetchedOrder.expectedDeliveryDate.toDate() : 
            fetchedOrder.expectedDeliveryDate ? new Date(fetchedOrder.expectedDeliveryDate) : null;
          const deliveryDate = fetchedOrder.deliveryDate?.toDate ? 
            fetchedOrder.deliveryDate.toDate() : 
            fetchedOrder.deliveryDate ? new Date(fetchedOrder.deliveryDate) : null;
            
          if (!fetchedOrder.items || fetchedOrder.items.length === 0) {
            fetchedOrder.items = [{ ...DEFAULT_ORDER.items[0] }];
          }
          
          // Filtruj powiązane zamówienia zakupu, aby usunąć nieistniejące/usunięte
          let validLinkedPOs = [];
          if (fetchedOrder.linkedPurchaseOrders && fetchedOrder.linkedPurchaseOrders.length > 0) {
            // Sprawdź, które zamówienia zakupu nadal istnieją
            validLinkedPOs = [];
            for (const po of fetchedOrder.linkedPurchaseOrders) {
              try {
                // Spróbuj pobrać zamówienie zakupu aby sprawdzić czy istnieje
                const { doc, getDoc } = await import('firebase/firestore');
                const { db } = await import('../../services/firebase/config');
                const poDoc = await getDoc(doc(db, 'purchaseOrders', po.id));
                
                if (poDoc.exists()) {
                  validLinkedPOs.push(po);
                } else {
                  console.log(`Zamówienie zakupu o ID ${po.id} zostało usunięte i nie będzie wyświetlane`);
                }
              } catch (err) {
                console.error(`Błąd podczas sprawdzania istnienia zamówienia zakupu ${po.id}:`, err);
              }
            }
          }
          
          setOrderData({
            ...fetchedOrder,
            orderDate: formatDateForInput(orderDate),
            expectedDeliveryDate: expectedDeliveryDate ? formatDateForInput(expectedDeliveryDate) : '',
            deliveryDate: deliveryDate ? formatDateForInput(deliveryDate) : '',
            linkedPurchaseOrders: validLinkedPOs
          });
          
          setLinkedPurchaseOrders(validLinkedPOs);
        }
        
        const fetchedCustomers = await getAllCustomers();
        setCustomers(fetchedCustomers);
        
        const fetchedProducts = await getAllInventoryItems();
        setProducts(fetchedProducts);
        
        const fetchedRecipes = await getAllRecipes();
        setRecipes(fetchedRecipes);
        
        const fetchedSuppliers = await getAllSuppliers();
        setSuppliers(fetchedSuppliers);
        
      } catch (error) {
        showError('Błąd podczas ładowania danych: ' + error.message);
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [orderId, showError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      showError('Formularz zawiera błędy. Sprawdź wprowadzone dane.');
      return;
    }
    
    setSaving(true);
    
    try {
      if (orderId) {
        await updateOrder(orderId, orderData, currentUser.uid);
        showSuccess('Zamówienie zostało zaktualizowane');
      } else {
        await createOrder(orderData, currentUser.uid);
        showSuccess('Zamówienie zostało utworzone');
      }
      navigate('/orders');
    } catch (error) {
      showError('Błąd podczas zapisywania zamówienia: ' + error.message);
      console.error('Error saving order:', error);
    } finally {
      setSaving(false);
    }
  };

  const validateForm = () => {
    const errors = {};
    
    if (!orderData.customer.name) {
      errors.customerName = 'Nazwa klienta jest wymagana';
    }
    
    orderData.items.forEach((item, index) => {
      if (!item.name) {
        errors[`item_${index}_name`] = 'Nazwa produktu jest wymagana';
      }
      
      if (!item.quantity || item.quantity <= 0) {
        errors[`item_${index}_quantity`] = 'Ilość musi być większa od 0';
      }
      
      if (item.price < 0) {
        errors[`item_${index}_price`] = 'Cena nie może być ujemna';
      }
    });
    
    if (!orderData.orderDate) {
      errors.orderDate = 'Data zamówienia jest wymagana';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    if (['orderDate', 'expectedDeliveryDate', 'deliveryDate'].includes(name)) {
      setOrderData(prev => ({ 
        ...prev, 
        [name]: formatDateForInput(value) 
      }));
    } else {
      setOrderData(prev => ({ ...prev, [name]: value }));
    }
    
    if (validationErrors[name]) {
      const updatedErrors = { ...validationErrors };
      delete updatedErrors[name];
      setValidationErrors(updatedErrors);
    }
  };

  const handleCustomerChange = (e, selectedCustomer) => {
    if (selectedCustomer) {
      // Upewnij się, że przekazujemy tylko potrzebne pola klienta jako proste wartości
      setOrderData(prev => ({
        ...prev,
        customer: {
          id: selectedCustomer.id || '',
          name: selectedCustomer.name || '',
          email: selectedCustomer.email || '',
          phone: selectedCustomer.phone || '',
          address: selectedCustomer.address || '',
          shippingAddress: selectedCustomer.shippingAddress || '',
          vatEu: selectedCustomer.vatEu || '',
          billingAddress: selectedCustomer.billingAddress || '',
          notes: selectedCustomer.notes || ''
        }
      }));
      
      if (validationErrors.customerName) {
        const updatedErrors = { ...validationErrors };
        delete updatedErrors.customerName;
        setValidationErrors(updatedErrors);
      }
    } else {
      setOrderData(prev => ({
        ...prev,
        customer: { ...DEFAULT_ORDER.customer }
      }));
    }
  };

  const handleCustomerDetailChange = (e) => {
    const { name, value } = e.target;
    setOrderData(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        [name.replace('customer_', '')]: value
      }
    }));
  };

  const handleAddCustomer = () => {
    setOrderData(prev => ({
      ...prev,
      customer: { ...DEFAULT_ORDER.customer }
    }));
    setIsCustomerDialogOpen(true);
  };

  const handleCloseCustomerDialog = () => {
    setIsCustomerDialogOpen(false);
  };

  const handleSaveNewCustomer = async () => {
    try {
      const customerData = orderData.customer;
      
      if (!customerData.name || customerData.name.trim() === '') {
        showError('Nazwa klienta jest wymagana');
        return;
      }
      
      setSaving(true);
      
      const newCustomerId = await createCustomer(customerData, currentUser.uid);
      
      const newCustomer = {
        id: newCustomerId,
        ...customerData
      };
      
      setCustomers(prev => [...prev, newCustomer]);
      
      setOrderData(prev => ({
        ...prev,
        customer: newCustomer
      }));
      
      showSuccess('Klient został dodany');
      setIsCustomerDialogOpen(false);
    } catch (error) {
      showError('Błąd podczas dodawania klienta: ' + error.message);
      console.error('Error adding customer:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleItemChange = (index, field, value) => {
    const updatedItems = [...orderData.items];
    updatedItems[index] = {
      ...updatedItems[index],
      [field]: value
    };
    
    setOrderData(prev => ({
      ...prev,
      items: updatedItems
    }));
    
    if (validationErrors[`item_${index}_${field}`]) {
      const updatedErrors = { ...validationErrors };
      delete updatedErrors[`item_${index}_${field}`];
      setValidationErrors(updatedErrors);
    }
  };

  const handleProductSelect = (index, selectedProduct, type) => {
    if (selectedProduct && type === 'recipe') {
      const updatedItems = [...orderData.items];
      updatedItems[index] = {
        ...updatedItems[index],
        id: selectedProduct.id,
        name: selectedProduct.name,
        price: selectedProduct.price || 0,
        unit: selectedProduct.unit || 'szt.',
        itemType: type,
        isRecipe: true
      };
      
      setOrderData(prev => ({
        ...prev,
        items: updatedItems
      }));
      
      // Pobierz cenę z listy cenowej dla klienta
      if (orderData.customer && orderData.customer.id) {
        (async () => {
          try {
            const priceFromList = await getPriceForCustomerProduct(
              orderData.customer.id, 
              selectedProduct.id,
              true // dla receptury
            );
            
            if (priceFromList !== null) {
              // Aktualizuj cenę z listy cenowej
              const itemsWithPrice = [...updatedItems];
              itemsWithPrice[index] = {
                ...itemsWithPrice[index],
                price: priceFromList,
                fromPriceList: true
              };
              
              setOrderData(prev => ({
                ...prev,
                items: itemsWithPrice
              }));
              
              // Pokaż informację o użyciu ceny z listy cenowej
              showInfo(`Zastosowano cenę ${priceFromList} EUR z listy cenowej klienta`);
            } else {
              // Jeśli nie ma ceny w liście cenowej, sprawdź koszt procesowy receptury
              const recipe = await getRecipeById(selectedProduct.id);
              if (recipe && recipe.processingCostPerUnit) {
                // Zaktualizuj cenę na podstawie kosztu procesowego
                const itemsWithPrice = [...updatedItems];
                itemsWithPrice[index] = {
                  ...itemsWithPrice[index],
                  price: recipe.processingCostPerUnit,
                  fromPriceList: false,
                  fromProcessingCost: true
                };
                
                setOrderData(prev => ({
                  ...prev,
                  items: itemsWithPrice
                }));
                
                // Pokaż informację o użyciu kosztu procesowego
                showInfo(`Zastosowano koszt procesowy ${recipe.processingCostPerUnit} EUR z receptury`);
              }
            }
          } catch (error) {
            console.error('Błąd podczas pobierania ceny z listy cenowej:', error);
          }
        })();
      }
      
      const updatedErrors = { ...validationErrors };
      delete updatedErrors[`item_${index}_name`];
      delete updatedErrors[`item_${index}_price`];
      setValidationErrors(updatedErrors);
    }
  };

  const addItem = () => {
    setOrderData(prev => ({
      ...prev,
      items: [...prev.items, { ...DEFAULT_ITEM }]
    }));
  };

  const removeItem = (index) => {
    const updatedItems = [...orderData.items];
    updatedItems.splice(index, 1);
    
    if (updatedItems.length === 0) {
      updatedItems.push({ ...DEFAULT_ITEM });
    }
    
    setOrderData(prev => ({
      ...prev,
      items: updatedItems
    }));
    
    const updatedErrors = { ...validationErrors };
    delete updatedErrors[`item_${index}_name`];
    delete updatedErrors[`item_${index}_quantity`];
    delete updatedErrors[`item_${index}_price`];
    setValidationErrors(updatedErrors);
  };

  const calculateSubtotal = () => {
    return orderData.items.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price) || 0;
      return sum + (quantity * price);
    }, 0);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const shippingCost = parseFloat(orderData.shippingCost) || 0;
    const purchaseOrdersTotal = calculatePurchaseOrdersTotal();
    return subtotal + shippingCost + purchaseOrdersTotal;
  };

  const handleDeliveryProofUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      
      const tempId = orderId || `temp-${Date.now()}`;
      
      const storageRef = ref(storage, `delivery_proofs/${tempId}/${file.name}`);
      
      await uploadBytes(storageRef, file);
      
      const downloadURL = await getDownloadURL(storageRef);
      
      setOrderData(prev => ({
        ...prev,
        deliveryProof: downloadURL
      }));
      
      showSuccess('Dowód dostawy został pomyślnie przesłany');
    } catch (error) {
      console.error('Błąd podczas przesyłania pliku:', error);
      showError('Wystąpił błąd podczas przesyłania pliku');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };
  
  const handleDeleteDeliveryProof = async () => {
    if (!orderData.deliveryProof) return;
    
    try {
      setUploading(true);
      
      const fileUrl = orderData.deliveryProof;
      
      try {
        const storageRef = ref(storage, fileUrl);
        await deleteObject(storageRef);
      } catch (storageError) {
        console.warn('Nie można usunąć pliku ze Storage:', storageError);
      }
      
      setOrderData(prev => ({
        ...prev,
        deliveryProof: null
      }));
      
      showSuccess('Dowód dostawy został usunięty');
    } catch (error) {
      console.error('Błąd podczas usuwania pliku:', error);
      showError('Wystąpił błąd podczas usuwania pliku');
    } finally {
      setUploading(false);
    }
  };

  const handleCalculateCosts = async () => {
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
  };

  // Funkcja do sprawdzania czy pozycja zamówienia jest recepturą
  const checkRecipeItems = async () => {
    if (!orderData.items || orderData.items.length === 0) {
      showError('Zamówienie nie zawiera żadnych pozycji');
      return false;
    }
    
    const recipeItems = [];
    const itemsWithRecipes = [];
    
    // Sprawdź, które pozycje są recepturami
    for (const item of orderData.items) {
      if (item.itemType === 'recipe' || item.isRecipe) {
        // Pozycja jest bezpośrednio recepturą
        try {
          const recipe = await getRecipeById(item.id);
          if (recipe && recipe.ingredients && recipe.ingredients.length > 0) {
            recipeItems.push({
              orderItem: item,
              recipe: recipe
            });
          }
        } catch (error) {
          console.error(`Nie można pobrać receptury dla ${item.name}:`, error);
        }
      } else {
        // Sprawdź czy dla produktu istnieje receptura o podobnej nazwie
        const matchingRecipe = recipes.find(recipe => {
          const recipeName = recipe.name.toLowerCase();
          const itemName = item.name.toLowerCase();
          return recipeName.includes(itemName) || itemName.includes(recipeName);
        });
        
        if (matchingRecipe) {
          itemsWithRecipes.push({
            orderItem: item,
            recipe: matchingRecipe
          });
        }
      }
    }
    
    return [...recipeItems, ...itemsWithRecipes];
  };
  
  // Funkcja generująca listę materiałów na podstawie receptur
  const generateMaterialsList = async (recipeItems) => {
    const allMaterials = [];
    
    for (const { orderItem, recipe } of recipeItems) {
      if (!recipe.ingredients || recipe.ingredients.length === 0) continue;
      
      // Oblicz potrzebną ilość każdego składnika
      const recipeYield = recipe.yield?.quantity || 1;
      const orderQuantity = parseFloat(orderItem.quantity) || 1;
      const scaleFactor = orderQuantity / recipeYield;
      
      for (const ingredient of recipe.ingredients) {
        if (!ingredient.id) continue; // Pomiń składniki bez ID (nie są z magazynu)
        
        const requiredQuantity = parseFloat(ingredient.quantity) * scaleFactor;
        
        // Znajdź istniejący materiał lub dodaj nowy
        const existingIndex = allMaterials.findIndex(m => m.id === ingredient.id);
        
        if (existingIndex >= 0) {
          allMaterials[existingIndex].quantity += requiredQuantity;
        } else {
          // Znajdź pełne dane składnika w magazynie
          const inventoryItem = products.find(p => p.id === ingredient.id);
          
          allMaterials.push({
            id: ingredient.id,
            name: ingredient.name || (inventoryItem ? inventoryItem.name : 'Nieznany składnik'),
            quantity: requiredQuantity,
            unit: ingredient.unit || (inventoryItem ? inventoryItem.unit : 'szt.'),
            forRecipe: recipe.name,
            forOrderItem: orderItem.name,
            selected: true  // Domyślnie zaznaczony
          });
        }
      }
    }
    
    return allMaterials;
  };
  
  // Funkcja generująca zamówienie zakupu dla materiałów
  const generatePurchaseOrder = async () => {
    try {
      setIsGeneratingPO(true);
      
      // Sprawdź czy zamówienie jest zapisane
      if (!orderId) {
        showError('Przed wygenerowaniem zamówienia zakupu, najpierw zapisz zamówienie klienta');
        setIsGeneratingPO(false);
        return;
      }
      
      // Znajdź pozycje będące recepturami
      const recipeItems = await checkRecipeItems();
      
      if (!recipeItems || recipeItems.length === 0) {
        showError('W zamówieniu nie znaleziono pozycji z recepturami');
        setIsGeneratingPO(false);
        return;
      }
      
      // Wygeneruj listę materiałów potrzebnych do produkcji
      const materials = await generateMaterialsList(recipeItems);
      
      if (!materials || materials.length === 0) {
        showError('Nie znaleziono materiałów do zamówienia');
        setIsGeneratingPO(false);
        return;
      }
      
      setMaterialsForPO(materials);
      setIsPODialogOpen(true);
      setIsGeneratingPO(false);
      
    } catch (error) {
      console.error('Błąd podczas generowania zamówienia zakupu:', error);
      showError('Wystąpił błąd podczas generowania zamówienia zakupu: ' + error.message);
      setIsGeneratingPO(false);
    }
  };
  
  // Funkcja tworząca nowe zamówienie zakupu
  const createNewPurchaseOrder = async () => {
    try {
      setIsGeneratingPO(true);
      
      // Filtruj tylko zaznaczone materiały
      const selectedMaterials = materialsForPO.filter(m => m.selected !== false);
      
      if (selectedMaterials.length === 0) {
        showError('Nie wybrano żadnych materiałów do zamówienia');
        setIsGeneratingPO(false);
        return;
      }
      
      // Przygotuj dane dla getBestSupplierPricesForItems
      const itemsToCheck = selectedMaterials
        .filter(material => material.id)
        .map(material => ({
          itemId: material.id,
          quantity: material.quantity
        }));
      
      if (itemsToCheck.length === 0) {
        showError('Brak pozycji magazynowych do zamówienia');
        setIsGeneratingPO(false);
        return;
      }
      
      // Znajdź najlepsze ceny dostawców
      const bestPrices = await getBestSupplierPricesForItems(itemsToCheck);
      
      // Grupuj materiały według dostawców
      const supplierItems = {};
      
      for (const material of selectedMaterials) {
        if (!material.id || !bestPrices[material.id]) continue;
        
        const bestPrice = bestPrices[material.id];
        const supplierId = bestPrice.supplierId;
        
        if (!supplierId) continue;
        
        if (!supplierItems[supplierId]) {
          supplierItems[supplierId] = [];
        }
        
        supplierItems[supplierId].push({
          id: `temp-${Date.now()}-${material.id}`,
          inventoryItemId: material.id,
          name: material.name,
          quantity: material.quantity,
          unit: material.unit,
          unitPrice: bestPrice.price,
          totalPrice: bestPrice.price * material.quantity,
          notes: `Dla pozycji: ${material.forOrderItem} (z receptury: ${material.forRecipe})`
        });
      }
      
      const createdPOs = [];
      
      // Utwórz zamówienie zakupu dla każdego dostawcy
      for (const supplierId in supplierItems) {
        const supplier = suppliers.find(s => s.id === supplierId);
        if (!supplier) continue;
        
        const items = supplierItems[supplierId];
        const totalValue = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
        const vatRate = 23; // Domyślna stawka VAT
        
        // Obliczanie wartości VAT (tylko od produktów)
        const vatValue = (totalValue * vatRate) / 100;
        
        // Obliczanie wartości brutto: wartość netto produktów + VAT
        const totalGross = totalValue + vatValue;
        
        const poData = {
          supplier: supplier,
          items: items,
          totalValue: totalValue,
          totalGross: totalGross, // Dodajemy wartość brutto
          vatRate: vatRate,
          currency: 'EUR',
          additionalCostsItems: [], // Inicjalizacja pustej tablicy dodatkowych kosztów
          orderDate: new Date().toISOString().split('T')[0],
          expectedDeliveryDate: orderData.expectedDeliveryDate || '',
          status: 'draft',
          notes: `Automatycznie wygenerowane zamówienie dla: ${orderData.orderNumber}`,
          customerOrderId: orderId,
          customerOrderNumber: orderData.orderNumber,
          targetWarehouseId: '' // Dodajemy puste pole targetWarehouseId żeby uniknąć undefined
        };
        
        // Utwórz zamówienie zakupu
        const newPO = await createPurchaseOrder(poData, currentUser.uid);
        createdPOs.push({
          id: newPO.id,
          number: newPO.number,
          supplier: supplier.name,
          items: items.length,
          value: totalValue,
          vatRate: vatRate, // Dodajemy stawkę VAT
          totalGross: totalGross, // Dodajemy wartość brutto
          status: 'draft'
        });
      }
      
      if (createdPOs.length > 0) {
        // Zaktualizuj zamówienie klienta z linkami do PO
        const updatedLinkedPOs = [...linkedPurchaseOrders, ...createdPOs];
        
        // Zaktualizuj stan aplikacji
        setLinkedPurchaseOrders(updatedLinkedPOs);
        setOrderData(prev => ({
          ...prev,
          linkedPurchaseOrders: updatedLinkedPOs
        }));
        
        // Zapisz w bazie danych
        await updateOrder(
          orderId, 
          { 
            ...orderData, 
            linkedPurchaseOrders: updatedLinkedPOs 
          }, 
          currentUser.uid
        );
        
        showSuccess(`Utworzono ${createdPOs.length} zamówień zakupu`);
        setIsPODialogOpen(false);
      } else {
        showError('Nie udało się utworzyć żadnego zamówienia zakupu');
      }
    } catch (error) {
      console.error('Błąd podczas tworzenia zamówienia zakupu:', error);
      showError('Wystąpił błąd podczas tworzenia zamówienia zakupu: ' + error.message);
    } finally {
      setIsGeneratingPO(false);
    }
  };

  // Funkcja obliczająca sumę wartości zamówień zakupu
  const calculatePurchaseOrdersTotal = () => {
    if (!linkedPurchaseOrders || linkedPurchaseOrders.length === 0) {
      return 0;
    }
    
    return linkedPurchaseOrders.reduce((sum, po) => {
      console.log("Obliczanie wartości PO:", po);
      
      // Jeśli zamówienie zakupu ma już obliczoną wartość brutto, używamy jej
      if (po.totalGross !== undefined && po.totalGross !== null) {
        const grossValue = typeof po.totalGross === 'number' ? po.totalGross : parseFloat(po.totalGross) || 0;
        console.log(`Używam istniejącej wartości totalGross dla ${po.number}: ${grossValue}`);
        return sum + grossValue;
      }
      
      console.log(`Brak wartości totalGross dla PO ${po.number}, obliczam ręcznie`);
      
      // W przeciwnym razie obliczamy wartość brutto
      // Podstawowa wartość zamówienia zakupu (produkty)
      const productsValue = typeof po.value === 'number' ? po.value : parseFloat(po.value) || 0;
      
      // Stawka VAT i wartość podatku VAT (tylko od produktów)
      const vatRate = typeof po.vatRate === 'number' ? po.vatRate : parseFloat(po.vatRate) || 0;
      const vatValue = (productsValue * vatRate) / 100;
      
      // Dodatkowe koszty w zamówieniu zakupu
      let additionalCosts = 0;
      if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
        additionalCosts = po.additionalCostsItems.reduce((costsSum, cost) => {
          const costValue = typeof cost.value === 'number' ? cost.value : parseFloat(cost.value) || 0;
          return costsSum + costValue;
        }, 0);
      } else {
        additionalCosts = typeof po.additionalCosts === 'number' ? po.additionalCosts : parseFloat(po.additionalCosts) || 0;
      }
      
      // Wartość brutto: produkty + VAT + dodatkowe koszty
      const grossValue = productsValue + vatValue + additionalCosts;
      console.log(`Obliczona wartość brutto PO ${po.number}: ${grossValue} (produkty: ${productsValue}, VAT: ${vatValue}, koszty: ${additionalCosts})`);
        
      return sum + grossValue;
    }, 0);
  };

  const handleRefreshPurchaseOrders = async () => {
    try {
      setLoading(true);
      
      // Pobierz aktualne dane zamówienia z bazy danych
      const { getOrderById } = await import('../../services/orderService');
      const { getPurchaseOrderById } = await import('../../services/purchaseOrderService');
      const updatedOrder = await getOrderById(orderId);
      
      console.log("Pobrane dane zamówienia:", updatedOrder);
      
      // Pobierz aktualne dane każdego zamówienia zakupu bezpośrednio z bazy danych
      const updatedPOs = await Promise.all((updatedOrder.linkedPurchaseOrders || []).map(async (po) => {
        if (!po.id) {
          console.warn("Pominięto PO bez ID:", po);
          return po;
        }
        
        try {
          // Pobierz najnowsze dane PO z bazy
          const freshPO = await getPurchaseOrderById(po.id);
          console.log(`Pobrano aktualne dane PO ${po.number || po.id}:`, freshPO);
          
          // Konwertuj obiekt dostawcy na prostą strukturę z podstawowymi polami
          const simplifiedPO = {
            ...freshPO,
            supplier: typeof freshPO.supplier === 'object' ? {
              id: freshPO.supplier.id || '',
              name: freshPO.supplier.name || '',
              email: freshPO.supplier.email || '',
              phone: freshPO.supplier.phone || ''
            } : freshPO.supplier,
            // Upewnij się, że inne pola obiektu są również proste wartości
            items: Array.isArray(freshPO.items) ? freshPO.items.length : 0,
            value: typeof freshPO.totalValue === 'number' ? freshPO.totalValue : parseFloat(freshPO.totalValue || freshPO.value) || 0,
            totalGross: typeof freshPO.totalGross === 'number' ? freshPO.totalGross : parseFloat(freshPO.totalGross) || 0,
            vatRate: typeof freshPO.vatRate === 'number' ? freshPO.vatRate : parseFloat(freshPO.vatRate) || 23,
            status: freshPO.status || 'draft',
            number: freshPO.number || freshPO.id
          };
          
          return simplifiedPO;
        } catch (error) {
          console.error(`Błąd podczas pobierania danych PO ${po.id}:`, error);
          return po; // W przypadku błędu, zwróć oryginalne dane
        }
      }));
      
      // Przeliczamy wartość zamówień zakupu
      const poTotal = updatedPOs.reduce((sum, po) => {
        console.log("PO do przeliczenia:", po);
        
        // Jeśli zamówienie ma już wartość brutto, używamy jej
        if (po.totalGross !== undefined && po.totalGross !== null) {
          const value = typeof po.totalGross === 'number' ? po.totalGross : parseFloat(po.totalGross) || 0;
          console.log(`Używam istniejącej wartości brutto dla ${po.number}: ${value}`);
          return sum + value;
        }
        
        // W przeciwnym razie obliczamy wartość brutto
        const productsValue = parseFloat(po.totalValue || po.value) || 0;
        console.log(`Wartość produktów: ${productsValue}`);
        
        const vatRate = parseFloat(po.vatRate) || 23;
        const vatValue = (productsValue * vatRate) / 100;
        console.log(`Stawka VAT: ${vatRate}%, wartość VAT: ${vatValue}`);
        
        // Sprawdzenie czy istnieją dodatkowe koszty w formie tablicy
        let additionalCosts = 0;
        if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
          additionalCosts = po.additionalCostsItems.reduce((costsSum, cost) => {
            return costsSum + (parseFloat(cost.value) || 0);
          }, 0);
        } else {
          // Użyj starego pola additionalCosts jeśli nowa tablica nie istnieje
          additionalCosts = parseFloat(po.additionalCosts) || 0;
        }
        console.log(`Dodatkowe koszty: ${additionalCosts}`);
        
        const grossValue = productsValue + vatValue + additionalCosts;
        console.log(`Obliczona wartość brutto: ${grossValue}`);
        
        return sum + grossValue;
      }, 0);
      
      console.log(`Łączna wartość PO: ${poTotal}`);
      
      // Aktualizuj lokalny stan i powiązane zamówienia zakupu
      setLinkedPurchaseOrders(updatedPOs);
      
      // Aktualizuj stan zamówienia
      setOrderData(prev => {
        const newData = {
          ...prev,
          linkedPurchaseOrders: updatedPOs,
          purchaseOrdersValue: poTotal
        };
        console.log("Zaktualizowane dane zamówienia:", newData);
        return newData;
      });
      
      // Oblicz i wyświetl sumę całkowitą
      setTimeout(() => {
        const total = calculateTotal();
        console.log(`Nowa łączna wartość zamówienia: ${total}`);
      }, 0);
      
      showSuccess('Zaktualizowano dane zamówień zakupu');
      setLoading(false);
    } catch (error) {
      console.error('Błąd podczas odświeżania powiązanych zamówień zakupu:', error);
      showError('Nie udało się odświeżyć danych zamówień zakupu: ' + error.message);
      setLoading(false);
    }
  };

  // Funkcja otwierająca dialog przypisania PO
  const handleAssignPurchaseOrder = () => {
    setIsAssignPODialogOpen(true);
    fetchAvailablePurchaseOrders();
  };
  
  // Funkcja pobierająca dostępne zamówienia zakupowe
  const fetchAvailablePurchaseOrders = async () => {
    try {
      setLoadingPurchaseOrders(true);
      const allPurchaseOrders = await getAllPurchaseOrders();
      
      // Filtruj, aby wyświetlić tylko PO, które jeszcze nie są przypisane do tego zamówienia
      const alreadyLinkedIds = (linkedPurchaseOrders || []).map(po => po.id);
      const filteredPOs = allPurchaseOrders.filter(po => !alreadyLinkedIds.includes(po.id));
      
      setAvailablePurchaseOrders(filteredPOs);
    } catch (error) {
      console.error('Błąd podczas pobierania dostępnych zamówień zakupowych:', error);
      showError('Nie udało się pobrać listy zamówień zakupowych: ' + error.message);
    } finally {
      setLoadingPurchaseOrders(false);
    }
  };
  
  // Funkcja zamykająca dialog przypisania PO
  const handleCloseAssignPODialog = () => {
    setIsAssignPODialogOpen(false);
    setSelectedPurchaseOrderId('');
  };
  
  // Funkcja obsługująca wybór PO z listy
  const handlePurchaseOrderSelection = (event) => {
    setSelectedPurchaseOrderId(event.target.value);
  };
  
  // Funkcja przypisująca wybrane PO do zamówienia klienta
  const handleAssignSelected = async () => {
    if (!selectedPurchaseOrderId) return;
    
    try {
      const selectedPO = availablePurchaseOrders.find(po => po.id === selectedPurchaseOrderId);
      if (!selectedPO) return;
      
      // Przygotuj dane dla nowo powiązanego PO
      const poToLink = {
        id: selectedPO.id,
        number: selectedPO.number,
        supplier: selectedPO.supplier?.name || selectedPO.supplier || 'Nieznany dostawca',
        items: selectedPO.items?.length || 0,
        totalGross: selectedPO.totalGross || 0,
        status: selectedPO.status || 'draft'
      };
      
      // Dodaj nowe PO do listy
      const updatedLinkedPOs = [...(linkedPurchaseOrders || []), poToLink];
      
      // Zaktualizuj stan aplikacji
      setLinkedPurchaseOrders(updatedLinkedPOs);
      setOrderData(prev => ({
        ...prev,
        linkedPurchaseOrders: updatedLinkedPOs
      }));
      
      // Zapisz w bazie danych jeśli zamówienie już istnieje
      if (orderId) {
        await updateOrder(
          orderId, 
          { 
            ...orderData, 
            linkedPurchaseOrders: updatedLinkedPOs 
          }, 
          currentUser.uid
        );
        showSuccess('Zamówienie zakupowe zostało przypisane');
      } else {
        showSuccess('Zamówienie zakupowe zostanie przypisane po zapisaniu zamówienia klienta');
      }
      
      // Zamknij dialog
      handleCloseAssignPODialog();
    } catch (error) {
      console.error('Błąd podczas przypisywania zamówienia zakupowego:', error);
      showError('Wystąpił błąd podczas przypisywania zamówienia zakupowego: ' + error.message);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => navigate('/orders')}
          >
            Powrót
          </Button>
          <Typography variant="h5">
            {orderId ? 'Edytuj zamówienie' : 'Nowe zamówienie'}
          </Typography>
          <Button 
            type="submit" 
            variant="contained" 
            color="primary"
            disabled={saving}
            startIcon={<SaveIcon />}
          >
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </Button>
        </Box>

        {orderData.orderNumber && (
          <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
            <Typography variant="subtitle1" color="primary" fontWeight="bold">
              Numer zamówienia klienta: {orderData.orderNumber}
            </Typography>
          </Box>
        )}
        
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Dane podstawowe</Typography>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Status zamówienia</InputLabel>
              <Select
                name="status"
                value={orderData.status}
                onChange={handleChange}
                label="Status zamówienia"
              >
                {ORDER_STATUSES.map(status => (
                  <MenuItem key={status.value} value={status.value}>
                    {status.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          
          <Divider sx={{ mb: 2 }} />
          
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <FormControl fullWidth error={!!validationErrors.customerName}>
                  <Autocomplete
                    options={customers}
                    getOptionLabel={(customer) => customer && typeof customer === 'object' && customer.name ? customer.name : ''}
                    onChange={handleCustomerChange}
                    value={customers.find(c => c && c.id === orderData.customer.id) || null}
                    renderInput={(params) => (
                      <TextField 
                        {...params} 
                        label="Klient" 
                        required
                        error={!!validationErrors.customerName}
                        helperText={validationErrors.customerName}
                      />
                    )}
                  />
                </FormControl>
                <Tooltip title="Dodaj nowego klienta">
                  <IconButton 
                    color="primary" 
                    onClick={handleAddCustomer}
                    sx={{ ml: 1, mt: 1 }}
                  >
                    <AddIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                type="date"
                label="Data zamówienia"
                name="orderDate"
                value={orderData.orderDate || ''}
                onChange={handleChange}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                error={!!validationErrors.orderDate}
                helperText={validationErrors.orderDate}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="customer_email"
                label="Email klienta"
                value={orderData.customer.email || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="customer_phone"
                label="Telefon klienta"
                value={orderData.customer.phone || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="customer_shippingAddress"
                label="Adres dostawy"
                value={orderData.customer.shippingAddress || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                type="date"
                label="Oczekiwana data dostawy"
                name="expectedDeliveryDate"
                value={orderData.expectedDeliveryDate || ''}
                onChange={handleChange}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
          </Grid>
        </Paper>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Produkty</Typography>
            <Button 
              variant="outlined" 
              startIcon={<AddIcon />} 
              onClick={addItem}
            >
              Dodaj produkt
            </Button>
          </Box>
          
          <Divider sx={{ mb: 2 }} />
          
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width="40%">Produkt</TableCell>
                <TableCell width="15%">Ilość</TableCell>
                <TableCell width="15%">Jednostka</TableCell>
                <TableCell width="15%">Cena</TableCell>
                <TableCell width="15%">Wartość</TableCell>
                <TableCell width="10%"></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orderData.items.map((item, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <ToggleButtonGroup
                      size="small"
                      value={item.itemType || (item.isRecipe ? 'recipe' : 'product')}
                      exclusive
                      onChange={(_, newType) => {
                        if (newType !== null) {
                          handleItemChange(index, 'itemType', newType);
                        }
                      }}
                      aria-label="typ produktu"
                      sx={{ mb: 1 }}
                    >
                      <ToggleButton value="product" size="small">
                        Produkt
                      </ToggleButton>
                      <ToggleButton value="recipe" size="small">
                        Receptura
                      </ToggleButton>
                    </ToggleButtonGroup>
                    
                    {(item.itemType || (item.isRecipe ? 'recipe' : 'product')) === 'product' ? (
                      <TextField
                        label="Nazwa produktu"
                        value={item.name}
                        onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                        fullWidth
                        error={!!validationErrors[`item_${index}_name`]}
                        helperText={validationErrors[`item_${index}_name`]}
                      />
                    ) : (
                    <Autocomplete
                        options={recipes}
                        getOptionLabel={(option) => option.name || ''}
                        value={recipes.find(r => r.id === item.id) || null}
                        onChange={(_, newValue) => handleProductSelect(index, newValue, 'recipe')}
                      renderInput={(params) => (
                        <TextField 
                          {...params} 
                            label="Receptura"
                            size="small"
                          error={!!validationErrors[`item_${index}_name`]}
                          helperText={validationErrors[`item_${index}_name`]}
                        />
                      )}
                    />
                    )}
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      inputProps={{ min: 1 }}
                      fullWidth
                      error={!!validationErrors[`item_${index}_quantity`]}
                      helperText={validationErrors[`item_${index}_quantity`]}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      value={item.unit}
                      onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                      fullWidth
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      value={item.price}
                      onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">EUR</InputAdornment>,
                      }}
                      inputProps={{ min: 0, step: 0.01 }}
                      fullWidth
                      error={!!validationErrors[`item_${index}_price`]}
                      helperText={validationErrors[`item_${index}_price`]}
                    />
                  </TableCell>
                  <TableCell>
                    {formatCurrency(item.quantity * item.price)}
                  </TableCell>
                  <TableCell>
                    <IconButton 
                      color="error" 
                      onClick={() => removeItem(index)}
                      disabled={orderData.items.length === 1}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
              Suma: {formatCurrency(calculateSubtotal())}
            </Typography>
          </Box>
        </Paper>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Płatność i dostawa</Typography>
          <Divider sx={{ mb: 2 }} />
          
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Metoda płatności</InputLabel>
                <Select
                  name="paymentMethod"
                  value={orderData.paymentMethod || 'Przelew'}
                  onChange={handleChange}
                  label="Metoda płatności"
                >
                  {PAYMENT_METHODS.map(method => (
                    <MenuItem key={method.value} value={method.value}>
                      {method.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Status płatności</InputLabel>
                <Select
                  name="paymentStatus"
                  value={orderData.paymentStatus || 'Nieopłacone'}
                  onChange={handleChange}
                  label="Status płatności"
                >
                  <MenuItem value="Nieopłacone">Nieopłacone</MenuItem>
                  <MenuItem value="Opłacone częściowo">Opłacone częściowo</MenuItem>
                  <MenuItem value="Opłacone">Opłacone</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="shippingMethod"
                label="Metoda dostawy"
                value={orderData.shippingMethod || ''}
                onChange={handleChange}
                fullWidth
                placeholder="np. Kurier, Odbiór osobisty"
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="shippingCost"
                label="Koszt dostawy"
                type="number"
                value={orderData.shippingCost || 0}
                onChange={handleChange}
                fullWidth
                InputProps={{
                  startAdornment: <InputAdornment position="start">EUR</InputAdornment>,
                }}
                inputProps={{ min: 0, step: 0.01 }}
              />
            </Grid>
          </Grid>
          
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3, alignItems: 'center' }}>
            <Typography variant="subtitle1" sx={{ mr: 2 }}>
              Koszt dostawy: {formatCurrency(parseFloat(orderData.shippingCost) || 0)}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
              Razem: {formatCurrency(calculateTotal())}
            </Typography>
          </Box>
        </Paper>

        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Uwagi</Typography>
          <TextField
            name="notes"
            value={orderData.notes || ''}
            onChange={handleChange}
            fullWidth
            multiline
            rows={4}
            placeholder="Dodatkowe informacje, uwagi..."
          />
        </Paper>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Dowód dostawy</Typography>
          <Divider sx={{ mb: 2 }} />
          
          {orderData.deliveryProof ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Box sx={{ width: '100%', maxWidth: 600, mb: 2 }}>
                <img 
                  src={orderData.deliveryProof} 
                  alt="Dowód dostawy" 
                  style={{ width: '100%', height: 'auto', borderRadius: 4 }} 
                />
              </Box>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button 
                  variant="outlined"
                  startIcon={<DownloadIcon />}
                  href={orderData.deliveryProof}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Pobierz
                </Button>
                <Button 
                  variant="outlined" 
                  color="error" 
                  startIcon={<DeleteIcon />}
                  onClick={handleDeleteDeliveryProof}
                  disabled={uploading}
                >
                  Usuń
                </Button>
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <Typography variant="body1" sx={{ mb: 2 }}>
                Brak załączonego dowodu dostawy. Dodaj skan lub zdjęcie potwierdzenia dostawy.
              </Typography>
              <input
                ref={fileInputRef}
                accept="image/*, application/pdf"
                style={{ display: 'none' }}
                id="delivery-proof-upload"
                type="file"
                onChange={handleDeliveryProofUpload}
              />
              <label htmlFor="delivery-proof-upload">
                <Button
                  variant="contained"
                  component="span"
                  startIcon={<UploadIcon />}
                  disabled={uploading}
                >
                  {uploading ? 'Przesyłanie...' : 'Dodaj dowód dostawy'}
                </Button>
              </label>
            </Box>
          )}
        </Paper>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Zamówienia zakupu powiązane</Typography>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <Button
                variant="outlined"
                color="info"
                startIcon={<RefreshIcon />} 
                onClick={handleRefreshPurchaseOrders}
                disabled={!orderId}
              >
                Odśwież dane PO
              </Button>
              <Button
                variant="outlined"
                color="primary"
                startIcon={<PlaylistAddIcon />}
                onClick={handleAssignPurchaseOrder}
                disabled={!orderId}
              >
                Przypisz istniejące PO
              </Button>
              <Button
                variant="outlined"
                startIcon={<ShoppingCartIcon />} 
                onClick={generatePurchaseOrder}
                disabled={isGeneratingPO || !orderId}
              >
                {isGeneratingPO ? 'Generowanie...' : 'Generuj zamówienia zakupu'}
              </Button>
            </Box>
          </Box>
          
          <Divider sx={{ mb: 2 }} />
          
          {linkedPurchaseOrders && linkedPurchaseOrders.length > 0 ? (
            <>
              <Box sx={{ mb: 2 }}>
                <Alert severity="info" icon={<ShoppingCartIcon />} sx={{ mb: 2 }}>
                  <Typography variant="subtitle1" fontWeight="medium">
                    To zamówienie klienta ma {linkedPurchaseOrders.length} powiązanych zamówień zakupu 
                    o łącznej wartości brutto {formatCurrency(calculatePurchaseOrdersTotal())}
                  </Typography>
                </Alert>
              </Box>
              <Table>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'primary.light' }}>
                    <TableCell>Numer PO</TableCell>
                    <TableCell>Dostawca</TableCell>
                    <TableCell>Liczba pozycji</TableCell>
                    <TableCell align="right">Wartość brutto</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {linkedPurchaseOrders.map((po, index) => (
                    <TableRow key={index} hover>
                      <TableCell>
                        <Chip 
                          label={po.number} 
                          color="primary" 
                          variant="outlined" 
                          size="small"
                          icon={<ShoppingCartIcon fontSize="small" />}
                          sx={{ fontWeight: 'bold' }}
                        />
                      </TableCell>
                      <TableCell>
                        {typeof po.supplier === 'object' ? po.supplier.name : po.supplier}
                      </TableCell>
                      <TableCell align="center">{po.items}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{formatCurrency(po.totalGross || po.value)}</TableCell>
                      <TableCell>
                        <Chip 
                          label={po.status || "Robocze"} 
                          color={
                            po.status === 'completed' ? 'success' : 
                            po.status === 'in_progress' ? 'warning' : 
                            'default'
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Button 
                          size="small" 
                          variant="contained"
                          onClick={() => navigate(`/purchase-orders/${po.id}`)}
                          color="primary"
                        >
                          Szczegóły
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Brak powiązanych zamówień zakupu. Kliknij "Generuj zamówienia zakupu", aby automatycznie utworzyć zamówienia dla materiałów z receptur.
                  </Typography>
          )}
        </Paper>
        
        {/* Podsumowanie wartości zamówienia na końcu formularza */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Podsumowanie wartości zamówienia</Typography>
          </Box>
          
          <Divider sx={{ mb: 2 }} />
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">Wartość produktów:</Typography>
                <Typography variant="h6" fontWeight="bold">{formatCurrency(calculateSubtotal())}</Typography>
              </Paper>
                </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">Koszt dostawy:</Typography>
                <Typography variant="h6" fontWeight="bold">{formatCurrency(parseFloat(orderData.shippingCost) || 0)}</Typography>
              </Paper>
              </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">Wartość zamówień zakupu:</Typography>
                <Typography variant="h6" fontWeight="bold" color="warning.main">{formatCurrency(calculatePurchaseOrdersTotal())}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, bgcolor: 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">Łączna wartość:</Typography>
                <Typography variant="h6" fontWeight="bold" color="primary.main">{formatCurrency(calculateTotal())}</Typography>
              </Paper>
            </Grid>
          </Grid>
        </Paper>
      </Box>
      
      <Dialog open={isPODialogOpen} onClose={() => setIsPODialogOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>Generowanie zamówień zakupu</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 3 }}>
            System wygeneruje zamówienia zakupu dla materiałów potrzebnych do produkcji pozycji zamówienia, które posiadają receptury.
            Zamówienia zakupu zostaną utworzone i powiązane z tym zamówieniem klienta.
          </DialogContentText>
          
          <Typography variant="subtitle1" sx={{ mb: 2 }}>Materiały do zamówienia:</Typography>
          
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>
                  <Checkbox 
                    checked={materialsForPO.every(m => m.selected !== false)}
                    onChange={(e) => {
                      const newMaterials = materialsForPO.map(material => ({
                        ...material,
                        selected: e.target.checked
                      }));
                      setMaterialsForPO(newMaterials);
                    }}
                    indeterminate={materialsForPO.some(m => m.selected) && !materialsForPO.every(m => m.selected)}
                  />
                </TableCell>
                <TableCell>Nazwa materiału</TableCell>
                <TableCell align="right">Ilość</TableCell>
                <TableCell>Jednostka</TableCell>
                <TableCell>Dla produktu</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {materialsForPO.map((material, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Checkbox 
                      checked={material.selected !== false}
                      onChange={(e) => {
                        const newMaterials = [...materialsForPO];
                        newMaterials[index] = {
                          ...newMaterials[index],
                          selected: e.target.checked
                        };
                        setMaterialsForPO(newMaterials);
                      }}
                    />
                  </TableCell>
                  <TableCell>{material.name}</TableCell>
                  <TableCell align="right">{material.quantity}</TableCell>
                  <TableCell>{material.unit}</TableCell>
                  <TableCell>{material.forOrderItem}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setIsPODialogOpen(false)} variant="outlined">
            Anuluj
          </Button>
          <Button 
            onClick={createNewPurchaseOrder} 
            variant="contained" 
            color="primary"
            disabled={isGeneratingPO}
            startIcon={<ShoppingCartIcon />}
          >
            {isGeneratingPO ? 'Tworzenie...' : 'Utwórz zamówienia zakupu'}
          </Button>
        </DialogActions>
      </Dialog>
      
      <Dialog open={isCustomerDialogOpen} onClose={handleCloseCustomerDialog} maxWidth="md" fullWidth>
        <DialogTitle>Dodaj nowego klienta</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 3 }}>
            Wprowadź dane nowego klienta. Klient zostanie dodany do bazy danych.
          </DialogContentText>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                name="customer_name"
                label="Nazwa klienta"
                value={orderData.customer.name || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                required
                autoFocus
                error={!orderData.customer.name}
                helperText={!orderData.customer.name ? 'Nazwa klienta jest wymagana' : ''}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="customer_email"
                label="Email"
                value={orderData.customer.email || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="customer_phone"
                label="Telefon"
                value={orderData.customer.phone || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="customer_vatEu"
                label="VAT-EU"
                value={orderData.customer.vatEu || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="customer_billingAddress"
                label="Adres do faktury"
                value={orderData.customer.billingAddress || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="customer_shippingAddress"
                label="Adres do wysyłki"
                value={orderData.customer.shippingAddress || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="customer_notes"
                label="Notatki"
                value={orderData.customer.notes || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={handleCloseCustomerDialog} variant="outlined">Anuluj</Button>
          <Button 
            onClick={handleSaveNewCustomer} 
            variant="contained"
            disabled={!orderData.customer.name || saving}
            color="primary"
          >
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog wyboru zamówienia zakupowego */}
      <Dialog open={isAssignPODialogOpen} onClose={handleCloseAssignPODialog} maxWidth="md" fullWidth>
        <DialogTitle>Przypisz zamówienie zakupowe</DialogTitle>
        <DialogContent>
          {loadingPurchaseOrders ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : availablePurchaseOrders.length > 0 ? (
            <Box sx={{ mt: 2 }}>
              <FormControl fullWidth>
                <InputLabel>Wybierz zamówienie zakupowe</InputLabel>
                <Select
                  value={selectedPurchaseOrderId}
                  onChange={handlePurchaseOrderSelection}
                  label="Wybierz zamówienie zakupowe"
                >
                  {availablePurchaseOrders.map(po => (
                    <MenuItem key={po.id} value={po.id}>
                      {po.number} - {po.supplier?.name || 'Nieznany dostawca'} - Wartość: {po.totalGross} {po.currency || 'EUR'}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          ) : (
            <Typography variant="body1" sx={{ mt: 2 }}>
              Brak dostępnych zamówień zakupowych, które można przypisać.
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseAssignPODialog}>Anuluj</Button>
          <Button 
            onClick={handleAssignSelected} 
            variant="contained" 
            disabled={!selectedPurchaseOrderId || loadingPurchaseOrders}
          >
            Przypisz
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default OrderForm; 