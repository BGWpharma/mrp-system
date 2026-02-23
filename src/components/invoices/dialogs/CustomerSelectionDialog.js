import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Typography,
  CircularProgress,
  Autocomplete
} from '@mui/material';
import { mt2 } from '../../../styles/muiCommonStyles';

const CustomerSelectionDialog = React.memo(({
  open,
  onClose,
  customers,
  customersLoading,
  selectedCustomerId,
  onSelectedCustomerChange,
  onCustomerSelect,
  onNavigateToCustomers,
  t
}) => (
  <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
    <DialogTitle>{t('invoices.form.buttons.selectClient')}</DialogTitle>
    <DialogContent>
      <Autocomplete
        options={customers}
        getOptionLabel={(option) => option.name}
        loading={customersLoading}
        value={customers.find(c => c.id === selectedCustomerId) || null}
        onChange={(e, newValue) => {
          onSelectedCustomerChange(newValue ? newValue.id : '');
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={t('invoices.form.searchCustomer')}
            fullWidth
            margin="normal"
            variant="outlined"
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {customersLoading && <CircularProgress color="inherit" size={20} />}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
      />
      
      {!customersLoading && customers.length === 0 && (
        <Typography variant="body1" align="center" sx={mt2}>
          {t('invoices.form.noCustomersMessage')}
        </Typography>
      )}
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>{t('invoices.form.buttons.cancel')}</Button>
      <Button 
        variant="contained"
        onClick={onNavigateToCustomers}
      >
        {t('invoices.form.buttons.manageClients')}
      </Button>
      <Button 
        variant="contained"
        color="primary"
        onClick={() => onCustomerSelect(selectedCustomerId)}
        disabled={!selectedCustomerId}
      >
        {t('common.select')}
      </Button>
    </DialogActions>
  </Dialog>
));

CustomerSelectionDialog.displayName = 'CustomerSelectionDialog';

export default CustomerSelectionDialog;
