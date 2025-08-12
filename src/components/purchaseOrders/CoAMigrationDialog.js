import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Button,
  Box,
  Typography,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  Divider,
  CircularProgress,
  Alert,
  Chip
} from '@mui/material';
import {
  Assignment as AssignmentIcon,
  Label as LabelIcon,
  PictureAsPdf as PdfIcon,
  Image as ImageIcon,
  Description as DescriptionIcon,
  CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../hooks/useNotification';
import { uploadBatchCertificate } from '../../services/inventory/batchService';

const CoAMigrationDialog = ({ 
  open, 
  onClose, 
  purchaseOrder, 
  relatedBatches,
  onMigrationComplete 
}) => {
  const { t } = useTranslation();
  const { currentUser } = useAuth();
  const { showSuccess, showError } = useNotification();
  
  const [selectedCoAAttachments, setSelectedCoAAttachments] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [migrating, setMigrating] = useState(false);
  const [downloadingFiles, setDownloadingFiles] = useState(false);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedCoAAttachments([]);
      setSelectedBatch('');
    }
  }, [open]);

  const getFileIcon = (contentType) => {
    if (contentType?.startsWith('image/')) {
      return <ImageIcon sx={{ color: 'primary.main' }} />;
    } else if (contentType === 'application/pdf') {
      return <PdfIcon sx={{ color: 'error.main' }} />;
    } else {
      return <DescriptionIcon sx={{ color: 'action.active' }} />;
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleCoAAttachmentToggle = (attachmentId) => {
    setSelectedCoAAttachments(prev => 
      prev.includes(attachmentId)
        ? prev.filter(id => id !== attachmentId)
        : [...prev, attachmentId]
    );
  };

  const downloadFileFromUrl = async (url, fileName) => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const blob = await response.blob();
      
      // Utwórz obiekt File z blob
      return new File([blob], fileName, { type: blob.type });
    } catch (error) {
      console.error('Błąd podczas pobierania pliku:', error);
      throw new Error(`Nie udało się pobrać pliku ${fileName}: ${error.message}`);
    }
  };

  const handleMigration = async () => {
    if (selectedCoAAttachments.length === 0 || !selectedBatch) {
      showError('Wybierz załączniki CoA i partię docelową');
      return;
    }

    setMigrating(true);
    setDownloadingFiles(true);

    try {
      // Znajdź wybrane załączniki
      const attachmentsToMigrate = purchaseOrder.coaAttachments.filter(
        attachment => selectedCoAAttachments.includes(attachment.id)
      );

      let successCount = 0;
      const errors = [];

      for (const attachment of attachmentsToMigrate) {
        try {
          // Pobierz plik z Firebase Storage
          console.log(`Pobieranie pliku: ${attachment.fileName}`);
          const file = await downloadFileFromUrl(attachment.downloadURL, attachment.fileName);
          
          setDownloadingFiles(false);
          
          // Prześlij jako certyfikat partii
          console.log(`Migracja pliku ${attachment.fileName} do partii ${selectedBatch}`);
          await uploadBatchCertificate(file, selectedBatch, currentUser.uid);
          
          successCount++;
          console.log(`✅ Zmigrowano: ${attachment.fileName}`);
        } catch (error) {
          console.error(`❌ Błąd migracji ${attachment.fileName}:`, error);
          errors.push(`${attachment.fileName}: ${error.message}`);
        }
      }

      // Pokaż wyniki
      if (successCount > 0) {
        showSuccess(`Pomyślnie zmigrowano ${successCount} z ${attachmentsToMigrate.length} załączników CoA do certyfikatów partii`);
      }
      
      if (errors.length > 0) {
        showError(`Błędy podczas migracji:\n${errors.join('\n')}`);
      }

      // Jeśli wszystko się udało, zamknij dialog
      if (errors.length === 0) {
        onClose();
        if (onMigrationComplete) {
          onMigrationComplete();
        }
      }

    } catch (error) {
      console.error('Błąd podczas migracji CoA:', error);
      showError(`Błąd podczas migracji: ${error.message}`);
    } finally {
      setMigrating(false);
      setDownloadingFiles(false);
    }
  };

  const coaAttachments = purchaseOrder?.coaAttachments || [];
  const validBatches = relatedBatches?.filter(batch => batch.id && batch.lotNumber) || [];

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { minHeight: '500px' }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center' }}>
          <AssignmentIcon sx={{ mr: 1, color: 'primary.main' }} />
          {t('purchaseOrders.details.coaMigration.title')}
        </Box>
      </DialogTitle>
      
      <DialogContent>
        <Box sx={{ mb: 3 }}>
          <Alert severity="info" sx={{ mb: 2 }}>
            {t('purchaseOrders.details.coaMigration.description')}
          </Alert>
        </Box>

        {coaAttachments.length === 0 ? (
          <Alert severity="warning">
            {t('purchaseOrders.details.coaMigration.noAttachments')}
          </Alert>
        ) : (
          <>
            {/* Sekcja wyboru załączników CoA */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <AssignmentIcon sx={{ mr: 1, color: 'success.main' }} />
                {t('purchaseOrders.details.coaMigration.selectAttachments')} ({coaAttachments.length})
              </Typography>
              
              <List sx={{ bgcolor: 'background.paper', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                {coaAttachments.map((attachment, index) => (
                  <React.Fragment key={attachment.id}>
                    <ListItem
                      dense
                      button
                      onClick={() => handleCoAAttachmentToggle(attachment.id)}
                      sx={{
                        '&:hover': { bgcolor: 'action.hover' }
                      }}
                    >
                      <ListItemIcon>
                        <Checkbox
                          edge="start"
                          checked={selectedCoAAttachments.includes(attachment.id)}
                          tabIndex={-1}
                          disableRipple
                        />
                      </ListItemIcon>
                      <ListItemIcon sx={{ minWidth: 40 }}>
                        {getFileIcon(attachment.contentType)}
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Typography variant="body2" fontWeight="medium">
                            {attachment.fileName}
                          </Typography>
                        }
                        secondary={
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                            <Chip 
                              label={formatFileSize(attachment.size)} 
                              size="small" 
                              variant="outlined"
                            />
                            <Typography variant="caption" color="text.secondary">
                              {new Date(attachment.uploadedAt).toLocaleDateString('pl-PL')}
                            </Typography>
                          </Box>
                        }
                      />
                    </ListItem>
                    {index < coaAttachments.length - 1 && <Divider />}
                  </React.Fragment>
                ))}
              </List>
            </Box>

            {/* Sekcja wyboru partii */}
            <Box sx={{ mb: 3 }}>
              <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
                <LabelIcon sx={{ mr: 1, color: 'info.main' }} />
                {t('purchaseOrders.details.coaMigration.selectBatch')}
              </Typography>
              
              {validBatches.length === 0 ? (
                <Alert severity="warning">
                  {t('purchaseOrders.details.coaMigration.noBatches')}
                </Alert>
              ) : (
                <FormControl fullWidth>
                  <InputLabel>{t('purchaseOrders.details.coaMigration.selectBatch')}</InputLabel>
                  <Select
                    value={selectedBatch}
                    onChange={(e) => setSelectedBatch(e.target.value)}
                    label={t('purchaseOrders.details.coaMigration.selectBatch')}
                  >
                    {validBatches.map((batch) => (
                      <MenuItem key={batch.id} value={batch.id}>
                        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                          <Typography variant="body2" fontWeight="medium">
                            LOT: {batch.lotNumber || batch.batchNumber || 'Brak numeru'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {batch.itemName} • {batch.quantity} {batch.unit || 'szt.'} 
                            {batch.warehouseName && ` • ${batch.warehouseName}`}
                          </Typography>
                        </Box>
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              )}
            </Box>

            {/* Podsumowanie */}
            {selectedCoAAttachments.length > 0 && selectedBatch && (
              <Box sx={{ p: 2, bgcolor: 'primary.50', borderRadius: 1, border: 1, borderColor: 'primary.200' }}>
                <Typography variant="body2" gutterBottom>
                  <strong>{t('purchaseOrders.details.coaMigration.summary')}:</strong>
                </Typography>
                <Typography variant="body2">
                  • {t('purchaseOrders.details.coaMigration.attachmentsToMigrate', { count: selectedCoAAttachments.length })}
                </Typography>
                <Typography variant="body2">
                  • {t('purchaseOrders.details.coaMigration.targetBatch', { batch: validBatches.find(b => b.id === selectedBatch)?.lotNumber || 'Nieznana' })}
                </Typography>
              </Box>
            )}
          </>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button 
          onClick={onClose}
          disabled={migrating}
        >
          {t('common.cancel')}
        </Button>
        <Button 
          onClick={handleMigration}
          variant="contained"
          disabled={
            migrating || 
            selectedCoAAttachments.length === 0 || 
            !selectedBatch ||
            coaAttachments.length === 0 ||
            validBatches.length === 0
          }
          startIcon={migrating ? <CircularProgress size={16} /> : <CheckCircleIcon />}
        >
          {migrating 
            ? downloadingFiles 
              ? t('purchaseOrders.details.coaMigration.downloadingFiles')
              : t('purchaseOrders.details.coaMigration.migrating')
            : t('purchaseOrders.details.coaMigration.migrateToBatch')
          }
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default CoAMigrationDialog;
