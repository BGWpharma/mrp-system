import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Link,
  FormControlLabel,
  Checkbox
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
  ShoppingCart as ShoppingCartIcon,
  ArrowDropDown as ArrowDropDownIcon,
  Download as DownloadIcon,
  Archive as ArchiveIcon,
  Unarchive as UnarchiveIcon
} from '@mui/icons-material';
import { 
  getAllOrders, 
  deleteOrder, 
  updateOrderStatus, 
  getOrderById,
  ORDER_STATUSES,
  getOrdersOptimized,
  clearOrdersCache,
  forceRefreshOrdersCache,
  updateOrderInCache,
  archiveOrder,
  unarchiveOrder
} from '../../services/orders';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate, formatTimestamp, formatDateForInput } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatting';
import { getRecipeById } from '../../services/products';
import { exportToCSV, formatDateForExport, formatCurrencyForExport } from '../../utils/exportUtils';
import { getUsersDisplayNames } from '../../services/userService';
import { useTranslation } from '../../hooks/useTranslation';
import { collection, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { useOrderListState } from '../../contexts/OrderListStateContext';
import { useVisibilityAwareSnapshot } from '../../hooks/useVisibilityAwareSnapshot';
import { useBroadcastSync } from '../../hooks/useBroadcastSync';

const OrdersList = () => {
  const { t } = useTranslation('orders');
  
  // Użyj kontekstu dla zarządzania stanem listy
  const { state, actions } = useOrderListState();
  
  // Lokalne stany (nie zapisywane w kontekście)
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTimeout, setSearchTimeout] = useState(null);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [orderToDelete, setOrderToDelete] = useState(null);
  const [statusChangeInfo, setStatusChangeInfo] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [orderToUpdateStatus, setOrderToUpdateStatus] = useState(null);
  const [newStatus, setNewStatus] = useState('');

  const fetchOrdersRef = useRef(null);
  const ordersRef = useRef(orders);

  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();

  // Główny efekt inicjalizacyjny - wykonuje się tylko raz przy pierwszym renderowaniu
  useEffect(() => {
    let cancelled = false;
    const loadCustomers = async () => {
      try {
        setCustomersLoading(true);
        const { getAllCustomers } = await import('../../services/crm');
        const data = await getAllCustomers();
        if (cancelled) return;
        setCustomers(data);
      } catch (error) {
        if (cancelled) return;
        console.error(t('orders.notifications.customersError'), error);
      } finally {
        if (!cancelled) {
          setCustomersLoading(false);
        }
      }
    };
    loadCustomers();
    setIsInitialized(true);
    return () => { cancelled = true; };
  }, []);

  // Obsługa debounce dla wyszukiwania
  useEffect(() => {
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    const timeoutId = setTimeout(() => {
      actions.setDebouncedSearchTerm(state.searchTerm);
    }, 500); // 500ms opóźnienia
    
    setSearchTimeout(timeoutId);
    
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [state.searchTerm]);
  
  // Efekt odpowiedzialny za pobieranie zamówień przy zmianach parametrów
  useEffect(() => {
    let cancelled = false;
    if (isInitialized) {
      fetchOrders();
    }
    return () => { cancelled = true; };
  }, [state.page, state.rowsPerPage, state.orderBy, state.orderDirection, state.debouncedSearchTerm, isInitialized]);

  // Nasłuchiwanie powiadomień o aktualizacji kosztów zadań produkcyjnych
  useEffect(() => {
    let channel;
    try {
      channel = new BroadcastChannel('production-costs-update');
      
      const handleCostUpdate = async (event) => {
        if (event.data.type === 'TASK_COSTS_UPDATED') {
          const { taskId, costs, timestamp } = event.data;
          console.log(`[ORDERS_LIST_BROADCAST] Otrzymano powiadomienie o aktualizacji kosztów zadania ${taskId}:`, costs);
          
          const hasAffectedOrder = ordersRef.current.some(order => 
            (order.items && order.items.some(item => item.productionTaskId === taskId)) ||
            (order.productionTasks && order.productionTasks.some(task => task.id === taskId))
          );
          
          if (hasAffectedOrder) {
            console.log(`[ORDERS_LIST_BROADCAST] Znaleziono zamówienie z zadaniem ${taskId}, odświeżam listę po krótkiej przerwie`);
            
            setTimeout(() => {
              forceRefreshOrdersCache();
              fetchOrdersRef.current();
              console.log('🔄 [ORDERS_LIST_BROADCAST] Odświeżono listę zamówień po otrzymaniu powiadomienia o aktualizacji kosztów');
            }, 500);
          } else {
            console.log(`[ORDERS_LIST_BROADCAST] Zadanie ${taskId} nie dotyczy aktualnie wyświetlanych zamówień`);
          }
        }
      };

      channel.addEventListener('message', handleCostUpdate);
      console.log(`[ORDERS_LIST_BROADCAST] Nasłuchiwanie powiadomień o kosztach zadań dla listy zamówień`);
      
    } catch (error) {
      console.warn('Nie można utworzyć BroadcastChannel dla listy zamówień:', error);
    }

    return () => {
      if (channel) {
        channel.close();
        console.log(`[ORDERS_LIST_BROADCAST] Zamknięto nasłuchiwanie powiadomień dla listy zamówień`);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // BroadcastChannel — ukryte karty odświeżą dane po powrocie do widoczności
  const handleWakeWithPendingChanges = useCallback(() => {
    forceRefreshOrdersCache();
    fetchOrdersRef.current();
  }, []);

  const { broadcast: broadcastOrdersChange } = useBroadcastSync('orders-sync', {
    onWakeWithPendingChanges: handleWakeWithPendingChanges
  });

  // Real-time change-detector — nasłuchuj tylko ostatnio zmodyfikowanego zamówienia
  const ordersChangeDetectorQuery = useMemo(() =>
    isInitialized ? query(collection(db, 'orders'), orderBy('updatedAt', 'desc'), limit(1)) : null,
  [isInitialized]);
  const isInitialOrdersSnapshot = useRef(true);
  const ordersUpdateTimeout = useRef(null);

  useVisibilityAwareSnapshot(
    ordersChangeDetectorQuery,
    null,
    (snapshot) => {
      if (isInitialOrdersSnapshot.current) {
        isInitialOrdersSnapshot.current = false;
        return;
      }
      
      if (snapshot.docChanges().length > 0 && !snapshot.metadata.hasPendingWrites) {
        broadcastOrdersChange({ collection: 'orders' });
        
        if (ordersUpdateTimeout.current) {
          clearTimeout(ordersUpdateTimeout.current);
        }
        
        ordersUpdateTimeout.current = setTimeout(() => {
          forceRefreshOrdersCache();
          fetchOrdersRef.current();
        }, 1000);
      }
    },
    (error) => {
      console.error('❌ [FIREBASE_LISTENER] Błąd Firebase listener:', error);
    },
    [isInitialized]
  );

  const fetchOrders = async () => {
    try {
      // Silent refresh — nie pokazuj loadera jeśli mamy już dane (cache hit)
      const willBeFast = orders.length > 0;
      if (!willBeFast) {
        setLoading(true);
      }
      
      const result = await getOrdersOptimized({
        page: state.page,
        pageSize: state.rowsPerPage,
        searchTerm: state.debouncedSearchTerm,
        sortField: state.orderBy,
        sortOrder: state.orderDirection,
        filters: {
          ...state.filters,
          showArchived: showArchived
        }
      });
      
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

      const ordersToFix = [];
      const ordersWithCalculatedValues = result.data.map(order => {
        const subtotal = (order.items || []).reduce((sum, item) => {
          return sum + calculateItemTotalValue(item);
        }, 0);
        
        const shippingCost = parseFloat(order.shippingCost) || 0;
        let additionalCostsTotal = 0;
        let discountsTotal = 0;
        if (order.additionalCostsItems && Array.isArray(order.additionalCostsItems)) {
          additionalCostsTotal = order.additionalCostsItems
            .filter(cost => parseFloat(cost.value) > 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
          discountsTotal = Math.abs(order.additionalCostsItems
            .filter(cost => parseFloat(cost.value) < 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0));
        }
        const calculatedTotalValue = subtotal + shippingCost + additionalCostsTotal - discountsTotal;
        
        const dbTotalValue = parseFloat(order.totalValue) || 0;
        if (Math.abs(calculatedTotalValue - dbTotalValue) > 0.01) {
          console.log(`[fetchOrders] Zamówienie ${order.orderNumber}: DB totalValue=${dbTotalValue.toFixed(2)}€, obliczona=${calculatedTotalValue.toFixed(2)}€, różnica=${(calculatedTotalValue - dbTotalValue).toFixed(2)}€`);
          ordersToFix.push({ id: order.id, orderNumber: order.orderNumber, totalValue: calculatedTotalValue, items: order.items, orderDate: order.orderDate, status: order.status, customer: order.customer });
        }
        
        return {
          ...order,
          productsValue: subtotal,
          calculatedTotalValue
        };
      });
      
      if (ordersToFix.length > 0) {
        import('../../services/orders').then(({ updateOrder }) => {
          ordersToFix.forEach(async (fix) => {
            try {
              await updateOrder(fix.id, { 
                items: fix.items, 
                totalValue: fix.totalValue, 
                orderNumber: fix.orderNumber, 
                orderDate: fix.orderDate, 
                status: fix.status, 
                customer: fix.customer 
              }, 'system');
              updateOrderInCache(fix.id, { totalValue: fix.totalValue });
              console.log(`[fetchOrders] Auto-korekta: zapisano totalValue=${fix.totalValue.toFixed(2)}€ dla ${fix.orderNumber}`);
            } catch (err) {
              console.warn(`[fetchOrders] Błąd auto-korekty ${fix.orderNumber}:`, err);
            }
          });
        });
      }
      
      setOrders(ordersWithCalculatedValues);
      setTotalItems(result.pagination.totalItems);
      setTotalPages(result.pagination.totalPages);
    } catch (error) {
      console.error('Błąd podczas pobierania zamówień:', error);
      showError(t('orders.notifications.fetchError'));
    } finally {
      setLoading(false);
    }
  };

  fetchOrdersRef.current = fetchOrders;
  ordersRef.current = orders;

  const applyFilters = async () => {
    actions.setPage(1); // Reset do pierwszej strony przy zmianie filtrów
    fetchOrders();
  };

  useEffect(() => {
    if (location.state?.customerId) {
      actions.setFilters({
        customerId: location.state.customerId
      });
      
      if (location.state?.customerName) {
        showSuccess(t('orders.notifications.customerOrdersFilter', { customerName: location.state.customerName }));
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
    actions.resetFilters();
    fetchOrders();
  };

  const handleArchiveOrder = async (order) => {
    try {
      if (order.archived) {
        await unarchiveOrder(order.id);
        showSuccess(t('common.unarchiveSuccess', { ns: 'common' }));
      } else {
        await archiveOrder(order.id);
        showSuccess(t('common.archiveSuccess', { ns: 'common' }));
      }
      fetchOrders();
    } catch (error) {
      showError(error.message);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    // Dla pól typu date (fromDate, toDate) zapewniamy poprawny format
    actions.setFilters({
      [name]: value
    });
  };

  const handleSearchChange = (e) => {
    actions.setSearchTerm(e.target.value);
  };

  const handleChangePage = (event, newPage) => {
    actions.setPage(newPage + 1); // Dodanie +1, ponieważ MUI TablePagination używa indeksowania od 0, a nasza funkcja od 1
  };

  const handleChangeRowsPerPage = (event) => {
    actions.setRowsPerPage(parseInt(event.target.value, 10));
  };

  const handleAddOrder = () => {
    navigate('/orders/new');
  };

  const handleDeleteOrderClick = (order) => {
    setOrderToDelete(order);
  };

  const handleConfirmDelete = async () => {
    if (!orderToDelete) return;
    
    try {
      await deleteOrder(orderToDelete.id);
      setOrders(prev => prev.filter(order => order.id !== orderToDelete.id));
      showSuccess(t('orders.notifications.orderDeleted'));
    } catch (error) {
      showError(t('orders.notifications.deleteError', { error: error.message }));
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
        showError(t('orders.notifications.statusUpdateError'));
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
      showError(t('orders.notifications.statusUpdateError'));
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
      
      showSuccess(t('orders.notifications.statusUpdated'));
    } catch (error) {
      showError(t('orders.notifications.statusUpdateError'));
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
      
      showSuccess(t('orders.notifications.statusUpdated'));
      setStatusDialogOpen(false);
      setOrderToUpdateStatus(null);
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu zamówienia:', error);
      showError(t('orders.notifications.statusUpdateError'));
    }
  };

  const toggleExpand = (orderId) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  const displayedOrders = showArchived ? orders : orders.filter(order => !order.archived);

  const getStatusChipColor = (status) => {
    switch (status) {
      case 'Nowe': return '#1976d2'; // oryginalny niebieski
      case 'W realizacji': return '#2196f3'; // oryginalny jasnoniebieski
      case 'Zakończone': return '#4caf50'; // oryginalny zielony
      case 'Rozliczone': return '#9c27b0'; // fioletowy
      case 'Anulowane': return '#f44336'; // oryginalny czerwony
      default: return '#757575'; // oryginalny szary
    }
  };

  // Nawigacja do listy zamówień filtrowanej po kliencie
  const handleViewCustomerOrders = (customerId, customerName) => {
    // Ustawiam filtry i przechodzę do listy zamówień
    actions.setFilters({
      customerId: customerId
    });
    showSuccess(t('orders.notifications.customerOrdersFilter', { customerName }));
    applyFilters();
  };

  const handleRefreshOrder = async (order) => {
    try {
      // Import potrzebnych funkcji
      const { getOrderById } = await import('../../services/orders');
      const { getPurchaseOrderById } = await import('../../services/purchaseOrders');
      
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
      
      // Zastosuj rabat globalny
      const globalDiscount = parseFloat(updatedOrder.globalDiscount) || 0;
      const discountMultiplier = (100 - globalDiscount) / 100;
      
      // Łączna wartość zamówienia z rabatem
      const recalculatedTotalValue = subtotal * discountMultiplier;
      
      console.log(`Zaktualizowane wartości zamówienia ${order.id}: produkty=${subtotal}, rabat=${globalDiscount}%, razem=${recalculatedTotalValue}`);
      
      // Sprawdź czy wartość się zmieniła w porównaniu do zapisanej w bazie
      const savedTotalValue = parseFloat(updatedOrder.totalValue) || 0;
      const valueChanged = Math.abs(recalculatedTotalValue - savedTotalValue) > 0.01;
      
      // Jeśli wartość się zmieniła, zaktualizuj ją w bazie danych
      if (valueChanged) {
        console.log(`Wartość zamówienia ${order.id} została zaktualizowana: ${savedTotalValue} → ${recalculatedTotalValue}`);
        
        try {
          const { updateOrder } = await import('../../services/orders');
          
          // Przygotuj bezpieczne dane do aktualizacji
          const safeUpdateData = {
            items: updatedOrder.items,
            totalValue: recalculatedTotalValue,
            orderNumber: updatedOrder.orderNumber,
            orderDate: updatedOrder.orderDate, // Wymagane przez walidację
            status: updatedOrder.status,
            customer: updatedOrder.customer,
            globalDiscount: updatedOrder.globalDiscount,
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
            showError(t('orders.notifications.valuesRefreshError'));
          } else {
            console.log(`✅ Weryfikacja potwierdza prawidłowy zapis do bazy danych`);
          }
          
        } catch (error) {
          console.error(`❌ Błąd podczas aktualizacji wartości zamówienia ${order.id} w bazie danych:`, error);
          showError(t('orders.notifications.moSaveError'));
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
            purchaseOrdersValue: poTotal
          };
        }
        return o;
      }));
      
      showSuccess(t('orders.notifications.valuesRefreshed', { count: 1 }));
    } catch (error) {
      console.error('Błąd podczas odświeżania danych zamówienia:', error);
      showError(t('orders.notifications.valuesRefreshError'));
    }
  };

  const handleRefreshAll = async () => {
    try {
      setLoading(true);
      showInfo(t('orders.notifications.refreshingValues'));
      
      // Import potrzebnych funkcji
      const { getOrderById } = await import('../../services/orders');
      const { getPurchaseOrderById } = await import('../../services/purchaseOrders');
      
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
          const { getTaskById } = await import('../../services/production/productionService');
          const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/calculations');
          
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
                
                const productionCost = (taskDetails.totalMaterialCost || associatedTask.totalMaterialCost || 0) + (taskDetails.factoryCostTotal || 0);
                const fullProductionCost = taskDetails.totalCostWithFactory || taskDetails.totalFullProductionCost || associatedTask.totalFullProductionCost || 0;
                
                const calculatedFullProductionUnitCost = calculateFullProductionUnitCost(item, fullProductionCost);
                const calculatedProductionUnitCost = calculateProductionUnitCost(item, productionCost);
                
                updatedOrderData.items[i] = {
                  ...item,
                  productionTaskId: associatedTask.id,
                  productionTaskNumber: associatedTask.moNumber || taskDetails.moNumber,
                  productionStatus: associatedTask.status || taskDetails.status,
                  productionCost: productionCost,
                  fullProductionCost: fullProductionCost,
                  productionUnitCost: calculatedProductionUnitCost,
                  fullProductionUnitCost: calculatedFullProductionUnitCost,
                  factoryCostIncluded: (taskDetails.factoryCostTotal || 0) > 0
                };
                
                console.log(`Zaktualizowano koszty dla pozycji ${item.name}: koszt=${productionCost.toFixed(4)}€, pełny=${fullProductionCost.toFixed(4)}€, pełny/szt=${calculatedFullProductionUnitCost.toFixed(2)}€`);
              } catch (error) {
                console.error(`Błąd podczas pobierania szczegółów zadania ${associatedTask.id}:`, error);
                
                const productionCost = (associatedTask.totalMaterialCost || 0) + (associatedTask.factoryCostTotal || 0);
                const fullProductionCost = associatedTask.totalCostWithFactory || associatedTask.totalFullProductionCost || 0;
                
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
        
        const shippingCost = parseFloat(updatedOrderData.shippingCost) || 0;
        let additionalCostsTotal = 0;
        let discountsTotal = 0;
        if (updatedOrderData.additionalCostsItems && Array.isArray(updatedOrderData.additionalCostsItems)) {
          additionalCostsTotal = updatedOrderData.additionalCostsItems
            .filter(cost => parseFloat(cost.value) > 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
          discountsTotal = Math.abs(updatedOrderData.additionalCostsItems
            .filter(cost => parseFloat(cost.value) < 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0));
        }
        
        const recalculatedTotalValue = subtotal + shippingCost + additionalCostsTotal - discountsTotal;
        
        const savedTotalValue = parseFloat(updatedOrderData.totalValue) || 0;
        const valueChanged = Math.abs(recalculatedTotalValue - savedTotalValue) > 0.01;
        
        if (valueChanged) {
          console.log(`Wartość zamówienia ${order.id} została zaktualizowana: ${savedTotalValue} → ${recalculatedTotalValue}`);
          
          try {
            const { updateOrder } = await import('../../services/orders');
            
            const safeUpdateData = {
              items: updatedOrderData.items,
              totalValue: recalculatedTotalValue,
              orderNumber: updatedOrderData.orderNumber,
              orderDate: updatedOrderData.orderDate,
              status: updatedOrderData.status,
              customer: updatedOrderData.customer,
              productionTasks: updatedOrderData.productionTasks,
              linkedPurchaseOrders: updatedOrderData.linkedPurchaseOrders
            };
            
            console.log(`[handleRefreshAll] Zapisuję zamówienie ${order.id} z wartością:`, recalculatedTotalValue);
            await updateOrder(updatedOrderData.id, safeUpdateData, 'system');
            console.log(`[handleRefreshAll] Zapisano zamówienie ${order.id} do bazy danych`);
          } catch (error) {
            console.error(`[handleRefreshAll] Błąd podczas aktualizacji wartości zamówienia ${order.id}:`, error);
          }
        }
        
        console.log(`Zaktualizowane dane zamówienia ${order.id}: totalValue=${recalculatedTotalValue}, produkty=${subtotal}, shipping=${shippingCost}, PO=${poTotal}`);
        
        return {
          ...updatedOrderData,
          totalValue: recalculatedTotalValue,
          calculatedTotalValue: recalculatedTotalValue,
          productsValue: subtotal,
          purchaseOrdersValue: poTotal
        };
      }));
      
      setOrders(updatedOrders);
      showSuccess(t('orders.notifications.valuesRefreshed', { count: orders.length }));
    } catch (error) {
      console.error('Błąd podczas odświeżania danych zamówień:', error);
      showError(t('orders.notifications.valuesRefreshError'));
    } finally {
      setLoading(false);
    }
  };

  // ⚡ OPTYMALIZACJA: useCallback zapobiega recreating funkcji przy każdym renderze
  const safeRenderValue = useCallback((value) => {
    if (value === null || value === undefined) {
      return '-';
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  }, []);

  // ⚡ OPTYMALIZACJA: useCallback zapobiega recreating funkcji przy każdym renderze
  const formatSupplier = useCallback((supplier) => {
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
  }, []);

  // Obsługa sortowania kolumn
  const handleSort = (column) => {
    const isAsc = state.orderBy === column && state.orderDirection === 'asc';
    actions.setOrderDirection(isAsc ? 'desc' : 'asc');
    actions.setOrderBy(column);
    actions.setPage(1); // Reset do pierwszej strony
  };

  // Funkcja do odświeżania wartości przed eksportem
  const refreshOrdersForExport = async () => {
    try {
      // Import potrzebnych funkcji
      const { getAllOrders } = await import('../../services/orders');
      const { getOrderById } = await import('../../services/orders');
      const { getPurchaseOrderById } = await import('../../services/purchaseOrders');
      
      // Pobierz wszystkie zamówienia z uwzględnieniem filtrów
      let ordersToRefresh = orders;
      
      // Jeśli mamy więcej niż jedną stronę, pobierz wszystkie zamówienia
      if (totalPages > 1) {
        const allOrdersResult = await getOrdersOptimized({
          page: 1,
          pageSize: totalItems,
          sortField: state.orderBy,
          sortOrder: state.orderDirection,
          filters: { ...state.filters, searchTerm: state.debouncedSearchTerm, showArchived }
        });
        ordersToRefresh = allOrdersResult.data;
      }
      
      // Przelicz wartości dla każdego zamówienia
      const updatedOrders = await Promise.all(ordersToRefresh.map(async (order) => {
        console.log(`[Export] Odświeżam wartości zamówienia ${order.id}`);
        
        // Pobierz zaktualizowane pełne dane zamówienia
        const updatedOrderData = await getOrderById(order.id);
        
        // Aktualizuj koszty produkcji dla pozycji zamówienia
        if (updatedOrderData.productionTasks && updatedOrderData.productionTasks.length > 0 && updatedOrderData.items && updatedOrderData.items.length > 0) {
          const { getTaskById } = await import('../../services/production/productionService');
          const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/calculations');
          
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
                
                const productionCost = (taskDetails.totalMaterialCost || associatedTask.totalMaterialCost || 0) + (taskDetails.factoryCostTotal || 0);
                const fullProductionCost = taskDetails.totalCostWithFactory || taskDetails.totalFullProductionCost || associatedTask.totalFullProductionCost || 0;
                
                const calculatedFullProductionUnitCost = calculateFullProductionUnitCost(item, fullProductionCost);
                const calculatedProductionUnitCost = calculateProductionUnitCost(item, productionCost);
                
                updatedOrderData.items[i] = {
                  ...item,
                  productionTaskId: associatedTask.id,
                  productionTaskNumber: associatedTask.moNumber || taskDetails.moNumber,
                  productionStatus: associatedTask.status || taskDetails.status,
                  productionCost: productionCost,
                  fullProductionCost: fullProductionCost,
                  productionUnitCost: calculatedProductionUnitCost,
                  fullProductionUnitCost: calculatedFullProductionUnitCost,
                  factoryCostIncluded: (taskDetails.factoryCostTotal || 0) > 0
                };
              } catch (error) {
                console.error(`Błąd podczas pobierania szczegółów zadania ${associatedTask.id}:`, error);
                
                const productionCost = (associatedTask.totalMaterialCost || 0) + (associatedTask.factoryCostTotal || 0);
                const fullProductionCost = associatedTask.totalCostWithFactory || associatedTask.totalFullProductionCost || 0;
                
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
        let additionalCostsTotal = 0;
        let discountsTotal = 0;
        if (updatedOrderData.additionalCostsItems && Array.isArray(updatedOrderData.additionalCostsItems)) {
          additionalCostsTotal = updatedOrderData.additionalCostsItems
            .filter(cost => parseFloat(cost.value) > 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
          discountsTotal = Math.abs(updatedOrderData.additionalCostsItems
            .filter(cost => parseFloat(cost.value) < 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0));
        }
        const recalculatedTotalValue = subtotal + shippingCost + additionalCostsTotal - discountsTotal;
        
        return {
          ...updatedOrderData,
          totalValue: recalculatedTotalValue,
          productsValue: subtotal
        };
      }));
      
      // Aktualizuj stan z odświeżonymi danymi
      setOrders(updatedOrders);
      console.log(`[Export] Odświeżono wartości dla ${updatedOrders.length} zamówień`);
      
    } catch (error) {
      console.error('Błąd podczas odświeżania wartości przed eksportem:', error);
      showError(t('orders.notifications.valuesRefreshError'));
      throw error; // Przerwij eksport w przypadku błędu
    }
  };

  const handleRefreshMO = async (order) => {
    try {
      setLoading(true);
      showInfo(t('orders.notifications.refreshingMO'));
      
      // Import potrzebnych funkcji
      const { getOrderById } = await import('../../services/orders');
      
      // Pobierz zaktualizowane dane zamówienia
      const updatedOrder = await getOrderById(order.id);
      
      // Aktualizuj koszty produkcji dla pozycji zamówienia
      if (updatedOrder.productionTasks && updatedOrder.productionTasks.length > 0 && updatedOrder.items && updatedOrder.items.length > 0) {
        // Importuj funkcję do pobierania szczegółów zadania
        const { getTaskById } = await import('../../services/production/productionService');
        const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/calculations');
        
        console.log("Aktualizuję koszty produkcji dla zamówienia:", order.id);
        
        for (let i = 0; i < updatedOrder.items.length; i++) {
          const item = updatedOrder.items[i];
          
          // Znajdź powiązane zadanie produkcyjne
          const associatedTask = updatedOrder.productionTasks?.find(task => 
            task.id === item.productionTaskId
          );
          
          if (associatedTask) {
            try {
              const taskDetails = await getTaskById(associatedTask.id);
              
              const productionCost = (taskDetails.totalMaterialCost || associatedTask.totalMaterialCost || 0) + (taskDetails.factoryCostTotal || 0);
              const fullProductionCost = taskDetails.totalCostWithFactory || taskDetails.totalFullProductionCost || associatedTask.totalFullProductionCost || 0;
              
              const calculatedFullProductionUnitCost = calculateFullProductionUnitCost(item, fullProductionCost);
              const calculatedProductionUnitCost = calculateProductionUnitCost(item, productionCost);
              
              updatedOrder.items[i] = {
                ...item,
                productionTaskId: associatedTask.id,
                productionTaskNumber: associatedTask.moNumber || taskDetails.moNumber,
                productionStatus: associatedTask.status || taskDetails.status,
                productionCost: productionCost,
                fullProductionCost: fullProductionCost,
                productionUnitCost: calculatedProductionUnitCost,
                fullProductionUnitCost: calculatedFullProductionUnitCost,
                factoryCostIncluded: (taskDetails.factoryCostTotal || 0) > 0
              };
              
              console.log(`Zaktualizowano koszty dla pozycji ${item.name}: koszt=${productionCost.toFixed(4)}€, pełny=${fullProductionCost.toFixed(4)}€`);
            } catch (error) {
              console.error(`Błąd podczas pobierania szczegółów zadania ${associatedTask.id}:`, error);
              
              const productionCost = (associatedTask.totalMaterialCost || 0) + (associatedTask.factoryCostTotal || 0);
              const fullProductionCost = associatedTask.totalCostWithFactory || associatedTask.totalFullProductionCost || 0;
              
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
        
        // Przelicz totalValue zamówienia
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

        const subtotal = (updatedOrder.items || []).reduce((sum, item) => {
          return sum + calculateItemTotalValue(item);
        }, 0);

        const shippingCost = parseFloat(updatedOrder.shippingCost) || 0;
        let additionalCostsTotal = 0;
        let discountsTotal = 0;
        if (updatedOrder.additionalCostsItems && Array.isArray(updatedOrder.additionalCostsItems)) {
          additionalCostsTotal = updatedOrder.additionalCostsItems
            .filter(cost => parseFloat(cost.value) > 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0);
          discountsTotal = Math.abs(updatedOrder.additionalCostsItems
            .filter(cost => parseFloat(cost.value) < 0)
            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0));
        }
        const recalculatedTotalValue = subtotal + shippingCost + additionalCostsTotal - discountsTotal;

        // Zapisz zaktualizowane dane do bazy
        try {
          const { updateOrder } = await import('../../services/orders');
          
          const safeUpdateData = {
            items: updatedOrder.items,
            totalValue: recalculatedTotalValue,
            orderNumber: updatedOrder.orderNumber,
            orderDate: updatedOrder.orderDate,
            status: updatedOrder.status,
            customer: updatedOrder.customer,
            productionTasks: updatedOrder.productionTasks
          };
          
          await updateOrder(updatedOrder.id, safeUpdateData, 'system');
          
          setOrders(prevOrders => prevOrders.map(o => {
            if (o.id === order.id) {
              return { ...o, ...updatedOrder, totalValue: recalculatedTotalValue, productsValue: subtotal };
            }
            return o;
          }));
          
          showSuccess(t('orders.notifications.moRefreshed'));
        } catch (updateError) {
          console.error('Błąd podczas zapisywania zaktualizowanych danych MO:', updateError);
          showError(t('orders.notifications.moSaveError'));
        }
      } else {
        showInfo(t('orders.notifications.noMOData'));
      }
    } catch (error) {
      console.error('Błąd podczas odświeżania danych MO:', error);
      showError(t('orders.notifications.moRefreshError'));
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshCMRData = async (order) => {
    try {
      setLoading(true);
      showInfo(t('orders.notifications.refreshingCMR'));
      
      // Import funkcji do debugowania i odświeżania danych CMR
      const { debugOrderCMRConnections, refreshShippedQuantitiesFromCMR, cleanupObsoleteCMRConnections } = await import('../../services/orders');
      
      // Najpierw uruchom debugowanie aby zobaczyć stan przed odświeżaniem
      console.log('=== ROZPOCZĘCIE DEBUGOWANIA CMR ===');
      await debugOrderCMRConnections(order.id);
      console.log('=== KONIEC DEBUGOWANIA CMR ===');
      
      // Odśwież dane wysłanych ilości na podstawie CMR
      const result = await refreshShippedQuantitiesFromCMR(order.id, currentUser?.uid || 'system');
      
      // Jeśli znaleziono nieaktualne powiązania, automatycznie je oczyść
      if (result.stats.obsoleteConnections > 0) {
        console.log(`🧹 Znaleziono ${result.stats.obsoleteConnections} nieaktualnych powiązań - rozpoczynanie oczyszczania...`);
        try {
          const cleanupResult = await cleanupObsoleteCMRConnections(result.stats.obsoleteItems, currentUser?.uid || 'system');
          console.log(`✅ Oczyszczono ${cleanupResult.cleanedItems} nieaktualnych powiązań`);
          
          // Uruchom ponowne odświeżanie po oczyszczeniu
          const secondResult = await refreshShippedQuantitiesFromCMR(order.id, currentUser?.uid || 'system');
          result.stats = { ...result.stats, ...secondResult.stats, cleanedItems: cleanupResult.cleanedItems };
        } catch (cleanupError) {
          console.error('Błąd podczas oczyszczania nieaktualnych powiązań:', cleanupError);
          showError(`Błąd podczas oczyszczania: ${cleanupError.message}`);
        }
      }
      
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
      let message = t('orders.notifications.cmrRefreshed', {
        cmrs: stats.processedCMRs,
        items: stats.shippedItems,
        references: stats.cmrReferences
      });
      
      // Dodaj informacje o oczyszczonych powiązaniach jeśli były
      if (stats.cleanedItems > 0) {
        message += ` Oczyszczono ${stats.cleanedItems} nieaktualnych powiązań.`;
      } else if (stats.obsoleteConnections > 0) {
        message += ` Wykryto ${stats.obsoleteConnections} nieaktualnych powiązań (nie udało się oczyścić).`;
      }
      
      showSuccess(message);
    } catch (error) {
      console.error('Błąd podczas odświeżania danych CMR:', error);
      showError(t('orders.notifications.cmrRefreshError', { error: error.message }));
    } finally {
      setLoading(false);
    }
  };

  // Funkcja eksportu zamówień klientów z pozycjami do CSV
  const handleExportOrdersToCSV = async () => {
    try {
      setLoading(true);
      showInfo(t('orders.notifications.refreshingValues'));
      
      // Najpierw odśwież wszystkie wartości zamówień
      await refreshOrdersForExport();
      
      // Pobierz wszystkie zamówienia z uwzględnieniem aktualnych filtrów
      let exportOrders = orders;
      
      // Jeśli mamy tylko jedną stronę danych, pobieramy wszystkie zamówienia z filtrami
      if (totalPages > 1) {
        const allOrdersResult = await getOrdersOptimized({
          page: 1,
          pageSize: totalItems,
          sortField: state.orderBy,
          sortOrder: state.orderDirection,
          filters: { ...state.filters, searchTerm: state.debouncedSearchTerm, showArchived }
        });
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
        showSuccess(t('orders.notifications.exportSuccess', { 
          items: exportData.length, 
          orders: exportOrders.length 
        }));
      } else {
        showError(t('orders.notifications.exportError'));
      }
    } catch (error) {
      console.error('Błąd podczas eksportu CSV:', error);
      showError(t('orders.notifications.exportErrorGeneral', { error: error.message }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" component="h1">
          {t('orders.title')}
        </Typography>
      </Box>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <TextField
            placeholder={t('orders.searchOrders')}
            variant="outlined"
            size="small"
            value={state.searchTerm}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: state.searchTerm && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => actions.setSearchTerm('')}>
                    <ClearIcon />
                  </IconButton>
                </InputAdornment>
              )
            }}
            sx={{ width: 300 }}
          />

          <FormControlLabel
            control={
              <Checkbox
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                size="small"
              />
            }
            label={t('common.showArchived', { ns: 'common' })}
            sx={{ ml: 1 }}
          />

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button
              variant="contained"
              color="primary"
              startIcon={<AddIcon />}
              onClick={handleAddOrder}
            >
              {t('orders.newOrder')}
            </Button>
            <Button 
              variant="outlined" 
              color="secondary" 
              startIcon={<DownloadIcon />}
              onClick={handleExportOrdersToCSV}
              disabled={loading}
            >
              {loading ? t('orders.exporting') : t('orders.exportCsv')}
            </Button>
            <Button 
              variant={state.showFilters ? "contained" : "outlined"} 
              startIcon={<FilterListIcon />}
              onClick={() => actions.setShowFilters(!state.showFilters)}
              color={state.showFilters ? "primary" : "inherit"}
            >
              {t('orders.filtersToggle')}
            </Button>
          </Box>
        </Box>

        <Collapse in={state.showFilters}>
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{t('orders.filters.status')}</InputLabel>
                    <Select
                      name="status"
                      value={state.filters.status}
                      onChange={handleFilterChange}
                      label={t('orders.filters.status')}
                    >
                      <MenuItem value="all">{t('orders.filters.all')}</MenuItem>
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
                    label={t('orders.filters.fromDate')}
                    type="date"
                    name="fromDate"
                    value={state.filters.fromDate}
                    onChange={handleFilterChange}
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ max: state.filters.toDate || undefined }}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label={t('orders.filters.toDate')}
                    type="date"
                    name="toDate"
                    value={state.filters.toDate}
                    onChange={handleFilterChange}
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ min: state.filters.fromDate || undefined }}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{t('orders.filters.customer')}</InputLabel>
                    <Select
                      name="customerId"
                      value={state.filters.customerId}
                      onChange={handleFilterChange}
                      label={t('orders.filters.customer')}
                      disabled={customersLoading}
                    >
                      <MenuItem value="">{t('orders.filters.allCustomers')}</MenuItem>
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
                      {t('orders.applyFilters')}
                    </Button>
                    <Button 
                      variant="outlined" 
                      onClick={resetFilters}
                      color="inherit"
                    >
                      {t('orders.reset')}
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
                    <TableCell>{t('orders.table.details')}</TableCell>
                    <TableCell 
                      onClick={() => handleSort('orderNumber')}
                      style={{ cursor: 'pointer' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {t('orders.table.number')} 
                        {state.orderBy === 'orderNumber' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: state.orderDirection === 'asc' ? 'rotate(180deg)' : 'none',
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
                        {t('orders.table.customer')}
                        {state.orderBy === 'customer.name' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: state.orderDirection === 'asc' ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.2s'
                            }} 
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>{t('orders.table.status')}</TableCell>
                    <TableCell 
                      onClick={() => handleSort('orderDate')}
                      style={{ cursor: 'pointer' }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center' }}>
                        {t('orders.table.date')}
                        {state.orderBy === 'orderDate' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: state.orderDirection === 'asc' ? 'rotate(180deg)' : 'none',
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
                        {t('orders.table.deliveryDeadline')}
                        {state.orderBy === 'expectedDeliveryDate' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: state.orderDirection === 'asc' ? 'rotate(180deg)' : 'none',
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
                        {t('orders.table.value')}
                        {state.orderBy === 'totalValue' && (
                          <ArrowDropDownIcon 
                            sx={{ 
                              transform: state.orderDirection === 'asc' ? 'rotate(180deg)' : 'none',
                              transition: 'transform 0.2s'
                            }} 
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">{t('orders.table.actions')}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displayedOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center">
                        {t('orders.noOrders')}
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayedOrders.map((order) => (
                      <React.Fragment key={order.id}>
                        <TableRow hover sx={{ opacity: order.archived ? 0.5 : 1 }}>
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
                                ? (order.customer?.name || t('orders.constants.noCustomerData')) 
                                : String(order.customer) || t('orders.constants.noCustomerData')}
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
                                {formatCurrency(order.calculatedTotalValue !== undefined ? order.calculatedTotalValue : (order.totalValue || 0))}
                              </Typography>
                              {order.purchaseOrdersValue > 0 && (
                                <Typography variant="caption" color="text.secondary">
                                  (PO: {formatCurrency(order.purchaseOrdersValue || 0)})
                                </Typography>
                              )}
                              {order.calculatedTotalValue !== undefined && Math.abs(order.calculatedTotalValue - (order.totalValue || 0)) > 0.01 && (
                                <Typography variant="caption" color="warning.main">
                                  (DB: {formatCurrency(order.totalValue || 0)})
                                </Typography>
                              )}
                            </Box>
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title={t('orders.actions.edit')}>
                              <IconButton
                                size="small"
                                component={RouterLink}
                                to={`/orders/edit/${order.id}`}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t('orders.actions.details')}>
                              <IconButton
                                size="small"
                                component={RouterLink}
                                to={`/orders/${order.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                color="primary"
                              >
                                <EventNoteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={order.archived ? t('common.unarchive', { ns: 'common' }) : t('common.archive', { ns: 'common' })}>
                              <IconButton
                                size="small"
                                onClick={() => handleArchiveOrder(order)}
                              >
                                {order.archived ? <UnarchiveIcon fontSize="small" /> : <ArchiveIcon fontSize="small" />}
                              </IconButton>
                            </Tooltip>
                            <Tooltip title={t('orders.actions.delete')}>
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
                                  {t('orders.expandedDetails.orderDetails')}
                                </Typography>

                                <Grid container spacing={2}>
                                  <Grid item xs={12} md={6}>
                                    <Typography variant="subtitle2">{t('orders.expandedDetails.contact')}</Typography>
                                    <Typography variant="body2">
                                      {t('orders.expandedDetails.email')} {typeof order.customer?.email === 'object' 
                                        ? JSON.stringify(order.customer.email) 
                                        : (order.customer?.email || '-')}
                                    </Typography>
                                    <Typography variant="body2">
                                      {t('orders.expandedDetails.phone')} {typeof order.customer?.phone === 'object' 
                                        ? JSON.stringify(order.customer.phone) 
                                        : (order.customer?.phone || '-')}
                                    </Typography>
                                    <Typography variant="body2">
                                      {t('orders.expandedDetails.address')} {typeof order.customer?.address === 'object' 
                                        ? JSON.stringify(order.customer.address) 
                                        : (order.customer?.address || '-')}
                                    </Typography>
                                  </Grid>

                                  <Grid item xs={12} md={6}>
                                    <Typography variant="subtitle2">{t('orders.expandedDetails.paymentInfo')}</Typography>
                                    <Typography variant="body2">
                                      {t('orders.expandedDetails.paymentMethod')} {typeof order.paymentMethod === 'object'
                                        ? JSON.stringify(order.paymentMethod)
                                        : (order.paymentMethod || '-')}
                                    </Typography>
                                    <Typography variant="body2">
                                      {t('orders.expandedDetails.paymentStatus')} {typeof order.paymentStatus === 'object'
                                        ? JSON.stringify(order.paymentStatus)
                                        : (order.paymentStatus || '-')}
                                    </Typography>
                                    <Typography variant="body2">
                                      {t('orders.expandedDetails.delivery')} {typeof order.shippingMethod === 'object'
                                        ? JSON.stringify(order.shippingMethod)
                                        : (order.shippingMethod || '-')} 
                                      ({formatCurrency(order.shippingCost || 0)})
                                    </Typography>
                                  </Grid>

                                  <Grid item xs={12}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                      <Typography variant="subtitle2">
                                        {t('orders.expandedDetails.products')}
                                      </Typography>
                                      <Box sx={{ display: 'flex', gap: 1 }}>
                                        <Button
                                          size="small"
                                          startIcon={<RefreshIcon />}
                                          onClick={() => handleRefreshMO(order)}
                                          title="Odśwież dane MO"
                                        >
                                          {t('orders.expandedDetails.refreshMO')}
                                        </Button>
                                        <Button
                                          size="small"
                                          startIcon={<RefreshIcon />}
                                          onClick={() => handleRefreshCMRData(order)}
                                          title="Odśwież dane wysłanych ilości z CMR"
                                          variant="outlined"
                                          color="secondary"
                                        >
                                          {t('orders.expandedDetails.refreshCMR')}
                                        </Button>
                                      </Box>
                                    </Box>
                                    <TableContainer component={Paper} variant="outlined">
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>{t('orders.expandedDetails.product')}</TableCell>
                                            <TableCell align="right">{t('orders.expandedDetails.quantity')}</TableCell>
                                            <TableCell align="right">{t('orders.expandedDetails.reserved')}</TableCell>
                                            <TableCell align="right">{t('orders.expandedDetails.price')}</TableCell>
                                            <TableCell align="right">{t('orders.expandedDetails.value')}</TableCell>
                                            <TableCell>{t('orders.expandedDetails.mo')}</TableCell>
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
                                                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                  <Typography variant="body2" fontWeight="medium">
                                                    {formatCurrency((parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0))}
                                                  </Typography>
                                                  {item.productionTaskId && item.productionCost !== undefined && (
                                                    <Typography variant="caption" color="text.secondary">
                                                      (Prod: {formatCurrency(item.productionCost)})
                                                    </Typography>
                                                  )}
                                                </Box>
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
                                        {t('orders.expandedDetails.linkedPurchaseOrders')}
                                      </Typography>
                                      <Button
                                        size="small"
                                        startIcon={<RefreshIcon />}
                                        onClick={() => handleRefreshOrder(order)}
                                      >
                                        {t('orders.expandedDetails.refreshPOData')}
                                      </Button>
                                    </Box>
                                    {order.linkedPurchaseOrders && Array.isArray(order.linkedPurchaseOrders) && order.linkedPurchaseOrders.length > 0 ? (
                                      <TableContainer component={Paper} variant="outlined">
                                        <Table size="small">
                                          <TableHead>
                                            <TableRow sx={{ bgcolor: 'primary.light' }}>
                                              <TableCell>{t('orders.expandedDetails.poNumber')}</TableCell>
                                              <TableCell>{t('orders.expandedDetails.supplier')}</TableCell>
                                              <TableCell align="right">{t('orders.expandedDetails.poValue')}</TableCell>
                                              <TableCell>{t('orders.expandedDetails.poStatus')}</TableCell>
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
                                                    {t('orders.actions.details')}
                                                  </Button>
                                                </TableCell>
                                              </TableRow>
                                            ))}
                                          </TableBody>
                                        </Table>
                                      </TableContainer>
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">
                                        {t('orders.expandedDetails.noPurchaseOrders')}
                                      </Typography>
                                    )}
                                  </Grid>

                                  <Grid item xs={12}>
                                    <Box sx={{ mt: 2, display: 'flex', flexDirection: 'column', gap: 1, border: '1px solid #eee', p: 2, borderRadius: 1 }}>
                                      <Typography variant="subtitle1" fontWeight="bold">{t('orders.expandedDetails.valueSummary')}</Typography>
                                      <Grid container spacing={2}>
                                        <Grid item xs={4}>
                                          <Typography variant="body2">{t('orders.expandedDetails.productsValue')}</Typography>
                                          <Typography variant="h6">{formatCurrency(order.productsValue || 0)}</Typography>
                                        </Grid>
                                        <Grid item xs={4}>
                                          <Typography variant="body2">{t('orders.expandedDetails.deliveryCost')}</Typography>
                                          <Typography variant="h6">{formatCurrency(order.shippingCost || 0)}</Typography>
                                        </Grid>
                                        <Grid item xs={4}>
                                          <Typography variant="body2">{t('orders.expandedDetails.poValue')}</Typography>
                                          <Typography variant="h6" color="warning.main">{formatCurrency(order.purchaseOrdersValue || 0)}</Typography>
                                        </Grid>
                                        <Grid item xs={12}>
                                          <Divider sx={{ my: 1 }} />
                                          <Typography variant="subtitle1" fontWeight="bold">
                                            {t('orders.expandedDetails.totalValue')} {formatCurrency((order.productsValue || 0) + (order.shippingCost || 0))}
                                          </Typography>
                                          <Typography variant="body2" color="text.secondary">
                                            {t('orders.expandedDetails.withoutPO')}
                                          </Typography>
                                        </Grid>
                                      </Grid>
                                    </Box>
                                  </Grid>

                                  <Grid item xs={12}>
                                    <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                                      <Typography variant="subtitle2">{t('orders.expandedDetails.changeStatus')}</Typography>
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
              rowsPerPage={state.rowsPerPage}
              page={state.page - 1} // Odejmujemy 1, bo MUI TablePagination używa indeksowania od 0
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              labelRowsPerPage={t('orders.pagination.rowsPerPage')}
              labelDisplayedRows={({ from, to, count }) => t('orders.pagination.displayedRows', { from, to, count })}
            />
          </>
        )}
      </Paper>

      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={!!orderToDelete}
        onClose={handleCancelDelete}
      >
        <DialogTitle>{t('orders.dialogs.deleteConfirmation.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {orderToDelete && t('orders.dialogs.deleteConfirmation.description', {
              number: orderToDelete.id && orderToDelete.id.substring(0, 8).toUpperCase(),
              customer: typeof orderToDelete.customer === 'object' && orderToDelete.customer !== null 
                ? (orderToDelete.customer.name || '(brak danych)') 
                : String(orderToDelete.customer) || '(brak danych)',
              value: formatCurrency(orderToDelete.totalValue || 0)
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>{t('orders.dialogs.deleteConfirmation.cancel')}</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            {t('orders.dialogs.deleteConfirmation.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog zmiany statusu */}
      <Dialog
        open={!!statusChangeInfo}
        onClose={handleCancelStatusChange}
      >
        <DialogTitle>{t('orders.dialogs.statusChange.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {statusChangeInfo && t('orders.dialogs.statusChange.description', {
              number: statusChangeInfo.orderNumber,
              currentStatus: statusChangeInfo.currentStatus,
              newStatus: statusChangeInfo.newStatus
            })}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelStatusChange}>{t('orders.dialogs.statusChange.cancel')}</Button>
          <Button onClick={handleConfirmStatusChange} color="primary" variant="contained">
            {t('orders.dialogs.statusChange.confirm')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Nowy dialog zmiany statusu (podobnie jak w PO) */}
      <Dialog
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
      >
        <DialogTitle>{t('orders.dialogs.statusChange.newTitle')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {t('orders.dialogs.statusChange.selectStatus')}
            {orderToUpdateStatus && (
              <>
                <br />
                {t('orders.dialogs.statusChange.orderNumber')} {orderToUpdateStatus.orderNumber || `#${orderToUpdateStatus.id.substring(0, 8).toUpperCase()}`}
              </>
            )}
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel id="new-status-label">{t('orders.dialogs.statusChange.status')}</InputLabel>
            <Select
              labelId="new-status-label"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              label={t('orders.dialogs.statusChange.status')}
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
          <Button onClick={() => setStatusDialogOpen(false)}>{t('orders.dialogs.statusChange.cancel')}</Button>
          <Button color="primary" onClick={handleStatusUpdate}>{t('orders.dialogs.statusChange.update')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OrdersList; 