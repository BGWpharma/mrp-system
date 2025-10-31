// src/components/sales/co-reports/PaymentTimeline.js
import React from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  Divider,
  Grid,
  Stack,
  Tooltip
} from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Schedule as ScheduleIcon,
  Warning as WarningIcon,
  Receipt as ReceiptIcon,
  Description as DescriptionIcon
} from '@mui/icons-material';
import { formatCurrency } from '../../../utils/formatUtils';
import { useTranslation } from '../../../hooks/useTranslation';

/**
 * Komponent wyświetlający oś czasu płatności dla zamówienia
 */
const PaymentTimeline = ({ orderData }) => {
  const { t } = useTranslation('cashflow');

  if (!orderData || !orderData.paymentTimeline || orderData.paymentTimeline.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {t('cashflow.timeline.noPayments')}
        </Typography>
      </Paper>
    );
  }

  // Rozdziel płatności na potwierdzone i oczekiwane
  const confirmedPayments = orderData.paymentTimeline.filter(p => p.status === 'confirmed');
  const expectedPayments = orderData.paymentTimeline.filter(p => p.status === 'expected');

  const getStatusColor = (payment) => {
    if (payment.status === 'confirmed') {
      return 'success';
    }
    if (payment.isOverdue) {
      return 'error';
    }
    return 'warning';
  };

  const getStatusIcon = (payment) => {
    if (payment.status === 'confirmed') {
      return <CheckCircleIcon />;
    }
    if (payment.isOverdue) {
      return <WarningIcon />;
    }
    return <ScheduleIcon />;
  };

  const getStatusLabel = (payment) => {
    if (payment.status === 'confirmed') {
      return t('cashflow.timeline.confirmed');
    }
    if (payment.isOverdue) {
      return t('cashflow.timeline.overdue');
    }
    return t('cashflow.timeline.expected');
  };

  const getDocumentIcon = (type) => {
    return type === 'proforma' ? <DescriptionIcon /> : <ReceiptIcon />;
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const PaymentItem = ({ payment, index }) => (
    <Paper 
      elevation={1} 
      sx={{ 
        p: 2, 
        mb: 2,
        borderLeft: `4px solid`,
        borderLeftColor: `${getStatusColor(payment)}.main`,
        '&:hover': {
          boxShadow: 3
        }
      }}
    >
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} sm={3}>
          <Stack direction="row" spacing={1} alignItems="center">
            {getDocumentIcon(payment.type)}
            <Box>
              <Typography variant="body2" fontWeight="bold">
                {payment.documentNumber}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {payment.type === 'proforma' 
                  ? t('cashflow.timeline.proforma') 
                  : t('cashflow.timeline.invoice')}
              </Typography>
            </Box>
          </Stack>
        </Grid>

        <Grid item xs={12} sm={2}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {formatDate(payment.date)}
          </Typography>
        </Grid>

        <Grid item xs={12} sm={2}>
          <Typography variant="h6" color={`${getStatusColor(payment)}.main`}>
            {formatCurrency(payment.amount, payment.currency)}
          </Typography>
        </Grid>

        <Grid item xs={12} sm={2}>
          <Typography variant="body2" color="text.secondary">
            {payment.method}
          </Typography>
        </Grid>

        <Grid item xs={12} sm={3}>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent="flex-end">
            <Chip
              icon={getStatusIcon(payment)}
              label={getStatusLabel(payment)}
              color={getStatusColor(payment)}
              size="small"
            />
          </Stack>
        </Grid>

        {(payment.description || payment.reference) && (
          <Grid item xs={12}>
            <Divider sx={{ my: 1 }} />
            {payment.description && (
              <Typography variant="caption" display="block" color="text.secondary">
                <strong>{t('cashflow.timeline.description')}:</strong> {payment.description}
              </Typography>
            )}
            {payment.reference && (
              <Typography variant="caption" display="block" color="text.secondary">
                <strong>{t('cashflow.timeline.reference')}:</strong> {payment.reference}
              </Typography>
            )}
          </Grid>
        )}
      </Grid>
    </Paper>
  );

  return (
    <Box sx={{ p: 2 }}>
      {/* Podsumowanie */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: 'primary.50' }}>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={3}>
            <Typography variant="caption" color="text.secondary">
              {t('cashflow.table.orderValue')}
            </Typography>
            <Typography variant="h6">
              {formatCurrency(orderData.orderValue, orderData.currency)}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Typography variant="caption" color="text.secondary">
              {t('cashflow.table.paid')}
            </Typography>
            <Typography variant="h6" color="success.main">
              {formatCurrency(orderData.totalPaid, orderData.currency)}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Typography variant="caption" color="text.secondary">
              {t('cashflow.table.remaining')}
            </Typography>
            <Typography variant="h6" color="warning.main">
              {formatCurrency(orderData.totalRemaining, orderData.currency)}
            </Typography>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Typography variant="caption" color="text.secondary">
              {t('cashflow.table.status')}
            </Typography>
            <Chip
              label={t(`cashflow.status.${orderData.paymentStatus}`)}
              color={
                orderData.paymentStatus === 'paid' ? 'success' :
                orderData.paymentStatus === 'partially_paid' ? 'warning' :
                'default'
              }
              size="small"
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Historia płatności potwierdzonych */}
      {confirmedPayments.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CheckCircleIcon color="success" />
            {t('cashflow.timeline.paymentHistory')} ({confirmedPayments.length})
          </Typography>
          {confirmedPayments.map((payment, index) => (
            <PaymentItem key={`confirmed-${index}`} payment={payment} index={index} />
          ))}
        </Box>
      )}

      {/* Oczekiwane płatności */}
      {expectedPayments.length > 0 && (
        <Box>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ScheduleIcon color="warning" />
            {t('cashflow.timeline.expectedPayments')} ({expectedPayments.length})
          </Typography>
          {expectedPayments.map((payment, index) => (
            <PaymentItem key={`expected-${index}`} payment={payment} index={index} />
          ))}
        </Box>
      )}
    </Box>
  );
};

export default PaymentTimeline;

