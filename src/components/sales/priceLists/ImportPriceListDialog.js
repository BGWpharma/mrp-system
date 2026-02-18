import React, { useState, useRef } from 'react';
import PropTypes from 'prop-types';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Alert,
  CircularProgress,
  FormControlLabel,
  Checkbox,
  Divider,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  LinearProgress
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import WarningIcon from '@mui/icons-material/Warning';
import InfoIcon from '@mui/icons-material/Info';

import {
  previewPriceListImport,
  executePriceListImport,
  generatePriceListTemplate
} from '../../../services/priceListImportService';
import { useAuth } from '../../../contexts/AuthContext';
import { useNotification } from '../../../hooks/useNotification';
import { useTranslation } from '../../../hooks/useTranslation';

const ImportPriceListDialog = ({ open, onClose, priceListId, priceList, onImportComplete }) => {
  const [importFile, setImportFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [importResults, setImportResults] = useState(null);
  const [importOptions, setImportOptions] = useState({
    updateExisting: true,
    skipNotFound: true
  });
  
  const fileInputRef = useRef(null);
  const { currentUser } = useAuth();
  const { showNotification } = useNotification();
  const { t } = useTranslation('priceLists');
  
  const handleClose = () => {
    if (!importing) {
      resetState();
      onClose();
    }
  };
  
  const resetState = () => {
    setImportFile(null);
    setPreview(null);
    setError(null);
    setImportResults(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    // Sprawdź typ pliku
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Wybierz plik CSV');
      return;
    }
    
    // Sprawdź rozmiar (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Plik jest za duży (max 5MB)');
      return;
    }
    
    setImportFile(file);
    setError(null);
    setPreview(null);
    setImportResults(null);
    
    try {
      setLoading(true);
      
      // Wczytaj plik
      const text = await file.text();
      
      // Generuj podgląd
      const previewData = await previewPriceListImport(text, priceListId);
      setPreview(previewData);
      
      // Sprawdź czy są błędy krytyczne
      if (previewData.errors.length > 0) {
        setError(`Znaleziono ${previewData.errors.length} błędów walidacji. Sprawdź szczegóły poniżej.`);
      }
      
    } catch (err) {
      console.error('Błąd parsowania CSV:', err);
      setError(err.message || 'Błąd podczas analizy pliku CSV');
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };
  
  const handleImport = async () => {
    if (!preview || importing) return;
    
    // Sprawdź czy są błędy krytyczne
    if (preview.errors.length > 0) {
      showNotification('Nie można importować danych z błędami. Popraw plik CSV.', 'error');
      return;
    }
    
    // Sprawdź czy są dane do importu
    if (preview.toCreate.length === 0 && preview.toUpdate.length === 0) {
      showNotification('Brak danych do zaimportowania', 'warning');
      return;
    }
    
    try {
      setImporting(true);
      
      const results = await executePriceListImport(
        preview,
        priceListId,
        currentUser.uid,
        importOptions
      );
      
      setImportResults(results);
      
      // Pokaż powiadomienie
      const totalChanges = results.created + results.updated;
      showNotification(
        `Import zakończony: ${results.created} dodano, ${results.updated} zaktualizowano`,
        'success'
      );
      
      // Wywołaj callback po pomyślnym imporcie
      if (onImportComplete && totalChanges > 0) {
        onImportComplete();
      }
      
    } catch (err) {
      console.error('Błąd podczas importu:', err);
      showNotification(err.message || 'Błąd podczas importu', 'error');
    } finally {
      setImporting(false);
    }
  };
  
  const handleDownloadTemplate = () => {
    try {
      const template = generatePriceListTemplate();
      const blob = new Blob([template], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'price_list_template.csv');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      showNotification('Szablon CSV został pobrany', 'success');
    } catch (err) {
      console.error('Błąd pobierania szablonu:', err);
      showNotification('Błąd podczas pobierania szablonu', 'error');
    }
  };
  
  const canImport = preview && 
    preview.errors.length === 0 && 
    (preview.toCreate.length > 0 || preview.toUpdate.length > 0) &&
    !importing;
  
  return (
    <Dialog 
      open={open} 
      onClose={handleClose} 
      maxWidth="md" 
      fullWidth
      disableEscapeKeyDown={importing}
    >
      <DialogTitle>
        {t('priceLists.import.title') || 'Import listy cenowej z CSV'}
      </DialogTitle>
      
      <DialogContent>
        {/* Informacje o formacie */}
        <Alert severity="info" sx={{ mb: 3 }}>
          <Typography variant="body2" gutterBottom>
            {t('priceLists.import.description') || 'Wybierz plik CSV z pozycjami do importu. Wymagane kolumny: SKU, PRICE, CURRENCY, UNIT, MOQ, COMMENTS'}
          </Typography>
          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
            • SKU = Nazwa produktu/receptury dokładnie tak jak w systemie
          </Typography>
          <Typography variant="caption" display="block" sx={{ color: 'warning.main', fontWeight: 'bold' }}>
            • PRICE = Używaj KROPKI jako separatora dziesiętnego (5.99 nie 5,99)
          </Typography>
        </Alert>
        
        {/* Przycisk pobierz szablon */}
        <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleDownloadTemplate}
            disabled={importing}
          >
            {t('priceLists.import.downloadTemplate') || 'Pobierz szablon'}
          </Button>
          
          <Typography variant="caption" color="text.secondary">
            Format: SKU, PRICE, CURRENCY, UNIT, MOQ, COMMENTS
          </Typography>
        </Box>
        
        <Divider sx={{ mb: 3 }} />
        
        {/* Wybór pliku */}
        <Box sx={{ mb: 3 }}>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            ref={fileInputRef}
            style={{ display: 'none' }}
            id="csv-file-input"
            disabled={importing}
          />
          <label htmlFor="csv-file-input">
            <Button
              variant="contained"
              component="span"
              startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <UploadFileIcon />}
              disabled={loading || importing}
              fullWidth
            >
              {importFile 
                ? `${t('priceLists.import.selectedFile') || 'Wybrany plik'}: ${importFile.name}`
                : t('priceLists.import.selectFile') || 'Wybierz plik CSV'
              }
            </Button>
          </label>
        </Box>
        
        {/* Opcje importu */}
        {preview && !importResults && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="subtitle2" gutterBottom>
              {t('priceLists.import.options.title') || 'Opcje importu'}
            </Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={importOptions.updateExisting}
                  onChange={(e) => setImportOptions({ ...importOptions, updateExisting: e.target.checked })}
                  disabled={importing}
                />
              }
              label={t('priceLists.import.options.updateExisting') || 'Aktualizuj istniejące pozycje'}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={importOptions.skipNotFound}
                  onChange={(e) => setImportOptions({ ...importOptions, skipNotFound: e.target.checked })}
                  disabled={importing}
                />
              }
              label={t('priceLists.import.options.skipNotFound') || 'Pomiń nieznalezione produkty'}
            />
          </Box>
        )}
        
        {/* Loader */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', my: 3 }}>
            <CircularProgress />
          </Box>
        )}
        
        {/* Progress bar podczas importu */}
        {importing && (
          <Box sx={{ mb: 3 }}>
            <Typography variant="body2" gutterBottom>
              Importowanie danych...
            </Typography>
            <LinearProgress />
          </Box>
        )}
        
        {/* Błąd */}
        {error && !loading && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        
        {/* Podgląd zmian */}
        {preview && !loading && !importResults && (
          <Box>
            <Typography variant="h6" gutterBottom>
              {t('priceLists.import.preview.title') || 'Podgląd zmian'}
            </Typography>
            
            {/* Podsumowanie */}
            <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
              <Chip
                icon={<CheckCircleIcon />}
                label={`${t('priceLists.import.preview.toCreate') || 'Do dodania'}: ${preview.toCreate.length}`}
                color="success"
                variant="outlined"
              />
              <Chip
                icon={<InfoIcon />}
                label={`${t('priceLists.import.preview.toUpdate') || 'Do aktualizacji'}: ${preview.toUpdate.length}`}
                color="info"
                variant="outlined"
              />
              {preview.notFound.length > 0 && (
                <Chip
                  icon={<WarningIcon />}
                  label={`${t('priceLists.import.preview.notFound') || 'Nie znaleziono'}: ${preview.notFound.length}`}
                  color="warning"
                  variant="outlined"
                />
              )}
              {preview.errors.length > 0 && (
                <Chip
                  icon={<ErrorIcon />}
                  label={`${t('priceLists.import.preview.errors') || 'Błędy'}: ${preview.errors.length}`}
                  color="error"
                  variant="outlined"
                />
              )}
            </Box>
            
            {/* Szczegóły - Do dodania */}
            {preview.toCreate.length > 0 && (
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>
                    ✅ Nowe pozycje do dodania ({preview.toCreate.length})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Produkt</TableCell>
                          <TableCell>Cena</TableCell>
                          <TableCell>Jednostka</TableCell>
                          <TableCell>MOQ</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {preview.toCreate.slice(0, 10).map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>{item.productName}</TableCell>
                            <TableCell>{item.price.toFixed(2)} {item.currency || 'EUR'}</TableCell>
                            <TableCell>{item.unit}</TableCell>
                            <TableCell>{item.minQuantity}</TableCell>
                          </TableRow>
                        ))}
                        {preview.toCreate.length > 10 && (
                          <TableRow>
                            <TableCell colSpan={4} align="center">
                              <Typography variant="caption" color="text.secondary">
                                ... i {preview.toCreate.length - 10} więcej
                              </Typography>
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </AccordionDetails>
              </Accordion>
            )}
            
            {/* Szczegóły - Do aktualizacji */}
            {preview.toUpdate.length > 0 && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>
                    🔄 Istniejące pozycje do aktualizacji ({preview.toUpdate.length})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {preview.toUpdate.slice(0, 5).map((item, index) => (
                    <Box key={index} sx={{ mb: 2 }}>
                      <Typography variant="subtitle2" gutterBottom>
                        {item.productName}
                      </Typography>
                      <TableContainer component={Paper} variant="outlined" sx={{ mb: 1 }}>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Pole</TableCell>
                              <TableCell>Stara wartość</TableCell>
                              <TableCell>Nowa wartość</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {item.changes.map((change, idx) => (
                              <TableRow key={idx}>
                                <TableCell>{change.field}</TableCell>
                                <TableCell sx={{ textDecoration: 'line-through', color: 'text.secondary' }}>
                                  {change.oldValue}
                                </TableCell>
                                <TableCell sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                  {change.newValue}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    </Box>
                  ))}
                  {preview.toUpdate.length > 5 && (
                    <Typography variant="caption" color="text.secondary">
                      ... i {preview.toUpdate.length - 5} więcej pozycji do aktualizacji
                    </Typography>
                  )}
                </AccordionDetails>
              </Accordion>
            )}
            
            {/* Szczegóły - Nie znaleziono */}
            {preview.notFound.length > 0 && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>
                    ⚠️ Produkty nie znalezione w bazie ({preview.notFound.length})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Alert severity="warning" sx={{ mb: 2 }}>
                    Te produkty nie zostaną zaimportowane, ponieważ nie istnieją w systemie.
                  </Alert>
                  <Box>
                    {preview.notFound.slice(0, 10).map((item, index) => (
                      <Chip
                        key={index}
                        label={item.sku}
                        size="small"
                        sx={{ m: 0.5 }}
                      />
                    ))}
                    {preview.notFound.length > 10 && (
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
                        ... i {preview.notFound.length - 10} więcej
                      </Typography>
                    )}
                  </Box>
                </AccordionDetails>
              </Accordion>
            )}
            
            {/* Szczegóły - Błędy */}
            {preview.errors.length > 0 && (
              <Accordion defaultExpanded>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography color="error">
                    ❌ Błędy walidacji ({preview.errors.length})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Alert severity="error" sx={{ mb: 2 }}>
                    Popraw te błędy w pliku CSV przed importem.
                  </Alert>
                  {preview.errors.slice(0, 10).map((error, index) => (
                    <Box key={index} sx={{ mb: 1, p: 1, bgcolor: 'error.lighter', borderRadius: 1 }}>
                      <Typography variant="body2">
                        <strong>Linia {error.lineNumber}:</strong> {error.sku || '(brak SKU)'}
                      </Typography>
                      <Typography variant="caption" color="error">
                        {error.errors.join(', ')}
                      </Typography>
                    </Box>
                  ))}
                  {preview.errors.length > 10 && (
                    <Typography variant="caption" color="text.secondary">
                      ... i {preview.errors.length - 10} więcej błędów
                    </Typography>
                  )}
                </AccordionDetails>
              </Accordion>
            )}
            
            {/* Ostrzeżenia */}
            {preview.warnings.length > 0 && (
              <Accordion>
                <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                  <Typography>
                    ⚠️ Ostrzeżenia ({preview.warnings.length})
                  </Typography>
                </AccordionSummary>
                <AccordionDetails>
                  {preview.warnings.map((warning, index) => (
                    <Alert key={index} severity="warning" sx={{ mb: 1 }}>
                      {warning.message}
                    </Alert>
                  ))}
                </AccordionDetails>
              </Accordion>
            )}
          </Box>
        )}
        
        {/* Wyniki importu */}
        {importResults && (
          <Box>
            <Alert severity="success" sx={{ mb: 2 }}>
              <Typography variant="h6" gutterBottom>
                {t('priceLists.import.results.title') || 'Import zakończony pomyślnie!'}
              </Typography>
              <Typography variant="body2">
                • {t('priceLists.import.results.created') || 'Dodano'}: {importResults.created}
              </Typography>
              <Typography variant="body2">
                • {t('priceLists.import.results.updated') || 'Zaktualizowano'}: {importResults.updated}
              </Typography>
              {importResults.skipped > 0 && (
                <Typography variant="body2">
                  • {t('priceLists.import.results.skipped') || 'Pominięto'}: {importResults.skipped}
                </Typography>
              )}
            </Alert>
          </Box>
        )}
      </DialogContent>
      
      <DialogActions>
        <Button onClick={handleClose} disabled={importing}>
          {importResults ? 'Zamknij' : 'Anuluj'}
        </Button>
        {!importResults && (
          <Button
            onClick={handleImport}
            variant="contained"
            disabled={!canImport}
            startIcon={importing ? <CircularProgress size={16} color="inherit" /> : null}
          >
            {importing 
              ? 'Importowanie...' 
              : `Importuj (${(preview?.toCreate.length || 0) + (preview?.toUpdate.length || 0)} poz.)`
            }
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

ImportPriceListDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  priceListId: PropTypes.string.isRequired,
  priceList: PropTypes.object,
  onImportComplete: PropTypes.func
};

export default ImportPriceListDialog;
