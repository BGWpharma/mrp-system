import React from 'react';
import { Box, Typography, Paper, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Chip, Button, CircularProgress } from '@mui/material';
import { Link } from 'react-router-dom';
import RefreshIcon from '@mui/icons-material/Refresh';

const AwaitingTab = ({ t, awaitingOrders, awaitingOrdersLoading, fetchAwaitingOrders, itemId }) => {
  return (
    <>
      <Box sx={{
        p: 2,
        mb: 2,
        borderRadius: 2,
        bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'white',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold', mb: 0 }}>
          {t('inventory.itemDetails.awaitingFromPurchaseOrders')}
        </Typography>
        <Button 
          variant="outlined" 
          startIcon={awaitingOrdersLoading ? <CircularProgress size={20} /> : <RefreshIcon />}
          onClick={() => fetchAwaitingOrders(itemId)}
          disabled={awaitingOrdersLoading}
        >
          {t('common.refresh')}
        </Button>
      </Box>

      {awaitingOrdersLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
          <CircularProgress />
        </Box>
      ) : awaitingOrders.length === 0 ? (
        <Paper elevation={1} sx={{ p: 3, borderRadius: 2, textAlign: 'center', bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : '#f8f9fa' }}>
          <Typography variant="body1">{t('inventory.itemDetails.noAwaitingOrders')}</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} sx={{ mt: 2, borderRadius: 2, overflow: 'hidden', elevation: 1 }}>
          <Table sx={{ '& th': { fontWeight: 'bold', bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : '#f8f9fa' } }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('inventory.itemDetails.orderNumber')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell>{t('inventory.itemDetails.ordered')}</TableCell>
                <TableCell>{t('inventory.itemDetails.received')}</TableCell>
                <TableCell>{t('inventory.itemDetails.remaining')}</TableCell>
                <TableCell>{t('inventory.itemDetails.unitPrice')}</TableCell>
                <TableCell>{t('inventory.itemDetails.orderDate')}</TableCell>
                <TableCell>{t('inventory.itemDetails.expectedDelivery')}</TableCell>
                <TableCell>{t('inventory.itemDetails.tempId')}</TableCell>
                <TableCell>{t('common.actions')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {awaitingOrders.map(order => {
                const statusText = (() => {
                  switch(order.status) {
                    case 'pending': return t('inventory.itemDetails.orderStatus.pending');
                    case 'approved': return t('inventory.itemDetails.orderStatus.approved');
                    case 'ordered': return t('inventory.itemDetails.orderStatus.ordered');
                    case 'confirmed': return t('inventory.itemDetails.orderStatus.confirmed');
                    case 'partial': return t('inventory.itemDetails.orderStatus.partial');
                    default: return order.status;
                  }
                })();
                
                const statusColor = (() => {
                  switch(order.status) {
                    case 'pending': return '#757575';
                    case 'approved': return '#ffeb3b';
                    case 'ordered': return '#1976d2';
                    case 'partial': return '#81c784';
                    case 'confirmed': return '#4caf50';
                    default: return '#757575';
                  }
                })();
                
                return order.items.map((orderItem, itemIndex) => {
                  const isOverdue = orderItem.expectedDeliveryDate && new Date(orderItem.expectedDeliveryDate) < new Date();
                  return (
                    <TableRow key={`${order.id}-${itemIndex}`} hover>
                      <TableCell>
                        <Link to={`/purchase-orders/${order.id}`} style={{ textDecoration: 'none', color: 'inherit', fontWeight: 'bold' }}>
                          {order.number || orderItem.poNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={statusText} 
                          size="small"
                          sx={{
                            backgroundColor: statusColor,
                            color: order.status === 'approved' ? 'black' : 'white'
                          }}
                        />
                      </TableCell>
                      <TableCell align="right">
                        {orderItem.quantityOrdered} {orderItem.unit}
                      </TableCell>
                      <TableCell align="right">
                        {orderItem.quantityReceived} {orderItem.unit}
                      </TableCell>
                      <TableCell align="right">
                        <Typography fontWeight="bold" color={orderItem.quantityRemaining > 0 ? 'primary' : 'success'}>
                          {orderItem.quantityRemaining} {orderItem.unit}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {orderItem.unitPrice ? `${Number(orderItem.unitPrice).toFixed(2)} ${orderItem.currency || 'EUR'}` : '-'}
                      </TableCell>
                      <TableCell>
                        {order.orderDate ? new Date(order.orderDate).toLocaleDateString('pl-PL') : '-'}
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          {orderItem.expectedDeliveryDate ? (
                            <>
                              {new Date(orderItem.expectedDeliveryDate).toLocaleDateString('pl-PL')}
                              {isOverdue && (
                                <Chip 
                                  size="small" 
                                  label={t('inventory.itemDetails.overdue')} 
                                  color="error" 
                                  sx={{ ml: 1 }} 
                                />
                              )}
                            </>
                          ) : '-'}
                        </Box>
                      </TableCell>
                      <TableCell>
                        {order.id ? `temp-${order.id.substring(0, 8)}` : '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outlined"
                          size="small"
                          component={Link}
                          to={`/purchase-orders/${order.id}`}
                        >
                          {t('common.details')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                });
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
};

export default AwaitingTab;

