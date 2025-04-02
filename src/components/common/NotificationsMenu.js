import React, { useState, useEffect } from 'react';
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
  Paper
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
  Description as CmrIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useAuth } from '../../hooks/useAuth';
import { 
  getUserNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  getUnreadNotificationsCount
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
  const navigate = useNavigate();
  const open = Boolean(anchorEl);

  // Pobierz nieprzeczytane powiadomienia przy montowaniu komponentu
  useEffect(() => {
    if (currentUser) {
      fetchUnreadCount();
      
      // Ustaw interwał do okresowego sprawdzania nowych powiadomień (co 2 minuty)
      const interval = setInterval(() => {
        fetchUnreadCount();
      }, 2 * 60 * 1000);
      
      // Wyczyść interwał przy odmontowaniu komponentu
      return () => clearInterval(interval);
    }
  }, [currentUser]);

  // Pobierz powiadomienia po otwarciu menu
  useEffect(() => {
    if (open && currentUser) {
      fetchNotifications();
    }
  }, [open, currentUser]);

  const fetchUnreadCount = async () => {
    if (!currentUser) return;
    
    try {
      const count = await getUnreadNotificationsCount(currentUser.uid);
      setUnreadCount(count);
    } catch (error) {
      console.error('Błąd podczas pobierania liczby nieprzeczytanych powiadomień:', error);
    }
  };

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const notificationsData = await getUserNotifications(currentUser.uid, false, 10);
      setNotifications(notificationsData);
    } catch (error) {
      console.error('Błąd podczas pobierania powiadomień:', error);
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
        await markNotificationAsRead(notification.id);
        
        // Aktualizuj lokalną listę powiadomień, aby oznaczyć to jako przeczytane
        setNotifications(prevNotifications => 
          prevNotifications.map(n => 
            n.id === notification.id ? { ...n, read: true } : n
          )
        );
        
        // Aktualizuj licznik nieprzeczytanych
        setUnreadCount(prevCount => Math.max(0, prevCount - 1));
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
          navigate(`/logistics/waybills/${notification.entityId}`);
          break;
        case 'cmr':
          navigate(`/logistics/cmr/${notification.entityId}`);
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
      await markAllNotificationsAsRead(currentUser.uid);
      
      // Aktualizuj lokalną listę powiadomień, aby oznaczyć wszystkie jako przeczytane
      setNotifications(prevNotifications => 
        prevNotifications.map(n => ({ ...n, read: true }))
      );
      
      // Zresetuj licznik nieprzeczytanych
      setUnreadCount(0);
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

  return (
    <div>
      <Tooltip title="Powiadomienia">
        <IconButton 
          color="inherit" 
          onClick={handleClick}
          aria-label="Powiadomienia"
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
            Powiadomienia
          </Typography>
        </Box>
        
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress size={24} />
          </Box>
        ) : notifications.length > 0 ? (
          <div>
            <List sx={{ p: 0 }}>
              {notifications.map((notification) => (
                <ListItem 
                  key={notification.id} 
                  onClick={() => handleNotificationClick(notification)}
                  sx={{ 
                    backgroundColor: notification.read ? 'transparent' : 'rgba(25, 118, 210, 0.08)',
                    '&:hover': {
                      backgroundColor: notification.read ? 'rgba(0, 0, 0, 0.04)' : 'rgba(25, 118, 210, 0.12)'
                    },
                    cursor: 'pointer'
                  }}
                >
                  <ListItemIcon sx={{ minWidth: '40px' }}>
                    {getNotificationIcon(notification)}
                  </ListItemIcon>
                  <ListItemText 
                    primary={
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontWeight: notification.read ? 'normal' : 'bold',
                          fontSize: '0.875rem'
                        }}
                      >
                        {notification.title}
                      </Typography>
                    }
                    secondary={
                      <Box>
                        <Typography 
                          variant="body2" 
                          color="text.secondary" 
                          sx={{ fontSize: '0.8rem' }}
                        >
                          {notification.message}
                        </Typography>
                        <Typography 
                          variant="caption" 
                          color="text.secondary" 
                          sx={{ display: 'block', mt: 0.5, fontSize: '0.7rem' }}
                        >
                          {formatTime(notification.createdAt)}
                        </Typography>
                      </Box>
                    }
                  />
                </ListItem>
              ))}
            </List>
            
            <Box sx={{ p: 1.5, borderTop: '1px solid', borderColor: 'divider' }}>
              <Button 
                fullWidth 
                onClick={handleMarkAllAsRead}
                disabled={unreadCount === 0}
              >
                Oznacz wszystkie jako przeczytane
              </Button>
            </Box>
          </div>
        ) : (
          <Box sx={{ p: 3, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Brak powiadomień
            </Typography>
          </Box>
        )}
      </Menu>
    </div>
  );
};

export default NotificationsMenu; 