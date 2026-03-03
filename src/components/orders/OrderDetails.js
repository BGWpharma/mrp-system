import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useParams, Link as RouterLink, useLocation } from 'react-router-dom';
import {
  Box,
  Button,
  Paper,
  Typography,
  Grid,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  IconButton,
  CircularProgress,
  Card,
  CardContent,
  Link,
  Stack,
  TextField,
  Input,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Tooltip,
  Alert,
  AlertTitle,
  Popover,
  List,
  ListItem,
  ListItemText,
  ListItemButton
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Print as PrintIcon,
  Email as EmailIcon,
  LocalShipping as LocalShippingIcon,
  Schedule as ScheduleIcon,
  EventNote as EventNoteIcon,
  Payment as PaymentIcon,
  Person as PersonIcon,
  LocationOn as LocationOnIcon,
  Phone as PhoneIcon,
  Upload as UploadIcon,
  DownloadRounded as DownloadIcon,
  Delete as DeleteIcon,
  Engineering as EngineeringIcon,
  PlaylistAdd as PlaylistAddIcon,
  Refresh as RefreshIcon,
  PictureAsPdf as PdfIcon,
  Link as LinkIcon,
  OpenInNew as OpenInNewIcon,
  Add as AddIcon,
  Info as InfoIcon,
  Receipt as ReceiptIcon
} from '@mui/icons-material';
import { getOrderById, ORDER_STATUSES, updateOrder, migrateCmrHistoryData, updateCustomerOrderNumber, validateOrderNumberFormat, refreshShippedQuantitiesFromCMR, updateOrderStatus } from '../../services/orders';
import { useNotification } from '../../hooks/useNotification';
import { formatCurrency } from '../../utils/formatting';
import { formatTimestamp, formatDate } from '../../utils/dateUtils';
import { storage } from '../../services/firebase/config';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '../../contexts/AuthContext';
import { getAllPurchaseOrders } from '../../services/purchaseOrders';
import { db } from '../../services/firebase/config';
import { getDoc, doc } from 'firebase/firestore';
import { useVisibilityAwareSnapshot } from '../../hooks/useVisibilityAwareSnapshot';
import { getUsersDisplayNames } from '../../services/userService';
import { calculateFullProductionUnitCost, calculateProductionUnitCost } from '../../utils/calculations';
import { getInvoicesByOrderId, getInvoicedAmountsByOrderItems, getProformaAmountsByOrderItems, migrateInvoiceItemsOrderIds, getAvailableProformasForOrder } from '../../services/finance';
import { getCmrDocumentsByOrderId, CMR_STATUSES } from '../../services/logistics';
import { recalculateShippedQuantities } from '../../services/cloudFunctionsService';
import { useTranslation } from '../../hooks/useTranslation';
// ✅ OPTYMALIZACJA: Import wspólnych stylów MUI
import { 
  flexCenter, 
  flexBetween,
  loadingContainer,
  mb1,
  mb2,
  mb3,
  mr1,
  mr2,
  p2,
  p3
} from '../../styles/muiCommonStyles';

// 🚀 CACHE SYSTEM dla optymalizacji zapytań
const orderCache = new Map();
const defaultCacheTTL = 5 * 60 * 1000; // 5 minut

const getCacheKey = (type, id) => `${type}_${id}`;

const getCachedData = (key, ttl = defaultCacheTTL) => {
  const cached = orderCache.get(key);
  if (cached && (Date.now() - cached.timestamp) < ttl) {
    return cached.data;
  }
  return null;
};

const setCachedData = (key, data) => {
  orderCache.set(key, {
    data,
    timestamp: Date.now()
  });
};

const invalidateCache = (pattern) => {
  const keysToDelete = [];
  orderCache.forEach((_, key) => {
    if (key.includes(pattern)) {
      keysToDelete.push(key);
    }
  });
  keysToDelete.forEach(key => {
    orderCache.delete(key);
  });
};

// Cache funkcje pomocnicze
const getCachedUserNames = async (userIds) => {
  if (!userIds?.length) return {};
  
  const cacheKey = getCacheKey('userNames', userIds.sort().join(','));
  const cached = getCachedData(cacheKey, 10 * 60 * 1000); // 10 minut dla nazwisk
  
  if (cached) return cached;
  
  const data = await getUsersDisplayNames(userIds);
  setCachedData(cacheKey, data);
  return data;
};

const getCachedOrderInvoices = async (orderId) => {
  const cacheKey = getCacheKey('orderInvoices', orderId);
  const cached = getCachedData(cacheKey, 2 * 60 * 1000); // 2 minuty dla faktur
  
  if (cached) return cached;
  
  const data = await getInvoicesByOrderId(orderId);
  setCachedData(cacheKey, data);
  return data;
};

const getCachedOrderCmrDocuments = async (orderId) => {
  const cacheKey = getCacheKey('orderCmr', orderId);
  const cached = getCachedData(cacheKey, 2 * 60 * 1000); // 2 minuty dla CMR
  
  if (cached) return cached;
  
  const data = await getCmrDocumentsByOrderId(orderId);
  setCachedData(cacheKey, data);
  return data;
};

// Funkcja obliczająca sumę wartości pozycji z uwzględnieniem kosztów produkcji dla pozycji spoza listy cenowej
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

// Funkcja sprawdzająca czy zadania produkcyjne istnieją i usuwająca nieistniejące referencje
const verifyProductionTasks = async (orderToVerify) => {
  if (!orderToVerify || !orderToVerify.productionTasks || orderToVerify.productionTasks.length === 0) {
    return { order: orderToVerify, removedCount: 0 };
  }

  try {
    const { getMultipleTasksById } = await import('../../services/production/productionService');
    const { removeProductionTaskFromOrder } = await import('../../services/orders');
    
    // 🚀 OPTYMALIZACJA: Pobierz wszystkie zadania równolegle
    const taskIds = orderToVerify.productionTasks.map(task => task.id);
    const taskDocsMap = await getMultipleTasksById(taskIds);
    
    const verifiedTasks = [];
    const tasksToRemove = [];
    
    // Przetwórz wyniki batch query
    for (const task of orderToVerify.productionTasks) {
      const taskDoc = taskDocsMap[task.id];
      
      if (!taskDoc) {
        // Zadanie nie istnieje - dodaj do usunięcia
        console.error(`Zadanie ${task.id} nie istnieje w bazie danych`);
        tasksToRemove.push(task);
        
        // Aktualizuj powiązane elementy zamówienia
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
        continue;
      }
      
      // Sprawdź czy dane wymagają synchronizacji
      const needsUpdate = 
        task.status !== taskDoc.status ||
        Math.abs((task.totalMaterialCost || 0) - (taskDoc.totalMaterialCost || 0)) > 0.01 ||
        Math.abs((task.totalFullProductionCost || 0) - (taskDoc.totalFullProductionCost || 0)) > 0.01 ||
        task.moNumber !== taskDoc.moNumber ||
        task.name !== taskDoc.name ||
        task.productName !== taskDoc.productName ||
        task.quantity !== taskDoc.quantity ||
        task.endDate !== taskDoc.endDate ||
        task.completionDate !== taskDoc.completionDate ||
        task.lotNumber !== taskDoc.lotNumber ||
        task.finalQuantity !== taskDoc.finalQuantity ||
        task.inventoryBatchId !== taskDoc.inventoryBatchId;
      
      if (needsUpdate) {
        // Buduj obiekt updatedTask tylko z polami, które nie są undefined
        const updatedTask = {
          ...task,
          status: taskDoc.status,
          totalMaterialCost: taskDoc.totalMaterialCost || 0,
          unitMaterialCost: taskDoc.unitMaterialCost || 0,
          totalFullProductionCost: taskDoc.totalFullProductionCost || 0,
          unitFullProductionCost: taskDoc.unitFullProductionCost || 0,
          moNumber: taskDoc.moNumber,
          name: taskDoc.name,
          productName: taskDoc.productName,
          quantity: taskDoc.quantity,
          unit: taskDoc.unit,
          updatedAt: new Date().toISOString()
        };
        
        // Dodaj opcjonalne pola tylko jeśli nie są undefined
        if (taskDoc.endDate !== undefined) {
          updatedTask.endDate = taskDoc.endDate;
        }
        if (taskDoc.completionDate !== undefined) {
          updatedTask.completionDate = taskDoc.completionDate;
        }
        if (taskDoc.productionSessions !== undefined) {
          updatedTask.productionSessions = taskDoc.productionSessions;
        }
        if (taskDoc.lotNumber !== undefined) {
          updatedTask.lotNumber = taskDoc.lotNumber;
        }
        if (taskDoc.finalQuantity !== undefined) {
          updatedTask.finalQuantity = taskDoc.finalQuantity;
        }
        if (taskDoc.inventoryBatchId !== undefined) {
          updatedTask.inventoryBatchId = taskDoc.inventoryBatchId;
        }
        
        verifiedTasks.push(updatedTask);
        
        // 🔄 SYNCHRONIZACJA: Aktualizuj status i koszty w pozycjach zamówienia
        if (orderToVerify.items) {
          orderToVerify.items = orderToVerify.items.map(item => {
            if (item.productionTaskId === task.id) {
              // Łączny koszt materiałów (tylko z flagą "wliczaj do kosztów") + koszt zakładu
              const materialCost = (taskDoc.totalMaterialCost || 0) + (taskDoc.factoryCostTotal || 0);
              const unitMaterialCost = (taskDoc.unitMaterialCost || 0) + (taskDoc.factoryCostPerUnit || 0);
              // Pełny koszt produkcji (wszystkie materiały) + koszt zakładu
              const fullCost = taskDoc.totalCostWithFactory || taskDoc.totalFullProductionCost || 0;
              const unitFullCost = taskDoc.unitCostWithFactory || taskDoc.unitFullProductionCost || 0;
              return {
                ...item,
                productionStatus: taskDoc.status,
                productionTaskNumber: taskDoc.moNumber,
                productionCost: materialCost, // Łączny koszt materiałów z zakładem
                fullProductionCost: fullCost, // Pełny koszt produkcji z zakładem
                productionUnitCost: unitMaterialCost, // Koszt jednostkowy materiałów z zakładem
                fullProductionUnitCost: unitFullCost, // Pełny koszt jednostkowy z zakładem
                factoryCostIncluded: (taskDoc.factoryCostTotal || 0) > 0
              };
            }
            return item;
          });
        }
      } else {
        verifiedTasks.push(task);
      }
    }
    
    // Sprawdź czy są zadania do usunięcia lub dane zostały zaktualizowane
    const hasChanges = tasksToRemove.length > 0 || verifiedTasks.some((task, index) => {
      const originalTask = orderToVerify.productionTasks[index];
      return JSON.stringify(task) !== JSON.stringify(originalTask);
    });
    
    if (hasChanges) {
      // Usuń nieistniejące zadania z zamówienia
      if (tasksToRemove.length > 0 && orderToVerify.id) {
        for (const task of tasksToRemove) {
          try {
            await removeProductionTaskFromOrder(orderToVerify.id, task.id);
          } catch (error) {
            console.error(`Błąd podczas usuwania referencji do zadania ${task.id}:`, error);
          }
        }
      }
      
      // Zapisz zaktualizowane dane zadań do zamówienia w bazie
      if (orderToVerify.id && verifiedTasks.length > 0) {
        try {
          const { updateOrder } = await import('../../services/orders');
          const updatedOrderData = {
            ...orderToVerify,
            productionTasks: verifiedTasks,
            updatedAt: new Date().toISOString()
          };
          
          await updateOrder(orderToVerify.id, updatedOrderData, 'system');
        } catch (error) {
          console.error('Błąd podczas zapisywania zaktualizowanych zadań:', error);
        }
      }
      
      // Zaktualizuj dane zamówienia lokalnie
      const updatedOrder = {
        ...orderToVerify,
        productionTasks: verifiedTasks
      };
      
      return { order: updatedOrder, removedCount: tasksToRemove.length, updatedCount: verifiedTasks.length, fullTasksMap: taskDocsMap };
    }
    
    return { order: orderToVerify, removedCount: 0, updatedCount: 0, fullTasksMap: taskDocsMap };
  } catch (error) {
    console.error('Błąd podczas weryfikacji zadań produkcyjnych:', error);
    return { order: orderToVerify, removedCount: 0, fullTasksMap: {} };
  }
};

