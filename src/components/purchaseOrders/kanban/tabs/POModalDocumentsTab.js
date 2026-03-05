import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  IconButton,
  Grid,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import ImageIcon from '@mui/icons-material/Image';
import DescriptionIcon from '@mui/icons-material/Description';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import LinkIcon from '@mui/icons-material/Link';
import {
  updatePurchaseOrder
} from '../../../../services/purchaseOrders';
import { useNotification } from '../../../../hooks/useNotification';
import { useTranslation } from '../../../../hooks/useTranslation';
import PurchaseOrderCategorizedFileUpload from '../../PurchaseOrderCategorizedFileUpload';

const getFileIcon = (filename) => {
  if (!filename) return <AttachFileIcon />;
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return <PictureAsPdfIcon sx={{ color: '#d32f2f' }} />;
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return <ImageIcon sx={{ color: '#1976d2' }} />;
  return <DescriptionIcon sx={{ color: '#757575' }} />;
};

const POModalDocumentsTab = ({ purchaseOrder, orderId, onRefresh }) => {
  const { t } = useTranslation('purchaseOrders');
  const { showSuccess, showError } = useNotification();
  const [invoiceLinkDialog, setInvoiceLinkDialog] = useState(false);
  const [tempInvoiceLinks, setTempInvoiceLinks] = useState([]);

  const po = purchaseOrder;
  const invoiceAttachments = po?.invoiceAttachments || [];
  const coaAttachments = po?.coaAttachments || [];
  const generalAttachments = po?.generalAttachments || [];
  const invoiceLinks = po?.invoiceLinks || [];

  const handleOpenInvoiceLinkDialog = () => {
    if ((!invoiceLinks || invoiceLinks.length === 0) && po?.invoiceLink) {
      setTempInvoiceLinks([{ id: `invoice-${Date.now()}`, description: t('purchaseOrders.kanban.documents.mainInvoice'), url: po.invoiceLink }]);
    } else {
      setTempInvoiceLinks([...invoiceLinks]);
    }
    setInvoiceLinkDialog(true);
  };

  const handleSaveInvoiceLinks = async () => {
    try {
      await updatePurchaseOrder(orderId, {
        ...po,
        invoiceLink: tempInvoiceLinks.length > 0 ? tempInvoiceLinks[0].url : '',
        invoiceLinks: tempInvoiceLinks
      });
      showSuccess(t('purchaseOrders.kanban.documents.linksUpdated'));
      setInvoiceLinkDialog(false);
      if (onRefresh) onRefresh();
    } catch (err) {
      showError(t('purchaseOrders.kanban.documents.linksSaveError') + ': ' + err.message);
    }
  };

  const handleAddInvoiceLink = () => {
    setTempInvoiceLinks(prev => [...prev, { id: `invoice-${Date.now()}`, description: '', url: '' }]);
  };

  const handleRemoveInvoiceLink = (id) => {
    setTempInvoiceLinks(prev => prev.filter(l => l.id !== id));
  };

  const handleInvoiceLinkChange = (id, field, value) => {
    setTempInvoiceLinks(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const AttachmentSection = ({ title, attachments, emptyText }) => (
    <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>{title}</Typography>
      {attachments.length === 0 ? (
        <Typography variant="body2" color="text.secondary">{emptyText}</Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
          {attachments.map((att, idx) => (
            <Box
              key={att.id || att.name || idx}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                p: 1,
                borderRadius: 1,
                '&:hover': { bgcolor: 'action.hover' }
              }}
            >
              {getFileIcon(att.name || att.fileName)}
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 500 }}>
                  {att.name || att.fileName || t('purchaseOrders.kanban.documents.fileFallback', { index: idx + 1 })}
                </Typography>
                {att.uploadedAt && (
                  <Typography variant="caption" color="text.secondary">
                    {new Date(att.uploadedAt?.seconds ? att.uploadedAt.seconds * 1000 : att.uploadedAt).toLocaleDateString('pl')}
                  </Typography>
                )}
              </Box>
              {att.url && (
                <IconButton size="small" component="a" href={att.url} target="_blank" rel="noopener noreferrer">
                  <OpenInNewIcon fontSize="small" />
                </IconButton>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Paper>
  );

  return (
    <Box sx={{ p: 3 }}>
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <AttachmentSection
            title={t('purchaseOrders.kanban.documents.invoicesTitle', { count: invoiceAttachments.length })}
            attachments={invoiceAttachments}
            emptyText={t('purchaseOrders.kanban.documents.noInvoiceAttachments')}
          />

          <AttachmentSection
            title={t('purchaseOrders.kanban.documents.coaTitle', { count: coaAttachments.length })}
            attachments={coaAttachments}
            emptyText={t('purchaseOrders.kanban.documents.noCoaAttachments')}
          />

          <AttachmentSection
            title={t('purchaseOrders.kanban.documents.generalTitle', { count: generalAttachments.length })}
            attachments={generalAttachments}
            emptyText={t('purchaseOrders.kanban.documents.noGeneralAttachments')}
          />
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                {t('purchaseOrders.kanban.documents.invoiceLinksTitle', { count: invoiceLinks.length })}
              </Typography>
              <Button
                size="small"
                startIcon={<LinkIcon />}
                onClick={handleOpenInvoiceLinkDialog}
                sx={{ textTransform: 'none' }}
              >
                {t('purchaseOrders.kanban.documents.manage')}
              </Button>
            </Box>
            {invoiceLinks.length === 0 && !po?.invoiceLink ? (
              <Typography variant="body2" color="text.secondary">{t('purchaseOrders.kanban.documents.noInvoiceLinks')}</Typography>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                {invoiceLinks.map((link, idx) => (
                  <Box key={link.id || idx} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <LinkIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
                    <Typography
                      variant="body2"
                      component="a"
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ color: 'primary.main', flex: 1 }}
                    >
                      {link.description || link.url}
                    </Typography>
                  </Box>
                ))}
                {!invoiceLinks.length && po?.invoiceLink && (
                  <Typography
                    variant="body2"
                    component="a"
                    href={po.invoiceLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    sx={{ color: 'primary.main' }}
                  >
                    {t('purchaseOrders.kanban.documents.invoice')}
                  </Typography>
                )}
              </Box>
            )}
          </Paper>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1.5 }}>
              {t('purchaseOrders.kanban.documents.addDocuments')}
            </Typography>
            <PurchaseOrderCategorizedFileUpload
              purchaseOrderId={orderId}
              purchaseOrder={po}
              onUploadComplete={() => { if (onRefresh) onRefresh(); }}
            />
          </Paper>
        </Grid>
      </Grid>

      {/* Dialog zarządzania linkami do faktur */}
      <Dialog open={invoiceLinkDialog} onClose={() => setInvoiceLinkDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('purchaseOrders.kanban.documents.manageInvoiceLinks')}</DialogTitle>
        <DialogContent>
          {tempInvoiceLinks.map((link, idx) => (
            <Box key={link.id} sx={{ display: 'flex', gap: 1, mb: 1.5, alignItems: 'flex-start' }}>
              <TextField
                size="small"
                label={t('purchaseOrders.kanban.documents.description')}
                value={link.description}
                onChange={(e) => handleInvoiceLinkChange(link.id, 'description', e.target.value)}
                sx={{ width: '35%' }}
              />
              <TextField
                size="small"
                label="URL"
                value={link.url}
                onChange={(e) => handleInvoiceLinkChange(link.id, 'url', e.target.value)}
                sx={{ flex: 1 }}
              />
              <IconButton size="small" onClick={() => handleRemoveInvoiceLink(link.id)} color="error">
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          ))}
          <Button startIcon={<AddIcon />} onClick={handleAddInvoiceLink} size="small" sx={{ mt: 1 }}>
            {t('purchaseOrders.kanban.documents.addLink')}
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setInvoiceLinkDialog(false)}>{t('purchaseOrders.form.actions.cancel')}</Button>
          <Button onClick={handleSaveInvoiceLinks} variant="contained">{t('purchaseOrders.form.actions.save')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default POModalDocumentsTab;
