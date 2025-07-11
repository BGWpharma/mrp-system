import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { 
  Container, Typography, Paper, Button, Box, Chip, Grid, Divider, 
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  FormControl, InputLabel, Select, MenuItem, TextField, CircularProgress, IconButton,
  List, ListItem, ListItemText, ListItemIcon, Collapse, Tooltip, Menu
} from '@mui/material';
import { 
  Edit as EditIcon, 
  Delete as DeleteIcon, 
  Download as DownloadIcon,
  Article as ArticleIcon,
  Description as DescriptionIcon,
  Inventory as InventoryIcon,
  ArrowBack as ArrowBackIcon,
  Person as PersonIcon,
  LocationOn as LocationOnIcon,
  Email as EmailIcon,
  Phone as PhoneIcon,
  MoreVert as MoreVertIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Label as LabelIcon,
  Add as AddIcon,
  ShoppingCart as ShoppingCartIcon,
  AttachFile as AttachFileIcon,
  Image as ImageIcon,
  PictureAsPdf as PdfIcon,
  Assignment as AssignmentIcon,
  LocalShipping as LocalShippingIcon
} from '@mui/icons-material';
import { format, parseISO, isValid } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  getPurchaseOrderById,
  deletePurchaseOrder,
  updatePurchaseOrderStatus,
  updatePurchaseOrderPaymentStatus,
  updatePurchaseOrder,
  updateBatchesForPurchaseOrder,
  updateBatchBasePricesForPurchaseOrder,
  PURCHASE_ORDER_STATUSES,
  PURCHASE_ORDER_PAYMENT_STATUSES,
  translateStatus,
  translatePaymentStatus
} from '../../services/purchaseOrderService';
import { getBatchesByPurchaseOrderId, getInventoryBatch, getWarehouseById } from '../../services/inventoryService';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { db } from '../../services/firebase/config';
import { updateDoc, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { formatCurrency } from '../../utils/formatUtils';
import { getUsersDisplayNames } from '../../services/userService';
import { createPurchaseOrderPdfGenerator } from './PurchaseOrderPdfGenerator';

const PurchaseOrderDetails = ({ orderId }) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const [loading, setLoading] = useState(true);
  const [purchaseOrder, setPurchaseOrder] = useState(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');
  const [receiveDialogOpen, setReceiveDialogOpen] = useState(false);
  const [itemToReceive, setItemToReceive] = useState(null);
  const [invoiceLinkDialogOpen, setInvoiceLinkDialogOpen] = useState(false);
  const [invoiceLink, setInvoiceLink] = useState('');
  const [userNames, setUserNames] = useState({});
  const [menuAnchorRef, setMenuAnchorRef] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [relatedBatches, setRelatedBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [expandedItems, setExpandedItems] = useState({});
  const [tempInvoiceLinks, setTempInvoiceLinks] = useState([]);
  const [warehouseNames, setWarehouseNames] = useState({});
  const [paymentStatusDialogOpen, setPaymentStatusDialogOpen] = useState(false);
  const [newPaymentStatus, setNewPaymentStatus] = useState('');
  const [supplierPricesDialogOpen, setSupplierPricesDialogOpen] = useState(false);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState(null);
  
  // Stany dla odpowiedzi formularzy rozładunku
  const [unloadingFormResponses, setUnloadingFormResponses] = useState([]);
  const [unloadingFormResponsesLoading, setUnloadingFormResponsesLoading] = useState(false);
  
  useEffect(() => {
    const fetchPurchaseOrder = async () => {
      try {
        const data = await getPurchaseOrderById(orderId);
        setPurchaseOrder(data);
        
        // Jeśli zamówienie ma historię zmian statusu, pobierz dane użytkowników
        if (data.statusHistory && data.statusHistory.length > 0) {
          const userIds = data.statusHistory.map(change => change.changedBy).filter(id => id);
          const uniqueUserIds = [...new Set(userIds)];
          const names = await getUsersDisplayNames(uniqueUserIds);
          setUserNames(names);
        }
        
        // Pobierz powiązane LOTy
        await fetchRelatedBatches(orderId);
        
        // Pobierz odpowiedzi formularzy rozładunku dla tego PO
        if (data && data.number) {
          console.log('🚛 PO Document loaded with number:', data.number, '(type:', typeof data.number, ')');
          fetchUnloadingFormResponses(data.number);
        } else {
          console.log('❌ No PO number found in document data:', data);
        }
      } catch (error) {
        showError('Błąd podczas pobierania danych zamówienia: ' + error.message);
      } finally {
        setLoading(false);
      }
    };
    
    if (orderId) {
      fetchPurchaseOrder();
    }
    
    // Sprawdź, czy należy odświeżyć dane po powrocie z innej strony
    const refreshId = localStorage.getItem('refreshPurchaseOrder');
    if (refreshId === orderId) {
      // Usuń flagę, aby nie odświeżać wielokrotnie
      localStorage.removeItem('refreshPurchaseOrder');
      // Odśwież dane po krótkim opóźnieniu, aby aplikacja zdążyła się załadować
      setTimeout(() => {
        fetchPurchaseOrder();
        showSuccess('Dane zamówienia zostały zaktualizowane po przyjęciu towaru');
      }, 500);
    }
  }, [orderId, showError]);
  
  const fetchRelatedBatches = async (poId) => {
    try {
      setLoadingBatches(true);
      const batches = await getBatchesByPurchaseOrderId(poId);
      
      const warehouseIds = [...new Set(batches
        .filter(batch => batch.warehouseId)
        .map(batch => batch.warehouseId))];
      
      const warehouseData = {};
      for (const whId of warehouseIds) {
        try {
          const warehouse = await getWarehouseById(whId);
          if (warehouse) {
            warehouseData[whId] = warehouse.name || whId;
          }
        } catch (error) {
          console.error(`Błąd podczas pobierania informacji o magazynie ${whId}:`, error);
          warehouseData[whId] = whId;
        }
      }
      
      setWarehouseNames(warehouseData);
      
      const batchesWithWarehouseNames = batches.map(batch => {
        if (batch.warehouseId && warehouseData[batch.warehouseId]) {
          return { 
            ...batch, 
            warehouseName: warehouseData[batch.warehouseId]
          };
        }
        return batch;
      });
      
      setRelatedBatches(batchesWithWarehouseNames);
      setLoadingBatches(false);
    } catch (error) {
      console.error('Błąd podczas pobierania powiązanych partii:', error);
      setLoadingBatches(false);
    }
  };
  
  const getBatchesByItemId = (itemId) => {
    if (!relatedBatches || relatedBatches.length === 0) return [];
    
    return relatedBatches.filter(batch => {
      return (
        (batch.purchaseOrderDetails && batch.purchaseOrderDetails.itemPoId === itemId) ||
        (batch.sourceDetails && batch.sourceDetails.itemPoId === itemId) ||
        (itemId === undefined)
      );
    });
  };
  
  const refreshBatches = async () => {
    try {
      setLoadingBatches(true);
      const batches = await getBatchesByPurchaseOrderId(orderId);
      setRelatedBatches(batches);
      showSuccess('Lista partii została odświeżona');
    } catch (error) {
      console.error('Błąd podczas odświeżania partii:', error);
      showError('Nie udało się odświeżyć listy partii: ' + error.message);
    } finally {
      setLoadingBatches(false);
    }
  };

  // Funkcja pobierania odpowiedzi formularzy rozładunku dla danego PO
  const fetchUnloadingFormResponses = async (poNumber) => {
    if (!poNumber) return;
    
    setUnloadingFormResponsesLoading(true);
    try {
      console.log('🔍 Searching for unloading forms with PO number:', poNumber);
      
      // Sprawdź różne warianty numeru PO
      const poVariants = [
        poNumber,                     // Oryginalny numer (np. "PO-123")
        poNumber.replace('PO-', ''),  // Bez prefiksu (np. "123")
        `PO-${poNumber}`,            // Z dodatkowym prefiksem (na wszelki wypadek)
      ].filter((variant, index, array) => array.indexOf(variant) === index); // Usuń duplikaty
      
      console.log('🔍 Checking PO variants:', poVariants);
      
      let unloadingData = [];
      
      // Spróbuj wszystkie warianty
      for (const variant of poVariants) {
        const unloadingQuery = query(
          collection(db, 'Forms/RozladunekTowaru/Odpowiedzi'), 
          where('poNumber', '==', variant)
        );
        const unloadingSnapshot = await getDocs(unloadingQuery);
        
        console.log(`📄 Found ${unloadingSnapshot.docs.length} unloading form responses for variant: "${variant}"`);
        
        if (unloadingSnapshot.docs.length > 0) {
          const variantData = unloadingSnapshot.docs.map(doc => {
            const data = doc.data();
            console.log('📝 Processing document:', doc.id, 'with PO:', data.poNumber);
            return {
              id: doc.id,
              ...data,
              fillDate: data.fillDate?.toDate(),
              unloadingDate: data.unloadingDate?.toDate(),
              formType: 'unloading',
              // Obsługa selectedItems z bezpieczną konwersją dat ważności
              selectedItems: data.selectedItems?.map(item => {
                let convertedExpiryDate = item.expiryDate;
                
                // Bezpiecznie konwertuj datę ważności
                if (item.expiryDate) {
                  try {
                    if (item.expiryDate.toDate && typeof item.expiryDate.toDate === 'function') {
                      // Firestore Timestamp
                      convertedExpiryDate = item.expiryDate.toDate();
                    } else if (typeof item.expiryDate === 'string') {
                      // String ISO lub inny format
                      convertedExpiryDate = new Date(item.expiryDate);
                      // Sprawdź czy data jest prawidłowa
                      if (isNaN(convertedExpiryDate.getTime())) {
                        console.warn('Nieprawidłowa data ważności:', item.expiryDate);
                        convertedExpiryDate = null;
                      }
                    } else if (item.expiryDate instanceof Date) {
                      // Już jest Date
                      convertedExpiryDate = item.expiryDate;
                    }
                  } catch (error) {
                    console.error('Błąd konwersji daty ważności:', error, item.expiryDate);
                    convertedExpiryDate = null;
                  }
                }
                
                return {
                  ...item,
                  expiryDate: convertedExpiryDate
                };
              }) || []
            };
          });
          unloadingData.push(...variantData);
        }
      }
      
      // Jeśli nadal nic nie znaleziono, pokaż wszystkie numery PO w kolekcji dla debugowania
      if (unloadingData.length === 0) {
        console.log('🔍 No results found for any variant. Let me check all PO numbers in the collection...');
        const allDocsQuery = query(collection(db, 'Forms/RozladunekTowaru/Odpowiedzi'));
        const allDocsSnapshot = await getDocs(allDocsQuery);
        console.log('📋 All PO numbers in collection:');
        allDocsSnapshot.docs.forEach((doc, index) => {
          const data = doc.data();
          console.log(`${index + 1}. PO: "${data.poNumber}" (type: ${typeof data.poNumber})`);
        });
      }

      // Sortowanie odpowiedzi od najnowszych (według daty wypełnienia)
      const sortByFillDate = (a, b) => {
        const dateA = a.fillDate || new Date(0);
        const dateB = b.fillDate || new Date(0);
        return new Date(dateB) - new Date(dateA); // Od najnowszych
      };

      setUnloadingFormResponses(unloadingData.sort(sortByFillDate));
      console.log('✅ Set', unloadingData.length, 'unloading form responses');
    } catch (error) {
      console.error('Błąd podczas pobierania odpowiedzi formularzy rozładunku:', error);
      setUnloadingFormResponses([]);
    } finally {
      setUnloadingFormResponsesLoading(false);
    }
  };
  
  const handleBatchClick = async (batchId, itemId) => {
    if (!batchId) return;
    
    if (batchId.toString().startsWith('temp-')) {
      showError('Nie można wyświetlić szczegółów dla tymczasowej partii, która nie została jeszcze zapisana w bazie danych.');
      return;
    }
    
    if (itemId) {
      navigate(`/inventory/${itemId}/batches`);
      return;
    }
    
    try {
      setLoadingBatches(true);
      const batch = await getInventoryBatch(batchId);
      setLoadingBatches(false);
      
      if (batch && batch.itemId) {
        navigate(`/inventory/${batch.itemId}/batches`);
      } else {
        navigate(`/inventory/batch/${batchId}`);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania danych partii:', error);
      setLoadingBatches(false);
      
      if (error.message?.includes('nie istnieje')) {
        showError('Nie znaleziono partii w bazie danych.');
      } else {
        navigate(`/inventory/batch/${batchId}`);
      }
    }
  };
  
  const toggleItemExpansion = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };
  
  const getUserName = (userId) => {
    return userNames[userId] || userId || 'System';
  };
  
  // Funkcja do bezpiecznego formatowania dat - obsługuje różne formaty
  const safeFormatDate = (date, formatString = 'dd.MM.yyyy') => {
    if (!date) return 'Brak daty';
    
    try {
      let dateObj;
      
      // Obsługa różnych typów dat
      if (date instanceof Date) {
        dateObj = date;
      } else if (typeof date === 'string') {
        // Dla stringów ISO
        dateObj = parseISO(date);
      } else if (date && typeof date === 'object' && date.toDate) {
        // Dla Firestore Timestamp
        dateObj = date.toDate();
      } else if (date && typeof date === 'object' && date.seconds) {
        // Dla Firestore Timestamp w formacie { seconds, nanoseconds }
        dateObj = new Date(date.seconds * 1000);
      } else {
        // Próba konwersji bezpośredniej
        dateObj = new Date(date);
      }
      
      // Sprawdź czy data jest prawidłowa
      if (!isValid(dateObj)) {
        console.warn('Nieprawidłowa data:', date);
        return 'Nieprawidłowa data';
      }
      
      return format(dateObj, formatString, { locale: pl });
    } catch (error) {
      console.error('Błąd podczas formatowania daty:', error, 'Data:', date);
      return 'Błąd daty';
    }
  };
  
  // Funkcja sprawdzająca czy pozycja PO znajduje się w odpowiedziach formularzy rozładunku
  const isItemInUnloadingForms = (item) => {
    if (!unloadingFormResponses || unloadingFormResponses.length === 0) {
      return false;
    }
    
    // Sprawdzamy wszystkie odpowiedzi formularzy rozładunku
    for (const response of unloadingFormResponses) {
      if (response.selectedItems && response.selectedItems.length > 0) {
        // Sprawdzamy czy nazwa produktu z PO znajduje się w pozycjach dostarczonej w formularzu
        const foundItem = response.selectedItems.find(selectedItem => {
          // Porównujemy nazwy produktów (ignorując wielkość liter i białe znaki)
          const itemName = (item.name || '').toLowerCase().trim();
          const selectedItemName = (selectedItem.productName || '').toLowerCase().trim();
          
          return itemName && selectedItemName && itemName === selectedItemName;
        });
        
        if (foundItem) {
          return true;
        }
      }
    }
    
    return false;
  };
  
  // Funkcja znajdująca informację o dacie ważności dla pozycji PO w odpowiedziach formularzy rozładunku
  const getExpiryInfoFromUnloadingForms = (item) => {
    if (!unloadingFormResponses || unloadingFormResponses.length === 0) {
      return { expiryDate: null, noExpiryDate: false };
    }
    
    // Sprawdzamy wszystkie odpowiedzi formularzy rozładunku od najnowszych
    for (const response of unloadingFormResponses) {
      if (response.selectedItems && response.selectedItems.length > 0) {
        // Sprawdzamy czy nazwa produktu z PO znajduje się w pozycjach dostarczonej w formularzu
        const foundItem = response.selectedItems.find(selectedItem => {
          // Porównujemy nazwy produktów (ignorując wielkość liter i białe znaki)
          const itemName = (item.name || '').toLowerCase().trim();
          const selectedItemName = (selectedItem.productName || '').toLowerCase().trim();
          
          return itemName && selectedItemName && itemName === selectedItemName;
        });
        
        // Jeśli znaleziono pozycję
        if (foundItem) {
          // Sprawdź czy zaznaczono "nie dotyczy"
          if (foundItem.noExpiryDate === true) {
            console.log(`🚫 Pozycja "${item.name}" ma zaznaczone "nie dotyczy" dla daty ważności`);
            return { expiryDate: null, noExpiryDate: true };
          }
          
          // Sprawdź czy ma datę ważności i czy jest prawidłowa
          if (foundItem.expiryDate) {
            // Walidacja daty ważności
            let validDate = null;
            try {
              if (foundItem.expiryDate instanceof Date && !isNaN(foundItem.expiryDate.getTime())) {
                validDate = foundItem.expiryDate;
              } else if (typeof foundItem.expiryDate === 'string') {
                const parsedDate = new Date(foundItem.expiryDate);
                if (!isNaN(parsedDate.getTime())) {
                  validDate = parsedDate;
                }
              } else if (foundItem.expiryDate.toDate && typeof foundItem.expiryDate.toDate === 'function') {
                const convertedDate = foundItem.expiryDate.toDate();
                if (!isNaN(convertedDate.getTime())) {
                  validDate = convertedDate;
                }
              }
            } catch (error) {
              console.error('Błąd walidacji daty ważności:', error, foundItem.expiryDate);
            }
            
            if (validDate) {
              console.log(`📅 Znaleziono prawidłową datę ważności dla pozycji "${item.name}":`, validDate);
              return { expiryDate: validDate, noExpiryDate: false };
            } else {
              console.warn(`⚠️ Nieprawidłowa data ważności dla pozycji "${item.name}":`, foundItem.expiryDate);
            }
          }
        }
      }
    }
    
    return { expiryDate: null, noExpiryDate: false };
  };

  // Kompatybilność wsteczna - funkcja zwracająca tylko datę ważności
  const getExpiryDateFromUnloadingForms = (item) => {
    const expiryInfo = getExpiryInfoFromUnloadingForms(item);
    return expiryInfo.expiryDate;
  };
  
  if (loading) {
    return <Typography>Ładowanie szczegółów zamówienia...</Typography>;
  }
  
  if (!purchaseOrder) {
    return <Typography>Nie znaleziono zamówienia</Typography>;
  }
  
  const handleEditClick = () => {
    navigate(`/purchase-orders/${orderId}/edit`);
  };
  
  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
    setMenuOpen(false);
  };
  
  const handleDeleteConfirm = async () => {
    try {
      await deletePurchaseOrder(orderId);
      showSuccess('Zamówienie zostało usunięte');
      navigate('/purchase-orders');
    } catch (error) {
      showError('Błąd podczas usuwania zamówienia: ' + error.message);
    }
    setDeleteDialogOpen(false);
  };
  
  const handleStatusClick = () => {
    setNewStatus(purchaseOrder.status);
    setStatusDialogOpen(true);
  };
  
  const handleStatusUpdate = async () => {
    try {
      // Sprawdź czy status zmienia się na "completed" i czy zamówienie ma pozycje i dostawcę
      if (newStatus === 'completed' && 
          purchaseOrder?.items?.length > 0 && 
          purchaseOrder?.supplier?.id &&
          purchaseOrder.status !== 'completed') {
        
        // Zapisz dane do oczekującej aktualizacji i pokaż dialog
        setPendingStatusUpdate({
          orderId: orderId,
          newStatus: newStatus,
          currentStatus: purchaseOrder.status
        });
        setSupplierPricesDialogOpen(true);
        setStatusDialogOpen(false);
        return;
      }
      
      // Standardowa aktualizacja statusu (bez pytania o ceny dostawców)
      await updatePurchaseOrderStatus(orderId, newStatus, currentUser.uid);
      setStatusDialogOpen(false);
      
      // Odśwież dane zamówienia
      const updatedOrder = await getPurchaseOrderById(orderId);
      setPurchaseOrder(updatedOrder);
      
      showSuccess('Status zamówienia został zaktualizowany');
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu:', error);
      showError('Nie udało się zaktualizować statusu zamówienia');
    } finally {
      setNewStatus('');
      setStatusDialogOpen(false);
    }
  };
  
  const handleReceiveClick = (item) => {
    setItemToReceive(item);
    setReceiveDialogOpen(true);
  };
  
  const handleReceiveItem = () => {
    if (!itemToReceive || !itemToReceive.inventoryItemId) {
      showError('Ten produkt nie jest powiązany z pozycją magazynową');
      setReceiveDialogOpen(false);
      return;
    }
    
    // Walidacja: sprawdź czy pozycja znajduje się w odpowiedziach formularzy rozładunku
    if (!isItemInUnloadingForms(itemToReceive)) {
      showError(`Nie można przyjąć towaru dla pozycji "${itemToReceive.name}". Pozycja nie została zgłoszona w żadnym raporcie rozładunku dla tego zamówienia.`);
      setReceiveDialogOpen(false);
      return;
    }
    
    const unitPrice = typeof itemToReceive.unitPrice === 'number' 
      ? itemToReceive.unitPrice 
      : parseFloat(itemToReceive.unitPrice || 0);
    
    const queryParams = new URLSearchParams();
    queryParams.append('poNumber', purchaseOrder.number);
    queryParams.append('orderId', orderId);
    queryParams.append('quantity', itemToReceive.quantity);
    queryParams.append('unitPrice', unitPrice);
    queryParams.append('reason', 'purchase');
    queryParams.append('source', 'purchase'); 
    queryParams.append('sourceId', orderId);
    
    if (itemToReceive.id) {
      queryParams.append('itemPOId', itemToReceive.id);
    } else if (itemToReceive.itemId) {
      queryParams.append('itemPOId', itemToReceive.itemId);
    }
    
    if (itemToReceive.name) {
      queryParams.append('itemName', itemToReceive.name);
    }
    
    queryParams.append('reference', purchaseOrder.number);
    
    queryParams.append('returnTo', `/purchase-orders/${orderId}`);
    
    // Pobierz informację o dacie ważności z odpowiedzi formularza rozładunku
    const expiryInfo = getExpiryInfoFromUnloadingForms(itemToReceive);
    
    if (expiryInfo.noExpiryDate) {
      // Jeśli zaznaczono "nie dotyczy" w formularzu rozładunku
      queryParams.append('noExpiryDate', 'true');
      console.log(`🚫 Przekazywanie informacji "brak terminu ważności" do formularza przyjmowania`);
    } else if (expiryInfo.expiryDate) {
      // Jeśli jest określona data ważności
      const expiryDateString = expiryInfo.expiryDate instanceof Date 
        ? expiryInfo.expiryDate.toISOString() 
        : new Date(expiryInfo.expiryDate).toISOString();
      queryParams.append('expiryDate', expiryDateString);
      console.log(`📅 Przekazywanie daty ważności do formularza przyjmowania: ${expiryDateString}`);
    }
    
    localStorage.setItem('refreshPurchaseOrder', orderId);
    
    navigate(`/inventory/${itemToReceive.inventoryItemId}/receive?${queryParams.toString()}`);
    setReceiveDialogOpen(false);
  };
  
  const handleInvoiceLinkDialogOpen = () => {
    setInvoiceLink(purchaseOrder.invoiceLink || '');
    setInvoiceLinkDialogOpen(true);
    
    if ((!purchaseOrder.invoiceLinks || purchaseOrder.invoiceLinks.length === 0) && purchaseOrder.invoiceLink) {
      setTempInvoiceLinks([{
        id: `invoice-${Date.now()}`,
        description: 'Faktura główna',
        url: purchaseOrder.invoiceLink
      }]);
    } else {
      setTempInvoiceLinks(purchaseOrder.invoiceLinks || []);
    }
  };

  const handleInvoiceLinkSave = async () => {
    try {
      const updatedData = {
        ...purchaseOrder,
        invoiceLink: tempInvoiceLinks.length > 0 ? tempInvoiceLinks[0].url : '',
        invoiceLinks: tempInvoiceLinks
      };
      
      await updatePurchaseOrder(orderId, updatedData);
      
      setPurchaseOrder({
        ...purchaseOrder,
        invoiceLink: tempInvoiceLinks.length > 0 ? tempInvoiceLinks[0].url : '',
        invoiceLinks: tempInvoiceLinks
      });
      
      setInvoiceLinkDialogOpen(false);
      showSuccess('Linki do faktur zostały zaktualizowane');
    } catch (error) {
      console.error('Błąd podczas zapisywania linków do faktur:', error);
      showError('Nie udało się zapisać linków do faktur');
    }
  };
  
  const handleUpdateBatchPrices = async () => {
    try {
      await updateBatchesForPurchaseOrder(orderId, currentUser?.uid);
      showSuccess('Ceny partii zostały zaktualizowane na podstawie aktualnych kosztów dodatkowych');
    } catch (error) {
      console.error('Błąd podczas aktualizacji cen partii:', error);
      showError('Nie udało się zaktualizować cen partii: ' + error.message);
    }
  };

  const handleUpdateBasePrices = async () => {
    try {
      const result = await updateBatchBasePricesForPurchaseOrder(orderId, currentUser?.uid);
      showSuccess(`Ceny bazowe partii zostały zaktualizowane na podstawie aktualnych cen pozycji w zamówieniu (zaktualizowano ${result.updated} partii)`);
      // Odśwież dane partii po aktualizacji
      await fetchRelatedBatches(orderId);
      setMenuOpen(false);
    } catch (error) {
      console.error('Błąd podczas aktualizacji cen bazowych partii:', error);
      showError('Nie udało się zaktualizować cen bazowych partii: ' + error.message);
    }
  };

  const handleMenuOpen = (event) => {
    setMenuAnchorRef(event.currentTarget);
    setMenuOpen(true);
  };

  const handleMenuClose = () => {
    setMenuOpen(false);
    setMenuAnchorRef(null);
  };

  const handleUpdateBatchPricesFromMenu = async () => {
    try {
      await updateBatchesForPurchaseOrder(orderId);
      showSuccess('Ceny partii zostały zaktualizowane');
      await fetchRelatedBatches(orderId);
      setMenuOpen(false);
    } catch (error) {
      showError('Błąd podczas aktualizacji cen partii: ' + error.message);
    }
  };

  const handleUpdateSupplierPrices = async () => {
    try {
      const { updateSupplierPricesFromCompletedPO } = await import('../../services/inventoryService');
      const result = await updateSupplierPricesFromCompletedPO(orderId, currentUser.uid);
      
      if (result.success) {
        if (result.updated > 0) {
          showSuccess(`Zaktualizowano ${result.updated} cen dostawców na podstawie tego zamówienia i ustawiono jako domyślne`);
        } else {
          showSuccess('Nie znaleziono cen do aktualizacji lub ceny są już aktualne');
        }
      } else {
        showError(result.message || 'Nie udało się zaktualizować cen dostawców');
      }
      setMenuOpen(false);
    } catch (error) {
      console.error('Błąd podczas aktualizacji cen dostawców:', error);
      showError('Błąd podczas aktualizacji cen dostawców: ' + error.message);
    }
  };

  const handleSupplierPricesConfirm = async (updatePrices) => {
    try {
      if (!pendingStatusUpdate) return;

      // Zaktualizuj status zamówienia
      await updatePurchaseOrderStatus(pendingStatusUpdate.orderId, pendingStatusUpdate.newStatus, currentUser.uid);
      
      // Jeśli użytkownik chce zaktualizować ceny dostawców
      if (updatePrices) {
        try {
          const { updateSupplierPricesFromCompletedPO } = await import('../../services/inventoryService');
          const result = await updateSupplierPricesFromCompletedPO(pendingStatusUpdate.orderId, currentUser.uid);
          
          if (result.success && result.updated > 0) {
            showSuccess(`Status zamówienia został zaktualizowany. Dodatkowo zaktualizowano ${result.updated} cen dostawców i ustawiono jako domyślne.`);
          } else {
            showSuccess('Status zamówienia został zaktualizowany. Nie znaleziono cen dostawców do aktualizacji.');
          }
        } catch (pricesError) {
          console.error('Błąd podczas aktualizacji cen dostawców:', pricesError);
          showSuccess('Status zamówienia został zaktualizowany.');
          showError('Błąd podczas aktualizacji cen dostawców: ' + pricesError.message);
        }
      } else {
        showSuccess('Status zamówienia został zaktualizowany bez aktualizacji cen dostawców.');
      }
      
      // Odśwież dane zamówienia
      const updatedOrder = await getPurchaseOrderById(pendingStatusUpdate.orderId);
      setPurchaseOrder(updatedOrder);
      
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu:', error);
      showError('Nie udało się zaktualizować statusu zamówienia');
    } finally {
      setSupplierPricesDialogOpen(false);
      setPendingStatusUpdate(null);
    }
  };

  const handleSupplierPricesCancel = () => {
    setSupplierPricesDialogOpen(false);
    setPendingStatusUpdate(null);
    setNewStatus('');
  };

  // Funkcja do obsługi edycji raportów rozładunku
  const handleEditUnloadingReport = (report) => {
    console.log('📝 Edycja raportu rozładunku:', report);
    
    // Zapisz dane do edycji w sessionStorage
    sessionStorage.setItem('editFormData', JSON.stringify(report));
    
    // Przekieruj do formularza rozładunku w trybie edycji
    navigate('/inventory/forms/unloading-report?edit=true');
  };
  
  const getStatusChip = (status) => {
    const statusConfig = {
      [PURCHASE_ORDER_STATUSES.DRAFT]: { color: '#757575', label: translateStatus(status) }, // oryginalny szary
      [PURCHASE_ORDER_STATUSES.PENDING]: { color: '#757575', label: translateStatus(status) }, // szary - oczekujące
      [PURCHASE_ORDER_STATUSES.APPROVED]: { color: '#ffeb3b', label: translateStatus(status) }, // żółty - zatwierdzone
      [PURCHASE_ORDER_STATUSES.ORDERED]: { color: '#1976d2', label: translateStatus(status) }, // niebieski - zamówione
      [PURCHASE_ORDER_STATUSES.PARTIAL]: { color: '#81c784', label: translateStatus(status) }, // jasno zielony - częściowo dostarczone
      [PURCHASE_ORDER_STATUSES.CONFIRMED]: { color: '#2196f3', label: translateStatus(status) }, // oryginalny jasnoniebieski
      [PURCHASE_ORDER_STATUSES.SHIPPED]: { color: '#1976d2', label: translateStatus(status) }, // oryginalny niebieski
      [PURCHASE_ORDER_STATUSES.DELIVERED]: { color: '#4caf50', label: translateStatus(status) }, // oryginalny zielony
      [PURCHASE_ORDER_STATUSES.CANCELLED]: { color: '#f44336', label: translateStatus(status) }, // oryginalny czerwony
      [PURCHASE_ORDER_STATUSES.COMPLETED]: { color: '#4caf50', label: translateStatus(status) } // oryginalny zielony
    };
    
    const config = statusConfig[status] || { color: '#757575', label: status }; // oryginalny szary
    
    return (
      <Chip 
        label={config.label} 
        size="small"
        onClick={handleStatusClick}
        sx={{
          backgroundColor: config.color,
          color: status === PURCHASE_ORDER_STATUSES.APPROVED ? 'black' : 'white' // czarny tekst na żółtym tle
        }}
      />
    );
  };
  
  const getPaymentStatusChip = (paymentStatus) => {
    const status = paymentStatus || PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID;
    const label = translatePaymentStatus(status);
    let color = '#f44336'; // czerwony domyślny dla nie opłacone
    
    switch (status) {
      case PURCHASE_ORDER_PAYMENT_STATUSES.PAID:
        color = '#4caf50'; // zielony - opłacone
        break;
      case PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID:
      default:
        color = '#f44336'; // czerwony - nie opłacone
        break;
    }
    
    return (
      <Chip 
        label={label} 
        size="small"
        onClick={handlePaymentStatusClick}
        sx={{
          backgroundColor: color,
          color: 'white'
        }}
      />
    );
  };
  
  const formatDate = (dateIsoString) => {
    if (!dateIsoString) return 'Nie określono';
    try {
      let date;
      
      if (dateIsoString && typeof dateIsoString.toDate === 'function') {
        date = dateIsoString.toDate();
      } 
      else {
        date = new Date(dateIsoString);
      }
      
      if (isNaN(date.getTime())) {
        console.warn(`Nieprawidłowa wartość daty: ${dateIsoString}`);
        return 'Nie określono';
      }
      
    return format(date, 'dd MMMM yyyy', { locale: pl });
    } catch (error) {
      console.error(`Błąd formatowania daty: ${dateIsoString}`, error);
      return 'Błąd odczytu daty';
    }
  };
  

  
  const canReceiveItems = purchaseOrder.status === PURCHASE_ORDER_STATUSES.ORDERED || 
                          purchaseOrder.status === 'ordered' || 
                          purchaseOrder.status === 'partial' || 
                          purchaseOrder.status === PURCHASE_ORDER_STATUSES.PARTIAL ||
                          purchaseOrder.status === PURCHASE_ORDER_STATUSES.CONFIRMED || 
                          purchaseOrder.status === 'confirmed' ||
                          purchaseOrder.status === PURCHASE_ORDER_STATUSES.SHIPPED || 
                          purchaseOrder.status === 'shipped' ||
                          purchaseOrder.status === PURCHASE_ORDER_STATUSES.DELIVERED || 
                          purchaseOrder.status === 'delivered';
  
  const handleDownloadPDF = async () => {
    if (!purchaseOrder) {
      showError('Brak danych zamówienia do wygenerowania PDF');
      return;
    }
    
    try {
      showSuccess('Generowanie PDF w toku...');
      
      // Użyj nowego komponentu do generowania PDF
      const pdfGenerator = createPurchaseOrderPdfGenerator(purchaseOrder, {
        useTemplate: true,
        templatePath: '/templates/PO-template.png',
        language: 'en'
      });
      
      await pdfGenerator.downloadPdf();
      showSuccess('PDF został pobrany pomyślnie');
      
    } catch (error) {
      console.error('Błąd podczas generowania PDF:', error);
      showError('Wystąpił błąd podczas generowania PDF: ' + error.message);
    }
  };
  

  
  const hasDynamicFields = purchaseOrder?.additionalCostsItems?.length > 0 || 
                          (purchaseOrder?.additionalCosts && parseFloat(purchaseOrder.additionalCosts) > 0);
  
  const handlePaymentStatusClick = () => {
    setNewPaymentStatus(purchaseOrder?.paymentStatus || PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID);
    setPaymentStatusDialogOpen(true);
  };

  const handlePaymentStatusUpdate = async () => {
    try {
      await updatePurchaseOrderPaymentStatus(orderId, newPaymentStatus, currentUser.uid);
      setPaymentStatusDialogOpen(false);
      
      // Odśwież dane zamówienia
      const updatedOrder = await getPurchaseOrderById(orderId);
      setPurchaseOrder(updatedOrder);
      
      showSuccess('Status płatności został zaktualizowany');
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu płatności:', error);
      showError('Nie udało się zaktualizować statusu płatności');
    } finally {
      setNewPaymentStatus('');
      setPaymentStatusDialogOpen(false);
    }
  };

  // Funkcje pomocnicze dla interfejsu użytkownika
  const formatAddress = (address) => {
    if (!address) return 'Brak adresu';
    return `${address.street || ''}, ${address.postalCode || ''} ${address.city || ''}, ${address.country || ''}`;
  };
  
  const getSupplierMainAddress = (supplier) => {
    if (!supplier || !supplier.addresses || supplier.addresses.length === 0) {
      return null;
    }
    
    const mainAddress = supplier.addresses.find(addr => addr.isMain);
    return mainAddress || supplier.addresses[0];
  };

  const calculateVATValues = (items = [], additionalCostsItems = []) => {
    let itemsNetTotal = 0;
    let itemsVatTotal = 0;
    
    items.forEach(item => {
      const itemNet = parseFloat(item.totalPrice) || 0;
      itemsNetTotal += itemNet;
      
      const vatRate = typeof item.vatRate === 'number' ? item.vatRate : 0;
      const itemVat = (itemNet * vatRate) / 100;
      itemsVatTotal += itemVat;
    });
    
    let additionalCostsNetTotal = 0;
    let additionalCostsVatTotal = 0;
    
    additionalCostsItems.forEach(cost => {
      const costNet = parseFloat(cost.value) || 0;
      additionalCostsNetTotal += costNet;
      
      const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
      const costVat = (costNet * vatRate) / 100;
      additionalCostsVatTotal += costVat;
    });
    
    const totalNet = itemsNetTotal + additionalCostsNetTotal;
    const totalVat = itemsVatTotal + additionalCostsVatTotal;
    const totalGross = totalNet + totalVat;
    
    return {
      itemsNetTotal,
      itemsVatTotal,
      additionalCostsNetTotal,
      additionalCostsVatTotal,
      totalNet,
      totalVat,
      totalGross,
      vatRates: {
        items: Array.from(new Set(items.map(item => item.vatRate))),
        additionalCosts: Array.from(new Set(additionalCostsItems.map(cost => cost.vatRate)))
      }
    };
  };
  
  return (
    <Container maxWidth="lg" sx={{ my: 4 }}>
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
          <CircularProgress />
        </Box>
      ) : purchaseOrder ? (
        <>
          <Box sx={{ mb: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Button
              component={Link}
              to="/purchase-orders"
              startIcon={<ArrowBackIcon />}
              variant="outlined"
            >
              Powrót do listy
            </Button>
            <Typography variant="h4" component="h1">
              Zamówienie {purchaseOrder.number}
            </Typography>
            <Box>
              <Button
                variant="outlined"
                onClick={handleDownloadPDF}
                startIcon={<DownloadIcon />}
                sx={{ mr: 1 }}
              >
                Pobierz PDF
              </Button>
              

              
              <Button
                component={Link}
                to={`/purchase-orders/${orderId}/edit`}
                variant="contained"
                startIcon={<EditIcon />}
                sx={{ mr: 1 }}
              >
                Edytuj
              </Button>
              
              <IconButton
                color="primary"
                aria-label="menu"
                onClick={handleMenuOpen}
              >
                <MoreVertIcon />
              </IconButton>
              
              <Menu
                anchorEl={menuAnchorRef}
                open={menuOpen}
                onClose={handleMenuClose}
                PaperProps={{
                  elevation: 1,
                  sx: {
                    overflow: 'visible',
                    filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
                    mt: 1.5,
                    '& .MuiAvatar-root': {
                      width: 32,
                      height: 32,
                      ml: -0.5,
                      mr: 1,
                    },
                    '&:before': {
                      content: '""',
                      display: 'block',
                      position: 'absolute',
                      top: 0,
                      right: 14,
                      width: 10,
                      height: 10,
                      bgcolor: 'background.paper',
                      transform: 'translateY(-50%) rotate(45deg)',
                      zIndex: 0,
                    },
                  },
                }}
                transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
              >
                {hasDynamicFields && (
                  <MenuItem onClick={handleUpdateBatchPricesFromMenu}>
                    <RefreshIcon sx={{ mr: 1 }} />
                    Aktualizuj ceny partii
                  </MenuItem>
                )}
                
                {purchaseOrder?.items?.length > 0 && (
                  <MenuItem onClick={handleUpdateBasePrices}>
                    <RefreshIcon sx={{ mr: 1 }} />
                    Aktualizuj ceny bazowe
                  </MenuItem>
                )}

                {purchaseOrder?.items?.length > 0 && purchaseOrder?.supplier?.id && (
                  <MenuItem onClick={handleUpdateSupplierPrices}>
                    <RefreshIcon sx={{ mr: 1 }} />
                    Aktualizuj ceny dostawcy
                  </MenuItem>
                )}
                
                <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
                  <DeleteIcon sx={{ mr: 1 }} />
                  Usuń zamówienie
                </MenuItem>
              </Menu>
            </Box>
          </Box>
          
          <Box 
            sx={{ 
              mb: 3
            }}
          >
            <Paper sx={{ p: 3, mb: 3 }}>
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="h5" component="h1">
                      Zamówienie {purchaseOrder.number}
                      <Box component="span" sx={{ ml: 2 }}>
                        {getStatusChip(purchaseOrder.status)}
                      </Box>
                      <Box component="span" sx={{ ml: 1 }}>
                        {getPaymentStatusChip(purchaseOrder.paymentStatus)}
                      </Box>
                    </Typography>
                  </Box>
                  
                  <Typography variant="body1" gutterBottom>
                    <strong>Data zamówienia:</strong> {formatDate(purchaseOrder.orderDate)}
                  </Typography>
                  
                  <Typography variant="body1" gutterBottom>
                    <strong>Oczekiwana data dostawy:</strong> {formatDate(purchaseOrder.expectedDeliveryDate)}
                  </Typography>
                  
                  {purchaseOrder.status === PURCHASE_ORDER_STATUSES.DELIVERED && (
                    <Typography variant="body1" gutterBottom>
                      <strong>Data dostawy:</strong> {formatDate(purchaseOrder.deliveredAt)}
                    </Typography>
                  )}
                  
                  {purchaseOrder.invoiceLink && (!purchaseOrder.invoiceLinks || purchaseOrder.invoiceLinks.length === 0) && (
                    <Typography variant="body1" gutterBottom>
                      <strong>Faktura:</strong>{' '}
                      <a href={purchaseOrder.invoiceLink} target="_blank" rel="noopener noreferrer">
                        Zobacz fakturę
                      </a>
                    </Typography>
                  )}
                  
                  {purchaseOrder.invoiceLinks && purchaseOrder.invoiceLinks.length > 0 && (
                    <>
                      <Typography variant="body1" gutterBottom>
                        <strong>Faktury:</strong>
                      </Typography>
                      <Box component="ul" sx={{ pl: 4, mt: 0 }}>
                        {purchaseOrder.invoiceLinks.map((invoice, index) => (
                          <Typography component="li" variant="body2" gutterBottom key={invoice.id || index}>
                            <a href={invoice.url} target="_blank" rel="noopener noreferrer">
                              {invoice.description || `Faktura ${index + 1}`}
                            </a>
                          </Typography>
                        ))}
                      </Box>
                    </>
                  )}
                </Grid>
                
                <Grid item xs={12} md={6}>
                  <Typography variant="h6" gutterBottom>Dostawca</Typography>
                  
                  {purchaseOrder.supplier ? (
                    <>
                      <Typography variant="body1" gutterBottom>
                        <strong>{purchaseOrder.supplier.name}</strong>
                      </Typography>
                      <Typography variant="body2" gutterBottom>
                        {purchaseOrder.supplier.contactPerson && (
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            <PersonIcon sx={{ mr: 1, fontSize: 16 }} />
                            {purchaseOrder.supplier.contactPerson}
                          </Box>
                        )}
                        
                        {getSupplierMainAddress(purchaseOrder.supplier) && (
                          <Box sx={{ display: 'flex', alignItems: 'flex-start', mb: 1 }}>
                            <LocationOnIcon sx={{ mr: 1, fontSize: 16, mt: 0.5 }} />
                            <span>{formatAddress(getSupplierMainAddress(purchaseOrder.supplier))}</span>
                          </Box>
                        )}
                        
                        {purchaseOrder.supplier.email && (
                          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                            <EmailIcon sx={{ mr: 1, fontSize: 16 }} />
                            <a href={`mailto:${purchaseOrder.supplier.email}`}>{purchaseOrder.supplier.email}</a>
                          </Box>
                        )}
                        
                        {purchaseOrder.supplier.phone && (
                          <Box sx={{ display: 'flex', alignItems: 'center' }}>
                            <PhoneIcon sx={{ mr: 1, fontSize: 16 }} />
                            <a href={`tel:${purchaseOrder.supplier.phone}`}>{purchaseOrder.supplier.phone}</a>
                          </Box>
                        )}
                      </Typography>
                    </>
                  ) : (
                    <Typography variant="body2">
                      Brak danych dostawcy
                    </Typography>
                  )}
                </Grid>
              </Grid>
            </Paper>
            
            {purchaseOrder.statusHistory && purchaseOrder.statusHistory.length > 0 && (
              <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  Historia zmian statusu
                </Typography>
                
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Data i godzina</TableCell>
                      <TableCell>Poprzedni status</TableCell>
                      <TableCell>Nowy status</TableCell>
                      <TableCell>Kto zmienił</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...purchaseOrder.statusHistory].reverse().map((change, index) => (
                      <TableRow key={index}>
                        <TableCell>
                          {change.changedAt ? new Date(change.changedAt).toLocaleString('pl') : 'Brak daty'}
                        </TableCell>
                        <TableCell>{translateStatus(change.oldStatus)}</TableCell>
                        <TableCell>{translateStatus(change.newStatus)}</TableCell>
                        <TableCell>{getUserName(change.changedBy)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            )}
            
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>Elementy zamówienia</Typography>
              
              <TableContainer sx={{ mb: 3 }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Nazwa produktu</TableCell>
                      <TableCell align="right">Ilość</TableCell>
                      <TableCell>Jednostka</TableCell>
                      <TableCell align="right">Cena jedn.</TableCell>
                      <TableCell align="right">Wartość netto</TableCell>
                      <TableCell align="right">Kwota oryg.</TableCell>
                      <TableCell align="right">Plan. data dost.</TableCell>
                      <TableCell align="right">Rzecz. data dost.</TableCell>
                      <TableCell align="right">Odebrano</TableCell>
                      {/* Ukrywamy kolumnę akcji przy drukowaniu */}
                      <TableCell sx={{ '@media print': { display: 'none' } }}></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {purchaseOrder.items?.map((item, index) => {
                      // Oblicz procent realizacji
                      const received = parseFloat(item.received || 0);
                      const quantity = parseFloat(item.quantity || 0);
                      const fulfilledPercentage = quantity > 0 ? (received / quantity) * 100 : 0;
                      
                      // Określ kolor tła dla wiersza
                      let rowColor = 'inherit'; // Domyślny kolor
                      if (fulfilledPercentage >= 100) {
                        rowColor = 'rgba(76, 175, 80, 0.1)'; // Lekko zielony dla w pełni odebranych
                      } else if (fulfilledPercentage > 0) {
                        rowColor = 'rgba(255, 152, 0, 0.1)'; // Lekko pomarańczowy dla częściowo odebranych
                      }
                      
                      return (
                        <React.Fragment key={index}>
                          <TableRow 
                            sx={{ backgroundColor: rowColor }}
                          >
                            <TableCell>
                              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                {item.name}
                                {/* Dodaj przycisk rozwijania, jeśli istnieją LOTy dla tego produktu */}
                                {getBatchesByItemId(item.id).length > 0 && (
                                  <IconButton
                                    size="small"
                                    onClick={() => toggleItemExpansion(item.id)}
                                    sx={{ ml: 1 }}
                                  >
                                    {expandedItems[item.id] ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                                  </IconButton>
                                )}
                              </Box>
                            </TableCell>
                            <TableCell align="right">{item.quantity}</TableCell>
                            <TableCell>{item.unit}</TableCell>
                            <TableCell align="right">{formatCurrency(item.unitPrice, purchaseOrder.currency, 6)}</TableCell>
                            <TableCell align="right">{formatCurrency(item.totalPrice, purchaseOrder.currency)}</TableCell>
                            <TableCell align="right">
                              {item.currency && item.currency !== purchaseOrder.currency && item.originalUnitPrice 
                                    ? formatCurrency(item.originalUnitPrice * item.quantity, item.currency) 
                                    : item.currency === 'EUR' && purchaseOrder.currency === 'EUR'
                                      ? formatCurrency(item.totalPrice, item.currency)
                                      : "-"}
                            </TableCell>
                            <TableCell align="right">{item.plannedDeliveryDate ? formatDate(item.plannedDeliveryDate) : '-'}</TableCell>
                            <TableCell align="right">{item.actualDeliveryDate ? formatDate(item.actualDeliveryDate) : '-'}</TableCell>
                            <TableCell align="right">
                              {received} {received > 0 && `(${fulfilledPercentage.toFixed(0)}%)`}
                            </TableCell>
                            {/* Ukrywamy przycisk akcji przy drukowaniu */}
                            <TableCell align="right" sx={{ '@media print': { display: 'none' } }}>
                              {canReceiveItems && item.inventoryItemId && 
                               (parseFloat(item.received || 0) < parseFloat(item.quantity || 0)) && (
                                (() => {
                                  const itemInUnloadingForm = isItemInUnloadingForms(item);
                                  const expiryInfo = getExpiryInfoFromUnloadingForms(item);
                                  
                                  let tooltipText = "";
                                  if (itemInUnloadingForm) {
                                    tooltipText = "Pozycja została zgłoszona w raporcie rozładunku - można przyjąć towar";
                                    if (expiryInfo.noExpiryDate) {
                                      tooltipText += ` (brak terminu ważności)`;
                                    } else if (expiryInfo.expiryDate) {
                                      const expiryDateStr = expiryInfo.expiryDate instanceof Date 
                                        ? expiryInfo.expiryDate.toLocaleDateString('pl-PL')
                                        : new Date(expiryInfo.expiryDate).toLocaleDateString('pl-PL');
                                      tooltipText += ` (data ważności: ${expiryDateStr})`;
                                    }
                                  } else {
                                    tooltipText = "Pozycja nie została zgłoszona w raporcie rozładunku - nie można przyjąć towaru";
                                  }
                                  
                                  return (
                                    <Tooltip title={tooltipText}
                                    >
                                      <span>
                                        <Button
                                          size="small"
                                          variant={itemInUnloadingForm ? "outlined" : "outlined"}
                                          color={itemInUnloadingForm ? "primary" : "error"}
                                          startIcon={<InventoryIcon />}
                                          onClick={() => handleReceiveClick(item)}
                                          disabled={!itemInUnloadingForm}
                                        >
                                          {itemInUnloadingForm ? "Przyjmij" : "Brak w raporcie"}
                                        </Button>
                                      </span>
                                    </Tooltip>
                                  );
                                })()
                              )}
                            </TableCell>
                          </TableRow>
                          
                          {/* LOTy powiązane z tą pozycją zamówienia */}
                          {expandedItems[item.id] && (
                            <TableRow>
                              <TableCell colSpan={7} sx={{ py: 0, backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
                                <Collapse in={expandedItems[item.id]} timeout="auto" unmountOnExit>
                                  <Box sx={{ m: 2 }}>
                                    <Typography variant="subtitle2" gutterBottom component="div">
                                      Partie (LOT) przypisane do tej pozycji
                                    </Typography>
                                    {getBatchesByItemId(item.id).length > 0 ? (
                                      <List dense>
                                        {getBatchesByItemId(item.id).map((batch) => (
                                          <ListItem 
                                            key={batch.id} 
                                            sx={{ 
                                              bgcolor: 'background.paper', 
                                              mb: 0.5, 
                                              borderRadius: 1,
                                              cursor: 'pointer',
                                              '&:hover': { bgcolor: 'action.hover' }
                                            }}
                                            onClick={() => handleBatchClick(batch.id, batch.itemId || item.inventoryItemId)}
                                          >
                                            <ListItemIcon>
                                              <LabelIcon color="info" />
                                            </ListItemIcon>
                                            <ListItemText
                                              primary={`LOT: ${batch.lotNumber || batch.batchNumber || "Brak numeru"}`}
                                              secondary={
                                                <React.Fragment>
                                                  <Typography component="span" variant="body2" color="text.primary">
                                                    Ilość: {batch.quantity} {item.unit}
                                                  </Typography>
                                                  {batch.receivedDate && (
                                                    <Typography component="span" variant="body2" display="block" color="text.secondary">
                                                      Przyjęto: {new Date(batch.receivedDate.seconds * 1000).toLocaleDateString('pl-PL')}
                                                    </Typography>
                                                  )}
                                                  {batch.warehouseId && (
                                                    <Typography component="span" variant="body2" display="block" color="text.secondary">
                                                      Magazyn: {batch.warehouseName || warehouseNames[batch.warehouseId] || batch.warehouseId}
                                                    </Typography>
                                                  )}
                                                </React.Fragment>
                                              }
                                            />
                                            <Button
                                              size="small"
                                              variant="outlined"
                                              color="primary"
                                              sx={{ ml: 1 }}
                                              onClick={(e) => {
                                                e.stopPropagation(); // Zapobiega propagacji kliknięcia do rodzica
                                                handleBatchClick(batch.id, batch.itemId || item.inventoryItemId);
                                              }}
                                            >
                                              Szczegóły
                                            </Button>
                                          </ListItem>
                                        ))}
                                      </List>
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">
                                        Brak przypisanych partii dla tej pozycji
                                      </Typography>
                                    )}
                                  </Box>
                                </Collapse>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              
              <Grid container spacing={2}>
                <Grid item xs={12} md={6}>
                  {purchaseOrder.notes && (
                    <>
                      <Typography variant="subtitle1" gutterBottom>Uwagi:</Typography>
                      <Paper variant="outlined" sx={{ p: 2, bgcolor: 'background.paper' }}>
                        <Typography variant="body2">
                          {purchaseOrder.notes}
                        </Typography>
                      </Paper>
                    </>
                  )}
                </Grid>
                <Grid item xs={12} md={6}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <Typography variant="body1" gutterBottom>
                      <strong>Wartość produktów netto:</strong> {formatCurrency(purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0), purchaseOrder.currency)}
                    </Typography>
                    
                    {/* Sekcja VAT dla produktów */}
                    {purchaseOrder.items.length > 0 && (
                      <>
                        <Typography variant="subtitle2" gutterBottom>
                          VAT od produktów:
                        </Typography>
                        {/* Grupowanie pozycji według stawki VAT */}
                        {Array.from(new Set(purchaseOrder.items.map(item => item.vatRate))).sort((a, b) => a - b).map(vatRate => {
                          if (vatRate === undefined) return null;
                          
                          const itemsWithSameVat = purchaseOrder.items.filter(item => item.vatRate === vatRate);
                          const sumNet = itemsWithSameVat.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
                          const vatValue = typeof vatRate === 'number' ? (sumNet * vatRate) / 100 : 0;
                          
                          return (
                            <Typography key={vatRate} variant="body2" gutterBottom sx={{ pl: 2 }}>
                              Stawka {vatRate}%: <strong>{formatCurrency(vatValue, purchaseOrder.currency)}</strong> (od {formatCurrency(sumNet, purchaseOrder.currency)})
                            </Typography>
                          );
                        })}
                      </>
                    )}
                    
                    {/* Sekcja dodatkowych kosztów z VAT */}
                    {purchaseOrder.additionalCostsItems?.length > 0 && (
                      <>
                        <Typography variant="subtitle1" gutterBottom>
                          <strong>Dodatkowe koszty:</strong>
                        </Typography>
                        {purchaseOrder.additionalCostsItems.map((cost, index) => (
                          <Typography key={index} variant="body2" gutterBottom sx={{ pl: 2 }}>
                            {cost.description || `Dodatkowy koszt ${index+1}`}: <strong>{formatCurrency(parseFloat(cost.value) || 0, purchaseOrder.currency)}</strong>
                            {typeof cost.vatRate === 'number' && cost.vatRate > 0 && (
                              <span> + VAT {cost.vatRate}%: <strong>{formatCurrency(((parseFloat(cost.value) || 0) * cost.vatRate) / 100, purchaseOrder.currency)}</strong></span>
                            )}
                          </Typography>
                        ))}
                      </>
                    )}
                    
                    {/* Podsumowanie */}
                    {(() => {
                      const vatValues = calculateVATValues(purchaseOrder.items, purchaseOrder.additionalCostsItems);
                      return (
                        <>
                          <Typography variant="subtitle1" gutterBottom>
                            <strong>Wartość netto razem:</strong> {formatCurrency(vatValues.totalNet, purchaseOrder.currency)}
                          </Typography>
                          <Typography variant="subtitle1" gutterBottom>
                            <strong>Suma podatku VAT:</strong> {formatCurrency(vatValues.totalVat, purchaseOrder.currency)}
                          </Typography>
                          <Typography variant="h6" sx={{ mt: 1 }}>
                            <strong>Wartość brutto:</strong> {formatCurrency(vatValues.totalGross, purchaseOrder.currency)}
                          </Typography>
                        </>
                      );
                    })()}
                  </Box>
                </Grid>
              </Grid>
            </Paper>
          </Box>
          
          {/* Nowa sekcja wyświetlająca wszystkie LOTy powiązane z zamówieniem */}
          {relatedBatches.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Wszystkie partie (LOT) powiązane z zamówieniem
              </Typography>
              
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Numer LOT</TableCell>
                      <TableCell>Produkt</TableCell>
                      <TableCell align="right">Ilość</TableCell>
                      <TableCell>Magazyn</TableCell>
                      <TableCell>Data przyjęcia</TableCell>
                      <TableCell>Wartość</TableCell>
                      <TableCell>Akcje</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {relatedBatches.map((batch) => (
                      <TableRow 
                        key={batch.id} 
                        hover 
                        sx={{ 
                          cursor: 'pointer',
                          '&:hover': { bgcolor: 'action.hover' }
                        }}
                      >
                        <TableCell sx={{ fontWeight: 'medium' }}>
                          {batch.lotNumber || batch.batchNumber || "Brak numeru"}
                        </TableCell>
                        <TableCell>
                          {batch.itemName || "Nieznany produkt"}
                        </TableCell>
                        <TableCell align="right">
                          {batch.quantity || 0} {batch.unit || 'szt.'}
                        </TableCell>
                        <TableCell>
                          {batch.warehouseName || batch.warehouseId || "Główny magazyn"}
                        </TableCell>
                        <TableCell>
                          {batch.receivedDate ? 
                            (typeof batch.receivedDate === 'object' && batch.receivedDate.seconds ? 
                              new Date(batch.receivedDate.seconds * 1000).toLocaleDateString('pl-PL') : 
                              new Date(batch.receivedDate).toLocaleDateString('pl-PL')) : 
                            "Nieznana data"}
                        </TableCell>
                        <TableCell>
                          {formatCurrency(batch.unitPrice * batch.quantity, purchaseOrder.currency)}
                        </TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => handleBatchClick(batch.id, batch.itemId)}
                          >
                            Szczegóły
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
          
          <Paper sx={{ mb: 3, p: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom>
              Dodatkowe koszty
            </Typography>
            
            {purchaseOrder.additionalCostsItems && purchaseOrder.additionalCostsItems.length > 0 ? (
              <>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Opis</TableCell>
                      <TableCell align="right">Kwota</TableCell>
                      <TableCell align="right">Stawka VAT</TableCell>
                      <TableCell align="right">VAT</TableCell>
                      <TableCell align="right">Razem brutto</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {purchaseOrder.additionalCostsItems.map((cost, index) => {
                      const costValue = parseFloat(cost.value) || 0;
                      const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
                      const vatValue = (costValue * vatRate) / 100;
                      const grossValue = costValue + vatValue;
                      
                      return (
                        <TableRow key={cost.id || index}>
                          <TableCell>{cost.description || `Dodatkowy koszt ${index+1}`}</TableCell>
                          <TableCell align="right">{formatCurrency(costValue, purchaseOrder.currency)}</TableCell>
                          <TableCell align="right">{vatRate > 0 ? `${vatRate}%` : ''}</TableCell>
                          <TableCell align="right">{formatCurrency(vatValue, purchaseOrder.currency)}</TableCell>
                          <TableCell align="right">{formatCurrency(grossValue, purchaseOrder.currency)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>


              </>
            ) : (
              <Typography variant="body2">
                Brak dodatkowych kosztów
              </Typography>
            )}
          </Paper>
          
          {/* Sekcja załączników */}
          <Paper sx={{ mb: 3, p: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <AttachFileIcon sx={{ mr: 1 }} />
              Załączniki
            </Typography>
            
            {purchaseOrder.attachments && purchaseOrder.attachments.length > 0 ? (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Załączonych plików: {purchaseOrder.attachments.length}
                </Typography>
                
                <List sx={{ py: 0 }}>
                  {purchaseOrder.attachments.map((attachment) => {
                    // Funkcja do uzyskania ikony pliku
                    const getFileIcon = (contentType) => {
                      if (contentType.startsWith('image/')) {
                        return <ImageIcon sx={{ color: 'primary.main' }} />;
                      } else if (contentType === 'application/pdf') {
                        return <PdfIcon sx={{ color: 'error.main' }} />;
                      } else {
                        return <DescriptionIcon sx={{ color: 'action.active' }} />;
                      }
                    };

                    // Funkcja do formatowania rozmiaru pliku
                    const formatFileSize = (bytes) => {
                      if (bytes === 0) return '0 Bytes';
                      const k = 1024;
                      const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                      const i = Math.floor(Math.log(bytes) / Math.log(k));
                      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                    };

                    return (
                      <ListItem
                        key={attachment.id}
                        button
                        onClick={() => window.open(attachment.downloadURL, '_blank')}
                        sx={{
                          border: '1px solid #e0e0e0',
                          borderRadius: 1,
                          mb: 1,
                          backgroundColor: 'background.paper',
                          cursor: 'pointer',
                          '&:hover': { 
                            bgcolor: 'action.hover',
                            borderColor: 'primary.main'
                          }
                        }}
                      >
                        <Box sx={{ mr: 1.5 }}>
                          {getFileIcon(attachment.contentType)}
                        </Box>
                        <ListItemText
                          primary={
                            <Typography variant="body2" fontWeight="medium">
                              {attachment.fileName}
                            </Typography>
                          }
                          secondary={
                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', mt: 0.5 }}>
                              <Typography variant="caption" color="text.secondary">
                                {formatFileSize(attachment.size)}
                              </Typography>
                              <Typography variant="caption" color="text.secondary">
                                {new Date(attachment.uploadedAt).toLocaleDateString('pl-PL')}
                              </Typography>
                              <Typography variant="caption" color="primary.main" sx={{ fontStyle: 'italic' }}>
                                Kliknij aby otworzyć
                              </Typography>
                            </Box>
                          }
                        />
                        <Box>
                          <DownloadIcon 
                            fontSize="small" 
                            sx={{ color: 'primary.main' }}
                          />
                        </Box>
                      </ListItem>
                    );
                  })}
                </List>
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Brak załączników do tego zamówienia
              </Typography>
            )}
          </Paper>

          {/* Sekcja odpowiedzi formularzy rozładunku */}
          <Paper sx={{ mb: 3, p: 2, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <LocalShippingIcon sx={{ mr: 1 }} />
              Raporty rozładunku towaru
              {unloadingFormResponsesLoading && (
                <CircularProgress size={20} sx={{ ml: 2 }} />
              )}
            </Typography>
            
            {unloadingFormResponses.length > 0 ? (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Znaleziono {unloadingFormResponses.length} raport(ów) rozładunku dla PO: {purchaseOrder.number}
                </Typography>
                
                {unloadingFormResponses.map((report, index) => (
                  <Paper 
                    key={report.id} 
                    variant="outlined" 
                    sx={{ 
                      mb: 1.5, 
                      p: 1.5, 
                      border: '1px solid #e0e0e0',
                      borderLeft: '3px solid #1976d2',
                      backgroundColor: '#fafafa'
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                      <AssignmentIcon sx={{ mr: 1, color: 'primary.main', fontSize: '1.2rem' }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        Raport rozładunku #{index + 1}
                      </Typography>
                      <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Chip 
                          label={`${report.fillDate ? safeFormatDate(report.fillDate, 'dd.MM HH:mm') : 'Brak daty'}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem' }}
                        />
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleEditUnloadingReport(report)}
                          title="Edytuj raport rozładunku"
                          sx={{ p: 0.5 }}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>
                    
                    <Grid container spacing={1}>
                      {/* Informacje podstawowe */}
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Email pracownika
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.email || 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Pracownik
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.employeeName || 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Stanowisko
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.position || 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Godzina wypełnienia
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.fillTime || 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Data rozładunku
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.unloadingDate ? safeFormatDate(report.unloadingDate, 'dd.MM.yyyy') : 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Godzina rozładunku
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.unloadingTime || 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Przewoźnik
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.carrierName || 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Nr rejestracyjny
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.vehicleRegistration || 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Stan techniczny
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.vehicleTechnicalCondition || 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Higiena transportu
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.transportHygiene || 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Dostawca
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.supplierName || 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Ilość palet
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.palletQuantity || 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Kartonów/tub
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.cartonsTubsQuantity || 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Waga
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.weight || 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Ocena wizualna
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.visualInspectionResult || 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          Nr certyfikatu eko
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.ecoCertificateNumber || 'Nie podano'}
                        </Typography>
                      </Grid>
                      
                      {/* Pozycje dostarczone */}
                      {report.selectedItems && report.selectedItems.length > 0 && (
                        <Grid item xs={12}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                            Pozycje dostarczone
                          </Typography>
                          <Box sx={{ mt: 0.5 }}>
                            {report.selectedItems.map((item, itemIndex) => (
                              <Box 
                                key={itemIndex} 
                                sx={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center',
                                  p: 0.5, 
                                  mb: 0.5, 
                                  backgroundColor: 'white', 
                                  borderRadius: 0.5,
                                  border: '1px solid #e0e0e0'
                                }}
                              >
                                <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                                  {item.productName || 'Nieznany produkt'}
                                </Typography>
                                <Box sx={{ textAlign: 'right' }}>
                                  <Typography variant="body2" color="primary" sx={{ fontSize: '0.8rem' }}>
                                    {item.unloadedQuantity || 'Nie podano'} {item.unit || ''}
                                  </Typography>
                                  {item.expiryDate && (
                                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                      {safeFormatDate(item.expiryDate, 'dd.MM.yyyy')}
                                    </Typography>
                                  )}
                                </Box>
                              </Box>
                            ))}
                          </Box>
                        </Grid>
                      )}
                      
                      {/* Uwagi */}
                      {(report.notes || report.goodsNotes) && (
                        <Grid item xs={12}>
                          <Box sx={{ display: 'flex', gap: 2 }}>
                            {report.notes && (
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                                  Uwagi rozładunku
                                </Typography>
                                <Typography variant="body2" sx={{ 
                                  fontStyle: 'italic', 
                                  p: 0.5, 
                                  backgroundColor: 'rgba(0, 0, 0, 0.04)', 
                                  borderRadius: 0.5,
                                  mt: 0.25,
                                  fontSize: '0.8rem'
                                }}>
                                  {report.notes}
                                </Typography>
                              </Box>
                            )}
                            {report.goodsNotes && (
                              <Box sx={{ flex: 1 }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                                  Uwagi towaru
                                </Typography>
                                <Typography variant="body2" sx={{ 
                                  fontStyle: 'italic', 
                                  p: 0.5, 
                                  backgroundColor: 'rgba(0, 0, 0, 0.04)', 
                                  borderRadius: 0.5,
                                  mt: 0.25,
                                  fontSize: '0.8rem'
                                }}>
                                  {report.goodsNotes}
                                </Typography>
                              </Box>
                            )}
                          </Box>
                        </Grid>
                      )}
                      
                      {/* Załącznik */}
                      {report.documentsUrl && (
                        <Grid item xs={12}>
                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem', fontWeight: 600 }}>
                            Załącznik
                          </Typography>
                          <Box sx={{ mt: 0.5 }}>
                            <Button 
                              size="small" 
                              variant="outlined"
                              href={report.documentsUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              startIcon={<AttachFileIcon />}
                              sx={{ fontSize: '0.75rem', py: 0.25 }}
                            >
                              {report.documentsName || 'Pobierz załącznik'}
                            </Button>
                          </Box>
                        </Grid>
                      )}
                    </Grid>
                  </Paper>
                ))}
              </Box>
            ) : (
              <Typography variant="body2" color="text.secondary">
                {unloadingFormResponsesLoading 
                  ? 'Szukanie raportów rozładunku...'
                  : `Brak raportów rozładunku dla PO: ${purchaseOrder?.number || 'Nieznany'}`
                }
              </Typography>
            )}
          </Paper>
        </>
      ) : (
        <Typography>Nie znaleziono zamówienia</Typography>
      )}

      {/* Dialog usuwania */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Potwierdź usunięcie</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć to zamówienie? Tej operacji nie można cofnąć.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleDeleteConfirm} color="error">Usuń</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog zmiany statusu */}
      <Dialog
        open={statusDialogOpen}
        onClose={() => setStatusDialogOpen(false)}
      >
        <DialogTitle>Zmień status zamówienia</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wybierz nowy status zamówienia:
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel>Status</InputLabel>
            <Select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              label="Status"
            >
              <MenuItem value="draft">{translateStatus('draft')}</MenuItem>
              <MenuItem value="ordered">{translateStatus('ordered')}</MenuItem>
              <MenuItem value="shipped">{translateStatus('shipped')}</MenuItem>
              <MenuItem value="partial">{translateStatus('partial')}</MenuItem>
              <MenuItem value="delivered">{translateStatus('delivered')}</MenuItem>
              <MenuItem value="completed">{translateStatus('completed')}</MenuItem>
              <MenuItem value="cancelled">{translateStatus('cancelled')}</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleStatusUpdate} color="primary">Zapisz</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog zmiany statusu płatności */}
      <Dialog
        open={paymentStatusDialogOpen}
        onClose={() => setPaymentStatusDialogOpen(false)}
      >
        <DialogTitle>Zmień status płatności</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Wybierz nowy status płatności zamówienia:
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel>Status płatności</InputLabel>
            <Select
              value={newPaymentStatus}
              onChange={(e) => setNewPaymentStatus(e.target.value)}
              label="Status płatności"
            >
              <MenuItem value={PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID}>
                {translatePaymentStatus(PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID)}
              </MenuItem>
              <MenuItem value={PURCHASE_ORDER_PAYMENT_STATUSES.PAID}>
                {translatePaymentStatus(PURCHASE_ORDER_PAYMENT_STATUSES.PAID)}
              </MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPaymentStatusDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handlePaymentStatusUpdate} color="primary">Zapisz</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog przyjęcia towaru */}
      <Dialog
        open={receiveDialogOpen}
        onClose={() => setReceiveDialogOpen(false)}
      >
        <DialogTitle>Przyjęcie towaru do magazynu</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy chcesz przejść do strony przyjęcia towaru dla produktu: {itemToReceive?.name}?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReceiveDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleReceiveItem} color="primary">Przyjmij</Button>
        </DialogActions>
      </Dialog>
      
      {/* Dialog potwierdzenia aktualizacji cen dostawców */}
      <Dialog
        open={supplierPricesDialogOpen}
        onClose={handleSupplierPricesCancel}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          Zaktualizować ceny dostawców?
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            Zamówienie zostanie oznaczone jako zakończone. 
          </DialogContentText>
          <DialogContentText sx={{ mt: 2, fontWeight: 'bold' }}>
            Czy chcesz również automatycznie zaktualizować ceny dostawców w pozycjach magazynowych na podstawie cen z tego zamówienia?
          </DialogContentText>
          <DialogContentText sx={{ mt: 2, fontSize: '0.875rem', color: 'text.secondary' }}>
            • Zaktualizowane ceny zostaną ustawione jako domyślne<br/>
            • Historia zmian cen zostanie zachowana<br/>
            • Można to zrobić później ręcznie z menu akcji
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSupplierPricesCancel} color="inherit">
            Anuluj
          </Button>
          <Button 
            onClick={() => handleSupplierPricesConfirm(false)} 
            color="primary"
            variant="outlined"
          >
            Tylko zmień status
          </Button>
          <Button 
            onClick={() => handleSupplierPricesConfirm(true)} 
            color="primary"
            variant="contained"
            startIcon={<RefreshIcon />}
          >
            Zmień status i zaktualizuj ceny
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog linku do faktury */}
      <Dialog
        open={invoiceLinkDialogOpen}
        onClose={() => setInvoiceLinkDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Linki do faktur
        </DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Zarządzaj linkami do faktur dla tego zamówienia. Możesz dodać wiele faktur, np. główną fakturę i dodatkowe faktury za transport, ubezpieczenie itp.
          </DialogContentText>
          
          <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
            <Button 
              startIcon={<AddIcon />} 
              onClick={() => setTempInvoiceLinks([
                ...tempInvoiceLinks, 
                { id: `invoice-${Date.now()}`, description: '', url: '' }
              ])}
              variant="outlined"
              size="small"
            >
              Dodaj fakturę
            </Button>
          </Box>
          
          {tempInvoiceLinks.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>
              Brak faktur. Kliknij "Dodaj fakturę", aby dodać link do faktury.
            </Typography>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Opis</TableCell>
                    <TableCell>Link do faktury</TableCell>
                    <TableCell width="100px"></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {tempInvoiceLinks.map((invoice, index) => (
                    <TableRow key={invoice.id || index}>
                      <TableCell>
                        <TextField
                          fullWidth
                          size="small"
                          value={invoice.description}
                          onChange={(e) => {
                            const updated = [...tempInvoiceLinks];
                            updated[index].description = e.target.value;
                            setTempInvoiceLinks(updated);
                          }}
                          placeholder="Opis faktury, np. Faktura główna, Faktura transportowa itp."
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          fullWidth
                          size="small"
                          value={invoice.url}
                          onChange={(e) => {
                            const updated = [...tempInvoiceLinks];
                            updated[index].url = e.target.value;
                            setTempInvoiceLinks(updated);
                            
                            // Aktualizujemy też stare pole dla kompatybilności
                            if (index === 0) {
                              setInvoiceLink(e.target.value);
                            }
                          }}
                          placeholder="https://drive.google.com/file/d/..."
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => {
                            const updated = tempInvoiceLinks.filter((_, i) => i !== index);
                            setTempInvoiceLinks(updated);
                            
                            // Aktualizujemy też stare pole dla kompatybilności
                            if (index === 0 && updated.length > 0) {
                              setInvoiceLink(updated[0].url);
                            } else if (updated.length === 0) {
                              setInvoiceLink('');
                            }
                          }}
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
          
          {/* Ukryte stare pole dla kompatybilności */}
          <input type="hidden" value={invoiceLink} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvoiceLinkDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleInvoiceLinkSave} color="primary">Zapisz</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={deleteDialogOpen}
        onClose={() => setDeleteDialogOpen(false)}
      >
        <DialogTitle>Potwierdzenie usunięcia</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Czy na pewno chcesz usunąć to zamówienie zakupu?
          </DialogContentText>
          <DialogContentText sx={{ mt: 2, fontWeight: 'bold', color: 'error.main' }}>
            Ta operacja jest nieodwracalna!
          </DialogContentText>
          {purchaseOrder && (
            <DialogContentText sx={{ mt: 2 }}>
              <strong>Zamówienie:</strong> {purchaseOrder.number || `#${orderId.substring(0, 8).toUpperCase()}`}<br/>
              <strong>Dostawca:</strong> {purchaseOrder.supplier?.name || 'Nieznany'}<br/>
              <strong>Wartość:</strong> {purchaseOrder.totalGross ? `${Number(purchaseOrder.totalGross).toFixed(2)} ${purchaseOrder.currency || 'PLN'}` : 'Nieznana'}
            </DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleDeleteConfirm} color="error" variant="contained">
            Usuń
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
};

export default PurchaseOrderDetails;