import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  IconButton,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Paper,
  LinearProgress,
  Chip,
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
  PhotoCamera as PhotoCameraIcon
} from '@mui/icons-material';
import { uploadRecipeDesignAttachment, deleteRecipeDesignAttachment } from '../../services/recipeService';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import FileOrCameraInput from '../common/FileOrCameraInput';

const RecipeDesignAttachments = ({ 
  recipeId, 
  attachments = [], 
  onAttachmentsChange, 
  disabled = false,
  showTitle = true,
  viewOnly = false
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

  // Dozwolone typy plików
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/bmp',
    'image/tiff',
    'image/svg+xml',
    'application/pdf'
  ];

  // Maksymalny rozmiar pliku (20 MB)
  const maxFileSize = 20 * 1024 * 1024;

  // Funkcja do sprawdzania typu pliku
  const validateFile = (file) => {
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Nieobsługiwany typ pliku: ${file.type}. Dozwolone są obrazy (JPG, PNG, GIF, WebP, BMP, TIFF, SVG) i dokumenty PDF.`);
    }
    if (file.size > maxFileSize) {
      throw new Error(`Plik jest zbyt duży (${(file.size / 1024 / 1024).toFixed(2)} MB). Maksymalny rozmiar to 20 MB.`);
    }
  };

  // Funkcja do przesyłania pliku
  const uploadFile = async (file) => {
    try {
      validateFile(file);
      const uploadedFile = await uploadRecipeDesignAttachment(file, recipeId, currentUser.uid);
      return uploadedFile;
    } catch (error) {
      console.error('Błąd podczas przesyłania pliku:', error);
      throw error;
    }
  };

  // Funkcja do obsługi wyboru plików
  const handleFileSelect = async (files) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    const newAttachments = [...attachments];

    try {
      for (const file of files) {
        try {
          const uploadedFile = await uploadFile(file);
          newAttachments.push(uploadedFile);
          showSuccess(`Design "${file.name}" został przesłany pomyślnie`);
        } catch (error) {
          showError(`Błąd podczas przesyłania pliku "${file.name}": ${error.message}`);
        }
      }

      onAttachmentsChange(newAttachments);
    } finally {
      setUploading(false);
    }
  };

  // Funkcja do usuwania pliku
  const handleDeleteFile = async (attachment) => {
    try {
      await deleteRecipeDesignAttachment(attachment);
      
      const updatedAttachments = attachments.filter(a => a.id !== attachment.id);
      onAttachmentsChange(updatedAttachments);
      showSuccess(`Design "${attachment.fileName}" został usunięty`);
    } catch (error) {
      console.error('Błąd podczas usuwania pliku:', error);
      showError(`Błąd podczas usuwania pliku: ${error.message}`);
    }
  };

  // Funkcja do pobierania pliku
  const handleDownloadFile = (attachment) => {
    window.open(attachment.downloadURL, '_blank');
  };

  // Funkcja do edycji opisu załącznika
  const handleEditDescription = (attachment) => {
    setEditingAttachment({ ...attachment });
    setEditDialogOpen(true);
  };

  // Funkcja do zapisywania opisu
  const handleSaveDescription = () => {
    const updatedAttachments = attachments.map(a => 
      a.id === editingAttachment.id 
        ? { ...a, description: editingAttachment.description }
        : a
    );
    onAttachmentsChange(updatedAttachments);
    setEditDialogOpen(false);
    setEditingAttachment(null);
    showSuccess('Opis załącznika został zaktualizowany');
  };

  // Funkcja do podglądu załącznika
  const handlePreviewFile = (attachment) => {
    setPreviewAttachment(attachment);
    setPreviewDialogOpen(true);
  };

  // Funkcja do uzyskania ikony pliku
  const getFileIcon = (contentType) => {
    if (contentType.startsWith('image/')) {
      return <ImageIcon />;
    } else if (contentType === 'application/pdf') {
      return <PdfIcon />;
    } else {
      return <DescriptionIcon />;
    }
  };

  // Funkcja do formatowania rozmiaru pliku
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Funkcja do sprawdzenia czy plik to obraz
  const isImage = (contentType) => {
    return contentType.startsWith('image/');
  };

  return (
    <Box>
      {showTitle && (
        <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
          <PhotoCameraIcon sx={{ mr: 1 }} />
          Załączniki designu produktu ({attachments.length})
        </Typography>
      )}

      {/* Obszar do przesyłania plików - tylko w trybie edycji */}
      {!viewOnly && (
        <Paper
          sx={{
            p: 2,
            border: dragOver ? '2px dashed #1976d2' : '2px dashed #ccc',
            backgroundColor: dragOver ? 'rgba(25, 118, 210, 0.08)' : 'rgba(0, 0, 0, 0.02)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
            mb: 2
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <CloudUploadIcon sx={{ fontSize: 48, color: disabled ? 'grey.400' : 'primary.main', mb: 1 }} />
            <Typography variant="h6" color={disabled ? 'text.disabled' : 'text.primary'} gutterBottom>
              {uploading ? 'Przesyłanie designu...' : 'Dodaj design produktu'}
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Przeciągnij pliki designu tutaj lub wybierz z dysku/aparatu
            </Typography>
            
            <FileOrCameraInput
              onChange={(event) => {
                const files = Array.from(event.target.files);
                handleFileSelect(files);
              }}
              accept="image/*,.pdf,.svg"
              label="Wybierz design lub zrób zdjęcie"
              disabled={disabled || uploading}
            />
            
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Dozwolone: JPG, PNG, GIF, WebP, BMP, TIFF, SVG, PDF (maks. 20 MB)
            </Typography>
          </Box>
          
          {uploading && <LinearProgress sx={{ mt: 2 }} />}
        </Paper>
      )}

      {/* Lista załączonych plików w formie kartek */}
      {attachments.length > 0 && (
        <Grid container spacing={2}>
          {attachments.map((attachment) => (
            <Grid item xs={12} sm={6} md={4} key={attachment.id}>
              <Card>
                {isImage(attachment.contentType) && (
                  <CardMedia
                    component="img"
                    height="200"
                    image={attachment.downloadURL}
                    alt={attachment.fileName}
                    sx={{ objectFit: 'cover', cursor: 'pointer' }}
                    onClick={() => handlePreviewFile(attachment)}
                  />
                )}
                
                <CardContent>
                  <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                    {getFileIcon(attachment.contentType)}
                    <Typography variant="subtitle2" sx={{ ml: 1, flexGrow: 1 }} noWrap>
                      {attachment.fileName}
                    </Typography>
                  </Box>
                  
                  <Typography variant="caption" color="text.secondary" display="block">
                    {formatFileSize(attachment.size)}
                  </Typography>
                  
                  {attachment.description && (
                    <Typography variant="body2" sx={{ mt: 1, fontStyle: 'italic' }}>
                      {attachment.description}
                    </Typography>
                  )}
                  
                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                    Przesłano: {new Date(attachment.uploadedAt).toLocaleDateString('pl-PL')}
                  </Typography>
                </CardContent>
                
                <CardActions>
                  <Tooltip title="Podgląd">
                    <IconButton 
                      size="small" 
                      onClick={() => handlePreviewFile(attachment)}
                    >
                      <VisibilityIcon />
                    </IconButton>
                  </Tooltip>
                  
                  <Tooltip title="Pobierz">
                    <IconButton 
                      size="small" 
                      onClick={() => handleDownloadFile(attachment)}
                    >
                      <DownloadIcon />
                    </IconButton>
                  </Tooltip>
                  
                  {!viewOnly && (
                    <>
                      <Tooltip title="Edytuj opis">
                        <IconButton 
                          size="small" 
                          onClick={() => handleEditDescription(attachment)}
                          disabled={disabled}
                        >
                          <EditIcon />
                        </IconButton>
                      </Tooltip>
                      
                      <Tooltip title="Usuń">
                        <IconButton 
                          size="small" 
                          color="error"
                          onClick={() => handleDeleteFile(attachment)}
                          disabled={disabled}
                        >
                          <DeleteIcon />
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
        <Alert severity="info" sx={{ mt: 2 }}>
          {viewOnly 
            ? "Brak załączników designu dla tej receptury." 
            : "Brak załączników designu. Dodaj pierwszy design produktu powyżej."
          }
        </Alert>
      )}

      {/* Dialog edycji opisu */}
      <Dialog open={editDialogOpen} onClose={() => setEditDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Edytuj opis designu</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Opis designu"
            fullWidth
            multiline
            rows={3}
            variant="outlined"
            value={editingAttachment?.description || ''}
            onChange={(e) => setEditingAttachment(prev => ({ ...prev, description: e.target.value }))}
            placeholder="Dodaj opis tego designu (np. wersja kolorystyczna, wymiary, szczegóły techniczne...)"
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
          <span>Podgląd: {previewAttachment?.fileName}</span>
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
              ) : (
                <Box sx={{ p: 4 }}>
                  <PdfIcon sx={{ fontSize: 64, color: 'grey.400', mb: 2 }} />
                  <Typography variant="h6" gutterBottom>
                    Podgląd PDF niedostępny
                  </Typography>
                  <Button 
                    variant="contained" 
                    onClick={() => handleDownloadFile(previewAttachment)}
                    startIcon={<DownloadIcon />}
                  >
                    Pobierz i otwórz plik
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

export default RecipeDesignAttachments; 