const OrderDetails = () => {
  const { t } = useTranslation('orders');
  const { orderId } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const { showError, showSuccess, showInfo } = useNotification();
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [userNames, setUserNames] = useState({});
  const [invoices, setInvoices] = useState([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [cmrDocuments, setCmrDocuments] = useState([]);
  const [loadingCmrDocuments, setLoadingCmrDocuments] = useState(false);
  const [invoicedAmounts, setInvoicedAmounts] = useState({});
  const [proformaAmounts, setProformaAmounts] = useState({});
  const [availableProformaAmounts, setAvailableProformaAmounts] = useState({}); // Map: proformaId -> availableAmount
  const [fullProductionTasks, setFullProductionTasks] = useState({});
  
  // State dla popover z listą faktur
  const [invoicePopoverAnchor, setInvoicePopoverAnchor] = useState(null);
  const [selectedInvoiceData, setSelectedInvoiceData] = useState(null);
  
  // State dla edycji numeru CO
  const [isEditingOrderNumber, setIsEditingOrderNumber] = useState(false);
  const [newOrderNumber, setNewOrderNumber] = useState('');
  const [orderNumberError, setOrderNumberError] = useState('');
  const [isUpdatingOrderNumber, setIsUpdatingOrderNumber] = useState(false);
  const [updateOrderNumberDialogOpen, setUpdateOrderNumberDialogOpen] = useState(false);
  const [isRefreshingCmr, setIsRefreshingCmr] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');

  // 🚀 LAZY LOADING State Management
  const [activeSection, setActiveSection] = useState('basic'); // basic, production, documents, history
  const [sectionsLoaded, setSectionsLoaded] = useState({
    basic: true,      // Podstawowe dane zawsze załadowane
    production: false, // Zadania produkcyjne
    documents: false,  // CMR i faktury
    history: false     // Historia statusów
  });

  // 🚀 Funkcja do lazy loading faktur
  const loadInvoices = useCallback(async () => {
    if (invoices.length > 0 || loadingInvoices) {
      return;
    }
    
    try {
      setLoadingInvoices(true);
      const orderInvoices = await getCachedOrderInvoices(orderId);
      const { invoices: verifiedInvoices, removedCount } = await verifyInvoices(orderInvoices);
      setInvoices(verifiedInvoices);
      
      if (removedCount > 0) {
        showInfo(`Usunięto ${removedCount} nieistniejących faktur z listy`);
      }
    } catch (error) {
      console.error('Błąd podczas lazy loading faktur:', error);
    } finally {
      setLoadingInvoices(false);
    }
  }, [orderId, invoices.length, loadingInvoices, showInfo]);

  // 🚀 Funkcja do lazy loading dokumentów CMR
  const loadCmrDocuments = useCallback(async () => {
    if (cmrDocuments.length > 0 || loadingCmrDocuments) {
      return;
    }
    
    try {
      setLoadingCmrDocuments(true);
      const orderCmr = await getCachedOrderCmrDocuments(orderId);
      const { cmrDocuments: verifiedCmr, removedCount } = await verifyCmrDocuments(orderCmr);
      setCmrDocuments(verifiedCmr);
      
      if (removedCount > 0) {
        showInfo(`Usunięto ${removedCount} nieistniejących dokumentów CMR z listy`);
      }
    } catch (error) {
      console.error('Błąd podczas lazy loading dokumentów CMR:', error);
    } finally {
      setLoadingCmrDocuments(false);
    }
  }, [orderId, cmrDocuments.length, loadingCmrDocuments, showInfo]);

  // Funkcja do załadowania sekcji na żądanie (przestarzała - używamy teraz IntersectionObserver)
  const loadSectionData = async (sectionName) => {
    if (sectionsLoaded[sectionName] || !order) return;
    
    try {
      switch (sectionName) {
        case 'production':
          // Dane produkcyjne już ładowane w głównym useEffect
          break;
        case 'documents':
          await Promise.all([loadInvoices(), loadCmrDocuments()]);
          break;
        case 'history':
          if (order.statusHistory?.length > 0 && Object.keys(userNames).length === 0) {
            const userIds = [...new Set(
              order.statusHistory
                .map(change => change.changedBy)
                .filter(id => id)
            )];
            if (userIds.length > 0) {
              const names = await getCachedUserNames(userIds);
              setUserNames(names);
            }
          }
          break;
      }
      
      setSectionsLoaded(prev => ({ ...prev, [sectionName]: true }));
    } catch (error) {
      console.error(`Błąd podczas ładowania sekcji ${sectionName}:`, error);
    }
  };

  // Handler do zmiany aktywnej sekcji z lazy loading
  const handleSectionChange = (sectionName) => {
    setActiveSection(sectionName);
    loadSectionData(sectionName);
  };

  useEffect(() => {
    let cancelled = false;

    const fetchOrderDetails = async (retries = 3, delay = 1000) => {
      try {
        setLoading(true);
        
        if (location.pathname.includes('/purchase-orders/')) {
          setLoading(false);
          return;
        }
        
        const orderData = await getOrderById(orderId);
        if (cancelled) return;
        
        const { order: verifiedOrder, removedCount, fullTasksMap } = await verifyProductionTasks(orderData);
        if (cancelled) return;
        
        if (removedCount > 0) {
          showInfo(t('orderDetails.notifications.productionTasksRemoved', { count: removedCount }));
        }
        
        setOrder(verifiedOrder);
        
        if (fullTasksMap && Object.keys(fullTasksMap).length > 0) {
          setFullProductionTasks(fullTasksMap);
        }
        
        const fetchPromises = [];
        
        let userNamesPromise = null;
        if (verifiedOrder.statusHistory?.length > 0) {
          const userIds = [...new Set(
            verifiedOrder.statusHistory
              .map(change => change.changedBy)
              .filter(id => id)
          )];
          
          if (userIds.length > 0) {
            userNamesPromise = getCachedUserNames(userIds);
            fetchPromises.push(userNamesPromise);
          }
        }
        
        const invoicedAmountsPromise = getInvoicedAmountsByOrderItems(orderId, null, verifiedOrder);
        fetchPromises.push(invoicedAmountsPromise);
        
        const proformaAmountsPromise = getProformaAmountsByOrderItems(orderId, null, verifiedOrder);
        fetchPromises.push(proformaAmountsPromise);
        
        const availableProformasPromise = getAvailableProformasForOrder(orderId);
        fetchPromises.push(availableProformasPromise);
        
        try {
          const results = await Promise.allSettled(fetchPromises);
          if (cancelled) return;
          
          let resultIndex = 0;
          
          if (userNamesPromise) {
            const userNamesResult = results[resultIndex++];
            if (userNamesResult.status === 'fulfilled') {
              setUserNames(userNamesResult.value);
            } else {
              console.error('Błąd podczas pobierania nazw użytkowników:', userNamesResult.reason);
            }
          }
          
          const invoicedAmountsResult = results[resultIndex++];
          if (invoicedAmountsResult.status === 'fulfilled') {
            setInvoicedAmounts(invoicedAmountsResult.value);
          } else {
            console.error('Błąd podczas pobierania zafakturowanych kwot:', invoicedAmountsResult.reason);
          }
          
          const proformaAmountsResult = results[resultIndex++];
          if (proformaAmountsResult.status === 'fulfilled') {
            setProformaAmounts(proformaAmountsResult.value);
          } else {
            console.error('Błąd podczas pobierania kwot proform:', proformaAmountsResult.reason);
          }
          
          const availableProformasResult = results[resultIndex++];
          if (availableProformasResult.status === 'fulfilled') {
            const availableProformas = availableProformasResult.value;
            const proformaAmountsMap = {};
            availableProformas.forEach(proforma => {
              proformaAmountsMap[proforma.id] = proforma.amountInfo?.available || 0;
            });
            setAvailableProformaAmounts(proformaAmountsMap);
          } else {
            console.error('Błąd podczas pobierania dostępnych proform:', availableProformasResult.reason);
          }
          
        } catch (error) {
          if (cancelled) return;
          console.error('Błąd podczas równoległego pobierania danych:', error);
        }
      } catch (error) {
        if (cancelled) return;
        if (!location.pathname.includes('/purchase-orders/')) {
          console.error('Error fetching order details:', error);
          
          if (retries > 0) {
            setTimeout(() => {
              fetchOrderDetails(retries - 1, delay * 1.5);
            }, delay);
          } else {
            showError(t('orderDetails.notifications.loadError') + ': ' + error.message);
          }
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    if (orderId) {
      fetchOrderDetails();
    }

    return () => { cancelled = true; };
  }, [orderId, showError, navigate, location.pathname]);

  // 📡 Real-time listener dla aktualizacji zamówienia (np. z Cloud Functions)
  const lastOrderUpdateRef = useRef(0);

  useEffect(() => {
    if (order?.updatedAt) {
      lastOrderUpdateRef.current = order.updatedAt?.toMillis?.() || order.updatedAt?.seconds * 1000 || 0;
    }
  }, [order?.updatedAt]);

  useVisibilityAwareSnapshot(
    orderId && order ? doc(db, 'orders', orderId) : null,
    { includeMetadataChanges: false },
    (docSnapshot) => {
      if (!docSnapshot.exists()) return;
      
      const newData = docSnapshot.data();
      const newTimestamp = newData.updatedAt?.toMillis?.() || newData.updatedAt?.seconds * 1000 || 0;
      
      if (newTimestamp > lastOrderUpdateRef.current) {
        lastOrderUpdateRef.current = newTimestamp;
        
        setOrder(prev => ({
          ...prev,
          ...newData,
          id: docSnapshot.id
        }));
      }
    },
    (error) => {
      console.error('❌ [REAL-TIME] Błąd listenera zamówienia:', error);
    },
    [orderId, order?.id]
  );

  // Automatyczne odświeżanie danych co 30 sekund - WYŁĄCZONE aby uniknąć niepotrzebnych zapytań do bazy
  /*
  useEffect(() => {
    if (!orderId || loading) return;

    const interval = setInterval(() => {
      console.log('[AUTO-REFRESH] Automatyczne odświeżanie danych zamówienia');
      refreshOrderData();
    }, 30000); // Co 30 sekund

    return () => {
      clearInterval(interval);
    };
  }, [orderId, loading]);
  */

  // Nasłuchiwanie powiadomień o aktualizacji kosztów zadań produkcyjnych
  useEffect(() => {
    if (!orderId) return;

    let channel;
    try {
      // Stwórz BroadcastChannel do nasłuchiwania aktualizacji kosztów
      channel = new BroadcastChannel('production-costs-update');
      
      const handleCostUpdate = (event) => {
        if (event.data.type === 'TASK_COSTS_UPDATED') {
          const { taskId, costs, timestamp } = event.data;
          
          // Sprawdź czy to zamówienie ma to zadanie produkcyjne
          if (order && (
            (order.items && order.items.some(item => item.productionTaskId === taskId)) ||
            (order.productionTasks && order.productionTasks.some(task => task.id === taskId))
          )) {
            // Odśwież dane zamówienia po krótkiej przerwie, aby upewnić się, że baza danych została zaktualizowana
            setTimeout(() => {
              refreshOrderData();
            }, 500);
          }
        }
      };

      channel.addEventListener('message', handleCostUpdate);
      
    } catch (error) {
      console.warn('Nie można utworzyć BroadcastChannel:', error);
    }

    return () => {
      if (channel) {
        channel.close();
      }
    };
  }, [orderId, order]);

  // 🚀 LAZY LOADING - Automatyczne ładowanie faktur i CMR z opóźnieniem
  useEffect(() => {
    if (!order) {
      return;
    }

    // Ładuj faktury i CMR po krótkim opóźnieniu (nie blokuj głównego renderowania)
    const timer = setTimeout(() => {
      loadInvoices();
      loadCmrDocuments();
    }, 500); // 500ms opóźnienia - wystarczy żeby główny widok się załadował

    return () => {
      clearTimeout(timer);
    };
  }, [order, loadInvoices, loadCmrDocuments]);

  // Funkcja do ręcznego odświeżania danych zamówienia
  const refreshOrderData = async (retries = 3, delay = 1000) => {
    try {
      setLoading(true);
      
      // Sprawdź, czy jesteśmy na właściwej trasie dla zamówień klientów
      if (location.pathname.includes('/purchase-orders/')) {
        setLoading(false);
        return;
      }
      
      // 🗑️ Wyczyść cache dla tego zamówienia przed odświeżeniem
      invalidateCache(orderId);
      
      const freshOrder = await getOrderById(orderId);
      
      // Zweryfikuj, czy powiązane zadania produkcyjne istnieją
      const { order: verifiedOrder, removedCount } = await verifyProductionTasks(freshOrder);
      
      if (removedCount > 0) {
        showInfo(t('orderDetails.notifications.productionTasksRemoved', { count: removedCount }));
      }
      
      setOrder(verifiedOrder);
      showSuccess(t('orderDetails.notifications.refreshSuccess'));
    } catch (error) {
      if (!location.pathname.includes('/purchase-orders/')) {
        console.error('Error refreshing order data:', error);
        
        // Jeśli mamy jeszcze próby, spróbuj ponownie po opóźnieniu
        if (retries > 0) {
          setTimeout(() => {
            refreshOrderData(retries - 1, delay * 1.5);
          }, delay);
        } else {
          showError(t('orderDetails.notifications.refreshError') + ': ' + error.message);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Funkcja do odświeżania danych o kosztach produkcji
  const refreshProductionCosts = async (retries = 3, delay = 1000) => {
    try {
      setLoading(true);
      
      // Sprawdź, czy jesteśmy na właściwej trasie dla zamówień klientów
      if (location.pathname.includes('/purchase-orders/')) {
        setLoading(false);
        return;
      }
      
      // Pobierz aktualne dane zadań produkcyjnych
      const refreshedOrderData = await getOrderById(orderId);
      
      // Importuj funkcję do pobierania szczegółów zadania
      const { getTaskById } = await import('../../services/production/productionService');
      const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/calculations');
      
      if (refreshedOrderData.productionTasks && refreshedOrderData.productionTasks.length > 0) {
        // Zaktualizuj dane kosztów produkcji w pozycjach zamówienia
        const updatedOrderData = { ...refreshedOrderData };
        
        if (updatedOrderData.items && updatedOrderData.items.length > 0) {
          for (let i = 0; i < updatedOrderData.items.length; i++) {
            const item = updatedOrderData.items[i];
            
            // Znajdź powiązane zadanie produkcyjne
            const associatedTask = updatedOrderData.productionTasks.find(task => 
              task.id === item.productionTaskId
            );
            
            if (associatedTask) {
              try {
                // Pobierz szczegółowe dane zadania z bazy danych
                const taskDetails = await getTaskById(associatedTask.id);
                
                // Łączny koszt materiałów (tylko z flagą "wliczaj do kosztów") + koszt zakładu
                const materialCost = (taskDetails.totalMaterialCost || associatedTask.totalMaterialCost || 0) + (taskDetails.factoryCostTotal || 0);
                const unitMaterialCost = (taskDetails.unitMaterialCost || associatedTask.unitMaterialCost || 0) + (taskDetails.factoryCostPerUnit || 0);
                
                // Pełny koszt produkcji (wszystkie materiały) + koszt zakładu
                const fullProductionCost = taskDetails.totalCostWithFactory || taskDetails.totalFullProductionCost || associatedTask.totalFullProductionCost || 0;
                const unitFullCost = taskDetails.unitCostWithFactory || taskDetails.unitFullProductionCost || 0;
                
                // Oblicz koszty jednostkowe z uwzględnieniem logiki listy cenowej
                const calculatedFullProductionUnitCost = calculateFullProductionUnitCost(item, fullProductionCost);
                const calculatedProductionUnitCost = calculateProductionUnitCost(item, materialCost);
                
                // Aktualizuj informacje o zadaniu produkcyjnym w pozycji zamówienia
                updatedOrderData.items[i] = {
                  ...item,
                  productionTaskId: associatedTask.id,
                  productionTaskNumber: associatedTask.moNumber || taskDetails.moNumber,
                  productionStatus: associatedTask.status || taskDetails.status,
                  // Łączny koszt materiałów z zakładem
                  productionCost: materialCost,
                  fullProductionCost: fullProductionCost,
                  // Koszty jednostkowe
                  productionUnitCost: unitMaterialCost || calculatedProductionUnitCost,
                  fullProductionUnitCost: unitFullCost || calculatedFullProductionUnitCost,
                  // Zapisz też czy koszt zakładu jest wliczony
                  factoryCostIncluded: (taskDetails.factoryCostTotal || 0) > 0
                };
              } catch (error) {
                console.error(`Błąd podczas pobierania szczegółów zadania ${associatedTask.id}:`, error);
                
                // W przypadku błędu, użyj podstawowych danych z associatedTask
                // Łączny koszt materiałów (tylko z flagą "wliczaj do kosztów") + koszt zakładu
                const materialCost = (associatedTask.totalMaterialCost || 0) + (associatedTask.factoryCostTotal || 0);
                const unitMaterialCost = (associatedTask.unitMaterialCost || 0) + (associatedTask.factoryCostPerUnit || 0);
                // Pełny koszt produkcji (wszystkie materiały) + koszt zakładu
                const fullProductionCost = associatedTask.totalCostWithFactory || associatedTask.totalFullProductionCost || 0;
                
                updatedOrderData.items[i] = {
                  ...item,
                  productionTaskId: associatedTask.id,
                  productionTaskNumber: associatedTask.moNumber,
                  productionStatus: associatedTask.status,
                  productionCost: materialCost,
                  fullProductionCost: fullProductionCost,
                  productionUnitCost: unitMaterialCost || (materialCost / (parseFloat(item.quantity) || 1)),
                  fullProductionUnitCost: fullProductionCost / (parseFloat(item.quantity) || 1)
                };
              }
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

        const newTotalValue = subtotal + shippingCost + additionalCosts - discounts;
        updatedOrderData.totalValue = Math.round(newTotalValue * 100) / 100;

        // Zapisz zaktualizowane dane do bazy
        try {
          const { updateOrder } = await import('../../services/orders');
          await updateOrder(orderId, {
            items: updatedOrderData.items,
            totalValue: updatedOrderData.totalValue,
            orderNumber: updatedOrderData.orderNumber,
            orderDate: updatedOrderData.orderDate,
            status: updatedOrderData.status,
            customer: updatedOrderData.customer
          }, 'system');
          console.log(`[refreshProductionCosts] Zapisano zamówienie ${orderId} z nową wartością: ${newTotalValue}€`);
        } catch (saveError) {
          console.error('Błąd podczas zapisywania zamówienia:', saveError);
        }

        // Zaktualizuj dane zamówienia
        setOrder(updatedOrderData);
        showSuccess(t('orderDetails.notifications.productionCostsRefreshed'));
      } else {
        showInfo(t('orderDetails.notifications.noProductionTasks'));
      }
    } catch (error) {
      if (!location.pathname.includes('/purchase-orders/')) {
        console.error('Error refreshing production costs:', error);
        
        // Jeśli mamy jeszcze próby, spróbuj ponownie po opóźnieniu
        if (retries > 0) {
          setTimeout(() => {
            refreshProductionCosts(retries - 1, delay * 1.5);
          }, delay);
        } else {
          showError(t('orderDetails.notifications.productionCostsRefreshError') + ': ' + error.message);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  // Funkcja do uruchomienia migracji danych CMR (tylko do testowania)
  const handleMigrateCmrData = async () => {
    try {
      setLoading(true);
      showInfo(t('orderDetails.notifications.migrationStarted'));
      
      const result = await migrateCmrHistoryData();
      
      if (result.success) {
        showSuccess(t('orderDetails.notifications.migrationSuccess', { count: result.migratedCount }));
        // Odśwież dane zamówienia
        await refreshOrderData();
      }
    } catch (error) {
      console.error('Błąd podczas migracji:', error);
      showError(t('orderDetails.notifications.migrationError') + ': ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleBackClick = () => {
    navigate('/orders');
  };

  const handleEditClick = () => {
    navigate(`/orders/edit/${orderId}`);
  };

  const handlePrintInvoice = () => {
    // Funkcjonalność drukowania faktury do zaimplementowania w przyszłości
    window.print();
  };

  const handleSendEmail = () => {
    // Funkcjonalność wysyłania emaila do zaimplementowania w przyszłości
    const emailAddress = order?.customer?.email;
    if (emailAddress) {
      window.location.href = `mailto:${emailAddress}?subject=Zamówienie ${order.orderNumber || order.id.substring(0, 8).toUpperCase()}`;
    }
  };

  const getStatusChipColor = (status) => {
    switch (status) {
      case 'Nowe': return 'primary';
      case 'W realizacji': return 'info';
      case 'Zakończone': return 'success';
      case 'Rozliczone': return 'secondary'; // fioletowy w MUI
      case 'Anulowane': return 'error';
      default: return 'default';
    }
  };

  const getProductionStatusColor = (status) => {
    switch (status) {
      case 'Nowe': return 'default';
      case 'Zaplanowane': return 'primary';
      case 'W trakcie': return 'secondary';
      case 'Wstrzymane': return 'warning';
      case 'Zakończone': return 'success';
      case 'Anulowane': return 'error';
      case 'Potwierdzenie zużycia': return 'info';
      default: return 'default';
    }
  };

  // Funkcje obsługi edycji numeru CO
  const handleEditOrderNumberClick = () => {
    setNewOrderNumber(order.orderNumber || '');
    setIsEditingOrderNumber(true);
    setOrderNumberError('');
  };

  const handleCancelEditOrderNumber = () => {
    setIsEditingOrderNumber(false);
    setNewOrderNumber('');
    setOrderNumberError('');
  };

  const handleOrderNumberChange = (e) => {
    const value = e.target.value.toUpperCase();
    setNewOrderNumber(value);
    
    // Walidacja w czasie rzeczywistym
    if (value && !validateOrderNumberFormat(value)) {
      setOrderNumberError('Nieprawidłowy format numeru CO (np. CO00090)');
    } else if (value === order.orderNumber) {
      setOrderNumberError('Numer jest taki sam jak aktualny');
    } else {
      setOrderNumberError('');
    }
  };

  const handleConfirmOrderNumberChange = () => {
    if (orderNumberError || !newOrderNumber) {
      return;
    }
    setUpdateOrderNumberDialogOpen(true);
  };

  const handleUpdateOrderNumber = async () => {
    setIsUpdatingOrderNumber(true);
    try {
      const report = await updateCustomerOrderNumber(
        order.id,
        newOrderNumber,
        currentUser.uid
      );
      
      // Pokaż szczegółowy raport
      const message = `✅ Zaktualizowano numer CO z ${report.oldOrderNumber} na ${report.newOrderNumber}
      
Zaktualizowane dokumenty:
• Zamówienie: ${report.updatedDocuments.order ? 'Tak' : 'Nie'}
• Faktury: ${report.updatedDocuments.invoices}
• Zadania produkcyjne: ${report.updatedDocuments.productionTasks}
• Dokumenty CMR: ${report.updatedDocuments.cmrDocuments}
• Partie magazynowe: ${report.updatedDocuments.inventoryBatches}
${report.errors.length > 0 ? `\n⚠️ Ostrzeżenia: ${report.errors.length}` : ''}`;
      
      showSuccess(message);
      
      // Odśwież dane zamówienia
      const updatedOrderData = await getOrderById(order.id);
      setOrder(updatedOrderData);
      invalidateCache(order.id);
      
      setIsEditingOrderNumber(false);
      setNewOrderNumber('');
      setUpdateOrderNumberDialogOpen(false);
    } catch (error) {
      console.error('Błąd aktualizacji numeru CO:', error);
      showError('Błąd: ' + error.message);
    } finally {
      setIsUpdatingOrderNumber(false);
    }
  };

  // Funkcja do ręcznego odświeżania ilości wysłanych z CMR
  const handleRefreshShippedQuantities = async () => {
    if (!order || !order.id) {
      showError('Brak danych zamówienia');
      return;
    }

    try {
      setIsRefreshingCmr(true);

      // Wywołaj Cloud Function przez serwis (z prawidłowym regionem europe-central2)
      const result = await recalculateShippedQuantities(order.id);

      if (result.success) {
        showSuccess(result.message);

        // Odśwież dane zamówienia i wyczyść cache
        invalidateCache(order.id);
        await refreshOrderData();

        // Odśwież też dokumenty CMR
        invalidateCache(`orderCmr_${order.id}`);
        setCmrDocuments([]);
        setLoadingCmrDocuments(false);
        await loadCmrDocuments();
      } else {
        throw new Error('Nie udało się przeliczyć ilości wysłanych');
      }
    } catch (error) {
      console.error('❌ Błąd podczas przeliczania ilości wysłanych:', error);
      showError(`Nie udało się przeliczyć ilości wysłanych: ${error.message}`);
    } finally {
      setIsRefreshingCmr(false);
    }
  };

  // Funkcje obsługi zmiany statusu
  const handleStatusClick = () => {
    setNewStatus(order.status || 'Nowe');
    setStatusDialogOpen(true);
  };

  const handleStatusUpdate = async () => {
    try {
      await updateOrderStatus(order.id, newStatus, currentUser.uid);
      
      // Odśwież dane zamówienia
      invalidateCache(order.id);
      await refreshOrderData();
      
      showSuccess(t('orderDetails.notifications.statusUpdated'));
      setStatusDialogOpen(false);
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu zamówienia:', error);
      showError(t('orderDetails.notifications.statusUpdateError'));
    }
  };

  // Funkcja zwracająca nazwę użytkownika zamiast ID
  const getUserName = (userId) => {
    return userNames[userId] || userId || 'System';
  };

  // Funkcja pomocnicza do formatowania wartości CSV
  const formatCSVValue = (value) => {
    if (value === null || value === undefined) {
      return '""';
    }
    
    const stringValue = String(value);
    
    // Jeśli wartość zawiera przecinki, cudzysłowy lub znaki nowej linii, lub spacje, owijamy w cudzysłowy
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r') || stringValue.includes(' ')) {
      // Eskapeuj cudzysłowy przez podwojenie
      const escapedValue = stringValue.replace(/"/g, '""');
      return `"${escapedValue}"`;
    }
    
    // Dla bezpieczeństwa owijamy wszystkie wartości w cudzysłowy
    return `"${stringValue}"`;
  };

  // Funkcja eksportu pozycji zamówienia do CSV
  const handleExportItemsToCSV = () => {
    try {
      if (!order || !order.items || order.items.length === 0) {
        showError('Brak pozycji do eksportu');
        return;
      }

      // Przygotuj nagłówki CSV
      const csvHeaders = [
        'Lp.',
        'Nazwa produktu',
        'Ilość zamówiona',
        'Jednostka',
        'Ilość wysłana',
        'Cena jednostkowa',
        'Wartość pozycji',
        'Zafakturowana kwota',
        'Zaliczka',
        'ETM',
        'Koszt produkcji',
        'Zysk',
        'Ostatni CMR',
        'Status produkcji',
        'Lista cen',
        'Numer zadania produkcyjnego'
      ];

      // Przygotuj dane pozycji
      const csvData = order.items.map((item, index) => {
        const itemTotalValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
        const shippedQuantity = item.shippedQuantity || 0;
        const lastCmr = item.lastCmrNumber || (item.cmrHistory && item.cmrHistory.length > 0 ? 
          item.cmrHistory[item.cmrHistory.length - 1].cmrNumber : '-');
        
        // Pobierz zafakturowaną kwotę
        const itemId = item.id || `${orderId}_item_${index}`;
        const invoicedData = invoicedAmounts[itemId];
        const invoicedAmount = invoicedData && invoicedData.totalInvoiced > 0 ? invoicedData.totalInvoiced : 0;
        
        // Pobierz kwotę zaliczki (proformy)
        const proformaData = proformaAmounts[itemId];
        const proformaAmount = proformaData && proformaData.totalProforma > 0 ? proformaData.totalProforma : 0;
        
        // Pobierz datę ETM (Estimated Time to Manufacture)
        const completionInfo = getTaskCompletionDate(item);
        let etmDate = '-';
        if (completionInfo && completionInfo.date) {
          try {
            let dateObj;
            if (completionInfo.date?.toDate && typeof completionInfo.date.toDate === 'function') {
              dateObj = completionInfo.date.toDate();
            } else if (typeof completionInfo.date === 'string') {
              dateObj = new Date(completionInfo.date);
            } else if (completionInfo.date instanceof Date) {
              dateObj = completionInfo.date;
            }
            
            if (dateObj && !isNaN(dateObj.getTime())) {
              etmDate = formatDate(dateObj, false);
            }
          } catch (error) {
            console.error('Błąd formatowania daty ETM w CSV:', error);
          }
        }
        
        // Oblicz koszt produkcji
        const productionCost = parseFloat(item.productionCost) || 0;
        
        // Oblicz zysk (wartość pozycji - koszt produkcji)
        const profit = itemTotalValue - productionCost;
        
        return [
          formatCSVValue(index + 1),
          formatCSVValue(item.name || ''),
          formatCSVValue(`${item.quantity || 0}`),
          formatCSVValue(item.unit || ''),
          formatCSVValue(`${shippedQuantity}`),
          formatCSVValue(formatCurrency(item.price).replace(/\s/g, '')),
          formatCSVValue(formatCurrency(itemTotalValue).replace(/\s/g, '')),
          formatCSVValue(formatCurrency(invoicedAmount).replace(/\s/g, '')),
          formatCSVValue(formatCurrency(proformaAmount).replace(/\s/g, '')),
          formatCSVValue(etmDate),
          formatCSVValue(formatCurrency(productionCost).replace(/\s/g, '')),
          formatCSVValue(formatCurrency(profit).replace(/\s/g, '')),
          formatCSVValue(lastCmr),
          formatCSVValue(item.productionStatus || '-'),
          formatCSVValue(item.priceList || '-'),
          formatCSVValue(item.productionTaskNumber || '-')
        ];
      });

      // Utwórz zawartość CSV
      const csvContent = [
        csvHeaders.map(header => formatCSVValue(header)).join(','),
        ...csvData.map(row => row.join(','))
      ].join('\n');

      // Dodaj BOM dla poprawnego kodowania w Excel
      const csvBlob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(csvBlob);
      
      // Utwórz link i pobierz plik
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `pozycje_zamowienia_${order.orderNumber || order.id}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Zwolnij pamięć
      URL.revokeObjectURL(url);
      
      showSuccess('Pozycje zamówienia zostały wyeksportowane do CSV');
      
    } catch (error) {
      console.error('Błąd podczas eksportu pozycji do CSV:', error);
      showError('Błąd podczas eksportu pozycji do CSV');
    }
  };

  // Dodaję komponent wyświetlający historię zmian statusu przed sekcją z listą produktów
  const renderStatusHistory = () => {
    if (!order.statusHistory || order.statusHistory.length === 0) {
      return null;
    }
    
    return (
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
          <ScheduleIcon sx={mr1} />
          {t('orderDetails.sections.statusHistory')}
        </Typography>
        <Divider sx={mb2} />
        
        <Table size="small" sx={{ '& .MuiTableCell-root': { py: 1.5 } }}>
          <TableHead>
            <TableRow sx={{ backgroundColor: 'action.hover' }}>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('orderDetails.statusHistory.dateTime')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('orderDetails.statusHistory.previousStatus')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('orderDetails.statusHistory.newStatus')}</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>{t('orderDetails.statusHistory.whoChanged')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {[...order.statusHistory].reverse().map((change, index) => (
              <TableRow key={index} sx={{ '&:hover': { backgroundColor: 'action.hover' } }}>
                <TableCell sx={{ fontSize: '0.875rem' }}>
                  {change.changedAt ? new Date(change.changedAt).toLocaleString('pl') : t('orderDetails.statusHistory.noDate')}
                </TableCell>
                <TableCell>
                  <Chip 
                    label={change.oldStatus} 
                    size="small" 
                    variant="outlined"
                    color={getStatusChipColor(change.oldStatus)}
                  />
                </TableCell>
                <TableCell>
                  <Chip 
                    label={change.newStatus} 
                    size="small"
                    color={getStatusChipColor(change.newStatus)}
                  />
                </TableCell>
                <TableCell sx={{ fontSize: '0.875rem' }}>{getUserName(change.changedBy)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    );
  };

  // Funkcja do określania statusu produkcji dla danego elementu
  // Funkcja do pobierania faktur powiązanych z zamówieniem
  const fetchInvoices = async () => {
    try {
      setLoadingInvoices(true);
      const orderInvoices = await getInvoicesByOrderId(orderId);
      const { invoices: verifiedInvoices, removedCount: removedInvoicesCount } = await verifyInvoices(orderInvoices);
      setInvoices(verifiedInvoices);
      
      // Pobierz zafakturowane kwoty dla pozycji zamówienia
      const invoicedData = await getInvoicedAmountsByOrderItems(orderId);
      setInvoicedAmounts(invoicedData);
      
      if (removedInvoicesCount > 0) {
        showInfo(`Usunięto ${removedInvoicesCount} nieistniejących faktur z listy`);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania faktur:', error);
      showError(t('orderDetails.notifications.invoicesLoadError'));
    } finally {
      setLoadingInvoices(false);
    }
  };

  // Funkcja do migracji faktur - dodaje orderItemId do pozycji
  const handleMigrateInvoices = async () => {
    try {
      setLoadingInvoices(true);
      showInfo('Rozpoczynam migrację faktur...');
      
      await migrateInvoiceItemsOrderIds(orderId);
      
      // Odśwież faktury po migracji
      await fetchInvoices();
      
      showSuccess('Migracja faktur zakończona pomyślnie!');
    } catch (error) {
      console.error('Błąd podczas migracji faktur:', error);
      showError('Błąd podczas migracji faktur: ' + error.message);
    } finally {
      setLoadingInvoices(false);
    }
  };

  // Funkcja renderująca status płatności faktury
  const renderPaymentStatus = (paymentStatus) => {
    const statusConfig = {
      'unpaid': { color: 'warning', label: t('orderDetails.paymentStatusLabels.unpaid') },
      'partially_paid': { color: 'primary', label: t('orderDetails.paymentStatusLabels.partiallyPaid') },
      'paid': { color: 'success', label: t('orderDetails.paymentStatusLabels.paid') }
    };
    
    const status = paymentStatus || 'unpaid';
    const config = statusConfig[status] || { color: 'default', label: status };
    
    return (
      <Chip 
        label={config.label} 
        color={config.color}
        size="small"
      />
    );
  };

  // Funkcja do pobierania dokumentów CMR powiązanych z zamówieniem
  const fetchCmrDocuments = async () => {
    try {
      setLoadingCmrDocuments(true);
      const orderCmrDocuments = await getCmrDocumentsByOrderId(orderId);
      const { cmrDocuments: verifiedCmrDocuments, removedCount: removedCmrCount } = await verifyCmrDocuments(orderCmrDocuments);
      setCmrDocuments(verifiedCmrDocuments);
      if (removedCmrCount > 0) {
        showInfo(`Usunięto ${removedCmrCount} nieistniejących dokumentów CMR z listy`);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania dokumentów CMR:', error);
      showError(t('orderDetails.notifications.cmrDocumentsLoadError'));
    } finally {
      setLoadingCmrDocuments(false);
    }
  };

  // Funkcja renderująca status dokumentu CMR
  const renderCmrStatus = (status) => {
    const statusConfig = {
      [CMR_STATUSES.DRAFT]: { color: '#757575', label: t('orderDetails.cmrStatuses.draft') }, // szary
      [CMR_STATUSES.ISSUED]: { color: '#2196f3', label: t('orderDetails.cmrStatuses.issued') }, // niebieski
      [CMR_STATUSES.IN_TRANSIT]: { color: '#ff9800', label: t('orderDetails.cmrStatuses.inTransit') }, // pomarańczowy
      [CMR_STATUSES.DELIVERED]: { color: '#4caf50', label: t('orderDetails.cmrStatuses.delivered') }, // zielony
      [CMR_STATUSES.COMPLETED]: { color: '#9c27b0', label: t('orderDetails.cmrStatuses.completed') }, // fioletowy
      [CMR_STATUSES.CANCELED]: { color: '#f44336', label: t('orderDetails.cmrStatuses.canceled') } // czerwony
    };
    
    const config = statusConfig[status] || { color: '#757575', label: status || t('orderDetails.cmrStatuses.unknown') };
    
    return (
      <Chip 
        label={config.label}
        size="small"
        variant="outlined"
        sx={{
          borderColor: config.color,
          color: config.color,
          fontWeight: 'medium'
        }}
      />
    );
  };

  // Funkcja weryfikująca czy faktury istnieją i filtrująca nieistniejące
  const verifyInvoices = async (fetchedInvoices) => {
    if (!fetchedInvoices || fetchedInvoices.length === 0) {
      return { invoices: [], removedCount: 0 };
    }

    try {
      const { getInvoiceById } = await import('../../services/finance');
      const verifiedInvoices = [];
      let removedCount = 0;

      for (const invoice of fetchedInvoices) {
        try {
          // Próba pobrania faktury z bazy
          await getInvoiceById(invoice.id);
          // Jeśli dotarliśmy tutaj, faktura istnieje
          verifiedInvoices.push(invoice);
        } catch (error) {
          console.error(`Faktura ${invoice.id} (${invoice.number || 'bez numeru'}) nie istnieje i zostanie pominięta:`, error);
          removedCount++;
        }
      }

      return { invoices: verifiedInvoices, removedCount };
    } catch (error) {
      console.error('Błąd podczas weryfikacji faktur:', error);
      return { invoices: fetchedInvoices, removedCount: 0 };
    }
  };

  // Funkcja weryfikująca czy dokumenty CMR istnieją i filtrująca nieistniejące
  const verifyCmrDocuments = async (fetchedCmrDocuments) => {
    if (!fetchedCmrDocuments || fetchedCmrDocuments.length === 0) {
      return { cmrDocuments: [], removedCount: 0 };
    }

    try {
      const { getCmrDocumentById } = await import('../../services/logistics');
      const verifiedCmrDocuments = [];
      let removedCount = 0;

      for (const cmr of fetchedCmrDocuments) {
        try {
          // Próba pobrania dokumentu CMR z bazy
          await getCmrDocumentById(cmr.id);
          // Jeśli dotarliśmy tutaj, dokument CMR istnieje
          verifiedCmrDocuments.push(cmr);
        } catch (error) {
          console.error(`Dokument CMR ${cmr.id} (${cmr.cmrNumber || 'bez numeru'}) nie istnieje i zostanie pominięty:`, error);
          removedCount++;
        }
      }

      return { cmrDocuments: verifiedCmrDocuments, removedCount };
    } catch (error) {
      console.error('Błąd podczas weryfikacji dokumentów CMR:', error);
      return { cmrDocuments: fetchedCmrDocuments, removedCount: 0 };
    }
  };

  // Funkcja obliczająca całkowitą wartość zamówienia
  const calculateOrderTotalValue = () => {
    // Oblicz wartość produktów
    const productsValue = order.items?.reduce((sum, item) => sum + calculateItemTotalValue(item), 0) || 0;
    
    // Zastosuj rabat globalny
    const globalDiscount = parseFloat(order.globalDiscount) || 0;
    const discountMultiplier = (100 - globalDiscount) / 100;
    
    return productsValue * discountMultiplier;
  };

  // Funkcja obliczająca kwotę zafakturowaną (wartość wystawionych faktur, nie proform)
  const calculateInvoicedAmount = () => {
    if (!invoices || invoices.length === 0) {
      return 0;
    }

    let totalInvoiced = 0;

    invoices.forEach(invoice => {
      // Pomijamy proformy - one są liczone osobno jako zaliczki
      if (invoice.isProforma) {
        return;
      }

      // Sumujemy wartość faktury (total), nie kwotę zapłaconą (totalPaid)
      const invoiceTotal = parseFloat(invoice.total || 0);
      totalInvoiced += invoiceTotal;
    });

    return totalInvoiced;
  };

  // Funkcja obliczająca sumę zaliczek (proform)
  const calculateProformaTotal = () => {
    if (!invoices || invoices.length === 0) {
      return 0;
    }

    let totalProforma = 0;

    invoices.forEach(invoice => {
      // Wliczamy tylko proformy
      if (!invoice.isProforma) {
        return;
      }

      // Suma zapłacona w proformie
      const totalPaid = parseFloat(invoice.totalPaid || 0);
      totalProforma += totalPaid;
    });

    return totalProforma;
  };

  // Funkcja obliczająca łączną kwotę opłaconą (proformy + rzeczywiste płatności z faktur, BEZ podwójnego liczenia)
  // Pomija faktury ujemne (korekty) - to nie są płatności OD klienta, to zwroty DO klienta
  const calculateTotalPaid = () => {
    if (!invoices || invoices.length === 0) {
      return 0;
    }

    let totalPaid = 0;

    invoices.forEach(invoice => {
      if (invoice.isProforma) {
        // Wliczamy pełną kwotę zapłaconą w proformie
        const proformaPaid = parseFloat(invoice.totalPaid || 0);
        totalPaid += proformaPaid;
      } else {
        // Pomijamy faktury ujemne (korekty) - to nie są płatności od klienta
        const invoiceTotal = parseFloat(invoice.total || 0);
        if (invoiceTotal < 0) {
          return; // Pomiń korekty w obliczeniach "Opłacone"
        }
        
        // Z faktur dodatnich bierzemy rzeczywiste płatności (bez proformAllocation, żeby nie liczyć podwójnie)
        const invoiceRealPayment = parseFloat(invoice.totalPaid || 0);
        totalPaid += invoiceRealPayment;
      }
    });

    return totalPaid;
  };

  // Funkcja pomocnicza do pobierania daty ETM (Estimated Time to Manufacture)
  const getTaskCompletionDate = (item) => {
    // Znajdź ID zadania dla pozycji
    let taskId = null;
    
    // 1. Po productionTaskId (priorytet)
    if (item.productionTaskId) {
      taskId = item.productionTaskId;
    }
    // 2. Po orderItemId w uproszczonych kopiach (fallback)
    else if (order?.productionTasks) {
      const taskFromOrder = order.productionTasks.find(t => t.orderItemId === item.id);
      if (taskFromOrder) {
        taskId = taskFromOrder.id;
      }
    }
    
    if (!taskId) {
      return null;
    }
    
    // Pobierz pełne dane zadania z mapy
    const task = fullProductionTasks[taskId];
    
    if (!task) {
      return null;
    }
    
    // Jeśli zadanie jest zakończone, zwróć rzeczywistą datę
    if (task.status === 'Zakończone') {
      // Priorytet 1: Ostatnia sesja produkcyjna (najbardziej dokładna)
      if (task.productionSessions && task.productionSessions.length > 0) {
        const lastSession = task.productionSessions[task.productionSessions.length - 1];
        if (lastSession.endDate) {
          return {
            date: lastSession.endDate,
            isActual: true,
            status: task.status,
            source: 'productionSession'
          };
        }
      }
      
      // Priorytet 2: completionDate
      if (task.completionDate) {
        return {
          date: task.completionDate,
          isActual: true,
          status: task.status,
          source: 'completionDate'
        };
      }
    }
    
    // W pozostałych przypadkach zwróć planowaną datę zakończenia
    if (task.endDate) {
      return {
        date: task.endDate,
        isActual: false,
        status: task.status,
        source: 'plannedEndDate'
      };
    }
    
    return null;
  };

  const getProductionStatus = (item, productionTasks) => {
    // Sprawdź, czy element ma bezpośrednio przypisane zadanie produkcyjne
    if (item.productionTaskId && item.productionStatus) {
      const statusColor = getProductionStatusColor(item.productionStatus);
      
      // Handler dla lewego kliknięcia - nawigacja przez React Router
      const handleClick = (e) => {
        e.preventDefault();
        navigate(`/production/tasks/${item.productionTaskId}`);
      };
      
      // Stwórz chip jako link, który będzie działał ze standardowym menu kontekstowym
      return (
        <Tooltip title={`Przejdź do zadania produkcyjnego ${item.productionTaskNumber || item.productionTaskId}`}>
          <Chip
            label={item.productionStatus}
            size="small"
            color={statusColor}
            clickable
            component="a"
            href={`/production/tasks/${item.productionTaskId}`}
            onClick={handleClick}
            sx={{ 
              cursor: 'pointer',
              textDecoration: 'none'
            }}
          />
        </Tooltip>
      );
    }
    
    // Tradycyjne sprawdzenie, jeśli nie ma bezpośredniego przypisania
    if (!productionTasks || !Array.isArray(productionTasks) || productionTasks.length === 0) {
      return (
        <Tooltip title="Kliknij, aby utworzyć zadanie produkcyjne">
          <Chip 
            label={t('orderDetails.productionStatus.noTasks')} 
            size="small" 
            color="default"
            clickable
            component={RouterLink}
            to="/production/create-from-order"
            state={{ orderId: orderId }}
            sx={{ cursor: 'pointer' }}
          />
        </Tooltip>
      );
    }

    // Znajdź zadania produkcyjne dla tego elementu
    const tasksForItem = productionTasks.filter(task => 
      task.productId === item.id || 
      task.productName?.toLowerCase() === item.name?.toLowerCase()
    );

    if (tasksForItem.length === 0) {
      return (
        <Tooltip title="Kliknij, aby utworzyć zadanie produkcyjne">
          <Chip 
            label={t('orderDetails.productionStatus.noTasks')} 
            size="small" 
            color="default"
            clickable
            component={RouterLink}
            to="/production/create-from-order"
            state={{ orderId: orderId }}
            sx={{ cursor: 'pointer' }}
          />
        </Tooltip>
      );
    }

    // Określ ogólny status na podstawie wszystkich zadań
    const allCompleted = tasksForItem.every(task => task.status === 'Zakończone');
    const allCancelled = tasksForItem.every(task => task.status === 'Anulowane');
    const anyInProgress = tasksForItem.some(task => task.status === 'W trakcie' || task.status === 'Wstrzymane');
    const anyPlanned = tasksForItem.some(task => task.status === 'Zaplanowane');

    // Jeśli jest tylko jedno zadanie, pokaż link do tego zadania
    if (tasksForItem.length === 1) {
      const task = tasksForItem[0];
      let statusColor = 'default';
      
      if (task.status === 'Zakończone') statusColor = 'success';
      else if (task.status === 'Anulowane') statusColor = 'error';
      else if (task.status === 'W trakcie' || task.status === 'Wstrzymane') statusColor = 'warning';
      else if (task.status === 'Zaplanowane') statusColor = 'primary';
      
      return (
        <Tooltip title={`Przejdź do zadania produkcyjnego ${task.moNumber || task.id}`}>
          <Chip
            label={task.status}
            size="small"
            color={statusColor}
            clickable
            component={RouterLink}
            to={`/production/tasks/${task.id}`}
            sx={{ 
              cursor: 'pointer',
              textDecoration: 'none'
            }}
          />
        </Tooltip>
      );
    }

    // W przypadku wielu zadań, pokaż ogólny status
    if (allCompleted) {
      return <Chip label={t('orderDetails.productionStatus.completed', { count: tasksForItem.length })} size="small" color="success" />;
    } else if (allCancelled) {
      return <Chip label={t('orderDetails.productionStatus.cancelled', { count: tasksForItem.length })} size="small" color="error" />;
    } else if (anyInProgress) {
      return <Chip label={t('orderDetails.productionStatus.inProgress', { count: tasksForItem.length })} size="small" color="warning" />;
    } else if (anyPlanned) {
      return <Chip label={t('orderDetails.productionStatus.planned', { count: tasksForItem.length })} size="small" color="primary" />;
    } else {
      return <Chip label={t('orderDetails.productionStatus.mixed', { count: tasksForItem.length })} size="small" color="default" />;
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  // Jeśli jesteśmy na ścieżce zamówienia zakupowego, nie renderujemy nic
  if (location.pathname.includes('/purchase-orders/')) {
    return null;
  }

  if (!order) {
    return (
      <Box sx={{ textAlign: 'center', mt: 4 }}>
        <Typography variant="h6" color="error">
          {t('orderDetails.notifications.orderNotFound')}
        </Typography>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={handleBackClick}
          sx={{ mt: 2 }}
        >
          {t('orderDetails.actions.back')}
        </Button>
      </Box>
    );
  }

  return (
    <div>
      <Box sx={{ pb: 4 }}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={handleBackClick}
          >
            {t('orderDetails.actions.back')}
          </Button>
          <Typography variant="h5">
            {isEditingOrderNumber ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <TextField
                  size="small"
                  value={newOrderNumber}
                  onChange={handleOrderNumberChange}
                  error={!!orderNumberError}
                  helperText={orderNumberError}
                  placeholder="CO00090"
                  autoFocus
                  sx={{ minWidth: 200 }}
                />
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleConfirmOrderNumberChange}
                  disabled={!!orderNumberError || !newOrderNumber}
                >
                  Zapisz
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleCancelEditOrderNumber}
                >
                  Anuluj
                </Button>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>
                  {t('orderDetails.orderNumber')} {order.orderNumber || order.id.substring(0, 8).toUpperCase()}
                </span>
                <Tooltip title="Zmień numer CO">
                  <IconButton
                    size="small"
                    onClick={handleEditOrderNumberClick}
                    sx={{ ml: 1 }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
            )}
          </Typography>
          <Box>
            <Button 
              startIcon={<EditIcon />} 
              variant="outlined"
              onClick={handleEditClick}
            >
              {t('orderDetails.actions.edit')}
            </Button>
          </Box>
        </Box>

        {/* Alert o możliwych rozbieżnościach w ilościach CMR */}
        {order && order.items && (() => {
          const itemsWithDiscrepancies = order.items.filter(item => {
            if (!item.cmrHistory || item.cmrHistory.length === 0) return false;
            const cmrTotal = item.cmrHistory.reduce((sum, entry) => sum + (parseFloat(entry.quantity) || 0), 0);
            return Math.abs(cmrTotal - (item.shippedQuantity || 0)) > 0.01;
          });
          
          if (itemsWithDiscrepancies.length === 0) return null;
          
          return (
            <Alert 
              severity="warning" 
              sx={mb2}
              action={
                <Button 
                  color="inherit" 
                  size="small" 
                  onClick={handleRefreshShippedQuantities}
                  disabled={isRefreshingCmr}
                  startIcon={isRefreshingCmr ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                >
                  {isRefreshingCmr ? 'Odświeżam...' : 'Napraw teraz'}
                </Button>
              }
            >
              <AlertTitle>⚠️ Wykryto rozbieżności w ilościach wysłanych</AlertTitle>
              Znaleziono {itemsWithDiscrepancies.length} pozycję/pozycji z niezgodnymi ilościami między historią CMR a wysłaną ilością. 
              Kliknij "Napraw teraz", aby przeliczyć ilości na podstawie wszystkich dokumentów CMR.
            </Alert>
          );
        })()}

        {/* Status i informacje podstawowe */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={mr2}>{t('orderDetails.sections.status')}:</Typography>
                <Tooltip title={t('orderDetails.tooltips.clickToChangeStatus')}>
                  <Chip 
                    label={order.status} 
                    color={getStatusChipColor(order.status)}
                    size="medium"
                    clickable
                    onClick={handleStatusClick}
                    sx={{ cursor: 'pointer' }}
                  />
                </Tooltip>
              </Box>
              <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <EventNoteIcon sx={mr1} fontSize="small" />
                {t('orderDetails.orderDate')}: {formatTimestamp(order.orderDate, true)}
              </Typography>
              {order.expectedDeliveryDate && (
                <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <ScheduleIcon sx={mr1} fontSize="small" />
                  {t('orderDetails.expectedDelivery')}: {formatTimestamp(order.expectedDeliveryDate, true)}
                </Typography>
              )}
              {order.deliveryDate && (
                <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <LocalShippingIcon sx={mr1} fontSize="small" />
                  {t('orderDetails.completed')}: {formatTimestamp(order.deliveryDate, true)}
                </Typography>
              )}
              
              <Divider sx={{ my: 2 }} />
              
              {/* Dane klienta */}
              <Box sx={{ mt: 2 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                  <Typography variant="subtitle1" sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                    <PersonIcon sx={mr1} fontSize="small" />
                    {t('orderDetails.sections.customerData')}
                  </Typography>
                  <Tooltip title="Wyślij email do klienta">
                    <IconButton 
                      size="small" 
                      color="primary"
                      onClick={handleSendEmail}
                      disabled={!order.customer?.email}
                    >
                      <EmailIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
                <Typography variant="subtitle2" color="primary.main" sx={{ mb: 1, fontWeight: 'bold' }}>
                  {order.customer?.name || t('orderDetails.customerInfo.noCustomerName')}
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <EmailIcon sx={{ mr: 1, color: 'text.secondary' }} fontSize="small" />
                    <Typography variant="body2">{order.customer?.email || '-'}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center' }}>
                    <PhoneIcon sx={{ mr: 1, color: 'text.secondary' }} fontSize="small" />
                    <Typography variant="body2">{order.customer?.phone || '-'}</Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'start' }}>
                    <LocationOnIcon sx={{ mr: 1, color: 'text.secondary' }} fontSize="small" />
                    <Typography variant="body2">
                      {order.customer?.shippingAddress || '-'}
                    </Typography>
                  </Box>
                </Box>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                {/* Wartość zamówienia */}
                <Box sx={{ 
                  p: 2, 
                  backgroundColor: 'primary.main', 
                  borderRadius: 2, 
                  mb: 2,
                  boxShadow: 2
                }}>
                  <Typography variant="subtitle1" sx={{ color: 'primary.contrastText', opacity: 0.9 }}>
                    {t('orderDetails.totalValue')}
                  </Typography>
                  <Typography variant="h3" sx={{ color: 'primary.contrastText', fontWeight: 'bold', mt: 0.5 }}>
                    {formatCurrency(calculateOrderTotalValue())}
                  </Typography>
                </Box>

                {/* Karty finansowe w gridzie */}
                <Grid container spacing={1.5}>
                  {/* Opłacone */}
                  <Grid item xs={12}>
                    <Paper 
                      elevation={3}
                      sx={{ 
                        p: 2, 
                        backgroundColor: 'success.main',
                        borderRadius: 2,
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                    >
                      <Box sx={{ position: 'relative', zIndex: 1 }}>
                        <Typography variant="subtitle2" sx={{ color: 'success.contrastText', opacity: 0.9, fontWeight: 500 }}>
                          💰 Opłacone
                        </Typography>
                        <Typography variant="h5" sx={{ color: 'success.contrastText', fontWeight: 'bold', my: 0.5 }}>
                          {formatCurrency(calculateTotalPaid())}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'success.contrastText', opacity: 0.85 }}>
                          {(() => {
                            const invoicedAmount = calculateInvoicedAmount();
                            const totalPaid = calculateTotalPaid();
                            // Procent opłacenia względem zafakturowanej kwoty
                            const percentage = invoicedAmount > 0 ? ((totalPaid / invoicedAmount) * 100).toFixed(1) : 0;
                            // Do zapłaty = FK (zafakturowano) - Opłacone
                            // Uwzględnia korekty (ujemne faktury) - jeśli wynik ujemny = nadpłata/do zwrotu
                            const remaining = invoicedAmount - totalPaid;
                            return `${percentage}% • Do zapłaty: ${formatCurrency(remaining)}`;
                          })()}
                        </Typography>
                      </Box>
                    </Paper>
                  </Grid>

                  {/* FK i Zaliczki obok siebie */}
                  <Grid item xs={6}>
                    <Paper 
                      elevation={2}
                      sx={{ 
                        p: 1.5, 
                        backgroundColor: 'background.paper',
                        borderRadius: 2,
                        borderLeft: 4,
                        borderColor: 'success.light',
                        height: '100%'
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                        📄 FK
                      </Typography>
                      <Typography variant="h6" color="success.main" sx={{ fontWeight: 'bold', my: 0.5 }}>
                        {formatCurrency(calculateInvoicedAmount())}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {(() => {
                          const totalValue = calculateOrderTotalValue();
                          const invoicedAmount = calculateInvoicedAmount();
                          const percentage = totalValue > 0 ? ((invoicedAmount / totalValue) * 100).toFixed(1) : 0;
                          return `${percentage}%`;
                        })()}
                      </Typography>
                    </Paper>
                  </Grid>

                  <Grid item xs={6}>
                    <Paper 
                      elevation={2}
                      sx={{ 
                        p: 1.5, 
                        backgroundColor: 'background.paper',
                        borderRadius: 2,
                        borderLeft: 4,
                        borderColor: 'info.main',
                        height: '100%'
                      }}
                    >
                      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500 }}>
                        💳 Zaliczki
                      </Typography>
                      <Typography variant="h6" color="info.main" sx={{ fontWeight: 'bold', my: 0.5 }}>
                        {formatCurrency(calculateProformaTotal())}
                      </Typography>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                        <Typography variant="caption" color="text.secondary">
                          {(() => {
                            const totalValue = calculateOrderTotalValue();
                            const proformaTotal = calculateProformaTotal();
                            const percentage = totalValue > 0 ? ((proformaTotal / totalValue) * 100).toFixed(1) : 0;
                            return `${percentage}%`;
                          })()}
                        </Typography>
                        {Object.values(availableProformaAmounts).reduce((sum, val) => sum + val, 0) > 0 && (
                          <Tooltip title="Kwota z proform dostępna do rozliczenia na fakturze końcowej">
                            <Chip 
                              size="small" 
                              label={`Dostępne: ${formatCurrency(Object.values(availableProformaAmounts).reduce((sum, val) => sum + val, 0))}`}
                              color="success"
                              variant="outlined"
                              sx={{ fontSize: '0.65rem', height: 20 }}
                            />
                          </Tooltip>
                        )}
                      </Box>
                    </Paper>
                  </Grid>
                </Grid>

                {/* Przycisk odświeżania */}
                <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                  <Tooltip title={t('orderDetails.refreshOrder')}>
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={refreshOrderData}
                    >
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            </Grid>
          </Grid>
        </Paper>

        {/* Wyświetlenie historii zmian statusu */}
        {renderStatusHistory()}

        {/* Lista produktów */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">{t('orderDetails.sections.products')}</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              <Tooltip title={t('orderDetails.tooltips.recalculateShippedQuantities')}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={handleRefreshShippedQuantities}
                  disabled={isRefreshingCmr || !order || !order.id}
                  startIcon={isRefreshingCmr ? <CircularProgress size={16} /> : <RefreshIcon />}
                  color="primary"
                >
                  {isRefreshingCmr ? t('orderDetails.actions.recalculating') : t('orderDetails.actions.recalculateShipped')}
                </Button>
              </Tooltip>
              <Button
                variant="outlined"
                size="small"
                onClick={handleExportItemsToCSV}
                disabled={!order || !order.items || order.items.length === 0}
              >
                Eksportuj do CSV
              </Button>
            </Box>
          </Box>
          <Divider sx={mb2} />
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                <TableCell sx={{ color: 'inherit' }}>{t('orderDetails.table.product')}</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                    {t('orderDetails.table.quantity')}
                    <Tooltip title="Ilość może być automatycznie skorygowana na podstawie rzeczywistej produkcji">
                      <InfoIcon sx={{ fontSize: '1rem', opacity: 0.7 }} />
                    </Tooltip>
                  </Box>
                </TableCell>
                <TableCell sx={{ color: 'inherit', minWidth: 180 }} align="right">{t('orderDetails.table.shipped')}</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">{t('orderDetails.table.price')}</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">{t('orderDetails.table.value')}</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">{t('orderDetails.table.invoicedAmount')}</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">{t('orderDetails.table.proformaAmount')}</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="center">{t('orderDetails.table.etm')}</TableCell>
                <TableCell sx={{ color: 'inherit' }}>{t('orderDetails.table.productionStatus')}</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">
                  {t('orderDetails.table.productionCost')}
                  <Tooltip title={t('orderDetails.actions.refreshProductionCosts')}>
                    <IconButton 
                      size="small" 
                      color="primary"
                      onClick={refreshProductionCosts}
                      sx={{ ml: 1, color: 'inherit' }}
                    >
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">{t('orderDetails.table.profit')}</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">{t('orderDetails.table.totalItemValue')}</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">{t('orderDetails.table.totalCostPerUnit')}</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">{t('orderDetails.table.fullProductionCostPerUnit')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {order.items && order.items.map((item, index) => (
                <TableRow key={index} sx={{ '&:nth-of-type(odd)': { bgcolor: 'action.hover' } }}>
                  <TableCell>
                    <Box>
                      <Typography variant="body2">{item.name}</Typography>
                      {item.description && (
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          {item.description}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Box>
                      {item.quantityUpdatedFromProduction && item.previousQuantity ? (
                        <Tooltip 
                          title={
                            <Box>
                              <Typography variant="caption" sx={{ display: 'block', fontWeight: 'bold', mb: 0.5 }}>
                                Autokorekta z produkcji
                              </Typography>
                              <Typography variant="caption" sx={{ display: 'block' }}>
                                Ilość oryginalna: {item.previousQuantity} {item.unit}
                              </Typography>
                              <Typography variant="caption" sx={{ display: 'block' }}>
                                Ilość aktualna: {item.quantity} {item.unit}
                              </Typography>
                              <Typography 
                                variant="caption" 
                                sx={{ 
                                  display: 'block',
                                  color: (item.quantity - item.previousQuantity) >= 0 ? 'success.light' : 'error.light'
                                }}
                              >
                                Zmiana: {(item.quantity - item.previousQuantity) > 0 ? '+' : ''}{(item.quantity - item.previousQuantity).toFixed(3)} {item.unit}
                              </Typography>
                              {item.quantityUpdatedAt && (
                                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, opacity: 0.8 }}>
                                  {formatDate(item.quantityUpdatedAt)}
                                </Typography>
                              )}
                              {item.quantityUpdateReason && (
                                <Typography variant="caption" sx={{ display: 'block', fontStyle: 'italic', mt: 0.5 }}>
                                  Powód: {item.quantityUpdateReason}
                                </Typography>
                              )}
                            </Box>
                          }
                          arrow
                          placement="left"
                        >
                          <Box sx={{ cursor: 'help' }}>
                            <Typography 
                              variant="body2" 
                              sx={{ 
                                fontWeight: 'bold',
                                color: 'primary.main'
                              }}
                            >
                              {item.quantity} {item.unit}
                            </Typography>
                            <Typography 
                              variant="caption" 
                              sx={{ 
                                textDecoration: 'line-through',
                                color: 'text.secondary',
                                display: 'block',
                                fontSize: '0.7rem'
                              }}
                            >
                              {item.previousQuantity} {item.unit}
                            </Typography>
                          </Box>
                        </Tooltip>
                      ) : (
                        <Typography variant="body2">
                          {item.quantity} {item.unit}
                        </Typography>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    {item.shippedQuantity ? (
                      <Box>
                        <Typography variant="body2" color="success.main">
                          {item.shippedQuantity} {item.unit}
                        </Typography>
                        {item.cmrHistory && item.cmrHistory.length > 0 ? (
                          <Box sx={{ mt: 0.5 }}>
                            {item.cmrHistory.map((cmrEntry, cmrIndex) => (
                              <Typography 
                                key={cmrIndex} 
                                variant="caption" 
                                color="text.secondary"
                                sx={{ display: 'block', lineHeight: 1.1, fontSize: '0.6rem' }}
                              >
                                {cmrEntry.cmrNumber} ({cmrEntry.quantity})
                              </Typography>
                            ))}
                          </Box>
                        ) : item.lastCmrNumber ? (
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                            {item.lastCmrNumber}
                          </Typography>
                        ) : null}
                      </Box>
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        0 {item.unit}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{formatCurrency(item.price)}</TableCell>
                  <TableCell align="right">{formatCurrency(item.quantity * item.price)}</TableCell>
                  <TableCell align="right">
                    {(() => {
                      const itemId = item.id || `${orderId}_item_${index}`;
                      const invoicedData = invoicedAmounts[itemId];
                      
                      if (invoicedData && invoicedData.totalInvoiced > 0) {
                        return (
                          <Tooltip title={t('orderDetails.tooltips.clickToSeeInvoiceDetails', { count: invoicedData.invoices.length })}>
                            <Typography 
                              sx={{ 
                                fontWeight: 'medium',
                                color: 'success.main',
                                cursor: 'pointer',
                                '&:hover': {
                                  textDecoration: 'underline',
                                  color: 'success.dark'
                                }
                              }}
                              onClick={(e) => {
                                setInvoicePopoverAnchor(e.currentTarget);
                                setSelectedInvoiceData({
                                  itemName: item.name,
                                  invoices: invoicedData.invoices,
                                  totalInvoiced: invoicedData.totalInvoiced
                                });
                              }}
                            >
                              {formatCurrency(invoicedData.totalInvoiced)}
                            </Typography>
                          </Tooltip>
                        );
                      } else {
                        return (
                          <Typography variant="body2" color="text.secondary">
                            0,00 €
                          </Typography>
                        );
                      }
                    })()}
                  </TableCell>
                  <TableCell align="right">
                    {(() => {
                      const itemId = item.id || `${orderId}_item_${index}`;
                      const proformaData = proformaAmounts[itemId];
                      
                      if (proformaData && proformaData.totalProforma > 0) {
                        return (
                          <Tooltip title={`Kliknij, aby zobaczyć szczegóły (${proformaData.proformas.length} ${proformaData.proformas.length === 1 ? 'proforma' : 'proform'})`}>
                            <Typography 
                              sx={{ 
                                fontWeight: 'medium',
                                color: 'info.main',
                                cursor: 'pointer',
                                '&:hover': {
                                  textDecoration: 'underline',
                                  color: 'info.dark'
                                }
                              }}
                              onClick={(e) => {
                                setInvoicePopoverAnchor(e.currentTarget);
                                setSelectedInvoiceData({
                                  itemName: item.name,
                                  invoices: proformaData.proformas.map(p => ({
                                    invoiceId: p.proformaId,
                                    invoiceNumber: p.proformaNumber,
                                    itemValue: p.itemValue,
                                    quantity: p.quantity
                                  })),
                                  totalInvoiced: proformaData.totalProforma,
                                  isProforma: true
                                });
                              }}
                            >
                              {formatCurrency(proformaData.totalProforma)}
                            </Typography>
                          </Tooltip>
                        );
                      } else {
                        return (
                          <Typography variant="body2" color="text.secondary">
                            0,00 €
                          </Typography>
                        );
                      }
                    })()}
                  </TableCell>
                  <TableCell align="center">
                    {(() => {
                      const completionInfo = getTaskCompletionDate(item);
                      
                      if (!completionInfo) {
                        return (
                          <Typography variant="body2" color="text.secondary">
                            -
                          </Typography>
                        );
                      }
                      
                      const dateToDisplay = completionInfo.date;
                      let formattedDate = '-';
                      
                      try {
                        // Obsługa różnych formatów daty
                        let dateObj;
                        if (dateToDisplay?.toDate && typeof dateToDisplay.toDate === 'function') {
                          // Firestore Timestamp
                          dateObj = dateToDisplay.toDate();
                        } else if (typeof dateToDisplay === 'string') {
                          dateObj = new Date(dateToDisplay);
                        } else if (dateToDisplay instanceof Date) {
                          dateObj = dateToDisplay;
                        }
                        
                        if (dateObj && !isNaN(dateObj.getTime())) {
                          // Format: "16 gru 2025" (bez godziny)
                          formattedDate = formatDate(dateObj, false);
                        }
                      } catch (error) {
                        console.error('Błąd formatowania daty ETM:', error);
                      }
                      
                      return (
                        <Tooltip title={completionInfo.isActual ? 
                          'Rzeczywista data zakończenia produkcji' : 
                          'Planowana data zakończenia produkcji'}>
                          <Typography 
                            variant="body2" 
                            sx={{ 
                              fontWeight: completionInfo.isActual ? 'bold' : 'normal',
                              color: completionInfo.isActual ? 'success.main' : 'text.primary'
                            }}
                          >
                            {formattedDate}
                          </Typography>
                        </Tooltip>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    {getProductionStatus(item, order.productionTasks)}
                  </TableCell>
                  <TableCell align="right">
                    {item.productionTaskId && item.productionCost !== undefined ? (
                      <Tooltip title={t('orderDetails.tooltips.productionTaskCost')}>
                        <Typography>
                          {formatCurrency(item.productionCost)}
                        </Typography>
                      </Tooltip>
                    ) : (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {item.fromPriceList && parseFloat(item.price || 0) > 0 && item.productionCost !== undefined ? (
                      <Typography sx={{ 
                        fontWeight: 'medium', 
                        color: (item.quantity * item.price - item.productionCost) > 0 ? 'success.main' : 'error.main' 
                      }}>
                        {formatCurrency(item.quantity * item.price - item.productionCost)}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {formatCurrency(calculateItemTotalValue(item))}
                  </TableCell>
                  <TableCell align="right">
                    {(() => {
                      // Oblicz proporcję wartości tej pozycji do całkowitej wartości produktów
                      const itemTotalValue = calculateItemTotalValue(item);
                      const allItemsValue = order.items?.reduce((sum, i) => sum + calculateItemTotalValue(i), 0) || 0;
                      const proportion = allItemsValue > 0 ? itemTotalValue / allItemsValue : 0;
                      
                      // Oblicz proporcjonalny udział w kosztach dodatkowych
                      // Suma dodatkowych kosztów (dodatnich)
                      const additionalCosts = order.additionalCostsItems ? 
                        order.additionalCostsItems
                          .filter(cost => parseFloat(cost.value) > 0)
                          .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0) : 0;
                      
                      // Suma rabatów (ujemnych kosztów)
                      const discounts = order.additionalCostsItems ? 
                        Math.abs(order.additionalCostsItems
                          .filter(cost => parseFloat(cost.value) < 0)
                          .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)) : 0;
                      
                      // Całkowity udział pozycji w kosztach dodatkowych
                      const additionalShare = proportion * (additionalCosts - discounts);
                      
                      // Całkowity koszt pozycji z kosztami dodatkowymi
                      const totalWithAdditional = itemTotalValue + additionalShare;
                      
                      // Koszt pojedynczej sztuki
                      const quantity = parseFloat(item.quantity) || 1;
                      const unitCost = totalWithAdditional / quantity;
                      
                      return formatCurrency(unitCost, 'EUR', 4, true);
                    })()}
                  </TableCell>
                  <TableCell align="right">
                    {(() => {
                      // Sprawdź czy pozycja ma powiązane zadanie produkcyjne i pełny koszt produkcji
                      if (item.productionTaskId && item.fullProductionCost !== undefined) {
                        // Użyj zapisanej wartości fullProductionUnitCost, jeśli istnieje
                        if (item.fullProductionUnitCost !== undefined && item.fullProductionUnitCost !== null) {
                          return (
                            <Tooltip title={item.fromPriceList 
                                              ? t('orderDetails.tooltips.fullProductionCostPriceList')
                : t('orderDetails.tooltips.fullProductionCostRegular')}>
                              <Typography sx={{ fontWeight: 'medium', color: 'primary.main' }}>
                                {formatCurrency(item.fullProductionUnitCost)}
                              </Typography>
                            </Tooltip>
                          );
                        }
                        
                        // Jeśli brak zapisanej wartości, oblicz na podstawie fullProductionCost (fallback)
                        const quantity = parseFloat(item.quantity) || 1;
                        const price = parseFloat(item.price) || 0;
                        
                        // Jeśli pozycja jest z listy cenowej I ma cenę większą od 0, nie dodawaj ceny jednostkowej do pełnego kosztu
                        const unitFullProductionCost = (item.fromPriceList && parseFloat(item.price || 0) > 0)
                          ? parseFloat(item.fullProductionCost) / quantity
                          : (parseFloat(item.fullProductionCost) / quantity) + price;
                        
                        return (
                          <Tooltip title={`${item.fromPriceList 
                                            ? t('orderDetails.tooltips.fullProductionCostPriceList')
                : t('orderDetails.tooltips.fullProductionCostRegular')} - ${t('orderDetails.tooltips.calculatedRealTime')}`}>
                            <Typography sx={{ fontWeight: 'medium', color: 'warning.main' }}>
                              {formatCurrency(unitFullProductionCost)}
                            </Typography>
                          </Tooltip>
                        );
                      } else {
                        return <Typography variant="body2" color="text.secondary">-</Typography>;
                      }
                    })()}
                  </TableCell>
                </TableRow>
              ))}
              {/* Wiersz podsumowania */}
              <TableRow sx={{ 
                bgcolor: 'action.hover', 
                borderTop: '2px solid', 
                borderColor: 'primary.main',
                '& .MuiTableCell-root': {
                  fontWeight: 'bold',
                  color: 'text.primary'
                }
              }}>
                <TableCell>PODSUMOWANIE:</TableCell>
                <TableCell align="right">
                  {/* Suma ilości */}
                  {order.items?.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0), 0) || 0}
                </TableCell>
                <TableCell align="right">
                  {/* Suma wysłanych */}
                  {order.items?.reduce((sum, item) => sum + (parseFloat(item.shippedQuantity) || 0), 0) || 0}
                </TableCell>
                <TableCell align="right">
                  {/* Cena - nie sumujemy */}
                  -
                </TableCell>
                <TableCell align="right">
                  {/* Suma wartości (ilość × cena) */}
                  {formatCurrency(order.items?.reduce((sum, item) => sum + (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0), 0) || 0)}
                </TableCell>
                <TableCell align="right">
                  {/* Suma zafakturowanych kwot */}
                  {(() => {
                    let totalInvoiced = 0;
                    const invoicesMap = new Map();
                    
                    order.items?.forEach((item, index) => {
                      const itemId = item.id || `${orderId}_item_${index}`;
                      const invoicedData = invoicedAmounts[itemId];
                      if (invoicedData && invoicedData.totalInvoiced > 0) {
                        totalInvoiced += invoicedData.totalInvoiced;
                        invoicedData.invoices.forEach(inv => {
                          if (invoicesMap.has(inv.invoiceId)) {
                            const existing = invoicesMap.get(inv.invoiceId);
                            existing.itemValue += inv.itemValue;
                            existing.quantity += inv.quantity;
                          } else {
                            invoicesMap.set(inv.invoiceId, { 
                              invoiceId: inv.invoiceId,
                              invoiceNumber: inv.invoiceNumber,
                              itemValue: inv.itemValue,
                              quantity: inv.quantity
                            });
                          }
                        });
                      }
                    });
                    
                    const allInvoices = Array.from(invoicesMap.values());
                    
                    if (totalInvoiced > 0) {
                      return (
                        <Tooltip title={t('orderDetails.tooltips.clickToSeeAllInvoices')}>
                          <Typography
                            sx={{ 
                              cursor: 'pointer',
                              '&:hover': {
                                textDecoration: 'underline',
                              }
                            }}
                            onClick={(e) => {
                              setInvoicePopoverAnchor(e.currentTarget);
                              setSelectedInvoiceData({
                                itemName: t('orderDetails.invoicePopover.allOrderItems'),
                                invoices: allInvoices,
                                totalInvoiced: totalInvoiced
                              });
                            }}
                          >
                            {formatCurrency(totalInvoiced)}
                          </Typography>
                        </Tooltip>
                      );
                    }
                    
                    return formatCurrency(totalInvoiced);
                  })()}
                </TableCell>
                <TableCell align="right">
                  {/* Suma kwot z proform */}
                  {(() => {
                    let totalProforma = 0;
                    const proformasMap = new Map();
                    
                    order.items?.forEach((item, index) => {
                      const itemId = item.id || `${orderId}_item_${index}`;
                      const proformaData = proformaAmounts[itemId];
                      if (proformaData && proformaData.totalProforma > 0) {
                        totalProforma += proformaData.totalProforma;
                        proformaData.proformas.forEach(pf => {
                          if (proformasMap.has(pf.proformaId)) {
                            const existing = proformasMap.get(pf.proformaId);
                            existing.itemValue += pf.itemValue;
                            existing.quantity += pf.quantity;
                          } else {
                            proformasMap.set(pf.proformaId, { 
                              invoiceId: pf.proformaId,
                              invoiceNumber: pf.proformaNumber,
                              itemValue: pf.itemValue,
                              quantity: pf.quantity
                            });
                          }
                        });
                      }
                    });
                    
                    const allProformas = Array.from(proformasMap.values());
                    
                    if (totalProforma > 0) {
                      return (
                        <Tooltip title="Kliknij, aby zobaczyć wszystkie proformy">
                          <Typography
                            sx={{ 
                              cursor: 'pointer',
                              '&:hover': {
                                textDecoration: 'underline',
                              }
                            }}
                            onClick={(e) => {
                              setInvoicePopoverAnchor(e.currentTarget);
                              setSelectedInvoiceData({
                                itemName: 'Wszystkie pozycje zamówienia',
                                invoices: allProformas,
                                totalInvoiced: totalProforma,
                                isProforma: true
                              });
                            }}
                          >
                            {formatCurrency(totalProforma)}
                          </Typography>
                        </Tooltip>
                      );
                    }
                    
                    return formatCurrency(totalProforma);
                  })()}
                </TableCell>
                <TableCell align="center">
                  {/* ETM - nie sumujemy */}
                  -
                </TableCell>
                <TableCell align="right">
                  {/* Status produkcji - nie sumujemy */}
                  -
                </TableCell>
                <TableCell align="right">
                  {/* Suma kosztów produkcji */}
                  {formatCurrency(order.items?.reduce((sum, item) => {
                    return sum + (item.productionTaskId && item.productionCost !== undefined ? parseFloat(item.productionCost) || 0 : 0);
                  }, 0) || 0)}
                </TableCell>
                <TableCell align="right">
                  {/* Suma zysków */}
                  {(() => {
                    const totalProfit = order.items?.reduce((sum, item) => {
                      if (item.fromPriceList && parseFloat(item.price || 0) > 0 && item.productionCost !== undefined) {
                        return sum + (item.quantity * item.price - item.productionCost);
                      }
                      return sum;
                    }, 0) || 0;
                    return (
                      <Typography sx={{ 
                        fontWeight: 'inherit',
                        color: totalProfit > 0 ? 'success.main' : totalProfit < 0 ? 'error.main' : 'inherit'
                      }}>
                        {formatCurrency(totalProfit)}
                      </Typography>
                    );
                  })()}
                </TableCell>
                <TableCell align="right">
                  {/* Suma wartości pozycji */}
                  {formatCurrency(order.items?.reduce((sum, item) => sum + calculateItemTotalValue(item), 0) || 0)}
                </TableCell>
                <TableCell align="right">
                  {/* Koszt całkowity na jednostkę - nie sumujemy */}
                  -
                </TableCell>
                <TableCell align="right">
                  {/* Pełny koszt produkcji na jednostkę - nie sumujemy */}
                  -
                </TableCell>
              </TableRow>
              
              {/* Rabat globalny */}
              {order.globalDiscount && parseFloat(order.globalDiscount) > 0 && (
                <TableRow>
                  <TableCell colSpan={3} />
                  <TableCell align="right" sx={{ fontWeight: 'bold', color: 'success.main' }}>
                    Rabat globalny ({order.globalDiscount}%):
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                    -{formatCurrency((() => {
                      const subtotal = order.items?.reduce((sum, item) => sum + calculateItemTotalValue(item), 0) || 0;
                      return subtotal * (parseFloat(order.globalDiscount) / 100);
                    })())}
                  </TableCell>
                  <TableCell colSpan={9} />
                </TableRow>
              )}
              
              <TableRow>
                <TableCell colSpan={3} />
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  Razem:
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
                  {formatCurrency(calculateOrderTotalValue())}
                </TableCell>
                <TableCell colSpan={9} />
              </TableRow>
            </TableBody>
          </Table>
          
          {/* Przycisk utworzenia faktury korygującej */}
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
            <Button
              variant="contained"
              color="error"
              startIcon={<ReceiptIcon />}
              component={RouterLink}
              to="/invoices/new"
              state={{
                preselectedOrder: order,
                isCorrectionInvoice: true
              }}
            >
              Utwórz FK
            </Button>
          </Box>
        </Paper>

        {/* Uwagi */}
        {order.notes && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={mb2}>{t('orderDetails.sections.comments')}</Typography>
            <Divider sx={mb2} />
            <Typography variant="body1">
              {order.notes}
            </Typography>
          </Paper>
        )}

        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">{t('orderDetails.sections.productionTasks')}</Typography>
            <IconButton 
              color="primary" 
              onClick={refreshProductionCosts} 
              title={t('orderDetails.tooltips.refreshProductionTasks')}
            >
              <RefreshIcon />
            </IconButton>
          </Box>
          <Divider sx={mb2} />
          
          {!order.productionTasks || order.productionTasks.length === 0 ? (
            <Typography variant="body1" color="text.secondary">
              {t('orderDetails.productionTasksTable.noTasks')}
            </Typography>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('orderDetails.productionTasksTable.moNumber')}</TableCell>
                  <TableCell>{t('orderDetails.productionTasksTable.taskName')}</TableCell>
                  <TableCell>{t('orderDetails.productionTasksTable.product')}</TableCell>
                  <TableCell>{t('orderDetails.productionTasksTable.quantity')}</TableCell>
                  <TableCell>{t('orderDetails.productionTasksTable.status')}</TableCell>
                  <TableCell>{t('orderDetails.productionTasksTable.batchNumber')}</TableCell>
                  <TableCell align="right">{t('orderDetails.productionTasksTable.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {order.productionTasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>
                      <Link
                        component={RouterLink}
                        to={`/production/tasks/${task.id}`}
                        sx={{ 
                          textDecoration: 'none',
                          fontWeight: 'medium',
                          '&:hover': {
                            textDecoration: 'underline'
                          }
                        }}
                      >
                        {task.moNumber}
                      </Link>
                    </TableCell>
                    <TableCell>{task.name}</TableCell>
                    <TableCell>{task.productName}</TableCell>
                    <TableCell>{task.quantity} {task.unit}</TableCell>
                    <TableCell>
                      <Chip 
                        label={task.status} 
                        color={getProductionStatusColor(task.status)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      {task.lotNumber ? (
                        <Tooltip title={t('orderDetails.productionTasksTable.batchNumberTooltip')}>
                          <Chip
                            label={task.lotNumber}
                            color="success"
                            size="small"
                            variant="outlined"
                          />
                        </Tooltip>
                      ) : task.status === 'Zakończone' ? (
                        <Chip
                          label={t('orderDetails.productionTasksTable.noLotNumber')}
                          color="warning"
                          size="small"
                          variant="outlined"
                        />
                      ) : null}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        component={RouterLink}
                        to={`/production/tasks/${task.id}`}
                        variant="outlined"
                      >
                        {t('orderDetails.productionTasksTable.details')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        {/* Sekcja faktur powiązanych z zamówieniem */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">{t('orderDetails.sections.relatedInvoices')}</Typography>
            <Box>
              <IconButton 
                color="primary" 
                onClick={fetchInvoices}
                title={t('orderDetails.tooltips.refreshInvoicesList')}
              >
                <RefreshIcon />
              </IconButton>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                component={RouterLink}
                to={`/invoices/new?customerId=${order.customer?.id || ''}&orderId=${orderId}`}
                sx={{ ml: 1 }}
              >
                {t('orderDetails.invoicesTable.createInvoice')}
              </Button>
              <Button
                variant="outlined"
                size="small"
                color="secondary"
                onClick={handleMigrateInvoices}
                disabled={loadingInvoices || invoices.length === 0}
                sx={{ ml: 1 }}
              >
                Migruj faktury
              </Button>
            </Box>
          </Box>
          
          {loadingInvoices ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : invoices.length === 0 ? (
            <Typography variant="body1" color="text.secondary">
              {t('orderDetails.invoicesTable.noInvoices')}
            </Typography>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('orderDetails.invoicesTable.invoiceNumber')}</TableCell>
                  <TableCell>{t('orderDetails.invoicesTable.issueDate')}</TableCell>
                  <TableCell>{t('orderDetails.invoicesTable.dueDate')}</TableCell>
                  <TableCell>{t('orderDetails.invoicesTable.paymentStatus')}</TableCell>
                  <TableCell align="right">{t('orderDetails.invoicesTable.value')}</TableCell>
                  <TableCell align="right">{t('orderDetails.invoicesTable.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <Link
                        component={RouterLink}
                        to={`/invoices/${invoice.id}`}
                        sx={{ 
                          textDecoration: 'none',
                          fontWeight: 'medium',
                          '&:hover': {
                            textDecoration: 'underline'
                          }
                        }}
                      >
                        {invoice.number || `#${invoice.id.substring(0, 8).toUpperCase()}`}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {invoice.issueDate ? formatDate(invoice.issueDate) : '-'}
                    </TableCell>
                    <TableCell>
                      {invoice.dueDate ? formatDate(invoice.dueDate) : '-'}
                    </TableCell>
                    <TableCell>
                      {renderPaymentStatus(invoice.paymentStatus)}
                    </TableCell>
                    <TableCell align="right">
                      <Box>
                        <Typography variant="body2">
                          {formatCurrency(invoice.total || 0, invoice.currency || 'EUR')}
                        </Typography>
                        {invoice.isProforma && availableProformaAmounts[invoice.id] !== undefined && (
                          <Tooltip title="Kwota dostępna do rozliczenia na fakturze końcowej">
                            <Typography 
                              variant="caption" 
                              color={availableProformaAmounts[invoice.id] > 0 ? 'success.main' : 'text.secondary'}
                              sx={{ display: 'block' }}
                            >
                              Dostępne: {formatCurrency(availableProformaAmounts[invoice.id])}
                            </Typography>
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        component={RouterLink}
                        to={`/invoices/${invoice.id}`}
                        variant="outlined"
                      >
                        {t('orderDetails.invoicesTable.details')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        {/* Sekcja dokumentów CMR powiązanych z zamówieniem */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">{t('orderDetails.sections.relatedCmrDocuments')}</Typography>
            <Box>
              <IconButton 
                color="primary" 
                onClick={fetchCmrDocuments}
                title={t('orderDetails.tooltips.refreshCmrDocuments')}
              >
                <RefreshIcon />
              </IconButton>
              <Button
                variant="contained"
                size="small"
                startIcon={<AddIcon />}
                component={RouterLink}
                to="/inventory/cmr/new"
                sx={{ ml: 1 }}
              >
                {t('orderDetails.cmrTable.createCmr')}
              </Button>
            </Box>
          </Box>
          
          {loadingCmrDocuments ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
              <CircularProgress />
            </Box>
          ) : cmrDocuments.length === 0 ? (
            <Typography variant="body1" color="text.secondary">
              {t('orderDetails.cmrTable.noCmrDocuments')}
            </Typography>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>{t('orderDetails.cmrTable.cmrNumber')}</TableCell>
                  <TableCell>{t('orderDetails.cmrTable.issueDate')}</TableCell>
                  <TableCell>{t('orderDetails.cmrTable.deliveryDate')}</TableCell>
                  <TableCell>{t('orderDetails.cmrTable.recipient')}</TableCell>
                  <TableCell>{t('orderDetails.cmrTable.status')}</TableCell>
                  <TableCell align="right">{t('orderDetails.cmrTable.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cmrDocuments.map((cmr) => (
                  <TableRow key={cmr.id}>
                    <TableCell>
                      <Link
                        component={RouterLink}
                        to={`/inventory/cmr/${cmr.id}`}
                        sx={{ 
                          textDecoration: 'none',
                          fontWeight: 'medium',
                          '&:hover': {
                            textDecoration: 'underline'
                          }
                        }}
                      >
                        {cmr.cmrNumber || `#${cmr.id.substring(0, 8).toUpperCase()}`}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {cmr.issueDate ? formatDate(cmr.issueDate, false) : (cmr.status === 'Szkic' ? t('orderDetails.cmrTable.notSet') : '-')}
                    </TableCell>
                    <TableCell>
                      {cmr.deliveryDate ? formatDate(cmr.deliveryDate, false) : (cmr.status === 'Szkic' ? t('orderDetails.cmrTable.notSet') : '-')}
                    </TableCell>
                    <TableCell>
                      {cmr.recipient || '-'}
                    </TableCell>
                    <TableCell>
                      {renderCmrStatus(cmr.status)}
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        component={RouterLink}
                        to={`/inventory/cmr/${cmr.id}`}
                        variant="outlined"
                      >
                        {t('orderDetails.cmrTable.details')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        {/* Dialog potwierdzenia zmiany numeru CO */}
        <Dialog
          open={updateOrderNumberDialogOpen}
          onClose={() => !isUpdatingOrderNumber && setUpdateOrderNumberDialogOpen(false)}
        >
          <DialogTitle>⚠️ Potwierdź zmianę numeru CO</DialogTitle>
          <DialogContent>
            <DialogContentText>
              <strong>Zmiana numeru zamówienia z:</strong>
              <br />
              <Chip label={order?.orderNumber} color="error" sx={{ my: 1 }} />
              <br />
              <strong>na:</strong>
              <br />
              <Chip label={newOrderNumber} color="success" sx={{ my: 1 }} />
              <br /><br />
              Ta operacja zaktualizuje numer CO we wszystkich powiązanych dokumentach:
              <ul>
                <li>Fakturach</li>
                <li>Zadaniach produkcyjnych (MO)</li>
                <li>Dokumentach CMR</li>
                <li>Partiach magazynowych</li>
              </ul>
              <Alert severity="warning" sx={{ mt: 2 }}>
                Ta operacja jest nieodwracalna. Upewnij się, że nowy numer jest poprawny.
              </Alert>
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button 
              onClick={() => setUpdateOrderNumberDialogOpen(false)}
              disabled={isUpdatingOrderNumber}
            >
              Anuluj
            </Button>
            <Button 
              onClick={handleUpdateOrderNumber} 
              variant="contained"
              color="primary"
              disabled={isUpdatingOrderNumber}
            >
              {isUpdatingOrderNumber ? (
                <>
                  <CircularProgress size={20} sx={mr1} />
                  Aktualizuję...
                </>
              ) : (
                'Potwierdź zmianę'
              )}
            </Button>
          </DialogActions>
        </Dialog>

        {/* Popover z listą faktur dla zafakturowanej kwoty */}
        <Popover
          open={Boolean(invoicePopoverAnchor)}
          anchorEl={invoicePopoverAnchor}
          onClose={() => {
            setInvoicePopoverAnchor(null);
            setSelectedInvoiceData(null);
          }}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'center',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'center',
          }}
        >
          {selectedInvoiceData && (
            <Box sx={{ p: 2, minWidth: 300 }}>
              <Typography variant="h6" sx={mb1}>
                {t('orderDetails.invoicePopover.title', { itemName: selectedInvoiceData.itemName })}
              </Typography>
              <Divider sx={mb1} />
              <Typography variant="body2" color="text.secondary" sx={mb2}>
                {t('orderDetails.invoicePopover.totalInvoiced')} {formatCurrency(selectedInvoiceData.totalInvoiced)}
              </Typography>
              <List dense>
                {selectedInvoiceData.invoices.map((invoice, idx) => (
                  <ListItemButton
                    key={idx}
                    onClick={() => {
                      window.open(`/invoices/${invoice.invoiceId}`, '_blank');
                      setInvoicePopoverAnchor(null);
                      setSelectedInvoiceData(null);
                    }}
                    sx={{
                      borderRadius: 1,
                      mb: 0.5,
                      '&:hover': {
                        bgcolor: 'action.hover'
                      }
                    }}
                  >
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Typography variant="body2" fontWeight="medium">
                              {invoice.invoiceNumber}
                            </Typography>
                            <OpenInNewIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
                          </Box>
                          <Typography variant="body2" color="success.main" fontWeight="medium">
                            {formatCurrency(invoice.itemValue)}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Typography variant="caption" color="text.secondary">
                          {t('orderDetails.invoicePopover.quantity')} {invoice.quantity}
                        </Typography>
                      }
                    />
                  </ListItemButton>
                ))}
              </List>
              <Divider sx={{ mt: 1, mb: 1 }} />
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', textAlign: 'center' }}>
                {t('orderDetails.invoicePopover.clickToNavigate')}
              </Typography>
            </Box>
          )}
        </Popover>

        {/* Dialog zmiany statusu */}
        <Dialog
          open={statusDialogOpen}
          onClose={() => setStatusDialogOpen(false)}
        >
          <DialogTitle>{t('orderDetails.dialogs.statusChange.title')}</DialogTitle>
          <DialogContent>
            <DialogContentText sx={mb2}>
              {t('orderDetails.dialogs.statusChange.selectStatus')}
              <br />
              {t('orderDetails.dialogs.statusChange.orderNumber')} {order?.orderNumber || order?.id?.substring(0, 8).toUpperCase()}
            </DialogContentText>
            <FormControl fullWidth>
              <InputLabel id="new-status-label">{t('orderDetails.dialogs.statusChange.status')}</InputLabel>
              <Select
                labelId="new-status-label"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
                label={t('orderDetails.dialogs.statusChange.status')}
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
            <Button onClick={() => setStatusDialogOpen(false)}>{t('orderDetails.dialogs.statusChange.cancel')}</Button>
            <Button color="primary" onClick={handleStatusUpdate}>{t('orderDetails.dialogs.statusChange.update')}</Button>
          </DialogActions>
        </Dialog>

      </Box>
    </div>
  );
};

export default OrderDetails; 