import React from 'react';
import {
  Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,
  Button, FormControl, InputLabel, Select, MenuItem, Box, Typography,
  CircularProgress, Divider
} from '@mui/material';
import { Refresh as RefreshIcon } from '@mui/icons-material';
import { PURCHASE_ORDER_PAYMENT_STATUSES, translatePaymentStatus } from '../../../services/purchaseOrders';
import { mb2 } from '../../../styles/muiCommonStyles';

const PaymentStatusDialog = ({ open, onClose, purchaseOrder, newPaymentStatus, onPaymentStatusChange, onSave, onRecalculate, recalculating, t }) => (
  <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
    <DialogTitle>Zmień status płatności</DialogTitle>
    <DialogContent>
      {purchaseOrder?.totalPaidFromInvoices != null && purchaseOrder?.totalGross > 0 && (
        <Box sx={{ mb: 2, p: 1.5, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Aktualny stan wpłat z faktur:
          </Typography>
          <Typography variant="body1" fontWeight="medium">
            {parseFloat(purchaseOrder.totalPaidFromInvoices).toFixed(2)} / {parseFloat(purchaseOrder.totalGross).toFixed(2)} {purchaseOrder.currency || 'EUR'}
            {' '}({Math.min(100, Math.round((purchaseOrder.totalPaidFromInvoices / purchaseOrder.totalGross) * 100))}%)
          </Typography>
        </Box>
      )}
      <DialogContentText sx={mb2}>
        Wybierz nowy status płatności zamówienia lub przelicz automatycznie na podstawie wpłat na fakturach:
      </DialogContentText>
      <Button
        variant="outlined" color="info" fullWidth
        onClick={onRecalculate} disabled={recalculating}
        startIcon={recalculating ? <CircularProgress size={18} /> : <RefreshIcon />}
        sx={{ mb: 2 }}
      >
        {recalculating ? 'Przeliczanie...' : 'Przelicz automatycznie z faktur'}
      </Button>
      <Divider sx={{ mb: 2 }}>lub ustaw ręcznie</Divider>
      <FormControl fullWidth>
        <InputLabel>{t('common:common.paymentStatus')}</InputLabel>
        <Select value={newPaymentStatus} onChange={(e) => onPaymentStatusChange(e.target.value)} label={t('common:common.paymentStatus')}>
          <MenuItem value={PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID}>{translatePaymentStatus(PURCHASE_ORDER_PAYMENT_STATUSES.UNPAID)}</MenuItem>
          <MenuItem value={PURCHASE_ORDER_PAYMENT_STATUSES.TO_BE_PAID}>{translatePaymentStatus(PURCHASE_ORDER_PAYMENT_STATUSES.TO_BE_PAID)}</MenuItem>
          <MenuItem value={PURCHASE_ORDER_PAYMENT_STATUSES.PARTIALLY_PAID}>{translatePaymentStatus(PURCHASE_ORDER_PAYMENT_STATUSES.PARTIALLY_PAID)}</MenuItem>
          <MenuItem value={PURCHASE_ORDER_PAYMENT_STATUSES.PAID}>{translatePaymentStatus(PURCHASE_ORDER_PAYMENT_STATUSES.PAID)}</MenuItem>
        </Select>
      </FormControl>
    </DialogContent>
    <DialogActions>
      <Button onClick={onClose}>Anuluj</Button>
      <Button onClick={onSave} color="primary">Zapisz ręcznie</Button>
    </DialogActions>
  </Dialog>
);

export default PaymentStatusDialog;
