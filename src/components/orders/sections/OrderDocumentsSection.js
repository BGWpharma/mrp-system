import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Chip,
  IconButton,
  CircularProgress,
  Button,
  Link,
  Tooltip
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Add as AddIcon
} from '@mui/icons-material';
import { formatCurrency } from '../../../utils/formatting';
import { formatDate } from '../../../utils/dateUtils';
import { useTranslation } from '../../../hooks/useTranslation';
import StatusChip from '../../common/StatusChip';

const renderPaymentStatus = (paymentStatus, t) => {
  const statusConfig = {
    'unpaid': { color: 'warning', label: t('orderDetails.paymentStatusLabels.unpaid') },
    'partially_paid': { color: 'primary', label: t('orderDetails.paymentStatusLabels.partiallyPaid') },
    'paid': { color: 'success', label: t('orderDetails.paymentStatusLabels.paid') }
  };
  
  const status = paymentStatus || 'unpaid';
  const config = statusConfig[status] || { color: 'default', label: status };
  
  return <Chip label={config.label} color={config.color} size="small" />;
};

const OrderDocumentsSection = ({
  order,
  orderId,
  invoices,
  loadingInvoices,
  cmrDocuments,
  loadingCmrDocuments,
  availableProformaAmounts,
  onFetchInvoices,
  onFetchCmrDocuments,
  onMigrateInvoices
}) => {
  const { t } = useTranslation('orders');

  return (
    <>
      {/* Invoices section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">{t('orderDetails.sections.relatedInvoices')}</Typography>
          <Box>
            <IconButton 
              color="primary" 
              onClick={onFetchInvoices}
              title={t('orderDetails.tooltips.refreshInvoicesList')}
            >
              <RefreshIcon />
            </IconButton>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              component={RouterLink}
              to={`/invoices/new?customerId=${order.customer?.id || ''}&orderId=${orderId}`}
              sx={{ ml: 1 }}
            >
              {t('orderDetails.invoicesTable.createInvoice')}
            </Button>
            <Button
              variant="outlined"
              size="small"
              color="secondary"
              onClick={onMigrateInvoices}
              disabled={loadingInvoices || invoices.length === 0}
              sx={{ ml: 1 }}
            >
              Migruj faktury
            </Button>
          </Box>
        </Box>
        
        {loadingInvoices ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : invoices.length === 0 ? (
          <Typography variant="body1" color="text.secondary">
            {t('orderDetails.invoicesTable.noInvoices')}
          </Typography>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('orderDetails.invoicesTable.invoiceNumber')}</TableCell>
                <TableCell>{t('orderDetails.invoicesTable.issueDate')}</TableCell>
                <TableCell>{t('orderDetails.invoicesTable.dueDate')}</TableCell>
                <TableCell>{t('orderDetails.invoicesTable.paymentStatus')}</TableCell>
                <TableCell align="right">{t('orderDetails.invoicesTable.value')}</TableCell>
                <TableCell align="right">{t('orderDetails.invoicesTable.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <Link
                      component={RouterLink}
                      to={`/invoices/${invoice.id}`}
                      sx={{ textDecoration: 'none', fontWeight: 'medium', '&:hover': { textDecoration: 'underline' } }}
                    >
                      {invoice.number || `#${invoice.id.substring(0, 8).toUpperCase()}`}
                    </Link>
                  </TableCell>
                  <TableCell>{invoice.issueDate ? formatDate(invoice.issueDate) : '-'}</TableCell>
                  <TableCell>{invoice.dueDate ? formatDate(invoice.dueDate) : '-'}</TableCell>
                  <TableCell>{renderPaymentStatus(invoice.paymentStatus, t)}</TableCell>
                  <TableCell align="right">
                    <Box>
                      <Typography variant="body2">
                        {formatCurrency(invoice.total || 0, invoice.currency || 'EUR')}
                      </Typography>
                      {invoice.isProforma && availableProformaAmounts[invoice.id] !== undefined && (
                        <Tooltip title="Kwota dostępna do rozliczenia na fakturze końcowej">
                          <Typography 
                            variant="caption" 
                            color={availableProformaAmounts[invoice.id] > 0 ? 'success.main' : 'text.secondary'}
                            sx={{ display: 'block' }}
                          >
                            Dostępne: {formatCurrency(availableProformaAmounts[invoice.id])}
                          </Typography>
                        </Tooltip>
                      )}
                    </Box>
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      component={RouterLink}
                      to={`/invoices/${invoice.id}`}
                      variant="outlined"
                    >
                      {t('orderDetails.invoicesTable.details')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      {/* CMR section */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">{t('orderDetails.sections.relatedCmrDocuments')}</Typography>
          <Box>
            <IconButton 
              color="primary" 
              onClick={onFetchCmrDocuments}
              title={t('orderDetails.tooltips.refreshCmrDocuments')}
            >
              <RefreshIcon />
            </IconButton>
            <Button
              variant="contained"
              size="small"
              startIcon={<AddIcon />}
              component={RouterLink}
              to="/inventory/cmr/new"
              sx={{ ml: 1 }}
            >
              {t('orderDetails.cmrTable.createCmr')}
            </Button>
          </Box>
        </Box>
        
        {loadingCmrDocuments ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        ) : cmrDocuments.length === 0 ? (
          <Typography variant="body1" color="text.secondary">
            {t('orderDetails.cmrTable.noCmrDocuments')}
          </Typography>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{t('orderDetails.cmrTable.cmrNumber')}</TableCell>
                <TableCell>{t('orderDetails.cmrTable.issueDate')}</TableCell>
                <TableCell>{t('orderDetails.cmrTable.deliveryDate')}</TableCell>
                <TableCell>{t('orderDetails.cmrTable.recipient')}</TableCell>
                <TableCell>{t('orderDetails.cmrTable.status')}</TableCell>
                <TableCell align="right">{t('orderDetails.cmrTable.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {cmrDocuments.map((cmr) => (
                <TableRow key={cmr.id}>
                  <TableCell>
                    <Link
                      component={RouterLink}
                      to={`/inventory/cmr/${cmr.id}`}
                      sx={{ textDecoration: 'none', fontWeight: 'medium', '&:hover': { textDecoration: 'underline' } }}
                    >
                      {cmr.cmrNumber || `#${cmr.id.substring(0, 8).toUpperCase()}`}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {cmr.issueDate ? formatDate(cmr.issueDate, false) : (cmr.status === 'Szkic' ? t('orderDetails.cmrTable.notSet') : '-')}
                  </TableCell>
                  <TableCell>
                    {cmr.deliveryDate ? formatDate(cmr.deliveryDate, false) : (cmr.status === 'Szkic' ? t('orderDetails.cmrTable.notSet') : '-')}
                  </TableCell>
                  <TableCell>{cmr.recipient || '-'}</TableCell>
                  <TableCell><StatusChip status={cmr.status} size="small" /></TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      component={RouterLink}
                      to={`/inventory/cmr/${cmr.id}`}
                      variant="outlined"
                    >
                      {t('orderDetails.cmrTable.details')}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
    </>
  );
};

export default React.memo(OrderDocumentsSection);
