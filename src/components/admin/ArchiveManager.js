import React, { useState, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Tooltip,
  Chip,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Button,
  TablePagination
} from '@mui/material';
import {
  Unarchive as UnarchiveIcon,
  Refresh as RefreshIcon,
  PlayArrow as PlayArrowIcon
} from '@mui/icons-material';
import { useTranslation } from 'react-i18next';
import { collection, query, where, getDocs, orderBy, limit as firestoreLimit } from 'firebase/firestore';
import { db } from '../../services/firebase/config';
import { unarchiveOrder } from '../../services/orderService';
import { unarchivePurchaseOrder } from '../../services/purchaseOrderService';
import { unarchiveProductionTask } from '../../services/productionService';
import { unarchiveBatch, unarchiveInventoryItem } from '../../services/inventory';
import { useNotification } from '../../hooks/useNotification';
import { runAutoArchive } from '../../services/cloudFunctionsService';

const ENTITY_TYPES = {
  ORDER: 'order',
  PURCHASE_ORDER: 'purchaseOrder',
  PRODUCTION_TASK: 'productionTask',
  BATCH: 'batch',
  INVENTORY_ITEM: 'inventoryItem'
};

const TYPE_COLORS = {
  [ENTITY_TYPES.ORDER]: 'primary',
  [ENTITY_TYPES.PURCHASE_ORDER]: 'secondary',
  [ENTITY_TYPES.PRODUCTION_TASK]: 'warning',
  [ENTITY_TYPES.BATCH]: 'info',
  [ENTITY_TYPES.INVENTORY_ITEM]: 'success'
};

