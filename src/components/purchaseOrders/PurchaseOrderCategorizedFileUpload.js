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
  Tabs,
  Tab,
  Badge
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  Delete as DeleteIcon,
  Download as DownloadIcon,
  AttachFile as AttachFileIcon,
  Description as DescriptionIcon,
  Image as ImageIcon,
  PictureAsPdf as PdfIcon,
  Assignment as AssignmentIcon,
  Receipt as ReceiptIcon,
  FolderOpen as FolderOpenIcon
} from '@mui/icons-material';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../../services/firebase/config';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from 'react-i18next';

const PurchaseOrderCategorizedFileUpload = ({ 
  orderId, 
  coaAttachments = [], 
  invoiceAttachments = [], 
  generalAttachments = [], 
  onAttachmentsChange, 
  disabled = false 
}) => {
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

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

  const maxFileSize = 10 * 1024 * 1024; // 10 MB

  // Funkcja walidacji pliku
  const validateFile = (file) => {
    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Nieobsługiwany typ pliku: ${file.type}`);
    }
    if (file.size > maxFileSize) {
      throw new Error(`Plik jest za duży. Maksymalny rozmiar: ${Math.round(maxFileSize / 1024 / 1024)} MB`);
    }
  };

  // Funkcja do przesyłania pliku
  const uploadFile = async (file, category) => {
    try {
      validateFile(file);

      const timestamp = new Date().getTime();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${timestamp}_${sanitizedFileName}`;
      const storagePath = `purchase-order-attachments/${orderId}/${category}/${fileName}`;

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
        category,
        uploadedAt: new Date().toISOString(),
        uploadedBy: currentUser?.uid
      };
    } catch (error) {
      console.error('Błąd podczas przesyłania pliku:', error);
      throw error;
    }
  };

  // Funkcja do obsługi wyboru plików
  const handleFileSelect = async (files, category) => {
    if (!files || files.length === 0) return;

    setUploading(true);
    const newAttachments = {
      coaAttachments: [...coaAttachments],
      invoiceAttachments: [...invoiceAttachments],
      generalAttachments: [...generalAttachments]
    };

    try {
      for (const file of files) {
        try {
          const uploadedFile = await uploadFile(file, category);
          
          // Dodaj do odpowiedniej kategorii
          switch (category) {
            case 'coa':
              newAttachments.coaAttachments.push(uploadedFile);
              break;
            case 'invoice':
              newAttachments.invoiceAttachments.push(uploadedFile);
              break;
            case 'general':
              newAttachments.generalAttachments.push(uploadedFile);
              break;
          }
          
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
  const handleDeleteFile = async (attachment, category) => {
    try {
      const fileRef = ref(storage, attachment.storagePath);
      await deleteObject(fileRef);

      const newAttachments = {
        coaAttachments: [...coaAttachments],
        invoiceAttachments: [...invoiceAttachments],
        generalAttachments: [...generalAttachments]
      };

      // Usuń z odpowiedniej kategorii
      switch (category) {
        case 'coa':
          newAttachments.coaAttachments = newAttachments.coaAttachments.filter(a => a.id !== attachment.id);
          break;
        case 'invoice':
          newAttachments.invoiceAttachments = newAttachments.invoiceAttachments.filter(a => a.id !== attachment.id);
          break;
        case 'general':
          newAttachments.generalAttachments = newAttachments.generalAttachments.filter(a => a.id !== attachment.id);
          break;
      }

      onAttachmentsChange(newAttachments);
      showSuccess(`Plik "${attachment.fileName}" został usunięty`);
    } catch (error) {
      console.error('Błąd podczas usywania pliku:', error);
      showError(`Błąd podczas usuwania pliku: ${error.message}`);
    }
  };

  // Obsługa drag & drop
  const handleDrop = useCallback((event, category) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);

    if (disabled || uploading) return;

    const files = Array.from(event.dataTransfer.files);
    handleFileSelect(files, category);
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

  // Renderowanie sekcji załączników
  const renderAttachmentSection = (attachments, category, categoryKey) => {
    const getCategoryInfo = () => {
      switch (category) {
        case 'coa':
          return {
            title: t('purchaseOrders.form.coaAttachments.title'),
            description: t('purchaseOrders.form.coaAttachments.description'),
            noAttachmentsText: t('purchaseOrders.form.coaAttachments.noAttachments'),
            icon: <AssignmentIcon />
          };
        case 'invoice':
          return {
            title: t('purchaseOrders.form.invoiceAttachments.title'),
            description: t('purchaseOrders.form.invoiceAttachments.description'),
            noAttachmentsText: t('purchaseOrders.form.invoiceAttachments.noAttachments'),
            icon: <ReceiptIcon />
          };
        case 'general':
          return {
            title: t('purchaseOrders.form.generalAttachments.title'),
            description: t('purchaseOrders.form.generalAttachments.description'),
            noAttachmentsText: t('purchaseOrders.form.generalAttachments.noAttachments'),
            icon: <FolderOpenIcon />
          };
        default:
          return {
            title: 'Załączniki',
            description: '',
            noAttachmentsText: 'Brak załączników',
            icon: <AttachFileIcon />
          };
      }
    };

    const categoryInfo = getCategoryInfo();

    return (
      <Box>
        <Typography variant="subtitle1" gutterBottom sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
          {categoryInfo.icon}
          <Box sx={{ ml: 1 }}>
            {categoryInfo.title}
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
              {categoryInfo.description}
            </Typography>
          </Box>
        </Typography>

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
          onDrop={(e) => handleDrop(e, category)}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={() => {
            if (!disabled && !uploading) {
              document.getElementById(`file-input-${orderId}-${category}`).click();
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
          id={`file-input-${orderId}-${category}`}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.doc,.docx,.xls,.xlsx,.txt,.csv"
          style={{ display: 'none' }}
          onChange={(e) => handleFileSelect(Array.from(e.target.files), category)}
          disabled={disabled || uploading}
        />

        {/* Lista załączonych plików */}
        {attachments.length > 0 ? (
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
                        onClick={() => handleDeleteFile(attachment, category)}
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
        ) : (
          <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic', mt: 1 }}>
            {categoryInfo.noAttachmentsText}
          </Typography>
        )}
      </Box>
    );
  };

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box>
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={activeTab} onChange={handleTabChange} aria-label="attachment categories">
          <Tab 
            label={
              <Badge badgeContent={coaAttachments.length} color="primary">
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <AssignmentIcon sx={{ mr: 1 }} />
                  CoA
                </Box>
              </Badge>
            } 
          />
          <Tab 
            label={
              <Badge badgeContent={invoiceAttachments.length} color="primary">
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <ReceiptIcon sx={{ mr: 1 }} />
                  Faktury
                </Box>
              </Badge>
            } 
          />
          <Tab 
            label={
              <Badge badgeContent={generalAttachments.length} color="primary">
                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                  <FolderOpenIcon sx={{ mr: 1 }} />
                  Załączniki
                </Box>
              </Badge>
            } 
          />
        </Tabs>
      </Box>

      {activeTab === 0 && renderAttachmentSection(coaAttachments, 'coa', 'coaAttachments')}
      {activeTab === 1 && renderAttachmentSection(invoiceAttachments, 'invoice', 'invoiceAttachments')}
      {activeTab === 2 && renderAttachmentSection(generalAttachments, 'general', 'generalAttachments')}
    </Box>
  );
};

export default PurchaseOrderCategorizedFileUpload; 