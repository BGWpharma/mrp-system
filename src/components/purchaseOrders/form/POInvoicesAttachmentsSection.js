import React, { memo } from 'react';
import {
  Grid,
  Typography,
  Box,
  Paper,
  TableContainer,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell
} from '@mui/material';
import PurchaseOrderCategorizedFileUpload from '../PurchaseOrderCategorizedFileUpload';
import { mb2 } from '../../../styles/muiCommonStyles';

const POInvoicesAttachmentsSection = memo(({
  poData,
  currentOrderId,
  handleCategorizedAttachmentsChange,
  saving,
  t
}) => {
  return (
    <Grid container spacing={3}>
      {poData.invoiceLinks && poData.invoiceLinks.length > 0 && (
        <Grid item xs={12}>
          <Box sx={mb2}>
            <Typography variant="subtitle1">{t('purchaseOrders.form.invoices.title')}</Typography>
          </Box>

          <TableContainer component={Paper} sx={mb2}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{t('purchaseOrders.form.invoices.description')}</TableCell>
                  <TableCell>{t('purchaseOrders.form.invoices.link')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {poData.invoiceLinks.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell>
                      <Typography variant="body2">{invoice.description || '-'}</Typography>
                    </TableCell>
                    <TableCell>
                      {invoice.url ? (
                        <a 
                          href={invoice.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          style={{ color: 'inherit' }}
                        >
                          {invoice.url}
                        </a>
                      ) : (
                        <Typography variant="body2" color="text.secondary">-</Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          <input
            type="hidden"
            name="invoiceLink"
            value={poData.invoiceLink || ''}
          />
        </Grid>
      )}

      <Grid item xs={12}>
        <Typography variant="subtitle1" gutterBottom>
          {t('purchaseOrders.form.attachments')}
        </Typography>
        <PurchaseOrderCategorizedFileUpload
          orderId={currentOrderId || 'temp'}
          coaAttachments={poData.coaAttachments || []}
          invoiceAttachments={poData.invoiceAttachments || []}
          generalAttachments={poData.generalAttachments || []}
          onAttachmentsChange={handleCategorizedAttachmentsChange}
          disabled={saving}
        />
      </Grid>
    </Grid>
  );
});

POInvoicesAttachmentsSection.displayName = 'POInvoicesAttachmentsSection';

export default POInvoicesAttachmentsSection;
