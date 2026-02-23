import React, { memo } from 'react';
import {
  Grid,
  TextField,
  Typography,
  FormControl,
  Select,
  MenuItem,
  Box,
  Button,
  IconButton,
  Tooltip,
  Paper,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Checkbox
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl, enUS } from 'date-fns/locale';
import { parseISO, isValid, format } from 'date-fns';
import { formatCurrency } from '../../../utils/formatUtils';
import { formatNumberClean } from '../../../utils/formatters';
import { mb2 } from '../../../styles/muiCommonStyles';

const numberInputSx = {
  '& input[type=number]': { '-moz-appearance': 'textfield' },
  '& input[type=number]::-webkit-outer-spin-button': { '-webkit-appearance': 'none', margin: 0 },
  '& input[type=number]::-webkit-inner-spin-button': { '-webkit-appearance': 'none', margin: 0 },
};

const parseDateValue = (dateValue) => {
  if (!dateValue) return null;
  try {
    if (dateValue instanceof Date) return isValid(dateValue) ? dateValue : null;
    if (dateValue && typeof dateValue.toDate === 'function') {
      const date = dateValue.toDate();
      return isValid(date) ? date : null;
    }
    if (typeof dateValue === 'string') {
      const trimmed = dateValue.trim();
      if (trimmed === '' || trimmed.includes('Invalid')) return null;
      let date;
      if (trimmed.includes('T') || trimmed.includes('Z')) {
        date = parseISO(trimmed);
      } else {
        date = new Date(trimmed + 'T00:00:00');
      }
      return isValid(date) ? date : null;
    }
    return null;
  } catch (error) {
    console.error('Błąd parsowania daty:', error, dateValue);
    return null;
  }
};

