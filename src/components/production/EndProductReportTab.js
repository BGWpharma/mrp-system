import React, { useState, useRef, useCallback, useMemo, memo } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  Button,
  TextField,
  Table,
  TableContainer,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  CircularProgress,
  Chip,
  IconButton,
  Tooltip,
  Autocomplete
} from '@mui/material';
import {
  CloudUpload as CloudUploadIcon,
  AttachFile as AttachFileIcon,
  Download as DownloadIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  PictureAsPdf as PdfIcon
} from '@mui/icons-material';
import { useNotification } from '../../hooks/useNotification';
import { useAuth } from '../../hooks/useAuth';
import { useTranslation } from '../../hooks/useTranslation';
import { formatDateTime } from '../../utils/formatters';
import { generateEndProductReportPDF } from '../../services/endProductReportService';

// Helper function to format quantity with specified precision
const formatQuantityPrecision = (value, precision = 3) => {
  if (value === null || value === undefined || value === '') return '';
  
  const num = parseFloat(value);
  if (isNaN(num)) return '';
  
  // Sprawdź czy liczba ma miejsca dziesiętne
  if (num % 1 === 0) {
    return num.toString(); // Zwróć bez miejsc dziesiętnych jeśli to liczba całkowita
  }
  
  return num.toFixed(precision).replace(/\.?0+$/, ''); // Usuń końcowe zera
};

