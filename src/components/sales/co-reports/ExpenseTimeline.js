// src/components/sales/co-reports/ExpenseTimeline.js
import React from 'react';
import {
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Box
} from '@mui/material';
import { formatCurrency } from '../../../utils/formatUtils';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';

/**
 * Komponent wyświetlający timeline wydatków z Purchase Orders
 */
const ExpenseTimeline = ({ expenses, currency = 'EUR' }) => {
  if (!expenses || !expenses.expenseTimeline || expenses.expenseTimeline.length === 0) {
    return (
      <Paper sx={{ p: 2, mt: 2 }}>
        <Typography variant="body2" color="text.secondary">
          Brak powiązanych wydatków (PO)
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper sx={{ p: 2, mt: 2 }}>
      <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
        💸 Wydatki (Zamówienia Zakupu)
      </Typography>
      
      <Typography variant="caption" color="text.secondary" sx={{ mb: 2, display: 'block' }}>
        Powiązanych PO: {expenses.linkedPOCount}
      </Typography>

      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 'bold' }}>Data dostawy</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>PO</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Dostawca</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Pozycja</TableCell>
              <TableCell align="right" sx={{ fontWeight: 'bold' }}>Wartość</TableCell>
              <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {expenses.expenseTimeline.map((expense, idx) => (
              <TableRow key={idx} hover>
                <TableCell>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="body2">
                      {expense.date ? format(new Date(expense.date), 'dd.MM.yyyy', { locale: pl }) : '-'}
                    </Typography>
                    {expense.isOverdue && (
                      <Chip 
                        label="Przeterminowane" 
                        size="small" 
                        color="error" 
                        sx={{ height: 20, fontSize: '0.65rem' }}
                      />
                    )}
                  </Box>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" fontWeight="medium">
                    {expense.poNumber}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">
                    {expense.supplier}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2" color="text.secondary">
                    {expense.itemName || 'Całe PO'}
                  </Typography>
                </TableCell>
                <TableCell align="right">
                  <Typography variant="body2" fontWeight="medium" color={expense.isPaid ? 'success.main' : 'error.main'}>
                    {formatCurrency(expense.amount, currency)}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip 
                    label={expense.isPaid ? 'Zapłacone' : 'Niezapłacone'}
                    color={expense.isPaid ? 'success' : 'default'}
                    size="small"
                    sx={{ height: 20, fontSize: '0.7rem' }}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
};

export default ExpenseTimeline;

