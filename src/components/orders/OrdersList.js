import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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
  Divider
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
  ShoppingCart as ShoppingCartIcon
} from '@mui/icons-material';
import { 
  getAllOrders, 
  deleteOrder, 
  updateOrderStatus, 
  getOrderById,
  ORDER_STATUSES 
} from '../../services/orderService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate, formatTimestamp, formatDateForInput } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatUtils';
import { getRecipeById } from '../../services/recipeService';

const OrdersList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
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

  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    fetchOrders();
    fetchCustomers();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      
      const data = await getAllOrders();
      console.log("Pobrano zamówienia:", data);
      
      if (!data || !Array.isArray(data) || data.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      // Zaktualizuj wartości dla każdego zamówienia
      const updatedOrders = await Promise.all(data.map(async (order) => {
        // Jeśli zamówienie ma powiązane PO, pobierz pełne dane zamówienia i wszystkich PO
        if (order.linkedPurchaseOrders && order.linkedPurchaseOrders.length > 0) {
          console.log(`Zamówienie ${order.id} ma powiązane PO, pobieranie pełnych danych...`);
          
          // Pobierz pełne dane zamówienia
          const fullOrderData = await getOrderById(order.id);
          console.log(`Pobrano pełne dane zamówienia ${order.id}`, fullOrderData);
          
          // Oblicz wartość PO
        let poTotal = 0;
        
          if (fullOrderData.linkedPurchaseOrders && Array.isArray(fullOrderData.linkedPurchaseOrders)) {
            // Dla każdego powiązanego PO, oblicz jego wartość brutto
            poTotal = fullOrderData.linkedPurchaseOrders.reduce((sum, po) => {
              console.log("Przetwarzanie PO:", po);
              
              // Jeśli zamówienie zakupu ma już obliczoną wartość brutto, używamy jej
            if (po.totalGross !== undefined && po.totalGross !== null) {
                const grossValue = typeof po.totalGross === 'number' ? po.totalGross : parseFloat(po.totalGross) || 0;
                console.log(`Używam istniejącej wartości totalGross dla ${po.number}: ${grossValue}`);
                return sum + grossValue;
              }
              
              console.log(`Brak wartości totalGross dla PO ${po.number}, obliczam ręcznie`);
              
              // Wartość produktów
              const productsValue = typeof po.value === 'number' ? po.value : parseFloat(po.value) || 0;
              
              // Stawka VAT i wartość podatku VAT
              const vatRate = typeof po.vatRate === 'number' ? po.vatRate : parseFloat(po.vatRate) || 0;
            const vatValue = (productsValue * vatRate) / 100;
            
              // Dodatkowe koszty
            let additionalCosts = 0;
            if (po.additionalCostsItems && Array.isArray(po.additionalCostsItems)) {
              additionalCosts = po.additionalCostsItems.reduce((costsSum, cost) => {
                  const costValue = typeof cost.value === 'number' ? cost.value : parseFloat(cost.value) || 0;
                  return costsSum + costValue;
              }, 0);
            } else {
                additionalCosts = typeof po.additionalCosts === 'number' ? po.additionalCosts : parseFloat(po.additionalCosts) || 0;
            }
            
              // Obliczanie wartości brutto zamówienia zakupu
            const grossValue = productsValue + vatValue + additionalCosts;
              console.log(`Obliczona wartość PO ${po.number}: ${grossValue}`);
            
            return sum + grossValue;
          }, 0);
        }
        
          // Obliczamy wartość produktów, sprawdzając czy nie ma aktualizacji cen na podstawie kosztu procesowego
          const subtotal = await Promise.all((fullOrderData.items || []).map(async (item) => {
            const quantity = parseFloat(item.quantity) || 0;
            let price = parseFloat(item.price) || 0;
            
            // Sprawdź, czy produkt jest recepturą bez ceny z listy cenowej
            if ((item.isRecipe || item.itemType === 'recipe') && item.id && !item.fromPriceList && price === 0) {
              try {
                // Pobierz recepturę, aby sprawdzić koszt procesowy
                const recipe = await getRecipeById(item.id);
                if (recipe && recipe.processingCostPerUnit) {
                  // Użyj kosztu procesowego jako ceny
                  price = recipe.processingCostPerUnit;
                  console.log(`Użyto kosztu procesowego ${price} EUR dla produktu ${item.name} w zamówieniu ${order.id}`);
                }
              } catch (error) {
                console.error(`Błąd podczas pobierania receptury dla ${item.name}:`, error);
              }
            }
            
            return quantity * price;
          })).then(values => values.reduce((sum, value) => sum + value, 0));
          
          // Dodanie kosztów dostawy
          const shippingCost = parseFloat(fullOrderData.shippingCost) || 0;
        
        // Łączna wartość zamówienia
        const totalValue = subtotal + shippingCost + poTotal;
          
          console.log(`Zaktualizowane wartości zamówienia ${order.id}: produkty=${subtotal}, dostawa=${shippingCost}, PO=${poTotal}, razem=${totalValue}`);
        
        return {
            ...fullOrderData,
          totalValue: totalValue,
          productsValue: subtotal,
          purchaseOrdersValue: poTotal,
          shippingCost: shippingCost
        };
        } else {
          // Jeśli zamówienie nie ma powiązanych PO, oblicz tylko wartość produktów
          const subtotal = await Promise.all((order.items || []).map(async (item) => {
            const quantity = parseFloat(item.quantity) || 0;
            let price = parseFloat(item.price) || 0;
            
            // Sprawdź, czy produkt jest recepturą bez ceny z listy cenowej
            if ((item.isRecipe || item.itemType === 'recipe') && item.id && !item.fromPriceList && price === 0) {
              try {
                // Pobierz recepturę, aby sprawdzić koszt procesowy
                const recipe = await getRecipeById(item.id);
                if (recipe && recipe.processingCostPerUnit) {
                  // Użyj kosztu procesowego jako ceny
                  price = recipe.processingCostPerUnit;
                  console.log(`Użyto kosztu procesowego ${price} EUR dla produktu ${item.name} w zamówieniu ${order.id}`);
                }
              } catch (error) {
                console.error(`Błąd podczas pobierania receptury dla ${item.name}:`, error);
              }
            }
            
            return quantity * price;
          })).then(values => values.reduce((sum, value) => sum + value, 0));
          
          // Dodanie kosztów dostawy
          const shippingCost = parseFloat(order.shippingCost) || 0;
          
          // Łączna wartość zamówienia
          const totalValue = subtotal + shippingCost;
          
          console.log(`Zaktualizowane wartości zamówienia ${order.id}: produkty=${subtotal}, dostawa=${shippingCost}, PO=0, razem=${totalValue}`);
          
          return {
            ...order,
            totalValue: totalValue,
            productsValue: subtotal,
            purchaseOrdersValue: 0,
            shippingCost: shippingCost
          };
        }
      }));
      
      setOrders(updatedOrders);
    } catch (error) {
      console.error('Błąd podczas pobierania zamówień:', error);
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
    try {
      setLoading(true);
      // Przygotuj obiekty z filtrami - dla dat musimy odpowiednio sformatować wartości
      const filtersToApply = {
        ...filters,
        // Format dat jest już odpowiedni dla filtrów, więc nie musimy go przekształcać
      };
      const data = await getAllOrders(filtersToApply);
      setOrders(data);
      setPage(0);
    } catch (error) {
      showError('Błąd podczas filtrowania zamówień: ' + error.message);
      console.error('Error filtering orders:', error);
    } finally {
      setLoading(false);
    }
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
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
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

  const toggleExpand = (orderId) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  // Filtrowanie wyszukiwania
  const filteredOrders = orders.filter(order => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      (order.id && order.id.toLowerCase().includes(searchLower)) ||
      (order.customer?.name && order.customer.name.toLowerCase().includes(searchLower)) ||
      (order.items && order.items.some(item => item.name && item.name.toLowerCase().includes(searchLower)))
    );
  });

  // Paginacja
  const displayedOrders = filteredOrders
    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const getStatusChipColor = (status) => {
    switch (status) {
      case 'Nowe': return 'primary';
      case 'W realizacji': return 'info';
      case 'Gotowe do wysyłki': return 'warning';
      case 'Wysłane': return 'secondary';
      case 'Dostarczone': return 'success';
      case 'Anulowane': return 'error';
      default: return 'default';
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
      
      // Obliczamy wartość produktów
      const subtotal = (updatedOrder.items || []).reduce((sum, item) => {
        const quantity = parseFloat(item.quantity) || 0;
        const price = parseFloat(item.price) || 0;
        return sum + (quantity * price);
      }, 0);
      
      // Dodanie kosztów dostawy
      const shippingCost = parseFloat(updatedOrder.shippingCost) || 0;
      
      // Łączna wartość zamówienia
      const totalValue = subtotal + shippingCost + poTotal;
      
      console.log(`Zaktualizowane wartości zamówienia ${order.id}: produkty=${subtotal}, dostawa=${shippingCost}, PO=${poTotal}, razem=${totalValue}`);
      
      // Aktualizuj ten jeden element w tablicy zamówień
      setOrders(prevOrders => prevOrders.map(o => {
        if (o.id === order.id) {
          return {
            ...updatedOrder,
            totalValue: totalValue,
            productsValue: subtotal,
            purchaseOrdersValue: poTotal,
            shippingCost: shippingCost
          };
        }
        return o;
      }));
      
      showSuccess('Dane zamówienia zostały zaktualizowane');
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
        
        // Obliczamy wartość produktów
        const subtotal = (updatedOrderData.items || []).reduce((sum, item) => {
          const quantity = parseFloat(item.quantity) || 0;
          const price = parseFloat(item.price) || 0;
          return sum + (quantity * price);
        }, 0);
        
        // Dodanie kosztów dostawy
        const shippingCost = parseFloat(updatedOrderData.shippingCost) || 0;
        
        // Łączna wartość zamówienia
        const totalValue = subtotal + shippingCost + poTotal;
        
        console.log(`Zaktualizowane wartości zamówienia ${order.id}: produkty=${subtotal}, dostawa=${shippingCost}, PO=${poTotal}, razem=${totalValue}`);
        
        return {
          ...updatedOrderData,
          totalValue: totalValue,
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

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          Zamówienia klientów
        </Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<CustomersIcon />}
            onClick={() => navigate('/customers')}
          >
            Zarządzaj klientami
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={handleAddOrder}
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
            >
              Odśwież
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
                    <TableCell width="5%"></TableCell>
                    <TableCell>Klient</TableCell>
                    <TableCell>Numer zamówienia</TableCell>
                    <TableCell>Data zamówienia</TableCell>
                    <TableCell>Oczekiwana data dostawy</TableCell>
                    <TableCell>Wartość</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Akcje</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {filteredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} align="center">
                        Brak zamówień
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredOrders.map((order) => (
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
                              {typeof order.customer === 'object' && order.customer !== null 
                                ? (order.customer?.name || 'Brak danych klienta') 
                                : String(order.customer) || 'Brak danych klienta'}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              {order.orderNumber || (order.id && order.id.substring(0, 8).toUpperCase())}
                            </Typography>
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
                          <TableCell>
                            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                              <Typography variant="body2" fontWeight="medium">
                                {formatCurrency(order.totalValue || 0)}
                              </Typography>
                              {order.purchaseOrdersValue > 0 && (
                                <Typography variant="caption" color="text.secondary">
                                  (w tym PO: {formatCurrency(order.purchaseOrdersValue || 0)})
                                </Typography>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={order.status} 
                              color={getStatusChipColor(order.status)}
                              size="small"
                            />
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
                                    <Typography variant="subtitle2" gutterBottom>
                                      Produkty:
                                    </Typography>
                                    <TableContainer component={Paper} variant="outlined">
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>Produkt</TableCell>
                                            <TableCell align="right">Ilość</TableCell>
                                            <TableCell align="right">Cena</TableCell>
                                            <TableCell align="right">Wartość</TableCell>
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
                                                {formatCurrency(parseFloat(item.price) || 0)}
                                              </TableCell>
                                              <TableCell align="right">
                                                {formatCurrency((parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0))}
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
                                            Łączna wartość: {formatCurrency(order.totalValue || 0)}
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
                                            color={getStatusChipColor(status.value)}
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

            <TablePagination
              component="div"
              count={filteredOrders.length}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[5, 10, 25, 50]}
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
    </Box>
  );
};

export default OrdersList; 