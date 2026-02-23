import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Grid
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

const OrderItemsSelectorDialog = React.memo(({
  open,
  onClose,
  linkedOrders,
  orderItemsSearchQuery,
  onOrderItemsSearchQueryChange,
  availableOrderItems,
  onAddItemFromOrder,
  showMessage,
  mode
}) => {
  const filteredItems = availableOrderItems.filter(orderItem => {
    if (!orderItemsSearchQuery.trim()) return true;
    const searchTerm = orderItemsSearchQuery.toLowerCase();
    return (
      (orderItem.name || '').toLowerCase().includes(searchTerm) ||
      (orderItem.description || '').toLowerCase().includes(searchTerm) ||
      (orderItem.orderNumber || '').toLowerCase().includes(searchTerm) ||
      (orderItem.unit || '').toLowerCase().includes(searchTerm)
    );
  });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        Dodaj pozycje z powiązanych zamówień
        {linkedOrders.length > 0 && (
          <Typography variant="subtitle2" color="text.secondary">
            Powiązane CO: {linkedOrders.map(order => order.orderNumber).join(', ')}
          </Typography>
        )}
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Wybierz pozycje z zamówień klienta, które chcesz dodać do dokumentu CMR:
        </Typography>
        
        <TextField
          fullWidth
          placeholder="Wyszukaj pozycje..."
          value={orderItemsSearchQuery}
          onChange={(e) => onOrderItemsSearchQueryChange(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ color: 'text.secondary', mr: 1 }} />
          }}
          sx={{ mb: 2 }}
        />
        
        <Box sx={{ maxHeight: 400, overflow: 'auto' }}>
          {filteredItems.map((orderItem, index) => (
            <Box 
              key={index}
              sx={{ 
                p: 2, 
                border: (theme) => `1px solid ${theme.palette.divider}`, 
                borderRadius: 1, 
                mb: 1,
                bgcolor: mode === 'dark' ? 'background.default' : 'background.paper'
              }}
            >
              <Grid container spacing={2} alignItems="center">
                <Grid item xs={12} sm={5}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    {orderItem.name || 'Bez nazwy'}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Ilość: {orderItem.quantity} {orderItem.unit || 'szt.'}
                  </Typography>
                  <Typography variant="caption" color="primary" sx={{ fontWeight: 500 }}>
                    CO: {orderItem.orderNumber}
                  </Typography>
                </Grid>
                <Grid item xs={12} sm={5}>
                  {orderItem.description && (
                    <Typography variant="caption" color="text.secondary">
                      {orderItem.description}
                    </Typography>
                  )}
                </Grid>
                <Grid item xs={12} sm={2}>
                  <Button
                    variant="contained"
                    size="small"
                    onClick={() => {
                      onAddItemFromOrder(orderItem).catch(error => {
                        console.error('Błąd podczas dodawania pozycji z zamówienia:', error);
                        showMessage('Błąd podczas dodawania pozycji z zamówienia', 'error');
                      });
                    }}
                    sx={{ width: '100%' }}
                  >
                    Dodaj
                  </Button>
                </Grid>
              </Grid>
            </Box>
          ))}
          
          {filteredItems.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
              {orderItemsSearchQuery.trim() 
                ? `Brak pozycji pasujących do wyszukiwania "${orderItemsSearchQuery}"`
                : 'Brak dostępnych pozycji w zamówieniu'
              }
            </Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        {orderItemsSearchQuery.trim() && (
          <Button 
            onClick={() => onOrderItemsSearchQueryChange('')}
            color="inherit"
          >
            Wyczyść wyszukiwanie
          </Button>
        )}
        <Button onClick={() => {
          onOrderItemsSearchQueryChange('');
          onClose();
        }}>
          Zamknij
        </Button>
      </DialogActions>
    </Dialog>
  );
});

OrderItemsSelectorDialog.displayName = 'OrderItemsSelectorDialog';

export default OrderItemsSelectorDialog;
