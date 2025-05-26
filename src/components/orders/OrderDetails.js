import React, { useState, useEffect, useRef } from 'react';
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
  Alert
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
  Label as LabelIcon
} from '@mui/icons-material';
import { getOrderById, ORDER_STATUSES, updateOrder, migrateCmrHistoryData } from '../../services/orderService';
import { useNotification } from '../../hooks/useNotification';
import { formatCurrency } from '../../utils/formatUtils';
import { formatTimestamp, formatDate } from '../../utils/dateUtils';
import { storage } from '../../services/firebase/config';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { useAuth } from '../../contexts/AuthContext';
import { getAllPurchaseOrders } from '../../services/purchaseOrderService';
import { db } from '../../services/firebase/config';
import { getDoc, doc } from 'firebase/firestore';
import { getUsersDisplayNames } from '../../services/userService';

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

// Funkcja sprawdzająca czy zadania produkcyjne istnieją i usuwająca nieistniejące referencje
const verifyProductionTasks = async (orderToVerify) => {
  if (!orderToVerify || !orderToVerify.productionTasks || orderToVerify.productionTasks.length === 0) {
    return { order: orderToVerify, removedCount: 0 };
  }

  try {
    const { getTaskById } = await import('../../services/productionService');
    const { removeProductionTaskFromOrder } = await import('../../services/orderService');
    
    const verifiedTasks = [];
    const tasksToRemove = [];
    
    // Sprawdź każde zadanie produkcyjne
    for (const task of orderToVerify.productionTasks) {
      try {
        // Próba pobrania zadania z bazy
        const taskDoc = await getTaskById(task.id);
        // Jeśli dotarliśmy tutaj, zadanie istnieje
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
            console.log(`Usunięto nieistniejące zadanie ${task.id} (${task.moNumber || 'bez numeru'}) z zamówienia ${orderToVerify.id}`);
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
      
      return { order: updatedOrder, removedCount: tasksToRemove.length };
    }
    
    return { order: orderToVerify, removedCount: 0 };
  } catch (error) {
    console.error('Błąd podczas weryfikacji zadań produkcyjnych:', error);
    return { order: orderToVerify, removedCount: 0 };
  }
};

const OrderDetails = () => {
  const { orderId } = useParams();
  const location = useLocation();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const { showError, showSuccess, showInfo } = useNotification();
  const navigate = useNavigate();
  const fileInputRef = React.useRef(null);
  const { currentUser } = useAuth();
  const [openPurchaseOrderDialog, setOpenPurchaseOrderDialog] = useState(false);
  const [availablePurchaseOrders, setAvailablePurchaseOrders] = useState([]);
  const [selectedPurchaseOrderId, setSelectedPurchaseOrderId] = useState('');
  const [loadingPurchaseOrders, setLoadingPurchaseOrders] = useState(false);
  const [userNames, setUserNames] = useState({});
  const [driveLinkDialogOpen, setDriveLinkDialogOpen] = useState(false);
  const [driveLink, setDriveLink] = useState('');
  const [labelDialogOpen, setLabelDialogOpen] = useState(false);
  const [selectedItemForLabel, setSelectedItemForLabel] = useState(null);

  useEffect(() => {
    const fetchOrderDetails = async (retries = 3, delay = 1000) => {
      try {
        setLoading(true);
        
        // Sprawdź, czy jesteśmy na właściwej trasie dla zamówień klientów
        if (location.pathname.includes('/purchase-orders/')) {
          console.log('Jesteśmy na stronie zamówienia zakupowego, pomijam pobieranie zamówienia klienta.');
          setLoading(false);
          return;
        }
        
        const orderData = await getOrderById(orderId);
        
        // Zweryfikuj, czy powiązane zadania produkcyjne istnieją
        const { order: verifiedOrder, removedCount } = await verifyProductionTasks(orderData);
        
        if (removedCount > 0) {
          showInfo(`Usunięto ${removedCount} nieistniejących zadań produkcyjnych z zamówienia.`);
        }
        
        // Sprawdź, czy wartość zamówienia jest ujemna - jeśli tak, odśwież dane
        if (verifiedOrder.totalValue < 0) {
          console.log("Wykryto ujemną wartość zamówienia:", verifiedOrder.totalValue);
          setOrder(verifiedOrder);
          setTimeout(() => refreshOrderData(), 500); // Odśwież dane zamówienia z małym opóźnieniem
          return;
        }
        
        setOrder(verifiedOrder);
        
        // Jeśli zamówienie ma historię zmian statusu, pobierz dane użytkowników
        if (verifiedOrder.statusHistory && verifiedOrder.statusHistory.length > 0) {
          const userIds = verifiedOrder.statusHistory.map(change => change.changedBy).filter(id => id);
          const uniqueUserIds = [...new Set(userIds)];
          const names = await getUsersDisplayNames(uniqueUserIds);
          setUserNames(names);
        }
      } catch (error) {
        // Sprawdź, czy nie jesteśmy na stronie zamówienia zakupowego
        if (!location.pathname.includes('/purchase-orders/')) {
          console.error('Error fetching order details:', error);
          
          // Jeśli mamy jeszcze próby, spróbuj ponownie po opóźnieniu
          if (retries > 0) {
            console.log(`Ponowna próba pobierania danych zamówienia za ${delay}ms, pozostało prób: ${retries}`);
            setTimeout(() => {
              fetchOrderDetails(retries - 1, delay * 1.5);
            }, delay);
          } else {
            showError('Błąd podczas pobierania szczegółów zamówienia: ' + error.message);
          }
        }
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchOrderDetails();
    }
  }, [orderId, showError, navigate, location.pathname]);

  // Funkcja do ręcznego odświeżania danych zamówienia
  const refreshOrderData = async (retries = 3, delay = 1000) => {
    try {
      setLoading(true);
      
      // Sprawdź, czy jesteśmy na właściwej trasie dla zamówień klientów
      if (location.pathname.includes('/purchase-orders/')) {
        console.log('Jesteśmy na stronie zamówienia zakupowego, pomijam odświeżanie zamówienia klienta.');
        setLoading(false);
        return;
      }
      
      const freshOrder = await getOrderById(orderId);
      
      // Zweryfikuj, czy powiązane zadania produkcyjne istnieją
      const { order: verifiedOrder, removedCount } = await verifyProductionTasks(freshOrder);
      
      if (removedCount > 0) {
        showInfo(`Usunięto ${removedCount} nieistniejących zadań produkcyjnych z zamówienia.`);
      }
      
      setOrder(verifiedOrder);
      showSuccess('Dane zamówienia zostały odświeżone');
    } catch (error) {
      if (!location.pathname.includes('/purchase-orders/')) {
        console.error('Error refreshing order data:', error);
        
        // Jeśli mamy jeszcze próby, spróbuj ponownie po opóźnieniu
        if (retries > 0) {
          console.log(`Ponowna próba odświeżania danych zamówienia za ${delay}ms, pozostało prób: ${retries}`);
          setTimeout(() => {
            refreshOrderData(retries - 1, delay * 1.5);
          }, delay);
        } else {
          showError('Błąd podczas odświeżania danych zamówienia: ' + error.message);
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
        console.log('Jesteśmy na stronie zamówienia zakupowego, pomijam odświeżanie kosztów produkcji.');
        setLoading(false);
        return;
      }
      
      // Pobierz aktualne dane zadań produkcyjnych
      const refreshedOrderData = await getOrderById(orderId);
      
      if (refreshedOrderData.productionTasks && refreshedOrderData.productionTasks.length > 0) {
        // Zaktualizuj dane zamówienia
        setOrder(refreshedOrderData);
        showSuccess('Dane kosztów produkcji zostały odświeżone');
      } else {
        showInfo('Brak zadań produkcyjnych do odświeżenia');
      }
    } catch (error) {
      if (!location.pathname.includes('/purchase-orders/')) {
        console.error('Error refreshing production costs:', error);
        
        // Jeśli mamy jeszcze próby, spróbuj ponownie po opóźnieniu
        if (retries > 0) {
          console.log(`Ponowna próba odświeżania kosztów produkcji za ${delay}ms, pozostało prób: ${retries}`);
          setTimeout(() => {
            refreshProductionCosts(retries - 1, delay * 1.5);
          }, delay);
        } else {
          showError('Błąd podczas odświeżania danych kosztów produkcji: ' + error.message);
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
      showInfo('Rozpoczęcie migracji danych CMR...');
      
      const result = await migrateCmrHistoryData();
      
      if (result.success) {
        showSuccess(`Migracja zakończona pomyślnie. Zmigrowano ${result.migratedCount} zamówień.`);
        // Odśwież dane zamówienia
        await refreshOrderData();
      }
    } catch (error) {
      console.error('Błąd podczas migracji:', error);
      showError('Wystąpił błąd podczas migracji danych CMR: ' + error.message);
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

  const handleDeliveryProofUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      
      // Tworzymy referencję do pliku w Firebase Storage
      const storageRef = ref(storage, `delivery_proofs/${orderId}/${file.name}`);
      
      // Przesyłamy plik
      await uploadBytes(storageRef, file);
      
      // Pobieramy URL do pliku
      const downloadURL = await getDownloadURL(storageRef);
      
      // Aktualizujemy zamówienie z URL do dowodu dostawy
      await updateOrder(orderId, { ...order, deliveryProof: downloadURL }, currentUser.uid);
      
      // Aktualizujemy stan lokalny
      setOrder({ ...order, deliveryProof: downloadURL });
      
      showSuccess('Dowód dostawy został pomyślnie przesłany');
    } catch (error) {
      console.error('Błąd podczas przesyłania pliku:', error);
      showError('Wystąpił błąd podczas przesyłania pliku');
    } finally {
      setUploading(false);
    }
  };
  
  const handleDeleteDeliveryProof = async () => {
    if (!order.deliveryProof) return;
    
    try {
      setUploading(true);
      
      // Wyciągamy ścieżkę pliku z URL
      const fileUrl = order.deliveryProof;
      const storageRef = ref(storage, fileUrl);
      
      // Usuwamy plik z Firebase Storage
      await deleteObject(storageRef);
      
      // Aktualizujemy zamówienie
      await updateOrder(orderId, { ...order, deliveryProof: null }, currentUser.uid);
      
      // Aktualizujemy stan lokalny
      setOrder({ ...order, deliveryProof: null });
      
      showSuccess('Dowód dostawy został usunięty');
    } catch (error) {
      console.error('Błąd podczas usuwania pliku:', error);
      showError('Wystąpił błąd podczas usuwania pliku');
    } finally {
      setUploading(false);
    }
  };

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

  const handleAssignPurchaseOrder = () => {
    setOpenPurchaseOrderDialog(true);
    fetchAvailablePurchaseOrders();
  };
  
  const fetchAvailablePurchaseOrders = async () => {
    try {
      setLoadingPurchaseOrders(true);
      const allPurchaseOrders = await getAllPurchaseOrders();
      
      // Filtruj, aby wyświetlić tylko PO, które jeszcze nie są przypisane do tego zamówienia
      const alreadyLinkedIds = (order.linkedPurchaseOrders || []).map(po => po.id);
      const filteredPOs = allPurchaseOrders.filter(po => !alreadyLinkedIds.includes(po.id));
      
      setAvailablePurchaseOrders(filteredPOs);
    } catch (error) {
      console.error('Błąd podczas pobierania dostępnych zamówień zakupowych:', error);
    } finally {
      setLoadingPurchaseOrders(false);
    }
  };
  
  const handleClosePurchaseOrderDialog = () => {
    setOpenPurchaseOrderDialog(false);
    setSelectedPurchaseOrderId('');
  };
  
  const handlePurchaseOrderSelection = (event) => {
    setSelectedPurchaseOrderId(event.target.value);
  };
  
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
      const updatedLinkedPOs = [...(order.linkedPurchaseOrders || []), poToLink];
      
      // Zaktualizuj zamówienie w bazie danych
      const updatedOrder = {
        ...order,
        linkedPurchaseOrders: updatedLinkedPOs
      };
      
      await updateOrder(order.id, updatedOrder, currentUser.uid);
      
      // Zaktualizuj stan lokalny
      setOrder(updatedOrder);
      
      // Zamknij dialog
      handleClosePurchaseOrderDialog();
    } catch (error) {
      console.error('Błąd podczas przypisywania zamówienia zakupowego:', error);
    }
  };

  // Funkcja zwracająca nazwę użytkownika zamiast ID
  const getUserName = (userId) => {
    return userNames[userId] || userId || 'System';
  };

  // Dodaję komponent wyświetlający historię zmian statusu przed sekcją z listą produktów
  const renderStatusHistory = () => {
    if (!order.statusHistory || order.statusHistory.length === 0) {
      return null;
    }
    
    return (
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
            {[...order.statusHistory].reverse().map((change, index) => (
              <TableRow key={index}>
                <TableCell>
                  {change.changedAt ? new Date(change.changedAt).toLocaleString('pl') : 'Brak daty'}
                </TableCell>
                <TableCell>{change.oldStatus}</TableCell>
                <TableCell>{change.newStatus}</TableCell>
                <TableCell>{getUserName(change.changedBy)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    );
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

  const handleDriveLinkSubmit = async () => {
    if (!driveLink) {
      showError('Wprowadź prawidłowy link do Google Drive');
      return;
    }

    // Sprawdzamy czy link jest do Google Drive
    if (!driveLink.includes('drive.google.com')) {
      showError('Link musi być z Google Drive');
      return;
    }

    try {
      setUploading(true);
      
      // Aktualizujemy zamówienie z linkiem do Google Drive
      await updateOrder(orderId, { 
        ...order, 
        deliveryProof: driveLink,
        deliveryProofType: 'link' // Dodajemy informację o typie dowodu
      }, currentUser.uid);
      
      // Aktualizujemy stan lokalny
      setOrder({ 
        ...order, 
        deliveryProof: driveLink,
        deliveryProofType: 'link'
      });
      
      showSuccess('Link do Google Drive dodany jako dowód dostawy');
      handleDriveLinkDialogClose();
    } catch (error) {
      console.error('Błąd podczas dodawania linku do Google Drive:', error);
      showError('Wystąpił błąd podczas dodawania linku');
    } finally {
      setUploading(false);
    }
  };

  // Pomocnicze funkcje do wykrywania typu dowodu dostawy
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

  const handleLabelDialogOpen = (item) => {
    setSelectedItemForLabel(item);
    setLabelDialogOpen(true);
  };

  const handleLabelDialogClose = () => {
    setLabelDialogOpen(false);
    setSelectedItemForLabel(null);
  };

  const handlePrintLabel = () => {
    // Przekierowanie do strony drukowania etykiety wysyłkowej dla wybranego produktu
    navigate(`/orders/${orderId}/shipping-label`, { 
      state: { 
        item: selectedItemForLabel,
        orderNumber: order.orderNumber, 
        returnTo: `/orders/${orderId}`
      } 
    });
    handleLabelDialogClose();
  };

  // Funkcja do określania statusu produkcji dla danego elementu
  const getProductionStatus = (item, productionTasks) => {
    // Sprawdź, czy element ma bezpośrednio przypisane zadanie produkcyjne
    if (item.productionTaskId && item.productionStatus) {
      const statusColor = getProductionStatusColor(item.productionStatus);
      
      // Stwórz chip z możliwością kliknięcia, który przeniesie do szczegółów zadania
      return (
        <Tooltip title={`Przejdź do zadania produkcyjnego ${item.productionTaskNumber || item.productionTaskId}`}>
          <Chip
            label={item.productionStatus}
            size="small"
            color={statusColor}
            clickable
            onClick={() => navigate(`/production/tasks/${item.productionTaskId}`)}
            sx={{ cursor: 'pointer' }}
          />
        </Tooltip>
      );
    }
    
    // Tradycyjne sprawdzenie, jeśli nie ma bezpośredniego przypisania
    if (!productionTasks || !Array.isArray(productionTasks) || productionTasks.length === 0) {
      return <Chip label="Brak zadań" size="small" color="default" />;
    }

    // Znajdź zadania produkcyjne dla tego elementu
    const tasksForItem = productionTasks.filter(task => 
      task.productId === item.id || 
      task.productName?.toLowerCase() === item.name?.toLowerCase()
    );

    if (tasksForItem.length === 0) {
      return <Chip label="Brak zadań" size="small" color="default" />;
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
            onClick={() => navigate(`/production/tasks/${task.id}`)}
            sx={{ cursor: 'pointer' }}
          />
        </Tooltip>
      );
    }

    // W przypadku wielu zadań, pokaż ogólny status
    if (allCompleted) {
      return <Chip label={`Zakończone (${tasksForItem.length})`} size="small" color="success" />;
    } else if (allCancelled) {
      return <Chip label={`Anulowane (${tasksForItem.length})`} size="small" color="error" />;
    } else if (anyInProgress) {
      return <Chip label={`W trakcie (${tasksForItem.length})`} size="small" color="warning" />;
    } else if (anyPlanned) {
      return <Chip label={`Zaplanowane (${tasksForItem.length})`} size="small" color="primary" />;
    } else {
      return <Chip label={`Mieszany (${tasksForItem.length})`} size="small" color="default" />;
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
          Nie znaleziono zamówienia
        </Typography>
        <Button 
          startIcon={<ArrowBackIcon />} 
          onClick={handleBackClick}
          sx={{ mt: 2 }}
        >
          Powrót do listy zamówień
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
            Powrót
          </Button>
          <Typography variant="h5">
            Zamówienie {order.orderNumber || order.id.substring(0, 8).toUpperCase()}
          </Typography>
          <Box>
            <Button 
              startIcon={<EditIcon />} 
              variant="outlined"
              onClick={handleEditClick}
              sx={{ mr: 1 }}
            >
              Edytuj
            </Button>
            <Button 
              startIcon={<PrintIcon />} 
              variant="outlined"
              onClick={handlePrintInvoice}
              sx={{ mr: 1 }}
            >
              Drukuj
            </Button>
            <Button 
              startIcon={<LabelIcon />} 
              variant="outlined"
              onClick={() => setLabelDialogOpen(true)}
              sx={{ mr: 1 }}
            >
              Drukuj etykietę
            </Button>
            {/* Przycisk migracji - tylko do testowania */}
            <Button 
              startIcon={<RefreshIcon />} 
              variant="outlined"
              color="secondary"
              onClick={handleMigrateCmrData}
              size="small"
            >
              Migruj CMR
            </Button>
          </Box>
        </Box>

        {/* Status i informacje podstawowe */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ mr: 2 }}>Status:</Typography>
                <Chip 
                  label={order.status} 
                  color={getStatusChipColor(order.status)}
                  size="medium"
                />
              </Box>
              <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <EventNoteIcon sx={{ mr: 1 }} fontSize="small" />
                Data zamówienia: {formatTimestamp(order.orderDate, true)}
              </Typography>
              {order.expectedDeliveryDate && (
                <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <ScheduleIcon sx={{ mr: 1 }} fontSize="small" />
                  Oczekiwana dostawa: {formatTimestamp(order.expectedDeliveryDate, true)}
                </Typography>
              )}
              {order.deliveryDate && (
                <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center' }}>
                  <LocalShippingIcon sx={{ mr: 1 }} fontSize="small" />
                  Dostarczone: {formatTimestamp(order.deliveryDate, true)}
                </Typography>
              )}
            </Grid>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', justifyContent: 'flex-end', flexDirection: 'column', height: '100%' }}>
                <Typography variant="h6" align="right">
                  Łączna wartość:
                </Typography>
                <Typography variant="h4" align="right" color="primary.main" sx={{ fontWeight: 'bold' }}>
                  {(() => {
                    // Oblicz wartość produktów
                    const productsValue = order.items?.reduce((sum, item) => sum + calculateItemTotalValue(item), 0) || 0;
                    
                    // Koszt dostawy
                    const shippingCost = parseFloat(order.shippingCost) || 0;
                    
                    // Dodatkowe koszty (tylko pozytywne)
                    const additionalCosts = order.additionalCostsItems ? 
                      order.additionalCostsItems
                        .filter(cost => parseFloat(cost.value) > 0)
                        .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0) : 0;
                    
                    // Rabaty (wartości ujemne) - jako wartość pozytywna do odjęcia
                    const discounts = order.additionalCostsItems ? 
                      Math.abs(order.additionalCostsItems
                        .filter(cost => parseFloat(cost.value) < 0)
                        .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)) : 0;
                    
                    // Łączna wartość bez uwzględnienia PO
                    const total = productsValue + shippingCost + additionalCosts - discounts;
                    
                    return formatCurrency(total);
                  })()}
                </Typography>
                <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                  <Tooltip title="Odśwież dane zamówienia">
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

        {/* Informacje o kliencie i płatności */}
        <Grid container spacing={3} sx={{ mb: 3 }}>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6">Dane klienta</Typography>
                <IconButton 
                  size="small" 
                  color="primary"
                  onClick={handleSendEmail}
                  disabled={!order.customer?.email}
                >
                  <EmailIcon />
                </IconButton>
              </Box>
              <Divider sx={{ mb: 2 }} />
              <Typography variant="h6" sx={{ mb: 1 }}>{order.customer?.name || 'Brak nazwy klienta'}</Typography>
              <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <PersonIcon sx={{ mr: 1 }} fontSize="small" />
                Email: {order.customer?.email || '-'}
              </Typography>
              <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <PhoneIcon sx={{ mr: 1 }} fontSize="small" />
                Telefon: {order.customer?.phone || '-'}
              </Typography>
              <Typography variant="body1" sx={{ display: 'flex', alignItems: 'center' }}>
                <LocationOnIcon sx={{ mr: 1 }} fontSize="small" />
                Adres dostawy: {order.customer?.shippingAddress || '-'}
              </Typography>
            </Paper>
          </Grid>
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Typography variant="h6" sx={{ mb: 2 }}>Płatność i dostawa</Typography>
              <Divider sx={{ mb: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="subtitle2">Metoda płatności:</Typography>
                  <Typography variant="body1" sx={{ mb: 1 }}>{order.paymentMethod || '-'}</Typography>
                  
                  <Typography variant="subtitle2">Status płatności:</Typography>
                  <Chip 
                    label={order.paymentStatus || 'Nieopłacone'} 
                    color={order.paymentStatus === 'Opłacone' ? 'success' : order.paymentStatus === 'Opłacone częściowo' ? 'warning' : 'error'}
                    size="small"
                    sx={{ mt: 0.5 }}
                  />
                </Grid>
                <Grid item xs={6}>
                  <Typography variant="subtitle2">Metoda dostawy:</Typography>
                  <Typography variant="body1" sx={{ mb: 1 }}>{order.shippingMethod || '-'}</Typography>
                  
                  <Typography variant="subtitle2">Koszt dostawy:</Typography>
                  <Typography variant="body1">{formatCurrency(order.shippingCost || 0)}</Typography>
                </Grid>
              </Grid>
            </Paper>
          </Grid>
        </Grid>

        {/* Wyświetlenie historii zmian statusu */}
        {renderStatusHistory()}

        {/* Lista produktów */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Produkty</Typography>
          <Divider sx={{ mb: 2 }} />
          <Table>
            <TableHead>
              <TableRow sx={{ bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                <TableCell sx={{ color: 'inherit' }}>Produkt</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">Ilość</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">Wysłano</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">Cena</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">Wartość</TableCell>
                <TableCell sx={{ color: 'inherit' }}>Lista cenowa</TableCell>
                <TableCell sx={{ color: 'inherit' }}>Status produkcji</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">
                  Koszt produkcji
                  <Tooltip title="Odśwież dane zadań produkcyjnych">
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
                <TableCell sx={{ color: 'inherit' }} align="right">Profit</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">Suma wartości pozycji</TableCell>
                <TableCell sx={{ color: 'inherit' }} align="right">Koszt całk./szt.</TableCell>
                <TableCell sx={{ color: 'inherit' }}>Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {order.items && order.items.map((item, index) => (
                <TableRow key={index} sx={{ '&:nth-of-type(odd)': { bgcolor: 'action.hover' } }}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell align="right">{item.quantity} {item.unit}</TableCell>
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
                                sx={{ display: 'block', lineHeight: 1.2 }}
                              >
                                CMR: {cmrEntry.cmrNumber} ({cmrEntry.quantity} {cmrEntry.unit})
                              </Typography>
                            ))}
                          </Box>
                        ) : item.lastCmrNumber ? (
                          <Typography variant="caption" color="text.secondary">
                            CMR: {item.lastCmrNumber}
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
                  <TableCell>
                    {item.fromPriceList ? (
                      <Chip 
                        label="Tak" 
                        size="small" 
                        color="success" 
                        variant="outlined" 
                      />
                    ) : (
                      <Chip 
                        label="Nie" 
                        size="small" 
                        color="default" 
                        variant="outlined" 
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {getProductionStatus(item, order.productionTasks)}
                  </TableCell>
                  <TableCell align="right">
                    {item.productionTaskId && item.productionCost !== undefined ? (
                      <Tooltip title="Koszt produkcji zadania">
                        <Typography>
                          {formatCurrency(item.productionCost)}
                        </Typography>
                      </Tooltip>
                    ) : (
                      <Typography variant="body2" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {item.fromPriceList && item.productionCost !== undefined ? (
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
                      const shippingCost = parseFloat(order.shippingCost) || 0;
                      
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
                      const additionalShare = proportion * (shippingCost + additionalCosts - discounts);
                      
                      // Całkowity koszt pozycji z kosztami dodatkowymi
                      const totalWithAdditional = itemTotalValue + additionalShare;
                      
                      // Koszt pojedynczej sztuki
                      const quantity = parseFloat(item.quantity) || 1;
                      const unitCost = totalWithAdditional / quantity;
                      
                      return formatCurrency(unitCost);
                    })()}
                  </TableCell>
                  <TableCell>
                    <Tooltip title="Drukuj etykietę">
                      <IconButton 
                        size="small" 
                        color="primary"
                        onClick={() => handleLabelDialogOpen(item)}
                      >
                        <LabelIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell colSpan={2} />
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  Suma częściowa:
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {formatCurrency(order.items?.reduce((sum, item) => sum + calculateItemTotalValue(item), 0) || 0)}
                </TableCell>
                <TableCell colSpan={3} />
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {formatCurrency(order.items?.reduce((sum, item) => sum + calculateItemTotalValue(item), 0) || 0)}
                </TableCell>
                <TableCell colSpan={2} />
              </TableRow>
              <TableRow>
                <TableCell colSpan={2} />
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  Koszt dostawy:
                </TableCell>
                <TableCell align="right">
                  {formatCurrency(order.shippingCost || 0)}
                </TableCell>
                <TableCell colSpan={5} />
              </TableRow>
              
              {/* Dodatkowe koszty (tylko jeśli istnieją) */}
              {order.additionalCostsItems && order.additionalCostsItems.length > 0 && (
                <>
                  {/* Wyświetl pozytywne koszty (dodatnie) */}
                  {order.additionalCostsItems.some(cost => parseFloat(cost.value) > 0) && (
                    <>
                      {order.additionalCostsItems
                        .filter(cost => parseFloat(cost.value) > 0)
                        .map((cost, index) => (
                          <TableRow key={`cost-${cost.id || index}`}>
                            <TableCell colSpan={2} />
                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                              {cost.description || `Dodatkowy koszt ${index + 1}`}:
                            </TableCell>
                            <TableCell align="right">
                              {formatCurrency(parseFloat(cost.value) || 0)}
                            </TableCell>
                            <TableCell colSpan={5} />
                          </TableRow>
                        ))
                      }
                      <TableRow>
                        <TableCell colSpan={2} />
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                          Suma dodatkowych kosztów:
                        </TableCell>
                        <TableCell align="right">
                          {formatCurrency(order.additionalCostsItems
                            .filter(cost => parseFloat(cost.value) > 0)
                            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
                          )}
                        </TableCell>
                        <TableCell colSpan={5} />
                      </TableRow>
                    </>
                  )}
                  
                  {/* Wyświetl rabaty (wartości ujemne) */}
                  {order.additionalCostsItems.some(cost => parseFloat(cost.value) < 0) && (
                    <>
                      {order.additionalCostsItems
                        .filter(cost => parseFloat(cost.value) < 0)
                        .map((cost, index) => (
                          <TableRow key={`discount-${cost.id || index}`}>
                            <TableCell colSpan={2} />
                            <TableCell align="right" sx={{ fontWeight: 'bold', color: 'secondary.main' }}>
                              {cost.description || `Rabat ${index + 1}`}:
                            </TableCell>
                            <TableCell align="right" sx={{ color: 'secondary.main' }}>
                              {formatCurrency(Math.abs(parseFloat(cost.value)) || 0)}
                            </TableCell>
                            <TableCell colSpan={5} />
                          </TableRow>
                        ))
                      }
                      <TableRow>
                        <TableCell colSpan={2} />
                        <TableCell align="right" sx={{ fontWeight: 'bold', color: 'secondary.main' }}>
                          Suma rabatów:
                        </TableCell>
                        <TableCell align="right" sx={{ color: 'secondary.main' }}>
                          {formatCurrency(Math.abs(order.additionalCostsItems
                            .filter(cost => parseFloat(cost.value) < 0)
                            .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)
                          ))}
                        </TableCell>
                        <TableCell colSpan={5} />
                      </TableRow>
                    </>
                  )}
                </>
              )}
              
              <TableRow>
                <TableCell colSpan={2} />
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  Razem:
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold', fontSize: '1.2rem' }}>
                  {(() => {
                    // Oblicz wartość zamówienia jako sumę produktów, kosztów dostawy i dodatkowych kosztów
                    const productsValue = order.items?.reduce((sum, item) => sum + calculateItemTotalValue(item), 0) || 0;
                    const shippingCost = parseFloat(order.shippingCost) || 0;
                    
                    // Dodatkowe koszty (tylko pozytywne)
                    const additionalCosts = order.additionalCostsItems ? 
                      order.additionalCostsItems
                        .filter(cost => parseFloat(cost.value) > 0)
                        .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0) : 0;
                    
                    // Rabaty (wartości ujemne) - jako wartość pozytywna do odjęcia
                    const discounts = order.additionalCostsItems ? 
                      Math.abs(order.additionalCostsItems
                        .filter(cost => parseFloat(cost.value) < 0)
                        .reduce((sum, cost) => sum + (parseFloat(cost.value) || 0), 0)) : 0;
                    
                    // Łączna wartość
                    const total = productsValue + shippingCost + additionalCosts - discounts;
                    
                    return formatCurrency(total);
                  })()}
                </TableCell>
                <TableCell colSpan={5} />
              </TableRow>
            </TableBody>
          </Table>
        </Paper>

        {/* Sekcja dowodu dostawy */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Dowód dostawy</Typography>
          <Divider sx={{ mb: 2 }} />
          
          {order.deliveryProof ? (
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {isImageUrl(order.deliveryProof) ? (
                <Box sx={{ width: '100%', maxWidth: 600, mb: 2 }}>
                  <img 
                    src={order.deliveryProof} 
                    alt="Dowód dostawy" 
                    style={{ width: '100%', height: 'auto', borderRadius: 4 }} 
                  />
                </Box>
              ) : isGoogleDriveLink(order.deliveryProof) ? (
                <Box sx={{ width: '100%', maxWidth: 600, mb: 2, p: 3, border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
                  <Typography variant="h6" align="center" gutterBottom>
                    <LinkIcon color="primary" sx={{ verticalAlign: 'middle', mr: 1 }} />
                    Link do Google Drive
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom align="center">
                    {order.deliveryProof}
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
                  href={order.deliveryProof}
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

        {/* Uwagi */}
        {order.notes && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Uwagi</Typography>
            <Divider sx={{ mb: 2 }} />
            <Typography variant="body1">
              {order.notes}
            </Typography>
          </Paper>
        )}
        
        {/* Powiązane zamówienia zakupu */}
        {order && (
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Powiązane zamówienia zakupu</Typography>
              <Button 
                variant="outlined" 
                startIcon={<PlaylistAddIcon />} 
                onClick={handleAssignPurchaseOrder}
              >
                Przypisz PO
              </Button>
            </Box>
            <Divider sx={{ mb: 2 }} />
            
            {order.linkedPurchaseOrders && order.linkedPurchaseOrders.length > 0 ? (
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Numer zamówienia</TableCell>
                    <TableCell>Dostawca</TableCell>
                    <TableCell>Ilość pozycji</TableCell>
                    <TableCell align="right">Wartość brutto</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Akcje</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {order.linkedPurchaseOrders.map((po, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Chip 
                          label={po.number} 
                          color="primary" 
                          variant="outlined" 
                          size="small"
                          sx={{ fontWeight: 'bold' }}
                        />
                      </TableCell>
                      <TableCell>{po.supplier}</TableCell>
                      <TableCell>{po.items}</TableCell>
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
                            } else if (po.additionalCosts !== undefined) {
                              additionalCosts = typeof po.additionalCosts === 'number' ? po.additionalCosts : parseFloat(po.additionalCosts) || 0;
                            }
                            
                            // Wartość brutto: produkty + VAT + dodatkowe koszty
                            const grossValue = productsValue + vatValue + additionalCosts;
                            
                            return formatCurrency(grossValue);
                          } catch (error) {
                            console.error('Błąd podczas obliczania wartości PO:', error);
                            return formatCurrency(0);
                          }
                        })()}
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={po.status || "Robocze"} 
                          color={
                            po.status === 'completed' ? 'success' : 
                            po.status === 'in_progress' ? 'warning' : 
                            'default'
                          }
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Button
                          variant="outlined"
                          size="small"
                          onClick={() => navigate(`/purchase-orders/${po.id}`)}
                        >
                          Szczegóły
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <Typography variant="body1" color="text.secondary">
                Brak powiązanych zamówień zakupu
              </Typography>
            )}
          </Paper>
        )}

        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">Zadania produkcyjne</Typography>
            <IconButton 
              color="primary" 
              onClick={refreshProductionCosts} 
              title="Odśwież dane zadań produkcyjnych"
            >
              <RefreshIcon />
            </IconButton>
          </Box>
          <Divider sx={{ mb: 2 }} />
          
          {!order.productionTasks || order.productionTasks.length === 0 ? (
            <Typography variant="body1" color="text.secondary">
              Brak powiązanych zadań produkcyjnych
            </Typography>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nr MO</TableCell>
                  <TableCell>Nazwa zadania</TableCell>
                  <TableCell>Produkt</TableCell>
                  <TableCell>Ilość</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Numer partii</TableCell>
                  <TableCell align="right">Akcje</TableCell>
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
                        <Tooltip title="Numer partii produkcyjnej">
                          <Chip
                            label={task.lotNumber}
                            color="success"
                            size="small"
                            variant="outlined"
                          />
                        </Tooltip>
                      ) : task.status === 'Zakończone' ? (
                        <Chip
                          label="Brak numeru LOT"
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
                        Szczegóły
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Paper>

        {/* Dialog wyboru zamówienia zakupowego */}
        <Dialog open={openPurchaseOrderDialog} onClose={handleClosePurchaseOrderDialog} maxWidth="md" fullWidth>
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
            <Button onClick={handleClosePurchaseOrderDialog}>Anuluj</Button>
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
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleDriveLinkDialogClose}>Anuluj</Button>
            <Button onClick={handleDriveLinkSubmit} variant="contained">Dodaj</Button>
          </DialogActions>
        </Dialog>

        {/* Dialog wyboru etykiety produktu */}
        <Dialog open={labelDialogOpen} onClose={handleLabelDialogClose}>
          <DialogTitle>Wybierz produkt do etykiety</DialogTitle>
          <DialogContent>
            {selectedItemForLabel ? (
              <DialogContentText>
                Wybrano produkt: {selectedItemForLabel.name}
              </DialogContentText>
            ) : (
              <DialogContentText>
                Wybierz produkt z listy dla którego chcesz wydrukować etykietę:
              </DialogContentText>
            )}
            
            {!selectedItemForLabel && (
              <FormControl fullWidth sx={{ mt: 2 }}>
                <InputLabel>Produkt</InputLabel>
                <Select
                  value={selectedItemForLabel?.id || ''}
                  onChange={(e) => {
                    const selected = order.items.find(item => item.id === e.target.value);
                    setSelectedItemForLabel(selected);
                  }}
                  label="Produkt"
                >
                  {order.items && order.items.map((item, index) => (
                    <MenuItem key={index} value={item.id || index}>
                      {item.name} ({item.quantity} {item.unit})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={handleLabelDialogClose}>Anuluj</Button>
            <Button 
              onClick={handlePrintLabel} 
              variant="contained" 
              color="primary" 
              disabled={!selectedItemForLabel}
              startIcon={<LabelIcon />}
            >
              Drukuj etykietę
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    </div>
  );
};

export default OrderDetails; 