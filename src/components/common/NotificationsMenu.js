import React, { useState, useEffect, useRef } from 'react';
import { 
  IconButton, 
  Badge, 
  Menu, 
  MenuItem, 
  Typography, 
  Box, 
  List, 
  ListItem, 
  ListItemText, 
  ListItemIcon, 
  Divider, 
  Button,
  CircularProgress,
  styled,
  Tooltip,
  Paper,
  Snackbar,
  Alert
} from '@mui/material';
import { 
  Notifications as NotificationsIcon,
  Info as InfoIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  CheckCircle as SuccessIcon,
  ShoppingCart as PurchaseOrderIcon,
  ShoppingBasket as OrderIcon,
  Engineering as ProductionTaskIcon,
  Receipt as InvoiceIcon,
  LocalShipping as WaybillIcon,
  Description as CmrIcon,
  Inventory as InventoryIcon,
  History as HistoryIcon,
  Announcement as AnnouncementIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { 
  getUserNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  getUnreadNotificationsCount,
  getRealtimeUserNotifications, 
  markRealtimeNotificationAsRead, 
  markAllRealtimeNotificationsAsRead,
  subscribeToUserNotifications,
  subscribeToUnreadCount,
  getUnreadRealtimeNotificationsCount
} from '../../services/notificationService';

// Styled badge for notifications
const StyledBadge = styled(Badge)(({ theme }) => ({
  '& .MuiBadge-badge': {
    backgroundColor: '#f50057',
    color: '#fff',
  },
}));

const NotificationsMenu = () => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const { currentUser } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const open = Boolean(anchorEl);
  
  // Stan dla powiadomień wyskakujących (toast)
  const [toastOpen, setToastOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastSeverity, setToastSeverity] = useState('info');
  const [toastTitle, setToastTitle] = useState('');
  
  // Referencje do funkcji wyrejestrowania subskrypcji
  const unsubscribeRefs = useRef({
    notifications: null,
    unreadCount: null
  });
  
  // Ref do śledzenia czy subskrypcja została właśnie zainicjalizowana
  const isInitialLoad = useRef(true);

  // Efekt dla nasłuchiwania w Realtime Database
  useEffect(() => {
    if (currentUser) {
      // console.log("NotificationsMenu: Inicjalizacja dla użytkownika", currentUser.uid);
      
      // Oznacz że to początkowe ładowanie
      isInitialLoad.current = true;
      
      // Pobierz początkowe dane
      fetchUnreadCount();
      
      // Nasłuchuj na zmiany liczby nieprzeczytanych powiadomień
      const unsubscribeCount = subscribeToUnreadCount(currentUser.uid, (count) => {
        // console.log("NotificationsMenu: Otrzymano nową liczbę nieprzeczytanych powiadomień:", count);
        setUnreadCount(count);
      });
      
      // Nasłuchuj na nowe powiadomienia
      const unsubscribeNotifications = subscribeToUserNotifications(currentUser.uid, (newNotification) => {
        // console.log("NotificationsMenu: Otrzymano nowe powiadomienie:", newNotification);
        
        // Dodaj nowe powiadomienie do stanu
        setNotifications(prevNotifications => [newNotification, ...prevNotifications]);
        
        // Pokaż toast z nowym powiadomieniem TYLKO jeśli to nie jest początkowe ładowanie
        // onChildAdded wywołuje się dla wszystkich istniejących powiadomień przy montowaniu
        if (!isInitialLoad.current) {
          showToastNotification(newNotification);
        }
      });
      
      // Po krótkim czasie oznacz że początkowe ładowanie się zakończyło
      // To pozwoli na pokazywanie toastów dla prawdziwie nowych powiadomień
      const timer = setTimeout(() => {
        isInitialLoad.current = false;
      }, 2000); // 2 sekundy na załadowanie istniejących powiadomień
      
      // Zapisz funkcje wyrejestrowania
      unsubscribeRefs.current = {
        notifications: unsubscribeNotifications,
        unreadCount: unsubscribeCount
      };
      
      // console.log("NotificationsMenu: Subskrypcje zostały ustanowione");
      
      // Czyszczenie przy odmontowaniu
      return () => {
        // console.log("NotificationsMenu: Czyszczenie subskrypcji");
        clearTimeout(timer);
        if (unsubscribeRefs.current.notifications) {
          unsubscribeRefs.current.notifications();
        }
        if (unsubscribeRefs.current.unreadCount) {
          unsubscribeRefs.current.unreadCount();
        }
      };
    }
  }, [currentUser]);

  // Funkcja do wyświetlania powiadomienia toast
  const showToastNotification = (notification) => {
    if (!notification) return;
    
    // Ustaw treść i typ powiadomienia toast
    setToastTitle(notification.title || '');
    
    // Dodajemy informację o użytkowniku, który utworzył powiadomienie
    let message = notification.message || '';
    if (notification.createdByName && notification.createdByName !== 'System') {
      message = `${message} - ${notification.createdByName}`;
    }
    setToastMessage(message);
    
    // Ustaw odpowiedni typ alertu
    switch (notification.type) {
      case 'success':
        setToastSeverity('success');
        break;
      case 'error':
        setToastSeverity('error');
        break;
      case 'warning':
        setToastSeverity('warning');
        break;
      case 'info':
      default:
        setToastSeverity('info');
        break;
    }
    
    // Pokaż toast
    setToastOpen(true);
  };

  // Obsługa zamknięcia toasta
  const handleCloseToast = (event, reason) => {
    if (reason === 'clickaway') {
      return;
    }
    setToastOpen(false);
  };

  // Aktualizacja listy powiadomień, gdy menu jest otwarte
  useEffect(() => {
    if (open && currentUser) {
      // console.log("NotificationsMenu: Menu zostało otwarte, pobieranie powiadomień");
      fetchNotifications();
    }
  }, [open, currentUser]);

  const fetchUnreadCount = async () => {
    if (!currentUser) return;
    
    try {
      // Próbuj najpierw z Realtime Database
      // console.log("NotificationsMenu: Pobieranie liczby nieprzeczytanych z Realtime Database");
      const realtimeCount = await getUnreadRealtimeNotificationsCount(currentUser.uid);
      // console.log("NotificationsMenu: Liczba nieprzeczytanych z Realtime:", realtimeCount);
      
      // Ustawiamy licznik tylko na podstawie Realtime Database, nie mieszamy z Firestore
      setUnreadCount(realtimeCount);
    } catch (error) {
      console.error('NotificationsMenu: Błąd podczas pobierania liczby nieprzeczytanych powiadomień:', error);
      // W przypadku błędu, ustaw na 0
      setUnreadCount(0);
    }
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      // Używamy tylko Realtime Database dla spójności
      // console.log("NotificationsMenu: Pobieranie powiadomień z Realtime Database");
      try {
        const notificationsData = await getRealtimeUserNotifications(currentUser.uid, false, 10);
        // console.log("NotificationsMenu: Powiadomienia z Realtime:", notificationsData);
        setNotifications(notificationsData);
      } catch (offlineError) {
        console.warn("NotificationsMenu: Błąd sieci podczas pobierania powiadomień:", offlineError.message);
        // W trybie offline zachowujemy istniejące powiadomienia
        // console.log("NotificationsMenu: Działanie w trybie offline - używanie istniejących powiadomień");
      }
    } catch (error) {
      console.error('NotificationsMenu: Błąd podczas pobierania powiadomień:', error);
      // Nie czyścimy powiadomień w przypadku błędu, aby zachować dane
    } finally {
      setLoading(false);
    }
  };

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleNotificationClick = async (notification) => {
    // Jeśli powiadomienie nie jest jeszcze przeczytane, oznacz jako przeczytane
    if (!notification.read) {
      try {
        await markRealtimeNotificationAsRead(notification.id, currentUser.uid);
        // console.log("Oznaczono jako przeczytane w Realtime Database");
        
        // Aktualizuj lokalną listę powiadomień
        setNotifications(prevNotifications => 
          prevNotifications.map(n => 
            n.id === notification.id ? { ...n, read: true } : n
          )
        );
        
        // Aktualizuj licznik tylko jeśli nie używamy nasłuchiwania Realtime
        if (!unsubscribeRefs.current.unreadCount) {
          setUnreadCount(prevCount => Math.max(0, prevCount - 1));
        }
      } catch (error) {
        console.error('Błąd podczas oznaczania powiadomienia jako przeczytane:', error);
      }
    }
    
    // Nawiguj do odpowiedniej strony w zależności od typu encji
    if (notification.entityType && notification.entityId) {
      switch (notification.entityType) {
        case 'purchaseOrder':
          navigate(`/purchase-orders/${notification.entityId}`);
          break;
        case 'order':
          navigate(`/orders/${notification.entityId}`);
          break;
        case 'productionTask':
          navigate(`/production/tasks/${notification.entityId}`);
          break;
        case 'invoice':
          navigate(`/invoices/${notification.entityId}`);
          break;
        case 'waybill':
          navigate(`/inventory/cmr/${notification.entityId}`);
          break;
        case 'cmr':
          navigate(`/inventory/cmr/${notification.entityId}`);
          break;
        case 'inventory':
          navigate(`/inventory/${notification.entityId}`);
          break;
        case 'announcement':
          navigate('/');
          break;
        default:
          // W przypadku nieznanych typów nie robimy nic
          break;
      }
    }
    
    handleClose();
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllRealtimeNotificationsAsRead(currentUser.uid);
      console.log("Oznaczono wszystkie jako przeczytane w Realtime Database");
      
      // Wymuś odświeżenie licznika nieprzeczytanych powiadomień
      await handleRefreshUnreadCount();
      
      // Aktualizuj lokalną listę powiadomień
      setNotifications(prevNotifications => 
        prevNotifications.map(n => ({ ...n, read: true }))
      );
      
      handleClose();
    } catch (error) {
      console.error('Błąd podczas oznaczania wszystkich powiadomień jako przeczytane:', error);
    }
  };

  // Funkcja pomocnicza do pobierania ikony na podstawie typu powiadomienia
  const getNotificationIcon = (notification) => {
    if (notification.entityType) {
      switch (notification.entityType) {
        case 'purchaseOrder':
          return <PurchaseOrderIcon color="primary" />;
        case 'order':
          return <OrderIcon color="primary" />;
        case 'productionTask':
          return <ProductionTaskIcon color="primary" />;
        case 'invoice':
          return <InvoiceIcon color="primary" />;
        case 'waybill':
          return <WaybillIcon color="primary" />;
        case 'cmr':
          return <CmrIcon color="primary" />;
        case 'inventory':
          return <InventoryIcon color="primary" />;
        case 'announcement':
          return <AnnouncementIcon color="primary" />;
        default:
          break;
      }
    }
    
    // Jeśli nie ma typu encji lub nieznany typ, użyj ikony na podstawie typu powiadomienia
    switch (notification.type) {
      case 'success':
        return <SuccessIcon color="success" />;
      case 'error':
        return <ErrorIcon color="error" />;
      case 'warning':
        return <WarningIcon color="warning" />;
      case 'info':
      default:
        return <InfoIcon color="info" />;
    }
  };

  // Funkcja pomocnicza do formatowania czasu
  const formatTime = (dateString) => {
    try {
      return formatDistanceToNow(new Date(dateString), { 
        addSuffix: true,
        locale: pl 
      });
    } catch (error) {
      return 'nieznany czas';
    }
  };

  // Renderowanie elementów powiadomień
  const renderNotificationItem = (notification) => {
    const timeAgo = formatTime(notification.createdAt);
    const icon = getNotificationIcon(notification);
    
    // Dodajemy informację o użytkowniku, który utworzył powiadomienie
    let message = notification.message || '';
    let userInfo = null;
    
    if (notification.createdByName && notification.createdByName !== 'System') {
      userInfo = (
        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}>
          Użytkownik: {notification.createdByName}
        </Typography>
      );
    }
    
    return (
      <ListItem
        key={notification.id}
        component="li"
        alignItems="flex-start"
        onClick={() => handleNotificationClick(notification)}
        sx={{ 
          backgroundColor: notification.read ? 'inherit' : 'rgba(144, 202, 249, 0.08)',
          '&:hover': {
            backgroundColor: 'rgba(144, 202, 249, 0.16)',
          },
          borderBottom: '1px solid rgba(0, 0, 0, 0.12)',
          cursor: 'pointer'
        }}
      >
        <ListItemIcon sx={{ minWidth: 40 }}>
          {icon}
        </ListItemIcon>
        <ListItemText
          primary={
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="subtitle2" component="span">
                {notification.title}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {timeAgo}
              </Typography>
            </Box>
          }
          secondary={
            <Typography
              component="div"
              variant="body2"
              color="textPrimary"
            >
              {message}
              {userInfo}
            </Typography>
          }
        />
      </ListItem>
    );
  };

  // Dodaję funkcję odświeżającą liczbę powiadomień
  const handleRefreshUnreadCount = async () => {
    if (!currentUser) return;
    
    console.log("NotificationsMenu: Ręczne odświeżanie liczby nieprzeczytanych powiadomień");
    
    try {
      const realtimeCount = await getUnreadRealtimeNotificationsCount(currentUser.uid);
      console.log("NotificationsMenu: Odświeżona liczba nieprzeczytanych powiadomień:", realtimeCount);
      setUnreadCount(realtimeCount);
    } catch (error) {
      console.error("NotificationsMenu: Błąd podczas odświeżania liczby nieprzeczytanych powiadomień:", error);
      // W przypadku błędu nie zmieniamy stanu licznika
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <Tooltip title={t('common.navbar.notificationsTooltip')}>
        <IconButton 
          color="inherit" 
          onClick={handleClick}
          aria-label={t('common.navbar.notificationsTooltip')}
        >
          <StyledBadge badgeContent={unreadCount} max={99}>
            <NotificationsIcon />
          </StyledBadge>
        </IconButton>
      </Tooltip>
      
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
        PaperProps={{
          elevation: 3,
          sx: {
            mt: 1.5,
            width: 320,
            maxHeight: 400,
            overflowY: 'auto'
          }
        }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
            {t('common.navbar.notifications')}
          </Typography>
        </Box>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : notifications.length > 0 ? (
          <Box sx={{ width: '100%' }}>
            <List sx={{ p: 0 }}>
              {notifications.map((notification) => renderNotificationItem(notification))}
            </List>
            
            <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
              <Button 
                fullWidth 
                onClick={handleMarkAllAsRead}
                disabled={unreadCount === 0}
              >
                Oznacz wszystkie jako przeczytane
              </Button>
              <Button 
                fullWidth 
                onClick={() => {
                  handleClose();
                  navigate('/notifications/history');
                }}
                sx={{ mt: 1 }}
                startIcon={<HistoryIcon />}
              >
                Zobacz historię powiadomień
              </Button>
            </Box>
          </Box>
        ) : (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Brak powiadomień
            </Typography>
            <Button 
              fullWidth 
              onClick={() => {
                handleClose();
                navigate('/notifications/history');
              }}
              startIcon={<HistoryIcon />}
              sx={{ mt: 2 }}
            >
              Zobacz historię powiadomień
            </Button>
          </Box>
        )}
      </Menu>
      
      <Snackbar
        open={toastOpen}
        autoHideDuration={2000}
        onClose={handleCloseToast}
        anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        sx={{ 
          zIndex: 9999 // Wysokie z-index aby nie był przykryty przez inne elementy
        }}
      >
        <Alert 
          onClose={handleCloseToast} 
          severity={toastSeverity} 
          sx={{ width: '100%', maxWidth: 400 }}
          elevation={6}
          variant="filled"
        >
          <Typography variant="subtitle1" component="div" fontWeight="bold">
            {toastTitle}
          </Typography>
          <Typography variant="body2" component="div">
            {toastMessage}
          </Typography>
        </Alert>
      </Snackbar>
    </div>
  );
};

export default NotificationsMenu; 