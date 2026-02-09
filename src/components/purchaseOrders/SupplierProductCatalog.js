import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, TableSortLabel, Button, CircularProgress, Chip,
  TextField, InputAdornment, Tooltip, IconButton, Alert, LinearProgress
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Search as SearchIcon,
  Inventory as InventoryIcon,
  ShoppingCart as ShoppingCartIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  BuildCircle as BuildCircleIcon
} from '@mui/icons-material';
import { useNotification } from '../../hooks/useNotification';
import { useTranslation } from '../../hooks/useTranslation';
import {
  getSupplierProducts,
  rebuildSupplierCatalog
} from '../../services/supplierProductService';

const SupplierProductCatalog = ({ supplierId }) => {
  const { t } = useTranslation('suppliers');
  const navigate = useNavigate();
  const { showSuccess, showError } = useNotification();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [rebuilding, setRebuilding] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [orderBy, setOrderBy] = useState('productName');
  const [orderDirection, setOrderDirection] = useState('asc');

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

  // Filtrowanie i sortowanie
  const filteredProducts = products
    .filter((product) => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (
        (product.productName || '').toLowerCase().includes(term) ||
        (product.supplierProductCode || '').toLowerCase().includes(term)
      );
    })
    .sort((a, b) => {
      let aVal = a[orderBy];
      let bVal = b[orderBy];

      // Obsługa null/undefined
      if (aVal === null || aVal === undefined) aVal = '';
      if (bVal === null || bVal === undefined) bVal = '';

      // Sortowanie numeryczne
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return orderDirection === 'asc' ? aVal - bVal : bVal - aVal;
      }

      // Sortowanie dat
      if (aVal instanceof Date && bVal instanceof Date) {
        return orderDirection === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }

      // Sortowanie tekstowe
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
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredProducts.map((product) => {
                const trend = getPriceTrend(product);

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
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Paper>
  );
};

export default SupplierProductCatalog;
