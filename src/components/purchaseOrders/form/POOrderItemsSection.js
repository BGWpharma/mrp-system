import React, { memo } from 'react';
import {
  Grid,
  TextField,
  Typography,
  FormControl,
  Select,
  MenuItem,
  Autocomplete,
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
  Alert,
  CircularProgress,
  Checkbox,
  FormControlLabel,
  Divider
} from '@mui/material';
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandLess as ExpandLessIcon,
  ExpandMore as ExpandMoreIcon,
  PlaylistAddCheck as PlaylistAddCheckIcon,
  Search as SearchIcon,
  Autorenew as AutorenewIcon,
  Info as InfoIcon,
  StarOutline as StarIcon,
  DocumentScanner as DocumentScannerIcon
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { pl, enUS } from 'date-fns/locale';
import { parseISO, isValid } from 'date-fns';
import { formatCurrency } from '../../../utils/formatUtils';
import { mr1 } from '../../../styles/muiCommonStyles';

const numberInputSx = {
  '& input[type=number]': { '-moz-appearance': 'textfield' },
  '& input[type=number]::-webkit-outer-spin-button': { '-webkit-appearance': 'none', margin: 0 },
  '& input[type=number]::-webkit-inner-spin-button': { '-webkit-appearance': 'none', margin: 0 },
};

const parseDateValue = (dateValue) => {
  if (!dateValue) return null;
  try {
    if (typeof dateValue === 'string') {
      if (dateValue.includes('Invalid') || dateValue.trim() === '') return null;
      const date = dateValue.includes('T') || dateValue.includes('Z')
        ? parseISO(dateValue)
        : new Date(dateValue + 'T00:00:00');
      return isValid(date) ? date : null;
    }
    if (dateValue instanceof Date) return isValid(dateValue) ? dateValue : null;
    if (dateValue && typeof dateValue.toDate === 'function') {
      const date = dateValue.toDate();
      return isValid(date) ? date : null;
    }
    return null;
  } catch (error) {
    console.error('Błąd parsowania daty:', error, dateValue);
    return null;
  }
};

