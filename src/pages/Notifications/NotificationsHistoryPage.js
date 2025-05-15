import React, { useState, useEffect } from 'react';
import { 
  Container, 
  Typography, 
  Paper, 
  List, 
  ListItem, 
  ListItemText, 
  IconButton, 
  Divider, 
  Box, 
  CircularProgress, 
  Pagination,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Grid,
  TextField,
  InputAdornment,
  Button,
  Badge
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
  Search as SearchIcon,
  Delete as DeleteIcon,
  Check as CheckIcon,
  FilterList as FilterListIcon
} from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { pl } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { 
  getRealtimeUserNotifications, 
  markRealtimeNotificationAsRead, 
  markAllRealtimeNotificationsAsRead,
  deleteNotification
} from '../../services/notificationService';

const NotificationsHistoryPage = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [filterType, setFilterType] = useState('all');
  const [filterRead, setFilterRead] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [totalNotifications, setTotalNotifications] = useState(0);
  
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();
  
  // Pobieranie danych przy pierwszym renderowaniu oraz zmianie filtrów/paginacji
  useEffect(() => {
    fetchNotifications();
  }, [page, pageSize, filterType, filterRead, currentUser]);
  
  // Funkcja pobierająca powiadomienia
  const fetchNotifications = async () => {
    if (!currentUser) return;
    
    setLoading(true);
    try {
      // Pobierz wszystkie powiadomienia
      const allNotifications = await getRealtimeUserNotifications(currentUser.uid, false, 100);
      
      // Aplikuj filtry
      let filteredNotifications = allNotifications;
      
      // Filtrowanie po typie
      if (filterType !== 'all') {
        filteredNotifications = filteredNotifications.filter(
          notification => notification.type === filterType
        );
      }
      
      // Filtrowanie po statusie przeczytania
      if (filterRead !== 'all') {
        const isRead = filterRead === 'read';
        filteredNotifications = filteredNotifications.filter(
          notification => notification.read === isRead
        );
      }
      
      // Filtrowanie po tekście
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        filteredNotifications = filteredNotifications.filter(
          notification => 
            (notification.title && notification.title.toLowerCase().includes(query)) ||
            (notification.message && notification.message.toLowerCase().includes(query))
        );
      }
      
      // Zapisz całkowitą liczbę powiadomień po filtrowaniu
      setTotalNotifications(filteredNotifications.length);
      
      // Oblicz liczbę stron
      const calculatedTotalPages = Math.ceil(filteredNotifications.length / pageSize);
      setTotalPages(calculatedTotalPages);
      
      // Korekcja numeru strony, jeśli po filtrowaniu jest poza zakresem
      const correctedPage = page > calculatedTotalPages ? 1 : page;
      if (page !== correctedPage) {
        setPage(correctedPage);
      }
      
      // Paginacja - wybierz tylko powiadomienia dla bieżącej strony
      const startIndex = (correctedPage - 1) * pageSize;
      const endIndex = startIndex + pageSize;
      const paginatedNotifications = filteredNotifications.slice(startIndex, endIndex);
      
      setNotifications(paginatedNotifications);
    } catch (error) {
      console.error('Błąd podczas pobierania powiadomień:', error);
      showError('Nie udało się pobrać historii powiadomień');
    } finally {
      setLoading(false);
    }
  };
  
  // Obsługa zmiany strony
  const handlePageChange = (event, newPage) => {
    setPage(newPage);
  };
  
  // Obsługa zmiany liczby elementów na stronie
  const handlePageSizeChange = (event) => {
    setPageSize(Number(event.target.value));
    setPage(1); // Powrót do pierwszej strony przy zmianie liczby elementów
  };
  
  // Obsługa filtrowania po typie
  const handleFilterTypeChange = (event) => {
    setFilterType(event.target.value);
    setPage(1);
  };
  
  // Obsługa filtrowania po statusie przeczytania
  const handleFilterReadChange = (event) => {
    setFilterRead(event.target.value);
    setPage(1);
  };
  
  // Obsługa wyszukiwania
  const handleSearchChange = (event) => {
    setSearchQuery(event.target.value);
  };
  
  const handleSearch = () => {
    setPage(1);
    fetchNotifications();
  };
  
  const handleKeyPress = (event) => {
    if (event.key === 'Enter') {
      handleSearch();
    }
  };
  
  // Obsługa kliknięcia w powiadomienie
  const handleNotificationClick = async (notification) => {
    // Oznacz jako przeczytane, jeśli jeszcze nie jest
    if (!notification.read) {
      try {
        await markRealtimeNotificationAsRead(notification.id, currentUser.uid);
        
        // Aktualizuj lokalny stan
        setNotifications(prevNotifications => 
          prevNotifications.map(n => 
            n.id === notification.id ? { ...n, read: true } : n
          )
        );
        
        showSuccess('Oznaczono powiadomienie jako przeczytane');
      } catch (error) {
        console.error('Błąd podczas oznaczania jako przeczytane:', error);
        showError('Nie udało się oznaczyć powiadomienia jako przeczytane');
      }
    }
    
    // Przekieruj do odpowiedniej strony
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
          navigate(`/inventory/cmr/${notification.entityId}`);
          break;
        case 'inventory':
          navigate(`/inventory/${notification.entityId}`);
          break;
        default:
          // Dla nieznanych typów nie przekierowujemy
          break;
      }
    }
  };
  
  // Oznaczanie wszystkich jako przeczytane
  const handleMarkAllAsRead = async () => {
    try {
      await markAllRealtimeNotificationsAsRead(currentUser.uid);
      
      // Aktualizuj lokalny stan
      setNotifications(prevNotifications => 
        prevNotifications.map(n => ({ ...n, read: true }))
      );
      
      showSuccess('Wszystkie powiadomienia zostały oznaczone jako przeczytane');
      fetchNotifications(); // Odśwież listę
    } catch (error) {
      console.error('Błąd podczas oznaczania wszystkich jako przeczytane:', error);
      showError('Nie udało się oznaczyć wszystkich powiadomień jako przeczytane');
    }
  };
  
  // Usuwanie powiadomienia
  const handleDeleteNotification = async (event, notificationId) => {
    event.stopPropagation(); // Zapobiega propagacji do rodzica
    
    try {
      await deleteNotification(notificationId);
      
      // Aktualizuj lokalny stan
      setNotifications(prevNotifications => 
        prevNotifications.filter(n => n.id !== notificationId)
      );
      
      showSuccess('Powiadomienie zostało usunięte');
      
      // Jeśli usunięto ostatnie powiadomienie na stronie, przejdź do poprzedniej strony
      if (notifications.length === 1 && page > 1) {
        setPage(page - 1);
      } else {
        fetchNotifications(); // Odśwież listę
      }
    } catch (error) {
      console.error('Błąd podczas usuwania powiadomienia:', error);
      showError('Nie udało się usunąć powiadomienia');
    }
  };
  
  // Pobranie ikony dla powiadomienia
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
        default:
          break;
      }
    }
    
    // Ikona na podstawie typu powiadomienia
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
  
  // Formatowanie czasu
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
    <Container maxWidth="lg" sx={{ mt: 4, mb: 4 }}>
      <Paper sx={{ p: 3, mb: 4 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" component="h1" gutterBottom>
            <Badge color="secondary" badgeContent={totalNotifications} max={999} showZero>
              <NotificationsIcon sx={{ mr: 1, verticalAlign: 'middle' }} />
            </Badge>
            Historia powiadomień
          </Typography>
          
          <Button
            variant="contained"
            color="primary"
            onClick={handleMarkAllAsRead}
            startIcon={<CheckIcon />}
            size="small"
            disabled={notifications.length === 0 || notifications.every(n => n.read)}
          >
            Oznacz wszystkie jako przeczytane
          </Button>
        </Box>
        
        {/* Filtry i wyszukiwanie */}
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} md={4}>
            <TextField
              fullWidth
              variant="outlined"
              label="Szukaj w powiadomieniach"
              value={searchQuery}
              onChange={handleSearchChange}
              onKeyPress={handleKeyPress}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                ),
                endAdornment: searchQuery && (
                  <InputAdornment position="end">
                    <IconButton
                      aria-label="clear search"
                      onClick={() => {
                        setSearchQuery('');
                        if (searchQuery) {
                          setTimeout(() => fetchNotifications(), 0);
                        }
                      }}
                      edge="end"
                      size="small"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
              size="small"
            />
          </Grid>
          
          <Grid item xs={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="filter-type-label">Typ powiadomienia</InputLabel>
              <Select
                labelId="filter-type-label"
                value={filterType}
                onChange={handleFilterTypeChange}
                label="Typ powiadomienia"
                startAdornment={<FilterListIcon fontSize="small" sx={{ mr: 1 }} />}
              >
                <MenuItem value="all">Wszystkie typy</MenuItem>
                <MenuItem value="info">Informacja</MenuItem>
                <MenuItem value="success">Sukces</MenuItem>
                <MenuItem value="warning">Ostrzeżenie</MenuItem>
                <MenuItem value="error">Błąd</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="filter-read-label">Status</InputLabel>
              <Select
                labelId="filter-read-label"
                value={filterRead}
                onChange={handleFilterReadChange}
                label="Status"
                startAdornment={<FilterListIcon fontSize="small" sx={{ mr: 1 }} />}
              >
                <MenuItem value="all">Wszystkie statusy</MenuItem>
                <MenuItem value="unread">Nieprzeczytane</MenuItem>
                <MenuItem value="read">Przeczytane</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          
          <Grid item xs={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel id="page-size-label">Na stronie</InputLabel>
              <Select
                labelId="page-size-label"
                value={pageSize}
                onChange={handlePageSizeChange}
                label="Na stronie"
              >
                <MenuItem value={5}>5</MenuItem>
                <MenuItem value={10}>10</MenuItem>
                <MenuItem value={25}>25</MenuItem>
                <MenuItem value={50}>50</MenuItem>
              </Select>
            </FormControl>
          </Grid>
        </Grid>
        
        {/* Lista powiadomień */}
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
            <CircularProgress />
          </Box>
        ) : notifications.length > 0 ? (
          <>
            <Paper variant="outlined" sx={{ mb: 3 }}>
              <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
                {notifications.map((notification, index) => (
                  <React.Fragment key={notification.id}>
                    <ListItem
                      alignItems="flex-start"
                      button
                      onClick={() => handleNotificationClick(notification)}
                      sx={{ 
                        backgroundColor: notification.read ? 'inherit' : 'rgba(25, 118, 210, 0.08)',
                        '&:hover': {
                          backgroundColor: 'rgba(25, 118, 210, 0.16)'
                        },
                        p: 2
                      }}
                      secondaryAction={
                        <IconButton 
                          edge="end" 
                          aria-label="delete" 
                          onClick={(e) => handleDeleteNotification(e, notification.id)}
                        >
                          <DeleteIcon />
                        </IconButton>
                      }
                    >
                      <Box sx={{ mr: 2, mt: 0.5 }}>
                        {getNotificationIcon(notification)}
                      </Box>
                      <ListItemText
                        primary={
                          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Typography variant="subtitle1" component="span">
                              {notification.title}
                              {!notification.read && (
                                <Chip 
                                  label="Nowe" 
                                  size="small" 
                                  color="primary" 
                                  sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                                />
                              )}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatTime(notification.createdAt)}
                            </Typography>
                          </Box>
                        }
                        secondary={
                          <>
                            <Typography
                              component="span"
                              variant="body2"
                              color="text.primary"
                              sx={{ display: 'block', mt: 0.5 }}
                            >
                              {notification.message}
                            </Typography>
                            
                            {notification.createdByName && notification.createdByName !== 'System' && (
                              <Typography 
                                variant="caption" 
                                color="text.secondary" 
                                sx={{ display: 'block', mt: 0.5, fontStyle: 'italic' }}
                              >
                                Od: {notification.createdByName}
                              </Typography>
                            )}
                            
                            {notification.entityType && (
                              <Chip
                                label={notification.entityType}
                                size="small"
                                variant="outlined"
                                sx={{ mt: 1, mr: 1, height: 20, fontSize: '0.7rem' }}
                              />
                            )}
                            
                            <Chip
                              label={notification.type}
                              size="small"
                              color={
                                notification.type === 'success' ? 'success' :
                                notification.type === 'error' ? 'error' :
                                notification.type === 'warning' ? 'warning' : 'info'
                              }
                              sx={{ mt: 1, height: 20, fontSize: '0.7rem' }}
                            />
                          </>
                        }
                      />
                    </ListItem>
                    {index < notifications.length - 1 && <Divider component="li" />}
                  </React.Fragment>
                ))}
              </List>
            </Paper>
            
            {/* Paginacja */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
              <Pagination 
                count={totalPages} 
                page={page} 
                onChange={handlePageChange} 
                color="primary" 
                showFirstButton 
                showLastButton
              />
            </Box>
          </>
        ) : (
          <Paper 
            variant="outlined" 
            sx={{ 
              p: 4, 
              display: 'flex', 
              flexDirection: 'column', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}
          >
            <NotificationsIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" color="text.secondary" align="center">
              Brak powiadomień
            </Typography>
            <Typography variant="body2" color="text.secondary" align="center">
              {searchQuery || filterType !== 'all' || filterRead !== 'all' 
                ? 'Nie znaleziono powiadomień spełniających kryteria filtrowania' 
                : 'Nie masz jeszcze żadnych powiadomień'}
            </Typography>
            
            {(searchQuery || filterType !== 'all' || filterRead !== 'all') && (
              <Button 
                variant="outlined" 
                sx={{ mt: 2 }}
                onClick={() => {
                  setSearchQuery('');
                  setFilterType('all');
                  setFilterRead('all');
                  setPage(1);
                }}
              >
                Wyczyść filtry
              </Button>
            )}
          </Paper>
        )}
      </Paper>
    </Container>
  );
};

export default NotificationsHistoryPage; 