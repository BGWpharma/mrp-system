import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  IconButton,
  Chip,
  Grid,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Payment as PaymentIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { 
  addPaymentToInvoice, 
  removePaymentFromInvoice, 
  updatePaymentInInvoice,
  getInvoicePayments 
} from '../../services/invoiceService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { formatCurrency } from '../../utils/formatters';

const PaymentsSection = ({ invoice, onPaymentChange }) => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [paymentToDelete, setPaymentToDelete] = useState(null);
  
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    method: 'przelew',
    description: '',
    reference: ''
  });

  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();

  const paymentMethods = [
    { value: 'przelew', label: 'Przelew' },
    { value: 'gotowka', label: 'Gotówka' },
    { value: 'karta', label: 'Karta' },
    { value: 'blik', label: 'BLIK' },
    { value: 'paypal', label: 'PayPal' },
    { value: 'inne', label: 'Inne' }
  ];

  useEffect(() => {
    if (invoice?.id) {
      loadPayments();
    }
  }, [invoice?.id]);

  const loadPayments = async () => {
    try {
      const invoicePayments = await getInvoicePayments(invoice.id);
      setPayments(invoicePayments);
    } catch (error) {
      console.error('Błąd podczas ładowania płatności:', error);
    }
  };

  const handleOpenDialog = (payment = null) => {
    if (payment) {
      setEditingPayment(payment);
      setPaymentForm({
        amount: payment.amount.toString(),
        date: format(new Date(payment.date), 'yyyy-MM-dd'),
        method: payment.method,
        description: payment.description || '',
        reference: payment.reference || ''
      });
    } else {
      setEditingPayment(null);
      setPaymentForm({
        amount: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        method: 'przelew',
        description: '',
        reference: ''
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingPayment(null);
    setPaymentForm({
      amount: '',
      date: format(new Date(), 'yyyy-MM-dd'),
      method: 'przelew',
      description: '',
      reference: ''
    });
  };

  const handleFormChange = (field, value) => {
    setPaymentForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSavePayment = async () => {
    try {
      if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
        showError('Kwota płatności musi być większa od zera');
        return;
      }

      setLoading(true);

      if (editingPayment) {
        // Edycja istniejącej płatności
        await updatePaymentInInvoice(
          invoice.id, 
          editingPayment.id, 
          paymentForm, 
          currentUser.uid
        );
        showSuccess('Płatność została zaktualizowana');
      } else {
        // Dodanie nowej płatności
        await addPaymentToInvoice(invoice.id, paymentForm, currentUser.uid);
        showSuccess('Płatność została dodana');
      }

      await loadPayments();
      handleCloseDialog();
      
      // Powiadom komponent nadrzędny o zmianie
      if (onPaymentChange) {
        onPaymentChange();
      }
    } catch (error) {
      showError('Błąd podczas zapisywania płatności: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePayment = (payment) => {
    setPaymentToDelete(payment);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    try {
      setLoading(true);
      await removePaymentFromInvoice(invoice.id, paymentToDelete.id, currentUser.uid);
      await loadPayments();
      showSuccess('Płatność została usunięta');
      
      // Powiadom komponent nadrzędny o zmianie
      if (onPaymentChange) {
        onPaymentChange();
      }
    } catch (error) {
      showError('Błąd podczas usuwania płatności: ' + error.message);
    } finally {
      setLoading(false);
      setDeleteConfirmOpen(false);
      setPaymentToDelete(null);
    }
  };

  const getTotalPaid = () => {
    return payments.reduce((sum, payment) => sum + payment.amount, 0);
  };

  const getTotalAdvancePayments = () => {
    // Nowy system - suma z proformAllocation
    if (invoice.proformAllocation && invoice.proformAllocation.length > 0) {
      return invoice.proformAllocation.reduce((sum, allocation) => sum + (allocation.amount || 0), 0);
    }
    
    // Stary system - settledAdvancePayments
    return parseFloat(invoice.settledAdvancePayments || 0);
  };

  const getRemainingAmount = () => {
    const total = parseFloat(invoice.total || 0);
    const paid = getTotalPaid();
    const advancePayments = getTotalAdvancePayments();
    return Math.max(0, total - paid - advancePayments);
  };

  const getPaymentStatusChip = () => {
    const totalPaid = getTotalPaid();
    const advancePayments = getTotalAdvancePayments();
    const invoiceTotal = parseFloat(invoice.total || 0);
    const totalSettled = totalPaid + advancePayments;
    
    if (totalSettled >= invoiceTotal) {
      return <Chip label="Opłacona" color="success" size="small" />;
    } else if (totalSettled > 0) {
      return <Chip label="Częściowo opłacona" color="warning" size="small" />;
    } else {
      return <Chip label="Nieopłacona" color="error" size="small" />;
    }
  };

  if (!invoice) {
    return null;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PaymentIcon />
          Płatności
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          size="small"
        >
          Dodaj płatność
        </Button>
      </Box>

      {/* Podsumowanie płatności */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Wartość faktury
            </Typography>
            <Typography variant="h6">
              {formatCurrency(invoice.total, invoice.currency)}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Zapłacono
            </Typography>
            <Typography variant="h6" color="success.main">
              {formatCurrency(getTotalPaid(), invoice.currency)}
            </Typography>
          </Paper>
        </Grid>
        {getTotalAdvancePayments() > 0 && (
          <Grid item xs={12} md={3}>
            <Paper sx={{ p: 2, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">
                Przedpłaty z proform
              </Typography>
              <Typography variant="h6" color="warning.main">
                {formatCurrency(getTotalAdvancePayments(), invoice.currency)}
              </Typography>
            </Paper>
          </Grid>
        )}
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Do zapłaty
            </Typography>
            <Typography variant="h6" color="error.main">
              {formatCurrency(getRemainingAmount(), invoice.currency)}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center' }}>
            <Typography variant="body2" color="text.secondary">
              Status
            </Typography>
            <Box sx={{ mt: 1 }}>
              {getPaymentStatusChip()}
            </Box>
          </Paper>
        </Grid>
      </Grid>

      {/* Tabela płatności */}
      {payments.length > 0 ? (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Data</TableCell>
                <TableCell>Kwota</TableCell>
                <TableCell>Metoda</TableCell>
                <TableCell>Opis</TableCell>
                <TableCell>Referenza</TableCell>
                <TableCell align="right">Akcje</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    {payment.date ? format(new Date(payment.date), 'dd.MM.yyyy') : '-'}
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {formatCurrency(payment.amount, invoice.currency)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    {paymentMethods.find(m => m.value === payment.method)?.label || payment.method}
                  </TableCell>
                  <TableCell>{payment.description || '-'}</TableCell>
                  <TableCell>{payment.reference || '-'}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      onClick={() => handleOpenDialog(payment)}
                      title="Edytuj płatność"
                    >
                      <EditIcon fontSize="small" />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDeletePayment(payment)}
                      title="Usuń płatność"
                      color="error"
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Alert severity="info">
          Brak płatności dla tej faktury. Kliknij "Dodaj płatność", aby dodać pierwszą płatność.
        </Alert>
      )}

      {/* Dialog dodawania/edycji płatności */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingPayment ? 'Edytuj płatność' : 'Dodaj płatność'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <Grid container spacing={2}>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Kwota"
                  type="number"
                  value={paymentForm.amount}
                  onChange={(e) => handleFormChange('amount', e.target.value)}
                  inputProps={{ min: 0, step: 0.01 }}
                  required
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <TextField
                  fullWidth
                  label="Data płatności"
                  type="date"
                  value={paymentForm.date}
                  onChange={(e) => handleFormChange('date', e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  required
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  select
                  label="Metoda płatności"
                  value={paymentForm.method}
                  onChange={(e) => handleFormChange('method', e.target.value)}
                >
                  {paymentMethods.map((method) => (
                    <MenuItem key={method.value} value={method.value}>
                      {method.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Opis"
                  value={paymentForm.description}
                  onChange={(e) => handleFormChange('description', e.target.value)}
                  multiline
                  rows={2}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  label="Numer referencyjny"
                  value={paymentForm.reference}
                  onChange={(e) => handleFormChange('reference', e.target.value)}
                  placeholder="np. numer przelewu, numer transakcji"
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Anuluj</Button>
          <Button 
            onClick={handleSavePayment} 
            variant="contained"
            disabled={loading}
          >
            {editingPayment ? 'Zapisz zmiany' : 'Dodaj płatność'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog potwierdzenia usunięcia */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)}>
        <DialogTitle>Potwierdzenie usunięcia</DialogTitle>
        <DialogContent>
          <Typography>
            Czy na pewno chcesz usunąć płatność o kwocie{' '}
            {paymentToDelete && formatCurrency(paymentToDelete.amount, invoice.currency)}?
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConfirmOpen(false)}>Anuluj</Button>
          <Button 
            onClick={handleConfirmDelete} 
            color="error" 
            variant="contained"
            disabled={loading}
          >
            Usuń
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default PaymentsSection; 