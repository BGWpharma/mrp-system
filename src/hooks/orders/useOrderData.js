import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { getOrderById, migrateCmrHistoryData, updateOrder } from '../../services/orders';
import { useNotification } from '../useNotification';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../services/firebase/config';
import { runTransaction, doc, serverTimestamp } from 'firebase/firestore';
import { useVisibilityAwareSnapshot } from '../useVisibilityAwareSnapshot';
import { getInvoicedAmountsByOrderItems, getProformaAmountsByOrderItems, getAvailableProformasForOrder } from '../../services/finance';
import { recalculateShippedQuantities } from '../../services/cloudFunctionsService';
import { useTranslation } from '../useTranslation';
import { getCachedUserNames, invalidateCache } from '../../utils/orderCache';

export const calculateItemTotalValue = (item) => {
  const itemValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
  if (item.fromPriceList && parseFloat(item.price || 0) > 0) {
    return itemValue;
  }
  if (item.productionTaskId && item.productionCost !== undefined) {
    return itemValue + parseFloat(item.productionCost || 0);
  }
  return itemValue;
};

const verifyProductionTasks = async (orderToVerify) => {
  if (!orderToVerify || !orderToVerify.productionTasks || orderToVerify.productionTasks.length === 0) {
    return { order: orderToVerify, removedCount: 0 };
  }

  try {
    const { getMultipleTasksById } = await import('../../services/production/productionService');
    const { removeProductionTaskFromOrder } = await import('../../services/orders');
    
    const taskIds = orderToVerify.productionTasks.map(task => task.id);
    const taskDocsMap = await getMultipleTasksById(taskIds);
    
    const verifiedTasks = [];
    const tasksToRemove = [];
    
    for (const task of orderToVerify.productionTasks) {
      const taskDoc = taskDocsMap[task.id];
      
      if (!taskDoc) {
        console.error(`Zadanie ${task.id} nie istnieje w bazie danych`);
        tasksToRemove.push(task);
        
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
        
        if (taskDoc.endDate !== undefined) updatedTask.endDate = taskDoc.endDate;
        if (taskDoc.completionDate !== undefined) updatedTask.completionDate = taskDoc.completionDate;
        if (taskDoc.productionSessions !== undefined) updatedTask.productionSessions = taskDoc.productionSessions;
        if (taskDoc.lotNumber !== undefined) updatedTask.lotNumber = taskDoc.lotNumber;
        if (taskDoc.finalQuantity !== undefined) updatedTask.finalQuantity = taskDoc.finalQuantity;
        if (taskDoc.inventoryBatchId !== undefined) updatedTask.inventoryBatchId = taskDoc.inventoryBatchId;
        
        verifiedTasks.push(updatedTask);
        
        if (orderToVerify.items) {
          orderToVerify.items = orderToVerify.items.map(item => {
            if (item.productionTaskId === task.id) {
              const materialCost = (taskDoc.totalMaterialCost || 0) + (taskDoc.factoryCostTotal || 0);
              const unitMaterialCost = (taskDoc.unitMaterialCost || 0) + (taskDoc.factoryCostPerUnit || 0);
              const fullCost = taskDoc.totalCostWithFactory || taskDoc.totalFullProductionCost || 0;
              const unitFullCost = taskDoc.unitCostWithFactory || taskDoc.unitFullProductionCost || 0;
              return {
                ...item,
                productionStatus: taskDoc.status,
                productionTaskNumber: taskDoc.moNumber,
                productionCost: materialCost,
                fullProductionCost: fullCost,
                productionUnitCost: unitMaterialCost,
                fullProductionUnitCost: unitFullCost,
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
    
    const hasChanges = tasksToRemove.length > 0 || verifiedTasks.some((task, index) => {
      const originalTask = orderToVerify.productionTasks[index];
      return JSON.stringify(task) !== JSON.stringify(originalTask);
    });
    
    if (hasChanges) {
      if (tasksToRemove.length > 0 && orderToVerify.id) {
        for (const task of tasksToRemove) {
          try {
            await removeProductionTaskFromOrder(orderToVerify.id, task.id);
          } catch (error) {
            console.error(`Błąd podczas usuwania referencji do zadania ${task.id}:`, error);
          }
        }
      }
      
      if (orderToVerify.id && verifiedTasks.length > 0) {
        try {
          const orderRef = doc(db, 'orders', orderToVerify.id);
          const productionFields = [
            'productionTaskId', 'productionTaskNumber', 'productionStatus',
            'productionCost', 'fullProductionCost', 'productionUnitCost',
            'fullProductionUnitCost', 'factoryCostIncluded'
          ];

          const mergedItems = await runTransaction(db, async (transaction) => {
            const latestSnap = await transaction.get(orderRef);
            const latestItems = latestSnap.data()?.items || [];

            const merged = latestItems.map((latestItem, index) => {
              const verifiedItem = orderToVerify.items?.[index];
              if (!verifiedItem) return latestItem;
              const updates = {};
              for (const field of productionFields) {
                if (verifiedItem[field] !== undefined) {
                  updates[field] = verifiedItem[field];
                } else if (verifiedItem[field] === null) {
                  updates[field] = null;
                }
              }
              return { ...latestItem, ...updates };
            });

            transaction.update(orderRef, {
              productionTasks: verifiedTasks,
              items: merged,
              updatedAt: serverTimestamp()
            });

            return merged;
          });

          orderToVerify.items = mergedItems;
        } catch (error) {
          console.error('Błąd podczas zapisywania zaktualizowanych zadań:', error);
        }
      }
      
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

export function useOrderData() {
  const { t } = useTranslation('orders');
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { showError, showSuccess, showInfo } = useNotification();
  const { currentUser } = useAuth();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userNames, setUserNames] = useState({});
  const [fullProductionTasks, setFullProductionTasks] = useState({});
  const [isRefreshingCmr, setIsRefreshingCmr] = useState(false);

  const [activeSection, setActiveSection] = useState('basic');
  const [sectionsLoaded, setSectionsLoaded] = useState({
    basic: true,
    production: false,
    documents: false,
    history: false
  });

  const [invoicedAmounts, setInvoicedAmounts] = useState({});
  const [proformaAmounts, setProformaAmounts] = useState({});
  const [availableProformaAmounts, setAvailableProformaAmounts] = useState({});

  // --- Fetch initial order data ---
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
          }
          
          const proformaAmountsResult = results[resultIndex++];
          if (proformaAmountsResult.status === 'fulfilled') {
            setProformaAmounts(proformaAmountsResult.value);
          }
          
          const availableProformasResult = results[resultIndex++];
          if (availableProformasResult.status === 'fulfilled') {
            const availableProformas = availableProformasResult.value;
            const proformaAmountsMap = {};
            availableProformas.forEach(proforma => {
              proformaAmountsMap[proforma.id] = proforma.amountInfo?.available || 0;
            });
            setAvailableProformaAmounts(proformaAmountsMap);
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

  // --- Real-time listener ---
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

  // --- BroadcastChannel listener ---
  useEffect(() => {
    if (!orderId) return;

    let channel;
    try {
      channel = new BroadcastChannel('production-costs-update');
      
      const handleCostUpdate = (event) => {
        if (event.data.type === 'TASK_COSTS_UPDATED') {
          const { taskId } = event.data;
          
          if (order && (
            (order.items && order.items.some(item => item.productionTaskId === taskId)) ||
            (order.productionTasks && order.productionTasks.some(task => task.id === taskId))
          )) {
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

  // --- Refresh functions ---
  const refreshOrderData = async (retries = 3, delay = 1000, { forceServer = false } = {}) => {
    try {
      setLoading(true);
      
      if (location.pathname.includes('/purchase-orders/')) {
        setLoading(false);
        return;
      }
      
      invalidateCache(orderId);
      
      const freshOrder = await getOrderById(orderId, { forceServer });
      
      const { order: verifiedOrder, removedCount } = await verifyProductionTasks(freshOrder);
      
      if (removedCount > 0) {
        showInfo(t('orderDetails.notifications.productionTasksRemoved', { count: removedCount }));
      }
      
      setOrder(verifiedOrder);
      showSuccess(t('orderDetails.notifications.refreshSuccess'));
    } catch (error) {
      if (!location.pathname.includes('/purchase-orders/')) {
        console.error('Error refreshing order data:', error);
        
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

  const refreshProductionCosts = async (retries = 3, delay = 1000) => {
    try {
      setLoading(true);
      
      if (location.pathname.includes('/purchase-orders/')) {
        setLoading(false);
        return;
      }
      
      const refreshedOrderData = await getOrderById(orderId);
      
      const { getTaskById } = await import('../../services/production/productionService');
      const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/calculations');
      
      if (refreshedOrderData.productionTasks && refreshedOrderData.productionTasks.length > 0) {
        const updatedOrderData = { ...refreshedOrderData };
        
        if (updatedOrderData.items && updatedOrderData.items.length > 0) {
          for (let i = 0; i < updatedOrderData.items.length; i++) {
            const item = updatedOrderData.items[i];
            
            const associatedTask = updatedOrderData.productionTasks.find(task => 
              task.id === item.productionTaskId
            );
            
            if (associatedTask) {
              try {
                const taskDetails = await getTaskById(associatedTask.id);
                
                const materialCost = (taskDetails.totalMaterialCost || associatedTask.totalMaterialCost || 0) + (taskDetails.factoryCostTotal || 0);
                const unitMaterialCost = (taskDetails.unitMaterialCost || associatedTask.unitMaterialCost || 0) + (taskDetails.factoryCostPerUnit || 0);
                const fullProductionCost = taskDetails.totalCostWithFactory || taskDetails.totalFullProductionCost || associatedTask.totalFullProductionCost || 0;
                const unitFullCost = taskDetails.unitCostWithFactory || taskDetails.unitFullProductionCost || 0;
                const calculatedFullProdUnitCost = calculateFullProductionUnitCost(item, fullProductionCost);
                const calculatedProdUnitCost = calculateProductionUnitCost(item, materialCost);
                
                updatedOrderData.items[i] = {
                  ...item,
                  productionTaskId: associatedTask.id,
                  productionTaskNumber: associatedTask.moNumber || taskDetails.moNumber,
                  productionStatus: associatedTask.status || taskDetails.status,
                  productionCost: materialCost,
                  fullProductionCost: fullProductionCost,
                  productionUnitCost: unitMaterialCost || calculatedProdUnitCost,
                  fullProductionUnitCost: unitFullCost || calculatedFullProdUnitCost,
                  factoryCostIncluded: (taskDetails.factoryCostTotal || 0) > 0
                };
              } catch (error) {
                console.error(`Błąd podczas pobierania szczegółów zadania ${associatedTask.id}:`, error);
                
                const materialCost = (associatedTask.totalMaterialCost || 0) + (associatedTask.factoryCostTotal || 0);
                const unitMaterialCost = (associatedTask.unitMaterialCost || 0) + (associatedTask.factoryCostPerUnit || 0);
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
        
        const localCalcItemTotal = (itm) => {
          const iv = (parseFloat(itm.quantity) || 0) * (parseFloat(itm.price) || 0);
          if (itm.fromPriceList && parseFloat(itm.price || 0) > 0) return iv;
          if (itm.productionTaskId && itm.productionCost !== undefined) return iv + parseFloat(itm.productionCost || 0);
          return iv;
        };

        const subtotal = (updatedOrderData.items || []).reduce((sum, itm) => sum + localCalcItemTotal(itm), 0);
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
        } catch (saveError) {
          console.error('Błąd podczas zapisywania zamówienia:', saveError);
        }

        setOrder(updatedOrderData);
        showSuccess(t('orderDetails.notifications.productionCostsRefreshed'));
      } else {
        showInfo(t('orderDetails.notifications.noProductionTasks'));
      }
    } catch (error) {
      if (!location.pathname.includes('/purchase-orders/')) {
        console.error('Error refreshing production costs:', error);
        
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

  const handleMigrateCmrData = async () => {
    try {
      setLoading(true);
      showInfo(t('orderDetails.notifications.migrationStarted'));
      
      const result = await migrateCmrHistoryData();
      
      if (result.success) {
        showSuccess(t('orderDetails.notifications.migrationSuccess', { count: result.migratedCount }));
        await refreshOrderData();
      }
    } catch (error) {
      console.error('Błąd podczas migracji:', error);
      showError(t('orderDetails.notifications.migrationError') + ': ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // --- Navigation helpers ---
  const handleBackClick = useCallback(() => { navigate('/orders'); }, [navigate]);
  const handleEditClick = useCallback(() => { navigate(`/orders/edit/${orderId}`); }, [navigate, orderId]);

  const handlePrintInvoice = useCallback(() => { window.print(); }, []);
  
  const handleSendEmail = useCallback(() => {
    const emailAddress = order?.customer?.email;
    if (emailAddress) {
      window.location.href = `mailto:${emailAddress}?subject=Zamówienie ${order.orderNumber || order.id.substring(0, 8).toUpperCase()}`;
    }
  }, [order]);

  // --- Status helpers ---
  const getStatusChipColor = useCallback((status) => {
    switch (status) {
      case 'Nowe': return 'primary';
      case 'W realizacji': return 'info';
      case 'Zakończone': return 'success';
      case 'Rozliczone': return 'secondary';
      case 'Anulowane': return 'error';
      default: return 'default';
    }
  }, []);

  const getProductionStatusColor = useCallback((status) => {
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
  }, []);

  const getUserName = useCallback((userId) => {
    return userNames[userId] || userId || 'System';
  }, [userNames]);

  // --- ETM date ---
  const getTaskCompletionDate = useCallback((item) => {
    let taskId = null;
    
    if (item.productionTaskId) {
      taskId = item.productionTaskId;
    } else if (order?.productionTasks) {
      const taskFromOrder = order.productionTasks.find(t => t.orderItemId === item.id);
      if (taskFromOrder) {
        taskId = taskFromOrder.id;
      }
    }
    
    if (!taskId) return null;
    
    const task = fullProductionTasks[taskId];
    if (!task) return null;
    
    if (task.status === 'Zakończone') {
      if (task.productionSessions && task.productionSessions.length > 0) {
        const lastSession = task.productionSessions[task.productionSessions.length - 1];
        if (lastSession.endDate) {
          return { date: lastSession.endDate, isActual: true, status: task.status, source: 'productionSession' };
        }
      }
      if (task.completionDate) {
        return { date: task.completionDate, isActual: true, status: task.status, source: 'completionDate' };
      }
    }
    
    if (task.endDate) {
      return { date: task.endDate, isActual: false, status: task.status, source: 'plannedEndDate' };
    }
    
    return null;
  }, [order, fullProductionTasks]);

  const calculateOrderTotalValue = useCallback(() => {
    const productsValue = order?.items?.reduce((sum, item) => sum + calculateItemTotalValue(item), 0) || 0;
    const globalDiscount = parseFloat(order?.globalDiscount) || 0;
    const discountMultiplier = (100 - globalDiscount) / 100;
    return productsValue * discountMultiplier;
  }, [order]);

  const handleRefreshShippedQuantities = useCallback(async ({ setCmrDocuments, setLoadingCmrDocuments, loadCmrDocuments } = {}) => {
    if (!order || !order.id) {
      showError('Brak danych zamówienia');
      return;
    }

    try {
      setIsRefreshingCmr(true);

      const result = await recalculateShippedQuantities(order.id);

      if (result.success) {
        showSuccess(result.message);

        invalidateCache(order.id);
        await refreshOrderData(3, 1000, { forceServer: true });

        invalidateCache(`orderCmr_${order.id}`);
        if (setCmrDocuments) setCmrDocuments([]);
        if (setLoadingCmrDocuments) setLoadingCmrDocuments(false);
        if (loadCmrDocuments) await loadCmrDocuments();
      } else {
        throw new Error('Nie udało się przeliczyć ilości wysłanych');
      }
    } catch (error) {
      showError(`Nie udało się przeliczyć ilości wysłanych: ${error.message}`);
    } finally {
      setIsRefreshingCmr(false);
    }
  }, [order, showError, showSuccess]);

  return {
    order, setOrder, loading, setLoading,
    orderId, navigate, location, currentUser,
    userNames, setUserNames,
    fullProductionTasks, setFullProductionTasks,
    isRefreshingCmr, setIsRefreshingCmr,
    activeSection, setActiveSection,
    sectionsLoaded, setSectionsLoaded,
    invoicedAmounts, proformaAmounts, availableProformaAmounts,
    refreshOrderData,
    refreshProductionCosts,
    handleMigrateCmrData,
    handleBackClick,
    handleEditClick,
    handlePrintInvoice,
    handleSendEmail,
    handleRefreshShippedQuantities,
    getStatusChipColor,
    getProductionStatusColor,
    getUserName,
    getTaskCompletionDate,
    calculateOrderTotalValue,
    showError, showSuccess, showInfo,
    t
  };
}
