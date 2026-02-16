import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate, Link, Link as RouterLink, useLocation } from 'react-router-dom';
import { 
  Container, Typography, Paper, Button, Box, Chip, Grid, Divider, 
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  FormControl, InputLabel, Select, MenuItem, TextField, CircularProgress, IconButton,
  List, ListItem, ListItemText, ListItemIcon, Collapse, Tooltip, Menu, ButtonGroup
} from '@mui/material';
// ✅ OPTYMALIZACJA: Import wspólnych stylów MUI
import { 
  flexCenter, 
  flexBetween,
  loadingContainer,
  mb1,
  mb2,
  mb3,
  mr1,
  p2,
  p3
} from '../../styles/muiCommonStyles';
import { useTranslation } from '../../hooks/useTranslation';
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
  LocalShipping as LocalShippingIcon,
  ArrowDropDown as ArrowDropDownIcon
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
  checkShortExpiryItems,
  PURCHASE_ORDER_STATUSES,
  PURCHASE_ORDER_PAYMENT_STATUSES,
  translateStatus,
  translatePaymentStatus,
  getNextPaymentDueDate
} from '../../services/purchaseOrderService';
import { getBatchesByPurchaseOrderId, getInventoryBatch, getWarehouseById } from '../../services/inventory';
import { getPOReservationsForItem } from '../../services/poReservationService';
import { getInvoicesByOrderId, getReinvoicedAmountsByPOItems } from '../../services/invoiceService';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { db } from '../../services/firebase/config';
import { updateDoc, doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { formatCurrency } from '../../utils/formatUtils';
import { getUsersDisplayNames } from '../../services/userService';
import { createPurchaseOrderPdfGenerator } from './PurchaseOrderPdfGenerator';
import CoAMigrationDialog from './CoAMigrationDialog';

const PurchaseOrderDetails = ({ orderId }) => {
  const { t } = useTranslation();
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
  const [relatedRefInvoices, setRelatedRefInvoices] = useState([]);
  const [loadingRefInvoices, setLoadingRefInvoices] = useState(false);
  const [pendingStatusUpdate, setPendingStatusUpdate] = useState(null);
  const [shortExpiryConfirmDialogOpen, setShortExpiryConfirmDialogOpen] = useState(false);
  const [shortExpiryItems, setShortExpiryItems] = useState([]);
  
  // Stany dla menu opcji PDF
  const [pdfMenuAnchorEl, setPdfMenuAnchorEl] = useState(null);
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);
  
  // Stany dla odpowiedzi formularzy rozładunku
  const [unloadingFormResponses, setUnloadingFormResponses] = useState([]);
  const [unloadingFormResponsesLoading, setUnloadingFormResponsesLoading] = useState(false);
  
  // Stan dla dialogu migracji CoA
  const [coaMigrationDialogOpen, setCoaMigrationDialogOpen] = useState(false);
  
  // Stan dla rezerwacji PO
  const [poReservationsByItem, setPOReservationsByItem] = useState({});
  const [loadingReservations, setLoadingReservations] = useState(false);
  
  // Stan dla refakturowanych kwot
  const [reinvoicedAmounts, setReinvoicedAmounts] = useState({ items: {}, additionalCosts: {} });
  
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
        
        // Pobierz rezerwacje PO
        if (data.items && data.items.length > 0) {
          await loadPOReservations(orderId, data.items);
        }
        
        // Pobierz refaktury powiązane z tym PO i oblicz refakturowane kwoty
        await fetchRefInvoices(orderId, data);
        
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
  
  // Funkcja do pobierania rezerwacji dla pozycji
  const getReservationsByItemId = (itemId) => {
    return poReservationsByItem[itemId] || [];
  };

  // Funkcja do ładowania rezerwacji PO
  const loadPOReservations = async (poId, items) => {
    try {
      setLoadingReservations(true);
      const reservationsByItem = {};
      
      // Pobierz rezerwacje dla każdej pozycji
      for (const item of items) {
        if (item.id) {
          const reservations = await getPOReservationsForItem(poId, item.id);
          if (reservations.length > 0) {
            reservationsByItem[item.id] = reservations;
          }
        }
      }
      
      setPOReservationsByItem(reservationsByItem);
    } catch (error) {
      console.error('Błąd podczas ładowania rezerwacji PO:', error);
    } finally {
      setLoadingReservations(false);
    }
  };
  
  // Funkcja do pobierania refaktur powiązanych z tym PO
  const fetchRefInvoices = async (poId, poData = null) => {
    try {
      setLoadingRefInvoices(true);
      const invoices = await getInvoicesByOrderId(poId);
      // Filtruj tylko refaktury (isRefInvoice === true)
      const refInvoices = invoices.filter(inv => inv.isRefInvoice === true);
      setRelatedRefInvoices(refInvoices);
      
      // Pobierz kwoty refakturowane dla pozycji i dodatkowych kosztów
      const reinvoiced = await getReinvoicedAmountsByPOItems(poId, invoices, poData);
      setReinvoicedAmounts(reinvoiced);
    } catch (error) {
      console.error('Błąd podczas pobierania refaktur:', error);
    } finally {
      setLoadingRefInvoices(false);
    }
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
                // Pomocnicza funkcja do konwersji daty
                const convertDate = (dateValue) => {
                  if (!dateValue) return null;
                  try {
                    if (dateValue.toDate && typeof dateValue.toDate === 'function') {
                      return dateValue.toDate();
                    } else if (typeof dateValue === 'string') {
                      const parsed = new Date(dateValue);
                      return isNaN(parsed.getTime()) ? null : parsed;
                    } else if (dateValue instanceof Date) {
                      return dateValue;
                    }
                  } catch (error) {
                    console.error('Błąd konwersji daty:', error, dateValue);
                  }
                  return null;
                };
                
                // NOWY FORMAT: Konwersja dat w partiach (batches)
                const convertedBatches = item.batches?.map(batch => ({
                  ...batch,
                  expiryDate: convertDate(batch.expiryDate)
                })) || [];
                
                // STARY FORMAT: Konwersja daty ważności na poziomie pozycji (kompatybilność wsteczna)
                const convertedExpiryDate = convertDate(item.expiryDate);
                
                return {
                  ...item,
                  batches: convertedBatches,
                  expiryDate: convertedExpiryDate
                };
              }) || []
            };
          });
          unloadingData.push(...variantData);
        }
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
      // Dodaj parametr batchId do URL, aby automatycznie otworzyć dialog szczegółów
      navigate(`/inventory/${itemId}/batches?batchId=${batchId}`);
      return;
    }
    
    try {
      setLoadingBatches(true);
      const batch = await getInventoryBatch(batchId);
      setLoadingBatches(false);
      
      if (batch && batch.itemId) {
        // Dodaj parametr batchId do URL, aby automatycznie otworzyć dialog szczegółów
        navigate(`/inventory/${batch.itemId}/batches?batchId=${batchId}`);
      } else {
        navigate(`/inventory/batch/${batchId}`);
      }
    } catch (error) {
      console.error('Błąd podczas pobierania danych partii:', error);
      setLoadingBatches(false);
      
      if (error.message?.includes('nie istnieje')) {
        showError(t('purchaseOrders.batchNotFoundInDb'));
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
  
  // Funkcja diagnostyczna do analizy dopasowania pozycji
  const getItemMatchingDiagnostics = (item) => {
    if (!unloadingFormResponses || unloadingFormResponses.length === 0) {
      return { matchType: 'none', details: 'Brak formularzy rozładunku' };
    }
    
    let matchByItemId = false;
    let matchByName = false;
    let conflictingItems = [];
    
    for (const response of unloadingFormResponses) {
      if (response.selectedItems && response.selectedItems.length > 0) {
        // Sprawdź dopasowanie po ID
        const foundByItemId = response.selectedItems.find(selectedItem => {
          return selectedItem.poItemId && item.id && selectedItem.poItemId === item.id;
        });
        
        if (foundByItemId) {
          matchByItemId = true;
        }
        
        // Sprawdź dopasowanie po nazwie
        const foundByName = response.selectedItems.filter(selectedItem => {
          const itemName = (item.name || '').toLowerCase().trim();
          const selectedItemName = (selectedItem.productName || '').toLowerCase().trim();
          return itemName && selectedItemName && itemName === selectedItemName;
        });
        
        if (foundByName.length > 0) {
          matchByName = true;
          conflictingItems.push(...foundByName);
        }
      }
    }
    
    if (matchByItemId && matchByName) {
      return { 
        matchType: 'both', 
        details: `Pozycja dopasowana zarówno po ID jak i nazwie`,
        conflictCount: conflictingItems.length
      };
    } else if (matchByItemId) {
      return { 
        matchType: 'id', 
        details: `Pozycja dopasowana dokładnie po ID: ${item.id}` 
      };
    } else if (matchByName) {
      return { 
        matchType: 'name_only', 
        details: `Pozycja dopasowana tylko po nazwie. Znaleziono ${conflictingItems.length} pozycji o tej nazwie`,
        conflictCount: conflictingItems.length
      };
    } else {
      return { 
        matchType: 'none', 
        details: `Pozycja nie znaleziona w formularzach rozładunku` 
      };
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
        // PIERWSZEŃSTWO: Sprawdź dokładne dopasowanie po ID pozycji PO
        const foundByItemId = response.selectedItems.find(selectedItem => {
          return selectedItem.poItemId && item.id && selectedItem.poItemId === item.id;
        });
        
        if (foundByItemId) {
          console.log(`✅ Znaleziono pozycję po dokładnym ID: ${item.id} - ${item.name}`);
          return true;
        }
        
        // USUNIĘTO FALLBACK - TYLKO DOKŁADNE DOPASOWANIE PO ID
      }
    }
    
    console.log(`❌ Pozycja "${item.name}" (ID: ${item.id}) nie została znaleziona w żadnym formularzu rozładunku`);
    return false;
  };
  
  // Funkcja znajdująca informację o dacie ważności dla pozycji PO w odpowiedziach formularzy rozładunku
  // Obsługuje zarówno nowy format z partiami (batches) jak i stary format (kompatybilność wsteczna)
  // ✅ AGREGUJE partie ze WSZYSTKICH raportów rozładunku dla danej pozycji (obsługa wielu dostaw)
  // ✅ FILTRUJE partie, które już zostały przyjęte na magazyn
  const getExpiryInfoFromUnloadingForms = (item) => {
    if (!unloadingFormResponses || unloadingFormResponses.length === 0) {
      return { expiryDate: null, noExpiryDate: false, batches: [], reportsCount: 0 };
    }
    
    // ✅ Pobierz już przyjęte partie dla tej pozycji PO
    const alreadyReceivedBatches = getBatchesByItemId(item.id);
    const receivedBatchNumbers = new Set(
      alreadyReceivedBatches
        .map(batch => (batch.lotNumber || batch.batchNumber || '').toLowerCase().trim())
        .filter(Boolean)
    );
    
    if (receivedBatchNumbers.size > 0) {
      console.log(`🔍 Już przyjęte partie dla pozycji "${item.name}":`, [...receivedBatchNumbers]);
    }
    
    // Pomocnicza funkcja do walidacji daty
    const validateDate = (dateValue) => {
      if (!dateValue) return null;
      try {
        if (dateValue instanceof Date && !isNaN(dateValue.getTime())) {
          return dateValue;
        } else if (typeof dateValue === 'string') {
          const parsedDate = new Date(dateValue);
          return !isNaN(parsedDate.getTime()) ? parsedDate : null;
        } else if (dateValue.toDate && typeof dateValue.toDate === 'function') {
          const convertedDate = dateValue.toDate();
          return !isNaN(convertedDate.getTime()) ? convertedDate : null;
        }
      } catch (error) {
        console.error('Błąd walidacji daty:', error, dateValue);
      }
      return null;
    };
    
    // ✅ Zbierz partie ze WSZYSTKICH raportów rozładunku dla tej pozycji
    const allBatches = [];
    let hasNoExpiryDate = false;
    let firstExpiryDate = null;
    const matchedReportIds = new Set();
    
    // Sprawdzamy wszystkie odpowiedzi formularzy rozładunku
    for (const response of unloadingFormResponses) {
      if (response.selectedItems && response.selectedItems.length > 0) {
        // TYLKO DOKŁADNE DOPASOWANIE PO ID POZYCJI PO
        const foundItem = response.selectedItems.find(selectedItem => {
          return selectedItem.poItemId && item.id && selectedItem.poItemId === item.id;
        });
        
        // Jeśli znaleziono pozycję po dokładnym ID
        if (foundItem) {
          matchedReportIds.add(response.id);
          
          // NOWY FORMAT: Sprawdź czy ma tablicę partii (batches)
          if (foundItem.batches && Array.isArray(foundItem.batches) && foundItem.batches.length > 0) {
            const validBatches = foundItem.batches
              .map(batch => ({
                batchNumber: batch.batchNumber || '',
                unloadedQuantity: batch.unloadedQuantity || '',
                expiryDate: validateDate(batch.expiryDate),
                noExpiryDate: batch.noExpiryDate || false,
                // Dodaj informację o źródłowym raporcie rozładunku
                sourceReportId: response.id,
                sourceReportDate: response.fillDate || response.createdAt
              }))
              // ✅ Filtruj partie, które już zostały przyjęte na magazyn
              .filter(batch => {
                const batchNumLower = (batch.batchNumber || '').toLowerCase().trim();
                
                // Jeśli partia nie ma numeru, nie możemy jej porównać - przepuść ją
                if (!batchNumLower) {
                  return true;
                }
                
                // Sprawdź czy partia już została przyjęta
                const isAlreadyReceived = receivedBatchNumbers.has(batchNumLower);
                
                if (isAlreadyReceived) {
                  console.log(`⏭️ Pomijam już przyjętą partię "${batch.batchNumber}" dla pozycji "${item.name}"`);
                }
                
                return !isAlreadyReceived;
              });
            
            // Dodaj przefiltrowane partie do agregowanej listy
            allBatches.push(...validBatches);
            
            // Aktualizuj flagi daty ważności
            const batchWithDate = validBatches.find(b => b.expiryDate);
            const batchNoExpiry = validBatches.find(b => b.noExpiryDate);
            
            if (batchWithDate && !firstExpiryDate) {
              firstExpiryDate = batchWithDate.expiryDate;
            }
            if (batchNoExpiry) {
              hasNoExpiryDate = true;
            }
            
            if (validBatches.length > 0) {
              console.log(`📦 Znaleziono ${validBatches.length} nieprzyjętych partii dla pozycji "${item.name}" w raporcie ${response.id}`);
            }
          }
          // STARY FORMAT: Sprawdź czy zaznaczono "nie dotyczy"
          else if (foundItem.noExpiryDate === true) {
            console.log(`🚫 Pozycja "${item.name}" (ID: ${item.id}) ma zaznaczone "nie dotyczy" dla daty ważności w raporcie ${response.id}`);
            hasNoExpiryDate = true;
            // Dodaj jako pojedynczą partię (stary format)
            allBatches.push({
              batchNumber: '',
              unloadedQuantity: foundItem.unloadedQuantity || '',
              expiryDate: null,
              noExpiryDate: true,
              sourceReportId: response.id,
              sourceReportDate: response.fillDate || response.createdAt
            });
          }
          // STARY FORMAT: Sprawdź czy ma datę ważności i czy jest prawidłowa
          else {
            const validDate = validateDate(foundItem.expiryDate);
            
            if (validDate) {
              console.log(`📅 Znaleziono prawidłową datę ważności dla pozycji "${item.name}" (ID: ${item.id}) w raporcie ${response.id}:`, validDate);
              if (!firstExpiryDate) {
                firstExpiryDate = validDate;
              }
              // Dodaj jako pojedynczą partię (stary format)
              allBatches.push({
                batchNumber: '',
                unloadedQuantity: foundItem.unloadedQuantity || '',
                expiryDate: validDate,
                noExpiryDate: false,
                sourceReportId: response.id,
                sourceReportDate: response.fillDate || response.createdAt
              });
            } else if (foundItem.unloadedQuantity) {
              // Pozycja bez daty ważności ale z ilością - też dodaj
              allBatches.push({
                batchNumber: '',
                unloadedQuantity: foundItem.unloadedQuantity || '',
                expiryDate: null,
                noExpiryDate: false,
                sourceReportId: response.id,
                sourceReportDate: response.fillDate || response.createdAt
              });
            }
          }
        }
      }
    }
    
    // Zwróć zagregowane wyniki ze wszystkich raportów (tylko nieprzyjęte partie)
    if (allBatches.length > 0) {
      const reportsCount = matchedReportIds.size;
      if (reportsCount > 1) {
        console.log(`📦 Łącznie ${allBatches.length} nieprzyjętych partii dla pozycji "${item.name}" z ${reportsCount} raportów rozładunku`);
      } else {
        console.log(`📦 ${allBatches.length} nieprzyjętych partii dla pozycji "${item.name}" z 1 raportu rozładunku`);
      }
      
      return { 
        expiryDate: firstExpiryDate, 
        noExpiryDate: !firstExpiryDate && hasNoExpiryDate,
        batches: allBatches,
        reportsCount: reportsCount
      };
    }
    
    // Nie znaleziono pozycji w żadnym formularzu rozładunku LUB wszystkie partie już przyjęte
    console.log(`ℹ️ Brak nieprzyjętych partii dla pozycji "${item.name}" (wszystkie mogły zostać już przyjęte)`);
    return { expiryDate: null, noExpiryDate: false, batches: [], reportsCount: 0 };
  };

  // Kompatybilność wsteczna - funkcja zwracająca tylko datę ważności
  const getExpiryDateFromUnloadingForms = (item) => {
    const expiryInfo = getExpiryInfoFromUnloadingForms(item);
    return expiryInfo.expiryDate;
  };
  
  if (loading) {
    return <Typography>{t('purchaseOrders.loadingOrderDetails')}</Typography>;
  }
  
  if (!purchaseOrder) {
    return <Typography>{t('purchaseOrders.orderNotFound')}</Typography>;
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
      // Sprawdź czy status zmienia się na "ordered" i czy są pozycje z krótką datą ważności
      if (newStatus === 'ordered' && 
          purchaseOrder?.items?.length > 0 && 
          purchaseOrder?.orderDate) {
        
        const itemsWithShortExpiry = checkShortExpiryItems(purchaseOrder.items, purchaseOrder.orderDate);
        if (itemsWithShortExpiry.length > 0) {
          // Pokaż dialog potwierdzenia dla krótkich dat ważności
          setShortExpiryItems(itemsWithShortExpiry);
          setShortExpiryConfirmDialogOpen(true);
          return;
        }
      }
      
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
      setNewStatus('');
      
      // Odśwież dane zamówienia
      const updatedOrder = await getPurchaseOrderById(orderId);
      setPurchaseOrder(updatedOrder);
      
      showSuccess(t('purchaseOrders.statusUpdated'));
    } catch (error) {
      // Wyświetl konkretny komunikat błędu jeśli dostępny, w przeciwnym razie ogólny
      const errorMessage = error.message || t('purchaseOrders.errors.statusUpdateFailed');
      showError(errorMessage);
      setStatusDialogOpen(false);
      setNewStatus('');
    }
  };

  // Funkcje obsługujące dialog potwierdzenia krótkich dat ważności
  const handleShortExpiryConfirm = async () => {
    try {
      setShortExpiryConfirmDialogOpen(false);
      
      // Kontynuuj z aktualizacją statusu
      await updatePurchaseOrderStatus(orderId, newStatus, currentUser.uid);
      setStatusDialogOpen(false);
      
      // Odśwież dane zamówienia
      const updatedOrder = await getPurchaseOrderById(orderId);
      setPurchaseOrder(updatedOrder);
      
      showSuccess(t('purchaseOrders.statusUpdated'));
    } catch (error) {
      const errorMessage = error.message || t('purchaseOrders.errors.statusUpdateFailed');
      showError(errorMessage);
    } finally {
      setNewStatus('');
      setShortExpiryItems([]);
    }
  };

  const handleShortExpiryCancel = () => {
    setShortExpiryConfirmDialogOpen(false);
    setShortExpiryItems([]);
    setNewStatus('');
  };
  
  const handleReceiveClick = (item) => {
    setItemToReceive(item);
    setReceiveDialogOpen(true);
  };
  
  const handleReceiveItem = () => {
    if (!itemToReceive || !itemToReceive.inventoryItemId) {
      showError(t('purchaseOrders.errors.productNotLinked'));
      setReceiveDialogOpen(false);
      return;
    }
    
    // Walidacja: sprawdź czy pozycja znajduje się w odpowiedziach formularzy rozładunku
    if (!isItemInUnloadingForms(itemToReceive)) {
      const diagnostics = getItemMatchingDiagnostics(itemToReceive);
      
      let errorMessage = `Nie można przyjąć towaru dla pozycji "${itemToReceive.name}" (ID: ${itemToReceive.id}).`;
      
      switch (diagnostics.matchType) {
        case 'none':
          errorMessage += ` Pozycja nie została zgłoszona w żadnym raporcie rozładunku dla tego zamówienia.`;
          break;
        case 'name_only':
          errorMessage += ` System wymaga teraz dokładnego dopasowania pozycji. Ta pozycja nie została zaznaczona w formularzu rozładunku (znaleziono tylko pozycje o tej nazwie ale z innymi ID). Zaznacz tę konkretną pozycję w formularzu rozładunku.`;
          break;
        default:
          errorMessage += ` Pozycja nie została poprawnie zgłoszona w raportach rozładunku lub brakuje jej unikatowego ID.`;
      }
      
      showError(errorMessage);
      setReceiveDialogOpen(false);
      return;
    }
    
    const unitPrice = typeof itemToReceive.unitPrice === 'number' 
      ? itemToReceive.unitPrice 
      : parseFloat(itemToReceive.unitPrice || 0);
    
    // Pobierz informację z odpowiedzi formularza rozładunku (w tym partie)
    const expiryInfo = getExpiryInfoFromUnloadingForms(itemToReceive);
    
    const queryParams = new URLSearchParams();
    queryParams.append('poNumber', purchaseOrder.number);
    queryParams.append('orderId', orderId);
    
    // Oblicz sumę ilości ze wszystkich partii lub użyj ilości z PO
    // Agreguje partie ze wszystkich dostaw (raportów rozładunku)
    let totalQuantity = itemToReceive.quantity;
    if (expiryInfo.batches && expiryInfo.batches.length > 0) {
      const batchesSum = expiryInfo.batches.reduce((sum, batch) => 
        sum + parseFloat(batch.unloadedQuantity || 0), 0);
      if (batchesSum > 0) {
        totalQuantity = batchesSum;
      }
      
      // Log informacyjny gdy partie pochodzą z wielu dostaw
      if (expiryInfo.reportsCount > 1) {
        console.log(`📦 Agregacja z wielu dostaw: ${expiryInfo.batches.length} partii z ${expiryInfo.reportsCount} raportów rozładunku, łączna ilość: ${totalQuantity}`);
      }
    }
    queryParams.append('quantity', totalQuantity);
    
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
    
    // Przekaż WSZYSTKIE partie z raportu rozładunku jako JSON
    if (expiryInfo.batches && expiryInfo.batches.length > 0) {
      const batchesToPass = expiryInfo.batches.map(batch => ({
        batchNumber: batch.batchNumber || '',
        quantity: batch.unloadedQuantity || '',
        expiryDate: batch.expiryDate instanceof Date ? batch.expiryDate.toISOString() : (batch.expiryDate || null),
        noExpiryDate: batch.noExpiryDate || false
      }));
      
      queryParams.append('batches', JSON.stringify(batchesToPass));
      console.log(`📦 Przekazywanie ${batchesToPass.length} partii do formularza przyjmowania:`, batchesToPass);
    } else {
      // Stary format - przekaż pojedyncze dane (kompatybilność wsteczna)
      if (expiryInfo.noExpiryDate) {
        queryParams.append('noExpiryDate', 'true');
        console.log(`🚫 Przekazywanie informacji "brak terminu ważności" do formularza przyjmowania`);
      } else if (expiryInfo.expiryDate) {
        const expiryDateString = expiryInfo.expiryDate instanceof Date 
          ? expiryInfo.expiryDate.toISOString() 
          : new Date(expiryInfo.expiryDate).toISOString();
        queryParams.append('expiryDate', expiryDateString);
        console.log(`📅 Przekazywanie daty ważności do formularza przyjmowania: ${expiryDateString}`);
      }
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
      const { updateSupplierPricesFromCompletedPO } = await import('../../services/inventory');
      const result = await updateSupplierPricesFromCompletedPO(orderId, currentUser.uid);
      
      if (result.success) {
        if (result.updated > 0) {
          showSuccess(`Zaktualizowano ${result.updated} cen dostawców na podstawie tego zamówienia i ustawiono jako domyślne`);
        } else {
          showSuccess(t('purchaseOrders.noPricesToUpdate'));
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
          const { updateSupplierPricesFromCompletedPO } = await import('../../services/inventory');
          const result = await updateSupplierPricesFromCompletedPO(pendingStatusUpdate.orderId, currentUser.uid);
          
          if (result.success && result.updated > 0) {
            showSuccess(`Status zamówienia został zaktualizowany. Dodatkowo zaktualizowano ${result.updated} cen dostawców i ustawiono jako domyślne.`);
          } else {
            showSuccess(t('purchaseOrders.statusUpdatedNoPrices'));
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
    let label = translatePaymentStatus(status);
    let color = '#f44336'; // czerwony domyślny dla nie opłacone
    
    // Jeśli status to "to_be_paid", wyświetl daty płatności
    if (status === PURCHASE_ORDER_PAYMENT_STATUSES.TO_BE_PAID && purchaseOrder?.items) {
      const paymentDates = getNextPaymentDueDate(purchaseOrder.items);
      if (paymentDates.length > 0) {
        // Formatuj wszystkie daty i połącz przecinkami
        const formattedDates = paymentDates
          .map(date => format(new Date(date), 'dd.MM.yyyy'))
          .join(', ');
        label = formattedDates;
      }
    }
    
    switch (status) {
      case PURCHASE_ORDER_PAYMENT_STATUSES.PAID:
        color = '#4caf50'; // zielony - opłacone
        break;
      case PURCHASE_ORDER_PAYMENT_STATUSES.PARTIALLY_PAID:
        color = '#2196f3'; // niebieski - częściowo opłacone
        break;
      case PURCHASE_ORDER_PAYMENT_STATUSES.TO_BE_PAID:
        color = '#ff9800'; // pomarańczowy - do zapłaty
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
  
  const handleDownloadPDF = async (hidePricing = false) => {
    if (!purchaseOrder) {
      showError(t('purchaseOrders.details.noPdfData'));
      return;
    }
    
    try {
      const pdfType = hidePricing ? 'bez cen' : 'standardowy';
      showSuccess(`Generowanie PDF ${pdfType} w toku...`);
      
      // Użyj nowego komponentu do generowania PDF z optymalizacją rozmiaru
      const pdfGenerator = createPurchaseOrderPdfGenerator(purchaseOrder, {
        useTemplate: true,
        templatePath: '/templates/PO-template.png',
        language: 'en',
        hidePricing: hidePricing,
        useOriginalCurrency: true,  // Wyświetlaj ceny w oryginalnych walutach
        imageQuality: 0.95,         // Jakość kompresji obrazu dla zbalansowanego rozmiaru i jakości
        enableCompression: true,    // Włącz kompresję PDF
        precision: 2,               // Ogranicz precyzję do 2 miejsc po przecinku
        dpi: 150                    // Wyższa jakość renderowania obrazu
      });
      
      await pdfGenerator.downloadPdf();
      showSuccess(`PDF ${pdfType} został pobrany pomyślnie`);
      
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

  const handlePdfMenuOpen = (event) => {
    setPdfMenuAnchorEl(event.currentTarget);
    setPdfMenuOpen(true);
  };

  const handlePdfMenuClose = () => {
    setPdfMenuOpen(false);
    setPdfMenuAnchorEl(null);
  };

  const handlePdfDownload = (hidePricing) => {
    handlePdfMenuClose();
    handleDownloadPDF(hidePricing);
  };

  const handlePaymentStatusUpdate = async () => {
    try {
      await updatePurchaseOrderPaymentStatus(orderId, newPaymentStatus, currentUser.uid);
      setPaymentStatusDialogOpen(false);
      
      // Odśwież dane zamówienia
      const updatedOrder = await getPurchaseOrderById(orderId);
      setPurchaseOrder(updatedOrder);
      
      showSuccess(t('purchaseOrders.paymentStatusUpdated'));
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu płatności:', error);
      showError('Nie udało się zaktualizować statusu płatności');
    } finally {
      setNewPaymentStatus('');
      setPaymentStatusDialogOpen(false);
    }
  };

  // Funkcje obsługi dialogu migracji CoA
  const handleCoAMigration = () => {
    setCoaMigrationDialogOpen(true);
  };

  const handleCoAMigrationClose = () => {
    setCoaMigrationDialogOpen(false);
  };

  const handleCoAMigrationComplete = () => {
    // Odśwież dane partii po migracji
    fetchRelatedBatches(orderId);
    showSuccess('Migracja załączników CoA została zakończona');
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

  const calculateVATValues = (items = [], additionalCostsItems = [], globalDiscount = 0) => {
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
    
    // Suma wartości netto przed rabatem: produkty + dodatkowe koszty
    const totalNetBeforeDiscount = itemsNetTotal + additionalCostsNetTotal;
    
    // Suma VAT przed rabatem: VAT od produktów + VAT od dodatkowych kosztów
    const totalVatBeforeDiscount = itemsVatTotal + additionalCostsVatTotal;
    
    // Wartość brutto przed rabatem: suma netto + suma VAT
    const totalGrossBeforeDiscount = totalNetBeforeDiscount + totalVatBeforeDiscount;
    
    // Obliczanie rabatu globalnego (stosowany do wartości brutto)
    const globalDiscountMultiplier = (100 - parseFloat(globalDiscount || 0)) / 100;
    const discountAmount = totalGrossBeforeDiscount * (parseFloat(globalDiscount || 0) / 100);
    
    // Końcowe wartości z uwzględnieniem rabatu globalnego
    const totalNet = totalNetBeforeDiscount * globalDiscountMultiplier;
    const totalVat = totalVatBeforeDiscount * globalDiscountMultiplier;
    const totalGross = totalGrossBeforeDiscount * globalDiscountMultiplier;
    
    return {
      itemsNetTotal,
      itemsVatTotal,
      additionalCostsNetTotal,
      additionalCostsVatTotal,
      totalNetBeforeDiscount,
      totalVatBeforeDiscount,
      totalGrossBeforeDiscount,
      discountAmount,
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
        <Box sx={{ ...loadingContainer, height: '50vh' }}>
          <CircularProgress />
        </Box>
      ) : purchaseOrder ? (
        <>
          <Box sx={{ mb: 4, ...flexBetween }}>
            <Button
              component={Link}
              to="/purchase-orders"
              startIcon={<ArrowBackIcon />}
              variant="outlined"
            >
              {t('purchaseOrders.backToList')}
            </Button>
            <Typography variant="h4" component="h1">
              {t('purchaseOrders.details.orderTitle', { number: purchaseOrder.number })}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ButtonGroup variant="outlined">
                <Button
                  onClick={() => handlePdfDownload(false)}
                  startIcon={<DownloadIcon />}
                  size="medium"
                >
                  {t('purchaseOrders.downloadPdf')}
                </Button>
                <Button
                  onClick={handlePdfMenuOpen}
                  sx={{ 
                    minWidth: '32px',
                    px: 1,
                    borderLeft: '1px solid rgba(25, 118, 210, 0.5) !important'
                  }}
                  size="medium"
                >
                  <ArrowDropDownIcon />
                </Button>
              </ButtonGroup>

              <Menu
                anchorEl={pdfMenuAnchorEl}
                open={pdfMenuOpen}
                onClose={handlePdfMenuClose}
                anchorOrigin={{
                  vertical: 'bottom',
                  horizontal: 'left',
                }}
                transformOrigin={{
                  vertical: 'top',
                  horizontal: 'left',
                }}
              >
                <MenuItem onClick={() => handlePdfDownload(false)}>
                  <PdfIcon sx={mr1} />
                  PDF standardowy (z cenami)
                </MenuItem>
                <MenuItem onClick={() => handlePdfDownload(true)}>
                  <PdfIcon sx={mr1} />
                  PDF bez cen i kosztów
                </MenuItem>
              </Menu>
              
              <Button
                component={Link}
                to={`/purchase-orders/${orderId}/edit`}
                variant="contained"
                startIcon={<EditIcon />}
                size="medium"
              >
                {t('purchaseOrders.editOrder')}
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
                    <RefreshIcon sx={mr1} />
                    Aktualizuj ceny partii
                  </MenuItem>
                )}
                
                {purchaseOrder?.items?.length > 0 && (
                  <MenuItem onClick={handleUpdateBasePrices}>
                    <RefreshIcon sx={mr1} />
                    Aktualizuj ceny bazowe
                  </MenuItem>
                )}

                {purchaseOrder?.items?.length > 0 && purchaseOrder?.supplier?.id && (
                  <MenuItem onClick={handleUpdateSupplierPrices}>
                    <RefreshIcon sx={mr1} />
                    Aktualizuj ceny dostawcy
                  </MenuItem>
                )}
                
                <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
                  <DeleteIcon sx={mr1} />
                  {t('purchaseOrders.details.deleteOrder')}
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
                  <Box sx={mb2}>
                    <Typography variant="h5" component="h1">
                      {t('purchaseOrders.details.orderNumber', { number: purchaseOrder.number })}
                      <Box component="span" sx={{ ml: 2 }}>
                        {getStatusChip(purchaseOrder.status)}
                      </Box>
                      <Box component="span" sx={{ ml: 1 }}>
                        {getPaymentStatusChip(purchaseOrder.paymentStatus)}
                      </Box>
                    </Typography>
                  </Box>
                  
                  <Typography variant="body1" gutterBottom>
                    <strong>{t('purchaseOrders.details.orderDate')}:</strong> {formatDate(purchaseOrder.orderDate)}
                  </Typography>
                  
                  <Typography variant="body1" gutterBottom>
                    <strong>{t('purchaseOrders.details.expectedDeliveryDate')}:</strong> {formatDate(purchaseOrder.expectedDeliveryDate)}
                  </Typography>
                  
                  {purchaseOrder.incoterms && (
                    <Typography variant="body1" gutterBottom>
                      <strong>{t('purchaseOrders.details.incoterms')}:</strong> {purchaseOrder.incoterms}
                    </Typography>
                  )}
                  
                  {purchaseOrder.status === PURCHASE_ORDER_STATUSES.DELIVERED && (
                    <Typography variant="body1" gutterBottom>
                      <strong>{t('purchaseOrders.details.deliveryDate')}:</strong> {formatDate(purchaseOrder.deliveredAt)}
                    </Typography>
                  )}
                  
                  {purchaseOrder.invoiceLink && (!purchaseOrder.invoiceLinks || purchaseOrder.invoiceLinks.length === 0) && (
                    <Typography variant="body1" gutterBottom>
                      <strong>{t('purchaseOrders.details.invoice')}:</strong>{' '}
                      <a href={purchaseOrder.invoiceLink} target="_blank" rel="noopener noreferrer">
                        {t('purchaseOrders.details.viewInvoice')}
                      </a>
                    </Typography>
                  )}
                  
                  {purchaseOrder.invoiceLinks && purchaseOrder.invoiceLinks.length > 0 && (
                    <>
                      <Typography variant="body1" gutterBottom>
                        <strong>{t('purchaseOrders.details.invoices')}:</strong>
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
                  <Typography variant="h6" gutterBottom>{t('purchaseOrders.details.supplier')}</Typography>
                  
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
                      {t('purchaseOrders.details.noSupplierData')}
                    </Typography>
                  )}
                </Grid>
              </Grid>
            </Paper>
            
            {purchaseOrder.statusHistory && purchaseOrder.statusHistory.length > 0 && (
              <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>
                  {t('purchaseOrders.details.statusHistory')}
                </Typography>
                
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('purchaseOrders.details.table.dateTime')}</TableCell>
                      <TableCell>{t('purchaseOrders.details.table.previousStatus')}</TableCell>
                      <TableCell>{t('purchaseOrders.details.table.newStatus')}</TableCell>
                      <TableCell>{t('purchaseOrders.details.table.changedBy')}</TableCell>
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
              <Typography variant="h6" gutterBottom>{t('purchaseOrders.details.orderElements')}</Typography>
              
              <TableContainer sx={mb3}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('purchaseOrders.details.table.productName')}</TableCell>
                      <TableCell align="right">{t('purchaseOrders.details.table.quantity')}</TableCell>
                      <TableCell>{t('purchaseOrders.details.table.unit')}</TableCell>
                      <TableCell align="right">{t('purchaseOrders.details.table.unitPrice')}</TableCell>
                      <TableCell align="right">{t('purchaseOrders.details.table.discount')}</TableCell>
                      <TableCell align="right">{t('purchaseOrders.details.table.unitPriceAfterDiscount')}</TableCell>
                      <TableCell align="right">{t('purchaseOrders.details.table.netValue')}</TableCell>
                      <TableCell align="right">{t('purchaseOrders.details.table.originalAmount')}</TableCell>
                      <TableCell align="right">Termin płatności</TableCell>
                      <TableCell align="right">{t('purchaseOrders.details.table.plannedDeliveryDate')}</TableCell>
                      <TableCell align="right">{t('purchaseOrders.details.table.actualDeliveryDate')}</TableCell>
                      <TableCell align="right">{t('purchaseOrders.details.table.received')}</TableCell>
                      <TableCell align="right">Refakturowane</TableCell>
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
                      
                      // Oblicz cenę jednostkową po rabacie
                      const unitPrice = parseFloat(item.unitPrice) || 0;
                      const discount = parseFloat(item.discount) || 0;
                      const discountMultiplier = (100 - discount) / 100;
                      const unitPriceAfterDiscount = unitPrice * discountMultiplier;
                      
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
                                {/* Dodaj przycisk rozwijania, jeśli istnieją LOTy lub rezerwacje dla tego produktu */}
                                {(getBatchesByItemId(item.id).length > 0 || getReservationsByItemId(item.id).length > 0) && (
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
                            <TableCell align="right">
                              {item.discount ? `${item.discount}%` : '-'}
                            </TableCell>
                            <TableCell align="right">
                              <Box sx={{ 
                                color: discount > 0 ? 'success.main' : 'inherit',
                                fontWeight: discount > 0 ? 'bold' : 'normal'
                              }}>
                                {formatCurrency(unitPriceAfterDiscount, purchaseOrder.currency, 6)}
                                {discount > 0 && (
                                  <Typography variant="caption" sx={{ display: 'block', color: 'success.main' }}>
                                    (oszczędność: {formatCurrency(unitPrice - unitPriceAfterDiscount, purchaseOrder.currency, 6)})
                                  </Typography>
                                )}
                              </Box>
                            </TableCell>
                            <TableCell align="right">{formatCurrency(item.totalPrice, purchaseOrder.currency)}</TableCell>
                            <TableCell align="right">
                              {item.currency && item.currency !== purchaseOrder.currency && item.originalUnitPrice 
                                    ? formatCurrency(item.originalUnitPrice * item.quantity, item.currency) 
                                    : item.currency === 'EUR' && purchaseOrder.currency === 'EUR'
                                      ? formatCurrency(item.totalPrice, item.currency)
                                      : "-"}
                            </TableCell>
                            <TableCell align="right">{item.paymentDueDate ? formatDate(item.paymentDueDate) : '-'}</TableCell>
                            <TableCell align="right">{item.plannedDeliveryDate ? formatDate(item.plannedDeliveryDate) : '-'}</TableCell>
                            <TableCell align="right">{item.actualDeliveryDate ? formatDate(item.actualDeliveryDate) : '-'}</TableCell>
                            <TableCell align="right">
                              {received} {received > 0 && `(${fulfilledPercentage.toFixed(0)}%)`}
                            </TableCell>
                            {/* Kolumna refakturowane */}
                            <TableCell align="right">
                              {(() => {
                                const itemId = item.id;
                                const reinvoicedData = reinvoicedAmounts.items[itemId];
                                const reinvoicedAmount = reinvoicedData?.totalReinvoiced || 0;
                                const itemValue = parseFloat(item.totalPrice) || 0;
                                const isFullyReinvoiced = Math.abs(reinvoicedAmount - itemValue) < 0.01;
                                const hasDiscrepancy = reinvoicedAmount > 0 && !isFullyReinvoiced;
                                const discrepancyAmount = reinvoicedAmount - itemValue;
                                
                                if (reinvoicedAmount > 0) {
                                  return (
                                    <Tooltip 
                                      title={
                                        <Box>
                                          <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                                            Refakturowano do {reinvoicedData.invoices.length} {reinvoicedData.invoices.length === 1 ? 'faktury' : 'faktur'}:
                                          </Typography>
                                          {reinvoicedData.invoices.map((inv, i) => (
                                            <Typography key={i} variant="body2">
                                              • {inv.invoiceNumber} → {inv.customerName || 'Brak klienta'}: {formatCurrency(inv.itemValue, purchaseOrder.currency)}
                                            </Typography>
                                          ))}
                                          {hasDiscrepancy && (
                                            <Typography variant="body2" sx={{ mt: 0.5, color: 'error.light', fontWeight: 'bold' }}>
                                              Niezgodność: {discrepancyAmount > 0 ? '+' : ''}{formatCurrency(discrepancyAmount, purchaseOrder.currency)} ({discrepancyAmount > 0 ? 'nadwyżka' : 'niedobór'} vs wartość PO: {formatCurrency(itemValue, purchaseOrder.currency)})
                                            </Typography>
                                          )}
                                        </Box>
                                      }
                                    >
                                      <Typography 
                                        sx={{ 
                                          color: isFullyReinvoiced ? 'success.main' : 'error.main',
                                          fontWeight: 'medium',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'flex-end',
                                          gap: 0.5
                                        }}
                                      >
                                        {isFullyReinvoiced ? '✅' : '❌'}
                                        {formatCurrency(reinvoicedAmount, purchaseOrder.currency)}
                                      </Typography>
                                    </Tooltip>
                                  );
                                }
                                return <Typography color="text.secondary">—</Typography>;
                              })()}
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
                                    tooltipText = t('purchaseOrders.details.itemReportedInUnloading');
                                    
                                    // Pokaż liczbę partii i dostaw
                                    const batchCount = expiryInfo.batches?.length || 0;
                                    const reportsCount = expiryInfo.reportsCount || 0;
                                    
                                    if (batchCount > 0) {
                                      if (reportsCount > 1) {
                                        tooltipText += ` (${batchCount} partii z ${reportsCount} dostaw)`;
                                      } else {
                                        tooltipText += ` (${batchCount} ${batchCount === 1 ? 'partia' : batchCount < 5 ? 'partie' : 'partii'})`;
                                      }
                                    }
                                    
                                    if (expiryInfo.noExpiryDate) {
                                      tooltipText += ` • brak terminu ważności`;
                                    } else if (expiryInfo.expiryDate) {
                                      const expiryDateStr = expiryInfo.expiryDate instanceof Date 
                                        ? expiryInfo.expiryDate.toLocaleDateString('pl-PL')
                                        : new Date(expiryInfo.expiryDate).toLocaleDateString('pl-PL');
                                      tooltipText += ` • data ważności: ${expiryDateStr}`;
                                    }
                                  } else {
                                    tooltipText = t('purchaseOrders.details.itemNotReportedInUnloading');
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
                                          {itemInUnloadingForm ? t('purchaseOrders.details.receive') : t('purchaseOrders.details.notInReport')}
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
                              <TableCell colSpan={15} sx={{ py: 0, backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
                                <Collapse in={expandedItems[item.id]} timeout="auto" unmountOnExit>
                                  <Box sx={{ m: 2 }}>
                                    <Typography variant="subtitle2" gutterBottom component="div">
                                      {t('purchaseOrders.details.batchesAssignedToItem')}
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
                                                    {t('common.quantity')}: {batch.quantity} {item.unit}
                                                  </Typography>
                                                  {batch.receivedDate && (
                                                    <Typography component="span" variant="body2" display="block" color="text.secondary">
                                                      Przyjęto: {new Date(batch.receivedDate.seconds * 1000).toLocaleDateString('pl-PL')}
                                                    </Typography>
                                                  )}
                                                  {batch.warehouseId && (
                                                    <Typography component="span" variant="body2" display="block" color="text.secondary">
                                                      {t('purchaseOrders.details.batches.warehouse')}: {batch.warehouseName || warehouseNames[batch.warehouseId] || batch.warehouseId}
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
                                              {t('purchaseOrders.details.table.details')}
                                            </Button>
                                          </ListItem>
                                        ))}
                                      </List>
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">
                                        {t('purchaseOrders.details.batches.noBatchesAssigned')}
                                      </Typography>
                                    )}
                                    
                                    {/* Rezerwacje PO */}
                                    <Divider sx={{ my: 2 }} />
                                    
                                    <Typography variant="subtitle2" gutterBottom component="div" sx={{ mt: 2 }}>
                                      Rezerwacje PO
                                      <Chip 
                                        label={getReservationsByItemId(item.id).length} 
                                        size="small" 
                                        color="primary" 
                                        sx={{ ml: 1 }} 
                                      />
                                    </Typography>
                                    
                                    {getReservationsByItemId(item.id).length > 0 ? (
                                      <>
                                      <List dense>
                                        {getReservationsByItemId(item.id).map((reservation) => {
                                          // Określ kolor statusu
                                          const statusColors = {
                                            'pending': 'warning',
                                            'delivered': 'success',
                                            'converted': 'info'
                                          };
                                          
                                          return (
                                            <ListItem 
                                              key={reservation.id} 
                                              sx={{ 
                                                bgcolor: 'background.paper', 
                                                mb: 0.5, 
                                                borderRadius: 1,
                                                cursor: 'pointer',
                                                '&:hover': { bgcolor: 'action.hover' },
                                                border: '1px solid',
                                                borderColor: 'divider'
                                              }}
                                              component={Link}
                                              to={`/production/tasks/${reservation.taskId}`}
                                            >
                                              <ListItemIcon>
                                                <AssignmentIcon color="primary" />
                                              </ListItemIcon>
                                              <ListItemText
                                                primary={
                                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                    <Typography variant="body2" fontWeight="medium">
                                                      {reservation.taskNumber}
                                                    </Typography>
                                                    <Chip 
                                                      label={
                                                        reservation.status === 'pending' ? 'Oczekująca' :
                                                        reservation.status === 'delivered' ? 'Dostarczona' :
                                                        reservation.status === 'converted' ? 'Przekonwertowana' :
                                                        reservation.status
                                                      }
                                                      size="small"
                                                      color={statusColors[reservation.status] || 'default'}
                                                    />
                                                  </Box>
                                                }
                                                secondary={
                                                  <React.Fragment>
                                                    <Typography component="span" variant="body2" color="text.primary" display="block">
                                                      {reservation.taskName}
                                                    </Typography>
                                                    <Typography component="span" variant="body2" color="text.secondary" display="block">
                                                      Zarezerwowano: {reservation.reservedQuantity} {item.unit}
                                                      {' • '}
                                                      Cena: {formatCurrency(reservation.unitPrice, reservation.currency || purchaseOrder.currency)}
                                                      {' • '}
                                                      Wartość: {formatCurrency(reservation.reservedQuantity * reservation.unitPrice, reservation.currency || purchaseOrder.currency)}
                                                    </Typography>
                                                    {reservation.reservedAt && (
                                                      <Typography component="span" variant="body2" display="block" color="text.secondary">
                                                        Data rezerwacji: {new Date(reservation.reservedAt).toLocaleDateString('pl-PL')}
                                                      </Typography>
                                                    )}
                                                    {reservation.deliveredQuantity > 0 && (
                                                      <Typography component="span" variant="body2" display="block" color="success.main">
                                                        Dostarczone: {reservation.deliveredQuantity} {item.unit}
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
                                                component={Link}
                                                to={`/production/tasks/${reservation.taskId}`}
                                                onClick={(e) => e.stopPropagation()}
                                              >
                                                Zobacz MO
                                              </Button>
                                            </ListItem>
                                          );
                                        })}
                                      </List>
                                      {/* Suma rezerwacji PO - wyświetlana gdy więcej niż 1 rezerwacja */}
                                      {getReservationsByItemId(item.id).length > 1 && (() => {
                                        const reservations = getReservationsByItemId(item.id);
                                        const totalQuantity = reservations.reduce((sum, r) => sum + (r.reservedQuantity || 0), 0);
                                        const totalValue = reservations.reduce((sum, r) => sum + ((r.reservedQuantity || 0) * (r.unitPrice || 0)), 0);
                                        const totalDelivered = reservations.reduce((sum, r) => sum + (r.deliveredQuantity || 0), 0);
                                        const currency = reservations[0]?.currency || purchaseOrder.currency;
                                        
                                        return (
                                          <Box sx={{ 
                                            mt: 1, 
                                            p: 1.5, 
                                            bgcolor: 'primary.50', 
                                            borderRadius: 1, 
                                            border: '1px solid',
                                            borderColor: 'primary.200',
                                            backgroundColor: 'rgba(25, 118, 210, 0.08)'
                                          }}>
                                            <Typography variant="subtitle2" color="primary.main" gutterBottom>
                                              Suma rezerwacji ({reservations.length})
                                            </Typography>
                                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                                              <Typography variant="body2" color="text.primary">
                                                Łączna ilość: <strong>{totalQuantity} {item.unit}</strong>
                                              </Typography>
                                              <Typography variant="body2" color="text.primary">
                                                Łączna wartość: <strong>{formatCurrency(totalValue, currency)}</strong>
                                              </Typography>
                                              {totalDelivered > 0 && (
                                                <Typography variant="body2" color="success.main">
                                                  Łącznie dostarczone: <strong>{totalDelivered} {item.unit}</strong>
                                                </Typography>
                                              )}
                                            </Box>
                                          </Box>
                                        );
                                      })()}
                                      </>
                                    ) : (
                                      <Typography variant="body2" color="text.secondary">
                                        Brak rezerwacji PO dla tej pozycji
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
                      <Typography variant="subtitle1" gutterBottom>{t('purchaseOrders.details.table.notes')}:</Typography>
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
                    {/* Sekcja wartości produktów */}
                    <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: 'background.default', width: '100%', borderRadius: 2 }}>
                      <Typography variant="body1" gutterBottom sx={{ color: 'text.primary' }}>
                        <strong>{t('purchaseOrders.details.summary.productsNetValue')}:</strong> {formatCurrency(purchaseOrder.items.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0), purchaseOrder.currency)}
                      </Typography>
                      
                      {/* Sekcja VAT dla produktów */}
                      {purchaseOrder.items.length > 0 && (
                        <>
                          <Typography variant="subtitle2" sx={{ mt: 1.5, mb: 0.5, color: 'text.secondary' }}>
                            {t('purchaseOrders.details.summary.vatFromProducts')}:
                          </Typography>
                          <Box sx={{ pl: 2 }}>
                            {/* Grupowanie pozycji według stawki VAT */}
                            {Array.from(new Set(purchaseOrder.items.map(item => item.vatRate))).sort((a, b) => a - b).map(vatRate => {
                              if (vatRate === undefined) return null;
                              
                              const itemsWithSameVat = purchaseOrder.items.filter(item => item.vatRate === vatRate);
                              const sumNet = itemsWithSameVat.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
                              const vatValue = typeof vatRate === 'number' ? (sumNet * vatRate) / 100 : 0;
                              
                              return (
                                <Typography key={vatRate} variant="body2" sx={{ mb: 0.5, color: 'text.secondary' }}>
                                  Stawka {vatRate}%: <strong>{formatCurrency(vatValue, purchaseOrder.currency)}</strong> <span style={{ fontSize: '0.85em' }}>(od {formatCurrency(sumNet, purchaseOrder.currency)})</span>
                                </Typography>
                              );
                            })}
                          </Box>
                        </>
                      )}
                    </Paper>
                    
                    {/* Sekcja dodatkowych kosztów z VAT */}
                    {purchaseOrder.additionalCostsItems?.length > 0 && (
                      <Paper elevation={0} sx={{ p: 2, mb: 2, bgcolor: 'background.default', width: '100%', borderRadius: 2 }}>
                        <Typography variant="subtitle1" gutterBottom sx={{ color: 'text.primary', mb: 1.5 }}>
                          <strong>{t('purchaseOrders.details.additionalCostsDetails')}:</strong>
                        </Typography>
                        {purchaseOrder.additionalCostsItems.map((cost, index) => {
                          // Znajdź nazwy pozycji, do których przypisany jest koszt
                          const getAffectedItemsNames = () => {
                            if (!cost.affectedItems || cost.affectedItems.length === 0) {
                              return null; // Wszystkie pozycje
                            }
                            
                            const affectedItems = purchaseOrder.items.filter(item => 
                              cost.affectedItems.includes(item.id)
                            );
                            
                            if (affectedItems.length === 0) {
                              return [];
                            }
                            
                            return affectedItems.map(item => item.name);
                          };
                          
                          const affectedItemsNames = getAffectedItemsNames();
                          const costValue = parseFloat(cost.value) || 0;
                          const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
                          const vatValue = (costValue * vatRate) / 100;
                          
                          return (
                            <Box key={index} sx={{ mb: 1.5, pb: index < purchaseOrder.additionalCostsItems.length - 1 ? 1.5 : 0, borderBottom: index < purchaseOrder.additionalCostsItems.length - 1 ? '1px solid' : 'none', borderColor: 'divider' }}>
                              <Typography variant="body2" sx={{ fontWeight: 500, color: 'text.primary', mb: 0.5 }}>
                                {cost.description || `Dodatkowy koszt ${index+1}`}: <strong>{formatCurrency(costValue, purchaseOrder.currency)}</strong>
                              </Typography>
                              
                              {vatRate > 0 && (
                                <Typography variant="body2" sx={{ pl: 2, mb: 0.5, color: 'text.secondary' }}>
                                  VAT {vatRate}%: <strong>{formatCurrency(vatValue, purchaseOrder.currency)}</strong>
                                </Typography>
                              )}
                              
                              {/* Informacja o przypisanych pozycjach */}
                              {affectedItemsNames === null ? (
                                <Typography variant="caption" sx={{ pl: 2, color: 'text.secondary', display: 'block', fontStyle: 'italic' }}>
                                  Przypisane do wszystkich pozycji
                                </Typography>
                              ) : affectedItemsNames.length > 0 ? (
                                <Typography variant="caption" sx={{ pl: 2, color: 'primary.main', display: 'block', fontStyle: 'italic' }}>
                                  Przypisane do: {affectedItemsNames.join(', ')}
                                </Typography>
                              ) : (
                                <Typography variant="caption" sx={{ pl: 2, color: 'warning.main', display: 'block', fontStyle: 'italic' }}>
                                  ⚠️ Brak przypisanych pozycji (sprawdź konfigurację)
                                </Typography>
                              )}
                            </Box>
                          );
                        })}
                      </Paper>
                    )}
                    
                    {/* Podsumowanie końcowe */}
                    <Divider sx={{ width: '100%', mb: 2 }} />
                    {(() => {
                      const vatValues = calculateVATValues(purchaseOrder.items, purchaseOrder.additionalCostsItems, purchaseOrder.globalDiscount);
                      return (
                        <Box sx={{ width: '100%' }}>
                          {parseFloat(purchaseOrder.globalDiscount || 0) > 0 && (
                            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1, textAlign: 'right' }}>
                              {t('purchaseOrders.details.summary.beforeDiscount')}: <strong>{formatCurrency(vatValues.totalGrossBeforeDiscount, purchaseOrder.currency)}</strong>
                            </Typography>
                          )}
                          <Typography variant="subtitle1" gutterBottom sx={{ textAlign: 'right' }}>
                            <strong>{t('purchaseOrders.details.summary.netValue')}:</strong> {formatCurrency(vatValues.totalNet, purchaseOrder.currency)}
                          </Typography>
                          <Typography variant="subtitle1" gutterBottom sx={{ textAlign: 'right' }}>
                            <strong>{t('purchaseOrders.details.summary.totalVAT')}:</strong> {formatCurrency(vatValues.totalVat, purchaseOrder.currency)}
                          </Typography>
                          {parseFloat(purchaseOrder.globalDiscount || 0) > 0 && (
                            <Typography variant="body2" sx={{ color: 'success.main', mb: 1, textAlign: 'right' }}>
                              {t('purchaseOrders.details.summary.globalDiscount')} ({purchaseOrder.globalDiscount}%): <strong>-{formatCurrency(vatValues.discountAmount, purchaseOrder.currency)}</strong>
                            </Typography>
                          )}
                          <Divider sx={{ my: 1 }} />
                          <Typography variant="h6" sx={{ mt: 1, textAlign: 'right', color: 'primary.main' }}>
                            <strong>{t('purchaseOrders.details.summary.grossValue')}:</strong> {formatCurrency(vatValues.totalGross, purchaseOrder.currency)}
                          </Typography>
                        </Box>
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
                {t('purchaseOrders.details.batches.allRelatedBatches')}
              </Typography>
              
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t('purchaseOrders.details.batches.lotNumber')}</TableCell>
                      <TableCell>{t('purchaseOrders.details.batches.product')}</TableCell>
                      <TableCell align="right">{t('purchaseOrders.details.table.quantity')}</TableCell>
                      <TableCell>{t('purchaseOrders.details.table.warehouse')}</TableCell>
                      <TableCell>{t('purchaseOrders.details.batches.receivedDate')}</TableCell>
                      <TableCell>{t('purchaseOrders.details.batches.value')}</TableCell>
                      <TableCell>{t('purchaseOrders.details.table.actions')}</TableCell>
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
                          {batch.lotNumber || batch.batchNumber || t('purchaseOrders.details.batches.noLotNumber')}
                        </TableCell>
                        <TableCell>
                          {batch.itemName || t('purchaseOrders.details.batches.unknownProduct')}
                        </TableCell>
                        <TableCell align="right">
                          {batch.quantity || 0} {batch.unit || 'szt.'}
                        </TableCell>
                        <TableCell>
                          {batch.warehouseName || batch.warehouseId || t('purchaseOrders.details.batches.mainWarehouse')}
                        </TableCell>
                        <TableCell>
                          {batch.receivedDate ? 
                            (typeof batch.receivedDate === 'object' && batch.receivedDate.seconds ? 
                              new Date(batch.receivedDate.seconds * 1000).toLocaleDateString('pl-PL') : 
                              new Date(batch.receivedDate).toLocaleDateString('pl-PL')) : 
                            t('purchaseOrders.details.batches.unknownDate')}
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
                            {t('purchaseOrders.details.table.details')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
          
          {/* Sekcja refaktur (zaliczek) powiązanych z PO */}
          {relatedRefInvoices.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Refaktury / Zaliczki
                <Chip 
                  label={relatedRefInvoices.length} 
                  size="small" 
                  color="secondary" 
                  sx={{ ml: 1 }} 
                />
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={mb2}>
                Faktury wystawione na podstawie tego zamówienia zakupowego
              </Typography>
              
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Numer faktury</TableCell>
                      <TableCell>Data wystawienia</TableCell>
                      <TableCell>Termin płatności</TableCell>
                      <TableCell align="right">Kwota</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>{t('common:common.paymentStatus')}</TableCell>
                      <TableCell align="center">Akcje</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {relatedRefInvoices.map((invoice) => {
                      // Oblicz status płatności
                      const getPaymentStatus = (inv) => {
                        if (inv.status === 'cancelled') return { label: 'Anulowana', color: 'default' };
                        if (inv.paymentStatus === 'paid') return { label: 'Opłacona', color: 'success' };
                        if (inv.paymentStatus === 'partially_paid') return { label: 'Częściowo opłacona', color: 'warning' };
                        
                        // Sprawdź czy przeterminowana
                        const dueDate = inv.dueDate ? new Date(inv.dueDate) : null;
                        if (dueDate && dueDate < new Date() && inv.paymentStatus !== 'paid') {
                          return { label: 'Przeterminowana', color: 'error' };
                        }
                        
                        return { label: 'Nieopłacona', color: 'warning' };
                      };
                      
                      const paymentStatus = getPaymentStatus(invoice);
                      
                      return (
                        <TableRow key={invoice.id} hover>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              {invoice.number}
                            </Typography>
                            {invoice.isProforma && (
                              <Chip label="Proforma" size="small" color="info" sx={{ ml: 1 }} />
                            )}
                          </TableCell>
                          <TableCell>
                            {invoice.issueDate ? format(new Date(invoice.issueDate), 'dd.MM.yyyy', { locale: pl }) : '-'}
                          </TableCell>
                          <TableCell>
                            {invoice.dueDate ? format(new Date(invoice.dueDate), 'dd.MM.yyyy', { locale: pl }) : '-'}
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" fontWeight="medium">
                              {formatCurrency(invoice.total || 0, invoice.currency || 'EUR')}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={
                                invoice.status === 'draft' ? 'Szkic' :
                                invoice.status === 'issued' ? 'Wystawiona' :
                                invoice.status === 'cancelled' ? 'Anulowana' : 
                                invoice.status
                              } 
                              size="small"
                              color={
                                invoice.status === 'draft' ? 'default' :
                                invoice.status === 'issued' ? 'primary' :
                                invoice.status === 'cancelled' ? 'error' : 
                                'default'
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Chip 
                              label={paymentStatus.label}
                              size="small"
                              color={paymentStatus.color}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <Button
                              size="small"
                              variant="outlined"
                              component={RouterLink}
                              to={`/invoices/${invoice.id}`}
                            >
                              Szczegóły
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
              
              {/* Podsumowanie refaktur */}
              <Box sx={{ mt: 2, p: 2, bgcolor: 'background.default', borderRadius: 1 }}>
                <Typography variant="subtitle2" gutterBottom>
                  Podsumowanie refaktur:
                </Typography>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2">
                    Łączna wartość refaktur:
                  </Typography>
                  <Typography variant="h6" color="primary.main">
                    {formatCurrency(
                      relatedRefInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0),
                      purchaseOrder.currency || 'EUR'
                    )}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                  <Typography variant="body2">
                    Refaktury opłacone:
                  </Typography>
                  <Typography variant="body2" color="success.main" fontWeight="medium">
                    {relatedRefInvoices.filter(inv => inv.paymentStatus === 'paid').length} / {relatedRefInvoices.length}
                  </Typography>
                </Box>
              </Box>
            </Paper>
          )}
          
          {/* Sekcja rezerwacji PO - Podsumowanie */}
          {Object.values(poReservationsByItem).flat().length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" gutterBottom>
                Rezerwacje z tego zamówienia
                <Chip 
                  label={Object.values(poReservationsByItem).flat().length} 
                  size="small" 
                  color="primary" 
                  sx={{ ml: 1 }} 
                />
              </Typography>
              
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Nr MO</TableCell>
                      <TableCell>Nazwa zadania</TableCell>
                      <TableCell>Materiał</TableCell>
                      <TableCell align="right">Ilość</TableCell>
                      <TableCell align="right">Wartość</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Data rezerwacji</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.values(poReservationsByItem).flat().map((reservation) => (
                      <TableRow 
                        key={reservation.id} 
                        hover
                        sx={{ 
                          cursor: 'pointer',
                          '&:hover': { bgcolor: 'action.hover' }
                        }}
                        onClick={() => navigate(`/production/tasks/${reservation.taskId}`)}
                      >
                        <TableCell sx={{ fontWeight: 'medium' }}>
                          {reservation.taskNumber}
                        </TableCell>
                        <TableCell>{reservation.taskName}</TableCell>
                        <TableCell>{reservation.materialName}</TableCell>
                        <TableCell align="right">
                          {reservation.reservedQuantity} {reservation.unit}
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(reservation.reservedQuantity * reservation.unitPrice, reservation.currency || purchaseOrder.currency)}
                        </TableCell>
                        <TableCell>
                          <Chip 
                            label={
                              reservation.status === 'pending' ? 'Oczekująca' :
                              reservation.status === 'delivered' ? 'Dostarczona' :
                              reservation.status === 'converted' ? 'Przekonwertowana' :
                              reservation.status
                            }
                            size="small"
                            color={
                              reservation.status === 'pending' ? 'warning' :
                              reservation.status === 'delivered' ? 'success' :
                              'info'
                            }
                          />
                        </TableCell>
                        <TableCell>
                          {reservation.reservedAt ? 
                            new Date(reservation.reservedAt).toLocaleDateString('pl-PL') : 
                            '-'
                          }
                        </TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/production/tasks/${reservation.taskId}`);
                            }}
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
              {t('purchaseOrders.additionalCosts')}
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
                      <TableCell align="right">Refakturowane</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {purchaseOrder.additionalCostsItems.map((cost, index) => {
                      const costId = cost.id || `additional-cost-${index}`;
                      const costValue = parseFloat(cost.value) || 0;
                      const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
                      const vatValue = (costValue * vatRate) / 100;
                      const grossValue = costValue + vatValue;
                      
                      // Dane o refakturowaniu
                      const reinvoicedData = reinvoicedAmounts.additionalCosts[costId];
                      const reinvoicedAmount = reinvoicedData?.totalReinvoiced || 0;
                      const isFullyReinvoiced = Math.abs(reinvoicedAmount - costValue) < 0.01;
                      const hasDiscrepancy = reinvoicedAmount > 0 && !isFullyReinvoiced;
                      const discrepancyAmount = reinvoicedAmount - costValue;
                      
                      return (
                        <TableRow key={cost.id || index}>
                          <TableCell>{cost.description || `Dodatkowy koszt ${index+1}`}</TableCell>
                          <TableCell align="right">{formatCurrency(costValue, purchaseOrder.currency)}</TableCell>
                          <TableCell align="right">{vatRate > 0 ? `${vatRate}%` : ''}</TableCell>
                          <TableCell align="right">{formatCurrency(vatValue, purchaseOrder.currency)}</TableCell>
                          <TableCell align="right">{formatCurrency(grossValue, purchaseOrder.currency)}</TableCell>
                          <TableCell align="right">
                            {reinvoicedAmount > 0 ? (
                              <Tooltip 
                                title={
                                  <Box>
                                    <Typography variant="body2" sx={{ fontWeight: 'bold', mb: 0.5 }}>
                                      Refakturowano do {reinvoicedData.invoices.length} {reinvoicedData.invoices.length === 1 ? 'faktury' : 'faktur'}:
                                    </Typography>
                                    {reinvoicedData.invoices.map((inv, i) => (
                                      <Typography key={i} variant="body2">
                                        • {inv.invoiceNumber} → {inv.customerName || 'Brak klienta'}: {formatCurrency(inv.itemValue, purchaseOrder.currency)}
                                      </Typography>
                                    ))}
                                    {hasDiscrepancy && (
                                      <Typography variant="body2" sx={{ mt: 0.5, color: 'error.light', fontWeight: 'bold' }}>
                                        Niezgodność: {discrepancyAmount > 0 ? '+' : ''}{formatCurrency(discrepancyAmount, purchaseOrder.currency)} ({discrepancyAmount > 0 ? 'nadwyżka' : 'niedobór'} vs wartość PO: {formatCurrency(costValue, purchaseOrder.currency)})
                                      </Typography>
                                    )}
                                  </Box>
                                }
                              >
                                <Typography 
                                  sx={{ 
                                    color: isFullyReinvoiced ? 'success.main' : 'error.main',
                                    fontWeight: 'medium',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    gap: 0.5
                                  }}
                                >
                                  {isFullyReinvoiced ? '✅' : '❌'}
                                  {formatCurrency(reinvoicedAmount, purchaseOrder.currency)}
                                </Typography>
                              </Tooltip>
                            ) : (
                              <Typography color="text.secondary">—</Typography>
                            )}
                          </TableCell>
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
          
          {/* Sekcja załączników - skategoryzowane */}
          <Paper sx={{ mb: 3, p: 3, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <AttachFileIcon sx={mr1} />
              {t('purchaseOrders.details.attachments')}
            </Typography>
            
            {(() => {
              // Funkcje pomocnicze do wyświetlania załączników
              const getFileIcon = (contentType) => {
                if (contentType.startsWith('image/')) {
                  return <ImageIcon sx={{ color: 'primary.main' }} />;
                } else if (contentType === 'application/pdf') {
                  return <PdfIcon sx={{ color: 'error.main' }} />;
                } else {
                  return <DescriptionIcon sx={{ color: 'action.active' }} />;
                }
              };

              const formatFileSize = (bytes) => {
                if (bytes === 0) return '0 Bytes';
                const k = 1024;
                const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                const i = Math.floor(Math.log(bytes) / Math.log(k));
                return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
              };

              const renderAttachmentsList = (attachments, emptyMessage) => (
                attachments && attachments.length > 0 ? (
                  <List sx={{ py: 0 }}>
                    {attachments.map((attachment) => (
                      <ListItem
                        key={attachment.id}
                        button
                        onClick={() => window.open(attachment.downloadURL, '_blank')}
                        sx={{
                          border: (theme) => `1px solid ${theme.palette.divider}`,
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
                                {t('purchaseOrders.details.clickToOpen')}
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
                    ))}
                  </List>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', ml: 2 }}>
                    {emptyMessage}
                  </Typography>
                )
              );

              // Sprawdź czy mamy nowe skategoryzowane załączniki
              const hasCoA = purchaseOrder.coaAttachments && purchaseOrder.coaAttachments.length > 0;
              const hasInvoices = purchaseOrder.invoiceAttachments && purchaseOrder.invoiceAttachments.length > 0;
              const hasGeneral = purchaseOrder.generalAttachments && purchaseOrder.generalAttachments.length > 0;
              const hasOldAttachments = purchaseOrder.attachments && purchaseOrder.attachments.length > 0;

              // Jeśli są nowe skategoryzowane załączniki, wyświetl je w kategoriach
              if (hasCoA || hasInvoices || hasGeneral) {
                return (
                  <Box>
                    {/* Certyfikaty analizy (CoA) */}
                    <Box sx={mb3}>
                      <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <AssignmentIcon sx={{ mr: 1, color: 'success.main' }} />
                          {t('purchaseOrders.details.coaAttachments.title')}
                          {hasCoA && (
                            <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                              ({purchaseOrder.coaAttachments.length})
                            </Typography>
                          )}
                        </Box>
                        {hasCoA && relatedBatches.length > 0 && (
                          <Button
                            size="small"
                            variant="outlined"
                            startIcon={<LabelIcon />}
                            onClick={handleCoAMigration}
                            sx={{ ml: 'auto' }}
                          >
                            {t('purchaseOrders.details.coaMigration.migrateToBatch')}
                          </Button>
                        )}
                      </Typography>
                      {renderAttachmentsList(purchaseOrder.coaAttachments, t('purchaseOrders.details.coaAttachments.noAttachments'))}
                    </Box>

                    {/* Faktury */}
                    <Box sx={mb3}>
                      <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                        <LocalShippingIcon sx={{ mr: 1, color: 'warning.main' }} />
                        {t('purchaseOrders.details.invoiceAttachments.title')}
                        {hasInvoices && (
                          <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                            ({purchaseOrder.invoiceAttachments.length})
                          </Typography>
                        )}
                      </Typography>
                      {renderAttachmentsList(purchaseOrder.invoiceAttachments, t('purchaseOrders.details.invoiceAttachments.noAttachments'))}
                    </Box>

                    {/* Inne załączniki */}
                    <Box sx={mb1}>
                      <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                        <AttachFileIcon sx={{ mr: 1, color: 'info.main' }} />
                        {t('purchaseOrders.details.generalAttachments.title')}
                        {hasGeneral && (
                          <Typography variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                            ({purchaseOrder.generalAttachments.length})
                          </Typography>
                        )}
                      </Typography>
                      {renderAttachmentsList(purchaseOrder.generalAttachments, t('purchaseOrders.details.generalAttachments.noAttachments'))}
                    </Box>
                  </Box>
                );
              }
              
              // W przeciwnym razie wyświetl stare załączniki (kompatybilność wsteczna)
              else if (hasOldAttachments) {
                return (
                  <Box>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {t('purchaseOrders.details.attachedFiles', { count: purchaseOrder.attachments.length })}
                    </Typography>
                    {renderAttachmentsList(purchaseOrder.attachments, t('purchaseOrders.details.noAttachments'))}
                  </Box>
                );
              }
              
              // Brak załączników
              else {
                return (
                  <Typography variant="body2" color="text.secondary">
                    {t('purchaseOrders.details.noAttachmentsForOrder')}
                  </Typography>
                );
              }
            })()}
          </Paper>

          {/* Sekcja odpowiedzi formularzy rozładunku */}
          <Paper sx={{ mb: 3, p: 2, borderRadius: 2 }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <LocalShippingIcon sx={mr1} />
              {t('purchaseOrders.details.unloadingReports')}
              {unloadingFormResponsesLoading && (
                <CircularProgress size={20} sx={{ ml: 2 }} />
              )}
            </Typography>
            
            {unloadingFormResponses.length > 0 ? (
              <Box>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {t('purchaseOrders.details.foundUnloadingReports', { count: unloadingFormResponses.length, number: purchaseOrder.number })}
                </Typography>
                
                {unloadingFormResponses.map((report, index) => (
                  <Paper 
                    key={report.id} 
                    variant="outlined" 
                    sx={{ 
                      mb: 1.5, 
                      p: 1.5, 
                      border: (theme) => `1px solid ${theme.palette.divider}`,
                      borderLeft: (theme) => `3px solid ${theme.palette.primary.main}`,
                      backgroundColor: (theme) => theme.palette.mode === 'dark' 
                        ? theme.palette.grey[900] 
                        : theme.palette.grey[50]
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                      <AssignmentIcon sx={{ mr: 1, color: 'primary.main', fontSize: '1.2rem' }} />
                      <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                        {t('purchaseOrders.details.unloadingReport', { number: index + 1 })}
                      </Typography>
                      <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Chip 
                          label={`${report.fillDate ? safeFormatDate(report.fillDate, 'dd.MM HH:mm') : t('purchaseOrders.details.noDate')}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem' }}
                        />
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleEditUnloadingReport(report)}
                          title={t('purchaseOrders.details.editUnloadingReport')}
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
                          {t('purchaseOrders.details.employeeEmail')}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.email || t('purchaseOrders.details.notProvided')}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          {t('purchaseOrders.details.employee')}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.employeeName || t('purchaseOrders.details.notProvided')}
                        </Typography>
                      </Grid>
                      
                      <Grid item xs={6} sm={4} md={2}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                          {t('purchaseOrders.details.position')}
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.position || t('purchaseOrders.details.notProvided')}
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
                          Numer faktury
                        </Typography>
                        <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.8rem' }}>
                          {report.invoiceNumber || 'Nie podano'}
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
                            {report.selectedItems.map((item, itemIndex) => {
                              // Obsługa nowego formatu z partiami (batches) i starego formatu
                              const hasBatches = item.batches && Array.isArray(item.batches) && item.batches.length > 0;
                              
                              return (
                                <Box 
                                  key={itemIndex} 
                                  sx={{ 
                                    p: 0.75, 
                                    mb: 0.5, 
                                    backgroundColor: (theme) => theme.palette.background.paper, 
                                    borderRadius: 0.5,
                                    border: (theme) => `1px solid ${theme.palette.divider}`
                                  }}
                                >
                                  <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem', mb: hasBatches ? 0.5 : 0 }}>
                                    {item.productName || 'Nieznany produkt'}
                                  </Typography>
                                  
                                  {hasBatches ? (
                                    // NOWY FORMAT: Wyświetl wszystkie partie
                                    <Box sx={{ pl: 1 }}>
                                      {item.batches.map((batch, batchIndex) => (
                                        <Box 
                                          key={batch.id || batchIndex}
                                          sx={{ 
                                            display: 'flex', 
                                            justifyContent: 'space-between', 
                                            alignItems: 'center',
                                            py: 0.25,
                                            borderBottom: batchIndex < item.batches.length - 1 ? '1px dashed' : 'none',
                                            borderColor: 'divider'
                                          }}
                                        >
                                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            {batch.batchNumber && (
                                              <Chip 
                                                label={`LOT: ${batch.batchNumber}`} 
                                                size="small" 
                                                color="info"
                                                variant="outlined"
                                                sx={{ fontSize: '0.65rem', height: 18 }}
                                              />
                                            )}
                                          </Box>
                                          <Box sx={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <Typography variant="body2" color="primary" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>
                                              {batch.unloadedQuantity || 'Nie podano'} {item.unit || ''}
                                            </Typography>
                                            {batch.noExpiryDate ? (
                                              <Chip 
                                                label={t('common:common.noExpiryDate')} 
                                                size="small" 
                                                color="default"
                                                sx={{ fontSize: '0.6rem', height: 16 }}
                                              />
                                            ) : batch.expiryDate && (
                                              <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.65rem' }}>
                                                {safeFormatDate(batch.expiryDate, 'dd.MM.yyyy')}
                                              </Typography>
                                            )}
                                          </Box>
                                        </Box>
                                      ))}
                                    </Box>
                                  ) : (
                                    // STARY FORMAT: Wyświetl jak wcześniej (kompatybilność wsteczna)
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                      <Box />
                                      <Box sx={{ textAlign: 'right' }}>
                                        <Typography variant="body2" color="primary" sx={{ fontSize: '0.8rem' }}>
                                          {item.unloadedQuantity || 'Nie podano'} {item.unit || ''}
                                        </Typography>
                                        {item.noExpiryDate ? (
                                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                            {t('common:common.noExpiryDate')}
                                          </Typography>
                                        ) : item.expiryDate && (
                                          <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>
                                            {safeFormatDate(item.expiryDate, 'dd.MM.yyyy')}
                                          </Typography>
                                        )}
                                      </Box>
                                    </Box>
                                  )}
                                </Box>
                              );
                            })}
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
                                  backgroundColor: (theme) => theme.palette.mode === 'dark' 
                                    ? 'rgba(255, 255, 255, 0.08)' 
                                    : 'rgba(0, 0, 0, 0.04)', 
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
                                  backgroundColor: (theme) => theme.palette.mode === 'dark' 
                                    ? 'rgba(255, 255, 255, 0.08)' 
                                    : 'rgba(0, 0, 0, 0.04)', 
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
                  ? t('purchaseOrders.details.searchingUnloadingReports')
                  : t('purchaseOrders.details.noUnloadingReports', { number: purchaseOrder?.number || t('purchaseOrders.details.unknown') })
                }
              </Typography>
            )}
          </Paper>
        </>
      ) : (
        <Typography>{t('purchaseOrders.orderNotFound')}</Typography>
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
          <DialogContentText sx={mb2}>
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
          <DialogContentText sx={mb2}>
            Wybierz nowy status płatności zamówienia:
          </DialogContentText>
          <FormControl fullWidth>
            <InputLabel>{t('common:common.paymentStatus')}</InputLabel>
            <Select
              value={newPaymentStatus}
              onChange={(e) => setNewPaymentStatus(e.target.value)}
              label={t('common:common.paymentStatus')}
            >
              <MenuItem value={PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID}>
                {translatePaymentStatus(PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID)}
              </MenuItem>
              <MenuItem value={PURCHASE_ORDER_PAYMENT_STATUSES.TO_BE_PAID}>
                {translatePaymentStatus(PURCHASE_ORDER_PAYMENT_STATUSES.TO_BE_PAID)}
              </MenuItem>
              <MenuItem value={PURCHASE_ORDER_PAYMENT_STATUSES.PARTIALLY_PAID}>
                {translatePaymentStatus(PURCHASE_ORDER_PAYMENT_STATUSES.PARTIALLY_PAID)}
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
          <DialogContentText sx={mb2}>
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
                          placeholder={t('purchaseOrders.invoiceDescriptionPlaceholder')}
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

      {/* Dialog potwierdzenia krótkich dat ważności */}
      <Dialog
        open={shortExpiryConfirmDialogOpen}
        onClose={handleShortExpiryCancel}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Ostrzeżenie - Krótkie daty ważności</DialogTitle>
        <DialogContent>
          <DialogContentText sx={mb2}>
            Następujące pozycje mają datę ważności krótszą niż 16 miesięcy od daty zamówienia:
          </DialogContentText>
          
          {shortExpiryItems.length > 0 && (
            <Table size="small" sx={{ mt: 2 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Nazwa produktu</TableCell>
                  <TableCell>Data ważności</TableCell>
                  <TableCell>Miesiące do wygaśnięcia</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shortExpiryItems.map((item, index) => {
                  const orderDate = new Date(purchaseOrder?.orderDate);
                  const expiryDate = typeof item.expiryDate === 'string' 
                    ? new Date(item.expiryDate) 
                    : item.expiryDate instanceof Date 
                      ? item.expiryDate 
                      : item.expiryDate?.toDate?.() || new Date();
                  
                  const monthsDiff = Math.floor((expiryDate - orderDate) / (1000 * 60 * 60 * 24 * 30.44));
                  
                  return (
                    <TableRow key={index}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>
                        {isValid(expiryDate) 
                          ? format(expiryDate, 'dd.MM.yyyy', { locale: pl })
                          : 'Nieprawidłowa data'
                        }
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={`${monthsDiff} miesięcy`}
                          color={monthsDiff < 12 ? 'error' : monthsDiff < 16 ? 'warning' : 'default'}
                          size="small"
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          
          <DialogContentText sx={{ mt: 2, fontWeight: 'bold' }}>
            Czy na pewno chcesz kontynuować zmianę statusu na "Zamówione"?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleShortExpiryCancel}>Anuluj</Button>
          <Button onClick={handleShortExpiryConfirm} color="warning" variant="contained">
            Kontynuuj mimo ostrzeżenia
          </Button>
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

      {/* Dialog migracji CoA */}
      <CoAMigrationDialog
        open={coaMigrationDialogOpen}
        onClose={handleCoAMigrationClose}
        purchaseOrder={purchaseOrder}
        relatedBatches={relatedBatches}
        onMigrationComplete={handleCoAMigrationComplete}
      />
    </Container>
  );
};

export default PurchaseOrderDetails;