import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TableSortLabel, Button, CircularProgress, Chip,
  TextField, InputAdornment, Tooltip, IconButton, Alert, LinearProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Grid, MenuItem, Select,
  FormControl, InputLabel
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Inventory as InventoryIcon,
  ShoppingCart as ShoppingCartIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  BuildCircle as BuildCircleIcon,
  Edit as EditIcon,
  VerifiedUser as CertificateIcon,
  CloudUpload as UploadIcon,
  PictureAsPdf as PdfIcon,
  Delete as DeleteIcon,
  OpenInNew as OpenInNewIcon
} from '@mui/icons-material';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import {
  getSupplierProducts,
  rebuildSupplierCatalog,
  updateProductCertificate,
  uploadCertificateFile,
  deleteCertificateFile,
  CERTIFICATE_TYPES
} from '../../services/supplierProductService';

const SupplierProductCatalog = ({ supplierId }) => {
  const { t } = useTranslation('suppliers');
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();
  const fileInputRef = useRef(null);

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [orderBy, setOrderBy] = useState('productName');
  const [orderDirection, setOrderDirection] = useState('asc');

  // Stan dialogu certyfikatu
  const [certDialogOpen, setCertDialogOpen] = useState(false);
  const [certSaving, setCertSaving] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [fileDeleting, setFileDeleting] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [certForm, setCertForm] = useState({
    certificateUnit: '',
    certificateNumber: '',
    certificateType: '',
    certificateValidFrom: '',
    certificateValidTo: ''
  });

  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getSupplierProducts(supplierId);
      setProducts(data);
    } catch (error) {
      console.error('Błąd podczas pobierania produktów:', error);
    } finally {
      setLoading(false);
    }
  }, [supplierId]);

  useEffect(() => {
    if (supplierId) {
      fetchProducts();
    }
  }, [supplierId, fetchProducts]);

  const handleRebuildCatalog = async () => {
    try {
      setRebuilding(true);
      const result = await rebuildSupplierCatalog(supplierId);
      showSuccess(
        t('catalog.rebuildSuccess', {
          products: result.updated,
          orders: result.ordersProcessed
        })
      );
      await fetchProducts();
    } catch (error) {
      console.error('Błąd podczas przebudowy katalogu:', error);
      showError(t('catalog.rebuildFailed'));
    } finally {
      setRebuilding(false);
    }
  };

  const handleSort = (property) => {
    const isAsc = orderBy === property && orderDirection === 'asc';
    setOrderDirection(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const formatPrice = (price, currency = 'PLN') => {
    if (price === null || price === undefined) return '-';
    return `${Number(price).toFixed(4)} ${currency}`;
  };

  const formatDate = (date) => {
    if (!date) return '-';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '-';
    return d.toLocaleDateString('pl-PL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatQuantity = (quantity, unit) => {
    if (quantity === null || quantity === undefined) return '-';
    return `${Number(quantity).toLocaleString('pl-PL')} ${unit || ''}`.trim();
  };

  const formatDateForInput = (date) => {
    if (!date) return '';
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  };

  // Pobiera label typu certyfikatu
  const getCertTypeLabel = (typeValue) => {
    if (!typeValue) return '';
    const found = CERTIFICATE_TYPES.find(ct => ct.value === typeValue);
    return found ? found.label : typeValue;
  };

  // Otwiera dialog edycji certyfikatu
  const handleOpenCertDialog = (product, e) => {
    if (e) e.stopPropagation();
    setEditingProduct(product);
    setCertForm({
      certificateUnit: product.certificateUnit || '',
      certificateNumber: product.certificateNumber || '',
      certificateType: product.certificateType || '',
      certificateValidFrom: formatDateForInput(product.certificateValidFrom),
      certificateValidTo: formatDateForInput(product.certificateValidTo)
    });
    setCertDialogOpen(true);
  };

  const handleCloseCertDialog = () => {
    setCertDialogOpen(false);
    setEditingProduct(null);
    setCertForm({
      certificateUnit: '',
      certificateNumber: '',
      certificateType: '',
      certificateValidFrom: '',
      certificateValidTo: ''
    });
  };

  const handleCertFormChange = (field, value) => {
    setCertForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveCertificate = async () => {
    if (!editingProduct) return;
    try {
      setCertSaving(true);
      await updateProductCertificate(editingProduct.id, certForm);
      showSuccess(t('catalog.certificate.saveSuccess'));
      handleCloseCertDialog();
      await fetchProducts();
    } catch (error) {
      console.error('Błąd podczas zapisywania certyfikatu:', error);
      showError(t('catalog.certificate.saveFailed'));
    } finally {
      setCertSaving(false);
    }
  };

  // Upload pliku PDF
  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !editingProduct) return;

    // Reset inputu żeby można było wybrać ten sam plik ponownie
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    try {
      setFileUploading(true);
      await uploadCertificateFile(supplierId, editingProduct.id, file);
      showSuccess(t('catalog.certificate.fileUploadSuccess'));
      // Odśwież dane produktu w dialogu
      const refreshedProducts = await getSupplierProducts(supplierId);
      setProducts(refreshedProducts);
      const refreshedProduct = refreshedProducts.find(p => p.id === editingProduct.id);
      if (refreshedProduct) {
        setEditingProduct(refreshedProduct);
      }
    } catch (error) {
      console.error('Błąd podczas przesyłania pliku:', error);
      showError(error.message || t('catalog.certificate.fileUploadFailed'));
    } finally {
      setFileUploading(false);
    }
  };

  // Usuwanie pliku PDF
  const handleFileDelete = async () => {
    if (!editingProduct) return;
    try {
      setFileDeleting(true);
      await deleteCertificateFile(editingProduct.id);
      showSuccess(t('catalog.certificate.fileDeleteSuccess'));
      // Odśwież dane produktu w dialogu
      const refreshedProducts = await getSupplierProducts(supplierId);
      setProducts(refreshedProducts);
      const refreshedProduct = refreshedProducts.find(p => p.id === editingProduct.id);
      if (refreshedProduct) {
        setEditingProduct(refreshedProduct);
      }
    } catch (error) {
      console.error('Błąd podczas usuwania pliku:', error);
      showError(t('catalog.certificate.fileDeleteFailed'));
    } finally {
      setFileDeleting(false);
    }
  };

  // Określa status ważności certyfikatu
  const getCertificateStatus = (product) => {
    if (!product.certificateNumber && !product.certificateValidTo && !product.certificateType) {
      return 'none';
    }
    if (!product.certificateValidTo) {
      return 'info';
    }
    const now = new Date();
    const validTo = product.certificateValidTo instanceof Date
      ? product.certificateValidTo
      : new Date(product.certificateValidTo);

    if (isNaN(validTo.getTime())) return 'info';

    const daysLeft = Math.ceil((validTo - now) / (1000 * 60 * 60 * 24));

    if (daysLeft < 0) return 'expired';
    if (daysLeft <= 30) return 'expiring';
    return 'valid';
  };

  const getCertificateChip = (product) => {
    const status = getCertificateStatus(product);
    const typeLabel = getCertTypeLabel(product.certificateType);
    const chipLabel = typeLabel
      ? `${typeLabel}${product.certificateNumber ? ' | ' + product.certificateNumber : ''}`
      : product.certificateNumber || '';

    switch (status) {
      case 'valid':
        return (
          <Chip
            icon={<CertificateIcon />}
            label={chipLabel || t('catalog.certificate.valid')}
            size="small"
            color="success"
            variant="outlined"
          />
        );
      case 'expiring':
        return (
          <Chip
            icon={<CertificateIcon />}
            label={chipLabel || t('catalog.certificate.expiringSoon')}
            size="small"
            color="warning"
            variant="outlined"
          />
        );
      case 'expired':
        return (
          <Chip
            icon={<CertificateIcon />}
            label={chipLabel || t('catalog.certificate.expired')}
            size="small"
            color="error"
            variant="outlined"
          />
        );
      case 'info':
        return (
          <Chip
            icon={<CertificateIcon />}
            label={chipLabel}
            size="small"
            color="info"
            variant="outlined"
          />
        );
      default:
        return (
          <Typography variant="caption" color="text.disabled">
            —
          </Typography>
        );
    }
  };

  // Filtrowanie i sortowanie
  const filteredProducts = products
    .filter((product) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        (product.productName || '').toLowerCase().includes(term) ||
        (product.supplierProductCode || '').toLowerCase().includes(term) ||
        (product.certificateNumber || '').toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      let aVal = a[orderBy];
      let bVal = b[orderBy];

      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return orderDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      if (aVal instanceof Date && bVal instanceof Date) {
        return orderDirection === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }

      const aStr = String(aVal).toLowerCase();
      const bStr = String(bVal).toLowerCase();
      if (orderDirection === 'asc') {
        return aStr.localeCompare(bStr, 'pl');
      }
      return bStr.localeCompare(aStr, 'pl');
    });

  const getPriceTrend = (product) => {
    if (!product.minPrice || !product.maxPrice || product.orderCount < 2) {
      return null;
    }
    if (product.lastPrice > product.averagePrice) {
      return 'up';
    }
    if (product.lastPrice < product.averagePrice) {
      return 'down';
    }
    return 'stable';
  };

  return (
    <Paper sx={{ p: 3, mt: 3 }}>
      {/* Nagłówek */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <InventoryIcon color="primary" />
          <Typography variant="h6">
            {t('catalog.title')}
          </Typography>
          <Chip
            label={products.length}
            size="small"
            color="primary"
            variant="outlined"
          />
        </Box>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            startIcon={rebuilding ? <CircularProgress size={18} color="inherit" /> : <BuildCircleIcon />}
            onClick={handleRebuildCatalog}
            disabled={rebuilding || loading}
            variant="outlined"
            size="small"
          >
            {rebuilding ? t('catalog.rebuilding') : t('catalog.rebuild')}
          </Button>
          <IconButton
            onClick={fetchProducts}
            disabled={loading}
            size="small"
            title={t('catalog.refresh')}
          >
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Wyszukiwarka */}
      <Box sx={{ mb: 2 }}>
        <TextField
          size="small"
          placeholder={t('catalog.searchPlaceholder')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            )
          }}
          sx={{ minWidth: 300 }}
        />
      </Box>

      {/* Pasek ładowania */}
      {(loading || rebuilding) && <LinearProgress sx={{ mb: 1 }} />}

      {/* Tabela */}
      {!loading && filteredProducts.length === 0 ? (
        <Alert severity="info" sx={{ mt: 2 }}>
          {products.length === 0
            ? t('catalog.noProducts')
            : t('catalog.noSearchResults')
          }
        </Alert>
      ) : (
        <TableContainer sx={{ maxHeight: 500 }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'productName'}
                    direction={orderBy === 'productName' ? orderDirection : 'asc'}
                    onClick={() => handleSort('productName')}
                  >
                    {t('catalog.columns.product')}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'lastPrice'}
                    direction={orderBy === 'lastPrice' ? orderDirection : 'asc'}
                    onClick={() => handleSort('lastPrice')}
                  >
                    {t('catalog.columns.lastPrice')}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'averagePrice'}
                    direction={orderBy === 'averagePrice' ? orderDirection : 'asc'}
                    onClick={() => handleSort('averagePrice')}
                  >
                    {t('catalog.columns.avgPrice')}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="right">
                  {t('catalog.columns.priceRange')}
                </TableCell>
                <TableCell align="right">
                  <TableSortLabel
                    active={orderBy === 'totalOrderedQuantity'}
                    direction={orderBy === 'totalOrderedQuantity' ? orderDirection : 'asc'}
                    onClick={() => handleSort('totalOrderedQuantity')}
                  >
                    {t('catalog.columns.totalOrdered')}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center">
                  <TableSortLabel
                    active={orderBy === 'orderCount'}
                    direction={orderBy === 'orderCount' ? orderDirection : 'asc'}
                    onClick={() => handleSort('orderCount')}
                  >
                    {t('catalog.columns.orderCount')}
                  </TableSortLabel>
                </TableCell>
                <TableCell>
                  <TableSortLabel
                    active={orderBy === 'lastOrderDate'}
                    direction={orderBy === 'lastOrderDate' ? orderDirection : 'asc'}
                    onClick={() => handleSort('lastOrderDate')}
                  >
                    {t('catalog.columns.lastOrder')}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center">
                  <TableSortLabel
                    active={orderBy === 'certificateType'}
                    direction={orderBy === 'certificateType' ? orderDirection : 'asc'}
                    onClick={() => handleSort('certificateType')}
                  >
                    {t('catalog.columns.certificate')}
                  </TableSortLabel>
                </TableCell>
                <TableCell align="center" sx={{ width: 50 }}>
                  {/* Akcje */}
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredProducts.map((product) => {
                const trend = getPriceTrend(product);
                const certStatus = getCertificateStatus(product);

                return (
                  <TableRow
                    key={product.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="body2" fontWeight={500}>
                          {product.productName}
                        </Typography>
                        {product.supplierProductCode && (
                          <Typography variant="caption" color="text.secondary">
                            {t('catalog.supplierCode')}: {product.supplierProductCode}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Typography variant="body2" fontWeight={500}>
                          {formatPrice(product.lastPrice, product.currency)}
                        </Typography>
                        {trend === 'up' && (
                          <Tooltip title={t('catalog.priceUp')}>
                            <TrendingUpIcon fontSize="small" color="error" />
                          </Tooltip>
                        )}
                        {trend === 'down' && (
                          <Tooltip title={t('catalog.priceDown')}>
                            <TrendingDownIcon fontSize="small" color="success" />
                          </Tooltip>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {formatPrice(product.averagePrice, product.currency)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="caption" color="text.secondary">
                        {formatPrice(product.minPrice, product.currency)}
                        {' - '}
                        {formatPrice(product.maxPrice, product.currency)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2">
                        {formatQuantity(product.totalOrderedQuantity, product.unit)}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        icon={<ShoppingCartIcon />}
                        label={product.orderCount || 0}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell>
                      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                        <Typography variant="body2">
                          {formatDate(product.lastOrderDate)}
                        </Typography>
                        {product.lastPurchaseOrderNumber && (
                          <Typography
                            variant="caption"
                            color="primary"
                            sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline' } }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (product.lastPurchaseOrderId) {
                                navigate(`/purchase-orders/${product.lastPurchaseOrderId}`);
                              }
                            }}
                          >
                            {product.lastPurchaseOrderNumber}
                          </Typography>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip
                        title={
                          certStatus !== 'none'
                            ? `${product.certificateUnit ? t('catalog.certificate.unit') + ': ' + product.certificateUnit + ' | ' : ''}${t('catalog.certificate.validFromTo')}: ${formatDate(product.certificateValidFrom)} - ${formatDate(product.certificateValidTo)}${product.certificateFileUrl ? ' | PDF' : ''}`
                            : t('catalog.certificate.noCertificate')
                        }
                      >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'center' }}>
                          {getCertificateChip(product)}
                          {product.certificateFileUrl && (
                            <Tooltip title={t('catalog.certificate.openPdf')}>
                              <IconButton
                                size="small"
                                color="error"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(product.certificateFileUrl, '_blank');
                                }}
                              >
                                <PdfIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title={t('catalog.certificate.edit')}>
                        <IconButton
                          size="small"
                          onClick={(e) => handleOpenCertDialog(product, e)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Dialog edycji certyfikatu */}
      <Dialog
        open={certDialogOpen}
        onClose={handleCloseCertDialog}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CertificateIcon color="primary" />
          {t('catalog.certificate.dialogTitle')}
        </DialogTitle>
        <DialogContent>
          {editingProduct && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                {t('catalog.certificate.forProduct')}: <strong>{editingProduct.productName}</strong>
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{t('catalog.certificate.type')}</InputLabel>
                    <Select
                      value={certForm.certificateType}
                      onChange={(e) => handleCertFormChange('certificateType', e.target.value)}
                      label={t('catalog.certificate.type')}
                    >
                      <MenuItem value="">
                        <em>{t('catalog.certificate.noType')}</em>
                      </MenuItem>
                      {CERTIFICATE_TYPES.map((ct) => (
                        <MenuItem key={ct.value} value={ct.value}>
                          {ct.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('catalog.certificate.number')}
                    value={certForm.certificateNumber}
                    onChange={(e) => handleCertFormChange('certificateNumber', e.target.value)}
                    placeholder={t('catalog.certificate.numberPlaceholder')}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <TextField
                    fullWidth
                    size="small"
                    label={t('catalog.certificate.unit')}
                    value={certForm.certificateUnit}
                    onChange={(e) => handleCertFormChange('certificateUnit', e.target.value)}
                    placeholder={t('catalog.certificate.unitPlaceholder')}
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label={t('catalog.certificate.validFrom')}
                    value={certForm.certificateValidFrom}
                    onChange={(e) => handleCertFormChange('certificateValidFrom', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid item xs={6} sm={3}>
                  <TextField
                    fullWidth
                    size="small"
                    type="date"
                    label={t('catalog.certificate.validTo')}
                    value={certForm.certificateValidTo}
                    onChange={(e) => handleCertFormChange('certificateValidTo', e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>

                {/* Sekcja pliku PDF */}
                <Grid item xs={12}>
                  <Box sx={{
                    border: '1px dashed',
                    borderColor: 'divider',
                    borderRadius: 1,
                    p: 2,
                    mt: 1
                  }}>
                    <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <PdfIcon fontSize="small" color="error" />
                      {t('catalog.certificate.pdfSection')}
                    </Typography>

                    {editingProduct.certificateFileUrl ? (
                      // Plik istnieje
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                        <Chip
                          icon={<PdfIcon />}
                          label={editingProduct.certificateFileName || 'certificate.pdf'}
                          color="error"
                          variant="outlined"
                          size="small"
                          onClick={() => window.open(editingProduct.certificateFileUrl, '_blank')}
                          onDelete={handleFileDelete}
                          deleteIcon={
                            fileDeleting
                              ? <CircularProgress size={16} />
                              : <DeleteIcon fontSize="small" />
                          }
                        />
                        <Tooltip title={t('catalog.certificate.openPdf')}>
                          <IconButton
                            size="small"
                            onClick={() => window.open(editingProduct.certificateFileUrl, '_blank')}
                          >
                            <OpenInNewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    ) : (
                      // Brak pliku - przycisk uploadu
                      <Box>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="application/pdf"
                          style={{ display: 'none' }}
                          onChange={handleFileUpload}
                        />
                        <Button
                          variant="outlined"
                          size="small"
                          startIcon={fileUploading ? <CircularProgress size={18} /> : <UploadIcon />}
                          onClick={() => fileInputRef.current?.click()}
                          disabled={fileUploading}
                        >
                          {fileUploading
                            ? t('catalog.certificate.fileUploading')
                            : t('catalog.certificate.fileUpload')
                          }
                        </Button>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                          {t('catalog.certificate.fileHint')}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseCertDialog} disabled={certSaving}>
            {t('catalog.certificate.cancel')}
          </Button>
          <Button
            onClick={handleSaveCertificate}
            variant="contained"
            disabled={certSaving || fileUploading || fileDeleting}
            startIcon={certSaving ? <CircularProgress size={18} /> : <CertificateIcon />}
          >
            {certSaving ? t('catalog.certificate.saving') : t('catalog.certificate.save')}
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
};

export default SupplierProductCatalog;
