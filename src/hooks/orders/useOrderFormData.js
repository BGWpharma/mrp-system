import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { arrayMove } from '@dnd-kit/sortable';
import {
  createOrder,
  updateOrder,
  getOrderById,
  ORDER_STATUSES,
  DEFAULT_ORDER,
  DEFAULT_ORDER_ITEM,
  getLastRecipeUsageInfo
} from '../../services/orders';
import { getInventoryItemsByCategory } from '../../services/inventory';
import { getAllCustomers, createCustomer } from '../../services/crm';
import { useAuth } from '../useAuth';
import { useNotification } from '../useNotification';
import { useTranslation } from '../useTranslation';
import { formatDateForInput, safeParseDate, ensureDateInputFormat } from '../../utils/dateUtils';
import { getAllRecipes, getRecipeById, getPriceForCustomerProduct } from '../../services/products';
import { calculateProductionCost } from '../../utils/calculations';
import { getAllSuppliers } from '../../services/suppliers';
import { getExchangeRate } from '../../services/finance';
import {
  getInventoryItemById as getProductById
} from '../../services/inventory';
import {
  getRecipeById as getRecipeByProductId
} from '../../services/products';

const DEFAULT_ITEM = {
  id: '',
  name: '',
  description: '',
  quantity: 1,
  unit: 'szt.',
  price: 0,
  margin: 0,
  basePrice: 0,
  fromPriceList: false,
  isRecipe: false,
  itemType: 'product'
};

