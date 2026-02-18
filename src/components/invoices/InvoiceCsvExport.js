import React, { useState } from 'react';
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Box,
  Switch,
  CircularProgress,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import {
  GetApp as GetAppIcon,
  Assessment as AssessmentIcon,
  Translate as TranslateIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import pl from 'date-fns/locale/pl';
import enUS from 'date-fns/locale/en-US';
import { useTranslation } from '../../hooks/useTranslation';
import { preciseCompare } from '../../utils/mathUtils';
import { calculateRequiredAdvancePayment } from '../../services/invoiceService';

// Słownik tłumaczeń dla raportów
const translations = {
  pl: {
    reportTitle: 'Raport Faktur',
    invoiceNumber: 'Numer faktury',
    issueDate: 'Data wystawienia',
    dueDate: 'Termin płatności',
    customer: 'Klient',
    totalAmount: 'Kwota całkowita',
    totalPaid: 'Zapłacono',
    remainingAmount: 'Do zapłaty',
    status: 'Status',
    paymentStatus: 'Status płatności',
    currency: 'Waluta',
    isProforma: 'Proforma',
    summary: 'Podsumowanie',
    totalInvoices: 'Całkowita liczba faktur',
    reportPeriod: 'Okres raportu',
    totalValue: 'Łączna wartość',
    totalPaidValue: 'Łącznie zapłacono',
    totalRemainingValue: 'Łącznie do zapłaty',
    yes: 'Tak',
    no: 'Nie',
    statusStatistics: 'Statystyki według statusu',
    invoiceCount: 'Liczba faktur',
    invoicesInReport: 'Faktury w raporcie',
    exportToCsv: 'Eksportuj do CSV',
    reportSummary: 'Podsumowanie raportu',
    generateReport: 'Generuj raport',
    generateFromInvoices: 'Wygeneruj raport z faktur',
    results: 'Wyniki raportu',
    close: 'Zamknij',
    includeItems: 'Uwzględnij pozycje faktur',
    allStatuses: 'Wszystkie statusy',
    allCustomers: 'Wszyscy klienci',
    fromDate: 'Data od',
    toDate: 'Data do',
    // Statusy faktur
    draft: 'Szkic',
    issued: 'Wystawiona',
    unpaid: 'Nieopłacona',
    paid: 'Opłacona',
    partially_paid: 'Częściowo opłacona',
    overdue: 'Po terminie',
    cancelled: 'Anulowana'
  },
  en: {
    reportTitle: 'Invoice Report',
    invoiceNumber: 'Invoice Number',
    issueDate: 'Issue Date',
    dueDate: 'Due Date',
    customer: 'Customer',
    totalAmount: 'Total Amount',
    totalPaid: 'Total Paid',
    remainingAmount: 'Remaining',
    status: 'Status',
    paymentStatus: 'Payment Status',
    currency: 'Currency',
    isProforma: 'Proforma',
    summary: 'Summary',
    totalInvoices: 'Total Invoices',
    reportPeriod: 'Report Period',
    totalValue: 'Total Value',
    totalPaidValue: 'Total Paid',
    totalRemainingValue: 'Total Remaining',
    yes: 'Yes',
    no: 'No',
    statusStatistics: 'Status Statistics',
    invoiceCount: 'Invoice Count',
    invoicesInReport: 'Invoices in Report',
    exportToCsv: 'Export to CSV',
    reportSummary: 'Report Summary',
    generateReport: 'Generate Report',
    generateFromInvoices: 'Generate Report from Invoices',
    results: 'Report Results',
    close: 'Close',
    includeItems: 'Include invoice items',
    allStatuses: 'All statuses',
    allCustomers: 'All customers',
    fromDate: 'From Date',
    toDate: 'To Date',
    // Invoice statuses
    draft: 'Draft',
    issued: 'Issued',
    unpaid: 'Unpaid',
    paid: 'Paid',
    partially_paid: 'Partially Paid',
    overdue: 'Overdue',
    cancelled: 'Cancelled'
  }
};

const InvoiceCsvExport = ({ invoices, customers }) => {
  const { t: translate } = useTranslation('invoices');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportData, setReportData] = useState(null);
  
  const [reportFilters, setReportFilters] = useState({
    startDate: format(new Date(new Date().setMonth(new Date().getMonth() - 1)), 'yyyy-MM-dd'),
    endDate: format(new Date(), 'yyyy-MM-dd'),
    customerId: '',
    status: '',
    includeItems: true,
    language: 'pl'
  });

  // Bieżący słownik tłumaczeń na podstawie wybranego języka
  const t = translations[reportFilters.language] || translations.pl;

  const handleOpenDialog = () => {
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    if (reportData) {
      setReportData(null);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setReportFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (e) => {
    const { name, checked } = e.target;
    setReportFilters(prev => ({ ...prev, [name]: checked }));
  };

  const handleLanguageChange = (e) => {
    setReportFilters(prev => ({ ...prev, language: e.target.checked ? 'en' : 'pl' }));
  };

  const translateStatus = (status) => {
    return t[status] || status;
  };

  const handleGenerateReport = async () => {
    setGeneratingReport(true);
    
    try {
      // Filtruj faktury według wybranych kryteriów
      let filteredInvoices = invoices.filter(invoice => {
        // Filtr daty
        if (reportFilters.startDate) {
          const invoiceDate = invoice.issueDate?.toDate?.() || new Date(invoice.issueDate);
          const startDate = new Date(reportFilters.startDate);
          if (invoiceDate < startDate) return false;
        }
        
        if (reportFilters.endDate) {
          const invoiceDate = invoice.issueDate?.toDate?.() || new Date(invoice.issueDate);
          const endDate = new Date(reportFilters.endDate);
          endDate.setHours(23, 59, 59, 999);
          if (invoiceDate > endDate) return false;
        }
        
        // Filtr klienta
        if (reportFilters.customerId && invoice.customer?.id !== reportFilters.customerId) {
          return false;
        }
        
        // Filtr statusu
        if (reportFilters.status && invoice.status !== reportFilters.status) {
          return false;
        }
        
        return true;
      });

      // Przygotuj dane raportu
      const statistics = {
        totalInvoices: filteredInvoices.length,
        byStatus: {},
        totalValue: 0,
        totalPaidValue: 0,
        totalRemainingValue: 0
      };

      // Oblicz statystyki
      filteredInvoices.forEach(invoice => {
        // Statystyki według statusu
        if (!statistics.byStatus[invoice.status]) {
          statistics.byStatus[invoice.status] = 0;
        }
        statistics.byStatus[invoice.status]++;

        // Oblicz wartości
        const total = parseFloat(invoice.total || 0);
        const paid = parseFloat(invoice.totalPaid || 0);
        const advancePayments = parseFloat(invoice.settledAdvancePayments || 0);
        const remaining = Math.max(0, total - paid - advancePayments);

        statistics.totalValue += total;
        statistics.totalPaidValue += paid + advancePayments;
        statistics.totalRemainingValue += remaining;
      });

      // Przygotuj faktury do raportu
      const invoicesForReport = filteredInvoices.map(invoice => {
        const total = parseFloat(invoice.total || 0);
        const paid = parseFloat(invoice.totalPaid || 0);
        const advancePayments = parseFloat(invoice.settledAdvancePayments || 0);
        const remaining = Math.max(0, total - paid - advancePayments);

        return {
          id: invoice.id,
          number: invoice.number,
          issueDate: invoice.issueDate?.toDate?.() || new Date(invoice.issueDate),
          dueDate: invoice.dueDate?.toDate?.() || new Date(invoice.dueDate),
          customer: invoice.customer?.name || '-',
          customerId: invoice.customer?.id,
          orderNumber: invoice.orderNumber || null,
          orderId: invoice.orderId || null,
          total: total,
          totalPaid: paid + advancePayments,
          remainingAmount: remaining,
          status: invoice.status,
          paymentStatus: invoice.paymentStatus,
          currency: invoice.currency || 'PLN',
          isProforma: invoice.isProforma || false,
          items: invoice.items || []
        };
      });

      setReportData({
        invoices: invoicesForReport,
        statistics
      });
    } catch (error) {
      console.error('Błąd podczas generowania raportu:', error);
    } finally {
      setGeneratingReport(false);
    }
  };

  const exportReportToCsv = () => {
    if (!reportData || !reportData.invoices.length) return;

    // Tworzymy nagłówki CSV w wybranym języku
    const headers = [
      t.invoiceNumber,
      t.issueDate,
      t.dueDate,
      t.customer,
      reportFilters.language === 'en' ? 'CO Number' : 'Numer CO',
      t.totalAmount,
      t.totalPaid,
      t.remainingAmount,
      t.currency,
      t.status,
      t.paymentStatus,
      t.isProforma
    ];

    // Tworzymy wiersze danych
    const rows = [];

    reportData.invoices.forEach(invoice => {
      // Dodaj główny wiersz faktury
      rows.push([
        invoice.number,
        invoice.issueDate ? format(invoice.issueDate, 'dd.MM.yyyy', { locale: reportFilters.language === 'en' ? enUS : pl }) : '',
        invoice.dueDate ? format(invoice.dueDate, 'dd.MM.yyyy', { locale: reportFilters.language === 'en' ? enUS : pl }) : '',
        invoice.customer,
        invoice.orderNumber || '-',
        invoice.total.toFixed(2),
        invoice.totalPaid.toFixed(2),
        invoice.remainingAmount.toFixed(2),
        invoice.currency,
        translateStatus(invoice.status),
        invoice.paymentStatus || '-',
        invoice.isProforma ? t.yes : t.no
      ]);

      // Jeśli faktura ma pozycje i opcja includeItems jest włączona, dodaj je
      if (reportFilters.includeItems && invoice.items && invoice.items.length > 0) {
        // Dodaj nagłówki pozycji
        rows.push(['', '', '', reportFilters.language === 'en' ? 'Name' : 'Nazwa', 
                   reportFilters.language === 'en' ? 'Description' : 'Opis', 
                   reportFilters.language === 'en' ? 'Quantity' : 'Ilość',
                   reportFilters.language === 'en' ? 'Unit' : 'Jedn.',
                   reportFilters.language === 'en' ? 'Unit Price' : 'Cena jedn.', 
                   reportFilters.language === 'en' ? 'VAT %' : 'VAT %',
                   reportFilters.language === 'en' ? 'Net Value' : 'Wartość netto',
                   reportFilters.language === 'en' ? 'Gross Value' : 'Wartość brutto']);

        // Dodaj wiersze dla każdej pozycji
        invoice.items.forEach((item) => {
          const netValue = item.netValue || (item.quantity * item.price) || 0;
          const vatRate = typeof item.vat === 'number' ? item.vat : 0;
          const grossValue = netValue * (1 + vatRate / 100);
          
          rows.push([
            '', '', '',
            item.name || '-',
            item.description || '-',
            item.quantity || '-',
            item.unit || '-',
            item.price ? item.price.toFixed(4) : '-',
            typeof item.vat === 'number' ? item.vat + '%' : (item.vat || '-'),
            netValue.toFixed(2),
            grossValue.toFixed(2)
          ]);
        });

        // Dodaj pustą linię po pozycjach
        rows.push([]);
      }
    });

    // Dodajemy podsumowanie raportu
    rows.push([]);
    rows.push([t.reportSummary]);
    rows.push([t.totalInvoices, reportData.statistics.totalInvoices]);
    rows.push([t.totalValue, reportData.statistics.totalValue.toFixed(2)]);
    rows.push([t.totalPaidValue, reportData.statistics.totalPaidValue.toFixed(2)]);
    rows.push([t.totalRemainingValue, reportData.statistics.totalRemainingValue.toFixed(2)]);

    // Dodajemy statystyki według statusu
    rows.push([]);
    rows.push([t.statusStatistics]);
    Object.entries(reportData.statistics.byStatus).forEach(([status, count]) => {
      rows.push([translateStatus(status), count]);
    });

    // Tworzymy zawartość pliku CSV
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell || ''}"`).join(','))
    ].join('\n');

    // Dodaj BOM dla prawidłowego wyświetlania polskich znaków w Excel
    const BOM = '\uFEFF';
    const csvContentWithBOM = BOM + csvContent;

    // Tworzymy link do pobrania
    const blob = new Blob([csvContentWithBOM], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);

    // Nazwa pliku w wybranym języku
    const reportName = reportFilters.language === 'en'
      ? `Invoice_Report_${format(new Date(), 'yyyy-MM-dd')}`
      : `Raport_Faktur_${format(new Date(), 'dd-MM-yyyy')}`;

    link.setAttribute('download', `${reportName}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
      <Button
        variant="outlined"
        color="primary"
        startIcon={<AssessmentIcon />}
        onClick={handleOpenDialog}
      >
        {translate('invoices.csvExport') || 'Raport CSV'}
      </Button>

      <Dialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {reportData
            ? t.results
            : t.generateFromInvoices
          }
          <Box sx={{ position: 'absolute', right: 16, top: 8, display: 'flex', alignItems: 'center' }}>
            PL
            <Switch
              checked={reportFilters.language === 'en'}
              onChange={handleLanguageChange}
              color="primary"
              size="small"
            />
            EN
            <TranslateIcon sx={{ ml: 1 }} fontSize="small" />
          </Box>
        </DialogTitle>
        <DialogContent>
          {!reportData ? (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t.fromDate}
                  type="date"
                  name="startDate"
                  value={reportFilters.startDate}
                  onChange={handleFilterChange}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label={t.toDate}
                  type="date"
                  name="endDate"
                  value={reportFilters.endDate}
                  onChange={handleFilterChange}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>{t.customer}</InputLabel>
                  <Select
                    name="customerId"
                    value={reportFilters.customerId || ''}
                    label={t.customer}
                    onChange={handleFilterChange}
                  >
                    <MenuItem value="">{t.allCustomers}</MenuItem>
                    {customers.map(customer => (
                      <MenuItem key={customer.id} value={customer.id}>
                        {customer.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>{t.status}</InputLabel>
                  <Select
                    name="status"
                    value={reportFilters.status || ''}
                    label={t.status}
                    onChange={handleFilterChange}
                  >
                    <MenuItem value="">{t.allStatuses}</MenuItem>
                    <MenuItem value="draft">{t.draft}</MenuItem>
                    <MenuItem value="issued">{t.issued}</MenuItem>
                    <MenuItem value="unpaid">{t.unpaid}</MenuItem>
                    <MenuItem value="paid">{t.paid}</MenuItem>
                    <MenuItem value="partially_paid">{t.partially_paid}</MenuItem>
                    <MenuItem value="overdue">{t.overdue}</MenuItem>
                    <MenuItem value="cancelled">{t.cancelled}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={reportFilters.includeItems}
                      onChange={handleCheckboxChange}
                      name="includeItems"
                      color="primary"
                    />
                  }
                  label={t.includeItems}
                />
              </Grid>
            </Grid>
          ) : (
            <Box>
              <Typography variant="h6" gutterBottom>
                {t.reportTitle} {format(new Date(), 'dd.MM.yyyy')}
              </Typography>

              <Typography variant="subtitle1" gutterBottom sx={{ mt: 2 }}>
                {t.summary}
              </Typography>

              <TableContainer component={Paper} sx={{ mb: 3 }}>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell component="th">{t.totalInvoices}</TableCell>
                      <TableCell align="right">{reportData.statistics.totalInvoices}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th">{t.reportPeriod}</TableCell>
                      <TableCell align="right">
                        {reportFilters.startDate} - {reportFilters.endDate}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th">{t.totalValue}</TableCell>
                      <TableCell align="right">{reportData.statistics.totalValue.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th">{t.totalPaidValue}</TableCell>
                      <TableCell align="right">{reportData.statistics.totalPaidValue.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th">{t.totalRemainingValue}</TableCell>
                      <TableCell align="right">{reportData.statistics.totalRemainingValue.toFixed(2)}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell component="th">{t.includeItems}</TableCell>
                      <TableCell align="right">{reportFilters.includeItems ? t.yes : t.no}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>

              <Typography variant="subtitle1" gutterBottom>
                {t.statusStatistics}
              </Typography>

              <TableContainer component={Paper} sx={{ mb: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>{t.status}</TableCell>
                      <TableCell align="right">{t.invoiceCount}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(reportData.statistics.byStatus).map(([status, count]) => (
                      <TableRow key={status}>
                        <TableCell>{translateStatus(status)}</TableCell>
                        <TableCell align="right">{count}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Typography variant="subtitle1" gutterBottom>
                {t.invoicesInReport}
              </Typography>

              {reportData.invoices.map((invoice) => (
                <Box key={invoice.id} sx={{ mb: 2 }}>
                  <TableContainer component={Paper} sx={{ mb: 1 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{t.invoiceNumber}</TableCell>
                          <TableCell>{t.issueDate}</TableCell>
                          <TableCell>{t.customer}</TableCell>
                          <TableCell>{reportFilters.language === 'en' ? 'CO Number' : 'Numer CO'}</TableCell>
                          <TableCell align="right">{t.totalAmount}</TableCell>
                          <TableCell>{t.status}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        <TableRow>
                          <TableCell>{invoice.number}</TableCell>
                          <TableCell>
                            {invoice.issueDate
                              ? format(invoice.issueDate, 'dd.MM.yyyy', { locale: reportFilters.language === 'en' ? enUS : pl })
                              : '-'
                            }
                          </TableCell>
                          <TableCell>{invoice.customer}</TableCell>
                          <TableCell>{invoice.orderNumber || '-'}</TableCell>
                          <TableCell align="right">
                            {invoice.total.toFixed(2)} {invoice.currency}
                          </TableCell>
                          <TableCell>{translateStatus(invoice.status)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </TableContainer>

                  {reportFilters.includeItems && invoice.items && invoice.items.length > 0 && (
                    <TableContainer component={Paper} sx={{ ml: 4, mb: 2 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>{reportFilters.language === 'en' ? 'Name' : 'Nazwa'}</TableCell>
                            <TableCell>{reportFilters.language === 'en' ? 'Description' : 'Opis'}</TableCell>
                            <TableCell align="right">{reportFilters.language === 'en' ? 'Quantity' : 'Ilość'}</TableCell>
                            <TableCell>{reportFilters.language === 'en' ? 'Unit' : 'Jedn.'}</TableCell>
                            <TableCell align="right">{reportFilters.language === 'en' ? 'Unit Price' : 'Cena jedn.'}</TableCell>
                            <TableCell align="right">{reportFilters.language === 'en' ? 'VAT %' : 'VAT %'}</TableCell>
                            <TableCell align="right">{reportFilters.language === 'en' ? 'Net Value' : 'Wart. netto'}</TableCell>
                            <TableCell align="right">{reportFilters.language === 'en' ? 'Gross Value' : 'Wart. brutto'}</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {invoice.items.map((item, idx) => {
                            const netValue = item.netValue || (item.quantity * item.price) || 0;
                            const vatRate = typeof item.vat === 'number' ? item.vat : 0;
                            const grossValue = netValue * (1 + vatRate / 100);
                            
                            return (
                              <TableRow key={idx}>
                                <TableCell>{item.name || '-'}</TableCell>
                                <TableCell>{item.description || '-'}</TableCell>
                                <TableCell align="right">{item.quantity || '-'}</TableCell>
                                <TableCell>{item.unit || '-'}</TableCell>
                                <TableCell align="right">{item.price ? item.price.toFixed(4) : '-'}</TableCell>
                                <TableCell align="right">{typeof item.vat === 'number' ? item.vat + '%' : (item.vat || '-')}</TableCell>
                                <TableCell align="right">{netValue.toFixed(2)}</TableCell>
                                <TableCell align="right">{grossValue.toFixed(2)}</TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {!reportData ? (
            <>
              <Button onClick={handleCloseDialog}>
                {t.close}
              </Button>
              <Button
                onClick={handleGenerateReport}
                variant="contained"
                color="primary"
                disabled={generatingReport}
                startIcon={generatingReport ? <CircularProgress size={20} /> : <AssessmentIcon />}
              >
                {t.generateReport}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={handleCloseDialog}>
                {t.close}
              </Button>
              <Button
                onClick={exportReportToCsv}
                variant="contained"
                color="success"
                startIcon={<GetAppIcon />}
              >
                {t.exportToCsv}
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
};

export default InvoiceCsvExport;

