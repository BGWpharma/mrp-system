import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import { 
  Container, Typography, Paper, Button, Box, Chip, Grid, Divider, 
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  FormControl, InputLabel, Select, MenuItem, TextField, CircularProgress, IconButton,
  List, ListItem, ListItemText, ListItemIcon, Collapse
} from '@mui/material';
import { 
  Edit as EditIcon, 
  Delete as DeleteIcon, 
  Print as PrintIcon,
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
  Add as AddIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import {
  getPurchaseOrderById,
  deletePurchaseOrder,
  updatePurchaseOrderStatus,
  updatePurchaseOrder,
  updateBatchesForPurchaseOrder,
  PURCHASE_ORDER_STATUSES,
  translateStatus
} from '../../services/purchaseOrderService';
import { getBatchesByPurchaseOrderId } from '../../services/inventoryService';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { useReactToPrint } from 'react-to-print';
import { db } from '../../services/firebase/config';
import { updateDoc, doc, getDoc } from 'firebase/firestore';
import { formatCurrency } from '../../utils/formatUtils';
import { getUsersDisplayNames } from '../../services/userService';

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
  const [relatedBatches, setRelatedBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const [expandedItems, setExpandedItems] = useState({});
  const [tempInvoiceLinks, setTempInvoiceLinks] = useState([]);
  
  const printRef = useRef(null);
  
  const handlePrint = useReactToPrint({
    content: () => printRef.current,
    documentTitle: `Zamówienie ${purchaseOrder?.number || 'PO'}`,
    onBeforeGetContent: () => {
      return new Promise((resolve) => {
        console.log('printRef:', printRef.current);
        if (!printRef.current) {
          showError('Nie można znaleźć zawartości do wydruku. Spróbuj odświeżyć stronę.');
          return Promise.reject('Element do wydruku nie jest dostępny');
        }
        resolve();
      });
    },
    onPrintError: (error) => {
      console.error('Błąd podczas drukowania:', error);
      showError('Wystąpił błąd podczas drukowania. Spróbuj ponownie.');
    },
    removeAfterPrint: true
  });
  
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
  
  // Dodajemy nową funkcję do pobierania powiązanych partii (LOT)
  const fetchRelatedBatches = async (poId) => {
    try {
      setLoadingBatches(true);
      const batches = await getBatchesByPurchaseOrderId(poId);
      setRelatedBatches(batches);
      setLoadingBatches(false);
    } catch (error) {
      console.error('Błąd podczas pobierania powiązanych partii:', error);
      setLoadingBatches(false);
    }
  };
  
  // Funkcja do grupowania LOTów według pozycji zamówienia
  const getBatchesByItemId = (itemId) => {
    if (!relatedBatches || relatedBatches.length === 0) return [];
    
    return relatedBatches.filter(batch => {
      // Sprawdź różne możliwe powiązania między LOTem a pozycją zamówienia
      return (
        (batch.purchaseOrderDetails && batch.purchaseOrderDetails.itemPoId === itemId) ||
        (batch.sourceDetails && batch.sourceDetails.itemPoId === itemId) ||
        (itemId === undefined) // Jeśli itemId nie jest podane, zwróć wszystkie
      );
    });
  };
  
  // Funkcja do nawigacji do szczegółów partii (LOTu)
  const handleBatchClick = (batchId, itemId) => {
    if (!batchId) return;
    if (itemId) {
      // Jeśli znamy ID produktu, przekieruj do listy partii produktu
      navigate(`/inventory/${itemId}/batches`);
    } else {
      // Jeśli nie znamy ID produktu, pobierz partię i przekieruj na podstawie jej itemId
      navigate(`/inventory/batch/${batchId}`);
    }
  };
  
  // Funkcja do przełączania rozwinięcia/zwinięcia listy LOTów dla danej pozycji
  const toggleItemExpansion = (itemId) => {
    setExpandedItems(prev => ({
      ...prev,
      [itemId]: !prev[itemId]
    }));
  };
  
  // Funkcja zwracająca nazwę użytkownika zamiast ID
  const getUserName = (userId) => {
    return userNames[userId] || userId || 'System';
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
    if (newStatus === purchaseOrder.status) {
      setStatusDialogOpen(false);
      return;
    }
    
    try {
      // Aktualizacja statusu
      await updatePurchaseOrderStatus(orderId, newStatus, currentUser?.uid);
      
      // Pobierz zaktualizowane dane zamówienia
      const updatedData = await getPurchaseOrderById(orderId);
      setPurchaseOrder(updatedData);
      
      // Jeśli historia statusu została zaktualizowana, pobierz dane nowych użytkowników
      if (updatedData.statusHistory && updatedData.statusHistory.length > 0) {
        const userIds = updatedData.statusHistory.map(change => change.changedBy).filter(id => id);
        const uniqueUserIds = [...new Set(userIds)];
        const missingUserIds = uniqueUserIds.filter(id => !userNames[id]);
        
        if (missingUserIds.length > 0) {
          const newNames = await getUsersDisplayNames(missingUserIds);
          setUserNames(prevNames => ({
            ...prevNames,
            ...newNames
          }));
        }
      }
      
      setStatusDialogOpen(false);
      showSuccess('Status zamówienia został zaktualizowany');
    } catch (error) {
      console.error('Błąd podczas aktualizacji statusu:', error);
      showError('Nie udało się zaktualizować statusu zamówienia');
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
    
    // Upewnij się, że cena jednostkowa jest liczbą
    const unitPrice = typeof itemToReceive.unitPrice === 'number' 
      ? itemToReceive.unitPrice 
      : parseFloat(itemToReceive.unitPrice || 0);
    
    // Przekieruj do strony przyjęcia towaru z parametrami
    const queryParams = new URLSearchParams();
    queryParams.append('poNumber', purchaseOrder.number);
    queryParams.append('orderId', orderId);
    queryParams.append('quantity', itemToReceive.quantity);
    queryParams.append('unitPrice', unitPrice);
    queryParams.append('reason', 'purchase');
    queryParams.append('source', 'purchase'); 
    queryParams.append('sourceId', orderId);
    
    // Dodaj dodatkowe informacje, które pomogą zidentyfikować pozycję w zamówieniu
    if (itemToReceive.id) {
      queryParams.append('itemPOId', itemToReceive.id);
    } else if (itemToReceive.itemId) {
      queryParams.append('itemPOId', itemToReceive.itemId);
    }
    
    // Dodaj nazwę produktu dla łatwiejszego dopasowania w zamówieniu
    if (itemToReceive.name) {
      queryParams.append('itemName', itemToReceive.name);
    }
    
    // Dodaj referencję do numeru zamówienia
    queryParams.append('reference', purchaseOrder.number);
    
    // Dodaj parametr returnTo, aby strona wiedziała, gdzie wrócić po wykonaniu operacji
    queryParams.append('returnTo', `/purchase-orders/${orderId}`);
    
    // Ustaw flagę, która spowoduje odświeżenie danych po powrocie
    localStorage.setItem('refreshPurchaseOrder', orderId);
    
    navigate(`/inventory/${itemToReceive.inventoryItemId}/receive?${queryParams.toString()}`);
    setReceiveDialogOpen(false);
  };
  
  const handleInvoiceLinkDialogOpen = () => {
    setInvoiceLink(purchaseOrder.invoiceLink || '');
    setInvoiceLinkDialogOpen(true);
    
    // Inicjalizuj tablicę invoiceLinks jeśli nie istnieje, ale jest stare pole invoiceLink
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
      // Przygotuj dane do aktualizacji
      const updatedData = {
        ...purchaseOrder,
        invoiceLink: tempInvoiceLinks.length > 0 ? tempInvoiceLinks[0].url : '',
        invoiceLinks: tempInvoiceLinks
      };
      
      // Zaktualizuj zamówienie w bazie danych
      await updatePurchaseOrder(orderId, updatedData);
      
      // Zaktualizuj lokalny stan
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
  
  const getStatusChip = (status) => {
    const statusConfig = {
      [PURCHASE_ORDER_STATUSES.DRAFT]: { color: 'default', label: translateStatus(status) },
      [PURCHASE_ORDER_STATUSES.PENDING]: { color: 'warning', label: translateStatus(status) },
      [PURCHASE_ORDER_STATUSES.CONFIRMED]: { color: 'info', label: translateStatus(status) },
      [PURCHASE_ORDER_STATUSES.SHIPPED]: { color: 'primary', label: translateStatus(status) },
      [PURCHASE_ORDER_STATUSES.DELIVERED]: { color: 'success', label: translateStatus(status) },
      [PURCHASE_ORDER_STATUSES.CANCELLED]: { color: 'error', label: translateStatus(status) },
      [PURCHASE_ORDER_STATUSES.COMPLETED]: { color: 'success', label: translateStatus(status) }
    };
    
    const config = statusConfig[status] || { color: 'default', label: status };
    
    return (
      <Chip 
        label={config.label} 
        color={config.color}
        size="small"
        onClick={handleStatusClick}
      />
    );
  };
  
  const formatDate = (dateIsoString) => {
    if (!dateIsoString) return 'Nie określono';
    try {
      // Obsłuż różne rodzaje dat
      let date;
      
      // Jeśli to Timestamp z Firebase
      if (dateIsoString && typeof dateIsoString.toDate === 'function') {
        date = dateIsoString.toDate();
      } 
      // Jeśli to string ISO lub wartość, którą można przekształcić na Date
      else {
        date = new Date(dateIsoString);
      }
      
      // Sprawdź, czy data jest prawidłowa
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
  
  // Sprawdza, czy zamówienie jest w stanie, w którym można przyjąć towary do magazynu
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
  
  // Dodajemy alternatywną funkcję do drukowania w przypadku problemów
  const handleDirectPrint = () => {
    console.log('Używam alternatywnej metody drukowania...');
    console.log('printRef:', printRef.current);
    
    if (!printRef.current) {
      showError('Nie można znaleźć zawartości do wydruku');
      return;
    }
    
    try {
      // Otwieramy nowe okno
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      
      // Obliczamy wartości VAT
      const vatValues = calculateVATValues(purchaseOrder.items, purchaseOrder.additionalCostsItems);
      
      // Przygotowujemy zawartość HTML dla stawek VAT produktów
      let vatProductsHtml = '';
      Array.from(new Set(purchaseOrder.items.map(item => item.vatRate)))
        .sort((a, b) => a - b)
        .forEach(vatRate => {
          if (vatRate === undefined) return;
          
          const itemsWithSameVat = purchaseOrder.items.filter(item => item.vatRate === vatRate);
          const sumNet = itemsWithSameVat.reduce((sum, item) => sum + (parseFloat(item.totalPrice) || 0), 0);
          const vatValue = typeof vatRate === 'number' ? (sumNet * vatRate) / 100 : 0;
          
          vatProductsHtml += `<p>VAT ${vatRate}%: ${formatCurrency(vatValue, purchaseOrder.currency)} (od ${formatCurrency(sumNet, purchaseOrder.currency)})</p>`;
        });
      
      // Przygotowujemy zawartość HTML dla dodatkowych kosztów
      let additionalCostsHtml = '';
      if (purchaseOrder.additionalCostsItems && purchaseOrder.additionalCostsItems.length > 0) {
        additionalCostsHtml = '<h4>Dodatkowe koszty:</h4>';
        purchaseOrder.additionalCostsItems.forEach((cost, index) => {
          const costValue = parseFloat(cost.value) || 0;
          const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
          const vatValue = (costValue * vatRate) / 100;
          
          additionalCostsHtml += `<p>${cost.description || `Dodatkowy koszt ${index+1}`}: ${formatCurrency(costValue, purchaseOrder.currency)}`;
          if (vatRate > 0) {
            additionalCostsHtml += ` + VAT ${vatRate}%: ${formatCurrency(vatValue, purchaseOrder.currency)}`;
          }
          additionalCostsHtml += '</p>';
        });
      }
      
      // Przygotowujemy zawartość HTML
      const printContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Zamówienie ${purchaseOrder?.number || 'PO'}</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              max-width: 800px;
              margin: 0 auto;
            }
            .header {
              text-align: center;
              margin-bottom: 20px;
              padding-bottom: 10px;
              border-bottom: 1px solid #ddd;
            }
            .section {
              margin-bottom: 20px;
              padding: 15px;
              border: 1px solid #eee;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            th, td {
              padding: 8px;
              text-align: left;
              border-bottom: 1px solid #ddd;
            }
            th {
              background-color: #f2f2f2;
            }
            .supplier-info {
              margin-bottom: 15px;
            }
            .total-section {
              text-align: right;
              margin-top: 20px;
            }
          </style>
        </head>
        <body onload="window.print(); window.setTimeout(function() { window.close(); }, 500);">
          <div class="header">
            <h1>Zamówienie ${purchaseOrder?.number || ''}</h1>
            <p>Status: ${purchaseOrder?.status || ''}</p>
          </div>
          
          <div class="section">
            <div class="supplier-info">
              <h3>Dostawca</h3>
              <p>${purchaseOrder?.supplier?.name || 'Brak danych dostawcy'}</p>
              ${purchaseOrder?.supplier?.contactPerson ? `<p>Osoba kontaktowa: ${purchaseOrder.supplier.contactPerson}</p>` : ''}
              ${purchaseOrder?.supplier?.email ? `<p>Email: ${purchaseOrder.supplier.email}</p>` : ''}
              ${purchaseOrder?.supplier?.phone ? `<p>Telefon: ${purchaseOrder.supplier.phone}</p>` : ''}
            </div>
            
            <div>
              <h3>Informacje o zamówieniu</h3>
              <p>Data zamówienia: ${purchaseOrder?.orderDate ? new Date(purchaseOrder.orderDate).toLocaleDateString('pl') : 'Nie określono'}</p>
              <p>Oczekiwana data dostawy: ${purchaseOrder?.expectedDeliveryDate ? new Date(purchaseOrder.expectedDeliveryDate).toLocaleDateString('pl') : 'Nie określono'}</p>
            </div>
          </div>
          
          <div class="section">
            <h3>Pozycje zamówienia</h3>
            <table>
              <thead>
                <tr>
                  <th>Produkt</th>
                  <th>Ilość</th>
                  <th>Jednostka</th>
                  <th>Cena jedn.</th>
                  <th>Wartość</th>
                  <th>VAT</th>
                </tr>
              </thead>
              <tbody>
                ${purchaseOrder?.items?.map(item => `
                  <tr>
                    <td>${item.name}</td>
                    <td>${item.quantity}</td>
                    <td>${item.unit}</td>
                    <td>${formatCurrency(item.unitPrice, purchaseOrder.currency)}</td>
                    <td>${formatCurrency(item.totalPrice, purchaseOrder.currency)}</td>
                    <td>${item.vatRate}%</td>
                  </tr>
                `).join('') || '<tr><td colspan="6">Brak pozycji</td></tr>'}
              </tbody>
            </table>
            
            <div class="total-section">
              <p>Wartość produktów netto: ${formatCurrency(vatValues.itemsNetTotal, purchaseOrder.currency)}</p>
              ${vatProductsHtml}
              ${additionalCostsHtml}
              <p>Wartość netto razem: ${formatCurrency(vatValues.totalNet, purchaseOrder.currency)}</p>
              <p>Suma podatku VAT: ${formatCurrency(vatValues.totalVat, purchaseOrder.currency)}</p>
              <h3>Wartość brutto: ${formatCurrency(vatValues.totalGross, purchaseOrder.currency)}</h3>
            </div>
          </div>
          
          ${purchaseOrder?.notes ? `
            <div class="section">
              <h3>Uwagi</h3>
              <p>${purchaseOrder.notes}</p>
            </div>
          ` : ''}
        </body>
        </html>
      `;
      
      // Wpisujemy do nowego okna
      printWindow.document.open();
      printWindow.document.write(printContent);
      printWindow.document.close();
    } catch (error) {
      console.error('Błąd podczas drukowania:', error);
      showError('Wystąpił błąd podczas drukowania. Spróbuj ponownie.');
    }
  };
  
  // Funkcja obliczająca wartości VAT dla każdej pozycji i każdego kosztu
  const calculateVATValues = (items = [], additionalCostsItems = []) => {
    // Obliczanie wartości netto i VAT dla pozycji produktów
    let itemsNetTotal = 0;
    let itemsVatTotal = 0;
    
    items.forEach(item => {
      const itemNet = parseFloat(item.totalPrice) || 0;
      itemsNetTotal += itemNet;
      
      // Obliczanie VAT dla pozycji na podstawie jej indywidualnej stawki VAT
      const vatRate = typeof item.vatRate === 'number' ? item.vatRate : 0;
      const itemVat = (itemNet * vatRate) / 100;
      itemsVatTotal += itemVat;
    });
    
    // Obliczanie wartości netto i VAT dla dodatkowych kosztów
    let additionalCostsNetTotal = 0;
    let additionalCostsVatTotal = 0;
    
    additionalCostsItems.forEach(cost => {
      const costNet = parseFloat(cost.value) || 0;
      additionalCostsNetTotal += costNet;
      
      // Obliczanie VAT dla dodatkowego kosztu na podstawie jego indywidualnej stawki VAT
      const vatRate = typeof cost.vatRate === 'number' ? cost.vatRate : 0;
      const costVat = (costNet * vatRate) / 100;
      additionalCostsVatTotal += costVat;
    });
    
    // Suma wartości netto: produkty + dodatkowe koszty
    const totalNet = itemsNetTotal + additionalCostsNetTotal;
    
    // Suma VAT: VAT od produktów + VAT od dodatkowych kosztów
    const totalVat = itemsVatTotal + additionalCostsVatTotal;
    
    // Wartość brutto: suma netto + suma VAT
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
  
  // Sprawdzamy czy zamówienie ma dodatkowe koszty do rozliczenia
  const hasDynamicFields = purchaseOrder?.additionalCostsItems?.length > 0 || 
                          (purchaseOrder?.additionalCosts && parseFloat(purchaseOrder.additionalCosts) > 0);
  
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
                onClick={handleDirectPrint}
                startIcon={<PrintIcon />}
                sx={{ mr: 1 }}
              >
                Drukuj
              </Button>
              
              {hasDynamicFields && (
                <Button
                  variant="outlined"
                  color="success"
                  onClick={handleUpdateBatchPrices}
                  startIcon={<RefreshIcon />}
                  sx={{ mr: 1 }}
                >
                  Aktualizuj ceny partii
                </Button>
              )}
              
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
                ref={menuAnchorRef}
                onClick={(event) => setMenuAnchorRef(event.currentTarget)}
              >
                <MoreVertIcon />
              </IconButton>
            </Box>
          </Box>
          
          <Box 
            ref={printRef} 
            sx={{ 
              mb: 3,
              '@media print': {
                padding: 0,
                margin: 0
              }
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
                  
                  {/* Stary pojedynczy link do faktury (dla kompatybilności) */}
                  {purchaseOrder.invoiceLink && (!purchaseOrder.invoiceLinks || purchaseOrder.invoiceLinks.length === 0) && (
                    <Typography variant="body1" gutterBottom>
                      <strong>Faktura:</strong>{' '}
                      <a href={purchaseOrder.invoiceLink} target="_blank" rel="noopener noreferrer">
                        Zobacz fakturę
                      </a>
                    </Typography>
                  )}
                  
                  {/* Wiele linków do faktur */}
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
                        
                        {/* Adres główny dostawcy */}
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
            
            {/* Historia zmian statusu */}
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
                            <TableCell align="right">{formatCurrency(item.unitPrice, purchaseOrder.currency)}</TableCell>
                            <TableCell align="right">{formatCurrency(item.totalPrice, purchaseOrder.currency)}</TableCell>
                            <TableCell align="right">
                              {received} {received > 0 && `(${fulfilledPercentage.toFixed(0)}%)`}
                            </TableCell>
                            {/* Ukrywamy przycisk akcji przy drukowaniu */}
                            <TableCell align="right" sx={{ '@media print': { display: 'none' } }}>
                              {canReceiveItems && item.inventoryItemId && 
                               (parseFloat(item.received || 0) < parseFloat(item.quantity || 0)) && (
                                <Button
                                  size="small"
                                  variant="outlined"
                                  startIcon={<InventoryIcon />}
                                  onClick={() => handleReceiveClick(item)}
                                >
                                  Przyjmij
                                </Button>
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
                                            onClick={() => handleBatchClick(batch.id, item.id)}
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
                                                      Magazyn: {batch.warehouseName || batch.warehouseId}
                                                    </Typography>
                                                  )}
                                                </React.Fragment>
                                              }
                                            />
                                            <Chip 
                                              size="small" 
                                              label="Przejdź do szczegółów" 
                                              color="primary" 
                                              variant="outlined" 
                                              sx={{ ml: 1 }}
                                            />
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
                          <TableCell align="right">{vatRate}%</TableCell>
                          <TableCell align="right">{formatCurrency(vatValue, purchaseOrder.currency)}</TableCell>
                          <TableCell align="right">{formatCurrency(grossValue, purchaseOrder.currency)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                
                <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleUpdateBatchPrices}
                    startIcon={<RefreshIcon />}
                  >
                    Zaktualizuj ceny partii
                  </Button>
                </Box>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'right' }}>
                  Kliknij by zaktualizować ceny LOT-ów powiązanych z tym zamówieniem
                </Typography>
              </>
            ) : (
              <Typography variant="body2" color="text.secondary">
                Brak dodatkowych kosztów
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
              <MenuItem value="pending">{translateStatus('pending')}</MenuItem>
              <MenuItem value="approved">{translateStatus('approved')}</MenuItem>
              <MenuItem value="ordered">{translateStatus('ordered')}</MenuItem>
              <MenuItem value="partial">{translateStatus('partial')}</MenuItem>
              <MenuItem value="shipped">{translateStatus('shipped')}</MenuItem>
              <MenuItem value="delivered">{translateStatus('delivered')}</MenuItem>
              <MenuItem value="cancelled">{translateStatus('cancelled')}</MenuItem>
              <MenuItem value="completed">{translateStatus('completed')}</MenuItem>
              <MenuItem value="confirmed">{translateStatus('confirmed')}</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleStatusUpdate} color="primary">Zapisz</Button>
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
    </Container>
  );
};

export default PurchaseOrderDetails; 