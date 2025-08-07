import React, { useState, useCallback } from 'react';
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
  CircularProgress
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  AttachFile as AttachFileIcon,
  Description as DescriptionIcon,
  Image as ImageIcon,
  PictureAsPdf as PdfIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../../services/firebase/config';
import { useAuth } from '../../hooks/useAuth';
import { updatePurchaseOrderAttachments, validateAndCleanupAttachments } from '../../services/purchaseOrderService';
import { useNotification } from '../../hooks/useNotification';

const PurchaseOrderFileUpload = ({ orderId, attachments = [], onAttachmentsChange, disabled = false }) => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Dozwolone typy plików
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv'
  ];

  // Maksymalny rozmiar pliku (10 MB)
  const maxFileSize = 10 * 1024 * 1024;

  // Funkcja do sprawdzania typu pliku
  const validateFile = (file) => {
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Nieobsługiwany typ pliku: ${file.type}. Dozwolone są dokumenty PDF, obrazy, dokumenty Word/Excel i pliki tekstowe.`);
    }
    if (file.size > maxFileSize) {
      throw new Error(`Plik jest zbyt duży (${(file.size / 1024 / 1024).toFixed(2)} MB). Maksymalny rozmiar to 10 MB.`);
    }
  };

  // Funkcja do przesyłania pliku
  const uploadFile = async (file) => {
    try {
      validateFile(file);

      const timestamp = new Date().getTime();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${timestamp}_${sanitizedFileName}`;
      const storagePath = `purchase-order-attachments/${orderId}/${fileName}`;

      const fileRef = ref(storage, storagePath);
      await uploadBytes(fileRef, file);
      const downloadURL = await getDownloadURL(fileRef);

      return {
        id: `${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
        fileName: file.name,
        storagePath,
        downloadURL,
        contentType: file.type,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser?.uid
      };
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
          showSuccess(`Plik "${file.name}" został przesłany pomyślnie`);
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
      const fileRef = ref(storage, attachment.storagePath);
      await deleteObject(fileRef);

      const updatedAttachments = attachments.filter(a => a.id !== attachment.id);
      onAttachmentsChange(updatedAttachments);

      // NOWE: Natychmiast zapisz zmiany do bazy danych jeśli mamy prawdziwy orderId
      if (orderId && orderId !== 'temp') {
        try {
          // Konwertuj stare załączniki na nowy format kategoryzowany
          const attachmentsUpdate = {
            coaAttachments: [],
            invoiceAttachments: [],
            generalAttachments: updatedAttachments // Stare załączniki trafiają do "general"
          };
          await updatePurchaseOrderAttachments(orderId, attachmentsUpdate, currentUser.uid);
          console.log('✅ Załączniki zaktualizowane w bazie danych');
        } catch (dbError) {
          console.error('❌ Błąd podczas aktualizacji załączników w bazie danych:', dbError);
          showError(`Plik został usunięty, ale wystąpił błąd podczas aktualizacji bazy danych. Odśwież stronę aby zobaczyć aktualne dane.`);
          return;
        }
      }

      showSuccess(`Plik "${attachment.fileName}" został usunięty`);
    } catch (error) {
      console.error('Błąd podczas usywania pliku:', error);
      showError(`Błąd podczas usuwania pliku: ${error.message}`);
    }
  };

  // Funkcja odświeżania załączników z weryfikacją istnienia w Storage (dla starszego komponentu)
  const handleRefreshAttachments = async () => {
    if (refreshing || !orderId || orderId === 'temp') {
      return;
    }

    setRefreshing(true);
    try {
      const result = await validateAndCleanupAttachments(orderId, currentUser.uid);
      
      if (result.success) {
        // Dla starszego komponentu przekazujemy tylko generalAttachments jako główne attachments
        onAttachmentsChange(result.updatedAttachments.attachments || []);
        
        if (result.totalRemoved > 0) {
          showSuccess(result.message);
        } else {
          showSuccess('Wszystkie załączniki są aktualne');
        }
      }
    } catch (error) {
      console.error('Błąd podczas odświeżania załączników:', error);
      showError(`Błąd podczas odświeżania załączników: ${error.message}`);
    } finally {
      setRefreshing(false);
    }
  };

  // Obsługa drag & drop
  const handleDrop = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);

    if (disabled || uploading) return;

    const files = Array.from(event.dataTransfer.files);
    handleFileSelect(files);
  }, [disabled, uploading]);

  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
  }, []);

  // Funkcja do pobierania pliku
  const handleDownloadFile = (attachment) => {
    window.open(attachment.downloadURL, '_blank');
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

  return (
    <Box>
      {/* Obszar do przeciągania plików */}
      <Paper
        sx={{
          p: 1.5,
          border: dragOver ? '2px dashed #1976d2' : '2px dashed #ccc',
          backgroundColor: dragOver ? 'rgba(25, 118, 210, 0.08)' : 'rgba(0, 0, 0, 0.02)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.3s ease',
          mb: 1.5
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => {
          if (!disabled && !uploading) {
            document.getElementById(`file-input-${orderId}`).click();
          }
        }}
      >
        <Box sx={{ textAlign: 'center', py: 0.5 }}>
          <CloudUploadIcon sx={{ fontSize: 24, color: disabled ? 'grey.400' : 'primary.main', mb: 0.5 }} />
          <Typography variant="body2" color={disabled ? 'text.disabled' : 'text.secondary'}>
            {uploading ? 'Przesyłanie...' : 'Przeciągnij pliki lub kliknij'}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
            PDF, obrazy, dokumenty (maks. 10 MB)
          </Typography>
        </Box>
        
        {uploading && <LinearProgress sx={{ mt: 1 }} />}
      </Paper>

      {/* Ukryty input file */}
      <input
        id={`file-input-${orderId}`}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv"
        style={{ display: 'none' }}
        onChange={(e) => handleFileSelect(Array.from(e.target.files))}
        disabled={disabled || uploading}
      />

      {/* Przycisk odświeżania załączników */}
      {orderId && orderId !== 'temp' && attachments.length > 0 && (
        <Box sx={{ mb: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <Tooltip title="Sprawdź istnienie plików w Firebase Storage i usuń nieistniejące załączniki">
            <IconButton
              onClick={handleRefreshAttachments}
              disabled={disabled || refreshing || uploading}
              color="primary"
              size="small"
            >
              {refreshing ? (
                <CircularProgress size={16} />
              ) : (
                <RefreshIcon fontSize="small" />
              )}
            </IconButton>
          </Tooltip>
        </Box>
      )}

      {/* Lista załączonych plików */}
      {attachments.length > 0 && (
        <Box>
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', fontSize: '0.875rem' }}>
            <AttachFileIcon sx={{ mr: 1, fontSize: 18 }} />
            Załączone pliki ({attachments.length})
          </Typography>
          <List dense sx={{ py: 0 }}>
            {attachments.map((attachment) => (
              <ListItem
                key={attachment.id}
                sx={{
                  border: '1px solid #e0e0e0',
                  borderRadius: 1,
                  mb: 0.5,
                  backgroundColor: 'background.paper',
                  py: 0.5
                }}
              >
                <Box sx={{ mr: 1.5 }}>
                  {getFileIcon(attachment.contentType)}
                </Box>
                <ListItemText
                  primary={
                    <Typography variant="body2" noWrap>
                      {attachment.fileName}
                    </Typography>
                  }
                  secondary={
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                      <Chip label={formatFileSize(attachment.size)} size="small" />
                      <Typography variant="caption" color="text.secondary">
                        {new Date(attachment.uploadedAt).toLocaleDateString('pl-PL')}
                      </Typography>
                    </Box>
                  }
                />
                <ListItemSecondaryAction>
                  <Tooltip title="Pobierz">
                    <IconButton
                      size="small"
                      onClick={() => handleDownloadFile(attachment)}
                      sx={{ mr: 0.5 }}
                    >
                      <DownloadIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Usuń">
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteFile(attachment)}
                      color="error"
                      disabled={disabled}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        </Box>
      )}

      {/* Informacja o braku plików */}
      {attachments.length === 0 && !uploading && (
        <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mt: 1 }}>
          Brak załączonych plików
        </Typography>
      )}
    </Box>
  );
};

export default PurchaseOrderFileUpload; 