const POAdditionalCostsSection = memo(({
  poData,
  setPoData,
  handleAddAdditionalCost,
  handleAdditionalCostChange,
  handleRemoveAdditionalCost,
  currentLanguage,
  t
}) => {
  return (
    <Grid item xs={12}>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="subtitle1">
            {t('purchaseOrders.form.additionalCosts.title')}
          </Typography>
        </Box>
        <Button
          startIcon={<AddIcon />}
          onClick={handleAddAdditionalCost}
          variant="outlined"
          size="small"
        >
          {t('purchaseOrders.form.additionalCosts.addCost')}
        </Button>
      </Box>

      {poData.additionalCostsItems.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>
          {t('purchaseOrders.form.additionalCosts.noCosts')}
        </Typography>
      ) : (
        <TableContainer component={Paper} sx={mb2}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{t('purchaseOrders.form.additionalCosts.description')}</TableCell>
                <TableCell align="right">{t('purchaseOrders.form.additionalCosts.amount')}</TableCell>
                <TableCell align="right">{t('purchaseOrders.form.currency')}</TableCell>
                <TableCell align="right">{t('purchaseOrders.form.additionalCosts.vatRate')}</TableCell>
                <TableCell width="50px"></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {poData.additionalCostsItems.map((cost) => (
                <React.Fragment key={cost.id}>
                  <TableRow hover>
                    <TableCell>
                      <TextField
                        fullWidth
                        size="small"
                        value={cost.description}
                        onChange={(e) => handleAdditionalCostChange(cost.id, 'description', e.target.value)}
                        placeholder={t('purchaseOrders.form.additionalCosts.placeholder')}
                        sx={{ minWidth: '250px' }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <TextField
                        type="number"
                        size="small"
                        value={cost.currency === poData.currency ? cost.value : (cost.originalValue || 0)}
                        onChange={(e) => handleAdditionalCostChange(cost.id, 'value', e.target.value)}
                        inputProps={{ step: 'any' }}
                        sx={{ width: 120, ...numberInputSx }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <FormControl size="small" sx={{ width: 100 }}>
                        <Select
                          value={cost.currency || poData.currency}
                          onChange={(e) => handleAdditionalCostChange(cost.id, 'currency', e.target.value)}
                          size="small"
                        >
                          <MenuItem value="EUR">EUR</MenuItem>
                          <MenuItem value="PLN">PLN</MenuItem>
                          <MenuItem value="USD">USD</MenuItem>
                          <MenuItem value="GBP">GBP</MenuItem>
                          <MenuItem value="CHF">CHF</MenuItem>
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell align="right">
                      <FormControl size="small" sx={{ width: 100 }}>
                        <Select
                          value={cost.vatRate !== undefined ? cost.vatRate : 0}
                          onChange={(e) => handleAdditionalCostChange(cost.id, 'vatRate', e.target.value)}
                          size="small"
                        >
                          <MenuItem value={0}>0%</MenuItem>
                          <MenuItem value={5}>5%</MenuItem>
                          <MenuItem value={8}>8%</MenuItem>
                          <MenuItem value={23}>23%</MenuItem>
                          <MenuItem value="ZW">ZW</MenuItem>
                          <MenuItem value="NP">NP</MenuItem>
                        </Select>
                      </FormControl>
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                        <Tooltip title={t('purchaseOrders.form.additionalCosts.expandFields')}>
                          <IconButton 
                            size="small" 
                            onClick={() => {
                              const expandedCostItems = { ...poData.expandedCostItems || {} };
                              expandedCostItems[cost.id] = !expandedCostItems[cost.id];
                              setPoData(prev => ({ ...prev, expandedCostItems }));
                            }}
                          >
                            {poData.expandedCostItems && poData.expandedCostItems[cost.id] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        </Tooltip>
                        <IconButton
                          size="small"
                          onClick={() => handleRemoveAdditionalCost(cost.id)}
                          color="error"
                        >
                          <DeleteIcon />
                        </IconButton>
                      </Box>
                    </TableCell>
                  </TableRow>

                  {poData.expandedCostItems && poData.expandedCostItems[cost.id] && (
                    <TableRow sx={{ backgroundColor: 'action.hover' }}>
                      <TableCell colSpan={5}>
                        <Grid container spacing={2} sx={{ py: 1 }}>
                          <Grid item xs={12} sm={4}>
                            <Typography variant="caption" display="block" gutterBottom>
                              {t('purchaseOrders.form.additionalCosts.originalAmount')}
                            </Typography>
                            {cost.currency !== poData.currency ? (
                              <Tooltip title={`Oryginalnie w ${cost.currency}`}>
                                <Typography variant="body2">
                                  {formatCurrency(cost.originalValue || 0, cost.currency)}
                                </Typography>
                              </Tooltip>
                            ) : (
                              <Typography variant="body2" sx={{ color: 'text.secondary' }}>-</Typography>
                            )}
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <Typography variant="caption" display="block" gutterBottom>
                              Kwota po przewalutowaniu
                            </Typography>
                            {cost.currency !== poData.currency ? (
                              <Tooltip title={`Po przewalutowaniu na ${poData.currency}`}>
                                <Typography variant="body2">
                                  {formatCurrency(cost.value || 0, poData.currency)}
                                </Typography>
                              </Tooltip>
                            ) : (
                              <Typography variant="body2" sx={{ color: 'text.secondary' }}>-</Typography>
                            )}
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <Typography variant="caption" display="block" gutterBottom>Nr faktury</Typography>
                            <TextField
                              fullWidth
                              size="small"
                              value={cost.invoiceNumber || ''}
                              onChange={(e) => handleAdditionalCostChange(cost.id, 'invoiceNumber', e.target.value)}
                              placeholder="Nr faktury"
                            />
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <Typography variant="caption" display="block" gutterBottom>Data faktury</Typography>
                            <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                              <DatePicker
                                value={parseDateValue(cost.invoiceDate)}
                                onChange={(newValue) => {
                                  if (newValue && newValue instanceof Date && !isNaN(newValue.getTime())) {
                                    handleAdditionalCostChange(cost.id, 'invoiceDate', newValue);
                                  } else {
                                    handleAdditionalCostChange(cost.id, 'invoiceDate', null);
                                  }
                                }}
                                onError={(error) => {
                                  console.log('DatePicker error:', error);
                                }}
                                disableHighlightToday={false}
                                reduceAnimations={true}
                                minDate={new Date('1900-01-01')}
                                maxDate={new Date('2100-12-31')}
                                slotProps={{ 
                                  textField: { 
                                    fullWidth: true, 
                                    size: 'small',
                                    placeholder: 'dd.mm.yyyy',
                                    onBlur: (event) => {
                                      console.log('DatePicker blur:', event.target.value);
                                    },
                                    error: false
                                  },
                                  field: { 
                                    clearable: true,
                                    shouldRespectLeadingZeros: true
                                  }
                                }}
                                format="dd.MM.yyyy"
                                views={['year', 'month', 'day']}
                                dayOfWeekFormatter={(date) => {
                                  try {
                                    if (!date || !isValid(date)) return '';
                                    return format(date, 'EEE', { locale: pl }).slice(0, 2);
                                  } catch (error) {
                                    console.warn('dayOfWeekFormatter error:', error, date);
                                    return '';
                                  }
                                }}
                              />
                            </LocalizationProvider>
                          </Grid>
                          <Grid item xs={12} sm={4}>
                            <Typography variant="caption" display="block" gutterBottom>Kurs</Typography>
                            <TextField
                              type="number"
                              fullWidth
                              size="small"
                              value={cost.exchangeRate || 0}
                              onChange={(e) => handleAdditionalCostChange(cost.id, 'exchangeRate', e.target.value)}
                              placeholder="Kurs"
                              inputProps={{ min: 0, step: 'any' }}
                              disabled={cost.currency === poData.currency}
                              sx={numberInputSx}
                            />
                          </Grid>
                          
                          <Grid item xs={12}>
                            <Typography variant="caption" display="block" gutterBottom>
                              Przypisz koszt do pozycji
                            </Typography>
                            <FormControl fullWidth size="small">
                              <Select
                                multiple
                                value={cost.affectedItems || []}
                                onChange={(e) => handleAdditionalCostChange(cost.id, 'affectedItems', e.target.value)}
                                renderValue={(selected) => {
                                  if (!selected || selected.length === 0) {
                                    return <em style={{ color: '#666' }}>Wszystkie pozycje (domyślnie)</em>;
                                  }
                                  const selectedItems = poData.items.filter(item => selected.includes(item.id));
                                  if (selectedItems.length === poData.items.length) {
                                    return <em style={{ color: '#666' }}>Wszystkie pozycje</em>;
                                  }
                                  return `${selectedItems.length} z ${poData.items.length} pozycji`;
                                }}
                                displayEmpty
                                sx={{ 
                                  backgroundColor: 'background.paper',
                                  '& .MuiSelect-select em': { fontStyle: 'normal' }
                                }}
                              >
                                <MenuItem value="" disabled>
                                  <em>Wybierz pozycje lub pozostaw puste dla wszystkich</em>
                                </MenuItem>
                                {poData.items && poData.items.length > 0 ? (
                                  poData.items.map((item) => (
                                    <MenuItem key={item.id} value={item.id}>
                                      <Checkbox 
                                        checked={(cost.affectedItems || []).includes(item.id)}
                                        size="small"
                                      />
                                      <Box sx={{ ml: 1 }}>
                                        <Typography variant="body2">{item.name}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                          {item.quantity} {item.unit} × {formatCurrency(item.unitPrice || 0, poData.currency)} = {formatCurrency(item.totalPrice || 0, poData.currency)}
                                        </Typography>
                                      </Box>
                                    </MenuItem>
                                  ))
                                ) : (
                                  <MenuItem disabled>
                                    <Typography variant="body2" color="text.secondary">
                                      Brak pozycji w zamówieniu
                                    </Typography>
                                  </MenuItem>
                                )}
                              </Select>
                            </FormControl>
                            {cost.affectedItems && cost.affectedItems.length > 0 && (
                              <Typography variant="caption" color="primary" sx={{ mt: 0.5, display: 'block' }}>
                                ℹ️ Koszt będzie rozliczony proporcjonalnie tylko na wybrane pozycje
                              </Typography>
                            )}
                            {(!cost.affectedItems || cost.affectedItems.length === 0) && (
                              <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                                ℹ️ Koszt będzie rozliczony proporcjonalnie na wszystkie pozycje
                              </Typography>
                            )}
                          </Grid>
                        </Grid>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
              <TableRow>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Suma:</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {formatNumberClean(poData.additionalCostsItems.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0))} {poData.currency}
                </TableCell>
                <TableCell />
                <TableCell />
                <TableCell />
              </TableRow>
              {Array.from(new Set(poData.additionalCostsItems.map(c => c.vatRate)))
                .filter(vatRate => typeof vatRate === 'number')
                .sort((a, b) => a - b)
                .map(vatRate => {
                  const costsWithSameVat = poData.additionalCostsItems.filter(c => c.vatRate === vatRate);
                  const sumNet = costsWithSameVat.reduce((sum, c) => sum + (parseFloat(c.value) || 0), 0);
                  const vatValue = (sumNet * vatRate) / 100;
                  return (
                    <TableRow key={`vat-${vatRate}`}>
                      <TableCell align="right" sx={{ fontStyle: 'italic' }}>VAT {vatRate}%:</TableCell>
                      <TableCell align="right" sx={{ fontStyle: 'italic' }}>
                        {formatNumberClean(vatValue)} {poData.currency}
                      </TableCell>
                      <TableCell />
                      <TableCell />
                      <TableCell />
                    </TableRow>
                  );
                })}
              <TableRow>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Suma brutto:</TableCell>
                <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                  {(() => {
                    const netTotal = poData.additionalCostsItems.reduce(
                      (sum, item) => sum + (parseFloat(item.value) || 0), 0
                    );
                    const vatTotal = poData.additionalCostsItems.reduce((sum, item) => {
                      const itemValue = parseFloat(item.value) || 0;
                      const vr = typeof item.vatRate === 'number' ? item.vatRate : 0;
                      return sum + (itemValue * vr) / 100;
                    }, 0);
                    return formatNumberClean(netTotal + vatTotal);
                  })()} {poData.currency}
                </TableCell>
                <TableCell />
                <TableCell />
                <TableCell />
              </TableRow>
            </TableBody>
          </Table>
          
          {poData.additionalCostsItems.some(c => c.currency !== poData.currency) && (
            <Box sx={{ py: 1, px: 2 }}>
              <Typography variant="caption" sx={{ fontStyle: 'italic' }} className="exchange-rate-info">
                Wartości w walutach obcych zostały przeliczone według kursów z dnia poprzedzającego datę faktury lub z dnia utworzenia PO (jeśli brak daty faktury).
              </Typography>
            </Box>
          )}
        </TableContainer>
      )}
    </Grid>
  );
});

POAdditionalCostsSection.displayName = 'POAdditionalCostsSection';

export default POAdditionalCostsSection;
