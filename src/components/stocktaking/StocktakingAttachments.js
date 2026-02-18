import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  IconButton,
  Paper,
  LinearProgress,
  Alert,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  Card,
  CardMedia,
  CardContent,
  CardActions
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  AttachFile as AttachFileIcon,
  Description as DescriptionIcon,
  Image as ImageIcon,
  PictureAsPdf as PdfIcon,
  Edit as EditIcon,
  Visibility as VisibilityIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import { 
  uploadStocktakingAttachment, 
  deleteStocktakingAttachment 
} from '../../services/inventory';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';

const StocktakingAttachments = ({ 
  stocktakingId, 
  attachments = [], 
  onAttachmentsChange, 
  disabled = false,
  viewOnly = false 
}) => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation('stocktaking');
  
  const [uploading, setUploading] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAttachment, setEditingAttachment] = useState(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);

  // Dozwolone typy plików
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  // Maksymalny rozmiar pliku (20 MB)
  const maxFileSize = 20 * 1024 * 1024;

  const validateFile = (file) => {
    if (!allowedTypes.includes(file.type)) {
      throw new Error(t('stocktaking.attachments.unsupportedFileType'));
    }
    if (file.size > maxFileSize) {
      throw new Error(t('stocktaking.attachments.fileTooLarge'));
    }
  };

  const handleFileSelect = async (event) => {
    const files = Array.from(event.target.files);
    if (!files || files.length === 0) return;

    setUploading(true);
    const newAttachments = [...attachments];

    try {
      for (const file of files) {
        try {
          validateFile(file);
          const uploadedFile = await uploadStocktakingAttachment(file, stocktakingId, currentUser.uid);
          newAttachments.push(uploadedFile);
          showSuccess(t('stocktaking.attachments.uploadSuccess', { name: file.name }));
        } catch (error) {
          showError(t('stocktaking.attachments.uploadError', { name: file.name, error: error.message }));
        }
      }
      onAttachmentsChange(newAttachments);
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  const handleDeleteFile = async (attachment) => {
    try {
      await deleteStocktakingAttachment(attachment);
      const updatedAttachments = attachments.filter(a => a.id !== attachment.id);
      onAttachmentsChange(updatedAttachments);
      showSuccess(t('stocktaking.attachments.deleteSuccess', { name: attachment.fileName }));
    } catch (error) {
      showError(t('stocktaking.attachments.deleteError', { error: error.message }));
    }
  };

  const handleDownloadFile = (attachment) => {
    window.open(attachment.downloadURL, '_blank');
  };

  const handleEditDescription = (attachment) => {
    setEditingAttachment({ ...attachment });
    setEditDialogOpen(true);
  };

  const handleSaveDescription = () => {
    const updatedAttachments = attachments.map(a => 
      a.id === editingAttachment.id 
        ? { ...a, description: editingAttachment.description }
        : a
    );
    onAttachmentsChange(updatedAttachments);
    setEditDialogOpen(false);
    setEditingAttachment(null);
    showSuccess(t('stocktaking.attachments.descriptionSaved'));
  };

  const handlePreviewFile = (attachment) => {
    setPreviewAttachment(attachment);
    setPreviewDialogOpen(true);
  };

  const getFileIcon = (contentType) => {
    if (contentType?.startsWith('image/')) return <ImageIcon />;
    if (contentType === 'application/pdf') return <PdfIcon />;
    return <DescriptionIcon />;
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isImage = (contentType) => contentType?.startsWith('image/');

  return (
    <Box>
      <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
        <AttachFileIcon sx={{ mr: 1, fontSize: 20 }} />
        {t('stocktaking.attachments.title')} ({attachments.length})
      </Typography>

      {/* Kompaktowy obszar do przesyłania plików */}
      {!viewOnly && (
        <Box
          sx={{
            p: 1.5,
            border: '1px dashed',
            borderColor: 'grey.500',
            borderRadius: 1,
            backgroundColor: 'background.default',
            mb: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1,
            '&:hover': {
              borderColor: disabled ? 'grey.500' : 'primary.main',
              backgroundColor: disabled ? 'background.default' : 'action.hover'
            }
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CloudUploadIcon sx={{ fontSize: 24, color: disabled ? 'grey.400' : 'primary.main' }} />
            <Box>
              <Typography variant="body2" color={disabled ? 'text.disabled' : 'text.primary'}>
                {uploading ? t('stocktaking.attachments.uploading') : t('stocktaking.attachments.dropzone')}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {t('stocktaking.attachments.supportedFormats')}
              </Typography>
            </Box>
          </Box>
          
          <input
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            style={{ display: 'none' }}
            id="stocktaking-attachment-input"
            type="file"
            multiple
            onChange={handleFileSelect}
            disabled={disabled || uploading}
          />
          <label htmlFor="stocktaking-attachment-input">
            <Button
              variant="contained"
              component="span"
              size="small"
              disabled={disabled || uploading}
              startIcon={<CloudUploadIcon />}
            >
              {t('stocktaking.attachments.selectFiles')}
            </Button>
          </label>
          
          {uploading && <LinearProgress sx={{ width: '100%', mt: 1 }} />}
        </Box>
      )}

      {/* Lista załączników - kompaktowa */}
      {attachments.length > 0 ? (
        <Grid container spacing={1.5}>
          {attachments.map((attachment) => (
            <Grid item xs={6} sm={4} md={3} lg={2} key={attachment.id}>
              <Card sx={{ height: '100%' }}>
                {isImage(attachment.contentType) ? (
                  <CardMedia
                    component="img"
                    height="100"
                    image={attachment.downloadURL}
                    alt={attachment.fileName}
                    sx={{ objectFit: 'cover', cursor: 'pointer' }}
                    onClick={() => handlePreviewFile(attachment)}
                  />
                ) : (
                  <Box 
                    sx={{ 
                      height: 100, 
                      display: 'flex', 
                      flexDirection: 'column',
                      alignItems: 'center', 
                      justifyContent: 'center',
                      bgcolor: 'action.hover',
                      cursor: 'pointer' 
                    }}
                    onClick={() => handlePreviewFile(attachment)}
                  >
                    {getFileIcon(attachment.contentType)}
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                      {attachment.contentType?.split('/')[1]?.toUpperCase() || 'FILE'}
                    </Typography>
                  </Box>
                )}
                
                <CardContent sx={{ p: 1, pb: 0.5 }}>
                  <Typography variant="caption" noWrap title={attachment.fileName} sx={{ fontWeight: 500 }}>
                    {attachment.fileName}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ fontSize: '0.65rem' }}>
                    {formatFileSize(attachment.size)}
                  </Typography>
                </CardContent>
                
                <CardActions sx={{ p: 0.5, pt: 0, justifyContent: 'center' }}>
                  <Tooltip title={t('stocktaking.attachments.preview')}>
                    <IconButton size="small" onClick={() => handlePreviewFile(attachment)} sx={{ p: 0.5 }}>
                      <VisibilityIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={t('stocktaking.attachments.download')}>
                    <IconButton size="small" onClick={() => handleDownloadFile(attachment)} sx={{ p: 0.5 }}>
                      <DownloadIcon sx={{ fontSize: 16 }} />
                    </IconButton>
                  </Tooltip>
                  {!viewOnly && (
                    <>
                      <Tooltip title={t('stocktaking.attachments.editDescription')}>
                        <IconButton size="small" onClick={() => handleEditDescription(attachment)} disabled={disabled} sx={{ p: 0.5 }}>
                          <EditIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={t('stocktaking.attachments.delete')}>
                        <IconButton size="small" color="error" onClick={() => handleDeleteFile(attachment)} disabled={disabled} sx={{ p: 0.5 }}>
                          <DeleteIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      ) : (
        <Alert severity="info" sx={{ py: 0.5 }}>
          {viewOnly 
            ? t('stocktaking.attachments.noAttachmentsViewOnly')
            : t('stocktaking.attachments.noAttachments')
          }
        </Alert>
      )}

      {/* Dialog edycji opisu */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('stocktaking.attachments.editDescriptionTitle')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('stocktaking.attachments.descriptionLabel')}
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={editingAttachment?.description || ''}
            onChange={(e) => setEditingAttachment(prev => ({ ...prev, description: e.target.value }))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>{t('stocktaking.cancel')}</Button>
          <Button onClick={handleSaveDescription} variant="contained">{t('stocktaking.save')}</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog podglądu */}
      <Dialog open={previewDialogOpen} onClose={() => setPreviewDialogOpen(false)} maxWidth="lg" fullWidth>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {previewAttachment?.fileName}
          <IconButton onClick={() => setPreviewDialogOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {previewAttachment && (
            <Box sx={{ textAlign: 'center' }}>
              {isImage(previewAttachment.contentType) ? (
                <img 
                  src={previewAttachment.downloadURL} 
                  alt={previewAttachment.fileName}
                  style={{ maxWidth: '100%', maxHeight: '70vh' }}
                />
              ) : previewAttachment.contentType === 'application/pdf' ? (
                <iframe
                  src={previewAttachment.downloadURL}
                  width="100%"
                  height="600px"
                  style={{ border: 'none' }}
                  title={previewAttachment.fileName}
                />
              ) : (
                <Box sx={{ p: 4 }}>
                  <DescriptionIcon sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    {t('stocktaking.attachments.previewNotAvailable')}
                  </Typography>
                  <Button 
                    variant="contained" 
                    onClick={() => handleDownloadFile(previewAttachment)}
                    startIcon={<DownloadIcon />}
                  >
                    {t('stocktaking.attachments.download')}
                  </Button>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </Box>
  );
};

export default StocktakingAttachments;

