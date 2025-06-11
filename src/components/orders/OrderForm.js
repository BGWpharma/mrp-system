import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
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
  Checkbox,
  TableContainer
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
  PlaylistAdd as PlaylistAddIcon,
  Link as LinkIcon,
  OpenInNew as OpenInNewIcon,
  BuildCircle as ServiceIcon,
  Receipt as ReceiptIcon
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
  deleteDeliveryProof,
  calculateOrderTotal
} from '../../services/orderService';
import { getAllInventoryItems, getIngredientPrices } from '../../services/inventoryService';
import { getAllCustomers, createCustomer } from '../../services/customerService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatCurrency } from '../../utils/formatUtils';
import { formatDateForInput, formatDate, safeParseDate, ensureDateInputFormat } from '../../utils/dateUtils';
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
import { getExchangeRate } from '../../services/exchangeRateService';
import { getLastRecipeUsageInfo } from '../../services/orderService';

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

const DEFAULT_MARGIN = 20; // Domyślna marża w procentach

const OrderForm = ({ orderId }) => {
  const [loading, setLoading] = useState(!!orderId);
  const [saving, setSaving] = useState(false);
  const [orderData, setOrderData] = useState({...DEFAULT_ORDER});
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [services, setServices] = useState([]); // Dodajemy listę usług
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
  const [driveLinkDialogOpen, setDriveLinkDialogOpen] = useState(false);
  const [driveLink, setDriveLink] = useState('');
  const [refreshingPOs, setRefreshingPOs] = useState(false); // Dodana zmienna stanu dla odświeżania zamówień zakupu
  const [refreshingPTs, setRefreshingPTs] = useState(false); // Dodana zmienna stanu dla odświeżania danych kosztów produkcji

  // Dodatkowe zmienne stanu dla obsługi dodatkowych kosztów
  const [additionalCostsItems, setAdditionalCostsItems] = useState([]);

  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = React.useRef(null);

  const [costCalculation, setCostCalculation] = useState(null);
  const [calculatingCosts, setCalculatingCosts] = useState(false);
  const [exchangeRates, setExchangeRates] = useState({ EUR: 1, PLN: 4.3, USD: 1.08 });
  const [loadingRates, setLoadingRates] = useState(false);

  const [invoices, setInvoices] = useState([]);

  // Sprawdź, czy formularz został otwarty z PO
  const fromPO = location.state?.fromPO || false;
  const poId = location.state?.poId || null;
  const poNumber = location.state?.poNumber || null;

  const handleAddInvoice = () => {
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
  };

  const handleInvoiceChange = (id, field, value) => {
    setInvoices(prev => prev.map(inv => inv.id === id ? { ...inv, [field]: value } : inv));
  };

  const handleRemoveInvoice = (id) => {
    setInvoices(prev => prev.filter(inv => inv.id !== id));
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        if (orderId) {
          const fetchedOrder = await getOrderById(orderId);
          
          console.log("Ładowanie danych zamówienia o ID:", orderId);
          
          // Pobierz i sparsuj daty w zamówieniu
          const orderDate = safeParseDate(fetchedOrder.orderDate);
          const deadline = safeParseDate(fetchedOrder.deadline) || safeParseDate(fetchedOrder.expectedDeliveryDate);
          const deliveryDate = safeParseDate(fetchedOrder.deliveryDate);
          
          console.log("Daty w pobranym zamówieniu:");
          console.log("- orderDate:", fetchedOrder.orderDate, typeof fetchedOrder.orderDate);
          console.log("- deadline:", fetchedOrder.deadline, typeof fetchedOrder.deadline);
          console.log("- expectedDeliveryDate:", fetchedOrder.expectedDeliveryDate, typeof fetchedOrder.expectedDeliveryDate);
          console.log("- deliveryDate:", fetchedOrder.deliveryDate, typeof fetchedOrder.deliveryDate);

          console.log("Przeformatowane daty przed zapisaniem do state:");
          console.log("- orderDate format:", formatDateForInput(orderDate));
          console.log("- deadline format:", formatDateForInput(deadline));
          console.log("- deliveryDate format:", deliveryDate ? formatDateForInput(deliveryDate) : "");
          
          if (!fetchedOrder.items || fetchedOrder.items.length === 0) {
            fetchedOrder.items = [{ ...DEFAULT_ORDER.items[0] }];
          }
          
          // Przypisz informacje o zadaniach produkcyjnych do pozycji zamówienia
          if (fetchedOrder.productionTasks && fetchedOrder.productionTasks.length > 0 && fetchedOrder.items.length > 0) {
            const { getTaskById, updateTask } = await import('../../services/productionService');
            
            console.log("Ładowanie zadań produkcyjnych dla zamówienia:", orderId);
            console.log("Elementy zamówienia:", fetchedOrder.items);
            console.log("Zadania produkcyjne:", fetchedOrder.productionTasks);
            
            for (let i = 0; i < fetchedOrder.items.length; i++) {
              const item = fetchedOrder.items[i];
              console.log(`Sprawdzanie elementu zamówienia ${i}:`, item);
              
              // Najpierw szukaj po orderItemId (najdokładniejsze dopasowanie)
              const matchingTask = fetchedOrder.productionTasks.find(task => 
                task.orderItemId && task.orderItemId === item.id
              );
              
              // Jeśli nie znaleziono po orderItemId, spróbuj dopasować po nazwie i ilości
              const alternativeTask = !matchingTask ? fetchedOrder.productionTasks.find(task => 
                task.productName === item.name && 
                parseFloat(task.quantity) === parseFloat(item.quantity) &&
                !fetchedOrder.productionTasks.some(t => t.orderItemId === item.id) // upewnij się, że zadanie nie jest już przypisane
              ) : null;
              
              const taskToUse = matchingTask || alternativeTask;
              
              if (taskToUse) {
                console.log(`Znaleziono dopasowane zadanie dla elementu ${item.name}:`, taskToUse);
                
                // Pobierz pełne dane zadania produkcyjnego, aby uzyskać aktualny koszt
                try {
                  const taskDetails = await getTaskById(taskToUse.id);
                  
                  // Zawsze aktualizuj orderItemId w zadaniu produkcyjnym, aby upewnić się, że jest poprawnie przypisane
                  const currentOrderItemId = taskDetails.orderItemId;
                  
                  // Jeśli zadanie ma inny orderItemId niż bieżący element zamówienia, aktualizuj go
                  if (currentOrderItemId !== item.id) {
                    console.log(`Aktualizacja zadania ${taskToUse.id} - przypisywanie orderItemId: ${item.id} (było: ${currentOrderItemId || 'brak'})`);
                    await updateTask(taskToUse.id, {
                      orderItemId: item.id,
                      orderId: orderId,
                      orderNumber: fetchedOrder.orderNumber || null
                    }, currentUser?.uid || 'system');
                    
                    // Zaktualizuj orderItemId w zadaniu produkcyjnym w zamówieniu
                    const { updateProductionTaskInOrder } = await import('../../services/orderService');
                    await updateProductionTaskInOrder(orderId, taskToUse.id, {
                      orderItemId: item.id
                    }, currentUser?.uid || 'system');
                  }
                  
                  // Aktualizuj informacje o zadaniu produkcyjnym w elemencie zamówienia
                  fetchedOrder.items[i] = {
                    ...item,
                    productionTaskId: taskToUse.id,
                    productionTaskNumber: taskToUse.moNumber || taskDetails.moNumber,
                    productionStatus: taskToUse.status || taskDetails.status,
                    // Używaj totalMaterialCost jako podstawowy koszt produkcji (tylko materiały wliczane do kosztów)
                    productionCost: taskDetails.totalMaterialCost || taskToUse.totalMaterialCost || 0,
                    // Dodaj pełny koszt produkcji (wszystkie materiały niezależnie od flagi "wliczaj")
                    fullProductionCost: taskDetails.totalFullProductionCost || taskToUse.totalFullProductionCost || 0
                  };
                  
                  console.log(`Przypisano zadanie produkcyjne ${taskToUse.moNumber} do elementu zamówienia ${item.name} z kosztem ${fetchedOrder.items[i].productionCost}`);
                } catch (error) {
                  console.error(`Błąd podczas pobierania szczegółów zadania ${taskToUse.id}:`, error);
                  
                  // W przypadku błędu, użyj podstawowych danych z matchingTask
                  fetchedOrder.items[i] = {
                    ...item,
                    productionTaskId: taskToUse.id,
                    productionTaskNumber: taskToUse.moNumber,
                    productionStatus: taskToUse.status,
                    productionCost: taskToUse.totalMaterialCost || 0,
                    fullProductionCost: taskToUse.totalFullProductionCost || 0
                  };
                }
              } else {
                console.log(`Nie znaleziono dopasowanego zadania dla elementu ${item.name}`);
              }
            }
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
            orderDate: ensureDateInputFormat(orderDate),
            deadline: ensureDateInputFormat(deadline),
            deliveryDate: ensureDateInputFormat(deliveryDate),
            linkedPurchaseOrders: validLinkedPOs,
            // Inicjalizacja pustą tablicą, jeśli w zamówieniu nie ma dodatkowych kosztów
            additionalCostsItems: fetchedOrder.additionalCostsItems || []
          });
          
          setLinkedPurchaseOrders(validLinkedPOs);
          
          // Zweryfikuj, czy powiązane zadania produkcyjne istnieją
          const verifiedOrder = await verifyProductionTasks(fetchedOrder);
          
          setOrderData(verifiedOrder);
        }
        
        // Pobierz klientów
        const fetchedCustomers = await getAllCustomers();
        setCustomers(fetchedCustomers);
          
        // Pobierz wszystkie produkty i odfiltruj usługi (kategoria "Inne")
        const productsData = await getAllInventoryItems();
        const servicesData = productsData.filter(item => item.category === 'Inne');
        const otherProductsData = productsData.filter(item => item.category !== 'Inne');
        setProducts(otherProductsData);
        setServices(servicesData);
          
        // Pobierz wszystkie receptury
        const fetchedRecipes = await getAllRecipes();
        setRecipes(fetchedRecipes);
        
        const fetchedSuppliers = await getAllSuppliers();
        setSuppliers(fetchedSuppliers);
        
        // Jeśli tworzymy nowe zamówienie na podstawie PO, pokaż informację
        if (fromPO && poNumber) {
          showInfo(`Tworzenie nowego zamówienia klienta powiązanego z zamówieniem zakupowym: ${poNumber}`);
          
          // Ustaw powiązanie z PO w danych zamówienia
          setOrderData(prev => ({
            ...prev,
            notes: prev.notes ? 
              `${prev.notes}\nPowiązane z zamówieniem zakupowym: ${poNumber}` : 
              `Powiązane z zamówieniem zakupowym: ${poNumber}`,
            // Dodajemy informację o PO do pola linkedPurchaseOrders jeśli mamy ID
            ...(poId ? {
              linkedPurchaseOrders: [
                ...(prev.linkedPurchaseOrders || []),
                { id: poId, number: poNumber, isLinkedFromPO: true }
              ]
            } : {})
          }));
        }
      } catch (error) {
        showError('Błąd podczas ładowania danych: ' + error.message);
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchData();
  }, [orderId, showError, fromPO, poId, poNumber, showInfo]);

  // Funkcja do automatycznego odświeżenia kosztów produkcji przed zapisaniem
  const refreshProductionTasksForSaving = async (orderDataToUpdate) => {
    try {
      if (!orderDataToUpdate.productionTasks || orderDataToUpdate.productionTasks.length === 0) {
        return;
      }

      console.log('Odświeżanie kosztów produkcji przed zapisaniem zamówienia...');

      // Importuj funkcję do pobierania szczegółów zadania
      const { getTaskById } = await import('../../services/productionService');
      const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/costCalculator');
      
      if (orderDataToUpdate.items && orderDataToUpdate.items.length > 0) {
        for (let i = 0; i < orderDataToUpdate.items.length; i++) {
          const item = orderDataToUpdate.items[i];
          
          // Znajdź powiązane zadanie produkcyjne
          const associatedTask = orderDataToUpdate.productionTasks.find(task => 
            task.id === item.productionTaskId
          );
          
          if (associatedTask) {
            try {
              // Pobierz szczegółowe dane zadania z bazy danych
              const taskDetails = await getTaskById(associatedTask.id);
              
              const fullProductionCost = taskDetails.totalFullProductionCost || associatedTask.totalFullProductionCost || 0;
              const productionCost = taskDetails.totalMaterialCost || associatedTask.totalMaterialCost || 0;
              
              // Oblicz koszty jednostkowe z uwzględnieniem logiki listy cenowej
              const calculatedFullProductionUnitCost = calculateFullProductionUnitCost(item, fullProductionCost);
              const calculatedProductionUnitCost = calculateProductionUnitCost(item, productionCost);
              
              // Aktualizuj informacje o zadaniu produkcyjnym w pozycji zamówienia
              orderDataToUpdate.items[i] = {
                ...item,
                productionTaskId: associatedTask.id,
                productionTaskNumber: associatedTask.moNumber || taskDetails.moNumber,
                productionStatus: associatedTask.status || taskDetails.status,
                // Używaj totalMaterialCost jako podstawowy koszt produkcji (tylko materiały wliczane do kosztów)
                productionCost: productionCost,
                // Dodaj pełny koszt produkcji (wszystkie materiały niezależnie od flagi "wliczaj")
                fullProductionCost: fullProductionCost,
                // Dodaj obliczone koszty jednostkowe
                productionUnitCost: calculatedProductionUnitCost,
                fullProductionUnitCost: calculatedFullProductionUnitCost
              };
              
              console.log(`Zaktualizowano koszty dla pozycji ${item.name}: koszt podstawowy = ${orderDataToUpdate.items[i].productionCost}€, pełny koszt = ${orderDataToUpdate.items[i].fullProductionCost}€, pełny koszt/szt = ${calculatedFullProductionUnitCost.toFixed(2)}€ (lista cenowa: ${item.fromPriceList ? 'tak' : 'nie'})`);
            } catch (error) {
              console.error(`Błąd podczas pobierania szczegółów zadania ${associatedTask.id}:`, error);
              
              // W przypadku błędu, użyj podstawowych danych z associatedTask
              const fullProductionCost = associatedTask.totalFullProductionCost || 0;
              const productionCost = associatedTask.totalMaterialCost || 0;
              
              orderDataToUpdate.items[i] = {
                ...item,
                productionTaskId: associatedTask.id,
                productionTaskNumber: associatedTask.moNumber,
                productionStatus: associatedTask.status,
                productionCost: productionCost,
                fullProductionCost: fullProductionCost,
                productionUnitCost: productionCost / (parseFloat(item.quantity) || 1),
                fullProductionUnitCost: fullProductionCost / (parseFloat(item.quantity) || 1)
              };
            }
          }
        }
      }
    } catch (error) {
      console.error('Błąd podczas odświeżania kosztów produkcji:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors);
      window.scrollTo(0, 0); // Przewiń do góry, aby użytkownik widział błędy
      return;
    }
    
    try {
      setSaving(true);
      
      // Walidacja podstawowa
      if (!validateForm()) {
        setSaving(false);
        return;
      }
      
      // Zweryfikuj, czy powiązane zadania produkcyjne istnieją przed zapisaniem
      const verifiedOrderData = await verifyProductionTasks(orderData);
      
      // Automatycznie odśwież koszty produkcji przed zapisaniem
      await refreshProductionTasksForSaving(verifiedOrderData);
      
      // Przygotuj dane zamówienia do zapisania
      const orderToSave = {
        ...verifiedOrderData,
        items: verifiedOrderData.items.map(item => ({ ...item })),
        totalValue: calculateTotal(), // Używamy funkcji która uwzględnia wszystkie składniki: produkty, dostawę, dodatkowe koszty i rabaty
        // Upewniamy się, że daty są poprawne
        orderDate: verifiedOrderData.orderDate ? new Date(verifiedOrderData.orderDate) : new Date(),
        // Zapisujemy deadline jako expectedDeliveryDate w bazie danych
        expectedDeliveryDate: verifiedOrderData.deadline ? new Date(verifiedOrderData.deadline) : null,
        deadline: verifiedOrderData.deadline ? new Date(verifiedOrderData.deadline) : null,
        deliveryDate: verifiedOrderData.deliveryDate ? new Date(verifiedOrderData.deliveryDate) : null
      };

      // Usuń puste pozycje zamówienia
      orderToSave.items = orderToSave.items.filter(item => 
        item.name && item.quantity && item.quantity > 0
      );
      
      let savedOrderId;
      
      if (orderId) {
        await updateOrder(orderId, orderToSave, currentUser.uid);
        savedOrderId = orderId;
        showSuccess('Zamówienie zostało zaktualizowane');
        navigate(`/orders/${savedOrderId}`);
      } else {
        savedOrderId = await createOrder(orderToSave, currentUser.uid);
        showSuccess('Zamówienie zostało utworzone');
        navigate('/orders'); // Zmiana przekierowania na listę zamówień
      }
    } catch (error) {
      console.error('Błąd podczas zapisywania zamówienia:', error);
      showError(`Wystąpił błąd: ${error.message}`);
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
      
      // Sprawdź minimalne ilości zamówienia dla produktów, ale tylko pokazuj informację
      if (item.id && item.itemType === 'product' && !item.isRecipe) {
        const minOrderQuantity = item.minOrderQuantity || 0;
        if (minOrderQuantity > 0 && parseFloat(item.quantity) < minOrderQuantity && item.unit === item.originalUnit) {
          // Nie ustawiamy błędu, tylko pokazujemy informację
          showInfo(`Produkt ${item.name}: Sugerowana minimalna ilość zamówienia to ${minOrderQuantity} ${item.unit}`);
        }
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
    
    if (['orderDate', 'deadline', 'deliveryDate'].includes(name)) {
      console.log(`Zmiana daty ${name}:`, value);
      
      // Dla pól daty, zawsze używamy wartości jako string
      setOrderData(prev => ({ 
        ...prev, 
        [name]: value 
      }));
    } else if (name === 'invoiceDate' && value) {
      console.log(`Zmiana daty faktury na: ${value}`);
      
      // Zapisz datę faktury
      setOrderData(prev => ({ 
        ...prev, 
        [name]: value 
      }));
      
      // Jeśli mamy walutę inną niż EUR dla kosztów dostawy, pobierz kurs z dnia poprzedzającego datę faktury
      const currency = orderData.shippingCurrency;
      if (currency && currency !== 'EUR') {
        try {
          // Pobierz datę poprzedniego dnia dla daty faktury
          const invoiceDate = new Date(value);
          const rateFetchDate = new Date(invoiceDate);
          rateFetchDate.setDate(rateFetchDate.getDate() - 1);
          
          console.log(`Próbuję pobrać kurs dla ${currency}/EUR z dnia ${rateFetchDate.toISOString().split('T')[0]}`);
          
          // Pobierz kurs z API
          getExchangeRate(currency, 'EUR', rateFetchDate)
            .then(rate => {
              console.log(`Pobrany kurs: ${rate}`);
              
              if (rate > 0) {
                // Przelicz wartość dostawy
                const originalValue = orderData.shippingCostOriginal || orderData.shippingCost || 0;
                const convertedValue = originalValue * rate;
                
                // Aktualizuj stan
                setOrderData(prev => ({
                  ...prev,
                  shippingCost: convertedValue,
                  exchangeRate: rate
                }));
              }
            })
            .catch(error => {
              console.error('Błąd podczas pobierania kursu:', error);
            });
        } catch (error) {
          console.error('Błąd podczas przetwarzania daty faktury:', error);
        }
      }
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
          orderAffix: selectedCustomer.orderAffix || '',
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

  const handleProductSelect = async (index, product, type = 'product') => {
    try {
      if (!product) {
        return;
      }
      
      const itemType = type;
      let id = product.id;
      let name = product.name;
      let unit = product.unit || 'szt.';
      let basePrice = 0;
      let price = 0;
      let margin = DEFAULT_MARGIN;
      let isRecipe = type === 'recipe';
      let fromPriceList = false;
      let recipeId = isRecipe ? product.id : null;
      let minOrderQuantity = 0;
      let lastUsageInfo = null;
      
      // Jeżeli mamy klienta, spróbuj pobrać cenę z listy cenowej
      if (orderData.customer?.id) {
        try {
          // Pobierz cenę z listy cenowej klienta, wskazując czy to receptura czy produkt
          const priceListItem = await getPriceForCustomerProduct(orderData.customer.id, product.id, isRecipe);
          
          if (priceListItem) {
            console.log(`Znaleziono cenę w liście cenowej: ${priceListItem} dla ${name} (${isRecipe ? 'receptura' : 'produkt/usługa'})`);
            price = priceListItem;
            fromPriceList = true;
          } else {
            console.log(`Nie znaleziono ceny w liście cenowej dla ${name} (${isRecipe ? 'receptura' : 'produkt/usługa'})`);
          }
        } catch (error) {
          console.error('Błąd podczas pobierania ceny z listy cenowej:', error);
        }
      }
      
      // Jeśli to produkt lub usługa, pobierz jego szczegóły
      if (!isRecipe) {
        try {
          const productDetails = await getProductById(product.id);
          if (productDetails) {
            unit = productDetails.unit || unit;
            minOrderQuantity = productDetails.minOrderQuantity || 0;
            // Jeśli nie mamy ceny z listy cenowej, użyj ceny bazowej produktu
            if (!fromPriceList) {
              basePrice = productDetails.standardPrice || 0;
              
              // Zastosuj marżę do ceny bazowej
              const calculatedPrice = basePrice * (1 + margin / 100);
              price = parseFloat(calculatedPrice.toFixed(2));
            }
          }
        } catch (error) {
          console.error('Błąd podczas pobierania szczegółów produktu/usługi:', error);
        }
      } else {
        // Jeśli to receptura, oblicz koszt produkcji tylko jeśli nie mamy ceny z listy cenowej
        if (!fromPriceList) {
          try {
            // Spróbuj najpierw pobrać recepturę bezpośrednio
            let recipe = await getRecipeById(product.id);
            
            if (!recipe) {
              // Jeśli nie ma receptury o tym ID, spróbuj pobrać recepturę powiązaną z produktem
              recipe = await getRecipeByProductId(product.id);
            }
            
            if (recipe) {
              // Jeśli receptura ma koszt/sztuka (processingCostPerUnit), użyj go bezpośrednio
              if (recipe.processingCostPerUnit !== undefined && recipe.processingCostPerUnit !== null) {
                basePrice = recipe.processingCostPerUnit;
                console.log(`Użyto kosztu/sztuka z receptury: ${basePrice}`);
                
                // Dla receptury spoza listy cenowej użyj bezpośrednio kosztu/sztuka bez marży
                price = parseFloat(basePrice.toFixed(2));
                margin = 0;
              } else {
                // W przeciwnym razie oblicz koszt produkcji
                const cost = await calculateProductionCost(recipe);
                basePrice = cost.totalCost;
                console.log(`Obliczono koszt produkcji receptury: ${basePrice}`);
                
                // Zastosuj marżę do kosztu produkcji
                const calculatedPrice = basePrice * (1 + margin / 100);
                price = parseFloat(calculatedPrice.toFixed(2));
              }
              
              // Pobierz informacje o ostatnim użyciu receptury w zamówieniach
              try {
                lastUsageInfo = await getLastRecipeUsageInfo(recipe.id);
                if (lastUsageInfo) {
                  console.log('Znaleziono informacje o ostatnim użyciu receptury:', lastUsageInfo);
                }
              } catch (error) {
                console.error('Błąd podczas pobierania informacji o ostatnim użyciu receptury:', error);
              }
            }
          } catch (error) {
            console.error('Błąd podczas obliczania kosztu produkcji:', error);
          }
        }
      }
      
      // Aktualizuj stan przedmiotu
      const updatedItems = [...orderData.items];
      updatedItems[index] = {
        ...updatedItems[index],
        id,
        name,
        unit,
        price,
        basePrice,
        margin,
        fromPriceList,
        isRecipe,
        recipeId,
        itemType,
        minOrderQuantity,
        originalUnit: unit,
        lastUsageInfo: lastUsageInfo // Dodajemy informacje o ostatnim użyciu
      };
      
      setOrderData(prev => ({
        ...prev,
        items: updatedItems,
      }));
      
      // Wyczyść błędy walidacji dla tego przedmiotu
      const updatedErrors = { ...validationErrors };
      delete updatedErrors[`item_${index}_name`];
      setValidationErrors(updatedErrors);
      
    } catch (error) {
      console.error('Błąd podczas wyboru produktu/usługi:', error);
      showError(`Wystąpił błąd: ${error.message}`);
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

  // Funkcja obliczająca sumę wartości pozycji z uwzględnieniem kosztów produkcji dla pozycji spoza listy cenowej
  const calculateItemTotalValue = (item) => {
    // Podstawowa wartość pozycji
    const itemValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
    
    // Jeśli produkt jest z listy cenowej, zwracamy tylko wartość pozycji
    if (item.fromPriceList) {
      return itemValue;
    }
    
    // Jeśli produkt nie jest z listy cenowej i ma koszt produkcji, dodajemy go
    if (item.productionTaskId && item.productionCost !== undefined) {
      return itemValue + parseFloat(item.productionCost || 0);
    }
    
    // Domyślnie zwracamy tylko wartość pozycji
    return itemValue;
  };

  // Funkcja obliczająca sumę wartości wszystkich pozycji z uwzględnieniem kosztów produkcji gdzie to odpowiednie
  const calculateTotalItemsValue = () => {
    return orderData.items.reduce((sum, item) => {
      return sum + calculateItemTotalValue(item);
    }, 0);
  };

  // Funkcja do pobierania kursów walut
  const fetchExchangeRates = async () => {
    try {
      setLoadingRates(true);
      // Pobierz wczorajszy kurs dla głównych walut
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      const currencies = ['EUR', 'PLN', 'USD', 'GBP', 'CHF'];
      const baseCurrency = orderData.currency; // Waluta bazowa zamówienia
      
      // Sprawdź, czy baseCurrency jest jedną z obsługiwanych walut
      if (!currencies.includes(baseCurrency)) {
        console.warn(`Nieobsługiwana waluta bazowa: ${baseCurrency}. Używam domyślnej waluty EUR.`);
        setOrderData(prev => ({ ...prev, currency: 'EUR' }));
        return; // Funkcja zostanie ponownie wywołana przez useEffect po zmianie currency
      }
      
      const rates = {};
      // Dodaj kurs 1 dla waluty bazowej
      rates[baseCurrency] = 1;
      
      // Pobierz kursy dla pozostałych walut
      const fetchPromises = currencies
        .filter(currency => currency !== baseCurrency)
        .map(async currency => {
          try {
            const rate = await getExchangeRate(currency, baseCurrency, yesterday);
            if (rate > 0) {
              rates[currency] = rate;
            } else {
              console.error(`Otrzymano nieprawidłowy kurs dla ${currency}/${baseCurrency}: ${rate}`);
              // Nie ustawiamy domyślnego kursu
            }
          } catch (err) {
            console.error(`Błąd podczas pobierania kursu ${currency}/${baseCurrency}:`, err);
            // Nie ustawiamy domyślnego kursu
          }
        });
      
      await Promise.all(fetchPromises);
      
      // Sprawdź, czy mamy kursy dla wszystkich walut, jeśli nie, pokaż komunikat
      const missingCurrencies = currencies
        .filter(currency => currency !== baseCurrency && !rates[currency]);
      
      if (missingCurrencies.length > 0) {
        console.warn(`Brak kursów dla walut: ${missingCurrencies.join(', ')}`);
        showInfo('Nie udało się pobrać kursów dla niektórych walut. Przeliczanie między walutami będzie możliwe po wprowadzeniu daty faktury.');
      }
      
      console.log('Pobrano kursy walut:', rates);
      setExchangeRates(rates);
      
    } catch (error) {
      console.error('Błąd podczas pobierania kursów walut:', error);
      showError('Nie udało się pobrać kursów walut. Przeliczanie między walutami będzie możliwe po wprowadzeniu daty faktury.');
      
      // W przypadku błędu ustawiamy tylko kurs dla waluty bazowej
      const rates = {};
      rates[orderData.currency || 'EUR'] = 1;
      setExchangeRates(rates);
    } finally {
      setLoadingRates(false);
    }
  };
  
  // Pomocnicza funkcja do pobierania domyślnego kursu
  const getDefaultRate = (fromCurrency, toCurrency) => {
    // Zawsze zwracamy 1, ponieważ kursy pobieramy dynamicznie z API
    return 1;
  };
  
  // Pobierz kursy walut przy starcie
  useEffect(() => {
    fetchExchangeRates();
  }, []);
  
  // Funkcja do przeliczania wartości między walutami
  const convertCurrency = (amount, fromCurrency, toCurrency) => {
    if (!amount || amount === 0) return 0;
    if (fromCurrency === toCurrency) return amount;
    
    const rate = exchangeRates[fromCurrency] / exchangeRates[toCurrency];
    if (!rate) {
      console.error(`Brak kursu dla pary walut ${fromCurrency}/${toCurrency}`);
      showInfo('Aby przeliczać waluty, podaj datę faktury.');
      return amount; // Zwracamy oryginalną wartość bez przeliczania, jeśli nie mamy kursu
    }
    
    // Wartość przeliczona bez zaokrąglania
    return amount * rate;
  };

  // Funkcja dodawania nowego dodatkowego kosztu
  const handleAddAdditionalCost = (isDiscount = false) => {
    const newCost = {
      id: Date.now().toString(), // Unikalny identyfikator
      description: isDiscount ? 'Rabat' : 'Dodatkowy koszt',
      value: isDiscount ? 0 : 0,
      vatRate: 23, // Domyślna stawka VAT
      currency: 'EUR', // Domyślna waluta EUR
      originalValue: 0, // Wartość w oryginalnej walucie
      exchangeRate: 1, // Domyślny kurs wymiany
      invoiceNumber: '', // Numer faktury
      invoiceDate: '' // Data faktury
    };
    
    setOrderData(prev => ({
      ...prev,
      additionalCostsItems: [...(prev.additionalCostsItems || []), newCost]
    }));
  };
  
  // Funkcja obsługi zmiany dodatkowych kosztów
  const handleAdditionalCostChange = (id, field, value) => {
    const updatedCosts = (orderData.additionalCostsItems || []).map(item => {
      if (item.id === id) {
        // Dla pola vatRate upewnij się, że nie jest undefined
        if (field === 'vatRate' && value === undefined) {
          value = 23; // Domyślna wartość VAT
        }
        
        // Specjalna obsługa dla zmiany daty faktury
        if (field === 'invoiceDate' && value) {
          try {
            console.log(`Zmiana daty faktury na: ${value}`);
            
            // Formatowanie daty do obsługi przez input type="date"
            const formattedDate = value;
            console.log(`Sformatowana data faktury: ${formattedDate}`);
            
            // Jeśli waluta pozycji jest inna niż waluta zamówienia
            if (item.currency && item.currency !== 'EUR') {
              try {
                // Pobierz datę poprzedniego dnia dla daty faktury
                const invoiceDate = new Date(formattedDate);
                const rateFetchDate = new Date(invoiceDate);
                rateFetchDate.setDate(rateFetchDate.getDate() - 1);
                
                console.log(`Próbuję pobrać kurs dla ${item.currency}/EUR z dnia ${rateFetchDate.toISOString().split('T')[0]}`);
                
                // Używamy getExchangeRate z serwisu kursów walut
                import('../../services/exchangeRateService').then(async ({ getExchangeRate }) => {
                  try {
                    const rate = await getExchangeRate(item.currency, 'EUR', rateFetchDate);
                    console.log(`Pobrany kurs: ${rate}`);
                    
                    if (rate > 0) {
                      // Aktualizuj pozycję z nowym kursem i przeliczoną wartością
                      const originalValue = parseFloat(item.originalValue) || parseFloat(item.value) || 0;
                      const convertedValue = originalValue * rate;
                      
                      const updatedItem = {
                        ...item,
                        invoiceDate: formattedDate,
                        exchangeRate: rate,
                        value: convertedValue.toFixed(2)
                      };
                      
                      // Aktualizuj stan
                      setOrderData(prev => ({
                        ...prev,
                        additionalCostsItems: prev.additionalCostsItems.map(cost => 
                          cost.id === id ? updatedItem : cost
                        )
                      }));
                    } else {
                      // W przypadku błędu, po prostu aktualizuj datę faktury
                      setOrderData(prev => ({
                        ...prev,
                        additionalCostsItems: prev.additionalCostsItems.map(cost => 
                          cost.id === id ? { ...cost, invoiceDate: formattedDate } : cost
                        )
                      }));
                    }
                  } catch (error) {
                    console.error(`Błąd podczas pobierania kursu:`, error);
                    // W przypadku błędu nie zmieniamy kursu, tylko aktualizujemy datę
                    setOrderData(prev => ({
                      ...prev,
                      additionalCostsItems: prev.additionalCostsItems.map(cost => 
                        cost.id === id ? { ...cost, invoiceDate: formattedDate } : cost
                      )
                    }));
                  }
                });
                
                // Zwracamy tymczasową wartość z zaktualizowaną datą faktury
                return { ...item, invoiceDate: formattedDate };
              } catch (error) {
                console.error('Błąd podczas przetwarzania daty faktury:', error);
                return { ...item, invoiceDate: formattedDate };
              }
            } else {
              // Jeśli waluta jest taka sama, po prostu zaktualizuj datę
              return { ...item, invoiceDate: formattedDate };
            }
          } catch (error) {
            console.error('Błąd podczas przetwarzania daty faktury:', error);
            return item;
          }
        }
        
        // Specjalna obsługa dla zmiany waluty
        if (field === 'currency') {
          const newCurrency = value;
          const oldCurrency = item.currency || 'EUR';
          
          // Jeśli zmieniono walutę, przelicz wartość
          if (newCurrency !== oldCurrency) {
            const originalValue = parseFloat(item.originalValue) || parseFloat(item.value) || 0;
            
            // Jeśli mamy datę faktury, spróbuj pobrać kurs z API
            if (item.invoiceDate) {
              try {
                const invoiceDate = new Date(item.invoiceDate);
                const rateFetchDate = new Date(invoiceDate);
                rateFetchDate.setDate(rateFetchDate.getDate() - 1);
                
                console.log(`Pobieranie kursu dla zmiany waluty z datą faktury ${item.invoiceDate}, data kursu: ${rateFetchDate.toISOString().split('T')[0]}`);
                
                // Używamy dynamicznego importu, aby uniknąć błędów cyklicznych importów
                import('../../services/exchangeRateService').then(async ({ getExchangeRate }) => {
                  try {
                    const rate = await getExchangeRate(newCurrency, 'EUR', rateFetchDate);
                    console.log(`Pobrany kurs dla ${newCurrency}/EUR z dnia ${rateFetchDate.toISOString().split('T')[0]}: ${rate}`);
                    
                    if (rate > 0) {
                      // Przelicz wartość
                      const convertedValue = originalValue * rate;
                      
                      // Aktualizuj pozycję z nowym kursem i przeliczoną wartością
                      const updatedItem = {
                        ...item,
                        currency: newCurrency,
                        originalValue: originalValue,
                        exchangeRate: rate,
                        value: convertedValue.toFixed(2)
                      };
                      
                      // Aktualizuj stan
                      setOrderData(prev => ({
                        ...prev,
                        additionalCostsItems: prev.additionalCostsItems.map(cost => 
                          cost.id === id ? updatedItem : cost
                        )
                      }));
                    } else {
                      // W przypadku błędu, zaktualizuj tylko walutę
                      setOrderData(prev => ({
                        ...prev,
                        additionalCostsItems: prev.additionalCostsItems.map(cost => 
                          cost.id === id ? { ...cost, currency: newCurrency, originalValue: originalValue } : cost
                        )
                      }));
                    }
                  } catch (error) {
                    console.error(`Błąd podczas pobierania kursu:`, error);
                    // W przypadku błędu, zaktualizuj tylko walutę
                    setOrderData(prev => ({
                      ...prev,
                      additionalCostsItems: prev.additionalCostsItems.map(cost => 
                        cost.id === id ? { ...cost, currency: newCurrency, originalValue: originalValue } : cost
                      )
                    }));
                  }
                });
                
                // Zwracamy tymczasową wartość z zaktualizowaną walutą
                return { ...item, currency: newCurrency, originalValue: originalValue };
              } catch (error) {
                console.error('Błąd podczas zmiany waluty:', error);
              }
            } else {
              // Jeśli nie mamy daty faktury, nie przeliczamy walut - tylko informujemy użytkownika
              showInfo('Aby przeliczać waluty, podaj datę faktury.');
              return { 
                ...item, 
                currency: newCurrency,
                originalValue: originalValue,
                // Nie zmieniamy wartości value, będzie ona przeliczona po podaniu daty faktury
              };
            }
            
            // Ten kod zostanie wykonany tylko jeśli nie mamy daty faktury i wystąpił błąd w powyższym bloku try-catch
            return { 
              ...item, 
              currency: newCurrency,
              originalValue: originalValue,
              // Nie zmieniamy wartości, dopóki użytkownik nie poda daty faktury
            };
          }
        }
        
        // Specjalna obsługa dla zmiany wartości
        if (field === 'value') {
          const newValue = parseFloat(value) || 0;
          
          // Jeśli waluta pozycji jest inna niż EUR (waluta bazowa)
          if (item.currency && item.currency !== 'EUR') {
            // Zapisz oryginalną wartość
            const originalValue = newValue;
            
            // Jeśli mamy datę faktury i kurs wymiany, użyj ich
            if (item.invoiceDate && item.exchangeRate && parseFloat(item.exchangeRate) > 0) {
              const rate = parseFloat(item.exchangeRate);
              const convertedValue = originalValue * rate;
              
              return { 
                ...item, 
                originalValue: originalValue,
                value: convertedValue.toFixed(2)
              };
            } else {
              // Jeśli nie mamy daty faktury lub kursu, nie przeliczamy - zapisujemy oryginalną wartość
              // i czekamy na datę faktury
              return { 
                ...item, 
                originalValue: originalValue,
                value: originalValue // Tymczasowo przechowujemy tę samą wartość - zostanie przeliczona po podaniu daty faktury
              };
            }
          } else {
            // Jeśli waluta to EUR, obie wartości są takie same
            return { 
              ...item, 
              originalValue: newValue,
              value: newValue
            };
          }
        }
        
        // Standardowa obsługa innych pól
        return { ...item, [field]: value };
      }
      return item;
    });
    
    setOrderData(prev => ({ ...prev, additionalCostsItems: updatedCosts }));
  };
  
  // Funkcja usuwania pozycji dodatkowych kosztów
  const handleRemoveAdditionalCost = (id) => {
    setOrderData(prev => ({
      ...prev,
      additionalCostsItems: (prev.additionalCostsItems || []).filter(item => item.id !== id)
    }));
  };
  
  // Funkcja obliczająca sumę dodatkowych kosztów (dodatnich)
  const calculateAdditionalCosts = () => {
    if (!orderData.additionalCostsItems || orderData.additionalCostsItems.length === 0) {
      return 0;
    }
    
    return orderData.additionalCostsItems.reduce((sum, cost) => {
      const value = parseFloat(cost.value) || 0;
      return sum + (value > 0 ? value : 0);
    }, 0);
  };

  // Funkcja obliczająca sumę rabatów (wartości ujemne)
  const calculateDiscounts = () => {
    if (!orderData.additionalCostsItems || orderData.additionalCostsItems.length === 0) {
      return 0;
    }
    
    return Math.abs(orderData.additionalCostsItems.reduce((sum, cost) => {
      const value = parseFloat(cost.value) || 0;
      return sum + (value < 0 ? value : 0);
    }, 0));
  };

  const calculateTotal = () => {
    const subtotal = calculateTotalItemsValue();
    const shippingCost = parseFloat(orderData.shippingCost) || 0;
    const additionalCosts = calculateAdditionalCosts();
    const discounts = calculateDiscounts();
    // Nie uwzględniamy wartości PO w całkowitej wartości zamówienia
    return subtotal + shippingCost + additionalCosts - discounts;
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
        
        // Oblicz wymaganą ilość i zaokrąglij do 3 miejsc po przecinku dla uniknięcia błędów IEEE 754
        const calculatedQuantity = parseFloat(ingredient.quantity) * scaleFactor;
        const requiredQuantity = parseFloat(calculatedQuantity.toFixed(3));
        
        // Znajdź istniejący materiał lub dodaj nowy
        const existingIndex = allMaterials.findIndex(m => m.id === ingredient.id);
        
        if (existingIndex >= 0) {
          // Dodaj zaokrągloną wartość
          allMaterials[existingIndex].quantity = parseFloat((allMaterials[existingIndex].quantity + requiredQuantity).toFixed(3));
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
          deadline: orderData.deadline || '',
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
    if (!orderId) return;
    
    try {
      setRefreshingPOs(true);
      
      // Pobierz aktualne dane zamówienia z bazy danych
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
    } catch (error) {
      console.error('Błąd podczas odświeżania powiązanych zamówień zakupu:', error);
      showError('Nie udało się odświeżyć danych zamówień zakupu: ' + error.message);
    } finally {
      setRefreshingPOs(false);
    }
  };
  
  // Funkcja do odświeżania danych zadań produkcyjnych, w tym kosztów produkcji
  const refreshProductionTasks = async () => {
    try {
      setLoading(true);
      
      // Pobierz aktualne dane zamówienia z bazy danych
      const refreshedOrderData = await getOrderById(orderId);
      
      // Importuj funkcję do pobierania szczegółów zadania
      const { getTaskById } = await import('../../services/productionService');
      const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/costCalculator');
      
      const updatedItems = [...refreshedOrderData.items];
      
      if (refreshedOrderData.productionTasks && refreshedOrderData.productionTasks.length > 0) {
        for (let i = 0; i < updatedItems.length; i++) {
          const item = updatedItems[i];
          
          // Znajdź powiązane zadanie produkcyjne
          const taskToUse = refreshedOrderData.productionTasks.find(task => 
            task.id === item.productionTaskId || 
            (task.productName === item.name && task.quantity == item.quantity)
          );
          
          if (taskToUse) {
            try {
              // Pobierz szczegółowe dane zadania z bazy danych
              const taskDetails = await getTaskById(taskToUse.id);
              
              const fullProductionCost = taskDetails.totalFullProductionCost || taskToUse.totalFullProductionCost || 0;
              const productionCost = taskDetails.totalMaterialCost || taskToUse.totalMaterialCost || 0;
              
              // Oblicz koszty jednostkowe z uwzględnieniem logiki listy cenowej
              const calculatedFullProductionUnitCost = calculateFullProductionUnitCost(item, fullProductionCost);
              const calculatedProductionUnitCost = calculateProductionUnitCost(item, productionCost);
              
              // Aktualizuj informacje o zadaniu produkcyjnym w elemencie zamówienia
              updatedItems[i] = {
                ...item,
                productionTaskId: taskToUse.id,
                productionTaskNumber: taskToUse.moNumber || taskDetails.moNumber,
                productionStatus: taskToUse.status || taskDetails.status,
                // Używaj totalMaterialCost jako podstawowy koszt produkcji (tylko materiały wliczane do kosztów)
                productionCost: productionCost,
                // Dodaj pełny koszt produkcji (wszystkie materiały niezależnie od flagi "wliczaj")
                fullProductionCost: fullProductionCost,
                // Dodaj obliczone koszty jednostkowe
                productionUnitCost: calculatedProductionUnitCost,
                fullProductionUnitCost: calculatedFullProductionUnitCost
              };
              
              console.log(`Przypisano zadanie produkcyjne ${taskToUse.moNumber} do elementu zamówienia ${item.name} z kosztem ${updatedItems[i].productionCost}€ (pełny koszt: ${updatedItems[i].fullProductionCost}€, pełny koszt/szt: ${calculatedFullProductionUnitCost.toFixed(2)}€, lista cenowa: ${item.fromPriceList ? 'tak' : 'nie'})`);
            } catch (error) {
              console.error(`Błąd podczas pobierania szczegółów zadania ${taskToUse.id}:`, error);
              
              // W przypadku błędu, użyj podstawowych danych z taskToUse
              const fullProductionCost = taskToUse.totalFullProductionCost || 0;
              const productionCost = taskToUse.totalMaterialCost || 0;
              
              updatedItems[i] = {
                ...item,
                productionTaskId: taskToUse.id,
                productionTaskNumber: taskToUse.moNumber,
                productionStatus: taskToUse.status,
                productionCost: productionCost,
                fullProductionCost: fullProductionCost,
                productionUnitCost: productionCost / (parseFloat(item.quantity) || 1),
                fullProductionUnitCost: fullProductionCost / (parseFloat(item.quantity) || 1)
              };
            }
          } else {
            console.log(`Nie znaleziono dopasowanego zadania dla elementu ${item.name}`);
          }
        }
        
        setOrderData(prev => ({
          ...prev,
          items: updatedItems,
          productionTasks: refreshedOrderData.productionTasks
        }));
        
        // Automatycznie zapisz zaktualizowane dane kosztów w bazie danych (jeśli zamówienie istnieje)
        if (orderId) {
          try {
            console.log('Zapisywanie zaktualizowanych kosztów produkcji w bazie danych...');
            const orderToUpdate = {
              ...refreshedOrderData,
              items: updatedItems
            };
            
            await updateOrder(orderId, orderToUpdate, currentUser.uid);
            console.log('Koszty produkcji zostały zapisane w bazie danych');
          } catch (error) {
            console.error('Błąd podczas zapisywania kosztów produkcji:', error);
            showError('Nie udało się zapisać kosztów produkcji w bazie danych');
          }
        }
      } else {
        setOrderData(prev => ({
          ...prev,
          items: updatedItems,
          productionTasks: refreshedOrderData.productionTasks || []
        }));
      }
      
      showSuccess('Dane zadań produkcyjnych zostały odświeżone');
    } catch (error) {
      console.error('Błąd podczas odświeżania zadań produkcyjnych:', error);
      showError('Nie udało się odświeżyć danych zadań produkcyjnych');
    } finally {
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

  const handleDriveLinkDialogOpen = () => {
    setDriveLinkDialogOpen(true);
  };

  const handleDriveLinkDialogClose = () => {
    setDriveLinkDialogOpen(false);
    setDriveLink('');
  };

  const handleDriveLinkChange = (e) => {
    setDriveLink(e.target.value);
  };

  const handleDriveLinkSubmit = () => {
    if (!driveLink) {
      showError('Wprowadź prawidłowy link do Google Drive');
      return;
    }

    // Sprawdzamy czy link jest do Google Drive
    if (!driveLink.includes('drive.google.com')) {
      showError('Link musi być z Google Drive');
      return;
    }

    setOrderData(prev => ({
      ...prev,
      deliveryProof: driveLink,
      deliveryProofType: 'link' // Dodajemy informację o typie dowodu
    }));

    showSuccess('Link do Google Drive dodany jako dowód dostawy');
    handleDriveLinkDialogClose();
  };

  const isImageUrl = (url) => {
    return url && (
      url.endsWith('.jpg') || 
      url.endsWith('.jpeg') || 
      url.endsWith('.png') || 
      url.endsWith('.gif') || 
      url.endsWith('.bmp') ||
      url.startsWith('data:image/')
    );
  };

  const isGoogleDriveLink = (url) => {
    return url && url.includes('drive.google.com');
  };

  // Funkcja sprawdzająca czy zadania produkcyjne istnieją i usuwająca nieistniejące referencje
  const verifyProductionTasks = async (orderToVerify) => {
    if (!orderToVerify || !orderToVerify.productionTasks || orderToVerify.productionTasks.length === 0) {
      return orderToVerify;
    }

    try {
      const { getTaskById, updateTask } = await import('../../services/productionService');
      const { removeProductionTaskFromOrder, updateProductionTaskInOrder } = await import('../../services/orderService');
      
      const verifiedTasks = [];
      const tasksToRemove = [];
      
      console.log("Weryfikacja zadań produkcyjnych dla zamówienia:", orderToVerify.id);
      
      // Sprawdź każde zadanie produkcyjne
      for (const task of orderToVerify.productionTasks) {
        try {
          // Próba pobrania zadania z bazy
          const taskDetails = await getTaskById(task.id);
          
          // Sprawdź, czy task ma orderItemId ustawiony
          if (task.orderItemId && (!taskDetails.orderItemId || taskDetails.orderItemId !== task.orderItemId)) {
            console.log(`Aktualizacja orderItemId w zadaniu ${task.id} na ${task.orderItemId}`);
            await updateTask(task.id, {
              orderItemId: task.orderItemId,
              orderId: orderToVerify.id,
              orderNumber: orderToVerify.orderNumber || null
            }, currentUser?.uid || 'system');
          }
          
          // Sprawdź, czy w zamówieniu jest element pasujący do tego zadania
          if (task.orderItemId && orderToVerify.items) {
            const matchingItem = orderToVerify.items.find(item => item.id === task.orderItemId);
            
            if (!matchingItem) {
              console.log(`Nie znaleziono pozycji zamówienia ${task.orderItemId} dla zadania ${task.id}`);
              
              // Jeśli nie ma pasującego elementu zamówienia, spróbuj znaleźć według nazwy i ilości
              const alternativeItem = orderToVerify.items.find(item => 
                item.name === task.productName && 
                parseFloat(item.quantity) === parseFloat(task.quantity) &&
                !orderToVerify.productionTasks.some(t => 
                  t.id !== task.id && // nie to samo zadanie
                  t.orderItemId === item.id // już przypisane do innego zadania
                )
              );
              
              if (alternativeItem) {
                console.log(`Znaleziono alternatywną pozycję zamówienia ${alternativeItem.id} dla zadania ${task.id}`);
                
                // Aktualizuj orderItemId w zadaniu
                await updateTask(task.id, {
                  orderItemId: alternativeItem.id,
                  orderId: orderToVerify.id,
                  orderNumber: orderToVerify.orderNumber || null
                }, currentUser?.uid || 'system');
                
                // Aktualizuj task lokalnie
                task.orderItemId = alternativeItem.id;
                
                // Aktualizuj orderItemId w tabeli productionTasks
                if (orderToVerify.id) {
                  await updateProductionTaskInOrder(orderToVerify.id, task.id, {
                    orderItemId: alternativeItem.id
                  }, currentUser?.uid || 'system');
                }
              }
            }
          }
          
          verifiedTasks.push(task);
        } catch (error) {
          console.error(`Błąd podczas weryfikacji zadania ${task.id}:`, error);
          tasksToRemove.push(task);
          
          // Aktualizuj też powiązane elementy zamówienia
          if (orderToVerify.items) {
            orderToVerify.items = orderToVerify.items.map(item => {
              if (item.productionTaskId === task.id) {
                return {
                  ...item,
                  productionTaskId: null,
                  productionTaskNumber: null,
                  productionStatus: null,
                  productionCost: 0
                };
              }
              return item;
            });
          }
        }
      }
      
      // Jeśli znaleziono nieistniejące zadania, usuń ich referencje z zamówienia
      if (tasksToRemove.length > 0) {
        if (orderToVerify.id) {
          for (const task of tasksToRemove) {
            try {
              await removeProductionTaskFromOrder(orderToVerify.id, task.id);
              console.log(`Usunięto nieistniejące zadanie ${task.id} (${task.moNumber}) z zamówienia ${orderToVerify.id}`);
            } catch (error) {
              console.error(`Błąd podczas usuwania referencji do zadania ${task.id}:`, error);
            }
          }
        }
        
        // Zaktualizuj dane zamówienia lokalnie
        const updatedOrder = {
          ...orderToVerify,
          productionTasks: verifiedTasks
        };
        
        showInfo(`Usunięto ${tasksToRemove.length} nieistniejących zadań produkcyjnych z zamówienia.`);
        return updatedOrder;
      }
      
      return orderToVerify;
    } catch (error) {
      console.error('Błąd podczas weryfikacji zadań produkcyjnych:', error);
      return orderToVerify;
    }
  };

  // Funkcja pomocnicza do formatowania daty dla wyświetlenia
  const formatDateToDisplay = (date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pl-PL');
  };

  // Funkcja pomocnicza do formatowania kwoty waluty
  const formatCurrency = (amount) => {
    if (amount === undefined || amount === null) return '';
    return new Intl.NumberFormat('pl-PL', { 
      style: 'currency', 
      currency: 'EUR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2 
    }).format(amount);
  };

  // Funkcja do odświeżania ceny jednostkowej pozycji
  const refreshItemPrice = async (index) => {
    try {
      const item = orderData.items[index];
      if (!item || !item.id) {
        showError("Nie można odświeżyć ceny - brak identyfikatora produktu");
        return;
      }
      
      let price = 0;
      let fromPriceList = false;
      
      // Sprawdź najpierw cenę z listy cenowej klienta, jeśli klient istnieje
      if (orderData.customer?.id) {
        try {
          const priceListItem = await getPriceForCustomerProduct(orderData.customer.id, item.id, item.isRecipe);
          
          if (priceListItem) {
            console.log(`Znaleziono cenę w liście cenowej: ${priceListItem} dla ${item.name}`);
            price = priceListItem;
            fromPriceList = true;
          }
        } catch (error) {
          console.error('Błąd podczas pobierania ceny z listy cenowej:', error);
        }
      }
      
      // Jeśli nie znaleziono ceny w liście cenowej
      if (!fromPriceList) {
        // Dla produktu/usługi
        if (!item.isRecipe && item.itemType !== 'recipe') {
          try {
            const productDetails = await getProductById(item.id);
            if (productDetails) {
              const basePrice = productDetails.standardPrice || 0;
              const margin = item.margin || DEFAULT_MARGIN;
              
              // Zastosuj marżę do ceny bazowej
              const calculatedPrice = basePrice * (1 + margin / 100);
              price = parseFloat(calculatedPrice.toFixed(2));
            }
          } catch (error) {
            console.error('Błąd podczas pobierania szczegółów produktu/usługi:', error);
          }
        } else {
          // Dla receptury
          try {
            // Spróbuj pobrać recepturę
            let recipe = await getRecipeById(item.recipeId || item.id);
            
            if (!recipe) {
              // Jeśli nie ma receptury o tym ID, spróbuj pobrać recepturę powiązaną z produktem
              recipe = await getRecipeByProductId(item.id);
            }
            
            if (recipe) {
              // Jeśli receptura ma koszt/sztuka, użyj go bezpośrednio
              if (recipe.processingCostPerUnit !== undefined && recipe.processingCostPerUnit !== null) {
                price = parseFloat(recipe.processingCostPerUnit.toFixed(2));
              } else {
                // W przeciwnym razie oblicz koszt produkcji
                const cost = await calculateProductionCost(recipe);
                const basePrice = cost.totalCost;
                const margin = item.margin || 0;
                
                // Zastosuj marżę do kosztu produkcji
                const calculatedPrice = basePrice * (1 + margin / 100);
                price = parseFloat(calculatedPrice.toFixed(2));
              }
              
              // Odśwież również informacje o ostatnim użyciu receptury
              try {
                const lastUsageInfo = await getLastRecipeUsageInfo(recipe.id);
                if (lastUsageInfo) {
                  // Aktualizuj informacje o ostatnim użyciu
                  const updatedItems = [...orderData.items];
                  updatedItems[index] = {
                    ...updatedItems[index],
                    lastUsageInfo
                  };
                  
                  setOrderData(prev => ({
                    ...prev,
                    items: updatedItems,
                  }));
                }
              } catch (error) {
                console.error('Błąd podczas pobierania informacji o ostatnim użyciu receptury:', error);
              }
            }
          } catch (error) {
            console.error('Błąd podczas obliczania kosztu produkcji:', error);
          }
        }
      }
      
      // Aktualizuj cenę pozycji
      const updatedItems = [...orderData.items];
      updatedItems[index] = {
        ...updatedItems[index],
        price,
        fromPriceList
      };
      
      setOrderData(prev => ({
        ...prev,
        items: updatedItems,
      }));
      
      showSuccess('Cena jednostkowa została zaktualizowana');
    } catch (error) {
      console.error('Błąd podczas odświeżania ceny:', error);
      showError(`Wystąpił błąd: ${error.message}`);
    }
  };

  // Dodanie stylów dla responsywności pól
  const inputSx = {
    '& .MuiOutlinedInput-root': { 
      borderRadius: '8px',
      minWidth: { xs: '100px', sm: '120px' }
    },
    '& .MuiInputBase-input': {
      minWidth: { xs: '60px', sm: '80px' }
    }
  };
  
  const tableCellSx = {
    minWidth: { xs: '80px', sm: '100px' },
    whiteSpace: 'normal',
    wordBreak: 'break-word'
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
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
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
          <Box sx={{ mb: 3, p: 2, bgcolor: 'primary.light', borderRadius: 1, color: 'primary.contrastText', boxShadow: 1 }}>
            <Typography variant="subtitle1" fontWeight="bold">
              Numer zamówienia klienta: {orderData.orderNumber}
            </Typography>
          </Box>
        )}
        
        <Paper sx={{ p: 3, mb: 3, boxShadow: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center' }}>
              <PersonIcon sx={{ mr: 1 }} /> Dane podstawowe
            </Typography>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Status zamówienia</InputLabel>
              <Select
                name="status"
                value={orderData.status}
                onChange={handleChange}
                label="Status zamówienia"
                sx={{ minWidth: { xs: '120px', sm: '200px' } }}
              >
                {ORDER_STATUSES.map(status => (
                  <MenuItem key={status.value} value={status.value}>
                    {status.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          
          <Divider sx={{ mb: 3 }} />
          
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
                        variant="outlined"
                        sx={inputSx}
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
                value={ensureDateInputFormat(orderData.orderDate)}
                onChange={handleChange}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                error={!!validationErrors.orderDate}
                helperText={validationErrors.orderDate}
                variant="outlined"
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="customer_email"
                label="Email klienta"
                value={orderData.customer.email || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                variant="outlined"
                sx={inputSx}
                InputProps={{
                  startAdornment: <InputAdornment position="start">@</InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="customer_phone"
                label="Telefon klienta"
                value={orderData.customer.phone || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                variant="outlined"
                sx={inputSx}
                InputProps={{
                  startAdornment: <InputAdornment position="start">📞</InputAdornment>,
                }}
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
                variant="outlined"
                sx={inputSx}
                InputProps={{
                  startAdornment: <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1.5 }}>📍</InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              {/* Pole deadline jest używane w UI, ale w bazie danych zapisywane jako expectedDeliveryDate */}
              <TextField
                type="date"
                label="Oczekiwana data dostawy"
                name="deadline"
                value={ensureDateInputFormat(orderData.deadline)}
                onChange={handleChange}
                fullWidth
                InputLabelProps={{ shrink: true }}
                helperText="Data kiedy zamówienie ma być dostarczone do klienta"
                variant="outlined"
                sx={inputSx}
              />
            </Grid>
          </Grid>
        </Paper>

        <Paper sx={{ p: 3, mb: 3, boxShadow: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center' }}>
              <ShoppingCartIcon sx={{ mr: 1 }} /> Produkty
            </Typography>
            <Button 
              variant="contained" 
              startIcon={<AddIcon />} 
              onClick={addItem}
              color="secondary"
              sx={{ borderRadius: 2 }}
            >
              Dodaj produkt
            </Button>
          </Box>
          
          <Divider sx={{ mb: 3 }} />
          
          <TableContainer component={Paper} sx={{ mb: 2, boxShadow: 1, borderRadius: 1, overflow: 'auto' }}>
            <Table>
              <TableHead sx={{ bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'grey.100' }}>
                <TableRow>
                  <TableCell width="25%" sx={tableCellSx}>Produkt / Receptura</TableCell>
                  <TableCell width="8%" sx={tableCellSx}>Ilość</TableCell>
                  <TableCell width="8%" sx={tableCellSx}>Jedn.</TableCell>
                  <TableCell width="10%" sx={tableCellSx}>Cena EUR</TableCell>
                  <TableCell width="10%" sx={tableCellSx}>Wartość</TableCell>
                  <TableCell width="5%" sx={tableCellSx}>Z listy</TableCell>
                  <TableCell width="10%" sx={tableCellSx}>
                    Zadanie produkcyjne
                    <Tooltip title="Odśwież status zadań produkcyjnych">
                      <IconButton 
                        size="small" 
                        color="primary"
                        onClick={refreshProductionTasks}
                        disabled={refreshingPTs}
                      >
                        <RefreshIcon fontSize="small" />
                        {refreshingPTs && <CircularProgress size={24} sx={{ position: 'absolute' }} />}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                  <TableCell width="10%" sx={tableCellSx}>Koszt produkcji</TableCell>
                  <TableCell width="10%" sx={tableCellSx}>Profit</TableCell>
                  <TableCell width="10%" sx={tableCellSx}>Ostatni koszt</TableCell>
                  <TableCell width="10%" sx={tableCellSx}>Suma wartości pozycji</TableCell>
                  <TableCell width="10%" sx={tableCellSx}>Koszt całk./szt.</TableCell>
                  <TableCell width="10%" sx={tableCellSx}>
                    <Tooltip title="Pełny koszt produkcji na jednostkę (wszystkie materiały niezależnie od flagi 'wliczaj')">
                      Pełny koszt prod./szt.
                    </Tooltip>
                  </TableCell>
                  <TableCell width="5%" sx={tableCellSx}></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orderData.items.map((item, index) => (
                  <TableRow key={index} sx={{ 
                    '&:nth-of-type(odd)': { 
                      bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : 'background.paper' 
                    },
                    '&:nth-of-type(even)': { 
                      bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'grey.50' 
                    },
                    '&:hover': {
                      bgcolor: 'action.hover'
                    }
                  }}>
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
                        <ToggleButton value="service" size="small">
                          Usługa
                        </ToggleButton>
                      </ToggleButtonGroup>
                      
                      {(item.itemType === 'service') ? (
                        <Autocomplete
                          options={services}
                          getOptionLabel={(option) => option.name || ''}
                          value={services.find(s => s.id === item.id) || null}
                          onChange={(_, newValue) => handleProductSelect(index, newValue, 'service')}
                          renderInput={(params) => (
                            <TextField 
                              {...params} 
                              label="Usługa"
                              size="small"
                              error={!!validationErrors[`item_${index}_name`]}
                              helperText={validationErrors[`item_${index}_name`]}
                            />
                          )}
                        />
                      ) : (item.itemType === 'recipe' || item.isRecipe) ? (
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
                      ) : (
                        <TextField
                          label="Nazwa produktu"
                          value={item.name}
                          onChange={(e) => handleItemChange(index, 'name', e.target.value)}
                          fullWidth
                          error={!!validationErrors[`item_${index}_name`]}
                          helperText={validationErrors[`item_${index}_name`]}
                          size="small"
                          variant="outlined"
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
                        size="small"
                        variant="outlined"
                        sx={inputSx}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        value={item.unit}
                        onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                        fullWidth
                        size="small"
                        variant="outlined"
                        sx={inputSx}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        value={item.price}
                        onChange={(e) => handleItemChange(index, 'price', e.target.value)}
                        InputProps={{
                          startAdornment: <InputAdornment position="start">EUR</InputAdornment>,
                          endAdornment: (
                            <InputAdornment position="end">
                              <Tooltip title="Odśwież cenę jednostkową">
                                <IconButton
                                  aria-label="odśwież cenę"
                                  onClick={() => refreshItemPrice(index)}
                                  edge="end"
                                  size="small"
                                >
                                  <RefreshIcon fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            </InputAdornment>
                          ),
                        }}
                        inputProps={{ min: 0, step: 'any' }}
                        fullWidth
                        error={!!validationErrors[`item_${index}_price`]}
                        helperText={validationErrors[`item_${index}_price`]}
                        size="small"
                        variant="outlined"
                        sx={inputSx}
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ fontWeight: 'bold' }}>
                        {formatCurrency(item.quantity * item.price)}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Chip 
                        label={item.fromPriceList ? "Tak" : "Nie"} 
                        size="small" 
                        color={item.fromPriceList ? "success" : "default"}
                        variant={item.fromPriceList ? "filled" : "outlined"}
                        sx={{ borderRadius: 1 }}
                      />
                    </TableCell>
                    <TableCell>
                      {item.productionTaskId ? (
                        <Tooltip title="Przejdź do zadania produkcyjnego">
                          <Chip
                            label={item.productionTaskNumber || `MO-${item.productionTaskId.substr(0, 6)}`}
                            size="small"
                            color={
                              item.productionStatus === 'Zakończone' ? 'success' :
                              item.productionStatus === 'W trakcie' ? 'warning' :
                              item.productionStatus === 'Anulowane' ? 'error' :
                              item.productionStatus === 'Zaplanowane' ? 'primary' : 'default'
                            }
                            onClick={() => navigate(`/production/${item.productionTaskId}`)}
                            sx={{ cursor: 'pointer', borderRadius: 1 }}
                            icon={<EventNoteIcon />}
                          />
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {item.productionTaskId && item.productionCost !== undefined ? (
                        <Box sx={{ fontWeight: 'medium', color: 'text.secondary' }}>
                          {formatCurrency(item.productionCost)}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      {item.fromPriceList && item.productionCost !== undefined ? (
                        <Box sx={{ 
                          fontWeight: 'medium', 
                          color: (item.quantity * item.price - item.productionCost) > 0 ? 'success.main' : 'error.main' 
                        }}>
                          {formatCurrency(item.quantity * item.price - item.productionCost)}
                        </Box>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      {item.lastUsageInfo ? (
                        <Tooltip title={`Data: ${formatDateToDisplay(item.lastUsageInfo.date)}, Ostatni koszt: ${formatCurrency(item.lastUsageInfo.cost)}`}>
                          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">
                              {formatDateToDisplay(item.lastUsageInfo.date)}
                            </Typography>
                            <Typography variant="body2" fontWeight="medium" sx={{ color: 'purple' }}>
                              {formatCurrency(item.lastUsageInfo.cost)}
                            </Typography>
                          </Box>
                        </Tooltip>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Box sx={{ fontWeight: 'bold', color: 'success.main' }}>
                        {formatCurrency(calculateItemTotalValue(item))}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ fontWeight: 'medium' }}>
                        {(() => {
                          // Oblicz proporcję wartości tej pozycji do całkowitej wartości produktów
                          const itemTotalValue = calculateItemTotalValue(item);
                          const allItemsValue = calculateTotalItemsValue();
                          const proportion = allItemsValue > 0 ? itemTotalValue / allItemsValue : 0;
                          
                          // Oblicz proporcjonalny udział w kosztach dodatkowych
                          const shippingCost = parseFloat(orderData.shippingCost) || 0;
                          const additionalCosts = calculateAdditionalCosts();
                          const discounts = calculateDiscounts();
                          
                          // Całkowity udział pozycji w kosztach dodatkowych
                          const additionalShare = proportion * (shippingCost + additionalCosts - discounts);
                          
                          // Całkowity koszt pozycji z kosztami dodatkowymi
                          const totalWithAdditional = itemTotalValue + additionalShare;
                          
                          // Koszt pojedynczej sztuki
                          const quantity = parseFloat(item.quantity) || 1;
                          const unitCost = totalWithAdditional / quantity;
                          
                          return formatCurrency(unitCost);
                        })()}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      {(() => {
                        // Sprawdź czy pozycja ma powiązane zadanie produkcyjne i pełny koszt produkcji
                        if (item.productionTaskId && item.fullProductionCost !== undefined) {
                          // Użyj zapisanej wartości fullProductionUnitCost, jeśli istnieje
                          if (item.fullProductionUnitCost !== undefined && item.fullProductionUnitCost !== null) {
                            return (
                              <Box sx={{ fontWeight: 'medium', color: 'primary.main' }}>
                                {formatCurrency(item.fullProductionUnitCost)}
                              </Box>
                            );
                          }
                          
                          // Jeśli brak zapisanej wartości, oblicz na podstawie fullProductionCost (fallback)
                          const quantity = parseFloat(item.quantity) || 1;
                          const price = parseFloat(item.price) || 0;
                          
                          // Jeśli pozycja jest z listy cenowej, nie dodawaj ceny jednostkowej do pełnego kosztu
                          const unitFullProductionCost = item.fromPriceList 
                            ? parseFloat(item.fullProductionCost) / quantity
                            : (parseFloat(item.fullProductionCost) / quantity) + price;
                          
                          return (
                            <Box sx={{ fontWeight: 'medium', color: 'warning.main' }}>
                              {formatCurrency(unitFullProductionCost)}
                            </Box>
                          );
                        } else {
                          return <Typography variant="body2" color="text.secondary">-</Typography>;
                        }
                      })()}
                    </TableCell>
                    <TableCell>
                      <IconButton 
                        color="error" 
                        onClick={() => removeItem(index)}
                        disabled={orderData.items.length === 1}
                        size="small"
                      >
                        <DeleteIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, bgcolor: 'success.light', p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: 'success.contrastText' }}>
              Suma: {formatCurrency(calculateTotalItemsValue())}
            </Typography>
          </Box>
        </Paper>

        <Paper sx={{ p: 3, mb: 3, boxShadow: 2, borderRadius: 2 }}>
          <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center' }}>
            <LocalShippingIcon sx={{ mr: 1 }} /> Płatność i dostawa
          </Typography>
          <Divider sx={{ mb: 3 }} />
          
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth>
                <InputLabel>Metoda płatności</InputLabel>
                <Select
                  name="paymentMethod"
                  value={orderData.paymentMethod || 'Przelew'}
                  onChange={handleChange}
                  label="Metoda płatności"
                  variant="outlined"
                  sx={inputSx}
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
                  variant="outlined"
                  sx={inputSx}
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
                variant="outlined"
                sx={inputSx}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><LocalShippingIcon fontSize="small" /></InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <TextField
                  name="shippingCost"
                  label="Koszt dostawy"
                  type="number"
                  value={orderData.shippingCostOriginal !== undefined ? orderData.shippingCostOriginal : orderData.shippingCost || 0}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0;
                    const currency = orderData.shippingCurrency || 'EUR';
                    
                    if (currency === 'EUR') {
                      setOrderData(prev => ({
                        ...prev,
                        shippingCost: value,
                        shippingCostOriginal: value
                      }));
                    } else {
                      // Przeliczenie waluty na EUR
                      const convertedValue = convertCurrency(value, currency, 'EUR');
                      setOrderData(prev => ({
                        ...prev,
                        shippingCost: convertedValue,
                        shippingCostOriginal: value
                      }));
                    }
                  }}
                  fullWidth
                  inputProps={{ min: 0, step: 'any' }}
                  variant="outlined"
                  sx={{ flex: 1, mr: 1, ...inputSx }}
                />
                <FormControl variant="outlined" sx={{ minWidth: 80 }}>
                  <InputLabel>Waluta</InputLabel>
                  <Select
                    value={orderData.shippingCurrency || 'EUR'}
                    onChange={(e) => {
                      const newCurrency = e.target.value;
                      const oldCurrency = orderData.shippingCurrency || 'EUR';
                      const originalValue = orderData.shippingCostOriginal !== undefined ? 
                        orderData.shippingCostOriginal : 
                        orderData.shippingCost || 0;
                      
                      if (newCurrency === oldCurrency) {
                        setOrderData(prev => ({
                          ...prev,
                          shippingCurrency: newCurrency
                        }));
                        return;
                      }
                      
                      // Przelicz wartość na nową walutę tylko jeśli mamy datę faktury i kurs
                      if (orderData.invoiceDate) {
                        if (newCurrency === 'EUR') {
                          // Jeśli zmieniamy na EUR, używamy bezpośrednio przeliczonej wartości
                          if (orderData.exchangeRate) {
                            setOrderData(prev => ({
                              ...prev,
                              shippingCurrency: 'EUR',
                              shippingCost: originalValue * orderData.exchangeRate,
                              shippingCostOriginal: originalValue * orderData.exchangeRate
                            }));
                          } else {
                            // Jeśli nie mamy kursu, zachowujemy wartość bez przeliczania
                            setOrderData(prev => ({
                              ...prev,
                              shippingCurrency: 'EUR',
                              shippingCost: originalValue,
                              shippingCostOriginal: originalValue
                            }));
                          }
                        } else if (oldCurrency === 'EUR') {
                          // Jeśli zmieniamy z EUR na inną walutę
                          // Nie przeliczamy, tylko zapamiętujemy wartość EUR jako oryginalną
                          setOrderData(prev => ({
                            ...prev,
                            shippingCurrency: newCurrency,
                            shippingCost: originalValue, // Tymczasowo bez przeliczania - kurs zostanie pobrany po podaniu daty faktury
                            shippingCostOriginal: originalValue
                          }));
                        } else {
                          // Jeśli zmieniamy z jednej waluty obcej na inną
                          // Tymczasowo nie przeliczamy, czekamy na datę faktury
                          setOrderData(prev => ({
                            ...prev,
                            shippingCurrency: newCurrency,
                            shippingCost: originalValue, // Tymczasowo bez przeliczania
                            shippingCostOriginal: originalValue
                          }));
                        }
                      } else {
                        // Jeśli nie mamy daty faktury, nie przeliczamy - pokazujemy komunikat
                        showInfo('Aby przeliczać waluty, podaj datę faktury.');
                        setOrderData(prev => ({
                          ...prev,
                          shippingCurrency: newCurrency,
                          shippingCostOriginal: originalValue,
                          // Zachowaj oryginalną wartość jako koszt dostawy do momentu podania daty faktury
                          shippingCost: originalValue
                        }));
                      }
                    }}
                    label="Waluta"
                    sx={inputSx}
                  >
                    <MenuItem value="EUR">EUR</MenuItem>
                    <MenuItem value="PLN">PLN</MenuItem>
                    <MenuItem value="USD">USD</MenuItem>
                  </Select>
                </FormControl>
              </Box>
              {orderData.shippingCurrency && orderData.shippingCurrency !== 'EUR' && orderData.shippingCost > 0 && orderData.exchangeRate && (
                <Typography variant="caption" sx={{ display: 'block', mt: 1, fontStyle: 'italic' }}>
                  {formatCurrency(parseFloat(orderData.shippingCostOriginal) || 0)} {orderData.shippingCurrency} = {formatCurrency(parseFloat(orderData.shippingCost) || 0)} EUR (kurs: {orderData.exchangeRate})
                </Typography>
              )}
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="invoiceNumber"
                label="Nr faktury"
                value={orderData.invoiceNumber || ''}
                onChange={handleChange}
                fullWidth
                placeholder="Wprowadź numer faktury"
                variant="outlined"
                sx={inputSx}
                InputProps={{
                  startAdornment: <InputAdornment position="start">📄</InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                type="date"
                label="Data faktury"
                name="invoiceDate"
                value={orderData.invoiceDate || ''}
                onChange={handleChange}
                fullWidth
                InputLabelProps={{ shrink: true }}
                variant="outlined"
                helperText="Data wystawienia faktury"
                sx={inputSx}
              />
            </Grid>
          </Grid>
          
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 3, alignItems: 'center', bgcolor: 'background.paper', p: 2, borderRadius: 2, boxShadow: 1 }}>
            <Typography variant="subtitle1" sx={{ mr: 2 }}>
              Koszt dostawy: {formatCurrency(parseFloat(orderData.shippingCost) || 0)}
            </Typography>
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
              Razem: {formatCurrency(calculateTotal())}
            </Typography>
          </Box>
        </Paper>

        {/* Sekcja dodatkowych kosztów */}
        <Paper sx={{ p: 3, mb: 3, boxShadow: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center' }}>
              <AttachMoneyIcon sx={{ mr: 1 }} /> Dodatkowe koszty
            </Typography>
            <Box>
              <Button
                startIcon={<AddIcon />}
                variant="outlined"
                onClick={() => handleAddAdditionalCost(false)}
                size="small"
                sx={{ mr: 1, borderRadius: 2 }}
              >
                Dodaj koszt
              </Button>
              <Button
                startIcon={<AddIcon />}
                variant="outlined"
                onClick={() => handleAddAdditionalCost(true)}
                size="small"
                color="secondary"
                sx={{ borderRadius: 2 }}
              >
                Dodaj rabat
              </Button>
            </Box>
          </Box>
          
          <Divider sx={{ mb: 3 }} />
          
          {!orderData.additionalCostsItems || orderData.additionalCostsItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 2 }}>
              Brak dodatkowych kosztów lub rabatów. Użyj przycisków powyżej, aby je dodać.
            </Typography>
          ) : (
            <TableContainer sx={{ overflow: 'auto', maxWidth: '100%' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={tableCellSx}>Opis</TableCell>
                    <TableCell align="right" sx={tableCellSx}>Kwota</TableCell>
                    <TableCell align="right" sx={tableCellSx}>Waluta</TableCell>
                    <TableCell align="right" sx={tableCellSx}>VAT</TableCell>
                    <TableCell sx={tableCellSx}>Nr faktury</TableCell>
                    <TableCell sx={tableCellSx}>Data faktury</TableCell>
                    <TableCell sx={tableCellSx}>Kurs</TableCell>
                    <TableCell width="50px" sx={tableCellSx}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {orderData.additionalCostsItems.map((cost) => (
                    <TableRow key={cost.id}>
                      <TableCell>
                        <TextField
                          value={cost.description || ''}
                          onChange={(e) => handleAdditionalCostChange(cost.id, 'description', e.target.value)}
                          variant="standard"
                          fullWidth
                          placeholder="Opis kosztu"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          value={cost.originalValue !== undefined ? cost.originalValue : cost.value}
                          onChange={(e) => handleAdditionalCostChange(cost.id, 'value', e.target.value)}
                          variant="standard"
                          inputProps={{ step: '0.01', min: cost.description === 'Rabat' ? undefined : '0' }}
                          sx={{ maxWidth: 120 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <FormControl variant="standard" sx={{ minWidth: 80 }}>
                          <Select
                            value={cost.currency || 'EUR'}
                            onChange={(e) => handleAdditionalCostChange(cost.id, 'currency', e.target.value)}
                            displayEmpty
                          >
                            <MenuItem value="EUR">EUR</MenuItem>
                            <MenuItem value="PLN">PLN</MenuItem>
                            <MenuItem value="USD">USD</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell align="right">
                        <FormControl variant="standard" sx={{ maxWidth: 80 }}>
                          <Select
                            value={cost.vatRate || 23}
                            onChange={(e) => handleAdditionalCostChange(cost.id, 'vatRate', e.target.value)}
                            displayEmpty
                          >
                            <MenuItem value={0}>0%</MenuItem>
                            <MenuItem value={5}>5%</MenuItem>
                            <MenuItem value={8}>8%</MenuItem>
                            <MenuItem value={23}>23%</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell>
                        <TextField
                          value={cost.invoiceNumber || ''}
                          onChange={(e) => handleAdditionalCostChange(cost.id, 'invoiceNumber', e.target.value)}
                          variant="standard"
                          fullWidth
                          placeholder="Nr faktury"
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="date"
                          value={cost.invoiceDate || ''}
                          onChange={(e) => handleAdditionalCostChange(cost.id, 'invoiceDate', e.target.value)}
                          variant="standard"
                          inputProps={{ 
                            max: formatDateForInput ? formatDateForInput(new Date()) : new Date().toISOString().split('T')[0]
                          }}
                          sx={{ width: 150 }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="number"
                          value={cost.exchangeRate || 1}
                          onChange={(e) => handleAdditionalCostChange(cost.id, 'exchangeRate', e.target.value)}
                          variant="standard"
                          inputProps={{ step: '0.000001', min: '0' }}
                          sx={{ maxWidth: 100 }}
                          disabled={cost.currency === 'EUR'}
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" color="error" onClick={() => handleRemoveAdditionalCost(cost.id)}>
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  
                  {/* Wiersz z podsumowaniem */}
                  <TableRow>
                    <TableCell colSpan={2} align="right" sx={{ fontWeight: 'bold' }}>
                      Suma netto (w EUR):
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                      {formatCurrency(
                        orderData.additionalCostsItems.reduce(
                          (sum, cost) => sum + (parseFloat(cost.value) || 0), 
                          0
                        )
                      )}
                    </TableCell>
                    <TableCell colSpan={2}></TableCell>
                  </TableRow>
                  
                  {/* Informacja o kursach walut jeśli używane są różne waluty */}
                  {orderData.additionalCostsItems.some(cost => cost.currency && cost.currency !== 'EUR' && cost.exchangeRate > 0) && (
                    <TableRow>
                      <TableCell colSpan={5} sx={{ py: 1 }}>
                        <Typography variant="caption" sx={{ fontStyle: 'italic' }}>
                          Wartości w walutach obcych zostały przeliczone według kursów z dnia poprzedzającego datę faktury: 
                          {orderData.additionalCostsItems
                            .filter(cost => cost.currency !== 'EUR' && cost.exchangeRate > 0)
                            .map(cost => ` ${cost.currency}/EUR: ${parseFloat(cost.exchangeRate).toFixed(6)}`)
                            .filter((value, index, self) => self.indexOf(value) === index) // Usunięcie duplikatów
                            .join(', ')}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
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
            sx={inputSx}
          />
        </Paper>

        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Dowód dostawy</Typography>
          <Divider sx={{ mb: 2 }} />
          
          {orderData.deliveryProof ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {isImageUrl(orderData.deliveryProof) ? (
                <Box sx={{ width: '100%', maxWidth: 600, mb: 2 }}>
                  <img 
                    src={orderData.deliveryProof} 
                    alt="Dowód dostawy" 
                    style={{ width: '100%', height: 'auto', borderRadius: 4 }} 
                  />
                </Box>
              ) : isGoogleDriveLink(orderData.deliveryProof) ? (
                <Box sx={{ width: '100%', maxWidth: 600, mb: 2, p: 3, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
                  <Typography variant="h6" align="center" gutterBottom>
                    <LinkIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
                    Link do Google Drive
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom align="center">
                    {orderData.deliveryProof}
                  </Typography>
                </Box>
              ) : (
                <Box sx={{ width: '100%', maxWidth: 600, mb: 2 }}>
                  <Alert severity="info">
                    Dokument w formacie, który nie może być wyświetlony w przeglądarce. 
                    Kliknij przycisk "Otwórz", aby wyświetlić dokument.
                  </Alert>
                </Box>
              )}
              <Box sx={{ display: 'flex', gap: 2 }}>
                <Button 
                  variant="outlined"
                  startIcon={<OpenInNewIcon />}
                  href={orderData.deliveryProof}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Otwórz
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
                Brak załączonego dowodu dostawy. Dodaj skan, zdjęcie lub link do dokumentu potwierdzającego dostawę.
              </Typography>
              <Box sx={{ display: 'flex', gap: 2 }}>
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
                    {uploading ? 'Przesyłanie...' : 'Dodaj plik'}
                  </Button>
                </label>
                <Button
                  variant="outlined"
                  startIcon={<LinkIcon />}
                  onClick={handleDriveLinkDialogOpen}
                >
                  Dodaj link Google Drive
                </Button>
              </Box>
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
              <TableContainer sx={{ overflow: 'auto', maxWidth: '100%' }}>
                <Table>
                  <TableHead>
                    <TableRow sx={{ bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'primary.light' }}>
                      <TableCell sx={tableCellSx}>Numer PO</TableCell>
                      <TableCell sx={tableCellSx}>Dostawca</TableCell>
                      <TableCell sx={tableCellSx}>Liczba pozycji</TableCell>
                      <TableCell align="right" sx={tableCellSx}>Wartość brutto</TableCell>
                      <TableCell sx={tableCellSx}>Status</TableCell>
                      <TableCell sx={tableCellSx}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {linkedPurchaseOrders.map((po, index) => (
                      <TableRow key={index} hover sx={{ 
                        bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : 'inherit'
                      }}>
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
                            size="small"
                            sx={{
                              backgroundColor: 
                                po.status === 'completed' ? '#4caf50' : 
                                po.status === 'in_progress' ? '#ff9800' : 
                                '#757575',
                              color: 'white'
                            }}
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
              </TableContainer>
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
              <Paper sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">Wartość produktów:</Typography>
                <Typography variant="h6" fontWeight="bold">{formatCurrency(calculateSubtotal())}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">Koszt dostawy:</Typography>
                <Typography variant="h6" fontWeight="bold">{formatCurrency(parseFloat(orderData.shippingCost) || 0)}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">Dodatkowe koszty:</Typography>
                <Typography variant="h6" fontWeight="bold">{formatCurrency(calculateAdditionalCosts())}</Typography>
              </Paper>
            </Grid>
            {calculateDiscounts() > 0 && (
              <Grid item xs={12} md={3}>
                <Paper sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'background.default' }}>
                  <Typography variant="subtitle2" color="text.secondary">Rabaty:</Typography>
                  <Typography variant="h6" fontWeight="bold" color="secondary">- {formatCurrency(calculateDiscounts())}</Typography>
                </Paper>
              </Grid>
            )}
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">Wartość całkowita zamówienia:</Typography>
                <Typography variant="h6" fontWeight="bold">{formatCurrency(calculateTotal())}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={3}>
              <Paper sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">Wartość zamówień zakupu:</Typography>
                <Typography variant="h6" fontWeight="bold" color="warning.main">{formatCurrency(calculatePurchaseOrdersTotal())}</Typography>
              </Paper>
            </Grid>
          </Grid>
        </Paper>

        {/* Sekcja faktur */}
        <Paper sx={{ p: 3, mb: 3, boxShadow: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center' }}>
              <ReceiptIcon sx={{ mr: 1 }} /> Faktury
            </Typography>
            <Button
              startIcon={<AddIcon />}
              variant="outlined"
              onClick={handleAddInvoice}
              size="small"
              sx={{ borderRadius: 2 }}
            >
              Dodaj fakturę
            </Button>
          </Box>
          <Divider sx={{ mb: 3 }} />
          {invoices.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 2 }}>
              Brak faktur. Użyj przycisku powyżej, aby dodać fakturę.
            </Typography>
          ) : (
            <TableContainer sx={{ overflow: 'auto', maxWidth: '100%' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={tableCellSx}>Nr faktury</TableCell>
                    <TableCell sx={tableCellSx}>Data faktury</TableCell>
                    <TableCell sx={tableCellSx}>Status</TableCell>
                    <TableCell align="right" sx={tableCellSx}>Kwota</TableCell>
                    <TableCell align="right" sx={tableCellSx}>Kwota opłacona</TableCell>
                    <TableCell width="50px" sx={tableCellSx}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <TextField
                          value={inv.number}
                          onChange={e => handleInvoiceChange(inv.id, 'number', e.target.value)}
                          variant="standard"
                          fullWidth
                          placeholder="Nr faktury"
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="date"
                          value={inv.date}
                          onChange={e => handleInvoiceChange(inv.id, 'date', e.target.value)}
                          variant="standard"
                          sx={{ width: 150 }}
                        />
                      </TableCell>
                      <TableCell>
                        <FormControl variant="standard" sx={{ minWidth: 120 }}>
                          <Select
                            value={inv.status}
                            onChange={e => handleInvoiceChange(inv.id, 'status', e.target.value)}
                          >
                            <MenuItem value="nieopłacona">Nieopłacona</MenuItem>
                            <MenuItem value="częściowo opłacona">Częściowo opłacona</MenuItem>
                            <MenuItem value="opłacona">Opłacona</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          value={inv.amount}
                          onChange={e => handleInvoiceChange(inv.id, 'amount', e.target.value)}
                          variant="standard"
                          inputProps={{ step: '0.01', min: '0' }}
                          sx={{ maxWidth: 120 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          value={inv.paidAmount}
                          onChange={e => handleInvoiceChange(inv.id, 'paidAmount', e.target.value)}
                          variant="standard"
                          inputProps={{ step: '0.01', min: '0' }}
                          sx={{ maxWidth: 120 }}
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" color="error" onClick={() => handleRemoveInvoice(inv.id)}>
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
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
          
          <TableContainer sx={{ overflow: 'auto', maxWidth: '100%' }}>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'grey.100' }}>
                  <TableCell sx={tableCellSx}>
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
                  <TableCell sx={tableCellSx}>Nazwa materiału</TableCell>
                  <TableCell align="right" sx={tableCellSx}>Ilość</TableCell>
                  <TableCell sx={tableCellSx}>Jednostka</TableCell>
                  <TableCell sx={tableCellSx}>Dla produktu</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {materialsForPO.map((material, index) => (
                  <TableRow key={index} sx={{ 
                    bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : 'inherit',
                    '&:nth-of-type(odd)': { 
                      bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : 'background.paper' 
                    },
                    '&:nth-of-type(even)': { 
                      bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'grey.50' 
                    },
                    '&:hover': {
                      bgcolor: 'action.hover'
                    }
                  }}>
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
          </TableContainer>
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
                  sx={inputSx}
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

      {/* Dialog do wprowadzania linku Google Drive */}
      <Dialog open={driveLinkDialogOpen} onClose={handleDriveLinkDialogClose}>
        <DialogTitle>Dodaj link do Google Drive</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wprowadź link do dokumentu w Google Drive, który będzie służył jako dowód dostawy.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            id="drive-link"
            label="Link do Google Drive"
            type="url"
            fullWidth
            variant="outlined"
            value={driveLink}
            onChange={handleDriveLinkChange}
            placeholder="https://drive.google.com/file/d/..."
            helperText="Link musi pochodzić z Google Drive i być publicznie dostępny"
            sx={inputSx}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleDriveLinkDialogClose}>Anuluj</Button>
          <Button onClick={handleDriveLinkSubmit} variant="contained">Dodaj</Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default OrderForm; 