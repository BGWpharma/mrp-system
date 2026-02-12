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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper
} from '@mui/material';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import DownloadIcon from '@mui/icons-material/Download';
import {
  parseOrderItemsCSV,
  matchRecipesFromCSV,
  prepareOrderItemsFromCSV,
  generateOrderItemsTemplate
} from '../../services/orderItemsImportService';
import { useTranslation } from '../../hooks/useTranslation';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const ImportOrderItemsDialog = ({ open, onClose, customerId, onImport }) => {
  const [importFile, setImportFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);

  const fileInputRef = useRef(null);
  const { t } = useTranslation('orders');

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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileSelect = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError(t('orderForm.import.errorFileType', 'Wybierz plik CSV'));
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(t('orderForm.import.errorFileSize', 'Plik jest za duży (max 5 MB)'));
      return;
    }

    setImportFile(file);
    setError(null);
    setPreview(null);

    try {
      setLoading(true);
      const text = await file.text();

      const { items, skippedCount, errors } = parseOrderItemsCSV(text);

      if (items.length === 0) {
        setError(
          t('orderForm.import.noValidRows', 'Brak poprawnych wierszy do importu. Wiersze z ilością 0 lub pustą są pomijane.')
        );
        setPreview(null);
        setLoading(false);
        return;
      }

      const { matched, notFound } = await matchRecipesFromCSV(items);

      setPreview({
        matched,
        notFound,
        skippedCount,
        parseErrors: errors
      });
    } catch (err) {
      console.error('Błąd parsowania CSV:', err);
      setError(err.message || t('orderForm.import.errorParse', 'Błąd podczas analizy pliku CSV'));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!preview || !preview.matched.length || importing) return;

    try {
      setImporting(true);
      const orderItems = await prepareOrderItemsFromCSV(preview.matched, customerId);
      onImport(orderItems);
      handleClose();
    } catch (err) {
      console.error('Błąd przygotowywania pozycji:', err);
      setError(err.message || t('orderForm.import.errorPrepare', 'Błąd podczas przygotowywania pozycji'));
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csv = generateOrderItemsTemplate();
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'szablon_pozycji_zamowienia.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const hasDataToImport = preview && preview.matched.length > 0;

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>
        {t('orderForm.import.title', 'Import pozycji z CSV (receptury)')}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {!customerId ? (
            <Alert severity="error">
              {t('orderForm.import.requireCustomer', 'Wybierz klienta przed importem, aby ceny zostały prawidłowo przypisane z listy cenowej.')}
            </Alert>
          ) : (
            <Alert severity="info">
              <Typography variant="body2" gutterBottom>
                <strong>{t('orderForm.import.formatTitle', 'Format pliku CSV:')}</strong>
              </Typography>
              <Typography variant="body2" component="div">
                {t('orderForm.import.formatDescription', '• Wymagane kolumny: SKU (nazwa receptury), QUANTITY (ilość)')}
                <br />
                {t('orderForm.import.formatSkip', '• Wiersze z QUANTITY pustym lub 0 są pomijane')}
                <br />
                {t('orderForm.import.formatPrices', '• Ceny są automatycznie pobierane z listy cenowej klienta')}
              </Typography>
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={handleDownloadTemplate}
              disabled={!customerId}
            >
              {t('orderForm.import.downloadTemplate', 'Pobierz szablon')}
            </Button>
            <Button
              variant="contained"
              component="label"
              startIcon={loading ? <CircularProgress size={20} /> : <UploadFileIcon />}
              disabled={loading || !customerId}
            >
              {t('orderForm.import.selectFile', 'Wybierz plik CSV')}
              <input
                ref={fileInputRef}
                type="file"
                hidden
                accept=".csv"
                onChange={handleFileSelect}
              />
            </Button>
          </Box>

          {importFile && (
            <Alert severity="success">
              {t('orderForm.import.fileLoaded', 'Wczytano plik:')} {importFile.name}
            </Alert>
          )}

          {error && (
            <Alert severity="error">{error}</Alert>
          )}

          {preview && (
            <>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Typography variant="body2" color="success.main">
                  {t('orderForm.import.matchedCount', {
                    defaultValue: 'Do dodania: {{count}}',
                    count: preview.matched.length
                  })}
                </Typography>
                {preview.skippedCount > 0 && (
                  <Typography variant="body2" color="text.secondary">
                    {t('orderForm.import.skippedCount', {
                      defaultValue: 'Pominięto (quantity 0/puste): {{count}}',
                      count: preview.skippedCount
                    })}
                  </Typography>
                )}
                {preview.notFound.length > 0 && (
                  <Typography variant="body2" color="warning.main">
                    {t('orderForm.import.notFoundCount', {
                      defaultValue: 'Nie znaleziono: {{count}}',
                      count: preview.notFound.length
                    })}
                  </Typography>
                )}
              </Box>

              {preview.matched.length > 0 && (
                <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 280 }}>
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>{t('orderForm.import.tableSku', 'SKU')}</TableCell>
                        <TableCell align="right">{t('orderForm.import.tableQuantity', 'Ilość')}</TableCell>
                        <TableCell>{t('orderForm.import.tableUnit', 'Jedn.')}</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.matched.map((row, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{row.productName}</TableCell>
                          <TableCell align="right">{row.quantity}</TableCell>
                          <TableCell>{row.unit || 'szt.'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}

              {preview.notFound.length > 0 && (
                <Alert severity="warning">
                  <Typography variant="subtitle2" gutterBottom>
                    {t('orderForm.import.notFoundList', 'Nie znaleziono w bazie:')}
                  </Typography>
                  <Typography variant="body2">
                    {preview.notFound.map((n) => n.sku).join(', ')}
                  </Typography>
                </Alert>
              )}
            </>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={importing}>
          {t('orderForm.buttons.cancel', 'Anuluj')}
        </Button>
        <Button
          variant="contained"
          onClick={handleImport}
          disabled={!hasDataToImport || importing || !customerId}
          startIcon={importing ? <CircularProgress size={16} /> : null}
        >
          {importing
            ? t('orderForm.import.importing', 'Importowanie...')
            : t('orderForm.import.addToOrder', 'Dodaj do zamówienia') +
              (hasDataToImport ? ` (${preview.matched.length})` : '')}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

ImportOrderItemsDialog.propTypes = {
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  customerId: PropTypes.string,
  onImport: PropTypes.func.isRequired
};

ImportOrderItemsDialog.defaultProps = {
  customerId: null
};

export default ImportOrderItemsDialog;
