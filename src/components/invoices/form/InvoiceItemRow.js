import React from 'react';
import {
  Card,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Typography
} from '@mui/material';
import { Delete as DeleteIcon } from '@mui/icons-material';

const InvoiceItemRow = React.memo(({ item, index, currency, handleItemChange, handleRemoveItem, disableRemove, t }) => {
  return (
    <Card variant="outlined" sx={{ mb: 2, p: 2 }}>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label={t('invoices.form.fields.productName')}
            value={item.name}
            onChange={(e) => handleItemChange(index, 'name', e.target.value)}
            required
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label={t('invoices.form.fields.description')}
            value={item.description || ''}
            onChange={(e) => handleItemChange(index, 'description', e.target.value)}
          />
        </Grid>
        <Grid item xs={12} sm={2}>
          <TextField
            fullWidth
            label={t('invoices.form.fields.cnCode')}
            value={item.cnCode || ''}
            onChange={(e) => handleItemChange(index, 'cnCode', e.target.value)}
            placeholder={t('invoices.form.fields.cnCodePlaceholder')}
            helperText={t('invoices.form.fields.classificationCode')}
          />
        </Grid>
        <Grid item xs={6} sm={2}>
          <TextField
            fullWidth
            label={t('invoices.form.fields.quantity')}
            type="number"
            value={item.quantity}
            onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))}
            required
            inputProps={{ min: 0, step: 0.01 }}
          />
        </Grid>
        <Grid item xs={6} sm={2}>
          <TextField
            fullWidth
            label={t('invoices.form.fields.unit')}
            value={item.unit}
            onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
            required
          />
        </Grid>
        <Grid item xs={6} sm={2}>
          <TextField
            fullWidth
            label={t('invoices.form.fields.netPrice')}
            type="number"
            value={item.price}
            onChange={(e) => handleItemChange(index, 'price', parseFloat(e.target.value))}
            required
            inputProps={{ min: 0, step: 0.01 }}
          />
        </Grid>
        <Grid item xs={6} sm={2}>
          <FormControl fullWidth>
            <InputLabel>{t('invoices.form.fields.vatPercent')}</InputLabel>
            <Select
              value={item.vat || (item.vat === 0 ? 0 : 0)}
              onChange={(e) => handleItemChange(index, 'vat', e.target.value)}
              label={t('invoices.form.fields.vatPercent')}
            >
              <MenuItem value={0}>0%</MenuItem>
              <MenuItem value={5}>5%</MenuItem>
              <MenuItem value={8}>8%</MenuItem>
              <MenuItem value={23}>23%</MenuItem>
              <MenuItem value="ZW">ZW</MenuItem>
              <MenuItem value="NP">NP</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={6} sm={3}>
          <TextField
            fullWidth
            label={t('invoices.form.fields.netValue')}
            type="number"
            value={item.netValue || (item.quantity * item.price)}
            onChange={(e) => handleItemChange(index, 'netValue', parseFloat(e.target.value))}
            inputProps={{ min: 0, step: 0.01 }}
            InputProps={{
              endAdornment: currency || 'EUR'
            }}
          />
        </Grid>
        <Grid item xs={6} sm={3}>
          <Typography variant="body1" fontWeight="bold">
            {t('invoices.form.fields.grossValue')}: {((item.netValue || (item.quantity * item.price)) * (1 + (typeof item.vat === 'number' || item.vat === 0 ? item.vat : 0) / 100)).toFixed(4)} {currency || 'EUR'}
          </Typography>
        </Grid>
        <Grid item xs={12} sm={6} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <IconButton
            color="error"
            onClick={() => handleRemoveItem(index)}
            disabled={disableRemove}
            title={t('common:common.removeItem')}
          >
            <DeleteIcon />
          </IconButton>
        </Grid>
      </Grid>
    </Card>
  );
});

InvoiceItemRow.displayName = 'InvoiceItemRow';

export default InvoiceItemRow;
