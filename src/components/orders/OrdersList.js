import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation, Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  Paper,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  TablePagination,
  IconButton,
  TextField,
  InputAdornment,
  Chip,
  Tooltip,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Collapse,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Divider,
  Link
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  FilterList as FilterListIcon,
  Clear as ClearIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  LocalShipping as LocalShippingIcon,
  EventNote as EventNoteIcon,
  Payment as PaymentIcon,
  MoreVert as MoreVertIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Refresh as RefreshIcon,
  People as CustomersIcon,
  ShoppingCart as ShoppingCartIcon,
  ArrowDropDown as ArrowDropDownIcon,
  Download as DownloadIcon
} from '@mui/icons-material';
import { 
  getAllOrders, 
  deleteOrder, 
  updateOrderStatus, 
  getOrderById,
  ORDER_STATUSES,
  getOrdersWithPagination
} from '../../services/orderService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate, formatTimestamp, formatDateForInput } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatUtils';
import { getRecipeById } from '../../services/recipeService';
import { exportToCSV, formatDateForExport, formatCurrencyForExport } from '../../utils/exportUtils';
import { getUsersDisplayNames } from '../../services/userService';

const OrdersList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Modyfikacja stanów dla paginacji serwerowej
  const [page, setPage] = useState(1); // Zmiana z 0 na 1 (index od 1)
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  
  // Stan dla debounce wyszukiwania
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [searchTimeout, setSearchTimeout] = useState(null);
  
  // Stan dla sortowania
  const [orderBy, setOrderBy] = useState('orderDate');
  const [orderDirection, setOrderDirection] = useState('desc');
  
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    fromDate: '',
    toDate: '',
    customerId: ''
  });
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [orderToDelete, setOrderToDelete] = useState(null);
  const [statusChangeInfo, setStatusChangeInfo] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  // Dodajemy flagę, aby śledzić czy komponent jest już zamontowany
  const [isInitialized, setIsInitialized] = useState(false);
  
  // Stan dla dialogu zmiany statusu (podobnie jak w PO)
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [orderToUpdateStatus, setOrderToUpdateStatus] = useState(null);
  const [newStatus, setNewStatus] = useState('');

  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();

  // Główny efekt inicjalizacyjny - wykonuje się tylko raz przy pierwszym renderowaniu
  useEffect(() => {
    fetchCustomers();
    // Nie wywołujemy tu fetchOrders() - zostanie wywołane przez efekt zależny od parametrów
    setIsInitialized(true);
  }, []);

  // Obsługa debounce dla wyszukiwania
  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    const timeoutId = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500); // 500ms opóźnienia
    
    setSearchTimeout(timeoutId);
    
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTerm]);
  
  // Efekt odpowiedzialny za pobieranie zamówień przy zmianach parametrów
  useEffect(() => {
    // Wywołujemy fetchOrders tylko jeśli komponent jest już zainicjalizowany
    if (isInitialized) {
      fetchOrders();
    }
  }, [page, rowsPerPage, orderBy, orderDirection, debouncedSearchTerm, isInitialized]);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      
      // Przygotowanie filtrów dla funkcji z paginacją
      const paginationFilters = {
        ...filters,
        searchTerm: debouncedSearchTerm
      };
      
      // Wywołanie funkcji paginacji serwerowej
      const result = await getOrdersWithPagination(
        page,
        rowsPerPage,
        orderBy,
        orderDirection,
        paginationFilters
      );
      
      // Aktualizacja danych i metadanych paginacji
      setOrders(result.data);
      setTotalItems(result.pagination.totalItems);
      setTotalPages(result.pagination.totalPages);
      
      // Usuwamy zbędne logowanie, które generuje wielokrotne komunikaty
      // console.log("Pobrano zamówienia z paginacją:", result);
    } catch (error) {
      console.error('Błąd podczas pobierania zamówień:', error);
      showError('Nie udało się pobrać listy zamówień');
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      setCustomersLoading(true);
      const { getAllCustomers } = await import('../../services/customerService');
      const data = await getAllCustomers();
      setCustomers(data);
    } catch (error) {
      console.error('Błąd podczas pobierania klientów:', error);
    } finally {
      setCustomersLoading(false);
    }
  };

  const applyFilters = async () => {
    setPage(1); // Reset do pierwszej strony przy zmianie filtrów
    fetchOrders();
  };

  useEffect(() => {
    if (location.state?.customerId) {
      setFilters(prev => ({
        ...prev,
        customerId: location.state.customerId
      }));
      
      if (location.state?.customerName) {
        showSuccess(`Wyświetlam zamówienia klienta: ${location.state.customerName}`);
      }
      
      // Zastosuj filtry przy pierwszym załadowaniu
      const timer = setTimeout(() => {
        applyFilters();
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [location.state, showSuccess]);

  useEffect(() => {
    if (orders && orders.length > 0) {
      // To tylko sprawdza czy daty są poprawnie sformatowane
      // W razie potrzeby można tu wykonać jakieś działania
    }
  }, [orders]);

  const resetFilters = () => {
    setFilters({
      status: 'all',
      fromDate: '',
      toDate: '',
      customerId: ''
    });
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setPage(1);
    fetchOrders();
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    // Dla pól typu date (fromDate, toDate) zapewniamy poprawny format
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage + 1); // Dodanie +1, ponieważ MUI TablePagination używa indeksowania od 0, a nasza funkcja od 1
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(1); // Reset strony na pierwszą
  };

  const handleAddOrder = () => {
    navigate('/orders/new');
  };

  const handleEditOrder = (orderId) => {
    navigate(`/orders/edit/${orderId}`);
  };

  const handleViewOrderDetails = (orderId) => {
    navigate(`/orders/${orderId}`);
  };

  const handleDeleteOrderClick = (order) => {
    setOrderToDelete(order);
  };

  const handleConfirmDelete = async () => {
    if (!orderToDelete) return;
    
    try {
      await deleteOrder(orderToDelete.id);
      setOrders(prev => prev.filter(order => order.id !== orderToDelete.id));
      showSuccess('Zamówienie zostało usunięte');
    } catch (error) {
      showError('Błąd podczas usuwania zamówienia: ' + error.message);
      console.error('Error deleting order:', error);
    } finally {
      setOrderToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setOrderToDelete(null);
  };

  const handleStatusChangeClick = (order, newStatus) => {
    try {
      if (!order || !order.id || typeof order.id !== 'string') {
        console.error('Nieprawidłowy identyfikator zamówienia:', order);
        showError('Nie można zmienić statusu - nieprawidłowy identyfikator zamówienia');
        return;
      }

      // Konwertuj status zamówienia do string jeśli jest obiektem
      const currentStatus = typeof order.status === 'object' 
        ? JSON.stringify(order.status) 
        : (order.status || 'Nieznany');
      
      // Konwertuj nowy status do string jeśli jest obiektem  
      const statusValue = typeof newStatus === 'object'
        ? JSON.stringify(newStatus)
        : (newStatus || 'Nieznany');
      
    setStatusChangeInfo({
      orderId: order.id,
        orderNumber: order.orderNumber || order.id.substring(0, 8).toUpperCase(),
        currentStatus: currentStatus,
        newStatus: statusValue
      });
    } catch (error) {
      console.error('Błąd podczas przygotowania zmiany statusu:', error);
      showError('Wystąpił błąd podczas przygotowania zmiany statusu');
    }
  };

  const handleConfirmStatusChange = async () => {
    if (!statusChangeInfo) return;
    
    try {
      await updateOrderStatus(statusChangeInfo.orderId, statusChangeInfo.newStatus, currentUser.uid);
      
      // Aktualizacja lokalnego stanu
      setOrders(prev => prev.map(order => {
        if (order.id === statusChangeInfo.orderId) {
          return { ...order, status: statusChangeInfo.newStatus };
        }
        return order;
      }));
      
      showSuccess(`Status zamówienia zmieniony na "${statusChangeInfo.newStatus}"`);
    } catch (error) {
      showError('Błąd podczas zmiany statusu: ' + error.message);
      console.error('Error updating order status:', error);
    } finally {
      setStatusChangeInfo(null);
    }
  };

  const handleCancelStatusChange = () => {
    setStatusChangeInfo(null);
  };

  // Nowe funkcje obsługi zmiany statusu (podobnie jak w PO)
  const handleStatusClick = (order) => {
    setOrderToUpdateStatus(order);
    setNewStatus(order.status || 'Nowe');
    setStatusDialogOpen(true);
  };

  const handleStatusUpdate = async () => {
    try {
      await updateOrderStatus(orderToUpdateStatus.id, newStatus, currentUser.uid);
      
      // Po aktualizacji odświeżamy listę
      fetchOrders();
      
      showSuccess('Status zamówienia został zaktualizowany');
      setStatusDialogOpen(false);
      setOrderToUpdateStatus(null);
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu zamówienia:', error);
      showError('Nie udało się zaktualizować statusu zamówienia');
    }
  };

  const toggleExpand = (orderId) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  // Używamy danych bezpośrednio z serwera
  const displayedOrders = orders;

  const getStatusChipColor = (status) => {
    switch (status) {
      case 'Nowe': return '#1976d2'; // oryginalny niebieski
      case 'W realizacji': return '#2196f3'; // oryginalny jasnoniebieski
      case 'Zakończone': return '#4caf50'; // oryginalny zielony
      case 'Anulowane': return '#f44336'; // oryginalny czerwony
      default: return '#757575'; // oryginalny szary
    }
  };

  // Nawigacja do listy zamówień filtrowanej po kliencie
  const handleViewCustomerOrders = (customerId, customerName) => {
    // Ustawiam filtry i przechodzę do listy zamówień
    setFilters(prev => ({
      ...prev,
      customerId: customerId
    }));
    showSuccess(`Wyświetlam zamówienia klienta: ${customerName}`);
    applyFilters();
  };

  const handleRefreshOrder = async (order) => {
    try {
      // Import potrzebnych funkcji
      const { getOrderById } = await import('../../services/orderService');
      const { getPurchaseOrderById } = await import('../../services/purchaseOrderService');
      
      // Pobierz zaktualizowane dane zamówienia
      const updatedOrder = await getOrderById(order.id);
      console.log("Pobrane zaktualizowane dane zamówienia:", updatedOrder);
      
      // Inicjalizujemy wartość zamówień zakupu
      let poTotal = 0;
      
      // Przetwarzamy powiązane PO, pobierając ich aktualne dane
      if (updatedOrder.linkedPurchaseOrders && updatedOrder.linkedPurchaseOrders.length > 0) {
        console.log(`Aktualizuję ${updatedOrder.linkedPurchaseOrders.length} powiązanych PO dla zamówienia ${order.id}`);
        
        // Pobierz aktualne dane każdego PO
        const updatedPOs = await Promise.all(
          updatedOrder.linkedPurchaseOrders.map(async (po) => {
            if (!po.id) {
              console.warn("Pominięto PO bez ID:", po);
              return po;
            }
            
            try {
              // Pobierz najnowsze dane PO z bazy
              const freshPO = await getPurchaseOrderById(po.id);
              console.log(`Pobrano aktualne dane PO ${po.number}:`, freshPO);
              
              // Użyj zaktualizowanej wartości totalGross
              if (freshPO.totalGross !== undefined && freshPO.totalGross !== null) {
                const value = typeof freshPO.totalGross === 'number' ? freshPO.totalGross : parseFloat(freshPO.totalGross) || 0;
                console.log(`Używam wartości totalGross z bazy dla ${freshPO.number}: ${value}`);
                poTotal += value;
                return { ...freshPO }; // Użyj wszystkich zaktualizowanych danych
              } else {
                console.warn(`PO ${freshPO.number || freshPO.id} nie ma wartości totalGross w bazie`);
                
                // W ostateczności oblicz wartość brutto
                const productsValue = typeof freshPO.totalValue === 'number' ? freshPO.totalValue : parseFloat(freshPO.totalValue) || 0;
                const vatRate = typeof freshPO.vatRate === 'number' ? freshPO.vatRate : parseFloat(freshPO.vatRate) || 23;
                const vatValue = (productsValue * vatRate) / 100;
                
                let additionalCosts = 0;
                if (freshPO.additionalCostsItems && Array.isArray(freshPO.additionalCostsItems)) {
                  additionalCosts = freshPO.additionalCostsItems.reduce((costsSum, cost) => {
                    const costValue = typeof cost.value === 'number' ? cost.value : parseFloat(cost.value) || 0;
                    return costsSum + costValue;
                  }, 0);
                } else {
                  additionalCosts = typeof freshPO.additionalCosts === 'number' ? freshPO.additionalCosts : parseFloat(freshPO.additionalCosts) || 0;
                }
                
                const grossValue = productsValue + vatValue + additionalCosts;
                console.log(`Obliczona wartość brutto PO ${freshPO.number}: ${grossValue}`);
                poTotal += grossValue;
                return { ...freshPO, totalGross: grossValue };
              }
            } catch (error) {
              console.error(`Błąd podczas pobierania danych PO ${po.id}:`, error);
              // Jeśli nie możemy pobrać danych, używamy aktualnych
              const value = typeof po.totalGross === 'number' ? po.totalGross : parseFloat(po.totalGross) || 0;
              poTotal += value;
              return po;
            }
          })
        );
        
        // Aktualizuj linkedPurchaseOrders na dane z zaktualizowanymi wartościami
        updatedOrder.linkedPurchaseOrders = updatedPOs;
      }
      
      // Obliczamy wartość produktów z uwzględnieniem kosztów produkcji
      const calculateItemTotalValue = (item) => {
        // Podstawowa wartość pozycji
        const itemValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
        
        // Jeśli produkt jest z listy cenowej I ma cenę większą od 0, zwracamy tylko wartość pozycji
        if (item.fromPriceList && parseFloat(item.price || 0) > 0) {
          return itemValue;
        }
        
        // Jeśli produkt nie jest z listy cenowej LUB ma cenę 0, i ma koszt produkcji, dodajemy go
        if (item.productionTaskId && item.productionCost !== undefined) {
          return itemValue + parseFloat(item.productionCost || 0);
        }
        
        // Domyślnie zwracamy tylko wartość pozycji
        return itemValue;
      };
      
      const subtotal = (updatedOrder.items || []).reduce((sum, item) => {
        return sum + calculateItemTotalValue(item);
      }, 0);
      
      // Dodanie kosztów dostawy
      const shippingCost = parseFloat(updatedOrder.shippingCost) || 0;
      
      // Dodatkowe koszty (tylko pozytywne)
      const additionalCosts = updatedOrder.additionalCostsItems ? 
        updatedOrder.additionalCostsItems
          .filter(cost => parseFloat(cost.value) > 0)
          .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0) : 0;
      
      // Rabaty (wartości ujemne) - jako wartość pozytywna do odjęcia
      const discounts = updatedOrder.additionalCostsItems ? 
        Math.abs(updatedOrder.additionalCostsItems
          .filter(cost => parseFloat(cost.value) < 0)
          .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)) : 0;
      
      // Łączna wartość zamówienia
      const recalculatedTotalValue = subtotal + shippingCost + additionalCosts - discounts;
      
      console.log(`Zaktualizowane wartości zamówienia ${order.id}: produkty=${subtotal}, dostawa=${shippingCost}, PO=${poTotal}, razem=${recalculatedTotalValue}`);
      
      // Sprawdź czy wartość się zmieniła w porównaniu do zapisanej w bazie
      const savedTotalValue = parseFloat(updatedOrder.totalValue) || 0;
      const valueChanged = Math.abs(recalculatedTotalValue - savedTotalValue) > 0.01;
      
      // Jeśli wartość się zmieniła, zaktualizuj ją w bazie danych
      if (valueChanged) {
        console.log(`Wartość zamówienia ${order.id} została zaktualizowana: ${savedTotalValue} → ${recalculatedTotalValue}`);
        
        try {
          const { updateOrder } = await import('../../services/orderService');
          
          // Przygotuj bezpieczne dane do aktualizacji
          const safeUpdateData = {
            items: updatedOrder.items,
            totalValue: recalculatedTotalValue,
            orderNumber: updatedOrder.orderNumber,
            orderDate: updatedOrder.orderDate, // Wymagane przez walidację
            status: updatedOrder.status,
            customer: updatedOrder.customer,
            shippingCost: updatedOrder.shippingCost,
            additionalCostsItems: updatedOrder.additionalCostsItems,
            productionTasks: updatedOrder.productionTasks,
            linkedPurchaseOrders: updatedOrder.linkedPurchaseOrders
          };
          
          console.log(`Zapisuję do bazy danych zamówienie ${order.id} z wartością:`, recalculatedTotalValue);
          console.log('Dane do zapisu:', safeUpdateData);
          
          await updateOrder(updatedOrder.id, safeUpdateData, 'system');
          console.log(`✅ Zapisano zaktualizowaną wartość zamówienia ${order.id} do bazy danych`);
          
          // Weryfikacja - sprawdź czy dane zostały rzeczywiście zapisane
          const verificationOrder = await getOrderById(order.id);
          const verificationValue = parseFloat(verificationOrder.totalValue) || 0;
          console.log(`🔍 Weryfikacja: wartość w bazie po zapisie: ${verificationValue}`);
          
          if (Math.abs(verificationValue - recalculatedTotalValue) > 0.01) {
            console.error(`❌ BŁĄD SYNCHRONIZACJI: Oczekiwana wartość ${recalculatedTotalValue}, a w bazie ${verificationValue}`);
            showError(`Błąd synchronizacji danych. Spróbuj ponownie.`);
          } else {
            console.log(`✅ Weryfikacja potwierdza prawidłowy zapis do bazy danych`);
          }
          
        } catch (error) {
          console.error(`❌ Błąd podczas aktualizacji wartości zamówienia ${order.id} w bazie danych:`, error);
          showError(`Nie udało się zapisać zmian do bazy danych: ${error.message}`);
        }
      } else {
        console.log(`Wartość zamówienia ${order.id} nie zmieniła się (${recalculatedTotalValue}), pomijam zapis do bazy`);
      }
      
      // Aktualizuj ten jeden element w tablicy zamówień
      setOrders(prevOrders => prevOrders.map(o => {
        if (o.id === order.id) {
          return {
            ...updatedOrder,
            totalValue: recalculatedTotalValue,
            productsValue: subtotal,
            purchaseOrdersValue: poTotal,
            shippingCost: shippingCost
          };
        }
        return o;
      }));
      
      showSuccess('Dane zamówienia zostały zaktualizowane' + (valueChanged ? ' i zapisane do bazy danych' : ''));
    } catch (error) {
      console.error('Błąd podczas odświeżania danych zamówienia:', error);
      showError('Nie udało się odświeżyć danych zamówienia');
    }
  };

  const handleRefreshAll = async () => {
    try {
      setLoading(true);
      showInfo('Trwa odświeżanie wszystkich danych...');
      
      // Import potrzebnych funkcji
      const { getOrderById } = await import('../../services/orderService');
      const { getPurchaseOrderById } = await import('../../services/purchaseOrderService');
      
      // Pobierz świeże dane z serwera
      const freshData = await getAllOrders();
      console.log("Pobrane świeże dane zamówień:", freshData);
      
      // Przelicz wartości dla każdego zamówienia z pełnym odświeżeniem PO
      const updatedOrders = await Promise.all(freshData.map(async (order) => {
        console.log(`Odświeżam dane zamówienia ${order.id}`);
        
        // Pobierz zaktualizowane pełne dane zamówienia
        const updatedOrderData = await getOrderById(order.id);
        console.log("Pobrane pełne dane zamówienia:", updatedOrderData);
        
        // Aktualizuj koszty produkcji dla pozycji zamówienia
        if (updatedOrderData.productionTasks && updatedOrderData.productionTasks.length > 0 && updatedOrderData.items && updatedOrderData.items.length > 0) {
          // Importuj funkcję do pobierania szczegółów zadania
          const { getTaskById } = await import('../../services/productionService');
          const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/costCalculator');
          
          console.log("Aktualizuję koszty produkcji dla zamówienia:", order.id);
          
          for (let i = 0; i < updatedOrderData.items.length; i++) {
            const item = updatedOrderData.items[i];
            
            // Znajdź powiązane zadanie produkcyjne
            const associatedTask = updatedOrderData.productionTasks?.find(task => 
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
                
                // Aktualizuj informacje o zadaniu produkcyjnym w elemencie zamówienia
                updatedOrderData.items[i] = {
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
                
                console.log(`Zaktualizowano koszty dla pozycji ${item.name}: koszt podstawowy = ${updatedOrderData.items[i].productionCost}€, pełny koszt = ${updatedOrderData.items[i].fullProductionCost}€, pełny koszt/szt = ${calculatedFullProductionUnitCost.toFixed(2)}€ (lista cenowa: ${item.fromPriceList ? 'tak' : 'nie'})`);
              } catch (error) {
                console.error(`Błąd podczas pobierania szczegółów zadania ${associatedTask.id}:`, error);
                
                // W przypadku błędu, użyj podstawowych danych z associatedTask
                const fullProductionCost = associatedTask.totalFullProductionCost || 0;
                const productionCost = associatedTask.totalMaterialCost || 0;
                
                updatedOrderData.items[i] = {
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
        
        // Inicjalizujemy wartości
        let poTotal = 0;
        
        // Pobieramy aktualne wersje wszystkich powiązanych PO bezpośrednio z bazy
        if (updatedOrderData.linkedPurchaseOrders && updatedOrderData.linkedPurchaseOrders.length > 0) {
          console.log(`Aktualizuję ${updatedOrderData.linkedPurchaseOrders.length} powiązanych PO dla zamówienia ${order.id}`);
          
          // Pobierz aktualne dane każdego PO
          const updatedPOs = await Promise.all(
            updatedOrderData.linkedPurchaseOrders.map(async (po) => {
              if (!po.id) {
                console.warn("Pominięto PO bez ID:", po);
                return po;
              }
              
              try {
                // Pobierz najnowsze dane PO z bazy
                const freshPO = await getPurchaseOrderById(po.id);
                console.log(`Pobrano aktualne dane PO ${po.number}:`, freshPO);
                
                // Użyj zaktualizowanej wartości totalGross
                if (freshPO.totalGross !== undefined && freshPO.totalGross !== null) {
                  const value = typeof freshPO.totalGross === 'number' ? freshPO.totalGross : parseFloat(freshPO.totalGross) || 0;
                  console.log(`Używam wartości totalGross z bazy dla ${freshPO.number}: ${value}`);
                  poTotal += value;
                  return { ...freshPO }; // Zwróć pełne zaktualizowane dane
                } else {
                  console.warn(`PO ${freshPO.number || freshPO.id} nie ma wartości totalGross w bazie`);
                  
                  // W ostateczności oblicz wartość brutto
                  const productsValue = typeof freshPO.totalValue === 'number' ? freshPO.totalValue : parseFloat(freshPO.totalValue) || 0;
                  const vatRate = typeof freshPO.vatRate === 'number' ? freshPO.vatRate : parseFloat(freshPO.vatRate) || 23;
                  const vatValue = (productsValue * vatRate) / 100;
                  
                  let additionalCosts = 0;
                  if (freshPO.additionalCostsItems && Array.isArray(freshPO.additionalCostsItems)) {
                    additionalCosts = freshPO.additionalCostsItems.reduce((costsSum, cost) => {
                      const costValue = typeof cost.value === 'number' ? cost.value : parseFloat(cost.value) || 0;
                      return costsSum + costValue;
                    }, 0);
                  } else {
                    additionalCosts = typeof freshPO.additionalCosts === 'number' ? freshPO.additionalCosts : parseFloat(freshPO.additionalCosts) || 0;
                  }
                  
                  const grossValue = productsValue + vatValue + additionalCosts;
                  console.log(`Obliczona wartość brutto PO ${freshPO.number}: ${grossValue}`);
                  poTotal += grossValue;
                  return { ...freshPO, totalGross: grossValue };
                }
              } catch (error) {
                console.error(`Błąd podczas pobierania danych PO ${po.id}:`, error);
                // Jeśli nie możemy pobrać danych, używamy aktualnych
                const value = typeof po.totalGross === 'number' ? po.totalGross : parseFloat(po.totalGross) || 0;
                poTotal += value;
                return po;
              }
            })
          );
          
          // Aktualizuj linkedPurchaseOrders na dane z zaktualizowanymi wartościami
          updatedOrderData.linkedPurchaseOrders = updatedPOs;
        }
        
        // Obliczamy aktualną wartość zamówienia uwzględniając koszty produkcji
        const calculateItemTotalValue = (item) => {
          // Podstawowa wartość pozycji
          const itemValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
          
          // Jeśli produkt jest z listy cenowej I ma cenę większą od 0, zwracamy tylko wartość pozycji
          if (item.fromPriceList && parseFloat(item.price || 0) > 0) {
            return itemValue;
          }
          
          // Jeśli produkt nie jest z listy cenowej LUB ma cenę 0, i ma koszt produkcji, dodajemy go
          if (item.productionTaskId && item.productionCost !== undefined) {
            return itemValue + parseFloat(item.productionCost || 0);
          }
          
          // Domyślnie zwracamy tylko wartość pozycji
          return itemValue;
        };
        
        // Oblicz wartość produktów z uwzględnieniem kosztów produkcji
        const subtotal = (updatedOrderData.items || []).reduce((sum, item) => {
          return sum + calculateItemTotalValue(item);
        }, 0);
        
        // Koszt dostawy
        const shippingCost = parseFloat(updatedOrderData.shippingCost) || 0;
        
        // Dodatkowe koszty (tylko pozytywne)
        const additionalCosts = updatedOrderData.additionalCostsItems ? 
          updatedOrderData.additionalCostsItems
            .filter(cost => parseFloat(cost.value) > 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0) : 0;
        
        // Rabaty (wartości ujemne) - jako wartość pozytywna do odjęcia
        const discounts = updatedOrderData.additionalCostsItems ? 
          Math.abs(updatedOrderData.additionalCostsItems
            .filter(cost => parseFloat(cost.value) < 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)) : 0;
        
        // Oblicz całkowitą aktualną wartość zamówienia
        const recalculatedTotalValue = subtotal + shippingCost + additionalCosts - discounts;
        
        // Sprawdź czy wartość się zmieniła w porównaniu do zapisanej w bazie
        const savedTotalValue = parseFloat(updatedOrderData.totalValue) || 0;
        const valueChanged = Math.abs(recalculatedTotalValue - savedTotalValue) > 0.01;
        
                 if (valueChanged) {
           console.log(`Wartość zamówienia ${order.id} została zaktualizowana: ${savedTotalValue} → ${recalculatedTotalValue}`);
           
           // Zaktualizuj zamówienie w bazie danych z nowymi kosztami produkcji i wartością
           try {
             const { updateOrder } = await import('../../services/orderService');
             
             // Przygotuj bezpieczne dane do aktualizacji
             const safeUpdateData = {
               items: updatedOrderData.items,
               totalValue: recalculatedTotalValue,
               orderNumber: updatedOrderData.orderNumber,
               orderDate: updatedOrderData.orderDate, // Wymagane przez walidację
               status: updatedOrderData.status,
               customer: updatedOrderData.customer,
               shippingCost: updatedOrderData.shippingCost,
               additionalCostsItems: updatedOrderData.additionalCostsItems,
               productionTasks: updatedOrderData.productionTasks,
               linkedPurchaseOrders: updatedOrderData.linkedPurchaseOrders
             };
             
             console.log(`[handleRefreshAll] Zapisuję zamówienie ${order.id} z wartością:`, recalculatedTotalValue);
             await updateOrder(updatedOrderData.id, safeUpdateData, 'system');
             console.log(`✅ [handleRefreshAll] Zapisano zamówienie ${order.id} do bazy danych`);
           } catch (error) {
             console.error(`❌ [handleRefreshAll] Błąd podczas aktualizacji wartości zamówienia ${order.id}:`, error);
           }
         } else {
           console.log(`[handleRefreshAll] Wartość zamówienia ${order.id} nie zmieniła się (${recalculatedTotalValue}), pomijam zapis`);
         }
        
        console.log(`Zaktualizowane dane zamówienia ${order.id}: przeliczenieWartości=${recalculatedTotalValue}, produkty=${subtotal}, dostawa=${shippingCost}, PO=${poTotal}`);
        
        return {
          ...updatedOrderData,
          totalValue: recalculatedTotalValue, // Używamy przeliczonej wartości
          productsValue: subtotal,
          purchaseOrdersValue: poTotal,
          shippingCost: shippingCost
        };
      }));
      
      setOrders(updatedOrders);
      showSuccess('Wszystkie dane zostały zaktualizowane');
    } catch (error) {
      console.error('Błąd podczas odświeżania danych zamówień:', error);
      showError('Wystąpił błąd podczas odświeżania danych');
    } finally {
      setLoading(false);
    }
  };

  // Dodajmy funkcję pomocniczą do bezpiecznego renderowania wartości
  const safeRenderValue = (value) => {
    if (value === null || value === undefined) {
      return '-';
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  };

  // Funkcja do formatowania danych dostawcy
  const formatSupplier = (supplier) => {
    if (!supplier) return '-';
    
    if (typeof supplier === 'string') {
      return supplier;
    }
    
    if (typeof supplier === 'object') {
      // Jeśli obiekt ma pole name, użyj go
      if (supplier.name) {
        return supplier.name;
      }
      
      // W przeciwnym razie sformatuj cały obiekt
      try {
        return JSON.stringify(supplier).substring(0, 50) + (JSON.stringify(supplier).length > 50 ? '...' : '');
      } catch (e) {
        return 'Nieprawidłowe dane dostawcy';
      }
    }
    
    return String(supplier);
  };

  // Obsługa sortowania kolumn
  const handleSort = (column) => {
    const isAsc = orderBy === column && orderDirection === 'asc';
    setOrderDirection(isAsc ? 'desc' : 'asc');
    setOrderBy(column);
    setPage(1); // Reset do pierwszej strony
  };

  // Funkcja do odświeżania wartości przed eksportem
  const refreshOrdersForExport = async () => {
    try {
      // Import potrzebnych funkcji
      const { getAllOrders } = await import('../../services/orderService');
      const { getOrderById } = await import('../../services/orderService');
      const { getPurchaseOrderById } = await import('../../services/purchaseOrderService');
      
      // Pobierz wszystkie zamówienia z uwzględnieniem filtrów
      let ordersToRefresh = orders;
      
      // Jeśli mamy więcej niż jedną stronę, pobierz wszystkie zamówienia
      if (totalPages > 1) {
        const allOrdersResult = await getOrdersWithPagination(
          1, // pierwsza strona
          totalItems, // wszystkie elementy
          orderBy,
          orderDirection,
          { ...filters, searchTerm: debouncedSearchTerm }
        );
        ordersToRefresh = allOrdersResult.data;
      }
      
      // Przelicz wartości dla każdego zamówienia
      const updatedOrders = await Promise.all(ordersToRefresh.map(async (order) => {
        console.log(`[Export] Odświeżam wartości zamówienia ${order.id}`);
        
        // Pobierz zaktualizowane pełne dane zamówienia
        const updatedOrderData = await getOrderById(order.id);
        
        // Aktualizuj koszty produkcji dla pozycji zamówienia
        if (updatedOrderData.productionTasks && updatedOrderData.productionTasks.length > 0 && updatedOrderData.items && updatedOrderData.items.length > 0) {
          const { getTaskById } = await import('../../services/productionService');
          const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/costCalculator');
          
          for (let i = 0; i < updatedOrderData.items.length; i++) {
            const item = updatedOrderData.items[i];
            
            // Znajdź powiązane zadanie produkcyjne
            const associatedTask = updatedOrderData.productionTasks?.find(task => 
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
                
                // Aktualizuj informacje o zadaniu produkcyjnym w elemencie zamówienia
                updatedOrderData.items[i] = {
                  ...item,
                  productionTaskId: associatedTask.id,
                  productionTaskNumber: associatedTask.moNumber || taskDetails.moNumber,
                  productionStatus: associatedTask.status || taskDetails.status,
                  productionCost: productionCost,
                  fullProductionCost: fullProductionCost,
                  productionUnitCost: calculatedProductionUnitCost,
                  fullProductionUnitCost: calculatedFullProductionUnitCost
                };
              } catch (error) {
                console.error(`Błąd podczas pobierania szczegółów zadania ${associatedTask.id}:`, error);
                
                // W przypadku błędu, użyj podstawowych danych z associatedTask
                const fullProductionCost = associatedTask.totalFullProductionCost || 0;
                const productionCost = associatedTask.totalMaterialCost || 0;
                
                updatedOrderData.items[i] = {
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
        
        // Oblicz wartość produktów z uwzględnieniem kosztów produkcji
        const calculateItemTotalValue = (item) => {
          const itemValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
          if (item.fromPriceList && parseFloat(item.price || 0) > 0) {
            return itemValue;
          }
          if (item.productionTaskId && item.productionCost !== undefined) {
            return itemValue + parseFloat(item.productionCost || 0);
          }
          return itemValue;
        };
        
        const subtotal = (updatedOrderData.items || []).reduce((sum, item) => {
          return sum + calculateItemTotalValue(item);
        }, 0);
        
        const shippingCost = parseFloat(updatedOrderData.shippingCost) || 0;
        const additionalCosts = updatedOrderData.additionalCostsItems ? 
          updatedOrderData.additionalCostsItems
            .filter(cost => parseFloat(cost.value) > 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0) : 0;
        const discounts = updatedOrderData.additionalCostsItems ? 
          Math.abs(updatedOrderData.additionalCostsItems
            .filter(cost => parseFloat(cost.value) < 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)) : 0;
        
        const recalculatedTotalValue = subtotal + shippingCost + additionalCosts - discounts;
        
        return {
          ...updatedOrderData,
          totalValue: recalculatedTotalValue,
          productsValue: subtotal,
          shippingCost: shippingCost
        };
      }));
      
      // Aktualizuj stan z odświeżonymi danymi
      setOrders(updatedOrders);
      console.log(`[Export] Odświeżono wartości dla ${updatedOrders.length} zamówień`);
      
    } catch (error) {
      console.error('Błąd podczas odświeżania wartości przed eksportem:', error);
      showError('Wystąpił błąd podczas odświeżania wartości');
      throw error; // Przerwij eksport w przypadku błędu
    }
  };

  const handleRefreshMO = async (order) => {
    try {
      setLoading(true);
      showInfo('Odświeżanie danych MO...');
      
      // Import potrzebnych funkcji
      const { getOrderById } = await import('../../services/orderService');
      
      // Pobierz zaktualizowane dane zamówienia
      const updatedOrder = await getOrderById(order.id);
      
      // Aktualizuj koszty produkcji dla pozycji zamówienia
      if (updatedOrder.productionTasks && updatedOrder.productionTasks.length > 0 && updatedOrder.items && updatedOrder.items.length > 0) {
        // Importuj funkcję do pobierania szczegółów zadania
        const { getTaskById } = await import('../../services/productionService');
        const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/costCalculator');
        
        console.log("Aktualizuję koszty produkcji dla zamówienia:", order.id);
        
        for (let i = 0; i < updatedOrder.items.length; i++) {
          const item = updatedOrder.items[i];
          
          // Znajdź powiązane zadanie produkcyjne
          const associatedTask = updatedOrder.productionTasks?.find(task => 
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
              
              // Aktualizuj informacje o zadaniu produkcyjnym w elemencie zamówienia
              updatedOrder.items[i] = {
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
              
              console.log(`Zaktualizowano koszty dla pozycji ${item.name}: koszt podstawowy = ${updatedOrder.items[i].productionCost}€, pełny koszt = ${updatedOrder.items[i].fullProductionCost}€, pełny koszt/szt = ${calculatedFullProductionUnitCost.toFixed(2)}€ (lista cenowa: ${item.fromPriceList ? 'tak' : 'nie'})`);
            } catch (error) {
              console.error(`Błąd podczas pobierania szczegółów zadania ${associatedTask.id}:`, error);
              
              // W przypadku błędu, użyj podstawowych danych z associatedTask
              const fullProductionCost = associatedTask.totalFullProductionCost || 0;
              const productionCost = associatedTask.totalMaterialCost || 0;
              
              updatedOrder.items[i] = {
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
        
        // Zapisz zaktualizowane dane do bazy
        try {
          const { updateOrder } = await import('../../services/orderService');
          
          const safeUpdateData = {
            items: updatedOrder.items,
            orderNumber: updatedOrder.orderNumber,
            orderDate: updatedOrder.orderDate,
            status: updatedOrder.status,
            customer: updatedOrder.customer,
            shippingCost: updatedOrder.shippingCost,
            additionalCostsItems: updatedOrder.additionalCostsItems,
            productionTasks: updatedOrder.productionTasks
          };
          
          await updateOrder(updatedOrder.id, safeUpdateData, 'system');
          
          // Zaktualizuj lokalny stan
          setOrders(prevOrders => prevOrders.map(o => {
            if (o.id === order.id) {
              return { ...o, ...updatedOrder };
            }
            return o;
          }));
          
          showSuccess('Dane MO zostały odświeżone');
        } catch (updateError) {
          console.error('Błąd podczas zapisywania zaktualizowanych danych MO:', updateError);
          showError('Nie udało się zapisać zaktualizowanych danych MO');
        }
      } else {
        showInfo('Brak danych MO do odświeżenia');
      }
    } catch (error) {
      console.error('Błąd podczas odświeżania danych MO:', error);
      showError('Nie udało się odświeżyć danych MO');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshCMRData = async (order) => {
    try {
      setLoading(true);
      showInfo('Odświeżanie danych CMR...');
      
      // Import funkcji do debugowania i odświeżania danych CMR
      const { debugOrderCMRConnections, refreshShippedQuantitiesFromCMR } = await import('../../services/orderService');
      
      // Najpierw uruchom debugowanie aby zobaczyć stan przed odświeżaniem
      console.log('=== ROZPOCZĘCIE DEBUGOWANIA CMR ===');
      await debugOrderCMRConnections(order.id);
      console.log('=== KONIEC DEBUGOWANIA CMR ===');
      
      // Odśwież dane wysłanych ilości na podstawie CMR
      const result = await refreshShippedQuantitiesFromCMR(order.id, currentUser?.uid || 'system');
      
      // Zaktualizuj lokalny stan zamówienia
      setOrders(prevOrders => prevOrders.map(o => {
        if (o.id === order.id) {
          return { 
            ...o, 
            items: result.updatedItems 
          };
        }
        return o;
      }));
      
      // Pokaż statystyki odświeżania
      const { stats } = result;
      showSuccess(
        `Dane CMR zostały odświeżone. ` +
        `Przetworzono ${stats.processedCMRs} CMR, ` +
        `zaktualizowano ${stats.shippedItems} pozycji z ${stats.cmrReferences} odniesieniami do CMR.`
      );
    } catch (error) {
      console.error('Błąd podczas odświeżania danych CMR:', error);
      showError('Nie udało się odświeżyć danych CMR: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Funkcja eksportu zamówień klientów z pozycjami do CSV
  const handleExportOrdersToCSV = async () => {
    try {
      setLoading(true);
      showInfo('Odświeżanie wartości przed eksportem...');
      
      // Najpierw odśwież wszystkie wartości zamówień
      await refreshOrdersForExport();
      
      // Pobierz wszystkie zamówienia z uwzględnieniem aktualnych filtrów
      let exportOrders = orders;
      
      // Jeśli mamy tylko jedną stronę danych, pobieramy wszystkie zamówienia z filtrami
      if (totalPages > 1) {
        const allOrdersResult = await getOrdersWithPagination(
          1, // pierwsza strona
          totalItems, // wszystkie elementy
          orderBy,
          orderDirection,
          { ...filters, searchTerm: debouncedSearchTerm }
        );
        exportOrders = allOrdersResult.data;
      }

      // Pobierz nazwy użytkowników dla pól "Utworzone przez"
      const createdByUserIds = exportOrders
        .map(order => order.createdBy)
        .filter(id => id)
        .filter((id, index, array) => array.indexOf(id) === index); // usuń duplikaty
      
      let userNames = {};
      if (createdByUserIds.length > 0) {
        try {
          userNames = await getUsersDisplayNames(createdByUserIds);
        } catch (error) {
          console.error('Błąd podczas pobierania nazw użytkowników:', error);
        }
      }

      // Przygotuj dane do eksportu - każda pozycja zamówienia jako osobny wiersz
      const exportData = [];
      
      exportOrders.forEach(order => {
        if (order.items && order.items.length > 0) {
          order.items.forEach((item, itemIndex) => {
            // Znajdź powiązane zadanie produkcyjne dla tej pozycji
            let associatedTask = null;
            if (order.productionTasks && order.productionTasks.length > 0) {
              // Najpierw szukaj po orderItemId (najdokładniejsze dopasowanie)
              associatedTask = order.productionTasks.find(task => 
                task.orderItemId && task.orderItemId === item.id
              );
              
              // Jeśli nie znaleziono po orderItemId, spróbuj dopasować po nazwie i ilości
              if (!associatedTask) {
                associatedTask = order.productionTasks.find(task => 
                  task.productName === item.name && 
                  parseFloat(task.quantity) === parseFloat(item.quantity) &&
                  !order.productionTasks.some(t => t.orderItemId === item.id) // upewnij się, że zadanie nie jest już przypisane
                );
              }
            }

            // Pobierz dane zadania produkcyjnego - priorytet dla danych z order.productionTasks
            const productionTaskId = associatedTask?.id || item.productionTaskId || '';
            const productionTaskNumber = associatedTask?.moNumber || item.productionTaskNumber || '';
            const productionStatus = associatedTask?.status || item.productionStatus || '';
            
            // Oblicz wartość pozycji z uwzględnieniem kosztów produkcji
            const itemValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
            let totalItemValue = itemValue;
            
            // Jeśli produkt nie jest z listy cenowej LUB ma cenę 0, i ma koszt produkcji, dodaj go
            if ((!item.fromPriceList || parseFloat(item.price || 0) === 0) && (associatedTask || item.productionTaskId) && item.productionCost !== undefined) {
              totalItemValue += parseFloat(item.productionCost || 0);
            }

            // Pobierz poprawny adres klienta (priorytet: shippingAddress > billingAddress > address)
            const customerAddress = order.customer?.shippingAddress || 
                                   order.customer?.billingAddress || 
                                   order.customer?.address || '';

            exportData.push({
              orderNumber: order.orderNumber || order.id,
              orderDate: formatDateForExport(order.orderDate),
              customerName: order.customer?.name || 'Nieznany klient',
              customerEmail: order.customer?.email || '',
              customerPhone: order.customer?.phone || '',
              customerAddress: customerAddress,
              orderStatus: order.status || '',
              itemNumber: itemIndex + 1,
              itemName: item.name || '',
              itemDescription: item.description || '',
              itemQuantity: parseFloat(item.quantity) || 0,
              itemUnit: item.unit || 'szt.',
              itemPrice: parseFloat(item.price) || 0,
              itemValue: Number(itemValue.toFixed(2)),
              itemFromPriceList: item.fromPriceList,
              productionTaskId: productionTaskId,
              productionTaskNumber: productionTaskNumber,
              productionStatus: productionStatus,
              productionCost: Number((parseFloat(item.productionCost || 0)).toFixed(2)),
              totalItemValue: Number(totalItemValue.toFixed(2)),
              expectedDeliveryDate: formatDateForExport(order.expectedDeliveryDate),
              deadline: formatDateForExport(order.deadline),
              deliveryDate: formatDateForExport(order.deliveryDate),
              shippingCost: Number((parseFloat(order.shippingCost || 0)).toFixed(2)),
              orderTotalValue: Number((parseFloat(order.totalValue || 0)).toFixed(2)),
              paymentStatus: order.paymentStatus || '',
              notes: order.notes || '',
              createdBy: userNames[order.createdBy] || order.createdBy || '',
              createdAt: formatDateForExport(order.createdAt),
              updatedAt: formatDateForExport(order.updatedAt)
            });
          });
        } else {
          // Jeśli zamówienie nie ma pozycji, dodaj wiersz z danymi zamówienia
          const customerAddress = order.customer?.shippingAddress || 
                                 order.customer?.billingAddress || 
                                 order.customer?.address || '';

          exportData.push({
            orderNumber: order.orderNumber || order.id,
            orderDate: formatDateForExport(order.orderDate),
            customerName: order.customer?.name || 'Nieznany klient',
            customerEmail: order.customer?.email || '',
            customerPhone: order.customer?.phone || '',
            customerAddress: customerAddress,
            orderStatus: order.status || '',
            itemNumber: 0,
            itemName: 'BRAK POZYCJI',
            itemDescription: '',
            itemQuantity: 0,
            itemUnit: '',
            itemPrice: 0,
            itemValue: 0,
            itemFromPriceList: false,
            productionTaskId: '',
            productionTaskNumber: '',
            productionStatus: '',
            productionCost: 0,
            totalItemValue: 0,
            expectedDeliveryDate: formatDateForExport(order.expectedDeliveryDate),
            deadline: formatDateForExport(order.deadline),
            deliveryDate: formatDateForExport(order.deliveryDate),
            shippingCost: Number((parseFloat(order.shippingCost || 0)).toFixed(2)),
            orderTotalValue: Number((parseFloat(order.totalValue || 0)).toFixed(2)),
            paymentStatus: order.paymentStatus || '',
            notes: order.notes || '',
            createdBy: userNames[order.createdBy] || order.createdBy || '',
            createdAt: formatDateForExport(order.createdAt),
            updatedAt: formatDateForExport(order.updatedAt)
          });
        }
      });

      // Definicja nagłówków dla CSV
      const headers = [
        { label: 'Numer zamówienia', key: 'orderNumber' },
        { label: 'Data zamówienia', key: 'orderDate' },
        { label: 'Nazwa klienta', key: 'customerName' },
        { label: 'Email klienta', key: 'customerEmail' },
        { label: 'Telefon klienta', key: 'customerPhone' },
        { label: 'Adres klienta', key: 'customerAddress' },
        { label: 'Status zamówienia', key: 'orderStatus' },
        { label: 'Nr pozycji', key: 'itemNumber' },
        { label: 'Nazwa produktu', key: 'itemName' },
        { label: 'Opis produktu', key: 'itemDescription' },
        { label: 'Ilość', key: 'itemQuantity' },
        { label: 'Jednostka', key: 'itemUnit' },
        { label: 'Cena jednostkowa', key: 'itemPrice' },
        { label: 'Wartość pozycji', key: 'itemValue' },
        { label: 'Z listy cenowej', key: 'itemFromPriceList' },
        { label: 'ID zadania produkcyjnego', key: 'productionTaskId' },
        { label: 'Numer MO', key: 'productionTaskNumber' },
        { label: 'Status produkcji', key: 'productionStatus' },
        { label: 'Koszt produkcji', key: 'productionCost' },
        { label: 'Łączna wartość pozycji', key: 'totalItemValue' },
        { label: 'Planowana dostawa', key: 'expectedDeliveryDate' },
        { label: 'Termin realizacji', key: 'deadline' },
        { label: 'Data dostawy', key: 'deliveryDate' },
        { label: 'Koszt dostawy', key: 'shippingCost' },
        { label: 'Łączna wartość zamówienia', key: 'orderTotalValue' },
        { label: 'Status płatności', key: 'paymentStatus' },
        { label: 'Uwagi', key: 'notes' },
        { label: 'Utworzone przez', key: 'createdBy' },
        { label: 'Data utworzenia', key: 'createdAt' },
        { label: 'Data aktualizacji', key: 'updatedAt' }
      ];

      // Wygeneruj plik CSV
      const currentDate = new Date().toISOString().slice(0, 10);
      const filename = `zamowienia_klientow_pozycje_${currentDate}`;
      const success = exportToCSV(exportData, headers, filename);

      if (success) {
        showSuccess(`Odświeżono wartości i wyeksportowano ${exportData.length} pozycji z ${exportOrders.length} zamówień do pliku CSV`);
      } else {
        showError('Nie udało się wyeksportować zamówień do CSV');
      }
    } catch (error) {
      console.error('Błąd podczas eksportu CSV:', error);
      showError('Wystąpił błąd podczas eksportu: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 2, sm: 0 } }}>
        <Typography variant="h4" component="h1">
          Zamówienia klientów
        </Typography>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1, width: { xs: '100%', sm: 'auto' } }}>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<CustomersIcon />}
            onClick={() => navigate('/customers')}
            sx={{ width: '100%' }}
          >
            Zarządzaj klientami
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleAddOrder}
            sx={{ width: '100%' }}
          >
            Nowe zamówienie
          </Button>
        </Box>
      </Box>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <TextField
            placeholder="Szukaj zamówień..."
            variant="outlined"
            size="small"
            value={searchTerm}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: searchTerm && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchTerm('')}>
                    <ClearIcon />
                  </IconButton>
                </InputAdornment>
              )
            }}
            sx={{ width: 300 }}
          />

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button 
              variant="outlined" 
              color="secondary" 
              startIcon={<DownloadIcon />}
              onClick={handleExportOrdersToCSV}
              disabled={loading}
            >
              {loading ? 'Eksportowanie...' : 'Eksportuj CSV'}
            </Button>
            <Button 
              variant={showFilters ? "contained" : "outlined"} 
              startIcon={<FilterListIcon />}
              onClick={() => setShowFilters(!showFilters)}
              color={showFilters ? "primary" : "inherit"}
            >
              Filtry
            </Button>
            <Button 
              variant="outlined" 
              startIcon={<RefreshIcon />}
              onClick={handleRefreshAll}
              disabled={loading}
              sx={{ minWidth: 150 }}
            >
              {loading ? 'Odświeżanie...' : 'Odśwież wartości'}
            </Button>
          </Box>
        </Box>

        <Collapse in={showFilters}>
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Status</InputLabel>
                    <Select
                      name="status"
                      value={filters.status}
                      onChange={handleFilterChange}
                      label="Status"
                    >
                      <MenuItem value="all">Wszystkie</MenuItem>
                      {ORDER_STATUSES.map(status => (
                        <MenuItem key={status.value} value={status.value}>
                          {status.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Od daty"
                    type="date"
                    name="fromDate"
                    value={filters.fromDate}
                    onChange={handleFilterChange}
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ max: filters.toDate || undefined }}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Do daty"
                    type="date"
                    name="toDate"
                    value={filters.toDate}
                    onChange={handleFilterChange}
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: filters.fromDate || undefined }}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Klient</InputLabel>
                    <Select
                      name="customerId"
                      value={filters.customerId}
                      onChange={handleFilterChange}
                      label="Klient"
                      disabled={customersLoading}
                    >
                      <MenuItem value="">Wszyscy klienci</MenuItem>
                      {customers.map(customer => (
                        <MenuItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                      variant="contained" 
                      onClick={applyFilters}
                      fullWidth
                    >
                      Zastosuj filtry
                    </Button>
                    <Button 
                      variant="outlined" 
                      onClick={resetFilters}
                      color="inherit"
                    >
                      Resetuj
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Collapse>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, mb: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table sx={{ minWidth: 800 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Szczegóły</TableCell>
                    <TableCell 
                      onClick={() => handleSort('orderNumber')}
                      style={{ cursor: 'pointer' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        Numer 
                        {orderBy === 'orderNumber' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: orderDirection === 'asc' ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.2s'
                            }} 
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell 
                      onClick={() => handleSort('customer.name')}
                      style={{ cursor: 'pointer' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        Klient
                        {orderBy === 'customer.name' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: orderDirection === 'asc' ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.2s'
                            }} 
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell 
                      onClick={() => handleSort('orderDate')}
                      style={{ cursor: 'pointer' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        Data
                        {orderBy === 'orderDate' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: orderDirection === 'asc' ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.2s'
                            }} 
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell 
                      onClick={() => handleSort('expectedDeliveryDate')}
                      style={{ cursor: 'pointer' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        Termin dostawy
                        {orderBy === 'expectedDeliveryDate' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: orderDirection === 'asc' ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.2s'
                            }} 
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell 
                      onClick={() => handleSort('totalValue')}
                      style={{ cursor: 'pointer' }}
                      align="right"
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        Wartość
                        {orderBy === 'totalValue' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: orderDirection === 'asc' ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.2s'
                            }} 
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">Akcje</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displayedOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center">
                        Brak zamówień
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayedOrders.map((order) => (
                      <React.Fragment key={order.id}>
                        <TableRow hover>
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={() => toggleExpand(order.id)}
                            >
                              {expandedOrderId === order.id ? (
                                <KeyboardArrowUpIcon />
                              ) : (
                                <KeyboardArrowDownIcon />
                              )}
                            </IconButton>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              {order.orderNumber || (order.id && order.id.substring(0, 8).toUpperCase())}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              {typeof order.customer === 'object' && order.customer !== null 
                                ? (order.customer?.name || 'Brak danych klienta') 
                                : String(order.customer) || 'Brak danych klienta'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={order.status} 
                              size="small"
                              clickable
                              onClick={() => handleStatusClick(order)}
                              sx={{
                                backgroundColor: getStatusChipColor(order.status),
                                color: 'white',
                                cursor: 'pointer',
                                '&:hover': {
                                  opacity: 0.8
                                }
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                            {order.orderDate ? (
                              typeof order.orderDate === 'object' && typeof order.orderDate.toDate === 'function' 
                                ? formatDate(order.orderDate.toDate(), false)
                                : formatDate(order.orderDate, false)
                            ) : '-'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                            {order.deadline ? (
                              typeof order.deadline === 'object' && typeof order.deadline.toDate === 'function' 
                                ? formatDate(order.deadline.toDate(), false)
                                : formatDate(order.deadline, false)
                            ) : '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                              <Typography variant="body2" fontWeight="medium">
                                {formatCurrency(order.totalValue || 0)}
                              </Typography>
                              {order.purchaseOrdersValue > 0 && (
                                <Typography variant="caption" color="text.secondary">
                                  (PO: {formatCurrency(order.purchaseOrdersValue || 0)})
                                </Typography>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="Edytuj">
                              <IconButton
                                size="small"
                                onClick={() => handleEditOrder(order.id)}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Szczegóły">
                              <IconButton
                                size="small"
                                onClick={() => handleViewOrderDetails(order.id)}
                                color="primary"
                              >
                                <EventNoteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Usuń">
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteOrderClick(order)}
                                color="error"
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>

                        {/* Expanded details */}
                        <TableRow>
                          <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
                            <Collapse in={expandedOrderId === order.id} timeout="auto" unmountOnExit>
                              <Box sx={{ py: 2, px: 2 }}>
                                <Typography variant="h6" gutterBottom component="div">
                                  Szczegóły zamówienia
                                </Typography>

                                <Grid container spacing={2}>
                                  <Grid item xs={12} md={6}>
                                    <Typography variant="subtitle2">Kontakt:</Typography>
                                    <Typography variant="body2">
                                      Email: {typeof order.customer?.email === 'object' 
                                        ? JSON.stringify(order.customer.email) 
                                        : (order.customer?.email || '-')}
                                    </Typography>
                                    <Typography variant="body2">
                                      Telefon: {typeof order.customer?.phone === 'object' 
                                        ? JSON.stringify(order.customer.phone) 
                                        : (order.customer?.phone || '-')}
                                    </Typography>
                                    <Typography variant="body2">
                                      Adres: {typeof order.customer?.address === 'object' 
                                        ? JSON.stringify(order.customer.address) 
                                        : (order.customer?.address || '-')}
                                    </Typography>
                                  </Grid>

                                  <Grid item xs={12} md={6}>
                                    <Typography variant="subtitle2">Informacje o płatności:</Typography>
                                    <Typography variant="body2">
                                      Metoda: {typeof order.paymentMethod === 'object'
                                        ? JSON.stringify(order.paymentMethod)
                                        : (order.paymentMethod || '-')}
                                    </Typography>
                                    <Typography variant="body2">
                                      Status: {typeof order.paymentStatus === 'object'
                                        ? JSON.stringify(order.paymentStatus)
                                        : (order.paymentStatus || '-')}
                                    </Typography>
                                    <Typography variant="body2">
                                      Dostawa: {typeof order.shippingMethod === 'object'
                                        ? JSON.stringify(order.shippingMethod)
                                        : (order.shippingMethod || '-')} 
                                      ({formatCurrency(order.shippingCost || 0)})
                                    </Typography>
                                  </Grid>

                                  <Grid item xs={12}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                      <Typography variant="subtitle2">
                                        Produkty:
                                      </Typography>
                                      <Box sx={{ display: 'flex', gap: 1 }}>
                                        <Button
                                          size="small"
                                          startIcon={<RefreshIcon />}
                                          onClick={() => handleRefreshMO(order)}
                                          title="Odśwież dane MO"
                                        >
                                          Odśwież MO
                                        </Button>
                                        <Button
                                          size="small"
                                          startIcon={<RefreshIcon />}
                                          onClick={() => handleRefreshCMRData(order)}
                                          title="Odśwież dane wysłanych ilości z CMR"
                                          variant="outlined"
                                          color="secondary"
                                        >
                                          Odśwież CMR
                                        </Button>
                                      </Box>
                                    </Box>
                                    <TableContainer component={Paper} variant="outlined">
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>Produkt</TableCell>
                                            <TableCell align="right">Ilość</TableCell>
                                            <TableCell align="right">Zarezerwowane</TableCell>
                                            <TableCell align="right">Cena</TableCell>
                                            <TableCell align="right">Wartość</TableCell>
                                            <TableCell>MO</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {order.items && Array.isArray(order.items) && order.items.map((item, index) => (
                                            <TableRow key={index}>
                                              <TableCell>{typeof item.name === 'object' ? JSON.stringify(item.name) : (item.name || '-')}</TableCell>
                                              <TableCell align="right">
                                                {item.quantity} {typeof item.unit === 'object' ? JSON.stringify(item.unit) : (item.unit || '')}
                                              </TableCell>
                                              <TableCell align="right">
                                                {(() => {
                                                  // Oblicz łączną ilość wysłaną z historii CMR
                                                  const totalShippedFromCMR = item.cmrHistory && Array.isArray(item.cmrHistory) ? 
                                                    item.cmrHistory.reduce((total, cmrEntry) => {
                                                      return total + (parseFloat(cmrEntry.quantity) || 0);
                                                    }, 0) : 0;
                                                  
                                                  // Użyj ilości z historii CMR lub fallback na shippedQuantity
                                                  const displayQuantity = totalShippedFromCMR > 0 ? totalShippedFromCMR : (parseFloat(item.shippedQuantity) || 0);
                                                  const orderedQuantity = parseFloat(item.quantity) || 0;
                                                  
                                                  // Sprawdź czy pozycja jest w pełni wysłana
                                                  const isFullyShipped = displayQuantity >= orderedQuantity;
                                                  const hasHistory = item.cmrHistory && item.cmrHistory.length > 0;
                                                  
                                                  return (
                                                    <div>
                                                      <Typography 
                                                        variant="body2"
                                                        style={{ 
                                                          color: isFullyShipped ? '#4caf50' : '#ff9800',
                                                          fontWeight: 'bold'
                                                        }}
                                                      >
                                                        {displayQuantity.toLocaleString()} / {orderedQuantity.toLocaleString()}
                                                      </Typography>
                                                      
                                                      {hasHistory && (
                                                        <div style={{ marginTop: '4px' }}>
                                                          {item.cmrHistory.map((cmrEntry, cmrIndex) => (
                                                            <Typography 
                                                              key={cmrIndex}
                                                              variant="caption" 
                                                              style={{ 
                                                                display: 'block', 
                                                                fontSize: '0.7rem',
                                                                color: '#666',
                                                                lineHeight: '1.2'
                                                              }}
                                                            >
                                                              {cmrEntry.cmrNumber}: {parseFloat(cmrEntry.quantity || 0).toLocaleString()} {cmrEntry.unit || 'szt.'}
                                                              {cmrEntry.shipmentDate && (
                                                                <span style={{ color: '#999', marginLeft: '4px' }}>
                                                                  ({new Date(cmrEntry.shipmentDate).toLocaleDateString('pl-PL')})
                                                                </span>
                                                              )}
                                                            </Typography>
                                                          ))}
                                                        </div>
                                                      )}
                                                      
                                                      {!hasHistory && displayQuantity > 0 && (
                                                        <Typography 
                                                          variant="caption" 
                                                          style={{ 
                                                            display: 'block', 
                                                            fontSize: '0.7rem',
                                                            color: '#999'
                                                          }}
                                                        >
                                                          {item.lastCmrNumber && `Ostatni CMR: ${item.lastCmrNumber}`}
                                                        </Typography>
                                                      )}
                                                    </div>
                                                  );
                                                })()}
                                              </TableCell>
                                              <TableCell align="right">
                                                {formatCurrency(parseFloat(item.price) || 0)}
                                              </TableCell>
                                              <TableCell align="right">
                                                {formatCurrency((parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0))}
                                              </TableCell>
                                              <TableCell>
                                                {(() => {
                                                  // Sprawdź najpierw bezpośrednie pola w pozycji
                                                  if (item.productionTaskId && item.productionTaskNumber) {
                                                    return (
                                                      <Link
                                                        component={RouterLink}
                                                        to={`/production/tasks/${item.productionTaskId}`}
                                                        sx={{ 
                                                          textDecoration: 'none',
                                                          fontWeight: 'medium',
                                                          '&:hover': {
                                                            textDecoration: 'underline'
                                                          }
                                                        }}
                                                      >
                                                        <Chip
                                                          label={item.productionTaskNumber}
                                                          color="primary"
                                                          size="small"
                                                          variant="outlined"
                                                          clickable
                                                        />
                                                      </Link>
                                                    );
                                                  }
                                                  
                                                  // Jeśli nie ma bezpośrednich pól, szukaj w order.productionTasks
                                                  if (order.productionTasks && order.productionTasks.length > 0) {
                                                    const matchingTask = order.productionTasks.find(task => 
                                                      task.orderItemId === item.id || 
                                                      (task.productName === item.name && task.quantity == item.quantity)
                                                    );
                                                    
                                                    if (matchingTask) {
                                                      return (
                                                        <Link
                                                          component={RouterLink}
                                                          to={`/production/tasks/${matchingTask.id}`}
                                                          sx={{ 
                                                            textDecoration: 'none',
                                                            fontWeight: 'medium',
                                                            '&:hover': {
                                                              textDecoration: 'underline'
                                                            }
                                                          }}
                                                        >
                                                          <Chip
                                                            label={matchingTask.moNumber}
                                                            color="primary"
                                                            size="small"
                                                            variant="outlined"
                                                            clickable
                                                          />
                                                        </Link>
                                                      );
                                                    }
                                                  }
                                                  
                                                  // Jeśli nic nie znaleziono, pokaż myślnik
                                                  return (
                                                    <Typography variant="body2" color="text.secondary">
                                                      -
                                                    </Typography>
                                                  );
                                                })()}
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>
                                  </Grid>

                                  <Grid item xs={12}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <Typography variant="subtitle2" gutterBottom>
                                        Powiązane zamówienia zakupu:
                                      </Typography>
                                      <Button
                                        size="small"
                                        startIcon={<RefreshIcon />}
                                        onClick={() => handleRefreshOrder(order)}
                                      >
                                        Odśwież dane PO
                                      </Button>
                                    </Box>
                                    {order.linkedPurchaseOrders && Array.isArray(order.linkedPurchaseOrders) && order.linkedPurchaseOrders.length > 0 ? (
                                      <TableContainer component={Paper} variant="outlined">
                                        <Table size="small">
                                          <TableHead>
                                            <TableRow sx={{ bgcolor: 'primary.light' }}>
                                              <TableCell>Numer PO</TableCell>
                                              <TableCell>Dostawca</TableCell>
                                              <TableCell align="right">Wartość</TableCell>
                                              <TableCell>Status</TableCell>
                                              <TableCell></TableCell>
                                            </TableRow>
                                          </TableHead>
                                          <TableBody>
                                            {order.linkedPurchaseOrders.map((po, index) => (
                                              <TableRow key={index} hover>
                                                <TableCell>
                                                  <Chip 
                                                    label={typeof po.number === 'object' ? JSON.stringify(po.number) : (po.number || '-')} 
                                                    color="primary" 
                                                    variant="outlined" 
                                                    size="small"
                                                    icon={<ShoppingCartIcon fontSize="small" />}
                                                    sx={{ fontWeight: 'bold' }}
                                                  />
                                                </TableCell>
                                                <TableCell>{formatSupplier(po.supplier)}</TableCell>
                                                <TableCell align="right">
                                                  {(() => {
                                                    try {
                                                    // Jeśli zamówienie ma już wartość brutto, używamy jej
                                                    if (po.totalGross !== undefined && po.totalGross !== null) {
                                                      return formatCurrency(parseFloat(po.totalGross));
                                                    }
                                                    
                                                    // W przeciwnym razie obliczamy wartość brutto
                                                    const productsValue = parseFloat(po.value) || 0;
                                                    const vatRate = parseFloat(po.vatRate) || 23;
                                                    const vatValue = (productsValue * vatRate) / 100;
                                                    
                                                    // Sprawdzenie różnych formatów dodatkowych kosztów
                                                    let additionalCosts = 0;
                                                    if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
                                                      additionalCosts = po.additionalCostsItems.reduce((costsSum, cost) => {
                                                        return costsSum + (parseFloat(cost.value) || 0);
                                                      }, 0);
                                                    } else {
                                                        additionalCosts = typeof po.additionalCosts === 'number' ? po.additionalCosts : parseFloat(po.additionalCosts) || 0;
                                                    }
                                                    
                                                    // Wartość brutto: produkty + VAT + dodatkowe koszty
                                                    const grossValue = productsValue + vatValue + additionalCosts;
                                                    
                                                    return formatCurrency(grossValue);
                                                    } catch (error) {
                                                      console.error("Błąd obliczenia wartości PO:", error);
                                                      return formatCurrency(0);
                                                    }
                                                  })()}
                                                </TableCell>
                                                <TableCell>
                                                  <Chip 
                                                    label={typeof po.status === 'object' ? JSON.stringify(po.status) : (po.status || "Robocze")} 
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
                                                    onClick={() => typeof po.id === 'string' ? navigate(`/purchase-orders/${po.id}`) : null}
                                                    disabled={typeof po.id !== 'string'}
                                                  >
                                                    Szczegóły
                                                  </Button>
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </TableContainer>
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">
                                        Brak powiązanych zamówień zakupu.
                                      </Typography>
                                    )}
                                  </Grid>

                                  <Grid item xs={12}>
                                    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1, border: '1px solid #eee', p: 2, borderRadius: 1 }}>
                                      <Typography variant="subtitle1" fontWeight="bold">Podsumowanie wartości:</Typography>
                                      <Grid container spacing={2}>
                                        <Grid item xs={4}>
                                          <Typography variant="body2">Wartość produktów:</Typography>
                                          <Typography variant="h6">{formatCurrency(order.productsValue || 0)}</Typography>
                                        </Grid>
                                        <Grid item xs={4}>
                                          <Typography variant="body2">Koszt dostawy:</Typography>
                                          <Typography variant="h6">{formatCurrency(order.shippingCost || 0)}</Typography>
                                        </Grid>
                                        <Grid item xs={4}>
                                          <Typography variant="body2">Wartość PO:</Typography>
                                          <Typography variant="h6" color="warning.main">{formatCurrency(order.purchaseOrdersValue || 0)}</Typography>
                                        </Grid>
                                        <Grid item xs={12}>
                                          <Divider sx={{ my: 1 }} />
                                          <Typography variant="subtitle1" fontWeight="bold">
                                            Łączna wartość: {formatCurrency((order.productsValue || 0) + (order.shippingCost || 0))}
                                          </Typography>
                                          <Typography variant="body2" color="text.secondary">
                                            (bez wartości PO)
                                          </Typography>
                                        </Grid>
                                      </Grid>
                                    </Box>
                                  </Grid>

                                  <Grid item xs={12}>
                                    <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                                      <Typography variant="subtitle2">Zmień status:</Typography>
                                      {ORDER_STATUSES.map(status => {
                                        // Sprawdź czy order.status jest prymitywem, jeśli nie - konwertuj do stringa
                                        const orderStatus = typeof order.status === 'object' ? JSON.stringify(order.status) : String(order.status || '');
                                        const statusValue = typeof status.value === 'object' ? JSON.stringify(status.value) : String(status.value || '');
                                        
                                        return orderStatus !== statusValue && (
                                          <Button 
                                            key={statusValue}
                                            variant="outlined"
                                            size="small"
                                            onClick={() => handleStatusChangeClick(order, status.value)}
                                            sx={{
                                              borderColor: getStatusChipColor(status.value),
                                              color: getStatusChipColor(status.value),
                                              '&:hover': {
                                                backgroundColor: getStatusChipColor(status.value) + '20',
                                                borderColor: getStatusChipColor(status.value)
                                              }
                                            }}
                                          >
                                            {status.label}
                                          </Button>
                                        );
                                      })}
                                    </Box>
                                  </Grid>
                                </Grid>
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Komponent paginacji */}
            <TablePagination
              rowsPerPageOptions={[5, 10, 25, 50]}
              component="div"
              count={totalItems}
              rowsPerPage={rowsPerPage}
              page={page - 1} // Odejmujemy 1, bo MUI TablePagination używa indeksowania od 0
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              labelRowsPerPage="Wierszy na stronie:"
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} z ${count}`}
            />
          </>
        )}
      </Paper>

      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={!!orderToDelete}
        onClose={handleCancelDelete}
      >
        <DialogTitle>Czy na pewno chcesz usunąć to zamówienie?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {orderToDelete && (
              <>
                Zamówienie #{orderToDelete.id && orderToDelete.id.substring(0, 8).toUpperCase()} 
                złożone przez {typeof orderToDelete.customer === 'object' && orderToDelete.customer !== null 
                  ? (orderToDelete.customer.name || '(brak danych)') 
                  : String(orderToDelete.customer) || '(brak danych)'}
                {' '}o wartości {formatCurrency(orderToDelete.totalValue || 0)} 
                zostanie trwale usunięte.
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>Anuluj</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            Usuń
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog zmiany statusu */}
      <Dialog
        open={!!statusChangeInfo}
        onClose={handleCancelStatusChange}
      >
        <DialogTitle>Zmiana statusu zamówienia</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {statusChangeInfo && (
              <>
                Zmienić status zamówienia #{statusChangeInfo.orderNumber}
                z "{statusChangeInfo.currentStatus}" na "{statusChangeInfo.newStatus}"?
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelStatusChange}>Anuluj</Button>
          <Button onClick={handleConfirmStatusChange} color="primary" variant="contained">
            Zmień status
          </Button>
        </DialogActions>
      </Dialog>

      {/* Nowy dialog zmiany statusu (podobnie jak w PO) */}
      <Dialog
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
      >
        <DialogTitle>Zmiana statusu zamówienia</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wybierz nowy status dla zamówienia:
            {orderToUpdateStatus && (
              <>
                <br />
                Numer: {orderToUpdateStatus.orderNumber || `#${orderToUpdateStatus.id.substring(0, 8).toUpperCase()}`}
              </>
            )}
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel id="new-status-label">Status</InputLabel>
            <Select
              labelId="new-status-label"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              label="Status"
            >
              {ORDER_STATUSES.map((status) => (
                <MenuItem key={status.value} value={status.value}>
                  {status.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Anuluj</Button>
          <Button color="primary" onClick={handleStatusUpdate}>Zaktualizuj</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OrdersList; 