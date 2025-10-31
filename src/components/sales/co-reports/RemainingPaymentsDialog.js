// src/components/sales/co-reports/RemainingPaymentsDialog.js
import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Paper,
  Chip,
  Divider,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert
} from '@mui/material';
import {
  Warning as WarningIcon,
  Schedule as ScheduleIcon,
  Receipt as ReceiptIcon,
  Description as DescriptionIcon
} from '@mui/icons-material';
import { formatCurrency } from '../../../utils/formatUtils';
import { useTranslation } from '../../../hooks/useTranslation';

/**
 * Dialog wyświetlający szczegóły pozostałych płatności do zapłaty
 */
const RemainingPaymentsDialog = ({ open, onClose, orderData, currency = 'EUR' }) => {
  const { t } = useTranslation('cashflow');

  if (!orderData) return null;

  // Wyfiltruj tylko oczekiwane płatności
  const expectedPayments = orderData.paymentTimeline?.filter(p => p.status === 'expected') || [];
  
  // Rozdziel na przeterminowane i nadchodzące
  const overduePayments = expectedPayments.filter(p => p.isOverdue);
  const upcomingPayments = expectedPayments.filter(p => !p.isOverdue);

  const totalRemaining = expectedPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalOverdue = overduePayments.reduce((sum, p) => sum + p.amount, 0);

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  const getDocumentIcon = (type) => {
    return type === 'proforma' ? <DescriptionIcon fontSize="small" /> : <ReceiptIcon fontSize="small" />;
  };

  const PaymentRow = ({ payment }) => (
    <TableRow 
      sx={{ 
        bgcolor: payment.isOverdue ? 'error.dark' : 'transparent',
        '&:hover': { bgcolor: payment.isOverdue ? 'error.main' : 'action.hover' },
        '& .MuiTableCell-root': payment.isOverdue ? { 
          borderColor: 'error.main' 
        } : {}
      }}
    >
      <TableCell>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {getDocumentIcon(payment.type)}
          <Typography variant="body2" fontWeight="medium">
            {payment.documentNumber}
          </Typography>
        </Box>
      </TableCell>
      <TableCell>
        <Typography variant="body2">
          {formatDate(payment.date)}
        </Typography>
      </TableCell>
      <TableCell align="right">
        <Typography variant="body2" fontWeight="medium">
          {formatCurrency(payment.amount, currency)}
        </Typography>
      </TableCell>
      <TableCell>
        <Typography variant="body2">
          {payment.method || 'Przelew'}
        </Typography>
      </TableCell>
      <TableCell align="center">
        <Chip
          icon={payment.isOverdue ? <WarningIcon /> : <ScheduleIcon />}
          label={payment.isOverdue ? t('cashflow.timeline.overdue') : t('cashflow.timeline.expected')}
          size="small"
          color={payment.isOverdue ? 'error' : 'warning'}
        />
      </TableCell>
    </TableRow>
  );

  return (
    <Dialog 
      open={open} 
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h6" component="div">
              {t('cashflow.remaining.title')}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t('cashflow.table.orderNumber')}: {orderData.orderNumber} • {orderData.customer?.name}
            </Typography>
          </Box>
          <Chip
            label={formatCurrency(totalRemaining, currency)}
            color="warning"
            sx={{ fontSize: '1.1rem', fontWeight: 'bold', px: 2 }}
          />
        </Box>
      </DialogTitle>
      <DialogContent dividers>
        {expectedPayments.length === 0 ? (
          <Box sx={{ py: 4, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              {t('cashflow.remaining.noPayments')}
            </Typography>
          </Box>
        ) : (
          <Stack spacing={3}>
            {/* Podsumowanie */}
            <Paper sx={{ p: 2, bgcolor: 'action.hover', border: 1, borderColor: 'divider' }}>
              <Stack spacing={1}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('cashflow.remaining.orderValue')}:
                  </Typography>
                  <Typography variant="body1" fontWeight="medium">
                    {formatCurrency(orderData.orderValue, currency)}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body2" color="text.secondary">
                    {t('cashflow.remaining.paid')}:
                  </Typography>
                  <Typography variant="body1" fontWeight="medium" color="success.main">
                    {formatCurrency(orderData.totalPaid, currency)}
                  </Typography>
                </Box>
                <Divider />
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Typography variant="body1" fontWeight="bold">
                    {t('cashflow.remaining.total')}:
                  </Typography>
                  <Typography variant="h6" fontWeight="bold" color="warning.main">
                    {formatCurrency(totalRemaining, currency)}
                  </Typography>
                </Box>
                {totalOverdue > 0 && (
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" color="error.main" fontWeight="medium">
                      {t('cashflow.remaining.overdue')}:
                    </Typography>
                    <Typography variant="body1" fontWeight="bold" color="error.main">
                      {formatCurrency(totalOverdue, currency)}
                    </Typography>
                  </Box>
                )}
              </Stack>
            </Paper>

            {/* Alert dla przeterminowanych */}
            {overduePayments.length > 0 && (
              <Alert severity="error" icon={<WarningIcon />}>
                {t('cashflow.remaining.overdueWarning', { count: overduePayments.length })}
              </Alert>
            )}

            {/* Tabela przeterminowanych płatności */}
            {overduePayments.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom sx={{ color: 'error.main', fontWeight: 'bold' }}>
                  {t('cashflow.remaining.overduePayments')} ({overduePayments.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'error.dark' }}>
                        <TableCell sx={{ color: 'error.contrastText', fontWeight: 'bold' }}>{t('cashflow.remaining.document')}</TableCell>
                        <TableCell sx={{ color: 'error.contrastText', fontWeight: 'bold' }}>{t('cashflow.remaining.dueDate')}</TableCell>
                        <TableCell align="right" sx={{ color: 'error.contrastText', fontWeight: 'bold' }}>{t('cashflow.remaining.amount')}</TableCell>
                        <TableCell sx={{ color: 'error.contrastText', fontWeight: 'bold' }}>{t('cashflow.remaining.method')}</TableCell>
                        <TableCell align="center" sx={{ color: 'error.contrastText', fontWeight: 'bold' }}>{t('cashflow.remaining.status')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {overduePayments.map((payment, index) => (
                        <PaymentRow key={`overdue-${index}`} payment={payment} />
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}

            {/* Tabela nadchodzących płatności */}
            {upcomingPayments.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                  {t('cashflow.remaining.upcomingPayments')} ({upcomingPayments.length})
                </Typography>
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ bgcolor: 'action.selected' }}>
                        <TableCell sx={{ fontWeight: 'bold' }}>{t('cashflow.remaining.document')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>{t('cashflow.remaining.dueDate')}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('cashflow.remaining.amount')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>{t('cashflow.remaining.method')}</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 'bold' }}>{t('cashflow.remaining.status')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {upcomingPayments.map((payment, index) => (
                        <PaymentRow key={`upcoming-${index}`} payment={payment} />
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="primary" variant="contained">
          {t('cashflow.remaining.close')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RemainingPaymentsDialog;

