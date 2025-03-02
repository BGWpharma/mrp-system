import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Paper,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  TablePagination,
  IconButton,
  TextField,
  InputAdornment,
  Chip,
  Tooltip,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  CircularProgress,
  Collapse,
  Card,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material';
import {
  Add as AddIcon,
  Search as SearchIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  FilterList as FilterListIcon,
  Clear as ClearIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  KeyboardArrowUp as KeyboardArrowUpIcon,
  LocalShipping as LocalShippingIcon,
  EventNote as EventNoteIcon,
  Payment as PaymentIcon,
  MoreVert as MoreVertIcon,
  CheckCircle as CheckCircleIcon,
  Cancel as CancelIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { 
  getAllOrders, 
  deleteOrder, 
  updateOrderStatus, 
  ORDER_STATUSES 
} from '../../services/orderService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatDate, formatTimestamp } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatUtils';

const OrdersList = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    fromDate: '',
    toDate: '',
    customerId: ''
  });
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [orderToDelete, setOrderToDelete] = useState(null);
  const [statusChangeInfo, setStatusChangeInfo] = useState(null);

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const navigate = useNavigate();

  useEffect(() => {
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const data = await getAllOrders();
      setOrders(data);
    } catch (error) {
      showError('Błąd podczas pobierania zamówień: ' + error.message);
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = async () => {
    try {
      setLoading(true);
      const data = await getAllOrders(filters);
      setOrders(data);
      setPage(0);
    } catch (error) {
      showError('Błąd podczas filtrowania zamówień: ' + error.message);
      console.error('Error filtering orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetFilters = () => {
    setFilters({
      status: 'all',
      fromDate: '',
      toDate: '',
      customerId: ''
    });
    fetchOrders();
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleAddOrder = () => {
    navigate('/orders/new');
  };

  const handleEditOrder = (orderId) => {
    navigate(`/orders/edit/${orderId}`);
  };

  const handleViewOrderDetails = (orderId) => {
    navigate(`/orders/${orderId}`);
  };

  const handleDeleteOrderClick = (order) => {
    setOrderToDelete(order);
  };

  const handleConfirmDelete = async () => {
    if (!orderToDelete) return;
    
    try {
      await deleteOrder(orderToDelete.id);
      setOrders(prev => prev.filter(order => order.id !== orderToDelete.id));
      showSuccess('Zamówienie zostało usunięte');
    } catch (error) {
      showError('Błąd podczas usuwania zamówienia: ' + error.message);
      console.error('Error deleting order:', error);
    } finally {
      setOrderToDelete(null);
    }
  };

  const handleCancelDelete = () => {
    setOrderToDelete(null);
  };

  const handleStatusChangeClick = (order, newStatus) => {
    setStatusChangeInfo({
      orderId: order.id,
      orderNumber: order.id.substring(0, 8).toUpperCase(),
      currentStatus: order.status,
      newStatus: newStatus
    });
  };

  const handleConfirmStatusChange = async () => {
    if (!statusChangeInfo) return;
    
    try {
      await updateOrderStatus(statusChangeInfo.orderId, statusChangeInfo.newStatus, currentUser.uid);
      
      // Aktualizacja lokalnego stanu
      setOrders(prev => prev.map(order => {
        if (order.id === statusChangeInfo.orderId) {
          return { ...order, status: statusChangeInfo.newStatus };
        }
        return order;
      }));
      
      showSuccess(`Status zamówienia zmieniony na "${statusChangeInfo.newStatus}"`);
    } catch (error) {
      showError('Błąd podczas zmiany statusu: ' + error.message);
      console.error('Error updating order status:', error);
    } finally {
      setStatusChangeInfo(null);
    }
  };

  const handleCancelStatusChange = () => {
    setStatusChangeInfo(null);
  };

  const toggleExpand = (orderId) => {
    setExpandedOrderId(expandedOrderId === orderId ? null : orderId);
  };

  // Filtrowanie wyszukiwania
  const filteredOrders = orders.filter(order => {
    if (!searchTerm) return true;
    
    const searchLower = searchTerm.toLowerCase();
    return (
      (order.id && order.id.toLowerCase().includes(searchLower)) ||
      (order.customer?.name && order.customer.name.toLowerCase().includes(searchLower)) ||
      (order.items && order.items.some(item => item.name && item.name.toLowerCase().includes(searchLower)))
    );
  });

  // Paginacja
  const displayedOrders = filteredOrders
    .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

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

  return (
    <Box sx={{ pb: 4 }}>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h4">Zamówienia</Typography>
        <Button 
          variant="contained" 
          startIcon={<AddIcon />} 
          onClick={handleAddOrder}
        >
          Nowe zamówienie
        </Button>
      </Box>

      <Paper sx={{ p: 2, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <TextField
            placeholder="Szukaj zamówień..."
            variant="outlined"
            size="small"
            value={searchTerm}
            onChange={handleSearchChange}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon />
                </InputAdornment>
              ),
              endAdornment: searchTerm && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setSearchTerm('')}>
                    <ClearIcon />
                  </IconButton>
                </InputAdornment>
              )
            }}
            sx={{ width: 300 }}
          />

          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button 
              variant={showFilters ? "contained" : "outlined"} 
              startIcon={<FilterListIcon />}
              onClick={() => setShowFilters(!showFilters)}
              color={showFilters ? "primary" : "inherit"}
            >
              Filtry
            </Button>
            <Button 
              variant="outlined" 
              startIcon={<RefreshIcon />}
              onClick={fetchOrders}
            >
              Odśwież
            </Button>
          </Box>
        </Box>

        <Collapse in={showFilters}>
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={6} md={3}>
                  <FormControl fullWidth size="small">
                    <InputLabel>Status</InputLabel>
                    <Select
                      name="status"
                      value={filters.status}
                      onChange={handleFilterChange}
                      label="Status"
                    >
                      <MenuItem value="all">Wszystkie</MenuItem>
                      {ORDER_STATUSES.map(status => (
                        <MenuItem key={status.value} value={status.value}>
                          {status.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Od daty"
                    type="date"
                    name="fromDate"
                    value={filters.fromDate}
                    onChange={handleFilterChange}
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <TextField
                    label="Do daty"
                    type="date"
                    name="toDate"
                    value={filters.toDate}
                    onChange={handleFilterChange}
                    size="small"
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                      variant="contained" 
                      onClick={applyFilters}
                      fullWidth
                    >
                      Zastosuj filtry
                    </Button>
                    <Button 
                      variant="outlined" 
                      onClick={resetFilters}
                      color="inherit"
                    >
                      Resetuj
                    </Button>
                  </Box>
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Collapse>

        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4, mb: 4 }}>
            <CircularProgress />
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table sx={{ minWidth: 800 }}>
                <TableHead>
                  <TableRow>
                    <TableCell width="5%"></TableCell>
                    <TableCell>ID</TableCell>
                    <TableCell>Klient</TableCell>
                    <TableCell>Data zamówienia</TableCell>
                    <TableCell>Wartość</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Akcje</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {displayedOrders.length > 0 ? (
                    displayedOrders.map((order) => (
                      <React.Fragment key={order.id}>
                        <TableRow hover>
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={() => toggleExpand(order.id)}
                            >
                              {expandedOrderId === order.id ? (
                                <KeyboardArrowUpIcon />
                              ) : (
                                <KeyboardArrowDownIcon />
                              )}
                            </IconButton>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              #{order.id.substring(0, 8).toUpperCase()}
                            </Typography>
                          </TableCell>
                          <TableCell>{order.customer?.name}</TableCell>
                          <TableCell>
                            {order.orderDate ? formatTimestamp(order.orderDate) : '-'}
                          </TableCell>
                          <TableCell>{formatCurrency(order.totalValue || 0)}</TableCell>
                          <TableCell>
                            <Chip 
                              label={order.status} 
                              color={getStatusChipColor(order.status)}
                              size="small"
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="Edytuj">
                              <IconButton
                                size="small"
                                onClick={() => handleEditOrder(order.id)}
                              >
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Szczegóły">
                              <IconButton
                                size="small"
                                onClick={() => handleViewOrderDetails(order.id)}
                                color="primary"
                              >
                                <EventNoteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Usuń">
                              <IconButton
                                size="small"
                                onClick={() => handleDeleteOrderClick(order)}
                                color="error"
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>

                        {/* Expanded details */}
                        <TableRow>
                          <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
                            <Collapse in={expandedOrderId === order.id} timeout="auto" unmountOnExit>
                              <Box sx={{ py: 2, px: 2 }}>
                                <Typography variant="h6" gutterBottom component="div">
                                  Szczegóły zamówienia
                                </Typography>

                                <Grid container spacing={2}>
                                  <Grid item xs={12} md={6}>
                                    <Typography variant="subtitle2">Kontakt:</Typography>
                                    <Typography variant="body2">
                                      Email: {order.customer?.email || '-'}
                                    </Typography>
                                    <Typography variant="body2">
                                      Telefon: {order.customer?.phone || '-'}
                                    </Typography>
                                    <Typography variant="body2">
                                      Adres: {order.customer?.address || '-'}
                                    </Typography>
                                  </Grid>

                                  <Grid item xs={12} md={6}>
                                    <Typography variant="subtitle2">Informacje o płatności:</Typography>
                                    <Typography variant="body2">
                                      Metoda: {order.paymentMethod || '-'}
                                    </Typography>
                                    <Typography variant="body2">
                                      Status: {order.paymentStatus || '-'}
                                    </Typography>
                                    <Typography variant="body2">
                                      Dostawa: {order.shippingMethod || '-'} 
                                      ({formatCurrency(order.shippingCost || 0)})
                                    </Typography>
                                  </Grid>

                                  <Grid item xs={12}>
                                    <Typography variant="subtitle2" gutterBottom>
                                      Produkty:
                                    </Typography>
                                    <TableContainer component={Paper} variant="outlined">
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow>
                                            <TableCell>Produkt</TableCell>
                                            <TableCell align="right">Ilość</TableCell>
                                            <TableCell align="right">Cena</TableCell>
                                            <TableCell align="right">Wartość</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {order.items && order.items.map((item, index) => (
                                            <TableRow key={index}>
                                              <TableCell>{item.name}</TableCell>
                                              <TableCell align="right">
                                                {item.quantity} {item.unit}
                                              </TableCell>
                                              <TableCell align="right">
                                                {formatCurrency(item.price)}
                                              </TableCell>
                                              <TableCell align="right">
                                                {formatCurrency(item.price * item.quantity)}
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>
                                  </Grid>

                                  <Grid item xs={12}>
                                    <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                                      <Typography variant="subtitle2">Zmień status:</Typography>
                                      {ORDER_STATUSES.map(status => (
                                        order.status !== status.value && (
                                          <Button 
                                            key={status.value}
                                            variant="outlined"
                                            size="small"
                                            onClick={() => handleStatusChangeClick(order, status.value)}
                                            color={getStatusChipColor(status.value)}
                                          >
                                            {status.label}
                                          </Button>
                                        )
                                      ))}
                                    </Box>
                                  </Grid>
                                </Grid>
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </React.Fragment>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} align="center">
                        <Typography variant="body1">
                          Nie znaleziono zamówień
                        </Typography>
                        <Button 
                          variant="text" 
                          startIcon={<RefreshIcon />}
                          onClick={resetFilters}
                          sx={{ mt: 1 }}
                        >
                          Resetuj filtry
                        </Button>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>

            <TablePagination
              component="div"
              count={filteredOrders.length}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[5, 10, 25, 50]}
              labelRowsPerPage="Wierszy na stronie:"
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} z ${count}`}
            />
          </>
        )}
      </Paper>

      {/* Dialog potwierdzenia usunięcia */}
      <Dialog
        open={!!orderToDelete}
        onClose={handleCancelDelete}
      >
        <DialogTitle>Czy na pewno chcesz usunąć to zamówienie?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {orderToDelete && (
              <>
                Zamówienie #{orderToDelete.id.substring(0, 8).toUpperCase()} 
                złożone przez {orderToDelete.customer?.name || '(brak danych)'}
                {' '}o wartości {formatCurrency(orderToDelete.totalValue || 0)} 
                zostanie trwale usunięte.
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelDelete}>Anuluj</Button>
          <Button onClick={handleConfirmDelete} color="error" variant="contained">
            Usuń
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog zmiany statusu */}
      <Dialog
        open={!!statusChangeInfo}
        onClose={handleCancelStatusChange}
      >
        <DialogTitle>Zmiana statusu zamówienia</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {statusChangeInfo && (
              <>
                Zmienić status zamówienia #{statusChangeInfo.orderNumber}
                z "{statusChangeInfo.currentStatus}" na "{statusChangeInfo.newStatus}"?
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCancelStatusChange}>Anuluj</Button>
          <Button onClick={handleConfirmStatusChange} color="primary" variant="contained">
            Zmień status
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default OrdersList; 