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
  Description as DescriptionIcon,
  Image as ImageIcon,
  PictureAsPdf as PdfIcon,
  Edit as EditIcon,
  Visibility as VisibilityIcon,
  Gavel as GavelIcon
} from '@mui/icons-material';
import { uploadRecipeRulesAttachment, deleteRecipeRulesAttachment } from '../../services/recipeService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import FileOrCameraInput from '../common/FileOrCameraInput';

const RecipeRulesAttachments = ({ 
  recipeId, 
  attachments = [], 
  onAttachmentsChange, 
  disabled = false,
  showTitle = true,
  viewOnly = false,
  compact = false
}) => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation();
  
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingAttachment, setEditingAttachment] = useState(null);
  const [previewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState(null);

  // Dozwolone typy plików (PDF głównie dla dokumentów z zasadami)
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];

  const maxFileSize = 20 * 1024 * 1024;

  const validateFile = (file) => {
    if (!allowedTypes.includes(file.type)) {
      throw new Error(t('recipes.rulesAttachments.messages.unsupportedFileType', { type: file.type }));
    }
    if (file.size > maxFileSize) {
      throw new Error(t('recipes.rulesAttachments.messages.fileTooLarge', { size: (file.size / 1024 / 1024).toFixed(2) }));
    }
  };

  const uploadFile = async (file) => {
    try {
      validateFile(file);
      const uploadedFile = await uploadRecipeRulesAttachment(file, recipeId, currentUser.uid);
      return uploadedFile;
    } catch (error) {
      console.error('Błąd podczas przesyłania pliku:', error);
      throw error;
    }
  };

  const handleFileSelect = async (files) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    const newAttachments = [...attachments];

    try {
      for (const file of files) {
        try {
          const uploadedFile = await uploadFile(file);
          newAttachments.push(uploadedFile);
          showSuccess(t('recipes.rulesAttachments.messages.uploadSuccess', { fileName: file.name }));
        } catch (error) {
          showError(t('recipes.rulesAttachments.messages.uploadError', { fileName: file.name, error: error.message }));
        }
      }
      onAttachmentsChange(newAttachments);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (attachment) => {
    try {
      await deleteRecipeRulesAttachment(attachment);
      const updatedAttachments = attachments.filter(a => a.id !== attachment.id);
      onAttachmentsChange(updatedAttachments);
      showSuccess(t('recipes.rulesAttachments.messages.deleteSuccess', { fileName: attachment.fileName }));
    } catch (error) {
      console.error('Błąd podczas usuwania pliku:', error);
      showError(t('recipes.rulesAttachments.messages.deleteError', { error: error.message }));
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
    showSuccess(t('recipes.rulesAttachments.messages.descriptionUpdated'));
  };

  const handlePreviewFile = (attachment) => {
    setPreviewAttachment(attachment);
    setPreviewDialogOpen(true);
  };

  const getFileIcon = (contentType) => {
    if (contentType?.startsWith('image/')) {
      return <ImageIcon />;
    } else if (contentType === 'application/pdf') {
      return <PdfIcon />;
    } else {
      return <DescriptionIcon />;
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isImage = (contentType) => {
    return contentType?.startsWith('image/');
  };

  return (
    <Box>
      {showTitle && (
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
          <GavelIcon sx={{ mr: 1 }} />
          {t('recipes.rulesAttachments.title')} ({attachments.length})
        </Typography>
      )}

      {/* Obszar do przesyłania plików */}
      {!viewOnly && (
        <Paper
          sx={{
            p: compact ? 1.5 : 2,
            border: dragOver ? '2px dashed #1976d2' : '2px dashed #ccc',
            backgroundColor: dragOver ? 'rgba(25, 118, 210, 0.08)' : 'rgba(0, 0, 0, 0.02)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
            mb: compact ? 1.5 : 2
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <CloudUploadIcon sx={{ 
              fontSize: compact ? 32 : 48, 
              color: disabled ? 'grey.400' : 'primary.main', 
              mb: compact ? 0.5 : 1 
            }} />
            <Typography 
              variant={compact ? "subtitle1" : "h6"} 
              color={disabled ? 'text.disabled' : 'text.primary'} 
              gutterBottom
            >
              {uploading ? t('recipes.rulesAttachments.uploading') : t('recipes.rulesAttachments.upload')}
            </Typography>
            {!compact && (
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('recipes.rulesAttachments.description')}
              </Typography>
            )}
            
            <FileOrCameraInput
              onChange={(event) => {
                const files = Array.from(event.target.files);
                handleFileSelect(files);
              }}
              accept=".pdf,.doc,.docx,image/*"
              label={t('recipes.rulesAttachments.selectFile')}
              disabled={disabled || uploading}
              showCamera={false}
              maxWidth="sm"
              maxHeight="60vh"
            />
            
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: compact ? 0.5 : 1 }}>
              {t('recipes.rulesAttachments.supportedFormats')}
            </Typography>
          </Box>
          
          {uploading && <LinearProgress sx={{ mt: compact ? 1 : 2 }} />}
        </Paper>
      )}

      {/* Lista załączonych plików */}
      {attachments.length > 0 && (
        <Grid container spacing={compact ? 1 : 2}>
          {attachments.map((attachment) => (
            <Grid item xs={12} sm={compact ? 4 : 6} md={compact ? 3 : 4} key={attachment.id}>
              <Card sx={{ height: '100%' }}>
                {isImage(attachment.contentType) ? (
                  <CardMedia
                    component="img"
                    height={compact ? "120" : "200"}
                    image={attachment.downloadURL}
                    alt={attachment.fileName}
                    sx={{ objectFit: 'cover', cursor: 'pointer' }}
                    onClick={() => handlePreviewFile(attachment)}
                  />
                ) : attachment.contentType === 'application/pdf' ? (
                  <Box 
                    sx={{ 
                      height: compact ? 120 : 200, 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      bgcolor: 'action.hover',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        bgcolor: 'action.selected',
                        transform: 'scale(1.02)'
                      }
                    }}
                    onClick={() => handlePreviewFile(attachment)}
                  >
                    <Box sx={{ 
                      width: compact ? 50 : 80, 
                      height: compact ? 50 : 80, 
                      bgcolor: 'warning.main', 
                      borderRadius: 2, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      mb: compact ? 1 : 2,
                      boxShadow: 2,
                      transition: 'all 0.3s ease'
                    }}>
                      <Typography variant={compact ? "h6" : "h4"} color="white" fontWeight="bold">
                        PDF
                      </Typography>
                    </Box>
                    <Typography variant={compact ? "caption" : "body2"} color="text.primary" fontWeight="medium" textAlign="center">
                      {t('recipes.rulesAttachments.rulesDocument')}
                    </Typography>
                    {!compact && (
                      <Typography variant="caption" color="text.secondary" textAlign="center">
                        {t('recipes.rulesAttachments.preview')}
                      </Typography>
                    )}
                  </Box>
                ) : (
                  <Box 
                    sx={{ 
                      height: compact ? 120 : 200, 
                      display: 'flex', 
                      flexDirection: 'column', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      bgcolor: 'action.hover',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        bgcolor: 'action.selected',
                        transform: 'scale(1.02)'
                      }
                    }}
                    onClick={() => handlePreviewFile(attachment)}
                  >
                    <Box sx={{ 
                      width: compact ? 50 : 80, 
                      height: compact ? 50 : 80, 
                      bgcolor: 'warning.main', 
                      borderRadius: 2, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      mb: compact ? 1 : 2,
                      boxShadow: 2
                    }}>
                      <GavelIcon sx={{ fontSize: compact ? 24 : 40, color: 'white' }} />
                    </Box>
                    <Typography variant={compact ? "caption" : "body2"} color="text.primary" fontWeight="medium">
                      {t('recipes.rulesAttachments.rulesDocument')}
                    </Typography>
                  </Box>
                )}
                
                <CardContent sx={{ p: compact ? 1 : 2 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: compact ? 0.5 : 1 }}>
                    {getFileIcon(attachment.contentType)}
                    <Typography variant={compact ? "caption" : "subtitle2"} sx={{ ml: 1, flexGrow: 1 }} noWrap>
                      {attachment.fileName}
                    </Typography>
                  </Box>
                  
                  <Typography variant="caption" color="text.secondary" display="block">
                    {formatFileSize(attachment.size)}
                  </Typography>
                  
                  {attachment.description && !compact && (
                    <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                      {attachment.description}
                    </Typography>
                  )}
                  
                  {!compact && (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                      Przesłano: {new Date(attachment.uploadedAt).toLocaleDateString('pl-PL')}
                    </Typography>
                  )}
                </CardContent>
                
                <CardActions sx={{ p: compact ? 0.5 : 1 }}>
                  <Tooltip title={t('recipes.rulesAttachments.preview')}>
                    <IconButton size="small" onClick={() => handlePreviewFile(attachment)}>
                      <VisibilityIcon fontSize={compact ? "small" : "medium"} />
                    </IconButton>
                  </Tooltip>
                  
                  <Tooltip title={t('recipes.rulesAttachments.download')}>
                    <IconButton size="small" onClick={() => handleDownloadFile(attachment)}>
                      <DownloadIcon fontSize={compact ? "small" : "medium"} />
                    </IconButton>
                  </Tooltip>
                  
                  {!viewOnly && (
                    <>
                      <Tooltip title={t('recipes.rulesAttachments.editDescription')}>
                        <IconButton size="small" onClick={() => handleEditDescription(attachment)} disabled={disabled}>
                          <EditIcon fontSize={compact ? "small" : "medium"} />
                        </IconButton>
                      </Tooltip>
                      
                      <Tooltip title={t('recipes.rulesAttachments.delete')}>
                        <IconButton size="small" color="error" onClick={() => handleDeleteFile(attachment)} disabled={disabled}>
                          <DeleteIcon fontSize={compact ? "small" : "medium"} />
                        </IconButton>
                      </Tooltip>
                    </>
                  )}
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {attachments.length === 0 && (
        <Alert severity="info" sx={{ mt: compact ? 1 : 2 }}>
          {viewOnly 
            ? t('recipes.rulesAttachments.noAttachmentsViewOnly') 
            : t('recipes.rulesAttachments.noAttachments')
          }
        </Alert>
      )}

      {/* Dialog edycji opisu */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{t('recipes.rulesAttachments.editDescriptionTitle')}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label={t('recipes.rulesAttachments.descriptionLabel')}
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={editingAttachment?.description || ''}
            onChange={(e) => setEditingAttachment(prev => ({ ...prev, description: e.target.value }))}
            placeholder={t('recipes.rulesAttachments.descriptionPlaceholder')}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialogOpen(false)}>Anuluj</Button>
          <Button onClick={handleSaveDescription} variant="contained">Zapisz</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog podglądu */}
      <Dialog 
        open={previewDialogOpen} 
        onClose={() => setPreviewDialogOpen(false)} 
        maxWidth="lg" 
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{t('recipes.rulesAttachments.previewTitle')}: {previewAttachment?.fileName}</span>
          <IconButton onClick={() => setPreviewDialogOpen(false)}>
            <DeleteIcon />
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
                <Box sx={{ width: '100%', height: '70vh' }}>
                  <iframe
                    src={`${previewAttachment.downloadURL}#toolbar=1&navpanes=1&scrollbar=1`}
                    width="100%"
                    height="100%"
                    style={{ border: 'none', borderRadius: '8px' }}
                    title={previewAttachment.fileName}
                  />
                  <Box sx={{ mt: 2, display: 'flex', gap: 1, justifyContent: 'center' }}>
                    <Button 
                      variant="outlined" 
                      onClick={() => handleDownloadFile(previewAttachment)}
                      startIcon={<DownloadIcon />}
                      size="small"
                    >
                      {t('recipes.rulesAttachments.downloadPdf')}
                    </Button>
                    <Button 
                      variant="outlined" 
                      onClick={() => window.open(previewAttachment.downloadURL, '_blank')}
                      startIcon={<VisibilityIcon />}
                      size="small"
                    >
                      {t('recipes.rulesAttachments.openInNewTab')}
                    </Button>
                  </Box>
                </Box>
              ) : (
                <Box sx={{ p: 4 }}>
                  <DescriptionIcon sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    {t('recipes.rulesAttachments.previewNotAvailable')}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Typ pliku: {previewAttachment.contentType}
                  </Typography>
                  <Button 
                    variant="contained" 
                    onClick={() => handleDownloadFile(previewAttachment)}
                    startIcon={<DownloadIcon />}
                  >
                    {t('recipes.rulesAttachments.downloadAndOpen')}
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

export default RecipeRulesAttachments;

