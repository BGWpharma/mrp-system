import React from 'react';
import {
  Box,
  Typography,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  Divider
} from '@mui/material';
import {
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { Link as RouterLink } from 'react-router-dom';
import { format } from 'date-fns';

const InvoiceExpandedDetails = ({ invoice, onRefresh, formatCurrency, t }) => {
  if (!invoice) return null;

  // Bezpieczna funkcja formatowania daty
  const safeFormatDate = (date) => {
    if (!date) return '-';
    try {
      // Jeśli to Firestore Timestamp
      if (date && typeof date.toDate === 'function') {
        return format(date.toDate(), 'dd.MM.yyyy');
      }
      // Jeśli to już obiekt Date
      if (date instanceof Date) {
        if (isNaN(date.getTime())) return '-';
        return format(date, 'dd.MM.yyyy');
      }
      // Jeśli to string lub number
      const parsedDate = new Date(date);
      if (isNaN(parsedDate.getTime())) return '-';
      return format(parsedDate, 'dd.MM.yyyy');
    } catch (error) {
      console.error('Błąd formatowania daty:', error, date);
      return '-';
    }
  };

  // Pomocnicza funkcja do pobierania stawki VAT
  const getVatRate = (vat) => {
    if (typeof vat === 'number') return vat;
    if (vat === 'ZW' || vat === 'NP') return 0;
    return parseFloat(vat) || 0;
  };

  // Oblicz sumy z pozycji faktury
  const calculateTotals = () => {
    if (!invoice.items || invoice.items.length === 0) {
      return { netTotal: 0, vatTotal: 0 };
    }
    
    let netTotal = 0;
    let vatTotal = 0;
    
    invoice.items.forEach(item => {
      const quantity = Number(item.quantity) || 0;
      const price = Number(item.price) || 0;
      const vatRate = getVatRate(item.vat);
      
      const netValue = quantity * price;
      const vatValue = netValue * (vatRate / 100);
      
      netTotal += netValue;
      vatTotal += vatValue;
    });
    
    return { netTotal, vatTotal };
  };

  const { netTotal, vatTotal } = calculateTotals();

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" component="div">
          {t('invoices.details.title') || 'Szczegóły faktury'}
        </Typography>
        <Button
          size="small"
          startIcon={<RefreshIcon />}
          onClick={onRefresh}
        >
          {t('common.refresh') || 'Odśwież'}
        </Button>
      </Box>

      <Grid container spacing={3}>
        {/* Dane nabywcy i płatności */}
        <Grid item xs={12} md={6}>
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
            {t('invoices.details.buyer') || 'Nabywca'}
          </Typography>
          <Typography variant="body2" fontWeight="medium">{invoice.customer?.name || '-'}</Typography>
          {invoice.customer?.address && (
            <Typography variant="body2" color="text.secondary">{invoice.customer.address}</Typography>
          )}
          {invoice.customer?.taxId && (
            <Typography variant="body2" color="text.secondary">NIP: {invoice.customer.taxId}</Typography>
          )}
          {invoice.customer?.vatEu && (
            <Typography variant="body2" color="text.secondary">VAT-EU: {invoice.customer.vatEu}</Typography>
          )}
        </Grid>

        <Grid item xs={12} md={6}>
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
            {t('invoices.details.paymentInfo') || 'Informacje o płatności'}
          </Typography>
          <Typography variant="body2">
            {t('invoices.details.paymentMethod') || 'Metoda płatności'}: {invoice.paymentMethod || '-'}
          </Typography>
          {invoice.notes && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              {t('invoices.details.notes') || 'Uwagi'}: {invoice.notes}
            </Typography>
          )}
        </Grid>

        {/* Podsumowanie kwot */}
        <Grid item xs={12} md={6}>
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
            {t('invoices.details.summary') || 'Podsumowanie'}
          </Typography>
          <Typography variant="body2">
            {t('invoices.details.netTotal') || 'Netto'}: {formatCurrency(netTotal, invoice.currency)}
          </Typography>
          <Typography variant="body2">
            {t('invoices.details.vat') || 'VAT'}: {formatCurrency(vatTotal, invoice.currency)}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
            {t('invoices.details.grossTotal') || 'Brutto'}: {formatCurrency(invoice.total || (netTotal + vatTotal), invoice.currency)}
          </Typography>
          {invoice.totalPaid > 0 && (
            <Typography variant="body2" color="success.main">
              {t('invoices.details.paid') || 'Zapłacono'}: {formatCurrency(invoice.totalPaid, invoice.currency)}
            </Typography>
          )}
        </Grid>

        {/* Pozycje faktury */}
        <Grid item xs={12}>
          <Divider sx={{ my: 1 }} />
          <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
            {t('invoices.details.items') || 'Pozycje faktury'}
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow sx={{ bgcolor: 'grey.100' }}>
                  <TableCell>{t('invoices.details.itemName') || 'Nazwa'}</TableCell>
                  <TableCell align="right">{t('invoices.details.quantity') || 'Ilość'}</TableCell>
                  <TableCell>{t('invoices.details.unit') || 'Jedn.'}</TableCell>
                  <TableCell align="right">{t('invoices.details.unitPrice') || 'Cena jedn.'}</TableCell>
                  <TableCell align="center">{t('invoices.details.vatRate') || 'VAT %'}</TableCell>
                  <TableCell align="right">{t('invoices.details.netValue') || 'Netto'}</TableCell>
                  <TableCell align="right">{t('invoices.details.grossValue') || 'Brutto'}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoice.items && invoice.items.length > 0 ? (
                  invoice.items.map((item, index) => {
                    const quantity = Number(item.quantity) || 0;
                    const price = Number(item.price) || 0;
                    const vatRate = getVatRate(item.vat);
                    const netValue = quantity * price;
                    const vatAmount = netValue * (vatRate / 100);
                    const grossValue = netValue + vatAmount;
                    
                    // Wyświetlanie stawki VAT
                    const vatDisplay = (item.vat === 'ZW' || item.vat === 'NP') ? item.vat : `${vatRate}%`;
                    
                    return (
                      <TableRow key={index}>
                        <TableCell>
                          <Typography variant="body2">{item.name || '-'}</Typography>
                          {item.description && (
                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {item.description}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">{quantity}</TableCell>
                        <TableCell>{item.unit || 'szt.'}</TableCell>
                        <TableCell align="right">{formatCurrency(price, invoice.currency)}</TableCell>
                        <TableCell align="center">{vatDisplay}</TableCell>
                        <TableCell align="right">{formatCurrency(netValue, invoice.currency)}</TableCell>
                        <TableCell align="right">{formatCurrency(grossValue, invoice.currency)}</TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography variant="body2" color="text.secondary">
                        {t('invoices.details.noItems') || 'Brak pozycji'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Grid>

        {/* Historia płatności */}
        {invoice.payments && invoice.payments.length > 0 && (
          <Grid item xs={12}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
              {t('invoices.details.paymentHistory') || 'Historia płatności'}
            </Typography>
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: 'grey.100' }}>
                    <TableCell>{t('invoices.details.paymentDate') || 'Data'}</TableCell>
                    <TableCell align="right">{t('invoices.details.paymentAmount') || 'Kwota'}</TableCell>
                    <TableCell>{t('invoices.details.paymentMethod') || 'Metoda'}</TableCell>
                    <TableCell>{t('invoices.details.paymentNote') || 'Uwagi'}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoice.payments.map((payment, index) => (
                    <TableRow key={index}>
                      <TableCell>{safeFormatDate(payment.date)}</TableCell>
                      <TableCell align="right">{formatCurrency(payment.amount, invoice.currency)}</TableCell>
                      <TableCell>{payment.method || '-'}</TableCell>
                      <TableCell>{payment.note || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Grid>
        )}

        {/* Powiązane proformy */}
        {invoice.proformAllocation && invoice.proformAllocation.length > 0 && (
          <Grid item xs={12}>
            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
              {t('invoices.details.linkedProformas') || 'Powiązane proformy'}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {invoice.proformAllocation.map((allocation, index) => (
                <Chip
                  key={index}
                  label={`${allocation.proformaNumber || allocation.proformaId}: ${formatCurrency(allocation.amount, invoice.currency)}`}
                  size="small"
                  color="info"
                  variant="outlined"
                  component={RouterLink}
                  to={`/invoices/${allocation.proformaId}`}
                  clickable
                />
              ))}
            </Box>
          </Grid>
        )}
      </Grid>
    </Box>
  );
};

export default InvoiceExpandedDetails;