const ArchiveManager = () => {
  const { t } = useTranslation();
  const { showSuccess, showError } = useNotification();

  const [archivedItems, setArchivedItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unarchiving, setUnarchiving] = useState(null);
  const [filterType, setFilterType] = useState('all');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [archiveLogs, setArchiveLogs] = useState([]);
  const [runningAutoArchive, setRunningAutoArchive] = useState(false);

  const getTypeLabelKey = (type) => {
    const map = {
      [ENTITY_TYPES.ORDER]: 'common.typeOrder',
      [ENTITY_TYPES.PURCHASE_ORDER]: 'common.typePurchaseOrder',
      [ENTITY_TYPES.PRODUCTION_TASK]: 'common.typeProductionTask',
      [ENTITY_TYPES.BATCH]: 'common.typeBatch',
      [ENTITY_TYPES.INVENTORY_ITEM]: 'common.typeInventoryItem'
    };
    return map[type] || type;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '—';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSourceLabel = (archivedBy) => {
    if (archivedBy === 'manual') return t('common.archivedByManual');
    if (archivedBy === 'autoArchive') return t('common.archivedByAuto');
    return t('common.archivedByUnknown');
  };

  const fetchArchiveLogs = useCallback(async () => {
    try {
      const q = query(
        collection(db, '_archiveLogs'),
        orderBy('timestamp', 'desc'),
        firestoreLimit(10)
      );
      const snapshot = await getDocs(q);
      setArchiveLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      console.error('Błąd podczas pobierania logów archiwizacji:', error);
    }
  }, []);

  const fetchArchivedItems = useCallback(async () => {
    setLoading(true);
    try {
      const results = [];

      const collections = [
        { name: 'orders', type: ENTITY_TYPES.ORDER },
        { name: 'purchaseOrders', type: ENTITY_TYPES.PURCHASE_ORDER },
        { name: 'tasks', type: ENTITY_TYPES.PRODUCTION_TASK },
        { name: 'inventoryBatches', type: ENTITY_TYPES.BATCH },
        { name: 'inventoryItems', type: ENTITY_TYPES.INVENTORY_ITEM }
      ];

      const fetches = collections.map(async ({ name, type }) => {
        const q = query(collection(db, name), where('archived', '==', true));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({
          id: doc.id,
          type,
          data: doc.data()
        }));
      });

      const allResults = await Promise.all(fetches);
      allResults.forEach(items => results.push(...items));

      const mapped = results.map(item => {
        const { id, type, data } = item;
        let number = '';
        let displayName = '';
        let status = '';

        switch (type) {
          case ENTITY_TYPES.ORDER:
            number = data.orderNumber || id;
            displayName = data.customer?.name || '—';
            status = data.status || '';
            break;
          case ENTITY_TYPES.PURCHASE_ORDER:
            number = data.number || id;
            displayName = data.supplier?.name || data.supplierName || '—';
            status = data.status || '';
            break;
          case ENTITY_TYPES.PRODUCTION_TASK:
            number = data.moNumber || id;
            displayName = data.productName || '—';
            status = data.status || '';
            break;
          case ENTITY_TYPES.BATCH:
            number = data.batchNumber || data.lotNumber || id;
            displayName = data.itemName || data.materialName || '—';
            status = `${data.quantity ?? 0} ${data.unit || 'szt.'}`;
            break;
          case ENTITY_TYPES.INVENTORY_ITEM:
            number = data.sku || id;
            displayName = data.name || '—';
            status = data.category || '';
            break;
          default:
            break;
        }

        return {
          id,
          type,
          number,
          displayName,
          status,
          archivedAt: data.archivedAt,
          archivedBy: data.archivedBy || null
        };
      });

      mapped.sort((a, b) => {
        const dateA = a.archivedAt?.toDate ? a.archivedAt.toDate() : new Date(0);
        const dateB = b.archivedAt?.toDate ? b.archivedAt.toDate() : new Date(0);
        return dateB - dateA;
      });

      setArchivedItems(mapped);
    } catch (error) {
      console.error('Błąd podczas pobierania zarchiwizowanych elementów:', error);
      showError('Błąd podczas pobierania zarchiwizowanych elementów');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    fetchArchivedItems();
    fetchArchiveLogs();
  }, [fetchArchivedItems, fetchArchiveLogs]);

  const handleUnarchive = async (item) => {
    if (!window.confirm(t('common.confirmUnarchive'))) return;

    setUnarchiving(item.id);
    try {
      let result;
      switch (item.type) {
        case ENTITY_TYPES.ORDER:
          result = await unarchiveOrder(item.id);
          break;
        case ENTITY_TYPES.PURCHASE_ORDER:
          result = await unarchivePurchaseOrder(item.id);
          break;
        case ENTITY_TYPES.PRODUCTION_TASK:
          result = await unarchiveProductionTask(item.id);
          break;
        case ENTITY_TYPES.BATCH:
          result = await unarchiveBatch(item.id);
          break;
        case ENTITY_TYPES.INVENTORY_ITEM:
          result = await unarchiveInventoryItem(item.id);
          break;
        default:
          throw new Error(`Nieznany typ: ${item.type}`);
      }

      if (result?.success) {
        showSuccess(t('common.unarchiveSuccess'));
        setArchivedItems(prev => prev.filter(i => i.id !== item.id));
      }
    } catch (error) {
      console.error('Błąd podczas przywracania:', error);
      showError(error.message || 'Błąd podczas przywracania elementu');
    } finally {
      setUnarchiving(null);
    }
  };

  const handleRunAutoArchive = async () => {
    if (!window.confirm('Czy na pewno chcesz uruchomić automatyczną archiwizację? Zarchiwizowane zostaną dokumenty spełniające kryteria (bez aktualizacji od roku).')) return;

    setRunningAutoArchive(true);
    try {
      const result = await runAutoArchive();
      if (result?.success) {
        showSuccess(`Archiwizacja zakończona. Zarchiwizowano ${result.totalArchived} elementów.`);
        fetchArchivedItems();
        fetchArchiveLogs();
      }
    } catch (error) {
      console.error('Błąd podczas uruchamiania archiwizacji:', error);
      showError(error.message || 'Błąd podczas uruchamiania automatycznej archiwizacji');
    } finally {
      setRunningAutoArchive(false);
    }
  };

  const filteredItems = filterType === 'all'
    ? archivedItems
    : archivedItems.filter(item => item.type === filterType);

  const paginatedItems = filteredItems.slice(
    page * rowsPerPage,
    page * rowsPerPage + rowsPerPage
  );

  return (
    <Box>
      <Typography variant="h5" gutterBottom sx={{ mb: 1 }}>
        {t('common.archiveManager')}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        {t('common.archiveManagerDescription')}
      </Typography>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel>{t('common.allTypes')}</InputLabel>
          <Select
            value={filterType}
            label={t('common.allTypes')}
            onChange={(e) => { setFilterType(e.target.value); setPage(0); }}
          >
            <MenuItem value="all">{t('common.allTypes')}</MenuItem>
            <MenuItem value={ENTITY_TYPES.ORDER}>{t('common.typeOrder')}</MenuItem>
            <MenuItem value={ENTITY_TYPES.PURCHASE_ORDER}>{t('common.typePurchaseOrder')}</MenuItem>
            <MenuItem value={ENTITY_TYPES.PRODUCTION_TASK}>{t('common.typeProductionTask')}</MenuItem>
            <MenuItem value={ENTITY_TYPES.BATCH}>{t('common.typeBatch')}</MenuItem>
            <MenuItem value={ENTITY_TYPES.INVENTORY_ITEM}>{t('common.typeInventoryItem')}</MenuItem>
          </Select>
        </FormControl>

        <Button
          startIcon={loading ? <CircularProgress size={18} /> : <RefreshIcon />}
          variant="outlined"
          size="small"
          onClick={fetchArchivedItems}
          disabled={loading}
        >
          {t('common.refreshArchived')}
        </Button>

        <Button
          startIcon={runningAutoArchive ? <CircularProgress size={18} /> : <PlayArrowIcon />}
          variant="contained"
          size="small"
          color="warning"
          onClick={handleRunAutoArchive}
          disabled={runningAutoArchive}
        >
          {runningAutoArchive ? 'Archiwizacja...' : 'Uruchom auto-archiwizację'}
        </Button>

        <Chip
          label={`${filteredItems.length} / ${archivedItems.length}`}
          variant="outlined"
          size="small"
        />
      </Box>

      {loading && archivedItems.length === 0 ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress />
          <Typography sx={{ ml: 2 }}>{t('common.loadingArchived')}</Typography>
        </Box>
      ) : filteredItems.length === 0 ? (
        <Alert severity="info">{t('common.noArchivedItems')}</Alert>
      ) : (
        <Paper variant="outlined">
          <TableContainer sx={{ maxHeight: 600 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Typ</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Numer</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Nazwa / Klient</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{t('common.archiveDate')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }}>{t('common.archiveSource')}</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Akcja</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginatedItems.map((item) => (
                  <TableRow key={`${item.type}-${item.id}`} hover>
                    <TableCell>
                      <Chip
                        label={t(getTypeLabelKey(item.type))}
                        color={TYPE_COLORS[item.type]}
                        size="small"
                        variant="outlined"
                      />
                    </TableCell>
                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 500 }}>
                      {item.number}
                    </TableCell>
                    <TableCell>{item.displayName}</TableCell>
                    <TableCell>{item.status}</TableCell>
                    <TableCell>{formatDate(item.archivedAt)}</TableCell>
                    <TableCell>
                      <Chip
                        label={getSourceLabel(item.archivedBy)}
                        size="small"
                        color={item.archivedBy === 'autoArchive' ? 'default' : 'primary'}
                        variant="filled"
                        sx={{ fontSize: '0.75rem' }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title={t('common.unarchive')}>
                        <span>
                          <IconButton
                            size="small"
                            color="primary"
                            onClick={() => handleUnarchive(item)}
                            disabled={unarchiving === item.id}
                          >
                            {unarchiving === item.id
                              ? <CircularProgress size={18} />
                              : <UnarchiveIcon fontSize="small" />
                            }
                          </IconButton>
                        </span>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={filteredItems.length}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[10, 25, 50, 100]}
            labelRowsPerPage="Wierszy na stronę:"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} z ${count}`}
          />
        </Paper>
      )}

      {archiveLogs.length > 0 && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom>
            Historia automatycznej archiwizacji
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 'bold' }}>Data</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">CO</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">PO</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">MO</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Partie</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Pozycje mag.</TableCell>
                  <TableCell sx={{ fontWeight: 'bold' }} align="center">Razem</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {archiveLogs.map((log) => (
                  <TableRow key={log.id} hover>
                    <TableCell>{formatDate(log.timestamp)}</TableCell>
                    <TableCell align="center">{log.summary?.orders || 0}</TableCell>
                    <TableCell align="center">{log.summary?.purchaseOrders || 0}</TableCell>
                    <TableCell align="center">{log.summary?.tasks || 0}</TableCell>
                    <TableCell align="center">{log.summary?.batches || 0}</TableCell>
                    <TableCell align="center">{log.summary?.inventoryItems || 0}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={log.totalArchived || 0}
                        size="small"
                        color={log.totalArchived > 0 ? 'primary' : 'default'}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Box>
  );
};

export default ArchiveManager;
