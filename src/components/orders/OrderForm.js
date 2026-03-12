import React from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Divider,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
  Tooltip,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  DialogContentText,
  Autocomplete,
  TableContainer
} from '@mui/material';
import {
  Save as SaveIcon,
  ArrowBack as ArrowBackIcon,
  Add as AddIcon,
  Calculate as CalculateIcon,
  Upload as UploadIcon,
  Person as PersonIcon,
  LocalShipping as LocalShippingIcon,
  ShoppingCart as ShoppingCartIcon,
  Receipt as ReceiptIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  mb2,
  mb3,
  mr1,
} from '../../styles/muiCommonStyles';
import ImportOrderItemsDialog from './ImportOrderItemsDialog';
import FormSectionNav from '../common/FormSectionNav';
import SortableRow from './OrderFormRow';
import { useOrderFormData } from '../../hooks/orders/useOrderFormData';
import { useOrderFormCosts } from '../../hooks/orders/useOrderFormCosts';

const OrderForm = ({ orderId }) => {
  const {
    loading,
    saving,
    orderData,
    setOrderData,
    customers,
    services,
    recipes,
    validationErrors,
    refreshingPTs,
    recalculatingTransport,
    expandedRows,
    isCustomerDialogOpen,
    isImportOrderItemsDialogOpen,
    setIsImportOrderItemsDialogOpen,

    basicDataRef,
    productsRef,
    notesRef,
    orderSummaryRef,
    invoicesRef,
    formSections,

    navigate,
    t,
    ORDER_STATUSES,

    handleSubmit,
    handleChange,
    handleCustomerChange,
    handleCustomerDetailChange,
    handleAddCustomer,
    handleCloseCustomerDialog,
    handleSaveNewCustomer,
    handleRecalculateTransportService,

    handleItemChange,
    handleProductSelect,
    addItem,
    handleImportOrderItems,
    removeItem,
    toggleExpandRow,
    handleDragEnd,

    refreshProductionTasks,
    refreshItemPrice,

    calculateItemTotalValue,
    calculateTotalItemsValue,
    calculateTotal,
    calculateDiscountAmount,

    formatDateToDisplay,
    formatCurrency,
    ensureDateInputFormat,
    currentUser,
  } = useOrderFormData(orderId);

  const {
    calculatingCosts,
    invoices,
    calculateEstimatedCostsForAllItems,
    handleAddInvoice,
    handleInvoiceChange,
    handleRemoveInvoice,
  } = useOrderFormCosts(orderData, setOrderData, orderId, currentUser);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const inputSx = {
    '& .MuiOutlinedInput-root': { 
      borderRadius: '8px',
      minWidth: { xs: '100px', sm: '120px' }
    },
    '& .MuiInputBase-input': {
      minWidth: { xs: '60px', sm: '80px' }
    }
  };
  
  const tableCellSx = {
    minWidth: { xs: '80px', sm: '100px' },
    whiteSpace: 'normal',
    wordBreak: 'break-word'
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <>
      <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2, maxWidth: '1600px', mx: 'auto' }}>
        <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button 
            startIcon={<ArrowBackIcon />} 
            onClick={() => navigate('/orders')}
          >
            {t('orderForm.buttons.back')}
          </Button>
          <Typography variant="h5">
            {orderId ? t('orderForm.title.edit') : t('orderForm.title.new')}
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            {orderId && (
              <Tooltip title="Przelicz ilość palet w usłudze transportowej na podstawie wszystkich powiązanych CMR">
                <Button 
                  variant="outlined"
                  color="secondary"
                  disabled={recalculatingTransport || saving}
                  startIcon={recalculatingTransport ? <CircularProgress size={20} /> : <LocalShippingIcon />}
                  onClick={handleRecalculateTransportService}
                >
                  {recalculatingTransport ? 'Przeliczam...' : 'Przelicz transport z CMR'}
                </Button>
              </Tooltip>
            )}
            <Button 
              type="submit" 
              variant="contained" 
              color="primary"
              disabled={saving}
              startIcon={<SaveIcon />}
            >
              {saving ? t('orderForm.buttons.saving') : t('orderForm.buttons.save')}
            </Button>
          </Box>
        </Box>

        {orderData.orderNumber && (
          <Box sx={{ mb: 3, p: 2, bgcolor: 'primary.light', borderRadius: 1, color: 'primary.contrastText', boxShadow: 1 }}>
            <Typography variant="subtitle1" fontWeight="bold">
              {t('orderForm.labels.orderNumber')}: {orderData.orderNumber}
            </Typography>
          </Box>
        )}

        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 0 }}>
          <FormSectionNav sections={formSections} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
        
        {/* === SEKCJA: Dane podstawowe === */}
        <div ref={basicDataRef}>
        <Paper sx={{ p: 3, mb: 3, boxShadow: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center' }}>
              <PersonIcon sx={mr1} /> {t('orderForm.sections.basicData')}
            </Typography>
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>{t('orderForm.labels.orderStatus')}</InputLabel>
              <Select
                name="status"
                value={orderData.status}
                onChange={handleChange}
                label={t('orderForm.labels.orderStatus')}
                sx={{ minWidth: { xs: '120px', sm: '200px' } }}
              >
                {ORDER_STATUSES.map(status => (
                  <MenuItem key={status.value} value={status.value}>
                    {status.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
          
          <Divider sx={mb3} />
          
          <Grid container spacing={3}>
            <Grid item xs={12} sm={6}>
              <Box sx={{ display: 'flex', alignItems: 'flex-start' }}>
                <FormControl fullWidth error={!!validationErrors.customerName}>
                  <Autocomplete
                    options={customers}
                    getOptionLabel={(customer) => customer && typeof customer === 'object' && customer.name ? customer.name : ''}
                    onChange={handleCustomerChange}
                    value={customers.find(c => c && c.id === orderData.customer.id) || null}
                    renderInput={(params) => (
                      <TextField 
                        {...params} 
                        label={t('orderForm.labels.client')} 
                        required
                        error={!!validationErrors.customerName}
                        helperText={validationErrors.customerName}
                        variant="outlined"
                        sx={inputSx}
                      />
                    )}
                  />
                </FormControl>
                <Tooltip title={t('orderForm.tooltips.addNewClient')}>
                  <IconButton 
                    color="primary" 
                    onClick={handleAddCustomer}
                    sx={{ ml: 1, mt: 1 }}
                  >
                    <AddIcon />
                  </IconButton>
                </Tooltip>
              </Box>
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                type="date"
                label={t('orderForm.labels.orderDate')}
                name="orderDate"
                value={ensureDateInputFormat(orderData.orderDate)}
                onChange={handleChange}
                fullWidth
                required
                InputLabelProps={{ shrink: true }}
                error={!!validationErrors.orderDate}
                helperText={validationErrors.orderDate}
                variant="outlined"
                sx={inputSx}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="customer_email"
                label={t('orderForm.labels.clientEmail')}
                value={orderData.customer.email || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                variant="outlined"
                sx={inputSx}
                InputProps={{
                  startAdornment: <InputAdornment position="start">@</InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                name="customer_phone"
                label={t('orderForm.labels.clientPhone')}
                value={orderData.customer.phone || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                variant="outlined"
                sx={inputSx}
                InputProps={{
                  startAdornment: <InputAdornment position="start">📞</InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="customer_shippingAddress"
                label={t('orderForm.labels.shippingAddress')}
                value={orderData.customer.shippingAddress || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                multiline
                rows={2}
                variant="outlined"
                sx={inputSx}
                InputProps={{
                  startAdornment: <InputAdornment position="start" sx={{ alignSelf: 'flex-start', mt: 1.5 }}>📍</InputAdornment>,
                }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                type="date"
                label={t('orderForm.labels.expectedDeliveryDate')}
                name="deadline"
                value={ensureDateInputFormat(orderData.deadline)}
                onChange={handleChange}
                fullWidth
                InputLabelProps={{ shrink: true }}
                helperText="Data kiedy zamówienie ma być dostarczone do klienta"
                variant="outlined"
                sx={inputSx}
              />
            </Grid>
          </Grid>
        </Paper>
        </div>

        {/* === SEKCJA: Produkty === */}
        <div ref={productsRef}>
        <Paper sx={{ p: 3, mb: 3, boxShadow: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center' }}>
              <ShoppingCartIcon sx={mr1} /> {t('orderForm.sections.products')}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              <Button 
                variant="contained" 
                startIcon={<AddIcon />} 
                onClick={addItem}
                color="secondary"
                sx={{ borderRadius: 2 }}
              >
                {t('orderForm.buttons.addProduct')}
              </Button>
              <Tooltip
                title={!orderData.customer?.id ? t('orderForm.import.requireCustomer', 'Wybierz klienta, aby móc importować pozycje z listą cenową') : ''}
              >
                <span>
                  <Button
                    variant="outlined"
                    startIcon={<UploadIcon />}
                    onClick={() => setIsImportOrderItemsDialogOpen(true)}
                    disabled={!orderData.customer?.id}
                    sx={{ borderRadius: 2 }}
                  >
                    {t('orderForm.buttons.importCSV')}
                  </Button>
                </span>
              </Tooltip>
              <Button
                variant="outlined"
                startIcon={calculatingCosts ? <CircularProgress size={16} /> : <CalculateIcon />}
                onClick={calculateEstimatedCostsForAllItems}
                disabled={calculatingCosts || !orderId}
                color="info"
                sx={{ borderRadius: 2 }}
              >
                {calculatingCosts ? t('orderForm.buttons.calculating') : t('orderForm.buttons.calculateEstimatedCosts')}
              </Button>
            </Box>
          </Box>
          
          <Divider sx={mb3} />
          
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <TableContainer component={Paper} sx={{ mb: 2, boxShadow: 1, borderRadius: 1, overflow: 'auto' }}>
              <Table>
                <TableHead sx={{ bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'grey.100' }}>
                  <TableRow>
                    <TableCell width="3%" sx={tableCellSx}></TableCell>
                    <TableCell width="4%" sx={tableCellSx}></TableCell>
                    <TableCell width="22%" sx={tableCellSx}>{t('orderForm.table.productRecipe')}</TableCell>
                    <TableCell width="8%" sx={tableCellSx}>{t('orderForm.table.quantity')}</TableCell>
                    <TableCell width="8%" sx={tableCellSx}>{t('orderForm.table.produced')}</TableCell>
                    <TableCell width="7%" sx={tableCellSx}>{t('orderForm.table.unit')}</TableCell>
                    <TableCell width="10%" sx={tableCellSx}>{t('orderForm.table.priceEUR')}</TableCell>
                    <TableCell width="10%" sx={tableCellSx}>{t('orderForm.table.value')}</TableCell>
                    <TableCell width="12%" sx={tableCellSx}>{t('orderForm.table.totalCostPerUnit')}</TableCell>
                    <TableCell width="12%" sx={tableCellSx}>
                      <Tooltip title={t('orderForm.tooltips.fullProductionCostPerUnit')}>
                        {t('orderForm.table.fullProductionCostPerUnit')}
                      </Tooltip>
                    </TableCell>
                    <TableCell width="4%" sx={tableCellSx}></TableCell>
                  </TableRow>
                </TableHead>
                <SortableContext items={orderData.items.map(item => item.id)} strategy={verticalListSortingStrategy}>
                  <TableBody>
                    {orderData.items.map((item, index) => (
                      <SortableRow
                        key={item.id}
                        item={item}
                        index={index}
                        expandedRows={expandedRows}
                        services={services}
                        recipes={recipes}
                        validationErrors={validationErrors}
                        inputSx={inputSx}
                        handleItemChange={handleItemChange}
                        handleProductSelect={handleProductSelect}
                        toggleExpandRow={toggleExpandRow}
                        refreshItemPrice={refreshItemPrice}
                        removeItem={removeItem}
                        formatCurrency={formatCurrency}
                        calculateItemTotalValue={calculateItemTotalValue}
                        calculateTotalItemsValue={calculateTotalItemsValue}
                        globalDiscount={orderData.globalDiscount || 0}
                        itemsLength={orderData.items.length}
                        refreshProductionTasks={refreshProductionTasks}
                        refreshingPTs={refreshingPTs}
                        navigate={navigate}
                        formatDateToDisplay={formatDateToDisplay}
                        t={t}
                      />
                    ))}
                  </TableBody>
                </SortableContext>
              </Table>
            </TableContainer>
          </DndContext>
          
          <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2, bgcolor: 'success.light', p: 2, borderRadius: 2 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: 'success.contrastText' }}>
              Suma: {formatCurrency(calculateTotalItemsValue())}
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
            <Button 
              variant="contained" 
              startIcon={<AddIcon />} 
              onClick={addItem}
              color="secondary"
              size="large"
              sx={{ borderRadius: 2, px: 4 }}
            >
              {t('orderForm.buttons.addProduct')}
            </Button>
          </Box>
        </Paper>
        </div>

        {/* === SEKCJA: Notatki === */}
        <div ref={notesRef}>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h6" sx={mb2}>{t('orderForm.sections.notes')}</Typography>
          <TextField
            name="notes"
            value={orderData.notes || ''}
            onChange={handleChange}
            fullWidth
            multiline
            rows={4}
            placeholder={t('orderForm.placeholders.notes')}
            sx={inputSx}
          />
        </Paper>
        </div>
        
        {/* === SEKCJA: Podsumowanie === */}
        <div ref={orderSummaryRef}>
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6">{t('orderForm.sections.orderSummary')}</Typography>
          </Box>
          
          <Divider sx={mb2} />
          
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">{t('orderForm.summary.productsValue')}:</Typography>
                <Typography variant="h6" fontWeight="bold">{formatCurrency(calculateTotalItemsValue())}</Typography>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2, bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'background.default' }}>
                <Typography variant="subtitle2" color="text.secondary">{t('orderForm.summary.globalDiscount')}:</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 1 }}>
                  <TextField
                    type="number"
                    size="small"
                    value={orderData.globalDiscount || 0}
                    onChange={(e) => handleChange({ target: { name: 'globalDiscount', value: e.target.value } })}
                    inputProps={{ 
                      min: 0, 
                      max: 100, 
                      step: 0.01
                    }}
                    sx={{ width: 100 }}
                    InputProps={{
                      endAdornment: <Typography variant="body2" sx={{ ml: 0.5 }}>%</Typography>
                    }}
                  />
                  {parseFloat(orderData.globalDiscount || 0) > 0 && (
                    <Typography variant="body2" sx={{ color: 'success.main', fontWeight: 'medium' }}>
                      -{formatCurrency(calculateDiscountAmount())}
                    </Typography>
                  )}
                </Box>
              </Paper>
            </Grid>
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                <Typography variant="subtitle2">{t('orderForm.summary.totalOrderValue')}:</Typography>
                <Typography variant="h5" fontWeight="bold">{formatCurrency(calculateTotal())}</Typography>
              </Paper>
            </Grid>
          </Grid>
        </Paper>
        </div>

        {/* === SEKCJA: Faktury === */}
        <div ref={invoicesRef}>
        <Paper sx={{ p: 3, mb: 3, boxShadow: 2, borderRadius: 2 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'primary.main', display: 'flex', alignItems: 'center' }}>
              <ReceiptIcon sx={mr1} /> {t('orderForm.sections.invoices')}
            </Typography>
            <Button
              startIcon={<AddIcon />}
              variant="outlined"
              onClick={handleAddInvoice}
              size="small"
              sx={{ borderRadius: 2 }}
            >
              {t('orderForm.buttons.addInvoice')}
            </Button>
          </Box>
          <Divider sx={mb3} />
          {invoices.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mb: 2 }}>
              {t('orderForm.messages.noInvoices')}
            </Typography>
          ) : (
            <TableContainer sx={{ overflow: 'auto', maxWidth: '100%' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={tableCellSx}>{t('orderForm.invoices.invoiceNumber')}</TableCell>
                    <TableCell sx={tableCellSx}>{t('orderForm.invoices.invoiceDate')}</TableCell>
                    <TableCell sx={tableCellSx}>{t('orderForm.invoices.status')}</TableCell>
                    <TableCell align="right" sx={tableCellSx}>{t('orderForm.invoices.amount')}</TableCell>
                    <TableCell align="right" sx={tableCellSx}>{t('orderForm.invoices.paidAmount')}</TableCell>
                    <TableCell width="50px" sx={tableCellSx}></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoices.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>
                        <TextField
                          value={inv.number}
                          onChange={e => handleInvoiceChange(inv.id, 'number', e.target.value)}
                          variant="standard"
                          fullWidth
                          placeholder={t('orderForm.placeholders.invoiceNumber')}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          type="date"
                          value={inv.date}
                          onChange={e => handleInvoiceChange(inv.id, 'date', e.target.value)}
                          variant="standard"
                          sx={{ width: 150 }}
                        />
                      </TableCell>
                      <TableCell>
                        <FormControl variant="standard" sx={{ minWidth: 120 }}>
                          <Select
                            value={inv.status}
                            onChange={e => handleInvoiceChange(inv.id, 'status', e.target.value)}
                          >
                            <MenuItem value="nieopłacona">Nieopłacona</MenuItem>
                            <MenuItem value="częściowo opłacona">Częściowo opłacona</MenuItem>
                            <MenuItem value="opłacona">Opłacona</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          value={inv.amount}
                          onChange={e => handleInvoiceChange(inv.id, 'amount', e.target.value)}
                          variant="standard"
                          inputProps={{ step: '0.01', min: '0' }}
                          sx={{ maxWidth: 120 }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <TextField
                          type="number"
                          value={inv.paidAmount}
                          onChange={e => handleInvoiceChange(inv.id, 'paidAmount', e.target.value)}
                          variant="standard"
                          inputProps={{ step: '0.01', min: '0' }}
                          sx={{ maxWidth: 120 }}
                        />
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" color="error" onClick={() => handleRemoveInvoice(inv.id)}>
                          <DeleteIcon />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
        </div>

          </Box>
        </Box>
      </Box>
      
      {/* Dialog dodawania klienta */}
      <Dialog open={isCustomerDialogOpen} onClose={handleCloseCustomerDialog} maxWidth="md" fullWidth>
        <DialogTitle>{t('orderForm.dialogs.addClient.title')}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={mb3}>
            Wprowadź dane nowego klienta. Klient zostanie dodany do bazy danych.
          </DialogContentText>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <TextField
                name="customer_name"
                label="Nazwa klienta"
                value={orderData.customer.name || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                required
                autoFocus
                error={!orderData.customer.name}
                helperText={!orderData.customer.name ? 'Nazwa klienta jest wymagana' : ''}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="customer_email"
                label="Email"
                value={orderData.customer.email || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="customer_phone"
                label="Telefon"
                value={orderData.customer.phone || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="customer_vatEu"
                label="VAT-EU"
                value={orderData.customer.vatEu || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="customer_billingAddress"
                label="Adres do faktury"
                value={orderData.customer.billingAddress || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                name="customer_shippingAddress"
                label={t('common:common.shippingAddress')}
                value={orderData.customer.shippingAddress || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                multiline
                rows={3}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="customer_notes"
                label="Notatki"
                value={orderData.customer.notes || ''}
                onChange={handleCustomerDetailChange}
                fullWidth
                multiline
                rows={2}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={handleCloseCustomerDialog} variant="outlined">{t('orderForm.buttons.cancel')}</Button>
          <Button 
            onClick={handleSaveNewCustomer} 
            variant="contained"
            disabled={!orderData.customer.name || saving}
            color="primary"
          >
            {saving ? 'Zapisywanie...' : 'Zapisz'}
          </Button>
        </DialogActions>
      </Dialog>

      <ImportOrderItemsDialog
        open={isImportOrderItemsDialogOpen}
        onClose={() => setIsImportOrderItemsDialogOpen(false)}
        customerId={orderData.customer?.id || null}
        onImport={handleImportOrderItems}
      />
    </>
  );
};

export default OrderForm;
