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
  CircularProgress,
  Checkbox,
  FormControlLabel,
  FormGroup,
  Collapse
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';

const OrderSelectionDialog = React.memo(({
  open,
  onClose,
  orderSearchQuery,
  onOrderSearchQueryChange,
  onFindOrderByNumber,
  onRefreshOrders,
  isLoadingOrder,
  isImportOptionsExpanded,
  onToggleImportOptions,
  importOptions,
  onImportOptionChange,
  availableOrders,
  onOrderSelect,
  t
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogTitle>Wybierz zamówienie klienta (CO)</DialogTitle>
    <DialogContent>
      <Box sx={{ mb: 2 }}>
        <TextField
          label={t('form.searchByOrderNumber')}
          value={orderSearchQuery}
          onChange={(e) => onOrderSearchQueryChange(e.target.value)}
          fullWidth
          variant="outlined"
          sx={{ mb: 1 }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onFindOrderByNumber();
            }
          }}
        />
        
        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
          <Button
            variant="outlined"
            startIcon={<SearchIcon />}
            onClick={onFindOrderByNumber}
            disabled={isLoadingOrder}
          >
            Szukaj
          </Button>
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={onRefreshOrders}
            disabled={isLoadingOrder}
          >
            Odśwież
          </Button>
        </Box>
      </Box>
      
      <Box sx={{ mb: 2 }}>
        <Button
          variant="text"
          onClick={onToggleImportOptions}
          sx={{ 
            textTransform: 'none', 
            p: 1,
            justifyContent: 'flex-start',
            width: '100%'
          }}
          endIcon={isImportOptionsExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
        >
          <Typography variant="h6">
            Wybierz dane do importu:
          </Typography>
        </Button>
        
        <Collapse in={isImportOptionsExpanded}>
          <FormGroup sx={{ ml: 2 }}>
            <FormControlLabel 
              control={
                <Checkbox 
                  checked={importOptions.recipientData} 
                  onChange={onImportOptionChange} 
                  name="recipientData" 
                />
              } 
              label="Dane odbiorcy" 
            />
            <FormControlLabel 
              control={
                <Checkbox 
                  checked={importOptions.deliveryPlace} 
                  onChange={onImportOptionChange} 
                  name="deliveryPlace" 
                />
              } 
              label="Miejsce dostawy" 
            />
            <FormControlLabel 
              control={
                <Checkbox 
                  checked={importOptions.documents} 
                  onChange={onImportOptionChange} 
                  name="documents" 
                />
              } 
              label="Informacje o dokumentach"
            />
          </FormGroup>
        </Collapse>
      </Box>
      
      {isLoadingOrder ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', my: 4 }}>
          <CircularProgress />
        </Box>
      ) : availableOrders.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography variant="body1" color="text.secondary">
            Brak dostępnych zamówień klienta
          </Typography>
        </Box>
      ) : (
        <Box sx={{ maxHeight: 300, overflow: 'auto', mt: 2 }}>
          {availableOrders.map(order => {
            const customerName = order.customer?.name || order.customerName || 'Nieznany klient';
            
            let formattedDate = 'Brak daty';
            if (order.orderDate) {
              try {
                let dateObj;
                if (order.orderDate instanceof Date) {
                  dateObj = order.orderDate;
                } else if (order.orderDate.toDate && typeof order.orderDate.toDate === 'function') {
                  dateObj = order.orderDate.toDate();
                } else if (typeof order.orderDate === 'string' || typeof order.orderDate === 'number') {
                  dateObj = new Date(order.orderDate);
                }
                
                if (dateObj && !isNaN(dateObj.getTime())) {
                  formattedDate = dateObj.toLocaleDateString('pl-PL');
                }
              } catch (error) {
                console.warn('Błąd formatowania daty zamówienia:', error);
              }
            }
            
            return (
              <Box 
                key={order.id}
                sx={{ 
                  p: 2, 
                  border: (theme) => `1px solid ${theme.palette.divider}`, 
                  borderRadius: 1, 
                  mb: 1,
                  cursor: 'pointer',
                  bgcolor: 'background.paper',
                  '&:hover': { 
                    bgcolor: (theme) => theme.palette.mode === 'dark' 
                      ? 'rgba(255, 255, 255, 0.08)' 
                      : 'rgba(0, 0, 0, 0.04)',
                    borderColor: (theme) => theme.palette.mode === 'dark'
                      ? 'rgba(255, 255, 255, 0.2)'
                      : 'rgba(0, 0, 0, 0.2)'
                  },
                  transition: 'all 0.2s ease-in-out'
                }}
                onClick={() => onOrderSelect(order.id)}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  Zamówienie: {order.orderNumber || `#${order.id.substring(0, 8)}`}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Klient: {customerName}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Data: {formattedDate}
                </Typography>
                {order.status && (
                  <Typography variant="caption" color="primary">
                    Status: {order.status}
                  </Typography>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Anuluj</Button>
    </DialogActions>
  </Dialog>
));

OrderSelectionDialog.displayName = 'OrderSelectionDialog';

export default OrderSelectionDialog;
