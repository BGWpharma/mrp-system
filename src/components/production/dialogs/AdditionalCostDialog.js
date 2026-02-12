/**
 * Dialog do dodawania/edycji dodatkowego kosztu w MO
 * Pola: nazwa, kwota, waluta, data wystawienia faktury
 * Kurs NBP z dnia poprzedzającego datę faktury (Art. 31a VAT)
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert
} from '@mui/material';

const CURRENCIES = ['EUR', 'PLN', 'USD', 'GBP', 'CHF', 'CZK', 'SEK', 'NOK', 'DKK'];

const formatDateForInput = (date) => {
  if (!date) return '';
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(date)) return date.slice(0, 10);
  const d = date?.toDate ? date.toDate() : new Date(date);
  return d.toISOString().slice(0, 10);
};

const AdditionalCostDialog = ({
  open,
  onClose,
  onSave,
  initialData = null,
  loading = false,
  t = (key) => key
}) => {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [invoiceDate, setInvoiceDate] = useState(formatDateForInput(new Date()));
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      if (initialData) {
        setName(initialData.name || '');
        setAmount(String(initialData.amount || ''));
        setCurrency(initialData.currency || 'EUR');
        setInvoiceDate(formatDateForInput(initialData.invoiceDate || new Date()));
      } else {
        setName('');
        setAmount('');
        setCurrency('EUR');
        setInvoiceDate(formatDateForInput(new Date()));
      }
      setError(null);
    }
  }, [open, initialData]);

  const handleSubmit = async () => {
    setError(null);
    const trimmedName = (name || '').trim();
    const numAmount = parseFloat(amount);
    if (!trimmedName) {
      setError(t('additionalCosts.dialog.errorName') || 'Podaj nazwę');
      return;
    }
    if (isNaN(numAmount) || numAmount <= 0) {
      setError(t('additionalCosts.dialog.errorAmount') || 'Kwota musi być większa od zera');
      return;
    }
    if (!invoiceDate) {
      setError(t('additionalCosts.dialog.errorDate') || 'Podaj datę wystawienia faktury');
      return;
    }
    const result = await onSave({
      id: initialData?.id,
      name: trimmedName,
      amount: numAmount,
      currency: currency || 'EUR',
      invoiceDate: invoiceDate
    });
    if (result?.success !== false) {
      onClose();
    } else if (result?.error) {
      setError(result.error.message || 'Wystąpił błąd');
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {initialData ? t('additionalCosts.dialog.editTitle') : t('additionalCosts.dialog.addTitle')}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            label={t('additionalCosts.table.name')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('additionalCosts.dialog.namePlaceholder')}
            fullWidth
            required
          />
          <TextField
            label={t('additionalCosts.dialog.amountLabel')}
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputProps={{ min: 0, step: 0.01 }}
            fullWidth
            required
          />
          <FormControl fullWidth>
            <InputLabel>{t('additionalCosts.table.currency')}</InputLabel>
            <Select
              value={currency}
              label={t('additionalCosts.table.currency')}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label={t('additionalCosts.table.invoiceDate')}
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            InputLabelProps={{ shrink: true }}
            fullWidth
            required
            helperText={t('additionalCosts.dialog.rateInfo') || 'Kurs NBP z dnia poprzedzającego (Art. 31a VAT)'}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('additionalCosts.dialog.cancel')}</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={loading}>
          {loading ? (t('common.updating') || 'Zapisywanie...') : t('additionalCosts.dialog.save')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AdditionalCostDialog;