const generateItemId = () => {
  return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

const DEFAULT_MARGIN = 20;

export const useOrderFormData = (orderId) => {
  const [loading, setLoading] = useState(!!orderId);
  const [saving, setSaving] = useState(false);
  const [orderData, setOrderData] = useState(() => {
    const defaultOrder = { ...DEFAULT_ORDER };
    if (defaultOrder.items && defaultOrder.items.length > 0) {
      defaultOrder.items = defaultOrder.items.map(item => ({ ...item, id: generateItemId() }));
    }
    return defaultOrder;
  });
  const [customers, setCustomers] = useState([]);
  const [services, setServices] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [validationErrors, setValidationErrors] = useState({});
  const [suppliers, setSuppliers] = useState([]);
  const [refreshingPTs, setRefreshingPTs] = useState(false);
  const [recalculatingTransport, setRecalculatingTransport] = useState(false);
  const [expandedRows, setExpandedRows] = useState({});
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [isImportOrderItemsDialogOpen, setIsImportOrderItemsDialogOpen] = useState(false);

  const { currentUser } = useAuth();
  const { showSuccess, showError, showInfo } = useNotification();
  const { t } = useTranslation('orders');
  const navigate = useNavigate();
  const location = useLocation();

  const fromPO = location.state?.fromPO || false;
  const poId = location.state?.poId || null;
  const poNumber = location.state?.poNumber || null;

  const basicDataRef = useRef(null);
  const productsRef = useRef(null);
  const notesRef = useRef(null);
  const orderSummaryRef = useRef(null);
  const invoicesRef = useRef(null);

  const formSections = [
    { label: t('orderForm.sections.basicData'), ref: basicDataRef },
    { label: t('orderForm.sections.products'), ref: productsRef },
    { label: t('orderForm.sections.notes'), ref: notesRef },
    { label: t('orderForm.sections.orderSummary'), ref: orderSummaryRef },
    { label: t('orderForm.sections.invoices'), ref: invoicesRef },
  ];

  // Weryfikacja zadań produkcyjnych
  const verifyProductionTasks = useCallback(async (orderToVerify) => {
    if (!orderToVerify || !orderToVerify.productionTasks || orderToVerify.productionTasks.length === 0) {
      return orderToVerify;
    }

    try {
      const { getTaskById, updateTask } = await import('../../services/production/productionService');
      const { removeProductionTaskFromOrder, updateProductionTaskInOrder } = await import('../../services/orders');
      
      const verifiedTasks = [];
      const tasksToRemove = [];
      
      for (const task of orderToVerify.productionTasks) {
        try {
          const taskDetails = await getTaskById(task.id);
          
          if (task.orderItemId && (!taskDetails.orderItemId || taskDetails.orderItemId !== task.orderItemId)) {
            await updateTask(task.id, {
              orderItemId: task.orderItemId,
              orderId: orderToVerify.id,
              orderNumber: orderToVerify.orderNumber || null
            }, currentUser?.uid || 'system');
          }
          
          if (task.orderItemId && orderToVerify.items) {
            const matchingItem = orderToVerify.items.find(item => item.id === task.orderItemId);
            
            if (!matchingItem) {
              const alternativeItem = orderToVerify.items.find(item => 
                item.name === task.productName && 
                parseFloat(item.quantity) === parseFloat(task.quantity) &&
                !orderToVerify.productionTasks.some(t => 
                  t.id !== task.id && t.orderItemId === item.id
                )
              );
              
              if (alternativeItem) {
                await updateTask(task.id, {
                  orderItemId: alternativeItem.id,
                  orderId: orderToVerify.id,
                  orderNumber: orderToVerify.orderNumber || null
                }, currentUser?.uid || 'system');
                
                task.orderItemId = alternativeItem.id;
                
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
      
      if (tasksToRemove.length > 0) {
        if (orderToVerify.id) {
          for (const task of tasksToRemove) {
            try {
              await removeProductionTaskFromOrder(orderToVerify.id, task.id);
            } catch (error) {
              console.error(`Błąd podczas usuwania referencji do zadania ${task.id}:`, error);
            }
          }
        }
        
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
  }, [currentUser, showInfo]);

  // Główny useEffect ładujący dane
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        setLoading(true);
        
        if (orderId) {
          const fetchedOrder = await getOrderById(orderId);
          if (cancelled) return;
          
          const orderDate = safeParseDate(fetchedOrder.orderDate);
          const deadline = safeParseDate(fetchedOrder.deadline) || safeParseDate(fetchedOrder.expectedDeliveryDate);
          const deliveryDate = safeParseDate(fetchedOrder.deliveryDate);
          
          if (!fetchedOrder.items || fetchedOrder.items.length === 0) {
            fetchedOrder.items = [{ ...DEFAULT_ORDER_ITEM, id: generateItemId() }];
          } else {
            fetchedOrder.items = fetchedOrder.items.map(item => ({
              ...item,
              id: item.id || generateItemId()
            }));
          }
          
          // Przypisz informacje o zadaniach produkcyjnych
          if (fetchedOrder.productionTasks && fetchedOrder.productionTasks.length > 0 && fetchedOrder.items.length > 0) {
            const { updateTask } = await import('../../services/production/productionService');
            const { query, collection, where, getDocs } = await import('firebase/firestore');
            const { db } = await import('../../services/firebase/config');
            
            const taskIds = fetchedOrder.productionTasks.map(task => task.id);
            const tasksDetailsMap = new Map();
            
            const batchSize = 10;
            for (let i = 0; i < taskIds.length; i += batchSize) {
              const batchIds = taskIds.slice(i, i + batchSize);
              if (batchIds.length > 0) {
                try {
                  const tasksQuery = query(
                    collection(db, 'productionTasks'),
                    where('__name__', 'in', batchIds)
                  );
                  const tasksSnapshot = await getDocs(tasksQuery);
                  
                  tasksSnapshot.docs.forEach(doc => {
                    tasksDetailsMap.set(doc.id, {
                      id: doc.id,
                      ...doc.data()
                    });
                  });
                } catch (error) {
                  console.error(`Błąd podczas pobierania batch zadań produkcyjnych:`, error);
                }
              }
            }
            
            const tasksToUpdate = [];
            const orderUpdates = [];
            
            for (let i = 0; i < fetchedOrder.items.length; i++) {
              const item = fetchedOrder.items[i];
              
              const matchingTask = fetchedOrder.productionTasks.find(task => 
                task.orderItemId && task.orderItemId === item.id
              );
              
              const alternativeTask = !matchingTask ? fetchedOrder.productionTasks.find(task => 
                task.productName === item.name && 
                parseFloat(task.quantity) === parseFloat(item.quantity) &&
                !fetchedOrder.productionTasks.some(t => t.orderItemId === item.id)
              ) : null;
              
              const taskToUse = matchingTask || alternativeTask;
              
              if (taskToUse) {
                const taskDetails = tasksDetailsMap.get(taskToUse.id);
                
                if (taskDetails) {
                  const currentOrderItemId = taskDetails.orderItemId;
                  
                  if (currentOrderItemId !== item.id) {
                    tasksToUpdate.push({
                      taskId: taskToUse.id,
                      updateData: {
                        orderItemId: item.id,
                        orderId: orderId,
                        orderNumber: fetchedOrder.orderNumber || null
                      }
                    });
                    
                    orderUpdates.push({
                      taskId: taskToUse.id,
                      updateData: {
                        orderItemId: item.id
                      }
                    });
                  }
                  
                  const productionCostValue = taskDetails.totalCostWithFactory || taskDetails.totalFullProductionCost || taskDetails.totalMaterialCost || taskToUse.totalCostWithFactory || taskToUse.totalFullProductionCost || taskToUse.totalMaterialCost || 0;
                  
                  fetchedOrder.items[i] = {
                    ...item,
                    productionTaskId: taskToUse.id,
                    productionTaskNumber: taskToUse.moNumber || taskDetails.moNumber,
                    productionStatus: taskToUse.status || taskDetails.status,
                    productionCost: productionCostValue,
                    fullProductionCost: productionCostValue,
                    factoryCostIncluded: (taskDetails.factoryCostTotal || 0) > 0
                  };
                } else {
                  const fallbackCost = taskToUse.totalCostWithFactory || taskToUse.totalFullProductionCost || taskToUse.totalMaterialCost || 0;
                  fetchedOrder.items[i] = {
                    ...item,
                    productionTaskId: taskToUse.id,
                    productionTaskNumber: taskToUse.moNumber,
                    productionStatus: taskToUse.status,
                    productionCost: fallbackCost,
                    fullProductionCost: fallbackCost
                  };
                }
              }
            }
            
            if (tasksToUpdate.length > 0 || orderUpdates.length > 0) {
              try {
                const updatePromises = [];
                
                tasksToUpdate.forEach(({ taskId, updateData }) => {
                  updatePromises.push(
                    updateTask(taskId, updateData, currentUser?.uid || 'system')
                  );
                });
                
                if (orderUpdates.length > 0) {
                  const { updateProductionTaskInOrder } = await import('../../services/orders');
                  orderUpdates.forEach(({ taskId, updateData }) => {
                    updatePromises.push(
                      updateProductionTaskInOrder(orderId, taskId, updateData, currentUser?.uid || 'system')
                    );
                  });
                }
                
                await Promise.allSettled(updatePromises);
              } catch (error) {
                console.error('Błąd podczas równoległych aktualizacji zadań:', error);
              }
            }
          }
          
          if (cancelled) return;
          setOrderData({
            ...fetchedOrder,
            orderDate: ensureDateInputFormat(orderDate),
            deadline: ensureDateInputFormat(deadline),
            deliveryDate: ensureDateInputFormat(deliveryDate),
            globalDiscount: fetchedOrder.globalDiscount || 0
          });
          
          const verifiedOrder = await verifyProductionTasks(fetchedOrder);
          if (cancelled) return;
          
          setOrderData(verifiedOrder);
        }
        
        const [fetchedCustomers, servicesResult, fetchedRecipes, fetchedSuppliers] = await Promise.all([
          getAllCustomers(),
          getInventoryItemsByCategory('Inne'),
          getAllRecipes(),
          getAllSuppliers()
        ]);
        if (cancelled) return;
        
        setCustomers(fetchedCustomers);
        
        const servicesData = servicesResult?.items || [];
        setServices(servicesData);
        
        setRecipes(fetchedRecipes);
        setSuppliers(fetchedSuppliers);
        
        if (fromPO && poNumber) {
          showInfo(`Tworzenie nowego zamówienia klienta powiązanego z zamówieniem zakupowym: ${poNumber}`);
          
          setOrderData(prev => ({
            ...prev,
            notes: prev.notes ? 
              `${prev.notes}\nPowiązane z zamówieniem zakupowym: ${poNumber}` : 
              `Powiązane z zamówieniem zakupowym: ${poNumber}`
          }));
        }
      } catch (error) {
        if (cancelled) return;
        showError('Błąd podczas ładowania danych: ' + error.message);
        console.error('Error fetching data:', error);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };
    
    fetchData();
    return () => { cancelled = true; };
  }, [orderId, showError, fromPO, poId, poNumber, showInfo, currentUser, verifyProductionTasks]);

  // Odświeżanie kosztów produkcji przed zapisaniem
  const refreshProductionTasksForSaving = useCallback(async (orderDataToUpdate) => {
    try {
      if (!orderDataToUpdate.productionTasks || orderDataToUpdate.productionTasks.length === 0) {
        return;
      }

      const { getTaskById } = await import('../../services/production/productionService');
      const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/calculations');
      
      if (orderDataToUpdate.items && orderDataToUpdate.items.length > 0) {
        for (let i = 0; i < orderDataToUpdate.items.length; i++) {
          const item = orderDataToUpdate.items[i];
          
          const associatedTask = orderDataToUpdate.productionTasks.find(task => 
            task.id === item.productionTaskId
          );
          
          if (associatedTask) {
            try {
              const taskDetails = await getTaskById(associatedTask.id);
              
              const fullProductionCost = taskDetails.totalFullProductionCost || associatedTask.totalFullProductionCost || 0;
              const productionCost = taskDetails.totalMaterialCost || associatedTask.totalMaterialCost || 0;
              
              const calculatedFullProductionUnitCost = calculateFullProductionUnitCost(item, fullProductionCost);
              const calculatedProductionUnitCost = calculateProductionUnitCost(item, productionCost);
              
              orderDataToUpdate.items[i] = {
                ...item,
                productionTaskId: associatedTask.id,
                productionTaskNumber: associatedTask.moNumber || taskDetails.moNumber,
                productionStatus: associatedTask.status || taskDetails.status,
                producedQuantity: taskDetails.totalCompletedQuantity || taskDetails.actualQuantity || 0,
                productionCost: productionCost,
                fullProductionCost: fullProductionCost,
                productionUnitCost: calculatedProductionUnitCost,
                fullProductionUnitCost: calculatedFullProductionUnitCost
              };
            } catch (error) {
              console.error(`Błąd podczas pobierania szczegółów zadania ${associatedTask.id}:`, error);
              
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
  }, []);

  // Walidacja formularza
  const validateForm = useCallback(() => {
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
      
      if (item.id && item.itemType === 'product' && !item.isRecipe) {
        const minOrderQuantity = item.minOrderQuantity || 0;
        if (minOrderQuantity > 0 && parseFloat(item.quantity) < minOrderQuantity && item.unit === item.originalUnit) {
          showInfo(`Produkt ${item.name}: Sugerowana minimalna ilość zamówienia to ${minOrderQuantity} ${item.unit}`);
        }
      }
    });
    
    if (!orderData.orderDate) {
      errors.orderDate = 'Data zamówienia jest wymagana';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [orderData, showInfo]);

  // Obliczenia wartości
  const calculateItemTotalValue = useCallback((item) => {
    const itemValue = (parseFloat(item.quantity) || 0) * (parseFloat(item.price) || 0);
    if (item.fromPriceList && parseFloat(item.price || 0) > 0) {
      return itemValue;
    }
    if (item.productionTaskId && item.productionCost !== undefined) {
      return itemValue + parseFloat(item.productionCost || 0);
    }
    return itemValue;
  }, []);

  const calculateTotalItemsValue = useCallback(() => {
    return orderData.items.reduce((sum, item) => {
      return sum + calculateItemTotalValue(item);
    }, 0);
  }, [orderData.items, calculateItemTotalValue]);

  const calculateSubtotal = useCallback(() => {
    return orderData.items.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity) || 0;
      const price = parseFloat(item.price) || 0;
      return sum + (quantity * price);
    }, 0);
  }, [orderData.items]);

  const calculateTotal = useCallback(() => {
    const subtotal = calculateTotalItemsValue();
    const globalDiscount = parseFloat(orderData.globalDiscount) || 0;
    const discountMultiplier = (100 - globalDiscount) / 100;
    return subtotal * discountMultiplier;
  }, [calculateTotalItemsValue, orderData.globalDiscount]);

  const calculateDiscountAmount = useCallback(() => {
    const subtotal = calculateTotalItemsValue();
    const globalDiscount = parseFloat(orderData.globalDiscount) || 0;
    return subtotal * (globalDiscount / 100);
  }, [calculateTotalItemsValue, orderData.globalDiscount]);

  // Obsługa zapisu
  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    const isValid = validateForm();
    if (!isValid) {
      window.scrollTo(0, 0);
      return;
    }
    
    try {
      setSaving(true);
      
      const verifiedOrderData = await verifyProductionTasks(orderData);
      await refreshProductionTasksForSaving(verifiedOrderData);
      
      const orderToSave = {
        ...verifiedOrderData,
        items: verifiedOrderData.items.map(item => ({ ...item })),
        totalValue: calculateTotal(),
        orderDate: verifiedOrderData.orderDate ? new Date(verifiedOrderData.orderDate) : new Date(),
        expectedDeliveryDate: verifiedOrderData.deadline ? new Date(verifiedOrderData.deadline) : null,
        deadline: verifiedOrderData.deadline ? new Date(verifiedOrderData.deadline) : null,
        deliveryDate: verifiedOrderData.deliveryDate ? new Date(verifiedOrderData.deliveryDate) : null
      };

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
        navigate('/orders');
      }
    } catch (error) {
      console.error('Błąd podczas zapisywania zamówienia:', error);
      showError(`Wystąpił błąd: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }, [orderData, orderId, currentUser, navigate, showSuccess, showError, validateForm, verifyProductionTasks, refreshProductionTasksForSaving, calculateTotal]);

  // Obsługa zmian pól
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    
    if (['orderDate', 'deadline', 'deliveryDate'].includes(name)) {
      setOrderData(prev => ({ ...prev, [name]: value }));
    } else if (name === 'invoiceDate' && value) {
      setOrderData(prev => ({ ...prev, [name]: value }));
      
      const currency = orderData.shippingCurrency;
      if (currency && currency !== 'EUR') {
        try {
          const invoiceDate = new Date(value);
          const rateFetchDate = new Date(invoiceDate);
          rateFetchDate.setDate(rateFetchDate.getDate() - 1);
          
          getExchangeRate(currency, 'EUR', rateFetchDate)
            .then(rate => {
              if (rate > 0) {
                const originalValue = orderData.shippingCostOriginal || orderData.shippingCost || 0;
                const convertedValue = originalValue * rate;
                
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
  }, [validationErrors, orderData.shippingCurrency, orderData.shippingCostOriginal, orderData.shippingCost]);

  // Obsługa klienta
  const handleCustomerChange = useCallback((e, selectedCustomer) => {
    if (selectedCustomer) {
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
  }, [validationErrors]);

  const handleCustomerDetailChange = useCallback((e) => {
    const { name, value } = e.target;
    setOrderData(prev => ({
      ...prev,
      customer: {
        ...prev.customer,
        [name.replace('customer_', '')]: value
      }
    }));
  }, []);

  const handleAddCustomer = useCallback(() => {
    setOrderData(prev => ({
      ...prev,
      customer: { ...DEFAULT_ORDER.customer }
    }));
    setIsCustomerDialogOpen(true);
  }, []);

  const handleCloseCustomerDialog = useCallback(() => {
    setIsCustomerDialogOpen(false);
  }, []);

  const handleSaveNewCustomer = useCallback(async () => {
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
  }, [orderData.customer, currentUser, showSuccess, showError]);

  // Przeliczanie transportu z CMR
  const handleRecalculateTransportService = useCallback(async () => {
    if (!orderId) {
      showError('Zapisz zamówienie przed przeliczeniem usługi transportowej');
      return;
    }
    
    try {
      setRecalculatingTransport(true);
      
      const { recalculateTransportServiceForOrder } = await import('../../services/logistics');
      const result = await recalculateTransportServiceForOrder(orderId, currentUser.uid);
      
      if (result.success) {
        if (result.action === 'none') {
          showInfo('Brak powiązanych CMR z paletami dla tego zamówienia');
        } else {
          showSuccess(
            `Usługa transportowa ${result.action === 'added' ? 'dodana' : 'zaktualizowana'}: ${result.palletsCount} palet z ${result.cmrCount} CMR`
          );
        }
        
        if (orderId) {
          const updatedOrder = await getOrderById(orderId);
          setOrderData(updatedOrder);
        }
      }
    } catch (error) {
      console.error('Błąd podczas przeliczania usługi transportowej:', error);
      showError('Nie udało się przeliczyć usługi transportowej: ' + error.message);
    } finally {
      setRecalculatingTransport(false);
    }
  }, [orderId, currentUser, showError, showInfo, showSuccess]);

  // Obsługa pozycji zamówienia
  const handleItemChange = useCallback((index, field, value) => {
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
  }, [orderData.items, validationErrors]);

  const handleProductSelect = useCallback(async (index, product, type = 'product') => {
    try {
      if (!product) {
        return;
      }
      
      const itemType = type;
      let id = generateItemId();
      let name = product.name;
      let unit = product.unit || 'szt.';
      let basePrice = 0;
      let price = 0;
      let margin = DEFAULT_MARGIN;
      let isRecipe = type === 'recipe';
      let fromPriceList = false;
      let recipeId = isRecipe ? product.id : null;
      let serviceId = type === 'service' ? product.id : null;
      let productId = (!isRecipe && type !== 'service') ? product.id : null;
      let minOrderQuantity = 0;
      let lastUsageInfo = null;
      let priceListNotes = '';
      
      if (orderData.customer?.id) {
        try {
          const { getPriceListItemForCustomerProduct } = await import('../../services/products');
          
          const priceListItem = await getPriceListItemForCustomerProduct(orderData.customer.id, product.id, isRecipe);
          
          if (priceListItem) {
            price = priceListItem.price;
            fromPriceList = true;
            
            if (type === 'service' && priceListItem.notes) {
              priceListNotes = priceListItem.notes;
            }
          }
        } catch (error) {
          console.error('Błąd podczas pobierania ceny z listy cenowej:', error);
        }
      }
      
      if (!isRecipe) {
        try {
          const productDetails = await getProductById(product.id);
          if (productDetails) {
            unit = productDetails.unit || unit;
            minOrderQuantity = productDetails.minOrderQuantity || 0;
            if (!fromPriceList) {
              basePrice = productDetails.standardPrice || 0;
              const calculatedPrice = basePrice * (1 + margin / 100);
              price = parseFloat(calculatedPrice.toFixed(2));
            }
          }
        } catch (error) {
          console.error('Błąd podczas pobierania szczegółów produktu/usługi:', error);
        }
      } else {
        if (!fromPriceList) {
          try {
            let recipe = await getRecipeById(product.id);
            
            if (!recipe) {
              recipe = await getRecipeByProductId(product.id);
            }
            
            if (recipe) {
              const cost = await calculateProductionCost(recipe);
              basePrice = cost.totalCost;
              
              const calculatedPrice = basePrice * (1 + margin / 100);
              price = parseFloat(calculatedPrice.toFixed(2));
              
              try {
                lastUsageInfo = await getLastRecipeUsageInfo(recipe.id);
                
                if (!lastUsageInfo || !lastUsageInfo.cost || lastUsageInfo.cost === 0) {
                  const { calculateEstimatedMaterialsCost } = await import('../../utils/calculations');
                  const estimatedCost = await calculateEstimatedMaterialsCost(recipe);
                  
                  if (estimatedCost.totalCost > 0) {
                    if (lastUsageInfo) {
                      lastUsageInfo.cost = estimatedCost.totalCost;
                      lastUsageInfo.estimatedCost = true;
                      lastUsageInfo.costDetails = estimatedCost.details;
                    } else {
                      lastUsageInfo = {
                        orderId: null,
                        orderNumber: 'Szacowany',
                        orderDate: new Date(),
                        customerName: 'Kalkulacja kosztów',
                        quantity: 1,
                        price: estimatedCost.totalCost,
                        cost: estimatedCost.totalCost,
                        unit: recipe.unit || 'szt.',
                        totalValue: estimatedCost.totalCost,
                        estimatedCost: true,
                        costDetails: estimatedCost.details
                      };
                    }
                  }
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
        serviceId,
        productId,
        itemType,
        minOrderQuantity,
        originalUnit: unit,
        lastUsageInfo: lastUsageInfo,
        description: priceListNotes || updatedItems[index].description || ''
      };
      
      setOrderData(prev => ({
        ...prev,
        items: updatedItems,
      }));
      
      const updatedErrors = { ...validationErrors };
      delete updatedErrors[`item_${index}_name`];
      setValidationErrors(updatedErrors);
      
    } catch (error) {
      console.error('Błąd podczas wyboru produktu/usługi:', error);
      showError(`Wystąpił błąd: ${error.message}`);
    }
  }, [orderData.items, orderData.customer, validationErrors, showError]);

  const addItem = useCallback(() => {
    setOrderData(prev => ({
      ...prev,
      items: [...prev.items, { ...DEFAULT_ITEM, id: generateItemId() }]
    }));
  }, []);

  const handleImportOrderItems = useCallback((importedItems) => {
    if (!importedItems || importedItems.length === 0) return;
    const nonEmptyItems = orderData.items.filter((item) => item.name && item.name.trim() !== '');
    setOrderData(prev => ({
      ...prev,
      items: [...nonEmptyItems, ...importedItems]
    }));
    showSuccess(`Dodano ${importedItems.length} pozycji z pliku CSV`);
  }, [orderData.items, showSuccess]);

  const removeItem = useCallback((index) => {
    const updatedItems = [...orderData.items];
    updatedItems.splice(index, 1);
    
    if (updatedItems.length === 0) {
      updatedItems.push({ ...DEFAULT_ITEM, id: generateItemId() });
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
  }, [orderData.items, validationErrors]);

  const toggleExpandRow = useCallback((index) => {
    setExpandedRows(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  }, []);

  // DnD
  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setOrderData((prev) => {
      const oldIndex = prev.items.findIndex((item) => item.id === active.id);
      const newIndex = prev.items.findIndex((item) => item.id === over.id);

      return {
        ...prev,
        items: arrayMove(prev.items, oldIndex, newIndex),
      };
    });
  }, []);

  // Odświeżanie zadań produkcyjnych
  const refreshProductionTasks = useCallback(async () => {
    try {
      setLoading(true);
      
      const refreshedOrderData = await getOrderById(orderId);
      
      const { getTaskById } = await import('../../services/production/productionService');
      const { calculateFullProductionUnitCost, calculateProductionUnitCost } = await import('../../utils/calculations');
      
      const updatedItems = [...refreshedOrderData.items];
      
      if (refreshedOrderData.productionTasks && refreshedOrderData.productionTasks.length > 0) {
        for (let i = 0; i < updatedItems.length; i++) {
          const item = updatedItems[i];
          
          const taskToUse = refreshedOrderData.productionTasks.find(task => 
            task.id === item.productionTaskId || 
            (task.productName === item.name && task.quantity == item.quantity)
          );
          
          if (taskToUse) {
            try {
              const taskDetails = await getTaskById(taskToUse.id);
              
              const fullProductionCost = taskDetails.totalFullProductionCost || taskToUse.totalFullProductionCost || 0;
              const productionCost = taskDetails.totalMaterialCost || taskToUse.totalMaterialCost || 0;
              
              const calculatedFullProductionUnitCost = calculateFullProductionUnitCost(item, fullProductionCost);
              const calculatedProductionUnitCost = calculateProductionUnitCost(item, productionCost);
              
              updatedItems[i] = {
                ...item,
                productionTaskId: taskToUse.id,
                productionTaskNumber: taskToUse.moNumber || taskDetails.moNumber,
                productionStatus: taskToUse.status || taskDetails.status,
                producedQuantity: taskDetails.totalCompletedQuantity || taskDetails.actualQuantity || 0,
                productionCost: productionCost,
                fullProductionCost: fullProductionCost,
                productionUnitCost: calculatedProductionUnitCost,
                fullProductionUnitCost: calculatedFullProductionUnitCost
              };
            } catch (error) {
              console.error(`Błąd podczas pobierania szczegółów zadania ${taskToUse.id}:`, error);
              
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
          }
        }
        
        setOrderData(prev => ({
          ...prev,
          items: updatedItems,
          productionTasks: refreshedOrderData.productionTasks
        }));
        
        if (orderId) {
          try {
            const orderToUpdate = {
              ...refreshedOrderData,
              items: updatedItems
            };
            
            await updateOrder(orderId, orderToUpdate, currentUser.uid);
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
  }, [orderId, currentUser, showSuccess, showError]);

  // Odświeżanie ceny jednostkowej pozycji
  const refreshItemPrice = useCallback(async (index) => {
    try {
      const item = orderData.items[index];
      if (!item || !item.id) {
        showError("Nie można odświeżyć ceny - brak identyfikatora pozycji");
        return;
      }
      
      let price = 0;
      let fromPriceList = false;
      let productId = null;
      
      if (item.itemType === 'recipe' || item.isRecipe) {
        productId = item.recipeId;
      } else if (item.itemType === 'service') {
        productId = item.serviceId;
      } else {
        productId = item.productId;
        if (!productId) {
          showError("Nie można odświeżyć ceny dla starych pozycji - brak identyfikatora produktu. Usuń pozycję i dodaj ponownie.");
          return;
        }
      }
      
      if (!productId) {
        showError("Nie można odświeżyć ceny - brak identyfikatora produktu/usługi/receptury");
        return;
      }
      
      if (orderData.customer?.id) {
        try {
          const priceListItem = await getPriceForCustomerProduct(orderData.customer.id, productId, item.isRecipe);
          
          if (priceListItem) {
            price = priceListItem;
            fromPriceList = true;
          }
        } catch (error) {
          console.error('Błąd podczas pobierania ceny z listy cenowej:', error);
        }
      }
      
      if (!fromPriceList) {
        if (!item.isRecipe && item.itemType !== 'recipe') {
          try {
            const productDetails = await getProductById(productId);
            if (productDetails) {
              const basePrice = productDetails.standardPrice || 0;
              const marginVal = item.margin || DEFAULT_MARGIN;
              
              const calculatedPrice = basePrice * (1 + marginVal / 100);
              price = parseFloat(calculatedPrice.toFixed(2));
            }
          } catch (error) {
            console.error('Błąd podczas pobierania szczegółów produktu/usługi:', error);
          }
        } else {
          try {
            const recipe = await getRecipeById(productId);
            
            if (recipe) {
              const cost = await calculateProductionCost(recipe);
              const basePrice = cost.totalCost;
              const marginVal = item.margin || 0;
              
              const calculatedPrice = basePrice * (1 + marginVal / 100);
              price = parseFloat(calculatedPrice.toFixed(2));
              
              try {
                const newLastUsageInfo = await getLastRecipeUsageInfo(recipe.id);
                if (newLastUsageInfo) {
                  const updatedItems = [...orderData.items];
                  updatedItems[index] = {
                    ...updatedItems[index],
                    lastUsageInfo: newLastUsageInfo
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
  }, [orderData.items, orderData.customer, showSuccess, showError]);

  // Formatowanie daty dla wyświetlenia
  const formatDateToDisplay = useCallback((date) => {
    if (!date) return '';
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('pl-PL');
  }, []);

  // Formatowanie kwoty waluty
  const formatCurrencyLocal = useCallback((amount, currency = 'EUR', precision = 2, forceDecimals = false) => {
    if (amount === undefined || amount === null) return '';
    return new Intl.NumberFormat('pl-PL', { 
      style: 'currency', 
      currency: currency,
      minimumFractionDigits: forceDecimals ? precision : 0,
      maximumFractionDigits: precision 
    }).format(amount);
  }, []);

  return {
    // Stany
    loading,
    saving,
    orderData,
    setOrderData,
    customers,
    services,
    recipes,
    validationErrors,
    suppliers,
    refreshingPTs,
    recalculatingTransport,
    expandedRows,
    isCustomerDialogOpen,
    isImportOrderItemsDialogOpen,
    setIsImportOrderItemsDialogOpen,

    // Refy i sekcje
    basicDataRef,
    productsRef,
    notesRef,
    orderSummaryRef,
    invoicesRef,
    formSections,

    // Kontekst
    currentUser,
    navigate,
    t,
    ORDER_STATUSES,

    // Funkcje obsługi formularza
    handleSubmit,
    handleChange,
    handleCustomerChange,
    handleCustomerDetailChange,
    handleAddCustomer,
    handleCloseCustomerDialog,
    handleSaveNewCustomer,
    handleRecalculateTransportService,

    // Funkcje obsługi pozycji
    handleItemChange,
    handleProductSelect,
    addItem,
    handleImportOrderItems,
    removeItem,
    toggleExpandRow,
    handleDragEnd,

    // Funkcje odświeżania
    refreshProductionTasks,
    refreshItemPrice,

    // Obliczenia
    calculateItemTotalValue,
    calculateTotalItemsValue,
    calculateSubtotal,
    calculateTotal,
    calculateDiscountAmount,

    // Formatowanie
    formatDateToDisplay,
    formatCurrency: formatCurrencyLocal,

    // Stałe
    ensureDateInputFormat,
  };
};
