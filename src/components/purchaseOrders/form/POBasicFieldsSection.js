import React, { memo } from 'react';
import {
  Grid,
  TextField,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  Box,
  Button
} from '@mui/material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl, enUS } from 'date-fns/locale';
import { parseISO, isValid } from 'date-fns';
import { formatAddress } from '../../../utils/addressUtils';
import { mt2 } from '../../../styles/muiCommonStyles';

const INCOTERMS_OPTIONS = [
  { value: '', label: '' },
  { value: 'EXW', label: 'EXW - Ex Works' },
  { value: 'FCA', label: 'FCA - Free Carrier' },
  { value: 'CPT', label: 'CPT - Carriage Paid To' },
  { value: 'CIP', label: 'CIP - Carriage and Insurance Paid To' },
  { value: 'DAP', label: 'DAP - Delivered at Place' },
  { value: 'DPU', label: 'DPU - Delivered at Place Unloaded' },
  { value: 'DDP', label: 'DDP - Delivered Duty Paid' },
  { value: 'FAS', label: 'FAS - Free Alongside Ship' },
  { value: 'FOB', label: 'FOB - Free on Board' },
  { value: 'CFR', label: 'CFR - Cost and Freight' },
  { value: 'CIF', label: 'CIF - Cost, Insurance and Freight' }
];

const parseDateValue = (dateValue) => {
  if (!dateValue) return null;
  try {
    if (dateValue instanceof Date) {
      return isValid(dateValue) ? dateValue : null;
    }
    if (dateValue && typeof dateValue.toDate === 'function') {
      return dateValue.toDate();
    }
    if (typeof dateValue === 'string') {
      if (dateValue.includes('Invalid') || dateValue.trim() === '') {
        return null;
      }
      const date = dateValue.includes('T') || dateValue.includes('Z')
        ? parseISO(dateValue)
        : new Date(dateValue + 'T00:00:00');
      return isValid(date) ? date : null;
    }
    return null;
  } catch (error) {
    console.error('Błąd parsowania daty:', error, dateValue);
    return null;
  }
};

const POBasicFieldsSection = memo(({
  poData,
  suppliers,
  warehouses,
  handleSupplierChange,
  handleChange,
  handleDateChange,
  setPoData,
  currentLanguage,
  t
}) => {
  return (
    <>
      <Grid item xs={12} md={6}>
        <Autocomplete
          options={suppliers}
          getOptionLabel={(option) => option.name}
          value={poData.supplier}
          onChange={handleSupplierChange}
          renderInput={(params) => (
            <TextField
              {...params}
              label={t('purchaseOrders.form.supplier')}
              required
              fullWidth
            />
          )}
        />
      </Grid>

      <Grid item xs={12} md={6}>
        <FormControl fullWidth required>
          <InputLabel>{t('purchaseOrders.form.targetWarehouse')}</InputLabel>
          <Select
            name="targetWarehouseId"
            value={poData.targetWarehouseId}
            onChange={handleChange}
            label={t('purchaseOrders.form.targetWarehouse')}
          >
            <MenuItem value=""><em>{t('purchaseOrders.form.selectWarehouse')}</em></MenuItem>
            {warehouses.map((warehouse) => (
              <MenuItem key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>

      <Grid item xs={12} md={6}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
          <DatePicker
            label={t('purchaseOrders.form.orderDate')}
            value={parseDateValue(poData.orderDate)}
            onChange={(date) => handleDateChange('orderDate', date)}
            minDate={new Date('1900-01-01')}
            maxDate={new Date('2100-12-31')}
            slotProps={{ textField: { fullWidth: true, error: false } }}
          />
        </LocalizationProvider>
      </Grid>

      <Grid item xs={12} md={6}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
          <DatePicker
            label={t('purchaseOrders.form.expectedDeliveryDate')}
            value={parseDateValue(poData.expectedDeliveryDate)}
            onChange={(date) => handleDateChange('expectedDeliveryDate', date)}
            minDate={new Date('1900-01-01')}
            maxDate={new Date('2100-12-31')}
            slotProps={{ textField: { fullWidth: true, required: true, error: false } }}
          />
        </LocalizationProvider>
      </Grid>

      <Grid item xs={12}>
        <TextField
          name="deliveryAddress"
          label={t('purchaseOrders.form.supplierAddress')}
          value={poData.deliveryAddress}
          onChange={handleChange}
          fullWidth
          multiline
          rows={3}
        />
        
        {poData.supplier && poData.supplier.addresses && poData.supplier.addresses.length > 0 && (
          <Box sx={mt2}>
            <Typography variant="subtitle2" gutterBottom>
              {t('purchaseOrders.form.selectSupplierAddress')}
            </Typography>
            <Grid container spacing={1}>
              {poData.supplier.addresses.map((address, idx) => (
                <Grid item xs={12} sm={6} key={address.id || idx}>
                  <Button
                    variant="outlined"
                    size="small"
                    fullWidth
                    sx={{ justifyContent: 'flex-start', textAlign: 'left', py: 1 }}
                    onClick={() => setPoData(prev => ({ ...prev, deliveryAddress: formatAddress(address) }))}
                  >
                    <Box>
                      <Typography variant="body2" fontWeight="bold">
                        {address.name} {address.isMain && t('purchaseOrders.form.mainAddress')}
                      </Typography>
                      <Typography variant="body2">{formatAddress(address)}</Typography>
                    </Box>
                  </Button>
                </Grid>
              ))}
            </Grid>
          </Box>
        )}
      </Grid>

      <Grid item xs={12} md={6}>
        <FormControl fullWidth>
          <InputLabel id="incoterms-label">{t('purchaseOrders.form.incoterms')}</InputLabel>
          <Select
            labelId="incoterms-label"
            name="incoterms"
            value={poData.incoterms || ''}
            onChange={handleChange}
            label={t('purchaseOrders.form.incoterms')}
          >
            {INCOTERMS_OPTIONS.map((option) => (
              <MenuItem key={option.value} value={option.value}>
                {option.label || t('purchaseOrders.form.selectIncoterms')}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>

      <Grid item xs={12} md={6}>
        <TextField
          name="notes"
          label={t('purchaseOrders.form.notes')}
          value={poData.notes}
          onChange={handleChange}
          fullWidth
          multiline
          rows={2}
        />
      </Grid>
    </>
  );
});

POBasicFieldsSection.displayName = 'POBasicFieldsSection';

export default POBasicFieldsSection;
