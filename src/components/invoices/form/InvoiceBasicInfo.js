import React from 'react';
import {
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import plLocale from 'date-fns/locale/pl';

const InvoiceBasicInfo = React.memo(({ invoice, invoiceId, handleChange, handleDateChange, companyInfo, t }) => {
  return (
    <Grid container spacing={2}>
      <Grid item xs={12}>
        <TextField
          fullWidth
          label={t('invoices.form.fields.invoiceNumber')}
          name="number"
          value={invoice.number}
          onChange={handleChange}
          helperText={invoiceId ? 
            (invoice.isProforma ? 
              'UWAGA: Zmiana numeru proformy zostanie automatycznie zsynchronizowana w powiązanych fakturach' : 
              'UWAGA: Zmiana numeru faktury może wpłynąć na spójność danych księgowych'
            ) : 
            'Zostanie wygenerowany automatycznie jeśli pozostawisz to pole puste'
          }
          color={invoiceId ? "warning" : "primary"}
        />
      </Grid>

      <Grid item xs={12} sm={6}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
          <DatePicker
            label={t('invoices.form.fields.issueDate')}
            value={invoice.issueDate ? new Date(invoice.issueDate) : null}
            onChange={(date) => handleDateChange('issueDate', date)}
            slotProps={{ textField: { fullWidth: true } }}
          />
        </LocalizationProvider>
      </Grid>
      <Grid item xs={12} sm={6}>
        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={plLocale}>
          <DatePicker
            label={t('invoices.form.fields.dueDate')}
            value={invoice.dueDate ? new Date(invoice.dueDate) : null}
            onChange={(date) => handleDateChange('dueDate', date)}
            slotProps={{ textField: { fullWidth: true } }}
          />
        </LocalizationProvider>
      </Grid>
      <Grid item xs={12}>
        <FormControl fullWidth>
          <InputLabel>{t('invoices.form.fields.invoiceStatus')}</InputLabel>
          <Select
            name="status"
            value={invoice.status}
            onChange={handleChange}
            label={t('invoices.form.fields.invoiceStatus')}
          >
            <MenuItem value="draft">{t('invoices.status.draft')}</MenuItem>
            <MenuItem value="issued">{t('invoices.status.issued')}</MenuItem>
            <MenuItem value="paid">{t('invoices.status.paid')}</MenuItem>
            <MenuItem value="partially_paid">{t('invoices.status.partiallyPaid')}</MenuItem>
            <MenuItem value="overdue">{t('invoices.status.overdue')}</MenuItem>
            <MenuItem value="cancelled">{t('invoices.status.cancelled')}</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12}>
        <FormControl fullWidth>
          <InputLabel>{t('invoices.form.fields.paymentMethod')}</InputLabel>
          <Select
            name="paymentMethod"
            value={invoice.paymentMethod}
            onChange={handleChange}
            label={t('invoices.form.fields.paymentMethod')}
          >
            <MenuItem value="Przelew">{t('invoices.form.paymentMethods.przelew')}</MenuItem>
            <MenuItem value="Gotówka">{t('invoices.form.paymentMethods.gotowka')}</MenuItem>
            <MenuItem value="Karta">{t('invoices.form.paymentMethods.karta')}</MenuItem>
            <MenuItem value="BLIK">{t('invoices.form.paymentMethods.blik')}</MenuItem>
            <MenuItem value="Za pobraniem">Za pobraniem</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12}>
        <FormControl fullWidth>
          <InputLabel>{t('invoices.form.fields.currency')}</InputLabel>
          <Select
            name="currency"
            value={invoice.currency || 'EUR'}
            onChange={handleChange}
            label={t('invoices.form.fields.currency')}
          >
            <MenuItem value="EUR">{t('invoices.form.currencies.EUR')} - Euro</MenuItem>
            <MenuItem value="PLN">{t('invoices.form.currencies.PLN')} - Polski złoty</MenuItem>
            <MenuItem value="USD">{t('invoices.form.currencies.USD')} - Dolar amerykański</MenuItem>
            <MenuItem value="GBP">{t('invoices.form.currencies.GBP')} - Funt brytyjski</MenuItem>
            <MenuItem value="CHF">CHF - Frank szwajcarski</MenuItem>
          </Select>
        </FormControl>
      </Grid>
      <Grid item xs={12}>
        <FormControl fullWidth>
          <InputLabel>{t('invoices.form.fields.bankAccount')}</InputLabel>
          <Select
            name="selectedBankAccount"
            value={invoice.selectedBankAccount || ''}
            onChange={handleChange}
            label={t('invoices.form.fields.bankAccount')}
          >
            <MenuItem value="">Brak rachunku</MenuItem>
            {companyInfo?.bankAccounts?.map(account => (
              <MenuItem key={account.id} value={account.id}>
                {account.bankName} - {account.accountNumber}
                {account.swift && ` (SWIFT: ${account.swift})`}
                {account.isDefault && ' (domyślny)'}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Grid>
    </Grid>
  );
});

InvoiceBasicInfo.displayName = 'InvoiceBasicInfo';

export default InvoiceBasicInfo;
