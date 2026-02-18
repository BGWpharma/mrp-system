// src/components/purchaseOrders/PODocumentScanner.js
/**
 * Komponent do skanowania dokumentów (WZ, faktura) za pomocą AI
 * Używany bezpośrednio w formularzu PO
 */

import React, { useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  Tabs,
  Tab,
  CircularProgress,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  Paper,
  Tooltip,
  Collapse,
  Table,
  TableBody,
  TableCell,
  TableRow,
  alpha
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Description as DocumentIcon,
  Receipt as InvoiceIcon,
  LocalShipping as DeliveryIcon,
  Check as CheckIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Close as CloseIcon,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
  Refresh as RefreshIcon,
  Delete as DeleteIcon
} from '@mui/icons-material';
import { useTranslation } from '../../hooks/useTranslation';
import { useAuth } from '../../hooks/useAuth';
import { useNotification } from '../../hooks/useNotification';
import {
  parseDeliveryDocument,
  parseInvoice,
  matchItemsToPO,
  prepareDeliveryUpdates,
  prepareInvoiceUpdates,
  validateFile,
  SUPPORTED_MIME_TYPES
} from '../../services/documentOcrService';

// Typy dokumentów
const DOCUMENT_TYPES = {
  DELIVERY: 'delivery',
  INVOICE: 'invoice'
};

