// src/components/sales/co-reports/CashflowTable.js
import React, { useState } from 'react';
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  IconButton,
  Chip,
  Collapse,
  Box,
  Typography,
  Tooltip,
  Button
} from '@mui/material';
import {
  KeyboardArrowDown as ExpandMoreIcon,
  KeyboardArrowUp as ExpandLessIcon,
  Visibility as ViewIcon,
  Warning as WarningIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { formatCurrency } from '../../../utils/formatUtils';
import { useTranslation } from '../../../hooks/useTranslation';
import PaymentTimeline from './PaymentTimeline';
import RemainingPaymentsDialog from './RemainingPaymentsDialog';

/**
 * Komponent tabeli cashflow z listą zamówień
 */
const CashflowTable = ({ data, currency = 'EUR' }) => {
  const { t } = useTranslation('cashflow');
  const navigate = useNavigate();
  
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [orderBy, setOrderBy] = useState('orderDate');
  const [order, setOrder] = useState('desc');
  const [expandedRows, setExpandedRows] = useState(new Set());
  const [remainingDialogOpen, setRemainingDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);

  if (!data || data.length === 0) {
    return (
      <Paper sx={{ p: 3, textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          {t('cashflow.table.noOrders')}
        </Typography>
      </Paper>
    );
  }

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handleExpandRow = (orderId) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
    }
    setExpandedRows(newExpanded);
  };

  const handleViewOrder = (orderId) => {
    navigate(`/orders/${orderId}`);
  };

  const handleOpenRemainingDialog = (orderData) => {
    setSelectedOrder(orderData);
    setRemainingDialogOpen(true);
  };

  const handleCloseRemainingDialog = () => {
    setRemainingDialogOpen(false);
    setSelectedOrder(null);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid':
        return 'success';
      case 'partially_paid':
        return 'warning';
      case 'pending':
        return 'info';
      case 'not_invoiced':
        return 'default';
      default:
        return 'default';
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
  };

  // Sortowanie danych
  const sortedData = [...data].sort((a, b) => {
    let aValue = a[orderBy];
    let bValue = b[orderBy];

    // Specjalne traktowanie dla dat
    if (orderBy === 'orderDate' || orderBy === 'nextPaymentDate') {
      aValue = aValue ? new Date(aValue).getTime() : 0;
      bValue = bValue ? new Date(bValue).getTime() : 0;
    }

    if (order === 'asc') {
      return aValue > bValue ? 1 : -1;
    } else {
      return aValue < bValue ? 1 : -1;
    }
  });

  // Paginacja
  const paginatedData = sortedData.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  const headCells = [
    { id: 'expand', label: '', sortable: false, width: '50px' },
    { id: 'orderNumber', label: t('cashflow.table.orderNumber'), sortable: true },
    { id: 'orderDate', label: t('cashflow.table.orderDate'), sortable: true },
    { id: 'customer', label: t('cashflow.table.customer'), sortable: true },
    { id: 'orderValue', label: t('cashflow.table.orderValue'), sortable: true, align: 'right' },
    { id: 'proformas', label: t('cashflow.table.proformas'), sortable: false, align: 'center' },
    { id: 'invoices', label: t('cashflow.table.invoices'), sortable: false, align: 'center' },
    { id: 'totalPaid', label: t('cashflow.table.paid'), sortable: true, align: 'right' },
    { id: 'totalRemaining', label: t('cashflow.table.remaining'), sortable: true, align: 'right' },
    { id: 'paymentStatus', label: t('cashflow.table.status'), sortable: true, align: 'center' },
    { id: 'nextPaymentDate', label: t('cashflow.table.nextPayment'), sortable: true },
    { id: 'actions', label: t('cashflow.table.actions'), sortable: false, align: 'center' }
  ];

  return (
    <Paper sx={{ width: '100%', mb: 2 }}>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              {headCells.map((headCell) => (
                <TableCell
                  key={headCell.id}
                  align={headCell.align || 'left'}
                  style={{ width: headCell.width }}
                  sx={{ fontWeight: 'bold', bgcolor: 'grey.100' }}
                >
                  {headCell.sortable ? (
                    <TableSortLabel
                      active={orderBy === headCell.id}
                      direction={orderBy === headCell.id ? order : 'asc'}
                      onClick={() => handleRequestSort(headCell.id)}
                    >
                      {headCell.label}
                    </TableSortLabel>
                  ) : (
                    headCell.label
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((row) => {
              const isExpanded = expandedRows.has(row.orderId);
              return (
                <React.Fragment key={row.orderId}>
                  <TableRow hover sx={{ '& > *': { borderBottom: 'unset' } }}>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => handleExpandRow(row.orderId)}
                      >
                        {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="medium">
                        {row.orderNumber}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDate(row.orderDate)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">
                        {row.customer?.name || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" fontWeight="medium">
                        {formatCurrency(row.orderValue, currency)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip 
                        title={`${row.proformas.length} ${t('cashflow.table.count')} - ${formatCurrency(row.totalProforma, currency)}`}
                      >
                        <Chip
                          label={`${row.proformas.length} / ${formatCurrency(row.totalProforma, currency)}`}
                          size="small"
                          color="warning"
                          variant="outlined"
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip 
                        title={`${row.finalInvoices.length} ${t('cashflow.table.count')} - ${formatCurrency(row.totalInvoiced, currency)}`}
                      >
                        <Chip
                          label={`${row.finalInvoices.length} / ${formatCurrency(row.totalInvoiced, currency)}`}
                          size="small"
                          color="info"
                          variant="outlined"
                        />
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="success.main" fontWeight="medium">
                        {formatCurrency(row.totalPaid, currency)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                        {row.hasOverdue && (
                          <Tooltip title={t('cashflow.status.overdue')}>
                            <WarningIcon color="error" fontSize="small" />
                          </Tooltip>
                        )}
                        <Tooltip title={t('cashflow.table.clickForDetails')}>
                          <Typography 
                            variant="body2" 
                            color={row.hasOverdue ? 'error.main' : 'warning.main'}
                            fontWeight="medium"
                            sx={{ 
                              cursor: row.totalRemaining > 0 ? 'pointer' : 'default',
                              textDecoration: row.totalRemaining > 0 ? 'underline' : 'none',
                              '&:hover': row.totalRemaining > 0 ? { 
                                opacity: 0.7 
                              } : {}
                            }}
                            onClick={() => row.totalRemaining > 0 && handleOpenRemainingDialog(row)}
                          >
                            {formatCurrency(row.totalRemaining, currency)}
                          </Typography>
                        </Tooltip>
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={t(`cashflow.status.${row.paymentStatus}`)}
                        size="small"
                        color={getStatusColor(row.paymentStatus)}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color={row.hasOverdue ? 'error.main' : 'text.secondary'}>
                        {formatDate(row.nextPaymentDate)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title={t('cashflow.table.viewOrder')}>
                        <IconButton
                          size="small"
                          onClick={() => handleViewOrder(row.orderId)}
                          color="primary"
                        >
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={12}>
                      <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                        <Box sx={{ margin: 1 }}>
                          <PaymentTimeline orderData={row} />
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[5, 10, 25, 50]}
        component="div"
        count={data.length}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={handleChangePage}
        onRowsPerPageChange={handleChangeRowsPerPage}
        labelRowsPerPage="Wierszy na stronę:"
        labelDisplayedRows={({ from, to, count }) => `${from}-${to} z ${count}`}
      />

      {/* Dialog szczegółów pozostałych płatności */}
      <RemainingPaymentsDialog
        open={remainingDialogOpen}
        onClose={handleCloseRemainingDialog}
        orderData={selectedOrder}
        currency={currency}
      />
    </Paper>
  );
};

export default CashflowTable;