const POOrderItemsSection = memo(({
  poData,
  setPoData,
  inventoryItems,
  handleAddItem,
  handleRemoveItem,
  handleItemChange,
  handleItemSelect,
  supplierSuggestions,
  loadingSupplierSuggestions,
  findBestSuppliers,
  applyBestSupplierPrices,
  fillMinimumOrderQuantities,
  setDocumentScannerOpen,
  currentLanguage,
  t
}) => {
  return (
    <>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Typography variant="h6">{t('purchaseOrders.form.orderItems.title')}</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddItem} size="small">
            {t('purchaseOrders.form.orderItems.addItem')}
          </Button>
          <Button variant="outlined" color="info" startIcon={<PlaylistAddCheckIcon />} onClick={fillMinimumOrderQuantities} size="small">
            {t('purchaseOrders.form.orderItems.fillMinimumQuantities')}
          </Button>
          <Button variant="outlined" color="warning" startIcon={<SearchIcon />} onClick={findBestSuppliers} disabled={loadingSupplierSuggestions} size="small">
            {t('purchaseOrders.form.orderItems.findBestPrices')}
          </Button>
          {Object.keys(supplierSuggestions).length > 0 && (
            <Button variant="outlined" color="secondary" startIcon={<AutorenewIcon />} onClick={applyBestSupplierPrices} size="small">
              {t('purchaseOrders.form.orderItems.applyBestPrices')}
            </Button>
          )}
          <Tooltip title={t('purchaseOrders.deliveryDocumentOcr.scanButtonTooltip', 'Skanuj dokument dostawy lub fakturę za pomocą AI')}>
            <Button
              variant="outlined"
              color="success"
              startIcon={<DocumentScannerIcon />}
              onClick={() => setDocumentScannerOpen(true)}
              size="small"
              disabled={poData.items.length === 0}
            >
              {t('purchaseOrders.deliveryDocumentOcr.scanButton', 'Skanuj dokument')}
            </Button>
          </Tooltip>
        </Box>
      </Box>

      <TableContainer component={Paper} sx={{ overflowX: 'visible' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell width="20%">{t('purchaseOrders.form.orderItems.product')}</TableCell>
              <TableCell width="10%">{t('purchaseOrders.form.orderItems.quantity')}</TableCell>
              <TableCell width="7%">{t('purchaseOrders.form.orderItems.unit')}</TableCell>
              <TableCell width="15%">{t('purchaseOrders.form.orderItems.unitPrice')}</TableCell>
              <TableCell width="8%">{t('purchaseOrders.form.orderItems.discount')}</TableCell>
              <TableCell width="7%">{t('purchaseOrders.form.currency')}</TableCell>
              <TableCell width="5%">{t('purchaseOrders.form.orderItems.vatRate')}</TableCell>
              <TableCell width="12%">{t('purchaseOrders.form.orderItems.expiryDate')}</TableCell>
              <TableCell width="15%">{t('purchaseOrders.form.orderItems.amountAfterConversion')}</TableCell>
              <TableCell width="5%"></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {poData.items.map((item, index) => (
              <React.Fragment key={index}>
                <TableRow hover>
                  <TableCell>
                    <Autocomplete
                      options={inventoryItems}
                      getOptionLabel={(option) => option.name}
                      value={inventoryItems.find(i => i.id === item.inventoryItemId) || null}
                      onChange={(event, newValue) => handleItemSelect(index, newValue)}
                      renderInput={(params) => (
                        <TextField {...params} label={t('purchaseOrders.form.orderItems.product')} required size="small" />
                      )}
                      sx={{ width: '100%' }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      size="small"
                      inputProps={{ min: 0, step: 'any' }}
                      sx={{ width: '100%', ...numberInputSx }}
                    />
                  </TableCell>
                  <TableCell>
                    <TextField
                      value={item.unit}
                      onChange={(e) => handleItemChange(index, 'unit', e.target.value)}
                      size="small"
                      sx={{ width: '100%' }}
                    />
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
                      {supplierSuggestions[item.inventoryItemId]?.isDefault && (
                        <Tooltip title={t('purchaseOrders.form.orderItems.defaultSupplierPrice')}>
                          <StarIcon color="primary" sx={mr1} />
                        </Tooltip>
                      )}
                      <TextField
                        type="number"
                        value={item.currency === poData.currency ? item.unitPrice : (item.originalUnitPrice || 0)}
                        onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                        size="small"
                        inputProps={{ min: 0, step: 'any' }}
                        sx={{ width: '100%', ...numberInputSx }}
                      />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <TextField
                      type="number"
                      value={item.discount || 0}
                      onChange={(e) => handleItemChange(index, 'discount', e.target.value)}
                      size="small"
                      inputProps={{ min: 0, max: 100, step: 'any' }}
                      InputProps={{ endAdornment: '%' }}
                      sx={{ width: '100%', ...numberInputSx }}
                    />
                  </TableCell>
                  <TableCell>
                    <FormControl size="small" sx={{ width: '100%' }}>
                      <Select
                        value={item.currency || poData.currency}
                        onChange={(e) => handleItemChange(index, 'currency', e.target.value)}
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
                  <TableCell>
                    <FormControl size="small" sx={{ width: '100%' }}>
                      <Select
                        value={item.vatRate !== undefined ? item.vatRate : 0}
                        onChange={(e) => handleItemChange(index, 'vatRate', e.target.value)}
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
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                        <DatePicker
                          value={(() => {
                            if (item.noExpiryDate) return null;
                            return parseDateValue(item.expiryDate);
                          })()}
                          onChange={(newValue) => {
                            if (newValue && newValue instanceof Date && !isNaN(newValue.getTime())) {
                              handleItemChange(index, 'expiryDate', newValue);
                              if (item.noExpiryDate) {
                                handleItemChange(index, 'noExpiryDate', false);
                              }
                            } else {
                              handleItemChange(index, 'expiryDate', null);
                            }
                          }}
                          disabled={item.noExpiryDate}
                          minDate={new Date()}
                          maxDate={new Date('2100-12-31')}
                          slotProps={{ 
                            textField: { 
                              fullWidth: true, size: 'small',
                              placeholder: item.noExpiryDate ? 'Brak daty ważności' : 'dd.mm.yyyy',
                              error: false
                            } 
                          }}
                          format="dd.MM.yyyy"
                        />
                      </LocalizationProvider>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={item.noExpiryDate || false}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              handleItemChange(index, 'noExpiryDate', isChecked);
                              if (isChecked) {
                                handleItemChange(index, 'expiryDate', null);
                              }
                            }}
                            size="small"
                          />
                        }
                        label="Brak daty"
                        sx={{ 
                          margin: 0,
                          '& .MuiFormControlLabel-label': { fontSize: '0.75rem', color: 'text.secondary' }
                        }}
                      />
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                      {formatCurrency(item.totalPrice || 0, poData.currency)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
                      <Tooltip title="Rozwiń dodatkowe pola">
                        <IconButton 
                          size="small" 
                          onClick={() => {
                            const expandedItems = { ...poData.expandedItems || {} };
                            expandedItems[index] = !expandedItems[index];
                            setPoData(prev => ({ ...prev, expandedItems }));
                          }}
                        >
                          {poData.expandedItems && poData.expandedItems[index] ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                        </IconButton>
                      </Tooltip>
                      <IconButton size="small" onClick={() => handleRemoveItem(index)} color="error">
                        <DeleteIcon />
                      </IconButton>
                    </Box>
                  </TableCell>
                </TableRow>

                {poData.expandedItems && poData.expandedItems[index] && (
                  <TableRow sx={{ backgroundColor: 'action.hover' }}>
                    <TableCell colSpan={10}>
                      <Grid container spacing={2} sx={{ py: 1 }}>
                        <Grid item xs={12} sm={4}>
                          <Typography variant="caption" display="block" gutterBottom>Kwota przed rabatem</Typography>
                          <Typography variant="body2">
                            {formatCurrency((item.unitPrice || 0) * item.quantity, poData.currency)}
                            {item.discount > 0 && (
                              <Typography variant="caption" component="span" sx={{ ml: 1, color: 'success.main' }}>
                                (rabat {item.discount}%)
                              </Typography>
                            )}
                          </Typography>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Typography variant="caption" display="block" gutterBottom>Kwota oryginalna</Typography>
                          <Typography variant="body2">
                            {item.currency !== poData.currency 
                              ? formatCurrency((item.originalUnitPrice || 0) * item.quantity, item.currency)
                              : '-'}
                          </Typography>
                          {item.vatRate > 0 && (
                            <>
                              <Typography variant="caption" display="block" gutterBottom sx={{ mt: 1 }}>
                                Kwota z VAT ({item.vatRate}%)
                              </Typography>
                              <Typography variant="body2" sx={{ fontWeight: 'medium', color: 'primary.main' }}>
                                {item.currency !== poData.currency 
                                  ? formatCurrency((item.originalUnitPrice || 0) * item.quantity * (1 + (item.vatRate || 0) / 100), item.currency)
                                  : formatCurrency((item.unitPrice || 0) * item.quantity * (1 + (item.vatRate || 0) / 100), poData.currency)}
                              </Typography>
                            </>
                          )}
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Typography variant="caption" display="block" gutterBottom>Nr faktury</Typography>
                          <TextField
                            fullWidth
                            size="small"
                            value={item.invoiceNumber || ''}
                            onChange={(e) => handleItemChange(index, 'invoiceNumber', e.target.value)}
                            placeholder="Nr faktury"
                          />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Typography variant="caption" display="block" gutterBottom>Data faktury</Typography>
                          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                            <DatePicker
                              value={parseDateValue(item.invoiceDate)}
                              onChange={(newValue) => {
                                if (newValue && newValue instanceof Date && !isNaN(newValue.getTime())) {
                                  handleItemChange(index, 'invoiceDate', newValue);
                                } else {
                                  handleItemChange(index, 'invoiceDate', null);
                                }
                              }}
                              onError={(error) => console.log('DatePicker error:', error)}
                              disableHighlightToday={false}
                              reduceAnimations={true}
                              minDate={new Date('1900-01-01')}
                              maxDate={new Date('2100-12-31')}
                              slotProps={{ 
                                textField: { 
                                  fullWidth: true, size: 'small', placeholder: 'dd.mm.yyyy',
                                  onBlur: (event) => console.log('DatePicker blur:', event.target.value),
                                  error: false
                                },
                                field: { clearable: true, shouldRespectLeadingZeros: true }
                              }}
                              format="dd.MM.yyyy"
                              views={['year', 'month', 'day']}
                            />
                          </LocalizationProvider>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Typography variant="caption" display="block" gutterBottom>Termin płatności</Typography>
                          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                            <DatePicker
                              value={parseDateValue(item.paymentDueDate)}
                              onChange={(newValue) => {
                                if (newValue && newValue instanceof Date && !isNaN(newValue.getTime())) {
                                  handleItemChange(index, 'paymentDueDate', newValue);
                                } else {
                                  handleItemChange(index, 'paymentDueDate', null);
                                }
                              }}
                              minDate={new Date('1900-01-01')}
                              maxDate={new Date('2100-12-31')}
                              slotProps={{ textField: { fullWidth: true, size: 'small', placeholder: 'dd.mm.yyyy', error: false } }}
                              format="dd.MM.yyyy"
                            />
                          </LocalizationProvider>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Typography variant="caption" display="block" gutterBottom>Planowana data dostawy</Typography>
                          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                            <DatePicker
                              value={parseDateValue(item.plannedDeliveryDate)}
                              onChange={(newValue) => {
                                if (newValue && newValue instanceof Date && !isNaN(newValue.getTime())) {
                                  handleItemChange(index, 'plannedDeliveryDate', newValue);
                                } else {
                                  handleItemChange(index, 'plannedDeliveryDate', null);
                                }
                              }}
                              minDate={new Date('1900-01-01')}
                              maxDate={new Date('2100-12-31')}
                              slotProps={{ textField: { fullWidth: true, size: 'small', placeholder: 'dd.mm.yyyy', error: false } }}
                              format="dd.MM.yyyy"
                            />
                          </LocalizationProvider>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Typography variant="caption" display="block" gutterBottom>Rzeczywista data dostawy</Typography>
                          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={currentLanguage === 'pl' ? pl : enUS}>
                            <DatePicker
                              value={parseDateValue(item.actualDeliveryDate)}
                              onChange={(newValue) => {
                                if (newValue && newValue instanceof Date && !isNaN(newValue.getTime())) {
                                  handleItemChange(index, 'actualDeliveryDate', newValue);
                                } else {
                                  handleItemChange(index, 'actualDeliveryDate', null);
                                }
                              }}
                              minDate={new Date('1900-01-01')}
                              maxDate={new Date('2100-12-31')}
                              slotProps={{ textField: { fullWidth: true, size: 'small', placeholder: 'dd.mm.yyyy', error: false } }}
                              format="dd.MM.yyyy"
                            />
                          </LocalizationProvider>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                          <Typography variant="caption" display="block" gutterBottom>Kurs</Typography>
                          <TextField
                            type="number"
                            fullWidth
                            size="small"
                            value={item.exchangeRate || 0}
                            onChange={(e) => handleItemChange(index, 'exchangeRate', e.target.value)}
                            placeholder="Kurs"
                            inputProps={{ min: 0, step: 'any' }}
                            disabled={item.currency === poData.currency}
                            sx={numberInputSx}
                          />
                        </Grid>
                        {Object.keys(supplierSuggestions).length > 0 && item.inventoryItemId && supplierSuggestions[item.inventoryItemId] && (
                          <Grid item xs={12}>
                            <Box sx={{ display: 'flex', alignItems: 'center', mt: 1 }}>
                              <InfoIcon fontSize="small" sx={{ mr: 1, color: 'info.main' }} />
                              <Typography variant="body2">
                                Sugerowana cena: {formatCurrency(supplierSuggestions[item.inventoryItemId].price)}
                                {item.supplierName && ` (Dostawca: ${item.supplierName})`}
                              </Typography>
                            </Box>
                          </Grid>
                        )}
                      </Grid>
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {loadingSupplierSuggestions && (
        <Box sx={{ mt: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
          <CircularProgress size={20} />
          <Typography variant="body2">Szukanie najlepszych cen dostawców...</Typography>
        </Box>
      )}

      {Object.keys(supplierSuggestions).length > 0 && (
        <Alert severity="info" sx={{ mt: 2, mb: 3 }}>
          Znaleziono sugestie cen dostawców dla {Object.keys(supplierSuggestions).length} pozycji.
          Kliknij &quot;Zastosuj najlepsze ceny&quot;, aby zaktualizować zamówienie.
        </Alert>
      )}

      <Box sx={{ my: 3 }}>
        <Divider />
      </Box>
    </>
  );
});

POOrderItemsSection.displayName = 'POOrderItemsSection';

export default POOrderItemsSection;