const PODocumentScanner = ({ 
  open, 
  onClose, 
  poItems = [], 
  onApplyDeliveryUpdates,
  onApplyInvoiceUpdates,
  disabled = false 
}) => {
  const { t } = useTranslation('purchaseOrders');
  const { currentUser } = useAuth();
  const { showSuccess, showError, showWarning } = useNotification();
  const fileInputRef = useRef(null);
  
  // Stan
  const [activeTab, setActiveTab] = useState(DOCUMENT_TYPES.DELIVERY);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [parsedData, setParsedData] = useState(null);
  const [matchedItems, setMatchedItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState({});
  const [expandedItems, setExpandedItems] = useState({});
  const [showRawData, setShowRawData] = useState(false);
  
  // Reset stanu
  const resetState = useCallback(() => {
    setFile(null);
    setLoading(false);
    setError(null);
    setParsedData(null);
    setMatchedItems([]);
    setSelectedItems({});
    setExpandedItems({});
  }, []);
  
  // Obsługa zmiany zakładki
  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
    resetState();
  };
  
  // Skanowanie dokumentu - przyjmuje tabType jako argument aby uniknąć stale closure
  const scanDocument = async (fileToScan, tabType) => {
    const targetFile = fileToScan || file;
    if (!targetFile) return;
    
    setLoading(true);
    setError(null);
    
    console.log('[PODocumentScanner] 🔍 Skanowanie dokumentu, typ:', tabType);
    
    try {
      let result;
      
      if (tabType === DOCUMENT_TYPES.DELIVERY) {
        result = await parseDeliveryDocument(targetFile, poItems, currentUser?.uid);
      } else {
        result = await parseInvoice(targetFile, poItems, currentUser?.uid);
      }
      
      if (!result.success) {
        throw new Error(result.error || 'Nie udało się przeanalizować dokumentu');
      }
      
      console.log('[PODocumentScanner] 📄 Dane z OCR:', JSON.stringify(result.data, null, 2));
      setParsedData(result.data);
      
      // Dopasuj pozycje do PO
      const items = result.data.items || [];
      console.log('[PODocumentScanner] 📦 Pozycje przed dopasowaniem:', JSON.stringify(items, null, 2));
      
      const matched = matchItemsToPO(items, poItems);
      console.log('[PODocumentScanner] ✅ Pozycje po dopasowaniu:', JSON.stringify(matched, null, 2));
      
      setMatchedItems(matched);
      
      // Domyślnie zaznacz pozycje z wysoką pewnością
      const defaultSelected = {};
      matched.forEach((item, index) => {
        if (item.matchConfidence >= 0.7 && item.matchType !== 'none') {
          defaultSelected[index] = true;
        }
      });
      setSelectedItems(defaultSelected);
      
      // Pokaż ostrzeżenia
      if (result.data.warnings?.length > 0) {
        showWarning(result.data.warnings.join(', '));
      }
      
    } catch (err) {
      console.error('Błąd skanowania:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  // Obsługa wyboru pliku
  const handleFileSelect = useCallback(async (event) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;
    
    // Walidacja
    const validation = validateFile(selectedFile);
    if (!validation.valid) {
      showError(validation.error);
      return;
    }
    
    setFile(selectedFile);
    setError(null);
    setParsedData(null);
    setMatchedItems([]);
    
    // Automatycznie rozpocznij skanowanie z aktualnym typem zakładki
    await scanDocument(selectedFile, activeTab);
  }, [showError, activeTab]);
  
  // Obsługa drag & drop
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };
  
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      const validation = validateFile(droppedFile);
      if (!validation.valid) {
        showError(validation.error);
        return;
      }
      
      setFile(droppedFile);
      scanDocument(droppedFile, activeTab);
    }
  }, [showError, activeTab]);
  
  // Przełączanie zaznaczenia pozycji
  const toggleItemSelection = (index) => {
    setSelectedItems(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };
  
  // Przełączanie rozwinięcia szczegółów
  const toggleItemExpanded = (index) => {
    setExpandedItems(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };
  
  // Zaznacz/odznacz wszystkie
  const toggleSelectAll = () => {
    const allSelected = Object.keys(selectedItems).length === matchedItems.filter(i => i.matchType !== 'none').length;
    
    if (allSelected) {
      setSelectedItems({});
    } else {
      const newSelected = {};
      matchedItems.forEach((item, index) => {
        if (item.matchType !== 'none') {
          newSelected[index] = true;
        }
      });
      setSelectedItems(newSelected);
    }
  };
  
  // Zastosuj zmiany
  const handleApply = async () => {
    const selectedIndices = Object.keys(selectedItems)
      .filter(key => selectedItems[key])
      .map(key => parseInt(key));
    
    if (selectedIndices.length === 0) {
      showError('Wybierz przynajmniej jedną pozycję');
      return;
    }
    
    const selectedMatchedItems = selectedIndices.map(i => matchedItems[i]);
    
    try {
      if (activeTab === DOCUMENT_TYPES.DELIVERY) {
        const updates = prepareDeliveryUpdates(selectedMatchedItems);
        
        await onApplyDeliveryUpdates({
          updates,
          documentNumber: parsedData.documentNumber,
          deliveryDate: parsedData.deliveryDate
        });
        
        showSuccess(t('purchaseOrders.deliveryDocumentOcr.success', { count: updates.length }));
      } else {
        const { updates, invoiceInfo } = prepareInvoiceUpdates(selectedMatchedItems, parsedData);
        
        await onApplyInvoiceUpdates({
          updates,
          invoiceInfo
        });
        
        showSuccess(t('purchaseOrders.invoiceOcr.success', { 
          count: updates.length, 
          invoice: invoiceInfo.invoiceNumber 
        }));
      }
      
      onClose();
      resetState();
      
    } catch (err) {
      console.error('Błąd aplikowania zmian:', err);
      showError(err.message);
    }
  };
  
  // Usunięcie pliku
  const handleRemoveFile = () => {
    resetState();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
  
  // Liczba zaznaczonych pozycji
  const selectedCount = Object.values(selectedItems).filter(Boolean).length;
  const matchedCount = matchedItems.filter(i => i.matchType !== 'none').length;
  
  // Render ikony pewności dopasowania
  const renderConfidenceIcon = (confidence) => {
    if (confidence >= 0.8) {
      return <CheckIcon sx={{ color: 'success.main' }} />;
    } else if (confidence >= 0.5) {
      return <WarningIcon sx={{ color: 'warning.main' }} />;
    }
    return <ErrorIcon sx={{ color: 'error.main' }} />;
  };
  
  // Render chipu pewności
  const renderConfidenceChip = (confidence, matchType) => {
    if (matchType === 'none') {
      return (
        <Chip 
          size="small" 
          label="Nie dopasowano" 
          color="error" 
          variant="outlined"
        />
      );
    }
    
    const percent = Math.round((confidence || 0) * 100);
    const color = confidence >= 0.8 ? 'success' : confidence >= 0.5 ? 'warning' : 'error';
    
    return (
      <Chip 
        size="small" 
        label={`${percent}%`}
        color={color}
        icon={renderConfidenceIcon(confidence)}
      />
    );
  };

  return (
    <Dialog 
      open={open} 
      onClose={onClose} 
      maxWidth="md" 
      fullWidth
      PaperProps={{
        sx: { minHeight: '60vh' }
      }}
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Box display="flex" alignItems="center" gap={1}>
            <DocumentIcon color="primary" />
            <Typography variant="h6">
              {t('purchaseOrders.deliveryDocumentOcr.title', 'Skanuj dokument')}
            </Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
        <Tabs value={activeTab} onChange={handleTabChange}>
          <Tab 
            icon={<DeliveryIcon />} 
            iconPosition="start"
            label={t('purchaseOrders.deliveryDocumentOcr.scanButton', 'WZ / Dostawa')}
            value={DOCUMENT_TYPES.DELIVERY}
          />
          <Tab 
            icon={<InvoiceIcon />} 
            iconPosition="start"
            label={t('purchaseOrders.invoiceOcr.scanButton', 'Faktura')}
            value={DOCUMENT_TYPES.INVOICE}
          />
        </Tabs>
      </Box>

      <DialogContent>
        {/* Obszar uploadu */}
        {!file && !loading && (
          <Paper
            sx={{
              border: '2px dashed',
              borderColor: 'divider',
              borderRadius: 2,
              p: 4,
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s',
              '&:hover': { 
                borderColor: 'primary.main', 
                bgcolor: (theme) => alpha(theme.palette.primary.main, 0.04)
              }
            }}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              hidden
              accept={SUPPORTED_MIME_TYPES.join(',')}
              onChange={handleFileSelect}
            />
            <UploadIcon sx={{ fontSize: 64, color: 'text.secondary', mb: 2 }} />
            <Typography variant="h6" gutterBottom>
              {t('purchaseOrders.deliveryDocumentOcr.uploadArea.title', 'Przeciągnij lub kliknij aby wybrać plik')}
            </Typography>
            <Typography color="text.secondary">
              {t('purchaseOrders.deliveryDocumentOcr.uploadArea.subtitle', 'Obsługiwane: JPG, PNG, WEBP, PDF')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('purchaseOrders.deliveryDocumentOcr.uploadArea.maxSize', 'Maksymalny rozmiar: 20MB')}
            </Typography>
          </Paper>
        )}

        {/* Loading */}
        {loading && (
          <Box textAlign="center" py={6}>
            <CircularProgress size={56} />
            <Typography sx={{ mt: 2 }} variant="h6">
              {activeTab === DOCUMENT_TYPES.DELIVERY 
                ? t('purchaseOrders.deliveryDocumentOcr.analyzing', 'Analizuję dokument dostawy...')
                : t('purchaseOrders.invoiceOcr.analyzing', 'Analizuję fakturę...')
              }
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              To może potrwać kilka sekund
            </Typography>
          </Box>
        )}

        {/* Błąd */}
        {error && (
          <Alert 
            severity="error" 
            sx={{ mb: 2 }}
            action={
              <Button color="inherit" size="small" onClick={() => scanDocument(file, activeTab)}>
                <RefreshIcon sx={{ mr: 0.5 }} /> Spróbuj ponownie
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {/* Wynik - informacje o dokumencie */}
        {parsedData && !loading && (
          <>
            {/* Nagłówek dokumentu */}
            <Paper sx={{ p: 2, mb: 2, bgcolor: 'background.default' }}>
              <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                <Box>
                  <Typography variant="subtitle2" color="text.secondary">
                    {activeTab === DOCUMENT_TYPES.DELIVERY ? 'Dokument dostawy' : 'Faktura'}
                  </Typography>
                  <Typography variant="h6">
                    {activeTab === DOCUMENT_TYPES.DELIVERY 
                      ? parsedData.documentNumber || 'Brak numeru'
                      : parsedData.invoiceNumber || 'Brak numeru'
                    }
                  </Typography>
                  {parsedData.supplier && (
                    <Typography variant="body2" color="text.secondary">
                      {typeof parsedData.supplier === 'string' 
                        ? parsedData.supplier 
                        : parsedData.supplier.name
                      }
                    </Typography>
                  )}
                </Box>
                <Box textAlign="right">
                  {activeTab === DOCUMENT_TYPES.DELIVERY && parsedData.deliveryDate && (
                    <Chip 
                      size="small" 
                      label={`Data: ${parsedData.deliveryDate}`}
                      sx={{ mb: 0.5 }}
                    />
                  )}
                  {activeTab === DOCUMENT_TYPES.INVOICE && (
                    <>
                      {parsedData.invoiceDate && (
                        <Chip 
                          size="small" 
                          label={`Data: ${parsedData.invoiceDate}`}
                          sx={{ mb: 0.5, mr: 0.5 }}
                        />
                      )}
                      {parsedData.summary?.totalGross && (
                        <Chip 
                          size="small" 
                          color="primary"
                          label={`${parsedData.summary.totalGross.toFixed(2)} ${parsedData.currency || 'PLN'}`}
                        />
                      )}
                    </>
                  )}
                  <Box mt={1}>
                    <Tooltip title="Usuń plik i skanuj ponownie">
                      <IconButton size="small" onClick={handleRemoveFile}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                </Box>
              </Box>
            </Paper>

            {/* Podsumowanie dopasowań */}
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
              <Typography variant="subtitle1">
                {t('purchaseOrders.deliveryDocumentOcr.results.matchesFound', { count: matchedCount })}
                {matchedItems.length > matchedCount && (
                  <Typography component="span" color="warning.main" sx={{ ml: 1 }}>
                    ({matchedItems.length - matchedCount} nie dopasowano)
                  </Typography>
                )}
              </Typography>
              
              <Button 
                size="small" 
                onClick={toggleSelectAll}
                disabled={matchedCount === 0}
              >
                {selectedCount === matchedCount ? 'Odznacz wszystkie' : 'Zaznacz wszystkie'}
              </Button>
            </Box>

            {/* Lista pozycji */}
            <List sx={{ 
              maxHeight: 350, 
              overflow: 'auto',
              border: 1,
              borderColor: 'divider',
              borderRadius: 1
            }}>
              {matchedItems.map((item, index) => {
                const isSelected = selectedItems[index] || false;
                const isExpanded = expandedItems[index] || false;
                const isMatched = item.matchType !== 'none';
                
                return (
                  <React.Fragment key={index}>
                    <ListItem
                      sx={{
                        bgcolor: isSelected 
                          ? (theme) => alpha(theme.palette.primary.main, 0.08)
                          : 'transparent',
                        opacity: isMatched ? 1 : 0.6
                      }}
                      secondaryAction={
                        <Box display="flex" alignItems="center" gap={1}>
                          {renderConfidenceChip(item.matchConfidence, item.matchType)}
                          <IconButton 
                            size="small" 
                            onClick={() => toggleItemExpanded(index)}
                          >
                            {isExpanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                          </IconButton>
                        </Box>
                      }
                    >
                      <ListItemIcon>
                        <Checkbox
                          edge="start"
                          checked={isSelected}
                          onChange={() => toggleItemSelection(index)}
                          disabled={!isMatched}
                        />
                      </ListItemIcon>
                      <ListItemText
                        primary={
                          <Box>
                            <Typography variant="body1" component="span">
                              {item.documentProductName}
                            </Typography>
                            {item.matchedPoItemName && item.matchedPoItemName !== item.documentProductName && (
                              <Typography 
                                variant="caption" 
                                color="text.secondary"
                                sx={{ ml: 1 }}
                              >
                                → {item.matchedPoItemName}
                              </Typography>
                            )}
                          </Box>
                        }
                        secondaryTypographyProps={{ component: 'div' }}
                        secondary={
                          <Box display="flex" gap={1} flexWrap="wrap" mt={0.5}>
                            {activeTab === DOCUMENT_TYPES.DELIVERY ? (
                              <>
                                {item.deliveredQuantity !== undefined && (
                                  <Chip 
                                    size="small" 
                                    variant="outlined"
                                    label={`Ilość: ${item.deliveredQuantity} ${item.unit || ''}`}
                                  />
                                )}
                                {item.lotNumber && (
                                  <Chip 
                                    size="small" 
                                    variant="outlined"
                                    label={`LOT: ${item.lotNumber}`}
                                  />
                                )}
                                {item.expiryDate && (
                                  <Chip 
                                    size="small" 
                                    variant="outlined"
                                    label={`Ważność: ${item.expiryDate}`}
                                  />
                                )}
                              </>
                            ) : (
                              <>
                                {item.quantity !== undefined && (
                                  <Chip 
                                    size="small" 
                                    variant="outlined"
                                    label={`Ilość: ${item.quantity} ${item.unit || ''}`}
                                  />
                                )}
                                {item.unitPriceNet !== undefined && (
                                  <Chip 
                                    size="small" 
                                    variant="outlined"
                                    color="primary"
                                    label={`Cena: ${item.unitPriceNet.toFixed(2)}`}
                                  />
                                )}
                                {item.vatRate !== undefined && (
                                  <Chip 
                                    size="small" 
                                    variant="outlined"
                                    label={`VAT: ${item.vatRate}%`}
                                  />
                                )}
                              </>
                            )}
                          </Box>
                        }
                      />
                    </ListItem>
                    
                    {/* Rozwinięte szczegóły */}
                    <Collapse in={isExpanded}>
                      <Box sx={{ pl: 9, pr: 2, pb: 2, bgcolor: 'action.hover' }}>
                        <Table size="small">
                          <TableBody>
                            {activeTab === DOCUMENT_TYPES.DELIVERY ? (
                              <>
                                <TableRow>
                                  <TableCell width="40%">Nazwa z dokumentu</TableCell>
                                  <TableCell>{item.documentProductName}</TableCell>
                                </TableRow>
                                {item.matchedPoItemName && (
                                  <TableRow>
                                    <TableCell>Dopasowano do</TableCell>
                                    <TableCell>{item.matchedPoItemName}</TableCell>
                                  </TableRow>
                                )}
                                <TableRow>
                                  <TableCell>Dostarczona ilość</TableCell>
                                  <TableCell>{item.deliveredQuantity} {item.unit}</TableCell>
                                </TableRow>
                                {item.lotNumber && (
                                  <TableRow>
                                    <TableCell>Numer partii (LOT)</TableCell>
                                    <TableCell>{item.lotNumber}</TableCell>
                                  </TableRow>
                                )}
                                {item.expiryDate && (
                                  <TableRow>
                                    <TableCell>Data ważności</TableCell>
                                    <TableCell>{item.expiryDate}</TableCell>
                                  </TableRow>
                                )}
                                {item.notes && (
                                  <TableRow>
                                    <TableCell>Uwagi</TableCell>
                                    <TableCell>{item.notes}</TableCell>
                                  </TableRow>
                                )}
                              </>
                            ) : (
                              <>
                                <TableRow>
                                  <TableCell width="40%">Nazwa z faktury</TableCell>
                                  <TableCell>{item.documentProductName}</TableCell>
                                </TableRow>
                                {item.matchedPoItemName && (
                                  <TableRow>
                                    <TableCell>Dopasowano do</TableCell>
                                    <TableCell>{item.matchedPoItemName}</TableCell>
                                  </TableRow>
                                )}
                                <TableRow>
                                  <TableCell>Ilość</TableCell>
                                  <TableCell>{item.quantity} {item.unit}</TableCell>
                                </TableRow>
                                <TableRow>
                                  <TableCell>Cena jednostkowa netto</TableCell>
                                  <TableCell>{item.unitPriceNet?.toFixed(2)} {parsedData.currency}</TableCell>
                                </TableRow>
                                <TableRow>
                                  <TableCell>Stawka VAT</TableCell>
                                  <TableCell>{item.vatRate}%</TableCell>
                                </TableRow>
                                <TableRow>
                                  <TableCell>Wartość netto</TableCell>
                                  <TableCell>{item.totalNet?.toFixed(2)} {parsedData.currency}</TableCell>
                                </TableRow>
                                <TableRow>
                                  <TableCell>Wartość brutto</TableCell>
                                  <TableCell>{item.totalGross?.toFixed(2)} {parsedData.currency}</TableCell>
                                </TableRow>
                              </>
                            )}
                          </TableBody>
                        </Table>
                      </Box>
                    </Collapse>
                    
                    {index < matchedItems.length - 1 && <Divider />}
                  </React.Fragment>
                );
              })}
              
              {matchedItems.length === 0 && !loading && (
                <ListItem>
                  <ListItemText 
                    primary="Nie znaleziono pozycji w dokumencie"
                    secondary="Spróbuj wgrać inny dokument lub sprawdź jakość skanu"
                  />
                </ListItem>
              )}
            </List>

            {/* Podsumowanie faktury */}
            {activeTab === DOCUMENT_TYPES.INVOICE && parsedData.summary && (
              <Paper sx={{ p: 2, mt: 2, bgcolor: 'primary.50' }}>
                <Typography variant="subtitle2" gutterBottom>
                  Podsumowanie faktury
                </Typography>
                <Box display="flex" gap={3}>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Netto</Typography>
                    <Typography variant="body1">
                      {parsedData.summary.totalNet?.toFixed(2)} {parsedData.currency}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">VAT</Typography>
                    <Typography variant="body1">
                      {parsedData.summary.totalVat?.toFixed(2)} {parsedData.currency}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary">Brutto</Typography>
                    <Typography variant="h6" color="primary">
                      {parsedData.summary.totalGross?.toFixed(2)} {parsedData.currency}
                    </Typography>
                  </Box>
                  {parsedData.dueDate && (
                    <Box>
                      <Typography variant="caption" color="text.secondary">Termin płatności</Typography>
                      <Typography variant="body1">{parsedData.dueDate}</Typography>
                    </Box>
                  )}
                </Box>
              </Paper>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          {t('common.cancel', 'Anuluj')}
        </Button>
        <Button
          variant="contained"
          onClick={handleApply}
          disabled={loading || selectedCount === 0}
          startIcon={<CheckIcon />}
        >
          {t('purchaseOrders.deliveryDocumentOcr.actions.applyCount', { count: selectedCount })}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default PODocumentScanner;