const EndProductReportTab = ({ 
  task, 
  materials, 
  productionHistory, 
  formResponses, 
  companyData, 
  workstationData, 
  clinicalAttachments, 
  setClinicalAttachments, 
  additionalAttachments, 
  setAdditionalAttachments, 
  ingredientAttachments, 
  selectedAllergens, 
  setSelectedAllergens, 
  availableAllergens,
  onFixRecipeData,
  fixingRecipeData,
  uploadingClinical,
  uploadingAdditional,
  onClinicalFileSelect,
  onAdditionalFileSelect,
  onDownloadClinicalFile,
  onDeleteClinicalFile,
  onDownloadAdditionalFile,
  onDeleteAdditionalFile,
  getClinicalFileIcon,
  formatClinicalFileSize,
  getAdaptiveBackgroundStyle,
  sortIngredientsByQuantity,
  ingredientBatchAttachments
}) => {
  const { showSuccess, showError, showInfo } = useNotification();
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const { currentUser } = useAuth();
  const { t } = useTranslation('taskDetails');

  // Funkcja do obsługi zmiany alergenów
  const handleAllergenChange = (event, newValue) => {
    setSelectedAllergens(newValue);
  };

  // Grupowanie konsumpcji według materiału i numeru partii (LOT)
  const groupedConsumptions = useMemo(() => {
    const grouped = {};
    
    if (!task?.consumedMaterials) return grouped;
    
    task.consumedMaterials.forEach(consumed => {
      // Znajdź materiał w liście materiałów zadania aby pobrać nazwę i jednostkę
      const material = materials.find(m => (m.inventoryItemId || m.id) === consumed.materialId);
      
      // Pobierz nazwę materiału
      const materialName = consumed.materialName || material?.name || t('endProductReport.unknownMaterial');
      
      // Pobierz jednostkę materiału
      const materialUnit = consumed.unit || material?.unit || '-';
      
      // Pobierz numer partii
      let batchNumber = consumed.batchNumber || consumed.lotNumber || '-';
      
      // Jeśli nie ma numeru partii w konsumpcji, spróbuj znaleźć w task.materialBatches
      if (batchNumber === '-' && task.materialBatches && task.materialBatches[consumed.materialId]) {
        const batch = task.materialBatches[consumed.materialId].find(b => b.batchId === consumed.batchId);
        if (batch && batch.batchNumber) {
          batchNumber = batch.batchNumber;
        }
      }
      
      // Pobierz datę ważności - najpierw z konsumpcji, potem spróbuj z partii
      let expiryDate = consumed.expiryDate;
      let formattedExpiryDate = t('endProductReport.notSpecified');
      
      if (expiryDate) {
        const expiry = expiryDate instanceof Date 
          ? expiryDate 
          : expiryDate.toDate 
            ? expiryDate.toDate() 
            : new Date(expiryDate);
        
        formattedExpiryDate = expiry.toLocaleDateString('pl-PL', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      }
      
      // Klucz grupowania: materialId + batchNumber
      const groupKey = `${consumed.materialId}_${batchNumber}`;
      
      if (!grouped[groupKey]) {
        grouped[groupKey] = {
          materialName,
          batchNumber,
          quantity: 0,
          unit: materialUnit,
          expiryDate: formattedExpiryDate,
          hasExpiryDate: !!consumed.expiryDate,
          materialId: consumed.materialId
        };
      }
      
      // Sumuj ilości z tego samego LOTu
      const quantity = parseFloat(consumed.quantity || consumed.consumedQuantity || 0);
      grouped[groupKey].quantity += quantity;
    });
    
    return grouped;
  }, [task?.consumedMaterials, materials, task?.materialBatches]);

  // Funkcja do generowania raportu PDF
  const handleGenerateEndProductReport = async () => {
    if (!task) {
      showError(t('endProductReport.noTaskData'));
      return;
    }

    try {
      setGeneratingPDF(true);
      showInfo(t('endProductReport.generatingPDFInfo'));

      // Przygotowanie załączników w formacie oczekiwanym przez funkcję PDF
      const attachments = [];
      
      // Dodaj załączniki badań klinicznych
      if (clinicalAttachments && clinicalAttachments.length > 0) {
        clinicalAttachments.forEach(attachment => {
          if (attachment.downloadURL && attachment.fileName) {
            const fileExtension = attachment.fileName.split('.').pop().toLowerCase();
            const fileType = ['pdf', 'png', 'jpg', 'jpeg'].includes(fileExtension) ? fileExtension : 'pdf';
            
            attachments.push({
              fileName: attachment.fileName,
              fileType: fileType,
              fileUrl: attachment.downloadURL
            });
          }
        });
      }
      
      // Dodaj załączniki z PO (fizykochemiczne)
      if (ingredientAttachments && Object.keys(ingredientAttachments).length > 0) {
        Object.values(ingredientAttachments).flat().forEach(attachment => {
          if ((attachment.downloadURL || attachment.fileUrl) && attachment.fileName) {
            const fileExtension = attachment.fileName.split('.').pop().toLowerCase();
            const fileType = ['pdf', 'png', 'jpg', 'jpeg'].includes(fileExtension) ? fileExtension : 'pdf';
            
            attachments.push({
              fileName: attachment.fileName,
              fileType: fileType,
              fileUrl: attachment.downloadURL || attachment.fileUrl
            });
          }
        });
      }
      
      // Dodaj dodatkowe załączniki
      if (additionalAttachments && additionalAttachments.length > 0) {
        additionalAttachments.forEach(attachment => {
          if (attachment.downloadURL && attachment.fileName) {
            const fileExtension = attachment.fileName.split('.').pop().toLowerCase();
            const fileType = ['pdf', 'png', 'jpg', 'jpeg'].includes(fileExtension) ? fileExtension : 'pdf';
            
            attachments.push({
              fileName: attachment.fileName,
              fileType: fileType,
              fileUrl: attachment.downloadURL
            });
          }
        });
      }

      // Przygotowanie danych do PDF
      const productData = {
        companyData,
        workstationData,
        productionHistory,
        formResponses,
        clinicalAttachments,
        additionalAttachments,
        ingredientAttachments,
        ingredientBatchAttachments,
        materials, // Dodaję brakujące materiały
        currentUser,
        selectedAllergens,

        // Historia produkcji
        productionHistory: productionHistory || [],
        
        // Skonsumowane materiały
        consumedMaterials: task.consumedMaterials || [],
        
        // Załączniki
        attachments: attachments,
        
        // Alergeny
        allergens: selectedAllergens || [],
        
        // Dane z formularzy
        completedMOReports: formResponses?.completedMO || [],
        productionControlReports: formResponses?.productionControl || [],
        
        // Dane użytkownika
        userName: currentUser?.displayName || currentUser?.email || t('endProductReport.unknownUser')
      };

      // Wywołanie funkcji generowania PDF
      await generateEndProductReportPDF(task, productData);
      
      showSuccess('Raport PDF został wygenerowany i pobrany');
    } catch (error) {
      console.error('Błąd podczas generowania raportu PDF:', error);
      showError('Błąd podczas generowania raportu PDF: ' + error.message);
    } finally {
      setGeneratingPDF(false);
    }
  };

  return (
    <Grid container spacing={3}>
      <Grid item xs={12}>
        <Paper sx={{ p: 3 }}>
          <Box sx={{ mb: 3, textAlign: 'center' }}>
            <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
              {t('endProductReport.title')}
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
              {t('endProductReport.subtitle')}
            </Typography>
            
            {/* Przycisk generowania PDF */}
            <Button
              variant="contained"
              color="primary"
              startIcon={generatingPDF ? <CircularProgress size={20} color="inherit" /> : <PdfIcon />}
              onClick={handleGenerateEndProductReport}
              disabled={generatingPDF}
            >
              {generatingPDF ? t('endProductReport.generatingPDF') : t('endProductReport.generatePDF')}
            </Button>
          </Box>
          
          {/* Product identification */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {t('endProductReport.productIdentification')}
            </Typography>
            
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1 }}>
                    {t('endProductReport.sku')}
                  </Typography>
                  <TextField
                    fullWidth
                    value={task?.recipeName || task?.productName || ''}
                    variant="outlined"
                    size="small"
                    InputProps={{
                      readOnly: true,
                      sx: { backgroundColor: 'action.hover' }
                    }}
                    helperText={t('endProductReport.recipeName')}
                  />
                </Box>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t('endProductReport.description')}
                  value={task?.recipe?.description || task?.description || ''}
                  variant="outlined"
                  multiline
                  maxRows={3}
                  InputProps={{
                    readOnly: true,
                  }}
                  helperText="Opis receptury"
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t('endProductReport.version')}
                  value={task?.recipeVersion || '1'}
                  variant="outlined"
                  InputProps={{
                    readOnly: true,
                  }}
                  helperText="Wersja receptury"
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t('endProductReport.reportCreationDate')}
                  value={new Date().toLocaleDateString('pl-PL', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                  variant="outlined"
                  InputProps={{
                    readOnly: true,
                  }}
                  helperText="Data utworzenia raportu"
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t('endProductReport.user')}
                  value={currentUser?.displayName || currentUser?.email || 'Nieznany użytkownik'}
                  variant="outlined"
                  InputProps={{
                    readOnly: true,
                  }}
                  helperText="Nazwa użytkownika"
                />
              </Grid>
            </Grid>
          </Paper>
          
          {/* TDS Specification */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                {t('endProductReport.sections.tdsSpecification')}
              </Typography>
              <Button
                variant="outlined"
                color="primary"
                size="small"
                startIcon={fixingRecipeData ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                onClick={onFixRecipeData}
                disabled={fixingRecipeData || !task?.recipeId}
              >
                {fixingRecipeData ? 'Odświeżanie...' : 'Odśwież składniki'}
              </Button>
            </Box>
            
            <Grid container spacing={3}>
              {/* Microelements + Nutrition data */}
              <Grid item xs={12}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold' }}>
                    {t('endProductReport.sections.micronutrients')}:
                  </Typography>
                </Box>
                
                {task?.recipe?.micronutrients && task.recipe.micronutrients.length > 0 ? (
                  <TableContainer component={Paper} sx={{ mt: 2 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ backgroundColor: 'action.hover' }}>
                          <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.code')}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.name')}</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 'bold' }}>
                            {t('endProductReport.tableHeaders.quantity')} per {task?.recipe?.nutritionalBasis || '1 caps'}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.unit')}</TableCell>
                          <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.category')}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {task.recipe.micronutrients.map((micronutrient, index) => (
                          <TableRow key={index}>
                            <TableCell sx={{ 
                              fontWeight: 'bold', 
                              color: micronutrient.category === 'Witaminy' ? 'success.main' : 
                                     micronutrient.category === 'Minerały' ? 'info.main' :
                                     micronutrient.category === 'Makroelementy' ? 'primary.main' :
                                     micronutrient.category === 'Energia' ? 'warning.main' :
                                     'text.primary'
                            }}>
                              {micronutrient.code}
                            </TableCell>
                            <TableCell>{micronutrient.name}</TableCell>
                            <TableCell align="right">{micronutrient.quantity}</TableCell>
                            <TableCell>{micronutrient.unit}</TableCell>
                            <TableCell>
                              <Typography variant="body2">
                                {micronutrient.category}
                              </Typography>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                ) : (
                  <Paper sx={{ p: 2, ...getAdaptiveBackgroundStyle('warning', 0.7), border: 1, borderColor: 'warning.main', borderStyle: 'dashed' }}>
                    <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 1 }}>
                      Brak danych o mikroelementach w recepturze
                    </Typography>
                    <Typography variant="caption" color="text.secondary" align="center" display="block">
                      Kliknij przycisk "Odśwież składniki" aby zaktualizować dane receptury i pobrać aktualne składniki odżywcze
                    </Typography>
                  </Paper>
                )}
              </Grid>
              
              {/* Date and Expiration Date */}
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t('endProductReport.date')}
                  value={task?.recipe?.updatedAt 
                    ? (task.recipe.updatedAt && typeof task.recipe.updatedAt === 'object' && typeof task.recipe.updatedAt.toDate === 'function'
                      ? task.recipe.updatedAt.toDate().toLocaleDateString('pl-PL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })
                      : new Date(task.recipe.updatedAt).toLocaleDateString('pl-PL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        }))
                    : 'Brak danych'}
                  variant="outlined"
                  InputProps={{
                    readOnly: true,
                  }}
                  helperText="Ostatnia data aktualizacji receptury"
                />
              </Grid>
              
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label={t('endProductReport.expirationDate')}
                  value={task?.expiryDate 
                    ? (task.expiryDate instanceof Date 
                      ? task.expiryDate.toLocaleDateString('pl-PL', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric'
                        })
                      : typeof task.expiryDate === 'string'
                        ? new Date(task.expiryDate).toLocaleDateString('pl-PL', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric'
                          })
                        : task.expiryDate && task.expiryDate.toDate
                          ? task.expiryDate.toDate().toLocaleDateString('pl-PL', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })
                          : 'Nie określono')
                    : 'Nie określono'}
                  variant="outlined"
                  InputProps={{
                    readOnly: true,
                  }}
                  helperText="Data ważności gotowego produktu"
                />
              </Grid>
            </Grid>
          </Paper>
          
          {/* Active Ingredients */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">
                {t('endProductReport.sections.activeIngredients')}
              </Typography>
              <Button
                variant="outlined"
                color="secondary"
                size="small"
                startIcon={fixingRecipeData ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                onClick={onFixRecipeData}
                disabled={fixingRecipeData || !task?.recipeId}
              >
                {fixingRecipeData ? 'Odświeżanie...' : 'Odśwież składniki'}
              </Button>
            </Box>
            
                        <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', mt: 2 }}>
              {t('endProductReport.sections.materialsList')}
            </Typography>

            <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', color: 'text.secondary' }}>
              {t('endProductReport.sections.ingredients')}:
            </Typography>
            
            {task?.recipe?.ingredients && task.recipe.ingredients.length > 0 ? (
              <TableContainer component={Paper} sx={{ mt: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.ingredientName')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.quantity')}</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.unit')}</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.casNumber')}</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.notes')}</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.batchAttachments')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {sortIngredientsByQuantity(task.recipe.ingredients).map((ingredient, index) => (
                      <TableRow key={index} sx={{ '&:nth-of-type(even)': { backgroundColor: 'action.hover' } }}>
                        <TableCell sx={{ fontWeight: 'medium' }}>
                          {ingredient.name}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'medium' }}>
                          {ingredient.quantity}
                        </TableCell>
                        <TableCell>
                          {ingredient.unit}
                        </TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                          {ingredient.casNumber || '-'}
                        </TableCell>
                        <TableCell sx={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ingredient.notes || '-'}
                        </TableCell>
                        <TableCell sx={{ minWidth: '200px' }}>
                          {ingredientBatchAttachments[ingredient.name] && ingredientBatchAttachments[ingredient.name].length > 0 ? (
                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                              {ingredientBatchAttachments[ingredient.name].map((attachment, attachIndex) => (
                                <Box key={attachIndex} sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                  <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<AttachFileIcon />}
                                    onClick={() => window.open(attachment.downloadURL || attachment.fileUrl, '_blank')}
                                    sx={{ 
                                      textTransform: 'none',
                                      fontSize: '0.75rem',
                                      minWidth: 'auto',
                                      flex: 1,
                                      justifyContent: 'flex-start'
                                    }}
                                  >
                                    {attachment.fileName}
                                  </Button>
                                  <Chip 
                                    size="small" 
                                    label={attachment.source === 'batch_certificate' 
                                      ? `Certyfikat: ${attachment.batchNumber}` 
                                      : `Partia: ${attachment.batchNumber}`}
                                    variant="outlined"
                                    color={attachment.source === 'batch_certificate' ? 'success' : 'secondary'}
                                    sx={{ fontSize: '0.65rem' }}
                                  />
                                </Box>
                              ))}
                            </Box>
                          ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                              Brak załączników
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                
                {/* Podsumowanie składników */}
                <Box sx={{ p: 2, backgroundColor: 'action.hover', borderTop: 1, borderColor: 'divider' }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                    Łączna liczba składników: {task.recipe.ingredients.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Składniki na {task.recipe.yield?.quantity || 1} {task.recipe.yield?.unit || 'szt.'} produktu
                  </Typography>
                </Box>
              </TableContainer>
            ) : (
              <Paper sx={{ p: 2, backgroundColor: 'warning.light', border: 1, borderColor: 'warning.main', borderStyle: 'dashed', opacity: 0.7 }}>
                <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 1 }}>
                  Brak składników w recepturze
                </Typography>
                <Typography variant="caption" color="text.secondary" align="center" display="block">
                  Kliknij przycisk "Odśwież składniki" aby zaktualizować dane receptury i pobrać aktualną listę składników
                </Typography>
              </Paper>
            )}
          </Paper>
          
          {/* 3.2 Expiration date of materials */}
          {task?.consumedMaterials && task.consumedMaterials.length > 0 && (
            <Paper sx={{ p: 3, mb: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                {t('endProductReport.sections.expirationDateMaterials')}
              </Typography>
                
                <TableContainer component={Paper} sx={{ mt: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: 'action.hover' }}>
                        <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.materialName')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.batch')}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.quantity')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.unit')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.expiryDate')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(() => {
                        // Konwertuj zgrupowane dane na wiersze tabeli
                        return Object.values(groupedConsumptions).map((group, index) => (
                          <TableRow key={index} sx={{ '&:nth-of-type(even)': { backgroundColor: 'action.hover' } }}>
                            <TableCell sx={{ fontWeight: 'medium' }}>
                              {group.materialName}
                            </TableCell>
                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.9rem' }}>
                              {group.batchNumber}
                            </TableCell>
                            <TableCell align="right" sx={{ fontWeight: 'medium' }}>
                              {group.quantity % 1 === 0 ? group.quantity.toString() : group.quantity.toFixed(3)}
                            </TableCell>
                            <TableCell>
                              {group.unit}
                            </TableCell>
                            <TableCell sx={{ fontWeight: 'medium' }}>
                              {group.expiryDate}
                            </TableCell>
                          </TableRow>
                        ));
                      })()}
                    </TableBody>
                  </Table>
                  
                  {/* Podsumowanie dat ważności */}
                  <Box sx={{ p: 2, backgroundColor: 'action.hover', borderTop: 1, borderColor: 'divider' }}>
                    {(() => {
                      // Użyj zgrupowanych danych z tabeli
                      const groupedData = groupedConsumptions || {};
                      const totalGroups = Object.keys(groupedData).length;
                      const withExpiryDate = Object.values(groupedData).filter(g => g.hasExpiryDate).length;
                      
                      return (
                        <>
                          <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                            Podsumowanie: {totalGroups} skonsumowanych materiałów
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            • Z datą ważności: {withExpiryDate}<br/>
                            • Użyte partie: {totalGroups}
                          </Typography>
                        </>
                      );
                    })()}
                  </Box>
                </TableContainer>
            </Paper>
          )}

          {/* 3.3 Certificates */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {t('endProductReport.sections.certificates')}
            </Typography>
            
            {/* Sekcja przesyłania plików */}
            <Box sx={{ mb: 3, p: 2, backgroundColor: 'info.light', borderRadius: 1, border: 1, borderColor: 'info.main', borderStyle: 'dashed', opacity: 0.8 }}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                <CloudUploadIcon sx={{ mr: 1 }} />
                {t('endProductReport.sections.addCertificates')}
              </Typography>
              
              <input
                accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.txt"
                style={{ display: 'none' }}
                id="clinical-file-upload"
                multiple
                type="file"
                onChange={(e) => onClinicalFileSelect(Array.from(e.target.files))}
                disabled={uploadingClinical}
              />
              <label htmlFor="clinical-file-upload">
                <Button
                  variant="contained"
                  component="span"
                  startIcon={uploadingClinical ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
                  disabled={uploadingClinical}
                  sx={{ mt: 1 }}
                >
                  {uploadingClinical ? 'Przesyłanie...' : 'Wybierz pliki'}
                </Button>
              </label>
              
              <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                Dozwolone formaty: PDF, JPG, PNG, GIF, DOC, DOCX, TXT (max 10MB na plik)
              </Typography>
            </Box>

            {/* Lista załączników */}
            {clinicalAttachments.length > 0 ? (
              <Box>
                                  <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                  <AttachFileIcon sx={{ mr: 1 }} />
                  {t('endProductReport.sections.attachedCertificates')} ({clinicalAttachments.length})
                </Typography>

                <TableContainer component={Paper} sx={{ mt: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: 'action.hover' }}>
                        <TableCell sx={{ fontWeight: 'bold', width: 60 }}>{t('endProductReport.tableHeaders.type')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.fileName')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 100 }}>{t('endProductReport.tableHeaders.size')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 120 }}>{t('endProductReport.tableHeaders.dateAdded')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 120 }} align="center">{t('endProductReport.tableHeaders.actions')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {clinicalAttachments.map((attachment, index) => (
                        <TableRow key={attachment.id} sx={{ '&:nth-of-type(even)': { backgroundColor: 'action.hover' } }}>
                          <TableCell>
                            {getClinicalFileIcon(attachment.contentType)}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 'medium' }}>
                            {attachment.fileName}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.875rem' }}>
                            {formatClinicalFileSize(attachment.size)}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.875rem' }}>
                            {new Date(attachment.uploadedAt).toLocaleDateString('pl-PL', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })}
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="Pobierz">
                              <IconButton
                                size="small"
                                onClick={() => onDownloadClinicalFile(attachment)}
                                sx={{ mr: 0.5 }}
                              >
                                <DownloadIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Usuń">
                              <IconButton
                                size="small"
                                onClick={() => onDeleteClinicalFile(attachment)}
                                color="error"
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  {/* Podsumowanie załączników */}
                  <Box sx={{ p: 2, backgroundColor: 'action.hover', borderTop: 1, borderColor: 'divider' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      Łączna liczba certyfikatów: {clinicalAttachments.length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Łączny rozmiar: {formatClinicalFileSize(clinicalAttachments.reduce((sum, attachment) => sum + attachment.size, 0))}
                    </Typography>
                  </Box>
                </TableContainer>
              </Box>
            ) : (
              <Paper sx={{ p: 2, backgroundColor: 'warning.light', border: 1, borderColor: 'warning.main', borderStyle: 'dashed', opacity: 0.7 }}>
                <Typography variant="body2" color="text.secondary" align="center">
                  Brak załączonych certyfikatów
                </Typography>
              </Paper>
            )}
          </Paper>

          {/* 4. Physicochemical properties */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {t('endProductReport.sections.physicochemicalProperties')}
            </Typography>
            
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Certyfikaty analiz (CoA) składników z powiązanych zamówień zakupu. Jeśli brak CoA, wyświetlane są załączniki z kompatybilności wstecznej.
            </Typography>

            {/* Wyświetlanie załączników z PO pogrupowanych według składników */}
            {Object.keys(ingredientAttachments).length > 0 ? (
              <Box>
                {Object.entries(ingredientAttachments).map(([ingredientName, attachments]) => (
                  <Paper key={ingredientName} sx={{ p: 2, mb: 2, backgroundColor: 'background.paper', border: 1, borderColor: 'divider' }} elevation={0}>
                    <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      {ingredientName}
                    </Typography>
                    
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {attachments.map((attachment, attachIndex) => (
                        <Box key={attachIndex} sx={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: 2,
                          p: 1.5,
                          backgroundColor: 'action.hover',
                          borderRadius: 1,
                          border: 1,
                          borderColor: 'divider'
                        }}>
                          <Box sx={{ minWidth: 40 }}>
                            {getClinicalFileIcon(attachment.contentType)}
                          </Box>
                          
                          <Box sx={{ flex: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                              {attachment.fileName}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {formatClinicalFileSize(attachment.size)} • 
                              {new Date(attachment.uploadedAt).toLocaleDateString('pl-PL')}
                            </Typography>
                          </Box>
                          
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Chip 
                              size="small" 
                              label={attachment.category || 'CoA'}
                              variant="filled"
                              color={attachment.category === 'CoA' ? 'success' : 'default'}
                              sx={{ fontSize: '0.70rem' }}
                            />
                            <Chip 
                              size="small" 
                              label={`PO: ${attachment.poNumber}`}
                              variant="outlined"
                              color="info"
                              sx={{ fontSize: '0.75rem' }}
                            />
                          </Box>
                          
                          <Box sx={{ display: 'flex', gap: 1 }}>
                            <Tooltip title="Pobierz">
                              <IconButton
                                size="small"
                                onClick={() => window.open(attachment.downloadURL || attachment.fileUrl, '_blank')}
                                sx={{ color: 'primary.main' }}
                              >
                                <DownloadIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </Box>
                      ))}
                    </Box>
                    
                    {/* Podsumowanie dla składnika */}
                    <Box sx={{ mt: 1, p: 1, backgroundColor: 'success.light', borderRadius: 1, opacity: 0.6 }}>
                      <Typography variant="caption" color="text.secondary">
                        Załączników: {attachments.length} • 
                        Zamówienia: {[...new Set(attachments.map(a => a.poNumber))].length} • 
                        Łączny rozmiar: {formatClinicalFileSize(attachments.reduce((sum, a) => sum + a.size, 0))}
                      </Typography>
                    </Box>
                  </Paper>
                ))}
                
                {/* Globalne podsumowanie */}
                <Box sx={{ p: 2, backgroundColor: 'action.hover', borderRadius: 1, border: 1, borderColor: 'divider' }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                    Podsumowanie załączników fizykochemicznych:
                  </Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    • Składników z załącznikami: {Object.keys(ingredientAttachments).length}<br/>
                    • Łączna liczba załączników: {Object.values(ingredientAttachments).reduce((sum, attachments) => sum + attachments.length, 0)}<br/>
                    • Powiązane zamówienia: {[...new Set(Object.values(ingredientAttachments).flat().map(a => a.poNumber))].length}<br/>
                    • Łączny rozmiar: {formatClinicalFileSize(
                      Object.values(ingredientAttachments).flat().reduce((sum, attachment) => sum + attachment.size, 0)
                    )}
                  </Typography>
                </Box>
              </Box>
            ) : (
              <Paper sx={{ p: 3, backgroundColor: 'warning.light', border: 1, borderColor: 'warning.main', borderStyle: 'dashed', opacity: 0.7 }}>
                <Typography variant="body2" color="text.secondary" align="center">
                  Brak załączników fizykochemicznych z powiązanych zamówień zakupu
                </Typography>
                <Typography variant="caption" display="block" align="center" sx={{ mt: 1, color: 'text.secondary' }}>
                  Załączniki zostaną wyświetlone po konsumpcji materiałów z zamówień zawierających dokumenty
                </Typography>
              </Paper>
            )}
          </Paper>
          
          {/* Diagnoza problemu dla starych zadań bez pełnych danych receptury */}
          {task && task.recipeId && !task.recipe?.ingredients && (
            <Paper sx={{ p: 3, mb: 3, backgroundColor: 'warning.light', border: 2, borderColor: 'warning.main', opacity: 0.9 }} elevation={2}>
              <Typography variant="h6" gutterBottom sx={{ color: 'warning.main', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                ⚠️ Wykryto problem z danymi receptury
              </Typography>
              
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                To zadanie zostało utworzone przed wprowadzeniem systemu automatycznego pobierania pełnych danych receptury. 
                Brak jest składników, mikroelementów i innych szczegółowych danych receptury.
              </Typography>
              
              <Typography variant="body2" sx={{ mb: 2 }}>
                <strong>Wykryte informacje o recepturze:</strong><br/>
                • ID Receptury: {task.recipeId}<br/>
                • Nazwa Receptury: {task.recipeName || 'Nie określono'}<br/>
                • Wersja Receptury: {task.recipeVersion || 'Nie określono'}
              </Typography>
              
              <Button 
                variant="contained" 
                color="warning"
                onClick={onFixRecipeData}
                disabled={fixingRecipeData}
                startIcon={fixingRecipeData ? <CircularProgress size={20} color="inherit" /> : null}
                sx={{ mt: 1 }}
              >
                {fixingRecipeData ? 'Naprawiam dane...' : 'Napraw dane receptury'}
              </Button>
              
              <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                Ta operacja pobierze i doda brakujące dane receptury do zadania produkcyjnego.
              </Typography>
            </Paper>
          )}
          
          {/* 5. Production */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {t('endProductReport.sections.production')}
            </Typography>
            
            <Grid container spacing={3}>
              {/* Start date i End date */}
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1 }}>
                    Start date
                  </Typography>
                  <TextField
                    fullWidth
                    value={
                      productionHistory && productionHistory.length > 0
                        ? formatDateTime(productionHistory[0].startTime)
                        : 'Brak danych z historii produkcji'
                    }
                    variant="outlined"
                    size="small"
                    InputProps={{
                      readOnly: true,
                      sx: { backgroundColor: 'action.hover' }
                    }}
                    helperText="Data rozpoczęcia produkcji z pierwszego wpisu w historii"
                  />
                </Box>
              </Grid>
              
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1 }}>
                    End date
                  </Typography>
                  <TextField
                    fullWidth
                    value={
                      productionHistory && productionHistory.length > 0
                        ? formatDateTime(productionHistory[productionHistory.length - 1].endTime)
                        : 'Brak danych z historii produkcji'
                    }
                    variant="outlined"
                    size="small"
                    InputProps={{
                      readOnly: true,
                      sx: { backgroundColor: 'action.hover' }
                    }}
                    helperText="Data zakończenia produkcji z ostatniego wpisu w historii"
                  />
                </Box>
              </Grid>
              
              {/* MO number */}
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1 }}>
                    MO number
                  </Typography>
                  <TextField
                    fullWidth
                    value={task?.moNumber || 'Nie określono'}
                    variant="outlined"
                    size="small"
                    InputProps={{
                      readOnly: true,
                      sx: { backgroundColor: 'action.hover' }
                    }}
                    helperText="Numer zamówienia produkcyjnego"
                  />
                </Box>
              </Grid>
              
              {/* Company name */}
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1 }}>
                    Company name
                  </Typography>
                  <TextField
                    fullWidth
                    value={companyData?.name || 'Ładowanie...'}
                    variant="outlined"
                    size="small"
                    InputProps={{
                      readOnly: true,
                      sx: { backgroundColor: 'action.hover' }
                    }}
                    helperText="Nazwa firmy"
                  />
                </Box>
              </Grid>
              
              {/* Company address */}
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1 }}>
                    Address
                  </Typography>
                  <TextField
                    fullWidth
                    value={companyData?.address || companyData ? `${companyData.address || ''} ${companyData.city || ''}`.trim() : 'Ładowanie...'}
                    variant="outlined"
                    size="small"
                    multiline
                    maxRows={2}
                    InputProps={{
                      readOnly: true,
                      sx: { backgroundColor: 'action.hover' }
                    }}
                    helperText="Adres firmy"
                  />
                </Box>
              </Grid>
              
              {/* Workstation */}
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1 }}>
                    Workstation
                  </Typography>
                  <TextField
                    fullWidth
                    value={
                      workstationData === null 
                        ? 'Ładowanie...' 
                        : workstationData?.name 
                          ? workstationData.name 
                          : 'Nie przypisano stanowiska'
                    }
                    variant="outlined"
                    size="small"
                    InputProps={{
                      readOnly: true,
                      sx: { backgroundColor: 'action.hover' }
                    }}
                    helperText="Stanowisko produkcyjne"
                  />
                </Box>
              </Grid>
              
              {/* Time per unit */}
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'text.secondary', mb: 1 }}>
                    Time per unit
                  </Typography>
                  <TextField
                    fullWidth
                    value={
                      task?.productionTimePerUnit 
                        ? `${task.productionTimePerUnit} min/szt`
                        : task?.recipe?.productionTimePerUnit
                          ? `${task.recipe.productionTimePerUnit} min/szt`
                          : 'Nie określono'
                    }
                    variant="outlined"
                    size="small"
                    InputProps={{
                      readOnly: true,
                      sx: { backgroundColor: 'action.hover' }
                    }}
                    helperText="Czas produkcji na jedną sztukę z receptury"
                  />
                </Box>
              </Grid>
            </Grid>
            
            {/* History of production */}
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', mt: 3, mb: 2 }}>
              {t('endProductReport.sections.productionHistory')}:
            </Typography>
            
            {productionHistory && productionHistory.length > 0 ? (
              <TableContainer component={Paper} sx={{ mt: 2 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ backgroundColor: 'action.hover' }}>
                      <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.startDate')}</TableCell>
                      <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.endDate')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.quantity')}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.timeSpent')}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {productionHistory.map((session, index) => (
                      <TableRow key={index}>
                        <TableCell>{formatDateTime(session.startTime)}</TableCell>
                        <TableCell>{formatDateTime(session.endTime)}</TableCell>
                        <TableCell align="right">
                          {session.quantity} {task?.unit || 'szt'}
                        </TableCell>
                        <TableCell align="right">
                          {session.timeSpent ? `${session.timeSpent} min` : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                    {/* Wiersz podsumowania */}
                    <TableRow sx={{ '& td': { fontWeight: 'bold', bgcolor: 'rgba(0, 0, 0, 0.04)' } }}>
                      <TableCell colSpan={2} align="right">{t('endProductReport.tableHeaders.sum')}:</TableCell>
                      <TableCell align="right">
                        {formatQuantityPrecision(
                          productionHistory.reduce((sum, session) => sum + (parseFloat(session.quantity) || 0), 0), 
                          3
                        )} {task?.unit || 'szt'}
                      </TableCell>
                      <TableCell align="right">
                        {productionHistory.reduce((sum, session) => sum + (session.timeSpent || 0), 0)} min
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Paper sx={{ p: 3, backgroundColor: 'warning.light', border: 1, borderColor: 'warning.main', borderStyle: 'dashed', opacity: 0.7 }}>
                <Typography variant="body2" color="text.secondary" align="center">
                  Brak historii produkcji dla tego zadania
                </Typography>
                <Typography variant="caption" display="block" align="center" sx={{ mt: 1, color: 'text.secondary' }}>
                  Historia produkcji będzie dostępna po rozpoczęciu i zakończeniu sesji produkcyjnych
                </Typography>
              </Paper>
            )}
            
            {/* Dane z raportu zakończonych MO */}
            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', mt: 4, mb: 2 }}>
              {t('endProductReport.sections.reportDataFromForms')}:
            </Typography>
            
            {formResponses?.completedMO && formResponses.completedMO.length > 0 ? (
              <Grid container spacing={3}>
                {formResponses.completedMO.map((report, index) => (
                  <Grid item xs={12} key={index}>
                    <Paper sx={{ 
                      p: 3, 
                      ...getAdaptiveBackgroundStyle('info', 0.8),
                      border: 1, 
                      borderColor: 'info.main'
                    }}>
                      <Typography variant="subtitle2" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                        Raport #{index + 1} - {formatDateTime(report.date)}
                      </Typography>
                      
                      <Grid container spacing={2}>
                        {/* Dane podstawowe */}
                        <Grid item xs={12} sm={6} md={3}>
                          <TextField
                            fullWidth
                            label={t('endProductReport.formLabels.fillDate')}
                            value={formatDateTime(report.date)}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={3}>
                          <TextField
                            fullWidth
                            label={t('endProductReport.formLabels.time')}
                            value={report.time || t('endProductReport.formLabels.notProvided')}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={3}>
                          <TextField
                            fullWidth
                            label={t('endProductReport.formLabels.responsible')}
                            value={report.email || t('endProductReport.formLabels.notProvided')}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={3}>
                          <TextField
                            fullWidth
                            label="Ilość produktu końcowego"
                            value={report.productQuantity ? `${report.productQuantity} ${task?.unit || 'szt'}` : 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        {/* Straty */}
                        <Grid item xs={12} sm={4}>
                          <TextField
                            fullWidth
                            label="Strata - Opakowanie"
                            value={report.packagingLoss || 'Brak strat'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={4}>
                          <TextField
                            fullWidth
                            label="Strata - Wieczka"
                            value={report.bulkLoss || 'Brak strat'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={4}>
                          <TextField
                            fullWidth
                            label="Strata - Surowiec"
                            value={report.rawMaterialLoss || 'Brak strat'}
                            variant="outlined"
                            size="small"
                            multiline
                            maxRows={2}
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        {/* Załącznik - Raport z planu mieszań */}
                        {report.mixingPlanReportUrl && (
                          <Grid item xs={12}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                                Raport z planu mieszań:
                              </Typography>
                              <Button
                                variant="outlined"
                                size="small"
                                startIcon={<AttachFileIcon />}
                                href={report.mixingPlanReportUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {report.mixingPlanReportName || 'Pobierz raport'}
                              </Button>
                            </Box>
                          </Grid>
                        )}
                      </Grid>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Paper sx={{ 
                p: 3, 
                ...getAdaptiveBackgroundStyle('warning', 0.7),
                border: 1, 
                borderColor: 'warning.main', 
                borderStyle: 'dashed'
              }}>
                <Typography variant="body2" color="text.secondary" align="center">
                  Brak raportów zakończonych MO dla tego zadania
                </Typography>
                <Typography variant="caption" display="block" align="center" sx={{ mt: 1, color: 'text.secondary' }}>
                  Raporty zakończonych MO będą widoczne po wypełnieniu odpowiednich formularzy
                </Typography>
              </Paper>
            )}
          </Paper>
          
          {/* 6. Quality control */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {t('endProductReport.sections.qualityControl')}
            </Typography>
            
            {formResponses?.productionControl && formResponses.productionControl.length > 0 ? (
              <Grid container spacing={3}>
                {formResponses.productionControl.map((report, index) => (
                  <Grid item xs={12} key={index}>
                    <Paper sx={{ 
                      p: 3, 
                      ...getAdaptiveBackgroundStyle('success', 0.8),
                      border: 1, 
                      borderColor: 'success.main'
                    }}>
                      <Typography variant="subtitle2" gutterBottom sx={{ color: 'success.main', fontWeight: 'bold' }}>
                        Raport kontroli #{index + 1} - {formatDateTime(report.fillDate)}
                      </Typography>
                      
                      <Grid container spacing={2}>
                        {/* Identyfikacja */}
                        <Grid item xs={12}>
                          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                            {t('endProductReport.sections.identification')}:
                          </Typography>
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth
                            label="Imię i nazwisko"
                            value={report.name || 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth
                            label="Stanowisko"
                            value={report.position || 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth
                            label="Data wypełnienia"
                            value={formatDateTime(report.fillDate)}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        {/* Protokół kontroli produkcji */}
                        <Grid item xs={12} sx={{ mt: 2 }}>
                          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                            {t('endProductReport.sections.productionControlProtocol')}:
                          </Typography>
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth
                            label="Customer Order"
                            value={report.customerOrder || 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth
                            label="Data rozpoczęcia produkcji"
                            value={report.productionStartDate ? formatDateTime(report.productionStartDate) : 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth
                            label="Godzina rozpoczęcia"
                            value={report.productionStartTime || 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth
                            label="Data zakończenia produkcji"
                            value={report.productionEndDate ? formatDateTime(report.productionEndDate) : 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth
                            label="Godzina zakończenia"
                            value={report.productionEndTime || 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth
                            label="Data odczytu warunków"
                            value={report.readingDate ? formatDateTime(report.readingDate) : 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth
                            label="Godzina odczytu"
                            value={report.readingTime || 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        {/* Dane produktu */}
                        <Grid item xs={12} sx={{ mt: 2 }}>
                          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                            {t('endProductReport.sections.productData')}:
                          </Typography>
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth
                            label="Nazwa produktu"
                            value={report.productName || 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth
                            label="Numer LOT"
                            value={report.lotNumber || 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth
                            label="Data ważności (EXP)"
                            value={report.expiryDate || 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth
                            label="Ilość (szt.)"
                            value={report.quantity ? `${report.quantity} szt` : 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={4}>
                          <TextField
                            fullWidth
                            label="Numer zmiany"
                            value={report.shiftNumber && report.shiftNumber.length > 0 ? report.shiftNumber.join(', ') : 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                          />
                        </Grid>
                        
                        {/* Warunki atmosferyczne */}
                        <Grid item xs={12} sx={{ mt: 2 }}>
                          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                            {t('endProductReport.sections.atmosphericConditions')}:
                          </Typography>
                        </Grid>
                        
                        <Grid item xs={12} sm={6}>
                          <TextField
                            fullWidth
                            label="Wilgotność powietrza"
                            value={report.humidity || 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                backgroundColor: report.humidity && (
                                  report.humidity.includes('PONIŻEJ') || 
                                  report.humidity.includes('POWYŻEJ') ||
                                  (typeof report.humidity === 'string' && 
                                   ((report.humidity.includes('%') && (parseInt(report.humidity) < 40 || parseInt(report.humidity) > 60)) ||
                                    (!report.humidity.includes('%') && (parseFloat(report.humidity) < 40 || parseFloat(report.humidity) > 60))))
                                ) ? '#ffebee' : 'inherit'
                              }
                            }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6}>
                          <TextField
                            fullWidth
                            label="Temperatura powietrza"
                            value={report.temperature || 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                backgroundColor: report.temperature && (
                                  report.temperature.includes('PONIŻEJ') || 
                                  report.temperature.includes('POWYŻEJ') ||
                                  (typeof report.temperature === 'string' && 
                                   ((report.temperature.includes('°C') && (parseInt(report.temperature) < 10 || parseInt(report.temperature) > 25)) ||
                                    (!report.temperature.includes('°C') && (parseFloat(report.temperature) < 10 || parseFloat(report.temperature) > 25))))
                                ) ? '#ffebee' : 'inherit'
                              }
                            }}
                          />
                        </Grid>
                        
                        {/* Kontrola jakości */}
                        <Grid item xs={12} sx={{ mt: 2 }}>
                          <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                            {t('endProductReport.sections.qualityControlDetails')}:
                          </Typography>
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={3}>
                          <TextField
                            fullWidth
                            label="Czystość surowca"
                            value={report.rawMaterialPurity || 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                backgroundColor: report.rawMaterialPurity === 'Nieprawidłowa' ? '#ffebee' : 'inherit'
                              }
                            }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={3}>
                          <TextField
                            fullWidth
                            label="Czystość opakowania"
                            value={report.packagingPurity || 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                backgroundColor: report.packagingPurity === 'Nieprawidłowa' ? '#ffebee' : 'inherit'
                              }
                            }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={3}>
                          <TextField
                            fullWidth
                            label="Zamknięcie opakowania"
                            value={report.packagingClosure || 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                backgroundColor: report.packagingClosure === 'Nieprawidłowa' ? '#ffebee' : 'inherit'
                              }
                            }}
                          />
                        </Grid>
                        
                        <Grid item xs={12} sm={6} md={3}>
                          <TextField
                            fullWidth
                            label="Ilość na palecie"
                            value={report.packagingQuantity || 'Nie podano'}
                            variant="outlined"
                            size="small"
                            InputProps={{ readOnly: true }}
                            sx={{
                              '& .MuiOutlinedInput-root': {
                                backgroundColor: report.packagingQuantity === 'Nieprawidłowa' ? '#ffebee' : 'inherit'
                              }
                            }}
                          />
                        </Grid>
                        
                        {/* Załączniki */}
                        {(report.documentScansUrl || report.productPhoto1Url || report.productPhoto2Url || report.productPhoto3Url) && (
                          <Grid item xs={12} sx={{ mt: 2 }}>
                            <Typography variant="subtitle1" gutterBottom sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                              {t('endProductReport.sections.attachments')}:
                            </Typography>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                              {report.documentScansUrl && (
                                <Button
                                  variant="outlined"
                                  size="small"
                                  startIcon={<AttachFileIcon />}
                                  href={report.documentScansUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {report.documentScansName || 'Skany dokumentów'}
                                </Button>
                              )}
                              {report.productPhoto1Url && (
                                <Button
                                  variant="outlined"
                                  size="small"
                                  startIcon={<AttachFileIcon />}
                                  href={report.productPhoto1Url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  color="secondary"
                                >
                                  {report.productPhoto1Name || 'Zdjęcie produktu 1'}
                                </Button>
                              )}
                              {report.productPhoto2Url && (
                                <Button
                                  variant="outlined"
                                  size="small"
                                  startIcon={<AttachFileIcon />}
                                  href={report.productPhoto2Url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  color="secondary"
                                >
                                  {report.productPhoto2Name || 'Zdjęcie produktu 2'}
                                </Button>
                              )}
                              {report.productPhoto3Url && (
                                <Button
                                  variant="outlined"
                                  size="small"
                                  startIcon={<AttachFileIcon />}
                                  href={report.productPhoto3Url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  color="secondary"
                                >
                                  {report.productPhoto3Name || 'Zdjęcie produktu 3'}
                                </Button>
                              )}
                            </Box>
                          </Grid>
                        )}
                      </Grid>
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            ) : (
              <Paper sx={{ p: 3, backgroundColor: 'warning.light', border: 1, borderColor: 'warning.main', borderStyle: 'dashed', opacity: 0.7 }}>
                <Typography variant="body2" color="text.secondary" align="center">
                  Brak raportów kontroli produkcji dla tego zadania
                </Typography>
                <Typography variant="caption" display="block" align="center" sx={{ mt: 1, color: 'text.secondary' }}>
                  Raporty kontroli produkcji będą widoczne po wypełnieniu odpowiednich formularzy
                </Typography>
              </Paper>
            )}
          </Paper>
          
          {/* 7. Allergens */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {t('endProductReport.sections.allergens')}
            </Typography>
            
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Wybierz wszystkie alergeny obecne w produkcie:
            </Typography>
            
            <Autocomplete
              multiple
              freeSolo
              id="allergens-autocomplete"
              options={availableAllergens}
              value={selectedAllergens}
              onChange={handleAllergenChange}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={t('endProductReport.sections.allergens')}
                  placeholder="Wybierz z listy lub wpisz własny alergen..."
                  variant="outlined"
                  fullWidth
                  helperText="Możesz wybrać z listy lub wpisać własny alergen i nacisnąć Enter"
                />
              )}
              renderTags={(value, getTagProps) =>
                value.map((option, index) => (
                  <Chip
                    variant="outlined"
                    label={option}
                    color={availableAllergens.includes(option) ? "default" : "secondary"}
                    {...getTagProps({ index })}
                  />
                ))
              }
              sx={{ mb: 2 }}
            />
            
            {/* Podsumowanie wybranych alergenów */}
            <Box sx={{ mt: 3, p: 2 }}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>
                {t('endProductReport.sections.selectedAllergens')} ({selectedAllergens.length}):
              </Typography>
              {selectedAllergens.length > 0 ? (
                <Typography variant="body2">
                  {selectedAllergens.join(', ')}
                </Typography>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Brak wybranych alergenów
                </Typography>
              )}
            </Box>
          </Paper>
          
          {/* 8. Disclaimer & Terms of Use */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, color: 'error.main' }}>
              {t('endProductReport.sections.disclaimer')}
            </Typography>
            
            <Box sx={{ 
              p: 3, 
              backgroundColor: 'background.default', 
              borderRadius: 2, 
              border: 1, 
              borderColor: 'divider',
              boxShadow: 1
            }}>
              <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.6, color: 'text.primary' }}>
                <strong>DISCLAIMER & TERMS OF USE</strong>
              </Typography>
              
              <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.6, color: 'text.primary' }}>
                This Technical Data Sheet (TDS) describes the typical properties of the product and has been prepared with due care based on our current knowledge, internal analyses, and data from our suppliers. The legally binding parameters for the product are defined in the agreed-upon Product Specification Sheet and confirmed for each batch in its respective Certificate of Analysis (CoA).
              </Typography>
              
              <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.6, color: 'text.primary' }}>
                Due to the natural variability of raw materials, minor batch-to-batch variations in non-critical organoleptic or physical parameters may occur. BGW PHARMA reserves the right to inform Clients of any significant deviations from the specifications. This provision does not apply to active ingredients, vitamins, minerals, or declared nutritional values, which must comply with labelling requirements under EU regulations.
              </Typography>
              
              <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.6, color: 'text.primary' }}>
                We are committed to continuous improvement and reserve the right to modify the product's specifications. The Buyer will be notified with reasonable advance notice of any changes, particularly those affecting mandatory labelling information or the composition of active ingredients.
              </Typography>
              
              <Typography variant="body2" sx={{ mb: 1, fontWeight: 'bold', color: 'text.primary' }}>
                The Buyer is solely responsible for:
              </Typography>
              
              <Box component="ul" sx={{ mb: 2, pl: 3 }}>
                <Typography component="li" variant="body2" sx={{ mb: 0.5, lineHeight: 1.6, color: 'text.primary' }}>
                  Verifying the product's suitability for their specific application and manufacturing processes.
                </Typography>
                <Typography component="li" variant="body2" sx={{ mb: 0.5, lineHeight: 1.6, color: 'text.primary' }}>
                  Ensuring that their final product complies with all applicable laws and regulations.
                </Typography>
                <Typography component="li" variant="body2" sx={{ mb: 0.5, lineHeight: 1.6, color: 'text.primary' }}>
                  Maintaining full traceability in accordance with the requirements of EU food law.
                </Typography>
              </Box>
              
              <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.6, color: 'text.primary' }}>
                Where information regarding health claims authorized under Regulation (EC) No 1924/2006 is provided, BGW PHARMA shall not be held liable for any modifications or alterations of these claims made by the Buyer. It remains the Buyer's exclusive responsibility to ensure compliance with all applicable regulations concerning the use of such claims in final products.
              </Typography>
              
              <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.6, color: 'text.primary' }}>
                BGW PHARMA shall not be held liable for damages resulting from improper use, storage, or handling of the product, subject to applicable EU obligations on food safety and product liability directives.
              </Typography>
              
              <Typography variant="body2" sx={{ mb: 2, lineHeight: 1.6, color: 'text.primary' }}>
                This document does not constitute a warranty and is subject to our official General Terms and Conditions of Sale, which govern all legal aspects of the transaction, including specific warranties, claims procedures, liability limitations, and force majeure provisions. In the event of any discrepancy between this TDS and our General Terms and Conditions of Sale, the latter shall prevail.
              </Typography>
              
              <Typography variant="body2" sx={{ lineHeight: 1.6, fontWeight: 'bold', color: 'text.primary' }}>
                By purchasing the product, the Buyer accepts the conditions outlined in this document and confirms the receipt and acceptance of our General Terms and Conditions of Sale.
              </Typography>
            </Box>
          </Paper>
          
          {/* 9. Additional Attachments */}
          <Paper sx={{ p: 3, mb: 3 }}>
            <Typography variant="h6" sx={{ mb: 2 }}>
              {t('endProductReport.sections.additionalAttachments')}
            </Typography>
            
            <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
              Dodaj dodatkowe załączniki związane z tym produktem lub procesem produkcyjnym:
            </Typography>
            
            {/* Sekcja przesyłania plików */}
            <Box sx={{ mb: 3, p: 2, backgroundColor: 'secondary.light', borderRadius: 1, border: 1, borderColor: 'secondary.main', borderStyle: 'dashed', opacity: 0.8 }}>
              <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                <CloudUploadIcon sx={{ mr: 1 }} />
                {t('endProductReport.sections.addAdditionalAttachments')}
              </Typography>
              
              <input
                accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx,.txt,.xls,.xlsx"
                style={{ display: 'none' }}
                id="additional-file-upload"
                multiple
                type="file"
                onChange={(e) => onAdditionalFileSelect(Array.from(e.target.files))}
                disabled={uploadingAdditional}
              />
              <label htmlFor="additional-file-upload">
                <Button
                  variant="contained"
                  component="span"
                  startIcon={uploadingAdditional ? <CircularProgress size={20} color="inherit" /> : <CloudUploadIcon />}
                  disabled={uploadingAdditional}
                  sx={{ mt: 1 }}
                >
                  {uploadingAdditional ? 'Przesyłanie...' : 'Wybierz pliki'}
                </Button>
              </label>
              
              <Typography variant="caption" display="block" sx={{ mt: 1, color: 'text.secondary' }}>
                Dozwolone formaty: PDF, JPG, PNG, GIF, DOC, DOCX, TXT, XLS, XLSX (max 20MB na plik)
              </Typography>
            </Box>

            {/* Lista załączników */}
            {additionalAttachments.length > 0 ? (
              <Box>
                                <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center', fontWeight: 'bold' }}>
                  <AttachFileIcon sx={{ mr: 1 }} />
                  {t('endProductReport.sections.additionalAttachments')} ({additionalAttachments.length})
                </Typography>

                <TableContainer component={Paper} sx={{ mt: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow sx={{ backgroundColor: 'action.hover' }}>
                        <TableCell sx={{ fontWeight: 'bold', width: 60 }}>{t('endProductReport.tableHeaders.type')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>{t('endProductReport.tableHeaders.fileName')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 100 }}>{t('endProductReport.tableHeaders.size')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 120 }}>{t('endProductReport.tableHeaders.dateAdded')}</TableCell>
                        <TableCell sx={{ fontWeight: 'bold', width: 120 }} align="center">{t('endProductReport.tableHeaders.actions')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {additionalAttachments.map((attachment, index) => (
                        <TableRow key={attachment.id} sx={{ '&:nth-of-type(even)': { backgroundColor: 'action.hover' } }}>
                          <TableCell>
                            {getClinicalFileIcon(attachment.contentType)}
                          </TableCell>
                          <TableCell sx={{ fontWeight: 'medium' }}>
                            {attachment.fileName}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.875rem' }}>
                            {formatClinicalFileSize(attachment.size)}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.875rem' }}>
                            {new Date(attachment.uploadedAt).toLocaleDateString('pl-PL', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })}
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title="Pobierz">
                              <IconButton
                                size="small"
                                onClick={() => onDownloadAdditionalFile(attachment)}
                                sx={{ mr: 0.5 }}
                              >
                                <DownloadIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Usuń">
                              <IconButton
                                size="small"
                                onClick={() => onDeleteAdditionalFile(attachment)}
                                color="error"
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  
                  {/* Podsumowanie załączników */}
                  <Box sx={{ p: 2, backgroundColor: 'action.hover', borderTop: 1, borderColor: 'divider' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                      Łączna liczba załączników: {additionalAttachments.length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Łączny rozmiar: {formatClinicalFileSize(additionalAttachments.reduce((sum, attachment) => sum + attachment.size, 0))}
                    </Typography>
                  </Box>
                </TableContainer>
              </Box>
            ) : (
              <Paper sx={{ p: 2, backgroundColor: 'warning.light', border: 1, borderColor: 'warning.main', borderStyle: 'dashed', opacity: 0.7 }}>
                <Typography variant="body2" color="text.secondary" align="center">
                  Brak dodatkowych załączników
                </Typography>
                <Typography variant="caption" display="block" align="center" sx={{ mt: 1, color: 'text.secondary' }}>
                  Możesz dodać dokumenty, zdjęcia lub inne pliki związane z tym produktem
                </Typography>
              </Paper>
            )}
          </Paper>
        </Paper>
      </Grid>
    </Grid>
  );
};

export default memo(EndProductReportTab); 