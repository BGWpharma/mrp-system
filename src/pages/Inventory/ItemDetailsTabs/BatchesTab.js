import React from 'react';
import { Box, Typography, Paper, Table, TableContainer, TableHead, TableRow, TableCell, TableBody, Chip } from '@mui/material';
import { Timestamp } from 'firebase/firestore';

const BatchesTab = ({ t, batches, itemUnit }) => {
  const safeGetDate = (value) => {
    if (!value) return null;
    if (value instanceof Timestamp) return value.toDate();
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  };
  return (
    <>
      <Box sx={{
        p: 2,
        mb: 2,
        borderRadius: 2,
        bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : 'white'
      }}>
        <Typography variant="h6" gutterBottom sx={{ fontWeight: 'bold' }}>
          {t('inventory.itemDetails.tabs.batchesAndExpiry')}
        </Typography>
      </Box>

      {batches.length === 0 ? (
        <Paper elevation={1} sx={{ p: 3, borderRadius: 2, textAlign: 'center', bgcolor: theme => theme.palette.mode === 'dark' ? 'background.paper' : '#f8f9fa' }}>
          <Typography variant="body1">{t('inventory.itemDetails.noBatches')}</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper} sx={{ mt: 2, borderRadius: 2, overflow: 'hidden', elevation: 1 }}>
          <Table sx={{ '& th': { fontWeight: 'bold', bgcolor: theme => theme.palette.mode === 'dark' ? 'background.default' : '#f8f9fa' } }}>
            <TableHead>
              <TableRow>
                <TableCell>{t('inventory.itemDetails.batchNumber')}</TableCell>
                <TableCell>{t('inventory.itemDetails.expiryDate')}</TableCell>
                <TableCell>{t('inventory.itemDetails.quantity')}</TableCell>
                <TableCell>{t('common.status')}</TableCell>
                <TableCell>{t('inventory.itemDetails.location')}</TableCell>
                <TableCell>{t('inventory.itemDetails.receivedDate')}</TableCell>
                <TableCell>{t('common.notes')}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {batches
                .sort((a, b) => {
                  const dateA = safeGetDate(a.expiryDate);
                  const dateB = safeGetDate(b.expiryDate);
                  if (!dateA && !dateB) return 0;
                  if (!dateA) return 1; // partie bez daty na końcu
                  if (!dateB) return -1;
                  return dateA - dateB;
                })
                .map(batch => {
                  const expiryDate = safeGetDate(batch.expiryDate);
                  const receivedDate = safeGetDate(batch.receivedDate);
                  
                  const today = new Date();
                  const twelveMonthsFromNow = new Date();
                  twelveMonthsFromNow.setMonth(today.getMonth() + 12);
                  
                  let status = 'valid';
                  if (expiryDate) {
                    if (expiryDate < today) {
                      status = 'expired';
                    } else if (expiryDate <= twelveMonthsFromNow) {
                      status = 'expiring';
                    }
                  }
                  
                  return (
                    <TableRow 
                      key={batch.id} 
                      hover
                      sx={{
                        bgcolor: theme => 
                          status === 'expired' 
                            ? theme.palette.mode === 'dark' 
                              ? 'rgba(255, 50, 50, 0.15)' 
                              : 'rgba(255, 0, 0, 0.05)'
                            : status === 'expiring'
                              ? theme.palette.mode === 'dark'
                                ? 'rgba(255, 180, 50, 0.15)'
                                : 'rgba(255, 152, 0, 0.05)'
                              : 'inherit'
                      }}
                    >
                      <TableCell sx={{ fontWeight: 'medium' }}>{batch.batchNumber || '-'}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Typography sx={{ fontWeight: 'medium' }}>
                            {expiryDate ? expiryDate.toLocaleDateString('pl-PL') : '-'}
                          </Typography>
                          {expiryDate && status === 'expired' && (
                            <Chip 
                              size="small" 
                              label={t('inventory.itemDetails.expired')} 
                              color="error" 
                              sx={{ ml: 1 }} 
                            />
                          )}
                          {expiryDate && status === 'expiring' && (
                            <Chip 
                              size="small" 
                              label={t('inventory.itemDetails.expiringSoon')} 
                              color="warning" 
                              sx={{ ml: 1 }} 
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center' }}>
                          <Typography sx={{ fontWeight: 'medium' }}>
                            {batch.quantity} {itemUnit}
                          </Typography>
                          {batch.quantity === 0 && (
                            <Chip 
                              size="small" 
                              label={t('inventory.itemDetails.issued')} 
                              color="default" 
                              sx={{ ml: 1 }} 
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell>
                        {status === 'expired' && t('inventory.itemDetails.expired')}
                        {status === 'expiring' && t('inventory.itemDetails.expiringStatus')}
                        {status === 'valid' && batch.quantity > 0 && t('inventory.itemDetails.available')}
                        {batch.quantity <= 0 && t('inventory.itemDetails.issued')}
                      </TableCell>
                      <TableCell>{batch.warehouseName || '-'}</TableCell>
                      <TableCell>{receivedDate ? receivedDate.toLocaleDateString('pl-PL') : '-'}</TableCell>
                      <TableCell>{batch.notes || '-'}</TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </>
  );
};

export default BatchesTab;

